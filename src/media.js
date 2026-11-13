const latencyKey = 'midnight-social-media-latency-v1'

function getBackendOrder() {
  try {
    const stats = JSON.parse(localStorage.getItem(latencyKey) || '{}')
    return ['aws', 'r2'].sort((a, b) => (stats[a] ?? Infinity) - (stats[b] ?? Infinity))
  } catch { return ['aws', 'r2'] }
}

function recordSuccess(backend, elapsed) {
  try {
    const stats = JSON.parse(localStorage.getItem(latencyKey) || '{}')
    stats[backend] = Math.round((Number(stats[backend]) || elapsed) * 0.65 + elapsed * 0.35)
    localStorage.setItem(latencyKey, JSON.stringify(stats))
  } catch { /* Storage preference is only a performance hint. */ }
}

async function uploadAws(file, token) {
  const response = await fetch('/api/aws-media', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  })
  const signed = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(signed.error || `AWS could not prepare the upload (HTTP ${response.status}).`)
  const body = new FormData()
  Object.entries(signed.fields || {}).forEach(([name, value]) => body.append(name, value))
  body.append('file', file)
  const upload = await fetch(signed.url, { method: 'POST', body })
  if (!upload.ok) throw new Error(`AWS S3 upload failed (HTTP ${upload.status}).`)
  return signed.key
}

async function uploadR2(file, token) {
  const worker = import.meta.env.VITE_R2_WORKER_URL?.replace(/\/+$/, '')
  if (!worker) throw new Error('Cloudflare R2 fallback is not configured.')
  const response = await fetch(`${worker}/upload-url`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  })
  const signed = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(signed.error || `R2 could not prepare the upload (HTTP ${response.status}).`)
  const upload = await fetch(signed.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  if (!upload.ok) throw new Error(`Cloudflare R2 upload failed (HTTP ${upload.status}).`)
  return signed.key
}

export async function uploadPrivateMedia(file, user, setProgress = () => {}) {
  if (!file || !user) throw new Error('Choose a file and sign in before uploading.')
  const token = await user.getIdToken()
  const attempts = { aws: () => uploadAws(file, token), r2: () => uploadR2(file, token) }
  const failures = []
  for (const backend of getBackendOrder()) {
    const started = performance.now()
    setProgress(backend === 'aws' ? 'Trying private AWS S3…' : 'Trying private Cloudflare R2…')
    try {
      const key = await attempts[backend]()
      recordSuccess(backend, performance.now() - started)
      return key
    } catch (error) {
      failures.push(`${backend === 'aws' ? 'AWS S3' : 'Cloudflare R2'}: ${error?.message || 'upload failed'}`)
    }
  }
  throw new Error(`Upload failed on both private storage providers. ${failures.join(' ')}`)
}
