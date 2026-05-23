"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import NotificationTestButton from "../../components/NotificationTestButton"
import { Mail, MessageSquare, Check, X } from "lucide-react"
import { notificationTemplatesAPI, notificationSettingsAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import SettingsRailLayout from "../../components/settings-rail-layout"

const AppointmentConfirmation = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [enableEmail, setEnableEmail] = useState(true)
  const [enableSMS, setEnableSMS] = useState(true)
  const [showLogo, setShowLogo] = useState(false)
  const [activeTab, setActiveTab] = useState("email")
  const [emailTemplate, setEmailTemplate] = useState({
    subject: '',
    content: ''
  })
  const [smsTemplate, setSmsTemplate] = useState({
    content: ''
  })
  const navigate = useNavigate()
  const { user } = useAuth()

  // Load templates and settings on component mount
  useEffect(() => {
    if (user?.id) {
      loadTemplatesAndSettings();
    }
  }, [user?.id]);

  const loadTemplatesAndSettings = async () => {
    try {
      setLoading(true);
      
      // Load email template
      const emailTemplates = await notificationTemplatesAPI.getTemplates(
        user.id, 
        'email', 
        'appointment_confirmation'
      );
      
      if (emailTemplates.length > 0) {
        const template = emailTemplates[0];
        setEmailTemplate({
          subject: template.subject || '',
          content: template.content || ''
        });
        setEnableEmail(template.is_enabled === 1);
      }

      // Load SMS template
      const smsTemplates = await notificationTemplatesAPI.getTemplates(
        user.id, 
        'sms', 
        'appointment_confirmation'
      );
      
      if (smsTemplates.length > 0) {
        const template = smsTemplates[0];
        setSmsTemplate({
          content: template.content || ''
        });
        setEnableSMS(template.is_enabled === 1);
      }

      // Load notification settings - handle gracefully if API fails
      try {
        const settings = await notificationSettingsAPI.getSettings(user.id);
        if (settings && Array.isArray(settings)) {
          const appointmentSetting = settings.find(s => s.notification_type === 'appointment_confirmation');
          
          if (appointmentSetting) {
            setEnableEmail(appointmentSetting.email_enabled === 1);
            setEnableSMS(appointmentSetting.sms_enabled === 1);
          }
        }
      } catch (settingsError) {
        // If notification settings API fails, log but don't show error to user
        // The templates are more important, so we'll continue with template-based settings
        console.warn('Could not load notification settings (using template defaults):', settingsError);
        // Don't set error message - templates loaded successfully, settings are optional
      }

    } catch (error) {
      console.error('Error loading templates:', error);
      // Only show error if templates failed to load
      if (error.response?.status !== 500 || !error.config?.url?.includes('notification-settings')) {
        setMessage({ type: 'error', text: 'Failed to load notification templates' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      // Save email template
      await notificationTemplatesAPI.updateTemplate({
        userId: user.id,
        templateType: 'email',
        notificationName: 'appointment_confirmation',
        subject: emailTemplate.subject,
        content: emailTemplate.content,
        isEnabled: enableEmail
      });

      // Save SMS template
      await notificationTemplatesAPI.updateTemplate({
        userId: user.id,
        templateType: 'sms',
        notificationName: 'appointment_confirmation',
        subject: null,
        content: smsTemplate.content,
        isEnabled: enableSMS
      });

      // Save notification settings
      await notificationSettingsAPI.updateSetting({
        userId: user.id,
        notificationType: 'appointment_confirmation',
        emailEnabled: enableEmail,
        smsEnabled: enableSMS,
        pushEnabled: false
      });

      setMessage({ type: 'success', text: 'Notification settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving templates:', error);
      setMessage({ type: 'error', text: 'Failed to save notification settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsRailLayout title="Appointment confirmation" section="Communications" subtitle="Sent to the customer when a job is scheduled">

        {/* Message */}
        {message.text && (
          <div className={`px-6 py-3 ${message.type === 'success' ? 'bg-green-50 border-l-4 border-green-400' : 'bg-red-50 border-l-4 border-red-400'}`}>
            <div className="flex items-center">
              {message.type === 'success' ? (
                <Check className="w-5 h-5 text-green-400 mr-2" />
              ) : (
                <X className="w-5 h-5 text-red-400 mr-2" />
              )}
              <span className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {message.text}
              </span>
            </div>
          </div>
        )}

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
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Appointment Confirmation Email</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent automatically to the customer after a job is scheduled.
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
                        notificationType="Appointment Confirmation"
                        messageType="email"
                        templateContent="<h2>Appointment Confirmed!</h2><p>Hi John,</p><p>Great news! Your appointment has been confirmed.</p><p><strong>Service:</strong> Home Cleaning</p><p><strong>Date:</strong> March 15, 2025</p><p><strong>Time:</strong> 10:00 AM - 12:00 PM</p><p><strong>Location:</strong> 123 Main St, Brooklyn, NY</p><p>We look forward to serving you!</p><p>Best regards,<br />The Team at Just web Agency</p>"
                      />
                    </div>
                  )}

                  {/* SMS Settings */}
                  {activeTab === "sms" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-[var(--sf-text-primary)]">Enable Appointment Confirmation SMS</h3>
                          <p className="text-sm text-[var(--sf-text-secondary)] mt-1">
                            Sent automatically to the customer after a job is scheduled.
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
                        notificationType="Appointment Confirmation"
                        messageType="sms"
                        templateContent="Hi John! Your appointment for Home Cleaning on March 15, 2025 at 10:00 AM has been confirmed. We look forward to serving you! - Just web Agency"
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
                            <span className="text-[var(--sf-text-primary)]">Appointment Confirmed - Standard Home Cleaning</span>
                          </div>
                        </div>
                      </div>

                      {/* Email Content */}
                      <div className="bg-[var(--sf-bg-page)] rounded-lg p-6 min-h-96 overflow-auto">
                        <div className="bg-white rounded-lg p-8 shadow-sm">
                          <div className="space-y-6">
                            <div className="flex items-center space-x-2">
                              <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                                Appointment Confirmed!
                              </h2>
                              <span className="text-green-500">✓</span>
                            </div>
                            
                            <div className="space-y-4">
                              <p className="text-[var(--sf-text-primary)]">Hi John Doe,</p>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                Great news! Your appointment has been confirmed. We're looking forward to providing you with excellent service.
                              </p>
                              
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <h3 className="font-medium text-[var(--sf-text-primary)] mb-3">Appointment Details:</h3>
                                <div className="text-sm text-[var(--sf-text-primary)] space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Service:</span>
                                    <span className="text-[var(--sf-text-primary)]">Standard Home Cleaning</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Date & Time:</span>
                                    <span className="text-[var(--sf-text-primary)]">March 15, 2025 at 10:00 AM</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Duration:</span>
                                    <span className="text-[var(--sf-text-primary)]">2 hours</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Location:</span>
                                    <span className="text-[var(--sf-text-primary)]">123 Main St, Brooklyn, NY</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-[var(--sf-text-secondary)]">Team Member:</span>
                                    <span className="text-[var(--sf-text-primary)]">Sarah Johnson</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                                <h3 className="font-medium text-[var(--sf-text-primary)] mb-2">What to Expect:</h3>
                                <ul className="text-sm text-[var(--sf-text-primary)] space-y-1">
                                  <li>• Our team will arrive within the scheduled time window</li>
                                  <li>• Please ensure access to all areas to be cleaned</li>
                                  <li>• We'll provide all necessary cleaning supplies and equipment</li>
                                  <li>• Payment can be made after service completion</li>
                                </ul>
                              </div>
                              
                              <p className="text-[var(--sf-text-primary)]">
                                If you need to reschedule or have any questions, please contact us at least 24 hours in advance.
                              </p>
                              
                              <div className="flex space-x-4">
                                <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)]">
                                  Reschedule
                                </button>
                                <button className="bg-gray-200 text-[var(--sf-text-primary)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300">
                                  Cancel
                                </button>
                              </div>
                              
                              <p className="text-[var(--sf-text-primary)]">Thank you for choosing Just web Agency!</p>
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
                                <div className="bg-green-100 rounded-2xl p-3 max-w-xs">
                                  <p className="text-sm text-[var(--sf-text-primary)]">
                                    ✅ Confirmed! Hi John, your Standard Home Cleaning is scheduled for March 15, 2025 at 10:00 AM. Sarah will be your team member. We'll send a reminder 24hrs before. Questions? Reply here. - Just web Agency
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

            {/* Save Button */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="bg-[var(--sf-blue-500)] text-white px-6 py-2 rounded-md hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              </div>
            </SettingsRailLayout>
  )
}

export default AppointmentConfirmation 