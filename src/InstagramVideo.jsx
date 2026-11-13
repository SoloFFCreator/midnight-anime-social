import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'

function clock(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const seconds = Math.floor(value)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function InstagramVideo({ src, poster = '', autoPlay = false, loop = false, className = '', title = 'Video' }) {
  const videoRef = useRef(null)
  const timerRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [visible, setVisible] = useState(true)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    video.muted = muted
    if (autoPlay) video.play().catch(() => setPlaying(false))
    const update = () => setCurrent(video.currentTime || 0)
    const metadata = () => setDuration(video.duration || 0)
    const play = () => setPlaying(true)
    const pause = () => setPlaying(false)
    video.addEventListener('timeupdate', update)
    video.addEventListener('loadedmetadata', metadata)
    video.addEventListener('durationchange', metadata)
    video.addEventListener('play', play)
    video.addEventListener('pause', pause)
    return () => {
      video.removeEventListener('timeupdate', update)
      video.removeEventListener('loadedmetadata', metadata)
      video.removeEventListener('durationchange', metadata)
      video.removeEventListener('play', play)
      video.removeEventListener('pause', pause)
    }
  }, [src, autoPlay, muted])

  useEffect(() => {
    window.clearTimeout(timerRef.current)
    if (!playing) { setVisible(true); return undefined }
    timerRef.current = window.setTimeout(() => setVisible(false), 2200)
    return () => window.clearTimeout(timerRef.current)
  }, [playing, src])

  function togglePlay(event) {
    event?.stopPropagation?.()
    const video = videoRef.current
    if (!video) return
    setVisible(true)
    if (video.paused) video.play().catch(() => setPlaying(false))
    else video.pause()
  }
  function reveal(event) { event?.stopPropagation?.(); setVisible(true) }
  function toggleMute(event) {
    event.stopPropagation()
    const next = !muted
    setMuted(next)
    if (videoRef.current) {
      videoRef.current.muted = next
      if (!next) videoRef.current.volume = 1
      if (!next && videoRef.current.paused) videoRef.current.play().catch(() => setPlaying(false))
    }
  }
  function seek(event) {
    event.stopPropagation()
    if (videoRef.current) { videoRef.current.currentTime = Number(event.target.value); setCurrent(Number(event.target.value)) }
  }

  return <div className={`instagram-video ${className}`} onPointerMove={reveal} onTouchStart={reveal} onClick={(event) => { event.stopPropagation(); togglePlay(event) }}>
    <video ref={videoRef} src={src || undefined} poster={poster || undefined} autoPlay={autoPlay} muted={muted} loop={loop} playsInline preload="metadata" controls={false} aria-label={title}/>
    <button type="button" className={`instagram-video-sound ${muted ? 'is-muted' : 'is-live'}`} onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}><span>{muted ? <VolumeX size={16}/> : <Volume2 size={16}/>}</span>{muted ? 'Tap for sound' : 'Sound on'}</button>
    {!playing && src && <button type="button" className="instagram-video-center" onClick={togglePlay} aria-label="Play video"><Play fill="currentColor"/></button>}
    <div className={`instagram-video-controls ${visible ? 'controls-visible' : ''}`} onClick={reveal}>
      <div className="instagram-video-progress"><div style={{ width: `${duration ? Math.min(100, current / duration * 100) : 0}%` }}/><input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(current, duration || 0)} onChange={seek} aria-label="Seek video"/></div>
      <div className="instagram-video-control-row"><button type="button" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><span>{clock(current)}{duration ? ` / ${clock(duration)}` : ''}</span></div>
    </div>
  </div>
}
