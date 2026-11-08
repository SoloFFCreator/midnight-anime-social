import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth'
import { ref, runTransaction, set } from 'firebase/database'
import { auth, db, googleProvider } from './firebase'
import { BrandMark } from './ui.jsx'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Mail, Lock, UserRound } from 'lucide-react'

const OFFICIAL_EMAIL = 'mallaprabesh141@gmail.com'
const PENDING_HANDLE_KEY = 'midnight-anime-pending-signup-handle'
const normalizeHandle = (value) => value.trim().replace(/^@+/, '').toLowerCase().replace(/^[._]+|[._]+$/g, '')
const validHandle = (value) => /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/.test(value)

function friendlyError(error, method = 'email') {
  const code = error?.code || ''
  if (code === 'auth/unauthorized-domain') return `This domain (${window.location.hostname}) is not authorized in Firebase Authentication. Add it under Authentication → Settings → Authorized domains.`
  if (code === 'auth/operation-not-allowed') return method === 'google' ? 'Google sign-in is not enabled in Firebase Authentication. Enable the Google provider in Sign-in method.' : 'Email/password sign-in is not enabled in Firebase Authentication. Enable the Email/Password provider in Sign-in method.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'That email and password combination could not be verified. Check your details or reset your password.'
  if (code === 'auth/email-already-in-use') return 'An account already exists for this email. Try signing in instead.'
  if (code === 'auth/weak-password') return 'Choose a password with at least 8 characters.'
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  if (code === 'auth/popup-closed-by-user') return 'The Google sign-in window was closed before it finished.'
  if (code === 'auth/network-request-failed') return 'A network error interrupted sign-in. Check your connection and try again.'
  if (error?.message === 'HANDLE_TAKEN') return 'That @handle is already in use. Choose another one.'
  if (/PERMISSION_DENIED|permission.denied/i.test(`${code} ${error?.message || ''}`)) return 'Firebase Realtime Database rules rejected the handle or profile write. Apply the reviewed database.rules.json to the mid-night-anime project, then try again.'
  return error?.message || 'Something went wrong. Please try again.'
}

