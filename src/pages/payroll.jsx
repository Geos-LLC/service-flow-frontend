"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  ChevronLeft, Calendar, DollarSign, Clock, Users, Download, Filter,
  AlertCircle, ChevronDown, ChevronRight, Plus, Minus, CreditCard,
  Check, X, ArrowUpDown, BookOpen, Banknote, ClipboardCopy, Pencil, Trash2, FileText,
  ArrowLeft,
} from "lucide-react"
import { payrollAPI, ledgerAPI, teamAPI } from "../services/api"
import api from "../services/api"
import { useAuth } from "../context/AuthContext"
import MobileHeader from "../components/mobile-header"
import PaystubsTab from "../components/paystubs-tab"
import { SimplePayView, SimpleHistoryView } from "../components/payroll-simple-view"
import {
  SfCard,
  SfCardHeader,
  SfButton,
  SfPageHeader,
  SfTab,
  SfKPI,
  SfFilterChip,
} from "../components/sf-primitives"

// Inline editable cell with pen icon → input + save/cancel
const EditableCell = ({ value, onSave, format = 'number', placeholder = '-' }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const display = format === 'hours'
    ? (value > 0 ? parseFloat(value.toFixed(1)) : '0')
    : (value > 0 ? `$${value.toFixed(0)}` : placeholder)

  const startEdit = (e) => {
    e.stopPropagation()
    setDraft(value > 0 ? (format === 'hours' ? parseFloat(value.toFixed(1)) : value.toFixed(0)) : '')
    setEditing(true)
  }
  const cancel = (e) => { e.stopPropagation(); setEditing(false) }
  const save = async (e) => {
    e.stopPropagation()
    const val = parseFloat(draft) || 0
    if (val === (value || 0)) { setEditing(false); return }
    setSaving(true)
    try { await onSave(val); } catch (err) { console.error('Save failed:', err) }
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
        <input
          type="text" inputMode="decimal" autoFocus
          className="w-12 text-right bg-white border border-[var(--sf-text-active)] rounded px-1 py-0 text-xs focus:outline-none"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(e); if (e.key === 'Escape') cancel(e) }}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="p-0.5 text-green-600 hover:text-green-800"><Check size={12} /></button>
        <button onClick={cancel} className="p-0.5 text-red-500 hover:text-red-700"><X size={12} /></button>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 group">
      <span>{display}</span>
      <Pencil size={10} className="text-[var(--sf-ink-3)] opacity-0 group-hover:opacity-100 cursor-pointer" onClick={startEdit} />
    </span>
  )
}

const toLocalDateString = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const TYPE_LABELS = {
  earning: 'Earning',
  tip: 'Tip',
  incentive: 'Incentive',
  cash_collected: 'Cash Collected',
  cash_to_company: 'Cash to Company',
  adjustment: 'Adjustment',
  payout: 'Payout'
}

const TYPE_COLORS = {
  earning: 'bg-green-100 text-green-800',
  tip: 'bg-blue-100 text-blue-800',
  incentive: 'bg-purple-100 text-purple-800',
  cash_collected: 'bg-orange-100 text-orange-800',
  cash_to_company: 'bg-cyan-100 text-cyan-800',
  adjustment: 'bg-yellow-100 text-yellow-800',
  payout: 'bg-[var(--sf-bg-page)] text-[var(--sf-ink)]'
}

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatShortDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const QUICK_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_period', label: 'This Pay Period' },
  { id: 'last_period', label: 'Last Pay Period' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'all_time', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
]

// payoutFrequency: 'daily'|'weekly'|'biweekly'|'manual', startDay: 0-6 (day of week, 0=Sun, 1=Mon)
const getQuickRange = (rangeId, payoutFrequency, startDay = 1) => {
  const now = new Date()
  const today = toLocalDateString(now)
  const dow = now.getDay() // 0=Sun

  // Helper: get most recent occurrence of a day-of-week on or before today
  const lastOccurrence = (dayOfWeek) => {
    const d = new Date(now)
    const diff = (dow - dayOfWeek + 7) % 7
    d.setDate(d.getDate() - diff)
    return d
  }

  switch (rangeId) {
    case 'today':
      return { start: today, end: today }
    case 'this_week': {
      const d = lastOccurrence(startDay)
      return { start: toLocalDateString(d), end: today }
    }
    case 'this_period': {
      if (payoutFrequency === 'daily') {
        return { start: today, end: today }
      } else if (payoutFrequency === 'weekly') {
        const d = lastOccurrence(startDay)
        const endD = new Date(d); endD.setDate(endD.getDate() + 6)
        return { start: toLocalDateString(d), end: toLocalDateString(endD) }
      } else if (payoutFrequency === 'biweekly') {
        const d = lastOccurrence(startDay)
        const daysAgo = Math.floor((now - d) / (1000 * 60 * 60 * 24))
        if (daysAgo >= 7) {
          d.setDate(d.getDate() - 7)
        }
        const endD = new Date(d); endD.setDate(endD.getDate() + 13)
        return { start: toLocalDateString(d), end: toLocalDateString(endD) }
      } else {
        // manual / monthly — use 1st to last day of month
        const d = new Date(now); d.setDate(1)
        const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        return { start: toLocalDateString(d), end: toLocalDateString(endD) }
      }
    }
    case 'last_period': {
      if (payoutFrequency === 'daily') {
        const d = new Date(now); d.setDate(d.getDate() - 1)
        const yesterday = toLocalDateString(d)
        return { start: yesterday, end: yesterday }
      } else if (payoutFrequency === 'weekly') {
        const thisStart = lastOccurrence(startDay)
        const prevEnd = new Date(thisStart); prevEnd.setDate(prevEnd.getDate() - 1)
        const prevStart = new Date(thisStart); prevStart.setDate(prevStart.getDate() - 7)
        return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) }
      } else if (payoutFrequency === 'biweekly') {
        const thisStart = lastOccurrence(startDay)
        const daysAgo = Math.floor((now - thisStart) / (1000 * 60 * 60 * 24))
        const periodStart = new Date(thisStart)
        if (daysAgo >= 7) periodStart.setDate(periodStart.getDate() - 7)
        const prevEnd = new Date(periodStart); prevEnd.setDate(prevEnd.getDate() - 1)
        const prevStart = new Date(periodStart); prevStart.setDate(prevStart.getDate() - 14)
        return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) }
      } else {
        // manual / monthly
        const d = new Date(now); d.setMonth(d.getMonth() - 1); d.setDate(1)
        const end = new Date(now.getFullYear(), now.getMonth(), 0)
        return { start: toLocalDateString(d), end: toLocalDateString(end) }
      }
    }
    case 'this_month': {
      const d = new Date(now); d.setDate(1)
      const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start: toLocalDateString(d), end: toLocalDateString(endD) }
    }
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1) // 1st of prev month
      const endD = new Date(now.getFullYear(), now.getMonth(), 0) // last day of prev month
      return { start: toLocalDateString(d), end: toLocalDateString(endD) }
    }
    case 'last_year': {
      const d = new Date(now.getFullYear() - 1, 0, 1)
      const endD = new Date(now.getFullYear() - 1, 11, 31)
      return { start: toLocalDateString(d), end: toLocalDateString(endD) }
    }
    case 'all_time':
      return { start: '', end: '' }
    default:
      return null
  }
}

