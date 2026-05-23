"use client"

import { useState, useEffect } from "react"
import { notificationEmailAPI } from "../../services/api"
import {
  Mail, Check, X, Loader2, Send, Shield, AlertCircle
} from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const NotificationEmail = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Settings state
  const [configured, setConfigured] = useState(false)
  const [source, setSource] = useState('none') // 'none', 'environment', 'tenant'
  const [apiKey, setApiKey] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [replyToName, setReplyToName] = useState('')
  const [useForCustomer, setUseForCustomer] = useState(true)
  const [useForInternal, setUseForInternal] = useState(true)
  const [isEnabled, setIsEnabled] = useState(true)
  const [hasApiKey, setHasApiKey] = useState(false)

  // Test state
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState(null) // null, 'success', 'failed'
  const [testError, setTestError] = useState('')
  const [lastTestedAt, setLastTestedAt] = useState(null)

  // Messages
  const [saveMessage, setSaveMessage] = useState(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await notificationEmailAPI.getSettings()
      setConfigured(data.configured || false)
      setSource(data.source || 'none')

      if (data.settings) {
        setFromEmail(data.settings.fromEmail || '')
        setFromName(data.settings.fromName || '')
        setReplyToEmail(data.settings.replyToEmail || '')
        setReplyToName(data.settings.replyToName || '')
        setUseForCustomer(data.settings.useForCustomerNotifications !== false)
        setUseForInternal(data.settings.useForInternalNotifications !== false)
        setIsEnabled(data.settings.isEnabled !== false)
        setHasApiKey(data.settings.hasApiKey || false)
        setLastTestedAt(data.settings.lastTestedAt)
        setTestStatus(data.settings.lastTestStatus || null)
        setTestError(data.settings.lastTestError || '')
      }
    } catch (e) {
      // Not configured
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      await notificationEmailAPI.saveSettings({
        apiKey: apiKey || undefined,
        fromEmail,
        fromName,
        replyToEmail,
        replyToName,
        useForCustomerNotifications: useForCustomer,
        useForInternalNotifications: useForInternal,
        isEnabled,
      })
      setSaveMessage({ type: 'success', text: 'Settings saved successfully' })
      setApiKey('') // Clear input after save
      await loadSettings() // Refresh state
    } catch (e) {
      setSaveMessage({ type: 'error', text: e.response?.data?.error || 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testEmail?.trim()) return
    setTesting(true)
    setTestStatus(null)
    setTestError('')
    try {
      await notificationEmailAPI.sendTest(testEmail.trim())
      setTestStatus('success')
      setLastTestedAt(new Date().toISOString())
    } catch (e) {
      setTestStatus('failed')
      setTestError(e.response?.data?.error || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  const statusLabel = () => {
    if (source === 'none') return { text: 'Not Configured', color: 'bg-gray-100 text-gray-600' }
    if (source === 'environment') return { text: 'Using Environment', color: 'bg-yellow-100 text-yellow-700' }
    if (!isEnabled) return { text: 'Disabled', color: 'bg-red-100 text-red-600' }
    if (testStatus === 'success') return { text: 'Connected', color: 'bg-green-100 text-green-700' }
    if (testStatus === 'failed') return { text: 'Test Failed', color: 'bg-red-100 text-red-600' }
    if (hasApiKey) return { text: 'Configured', color: 'bg-blue-100 text-blue-700' }
    return { text: 'Not Configured', color: 'bg-gray-100 text-gray-600' }
  }

  const status = statusLabel()

  return (
    <SettingsRailLayout
      title="Notification email"
      section="Communications"
      subtitle="SendGrid configuration for outbound system emails"
      actions={
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
          {status.text}
        </span>
      }
    >
        {loading ? (
          <div className="flex items-center justify-center p-20"><Loader2 size={32} className="animate-spin text-[var(--sf-text-muted)]" /></div>
        ) : (
          <div className="max-w-2xl space-y-6">

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
              <Mail size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">System Email Delivery</p>
                <p className="text-xs text-blue-600 mt-1">Configure SendGrid to send estimates, invoices, receipts, appointment reminders, team invites, and paystubs. This is for outbound notifications only — not inbox or two-way email.</p>
              </div>
            </div>

            {source === 'environment' && !hasApiKey && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
                <AlertCircle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Using environment configuration</p>
                  <p className="text-xs text-yellow-600 mt-1">Emails are currently sent using the server's default SendGrid configuration. Add your own API key below to customize sender details.</p>
                </div>
              </div>
            )}

            {/* SendGrid API Key */}
            <section className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
              <h2 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3 flex items-center gap-2">
                <Shield size={16} /> SendGrid Configuration
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--sf-text-secondary)] block mb-1">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={hasApiKey ? '••••••••••••••• (saved)' : 'Enter your SendGrid API key'}
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                  />
                  {hasApiKey && <p className="text-[10px] text-green-600 mt-1">API key is saved. Leave blank to keep current key.</p>}
                </div>
              </div>
            </section>

            {/* Sender Details */}
            <section className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
              <h2 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3 flex items-center gap-2">
                <Mail size={16} /> Sender Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--sf-text-secondary)] block mb-1">From Email *</label>
                  <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)}
                    placeholder="info@yourcompany.com"
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--sf-text-secondary)] block mb-1">From Name</label>
                  <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
                    placeholder="Your Company Name"
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--sf-text-secondary)] block mb-1">Reply-to Email</label>
                  <input type="email" value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)}
                    placeholder="support@yourcompany.com (optional)"
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--sf-text-secondary)] block mb-1">Reply-to Name</label>
                  <input type="text" value={replyToName} onChange={e => setReplyToName(e.target.value)}
                    placeholder="Support Team (optional)"
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                </div>
              </div>
            </section>

            {/* Toggles */}
            <section className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
              <h2 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3">Notification Types</h2>
              <div className="space-y-3">
                {[
                  { label: 'Customer notifications', help: 'Estimates, invoices, receipts, appointment reminders', checked: useForCustomer, onChange: setUseForCustomer },
                  { label: 'Internal notifications', help: 'Team invites, welcome emails, paystubs, admin alerts', checked: useForInternal, onChange: setUseForInternal },
                  { label: 'Email delivery enabled', help: 'Turn off to disable all outbound email', checked: isEnabled, onChange: setIsEnabled },
                ].map(toggle => (
                  <label key={toggle.label} className="flex items-start justify-between py-1 cursor-pointer group">
                    <div className="pr-4">
                      <div className="text-sm font-medium text-[var(--sf-text-primary)]">{toggle.label}</div>
                      <div className="text-xs text-[var(--sf-text-muted)] mt-0.5">{toggle.help}</div>
                    </div>
                    <div className="flex-shrink-0 relative">
                      <input type="checkbox" className="sr-only" checked={toggle.checked} onChange={e => toggle.onChange(e.target.checked)} />
                      <div className={`w-10 h-6 rounded-full transition-colors ${toggle.checked ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${toggle.checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 bg-[var(--sf-blue-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              {saveMessage && (
                <span className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {saveMessage.text}
                </span>
              )}
            </div>

            {/* Test Email */}
            <section className="bg-white rounded-xl border border-[var(--sf-border-light)] p-5">
              <h2 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3 flex items-center gap-2">
                <Send size={16} /> Send Test Email
              </h2>
              <div className="flex gap-2">
                <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  placeholder="Enter test email address"
                  onKeyDown={e => e.key === 'Enter' && handleTest()}
                  className="flex-1 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
                <button onClick={handleTest} disabled={testing || !testEmail?.trim()}
                  className="px-4 py-2 bg-[var(--sf-blue-500)] text-white text-sm font-medium rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {testing ? 'Sending...' : 'Send Test'}
                </button>
              </div>
              {testStatus === 'success' && (
                <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                  <Check size={14} /> Test email sent successfully
                  {lastTestedAt && <span className="text-xs text-[var(--sf-text-muted)]">({new Date(lastTestedAt).toLocaleString()})</span>}
                </div>
              )}
              {testStatus === 'failed' && (
                <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                  <X size={14} /> {testError || 'Test failed'}
                </div>
              )}
            </section>

          </div>
        )}
    </SettingsRailLayout>
  )
}

export default NotificationEmail
