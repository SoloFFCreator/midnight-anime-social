import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, Search, Star } from 'lucide-react'
import { EmptyState, PageHeading } from './ui.jsx'
import { TMDBApi, tmdbImage } from './api/tmdb.js'

function AnimeCard({ item }) {
  const poster = tmdbImage(item.posterPath, 'w500')
  return <article className="tmdb-anime-card">
    <Link to={`/reels/anime/${item.mediaType}/${item.id}/1/1`} className="tmdb-anime-art" aria-label={`Play ${item.title} in Reels`}>
      <img src={poster || tmdbImage(item.backdropPath, 'w780')} alt={`${item.title} poster`} loading="lazy"/>
      <span className="tmdb-art-play"><Clapperboard size={17}/> Play as Reel</span>
      <span className="tmdb-art-rating"><Star size={13} fill="currentColor"/> {item.rating ? item.rating.toFixed(1) : '—'}</span>
    </Link>
    <div className="tmdb-anime-copy"><p className="eyebrow">{item.mediaType === 'movie' ? 'ANIME FILM' : 'ANIME SERIES'}{item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ''}</p><h2>{item.title}</h2><p>{item.overview || 'A title to add to your midnight watchlist.'}</p><Link to={`/reels/anime/${item.mediaType}/${item.id}/1/1`} className="tmdb-watch-link">Watch episode <span>↗</span></Link></div>
  </article>
}

export default function AnimePage() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        const results = query.trim() ? await TMDBApi.search(query.trim()) : await TMDBApi.trending()
        if (alive) setItems(results)
      } catch (requestError) { if (alive) setError(requestError.message || 'Could not load the anime directory.') }
      finally { if (alive) setBusy(false) }
    }, query.trim() ? 350 : 0)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [query])
  const featured = items[0]
  return <section className="anime-page tmdb-anime-page">
    {featured?.backdropPath && !query.trim() && <Link className="tmdb-feature" to={`/reels/anime/${featured.mediaType}/${featured.id}/1/1`} style={{ backgroundImage: `linear-gradient(90deg,rgba(8,8,12,.98),rgba(8,8,12,.72) 48%,rgba(8,8,12,.08)),url(${tmdbImage(featured.backdropPath, 'w1280')})` }}><span className="eyebrow">TONIGHT ON MIDNIGHT ANIME</span><strong>{featured.title}</strong><span className="tmdb-feature-cta">Watch in portrait <Clapperboard size={14}/></span></Link>}
    <div className="anime-page-top"><PageHeading eyebrow="THE MIDNIGHT ANIME WATCHLIST" title="Find your next series." sub="Search anime, choose an episode, and play it in the Reels-style player."/><span className="tmdb-wordmark">MOVIES & SERIES</span></div>
    <label className="anime-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anime titles…" aria-label="Search anime titles"/><span>TMDB</span></label>
    <div className="anime-results-heading"><h2>{query.trim() ? 'Search results' : 'Popular anime'}</h2><span>{busy ? 'Loading…' : `${items.length} titles`}</span></div>
    {error && <div className="anime-error"><Clapperboard/><p>{error}</p><span>Check the server-side TMDB_API_KEY setting and try again.</span></div>}
    {!error && busy && !items.length && <div className="anime-loading">Finding your next late-night watch…</div>}
    {!error && !busy && !items.length && <EmptyState icon={<Search/>} title="No anime titles found" text="Try another title, or check back in a little while."/>}
    {items.length > 0 && <div className="tmdb-anime-grid">{items.map((item) => <AnimeCard key={`${item.mediaType}-${item.id}`} item={item}/>)}</div>}
    <p className="tmdb-credit">Anime titles, descriptions, ratings, posters and backdrops supplied by TMDB. Anime source playback is provided by Midnight Anime.</p>
    <Link className="anime-back-link" to="/profile">Back to your profile</Link>
  </section>
}
