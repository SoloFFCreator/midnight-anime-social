import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { onValue, push, ref, remove, set, update } from 'firebase/database'
import { db } from './firebase'
import { Avatar, EmptyState, PageHeading, VerifiedBadge, getPrivateMediaUrl } from './ui.jsx'
import { Bookmark, Clapperboard, Heart, MessageCircle, Plus, Send, Volume2, VolumeX, X } from 'lucide-react'

export function ReelsPage({ user, profile, profiles, reels }) {
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('reel')
  const [showUpload, setShowUpload] = useState(false)
  useEffect(() => {
    if (!requestedId) return
    const timer = window.setTimeout(() => document.getElementById(`reel-${requestedId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
    return () => window.clearTimeout(timer)
  }, [requestedId, reels.length])
  return <section className="reels-page">
    <div className="reels-heading"><div><PageHeading eyebrow="SHORT-FORM FAN MOMENTS" title="Reels" sub="A quick scroll through your fandom."/></div><button className="primary-button reel-create-button" onClick={() => setShowUpload(true)}><Plus size={16}/> Create Reel</button></div>
    {reels.length ? <div className="reels-feed">{reels.map((item) => <ReelCard key={item.id} reel={item} user={user} profile={profile} profiles={profiles}/>)}</div> : <div className="reels-empty"><EmptyState icon={<Clapperboard/>} title="The Reel is yours to make" text="Share a short video from your anime world. Your clips stay in private R2 storage and stream through short-lived links."/><button className="primary-button" onClick={() => setShowUpload(true)}><Plus size={16}/> Upload your first Reel</button></div>}
    {showUpload && <ReelUploadModal user={user} profile={profile} onClose={() => setShowUpload(false)}/>}
  </section>
}

function ReelCard({ reel, user, profile, profiles }) {
  const [src, setSrc] = useState(reel.mediaUrl || '')
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [following, setFollowing] = useState(false)
  const author = profiles.find((item) => item.uid === reel.authorId) || {}

  useEffect(() => {
    let alive = true
    if (reel.mediaKey) getPrivateMediaUrl(reel.mediaKey, user).then((url) => { if (alive && url) setSrc(url) }).catch(() => {})
    return () => { alive = false }
  }, [reel.mediaKey, reel.mediaUrl, user])
  useEffect(() => onValue(ref(db, `reels/${reel.id}/likes`), (s) => {
    const likes = s.val() || {}
    setLiked(Boolean(likes[user.uid]))
    setLikeCount(Object.keys(likes).length)
  }, () => {}), [reel.id, user.uid])
  useEffect(() => onValue(ref(db, `reels/${reel.id}/comments`), (s) => setComments(Object.values(s.val() || {}).sort((a, b) => a.createdAt - b.createdAt)), () => {}), [reel.id])
  useEffect(() => onValue(ref(db, `saved/${user.uid}/reel_${reel.id}`), (s) => setSaved(Boolean(s.val())), () => {}), [reel.id, user.uid])
  useEffect(() => { if (!reel.authorId || reel.authorId === user.uid) return; return onValue(ref(db, `follows/${user.uid}/${reel.authorId}`), (s) => setFollowing(Boolean(s.val())), () => {}) }, [reel.authorId, user.uid])
  useEffect(() => {
    const el = document.getElementById(`video-${reel.id}`)
    if (!el || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
      else { el.pause(); setPlaying(false) }
    }, { threshold: 0.55 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [reel.id, src])

  async function toggleLike() {
    const path = `reels/${reel.id}/likes/${user.uid}`
    try { if (liked) await remove(ref(db, path)); else await set(ref(db, path), true) } catch { /* RTDB rules report unavailable interactions without breaking playback */ }
  }
  async function toggleFollow(event) {
    event.stopPropagation()
    if (!reel.authorId || reel.authorId === user.uid) return
    const path = `follows/${user.uid}/${reel.authorId}`
    try {
      const changes = {}
      changes[path] = following ? null : true
      changes[`followers/${reel.authorId}/${user.uid}`] = following ? null : true
      await update(ref(db), changes)
    } catch { /* the follow button stays usable when rules are applied */ }
  }
  async function toggleSave() {
    const path = `saved/${user.uid}/reel_${reel.id}`
    try { if (saved) await remove(ref(db, path)); else await set(ref(db, path), { id: reel.id, type: 'reel', savedAt: Date.now() }) } catch { /* no-op if the user needs updated database rules */ }
  }
  async function postComment(event) {
    event.preventDefault()
    const text = comment.trim()
    if (!text) return
    try {
      const entry = push(ref(db, `reels/${reel.id}/comments`))
      await set(entry, { id: entry.key, uid: user.uid, username: profile?.username || user.displayName || 'fan', text, createdAt: Date.now() })
      setComment('')
    } catch { /* keep input in place if writes are disabled */ }
  }
  async function share() {
    const url = `${window.location.origin}/reels?reel=${encodeURIComponent(reel.id)}`
    try {
      if (navigator.share) await navigator.share({ title: `${reel.username || author.username || 'Fan'} on Midnight Anime`, text: reel.caption || 'Watch this Reel', url })
      else { await navigator.clipboard.writeText(url); window.alert('Reel link copied.') }
    } catch (error) { if (error?.name !== 'AbortError') window.alert('Could not share this Reel right now.') }
  }
  const video = document.getElementById(`video-${reel.id}`)
  return <article className="reel-card" id={`reel-${reel.id}`}>
    <div className="reel-video-wrap" onClick={() => { if (!video) return; if (video.paused) { video.play(); setPlaying(true) } else { video.pause(); setPlaying(false) } }}>
      {src ? <video id={`video-${reel.id}`} src={src} autoPlay muted={muted} loop playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}/> : <div className="reel-media-loading"><Clapperboard/><span>{reel.mediaKey ? 'Loading private video…' : 'Reel video unavailable'}</span></div>}
      <div className="reel-scrim"/>
      {!playing && src && <span className="reel-play-cue">▶</span>}
      <button className="reel-sound" onClick={(e) => { e.stopPropagation(); setMuted((v) => !v) }} aria-label={muted ? 'Unmute Reel' : 'Mute Reel'}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
      <div className="reel-author"><Avatar src={author.avatar || reel.avatar} mediaKey={author.avatarKey || reel.avatarKey} name={author.displayName || reel.authorName} size="sm"/><div><b>{reel.username || author.username || 'animefan'} <VerifiedBadge uid={reel.authorId} profile={author}/></b><span>{reel.authorName || author.displayName || 'Midnight fan'}</span></div>{reel.authorId !== user.uid && <button className={`reel-follow ${following ? 'following' : ''}`} onClick={toggleFollow}>{following ? 'Following' : 'Follow'}</button>}</div>
      <p className="reel-caption">{reel.caption || 'A moment from my anime world.'}</p>
      <span className="reel-audio-label">♫ Original audio · Midnight Anime</span>
    </div>
    <div className="reel-actions">
      <button className={liked ? 'is-liked' : ''} onClick={toggleLike} aria-label={liked ? 'Unlike Reel' : 'Like Reel'}><Heart fill={liked ? 'currentColor' : 'none'}/><span>{likeCount.toLocaleString()}</span></button>
      <button onClick={() => setShowComments((v) => !v)} aria-label="Show comments"><MessageCircle/><span>{comments.length.toLocaleString()}</span></button>
      <button onClick={share} aria-label="Share Reel"><Send/><span>Share</span></button>
      <button className={saved ? 'is-saved' : ''} onClick={toggleSave} aria-label={saved ? 'Unsave Reel' : 'Save Reel'}><Bookmark fill={saved ? 'currentColor' : 'none'}/><span>{saved ? 'Saved' : 'Save'}</span></button>
    </div>
    {showComments && <div className="reel-comments"><div className="reel-comments-head"><b>Comments · {comments.length}</b><button onClick={() => setShowComments(false)} aria-label="Close comments"><X size={17}/></button></div><div className="reel-comment-list">{comments.length ? comments.map((item) => <p key={item.id}><b>@{item.username || 'fan'}</b> {item.text}</p>) : <p className="muted tiny">Be the first to comment.</p>}</div><form onSubmit={postComment}><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" maxLength={500}/><button disabled={!comment.trim()}>Post</button></form></div>}
  </article>
}


function ReelUploadModal({ user, profile, onClose }) {
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function upload(event) {
    event.preventDefault()
    if (!file || !file.type.startsWith('video/')) return setError('Choose a video for your Reel.')
    setBusy(true); setError('')
    try {
      const base = import.meta.env.VITE_R2_WORKER_URL
      if (!base) throw new Error('Private R2 media service is not configured. Set VITE_R2_WORKER_URL for the production app.')
      setProgress('Preparing a secure upload…')
      const token = await user.getIdToken()
      const response = await fetch(`${base}/upload-url`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }) })
      const signed = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(signed.error || `R2 Worker returned ${response.status}.`)
      setProgress('Uploading video to private R2…')
      const put = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!put.ok) throw new Error(`Video upload failed (HTTP ${put.status}). Check the bucket CORS policy and try again.`)
      setProgress('Publishing your Reel…')
      const node = push(ref(db, 'reels'))
      await set(node, { id: node.key, authorId: user.uid, authorName: profile.displayName || user.displayName || 'Midnight fan', username: profile.username || 'animefan', avatar: profile.avatar || '', avatarKey: profile.avatarKey || '', mediaKey: signed.key, mediaUrl: '', mediaType: 'video', caption: caption.trim().slice(0, 1200), createdAt: Date.now(), visibility: 'public' })
      onClose()
    } catch (e) { setError(e?.message || 'Could not publish this Reel.') }
    finally { setBusy(false); setProgress('') }
  }

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}><form className="reel-upload-modal" onSubmit={upload}>
    <header className="reel-upload-head"><div><p className="eyebrow">SHARE A SHORT MOMENT</p><h2>Create a Reel</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy}><X/></button></header>
    <label className={`reel-upload-zone ${preview ? 'has-preview' : ''}`}>{preview ? <video src={preview} controls muted playsInline/> : <><Clapperboard size={28}/><b>Choose a video</b><span>MP4, WebM or QuickTime · private R2 storage</span></>}<input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" onChange={(e) => { setFile(e.target.files?.[0] || null); setError('') }} hidden/></label>
    <textarea className="caption-input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" maxLength={1200}/>
    {error && <p className="auth-error" role="alert">{error}</p>}{progress && <p className="upload-progress">{progress}</p>}
    <footer className="reel-upload-foot"><span className="muted tiny">Your video stays private in Cloudflare R2.</span><button className="primary-button" disabled={busy || !file}>{busy ? 'Publishing…' : 'Share Reel'}</button></footer>
  </form></div>
}
