"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Plus,
  Upload,
  Download,
  MapPin,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Clock,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  CalendarRange,
  RotateCw,
  UserX,
  CheckCircle2,
  AlertCircle,
  X as XIcon,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope, filterByLocation } from "../context/LocationContext"
import { jobsAPI, teamAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfButton,
  SfStatusPill,
  SfTag,
  SfFilterChip,
  SfTab,
  SfAvatar,
  SfPageHeader,
  sfInitials,
  sfAssignTeamColors,
} from "../components/sf-primitives"

/**
 * Jobs list — Service Blue redesign (Wave 2.2).
 *
 * Uses jobsAPI.getAll for data and integrates LocationContext. Layout
 * follows the design pack with two extensions per feedback:
 *   - Tabs cover the time spectrum (Today / Tomorrow / This week /
 *     Upcoming / Past / Cancelled / All), plus an explicit date-range
 *     picker that overrides the tab when set.
 *   - Row shows date, time-from-to, duration, service, and payment
 *     status (paid / unpaid) alongside the job status. Unassigned and
 *     Recurring move to toggleable filter chips so they can combine
 *     with any tab.
 */

// ── Date helpers ───────────────────────────────────────────

const todayString = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

const jobDateStr = (j) => {
  const raw = j.scheduled_date || ""
  return String(raw).split("T")[0].split(" ")[0]
}

const formatDateShort = (s) => {
  if (!s) return "—"
  const [y, m, d] = s.split("-").map(Number)
  if (!y) return "—"
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

// Read a job's start time from whichever field carries it. In this
// codebase jobs.scheduled_date is the canonical full ISO datetime (date
// + time), while service_time / start_time may be present on subset of
// jobs as a plain "HH:MM" or full ISO. Returns a Date or null.
const jobStartDate = (job) => {
  const candidates = [job.scheduled_date, job.start_time, job.service_time]
  for (const c of candidates) {
    if (!c) continue
    const raw = String(c)
    // Plain "HH:MM" attached to today's date for sortable comparison.
    if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?$/.test(raw.trim())) {
      const [, hh, mm, , mer] =
        raw.trim().match(/^(\d{1,2}):(\d{2})(:(\d{2}))?\s*(AM|PM|am|pm)?$/) || []
      if (!hh) continue
      let h = parseInt(hh, 10)
      const m = parseInt(mm, 10)
      const meridian = mer?.toUpperCase()
      if (meridian === "PM" && h < 12) h += 12
      if (meridian === "AM" && h === 12) h = 0
      const today = new Date()
      today.setHours(h, m, 0, 0)
      return today
    }
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T")
    const d = new Date(iso)
    if (!isNaN(d)) return d
  }
  return null
}

// Numeric minutes-of-day for within-day sort.
const startMinutes = (job) => {
  const d = jobStartDate(job)
  if (!d) return null
  return d.getHours() * 60 + d.getMinutes()
}

// "9:00 AM – 10:30 AM" honoring the business 12h/24h preference.
const timeRangeLabel = (job) => {
  const start = jobStartDate(job)
  if (!start) return "—"
  const duration = parseInt(job.duration || job.service_duration || job.estimated_duration || 0, 10)
  const startStr = formatTimeShared(start)
  if (!duration) return startStr
  const end = new Date(start.getTime() + duration * 60000)
  return `${startStr} – ${formatTimeShared(end)}`
}

// ── Job-shape helpers ──────────────────────────────────────

const jobStatusLabel = (raw) => {
  const s = (raw || "").toLowerCase()
  if (s.includes("progress") || s === "in_progress") return "In progress"
  if (s === "en_route" || s === "en route" || s === "enroute") return "En route"
  if (s === "completed" || s === "complete" || s === "done") return "Completed"
  if (s === "cancelled" || s === "canceled") return "Cancelled"
  return "Scheduled"
}

const isCancelled = (j) => {
  const s = (j.status || "").toLowerCase()
  return s === "cancelled" || s === "canceled"
}

const isPast = (j) => {
  const s = (j.status || "").toLowerCase()
  if (s === "completed" || s === "complete" || s === "done" || s === "finished") return true
  return jobDateStr(j) < todayString() && !isCancelled(j)
}