const QuickTimeFilter = ({ activeRange, onSelect, startDate, endDate, onStartChange, onEndChange, onApply, payoutFrequency = 'manual', payoutStartDay = 1 }) => (
  <div className="flex flex-wrap items-center gap-2">
    {QUICK_RANGES.map(r => (
      <button
        key={r.id}
        onClick={() => {
          if (r.id === 'custom') {
            // If dates are empty (e.g. from All Time), initialize to this month
            if (!startDate) {
              const d = new Date(); d.setDate(1)
              onStartChange(toLocalDateString(d))
            }
            if (!endDate) {
              onEndChange(toLocalDateString(new Date()))
            }
            onSelect('custom')
          } else {
            const range = getQuickRange(r.id, payoutFrequency, payoutStartDay)
            if (range) {
              onStartChange(range.start)
              onEndChange(range.end)
              onSelect(r.id)
              if (onApply) onApply(range.start, range.end)
            }
          }
        }}
        style={{
          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          border: activeRange === r.id ? '1.5px solid var(--sf-blue-500)' : '1.5px solid var(--sf-border-light)',
          background: activeRange === r.id ? 'var(--sf-blue-50)' : 'white',
          color: activeRange === r.id ? 'var(--sf-blue-500)' : 'var(--sf-text-secondary)',
          boxShadow: 'none',
        }}
      >
        {r.label}
      </button>
    ))}
    {activeRange === 'custom' && (
      <div className="flex items-center gap-2 ml-1">
        <input type="date" value={startDate} onChange={e => onStartChange(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs" />
        <span className="text-xs text-[var(--sf-ink-3)]">to</span>
        <input type="date" value={endDate} onChange={e => onEndChange(e.target.value)}
          className="border rounded-lg px-2 py-1 text-xs" />
      </div>
    )}
  </div>
)

// Empty-state card for placeholder tabs (Drafts / Time tracking /
// Tax forms). Wraps an icon tile + headline + body + primary action
// in an SfCard with consistent height.
const EmptyTab = ({ icon: Icon, title, body, cta, onCta }) => (
  <SfCard className="text-center" style={{ padding: '48px 32px' }}>
    <div
      className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl"
      style={{
        width: 64,
        height: 64,
        background: 'var(--sf-blue-soft)',
        color: 'var(--sf-blue-dark)',
      }}
    >
      {Icon && <Icon size={26} strokeWidth={1.9} />}
    </div>
    <div className="text-[16px] font-bold text-[var(--sf-ink)] mb-2" style={{ letterSpacing: '-0.01em' }}>
      {title}
    </div>
    <div className="text-[13px] text-[var(--sf-ink-2)] mx-auto mb-5" style={{ maxWidth: 520, lineHeight: 1.55 }}>
      {body}
    </div>
    {cta && onCta && (
      <SfButton variant="primary" size="md" onClick={onCta}>
        {cta}
      </SfButton>
    )}
  </SfCard>
)

// Payroll period banner — gradient hero (design pack §screens/payroll).
// Renders the date range, total to be paid, approval-status counts,
// and a 5-step progress bar. Approval status is derived from existing
// payout batches in the period: paid → Approved, pending → Pending
// review, none → On hold.
const PayrollPeriodBanner = ({
  startDate,
  endDate,
  allTime,
  totalToBePaid,
  memberCount,
  batches,
  payoutFrequency,
}) => {
  // Count members by their most recent batch status in this period
  const fmtDate = (s) => {
    if (!s) return '—'
    const d = new Date(`${s}T00:00:00`)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const periodLabel = allTime
    ? 'All-time period'
    : `${fmtDate(startDate)} – ${fmtDate(endDate)}`

  const inPeriod = (batches || []).filter((b) => {
    if (!b?.period_start) return false
    return (!startDate || b.period_start >= startDate) && (!endDate || b.period_end <= endDate)
  })
  const approved = inPeriod.filter((b) => (b.status || '').toLowerCase() === 'paid').length
  const pending = inPeriod.filter((b) => (b.status || '').toLowerCase() === 'pending').length
  const onHold = Math.max(0, (memberCount || 0) - approved - pending)

  // Steps: hours tracked / tips collected are always done if there's data;
  // reviewed/approved/paid out follow the batch counts. This mirrors the
  // design's 5-step stepper visually without forcing new workflow concepts.
  const totalMembers = memberCount || 0
  const steps = [
    { label: 'Hours tracked',  done: totalMembers > 0 },
    { label: 'Tips collected', done: totalMembers > 0 },
    { label: 'Reviewed',       done: false, active: pending > 0 || (approved > 0 && approved < totalMembers) },
    { label: 'Approved',       done: approved > 0 && approved === totalMembers, active: approved > 0 && approved < totalMembers },
    { label: 'Paid out',       done: approved === totalMembers && totalMembers > 0 },
  ]

  const freqLabel = payoutFrequency && payoutFrequency !== 'manual'
    ? `${payoutFrequency.charAt(0).toUpperCase() + payoutFrequency.slice(1)} period`
    : 'Pay period'

  return (
    <div
      className="mb-6 overflow-hidden rounded-[12px]"
      style={{
        background: 'linear-gradient(135deg, var(--sf-blue) 0%, var(--sf-purple) 100%)',
        color: '#fff',
        boxShadow: 'var(--sf-shadow-m)',
        fontFamily: 'var(--sf-font-ui)',
      }}
    >
      <div className="flex items-center gap-4" style={{ padding: '18px 22px' }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'rgba(255,255,255,.18)',
          }}
        >
          <DollarSign size={22} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            {freqLabel}
          </div>
          <div
            className="mt-0.5"
            style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}
          >
            {periodLabel}
          </div>
          <div className="mt-1" style={{ fontSize: 12.5, opacity: 0.92 }}>
            <b>{approved} approved</b> · {pending} pending review · {onHold} on hold
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            Total to be paid
          </div>
          <div
            className="mt-0.5"
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatCurrency(totalToBePaid || 0)}
          </div>
        </div>
      </div>

      {/* Step bar */}
      <div
        className="flex items-center"
        style={{
          background: 'rgba(0,0,0,.14)',
          padding: '10px 22px',
          borderTop: '1px solid rgba(255,255,255,.18)',
          gap: 0,
        }}
      >
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            <div className="flex items-center" style={{ gap: 7 }}>
              <span
                className="inline-flex items-center justify-center flex-shrink-0"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: s.done || s.active ? '#fff' : 'rgba(255,255,255,.22)',
                  color: s.done || s.active ? 'var(--sf-blue)' : '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  border: s.active ? '2px solid #fff' : 'none',
                }}
              >
                {s.done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: s.done || s.active ? 700 : 500,
                  opacity: s.done || s.active ? 1 : 0.75,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-3 flex-1"
                style={{
                  height: 2,
                  background:
                    steps[i + 1].done || steps[i + 1].active
                      ? 'rgba(255,255,255,.7)'
                      : 'rgba(255,255,255,.22)',
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// History tab — full design-pack implementation per ADDON_payroll_tabs.md §2
//
// Year segmented control + filter chips, 6-KPI strip, gross-paid bar
// chart, full table with Run ID / Period / Pay date / Crew / Hours /
// Gross / Tips / Bonus / Total / Method / Status / Actions, totals row.
//
// We back the design with real cleaner_payout_batch rows. Columns where
// our schema doesn't carry the value (Hours, Tips/Bonus per batch,
// Method) render "—" so the layout still matches the spec.
// ─────────────────────────────────────────────────────────────────────────

const formatShortRunId = (id) => {
  if (id == null) return '—'
  const s = String(id)
  return `PR-${s.slice(-6).padStart(6, '0')}`
}

const HistoryBarChart = ({ data, labels, height = 130, width = 720 }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 1)
  const padL = 36
  const padR = 12
  const padT = 18
  const padB = 28
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const bw = innerW / data.length
  const barW = Math.max(8, bw * 0.62)
  const lastIdx = data.length - 1
  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {/* Gridlines */}
      {gridLines.map((g, i) => {
        const y = padT + innerH * (1 - g)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--sf-border-soft)" strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--sf-ink-3)">
              {Math.round(max * g).toLocaleString()}
            </text>
          </g>
        )
      })}
      {/* Bars */}
      {data.map((v, i) => {
        const h = (v / max) * innerH
        const x = padL + bw * i + (bw - barW) / 2
        const y = padT + innerH - h
        const isLast = i === lastIdx
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx="2" fill={isLast ? 'var(--sf-blue)' : '#BFD4F7'} />
            {v > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={isLast ? 'var(--sf-blue-dark)' : 'var(--sf-ink-2)'}>
                ${Math.round(v / 1000)}k
              </text>
            )}
            {labels[i] && (
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--sf-ink-3)">
                {labels[i]}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

const PayrollHistoryView = ({
  batches,
  teamMembers,
  historyYear,
  setHistoryYear,
  historyStatusFilter,
  setHistoryStatusFilter,
  onViewBatch,
  onCreatePayout,
}) => {
  const memberName = (id) => {
    const tm = teamMembers.find((m) => String(m.id) === String(id))
    if (!tm) return `Member #${id}`
    return `${tm.first_name || ''} ${tm.last_name || ''}`.trim() || tm.email || `Member #${id}`
  }

  const liveBatches = (batches || []).filter((b) => b.status !== 'cancelled')

  // Year buckets — collect every year present + give the user "All"
  const yearsSet = new Set()
  liveBatches.forEach((b) => {
    const d = b.period_end || b.paid_at || b.created_at
    if (d) yearsSet.add(String(d).slice(0, 4))
  })
  const now = new Date()
  yearsSet.add(String(now.getFullYear()))
  yearsSet.add(String(now.getFullYear() - 1))
  yearsSet.add(String(now.getFullYear() - 2))
  const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a)).slice(0, 3)

  // Year filter
  const inYear = (b) => {
    if (historyYear === 'all') return true
    const d = b.period_end || b.paid_at || b.created_at || ''
    return String(d).startsWith(historyYear)
  }
  const yearBatches = liveBatches.filter(inYear)

  // Status filter
  const filteredBatches = historyStatusFilter === 'paid'
    ? yearBatches.filter((b) => b.status === 'paid')
    : yearBatches

  // Sort newest first
  const sortedBatches = [...filteredBatches].sort((a, b) => {
    const ad = a.paid_at || a.created_at || a.period_end || ''
    const bd = b.paid_at || b.created_at || b.period_end || ''
    return bd.localeCompare(ad)
  })

  // KPI rollups (year-scoped)
  const paid = yearBatches.filter((b) => b.status === 'paid')
  const pending = yearBatches.filter((b) => b.status === 'pending')
  const totalPaid = paid.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0)
  const totalPending = pending.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0)
  const avgRun = paid.length > 0 ? totalPaid / paid.length : 0
  const distinctMembers = new Set(paid.map((b) => b.team_member_id)).size

  // Chart data — group paid batches by month
  const monthBuckets = {}
  paid.forEach((b) => {
    const d = b.paid_at || b.period_end
    if (!d) return
    const key = String(d).slice(0, 7)
    monthBuckets[key] = (monthBuckets[key] || 0) + (parseFloat(b.total_amount) || 0)
  })
  const monthKeys = Object.keys(monthBuckets).sort()
  const chartData = monthKeys.map((k) => monthBuckets[k])
  const chartLabels = monthKeys.map((k) => {
    const [y, m] = k.split('-')
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
  })
  const trendDelta = (() => {
    if (chartData.length < 2) return null
    const prev = chartData[chartData.length - 2]
    const last = chartData[chartData.length - 1]
    if (!prev) return null
    return ((last - prev) / prev) * 100
  })()

  // Table totals
  const tableGross = sortedBatches.reduce((s, b) => s + (parseFloat(b.total_amount) || 0), 0)

  // Status pill meta
  const statusMeta = {
    paid:    { label: 'Paid',    fg: 'var(--sf-green-dark)', bg: 'var(--sf-green-soft)', dot: '#22C55E' },
    pending: { label: 'Pending', fg: 'var(--sf-amber-dark)', bg: 'var(--sf-amber-soft)', dot: 'var(--sf-amber)' },
  }

  return (
    <div>
      {/* Year segmented + filter chips + actions row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div
          className="inline-flex items-center rounded-[8px] p-[3px]"
          style={{ background: 'var(--sf-panel-soft)', border: '1px solid var(--sf-border-soft)' }}
        >
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setHistoryYear(y)}
              className="px-3 py-1 text-[12px] font-semibold rounded-[6px] transition-colors"
              style={{
                background: historyYear === y ? 'var(--sf-ink)' : 'transparent',
                color: historyYear === y ? '#fff' : 'var(--sf-ink-2)',
              }}
            >
              {y}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHistoryYear('all')}
            className="px-3 py-1 text-[12px] font-semibold rounded-[6px] transition-colors"
            style={{
              background: historyYear === 'all' ? 'var(--sf-ink)' : 'transparent',
              color: historyYear === 'all' ? '#fff' : 'var(--sf-ink-2)',
            }}
          >
            All
          </button>
        </div>
        <SfFilterChip
          active={historyStatusFilter === 'all'}
          onClick={() => setHistoryStatusFilter('all')}
        >
          All periods
        </SfFilterChip>
        <SfFilterChip
          active={historyStatusFilter === 'paid'}
          onClick={() => setHistoryStatusFilter('paid')}
        >
          Paid only
        </SfFilterChip>
        <div className="flex-1" />
        <SfButton variant="secondary" size="sm" icon={FileText} disabled>
          Year-end summary
        </SfButton>
        <SfButton variant="secondary" size="sm" icon={ArrowUpDown} disabled>
          Reconcile
        </SfButton>
      </div>

      {/* 6-KPI strip — YTD scope */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <SfKPI
          label={historyYear === 'all' ? 'Total paid' : `${historyYear} paid`}
          value={formatCurrency(totalPaid)}
          sub={`${paid.length} run${paid.length === 1 ? '' : 's'}`}
          accent="var(--sf-green-dark)"
          delta={trendDelta != null ? `${trendDelta >= 0 ? '+' : ''}${trendDelta.toFixed(1)}%` : undefined}
          deltaPos={trendDelta != null ? trendDelta >= 0 : undefined}
        />
        <SfKPI label="Pending"      value={formatCurrency(totalPending)} sub={`${pending.length} run${pending.length === 1 ? '' : 's'}`} accent="var(--sf-amber)" />
        <SfKPI label="Members paid" value={distinctMembers}              sub="distinct cleaners" accent="var(--sf-purple)" />
        <SfKPI label="Avg run"      value={formatCurrency(avgRun)}       sub="paid only" accent="var(--sf-ink)" />
        <SfKPI label="Runs filed"   value={paid.length}                  sub={historyYear === 'all' ? 'all time' : `for ${historyYear}`} accent="var(--sf-blue)" />
        <SfKPI label="Outstanding"  value={formatCurrency(totalPending)} sub="awaiting payment" accent="var(--sf-teal)" />
      </div>

      {/* Gross-paid bar chart */}
      {chartData.length > 0 && (
        <SfCard className="mb-6">
          <div className="flex items-end gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-[var(--sf-ink)]" style={{ letterSpacing: '-0.005em' }}>
                Gross paid · {historyYear === 'all' ? 'all time' : historyYear}
              </div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                {trendDelta != null
                  ? `${trendDelta >= 0 ? 'Trending up' : 'Trending down'} ${Math.abs(trendDelta).toFixed(1)}% vs prior period`
                  : 'Monthly totals across paid runs'}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--sf-ink-3)] flex-shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: '#BFD4F7' }} />
                Prior
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: 'var(--sf-blue)' }} />
                Most recent
              </span>
            </div>
          </div>
          <HistoryBarChart data={chartData} labels={chartLabels} />
        </SfCard>
      )}

      {/* History table */}
      {sortedBatches.length === 0 ? (
        <EmptyTab
          icon={BookOpen}
          title="No runs in this period"
          body={
            historyYear === 'all'
              ? 'You haven\'t processed any payroll runs yet. Create your first payout to start building history.'
              : `No payroll runs in ${historyYear}. Try a different year or "All".`
          }
          cta="Create payout"
          onCta={onCreatePayout}
        />
      ) : (
        <div className="bg-[var(--sf-panel)] rounded-[12px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--sf-panel-alt)', borderBottom: '1px solid var(--sf-border-soft)' }}>
              <tr>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 90 }}>Run ID</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 170 }}>Period</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 110 }}>Pay date</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 60 }}>Crew</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 80 }}>Hours</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 90 }}>Gross</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 70 }}>Tips</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 70 }}>Bonus</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 95 }}>Total</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 90 }}>Method</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em', width: 110 }}>Status</th>
                <th className="px-3 py-2.5" style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedBatches.map((b) => {
                const s = statusMeta[b.status] || statusMeta.pending
                const amt = parseFloat(b.total_amount) || 0
                return (
                  <tr
                    key={b.id}
                    className="hover:bg-[var(--sf-panel-soft)] cursor-pointer"
                    style={{ borderBottom: '1px solid var(--sf-border-soft)' }}
                    onClick={() => onViewBatch(b.id)}
                  >
                    <td className="px-3 py-3 text-[12px] text-[var(--sf-ink-2)]" style={{ fontFamily: 'var(--sf-font-mono, ui-monospace, monospace)' }}>
                      {formatShortRunId(b.id)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
                        {formatDate(b.period_start)} – {formatDate(b.period_end)}
                      </div>
                      <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5 truncate" style={{ maxWidth: 160 }}>
                        {memberName(b.team_member_id)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-[var(--sf-ink-2)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {b.paid_at ? formatDate(b.paid_at) : <span className="text-[var(--sf-ink-3)]">—</span>}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-[var(--sf-ink-2)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>1</td>
                    <td className="px-3 py-3 text-[12.5px] text-[var(--sf-ink-3)] text-right">—</td>
                    <td className="px-3 py-3 text-[13px] font-semibold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(amt)}
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-[var(--sf-ink-3)] text-right">—</td>
                    <td className="px-3 py-3 text-[12.5px] text-[var(--sf-ink-3)] text-right">—</td>
                    <td
                      className="px-3 py-3 text-[14px] font-bold text-right"
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.01em',
                        color: amt < 0 ? 'var(--sf-red-dark)' : 'var(--sf-ink)',
                      }}
                    >
                      {formatCurrency(amt)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-[2px] rounded-md whitespace-nowrap"
                        style={{
                          background: 'var(--sf-panel-soft)',
                          color: 'var(--sf-ink-2)',
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid var(--sf-border-soft)',
                          fontFamily: 'var(--sf-font-mono, ui-monospace, monospace)',
                        }}
                      >
                        <CreditCard size={10} />
                        ACH
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md whitespace-nowrap"
                        style={{
                          background: s.bg,
                          color: s.fg,
                          fontSize: 11,
                          fontWeight: 600,
                          border: `1px solid ${s.dot}25`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-[var(--sf-ink-3)] hover:bg-[var(--sf-panel-soft)] hover:text-[var(--sf-ink-2)]"
                        onClick={(e) => { e.stopPropagation(); onViewBatch(b.id) }}
                        title="View / download"
                      >
                        <Download size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ background: 'var(--sf-panel-alt)', borderTop: '1px solid var(--sf-border-soft)' }}>
              <tr>
                <td colSpan="3" className="px-3 py-3 text-[11.5px] font-bold uppercase text-[var(--sf-ink-2)]" style={{ letterSpacing: '.04em' }}>
                  {sortedBatches.length} run{sortedBatches.length === 1 ? '' : 's'} · Totals
                </td>
                <td className="px-3 py-3 text-[12.5px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{sortedBatches.length}</td>
                <td />
                <td className="px-3 py-3 text-[13px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tableGross)}</td>
                <td />
                <td />
                <td className="px-3 py-3 text-[15px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tableGross)}</td>
                <td colSpan="3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Time tracking tab — design-pack §3
//
// Week selector + 6-KPI strip + two-column grid (weekly timesheet on the
// left, exceptions inbox on the right). Real attendance data isn't yet
// stored in our schema, so per-day actual hours come from grouping
// member.jobs by scheduled_date day-of-week. Scheduled hours default to
// 8h Mon–Fri until availability data flows through.
// ─────────────────────────────────────────────────────────────────────────

const startOfWeekMonday = (d) => {
  const out = new Date(d)
  const day = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - day)
  out.setHours(0, 0, 0, 0)
  return out
}
const addDays = (d, n) => {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}
const sameYMD = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const TimeCell = ({ sched, actual, isWeekend }) => {
  if (sched === 0 && actual === 0) {
    return (
      <div
        className="flex items-center justify-center text-[10.5px] font-semibold text-[var(--sf-ink-3)]"
        style={{
          height: 46,
          borderRadius: 6,
          background: isWeekend ? 'var(--sf-panel-alt)' : 'var(--sf-panel)',
          border: '1px solid var(--sf-border-soft)',
        }}
      >
        OFF
      </div>
    )
  }
  if (sched > 0 && actual === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          height: 46,
          borderRadius: 6,
          background: 'var(--sf-red-soft)',
          border: '1px solid rgba(239,68,68,0.33)',
        }}
      >
        <div className="text-[13px] font-bold text-[var(--sf-red-dark)]" style={{ fontVariantNumeric: 'tabular-nums' }}>—</div>
        <div className="text-[9px] text-[var(--sf-red-dark)] opacity-70">missed</div>
      </div>
    )
  }
  if (actual > 8) {
    const ot = actual - 8
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          height: 46,
          borderRadius: 6,
          background: 'var(--sf-amber-soft)',
          border: '1px solid rgba(217,119,6,0.22)',
        }}
      >
        <div className="text-[13px] font-bold text-[var(--sf-amber-dark)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{actual.toFixed(1)}h</div>
        <div className="text-[9px] text-[var(--sf-amber-dark)] opacity-80" style={{ fontVariantNumeric: 'tabular-nums' }}>+{ot.toFixed(1)} ot</div>
      </div>
    )
  }
  if (actual >= sched && sched > 0) {
    const extra = actual - sched
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{
          height: 46,
          borderRadius: 6,
          background: 'var(--sf-green-soft)',
          border: '1px solid rgba(22,163,74,0.22)',
        }}
      >
        <div className="text-[13px] font-bold text-[var(--sf-green-dark)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{actual.toFixed(1)}h</div>
        <div className="text-[9px] text-[var(--sf-green-dark)] opacity-80">{extra > 0.05 ? `+${extra.toFixed(1)}` : 'on plan'}</div>
      </div>
    )
  }
  // Under
  const delta = actual - sched
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        height: 46,
        borderRadius: 6,
        background: 'var(--sf-blue-soft)',
        border: '1px solid rgba(37,99,235,0.22)',
      }}
    >
      <div className="text-[13px] font-bold text-[var(--sf-blue-dark)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{actual.toFixed(1)}h</div>
      <div className="text-[9px] text-[var(--sf-blue-dark)] opacity-80" style={{ fontVariantNumeric: 'tabular-nums' }}>{delta.toFixed(1)}</div>
    </div>
  )
}

