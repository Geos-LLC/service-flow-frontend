"use client"

import { useState, useEffect } from "react"
import SettingsPageLayout from "../../components/settings-page-layout"
import { Check, AlertCircle } from "lucide-react"
import { paymentMethodsAPI } from "../../services/api"
import api from "../../services/api"
import { useAuth } from "../../context/AuthContext"

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const PayoutSettings = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [customPaymentMethods, setCustomPaymentMethods] = useState([])

  const [settings, setSettings] = useState({
    payoutFrequency: 'manual',
    payPeriodStartDay: 1,
    biweeklyAnchorDate: '',
    payoutMethod: 'bank_transfer',
    autoPayoutEnabled: false,
  })

  useEffect(() => {
    if (user) loadSettings()
  }, [user])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const [payoutRes, methodsData] = await Promise.all([
        api.get('/user/payout-settings').catch(() => ({ data: {} })),
        paymentMethodsAPI.getPaymentMethods().catch(() => [])
      ])
      const data = payoutRes.data || {}
      setSettings({
        payoutFrequency: data.payout_frequency || 'manual',
        payPeriodStartDay: data.pay_period_start_day ?? 1,
        biweeklyAnchorDate: data.biweekly_anchor_date || '',
        payoutMethod: data.payout_method || 'bank_transfer',
        autoPayoutEnabled: data.auto_payout_enabled === true,
      })
      setCustomPaymentMethods(methodsData || [])
    } catch (error) {
      console.error('Error loading payout settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await api.put('/user/payout-settings', {
        payoutFrequency: settings.payoutFrequency,
        payPeriodStartDay: settings.payPeriodStartDay,
        biweeklyAnchorDate: settings.biweeklyAnchorDate || null,
        payoutMethod: settings.payoutMethod,
        autoPayoutEnabled: settings.autoPayoutEnabled,
      })
      setMessage({ type: 'success', text: 'Payout settings saved successfully' })
    } catch (error) {
      console.error('Error saving payout settings:', error)
      setMessage({ type: 'error', text: 'Failed to save payout settings' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    }
  }

  if (loading) {
    return (
      <SettingsPageLayout title="Payouts">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-[var(--sf-text-secondary)]">Loading payout settings…</p>
          </div>
        </div>
      </SettingsPageLayout>
    )
  }

  return (
    <SettingsPageLayout
      title="Payouts"
      subtitle="Configure payout frequency, pay period, payout method, and auto-payout"
    >

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {/* Message */}
            {message.text && (
              <div className={`rounded-lg p-4 ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                <div className="flex items-center space-x-2">
                  {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span className="font-medium">{message.text}</span>
                </div>
              </div>
            )}

            {/* Payout Frequency */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">Payout Frequency</h2>
              <p className="text-sm text-[var(--sf-text-muted)] mb-4">How often team members get paid. This is the default for new team members.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: 'daily', label: 'Daily', desc: 'Every day' },
                  { value: 'weekly', label: 'Weekly', desc: 'Once a week' },
                  { value: 'biweekly', label: 'Biweekly', desc: 'Every 2 weeks' },
                  { value: 'manual', label: 'Manual', desc: 'On demand' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings(prev => ({ ...prev, payoutFrequency: opt.value }))}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      border: settings.payoutFrequency === opt.value ? '2px solid var(--sf-blue-500)' : '1.5px solid var(--sf-border-light)',
                      background: settings.payoutFrequency === opt.value ? 'var(--sf-blue-50)' : 'white',
                      color: settings.payoutFrequency === opt.value ? 'var(--sf-blue-500)' : 'var(--sf-text-secondary)',
                      boxShadow: 'none',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: 400, opacity: 0.8 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pay Period Start Day */}
            {(settings.payoutFrequency === 'weekly' || settings.payoutFrequency === 'biweekly') && (
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">Pay Period Start Day</h2>
                <p className="text-sm text-[var(--sf-text-muted)] mb-4">Which day of the week the pay period starts.</p>

                <select
                  value={settings.payPeriodStartDay}
                  onChange={e => setSettings(prev => ({ ...prev, payPeriodStartDay: parseInt(e.target.value) }))}
                  className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm w-full max-w-xs"
                >
                  {DAYS_OF_WEEK.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Biweekly Anchor Date */}
            {settings.payoutFrequency === 'biweekly' && (
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">Pay Cycle Anchor Date</h2>
                <p className="text-sm text-[var(--sf-text-muted)] mb-4">
                  The reference date for biweekly cycles. Payouts happen every 2 weeks from this date.
                </p>

                <input
                  type="date"
                  value={settings.biweeklyAnchorDate}
                  onChange={e => setSettings(prev => ({ ...prev, biweeklyAnchorDate: e.target.value }))}
                  className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm w-full max-w-xs"
                />
              </div>
            )}

            {/* Payout Method */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">Payout Method</h2>
              <p className="text-sm text-[var(--sf-text-muted)] mb-4">Default method used to pay team members.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: 'bank_transfer', label: 'Bank Transfer' },
                  { value: 'check', label: 'Check' },
                  { value: 'cash', label: 'Cash' },
                  ...customPaymentMethods.map(pm => ({ value: pm.name, label: pm.name })),
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSettings(prev => ({ ...prev, payoutMethod: opt.value }))}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: settings.payoutMethod === opt.value ? 600 : 500,
                      border: settings.payoutMethod === opt.value ? '2px solid var(--sf-blue-500)' : '1.5px solid var(--sf-border-light)',
                      background: settings.payoutMethod === opt.value ? 'var(--sf-blue-50)' : 'white',
                      color: settings.payoutMethod === opt.value ? 'var(--sf-blue-500)' : 'var(--sf-text-secondary)',
                      boxShadow: 'none',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Payout */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Auto Payout</h2>
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                    Automatically create payout batches based on the frequency above. Batches are created as "pending" — you still need to mark them as paid.
                  </p>
                </div>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, autoPayoutEnabled: !prev.autoPayoutEnabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                    settings.autoPayoutEnabled ? "bg-[var(--sf-blue-500)]" : "bg-gray-300"
                  }`}
                  style={{ border: 'none', boxShadow: 'none', padding: 0, borderRadius: '9999px' }}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoPayoutEnabled ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>
              {settings.autoPayoutEnabled && settings.payoutFrequency === 'manual' && (
                <div className="mt-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  Auto payout is enabled but frequency is set to "Manual". Change the frequency to Daily, Weekly, or Biweekly for auto payouts to work.
                </div>
              )}
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--sf-blue-500)] text-white px-6 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: 'none', boxShadow: 'none' }}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
    </SettingsPageLayout>
  )
}

export default PayoutSettings
