"use client"

// Design-pack Team page tabs (Teams · Schedule · Payroll · Performance),
// wired to live data from teamAPI / jobsAPI / payrollAPI. Members tab uses
// the existing list in serviceflow-team.jsx — only these four are new.

import { useEffect, useMemo, useState } from "react"
import {
  Users, Briefcase, ChevronLeft, ChevronRight, Calendar as CalIcon,
  DollarSign, Star, Clock, AlertCircle, Download, RefreshCw, ArrowRight,
  Search, Mail, Phone, Edit, MoreHorizontal, UserPlus, ChevronDown,
} from "lucide-react"
import { jobsAPI, payrollAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import {
  SfCard, SfCardHeader, SfKPI, SfButton, SfAvatar, sfInitials, SfFilterChip,
} from "./sf-primitives"

// ── Tokens ──────────────────────────────────────────────────────────────
const T = {
  ink: "var(--sf-ink)", ink2: "var(--sf-ink-2)", ink3: "var(--sf-ink-3)", ink4: "var(--sf-ink-4, #94a3b8)",
  panel: "var(--sf-panel)", panelSoft: "var(--sf-panel-soft)", panelAlt: "var(--sf-panel-alt, #f8fafc)",
  border: "var(--sf-border)", borderS: "var(--sf-border-soft)",
  blue: "var(--sf-blue)", blueSoft: "var(--sf-blue-soft)", blueDark: "var(--sf-blue-dark)",
  green: "var(--sf-green)", greenSoft: "var(--sf-green-soft)", greenDark: "var(--sf-green-dark)",
  amber: "var(--sf-amber)", amberSoft: "var(--sf-amber-soft)", amberDark: "var(--sf-amber-dark)",
  red: "var(--sf-red)", redSoft: "var(--sf-red-soft)", redDark: "var(--sf-red-dark)",
  purple: "var(--sf-purple, #8b5cf6)", purpleSoft: "var(--sf-purple-soft, #ede9fe)",
}

// ── Helpers ─────────────────────────────────────────────────────────────
const fullName = (m) => `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email || "Member"
const memberRoleKind = (m) => {
  const r = (m.role || "").toLowerCase()
  if (r.includes("owner") || r.includes("admin")) return "owner"
  if (r.includes("manager")) return "manager"
  if (r.includes("scheduler")) return "scheduler"
  if (r.includes("worker") || r.includes("technician")) return "worker"
  return m.is_service_provider ? "worker" : "manager"
}
const ROLE_META = {
  owner:     { label: "Owner",     c: T.amberDark, bg: T.amberSoft },
  manager:   { label: "Manager",   c: T.blueDark,  bg: T.blueSoft },
  scheduler: { label: "Scheduler", c: T.purple,    bg: T.purpleSoft },
  worker:    { label: "Worker",    c: T.greenDark, bg: T.greenSoft },
}
const STATUS_META = {
  active:     { label: "Active",   c: T.greenDark, bg: T.greenSoft },
  invited:    { label: "Invited",  c: T.purple,    bg: T.purpleSoft },
  pending:    { label: "Invited",  c: T.purple,    bg: T.purpleSoft },
  inactive:   { label: "Inactive", c: T.ink3,      bg: T.panelSoft },
  on_leave:   { label: "On leave", c: T.amberDark, bg: T.amberSoft },
}

const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString()}`
const moneyShort = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
const fmtDate = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Parse "9:00 AM - 6:00 PM" → 9 hours, or return 0 for unavailable days
const parseDayHours = (dayObj) => {
  if (!dayObj?.available || !dayObj?.hours) return 0
  const m = String(dayObj.hours).match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i)
  if (!m) return 8
  const to24 = (h, mn, ap) => {
    let hh = Number(h)
    if (ap.toUpperCase() === "PM" && hh !== 12) hh += 12
    if (ap.toUpperCase() === "AM" && hh === 12) hh = 0
    return hh + (Number(mn || 0) / 60)
  }
  const start = to24(m[1], m[2], m[3])
  const end = to24(m[4], m[5], m[6])
  return Math.max(0, end - start)
}

const memberAvailability = (m) => {
  // member.availability is a JSON string or object containing { workingHours }
  let av = m.availability
  if (typeof av === "string") {
    try { av = JSON.parse(av) } catch { av = null }
  }
  return av?.workingHours || null
}

const RoleTag = ({ kind }) => {
  const meta = ROLE_META[kind] || ROLE_META.worker
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, background: meta.bg,
      color: meta.c, fontSize: 10.5, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: ".04em",
    }}>{meta.label}</span>
  )
}

const StatusTag = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.inactive
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 999, background: meta.bg,
      color: meta.c, fontSize: 10.5, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.c }} />
      {meta.label}
    </span>
  )
}

