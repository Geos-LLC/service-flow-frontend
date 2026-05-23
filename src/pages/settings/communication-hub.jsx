"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import SettingsRailLayout from "../../components/settings-rail-layout"
import { openPhoneAPI, leadbridgeAPI, whatsappAPI, communicationsAPI, territoriesAPI, locationsAPI, leadAutomationAPI, connectedEmailAPI } from "../../services/api"
import {
  ChevronLeft, Phone, PhoneCall, Star, ThumbsUp, Mail,
  MessageSquare, MessageCircle, Info, Check, X, ExternalLink,
  Radio, Settings, Zap, Shield, Clock, Loader2, RefreshCw, Users
} from "lucide-react"

// ═══════════════════════════════════════════════════════════════
// Provider config (static definitions — status comes from API)
// ═══════════════════════════════════════════════════════════════

const PROVIDER_DEFS = [
  { key: 'openphone', name: 'OpenPhone', description: 'Sync texts, calls, and contacts from your OpenPhone workspace', Icon: Phone },
  { key: 'leadbridge', name: 'Thumbtack / Yelp via LeadBridge', description: 'Connect your Thumbtack and Yelp accounts to receive leads and messages', Icon: Zap },
  { key: 'callio', name: 'Callio', description: 'Connect your native communication workspace and business number', Icon: PhoneCall },
  { key: 'twilio', name: 'Twilio', description: 'Connect a Twilio account for advanced communication workflows', Icon: Settings },
  { key: 'whatsapp', name: 'WhatsApp', description: 'Connect WhatsApp business messaging when available', Icon: MessageCircle },
  { key: 'email', name: 'Email (Gmail / Outlook)', description: 'Connect Gmail or Outlook mailboxes to read and reply to email conversations', Icon: Mail },
  { key: 'messenger', name: 'Messenger', description: 'Connect Facebook Messenger when available', Icon: MessageSquare },
]

const CHANNEL_DEFS = [
  { channel: 'openphone_sms', name: 'OpenPhone SMS', providerKey: 'openphone' },
  { channel: 'calls', name: 'Calls', providerKey: 'openphone' },
  { channel: 'yelp', name: 'Yelp', providerKey: 'leadbridge' },
  { channel: 'thumbtack', name: 'Thumbtack', providerKey: 'leadbridge' },
  { channel: 'email', name: 'Email', providerKey: 'email' },
  { channel: 'whatsapp', name: 'WhatsApp', providerKey: 'whatsapp' },
  { channel: 'messenger', name: 'Messenger', providerKey: 'messenger' },
]

const DEFAULT_PREFERENCES = {
  defaultSendChannel: 'last_used',
  preferredOutboundBehavior: 'original_channel',
  autoLinkByPhone: true,
  autoLinkByEmail: true,
  autoLinkBySource: true,
  showUnlinkedConversations: true,
  markReadOnOpen: true,
  defaultInboxFilter: 'recents',
  showChannelBadges: true,
  groupByLeadWhenPossible: true,
  showArchivedConversations: false,
  showCallEvents: true,
  showSystemEvents: true,
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function StatusBadge({ status }) {
  const styles = { connected: 'bg-green-100 text-green-700', not_connected: 'bg-gray-100 text-gray-600', coming_soon: 'bg-yellow-50 text-yellow-600' }
  const labels = { connected: 'Connected', not_connected: 'Not connected', coming_soon: 'Coming soon' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.not_connected}`}>{labels[status] || status}</span>
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">{subtitle}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, helpText }) {
  return (
    <label className="flex items-start justify-between py-3 cursor-pointer group">
      <div className="pr-4">
        <div className="text-sm font-medium text-[var(--sf-text-primary)] group-hover:text-[var(--sf-blue-500)] transition-colors">{label}</div>
        {helpText && <div className="text-xs text-[var(--sf-text-muted)] mt-0.5">{helpText}</div>}
      </div>
      <div className="flex-shrink-0 relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-300'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </div>
      </div>
    </label>
  )
}

function SelectControl({ label, helpText, value, onChange, options }) {
  return (
    <div className="py-3">
      <label className="text-sm font-medium text-[var(--sf-text-primary)] block mb-1">{label}</label>
      {helpText && <p className="text-xs text-[var(--sf-text-muted)] mb-2">{helpText}</p>}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full sm:w-auto min-w-[280px] border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

const CommunicationHub = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  // Connection state
  const [connected, setConnected] = useState(false)
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [connectedAt, setConnectedAt] = useState(null)

  // Connect modal
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null) // { status, total, synced, messages }
  const [syncResult, setSyncResult] = useState(null)

  // LeadBridge state
  const [lbConnected, setLbConnected] = useState(false)
  const [lbAccounts, setLbAccounts] = useState([])
  const [lbConnectedAt, setLbConnectedAt] = useState(null)
  const [showLbConnectModal, setShowLbConnectModal] = useState(false)
  const [lbEmail, setLbEmail] = useState('')
  const [lbPassword, setLbPassword] = useState('')
  const [lbConnecting, setLbConnecting] = useState(false)
  const [lbConnectError, setLbConnectError] = useState('')

  // WhatsApp state
  const [waConnected, setWaConnected] = useState(false)
  const [waPhoneNumber, setWaPhoneNumber] = useState(null)
  const [waConnecting, setWaConnecting] = useState(false)
  const [showWaQrModal, setShowWaQrModal] = useState(false)
  const [waQrCode, setWaQrCode] = useState(null)
  const [waStatus, setWaStatus] = useState('disconnected')
  const [waSyncing, setWaSyncing] = useState(false)
  const [waSyncProgress, setWaSyncProgress] = useState(null)
  const [lbSyncing, setLbSyncing] = useState(false)
  const [lbSyncProgress, setLbSyncProgress] = useState(null)

  // Connected Email (Gmail/Outlook) state
  const [emailAccounts, setEmailAccounts] = useState([])
  const [emailProvidersAvail, setEmailProvidersAvail] = useState({ gmail: true, outlook: true })
  const [emailConfigured, setEmailConfigured] = useState(true)

  const [territories, setTerritories] = useState([])
  const [locationMappings, setLocationMappings] = useState([])
  const [automationRules, setAutomationRules] = useState([])
  const [automationStages, setAutomationStages] = useState([])

  // Preferences
  const [prefs, setPrefs] = useState(DEFAULT_PREFERENCES)
  const [hasChanges, setHasChanges] = useState(false)

  // Load status on mount
  useEffect(() => {
    loadStatus()
    loadLbStatus()
  }, [])

  const loadLbStatus = async () => {
    try {
      const status = await leadbridgeAPI.getStatus()
      setLbConnected(status.connected)
      setLbAccounts(status.accounts || [])
      setLbConnectedAt(status.connectedAt)
    } catch (e) { /* not connected */ }
    // WhatsApp status
    try {
      const waRes = await whatsappAPI.getStatus()
      setWaConnected(waRes.connected || false)
      setWaPhoneNumber(waRes.phoneNumber || null)
      setWaStatus(waRes.status || 'disconnected')
    } catch (e) { /* not connected */ }
    // Connected Email status
    try {
      const ceRes = await connectedEmailAPI.listAccounts()
      setEmailAccounts(ceRes.accounts || [])
      setEmailConfigured(ceRes.configured !== false)
      if (ceRes.providers) setEmailProvidersAvail(ceRes.providers)
    } catch (e) { /* not connected */ }
    // Load territories + mappings for location assignment
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      const terrData = await territoriesAPI.getAll(user.id, { status: 'active', limit: 100 })
      setTerritories((terrData?.territories || terrData || []).map(t => ({ id: t.id, name: t.name })))
    } catch (e) { /* no territories */ }
    try {
      const mappingData = await locationsAPI.getMappings()
      setLocationMappings(mappingData.mappings || [])
    } catch (e) { /* no mappings */ }
    // Load automation rules
    try {
      const autoData = await leadAutomationAPI.getRules()
      setAutomationRules(autoData.rules || [])
      setAutomationStages(autoData.stages || [])
    } catch (e) { /* no rules */ }
  }

  const handleLocationMapping = async (accountId, territoryId, channel) => {
    try {
      await locationsAPI.createMapping({
        providerAccountId: accountId,
        sfLocationId: parseInt(territoryId),
        provider: 'leadbridge',
        channel: channel || 'thumbtack',
        mappingType: 'account_level',
      })
      // Reload mappings
      const mappingData = await locationsAPI.getMappings()
      setLocationMappings(mappingData.mappings || [])
    } catch (e) {
      alert('Failed to save location mapping: ' + (e.response?.data?.error || e.message))
    }
  }

  const handleLbConnect = async () => {
    if (!lbEmail.trim() || !lbPassword.trim()) { setLbConnectError('Email and password required'); return }
    setLbConnecting(true); setLbConnectError('')
    try {
      const result = await leadbridgeAPI.connect(lbEmail.trim(), lbPassword.trim())
      setLbConnected(true)
      setLbConnectedAt(new Date().toISOString())
      // Reload status to get SF provider account IDs (connect returns LB UUIDs)
      await loadLbStatus()
      setShowLbConnectModal(false)
      setLbEmail(''); setLbPassword('')
    } catch (e) {
      setLbConnectError(e.response?.data?.error || 'Failed to connect. Check your credentials.')
    } finally { setLbConnecting(false) }
  }

  const handleLbDisconnect = async () => {
    if (!window.confirm('Disconnect LeadBridge? Thumbtack and Yelp messages will stop syncing.')) return
    try {
      await leadbridgeAPI.disconnect()
      setLbConnected(false); setLbAccounts([]); setLbConnectedAt(null)
    } catch (e) { alert('Failed to disconnect') }
  }

  const handleLbSync = async (limit) => {
    setLbSyncing(true); setLbSyncProgress({ status: 'running', total: 0, synced: 0, messages: 0 })
    try {
      leadbridgeAPI.sync(null, limit || undefined).catch(() => {})
      const pollInterval = setInterval(async () => {
        try {
          const progress = await leadbridgeAPI.getSyncProgress()
          setLbSyncProgress(progress)
          if (progress.status === 'complete' || progress.status === 'error') {
            clearInterval(pollInterval)
            setLbSyncing(false)
          }
        } catch (e) { /* keep polling */ }
      }, 3000)
      setTimeout(() => { clearInterval(pollInterval); setLbSyncing(false) }, 300000)
    } catch (e) { alert('Sync failed'); setLbSyncing(false) }
  }

  const loadStatus = async () => {
    try {
      setLoading(true)
      const status = await openPhoneAPI.getStatus()
      setConnected(status.connected)
      setPhoneNumbers(status.phoneNumbers || [])
      setConnectedAt(status.connectedAt)
      if (status.preferences && Object.keys(status.preferences).length > 0) {
        setPrefs(prev => ({ ...prev, ...status.preferences }))
      }
    } catch (e) {
      console.error('Failed to load status:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!apiKeyInput.trim()) { setConnectError('API key is required'); return }
    setConnecting(true); setConnectError('')
    try {
      const result = await openPhoneAPI.connect(apiKeyInput.trim())
      setConnected(true)
      setPhoneNumbers(result.phoneNumbers || [])
      setConnectedAt(new Date().toISOString())
      setShowConnectModal(false)
      setApiKeyInput('')
    } catch (e) {
      setConnectError(e.response?.data?.error || 'Failed to connect. Check your API key.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect OpenPhone? Webhooks will stop and no new messages will sync.')) return
    try {
      await openPhoneAPI.disconnect()
      setConnected(false); setPhoneNumbers([]); setConnectedAt(null)
    } catch (e) { alert('Failed to disconnect') }
  }

  const handleSync = async (limit) => {
    setSyncing(true); setSyncResult(null); setSyncProgress({ status: 'running', total: 0, synced: 0, messages: 0, phase: 'starting' })
    try {
      openPhoneAPI.sync(limit || undefined).catch(e => console.warn('Sync request:', e.message))
      const pollInterval = setInterval(async () => {
        try {
          const progress = await openPhoneAPI.getSyncProgress()
          setSyncProgress(progress)
          if (progress.status === 'complete' || progress.status === 'error' || progress.status === 'cancelled' || progress.phase === 'done' || progress.phase === 'cancelled') {
            clearInterval(pollInterval)
            setSyncing(false)
            if (progress.status === 'complete' || progress.phase === 'done') {
              setSyncResult({ conversations: progress.synced, messages: progress.messages })
            } else if (progress.status === 'cancelled') {
              setSyncResult({ conversations: progress.synced, messages: progress.messages, cancelled: true })
            } else if (progress.status === 'error') {
              alert('Sync error: ' + (progress.error || 'Unknown'))
            }
          }
        } catch (e) { /* keep polling */ }
      }, 1500)
      setTimeout(() => { clearInterval(pollInterval); setSyncing(false) }, 600000)
    } catch (e) {
      alert('Sync failed: ' + (e.response?.data?.error || e.message))
      setSyncing(false)
    }
  }

  const handleCancelSync = async () => {
    try {
      await openPhoneAPI.cancelSync()
    } catch (e) { /* ignore */ }
  }

  const updatePref = (key, value) => {
    setPrefs(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSavePrefs = async () => {
    try {
      await communicationsAPI.savePreferences(prefs)
      setHasChanges(false)
    } catch (e) { alert('Failed to save preferences') }
  }

  // Determine provider statuses
  const getProviderStatus = (key) => {
    if (key === 'openphone') return connected ? 'connected' : 'not_connected'
    if (key === 'leadbridge') return lbConnected ? 'connected' : 'not_connected'
    if (key === 'whatsapp') return waConnected ? 'connected' : 'not_connected'
    if (key === 'email') {
      const active = emailAccounts.filter(a => a.status === 'connected')
      return active.length > 0 ? 'connected' : 'not_connected'
    }
    if (key === 'messenger') return 'coming_soon'
    return 'not_connected'
  }

  return (
    <SettingsRailLayout
      title="Communication hub"
      section="Communications"
      subtitle="Connect SMS, Yelp, Thumbtack, WhatsApp, Email and control conversation sync"
      onSave={hasChanges ? handleSavePrefs : undefined}
      saving={false}
    >
        {loading ? (
          <div className="flex items-center justify-center p-20"><Loader2 size={32} className="animate-spin text-[var(--sf-text-muted)]" /></div>
        ) : (
        <div className="space-y-8">

          {/* ═══ Section 1: Connected Providers ═══ */}
          <section>
            <SectionHeader title="Connected Communication Providers" subtitle="Manage the communication platforms connected to your CRM" />
            <div className="grid gap-3">
              {PROVIDER_DEFS.map(p => {
                const status = getProviderStatus(p.key)
                const isOpenPhone = p.key === 'openphone'
                const isLeadBridge = p.key === 'leadbridge'
                const isWhatsApp = p.key === 'whatsapp'
                return (
                  <div key={p.key} className={`bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden ${status === 'coming_soon' ? 'opacity-60' : ''}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-lg ${status === 'connected' ? 'bg-green-50 text-green-600' : status === 'coming_soon' ? 'bg-yellow-50 text-yellow-500' : 'bg-gray-100 text-gray-400'}`}>
                          <p.Icon size={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--sf-text-primary)]">{p.name}</span>
                            <StatusBadge status={status} />
                          </div>
                          <p className="text-xs text-[var(--sf-text-muted)] mt-0.5">{p.description}</p>
                          {status === 'connected' && isOpenPhone && (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {phoneNumbers.map((pn, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                                  <Phone size={10} />
                                  {pn.name}: {pn.number}
                                  <span className="text-green-500">
                                    {pn.capabilities?.sms ? ' SMS' : ''}{pn.capabilities?.voice ? ' Voice' : ''}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                          {status === 'connected' && isLeadBridge && lbAccounts.length > 0 && (
                            <div className="mt-2 space-y-2 w-full">
                              {lbAccounts.map((a, i) => {
                                const mapping = locationMappings.find(m => m.providerAccountId === a.id)
                                const mappedTerritoryId = mapping?.sfLocationId || ''
                                return (
                                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                    <span className={`p-1 rounded ${a.channel === 'yelp' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                      {a.channel === 'yelp' ? <Star size={12} /> : <ThumbsUp size={12} />}
                                    </span>
                                    <span className="text-xs font-medium text-[var(--sf-text-primary)] flex-1 truncate">
                                      {a.displayName || a.channel}
                                    </span>
                                    {territories.length > 0 ? (
                                      <select
                                        value={mappedTerritoryId}
                                        onChange={e => {
                                          if (e.target.value) handleLocationMapping(a.id, e.target.value, a.channel)
                                        }}
                                        className="text-[11px] border border-[var(--sf-border-light)] rounded px-2 py-1 bg-white min-w-[120px]">
                                        <option value="">{mappedTerritoryId ? 'Change location...' : 'Assign location'}</option>
                                        {territories.map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-[10px] text-[var(--sf-text-muted)]">No locations</span>
                                    )}
                                    {mapping && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                                        {mapping.locationName}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {status === 'connected' && isOpenPhone && (
                          <>
                            <button onClick={() => handleSync(10)} disabled={syncing}
                              className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1">
                              {syncing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Test (10)
                            </button>
                            <button onClick={() => handleSync()} disabled={syncing}
                              className="px-3 py-1.5 text-xs font-medium border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1">
                              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync All
                            </button>
                            <button onClick={async () => {
                                try {
                                  const r = await openPhoneAPI.relink()
                                  alert(`Re-linked ${r.linked}/${r.total} conversations to customers`)
                                } catch (e) { alert('Re-link failed') }
                              }}
                              className="px-3 py-1.5 text-xs font-medium border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] flex items-center gap-1">
                              <Users size={12} /> Re-link
                            </button>
                            <button onClick={handleDisconnect}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                              Disconnect
                            </button>
                          </>
                        )}
                        {status === 'not_connected' && isOpenPhone && (
                          <button onClick={() => { setShowConnectModal(true); setConnectError('') }}
                            className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]">
                            Connect
                          </button>
                        )}
                        {/* LeadBridge actions */}
                        {status === 'connected' && isLeadBridge && (
                          <>
                            <button onClick={() => handleLbSync(10)} disabled={lbSyncing}
                              className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1">
                              {lbSyncing ? <><Loader2 size={12} className="animate-spin" /> Syncing...</> : <><RefreshCw size={12} /> Test (10)</>}
                            </button>
                            <button onClick={() => handleLbSync()} disabled={lbSyncing}
                              className="px-3 py-1.5 text-xs font-medium border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1">
                              <RefreshCw size={12} /> Sync All
                            </button>
                            <button onClick={handleLbDisconnect}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                              Disconnect
                            </button>
                          </>
                        )}
                        {status === 'not_connected' && isLeadBridge && (
                          <button onClick={() => { setShowLbConnectModal(true); setLbConnectError('') }}
                            className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]">
                            Connect
                          </button>
                        )}
                        {/* WhatsApp actions */}
                        {status === 'connected' && p.key === 'whatsapp' && (
                          <>
                            <span className="text-xs text-green-600 font-medium">{waPhoneNumber}</span>
                            <button onClick={async () => {
                                setWaSyncing(true); setWaSyncProgress(null)
                                try {
                                  await whatsappAPI.sync(10)
                                  const poll = setInterval(async () => {
                                    const p = await whatsappAPI.getSyncProgress()
                                    setWaSyncProgress(p)
                                    if (p.phase === 'done' || p.phase === 'error') {
                                      clearInterval(poll); setWaSyncing(false)
                                    }
                                  }, 1500)
                                } catch (e) { alert('Sync failed'); setWaSyncing(false) }
                              }}
                              disabled={waSyncing}
                              className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1">
                              {waSyncing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Test (10)
                            </button>
                            <button onClick={async () => {
                                setWaSyncing(true); setWaSyncProgress(null)
                                try {
                                  await whatsappAPI.sync()
                                  const poll = setInterval(async () => {
                                    const p = await whatsappAPI.getSyncProgress()
                                    setWaSyncProgress(p)
                                    if (p.phase === 'done' || p.phase === 'error') {
                                      clearInterval(poll); setWaSyncing(false)
                                    }
                                  }, 1500)
                                } catch (e) { alert('Sync failed'); setWaSyncing(false) }
                              }}
                              disabled={waSyncing}
                              className="px-3 py-1.5 text-xs font-medium border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-[var(--sf-text-secondary)] disabled:opacity-50 flex items-center gap-1">
                              <RefreshCw size={12} /> Sync All
                            </button>
                            <button onClick={async () => {
                                try {
                                  await whatsappAPI.disconnect()
                                  setWaConnected(false); setWaPhoneNumber(null); setWaStatus('disconnected')
                                } catch (e) { alert('Failed to disconnect WhatsApp') }
                              }}
                              className="px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg hover:bg-red-50 text-red-600">
                              Disconnect
                            </button>
                          </>
                        )}
                        {status === 'not_connected' && p.key === 'whatsapp' && (
                          <button onClick={async () => {
                              setWaConnecting(true)
                              try {
                                await whatsappAPI.connect()
                                setShowWaQrModal(true)
                              } catch (e) { alert(e.response?.data?.error || 'Failed to connect WhatsApp') }
                              finally { setWaConnecting(false) }
                            }}
                            disabled={waConnecting}
                            className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1">
                            {waConnecting ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />} Connect
                          </button>
                        )}
                        {/* Connected Email actions */}
                        {p.key === 'email' && (
                          <>
                            {status === 'connected' && (
                              <span className="text-xs text-green-700 font-medium truncate max-w-[180px]" title={emailAccounts.map(a => a.email_address).join(', ')}>
                                {emailAccounts.filter(a => a.status === 'connected').length} mailbox{emailAccounts.filter(a => a.status === 'connected').length === 1 ? '' : 'es'}
                              </span>
                            )}
                            <button
                              onClick={() => navigate('/settings/connected-inboxes')}
                              disabled={!emailConfigured || (!emailProvidersAvail.gmail && !emailProvidersAvail.outlook)}
                              title={!emailConfigured ? 'Email OAuth not configured on server' : undefined}
                              className="px-3 py-1.5 text-xs font-medium bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-1">
                              <Mail size={12} /> {status === 'connected' ? 'Manage' : (emailConfigured ? 'Connect' : 'Not configured')}
                            </button>
                          </>
                        )}
                        {status === 'coming_soon' && <span className="text-xs text-[var(--sf-text-muted)]">Coming soon</span>}
                      </div>
                    </div>
                    {/* Progress bar inside OpenPhone card */}
                    {isOpenPhone && syncing && (
                      <div className="px-4 pb-4">
                        <div className="bg-[var(--sf-bg-input)] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-[var(--sf-text-primary)]">
                              {syncProgress?.phase === 'fetching' || syncProgress?.phase === 'full_sync' ? 'Fetching from Sigcore...' : syncProgress?.phase === 'syncing' ? 'Syncing conversations...' : syncProgress?.phase === 'done' ? 'Complete!' : 'Starting...'}
                            </span>
                            <span className="text-xs text-[var(--sf-text-muted)]">
                              {syncProgress?.total > 0 ? `${syncProgress.synced || 0}/${syncProgress.total} convs, ${syncProgress.messages || 0} msgs${syncProgress.etaSeconds > 0 ? ` · ~${syncProgress.etaSeconds > 60 ? Math.round(syncProgress.etaSeconds / 60) + 'm' : syncProgress.etaSeconds + 's'} left` : ''}` : syncProgress?.status === 'running' ? 'Fetching...' : 'Starting...'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-[var(--sf-blue-500)] h-1.5 rounded-full transition-all"
                              style={{ width: `${syncProgress?.total > 0 ? Math.round((syncProgress.synced / syncProgress.total) * 100) : 5}%` }} />
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            {syncProgress?.errors > 0 && <p className="text-[10px] text-red-500">{syncProgress.errors} errors</p>}
                            <button onClick={handleCancelSync} className="text-[10px] text-red-500 hover:text-red-700 font-medium">
                              Cancel Sync
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Sync result inside OpenPhone card */}
                    {isOpenPhone && syncResult && !syncing && (
                      <div className="px-4 pb-4">
                        <div className={`${syncResult.cancelled ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'} rounded-lg p-3 text-xs`}>
                          {syncResult.cancelled ? 'Cancelled' : 'Synced'}: {syncResult.conversations} conversations, {syncResult.messages} messages
                        </div>
                      </div>
                    )}
                    {/* LeadBridge sync progress */}
                    {isLeadBridge && lbSyncing && (
                      <div className="px-4 pb-4">
                        <div className="bg-[var(--sf-bg-input)] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-[var(--sf-text-primary)]">
                              {lbSyncProgress?.phase?.startsWith('syncing_') ? `Syncing ${lbSyncProgress.phase.replace('syncing_', '')}...` : 'Syncing...'}
                            </span>
                            <span className="text-xs text-[var(--sf-text-muted)]">
                              {lbSyncProgress ? `${lbSyncProgress.synced}/${lbSyncProgress.total} leads, ${lbSyncProgress.messages} msgs` : 'Starting...'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-[var(--sf-blue-500)] h-1.5 rounded-full transition-all"
                              style={{ width: `${lbSyncProgress?.total > 0 ? Math.round((lbSyncProgress.synced / lbSyncProgress.total) * 100) : 5}%` }} />
                          </div>
                          {lbSyncProgress?.errors > 0 && <p className="text-[10px] text-red-500 mt-1">{lbSyncProgress.errors} errors</p>}
                        </div>
                      </div>
                    )}
                    {/* LeadBridge sync result */}
                    {isLeadBridge && lbSyncProgress?.status === 'complete' && !lbSyncing && (
                      <div className="px-4 pb-4">
                        <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">
                          Synced {lbSyncProgress.synced} conversations, {lbSyncProgress.messages} messages
                        </div>
                      </div>
                    )}
                    {/* WhatsApp sync progress */}
                    {isWhatsApp && waSyncing && (
                      <div className="px-4 pb-4">
                        <div className="bg-[var(--sf-bg-input)] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-[var(--sf-text-primary)]">
                              {waSyncProgress?.phase === 'receiving' ? 'Receiving messages from WhatsApp...' : waSyncProgress?.phase === 'fetching' ? 'Fetching conversations...' : waSyncProgress?.phase === 'syncing' ? 'Syncing conversations...' : waSyncProgress?.phase === 'done' ? 'Complete!' : 'Starting...'}
                            </span>
                            <span className="text-xs text-[var(--sf-text-muted)]">
                              {waSyncProgress?.phase === 'receiving'
                                ? `${waSyncProgress.chats || 0} conversations, ${waSyncProgress.messages || 0} messages`
                                : waSyncProgress?.total > 0 ? `${waSyncProgress.chats || 0}/${waSyncProgress.total} chats, ${waSyncProgress.messages || 0} msgs` : waSyncProgress?.phase === 'fetching' ? 'Fetching...' : 'Starting...'}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-700"
                              style={{ width: `${waSyncProgress?.phase === 'receiving'
                                ? Math.min(95, 3 + Math.sqrt(waSyncProgress.messages || 0) * 4)
                                : waSyncProgress?.total > 0 ? Math.round(((waSyncProgress.chats || 0) / waSyncProgress.total) * 100) : 3}%` }} />
                          </div>
                          {waSyncProgress?.skipped > 0 && <p className="text-[10px] text-amber-500 mt-1">{waSyncProgress.skipped} skipped</p>}
                        </div>
                      </div>
                    )}
                    {/* WhatsApp sync result */}
                    {isWhatsApp && waSyncProgress?.phase === 'done' && !waSyncing && (
                      <div className="px-4 pb-4">
                        <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">
                          Synced {waSyncProgress.chats} chats, {waSyncProgress.messages} messages{waSyncProgress.linked > 0 ? `, ${waSyncProgress.linked} linked` : ''}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {syncResult && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Synced {syncResult.conversations} conversations, {syncResult.messages} messages
              </div>
            )}
          </section>

          {/* ═══ Section 2: Available Channels ═══ */}
          <section>
            <SectionHeader title="Available Communication Channels" subtitle="Channels available in your CRM Communications inbox" />
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--sf-border-light)] bg-[var(--sf-bg-input)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--sf-text-muted)] uppercase">Channel</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--sf-text-muted)] uppercase">Provider</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--sf-text-muted)] uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sf-border-light)]">
                  {CHANNEL_DEFS.map(ch => {
                    const providerConnected = getProviderStatus(ch.providerKey) === 'connected'
                    return (
                      <tr key={ch.channel} className={providerConnected ? '' : 'opacity-50'}>
                        <td className="px-4 py-3 font-medium text-[var(--sf-text-primary)]">{ch.name}</td>
                        <td className="px-4 py-3 text-[var(--sf-text-muted)]">{PROVIDER_DEFS.find(p => p.key === ch.providerKey)?.name || ch.providerKey}</td>
                        <td className="px-4 py-3">
                          {providerConnected ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={14} /> Active</span>
                          ) : (
                            <span className="text-xs text-[var(--sf-text-muted)]">Not configured</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ═══ Section 3: Default Behavior ═══ */}
          <section>
            <SectionHeader title="Default Communication Behavior" subtitle="Control how CRM chooses communication methods" />
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5 space-y-1 divide-y divide-[var(--sf-border-light)]">
              <SelectControl label="Default send channel" helpText="The default channel selected in the conversation composer"
                value={prefs.defaultSendChannel} onChange={v => updatePref('defaultSendChannel', v)}
                options={[{ value: 'last_used', label: 'Last used channel' }, { value: 'openphone', label: 'OpenPhone' }, { value: 'leadbridge', label: 'LeadBridge channel' }]} />
              <SelectControl label="Preferred outbound channel" helpText="How to choose the channel for ongoing conversations"
                value={prefs.preferredOutboundBehavior} onChange={v => updatePref('preferredOutboundBehavior', v)}
                options={[{ value: 'original_channel', label: 'Keep using original source channel' }, { value: 'prefer_openphone', label: 'Prefer OpenPhone' }, { value: 'ask_each_time', label: 'Ask each time' }]} />
            </div>
          </section>

          {/* ═══ Section 4: Linking Rules ═══ */}
          <section>
            <SectionHeader title="Conversation Linking Rules" subtitle="How messages and calls attach to CRM leads and customers" />
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5 divide-y divide-[var(--sf-border-light)]">
              <Toggle label="Auto-link by exact phone match" helpText="Match conversations to customers/leads with the same phone number" checked={prefs.autoLinkByPhone} onChange={v => updatePref('autoLinkByPhone', v)} />
              <Toggle label="Auto-link by exact email match" checked={prefs.autoLinkByEmail} onChange={v => updatePref('autoLinkByEmail', v)} />
              <Toggle label="Auto-link by existing source mapping" helpText="Match using known provider IDs" checked={prefs.autoLinkBySource} onChange={v => updatePref('autoLinkBySource', v)} />
              <Toggle label="Show unlinked conversations in inbox" helpText="Display conversations not matched to a CRM lead" checked={prefs.showUnlinkedConversations} onChange={v => updatePref('showUnlinkedConversations', v)} />
            </div>
          </section>

          {/* ═══ Section 5: Inbox Preferences ═══ */}
          <section>
            <SectionHeader title="Inbox Preferences" subtitle="Configure how the Communications screen behaves" />
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5 divide-y divide-[var(--sf-border-light)]">
              <SelectControl label="Default inbox filter on load" value={prefs.defaultInboxFilter} onChange={v => updatePref('defaultInboxFilter', v)}
                options={[{ value: 'unread', label: 'Unread' }, { value: 'recents', label: 'Recents' }, { value: 'all', label: 'All' }]} />
              <Toggle label="Mark conversation as read when opened" checked={prefs.markReadOnOpen} onChange={v => updatePref('markReadOnOpen', v)} />
              <Toggle label="Display channel badges in conversation list" checked={prefs.showChannelBadges} onChange={v => updatePref('showChannelBadges', v)} />
              <Toggle label="Group conversations by lead when possible" checked={prefs.groupByLeadWhenPossible} onChange={v => updatePref('groupByLeadWhenPossible', v)} />
              <Toggle label="Show archived conversations" checked={prefs.showArchivedConversations} onChange={v => updatePref('showArchivedConversations', v)} />
              <Toggle label="Show call events in timeline" checked={prefs.showCallEvents} onChange={v => updatePref('showCallEvents', v)} />
              <Toggle label="Show system events in timeline" checked={prefs.showSystemEvents} onChange={v => updatePref('showSystemEvents', v)} />
            </div>
          </section>

          {/* ═══ Section 6: Business Numbers ═══ */}
          <section>
            <SectionHeader title="Connected Business Numbers" subtitle="Communication numbers available from connected providers" />
            {phoneNumbers.length > 0 ? (
              <div className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden divide-y divide-[var(--sf-border-light)]">
                {phoneNumbers.map((pn, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--sf-text-primary)]">{pn.number || pn.phoneNumber || pn}</div>
                      <div className="text-xs text-[var(--sf-text-muted)]">via OpenPhone {pn.name ? `· ${pn.name}` : ''}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {(Array.isArray(pn.capabilities)
                        ? pn.capabilities.map(c => typeof c === 'string' ? c : c.type || 'SMS')
                        : typeof pn.capabilities === 'object' && pn.capabilities
                          ? Object.keys(pn.capabilities).filter(k => pn.capabilities[k])
                          : ['SMS', 'Voice']
                      ).map(cap => (
                        <span key={cap} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)] font-medium uppercase">{cap}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[var(--sf-border-light)] p-6 text-center text-[var(--sf-text-muted)] text-sm">
                No business numbers connected. Connect a provider above to see available numbers.
              </div>
            )}
          </section>

          {/* ═══ Section 7: Coming Soon ═══ */}
          <section className="opacity-60">
            <SectionHeader title="Coming Soon" subtitle="Features planned for future releases" />
            <div className="bg-white rounded-xl border border-dashed border-[var(--sf-border)] p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[{ icon: Zap, label: 'Channel-specific routing' }, { icon: Shield, label: 'Assignment rules' }, { icon: Clock, label: 'SLA rules' }, { icon: MessageSquare, label: 'AI reply behavior' }, { icon: Mail, label: 'Templates by channel' }, { icon: Settings, label: 'Shared inbox permissions' }].map(f => (
                  <div key={f.label} className="flex items-center gap-2 text-xs text-[var(--sf-text-muted)] p-2"><f.icon size={14} /> {f.label}</div>
                ))}
              </div>
            </div>
          </section>

        </div>
        )}

      {/* OpenPhone Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--sf-text-primary)] mb-2">Connect OpenPhone</h3>
            <p className="text-sm text-[var(--sf-text-muted)] mb-4">Enter your OpenPhone API key. You can find it in OpenPhone Settings → API.</p>
            {connectError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{connectError}</div>}
            <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="Enter OpenPhone API key"
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConnectModal(false)} className="px-4 py-2 text-sm text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]">Cancel</button>
              <button onClick={handleConnect} disabled={connecting}
                className="px-4 py-2 text-sm bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
                {connecting && <Loader2 size={14} className="animate-spin" />} {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LeadBridge Connect Modal */}
      {showLbConnectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--sf-text-primary)] mb-2">Connect Thumbtack / Yelp</h3>
            <p className="text-sm text-[var(--sf-text-muted)] mb-4">Sign in with your LeadBridge account to import Thumbtack and Yelp conversations.</p>
            {lbConnectError && <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{lbConnectError}</div>}
            <input type="email" value={lbEmail} onChange={e => setLbEmail(e.target.value)} placeholder="LeadBridge email"
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
            <input type="password" value={lbPassword} onChange={e => setLbPassword(e.target.value)} placeholder="Password"
              onKeyDown={e => e.key === 'Enter' && handleLbConnect()}
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowLbConnectModal(false)} className="px-4 py-2 text-sm text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]">Cancel</button>
              <button onClick={handleLbConnect} disabled={lbConnecting}
                className="px-4 py-2 text-sm bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
                {lbConnecting && <Loader2 size={14} className="animate-spin" />} {lbConnecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp QR Code Modal */}
      {showWaQrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[var(--sf-text-primary)]">Connect WhatsApp</h3>
              <button onClick={() => setShowWaQrModal(false)} className="p-1 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)]">
                <X size={18} />
              </button>
            </div>
            <WhatsAppQrPanel onConnected={async (phone) => {
              setWaConnected(true)
              setWaPhoneNumber(phone)
              setWaStatus('connected')
              setShowWaQrModal(false)
              // Auto-trigger sync with progress bar
              setWaSyncing(true); setWaSyncProgress({ phase: 'receiving', chats: 0, messages: 0 })
              try {
                // Start polling progress — webhooks are delivering messages
                let idleCount = 0
                const poll = setInterval(async () => {
                  try {
                    const p = await whatsappAPI.getSyncProgress()
                    // 'idle' means server hasn't set progress yet — keep waiting
                    if (p.phase === 'idle') {
                      idleCount++
                      if (idleCount > 60) { clearInterval(poll); setWaSyncing(false) } // 2 min timeout
                      return
                    }
                    idleCount = 0
                    setWaSyncProgress(p)
                    if (p.phase === 'done' || p.phase === 'error') {
                      clearInterval(poll); setWaSyncing(false)
                    }
                  } catch (e) { /* poll failed, keep trying */ }
                }, 2000)
                // After 90s, trigger full API sync for avatars + catch-up
                setTimeout(async () => {
                  try { await whatsappAPI.sync() } catch (e) { /* non-fatal */ }
                }, 90000)
              } catch (e) { setWaSyncing(false) }
            }} />
          </div>
        </div>
      )}
    </SettingsRailLayout>
  )
}

