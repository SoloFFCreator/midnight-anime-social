import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clapperboard, ExternalLink, Search, Star } from 'lucide-react'
import { EmptyState, PageHeading } from './ui.jsx'

const ANILIST = 'https://graphql.anilist.co'
const TRENDING_QUERY = `query { Page(page:1,perPage:24) { media(type:ANIME,sort:TRENDING_DESC,status_not:NOT_YET_RELEASED,isAdult:false) { id episodes format averageScore seasonYear title { romaji english } coverImage { large } } } }`
const SEARCH_QUERY = `query ($search:String) { Page(page:1,perPage:24) { media(type:ANIME,search:$search,sort:SEARCH_MATCH,isAdult:false) { id episodes format averageScore seasonYear title { romaji english } coverImage { large } } } }`
const STREAM_ORIGIN = 'https://www.midnightanime.bond'

function animeTitle(item) {
  return item?.title?.english || item?.title?.romaji || 'Untitled anime'
}

function AnimeCard({ item }) {
  const [episode, setEpisode] = useState('1')
  const watchHref = `${STREAM_ORIGIN}/watch/${item.id}/${Math.max(1, Number(episode) || 1)}`
  return <article className="anime-card">
    <img className="anime-cover" src={item.coverImage?.large || ''} alt={`${animeTitle(item)} poster`} loading="lazy"/>
    <div className="anime-card-copy">
      <h2>{animeTitle(item)}</h2>
      <div className="anime-meta">
        {item.averageScore ? <span><Star size={13} fill="currentColor"/> {Number(item.averageScore / 10).toFixed(1)}</span> : null}
        {item.seasonYear ? <span>{item.seasonYear}</span> : null}
        {item.episodes ? <span>{item.episodes} eps</span> : item.format === 'MOVIE' ? <span>Movie</span> : <span>Series</span>}
      </div>
      <div className="anime-watch-row">
        <label>Episode<input type="number" inputMode="numeric" min="1" max={item.episodes || 999} value={episode} onChange={(event) => setEpisode(event.target.value)} aria-label={`Episode number for ${animeTitle(item)}`}/></label>
        <a className="primary-button anime-watch-button" href={watchHref} target="_blank" rel="noopener noreferrer">Watch <ArrowUpRight size={15}/></a>
      </div>
    </div>
  </article>
}

export default function AnimePage() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        const searching = Boolean(query.trim())
        const response = await fetch(ANILIST, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: searching ? SEARCH_QUERY : TRENDING_QUERY, variables: searching ? { search: query.trim() } : {} }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Anime catalog returned ${response.status}.`)
        const payload = await response.json()
        if (payload.errors?.length) throw new Error(payload.errors[0].message || 'Anime catalog is unavailable.')
        setItems(payload.data?.Page?.media || [])
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Could not load the anime catalog.')
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    }, query.trim() ? 320 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  return <section className="anime-page">
    <div className="anime-page-top">
      <PageHeading eyebrow="THE MIDNIGHT ANIME WATCHLIST" title="Find your next series." sub="Discover anime here, then continue on the Midnight Anime streaming player."/>
      <a className="secondary-button anime-home-link" href={STREAM_ORIGIN} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Streaming home</a>
    </div>
    <label className="anime-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles…" aria-label="Search anime titles"/><span>ANILIST</span></label>
    <div className="anime-results-heading"><h2>{query.trim() ? 'Search results' : 'Trending now'}</h2><span>{busy ? 'Loading…' : `${items.length} titles`}</span></div>
    {error ? <div className="anime-error"><Clapperboard/><p>{error}</p><a href={STREAM_ORIGIN} target="_blank" rel="noopener noreferrer">Open the Midnight Anime streaming home</a></div> : null}
    {!error && busy && !items.length ? <div className="anime-loading">Finding your next late-night watch…</div> : null}
    {!error && !busy && !items.length ? <EmptyState icon={<Search/>} title="No titles found" text="Try another anime title, or browse the streaming home."/> : null}
    {items.length ? <div className="anime-grid">{items.map((item) => <AnimeCard key={item.id} item={item}/>)}</div> : null}
    <p className="anime-credit">Anime discovery metadata by AniList. Playback opens the existing Midnight Anime provider in a new tab; social media uploads remain in private R2.</p>
    <Link className="anime-back-link" to="/profile">Back to your profile</Link>
  </section>
}
