"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
  RefreshCw,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope, filterByLocation } from "../context/LocationContext"
import { jobsAPI, teamAPI, territoriesAPI } from "../services/api"
import {
  getWorkingIntervals,
  subtractIntervals,
  sumIntervalMinutes,
  jobIntervalOnDate,
  formatDateKey,
} from "../utils/availabilityMath"
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

// Merge date + time parts across candidates in LOCAL time. See dashboard-v2.jsx
// for the full rationale — keep the two copies in sync.
const jobStartDateTime = (job) => {
  const candidates = [job.scheduled_date, job.start_time, job.service_time]
  let y = null, mo = null, d = null, h = null, mi = null, s = null
  let fallback = null

  for (const c of candidates) {
    if (!c) continue
    const raw = String(c).trim()

    const dt = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/)
    if (dt) {
      if (dt[7]) {
        const parsed = new Date(raw.replace(" ", "T"))
        if (!isNaN(parsed)) return parsed
      }
      if (y === null) { y = +dt[1]; mo = +dt[2] - 1; d = +dt[3] }
      if (h === null) { h = +dt[4]; mi = +dt[5]; s = +(dt[6] || 0) }
      continue
    }

    const dOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dOnly) {
      if (y === null) { y = +dOnly[1]; mo = +dOnly[2] - 1; d = +dOnly[3] }
      continue
    }

    const tOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/)
    if (tOnly) {
      let hh = parseInt(tOnly[1], 10)
      const mer = tOnly[4]?.toUpperCase()
      if (mer === "PM" && hh < 12) hh += 12
      if (mer === "AM" && hh === 12) hh = 0
      if (h === null) { h = hh; mi = +tOnly[2]; s = +(tOnly[3] || 0) }
      continue
    }

    if (!fallback) {
      const parsed = new Date(raw)
      if (!isNaN(parsed)) fallback = parsed
    }
  }

  if (y !== null || h !== null) {
    const now = new Date()
    return new Date(
      y ?? now.getFullYear(),
      mo ?? now.getMonth(),
      d ?? now.getDate(),
      h ?? 0,
      mi ?? 0,
      s ?? 0,
    )
  }
  return fallback
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

// Each job is a card anchored to its start time on the vertical grid, with
// height = duration (so a 2p-7p job visibly spans 2p-7p). If a card's top
// would collide with the prior card's header strip, the later card cascades
// down by the header height so its time/name stays readable — "one over
// another, leaving place for the info". Returns top/height in px.
const HEADER_HEIGHT_PX = 22
const HEADER_GAP_PX = 1

