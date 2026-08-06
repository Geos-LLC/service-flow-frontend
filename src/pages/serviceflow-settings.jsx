"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Sidebar from "../components/sidebar"
import BusinessDetailsModal from "../components/business-details-modal"
import SchedulingBookingModal from "../components/scheduling-booking-modal"
import { useAuth } from "../context/AuthContext"
import { getUserRole, isWorker, canEditAccountOwnerSettings } from "../utils/roleUtils"
import {
  Building2,
  Palette,
  Calendar,
  CalendarCheck,
  CalendarX,
  MapPin,
  Users,
  MessageSquare,
  Bell,
  Star,
  CreditCard,
  Calculator,
  CalendarDays,
  Code,
  Smartphone,
  ChevronRight,
  Settings,
  FileSpreadsheet,
  Upload,
  Phone,
  Zap,
  Banknote,
  Radio,
} from "lucide-react"

const ServiceFlowSettings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [businessDetailsOpen, setBusinessDetailsOpen] = useState(false)
  const [schedulingBookingOpen, setSchedulingBookingOpen] = useState(false)
  const [showInactiveCards, setShowInactiveCards] = useState(() => {
    // Load from localStorage, default to false
    const saved = localStorage.getItem('showInactiveCards')
    return saved === 'true'
  })
  const navigate = useNavigate()
  const { user } = useAuth()

  // Redirect team members to their profile editing page
  useEffect(() => {
    if (user && user.teamMemberId) {
      navigate(`/settings/account`)
    }
  }, [user, navigate])

  // Save showInactiveCards preference to localStorage
  useEffect(() => {
    localStorage.setItem('showInactiveCards', showInactiveCards.toString())
  }, [showInactiveCards])

  const handleSettingClick = (settingId) => {
    switch (settingId) {
      case "business-details":
        setBusinessDetailsOpen(true)
        break
      case "branding":
        navigate("/settings/branding")
        break
      case "availability":
        navigate("/settings/availability")
        break
      case "scheduling-policies":
        setSchedulingBookingOpen(true)
        break
      case "rescheduling-cancellation":
        navigate("/settings/rescheduling-cancellation")
        break
      case "service-areas":
        navigate("/territories")
        break
      case "booking-quote-requests":
        navigate("/settings/booking-quote-requests")
        break
      case "job-assignment":
        navigate("/settings/job-assignment")
        break
      case "opportunities-settings":
      case "leads-settings":
        navigate("/settings/opportunities")
        break
      case "client-team-notifications":
        navigate("/settings/client-team-notifications")
        break
      case "sms-settings":
        navigate("/settings/sms-settings")
        break
      case "communication-hub":
        navigate("/settings/communication-hub")
        break
      case "feedback-reviews":
        navigate("/settings/feedback-reviews")
        break
      case "payments":
        navigate("/settings/payments")
        break
      case "taxes-fees":
        navigate("/settings/taxes-fees")
        break
      case "invoicing":
        navigate("/settings/invoicing")
        break
      case "payout-settings":
        navigate("/settings/payout-settings")
        break
      case "zenbooker":
        navigate("/settings/zenbooker")
        break
      case "calendar-syncing":
        navigate("/settings/calendar-syncing")
        break
      case "google-sheets":
        navigate("/settings/google-sheets")
        break
      case "stripe-connect":
        navigate("/settings/stripe-connect")
        break
      case "data-import":
        navigate("/settings/data-import")
        break
      case "booking-koala":
        navigate("/settings/data-import?preset=booking-koala")
        break
      case "developers":
        navigate("/settings/developers")
        break
      case "field-app":
        navigate("/settings/field-app")
        break
      case "services":
        navigate("/services")
        break
      default:
        console.log(`Navigate to ${settingId}`)
    }
  }

  const settingsSections = [
    {
      title: "Business",
      items: [
        {
          id: "business-details",
          icon: Building2,
          title: "Business Details",
          description: "View and update your business details",
          active: true,
        },
        {
          id: "branding",
          icon: Palette,
          title: "Branding",
          description: "Customize your branding for emails, invoices, and your rescheduling page",
          active: false,
        },
        {
          id: "services",
          icon: Settings,
          title: "Services",
          description: "Configure default service settings and manage service categories",
          active: true,
        },
        {
          id: "service-areas",
          icon: MapPin,
          title: "Territories",
          description: "Customize the geographic areas you service",
          active: true,
        },
      ],
    },
    {
      title: "Scheduling & Booking",
      items: [
        {
          id: "availability",
          icon: Calendar,
          title: "Availability",
          description: "Set hours of operation and add unexpected schedule changes",
          active: true,
        },
        {
          id: "scheduling-policies",
          icon: CalendarCheck,
          title: "Scheduling Policies",
          description: "Customize scheduling rules and how availability is determined",
          active: false,
        },
        {
          id: "rescheduling-cancellation",
          icon: CalendarX,
          title: "Rescheduling & Cancellation",
          description: "Allow your customers to reschedule and cancel online",
          active: false,
        },
        {
          id: "booking-quote-requests",
          icon: MessageSquare,
          title: "Booking & Quote Requests",
          description: "Configure how customers submit booking and quote requests for your services",
          active: false,
        },
        {
          id: "job-assignment",
          icon: Users,
          title: "Job Assignment",
          description: "Configure job assignment and dispatch options for your service providers",
          active: false,
        },
        {
          id: "opportunities-settings",
          icon: Zap,
          title: "Opportunities Settings",
          description: "Configure opportunity stage automation for Thumbtack and Yelp leads",
          active: true,
        },
      ],
    },
    {
      title: "Communications",
      items: [
        {
          id: "client-team-notifications",
          icon: Bell,
          title: "Client & Team Notifications",
          description: "Edit the emails and text messages that are sent to clients and team members",
          active: true,
        },
        {
          id: "sms-settings",
          icon: MessageSquare,
          title: "SMS Settings",
          description: "Configure Twilio SMS integration for customer notifications",
          active: true,
        },
        {
          id: "communication-hub",
          icon: Radio,
          title: "Communication Hub",
          description: "Connect communication providers (SMS, Yelp, Thumbtack, WhatsApp, Email), manage inbox behavior, and control how conversations sync into CRM",
          active: true,
        },
        {
          id: "feedback-reviews",
          icon: Star,
          title: "Feedback & Reviews",
          description: "Collect feedback from customers and invite them to leave reviews",
          active: false,
        },
      ],
    },
    {
      title: "Invoicing & Payments",
      items: [
        {
          id: "payments",
          icon: CreditCard,
          title: "Payments",
          description: "Configure payment processing, tip calculation, and processing fees",
          active: true,
        },
        {
          id: "taxes-fees",
          icon: Calculator,
          title: "Taxes & Fees",
          description: "Manage tax rates, fees, and adjustment rules for your services",
          active: true,
        },
        {
          id: "invoicing",
          icon: FileSpreadsheet,
          title: "Invoicing",
          description: "Customize invoice templates, memos, footer, and payment terms",
          active: true,
        },
        {
          id: "payout-settings",
          icon: Banknote,
          title: "Payout Settings",
          description: "Configure payout frequency, pay period, payout method, and auto-payout",
          active: true,
        },
      ],
    },
    {
      title: "Integrations",
      items: [
        {
          id: "calendar-syncing",
          icon: CalendarDays,
          title: "Calendar Syncing",
          description: "Sync your Serviceflow schedule to external calendar apps",
          active: true,
        },
        {
          id: "google-sheets",
          icon: FileSpreadsheet,
          title: "Google Sheets",
          description: "Export data to Google Sheets and import from spreadsheets",
          active: true,
        },
        {
          id: "stripe-connect",
          icon: Zap,
          title: "Stripe Connect",
          description: "Connect Stripe for payment processing",
          active: true,
        },
        {
          id: "data-import",
          icon: Upload,
          title: "Data Import",
          description: "Import customers, jobs, team members, services, or territories from any CSV/Excel file (Booking Koala, ZenBooker, or manual mapping)",
          active: true,
        },
        {
          id: "zenbooker",
          icon: Calendar,
          title: "Zenbooker",
          description: "Sync jobs, customers, and team from Zenbooker in real-time",
          active: true,
        },
      ],
    },
    {
      title: "Advanced",
      items: [
        {
          id: "field-app",
          icon: Smartphone,
          title: "Field App",
          description: "Customize your mobile web app for service providers",
          active: false,
        },
        {
          id: "developers",
          icon: Code,
          title: "Developers",
          description: "Manage webhooks and API credentials",
          active: true,
        },
      ],
    },
  ]

  return (
    <div className="flex h-screen bg-[var(--sf-bg-page)] overflow-hidden">
      {/* Main Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 lg:mx-44 xl:mx-48">

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold text-[var(--sf-text-primary)] mb-8 text-center">Settings</h1>

            {/* User Profile Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div
                onClick={() => navigate("/settings/account")}
                className="bg-[var(--sf-blue-50)] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-blue-100 transition-all hover:shadow-md"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-[var(--sf-blue-500)] rounded-full flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      {user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--sf-text-primary)]">
                      {user?.firstName && user?.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user?.firstName || user?.email || 'User'}
                    </h3>
                    <p className="text-sm text-[var(--sf-text-secondary)]">Manage your Serviceflow user account</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
              </div>

              {canEditAccountOwnerSettings(user) && (
                <div
                  onClick={showInactiveCards ? () => navigate("/settings/billing") : undefined}
                  className={`bg-[var(--sf-bg-page)] rounded-xl p-4 flex items-center justify-between ${
                    showInactiveCards
                      ? 'cursor-pointer hover:bg-[var(--sf-bg-hover)] opacity-80 hover:shadow-md'
                      : 'opacity-60 cursor-not-allowed'
                  } transition-all`}
                  style={{ border: 'none' }}
                >
                  <div>
                    <h3 className="font-medium text-[var(--sf-text-primary)]">Billing</h3>
                    <p className="text-sm text-[var(--sf-text-secondary)]">Manage your Serviceflow plan and billing information</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                </div>
              )}
            </div>

            {/* Developer Toggle for Inactive Cards */}
            {canEditAccountOwnerSettings(user) && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-1">Developer Mode</h3>
                    <p className="text-xs text-[var(--sf-text-secondary)]">Enable access to inactive features for development and testing</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showInactiveCards}
                      onChange={(e) => setShowInactiveCards(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sf-blue-500)]"></div>
                  </label>
                </div>
              </div>
            )}

            {/* Settings Sections */}
            <div className="space-y-8">
              {settingsSections.map((section, sectionIndex) => (
                <div key={sectionIndex}>
                  <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">{section.title}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.items.map((item, itemIndex) => {
                      const Icon = item.icon
                      const isActive = item.active !== false // Default to true if not specified
                      const isClickable = isActive || showInactiveCards // Clickable if active OR if developer mode is on
                      return (
                        <div
                          key={itemIndex}
                          onClick={isClickable ? () => handleSettingClick(item.id) : undefined}
                          className={`sf-card p-4 transition-all ${
                            isActive
                              ? 'hover:shadow-md cursor-pointer'
                              : showInactiveCards
                              ? 'hover:shadow-md cursor-pointer opacity-80'
                              : 'opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="w-10 h-10 bg-[var(--sf-bg-page)] rounded-lg flex items-center justify-center flex-shrink-0">
                              <Icon className="w-5 h-5 text-[var(--sf-text-secondary)]" />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-medium text-[var(--sf-text-primary)] mb-1">{item.title}</h3>
                              <p className="text-sm text-[var(--sf-text-secondary)]">{item.description}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

      {/* Modals */}
      <BusinessDetailsModal isOpen={businessDetailsOpen} onClose={() => setBusinessDetailsOpen(false)} />
      <SchedulingBookingModal isOpen={schedulingBookingOpen} onClose={() => setSchedulingBookingOpen(false)} userId={user?.id} />
      </div>
    </div>
  )
}

export default ServiceFlowSettings
