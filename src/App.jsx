import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { onValue, push, ref, remove, set, update } from 'firebase/database'
import { signOut } from 'firebase/auth'
import { auth, db } from './firebase'
import { useSession } from './session'
import { FeedPage, ExplorePage, InboxPage, ProfilePage, SavedPage } from './pages.jsx'
import { ReelsPage } from './reels.jsx'
import AuthScreen from './AuthScreen.jsx'
import ProfileEditor from './ProfileEditor.jsx'
import AnimePage from './AnimePage.jsx'
import { Avatar, BrandMark } from './ui.jsx'
import { Home, Compass, MessageCircle, Plus, Search, Bell, LogOut, Menu, X, UserRound, Sparkles, SunMoon, Play } from 'lucide-react'

const links = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/reels', label: 'Reels', icon: Play },
  { to: '/inbox', label: 'Messages', icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'My profile', icon: UserRound },
]

function AppShell() {
  const { user, profile, loading, saveProfile } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [stories, setStories] = useState([])
  const [posts, setPosts] = useState([])
  const [reels, setReels] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { if (!user) return; return onValue(ref(db, 'profiles'), s => setProfiles(Object.values(s.val() || {}).filter(p => p?.uid))) }, [user])
  useEffect(() => { if (!user) return; return onValue(ref(db, 'stories'), s => setStories(Object.values(s.val() || {}).filter(x => x?.expiresAt > Date.now()).sort((a,b) => b.createdAt-a.createdAt))) }, [user])
  useEffect(() => { if (!user) return; return onValue(ref(db, 'posts'), s => setPosts(Object.values(s.val() || {}).filter(x => x?.visibility !== 'private').sort((a,b) => b.createdAt-a.createdAt))) }, [user])
  useEffect(() => { if (!user) return; return onValue(ref(db, 'reels'), s => setReels(Object.values(s.val() || {}).filter(x => x?.visibility !== 'private').sort((a,b) => b.createdAt-a.createdAt))) }, [user])
  const activeProfile = profile || { username: 'midnightfan', displayName: 'Anime fan', avatar: '' }
  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Opening the midnight feed…</span></div>
  if (!user) return <AuthScreen />
  const handleCreate = (kind = 'post') => setShowCreate(kind)
  const activeTab = location.pathname === '/profile' ? `/profile/${user.uid}` : location.pathname
  const suggestions = profiles.filter(p => p.uid !== user.uid).slice(0, 4)
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">{menuOpen ? <X/> : <Menu/>}</button><BrandMark /><div className="top-search"><Search size={16}/><input placeholder="Search anime, people, moments…" value={searchText} onChange={e=>setSearchText(e.target.value)} onKeyDown={e=>e.key==='Enter' && navigate(`/explore?q=${encodeURIComponent(searchText)}`)}/><kbd>↵</kbd></div>{(location.pathname === '/profile' || location.pathname === `/profile/${user.uid}`) ? <button className="icon-button create-top" onClick={() => setEditProfileOpen(true)}><UserRound/><span>Edit profile</span></button> : <button className="icon-button create-top" onClick={handleCreate}><Plus/><span>New post</span></button>}<NavLink to="/notifications" className="icon-button bell-top" aria-label="Notifications"><Bell/></NavLink><button className="profile-chip" onClick={()=>navigate(`/profile/${user.uid}`)}><Avatar src={activeProfile.avatar} mediaKey={activeProfile.avatarKey} name={activeProfile.displayName} size="xs"/><span>{activeProfile.username}</span></button></div></header>
    <div className="layout">
      <aside className={`left-rail ${menuOpen ? 'rail-open' : ''}`}><div className="rail-nav">{links.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`rail-link ${isActive?'selected':''}`} onClick={()=>setMenuOpen(false)}><Icon size={19}/><span>{label}</span>{label==='Notifications' && <i className="unread-dot"/>}</NavLink>)}<button className="rail-link" onClick={handleCreate}><Plus size={19}/><span>Create post</span></button></div><div className="rail-spacer"/><div className="rail-note"><Sparkles size={16}/><p><b>Made for the after-hours.</b><br/>Your next fandom friend is one post away.</p></div><button className="rail-link signout" onClick={()=>signOut(auth)}><LogOut size={17}/><span>Sign out</span></button><div className="rail-version">MIDNIGHT ANIME SOCIAL · BETA</div></aside>
      <main className="main-column"><Routes><Route path="/" element={<FeedPage user={user} profile={activeProfile} profiles={profiles} stories={stories} posts={posts} onCreate={handleCreate} onStory={setShowCreate}/>} /><Route path="/explore" element={<ExplorePage posts={posts} profiles={profiles} user={user} />} /><Route path="/reels" element={<ReelsPage user={user} profile={activeProfile} profiles={profiles} reels={reels} />} /><Route path="/saved" element={<SavedPage user={user} />} /><Route path="/anime" element={<AnimePage />} /><Route path="/inbox/*" element={<InboxPage user={user} profile={activeProfile} profiles={profiles} />} /><Route path="/notifications" element={<NotificationsPage user={user}/>} /><Route path="/profile" element={<ProfilePage user={user} ownProfile={activeProfile} saveProfile={saveProfile} posts={posts} onEdit={() => setEditProfileOpen(true)} />} /><Route path="/profile/:uid" element={<ProfilePage user={user} ownProfile={activeProfile} saveProfile={saveProfile} posts={posts} onEdit={() => setEditProfileOpen(true)} />} /><Route path="*" element={<FeedPage user={user} profile={activeProfile} profiles={profiles} stories={stories} posts={posts} onCreate={handleCreate} onStory={setShowCreate}/>} /></Routes></main>
      <aside className="right-rail"><section className="self-card"><div className="self-card-top"><Avatar src={activeProfile.avatar} mediaKey={activeProfile.avatarKey} name={activeProfile.displayName} size="lg"/><div><b>{activeProfile.displayName}</b><span>@{activeProfile.username}</span></div></div><div className="self-stats"><span><b>{posts.filter(p=>p.authorId===user.uid).length}</b> posts</span><span><b>—</b> followers</span><span><b>—</b> following</span></div><Link className="text-link" to={`/profile/${user.uid}`}>View your profile <span>↗</span></Link></section><section className="suggestions"><div className="section-head"><h3>People to follow</h3><button onClick={()=>navigate('/explore')}>See all</button></div>{suggestions.length ? suggestions.map(p=><Suggestion key={p.uid} person={p} me={user.uid}/>) : <p className="muted tiny">Follow other fans to fill this space.</p>}</section><section className="quote-card"><div className="quote-glyph">“</div><p>Share what you love.<br/><em>Find your people.</em></p><span>THE MIDNIGHT PROMISE</span></section><footer className="site-footer">About · Guidelines · Privacy<br/>© 2026 Midnight Anime Social</footer></aside>
    </div>
    <nav className="mobile-tabs">{[links[0],links[1],links[2],links[3]].map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>isActive?'mobile-active':''}><Icon size={20}/><span>{label==='Messages'?'Inbox':label}</span></NavLink>)}<button onClick={()=>navigate(`/profile/${user.uid}`)}><Avatar src={activeProfile.avatar} mediaKey={activeProfile.avatarKey} name={activeProfile.displayName} size="xs"/></button></nav>
    {showCreate && <CreateModal user={user} profile={activeProfile} onClose={()=>setShowCreate(false)} initialStory={showCreate==='story'} />}{editProfileOpen && <ProfileEditor user={user} profile={activeProfile} onClose={() => setEditProfileOpen(false)} />}
  </div>
}
function Suggestion({ person, me }) {
  const [following, setFollowing] = useState(false)
  useEffect(() => onValue(ref(db, `follows/${me}/${person.uid}`), (snapshot) => setFollowing(Boolean(snapshot.val()))), [me, person.uid])
  async function toggle() {
    const next = !following
    const changes = {}
    changes[`follows/${me}/${person.uid}`] = next ? true : null
    changes[`followers/${person.uid}/${me}`] = next ? true : null
    await update(ref(db), changes)
    if (next) {
      const notice = push(ref(db, `notifications/${person.uid}`))
      await set(notice, { id: notice.key, fromId: me, fromName: 'A Midnight fan', text: 'started following you', createdAt: Date.now() })
    }
  }
  return <div className="suggestion"><Avatar src={person.avatar} mediaKey={person.avatarKey} name={person.displayName} size="sm"/><div className="suggestion-info"><b>{person.displayName}</b><span>@{person.username}</span></div><button className={`follow-button ${following?'following':''}`} onClick={toggle}>{following?'Following':'Follow'}</button></div>
}
function NotificationsPage({user}) { const [items,setItems]=useState([]);useEffect(()=>onValue(ref(db,`notifications/${user.uid}`),s=>setItems(Object.values(s.val()||{}).sort((a,b)=>b.createdAt-a.createdAt))),[user.uid]);return <section className="page-card"><PageHeading eyebrow="YOUR CORNER OF THE COMMUNITY" title="Notifications" sub="The little moments that bring us together."/><div className="notification-list">{items.length?items.map((n,i)=><div className="notification-row" key={n.id||i}><Avatar src={n.avatar} name={n.fromName} size="md"/><div><b>{n.text||'Someone shared a moment with you.'}</b><span>{new Date(n.createdAt||Date.now()).toLocaleString()}</span></div><span className="notif-dot"/></div>):<EmptyState icon={<Bell/>} title="All caught up" text="When someone follows, likes, or replies to you, it will show up here."/>}</div></section>}
function PageHeading({eyebrow,title,sub}) {return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{sub&&<p className="muted">{sub}</p>}</div>}
function EmptyState({icon,title,text}) {return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>}
function CreateModal({user,profile,onClose,initialStory=false}) { const [kind,setKind]=useState(initialStory?'story':'post');const [caption,setCaption]=useState('');const [file,setFile]=useState(null);const [preview,setPreview]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [progress,setProgress]=useState('');useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);async function submit(e){e.preventDefault();if(!file){setError('Choose a photo or video to share.');return}setBusy(true);setError('');try{const token=await user.getIdToken();const base=import.meta.env.VITE_R2_WORKER_URL;if(!base)throw new Error('R2 media service is not configured. See README.md.');setProgress('Preparing secure upload…');const sign=await fetch(`${base}/upload-url`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,contentType:file.type,size:file.size})});if(!sign.ok)throw new Error('Could not prepare the upload. Check the R2 Worker setup.');const {url,key,mediaUrl}=await sign.json();setProgress('Uploading to private R2…');const put=await fetch(url,{method:'PUT',headers:{'Content-Type':file.type},body:file});if(!put.ok)throw new Error('The media upload failed. Please try again.');setProgress('Sharing with the community…');const node=push(ref(db,kind==='story'?'stories':'posts'));const common={id:node.key,authorId:user.uid,authorName:profile.displayName,username:profile.username,avatar:profile.avatar||'',avatarKey:profile.avatarKey||'',mediaKey:key,mediaUrl:'',mediaType:file.type.startsWith('video/')?'video':'image',caption:caption.trim(),createdAt:Date.now(),visibility:'public'};await set(node,kind==='story'?{...common,expiresAt:Date.now()+24*60*60*1000}:{...common,likesCount:0,commentsCount:0});onClose()}catch(e){setError(e.message||'Upload failed.')}finally{setBusy(false);setProgress('')}}return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="create-modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">MAKE A LITTLE MAGIC</p><h2>{kind==='story'?'Add to your story':'Create a post'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X/></button></div><div className="create-tabs"><button type="button" className={kind==='post'?'active':''} onClick={()=>setKind('post')}>Post</button><button type="button" className={kind==='story'?'active':''} onClick={()=>setKind('story')}>Story · 24h</button></div><label className={`upload-zone ${preview?'has-preview':''}`}>{preview?(file?.type.startsWith('video/')?<video src={preview} controls/>:<img src={preview} alt="Selected upload preview"/>):<><div className="upload-plus"><Plus/></div><b>Drop your moment here</b><span>Photo or video · choose a file to begin</span><i>Images and video supported</i></>}<input type="file" accept="image/*,video/*" onChange={e=>setFile(e.target.files?.[0]||null)} hidden/></label><textarea className="caption-input" placeholder="What are you watching, feeling, or obsessing over?" value={caption} onChange={e=>setCaption(e.target.value)} maxLength={1200}/>{error&&<p className="error-text">{error}</p>}{progress&&<p className="upload-progress">{progress}</p>}<div className="modal-foot"><span className="muted tiny">Shared with the Midnight community</span><button className="primary-button" disabled={busy}>{busy?'Sharing…':kind==='story'?'Share story':'Share post'}</button></div></form></div>}
export default function App(){return <AppShell/>}
