const UPSTREAM = 'https://nuvio-stream-api-20260925.onrender.com/api/stream'

export default async function handler(req, res) {
  const query = req.query || {}
  const mediaType = query.type === 'movie' ? 'movie' : query.type === 'tv' ? 'tv' : ''
  const audio = ['hindi', 'dub', 'sub'].includes(String(query.audio)) ? String(query.audio) : ''
  const idKeys = ['tmdbId', 'imdbId'].filter((key) => query[key])
  const identifier = idKeys[0]
  const id = identifier ? String(query[identifier]) : ''
  const season = Math.max(1, Number.parseInt(query.season, 10) || 1)
  const episode = Math.max(1, Number.parseInt(query.episode, 10) || 1)
  if (!mediaType || !audio || idKeys.length !== 1 || !/^(?:\d{1,12}|tt\d{5,12})$/i.test(id)) {
    return res.status(400).json({ error: 'A media type, audio track and one valid TMDB or IMDb identifier are required.' })
  }
  const params = new URLSearchParams({ type: mediaType, [identifier]: id, audio })
  if (mediaType === 'tv') { params.set('season', String(season)); params.set('episode', String(episode)) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const upstream = await fetch(`${UPSTREAM}?${params}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
    const body = await upstream.text()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.status(upstream.status).send(body)
  } catch (error) {
    return res.status(502).json({ error: error?.name === 'AbortError' ? 'Nuvio provider timed out.' : error?.message || 'Nuvio provider unavailable.' })
  } finally { clearTimeout(timer) }
}
