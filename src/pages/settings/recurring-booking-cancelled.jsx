"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail, MessageSquare } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const RecurringBookingCancelled = () => {
  const [enableEmail, setEnableEmail] = useState(true)
  const [enableSMS, setEnableSMS] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const [activeTab, setActiveTab] = useState("email")
  const navigate = useNavigate()

  return (
    <SettingsRailLayout title="Recurring booking cancelled" section="Communications" subtitle="Sent when a recurring series is cancelled">

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
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Recurring Booking Cancelled Email</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent when a customer's recurring booking is cancelled.
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
                        notificationType="Recurring Booking Cancelled"
                        messageType="email"
                        templateContent="<h2>Recurring Booking Cancelled</h2><p>Hi John,</p><p>Your recurring booking has been cancelled.</p><p><strong>Service:</strong> Standard Home Cleaning</p><p><strong>Frequency:</strong> Every 2 weeks</p><p><strong>Last Appointment:</strong> March 15, 2025</p><p>All future appointments have been removed from your schedule.</p><p>If you'd like to reschedule or set up a new recurring service, please contact us.</p><p>Best regards,<br />The Team at Just web Agency</p>"
                      />
                    </div>
                  )}

                  {/* SMS Settings */}
                  {activeTab === "sms" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Recurring Booking Cancelled SMS</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent when a customer's recurring booking is cancelled.
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
                        notificationType="Recurring Booking Cancelled"
                        messageType="sms"
                        templateContent="Hi John! Your recurring booking for Standard Home Cleaning (every 2 weeks) has been cancelled. All future appointments are removed. Contact us to reschedule or set up a new recurring service. - Just web Agency"
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
                            <span className="text-[var(--sf-text-primary)]">Recurring Booking Cancelled</span>
                          </div>
                        </div>
                      </div>

                      {/* Email Content */}
                      <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                        <div className="bg-white rounded-lg p-8 shadow-sm">
                          <div className="space-y-6">
                            <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                              Your Recurring Booking Has Been Cancelled
                            </h2>
                            
                            <div className="space-y-4">
                              <p className="text-[var(--sf-text-primary)]">Hi John Doe,</p>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                We want to let you know that your recurring booking for <strong>Standard Home Cleaning</strong> has been cancelled.
                              </p>
                              
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <h3 className="font-medium text-[var(--sf-text-primary)] mb-2">Cancelled Recurring Service:</h3>
                                <div className="text-sm text-[var(--sf-text-primary)] space-y-1">
                                  <p><strong>Service:</strong> Standard Home Cleaning</p>
                                  <p><strong>Frequency:</strong> Every 2 weeks</p>
                                  <p><strong>Next Scheduled:</strong> March 15, 2025</p>
                                  <p><strong>Location:</strong> 123 Main St, Brooklyn, NY</p>
                                  <p><strong>Total Remaining:</strong> 6 appointments</p>
                                </div>
                              </div>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                All future appointments in this recurring series have been cancelled. If this was cancelled in error or you'd like to set up a new recurring booking, please contact us.
                              </p>
                              
                              <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4 text-center">
                                <button className="bg-[var(--sf-blue-500)] text-white px-6 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                                  Set Up New Recurring Service
                                </button>
                              </div>
                              
                              <p className="text-[var(--sf-text-primary)]">Thank you for your understanding.</p>
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
                                <div className="bg-orange-100 rounded-2xl p-3 max-w-xs">
                                  <p className="text-sm text-[var(--sf-text-primary)]">
                                    Hi John! Your recurring booking for Standard Home Cleaning (every 2 weeks) has been cancelled. All future appointments are removed. Contact us to reschedule or set up a new recurring service. - Just web Agency
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

export default RecurringBookingCancelled 