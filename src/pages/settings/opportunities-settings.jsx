"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { leadAutomationAPI, leadSourcesAPI, leadSourceMappingsAPI, openPhoneAPI, leadbridgeAPI, zenbookerAPI, sourceIssuesAPI, participantsAPI, identitiesAPI, integrationsAPI, opContactsAPI } from "../../services/api"
import { ChevronLeft, Zap, Loader2, Plus, X, Pencil, Check, Trash2, Wand2, GripVertical, ChevronDown, Search, RefreshCw, AlertTriangle, Users, HelpCircle, Database, Link2 } from "lucide-react"

const EVENT_DEFS = [
  { event: 'lead_received', label: 'Lead Received', desc: 'New lead arrives from Thumbtack or Yelp' },
  { event: 'first_reply_sent', label: 'First Reply Sent', desc: 'You send the first message to the lead' },
  { event: 'conversation_ongoing', label: 'Conversation Ongoing', desc: 'Further messages exchanged before proposal' },
  { event: 'proposal_sent', label: 'Proposal / Quote Sent', desc: 'Quote or proposal sent to the customer' },
  { event: 'job_created', label: 'Job Created', desc: 'Job created for this lead — converts to customer' },
]

const PROV_SHORT = { openphone: 'OP', leadbridge: 'LB', customer: 'CR' }

