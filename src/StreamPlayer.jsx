import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Maximize, Pause, Play, RefreshCw, Volume2, VolumeX } from 'lucide-react'

function timeLabel(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const total = Math.floor(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function StreamPlayer({ source, poster = '', onRetry }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const hideRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(true)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !source?.url) { setBuffering(false); return undefined }
    let hls
    setError('')
    setBuffering(true)
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    const onLoaded = () => { setDuration(video.duration || 0); setBuffering(false) }
    const onTime = () => setCurrent(video.currentTime || 0)
    const onPlay = () => { setPlaying(true); setBuffering(false) }
    const onPause = () => setPlaying(false)
    const onWaiting = () => setBuffering(true)
    const onError = () => { setBuffering(false); setError('The selected stream could not be played. Try another source or retry.') }
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('durationchange', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('playing', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('error', onError)
    if (source.type === 'hls' && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, xhrSetup: (xhr) => {
        Object.entries(source.headers || {}).forEach(([key, value]) => { if (!/^(user-agent|origin|referer|accept|host|content-length)$/i.test(key)) xhr.setRequestHeader(key, value) })
      } })
      hlsRef.current = hls
      hls.loadSource(source.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setBuffering(false); video.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data?.fatal) { setBuffering(false); setError('The stream could not be loaded. Try another source or retry.') } })
    } else {
      video.src = source.url
      video.load()
      video.play().catch(() => setBuffering(false))
    }
    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('durationchange', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('playing', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('error', onError)
      hls?.destroy()
      hlsRef.current = null
    }
  }, [source])

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted }, [muted])
  useEffect(() => {
    window.clearTimeout(hideRef.current)
    if (!playing) return undefined
    hideRef.current = window.setTimeout(() => setVisible(false), 2600)
    return () => window.clearTimeout(hideRef.current)
  }, [playing])
  useEffect(() => () => window.clearTimeout(hideRef.current), [])
  function reveal() {
    setVisible(true)
    window.clearTimeout(hideRef.current)
    if (playing) hideRef.current = window.setTimeout(() => setVisible(false), 2600)
  }
  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    reveal()
    if (video.paused) video.play().catch(() => setError('Press play again to start this stream.'))
    else video.pause()
  }
  function seek(event) { const value = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = value; setCurrent(value) }
  function toggleFullscreen() {
    const node = videoRef.current?.parentElement
    if (!node) return
    if (document.fullscreenElement) document.exitFullscreen?.()
    else node.requestFullscreen?.()
  }
  function toggleMute() { const next = !muted; setMuted(next); if (videoRef.current) videoRef.current.muted = next; reveal() }

  return <div className="stream-player" onPointerMove={reveal} onTouchStart={reveal}>
    <video ref={videoRef} poster={poster || undefined} playsInline preload="metadata" muted={muted} controls={false} onClick={togglePlay} aria-label="Midnight Anime episode"/>
    {buffering && !error && <div className="stream-loading"><span className="spinner"/><b>Resolving provider stream…</b></div>}
    {error && <div className="stream-error"><b>Playback unavailable</b><span>{error}</span><button type="button" onClick={onRetry}><RefreshCw size={15}/> Retry</button></div>}
    {!playing && !buffering && !error && <button type="button" className="stream-big-play" onClick={togglePlay} aria-label="Play episode"><Play fill="currentColor"/></button>}
    {!error && <div className={`stream-controls ${visible ? 'controls-visible' : ''}`}>
      <div className="stream-seek"><div style={{ width: `${duration ? Math.min(100, current / duration * 100) : 0}%` }}/><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(current, duration || 0)} onChange={seek} aria-label="Seek episode"/></div>
      <div className="stream-control-row"><button type="button" onClick={togglePlay} aria-label={playing ? 'Pause episode' : 'Play episode'}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button><button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute episode' : 'Mute episode'}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button><span>{timeLabel(current)} / {timeLabel(duration)}</span><button type="button" className="stream-fullscreen" onClick={toggleFullscreen} aria-label="Fullscreen"><Maximize size={17}/></button></div>
    </div>}
  </div>
}
