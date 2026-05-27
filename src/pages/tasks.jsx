"use client"

import { useEffect, useMemo, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  ArrowLeft, ChevronRight, Plus, Search, Filter, Check, Clock, CheckCircle2,
  AlertCircle, RefreshCw, Bell, Eye, Settings as Gear, MessageSquare, Star,
  Archive, Phone, ClipboardList, Briefcase, User as UserIcon, Target,
  FileText, Users, MoreHorizontal, X, ChevronDown, Sparkles, CalendarDays,
  TrendingUp, Layers, Download,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { leadsAPI, teamAPI } from "../services/api"
import MobileHeader from "../components/mobile-header"
import {
  SfCard, SfCardHeader, SfButton, SfPageHeader, SfTab, SfKPI, SfFilterChip,
} from "../components/sf-primitives"

// ── Task type meta (design pack §TASK_TYPE_META) ────────────────────────────
const TASK_TYPE_META = {
  call:     { icon: Phone,         c: "var(--sf-blue-dark)",   bg: "var(--sf-blue-soft)",   label: "Call" },
  estimate: { icon: ClipboardList, c: "var(--sf-purple)",      bg: "var(--sf-purple-soft)", label: "Estimate" },
  confirm:  { icon: CheckCircle2,  c: "var(--sf-green-dark)",  bg: "var(--sf-green-soft)",  label: "Confirm" },
  supplies: { icon: Archive,       c: "var(--sf-amber-dark)",  bg: "var(--sf-amber-soft)",  label: "Supplies" },
  followup: { icon: RefreshCw,     c: "var(--sf-teal)",        bg: "var(--sf-teal-soft)",   label: "Follow-up" },
  reminder: { icon: Bell,          c: "var(--sf-red-dark)",    bg: "var(--sf-red-soft)",    label: "Reminder" },
  photo:    { icon: Eye,           c: "var(--sf-purple)",      bg: "var(--sf-purple-soft)", label: "Photo" },
  admin:    { icon: Gear,          c: "var(--sf-ink-2)",       bg: "var(--sf-panel-soft)",  label: "Admin" },
  reply:    { icon: MessageSquare, c: "var(--sf-blue-dark)",   bg: "var(--sf-blue-soft)",   label: "Reply" },
  review:   { icon: Star,          c: "var(--sf-amber-dark)",  bg: "var(--sf-amber-soft)",  label: "Review" },
}

// ── Linked-kind meta (design pack §LINKED_META) ─────────────────────────────
const LINKED_META = {
  job:      { icon: Briefcase,  c: "var(--sf-blue-dark)",   label: "Job" },
  customer: { icon: UserIcon,   c: "var(--sf-ink)",         label: "Customer" },
  lead:     { icon: Target,     c: "var(--sf-amber-dark)",  label: "Lead" },
  invoice:  { icon: FileText,   c: "var(--sf-green-dark)",  label: "Invoice" },
  team:     { icon: Users,      c: "var(--sf-purple)",      label: "Team" },
}

// Map our existing lead_tasks rows into the design's Task shape.
// Our schema lacks `type` so we derive a best-guess from the title verb;
// linkedKind defaults to 'lead' (that's the only relation we have).
const TYPE_HEURISTICS = [
  { type: "call",     re: /\b(call|phone|dial|ring)\b/i },
  { type: "estimate", re: /\b(estimate|quote|bid|proposal)\b/i },
  { type: "confirm",  re: /\b(confirm|verify|check)\b/i },
  { type: "supplies", re: /\b(suppl|order|stock|inventory|restock)\b/i },
  { type: "followup", re: /\b(follow\s*up|nudge|chase|re-?engage)\b/i },
  { type: "reminder", re: /\b(remind|reminder|nudge)\b/i },
  { type: "photo",    re: /\b(photo|picture|snap|image)\b/i },
  { type: "reply",    re: /\b(reply|respond|email|message|text|sms)\b/i },
  { type: "review",   re: /\b(review|approve|sign\s*off)\b/i },
]
const guessType = (title) => {
  const t = String(title || "")
  for (const { type, re } of TYPE_HEURISTICS) if (re.test(t)) return type
  return "admin"
}

// Days late from a parseable due_date ISO timestamp. Positive = overdue.
const daysLate = (task) => {
  if (!task?.due_date) return 0
  const d = new Date(task.due_date)
  if (Number.isNaN(d.getTime())) return 0
  const diffMs = Date.now() - d.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

const isCompleted = (t) => (t?.status || "").toLowerCase() === "completed"
const isOverdueTask = (t) => !isCompleted(t) && daysLate(t) > 0
const isTodayTask = (t) => {
  if (!t?.due_date || isCompleted(t)) return false
  const d = new Date(t.due_date)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}
const isFutureTask = (t) => !isCompleted(t) && !isTodayTask(t) && !isOverdueTask(t)
const taskHour = (t) => {
  if (!t?.due_date) return null
  const d = new Date(t.due_date)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours()
}
const formatDueChip = (t) => {
  if (!t?.due_date) return "No due date"
  const d = new Date(t.due_date)
  if (Number.isNaN(d.getTime())) return "Invalid date"
  if (isOverdueTask(t)) {
    const dl = daysLate(t)
    return dl === 1 ? "Overdue · 1d" : `Overdue · ${dl}d`
  }
  if (isTodayTask(t)) {
    return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
  }
  const opts = { month: "short", day: "numeric" }
  return d.toLocaleDateString("en-US", opts)
}
const ownerInitials = (t) => {
  if (!t?.team_members) return null
  const first = t.team_members.first_name || ""
  const last = t.team_members.last_name || ""
  if (!first && !last) return null
  return `${first[0] || ""}${last[0] || ""}`.toUpperCase()
}
const ownerName = (t) => {
  if (!t?.team_members) return null
  return `${t.team_members.first_name || ""} ${t.team_members.last_name || ""}`.trim() || null
}

const PRIORITY_META = {
  high: { fg: "var(--sf-red-dark)",   bg: "var(--sf-red-soft)",   label: "HIGH" },
  med:  { fg: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)", label: "MED" },
  medium: { fg: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)", label: "MED" },
  low:  { fg: "var(--sf-ink-3)",      bg: "var(--sf-panel-soft)", label: "LOW" },
}

// ── Shared TaskRow primitive (design pack §<TaskRow>) ───────────────────────
const TaskRow = ({ task, onToggle, onOpen, showOwner = true, compact = false }) => {
  const type = guessType(task.title)
  const meta = TASK_TYPE_META[type]
  const Icon = meta.icon
  const linkedKind = task.linkedKind || "lead"
  const linked = LINKED_META[linkedKind]
  const LIcon = linked?.icon
  const linkedName = task.leads
    ? `${task.leads.first_name || ""} ${task.leads.last_name || ""}`.trim() || task.leads.company || ""
    : task.linkedName || ""
  const linkedShortId = task.lead_id ? `L-${String(task.lead_id).slice(-4).padStart(4, "0")}` : ""
  const prio = PRIORITY_META[(task.priority || "low").toLowerCase()] || PRIORITY_META.low
  const done = isCompleted(task)
  const overdue = isOverdueTask(task)

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: compact ? "10px 14px" : "12px 14px",
        borderBottom: "1px solid var(--sf-border-soft)",
      }}
    >
      {/* checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle?.(task) }}
        className="flex-shrink-0 inline-flex items-center justify-center"
        style={{
          width: 20, height: 20, borderRadius: 6,
          background: done ? "var(--sf-green-dark)" : "var(--sf-panel)",
          border: done ? "1px solid var(--sf-green-dark)" : "1px solid var(--sf-border)",
          color: "#fff",
        }}
        title={done ? "Reopen task" : "Mark done"}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>
      {/* type tile */}
      <div
        className="flex-shrink-0 inline-flex items-center justify-center"
        style={{ width: 28, height: 28, borderRadius: 6, background: meta.bg, color: meta.c }}
      >
        <Icon size={14} />
      </div>
      {/* title + linkage */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => onOpen?.(task)}
      >
        <div
          className="text-[13px] font-semibold text-[var(--sf-ink)] truncate"
          style={done ? { textDecoration: "line-through", color: "var(--sf-ink-3)" } : undefined}
        >
          {task.title}
        </div>
        <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5 flex items-center gap-1.5 min-w-0">
          {LIcon && <LIcon size={11} style={{ color: linked.c }} />}
          {linkedShortId && (
            <span style={{ fontFamily: "var(--sf-font-mono, ui-monospace, monospace)" }}>
              {linkedShortId}
            </span>
          )}
          {linkedName && <span className="truncate">· {linkedName}</span>}
        </div>
      </div>
      {/* priority */}
      <div className="flex-shrink-0" style={{ width: 64 }}>
        <span
          className="inline-flex items-center px-1.5 py-[2px] rounded-md"
          style={{
            background: prio.bg, color: prio.fg,
            fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em",
          }}
        >
          {prio.label}
        </span>
      </div>
      {/* owner */}
      {showOwner && (
        <div className="flex-shrink-0 flex items-center gap-1.5" style={{ width: 56 }}>
          {ownerInitials(task) ? (
            <div
              className="rounded-full inline-flex items-center justify-center"
              style={{
                width: 24, height: 24,
                background: "rgba(37,99,235,0.15)",
                color: "var(--sf-blue-dark)",
                fontSize: 10, fontWeight: 700,
              }}
            >
              {ownerInitials(task)}
            </div>
          ) : (
            <span className="text-[10px] text-[var(--sf-ink-3)] italic">—</span>
          )}
        </div>
      )}
      {/* due chip */}
      <div className="flex-shrink-0" style={{ width: 130 }}>
        <span
          className="inline-flex items-center gap-1 px-2 py-[3px] rounded-md whitespace-nowrap"
          style={{
            background: done
              ? "var(--sf-green-soft)"
              : overdue
              ? "var(--sf-red-soft)"
              : "var(--sf-panel-soft)",
            color: done
              ? "var(--sf-green-dark)"
              : overdue
              ? "var(--sf-red-dark)"
              : "var(--sf-ink-2)",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <Clock size={11} />
          {done ? "Done" : formatDueChip(task)}
        </span>
      </div>
      <button
        type="button"
        className="flex-shrink-0 p-1.5 rounded-md text-[var(--sf-ink-3)] hover:bg-[var(--sf-panel-soft)]"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  )
}

const DaySection = ({ icon: Icon, title, sub, count, accent, tone, children }) => (
  <SfCard padding={false} className="mb-4">
    <div
      className="flex items-center gap-2"
      style={{
        padding: "10px 16px",
        background: tone === "alert" ? "var(--sf-red-soft)" : "var(--sf-panel-alt)",
        borderBottom: "1px solid var(--sf-border-soft)",
      }}
    >
      {Icon && <Icon size={14} style={{ color: accent }} />}
      <div className="flex-1 min-w-0">
        <div
          className="text-[11.5px] font-bold uppercase"
          style={{ color: accent || "var(--sf-ink-2)", letterSpacing: ".05em" }}
        >
          {title}
        </div>
        {sub && <div className="text-[10.5px] text-[var(--sf-ink-3)] mt-0.5">{sub}</div>}
      </div>
      <span
        className="inline-flex items-center px-2 py-[2px] rounded-md"
        style={{
          background: tone === "alert" ? "rgba(220,38,38,0.18)" : "var(--sf-panel-soft)",
          color: accent || "var(--sf-ink-2)",
          fontSize: 11, fontWeight: 700,
        }}
      >
        {count}
      </span>
    </div>
    <div>{children}</div>
  </SfCard>
)

// ─────────────────────────────────────────────────────────────────────────
// Page shell
// ─────────────────────────────────────────────────────────────────────────
const TasksPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState("mine")
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState([])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [t, teamResp] = await Promise.all([
          leadsAPI.getAllTasks({}).catch(() => []),
          teamAPI.getAll(user.id, { page: 1, limit: 200 }).catch(() => null),
        ])
        if (cancelled) return
        setTasks(Array.isArray(t) ? t : [])
        if (teamResp) setTeamMembers(teamResp.teamMembers || teamResp || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const toggleTask = async (task) => {
    const nextStatus = isCompleted(task) ? "pending" : "completed"
    // Optimistic
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: nextStatus, completed_at: nextStatus === "completed" ? new Date().toISOString() : null } : x)))
    try {
      await leadsAPI.updateTask(task.id, { status: nextStatus })
    } catch {
      // Rollback on error
      setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: task.status } : x)))
    }
  }

  const openTask = (task) => {
    if (task.lead_id) navigate(`/leads`)
  }

  const open = useMemo(() => tasks.filter((t) => !isCompleted(t)), [tasks])
  const done = useMemo(() => tasks.filter(isCompleted), [tasks])
  const today = useMemo(() => open.filter(isTodayTask), [open])
  const overdue = useMemo(() => open.filter(isOverdueTask), [open])

  const subtitle = useMemo(() => {
    switch (tab) {
      case "mine":     return `${open.length} open · ${overdue.length} overdue · ${done.length} completed`
      case "today":    return `${today.length} task${today.length === 1 ? "" : "s"} due today`
      case "overdue":  return `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"} need attention`
      case "all":      return `${open.length} open task${open.length === 1 ? "" : "s"} across all teams`
      case "done":     return `${done.length} completed task${done.length === 1 ? "" : "s"} (lifetime)`
      default:         return ""
    }
  }, [tab, open.length, overdue.length, today.length, done.length])

  const TABS = [
    { id: "mine",    label: "Assigned to me" },
    { id: "today",   label: "Today",   count: today.length || undefined },
    { id: "overdue", label: "Overdue", count: overdue.length || undefined },
    { id: "all",     label: "All open", count: open.length || undefined },
    { id: "done",    label: "Done",    count: done.length || undefined },
  ]

  return (
    <div className="min-h-screen bg-[var(--sf-bg-page)]" style={{ fontFamily: "var(--sf-font-ui)" }}>
      <MobileHeader pageTitle="Tasks" />

      <SfPageHeader
        eyebrow={
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] transition-colors"
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", textDecoration: "none",
            }}
          >
            <ArrowLeft size={11} />
            <span>Dashboard</span>
            <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
            <span style={{ color: "var(--sf-ink)" }}>Tasks</span>
          </Link>
        }
        title="Tasks"
        subtitle={subtitle}
        actions={
          <SfButton variant="primary" size="md" icon={Plus}>
            New task
          </SfButton>
        }
        tabs={
          <div className="flex items-center overflow-x-auto scrollbar-hide w-full">
            {TABS.map((t) => (
              <SfTab key={t.id} active={tab === t.id} count={t.count} onClick={() => setTab(t.id)}>
                {t.label}
              </SfTab>
            ))}
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-12 text-[13px] text-[var(--sf-ink-3)]">Loading tasks…</div>
        ) : tab === "mine" ? (
          <TasksMineView
            tasks={tasks}
            open={open}
            done={done}
            today={today}
            overdue={overdue}
            user={user}
            onToggle={toggleTask}
            onOpen={openTask}
          />
        ) : tab === "today" ? (
          <TasksTodayView today={today} done={done.filter(isTodayCompletedOrToday)} onToggle={toggleTask} onOpen={openTask} />
        ) : tab === "overdue" ? (
          <TasksOverdueView overdue={overdue} teamMembers={teamMembers} onToggle={toggleTask} onOpen={openTask} />
        ) : tab === "all" ? (
          <TasksAllOpenView open={open} onToggle={toggleTask} onOpen={openTask} />
        ) : (
          <TasksDoneView done={done} onToggle={toggleTask} onOpen={openTask} />
        )}
      </div>
    </div>
  )
}

