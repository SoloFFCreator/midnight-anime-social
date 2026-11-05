import { Link } from 'react-router-dom'

export function BrandMark() {
  return <Link to="/" className="brand"><span className="brand-icon">夜</span><span>Midnight<span className="brand-accent">Anime</span><small> SOCIAL</small></span></Link>
}

export function Avatar({ src, name = '?', size = 'md', ring = false }) {
  return <div className={`avatar avatar-${size} ${ring ? 'avatar-ring' : ''}`}>{src ? <img src={src} alt={name} /> : <span>{name?.slice(0, 1)?.toUpperCase() || '✦'}</span>}</div>
}

export function PageHeading({ eyebrow, title, sub }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
}

export function EmptyState({ icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>
}
