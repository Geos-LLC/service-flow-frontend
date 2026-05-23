"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom"
import {
  ArrowLeft,
  ChevronRight,
  Mail as MailIcon,
  Phone as PhoneIcon,
  MapPin,
  Calendar as CalendarIcon,
  MessageSquare,
  Edit,
  Plus,
  Briefcase,
  RotateCw,
  ArrowUp,
  ArrowRight,
  Building,
  DollarSign,
  FileText,
  CheckCircle2,
  Clock,
  Archive,
  Search as SearchIcon,
  MoreHorizontal,
  Paperclip,
  Zap,
  Star,
  Upload,
  Download,
  File as FileIcon,
  Trash2,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { customersAPI, jobsAPI, invoicesAPI, estimatesAPI, communicationsAPI, propertyDataAPI, customerFilesAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import { getGoogleMapsApiKey } from "../config/maps"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfCardHeader,
  SfButton,
  SfKPI,
  SfStatusPill,
  SfTag,
  SfFilterChip,
  SfTab,
  SfAvatar,
  sfInitials,
} from "../components/sf-primitives"

/**
 * Customer detail — Service Blue redesign (Wave 3.2).
 *
 * Sticky header (breadcrumb, avatar+name, tags, contact row, action
 * cluster, 5-stat strip), 8-tab strip with URL state, and the
 * Overview/Jobs/Invoices tabs wired against real APIs. The remaining
 * five tabs (Estimates / Properties / Messages / Files / Activity)
 * are stubbed with the API path or schema work that needs to land
 * before they go live.
 */

// ── Helpers ────────────────────────────────────────────────

const formatMoney = (n) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const digitsOnly = (s) => String(s || "").replace(/\D/g, "")

const jobDateStr = (j) => String(j.scheduled_date || "").split("T")[0].split(" ")[0]
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const jobStatusLabel = (raw) => {
  const s = (raw || "").toLowerCase()
  if (s.includes("progress") || s === "in_progress") return "In progress"
  if (s === "en_route" || s === "en route" || s === "enroute") return "En route"
  if (s === "completed" || s === "complete" || s === "done") return "Completed"
  if (s === "cancelled" || s === "canceled") return "Cancelled"
  return "Scheduled"
}

const isCancelledJob = (j) => {
  const s = (j.status || "").toLowerCase()
  return s === "cancelled" || s === "canceled"
}
const isCompletedJob = (j) => {
  const s = (j.status || "").toLowerCase()
  return s === "completed" || s === "complete" || s === "done"
}
const isUpcomingJob = (j) =>
  !isCancelledJob(j) && !isCompletedJob(j) && jobDateStr(j) >= today()

const TABS = [
  { id: "overview",   label: "Overview",   counted: false },
  { id: "jobs",       label: "Jobs",       counted: true  },
  { id: "invoices",   label: "Invoices",   counted: true  },
  { id: "estimates",  label: "Estimates",  counted: true  },
  { id: "properties", label: "Properties", counted: true  },
  { id: "messages",   label: "Messages",   counted: true  },
  { id: "files",      label: "Files",      counted: false },
  { id: "activity",   label: "Activity",   counted: false },
]

// ── Page component ─────────────────────────────────────────

const CustomerDetailsV2 = () => {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id || "overview"
  const [tab, setTab] = useState(initialTab)

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(null)
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [estimates, setEstimates] = useState([])
  const [conversations, setConversations] = useState([])
  // Per-conversation events (messages, calls, reviews). Loaded after
  // the conversations list so the Messages tab can render the actual
  // individual messages — not just the thread preview row — and so
  // counts reflect the true message volume.
  const [convEvents, setConvEvents] = useState({})

  // URL ↔ tab sync (both directions). Browser back/forward updates `tab`;
  // clicking a tab updates the URL with `replace` so the back button
  // pops back to /customers, not through every tab.
  useEffect(() => {
    const urlTab = searchParams.get("tab")
    if (urlTab && urlTab !== tab && TABS.some((t) => t.id === urlTab)) {
      setTab(urlTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const setTabBoth = useCallback(
    (next) => {
      setTab(next)
      setSearchParams(
        (sp) => {
          const out = new URLSearchParams(sp)
          out.set("tab", next)
          return out
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const fetchAll = useCallback(async () => {
    if (!user?.id || !customerId) return
    setLoading(true)
    try {
      // First fetch the customer + non-conversation lists. We need
      // cust loaded before we can issue the targeted conversation
      // searches (phone / email / name).
      const [custResp, jobsResp, invResp, estResp] = await Promise.allSettled([
        customersAPI.getById(customerId),
        jobsAPI.getAll(user.id, "", "", 1, 500, null, null, "scheduled_date", "DESC", null, null, customerId),
        invoicesAPI.getAll(user.id, { customerId, page: 1, limit: 500 }),
        estimatesAPI.getAll(user.id, { customerId, page: 1, limit: 500 }),
      ])
      const cust = custResp.status === "fulfilled" ? (custResp.value?.customer || custResp.value) : null
      const jobsList = jobsResp.status === "fulfilled" ? normalizeAPIResponse(jobsResp.value, "jobs") : []
      const invList = invResp.status === "fulfilled" ? normalizeAPIResponse(invResp.value, "invoices") : []
      const estList = estResp.status === "fulfilled" ? normalizeAPIResponse(estResp.value, "estimates") : []
      setCustomer(cust)
      setJobs(jobsList.filter((j) => String(j.customer_id) === String(customerId)))
      setInvoices(invList.filter((i) => String(i.customer_id) === String(customerId)))
      setEstimates(estList.filter((e) => String(e.customer_id) === String(customerId)))

      // The conversations endpoint caps results at 100 globally. A
      // customer whose thread is paginated out of that window never
      // surfaces in a single getConversations({}) call. Issue
      // targeted server-side searches by phone / email / name and
      // merge them — the backend's `search` clause runs an OR across
      // participant_name / participant_phone / participant_email /
      // last_preview / company so each of these queries returns the
      // matching subset within the 100-row cap.
      const custPhone = digitsOnly(cust?.phone)
      const custEmail = (cust?.email || "").toLowerCase()
      const custName = [cust?.first_name, cust?.last_name].filter(Boolean).join(" ").trim()
      const searches = []
      if (custPhone) searches.push(custPhone.slice(-10))
      if (custEmail) searches.push(custEmail)
      if (custName) searches.push(custName)
      // Always include the default page too — picks up the CRM-linked
      // threads where the customerId is stamped even if phone/email
      // are missing.
      searches.push(null)

      const responses = await Promise.allSettled(
        searches.map((q) =>
          communicationsAPI
            .getConversations(q ? { search: q } : {})
            .catch(() => ({ conversations: [] }))
        )
      )
      const merged = new Map()
      responses.forEach((r) => {
        if (r.status !== "fulfilled") return
        const list = Array.isArray(r.value)
          ? r.value
          : Array.isArray(r.value?.conversations)
          ? r.value.conversations
          : []
        list.forEach((c) => {
          if (!merged.has(c.id)) merged.set(c.id, c)
        })
      })
      const allConvs = Array.from(merged.values())

      // Match by customerId, phone, OR email. Phone match uses last
      // 10 digits so formatting differences ("+1 (727) 457-0527" vs
      // "7274570527") don't miss.
      const customerConvs = allConvs.filter((c) => {
        if (String(c.customerId ?? c.customer_id) === String(customerId)) return true
        if (custPhone) {
          const fp = digitsOnly(c.fallbackIdentifier || c.participantPhone || "")
          if (fp && fp.endsWith(custPhone.slice(-10))) return true
        }
        if (custEmail) {
          const ce = String(c.participantEmail || c.fallbackIdentifier || "").toLowerCase()
          if (ce && ce === custEmail) return true
        }
        return false
      })
      setConversations(customerConvs)

      // Fan-out one detail-fetch per thread so the Messages tab can
      // render individual messages (not just thread previews) and so
      // the KPI shows the true message count. Capped at 8 threads to
      // keep it cheap — customers with more than 8 threads will only
      // see events for the first 8.
      const top = customerConvs.slice(0, 8)
      const detailResp = await Promise.allSettled(
        top.map((c) =>
          communicationsAPI.getConversation(c.id, { limit: 500 }).catch(() => null)
        )
      )
      const eventsByConv = {}
      detailResp.forEach((r, i) => {
        const evs = r.status === "fulfilled" && r.value?.events
          ? r.value.events
          : []
        eventsByConv[top[i].id] = evs
      })
      setConvEvents(eventsByConv)
    } finally {
      setLoading(false)
    }
  }, [user?.id, customerId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Derived ────────────────────────────────────────────────

  const name = useMemo(() => {
    if (!customer) return "Customer"
    return (
      customer.name ||
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
      customer.email ||
      "Customer"
    )
  }, [customer])

  const stats = useMemo(() => {
    const completed = jobs.filter(isCompletedJob)
    const upcoming = jobs.filter(isUpcomingJob)
    // LTV = actual earned revenue (completed jobs). Upcoming work goes
    // into the separate forecast metric so the two never blur.
    const completedRevenue = completed.reduce(
      (s, j) => s + parseFloat(j.total || j.service_price || 0),
      0
    )
    const upcomingRevenue = upcoming.reduce(
      (s, j) => s + parseFloat(j.total || j.service_price || 0),
      0
    )
    const completedCount = completed.length
    const avgJob = completedCount > 0 ? completedRevenue / completedCount : 0
    const ratings = completed.map((j) => parseFloat(j.rating)).filter((n) => Number.isFinite(n) && n > 0)
    const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : null
    const nextJob = upcoming.length
      ? [...upcoming].sort((a, b) => jobDateStr(a).localeCompare(jobDateStr(b)))[0]
      : null
    return {
      ltv: completedRevenue,
      completedCount,
      upcomingValue: upcomingRevenue,
      upcomingCount: upcoming.length,
      totalJobs: completedCount + upcoming.length,
      avgJob,
      avgRating,
      nextJob,
    }
  }, [jobs])

  // Property info derived from the customer + job intake (most recent
  // job at each service address wins for the spec fields).
  const properties = useMemo(() => deriveProperties(customer, jobs), [customer, jobs])

  const counts = useMemo(() => ({
    overview:   undefined,
    jobs:       jobs.filter((j) => !isCancelledJob(j)).length,
    invoices:   invoices.length,
    estimates:  estimates.length,
    properties: properties.length,
    // Show message volume (events) not thread count — a single SMS
    // thread with 100 messages should read "104", not "1".
    messages:   Object.values(convEvents).reduce(
      (s, evs) => s + (Array.isArray(evs) ? evs.filter((e) => {
        const t = e.type || ""
        return t.startsWith("message_") || t === "review_in"
      }).length : 0),
      0
    ) || conversations.length,
    files:      undefined,
    activity:   undefined,
  }), [jobs, invoices, estimates, properties, conversations, convEvents])

  // ── Render ────────────────────────────────────────────────

  if (loading && !customer) {
    return (
      <div
        className="min-h-screen bg-[var(--sf-bg-page)] flex items-center justify-center"
        style={{ fontFamily: "var(--sf-font-ui)" }}
      >
        <div className="text-[13px] text-[var(--sf-ink-3)]">Loading customer…</div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div
        className="min-h-screen bg-[var(--sf-bg-page)] flex flex-col items-center justify-center gap-3"
        style={{ fontFamily: "var(--sf-font-ui)" }}
      >
        <div className="text-[15px] font-semibold text-[var(--sf-ink)]">Couldn't load this customer</div>
        <SfButton variant="secondary" size="md" icon={ArrowLeft} onClick={() => navigate("/customers")}>
          Back to customers
        </SfButton>
      </div>
    )
  }

  const email = customer.email
  const phone = customer.phone
  const cityState = [customer.city, customer.state].filter(Boolean).join(", ")
  const isActive = (customer.status || "").toLowerCase() === "active"
  const isVIP = Array.isArray(customer.tags) && customer.tags.some((t) => String(t).toLowerCase() === "vip")

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)]"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader title={name} />

      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 bg-[var(--sf-panel)] border-b border-[var(--sf-border-soft)]">
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--sf-ink-2)] mb-3">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1 hover:text-[var(--sf-ink)] transition-colors"
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <ArrowLeft size={12} /> Customers
          </Link>
          <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
          <span className="text-[var(--sf-ink)] font-semibold truncate">{name}</span>
        </div>

        <div className="flex items-start gap-4 flex-wrap pb-3">
          <SfAvatar
            initials={sfInitials(name)}
            color="var(--sf-ink)"
            size={60}
            style={{ fontSize: 22 }}
          />
          <div className="min-w-0 flex-[1_1_360px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="text-[22px] sm:text-[24px] font-bold text-[var(--sf-ink)] m-0"
                style={{ letterSpacing: "-0.02em" }}
              >
                {name}
              </h1>
              {isVIP && <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">VIP</SfTag>}
              {customer.source && (
                <SfTag color="var(--sf-blue-dark)" bg="var(--sf-blue-soft)">
                  {customer.source}
                </SfTag>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-[12.5px] text-[var(--sf-ink-2)] flex-wrap">
              {email && (
                <span className="inline-flex items-center gap-1.5">
                  <MailIcon size={13} className="text-[var(--sf-ink-3)]" /> {email}
                </span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1.5">
                  <PhoneIcon size={13} className="text-[var(--sf-ink-3)]" /> {phone}
                </span>
              )}
              {cityState && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} className="text-[var(--sf-ink-3)]" /> {cityState}
                </span>
              )}
              {(() => {
                // Customer-since = earliest of customer.created_at
                // and the earliest job date. ZB-sync customers have a
                // created_at that's only the SF insert time, not when
                // they actually became a customer; the first job's
                // scheduled_date is usually closer to truth.
                let since = customer.created_at ? new Date(customer.created_at) : null
                jobs.forEach((j) => {
                  const d = j.scheduled_date || j.created_at
                  if (!d) return
                  const ts = new Date(String(d).includes("T") ? d : String(d).replace(" ", "T"))
                  if (!isNaN(ts) && (!since || ts < since)) since = ts
                })
                if (!since || isNaN(since)) return null
                return (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <CalendarIcon size={13} className="text-[var(--sf-ink-3)]" />
                    Customer since{" "}
                    {since.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                )
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {phone && (
              <a href={`sms:${phone}`} style={{ textDecoration: "none" }}>
                <SfButton variant="secondary" size="md" icon={MessageSquare}>Message</SfButton>
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} style={{ textDecoration: "none" }}>
                <SfButton variant="secondary" size="md" icon={MailIcon}>Email</SfButton>
              </a>
            )}
            <SfButton variant="secondary" size="md" icon={Edit}>Edit</SfButton>
            <SfButton variant="primary" size="md" icon={Plus} onClick={() => navigate(`/createjob?customerId=${customer.id}`)}>
              New job
            </SfButton>
          </div>
        </div>

        {/* 5-stat strip */}
        <div className="flex flex-wrap gap-x-8 gap-y-3 pb-3">
          <Stat label="Lifetime value" value={formatMoney(stats.ltv)} tone="var(--sf-green-dark)" />
          <Stat label="Completed jobs" value={stats.completedCount} />
          <Stat label="Avg job value" value={stats.avgJob > 0 ? formatMoney(stats.avgJob) : "—"} />
          <Stat
            label="Rating"
            value={stats.avgRating != null ? `★ ${stats.avgRating.toFixed(1)}` : "—"}
            tone="var(--sf-amber-dark)"
          />
          <Stat
            label="Status"
            value={isActive ? "Active" : (customer.status || "—")}
            tone={isActive ? "var(--sf-green-dark)" : "var(--sf-teal)"}
          />
        </div>

        {/* Tab strip */}
        <div
          className="flex items-center overflow-x-auto scrollbar-hide -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
          style={{ borderTop: "1px solid var(--sf-border-soft)" }}
        >
          {TABS.map((t) => (
            <SfTab
              key={t.id}
              active={tab === t.id}
              count={t.counted ? counts[t.id] : undefined}
              onClick={() => setTabBoth(t.id)}
            >
              {t.label}
            </SfTab>
          ))}
        </div>
      </div>

      {/* Body */}
      {tab === "overview" && (
        <OverviewTab
          customer={customer}
          jobs={jobs}
          invoices={invoices}
          stats={stats}
          property={properties[0] || null}
          onJobClick={(id) => navigate(`/job/${id}`)}
          onSeeAllJobs={() => setTabBoth("jobs")}
          onSeeAllInvoices={() => setTabBoth("invoices")}
        />
      )}
      {tab === "jobs" && (
        <JobsTab
          jobs={jobs}
          stats={stats}
          onJobClick={(id) => navigate(`/job/${id}`)}
          onNewJob={() => navigate(`/createjob?customerId=${customer.id}`)}
        />
      )}
      {tab === "invoices" && (
        <InvoicesTab
          invoices={invoices}
          jobs={jobs}
          onInvoiceClick={(id) => navigate(`/invoices/${id}`)}
        />
      )}
      {tab === "properties" && (
        <PropertiesTab properties={properties} customer={customer} />
      )}
      {tab === "messages" && (
        <MessagesTab
          conversations={conversations}
          eventsByConv={convEvents}
          customer={customer}
          customerName={name}
          onOpen={(id) => navigate(`/communications?conversation=${id}`)}
        />
      )}
      {tab === "activity" && (
        <ActivityTab jobs={jobs} invoices={invoices} conversations={conversations} estimates={estimates} customer={customer} />
      )}
      {tab === "estimates" && (
        <EstimatesTab estimates={estimates} customerName={name} />
      )}
      {tab === "files" && (
        <FilesTab customerId={customerId} />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────

const Stat = ({ label, value, tone }) => (
  <div>
    <div
      className="text-[11px] font-semibold text-[var(--sf-ink-3)] uppercase"
      style={{ letterSpacing: ".04em" }}
    >
      {label}
    </div>
    <div
      className="text-[20px] font-bold mt-1"
      style={{
        color: tone || "var(--sf-ink)",
        letterSpacing: "-0.01em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
)

// ── Overview tab ───────────────────────────────────────────

const OverviewTab = ({ customer, jobs, invoices, stats, property, onJobClick, onSeeAllJobs, onSeeAllInvoices }) => {
  // Default view: one most-recent past job + one next-upcoming job
  // so the dispatcher sees the lifecycle at a glance.
  const recentJobs = useMemo(() => {
    const todayStr = today()
    const past = [...jobs]
      .filter((j) => jobDateStr(j) < todayStr && !isCancelledJob(j))
      .sort((a, b) => jobDateStr(b).localeCompare(jobDateStr(a)))
    const upcoming = [...jobs]
      .filter(isUpcomingJob)
      .sort((a, b) => jobDateStr(a).localeCompare(jobDateStr(b)))
    const out = []
    if (upcoming[0]) out.push({ ...upcoming[0], _section: "Next" })
    if (past[0]) out.push({ ...past[0], _section: "Most recent" })
    return out
  }, [jobs])
  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 5),
    [invoices]
  )

  // Build all-time revenue trend (auto monthly / quarterly buckets)
  const trend = useMemo(() => buildAllTimeTrend(jobs, customer), [jobs, customer])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-1 lg:grid-cols-[66fr_34fr] gap-4 items-start">
      {/* Main column */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Job history */}
        <SfCard padding={0}>
          <div className="flex items-center px-4 py-3 border-b border-[var(--sf-border-soft)]">
            <div className="text-[13px] font-semibold text-[var(--sf-ink)]">Job history</div>
            <span className="text-[11.5px] text-[var(--sf-ink-3)] ml-2">
              · {stats.totalJobs} job{stats.totalJobs === 1 ? "" : "s"}
            </span>
            <div className="flex-1" />
            <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onSeeAllJobs}>
              View all
            </SfButton>
          </div>
          {recentJobs.length === 0 ? (
            <EmptyRow
              icon={Briefcase}
              title="No jobs yet"
              subtitle="When this customer books, jobs will appear here."
            />
          ) : (
            recentJobs.map((j, i) => (
              <div key={j.id}>
                <div
                  className="px-4 py-1.5 text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
                  style={{
                    letterSpacing: ".04em",
                    background: "var(--sf-panel-alt)",
                    borderBottom: "1px solid var(--sf-border-soft)",
                    borderTop: i === 0 ? "none" : "1px solid var(--sf-border-soft)",
                  }}
                >
                  {j._section}
                </div>
                <JobMiniRow
                  job={j}
                  isLast={i === recentJobs.length - 1}
                  onClick={() => onJobClick(j.id)}
                />
              </div>
            ))
          )}
        </SfCard>

        {/* Revenue trend */}
        <SfCard>
          <SfCardHeader
            title="Revenue trend"
            subtitle="Last 6 months · this customer"
            right={
              <div className="inline-flex items-baseline gap-1.5">
                <span
                  className="text-[18px] font-bold text-[var(--sf-ink)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatMoney(stats.ltv)}
                </span>
                {trend.deltaPct != null && trend.deltaPct !== 0 && (
                  <span
                    className="text-[11px] font-semibold inline-flex items-center gap-px"
                    style={{
                      color: trend.deltaPct > 0 ? "var(--sf-green-dark)" : "var(--sf-red-dark)",
                    }}
                  >
                    <ArrowUp
                      size={10}
                      strokeWidth={2.4}
                      style={{ transform: trend.deltaPct < 0 ? "rotate(180deg)" : "none" }}
                    />
                    {Math.abs(Math.round(trend.deltaPct))}%
                  </span>
                )}
              </div>
            }
          />
          <div className="flex items-end gap-1.5" style={{ height: 96 }}>
            {trend.values.map((v, i, a) => {
              const max = Math.max(1, ...a)
              const h = (v / max) * 100
              // Gradient: older buckets fade through the blue palette so
              // every bar reads as a distinct point in the customer's
              // lifecycle, last 3 stay full strength.
              const isRecent = i >= a.length - 3
              const fade = 0.35 + (i / Math.max(1, a.length - 1)) * 0.65 // 0.35 → 1
              const bg = isRecent
                ? "var(--sf-blue)"
                : `rgba(37, 99, 235, ${Math.min(0.95, fade)})`
              return (
                <div
                  key={i}
                  className="flex-1 relative"
                  style={{
                    height: `${Math.max(2, h)}%`,
                    background: bg,
                    borderRadius: "3px 3px 0 0",
                  }}
                  title={`${trend.labels[i]}: ${formatMoney(v)}`}
                >
                  {i === a.length - 1 && v > 0 && (
                    <div
                      className="absolute text-[10px] font-bold text-[var(--sf-ink)] whitespace-nowrap"
                      style={{
                        top: -22,
                        left: "50%",
                        transform: "translateX(-50%)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(v)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-1.5 mt-1.5 text-[10px] text-[var(--sf-ink-3)] font-medium overflow-hidden">
            {trend.labels.map((m, i) => (
              <div key={`${m}-${i}`} className="flex-1 text-center truncate">{m}</div>
            ))}
          </div>
          <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-1">
            {trend.intervalLabel} · {trend.values.length} period{trend.values.length === 1 ? "" : "s"}
          </div>
        </SfCard>

        {/* Invoices */}
        <SfCard padding={0}>
          <div className="flex items-center px-4 py-3 border-b border-[var(--sf-border-soft)]">
            <div className="text-[13px] font-semibold text-[var(--sf-ink)]">Invoices</div>
            <div className="flex-1" />
            <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onSeeAllInvoices}>
              View all
            </SfButton>
          </div>
          {recentInvoices.length === 0 ? (
            <EmptyRow
              icon={FileText}
              title="No invoices yet"
              subtitle="Invoices for this customer will appear here."
            />
          ) : (
            recentInvoices.map((inv, i) => (
              <InvoiceMiniRow
                key={inv.id}
                invoice={inv}
                isLast={i === recentInvoices.length - 1}
              />
            ))
          )}
        </SfCard>
      </div>

      {/* Side rail */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Internal notes */}
        <SfCard>
          <SfCardHeader
            title="Internal notes"
            right={
              <SfButton variant="ghost" size="sm" icon={Plus}>
                Add
              </SfButton>
            }
          />
          {customer?.notes ? (
            <div
              className="rounded-lg px-3 py-2.5"
              style={{
                background: "var(--sf-amber-soft)",
                border: "1px solid rgba(217,119,6,.15)",
              }}
            >
              <div className="text-[12px] text-[var(--sf-ink-2)] leading-snug whitespace-pre-wrap">
                {customer.notes}
              </div>
            </div>
          ) : (
            <div className="py-3 text-[11.5px] text-[var(--sf-ink-3)] text-center">
              No notes yet.
            </div>
          )}
        </SfCard>

        {/* Property */}
        {property && (
          <SfCard>
            <SfCardHeader title="Property" />
            <PropertyDetails property={property} />
          </SfCard>
        )}

        {/* Recent activity */}
        <SfCard>
          <SfCardHeader title="Recent activity" />
          <ActivityList jobs={jobs} invoices={invoices} />
        </SfCard>
      </div>
    </div>
  )
}

const JobMiniRow = ({ job, isLast, onClick }) => {
  const status = jobStatusLabel(job.status)
  const value = parseFloat(job.total || job.service_price || 0)
  const date = job.scheduled_date
    ? new Date(String(job.scheduled_date).includes("T") ? job.scheduled_date : String(job.scheduled_date).replace(" ", "T"))
    : null
  const dateStr = date && !isNaN(date)
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—"
  const time = date && !isNaN(date) ? formatTimeShared(date) : ""
  const dur = parseInt(job.duration || job.estimated_duration || 0, 10)
  const isRecurring = job.is_recurring === true

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: "transparent",
        border: "none",
        borderRadius: 0,
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <span
        className="rounded-sm flex-shrink-0"
        style={{
          width: 3,
          height: 32,
          background: isCancelledJob(job) ? "var(--sf-ink-4)" : "var(--sf-blue)",
          borderRadius: 2,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[13px] font-semibold text-[var(--sf-ink)] truncate"
            style={{
              textDecoration: isCancelledJob(job) ? "line-through" : "none",
              opacity: isCancelledJob(job) ? 0.65 : 1,
            }}
          >
            {job.service_name || "Service"}
          </span>
          {isRecurring && <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">↻</SfTag>}
        </div>
        <div
          className="text-[11px] text-[var(--sf-ink-3)] mt-0.5"
          style={{ fontFamily: "var(--sf-font-mono)" }}
        >
          #{String(job.id).slice(-4)} · {dateStr}
          {time ? ` · ${time}` : ""}
          {dur ? ` · ${dur}m` : ""}
        </div>
      </div>
      <div
        className="text-[13px] font-semibold text-[var(--sf-ink)] flex-shrink-0"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value ? formatMoney(value) : "—"}
      </div>
      <div className="flex-shrink-0" style={{ width: 110 }}>
        <SfStatusPill status={status} />
      </div>
    </button>
  )
}

const InvoiceMiniRow = ({ invoice, isLast }) => {
  const code = invoice.id ? `INV-${String(invoice.id).slice(-4)}` : "—"
  const issued = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—"
  const due = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—"
  const value = parseFloat(invoice.total_amount || invoice.amount || 0)
  const status = capitalize(invoice.status)
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)" }}
    >
      <FileText size={16} className="text-[var(--sf-ink-3)] flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div
          className="text-[12.5px] font-semibold text-[var(--sf-ink)]"
          style={{ fontFamily: "var(--sf-font-mono)" }}
        >
          {code}
        </div>
        <div className="text-[11px] text-[var(--sf-ink-3)] mt-px">
          {issued} → due {due}
        </div>
      </div>
      <div
        className="text-[13px] font-semibold text-[var(--sf-ink)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatMoney(value)}
      </div>
      <SfStatusPill status={status} />
    </div>
  )
}

const EmptyRow = ({ icon: Icon, title, subtitle }) => (
  <div className="py-10 px-6 flex flex-col items-center text-center">
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
      style={{ background: "var(--sf-panel-soft)", color: "var(--sf-ink-3)" }}
    >
      <Icon size={18} />
    </div>
    <div className="text-[13px] font-semibold text-[var(--sf-ink)]">{title}</div>
    {subtitle && (
      <div className="text-[12px] text-[var(--sf-ink-2)] mt-1 max-w-xs">{subtitle}</div>
    )}
  </div>
)

const ActivityList = ({ jobs, invoices }) => {
  const events = useMemo(() => {
    const out = []
    jobs.forEach((j) => {
      const status = (j.status || "").toLowerCase()
      const d = j.scheduled_date ? new Date(j.scheduled_date) : null
      const id = `#${String(j.id).slice(-4)}`
      if (status === "completed" || status === "complete" || status === "done") {
        out.push({
          kind: "completed",
          when: new Date(j.completed_at || j.end_time || j.updated_at || j.scheduled_date),
          text: `${j.service_name || "Job"} ${id} completed`,
        })
      } else if (status === "in_progress" || status === "in progress") {
        out.push({ kind: "started", when: d, text: `${j.service_name || "Job"} ${id} started` })
      }
    })
    invoices.forEach((inv) => {
      if ((inv.status || "").toLowerCase() === "paid") {
        out.push({
          kind: "paid",
          when: new Date(inv.updated_at || inv.created_at),
          text: `Invoice #${String(inv.id).slice(-4)} paid`,
        })
      }
    })
    return out
      .filter((e) => e.when && !isNaN(e.when))
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, 5)
  }, [jobs, invoices])

  const ICON_META = {
    completed: { icon: CheckCircle2, c: "var(--sf-green-dark)" },
    started:   { icon: Clock, c: "var(--sf-blue-dark)" },
    paid:      { icon: DollarSign, c: "var(--sf-green-dark)" },
  }

  if (events.length === 0) {
    return (
      <div className="text-[11.5px] text-[var(--sf-ink-3)] text-center py-3">
        No recent activity.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {events.map((e, i) => {
        const m = ICON_META[e.kind] || ICON_META.completed
        const Icon = m.icon
        return (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: `${m.c}1a`, color: m.c, border: `1px solid ${m.c}22` }}
            >
              <Icon size={11} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--sf-ink)] font-medium">{e.text}</div>
              <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-px">
                {e.when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Jobs tab ───────────────────────────────────────────────

const JOB_FILTERS = [
  { id: "all",       label: "All" },
  { id: "upcoming",  label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
]

const JobsTab = ({ jobs, stats, onJobClick, onNewJob }) => {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  // Search predicate shared by every section. useCallback keeps the
  // identity stable across renders so the downstream useMemos don't
  // thrash dependencies.
  const searchPred = useCallback(
    (j) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      const haystack = `${j.service_name || ""} ${String(j.id || "")} ${j.scheduled_date || ""}`.toLowerCase()
      return haystack.includes(q)
    },
    [search]
  )

  // Upcoming = future + today, not cancelled or completed. Sorted
  // ascending so the closest scheduled job is on top.
  const upcoming = useMemo(
    () =>
      jobs
        .filter(isUpcomingJob)
        .filter(searchPred)
        .sort((a, b) => jobDateStr(a).localeCompare(jobDateStr(b))),
    [jobs, searchPred]
  )

  // Past = completed (or older non-cancelled). Sorted descending so
  // the most recent appears first.
  const past = useMemo(
    () =>
      jobs
        .filter((j) => isCompletedJob(j) || (!isCancelledJob(j) && jobDateStr(j) < today()))
        .filter(searchPred)
        .sort((a, b) => jobDateStr(b).localeCompare(jobDateStr(a))),
    [jobs, searchPred]
  )

  // Cancelled — its own slice (chronological desc).
  const cancelled = useMemo(
    () =>
      jobs
        .filter(isCancelledJob)
        .filter(searchPred)
        .sort((a, b) => jobDateStr(b).localeCompare(jobDateStr(a))),
    [jobs, searchPred]
  )

  const upcomingValue = upcoming.reduce(
    (s, j) => s + parseFloat(j.total || j.service_price || 0),
    0
  )
  const hasRecurring = jobs.some((j) => j.is_recurring === true)
  const recurringJob = jobs.find((j) => j.is_recurring === true)

  const showUpcoming = filter === "all" || filter === "upcoming"
  const showPast = filter === "all" || filter === "completed"
  const showCancelled = filter === "cancelled"

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SfKPI label="Completed jobs" value={stats.completedCount} accent="var(--sf-blue)" sub="all-time" />
        <SfKPI label="Lifetime value" value={formatMoney(stats.ltv)} accent="var(--sf-green)" sub="earned revenue" />
        <SfKPI label="Avg job value" value={stats.avgJob > 0 ? formatMoney(stats.avgJob) : "—"} accent="var(--sf-purple)" sub="completed jobs" />
        <SfKPI label="Forecast" value={formatMoney(stats.upcomingValue)} accent="var(--sf-amber)" sub={`${stats.upcomingCount} upcoming`} />
        <SfKPI
          label="Next scheduled"
          value={stats.nextJob ? new Date(stats.nextJob.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
          accent="var(--sf-teal)"
          sub={stats.nextJob?.service_name || "—"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-2 rounded-[8px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] px-3 py-[6px]"
          style={{ width: 280, maxWidth: "100%" }}
        >
          <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this customer's jobs"
            className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[var(--sf-ink)]"
            style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
          />
        </div>
        {JOB_FILTERS.map((f) => (
          <SfFilterChip
            key={f.id}
            active={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </SfFilterChip>
        ))}
        <div className="flex-1" />
        <SfButton variant="primary" size="md" icon={Plus} onClick={onNewJob}>
          New job
        </SfButton>
      </div>

      {/* Recurring subscription banner — shows regardless of filter
          so the operator always knows this customer has a standing
          recurring job. */}
      {hasRecurring && recurringJob && (
        <SfCard
          padding={0}
          className="overflow-hidden"
          style={{ background: "linear-gradient(135deg, var(--sf-blue) 0%, var(--sf-purple) 100%)", color: "#fff" }}
        >
          <div className="flex items-center gap-3 p-4">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,.18)" }}
            >
              <RotateCw size={20} strokeWidth={2.2} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold">Recurring subscription</div>
              <div className="text-[12px] opacity-90 mt-0.5">
                {recurringJob.recurring_frequency || "Recurring"}
                {recurringJob.service_name ? ` · ${recurringJob.service_name}` : ""}
              </div>
            </div>
          </div>
        </SfCard>
      )}

      {/* Upcoming section — closest scheduled job on top */}
      {showUpcoming && (
        <SfCard padding={0}>
          <div
            className="px-4 py-3 flex items-center"
            style={{ background: "var(--sf-blue-soft)", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="text-[13px] font-semibold text-[var(--sf-blue-dark)]">
              Upcoming · {upcoming.length} job{upcoming.length === 1 ? "" : "s"}
            </div>
            <div className="flex-1" />
            {upcomingValue > 0 && (
              <div
                className="text-[12px] font-semibold text-[var(--sf-blue-dark)]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatMoney(upcomingValue)} forecast
              </div>
            )}
          </div>
          {upcoming.length === 0 ? (
            <EmptyRow
              icon={Briefcase}
              title="No upcoming jobs"
              subtitle="Schedule the next visit and it'll appear here."
            />
          ) : (
            upcoming.slice(0, 30).map((j, i) => (
              <JobMiniRow
                key={j.id}
                job={j}
                isLast={i === Math.min(29, upcoming.length - 1)}
                onClick={() => onJobClick(j.id)}
              />
            ))
          )}
        </SfCard>
      )}

      {/* Past section — most recent on top */}
      {showPast && (
        <SfCard padding={0}>
          <div className="px-4 py-3 flex items-center border-b border-[var(--sf-border-soft)]">
            <Archive size={14} className="text-[var(--sf-ink-3)] mr-2" />
            <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
              Past · {past.length} job{past.length === 1 ? "" : "s"}
            </div>
          </div>
          {past.length === 0 ? (
            <EmptyRow
              icon={Archive}
              title="No past jobs yet"
              subtitle="Completed jobs land here once the dispatcher closes them out."
            />
          ) : (
            past.slice(0, 30).map((j, i) => (
              <JobMiniRow
                key={j.id}
                job={j}
                isLast={i === Math.min(29, past.length - 1)}
                onClick={() => onJobClick(j.id)}
              />
            ))
          )}
        </SfCard>
      )}

      {/* Cancelled section */}
      {showCancelled && (
        <SfCard padding={0}>
          <div className="px-4 py-3 flex items-center border-b border-[var(--sf-border-soft)]">
            <Archive size={14} className="text-[var(--sf-red-dark)] mr-2" />
            <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
              Cancelled · {cancelled.length} job{cancelled.length === 1 ? "" : "s"}
            </div>
          </div>
          {cancelled.length === 0 ? (
            <EmptyRow icon={Archive} title="Nothing cancelled" subtitle="—" />
          ) : (
            cancelled.slice(0, 30).map((j, i) => (
              <JobMiniRow
                key={j.id}
                job={j}
                isLast={i === Math.min(29, cancelled.length - 1)}
                onClick={() => onJobClick(j.id)}
              />
            ))
          )}
        </SfCard>
      )}
    </div>
  )
}

// ── Invoices tab ───────────────────────────────────────────

const InvoicesTab = ({ invoices, jobs, onInvoiceClick }) => {
  const outstanding = useMemo(
    () =>
      invoices.filter((inv) => {
        const s = (inv.status || "").toLowerCase()
        return s !== "paid" && s !== "void" && s !== "refunded"
      }),
    [invoices]
  )
  const paid = useMemo(
    () => invoices.filter((inv) => (inv.status || "").toLowerCase() === "paid"),
    [invoices]
  )
  const outstandingTotal = outstanding.reduce(
    (s, inv) => s + parseFloat(inv.total_amount || inv.amount || 0),
    0
  )
  const paidTotal = paid.reduce(
    (s, inv) => s + parseFloat(inv.total_amount || inv.amount || 0),
    0
  )
  const avgInvoice = invoices.length
    ? (outstandingTotal + paidTotal) / invoices.length
    : 0
  const avgDaysToPay = useMemo(() => {
    const samples = paid
      .map((inv) => {
        const created = new Date(inv.created_at)
        const updated = new Date(inv.updated_at || inv.paid_at || inv.created_at)
        if (isNaN(created) || isNaN(updated)) return null
        return Math.max(0, Math.round((updated - created) / 86400000))
      })
      .filter((n) => n != null)
    if (!samples.length) return null
    return Math.round(samples.reduce((s, n) => s + n, 0) / samples.length)
  }, [paid])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SfKPI label="Outstanding" value={formatMoney(outstandingTotal)} accent="var(--sf-amber)" sub={`${outstanding.length} invoice${outstanding.length === 1 ? "" : "s"}`} />
        <SfKPI label="Paid all-time" value={formatMoney(paidTotal)} accent="var(--sf-green)" sub={`${paid.length} invoice${paid.length === 1 ? "" : "s"}`} />
        <SfKPI label="Avg invoice" value={avgInvoice > 0 ? formatMoney(avgInvoice) : "—"} accent="var(--sf-blue)" sub="per invoice" />
        <SfKPI label="Avg days to pay" value={avgDaysToPay != null ? `${avgDaysToPay}d` : "—"} accent="var(--sf-purple)" sub={paid.length ? `from ${paid.length} paid` : "—"} />
        <SfKPI label="Auto-pay" value="—" accent="var(--sf-teal)" sub="not yet wired" />
      </div>

      {/* Outstanding card */}
      <SfCard padding={0}>
        <div
          className="px-4 py-3 flex items-center"
          style={{ background: "var(--sf-amber-soft)", borderBottom: "1px solid var(--sf-border-soft)" }}
        >
          <Clock size={14} className="text-[var(--sf-amber-dark)] mr-2" />
          <div className="text-[13px] font-semibold text-[var(--sf-amber-dark)]">
            Outstanding · {outstanding.length} invoice{outstanding.length === 1 ? "" : "s"}
          </div>
          <div className="flex-1" />
          <div
            className="text-[12px] font-semibold text-[var(--sf-amber-dark)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatMoney(outstandingTotal)}
          </div>
        </div>
        <InvoiceTable invoices={outstanding} onInvoiceClick={onInvoiceClick} emptyText="Nothing outstanding." />
      </SfCard>

      {/* Paid card */}
      <SfCard padding={0}>
        <div className="px-4 py-3 flex items-center border-b border-[var(--sf-border-soft)]">
          <CheckCircle2 size={14} className="text-[var(--sf-green-dark)] mr-2" />
          <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
            Payment history · {paid.length} invoice{paid.length === 1 ? "" : "s"}
          </div>
          <div className="flex-1" />
          <SfButton variant="ghost" size="sm">Export</SfButton>
        </div>
        <InvoiceTable invoices={paid} onInvoiceClick={onInvoiceClick} emptyText="No paid invoices yet." />
      </SfCard>
    </div>
  )
}

const InvoiceTable = ({ invoices, onInvoiceClick, emptyText }) => {
  if (invoices.length === 0) {
    return <div className="py-8 text-center text-[12px] text-[var(--sf-ink-3)]">{emptyText}</div>
  }
  return (
    <div>
      <div
        className="hidden md:flex items-center gap-2 px-4 py-2"
        style={{
          background: "var(--sf-panel-alt)",
          borderBottom: "1px solid var(--sf-border-soft)",
          fontSize: 10.5,
          color: "var(--sf-ink-3)",
          fontWeight: 700,
          letterSpacing: ".05em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ width: 90 }}>Invoice</div>
        <div style={{ width: 70 }}>Job</div>
        <div style={{ width: 90 }}>Issued</div>
        <div style={{ width: 90 }}>Due</div>
        <div className="flex-1" />
        <div style={{ width: 90, textAlign: "right" }}>Amount</div>
        <div style={{ width: 110 }}>Status</div>
        <div style={{ width: 24 }} />
      </div>
      {invoices.slice(0, 30).map((inv, i, arr) => {
        const code = `INV-${String(inv.id).slice(-4)}`
        const jobCode = inv.job_id ? `#${String(inv.job_id).slice(-4)}` : "—"
        const issued = inv.created_at
          ? new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "—"
        const due = inv.due_date
          ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "—"
        const value = parseFloat(inv.total_amount || inv.amount || 0)
        const status = capitalize(inv.status)
        return (
          <button
            key={inv.id}
            onClick={() => onInvoiceClick?.(inv.id)}
            className="w-full text-left flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--sf-panel-alt)] transition-colors"
            style={{
              borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--sf-border-soft)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--sf-font-ui)",
            }}
          >
            <div
              style={{ width: 90, fontFamily: "var(--sf-font-mono)" }}
              className="text-[12.5px] font-semibold text-[var(--sf-ink)]"
            >
              {code}
            </div>
            <div
              style={{ width: 70, fontFamily: "var(--sf-font-mono)" }}
              className="text-[11.5px] text-[var(--sf-ink-3)]"
            >
              {jobCode}
            </div>
            <div style={{ width: 90 }} className="text-[11.5px] text-[var(--sf-ink-2)]">{issued}</div>
            <div style={{ width: 90 }} className="text-[11.5px] text-[var(--sf-ink-2)]">{due}</div>
            <div className="flex-1" />
            <div
              style={{ width: 90, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              className="text-[13px] font-semibold text-[var(--sf-ink)]"
            >
              {formatMoney(value)}
            </div>
            <div style={{ width: 110 }}>
              <SfStatusPill status={status} />
            </div>
            <span style={{ width: 24 }} className="text-[var(--sf-ink-3)] text-right">
              <MoreHorizontal size={14} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Utilities ──────────────────────────────────────────────

// Build an all-time revenue trend across the customer's whole
// lifetime. Buckets auto-adjust by total span:
//   <= 12 months → monthly
//   <= 36 months → quarterly
//   else         → yearly
// Always returns up to 12 bars so the layout stays readable.
const buildAllTimeTrend = (jobs, customer) => {
  const now = new Date()
  // Earliest signal: customer.created_at OR first job
  let earliest = customer?.created_at ? new Date(customer.created_at) : null
  jobs.forEach((j) => {
    const d = j.scheduled_date
    if (!d) return
    const dt = new Date(String(d).includes("T") ? d : String(d).replace(" ", "T"))
    if (!isNaN(dt) && (!earliest || dt < earliest)) earliest = dt
  })
  if (!earliest || isNaN(earliest)) {
    earliest = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  }

  const months = Math.max(
    1,
    (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()) +
      1
  )
  let interval, intervalLabel
  if (months <= 12) { interval = "month"; intervalLabel = "Monthly" }
  else if (months <= 36) { interval = "quarter"; intervalLabel = "Quarterly" }
  else { interval = "year"; intervalLabel = "Yearly" }

  const buckets = []
  if (interval === "month") {
    // Last `months` months ending this month
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        value: 0,
      })
    }
  } else if (interval === "quarter") {
    const startQ = Math.floor(earliest.getMonth() / 3)
    const startY = earliest.getFullYear()
    const endQ = Math.floor(now.getMonth() / 3)
    const endY = now.getFullYear()
    let y = startY, q = startQ
    while (y < endY || (y === endY && q <= endQ)) {
      buckets.push({
        key: `${y}-Q${q + 1}`,
        label: `Q${q + 1} '${String(y).slice(-2)}`,
        value: 0,
      })
      q += 1
      if (q > 3) { q = 0; y += 1 }
    }
  } else {
    // yearly
    for (let y = earliest.getFullYear(); y <= now.getFullYear(); y++) {
      buckets.push({ key: `${y}`, label: String(y), value: 0 })
    }
  }

  // Trend should reflect earned revenue (completed jobs only) so the
  // sum of bars reconciles with the customer's LTV. Upcoming /
  // scheduled work is captured separately by the Forecast KPI.
  const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]))
  jobs.forEach((j) => {
    if (!isCompletedJob(j)) return
    const d = j.completed_at || j.scheduled_date
    if (!d) return
    const dt = new Date(String(d).includes("T") ? d : String(d).replace(" ", "T"))
    if (isNaN(dt)) return
    let key
    if (interval === "month") {
      key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
    } else if (interval === "quarter") {
      key = `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`
    } else {
      key = `${dt.getFullYear()}`
    }
    const idx = bucketIndex.get(key)
    if (idx != null) {
      buckets[idx].value += parseFloat(j.total || j.service_price || 0)
    }
  })

  // Cap at 12 bars by trimming the oldest to keep the chart legible
  const trimmed = buckets.length > 12 ? buckets.slice(-12) : buckets
  const values = trimmed.map((b) => b.value)
  const labels = trimmed.map((b) => b.label)
  const recent = values[values.length - 1] || 0
  const prior = values[values.length - 2] || 0
  const deltaPct = prior > 0 ? ((recent - prior) / prior) * 100 : null
  return { values, labels, deltaPct, intervalLabel }
}

// ── Property derivation ────────────────────────────────────
// A customer's "properties" are the unique service addresses where
// they've had jobs (plus their primary billing address as a fallback).
// For each address, we pull spec fields from the most recent job at
// that address — zenbooker_intake holds the rich data (bedrooms,
// bathrooms, pets, sqft), while job.bedrooms / job.bathroom_count
// are the manual-entry fallback.

const deriveProperties = (customer, jobs) => {
  if (!customer) return []
  const byAddr = new Map()
  // Seed with the customer's primary address
  const primaryAddress = customer.address || ""
  const primaryKey = primaryAddress.trim().toLowerCase()
  if (primaryAddress) {
    byAddr.set(primaryKey, {
      address: primaryAddress,
      city: [customer.city, customer.state, customer.zip_code].filter(Boolean).join(", "),
      primary: true,
      lastJobDate: null,
      jobs: [],
      specs: {},
    })
  }
  jobs.forEach((j) => {
    const addr = (j.service_address || j.customer_address || "").trim()
    if (!addr) return
    const key = addr.toLowerCase()
    if (!byAddr.has(key)) {
      byAddr.set(key, {
        address: addr,
        city: [j.service_city || j.customer_city, j.service_state, j.service_zip].filter(Boolean).join(", "),
        primary: key === primaryKey,
        lastJobDate: null,
        jobs: [],
        specs: {},
      })
    }
    const p = byAddr.get(key)
    p.jobs.push(j)
    const d = j.scheduled_date
    if (d) {
      const dt = new Date(String(d).includes("T") ? d : String(d).replace(" ", "T"))
      if (!isNaN(dt) && (!p.lastJobDate || dt > p.lastJobDate)) {
        p.lastJobDate = dt
      }
    }
  })
  // Fill specs from the most recent job at each address
  byAddr.forEach((p) => {
    if (!p.jobs.length) return
    const recent = [...p.jobs].sort(
      (a, b) => new Date(b.scheduled_date || 0) - new Date(a.scheduled_date || 0)
    )[0]
    p.specs = extractSpecsFromJob(recent)
    p.lastService = recent.service_name
  })
  return Array.from(byAddr.values()).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0))
}

const extractSpecsFromJob = (job) => {
  const out = {
    type: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    pets: null,
    access: null,
  }
  // job.bedrooms / bathroom_count (manual SF jobs)
  if (job.bedrooms) out.bedrooms = String(job.bedrooms)
  if (job.bathroom_count) out.bathrooms = String(job.bathroom_count)
  // zenbooker_intake (ZB-sourced)
  if (Array.isArray(job.zenbooker_intake)) {
    job.zenbooker_intake.forEach((field) => {
      const name = (field.field_name || "").toLowerCase()
      const selected = Array.isArray(field.selected_options) && field.selected_options[0]
      const label = selected?.display_label || selected?.text || field.text_value
      if (!label) return
      if (name.includes("bedroom")) out.bedrooms = label.replace(/\s*bedrooms?$/i, "") || label
      else if (name.includes("bathroom")) out.bathrooms = label.replace(/\s*bathrooms?$/i, "") || label
      else if (name.includes("pet")) out.pets = label
      else if (name.includes("sq") || name.includes("size")) out.sqft = label
      else if (name.includes("type") || name.includes("property")) out.type = label
      else if (name.includes("access") || name.includes("entry")) out.access = label
    })
  }
  // Heuristics from notes
  const notes = String(job.notes || job.customer_notes || "")
  if (notes && !out.access) {
    if (/lockbox/i.test(notes)) out.access = "Lockbox"
    else if (/key/i.test(notes)) out.access = "Key"
    else if (/door\s*code|access\s*code/i.test(notes)) out.access = "Code"
  }
  return out
}

// ── Property card details (shared by Overview + Properties tab) ──

// Compact layout — header + 2-col spec grid only. Used in the
// Overview tab's right-rail Property card where space is tight.
const PropertyDetails = ({ property }) => {
  const specs = property.specs || {}
  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--sf-blue-soft)", color: "var(--sf-blue-dark)" }}
        >
          <Building size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">
              {property.address || "—"}
            </span>
            {property.primary && (
              <SfTag color="var(--sf-blue-dark)" bg="var(--sf-blue-soft)">Primary</SfTag>
            )}
          </div>
          {property.city && (
            <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5 truncate">
              {property.city}
            </div>
          )}
        </div>
      </div>
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4"
      >
        <PropertyField label="Type" value={specs.type || "—"} />
        <PropertyField label="Bedrooms" value={specs.bedrooms || "—"} />
        <PropertyField label="Bathrooms" value={specs.bathrooms || "—"} />
        <PropertyField label="Sqft" value={specs.sqft || "—"} />
        <PropertyField label="Pets" value={specs.pets || "—"} />
        <PropertyField label="Access" value={specs.access || "—"} />
      </div>
    </>
  )
}

const PropertyField = ({ label, value }) => (
  <div>
    <div
      className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
      style={{ letterSpacing: ".04em" }}
    >
      {label}
    </div>
    <div className="text-[12.5px] font-medium text-[var(--sf-ink)] mt-1">
      {value}
    </div>
  </div>
)

// Wide layout — Google Maps preview on the left, full details on the
// right. Used in the Properties tab. Includes the amber "Access &
// cleaning notes" callout when the most recent job has notes.
const PropertyWideCard = ({ property, customer }) => {
  const specs = property.specs || {}
  const apiKey = getGoogleMapsApiKey()
  const fullAddress = [property.address, property.city].filter(Boolean).join(", ")
  const completedJobs = property.jobs?.filter(isCompletedJob).length ?? 0
  const lastClean = property.lastJobDate
    ? property.lastJobDate.toDateString() === new Date().toDateString()
      ? "Today"
      : property.lastJobDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—"
  // Surface customer notes from the most recent job at this address
  const recentJobNotes = (property.jobs?.[0]?.notes || property.jobs?.[0]?.customer_notes || "").trim()

  // RentCast property data lookup (server-side /api/zillow/property).
  // The endpoint returns null when the API key isn't configured or the
  // property can't be matched, so we fall through silently in those
  // cases instead of surfacing an error. Recent job intake still wins
  // for fields that are present in `specs` — RentCast just fills the
  // gaps and adds extras (year built, lot size, est. value, last sale).
  const [propData, setPropData] = useState(null)
  const [propLoading, setPropLoading] = useState(false)
  useEffect(() => {
    if (!property.address) return
    let cancelled = false
    setPropLoading(true)
    setPropData(null)
    // Parse "City, State, Zip" out of the property.city composite,
    // preferring fields off the customer record when they're cleaner.
    const cityParts = String(property.city || "").split(",").map((s) => s.trim()).filter(Boolean)
    const city = customer?.city || cityParts[0] || ""
    const state = customer?.state || cityParts[1] || ""
    const zipCode = customer?.zip_code || customer?.zip || cityParts[2] || ""
    propertyDataAPI
      .lookup({
        address: fullAddress || property.address,
        street: property.address,
        city,
        state,
        zipCode,
      })
      .then((d) => { if (!cancelled) setPropData(d || null) })
      .catch(() => { if (!cancelled) setPropData(null) })
      .finally(() => { if (!cancelled) setPropLoading(false) })
    return () => { cancelled = true }
  }, [property.address, property.city, customer?.city, customer?.state, customer?.zip_code, customer?.zip, fullAddress])

  // Merged display values — specs (customer intake) wins, RentCast
  // backfills the rest. Keeps the existing 5-col grid populated even
  // for customers who haven't filled in their intake form yet.
  const display = {
    bedrooms: specs.bedrooms || propData?.bedrooms || "",
    bathrooms: specs.bathrooms || propData?.bathrooms || "",
    sqft: specs.sqft || propData?.squareFeet || "",
    type: specs.type || propData?.propertyType || "",
  }
  const fmtMoney = (n) => {
    const v = Number(n)
    if (!Number.isFinite(v) || v <= 0) return null
    return `$${Math.round(v).toLocaleString()}`
  }
  const fmtSale = (d) => {
    if (!d) return null
    const dt = new Date(d)
    if (isNaN(dt)) return null
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  const lotSize = (() => {
    if (!propData) return null
    if (propData.lotSizeAcres) return `${propData.lotSizeAcres} ac`
    if (propData.lotSize) {
      const v = Number(propData.lotSize)
      if (Number.isFinite(v)) return v >= 1000 ? `${v.toLocaleString()} sqft` : `${v} ac`
    }
    return null
  })()
  const hasPropData = propData && (
    propData.yearBuilt ||
    propData.estimatedValue ||
    propData.estimatedRent ||
    propData.lastSalePrice ||
    propData.lastSaleDate ||
    lotSize
  )
  return (
    <SfCard padding={0}>
      <div className="flex flex-col md:flex-row">
        {/* Map preview — full width on mobile, fixed 280px column on
            md+ so the property details don't get pushed off the right
            edge. The map should be a thumbnail, not the focal point. */}
        <div
          className="flex-shrink-0 w-full md:w-[280px] h-[180px] md:h-auto md:min-h-[220px] border-b md:border-b-0 md:border-r border-[var(--sf-border-soft)]"
          style={{
            background: "var(--sf-panel-soft)",
            position: "relative",
          }}
        >
          {fullAddress && apiKey ? (
            <iframe
              title={`Map of ${fullAddress}`}
              width="100%"
              height="100%"
              style={{ border: 0, display: "block" }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(fullAddress)}&zoom=15`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[11.5px] text-[var(--sf-ink-3)]">
              No address on file
            </div>
          )}
        </div>
        {/* Details */}
        <div className="flex-1 p-4 sm:p-5 min-w-0">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[15px] font-bold text-[var(--sf-ink)] truncate">
                  {property.address || "—"}
                </span>
                {property.primary && (
                  <SfTag color="var(--sf-ink-2)" bg="var(--sf-panel-soft)">Home</SfTag>
                )}
                {property.primary && (
                  <SfTag color="var(--sf-blue-dark)" bg="var(--sf-blue-soft)">Primary</SfTag>
                )}
                {property.jobs?.some((j) => j.is_recurring === true) && (
                  <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">↻ Recurring</SfTag>
                )}
              </div>
              {property.city && (
                <div
                  className="text-[12px] text-[var(--sf-ink-3)] mt-0.5 inline-flex items-center gap-1"
                >
                  <MapPin size={11} className="text-[var(--sf-ink-3)]" /> {property.city}
                </div>
              )}
            </div>
            <button
              className="text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] transition-colors"
              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
              aria-label="Property actions"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>

          {/* Tri-stat row */}
          <div
            className="grid grid-cols-3 gap-4 mt-3 pb-3"
            style={{ borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <Stat label="Jobs done" value={completedJobs} />
            <Stat label="Last clean" value={lastClean} />
            <Stat label="Type" value={display.type || "—"} />
          </div>

          {/* Wider 5-col spec grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-3">
            <PropertyField label="Bedrooms" value={display.bedrooms || "—"} />
            <PropertyField label="Bathrooms" value={display.bathrooms || "—"} />
            <PropertyField label="Sqft" value={display.sqft ? Number(display.sqft).toLocaleString() : "—"} />
            <PropertyField label="Pets" value={specs.pets || "—"} />
            <PropertyField label="Access" value={specs.access || "—"} />
          </div>

          {/* Property data (RentCast) — extra fields the customer
              intake doesn't capture. Only renders if the lookup
              returned something we can show. */}
          {(propLoading || hasPropData) && (
            <div
              className="mt-4 pt-3"
              style={{ borderTop: "1px dashed var(--sf-border-soft)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
                  style={{ letterSpacing: ".04em" }}
                >
                  Property data
                </span>
                <span className="text-[10px] text-[var(--sf-ink-4)]">via RentCast</span>
                {propLoading && (
                  <span className="text-[10px] text-[var(--sf-ink-3)] italic">loading…</span>
                )}
              </div>
              {hasPropData && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <PropertyField label="Year built" value={propData.yearBuilt || "—"} />
                  <PropertyField label="Lot size" value={lotSize || "—"} />
                  <PropertyField
                    label="Est. value"
                    value={fmtMoney(propData.estimatedValue) || "—"}
                  />
                  <PropertyField
                    label="Est. rent"
                    value={fmtMoney(propData.estimatedRent) || "—"}
                  />
                  <PropertyField
                    label="Last sale"
                    value={
                      fmtSale(propData.lastSaleDate) ||
                      fmtMoney(propData.lastSalePrice) ||
                      "—"
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Access & cleaning notes callout */}
          {recentJobNotes && (
            <div
              className="mt-4 p-3 rounded-lg"
              style={{
                background: "var(--sf-amber-soft)",
                borderLeft: "3px solid var(--sf-amber)",
              }}
            >
              <div
                className="text-[10.5px] font-bold uppercase text-[var(--sf-amber-dark)]"
                style={{ letterSpacing: ".04em" }}
              >
                Access &amp; cleaning notes
              </div>
              <div className="text-[12px] text-[var(--sf-ink-2)] mt-1 leading-snug whitespace-pre-wrap">
                {recentJobNotes}
              </div>
            </div>
          )}
        </div>
      </div>
    </SfCard>
  )
}

// ── Properties tab ─────────────────────────────────────────

const PropertiesTab = ({ properties, customer }) => {
  if (!properties.length) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-2xl">
        <SfCard>
          <EmptyRow icon={Building} title="No properties yet" subtitle="Once jobs are scheduled, the service addresses will show up here." />
        </SfCard>
      </div>
    )
  }
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {properties.map((p, i) => (
        <PropertyWideCard
          key={`${p.address}-${i}`}
          property={p}
          customer={customer}
        />
      ))}
    </div>
  )
}

// ── Estimates tab ──────────────────────────────────────────

// Status taxonomy. The backend stores raw statuses pending/sent/
// accepted/rejected; the spec calls them Pending / Accepted /
// Declined. Anything sent-but-not-decided counts as Pending so the
// chips don't look empty when most estimates are still open.
const ESTIMATE_STATUS_META = {
  accepted: { label: "Accepted", color: "var(--sf-green-dark)",  bg: "var(--sf-green-soft)" },
  pending:  { label: "Pending",  color: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)" },
  sent:     { label: "Sent",     color: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)" },
  rejected: { label: "Declined", color: "var(--sf-red-dark)",   bg: "var(--sf-red-soft)" },
  draft:    { label: "Draft",    color: "var(--sf-ink-2)",       bg: "var(--sf-panel-soft)" },
}

const estimateBucket = (status) => {
  const s = String(status || "").toLowerCase()
  if (s === "accepted") return "accepted"
  if (s === "rejected" || s === "declined") return "declined"
  if (s === "pending" || s === "sent" || s === "viewed" || s === "draft" || !s) return "pending"
  return "pending"
}

const ESTIMATE_FILTERS = [
  { id: "all",       label: "All" },
  { id: "accepted",  label: "Accepted" },
  { id: "pending",   label: "Pending" },
  { id: "declined",  label: "Declined" },
]

const EstimatesTab = ({ estimates, customerName }) => {
  const navigate = useNavigate()
  const [filter, setFilter] = useState("all")

  // KPIs — sent count, accept rate, total accepted value, avg time-to-decide
  const kpis = useMemo(() => {
    const total = estimates.length
    let accepted = 0
    let declined = 0
    let acceptedValue = 0
    const decisionDays = []
    estimates.forEach((e) => {
      const bucket = estimateBucket(e.status)
      if (bucket === "accepted") {
        accepted += 1
        acceptedValue += parseFloat(e.total_amount || e.total || 0) || 0
      } else if (bucket === "declined") {
        declined += 1
      }
      // Time-to-decide: prefer explicit decided_at / accepted_at /
      // rejected_at; otherwise updated_at when status is final.
      const sentAt = e.sent_at || e.created_at
      const decidedAt =
        e.decided_at ||
        e.accepted_at ||
        e.rejected_at ||
        (bucket === "accepted" || bucket === "declined" ? e.updated_at : null)
      if (sentAt && decidedAt) {
        const ms = new Date(decidedAt).getTime() - new Date(sentAt).getTime()
        if (Number.isFinite(ms) && ms > 0) decisionDays.push(ms / 86400000)
      }
    })
    const decided = accepted + declined
    const acceptRate = decided ? Math.round((accepted / decided) * 100) : null
    const avgDecide = decisionDays.length
      ? decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length
      : null
    return { total, accepted, declined, acceptedValue, acceptRate, avgDecide }
  }, [estimates])

  // Filter chips with counts
  const counts = useMemo(() => {
    let accepted = 0, pending = 0, declined = 0
    estimates.forEach((e) => {
      const b = estimateBucket(e.status)
      if (b === "accepted") accepted += 1
      else if (b === "declined") declined += 1
      else pending += 1
    })
    return { all: estimates.length, accepted, pending, declined }
  }, [estimates])

  const filtered = useMemo(() => {
    if (filter === "all") return estimates
    return estimates.filter((e) => estimateBucket(e.status) === filter)
  }, [estimates, filter])

  if (estimates.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <SfCard>
          <EmptyRow
            icon={FileText}
            title="No estimates yet"
            subtitle="Estimates you send to this customer will show up here with sent / viewed / decision history."
          />
        </SfCard>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {/* 4 KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SfKPI
          label="Estimates sent"
          value={kpis.total}
          accent="var(--sf-blue)"
          sub={`${kpis.accepted} accepted · ${kpis.declined} declined`}
        />
        <SfKPI
          label="Accept rate"
          value={kpis.acceptRate != null ? `${kpis.acceptRate}%` : "—"}
          accent="var(--sf-green)"
          sub={kpis.acceptRate != null ? `${kpis.accepted}/${kpis.accepted + kpis.declined} decided` : "no decisions yet"}
        />
        <SfKPI
          label="Total value"
          value={`$${Math.round(kpis.acceptedValue).toLocaleString()}`}
          accent="var(--sf-purple)"
          sub="from accepted"
        />
        <SfKPI
          label="Avg time to decide"
          value={kpis.avgDecide != null ? `${kpis.avgDecide.toFixed(1)}d` : "—"}
          accent="var(--sf-amber)"
          sub={kpis.avgDecide != null ? "sent → decided" : "needs decided estimates"}
        />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ESTIMATE_FILTERS.map((f) => (
          <SfFilterChip
            key={f.id}
            active={filter === f.id}
            count={counts[f.id]}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </SfFilterChip>
        ))}
      </div>

      {/* Estimate cards */}
      {filtered.length === 0 ? (
        <SfCard>
          <EmptyRow
            icon={FileText}
            title="No estimates in this view"
            subtitle="Try a different filter."
          />
        </SfCard>
      ) : (
        filtered.map((e) => (
          <EstimateCard
            key={e.id}
            estimate={e}
            customerName={customerName}
            onView={() => navigate(`/estimates/${e.id}`)}
            onJob={() =>
              navigate(
                e.job_id
                  ? `/job-details/${e.job_id}`
                  : `/createjob?customerId=${e.customer_id}&estimateId=${e.id}`
              )
            }
          />
        ))
      )}
    </div>
  )
}

const EstimateCard = ({ estimate, customerName, onView, onJob }) => {
  const bucket = estimateBucket(estimate.status)
  const statusMeta = ESTIMATE_STATUS_META[bucket] || ESTIMATE_STATUS_META.pending
  const code = `EST-${String(estimate.id).padStart(4, "0")}`
  const value = parseFloat(estimate.total_amount || estimate.total || 0) || 0
  const items =
    Array.isArray(estimate.line_items)
      ? estimate.line_items
      : Array.isArray(estimate.items)
      ? estimate.items
      : []
  const itemsCount = items.length
  const service =
    estimate.service_name ||
    estimate.service?.name ||
    items[0]?.description ||
    items[0]?.name ||
    "—"
  const issuedRaw = estimate.sent_at || estimate.created_at
  const issued = issuedRaw
    ? new Date(issuedRaw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—"
  const expiry = estimate.valid_until || estimate.expires_at
  const expired = expiry && new Date(expiry).getTime() < Date.now()
  const expiryLabel = expiry
    ? new Date(expiry).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null

  // Timeline footer events
  const sentAt = estimate.sent_at || estimate.created_at
  const viewedAt = estimate.viewed_at
  const viewCount = estimate.view_count || estimate.viewed_count
  const acceptedAt = estimate.accepted_at || (bucket === "accepted" ? estimate.updated_at : null)
  const declinedAt = estimate.rejected_at || estimate.declined_at || (bucket === "declined" ? estimate.updated_at : null)
  const declineReason = estimate.decline_reason || estimate.rejection_reason

  const fmtDay = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null

  return (
    <SfCard padding={0}>
      {/* Header row */}
      <div className="flex items-start gap-3 p-4 flex-wrap">
        <div
          className="w-[38px] h-[38px] rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--sf-purple-soft)", color: "var(--sf-purple)" }}
        >
          <Paperclip size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[13.5px] font-bold text-[var(--sf-ink)]"
              style={{ fontFamily: "var(--sf-font-mono)" }}
            >
              {code}
            </span>
            <SfTag color={statusMeta.color} bg={statusMeta.bg}>
              {statusMeta.label}
            </SfTag>
            {expired && bucket !== "accepted" && (
              <SfTag color="var(--sf-red-dark)" bg="var(--sf-red-soft)">
                Expired
              </SfTag>
            )}
          </div>
          <div className="text-[12px] text-[var(--sf-ink-2)] mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-[var(--sf-ink)]">{service}</span>
            {itemsCount > 0 && (
              <>
                <span className="text-[var(--sf-ink-4)]">·</span>
                <span>{itemsCount} item{itemsCount === 1 ? "" : "s"}</span>
              </>
            )}
            <span className="text-[var(--sf-ink-4)]">·</span>
            <span>Issued {issued}</span>
            {expiryLabel && (
              <>
                <span className="text-[var(--sf-ink-4)]">·</span>
                <span style={{ color: expired ? "var(--sf-red-dark)" : "inherit" }}>
                  {expired ? "Expired" : "Expires"} {expiryLabel}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="text-[20px] font-bold text-[var(--sf-ink)] leading-none"
            style={{
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-1">incl. tax</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SfButton variant="secondary" size="sm" onClick={onView}>
            View
          </SfButton>
          <SfButton variant="ghost" size="sm" onClick={onJob}>
            {estimate.job_id ? "Job" : "New job"}
          </SfButton>
          <button
            aria-label="More actions"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--sf-ink-3)] hover:bg-[var(--sf-panel-soft)] transition-colors"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* Timeline footer */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
        style={{
          background: "var(--sf-panel-alt)",
          borderTop: "1px solid var(--sf-border-soft)",
          borderRadius: "0 0 10px 10px",
          fontSize: 11.5,
          color: "var(--sf-ink-2)",
          fontFamily: "var(--sf-font-ui)",
        }}
      >
        <TimelineDot color="var(--sf-blue)" />
        <span>
          <b style={{ color: "var(--sf-ink)" }}>Sent</b>
          {sentAt && ` · ${fmtDay(sentAt)}`}
        </span>
        <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
        <TimelineDot color={viewedAt ? "var(--sf-amber)" : "var(--sf-ink-4)"} />
        <span style={{ color: viewedAt ? "var(--sf-ink-2)" : "var(--sf-ink-3)" }}>
          <b style={{ color: viewedAt ? "var(--sf-ink)" : "var(--sf-ink-3)" }}>Viewed</b>
          {viewCount ? ` · ${viewCount}×` : viewedAt ? ` · ${fmtDay(viewedAt)}` : ""}
        </span>
        <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
        {bucket === "accepted" ? (
          <>
            <TimelineDot color="var(--sf-green)" />
            <span>
              <b style={{ color: "var(--sf-ink)" }}>Accepted</b>
              {acceptedAt && ` · ${fmtDay(acceptedAt)}`}
            </span>
          </>
        ) : bucket === "declined" ? (
          <>
            <TimelineDot color="var(--sf-red)" />
            <span>
              <b style={{ color: "var(--sf-ink)" }}>Declined</b>
              {declinedAt && ` · ${fmtDay(declinedAt)}`}
            </span>
            {declineReason && (
              <span
                className="italic text-[var(--sf-ink-3)] ml-1"
                style={{ fontSize: 11 }}
              >
                "{declineReason}"
              </span>
            )}
          </>
        ) : (
          <>
            <TimelineDot color="var(--sf-ink-4)" />
            <span className="text-[var(--sf-ink-3)]">
              Awaiting decision{customerName ? ` from ${customerName.split(" ")[0]}` : ""}
            </span>
          </>
        )}
      </div>
    </SfCard>
  )
}

const TimelineDot = ({ color }) => (
  <span
    className="inline-block rounded-full flex-shrink-0"
    style={{ width: 6, height: 6, background: color }}
  />
)

// ── Files tab ──────────────────────────────────────────────

const FILE_FILTERS = [
  { id: "all",       label: "All" },
  { id: "photos",    label: "Photos" },
  { id: "documents", label: "Documents" },
]

const isImageMime = (mime) => String(mime || "").toLowerCase().startsWith("image/")

const formatFileSize = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return "—"
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

const FilesTab = ({ customerId }) => {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const inputRef = useRef(null)

  const reload = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const resp = await customerFilesAPI.list(customerId)
      setFiles(Array.isArray(resp?.files) ? resp.files : [])
    } catch (e) {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { reload() }, [reload])

  const handleUpload = useCallback(async (fileList) => {
    const list = Array.from(fileList || [])
    if (list.length === 0) return
    setUploading(true)
    try {
      await customerFilesAPI.upload(customerId, list)
      await reload()
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Upload failed.")
    } finally {
      setUploading(false)
    }
  }, [customerId, reload])

  const onDelete = useCallback(async (fileId) => {
    if (!window.confirm("Delete this file?")) return
    try {
      await customerFilesAPI.remove(customerId, fileId)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Delete failed.")
    }
  }, [customerId])

  const onDownloadAll = useCallback(() => {
    // The bucket is public so the URL works directly. Open each in a
    // new tab; the browser handles the rest. For lots of files we'd
    // zip server-side, but this matches the spec's lightweight intent.
    files.forEach((f) => {
      if (f.file_url) window.open(f.file_url, "_blank", "noopener,noreferrer")
    })
  }, [files])

  // Filter chip counts
  const counts = useMemo(() => {
    let photos = 0, documents = 0
    files.forEach((f) => {
      if (isImageMime(f.mime_type)) photos += 1
      else documents += 1
    })
    return { all: files.length, photos, documents }
  }, [files])

  // Apply search + filter
  const filtered = useMemo(() => {
    let list = files
    if (filter === "photos") list = list.filter((f) => isImageMime(f.mime_type))
    else if (filter === "documents") list = list.filter((f) => !isImageMime(f.mime_type))
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((f) => (f.filename || "").toLowerCase().includes(q))
    return list
  }, [files, filter, search])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-2 rounded-[8px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] px-3 py-[6px]"
          style={{ width: 320, maxWidth: "100%" }}
        >
          <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filenames"
            className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[var(--sf-ink)]"
            style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
          />
        </div>
        {FILE_FILTERS.map((f) => (
          <SfFilterChip
            key={f.id}
            active={filter === f.id}
            count={counts[f.id]}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </SfFilterChip>
        ))}
        <div className="flex-1" />
        <SfButton
          variant="secondary"
          size="md"
          icon={Download}
          onClick={onDownloadAll}
          disabled={files.length === 0}
        >
          Download all
        </SfButton>
        <SfButton
          variant="primary"
          size="md"
          icon={Upload}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Upload"}
        </SfButton>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleUpload(e.target.files)
            // Reset so picking the same file again re-fires onChange
            if (e.target) e.target.value = ""
          }}
        />
      </div>

      {/* Drop zone */}
      <DropZone onFiles={handleUpload} disabled={uploading} />

      {/* File grid */}
      {loading ? (
        <SfCard>
          <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
            Loading files…
          </div>
        </SfCard>
      ) : filtered.length === 0 ? (
        <SfCard>
          <EmptyRow
            icon={files.length === 0 ? Upload : SearchIcon}
            title={files.length === 0 ? "No files yet" : "No files match"}
            subtitle={
              files.length === 0
                ? "Drop photos or documents above, or click Upload."
                : "Try a different filter or clear the search."
            }
          />
        </SfCard>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {filtered.map((f) => (
            <FileCard key={f.id} file={f} onDelete={() => onDelete(f.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

const DropZone = ({ onFiles, disabled }) => {
  const [over, setOver] = useState(false)
  const onDrop = (e) => {
    e.preventDefault()
    setOver(false)
    if (disabled) return
    onFiles?.(e.dataTransfer.files)
  }
  const inputRef = useRef(null)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className="rounded-[12px] flex flex-col items-center justify-center gap-2 transition-colors"
      style={{
        padding: "28px 20px",
        background: over ? "var(--sf-blue-soft)" : "var(--sf-panel)",
        border: `2px dashed ${over ? "var(--sf-blue)" : "var(--sf-border-soft)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <div
        className="w-[42px] h-[42px] rounded-md flex items-center justify-center"
        style={{ background: "var(--sf-blue-soft)", color: "var(--sf-blue-dark)" }}
      >
        <Upload size={20} />
      </div>
      <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
        Drop files here, or click to browse
      </div>
      <div className="text-[11.5px] text-[var(--sf-ink-3)]">
        Up to 10 files · 10 MB each · images / PDFs / spreadsheets
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles?.(e.target.files)
          if (e.target) e.target.value = ""
        }}
      />
    </div>
  )
}

const FileCard = ({ file, onDelete }) => {
  const isImage = isImageMime(file.mime_type)
  const date = file.uploaded_at
    ? new Date(file.uploaded_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—"
  const ext = (() => {
    const parts = String(file.filename || "").split(".")
    return parts.length > 1 ? parts.pop().toUpperCase().slice(0, 5) : "FILE"
  })()
  const onOpen = () => {
    if (file.file_url) window.open(file.file_url, "_blank", "noopener,noreferrer")
  }
  return (
    <SfCard padding={0} className="relative group" style={{ overflow: "hidden" }}>
      <div
        onClick={onOpen}
        style={{ cursor: file.file_url ? "pointer" : "default" }}
      >
        {/* Preview */}
        {isImage ? (
          <div
            style={{
              height: 140,
              background: "var(--sf-panel-soft)",
              position: "relative",
            }}
          >
            <img
              src={file.file_url}
              alt={file.filename}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                background: "rgba(15,23,42,.85)",
                color: "#fff",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              Photo
            </span>
            {file.job_id && (
              <span
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  background: "rgba(255,255,255,.94)",
                  color: "var(--sf-ink-2)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontFamily: "var(--sf-font-mono)",
                }}
              >
                JOB-{file.job_id}
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              height: 140,
              background: "var(--sf-panel-alt)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 50,
                height: 60,
                background: "var(--sf-panel)",
                border: "1px solid var(--sf-border-soft)",
                borderRadius: 4,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 6,
                boxShadow: "0 1px 2px rgba(15,23,42,.05)",
              }}
            >
              {/* Corner fold */}
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  borderTop: "12px solid var(--sf-panel-alt)",
                  borderLeft: "12px solid transparent",
                }}
              />
              <FileIcon size={18} className="text-[var(--sf-ink-3)] absolute top-2 left-2" />
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: "var(--sf-ink-2)",
                  fontFamily: "var(--sf-font-mono)",
                }}
              >
                {ext}
              </span>
            </div>
          </div>
        )}
        {/* Footer */}
        <div className="px-3 py-2.5">
          <div
            className="text-[12.5px] font-semibold text-[var(--sf-ink)] truncate"
            title={file.filename}
          >
            {file.filename || "Untitled"}
          </div>
          <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5 flex items-center gap-1.5">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatFileSize(file.size_bytes)}
            </span>
            <span className="text-[var(--sf-ink-4)]">·</span>
            <span>{date}</span>
          </div>
        </div>
      </div>
      {/* Delete on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete?.() }}
        aria-label="Delete file"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          width: 26,
          height: 26,
          borderRadius: 6,
          background: "rgba(15,23,42,.85)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Trash2 size={13} />
      </button>
    </SfCard>
  )
}

// ── Messages tab ───────────────────────────────────────────

// Channel catalog used by the Messages tab — kept in sync with the
// inbox channel catalog so filters and compose toggles match across
// the two surfaces.
const MSG_CHANNEL_META = {
  sms:       { label: "SMS",       c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)",  icon: MessageSquare },
  whatsapp:  { label: "WhatsApp",  c: "#15803D",              bg: "#DCFCE7",                icon: MessageSquare },
  email:     { label: "Email",     c: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)",   icon: MailIcon },
  review:    { label: "Reviews",   c: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)",  icon: Star },
  thumbtack: { label: "Thumbtack", c: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)",   icon: Briefcase },
  yelp:      { label: "Yelp",      c: "#9F1A0A",              bg: "var(--sf-amber-soft)",  icon: Star },
  call:      { label: "Call",      c: "var(--sf-purple)",     bg: "var(--sf-purple-soft)", icon: PhoneIcon },
  openphone: { label: "SMS",       c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)",  icon: MessageSquare },
}

// Channels the user can actively send on from the customer page.
// Reviews and Calls are read-only here (you can't compose a Yelp
// review reply or place a call from this surface yet) so they're
// excluded. Order matters — drives display order.
const COMPOSE_CHANNELS = ["sms", "whatsapp", "email", "thumbtack", "yelp"]

const MessagesTab = ({ conversations, eventsByConv = {}, customer, customerName, onOpen }) => {
  // Flatten every loaded event into a single descending list with
  // the conversation id stitched on so we can route Send / Reply.
  const allEvents = useMemo(() => {
    const out = []
    conversations.forEach((c) => {
      const evs = eventsByConv[c.id]
      if (!Array.isArray(evs)) return
      evs.forEach((e) => {
        const t = e.type || ""
        if (!t.startsWith("message_") && t !== "review_in" && !t.startsWith("call_")) return
        out.push({
          ...e,
          conversationId: c.id,
          // Fall back to the conversation's channel when the event
          // didn't carry one (older rows).
          channel: (e.channel || c.channel || "").toLowerCase(),
        })
      })
    })
    out.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    return out
  }, [conversations, eventsByConv])

  // Channels the customer can be reached on. Anything the business has
  // a thread on counts; plus SMS/WhatsApp if we have their phone, and
  // Email if we have their email. Reviews are excluded from compose.
  const availableChannels = useMemo(() => {
    const set = new Set()
    conversations.forEach((c) => {
      const ch = (c.channel || "").toLowerCase()
      if (ch && COMPOSE_CHANNELS.includes(ch)) set.add(ch)
    })
    if (customer?.phone) {
      set.add("sms")
      set.add("whatsapp")
    }
    if (customer?.email) set.add("email")
    // Render in the canonical order so it's stable across customers.
    return COMPOSE_CHANNELS.filter((ch) => set.has(ch))
  }, [conversations, customer?.phone, customer?.email])

  const [composeChannel, setComposeChannel] = useState(() => availableChannels[0] || "sms")
  useEffect(() => {
    if (!availableChannels.includes(composeChannel)) {
      setComposeChannel(availableChannels[0] || "sms")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableChannels.join(",")])
  const [composeText, setComposeText] = useState("")
  const [sending, setSending] = useState(false)
  const [filter, setFilter] = useState("all")

  // Pick the conversation matching the chosen compose channel so the
  // Send button hits the right thread. Falls back to the first
  // conversation if no exact channel match.
  const primaryConv = useMemo(() => {
    const exact = conversations.find((c) => (c.channel || "").toLowerCase() === composeChannel)
    return exact || conversations[0] || null
  }, [conversations, composeChannel])

  const onSend = async () => {
    if (!composeText.trim()) return
    if (!primaryConv?.id) {
      alert(
        `No ${composeChannel.toUpperCase()} thread exists for this customer yet. New-thread creation lands with the inbox admin tooling — for now open the customer in /communications.`
      )
      return
    }
    setSending(true)
    try {
      await communicationsAPI.sendMessage(primaryConv.id, {
        text: composeText.trim(),
        channel: composeChannel,
      })
      setComposeText("")
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Could not send the message.")
    } finally {
      setSending(false)
    }
  }

  // KPI aggregations off the flat event list (so a 100-message SMS
  // thread reads "100" not "1").
  const kpis = useMemo(() => {
    let total = 0
    let reviews = 0
    const channelCounts = {}
    allEvents.forEach((e) => {
      const t = e.type || ""
      if (t.startsWith("message_") || t === "review_in") {
        total += 1
        const k = (e.channel || "").toLowerCase()
        channelCounts[k] = (channelCounts[k] || 0) + 1
        if (k === "review" || k === "yelp" || t === "review_in") reviews += 1
      }
    })
    const unread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0)
    let preferred = "—"
    let max = 0
    Object.entries(channelCounts).forEach(([k, n]) => {
      if (n > max) { max = n; preferred = k }
    })
    const preferredMeta = MSG_CHANNEL_META[preferred] || null
    return {
      total: total || conversations.length,
      threads: conversations.length,
      unread,
      reviews,
      preferred: preferredMeta ? preferredMeta.label : "—",
      preferredCount: max,
      preferredKey: preferred,
      responseTime: null,
      autoSent: null,
    }
  }, [allEvents, conversations])

  // Channel filter chips — reflect channels that actually appear in
  // the loaded event list (so the customer sees their real channels,
  // not an empty filter).
  const filterChips = useMemo(() => {
    const counts = {}
    allEvents.forEach((e) => {
      const k = (e.channel || "").toLowerCase()
      if (k) counts[k] = (counts[k] || 0) + 1
    })
    const chips = [{ id: "all", label: "All", count: allEvents.length }]
    Object.entries(counts).forEach(([ch, n]) => {
      const meta = MSG_CHANNEL_META[ch]
      if (!meta) return
      chips.push({ id: ch, label: meta.label, count: n })
    })
    return chips
  }, [allEvents])

  const filteredEvents = useMemo(() => {
    if (filter === "all") return allEvents
    return allEvents.filter((e) => (e.channel || "").toLowerCase() === filter)
  }, [allEvents, filter])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-4">
      {/* Top row: compose (left) + KPI grid (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
        {/* Compose */}
        <SfCard>
          <div className="mb-2">
            <div className="text-[13px] font-semibold text-[var(--sf-ink)]">Send message</div>
            <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
              To {customerName || "this customer"}
            </div>
          </div>

          {/* Channel toggle — every channel the customer is reachable
              on. Flex-wraps so 5+ channels still lay out cleanly. */}
          <div className="flex flex-wrap gap-2 mb-2.5">
            {availableChannels.map((ch) => {
              const meta = MSG_CHANNEL_META[ch]
              if (!meta) return null
              const Icon = meta.icon
              const on = composeChannel === ch
              return (
                <button
                  key={ch}
                  onClick={() => setComposeChannel(ch)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md"
                  style={{
                    background: on ? "var(--sf-blue-soft)" : "var(--sf-panel)",
                    border: "1.5px solid " + (on ? "var(--sf-blue)" : "var(--sf-border-soft)"),
                    cursor: "pointer",
                    fontFamily: "var(--sf-font-ui)",
                  }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: "1.5px solid " + (on ? "var(--sf-blue)" : "var(--sf-ink-4)"),
                      background: on ? "var(--sf-blue)" : "#fff",
                    }}
                  >
                    {on && (
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          background: "#fff",
                        }}
                      />
                    )}
                  </span>
                  <Icon size={13} color={on ? "var(--sf-blue-dark)" : meta.c} />
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: on ? "var(--sf-blue-dark)" : "var(--sf-ink-2)" }}
                  >
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>

          <textarea
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            placeholder="Type a message…"
            rows={4}
            className="w-full rounded-md bg-[var(--sf-panel)]"
            style={{
              border: "1.5px solid var(--sf-border-soft)",
              padding: "10px 12px",
              fontSize: 13,
              fontFamily: "var(--sf-font-ui)",
              resize: "vertical",
            }}
          />
          <div className="flex items-center gap-2 mt-2.5">
            <SfButton variant="ghost" size="sm" icon={Zap} disabled>Templates</SfButton>
            <SfButton variant="ghost" size="sm" icon={Paperclip} disabled>Attach</SfButton>
            <div className="flex-1" />
            <SfButton
              variant="primary"
              size="md"
              onClick={onSend}
              disabled={sending || !composeText.trim()}
            >
              {sending ? "Sending…" : "Send"}
            </SfButton>
          </div>
          {!primaryConv && (
            <div className="text-[11px] text-[var(--sf-ink-3)] mt-2 leading-snug">
              No existing thread on this channel yet — sending will require an inbound first
              (new-thread creation lands with the inbox admin tooling).
            </div>
          )}
        </SfCard>

        {/* 6 KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MsgKPI
            label="Total messages"
            value={kpis.total}
            sub={kpis.threads === 1 ? "1 thread" : `${kpis.threads} threads`}
            accent="var(--sf-blue)"
          />
          <MsgKPI
            label="Response time"
            value={kpis.responseTime != null ? `${kpis.responseTime} min` : "—"}
            sub={kpis.responseTime != null ? "customer avg" : "needs event data"}
            accent="var(--sf-green)"
          />
          <MsgKPI
            label="Preferred channel"
            value={kpis.preferred}
            sub={kpis.preferredCount ? `${kpis.preferredCount} of last ${kpis.total}` : "—"}
            accent="var(--sf-purple)"
            mono={false}
          />
          <MsgKPI
            label="Reviews"
            value={kpis.reviews}
            sub={kpis.reviews > 0 ? "from this customer" : "—"}
            accent="var(--sf-amber)"
          />
          <MsgKPI
            label="Unread"
            value={kpis.unread}
            sub={kpis.unread > 0 ? "from customer" : "all read"}
            accent="var(--sf-red)"
          />
          <MsgKPI
            label="Auto-sent"
            value={kpis.autoSent != null ? kpis.autoSent : "—"}
            sub="confirmations + reminders"
            accent="var(--sf-teal)"
          />
        </div>
      </div>

      {/* Message history */}
      <SfCard padding={0}>
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-[var(--sf-border-soft)]">
          <MessageSquare size={14} className="text-[var(--sf-ink-3)]" />
          <div className="text-[13px] font-semibold text-[var(--sf-ink)]">Message history</div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            {filterChips.map((chip) => (
              <SfFilterChip
                key={chip.id}
                active={filter === chip.id}
                count={chip.count}
                onClick={() => setFilter(chip.id)}
              >
                {chip.label}
              </SfFilterChip>
            ))}
          </div>
        </div>
        {filteredEvents.length === 0 ? (
          <EmptyRow
            icon={MessageSquare}
            title="No messages in this view"
            subtitle={
              filter === "all"
                ? "SMS, email, and review threads with this customer will appear here."
                : "Try a different filter."
            }
          />
        ) : (
          filteredEvents.map((evt, i, arr) => (
            <MessageEventRow
              key={`${evt.conversationId}-${evt.id || i}`}
              event={evt}
              customerName={customerName}
              isLast={i === arr.length - 1}
              onOpen={() => onOpen?.(evt.conversationId)}
            />
          ))
        )}
      </SfCard>
    </div>
  )
}

const MsgKPI = ({ label, value, sub, accent, mono = true }) => (
  <SfCard padding={0} className="flex-1">
    <div className="px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] text-[var(--sf-ink-3)] font-medium">{label}</span>
        {accent && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
        )}
      </div>
      <div
        className="text-[22px] font-bold text-[var(--sf-ink)] leading-none mt-1.5"
        style={{
          letterSpacing: "-0.02em",
          fontVariantNumeric: mono ? "tabular-nums" : "normal",
        }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[var(--sf-ink-3)] mt-1.5">{sub}</div>}
    </div>
  </SfCard>
)

// Flat event row — shows a single message / call / review. Replaces
// the old "conversation preview" row so the Messages tab matches the
// inbox detail pane: individual messages, sorted newest-first.
const MessageEventRow = ({ event, customerName, isLast, onOpen }) => {
  const channelKey = (event.channel || "").toLowerCase()
  const meta = MSG_CHANNEL_META[channelKey] || MSG_CHANNEL_META.sms
  const Icon = meta.icon
  const t = event.type || ""
  const isCall = t.startsWith("call_")
  const isReview = t === "review_in" || channelKey === "review" || channelKey === "yelp"
  const isOut = t === "message_out" || t === "call_out"
  const primaryLabel = customerName || "Customer"
  const stamp = event.timestamp
    ? new Date(event.timestamp).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—"
  const subject = event.subject || event.title || null
  const body = (event.text || event.body || "").trim()

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: "transparent",
        cursor: "pointer",
        border: "none",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <div
        className="w-[34px] h-[34px] rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: meta.bg, color: meta.c }}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12.5px] text-[var(--sf-ink-2)]">
            <b style={{ color: "var(--sf-ink)" }}>{isOut ? "You" : primaryLabel}</b> → {isOut ? primaryLabel : "You"}
          </span>
          <SfTag color={meta.c} bg={meta.bg}>{meta.label}</SfTag>
          {isCall && (
            <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">Call</SfTag>
          )}
          {isReview && Number.isFinite(parseFloat(event.rating)) && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
              style={{ color: "var(--sf-amber-dark)" }}
            >
              <Star size={10} fill="var(--sf-amber)" stroke="var(--sf-amber)" />{" "}
              {parseFloat(event.rating).toFixed(1)}
            </span>
          )}
          <div className="flex-1" />
          <span
            className="text-[10.5px] text-[var(--sf-ink-3)]"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            {stamp}
          </span>
        </div>
        {subject && (
          <div className="text-[13px] font-bold text-[var(--sf-ink)] mt-1 truncate">
            {subject}
          </div>
        )}
        {body && (
          <div
            className="text-[12.5px] text-[var(--sf-ink-2)] mt-0.5 leading-snug"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {body}
          </div>
        )}
        {!body && isCall && (
          <div className="text-[12px] text-[var(--sf-ink-3)] mt-0.5 italic">
            {t === "call_in" ? "Incoming call" : "Outgoing call"}
            {event.callDurationSeconds
              ? ` · ${Math.floor(event.callDurationSeconds / 60)}m ${event.callDurationSeconds % 60}s`
              : ""}
          </div>
        )}
      </div>
    </button>
  )
}

// ── Activity tab ───────────────────────────────────────────

const ACTIVITY_FILTERS = [
  { id: "all",       label: "All events" },
  { id: "jobs",      label: "Jobs" },
  { id: "payments",  label: "Payments" },
  { id: "messages",  label: "Messages" },
  { id: "estimates", label: "Estimates" },
]

const ActivityTab = ({ jobs, invoices, conversations, estimates, customer }) => {
  const [filter, setFilter] = useState("all")
  const events = useMemo(
    () => buildActivityEvents({ jobs, invoices, conversations, estimates, customer }),
    [jobs, invoices, conversations, estimates, customer]
  )
  const filtered = filter === "all" ? events : events.filter((e) => e.group === filter)
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-start">
      {/* Filter rail */}
      <SfCard className="lg:sticky lg:top-2">
        <SfCardHeader title="Filter by" />
        <div className="flex flex-col gap-1">
          {ACTIVITY_FILTERS.map((f) => {
            const count = f.id === "all" ? events.length : events.filter((e) => e.group === f.id).length
            const active = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] font-medium"
                style={{
                  background: active ? "var(--sf-blue-soft)" : "transparent",
                  color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--sf-font-ui)",
                  textAlign: "left",
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span className="flex-1">{f.label}</span>
                <span
                  className="text-[11px]"
                  style={{
                    color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </SfCard>

      {/* Timeline */}
      <SfCard padding={0}>
        <div className="px-4 py-3 flex items-center border-b border-[var(--sf-border-soft)]">
          <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
            Activity · {filtered.length} event{filtered.length === 1 ? "" : "s"}
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyRow icon={Clock} title="No activity yet" subtitle="Events will show up here as the customer interacts." />
        ) : (
          <div className="py-1">
            {filtered.map((e, i) => {
              const Icon = e.icon
              const isLast = i === filtered.length - 1
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
                    position: "relative",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${e.color}1a`,
                      color: e.color,
                      border: e.milestone ? `2px solid ${e.color}` : `1px solid ${e.color}22`,
                      boxShadow: e.milestone ? `0 0 0 4px ${e.color}1a` : "none",
                    }}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
                        {e.title}
                      </div>
                      {e.milestone && (
                        <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">
                          Milestone
                        </SfTag>
                      )}
                      {e.amount != null && (
                        <span
                          className="text-[12px] font-bold ml-auto"
                          style={{
                            color: e.amount >= 0 ? "var(--sf-green-dark)" : "var(--sf-red-dark)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {e.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(e.amount))}
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <div className="text-[12px] text-[var(--sf-ink-2)] mt-0.5">{e.description}</div>
                    )}
                    <div
                      className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5"
                      style={{ fontFamily: "var(--sf-font-mono)" }}
                    >
                      {e.when.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SfCard>
    </div>
  )
}

const buildActivityEvents = ({ jobs, invoices, conversations, estimates, customer }) => {
  const out = []
  // Customer created — milestone
  if (customer?.created_at) {
    out.push({
      group: "all",
      title: "Customer created",
      description: customer.source ? `Source: ${customer.source}` : "",
      when: new Date(customer.created_at),
      icon: Plus,
      color: "var(--sf-green-dark)",
      milestone: true,
    })
  }
  jobs.forEach((j) => {
    const status = (j.status || "").toLowerCase()
    const id = `#${String(j.id).slice(-4)}`
    const service = j.service_name || "Service"
    if (status === "completed" || status === "complete" || status === "done") {
      out.push({
        group: "jobs",
        title: `${service} ${id} completed`,
        description: j.notes ? j.notes.slice(0, 120) : null,
        when: new Date(j.completed_at || j.end_time || j.updated_at || j.scheduled_date),
        icon: CheckCircle2,
        color: "var(--sf-blue-dark)",
        amount: parseFloat(j.total || j.service_price || 0) || null,
      })
    } else if (status === "cancelled" || status === "canceled") {
      out.push({
        group: "jobs",
        title: `${service} ${id} cancelled`,
        when: new Date(j.cancelled_at || j.updated_at || j.scheduled_date),
        icon: Clock,
        color: "var(--sf-red-dark)",
      })
    } else {
      out.push({
        group: "jobs",
        title: `${service} ${id} scheduled`,
        when: new Date(j.created_at || j.scheduled_date),
        icon: CalendarIcon,
        color: "var(--sf-blue-dark)",
      })
    }
  })
  invoices.forEach((inv) => {
    const s = (inv.status || "").toLowerCase()
    if (s === "paid") {
      out.push({
        group: "payments",
        title: `Invoice #${String(inv.id).slice(-4)} paid`,
        when: new Date(inv.updated_at || inv.paid_at || inv.created_at),
        icon: DollarSign,
        color: "var(--sf-green-dark)",
        amount: parseFloat(inv.total_amount || inv.amount || 0) || null,
      })
    } else if (inv.created_at) {
      out.push({
        group: "payments",
        title: `Invoice #${String(inv.id).slice(-4)} ${s || "draft"}`,
        when: new Date(inv.created_at),
        icon: FileText,
        color: "var(--sf-ink-2)",
      })
    }
  })
  conversations.forEach((c) => {
    const when = c.lastEventAt || c.last_event_at
    if (!when) return
    const preview = c.lastPreview || c.last_preview
    out.push({
      group: "messages",
      title: `${capitalize(c.channel || "SMS")} thread${c.displayName ? ` · ${c.displayName}` : ""}`,
      description: preview ? preview.slice(0, 120) : null,
      when: new Date(when),
      icon: MessageSquare,
      color: "#0E7490",
    })
  })
  estimates.forEach((e) => {
    if (!e.created_at) return
    out.push({
      group: "estimates",
      title: `Estimate #${String(e.id).slice(-4)} ${(e.status || "sent").toLowerCase()}`,
      when: new Date(e.updated_at || e.created_at),
      icon: FileText,
      color: "var(--sf-purple)",
      amount: parseFloat(e.total_amount || e.amount || 0) || null,
    })
  })
  return out
    .filter((e) => e.when && !isNaN(e.when))
    .sort((a, b) => b.when.getTime() - a.when.getTime())
}

const capitalize = (s) =>
  s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : "—"

export default CustomerDetailsV2