// Helper for the Today tab to treat tasks completed today as "Done today"
const isTodayCompletedOrToday = (t) => {
  if (!isCompleted(t)) return false
  const completed = t.completed_at || t.updated_at
  if (!completed) return false
  const d = new Date(completed)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

// ── 1. Assigned to me ─────────────────────────────────────────────────────
const TasksMineView = ({ tasks, open, done, today, overdue, user, onToggle, onOpen }) => {
  const firstName = user?.first_name || user?.firstName || "there"
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return "Good morning"
    if (h < 18) return "Good afternoon"
    return "Good evening"
  })()
  const doneToday = done.filter(isTodayCompletedOrToday).length
  const nextUp = today.find((t) => taskHour(t) != null) || today[0] || open[0]

  // Time-of-day groupings
  const morning   = today.filter((t) => { const h = taskHour(t); return h != null && h < 12 })
  const afternoon = today.filter((t) => { const h = taskHour(t); return h != null && h >= 12 })
  const anytimeToday = today.filter((t) => taskHour(t) == null)
  const tomorrowFlag = (t) => {
    if (!t.due_date || isCompleted(t)) return false
    const d = new Date(t.due_date)
    const now = new Date()
    const tom = new Date(now)
    tom.setDate(now.getDate() + 1)
    return d.getFullYear() === tom.getFullYear() && d.getMonth() === tom.getMonth() && d.getDate() === tom.getDate()
  }
  const tomorrow = open.filter(tomorrowFlag)
  const later    = open.filter((t) => !isOverdueTask(t) && !isTodayTask(t) && !tomorrowFlag(t))

  // KPIs
  const avgClose = "—" // needs completed_at - created_at history

  return (
    <div>
      {/* Greeting hero */}
      <div
        className="rounded-[14px] p-5 mb-5 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, var(--sf-blue-soft) 0%, var(--sf-panel) 100%)",
          border: "1px solid var(--sf-border-soft)",
          boxShadow: "var(--sf-shadow)",
        }}
      >
        <div
          className="flex-shrink-0 rounded-full inline-flex items-center justify-center"
          style={{
            width: 48, height: 48,
            background: "var(--sf-blue)",
            color: "#fff",
            fontSize: 18, fontWeight: 700,
          }}
        >
          {(firstName[0] || "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-[var(--sf-blue-dark)] uppercase" style={{ letterSpacing: ".06em" }}>
            {greeting}, {firstName}
          </div>
          <div className="text-[18px] font-bold text-[var(--sf-ink)] mt-0.5" style={{ letterSpacing: "-0.01em" }}>
            You have <span style={{ color: "var(--sf-blue-dark)" }}>{today.length}</span> task{today.length === 1 ? "" : "s"} today · <span style={{ color: "var(--sf-red-dark)" }}>{overdue.length}</span> overdue
          </div>
          <div className="text-[12px] text-[var(--sf-ink-2)] mt-1">
            {open.length} open · {doneToday} completed already today
            {nextUp ? <> · next up: <b>{nextUp.title}</b></> : null}
          </div>
        </div>
        <SfButton variant="primary" size="md" icon={Plus}>Add task</SfButton>
      </div>

      {/* 5-KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <SfKPI label="My open"        value={open.length}     sub="across all sources"      accent="var(--sf-blue)" />
        <SfKPI label="Due today"      value={today.length}    sub={`${doneToday} done already`} accent="var(--sf-purple)" />
        <SfKPI label="Overdue"        value={overdue.length}  sub="needs recovery"          accent="var(--sf-red-dark)" />
        <SfKPI label="Done this week" value={done.length}     sub="completed tasks"         accent="var(--sf-green-dark)" />
        <SfKPI label="Avg close"      value={avgClose}        sub="needs history"           accent="var(--sf-ink)" />
      </div>

      {/* Two-column body: sidebar + grouped sections */}
      <div className="grid xl:grid-cols-[220px_1fr] gap-4">
        <TasksSidebar tasks={tasks} />
        <div>
          {overdue.length > 0 && (
            <DaySection icon={AlertCircle} title="Overdue" sub="Take action now" count={overdue.length} accent="var(--sf-red-dark)" tone="alert">
              {overdue.slice(0, 5).map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
            </DaySection>
          )}
          <DaySection icon={Clock} title="This morning" sub="Before noon" count={morning.length} accent="var(--sf-amber-dark)">
            {morning.length > 0
              ? morning.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)
              : <div className="px-4 py-3 text-[12px] text-[var(--sf-ink-3)] italic">Nothing scheduled</div>}
          </DaySection>
          <DaySection icon={Clock} title="This afternoon" sub="After noon" count={afternoon.length} accent="var(--sf-blue-dark)">
            {afternoon.length > 0
              ? afternoon.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)
              : <div className="px-4 py-3 text-[12px] text-[var(--sf-ink-3)] italic">Nothing scheduled</div>}
          </DaySection>
          {anytimeToday.length > 0 && (
            <DaySection icon={Layers} title="Anytime today" sub="No specific hour" count={anytimeToday.length} accent="var(--sf-ink-2)">
              {anytimeToday.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
            </DaySection>
          )}
          {tomorrow.length > 0 && (
            <DaySection icon={CalendarDays} title="Tomorrow" count={tomorrow.length} accent="var(--sf-purple)">
              {tomorrow.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
            </DaySection>
          )}
          {later.length > 0 && (
            <DaySection icon={CalendarDays} title="Later this week" count={later.length} accent="var(--sf-teal)">
              {later.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)}
            </DaySection>
          )}
          {tasks.length === 0 && (
            <SfCard className="text-center" style={{ padding: "48px 24px" }}>
              <Sparkles size={28} className="mx-auto mb-3 text-[var(--sf-blue-dark)]" />
              <div className="text-[14px] font-semibold text-[var(--sf-ink)] mb-1">No tasks yet</div>
              <div className="text-[12px] text-[var(--sf-ink-3)]">Tasks created on leads will appear here.</div>
            </SfCard>
          )}
        </div>
      </div>
    </div>
  )
}

