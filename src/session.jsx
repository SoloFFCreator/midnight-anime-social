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
  useEffect(() => onAuthStateChanged(auth, async (next) => {
    setUser(next)
    if (!next) { setProfile(null); setLoading(false); return }
    const snapshot = await get(ref(db, `profiles/${next.uid}`))
    const current = snapshot.val()
    const profileData = current || {
      uid: next.uid,
      username: (next.displayName || next.email?.split('@')[0] || 'otaku').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20),
      displayName: next.displayName || next.email?.split('@')[0] || 'Anime fan',
      avatar: next.photoURL || '',
      bio: 'Finding my next favorite story.',
      createdAt: Date.now(),
    }
    if (!current) await set(ref(db, `profiles/${next.uid}`), profileData)
    setProfile(profileData)
    setLoading(false)
  }), [])
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
