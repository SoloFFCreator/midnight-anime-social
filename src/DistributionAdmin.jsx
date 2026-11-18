import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleHelp, Clock3, FileText, Music2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { auth } from './firebase'

const STATUS_OPTIONS = ['', 'received_pending_validation', 'awaiting_review', 'identity_conflict', 'correction_requested', 'validation_failed', 'processing_failed', 'scheduled', 'approved', 'taken_down', 'rejected', 'merged']

async function request(path, options = {}) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in again to continue.')
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`)
  return body
}

export default function DistributionAdmin() {
  const [payload, setPayload] = useState({ partners: [], records: [] })
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [confirmMetadata, setConfirmMetadata] = useState(false)
  const [confirmRights, setConfirmRights] = useState(false)
  const [releaseDate, setReleaseDate] = useState('')
  const [territories, setTerritories] = useState([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rawLink, setRawLink] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filter) params.set('status', filter)
      if (search.trim()) params.set('q', search.trim())
      const result = await request(`/api/distribution/admin?${params}`)
      setPayload(result)
      setSelectedId((current) => result.records.some((record) => record.id === current) ? current : result.records[0]?.id || '')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [filter, search])

  useEffect(() => { load() }, [load])
  const selected = useMemo(() => payload.records.find((item) => item.id === selectedId), [payload.records, selectedId])

  useEffect(() => {
    setNote('')
    setConfirmMetadata(false)
    setConfirmRights(false)
    setRawLink('')
    setReleaseDate(selected?.metadata?.releaseDates?.[0] || '')
    setTerritories(selected?.metadata?.territories || [])
  }, [selectedId, selected?.id])

  async function act(action, extra = {}) {
    if (!selected) return
    const needsReason = ['reject', 'request_correction', 'takedown', 'mark_failure'].includes(action)
    if (needsReason && !note.trim()) { setError('Add a clear note/reason before continuing.'); return }
    if (action === 'resolve_identity_conflict') {
      const candidates = selected.identityConflicts?.flatMap((item) => item.candidateDeliveryIds || []) || []
      const target = candidates[0]
      if (!target) { setError('No duplicate candidate is available to resolve.'); return }
      extra = { canonicalDeliveryId: target, note }
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request('/api/distribution/admin', { method: 'POST', body: JSON.stringify({ deliveryId: selected.id, action, note, ...extra }) })
      setNotice(`Updated ${selected.metadata?.title || selected.id}: ${result.status}.`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function approve() {
    if (!confirmMetadata || !confirmRights) { setError('Confirm both metadata and rights/deal review first.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request('/api/distribution/admin', { method: 'POST', body: JSON.stringify({ deliveryId: selected.id, action: 'approve', confirmMetadata, confirmRights, confirmedReleaseDate: releaseDate, confirmedTerritories: territories }) })
      setNotice(`Approval recorded. Current state: ${result.status}.`)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function openSource() {
    setBusy(true); setError('')
    try {
      const result = await request(`/api/distribution/source?deliveryId=${encodeURIComponent(selected.id)}`)
      window.open(result.url, '_blank', 'noopener,noreferrer')
      setRawLink(`SHA-256 ${result.sha256}; private download expires in ${result.expiresIn} seconds.`)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <section className="dist-admin">
    <header className="dist-header"><div><span className="dist-eyebrow">MIDNIGHT SOCIAL · OPERATIONS</span><h1>Distribution desk</h1><p>Review authentic partner submissions. Receipt is not approval or proof of downstream delivery.</p></div><button className="dist-refresh" onClick={load} disabled={loading}><RefreshCw size={16}/>Refresh</button></header>
    {error && <div className="dist-alert error"><AlertTriangle size={17}/>{error}</div>}{notice && <div className="dist-alert ok"><Check size={17}/>{notice}</div>}
    <section className="dist-partners"><div className="dist-section-title"><h2>Partner connections</h2><span>Only configured endpoints are shown; no credentials are displayed.</span></div>{payload.partners.map((partner) => <article className="dist-partner" key={partner.id}><div className="dist-partner-icon"><Music2 size={18}/></div><div className="dist-partner-name"><b>{partner.name}</b><small>{partner.id}</small></div><div className={`dist-state ${partner.integrationVerified ? 'verified' : ''}`}><i/>{partner.state}</div></article>)}<p className="dist-caution"><CircleHelp size={15}/>A saved API key alone never marks an integration verified; endpoint and transfer details require a real test.</p></section>
    <div className="dist-workspace">
      <section className="dist-inbox"><div className="dist-section-title"><h2>Incoming releases</h2><span>{payload.records.length} shown · max 250</span></div><div className="dist-filters"><div className="dist-search"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, artist, UPC"/></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter status">{STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value || 'All statuses'}</option>)}</select></div>
        {loading ? <p className="dist-empty">Loading distribution queue…</p> : payload.records.length ? <div className="dist-record-list">{payload.records.map((record) => <button className={`dist-record ${selectedId === record.id ? 'active' : ''}`} key={record.id} onClick={() => setSelectedId(record.id)}><div className="dist-record-top"><b>{record.metadata?.title || 'Untitled release'}</b><span className={`dist-status status-${record.status}`}>{record.status?.replaceAll('_', ' ')}</span></div><span>{(record.metadata?.artistNames || []).join(', ') || 'Artist match required'}</span><small>{record.partnerName} · {record.receivedAt ? new Date(record.receivedAt).toLocaleString() : ''}</small><div className="dist-record-foot"><span>{record.assets?.filter((asset) => asset.state === 'uploaded').length || 0}/{record.assets?.length || 0} assets</span>{record.identityConflicts?.length > 0 && <span className="dist-conflict">ID conflict</span>}{record.schemaValidation?.state !== 'passed' && <span className="dist-pending">ERN validation pending</span>}</div></button>)}</div> : <p className="dist-empty">No matching deliveries. The intake stays closed until partner and server credentials are configured.</p>}</section>

      <section className="dist-review">{!selected ? <div className="dist-empty detail-empty"><Music2 size={26}/><p>Select a delivery to review.</p></div> : <>
        <div className="dist-review-title"><div><span className="dist-eyebrow">{selected.partnerName} · {selected.messageId}</span><h2>{selected.metadata?.title || 'Untitled release'}</h2><p>{(selected.metadata?.artistNames || []).join(', ') || 'Artist identity needs review'}</p></div><span className={`dist-status status-${selected.status}`}>{selected.status?.replaceAll('_', ' ')}</span></div>
        <div className="dist-warning"><ShieldCheck size={17}/><span>ERN namespace {selected.ernNamespace || 'unknown'} · exact schema {selected.schemaValidation?.exactSchemaVersion || 'not validated'} · {selected.schemaValidation?.state || 'pending'}</span></div>
        <div className="dist-meta-grid"><div><small>UPC/EAN</small><b>{selected.metadata?.upcs?.join(', ') || 'Missing'}</b></div><div><small>ISRCs</small><b>{selected.metadata?.isrcs?.length || 0} track identifiers</b></div><div><small>Release type</small><b>{selected.metadata?.releaseType || 'Unknown'}</b></div><div><small>Label</small><b>{selected.metadata?.labels?.join(', ') || 'Not supplied'}</b></div><div><small>Copyright</small><b>{selected.metadata?.copyrights?.join(' · ') || 'Not supplied'}</b></div><div><small>Genre / language</small><b>{[...(selected.metadata?.genres || []), ...(selected.metadata?.languages || [])].join(' · ') || 'Not supplied'}</b></div></div>
        <div className="dist-assets"><h3>Delivery assets</h3>{selected.assets?.map((asset) => <div key={asset.id}><span>{asset.role === 'audio' ? <Music2 size={15}/> : <FileText size={15}/>}<b>{asset.role}</b><small>{asset.resourceReference || asset.originalFilename || asset.id} · {(asset.size / (1024 * 1024)).toFixed(1)} MB</small></span><em className={asset.state === 'uploaded' ? 'good' : ''}>{asset.state}</em></div>)}</div>
        {selected.identityConflicts?.length > 0 && <div className="dist-conflict-panel"><h3><AlertTriangle size={16}/> Duplicate identifiers</h3>{selected.identityConflicts.map((conflict, index) => <p key={`${conflict.type}-${conflict.value}-${index}`}>{conflict.type.toUpperCase()} {conflict.value} · existing candidate(s): {conflict.candidateDeliveryIds?.join(', ')}</p>)}<button disabled={busy || !selected.identityConflicts[0]?.candidateDeliveryIds?.length} onClick={() => act('resolve_identity_conflict')}>Merge this delivery into first candidate</button></div>}
        <button className="dist-source" onClick={openSource} disabled={busy}><FileText size={15}/>Review original ERN XML</button>{rawLink && <small className="dist-raw-note">{rawLink}</small>}
        <div className="dist-rights-review"><h3>Human review before approval</h3><label>Confirmed release date<select value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}><option value="">Select a DDEX date</option>{(selected.metadata?.releaseDates || []).map((date) => <option key={date} value={date}>{date}</option>)}</select></label><div className="dist-territories"><small>Grant only territories verified in the original DDEX deal terms.</small>{(selected.metadata?.territories || []).map((code) => <label key={code}><input type="checkbox" checked={territories.includes(code)} onChange={(e) => setTerritories((current) => e.target.checked ? [...new Set([...current, code])] : current.filter((value) => value !== code))}/>{code}</label>)}</div><label className="dist-check"><input type="checkbox" checked={confirmMetadata} onChange={(e) => setConfirmMetadata(e.target.checked)}/>I reviewed release metadata, identifiers, artists and asset references.</label><label className="dist-check"><input type="checkbox" checked={confirmRights} onChange={(e) => setConfirmRights(e.target.checked)}/>I reviewed the original ERN deals and confirm these territories and release date are permitted.</label></div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note / rejection reason / takedown reason" aria-label="Admin review note"/>
        <div className="dist-actions"><button className="primary" onClick={approve} disabled={busy || !confirmRights || !confirmMetadata}><Check size={15}/>Approve / schedule</button><button onClick={() => act('request_correction')} disabled={busy}>Request correction</button><button className="danger" onClick={() => act('reject')} disabled={busy}>Reject</button><button className="danger subtle" onClick={() => act('takedown')} disabled={busy}>Takedown</button></div>
        <div className="dist-history"><h3>Processing history</h3>{(selected.history || []).slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><Clock3 size={13}/><span><b>{entry.action?.replaceAll('_', ' ')}</b><small>{entry.note}</small></span><time>{entry.at ? new Date(entry.at).toLocaleString() : ''}</time></div>)}</div>
      </>}</section>
    </div>
  </section>
}
