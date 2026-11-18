import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getFirebaseAdmin, getDistributionS3, authenticatePartner, parseErn, assetSpec, sha256, respond, readJsonBody, nowIso, historyEvent, MAX_MASTER_BYTES, MAX_ARTWORK_BYTES } from '../_distribution.js'

const MAX_ASSETS = 1000
const MAX_TOTAL_ASSET_BYTES = 50_000_000_000

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' })
  const partnerId = String(req.headers['x-distributor-id'] || '')
  if (!authenticatePartner(req, partnerId)) return respond(res, 401, { error: 'Partner credentials are invalid or this partner is not configured.' })

  let s3
  let archivedKey = null
  let recordRef = null
  let recordPersisted = false
  const reservedClaimRefs = []
  try {
    const body = readJsonBody(req)
    const ernXml = body.ernXml
    const parsed = parseErn(ernXml)
    const assetInputs = Array.isArray(body.assets) ? body.assets : []
    if (!assetInputs.length || assetInputs.length > MAX_ASSETS) return respond(res, 400, { error: `Provide between 1 and ${MAX_ASSETS} asset manifests.` })
    const assets = assetInputs.map((input, index) => ({
      id: `asset-${String(index + 1).padStart(4, '0')}`,
      ...assetSpec(input, index),
      state: 'awaiting_upload',
      uploadId: null,
      s3Key: null,
      completedAt: null,
    }))
    if (assets.reduce((sum, asset) => sum + asset.size, 0) > MAX_TOTAL_ASSET_BYTES) return respond(res, 413, { error: `Combined asset size cannot exceed ${MAX_TOTAL_ASSET_BYTES} bytes.` })
    if (!assets.some((asset) => asset.role === 'audio')) return respond(res, 422, { error: 'At least one audio master is required.' })
    if (!assets.some((asset) => asset.role === 'artwork')) return respond(res, 422, { error: 'At least one cover artwork asset is required.' })
    const audioAssets = assets.filter((asset) => asset.role === 'audio')
    const audioRefs = audioAssets.map((asset) => asset.resourceReference)
    const refCounts = audioRefs.reduce((counts, id) => { if (id) counts[id] = (counts[id] || 0) + 1; return counts }, {})
    const unknownRefs = audioAssets.flatMap((asset) => {
      if (!asset.resourceReference) return [`${asset.id}:missing-resource-reference`]
      if (!parsed.resourceReferences.includes(asset.resourceReference)) return [asset.resourceReference]
      if (refCounts[asset.resourceReference] > 1) return [`${asset.resourceReference}:mapped-to-multiple-audio-assets`]
      return []
    })
    const deliveryId = sha256(`${partnerId}:${parsed.messageId}`).slice(0, 36)
    const xmlHash = sha256(ernXml)
    const createdAt = nowIso()
    const { db } = getFirebaseAdmin()
    recordRef = db.ref(`distributionIntakes/${deliveryId}`)
    const existing = await recordRef.get()
    if (existing.exists()) {
      const record = existing.val()
      if (record.partnerId !== partnerId || record.ernXmlSha256 !== xmlHash) return respond(res, 409, { error: 'MessageId was already received with different content.' })
      return respond(res, 200, { acknowledgement: { type: 'receipt', status: record.status, messageId: parsed.messageId, deliveryId }, idempotentReplay: true })
    }

    s3 = getDistributionS3()
    const xmlKey = `distribution/inbound/${partnerId}/${deliveryId}/source-${xmlHash}.ern.xml`
    archivedKey = xmlKey
    await s3.client.send(new PutObjectCommand({
      Bucket: s3.bucket,
      Key: xmlKey,
      Body: ernXml,
      ContentType: 'application/vnd.ddex.ern+xml',
      Metadata: { partner: partnerId, delivery: deliveryId, sha256: xmlHash },
    }))

    const baseRecord = {
      id: deliveryId,
      partnerId,
      partnerName: partnerId === 'montyxlabel' ? 'MONTYXLABEL.cyou' : 'smusicdistrition.com',
      messageId: parsed.messageId,
      ernNamespace: parsed.namespace,
      exactSchemaVersion: parsed.exactSchemaVersion,
      ernXmlSha256: xmlHash,
      sourceXmlKey: xmlKey,
      metadata: parsed,
      assets,
      schemaValidation: parsed.schemaValidation,
      identityConflicts: [],
      unresolvedResourceReferences: [],
      status: 'processing',
      releaseState: 'not_published',
      receivedAt: createdAt,
      updatedAt: createdAt,
      history: [historyEvent(`partner:${partnerId}`, 'receipt', 'ERN message and asset manifest received; no publication or downstream delivery implied.')],
    }
    const created = await recordRef.transaction((current) => current ? undefined : baseRecord)
    if (!created.committed) {
      const saved = created.snapshot.val()
      if (saved?.partnerId === partnerId && saved?.ernXmlSha256 === xmlHash) {
        // Identical concurrent retries share this deterministic archive key;
        // retain the object referenced by the transaction winner.
        archivedKey = null
        return respond(res, 200, { acknowledgement: { type: 'receipt', status: saved.status, messageId: parsed.messageId, deliveryId }, idempotentReplay: true })
      }
      await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: xmlKey })).catch(() => {})
      archivedKey = null
      return respond(res, 409, { error: 'MessageId was received concurrently with different content.' })
    }
    recordPersisted = true

    const identityConflicts = []
    const claims = [...parsed.upcs.map((value) => ({ type: 'upc', value })), ...parsed.isrcs.map((value) => ({ type: 'isrc', value }))]
    for (const claim of claims) {
      const claimRef = db.ref(`distributionIdentifierRegistry/${claim.type}/${claim.value}`)
      const result = await claimRef.transaction((current) => {
        const next = current && typeof current === 'object' ? current : {}
        next[deliveryId] = { partnerId, state: 'pending', createdAt }
        return next
      })
      if (!result.committed) throw new Error(`Unable to reserve ${claim.type} identifier.`)
      reservedClaimRefs.push(claimRef.child(deliveryId))
      const owners = Object.keys(result.snapshot.val() || {}).filter((id) => id !== deliveryId)
      if (owners.length) identityConflicts.push({ ...claim, candidateDeliveryIds: owners.slice(0, 20) })
    }

    const status = identityConflicts.length ? 'identity_conflict' : 'received_pending_validation'
    const completedAt = nowIso()
    await recordRef.update({
      identityConflicts,
      unresolvedResourceReferences: unknownRefs,
      status,
      updatedAt: completedAt,
      history: [...baseRecord.history, historyEvent('intake-worker', 'intake_recorded', 'Identifier conflicts checked; licensed schema validation and asset upload remain pending.')],
    })
    return respond(res, 202, {
      acknowledgement: { type: 'receipt', status, messageId: parsed.messageId, deliveryId, receivedAt: createdAt },
      next: 'Upload each listed asset through the authenticated multipart asset endpoint. This is a receipt only; schema validation, approval, and catalogue publication remain pending.',
      limits: { audioMasterBytes: MAX_MASTER_BYTES, artworkBytes: MAX_ARTWORK_BYTES, totalAssetBytes: MAX_TOTAL_ASSET_BYTES },
      assets: assets.map(({ id, role, size, contentType, resourceReference, state }) => ({ id, role, size, contentType, resourceReference, state })),
      ...(identityConflicts.length ? { conflicts: identityConflicts } : {}),
    })
  } catch (error) {
    await Promise.all(reservedClaimRefs.map((ref) => ref.remove().catch(() => {})))
    if (!recordPersisted && archivedKey && s3) await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: archivedKey })).catch(() => {})
    if (recordPersisted && recordRef) {
      const snapshot = await recordRef.get().catch(() => null)
      const previous = snapshot?.val()
      if (previous) await recordRef.update({ status: 'processing_failed', failure: { message: 'Intake processing did not complete; operator review is required.', at: nowIso() }, updatedAt: nowIso(), history: [...(previous.history || []), historyEvent('intake-worker', 'processing_failed', 'Partial intake failure; identifier claims were released.')] }).catch(() => {})
    }
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution ERN intake failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Distribution intake is temporarily unavailable.' })
  }
}
