"use client"

import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Building2,
  User as UserIcon,
  CreditCard,
  Shield,
  Calendar,
  MapPin,
  Users,
  Briefcase,
  Globe,
  CalendarX,
  Smartphone,
  LayoutGrid,
  DollarSign,
  Package,
  TicketPercent,
  Calculator,
  Banknote,
  FileText,
  Receipt,
  MessageSquare,
  Mail,
  Radio,
  Inbox as InboxIcon,
  Star,
  Zap,
  CalendarDays,
  FileSpreadsheet,
  Upload,
  Code,
  ArrowLeft,
  ChevronRight,
  AlertOctagon,
} from "lucide-react"
import MobileHeader from "./mobile-header"
import { SfPageHeader, SfButton, SfTag } from "./sf-primitives"
import api from "../services/api"

// Module-level cache so each rail mount doesn't refetch.
let _identityConflictCount = null
let _identityConflictCountAt = 0
const IDENTITY_CACHE_MS = 60 * 1000 // 60s

/**
 * Settings shell with a persistent left-rail nav + right content area.
 * Matches the prototype: sub-pages keep the user inside the settings
 * surface (Stripe/Linear style) rather than bouncing them back to a
 * hub via a breadcrumb.
 *
 * Usage:
 *   <SettingsRailLayout
 *     title="Business profile"
 *     section="Account"
 *     subtitle="How your business appears to customers and on documents"
 *     onSave={...}
 *     onDiscard={...}
 *   >
 *     {body}
 *   </SettingsRailLayout>
 */

