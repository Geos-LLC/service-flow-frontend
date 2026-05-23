"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { notificationEmailAPI } from "../../services/api"
import { ChevronRight, Mail, Shield, Send, Check, X, Loader2 } from "lucide-react"
import SettingsPageLayout from "../../components/settings-page-layout"

function EmailDeliverySettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const [configured, setConfigured] = useState(false)
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')

  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState(null)
  const [testError, setTestError] = useState('')
  const [saveMsg, setSaveMsg] = useState(null)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await notificationEmailAPI.getSettings()
      setConfigured(data.configured || false)
      if (data.settings) {
        setFromEmail(data.settings.fromEmail || '')
        setFromName(data.settings.fromName || '')
        setReplyToEmail(data.settings.replyToEmail || '')
        setTestStatus(data.settings.lastTestStatus || null)
      }
    } catch (e) { /* not configured */ }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null)
    try {
      await notificationEmailAPI.saveSettings({ fromEmail, fromName, replyToEmail })
      setSaveMsg({ type: 'success', text: 'Saved' })
      await loadSettings()
    } catch (e) {
      setSaveMsg({ type: 'error', text: e.response?.data?.error || 'Failed to save' })
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!testEmail?.trim()) return
    setTesting(true); setTestStatus(null); setTestError('')
    try {
      await notificationEmailAPI.sendTest(testEmail.trim())
      setTestStatus('success')
    } catch (e) {
      setTestStatus('failed')
      setTestError(e.response?.data?.error || 'Test failed')
    } finally { setTesting(false) }
  }

  if (loading) return (
    <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6 flex items-center justify-center">
      <Loader2 size={20} className="animate-spin text-[var(--sf-text-muted)]" />
    </div>
  )

  const statusBadge = !configured
    ? { text: 'Using default', color: 'bg-yellow-100 text-yellow-700' }
    : testStatus === 'success'
    ? { text: 'Connected', color: 'bg-green-100 text-green-700' }
    : { text: 'Configured', color: 'bg-blue-100 text-blue-700' }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Email Delivery Settings</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.color}`}>{statusBadge.text}</span>
        </div>
        <p className="text-[var(--sf-text-secondary)] mt-1">
          Configure SendGrid to send notification emails. This controls the sender address for all customer and team emails.
        </p>
      </div>

      {/* Sender Configuration */}
      <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="text-sm font-medium text-[var(--sf-text-primary)] block mb-1">From Email</label>
            <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)}
              placeholder="info@yourcompany.com"
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--sf-text-primary)] block mb-1">From Name</label>
            <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
              placeholder="Your Company Name"
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-[var(--sf-text-primary)] block mb-1">Reply-to Email <span className="text-[var(--sf-text-muted)] font-normal">(optional)</span></label>
            <input type="email" value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)}
              placeholder="support@yourcompany.com"
              className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveMsg && <span className={`text-sm ${saveMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{saveMsg.text}</span>}
        </div>
      </div>

      {/* Test Email */}
      <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
        <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3">Test Email Delivery</h3>
        <div className="flex gap-2 max-w-lg">
          <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
            placeholder="Enter test email address"
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            className="flex-1 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]" />
          <button onClick={handleTest} disabled={testing || !testEmail?.trim()}
            className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50 flex items-center gap-2">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {testing ? 'Sending...' : 'Send Test'}
          </button>
        </div>
        {testStatus === 'success' && <p className="mt-2 text-sm text-green-600 flex items-center gap-1"><Check size={14} /> Test email sent successfully</p>}
        {testStatus === 'failed' && <p className="mt-2 text-sm text-red-600 flex items-center gap-1"><X size={14} /> {testError}</p>}
      </div>
    </div>
  )
}