const MiniBar = ({ value, max, color = T.blue, width = 70, height = 6 }) => (
  <div style={{ width, height, background: T.panelSoft, borderRadius: height / 2, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`, height: "100%", background: color, borderRadius: height / 2 }} />
  </div>
)

const MiniSpark = ({ data, color = T.green, width = 80, height = 22 }) => {
  if (!data?.length) return null
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const step = width / Math.max(1, data.length - 1)
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${height - ((v - min) / range) * height}`).join(" ")
  return (
    <svg width={width} height={height}>
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

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

// ════════════════════════════════════════════════════════════════════════
// MEMBERS TAB — Flat card grid with search + role + status + sort filters
// ════════════════════════════════════════════════════════════════════════

const MemberCard = ({ m, jobStats, onView, onEdit, onDelete, onResend, onToggleActivation }) => {
  const role = memberRoleKind(m)
  const stats = jobStats || { jobs: 0, revenue: 0, completed: 0 }
  const isWorker = role === "worker"
  const isInvited = m.status === "invited" || m.status === "pending"
  const isInactive = m.status === "inactive" || m.status === "on_leave"
  const railColor = m.color || ROLE_META[role]?.c || T.blueDark

  return (
    <div
      style={{
        background: T.panel, border: `1px solid ${T.borderS}`, borderRadius: 10,
        overflow: "hidden", display: "flex", flexDirection: "column",
        borderLeft: `6px solid ${railColor}`,
        opacity: isInactive ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <SfAvatar initials={sfInitials(fullName(m))} color={m.color || railColor} size={42} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fullName(m)}
          </div>
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ROLE_META[role]?.label || "Member"}{m.is_service_provider ? " · Field" : ""}
          </div>
        </div>
        <button
          onClick={() => onView?.(m)}
          title="View member"
          style={{
            padding: 6, borderRadius: 6, border: "none",
            background: "transparent", color: T.ink3, cursor: "pointer",
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Tags row */}
      <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <RoleTag kind={role} />
        <StatusTag status={m.status} />
      </div>

      {/* Active work strip (only if invited or active worker with stats) */}
      {isInvited && (
        <div style={{ background: T.purpleSoft, padding: "8px 14px", display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.purple, fontStyle: "italic" }}>
          <Mail size={11} />
          <span>Invite pending — waiting for member to accept</span>
        </div>
      )}
      {!isInvited && isWorker && stats.jobs > 0 && (
        <div style={{ background: T.panelSoft, padding: "8px 14px", fontSize: 11.5, color: T.ink2 }}>
          <Briefcase size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
          <span style={{ verticalAlign: "middle" }}>
            {stats.completed}/{stats.jobs} jobs done · {moneyShort(stats.revenue)} revenue
          </span>
        </div>
      )}

      {/* Stats triplet — workers only */}
      {isWorker && !isInvited && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${T.borderS}` }}>
          {[
            { label: "Jobs", value: stats.jobs, sub: `${stats.completed} done` },
            { label: "Revenue", value: moneyShort(stats.revenue), sub: stats.jobs ? `${money(stats.revenue / Math.max(1, stats.jobs))} avg` : "—" },
            { label: "Done", value: stats.jobs ? `${Math.round((stats.completed / stats.jobs) * 100)}%` : "—", sub: stats.jobs && stats.completed / stats.jobs >= 0.9 ? "on track" : "" },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "10px 14px", borderRight: i < 2 ? `1px solid ${T.borderS}` : "none" }}>
              <div style={{ fontSize: 9.5, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.label}</div>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Contact row */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${T.borderS}`, background: T.panelAlt, display: "flex", alignItems: "center", gap: 8 }}>
        {m.email && (
          <a href={`mailto:${m.email}`} title={m.email} onClick={(e) => e.stopPropagation()}
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.borderS}`, background: T.panel,
                     display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, textDecoration: "none" }}>
            <Mail size={13} />
          </a>
        )}
        {m.phone && (
          <a href={`tel:${m.phone}`} title={m.phone} onClick={(e) => e.stopPropagation()}
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${T.borderS}`, background: T.panel,
                     display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, textDecoration: "none" }}>
            <Phone size={13} />
          </a>
        )}
        <div style={{ flex: 1 }} />
        {!isInvited && (
          <button onClick={() => onEdit?.(m)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7, background: T.panel,
            border: `1px solid ${T.borderS}`, color: T.ink2, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>
            <Edit size={12} />
            Edit
          </button>
        )}
        {isInvited && m.email && (
          <button onClick={() => onResend?.(m)} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7, background: T.panel,
            border: `1px solid ${T.borderS}`, color: T.blueDark, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>
            <Mail size={12} />
            Resend
          </button>
        )}
        <button onClick={() => onView?.(m)} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 7, background: T.panel,
          border: `1px solid ${T.borderS}`, color: T.blueDark, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
        }}>
          Open
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}

