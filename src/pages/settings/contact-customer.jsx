"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const ContactCustomer = () => {
  const [enableEmail, setEnableEmail] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const navigate = useNavigate()

  return (
    <SettingsRailLayout title="Contact customer" section="Communications" subtitle="Generic customer outreach template">

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
                        <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Contact Customer Email</h3>
                        <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                          Sent to the customer when you contact them from the jobs or customers page. You can edit this email before you send it.
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
                    notificationType="Contact Customer"
                    messageType="email"
                    templateContent="<h2>Message from Just web Agency</h2><p>Hi John,</p><p>We hope this message finds you well.</p><p>We wanted to reach out regarding your recent service with us.</p><p>If you have any questions or concerns, please don't hesitate to contact us.</p><p>Thank you for choosing our services!</p><p>Best regards,<br />The Team at Just web Agency</p>"
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
                    <p className="text-sm text-[var(--sf-text-secondary)]">
                      Customize the default template. You can edit the content before sending each email.
                    </p>
                  </div>
                </div>

                {/* Template Variables */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="space-y-4">
                    <h3 className="font-medium text-[var(--sf-text-primary)]">Available Variables</h3>
                    <div className="text-sm space-y-2">
                      <div className="bg-[var(--sf-bg-page)] rounded p-2 font-mono text-xs">
                        <div>{'{{customer_name}} - Customer\'s name'}</div>
                        <div>{'{{service_name}} - Service type'}</div>
                        <div>{'{{appointment_date}} - Scheduled date'}</div>
                        <div>{'{{company_name}} - Your company name'}</div>
                      </div>
                      <p className="text-[var(--sf-text-secondary)] text-xs">
                        These variables will be automatically replaced with actual values when the email is sent.
                      </p>
                    </div>
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
                        <span className="text-[var(--sf-text-primary)]">johnsmith@example.com</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--sf-text-secondary)]">From:</span>
                        <span className="text-[var(--sf-text-primary)]">Just web Agency</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--sf-text-secondary)]">Subject:</span>
                        <span className="text-[var(--sf-text-primary)]">[Editable] Regarding Your Service</span>
                      </div>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                    <div className="bg-white rounded-lg p-8 shadow-sm">
                      <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                          [Editable Subject Line]
                        </h2>
                        
                        <div className="space-y-4">
                          <p className="text-[var(--sf-text-primary)]">Hi John Doe,</p>
                          
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-sm text-yellow-800 font-medium mb-2">📝 Editable Template Content:</p>
                            <div className="text-[var(--sf-text-primary)] space-y-2">
                              <p>
                                I wanted to reach out regarding your upcoming Standard Home Cleaning service scheduled for March 15, 2025.
                              </p>
                              
                              <p>
                                [This is where you can add your custom message. The content will be editable before sending.]
                              </p>
                              
                              <p>
                                If you have any questions or need to make any changes, please don't hesitate to contact me.
                              </p>
                            </div>
                          </div>
                          
                          <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                            <h3 className="font-medium text-[var(--sf-text-primary)] mb-2">Service Details:</h3>
                            <div className="text-sm text-[var(--sf-text-primary)] space-y-1">
                              <p><strong>Service:</strong> Standard Home Cleaning</p>
                              <p><strong>Scheduled Date:</strong> March 15, 2025 at 10:00 AM</p>
                              <p><strong>Location:</strong> 123 Main St, Brooklyn, NY</p>
                            </div>
                          </div>
                          
                          <p className="text-[var(--sf-text-primary)]">
                            Thank you for choosing Just web Agency!
                          </p>
                          
                          <p className="text-[var(--sf-text-primary)]">
                            Best regards,<br />
                            [Your Name]<br />
                            Just web Agency
                          </p>
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

export default ContactCustomer 