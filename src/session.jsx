import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, updateProfile } from 'firebase/auth'
import { get, ref, remove, runTransaction, set, update } from 'firebase/database'
import { auth, db } from './firebase'

const Context = createContext(null)
export const useSession = () => useContext(Context)
const OFFICIAL_EMAIL = 'mallaprabesh141@gmail.com'
const normalizeHandle = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^[._]+/, '').slice(0, 26)

async function claimHandle(uid, candidate) {
  const name = normalizeHandle(candidate)
  if (name.length < 3) return ''
  const result = await runTransaction(ref(db, `handleIndex/${name}`), (value) => value == null || value === uid ? uid : undefined)
  return result.committed ? name : ''
}

async function uniqueHandle(uid, candidate) {
  const base = normalizeHandle(candidate) || 'animefan'
  const found = await claimHandle(uid, base)
  if (found) return found
  const suffix = uid.slice(-5).toLowerCase()
  return (await claimHandle(uid, `${base.slice(0, 24)}${suffix}`)) || `${base.slice(0, 24)}${suffix}`
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      if (!active) return
      setUser(next)
      setLoading(true)
      if (!next) { setProfile(null); setLoading(false); return }
      const official = next.email?.toLowerCase() === OFFICIAL_EMAIL && next.emailVerified
      const base = normalizeHandle(next.displayName || next.email?.split('@')[0] || 'animefan') || 'animefan'
      const fallbackProfile = {
        uid: next.uid,
        username: base.length < 3 ? `${base}fan` : base,
        displayName: next.displayName || next.email?.split('@')[0] || 'Anime fan',
        avatar: next.photoURL || '',
        bio: '',
        website: '',
        pronouns: '',
        ...(official ? { officialBadge: 'gold' } : {}),
        createdAt: Date.now(),
      }
      try {
        const snapshot = await get(ref(db, `profiles/${next.uid}`))
        const current = snapshot.val()
        let nextProfile = current ? { ...fallbackProfile, ...current, uid: next.uid } : fallbackProfile
        try {
          const claimed = await claimHandle(next.uid, nextProfile.username)
          if (!claimed && current) console.warn('Handle is already claimed; edit your @handle to claim an available name.')
          else if (claimed) nextProfile.username = claimed
        } catch (handleError) {
          console.warn('Handle index is not available yet:', handleError.code || handleError.message)
        }
        if (official) nextProfile.officialBadge = 'gold'
        if (!current) {
          try { await set(ref(db, `profiles/${next.uid}`), nextProfile) }
          catch (writeError) { console.warn('Profile bootstrap was deferred:', writeError.code || writeError.message) }
        } else if (official && current.officialBadge !== 'gold') {
          try { await update(ref(db, `profiles/${next.uid}`), { officialBadge: 'gold' }) }
          catch (writeError) { console.warn('Official badge sync was deferred:', writeError.code || writeError.message) }
        } else if (!official && current.officialBadge === 'gold') {
          try { await remove(ref(db, `profiles/${next.uid}/officialBadge`)); delete nextProfile.officialBadge }
          catch (writeError) { console.warn('Official badge removal was deferred:', writeError.code || writeError.message) }
        }
        if (active) setProfile(nextProfile)
      } catch (readError) {
        console.warn('Profile could not be loaded; continuing with the signed-in account:', readError.code || readError.message)
        if (active) setProfile(fallbackProfile)
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false; unsubscribe() }
  }, [])

  async function saveProfile(patch) {
    if (!user) throw new Error('Sign in first')
    const next = { ...profile, ...patch, uid: user.uid, updatedAt: Date.now() }
    await update(ref(db, `profiles/${user.uid}`), patch)
    if (patch.displayName && patch.displayName !== user.displayName) {
      try { await updateProfile(user, { displayName: patch.displayName }) }
      catch (error) { console.warn('Auth display name sync was deferred:', error.code || error.message) }
    }
    setProfile(next)
    return next
  }

  const value = useMemo(() => ({ user, profile, loading, saveProfile }), [user, profile, loading])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
