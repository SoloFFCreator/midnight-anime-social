import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getDistributionS3, getFirebaseAdmin, respond } from '../_distribution.js'

const PLAY_URL_TTL_SECONDS = 300

function territoryAllowed(grants, country) {
  if (!Array.isArray(grants) || !grants.length) return false
  if (grants.includes('WORLDWIDE')) return true
  // Country-restricted playback is deliberately closed unless the operator has
  // verified the hosting provider's country header and enabled it explicitly.
  if (process.env.DISTRIBUTION_GEO_PROVIDER !== 'vercel' || !country) return false
  return grants.includes(country)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed.' })
  try {
    const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase()
    const query = String(req.query?.q || '').trim().slice(0, 100).toLowerCase()
    const { db } = getFirebaseAdmin()
    const snapshot = await db.ref('distributionCatalog').get()
    const records = Object.values(snapshot.val() || {})
      .filter((item) => ['approved', 'scheduled'].includes(item.status) && Number(item.releaseAt) <= Date.now() && territoryAllowed(item.territories, country))
      .filter((item) => !query || `${item.metadata?.title || ''} ${(item.metadata?.artistNames || []).join(' ')} ${(item.metadata?.genres || []).join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.releaseAt) - Number(a.releaseAt))
      .slice(0, 50)

    const { client, bucket } = getDistributionS3()
    const releases = await Promise.all(records.map(async (item) => {
      const assets = await Promise.all((item.assets || []).filter((asset) => asset.state === 'uploaded' && asset.s3Key).map(async (asset) => {
        if (!asset.s3Key.startsWith(`distribution/inbound/${item.partnerId}/${item.id}/assets/`)) return null
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: asset.s3Key, ResponseContentType: asset.detectedContentType || asset.contentType }), { expiresIn: PLAY_URL_TTL_SECONDS })
        return { role: asset.role, resourceReference: asset.resourceReference || null, contentType: asset.detectedContentType || asset.contentType, url, expiresIn: PLAY_URL_TTL_SECONDS }
      }))
      return {
        id: item.id,
        title: item.metadata?.title,
        artists: item.metadata?.artistNames || [],
        releaseType: item.metadata?.releaseType,
        releaseDate: item.rightsReview?.releaseDate,
        genres: item.metadata?.genres || [],
        label: item.metadata?.labels?.[0] || null,
        artwork: assets.find((asset) => asset?.role === 'artwork') || null,
        tracks: assets.filter((asset) => asset?.role === 'audio'),
      }
    }))
    return respond(res, 200, { releases, country: country || null, geoLimitedReleasesRequireConfiguredTrustedProvider: process.env.DISTRIBUTION_GEO_PROVIDER !== 'vercel' })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution catalogue unavailable:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Catalogue is temporarily unavailable.' })
  }
}
