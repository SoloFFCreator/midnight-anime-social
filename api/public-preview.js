const HOST = 'https://midnightsocial.bond'
const DB = (process.env.FIREBASE_DATABASE_URL || 'https://mid-night-anime-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '')
const text = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n)
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const validId = (v) => /^[A-Za-z0-9_-]{1,128}$/.test(v || '')
const validHandle = (v) => /^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/.test(v || '')
async function getPublic(path) {
  const res = await fetch(`${DB}/publicContent/${path}.json`)
  if (!res.ok) throw new Error(`Public metadata lookup failed (${res.status})`)
  return res.json()
}
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow','GET, HEAD'); return res.status(405).send('Method not allowed') }
  const q = new URL(req.url, HOST).searchParams
  const type = q.get('type')
  let item, canonical, title, description
  try {
    if (type === 'reel' && validId(q.get('id'))) {
      item = await getPublic(`reels/${encodeURIComponent(q.get('id'))}`)
      if (!item || item.id !== q.get('id') || item.contentType !== 'reel') return res.status(404).send('Public Reel not found')
      canonical = `${HOST}/reels/${encodeURIComponent(item.id)}`
      title = `${text(item.authorName || item.username || 'Creator', 80)} on Midnight Anime Social`
      description = text(item.caption || 'Watch this public Reel on Midnight Anime Social.', 300)
    } else if (type === 'profile' && validHandle(q.get('handle'))) {
      item = await getPublic(`profiles/${encodeURIComponent(q.get('handle'))}`)
      if (!item || item.username !== q.get('handle')) return res.status(404).send('Public profile not found')
      canonical = `${HOST}/@${encodeURIComponent(item.username)}`
      title = `${text(item.displayName || item.username, 80)} (@${text(item.username, 30)}) · Midnight Anime Social`
      description = text(item.bio || `Public profile of ${item.displayName || item.username} on Midnight Anime Social.`, 300)
    } else return res.status(404).send('Not found')
  } catch (e) { console.error('Public preview lookup failed', e); return res.status(503).send('Public metadata temporarily unavailable') }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="index,follow,max-image-preview:large"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="${type === 'profile' ? 'profile' : 'article'}"><meta property="og:site_name" content="Midnight Anime Social"><meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="ai-content-declaration" content="public metadata only; private media not included"><script>location.replace(${JSON.stringify(canonical)})</script></head><body><main><h1>${esc(title)}</h1><p>${esc(description)}</p><a href="${esc(canonical)}">Open ${type === 'reel' ? 'Reel' : 'profile'}</a></main></body></html>`
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=3600'); return res.status(200).send(req.method === 'HEAD' ? '' : html)
}
