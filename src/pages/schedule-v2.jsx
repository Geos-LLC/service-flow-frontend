"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Plus,
  MapPin,
  Map as MapIcon,
  Check,
  Minus,
  X,
  Calendar as CalendarIcon,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope, filterByLocation } from "../context/LocationContext"
import { jobsAPI, teamAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfButton,
  SfKPI,
  SfTag,
  SfTab,
  SfAvatar,
  SfPageHeader,
  sfInitials,
  sfTeamColor,
  sfAssignTeamColors,
} from "../components/sf-primitives"

/**
 * Schedule v2 (Wave 5) — Service Blue redesign of /schedule.
 *
 * Tabs: Schedule · Availability · Routes · Unassigned
 * Views (Schedule tab only): Day · Week · Month
 *
 * Plugs into the existing jobsAPI + teamAPI. No new backend.
 */

// ── Helpers (duplicated from dashboard-v2 — kept inline rather than
// abstracted to avoid touching the dashboard's working file) ──────

const jobStartDateTime = (job) => {
  const candidates = [job.scheduled_date, job.start_time, job.service_time]
  for (const c of candidates) {
    if (!c) continue
    const raw = String(c).trim()
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

const assigneesFor = (job) => {
  const seen = new Set()
  const out = []
  const push = (rawId, name) => {
    const id = rawId == null ? null : String(rawId)
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ id, name: name || "" })
  }
  if (Array.isArray(job.assigned_providers)) {
    job.assigned_providers.forEach((p) =>
      push(
        p?.id || p?.team_member_id || p?.provider_id,
        p?.name || `${p?.first_name || ""} ${p?.last_name || ""}`.trim() || p?.email
      )
    )
  }
  if (Array.isArray(job.team_members)) {
    job.team_members.forEach((m) =>
      push(
        m?.id || m?.team_member_id,
        m?.name || `${m?.first_name || ""} ${m?.last_name || ""}`.trim() || m?.email
      )
    )
  }
  if (Array.isArray(job.job_team_assignments)) {
    job.job_team_assignments.forEach((a) =>
      push(a?.team_member_id || a?.id, a?.team_member_name)
    )
  }
  if (Array.isArray(job.team_assignments)) {
    job.team_assignments.forEach((a) =>
      push(a?.team_member_id || a?.id, a?.team_member_name)
    )
  }
  if (job.team_member_id) push(job.team_member_id, job.team_member_name)
  if (job.assigned_to) push(job.assigned_to, job.assigned_to_name)
  return out
}

const isCancelledJob = (j) => {
  const s = String(j?.status || "").toLowerCase()
  return s === "cancelled" || s === "canceled"
}

const isLiveJob = (j) => {
  const s = String(j?.status || "").toLowerCase()
  return s === "in_progress" || s === "in-progress" || s === "in progress" || s === "en_route" || s === "en route"
}

const durationMinutes = (job) => {
  const raw = job.duration || job.service_duration || job.estimated_duration || 60
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 60
}

