import { useEffect, useState } from 'react'
import { ref, remove, runTransaction } from 'firebase/database'
import { db } from './firebase'
import { useSession } from './session'
import { Avatar, getPrivateMediaUrl, uploadPrivateMedia } from './ui.jsx'
import { Camera, X } from 'lucide-react'

const normalizeHandle = (value) => value.trim().replace(/^@+/, '').toLowerCase().replace(/^[._]+|[._]+$/g, '')
const validHandle = (value) => /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/.test(value)

export default function ProfileEditor({ user, profile, onClose }) {
  const { saveProfile } = useSession()
  const [displayName, setDisplayName] = useState(profile.displayName || '')
  const [handle, setHandle] = useState(profile.username || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [website, setWebsite] = useState(profile.website || '')
  const [pronouns, setPronouns] = useState(profile.pronouns || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState('')
  const [currentBanner, setCurrentBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (!avatarFile) { setPreview(''); return }
    const url = URL.createObjectURL(avatarFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  useEffect(() => {
    if (!bannerFile) { setBannerPreview(''); return }
    const url = URL.createObjectURL(bannerFile)
    setBannerPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [bannerFile])

  useEffect(() => {
    let active = true
    setCurrentBanner('')
    if (profile.bannerKey) getPrivateMediaUrl(profile.bannerKey, user).then((url) => { if (active) setCurrentBanner(url) }).catch(() => {})
    return () => { active = false }
  }, [profile.bannerKey, user])

  async function uploadAvatar(file) {
    return uploadPrivateMedia(file, user, setProgress)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    const cleanHandle = normalizeHandle(handle)
    const oldHandle = normalizeHandle(profile.username || '')
    if (!displayName.trim()) return setError('Add a display name.')
    if (!validHandle(cleanHandle)) return setError('Your @handle must be 3–30 characters, start and end with a letter or number, and use only letters, numbers, dots or underscores.')
    setBusy(true)
    let claimedNewHandle = false
    let profileSaved = false
    try {
      const claim = await runTransaction(ref(db, `handleIndex/${cleanHandle}`), (value) => value == null || value === user.uid ? user.uid : undefined)
      if (!claim.committed || claim.snapshot?.val() !== user.uid) throw new Error('HANDLE_TAKEN')
      claimedNewHandle = cleanHandle !== oldHandle
      let avatarKey = profile.avatarKey || ''
      if (avatarFile) { avatarKey = await uploadAvatar(avatarFile) }
      let bannerKey = profile.bannerKey || ''
      if (bannerFile) { setProgress('Uploading profile banner…'); bannerKey = await uploadPrivateMedia(bannerFile, user, setProgress) }
      setProgress('Saving profile…')
      const patch = { displayName: displayName.trim(), username: cleanHandle, bio: bio.trim().slice(0, 220), website: website.trim().slice(0, 200), pronouns: pronouns.trim().slice(0, 40), ...(avatarKey ? { avatarKey } : {}), ...(bannerKey ? { bannerKey } : {}), updatedAt: Date.now() }
      await saveProfile(patch)
      profileSaved = true
      if (cleanHandle !== oldHandle && oldHandle) await runTransaction(ref(db, `handleIndex/${oldHandle}`), (value) => value === user.uid ? null : value).catch(() => {})
      onClose()
    } catch (cause) {
      if (claimedNewHandle && !profileSaved) await runTransaction(ref(db, `handleIndex/${cleanHandle}`), (value) => value === user.uid ? null : value).catch(() => {})
      const detail = `${cause?.code || ''} ${cause?.message || ''}`
      if (/HANDLE_TAKEN/.test(detail)) setError('That @handle is already in use. Try another spelling; handles are unique.')
      else if (/PERMISSION_DENIED|permission.denied/i.test(detail)) setError('Firebase denied the profile or handle change. Apply the reviewed database.rules.json to the mid-night-anime Realtime Database in Firebase Console, then retry.')
      else setError(cause?.message || 'Could not save your profile.')
    } finally { setBusy(false); setProgress('') }
  }

  return <div className="modal-backdrop profile-editor-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
    <form className="profile-edit-modal" onSubmit={submit}>
      <header className="profile-edit-head"><div><p className="eyebrow">YOUR PROFILE</p><h2>Edit profile</h2></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close profile editor"><X/></button></header>
      <label className="profile-photo-picker"><span className="profile-photo-preview">{preview ? <span className="avatar avatar-profile"><img src={preview} alt="Selected profile"/></span> : <Avatar src={profile.avatar} mediaKey={profile.avatarKey} name={displayName} size="profile"/>}</span><span><b>Profile photo</b><small>Upload a photo · JPG, PNG or WebP</small></span><span className="profile-photo-action"><Camera size={16}/> Change</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} hidden /></label>
      <label className="profile-banner-picker"><span className="profile-banner-preview">{(bannerPreview || currentBanner) ? <img src={bannerPreview || currentBanner} alt="Profile banner preview"/> : <span className="profile-banner-placeholder">MIDNIGHT ANIME SOCIAL</span>}</span><span className="profile-banner-copy"><b>Profile banner</b><small>Optional · JPG, PNG, WebP or AVIF</small></span><span className="profile-photo-action"><Camera size={16}/> {bannerFile || currentBanner ? 'Change' : 'Add banner'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} hidden /></label>
      <div className="profile-edit-fields">
        <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required /></label>
        <label>Username<span className="profile-handle-input"><i>@</i><input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck="false" required /></span><small>Unique username · 3–30 characters</small></label>
        <label>Bio<textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={220} placeholder="Tell your people a little about you…"/><small>{bio.length}/220</small></label>
        <div className="profile-field-pair"><label>Pronouns<input value={pronouns} onChange={(e) => setPronouns(e.target.value)} maxLength={40} placeholder="Optional" /></label><label>Website<input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} placeholder="https://…" /></label></div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}{progress && <p className="upload-progress">{progress}</p>}
      <footer className="profile-edit-foot"><span className="muted tiny">Photos and banners use private AWS S3/R2 storage.</span><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  </div>
}
