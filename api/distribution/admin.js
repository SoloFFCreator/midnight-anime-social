import { authenticateAdmin, getPartnerConfig, ALLOWED_PARTNERS, getFirebaseAdmin, respond, readJsonBody, cleanId, historyEvent, nowIso } from '../_distribution.js'

function publicRecord(record) {
  const value = { ...record }
  delete value.sourceXmlKey
  delete value.ernXmlSha256
  value.assets = (value.assets || []).map(({ id, role, contentType, size, resourceReference, originalFilename, state, detectedContentType, completedAt, replacementState }) => ({ id, role, contentType, size, resourceReference, originalFilename, state, detectedContentType, completedAt, replacementState }))
  return value
}

function partnerSummaries() {
  return Object.entries(ALLOWED_PARTNERS).map(([id, name]) => {
    const config = getPartnerConfig(id)
    return { id, name, credentialConfigured: Boolean(config), enabled: Boolean(config), integrationVerified: config?.integrationVerified === true, state: !config ? 'pending credentials' : config.integrationVerified === true ? 'verified by operator' : 'credentials configured; not verified' }
  })
}

function approvalBlockers(record) {
  const blockers = []
  if (record.schemaValidation?.state !== 'passed') blockers.push('Licensed ERN XSD validation has not passed.')
  if (!Array.isArray(record.assets) || !record.assets.some((asset) => asset.role === 'audio' && asset.state === 'uploaded')) blockers.push('At least one audio master must be fully uploaded.')
  const audioAssets = (record.assets || []).filter((asset) => asset.role === 'audio')
  const resourceReferences = record.metadata?.resourceReferences || []
  const mappedReferences = audioAssets.map((asset) => asset.resourceReference).filter(Boolean)
  if (!audioAssets.length || audioAssets.some((asset) => !asset.resourceReference || !resourceReferences.includes(asset.resourceReference)) || new Set(mappedReferences).size !== mappedReferences.length) blockers.push('Every audio master must map one-to-one to a resource reference present in the ERN message.')
  if (!record.assets?.some((asset) => asset.role === 'artwork' && asset.state === 'uploaded')) blockers.push('Cover artwork must be fully uploaded.')
  if (record.assets?.some((asset) => asset.state !== 'uploaded')) blockers.push('Every declared asset must be uploaded and signature-checked.')
  if (record.unresolvedResourceReferences?.length) blockers.push('Audio resource references do not match the ERN resource list.')
  if (record.identityConflicts?.length && !record.identityResolution) blockers.push('Duplicate identifier/identity conflict is unresolved.')
  if (!record.metadata?.title || record.metadata.title === 'Untitled release') blockers.push('Release title is missing.')
  if (!record.metadata?.artistNames?.length) blockers.push('Artist identity requires human review.')
  if (!record.metadata?.upcs?.length) blockers.push('UPC/EAN is missing.')
  if (!record.metadata?.releaseDates?.length) blockers.push('Release date/deal window is missing.')
  if (!record.metadata?.territories?.length) blockers.push('Territory terms are missing.')
  if (!['single', 'ep', 'album'].includes(String(record.metadata?.releaseType || '').toLowerCase())) blockers.push('Release type must be reviewed and set to single, EP, or album.')
  return blockers
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' })
  const admin = await authenticateAdmin(req)
  if (!admin) return respond(res, 403, { error: 'Administrator access is not configured for this account.' })
  try {
    const { db } = getFirebaseAdmin()
    if (req.method === 'GET') {
      const snapshot = await db.ref('distributionIntakes').orderByChild('updatedAt').limitToLast(250).get()
      const all = Object.values(snapshot.val() || {}).map(publicRecord)
      const status = String(req.query?.status || '')
      const search = String(req.query?.q || '').trim().toLowerCase()
      const records = all.reverse().filter((record) => (!status || record.status === status) && (!search || `${record.metadata?.title || ''} ${(record.metadata?.artistNames || []).join(' ')} ${(record.metadata?.upcs || []).join(' ')}`.toLowerCase().includes(search)))
      return respond(res, 200, { partners: partnerSummaries(), records, limit: 250, notice: 'Records are intake/review state only. An enabled API key is not evidence of a real partner connection.' })
    }

    const body = readJsonBody(req, 64_000)
    const deliveryId = cleanId(body.deliveryId, 'delivery id')
    const action = String(body.action || '')
    const note = String(body.note || '').trim().slice(0, 1000)
    const recordRef = db.ref(`distributionIntakes/${deliveryId}`)
    const snapshot = await recordRef.get()
    if (!snapshot.exists()) return respond(res, 404, { error: 'Delivery not found.' })
    const record = snapshot.val()
    const now = nowIso()
    const event = (name, message = note) => historyEvent(`admin:${admin.uid}`, name, message)
    let patch

    if (action === 'approve') {
      if (body.confirmMetadata !== true || body.confirmRights !== true) return respond(res, 400, { error: 'Explicit metadata and rights/deal review confirmation is required.' })
      const blockers = approvalBlockers(record)
      if (blockers.length) return respond(res, 422, { error: 'Release cannot be approved yet.', blockers })
      const releaseDate = String(body.confirmedReleaseDate || '')
      if (!record.metadata.releaseDates.includes(releaseDate) || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return respond(res, 422, { error: 'Select a valid release date present in the DDEX message.' })
      const territoryGrant = Array.isArray(body.confirmedTerritories) ? [...new Set(body.confirmedTerritories.map((code) => String(code).toUpperCase()))] : []
      if (!territoryGrant.length || territoryGrant.some((code) => !record.metadata.territories.includes(code))) return respond(res, 422, { error: 'Select one or more territory codes present in the DDEX message.' })
      const releaseAt = new Date(`${releaseDate}T00:00:00Z`).getTime()
      if (!Number.isFinite(releaseAt)) return respond(res, 422, { error: 'Release date is invalid.' })
      const state = releaseAt > Date.now() ? 'scheduled' : 'approved'
      const review = { reviewerUid: admin.uid, reviewedAt: now, releaseDate, territories: territoryGrant }
      const next = { ...record, status: state, releaseState: state === 'scheduled' ? 'scheduled' : 'published', approvedAt: now, approvedBy: admin.uid, publishedAt: state === 'approved' ? now : null, rightsReview: review, territoryCodes: territoryGrant, releaseAt, updatedAt: now, history: [...(record.history || []), event('approved', state === 'scheduled' ? 'Metadata and rights reviewed; approved and scheduled. Catalogue visibility remains gated by date and territory.' : 'Metadata and rights reviewed; approved for catalogue visibility under the explicit territory grant.')] }
      patch = { [`distributionIntakes/${deliveryId}`]: next, [`distributionCatalog/${deliveryId}`]: { id: deliveryId, status: state, metadata: next.metadata, assets: next.assets, territories: territoryGrant, releaseAt, partnerId: next.partnerId, updatedAt: now } }
    } else if (action === 'reject') {
      if (!note) return respond(res, 400, { error: 'A reason is required to reject a delivery.' })
      const next = { ...record, status: 'rejected', releaseState: 'not_published', updatedAt: now, history: [...(record.history || []), event('rejected')] }
      patch = { [`distributionIntakes/${deliveryId}`]: next, [`distributionCatalog/${deliveryId}`]: null }
      for (const { type, value } of [...(record.metadata?.upcs || []).map((value) => ({ type: 'upc', value })), ...(record.metadata?.isrcs || []).map((value) => ({ type: 'isrc', value }))]) patch[`distributionIdentifierRegistry/${type}/${value}/${deliveryId}`] = null
    } else if (action === 'request_correction') {
      if (!note) return respond(res, 400, { error: 'Describe the metadata/asset correction required.' })
      const next = { ...record, status: 'correction_requested', updatedAt: now, correctionRequest: { note, requestedBy: admin.uid, requestedAt: now }, history: [...(record.history || []), event('correction_requested')] }
      patch = { [`distributionIntakes/${deliveryId}`]: next }
    } else if (action === 'resolve_identity_conflict') {
      const targetId = cleanId(body.canonicalDeliveryId, 'canonical delivery id')
      if (!record.identityConflicts?.length) return respond(res, 409, { error: 'This delivery has no unresolved identifier conflict.' })
      const allowedTargets = new Set(record.identityConflicts.flatMap((item) => item.candidateDeliveryIds || []))
      if (!allowedTargets.has(targetId)) return respond(res, 422, { error: 'Choose one of the duplicate candidate releases shown for this delivery.' })
      const target = await db.ref(`distributionIntakes/${targetId}`).get()
      if (!target.exists() || target.val().status === 'rejected') return respond(res, 422, { error: 'The proposed canonical release is unavailable.' })
      const resolution = { canonicalDeliveryId: targetId, resolvedBy: admin.uid, resolvedAt: now, note }
      const next = { ...record, identityResolution: resolution, status: 'merged', releaseState: 'not_published', updatedAt: now, history: [...(record.history || []), event('merged_into_canonical_release', `Canonical delivery: ${targetId}. ${note}`)] }
      patch = { [`distributionIntakes/${deliveryId}`]: next, [`distributionCatalog/${deliveryId}`]: null }
      for (const { type, value } of [...(record.metadata?.upcs || []).map((value) => ({ type: 'upc', value })), ...(record.metadata?.isrcs || []).map((value) => ({ type: 'isrc', value }))]) patch[`distributionIdentifierRegistry/${type}/${value}/${deliveryId}`] = null
    } else if (action === 'takedown') {
      if (!note) return respond(res, 400, { error: 'A takedown reason is required.' })
      const next = { ...record, status: 'taken_down', releaseState: 'taken_down', updatedAt: now, takedown: { reason: note, requestedBy: admin.uid, requestedAt: now }, history: [...(record.history || []), event('takedown')] }
      patch = { [`distributionIntakes/${deliveryId}`]: next, [`distributionCatalog/${deliveryId}`]: null }
    } else if (action === 'mark_failure') {
      if (!note) return respond(res, 400, { error: 'Describe the actual processing failure.' })
      const next = { ...record, status: 'processing_failed', failure: { message: note, recordedBy: admin.uid, at: now }, updatedAt: now, history: [...(record.history || []), event('processing_failure_recorded')] }
      patch = { [`distributionIntakes/${deliveryId}`]: next }
    } else {
      return respond(res, 400, { error: 'Action must be approve, reject, request_correction, resolve_identity_conflict, takedown, or mark_failure.' })
    }
    await db.ref().update(patch)
    return respond(res, 200, { deliveryId, action, status: patch[`distributionIntakes/${deliveryId}`]?.status || 'updated' })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution admin operation failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Distribution admin operation is temporarily unavailable.' })
  }
}
