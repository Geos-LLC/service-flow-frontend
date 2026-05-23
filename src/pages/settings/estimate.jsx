"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail, MessageSquare } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const Estimate = () => {
  const [enableEmail, setEnableEmail] = useState(true)
  const [enableSMS, setEnableSMS] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const [activeTab, setActiveTab] = useState("email")
  const navigate = useNavigate()

  return (
    <SettingsRailLayout title="Estimate email" section="Communications" subtitle="Sent when an estimate is delivered">

        {/* Content */}
        
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Settings Panel */}
              <div className="space-y-6">
                {/* Notification Type Tabs */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="flex space-x-1 bg-[var(--sf-bg-page)] rounded-lg p-1 mb-6">
                    <button
                      onClick={() => setActiveTab("email")}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "email"
                          ? "bg-white text-[var(--sf-blue-500)] shadow-sm"
                          : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      <span>Email</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("sms")}
                      className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                        activeTab === "sms"
                          ? "bg-white text-green-600 shadow-sm"
                          : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>SMS</span>
                    </button>
                  </div>

                  {/* Email Settings */}
                  {activeTab === "email" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Estimate Email</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent to the customer once their estimate is ready. This notification provides a direct link to book the estimate.
                          </p>
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
                        notificationType="Estimate"
                        messageType="email"
                        templateContent="<h2>Your Estimate is Ready!</h2><p>Hi John,</p><p>Your estimate is ready for review.</p><p><strong>Service:</strong> Home Cleaning</p><p><strong>Estimated Cost:</strong> $150.00</p><p><strong>Valid Until:</strong> March 22, 2025</p><p>Click the link below to view and book your estimate:</p><div style='text-align: center; margin: 20px 0;'><button style='background-color: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; border: none; font-weight: bold;'>View Estimate</button></div><p>Thank you for considering our services!</p><p>Best regards,<br />The Team at Just web Agency</p>"
                      />
                    </div>
                  )}

                  {/* SMS Settings */}
                  {activeTab === "sms" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Estimate SMS</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent to the customer once their estimate is ready. This notification provides a direct link to book the estimate.
                          </p>
                        </div>
                        <div className="flex items-center">
                          <button
                            onClick={() => setEnableSMS(!enableSMS)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              enableSMS ? "bg-green-500" : "bg-gray-200"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                enableSMS ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                          <span className={`ml-2 text-sm font-medium ${enableSMS ? "text-green-600" : "text-[var(--sf-text-muted)]"}`}>
                            {enableSMS ? "YES" : "NO"}
                          </span>
                        </div>
                      </div>
                      
                      {/* Test Button for SMS */}
                      <NotificationTestButton 
                        notificationType="Estimate"
                        messageType="sms"
                        templateContent="Hi John! Your estimate for Home Cleaning is ready. Cost: $150.00. View and book: [link] Valid until March 22, 2025. - Just web Agency"
                      />
                    </div>
                  )}
                </div>

                {/* Logo Settings (Email only) */}
                {activeTab === "email" && (
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
                )}

                {/* Template Editor */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-[var(--sf-text-primary)]">
                        {activeTab === "email" ? "Email template" : "SMS template"}
                      </h3>
                      <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium">
                        Edit {activeTab}
                      </button>
                    </div>
                    <p className="text-sm text-[var(--sf-text-secondary)]">Customize the content of this {activeTab}</p>
                  </div>
                </div>
              </div>

              {/* Preview Panel */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                <div className="space-y-4">
                  {activeTab === "email" ? (
                    <>
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
                            <span className="text-[var(--sf-text-primary)]">Your Estimate is Ready!</span>
                          </div>
                        </div>
                      </div>

                      {/* Email Content */}
                      <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                        <div className="bg-white rounded-lg p-8 shadow-sm">
                          <div className="space-y-6">
                            <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                              Your Estimate is Ready!
                            </h2>
                            
                            <div className="space-y-4">
                              <p className="text-[var(--sf-text-primary)]">Hi John Doe,</p>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                Great news! We've prepared your estimate for Standard Home Cleaning and it's ready for your review.
                              </p>
                              
                              <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                                <h3 className="font-medium text-[var(--sf-text-primary)] mb-3">Estimate Summary:</h3>
                                <div className="text-sm text-[var(--sf-text-primary)] space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Service:</span>
                                    <span className="text-[var(--sf-text-primary)]">Standard Home Cleaning</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Property Size:</span>
                                    <span className="text-[var(--sf-text-primary)]">3 bedrooms, 2 bathrooms</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Estimated Duration:</span>
                                    <span className="text-[var(--sf-text-primary)]">2-3 hours</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Location:</span>
                                    <span className="text-[var(--sf-text-primary)]">123 Main St, Brooklyn, NY</span>
                                  </div>
                                  <hr className="my-2" />
                                  <div className="flex justify-between font-medium text-lg">
                                    <span className="text-[var(--sf-text-primary)]">Total Estimate:</span>
                                    <span className="text-green-600">$120.00</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                <p className="text-sm text-[var(--sf-text-primary)] mb-3">Ready to book? Secure your preferred date and time!</p>
                                <button className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 mb-2">
                                  Book This Estimate
                                </button>
                                <p className="text-xs text-[var(--sf-text-secondary)]">Click to view full details and schedule your service</p>
                              </div>
                              
                              <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-4">
                                <h3 className="font-medium text-[var(--sf-text-primary)] mb-2">What's Included:</h3>
                                <ul className="text-sm text-[var(--sf-text-primary)] space-y-1">
                                  <li>• Deep cleaning of all rooms</li>
                                  <li>• Kitchen and bathroom sanitization</li>
                                  <li>• Dusting and vacuuming</li>
                                  <li>• All cleaning supplies provided</li>
                                </ul>
                              </div>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                This estimate is valid for 30 days. If you have any questions or need modifications, please don't hesitate to contact us.
                              </p>
                              
                              <p className="text-[var(--sf-text-primary)]">Thank you for considering Just web Agency!</p>
                              <p className="text-[var(--sf-text-primary)]">The Team at Just web Agency</p>
                            </div>
                          </div>
                          
                          <div className="mt-12 pt-6 border-t border-[var(--sf-border-light)] text-center">
                            <p className="text-xs text-[var(--sf-text-muted)]">© 2025 Just web Agency</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* SMS Preview */}
                      <div className="border-b border-[var(--sf-border-light)] pb-4">
                        <h3 className="font-medium text-[var(--sf-text-primary)]">SMS Preview</h3>
                        <p className="text-sm text-[var(--sf-text-secondary)]">Preview how the SMS will appear to customers</p>
                      </div>

                      <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96">
                        <div className="max-w-sm mx-auto">
                          {/* Phone mockup */}
                          <div className="bg-white rounded-2xl shadow-lg p-4 border-8 border-gray-800">
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-xs text-[var(--sf-text-secondary)]">
                                <span>9:41 AM</span>
                                <span>📶 📶 📶 🔋</span>
                              </div>
                              
                              <div className="space-y-3">
                                <div className="bg-blue-100 rounded-2xl p-3 max-w-xs">
                                  <p className="text-sm text-[var(--sf-text-primary)]">
                                    🎉 Hi John! Your estimate for Standard Home Cleaning is ready: $120.00. Valid for 30 days. Book now: [link] Questions? Reply here. - Just web Agency
                                  </p>
                                  <p className="text-xs text-[var(--sf-text-muted)] mt-1">Just web Agency • now</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              </div>
            </SettingsRailLayout>
  )
}

export default Estimate 