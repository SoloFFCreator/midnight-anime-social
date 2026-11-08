import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { onValue, ref } from 'firebase/database'
import { auth, db } from './firebase'

export function BrandMark() {
  return <Link to="/" className="brand" aria-label="Midnight Anime Social home"><span className="brand-icon"><img src="/midnight-anime-logo.svg" alt="" /></span><span>Midnight<span className="brand-accent">Anime</span><small> SOCIAL</small></span></Link>
}

export async function getPrivateMediaUrl(key, user = auth.currentUser) {
  const base = import.meta.env.VITE_R2_WORKER_URL
  if (!key || !base || !user) return ''
  const token = await user.getIdToken()
  const response = await fetch(`${base}/media-url?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) return ''
  const body = await response.json()
  return body?.url || ''
}

export function Avatar({ src, mediaKey, name = '?', size = 'md', ring = false }) {
  const [privateSrc, setPrivateSrc] = useState('')
  useEffect(() => {
    let active = true
    setPrivateSrc('')
    if (mediaKey) getPrivateMediaUrl(mediaKey).then((url) => { if (active) setPrivateSrc(url) }).catch(() => {})
    return () => { active = false }
  }, [mediaKey])
  const image = privateSrc || src
  return <div className={`avatar avatar-${size} ${ring ? 'avatar-ring' : ''}`}>{image ? <img src={image} alt={name} loading="lazy"/> : <span>{name?.slice(0, 1)?.toUpperCase() || '✦'}</span>}</div>
}

export function VerifiedBadge({ uid, profile, size = 16 }) {
  const [followers, setFollowers] = useState(0)
  const gold = profile?.officialBadge === 'gold'
  useEffect(() => {
    setFollowers(0)
    if (!uid || gold) return
    return onValue(ref(db, `followers/${uid}`), (snapshot) => setFollowers(Object.keys(snapshot.val() || {}).length), () => setFollowers(0))
  }, [uid, gold])
  if (gold) return <img className="verified-badge" width={size} height={size} src="/badges/verified-gold.png" alt="Official Midnight Anime account" title="Official Midnight Anime account" />
  if (followers >= 1000) return <img className="verified-badge" width={size} height={size} src="/badges/verified-blue.png" alt="Verified fan account — 1,000+ followers" title="Verified community account" />
  return null
}

export function PageHeading({ eyebrow, title, sub }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
}

export function EmptyState({ icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>
}