const isAssigned = (job) =>
  Boolean(
    job.team_member_id ||
      job.assigned_to ||
      (Array.isArray(job.assigned_providers) && job.assigned_providers.length > 0) ||
      (Array.isArray(job.team_members) && job.team_members.length > 0)
  )

const assigneeIdsOf = (job) => {
  const seen = new Set()
  const ids = []
  const push = (raw) => {
    if (raw == null) return
    const id = String(raw)
    if (seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }
  if (Array.isArray(job.assigned_providers)) {
    job.assigned_providers.forEach((p) => push(p?.id || p?.team_member_id || p?.provider_id))
  }
  if (Array.isArray(job.team_members)) {
    job.team_members.forEach((m) => push(m?.id || m?.team_member_id))
  }
  if (Array.isArray(job.job_team_assignments)) {
    job.job_team_assignments.forEach((a) => push(a?.team_member_id || a?.id))
  }
  if (Array.isArray(job.team_assignments)) {
    job.team_assignments.forEach((a) => push(a?.team_member_id || a?.id))
  }
  if (job.team_member_id) push(job.team_member_id)
  if (job.assigned_to) push(job.assigned_to)
  return ids
}

const formatMoney = (n) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const paymentState = (j) => {
  const total = parseFloat(j.total || j.service_price || 0)
  if (isCancelled(j) || total === 0) return null
  const raw = String(j.payment_status || j.payment_state || "").toLowerCase()
  if (raw === "paid" || raw === "complete" || raw === "completed") return "paid"
  if (raw === "partial" || raw === "partial_paid" || raw === "partially_paid") return "partial"
  if (raw === "refunded") return "refunded"
  // Default: unpaid when there's a value and status is not paid
  return "unpaid"
}

const PaymentPill = ({ state }) => {
  if (!state) return <span className="text-[var(--sf-ink-3)] text-[11px]">—</span>
  const map = {
    paid:     { label: "Paid",     fg: "#15803D", bg: "#ECFDF5", dot: "#22C55E", icon: CheckCircle2 },
    unpaid:   { label: "Unpaid",   fg: "#B45309", bg: "#FEF3C7", dot: "#D97706", icon: AlertCircle },
    partial:  { label: "Partial",  fg: "#0E7490", bg: "#CFFAFE", dot: "#0891B2", icon: AlertCircle },
    refunded: { label: "Refunded", fg: "#5F6775", bg: "#F1F5F9", dot: "#94A3B8", icon: AlertCircle },
  }
  const m = map[state] || map.unpaid
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full whitespace-nowrap"
      style={{
        background: m.bg,
        color: m.fg,
        fontSize: 11,
        fontWeight: 600,
        border: `1px solid ${m.dot}25`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  )
}

// ── Tab definitions ────────────────────────────────────────

const TABS = [
  { id: "today",     label: "Today" },
  { id: "tomorrow",  label: "Tomorrow" },
  { id: "week",      label: "This week" },
  { id: "upcoming",  label: "Upcoming" },
  { id: "past",      label: "Past" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all",       label: "All" },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 10

// "This week" = today through next 6 days
const isInWeek = (dateStr) => {
  if (!dateStr) return false
  const today = todayString()
  const end = addDays(today, 6)
  return dateStr >= today && dateStr <= end
}

// ── Component ──────────────────────────────────────────────

const JobsV2 = () => {
  const { user } = useAuth()
  const { locationId, selectedLocation, setLocationId } = useLocationScope()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id || "upcoming"

  const [tab, setTab] = useState(initialTab)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [view, setView] = useState("list")
  const [sortMode, setSortMode] = useState("time")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Toggleable secondary filters
  const [onlyRecurring, setOnlyRecurring] = useState(false)
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)

  // Custom date range (overrides tab when active)
  const [dateRange, setDateRange] = useState({ from: "", to: "" })
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const datePickerRef = useRef(null)

  // Data
  const [loading, setLoading] = useState(true)
  const [jobsAll, setJobsAll] = useState([])
  const [teamMembers, setTeamMembers] = useState([])

  // Sync tab → URL
  useEffect(() => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set("tab", tab)
      return next
    }, { replace: true })
  }, [tab, setSearchParams])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  // Close date picker on outside click
  useEffect(() => {
    if (!datePickerOpen) return
    const onClick = (e) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target)) {
        setDatePickerOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [datePickerOpen])

  // Compute the API fetch window. Default covers ~5 months centered on
  // today; custom date range expands the window as needed.
  const fetchWindow = useMemo(() => {
    const today = todayString()
    let start = addDays(today, -60)
    let end = addDays(today, 90)
    if (dateRange.from && dateRange.from < start) start = dateRange.from
    if (dateRange.to && dateRange.to > end) end = dateRange.to
    return { start, end }
  }, [dateRange.from, dateRange.to])

  const fetchJobs = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const range = `${fetchWindow.start} to ${fetchWindow.end}`
      const [jobsResp, teamResp] = await Promise.allSettled([
        jobsAPI.getAll(user.id, "", "", 1, 1000, null, range, "scheduled_date", "ASC"),
        teamAPI.getAll(user.id, { page: 1, limit: 200 }),
      ])
      const jobsList = jobsResp.status === "fulfilled" ? normalizeAPIResponse(jobsResp.value, "jobs") : []
      const teamList = teamResp.status === "fulfilled" ? (teamResp.value.teamMembers || teamResp.value || []) : []
      setJobsAll(jobsList)
      setTeamMembers(teamList)
    } finally {
      setLoading(false)
    }
  }, [user?.id, fetchWindow.start, fetchWindow.end])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Apply location filter
  const jobs = useMemo(() => filterByLocation(jobsAll, locationId), [jobsAll, locationId])

  // Tab counts
  const counts = useMemo(() => {
    const today = todayString()
    const tomorrow = addDays(today, 1)
    return {
      today:     jobs.filter((j) => jobDateStr(j) === today && !isCancelled(j)).length,
      tomorrow:  jobs.filter((j) => jobDateStr(j) === tomorrow && !isCancelled(j)).length,
      week:      jobs.filter((j) => isInWeek(jobDateStr(j)) && !isCancelled(j)).length,
      // Upcoming = everything from tomorrow onwards (excluding cancelled).
      // Overlaps with Tomorrow and This week — those are tighter slices.
      upcoming:  jobs.filter((j) => jobDateStr(j) >= tomorrow && !isCancelled(j)).length,
      past:      jobs.filter(isPast).length,
      cancelled: jobs.filter(isCancelled).length,
      all:       jobs.length,
    }
  }, [jobs])

  // Custom date range takes precedence over the tab when set
  const dateRangeActive = Boolean(dateRange.from || dateRange.to)

  // Filter by tab (or date range when active)
  const tabFiltered = useMemo(() => {
    if (dateRangeActive) {
      return jobs.filter((j) => {
        const d = jobDateStr(j)
        if (!d) return false
        if (dateRange.from && d < dateRange.from) return false
        if (dateRange.to && d > dateRange.to) return false
        return true
      })
    }
    const today = todayString()
    const tomorrow = addDays(today, 1)
    switch (tab) {
      case "today":     return jobs.filter((j) => jobDateStr(j) === today && !isCancelled(j))
      case "tomorrow":  return jobs.filter((j) => jobDateStr(j) === tomorrow && !isCancelled(j))
      case "week":      return jobs.filter((j) => isInWeek(jobDateStr(j)) && !isCancelled(j))
      case "upcoming":  return jobs.filter((j) => jobDateStr(j) >= tomorrow && !isCancelled(j))
      case "past":      return jobs.filter(isPast)
      case "cancelled": return jobs.filter(isCancelled)
      default:          return jobs
    }
  }, [jobs, tab, dateRangeActive, dateRange.from, dateRange.to])

  // Secondary filters
  const filtered = useMemo(() => {
    return tabFiltered.filter((j) => {
      if (onlyRecurring && j.is_recurring !== true) return false
      if (onlyUnassigned && isAssigned(j)) return false
      return true
    })
  }, [tabFiltered, onlyRecurring, onlyUnassigned])

  // Search
  const searched = useMemo(() => {
    if (!debouncedSearch) return filtered
    const q = debouncedSearch.toLowerCase()
    return filtered.filter((j) => {
      const customer = `${j.customer_first_name || ""} ${j.customer_last_name || ""} ${j.customer_name || ""}`.toLowerCase()
      const addr = (j.service_address || j.customer_address || "").toLowerCase()
      const id = String(j.id || "").toLowerCase()
      const svc = String(j.service_name || "").toLowerCase()
      return customer.includes(q) || addr.includes(q) || id.includes(q) || svc.includes(q)
    })
  }, [filtered, debouncedSearch])

  // Sort
  const sorted = useMemo(() => {
    const out = [...searched]
    out.sort((a, b) => {
      if (sortMode === "value") {
        return parseFloat(b.total || b.service_price || 0) - parseFloat(a.total || a.service_price || 0)
      }
      if (sortMode === "customer") {
        return (a.customer_name || "").toLowerCase().localeCompare((b.customer_name || "").toLowerCase())
      }
      // time: full ISO ascending — closest scheduled date+time on top.
      const ad = jobStartDate(a)?.getTime() ?? Number.POSITIVE_INFINITY
      const bd = jobStartDate(b)?.getTime() ?? Number.POSITIVE_INFINITY
      return ad - bd
    })
    return out
  }, [searched, sortMode])

  // Pagination
  useEffect(() => {
    setPage(1)
  }, [tab, debouncedSearch, sortMode, locationId, onlyRecurring, onlyUnassigned, dateRange.from, dateRange.to, pageSize])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageRows = sorted.slice(pageStart, pageStart + pageSize)

  // Name + color lookups
  const memberNameById = useMemo(() => {
    const map = new Map()
    teamMembers.forEach((m) => {
      if (m?.id == null) return
      const n = m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || ""
      if (n) map.set(String(m.id), n)
    })
    return map
  }, [teamMembers])

  const allAssigneeIds = useMemo(() => {
    const set = new Set()
    jobs.forEach((j) => assigneeIdsOf(j).forEach((id) => set.add(id)))
    return Array.from(set)
  }, [jobs])

  const cleanerColors = useMemo(() => sfAssignTeamColors(allAssigneeIds), [allAssigneeIds])

  // Show date column when tab spans multiple days
  const tabSpansMultipleDays =
    dateRangeActive ||
    !["today", "tomorrow"].includes(tab)

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)] flex flex-col"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader title="Jobs" />

      <SfPageHeader
        title="Jobs"
        subtitle={
          loading
            ? "Loading…"
            : dateRangeActive
              ? `${sorted.length} job${sorted.length === 1 ? "" : "s"} in ${formatDateShort(dateRange.from || fetchWindow.start)} – ${formatDateShort(dateRange.to || fetchWindow.end)}`
              : `${counts.all} job${counts.all === 1 ? "" : "s"} in the window · ${counts.cancelled} cancelled · ${jobs.filter((j) => !isAssigned(j) && !isCancelled(j)).length} unassigned`
        }
        actions={
          <>
            <SfButton variant="secondary" size="md" icon={Upload} className="hidden sm:inline-flex">
              Import
            </SfButton>
            <SfButton variant="secondary" size="md" icon={Download} className="hidden sm:inline-flex">
              Export
            </SfButton>
            <SfButton variant="primary" size="md" icon={Plus} onClick={() => navigate("/createjob")}>
              New job
            </SfButton>
          </>
        }
        tabs={
          <div className="flex items-center overflow-x-auto scrollbar-hide w-full">
            {TABS.map((t) => (
              <SfTab
                key={t.id}
                active={!dateRangeActive && tab === t.id}
                count={counts[t.id]}
                onClick={() => {
                  setTab(t.id)
                  setDateRange({ from: "", to: "" })
                }}
              >
                {t.label}
              </SfTab>
            ))}
          </div>
        }
      />

      {/* Optional scope indicator */}
      {selectedLocation && (
        <div className="px-6 lg:px-8 pt-3 flex">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[11.5px] font-semibold"
            style={{
              background: "var(--sf-blue-soft)",
              color: "var(--sf-blue-dark)",
              border: `1px solid ${selectedLocation?.color || "var(--sf-blue)"}25`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedLocation?.color || "var(--sf-blue)" }} />
            {selectedLocation.name}
            <button
              type="button"
              onClick={() => setLocationId("all")}
              aria-label="Clear location filter"
              className="opacity-70 hover:opacity-100 ml-px"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", fontSize: 13, fontWeight: 600, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <div
          className="flex items-center gap-2 rounded-[8px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] px-3 py-[6px]"
          style={{ width: 340, maxWidth: "100%" }}
        >
          <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, ID, address, or service…"
            className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[var(--sf-ink)]"
            style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
          />
        </div>

        {/* Date range picker */}
        <div className="relative" ref={datePickerRef}>
          <SfFilterChip
            icon={CalendarIcon}
            active={dateRangeActive}
            onClick={() => setDatePickerOpen((v) => !v)}
          >
            {dateRangeActive
              ? `${formatDateShort(dateRange.from || fetchWindow.start)} → ${formatDateShort(dateRange.to || fetchWindow.end)}`
              : "Date range"}
          </SfFilterChip>
          {datePickerOpen && (
            <div
              className="absolute left-0 top-full mt-1.5 z-50 rounded-[10px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] p-3"
              style={{ boxShadow: "var(--sf-shadow-l)", minWidth: 280 }}
            >
              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold text-[var(--sf-ink-3)] uppercase tracking-wide">From</span>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                    className="rounded-md border border-[var(--sf-border-soft)]"
                    style={{ padding: "6px 10px", fontSize: 12.5, fontFamily: "var(--sf-font-ui)" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold text-[var(--sf-ink-3)] uppercase tracking-wide">To</span>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                    className="rounded-md border border-[var(--sf-border-soft)]"
                    style={{ padding: "6px 10px", fontSize: 12.5, fontFamily: "var(--sf-font-ui)" }}
                  />
                </label>
                <div className="flex items-center justify-end gap-2 mt-1">
                  {dateRangeActive && (
                    <SfButton
                      variant="ghost"
                      size="sm"
                      icon={XIcon}
                      onClick={() => {
                        setDateRange({ from: "", to: "" })
                      }}
                    >
                      Clear
                    </SfButton>
                  )}
                  <SfButton variant="primary" size="sm" onClick={() => setDatePickerOpen(false)}>
                    Apply
                  </SfButton>
                </div>
              </div>
            </div>
          )}
        </div>

        <SfFilterChip
          icon={RotateCw}
          active={onlyRecurring}
          onClick={() => setOnlyRecurring((v) => !v)}
        >
          Recurring
        </SfFilterChip>
        <SfFilterChip
          icon={UserX}
          active={onlyUnassigned}
          onClick={() => setOnlyUnassigned((v) => !v)}
        >
          Unassigned
        </SfFilterChip>

        <div className="flex-1" />
        <span className="text-[11.5px] text-[var(--sf-ink-3)] font-medium hidden md:inline">Sort:</span>
        <SfFilterChip icon={Clock} active={sortMode === "time"} onClick={() => setSortMode("time")}>
          Time
        </SfFilterChip>
        <SfFilterChip active={sortMode === "value"} onClick={() => setSortMode("value")}>
          Value
        </SfFilterChip>
        <SfFilterChip active={sortMode === "customer"} onClick={() => setSortMode("customer")}>
          Customer
        </SfFilterChip>
        <div className="hidden md:flex items-center bg-[var(--sf-panel-soft)] rounded-[7px] p-[2px] ml-1">
          {[
            { id: "list",  Icon: List },
            { id: "cards", Icon: LayoutGrid },
            { id: "cal",   Icon: CalendarRange },
          ].map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className="px-2 py-[5px] rounded-[5px] flex items-center justify-center transition-colors"
              style={{
                background: view === id ? "var(--sf-panel)" : "transparent",
                color: view === id ? "var(--sf-ink)" : "var(--sf-ink-2)",
                boxShadow: view === id ? "0 1px 2px rgba(0,0,0,.06)" : "none",
                border: "none",
                cursor: "pointer",
              }}
              aria-label={`${id} view`}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1">
        <SfCard padding={0}>
          {/* Head */}
          <div
            className="hidden md:flex items-center gap-2.5 px-4 py-2.5"
            style={{
              background: "var(--sf-panel-alt)",
              borderBottom: "1px solid var(--sf-border-soft)",
              fontSize: 11,
              color: "var(--sf-ink-3)",
              fontWeight: 700,
              letterSpacing: ".05em",
              textTransform: "uppercase",
            }}
          >
            <div style={{ width: tabSpansMultipleDays ? 150 : 130 }}>
              {tabSpansMultipleDays ? "Job · Date · Time" : "Job · Time"}
            </div>
            <div className="flex-1 min-w-0">Customer · Service</div>
            <div style={{ width: 180 }}>Address</div>
            <div style={{ width: 130 }}>Team</div>
            <div style={{ width: 70, textAlign: "right" }}>Value</div>
            <div style={{ width: 100 }}>Status</div>
            <div style={{ width: 90 }}>Payment</div>
            <div style={{ width: 24 }} />
          </div>

          {loading ? (
            <div className="py-16 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              Loading jobs…
            </div>
          ) : pageRows.length === 0 ? (
            <div className="py-16 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              {debouncedSearch ? "No jobs match that search." : "No jobs in this view."}
            </div>
          ) : (
            pageRows.map((j, i) => (
              <JobRow
                key={j.id || i}
                job={j}
                isLast={i === pageRows.length - 1}
                showDate={tabSpansMultipleDays}
                cleanerColors={cleanerColors}
                memberNameById={memberNameById}
                onClick={() => navigate(`/job/${j.id}`)}
              />
            ))
          )}

          {/* Footer */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-wrap"
            style={{
              borderTop: "1px solid var(--sf-border-soft)",
              fontSize: 12,
              color: "var(--sf-ink-2)",
              background: "var(--sf-panel-alt)",
            }}
          >
            <span>
              Showing <b className="text-[var(--sf-ink)]">{pageRows.length}</b> of {sorted.length}
              {sorted.length !== counts.all && counts.all > 0 && (
                <> · <span className="text-[var(--sf-ink-3)]">{counts.all} total in window</span></>
              )}
            </span>
            <label className="inline-flex items-center gap-1.5 ml-3 text-[11.5px] text-[var(--sf-ink-3)]">
              Per page:
              <select
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                className="rounded-md border border-[var(--sf-border-soft)] bg-[var(--sf-panel)]"
                style={{
                  padding: "3px 6px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--sf-ink-2)",
                  fontFamily: "var(--sf-font-ui)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex-1" />
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold"
                  style={{
                    background: "transparent",
                    color: currentPage === 1 ? "var(--sf-ink-4)" : "var(--sf-ink-2)",
                    border: "none",
                    cursor: currentPage === 1 ? "default" : "pointer",
                  }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <PaginationNumbers total={totalPages} current={currentPage} onChange={setPage} />
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold"
                  style={{
                    background: "transparent",
                    color: currentPage === totalPages ? "var(--sf-ink-4)" : "var(--sf-ink-2)",
                    border: "none",
                    cursor: currentPage === totalPages ? "default" : "pointer",
                  }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>
        </SfCard>
      </div>
    </div>
  )
}

// ── Single row ─────────────────────────────────────────────

const JobRow = ({ job, isLast, showDate, cleanerColors, memberNameById, onClick }) => {
  const j = job
  const date = jobDateStr(j)
  const tRange = timeRangeLabel(j)
  const duration = parseInt(j.duration || j.service_duration || j.estimated_duration || 0, 10)
  const customer =
    j.customer_name ||
    `${j.customer_first_name || ""} ${j.customer_last_name || ""}`.trim() ||
    "—"
  const idDisp = j.id ? `#${String(j.id).slice(-4)}` : ""
  const value = parseFloat(j.total || j.service_price || 0)
  const status = jobStatusLabel(j.status)
  const isRecurring = j.is_recurring === true
  const addr = j.service_address || j.customer_address || ""
  const addrFirstLine = addr.split(",")[0] || ""
  const addrCity = (j.service_city || j.customer_city || addr.split(",")[1] || "").trim()
  const payState = paymentState(j)

  const assignees = assigneeIdsOf(j)
  const teamColor = assignees.length ? cleanerColors.get(assignees[0]) || "#94A3B8" : "#DC2626"
  const cleanerName = assignees.length ? memberNameById.get(assignees[0]) : null
  const otherCount = assignees.length > 1 ? assignees.length - 1 : 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2.5 px-4 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: "transparent",
        border: "none",
        borderRadius: 0,
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      {/* Job · Date · Time */}
      <div style={{ width: showDate ? 150 : 130 }} className="flex-shrink-0">
        <div
          className="text-[10.5px] text-[var(--sf-ink-3)] font-semibold"
          style={{ fontFamily: "var(--sf-font-mono)" }}
        >
          {idDisp}
        </div>
        {showDate && (
          <div className="text-[11px] font-semibold text-[var(--sf-ink-2)] mt-0.5">
            {formatDateShort(date)}
          </div>
        )}
        <div
          className="text-[12px] font-bold text-[var(--sf-ink)] mt-0.5"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {tRange}
        </div>
        <div className="text-[10px] text-[var(--sf-ink-3)] mt-px">
          {duration ? `${duration}m` : ""}
        </div>
      </div>

      {/* Customer · Service */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <SfAvatar initials={sfInitials(customer)} color="var(--sf-ink)" size={26} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12.5px] font-semibold text-[var(--sf-ink)] truncate">
                {customer}
              </span>
              {isRecurring && (
                <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">↻ Recurring</SfTag>
              )}
            </div>
            <div className="text-[11px] text-[var(--sf-ink-2)] mt-0.5 truncate">
              {j.service_name || "Service"}
              {j.bedrooms && (
                <>
                  <span className="text-[var(--sf-ink-4)] mx-1">·</span>
                  <span>{j.bedrooms} bd</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div
        style={{ width: 180 }}
        className="hidden md:flex items-center gap-1.5 flex-shrink-0 pr-2 text-[11.5px] text-[var(--sf-ink-2)]"
      >
        <MapPin size={11} className="text-[var(--sf-ink-3)] flex-shrink-0" />
        <div className="min-w-0">
          <div className="truncate">{addrFirstLine || "—"}</div>
          {addrCity && <div className="text-[10px] text-[var(--sf-ink-3)] truncate">{addrCity}</div>}
        </div>
      </div>

      {/* Team */}
      <div style={{ width: 130 }} className="hidden md:flex items-center gap-2 flex-shrink-0">
        {assignees.length ? (
          <>
            <span
              className="rounded-sm flex-shrink-0"
              style={{ width: 6, height: 24, background: teamColor, borderRadius: 1.5 }}
            />
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-[var(--sf-ink)] leading-tight truncate">
                {cleanerName || "Team member"}
              </div>
              {otherCount > 0 && (
                <div className="text-[10px] text-[var(--sf-ink-3)] leading-tight mt-px">
                  + {otherCount} more
                </div>
              )}
            </div>
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md"
            style={{
              color: "var(--sf-red-dark)",
              background: "var(--sf-red-soft)",
              padding: "3px 8px",
              border: `1px dashed rgba(220,38,38,.35)`,
            }}
          >
            <Plus size={11} strokeWidth={2.4} /> Assign
          </span>
        )}
      </div>

      {/* Value */}
      <div
        style={{ width: 70, textAlign: "right" }}
        className="hidden sm:block flex-shrink-0 text-[13px] font-semibold text-[var(--sf-ink)]"
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {value ? formatMoney(value) : "—"}
        </span>
      </div>

      {/* Status */}
      <div style={{ width: 100 }} className="hidden sm:flex flex-shrink-0">
        <SfStatusPill status={status} />
      </div>

      {/* Payment */}
      <div style={{ width: 90 }} className="hidden md:flex flex-shrink-0">
        <PaymentPill state={payState} />
      </div>

      <span className="text-[var(--sf-ink-3)] flex-shrink-0" style={{ width: 24, textAlign: "center" }}>
        <MoreHorizontal size={15} />
      </span>
    </button>
  )
}

// ── Pagination numbers ─────────────────────────────────────

const PaginationNumbers = ({ total, current, onChange }) => {
  const pages = []
  const push = (p) => { if (!pages.includes(p)) pages.push(p) }
  push(1)
  if (current - 1 > 2) push("…l")
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) push(p)
  if (current + 1 < total - 1) push("…r")
  if (total > 1) push(total)

  return (
    <span className="inline-flex gap-0.5 mx-0.5">
      {pages.map((p, i) => {
        if (typeof p === "string") {
          return (
            <span key={`${p}-${i}`} className="px-1 text-[var(--sf-ink-3)] text-[11.5px]">…</span>
          )
        }
        const sel = p === current
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="min-w-[24px] px-1.5 py-[3px] rounded-md text-[11.5px] font-semibold"
            style={{
              background: sel ? "var(--sf-blue)" : "transparent",
              color: sel ? "#fff" : "var(--sf-ink-2)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--sf-font-ui)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p}
          </button>
        )
      })}
    </span>
  )
}

export default JobsV2
