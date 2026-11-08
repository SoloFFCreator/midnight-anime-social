const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS', vary: 'Origin' },
})
const MAX_BYTES = 5 * 1024 * 1024 * 1024
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime|x-m4v))$/i
const encoder = new TextEncoder()

async function verifyToken(request, env) {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1]
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  })
  if (!response.ok) return null
  const result = await response.json()
  const uid = result.users?.[0]?.localId
  return uid ? { uid, token } : null
}

async function canReadMedia({ uid, token, key, env }) {
  if (key.startsWith(`${uid}/`)) return true
  const databaseUrl = env.FIREBASE_DATABASE_URL?.replace(/\/+$/, '')
  if (!databaseUrl) return false
  for (const [collection, field] of [['posts', 'mediaKey'], ['reels', 'mediaKey'], ['stories', 'mediaKey'], ['profiles', 'avatarKey']]) {
    const query = new URL(`${databaseUrl}/${collection}.json`)
    query.searchParams.set('orderBy', JSON.stringify(field))
    query.searchParams.set('equalTo', JSON.stringify(key))
    query.searchParams.set('auth', token)
    try {
      const response = await fetch(query.toString())
      if (!response.ok) continue
      const data = await response.json()
      const records = Array.isArray(data) ? data : Object.values(data || {})
      if (records.some((item) => item?.[field] === key && item.visibility !== 'private' && (!item.expiresAt || item.expiresAt > Date.now()))) return true
    } catch { /* Fail closed when the Firebase reference check is unavailable. */ }
  }
  return false
}

function awsEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}
function hex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))
}
async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)))
}
async function presign({ method, key, env }) {
  const host = `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
  const path = `/${awsEncode(env.R2_BUCKET_NAME)}/${key.split('/').map(awsEncode).join('/')}`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const shortDate = amzDate.slice(0, 8)
  const scope = `${shortDate}/auto/s3/aws4_request`
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '900',
    'X-Amz-SignedHeaders': 'host',
    'x-id': method === 'PUT' ? 'PutObject' : 'GetObject',
  }
  const query = Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`).join('&')
  const canonicalRequest = `${method}\n${path}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256(canonicalRequest)}`
  const secret = encoder.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`)
  const kDate = await hmac(secret, shortDate)
  const kRegion = await hmac(kDate, 'auto')
  const kService = await hmac(kRegion, 's3')
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = hex(await hmac(kSigning, stringToSign))
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`
}
function safeName(name = 'media') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'media'
}
function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : (allowed[0] || 'null')
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS', 'access-control-max-age': '86400', vary: 'Origin' } })
    const url = new URL(request.url)
    if (!['/upload-url', '/media-url'].includes(url.pathname)) return json({ error: 'Not found' }, 404, origin)
    if (url.pathname === '/upload-url' && request.method !== 'POST' || url.pathname === '/media-url' && request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin)
    if (!env.FIREBASE_API_KEY || !env.FIREBASE_DATABASE_URL || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CLOUDFLARE_ACCOUNT_ID || !env.R2_BUCKET_NAME) return json({ error: 'Media service is not configured' }, 503, origin)
    let session
    try { session = await verifyToken(request, env) } catch { session = null }
    if (!session) return json({ error: 'Sign in required' }, 401, origin)
    const { uid, token } = session
    try {
      if (url.pathname === '/upload-url') {
        const body = await request.json()
        const contentType = String(body.contentType || '').toLowerCase()
        const size = Number(body.size)
        if (!ALLOWED_TYPES.test(contentType)) return json({ error: 'Choose a supported image or video format.' }, 415, origin)
        if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return json({ error: 'File size must be between 1 byte and 5 GiB.' }, 413, origin)
        const ext = safeName(body.filename || 'media').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
        const key = `${uid}/${crypto.randomUUID()}.${ext}`
        return json({ url: await presign({ method: 'PUT', key, env }), key, expiresIn: 900 }, 200, origin)
      }
      const key = url.searchParams.get('key') || ''
      if (!key || key.length > 500 || key.includes('..')) return json({ error: 'Invalid media key' }, 400, origin)
      if (!await canReadMedia({ uid, token, key, env })) return json({ error: 'You do not have access to this private media.' }, 403, origin)
      return json({ url: await presign({ method: 'GET', key, env }), expiresIn: 900 }, 200, origin)
    } catch (error) {
      console.error('R2 signing failed', error?.message)
      return json({ error: 'Unable to prepare media access' }, 500, origin)
    }
  },
}