const layoutDay = (dayJobs, startHr, endHr, colHeightPx) => {
  const totalMins = (endHr - startHr) * 60
  const sorted = [...dayJobs]
    .map((j) => {
      const d = jobStartDateTime(j)
      if (!d) return null
      const start = d.getHours() * 60 + d.getMinutes()
      const dur = Math.max(durationMinutes(j), 15)
      return { job: j, start, dur }
    })
    .filter(Boolean)
    .filter((x) => x.start >= startHr * 60 && x.start <= endHr * 60)
    .sort((a, b) => a.start - b.start)

  let lastHeaderBottom = -Infinity
  return sorted.map((x) => {
    const basePos = ((x.start - startHr * 60) / totalMins) * colHeightPx
    const baseHeight = Math.max((x.dur / totalMins) * colHeightPx, HEADER_HEIGHT_PX)
    const top = Math.max(basePos, lastHeaderBottom + HEADER_GAP_PX)
    lastHeaderBottom = top + HEADER_HEIGHT_PX
    return { job: x.job, start: x.start, top, height: baseHeight }
  })
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

// "10a–2:30p" — start + start+duration end. Compact so it fits inside the
// narrow time column of ShiftJobRow / modal listings. minsToLabel is
// hoisted so it's safe to call at render time.
const formatJobRange = (job) => {
  const d = jobStartDateTime(job)
  if (!d) return ""
  const startMin = d.getHours() * 60 + d.getMinutes()
  const endMin = startMin + durationMinutes(job)
  return `${minsToLabel(startMin)}–${minsToLabel(endMin % (24 * 60))}`
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
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id || "schedule"
  const initialView = VIEWS.find((v) => v.id === searchParams.get("view"))?.id || "week"

  const [tab, setTab] = useState(initialTab)
  const [view, setView] = useState(initialView)
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedTeams, setSelectedTeams] = useState(null) // null = all
  // Availability tab: territory scope (null = all territories)
  const [availabilityTerritoryId, setAvailabilityTerritoryId] = useState(null)
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

  // Constrain job fetch to a ~5-month window centered on the visible
  // anchor, quantized to month boundaries so nudging within the window
  // hits the cache instead of refetching. Old behavior pulled every job
  // ever created (up to 10k rows sequentially) on every mount.
  const fetchWindow = useMemo(() => {
    const a = anchor || new Date()
    const start = new Date(a.getFullYear(), a.getMonth() - 2, 1)
    const end = new Date(a.getFullYear(), a.getMonth() + 3, 0)
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return { start: fmt(start), end: fmt(end) }
  }, [anchor])

  const jobsQuery = useQuery({
    queryKey: ["schedule-jobs", user?.id, fetchWindow.start, fetchWindow.end],
    enabled: !!user?.id,
    queryFn: async () => {
      const range = `${fetchWindow.start} to ${fetchWindow.end}`
      const resp = await jobsAPI.getAll(
        user.id, "", "", 1, 1000, null, range, "scheduled_date", "ASC",
        null, null, null, null, null, null, { noCount: true }
      )
      const list = normalizeAPIResponse(resp, "jobs") || []
      return list.filter((j) => !isCancelledJob(j))
    },
  })

  const teamQuery = useQuery({
    queryKey: ["schedule-team", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const tmResp = await teamAPI.getAll(user.id, { page: 1, limit: 500 })
      const list = tmResp?.teamMembers || tmResp?.members || (Array.isArray(tmResp) ? tmResp : [])
      return Array.isArray(list) ? list : []
    },
  })

  const territoriesQuery = useQuery({
    queryKey: ["schedule-territories", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const tResp = await territoriesAPI.getAll(user.id, { limit: 200 })
      const list = tResp?.territories || (Array.isArray(tResp) ? tResp : [])
      return Array.isArray(list) ? list : []
    },
  })

  const jobs = jobsQuery.data || []
  const teamMembers = teamQuery.data || []
  const territories = territoriesQuery.data || []
  const loading = jobsQuery.isLoading || teamQuery.isLoading || territoriesQuery.isLoading

  // Callback for child modals that mutate jobs. Invalidates every window
  // of the schedule-jobs cache so the next render pulls fresh rows.
  const fetchData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["schedule-jobs", user?.id] })
    queryClient.invalidateQueries({ queryKey: ["schedule-team", user?.id] })
  }, [queryClient, user?.id])

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

  // Team-chip selection. `null` = all cleaners shown. Clicking a chip
  // solos that cleaner; clicking the same chip again clears back to all.
  const isCleanerSelected = useCallback(
    (id) => selectedTeams === null || selectedTeams.has(String(id)),
    [selectedTeams]
  )

  const toggleCleaner = (id) => {
    setSelectedTeams((prev) => {
      const key = String(id)
      if (prev && prev.size === 1 && prev.has(key)) return null
      return new Set([key])
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

  // Availability tab shows only active cleaners — inactive / on_leave /
  // soft-deleted members shouldn't appear on the capacity grid. Same
  // predicate the Create Job team picker uses. Also filters by the
  // Availability-tab territory dropdown when one is picked.
  const activeCleaners = useMemo(() => {
    return (teamMembers || []).filter((m) => {
      const status = String(m?.status || '').toLowerCase()
      if (status === 'inactive' || status === 'on_leave') return false
      if (m?.is_active === false) return false
      if (m?.active === false) return false
      if (m?.deleted_at) return false
      if (availabilityTerritoryId != null) {
        let terrs = m?.territories
        if (typeof terrs === 'string') {
          try { terrs = JSON.parse(terrs) } catch { terrs = [] }
        }
        if (!Array.isArray(terrs)) return false
        const idNum = Number(availabilityTerritoryId)
        if (!terrs.map(Number).filter(Number.isFinite).includes(idNum)) return false
      }
      return true
    })
  }, [teamMembers, availabilityTerritoryId])

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

  // Cleaners with a job in the currently-visible range (day/week/month).
  // Drives the toolbar chip row so only actually-scheduled cleaners
  // appear — the full-team roster stays in `allCleanerIds` so the
  // color map remains stable across views.
  const visibleRange = useMemo(() => {
    if (view === "day") {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, 1) }
    }
    if (view === "week") {
      const start = startOfWeek(anchor)
      return { start, end: addDays(start, 7) }
    }
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    return { start, end }
  }, [view, anchor])

  const rangeCleanerIds = useMemo(() => {
    const set = new Set()
    scopedJobs.forEach((j) => {
      const d = jobStartDateTime(j)
      if (!d || d < visibleRange.start || d >= visibleRange.end) return
      assigneesFor(j).forEach((a) => set.add(a.id))
    })
    return Array.from(set)
  }, [scopedJobs, visibleRange])

  const onJobClick = useCallback(
    (job) => navigate(`/job/${job.id}`),
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
            cleaners={rangeCleanerIds}
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
                resolveName={resolveCleanerName}
                onJobClick={onJobClick}
                onPickDay={(d) => { setAnchor(d); setView("day") }}
              />
            )}
          </div>
        </>
      )}

      {tab === "availability" && (
        <>
          {(() => {
            // Availability uses the same DateNavigator as Schedule. View
            // is derived from the sub-tab: weekly shows a 7-day pill and
            // nudges by 7 days; daily windows show a single-day pill and
            // nudges by 1 day.
            const availabilityView = availabilitySubTab === "daily" ? "day" : "week"
            const availabilityNudge = (dir) =>
              setAnchor((prev) => addDays(prev, availabilityView === "day" ? dir : dir * 7))
            return (
              <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                <DateNavigator
                  view={availabilityView}
                  anchor={anchor}
                  setAnchor={setAnchor}
                  nudge={availabilityNudge}
                />
              </div>
            )
          })()}
          <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1">
            <AvailabilityView
              cleaners={activeCleaners}
              jobs={teamFilteredJobs}
              cleanerColor={cleanerColor}
              resolveName={resolveCleanerName}
              anchor={anchor}
              subTab={availabilitySubTab}
              setSubTab={setAvailabilitySubTab}
              onOpenManageShift={(payload) => setManageShift(payload)}
              territories={territories}
              selectedTerritoryId={availabilityTerritoryId}
              onSelectTerritory={setAvailabilityTerritoryId}
              onSyncFromZB={fetchData}
            />
          </div>
        </>
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
            onAssign={(j) => navigate(`/job/${j.id}`)}
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
        onNewJob={(teamId, slot) => {
          const params = new URLSearchParams()
          if (teamId) params.set("teamMemberId", String(teamId))
          if (slot?.day instanceof Date) params.set("scheduledDate", formatDateKey(slot.day))
          if (slot?.start != null) {
            const hh = String(Math.floor(slot.start / 60)).padStart(2, "0")
            const mm = String(slot.start % 60).padStart(2, "0")
            params.set("scheduledTime", `${hh}:${mm}`)
          }
          const qs = params.toString()
          navigate(qs ? `/createjob?${qs}` : "/createjob")
        }}
      />
    </div>
  )
}

