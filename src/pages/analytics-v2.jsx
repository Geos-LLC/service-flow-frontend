"use client"

import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  TrendingUp, Download, RefreshCw, Star, DollarSign, Users, Briefcase,
  Target, AlertCircle, ArrowUp, ArrowDown, Workflow,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import {
  jobsAPI, customersAPI, teamAPI, invoicesAPI, payrollAPI, analyticsAPI,
} from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import { isAccountOwner } from "../utils/roleUtils"
import MobileHeader from "../components/mobile-header"
import {
  SfCard, SfCardHeader, SfButton, SfPageHeader, SfTab, SfKPI, SfAvatar, sfInitials,
} from "../components/sf-primitives"

// ── Tokens (mirrored from design pack §T) ───────────────────────────────
const T = {
  ink:        "var(--sf-ink)",
  ink2:       "var(--sf-ink-2)",
  ink3:       "var(--sf-ink-3)",
  ink4:       "var(--sf-ink-4, #94a3b8)",
  panel:      "var(--sf-panel)",
  panelSoft:  "var(--sf-panel-soft)",
  panelAlt:   "var(--sf-panel-alt, #f8fafc)",
  border:     "var(--sf-border)",
  borderS:    "var(--sf-border-soft)",
  blue:       "var(--sf-blue)",
  blueSoft:   "var(--sf-blue-soft)",
  blueDark:   "var(--sf-blue-dark)",
  green:      "var(--sf-green)",
  greenSoft:  "var(--sf-green-soft)",
  greenDark:  "var(--sf-green-dark)",
  amber:      "var(--sf-amber)",
  amberSoft:  "var(--sf-amber-soft)",
  amberDark:  "var(--sf-amber-dark)",
  red:        "var(--sf-red)",
  redSoft:    "var(--sf-red-soft)",
  redDark:    "var(--sf-red-dark)",
  purple:     "var(--sf-purple, #8b5cf6)",
  purpleSoft: "var(--sf-purple-soft, #ede9fe)",
  teal:       "var(--sf-teal, #14b8a6)",
  tealSoft:   "var(--sf-teal-soft, #ccfbf1)",
}

// ── Date range helpers ─────────────────────────────────────────────────
const PERIODS = {
  "7d":  { days: 7,   label: "Last 7 days" },
  "30d": { days: 30,  label: "Last 30 days" },
  "90d": { days: 90,  label: "Last 90 days" },
  "ytd": { days: -1,  label: "Year to date" },
  "all": { days: 730, label: "All time" },
}

const fmtDateLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const rangeFor = (period) => {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  const start = new Date()
  if (period === "ytd") {
    start.setMonth(0, 1)
  } else {
    const days = PERIODS[period]?.days ?? 30
    start.setDate(start.getDate() - (days - 1))
  }
  start.setHours(0, 0, 0, 0)
  return { start, end, startStr: fmtDateLocal(start), endStr: fmtDateLocal(end) }
}

const moneyShort = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0)
const jobPrice = (j) =>
  parseFloat(j?.total_amount) || parseFloat(j?.total) ||
  parseFloat(j?.service_price) || parseFloat(j?.price) ||
  parseFloat(j?.invoice_amount) || 0

// ══════════════════════════════════════════════════════════════════════
// CHART PRIMITIVES
// ══════════════════════════════════════════════════════════════════════

const BarChart = ({ data, labels, height = 200, color = T.blue, valueFmt = (v) => v }) => {
  const max = Math.max(1, ...data)
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", position: "relative" }}>
              <div style={{
                width: "100%",
                height: `${(v / max) * 100}%`,
                background: i === data.length - 1 ? color : `${color}99`,
                borderRadius: "4px 4px 0 0",
                transition: "height .3s",
                minHeight: v > 0 ? 2 : 0,
              }} />
              {i === data.length - 1 && v > 0 && (
                <div style={{
                  position: "absolute", bottom: `${(v / max) * 100}%`, left: "50%",
                  transform: "translate(-50%, -3px)", fontSize: 10.5, fontWeight: 700,
                  color: T.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                }}>
                  {valueFmt(v)}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500 }}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const LineAreaChart = ({ data, labels, height = 200, color = T.blue, gradId = "lg" }) => {
  const max = Math.max(...data, 1), min = Math.min(...data, 0)
  const range = max - min || 1
  const width = 100
  const step = data.length > 1 ? width / (data.length - 1) : 0
  const pts = data.map((v, i) => [i * step, 100 - ((v - min) / range) * 90 - 5])
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ")
  return (
    <div style={{ position: "relative", height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${width},100 L0,100 Z`} fill={`url(#${gradId})`} />
        <path d={path} stroke={color} strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: -18,
        display: "flex", justifyContent: "space-between",
        fontSize: 10, color: T.ink3, fontWeight: 500,
      }}>
        {labels.map((l, i) =>
          (i === 0 || i === Math.floor(labels.length / 2) || i === labels.length - 1)
            ? <span key={i}>{l}</span>
            : <span key={i} style={{ visibility: "hidden" }}>·</span>
        )}
      </div>
    </div>
  )
}

const DonutChart = ({ data, size = 120, label = "Total" }) => {
  const total = data.reduce((s, d) => s + d.v, 0) || 1
  const r = size / 2 - 8
  const C = 2 * Math.PI * r
  let offset = 0
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.panelSoft} strokeWidth="10" />
        {data.map((d, i) => {
          const len = (d.v / total) * C
          const seg = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={d.c} strokeWidth="10"
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += len
          return seg
        })}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          fontSize: 20, fontWeight: 700, color: T.ink,
          letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums",
        }}>{data.reduce((s, d) => s + d.v, 0).toLocaleString()}</div>
        <div style={{
          fontSize: 10, color: T.ink3, fontWeight: 600,
          letterSpacing: ".04em", textTransform: "uppercase",
        }}>{label}</div>
      </div>
    </div>
  )
}

