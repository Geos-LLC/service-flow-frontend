"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Plus,
  Calendar as CalendarIcon,
  ArrowRight,
  MapPin,
  Tag as TagIcon,
  MoreHorizontal,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope, filterByLocation } from "../context/LocationContext"
import { jobsAPI, teamAPI, invoicesAPI, leadsAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import MobileHeader from "../components/mobile-header"
import JobsMap from "../components/jobs-map"
import {
  SfCard,
  SfCardHeader,
  SfButton,
  SfKPI,
  SfStatusPill,
  SfTag,
  SfFilterChip,
  SfAvatar,
  SfSegmented,
  sfInitials,
  sfTeamColor,
  sfAssignTeamColors,
} from "../components/sf-primitives"

/**
 * Service Blue dashboard (Wave 2 of the redesign).
 *
 * Top-down: greeting + 6 KPIs → today's schedule timeline → two-column
 * zone with job queue (left) and team / hot leads (right). Pulls live
 * data from jobsAPI/teamAPI/invoicesAPI/leadsAPI — the same endpoints
 * the legacy dashboard uses — so swapping the route is non-destructive.
 */

// ── Helpers ────────────────────────────────────────────────

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const todayString = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const formatEyebrowDate = () => {
  const d = new Date()
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

const formatMoney = (n) => {
  const v = Number.isFinite(n) ? n : 0
  if (v >= 10000) return `$${Math.round(v / 1000).toLocaleString()}k`
  return `$${Math.round(v).toLocaleString()}`
}

const formatMoneyExact = (n) => `$${(Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// Read a job's start time from whichever field carries it. The most
// reliable source in this codebase is scheduled_date (full ISO datetime
// including time). service_time / start_time may also exist but are
// less consistent — service_time is often just "09:00" regardless of
// actual scheduled time, so it's checked last.
const jobStartDateTime = (job) => {
  const candidates = [job.scheduled_date, job.start_time, job.service_time]
  for (const c of candidates) {
    if (!c) continue
    const raw = String(c).trim()
    // Plain "HH:MM[:SS]" attached to today's date — only useful if no ISO field was present
    if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?$/.test(raw)) {
      const m = raw.match(/^(\d{1,2}):(\d{2})(:(\d{2}))?\s*(AM|PM|am|pm)?$/)
      if (!m) continue
      let h = parseInt(m[1], 10)
      const min = parseInt(m[2], 10)
      const mer = m[5]?.toUpperCase()
      if (mer === "PM" && h < 12) h += 12
      if (mer === "AM" && h === 12) h = 0
      const today = new Date()
      today.setHours(h, min, 0, 0)
      return today
    }
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T")
    const d = new Date(iso)
    if (!isNaN(d)) return d
  }
  return null
}

// Old helper kept for compatibility — same shape, but driven by Date.
const parseTime = (jobOrString) => {
  // Caller may pass a job-shaped object OR a raw string. Job-shaped
  // is preferred so we can read scheduled_date first.
  let d
  if (jobOrString && typeof jobOrString === "object") {
    d = jobStartDateTime(jobOrString)
  } else if (typeof jobOrString === "string") {
    d = jobStartDateTime({ service_time: jobOrString })
  }
  if (!d || isNaN(d)) return null
  const h = d.getHours()
  const m = d.getMinutes()
  const meridian = h < 12 ? "AM" : "PM"
  const hh = h % 12 === 0 ? 12 : h % 12
  return {
    h,
    m,
    minutes: h * 60 + m,
    label: `${hh}:${String(m).padStart(2, "0")} ${meridian}`,
  }
}

const jobStatusLabel = (raw) => {
  const s = (raw || "").toLowerCase()
  if (s.includes("progress") || s === "in_progress" || s === "in-progress") return "In progress"
  if (s === "en_route" || s === "en route" || s === "enroute") return "En route"
  if (s === "completed" || s === "complete" || s === "done") return "Completed"
  if (s === "cancelled" || s === "canceled") return "Cancelled"
  if (s === "scheduled" || s === "pending" || s === "new") return "Scheduled"
  return "Scheduled"
}

// Return all cleaner assignees on a job as { id, name } pairs. A multi-cleaner
// job (a "team" in business terms) has length >= 2. Empty array = unassigned.
// Entries are deduped by id — the same cleaner listed twice in
// assigned_providers (a real shape we've seen in the data) shouldn't
// inflate the team count.
const assigneesFor = (job) => {
  const seen = new Set()
  const out = []
  const push = (rawId, name) => {
    const id = rawId == null ? null : String(rawId)
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ id, name: name || "" })
  }
  if (Array.isArray(job.assigned_providers) && job.assigned_providers.length) {
    job.assigned_providers.forEach((p) => {
      const id = p?.id || p?.team_member_id || p?.provider_id
      const name =
        p?.name ||
        `${p?.first_name || ""} ${p?.last_name || ""}`.trim() ||
        p?.email ||
        ""
      push(id, name)
    })
  }
  if (Array.isArray(job.team_members) && job.team_members.length) {
    job.team_members.forEach((m) => {
      const id = m?.id || m?.team_member_id
      const name =
        m?.name ||
        `${m?.first_name || ""} ${m?.last_name || ""}`.trim() ||
        m?.email ||
        ""
      push(id, name)
    })
  }
  if (Array.isArray(job.job_team_assignments) && job.job_team_assignments.length) {
    job.job_team_assignments.forEach((a) => {
      push(a?.team_member_id || a?.id, a?.team_member_name)
    })
  }
  if (Array.isArray(job.team_assignments) && job.team_assignments.length) {
    job.team_assignments.forEach((a) => {
      push(a?.team_member_id || a?.id, a?.team_member_name)
    })
  }
  if (job.team_member_id) push(job.team_member_id, job.team_member_name)
  if (job.assigned_to) push(job.assigned_to, job.assigned_to_name)
  return out
}

const isAssigned = (job) => assigneesFor(job).length > 0

// Resolve the team lead for a multi-cleaner job. Looks at a few possible
// fields (the lead-assign UI is still TBD, so the field name may settle
// later). Returns the assignee object or null when no lead is set.
const teamLeadFor = (job) => {
  const assignees = assigneesFor(job)
  if (assignees.length < 2) return null
  const leadId =
    job.lead_cleaner_id ??
    job.team_lead_id ??
    job.lead_team_member_id ??
    job.lead_id ??
    job.primary_member_id ??
    job.primary_team_member_id ??
    null
  if (leadId == null) return null
  return assignees.find((a) => String(a.id) === String(leadId)) || null
}

// First name helper for team labels like "Tatiana's team".
const firstName = (name) => {
  if (!name) return ""
  return String(name).trim().split(/\s+/)[0]
}

// Read planned vs real duration in minutes. Real comes from
// start_time/end_time if both present and span a sensible delta.
const durationsFor = (job) => {
  const planned = parseInt(job.duration || job.service_duration || job.estimated_duration || 0, 10) || 0
  let real = 0
  const s = job.start_time || job.started_at
  const e = job.end_time || job.completed_at
  if (s && e) {
    const sd = new Date(s)
    const ed = new Date(e)
    if (!isNaN(sd) && !isNaN(ed)) {
      const diff = Math.round((ed - sd) / 60000)
      if (diff > 0 && diff < 24 * 60) real = diff
    }
  }
  const hoursWorked = parseFloat(job.hours_worked)
  if (!real && Number.isFinite(hoursWorked) && hoursWorked > 0) {
    real = Math.round(hoursWorked * 60)
  }
  return { planned, real }
}

const onShiftStatuses = new Set(["en route", "en_route", "in progress", "in_progress", "in-progress", "onsite", "on_site"])

// Tiny string hash for stable per-cleaner colors. Doesn't need to be
// cryptographic — just a number from a string id.
const stableHash = (s) => {
  const str = String(s ?? "")
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Page ───────────────────────────────────────────────────

const DashboardV2 = () => {
  const { user } = useAuth()
  const { locationId, selectedLocation, setLocationId } = useLocationScope()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [jobsAll, setJobsAll] = useState([])
  const [invoicesAll, setInvoicesAll] = useState([])
  const [teamMembersAll, setTeamMembersAll] = useState([])
  const [leadsAll, setLeadsAll] = useState([])
  const [scheduleView, setScheduleView] = useState("Day")
  const [queueFilter, setQueueFilter] = useState("all")

  const today = todayString()

  // Apply the current location filter to all top-level datasets so
  // every section of the page reacts when the switcher changes.
  const jobs = useMemo(() => filterByLocation(jobsAll, locationId), [jobsAll, locationId])
  const invoices = useMemo(() => filterByLocation(invoicesAll, locationId), [invoicesAll, locationId])
  const teamMembers = useMemo(() => filterByLocation(teamMembersAll, locationId), [teamMembersAll, locationId])
  const leads = useMemo(() => filterByLocation(leadsAll, locationId), [leadsAll, locationId])

  // Fetch dashboard data — last 7 days range to get "new leads this week" etc.
  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenString = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`
      const dateRange = `${sevenString} to ${today}`

      const [jobsResp, invoicesResp, teamResp] = await Promise.allSettled([
        jobsAPI.getAll(user.id, "", "", 1, 500, null, dateRange),
        invoicesAPI.getAll(user.id, { page: 1, limit: 200 }),
        teamAPI.getAll(user.id, { page: 1, limit: 100 }),
      ])
      const jobsList = jobsResp.status === "fulfilled" ? normalizeAPIResponse(jobsResp.value, "jobs") : []
      const invoicesList = invoicesResp.status === "fulfilled" ? normalizeAPIResponse(invoicesResp.value, "invoices") : []
      const teamList =
        teamResp.status === "fulfilled" ? (teamResp.value.teamMembers || teamResp.value || []) : []
      setJobsAll(jobsList)
      setInvoicesAll(invoicesList)
      setTeamMembersAll(teamList)

      // Leads are best-effort — leadsAPI.getAll may not be available for all roles
      try {
        const leadsList = await leadsAPI.getAll()
        setLeadsAll(Array.isArray(leadsList) ? leadsList : [])
      } catch {
        setLeadsAll([])
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id, today])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived ────────────────────────────────────────────────

  const todayJobs = useMemo(() => {
    return jobs
      .filter((j) => {
        const d = (j.scheduled_date || "").split("T")[0].split(" ")[0]
        return d === today
      })
      .sort((a, b) => {
        const at = jobStartDateTime(a)?.getTime() ?? Number.POSITIVE_INFINITY
        const bt = jobStartDateTime(b)?.getTime() ?? Number.POSITIVE_INFINITY
        return at - bt
      })
  }, [jobs, today])

  const kpiData = useMemo(() => {
    const revenueToday = todayJobs.reduce((sum, j) => {
      const inv = invoices.find((i) => i.job_id === j.id || i.jobId === j.id)
      return sum + parseFloat(inv?.total_amount || inv?.amount || j.total || j.service_price || 0)
    }, 0)
    const unassigned = todayJobs.filter((j) => !isAssigned(j)).length
    const onShift = todayJobs.filter((j) => onShiftStatuses.has((j.status || "").toLowerCase())).length
    const newLeadsWk = leads.filter((l) => {
      const c = l.created_at || l.createdAt
      if (!c) return false
      const created = new Date(c)
      const now = new Date()
      return now - created < 7 * 24 * 60 * 60 * 1000
    }).length
    const past7DaysCompleted = jobs.filter(
      (j) => (j.status || "").toLowerCase() === "completed"
    )
    const onTime = past7DaysCompleted.length
      ? Math.round(
          (past7DaysCompleted.filter((j) => !j.late && !j.was_late).length /
            past7DaysCompleted.length) *
            100
        )
      : null

    return {
      jobsToday: todayJobs.length,
      revenueToday,
      unassigned,
      onShift,
      teamSize: teamMembers.length || 0,
      newLeadsWk,
      onTime,
    }
  }, [todayJobs, invoices, jobs, leads, teamMembers])

  const queueJobs = useMemo(() => {
    const live = todayJobs.filter((j) => onShiftStatuses.has((j.status || "").toLowerCase()))
    const unassigned = todayJobs.filter((j) => !isAssigned(j))
    if (queueFilter === "live") return live
    if (queueFilter === "unassigned") return unassigned
    return todayJobs
  }, [todayJobs, queueFilter])

  // Unique cleaners with at least one job today (for the greeting line)
  const cleanersOnDuty = useMemo(() => {
    const ids = new Set()
    todayJobs.forEach((j) => assigneesFor(j).forEach((a) => ids.add(a.id)))
    return ids.size
  }, [todayJobs])

  // Multi-cleaner jobs today (a "team" in business terms)
  const teamJobsToday = useMemo(
    () => todayJobs.filter((j) => assigneesFor(j).length >= 2).length,
    [todayJobs]
  )

  const recentLeads = useMemo(() => {
    return [...leads]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 4)
  }, [leads])

  // ── Render ────────────────────────────────────────────────

  const greetingName = user?.firstName || user?.first_name || user?.email?.split("@")[0] || "there"

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)] flex flex-col"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader title="Dashboard" />

      {/* Greeting + KPIs */}
      <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="text-[11.5px] font-semibold text-[var(--sf-ink-3)] uppercase mb-1"
              style={{ letterSpacing: ".04em" }}
            >
              {formatEyebrowDate()}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                className="text-[22px] sm:text-[24px] font-bold text-[var(--sf-ink)] m-0"
                style={{ letterSpacing: "-0.02em", lineHeight: 1.15 }}
              >
                {greeting()}, {greetingName}
              </h1>
              {selectedLocation && (
                <ScopedToChip location={selectedLocation} onClear={() => setLocationId("all")} />
              )}
            </div>
            <div className="text-[13px] text-[var(--sf-ink-2)] mt-1">
              {loading ? (
                "Loading today's overview…"
              ) : kpiData.jobsToday === 0 ? (
                <>No jobs scheduled for today. Enjoy the quiet.</>
              ) : (
                <>
                  You have <b className="text-[var(--sf-ink)]">{kpiData.jobsToday} job{kpiData.jobsToday === 1 ? "" : "s"}</b> today
                  {cleanersOnDuty > 0 && (
                    <> across <b className="text-[var(--sf-ink)]">{cleanersOnDuty} {cleanersOnDuty === 1 ? "cleaner" : "cleaners"}</b></>
                  )}
                  {teamJobsToday > 0 && (
                    <> · <b className="text-[var(--sf-ink)]">{teamJobsToday} team{teamJobsToday === 1 ? "" : "s"}</b></>
                  )}
                  .
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <SfButton variant="secondary" size="md" icon={CalendarIcon} onClick={() => navigate("/schedule")}>
              Schedule
            </SfButton>
            <SfButton variant="primary" size="md" icon={Plus} onClick={() => navigate("/createjob")}>
              New job
            </SfButton>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <SfKPI
            label="Jobs today"
            value={kpiData.jobsToday}
            accent="var(--sf-blue)"
            sub="scheduled"
          />
          <SfKPI
            label="Revenue today"
            value={formatMoney(kpiData.revenueToday)}
            accent="var(--sf-green)"
            sub="projected"
          />
          <SfKPI
            label="Unassigned"
            value={kpiData.unassigned}
            accent="var(--sf-red)"
            sub={kpiData.unassigned > 0 ? "needs attention" : "all assigned"}
          />
          <SfKPI
            label="On shift"
            value={`${kpiData.onShift} / ${kpiData.teamSize || "—"}`}
            accent="var(--sf-purple)"
            sub={kpiData.teamSize ? `${Math.max(0, kpiData.teamSize - kpiData.onShift)} idle` : "—"}
            mono
          />
          <SfKPI
            label="New leads · wk"
            value={kpiData.newLeadsWk}
            accent="var(--sf-amber)"
            sub="past 7 days"
          />
          <SfKPI
            label="On-time rate"
            value={kpiData.onTime != null ? `${kpiData.onTime}%` : "—"}
            accent="var(--sf-teal)"
            sub="last 7 days"
          />
        </div>
      </div>

      {/* Schedule timeline */}
      <div className="px-4 sm:px-6 lg:px-8 pb-3">
        <ScheduleTimelineCard
          jobs={todayJobs}
          teamMembers={teamMembers}
          scheduleView={scheduleView}
          setScheduleView={setScheduleView}
          onJobClick={(id) => navigate(`/job/${id}`)}
          onOpenSchedule={() => navigate("/schedule")}
        />
      </div>

      {/* Two-column zone */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-[62fr_38fr] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <JobQueueCard
            jobs={queueJobs}
            totalToday={todayJobs.length}
            filter={queueFilter}
            setFilter={setQueueFilter}
            unassignedCount={todayJobs.filter((j) => !isAssigned(j)).length}
            liveCount={todayJobs.filter((j) => onShiftStatuses.has((j.status || "").toLowerCase())).length}
            onJobClick={(id) => navigate(`/job/${id}`)}
            onSeeAll={() => navigate("/jobs")}
          />
          <RoutesMapCard
            jobs={todayJobs}
            teamMembers={teamMembers}
            onFullMap={() => navigate("/staff-locations")}
          />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <HotLeadsCard leads={recentLeads} onSeePipeline={() => navigate("/leads")} />
          <ActivityCard
            jobs={jobs}
            leads={leads}
            invoices={invoices}
            teamMembers={teamMembers}
            onSeeAll={() => navigate("/jobs")}
          />
        </div>
      </div>
    </div>
  )
}

// ── Schedule timeline ──────────────────────────────────────

const LANE_HEIGHT = 36
const ROW_PADDING_Y = 6

// Greedy interval scheduling: assign each job to the lowest-numbered lane
// whose previous job ends before this one starts. Returns a Map keyed
// by job.id with the lane index, and the total lane count.
const allocateLanes = (jobs) => {
  const ordered = [...jobs].sort((a, b) => (a._startMin ?? 0) - (b._startMin ?? 0))
  const laneEnds = [] // laneIndex -> end time (mins)
  const allocation = new Map()
  for (const j of ordered) {
    if (j._startMin == null) continue
    let assigned = -1
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= j._startMin) { assigned = i; break }
    }
    if (assigned === -1) {
      laneEnds.push(j._endMin)
      assigned = laneEnds.length - 1
    } else {
      laneEnds[assigned] = j._endMin
    }
    allocation.set(String(j.id), assigned)
  }
  return { allocation, laneCount: Math.max(1, laneEnds.length) }
}

