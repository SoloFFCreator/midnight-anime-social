import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, HeadObjectCommand, ListPartsCommand, UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { authenticatePartner, getDistributionS3, getFirebaseAdmin, respond, readJsonBody, cleanId, historyEvent, nowIso } from '../_distribution.js'

const PART_SIZE = 16 * 1024 * 1024
const URL_TTL_SECONDS = 900

async function readPrefix(body, maxBytes = 65_536) {
  const chunks = []
  let size = 0
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk)
    const remaining = maxBytes - size
    if (remaining <= 0) break
    chunks.push(buffer.subarray(0, remaining))
    size += Math.min(buffer.length, remaining)
    if (size >= maxBytes) break
  }
  return Buffer.concat(chunks)
}

function detectFormat(asset, bytes) {
  if (asset.role === 'artwork') {
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    return null
  }
  if (asset.contentType === 'audio/mpeg' && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return 'audio/mpeg'
  if (asset.contentType === 'audio/flac' && bytes.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac'
  if ((asset.contentType === 'audio/wav' || asset.contentType === 'audio/x-wav') && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return asset.contentType
  if (asset.contentType === 'audio/ogg' && bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
  if (asset.contentType === 'audio/mp4' && bytes.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4'
  if (asset.contentType === 'audio/aac' && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac'
  if (asset.contentType === 'application/octet-stream') {
    if (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
    if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac'
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav'
    if (bytes.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
    if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4'
    if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac'
  }
  return null
}

async function findAsset(req, res, db, partnerId) {
  const deliveryId = cleanId(req.body.deliveryId, 'delivery id')
  const assetId = cleanId(req.body.assetId, 'asset id')
  const recordRef = db.ref(`distributionIntakes/${deliveryId}`)
  const snapshot = await recordRef.get()
  if (!snapshot.exists() || snapshot.val().partnerId !== partnerId) {
    respond(res, 404, { error: 'Delivery not found for this partner.' })
    return null
  }
  const record = snapshot.val()
  const index = record.assets?.findIndex((asset) => asset.id === assetId) ?? -1
  if (index < 0) {
    respond(res, 404, { error: 'Asset is not part of this delivery.' })
    return null
  }
  return { deliveryId, assetId, record, recordRef, index, asset: record.assets[index] }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' })
  const partnerId = String(req.headers['x-distributor-id'] || '')
  if (!authenticatePartner(req, partnerId)) return respond(res, 401, { error: 'Partner credentials are invalid or this partner is not configured.' })

  try {
    req.body = readJsonBody(req, 128_000)
    const { operation } = req.body
    const { db } = getFirebaseAdmin()
    const found = await findAsset(req, res, db, partnerId)
    if (!found) return
    const { asset, record, recordRef, index, deliveryId, assetId } = found
    const { client, bucket } = getDistributionS3()
    const key = `distribution/inbound/${partnerId}/${deliveryId}/assets/${assetId}`

    if (operation === 'initiate') {
      if (asset.state === 'uploaded') return respond(res, 409, { error: 'Asset upload is already complete.' })
      if (asset.uploadId) return respond(res, 200, { uploadId: asset.uploadId, partSize: PART_SIZE, partCount: Math.ceil(asset.size / PART_SIZE), idempotentReplay: true })
      const created = await client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: asset.contentType,
        Metadata: { partner: partnerId, delivery: deliveryId, asset: assetId, role: asset.role, expectedsha256: asset.sha256 || 'not-provided' },
        ServerSideEncryption: 'AES256',
        ChecksumAlgorithm: 'SHA256',
      }))
      if (!created.UploadId) throw new Error('S3 did not return an upload ID.')
      const assets = [...record.assets]
      assets[index] = { ...asset, uploadId: created.UploadId, s3Key: key, state: 'uploading' }
      const updatedAt = nowIso()
      await recordRef.update({ assets, updatedAt, history: [...(record.history || []), historyEvent(`partner:${partnerId}`, 'asset_upload_started', assetId)] })
      return respond(res, 201, { uploadId: created.UploadId, partSize: PART_SIZE, partCount: Math.ceil(asset.size / PART_SIZE), urlTtlSeconds: URL_TTL_SECONDS, checksum: 'For each part, SHA-256 the exact part bytes and send the base64 digest when requesting a signed URL.' })
    }

    if (!asset.uploadId || asset.state !== 'uploading' || asset.s3Key !== key) return respond(res, 409, { error: 'Start this asset upload before requesting part URLs or completion.' })
    if (req.body.uploadId !== asset.uploadId) return respond(res, 403, { error: 'Upload ID does not match this delivery asset.' })

    if (operation === 'sign-part') {
      const partNumber = Number(req.body.partNumber)
      const partCount = Math.ceil(asset.size / PART_SIZE)
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount || partNumber > 10_000) return respond(res, 400, { error: 'Part number is outside the expected range.' })
      const checksum = String(req.body.checksumSha256 || '')
      if (!/^[A-Za-z0-9+/]{43}=$/.test(checksum) || Buffer.from(checksum, 'base64').length !== 32) return respond(res, 400, { error: 'A base64 SHA-256 checksum for the exact part bytes is required.' })
      const command = new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: asset.uploadId, PartNumber: partNumber, ChecksumSHA256: checksum })
      const url = await getSignedUrl(client, command, { expiresIn: URL_TTL_SECONDS })
      return respond(res, 200, { url, method: 'PUT', requiredHeaders: { 'x-amz-checksum-sha256': checksum }, expiresIn: URL_TTL_SECONDS })
    }

    if (operation === 'complete') {
      const partCount = Math.ceil(asset.size / PART_SIZE)
      const listed = await client.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: asset.uploadId }))
      const parts = (listed.Parts || []).sort((a, b) => a.PartNumber - b.PartNumber)
      if (parts.length !== partCount || parts.some((part, i) => part.PartNumber !== i + 1 || !part.ETag || !part.ChecksumSHA256)) {
        return respond(res, 422, { error: 'S3 is missing one or more sequential SHA-256-verified parts.' })
      }
      await client.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: asset.uploadId,
        MultipartUpload: { Parts: parts.map(({ PartNumber, ETag, ChecksumSHA256 }) => ({ PartNumber, ETag, ChecksumSHA256 })) },
      }))
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      if (Number(head.ContentLength) !== asset.size || head.ContentType !== asset.contentType) {
        return respond(res, 422, { error: 'Uploaded object size or content type does not match the declared manifest.' })
      }
      const range = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: 'bytes=0-65535' }))
      const prefix = await readPrefix(range.Body)
      const detected = detectFormat(asset, prefix)
      if (!detected) return respond(res, 422, { error: 'Uploaded asset does not match an allowed audio/artwork file signature.' })
      const assets = [...record.assets]
      assets[index] = { ...asset, state: 'uploaded', detectedContentType: detected, s3Key: key, completedAt: nowIso() }
      const updatedAt = nowIso()
      await recordRef.update({ assets, updatedAt, history: [...(record.history || []), historyEvent(`partner:${partnerId}`, 'asset_upload_completed', `${assetId}; bytes=${asset.size}; content=${detected}`)] })
      return respond(res, 200, { assetId, state: 'uploaded', bytes: asset.size, detectedContentType: detected, contentChecks: ['S3 verified each part SHA-256', 'object size/type matched manifest', 'file signature matched declared media family'], next: 'Artwork dimensions, audio technical quality, malware scanning, and licensed ERN XSD validation still require configured validation/review.' })
    }

    if (operation === 'abort') {
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: asset.uploadId }))
      const assets = [...record.assets]
      assets[index] = { ...asset, uploadId: null, s3Key: null, state: 'awaiting_upload' }
      await recordRef.update({ assets, updatedAt: nowIso(), history: [...(record.history || []), historyEvent(`partner:${partnerId}`, 'asset_upload_aborted', assetId)] })
      return respond(res, 200, { assetId, state: 'awaiting_upload' })
    }
    return respond(res, 400, { error: 'Operation must be initiate, sign-part, complete, or abort.' })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution asset operation failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Distribution asset operation is temporarily unavailable.' })
  }
}