const HBarList = ({ data, color = T.blue, fmt = (v) => v }) => {
  const max = Math.max(1, ...data.map((d) => d.v))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {data.map((r, i) => (
        <div key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
            <span style={{ flex: 1, color: T.ink, fontWeight: 600 }}>{r.l}</span>
            <span style={{ color: T.ink2, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(r.v)}</span>
          </div>
          <div style={{ height: 6, background: T.panelSoft, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(r.v / max) * 100}%`, height: "100%", background: r.c || color, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

const MiniSpark = ({ data, color = T.green, width = 88, height = 24 }) => {
  if (!data?.length) return null
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const step = width / (data.length - 1 || 1)
  const path = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${height - ((v - min) / range) * height}`)
    .join(" ")
  return (
    <svg width={width} height={height}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const Mini = ({ label, value, sub }) => (
  <div style={{ flex: 1, padding: "4px 0" }}>
    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
      {label}
    </div>
    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{sub}</div>}
  </div>
)

const DualBarChart = ({ revenue, payroll, labels, height = 200 }) => {
  const maxRev = Math.max(1, ...revenue)
  return (
    <div style={{ paddingTop: 14, paddingBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height }}>
        {revenue.map((r, i) => {
          const p = payroll[i] || 0
          const ratio = r > 0 ? (p / r) * 100 : 0
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", gap: 4 }}>
                <div style={{
                  flex: 1, height: `${(r / maxRev) * 100}%`, background: T.green,
                  borderRadius: "4px 4px 0 0", position: "relative",
                }}>
                  {i === revenue.length - 1 && r > 0 && (
                    <div style={{
                      position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
                      fontSize: 10, fontWeight: 700, color: T.greenDark,
                      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    }}>{moneyShort(r)}</div>
                  )}
                </div>
                <div style={{
                  flex: 1, height: `${(p / maxRev) * 100}%`, background: T.amberDark,
                  borderRadius: "4px 4px 0 0", position: "relative",
                }}>
                  {i === revenue.length - 1 && p > 0 && (
                    <div style={{
                      position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
                      fontSize: 10, fontWeight: 700, color: T.amberDark,
                      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    }}>{moneyShort(p)}</div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.blueDark, fontVariantNumeric: "tabular-nums" }}>
                {ratio.toFixed(0)}%
              </div>
              <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500 }}>{labels[i]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Empty state placeholder used inside cards when a slice has no data
const EmptyChart = ({ icon: Icon = AlertCircle, title, subtitle, height = 180 }) => (
  <div style={{
    height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 6, color: T.ink3, textAlign: "center",
  }}>
    <Icon size={24} strokeWidth={1.5} />
    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>{title}</div>
    {subtitle && <div style={{ fontSize: 11.5, color: T.ink3 }}>{subtitle}</div>}
  </div>
)

// ══════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ══════════════════════════════════════════════════════════════════════

async function fetchEverything(userId, period) {
  const { start, end, startStr, endStr } = rangeFor(period)
  const dateRangeString = `${startStr} to ${endStr}`

  const safe = async (p, fb) => { try { return await p } catch { return fb } }

  const [jobsResp, invoicesResp, customersResp, teamResp, salaryData, conversionData, recurringData, lostData] = await Promise.all([
    safe(jobsAPI.getAll(userId, "", "", 1, 10000, null, dateRangeString), { jobs: [] }),
    safe(invoicesAPI.getAll(userId, { page: 1, limit: 1000 }), { invoices: [] }),
    safe(customersAPI.getAll(userId, { page: 1, limit: 1000 }), { customers: [] }),
    safe(teamAPI.getAll(userId), { teamMembers: [] }),
    safe(payrollAPI.getSalaryAnalytics(startStr, endStr, "month"), { timeSeries: [], memberBreakdown: [], summary: {} }),
    safe(analyticsAPI.getConversionMetrics(startStr, endStr, "week"), { summary: {}, bySource: {}, byStage: {}, timeSeries: [] }),
    safe(analyticsAPI.getRecurringConversionMetrics(startStr, endStr, "week"), { summary: {}, byFrequency: {}, timeSeries: [], customerBreakdown: [] }),
    safe(analyticsAPI.getLostCustomersMetrics(startStr, endStr, "week", 90), { summary: {}, timeSeries: [], lostCustomersList: [] }),
  ])

  const jobs = normalizeAPIResponse(jobsResp, "jobs") || []
  const allInvoices = invoicesResp.invoices || []
  const invoices = allInvoices.filter((inv) => {
    const d = new Date(inv.created_at)
    return d >= start && d <= end
  })
  const customers = Array.isArray(customersResp)
    ? customersResp
    : customersResp.customers || customersResp.data || []
  const teamMembers = teamResp.teamMembers || []

  return { start, end, period, jobs, invoices, allInvoices, customers, teamMembers, salaryData, conversionData, recurringData, lostData }
}

// ══════════════════════════════════════════════════════════════════════
// DERIVED METRICS
// ══════════════════════════════════════════════════════════════════════

function computeMetrics(d) {
  if (!d) return null

  // ── Revenue
  const invoiceRevenue = d.invoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0), 0)
  const jobRevenue = d.jobs.reduce((s, j) => s + jobPrice(j), 0)
  const totalRevenue = invoiceRevenue > 0 ? invoiceRevenue : jobRevenue

  // ── Job counts
  const completedJobs = d.jobs.filter((j) => j.status === "completed" || j.status === "paid")
  const scheduledCount = d.jobs.length
  const completedCount = completedJobs.length
  const cancelledCount = d.jobs.filter((j) => j.status === "cancelled").length
  const pendingCount = d.jobs.filter((j) => j.status === "pending").length
  const inProgressCount = d.jobs.filter((j) => j.status === "in_progress").length
  const confirmedCount = d.jobs.filter((j) => j.status === "confirmed").length

  const completedWithPrice = completedJobs.filter((j) => jobPrice(j) > 0)
  const avgJobValue = completedWithPrice.length
    ? completedWithPrice.reduce((s, j) => s + jobPrice(j), 0) / completedWithPrice.length
    : 0
  const avgDurationMin = d.jobs.length
    ? d.jobs.reduce((s, j) => s + (Number(j.service_duration) || 0), 0) / d.jobs.length
    : 0

  // ── Customers
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const newCustomers = d.customers.filter((c) => c.created_at && new Date(c.created_at) >= thirtyDaysAgo).length
  const activeCustomers = d.customers.filter((c) => {
    const s = (c.status || "").toLowerCase()
    return !s || s === "active"
  }).length
  // Repeat = customers with >1 job in window
  const jobsByCustomer = {}
  d.jobs.forEach((j) => { if (j.customer_id) jobsByCustomer[j.customer_id] = (jobsByCustomer[j.customer_id] || 0) + 1 })
  const repeatCustomers = Object.values(jobsByCustomer).filter((n) => n > 1).length
  const repeatRate = activeCustomers > 0 ? Math.round((repeatCustomers / activeCustomers) * 100) : 0

  const ltvByCustomer = {}
  d.jobs.forEach((j) => {
    if (!j.customer_id) return
    ltvByCustomer[j.customer_id] = (ltvByCustomer[j.customer_id] || 0) + jobPrice(j)
  })
  const ltvVals = Object.values(ltvByCustomer)
  const avgLTV = ltvVals.length ? ltvVals.reduce((s, v) => s + v, 0) / ltvVals.length : 0

  // ── Daily revenue series across the period for the line chart
  const dailyMap = {}
  const dayCursor = new Date(d.start)
  while (dayCursor <= d.end) {
    dailyMap[fmtDateLocal(dayCursor)] = 0
    dayCursor.setDate(dayCursor.getDate() + 1)
  }
  const seedFromInvoices = invoiceRevenue > 0
  if (seedFromInvoices) {
    d.invoices.forEach((inv) => {
      const k = fmtDateLocal(new Date(inv.created_at))
      if (k in dailyMap) dailyMap[k] += (parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0)
    })
  } else {
    d.jobs.forEach((j) => {
      const ds = j.scheduled_date ? String(j.scheduled_date).split(" ")[0] : null
      if (ds && ds in dailyMap) dailyMap[ds] += jobPrice(j)
    })
  }
  const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  const dailyValues = daily.map(([, v]) => v)
  const dailyLabels = daily.map(([k]) => {
    const dt = new Date(k)
    return `${dt.toLocaleString("en-US", { month: "short" })} ${dt.getDate()}`
  })

  // ── Monthly revenue: last 7 months
  const monthly = []
  const monthCursor = new Date(); monthCursor.setDate(1)
  for (let i = 0; i < 7; i++) {
    const m = new Date(monthCursor); m.setMonth(m.getMonth() - i)
    monthly.unshift({
      key: `${m.getFullYear()}-${m.getMonth()}`,
      label: m.toLocaleString("en-US", { month: "short" }),
      revenue: 0,
    })
  }
  d.allInvoices.forEach((inv) => {
    const dt = new Date(inv.created_at)
    const k = `${dt.getFullYear()}-${dt.getMonth()}`
    const row = monthly.find((r) => r.key === k)
    if (row) row.revenue += (parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0)
  })

  // ── Weekday distribution
  const weekday = [0, 0, 0, 0, 0, 0, 0]
  d.jobs.forEach((j) => {
    const ds = j.scheduled_date ? String(j.scheduled_date).split(" ")[0] : null
    if (!ds) return
    const dt = new Date(ds)
    if (Number.isNaN(dt.getTime())) return
    // Map JS getDay (0=Sun..6=Sat) → Mon=0..Sun=6
    const jsDay = dt.getDay()
    const idx = jsDay === 0 ? 6 : jsDay - 1
    weekday[idx] += 1
  })

  // ── Service distribution
  const serviceCounts = {}
  d.jobs.forEach((j) => {
    const name = j.service_name || "Other"
    serviceCounts[name] = (serviceCounts[name] || 0) + 1
  })
  const services = Object.entries(serviceCounts)
    .map(([name, count]) => ({ name, count, revenue: 0 }))
    .sort((a, b) => b.count - a.count)
  d.jobs.forEach((j) => {
    const row = services.find((s) => s.name === (j.service_name || "Other"))
    if (row) row.revenue += jobPrice(j)
  })

  // ── Territory distribution
  const territoryCounts = {}
  d.jobs.forEach((j) => {
    const name = j.territory_name || j.territory || j.location_name || "Unassigned"
    territoryCounts[name] = (territoryCounts[name] || 0) + 1
  })
  const territories = Object.entries(territoryCounts)
    .map(([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6)

  // ── Lead source distribution
  const sourceCounts = {}
  d.customers.forEach((c) => {
    const s = c.lead_source || c.source || "Other"
    sourceCounts[s] = (sourceCounts[s] || 0) + 1
  })
  const sources = Object.entries(sourceCounts)
    .map(([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6)

  // ── Cancellation reasons
  const cancelReasons = {}
  d.jobs.filter((j) => j.status === "cancelled").forEach((j) => {
    const r = j.cancellation_reason || j.cancel_reason || "Other"
    cancelReasons[r] = (cancelReasons[r] || 0) + 1
  })
  const cancelList = Object.entries(cancelReasons)
    .map(([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v)

  // ── AR + cash
  const paidInvoices = d.invoices.filter((inv) => (inv.status || "").toLowerCase() === "paid")
  const cashCollected = paidInvoices.reduce((s, inv) => s + (parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0), 0)
  const outstandingAR = d.allInvoices
    .filter((inv) => ["pending", "unpaid", "overdue", "sent"].includes((inv.status || "").toLowerCase()))
    .reduce((s, inv) => s + (parseFloat(inv.total_amount) || parseFloat(inv.amount) || 0), 0)
  const outstandingCount = d.allInvoices
    .filter((inv) => ["pending", "unpaid", "overdue", "sent"].includes((inv.status || "").toLowerCase()))
    .length

  // ── Team performance with real revenue per member
  const teamRows = d.teamMembers.map((m) => {
    const memberId = Number(m.id)
    const memberJobs = d.jobs.filter((j) => {
      const direct = Number(j.team_member_id) === memberId || Number(j.assigned_team_member_id) === memberId
      if (direct) return true
      if (Array.isArray(j.team_assignments)) {
        return j.team_assignments.some((ta) => Number(ta?.team_member_id) === memberId)
      }
      if (Array.isArray(j.job_team_assignments)) {
        return j.job_team_assignments.some((ta) => Number(ta?.team_member_id) === memberId)
      }
      return false
    })
    const memberCompleted = memberJobs.filter((j) => j.status === "completed" || j.status === "paid")
    const memberRevenue = memberJobs.reduce((s, j) => s + jobPrice(j), 0)
    return {
      id: m.id,
      name: `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || "Unknown",
      subrole: m.role || m.title || "Worker",
      color: m.color || T.blue,
      totalJobs: memberJobs.length,
      completedJobs: memberCompleted.length,
      totalRevenue: memberRevenue,
      avgJobValue: memberCompleted.length ? memberRevenue / memberCompleted.length : 0,
    }
  }).sort((a, b) => b.totalRevenue - a.totalRevenue)

  // ── Top customers (by total revenue this period)
  const customerNames = {}
  d.customers.forEach((c) => { customerNames[c.id] = c.first_name || c.name ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.name : (c.email || "Customer") })
  const topCustomers = Object.entries(ltvByCustomer)
    .map(([cid, rev]) => ({
      id: cid,
      name: customerNames[cid] || `Customer #${cid}`,
      revenue: rev,
      jobs: jobsByCustomer[cid] || 0,
      avgTicket: jobsByCustomer[cid] ? rev / jobsByCustomer[cid] : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // ── 12-week stacked mix (split by service category bucket)
  const weeks = 12
  const weekStart = new Date(d.end)
  weekStart.setDate(weekStart.getDate() - (weeks * 7) + 1)
  const weekBuckets = Array.from({ length: weeks }, (_, w) => {
    const start = new Date(weekStart); start.setDate(start.getDate() + w * 7)
    const end = new Date(start); end.setDate(end.getDate() + 6)
    return { start, end, recurring: 0, oneTime: 0, commercial: 0, addons: 0 }
  })
  const allJobsForWeeks = d.jobs
  allJobsForWeeks.forEach((j) => {
    const ds = j.scheduled_date ? String(j.scheduled_date).split(" ")[0] : null
    if (!ds) return
    const dt = new Date(ds)
    const idx = weekBuckets.findIndex((b) => dt >= b.start && dt <= b.end)
    if (idx === -1) return
    const v = jobPrice(j)
    const svc = (j.service_name || "").toLowerCase()
    const isRecurring = !!j.is_recurring || svc.includes("recurring") || svc.includes("weekly") || svc.includes("biweekly")
    const isCommercial = svc.includes("commercial") || svc.includes("office")
    const isAddon = svc.includes("add") || svc.includes("extra")
    if (isAddon) weekBuckets[idx].addons += v
    else if (isCommercial) weekBuckets[idx].commercial += v
    else if (isRecurring) weekBuckets[idx].recurring += v
    else weekBuckets[idx].oneTime += v
  })

  // ── Conversion funnel + summary (prefer API; fallback compute)
  const conv = d.conversionData || {}
  const cs = conv.summary || {}
  const convFunnel = (() => {
    const stages = conv.byStage || {}
    if (Object.keys(stages).length) {
      const order = ["new", "contacted", "quoted", "negotiating", "won"]
      const labels = { new: "New leads", contacted: "Contacted", quoted: "Quoted", negotiating: "Negotiating", won: "Won" }
      return order
        .filter((k) => stages[k] != null)
        .map((k) => ({ label: labels[k], count: stages[k] || 0 }))
    }
    return null
  })()

  return {
    totalRevenue, invoiceRevenue, jobRevenue, cashCollected, outstandingAR, outstandingCount,
    scheduledCount, completedCount, cancelledCount, pendingCount, inProgressCount, confirmedCount,
    avgJobValue, avgDurationMin,
    activeCustomers, newCustomers, repeatRate, avgLTV,
    daily: { values: dailyValues, labels: dailyLabels },
    monthly, weekday, services, territories, sources, cancelList,
    teamRows, topCustomers, weekBuckets,
    conversion: { summary: cs, funnel: convFunnel, bySource: conv.bySource || {}, timeSeries: conv.timeSeries || [] },
    salary: d.salaryData || { timeSeries: [], memberBreakdown: [], summary: {} },
    lost: d.lostData || { summary: {}, timeSeries: [], lostCustomersList: [] },
  }
}

// ══════════════════════════════════════════════════════════════════════
// PERIOD CONTROL
// ══════════════════════════════════════════════════════════════════════

const PeriodControl = ({ value, onChange }) => (
  <div style={{
    display: "inline-flex", gap: 0, background: T.panelSoft,
    borderRadius: 8, padding: 3, border: `1px solid ${T.borderS}`,
  }}>
    {Object.entries(PERIODS).map(([k, v]) => (
      <button
        key={k}
        onClick={() => onChange(k)}
        style={{
          padding: "5px 12px", fontSize: 11.5, fontWeight: 600, border: "none",
          background: value === k ? T.panel : "transparent",
          color: value === k ? T.ink : T.ink2,
          borderRadius: 6, cursor: "pointer",
          boxShadow: value === k ? "0 1px 2px rgba(15,23,42,.08)" : "none",
          textTransform: k === "ytd" || k === "all" ? "uppercase" : "none",
          letterSpacing: k === "ytd" || k === "all" ? ".05em" : "normal",
        }}
      >
        {k.toUpperCase().replace("D", "d")}
      </button>
    ))}
  </div>
)

// ══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════

const OverviewTab = ({ m, data }) => {
  if (!m) return null
  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 5-KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Revenue"        value={moneyShort(m.totalRevenue)} sub={`${m.completedCount} completed`} accent={T.green} />
        <SfKPI label="Jobs done"      value={m.completedCount} sub={`${m.scheduledCount} scheduled`} accent={T.blue} />
        <SfKPI label="New customers"  value={m.newCustomers}   sub={`${m.activeCustomers} active total`} accent={T.purple} />
        <SfKPI label="Avg job value"  value={money(m.avgJobValue)} sub="completed only" accent={T.amber} />
        <SfKPI label="Repeat rate"    value={`${m.repeatRate}%`}   sub="multi-job customers" accent={T.teal} />
      </div>

      {/* 2-col 2-row chart grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <SfCard>
          <SfCardHeader
            title="Revenue trend"
            subtitle={`Daily revenue · ${m.daily.values.length} days`}
            right={
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                  {moneyShort(m.totalRevenue)}
                </span>
              </div>
            }
          />
          <div style={{ paddingTop: 8, paddingBottom: 24 }}>
            {m.daily.values.some((v) => v > 0) ? (
              <LineAreaChart data={m.daily.values} labels={m.daily.labels} height={220} color={T.blue} gradId="ov-rev" />
            ) : (
              <EmptyChart title="No revenue in this period" subtitle="Try expanding the date range" height={220} />
            )}
          </div>
        </SfCard>

        <SfCard>
          <SfCardHeader title="Revenue by service" subtitle={`Top ${Math.min(5, m.services.length)} by volume`} />
          {m.services.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <DonutChart
                data={m.services.slice(0, 5).map((s, i) => ({
                  v: s.revenue > 0 ? Math.round(s.revenue) : s.count,
                  c: [T.green, T.blue, T.purple, T.amber, T.teal][i],
                }))}
                size={120}
                label="Total"
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                {m.services.slice(0, 5).map((s, i) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: [T.green, T.blue, T.purple, T.amber, T.teal][i], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: T.ink2, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                    </span>
                    <span style={{ color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {s.revenue > 0 ? moneyShort(s.revenue) : s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart title="No service data" />
          )}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Jobs completed" subtitle="By weekday" />
          <div style={{ paddingTop: 8 }}>
            {m.weekday.some((v) => v > 0) ? (
              <BarChart data={m.weekday} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} color={T.blue} height={180} />
            ) : <EmptyChart title="No scheduled jobs" />}
          </div>
        </SfCard>

        <SfCard>
          <SfCardHeader title="Lead sources" subtitle="Where customers come from" />
          {m.sources.length ? (
            <HBarList
              data={m.sources.map((s, i) => ({ ...s, c: [T.green, T.blue, T.red, T.purple, T.amber, T.ink3][i] || T.ink3 }))}
              fmt={(v) => v}
            />
          ) : <EmptyChart title="No source data" />}
        </SfCard>

        {/* Team performance footer */}
        <SfCard style={{ gridColumn: "1 / -1" }} padding={false}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>Team performance</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>
                {m.teamRows.length} members · sorted by revenue
              </div>
            </div>
            <div style={{ flex: 1 }} />
          </div>
          {m.teamRows.length ? (
            <div>
              {m.teamRows.slice(0, 8).map((t, i) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "11px 18px",
                  borderBottom: i < Math.min(m.teamRows.length, 8) - 1 ? `1px solid ${T.borderS}` : "none",
                }}>
                  <div style={{ width: 24, fontSize: 11.5, color: T.ink3, fontWeight: 700, fontFamily: "var(--sf-font-mono, monospace)" }}>#{i + 1}</div>
                  <SfAvatar initials={sfInitials(t.name)} color={t.color} size={28} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{t.subrole}</div>
                  </div>
                  <div style={{ width: 80, textAlign: "right" }}>
                    <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Jobs</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{t.totalJobs}</div>
                  </div>
                  <div style={{ width: 120, textAlign: "right" }}>
                    <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Revenue</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{money(t.totalRevenue)}</div>
                  </div>
                  <div style={{ width: 100, textAlign: "right" }}>
                    <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Completion</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                      {pct(t.completedJobs, t.totalJobs)}%
                    </div>
                  </div>
                  <div style={{ width: 90 }}>
                    <MiniSpark data={[3, 5, 4, 6, 5, 7, 8, 6, 7]} color={t.color} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart title="No team data" />
          )}
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// REVENUE TAB
// ══════════════════════════════════════════════════════════════════════

const RevenueTab = ({ m }) => {
  if (!m) return null
  const arpc = m.activeCustomers > 0 ? m.totalRevenue / m.activeCustomers : 0
  const recurringRev = m.services
    .filter((s) => /recurring|weekly|biweekly/i.test(s.name))
    .reduce((s, x) => s + x.revenue, 0)
  const mrr = recurringRev || 0

  const monthlyRev = m.monthly.map((r) => Math.round(r.revenue))
  const monthlyLabels = m.monthly.map((r) => r.label)
  const bestMonth = m.monthly.reduce((best, r) => (r.revenue > (best?.revenue || 0) ? r : best), null)

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 6-KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Total revenue"  value={moneyShort(m.totalRevenue)} sub="this period"        accent={T.green} />
        <SfKPI label="MRR · recurring" value={moneyShort(mrr)} sub={`${pct(mrr, m.totalRevenue)}% of total`} accent={T.blue} />
        <SfKPI label="ARPC"           value={money(arpc)} sub="avg per customer"                  accent={T.purple} />
        <SfKPI label="Cash collected" value={moneyShort(m.cashCollected)} sub={`${pct(m.cashCollected, m.totalRevenue)}% collection`} accent={T.teal} />
        <SfKPI label="Outstanding AR" value={moneyShort(m.outstandingAR)} sub={`${m.outstandingCount} invoices`} accent={T.amber} />
        <SfKPI label="Refunds"        value="—" sub="not yet tracked" accent={T.red} />
      </div>

      {/* Daily revenue hero */}
      <SfCard>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, letterSpacing: "-0.005em" }}>
              Daily revenue · {m.daily.values.length} days
            </div>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              {m.invoiceRevenue > 0 ? "From invoices" : "Estimated from job pricing"}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {moneyShort(m.totalRevenue)}
            </span>
          </div>
        </div>
        <div style={{ paddingTop: 8, paddingBottom: 22 }}>
          {m.daily.values.some((v) => v > 0) ? (
            <LineAreaChart data={m.daily.values} labels={m.daily.labels} height={200} color={T.blue} gradId="rev-tab-grad" />
          ) : (
            <EmptyChart title="No revenue in this period" height={200} />
          )}
        </div>
      </SfCard>

      {/* 2-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Revenue by service" subtitle={`${m.services.length} services · ${m.scheduledCount} jobs`} />
          {m.services.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <DonutChart
                data={m.services.slice(0, 5).map((s, i) => ({
                  v: Math.round(s.revenue || s.count),
                  c: [T.green, T.blue, T.purple, T.amber, T.teal][i],
                }))}
                size={140}
                label="Total"
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                {m.services.slice(0, 5).map((s, i) => {
                  const denom = m.services.slice(0, 5).reduce((a, x) => a + (x.revenue || x.count), 0) || 1
                  const p = Math.round(((s.revenue || s.count) / denom) * 100)
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: [T.green, T.blue, T.purple, T.amber, T.teal][i], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: T.ink2, fontWeight: 500 }}>{s.name}</span>
                      <span style={{ color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(s.revenue)}</span>
                      <span style={{ color: T.ink3, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right" }}>{p}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyChart title="No service data" />
          )}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Monthly trend" subtitle="Last 7 months · invoice-based" />
          <div style={{ paddingTop: 8 }}>
            {monthlyRev.some((v) => v > 0) ? (
              <BarChart data={monthlyRev} labels={monthlyLabels} color={T.green} height={170} valueFmt={(v) => moneyShort(v)} />
            ) : (
              <EmptyChart title="No invoice history" height={170} />
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.borderS}` }}>
            <Mini label="Best month" value={bestMonth?.label || "—"} sub={bestMonth ? moneyShort(bestMonth.revenue) : ""} />
            <Mini label="Avg / mo" value={moneyShort(monthlyRev.reduce((a, b) => a + b, 0) / Math.max(1, monthlyRev.filter((v) => v > 0).length))} sub="last 7 mo" />
            <Mini label="Trend" value={monthlyRev[monthlyRev.length - 1] > monthlyRev[0] ? "↑" : monthlyRev[monthlyRev.length - 1] < monthlyRev[0] ? "↓" : "→"} sub="vs 7 mo ago" />
          </div>
        </SfCard>
      </div>

      {/* 12-week stacked mix */}
      <SfCard>
        <SfCardHeader
          title="Revenue mix · 12 weeks"
          subtitle="Recurring · One-time · Commercial · Add-ons"
          right={
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { l: "Recurring", c: T.green },
                { l: "One-time", c: T.blue },
                { l: "Commercial", c: T.purple },
                { l: "Add-ons", c: T.amber },
              ].map((s) => (
                <span key={s.l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.ink2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }} />
                  {s.l}
                </span>
              ))}
            </div>
          }
        />
        {(() => {
          const totals = m.weekBuckets.map((b) => b.recurring + b.oneTime + b.commercial + b.addons)
          const maxWk = Math.max(1, ...totals)
          if (maxWk < 1) return <EmptyChart title="Not enough job history" height={180} />
          return (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, paddingTop: 6 }}>
              {m.weekBuckets.map((b, w) => {
                const total = totals[w]
                const segs = [
                  { v: b.recurring, c: T.green },
                  { v: b.oneTime, c: T.blue },
                  { v: b.commercial, c: T.purple },
                  { v: b.addons, c: T.amber },
                ]
                return (
                  <div key={w} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column-reverse", position: "relative", borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
                      {segs.map((s, i) => (
                        <div key={i} style={{ width: "100%", height: `${(s.v / maxWk) * 100}%`, background: s.c, borderBottom: i > 0 ? `1px solid ${T.panel}` : "none" }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 9.5, color: T.ink3, fontWeight: 600 }}>W{w + 1}</div>
                    <div style={{ fontSize: 10.5, color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: -2 }}>
                      {total > 0 ? moneyShort(total) : "—"}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </SfCard>

      {/* Top customers */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.greenSoft, color: T.greenDark, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={14} strokeWidth={2.1} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Top customers by revenue</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>This period · {m.topCustomers.length} accounts</div>
          </div>
          <div style={{ flex: 1 }} />
          <SfButton variant="ghost" size="sm" icon={RefreshCw}>Sort: Revenue ↓</SfButton>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "40px 2fr 120px 100px 100px 110px 90px", gap: 14,
          padding: "10px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`,
          fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
        }}>
          <div>#</div>
          <div>Customer</div>
          <div style={{ textAlign: "right" }}>Revenue</div>
          <div style={{ textAlign: "right" }}>Jobs</div>
          <div style={{ textAlign: "right" }}>Avg ticket</div>
          <div style={{ textAlign: "right" }}>LTV (est)</div>
          <div style={{ textAlign: "right" }}>Trend</div>
        </div>
        {m.topCustomers.length ? m.topCustomers.map((c, i, arr) => (
          <div key={c.id} style={{
            display: "grid", gridTemplateColumns: "40px 2fr 120px 100px 100px 110px 90px", gap: 14,
            padding: "11px 18px", alignItems: "center",
            borderBottom: i < arr.length - 1 ? `1px solid ${T.borderS}` : "none",
          }}>
            <div style={{ fontSize: 12, color: T.ink3, fontWeight: 700, fontFamily: "var(--sf-font-mono, monospace)" }}>#{i + 1}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <SfAvatar initials={sfInitials(c.name)} color={[T.purple, T.green, T.blue, T.amber][i % 4]} size={26} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{c.name}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{c.jobs > 1 ? "Returning" : "One-time"}</div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {money(c.revenue)}
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>{c.jobs}</div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>{money(c.avgTicket)}</div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: T.greenDark, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(c.revenue * 4)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <MiniSpark data={[3 + i, 4 + i, 5, 6 + i, 4, 7, 8, c.revenue / Math.max(1, c.jobs * 600)]} color={T.green} />
            </div>
          </div>
        )) : (
          <EmptyChart title="No customer revenue in this period" />
        )}
      </SfCard>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// JOBS TAB
// ══════════════════════════════════════════════════════════════════════

const JobsTab = ({ m }) => {
  if (!m) return null

  // Funnel — map our statuses to design's lifecycle stages
  const funnel = [
    { label: "Scheduled",   count: m.scheduledCount,   color: T.ink2 },
    { label: "Confirmed",   count: m.confirmedCount + m.inProgressCount + m.completedCount, color: T.blue },
    { label: "In progress", count: m.inProgressCount + m.completedCount, color: T.amber },
    { label: "Completed",   count: m.completedCount,   color: T.greenDark },
    { label: "Reviewed",    count: 0,                  color: T.purple },
  ]
  const funnelMax = Math.max(1, ...funnel.map((s) => s.count))
  const completionPct = m.scheduledCount > 0 ? (m.completedCount / m.scheduledCount) * 100 : 0

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 6 KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Jobs scheduled" value={m.scheduledCount} sub="all statuses" accent={T.blue} />
        <SfKPI label="Completed"      value={m.completedCount} sub={`${pct(m.completedCount, m.scheduledCount)}% completion`} accent={T.green} />
        <SfKPI label="Cancelled"      value={m.cancelledCount} sub={`${pct(m.cancelledCount, m.scheduledCount)}% rate`} accent={T.red} />
        <SfKPI label="Pending"        value={m.pendingCount}   sub="awaiting confirm" accent={T.amber} />
        <SfKPI label="In progress"    value={m.inProgressCount} sub="active now" accent={T.purple} />
        <SfKPI label="Avg duration"   value={m.avgDurationMin ? `${(m.avgDurationMin / 60).toFixed(1)}h` : "—"} sub="from service_duration" accent={T.teal} />
      </div>

      {/* Funnel */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Workflow size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Job lifecycle funnel</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Stage counts · this period</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: T.ink3, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Completion
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: T.greenDark, fontVariantNumeric: "tabular-nums" }}>
              {completionPct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
          {funnel.map((s, i) => {
            const stagePct = (s.count / funnelMax) * 100
            const drop = i > 0 ? funnel[i - 1].count - s.count : 0
            const dropPct = i > 0 && funnel[i - 1].count > 0 ? Math.round((drop / funnel[i - 1].count) * 100) : 0
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 100, fontSize: 12, fontWeight: 600, color: T.ink }}>{s.label}</div>
                <div style={{ flex: 1, position: "relative", height: 38 }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${Math.max(stagePct, 2)}%`,
                    background: `linear-gradient(90deg, ${s.color}ee, ${s.color}cc)`,
                    borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 14,
                  }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>
                      {s.count}
                    </span>
                    <span style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, fontWeight: 600, marginLeft: 8 }}>
                      {Math.round(stagePct)}%
                    </span>
                  </div>
                </div>
                <div style={{ width: 140, textAlign: "right" }}>
                  {i > 0 && drop > 0 ? (
                    <>
                      <div style={{ fontSize: 12, color: T.redDark, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        −{drop} <span style={{ color: T.ink3, fontWeight: 500 }}>({dropPct}%)</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>drop from {funnel[i - 1].label.toLowerCase()}</div>
                    </>
                  ) : i === 0 ? (
                    <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                      Starting volume
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </SfCard>

      {/* Type + Territory */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Jobs by type" subtitle={`${m.scheduledCount} jobs in scope`} />
          {m.services.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <DonutChart
                data={m.services.slice(0, 5).map((s, i) => ({ v: s.count, c: [T.green, T.blue, T.purple, T.amber, T.teal][i] }))}
                size={140}
                label="Jobs"
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
                {m.services.slice(0, 5).map((s, i) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: [T.green, T.blue, T.purple, T.amber, T.teal][i], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: T.ink2, fontWeight: 500 }}>{s.name}</span>
                    <span style={{ color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyChart title="No jobs by service" />}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Jobs by territory" subtitle="Where the work is" />
          {m.territories.length ? (
            <HBarList data={m.territories.map((r, i) => ({ ...r, c: [T.blue, T.purple, T.green, T.amber, T.red, T.teal][i] || T.ink3 }))} />
          ) : <EmptyChart title="No territory data" />}
        </SfCard>
      </div>

      {/* Weekday + Cancellations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Jobs by weekday" subtitle="Period-wide totals" />
          <div style={{ paddingTop: 8 }}>
            {m.weekday.some((v) => v > 0) ? (
              <BarChart data={m.weekday} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} color={T.blue} height={180} />
            ) : <EmptyChart title="No scheduled jobs" />}
          </div>
        </SfCard>

        <SfCard>
          <SfCardHeader title="Cancellation reasons" subtitle={`${m.cancelledCount} cancellations`} />
          {m.cancelList.length ? (
            <HBarList data={m.cancelList.map((r, i) => ({ ...r, c: [T.amber, T.red, T.blue, T.purple, T.redDark, T.ink3][i] || T.ink3 }))} />
          ) : <EmptyChart title="No cancellations" subtitle="That's good news" />}
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TEAM TAB
// ══════════════════════════════════════════════════════════════════════

const TeamTab = ({ m }) => {
  if (!m) return null
  const workers = m.teamRows
  const avgJobs = workers.length ? workers.reduce((s, w) => s + w.totalJobs, 0) / workers.length : 0
  const avgRev = workers.length ? workers.reduce((s, w) => s + w.totalRevenue, 0) / workers.length : 0

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 6 KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Workers active" value={workers.length} sub="all members" accent={T.blue} />
        <SfKPI label="Avg jobs / worker" value={Math.round(avgJobs)} sub="this period" accent={T.purple} />
        <SfKPI label="Avg rev / worker" value={moneyShort(avgRev)} sub="this period" accent={T.green} />
        <SfKPI label="Avg rating" value="—" sub="not yet tracked" accent={T.amber} />
        <SfKPI label="Utilization" value="—" sub="needs schedule data" accent={T.teal} />
        <SfKPI label="On-time arrival" value="—" sub="needs check-in data" accent={T.green} />
      </div>

      {/* Leaderboard */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Worker performance</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Revenue · jobs · completion</div>
          </div>
          <div style={{ flex: 1 }} />
          <SfButton variant="ghost" size="sm" icon={RefreshCw}>Sort: Revenue ↓</SfButton>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "40px 1.6fr 110px 90px 110px 130px", gap: 14,
          padding: "10px 18px", background: T.panel, borderBottom: `1px solid ${T.borderS}`,
          fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
        }}>
          <div>#</div>
          <div>Worker</div>
          <div style={{ textAlign: "right" }}>Revenue</div>
          <div style={{ textAlign: "right" }}>Jobs</div>
          <div style={{ textAlign: "right" }}>Completion</div>
          <div style={{ textAlign: "right" }}>Trend</div>
        </div>
        {workers.length ? workers.map((w, i, arr) => (
          <div key={w.id} style={{
            display: "grid", gridTemplateColumns: "40px 1.6fr 110px 90px 110px 130px", gap: 14,
            padding: "12px 18px", alignItems: "center",
            borderBottom: i < arr.length - 1 ? `1px solid ${T.borderS}` : "none",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: i === 0 ? `${T.amber}22` : i === 1 ? `${T.ink3}22` : i === 2 ? "#A87C4F22" : T.panelAlt,
              color:      i === 0 ? T.amberDark : i === 1 ? T.ink2 : i === 2 ? "#A87C4F" : T.ink3,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            }}>{i + 1}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <SfAvatar initials={sfInitials(w.name)} color={w.color} size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{w.name}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{w.subrole}</div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {money(w.totalRevenue)}
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>
              {w.totalJobs}
            </div>
            <div style={{ textAlign: "right", fontSize: 13.5, fontWeight: 700, color: pct(w.completedJobs, w.totalJobs) >= 90 ? T.greenDark : T.amberDark, fontVariantNumeric: "tabular-nums" }}>
              {pct(w.completedJobs, w.totalJobs)}%
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <MiniSpark data={[3, 5, 4, 6, 5, 7, 8, 6]} color={w.color} />
            </div>
          </div>
        )) : (
          <EmptyChart title="No team data" />
        )}
      </SfCard>

      {/* Quality + Utilization placeholders */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Quality issues" subtitle="Customer-reported · this period" />
          <EmptyChart icon={Star} title="No quality reports tracked" subtitle="Wire up review imports to populate" />
        </SfCard>

        <SfCard>
          <SfCardHeader title="Utilization distribution" subtitle="Hours worked vs available" />
          <EmptyChart icon={TrendingUp} title="Needs schedule data" subtitle="Hours-tracking not yet wired" />
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// CUSTOMERS TAB
// ══════════════════════════════════════════════════════════════════════

const cohortColor = (v) => {
  if (v === null || v === undefined) return T.panelSoft
  if (v >= 0.85) return T.greenDark
  if (v >= 0.75) return "#52BC7C"
  if (v >= 0.65) return "#86D3A2"
  if (v >= 0.50) return "#BBE5C8"
  return "#F0E0D0"
}

const CustomersTab = ({ m, data }) => {
  if (!m) return null
  const lost = m.lost?.summary?.total || m.lost?.lostCustomersList?.length || 0
  const churnRate = m.activeCustomers > 0 ? ((lost / m.activeCustomers) * 100).toFixed(1) : "0.0"
  const recurringShare = (() => {
    const totalCust = m.activeCustomers || 1
    const recCount = (data?.customers || []).filter((c) => (c.customer_type || "").toLowerCase().includes("recurring") || c.is_recurring).length
    return Math.round((recCount / totalCust) * 100)
  })()

  // ── Build cohort matrix from customer creation dates + their job activity
  // Cohorts = last 6 months; M0..M5 = months since cohort
  const cohorts = (() => {
    const now = new Date()
    const cohortMonths = []
    for (let i = 5; i >= 0; i--) {
      const c = new Date(now.getFullYear(), now.getMonth() - i, 1)
      cohortMonths.push(c)
    }
    return cohortMonths.map((cm) => {
      const members = (data?.customers || []).filter((c) => {
        if (!c.created_at) return false
        const cd = new Date(c.created_at)
        return cd.getFullYear() === cm.getFullYear() && cd.getMonth() === cm.getMonth()
      })
      const memberIds = new Set(members.map((c) => String(c.id)))
      const size = members.length
      const retention = []
      for (let mo = 0; mo < 6; mo++) {
        const target = new Date(cm.getFullYear(), cm.getMonth() + mo, 1)
        if (target > now) { retention.push(null); continue }
        if (size === 0) { retention.push(null); continue }
        if (mo === 0) { retention.push(1.0); continue }
        const activeInMonth = new Set(
          (data?.jobs || [])
            .filter((j) => {
              const ds = j.scheduled_date ? String(j.scheduled_date).split(" ")[0] : null
              if (!ds) return false
              const jd = new Date(ds)
              if (jd.getFullYear() !== target.getFullYear() || jd.getMonth() !== target.getMonth()) return false
              return j.customer_id && memberIds.has(String(j.customer_id))
            })
            .map((j) => String(j.customer_id))
        )
        retention.push(activeInMonth.size / size)
      }
      return {
        cohort: cm.toLocaleString("en-US", { month: "short", year: "numeric" }),
        size,
        retention,
      }
    })
  })()

  // New customers per week (last 12 weeks)
  const newPerWeek = (() => {
    const buckets = Array.from({ length: 12 }, () => 0)
    const now = new Date()
    const earliest = new Date(now); earliest.setDate(earliest.getDate() - 12 * 7 + 1)
    ;(data?.customers || []).forEach((c) => {
      if (!c.created_at) return
      const cd = new Date(c.created_at)
      if (cd < earliest || cd > now) return
      const idx = Math.min(11, Math.floor((cd - earliest) / (7 * 24 * 60 * 60 * 1000)))
      buckets[idx] += 1
    })
    return buckets
  })()

  const lostReasons = (() => {
    const reasons = {}
    ;(m.lost?.lostCustomersList || []).forEach((c) => {
      const r = c.reason || c.churn_reason || "Unknown"
      reasons[r] = (reasons[r] || 0) + 1
    })
    return Object.entries(reasons).map(([l, v]) => ({ l, v })).sort((a, b) => b.v - a.v).slice(0, 6)
  })()

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Active customers" value={m.activeCustomers} sub="all-time" accent={T.blue} />
        <SfKPI label="New · 30d" value={m.newCustomers} sub="created" accent={T.green} />
        <SfKPI label="Churn rate" value={`${churnRate}%`} sub={`${lost} lost`} accent={T.red} />
        <SfKPI label="Avg LTV" value={money(m.avgLTV)} sub="lifetime spend" accent={T.purple} />
        <SfKPI label="Recurring share" value={`${recurringShare}%`} sub="of active" accent={T.teal} />
        <SfKPI label="Reactivated" value="—" sub="needs win-back wiring" accent={T.amber} />
      </div>

      {/* Cohort matrix */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Cohort retention · monthly</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>% of each acquisition cohort with a job that month</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.ink3 }}>
            <span>Lower</span>
            {["#F0E0D0", "#BBE5C8", "#86D3A2", "#52BC7C", T.greenDark].map((c, i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: `1px solid ${T.borderS}` }} />
            ))}
            <span>Higher</span>
          </div>
        </div>
        <div style={{ padding: "14px 18px" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "130px 70px repeat(6, 1fr)", gap: 6, marginBottom: 6,
          }}>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>Cohort</div>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", textAlign: "right", paddingRight: 4 }}>Size</div>
            {["M0", "M1", "M2", "M3", "M4", "M5"].map((mh) => (
              <div key={mh} style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", textAlign: "center" }}>
                {mh}
              </div>
            ))}
          </div>
          {cohorts.map((c) => (
            <div key={c.cohort} style={{ display: "grid", gridTemplateColumns: "130px 70px repeat(6, 1fr)", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{c.cohort}</div>
              <div style={{ fontSize: 11.5, color: T.ink2, textAlign: "right", paddingRight: 4, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{c.size}</div>
              {c.retention.map((v, i) => {
                const c2 = cohortColor(v)
                const empty = v === null || v === undefined
                return (
                  <div key={i} style={{
                    height: 38, borderRadius: 5,
                    background: empty ? "transparent" : c2,
                    border: empty ? `1px dashed ${T.borderS}` : `1px solid ${T.borderS}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    color: empty ? T.ink4 : v >= 0.65 ? "#fff" : T.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {empty ? "—" : `${Math.round(v * 100)}%`}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </SfCard>

      {/* Per-week + segments */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="New customers per week" subtitle="Last 12 weeks" />
          <div style={{ paddingTop: 8 }}>
            {newPerWeek.some((v) => v > 0) ? (
              <BarChart data={newPerWeek} labels={Array.from({ length: 12 }, (_, i) => `W${i + 1}`)} color={T.green} height={170} />
            ) : <EmptyChart title="No new customers in window" height={170} />}
          </div>
        </SfCard>

        <SfCard>
          <SfCardHeader title="Acquisition sources" subtitle="By lead_source field" />
          {m.sources.length ? (
            <HBarList
              data={m.sources.map((s, i) => ({ ...s, c: [T.green, T.blue, T.red, T.purple, T.amber, T.ink3][i] || T.ink3 }))}
              fmt={(v) => v}
            />
          ) : <EmptyChart title="No source data" />}
        </SfCard>
      </div>

      {/* Lost reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Churn reasons" subtitle={`${lost} lost · this period`} />
          {lostReasons.length ? (
            <HBarList data={lostReasons.map((r, i) => ({ ...r, c: [T.ink3, T.amber, T.red, T.purple, T.blue, T.redDark][i] || T.ink3 }))} />
          ) : <EmptyChart title="No churn reasons logged" />}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Lost customer list" subtitle="From inactive-90d threshold" />
          {(m.lost?.lostCustomersList || []).length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(m.lost.lostCustomersList || []).slice(0, 8).map((c, i) => (
                <div key={c.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.panelAlt, borderRadius: 7 }}>
                  <SfAvatar initials={sfInitials(c.name || c.customer_name || "?")} color={T.red} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{c.name || c.customer_name || "Customer"}</div>
                    <div style={{ fontSize: 11, color: T.ink3 }}>{c.last_job_date ? `Last job ${new Date(c.last_job_date).toLocaleDateString()}` : "Inactive"}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.redDark, fontWeight: 700 }}>{c.days_inactive ? `${c.days_inactive}d` : "—"}</div>
                </div>
              ))}
            </div>
          ) : <EmptyChart title="No inactive customers" />}
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SALARY TAB
// ══════════════════════════════════════════════════════════════════════

const SalaryTab = ({ m }) => {
  if (!m) return null
  const sum = m.salary?.summary || {}
  const total = sum.totalPayroll || 0
  const hourly = sum.totalHourlyPayroll || 0
  const commission = sum.totalCommissionPayroll || 0
  const memberCount = sum.memberCount || (m.salary?.memberBreakdown || []).length

  // Build dual-bar series from salary.timeSeries (payroll) + monthly revenue
  const tsLabels = (m.salary?.timeSeries || []).slice(-7).map((row) => row.label || row.period || "—")
  const payrollSeries = (m.salary?.timeSeries || []).slice(-7).map((row) => Number(row.total || row.payroll || 0))
  const revenueSeries = m.monthly.slice(-7).map((r) => Math.round(r.revenue))
  const dualLen = Math.max(payrollSeries.length, revenueSeries.length, 7)
  const padded = (arr) => Array.from({ length: dualLen }, (_, i) => arr[i] ?? 0)
  const dualLabels = tsLabels.length === dualLen ? tsLabels : m.monthly.slice(-dualLen).map((r) => r.label)

  const pctOfRev = m.totalRevenue > 0 ? ((total / m.totalRevenue) * 100).toFixed(1) : "—"

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Total payroll" value={moneyShort(total)} sub={`across ${memberCount} people`} accent={T.green} />
        <SfKPI label="% of revenue" value={total > 0 && m.totalRevenue > 0 ? `${pctOfRev}%` : "—"} sub="healthy band 40–50%" accent={T.blue} />
        <SfKPI label="Hourly payroll" value={moneyShort(hourly)} sub={`${sum.hourlyOnlyCount || 0} hourly`} accent={T.purple} />
        <SfKPI label="Commission" value={moneyShort(commission)} sub={`${sum.commissionOnlyCount || 0} commission`} accent={T.amber} />
        <SfKPI label="Hybrid" value={sum.hybridCount || 0} sub="hourly + commission" accent={T.teal} />
        <SfKPI label="Tips + bonus" value="—" sub="not yet broken out" accent={T.red} />
      </div>

      {/* Dual-bar payroll vs revenue */}
      <SfCard>
        <SfCardHeader
          title="Payroll vs revenue"
          subtitle="Side-by-side trend · % ratio below each pair"
          right={
            <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.ink2 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: T.green }} />Revenue
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: T.amberDark }} />Payroll
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: T.blueDark }} />% of rev
              </span>
            </div>
          }
        />
        {payrollSeries.some((v) => v > 0) || revenueSeries.some((v) => v > 0) ? (
          <DualBarChart revenue={padded(revenueSeries)} payroll={padded(payrollSeries)} labels={dualLabels} />
        ) : (
          <EmptyChart title="Not enough payroll history" height={200} />
        )}
      </SfCard>

      {/* Per-person cost table */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <DollarSign size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Per-person payroll cost</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>From payroll engine · this period</div>
          </div>
          <div style={{ flex: 1 }} />
          <SfButton variant="ghost" size="sm" icon={RefreshCw}>Sort: Cost ↓</SfButton>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1.6fr 110px 100px 110px 100px 110px 110px", gap: 14,
          padding: "10px 18px", background: T.panel, borderBottom: `1px solid ${T.borderS}`,
          fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
        }}>
          <div>Person</div>
          <div style={{ textAlign: "right" }}>Type</div>
          <div style={{ textAlign: "right" }}>Hours</div>
          <div style={{ textAlign: "right" }}>Hourly $</div>
          <div style={{ textAlign: "right" }}>Commission</div>
          <div style={{ textAlign: "right" }}>Total cost</div>
          <div style={{ textAlign: "right" }}>Cost / job</div>
        </div>
        {(m.salary?.memberBreakdown || []).length ? (m.salary.memberBreakdown).map((p, i, arr) => {
          const jobs = p.jobsCount || p.jobs || 0
          const totalCost = Number(p.totalPayroll || p.total || 0)
          const hourlyCost = Number(p.hourlyPayroll || 0)
          const commissionCost = Number(p.commissionPayroll || 0)
          const hours = Number(p.totalHours || p.hours || 0)
          const costPerJob = jobs > 0 ? Math.round(totalCost / jobs) : null
          const name = p.name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "—"
          const type = p.compensationType || (hourlyCost > 0 && commissionCost > 0 ? "Hybrid" : commissionCost > 0 ? "Commission" : hourlyCost > 0 ? "Hourly" : "—")
          return (
            <div key={p.id || i} style={{
              display: "grid", gridTemplateColumns: "1.6fr 110px 100px 110px 100px 110px 110px", gap: 14,
              padding: "12px 18px", alignItems: "center",
              borderBottom: i < arr.length - 1 ? `1px solid ${T.borderS}` : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SfAvatar initials={sfInitials(name)} color={[T.blue, T.purple, T.green, T.amber][i % 4]} size={28} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{name}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{p.role || p.subrole || "Member"}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12.5, color: T.ink2 }}>{type}</div>
              <div style={{ textAlign: "right", fontSize: 12, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>
                {hours > 0 ? `${hours.toFixed(0)}h` : "—"}
              </div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                {hourlyCost > 0 ? money(hourlyCost) : "—"}
              </div>
              <div style={{ textAlign: "right", fontSize: 12, color: T.greenDark, fontVariantNumeric: "tabular-nums" }}>
                {commissionCost > 0 ? money(commissionCost) : "—"}
              </div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                {money(totalCost)}
              </div>
              <div style={{
                textAlign: "right", fontSize: 13, fontWeight: 600,
                color: costPerJob === null ? T.ink3 : costPerJob < 80 ? T.greenDark : costPerJob < 110 ? T.ink : T.amberDark,
                fontVariantNumeric: "tabular-nums",
              }}>
                {costPerJob === null ? "—" : `$${costPerJob}`}
              </div>
            </div>
          )
        }) : (
          <EmptyChart title="No payroll breakdown" subtitle="Make sure payroll engine has run for this period" />
        )}
      </SfCard>

      {/* Hourly vs Commission split */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Hourly vs commission split" subtitle="Where the money goes" />
          {hourly + commission > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <DonutChart
                data={[{ v: Math.round(hourly), c: T.blue }, { v: Math.round(commission), c: T.purple }]}
                size={140}
                label={moneyShort(hourly + commission)}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { l: "Hourly", v: hourly, c: T.blue, sub: `${sum.hourlyOnlyCount || 0} hourly + ${sum.hybridCount || 0} hybrid` },
                  { l: "Commission", v: commission, c: T.purple, sub: `${sum.commissionOnlyCount || 0} commission + ${sum.hybridCount || 0} hybrid` },
                ].map((r) => {
                  const p = Math.round((r.v / Math.max(1, hourly + commission)) * 100)
                  return (
                    <div key={r.l}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: r.c }} />
                        <span style={{ flex: 1, color: T.ink, fontWeight: 600 }}>{r.l}</span>
                        <span style={{ color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(r.v)}</span>
                        <span style={{ color: T.ink3, fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right", fontWeight: 600 }}>{p}%</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: T.ink3, marginLeft: 16, marginBottom: 6 }}>{r.sub}</div>
                      <div style={{ height: 5, background: T.panelSoft, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p}%`, height: "100%", background: r.c, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <EmptyChart title="No payroll split data" />}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Payroll trend" subtitle={`${payrollSeries.length} periods`} />
          <div style={{ paddingTop: 8 }}>
            {payrollSeries.some((v) => v > 0) ? (
              <BarChart data={payrollSeries} labels={tsLabels.length === payrollSeries.length ? tsLabels : Array.from({ length: payrollSeries.length }, (_, i) => `P${i + 1}`)} color={T.amberDark} height={170} valueFmt={moneyShort} />
            ) : <EmptyChart title="No payroll history" height={170} />}
          </div>
          {payrollSeries.some((v) => v > 0) && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 6, fontSize: 11.5, color: T.amberDark, lineHeight: 1.5 }}>
              <b>Heads up:</b> Compare each period's payroll % vs revenue trend above. Aim for 40–50% band.
            </div>
          )}
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// CONVERSION TAB
// ══════════════════════════════════════════════════════════════════════

const ConversionTab = ({ m }) => {
  if (!m) return null
  const c = m.conversion || {}
  const s = c.summary || {}

  const funnelStages = c.funnel || []
  const stagesForRender = funnelStages.length
    ? funnelStages.map((stage, i) => ({
        label: stage.label,
        count: stage.count,
        color: [T.ink2, T.blue, T.purple, T.amber, T.greenDark][i] || T.green,
        pct: i === 0 ? 1 : (funnelStages[0].count > 0 ? stage.count / funnelStages[0].count : 0),
      }))
    : null

  const bySourceList = Object.entries(c.bySource || {})
    .map(([source, v]) => ({
      l: source,
      total: v.total || v.totalLeads || (v.won || 0) + (v.lost || 0),
      won: v.won || v.wonCount || 0,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)

  const tsValues = (c.timeSeries || []).map((p) => Math.round(((p.wonRate || p.conversionRate || 0) * 100)))
  const tsLabels = (c.timeSeries || []).map((p) => p.label || p.period || "—")

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <SfKPI label="Leads" value={s.totalLeads ?? "—"} sub="this period" accent={T.blue} />
        <SfKPI label="Lead → customer" value={s.conversionRate != null ? `${(s.conversionRate * 100).toFixed(1)}%` : "—"} sub="overall win rate" accent={T.green} />
        <SfKPI label="Avg time to close" value={s.avgTimeToClose != null ? `${Number(s.avgTimeToClose).toFixed(1)}d` : "—"} sub="median lead age" accent={T.purple} />
        <SfKPI label="Pipeline value" value={s.pipelineValue != null ? moneyShort(s.pipelineValue) : "—"} sub="open leads" accent={T.amber} />
        <SfKPI label="Time to 1st touch" value={s.timeToFirstTouch != null ? `${Number(s.timeToFirstTouch).toFixed(0)} min` : "—"} sub="avg response" accent={T.teal} />
        <SfKPI label="Lost" value={s.lostCount ?? "—"} sub={s.lossRate != null ? `${(s.lossRate * 100).toFixed(1)}% loss rate` : ""} accent={T.red} />
      </div>

      {/* Funnel */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Workflow size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Lead → customer funnel</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Stage-by-stage conversion</div>
          </div>
          <div style={{ flex: 1 }} />
          {stagesForRender && (
            <>
              <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>End-to-end</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.greenDark, fontVariantNumeric: "tabular-nums" }}>
                {(stagesForRender[stagesForRender.length - 1].pct * 100).toFixed(1)}%
              </span>
            </>
          )}
        </div>
        {stagesForRender ? (
          <div style={{ padding: "20px 60px", display: "flex", flexDirection: "column", gap: 6 }}>
            {stagesForRender.map((stage, i) => {
              const widthPct = stage.pct * 100
              const drop = i > 0 ? stagesForRender[i - 1].count - stage.count : 0
              const dropPct = i > 0 && stagesForRender[i - 1].count > 0 ? Math.round((drop / stagesForRender[i - 1].count) * 100) : 0
              return (
                <div key={stage.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
                    <div style={{
                      width: `${Math.max(widthPct, 12)}%`, height: 54,
                      background: `linear-gradient(135deg, ${stage.color}, ${stage.color}dd)`,
                      clipPath: "polygon(4% 0, 96% 0, 92% 100%, 8% 100%)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                    }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", opacity: .9 }}>
                        {stage.label}
                      </span>
                      <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                        {stage.count}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: 160, textAlign: "left" }}>
                    {i > 0 ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                          {Math.round(stage.pct * 100)}% <span style={{ color: T.ink3, fontWeight: 500, fontSize: 11 }}>of starting</span>
                        </div>
                        {drop > 0 && (
                          <div style={{ fontSize: 11, color: T.redDark, marginTop: 2, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            −{drop} ({dropPct}% drop)
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                        Top of funnel
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <EmptyChart icon={Target} title="No funnel data" subtitle="Backend conversion endpoint returned empty" />}
      </SfCard>

      {/* Win rate by source + Lost reasons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <SfCard>
          <SfCardHeader title="Win rate by source" subtitle="Among leads with a final outcome" />
          {bySourceList.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {bySourceList.map((r) => {
                const rate = Math.round((r.won / r.total) * 100)
                const c2 = rate >= 50 ? T.greenDark : rate >= 30 ? T.amberDark : T.redDark
                return (
                  <div key={r.l}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                      <span style={{ flex: 1, color: T.ink, fontWeight: 600 }}>{r.l}</span>
                      <span style={{ color: T.ink3, fontSize: 11, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                        {r.won} / {r.total}
                      </span>
                      <span style={{ color: c2, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 42, textAlign: "right" }}>
                        {rate}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: T.panelSoft, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${rate}%`, height: "100%", background: c2, borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : <EmptyChart title="No source breakdown" />}
        </SfCard>

        <SfCard>
          <SfCardHeader title="Win rate trend" subtitle={`${tsValues.length} periods · weekly`} />
          <div style={{ paddingTop: 8 }}>
            {tsValues.some((v) => v > 0) ? (
              <BarChart data={tsValues} labels={tsLabels} color={T.greenDark} height={170} valueFmt={(v) => `${v}%`} />
            ) : <EmptyChart title="No trend data" height={170} />}
          </div>
        </SfCard>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// MAIN SHELL
// ══════════════════════════════════════════════════════════════════════

const AnalyticsV2 = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState("overview")
  const [period, setPeriod] = useState("30d")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (user && !isAccountOwner(user)) navigate("/dashboard", { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (!user?.id || !isAccountOwner(user)) return
    let cancelled = false
    const run = async () => {
      if (data) setRefreshing(true); else setLoading(true)
      setError("")
      try {
        const next = await fetchEverything(user.id, period)
        if (!cancelled) setData(next)
      } catch (e) {
        if (!cancelled) setError("Failed to load analytics. Please retry.")
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false) }
      }
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, period])

  const metrics = useMemo(() => computeMetrics(data), [data])

  const subtitles = {
    overview:   "At-a-glance summary across all metrics",
    revenue:    "Revenue mix · growth · recurring vs. one-time · top customers",
    jobs:       "Volume · completion · cancellations · types · day-of-week",
    team:       "Worker productivity · quality · leaderboard",
    customers:  "Cohort retention · LTV · churn · acquisition",
    salary:     "Payroll cost · % of revenue · per-worker breakdown",
    conversion: "Lead → customer funnel · win rate · time-to-close",
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--sf-bg, #f7f8fa)" }}>
      <MobileHeader />

      <SfPageHeader
        eyebrow="Insights"
        title="Analytics"
        subtitle={subtitles[tab]}
        actions={
          <>
            <PeriodControl value={period} onChange={setPeriod} />
            <SfButton variant="secondary" size="md" icon={Download}>Export</SfButton>
          </>
        }
        tabs={
          <>
            <SfTab active={tab === "overview"}   onClick={() => setTab("overview")}>Overview</SfTab>
            <SfTab active={tab === "revenue"}    onClick={() => setTab("revenue")}>Revenue</SfTab>
            <SfTab active={tab === "jobs"}       onClick={() => setTab("jobs")}>Jobs</SfTab>
            <SfTab active={tab === "team"}       onClick={() => setTab("team")}>Team</SfTab>
            <SfTab active={tab === "customers"}  onClick={() => setTab("customers")}>Customers</SfTab>
            <SfTab active={tab === "salary"}     onClick={() => setTab("salary")}>Salary</SfTab>
            <SfTab active={tab === "conversion"} onClick={() => setTab("conversion")}>Conversion</SfTab>
          </>
        }
      />

      {loading && (
        <div style={{ padding: "60px 24px", textAlign: "center", color: T.ink3 }}>
          <RefreshCw size={20} className="animate-spin" style={{ display: "inline-block", marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Loading analytics…</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ margin: "14px 24px", padding: 12, background: T.redSoft, border: `1px solid ${T.red}33`, borderRadius: 8, color: T.redDark, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && metrics && (
        <>
          {refreshing && (
            <div style={{ padding: "6px 24px 0", fontSize: 11.5, color: T.ink3, display: "flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={11} className="animate-spin" /> Refreshing…
            </div>
          )}
          {tab === "overview"   && <OverviewTab   m={metrics} data={data} />}
          {tab === "revenue"    && <RevenueTab    m={metrics} data={data} />}
          {tab === "jobs"       && <JobsTab       m={metrics} data={data} />}
          {tab === "team"       && <TeamTab       m={metrics} data={data} />}
          {tab === "customers"  && <CustomersTab  m={metrics} data={data} />}
          {tab === "salary"     && <SalaryTab     m={metrics} data={data} />}
          {tab === "conversion" && <ConversionTab m={metrics} data={data} />}
        </>
      )}
    </div>
  )
}

export default AnalyticsV2
