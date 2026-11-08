export async function uploadPrivateMedia(file, user, setProgress = () => {}) {
  if (!file || !user) throw new Error('Choose a file and sign in before uploading.')
  setProgress('Preparing a secure AWS upload…')
  const token = await user.getIdToken()
  const response = await fetch('/api/aws-media', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  })
  const signed = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(signed.error || `Could not prepare the AWS upload (HTTP ${response.status}).`)
  setProgress('Uploading to private AWS S3…')
  const body = new FormData()
  Object.entries(signed.fields || {}).forEach(([name, value]) => body.append(name, value))
  body.append('file', file)
  const upload = await fetch(signed.url, { method: 'POST', body })
  if (!upload.ok) throw new Error(`AWS S3 upload failed (HTTP ${upload.status}). Check the bucket CORS policy and try again.`)
  return signed.key
}
