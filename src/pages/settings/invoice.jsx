"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const Invoice = () => {
  const [enableEmail, setEnableEmail] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const navigate = useNavigate()

  return (
    <SettingsRailLayout title="Invoice email" section="Communications" subtitle="Sent when an invoice is delivered">

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
                        <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Invoice Email</h3>
                        <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                          Sent to the customer when you choose to send an unpaid job invoice.
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
                    notificationType="Invoice"
                    messageType="email"
                    templateContent="<h2>Invoice #INV-001</h2><p>Hi John,</p><p>Please find attached your invoice for the services provided.</p><p><strong>Service:</strong> Home Cleaning</p><p><strong>Date:</strong> March 15, 2025</p><p><strong>Amount:</strong> $150.00</p><p><strong>Due Date:</strong> March 22, 2025</p><p>Thank you for your business!</p><p>Best regards,<br />The Team at Just web Agency</p>"
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

                {/* Invoice Settings */}
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <div className="space-y-4">
                    <h3 className="font-medium text-[var(--sf-text-primary)]">Invoice Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="auto-reminder" className="rounded border-[var(--sf-border-light)]" />
                        <label htmlFor="auto-reminder" className="text-sm text-[var(--sf-text-primary)]">
                          Send automatic payment reminders
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="payment-link" className="rounded border-[var(--sf-border-light)]" defaultChecked />
                        <label htmlFor="payment-link" className="text-sm text-[var(--sf-text-primary)]">
                          Include online payment link
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" id="due-date" className="rounded border-[var(--sf-border-light)]" defaultChecked />
                        <label htmlFor="due-date" className="text-sm text-[var(--sf-text-primary)]">
                          Show payment due date
                        </label>
                      </div>
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
                        <span className="text-[var(--sf-text-primary)]">Invoice #INV-2025-001 - Standard Home Cleaning</span>
                      </div>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                    <div className="bg-white rounded-lg p-8 shadow-sm">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Invoice #INV-2025-001</h2>
                          <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                            UNPAID
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <p className="text-[var(--sf-text-primary)]">Hi John Doe,</p>
                          
                          <p className="text-[var(--sf-text-primary)]">
                            Thank you for choosing Just web Agency! Please find your invoice details below.
                          </p>
                          
                          <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                            <h3 className="font-medium text-[var(--sf-text-primary)] mb-3">Invoice Details:</h3>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Invoice #:</span>
                                <span className="text-[var(--sf-text-primary)]">INV-2025-001</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Service Date:</span>
                                <span className="text-[var(--sf-text-primary)]">March 8, 2025</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Due Date:</span>
                                <span className="text-orange-600 font-medium">March 22, 2025</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Location:</span>
                                <span className="text-[var(--sf-text-primary)]">123 Main St, Brooklyn, NY</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-4">
                            <h3 className="font-medium text-[var(--sf-text-primary)] mb-3">Service Summary:</h3>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Standard Home Cleaning</span>
                                <span className="text-[var(--sf-text-primary)]">$120.00</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Additional Deep Clean</span>
                                <span className="text-[var(--sf-text-primary)]">$30.00</span>
                              </div>
                              <hr className="my-2" />
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Subtotal:</span>
                                <span className="text-[var(--sf-text-primary)]">$150.00</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[var(--sf-text-secondary)]">Tax (8.25%):</span>
                                <span className="text-[var(--sf-text-primary)]">$12.38</span>
                              </div>
                              <div className="flex justify-between font-medium text-lg border-t pt-2">
                                <span className="text-[var(--sf-text-primary)]">Total Due:</span>
                                <span className="text-[var(--sf-text-primary)]">$162.38</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                            <p className="text-sm text-[var(--sf-text-primary)] mb-3">Pay securely online with credit card or bank transfer</p>
                            <button className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700">
                              Pay Invoice Online
                            </button>
                          </div>
                          
                          <p className="text-[var(--sf-text-primary)] text-sm">
                            Payment is due within 14 days of the invoice date. If you have any questions about this invoice, please contact us.
                          </p>
                          
                          <p className="text-[var(--sf-text-primary)]">Thank you for your business!</p>
                          <p className="text-[var(--sf-text-primary)]">The Team at Just web Agency</p>
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

export default Invoice 