// Status → visual variant. Used to give each job block a distinct look
// without depending on a text label.
const statusVariant = (statusRaw, color) => {
  const s = (statusRaw || "").toLowerCase()
  if (s === "completed" || s === "complete" || s === "done") {
    return {
      kind: "completed",
      bg: `${color}d9`, // 85% opacity
      fg: "#fff",
      glyph: "✓",
      glyphColor: "#fff",
      borderStyle: "solid",
    }
  }
  if (s === "in progress" || s === "in_progress" || s === "onsite" || s === "on_site") {
    return {
      kind: "live",
      bg: color,
      fg: "#fff",
      glyph: "●",
      glyphColor: "#fff",
      borderStyle: "solid",
      pulse: true,
    }
  }
  if (s === "en route" || s === "en_route" || s === "enroute") {
    return {
      kind: "enroute",
      bg: `linear-gradient(90deg, ${color}, ${color}cc)`,
      fg: "#fff",
      glyph: "→",
      glyphColor: "#fff",
      borderStyle: "solid",
    }
  }
  if (s === "cancelled" || s === "canceled") {
    return {
      kind: "cancelled",
      bg: `${color}1a`, // 10%
      fg: color,
      glyph: "✕",
      glyphColor: color,
      borderStyle: "dashed",
      strike: true,
    }
  }
  // Scheduled / pending / unknown — default
  return {
    kind: "scheduled",
    bg: `${color}2e`, // 18%
    fg: "var(--sf-ink)",
    glyph: null,
    glyphColor: null,
    borderStyle: "solid",
  }
}

