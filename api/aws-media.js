import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyClcy2YXqryJAkg_wy1W4RLqkYMIsEg2Rk'
const FIREBASE_DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || 'https://mid-night-anime-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '')
const MAX_BYTES = 5_000_000_000
const READ_URL_TTL_SECONDS = 60 * 60
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime|x-m4v))$/i
let s3Client

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(status).json(data)
}

function getS3Client() {
  const region = process.env.AWS_REGION
  const roleArn = process.env.AWS_ROLE_ARN
  if (!region || !roleArn || !process.env.S3_BUCKET_NAME) {
    throw new Error('AWS S3 is not configured for this Vercel deployment. Check AWS_REGION, AWS_ROLE_ARN, and S3_BUCKET_NAME.')
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region,
      // AWS STS validates this exact audience claim for AssumeRoleWithWebIdentity.
      credentials: awsCredentialsProvider({ audience: 'https://sts.amazonaws.com', roleArn }),
    })
  }
  return s3Client
}

async function verifyUser(req) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  })
  if (!response.ok) return null
  const payload = await response.json()
  const user = payload.users?.[0]
  return user?.localId ? { uid: user.localId, token } : null
}

async function canReadMedia(key, uid, token) {
  if (key.startsWith(`aws/${uid}/`)) return true
  const collections = [
    ['posts', 'mediaKey', false],
    ['reels', 'mediaKey', false],
    ['stories', 'mediaKey', true],
    ['profiles', 'avatarKey', false],
  ]
  for (const [collection, mediaField, expires] of collections) {
    const url = new URL(`${FIREBASE_DATABASE_URL}/${collection}.json`)
    url.searchParams.set('orderBy', JSON.stringify(mediaField))
    url.searchParams.set('equalTo', JSON.stringify(key))
    url.searchParams.set('auth', token)
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const data = await response.json()
      const records = Array.isArray(data) ? data : Object.values(data || {})
      if (records.some((item) => item?.[mediaField] === key && (!expires || Number(item.expiresAt) > Date.now()) && item.visibility !== 'private')) return true
    } catch {
      // Keep checking the other indexed collections. Failure is denied below.
    }
  }
  return false
}

function safeExtension(filename = 'media') {
  const name = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
  return name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })

  let session
  try {
    session = await verifyUser(req)
  } catch {
    return json(res, 401, { error: 'Sign in required.' })
  }
  if (!session) return json(res, 401, { error: 'Sign in required.' })

  const bucket = process.env.S3_BUCKET_NAME
  if (!bucket) return json(res, 503, { error: 'AWS S3 is not configured for this Vercel project.' })

  try {
    const client = getS3Client()
    if (req.method === 'POST') {
      const body = req.body || {}
      const contentType = String(body.contentType || '').toLowerCase()
      const size = Number(body.size)
      if (!ALLOWED_TYPES.test(contentType)) return json(res, 415, { error: 'Choose a supported image or video format.' })
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) return json(res, 413, { error: 'File size must be between 1 byte and 5 GB.' })
      const key = `aws/${session.uid}/${crypto.randomUUID()}.${safeExtension(body.filename)}`
      const signed = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [['content-length-range', 1, size], ['eq', '$Content-Type', contentType]],
        Fields: { 'Content-Type': contentType },
        Expires: 300,
      })
      return json(res, 200, { ...signed, key, expiresIn: 300 })
    }

    const key = String(req.query?.key || '')
    if (!/^aws\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9._-]{1,128}$/.test(key) || key.includes('..')) {
      return json(res, 400, { error: 'Invalid media key.' })
    }
    if (!await canReadMedia(key, session.uid, session.token)) return json(res, 403, { error: 'You do not have access to this private media.' })
    const command = new GetObjectCommand({ Bucket: bucket, Key: key })
    const url = await getSignedUrl(client, command, { expiresIn: READ_URL_TTL_SECONDS })
    return json(res, 200, { url, expiresIn: READ_URL_TTL_SECONDS })
  } catch (error) {
    console.error('AWS media operation failed:', error?.name || 'Error', error?.message || 'Unknown error')
    return json(res, 502, { error: error?.message || 'Unable to prepare AWS media access.' })
  }
}