// Group overlapping jobs in the same day column into clusters. A
// cluster spans the union of its members' timespans; a single job
// renders normally, two or more render as a stacked mini-row card
// instead of fighting for horizontal lanes.
//   See ADDON_schedule_overlap_and_assign.md Part 1.
const layoutDay = (dayJobs) => {
  const sorted = [...dayJobs]
    .map((j) => {
      const d = jobStartDateTime(j)
      if (!d) return null
      const start = d.getHours() * 60 + d.getMinutes()
      const end = start + durationMinutes(j)
      return { job: j, start, end }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const clusters = []
  sorted.forEach(({ job, start, end }) => {
    const cl = clusters.find((c) => start < c.end && end > c.start)
    if (cl) {
      cl.jobs.push({ job, start, end })
      cl.start = Math.min(cl.start, start)
      cl.end = Math.max(cl.end, end)
    } else {
      clusters.push({ start, end, jobs: [{ job, start, end }] })
    }
  })
  return clusters
}

const sameDay = (a, b) =>
  a && b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const startOfWeek = (d) => {
  // Monday-start week (matches the prototype)
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // Mon=0 .. Sun=6
  return addDays(x, -dow)
}

const formatHourLabel = (h) => {
  if (h === 0) return "12a"
  if (h === 12) return "12p"
  return h < 12 ? `${h}a` : `${h - 12}p`
}

const formatJobTime = (job) => {
  const d = jobStartDateTime(job)
  if (!d) return ""
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")
}

const formatRangeLabel = (view, anchor) => {
  if (view === "day") {
    return anchor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  }
  if (view === "week") {
    const start = startOfWeek(anchor)
    const end = addDays(start, 6)
    const sameMonth = start.getMonth() === end.getMonth()
    if (sameMonth) {
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`
    }
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${end.getFullYear()}`
  }
  return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

// ── Page ────────────────────────────────────────────────────

const TABS = [
  { id: "schedule",   label: "Schedule" },
  { id: "availability", label: "Availability" },
  { id: "routes",     label: "Routes" },
  { id: "unassigned", label: "Unassigned" },
]

const VIEWS = [
  { id: "day",   label: "Day" },
  { id: "week",  label: "Week" },
  { id: "month", label: "Month" },
]

const ScheduleV2 = () => {
  const { user } = useAuth()
  const { locationId } = useLocationScope()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id || "schedule"
  const initialView = VIEWS.find((v) => v.id === searchParams.get("view"))?.id || "week"

  const [tab, setTab] = useState(initialTab)
  const [view, setView] = useState(initialView)
  const [anchor, setAnchor] = useState(() => new Date())
  const [jobs, setJobs] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTeams, setSelectedTeams] = useState(null) // null = all
  // Manage-shift modal — opened from any Availability cell or daily
  // tile. Shape: { teamId, dayIdx?, jobId?, openSlot? } or null.
  const [manageShift, setManageShift] = useState(null)
  // Availability sub-tab: weekly grid vs daily windows
  const [availabilitySubTab, setAvailabilitySubTab] = useState("weekly")

  // URL sync
  useEffect(() => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set("tab", tab)
      if (tab === "schedule") next.set("view", view)
      else next.delete("view")
      return next
    }, { replace: true })
  }, [tab, view, setSearchParams])

  // Load jobs + team members
  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const PAGE = 1000
      const MAX_PAGES = 10
      let all = []
      for (let p = 1; p <= MAX_PAGES; p++) {
        let chunk = []
        try {
          const resp = await jobsAPI.getAll(user.id, "", "", p, PAGE)
          chunk = normalizeAPIResponse(resp, "jobs") || []
        } catch {
          chunk = []
        }
        if (!Array.isArray(chunk) || chunk.length === 0) break
        all = all.concat(chunk)
        if (chunk.length < PAGE) break
      }
      setJobs(all.filter((j) => !isCancelledJob(j)))

      try {
        const tmResp = await teamAPI.getAll(user.id, { page: 1, limit: 500 })
        // Backend returns { teamMembers: [...] }; match dashboard-v2's
        // shape so the lookup always finds names.
        const list = tmResp?.teamMembers || tmResp?.members || (Array.isArray(tmResp) ? tmResp : [])
        setTeamMembers(Array.isArray(list) ? list : [])
      } catch {
        setTeamMembers([])
      }
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchData() }, [fetchData])

  // Location filter
  const scopedJobs = useMemo(() => filterByLocation(jobs, locationId), [jobs, locationId])

  // Build cleaner color map from the whole job set so colors stay
  // stable across day/week/month views
  const allCleanerIds = useMemo(() => {
    const set = new Set()
    scopedJobs.forEach((j) => assigneesFor(j).forEach((a) => set.add(a.id)))
    return Array.from(set)
  }, [scopedJobs])

  const colorMap = useMemo(() => sfAssignTeamColors(allCleanerIds), [allCleanerIds])
  const cleanerColor = useCallback(
    (id) => (id == null ? "#DC2626" : (colorMap.get(String(id)) || sfTeamColor(0))),
    [colorMap]
  )

  // id → name lookup
  const cleanerNameById = useMemo(() => {
    const map = new Map()
    teamMembers.forEach((m) => {
      const id = m?.id
      if (id == null) return
      const name =
        m.name ||
        `${m.first_name || ""} ${m.last_name || ""}`.trim() ||
        m.email ||
        ""
      if (name) map.set(String(id), name)
    })
    return map
  }, [teamMembers])

  const resolveCleanerName = useCallback(
    (id, fallback) => {
      if (!id) return fallback || ""
      return cleanerNameById.get(String(id)) || fallback || ""
    },
    [cleanerNameById]
  )

  // Team-chip selection. Once teamMembers loads, default to "all
  // selected". Toggling a chip moves us out of "all" mode.
  useEffect(() => {
    if (selectedTeams === null && allCleanerIds.length > 0) {
      setSelectedTeams(new Set(allCleanerIds.map(String)))
    }
  }, [allCleanerIds, selectedTeams])

  const isCleanerSelected = useCallback(
    (id) => selectedTeams === null || selectedTeams.has(String(id)),
    [selectedTeams]
  )

  const toggleCleaner = (id) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev || allCleanerIds.map(String))
      const key = String(id)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Apply chip filter — a job survives if at least one of its
  // assignees is selected, or if it's unassigned (always shown).
  const teamFilteredJobs = useMemo(() => {
    if (selectedTeams === null) return scopedJobs
    return scopedJobs.filter((j) => {
      const assignees = assigneesFor(j)
      if (assignees.length === 0) return true
      return assignees.some((a) => selectedTeams.has(String(a.id)))
    })
  }, [scopedJobs, selectedTeams])

  // Date nav
  const nudgeAnchor = (dir) => {
    setAnchor((prev) => {
      if (view === "day") return addDays(prev, dir)
      if (view === "week") return addDays(prev, dir * 7)
      const x = new Date(prev)
      x.setMonth(x.getMonth() + dir)
      return x
    })
  }

  const unassignedCount = useMemo(
    () => scopedJobs.filter((j) => !isCancelledJob(j) && assigneesFor(j).length === 0).length,
    [scopedJobs]
  )

  const onJobClick = useCallback(
    (job) => navigate(`/job-details/${job.id}`),
    [navigate]
  )

  return (
    <div className="min-h-screen bg-[var(--sf-bg-page)] flex flex-col" style={{ fontFamily: "var(--sf-font-ui)" }}>
      <MobileHeader title="Schedule" />

      <SfPageHeader
        eyebrow="Operations"
        title="Schedule"
        subtitle={
          tab === "schedule"
            ? formatRangeLabel(view, anchor)
            : tab === "availability"
            ? "Team availability · this week"
            : tab === "routes"
            ? "Live routes (coming soon)"
            : `${unassignedCount} unassigned job${unassignedCount === 1 ? "" : "s"}`
        }
        actions={
          <>
            <SfButton variant="secondary" size="md" icon={Filter} className="hidden sm:inline-flex">
              Filters
            </SfButton>
            <SfButton variant="secondary" size="md" icon={Download} className="hidden sm:inline-flex">
              Export
            </SfButton>
            <SfButton
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => navigate("/createjob")}
            >
              New job
            </SfButton>
          </>
        }
        tabs={
          <div className="flex items-center overflow-x-auto scrollbar-hide w-full">
            {TABS.map((t) => (
              <SfTab
                key={t.id}
                active={tab === t.id}
                count={t.id === "unassigned" ? unassignedCount : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </SfTab>
            ))}
          </div>
        }
      />

      {tab === "schedule" && (
        <>
          <ScheduleToolbar
            view={view}
            setView={setView}
            anchor={anchor}
            setAnchor={setAnchor}
            nudge={nudgeAnchor}
            cleaners={allCleanerIds}
            cleanerColor={cleanerColor}
            resolveName={resolveCleanerName}
            isSelected={isCleanerSelected}
            toggleCleaner={toggleCleaner}
          />
          <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1">
            {loading ? (
              <SfCard>
                <div className="py-16 text-center text-[12.5px] text-[var(--sf-ink-3)]">
                  Loading schedule…
                </div>
              </SfCard>
            ) : view === "day" ? (
              <DayView
                anchor={anchor}
                jobs={teamFilteredJobs}
                cleaners={allCleanerIds}
                cleanerColor={cleanerColor}
                resolveName={resolveCleanerName}
                onJobClick={onJobClick}
              />
            ) : view === "week" ? (
              <WeekView
                anchor={anchor}
                jobs={teamFilteredJobs}
                cleanerColor={cleanerColor}
                onJobClick={onJobClick}
              />
            ) : (
              <MonthView
                anchor={anchor}
                jobs={teamFilteredJobs}
                cleanerColor={cleanerColor}
                onJobClick={onJobClick}
                onPickDay={(d) => { setAnchor(d); setView("day") }}
              />
            )}
          </div>
        </>
      )}

      {tab === "availability" && (
        <div className="px-4 sm:px-6 lg:px-8 pb-8 pt-3 flex-1">
          <AvailabilityView
            cleaners={teamMembers}
            jobs={teamFilteredJobs}
            cleanerColor={cleanerColor}
            resolveName={resolveCleanerName}
            anchor={anchor}
            subTab={availabilitySubTab}
            setSubTab={setAvailabilitySubTab}
            onOpenManageShift={(payload) => setManageShift(payload)}
          />
        </div>
      )}

      {tab === "routes" && (
        <div className="px-4 sm:px-6 lg:px-8 pb-8 pt-3 flex-1">
          <SfCard>
            <div className="py-12 flex flex-col items-center text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "var(--sf-blue-soft)", color: "var(--sf-blue-dark)" }}
              >
                <MapIcon size={22} />
              </div>
              <div className="text-[14px] font-semibold text-[var(--sf-ink)]">Routes view</div>
              <div className="text-[12.5px] text-[var(--sf-ink-2)] mt-1 max-w-md">
                Live route map with team locations and optimized routing — coming next slice.
              </div>
            </div>
          </SfCard>
        </div>
      )}

      {tab === "unassigned" && (
        <div className="px-4 sm:px-6 lg:px-8 pb-8 pt-3 flex-1">
          <UnassignedView
            jobs={scopedJobs}
            onJobClick={onJobClick}
            onAssign={(j) => navigate(`/job-details/${j.id}`)}
          />
        </div>
      )}

      <ManageShiftModal
        open={!!manageShift}
        payload={manageShift}
        onClose={() => setManageShift(null)}
        jobs={scopedJobs}
        cleaners={teamMembers}
        cleanerColor={cleanerColor}
        resolveName={resolveCleanerName}
        anchor={anchor}
        onMutated={fetchData}
        onOpenJob={onJobClick}
        onNewJob={(teamId) =>
          navigate(teamId ? `/createjob?teamMemberId=${teamId}` : "/createjob")
        }
      />
    </div>
  )
}

// ── Toolbar ────────────────────────────────────────────────

