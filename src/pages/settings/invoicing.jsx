"use client"

import { useState, useEffect } from "react"
import { Check, AlertCircle, HelpCircle } from "lucide-react"
import { paymentSettingsAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import SettingsPageLayout from "../../components/settings-page-layout"

const Invoicing = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const [settings, setSettings] = useState({
    showServicePrices: true,
    showServiceDescriptions: false,
    paymentDueDays: 15,
    paymentDueUnit: "days",
    defaultMemo: "",
    invoiceFooter: "",
  })

  useEffect(() => {
    if (user) loadSettings()
  }, [user])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await paymentSettingsAPI.getPaymentSettings()
      setSettings(prev => ({
        ...prev,
        showServicePrices: data.showServicePrices ?? true,
        showServiceDescriptions: data.showServiceDescriptions ?? false,
        paymentDueDays: data.paymentDueDays ?? 15,
        paymentDueUnit: data.paymentDueUnit || 'days',
        defaultMemo: data.defaultMemo || '',
        invoiceFooter: data.invoiceFooter || '',
      }))
    } catch (error) {
      console.error('Error loading invoice settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await paymentSettingsAPI.updatePaymentSettings(settings)
      setMessage({ type: 'success', text: 'Invoice settings saved successfully' })
    } catch (error) {
      console.error('Error saving invoice settings:', error)
      setMessage({ type: 'error', text: 'Failed to save invoice settings' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    }
  }

  if (loading) {
    return (
      <SettingsPageLayout title="Invoicing">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </SettingsPageLayout>
    )
  }

  return (
    <SettingsPageLayout
      title="Invoicing"
      subtitle="Customize invoice templates, memos, footer, and payment terms"
    >
        <div className="flex-1">
          <div className="max-w-3xl mx-auto p-6 space-y-6">
            {message.text && (
              <div className={`rounded-lg p-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                <div className="flex items-center space-x-2">
                  {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  <span className="font-medium">{message.text}</span>
                </div>
              </div>
            )}

            {/* Invoice Template */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">Invoice Template</h2>
              <p className="text-sm text-[var(--sf-text-muted)] mb-6">
                Personalize the default memo and footer message that appear on your invoices, as well as your default payment terms.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Default memo</label>
                  <textarea
                    value={settings.defaultMemo}
                    onChange={(e) => setSettings({ ...settings, defaultMemo: e.target.value })}
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] outline-none"
                    rows={3}
                    placeholder="We appreciate your business."
                  />
                  <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                    This memo will be added to all new invoices. You can customize it for individual invoices later.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Footer</label>
                  <textarea
                    value={settings.invoiceFooter}
                    onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })}
                    className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] outline-none"
                    rows={2}
                    placeholder="This will appear on the bottom of invoice pages"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Payment due</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={settings.paymentDueDays}
                      onChange={(e) => setSettings({ ...settings, paymentDueDays: parseInt(e.target.value) || 0 })}
                      className="w-20 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] outline-none"
                    />
                    <select
                      value={settings.paymentDueUnit}
                      onChange={(e) => setSettings({ ...settings, paymentDueUnit: e.target.value })}
                      className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] outline-none"
                    >
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                    <span className="text-[var(--sf-text-secondary)]">after service date</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={settings.showServicePrices}
                      onChange={(e) => setSettings({ ...settings, showServicePrices: e.target.checked })}
                      className="rounded border-[var(--sf-border-light)] text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)]"
                    />
                    <label className="text-sm text-[var(--sf-text-primary)]">
                      Show prices of service options in service line items
                    </label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={settings.showServiceDescriptions}
                      onChange={(e) => setSettings({ ...settings, showServiceDescriptions: e.target.checked })}
                      className="rounded border-[var(--sf-border-light)] text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)]"
                    />
                    <label className="text-sm text-[var(--sf-text-primary)]">Show service descriptions in invoice line items</label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-medium text-[var(--sf-text-primary)]">Custom Fields</h4>
                      <HelpCircle className="w-4 h-4 text-[var(--sf-text-muted)]" />
                    </div>
                    <button className="text-[var(--sf-blue-500)] font-medium text-sm" style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '4px 8px', borderRadius: '6px' }}>Manage Fields</button>
                  </div>
                  <p className="text-sm text-[var(--sf-text-secondary)]">
                    Add custom information that appears on all your invoices (VAT number, license, certifications, etc.)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--sf-blue-500)] text-white px-6 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
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

export default Invoicing