const TasksSidebar = ({ tasks }) => {
  const open = tasks.filter((t) => !isCompleted(t))
  const bySource = { job: 0, customer: 0, lead: open.length, invoice: 0, team: 0 }
  const byType = {}
  open.forEach((t) => {
    const k = guessType(t.title)
    byType[k] = (byType[k] || 0) + 1
  })
  const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const SourceRow = ({ kind, count }) => {
    const m = LINKED_META[kind]
    const I = m.icon
    return (
      <button
        className="w-full inline-flex items-center gap-2 rounded-md hover:bg-[var(--sf-panel-soft)]"
        style={{ padding: "7px 10px", fontSize: 12, color: "var(--sf-ink-2)" }}
      >
        <I size={12} style={{ color: m.c }} />
        <span className="flex-1 text-left">{m.label}s</span>
        <span className="font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </button>
    )
  }

  return (
    <SfCard padding={false} className="hidden xl:block sticky top-4 self-start">
      <div style={{ padding: "10px 8px" }}>
        <div className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] px-2.5 mb-1" style={{ letterSpacing: ".05em" }}>By source</div>
        {Object.entries(bySource).map(([k, c]) => <SourceRow key={k} kind={k} count={c} />)}
        <div className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] px-2.5 mt-3 mb-1" style={{ letterSpacing: ".05em" }}>By type</div>
        {typeRows.length === 0 ? (
          <div className="px-2.5 py-1.5 text-[11px] italic text-[var(--sf-ink-3)]">No tasks</div>
        ) : typeRows.map(([type, count]) => {
          const m = TASK_TYPE_META[type]
          const I = m.icon
          return (
            <button
              key={type}
              className="w-full inline-flex items-center gap-2 rounded-md hover:bg-[var(--sf-panel-soft)]"
              style={{ padding: "7px 10px", fontSize: 12, color: "var(--sf-ink-2)" }}
            >
              <I size={12} style={{ color: m.c }} />
              <span className="flex-1 text-left">{m.label}</span>
              <span className="font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
            </button>
          )
        })}
        <div className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] px-2.5 mt-3 mb-1" style={{ letterSpacing: ".05em" }}>Quick filters</div>
        {["High priority", "Auto-generated", "Created by me", "Waiting on customer"].map((q) => (
          <button
            key={q}
            className="w-full text-left rounded-md hover:bg-[var(--sf-panel-soft)]"
            style={{ padding: "7px 10px", fontSize: 12, color: "var(--sf-ink-2)" }}
          >
            {q}
          </button>
        ))}
      </div>
    </SfCard>
  )
}

