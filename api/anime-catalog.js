const API_ROOT = 'https://api.themoviedb.org/3'
const ANIMATION_GENRE = 16

async function tmdb(path, params = {}) {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB server key is not configured.')
  const url = new URL(`${API_ROOT}/${path}`)
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'en-US')
  for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.status_message || `TMDB returned HTTP ${response.status}.`)
    return body
  } finally { clearTimeout(timer) }
}

function normalize(item, mediaType) {
  return {
    id: Number(item.id),
    mediaType,
    title: item.name || item.title || 'Untitled anime',
    overview: item.overview || '',
    posterPath: item.poster_path || '',
    backdropPath: item.backdrop_path || '',
    rating: Number(item.vote_average || 0),
    releaseDate: item.first_air_date || item.release_date || '',
    originalLanguage: item.original_language || '',
    seasons: Number(item.number_of_seasons || 0),
    episodes: Number(item.number_of_episodes || 0),
    popularity: Number(item.popularity || 0),
  }
}

function isAnime(item) {
  return Array.isArray(item?.genre_ids) && item.genre_ids.includes(ANIMATION_GENRE) && (item.original_language === 'ja' || item.origin_country?.includes('JP'))
}

export default async function handler(req, res) {
  const { action = 'trending', q = '', id = '', mediaType = 'tv' } = req.query || {}
  res.setHeader('Cache-Control', action === 'details' ? 's-maxage=1800, stale-while-revalidate=86400' : 's-maxage=900, stale-while-revalidate=3600')
  try {
    if (action === 'trending') {
      const [tv, movies] = await Promise.all([
        tmdb('discover/tv', { with_genres: ANIMATION_GENRE, with_origin_country: 'JP', sort_by: 'popularity.desc', include_adult: false, page: 1 }),
        tmdb('discover/movie', { with_genres: ANIMATION_GENRE, with_original_language: 'ja', sort_by: 'popularity.desc', include_adult: false, page: 1 }),
      ])
      const results = [
        ...(tv.results || []).map((item) => normalize(item, 'tv')),
        ...(movies.results || []).map((item) => normalize(item, 'movie')),
      ].sort((a, b) => b.popularity - a.popularity)
      return res.status(200).json({ results })
    }
    if (action === 'search') {
      const query = String(q).trim().slice(0, 100)
      if (!query) return res.status(200).json({ results: [] })
      const [tv, movies] = await Promise.all([
        tmdb('search/tv', { query, include_adult: false, page: 1 }),
        tmdb('search/movie', { query, include_adult: false, page: 1 }),
      ])
      const results = [
        ...(tv.results || []).filter(isAnime).map((item) => normalize(item, 'tv')),
        ...(movies.results || []).filter(isAnime).map((item) => normalize(item, 'movie')),
      ].sort((a, b) => b.popularity - a.popularity).slice(0, 30)
      return res.status(200).json({ results })
    }
    if (action === 'details') {
      const type = mediaType === 'movie' ? 'movie' : mediaType === 'tv' ? 'tv' : ''
      if (!type || !/^\d{1,12}$/.test(String(id))) return res.status(400).json({ error: 'A valid TMDB media type and ID are required.' })
      const details = await tmdb(`${type}/${id}`, { append_to_response: 'external_ids,images', include_image_language: 'en,null' })
      return res.status(200).json({ details })
    }
    return res.status(400).json({ error: 'Unsupported catalog action.' })
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'TMDB request timed out.' : error?.message || 'TMDB catalog is unavailable.'
    return res.status(message.includes('key is not configured') ? 503 : 502).json({ error: message })
  }
}
