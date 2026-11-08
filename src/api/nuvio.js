function isUrl(value) { return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) }
function sourceUrl(source) { return typeof source === 'string' ? source : source?.url || source?.file || source?.link || source?.src || source?.stream || source?.source }
function playableUrl(value, hls) {
  if (!hls) return value
  try {
    const parsed = new URL(value)
    if (['megavid.buzz', 'www.megavid.buzz'].includes(parsed.hostname)) return `/api/megavid-proxy?url=${encodeURIComponent(value)}`
  } catch { /* preserve the direct provider URL */ }
  return value
}
function sourcesFrom(payload) {
  if (Array.isArray(payload)) return payload
  for (const key of ['streams', 'sources', 'data']) if (Array.isArray(payload?.[key])) return payload[key]
  return payload?.url || payload?.file || payload?.link || payload?.src || payload?.stream ? [payload] : []
}
function normalizeSources(payload) {
  return sourcesFrom(payload).map((source, index) => {
    const url = sourceUrl(source)
    if (!isUrl(url)) return null
    const typeText = typeof source === 'object' ? `${source.type || ''} ${source.format || ''} ${source.mimeType || ''}` : ''
    const hls = /\.m3u8(?:$|[?#])/i.test(url) || /m3u8|mpegurl|hls/i.test(typeText)
    return {
      id: `${source?.name || source?.provider || 'Nuvio'}-${source?.quality || source?.resolution || 'Auto'}-${index}`,
      name: typeof source === 'object' ? source.name || source.provider || 'Nuvio source' : 'Nuvio source',
      title: typeof source === 'object' ? source.title || source.name || 'Nuvio stream' : 'Nuvio stream',
      quality: typeof source === 'object' ? source.quality || source.resolution || 'Auto' : 'Auto',
      url: playableUrl(url.trim(), hls),
      type: hls ? 'hls' : 'mp4',
      headers: typeof source === 'object' ? source.headers || {} : {},
      subtitles: typeof source === 'object' && Array.isArray(source.subtitles) ? source.subtitles : [],
    }
  }).filter(Boolean)
}

export const NuvioApi = {
  async fetchStreams({ tmdbId, imdbId, mediaType = 'tv', season = 1, episode = 1, audio = 'sub' }) {
    const ids = audio === 'hindi' ? [['tmdbId', tmdbId], ['imdbId', imdbId]] : [['imdbId', imdbId], ['tmdbId', tmdbId]]
    const candidates = ids.filter(([, value], index) => value && ids.findIndex(([key]) => key === ids[index][0]) === index)
    if (!candidates.length) return { ok: false, reason: 'This title does not have a provider-supported TMDB/IMDb identifier.', streams: [] }
    let lastReason = ''
    for (const [idKey, idValue] of candidates) {
      const params = new URLSearchParams({ type: mediaType === 'movie' ? 'movie' : 'tv', [idKey]: String(idValue), audio: ['hindi', 'dub', 'sub'].includes(audio) ? audio : 'sub' })
      if (mediaType !== 'movie') { params.set('season', String(Math.max(1, Number(season) || 1))); params.set('episode', String(Math.max(1, Number(episode) || 1))) }
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 45000)
      try {
        const response = await fetch(`/api/hindi-stream?${params}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) { lastReason = body.error || `Nuvio provider returned HTTP ${response.status}.`; continue }
        const streams = normalizeSources(body)
        if (streams.length) return { ok: true, streams }
        lastReason = `No ${audio} stream was returned for this episode.`
      } catch (error) {
        lastReason = error?.name === 'AbortError' ? 'Nuvio provider request timed out.' : error?.message || 'Nuvio provider is unavailable.'
      } finally { window.clearTimeout(timer) }
    }
    return { ok: false, reason: lastReason || 'No Nuvio source was returned for this episode.', streams: [] }
  },
}