export default function AuthScreen() {
  const location = useLocation()
  const navigate = useNavigate()
  const initialMode = location.pathname === '/register' ? 'signup' : location.pathname === '/forgot-password' ? 'reset' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setMode(location.pathname === '/register' ? 'signup' : location.pathname === '/forgot-password' ? 'reset' : 'login')
  }, [location.pathname])
  useEffect(() => {
    getRedirectResult(auth).catch((e) => setError(friendlyError(e, 'google')))
  }, [])

  function switchMode(next) {
    setError('')
    setNotice('')
    setMode(next)
    navigate(next === 'signup' ? '/register' : next === 'reset' ? '/forgot-password' : '/login')
  }

  async function handleGoogle() {
    setBusy(true)
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
        try { await signInWithRedirect(auth, googleProvider); return }
        catch (redirectError) { setError(friendlyError(redirectError, 'google')) }
      } else setError(friendlyError(e, 'google'))
    }
    setBusy(false)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'reset') {
        if (!email.trim()) throw new Error('Enter your email address and we will send a reset link.')
        await sendPasswordResetEmail(auth, email.trim())
        setNotice('If an account exists for that email, Firebase has sent a password-reset link.')
        return
      }
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password)
        return
      }
      const cleanHandle = normalizeHandle(handle)
      if (!displayName.trim()) throw new Error('Add your name so people know who they are meeting.')
      if (!validHandle(cleanHandle)) throw new Error('Your @handle must be 3–30 characters, start and end with a letter or number, and use only letters, numbers, dots or underscores.')
      if (password.length < 8) throw new Error('Choose a password with at least 8 characters.')
      try { sessionStorage.setItem(PENDING_HANDLE_KEY, cleanHandle) } catch { /* the profile bootstrap will still choose a unique fallback */ }
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      let claimedHandle = false
      try {
        await updateProfile(credential.user, { displayName: displayName.trim() })
        const claim = await runTransaction(ref(db, `handleIndex/${cleanHandle}`), (value) => value == null || value === credential.user.uid ? credential.user.uid : undefined)
        if (!claim.committed || claim.snapshot?.val() !== credential.user.uid) throw new Error('HANDLE_TAKEN')
        claimedHandle = true
        const officialBadge = credential.user.email?.toLowerCase() === OFFICIAL_EMAIL && credential.user.emailVerified ? 'gold' : ''
        await set(ref(db, `profiles/${credential.user.uid}`), {
          uid: credential.user.uid,
          username: cleanHandle,
          displayName: displayName.trim(),
          avatar: credential.user.photoURL || '',
          bio: '',
          website: '',
          pronouns: '',
          ...(officialBadge ? { officialBadge } : {}),
          createdAt: Date.now(),
        })
      } catch (profileError) {
        if (claimedHandle) await runTransaction(ref(db, `handleIndex/${cleanHandle}`), (value) => value === credential.user.uid ? null : value).catch(() => {})
        try { await deleteUser(credential.user) } catch { try { await signOut(auth) } catch { /* keep the original setup error for the user */ } }
        throw profileError
      }
      try { await sendEmailVerification(credential.user) } catch { /* optional verification email should not block account creation */ }
      setNotice('Account created. Check your inbox for an email-verification link to unlock account verification features.')
    } catch (e) {
      setError(friendlyError(e, 'email'))
    } finally {
      try { sessionStorage.removeItem(PENDING_HANDLE_KEY) } catch { /* optional browser storage */ }
      setBusy(false)
    }
  }

  const isLogin = mode === 'login'
  const isSignup = mode === 'signup'
  const title = isLogin ? 'Welcome back' : isSignup ? 'Join the community' : 'Reset your password'
  const submitLabel = isLogin ? 'Log in' : isSignup ? 'Create account' : 'Send reset link'

  return <main className="auth-screen">
    <section className="auth-card-shell">
      <div className="auth-header"><BrandMark /><div className="auth-header-note">A home for your anime people.</div></div>
      <div className="auth-card">
        {mode === 'reset' && <button type="button" className="auth-back" onClick={() => switchMode('login')}><ArrowLeft size={15}/> Back to login</button>}
        <p className="auth-kicker">MIDNIGHT ANIME SOCIAL</p>
        <h1>{title}</h1>
        <p className="auth-intro">{isLogin ? 'Sign in to share what you love and find your people.' : isSignup ? 'Create your account and find the fans who get it.' : 'Enter your account email and we’ll send a secure reset link.'}</p>

        {(isLogin || isSignup) && <button type="button" className="auth-google" onClick={handleGoogle} disabled={busy}><span className="auth-google-mark">G</span>{busy ? 'Connecting…' : 'Continue with Google'}</button>}
        {(isLogin || isSignup) && <div className="auth-divider"><span>or continue with email</span></div>}

        <form className="auth-form" onSubmit={submit}>
          {isSignup && <>
            <label className="auth-label">Name
              <span className="auth-input-wrap"><UserRound size={16}/><input autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required /></span>
            </label>
            <label className="auth-label">Username
              <span className="auth-input-wrap"><span className="auth-at">@</span><input autoComplete="username" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="your.handle" maxLength={30} required /></span>
            </label>
          </>}
          <label className="auth-label">Email
            <span className="auth-input-wrap"><Mail size={16}/><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required /></span>
          </label>
          {mode !== 'reset' && <label className="auth-label">Password
            <span className="auth-input-wrap"><Lock size={16}/><input type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isSignup ? 'At least 8 characters' : 'Your password'} minLength={isSignup ? 8 : undefined} required /><button type="button" className="auth-reveal" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span>
          </label>}
          {isLogin && <button type="button" className="auth-forgot" onClick={() => switchMode('reset')}>Forgot password?</button>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : submitLabel}<ArrowRight size={16}/></button>
        </form>
        {isLogin ? <p className="auth-switch">Don’t have an account? <button onClick={() => switchMode('signup')}>Sign up</button></p> : mode === 'signup' ? <p className="auth-switch">Already have an account? <button onClick={() => switchMode('login')}>Log in</button></p> : <p className="auth-switch">Remembered your password? <button onClick={() => switchMode('login')}>Log in</button></p>}
        <p className="auth-terms">By continuing, you agree to keep this community kind, spoiler-aware and respectful.</p>
      </div>
      <div className="auth-footer"><span>Stories, watch clubs and late-night conversations.</span><span>© 2026 Midnight Anime Social</span></div>
    </section>
  </main>
}