const PayrollTimeView = ({
  payrollData,
  weekAnchor,
  setWeekAnchor,
  showExceptionsOnly,
  setShowExceptionsOnly,
}) => {
  const monday = startOfWeekMonday(weekAnchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const weekLabel = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const sched = [8, 8, 8, 8, 8, 0, 0] // Mon-Fri 8h, weekend off (default until availability flows)

  // Per-cleaner per-day rollup. We derive actual from completed jobs in
  // member.jobs; if the payroll fetch hasn't loaded yet, all cells are 0.
  const rows = (payrollData?.teamMembers || [])
    .filter((m) => !m.isManagerOrOwner) // workers only — design's "cleaners" framing
    .map((m) => {
      const dailyActual = [0, 0, 0, 0, 0, 0, 0]
      ;(m.jobs || []).forEach((j) => {
        const raw = j.scheduledDate
        if (!raw) return
        const jd = new Date(String(raw).includes('T') ? raw : String(raw).replace(' ', 'T'))
        if (Number.isNaN(jd.getTime())) return
        for (let i = 0; i < 7; i++) {
          if (sameYMD(jd, days[i])) {
            dailyActual[i] += parseFloat(j.hours || 0) || 0
            break
          }
        }
      })
      const total = dailyActual.reduce((s, v) => s + v, 0)
      const planned = sched.reduce((s, v) => s + v, 0)
      // Exception flags per day
      const exceptions = []
      for (let i = 0; i < 7; i++) {
        if (dailyActual[i] > 8) exceptions.push({ kind: 'Overtime', dayIdx: i, value: dailyActual[i] - 8 })
        else if (sched[i] > 0 && dailyActual[i] === 0) exceptions.push({ kind: 'Missed punch', dayIdx: i, value: sched[i] })
      }
      return { member: m, dailyActual, total, planned, exceptions }
    })

  const filteredRows = showExceptionsOnly ? rows.filter((r) => r.exceptions.length > 0) : rows

  // KPIs
  const hoursClocked = rows.reduce((s, r) => s + r.total, 0)
  const totalScheduled = rows.reduce((s, r) => s + r.planned, 0)
  const schedMatchPct = totalScheduled > 0 ? Math.min(100, (hoursClocked / totalScheduled) * 100) : 0
  const totalOT = rows.reduce(
    (s, r) => s + r.dailyActual.reduce((a, v) => a + (v > 8 ? v - 8 : 0), 0),
    0,
  )
  const totalMissed = rows.reduce(
    (s, r) => s + r.exceptions.filter((e) => e.kind === 'Missed punch').length,
    0,
  )
  const avgShift = (() => {
    const allDays = rows.flatMap((r) => r.dailyActual.filter((v) => v > 0))
    if (allDays.length === 0) return 0
    return allDays.reduce((s, v) => s + v, 0) / allDays.length
  })()

  // Daily column totals + grand total
  const colTotals = [0, 0, 0, 0, 0, 0, 0]
  rows.forEach((r) => r.dailyActual.forEach((v, i) => { colTotals[i] += v }))
  const grandTotal = colTotals.reduce((s, v) => s + v, 0)

  // Exceptions inbox flattened — one row per exception
  const exceptionsList = rows.flatMap((r) =>
    r.exceptions.map((e) => ({
      who: `${r.member.teamMember.first_name || ''} ${r.member.teamMember.last_name || ''}`.trim() || r.member.teamMember.email || 'Cleaner',
      initials: ((r.member.teamMember.first_name || '?')[0] + (r.member.teamMember.last_name || '?')[0]).toUpperCase(),
      day: days[e.dayIdx].toLocaleDateString('en-US', { weekday: 'short' }),
      kind: e.kind,
      detail:
        e.kind === 'Overtime'
          ? `Clocked +${e.value.toFixed(1)}h over the 8h daily cap on ${days[e.dayIdx].toLocaleDateString('en-US', { weekday: 'long' })}.`
          : `${e.value.toFixed(1)}h scheduled but no jobs marked completed.`,
    })),
  )

  const exceptionMeta = {
    Overtime:       { fg: 'var(--sf-amber-dark)', bg: 'var(--sf-amber-soft)', icon: AlertCircle },
    'Missed punch': { fg: 'var(--sf-red-dark)',   bg: 'var(--sf-red-soft)',   icon: Clock },
  }

  return (
    <div>
      {/* Week selector + filter chips + actions */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekAnchor(addDays(monday, -7))}
            className="p-2 rounded-md hover:bg-[var(--sf-panel-soft)] text-[var(--sf-ink-2)]"
            title="Previous week"
          >
            <ChevronLeft size={14} />
          </button>
          <div
            className="inline-flex items-center px-3 py-1.5 rounded-[8px]"
            style={{
              background: 'var(--sf-panel-soft)',
              border: '1px solid var(--sf-border-soft)',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--sf-ink)',
            }}
          >
            Week of {weekLabel}
          </div>
          <button
            type="button"
            onClick={() => setWeekAnchor(addDays(monday, 7))}
            className="p-2 rounded-md hover:bg-[var(--sf-panel-soft)] text-[var(--sf-ink-2)]"
            title="Next week"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <SfFilterChip active>All teams</SfFilterChip>
        <SfFilterChip
          icon={AlertCircle}
          count={exceptionsList.length}
          active={showExceptionsOnly}
          onClick={() => setShowExceptionsOnly(!showExceptionsOnly)}
        >
          Exceptions
        </SfFilterChip>
        <div className="flex-1" />
        <SfButton variant="secondary" size="sm" icon={Download} disabled>
          Export timesheet
        </SfButton>
        <SfButton variant="secondary" size="sm" icon={Plus} disabled>
          Manual entry
        </SfButton>
        <SfButton variant="dark" size="sm" icon={Check} disabled>
          Lock week
        </SfButton>
      </div>

      {/* 6-KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <SfKPI label="Hours clocked"  value={`${hoursClocked.toFixed(1)}h`} sub={`of ${totalScheduled.toFixed(0)}h planned`} accent="var(--sf-blue)" />
        <SfKPI label="Schedule match" value={`${schedMatchPct.toFixed(0)}%`} sub="actual ÷ planned" accent="var(--sf-green-dark)" />
        <SfKPI label="Overtime"       value={`${totalOT.toFixed(1)}h`}      sub="above 8h/day cap" accent="var(--sf-amber)" />
        <SfKPI label="Missed punches" value={totalMissed}                   sub="scheduled but no work" accent="var(--sf-red)" />
        <SfKPI label="On-time start"  value="—"                             sub="needs attendance" accent="var(--sf-purple)" />
        <SfKPI label="Avg shift"      value={`${avgShift.toFixed(1)}h`}     sub="completed jobs only" accent="var(--sf-ink)" />
      </div>

      {/* Two-column grid: timesheet (left) + exceptions inbox (right) */}
      <div className="grid xl:grid-cols-[1fr_320px] gap-4">
        {/* Weekly timesheet */}
        <SfCard padding={false}>
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: '200px repeat(7, 1fr) 90px',
              gap: 8,
              padding: '10px 14px',
              background: 'var(--sf-panel-alt)',
              borderBottom: '1px solid var(--sf-border-soft)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--sf-ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '.05em',
            }}
          >
            <div>Cleaner</div>
            {days.map((d, i) => (
              <div key={i} className="text-center">
                <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-[11px] font-bold text-[var(--sf-ink)] mt-0.5" style={{ letterSpacing: 0 }}>
                  {d.getDate()}
                </div>
              </div>
            ))}
            <div className="text-right pr-2">Total</div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              {payrollData ? 'No cleaners with hours in this week.' : 'Open the Payroll tab first to load timesheet data.'}
            </div>
          ) : (
            filteredRows.map((r) => {
              const member = r.member
              const overOT = r.total > 40
              const isExceptionRow = r.exceptions.length > 0
              return (
                <div
                  key={member.teamMember.id}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: '200px repeat(7, 1fr) 90px',
                    gap: 8,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--sf-border-soft)',
                    background: isExceptionRow && showExceptionsOnly ? 'rgba(239,68,68,0.03)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex-shrink-0 rounded-md inline-flex items-center justify-center"
                      style={{
                        width: 32,
                        height: 32,
                        background: 'var(--sf-blue-soft)',
                        color: 'var(--sf-blue-dark)',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {(member.teamMember.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">{member.teamMember.name}</div>
                      <div className="text-[10.5px] text-[var(--sf-ink-3)] truncate">
                        {member.teamMember.role || 'Cleaner'}
                      </div>
                    </div>
                  </div>
                  {days.map((_, i) => (
                    <TimeCell
                      key={i}
                      sched={sched[i]}
                      actual={r.dailyActual[i]}
                      isWeekend={i >= 5}
                    />
                  ))}
                  <div className="text-right pr-2">
                    <div className="text-[13px] font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.total.toFixed(1)}h
                    </div>
                    <div
                      className="text-[10px] mt-0.5"
                      style={{
                        color: overOT ? 'var(--sf-amber-dark)' : 'var(--sf-ink-3)',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: overOT ? 700 : 500,
                      }}
                    >
                      {overOT ? `+${(r.total - 40).toFixed(1)}h OT` : 'of 40h'}
                    </div>
                  </div>
                </div>
              )
            })
          )}

          {filteredRows.length > 0 && (
            <div
              className="grid items-center"
              style={{
                gridTemplateColumns: '200px repeat(7, 1fr) 90px',
                gap: 8,
                padding: '12px 14px',
                background: 'var(--sf-panel-alt)',
                borderTop: '1px solid var(--sf-border-soft)',
              }}
            >
              <div className="text-[11.5px] font-bold uppercase text-[var(--sf-ink-2)]" style={{ letterSpacing: '.04em' }}>
                All cleaners · {filteredRows.length}
              </div>
              {colTotals.map((v, i) => (
                <div
                  key={i}
                  className="text-center text-[12px] font-bold text-[var(--sf-ink)]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {v > 0 ? `${v.toFixed(1)}h` : '—'}
                </div>
              ))}
              <div className="text-right pr-2 text-[14px] font-bold text-[var(--sf-ink)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {grandTotal.toFixed(1)}h
              </div>
            </div>
          )}
        </SfCard>

        {/* Exceptions inbox */}
        <SfCard>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="inline-flex items-center justify-center rounded-md"
              style={{
                width: 26,
                height: 26,
                background: 'var(--sf-amber-soft)',
                color: 'var(--sf-amber-dark)',
              }}
            >
              <AlertCircle size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-bold text-[var(--sf-ink)]" style={{ letterSpacing: '-0.005em' }}>
                Exceptions
              </div>
              <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5">
                {exceptionsList.length === 0 ? 'No exceptions this week' : `${exceptionsList.length} to review`}
              </div>
            </div>
          </div>
          {exceptionsList.length === 0 ? (
            <div className="text-center py-8 text-[12px] text-[var(--sf-ink-3)]">
              Nothing flagged. Hours match plan across all cleaners.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {exceptionsList.slice(0, 8).map((ex, i) => {
                const meta = exceptionMeta[ex.kind] || exceptionMeta.Overtime
                const Icon = meta.icon
                return (
                  <div
                    key={i}
                    className="rounded-lg p-2.5"
                    style={{ border: '1px solid var(--sf-border-soft)', background: 'var(--sf-panel)' }}
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <div
                        className="flex-shrink-0 rounded-md inline-flex items-center justify-center"
                        style={{ width: 30, height: 30, background: meta.bg, color: meta.fg }}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12.5px] font-bold text-[var(--sf-ink)] truncate">{ex.who}</span>
                          <span
                            className="inline-flex items-center px-1.5 py-[1px] rounded-md"
                            style={{
                              background: meta.bg,
                              color: meta.fg,
                              fontSize: 9.5,
                              fontWeight: 700,
                              letterSpacing: '.04em',
                              textTransform: 'uppercase',
                            }}
                          >
                            {ex.kind}
                          </span>
                          <span className="text-[10.5px] text-[var(--sf-ink-3)] font-mono">{ex.day}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11.5px] text-[var(--sf-ink-2)] leading-snug mb-2">
                      {ex.detail}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] font-semibold rounded-md text-[var(--sf-ink-3)] hover:bg-[var(--sf-panel-soft)]"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-[11px] font-semibold rounded-md text-white"
                        style={{ background: 'var(--sf-ink)' }}
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                )
              })}
              {exceptionsList.length > 8 && (
                <button
                  type="button"
                  className="text-[12px] font-semibold text-[var(--sf-blue-dark)] mt-1"
                >
                  Show {exceptionsList.length - 8} more
                </button>
              )}
            </div>
          )}
        </SfCard>
      </div>
    </div>
  )
}