const ClientTeamNotifications = () => {
  const navigate = useNavigate()

  const customerNotifications = [
    {
      title: "Appointment Confirmation",
      description: "Sent automatically to the customer after a job is scheduled.",
      types: ["SMS", "Email"],
    },
    {
      title: "Appointment Rescheduled",
      description:
        "Sent if a customer reschedules their job. Can also be sent when a job is rescheduled from the Serviceflow admin.",
      types: ["SMS", "Email"],
    },
    {
      title: "Appointment Reminder",
      description:
        "Sent automatically to the customer to remind them of their upcoming appointment. You can edit how far in advance the notification is sent.",
      types: ["SMS", "Email"],
    },
    {
      title: "Job Follow-up",
      description: "Sent to customers after a job is marked as complete, prompting them to rate their service.",
      types: ["SMS", "Email"],
    },
    {
      title: "Appointment Cancelled",
      description:
        "Sent if a customer cancels their job. Can also be sent when a job is cancelled from the Serviceflow admin.",
      types: ["SMS", "Email"],
    },
    {
      title: "Enroute",
      description: "Notify your customer with an ETA when you or an employee is on the way.",
      types: ["SMS"],
    },
    {
      title: "Payment Receipt",
      description:
        "Sent to customer when they pay an invoice online. Can also be sent when a job is paid, and you select the send receipt option.",
      types: ["Email"],
    },
  ]

  const teamNotifications = [
    {
      title: "Assigned Job Cancelled",
      description: "Sent to a job's assigned provider(s) if the job has been cancelled.",
      types: ["SMS"],
    },
    {
      title: "Assigned Job Rescheduled",
      description: "Sent to a job's assigned provider(s) if the job has been rescheduled.",
      types: ["SMS"],
    },
    {
      title: "Team Member Invite",
      description: "Sent to newly added team members with account activation instructions.",
      types: ["SMS", "Email"],
    },
    {
      title: "Recurring Assignment",
      description: "Sent to service providers when they are assigned to a recurring booking.",
      types: ["SMS", "Email"],
    },
  ]

  const getNotificationRoute = (title) => {
    const routes = {
      // Customer Notifications
      "Appointment Confirmation": "/settings/client-team-notifications/appointment-confirmation",
      "Appointment Rescheduled": "/settings/client-team-notifications/appointment-rescheduled",
      "Appointment Reminder": "/settings/client-team-notifications/appointment-reminder",
      "Job Follow-up": "/settings/client-team-notifications/job-follow-up",
      "Appointment Cancelled": "/settings/client-team-notifications/appointment-cancelled",
      "Enroute": "/settings/client-team-notifications/enroute",
      "Payment Receipt": "/settings/client-team-notifications/payment-receipt",
      // Team Notifications
      "Assigned Job Cancelled": "/settings/client-team-notifications/assigned-job-cancelled",
      "Assigned Job Rescheduled": "/settings/client-team-notifications/assigned-job-rescheduled",
      "Team Member Invite": "/settings/client-team-notifications/team-member-invite",
      "Recurring Assignment": "/settings/client-team-notifications/recurring-assignment"
    }
    return routes[title] || null
  }

  const NotificationRow = ({ notification, isTeam = false }) => {
    const route = getNotificationRoute(notification.title)
    
    const content = (
      <div className="flex items-center justify-between py-4 border-b border-[var(--sf-border-light)] last:border-b-0">
        <div className="flex-1">
          <h4 className="font-medium text-[var(--sf-text-primary)]">{notification.title}</h4>
          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">{notification.description}</p>
        </div>
        <div className="flex items-center space-x-4 ml-4">
          {notification.types.map((type) => (
            <div key={type} className="flex items-center space-x-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  type === "SMS" ? "bg-green-500" : type === "Email" ? "bg-[var(--sf-blue-500)]" : "bg-purple-500"
                }`}
              ></span>
              <span className="text-xs text-[var(--sf-text-secondary)]">{type}</span>
            </div>
          ))}
          <ChevronRight className="w-4 h-4 text-[var(--sf-text-muted)]" />
        </div>
      </div>
    )

    if (route) {
      return (
        <button
          onClick={() => navigate(route)}
          className="w-full text-left hover:bg-[var(--sf-bg-page)] transition-colors"
        >
          {content}
        </button>
      )
    }

    return content
  }

  return (
    <SettingsPageLayout
      title="Client & team notifications"
      subtitle="Edit the emails and text messages sent to clients and team members"
      maxWidth={1100}
    >
      <div className="space-y-8">
            {/* Customer Notifications */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-2">Customer Notifications</h2>
                <p className="text-[var(--sf-text-secondary)]">
                  These notifications are sent out to the customer. Click on the notification template to edit the
                  content.
                </p>
              </div>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] divide-y divide-gray-100 px-6">
                {customerNotifications.map((notification, index) => (
                  <NotificationRow key={index} notification={notification} />
                ))}
              </div>
            </div>

            {/* Team Notifications */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-2">Team Notifications</h2>
                <p className="text-[var(--sf-text-secondary)]">
                  These notifications are automatically sent out to team members. Click on the notification template to
                  edit the content.
                </p>
              </div>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] divide-y divide-gray-100 px-6">
                {teamNotifications.map((notification, index) => (
                  <NotificationRow key={index} notification={notification} isTeam />
                ))}
              </div>
            </div>

            {/* Notification Testing */}
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-2">Notification Testing</h2>
                <p className="text-[var(--sf-text-secondary)]">
                  Test your email and SMS notifications to ensure they're working correctly. Send test messages to verify your notification setup.
                </p>
              </div>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Test Notifications</h3>
                    <p className="text-[var(--sf-text-secondary)] mt-1">
                      Send test emails and SMS messages to verify your notification configuration is working properly.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/settings/client-team-notifications/notification-testing")}
                    className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] flex items-center space-x-2"
                  >
                    <span>Test Notifications</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Email Delivery Settings */}
            <EmailDeliverySettings />
      </div>
    </SettingsPageLayout>
  )
}

export default ClientTeamNotifications