export const MembersView = ({
  members, jobs, filters, onFilterChange, onAddMember,
  onView, onEdit, onDelete, onResend, onToggleActivation,
}) => {
  const [roleFilter, setRoleFilter] = useState("all")
  const [sort, setSort] = useState("name_asc")

  // Compute jobs-by-member once
  const jobsByMember = useMemo(() => {
    const map = {}
    ;(jobs || []).forEach((j) => {
      const ids = new Set()
      if (j.team_member_id) ids.add(Number(j.team_member_id))
      if (j.assigned_team_member_id) ids.add(Number(j.assigned_team_member_id))
      if (Array.isArray(j.team_assignments)) j.team_assignments.forEach((ta) => ta?.team_member_id && ids.add(Number(ta.team_member_id)))
      ids.forEach((id) => {
        if (!map[id]) map[id] = { jobs: 0, revenue: 0, completed: 0 }
        map[id].jobs += 1
        if (j.status === "completed" || j.status === "paid") map[id].completed += 1
        map[id].revenue += (parseFloat(j.total_amount) || parseFloat(j.total) || parseFloat(j.service_price) || parseFloat(j.price) || 0)
      })
    })
    return map
  }, [jobs])

  // Apply role + search + status filters locally on top of what server already filtered
  const filtered = useMemo(() => {
    let out = members || []
    if (roleFilter !== "all") {
      out = out.filter((m) => memberRoleKind(m) === roleFilter)
    }
    // sort
    out = [...out]
    const nameOf = (m) => fullName(m).toLowerCase()
    if (sort === "name_asc") out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    else if (sort === "name_desc") out.sort((a, b) => nameOf(b).localeCompare(nameOf(a)))
    else if (sort === "role") out.sort((a, b) => memberRoleKind(a).localeCompare(memberRoleKind(b)) || nameOf(a).localeCompare(nameOf(b)))
    else if (sort === "status") out.sort((a, b) => (a.status || "").localeCompare(b.status || "") || nameOf(a).localeCompare(nameOf(b)))
    else if (sort === "jobs_desc") out.sort((a, b) => (jobsByMember[Number(b.id)]?.jobs || 0) - (jobsByMember[Number(a.id)]?.jobs || 0))
    else if (sort === "revenue_desc") out.sort((a, b) => (jobsByMember[Number(b.id)]?.revenue || 0) - (jobsByMember[Number(a.id)]?.revenue || 0))
    return out
  }, [members, roleFilter, sort, jobsByMember])

  // KPIs use the full (pre-role-filter) member list so totals don't drift with role chip
  const kpis = useMemo(() => {
    const all = members || []
    return {
      total: all.length,
      active: all.filter((m) => m.status === "active").length,
      workers: all.filter((m) => memberRoleKind(m) === "worker").length,
      schedulers: all.filter((m) => memberRoleKind(m) === "scheduler").length,
      managers: all.filter((m) => memberRoleKind(m) === "manager").length,
      invited: all.filter((m) => m.status === "invited" || m.status === "pending").length,
    }
  }, [members])

  const ROLE_CHIPS = [
    { id: "all",       label: "All",        count: kpis.total },
    { id: "worker",    label: "Workers",    count: kpis.workers },
    { id: "scheduler", label: "Schedulers", count: kpis.schedulers },
    { id: "manager",   label: "Managers",   count: kpis.managers },
  ]

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Total members" value={kpis.total} sub="all statuses" accent={T.blue} />
        <SfKPI label="Active" value={kpis.active} sub="working today" accent={T.green} />
        <SfKPI label="Workers" value={kpis.workers} sub="field crew" accent={T.greenDark} />
        <SfKPI label="Schedulers" value={kpis.schedulers} sub="dispatching" accent={T.purple} />
        <SfKPI label="Pending invites" value={kpis.invited} sub="awaiting accept" accent={T.amber} />
      </div>

      {/* Filter toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {/* Role chips */}
        <div style={{ display: "inline-flex", gap: 0, background: T.panelSoft, borderRadius: 8, padding: 3, border: `1px solid ${T.borderS}` }}>
          {ROLE_CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setRoleFilter(c.id)}
              style={{
                padding: "5px 10px", fontSize: 11.5, fontWeight: 600, border: "none",
                background: roleFilter === c.id ? T.panel : "transparent",
                color: roleFilter === c.id ? T.ink : T.ink2,
                borderRadius: 6, cursor: "pointer",
                boxShadow: roleFilter === c.id ? "0 1px 2px rgba(15,23,42,.08)" : "none",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              {c.label}
              <span style={{
                fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: roleFilter === c.id ? T.blueDark : T.ink3,
                background: roleFilter === c.id ? T.blueSoft : T.panelSoft,
                padding: "1px 5px", borderRadius: 6,
              }}>{c.count}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={14} color={T.ink3} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Search members…"
            value={filters?.search || ""}
            onChange={(e) => onFilterChange?.({ search: e.target.value })}
            style={{
              width: "100%", padding: "7px 10px 7px 30px",
              fontSize: 12.5, color: T.ink, fontWeight: 500,
              background: T.panel, border: `1px solid ${T.borderS}`, borderRadius: 8,
              outline: "none",
            }}
          />
        </div>

        {/* Status dropdown */}
        <select
          value={filters?.status || ""}
          onChange={(e) => onFilterChange?.({ status: e.target.value })}
          style={{
            padding: "7px 10px", fontSize: 12.5, fontWeight: 600,
            color: T.ink, background: T.panel,
            border: `1px solid ${T.borderS}`, borderRadius: 8, cursor: "pointer",
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active only</option>
          <option value="invited">Invited only</option>
          <option value="inactive">Inactive only</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            padding: "7px 10px", fontSize: 12.5, fontWeight: 600,
            color: T.ink, background: T.panel,
            border: `1px solid ${T.borderS}`, borderRadius: 8, cursor: "pointer",
          }}
        >
          <option value="name_asc">Sort: Name A→Z</option>
          <option value="name_desc">Sort: Name Z→A</option>
          <option value="role">Sort: Role</option>
          <option value="status">Sort: Status</option>
          <option value="jobs_desc">Sort: Most jobs</option>
          <option value="revenue_desc">Sort: Most revenue</option>
        </select>

        {/* Add button */}
        {onAddMember && (
          <button onClick={onAddMember} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 12px", background: T.blueDark, color: "#fff",
            border: "none", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 1px 2px rgba(37,99,235,.3)",
          }}>
            <UserPlus size={13} />
            Add member
          </button>
        )}
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <EmptyChart
          icon={Users}
          title="No members match"
          subtitle={
            (filters?.search || filters?.status || roleFilter !== "all")
              ? "Try clearing filters or changing role."
              : "Click Add member to get started."
          }
          height={240}
        />
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 14,
        }}>
          {filtered.map((m) => (
            <MemberCard
              key={m.id}
              m={m}
              jobStats={jobsByMember[Number(m.id)]}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
              onResend={onResend}
              onToggleActivation={onToggleActivation}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// TEAMS TAB — Role-grouped cards (since codebase has no first-class teams)
// ════════════════════════════════════════════════════════════════════════

export const TeamsView = ({ members, jobs }) => {
  const groups = useMemo(() => {
    const buckets = { worker: [], manager: [], scheduler: [], owner: [] }
    ;(members || []).forEach((m) => {
      const k = memberRoleKind(m)
      if (!buckets[k]) buckets[k] = []
      buckets[k].push(m)
    })
    return [
      { key: "worker",    label: "Workers · Field crew",       color: T.greenDark, list: buckets.worker },
      { key: "scheduler", label: "Schedulers",                 color: T.purple,    list: buckets.scheduler },
      { key: "manager",   label: "Managers · Dispatch",        color: T.blueDark,  list: buckets.manager },
      { key: "owner",     label: "Account owner",              color: T.amberDark, list: buckets.owner },
    ].filter((g) => g.list.length > 0)
  }, [members])

  const jobsByMember = useMemo(() => {
    const map = {}
    ;(jobs || []).forEach((j) => {
      const ids = []
      if (j.team_member_id) ids.push(Number(j.team_member_id))
      if (j.assigned_team_member_id) ids.push(Number(j.assigned_team_member_id))
      if (Array.isArray(j.team_assignments)) j.team_assignments.forEach((ta) => ta?.team_member_id && ids.push(Number(ta.team_member_id)))
      ids.forEach((id) => {
        if (!map[id]) map[id] = { jobs: 0, revenue: 0, completed: 0 }
        map[id].jobs += 1
        if (j.status === "completed" || j.status === "paid") map[id].completed += 1
        map[id].revenue += (parseFloat(j.total_amount) || parseFloat(j.total) || parseFloat(j.service_price) || parseFloat(j.price) || 0)
      })
    })
    return map
  }, [jobs])

  if (!members?.length) {
    return <EmptyChart icon={Users} title="No team members yet" subtitle="Add your first member to see groupings here." />
  }

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Total members" value={members.length} sub="all statuses" accent={T.blue} />
        <SfKPI label="Active workers" value={(members.filter((m) => memberRoleKind(m) === "worker" && m.status === "active")).length} sub="on payroll" accent={T.green} />
        <SfKPI label="Schedulers" value={(members.filter((m) => memberRoleKind(m) === "scheduler")).length} sub="dispatching" accent={T.purple} />
        <SfKPI label="Pending invites" value={(members.filter((m) => m.status === "invited" || m.status === "pending")).length} sub="awaiting accept" accent={T.amber} />
        <SfKPI label="On leave" value={(members.filter((m) => m.status === "on_leave" || m.status === "inactive")).length} sub="not active" accent={T.ink3} />
      </div>

      {/* Role-grouped cards */}
      {groups.map((g) => (
        <SfCard key={g.key} padding={false}>
          <div style={{ padding: "12px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 28, background: g.color, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{g.label}</div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{g.list.length} member{g.list.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{ flex: 1 }} />
          </div>
          <div style={{
            padding: 14, display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
          }}>
            {g.list.map((m) => {
              const stats = jobsByMember[Number(m.id)] || { jobs: 0, revenue: 0, completed: 0 }
              return (
                <div key={m.id} style={{
                  border: `1px solid ${T.borderS}`, borderRadius: 10, background: T.panel,
                  padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <SfAvatar initials={sfInitials(fullName(m))} color={m.color || g.color} size={36} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName(m)}</div>
                      <div style={{ fontSize: 11, color: T.ink3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email || m.phone || "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <RoleTag kind={memberRoleKind(m)} />
                    <StatusTag status={m.status} />
                  </div>
                  {g.key === "worker" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, paddingTop: 8, borderTop: `1px solid ${T.borderS}` }}>
                      <div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.ink3, textTransform: "uppercase", letterSpacing: ".04em" }}>Jobs</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{stats.jobs}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.ink3, textTransform: "uppercase", letterSpacing: ".04em" }}>Revenue</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{moneyShort(stats.revenue)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: T.ink3, textTransform: "uppercase", letterSpacing: ".04em" }}>Done</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: stats.jobs && stats.completed / stats.jobs >= 0.9 ? T.greenDark : T.ink, fontVariantNumeric: "tabular-nums" }}>
                          {stats.jobs ? `${Math.round((stats.completed / stats.jobs) * 100)}%` : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SfCard>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SCHEDULE TAB — Weekly availability grid
// ════════════════════════════════════════════════════════════════════════

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const weekStartFor = (d) => {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() - dt.getDay()) // Sun
  return dt
}

const AvailCell = ({ hours, hoursStr, isWeekend }) => {
  if (hours > 0) {
    return (
      <div style={{
        height: 50, borderRadius: 6, background: T.greenSoft,
        border: `1px solid ${T.greenDark}22`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.greenDark, fontVariantNumeric: "tabular-nums" }}>{hours.toFixed(1)}h</div>
        <div style={{ fontSize: 9.5, color: T.greenDark, fontWeight: 500, opacity: 0.7 }}>{hoursStr?.replace(/:00\s*/g, "").replace(/\s/g, "") || ""}</div>
      </div>
    )
  }
  return (
    <div style={{
      height: 50, borderRadius: 6, background: isWeekend ? T.panelAlt : T.panel,
      border: `1px solid ${T.borderS}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: T.ink4, fontSize: 14, fontWeight: 600,
    }}>—</div>
  )
}

export const ScheduleView = ({ members }) => {
  const [weekRef, setWeekRef] = useState(() => weekStartFor(new Date()))
  const weekEnd = useMemo(() => { const d = new Date(weekRef); d.setDate(d.getDate() + 6); return d }, [weekRef])

  const rowsByKind = useMemo(() => {
    const buckets = { worker: [], manager: [], scheduler: [] }
    ;(members || []).forEach((m) => {
      if (m.status === "inactive" || m.status === "on_leave") return
      const k = memberRoleKind(m)
      if (k === "owner") return // owners don't shift-work
      const wh = memberAvailability(m)
      const dayHours = DAYS.map((d) => parseDayHours(wh?.[d]))
      const total = dayHours.reduce((a, b) => a + b, 0)
      const rawHours = DAYS.map((d) => wh?.[d]?.hours || "")
      buckets[k]?.push({ member: m, dayHours, total, rawHours })
    })
    return buckets
  }, [members])

  const allRows = [...(rowsByKind.worker || []), ...(rowsByKind.manager || []), ...(rowsByKind.scheduler || [])]
  const totalScheduled = allRows.reduce((s, r) => s + r.total, 0)
  const totalCapacity = allRows.length * 40 // 40h max per person/week
  const coverage = totalCapacity > 0 ? Math.round((totalScheduled / totalCapacity) * 100) : 0
  const overtimeRisk = allRows.filter((r) => r.total > 40).length

  const dayDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekRef); d.setDate(d.getDate() + i)
      return d
    })
  }, [weekRef])

  const Section = ({ label, color, rows }) => {
    if (!rows?.length) return null
    return (
      <SfCard padding={false}>
        <div style={{ padding: "10px 16px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 24, background: color, borderRadius: 2 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{label}</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{rows.length} member{rows.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div style={{ padding: "8px 16px 12px" }}>
          {/* Day header */}
          <div style={{ display: "grid", gridTemplateColumns: "200px repeat(7, 1fr) 70px", gap: 6, padding: "8px 0", borderBottom: `1px solid ${T.borderS}`, marginBottom: 6 }}>
            <div />
            {DAY_LABELS.map((dl, i) => (
              <div key={dl} style={{ textAlign: "center", fontSize: 10.5, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
                {dl}
                <div style={{ fontSize: 10, color: T.ink4, fontWeight: 500, marginTop: 1 }}>{dayDates[i].getDate()}</div>
              </div>
            ))}
            <div style={{ textAlign: "right", fontSize: 10.5, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Total</div>
          </div>

          {rows.map((r) => (
            <div key={r.member.id} style={{ display: "grid", gridTemplateColumns: "200px repeat(7, 1fr) 70px", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.borderS}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <SfAvatar initials={sfInitials(fullName(r.member))} color={r.member.color || color} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName(r.member)}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ROLE_META[memberRoleKind(r.member)]?.label || "Member"}</div>
                </div>
              </div>
              {r.dayHours.map((h, i) => (
                <AvailCell key={i} hours={h} hoursStr={r.rawHours[i]} isWeekend={i === 0 || i === 6} />
              ))}
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: r.total > 40 ? T.amberDark : T.ink, fontVariantNumeric: "tabular-nums" }}>
                {r.total.toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      </SfCard>
    )
  }

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Week selector + KPIs */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
        <SfButton variant="ghost" size="sm" icon={ChevronLeft} onClick={() => { const d = new Date(weekRef); d.setDate(d.getDate() - 7); setWeekRef(d) }}>Prev</SfButton>
        <div style={{
          padding: "6px 12px", background: T.panel, border: `1px solid ${T.borderS}`,
          borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <CalIcon size={13} color={T.ink2} />
          Week of {weekRef.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <SfButton variant="ghost" size="sm" icon={ChevronRight} onClick={() => { const d = new Date(weekRef); d.setDate(d.getDate() + 7); setWeekRef(d) }}>Next</SfButton>
        <div style={{ flex: 1 }} />
        <SfButton variant="secondary" size="sm" onClick={() => setWeekRef(weekStartFor(new Date()))}>Today</SfButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Scheduled hours" value={`${totalScheduled.toFixed(0)}h`} sub={`${allRows.length} members`} accent={T.blue} />
        <SfKPI label="Coverage" value={`${coverage}%`} sub="of 40h target" accent={T.green} />
        <SfKPI label="OT risk" value={overtimeRisk} sub={overtimeRisk ? "members > 40h" : "all within band"} accent={overtimeRisk ? T.amber : T.green} />
        <SfKPI label="Open shifts" value="—" sub="needs forecast wiring" accent={T.purple} />
        <SfKPI label="Time off" value="—" sub="needs PTO data" accent={T.amber} />
      </div>

      {allRows.length === 0 ? (
        <EmptyChart icon={CalIcon} title="No availability data" subtitle="Members need working hours configured to appear here." />
      ) : (
        <>
          <Section label="Workers · Field crew" color={T.greenDark} rows={rowsByKind.worker} />
          <Section label="Schedulers" color={T.purple} rows={rowsByKind.scheduler} />
          <Section label="Managers · Dispatch" color={T.blueDark} rows={rowsByKind.manager} />
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// PAYROLL TAB — Current period payouts (live from payrollAPI)
// ════════════════════════════════════════════════════════════════════════

export const PayrollView = ({ members, navigate }) => {
  const [salary, setSalary] = useState(null)
  const [loading, setLoading] = useState(true)

  // Default period: last 14 days (biweekly)
  const { startStr, endStr, label } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999)
    const start = new Date(); start.setDate(start.getDate() - 13); start.setHours(0, 0, 0, 0)
    return {
      startStr: fmtDate(start),
      endStr: fmtDate(end),
      label: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const data = await payrollAPI.getSalaryAnalytics(startStr, endStr, "day")
        if (!cancelled) setSalary(data || { summary: {}, memberBreakdown: [] })
      } catch {
        if (!cancelled) setSalary({ summary: {}, memberBreakdown: [] })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [startStr, endStr])

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: T.ink3, fontSize: 13 }}>
      <RefreshCw size={20} className="animate-spin" style={{ display: "inline-block", marginBottom: 8 }} />
      <div>Loading payroll data…</div>
    </div>
  }

  const sum = salary?.summary || {}
  const breakdown = salary?.memberBreakdown || []

  // Index by id for quick lookup
  const breakdownById = {}
  breakdown.forEach((r) => { if (r.id) breakdownById[r.id] = r })

  const workerMembers = (members || []).filter((m) => memberRoleKind(m) === "worker" && m.status !== "inactive")
  const staffMembers = (members || []).filter((m) => ["scheduler", "manager"].includes(memberRoleKind(m)) && m.status !== "inactive")

  const Row = ({ m, color }) => {
    const data = breakdownById[m.id] || {}
    const hours = Number(data.totalHours || data.hours || 0)
    const base = Number(data.hourlyPayroll || 0)
    const commission = Number(data.commissionPayroll || 0)
    const total = Number(data.totalPayroll || (base + commission))
    const jobs = Number(data.jobsCount || data.jobs || 0)
    const isOT = hours > 40
    const isInvited = m.status === "invited" || m.status === "pending"

    let statusPill
    if (isInvited) statusPill = { label: "Not enrolled", c: T.purple, bg: T.purpleSoft }
    else if (isOT) statusPill = { label: "OT review", c: T.amberDark, bg: T.amberSoft }
    else if (total === 0 && hours === 0) statusPill = { label: "No hours", c: T.ink3, bg: T.panelSoft }
    else statusPill = { label: "Ready", c: T.greenDark, bg: T.greenSoft }

    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1.6fr 100px 100px 110px 100px 110px 105px", gap: 12,
        padding: "11px 18px", alignItems: "center",
        borderBottom: `1px solid ${T.borderS}`,
        opacity: isInvited ? 0.55 : 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 32, background: color, borderRadius: 2 }} />
          <SfAvatar initials={sfInitials(fullName(m))} color={m.color || color} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{fullName(m)}</div>
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{ROLE_META[memberRoleKind(m)]?.label || "Member"}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 11.5, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>
          {hours > 0 ? `${hours.toFixed(1)}h` : "—"}
          {jobs > 0 && (
            <div style={{ fontSize: 10, color: T.ink3 }}>{jobs} job{jobs === 1 ? "" : "s"}</div>
          )}
        </div>
        <div style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
          {base > 0 ? money(base) : "—"}
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: commission > 0 ? T.greenDark : T.ink3, fontWeight: commission > 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>
          {commission > 0 ? money(commission) : "—"}
        </div>
        <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
          {total > 0 ? money(total) : "—"}
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999,
            background: statusPill.bg, color: statusPill.c, fontSize: 10.5, fontWeight: 700,
          }}>{statusPill.label}</span>
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: T.ink3 }}>
          {jobs > 0 ? `$${jobs ? Math.round(total / jobs) : 0}/job` : ""}
        </div>
      </div>
    )
  }

  const SectionHead = ({ label, color, count }) => (
    <div style={{ padding: "10px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 8, height: 24, background: color, borderRadius: 2 }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{label}</div>
      <div style={{ fontSize: 11, color: T.ink3 }}>· {count} member{count === 1 ? "" : "s"}</div>
    </div>
  )

  const ColHeader = () => (
    <div style={{
      display: "grid", gridTemplateColumns: "1.6fr 100px 100px 110px 100px 110px 105px", gap: 12,
      padding: "8px 18px", background: T.panel, borderBottom: `1px solid ${T.borderS}`,
      fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
    }}>
      <div>Member</div>
      <div style={{ textAlign: "right" }}>Hours</div>
      <div style={{ textAlign: "right" }}>Base</div>
      <div style={{ textAlign: "right" }}>Commission</div>
      <div style={{ textAlign: "right" }}>Total</div>
      <div style={{ textAlign: "right" }}>Status</div>
      <div style={{ textAlign: "right" }}>Per job</div>
    </div>
  )

  const total = Number(sum.totalPayroll || 0)
  const hourlyTotal = Number(sum.totalHourlyPayroll || 0)
  const commissionTotal = Number(sum.totalCommissionPayroll || 0)
  const otCount = breakdown.filter((p) => Number(p.totalHours || p.hours || 0) > 40).length

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Period + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          padding: "6px 12px", background: T.panel, border: `1px solid ${T.borderS}`,
          borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <CalIcon size={13} color={T.ink2} />
          {label}
        </div>
        <SfFilterChip>Biweekly cadence</SfFilterChip>
        <div style={{ flex: 1 }} />
        <SfButton variant="ghost" size="sm" icon={Download}>Export CSV</SfButton>
        <SfButton variant="primary" size="sm" onClick={() => navigate?.("/payroll")}>Open Payroll →</SfButton>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Period total" value={moneyShort(total)} sub={`${breakdown.length} members`} accent={T.green} />
        <SfKPI label="Hourly · workers" value={moneyShort(hourlyTotal)} sub={`${sum.hourlyOnlyCount || 0} workers`} accent={T.blue} />
        <SfKPI label="Commission" value={moneyShort(commissionTotal)} sub={`${sum.commissionOnlyCount || 0} commission`} accent={T.purple} />
        <SfKPI label="Hybrid" value={sum.hybridCount || 0} sub="hourly + commission" accent={T.teal || T.green} />
        <SfKPI label="OT review" value={otCount} sub={otCount ? "members > 40h" : "no flags"} accent={otCount ? T.amber : T.green} />
      </div>

      {/* Dark pending banner */}
      <div style={{
        background: `linear-gradient(135deg, ${T.ink} 0%, #475569 100%)`,
        borderRadius: 14, padding: "20px 22px", color: "#fff",
        display: "flex", alignItems: "center", gap: 18,
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <DollarSign size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", opacity: 0.7 }}>Pending payout</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{money(total)}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 1 }}>Next pay date · biweekly cadence</div>
        </div>
        <div style={{ flex: 1 }} />
        <SfButton variant="secondary" size="sm" onClick={() => navigate?.("/payroll")}>Review drafts</SfButton>
        <button
          onClick={() => navigate?.("/payroll")}
          style={{
            padding: "8px 14px", background: "#fff", color: T.ink, border: "none",
            borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          }}
        >Process paychecks</button>
      </div>

      {/* Workers section */}
      <SfCard padding={false}>
        <SectionHead label="Hourly · Workers" color={T.blueDark} count={workerMembers.length} />
        <ColHeader />
        {workerMembers.length ? workerMembers.map((m) => <Row key={m.id} m={m} color={T.blueDark} />) :
          <EmptyChart icon={Briefcase} title="No workers" subtitle="Add workers to track hourly payroll." />}
      </SfCard>

      {/* Staff section */}
      {staffMembers.length > 0 && (
        <SfCard padding={false}>
          <SectionHead label="Salaried · Dispatchers & Schedulers" color={T.purple} count={staffMembers.length} />
          <ColHeader />
          {staffMembers.map((m) => <Row key={m.id} m={m} color={T.purple} />)}
        </SfCard>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// PERFORMANCE TAB — Per-worker leaderboard from real jobs
// ════════════════════════════════════════════════════════════════════════

const PERIODS = [
  { k: "7d",  label: "Last 7d",  days: 7 },
  { k: "30d", label: "Last 30d", days: 30 },
  { k: "90d", label: "Last 90d", days: 90 },
]

const RankBadge = ({ rank }) => {
  const styles = [
    { bg: `${T.amber}22`, fg: T.amberDark }, // 1st
    { bg: `${T.ink3}22`,  fg: T.ink2 },       // 2nd
    { bg: "#A87C4F22",    fg: "#A87C4F" },    // 3rd
  ]
  const s = styles[rank - 1] || { bg: T.panelAlt, fg: T.ink3 }
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 7, background: s.bg, color: s.fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
    }}>{rank}</div>
  )
}

export const PerformanceView = ({ members, userId }) => {
  const [period, setPeriod] = useState("30d")
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const days = PERIODS.find((p) => p.k === period)?.days || 30
    const end = new Date(); end.setHours(23, 59, 59, 999)
    const start = new Date(); start.setDate(start.getDate() - (days - 1)); start.setHours(0, 0, 0, 0)
    const dateRangeString = `${fmtDate(start)} to ${fmtDate(end)}`

    const run = async () => {
      setLoading(true)
      try {
        const resp = await jobsAPI.getAll(userId, "", "", 1, 10000, null, dateRangeString)
        if (!cancelled) setJobs(normalizeAPIResponse(resp, "jobs") || [])
      } catch {
        if (!cancelled) setJobs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [userId, period])

  const metricsByMember = useMemo(() => {
    const map = {}
    jobs.forEach((j) => {
      const ids = new Set()
      if (j.team_member_id) ids.add(Number(j.team_member_id))
      if (j.assigned_team_member_id) ids.add(Number(j.assigned_team_member_id))
      if (Array.isArray(j.team_assignments)) j.team_assignments.forEach((ta) => ta?.team_member_id && ids.add(Number(ta.team_member_id)))
      ids.forEach((id) => {
        if (!map[id]) map[id] = { jobs: 0, completed: 0, revenue: 0, customers: new Set() }
        map[id].jobs += 1
        if (j.status === "completed" || j.status === "paid") map[id].completed += 1
        map[id].revenue += (parseFloat(j.total_amount) || parseFloat(j.total) || parseFloat(j.service_price) || parseFloat(j.price) || 0)
        if (j.customer_id) map[id].customers.add(j.customer_id)
      })
    })
    Object.keys(map).forEach((id) => { map[id].uniqueCustomers = map[id].customers.size })
    return map
  }, [jobs])

  const workers = useMemo(() => {
    return (members || [])
      .filter((m) => memberRoleKind(m) === "worker" && m.status !== "inactive")
      .map((m) => {
        const mt = metricsByMember[Number(m.id)] || { jobs: 0, completed: 0, revenue: 0, uniqueCustomers: 0 }
        const completion = mt.jobs > 0 ? (mt.completed / mt.jobs) * 100 : 0
        // Composite: weight revenue, then jobs, then completion
        const score = mt.revenue * 0.001 + mt.completed * 2 + completion * 0.5
        return { ...m, mt, completion, score }
      })
      .sort((a, b) => b.score - a.score)
  }, [members, metricsByMember])

  const maxJobs = Math.max(1, ...workers.map((w) => w.mt.jobs))
  const totalRevenue = workers.reduce((s, w) => s + w.mt.revenue, 0)
  const totalJobs = workers.reduce((s, w) => s + w.mt.jobs, 0)
  const totalCompleted = workers.reduce((s, w) => s + w.mt.completed, 0)
  const avgCompletion = workers.length ? workers.reduce((s, w) => s + w.completion, 0) / workers.length : 0

  return (
    <div style={{ padding: "14px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Period filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: T.ink3, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Period</span>
        <div style={{ display: "inline-flex", gap: 0, background: T.panelSoft, borderRadius: 8, padding: 3, border: `1px solid ${T.borderS}` }}>
          {PERIODS.map((p) => (
            <button
              key={p.k}
              onClick={() => setPeriod(p.k)}
              style={{
                padding: "5px 12px", fontSize: 11.5, fontWeight: 600, border: "none",
                background: period === p.k ? T.panel : "transparent",
                color: period === p.k ? T.ink : T.ink2,
                borderRadius: 6, cursor: "pointer",
                boxShadow: period === p.k ? "0 1px 2px rgba(15,23,42,.08)" : "none",
              }}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <SfButton variant="ghost" size="sm" icon={Download}>Export</SfButton>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <SfKPI label="Workers ranked" value={workers.length} sub="active only" accent={T.blue} />
        <SfKPI label="Jobs (period)" value={totalJobs} sub={`${totalCompleted} completed`} accent={T.green} />
        <SfKPI label="Revenue (period)" value={moneyShort(totalRevenue)} sub="all workers combined" accent={T.amber} />
        <SfKPI label="Avg completion" value={`${avgCompletion.toFixed(1)}%`} sub="per worker" accent={T.greenDark} />
        <SfKPI label="Top worker" value={workers[0] ? sfInitials(fullName(workers[0])) : "—"} sub={workers[0] ? moneyShort(workers[0].mt.revenue) : ""} accent={T.purple} />
      </div>

      {/* Leaderboard */}
      <SfCard padding={false}>
        <div style={{ padding: "12px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.blueSoft, color: T.blueDark, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Star size={14} strokeWidth={2.1} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Workers · {PERIODS.find((p) => p.k === period)?.label} leaderboard</div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Composite of revenue · jobs · completion</div>
          </div>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "40px 1.6fr 120px 130px 100px 110px 90px", gap: 12,
          padding: "10px 18px", background: T.panel, borderBottom: `1px solid ${T.borderS}`,
          fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
        }}>
          <div>#</div>
          <div>Worker</div>
          <div style={{ textAlign: "right" }}>Revenue</div>
          <div>Jobs</div>
          <div style={{ textAlign: "right" }}>Completion</div>
          <div style={{ textAlign: "right" }}>Customers</div>
          <div style={{ textAlign: "right" }}>Trend</div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.ink3, fontSize: 13 }}>
            <RefreshCw size={20} className="animate-spin" style={{ display: "inline-block", marginBottom: 8 }} />
            <div>Loading performance data…</div>
          </div>
        ) : workers.length === 0 ? (
          <EmptyChart icon={Briefcase} title="No worker activity" subtitle={`No jobs assigned in the last ${PERIODS.find((p) => p.k === period)?.days || 30} days.`} />
        ) : workers.map((w, i, arr) => {
          const compColor = w.completion >= 90 ? T.greenDark : w.completion >= 75 ? T.amberDark : T.redDark
          return (
            <div key={w.id} style={{
              display: "grid", gridTemplateColumns: "40px 1.6fr 120px 130px 100px 110px 90px", gap: 12,
              padding: "12px 18px", alignItems: "center",
              borderBottom: i < arr.length - 1 ? `1px solid ${T.borderS}` : "none",
            }}>
              <RankBadge rank={i + 1} />
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <SfAvatar initials={sfInitials(fullName(w))} color={w.color || T.blue} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{fullName(w)}</div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{ROLE_META[memberRoleKind(w)]?.label || "Worker"}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                {money(w.mt.revenue)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MiniBar value={w.mt.jobs} max={maxJobs} color={T.blue} width={70} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{w.mt.jobs}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: 13.5, fontWeight: 700, color: compColor, fontVariantNumeric: "tabular-nums" }}>
                {w.mt.jobs ? `${w.completion.toFixed(0)}%` : "—"}
                <div style={{ fontSize: 10, color: T.ink3, fontWeight: 500, marginTop: 1 }}>{w.mt.completed}/{w.mt.jobs}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: T.ink2, fontVariantNumeric: "tabular-nums" }}>
                {w.mt.uniqueCustomers || 0}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <MiniSpark data={[3, 5, 4, 6, 5, 7, 8, Math.max(2, w.mt.jobs)]} color={w.color || T.green} />
              </div>
            </div>
          )
        })}
      </SfCard>
    </div>
  )
}
