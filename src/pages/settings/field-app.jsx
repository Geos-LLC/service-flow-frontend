"use client"

import { useState, useEffect } from "react"
import LoadingButton from "../../components/loading-button"
import Notification from "../../components/notification"
import { Smartphone, QrCode, Palette, Bell, Users, Copy, Check } from "lucide-react"
import SettingsPageLayout from "../../components/settings-page-layout"

const FieldApp = () => {
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [copied, setCopied] = useState(false)
  const [settings, setSettings] = useState({
    appUrl: `${window.location.origin}/team-member/login`,
    promptInstall: true,
    installedTeammates: 0,
    notificationsEnabled: 0,
    branding: {
      appName: "Serviceflow Field App",
      primaryColor: "#2563EB",
      secondaryColor: "#10B981",
      logoUrl: null,
    },
  })


  useEffect(() => {
    const savedSettings = localStorage.getItem("service-flow_field_app")
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  const saveSettings = async (newSettings) => {
    setLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      localStorage.setItem("service-flow_field_app", JSON.stringify(newSettings))
      setSettings(newSettings)
      setNotification({ type: "success", message: "Field app settings saved successfully!" })
    } catch (error) {
      setNotification({ type: "error", message: "Failed to save settings. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePromptInstall = async () => {
    const newSettings = { ...settings, promptInstall: !settings.promptInstall }
    await saveSettings(newSettings)
  }

  const handleBrandingChange = (field, value) => {
    const newSettings = {
      ...settings,
      branding: { ...settings.branding, [field]: value },
    }
    setSettings(newSettings)
  }

  const handleSaveBranding = () => {
    if (!settings.branding.appName.trim()) {
      setNotification({ type: "error", message: "App name is required." })
      return
    }
    saveSettings(settings)
  }

  const copyAppUrl = async () => {
    try {
      await navigator.clipboard.writeText(settings.appUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      setNotification({ type: "success", message: "App URL copied to clipboard!" })
    } catch (error) {
      setNotification({ type: "error", message: "Failed to copy URL." })
    }
  }

  const generateQRCode = () => {
    // In a real app, this would generate an actual QR code
    setNotification({ type: "success", message: "QR code generated! Share with your team." })
  }

  const inviteTeammates = () => {
    // Simulate sending invites
    setNotification({ type: "success", message: "Invitations sent to team members!" })
    const newSettings = {
      ...settings,
      installedTeammates: settings.installedTeammates + Math.floor(Math.random() * 3) + 1,
    }
    saveSettings(newSettings)
  }

  return (
    <SettingsPageLayout
      title="Field app"
      subtitle="Customize the mobile web app for service providers"
      maxWidth={1200}
      actions={
        <div className="flex items-center space-x-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-[var(--sf-text-secondary)]">Installed by</span>
            <span className="font-semibold text-[var(--sf-blue-500)]">{settings.installedTeammates} teammates</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[var(--sf-text-secondary)]">Notifications enabled by</span>
            <span className="font-semibold text-[var(--sf-blue-500)]">{settings.notificationsEnabled} teammates</span>
          </div>
        </div>
      }
    >
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={() => setNotification(null)} />
      )}
      <div className="space-y-6">
            {/* App Access Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Smartphone className="w-6 h-6 text-[var(--sf-blue-500)]" />
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Your field app</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* App URL */}
                <div className="lg:col-span-2">
                  <div className="flex items-center space-x-2 mb-4">
                    <input
                      type="text"
                      value={settings.appUrl}
                      readOnly
                      className="flex-1 px-3 py-2 bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-md text-sm"
                    />
                    <button
                      onClick={copyAppUrl}
                      className="flex items-center space-x-2 px-3 py-2 bg-[var(--sf-bg-page)] hover:bg-gray-200 rounded-md"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <p className="text-[var(--sf-text-secondary)] mb-6">
                    When your providers login to Serviceflow on their phone, they'll be directed to your mobile field app.
                  </p>

                  {/* Install Prompt Toggle */}
                  <div className="flex items-center justify-between p-4 bg-[var(--sf-blue-50)] rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Bell className="w-5 h-5 text-[var(--sf-blue-500)]" />
                      <div>
                        <h3 className="font-medium text-blue-900">Prompt teammates to install the mobile web app</h3>
                        <p className="text-sm text-[var(--sf-blue-500)]">
                          Show installation prompts to help teammates add the app to their home screen.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleTogglePromptInstall}
                      disabled={loading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.promptInstall ? "bg-[var(--sf-blue-500)]" : "bg-gray-200"
                      } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.promptInstall ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 bg-white border-2 border-[var(--sf-border-light)] rounded-lg flex items-center justify-center mb-4">
                    {/* QR Code Placeholder */}
                    <div className="grid grid-cols-8 gap-1">
                      {Array.from({ length: 64 }).map((_, i) => (
                        <div key={i} className={`w-1 h-1 ${Math.random() > 0.5 ? "bg-black" : "bg-white"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--sf-text-secondary)] text-center mb-3">Scan code to view the mobile field app</p>
                  <button
                    onClick={generateQRCode}
                    className="flex items-center space-x-2 px-3 py-2 text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]"
                  >
                    <QrCode className="w-4 h-4" />
                    <span className="text-sm">Generate New QR</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Team App Branding */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Upgrade for Team App Branding</h2>
                  <p className="text-[var(--sf-text-secondary)]">Your brand, front and center—right in the palm of your team's hands.</p>
                </div>
                <button className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]">
                  Upgrade to Professional
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Branding Options */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Palette className="w-4 h-4 text-[var(--sf-blue-500)]" />
                        <h3 className="font-medium text-blue-900">Your Name, Your Icon</h3>
                      </div>
                      <p className="text-sm text-[var(--sf-blue-500)]">
                        Make your brand the first thing your team sees when they open the app.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Bell className="w-4 h-4 text-[var(--sf-blue-500)]" />
                        <h3 className="font-medium text-blue-900">Iconic Notifications</h3>
                      </div>
                      <p className="text-sm text-[var(--sf-blue-500)]">
                        Your custom icon isn't just for show; it appears in all push notifications.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Palette className="w-4 h-4 text-[var(--sf-blue-500)]" />
                        <h3 className="font-medium text-blue-900">Colors & Theme</h3>
                      </div>
                      <p className="text-sm text-[var(--sf-blue-500)]">
                        From buttons to backgrounds, deck out the app in your signature colors.
                      </p>
                    </div>
                  </div>

                  {/* Branding Form */}
                  <div className="space-y-4 p-4 bg-[var(--sf-bg-page)] rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">App Name</label>
                      <input
                        type="text"
                        value={settings.branding.appName}
                        onChange={(e) => handleBrandingChange("appName", e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                        placeholder="Your Business Name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Primary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={settings.branding.primaryColor}
                            onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                            className="w-12 h-10 border border-[var(--sf-border-light)] rounded"
                          />
                          <input
                            type="text"
                            value={settings.branding.primaryColor}
                            onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                            className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-md text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Secondary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={settings.branding.secondaryColor}
                            onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                            className="w-12 h-10 border border-[var(--sf-border-light)] rounded"
                          />
                          <input
                            type="text"
                            value={settings.branding.secondaryColor}
                            onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                            className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-md text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <LoadingButton
                      onClick={handleSaveBranding}
                      loading={loading}
                      className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                    >
                      Save Branding
                    </LoadingButton>
                  </div>

                  <div className="flex space-x-4">
                    <button
                      onClick={inviteTeammates}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      <Users className="w-4 h-4" />
                      <span>Invite Team</span>
                    </button>
                    <button className="px-4 py-2 text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] border border-blue-600 rounded-lg">
                      Learn more about white labeling the field app
                    </button>
                  </div>
                </div>

                {/* Phone Preview */}
                <div className="flex justify-center">
                  <div className="relative">
                    {/* Phone Frame */}
                    <div className="w-64 h-96 bg-black rounded-3xl p-2">
                      <div className="w-full h-full bg-white rounded-2xl overflow-hidden relative">
                        {/* Status Bar */}
                        <div className="flex justify-between items-center px-4 py-2 text-xs">
                          <span>9:41</span>
                          <div className="flex space-x-1">
                            <div className="w-4 h-2 bg-black rounded-sm"></div>
                            <div className="w-4 h-2 bg-black rounded-sm"></div>
                            <div className="w-4 h-2 bg-black rounded-sm"></div>
                          </div>
                        </div>

                        {/* App Header */}
                        <div
                          className="px-4 py-3 text-white"
                          style={{ backgroundColor: settings.branding.primaryColor }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                                <span className="text-xs font-bold" style={{ color: settings.branding.primaryColor }}>
                                  {settings.branding.appName.charAt(0)}
                                </span>
                              </div>
                              <span className="font-semibold">{settings.branding.appName}</span>
                            </div>
                            <div className="relative">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: settings.branding.secondaryColor }}
                              >
                                2
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* App Content */}
                        <div className="p-4">
                          <div className="bg-green-100 rounded-lg p-4 mb-4">
                            <h3 className="font-semibold text-green-800 mb-2">Home Cleaning Job Available</h3>
                            <p className="text-green-700 text-sm mb-1">from {settings.branding.appName}</p>
                            <p className="text-green-600 text-sm">In Silver Spring, MD</p>
                            <p className="text-green-600 text-sm">Tue, May 28 at 10:30 AM</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats & Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6 text-center">
                <div className="text-2xl font-bold text-[var(--sf-blue-500)] mb-2">{settings.installedTeammates}</div>
                <div className="text-[var(--sf-text-secondary)]">Team Members with App</div>
              </div>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6 text-center">
                <div className="text-2xl font-bold text-green-600 mb-2">{settings.notificationsEnabled}</div>
                <div className="text-[var(--sf-text-secondary)]">Notifications Enabled</div>
              </div>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6 text-center">
                <div className="text-2xl font-bold text-purple-600 mb-2">{settings.promptInstall ? "ON" : "OFF"}</div>
                <div className="text-[var(--sf-text-secondary)]">Install Prompts</div>
              </div>
            </div>
          </div>
    </SettingsPageLayout>
  )
}

export default FieldApp
