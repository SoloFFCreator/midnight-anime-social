import { authenticateValidator, getFirebaseAdmin, respond, readJsonBody, cleanId, historyEvent, nowIso } from '../_distribution.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed.' })
  if (!authenticateValidator(req)) return respond(res, 401, { error: 'Trusted validator credentials are required.' })
  if (process.env.DDEX_IMPLEMENTATION_LICENSE_CONFIRMED !== 'true') return respond(res, 503, { error: 'DDEX implementation licence is not confirmed; licensed schema validation is not enabled.' })
  const configuredVersion = process.env.DDEX_ERN_SCHEMA_VERSION || ''
  if (!/^4\.3\.\d+$/.test(configuredVersion)) return respond(res, 503, { error: 'Configure a licensed DDEX ERN 4.3.x schema version before accepting validation callbacks.' })

  try {
    const body = readJsonBody(req, 64_000)
    const deliveryId = cleanId(body.deliveryId, 'delivery id')
    const state = body.state
    if (!['passed', 'failed'].includes(state)) return respond(res, 400, { error: 'Validation state must be passed or failed.' })
    if (body.version !== configuredVersion) return respond(res, 422, { error: 'Validator result version does not match the configured licensed ERN schema version.' })
    const errors = Array.isArray(body.errors) ? body.errors.slice(0, 100).map((item) => String(item).slice(0, 1000)) : []
    if (state === 'passed' && errors.length) return respond(res, 422, { error: 'A passing schema result cannot contain validation errors.' })
    if (state === 'failed' && !errors.length) return respond(res, 422, { error: 'A failed schema result must include at least one error.' })
    const { db } = getFirebaseAdmin()
    const recordRef = db.ref(`distributionIntakes/${deliveryId}`)
    const snapshot = await recordRef.get()
    if (!snapshot.exists()) return respond(res, 404, { error: 'Delivery not found.' })
    const record = snapshot.val()
    if (!['received_pending_validation', 'identity_conflict'].includes(record.status)) return respond(res, 409, { error: 'This delivery is not in a state that accepts schema-validation results.' })
    const schemaValidation = { state, exactSchemaVersion: configuredVersion, validator: String(body.validator || 'configured-validator').slice(0, 120), checkedAt: nowIso(), errors }
    const nextStatus = state === 'failed' ? 'validation_failed' : (record.identityConflicts?.length ? 'identity_conflict' : 'awaiting_review')
    await recordRef.update({ schemaValidation, status: nextStatus, updatedAt: nowIso(), history: [...(record.history || []), historyEvent('schema-validator', `schema_validation_${state}`, `ERN ${configuredVersion}; ${errors.length} issue(s)`)] })
    return respond(res, 200, { deliveryId, schemaValidation, status: nextStatus })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution validator callback failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Validator result could not be stored.' })
  }
}