const ScheduleToolbar = ({
  view, setView, anchor, setAnchor, nudge,
  cleaners, cleanerColor, resolveName, isSelected, toggleCleaner,
}) => {
  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-2 flex-wrap">
      <div
        className="flex items-center bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-md"
        style={{ boxShadow: "var(--sf-shadow)" }}
      >
        <button
          onClick={() => nudge(-1)}
          aria-label="Previous"
          className="px-2 py-1.5 text-[var(--sf-ink-2)] hover:text-[var(--sf-ink)] border-r border-[var(--sf-border-soft)]"
          style={{ background: "transparent", border: "none", borderRight: "1px solid var(--sf-border-soft)", cursor: "pointer" }}
        >
          <ChevronLeft size={14} />
        </button>
        <span
          className="px-3 py-1.5 text-[12.5px] font-semibold text-[var(--sf-ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatRangeLabel(view, anchor)}
        </span>
        <button
          onClick={() => nudge(1)}
          aria-label="Next"
          className="px-2 py-1.5 text-[var(--sf-ink-2)] hover:text-[var(--sf-ink)]"
          style={{ background: "transparent", border: "none", borderLeft: "1px solid var(--sf-border-soft)", cursor: "pointer" }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <SfButton variant="secondary" size="sm" onClick={() => setAnchor(new Date())}>
        Today
      </SfButton>

      <div className="flex-1" />

      {cleaners.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11.5px] text-[var(--sf-ink-3)] font-semibold mr-1">Cleaners:</span>
          {cleaners.slice(0, 8).map((id) => {
            const active = isSelected(id)
            const color = cleanerColor(id)
            const name = resolveName(id, "")
            // Real initials when the name resolves; otherwise a single
            // dot so the avatar reads as "unnamed cleaner" instead of
            // showing the first 2 digits of the ID (which collide for
            // sequential IDs like 261/262/263).
            const initials = sfInitials(name) || "?"
            return (
              <button
                key={id}
                onClick={() => toggleCleaner(id)}
                className="inline-flex items-center gap-1.5 rounded-full"
                style={{
                  padding: "2px 8px 2px 2px",
                  background: active ? "var(--sf-panel)" : "var(--sf-panel-alt)",
                  border: `1.5px solid ${active ? color : "var(--sf-border-soft)"}`,
                  cursor: "pointer",
                  fontFamily: "var(--sf-font-ui)",
                  opacity: active ? 1 : 0.55,
                  transition: "opacity .15s, border-color .15s",
                }}
                title={name || `Cleaner ${id}`}
              >
                <SfAvatar
                  initials={initials}
                  color={color}
                  size={22}
                  style={{ fontSize: 9.5, fontWeight: 700 }}
                />
                <span
                  className="text-[11.5px] font-semibold"
                  style={{
                    color: active ? "var(--sf-ink)" : "var(--sf-ink-3)",
                    maxWidth: 88,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {name ? name.split(" ")[0] : "Cleaner"}
                </span>
              </button>
            )
          })}
          {cleaners.length > 8 && (
            <span className="text-[11px] text-[var(--sf-ink-3)] font-semibold">
              +{cleaners.length - 8}
            </span>
          )}
        </div>
      )}

      <div
        className="flex bg-[var(--sf-panel-soft)] rounded-md"
        style={{ padding: 2 }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              padding: "4px 11px",
              fontSize: 11.5,
              fontWeight: 600,
              background: view === v.id ? "var(--sf-panel)" : "transparent",
              color: view === v.id ? "var(--sf-ink)" : "var(--sf-ink-2)",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              fontFamily: "var(--sf-font-ui)",
              boxShadow: view === v.id ? "0 1px 2px rgba(15,23,42,.08)" : "none",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Week view ──────────────────────────────────────────────

const WeekView = ({ anchor, jobs, cleanerColor, onJobClick }) => {
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  // Bucket jobs per day
  const jobsByDay = useMemo(() => {
    const map = new Map()
    days.forEach((d) => map.set(d.toDateString(), []))
    jobs.forEach((j) => {
      const d = jobStartDateTime(j)
      if (!d) return
      const key = startOfDay(d).toDateString()
      if (map.has(key)) map.get(key).push(j)
    })
    return map
  }, [jobs, days])

  const startHr = 7
  const endHr = 20
  const hours = []
  for (let h = startHr; h <= endHr; h++) hours.push(h)
  const today = startOfDay(new Date())
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  return (
    <SfCard padding={0}>
      {/* Day headers */}
      <div className="flex border-b border-[var(--sf-border-soft)]">
        <div
          style={{ width: 56, padding: "10px 8px", borderRight: "1px solid var(--sf-border-soft)" }}
          className="text-[10px] text-[var(--sf-ink-3)] font-bold uppercase text-right"
        >
          {Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop()?.slice(0, 3) || "TZ"}
        </div>
        {days.map((d, i) => {
          const isToday = sameDay(d, today)
          const dayJobs = jobsByDay.get(d.toDateString()) || []
          const value = dayJobs.reduce((s, j) => s + (parseFloat(j.total || j.service_price || 0) || 0), 0)
          return (
            <div
              key={i}
              className="flex-1"
              style={{
                padding: "10px 12px",
                borderRight: i < 6 ? "1px solid var(--sf-border-soft)" : "none",
                background: isToday ? "var(--sf-blue-soft)" : "transparent",
              }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[10.5px] font-bold uppercase"
                  style={{
                    color: isToday ? "var(--sf-blue-dark)" : "var(--sf-ink-3)",
                    letterSpacing: ".06em",
                  }}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span
                  className={`text-[16px] ${isToday ? "font-bold" : "font-semibold"}`}
                  style={{
                    color: isToday ? "var(--sf-blue-dark)" : "var(--sf-ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {d.getDate()}
                </span>
                {isToday && (
                  <span
                    className="text-[9.5px] font-bold"
                    style={{ color: "var(--sf-blue-dark)", fontFamily: "var(--sf-font-mono)" }}
                  >
                    TODAY
                  </span>
                )}
              </div>
              <div
                className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
                {value > 0 && ` · $${Math.round(value).toLocaleString()}`}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex" style={{ height: 560, overflow: "hidden" }}>
        <div
          style={{ width: 56, borderRight: "1px solid var(--sf-border-soft)", position: "relative" }}
        >
          {hours.map((h, i) => (
            <div
              key={h}
              style={{
                position: "absolute",
                top: `${(i / (hours.length - 1)) * 100}%`,
                left: 0,
                right: 0,
                textAlign: "right",
                paddingRight: 8,
                fontSize: 10,
                color: "var(--sf-ink-3)",
                fontVariantNumeric: "tabular-nums",
                transform: "translateY(-50%)",
                fontWeight: 500,
              }}
            >
              {formatHourLabel(h)}
            </div>
          ))}
        </div>

        {days.map((d, dayIdx) => {
          const isToday = sameDay(d, today)
          const dayJobs = jobsByDay.get(d.toDateString()) || []
          return (
            <div
              key={dayIdx}
              style={{
                flex: 1,
                position: "relative",
                borderRight: dayIdx < 6 ? "1px solid var(--sf-border-soft)" : "none",
                background: isToday ? "#FAFCFF" : "transparent",
              }}
            >
              {hours.map((h, i) => (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: `${(i / (hours.length - 1)) * 100}%`,
                    left: 0,
                    right: 0,
                    borderBottom: `1px ${i % 2 === 0 ? "solid" : "dashed"} var(--sf-border-soft)`,
                    opacity: i % 2 === 0 ? 1 : 0.6,
                  }}
                />
              ))}
              {isToday && (
                <div
                  style={{
                    position: "absolute",
                    top: `${((nowMins / 60 - startHr) / (endHr - startHr)) * 100}%`,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "var(--sf-red)",
                    zIndex: 3,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -4,
                      top: -3,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: "var(--sf-red)",
                    }}
                  />
                </div>
              )}
              {layoutDay(dayJobs).map((cluster, ci) =>
                cluster.jobs.length === 1 ? (
                  <ScheduleBlock
                    key={cluster.jobs[0].job.id}
                    job={cluster.jobs[0].job}
                    startHr={startHr}
                    endHr={endHr}
                    cleanerColor={cleanerColor}
                    compact
                    onClick={() => onJobClick(cluster.jobs[0].job)}
                  />
                ) : (
                  <ClusterCard
                    key={`cluster-${dayIdx}-${ci}`}
                    cluster={cluster}
                    startHr={startHr}
                    endHr={endHr}
                    cleanerColor={cleanerColor}
                    onJobClick={onJobClick}
                  />
                )
              )}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Day view ───────────────────────────────────────────────

const DayView = ({ anchor, jobs, cleaners, cleanerColor, resolveName, onJobClick }) => {
  const day = useMemo(() => startOfDay(anchor), [anchor])
  const startHr = 7
  const endHr = 19
  const hours = []
  for (let h = startHr; h <= endHr; h++) hours.push(h)

  // Filter jobs to this day
  const dayJobs = useMemo(
    () => jobs.filter((j) => {
      const d = jobStartDateTime(j)
      return d && sameDay(startOfDay(d), day)
    }),
    [jobs, day]
  )

  // Group by cleaner. Each cleaner column shows their jobs. Unassigned
  // jobs land in a trailing column.
  const cleanerOrder = useMemo(() => {
    const present = new Set()
    dayJobs.forEach((j) => assigneesFor(j).forEach((a) => present.add(a.id)))
    const ordered = cleaners.filter((id) => present.has(id))
    // Append any cleaner with jobs that wasn't in the global list
    Array.from(present).forEach((id) => {
      if (!ordered.includes(id)) ordered.push(id)
    })
    return ordered
  }, [cleaners, dayJobs])

  const unassigned = useMemo(
    () => dayJobs.filter((j) => assigneesFor(j).length === 0),
    [dayJobs]
  )

  const columns = [
    ...cleanerOrder.map((id) => ({ id, type: "cleaner" })),
    ...(unassigned.length > 0 ? [{ id: "unassigned", type: "unassigned" }] : []),
  ]

  const isToday = sameDay(day, startOfDay(new Date()))
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  if (columns.length === 0) {
    return (
      <SfCard>
        <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          No jobs scheduled for {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
        </div>
      </SfCard>
    )
  }

  return (
    <SfCard padding={0}>
      {/* Headers */}
      <div className="flex border-b border-[var(--sf-border-soft)] bg-[var(--sf-panel)]">
        <div
          style={{
            width: 56,
            padding: "10px 8px",
            borderRight: "1px solid var(--sf-border-soft)",
          }}
          className="text-[10px] text-[var(--sf-ink-3)] font-bold uppercase text-right"
        >
          TIME
        </div>
        {columns.map((col, i) => {
          const isLast = i === columns.length - 1
          if (col.type === "unassigned") {
            return (
              <div
                key="unassigned"
                className="flex-1"
                style={{
                  padding: "10px 12px",
                  borderRight: isLast ? "none" : "1px solid var(--sf-border-soft)",
                  background: "var(--sf-red-soft)",
                }}
              >
                <div className="text-[12.5px] font-bold text-[var(--sf-red-dark)]">
                  Unassigned
                </div>
                <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5">
                  {unassigned.length} job{unassigned.length === 1 ? "" : "s"}
                </div>
              </div>
            )
          }
          const color = cleanerColor(col.id)
          const name = resolveName(col.id, "") || `Cleaner ${col.id}`
          const colJobs = dayJobs.filter((j) =>
            assigneesFor(j).some((a) => a.id === col.id)
          )
          const value = colJobs.reduce(
            (s, j) => s + (parseFloat(j.total || j.service_price || 0) || 0),
            0
          )
          return (
            <div
              key={col.id}
              className="flex-1"
              style={{
                padding: "10px 12px",
                borderRight: isLast ? "none" : "1px solid var(--sf-border-soft)",
              }}
            >
              <div className="flex items-center gap-2">
                <SfAvatar initials={sfInitials(name)} color={color} size={26} />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12.5px] font-semibold text-[var(--sf-ink)] truncate"
                    style={{ lineHeight: 1.2 }}
                  >
                    {name}
                  </div>
                  <div className="text-[10px] text-[var(--sf-ink-3)] mt-px">
                    {colJobs.length} job · ${Math.round(value)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex" style={{ height: 640, overflow: "hidden" }}>
        <div style={{ width: 56, borderRight: "1px solid var(--sf-border-soft)", position: "relative" }}>
          {hours.map((h, i) => (
            <div
              key={h}
              style={{
                position: "absolute",
                top: `${(i / (hours.length - 1)) * 100}%`,
                left: 0,
                right: 0,
                textAlign: "right",
                paddingRight: 8,
                fontSize: 10.5,
                color: "var(--sf-ink-3)",
                fontVariantNumeric: "tabular-nums",
                transform: "translateY(-50%)",
                fontWeight: 500,
              }}
            >
              {formatHourLabel(h)}
            </div>
          ))}
        </div>
        {columns.map((col, i) => {
          const isLast = i === columns.length - 1
          const colJobs =
            col.type === "unassigned"
              ? unassigned
              : dayJobs.filter((j) => assigneesFor(j).some((a) => a.id === col.id))
          return (
            <div
              key={col.id}
              style={{
                flex: 1,
                position: "relative",
                borderRight: isLast ? "none" : "1px solid var(--sf-border-soft)",
                background:
                  col.type === "unassigned" ? "rgba(220,38,38,.04)" : "var(--sf-panel)",
              }}
            >
              {hours.map((h, hi) => (
                <div
                  key={h}
                  style={{
                    position: "absolute",
                    top: `${(hi / (hours.length - 1)) * 100}%`,
                    left: 0,
                    right: 0,
                    borderBottom: `1px ${hi % 2 === 0 ? "solid" : "dashed"} var(--sf-border-soft)`,
                    opacity: hi % 2 === 0 ? 1 : 0.6,
                  }}
                />
              ))}
              {isToday && (
                <div
                  style={{
                    position: "absolute",
                    top: `${((nowMins / 60 - startHr) / (endHr - startHr)) * 100}%`,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "var(--sf-red)",
                    zIndex: 3,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: -4,
                      top: -3,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: "var(--sf-red)",
                    }}
                  />
                  {i === 0 && (
                    <div
                      style={{
                        position: "absolute",
                        right: "calc(100% + 6px)",
                        top: -9,
                        fontSize: 9.5,
                        color: "var(--sf-red-dark)",
                        fontFamily: "var(--sf-font-mono)",
                        fontWeight: 700,
                        background: "var(--sf-panel)",
                        padding: "1px 4px",
                        borderRadius: 3,
                        whiteSpace: "nowrap",
                      }}
                    >
                      NOW
                    </div>
                  )}
                </div>
              )}
              {colJobs.map((j) => (
                <ScheduleBlock
                  key={`${col.id}-${j.id}`}
                  job={j}
                  startHr={startHr}
                  endHr={endHr}
                  cleanerColor={cleanerColor}
                  forcedColor={col.type === "unassigned" ? "#DC2626" : undefined}
                  onClick={() => onJobClick(j)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Month view ─────────────────────────────────────────────

const MonthView = ({ anchor, jobs, cleanerColor, onJobClick, onPickDay }) => {
  const monthStart = useMemo(() => {
    const x = new Date(anchor)
    x.setDate(1)
    x.setHours(0, 0, 0, 0)
    return x
  }, [anchor])
  const gridStart = useMemo(() => startOfWeek(monthStart), [monthStart])
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart]
  )

  const jobsByDay = useMemo(() => {
    const map = new Map()
    jobs.forEach((j) => {
      const d = jobStartDateTime(j)
      if (!d) return
      const key = startOfDay(d).toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(j)
    })
    return map
  }, [jobs])

  const today = startOfDay(new Date())

  return (
    <SfCard padding={0}>
      {/* Headers */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: "1px solid var(--sf-border-soft)",
          background: "var(--sf-panel-alt)",
        }}
      >
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <div
            key={d}
            className="text-[10.5px] text-[var(--sf-ink-3)] font-bold uppercase"
            style={{
              padding: "10px 12px",
              borderRight: i < 6 ? "1px solid var(--sf-border-soft)" : "none",
              letterSpacing: ".06em",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(115px, auto)" }}
      >
        {cells.map((d, idx) => {
          const col = idx % 7
          const row = Math.floor(idx / 7)
          const isOtherMonth = d.getMonth() !== monthStart.getMonth()
          const isToday = sameDay(d, today)
          const dayJobs = jobsByDay.get(d.toDateString()) || []
          return (
            <div
              key={idx}
              onClick={() => onPickDay?.(d)}
              style={{
                padding: "7px 9px",
                borderRight: col < 6 ? "1px solid var(--sf-border-soft)" : "none",
                borderBottom: row < 5 ? "1px solid var(--sf-border-soft)" : "none",
                background: isToday
                  ? "var(--sf-blue-soft)"
                  : isOtherMonth
                  ? "var(--sf-panel-alt)"
                  : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                minHeight: 115,
                cursor: "pointer",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={isToday ? "text-[13px] font-bold" : "text-[13px] font-semibold"}
                  style={{
                    color: isOtherMonth
                      ? "var(--sf-ink-4)"
                      : isToday
                      ? "var(--sf-blue-dark)"
                      : "var(--sf-ink)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {d.getDate()}
                </span>
                {d.getDate() === 1 && (
                  <span
                    className="text-[9.5px] text-[var(--sf-ink-3)] font-semibold uppercase"
                    style={{ letterSpacing: ".04em" }}
                  >
                    {d.toLocaleDateString("en-US", { month: "short" })}
                  </span>
                )}
                {isToday && (
                  <span
                    className="text-[9px] font-bold"
                    style={{
                      color: "#fff",
                      background: "var(--sf-blue)",
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontFamily: "var(--sf-font-mono)",
                    }}
                  >
                    TODAY
                  </span>
                )}
                <div className="flex-1" />
                {dayJobs.length > 0 && (
                  <span
                    className="text-[10px] text-[var(--sf-ink-3)] font-semibold"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {dayJobs.length}
                  </span>
                )}
              </div>
              {dayJobs.slice(0, 3).map((j) => {
                const a = assigneesFor(j)
                const color = a.length > 0 ? cleanerColor(a[0].id) : "#DC2626"
                const live = isLiveJob(j)
                return (
                  <button
                    key={j.id}
                    onClick={(e) => { e.stopPropagation(); onJobClick(j) }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 5px",
                      background: live ? color : `${color}1a`,
                      color: live ? "#fff" : color,
                      borderLeft: `2px solid ${color}`,
                      border: "none",
                      borderRadius: 3,
                      fontSize: 10.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "var(--sf-font-ui)",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        opacity: 0.85,
                        fontFamily: "var(--sf-font-mono)",
                        fontSize: 9.5,
                      }}
                    >
                      {formatJobTime(j)}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {customerLabelForJob(j)}
                    </span>
                  </button>
                )
              })}
              {dayJobs.length > 3 && (
                <div
                  className="text-[10.5px] text-[var(--sf-ink-3)] font-semibold"
                  style={{ padding: "2px 5px" }}
                >
                  +{dayJobs.length - 3} more
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Schedule block (used by Day + Week views) ──────────────

const ScheduleBlock = ({ job, startHr, endHr, cleanerColor, forcedColor, compact, onClick }) => {
  const start = jobStartDateTime(job)
  if (!start) return null
  const startMins = start.getHours() * 60 + start.getMinutes()
  const dur = durationMinutes(job)
  const top = ((startMins / 60 - startHr) / (endHr - startHr)) * 100
  const height = (dur / 60 / (endHr - startHr)) * 100
  if (top < 0 || top > 100) return null
  const assignees = assigneesFor(job)
  const color = forcedColor || (assignees.length > 0 ? cleanerColor(assignees[0].id) : "#DC2626")
  const live = isLiveJob(job)
  const customer = customerLabelForJob(job)
  const service = job.service_name || job.service?.name || job.title || "Service"

  return (
    <button
      onClick={onClick}
      className="sf-timeline-block"
      style={{
        position: "absolute",
        top: `${top}%`,
        height: `${Math.max(height, 3)}%`,
        left: compact ? 4 : 6,
        right: compact ? 4 : 6,
        background: live ? color : "#fff",
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${live ? color : color + "40"}`,
        color: live ? "#fff" : "var(--sf-ink)",
        borderRadius: 6,
        padding: compact ? "4px 7px" : "7px 10px",
        fontSize: compact ? 11 : 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
        boxShadow: live ? `0 2px 6px ${color}40` : "var(--sf-shadow)",
        zIndex: 2,
      }}
    >
      <div
        style={{
          fontSize: compact ? 10 : 10.5,
          fontWeight: 600,
          color: live ? "rgba(255,255,255,.85)" : "var(--sf-ink-3)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatJobTime(job)} · {dur}m
        {assignees.length === 0 && (
          <span
            style={{
              marginLeft: 5,
              fontWeight: 700,
              color: "#fff",
              background: "var(--sf-red)",
              padding: "0 4px",
              borderRadius: 3,
            }}
          >
            UNASGN
          </span>
        )}
      </div>
      <div
        style={{
          fontWeight: 700,
          lineHeight: 1.2,
          marginTop: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {customer}
      </div>
      {!compact && (
        <div
          style={{
            fontSize: 11,
            marginTop: 2,
            opacity: live ? 0.92 : 0.75,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {service}
        </div>
      )}
    </button>
  )
}

const customerLabelForJob = (j) => {
  if (j.customer_name) return j.customer_name
  const first = j.customer_first_name || j.first_name || ""
  const last = j.customer_last_name || j.last_name || ""
  const composed = `${first} ${last}`.trim()
  return composed || j.customer?.name || j.customer_email || "Customer"
}

const minsToLabel = (m) => {
  const h = Math.floor(m / 60)
  const mm = m % 60
  const period = h >= 12 ? "p" : "a"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return mm === 0 ? `${h12}${period}` : `${h12}:${String(mm).padStart(2, "0")}${period}`
}

// Cluster card — rendered when 2+ jobs overlap in the same day column.
// Spans the union timespan at full column width and stacks each job
// as a compact mini-row. See ADDON_schedule_overlap_and_assign.md.
const ClusterCard = ({ cluster, startHr, endHr, cleanerColor, onJobClick }) => {
  const top = ((cluster.start / 60 - startHr) / (endHr - startHr)) * 100
  const height = (((cluster.end - cluster.start) / 60) / (endHr - startHr)) * 100
  if (top < 0 || top > 100) return null
  return (
    <div
      style={{
        position: "absolute",
        top: `${top}%`,
        height: `${Math.max(height, 4)}%`,
        left: 4,
        right: 4,
        background: "var(--sf-panel)",
        borderLeft: "3px solid #0F172A",
        border: "1px solid var(--sf-border-soft)",
        borderRadius: 6,
        boxShadow: "var(--sf-shadow)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: 2,
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "3px 7px",
          background: "var(--sf-panel-alt)",
          borderBottom: "1px solid var(--sf-border-soft)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 600,
            color: "var(--sf-ink-2)",
            fontFamily: "var(--sf-font-mono)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {minsToLabel(cluster.start)}–{minsToLabel(cluster.end)}
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "#fff",
            background: "#0F172A",
            padding: "1px 6px",
            borderRadius: 3,
            fontFamily: "var(--sf-font-mono)",
            letterSpacing: ".02em",
          }}
        >
          {cluster.jobs.length} jobs
        </span>
      </div>
      {/* Body */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {cluster.jobs.map(({ job, start }) => {
          const assignees = assigneesFor(job)
          const color = assignees.length > 0 ? cleanerColor(assignees[0].id) : "#DC2626"
          const live = isLiveJob(job)
          const first = (customerLabelForJob(job) || "").split(" ")[0] || "—"
          const teamLetter = assignees[0]?.name
            ? assignees[0].name.charAt(0).toUpperCase()
            : assignees.length === 0
            ? "?"
            : "·"
          return (
            <button
              key={job.id}
              onClick={(e) => { e.stopPropagation(); onJobClick(job) }}
              className="sf-timeline-block"
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 5,
                padding: "2px 6px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid var(--sf-border-soft)",
                cursor: "pointer",
                fontFamily: "var(--sf-font-ui)",
                textAlign: "left",
                minHeight: 0,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  background: color,
                  borderRadius: 1,
                  flexShrink: 0,
                }}
              />
              {live && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    background: color,
                    alignSelf: "center",
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 9.5,
                  color: "var(--sf-ink-3)",
                  fontFamily: "var(--sf-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  alignSelf: "center",
                  flexShrink: 0,
                }}
              >
                {minsToLabel(start)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--sf-ink)",
                  alignSelf: "center",
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {first}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "var(--sf-font-mono)",
                  color: "var(--sf-ink-3)",
                  alignSelf: "center",
                  flexShrink: 0,
                }}
              >
                {teamLetter}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Availability view ──────────────────────────────────────

const AvailabilityView = ({
  cleaners,
  jobs,
  cleanerColor,
  resolveName,
  anchor,
  subTab,
  setSubTab,
  onOpenManageShift,
}) => {
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  // Roll up jobs per cleaner per day. A cleaner with any job on a day
  // is considered "working" for that day.
  const status = useMemo(() => {
    const map = new Map()
    cleaners.forEach((m) => {
      map.set(String(m.id), Array.from({ length: 7 }, () => ({ minutes: 0, jobs: 0 })))
    })
    jobs.forEach((j) => {
      const d = jobStartDateTime(j)
      if (!d) return
      const dayIdx = days.findIndex((dd) => sameDay(dd, startOfDay(d)))
      if (dayIdx < 0) return
      const dur = durationMinutes(j)
      assigneesFor(j).forEach((a) => {
        const row = map.get(String(a.id))
        if (!row) return
        row[dayIdx].minutes += dur
        row[dayIdx].jobs += 1
      })
    })
    return map
  }, [cleaners, jobs, days])

  // Top KPIs
  const kpis = useMemo(() => {
    let totalMinutes = 0
    let workingTeams = 0
    cleaners.forEach((m) => {
      const row = status.get(String(m.id)) || []
      const total = row.reduce((s, c) => s + c.minutes, 0)
      if (total > 0) workingTeams += 1
      totalMinutes += total
    })
    return {
      workingTeams,
      totalCleaners: cleaners.length,
      bookedHours: Math.round(totalMinutes / 60),
      // Soft 8-hour-per-cleaner-per-day capacity baseline
      capacityHours: cleaners.length * 8 * 7,
    }
  }, [cleaners, status])
  const utilization = kpis.capacityHours
    ? Math.round((kpis.bookedHours / kpis.capacityHours) * 100)
    : 0
  const availableHours = Math.max(0, kpis.capacityHours - kpis.bookedHours)

  if (cleaners.length === 0) {
    return (
      <SfCard>
        <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          No team members loaded.
        </div>
      </SfCard>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SfKPI
          label="On shift this week"
          value={`${kpis.workingTeams} / ${kpis.totalCleaners}`}
          accent="var(--sf-green)"
          sub="cleaners with jobs"
        />
        <SfKPI
          label="Total capacity"
          value={`${kpis.capacityHours} hrs`}
          accent="var(--sf-blue)"
          sub={`${kpis.totalCleaners} cleaner${kpis.totalCleaners === 1 ? "" : "s"}`}
        />
        <SfKPI
          label="Booked"
          value={`${kpis.bookedHours} hrs`}
          accent="var(--sf-purple)"
          sub={`${utilization}% utilization`}
        />
        <SfKPI
          label="Available"
          value={`${availableHours} hrs`}
          accent="var(--sf-amber)"
          sub="open for booking"
        />
      </div>

      {/* Sub-tab toggle: Weekly shifts vs Daily windows */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex bg-[var(--sf-panel-soft)] rounded-md"
          style={{ padding: 2 }}
        >
          {[
            { id: "weekly", label: "Weekly shifts" },
            { id: "daily",  label: "Daily windows" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSubTab?.(opt.id)}
              style={{
                padding: "4px 11px",
                fontSize: 11.5,
                fontWeight: 600,
                background: subTab === opt.id ? "var(--sf-panel)" : "transparent",
                color: subTab === opt.id ? "var(--sf-ink)" : "var(--sf-ink-2)",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                fontFamily: "var(--sf-font-ui)",
                boxShadow: subTab === opt.id ? "0 1px 2px rgba(15,23,42,.08)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--sf-ink-3)] italic">
          Click any cell or tile to assign / reassign jobs
        </span>
      </div>

      {subTab === "daily" ? (
        <DailyWindowsView
          cleaners={cleaners}
          jobs={jobs}
          cleanerColor={cleanerColor}
          resolveName={resolveName}
          anchor={anchor}
          onOpenManageShift={onOpenManageShift}
        />
      ) : (
      <>
      {/* Grid */}
      <SfCard padding={0}>
        <div
          className="flex items-center"
          style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
        >
          <div>
            <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
              Team availability
            </div>
            <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-px">
              {formatRangeLabel("week", anchor)} · derived from scheduled jobs
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div className="flex border-b border-[var(--sf-border-soft)] bg-[var(--sf-panel-alt)]">
          <div
            style={{ width: 180, padding: "10px 14px", borderRight: "1px solid var(--sf-border-soft)" }}
            className="text-[10.5px] text-[var(--sf-ink-3)] font-bold uppercase"
          >
            Team / Cleaner
          </div>
          {days.map((d, i) => {
            const isToday = sameDay(d, startOfDay(new Date()))
            return (
              <div
                key={i}
                className="flex-1 text-center"
                style={{
                  padding: "10px 12px",
                  borderRight: i < 6 ? "1px solid var(--sf-border-soft)" : "none",
                  background: isToday ? "var(--sf-blue-soft)" : "transparent",
                }}
              >
                <div
                  className="text-[10.5px] font-bold uppercase"
                  style={{
                    color: isToday ? "var(--sf-blue-dark)" : "var(--sf-ink-3)",
                    letterSpacing: ".06em",
                  }}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={isToday ? "text-[13px] font-bold" : "text-[13px] font-semibold"}
                  style={{ color: isToday ? "var(--sf-blue-dark)" : "var(--sf-ink)" }}
                >
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rows */}
        {cleaners.map((m, ti) => {
          const id = m.id
          const row = status.get(String(id)) || []
          const name =
            m.name ||
            `${m.first_name || ""} ${m.last_name || ""}`.trim() ||
            m.email ||
            "Cleaner"
          const color = cleanerColor(id)
          return (
            <div
              key={id}
              className="flex"
              style={{
                borderBottom:
                  ti < cleaners.length - 1 ? "1px solid var(--sf-border-soft)" : "none",
              }}
            >
              <div
                style={{
                  width: 180,
                  padding: "12px 14px",
                  borderRight: "1px solid var(--sf-border-soft)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{ width: 5, height: 32, background: color, borderRadius: 1.5, flexShrink: 0 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-bold text-[var(--sf-ink)] truncate">
                    {name}
                  </div>
                  <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-px">
                    {(m.role || "Cleaner")}
                  </div>
                </div>
              </div>
              {row.map((cell, di) => {
                const isToday = sameDay(days[di], startOfDay(new Date()))
                const working = cell.minutes > 0
                const meta = working
                  ? { c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)", icon: Check, label: `${Math.round(cell.minutes / 60 * 10) / 10}h` }
                  : { c: "var(--sf-ink-3)", bg: "var(--sf-panel-soft)", icon: Minus, label: "Off" }
                const Icon = meta.icon
                return (
                  <div
                    key={di}
                    className="flex-1 flex items-center justify-center"
                    style={{
                      padding: "8px",
                      borderRight: di < 6 ? "1px solid var(--sf-border-soft)" : "none",
                      background: isToday ? "#FAFCFF" : "transparent",
                    }}
                  >
                    <button
                      onClick={() =>
                        onOpenManageShift?.({ teamId: id, dayIdx: di, day: days[di] })
                      }
                      style={{
                        width: "100%",
                        padding: "9px 8px",
                        background: meta.bg,
                        color: meta.c,
                        border: `1px solid ${meta.c}33`,
                        borderRadius: 7,
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                        cursor: "pointer",
                        fontFamily: "var(--sf-font-ui)",
                        transition: "transform .1s, box-shadow .1s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = "var(--sf-shadow)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "none"
                      }}
                    >
                      <Icon size={12} />
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{meta.label}</span>
                      {working && cell.jobs > 0 && (
                        <span className="text-[10px] opacity-80">
                          {cell.jobs} job{cell.jobs === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </SfCard>
      </>
      )}
    </div>
  )
}

// ── Daily windows view ─────────────────────────────────────

// Per-cleaner horizontal time strip for a single day. Job tiles
// surface real bookings; amber gaps surface open windows where a
// new job could be assigned. Both kinds of tile open the manage-
// shift modal pre-focused on what was clicked.
const DailyWindowsView = ({
  cleaners,
  jobs,
  cleanerColor,
  resolveName,
  anchor,
  onOpenManageShift,
}) => {
  const day = useMemo(() => startOfDay(anchor), [anchor])
  const dayJobs = useMemo(
    () => jobs.filter((j) => {
      const d = jobStartDateTime(j)
      return d && sameDay(startOfDay(d), day)
    }),
    [jobs, day]
  )
  const startHr = 7
  const endHr = 20
  const totalMins = (endHr - startHr) * 60

  // Build per-cleaner job spans + gaps (8a–8p window)
  const rows = useMemo(() => {
    return cleaners.map((m) => {
      const id = String(m.id)
      const myJobs = dayJobs
        .filter((j) => assigneesFor(j).some((a) => a.id === id))
        .map((j) => {
          const d = jobStartDateTime(j)
          const start = d.getHours() * 60 + d.getMinutes()
          return { job: j, start, end: start + durationMinutes(j) }
        })
        .sort((a, b) => a.start - b.start)
      const blocks = []
      const winStart = startHr * 60
      const winEnd = endHr * 60
      let cursor = winStart
      myJobs.forEach((entry) => {
        const s = Math.max(entry.start, winStart)
        const e = Math.min(entry.end, winEnd)
        if (s > cursor) {
          blocks.push({ kind: "gap", start: cursor, end: s })
        }
        if (e > s) {
          blocks.push({ kind: "job", start: s, end: e, job: entry.job })
        }
        cursor = Math.max(cursor, e)
      })
      if (cursor < winEnd) blocks.push({ kind: "gap", start: cursor, end: winEnd })
      return { id, member: m, blocks }
    })
  }, [cleaners, dayJobs])

  if (cleaners.length === 0) return null

  return (
    <SfCard padding={0}>
      <div
        className="flex items-center"
        style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
      >
        <div>
          <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
            Daily windows
          </div>
          <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-px">
            {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · click any tile to manage
          </div>
        </div>
      </div>

      {/* Hour ruler */}
      <div className="flex border-b border-[var(--sf-border-soft)] bg-[var(--sf-panel-alt)]">
        <div
          style={{
            width: 180,
            padding: "8px 14px",
            borderRight: "1px solid var(--sf-border-soft)",
          }}
          className="text-[10.5px] text-[var(--sf-ink-3)] font-bold uppercase"
        >
          Cleaner
        </div>
        <div className="relative flex-1" style={{ minHeight: 26 }}>
          {Array.from({ length: endHr - startHr + 1 }, (_, i) => {
            const h = startHr + i
            return (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(i / (endHr - startHr)) * 100}%`,
                  paddingLeft: 4,
                  fontSize: 9.5,
                  color: "var(--sf-ink-3)",
                  fontWeight: 600,
                  fontFamily: "var(--sf-font-mono)",
                  display: "flex",
                  alignItems: "center",
                  borderLeft: i === 0 ? "none" : "1px solid var(--sf-border-soft)",
                }}
              >
                {formatHourLabel(h)}
              </div>
            )
          })}
        </div>
      </div>

      {/* Rows */}
      {rows.map(({ id, member, blocks }, ri) => {
        const color = cleanerColor(id)
        const name =
          member.name ||
          `${member.first_name || ""} ${member.last_name || ""}`.trim() ||
          resolveName?.(id, "") ||
          "Cleaner"
        return (
          <div
            key={id}
            className="flex"
            style={{
              borderBottom: ri < rows.length - 1 ? "1px solid var(--sf-border-soft)" : "none",
              minHeight: 56,
            }}
          >
            <div
              style={{
                width: 180,
                padding: "10px 14px",
                borderRight: "1px solid var(--sf-border-soft)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <SfAvatar initials={sfInitials(name)} color={color} size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-[var(--sf-ink)] truncate">
                  {name}
                </div>
                <div className="text-[10px] text-[var(--sf-ink-3)] truncate">
                  {blocks.filter((b) => b.kind === "job").length} job
                  {blocks.filter((b) => b.kind === "job").length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="relative flex-1" style={{ padding: 6 }}>
              {blocks.map((b, bi) => {
                const left = ((b.start - startHr * 60) / totalMins) * 100
                const width = ((b.end - b.start) / totalMins) * 100
                if (b.kind === "gap") {
                  return (
                    <button
                      key={bi}
                      onClick={() =>
                        onOpenManageShift?.({
                          teamId: id,
                          dayIdx: 0,
                          day,
                          openSlot: { start: b.start, end: b.end },
                        })
                      }
                      style={{
                        position: "absolute",
                        top: 6,
                        bottom: 6,
                        left: `calc(${left}% + 1px)`,
                        width: `calc(${width}% - 2px)`,
                        background: "var(--sf-amber-soft)",
                        border: "1px dashed rgba(217,119,6,.45)",
                        borderRadius: 6,
                        cursor: "pointer",
                        color: "var(--sf-amber-dark)",
                        fontSize: 10,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--sf-font-ui)",
                      }}
                      title={`Open ${minsToLabel(b.start)}–${minsToLabel(b.end)}`}
                    >
                      {width > 8 && (
                        <span style={{ fontFamily: "var(--sf-font-mono)", fontVariantNumeric: "tabular-nums" }}>
                          {minsToLabel(b.start)}–{minsToLabel(b.end)}
                        </span>
                      )}
                    </button>
                  )
                }
                const customer = customerLabelForJob(b.job).split(" ")[0]
                return (
                  <button
                    key={bi}
                    onClick={() =>
                      onOpenManageShift?.({ teamId: id, dayIdx: 0, day, jobId: b.job.id })
                    }
                    style={{
                      position: "absolute",
                      top: 6,
                      bottom: 6,
                      left: `calc(${left}% + 1px)`,
                      width: `calc(${width}% - 2px)`,
                      background: "#fff",
                      borderLeft: `3px solid ${color}`,
                      border: `1px solid ${color}40`,
                      borderRadius: 6,
                      padding: "3px 6px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      textAlign: "left",
                      overflow: "hidden",
                      fontFamily: "var(--sf-font-ui)",
                      boxShadow: "var(--sf-shadow)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9.5,
                        fontFamily: "var(--sf-font-mono)",
                        color: "var(--sf-ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {minsToLabel(b.start)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--sf-ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {customer}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </SfCard>
  )
}

// ── Manage shift modal ─────────────────────────────────────

// New modal kind per ADDON_schedule_overlap_and_assign.md Part 2.
// Opened from any Availability cell or daily tile; shows 3 tabs of
// jobs for the selected team+day and surfaces the Assign / Reassign
// / Pull / Unassign actions.
const ManageShiftModal = ({
  open, payload, onClose, jobs, cleaners, cleanerColor,
  resolveName, anchor, onMutated, onOpenJob, onNewJob,
}) => {
  const [subTab, setSubTab] = useState("assigned")
  const [busy, setBusy] = useState(false)

  // Reset tab whenever payload changes — if launched from an open
  // slot we default to "unassigned"; if from a job we land on the
  // tab matching that job's current assignment.
  useEffect(() => {
    if (!payload) return
    if (payload.openSlot) setSubTab("unassigned")
    else if (payload.jobId) {
      const j = jobs.find((x) => String(x.id) === String(payload.jobId))
      const ids = j ? assigneesFor(j).map((a) => a.id) : []
      if (ids.length === 0) setSubTab("unassigned")
      else if (ids.includes(String(payload.teamId))) setSubTab("assigned")
      else setSubTab("other")
    } else {
      setSubTab("assigned")
    }
  }, [payload, jobs])

  if (!open || !payload) return null
  const teamId = String(payload.teamId)
  const day = payload.day || startOfDay(anchor)
  const team = cleaners.find((m) => String(m.id) === teamId)
  const teamName =
    team?.name ||
    `${team?.first_name || ""} ${team?.last_name || ""}`.trim() ||
    resolveName?.(teamId, "") ||
    `Cleaner ${teamId}`
  const teamColor = cleanerColor(teamId)

  // Day-filtered job buckets
  const dayJobs = jobs.filter((j) => {
    const d = jobStartDateTime(j)
    return d && sameDay(startOfDay(d), day)
  })
  const assigned = dayJobs.filter((j) =>
    assigneesFor(j).some((a) => a.id === teamId)
  )
  const unassigned = dayJobs.filter((j) => assigneesFor(j).length === 0)
  const others = dayJobs.filter(
    (j) => assigneesFor(j).length > 0 && !assigneesFor(j).some((a) => a.id === teamId)
  )

  // If launched from an open slot, narrow Unassigned to jobs whose
  // duration fits the window.
  const slotFiltered = payload.openSlot
    ? unassigned.filter(
        (j) => durationMinutes(j) <= payload.openSlot.end - payload.openSlot.start
      )
    : unassigned

  const counts = { assigned: assigned.length, unassigned: slotFiltered.length, other: others.length }
  const list = subTab === "assigned" ? assigned : subTab === "unassigned" ? slotFiltered : others

  const updateAssignment = async (job, nextPrimaryId) => {
    setBusy(true)
    try {
      // Single-cleaner reassign: PUT /jobs/:id with team_member_id.
      // Multi-cleaner jobs would need /assign-multiple; that path is
      // covered by the dedicated job-detail page.
      await jobsAPI.update(job.id, { team_member_id: nextPrimaryId })
      onMutated?.()
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Couldn't update the assignment.")
    } finally {
      setBusy(false)
    }
  }

  const onAssignToTeam = (job) => updateAssignment(job, parseInt(teamId, 10) || teamId)
  const onPullToTeam = (job) => updateAssignment(job, parseInt(teamId, 10) || teamId)
  const onUnassign = (job) => updateAssignment(job, null)

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(15,23,42,.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          background: "var(--sf-panel)",
          borderRadius: 14,
          border: "1px solid var(--sf-border-soft)",
          boxShadow: "var(--sf-shadow-l)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3"
          style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
        >
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: `${teamColor}1a`, color: teamColor }}
          >
            <CalendarIcon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-[var(--sf-ink)]">
              Manage shift · {teamName}
            </div>
            <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-px">
              {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              {payload.openSlot && (
                <> · open slot {minsToLabel(payload.openSlot.start)}–{minsToLabel(payload.openSlot.end)}</>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--sf-ink-3)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--sf-border-soft)] px-2" style={{ background: "var(--sf-panel-alt)" }}>
          {[
            { id: "assigned",   label: `Assigned to ${teamName.split(" ")[0]}`, count: counts.assigned },
            { id: "unassigned", label: "Unassigned",  count: counts.unassigned },
            { id: "other",      label: "Other teams", count: counts.other },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                borderBottom: subTab === t.id ? "2px solid var(--sf-blue)" : "2px solid transparent",
                fontSize: 12.5,
                fontWeight: subTab === t.id ? 700 : 500,
                color: subTab === t.id ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
                cursor: "pointer",
                fontFamily: "var(--sf-font-ui)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: subTab === t.id ? "var(--sf-blue-soft)" : "var(--sf-panel-soft)",
                  color: subTab === t.id ? "var(--sf-blue-dark)" : "var(--sf-ink-3)",
                  padding: "1px 6px",
                  borderRadius: 99,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {list.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              {subTab === "assigned"
                ? `No jobs currently assigned to ${teamName.split(" ")[0]} on this day.`
                : subTab === "unassigned"
                ? payload.openSlot
                  ? "No unassigned jobs fit this open slot."
                  : "Every job today already has a cleaner."
                : "No jobs assigned to other teams on this day."}
            </div>
          ) : (
            list.map((j, i) => (
              <ShiftJobRow
                key={j.id}
                job={j}
                isLast={i === list.length - 1}
                teamColor={teamColor}
                cleanerColor={cleanerColor}
                resolveName={resolveName}
                subTab={subTab}
                teamName={teamName}
                busy={busy}
                highlight={String(j.id) === String(payload.jobId)}
                onOpen={() => onOpenJob?.(j)}
                onAssign={() => onAssignToTeam(j)}
                onPull={() => onPullToTeam(j)}
                onUnassign={() => onUnassign(j)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center"
          style={{
            padding: "10px 14px",
            background: "var(--sf-panel-alt)",
            borderTop: "1px solid var(--sf-border-soft)",
          }}
        >
          <span className="text-[11px] text-[var(--sf-ink-3)] italic">
            Tap a job to manage · drag to move time (coming soon)
          </span>
          <div className="flex-1" />
          <SfButton variant="ghost" size="sm" onClick={onClose}>Close</SfButton>
          <SfButton
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onNewJob?.(teamId)}
          >
            New job for {teamName.split(" ")[0]}
          </SfButton>
        </div>
      </div>
    </div>
  )
}

const ShiftJobRow = ({
  job, isLast, teamColor, cleanerColor, resolveName, subTab, teamName,
  busy, highlight, onOpen, onAssign, onPull, onUnassign,
}) => {
  const d = jobStartDateTime(job)
  const timeLabel = d ? formatJobTime(job) : "—"
  const dur = durationMinutes(job)
  const customer = customerLabelForJob(job)
  const service = job.service_name || job.service?.name || job.title || "Service"
  const addr = job.service_address || job.customer_address || ""
  const value = parseFloat(job.total || job.service_price || 0) || 0
  const live = isLiveJob(job)
  const assignees = assigneesFor(job)
  const currentTeamId = assignees[0]?.id
  const currentTeamColor = currentTeamId ? cleanerColor(currentTeamId) : "#DC2626"
  const currentTeamName =
    currentTeamId ? resolveName?.(currentTeamId, "") || `Cleaner ${currentTeamId}` : null

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 12,
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: highlight ? "var(--sf-blue-soft)" : "transparent",
        borderLeft: `3px solid ${subTab === "assigned" ? teamColor : currentTeamColor}`,
      }}
    >
      <div style={{ width: 56, textAlign: "center", flexShrink: 0 }}>
        <div
          className="text-[13px] font-bold text-[var(--sf-ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {timeLabel}
        </div>
        <div className="text-[10px] text-[var(--sf-ink-3)] mt-px">{dur}m</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold text-[var(--sf-ink)]">{customer}</span>
          <span
            className="text-[10.5px] text-[var(--sf-ink-3)]"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            #{job.id}
          </span>
          {job.is_recurring && (
            <SfTag color="var(--sf-purple)" bg="var(--sf-purple-soft)">↻ Recurring</SfTag>
          )}
          {live && (
            <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">Live</SfTag>
          )}
        </div>
        <div className="text-[11.5px] text-[var(--sf-ink-2)] mt-0.5 truncate">
          {service}
        </div>
        {addr && (
          <div className="text-[11px] text-[var(--sf-ink-3)] mt-px inline-flex items-center gap-1 max-w-full">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{addr}</span>
          </div>
        )}
        {currentTeamId && subTab !== "assigned" && (
          <div className="text-[11px] text-[var(--sf-ink-3)] mt-1 inline-flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: currentTeamColor }}
            />
            Currently: {currentTeamName}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div
          className="text-[13px] font-semibold text-[var(--sf-ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          ${Math.round(value).toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5">
          <SfButton variant="ghost" size="sm" onClick={onOpen}>
            View
          </SfButton>
          {subTab === "assigned" && (
            <>
              <SfButton
                variant="ghost"
                size="sm"
                onClick={onUnassign}
                disabled={busy}
                style={{ color: "var(--sf-red-dark)" }}
              >
                Unassign
              </SfButton>
            </>
          )}
          {subTab === "unassigned" && (
            <SfButton variant="primary" size="sm" onClick={onAssign} disabled={busy}>
              Assign
            </SfButton>
          )}
          {subTab === "other" && (
            <SfButton variant="secondary" size="sm" onClick={onPull} disabled={busy}>
              Pull to {teamName.split(" ")[0]}
            </SfButton>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Unassigned view ────────────────────────────────────────

const UnassignedView = ({ jobs, onJobClick, onAssign }) => {
  const list = useMemo(
    () =>
      jobs
        .filter((j) => !isCancelledJob(j) && assigneesFor(j).length === 0)
        .sort((a, b) => {
          const ad = jobStartDateTime(a)?.getTime() || 0
          const bd = jobStartDateTime(b)?.getTime() || 0
          return ad - bd
        }),
    [jobs]
  )

  if (list.length === 0) {
    return (
      <SfCard>
        <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">
          Every scheduled job has a cleaner assigned.
        </div>
      </SfCard>
    )
  }

  return (
    <SfCard padding={0}>
      <div className="px-4 py-3 border-b border-[var(--sf-border-soft)]">
        <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">Unassigned jobs</div>
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-px">
          {list.length} job{list.length === 1 ? "" : "s"} need a cleaner
        </div>
      </div>
      {list.map((j, i) => {
        const d = jobStartDateTime(j)
        const dayLabel = d
          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "—"
        const timeLabel = d ? formatJobTime(j) : "—"
        const value = parseFloat(j.total || j.service_price || 0) || 0
        const customer = customerLabelForJob(j)
        const service = j.service_name || j.service?.name || j.title || "Service"
        const addr = j.service_address || j.customer_address || ""
        return (
          <div
            key={j.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
            style={{
              borderBottom: i < list.length - 1 ? "1px solid var(--sf-border-soft)" : "none",
              cursor: "pointer",
            }}
            onClick={() => onJobClick?.(j)}
          >
            <div style={{ width: 56, textAlign: "center" }} className="flex-shrink-0">
              <div
                className="text-[13px] font-bold text-[var(--sf-ink)]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {timeLabel}
              </div>
              <div className="text-[10.5px] text-[var(--sf-ink-3)]">{dayLabel}</div>
            </div>
            <SfAvatar initials={sfInitials(customer)} color="var(--sf-ink)" size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">
                {customer} <span className="text-[var(--sf-ink-3)] font-medium">· {service}</span>
              </div>
              {addr && (
                <div
                  className="text-[11.5px] text-[var(--sf-ink-3)] mt-px inline-flex items-center gap-1"
                  style={{ maxWidth: "100%" }}
                >
                  <MapPin size={11} className="flex-shrink-0" />
                  <span className="truncate">{addr}</span>
                </div>
              )}
            </div>
            <SfTag color="var(--sf-red-dark)" bg="var(--sf-red-soft)">
              Unassigned
            </SfTag>
            <div
              className="text-[13px] font-semibold text-[var(--sf-ink)]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              ${Math.round(value).toLocaleString()}
            </div>
            <SfButton
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={(e) => { e.stopPropagation(); onAssign?.(j) }}
            >
              Assign
            </SfButton>
          </div>
        )
      })}
    </SfCard>
  )
}

export default ScheduleV2
