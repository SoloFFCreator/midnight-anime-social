async function request(params) {
  const url = new URL('/api/anime-catalog', window.location.origin)
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Anime catalog returned HTTP ${response.status}.`)
  return body
}

export const TMDBApi = {
  trending: async () => (await request({ action: 'trending' })).results || [],
  search: async (query) => (await request({ action: 'search', q: query })).results || [],
  details: async (id, mediaType) => (await request({ action: 'details', id, mediaType })).details || null,
}

export function tmdbImage(path, size = 'w780') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : ''
}
