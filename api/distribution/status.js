import { authenticatePartner, getFirebaseAdmin, respond, cleanId } from '../_distribution.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed.' })
  const partnerId = String(req.headers['x-distributor-id'] || '')
  if (!authenticatePartner(req, partnerId)) return respond(res, 401, { error: 'Partner credentials are invalid or this partner is not configured.' })
  try {
    const deliveryId = cleanId(req.query?.deliveryId, 'delivery id')
    const { db } = getFirebaseAdmin()
    const snapshot = await db.ref(`distributionIntakes/${deliveryId}`).get()
    if (!snapshot.exists() || snapshot.val().partnerId !== partnerId) return respond(res, 404, { error: 'Delivery not found for this partner.' })
    const record = snapshot.val()
    return respond(res, 200, {
      deliveryId,
      messageId: record.messageId,
      status: record.status,
      releaseState: record.releaseState,
      receivedAt: record.receivedAt,
      updatedAt: record.updatedAt,
      schemaValidation: record.schemaValidation?.state || 'pending',
      assets: (record.assets || []).map(({ id, role, state, completedAt }) => ({ id, role, state, completedAt })),
      history: (record.history || []).map(({ action, note, at }) => ({ action, note, at })),
    })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Partner status lookup failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Delivery status is temporarily unavailable.' })
  }
}
