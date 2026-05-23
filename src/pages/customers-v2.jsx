"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Plus,
  Upload,
  Download,
  Search as SearchIcon,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Tag as TagIcon,
  MapPin,
  Calendar as CalendarIcon,
  DollarSign,
  Star,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope, filterByLocation } from "../context/LocationContext"
import { customersAPI, jobsAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfButton,
  SfKPI,
  SfTag,
  SfFilterChip,
  SfTab,
  SfAvatar,
  SfPageHeader,
  sfInitials,
} from "../components/sf-primitives"

/**
 * Customers list — Service Blue redesign (Wave 3.1).
 *
 * Uses customersAPI.getAll, applies LocationContext, and lays out tabs
 * (All / Active / VIP / Recurring / Leads), a search + sort toolbar,
 * 4 KPIs, and a dense table with avatars, contact, city, tags, jobs
 * count, LTV, and last activity.
 */

// ── Helpers ────────────────────────────────────────────────

const formatMoney = (n) => {
  const v = Number.isFinite(n) ? n : 0
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const formatDateShort = (s) => {
  if (!s) return "—"
  const d = s instanceof Date
    ? s
    : new Date(String(s).includes("T") ? s : String(s).replace(" ", "T"))
  if (!d || isNaN(d)) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const formatRelativeShort = (s) => {
  if (!s) return "—"
  const d = s instanceof Date
    ? s
    : new Date(String(s).includes("T") ? s : String(s).replace(" ", "T"))
  if (!d || isNaN(d)) return "—"
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 1) return "Today"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const tagsOf = (c, agg) => {
  // Customers carry tags as an array, a comma-separated string, or
  // booleans on fields like `vip`, `is_vip`. Plus we synthesize a
  // "Recurring" tag when the per-customer job aggregation finds at
  // least one recurring booking.
  const tags = new Set()
  const raw =
    (Array.isArray(c.tags) ? c.tags : null) ||
    (typeof c.tags === "string" ? c.tags.split(",") : null) ||
    []
  raw.forEach((t) => {
    const trimmed = String(t).trim()
    if (trimmed) tags.add(trimmed)
  })
  if (c.vip === true || c.is_vip === true) tags.add("VIP")
  if (agg?.hasRecurring) tags.add("Recurring")
  return Array.from(tags)
}

const isVIP = (c) => tagsOf(c).some((t) => t.toLowerCase() === "vip")
const isRecurringWith = (c, agg) => Boolean(agg?.hasRecurring)
// "Active" = the customer record itself is marked active in the DB.
// In this codebase the customers.status enum carries 'active' or
// 'archived' (no 'lead' rows — leads live in the separate leads
// table behind /leads). Treat a NULL status as active too, since
// some legacy rows weren't backfilled.
const isActiveFor = (c) => {
  const s = (c.status || "").toLowerCase()
  if (s === "archived" || s === "inactive") return false
  return true
}

const TAG_PALETTE = {
  vip:        { color: "var(--sf-purple)",    bg: "var(--sf-purple-soft)" },
  recurring:  { color: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" },
  commercial: { color: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)" },
  hoa:        { color: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)" },
  new:        { color: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)" },
  lead:       { color: "#0E7490",              bg: "var(--sf-teal-soft)" },
}

const TagAuto = ({ children }) => {
  const k = String(children).toLowerCase()
  const p = TAG_PALETTE[k] || { color: "var(--sf-ink-2)", bg: "var(--sf-panel-soft)" }
  return <SfTag color={p.color} bg={p.bg}>{children}</SfTag>
}

// ── Component ──────────────────────────────────────────────

const TABS = [
  { id: "all",       label: "All" },
  { id: "active",    label: "Active" },
  { id: "vip",       label: "VIP" },
  { id: "recurring", label: "Recurring" },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

const CustomersV2 = () => {
  const { user } = useAuth()
  const { locationId, selectedLocation, setLocationId } = useLocationScope()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id || "all"

  const [tab, setTab] = useState(initialTab)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortMode, setSortMode] = useState("ltv")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [loading, setLoading] = useState(true)
  const [customersAll, setCustomersAll] = useState([])
  const [jobsAll, setJobsAll] = useState([])
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set("tab", tab)
      return next
    }, { replace: true })
  }, [tab, setSearchParams])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      // Customers don't have jobs/LTV/recurring columns — aggregate
      // from the jobs table client-side. A single page caps at 1000
      // rows (Supabase default). For tenants with more than 1000 total
      // jobs a single fetch undercounts the detail-page LTV — page
      // through until exhausted so the list matches the detail.
      const PAGE = 1000
      const MAX_PAGES = 20

      const custResp = await customersAPI
        .getAll(user.id, { page: 1, limit: PAGE })
        .catch(() => null)
      const custList = custResp ? normalizeAPIResponse(custResp, "customers") : []
      setCustomersAll(Array.isArray(custList) ? custList : [])

      let allJobs = []
      for (let p = 1; p <= MAX_PAGES; p++) {
        let chunk = []
        try {
          const resp = await jobsAPI.getAll(user.id, "", "", p, PAGE)
          chunk = normalizeAPIResponse(resp, "jobs") || []
        } catch {
          chunk = []
        }
        if (!Array.isArray(chunk) || chunk.length === 0) break
        allJobs = allJobs.concat(chunk)
        if (chunk.length < PAGE) break
      }
      setJobsAll(allJobs)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  const customers = useMemo(
    () => filterByLocation(customersAll, locationId),
    [customersAll, locationId]
  )

  // Aggregate per-customer stats from the jobs list. Built once and
  // looked up by id on the row. LTV mirrors the customer detail
  // page's definition: revenue from COMPLETED jobs only (actual
  // earned, not pipeline). totalJobs counts every non-cancelled job
  // so it's still useful for "how active is this customer".
  const customerAgg = useMemo(() => {
    const map = new Map()
    jobsAll.forEach((j) => {
      const cid = j.customer_id
      if (cid == null) return
      const status = (j.status || "").toLowerCase()
      const isCancelled = status === "cancelled" || status === "canceled"
      const isCompleted = status === "completed" || status === "complete" || status === "done"
      if (isCancelled) return
      if (!map.has(cid)) {
        map.set(cid, {
          totalJobs: 0,
          completedJobs: 0,
          totalRevenue: 0,
          hasRecurring: false,
          lastJobDate: null,
          firstJobDate: null,
        })
      }
      const agg = map.get(cid)
      agg.totalJobs += 1
      if (isCompleted) {
        agg.completedJobs += 1
        const value = parseFloat(j.total || j.service_price || j.amount || 0)
        if (Number.isFinite(value)) agg.totalRevenue += value
      }
      if (j.is_recurring === true) agg.hasRecurring = true
      const d = j.scheduled_date || j.created_at
      if (d) {
        const ts = new Date(String(d).includes("T") ? d : String(d).replace(" ", "T"))
        if (!isNaN(ts)) {
          if (!agg.lastJobDate || ts > agg.lastJobDate) agg.lastJobDate = ts
          if (!agg.firstJobDate || ts < agg.firstJobDate) agg.firstJobDate = ts
        }
      }
    })
    return map
  }, [jobsAll])

  const aggFor = useCallback((c) => customerAgg.get(c.id) || null, [customerAgg])

  // Tab counts — Recurring uses the per-customer aggregation
  const counts = useMemo(() => ({
    all:       customers.length,
    active:    customers.filter(isActiveFor).length,
    vip:       customers.filter(isVIP).length,
    recurring: customers.filter((c) => isRecurringWith(c, aggFor(c))).length,
  }), [customers, aggFor])

  const tabFiltered = useMemo(() => {
    switch (tab) {
      case "active":    return customers.filter(isActiveFor)
      case "vip":       return customers.filter(isVIP)
      case "recurring": return customers.filter((c) => isRecurringWith(c, aggFor(c)))
      default:          return customers
    }
  }, [customers, tab, aggFor])

  const searched = useMemo(() => {
    if (!debouncedSearch) return tabFiltered
    const q = debouncedSearch.toLowerCase()
    return tabFiltered.filter((c) => {
      const name = `${c.first_name || ""} ${c.last_name || ""} ${c.name || ""}`.toLowerCase()
      const email = (c.email || "").toLowerCase()
      const phone = String(c.phone || "")
      const city = (c.city || c.service_city || "").toLowerCase()
      const addr = (c.address || c.service_address || "").toLowerCase()
      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        city.includes(q) ||
        addr.includes(q)
      )
    })
  }, [tabFiltered, debouncedSearch])

  const sorted = useMemo(() => {
    const ltv = (c) => aggFor(c)?.totalRevenue ?? 0
    const jobs = (c) => aggFor(c)?.totalJobs ?? 0
    const lastActivity = (c) => {
      const agg = aggFor(c)
      if (agg?.lastJobDate) return agg.lastJobDate.getTime()
      return new Date(c.updated_at || c.created_at || 0).getTime()
    }
    const name = (c) =>
      `${c.first_name || ""} ${c.last_name || ""} ${c.name || ""}`.trim().toLowerCase()

    const out = [...searched]
    out.sort((a, b) => {
      switch (sortMode) {
        case "ltv":    return ltv(b) - ltv(a)
        case "jobs":   return jobs(b) - jobs(a)
        case "recent": return lastActivity(b) - lastActivity(a)
        case "name":   return name(a).localeCompare(name(b))
        default:       return 0
      }
    })
    return out
  }, [searched, sortMode, aggFor])

  // Pagination
  useEffect(() => { setPage(1) }, [tab, debouncedSearch, sortMode, locationId, pageSize])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageRows = sorted.slice(pageStart, pageStart + pageSize)

  // KPIs — driven by the per-customer aggregation
  const kpis = useMemo(() => {
    let totalLTV = 0
    let recurringCount = 0
    let withJobsCount = 0
    let totalJobs = 0
    customers.forEach((c) => {
      const agg = aggFor(c)
      if (agg?.totalRevenue) totalLTV += agg.totalRevenue
      if (agg?.hasRecurring) recurringCount += 1
      if (agg?.totalJobs > 0) withJobsCount += 1
      if (agg?.totalJobs) totalJobs += agg.totalJobs
    })
    const avg = withJobsCount ? totalLTV / withJobsCount : 0
    const recurringPct = customers.length ? Math.round((recurringCount / customers.length) * 100) : 0
    return {
      total: customers.length,
      avgLTV: avg,
      totalLTV,
      recurringPct,
      recurringCount,
      withJobsCount,
      totalJobs,
    }
  }, [customers, aggFor])

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)] flex flex-col"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader title="Customers" />

      <SfPageHeader
        title="Customers"
        subtitle={
          loading
            ? "Loading…"
            : `${kpis.total} contact${kpis.total === 1 ? "" : "s"} · ${kpis.recurringCount} recurring · ${formatMoney(kpis.totalLTV)} total LTV`
        }
        actions={
          <>
            <SfButton variant="secondary" size="md" icon={Upload} className="hidden sm:inline-flex">
              Import
            </SfButton>
            <SfButton variant="secondary" size="md" icon={Download} className="hidden sm:inline-flex">
              Export
            </SfButton>
            <SfButton variant="primary" size="md" icon={Plus}>
              New customer
            </SfButton>
          </>
        }
        tabs={
          <div className="flex items-center overflow-x-auto scrollbar-hide w-full">
            {TABS.map((t) => (
              <SfTab
                key={t.id}
                active={tab === t.id}
                count={counts[t.id]}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </SfTab>
            ))}
          </div>
        }
      />

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
          style={{ width: 360, maxWidth: "100%" }}
        >
          <SearchIcon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, or address"
            className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[var(--sf-ink)]"
            style={{ fontFamily: "var(--sf-font-ui)", padding: 0, boxShadow: "none" }}
          />
        </div>
        <SfFilterChip icon={TagIcon}>Tags</SfFilterChip>
        <SfFilterChip icon={MapPin}>City</SfFilterChip>
        <SfFilterChip icon={CalendarIcon}>Joined</SfFilterChip>
        <div className="flex-1" />
        <span className="text-[11.5px] text-[var(--sf-ink-3)] font-medium hidden md:inline">Sort:</span>
        <SfFilterChip icon={DollarSign} active={sortMode === "ltv"} onClick={() => setSortMode("ltv")}>
          LTV
        </SfFilterChip>
        <SfFilterChip active={sortMode === "jobs"} onClick={() => setSortMode("jobs")}>
          Jobs
        </SfFilterChip>
        <SfFilterChip active={sortMode === "recent"} onClick={() => setSortMode("recent")}>
          Recent
        </SfFilterChip>
        <SfFilterChip active={sortMode === "name"} onClick={() => setSortMode("name")}>
          Name
        </SfFilterChip>
      </div>

      {/* KPIs */}
      <div className="px-4 sm:px-6 lg:px-8 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SfKPI
          label="Total customers"
          value={kpis.total}
          accent="var(--sf-blue)"
          sub="contacts in window"
        />
        <SfKPI
          label="Avg LTV"
          value={formatMoney(kpis.avgLTV)}
          accent="var(--sf-green)"
          sub="lifetime value"
        />
        <SfKPI
          label="Recurring"
          value={`${kpis.recurringPct}%`}
          accent="var(--sf-purple)"
          sub={`${kpis.recurringCount} on subscription`}
        />
        <SfKPI
          label="Total jobs"
          value={kpis.totalJobs}
          accent="var(--sf-amber)"
          sub={kpis.withJobsCount ? `${kpis.withJobsCount} customers w/ jobs` : "—"}
        />
      </div>

      {/* Table */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1">
        <SfCard padding={0}>
          {/* Bulk action bar (visible when rows selected) */}
          {selected.size > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2"
              style={{
                background: "var(--sf-blue-soft)",
                borderBottom: "1px solid var(--sf-border-soft)",
                color: "var(--sf-blue-dark)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>{selected.size} selected</span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[var(--sf-blue-dark)]"
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              >
                Clear
              </button>
              <div className="flex-1" />
              <span className="text-[11px] text-[var(--sf-ink-3)] font-normal">
                Bulk actions wired in next slice
              </span>
            </div>
          )}

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
            <div style={{ width: 20 }} className="flex items-center justify-center">
              <SelectCheckbox
                checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
                indeterminate={
                  pageRows.some((r) => selected.has(r.id)) &&
                  !pageRows.every((r) => selected.has(r.id))
                }
                onChange={(checked) => {
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (checked) pageRows.forEach((r) => next.add(r.id))
                    else pageRows.forEach((r) => next.delete(r.id))
                    return next
                  })
                }}
              />
            </div>
            <div className="flex-1 min-w-0">Customer</div>
            <div style={{ width: 200 }}>Contact</div>
            <div style={{ width: 110 }}>City</div>
            <div style={{ width: 150 }}>Tags</div>
            <div style={{ width: 60, textAlign: "right" }}>Jobs</div>
            <div style={{ width: 90, textAlign: "right" }}>LTV</div>
            <div style={{ width: 80 }}>Last</div>
            <div style={{ width: 24 }} />
          </div>

          {loading ? (
            <div className="py-16 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              Loading customers…
            </div>
          ) : pageRows.length === 0 ? (
            <div className="py-16 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              {debouncedSearch ? "No customers match that search." : "No customers in this view."}
            </div>
          ) : (
            pageRows.map((c, i) => (
              <CustomerRow
                key={c.id || i}
                customer={c}
                agg={aggFor(c)}
                isLast={i === pageRows.length - 1}
                selected={selected.has(c.id)}
                onToggleSelected={(checked) => {
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(c.id)
                    else next.delete(c.id)
                    return next
                  })
                }}
                onClick={() => navigate(`/customer/${c.id}`)}
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

const CustomerRow = ({ customer, agg, isLast, selected, onToggleSelected, onClick }) => {
  const c = customer
  const name =
    c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Customer"
  const email = c.email || ""
  const phone = c.phone || ""
  const city = c.city || c.service_city || (c.address || "").split(",")[1]?.trim() || ""
  const tags = tagsOf(c, agg)
  const jobs = agg?.totalJobs ?? 0
  const ltv = agg?.totalRevenue ?? 0
  const last = agg?.lastJobDate ?? (c.updated_at ? new Date(c.updated_at) : null)
  const rating = parseFloat(c.rating)
  // Customer-since = the earliest signal we have. For Zenbooker-synced
  // customers, the SF created_at is when the sync first ran, not the
  // original join date. The earliest job_date is usually closer to
  // when the customer actually started.
  const createdAtDate = c.created_at ? new Date(c.created_at) : null
  const joined = (() => {
    if (!createdAtDate || isNaN(createdAtDate)) return agg?.firstJobDate || null
    if (!agg?.firstJobDate) return createdAtDate
    return agg.firstJobDate < createdAtDate ? agg.firstJobDate : createdAtDate
  })()

  return (
    <div
      onClick={(e) => {
        // Avoid bubbling from the checkbox cell
        if (e.target.closest("[data-stop-row-click]")) return
        onClick?.()
      }}
      className="w-full text-left flex items-center gap-2.5 px-4 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: selected ? "var(--sf-blue-soft)" : "transparent",
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      {/* Checkbox */}
      <div
        style={{ width: 20 }}
        className="flex items-center justify-center flex-shrink-0"
        data-stop-row-click
        onClick={(e) => e.stopPropagation()}
      >
        <SelectCheckbox
          checked={Boolean(selected)}
          onChange={(checked) => onToggleSelected?.(checked)}
        />
      </div>

      {/* Customer */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <SfAvatar
          initials={sfInitials(name)}
          color="var(--sf-ink)"
          size={32}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">
              {name}
            </span>
            {rating > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[11px]"
                style={{ color: "var(--sf-amber-dark)", fontVariantNumeric: "tabular-nums" }}
              >
                <Star size={10} fill="var(--sf-amber)" stroke="var(--sf-amber)" />
                {rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--sf-ink-3)] mt-px truncate">
            {joined ? `Joined ${formatDateShort(joined)}` : "—"}
          </div>
        </div>
      </div>

      {/* Contact */}
      <div
        style={{ width: 200 }}
        className="hidden md:flex flex-col flex-shrink-0 min-w-0 text-[11.5px] text-[var(--sf-ink-2)]"
      >
        <span className="truncate">{email || "—"}</span>
        {phone && (
          <span
            className="text-[var(--sf-ink-3)] text-[11px] mt-px"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            {phone}
          </span>
        )}
      </div>

      {/* City */}
      <div
        style={{ width: 110 }}
        className="hidden md:block flex-shrink-0 text-[12px] text-[var(--sf-ink-2)] truncate"
      >
        {city || "—"}
      </div>

      {/* Tags */}
      <div
        style={{ width: 150 }}
        className="hidden md:flex flex-wrap gap-1 flex-shrink-0"
      >
        {tags.slice(0, 2).map((t) => (
          <TagAuto key={t}>{t}</TagAuto>
        ))}
        {tags.length > 2 && <SfTag>+{tags.length - 2}</SfTag>}
      </div>

      {/* Jobs */}
      <div
        style={{ width: 60, textAlign: "right" }}
        className="hidden sm:block flex-shrink-0 text-[13px] font-semibold text-[var(--sf-ink)]"
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{jobs || "—"}</span>
      </div>

      {/* LTV */}
      <div
        style={{ width: 90, textAlign: "right" }}
        className="hidden sm:block flex-shrink-0 text-[13px] font-semibold text-[var(--sf-ink)]"
      >
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {ltv ? formatMoney(ltv) : "—"}
        </span>
      </div>

      {/* Last */}
      <div
        style={{ width: 80 }}
        className="hidden md:block flex-shrink-0 text-[11.5px] text-[var(--sf-ink-3)]"
      >
        {formatRelativeShort(last)}
      </div>

      <span
        className="text-[var(--sf-ink-3)] flex-shrink-0"
        style={{ width: 24, textAlign: "center" }}
      >
        <MoreHorizontal size={15} />
      </span>
    </div>
  )
}

// ── Selection checkbox ────────────────────────────────────

const SelectCheckbox = ({ checked, indeterminate, onChange }) => {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked
  }, [indeterminate, checked])
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ width: 16, height: 16 }}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange?.(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        style={{
          margin: 0,
          width: 14,
          height: 14,
          cursor: "pointer",
          accentColor: "var(--sf-blue)",
        }}
      />
    </span>
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

export default CustomersV2