// Client-side CSV export for the unidentified-leads lists. Escapes quotes and
// wraps any value that contains comma/quote/newline.
function downloadCsv(filename, columns, rows) {
  const esc = v => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map(c => esc(c.label)).join(',')
  const body = (rows || []).map(r => columns.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n')
  const csv = header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}
const PROV_COLOR = { openphone: 'bg-blue-50 text-blue-600 border-blue-100', leadbridge: 'bg-amber-50 text-amber-600 border-amber-100', customer: 'bg-violet-50 text-violet-600 border-violet-100' }

const LeadsSettings = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [rules, setRules] = useState([])
  const [stages, setStages] = useState([])
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)

  const [sources, setSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [newSourceName, setNewSourceName] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [savingSource, setSavingSource] = useState(null)

  const [mappings, setMappings] = useState([])
  const [unmapped, setUnmapped] = useState([])
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [savingMapping, setSavingMapping] = useState(null)
  const [suggesting, setSuggesting] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null) // source name with open dropdown

  // Drag
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // Sync (pulls fresh company data from OpenPhone + LeadBridge)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null)
  const [syncResult, setSyncResult] = useState(null)

  // Combined OpenPhone refresh+sync (Sigcore /contacts/sync → SF /communications/sync)
  const [opSyncRunning, setOpSyncRunning] = useState(false)
  const [opSyncProgress, setOpSyncProgress] = useState(null) // { phase, started_at, finished_at, error, counts, sigcore_result }
  const [opSyncResult, setOpSyncResult] = useState(null)

  // Source issues (post-sync manual resolution)
  const [issues, setIssues] = useState(null)
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [mergingPair, setMergingPair] = useState(null) // "srcId-targetId"

  // Phase F — identity reporting (read-only; technical controls moved to Integration cards)
  const [idStatus, setIdStatus] = useState(null)
  const [idBySource, setIdBySource] = useState(null)
  const [idUnresolved, setIdUnresolved] = useState(null)
  const [idAmbiguities, setIdAmbiguities] = useState(null)
  const [idReportLoading, setIdReportLoading] = useState(false)

  // Phase H — ambiguity resolution modal
  const [ambigModal, setAmbigModal] = useState(null)
  const [ambigActionBusy, setAmbigActionBusy] = useState(false)

  // Phase I — OpenPhone lead creation outcomes (rolling 24h / 7d)
  const [opOutcomes, setOpOutcomes] = useState(null)

  // Phase J — Integration cards (Connect · Sync Now · last sync)
  const [integrationStatus, setIntegrationStatus] = useState(null)
  const [syncBusy, setSyncBusy] = useState({}) // { openphone: true, leadbridge: false, ... }
  const [aiBusy, setAiBusy] = useState({}) // { <identityId>: true } during classify
  const [aiBatchBusy, setAiBatchBusy] = useState(false)
  const [aiBatchProgress, setAiBatchProgress] = useState(null) // { done, total, cost }
  // Per-row Company picker for the OP-missing-Company list. phone → selected source name.
  const [pendingCompany, setPendingCompany] = useState({})
  const [companyBusy, setCompanyBusy] = useState({}) // { <phone>: true } while saving

  useEffect(() => {
    loadRules(); loadSources(); loadMappings(); loadIssues(); loadIdentityReport()
    // Check if a classify batch is running on mount; if so, show the bar + start polling.
    ;(async () => {
      try {
        const p = await identitiesAPI.classifyBatchProgress()
        if (p) setAiBatchProgress(p)
        if (p?.running) {
          setAiBatchBusy(true)
          try {
            for (let i = 0; i < 1200; i++) {
              await new Promise(r => setTimeout(r, 3000))
              let x
              try { x = await identitiesAPI.classifyBatchProgress() } catch { continue }
              if (!x) break
              setAiBatchProgress(x)
              if (!x.running) break
            }
            await loadIdentityReport(); await loadIssues()
          } finally { setAiBatchBusy(false) }
        }
      } catch (_) { /* non-fatal */ }
    })()
  }, [])

  const loadIssues = async () => {
    setIssuesLoading(true)
    try { setIssues(await sourceIssuesAPI.list()) }
    catch (e) { console.error('Failed to load issues:', e) }
    finally { setIssuesLoading(false) }
  }

  const handleMergeCustomers = async (sourceId, targetId) => {
    if (!window.confirm(`Merge customer #${sourceId} INTO #${targetId}?\n\nThis moves all jobs/invoices/etc from the source record, then deletes the source. Cannot be undone.`)) return
    const key = `${sourceId}-${targetId}`
    setMergingPair(key)
    try {
      await sourceIssuesAPI.mergeCustomers(sourceId, targetId)
      await loadIssues()
    } catch (e) { alert('Merge failed: ' + (e.response?.data?.error || e.message)) }
    finally { setMergingPair(null) }
  }

  // Phase F — identity reporting loaders (now also loads integration status)
  const loadIdentityReport = async () => {
    setIdReportLoading(true)
    try {
      const [status, bySource, unresolved, ambiguities, outcomes, integrations] = await Promise.all([
        identitiesAPI.status(),
        identitiesAPI.bySource(),
        identitiesAPI.unresolved({ limit: 200 }),
        identitiesAPI.reconciliationFailures({ status: 'open', limit: 200 }),
        identitiesAPI.opLeadOutcomes().catch(() => null),
        integrationsAPI.status().catch(() => null),
      ])
      setIdStatus(status); setIdBySource(bySource); setIdUnresolved(unresolved); setIdAmbiguities(ambiguities)
      setOpOutcomes(outcomes)
      setIntegrationStatus(integrations)
    } catch (e) { console.error('identity report load failed', e) }
    finally { setIdReportLoading(false) }
  }

  // Phase J — one Sync Now per integration. Two-phase: (1) actual external pull
  // via the source-specific endpoint, (2) post-sync orchestrator (source-fill
  // + lead-recovery + issue counting). Polls each phase until done.
  const handleSyncIntegration = async (source) => {
    setSyncBusy(b => ({ ...b, [source]: true }))
    const pollUntilIdle = async (getProgress, max = 300) => {
      for (let i = 0; i < max; i++) {
        await new Promise(r => setTimeout(r, 2000))
        let p; try { p = await getProgress() } catch { continue }
        const s = p?.status
        if (!s || s === 'done' || s === 'error' || s === 'idle' || s === 'completed') return p
      }
      return null
    }
    try {
      // Phase 1: actual external pull. Each source has its own established
      // sync endpoint; we trigger then poll. Tolerant of 409 (already running).
      try {
        if (source === 'openphone') {
          await openPhoneAPI.sync().catch(e => { if (e.response?.status !== 409) throw e })
          await pollUntilIdle(() => openPhoneAPI.getSyncProgress())
        } else if (source === 'leadbridge') {
          await leadbridgeAPI.sync(null).catch(e => { if (e.response?.status !== 409) throw e })
          await pollUntilIdle(() => leadbridgeAPI.getSyncProgress())
        } else if (source === 'zenbooker') {
          await zenbookerAPI.sync().catch(e => { if (e.response?.status !== 409) throw e })
          await pollUntilIdle(() => zenbookerAPI.syncProgress())
        }
      } catch (phase1err) {
        // Surface the error but still try the orchestrator post-sync — it's
        // useful to run source-fill and lead-recovery even if the pull failed.
        console.warn('Phase 1 (actual pull) failed:', phase1err)
      }
      // Phase 2: orchestrator (source-fill + recreate-op-leads + issue count).
      await integrationsAPI.sync(source).catch(e => { if (e.response?.status !== 409) throw e })
      await pollUntilIdle(() => integrationsAPI.syncProgress(source))
      await loadIdentityReport(); await loadIssues()
    } catch (e) { alert('Sync failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSyncBusy(b => ({ ...b, [source]: false })) }
  }

  // AI classifier — per-row + batch. Persists ai_category / ai_summary on identity.
  const handleAiClassify = async (identityId) => {
    setAiBusy(b => ({ ...b, [identityId]: true }))
    try {
      const verdict = await identitiesAPI.classify(identityId)
      const patch = { ai_category: verdict.category, ai_confidence: verdict.confidence, ai_summary: verdict.summary }
      // Patch both lists — the identity may appear in the floating list AND in
      // the OP-contacts-missing-Company sample (linked via participant_identity_id).
      setIdUnresolved(prev => prev && prev.items
        ? { ...prev, items: prev.items.map(r => r.id === identityId ? { ...r, ...patch } : r) }
        : prev
      )
      setIssues(prev => {
        if (!prev?.namedContactsMissingCompany?.sample) return prev
        return {
          ...prev,
          namedContactsMissingCompany: {
            ...prev.namedContactsMissingCompany,
            sample: prev.namedContactsMissingCompany.sample.map(c => c.participant_identity_id === identityId ? { ...c, ...patch } : c),
          },
        }
      })
    } catch (e) { alert('Classify failed: ' + (e.response?.data?.error || e.message)) }
    finally { setAiBusy(b => ({ ...b, [identityId]: false })) }
  }
  // Set Company tag for an OP contact directly in SF. After save, the row
  // disappears from the missing-Company list and source attribution flows
  // through to the linked customer/lead via source-fill.
  const handleSetCompany = async (phone) => {
    const company = pendingCompany[phone]
    if (!company) return
    setCompanyBusy(b => ({ ...b, [phone]: true }))
    try {
      const result = await opContactsAPI.setCompany(phone, company)
      // Drop the row from the OP-missing-Company list (it now has a Company tag).
      setIssues(prev => {
        if (!prev?.namedContactsMissingCompany?.sample) return prev
        const newSample = prev.namedContactsMissingCompany.sample.filter(c => c.participant_phone !== phone)
        return {
          ...prev,
          namedContactsMissingCompany: {
            ...prev.namedContactsMissingCompany,
            sample: newSample,
            count: Math.max(0, (prev.namedContactsMissingCompany.count || 0) - 1),
          },
        }
      })
      // If a lead was created (identity was floating with no CRM link), remove
      // the row from the floating list too — it's now a Connected lead.
      if (result?.lead_created?.id) {
        setIdUnresolved(prev => {
          if (!prev?.items) return prev
          const last10 = String(phone || '').replace(/\D/g, '').slice(-10)
          return { ...prev, items: prev.items.filter(r => String(r.normalized_phone || '').replace(/\D/g, '').slice(-10) !== last10) }
        })
      }
      setPendingCompany(p => { const n = { ...p }; delete n[phone]; return n })
    } catch (e) {
      alert('Set Company failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setCompanyBusy(b => { const n = { ...b }; delete n[phone]; return n })
    }
  }

  // Soft-delete handlers — drop a row from a "Needs attention" list.
  const handleHideAmbiguity = async (ambigId) => {
    if (!window.confirm('Hide this reconciliation failure? It will be marked abandoned and removed from the queue.')) return
    try {
      await identitiesAPI.abandonAmbiguity(ambigId)
      setIdAmbiguities(prev => prev?.items
        ? { ...prev, items: prev.items.filter(r => r.id !== ambigId) }
        : prev)
    } catch (e) { alert('Hide failed: ' + (e.response?.data?.error || e.message)) }
  }
  const handleHideOpContact = async (phone) => {
    if (!window.confirm(`Hide ${phone} from this list? Won't reappear unless OpenPhone sends a new message.`)) return
    try {
      await opContactsAPI.hideByPhone(phone)
      setIssues(prev => prev?.namedContactsMissingCompany?.sample
        ? {
            ...prev,
            namedContactsMissingCompany: {
              ...prev.namedContactsMissingCompany,
              sample: prev.namedContactsMissingCompany.sample.filter(c => c.participant_phone !== phone),
              count: Math.max(0, (prev.namedContactsMissingCompany.count || 0) - 1),
            },
          }
        : prev)
    } catch (e) { alert('Hide failed: ' + (e.response?.data?.error || e.message)) }
  }
  const handleHideFloating = async (identityId) => {
    if (!window.confirm('Hide this identity from review? It will stay in the database but won\'t show up here again.')) return
    try {
      await identitiesAPI.hide(identityId)
      setIdUnresolved(prev => prev?.items
        ? { ...prev, items: prev.items.filter(r => r.id !== identityId) }
        : prev)
    } catch (e) { alert('Hide failed: ' + (e.response?.data?.error || e.message)) }
  }

  // Same batch flow, but classifies the identities behind OP-contacts-missing-Company.
  const handleAiClassifyOpContacts = async () => {
    const sample = issues?.namedContactsMissingCompany?.sample || []
    const unclassified = sample.filter(c => c.participant_identity_id && !c.ai_category).map(c => c.participant_identity_id)
    if (unclassified.length === 0) { alert('Nothing to classify — all OP contacts already have an AI verdict.'); return }
    if (!window.confirm(`Classify ${unclassified.length} OpenPhone contacts with AI? (~$${(unclassified.length * 0.0003).toFixed(3)} in OpenAI costs)`)) return
    setAiBatchBusy(true); setAiBatchProgress({ done: 0, total: unclassified.length, cost: 0, running: true })
    try {
      await identitiesAPI.classifyBatch(unclassified, unclassified.length)
      // Progress is now DB-backed — a Railway restart no longer drops state,
      // worker is respawned at boot with done-offset preserved.
      for (let i = 0; i < 1200; i++) {
        await new Promise(r => setTimeout(r, 3000))
        let p
        try { p = await identitiesAPI.classifyBatchProgress() } catch { continue }
        if (!p) break
        setAiBatchProgress(p)
        if (!p.running) break
      }
      await loadIssues(); await loadIdentityReport()
    } catch (e) {
      if (e.response?.status === 409) {
        for (let i = 0; i < 600; i++) {
          await new Promise(r => setTimeout(r, 3000))
          let p
          try { p = await identitiesAPI.classifyBatchProgress() } catch { continue }
          if (!p) break
          setAiBatchProgress(p)
          if (!p.running) break
        }
        await loadIssues(); await loadIdentityReport()
      } else {
        alert('Batch failed: ' + (e.response?.data?.error || e.message))
      }
    } finally { setAiBatchBusy(false) }
  }

  const handleAiClassifyBatch = async () => {
    const items = idUnresolved?.items || []
    const unclassified = items.filter(r => !r.ai_category).map(r => r.id)
    if (unclassified.length === 0) { alert('Nothing to classify — all rows already have an AI verdict.'); return }
    if (!window.confirm(`Classify ${unclassified.length} floating identities with AI? (~$${(unclassified.length * 0.0003).toFixed(3)} in OpenAI costs)`)) return
    setAiBatchBusy(true); setAiBatchProgress({ done: 0, total: unclassified.length, cost: 0, running: true })
    try {
      // Fire-and-forget; backend runs async and we poll.
      await identitiesAPI.classifyBatch(unclassified, unclassified.length)
      // Poll progress every 3s until done.
      // Progress is now DB-backed — a Railway restart no longer drops state,
      // worker is respawned at boot with done-offset preserved.
      for (let i = 0; i < 1200; i++) {
        await new Promise(r => setTimeout(r, 3000))
        let p
        try { p = await identitiesAPI.classifyBatchProgress() } catch { continue }
        if (!p) break
        setAiBatchProgress(p)
        if (!p.running) break
      }
      await loadIdentityReport() // full reload so list reflects all verdicts
    } catch (e) {
      if (e.response?.status === 409) {
        // Already running — just start polling
        for (let i = 0; i < 600; i++) {
          await new Promise(r => setTimeout(r, 3000))
          let p
          try { p = await identitiesAPI.classifyBatchProgress() } catch { continue }
          if (!p) break
          setAiBatchProgress(p)
          if (!p.running) break
        }
        await loadIdentityReport()
      } else {
        alert('Batch failed: ' + (e.response?.data?.error || e.message))
      }
    } finally { setAiBatchBusy(false) }
  }

  // Phase H — ambiguity resolution
  const openAmbigModal = async (row) => {
    setAmbigModal({ loading: true, ambiguity: row, candidates: [] })
    try {
      const data = await identitiesAPI.ambiguityCandidates(row.id)
      setAmbigModal({ loading: false, ambiguity: data.ambiguity, candidates: data.candidates || [] })
    } catch (e) { setAmbigModal({ loading: false, ambiguity: row, candidates: [], error: e.response?.data?.error || e.message }) }
  }
  const closeAmbigModal = () => setAmbigModal(null)
  const resolveAmbig = async (action, target_identity_id = null) => {
    if (!ambigModal?.ambiguity) return
    if (action === 'abandon' && !window.confirm('Abandon this ambiguity? The attempted source event will not be linked to any identity.')) return
    setAmbigActionBusy(true)
    try {
      await identitiesAPI.resolveAmbiguity(ambigModal.ambiguity.id, { action, target_identity_id })
      closeAmbigModal()
      await loadIdentityReport()
    } catch (e) {
      alert('Resolve failed: ' + (e.response?.data?.error || e.message))
    } finally { setAmbigActionBusy(false) }
  }

  const loadRules = async () => {
    setLoading(true)
    try {
      const data = await leadAutomationAPI.getRules()
      setRules(data.rules || []); setStages(data.stages || [])
      if (!(data.rules || []).length) {
        await leadAutomationAPI.seedDefaults()
        const r = await leadAutomationAPI.getRules()
        setRules(r.rules || []); setStages(r.stages || [])
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  const loadSources = async () => {
    setSourcesLoading(true)
    try {
      const data = await leadSourcesAPI.list()
      let list = data.sources || []
      if (!list.length) { list = (await leadSourcesAPI.seed()).sources || [] }
      setSources(list)
    } catch (e) { console.error(e) } finally { setSourcesLoading(false) }
  }
  const loadMappings = async () => {
    setMappingsLoading(true)
    try {
      const data = await leadSourceMappingsAPI.list()
      setMappings(data.mappings || []); setUnmapped(data.unmapped || [])
    } catch (e) { console.error(e) } finally { setMappingsLoading(false) }
  }
  const reload = () => Promise.all([loadSources(), loadMappings()])

  // All raw values (mapped + unmapped), keyed for quick lookup
  const allRawValues = useMemo(() => {
    const list = []
    for (const u of unmapped) list.push({ ...u, mapped: false })
    for (const m of mappings) list.push({ raw_value: m.raw_value, provider: m.provider, count: null, mapped: true, mappingId: m.id, source_name: m.source_name })
    return list
  }, [unmapped, mappings])

  // Available (unmapped) values for dropdown — exclude already mapped ones
  const availableForDropdown = useMemo(() => {
    return allRawValues.filter(v => !v.mapped)
  }, [allRawValues])

  // Group mappings by source
  const sourceRows = useMemo(() => {
    const map = {}
    for (const s of sources) map[s.name] = { ...s, mappedValues: [] }
    for (const m of mappings) {
      if (map[m.source_name]) map[m.source_name].mappedValues.push(m)
    }
    return Object.values(map)
  }, [sources, mappings])

  // Source actions
  const handleAddSource = async () => {
    if (!newSourceName.trim()) return
    setSavingSource('new')
    try { await leadSourcesAPI.create(newSourceName.trim()); setNewSourceName(''); setAddingSource(false); await reload() }
    catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingSource(null) }
  }
  const handleRenameSource = async (id) => {
    if (!editName.trim()) return
    setSavingSource(id)
    try { await leadSourcesAPI.update(id, { name: editName.trim() }); setEditingId(null); setEditName(''); await reload() }
    catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingSource(null) }
  }
  const handleDeleteSource = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    setSavingSource(id)
    try { await leadSourcesAPI.remove(id); await reload() }
    catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingSource(null) }
  }

  // Mapping actions
  const handleAddMapping = async (sourceName, raw_value, provider) => {
    const key = `${provider}:${raw_value}`
    setSavingMapping(key)
    try { await leadSourceMappingsAPI.save({ raw_value, source_name: sourceName, provider }); await loadMappings() }
    catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingMapping(null) }
  }
  const handleDeleteMapping = async (id) => {
    setSavingMapping(id)
    try { await leadSourceMappingsAPI.remove(id); await loadMappings() }
    catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSavingMapping(null) }
  }
  const handleAutoSuggest = async () => {
    setSuggesting(true)
    try {
      const data = await leadSourceMappingsAPI.autoSuggest()
      const toSave = (data.suggestions || []).map(s => ({ raw_value: s.raw_value, source_name: s.source_name, provider: s.provider }))
      if (toSave.length) { await leadSourceMappingsAPI.saveBulk(toSave); await loadMappings() }
    } catch (e) { console.error(e) }
    finally { setSuggesting(false) }
  }

  // Drag reorder
  const handleDragStart = (e, idx) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', idx) }
  const handleDragOver = (e, idx) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(idx) }
  const handleDrop = async (e, dropIdx) => {
    e.preventDefault(); setDragOverIdx(null)
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return }
    const ids = sourceRows.map(s => s.id).filter(Boolean)
    const moved = ids.splice(dragIdx, 1)[0]
    if (!moved) { setDragIdx(null); return }
    ids.splice(dropIdx, 0, moved); setDragIdx(null)
    try { const r = await leadSourcesAPI.reorder(ids); setSources(r.sources || []) }
    catch (e) { await loadSources() }
  }
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

  // Automation
  const handleStageChange = async (eventType, stageId) => {
    if (!stageId) return; setSaving(eventType)
    try {
      for (const ch of ['thumbtack', 'yelp']) await leadAutomationAPI.saveRule({ channel: ch, eventType, targetStageId: parseInt(stageId), enabled: true, autoConvertToCustomer: eventType === 'job_created' })
      setRules((await leadAutomationAPI.getRules()).rules || [])
    } catch (e) { alert('Failed: ' + (e.response?.data?.error || e.message)) }
    finally { setSaving(null) }
  }
  const getRuleForEvent = (et) => rules.find(r => r.eventType === et && r.channel === 'thumbtack') || rules.find(r => r.eventType === et)

  // Sync all sources (OpenPhone + LeadBridge) — pulls fresh company data
  const handleSyncAll = async () => {
    setSyncing(true); setSyncResult(null)
    setSyncProgress({ op: 'starting', lb: 'starting', zb: 'starting' })
    try {
      // Drive each of the three sources through the two-phase pipeline in
      // parallel, updating syncProgress per source on each tick so the UI
      // can render a live status row for each.
      const sources = [
        { key: 'openphone', short: 'op', api: openPhoneAPI, getProgress: () => openPhoneAPI.getSyncProgress(), startArg: undefined },
        { key: 'leadbridge', short: 'lb', api: leadbridgeAPI, getProgress: () => leadbridgeAPI.getSyncProgress(), startArg: null },
        { key: 'zenbooker',  short: 'zb', api: zenbookerAPI,  getProgress: () => zenbookerAPI.syncProgress(),    startArg: undefined },
      ]
      const setStatus = (short, patch) => setSyncProgress(prev => ({ ...prev, ...patch, [short]: patch.status || prev?.[short] }))

      const runOne = async ({ key, short, api, getProgress, startArg }) => {
        try {
          // Phase 1: actual external pull.
          setStatus(short, { status: 'pulling' })
          await api.sync(startArg).catch(e => { if (e?.response?.status !== 409) throw e })
          for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 2000))
            let p; try { p = await getProgress() } catch { continue }
            const s = p?.status
            setStatus(short, {
              status: s === 'running' ? 'pulling' : s,
              [`${short}Synced`]: p?.synced, [`${short}Total`]: p?.total,
            })
            if (!s || s === 'done' || s === 'error' || s === 'idle' || s === 'completed') break
          }
          // Phase 2: orchestrator (source-fill + recreate-op-leads + issues).
          setStatus(short, { status: 'finalizing' })
          await integrationsAPI.sync(key).catch(e => { if (e?.response?.status !== 409) throw e })
          for (let i = 0; i < 300; i++) {
            await new Promise(r => setTimeout(r, 2000))
            let p; try { p = await integrationsAPI.syncProgress(key) } catch { continue }
            const s = p?.status
            if (!s || s === 'done' || s === 'error' || s === 'idle') break
          }
          setStatus(short, { status: 'done' })
        } catch (e) {
          setStatus(short, { status: 'error', [`${short}Error`]: e?.response?.data?.error || e.message })
          throw e
        }
      }

      const results = await Promise.allSettled(sources.map(runOne))
      const errors = results.filter(r => r.status === 'rejected').length
      setSyncResult({
        ok: errors === 0,
        message: errors === 0
          ? 'All three sources synced. Refresh to see updated sources.'
          : `Sync finished with ${errors} of 3 sources erroring (likely an expired token — reconnect).`,
      })
      await Promise.all([loadMappings(), loadIssues(), loadIdentityReport()])
    } catch (e) {
      setSyncResult({ error: e?.response?.data?.error || e.message })
    } finally {
      setSyncing(false)
    }
  }

  // Combined OpenPhone refresh + SF sync. Runs Sigcore /contacts/sync to
  // completion, then SF /communications/sync, then surfaces touched-row counts.
  const handleSyncOpenPhone = async () => {
    setOpSyncRunning(true); setOpSyncResult(null); setOpSyncProgress({ phase: 'starting' })
    try {
      try { await opContactsAPI.refreshAndSync() }
      catch (e) {
        if (e?.response?.status !== 409) throw e
        // 409 → job already running; continue to poll the existing one.
      }
      // Poll progress until terminal. Cap at ~25 min (matches backend timeout).
      let last = null
      for (let i = 0; i < 500; i++) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const p = await opContactsAPI.refreshAndSyncProgress()
          last = p
          setOpSyncProgress(p)
          if (p?.phase === 'done' || p?.phase === 'error') break
        } catch { /* transient — keep polling */ }
      }
      if (last?.phase === 'error') {
        setOpSyncResult({ error: last.error || 'Sync failed' })
      } else if (last?.phase === 'done') {
        setOpSyncResult({ ok: true, counts: last.counts, sigcore_result: last.sigcore_result })
      } else {
        setOpSyncResult({ error: 'Timed out waiting for sync to complete' })
      }
      // Refresh issues panel so user immediately sees fewer "missing company" rows
      await Promise.all([loadIssues(), loadMappings(), loadIdentityReport()])
    } catch (e) {
      setOpSyncResult({ error: e?.response?.data?.error || e.message })
    } finally {
      setOpSyncRunning(false)
    }
  }

  const isLoading = sourcesLoading || mappingsLoading
  const unmappedCount = unmapped.length

  return (
    <div className="min-h-screen bg-[var(--sf-bg-page)]">
      {/* Phase H — ambiguity resolution modal */}
      {ambigModal && (() => {
        const a = ambigModal.ambiguity || {}
        const candidates = ambigModal.candidates || []
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeAmbigModal}>
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-3 border-b border-[var(--sf-border-light)] flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--sf-text-muted)] font-mono">Ambiguity #{a.id} · {a.source}</div>
                  <div className="text-sm font-semibold text-[var(--sf-text-primary)]">Resolve identity conflict</div>
                </div>
                <button onClick={closeAmbigModal} className="p-1 rounded hover:bg-[var(--sf-bg-hover)]" title="Close"><X size={16} /></button>
              </div>

              <div className="px-5 py-3 border-b border-[var(--sf-border-light)] bg-amber-50">
                <div className="text-[10px] uppercase tracking-wider text-amber-900 font-semibold mb-1">Attempted</div>
                <div className="text-xs space-y-0.5">
                  <div><strong>Name:</strong> {a.attempted_name || '(none)'}</div>
                  <div><strong>Phone:</strong> {a.attempted_phone || '(none)'}</div>
                  <div><strong>External ID:</strong> <span className="font-mono">{a.attempted_external_id || '(none)'}</span></div>
                  <div><strong>Reason:</strong> <em className="text-amber-800">{a.reason}</em></div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {ambigModal.loading ? (
                  <div className="text-xs text-[var(--sf-text-muted)] flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Loading candidates…
                  </div>
                ) : ambigModal.error ? (
                  <div className="text-xs text-red-600">Error: {ambigModal.error}</div>
                ) : candidates.length === 0 ? (
                  <div className="text-xs text-[var(--sf-text-muted)]">No candidate identities available. You can still create a new identity or abandon.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {candidates.map(c => (
                      <div key={c.id} className="border border-[var(--sf-border-light)] rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-[var(--sf-text-muted)] font-mono">Identity #{c.id}</div>
                            <div className="text-sm font-semibold text-[var(--sf-text-primary)]">{c.display_name || '(no name)'}</div>
                          </div>
                          <div className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{c.status || '—'}</div>
                        </div>
                        <div className="text-[11px] text-[var(--sf-text-secondary)] space-y-0.5">
                          <div>Phone: <span className="font-mono">{c.normalized_phone || '-'}</span></div>
                          <div>Email: <span className="font-mono">{c.email || '-'}</span></div>
                          <div>Sources: {(c.sources || []).join(', ') || '(none)'}</div>
                          <div>Priority: <span className="font-mono">{c.identity_priority_source || '-'}</span></div>
                        </div>
                        {c.lead && (
                          <div className="text-[11px] bg-emerald-50 border border-emerald-100 rounded p-2">
                            <div className="font-semibold text-emerald-800">Lead #{c.lead.id}</div>
                            <div className="text-emerald-700">{[c.lead.first_name, c.lead.last_name].filter(Boolean).join(' ')} · {c.lead.source || '-'}</div>
                          </div>
                        )}
                        {c.customer && (
                          <div className="text-[11px] bg-green-50 border border-green-100 rounded p-2">
                            <div className="font-semibold text-green-800">Customer #{c.customer.id}</div>
                            <div className="text-green-700">{[c.customer.first_name, c.customer.last_name].filter(Boolean).join(' ')} · {c.customer.phone || '-'}</div>
                          </div>
                        )}
                        {(c.recent_conversations || []).length > 0 && (
                          <div className="text-[10px] text-[var(--sf-text-muted)]">
                            <div className="font-semibold mb-0.5">Recent conversations:</div>
                            {c.recent_conversations.map(rc => (
                              <div key={rc.id} className="truncate">{rc.last_event_at?.slice(0, 10) || '?'} · {rc.channel} · {rc.last_preview?.slice(0, 60) || '(empty)'}</div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => resolveAmbig('merge_into', c.id)} disabled={ambigActionBusy}
                          className="w-full mt-2 px-3 py-1.5 text-xs bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center justify-center gap-1.5">
                          {ambigActionBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Merge into this identity
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-[var(--sf-border-light)] flex items-center gap-2 bg-[var(--sf-bg-page)]">
                <button onClick={() => resolveAmbig('create_new')} disabled={ambigActionBusy || ambigModal.loading}
                  className="px-3 py-1.5 text-xs border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                  {ambigActionBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Create new identity
                </button>
                <button onClick={() => resolveAmbig('abandon')} disabled={ambigActionBusy || ambigModal.loading}
                  className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)] rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                  <Trash2 size={12} />
                  Abandon
                </button>
                <div className="flex-1" />
                <button onClick={closeAmbigModal} className="px-3 py-1.5 text-xs text-[var(--sf-text-secondary)] hover:underline">
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div>
        <div className="bg-white border-b border-[var(--sf-border-light)] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/settings')} className="p-1.5 rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-muted)]"><ChevronLeft size={20} /></button>
            <div className="flex items-center gap-2">
              <Zap size={20} className="text-[var(--sf-blue-500)]" />
              <h1 className="text-lg font-bold text-[var(--sf-text-primary)]">Opportunities Settings</h1>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

          {/* ── LEAD SOURCES WITH INLINE MAPPING ── */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Opportunity Sources</h2>
                <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">
                  Map incoming values from OpenPhone and LeadBridge to your sources.
                  {unmappedCount > 0 && <span className="text-amber-600 font-medium"> {unmappedCount} unmapped</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={handleSyncAll} disabled={syncing}
                  className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1.5"
                  title="Pull fresh source data from OpenPhone + LeadBridge">
                  {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  {syncing ? 'Syncing...' : 'Sync All Sources'}
                </button>
                {unmappedCount > 0 && (
                  <button onClick={handleAutoSuggest} disabled={suggesting}
                    className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1.5">
                    {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                    Auto-map
                  </button>
                )}
              </div>
            </div>

            {/* Sync progress / result */}
            {(syncing || syncResult) && (
              <div className={`rounded-lg p-3 mb-3 text-xs ${syncResult?.error ? 'bg-red-50 text-red-600' : syncing ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                {syncing ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium"><Loader2 size={12} className="animate-spin" /> Syncing sources...</div>
                    {syncProgress && (() => {
                      const sourceRow = (label, short) => {
                        const status = syncProgress[short] || 'starting'
                        const synced = syncProgress[`${short}Synced`]
                        const total = syncProgress[`${short}Total`]
                        const err = syncProgress[`${short}Error`]
                        const dotClass = status === 'done' ? 'bg-green-500'
                          : status === 'error' ? 'bg-red-500'
                          : status === 'pulling' || status === 'finalizing' ? 'bg-blue-500 animate-pulse'
                          : 'bg-gray-300'
                        const pct = (total && total > 0) ? Math.min(100, Math.round((synced || 0) * 100 / total)) : null
                        return (
                          <div key={short}>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                              <span className="font-medium w-20">{label}</span>
                              <span className="text-[var(--sf-text-muted)] flex-1">
                                {status}{pct != null ? ` · ${synced}/${total} (${pct}%)` : (synced != null && total != null ? ` · ${synced}/${total}` : '')}
                                {err && <span className="text-red-600"> · {err}</span>}
                              </span>
                            </div>
                            {pct != null && (
                              <div className="h-1 w-full bg-white/50 rounded mt-0.5 overflow-hidden">
                                <div className={`h-full transition-all ${status === 'error' ? 'bg-red-500' : status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div className="space-y-1.5 mt-1.5">
                          {sourceRow('OpenPhone', 'op')}
                          {sourceRow('LeadBridge', 'lb')}
                          {sourceRow('Zenbooker', 'zb')}
                        </div>
                      )
                    })()}
                  </div>
                ) : syncResult?.error ? (
                  `Error: ${syncResult.error}`
                ) : (
                  syncResult?.message
                )}
              </div>
            )}

            {isLoading ? (
              <div className="bg-white rounded-xl border border-[var(--sf-border-light)] flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--sf-text-muted)]" />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[var(--sf-border-light)]">
                <div className="divide-y divide-[var(--sf-border-light)]">
                  {sourceRows.map((s, idx) => (
                    <SourceRow key={s.name} s={s} idx={idx}
                      editingId={editingId} editName={editName} setEditName={setEditName} setEditingId={setEditingId}
                      savingSource={savingSource} savingMapping={savingMapping}
                      handleRenameSource={handleRenameSource} handleDeleteSource={handleDeleteSource}
                      handleAddMapping={handleAddMapping} handleDeleteMapping={handleDeleteMapping}
                      reloadMappings={loadMappings}
                      availableForDropdown={availableForDropdown}
                      openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
                      dragIdx={dragIdx} dragOverIdx={dragOverIdx}
                      handleDragStart={handleDragStart} handleDragOver={handleDragOver}
                      handleDrop={handleDrop} handleDragEnd={handleDragEnd}
                    />
                  ))}
                </div>

                {/* Add source */}
                <div className="border-t border-[var(--sf-border-light)] px-5 py-3">
                  {addingSource ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newSourceName} onChange={e => setNewSourceName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddSource(); if (e.key === 'Escape') { setAddingSource(false); setNewSourceName('') } }}
                        placeholder="Source name..." className="flex-1 text-sm border border-[var(--sf-border-light)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                      <button onClick={handleAddSource} disabled={savingSource === 'new' || !newSourceName.trim()}
                        className="px-3 py-1.5 text-sm bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1.5">
                        {savingSource === 'new' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
                      </button>
                      <button onClick={() => { setAddingSource(false); setNewSourceName('') }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--sf-text-muted)]"><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingSource(true)}
                      className="flex items-center gap-1.5 text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] font-medium">
                      <Plus size={14} /> Add Source
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── UNIFIED IDENTITY (Phase F) ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-[var(--sf-blue-500)]" />
                <div>
                  <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Unified Identity</h2>
                  <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">
                    One identity per real person across LeadBridge, OpenPhone, and Zenbooker. Source-specific lead/customer creation.
                  </p>
                </div>
              </div>
              <button onClick={loadIdentityReport} disabled={idReportLoading}
                className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1.5">
                {idReportLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Refresh
              </button>
            </div>

            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5 space-y-4">
              {/* Health banner + action checklist. Implementation numbers live
                  behind "All identity details" at the bottom. */}
              {idStatus ? (() => {
                const ambigCount = idStatus.ambiguities_open || 0
                const opCompanyCount = issues?.namedContactsMissingCompany?.count || 0
                const floatingCount = idStatus.details?.floating_named || 0
                const hasAction = ambigCount > 0 || opCompanyCount > 0 || floatingCount > 0
                return (
                  <div>
                    <div className="flex items-center gap-2">
                      {hasAction ? (
                        <>
                          <AlertTriangle size={16} className="text-amber-500" />
                          <div className="text-sm font-semibold text-[var(--sf-text-primary)]">Needs attention</div>
                        </>
                      ) : (
                        <>
                          <Check size={16} className="text-green-600" />
                          <div className="text-sm font-semibold text-green-700">All clear</div>
                        </>
                      )}
                    </div>
                    {hasAction && (
                      <div className="mt-2 space-y-1.5">
                        {ambigCount > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-amber-800 hover:text-amber-900">
                              <strong>{ambigCount}</strong> reconciliation failure{ambigCount === 1 ? '' : 's'} — click to resolve
                            </summary>
                            {idAmbiguities?.items?.length > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                  <div className="text-[10px] text-[var(--sf-text-muted)]">
                                    {idAmbiguities.items.length < ambigCount ? `Showing ${idAmbiguities.items.length} of ${ambigCount}.` : `Showing all ${ambigCount}.`}
                                  </div>
                                  <button onClick={async () => {
                                    try {
                                      const blob = await identitiesAPI.reconciliationFailuresCsv({ status: 'open' })
                                      const url = URL.createObjectURL(blob)
                                      const a = document.createElement('a')
                                      a.href = url; a.download = 'reconciliation-failures.csv'
                                      document.body.appendChild(a); a.click()
                                      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
                                    } catch (e) { alert('CSV export failed: ' + (e.response?.data?.error || e.message)) }
                                  }}
                                    className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] flex items-center gap-1">
                                    ⬇ CSV
                                  </button>
                                </div>
                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                {idAmbiguities.items.map(row => (
                                  <div key={row.id} className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 rounded">
                                    <button onClick={() => openAmbigModal(row)}
                                      className="flex-1 text-left text-[11px] font-mono px-2 py-1 cursor-pointer border border-transparent hover:border-amber-300 rounded">
                                      <span className="text-amber-900">{row.source}</span>
                                      {' · '}<span>{row.attempted_name || '(no name)'}</span>
                                      {' · '}<span className="text-[var(--sf-text-muted)]">{row.attempted_phone || '-'}</span>
                                      {' · '}<em className="text-[10px]">{row.reason}</em>
                                    </button>
                                    <button onClick={() => handleHideAmbiguity(row.id)}
                                      className="px-2 py-1 text-[11px] text-[var(--sf-text-muted)] hover:text-red-600" title="Hide / abandon">×</button>
                                  </div>
                                ))}
                                </div>
                              </div>
                            )}
                          </details>
                        )}
                        {opCompanyCount > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-amber-800 hover:text-amber-900">
                              <strong>{opCompanyCount}</strong> OpenPhone contact{opCompanyCount === 1 ? '' : 's'} missing Company tag — fix in OpenPhone to attribute their source
                            </summary>
                            {(issues?.namedContactsMissingCompany?.sample || []).length > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                  <div className="text-[10px] text-[var(--sf-text-muted)]">
                                    {issues.namedContactsMissingCompany.sample.length < opCompanyCount
                                      ? `Showing ${issues.namedContactsMissingCompany.sample.length} of ${opCompanyCount}.`
                                      : `Showing all ${opCompanyCount}.`}
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => downloadCsv('op-contacts-missing-company.csv',
                                      [
                                        { key: 'participant_name', label: 'name' },
                                        { key: 'participant_phone', label: 'phone' },
                                        { key: 'ai_category', label: 'ai_category' },
                                        { key: 'ai_confidence', label: 'ai_confidence' },
                                        { key: 'ai_summary', label: 'ai_summary' },
                                        { key: 'participant_identity_id', label: 'identity_id' },
                                      ],
                                      issues.namedContactsMissingCompany.sample
                                    )}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] flex items-center gap-1">
                                      ⬇ CSV
                                    </button>
                                    <button onClick={handleAiClassifyOpContacts} disabled={aiBatchBusy}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] disabled:opacity-50 flex items-center gap-1">
                                      {aiBatchBusy ? <Loader2 size={10} className="animate-spin" /> : <>🤖</>}
                                      Classify all with AI
                                    </button>
                                    <button onClick={handleSyncOpenPhone} disabled={opSyncRunning}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-blue-500)] bg-[var(--sf-blue-500)] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                                      title="One-click: refresh contacts from OpenPhone via Sigcore, then sync into Service Flow.">
                                      {opSyncRunning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                      {opSyncRunning ? 'Syncing OpenPhone…' : 'Sync OpenPhone'}
                                    </button>
                                  </div>
                                </div>

                                {/* Live progress for combined OpenPhone refresh + SF sync */}
                                {(opSyncRunning || opSyncResult) && (() => {
                                  const phase = opSyncProgress?.phase || (opSyncResult?.error ? 'error' : 'done')
                                  const PHASES = [
                                    { key: 'sigcore_sync_starting', label: 'Pulling OpenPhone contacts (Sigcore)' },
                                    { key: 'sigcore_sync_running',  label: 'Pulling OpenPhone contacts (Sigcore)' },
                                    { key: 'sf_sync_starting',      label: 'Syncing into Service Flow' },
                                    { key: 'sf_sync_running',       label: 'Syncing into Service Flow' },
                                    { key: 'done',                  label: 'Done' },
                                  ]
                                  const order = ['starting', 'sigcore_sync_starting', 'sigcore_sync_running', 'sf_sync_starting', 'sf_sync_running', 'done']
                                  const idx = Math.max(0, order.indexOf(phase))
                                  const pct = phase === 'error' ? 100 : Math.round((idx / (order.length - 1)) * 100)
                                  const currentLabel = phase === 'error' ? 'Error'
                                    : phase === 'starting' ? 'Starting…'
                                    : (PHASES.find(p => p.key === phase)?.label || phase)
                                  const c = opSyncResult?.counts || opSyncProgress?.counts
                                  const sr = opSyncResult?.sigcore_result || opSyncProgress?.sigcore_result
                                  const isError = !!opSyncResult?.error || phase === 'error'
                                  return (
                                    <div className={`mt-2 mb-2 rounded-lg p-2 text-[11px] ${isError ? 'bg-red-50 text-red-700' : phase === 'done' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                      <div className="flex items-center gap-2 font-medium mb-1">
                                        {opSyncRunning ? <Loader2 size={11} className="animate-spin" /> : null}
                                        <span>{currentLabel}</span>
                                      </div>
                                      <div className="h-1 w-full bg-white/50 rounded overflow-hidden">
                                        <div className={`h-full transition-all ${isError ? 'bg-red-500' : phase === 'done' ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      {isError && (
                                        <div className="mt-1 text-[10px]">{opSyncResult?.error || opSyncProgress?.error}</div>
                                      )}
                                      {phase === 'done' && c && (
                                        <div className="mt-1 text-[10px] flex flex-wrap gap-x-3 gap-y-0.5">
                                          <span><strong>{c.rows_touched}</strong> rows touched</span>
                                          <span>{c.with_company} with company · {c.cleared_company} cleared</span>
                                          <span>{c.with_name} with name · {c.cleared_name} cleared</span>
                                          {c.phantoms_archived > 0 && <span><strong>{c.phantoms_archived}</strong> phantom{c.phantoms_archived === 1 ? '' : 's'} archived</span>}
                                          {sr?.processed != null && <span className="text-[var(--sf-text-muted)]">Sigcore processed {sr.processed} contacts</span>}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
                                {aiBatchProgress && (() => {
                                  const done = aiBatchProgress.done || 0
                                  const total = aiBatchProgress.total || 0
                                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                                  return (
                                    <div className="mb-2">
                                      <div className="flex items-center justify-between text-[10px] text-[var(--sf-text-muted)] mb-0.5">
                                        <span>{aiBatchProgress.running ? `Classifying…` : `Done`}</span>
                                        <span>{done}/{total || '?'} · ${(aiBatchProgress.cost || 0).toFixed(4)}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-[var(--sf-bg-page)] rounded overflow-hidden">
                                        <div className={`h-full transition-all duration-300 ${aiBatchProgress.running ? 'bg-[var(--sf-blue-500)]' : (aiBatchProgress.errors > 0 ? 'bg-amber-500' : 'bg-emerald-500')}`}
                                          style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>
                                  )
                                })()}
                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                  {issues.namedContactsMissingCompany.sample.map(c => {
                                    const cat = c.ai_category
                                    const catColor = cat === 'prospect' ? 'bg-emerald-100 text-emerald-800'
                                      : cat === 'existing_customer' ? 'bg-blue-100 text-blue-800'
                                      : cat === 'ad' ? 'bg-red-100 text-red-700'
                                      : cat === 'wrong_number' ? 'bg-gray-200 text-gray-700'
                                      : cat === 'unclear' ? 'bg-yellow-100 text-yellow-800'
                                      : ''
                                    const iid = c.participant_identity_id
                                    const aiBusyRow = iid && !!aiBusy[iid]
                                    const phoneKey = c.participant_phone
                                    const selected = pendingCompany[phoneKey] || ''
                                    const saving = !!companyBusy[phoneKey]
                                    return (
                                      <div key={c.id} className="text-[11px] px-2 py-1 bg-[var(--sf-bg-page)] rounded">
                                        <div className="flex gap-2 items-center font-mono">
                                          <span className="text-[var(--sf-text-primary)] truncate flex-1">{c.participant_name}</span>
                                          <span className="text-[var(--sf-text-muted)] text-[10px]">{c.participant_phone}</span>
                                          {cat ? (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catColor}`} title={`${c.ai_confidence}% confidence`}>
                                              {cat} {c.ai_confidence ? `· ${c.ai_confidence}%` : ''}
                                            </span>
                                          ) : iid ? (
                                            <button onClick={() => handleAiClassify(iid)} disabled={aiBusyRow || aiBatchBusy}
                                              className="text-[10px] text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] disabled:opacity-40 flex items-center gap-0.5">
                                              {aiBusyRow ? <Loader2 size={10} className="animate-spin" /> : '🤖'}
                                              Classify
                                            </button>
                                          ) : null}
                                          <button onClick={() => handleHideOpContact(c.participant_phone)}
                                            className="text-[var(--sf-text-muted)] hover:text-red-600 text-[12px] leading-none px-1" title="Hide from list">×</button>
                                        </div>
                                        {c.ai_summary && (
                                          <div className="text-[10px] text-[var(--sf-text-muted)] mt-0.5 italic truncate">“{c.ai_summary}”</div>
                                        )}
                                        {/* Per-row Company picker */}
                                        <div className="mt-1 flex items-center gap-1.5">
                                          <select value={selected}
                                            onChange={e => setPendingCompany(p => ({ ...p, [phoneKey]: e.target.value }))}
                                            disabled={saving || cat === 'ad' || cat === 'wrong_number'}
                                            className="text-[10px] px-1 py-0.5 border border-[var(--sf-border-light)] rounded bg-white flex-1 max-w-[180px]">
                                            <option value="">Set Company…</option>
                                            {(sources || []).map(s => (
                                              <option key={s.id} value={s.name}>{s.name}</option>
                                            ))}
                                          </select>
                                          <button onClick={() => handleSetCompany(phoneKey)}
                                            disabled={!selected || saving}
                                            className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] disabled:opacity-40 flex items-center gap-1">
                                            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </details>
                        )}
                        {floatingCount > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]">
                              <strong>{floatingCount}</strong> floating name{floatingCount === 1 ? '' : 's'} to review <span className="text-[var(--sf-text-muted)]">(optional)</span>
                            </summary>
                            {idUnresolved?.items?.length > 0 && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1.5 gap-2">
                                  <div className="text-[10px] text-[var(--sf-text-muted)]">
                                    {idUnresolved.items.length < floatingCount ? `Showing ${idUnresolved.items.length} of ${floatingCount}.` : `Showing all ${floatingCount}.`}
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => downloadCsv('floating-identities.csv',
                                      [
                                        { key: 'id', label: 'identity_id' },
                                        { key: 'display_name', label: 'name' },
                                        { key: 'normalized_phone', label: 'phone' },
                                        { key: 'ai_category', label: 'ai_category' },
                                        { key: 'ai_confidence', label: 'ai_confidence' },
                                        { key: 'ai_summary', label: 'ai_summary' },
                                        { key: 'identity_priority_source', label: 'priority_source' },
                                      ],
                                      idUnresolved?.items || []
                                    )}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] flex items-center gap-1">
                                      ⬇ CSV
                                    </button>
                                    <button onClick={handleAiClassifyBatch} disabled={aiBatchBusy}
                                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] disabled:opacity-50 flex items-center gap-1">
                                      {aiBatchBusy ? <Loader2 size={10} className="animate-spin" /> : <>🤖</>}
                                      Classify all with AI
                                    </button>
                                  </div>
                                </div>
                                {aiBatchProgress && (() => {
                                  const done = aiBatchProgress.done || 0
                                  const total = aiBatchProgress.total || 0
                                  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                                  const status = aiBatchProgress.running ? `Classifying…` : `Done`
                                  const barColor = aiBatchProgress.running ? 'bg-[var(--sf-blue-500)]'
                                    : ((aiBatchProgress.errors || 0) > 0 ? 'bg-amber-500' : 'bg-emerald-500')
                                  return (
                                    <div className="mb-2">
                                      <div className="flex items-center justify-between text-[10px] text-[var(--sf-text-muted)] mb-0.5">
                                        <span>{status}</span>
                                        <span>{done}/{total || '?'} · ${(aiBatchProgress.cost || 0).toFixed(4)}</span>
                                      </div>
                                      <div className="h-1.5 w-full bg-[var(--sf-bg-page)] rounded overflow-hidden">
                                        <div className={`h-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
                                      </div>
                                      {!aiBatchProgress.running && (aiBatchProgress.errors || 0) > 0 && (
                                        <div className="text-[10px] text-amber-700 mt-0.5">{aiBatchProgress.errors} error{aiBatchProgress.errors === 1 ? '' : 's'}</div>
                                      )}
                                    </div>
                                  )
                                })()}
                                <div className="space-y-1 max-h-64 overflow-y-auto">
                                  {idUnresolved.items.map(row => {
                                    const cat = row.ai_category
                                    const catColor = cat === 'prospect' ? 'bg-emerald-100 text-emerald-800'
                                      : cat === 'existing_customer' ? 'bg-blue-100 text-blue-800'
                                      : cat === 'ad' ? 'bg-red-100 text-red-700'
                                      : cat === 'wrong_number' ? 'bg-gray-200 text-gray-700'
                                      : cat === 'unclear' ? 'bg-yellow-100 text-yellow-800'
                                      : ''
                                    const busy = !!aiBusy[row.id]
                                    const phoneKey = row.normalized_phone
                                    const selected = phoneKey ? (pendingCompany[phoneKey] || '') : ''
                                    const saving = phoneKey && !!companyBusy[phoneKey]
                                    const offerCompanyPicker = phoneKey && cat !== 'ad' && cat !== 'wrong_number'
                                    return (
                                      <div key={row.id} className="text-[11px] px-2 py-1 bg-[var(--sf-bg-page)] rounded">
                                        <div className="flex gap-2 items-center font-mono">
                                          <span className="text-[var(--sf-text-muted)]">#{row.id}</span>
                                          <span className="text-[var(--sf-text-primary)] truncate flex-1">{row.display_name || '(no name)'}</span>
                                          <span className="text-[var(--sf-text-muted)] text-[10px]">{row.normalized_phone || '-'}</span>
                                          {cat ? (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${catColor}`} title={`${row.ai_confidence}% confidence`}>
                                              {cat} {row.ai_confidence ? `· ${row.ai_confidence}%` : ''}
                                            </span>
                                          ) : (
                                            <button onClick={() => handleAiClassify(row.id)} disabled={busy || aiBatchBusy}
                                              className="text-[10px] text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] disabled:opacity-40 flex items-center gap-0.5">
                                              {busy ? <Loader2 size={10} className="animate-spin" /> : '🤖'}
                                              Classify
                                            </button>
                                          )}
                                          <button onClick={() => handleHideFloating(row.id)}
                                            className="text-[var(--sf-text-muted)] hover:text-red-600 text-[12px] leading-none px-1" title="Hide from list">×</button>
                                        </div>
                                        {row.ai_summary && (
                                          <div className="text-[10px] text-[var(--sf-text-muted)] pl-4 mt-0.5 italic truncate">“{row.ai_summary}”</div>
                                        )}
                                        {offerCompanyPicker && (
                                          <div className="mt-1 flex items-center gap-1.5 pl-4">
                                            <select value={selected}
                                              onChange={e => setPendingCompany(p => ({ ...p, [phoneKey]: e.target.value }))}
                                              disabled={saving}
                                              className="text-[10px] px-1 py-0.5 border border-[var(--sf-border-light)] rounded bg-white flex-1 max-w-[180px]">
                                              <option value="">Set source → create lead…</option>
                                              {(sources || []).map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                              ))}
                                            </select>
                                            <button onClick={() => handleSetCompany(phoneKey)}
                                              disabled={!selected || saving}
                                              className="text-[10px] px-2 py-0.5 rounded border border-[var(--sf-border-light)] text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] disabled:opacity-40 flex items-center gap-1">
                                              {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                              Save
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                )
              })() : (
                <div className="text-xs text-[var(--sf-text-muted)]">Loading…</div>
              )}

              {/* Integrations — compact status row with per-source Sync. Timestamps + last-run details behind drawer. */}
              {integrationStatus?.integrations && (
                <div className="pt-3 border-t border-[var(--sf-border-light)]">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--sf-text-muted)] font-semibold mb-2">Integrations</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {[
                      { key: 'leadbridge', label: 'LeadBridge' },
                      { key: 'openphone', label: 'OpenPhone' },
                      { key: 'zenbooker', label: 'Zenbooker' },
                    ].map(({ key, label }) => {
                      const cfg = integrationStatus.integrations[key] || {}
                      const busy = !!syncBusy[key]
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 border border-[var(--sf-border-light)] rounded-lg px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="text-xs font-medium text-[var(--sf-text-primary)]">{label}</span>
                          </div>
                          <button onClick={() => handleSyncIntegration(key)} disabled={busy || !cfg.connected}
                            className="text-[11px] text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] disabled:opacity-40 flex items-center gap-1">
                            {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                            Sync
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <details className="mt-2">
                    <summary className="text-[11px] text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] cursor-pointer">Sync details</summary>
                    <div className="mt-2 space-y-1 text-[11px] text-[var(--sf-text-muted)]">
                      {['leadbridge','openphone','zenbooker'].map(k => {
                        const cfg = integrationStatus.integrations[k] || {}
                        const ts = cfg.last_sync_at || cfg.connected_at
                        const run = cfg.last_run?.summary
                        return (
                          <div key={k} className="flex flex-wrap items-center gap-2">
                            <span className="capitalize w-20">{k}</span>
                            <span>{ts ? `last sync ${new Date(ts).toLocaleString()}` : 'never synced'}</span>
                            {run && <span className="text-[10px]">· synced {run.records_synced || 0} · linked {run.records_linked || 0} · created {run.records_created || 0}{(run.leads_recovered || 0) > 0 ? ` · recovered ${run.leads_recovered}` : ''}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </details>
                </div>
              )}

              {/* Single drawer for implementation-level numbers (kept for debugging / curiosity). */}
              {idStatus && (
                <details className="pt-3 border-t border-[var(--sf-border-light)]">
                  <summary className="text-[11px] text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] cursor-pointer">All identity details</summary>
                  <div className="mt-2 space-y-3">
                    <div className="text-[11px] text-[var(--sf-text-muted)]">
                      <strong className="text-[var(--sf-text-primary)]">{idStatus.total}</strong> identities ·
                      {' '}<strong className="text-[var(--sf-text-primary)]">{idStatus.connected}</strong> connected ·
                      {' '}<strong className="text-[var(--sf-text-primary)]">{idStatus.need_review}</strong> need review ·
                      {' '}<strong className="text-[var(--sf-text-primary)]">{idStatus.ignored}</strong> ignored
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Customer</div>
                        <div className="font-semibold">{idStatus.details?.resolved_customer || 0}</div>
                      </div>
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Lead</div>
                        <div className="font-semibold">{idStatus.details?.resolved_lead || 0}</div>
                      </div>
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Both</div>
                        <div className="font-semibold">{idStatus.details?.resolved_both || 0}</div>
                      </div>
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Floating named</div>
                        <div className="font-semibold">{idStatus.details?.floating_named || 0}</div>
                      </div>
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Aggregator</div>
                        <div className="font-semibold">{idStatus.details?.floating_aggregator || 0}</div>
                      </div>
                      <div className="bg-white border border-[var(--sf-border-light)] rounded p-2">
                        <div className="text-[var(--sf-text-muted)]">Noise</div>
                        <div className="font-semibold">{idStatus.details?.floating_noise || 0}</div>
                      </div>
                    </div>
                    {idBySource && (() => {
                      const s = idBySource.single_source || {}
                      const multi = idBySource.multi_source || 0
                      return (
                        <div className="text-[11px] text-[var(--sf-text-muted)]">
                          Sources: <strong className="text-[var(--sf-text-primary)]">OP {s.openphone_only || 0}</strong> · <strong className="text-[var(--sf-text-primary)]">LB {s.leadbridge_only || 0}</strong> · <strong className="text-[var(--sf-text-primary)]">ZB {s.zenbooker_only || 0}</strong> · <strong className="text-[var(--sf-text-primary)]">multi {multi}</strong>
                        </div>
                      )
                    })()}
                    {opOutcomes && (() => {
                      const created24 = (opOutcomes.last24h?.created_lead_openphone_direct || 0) + (opOutcomes.last24h?.created_lead_openphone_lb_recovery || 0)
                      return (
                        <div className="text-[11px] text-[var(--sf-text-muted)]">
                          OpenPhone (24h): <strong className="text-[var(--sf-text-primary)]">{created24}</strong> created · <strong className="text-[var(--sf-text-primary)]">{opOutcomes.total24h || 0}</strong> decisions
                        </div>
                      )
                    })()}
                  </div>
                </details>
              )}
            </div>

          </section>

          {/* ── ISSUES / MANUAL RESOLUTION ── */}
          {(issues?.duplicateCustomerCount > 0 || issues?.unresolvedCustomerSources?.length > 0) && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <div>
                  <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Issues to Resolve</h2>
                  <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">Post-sync issues that need manual attention.</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Duplicate customers */}
                {issues.duplicateCustomerCount > 0 && (
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--sf-border-light)] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-[var(--sf-text-muted)]" />
                        <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Duplicate Customers ({issues.duplicateCustomerCount})</h3>
                      </div>
                      <span className="text-[10px] text-[var(--sf-text-muted)]">Keep record with jobs, merge or delete empty duplicates</span>
                    </div>
                    <div className="divide-y divide-[var(--sf-border-light)] max-h-[400px] overflow-y-auto">
                      {issues.duplicateCustomers.map(group => (
                        <div key={group.name} className="px-5 py-3">
                          <div className="text-xs font-semibold text-[var(--sf-text-primary)] mb-2">{group.name}</div>
                          <div className="space-y-1.5">
                            {group.records.map(r => {
                              const targets = group.records.filter(o => o.id !== r.id)
                              return (
                                <div key={r.id} className="flex items-center gap-2 text-xs bg-[var(--sf-bg-page)] rounded-lg px-3 py-2">
                                  <a href={`/customer/${r.id}`} target="_blank" rel="noreferrer"
                                    className="font-mono text-[var(--sf-blue-500)] hover:underline flex-shrink-0">#{r.id}</a>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.job_count > 0 ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {r.job_count} {r.job_count === 1 ? 'job' : 'jobs'}
                                  </span>
                                  <span className="text-[var(--sf-text-secondary)] truncate">
                                    {r.phone || 'no phone'} {r.address ? `• ${r.address}` : ''}
                                  </span>
                                  <div className="flex-1" />
                                  {targets.length > 0 && (
                                    <select
                                      onChange={e => {
                                        const t = parseInt(e.target.value)
                                        if (t) handleMergeCustomers(r.id, t)
                                        e.target.value = ''
                                      }}
                                      disabled={!!mergingPair}
                                      className="text-[10px] border border-[var(--sf-border-light)] rounded px-1.5 py-0.5 bg-white"
                                      defaultValue="">
                                      <option value="">Merge into...</option>
                                      {targets.map(t => (
                                        <option key={t.id} value={t.id}>#{t.id} ({t.job_count} jobs)</option>
                                      ))}
                                    </select>
                                  )}
                                  {mergingPair?.startsWith(`${r.id}-`) && <Loader2 size={11} className="animate-spin" />}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {/* Unresolved customer.source values */}
                {issues.unresolvedCustomerSources?.length > 0 && (
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">
                          Unresolved Customer Sources ({issues.unresolvedCustomerSources.length})
                        </h3>
                        <p className="text-xs text-[var(--sf-text-muted)] mt-0.5">
                          These raw source values are on customer records but aren't mapped yet. Scroll to the Opportunity Sources section above — they appear as <span className="font-semibold text-violet-600">CR</span> badges.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {issues.unresolvedCustomerSources.map(u => (
                            <span key={u.raw_value} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                              {u.raw_value} ({u.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── LEAD STAGE AUTOMATION ── */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Opportunity Stage Automation</h2>
              <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">Configure how leads from Thumbtack and Yelp automatically progress through your pipeline stages.</p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--sf-text-muted)]" /></div>
              ) : (
                <div className="divide-y divide-[var(--sf-border-light)]">
                  {EVENT_DEFS.map((evt, i) => {
                    const rule = getRuleForEvent(evt.event); const isSaving = saving === evt.event
                    return (
                      <div key={evt.event} className="flex items-center justify-between px-5 py-4">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)] text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <span className="text-sm font-medium text-[var(--sf-text-primary)]">{evt.label}</span>
                          </div>
                          <p className="text-xs text-[var(--sf-text-muted)] mt-0.5 ml-8">{evt.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isSaving && <Loader2 size={14} className="animate-spin text-[var(--sf-text-muted)]" />}
                          <span className="text-xs text-[var(--sf-text-muted)]">→</span>
                          <select value={rule?.targetStageId || ''} onChange={e => handleStageChange(evt.event, e.target.value)}
                            className="text-sm border border-[var(--sf-border-light)] rounded-lg px-3 py-1.5 bg-white min-w-[160px] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]">
                            <option value="">Select stage...</option>
                            {stages.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--sf-text-muted)] mt-3">Leads only advance forward — they never move backwards automatically. Applies to Thumbtack and Yelp leads.</p>
          </section>

          {/* Apply to existing */}
          <section>
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Apply Rules to Existing Leads</h3>
                  <p className="text-xs text-[var(--sf-text-muted)] mt-0.5">Update existing leads based on conversation history.</p>
                </div>
                <button disabled={backfilling} onClick={async () => {
                  setBackfilling(true); setBackfillResult(null)
                  try { setBackfillResult(await leadAutomationAPI.backfill()) } catch (e) { setBackfillResult({ error: e.response?.data?.error || e.message }) }
                  finally { setBackfilling(false) }
                }} className="px-4 py-2 text-sm border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-2">
                  {backfilling && <Loader2 size={14} className="animate-spin" />}{backfilling ? 'Applying...' : 'Apply Now'}
                </button>
              </div>
              {backfillResult && !backfilling && (
                <div className={`mt-3 rounded-lg p-3 text-xs ${backfillResult.error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                  {backfillResult.error ? `Error: ${backfillResult.error}` : `Updated ${backfillResult.updated} of ${backfillResult.total} leads`}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Source Row Component ──
function SourceRow({ s, idx, editingId, editName, setEditName, setEditingId,
  savingSource, savingMapping, handleRenameSource, handleDeleteSource,
  handleAddMapping, handleDeleteMapping, availableForDropdown, reloadMappings,
  openDropdown, setOpenDropdown,
  dragIdx, dragOverIdx, handleDragStart, handleDragOver, handleDrop, handleDragEnd }) {

  const isOpen = openDropdown === s.name
  const dropdownRef = useRef(null)
  const triggerRef = useRef(null)
  const [dropSearch, setDropSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [savingBulk, setSavingBulk] = useState(false)
  const [dropDirection, setDropDirection] = useState('down') // 'down' | 'up'
  const [dropMaxHeight, setDropMaxHeight] = useState(480)
  const [dropWidth, setDropWidth] = useState(384) // w-96
  const [resizing, setResizing] = useState(false)
  const mapped = s.mappedValues || []

  // Resize handlers — drag corner to resize dropdown
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation()
    setResizing(true)
    const startX = e.clientX
    const startY = e.clientY
    const startH = dropMaxHeight
    const startW = dropWidth
    const dirDown = dropDirection === 'down'
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      setDropMaxHeight(Math.max(200, Math.min(window.innerHeight - 100, startH + (dirDown ? dy : -dy))))
      setDropWidth(Math.max(320, Math.min(window.innerWidth - 40, startW + dx)))
    }
    const onUp = () => {
      setResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Compute direction + max height whenever dropdown opens
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const STICKY_HEADER = 80 // page's sticky header height + padding
    const spaceBelow = window.innerHeight - rect.bottom - 16
    const spaceAbove = rect.top - STICKY_HEADER
    const preferred = 520
    if (spaceBelow >= 320 || spaceBelow >= spaceAbove) {
      setDropDirection('down')
      setDropMaxHeight(Math.max(240, Math.min(preferred, spaceBelow)))
    } else {
      setDropDirection('up')
      setDropMaxHeight(Math.max(240, Math.min(preferred, spaceAbove)))
    }
  }, [isOpen])

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) { setDropSearch(''); setSelectedKeys(new Set()); return }
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdown(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, setOpenDropdown])

  const filteredDropdown = dropSearch.trim()
    ? availableForDropdown.filter(v => v.raw_value.toLowerCase().includes(dropSearch.toLowerCase()))
    : availableForDropdown

  const toggleSelect = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const selectAllFiltered = () => {
    const allKeys = filteredDropdown.map(v => `${v.provider}:${v.raw_value}`)
    const allSelected = allKeys.every(k => selectedKeys.has(k))
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (allSelected) allKeys.forEach(k => next.delete(k))
      else allKeys.forEach(k => next.add(k))
      return next
    })
  }

  const handleBulkMap = async () => {
    if (selectedKeys.size === 0) return
    setSavingBulk(true)
    const toMap = availableForDropdown
      .filter(v => selectedKeys.has(`${v.provider}:${v.raw_value}`))
      .map(v => ({ raw_value: v.raw_value, source_name: s.name, provider: v.provider }))
    try {
      await leadSourceMappingsAPI.saveBulk(toMap)
      setSelectedKeys(new Set())
      setOpenDropdown(null)
      await reloadMappings()
    } catch (e) {
      alert('Failed: ' + (e.response?.data?.error || e.message))
    } finally { setSavingBulk(false) }
  }

  const isDragging = dragIdx === idx
  const isDragOver = dragOverIdx === idx && dragIdx !== idx

  return (
    <div
      draggable={!!s.id && editingId !== s.id}
      onDragStart={e => handleDragStart(e, idx)} onDragOver={e => handleDragOver(e, idx)}
      onDrop={e => handleDrop(e, idx)} onDragEnd={handleDragEnd}
      style={{ opacity: isDragging ? 0.4 : 1 }}>
      {isDragOver && <div className="h-0.5 bg-[var(--sf-blue-500)]" />}

      <div className="px-5 py-3 group">
        {/* Header: grip + name + dropdown trigger + actions */}
        <div className="flex items-center gap-2">
          {editingId === s.id ? (
            <>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameSource(s.id); if (e.key === 'Escape') setEditingId(null) }}
                className="flex-1 text-sm border border-[var(--sf-blue-500)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
              <button onClick={() => handleRenameSource(s.id)} disabled={savingSource === s.id}
                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600">
                {savingSource === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--sf-text-muted)]"><X size={14} /></button>
            </>
          ) : (
            <>
              <GripVertical size={14} className="text-[var(--sf-text-muted)] opacity-0 group-hover:opacity-50 cursor-grab flex-shrink-0" />
              <span className="text-sm font-medium text-[var(--sf-text-primary)]">{s.name}</span>
              {mapped.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-[var(--sf-text-muted)]">{mapped.length}</span>
              )}
              <div className="flex-1" />
              {/* Dropdown trigger */}
              <div className="relative" ref={dropdownRef}>
                <button ref={triggerRef} onClick={() => setOpenDropdown(isOpen ? null : s.name)}
                  className="px-2.5 py-1 text-xs border border-dashed border-[var(--sf-border-light)] rounded-lg hover:border-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-[var(--sf-text-muted)] flex items-center gap-1">
                  <Plus size={11} /> Map values <ChevronDown size={11} />
                </button>
                {isOpen && availableForDropdown.length > 0 && (
                  <div className={`absolute right-0 bg-white border border-[var(--sf-border-light)] rounded-xl shadow-lg z-50 flex flex-col ${dropDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} ${resizing ? 'select-none' : ''}`}
                    style={{ height: `${dropMaxHeight}px`, width: `${dropWidth}px` }}>
                    {/* Top: Map button + actions header */}
                    <div className="px-3 py-2 border-b border-[var(--sf-border-light)] flex-shrink-0 flex items-center justify-between gap-2 bg-[var(--sf-bg-page)]">
                      <span className="text-[11px] text-[var(--sf-text-secondary)] font-medium">
                        Map to <span className="text-[var(--sf-text-primary)]">{s.name}</span>
                      </span>
                      <button onClick={handleBulkMap} disabled={selectedKeys.size === 0 || savingBulk}
                        className="px-3 py-1 text-xs bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1.5">
                        {savingBulk ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Map {selectedKeys.size > 0 ? selectedKeys.size : ''}
                      </button>
                    </div>
                    {/* Search + select-all */}
                    <div className="p-2 border-b border-[var(--sf-border-light)] flex-shrink-0 space-y-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sf-text-muted)]" />
                        <input autoFocus value={dropSearch} onChange={e => setDropSearch(e.target.value)}
                          placeholder={`Search ${availableForDropdown.length} unmapped...`}
                          className="w-full text-xs pl-7 pr-2 py-1.5 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                      </div>
                      <div className="flex items-center justify-between">
                        <button onClick={selectAllFiltered}
                          className="text-[11px] text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] font-medium">
                          {filteredDropdown.length > 0 && filteredDropdown.every(v => selectedKeys.has(`${v.provider}:${v.raw_value}`))
                            ? 'Deselect all' : `Select all${dropSearch ? ' filtered' : ''}`}
                        </button>
                        <span className="text-[10px] text-[var(--sf-text-muted)]">
                          {selectedKeys.size > 0 ? `${selectedKeys.size} selected` : `${filteredDropdown.length} of ${availableForDropdown.length}`}
                        </span>
                      </div>
                    </div>
                    {/* Scrollable list */}
                    <div className="overflow-y-auto flex-1 min-h-0">
                      {filteredDropdown.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-[var(--sf-text-muted)]">No matches</div>
                      ) : filteredDropdown.map(v => {
                        const key = `${v.provider}:${v.raw_value}`
                        const isSaving = savingMapping === key
                        const isSelected = selectedKeys.has(key)
                        return (
                          <label key={key} className={`w-full px-3 py-2 hover:bg-[var(--sf-bg-hover)] flex items-center gap-2 text-sm cursor-pointer ${isSelected ? 'bg-[var(--sf-blue-50)]' : ''}`}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)] cursor-pointer flex-shrink-0" />
                            {isSaving ? <Loader2 size={11} className="animate-spin flex-shrink-0" /> : (
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${PROV_COLOR[v.provider] || 'bg-gray-100 text-gray-500'} flex-shrink-0`}>
                                {PROV_SHORT[v.provider]}
                              </span>
                            )}
                            <span className="truncate flex-1" title={v.raw_value}>{v.raw_value}</span>
                            {v.count != null && <span className="text-[10px] text-[var(--sf-text-muted)] flex-shrink-0">({v.count})</span>}
                          </label>
                        )
                      })}
                    </div>
                    {/* Resize grip — corner (opposite of dropdown direction anchor) */}
                    <div
                      onMouseDown={startResize}
                      title="Drag to resize"
                      className={`absolute right-0 ${dropDirection === 'up' ? 'top-0' : 'bottom-0'} w-4 h-4 ${dropDirection === 'up' ? 'cursor-ne-resize' : 'cursor-se-resize'} flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity`}
                      style={{
                        background: dropDirection === 'up'
                          ? 'linear-gradient(45deg, transparent 50%, rgba(0,0,0,0.25) 50%)'
                          : 'linear-gradient(-45deg, transparent 50%, rgba(0,0,0,0.25) 50%)'
                      }}
                    />
                  </div>
                )}
                {isOpen && availableForDropdown.length === 0 && (
                  <div className={`absolute right-0 w-56 bg-white border border-[var(--sf-border-light)] rounded-xl shadow-lg z-50 p-4 text-center ${dropDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <p className="text-xs text-[var(--sf-text-muted)]">All values are mapped</p>
                  </div>
                )}
              </div>
              {/* Edit / delete */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {s.id && (
                  <>
                    <button onClick={() => { setEditingId(s.id); setEditName(s.name) }}
                      className="p-1.5 rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-muted)]" title="Rename"><Pencil size={13} /></button>
                    <button onClick={() => handleDeleteSource(s.id, s.name)} disabled={savingSource === s.id}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--sf-text-muted)] hover:text-red-500" title="Delete">
                      {savingSource === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Mapped value tags */}
        {mapped.length > 0 && editingId !== s.id && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-6">
            {mapped.map(m => (
              <span key={m.id} className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${PROV_COLOR[m.provider] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                <span className="font-medium">{PROV_SHORT[m.provider]}</span>
                <span>{m.raw_value}</span>
                <button onClick={() => handleDeleteMapping(m.id)} disabled={savingMapping === m.id}
                  className="ml-0.5 hover:text-red-500 transition-colors">
                  {savingMapping === m.id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadsSettings
