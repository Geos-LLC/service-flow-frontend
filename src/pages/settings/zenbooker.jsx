"use client"

import { useState, useEffect, useRef } from "react"
import { Check, AlertCircle, RefreshCw, Unplug, Copy, ExternalLink } from "lucide-react"
import api from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import SettingsPageLayout from "../../components/settings-page-layout"

const ZenbookerSettings = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('disconnected')
  const [lastSync, setLastSync] = useState(null)
  const [stats, setStats] = useState({})
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [copied, setCopied] = useState(false)
  const pollRef = useRef(null)

  const webhookUrl = 'https://service-flow-backend-staging-303f.up.railway.app/api/zenbooker/webhook'

  useEffect(() => {
    if (user) loadStatus()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [user])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const res = await api.get('/zenbooker/status')
      setStatus(res.data.status || 'disconnected')
      setLastSync(res.data.lastSync)
      setStats(res.data.stats || {})
      if (res.data.syncProgress?.status === 'running') {
        setSyncing(true)
        setSyncProgress(res.data.syncProgress)
        startPolling()
      }
    } catch {
      setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    let idleCount = 0
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get('/zenbooker/sync/progress')
        setSyncProgress(res.data)
        if (res.data.status === 'idle') {
          idleCount++
          // Give the backend 10 seconds to start (5 polls × 2s)
          if (idleCount < 5) return
        }
        if (res.data.status !== 'running' && res.data.status !== 'idle') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setSyncing(false)
          loadStatus()
        } else if (res.data.status === 'idle' && idleCount >= 5) {
          // Sync never started — probably crashed
          clearInterval(pollRef.current)
          pollRef.current = null
          setSyncing(false)
          loadStatus()
        }
      } catch {
        clearInterval(pollRef.current)
        pollRef.current = null
        setSyncing(false)
      }
    }, 2000)
  }

  const handleConnect = async () => {
    if (!apiKey.trim()) return setMessage({ type: 'error', text: 'Please enter your Zenbooker API key' })
    setConnecting(true)
    setMessage({ type: '', text: '' })
    try {
      await api.post('/zenbooker/connect', { apiKey: apiKey.trim() })
      setStatus('connected')
      setSyncing(true)
      setMessage({ type: 'success', text: 'Connected! Initial sync is running...' })
      setApiKey('')
      startPolling()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to connect' })
    } finally {
      setConnecting(false)
    }
  }

  const handleSync = async (options = {}) => {
    setSyncing(true)
    setMessage({ type: '', text: '' })
    try {
      await api.post('/zenbooker/sync', options)
      setMessage({ type: 'success', text: `Sync started: ${options.entity || 'full'}...` })
      startPolling()
    } catch (err) {
      setSyncing(false)
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to start sync' })
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Zenbooker? All synced data will be preserved in Service Flow.')) return
    try {
      await api.delete('/zenbooker/disconnect')
      setStatus('disconnected')
      setLastSync(null)
      setStats({})
      setSyncProgress(null)
      setMessage({ type: 'success', text: 'Disconnected. All data preserved.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to disconnect' })
    }
  }

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <SettingsPageLayout title="Zenbooker">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </SettingsPageLayout>
    )
  }

  return (
    <SettingsPageLayout
      title="Zenbooker"
      subtitle="Sync jobs, customers, and team from Zenbooker in real-time"
      maxWidth={800}
    >
      <div className="space-y-6">
            {/* Message */}
            {message.text && (
              <div className={`rounded-lg p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <div className="flex items-center space-x-2">
                  {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span className="font-medium">{message.text}</span>
                </div>
              </div>
            )}

            {/* Connection Status */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Connection</h2>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {status === 'connected' ? 'Connected' : 'Disconnected'}
                </div>
              </div>

              {status !== 'connected' ? (
                <div>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    Connect your Zenbooker account to sync jobs, customers, services, and team members automatically.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="Enter Zenbooker API key"
                      className="flex-1 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm"
                      onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    />
                    <button onClick={handleConnect} disabled={connecting}
                      className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
                      style={{ border: 'none', boxShadow: 'none' }}>
                      {connecting ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                  <p className="text-xs text-[var(--sf-text-muted)] mt-2">
                    Find your API key in Zenbooker → Settings → API
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      {lastSync && (
                        <p className="text-sm text-[var(--sf-text-secondary)]">
                          Last synced: {new Date(lastSync).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={handleSync} disabled={syncing}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] disabled:opacity-50"
                        style={{ background: 'white', boxShadow: 'none' }}>
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      <button onClick={handleDisconnect}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                        style={{ background: 'white', boxShadow: 'none' }}>
                        <Unplug className="w-4 h-4" /> Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sync Progress */}
              {(syncProgress?.status === 'running' || syncing) && (
                <div className="mt-4 pt-4 border-t border-[var(--sf-border-light)]">
                  <div className="flex items-center justify-between text-sm text-[var(--sf-text-secondary)] mb-1">
                    <span className="font-medium">Syncing: {syncProgress?.phase || 'Starting...'}</span>
                    <span>{syncProgress?.progress || 0}%</span>
                  </div>
                  {syncProgress?.detail && (
                    <div className="text-xs text-[var(--sf-text-muted)] mb-2">{syncProgress.detail}</div>
                  )}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[var(--sf-blue-500)] h-2 rounded-full transition-all" style={{ width: `${syncProgress?.progress || 0}%` }} />
                  </div>
                  {syncProgress?.results && (
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--sf-text-muted)]">
                      {syncProgress.results.territories && <span>Territories: {syncProgress.results.territories.total}</span>}
                      {syncProgress.results.services && <span>Services: {syncProgress.results.services.total}</span>}
                      {syncProgress.results.teamMembers && <span>Team: {syncProgress.results.teamMembers.total}</span>}
                      {syncProgress.results.customers && <span>Customers: {syncProgress.results.customers.total}</span>}
                      {syncProgress.results.jobs && <span>Jobs: {syncProgress.results.jobs.total}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sync Controls */}
            {status === 'connected' && (
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">Sync Data</h2>

                {/* Jobs sync with time controls */}
                <div className="mb-5 pb-5 border-b border-[var(--sf-border-light)]">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-[var(--sf-text-primary)]">Jobs</span>
                      <span className="text-xs text-[var(--sf-text-muted)] ml-2">{stats.jobs || 0} synced</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const today = new Date(); today.setHours(0,0,0,0)
                      const daysAgo = (d) => { const dt = new Date(today); dt.setDate(dt.getDate() - d); return dt.toISOString() }
                      return [
                        { label: 'Last 20', opts: { entity: 'jobs', maxItems: 20 } },
                        { label: 'Last Week', opts: { entity: 'jobs', since: daysAgo(7) } },
                        { label: 'Last Month', opts: { entity: 'jobs', since: daysAgo(30) } },
                        { label: 'Last Year', opts: { entity: 'jobs', since: daysAgo(365) } },
                        { label: 'All Jobs', opts: { entity: 'jobs' } },
                        { label: 'Incl. Cancelled', opts: { entity: 'jobs', includeCancelled: true } },
                      ]
                    })().map(b => (
                      <button key={b.label} onClick={() => handleSync(b.opts)} disabled={syncing}
                        className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] disabled:opacity-50"
                        style={{ background: 'white', boxShadow: 'none' }}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Other entity syncs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Customers', key: 'customers', count: stats.customers || 0 },
                    { label: 'Services', key: 'services', count: stats.services || 0 },
                    { label: 'Team', key: 'team', count: stats.teamMembers || 0 },
                    { label: 'Territories', key: 'territories', count: stats.territories || 0 },
                  ].map(e => (
                    <div key={e.key} className="bg-[var(--sf-bg-page)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[var(--sf-text-primary)]">{e.label}</span>
                        <span className="text-lg font-bold text-[var(--sf-text-primary)]">{e.count}</span>
                      </div>
                      <button onClick={() => handleSync({ entity: e.key })} disabled={syncing}
                        className="w-full px-2 py-1 text-xs border border-[var(--sf-border-light)] rounded hover:bg-white disabled:opacity-50"
                        style={{ background: 'white', boxShadow: 'none' }}>
                        Sync {e.label}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Link all + Full sync */}
                <div className="flex gap-2">
                  <button onClick={() => handleSync({ entity: 'link_all' })} disabled={syncing}
                    className="px-3 py-1.5 text-xs border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] disabled:opacity-50"
                    style={{ background: 'white', boxShadow: 'none' }}>
                    Link Existing Records
                  </button>
                  <button onClick={() => handleSync({ entity: 'reconcile' })} disabled={syncing}
                    className="px-3 py-1.5 text-xs border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50"
                    style={{ background: 'white', boxShadow: 'none' }}>
                    Reconcile Statuses
                  </button>
                  <button onClick={() => handleSync()} disabled={syncing}
                    className="px-3 py-1.5 text-xs bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
                    style={{ border: 'none', boxShadow: 'none' }}>
                    Full Sync (Link + All Jobs)
                  </button>
                </div>
              </div>
            )}

            {/* Webhook Setup Instructions */}
            {status === 'connected' && (
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Webhook Setup</h2>
                <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                  To receive real-time updates, create webhooks in your Zenbooker dashboard. Set each event to point to this URL:
                </p>

                <div className="flex items-center gap-2 mb-4">
                  <code className="flex-1 bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm text-[var(--sf-text-primary)] select-all overflow-auto">
                    {webhookUrl}
                  </code>
                  <button onClick={copyWebhookUrl}
                    className="flex items-center gap-1 px-3 py-2 text-sm border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)]"
                    style={{ background: 'white', boxShadow: 'none', flexShrink: 0 }}>
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="text-sm text-[var(--sf-text-secondary)]">
                  <p className="font-medium mb-2">Create webhooks for these events:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {[
                      'job.created', 'job.rescheduled', 'job.canceled',
                      'job.enroute', 'job.started', 'job.completed',
                      'job.service_providers.assigned',
                      'invoice_payment.succeeded', 'invoice_payment.recorded',
                    ].map(evt => (
                      <div key={evt} className="flex items-center gap-2 text-xs py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--sf-blue-500)] flex-shrink-0" />
                        <code className="text-[var(--sf-text-primary)]">{evt}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Disconnecting preserves all synced data in Service Flow. You can reconnect anytime — existing records will be matched by their Zenbooker ID without duplication.
              </p>
            </div>
      </div>
    </SettingsPageLayout>
  )
}

export default ZenbookerSettings
