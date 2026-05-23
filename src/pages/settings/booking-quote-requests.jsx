"use client"

import { useState, useEffect } from "react"
import LoadingButton from "../../components/loading-button"
import Notification from "../../components/notification"
import { Calendar, Clock, MapPin, FileText } from "lucide-react"
import SettingsPageLayout from "../../components/settings-page-layout"

const BookingQuoteRequests = () => {
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)
  const [settings, setSettings] = useState({
    // Booking Requests
    bookingRequestType: "dates-times", // 'dates-times' or 'dates-only'
    minDateOptions: 2,
    minTimeSlots: 4,
    bookingSummaryTitle: "Service Request",
    customExplainerMessage:
      "This is a service request. We'll review your selected times and confirm availability as soon as possible.",

    // Quote Requests
    requireServiceAddress: true,
    requirePreferredDates: true,
    quoteRequestSummaryTitle: "Quote Request",
    quoteExplainerMessage:
      "An instant price quote is not available for this service. Please request a quote, and we will send you a detailed estimate that you can book.",
  })


  useEffect(() => {
    const savedSettings = localStorage.getItem("service-flow_booking_quote_requests")
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  const saveSettings = async (newSettings) => {
    setLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      localStorage.setItem("service-flow_booking_quote_requests", JSON.stringify(newSettings))
      setSettings(newSettings)
      setNotification({ type: "success", message: "Booking & quote settings saved successfully!" })
    } catch (error) {
      setNotification({ type: "error", message: "Failed to save settings. Please try again." })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field, value) => {
    const newSettings = { ...settings, [field]: value }
    setSettings(newSettings)
  }

  const handleSave = () => {
    // Validation
    if (settings.minDateOptions < 1 || settings.minDateOptions > 10) {
      setNotification({ type: "error", message: "Date options must be between 1 and 10." })
      return
    }
    if (settings.minTimeSlots < 1 || settings.minTimeSlots > 20) {
      setNotification({ type: "error", message: "Time slots must be between 1 and 20." })
      return
    }
    if (!settings.bookingSummaryTitle.trim()) {
      setNotification({ type: "error", message: "Booking summary title is required." })
      return
    }
    if (!settings.quoteRequestSummaryTitle.trim()) {
      setNotification({ type: "error", message: "Quote request summary title is required." })
      return
    }

    saveSettings(settings)
  }

  return (
    <SettingsPageLayout
      title="Booking & quote requests"
      subtitle="Configure how customers submit booking and quote requests"
      actions={
        <LoadingButton
          onClick={handleSave}
          loading={loading}
          className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
        >
          Save Changes
        </LoadingButton>
      }
    >
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={() => setNotification(null)} />
      )}
        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-8">
            {/* Booking Requests Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Calendar className="w-6 h-6 text-[var(--sf-blue-500)]" />
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Booking Requests</h2>
              </div>

              <p className="text-[var(--sf-text-secondary)] mb-6">
                Booking requests allow customers to propose multiple preferred times for services you've set as
                requestable. You review these requests and confirm the most suitable slot.
              </p>

              {/* Request Options */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-[var(--sf-text-primary)] mb-4">Request Options</h3>

                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="dates-times"
                      name="requestType"
                      checked={settings.bookingRequestType === "dates-times"}
                      onChange={() => handleInputChange("bookingRequestType", "dates-times")}
                      className="mt-1"
                    />
                    <div>
                      <label htmlFor="dates-times" className="font-medium text-[var(--sf-blue-500)] cursor-pointer">
                        Dates and Times
                      </label>
                      <p className="text-sm text-[var(--sf-text-secondary)]">
                        Customers pick both preferred dates and times for their booking request.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <input
                      type="radio"
                      id="dates-only"
                      name="requestType"
                      checked={settings.bookingRequestType === "dates-only"}
                      onChange={() => handleInputChange("bookingRequestType", "dates-only")}
                      className="mt-1"
                    />
                    <div>
                      <label htmlFor="dates-only" className="font-medium text-[var(--sf-text-primary)] cursor-pointer">
                        Dates Only
                      </label>
                      <p className="text-sm text-[var(--sf-text-secondary)]">
                        Customers select dates; you'll set the specific time later. Best for services that don't require
                        the customer's presence.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Selection Requirements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Require customer to select at least
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={settings.minDateOptions}
                      onChange={(e) => handleInputChange("minDateOptions", Number.parseInt(e.target.value))}
                      className="w-20 px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                      min="1"
                      max="10"
                    />
                    <span className="text-sm text-[var(--sf-text-secondary)]">dates</span>
                  </div>
                </div>

                {settings.bookingRequestType === "dates-times" && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Require customer to select at least
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        value={settings.minTimeSlots}
                        onChange={(e) => handleInputChange("minTimeSlots", Number.parseInt(e.target.value))}
                        className="w-20 px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                        min="1"
                        max="20"
                      />
                      <span className="text-sm text-[var(--sf-text-secondary)]">timeslots</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-sm text-[var(--sf-text-secondary)] mb-8">
                Requesting more preferred dates/times increases your chances of finding an ideal slot, but it may add
                friction to the customer's booking process. Balance carefully.
              </p>

              {/* Request Display Settings */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--sf-text-primary)]">Request Display Settings</h3>
                <p className="text-[var(--sf-text-secondary)]">Customize how booking requests are explained in the booking flow.</p>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Booking Summary Title</label>
                  <input
                    type="text"
                    value={settings.bookingSummaryTitle}
                    onChange={(e) => handleInputChange("bookingSummaryTitle", e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                    placeholder="Service Request"
                  />
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                    Customize the title shown in the booking summary for booking requests.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Custom Explainer Message</label>
                  <textarea
                    value={settings.customExplainerMessage}
                    onChange={(e) => handleInputChange("customExplainerMessage", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                    placeholder="This is a service request..."
                  />
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                    Shown in the booking summary when a customer is requesting service.
                  </p>
                </div>
              </div>
            </div>

            {/* Quote Requests Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center space-x-3 mb-6">
                <FileText className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Quote Requests</h2>
              </div>

              <p className="text-[var(--sf-text-secondary)] mb-6">
                Quote requests let customers describe their service needs without seeing a fixed price. You review the
                details and respond with a custom price quote. Once quoted, customers can book the service directly.
              </p>

              {/* Required Information */}
              <div className="mb-8">
                <h3 className="text-lg font-medium text-[var(--sf-text-primary)] mb-4">Required Information</h3>
                <p className="text-[var(--sf-text-secondary)] mb-4">
                  Customize the information customers must provide when submitting a quote request.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <MapPin className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      <div>
                        <span className="font-medium text-[var(--sf-text-primary)]">Require service address</span>
                        <p className="text-sm text-[var(--sf-text-secondary)]">
                          When enabled, customers must provide a service address with their quote request.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInputChange("requireServiceAddress", !settings.requireServiceAddress)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.requireServiceAddress ? "bg-[var(--sf-blue-500)]" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.requireServiceAddress ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      <div>
                        <span className="font-medium text-[var(--sf-text-primary)]">Require preferred dates and times</span>
                        <p className="text-sm text-[var(--sf-text-secondary)]">
                          When enabled, customers must select preferred dates and times for their service.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleInputChange("requirePreferredDates", !settings.requirePreferredDates)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.requirePreferredDates ? "bg-[var(--sf-blue-500)]" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.requirePreferredDates ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quote Display Settings */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-[var(--sf-text-primary)]">Request Display Settings</h3>
                <p className="text-[var(--sf-text-secondary)]">Customize how quote requests are explained in the booking flow.</p>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Quote Request Summary Title</label>
                  <input
                    type="text"
                    value={settings.quoteRequestSummaryTitle}
                    onChange={(e) => handleInputChange("quoteRequestSummaryTitle", e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                    placeholder="Quote Request"
                  />
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                    Customize the title shown in the booking summary for quote requests.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Custom Explainer Message</label>
                  <textarea
                    value={settings.quoteExplainerMessage}
                    onChange={(e) => handleInputChange("quoteExplainerMessage", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md"
                    placeholder="An instant price quote is not available..."
                  />
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">Shown in the booking summary for quote requests.</p>
                </div>
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <h3 className="text-lg font-medium text-[var(--sf-text-primary)] mb-4">Preview</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Booking Request Preview */}
                <div className="border border-[var(--sf-border-light)] rounded-lg p-4">
                  <h4 className="font-medium text-[var(--sf-text-primary)] mb-2">{settings.bookingSummaryTitle}</h4>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-3">{settings.customExplainerMessage}</p>
                  <div className="text-xs text-[var(--sf-text-muted)]">
                    Min dates: {settings.minDateOptions} |
                    {settings.bookingRequestType === "dates-times" && ` Min times: ${settings.minTimeSlots} |`}
                    Type: {settings.bookingRequestType === "dates-times" ? "Dates & Times" : "Dates Only"}
                  </div>
                </div>

                {/* Quote Request Preview */}
                <div className="border border-[var(--sf-border-light)] rounded-lg p-4">
                  <h4 className="font-medium text-[var(--sf-text-primary)] mb-2">{settings.quoteRequestSummaryTitle}</h4>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-3">{settings.quoteExplainerMessage}</p>
                  <div className="text-xs text-[var(--sf-text-muted)]">
                    Address required: {settings.requireServiceAddress ? "Yes" : "No"} | Dates required:{" "}
                    {settings.requirePreferredDates ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </SettingsPageLayout>
  )
}

export default BookingQuoteRequests
