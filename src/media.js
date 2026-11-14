const latencyKey = 'midnight-social-media-latency-v1'
const failureCooldownMs = 15 * 60 * 1000
const uploadTimeoutMs = 15 * 60 * 1000

function readStats() {
  try { return JSON.parse(localStorage.getItem(latencyKey) || '{}') } catch { return {} }
}

function getBackendOrder() {
  const stats = readStats()
  const now = Date.now()
  return ['aws', 'r2'].sort((a, b) => {
    const score = (backend) => now - (stats.failures?.[backend] || 0) < failureCooldownMs
      ? Number.POSITIVE_INFINITY
      : (Number(stats[backend]) || Number.POSITIVE_INFINITY)
    return score(a) - score(b)
  })
}

function recordSuccess(backend, elapsed) {
  try {
    const stats = readStats()
    stats[backend] = Math.round((Number(stats[backend]) || elapsed) * 0.65 + elapsed * 0.35)
    if (stats.failures) delete stats.failures[backend]
    localStorage.setItem(latencyKey, JSON.stringify(stats))
  } catch { /* Storage preference is only a performance hint. */ }
}

function recordFailure(backend) {
  try {
    const stats = readStats()
    stats.failures = { ...(stats.failures || {}), [backend]: Date.now() }
    localStorage.setItem(latencyKey, JSON.stringify(stats))
  } catch { /* Failure cooldown is only a performance hint. */ }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

function sendUpload(url, method, body, headers, file, backend, setProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const started = performance.now()
    let lastProgressAt = 0
    xhr.open(method, url)
    xhr.timeout = uploadTimeoutMs
    Object.entries(headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, value))
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const now = performance.now()
      if (now - lastProgressAt < 250 && event.loaded < event.total) return
      lastProgressAt = now
      const elapsed = Math.max((now - started) / 1000, 0.25)
      const fraction = Math.min(event.loaded / event.total, 1)
      const speed = event.loaded / elapsed
      const remaining = speed > 0 ? (event.total - event.loaded) / speed : 0
      const label = backend === 'aws' ? 'AWS S3' : 'Cloudflare R2'
      setProgress(`Uploading to ${label} · ${Math.round(fraction * 100)}% · ${formatBytes(speed)}/s · about ${Math.ceil(remaining)}s left`)
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`${backend === 'aws' ? 'AWS S3' : 'Cloudflare R2'} upload failed (HTTP ${xhr.status}).`))
    xhr.onerror = () => reject(new Error('Upload connection failed. Check your network and try again.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out. Check your connection and retry.'))
    xhr.onabort = () => reject(new Error('Upload was interrupted. Please retry.'))
    xhr.send(body)
  })
}

async function signingRequest(url, token, payload, provider) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const signed = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(signed.error || `${provider} could not prepare the upload (HTTP ${response.status}).`)
    return signed
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${provider} took too long to prepare the upload.`)
    throw error
  } finally { window.clearTimeout(timeout) }
}

async function uploadAws(file, token, setProgress) {
  const signed = await signingRequest('/api/aws-media', token, {
    filename: file.name, contentType: file.type, size: file.size,
  }, 'AWS S3')
  const body = new FormData()
  Object.entries(signed.fields || {}).forEach(([name, value]) => body.append(name, value))
  body.append('file', file)
  setProgress('AWS S3 ready · starting upload…')
  await sendUpload(signed.url, 'POST', body, {}, file, 'aws', setProgress)
  return signed.key
}

async function uploadR2(file, token, setProgress) {
  const worker = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/+$/, '')
  if (!worker) throw new Error('Cloudflare R2 fallback is not configured.')
  const signed = await signingRequest(`${worker}/upload-url`, token, {
    filename: file.name, contentType: file.type, size: file.size,
  }, 'Cloudflare R2')
  setProgress('Cloudflare R2 ready · starting upload…')
  await sendUpload(signed.url, 'PUT', file, { 'Content-Type': file.type }, file, 'r2', setProgress)
  return signed.key
}

export async function uploadPrivateMedia(file, user, setProgress = () => {}) {
  if (!file || !user) throw new Error('Choose a file and sign in before uploading.')
  const token = await user.getIdToken()
  const attempts = { aws: () => uploadAws(file, token, setProgress), r2: () => uploadR2(file, token, setProgress) }
  const failures = []
  for (const backend of getBackendOrder()) {
    const started = performance.now()
    setProgress(backend === 'aws' ? 'Preparing private AWS S3 upload…' : 'Preparing private Cloudflare R2 upload…')
    try {
      const key = await attempts[backend]()
      recordSuccess(backend, performance.now() - started)
      return key
    } catch (error) {
      recordFailure(backend)
      failures.push(`${backend === 'aws' ? 'AWS S3' : 'Cloudflare R2'}: ${error?.message || 'upload failed'}`)
    }
  }
  throw new Error(`Upload failed on both private storage providers. ${failures.join(' ')}`)
}
