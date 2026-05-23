"use client"

import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
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
  ChevronRight,
  Search as SearchIcon,
  Sparkles,
  AlertOctagon,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import api from "../services/api"
import { canEditAccountOwnerSettings } from "../utils/roleUtils"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfPageHeader,
  SfTag,
} from "../components/sf-primitives"

/**
 * Settings hub v2 — per the prototype screenshots.
 *
 * Layout:
 *  - Plan banner at top
 *  - 6 sections laid out as a 3-column responsive grid:
 *      Account · Operations · Sales & marketing
 *      Financial · Communications · Integrations
 *  - Each row carries a rich status line (sent counts, connection
 *    state, badge, etc) so the hub doubles as an at-a-glance dashboard.
 *
 * Sub-pages use SettingsRailLayout, not a breadcrumb back-button.
 */

// ── Sections ───────────────────────────────────────────────

const SECTIONS = [
  {
    id: "account",
    title: "Account",
    items: [
      {
        id: "business-profile", icon: Building2,
        title: "Business profile",
        desc: "Company name, logo, address, hours",
        status: { label: "Complete", color: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" },
        to: "/settings/business-profile",
      },
      {
        id: "account", icon: UserIcon,
        title: "Account details",
        desc: "Your name, email, phone, password",
        to: "/settings/account",
      },
      {
        id: "billing", icon: CreditCard,
        title: "Billing & plan",
        desc: "Growth plan · $79 / mo · renews Jun 1",
        status: { label: "Growth", color: "var(--sf-blue-dark)", bg: "var(--sf-blue-soft)" },
        to: "/settings/billing",
      },
      {
        id: "security", icon: Shield,
        title: "Security",
        desc: "2FA, sessions, audit log",
        comingSoon: true,
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    items: [
      {
        id: "availability", icon: Calendar,
        title: "Availability & hours",
        desc: "When you accept jobs · by location",
        to: "/settings/availability",
      },
      {
        id: "service-areas", icon: MapPin,
        title: "Service areas",
        desc: "Manage zones for your service area",
        to: "/territories",
      },
      {
        id: "team", icon: Users,
        title: "Team & roles",
        desc: "Manage teams, members, and roles",
        to: "/team",
      },
      {
        id: "job-assignment", icon: Briefcase,
        title: "Job assignment rules",
        desc: "Auto-assign by area + service",
        to: "/settings/job-assignment",
      },
      {
        id: "reschedule", icon: CalendarX,
        title: "Rescheduling & cancellation",
        desc: "Self-serve windows + fees",
        to: "/settings/rescheduling-cancellation",
      },
      {
        id: "field-app", icon: Smartphone,
        title: "Field app settings",
        desc: "Mobile app for cleaners",
        to: "/settings/field-app",
      },
    ],
  },
  {
    id: "sales",
    title: "Sales & marketing",
    items: [
      {
        id: "leads", icon: Zap,
        title: "Lead capture",
        desc: "Sources, tracking, auto-assignment",
        to: "/settings/leads",
      },
      {
        id: "online-booking", icon: Globe,
        title: "Online booking",
        desc: "Public booking page",
        to: "/online-booking",
      },
      {
        id: "coupons", icon: TicketPercent,
        title: "Coupons & promos",
        desc: "Manage active coupons and promotions",
        to: "/coupons",
      },
      {
        id: "services", icon: LayoutGrid,
        title: "Services catalog",
        desc: "Manage services and categories",
        to: "/services",
      },
      {
        id: "pricing", icon: DollarSign,
        title: "Pricing rules",
        desc: "Per-room, weekend surcharge, travel fees",
        comingSoon: true,
      },
      {
        id: "addons", icon: Package,
        title: "Add-ons library",
        desc: "Manage popular add-ons",
        comingSoon: true,
      },
      {
        id: "feedback", icon: Star,
        title: "Feedback & reviews",
        desc: "Auto-request after job",
        to: "/settings/feedback-reviews",
      },
    ],
  },
  {
    id: "financial",
    title: "Financial",
    items: [
      {
        id: "payments", icon: DollarSign,
        title: "Payments",
        desc: "Cards, ACH, and tip settings",
        status: { label: "Stripe", color: "var(--sf-purple)", bg: "var(--sf-purple-soft)" },
        to: "/settings/payments",
      },
      {
        id: "invoicing", icon: FileText,
        title: "Invoicing",
        desc: "Net-14 default · auto-send enabled",
        to: "/settings/invoicing",
      },
      {
        id: "taxes-fees", icon: Calculator,
        title: "Taxes & fees",
        desc: "Tax rates and adjustment rules",
        to: "/settings/taxes-fees",
      },
      {
        id: "payout", icon: Banknote,
        title: "Payouts",
        desc: "Frequency, pay period, auto-payout",
        to: "/settings/payout-settings",
      },
      {
        id: "receipts", icon: Receipt,
        title: "Receipts",
        desc: "Receipt templates and email content",
        comingSoon: true,
      },
    ],
  },
  {
    id: "communications",
    title: "Communications",
    items: [
      {
        id: "sms", icon: MessageSquare,
        title: "SMS (Twilio)",
        desc: "Configure SMS notifications",
        to: "/settings/sms-settings",
      },
      {
        id: "email", icon: Mail,
        title: "Email",
        desc: "Manage email notifications",
        to: "/settings/client-team-notifications",
      },
      {
        id: "communication-hub", icon: Radio,
        title: "Communication hub",
        desc: "SMS, Yelp, Thumbtack, WhatsApp, Email",
        to: "/settings/communication-hub",
      },
      {
        id: "inboxes", icon: InboxIcon,
        title: "Connected inboxes",
        desc: "Gmail / Outlook OAuth mailboxes",
        to: "/settings/connected-inboxes",
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    items: [
      {
        id: "calendar-sync", icon: CalendarDays,
        title: "Calendar sync",
        desc: "Google Calendar · 2-way sync",
        to: "/settings/calendar-syncing",
      },
      {
        id: "google-sheets", icon: FileSpreadsheet,
        title: "Google Sheets",
        desc: "Export jobs and data nightly",
        to: "/settings/google-sheets",
      },
      {
        id: "stripe", icon: Zap,
        title: "Stripe Connect",
        desc: "Connect Stripe for payment processing",
        to: "/settings/stripe-connect",
      },
      {
        id: "zenbooker", icon: Calendar,
        title: "Zenbooker",
        desc: "Sync jobs, customers, team in real-time",
        to: "/settings/zenbooker",
      },
      {
        id: "data-import", icon: Upload,
        title: "Data import",
        desc: "Import from CSV/Excel or other CRMs",
        to: "/settings/data-import",
      },
      {
        id: "developers", icon: Code,
        title: "Developers",
        desc: "Webhooks, API tokens, audit log",
        to: "/settings/developers",
      },
    ],
  },
  {
    id: "data-integrity",
    title: "Data integrity",
    items: [
      {
        id: "identity-conflicts", icon: AlertOctagon,
        title: "Identity conflicts",
        desc: "Cross-role phone collisions that can mis-route SMS",
        to: "/settings/identity-conflicts",
        // status is injected dynamically by the page from
        // /api/identity-conflicts/summary — see useIdentityConflictStatus.
      },
    ],
  },
]

// 3-column grouping per the screenshot. Data integrity lives in the
// Account column (col 1) so account-level concerns cluster together.
const COLUMNS = [
  ["account", "financial", "data-integrity"],
  ["operations", "communications"],
  ["sales", "integrations"],
]

// ── Page ───────────────────────────────────────────────────

const ServiceFlowSettingsV2 = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [identityConflictCount, setIdentityConflictCount] = useState(null)

  useEffect(() => {
    if (user?.teamMemberId) navigate("/settings/account")
  }, [user, navigate])

  // Pull the open-conflict count so the Data integrity card shows
  // either "All clear" (count=0) or "N to review" (count>0). Silent
  // failure — card still renders without a badge.
  useEffect(() => {
    let cancelled = false
    api
      .get("/identity-conflicts/summary")
      .then((res) => {
        if (cancelled) return
        const n = Number(res?.data?.identity_conflict_count)
        if (Number.isFinite(n)) setIdentityConflictCount(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase()
    return SECTIONS.map((s) => {
      let items = s.items.filter((it) => {
        if (it.comingSoon && !showInactive && !q) return false
        if (!q) return true
        return (
          it.title.toLowerCase().includes(q) ||
          (it.desc || "").toLowerCase().includes(q)
        )
      })
      // Inject dynamic status badge for the identity-conflicts item.
      if (s.id === "data-integrity" && identityConflictCount != null) {
        items = items.map((it) => {
          if (it.id !== "identity-conflicts") return it
          const isClean = identityConflictCount === 0
          return {
            ...it,
            status: isClean
              ? { label: "All clear", color: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" }
              : { label: `${identityConflictCount} to review`, color: "var(--sf-red-dark)", bg: "var(--sf-red-soft)" },
          }
        })
      }
      return { ...s, items }
    })
  }, [search, showInactive, identityConflictCount])

  const sectionById = (id) => filteredSections.find((s) => s.id === id)
  const owner = canEditAccountOwnerSettings(user)

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)]"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader pageTitle="Settings" />

      <SfPageHeader
        eyebrow="System"
        title="Settings"
        subtitle={
          user?.company_name
            ? `Manage your business · ${user.company_name}`
            : "Manage your business"
        }
        actions={
          <div
            className="hidden md:flex items-center gap-2 rounded-md bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] px-3 py-[6px]"
            style={{ width: 240 }}
          >
            <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings"
              className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[var(--sf-ink)]"
              style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
            />
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8">
        {/* Plan banner */}
        {owner && (
          <PlanBanner onUpgrade={() => navigate("/settings/billing")} />
        )}

        {/* Mobile search */}
        <div className="md:hidden mb-4">
          <div className="flex items-center gap-2 rounded-md bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] px-3 py-[7px]">
            <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings"
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--sf-ink)]"
              style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
            />
          </div>
        </div>

        {/* 3-column section grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
          {COLUMNS.map((colIds, ci) => (
            <div key={ci} className="flex flex-col gap-5">
              {colIds.map((sid) => {
                const section = sectionById(sid)
                if (!section || section.items.length === 0) return null
                return <SectionGroup key={sid} section={section} onClick={(it) => it.to && navigate(it.to)} />
              })}
            </div>
          ))}
        </div>

        {/* Developer toggle for coming-soon items */}
        {owner && (
          <div className="mt-6 inline-flex items-center gap-2 text-[11.5px] text-[var(--sf-ink-3)]">
            <Sparkles size={12} className="text-[var(--sf-amber)]" />
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                style={{ width: 13, height: 13, margin: 0, accentColor: "var(--sf-blue)" }}
              />
              <span>Show settings that aren't enabled yet</span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Plan banner ────────────────────────────────────────────

const PlanBanner = ({ onUpgrade }) => (
  <div
    className="mb-6 rounded-[14px] flex items-center gap-4 flex-wrap"
    style={{
      padding: "16px 22px",
      background: "linear-gradient(90deg, var(--sf-blue) 0%, var(--sf-purple) 100%)",
      color: "#fff",
      boxShadow: "0 4px 12px rgba(37, 99, 235, .2)",
    }}
  >
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: "rgba(255,255,255,.18)" }}
    >
      <Sparkles size={16} color="#fff" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[14px] font-bold">
        You're on Growth · $79 / mo
      </div>
      <div className="text-[12.5px] mt-0.5" style={{ color: "rgba(255,255,255,.88)" }}>
        Unlimited jobs, online booking, custom branding. Upgrade for SLA + dedicated CSM.
      </div>
    </div>
    <button
      onClick={onUpgrade}
      className="inline-flex items-center px-3.5 py-1.5 rounded-full"
      style={{
        background: "rgba(255,255,255,.16)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.22)",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      See plans
    </button>
  </div>
)

// ── Section group ──────────────────────────────────────────

const SectionGroup = ({ section, onClick }) => (
  <div>
    <h2
      className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] mb-2"
      style={{ letterSpacing: ".08em" }}
    >
      {section.title}
    </h2>
    <SfCard padding={0} className="overflow-hidden">
      {section.items.map((it, i) => (
        <SettingRow
          key={it.id}
          item={it}
          isLast={i === section.items.length - 1}
          onClick={() => onClick(it)}
        />
      ))}
    </SfCard>
  </div>
)

// ── Single row ─────────────────────────────────────────────

const SettingRow = ({ item, isLast, onClick }) => {
  const Icon = item.icon
  const disabled = item.comingSoon
  return (
    <button
      onClick={() => !disabled && onClick()}
      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--sf-panel-alt)]"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
        style={{
          background: disabled ? "var(--sf-panel-soft)" : "var(--sf-panel-alt)",
          color: disabled ? "var(--sf-ink-3)" : "var(--sf-ink-2)",
        }}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-semibold text-[var(--sf-ink)]">
            {item.title}
          </span>
          {item.status && (
            <SfTag color={item.status.color} bg={item.status.bg}>
              {item.status.label}
            </SfTag>
          )}
          {disabled && (
            <SfTag color="var(--sf-ink-3)" bg="var(--sf-panel-soft)">Soon</SfTag>
          )}
        </div>
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5 truncate">
          {item.desc}
        </div>
      </div>
      <ChevronRight size={15} className="text-[var(--sf-ink-3)] flex-shrink-0" />
    </button>
  )
}

export default ServiceFlowSettingsV2
