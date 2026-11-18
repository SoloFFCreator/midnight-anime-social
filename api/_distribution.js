import crypto from 'node:crypto'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import { S3Client } from '@aws-sdk/client-s3'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'

export const MAX_XML_BYTES = 2_000_000
export const MAX_MASTER_BYTES = 10_000_000_000
export const MAX_ARTWORK_BYTES = 25_000_000
export const ALLOWED_PARTNERS = Object.freeze({
  montyxlabel: 'MONTYXLABEL.cyou',
  smusicdistrition: 'smusicdistrition.com',
})

let firebaseApp
let s3Client

export function respond(res, status, value) {
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(status).json(value)
}

export function readJsonBody(req, maxBytes = 2_500_000) {
  const body = req.body
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 })
    return JSON.parse(body)
  }
  if (!body || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > maxBytes) {
    throw Object.assign(new Error('A valid JSON request body is required.'), { statusCode: 400 })
  }
  return body
}

export function getFirebaseAdmin() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL
  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!databaseURL || !rawCredentials) throw new Error('Distribution server credentials are not configured.')
  if (!firebaseApp) {
    let serviceAccount
    try { serviceAccount = JSON.parse(rawCredentials) } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON.') }
    firebaseApp = getApps().find((app) => app.name === 'distribution-admin') || initializeApp({ credential: cert(serviceAccount), databaseURL }, 'distribution-admin')
  }
  return { app: firebaseApp, auth: getAuth(firebaseApp), db: getDatabase(firebaseApp) }
}

export function getDistributionS3() {
  if (!process.env.S3_BUCKET_NAME || !process.env.AWS_REGION || !process.env.AWS_ROLE_ARN) {
    throw new Error('Distribution private S3 is not configured.')
  }
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION, credentials: awsCredentialsProvider({ audience: 'https://sts.amazonaws.com', roleArn: process.env.AWS_ROLE_ARN }) })
  return { client: s3Client, bucket: process.env.S3_BUCKET_NAME }
}

function timingSafeStringEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest()
  const right = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(left, right)
}

export function getPartnerConfig(partnerId) {
  if (!Object.hasOwn(ALLOWED_PARTNERS, partnerId)) return null
  let config
  try { config = JSON.parse(process.env.MUSIC_DISTRIBUTION_PARTNERS_JSON || '{}') } catch { return null }
  const item = config?.[partnerId]
  if (!item || item.enabled !== true || typeof item.apiToken !== 'string' || item.apiToken.length < 32) return null
  return { ...item, name: ALLOWED_PARTNERS[partnerId] }
}

export function authenticatePartner(req, partnerId) {
  const config = getPartnerConfig(partnerId)
  if (!config) return null
  const supplied = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!supplied || supplied.length < 32 || supplied.length > 512 || !timingSafeStringEqual(supplied, config.apiToken)) return null
  return config
}

export function authenticateValidator(req) {
  const expected = process.env.DISTRIBUTION_VALIDATOR_TOKEN || ''
  const supplied = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || ''
  return expected.length >= 32 && supplied.length >= 32 && timingSafeStringEqual(supplied, expected)
}

export async function authenticateUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  try {
    const { auth } = getFirebaseAdmin()
    const decoded = await auth.verifyIdToken(token, true)
    return { uid: decoded.uid, email: decoded.email || null }
  } catch { return null }
}

export async function authenticateAdmin(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const allowed = new Set((process.env.DISTRIBUTION_ADMIN_UIDS || '').split(',').map((uid) => uid.trim()).filter(Boolean))
  if (!allowed.size) return null
  try {
    const { auth } = getFirebaseAdmin()
    const decoded = await auth.verifyIdToken(token, true)
    return allowed.has(decoded.uid) ? { uid: decoded.uid, email: decoded.email || null } : null
  } catch { return null }
}

export function cleanId(value, label = 'id') {
  const text = String(value ?? '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) throw Object.assign(new Error(`Invalid ${label}.`), { statusCode: 400 })
  return text
}

export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }

function collectByName(value, names, results = []) {
  if (Array.isArray(value)) { for (const item of value) collectByName(item, names, results); return results }
  if (!value || typeof value !== 'object') return results
  for (const [key, child] of Object.entries(value)) {
    if (!key.startsWith('@_') && names.has(key.toLowerCase())) {
      const values = Array.isArray(child) ? child : [child]
      for (const item of values) {
        if (typeof item === 'string' || typeof item === 'number') {
          const text = String(item).trim()
          if (text) results.push(text)
        }
      }
    }
    collectByName(child, names, results)
  }
  return results
}

function firstByName(value, names) { return collectByName(value, new Set(names.map((name) => name.toLowerCase())))[0] || '' }
function uniq(values) { return [...new Set(values)] }

