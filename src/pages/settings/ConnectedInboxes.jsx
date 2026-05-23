import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Mail, Plus, RefreshCw, Trash2, CheckCircle2, AlertCircle, Clock, Zap, ChevronDown } from 'lucide-react'
import { connectedEmailAPI } from '../../services/api'
import SettingsRailLayout from '../../components/settings-rail-layout'

const PROVIDERS = [
  { key: 'gmail', label: 'Gmail', description: 'Connect a Google / Gmail mailbox', color: 'bg-red-50 text-red-700' },
  { key: 'outlook', label: 'Outlook / Microsoft 365', description: 'Connect Outlook or Microsoft 365', color: 'bg-blue-50 text-blue-700' },
]

function SyncMenu({ disabled, onPick }) {
  const [open, setOpen] = useState(false)
  const options = [
    { label: 'Test: last 24h (10 msgs)', days: 1, max: 10 },
    { label: 'Test: last 7 days (50 msgs)', days: 7, max: 50 },
    { label: 'Test: last 30 days (100 msgs)', days: 30, max: 100 },
    { label: 'Full: last 90 days (200 msgs)', days: 90, max: 200 },
  ]
  return (
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        title="Test sync"
        className="inline-flex items-center gap-0.5 p-1.5 text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] rounded hover:bg-blue-50 disabled:opacity-50">
        <Zap size={16} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-56 bg-white border border-[var(--sf-border-light)] rounded-lg shadow-lg py-1">
            {options.map(o => (
              <button key={o.label}
                onClick={() => { setOpen(false); onPick(o.days, o.max) }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)]">
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function statusPill(status) {
  const map = {
    connected: { Icon: CheckCircle2, cls: 'text-green-700 bg-green-50', label: 'Connected' },
    syncing:   { Icon: RefreshCw, cls: 'text-blue-700 bg-blue-50', label: 'Syncing' },
    expired:   { Icon: Clock, cls: 'text-amber-700 bg-amber-50', label: 'Token expired' },
    error:     { Icon: AlertCircle, cls: 'text-red-700 bg-red-50', label: 'Error' },
    awaiting_selection: { Icon: AlertCircle, cls: 'text-amber-700 bg-amber-50', label: 'Select mailbox' },
    disconnected: { Icon: AlertCircle, cls: 'text-gray-600 bg-gray-100', label: 'Disconnected' },
  }
  const m = map[status] || map.disconnected
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>
      <m.Icon size={12} /> {m.label}
    </span>
  )
}

export default function ConnectedInboxes() {
  const [accounts, setAccounts] = useState([])
  const [configured, setConfigured] = useState(true)
  const [providerAvail, setProviderAvail] = useState({ gmail: true, outlook: true })
  const [progress, setProgress] = useState({}) // { [accountId]: { phase, scanned, synced, total, startedAt } }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [params, setParams] = useSearchParams()
  const flash = params.get('connected') || params.get('error')

  // Shared mailbox selection
  const [selectingMailboxFor, setSelectingMailboxFor] = useState(null)
  const [sharedMailboxInput, setSharedMailboxInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [validateError, setValidateError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const data = await connectedEmailAPI.listAccounts()
      setAccounts(data.accounts || [])
      setConfigured(data.configured !== false)
      if (data.providers) setProviderAvail(data.providers)
    } catch (e) {
      console.error('Failed to load connected inboxes:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (params.get('selectMailbox') === '1' && params.get('accountId')) {
      setSelectingMailboxFor(params.get('accountId'))
    }
  }, [])

  // Auto-open picker for any Outlook account in 'awaiting_selection' state.
  useEffect(() => {
    if (selectingMailboxFor) return
    const awaiting = accounts.find(a => a.provider === 'outlook' && a.status === 'awaiting_selection')
    if (awaiting) setSelectingMailboxFor(awaiting.id)
  }, [accounts, selectingMailboxFor])

  // Poll progress every 1.5s for any account that has an active or recently-finished sync.
  useEffect(() => {
    if (accounts.length === 0) return
    const interval = setInterval(async () => {
      const next = {}
      for (const a of accounts) {
        if (a.status !== 'connected' && a.status !== 'syncing') continue
        try {
          const r = await connectedEmailAPI.getSyncProgress(a.id)
          if (r?.progress) next[a.id] = r.progress
        } catch {}
      }
      setProgress(next)
      // If any just finished, refresh account list to pick up last_sync_at
      const hadDone = Object.values(next).some(p => p.phase === 'done')
      if (hadDone) load()
    }, 1500)
    return () => clearInterval(interval)
  }, [accounts.map(a => a.id).join(',')])

  const connect = async (provider) => {
    try {
      setBusy(provider)
      const { authorization_url } = await connectedEmailAPI.startOAuth(provider)
      window.location.href = authorization_url
    } catch (e) {
      alert(e.response?.data?.error || `Failed to start ${provider} OAuth`)
      setBusy(null)
    }
  }

  const disconnect = async (id) => {
    if (!window.confirm('Disconnect this mailbox? Historical messages will be preserved.')) return
    try {
      setBusy(id)
      await connectedEmailAPI.disconnect(id)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to disconnect')
    } finally { setBusy(null) }
  }

  const resync = async (id) => {
    try {
      setBusy(id)
      await connectedEmailAPI.resync(id)
      setTimeout(load, 1500)
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to queue resync')
    } finally { setBusy(null) }
  }

  const selectPrimaryMailbox = async (accountId) => {
    try {
      setBusy(accountId)
      await connectedEmailAPI.selectMailbox(accountId, null)
      setSelectingMailboxFor(null)
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    finally { setBusy(null) }
  }

  const [validateHelp, setValidateHelp] = useState(null) // { helpUrl, helpSteps }

  const selectSharedMailbox = async (accountId) => {
    if (!sharedMailboxInput.trim()) return setValidateError('Enter a mailbox email')
    try {
      setValidating(true); setValidateError(''); setValidateHelp(null)
      const check = await connectedEmailAPI.validateMailbox(accountId, sharedMailboxInput.trim())
      if (!check.accessible) {
        const detail = check.graphCode ? ` [${check.graphCode}: ${check.graphMessage || ''}]` : ''
        setValidateError((check.error || 'Access denied') + detail)
        if (check.helpUrl || check.helpSteps) setValidateHelp({ helpUrl: check.helpUrl, helpSteps: check.helpSteps })
        return
      }
      await connectedEmailAPI.selectMailbox(accountId, sharedMailboxInput.trim())
      setSelectingMailboxFor(null); setSharedMailboxInput(''); setValidateHelp(null)
      await load()
    } catch (e) { setValidateError(e.response?.data?.error || 'Failed to select mailbox') }
    finally { setValidating(false) }
  }

  const testSync = async (id, days, maxMessages) => {
    try {
      setBusy(id)
      const r = await connectedEmailAPI.testSync(id, { days, maxMessages })
      alert(`Test sync done: scanned ${r.scanned} messages from last ${r.days} day${r.days === 1 ? '' : 's'}, imported ${r.synced} new`)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Test sync failed')
    } finally { setBusy(null) }
  }

  const byProvider = (p) => accounts.filter(a => a.provider === p && a.status !== 'disconnected')

  return (
    <SettingsRailLayout
      title="Connected inboxes"
      section="Communications"
      subtitle="Connect Gmail or Outlook for two-way email in the Communications Hub"
    >
      <div className="max-w-3xl">

        {flash && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${params.get('error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {params.get('error')
              ? `Error: ${params.get('error')}`
              : params.get('connected') === 'outlook'
                ? `Connected to Outlook. Select which mailbox to sync below.`
                : `Connected ${params.get('connected')} successfully — initial sync started.`}
          </div>
        )}

        {!configured && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
            Connected Email is not fully configured on this server yet. An administrator needs to set the OAuth client credentials and encryption key.
          </div>
        )}

        {/* Provider cards */}
        <div className="space-y-4">
          {PROVIDERS.map(p => {
            const existing = byProvider(p.key)
            return (
              <div key={p.key} className="bg-white border border-[var(--sf-border-light)] rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.color}`}>
                      <Mail size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--sf-text-primary)]">{p.label}</h3>
                      <p className="text-xs text-[var(--sf-text-muted)] mt-0.5">{p.description}</p>
                    </div>
                  </div>
                  <button
                    disabled={busy === p.key || !configured || !providerAvail[p.key]}
                    onClick={() => connect(p.key)}
                    title={!providerAvail[p.key] ? `${p.label} OAuth credentials not configured on server` : undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[var(--sf-blue-500)] text-white hover:bg-[var(--sf-blue-600)] disabled:opacity-50">
                    <Plus size={14} /> {busy === p.key ? 'Redirecting…' : (providerAvail[p.key] ? 'Connect' : 'Not configured')}
                  </button>
                </div>

                {existing.length > 0 && (
                  <div className="mt-4 border-t border-[var(--sf-border-light)] pt-3 space-y-2">
                    {existing.map(a => {
                      const prog = progress[a.id]
                      const isActive = prog && prog.phase !== 'done' && prog.phase !== 'error'
                      const pct = prog?.total ? Math.round((prog.scanned || 0) / prog.total * 100) : (isActive ? 5 : 0)
                      return (
                      <div key={a.id} className="py-2 border-b border-[var(--sf-border-light)] last:border-0">
                       <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--sf-text-primary)] truncate">{a.target_mailbox_email || a.email_address}</span>
                            {a.mailbox_type === 'shared' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">Shared</span>
                            )}
                            {statusPill(isActive ? 'syncing' : a.status)}
                          </div>
                          {a.auth_email_address && a.auth_email_address !== (a.target_mailbox_email || a.email_address) && (
                            <div className="text-[11px] text-[var(--sf-text-muted)] mt-0.5">Signed in as: {a.auth_email_address}</div>
                          )}
                          <div className="text-xs text-[var(--sf-text-muted)] mt-0.5">
                            {a.last_sync_at ? `Last sync: ${new Date(a.last_sync_at).toLocaleString()}` : 'No sync yet'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {a.provider === 'outlook' && (
                            <button onClick={() => { setSelectingMailboxFor(a.id); setSharedMailboxInput(''); setValidateError('') }}
                              disabled={busy === a.id} title="Change mailbox (primary or shared)"
                              className="p-1.5 text-xs text-purple-600 hover:bg-purple-50 rounded font-medium">
                              {a.mailbox_type === 'shared' ? '✉ Change' : '✉ Shared'}
                            </button>
                          )}
                          <SyncMenu disabled={busy === a.id} onPick={(days, max) => testSync(a.id, days, max)} />
                          <button
                            onClick={() => resync(a.id)}
                            disabled={busy === a.id}
                            title="Resync (full incremental)"
                            className="p-1.5 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] rounded hover:bg-[var(--sf-bg-hover)]">
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => disconnect(a.id)}
                            disabled={busy === a.id}
                            title="Disconnect"
                            className="p-1.5 text-red-500 hover:text-red-700 rounded hover:bg-red-50">
                            <Trash2 size={16} />
                          </button>
                        </div>
                       </div>
                       {/* Mailbox selection (Outlook shared mailbox) */}
                       {selectingMailboxFor === a.id && (
                         <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                           <h4 className="text-xs font-semibold text-purple-800 mb-2">Select mailbox to sync</h4>
                           <div className="flex flex-col gap-2">
                             <button onClick={() => selectPrimaryMailbox(a.id)} disabled={busy === a.id}
                               className="text-left px-3 py-2 text-xs bg-white border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)]">
                               <span className="font-medium text-[var(--sf-text-primary)]">Use my own mailbox</span>
                               <span className="text-[var(--sf-text-muted)] ml-1">({a.auth_email_address || a.email_address})</span>
                             </button>
                             <div className="text-xs text-purple-700 font-medium mt-1">Or enter a shared mailbox:</div>
                             <div className="flex gap-2">
                               <input value={sharedMailboxInput}
                                 onChange={e => { setSharedMailboxInput(e.target.value); setValidateError('') }}
                                 placeholder="e.g. sales@company.com"
                                 className="flex-1 text-xs border border-[var(--sf-border-light)] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400" />
                               <button onClick={() => selectSharedMailbox(a.id)} disabled={validating || !sharedMailboxInput.trim()}
                                 className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                                 {validating ? 'Checking…' : 'Connect'}
                               </button>
                             </div>
                             {validateError && (
                               <div className="text-xs bg-red-50 rounded overflow-hidden">
                                 <div className="px-3 py-2 text-red-700 font-medium">{validateError}</div>
                                 {validateHelp?.helpSteps && (
                                   <div className="px-3 pb-2 space-y-1">
                                     <div className="text-red-600 font-semibold mt-1">How to fix:</div>
                                     <ol className="list-decimal list-inside space-y-0.5 text-red-600">
                                       {validateHelp.helpSteps.map((s, i) => <li key={i}>{s}</li>)}
                                     </ol>
                                     {validateHelp.helpUrl && (
                                       <a href={validateHelp.helpUrl} target="_blank" rel="noopener noreferrer"
                                         className="inline-block mt-1 text-[var(--sf-blue-500)] hover:underline font-medium">
                                         Open Exchange Admin Center →
                                       </a>
                                     )}
                                   </div>
                                 )}
                               </div>
                             )}
                             <button onClick={() => setSelectingMailboxFor(null)} className="text-xs text-[var(--sf-text-muted)] hover:underline self-end mt-1">Cancel</button>
                           </div>
                         </div>
                       )}
                       {/* Progress bar */}
                       {prog && (
                         <div className="mt-2">
                           <div className="flex items-center justify-between mb-1">
                             <span className="text-[11px] text-[var(--sf-text-muted)]">
                               {prog.phase === 'starting' && 'Starting sync…'}
                               {prog.phase === 'initial_list' && 'Listing messages (initial sync)…'}
                               {prog.phase === 'incremental_list' && 'Listing new messages…'}
                               {prog.phase === 'fetching' && (prog.isTest ? 'Test sync…' : (prog.isInitial ? 'Initial sync…' : 'Syncing…'))}
                               {prog.phase === 'done' && `Done — imported ${prog.synced || 0} new${prog.scanned ? ` (scanned ${prog.scanned})` : ''}`}
                               {prog.phase === 'error' && `Error: ${prog.error || 'unknown'}`}
                             </span>
                             {prog.total != null && (
                               <span className="text-[11px] text-[var(--sf-text-muted)]">
                                 {prog.scanned || 0}/{prog.total}
                                 {prog.synced > 0 ? ` · +${prog.synced} new` : ''}
                               </span>
                             )}
                           </div>
                           <div className="w-full bg-gray-200 rounded-full h-1.5">
                             <div className={`h-1.5 rounded-full transition-all ${prog.phase === 'error' ? 'bg-red-500' : prog.phase === 'done' ? 'bg-green-500' : 'bg-[var(--sf-blue-500)]'}`}
                               style={{ width: `${prog.phase === 'done' ? 100 : pct}%` }} />
                           </div>
                         </div>
                       )}
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {loading && <div className="text-sm text-[var(--sf-text-muted)] mt-4">Loading…</div>}
      </div>
    </SettingsRailLayout>
  )
}