// ── 2. Today ──────────────────────────────────────────────────────────────
const TasksTodayView = ({ today, done, onToggle, onOpen }) => {
  const nowHour = new Date().getHours()
  const open = today
  const highPriority = open.filter((t) => (t.priority || "").toLowerCase() === "high").length
  const timeBlocked = open.filter((t) => taskHour(t) != null).length
  const anytime = open.length - timeBlocked

  const HOUR_RANGE = Array.from({ length: 13 }, (_, i) => 7 + i) // 7am – 7pm
  const placeAt = (h) => Math.max(0, Math.min(100, ((h - 7) / 12) * 100))

  // Buckets
  const buckets = [
    { id: "early",    label: "Early",     range: (h) => h != null && h < 9,           filter: (t) => { const h = taskHour(t); return h != null && h < 9 } },
    { id: "morning",  label: "Morning",   range: (h) => h != null && h >= 9 && h < 12, filter: (t) => { const h = taskHour(t); return h != null && h >= 9 && h < 12 } },
    { id: "midday",   label: "Midday",    range: (h) => h != null && h >= 12 && h < 15, filter: (t) => { const h = taskHour(t); return h != null && h >= 12 && h < 15 } },
    { id: "afternoon",label: "Afternoon", range: (h) => h != null && h >= 15 && h < 18, filter: (t) => { const h = taskHour(t); return h != null && h >= 15 && h < 18 } },
    { id: "evening",  label: "Evening",   range: (h) => h != null && h >= 18,         filter: (t) => { const h = taskHour(t); return h != null && h >= 18 } },
    { id: "anytime",  label: "Anytime",   range: () => true,                          filter: (t) => taskHour(t) == null },
  ]
  const currentBucket = (() => {
    if (nowHour < 9) return "early"
    if (nowHour < 12) return "morning"
    if (nowHour < 15) return "midday"
    if (nowHour < 18) return "afternoon"
    return "evening"
  })()

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <SfKPI label="Today's agenda" value={open.length + done.length} sub="open + done" accent="var(--sf-blue)" />
        <SfKPI label="Open"           value={open.length}               sub="not yet done" accent="var(--sf-amber)" />
        <SfKPI label="Completed"      value={done.length}               sub="done today"   accent="var(--sf-green-dark)" />
        <SfKPI label="High priority"  value={highPriority}              sub="needs focus"  accent="var(--sf-red-dark)" />
        <SfKPI label="Time-blocked"   value={timeBlocked}               sub="have an hour" accent="var(--sf-purple)" />
        <SfKPI label="Anytime"        value={anytime}                   sub="flexible"     accent="var(--sf-ink)" />
      </div>

      {/* Timeline ribbon */}
      <SfCard padding={false} className="mb-4">
        <div className="flex items-center gap-2" style={{ padding: "10px 16px", borderBottom: "1px solid var(--sf-border-soft)" }}>
          <CalendarDays size={14} className="text-[var(--sf-ink-3)]" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-[var(--sf-ink)]">Today · {todayLabel}</div>
            <div className="text-[11px] text-[var(--sf-ink-3)]">7am – 7pm window</div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md"
            style={{ background: "var(--sf-blue-soft)", color: "var(--sf-blue-dark)", fontSize: 11, fontWeight: 700 }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--sf-blue)" }} />
            Now · {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <div className="relative" style={{ height: 64, padding: "8px 16px" }}>
          {/* hour columns */}
          <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${HOUR_RANGE.length}, 1fr)`, gap: 4, position: "relative" }}>
            {HOUR_RANGE.map((h, i) => {
              const slot = open.filter((t) => {
                const th = taskHour(t)
                return th != null && th >= h && th < h + 1
              })
              const label = h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`
              return (
                <div
                  key={i}
                  className="relative border-r last:border-r-0"
                  style={{ borderColor: "var(--sf-border-soft)" }}
                >
                  <div className="absolute top-0 left-1 text-[9px] text-[var(--sf-ink-3)]" style={{ fontFamily: "var(--sf-font-mono, ui-monospace, monospace)" }}>
                    {label}
                  </div>
                  <div className="flex flex-col gap-0.5 mt-3 px-0.5">
                    {slot.slice(0, 2).map((t) => {
                      const meta = TASK_TYPE_META[guessType(t.title)]
                      const Icon = meta.icon
                      return (
                        <div
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-[4px] truncate"
                          style={{
                            height: 18,
                            padding: "0 4px",
                            background: meta.bg,
                            color: meta.c,
                            fontSize: 9.5,
                            fontWeight: 600,
                          }}
                        >
                          <Icon size={9} />
                          <span className="truncate">{t.title.slice(0, 18)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {/* now line */}
          {nowHour >= 7 && nowHour <= 19 && (
            <div
              className="absolute"
              style={{
                left: `calc(${placeAt(nowHour + new Date().getMinutes() / 60)}% + 16px)`,
                top: 0, bottom: 0,
                width: 2,
                background: "var(--sf-blue)",
                boxShadow: "0 0 6px rgba(37,99,235,0.4)",
              }}
            >
              <div
                className="absolute rounded-full"
                style={{
                  top: -3, left: -5,
                  width: 12, height: 12,
                  background: "var(--sf-blue)",
                  boxShadow: "0 0 0 3px rgba(37,99,235,0.18)",
                }}
              />
            </div>
          )}
        </div>
      </SfCard>

      {/* Bucket cards */}
      {buckets.map((b) => {
        const list = b.filter(open)
        if (list.length === 0) return null
        const isCurrent = b.id === currentBucket
        return (
          <SfCard key={b.id} padding={false} className="mb-3">
            <div
              className="flex items-center gap-2"
              style={{
                padding: "10px 16px",
                background: isCurrent ? "var(--sf-blue-soft)" : "var(--sf-panel-alt)",
                borderBottom: "1px solid var(--sf-border-soft)",
              }}
            >
              <div className="flex-1 text-[11.5px] font-bold uppercase text-[var(--sf-ink-2)]" style={{ letterSpacing: ".05em" }}>
                {b.label}
              </div>
              {isCurrent && (
                <span
                  className="inline-flex items-center px-2 py-[2px] rounded-md text-white"
                  style={{ background: "var(--sf-blue)", fontSize: 10, fontWeight: 700, letterSpacing: ".05em" }}
                >
                  NOW
                </span>
              )}
              <span className="text-[11px] font-bold text-[var(--sf-ink-2)] ml-1">{list.length}</span>
            </div>
            {list.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} compact />)}
          </SfCard>
        )
      })}

      {/* Done today */}
      {done.length > 0 && (
        <SfCard padding={false} className="mb-3">
          <div className="flex items-center gap-2" style={{ padding: "10px 16px", background: "var(--sf-green-soft)", borderBottom: "1px solid var(--sf-border-soft)" }}>
            <CheckCircle2 size={14} className="text-[var(--sf-green-dark)]" />
            <div className="flex-1 text-[11.5px] font-bold uppercase text-[var(--sf-green-dark)]" style={{ letterSpacing: ".05em" }}>
              Done today
            </div>
            <span className="text-[11px] font-bold text-[var(--sf-green-dark)]">{done.length}</span>
          </div>
          {done.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} compact />)}
        </SfCard>
      )}

      {open.length === 0 && done.length === 0 && (
        <SfCard className="text-center" style={{ padding: "48px 24px" }}>
          <CheckCircle2 size={28} className="mx-auto mb-3 text-[var(--sf-green-dark)]" />
          <div className="text-[14px] font-semibold text-[var(--sf-ink)] mb-1">Nothing on today's agenda</div>
          <div className="text-[12px] text-[var(--sf-ink-3)]">Enjoy the breathing room.</div>
        </SfCard>
      )}
    </div>
  )
}

// ── 3. Overdue ────────────────────────────────────────────────────────────
const TasksOverdueView = ({ overdue, teamMembers, onToggle, onOpen }) => {
  const sorted = [...overdue].sort((a, b) => daysLate(b) - daysLate(a))
  const oldest = sorted[0]
  const totalDaysLost = sorted.reduce((s, t) => s + daysLate(t), 0)
  const avgLate = sorted.length ? totalDaysLost / sorted.length : 0
  const highPrio = sorted.filter((t) => (t.priority || "").toLowerCase() === "high").length

  // By owner
  const byOwner = {}
  sorted.forEach((t) => {
    const id = t.assigned_to || "unassigned"
    if (!byOwner[id]) byOwner[id] = { id, count: 0, daysLost: 0, name: ownerName(t) || "Unassigned", initials: ownerInitials(t) || "?" }
    byOwner[id].count += 1
    byOwner[id].daysLost += daysLate(t)
  })
  const owners = Object.values(byOwner).sort((a, b) => b.count - a.count)
  const maxOwnerCount = Math.max(1, ...owners.map((o) => o.count))

  // Pattern by linked kind (always lead in our schema)
  const byKind = { lead: sorted.length }
  const patternRows = Object.entries(byKind).map(([k, c]) => ({ kind: k, count: c, pct: sorted.length ? (c / sorted.length) * 100 : 0 }))

  return (
    <div>
      {/* Red gradient banner */}
      <div
        className="rounded-[14px] p-5 mb-5 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)",
          color: "#fff",
          boxShadow: "var(--sf-shadow-m)",
        }}
      >
        <div
          className="flex-shrink-0 inline-flex items-center justify-center"
          style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.18)" }}
        >
          <AlertCircle size={22} strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.9 }}>
            Action required
          </div>
          <div className="mt-0.5" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
            <b>{sorted.length}</b> overdue task{sorted.length === 1 ? "" : "s"} · <b>{totalDaysLost}</b> day{totalDaysLost === 1 ? "" : "s"} lost
          </div>
          <div className="mt-1" style={{ fontSize: 12, opacity: 0.92 }}>
            {oldest
              ? <>Oldest: <b>{oldest.title}</b> · {formatDueChip(oldest)}. Review and either complete, reassign, or close out.</>
              : "Nothing overdue — keep it up."}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold"
            style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.45)" }}
          >
            Snooze 1 day
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold"
            style={{ background: "#fff", color: "#991B1B" }}
          >
            Reassign all
          </button>
        </div>
      </div>

      {/* 6-KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <SfKPI label="Total overdue"   value={sorted.length}             sub="needs action"      accent="var(--sf-red-dark)" />
        <SfKPI label="Days lost"       value={totalDaysLost}             sub="cumulative"        accent="var(--sf-red)" />
        <SfKPI label="Oldest"          value={oldest ? `${daysLate(oldest)}d` : "—"} sub={oldest ? oldest.title.slice(0, 24) : "no overdue"} accent="var(--sf-amber-dark)" mono={false} />
        <SfKPI label="High priority"   value={highPrio}                  sub="critical"          accent="var(--sf-red-dark)" />
        <SfKPI label="Avg days late"   value={`${avgLate.toFixed(1)}d`}  sub="per task"          accent="var(--sf-amber)" />
        <SfKPI label="Owners involved" value={owners.length}             sub="distinct"          accent="var(--sf-purple)" />
      </div>

      {/* Owner + pattern row */}
      <div className="grid xl:grid-cols-2 gap-4 mb-4">
        <SfCard>
          <SfCardHeader title="Overdue by owner" subtitle="Sorted by count" />
          {owners.length === 0 ? (
            <div className="text-[12px] text-[var(--sf-ink-3)] text-center py-6">No overdue tasks</div>
          ) : (
            <div className="flex flex-col gap-2">
              {owners.map((o) => (
                <div key={o.id} className="flex items-center gap-3">
                  <div
                    className="flex-shrink-0 rounded-full inline-flex items-center justify-center"
                    style={{
                      width: 30, height: 30,
                      background: o.id === "unassigned" ? "var(--sf-panel-soft)" : "rgba(220,38,38,0.12)",
                      color: o.id === "unassigned" ? "var(--sf-ink-3)" : "var(--sf-red-dark)",
                      fontSize: 11, fontWeight: 700,
                    }}
                  >
                    {o.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">{o.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="rounded-full" style={{ width: 120, height: 5, background: "var(--sf-red-soft)" }}>
                        <div style={{ width: `${(o.count / maxOwnerCount) * 100}%`, height: 5, background: "var(--sf-red)", borderRadius: 999 }} />
                      </div>
                      <span className="text-[11px] text-[var(--sf-ink-3)]">{o.daysLost}d lost</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-bold text-[var(--sf-red-dark)]" style={{ fontVariantNumeric: "tabular-nums" }}>{o.count}</div>
                    <div className="text-[9px] uppercase text-[var(--sf-ink-3)]" style={{ letterSpacing: ".05em" }}>overdue</div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-md text-[11px] font-semibold"
                    style={{ border: "1px solid var(--sf-border)", color: "var(--sf-ink-2)" }}
                  >
                    Nudge
                  </button>
                </div>
              ))}
            </div>
          )}
        </SfCard>
        <SfCard>
          <SfCardHeader title="Pattern · where they originate" />
          {patternRows.length === 0 ? (
            <div className="text-[12px] text-[var(--sf-ink-3)] text-center py-6">No overdue tasks</div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {patternRows.map((r) => {
                  const m = LINKED_META[r.kind]
                  const I = m.icon
                  return (
                    <div key={r.kind} className="flex items-center gap-2">
                      <I size={14} style={{ color: m.c }} />
                      <span className="text-[12px] text-[var(--sf-ink-2)] flex-1">{m.label}s</span>
                      <span className="text-[12px] font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                      <span className="text-[11px] text-[var(--sf-ink-3)]" style={{ fontVariantNumeric: "tabular-nums" }}>{r.pct.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
              <div
                className="mt-3 p-2.5 rounded-md text-[11.5px] flex items-start gap-2"
                style={{ background: "var(--sf-amber-soft)", color: "var(--sf-amber-dark)" }}
              >
                <Sparkles size={12} className="mt-0.5 flex-shrink-0" />
                <div>
                  <b>Pattern detected:</b> overdue tasks all live on leads. Consider an automated lead-task nudge after 3 days.
                </div>
              </div>
            </>
          )}
        </SfCard>
      </div>

      {/* Days-late list */}
      <SfCard padding={false}>
        <div className="flex items-center gap-2" style={{ padding: "10px 16px", background: "var(--sf-panel-alt)", borderBottom: "1px solid var(--sf-border-soft)" }}>
          <span className="flex-1 text-[11.5px] font-bold uppercase text-[var(--sf-ink-2)]" style={{ letterSpacing: ".05em" }}>
            Overdue list
          </span>
          <SfButton variant="ghost" size="sm">Snooze 1d</SfButton>
          <SfButton variant="ghost" size="sm">Reassign</SfButton>
          <SfButton variant="dark" size="sm" icon={Check}>Mark resolved</SfButton>
        </div>
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">No overdue tasks. Nice work.</div>
        ) : (
          sorted.map((t) => {
            const dl = daysLate(t)
            const severe = dl >= 3
            return (
              <div key={t.id} className="flex items-stretch" style={{ borderBottom: "1px solid var(--sf-border-soft)" }}>
                <div
                  className="flex-shrink-0 flex flex-col items-center justify-center"
                  style={{
                    width: 44,
                    background: severe ? "var(--sf-red-soft)" : "var(--sf-amber-soft)",
                    borderRight: severe ? "1px solid rgba(239,68,68,0.33)" : "1px solid rgba(217,119,6,0.33)",
                  }}
                >
                  <div className="text-[18px] font-bold" style={{ color: severe ? "var(--sf-red-dark)" : "var(--sf-amber-dark)", fontVariantNumeric: "tabular-nums" }}>
                    {dl}
                  </div>
                  <div className="text-[8.5px] uppercase font-bold" style={{ color: severe ? "var(--sf-red-dark)" : "var(--sf-amber-dark)", letterSpacing: ".05em" }}>
                    DAYS
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <TaskRow task={t} onToggle={onToggle} onOpen={onOpen} />
                </div>
              </div>
            )
          })
        )}
      </SfCard>
    </div>
  )
}

// ── 4. All open ───────────────────────────────────────────────────────────
const TasksAllOpenView = ({ open, onToggle, onOpen }) => {
  const [groupBy, setGroupBy] = useState("none")
  const [selected, setSelected] = useState(new Set())
  const [search, setSearch] = useState("")

  const filtered = open.filter((t) => !search || (t.title || "").toLowerCase().includes(search.toLowerCase()))

  const groups = useMemo(() => {
    if (groupBy === "priority") {
      const order = ["high", "med", "low"]
      const m = {}
      filtered.forEach((t) => {
        const k = (t.priority || "low").toLowerCase()
        const norm = k === "medium" ? "med" : k
        if (!m[norm]) m[norm] = []
        m[norm].push(t)
      })
      return order.filter((k) => m[k]).map((k) => ({ key: k, label: k.toUpperCase(), color: PRIORITY_META[k].fg, items: m[k] }))
    }
    if (groupBy === "owner") {
      const m = {}
      filtered.forEach((t) => {
        const k = ownerName(t) || "Unassigned"
        if (!m[k]) m[k] = []
        m[k].push(t)
      })
      return Object.entries(m).map(([k, items]) => ({ key: k, label: k, color: "var(--sf-blue-dark)", items }))
    }
    if (groupBy === "source") {
      const m = {}
      filtered.forEach((t) => {
        const k = t.linkedKind || "lead"
        if (!m[k]) m[k] = []
        m[k].push(t)
      })
      return Object.entries(m).map(([k, items]) => ({ key: k, label: LINKED_META[k]?.label || k, color: LINKED_META[k]?.c, items }))
    }
    return [{ key: "all", label: "All tasks", color: "var(--sf-ink-2)", items: filtered }]
  }, [filtered, groupBy])

  const highPrio = open.filter((t) => (t.priority || "").toLowerCase() === "high").length
  const overdueN = open.filter(isOverdueTask).length
  const todayN   = open.filter(isTodayTask).length
  const unassigned = open.filter((t) => !t.assigned_to).length
  const autoCreated = 0 // we don't track this

  const toggleSelect = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <SfKPI label="All open"      value={open.length}   sub="across statuses" accent="var(--sf-blue)" />
        <SfKPI label="High priority" value={highPrio}      sub="needs focus"     accent="var(--sf-red-dark)" />
        <SfKPI label="Overdue"       value={overdueN}      sub="past due"        accent="var(--sf-red)" />
        <SfKPI label="Due today"     value={todayN}        sub="today only"      accent="var(--sf-purple)" />
        <SfKPI label="Unassigned"    value={unassigned}    sub="needs owner"     accent="var(--sf-amber)" />
        <SfKPI label="Auto-created"  value={autoCreated}   sub="needs tracking"  accent="var(--sf-ink)" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-shrink-0" style={{ width: 280 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
            className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue)] text-[var(--sf-ink)]"
          />
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sf-ink-3)] pointer-events-none" />
        </div>
        <SfFilterChip>Priority</SfFilterChip>
        <SfFilterChip>Owner</SfFilterChip>
        <SfFilterChip>Source</SfFilterChip>
        <SfFilterChip>Auto-created</SfFilterChip>
        <div className="flex-1" />
        <div
          className="inline-flex items-center rounded-[8px] p-[3px]"
          style={{ background: "var(--sf-panel-soft)", border: "1px solid var(--sf-border-soft)" }}
        >
          {[
            { id: "none",     label: "None" },
            { id: "priority", label: "Priority" },
            { id: "owner",    label: "Owner" },
            { id: "source",   label: "Source" },
          ].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupBy(g.id)}
              className="px-3 py-1 text-[12px] font-semibold rounded-[6px] transition-colors"
              style={{
                background: groupBy === g.id ? "var(--sf-ink)" : "transparent",
                color: groupBy === g.id ? "#fff" : "var(--sf-ink-2)",
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="inline-flex items-center gap-3 px-3 py-1.5 rounded-md mb-3"
          style={{ background: "var(--sf-blue-soft)", border: "1px solid rgba(37,99,235,0.33)" }}
        >
          <span className="text-[12px] font-semibold text-[var(--sf-blue-dark)]">✓ {selected.size} selected</span>
          <button className="text-[12px] text-[var(--sf-blue-dark)] hover:underline">Assign owner</button>
          <button className="text-[12px] text-[var(--sf-blue-dark)] hover:underline">Reschedule</button>
          <button className="text-[12px] text-[var(--sf-blue-dark)] hover:underline">Change priority</button>
          <button className="text-[12px] text-[var(--sf-blue-dark)] hover:underline">Mark done</button>
          <button className="text-[12px] text-red-600 hover:underline font-semibold">Delete</button>
          <button onClick={() => setSelected(new Set())} className="text-[11px] text-[var(--sf-ink-3)] hover:underline">Clear</button>
        </div>
      )}

      {groups.map((g) => (
        <SfCard key={g.key} padding={false} className="mb-3">
          <div
            className="flex items-center gap-2"
            style={{ padding: "10px 16px", background: "var(--sf-panel-alt)", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
            <span className="flex-1 text-[11.5px] font-bold uppercase" style={{ color: g.color, letterSpacing: ".05em" }}>
              {g.label}
            </span>
            <span className="text-[11px] font-bold text-[var(--sf-ink-2)]">{g.items.length}</span>
          </div>
          {g.items.map((t) => (
            <div
              key={t.id}
              className="flex items-center"
              style={{ background: selected.has(t.id) ? "rgba(37,99,235,0.06)" : "transparent" }}
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggleSelect(t.id)}
                className="ml-3"
              />
              <div className="flex-1 min-w-0">
                <TaskRow task={t} onToggle={onToggle} onOpen={onOpen} compact />
              </div>
            </div>
          ))}
        </SfCard>
      ))}

      {filtered.length === 0 && (
        <SfCard className="text-center" style={{ padding: "48px 24px" }}>
          <Filter size={28} className="mx-auto mb-3 text-[var(--sf-ink-3)]" />
          <div className="text-[14px] font-semibold text-[var(--sf-ink)] mb-1">
            {search ? "No matches" : "No open tasks"}
          </div>
          <div className="text-[12px] text-[var(--sf-ink-3)]">
            {search ? "Try a different search term." : "All caught up across all teams."}
          </div>
        </SfCard>
      )}
    </div>
  )
}

