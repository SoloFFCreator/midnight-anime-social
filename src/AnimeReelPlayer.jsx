import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { onValue, push, ref, remove, set } from 'firebase/database'
import { db } from './firebase'
import { NuvioApi } from './api/nuvio.js'
import { TMDBApi, tmdbImage } from './api/tmdb.js'
import StreamPlayer from './StreamPlayer.jsx'
import { ArrowLeft, Bookmark, Check, ChevronDown, Clapperboard, Heart, MessageCircle, Send, Volume2 } from 'lucide-react'

export default function AnimeReelPlayer({ user }) {
  const { mediaType: routeType, id, season: routeSeason, episode: routeEpisode } = useParams()
  const mediaType = routeType === 'movie' ? 'movie' : 'tv'
  const season = Math.max(1, Number(routeSeason) || 1)
  const episode = Math.max(1, Number(routeEpisode) || 1)
  const navigate = useNavigate()
  const [details, setDetails] = useState(null)
  const [profile, setProfile] = useState(null)
  const [detailsError, setDetailsError] = useState('')
  const [streams, setStreams] = useState([])
  const [sourceId, setSourceId] = useState('')
  const [audio, setAudio] = useState('sub')
  const [resolving, setResolving] = useState(true)
  const [providerError, setProviderError] = useState('')
  const [retry, setRetry] = useState(0)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [likes, setLikes] = useState(0)
  const [comments, setComments] = useState([])
  const [showComments, setShowComments] = useState(false)
  const [comment, setComment] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const episodeKey = `${mediaType}_${id}_s${season}_e${episode}`
  const route = `/reels/anime/${mediaType}/${id}/${season}/${episode}`
  const seasonList = useMemo(() => (details?.seasons || []).filter((item) => Number(item.season_number) > 0), [details])
  const selectedSeason = seasonList.find((item) => Number(item.season_number) === season)
  const episodeCount = mediaType === 'movie' ? 1 : Math.min(500, Number(selectedSeason?.episode_count || details?.number_of_episodes || 24))
  const source = streams.find((item) => item.id === sourceId) || streams[0] || null
  const title = details?.name || details?.title || 'Midnight Anime'
  const poster = tmdbImage(details?.poster_path, 'w780')
  const backdrop = tmdbImage(details?.backdrop_path, 'w1280')
  const episodeLabel = mediaType === 'movie' ? 'Full movie' : `${selectedSeason?.name || `Season ${season}`} · Episode ${episode}`

  useEffect(() => {
    let alive = true
    setDetails(null)
    setDetailsError('')
    TMDBApi.details(id, mediaType).then((value) => { if (alive) setDetails(value) }).catch((error) => { if (alive) setDetailsError(error.message || 'Could not load this title from TMDB.') })
    return () => { alive = false }
  }, [id, mediaType])

  useEffect(() => {
    if (mediaType === 'movie' || !details || !seasonList.length) return
    if (!seasonList.some((item) => Number(item.season_number) === season)) {
      navigate(`/reels/anime/${mediaType}/${id}/${seasonList[0].season_number}/1`, { replace: true })
    }
  }, [details, id, mediaType, navigate, season, seasonList])

  useEffect(() => onValue(ref(db, `profiles/${user.uid}`), (snapshot) => setProfile(snapshot.val()), () => {}), [user.uid])
  useEffect(() => onValue(ref(db, `animeReels/${episodeKey}/likes`), (snapshot) => {
    const values = snapshot.val() || {}
    setLiked(Boolean(values[user.uid]))
    setLikes(Object.keys(values).length)
  }, () => {}), [episodeKey, user.uid])
  useEffect(() => onValue(ref(db, `animeReels/${episodeKey}/comments`), (snapshot) => setComments(Object.values(snapshot.val() || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))), () => {}), [episodeKey])
  useEffect(() => onValue(ref(db, `saved/${user.uid}/anime_${episodeKey}`), (snapshot) => setSaved(Boolean(snapshot.val())), () => {}), [episodeKey, user.uid])

  useEffect(() => {
    if (!details) return undefined
    let alive = true
    setStreams([])
    setSourceId('')
    setProviderError('')
    setResolving(true)
    NuvioApi.fetchStreams({ tmdbId: id, imdbId: details.external_ids?.imdb_id || '', mediaType, season, episode, audio })
      .then((result) => {
        if (!alive) return
        if (result.ok && result.streams.length) { setStreams(result.streams); setSourceId(result.streams[0].id) }
        else setProviderError(result.reason || 'No provider source is available for this episode.')
      })
      .catch((error) => { if (alive) setProviderError(error.message || 'The Nuvio provider is unavailable.') })
      .finally(() => { if (alive) setResolving(false) })
    return () => { alive = false }
  }, [details, id, mediaType, season, episode, audio, retry])

  function changeEpisode(nextSeason, nextEpisode) {
    navigate(`/reels/anime/${mediaType}/${id}/${Math.max(1, Number(nextSeason) || 1)}/${Math.max(1, Number(nextEpisode) || 1)}`)
  }
  async function toggleLike() {
    const path = `animeReels/${episodeKey}/likes/${user.uid}`
    try { if (liked) await remove(ref(db, path)); else await set(ref(db, path), true) }
    catch { setActionMessage('Firebase rules must allow the animeReels like path before this reaction can be saved.') }
  }
  async function toggleSave() {
    const path = `saved/${user.uid}/anime_${episodeKey}`
    const record = { id: episodeKey, type: 'anime-episode', tmdbId: id, mediaType, season, episode, title, posterPath: details?.poster_path || '', savedAt: Date.now() }
    try { if (saved) await remove(ref(db, path)); else await set(ref(db, path), record) }
    catch { setActionMessage('Firebase denied this save. Check the saved-item rules and try again.') }
  }
  async function shareEpisode() {
    const url = `${window.location.origin}${route}`
    try {
      if (navigator.share) await navigator.share({ title: `${title} · ${episodeLabel}`, text: 'Watch this episode in Midnight Anime Social.', url })
      else { await navigator.clipboard.writeText(url); setActionMessage('Episode link copied.') }
    } catch (error) { if (error?.name !== 'AbortError') setActionMessage('Could not share this episode right now.') }
  }
  async function submitComment(event) {
    event.preventDefault()
    const text = comment.trim()
    if (!text) return
    setActionMessage('')
    try {
      const entry = push(ref(db, `animeReels/${episodeKey}/comments`))
      await set(entry, { id: entry.key, uid: user.uid, username: profile?.username || user.displayName || 'fan', text: text.slice(0, 500), createdAt: Date.now() })
      setComment('')
    } catch { setActionMessage('Firebase denied this comment. Check the animeReels interaction rules and try again.') }
  }

  return <section className="anime-reel-page">
    <header className="anime-reel-page-head"><Link to="/anime" className="anime-reel-back"><ArrowLeft size={16}/> Anime</Link><div><p className="eyebrow">MIDNIGHT ANIME · PORTRAIT PLAYER</p><h1>{title}</h1></div><Link className="anime-home-link" to="/reels">Social Reels</Link></header>
    {detailsError && <div className="anime-error"><Clapperboard/><p>{detailsError}</p><span>Check the server-side TMDB_API_KEY setting.</span></div>}
    {!details && !detailsError && <div className="anime-loading">Loading title artwork and episode details…</div>}
    {details && <>
      <div className="anime-reel-layout">
        <div className="anime-reel-stage" style={backdrop ? { backgroundImage: `linear-gradient(180deg,rgba(6,6,9,.12),rgba(6,6,9,.78)),url(${backdrop})` } : undefined}>
          <div className="anime-reel-frame">
            {source ? <StreamPlayer key={`${source.id}-${retry}`} source={source} poster={poster} onRetry={() => setRetry((value) => value + 1)}/> : <div className="anime-provider-wait">{resolving ? <><span className="spinner"/><b>Finding a provider source…</b><small>{title} · {episodeLabel}</small></> : <><Clapperboard size={26}/><b>Episode source unavailable</b><small>{providerError || 'Try another audio track or retry in a moment.'}</small><button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry provider</button><a href="https://www.midnightanime.bond/" target="_blank" rel="noreferrer">Open Midnight Anime</a></>}</div>}
            <div className="anime-reel-overlay"><div className="anime-reel-title"><span>TMDB · {mediaType === 'movie' ? 'FILM' : 'SERIES'}</span><b>{title}</b><small>{episodeLabel}</small></div><div className="anime-reel-actions"><button className={liked ? 'is-liked' : ''} type="button" onClick={toggleLike} aria-label={liked ? 'Unlike episode' : 'Like episode'}><Heart fill={liked ? 'currentColor' : 'none'}/><span>{likes.toLocaleString()}</span></button><button type="button" onClick={() => setShowComments((value) => !value)} aria-label="Show episode comments"><MessageCircle/><span>{comments.length.toLocaleString()}</span></button><button type="button" onClick={shareEpisode} aria-label="Share episode"><Send/><span>Share</span></button><button className={saved ? 'is-saved' : ''} type="button" onClick={toggleSave} aria-label={saved ? 'Unsave episode' : 'Save episode'}>{saved ? <Check/> : <Bookmark/>}<span>{saved ? 'Saved' : 'Save'}</span></button></div></div>
          </div>
        </div>
        <aside className="anime-reel-sidebar">
          <div className="anime-title-card">{poster && <img src={poster} alt={`${title} poster`}/>}<div><span className="eyebrow">NOW PLAYING</span><h2>{title}</h2><p>{details.overview || 'Choose an episode and enjoy the story.'}</p></div></div>
          {mediaType !== 'movie' && <div className="anime-episode-chooser"><label>Season<span className="select-wrap"><select value={selectedSeason?.season_number || season} onChange={(event) => changeEpisode(event.target.value, 1)}>{seasonList.map((item) => <option key={item.season_number} value={item.season_number}>{item.name || `Season ${item.season_number}`}</option>)}</select><ChevronDown size={15}/></span></label><label>Episode<span className="select-wrap"><select value={Math.min(episode, episodeCount || 1)} onChange={(event) => changeEpisode(season, event.target.value)}>{Array.from({ length: Math.max(1, episodeCount) }, (_, index) => <option key={index + 1} value={index + 1}>Episode {index + 1}</option>)}</select><ChevronDown size={15}/></span></label></div>}
          <label className="anime-audio-select">Audio track<span className="select-wrap"><select value={audio} onChange={(event) => setAudio(event.target.value)}><option value="sub">Subtitled</option><option value="dub">Dubbed</option><option value="hindi">Hindi</option></select><ChevronDown size={15}/></span></label>
          {streams.length > 1 && <label className="anime-audio-select">Provider source<span className="select-wrap"><select value={source?.id || ''} onChange={(event) => setSourceId(event.target.value)}>{streams.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quality}</option>)}</select><ChevronDown size={15}/></span></label>}
          <div className="anime-provider-note"><Volume2 size={15}/><span>Playback resolves through the Midnight Anime provider. Anime video is streamed, never stored in social R2.</span></div>
          <p className="tmdb-credit">Title artwork and metadata: TMDB.</p>
          <a className="anime-external-link" href="https://www.midnightanime.bond/" target="_blank" rel="noreferrer">Open Midnight Anime site ↗</a>
        </aside>
      </div>
      {actionMessage && <p className="provider-error-note" role="status">{actionMessage}</p>}
      {showComments && <section className="anime-comments"><header><b>Episode comments · {comments.length}</b><span>Keep it kind and spoiler-aware.</span></header><div className="anime-comment-list">{comments.length ? comments.map((item) => <p key={item.id}><b>@{item.username || 'fan'}</b> {item.text}</p>) : <p className="muted tiny">Be the first to share a thought.</p>}</div><form onSubmit={submitComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add an episode comment…" maxLength={500}/><button disabled={!comment.trim()}>Post</button></form></section>}
    </>}
  </section>
}