const ScheduleTimelineCard = ({ jobs, teamMembers = [], scheduleView, setScheduleView, onJobClick, onOpenSchedule }) => {
  // Build an id → display-name lookup so timeline rows show the actual
  // cleaner instead of a generic "Team member" fallback. Jobs in this
  // codebase carry team_member_id but not the name — the name lives on
  // the team_members rows we already fetched.
  const memberNameById = useMemo(() => {
    const map = new Map()
    teamMembers.forEach((m) => {
      if (m?.id == null) return
      const name =
        m.name ||
        `${m.first_name || ""} ${m.last_name || ""}`.trim() ||
        m.email ||
        ""
      if (name) map.set(String(m.id), name)
    })
    return map
  }, [teamMembers])

  const resolveName = useCallback(
    (id, fallback) => {
      if (!id) return fallback || ""
      const looked = memberNameById.get(String(id))
      return looked || fallback || ""
    },
    [memberNameById]
  )

  // Dynamic ruler — span from the earliest start to the latest end of
  // today's jobs, padded so blocks have breathing room. Defaults to a
  // 7am–7pm window when there's nothing to chart.
  const { startHr: dynStartHr, endHr: dynEndHr } = useMemo(() => {
    let minM = Infinity
    let maxM = -Infinity
    jobs.forEach((j) => {
      const start = jobStartDateTime(j)
      if (!start || isNaN(start)) return
      const startMin = start.getHours() * 60 + start.getMinutes()
      const duration = parseInt(j.duration || j.service_duration || j.estimated_duration || 60, 10) || 60
      const endMin = startMin + duration
      if (startMin < minM) minM = startMin
      if (endMin > maxM) maxM = endMin
    })
    if (!isFinite(minM)) return { startHr: 7, endHr: 19 }
    const startHr = Math.max(0, Math.floor(minM / 60) - 1)
    const endHr = Math.min(24, Math.ceil(maxM / 60) + 1)
    return { startHr: Math.min(startHr, 7), endHr: Math.max(endHr, 19) }
  }, [jobs])

  const startHr = dynStartHr
  const endHr = dynEndHr
  const hours = []
  for (let h = startHr; h <= endHr; h++) hours.push(h)

  const pct = (mins) => Math.max(0, Math.min(100, ((mins - startHr * 60) / ((endHr - startHr) * 60)) * 100))

  // Now-line
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const nowPct = pct(nowMins)
  const showNow = now.getHours() >= startHr && now.getHours() <= endHr

  // One row per cleaner. Multi-cleaner jobs (a "team") render on every
  // assigned cleaner's row with a small team badge. Unassigned jobs land
  // in a single "Unassigned" row at the bottom.
  const rows = useMemo(() => {
    const map = new Map() // cleanerId -> { id, name, jobs: [...] }
    jobs.forEach((j) => {
      const assignees = assigneesFor(j)
      const teamSize = assignees.length
      const augmented = { ...j, _teamSize: teamSize }
      if (teamSize === 0) {
        if (!map.has("unassigned")) map.set("unassigned", { id: "unassigned", name: "Unassigned", jobs: [] })
        map.get("unassigned").jobs.push(augmented)
        return
      }
      assignees.forEach((a) => {
        if (!map.has(a.id)) map.set(a.id, { id: a.id, name: a.name, jobs: [] })
        // Prefer the first non-empty name we encounter
        if (!map.get(a.id).name && a.name) map.get(a.id).name = a.name
        map.get(a.id).jobs.push(augmented)
      })
    })
    const arr = Array.from(map.values()).sort((a, b) => {
      if (a.id === "unassigned") return 1
      if (b.id === "unassigned") return -1
      return 0
    })
    // Assign each cleaner a *unique* color among today's rows so two
    // cleaners never share the same hue on the same screen.
    const assignableIds = arr.map((r) => r.id).filter((id) => id !== "unassigned")
    const colorMap = sfAssignTeamColors(assignableIds)
    return arr.map((row) => {
      const resolved = row.id === "unassigned" ? "Unassigned" : resolveName(row.id, row.name)
      return {
        ...row,
        label: resolved || "Team member",
        color: row.id === "unassigned" ? "#DC2626" : (colorMap.get(String(row.id)) || sfTeamColor(stableHash(row.id))),
      }
    })
  }, [jobs, resolveName])

  const cleanerRowCount = rows.filter((r) => r.id !== "unassigned").length
  const teamJobCount = jobs.filter((j) => assigneesFor(j).length >= 2).length

  return (
    <SfCard padding={0}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]" style={{ letterSpacing: "-0.005em" }}>
            Today's schedule
          </div>
          <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
            {cleanerRowCount} {cleanerRowCount === 1 ? "cleaner" : "cleaners"}
            {teamJobCount > 0 && <> · {teamJobCount} {teamJobCount === 1 ? "team" : "teams"}</>}
            {" · "}{jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </div>
        </div>
        <SfSegmented options={["Day", "Week", "Month"]} value={scheduleView} onChange={setScheduleView} />
        <SfButton variant="secondary" size="sm" iconRight={ArrowRight} onClick={onOpenSchedule}>
          Open schedule
        </SfButton>
      </div>

      {jobs.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          No jobs scheduled for today.
        </div>
      ) : (
        <div className="px-4 sm:px-5 pb-4">
          {/* Hour ruler */}
          <div
            className="flex"
            style={{
              marginLeft: 100,
              fontSize: 10.5,
              color: "var(--sf-ink-3)",
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hours.map((h, i) => (
              <div
                key={h}
                className="flex-1 pl-1 pb-1"
                style={{ borderLeft: i === 0 ? "none" : "1px dashed var(--sf-border-soft)" }}
              >
                {h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`}
              </div>
            ))}
          </div>
          {/* Team rows */}
          <div className="flex flex-col gap-2 mt-1">
            {rows.map((row) => {
              const teamJobsHere = row.jobs.filter((x) => (x._teamSize ?? 1) >= 2).length

              // Pre-compute interval + lane for each job on this row.
              const jobsWithIntervals = row.jobs.map((j) => {
                const startDt = jobStartDateTime(j)
                const startMin = startDt ? startDt.getHours() * 60 + startDt.getMinutes() : null
                const { planned, real } = durationsFor(j)
                const dur = planned || real || 60
                return {
                  ...j,
                  _startMin: startMin,
                  _endMin: startMin != null ? startMin + dur : null,
                  _planned: planned,
                  _real: real,
                  _duration: dur,
                }
              })
              const { allocation, laneCount } = allocateLanes(jobsWithIntervals)
              const rowHeight = laneCount * LANE_HEIGHT + ROW_PADDING_Y * 2

              return (
              <div key={row.id} className="flex items-start gap-2.5">
                <div className="w-[120px] flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 4 }}>
                  {row.id === "unassigned" ? (
                    <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
                  ) : (
                    <SfAvatar
                      initials={sfInitials(row.label) || "—"}
                      color={row.color}
                      size={22}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-semibold text-[var(--sf-ink)] leading-tight truncate">
                      {row.label}
                    </div>
                    <div className="text-[10px] text-[var(--sf-ink-3)] mt-px">
                      {row.jobs.length} job{row.jobs.length === 1 ? "" : "s"}
                      {teamJobsHere > 0 && <> · {teamJobsHere} team</>}
                    </div>
                  </div>
                </div>
                <div
                  className="relative flex-1 rounded-md"
                  style={{ height: rowHeight, background: "var(--sf-panel-alt)", border: "1px solid var(--sf-border-soft)" }}
                >
                  {/* hour grid lines */}
                  {hours.slice(1).map((h, j) => (
                    <span
                      key={h}
                      className="absolute"
                      style={{
                        top: 6,
                        bottom: 6,
                        left: `${((j + 1) / (endHr - startHr)) * 100}%`,
                        width: 1,
                        background: "var(--sf-border-soft)",
                      }}
                    />
                  ))}
                  {/* now line */}
                  {showNow && (
                    <span
                      className="absolute z-10"
                      style={{
                        top: -4,
                        bottom: -4,
                        left: `${nowPct}%`,
                        width: 2,
                        background: "var(--sf-red)",
                        borderRadius: 1,
                      }}
                    >
                      <span
                        className="absolute"
                        style={{
                          top: -6,
                          left: -3,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: "var(--sf-red)",
                          boxShadow: "0 0 0 3px var(--sf-red-soft)",
                        }}
                      />
                    </span>
                  )}
                  {/* job blocks */}
                  {jobsWithIntervals.map((j) => {
                    if (j._startMin == null) return null
                    const start = parseTime(j)
                    if (!start) return null
                    const planned = j._planned
                    const real = j._real
                    const duration = j._duration
                    const left = pct(start.minutes)
                    const widthPct = Math.max(3, (duration / ((endHr - startHr) * 60)) * 100)
                    const statusRaw = (j.status || "").toLowerCase()
                    const isCompleted = statusRaw === "completed" || statusRaw === "complete" || statusRaw === "done"
                    const teamSize = j._teamSize ?? 1
                    const isTeamJob = teamSize >= 2
                    const lead = isTeamJob ? teamLeadFor(j) : null
                    const leadName = lead ? resolveName(lead.id, lead.name) : ""
                    const isLead = lead && String(lead.id) === String(row.id)
                    const customer = j.customer_first_name || (j.customer_name || "").split(" ")[0] || "—"

                    // Block label varies by team role on this row.
                    // For multi-cleaner jobs *with* a lead set, prefix with
                    // "{lead}'s team" on the lead's row and "w/ {lead}" on
                    // co-workers' rows so the team identity is explicit.
                    // For multi-cleaner jobs *without* a lead, fall through
                    // to the customer/service format — the +N badge in the
                    // top-right already signals it's a team job.
                    let blockTitle
                    if (isTeamJob && lead && isLead) {
                      blockTitle = `${firstName(leadName) || "Team"}'s team · ${customer}`
                    } else if (isTeamJob && lead && !isLead) {
                      blockTitle = `w/ ${firstName(leadName) || "team"} · ${customer}`
                    } else {
                      blockTitle = j.service_name ? `${customer} · ${j.service_name}` : customer
                    }

                    // Overtime / undertime — only meaningful for completed jobs.
                    const showDelta = isCompleted && planned > 0 && real > 0 && Math.abs(real - planned) >= 3
                    const overtimeMins = showDelta && real > planned ? real - planned : 0
                    const undertimeMins = showDelta && real < planned ? planned - real : 0
                    const overtimePct = overtimeMins
                      ? Math.max(0.5, (overtimeMins / ((endHr - startHr) * 60)) * 100)
                      : 0
                    const undertimePctOfBlock = undertimeMins && duration
                      ? (undertimeMins / duration) * 100
                      : 0

                    // Variant per status — gives each state a distinct look.
                    const variant = statusVariant(statusRaw, row.color)
                    const isFilled = ["completed", "live", "enroute"].includes(variant.kind)
                    const subFg = isFilled ? "rgba(255,255,255,.88)" : "var(--sf-ink-2)"

                    // Lane positioning
                    const lane = allocation.get(String(j.id)) ?? 0
                    const top = ROW_PADDING_Y + lane * LANE_HEIGHT
                    const blockHeight = LANE_HEIGHT - 4

                    return (
                      <span key={`${row.id}-${j.id}`} className="contents">
                        <button
                          onClick={() => onJobClick(j.id)}
                          className={`sf-timeline-block absolute flex items-stretch text-left overflow-hidden cursor-pointer ${overtimeMins ? "has-overtime" : ""}`}
                          style={{
                            top,
                            height: blockHeight,
                            left: `${left}%`,
                            width: `${widthPct}%`,
                            background: variant.bg,
                            border: variant.borderStyle === "dashed" ? `1.5px dashed ${row.color}` : "none",
                            borderLeft: variant.borderStyle === "dashed"
                              ? `1.5px dashed ${row.color}`
                              : `3px solid ${row.color}`,
                            color: variant.fg,
                            padding: 0,
                            fontSize: 11,
                            fontWeight: 600,
                            fontFamily: "var(--sf-font-ui)",
                            boxShadow: variant.kind === "live"
                              ? `0 0 0 2px ${row.color}40, 0 1px 4px ${row.color}40`
                              : variant.kind === "enroute"
                              ? `0 1px 4px ${row.color}40`
                              : "none",
                          }}
                          title={`${blockTitle} · ${variant.kind}${planned ? ` · planned ${planned}m` : ""}${real ? ` · real ${real}m` : ""}${overtimeMins ? ` · +${overtimeMins}m overtime` : undertimeMins ? ` · −${undertimeMins}m undertime` : ""}`}
                        >
                          {/* Status glyph column on the left of the block — clear visual
                              indicator (no label) for en route / live / completed / cancelled. */}
                          {variant.glyph && (
                            <span
                              className="flex items-center justify-center flex-shrink-0"
                              style={{
                                width: 18,
                                fontSize: variant.kind === "live" ? 8 : 12,
                                fontWeight: 800,
                                color: variant.glyphColor,
                                background: isFilled ? "rgba(0,0,0,.12)" : `${row.color}1f`,
                                animation: variant.pulse ? "sfPulse 1.4s ease-in-out infinite" : undefined,
                              }}
                              aria-hidden="true"
                            >
                              {variant.glyph}
                            </span>
                          )}

                          <span
                            className="relative flex flex-col justify-center min-w-0 flex-1 overflow-hidden"
                            style={{ padding: "2px 7px" }}
                          >
                            {/* undertime: unused trailing slice of the block */}
                            {undertimeMins > 0 && (
                              <span
                                className="absolute top-0 bottom-0 right-0 pointer-events-none"
                                style={{
                                  width: `${undertimePctOfBlock}%`,
                                  background:
                                    "repeating-linear-gradient(45deg, rgba(255,255,255,.92) 0 6px, #16A34A 6px 9px)",
                                  borderLeft: "1.5px dashed #15803D",
                                }}
                              />
                            )}

                            {/* team count badge top-right */}
                            {isTeamJob && (
                              <span
                                className="absolute top-[1px] right-[3px] flex items-center justify-center"
                                style={{
                                  minWidth: 15,
                                  height: 13,
                                  padding: "0 3px",
                                  borderRadius: 7,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  fontFamily: "var(--sf-font-mono)",
                                  background: isFilled ? "rgba(255,255,255,.25)" : `${row.color}55`,
                                  color: isFilled ? "#fff" : row.color,
                                  letterSpacing: "0",
                                }}
                              >
                                +{teamSize - 1}
                              </span>
                            )}

                            <span
                              className="whitespace-nowrap overflow-hidden text-ellipsis relative z-[1]"
                              style={{
                                lineHeight: 1.1,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "-0.005em",
                                paddingRight: isTeamJob ? 18 : 0,
                                textDecoration: variant.strike ? "line-through" : "none",
                              }}
                            >
                              {blockTitle}
                            </span>
                            <span
                              className="whitespace-nowrap overflow-hidden text-ellipsis relative z-[1]"
                              style={{ fontSize: 9.5, fontWeight: 500, color: subFg }}
                            >
                              {start.label} · {planned || duration}m
                              {overtimeMins > 0 && (
                                <span style={{ marginLeft: 4, color: isFilled ? "#FFE2E2" : "var(--sf-red-dark)", fontWeight: 700 }}>
                                  +{overtimeMins}m
                                </span>
                              )}
                              {undertimeMins > 0 && (
                                <span style={{ marginLeft: 4, color: isFilled ? "#D4FBE2" : "var(--sf-green-dark)", fontWeight: 700 }}>
                                  −{undertimeMins}m
                                </span>
                              )}
                            </span>
                          </span>
                        </button>

                        {/* overtime extension (red striped) past the planned end */}
                        {overtimeMins > 0 && (
                          <span
                            className="absolute pointer-events-none"
                            style={{
                              top,
                              height: blockHeight,
                              left: `${left + widthPct}%`,
                              width: `${overtimePct}%`,
                              background:
                                "repeating-linear-gradient(45deg, #DC2626 0 6px, #B91C1C 6px 12px)",
                              borderRadius: "0 5px 5px 0",
                            }}
                            title={`+${overtimeMins}m overtime`}
                          />
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )})}
          </div>
        </div>
      )}
    </SfCard>
  )
}

// ── Job queue ──────────────────────────────────────────────

const JobQueueCard = ({ jobs, totalToday, filter, setFilter, unassignedCount, liveCount, onJobClick, onSeeAll }) => (
  <SfCard padding={0}>
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[var(--sf-border-soft)]">
      <div>
        <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">Job queue</div>
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
          {jobs.length} of {totalToday} today
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <SfFilterChip active={filter === "all"} count={totalToday} onClick={() => setFilter("all")}>
          All
        </SfFilterChip>
        <SfFilterChip active={filter === "live"} count={liveCount} onClick={() => setFilter("live")}>
          Live
        </SfFilterChip>
        <SfFilterChip
          active={filter === "unassigned"}
          count={unassignedCount}
          onClick={() => setFilter("unassigned")}
        >
          Unassigned
        </SfFilterChip>
      </div>
    </div>
    <div>
      {jobs.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          Nothing in this view.
        </div>
      ) : (
        jobs.slice(0, 6).map((j, i) => {
          const t = parseTime(j)
          const duration = parseInt(j.duration || j.service_duration || j.estimated_duration || 0, 10)
          const customer = j.customer_name || `${j.customer_first_name || ""} ${j.customer_last_name || ""}`.trim() || "—"
          const value = parseFloat(j.total || j.service_price || 0)
          const idDisplay = j.id ? `#${String(j.id).slice(-4)}` : ""
          const status = jobStatusLabel(j.status)
          const teamColor = isAssigned(j) ? sfTeamColor(i) : "#DC2626"
          return (
            <button
              key={j.id || i}
              onClick={() => onJobClick(j.id)}
              className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-left bg-transparent hover:bg-[var(--sf-panel-alt)] transition-colors"
              style={{
                borderBottom: i === Math.min(5, jobs.length - 1) ? "none" : "1px solid var(--sf-border-soft)",
                fontFamily: "var(--sf-font-ui)",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
              }}
            >
              <div className="w-[58px] text-center flex-shrink-0">
                <div
                  className="text-[13.5px] font-bold text-[var(--sf-ink)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {t?.label.split(" ")[0] || "—"}
                </div>
                <div className="text-[10px] text-[var(--sf-ink-3)] font-medium mt-px">
                  {duration ? `${duration}m` : ""}
                </div>
              </div>
              <div
                className="w-[3px] h-9 rounded flex-shrink-0"
                style={{ background: teamColor }}
              />
              <SfAvatar initials={sfInitials(customer)} color="var(--sf-ink)" size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold text-[var(--sf-ink)] truncate">
                    {customer}
                  </span>
                  {j.is_recurring && (
                    <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">
                      ↻ Recurring
                    </SfTag>
                  )}
                </div>
                <div className="text-[11.5px] text-[var(--sf-ink-2)] mt-0.5 flex items-center gap-1.5 truncate">
                  <span className="truncate">{j.service_name || "Service"}</span>
                  {(j.service_address || j.customer_address) && (
                    <>
                      <span className="text-[var(--sf-ink-4)]">·</span>
                      <MapPin size={11} className="text-[var(--sf-ink-3)] flex-shrink-0" />
                      <span className="truncate">
                        {(j.service_address || j.customer_address || "").split(",")[0]}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 hidden sm:block">
                <div
                  className="text-[13.5px] font-semibold text-[var(--sf-ink)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {value ? formatMoneyExact(value) : "—"}
                </div>
                <div
                  className="text-[10.5px] text-[var(--sf-ink-3)] mt-px"
                  style={{ fontFamily: "var(--sf-font-mono)" }}
                >
                  {idDisplay}
                </div>
              </div>
              <div className="hidden md:block w-[110px] flex-shrink-0">
                <SfStatusPill status={status} />
              </div>
              <MoreHorizontal size={16} className="text-[var(--sf-ink-3)] flex-shrink-0" />
            </button>
          )
        })
      )}
    </div>
    {jobs.length > 0 && (
      <div className="px-4 py-2.5 border-t border-[var(--sf-border-soft)] text-center">
        <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onSeeAll}>
          View all jobs
        </SfButton>
      </div>
    )}
  </SfCard>
)

// ── Today's routes (map) ───────────────────────────────────

const RoutesMapCard = ({ jobs, teamMembers, onFullMap }) => {
  const active = jobs.length
  return (
    <SfCard padding={0}>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[var(--sf-border-soft)]">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">Today's routes</div>
          <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
            {active === 0 ? "No jobs to map" : `${active} ${active === 1 ? "job" : "jobs"} · live tracking`}
          </div>
        </div>
        <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onFullMap}>
          Full map
        </SfButton>
      </div>
      <div style={{ height: 280 }}>
        {jobs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12.5px] text-[var(--sf-ink-3)]">
            No jobs scheduled for today.
          </div>
        ) : (
          <JobsMap jobs={jobs} teamMembers={teamMembers} />
        )}
      </div>
    </SfCard>
  )
}