const Payroll = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('simple')

  // ── Payroll tab state ──
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [payrollData, setPayrollData] = useState(null)
  const [error, setError] = useState("")
  const [payrollAllTime, setPayrollAllTime] = useState(false)
  const [payrollQuickRange, setPayrollQuickRange] = useState('this_period')
  const [payrollOnlyWithEarnings, setPayrollOnlyWithEarnings] = useState(true)
  const [payrollJobFilter, setPayrollJobFilter] = useState('completed') // 'completed' or 'all'
  const [startDate, setStartDate] = useState(() => {
    const date = new Date(); date.setDate(1); return toLocalDateString(date)
  })
  const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()))
  const [selectedMemberId, setSelectedMemberId] = useState('all')
  const [memberSearch, setMemberSearch] = useState('')
  const [expandedMembers, setExpandedMembers] = useState(new Set())

  // ── Balances tab state ──
  const [balances, setBalances] = useState([])
  const [balancesTotalUniqueJobs, setBalancesTotalUniqueJobs] = useState(0)
  const [balancesLoading, setBalancesLoading] = useState(false)
  const [balancesAllTime, setBalancesAllTime] = useState(true)
  const [balancesQuickRange, setBalancesQuickRange] = useState('this_period')
  const [balancesStartDate, setBalancesStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return toLocalDateString(d)
  })
  const [balancesEndDate, setBalancesEndDate] = useState(() => toLocalDateString(new Date()))
  const [showOnlyWithEarnings, setShowOnlyWithEarnings] = useState(true)
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)
  const [backfillPreview, setBackfillPreview] = useState(null)
  const [backfillProgress, setBackfillProgress] = useState(0)
  const [backfillProcessed, setBackfillProcessed] = useState(0)
  const [backfillTotal, setBackfillTotal] = useState(0)
  const [backfillPhase, setBackfillPhase] = useState('')

  // ── Cash modal type state ──
  const [cashType, setCashType] = useState('paid_in_cash') // 'paid_in_cash' or 'cash_to_company'

  // ── Ledger entries tab state ──
  const [entries, setEntries] = useState([])
  const [entriesTotal, setEntriesTotal] = useState(0)
  const [entriesPage, setEntriesPage] = useState(1)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [filterMember, setFilterMember] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPayoutStatus, setFilterPayoutStatus] = useState('')
  const [ledgerQuickRange, setLedgerQuickRange] = useState('this_period')
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return toLocalDateString(d)
  })
  const [filterEndDate, setFilterEndDate] = useState(() => toLocalDateString(new Date()))

  // ── Payouts tab state ──
  const [payoutsQuickRange, setPayoutsQuickRange] = useState('this_period')
  const [payoutsStartDate, setPayoutsStartDate] = useState(() => { const d = new Date(); d.setDate(1); return toLocalDateString(d) })
  const [payoutsEndDate, setPayoutsEndDate] = useState(() => toLocalDateString(new Date()))
  const [batches, setBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [expandedBatch, setExpandedBatch] = useState(null)
  const [batchDetail, setBatchDetail] = useState(null)
  const [payoutsFilter, setPayoutsFilter] = useState('all') // all | paid | pending | skipped
  // History tab: year segmented control + status filter (per design pack)
  const [historyYear, setHistoryYear] = useState(String(new Date().getFullYear()))
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all') // all | paid
  // Time tracking tab: week anchor + exception filter
  const [timeWeekAnchor, setTimeWeekAnchor] = useState(() => {
    // Anchor to current week's Monday in local time
    const d = new Date()
    const day = (d.getDay() + 6) % 7 // 0=Mon ... 6=Sun
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [timeShowExceptionsOnly, setTimeShowExceptionsOnly] = useState(false)

  // ── Shared state ──
  const [teamMembers, setTeamMembers] = useState([])
  const [payoutFrequency, setPayoutFrequency] = useState('manual')
  const [payoutStartDay, setPayoutStartDay] = useState(1)

  // ── Modals ──
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [showCashModal, setShowCashModal] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  // Adjustment form
  const [adjTeamMember, setAdjTeamMember] = useState('')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjDirection, setAdjDirection] = useState('positive')
  const [adjNote, setAdjNote] = useState('')
  const [adjJobId, setAdjJobId] = useState('')

  // Payout form
  const [payTeamMember, setPayTeamMember] = useState('')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [payNote, setPayNote] = useState('')
  // When true, scheduled jobs in the period are marked completed before
  // building the batch — pay-in-advance flow. Matches the "Incl. Scheduled"
  // toggle on the Payroll preview tab.
  const [payIncludeScheduled, setPayIncludeScheduled] = useState(false)

  // Cash form
  const [cashTeamMember, setCashTeamMember] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [cashJobId, setCashJobId] = useState('')
  const [cashNote, setCashNote] = useState('')

  const [copiedPayroll, setCopiedPayroll] = useState(false)
  const [copiedBalances, setCopiedBalances] = useState(false)

  const copyPayrollTable = () => {
    if (!payrollData?.teamMembers) return
    const header = ['Name', 'Role', 'Pay Method', 'Jobs', 'Hours', 'Total', 'Hourly Salary', 'Commission', 'Tips', 'Incentives', 'Cash', 'Total Salary'].join('\t')
    const rows = (payrollData.teamMembers || []).map(m => [
      m.teamMember.name,
      m.teamMember.role || '',
      [m.teamMember.commissionPercentage ? `${m.teamMember.commissionPercentage}%` : '', m.teamMember.hourlyRate ? `$${m.teamMember.hourlyRate}/hr` : ''].filter(Boolean).join(' + ') || 'Not set',
      m.jobCount,
      m.totalHours.toFixed(1),
      (m.totalJobRevenue || 0).toFixed(2),
      (m.hourlySalary || 0).toFixed(2),
      (m.commissionSalary || 0).toFixed(2),
      (m.totalTips || 0).toFixed(2),
      (m.totalIncentives || 0).toFixed(2),
      (m.totalCashCollected || 0).toFixed(2),
      (m.totalSalary || 0).toFixed(2)
    ].join('\t'))
    navigator.clipboard.writeText([header, ...rows].join('\n'))
    setCopiedPayroll(true)
    setTimeout(() => setCopiedPayroll(false), 2000)
  }

  const copyBalancesTable = () => {
    if (!balances.length) return
    const header = ['Name', 'Role', 'Jobs', 'Balance', 'Earnings', 'Tips', 'Incentives', 'Cash Offset', 'Adjustments', 'Schedule'].join('\t')
    const rows = balances.map(b => [
      b.name || `ID ${b.team_member_id}`,
      b.role || '',
      b.job_count || 0,
      (b.current_balance || 0).toFixed(2),
      (b.unpaid_earnings || 0).toFixed(2),
      (b.unpaid_tips || 0).toFixed(2),
      (b.unpaid_incentives || 0).toFixed(2),
      (b.unpaid_cash_offsets || 0).toFixed(2),
      (b.unpaid_adjustments || 0).toFixed(2),
      b.payout_schedule || 'manual'
    ].join('\t'))
    navigator.clipboard.writeText([header, ...rows].join('\n'))
    setCopiedBalances(true)
    setTimeout(() => setCopiedBalances(false), 2000)
  }

  // ── Data fetchers ──

  const fetchPayrollData = async (overrideStart, overrideEnd) => {
    if (!user?.id) return
    try {
      if (!payrollData) setLoading(true)
      else setRefreshing(true)
      setError("")
      const s = overrideStart !== undefined ? overrideStart : startDate
      const e = overrideEnd !== undefined ? overrideEnd : endDate
      const data = await payrollAPI.getPayroll(s, e, payrollJobFilter)
      setPayrollData(data)
    } catch (err) {
      console.error('Error fetching payroll data:', err)
      setError(err.response?.data?.error || 'Failed to load payroll data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchTeamMembers = useCallback(async () => {
    if (!user?.id) return
    try {
      const data = await teamAPI.getAll(user.id, { limit: 1000 }) // all members, no status filter
      setTeamMembers(data.teamMembers || data || [])
    } catch (err) {
      console.error('Error fetching team members:', err)
    }
  }, [user?.id])

  const fetchBalances = useCallback(async (overrideStart, overrideEnd) => {
    try {
      setBalancesLoading(true)
      const params = {}
      const s = overrideStart !== undefined ? overrideStart : balancesStartDate
      const e = overrideEnd !== undefined ? overrideEnd : balancesEndDate
      if (s) params.startDate = s
      if (e) params.endDate = e
      console.log('📊 fetchBalances params:', JSON.stringify(params), 'overrides:', overrideStart, overrideEnd, 'state:', balancesStartDate, balancesEndDate)
      const data = await ledgerAPI.getBalances(params)
      console.log('📊 fetchBalances response entries:', Array.isArray(data) ? data.length : data?.balances?.length, 'total:', Array.isArray(data) ? data.reduce((s,b) => s + (b.current_balance||0), 0) : '?')
      // Handle both old format (array) and new format ({ balances, totalUniqueJobs })
      if (Array.isArray(data)) {
        setBalances(data)
        setBalancesTotalUniqueJobs(0)
      } else {
        setBalances(data.balances || [])
        setBalancesTotalUniqueJobs(data.totalUniqueJobs || 0)
      }
    } catch (err) {
      console.error('Error fetching balances:', err)
    } finally {
      setBalancesLoading(false)
    }
  }, [balancesStartDate, balancesEndDate])

  const fetchEntries = useCallback(async () => {
    try {
      setEntriesLoading(true)
      const data = await ledgerAPI.getEntries({
        teamMemberId: filterMember || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        type: filterType || undefined,
        payoutStatus: filterPayoutStatus || undefined,
        page: entriesPage,
        limit: 50
      })
      setEntries(data.entries || [])
      setEntriesTotal(data.total || 0)
    } catch (err) {
      console.error('Error fetching entries:', err)
    } finally {
      setEntriesLoading(false)
    }
  }, [filterMember, filterStartDate, filterEndDate, filterType, filterPayoutStatus, entriesPage])

  const fetchBatches = useCallback(async () => {
    try {
      setBatchesLoading(true)
      const data = await ledgerAPI.getPayoutBatches({ limit: 1000 })
      setBatches(data.batches || [])
    } catch (err) {
      console.error('Error fetching batches:', err)
    } finally {
      setBatchesLoading(false)
    }
  }, [])

  // ── Load payout settings and apply date range ──
  const loadPayoutSettings = useCallback((activeRange) => {
    if (!user?.id) return
    api.get('/user/payout-settings').then(res => {
      const d = res.data || {}
      const freq = d.payout_frequency || 'manual'
      const day = d.pay_period_start_day ?? 1
      setPayoutFrequency(freq)
      setPayoutStartDay(day)
      // Recalculate using the currently active quick range (not always 'this_period')
      const rangeId = activeRange || payrollQuickRange || 'this_period'
      if (rangeId === 'custom') { fetchPayrollData(); return }
      const range = getQuickRange(rangeId, freq, day)
      if (range) {
        setStartDate(range.start)
        setEndDate(range.end)
        setBalancesStartDate(range.start)
        setBalancesEndDate(range.end)
        setBalancesAllTime(false)
        setFilterStartDate(range.start)
        setFilterEndDate(range.end)
        setPayoutsStartDate(range.start)
        setPayoutsEndDate(range.end)
      }
      fetchPayrollData(range?.start, range?.end)
    }).catch(() => {
      fetchPayrollData()
    })
  }, [user?.id, payrollQuickRange])

  // ── Initial load ──
  useEffect(() => {
    if (user?.id) {
      fetchTeamMembers()
      loadPayoutSettings()
    }
  }, [user?.id])

  // ── Re-fetch settings when page regains focus (e.g. after changing settings) ──
  useEffect(() => {
    const onFocus = () => {
      if (!user?.id) return
      // Only update frequency/day — don't override current date range
      api.get('/user/payout-settings').then(res => {
        const d = res.data || {}
        setPayoutFrequency(d.payout_frequency || 'manual')
        setPayoutStartDay(d.pay_period_start_day ?? 1)
      }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id])

  // ── Auto-refetch when job filter changes (dates handled by loadPayoutSettings and quick range buttons) ──
  useEffect(() => {
    if (user?.id && (activeTab === 'payroll' || activeTab === 'current_period' || activeTab === 'simple') && payoutFrequency !== 'manual') {
      fetchPayrollData()
    }
  }, [payrollJobFilter])

  // Simple tab needs both payroll data + batches for status — fetch on first visit
  useEffect(() => {
    if (!user?.id) return
    if (activeTab === 'simple' || activeTab === 'simple_history') {
      if (!payrollData) fetchPayrollData()
      fetchBatches()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id])

  // Auto-refetch balances removed — onApply handles it directly

  // ── Tab-driven fetches ──
  useEffect(() => {
    if (activeTab === 'balances' && user?.id) {
      fetchBalances(balancesStartDate || undefined, balancesEndDate || undefined)
    }
  }, [activeTab, user?.id])

  useEffect(() => {
    if (activeTab === 'ledger') fetchEntries()
  }, [activeTab, fetchEntries])

  useEffect(() => {
    if (activeTab === 'payouts' || activeTab === 'history' || activeTab === 'paystubs') fetchBatches()
  }, [activeTab, fetchBatches])

  // ── Handlers ──

  const handleCreateAdjustment = async () => {
    if (!adjTeamMember || !adjAmount || !adjNote.trim()) {
      setModalError('Team member, amount, and note are required'); return
    }
    setModalLoading(true); setModalError('')
    try {
      const amount = adjDirection === 'negative' ? -Math.abs(parseFloat(adjAmount)) : Math.abs(parseFloat(adjAmount))
      const tmName = teamMembers.find(t => String(t.id) === String(adjTeamMember))
      const name = tmName ? `${tmName.first_name} ${tmName.last_name || ''}`.trim() : ''
      await ledgerAPI.createAdjustment({ teamMemberId: adjTeamMember, amount, note: adjNote, jobId: adjJobId || undefined })
      setShowAdjustmentModal(false)
      setAdjTeamMember(''); setAdjAmount(''); setAdjNote(''); setAdjJobId('')
      fetchBalances()
      if (activeTab === 'ledger') fetchEntries()
      if (activeTab === 'payouts' || activeTab === 'history') fetchBatches()
      setTimeout(() => alert(`Adjustment created: ${amount >= 0 ? '+' : ''}$${amount.toFixed(2)} for ${name}`), 200)
    } catch (err) {
      setModalError(err.response?.data?.error || 'Failed to create adjustment')
    } finally { setModalLoading(false) }
  }

  const handleRecordCash = async () => {
    if (!cashTeamMember || !cashAmount) {
      setModalError('Team member and amount are required'); return
    }
    setModalLoading(true); setModalError('')
    try {
      if (cashType === 'cash_to_company') {
        await ledgerAPI.recordCashToCompany({ teamMemberId: cashTeamMember, amount: parseFloat(cashAmount), note: cashNote || undefined, jobId: cashJobId || undefined })
      } else {
        await ledgerAPI.recordCashCollected({ teamMemberId: cashTeamMember, amount: parseFloat(cashAmount), note: cashNote || undefined, jobId: cashJobId || undefined })
      }
      setShowCashModal(false)
      setCashTeamMember(''); setCashAmount(''); setCashNote(''); setCashJobId(''); setCashType('paid_in_cash')
      if (activeTab === 'balances') fetchBalances()
      if (activeTab === 'ledger') fetchEntries()
    } catch (err) {
      setModalError(err.response?.data?.error || 'Failed to record cash')
    } finally { setModalLoading(false) }
  }

  const handleCreatePayout = async () => {
    if (!payTeamMember || !payPeriodStart || !payPeriodEnd) {
      setModalError('Team member and period dates are required'); return
    }
    setModalLoading(true); setModalError('')
    try {
      if (payTeamMember === 'all') {
        // Single server-side call to create batches for all members
        const result = await ledgerAPI.createPayoutBatchAll({
          periodStart: payPeriodStart,
          periodEnd: payPeriodEnd,
          note: payNote || undefined,
          includeScheduled: payIncludeScheduled || undefined,
        })
        const created = result.created?.length || 0
        const skipped = result.skipped || []
        const advanced = result.scheduled_completed_total || 0
        if (created > 0) {
          setShowPayoutModal(false); setPayTeamMember(''); setPayPeriodStart(''); setPayPeriodEnd(''); setPayNote(''); setPayIncludeScheduled(false)
          const parts = []
          if (advanced > 0) parts.push(`${advanced} scheduled job${advanced === 1 ? '' : 's'} marked completed.`)
          if (skipped.length > 0) parts.push(`Skipped ${skipped.length}:\n${skipped.map(s => `${s.name}: ${s.reason}`).join('\n')}`)
          if (parts.length) setTimeout(() => alert(`Created ${created} payouts.\n\n${parts.join('\n\n')}`), 300)
        } else {
          setModalError(`No payouts created. ${skipped.length} members had no unpaid entries for this period.`)
        }
      } else {
        const result = await ledgerAPI.createPayoutBatch({
          teamMemberId: payTeamMember,
          periodStart: payPeriodStart,
          periodEnd: payPeriodEnd,
          note: payNote || undefined,
          includeScheduled: payIncludeScheduled || undefined,
        })
        setShowPayoutModal(false)
        setPayTeamMember(''); setPayPeriodStart(''); setPayPeriodEnd(''); setPayNote(''); setPayIncludeScheduled(false)
        const advanced = result?.scheduled_completed || 0
        if (advanced > 0) {
          setTimeout(() => alert(`Payout created. ${advanced} scheduled job${advanced === 1 ? '' : 's'} marked completed and included.`), 300)
        }
      }
      fetchBatches(); fetchBalances()
    } catch (err) {
      setModalError(err.response?.data?.error || 'Failed to create payout batch')
    } finally { setModalLoading(false) }
  }

  const handleMarkPaid = async (batchId) => {
    if (!window.confirm('Mark this payout batch as paid?')) return
    try { await ledgerAPI.markBatchPaid(batchId); fetchBatches(); fetchBalances() }
    catch (err) { alert(err.response?.data?.error || 'Failed to mark batch as paid') }
  }

  const handleCancelBatch = async (batchId) => {
    if (!window.confirm('Cancel this payout batch? Entries will become unpaid again.')) return
    try { await ledgerAPI.cancelBatch(batchId); fetchBatches(); fetchBalances() }
    catch (err) { alert(err.response?.data?.error || 'Failed to cancel batch') }
  }

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm('Delete this payout batch?\n\nAll entries will become unpaid again and the batch record will be removed. Balances will update accordingly.')) return
    try { await ledgerAPI.deleteBatch(batchId); fetchBatches(); fetchBalances() }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete batch') }
  }

  const handleViewBatch = async (batchId) => {
    if (expandedBatch === batchId) { setExpandedBatch(null); setBatchDetail(null); return }
    try {
      const data = await ledgerAPI.getPayoutBatch(batchId)
      setBatchDetail(data); setExpandedBatch(batchId)
    } catch (err) { console.error('Error fetching batch detail:', err) }
  }

  const handleMarkAllPaid = async (batchIds) => {
    if (!window.confirm(`Mark ${batchIds.length} pending batches as paid?`)) return
    try {
      for (const id of batchIds) {
        await ledgerAPI.markBatchPaid(id)
      }
      fetchBatches(); fetchBalances()
    } catch (err) { alert(err.response?.data?.error || 'Failed to mark batches as paid') }
  }

  const handleBackfillPreview = async () => {
    setBackfillLoading(true)
    setBackfillResult(null)
    setBackfillProgress(0)
    try {
      const preview = await ledgerAPI.backfill({ dryRun: true })
      setBackfillPreview(preview)
    } catch (err) { alert(err.response?.data?.error || 'Failed to check backfill status') }
    finally { setBackfillLoading(false) }
  }

  const startBackfillPolling = () => {
    const interval = setInterval(async () => {
      try {
        const progress = await ledgerAPI.getBackfillProgress()
        if (progress.status === 'processing') {
          setBackfillProcessed(progress.processed || 0)
          setBackfillTotal(progress.total || 0)
          setBackfillPhase(progress.phase || 'jobs')
          const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
          setBackfillProgress(progress.phase === 'manager_salary' ? Math.max(pct, 95) : pct)
        } else if (progress.status === 'complete' || progress.status === 'error') {
          clearInterval(interval)
        }
      } catch { /* ignore polling errors */ }
    }, 1500)
    return interval
  }

  const handleBackfillRun = async () => {
    setBackfillLoading(true)
    setBackfillProgress(0)
    setBackfillProcessed(0)
    setBackfillTotal(backfillPreview?.would_process || 0)
    setBackfillPhase('jobs')
    setBackfillPreview(null)
    setBackfillResult(null)
    try {
      await ledgerAPI.backfill({ dryRun: false })
      // Response is immediate — backfill runs in background. Poll until complete.
      const interval = setInterval(async () => {
        try {
          const progress = await ledgerAPI.getBackfillProgress()
          setBackfillProcessed(progress.processed || 0)
          setBackfillTotal(progress.total || 0)
          setBackfillPhase(progress.phase || 'jobs')
          const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
          setBackfillProgress(progress.phase === 'manager_salary' ? Math.max(pct, 95) : progress.phase === 'done' ? 100 : pct)
          if (progress.status === 'complete' || progress.status === 'error') {
            clearInterval(interval)
            setBackfillProgress(100)
            setBackfillResult({ message: 'Backfill complete', processed: progress.processed, errors: progress.errors, manager_salary_entries: progress.manager_salary_entries })
            setBackfillLoading(false)
            fetchBalances()
          }
        } catch { /* ignore polling errors */ }
      }, 2000)
    } catch (err) {
      setBackfillProgress(0)
      setBackfillLoading(false)
      alert(err.response?.data?.error || 'Backfill failed')
    }
  }

  const handleBackfillReset = async () => {
    if (!window.confirm('This will delete all existing ledger entries (except payouts) and re-create them. Continue?')) return
    setBackfillLoading(true)
    setBackfillProgress(0)
    setBackfillProcessed(0)
    setBackfillTotal(0)
    setBackfillPhase('jobs')
    setBackfillPreview(null)
    setBackfillResult(null)
    try {
      await ledgerAPI.backfill({ dryRun: false, resetExisting: true })
      const interval = setInterval(async () => {
        try {
          const progress = await ledgerAPI.getBackfillProgress()
          setBackfillProcessed(progress.processed || 0)
          setBackfillTotal(progress.total || 0)
          setBackfillPhase(progress.phase || 'jobs')
          const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
          setBackfillProgress(progress.phase === 'manager_salary' ? Math.max(pct, 95) : progress.phase === 'done' ? 100 : pct)
          if (progress.status === 'complete' || progress.status === 'error') {
            clearInterval(interval)
            setBackfillProgress(100)
            setBackfillResult({ message: 'Backfill complete', processed: progress.processed, errors: progress.errors, manager_salary_entries: progress.manager_salary_entries })
            setBackfillLoading(false)
            fetchBalances()
          }
        } catch { /* ignore polling errors */ }
      }, 2000)
    } catch (err) {
      setBackfillProgress(0)
      setBackfillLoading(false)
      alert(err.response?.data?.error || 'Backfill reset failed')
    }
  }

  const handleExport = () => {
    if (!payrollData) return
    let csv = 'Team Member,Role,Job Count,Hours Worked,Job Revenue,Hourly Rate,Commission %,Commission Revenue Base,Hourly Salary,Commission,Tips,Incentives,Cash Collected,Total Salary,Payment Method\n'
    filteredMembers.forEach(member => {
      const hourlyRate = member.teamMember.hourlyRate ? formatCurrency(member.teamMember.hourlyRate) : 'N/A'
      const commissionPct = member.teamMember.commissionPercentage ? `${member.teamMember.commissionPercentage}%` : 'N/A'
      csv += `"${member.teamMember.name}","${member.teamMember.role || 'Service Provider'}",${member.jobCount},${member.totalHours},${formatCurrency(member.totalJobRevenue || 0)},${hourlyRate},${commissionPct},${formatCurrency(member.commissionRevenueBase || 0)},${formatCurrency(member.hourlySalary || 0)},${formatCurrency(member.commissionSalary || 0)},${formatCurrency(member.totalTips || 0)},${formatCurrency(member.totalIncentives || 0)},${formatCurrency(member.totalCashCollected || 0)},${formatCurrency(member.totalSalary)},${member.paymentMethod || 'none'}\n`
    })
    csv += `\nSummary\n`
    csv += `Total Business Revenue,${formatCurrency(payrollData?.totalBusinessRevenue || 0)}\n`
    csv += `Total Team Members,${filteredSummary.totalTeamMembers}\n`
    csv += `Total Hours,${filteredSummary.totalHours}\n`
    csv += `Total Job Revenue,${formatCurrency(filteredSummary.totalJobRevenue || 0)}\n`
    csv += `Total Hourly Salary,${formatCurrency(filteredSummary.totalHourlySalary || 0)}\n`
    csv += `Total Commission,${formatCurrency(filteredSummary.totalCommission || 0)}\n`
    csv += `Total Tips,${formatCurrency(filteredSummary.totalTips || 0)}\n`
    csv += `Total Incentives,${formatCurrency(filteredSummary.totalIncentives || 0)}\n`
    csv += `Total Cash Collected,${formatCurrency(filteredSummary.totalCashCollected || 0)}\n`
    csv += `Total Salary,${formatCurrency(filteredSummary.totalSalary)}\n`
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${startDate}-to-${endDate}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const toggleExpanded = (memberId) => {
    setExpandedMembers(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  // ── Payroll computed values ──
  const memberSearchLower = memberSearch.trim().toLowerCase()
  const filteredMembers = (payrollData?.teamMembers?.filter(
    m => selectedMemberId === 'all' || String(m.teamMember.id) === String(selectedMemberId)
  ) || [])
    .filter(m => !payrollOnlyWithEarnings || (m.totalSalary || 0) > 0 || (m.jobCount || 0) > 0)
    .filter(m => !memberSearchLower || (m.teamMember?.name || '').toLowerCase().includes(memberSearchLower))

  const filteredSummary = payrollData ? (selectedMemberId === 'all' ? payrollData.summary : {
    totalTeamMembers: filteredMembers.length,
    totalHours: parseFloat(filteredMembers.reduce((s, m) => s + (m.totalHours || 0), 0).toFixed(2)),
    totalScheduledHours: parseFloat(filteredMembers.reduce((s, m) => s + (m.scheduledHours || 0), 0).toFixed(2)),
    totalScheduledHourlySalary: parseFloat(filteredMembers.reduce((s, m) => s + (m.scheduledHourlySalary || 0), 0).toFixed(2)),
    totalJobRevenue: parseFloat(filteredMembers.filter(m => !m.isManagerOrOwner).reduce((s, m) => s + (m.totalJobRevenue || 0), 0).toFixed(2)),
    totalHourlySalary: parseFloat(filteredMembers.reduce((s, m) => s + (m.hourlySalary || 0), 0).toFixed(2)),
    totalCommission: parseFloat(filteredMembers.reduce((s, m) => s + (m.commissionSalary || 0), 0).toFixed(2)),
    totalTips: parseFloat(filteredMembers.reduce((s, m) => s + (m.totalTips || 0), 0).toFixed(2)),
    totalIncentives: parseFloat(filteredMembers.reduce((s, m) => s + (m.totalIncentives || 0), 0).toFixed(2)),
    totalCashCollected: parseFloat(filteredMembers.reduce((s, m) => s + (m.totalCashCollected || 0) + (m.priorCashCollected || 0), 0).toFixed(2)),
    totalSalary: parseFloat(filteredMembers.reduce((s, m) => s + (m.totalSalary || 0) + (m.priorCashCollected || 0), 0).toFixed(2)),
    totalJobCount: filteredMembers.reduce((s, m) => s + (m.jobCount || 0), 0),
  }) : null

  const totalUnpaidBalance = balances.reduce((sum, b) => sum + (b.current_balance || 0), 0)

  // ── Tabs ──
  const tabs = [
    { id: 'simple',          label: 'Pay run',        icon: DollarSign },
    { id: 'simple_history',  label: 'Past runs',      icon: BookOpen },
    { id: 'payroll',         label: 'Payroll',        icon: DollarSign },
    { id: 'current_period',  label: 'Current period', icon: Calendar },
    { id: 'drafts',          label: 'Drafts',         icon: FileText },
    { id: 'history',         label: 'History',        icon: BookOpen, count: (batches || []).length || undefined },
    { id: 'balances',        label: 'Balances',       icon: Users },
    { id: 'payouts',         label: 'Payouts',        icon: Banknote },
    { id: 'paystubs',        label: 'Paystubs',       icon: FileText },
    { id: 'ledger',          label: 'Ledger',         icon: BookOpen },
    { id: 'time',            label: 'Time tracking',  icon: Clock },
    { id: 'tax',             label: 'Tax forms',      icon: FileText },
  ]

  if (loading) {
    return (
      <div
        className="min-h-screen bg-[var(--sf-bg-page)] flex items-center justify-center"
        style={{ fontFamily: "var(--sf-font-ui)" }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--sf-blue)] mx-auto mb-4"></div>
          <p className="text-[13px] text-[var(--sf-ink-2)]">Loading payroll data…</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-[var(--sf-bg-page)]"
      style={{ fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader pageTitle="Payroll" />

      <SfPageHeader
        eyebrow={
          <Link
            to="/team"
            className="inline-flex items-center gap-1 text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] transition-colors"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={11} />
            <span>Team</span>
            <ChevronRight size={11} className="text-[var(--sf-ink-4)]" />
            <span style={{ color: "var(--sf-ink)" }}>Payroll</span>
          </Link>
        }
        title="Payroll"
        subtitle="Calculate salaries, track balances, and manage payouts"
        actions={
          <>
            {(activeTab === 'payroll' || activeTab === 'current_period') && (
              <SfButton
                variant="secondary"
                size="md"
                icon={Download}
                onClick={handleExport}
                disabled={!payrollData || filteredMembers.length === 0}
              >
                Export CSV
              </SfButton>
            )}
            {(activeTab === 'balances' || activeTab === 'ledger' || activeTab === 'payouts' || activeTab === 'history') && (
              <>
                <SfButton
                  variant="secondary"
                  size="md"
                  icon={Banknote}
                  onClick={() => { setShowCashModal(true); setModalError('') }}
                  style={{
                    color: "var(--sf-amber-dark)",
                    borderColor: "var(--sf-amber-soft)",
                    background: "var(--sf-amber-soft)",
                  }}
                >
                  Cash
                </SfButton>
                <SfButton
                  variant="secondary"
                  size="md"
                  icon={ArrowUpDown}
                  onClick={() => { if (balances.length === 0) fetchBalances(); setShowAdjustmentModal(true); setModalError('') }}
                >
                  Adjust
                </SfButton>
                <SfButton
                  variant="primary"
                  size="md"
                  icon={CreditCard}
                  onClick={() => { setShowPayoutModal(true); setModalError('') }}
                >
                  Payout
                </SfButton>
              </>
            )}
          </>
        }
        tabs={
          <div className="flex items-center overflow-x-auto scrollbar-hide w-full">
            {tabs.map(tab => (
              <SfTab
                key={tab.id}
                active={activeTab === tab.id}
                count={tab.count}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <tab.icon size={13} />
                  {tab.label}
                </span>
              </SfTab>
            ))}
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6">

          {/* Error Message */}
          {error && (activeTab === 'payroll' || activeTab === 'current_period' || activeTab === 'simple') && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            </div>
          )}

          {/* ═══════════════ SIMPLE PAY TAB ═══════════════ */}
          {activeTab === 'simple' && payrollData && (
            <SimplePayView
              payrollData={payrollData}
              batches={batches}
              startDate={startDate}
              endDate={endDate}
              onRefresh={() => { fetchPayrollData(); fetchBatches(); }}
              showToast={(msg, type) => { /* fall back to console; existing modal/notification pattern can be wired later */ console.log(`[${type}] ${msg}`); }}
              onViewMember={(row) => { window.location.href = `/team/${row.id}`; }}
              onEditMember={(row) => { setActiveTab('payroll'); setSelectedMemberId(String(row.id)); }}
            />
          )}

          {/* ═══════════════ SIMPLE PAY · PAST RUNS TAB ═══════════════ */}
          {activeTab === 'simple_history' && (
            <SimpleHistoryView
              batches={batches}
              teamMembers={teamMembers}
              onViewRun={(run) => { setActiveTab('history'); }}
            />
          )}

          {/* ═══════════════ PAYROLL TAB ═══════════════ */}
          {(activeTab === 'payroll' || activeTab === 'current_period') && payrollData && (
            <div>
              {/* Period banner — gradient hero with status counts + step progress */}
              <PayrollPeriodBanner
                startDate={startDate}
                endDate={endDate}
                allTime={payrollAllTime}
                totalToBePaid={filteredSummary.totalSalary}
                memberCount={filteredSummary.totalTeamMembers}
                batches={batches || []}
                payoutFrequency={payoutFrequency}
              />

              {/* Date range chips — slim row */}
              <div className="mb-3">
                <QuickTimeFilter
                  payoutFrequency={payoutFrequency} payoutStartDay={payoutStartDay}
                  activeRange={payrollQuickRange}
                  onSelect={(id) => { setPayrollQuickRange(id); setPayrollAllTime(id === 'all_time') }}
                  startDate={startDate}
                  endDate={endDate}
                  onStartChange={setStartDate}
                  onEndChange={setEndDate}
                  onApply={(s, e) => fetchPayrollData(s, e)}
                />
              </div>

              {/* Toolbar — search + filter chips + bulk actions */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-shrink-0" style={{ width: 260 }}>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search team members"
                    className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue)] text-[var(--sf-ink)]"
                  />
                  <Users
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--sf-ink-3)] pointer-events-none"
                  />
                </div>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="px-3 py-2 text-[12.5px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue)] text-[var(--sf-ink-2)]"
                >
                  <option value="all">All members</option>
                  {(payrollData?.teamMembers || []).map(m => (
                    <option key={m.teamMember.id} value={m.teamMember.id}>{m.teamMember.name}</option>
                  ))}
                </select>
                <SfFilterChip
                  icon={Check}
                  active={payrollOnlyWithEarnings}
                  onClick={() => setPayrollOnlyWithEarnings(!payrollOnlyWithEarnings)}
                >
                  Only with earnings
                </SfFilterChip>
                <SfFilterChip
                  icon={Calendar}
                  active={payrollJobFilter === 'all'}
                  onClick={() => setPayrollJobFilter(payrollJobFilter === 'completed' ? 'all' : 'completed')}
                >
                  Incl. scheduled
                </SfFilterChip>
                <div className="flex-1" />
                {filteredMembers.length > 0 && (
                  <SfButton
                    variant="ghost"
                    size="sm"
                    icon={ClipboardCopy}
                    onClick={copyPayrollTable}
                  >
                    {copiedPayroll ? 'Copied!' : 'Copy table'}
                  </SfButton>
                )}
                <SfButton
                  variant="primary"
                  size="sm"
                  onClick={() => fetchPayrollData()}
                  disabled={refreshing}
                >
                  {refreshing ? 'Applying…' : 'Apply'}
                </SfButton>
              </div>

              <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* KPI row — design spec: Hours / Jobs / Gross / Tips / Bonuses / Reimbursements */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
                  <SfKPI
                    label="Total hours"
                    value={`${(filteredSummary.totalHours || 0).toFixed(1)}h`}
                    sub={`across ${filteredSummary.totalTeamMembers || 0} cleaner${filteredSummary.totalTeamMembers === 1 ? '' : 's'}`}
                    accent="var(--sf-blue)"
                  />
                  <SfKPI
                    label="Jobs completed"
                    value={filteredSummary.totalJobCount || 0}
                    sub="this period"
                    accent="var(--sf-green-dark)"
                  />
                  <SfKPI
                    label="Gross wages"
                    value={formatCurrency((filteredSummary.totalHourlySalary || 0) + (filteredSummary.totalCommission || 0))}
                    sub="hourly + commission"
                    accent="var(--sf-ink)"
                  />
                  <SfKPI
                    label="Tips"
                    value={formatCurrency(filteredSummary.totalTips || 0)}
                    sub={`avg ${formatCurrency(filteredSummary.totalTeamMembers ? (filteredSummary.totalTips || 0) / filteredSummary.totalTeamMembers : 0)} / cleaner`}
                    accent="var(--sf-purple)"
                  />
                  <SfKPI
                    label="Incentives"
                    value={formatCurrency(filteredSummary.totalIncentives || 0)}
                    sub="performance + referral"
                    accent="var(--sf-amber)"
                  />
                  <SfKPI
                    label="Total salary"
                    value={formatCurrency(filteredSummary.totalSalary || 0)}
                    sub={payrollAllTime ? 'All time' : `${new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    accent="var(--sf-teal)"
                  />
                </div>

                {/* Team Members Table */}
                {filteredMembers.length === 0 ? (
                  <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-12 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-[var(--sf-ink)] mb-2">No Team Members</h3>
                    <p className="text-sm text-[var(--sf-ink-3)] mb-4">No active team members found.</p>
                    <button onClick={() => navigate('/team')} className="sf-btn-primary px-4 py-2 rounded-lg text-sm font-medium">
                      Go to Team
                    </button>
                  </div>
                ) : (
                  <div className="bg-[var(--sf-panel)] rounded-[12px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] overflow-x-auto xl:overflow-x-visible">
                    <table className="w-full" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                      <colgroup>
                        <col style={{ width: '20%', minWidth: 180 }} />
                        <col style={{ width: '7%',  minWidth: 70 }} />
                        <col style={{ width: '4%',  minWidth: 40 }} />
                        <col style={{ width: '5%',  minWidth: 50 }} />
                        <col style={{ width: '7%',  minWidth: 65 }} />
                        <col style={{ width: '7%',  minWidth: 65 }} />
                        <col style={{ width: '7%',  minWidth: 65 }} />
                        <col style={{ width: '6%',  minWidth: 55 }} />
                        <col style={{ width: '7%',  minWidth: 65 }} />
                        <col style={{ width: '7%',  minWidth: 65 }} />
                        <col style={{ width: '6%',  minWidth: 60 }} />
                        <col style={{ width: '10%', minWidth: 80 }} />
                      </colgroup>
                      <thead style={{ background: 'var(--sf-panel-alt)', borderBottom: '1px solid var(--sf-border-soft)' }}>
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Cleaner</th>
                          <th className="px-2 py-2.5 text-left text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Pay method</th>
                          <th className="px-2 py-2.5 text-center text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Jobs</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Hours</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Revenue</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Hourly</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Comm</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Tips</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Incentives</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Reimb.</th>
                          <th className="px-2 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Cash</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold text-[var(--sf-ink-3)] uppercase" style={{ letterSpacing: '.06em' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-[var(--sf-border-light)]">
                        {filteredMembers.map((member) => {
                          const isExpanded = expandedMembers.has(member.teamMember.id)
                          return (
                          <React.Fragment key={member.teamMember.id}>
                          <tr className="hover:bg-[var(--sf-panel-soft)] cursor-pointer" style={{ borderBottom: '1px solid var(--sf-border-soft)' }} onClick={() => toggleExpanded(member.teamMember.id)}>
                            <td className="px-3 py-3">
                              <div className="flex items-center min-w-0 gap-2.5">
                                {isExpanded
                                  ? <ChevronDown size={13} className="text-[var(--sf-ink-3)] flex-shrink-0" />
                                  : <ChevronRight size={13} className="text-[var(--sf-ink-3)] flex-shrink-0" />}
                                <div
                                  className="flex-shrink-0 rounded-md inline-flex items-center justify-center"
                                  style={{
                                    width: 32,
                                    height: 32,
                                    background: 'var(--sf-blue-soft)',
                                    color: 'var(--sf-blue-dark)',
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {member.teamMember.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-semibold text-[var(--sf-ink)] truncate">{member.teamMember.name}</span>
                                    {member.isManagerOrOwner && (
                                      <span
                                        className="inline-flex items-center px-1.5 py-[1px] rounded-md"
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          background: 'var(--sf-purple-soft)',
                                          color: 'var(--sf-purple)',
                                        }}
                                      >
                                        {member.teamMember.role}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5">
                                    {isExpanded ? 'Hide details' : 'Tap for details'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-[12px] text-[var(--sf-ink-2)] truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {member.teamMember.commissionPercentage ? `${member.teamMember.commissionPercentage}%` : ''}
                              {member.teamMember.hourlyRate && member.teamMember.commissionPercentage ? ' + ' : ''}
                              {member.teamMember.hourlyRate ? `$${member.teamMember.hourlyRate}/hr` : ''}
                              {!member.teamMember.hourlyRate && !member.teamMember.commissionPercentage && <span className="text-[var(--sf-ink-3)] italic">Not set</span>}
                            </td>
                            <td className="px-2 py-3 text-[13px] font-semibold text-[var(--sf-ink)] text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{member.jobCount}</td>
                            <td className="px-2 py-3 text-[13px] font-semibold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{member.totalHours.toFixed(1)}h</td>
                            <td className="px-2 py-3 text-[12.5px] text-[var(--sf-ink-2)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(member.totalJobRevenue || 0)}</td>
                            <td className="px-2 py-3 text-[13px] font-semibold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(member.hourlySalary || 0)}</td>
                            <td
                              className="px-2 py-3 text-[13px] font-semibold text-[var(--sf-ink)] text-right"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                              title={member.isManagerOrOwner && member.commissionRevenueBase ? `From total revenue: ${formatCurrency(member.commissionRevenueBase)}` : ''}
                            >
                              {formatCurrency(member.commissionSalary || 0)}
                              {member.isManagerOrOwner && member.commissionSalary > 0 && (
                                <div className="text-[10px] text-[var(--sf-purple)] font-normal">rev: {formatCurrency(member.commissionRevenueBase || 0)}</div>
                              )}
                            </td>
                            <td className="px-2 py-3 text-[12.5px] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {(member.totalTips || 0) > 0
                                ? <span className="text-[var(--sf-green-dark)] font-semibold">+{formatCurrency(member.totalTips)}</span>
                                : <span className="text-[var(--sf-ink-3)]">—</span>}
                            </td>
                            <td className="px-2 py-3 text-[12.5px] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {(member.totalIncentives || 0) > 0
                                ? <span className="text-[var(--sf-purple)] font-semibold">+{formatCurrency(member.totalIncentives)}</span>
                                : <span className="text-[var(--sf-ink-3)]">—</span>}
                            </td>
                            <td className="px-2 py-3 text-[12.5px] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {(member.totalReimbursements || 0) > 0
                                ? <span className="text-[var(--sf-blue-dark)] font-semibold">+{formatCurrency(member.totalReimbursements)}</span>
                                : <span className="text-[var(--sf-ink-3)]">—</span>}
                            </td>
                            <td className="px-2 py-3 text-[12.5px] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {((member.totalCashCollected || 0) + (member.priorCashCollected || 0)) < 0
                                ? <span className="text-[var(--sf-amber-dark)] font-semibold">{formatCurrency((member.totalCashCollected || 0) + (member.priorCashCollected || 0))}</span>
                                : <span className="text-[var(--sf-ink-3)]">—</span>}
                              {(member.priorCashCollected || 0) < 0 && (
                                <div className="text-[10px] text-[var(--sf-amber-dark)] opacity-70">incl. prior {formatCurrency(member.priorCashCollected)}</div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[14px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{formatCurrency(member.totalSalary + (member.priorCashCollected || 0))}</td>
                          </tr>
                          {/* Manager/Owner Pay Breakdown */}
                          {isExpanded && member.isManagerOrOwner && (
                            <tr>
                              <td colSpan="12" className="p-0">
                                <div className="bg-purple-50 border-t border-b border-purple-100 px-4 py-3">
                                  <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Pay Breakdown</p>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-purple-600 uppercase tracking-wider">
                                        <th className="text-left py-1.5 pr-4 font-medium">Component</th>
                                        <th className="text-right py-1.5 pr-4 font-medium">Base</th>
                                        <th className="text-right py-1.5 pr-4 font-medium">Rate</th>
                                        <th className="text-right py-1.5 font-medium">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-purple-100">
                                      {member.teamMember.commissionPercentage > 0 && (
                                        <tr>
                                          <td className="py-2 pr-4 text-[var(--sf-ink)]">Commission</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">Total revenue: {formatCurrency(member.commissionRevenueBase || 0)}</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">{member.teamMember.commissionPercentage}%</td>
                                          <td className="py-2 text-right font-semibold text-purple-700">{formatCurrency(member.commissionSalary)}</td>
                                        </tr>
                                      )}
                                      {member.teamMember.hourlyRate > 0 && (
                                        <tr>
                                          <td className="py-2 pr-4 text-[var(--sf-ink)]">Hourly (Scheduled)</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">{(member.scheduledHours || 0).toFixed(1)} scheduled hrs</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">${member.teamMember.hourlyRate}/hr</td>
                                          <td className="py-2 text-right font-semibold text-purple-700">{formatCurrency(member.hourlySalary || 0)}</td>
                                        </tr>
                                      )}
                                      {(member.totalTips || 0) > 0 && (
                                        <tr>
                                          <td className="py-2 pr-4 text-[var(--sf-ink)]">Tips</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 text-right font-semibold text-purple-700">{formatCurrency(member.totalTips)}</td>
                                        </tr>
                                      )}
                                      {(member.totalIncentives || 0) > 0 && (
                                        <tr>
                                          <td className="py-2 pr-4 text-[var(--sf-ink)]">Incentives</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 text-right font-semibold text-purple-700">{formatCurrency(member.totalIncentives)}</td>
                                        </tr>
                                      )}
                                      {(member.totalCashCollected || 0) < 0 && (
                                        <tr>
                                          <td className="py-2 pr-4 text-[var(--sf-ink)]">Cash Collected</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink-3)]">—</td>
                                          <td className="py-2 text-right font-semibold text-orange-600">{formatCurrency(member.totalCashCollected)}</td>
                                        </tr>
                                      )}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-purple-200">
                                        <td colSpan="3" className="py-2 pr-4 text-right font-semibold text-[var(--sf-ink)]">Total Pay</td>
                                        <td className="py-2 text-right font-bold text-purple-800 text-base">{formatCurrency(member.totalSalary)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                  {member.revenueJobs && member.revenueJobs.length > 0 && (
                                    <div className="mt-3 border-t border-purple-200 pt-3">
                                      <p className="text-xs font-semibold text-purple-600 uppercase mb-2">
                                        Revenue Jobs ({member.revenueJobs.length} jobs = {formatCurrency(payrollData?.totalBusinessRevenue || 0)})
                                      </p>
                                      <div className="max-h-64 overflow-y-auto">
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 bg-purple-50">
                                            <tr className="text-purple-500 uppercase tracking-wider">
                                              <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                                              <th className="text-left py-1.5 pr-3 font-medium">Service</th>
                                              <th className="text-left py-1.5 pr-3 font-medium">Customer</th>
                                              <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                                              <th className="text-right py-1.5 pr-3 font-medium">Gross</th>
                                              <th className="text-right py-1.5 pr-3 font-medium">Tax</th>
                                              <th className="text-right py-1.5 font-medium">Revenue</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-purple-100">
                                            {member.revenueJobs.map(rj => (
                                              <tr key={rj.id} className="hover:bg-purple-100 cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/job/${rj.id}`) }}>
                                                <td className="py-1.5 pr-3 text-[var(--sf-ink)] whitespace-nowrap">{formatShortDate(rj.scheduledDate)}</td>
                                                <td className="py-1.5 pr-3 text-[var(--sf-ink)] font-medium truncate max-w-[150px]">{rj.serviceName}</td>
                                                <td className="py-1.5 pr-3 text-[var(--sf-ink)] truncate max-w-[120px]">{rj.customerName}</td>
                                                <td className="py-1.5 pr-3">
                                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                                    rj.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                    rj.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                    rj.status === 'in-progress' ? 'bg-blue-100 text-[var(--sf-blue-500)]' :
                                                    rj.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-[var(--sf-bg-page)] text-[var(--sf-ink-2)]'
                                                  }`}>{rj.status}</span>
                                                </td>
                                                <td className="py-1.5 pr-3 text-right text-[var(--sf-ink-3)]">{formatCurrency(rj.grossPrice || 0)}</td>
                                                <td className="py-1.5 pr-3 text-right text-red-500">{rj.taxes > 0 ? `-${formatCurrency(rj.taxes)}` : '-'}</td>
                                                <td className="py-1.5 text-right text-[var(--sf-ink)] font-medium">{formatCurrency(rj.revenue)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t border-purple-200 bg-purple-50">
                                              <td colSpan="6" className="py-1.5 text-right font-semibold text-purple-700">Total Revenue</td>
                                              <td className="py-1.5 text-right font-bold text-purple-800">{formatCurrency(payrollData?.totalBusinessRevenue || 0)}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {/* Job Breakdown */}
                          {isExpanded && member.jobs && member.jobs.length > 0 && (
                            <tr>
                              <td colSpan="12" className="p-0">
                                <div className="bg-[var(--sf-bg-page)] border-t border-b border-[var(--sf-border-soft)] px-3 py-2">
                                  <p className="text-xs font-semibold text-[var(--sf-ink-3)] uppercase mb-1">Job Breakdown</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[var(--sf-ink-3)] uppercase tracking-wider">
                                        <th className="text-left py-2 pr-4 font-medium">Date</th>
                                        <th className="text-left py-2 pr-4 font-medium">Name</th>
                                        <th className="text-left py-2 pr-4 font-medium">Status</th>
                                        <th className="text-right py-2 pr-4 font-medium">Est. Hours</th>
                                        <th className="text-right py-2 pr-4 font-medium">Real</th>
                                        <th className="text-right py-2 pr-4 font-medium">Price</th>
                                        <th className="text-right py-2 pr-4 font-medium">Hourly</th>
                                        <th className="text-right py-2 pr-4 font-medium">Commission</th>
                                        <th className="text-right py-2 pr-4 font-medium">Tips</th>
                                        <th className="text-right py-2 pr-4 font-medium">Incentives</th>
                                        <th className="text-right py-2 pr-4 font-medium">Cash</th>
                                        <th className="text-right py-2 font-medium">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[...member.jobs].sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)).map(job => (
                                        <tr key={job.id} className="border-t border-[var(--sf-border-soft)]">
                                          <td className="py-2 pr-4 text-[var(--sf-ink)] whitespace-nowrap">{formatShortDate(job.scheduledDate)}</td>
                                          <td className="py-2 pr-4 font-medium"><span className="text-[var(--sf-text-active)] hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}`) }}>{job.customerName}</span></td>
                                          <td className="py-2 pr-4">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                              job.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                              job.status === 'completed' ? 'bg-green-100 text-green-700' :
                                              job.status === 'in-progress' ? 'bg-blue-100 text-[var(--sf-blue-500)]' :
                                              job.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-[var(--sf-bg-page)] text-[var(--sf-ink-2)]'
                                            }`}>{job.status}</span>
                                          </td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">
                                            <EditableCell value={job.hours} format="hours" onSave={async (val) => { await payrollAPI.updateJobPayroll(job.id, { hoursWorked: val }); await fetchPayrollData(); }} />
                                            {job.hoursOverridden && <span className="text-[9px] text-orange-500 ml-0.5">*</span>}
                                          </td>
                                          <td className="py-2 pr-4 text-right text-xs">
                                            {job.realHours != null ? (
                                              <span className={job.realHours > job.hours * 1.1 ? 'text-red-600 font-medium' : job.realHours < job.hours * 0.9 ? 'text-green-600 font-medium' : 'text-[var(--sf-ink-3)]'}>
                                                {job.realHours.toFixed(1)}
                                              </span>
                                            ) : <span className="text-[var(--sf-ink-3)]">—</span>}
                                          </td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">
                                            <EditableCell value={job.fullRevenue || job.revenue || 0} format="dollar" onSave={async (val) => { await payrollAPI.updateJobPayroll(job.id, { servicePrice: val }); await fetchPayrollData(); }} />
                                            {job.memberCount > 1 && <span className="text-[var(--sf-ink-3)] text-xs ml-1">({formatCurrency(job.revenue)}/ea)</span>}
                                          </td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">{formatCurrency(job.hourlySalary)}</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">{formatCurrency(job.commission)}</td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">
                                            <EditableCell value={job.tip || 0} format="dollar" onSave={async (val) => { await payrollAPI.updateJobPayroll(job.id, { tipAmount: val * (job.memberCount || 1) }); await fetchPayrollData(); }} />
                                          </td>
                                          <td className="py-2 pr-4 text-right text-[var(--sf-ink)]">
                                            <EditableCell value={job.incentive || 0} format="dollar" onSave={async (val) => { await payrollAPI.updateJobPayroll(job.id, { incentiveAmount: val, teamMemberId: member.teamMember.id }); await fetchPayrollData(); }} />
                                            {Array.isArray(job.incentiveLines) && job.incentiveLines.length > 0 && (
                                              <div className="mt-0.5 flex flex-col items-end gap-0.5">
                                                {job.incentiveLines.map((ln, i) => (
                                                  <div
                                                    key={i}
                                                    className="text-[10.5px] text-[var(--sf-ink-3)] leading-tight max-w-[180px] truncate"
                                                    title={`${ln.description || 'No description'} — ${formatCurrency(ln.amount || 0)}`}
                                                  >
                                                    {ln.description || <span className="italic">No description</span>}
                                                    <span className="ml-1 text-[var(--sf-purple)] font-medium">{formatCurrency(ln.amount || 0)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-2 pr-4 text-right text-orange-600">
                                            <EditableCell value={Math.abs(job.cashCollected || 0)} format="dollar" onSave={async (val) => { await ledgerAPI.updateCashCollected(job.id, member.teamMember.id, val); await fetchPayrollData(); }} />
                                          </td>
                                          <td className="py-2 text-right text-[var(--sf-ink)] font-medium">{formatCurrency((job.hourlySalary || 0) + (job.commission || 0) + (job.tip || 0) + (job.incentive || 0) + (job.cashCollected || 0))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                          )
                        })}
                      </tbody>
                      <tfoot style={{ background: 'var(--sf-panel-alt)', borderTop: '1px solid var(--sf-border-soft)' }}>
                        <tr>
                          <td colSpan="2" className="px-3 py-3 text-[11.5px] font-bold uppercase text-[var(--sf-ink-2)]" style={{ letterSpacing: '.04em' }}>
                            {filteredMembers.length} cleaner{filteredMembers.length === 1 ? '' : 's'} · Totals
                          </td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-ink)] text-center" style={{ fontVariantNumeric: 'tabular-nums' }}>{filteredSummary.totalJobCount || 0}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{filteredSummary.totalHours.toFixed(1)}h</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-ink-2)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.totalJobRevenue || 0)}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.totalHourlySalary || 0)}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.totalCommission || 0)}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-green-dark)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(filteredSummary.totalTips || 0) > 0 ? `+${formatCurrency(filteredSummary.totalTips)}` : '—'}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-purple)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(filteredSummary.totalIncentives || 0) > 0 ? `+${formatCurrency(filteredSummary.totalIncentives)}` : '—'}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-[var(--sf-blue-dark)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(filteredSummary.totalReimbursements || 0) > 0 ? `+${formatCurrency(filteredSummary.totalReimbursements)}` : '—'}</td>
                          <td className="px-2 py-3 text-[13px] font-bold text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{(filteredSummary.totalCashCollected || 0) < 0 ? <span className="text-[var(--sf-amber-dark)]">{formatCurrency(filteredSummary.totalCashCollected)}</span> : '—'}</td>
                          <td className="px-3 py-3 text-[15px] font-bold text-[var(--sf-ink)] text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(filteredSummary.totalSalary)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ BALANCES TAB ═══════════════ */}
          {activeTab === 'balances' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-5">
                  <div className="text-sm text-[var(--sf-ink-3)] mb-1">Total Unpaid Balance</div>
                  <div className={`text-2xl font-bold ${totalUnpaidBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalUnpaidBalance)}
                  </div>
                  <div className="text-xs text-[var(--sf-ink-3)] mt-1">Owed to all cleaners</div>
                </div>
                <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-5">
                  <div className="text-sm text-[var(--sf-ink-3)] mb-1">Team Members</div>
                  <div className="text-2xl font-bold text-[var(--sf-ink)]">{balances.length}</div>
                  <div className="text-xs text-[var(--sf-ink-3)] mt-1">{balances.filter(b => b.status !== 'inactive').length} active, {balances.filter(b => b.status === 'inactive').length} inactive</div>
                </div>
                <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm text-[var(--sf-ink-3)] mb-1">Backfill</div>
                      <div className="text-xs text-[var(--sf-ink-3)]">Create ledger for past completed jobs</div>
                    </div>
                    {!backfillPreview && !backfillResult && (
                      <button onClick={handleBackfillPreview} disabled={backfillLoading}
                        className="px-3 py-2 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
                        {backfillLoading ? 'Checking...' : 'Check'}
                      </button>
                    )}
                  </div>

                  {/* Preview result */}
                  {backfillPreview && !backfillResult && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm text-[var(--sf-ink)] mb-2">
                        <span className="font-semibold">{backfillPreview.would_process}</span> jobs to process
                        <span className="text-[var(--sf-ink-3)] ml-2">({backfillPreview.already_have_entries} already have entries)</span>
                        {backfillPreview.managers_with_salary > 0 && (
                          <span className="text-purple-600 ml-2">+ {backfillPreview.managers_with_salary} manager(s) daily salary</span>
                        )}
                      </div>
                      {backfillPreview.would_process > 0 || backfillPreview.managers_with_salary > 0 ? (
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={handleBackfillRun} disabled={backfillLoading}
                            className="px-3 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                            {backfillLoading ? 'Processing...' : `Process ${backfillPreview.would_process} jobs`}
                          </button>
                          <button onClick={() => { setBackfillPreview(null); handleBackfillReset() }} disabled={backfillLoading}
                            className="px-3 py-2 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                            {backfillLoading ? 'Processing...' : 'Reset & Re-backfill All'}
                          </button>
                          <button onClick={() => setBackfillPreview(null)}
                            className="px-3 py-2 text-xs border border-[var(--sf-border-soft)] rounded-lg hover:bg-[var(--sf-bg-hover)]">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Check size={14} className="text-green-600" />
                          <span className="text-sm text-green-700">All jobs already have ledger entries</span>
                          <button onClick={() => { setBackfillPreview(null); handleBackfillReset() }} disabled={backfillLoading}
                            className="px-3 py-2 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
                            Reset & Re-backfill All
                          </button>
                          <button onClick={() => setBackfillPreview(null)}
                            className="ml-2 px-2 py-1 text-xs border border-[var(--sf-border-soft)] rounded hover:bg-[var(--sf-bg-hover)]">Dismiss</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Progress bar */}
                  {backfillLoading && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between text-xs text-[var(--sf-ink-3)] mb-1">
                        <span>
                          {backfillPhase === 'manager_salary' ? 'Creating manager salary entries...' :
                           backfillTotal > 0 ? `Processing jobs: ${backfillProcessed} / ${backfillTotal}` : 'Starting...'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>{backfillProgress}%</span>
                          <button onClick={async () => { try { await ledgerAPI.cancelBackfill() } catch {} }}
                            className="px-2 py-0.5 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div className="bg-[var(--sf-blue-500)] h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(backfillProgress, 2)}%` }}></div>
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  {backfillResult && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-1">
                        <Check size={14} className="text-green-600" />
                        <span className="text-sm font-medium text-green-700">Backfill complete</span>
                      </div>
                      <div className="text-xs text-[var(--sf-ink-2)]">
                        {backfillResult.processed} jobs processed, {backfillResult.already_had_entries || 0} already had entries{backfillResult.errors > 0 && `, ${backfillResult.errors} errors`}
                        {backfillResult.manager_salary_entries > 0 && `, ${backfillResult.manager_salary_entries} manager salary entries created`}
                      </div>
                      <button onClick={() => { setBackfillResult(null); setBackfillProgress(0) }}
                        className="mt-2 px-2 py-1 text-xs border border-[var(--sf-border-soft)] rounded hover:bg-[var(--sf-bg-hover)]">Dismiss</button>
                    </div>
                  )}

                </div>
              </div>

              {/* Date Filter */}
              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-[var(--sf-ink-3)]" />
                    <QuickTimeFilter
                      payoutFrequency={payoutFrequency} payoutStartDay={payoutStartDay}
                      activeRange={balancesQuickRange}
                      onSelect={(id) => { setBalancesQuickRange(id); setBalancesAllTime(false) }}
                      startDate={balancesStartDate}
                      endDate={balancesEndDate}
                      onStartChange={setBalancesStartDate}
                      onEndChange={setBalancesEndDate}
                      onApply={(s, e) => fetchBalances(s, e)}
                    />
                  </div>
                  <button onClick={() => fetchBalances()} disabled={balancesLoading}
                    className="sf-btn-primary px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                    Apply
                  </button>
                </div>
              </div>

              {/* Cleaner Balances Table */}
              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--sf-border-soft)] flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-lg font-semibold text-[var(--sf-ink)]">Cleaner Balances</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowOnlyWithEarnings(!showOnlyWithEarnings)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer',
                        padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                        border: showOnlyWithEarnings ? '1.5px solid var(--sf-blue-500)' : '1.5px solid var(--sf-border-light)',
                        background: showOnlyWithEarnings ? 'var(--sf-blue-50)' : 'white',
                        color: showOnlyWithEarnings ? 'var(--sf-blue-500)' : 'var(--sf-text-secondary)',
                        boxShadow: 'none'
                      }}
                    >
                      {showOnlyWithEarnings && <Check size={12} />}
                      Only with earnings
                    </button>
                    {balances.length > 0 && (
                      <button onClick={copyBalancesTable}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--sf-ink-2)] bg-[var(--sf-bg-page)] border rounded-lg hover:bg-[var(--sf-bg-hover)]">
                        <ClipboardCopy size={13} />
                        {copiedBalances ? 'Copied!' : 'Copy Table'}
                      </button>
                    )}
                  </div>
                </div>
                {(() => {
                  const displayBalances = showOnlyWithEarnings
                    ? balances.filter(b => (parseFloat(b.unpaid_earnings) || 0) !== 0 || (parseFloat(b.unpaid_tips) || 0) !== 0 || (parseFloat(b.current_balance) || 0) !== 0)
                    : balances;
                  return balancesLoading ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">Loading...</div>
                ) : displayBalances.length === 0 ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">
                    <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>No ledger data yet. Complete jobs or run a backfill to populate.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--sf-bg-page)] text-[var(--sf-ink-3)] text-xs font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 text-left">Cleaner</th>
                          <th className="px-4 py-3 text-center">Jobs</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                          <th className="px-4 py-3 text-right hidden sm:table-cell">Earnings</th>
                          <th className="px-4 py-3 text-right hidden sm:table-cell">Tips</th>
                          <th className="px-4 py-3 text-right hidden sm:table-cell">Incentives</th>
                          <th className="px-4 py-3 text-right hidden md:table-cell">Reimb.</th>
                          <th className="px-4 py-3 text-right hidden md:table-cell">Cash Offset</th>
                          <th className="px-4 py-3 text-right hidden md:table-cell">Adjustments</th>
                          <th className="px-4 py-3 text-center">Schedule</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--sf-border-light)]">
                        {displayBalances.map(b => (
                          <tr key={b.team_member_id} className="hover:bg-[var(--sf-bg-hover)]">
                            <td className="px-4 py-3 font-medium text-[var(--sf-ink)]">{b.name || `ID ${b.team_member_id}`}</td>
                            <td className="px-4 py-3 text-center text-[var(--sf-ink-2)]">{b.job_count || 0}</td>
                            <td className={`px-4 py-3 text-right font-semibold ${b.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(b.current_balance)}
                              {(b.prior_debt || 0) < 0 && (
                                <div className="text-[10px] font-normal text-orange-400">incl. prior {formatCurrency(b.prior_debt)}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_earnings)}</td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_tips)}</td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_incentives)}</td>
                            <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_reimbursements || 0)}</td>
                            <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_cash_offsets)}</td>
                            <td className="px-4 py-3 text-right hidden md:table-cell text-[var(--sf-ink-2)]">{formatCurrency(b.unpaid_adjustments)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs px-2 py-1 bg-[var(--sf-bg-page)] rounded-full text-[var(--sf-ink-2)] capitalize">
                                {b.payout_schedule || 'manual'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[var(--sf-bg-page)] font-semibold text-sm">
                        <tr>
                          <td className="px-4 py-3 text-left">Totals</td>
                          <td className="px-4 py-3 text-center">{balancesTotalUniqueJobs || balances.reduce((s, b) => s + (b.job_count || 0), 0)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(balances.reduce((s, b) => s + (b.current_balance || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_earnings || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_tips || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden sm:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_incentives || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_reimbursements || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_cash_offsets || 0), 0))}</td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">{formatCurrency(balances.reduce((s, b) => s + (b.unpaid_adjustments || 0), 0))}</td>
                          <td className="px-4 py-3"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
                })()}
              </div>
            </div>
          )}

          {/* ═══════════════ LEDGER TAB ═══════════════ */}
          {activeTab === 'ledger' && (
            <div>
              {/* Filters */}
              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-4 mb-4 space-y-3">
                <QuickTimeFilter
                  payoutFrequency={payoutFrequency} payoutStartDay={payoutStartDay}
                  activeRange={ledgerQuickRange}
                  onSelect={(id) => { setLedgerQuickRange(id); setEntriesPage(1) }}
                  startDate={filterStartDate}
                  endDate={filterEndDate}
                  onStartChange={(v) => { setFilterStartDate(v); setEntriesPage(1) }}
                  onEndChange={(v) => { setFilterEndDate(v); setEntriesPage(1) }}
                />
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-[var(--sf-ink-3)] mb-1 block">Team Member</label>
                    <select value={filterMember} onChange={e => { setFilterMember(e.target.value); setEntriesPage(1) }}
                      className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">All</option>
                      {teamMembers.map(tm => (
                        <option key={tm.id} value={tm.id}>{tm.first_name} {tm.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[120px]">
                    <label className="text-xs text-[var(--sf-ink-3)] mb-1 block">Type</label>
                    <select value={filterType} onChange={e => { setFilterType(e.target.value); setEntriesPage(1) }}
                      className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">All</option>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[110px]">
                    <label className="text-xs text-[var(--sf-ink-3)] mb-1 block">Status</label>
                    <select value={filterPayoutStatus} onChange={e => { setFilterPayoutStatus(e.target.value); setEntriesPage(1) }}
                      className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="">All</option>
                      <option value="unpaid">Unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <button onClick={() => fetchEntries()} className="sf-btn-primary px-4 py-2 rounded-lg text-sm font-medium">
                    <Filter size={14} className="inline mr-1" /> Apply
                  </button>
                </div>
              </div>

              {/* Entries Table */}
              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] overflow-hidden">
                {entriesLoading ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">Loading...</div>
                ) : entries.length === 0 ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">No ledger entries found</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--sf-bg-page)] text-[var(--sf-ink-3)] text-xs font-semibold uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3 text-left">Date</th>
                            <th className="px-4 py-3 text-left">Cleaner</th>
                            <th className="px-4 py-3 text-left">Type</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-left hidden sm:table-cell">Job</th>
                            <th className="px-4 py-3 text-left hidden md:table-cell">Note</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--sf-border-light)]">
                          {entries.map(e => (
                            <tr key={e.id} className="hover:bg-[var(--sf-bg-hover)]">
                              <td className="px-4 py-3 text-[var(--sf-ink-2)]">{formatDate(e.effective_date)}</td>
                              <td className="px-4 py-3 font-medium text-[var(--sf-ink)]">
                                {e.team_members ? `${e.team_members.first_name || ''} ${e.team_members.last_name || ''}`.trim() : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${TYPE_COLORS[e.type] || 'bg-[var(--sf-bg-page)]'}`}>
                                  {TYPE_LABELS[e.type] || e.type}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${parseFloat(e.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(e.amount)}
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell text-[var(--sf-ink-3)]">
                                {e.job_id ? (
                                  <button onClick={() => navigate(`/job/${e.job_id}`)} className="text-[var(--sf-blue-500)] hover:underline">#{e.job_id}</button>
                                ) : '-'}
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell text-[var(--sf-ink-3)] max-w-[200px] truncate">{e.note || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                {e.payout_batch_id ? (
                                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Paid</span>
                                ) : (
                                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full">Unpaid</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--sf-border-soft)] flex items-center justify-between text-sm text-[var(--sf-ink-3)]">
                      <span>{entriesTotal} total entries</span>
                      <div className="flex gap-2">
                        <button disabled={entriesPage <= 1} onClick={() => setEntriesPage(p => p - 1)}
                          className="px-3 py-1 border border-[var(--sf-border-soft)] rounded hover:bg-[var(--sf-bg-hover)] disabled:opacity-50">Prev</button>
                        <span className="px-3 py-1">Page {entriesPage}</span>
                        <button disabled={entries.length < 50} onClick={() => setEntriesPage(p => p + 1)}
                          className="px-3 py-1 border border-[var(--sf-border-soft)] rounded hover:bg-[var(--sf-bg-hover)] disabled:opacity-50">Next</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════ PAYOUTS TAB ═══════════════ */}
          {activeTab === 'payouts' && (() => {
            // Build per-member payout status from batches + team members
            const periodBatches = batches.filter(batch => {
              const batchStart = batch.period_start
              const batchEnd = batch.period_end
              if (!batchStart || !batchEnd) return true
              // Batch overlaps selected period if its range intersects
              if (payoutsEndDate && batchStart > payoutsEndDate) return false
              if (payoutsStartDate && batchEnd < payoutsStartDate) return false
              return true
            }).filter(b => b.status !== 'cancelled')

            // Group batches by team member
            const batchesByMember = {}
            periodBatches.forEach(b => {
              const mid = b.team_member_id
              if (!batchesByMember[mid]) batchesByMember[mid] = []
              batchesByMember[mid].push(b)
            })

            // Build rows: active members always, inactive only if they have a batch
            const memberRows = teamMembers
              .filter(tm => tm.status !== 'inactive' || batchesByMember[tm.id]?.length > 0)
              .map(tm => {
                const memberBatches = batchesByMember[tm.id] || []
                const paidBatch = memberBatches.find(b => b.status === 'paid')
                const pendingBatch = memberBatches.find(b => b.status === 'pending')
                let status = 'skipped'
                let activeBatch = null
                if (paidBatch) { status = 'paid'; activeBatch = paidBatch }
                else if (pendingBatch) { status = 'pending'; activeBatch = pendingBatch }
                return { tm, status, activeBatch, batches: memberBatches }
              }).sort((a, b) => {
                const order = { pending: 0, paid: 1, skipped: 2 }
                if (order[a.status] !== order[b.status]) return (order[a.status] ?? 3) - (order[b.status] ?? 3)
                return (a.tm.first_name || '').localeCompare(b.tm.first_name || '')
              })

            // Apply filter
            const filteredRows = payoutsFilter === 'all' ? memberRows : memberRows.filter(r => r.status === payoutsFilter)

            // Counts and totals for summary
            const counts = { all: memberRows.length, paid: 0, pending: 0, skipped: 0 }
            const totals = { paid: 0, pending: 0 }
            memberRows.forEach(r => {
              counts[r.status]++
              if (r.activeBatch) totals[r.status] += parseFloat(r.activeBatch.total_amount) || 0
            })
            const pendingBatchIds = memberRows.filter(r => r.status === 'pending' && r.activeBatch).map(r => r.activeBatch.id)

            return (
            <div>
              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-4 mb-4">
                <QuickTimeFilter
                  payoutFrequency={payoutFrequency} payoutStartDay={payoutStartDay}
                  activeRange={payoutsQuickRange}
                  onSelect={setPayoutsQuickRange}
                  startDate={payoutsStartDate}
                  endDate={payoutsEndDate}
                  onStartChange={setPayoutsStartDate}
                  onEndChange={setPayoutsEndDate}
                />
              </div>

              {/* Filter buttons */}
              <div className="flex gap-2 mb-4">
                {[
                  { key: 'all', label: 'All', color: 'bg-gray-100 text-gray-700', activeColor: 'bg-gray-700 text-white' },
                  { key: 'paid', label: 'Paid', color: 'bg-green-50 text-green-700', activeColor: 'bg-green-600 text-white' },
                  { key: 'pending', label: 'Pending', color: 'bg-yellow-50 text-yellow-700', activeColor: 'bg-yellow-500 text-white' },
                  { key: 'skipped', label: 'Skipped', color: 'bg-gray-50 text-gray-500', activeColor: 'bg-gray-500 text-white' },
                ].map(f => (
                  <button key={f.key} onClick={() => setPayoutsFilter(f.key)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${payoutsFilter === f.key ? f.activeColor : f.color} hover:opacity-90`}>
                    {f.label} <span className="ml-1 opacity-75">({counts[f.key]})</span>
                  </button>
                ))}
              </div>

              {/* Summary panel */}
              {(counts.paid > 0 || counts.pending > 0) && (
                <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] p-4 mb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-[var(--sf-ink-3)] uppercase">Pending</div>
                      <div className="text-xl font-bold text-yellow-600">{formatCurrency(totals.pending)}</div>
                      <div className="text-xs text-[var(--sf-ink-3)]">{counts.pending} members</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--sf-ink-3)] uppercase">Paid</div>
                      <div className="text-xl font-bold text-green-600">{formatCurrency(totals.paid)}</div>
                      <div className="text-xs text-[var(--sf-ink-3)]">{counts.paid} members</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--sf-ink-3)] uppercase">Total</div>
                      <div className="text-xl font-bold text-[var(--sf-ink)]">{formatCurrency(totals.pending + totals.paid)}</div>
                      <div className="text-xs text-[var(--sf-ink-3)]">{counts.paid + counts.pending} members</div>
                    </div>
                    <div className="flex items-center">
                      {pendingBatchIds.length > 0 && (
                        <button onClick={() => handleMarkAllPaid(pendingBatchIds)}
                          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5">
                          <Check size={16} /> Mark All as Paid ({counts.pending})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-[var(--sf-panel)] rounded-[10px] border border-[var(--sf-border-soft)] shadow-[var(--sf-shadow)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--sf-border-soft)] flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-[var(--sf-ink)]">Team Payouts</h2>
                  <button onClick={() => { setPayPeriodStart(payoutsStartDate); setPayPeriodEnd(payoutsEndDate); setShowPayoutModal(true); setModalError('') }}
                    className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1">
                    <Plus size={16} /> Create Payout
                  </button>
                </div>
                {batchesLoading ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">Loading...</div>
                ) : filteredRows.length === 0 ? (
                  <div className="p-8 text-center text-[var(--sf-ink-3)]">
                    <Banknote size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>No team members match the selected filter.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--sf-border-light)]">
                    {filteredRows.map(({ tm, status, activeBatch }) => (
                      <div key={tm.id}>
                        <div className={`px-5 py-4 flex items-center justify-between ${activeBatch ? 'hover:bg-[var(--sf-bg-hover)] cursor-pointer' : ''}`}
                          onClick={() => activeBatch && handleViewBatch(activeBatch.id)}>
                          <div className="flex items-center gap-4">
                            {activeBatch ? (
                              <button className="text-[var(--sf-ink-3)]">
                                {expandedBatch === activeBatch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            ) : (
                              <div className="w-4" />
                            )}
                            <div>
                              <div className="font-medium text-[var(--sf-ink)]">
                                {tm.first_name} {tm.last_name || ''}
                                {tm.status === 'inactive' && <span className="ml-1.5 text-xs text-gray-400 font-normal">(inactive)</span>}
                              </div>
                              {activeBatch ? (
                                <div className="text-xs text-[var(--sf-ink-3)]">
                                  {formatDate(activeBatch.period_start)} - {formatDate(activeBatch.period_end)}
                                </div>
                              ) : (
                                <div className="text-xs text-[var(--sf-ink-3)]">No entries</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {activeBatch ? (
                              <div className="text-right">
                                <div className={`text-lg font-bold ${parseFloat(activeBatch.total_amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(activeBatch.total_amount)}
                                </div>
                                {parseFloat(activeBatch.total_amount) < 0 && (
                                  <div className="text-[10px] text-red-500">owes company</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-lg font-bold text-gray-300">—</div>
                            )}
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              status === 'paid' ? 'bg-green-100 text-green-700' :
                              status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{status}</span>
                            {activeBatch && (
                              <div className="flex gap-1">
                                {status === 'pending' && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); handleMarkPaid(activeBatch.id) }}
                                      className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                                      <Check size={12} className="inline mr-1" />Pay
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleCancelBatch(activeBatch.id) }}
                                      className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">
                                      <X size={12} className="inline mr-1" />Cancel
                                    </button>
                                  </>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(activeBatch.id) }}
                                  className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600" title="Delete batch — entries become unpaid">
                                  <Trash2 size={12} className="inline mr-1" />Delete
                                </button>
                                {parseFloat(activeBatch.total_amount) < 0 && (
                                  <button onClick={async (e) => {
                                    e.stopPropagation()
                                    const amt = Math.abs(parseFloat(activeBatch.total_amount))
                                    const name = `${tm.first_name} ${tm.last_name || ''}`.trim()
                                    if (!window.confirm(`Write off ${formatCurrency(amt)} for ${name}?\n\nThis creates a +${formatCurrency(amt)} adjustment and rebuilds the batch to $0.00.`)) return
                                    try {
                                      await ledgerAPI.adjustAndRebuildBatch({
                                        batchId: activeBatch.id,
                                        amount: amt,
                                        note: `Write off negative balance for ${name}`
                                      })
                                      fetchBatches(); fetchBalances()
                                      alert(`Done — ${name} adjusted by +${formatCurrency(amt)}, batch rebuilt to $0.00`)
                                    } catch (err) { alert(err.response?.data?.error || 'Failed to adjust') }
                                  }}
                                    className="px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600" title="Write off and rebuild batch to $0">
                                    <ArrowUpDown size={12} className="inline mr-1" />Adjust
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {activeBatch && expandedBatch === activeBatch.id && batchDetail && (
                          <div className="px-5 pb-4 bg-[var(--sf-bg-page)] border-t border-[var(--sf-border-soft)]">
                            <div className="mt-3">
                              {activeBatch.paid_at && <p className="text-xs text-[var(--sf-ink-3)] mb-2">Paid on: {formatDate(activeBatch.paid_at)}</p>}
                              {activeBatch.note && <p className="text-xs text-[var(--sf-ink-3)] mb-2">Note: {activeBatch.note}</p>}
                              <table className="w-full text-xs mt-2">
                                <thead className="text-[var(--sf-ink-3)] uppercase">
                                  <tr>
                                    <th className="py-1 text-left">Date</th>
                                    <th className="py-1 text-left">Type</th>
                                    <th className="py-1 text-right">Amount</th>
                                    <th className="py-1 text-left">Note</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--sf-border-light)]">
                                  {(batchDetail.entries || []).map(e => (
                                    <tr key={e.id}>
                                      <td className="py-1">{formatDate(e.effective_date)}</td>
                                      <td className="py-1">
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${TYPE_COLORS[e.type]}`}>
                                          {TYPE_LABELS[e.type] || e.type}
                                        </span>
                                      </td>
                                      <td className={`py-1 text-right font-medium ${parseFloat(e.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(e.amount)}
                                      </td>
                                      <td className="py-1 text-[var(--sf-ink-3)] truncate max-w-[200px]">{e.note || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )
          })()}

          {/* ═══════════════ HISTORY TAB — design-pack full spec ══════════ */}
          {activeTab === 'history' && (
            <PayrollHistoryView
              batches={batches || []}
              teamMembers={teamMembers}
              historyYear={historyYear}
              setHistoryYear={setHistoryYear}
              historyStatusFilter={historyStatusFilter}
              setHistoryStatusFilter={setHistoryStatusFilter}
              onViewBatch={handleViewBatch}
              onCreatePayout={() => { setShowPayoutModal(true); setModalError('') }}
            />
          )}

          {activeTab === 'paystubs' && (
            <PaystubsTab
              teamMembers={teamMembers}
              payoutBatches={batches || []}
              periodStart={startDate}
              periodEnd={endDate}
            />
          )}

          {activeTab === 'drafts' && (
            <EmptyTab
              icon={FileText}
              title="No draft payroll runs"
              body="Saved draft payroll runs will appear here. Drafts let you stage adjustments — tip review, incentive grants, bonus add-ons — before processing the batch."
              cta="Start a draft"
              onCta={() => { setShowPayoutModal(true); setModalError('') }}
            />
          )}

          {activeTab === 'time' && (
            <PayrollTimeView
              payrollData={payrollData}
              weekAnchor={timeWeekAnchor}
              setWeekAnchor={setTimeWeekAnchor}
              showExceptionsOnly={timeShowExceptionsOnly}
              setShowExceptionsOnly={setTimeShowExceptionsOnly}
            />
          )}

          {activeTab === 'tax' && (
            <EmptyTab
              icon={FileText}
              title="Tax forms — coming soon"
              body="Year-end 1099-NEC and W-2 generation, plus quarterly summaries, will appear here. Until then, export the Payroll table as CSV for accountant handoff."
              cta="Export CSV"
              onCta={handleExport}
            />
          )}

        </div>

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--sf-ink)] mb-4">Create Adjustment</h3>
            {modalError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{modalError}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Team Member *</label>
                <select value={adjTeamMember} onChange={e => {
                  const tmId = e.target.value
                  setAdjTeamMember(tmId)
                  if (tmId) {
                    const bal = balances.find(b => String(b.team_member_id) === tmId)
                    if (bal && parseFloat(bal.current_balance) !== 0) {
                      const amt = parseFloat(bal.current_balance)
                      setAdjAmount(Math.abs(amt).toFixed(2))
                      setAdjDirection(amt < 0 ? 'positive' : 'negative')
                      if (!adjNote) setAdjNote(amt < 0 ? 'Write off negative balance (owes company)' : 'Balance adjustment')
                    }
                  }
                }}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select...</option>
                  {teamMembers.map(tm => {
                    const bal = balances.find(b => b.team_member_id === tm.id)
                    const amt = bal ? parseFloat(bal.current_balance) : 0
                    const marker = amt < 0 ? ` [owes ${formatCurrency(Math.abs(amt))}]` : amt > 0 ? ` [owed ${formatCurrency(amt)}]` : ''
                    return (
                      <option key={tm.id} value={tm.id}>
                        {tm.first_name} {tm.last_name}{tm.status === 'inactive' ? ' (inactive)' : ''}{marker}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Amount *</label>
                  <input type="number" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                    className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Direction</label>
                  <select value={adjDirection} onChange={e => setAdjDirection(e.target.value)}
                    className="border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="positive">+ Credit</option>
                    <option value="negative">- Debit</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Job ID (optional)</label>
                <input type="text" value={adjJobId} onChange={e => setAdjJobId(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="Job ID" />
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Reason / Note *</label>
                <textarea value={adjNote} onChange={e => setAdjNote(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Reason for adjustment..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdjustmentModal(false)} className="bg-white border border-[var(--sf-border-soft)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-ink-2)] hover:bg-[var(--sf-bg-hover)]">Cancel</button>
              <button onClick={handleCreateAdjustment} disabled={modalLoading}
                className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
                {modalLoading ? 'Creating...' : 'Create Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Collected Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--sf-ink)] mb-4">Record Cash</h3>
            {modalError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{modalError}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Cash Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCashType('paid_in_cash')}
                    className={`px-3 py-2.5 text-sm rounded-lg border-2 transition-colors ${
                      cashType === 'paid_in_cash'
                        ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
                        : 'border-[var(--sf-border-soft)] text-[var(--sf-ink-2)] hover:bg-[var(--sf-bg-page)]'
                    }`}>
                    <div className="font-medium">Paid in Cash</div>
                    <div className="text-xs mt-0.5 opacity-75">Reduces salary owed</div>
                  </button>
                  <button onClick={() => setCashType('cash_to_company')}
                    className={`px-3 py-2.5 text-sm rounded-lg border-2 transition-colors ${
                      cashType === 'cash_to_company'
                        ? 'border-blue-500 bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)] font-medium'
                        : 'border-[var(--sf-border-soft)] text-[var(--sf-ink-2)] hover:bg-[var(--sf-bg-page)]'
                    }`}>
                    <div className="font-medium">Cash to Company</div>
                    <div className="text-xs mt-0.5 opacity-75">Cashflow record only</div>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Team Member *</label>
                <select value={cashTeamMember} onChange={e => setCashTeamMember(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select...</option>
                  {teamMembers.map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.first_name} {tm.last_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Amount *</label>
                <input type="number" step="0.01" value={cashAmount} onChange={e => setCashAmount(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Job ID (optional)</label>
                <input type="text" value={cashJobId} onChange={e => setCashJobId(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="Job ID" />
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Note</label>
                <input type="text" value={cashNote} onChange={e => setCashNote(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="Optional note" />
              </div>
              {cashType === 'paid_in_cash' && (
                <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-700">
                  This will reduce the cleaner's payout balance by the entered amount.
                </div>
              )}
              {cashType === 'cash_to_company' && (
                <div className="bg-[var(--sf-blue-50)] rounded-lg p-3 text-xs text-[var(--sf-blue-500)]">
                  This records cash delivered to the company. It does not affect the cleaner's salary balance.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCashModal(false); setCashType('paid_in_cash') }} className="bg-white border border-[var(--sf-border-soft)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-ink-2)] hover:bg-[var(--sf-bg-hover)]">Cancel</button>
              <button onClick={handleRecordCash} disabled={modalLoading}
                className={`px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 ${
                  cashType === 'cash_to_company' ? 'bg-[var(--sf-blue-500)] hover:bg-[var(--sf-blue-600)]' : 'bg-orange-500 hover:bg-orange-600'
                }`}>
                {modalLoading ? 'Recording...' : 'Record Cash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Batch Modal */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-[var(--sf-ink)] mb-4">Create Payout Batch</h3>
            <p className="text-xs text-[var(--sf-ink-3)] mb-3">Groups all unpaid ledger entries in the selected period into a payout batch.</p>
            {modalError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-3">{modalError}</div>}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Team Member *</label>
                <select value={payTeamMember} onChange={e => setPayTeamMember(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Select...</option>
                  <option value="all">All Active Members</option>
                  {teamMembers.filter(tm => tm.status === 'active').map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.first_name} {tm.last_name}</option>
                  ))}
                  {teamMembers.some(tm => tm.status === 'inactive') && (
                    <option disabled>── Inactive ──</option>
                  )}
                  {teamMembers.filter(tm => tm.status === 'inactive').map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.first_name} {tm.last_name} (inactive)</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Period Start *</label>
                  <input type="date" value={payPeriodStart} onChange={e => setPayPeriodStart(e.target.value)}
                    className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Period End *</label>
                  <input type="date" value={payPeriodEnd} onChange={e => setPayPeriodEnd(e.target.value)}
                    className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" />
                </div>
                <button type="button" onClick={() => { setPayPeriodStart('2024-01-01'); setPayPeriodEnd(toLocalDateString(new Date())) }}
                  className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 whitespace-nowrap">
                  All Time
                </button>
              </div>
              <div>
                <label className="text-sm text-[var(--sf-ink-2)] mb-1 block">Note</label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                  className="w-full border border-[var(--sf-border-soft)] rounded-lg px-3 py-2 text-sm" placeholder="Optional note" />
              </div>

              {/* Pay-in-advance toggle */}
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  payIncludeScheduled
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-[var(--sf-border-soft)] bg-white hover:bg-[var(--sf-bg-hover)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={payIncludeScheduled}
                  onChange={e => setPayIncludeScheduled(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--sf-ink)]">
                    Include scheduled jobs
                  </div>
                  <div className="text-xs text-[var(--sf-ink-3)] mt-0.5">
                    Marks scheduled jobs in this period as <strong>completed</strong> before
                    the payout. Use when paying in advance — once batched, those earnings
                    can&apos;t be reversed by cancelling the job later.
                  </div>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowPayoutModal(false)} className="bg-white border border-[var(--sf-border-soft)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-ink-2)] hover:bg-[var(--sf-bg-hover)]">Cancel</button>
              <button onClick={handleCreatePayout} disabled={modalLoading}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {modalLoading ? 'Creating...' : 'Create Payout Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Payroll
// deploy 1774912665
