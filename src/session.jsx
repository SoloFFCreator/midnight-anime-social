import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { get, ref, set, update } from 'firebase/database'
import { auth, db } from './firebase'

const Context = createContext(null)
export const useSession = () => useContext(Context)

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
      const fallbackProfile = {
        uid: next.uid,
        username: (next.displayName || next.email?.split('@')[0] || 'otaku').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20),
        displayName: next.displayName || next.email?.split('@')[0] || 'Anime fan',
        avatar: next.photoURL || '',
        bio: 'Finding my next favorite story.',
        createdAt: Date.now(),
      }
      try {
        const snapshot = await get(ref(db, `profiles/${next.uid}`))
        const current = snapshot.val()
        if (current) {
          if (active) setProfile(current)
        } else {
          try { await set(ref(db, `profiles/${next.uid}`), fallbackProfile) } catch (writeError) { console.warn('Profile bootstrap was deferred:', writeError.code || writeError.message) }
          if (active) setProfile(fallbackProfile)
        }
      } catch (readError) {
        console.warn('Profile could not be loaded; continuing with the Google account:', readError.code || readError.message)
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
    setProfile(next)
    return next
  }
  const value = useMemo(() => ({ user, profile, loading, saveProfile }), [user, profile, loading])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
