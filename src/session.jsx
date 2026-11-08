import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, updateProfile } from 'firebase/auth'
import { get, onValue, ref, remove, runTransaction, set, update } from 'firebase/database'
import { auth, db } from './firebase'

const Context = createContext(null)
export const useSession = () => useContext(Context)
const OFFICIAL_EMAIL = 'mallaprabesh141@gmail.com'
const PENDING_HANDLE_KEY = 'midnight-anime-pending-signup-handle'
const normalizeHandle = (value) => String(value || '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9._]/g, '').replace(/^[._]+|[._]+$/g, '').slice(0, 30)
const validHandle = (value) => /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/.test(value)

function pendingSignupHandle() {
  try { return normalizeHandle(sessionStorage.getItem(PENDING_HANDLE_KEY) || '') } catch { return '' }
}

async function claimHandle(uid, candidate) {
  const name = normalizeHandle(candidate)
  if (!validHandle(name)) return ''
  const result = await runTransaction(ref(db, `handleIndex/${name}`), (value) => value == null || value === uid ? uid : undefined)
  return result.committed && result.snapshot?.val() === uid ? name : ''
}

async function claimUniqueHandle(uid, candidate) {
  const base = normalizeHandle(candidate) || 'animefan'
  const suffix = String(uid || '').slice(-7).toLowerCase().replace(/[^a-z0-9]/g, '')
  const options = [base, `${base.slice(0, 22)}${suffix}`, `fan${suffix}`, `anime${suffix}`]
  for (const option of [...new Set(options)]) {
    const claimed = await claimHandle(uid, option)
    if (claimed) return claimed
  }
  return ''
}

async function releaseHandle(uid, candidate) {
  const name = normalizeHandle(candidate)
  if (validHandle(name)) await runTransaction(ref(db, `handleIndex/${name}`), (value) => value === uid ? null : value)
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let profileUnsubscribe = null
    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      if (!active) return
      profileUnsubscribe?.()
      profileUnsubscribe = null
      setUser(next)
      setLoading(true)
      if (!next) { setProfile(null); setLoading(false); return }
      const official = next.email?.toLowerCase() === OFFICIAL_EMAIL && next.emailVerified
      const pending = pendingSignupHandle()
      const displayBase = next.displayName || next.email?.split('@')[0] || 'Anime fan'
      const base = normalizeHandle(pending || next.displayName || next.email?.split('@')[0] || 'animefan') || 'animefan'
      const fallbackProfile = {
        uid: next.uid,
        username: validHandle(base) ? base : `fan${next.uid.slice(-7).toLowerCase()}`,
        displayName: displayBase,
        avatar: next.photoURL || '',
        bio: '',
        website: '',
        pronouns: '',
        ...(official ? { officialBadge: 'gold' } : {}),
        createdAt: Date.now(),
      }
      profileUnsubscribe = onValue(ref(db, `profiles/${next.uid}`), (snapshot) => {
        if (active && snapshot.exists()) setProfile(snapshot.val())
      }, () => {})
      if (pending) {
        if (active) setProfile({ ...fallbackProfile, username: pending })
        setLoading(false)
        return
      }
      try {
        const snapshot = await get(ref(db, `profiles/${next.uid}`))
        const current = snapshot.val()
        const nextProfile = current ? { ...fallbackProfile, ...current, uid: next.uid } : fallbackProfile
        const previousHandle = normalizeHandle(current?.username || '')
        const requestedHandle = normalizeHandle(pending || current?.username || base)
        try {
          const claimed = await claimUniqueHandle(next.uid, requestedHandle)
          if (!claimed) throw new Error('No unique handle was available for this account.')
          nextProfile.username = claimed
          if (!current) await set(ref(db, `profiles/${next.uid}`), nextProfile)
          else if (claimed !== previousHandle) {
            await update(ref(db, `profiles/${next.uid}`), { username: claimed, updatedAt: Date.now() })
            if (previousHandle) await releaseHandle(next.uid, previousHandle).catch(() => {})
          }
        } catch (handleError) {
          console.warn('Handle index is not available; apply the database rules before editing handles:', handleError.code || handleError.message)
        }
        if (official && current?.officialBadge !== 'gold') {
          nextProfile.officialBadge = 'gold'
          try { await update(ref(db, `profiles/${next.uid}`), { officialBadge: 'gold' }) }
          catch (writeError) { console.warn('Official badge sync was deferred:', writeError.code || writeError.message) }
        } else if (!official && current?.officialBadge === 'gold') {
          delete nextProfile.officialBadge
          try { await remove(ref(db, `profiles/${next.uid}/officialBadge`)) }
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
    return () => { active = false; profileUnsubscribe?.(); unsubscribe() }
  }, [])

  async function saveProfile(patch) {
    if (!user) throw new Error('Sign in first.')
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