// ── Toolbar ────────────────────────────────────────────────

// Date range pill + Today button. Shared between the Schedule and
// Availability toolbars so the calendar-switcher UX stays identical
// across tabs. `view` controls both the label shape (day vs week vs
// month) and the nudge stride.
const DateNavigator = ({ view, anchor, setAnchor, nudge }) => (
  <>
    <div
      className="flex items-center bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-md"
      style={{ boxShadow: "var(--sf-shadow)" }}
    >
      <button
        onClick={() => nudge(-1)}
        aria-label="Previous"
        className="px-2 py-1.5 text-[var(--sf-ink-2)] hover:text-[var(--sf-ink)]"
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
  </>
)

const ScheduleToolbar = ({
  view, setView, anchor, setAnchor, nudge,
  cleaners, cleanerColor, resolveName, isSelected, toggleCleaner,
}) => {
  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-2 flex-wrap">
      <DateNavigator view={view} anchor={anchor} setAnchor={setAnchor} nudge={nudge} />

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
              {layoutDay(dayJobs, startHr, endHr, 560).map((item) => (
                <ScheduleBlock
                  key={item.job.id}
                  job={item.job}
                  top={item.top}
                  height={item.height}
                  cleanerColor={cleanerColor}
                  onClick={() => onJobClick(item.job)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Day view ───────────────────────────────────────────────
// Job-oriented list: one row per unique job, sorted by start time. Cleaner
// avatars render inside each row so team jobs appear once (not duplicated
// per assignee) and the visible count matches the "N jobs today" number.

const DayView = ({ anchor, jobs, cleanerColor, resolveName, onJobClick }) => {
  const day = useMemo(() => startOfDay(anchor), [anchor])

  const dayJobs = useMemo(
    () => jobs
      .filter((j) => {
        const d = jobStartDateTime(j)
        return d && sameDay(startOfDay(d), day)
      })
      .sort((a, b) => (jobStartDateTime(a)?.getTime() ?? Infinity) - (jobStartDateTime(b)?.getTime() ?? Infinity)),
    [jobs, day]
  )

  const teamCount = useMemo(
    () => dayJobs.filter((j) => assigneesFor(j).length >= 2).length,
    [dayJobs]
  )
  const revenue = useMemo(
    () => dayJobs.reduce((s, j) => s + (parseFloat(j.total || j.service_price || 0) || 0), 0),
    [dayJobs]
  )

  const isToday = sameDay(day, startOfDay(new Date()))
  const nowTs = new Date().getTime()

  if (dayJobs.length === 0) {
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
      {/* Header */}
      <div className="flex items-center border-b border-[var(--sf-border-soft)] px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]" style={{ letterSpacing: "-0.005em" }}>
            {day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {isToday && (
              <span
                className="ml-2 text-[9.5px] font-bold align-middle"
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
          </div>
          <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
            {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
            {teamCount > 0 && ` · ${teamCount} team${teamCount === 1 ? "" : "s"}`}
            {revenue > 0 && ` · $${Math.round(revenue).toLocaleString()}`}
          </div>
        </div>
      </div>

      {/* Job list */}
      <div>
        {dayJobs.map((j) => {
          const start = jobStartDateTime(j)
          const dur = durationMinutes(j)
          const assignees = assigneesFor(j)
          const isTeamJob = assignees.length >= 2
          const isUnassigned = assignees.length === 0
          const endTs = start ? start.getTime() + dur * 60000 : 0
          const startTs = start ? start.getTime() : 0
          const isPast = isToday && endTs < nowTs
          const isCurrent = isToday && startTs <= nowTs && endTs > nowTs
          const live = isLiveJob(j)
          const jobColor = isUnassigned ? "#DC2626" : cleanerColor(assignees[0].id)
          const customer = customerLabelForJob(j)
          const service = j.service_name || j.service?.name || j.title || "Service"
          const durLabel = dur >= 60
            ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ""}`
            : `${dur}m`
          // Per-cleaner share (visible on team jobs) — how much of the
          // job's clock-time each cleaner effectively covers.
          const shareMins = isTeamJob ? Math.round(dur / assignees.length) : dur
          const shareLabel = shareMins >= 60
            ? `${Math.floor(shareMins / 60)}h${shareMins % 60 ? ` ${shareMins % 60}m` : ""}`
            : `${shareMins}m`

          return (
            <button
              key={j.id}
              onClick={() => onJobClick(j)}
              className="w-full flex items-stretch gap-3 px-4 py-3 border-b border-[var(--sf-border-soft)] hover:bg-[var(--sf-panel-alt)] transition-colors"
              style={{
                background: isCurrent ? "var(--sf-blue-soft)" : "transparent",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                borderBottom: "1px solid var(--sf-border-soft)",
                opacity: isPast ? 0.55 : 1,
                fontFamily: "var(--sf-font-ui)",
              }}
            >
              {/* Color spine */}
              <div
                style={{
                  width: 3,
                  borderRadius: 2,
                  background: jobColor,
                  flexShrink: 0,
                }}
              />

              {/* Time */}
              <div style={{ width: 84, flexShrink: 0 }}>
                <div
                  className="text-[13px] font-semibold text-[var(--sf-ink)]"
                  style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
                >
                  {formatJobTime(j)}
                </div>
                <div
                  className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {durLabel}
                </div>
              </div>

              {/* Middle: customer + service */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[13.5px] font-semibold text-[var(--sf-ink)] truncate">
                    {customer}
                  </span>
                  {isTeamJob && (
                    <span
                      className="text-[9px] font-bold flex-shrink-0"
                      style={{
                        color: "#fff",
                        background: jobColor,
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontFamily: "var(--sf-font-mono)",
                        letterSpacing: ".04em",
                      }}
                      title={`Team of ${assignees.length} · ${shareLabel} share per cleaner`}
                    >
                      TEAM · {assignees.length} · {shareLabel} each
                    </span>
                  )}
                  {isUnassigned && (
                    <span
                      className="text-[9px] font-bold flex-shrink-0"
                      style={{
                        color: "#fff",
                        background: "var(--sf-red)",
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontFamily: "var(--sf-font-mono)",
                      }}
                    >
                      UNASSIGNED
                    </span>
                  )}
                  {live && (
                    <span
                      className="text-[9px] font-bold flex-shrink-0"
                      style={{
                        color: "#fff",
                        background: jobColor,
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontFamily: "var(--sf-font-mono)",
                      }}
                    >
                      LIVE
                    </span>
                  )}
                  {isCurrent && !live && (
                    <span
                      className="text-[9px] font-bold flex-shrink-0"
                      style={{
                        color: "var(--sf-red-dark)",
                        background: "var(--sf-panel)",
                        border: "1px solid var(--sf-red)",
                        padding: "0 4px",
                        borderRadius: 3,
                        fontFamily: "var(--sf-font-mono)",
                      }}
                    >
                      NOW
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-[var(--sf-ink-2)] mt-0.5 truncate">
                  {service}
                </div>
              </div>

              {/* Right: cleaner chips */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isUnassigned ? (
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      background: "var(--sf-red-soft)",
                      color: "var(--sf-red-dark)",
                      fontSize: 9.5,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1.5px dashed var(--sf-red)",
                    }}
                    title="Unassigned"
                  >
                    —
                  </div>
                ) : (
                  assignees.map((a) => {
                    const name = resolveName(a.id, a.name) || `Cleaner ${a.id}`
                    const first = name.split(" ")[0]
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-1.5"
                        title={name}
                      >
                        <SfAvatar
                          initials={sfInitials(name) || "?"}
                          color={cleanerColor(a.id)}
                          size={26}
                        />
                        <span
                          className="text-[11.5px] font-semibold text-[var(--sf-ink)]"
                          style={{ maxWidth: 88, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {first}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </button>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Month view ─────────────────────────────────────────────

const MonthView = ({ anchor, jobs, cleanerColor, resolveName, onJobClick, onPickDay }) => {
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

  // Cells the user has clicked "+N more" on — those render all jobs
  // inline instead of navigating to the day view.
  const [expandedCells, setExpandedCells] = useState(() => new Set())
  const toggleExpand = useCallback((key) => {
    setExpandedCells((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

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
        style={{ gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(160px, auto)" }}
      >
        {cells.map((d, idx) => {
          const col = idx % 7
          const row = Math.floor(idx / 7)
          const isOtherMonth = d.getMonth() !== monthStart.getMonth()
          const isToday = sameDay(d, today)
          const dateKey = d.toDateString()
          const dayJobs = jobsByDay.get(dateKey) || []
          const isExpanded = expandedCells.has(dateKey)
          const visibleJobs = isExpanded ? dayJobs : dayJobs.slice(0, 3)
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
                minHeight: 160,
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
              {visibleJobs.map((j) => {
                const a = assigneesFor(j)
                const color = a.length > 0 ? cleanerColor(a[0].id) : "#DC2626"
                const live = isLiveJob(j)
                const dur = durationMinutes(j)
                const durLabel = dur >= 60
                  ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ""}`
                  : `${dur}m`
                const cleanerNames = a
                  .map((x) => {
                    const full = resolveName ? resolveName(x.id, x.name) : x.name
                    return (full || "").split(" ")[0]
                  })
                  .filter(Boolean)
                const cleanerLabel = cleanerNames.length === 0
                  ? "Unassigned"
                  : cleanerNames.length <= 2
                  ? cleanerNames.join(", ")
                  : `${cleanerNames.slice(0, 2).join(", ")} +${cleanerNames.length - 2}`
                return (
                  <button
                    key={j.id}
                    onClick={(e) => { e.stopPropagation(); onJobClick(j) }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      padding: "3px 6px",
                      background: live ? color : `${color}1a`,
                      color: live ? "#fff" : color,
                      borderLeft: `2px solid ${color}`,
                      border: "none",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontFamily: "var(--sf-font-ui)",
                      textAlign: "left",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontVariantNumeric: "tabular-nums",
                        opacity: 0.85,
                        fontFamily: "var(--sf-font-mono)",
                        fontSize: 9.5,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatJobTime(j)} · {durLabel}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {customerLabelForJob(j)}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 9.5,
                        fontWeight: 500,
                        opacity: 0.75,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {cleanerLabel}
                    </span>
                  </button>
                )
              })}
              {dayJobs.length > 3 && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(dateKey) }}
                  className="text-[10.5px] text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] font-semibold text-left"
                  style={{
                    padding: "2px 5px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "var(--sf-font-ui)",
                  }}
                >
                  {isExpanded ? "− show less" : `+${dayJobs.length - 3} more`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Schedule block (used by Day + Week views) ──────────────

const ScheduleBlock = ({ job, top, height, cleanerColor, forcedColor, onClick }) => {
  const assignees = assigneesFor(job)
  const color = forcedColor || (assignees.length > 0 ? cleanerColor(assignees[0].id) : "#DC2626")
  const live = isLiveJob(job)
  const first = (customerLabelForJob(job) || "").split(" ")[0] || "—"
  const teamLetter = assignees[0]?.name
    ? assignees[0].name.charAt(0).toUpperCase()
    : assignees.length === 0
    ? "?"
    : "·"
  const startMins = (() => {
    const d = jobStartDateTime(job)
    return d ? d.getHours() * 60 + d.getMinutes() : 0
  })()

  return (
    <button
      onClick={onClick}
      className="sf-timeline-block"
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: 4,
        right: 4,
        display: "flex",
        flexDirection: "column",
        padding: 0,
        background: live ? color : "#fff",
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${live ? color : color + "40"}`,
        color: live ? "#fff" : "var(--sf-ink)",
        borderRadius: 4,
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
        textAlign: "left",
        boxShadow: live ? `0 1px 4px ${color}40` : "var(--sf-shadow)",
        zIndex: 2,
        overflow: "hidden",
      }}
    >
      {/* Info strip pinned to top; card body below is coloured to show duration */}
      <div
        style={{
          height: 22,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 6px",
        }}
      >
        {live && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              background: "#fff",
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 9.5,
            color: live ? "rgba(255,255,255,.85)" : "var(--sf-ink-3)",
            fontFamily: "var(--sf-font-mono)",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {minsToLabel(startMins)}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {first}
        </span>
        {assignees.length === 0 ? (
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 700,
              color: "#fff",
              background: "var(--sf-red)",
              padding: "0 4px",
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            UNASGN
          </span>
        ) : (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--sf-font-mono)",
              color: live ? "rgba(255,255,255,.85)" : "var(--sf-ink-3)",
              flexShrink: 0,
            }}
          >
            {teamLetter}
          </span>
        )}
      </div>
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

// ── ZB availability sync button ────────────────────────────
//
// Calls POST /api/team-availability/sync (kicks off in background) then
// polls GET /api/team-availability/sync/progress until it hits a terminal
// state. Invokes onDone(summary) on success so the parent can invalidate
// the team query and refresh cell data.
const SyncFromZBButton = ({ onDone }) => {
  const [status, setStatus] = useState("idle") // idle | running | done | error
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  const run = useCallback(async () => {
    setStatus("running")
    setError(null)
    setSummary(null)
    try {
      await teamAPI.syncAvailabilityFromZenbooker()
    } catch (e) {
      // 409 = already running elsewhere — start polling anyway
      if (e?.response?.status !== 409) {
        setStatus("error")
        setError(e?.response?.data?.error || e?.message || "Sync failed to start")
        return
      }
    }
    // Poll every 2s for up to 3 minutes
    const started = Date.now()
    while (Date.now() - started < 180_000) {
      await new Promise((r) => setTimeout(r, 2000))
      let p
      try {
        p = await teamAPI.getAvailabilitySyncProgress()
      } catch {
        continue
      }
      if (p?.status === "done") {
        setStatus("done")
        setSummary(p.summary || null)
        onDone?.(p.summary)
        return
      }
      if (p?.status === "error") {
        setStatus("error")
        setError(p.error || "Reconcile failed")
        return
      }
    }
    setStatus("error")
    setError("Timed out waiting for sync to finish")
  }, [onDone])

  const busy = status === "running"
  const updated = summary?.updated ?? 0
  const unchanged = summary?.unchanged ?? 0
  const scanned = summary?.scanned ?? 0
  const noMatch = (summary?.skipped_no_zb_id ?? 0) + (summary?.skipped_no_zb_match ?? 0)
  const doneLabel = updated > 0
    ? `✓ Updated ${updated} of ${scanned} cleaners`
    : scanned > 0
      ? `✓ Already up to date${noMatch > 0 ? ` (${noMatch} not on ZB)` : ""}`
      : "✓ Nothing to sync"

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {status === "done" && (
        <span
          className="text-[11px]"
          style={{ color: "var(--sf-green-dark)", fontWeight: 600 }}
          title={`updated=${updated} unchanged=${unchanged} scanned=${scanned} not_on_zb=${noMatch}`}
        >
          {doneLabel}
        </span>
      )}
      {status === "error" && (
        <span
          className="text-[11px]"
          style={{ color: "var(--sf-red-dark)", fontWeight: 600 }}
          title={error || ""}
        >
          Sync failed
        </span>
      )}
      <button
        onClick={run}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          border: "1px solid var(--sf-border-soft)",
          borderRadius: 6,
          fontSize: 12,
          fontFamily: "var(--sf-font-ui)",
          fontWeight: 600,
          background: busy ? "var(--sf-panel-soft)" : "var(--sf-panel)",
          color: busy ? "var(--sf-ink-3)" : "var(--sf-blue-dark)",
          cursor: busy ? "wait" : "pointer",
        }}
        title="Pull latest availability from Zenbooker /timeslots"
      >
        <RefreshCw
          size={12}
          style={{ animation: busy ? "sf-spin 1s linear infinite" : "none" }}
        />
        {busy ? "Syncing…" : "Sync from Zenbooker"}
      </button>
      <style>{`@keyframes sf-spin { to { transform: rotate(360deg); } }`}</style>
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
  territories,
  selectedTerritoryId,
  onSelectTerritory,
  onSyncFromZB,
}) => {
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const dateKeys = useMemo(() => days.map(formatDateKey), [days])

  // Derive per-(cleaner, day) capacity from real team_members.availability
  // + scheduled jobs. Old behavior derived a fake availability from jobs
  // alone (a cleaner with no jobs was labeled "Off"); after Aug 2026 we
  // have ZB-sourced availability jsonb on every synced team_member, so
  // "Off" now means actually not scheduled.
  //
  // Cell shape:
  //   {
  //     workingMinutes: number,   // real hours per team_members.availability
  //     bookedMinutes:  number,   // minutes of jobs assigned to this cleaner
  //     availableMinutes: number, // max(0, workingMinutes - bookedMinutes)
  //     jobs: number,             // count of jobs assigned that day
  //     offDay: boolean,          // true when availability signal says off
  //     noSignal: boolean,        // no availability data at all for this row
  //   }
  const status = useMemo(() => {
    const map = new Map()
    // Pre-build per-cleaner per-day booked intervals so we don't scan
    // every job for every cell.
    const bookedByCleaner = new Map() // cleanerId → dateKey → [[start,end], ...]
    jobs.forEach((j) => {
      const startDate = jobStartDateTime(j)
      if (!startDate) return
      const dayIdx = days.findIndex((dd) => sameDay(dd, startOfDay(startDate)))
      if (dayIdx < 0) return
      const dateKey = dateKeys[dayIdx]
      const dur = durationMinutes(j)
      const interval = jobIntervalOnDate(startDate, dur, dateKey)
      if (!interval) return
      assigneesFor(j).forEach((a) => {
        const id = String(a.id)
        if (!bookedByCleaner.has(id)) bookedByCleaner.set(id, new Map())
        const byDate = bookedByCleaner.get(id)
        if (!byDate.has(dateKey)) byDate.set(dateKey, [])
        byDate.get(dateKey).push(interval)
      })
    })
    cleaners.forEach((m) => {
      const id = String(m.id)
      const bookedForCleaner = bookedByCleaner.get(id) || new Map()
      const row = dateKeys.map((dateKey) => {
        const working = getWorkingIntervals(m.availability, dateKey)
        const bookedIntervals = bookedForCleaner.get(dateKey) || []
        const bookedMinutes = sumIntervalMinutes(bookedIntervals)
        const jobsCount = bookedIntervals.length
        if (working === null) {
          // No availability signal at all — historical rows or manually-
          // added cleaners without a saved schedule. Distinguish from a
          // real off-day so the operator can spot rows that need setup.
          return {
            workingMinutes: 0,
            bookedMinutes,
            availableMinutes: 0,
            jobs: jobsCount,
            offDay: false,
            noSignal: true,
          }
        }
        if (working.length === 0) {
          return {
            workingMinutes: 0,
            bookedMinutes,
            availableMinutes: 0,
            jobs: jobsCount,
            offDay: true,
            noSignal: false,
          }
        }
        const workingMinutes = sumIntervalMinutes(working)
        const remaining = subtractIntervals(working, bookedIntervals)
        const availableMinutes = sumIntervalMinutes(remaining)
        return {
          workingMinutes,
          bookedMinutes,
          availableMinutes,
          jobs: jobsCount,
          offDay: false,
          noSignal: false,
        }
      })
      map.set(id, row)
    })
    return map
  }, [cleaners, jobs, days, dateKeys])

  // Top KPIs — recomputed against real availability instead of a flat
  // 8h × N × 7 baseline. Capacity now reflects what cleaners actually
  // have on their schedule for the week.
  const kpis = useMemo(() => {
    let totalWorkingMinutes = 0
    let totalBookedMinutes = 0
    let totalAvailableMinutes = 0
    let onShift = 0
    cleaners.forEach((m) => {
      const row = status.get(String(m.id)) || []
      let cleanerWorking = 0
      row.forEach((c) => {
        totalWorkingMinutes += c.workingMinutes
        totalBookedMinutes += c.bookedMinutes
        totalAvailableMinutes += c.availableMinutes
        cleanerWorking += c.workingMinutes
      })
      if (cleanerWorking > 0) onShift += 1
    })
    return {
      onShift,
      totalCleaners: cleaners.length,
      capacityHours: Math.round(totalWorkingMinutes / 60),
      bookedHours:   Math.round(totalBookedMinutes / 60),
      availableHours: Math.round(totalAvailableMinutes / 60),
    }
  }, [cleaners, status])
  const utilization = kpis.capacityHours
    ? Math.round((kpis.bookedHours / kpis.capacityHours) * 100)
    : 0
  const availableHours = kpis.availableHours

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
          value={`${kpis.onShift} / ${kpis.totalCleaners}`}
          accent="var(--sf-green)"
          sub="cleaners scheduled"
        />
        <SfKPI
          label="Total capacity"
          value={`${kpis.capacityHours} hrs`}
          accent="var(--sf-blue)"
          sub={`${kpis.totalCleaners} cleaner${kpis.totalCleaners === 1 ? "" : "s"} · real hours`}
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
              {formatRangeLabel("week", anchor)} · from cleaner working hours
              {selectedTerritoryId != null ? (
                <>
                  {" · "}
                  <span style={{ color: "var(--sf-blue-dark)" }}>
                    {territories?.find((t) => Number(t.id) === Number(selectedTerritoryId))?.name || "Territory"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            {Array.isArray(territories) && territories.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label
                  htmlFor="availability-territory-picker"
                  className="text-[11px] text-[var(--sf-ink-3)] font-semibold uppercase"
                  style={{ letterSpacing: ".05em" }}
                >
                  Territory
                </label>
                <select
                  id="availability-territory-picker"
                  value={selectedTerritoryId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value
                    onSelectTerritory?.(v === "" ? null : Number(v))
                  }}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid var(--sf-border-soft)",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "var(--sf-font-ui)",
                    background: "var(--sf-panel)",
                    color: "var(--sf-ink)",
                    cursor: "pointer",
                    minWidth: 160,
                  }}
                >
                  <option value="">All territories</option>
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Territory ${t.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SyncFromZBButton onDone={onSyncFromZB} />
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
                const shiftH = cell.workingMinutes / 60
                const workedH = cell.bookedMinutes / 60
                const freeH = cell.availableMinutes / 60
                const fmtH = (h) => {
                  const r = Math.round(h * 10) / 10
                  return Number.isInteger(r) ? String(r) : r.toFixed(1)
                }
                let meta
                if (cell.noSignal) {
                  // No availability data at all — flag for setup, don't
                  // silently pretend "Off".
                  meta = {
                    c: "var(--sf-ink-3)",
                    bg: "var(--sf-panel-soft)",
                    icon: Minus,
                    label: "—",
                    sub: "no schedule",
                  }
                } else if (cell.offDay) {
                  // Off-day but with jobs (unusual, e.g. asked to cover a
                  // day off) still owes a worked-hours count.
                  meta = {
                    c: "var(--sf-ink-3)",
                    bg: "var(--sf-panel-soft)",
                    icon: Minus,
                    label: "Off",
                    sub: cell.jobs > 0 ? `${fmtH(workedH)}h worked` : null,
                  }
                } else if (cell.availableMinutes === 0) {
                  // Working but fully booked — amber so it stands out from
                  // both green (free) and grey (off).
                  meta = {
                    c: "var(--sf-amber-dark)",
                    bg: "var(--sf-amber-soft)",
                    icon: Check,
                    label: `${fmtH(shiftH)}h shift`,
                    sub: `${fmtH(workedH)}h worked · 0h free`,
                  }
                } else {
                  meta = {
                    c: "var(--sf-green-dark)",
                    bg: "var(--sf-green-soft)",
                    icon: Check,
                    label: `${fmtH(shiftH)}h shift`,
                    sub: cell.bookedMinutes > 0
                      ? `${fmtH(workedH)}h worked · ${fmtH(freeH)}h free`
                      : `${fmtH(freeH)}h free`,
                  }
                }
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
                      {meta.sub && (
                        <span className="text-[10px] opacity-80">{meta.sub}</span>
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

  // Working window(s) + free window(s) for this cleaner on this day, so
  // the operator sees when open time exists without leaving the modal.
  const dateKey = formatDateKey(day)
  const workingIvs = getWorkingIntervals(team?.availability, dateKey) || []
  const bookedIvs = assigned
    .map((j) => {
      const sd = jobStartDateTime(j)
      return sd ? jobIntervalOnDate(sd, durationMinutes(j), dateKey) : null
    })
    .filter(Boolean)
  const freeIvs = subtractIntervals(workingIvs, bookedIvs)

  // Assigned-tab timeline: interleave free-slot cards between assigned
  // job rows in chronological order. Lets the operator see when the
  // cleaner is free between cleanings — with exact times.
  const assignedTimeline = (() => {
    if (subTab !== "assigned") return null
    const items = []
    assigned.forEach((j) => {
      const sd = jobStartDateTime(j)
      const start = sd ? sd.getHours() * 60 + sd.getMinutes() : 0
      items.push({ type: "job", start, job: j })
    })
    freeIvs.forEach(([s, e]) => {
      items.push({ type: "free", start: s, end: e })
    })
    items.sort((a, b) => a.start - b.start)
    return items
  })()
  const shiftSummary =
    workingIvs.length === 0
      ? null
      : `Shift ${workingIvs.map(([s, e]) => `${minsToLabel(s)}–${minsToLabel(e)}`).join(" · ")}`
  const freeSummary =
    workingIvs.length === 0
      ? null
      : freeIvs.length === 0
        ? "Fully booked"
        : `Free ${freeIvs.map(([s, e]) => `${minsToLabel(s)}–${minsToLabel(e)}`).join(" · ")}`

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
            {(shiftSummary || freeSummary) && (
              <div
                className="text-[11px] mt-1"
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              >
                {shiftSummary && (
                  <span style={{ color: "var(--sf-ink-3)" }}>{shiftSummary}</span>
                )}
                {freeSummary && (
                  <span
                    style={{
                      color: freeIvs.length === 0
                        ? "var(--sf-amber-dark)"
                        : "var(--sf-green-dark)",
                      fontWeight: 600,
                    }}
                  >
                    {freeSummary}
                  </span>
                )}
              </div>
            )}
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
          {subTab === "assigned" ? (
            assignedTimeline.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
                {workingIvs.length === 0
                  ? `${teamName.split(" ")[0]} is not on shift this day.`
                  : `No jobs currently assigned to ${teamName.split(" ")[0]} on this day.`}
              </div>
            ) : (
              assignedTimeline.map((item, i) => {
                const isLast = i === assignedTimeline.length - 1
                if (item.type === "job") {
                  return (
                    <ShiftJobRow
                      key={`j-${item.job.id}`}
                      job={item.job}
                      isLast={isLast}
                      teamColor={teamColor}
                      cleanerColor={cleanerColor}
                      resolveName={resolveName}
                      subTab={subTab}
                      teamName={teamName}
                      busy={busy}
                      highlight={String(item.job.id) === String(payload.jobId)}
                      onOpen={() => onOpenJob?.(item.job)}
                      onAssign={() => onAssignToTeam(item.job)}
                      onPull={() => onPullToTeam(item.job)}
                      onUnassign={() => onUnassign(item.job)}
                    />
                  )
                }
                return (
                  <FreeSlotRow
                    key={`f-${item.start}-${item.end}`}
                    start={item.start}
                    end={item.end}
                    isLast={isLast}
                    teamName={teamName}
                    onNewJob={() => onNewJob?.(teamId, { day, start: item.start, end: item.end })}
                  />
                )
              })
            )
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              {subTab === "unassigned"
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
  const rangeLabel = d ? formatJobRange(job) : "—"
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
      <div style={{ width: 82, textAlign: "center", flexShrink: 0 }}>
        <div
          className="text-[12px] font-bold text-[var(--sf-ink)]"
          style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
        >
          {rangeLabel}
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

// ── Free-slot card (in manage-shift modal, Assigned tab) ────
//
// A gap between assigned cleanings shown inline in the timeline so the
// operator sees exactly when the cleaner is free without having to
// eyeball job start/end times.
const FreeSlotRow = ({ start, end, isLast, teamName, onNewJob }) => {
  const durMin = end - start
  const h = Math.floor(durMin / 60)
  const m = durMin % 60
  const durLabel = m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h ${m}m`
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
        background: "var(--sf-green-soft)",
        borderLeft: "3px solid var(--sf-green)",
      }}
    >
      <div style={{ width: 82, textAlign: "center", flexShrink: 0 }}>
        <div
          className="text-[12px] font-bold"
          style={{
            color: "var(--sf-green-dark)",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {minsToLabel(start)}–{minsToLabel(end)}
        </div>
        <div className="text-[10px] text-[var(--sf-ink-3)] mt-px">{durLabel}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--sf-green-dark)" }}
        >
          Free window
        </div>
        <div className="text-[11px] text-[var(--sf-ink-2)] mt-0.5">
          {durLabel} open on {teamName.split(" ")[0]}'s shift
        </div>
      </div>
      <div className="flex-shrink-0">
        <SfButton variant="primary" size="sm" icon={Plus} onClick={onNewJob}>
          Book job
        </SfButton>
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
