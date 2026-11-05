import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS', 'vary': 'Origin' },
})
const MAX_BYTES = 5 * 1024 * 1024 * 1024
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime|x-m4v))$/i

async function verifyToken(request, env) {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: match[1] }),
  })
  if (!response.ok) return null
  const result = await response.json()
  return result.users?.[0]?.localId || null
}

function s3(env) {
  return new S3Client({ region: 'auto', endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } })
}
function safeName(name = 'media') {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'media'
}
function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : (allowed[0] || 'null')
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST,GET,OPTIONS', 'access-control-max-age': '86400', vary: 'Origin' } })
    const url = new URL(request.url)
    if (!['/upload-url', '/media-url'].includes(url.pathname)) return json({ error: 'Not found' }, 404, origin)
    if (url.pathname === '/upload-url' && request.method !== 'POST' || url.pathname === '/media-url' && request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin)
    if (!env.FIREBASE_API_KEY || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CLOUDFLARE_ACCOUNT_ID || !env.R2_BUCKET_NAME) return json({ error: 'Media service is not configured' }, 503, origin)
    let uid
    try { uid = await verifyToken(request, env) } catch { uid = null }
    if (!uid) return json({ error: 'Sign in required' }, 401, origin)
    const client = s3(env)
    try {
      if (url.pathname === '/upload-url') {
        const body = await request.json()
        const contentType = String(body.contentType || '').toLowerCase()
        const size = Number(body.size)
        if (!ALLOWED_TYPES.test(contentType)) return json({ error: 'Choose a supported image or video format.' }, 415, origin)
        if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return json({ error: 'File size must be between 1 byte and 5 GiB.' }, 413, origin)
        const ext = safeName(body.filename || 'media').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
        const key = `${uid}/${crypto.randomUUID()}.${ext}`
        const command = new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, ContentType: contentType })
        const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 })
        return json({ url: uploadUrl, key, expiresIn: 900 }, 200, origin)
      }
      const key = url.searchParams.get('key') || ''
      if (!key || key.length > 500 || key.includes('..')) return json({ error: 'Invalid media key' }, 400, origin)
      const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
      const signed = await getSignedUrl(client, command, { expiresIn: 900 })
      return json({ url: signed, expiresIn: 900 }, 200, origin)
    } catch (error) {
      console.error('R2 signing failed', error?.message)
      return json({ error: 'Unable to prepare media access' }, 500, origin)
    }
  },
}