// ── 5. Done ────────────────────────────────────────────────────────────────
const TasksDoneView = ({ done, onToggle, onOpen }) => {
  // Heatmap: last 5 weeks × 6 weekdays (Mon-Sat)
  const today = new Date()
  const startOfWeek = (d) => {
    const out = new Date(d)
    const day = (out.getDay() + 6) % 7
    out.setDate(out.getDate() - day)
    out.setHours(0, 0, 0, 0)
    return out
  }
  const thisMonday = startOfWeek(today)
  const weeks = []
  for (let w = 4; w >= 0; w--) {
    const monday = new Date(thisMonday)
    monday.setDate(thisMonday.getDate() - w * 7)
    const row = []
    for (let d = 0; d < 6; d++) {
      const day = new Date(monday)
      day.setDate(monday.getDate() + d)
      const next = new Date(day)
      next.setDate(day.getDate() + 1)
      const count = done.filter((t) => {
        const cd = t.completed_at || t.updated_at
        if (!cd) return false
        const dd = new Date(cd)
        return dd >= day && dd < next
      }).length
      row.push({ day, count })
    }
    weeks.push(row)
  }
  const allCounts = weeks.flat().map((c) => c.count)
  const intensity = (c) => {
    if (c === 0) return 0
    if (c <= 1) return 1
    if (c <= 3) return 2
    if (c <= 5) return 3
    return 4
  }
  const intensityBg = ["var(--sf-panel-soft)", "#BBE5C8", "#86D3A2", "#52BC7C", "var(--sf-green-dark)"]
  const intensityFg = ["var(--sf-ink-3)", "var(--sf-green-dark)", "var(--sf-green-dark)", "#fff", "#fff"]

  // Throughput
  const sumLast30 = done.filter((t) => {
    const cd = t.completed_at || t.updated_at
    if (!cd) return false
    return (Date.now() - new Date(cd).getTime()) <= 30 * 24 * 60 * 60 * 1000
  }).length
  const perDay = (sumLast30 / 30).toFixed(1)

  // By type
  const byType = {}
  done.forEach((t) => {
    const k = guessType(t.title)
    byType[k] = (byType[k] || 0) + 1
  })
  const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const maxTypeCount = Math.max(1, ...typeRows.map(([, c]) => c))
  const topType = typeRows[0]?.[0]

  // Top closer
  const byOwner = {}
  done.forEach((t) => {
    const n = ownerName(t) || "Unassigned"
    byOwner[n] = (byOwner[n] || 0) + 1
  })
  const topCloser = Object.entries(byOwner).sort((a, b) => b[1] - a[1])[0]

  const recent = [...done]
    .sort((a, b) => {
      const ad = new Date(a.completed_at || a.updated_at || 0).getTime()
      const bd = new Date(b.completed_at || b.updated_at || 0).getTime()
      return bd - ad
    })
    .slice(0, 25)

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <SfKPI label="Done · last 30d" value={sumLast30}    sub="completed"        accent="var(--sf-green-dark)" />
        <SfKPI label="Throughput"      value={`${perDay}/d`} sub="rolling avg"     accent="var(--sf-blue)" />
        <SfKPI label="Avg time to close" value="—"            sub="needs history"   accent="var(--sf-ink)" />
        <SfKPI label="Completion rate"  value="—"             sub="needs history"   accent="var(--sf-purple)" />
        <SfKPI label="Top type"         value={topType ? TASK_TYPE_META[topType].label : "—"} sub={topType ? `${byType[topType]} closed` : ""} accent="var(--sf-amber)" mono={false} />
        <SfKPI label="Top closer"       value={topCloser ? topCloser[0].split(" ")[0] : "—"}   sub={topCloser ? `${topCloser[1]} closed` : ""} accent="var(--sf-teal)" mono={false} />
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mb-4">
        <SfCard padding={false} className="xl:col-span-2">
          <div className="flex items-center gap-2" style={{ padding: "10px 16px", borderBottom: "1px solid var(--sf-border-soft)" }}>
            <TrendingUp size={14} className="text-[var(--sf-ink-3)]" />
            <div className="flex-1 text-[13px] font-bold text-[var(--sf-ink)]">Completion heatmap</div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--sf-ink-3)]">
              Less
              {intensityBg.map((bg, i) => (
                <span key={i} className="inline-block rounded-sm" style={{ width: 10, height: 10, background: bg, border: "1px solid var(--sf-border-soft)" }} />
              ))}
              More
            </div>
          </div>
          <div className="p-3">
            <div className="grid" style={{ gridTemplateColumns: "30px repeat(6, 1fr) 30px", gap: 4 }}>
              <div />
              {["Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-center text-[9px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: ".05em" }}>{d}</div>
              ))}
              <div />
              {weeks.map((row, wIdx) => (
                <Fragment key={wIdx}>
                  <div className="text-right text-[9px] text-[var(--sf-ink-3)]" style={{ fontFamily: "var(--sf-font-mono, ui-monospace, monospace)" }}>
                    W{5 - wIdx}
                  </div>
                  {row.map((cell, dIdx) => {
                    const lvl = intensity(cell.count)
                    return (
                      <div
                        key={dIdx}
                        className="inline-flex items-center justify-center"
                        style={{
                          aspectRatio: "1.4 / 1",
                          minHeight: 32,
                          background: intensityBg[lvl],
                          color: intensityFg[lvl],
                          border: "1px solid var(--sf-border-soft)",
                          borderRadius: 4,
                          fontSize: 11, fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {cell.count > 0 ? cell.count : ""}
                      </div>
                    )
                  })}
                  <div />
                </Fragment>
              ))}
            </div>
          </div>
        </SfCard>
        <SfCard>
          <SfCardHeader title="Completed by type" />
          {typeRows.length === 0 ? (
            <div className="text-[12px] text-[var(--sf-ink-3)] text-center py-6">No completions yet</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {typeRows.map(([k, count]) => {
                const m = TASK_TYPE_META[k]
                const I = m.icon
                return (
                  <div key={k}>
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-md"
                        style={{ width: 24, height: 24, background: m.bg, color: m.c }}
                      >
                        <I size={12} />
                      </div>
                      <span className="text-[12px] text-[var(--sf-ink-2)] flex-1">{m.label}</span>
                      <span className="text-[12.5px] font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 5, background: "var(--sf-panel-soft)" }}>
                      <div style={{ width: `${(count / maxTypeCount) * 100}%`, height: 5, background: m.c }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SfCard>
      </div>

      <SfCard padding={false}>
        <div className="flex items-center gap-2" style={{ padding: "10px 16px", borderBottom: "1px solid var(--sf-border-soft)" }}>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-[var(--sf-ink)]">Recently completed</div>
            <div className="text-[11px] text-[var(--sf-ink-3)]">last {recent.length} task{recent.length === 1 ? "" : "s"}</div>
          </div>
          <SfFilterChip>All owners</SfFilterChip>
          <SfFilterChip>All types</SfFilterChip>
          <SfButton variant="ghost" size="sm" icon={Download}>Export log</SfButton>
        </div>
        {recent.length === 0 ? (
          <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">No completions yet.</div>
        ) : (
          recent.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onOpen={onOpen} />)
        )}
      </SfCard>
    </div>
  )
}

// React 16+ Fragment shim (named import alternative)
const Fragment = ({ children }) => <>{children}</>

export default TasksPage
