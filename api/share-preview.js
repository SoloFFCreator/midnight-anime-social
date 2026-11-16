const PRODUCTION_HOST = 'social.midnightanime.bond'

function text(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function isAppHost(hostname) {
  return hostname === PRODUCTION_HOST || (hostname.endsWith('.vercel.app') && hostname.startsWith('midnight-anime-social'))
}

function safeTarget(value) {
  if (!value || value.length > 2048) return null
  try {
    const target = new URL(value)
    if (target.protocol !== 'https:' || !isAppHost(target.hostname) || target.username || target.password) return null
    if (/^\/profile\/(?:[A-Za-z0-9._~-]|%[0-9a-f]{2}){1,384}$/i.test(target.pathname)) {
      if (target.search || (target.hash && !/^#post-[A-Za-z0-9_-]{1,128}$/.test(target.hash))) return null
      return target
    }
    if (target.pathname === '/reels' && !target.hash && /^[A-Za-z0-9_-]{1,128}$/.test(target.searchParams.get('reel') || '')) {
      return target
    }
  } catch { return null }
  return null
}

function safeImage(value) {
  if (!value || value.length > 4096) return null
  try {
    const image = new URL(value)
    if (image.protocol !== 'https:' || image.username || image.password) return null
    const host = image.hostname.toLowerCase()
    const allowed = host === PRODUCTION_HOST
      || host.endsWith('.amazonaws.com')
      || host.endsWith('.r2.cloudflarestorage.com')
      || host.endsWith('.r2.dev')
      || host.endsWith('.workers.dev')
      || (process.env.VITE_R2_WORKER_URL && host === new URL(process.env.VITE_R2_WORKER_URL).hostname)
    return allowed ? image : null
  } catch { return null }
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).send('Method not allowed')
  }

  const query = new URL(req.url, `https://${PRODUCTION_HOST}`).searchParams
  const target = safeTarget(query.get('target'))
  if (!target) return res.status(400).send('Invalid share target')

  const title = text(query.get('title'), 160) || 'Midnight Anime Social'
  const description = text(query.get('description'), 300) || 'A moment shared with the Midnight Anime community.'
  // Older Reels predate thumbnail uploads; keep their WhatsApp unfurl visual
  // rather than silently falling back to a text-only summary card.
  const image = safeImage(query.get('image')) || (target.pathname === '/reels' ? new URL(`https://${PRODUCTION_HOST}/share-preview.png`) : null)
  const contentUrl = escapeHtml(target.toString())
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || PRODUCTION_HOST).split(',')[0].trim()
  const shareHost = isAppHost(forwardedHost) ? forwardedHost : PRODUCTION_HOST
  const shareUrl = escapeHtml(new URL(req.url, `https://${shareHost}`).toString())
  const escapedTitle = escapeHtml(title)
  const escapedDescription = escapeHtml(description)
  const imageTags = image ? `
    <meta property="og:image" content="${escapeHtml(image.toString())}">
    <meta property="og:image:secure_url" content="${escapeHtml(image.toString())}">
    <meta property="og:image:alt" content="${escapedTitle}">
    <meta name="twitter:image" content="${escapeHtml(image.toString())}">` : ''
  const redirectScript = '<script>window.location.replace(document.getElementById("open-content").href)</script>'
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Midnight Anime Social">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:url" content="${shareUrl}">
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDescription}">${imageTags}
</head>
<body>
  <main><h1>${escapedTitle}</h1><p>${escapedDescription}</p><a id="open-content" href="${contentUrl}">Open on Midnight Anime Social</a></main>
  ${redirectScript}
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (req.method === 'HEAD') return res.status(200).end()
  return res.status(200).send(html)
}
