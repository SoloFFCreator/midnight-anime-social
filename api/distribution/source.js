import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { authenticateAdmin, getFirebaseAdmin, getDistributionS3, respond, cleanId } from '../_distribution.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed.' })
  if (!await authenticateAdmin(req)) return respond(res, 403, { error: 'Administrator access is not configured for this account.' })
  try {
    const deliveryId = cleanId(req.query?.deliveryId, 'delivery id')
    const { db } = getFirebaseAdmin()
    const snapshot = await db.ref(`distributionIntakes/${deliveryId}`).get()
    if (!snapshot.exists()) return respond(res, 404, { error: 'Delivery not found.' })
    const record = snapshot.val()
    if (!record.sourceXmlKey?.startsWith(`distribution/inbound/${record.partnerId}/${deliveryId}/`)) return respond(res, 404, { error: 'Archived source XML is not available.' })
    const { client, bucket } = getDistributionS3()
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: record.sourceXmlKey, ResponseContentType: 'application/xml', ResponseContentDisposition: 'attachment; filename="source.ern.xml"' }), { expiresIn: 60 })
    return respond(res, 200, { url, expiresIn: 60, sha256: record.ernXmlSha256 })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('DDEX source XML access failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Source XML is temporarily unavailable.' })
  }
}