export function parseErn(xmlInput) {
  if (typeof xmlInput !== 'string' || Buffer.byteLength(xmlInput, 'utf8') === 0 || Buffer.byteLength(xmlInput, 'utf8') > MAX_XML_BYTES) {
    throw Object.assign(new Error(`ERN XML must be between 1 byte and ${MAX_XML_BYTES} bytes.`), { statusCode: 413 })
  }
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xmlInput) || /<\?xml-stylesheet/i.test(xmlInput)) {
    throw Object.assign(new Error('DTD, entity declarations, and XML stylesheet processing instructions are not accepted.'), { statusCode: 400 })
  }
  const syntax = XMLValidator.validate(xmlInput, { allowBooleanAttributes: false })
  if (syntax !== true) throw Object.assign(new Error('Malformed XML.'), { statusCode: 400 })
  const namespace = xmlInput.match(/https?:\/\/ddex\.net\/xml\/ern\/(\d{2,})/i)?.[1]
  if (namespace !== '43') throw Object.assign(new Error('Only DDEX ERN 4.3-family messages are accepted; exact XSD validation is still required before approval.'), { statusCode: 422 })
  let parsed
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      processEntities: false,
      trimValues: true,
      parseTagValue: false,
      parseAttributeValue: false,
      allowBooleanAttributes: false,
    }).parse(xmlInput)
  } catch { throw Object.assign(new Error('Unable to parse ERN XML safely.'), { statusCode: 400 }) }
  const message = parsed?.NewReleaseMessage
  if (!message || Array.isArray(message)) throw Object.assign(new Error('Expected one DDEX NewReleaseMessage root element.'), { statusCode: 422 })
  const messageId = firstByName(message?.MessageHeader, ['MessageId'])
  if (!messageId || messageId.length > 256) throw Object.assign(new Error('ERN MessageHeader/MessageId is required.'), { statusCode: 422 })

  const titles = collectByName(message, new Set(['titletext']))
  const artistNames = uniq(collectByName(message, new Set(['displayartistname', 'artistdisplayname']))).slice(0, 100)
  const isrcs = uniq(collectByName(message, new Set(['isrc'])).map((v) => v.replace(/\s+/g, '').toUpperCase()).filter((v) => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(v))).slice(0, 500)
  const upcs = uniq(collectByName(message, new Set(['icpn', 'upc', 'ean'])).map((v) => v.replace(/\s+/g, '').toUpperCase()).filter((v) => /^\d{12,14}$/.test(v))).slice(0, 100)
  const releaseDates = uniq(collectByName(message, new Set(['releasedate', 'originalreleasedate', 'startdate'])).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))).slice(0, 100)
  const territories = uniq(collectByName(message, new Set(['territorycode', 'includedterritorycode'])).map((v) => v.toUpperCase()).filter((v) => /^(WORLDWIDE|[A-Z]{2,3})$/.test(v))).slice(0, 500)
  const genres = uniq(collectByName(message, new Set(['genretext'])).slice(0, 100))
  const languages = uniq(collectByName(message, new Set(['languageandscriptcode', 'languagecode'])).map((v) => v.toLowerCase()).filter((v) => /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v))).slice(0, 50)
  const labels = uniq(collectByName(message, new Set(['labelname'])).slice(0, 50))
  const copyrights = uniq(collectByName(message, new Set(['cnotice', 'pnotice', 'copyright'])).slice(0, 100))
  const releaseType = firstByName(message, ['release type', 'releaseType', 'releaseTypeCode'])
  const audioReferences = uniq(collectByName(message, new Set(['resourceReference'])).slice(0, 1000))

  return {
    messageId,
    namespace: `ern/${namespace}`,
    exactSchemaVersion: null,
    title: titles[0] || 'Untitled release',
    artistNames,
    releaseType: releaseType || 'unclassified',
    isrcs,
    upcs,
    releaseDates,
    territories,
    genres,
    languages,
    labels,
    copyrights,
    resourceReferences: audioReferences,
    schemaValidation: { state: 'pending', validator: null, checkedAt: null, errors: [] },
  }
}

export function assetSpec(input, index) {
  const role = input?.role
  const contentType = String(input?.contentType || '').toLowerCase()
  const size = Number(input?.size)
  const resourceReference = String(input?.resourceReference || '').trim()
  if (!['audio', 'artwork'].includes(role)) throw Object.assign(new Error(`Asset ${index + 1} role must be audio or artwork.`), { statusCode: 400 })
  const audioTypes = new Set(['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg', 'application/octet-stream'])
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (!(role === 'audio' ? audioTypes : imageTypes).has(contentType)) throw Object.assign(new Error(`Unsupported ${role} content type.`), { statusCode: 415 })
  const maximum = role === 'audio' ? MAX_MASTER_BYTES : MAX_ARTWORK_BYTES
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) throw Object.assign(new Error(`${role} size must be from 1 byte to ${maximum} bytes.`), { statusCode: 413 })
  if (resourceReference && !/^[A-Za-z0-9._:-]{1,128}$/.test(resourceReference)) throw Object.assign(new Error('Invalid DDEX resource reference.'), { statusCode: 400 })
  const sha = String(input?.sha256 || '').toLowerCase()
  if (sha && !/^[a-f0-9]{64}$/.test(sha)) throw Object.assign(new Error('Asset SHA-256 must be a 64-character hexadecimal value.'), { statusCode: 400 })
  return { role, contentType, size, resourceReference, sha256: sha || null, originalFilename: String(input?.filename || `${role}-${index + 1}`).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 160) }
}

export function nowIso() { return new Date().toISOString() }
export function historyEvent(actor, action, note = '') { return { actor, action, note: String(note).slice(0, 1000), at: nowIso() } }
