import crypto from 'node:crypto'
import { authenticateUser, getFirebaseAdmin, respond, readJsonBody, cleanId, nowIso } from '../_distribution.js'

function canAccessTerritories(grants, country) {
  if (!Array.isArray(grants) || !grants.length) return false
  if (grants.includes('WORLDWIDE')) return true
  return process.env.DISTRIBUTION_GEO_PROVIDER === 'vercel' && Boolean(country) && grants.includes(country)
}

async function validateReleaseIds(db, ids, country) {
  for (const id of ids) {
    const snapshot = await db.ref(`distributionCatalog/${id}`).get()
    if (!snapshot.exists()) throw Object.assign(new Error(`Release ${id} is not in the published catalogue.`), { statusCode: 422 })
    const release = snapshot.val()
    if (!['approved', 'scheduled'].includes(release.status) || Number(release.releaseAt) > Date.now() || !canAccessTerritories(release.territories, country)) {
      throw Object.assign(new Error(`Release ${id} is not currently available in your territory.`), { statusCode: 422 })
    }
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return respond(res, 405, { error: 'Method not allowed.' })
  const user = await authenticateUser(req)
  if (!user) return respond(res, 401, { error: 'Sign in to manage playlists.' })
  try {
    const { db } = getFirebaseAdmin()
    const root = db.ref(`distributionUserPlaylists/${user.uid}`)
    if (req.method === 'GET') {
      const snapshot = await root.get()
      return respond(res, 200, { playlists: Object.values(snapshot.val() || {}) })
    }
    const body = readJsonBody(req, 64_000)
    const operation = String(body.operation || '')
    const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase()
    if (operation === 'create') {
      const name = String(body.name || '').trim().slice(0, 80)
      if (name.length < 2) return respond(res, 400, { error: 'Playlist name must contain at least 2 characters.' })
      const playlistId = crypto.randomUUID().replaceAll('-', '')
      const playlist = { id: playlistId, name, releaseIds: [], ownerUid: user.uid, createdAt: nowIso(), updatedAt: nowIso() }
      await root.child(playlistId).set(playlist)
      return respond(res, 201, { playlist })
    }
    const playlistId = cleanId(body.playlistId, 'playlist id')
    const playlistRef = root.child(playlistId)
    const snapshot = await playlistRef.get()
    if (!snapshot.exists()) return respond(res, 404, { error: 'Playlist not found.' })
    if (operation === 'delete') {
      await playlistRef.remove()
      return respond(res, 200, { playlistId, deleted: true })
    }
    if (!['add', 'remove'].includes(operation)) return respond(res, 400, { error: 'Operation must be create, add, remove, or delete.' })
    const ids = [...new Set((Array.isArray(body.releaseIds) ? body.releaseIds : [body.releaseId]).filter(Boolean).map((id) => cleanId(id, 'release id')))].slice(0, 100)
    if (!ids.length) return respond(res, 400, { error: 'Provide at least one catalogue release ID.' })
    const current = snapshot.val()
    const releaseIds = new Set(current.releaseIds || [])
    if (operation === 'add') {
      await validateReleaseIds(db, ids, country)
      for (const id of ids) releaseIds.add(id)
    } else for (const id of ids) releaseIds.delete(id)
    const updated = { ...current, releaseIds: [...releaseIds].slice(0, 1000), updatedAt: nowIso() }
    await playlistRef.set(updated)
    return respond(res, 200, { playlist: updated })
  } catch (error) {
    const status = Number(error?.statusCode) || 503
    if (status >= 500) console.error('Distribution playlist operation failed:', error?.message || error)
    return respond(res, status, { error: status < 500 ? error.message : 'Playlist service is temporarily unavailable.' })
  }
}