// Single source of truth for the rail. Each item: { id, label, icon,
// to (route), badge (optional), comingSoon (bool) }
export const RAIL_SECTIONS = [
  {
    id: "account",
    title: "Account",
    items: [
      { id: "business-profile", label: "Business profile", icon: Building2,    to: "/settings/business-profile" },
      { id: "account",          label: "Your account",     icon: UserIcon,     to: "/settings/account" },
      { id: "billing",          label: "Billing & plan",   icon: CreditCard,   to: "/settings/billing", badge: "Growth" },
      { id: "security",         label: "Security",         icon: Shield,       to: "/settings/security", comingSoon: true },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    items: [
      { id: "availability",     label: "Availability",     icon: Calendar,     to: "/settings/availability" },
      { id: "service-areas",    label: "Service areas",    icon: MapPin,       to: "/territories" },
      { id: "team",             label: "Team & roles",     icon: Users,        to: "/team" },
      { id: "job-assignment",   label: "Assignment rules", icon: Briefcase,    to: "/settings/job-assignment" },
      { id: "online-booking",   label: "Online booking",   icon: Globe,        to: "/online-booking" },
      { id: "reschedule",       label: "Reschedule / cancel", icon: CalendarX, to: "/settings/rescheduling-cancellation" },
      { id: "field-app",        label: "Field app",        icon: Smartphone,   to: "/settings/field-app" },
    ],
  },
  {
    id: "services",
    title: "Services & pricing",
    items: [
      { id: "services",         label: "Services catalog", icon: LayoutGrid,   to: "/services" },
      { id: "pricing",          label: "Pricing rules",    icon: DollarSign,   to: "/settings/pricing", comingSoon: true },
      { id: "addons",           label: "Add-ons library",  icon: Package,      to: "/settings/addons",  comingSoon: true },
      { id: "coupons",          label: "Coupons & promos", icon: TicketPercent, to: "/coupons" },
      { id: "taxes-fees",       label: "Taxes & fees",     icon: Calculator,   to: "/settings/taxes-fees" },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    items: [
      { id: "payments",         label: "Payments",         icon: CreditCard,   to: "/settings/payments", badge: "Stripe" },
      { id: "invoicing",        label: "Invoicing",        icon: FileText,     to: "/settings/invoicing" },
      { id: "payout",           label: "Payouts",          icon: Banknote,     to: "/settings/payout-settings" },
      { id: "receipts",         label: "Receipts",         icon: Receipt,      to: "/settings/receipts", comingSoon: true },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    items: [
      { id: "sms",              label: "SMS",              icon: MessageSquare, to: "/settings/sms-settings" },
      { id: "email",            label: "Email",            icon: Mail,          to: "/settings/client-team-notifications" },
      { id: "communication-hub", label: "Communication hub", icon: Radio,       to: "/settings/communication-hub" },
      { id: "inboxes",          label: "Connected inboxes", icon: InboxIcon,    to: "/settings/connected-inboxes" },
      { id: "feedback",         label: "Feedback & reviews", icon: Star,        to: "/settings/feedback-reviews" },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    items: [
      { id: "leads",            label: "Leads & sources",  icon: Zap,           to: "/settings/leads" },
      { id: "calendar-sync",    label: "Calendar sync",    icon: CalendarDays,  to: "/settings/calendar-syncing" },
      { id: "google-sheets",    label: "Google Sheets",    icon: FileSpreadsheet, to: "/settings/google-sheets" },
      { id: "stripe-connect",   label: "Stripe Connect",   icon: Zap,           to: "/settings/stripe-connect" },
      { id: "zenbooker",        label: "Zenbooker",        icon: Calendar,      to: "/settings/zenbooker" },
      { id: "data-import",      label: "Data import",      icon: Upload,        to: "/settings/data-import" },
      { id: "developers",       label: "Developers",       icon: Code,          to: "/settings/developers" },
    ],
  },
  {
    id: "data-integrity",
    title: "Data integrity",
    items: [
      {
        id: "identity-conflicts",
        label: "Identity conflicts",
        icon: AlertOctagon,
        to: "/settings/identity-conflicts",
        dynamicBadge: "identity_conflicts",
      },
    ],
  },
]

// Tiny hook for the rail's dynamic conflict-count badge. Module-cached
// for 60s so opening multiple settings pages doesn't refetch on every
// mount. Returns null until first load completes.
const useIdentityConflictCount = () => {
  const [count, setCount] = useState(_identityConflictCount)
  useEffect(() => {
    const fresh = Date.now() - _identityConflictCountAt < IDENTITY_CACHE_MS
    if (fresh && _identityConflictCount != null) {
      setCount(_identityConflictCount)
      return
    }
    let cancelled = false
    api
      .get("/identity-conflicts/summary")
      .then((res) => {
        if (cancelled) return
        const n = Number(res?.data?.identity_conflict_count)
        if (Number.isFinite(n)) {
          _identityConflictCount = n
          _identityConflictCountAt = Date.now()
          setCount(n)
        }
      })
      .catch(() => {
        // Silent failure — endpoint may not be available or auth missing.
      })
    return () => {
      cancelled = true
    }
  }, [])
  return count
}

export const SettingsRailLayout = ({
  title,
  section,
  subtitle,
  saving,
  saveLabel = "Save changes",
  onSave,
  onDiscard,
  actions,
  children,
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const here = location.pathname
  const identityConflictCount = useIdentityConflictCount()

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)]"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader pageTitle={title} />

      <SfPageHeader
        eyebrow={
          <Link
            to="/settings"
            className="inline-flex items-center gap-1 text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] transition-colors"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={11} />
            <span>Settings</span>
            {section && (
              <>
                <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
                <span>{section}</span>
              </>
            )}
            <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
            <span style={{ color: "var(--sf-ink)" }}>{title}</span>
          </Link>
        }
        title={title}
        subtitle={subtitle}
        actions={
          actions || (onSave || onDiscard) ? (
            <div className="flex items-center gap-2">
              {actions}
              {onDiscard && (
                <SfButton variant="ghost" size="md" onClick={onDiscard}>
                  Discard
                </SfButton>
              )}
              {onSave && (
                <SfButton
                  variant="primary"
                  size="md"
                  onClick={onSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : saveLabel}
                </SfButton>
              )}
            </div>
          ) : null
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* Rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 flex flex-col gap-3">
            {RAIL_SECTIONS.map((sec) => (
              <div key={sec.id}>
                <div
                  className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] mb-1.5"
                  style={{ padding: "0 10px", letterSpacing: ".06em" }}
                >
                  {sec.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {sec.items.map((it) => {
                    const Icon = it.icon
                    const active = here === it.to
                    return (
                      <button
                        key={it.id}
                        onClick={() => navigate(it.to)}
                        className="w-full text-left rounded-md flex items-center gap-2.5"
                        style={{
                          padding: "6px 10px",
                          background: active ? "var(--sf-blue-soft)" : "transparent",
                          color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
                          border: "none",
                          fontSize: 12.5,
                          fontWeight: active ? 600 : 500,
                          cursor: "pointer",
                          fontFamily: "var(--sf-font-ui)",
                          opacity: it.comingSoon ? 0.55 : 1,
                        }}
                      >
                        <Icon
                          size={13}
                          className="flex-shrink-0"
                          style={{ color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-3)" }}
                        />
                        <span className="flex-1 truncate">{it.label}</span>
                        {it.badge && (
                          <SfTag
                            color="var(--sf-green-dark)"
                            bg="var(--sf-green-soft)"
                          >
                            {it.badge}
                          </SfTag>
                        )}
                        {it.dynamicBadge === "identity_conflicts" &&
                          identityConflictCount != null &&
                          identityConflictCount > 0 && (
                            <SfTag
                              color="var(--sf-red-dark)"
                              bg="var(--sf-red-soft)"
                            >
                              {identityConflictCount}
                            </SfTag>
                          )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

export default SettingsRailLayout