function WhatsAppQrPanel({ onConnected }) {
  const [qrCode, setQrCode] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    let interval = null

    const poll = async () => {
      try {
        const res = await whatsappAPI.getQR()
        if (!active) return
        if (res.connected) {
          onConnected(res.phoneNumber)
          return
        }
        if (res.qrCode) {
          setQrCode(res.qrCode)
          setStatus('qr_ready')
        } else {
          setStatus(res.status || 'initializing')
        }
        setError(null)
      } catch (e) {
        if (!active) return
        setError('Failed to get QR code')
        setStatus('error')
      }
    }

    poll()
    interval = setInterval(poll, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (status === 'error') return (
    <div className="text-center py-6">
      <p className="text-sm text-red-600">{error}</p>
      <p className="text-xs text-[var(--sf-text-muted)] mt-1">Check that OpenPhone is connected first</p>
    </div>
  )

  if (status === 'loading' || status === 'initializing') return (
    <div className="flex flex-col items-center py-8 gap-3">
      <Loader2 size={32} className="animate-spin text-[var(--sf-blue-500)]" />
      <p className="text-sm text-[var(--sf-text-muted)]">Initializing WhatsApp...</p>
    </div>
  )

  if (status === 'qr_ready' && qrCode) return (
    <div className="flex flex-col items-center gap-4">
      <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg border border-[var(--sf-border-light)]" />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--sf-text-primary)]">Scan with WhatsApp</p>
        <p className="text-xs text-[var(--sf-text-muted)] mt-1">Open WhatsApp → Settings → Linked Devices → Link a Device</p>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col items-center py-6 gap-2">
      <Loader2 size={24} className="animate-spin text-[var(--sf-text-muted)]" />
      <p className="text-xs text-[var(--sf-text-muted)]">Status: {status}</p>
    </div>
  )
}

export default CommunicationHub
