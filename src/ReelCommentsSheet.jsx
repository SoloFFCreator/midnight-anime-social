import { useEffect } from 'react'
import { Send, X } from 'lucide-react'

function timeLabel(value) {
  const then = Number(value || 0)
  if (!then) return 'now'
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

export default function ReelCommentsSheet({ open, comments = [], caption = '', profile, username = 'you', value, onChange, onSubmit, onClose, error = '', title = 'Comments' }) {
  useEffect(() => {
    if (!open) return undefined
    const before = document.body.style.overflow
    const onKey = (event) => { if (event.key === 'Escape') onClose?.() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  const initials = (name) => String(name || 'f').trim().slice(0, 1).toUpperCase()
  return <div className="reel-comments-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
    <section className="reel-comments-sheet" role="dialog" aria-modal="true" aria-label={`${title} for Reel`}>
      <div className="reel-comments-handle" aria-hidden="true"/>
      <header className="reel-comments-header"><div><h2>{title}</h2><span>{comments.length.toLocaleString()} comments</span></div><button type="button" onClick={onClose} aria-label="Close comments"><X size={20}/></button></header>
      <div className="reel-comment-list" aria-live="polite">
        {caption && <article className="reel-comment-row reel-caption-comment"><div className="reel-comment-avatar">M</div><div className="reel-comment-copy"><p><b>midnightanime</b> {caption}</p><small>Creator · Reel caption</small></div></article>}
        {comments.map((item) => <article className="reel-comment-row" key={item.id || `${item.uid}-${item.createdAt}`}><div className="reel-comment-avatar">{initials(item.username)}</div><div className="reel-comment-copy"><p><b>@{item.username || 'fan'}</b> {item.text}</p><small>{timeLabel(item.createdAt)}{item.likes ? ` · ${item.likes} likes` : ''}</small></div><button type="button" className="reel-comment-like" aria-label="Like comment">♡</button></article>)}
        {!caption && comments.length === 0 && <div className="reel-comments-empty"><b>No comments yet</b><span>Start the conversation.</span></div>}
      </div>
      {error && <p className="reel-comments-error" role="alert">{error}</p>}
      <form className="reel-comment-compose" onSubmit={onSubmit}><div className="reel-compose-avatar">{initials(profile?.displayName || username)}</div><input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder="Add a comment…" aria-label="Add a comment" maxLength={500}/><button type="submit" disabled={!String(value || '').trim()} aria-label="Post comment"><Send size={17}/></button></form>
    </section>
  </div>
}