// ── Activity feed ──────────────────────────────────────────

const formatRelative = (date) => {
  if (!date) return ""
  const d = typeof date === "string" ? new Date(date) : date
  if (isNaN(d)) return ""
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const ActivityCard = ({ jobs, leads, invoices, teamMembers, onSeeAll }) => {
  // Build a unified, sorted activity feed from the data we already have
  // on the page. Each entry has kind, when, who, text, optional amount.
  const memberNameById = useMemo(() => {
    const map = new Map()
    teamMembers.forEach((m) => {
      if (m?.id == null) return
      const n = m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email
      if (n) map.set(String(m.id), n)
    })
    return map
  }, [teamMembers])

  const entries = useMemo(() => {
    const out = []
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    jobs.forEach((j) => {
      const status = (j.status || "").toLowerCase()
      const customer = j.customer_name || `${j.customer_first_name || ""} ${j.customer_last_name || ""}`.trim() || "a job"
      const cleanerId = j.team_member_id || j.assigned_to
      const cleaner = cleanerId ? memberNameById.get(String(cleanerId)) : null
      const idDisp = j.id ? `#${String(j.id).slice(-4)}` : ""

      if ((status === "completed" || status === "complete" || status === "done") && (j.completed_at || j.end_time || j.updated_at)) {
        const when = new Date(j.completed_at || j.end_time || j.updated_at)
        if (when.getTime() > cutoff) {
          out.push({
            kind: "completed",
            when,
            who: cleaner || "Job",
            text: cleaner ? `completed ${customer}'s job ${idDisp}` : `${customer}'s job ${idDisp} completed`,
          })
        }
      } else if (status === "en route" || status === "en_route") {
        const when = new Date(j.updated_at || j.start_time || Date.now())
        out.push({
          kind: "enroute",
          when,
          who: cleaner || "Cleaner",
          text: `en route to ${customer}`,
        })
      } else if (status === "in progress" || status === "in_progress") {
        const when = new Date(j.start_time || j.updated_at || Date.now())
        out.push({
          kind: "started",
          when,
          who: cleaner || "Cleaner",
          text: `started ${customer}'s job ${idDisp}`,
        })
      } else if (status === "cancelled" || status === "canceled") {
        const when = new Date(j.cancelled_at || j.updated_at)
        if (when.getTime() > cutoff) {
          out.push({
            kind: "cancelled",
            when,
            who: customer,
            text: `cancelled · ${idDisp}`,
          })
        }
      }
    })

    leads.forEach((l) => {
      const when = new Date(l.created_at || l.createdAt)
      if (isNaN(when) || when.getTime() < cutoff) return
      const name = l.name || `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Lead"
      out.push({
        kind: "lead",
        when,
        who: "New lead",
        text: `${name}${l.source ? ` · ${l.source}` : ""}`,
        amount: l.estimated_value || l.value,
      })
    })

    invoices.forEach((inv) => {
      if ((inv.status || "").toLowerCase() === "paid" && (inv.paid_at || inv.updated_at)) {
        const when = new Date(inv.paid_at || inv.updated_at)
        if (when.getTime() > cutoff) {
          out.push({
            kind: "paid",
            when,
            who: "Invoice",
            text: `#${String(inv.id || "").slice(-4)} paid`,
            amount: inv.total_amount || inv.amount || inv.total,
          })
        }
      }
    })

    return out.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 8)
  }, [jobs, leads, invoices, memberNameById])

  const ICON_META = {
    completed: { icon: "✓", c: "#15803D", bg: "#ECFDF5" },
    started:   { icon: "▶", c: "#1E40AF", bg: "#EEF4FF" },
    enroute:   { icon: "→", c: "#1E40AF", bg: "#EEF4FF" },
    cancelled: { icon: "×", c: "#B91C1C", bg: "#FEE2E2" },
    lead:      { icon: "★", c: "#0E7490", bg: "#CFFAFE" },
    paid:      { icon: "$", c: "#15803D", bg: "#ECFDF5" },
  }

  return (
    <SfCard>
      <SfCardHeader
        title="Activity"
        right={
          <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onSeeAll}>
            See all
          </SfButton>
        }
      />
      {entries.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          No recent activity.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {entries.map((e, i) => {
            const m = ICON_META[e.kind] || ICON_META.completed
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                  style={{ background: m.bg, color: m.c, border: `1px solid ${m.c}22` }}
                >
                  {m.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-[var(--sf-ink)] leading-tight">
                    <span className="font-semibold">{e.who}</span>{" "}
                    <span className="text-[var(--sf-ink-2)]">{e.text}</span>
                  </div>
                  <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-px">
                    {formatRelative(e.when)}
                  </div>
                </div>
                {e.amount && (
                  <div
                    className="text-[11.5px] font-semibold flex-shrink-0"
                    style={{
                      color: e.kind === "paid" || e.kind === "lead" ? "#15803D" : "var(--sf-ink-2)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatMoneyExact(parseFloat(e.amount) || 0)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SfCard>
  )
}

// ── Hot leads ──────────────────────────────────────────────

const HotLeadsCard = ({ leads, onSeePipeline }) => {
  const ageOf = (createdAt) => {
    if (!createdAt) return "—"
    const d = new Date(createdAt)
    const diff = Date.now() - d.getTime()
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    if (days === 0) {
      const hrs = Math.floor(diff / (60 * 60 * 1000))
      if (hrs === 0) return "just now"
      return `${hrs}h ago`
    }
    return `${days}d ago`
  }
  return (
    <SfCard>
      <SfCardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Hot leads
            {leads.length > 0 && (
              <span
                className="text-[10.5px] font-bold text-white bg-[var(--sf-red)] px-1.5 py-px rounded"
                style={{ fontFamily: "var(--sf-font-mono)" }}
              >
                {leads.length} NEW
              </span>
            )}
          </span>
        }
        right={
          <SfButton variant="ghost" size="sm" iconRight={ArrowRight} onClick={onSeePipeline}>
            Pipeline
          </SfButton>
        }
      />
      {leads.length === 0 ? (
        <div className="py-6 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          No recent leads.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {leads.map((l) => {
            const name = l.name || `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Lead"
            const value = parseFloat(l.estimated_value || l.value || 0)
            return (
              <div key={l.id} className="flex items-center gap-2.5">
                <SfAvatar initials={sfInitials(name)} color="var(--sf-blue)" size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] font-semibold text-[var(--sf-ink)] leading-tight truncate">
                      {name}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-px flex items-center gap-1 truncate">
                    <TagIcon size={10} />
                    {l.source || "—"} · {l.stage || "new"} · {ageOf(l.created_at)}
                  </div>
                </div>
                {value > 0 && (
                  <div
                    className="text-[13px] font-semibold text-[var(--sf-ink)] flex-shrink-0"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatMoneyExact(value)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SfCard>
  )
}

// ── Location filter indicator chip ─────────────────────────

const ScopedToChip = ({ location, onClear }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[11.5px] font-semibold"
    style={{
      background: "var(--sf-blue-soft)",
      color: "var(--sf-blue-dark)",
      border: `1px solid ${location?.color || "var(--sf-blue)"}25`,
    }}
  >
    <span
      className="w-1.5 h-1.5 rounded-full"
      style={{ background: location?.color || "var(--sf-blue)" }}
    />
    {location?.name}
    <button
      type="button"
      onClick={onClear}
      aria-label="Clear location filter"
      className="opacity-70 hover:opacity-100 transition-opacity ml-px"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "inherit",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  </span>
)

export default DashboardV2
