"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const TeamMemberInvite = () => {
  const [enableEmail, setEnableEmail] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const navigate = useNavigate()

  return (
    <SettingsRailLayout title="Team member invite" section="Communications" subtitle="Email a new team member receives on invite">

        {/* Content */}
        
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Settings Panel */}
              <div className="space-y-6">
                {/* Enable Email Toggle */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Mail className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      <div>
                        <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Team Member Invite Email</h3>
                        <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                          Sent to newly added team members with account activation instructions.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <button
                        onClick={() => setEnableEmail(!enableEmail)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          enableEmail ? "bg-green-500" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            enableEmail ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span className={`ml-2 text-sm font-medium ${enableEmail ? "text-green-600" : "text-[var(--sf-text-muted)]"}`}>
                        {enableEmail ? "YES" : "NO"}
                      </span>
                    </div>
                  </div>
                  
                  {/* Test Button for Email */}
                  <NotificationTestButton 
                    notificationType="Team Member Invite"
                    messageType="email"
                    templateContent="<h2>Welcome to the Team!</h2><p>Hi Sarah,</p><p>You've been invited to join our team at Just web Agency!</p><p><strong>Your Role:</strong> Service Provider</p><p><strong>Account Status:</strong> Pending Activation</p><p>To activate your account, please click the link below:</p><div style='text-align: center; margin: 20px 0;'><button style='background-color: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; border: none; font-weight: bold;'>Activate Account</button></div><p>Once activated, you'll be able to view and accept job assignments.</p><p>Welcome aboard!</p><p>Best regards,<br />The Team at Just web Agency</p>"
                  />
                </div>

                {/* Logo Settings */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-[var(--sf-text-primary)]">Show logo</h3>
                        <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                          You can add or change your logo in <span className="text-[var(--sf-blue-500)]">Settings > Branding</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setShowLogo(!showLogo)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          showLogo ? "bg-[var(--sf-blue-500)]" : "bg-gray-200"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            showLogo ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Email Template */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-[var(--sf-text-primary)]">Email template</h3>
                      <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium">
                        Edit email
                      </button>
                    </div>
                    <p className="text-sm text-[var(--sf-text-secondary)]">Customize the content of this email</p>
                  </div>
                </div>
              </div>

              {/* Email Preview */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <div className="space-y-4">
                  {/* Email Header */}
                  <div className="border-b border-[var(--sf-border-light)] pb-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--sf-text-secondary)]">To:</span>
                        <span className="text-[var(--sf-text-primary)]">sarah.johnson@example.com</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--sf-text-secondary)]">From:</span>
                        <span className="text-[var(--sf-text-primary)]">Just web Agency</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--sf-text-secondary)]">Subject:</span>
                        <span className="text-[var(--sf-text-primary)]">Welcome to the Just web Agency Team!</span>
                      </div>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                    <div className="bg-white rounded-lg p-8 shadow-sm">
                      <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                          Welcome to Just web Agency!
                        </h2>
                        
                        <div className="space-y-4">
                          <p className="text-[var(--sf-text-primary)]">Hi Sarah Johnson,</p>
                          
                          <p className="text-[var(--sf-text-primary)]">
                            Welcome to the team! You've been invited to join Just web Agency as a team member.
                          </p>
                          
                          <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                            <h3 className="font-medium text-[var(--sf-text-primary)] mb-3">Your Account Details:</h3>
                            <div className="text-sm text-[var(--sf-text-primary)] space-y-1">
                              <p><strong>Email:</strong> sarah.johnson@example.com</p>
                              <p><strong>Role:</strong> Field Service Provider</p>
                              <p><strong>Team:</strong> Cleaning Team A</p>
                              <p><strong>Start Date:</strong> March 15, 2025</p>
                            </div>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                            <p className="text-sm text-[var(--sf-text-primary)] mb-3">Click the button below to activate your account and set up your password</p>
                            <button className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 mb-2">
                              Activate Account
                            </button>
                            <p className="text-xs text-[var(--sf-text-secondary)]">This link expires in 7 days</p>
                          </div>
                          
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <h3 className="font-medium text-[var(--sf-text-primary)] mb-2">Next Steps:</h3>
                            <ul className="text-sm text-[var(--sf-text-primary)] space-y-1">
                              <li>1. Activate your account using the link above</li>
                              <li>2. Download the Serviceflow mobile app</li>
                              <li>3. Complete your profile and training modules</li>
                              <li>4. Review your upcoming job assignments</li>
                            </ul>
                          </div>
                          
                          <p className="text-[var(--sf-text-primary)]">
                            If you have any questions or need assistance, please don't hesitate to contact your team leader or the admin team.
                          </p>
                          
                          <p className="text-[var(--sf-text-primary)]">We're excited to have you on board!</p>
                          <p className="text-[var(--sf-text-primary)]">The Just web Agency Team</p>
                        </div>
                      </div>
                      
                      <div className="mt-12 pt-6 border-t border-[var(--sf-border-light)] text-center">
                        <p className="text-xs text-[var(--sf-text-muted)]">© 2025 Just web Agency</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </SettingsRailLayout>
  )
}

export default TeamMemberInvite 