import { useCallback, useEffect, useMemo, useState } from 'react'
import { Disc3, ListMusic, LoaderCircle, Music2, Plus, Search, ShieldAlert, X } from 'lucide-react'
import { auth } from './firebase'

async function catalogRequest(path, options = {}) {
  const token = await auth.currentUser?.getIdToken()
  const response = await fetch(path, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
  return body
}

export default function DistributionCatalog() {
  const [releases, setReleases] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [playlistName, setPlaylistName] = useState('')
  const [selectedPlaylist, setSelectedPlaylist] = useState('')
  const [activePlaylist, setActivePlaylist] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadPlaylists = useCallback(async () => {
    if (!auth.currentUser) return
    const result = await catalogRequest('/api/distribution/playlists')
    setPlaylists(result.playlists || [])
    setSelectedPlaylist((current) => result.playlists.some((item) => item.id === current) ? current : result.playlists[0]?.id || '')
  }, [])

  const loadCatalog = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const result = await catalogRequest(`/api/distribution/catalog?${params}`)
      setReleases(result.releases || [])
      if (result.geoLimitedReleasesRequireConfiguredTrustedProvider) setNotice('Territory-limited releases remain unavailable until trusted country resolution is enabled by the operator.')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => { loadCatalog(); loadPlaylists().catch((e) => setError(e.message)) }, [loadCatalog, loadPlaylists])
  const chosen = useMemo(() => playlists.find((item) => item.id === activePlaylist), [playlists, activePlaylist])
  const visible = useMemo(() => chosen ? releases.filter((release) => chosen.releaseIds?.includes(release.id)) : releases, [chosen, releases])

  async function createPlaylist(e) {
    e.preventDefault()
    if (playlistName.trim().length < 2) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await catalogRequest('/api/distribution/playlists', { method: 'POST', body: JSON.stringify({ operation: 'create', name: playlistName }) })
      setPlaylists((current) => [...current, result.playlist])
      setSelectedPlaylist(result.playlist.id)
      setActivePlaylist(result.playlist.id)
      setPlaylistName('')
      setNotice('Playlist created for your account.')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function addToPlaylist(releaseId) {
    if (!selectedPlaylist) { setError('Create or select a playlist first.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await catalogRequest('/api/distribution/playlists', { method: 'POST', body: JSON.stringify({ operation: 'add', playlistId: selectedPlaylist, releaseId }) })
      setPlaylists((current) => current.map((item) => item.id === result.playlist.id ? result.playlist : item))
      setNotice('Release added to your playlist.')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function removeFromPlaylist(releaseId) {
    if (!chosen) return
    setBusy(true); setError('')
    try {
      const result = await catalogRequest('/api/distribution/playlists', { method: 'POST', body: JSON.stringify({ operation: 'remove', playlistId: chosen.id, releaseId }) })
      setPlaylists((current) => current.map((item) => item.id === result.playlist.id ? result.playlist : item))
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <section className="music-catalog">
    <header className="music-head"><div><span className="dist-eyebrow">MIDNIGHT SOCIAL · MUSIC</span><h1>Music catalogue</h1><p>Officially received, reviewed and territory-cleared releases.</p></div><Disc3 size={30}/></header>
    {error && <div className="dist-alert error"><ShieldAlert size={17}/>{error}</div>}{notice && <div className="dist-alert"><ShieldAlert size={17}/>{notice}</div>}
    <section className="music-tools"><form className="music-search" onSubmit={(e) => { e.preventDefault(); setSearch(query) }}><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artists, releases, genres"/><button type="submit">Search</button></form><div className="music-playlists"><ListMusic size={18}/><select value={activePlaylist} onChange={(e) => setActivePlaylist(e.target.value)} aria-label="Choose playlist"><option value="">All available releases</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select><select value={selectedPlaylist} onChange={(e) => setSelectedPlaylist(e.target.value)} aria-label="Choose destination playlist"><option value="">Add to playlist…</option>{playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select><form onSubmit={createPlaylist}><input value={playlistName} onChange={(e) => setPlaylistName(e.target.value)} placeholder="New playlist" maxLength={80}/><button type="submit" disabled={busy || playlistName.trim().length < 2}><Plus size={15}/></button></form></div></section>
    <div className="music-results-head"><h2>{chosen ? chosen.name : 'Discover music'}</h2><span>{visible.length} releases</span></div>
    {loading ? <p className="music-empty"><LoaderCircle className="spin"/>Loading catalogue…</p> : visible.length ? <div className="music-release-list">{visible.map((release) => <article className="music-release" key={release.id}><div className="music-cover">{release.artwork?.url ? <img src={release.artwork.url} alt={`${release.title} artwork`} loading="lazy"/> : <Disc3 size={34}/>}</div><div className="music-release-main"><div className="music-release-title"><div><h3>{release.title}</h3><p>{release.artists.join(', ')}</p></div><span>{release.releaseType}</span></div><div className="music-tags">{release.label && <small>{release.label}</small>}{release.genres.map((genre) => <small key={genre}>{genre}</small>)}<small>{release.releaseDate}</small></div>{release.tracks.map((track, index) => <div className="music-track" key={`${track.resourceReference || 'track'}-${index}`}><span><Music2 size={14}/>{track.resourceReference || `Track ${index + 1}`}</span><audio controls preload="none" src={track.url}>Your browser does not support audio playback.</audio></div>)}<div className="music-release-actions"><button onClick={() => addToPlaylist(release.id)} disabled={busy || !selectedPlaylist}><Plus size={14}/>Add to playlist</button>{chosen && <button onClick={() => removeFromPlaylist(release.id)} disabled={busy}><X size={14}/>Remove from playlist</button>}</div></div></article>)}</div> : <div className="music-empty"><Disc3 size={27}/><p>{chosen ? 'This playlist has no currently available releases.' : 'No releases are available for your search, date or territory.'}</p><small>Unreviewed, future-dated, taken-down, and territory-ineligible releases are not shown.</small></div>}
  </section>
}
