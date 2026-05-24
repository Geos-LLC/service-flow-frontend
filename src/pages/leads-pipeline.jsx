import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Settings, 
  User, 
  Mail, 
  Phone, 
  Building, 
  DollarSign,
  MoreVertical,
  Edit,
  Trash2,
  X,
  Save,
  GripVertical,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  MapPin,
  Home,
  Loader2,
  Briefcase,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Filter as FilterIcon,
  LayoutGrid,
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react';
import { leadsAPI, teamAPI, servicesAPI, leadSourcesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatPhoneNumber } from '../utils/phoneFormatter';
import Notification, { useNotification } from '../components/notification';
import TaskCard from '../components/task-card';
import CreateTaskModal from '../components/create-task-modal';
import ConvertLeadModal from '../components/convert-lead-modal';
import MobileBottomNav from '../components/mobile-bottom-nav';
import AddressAutocompleteLeads from '../components/address-autocomplete-leads';
import MobileHeader from '../components/mobile-header';
import ServiceSelectionModal from '../components/service-selection-modal';
import SfDatePicker from '../components/sf-date-picker';

// ─────────────────────────────────────────────────────────────────────────
// LeadsDesign tab views — pulled from ADDON_leads_tabs.md
//
// Three sibling views to the existing kanban: a dense List, a Sources
// (channel attribution) view, and an Owners (sales rep) leaderboard.
// All three read the same `leads` array the kanban uses.
// ─────────────────────────────────────────────────────────────────────────

const SOURCE_META = {
  'Website':       { color: '#2563EB', bg: '#DBEAFE' },
  'Google':        { color: '#4285F4', bg: '#E8F0FE' },
  'Yelp':          { color: '#D32323', bg: '#FEE2E2' },
  'Referral':      { color: '#16A34A', bg: '#DCFCE7' },
  'Instagram':     { color: '#E1306C', bg: '#FCE4EC' },
  'Facebook':      { color: '#1877F2', bg: '#E3EBF6' },
  'Cold call':     { color: '#475569', bg: '#F1F5F9' },
  'Other':         { color: '#475569', bg: '#F1F5F9' },
}
const sourceMeta = (s) => SOURCE_META[s] || SOURCE_META['Other']

const stageColor = (stage) => stage?.color || '#94A3B8'

const fmtMoney = (n) => `$${(parseFloat(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

const StagePill = ({ stage }) => {
  if (!stage) return <span className="text-[11px] text-[var(--sf-text-muted)]">—</span>
  const c = stageColor(stage)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md whitespace-nowrap"
      style={{
        background: `${c}1a`,
        color: c,
        fontSize: 11,
        fontWeight: 600,
        border: `1px solid ${c}33`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {stage.name}
    </span>
  )
}

const PriorityDot = ({ priority }) => {
  const meta = {
    high: { c: '#DC2626', label: 'High' },
    med:  { c: '#D97706', label: 'Med' },
    medium: { c: '#D97706', label: 'Med' },
    low:  { c: '#94A3B8', label: 'Low' },
  }[String(priority || '').toLowerCase()] || { c: '#CBD5E1', label: '—' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--sf-text-secondary)]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.c }} />
      {meta.label}
    </span>
  )
}

const ageDays = (lead) => {
  const created = lead.created_at || lead.createdAt
  if (!created) return 0
  const d = new Date(created)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
}

const ageLabel = (lead) => {
  const days = ageDays(lead)
  if (days === 0) {
    const created = lead.created_at || lead.createdAt
    if (!created) return '—'
    const hours = Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / (1000 * 60 * 60)))
    return hours <= 0 ? 'just now' : `${hours}h`
  }
  if (days >= 7) {
    const weeks = Math.floor(days / 7)
    return `${weeks}w`
  }
  return `${days}d`
}

const KpiTile = ({ label, value, sub, accent }) => (
  <div className="bg-white rounded-[10px] border border-[var(--sf-border-light)] shadow-sm px-4 py-3">
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[var(--sf-text-muted)] font-medium">{label}</span>
      {accent && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
    </div>
    <div className="text-[22px] font-bold text-[var(--sf-text-primary)] mt-1.5 leading-none" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
    {sub && <div className="text-[11px] text-[var(--sf-text-muted)] mt-1">{sub}</div>}
  </div>
)

// ── List tab ──
const LeadsListTabView = ({ leads, teamMembers, stages, selected, setSelected, sort, setSort, onOpenLead }) => {
  const stageById = new Map(stages.map(s => [s.id, s]))
  const wonStageIds = new Set(stages.filter(s => /win|won/i.test(s.name)).map(s => s.id))
  const lostStageIds = new Set(stages.filter(s => /lost/i.test(s.name)).map(s => s.id))
  const isWon = (l) => wonStageIds.has(l.stage_id)
  const isLost = (l) => lostStageIds.has(l.stage_id)
  const isClosed = (l) => isWon(l) || isLost(l)

  const memberById = new Map(teamMembers.map(m => [m.id, m]))
  const ownerName = (l) => {
    const id = l.assigned_to_user_id || l.assigned_to
    const m = memberById.get(id)
    if (!m) return null
    return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email
  }
  const ownerInitials = (l) => {
    const n = ownerName(l)
    if (!n) return null
    return n.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  }

  // KPI rollups
  const activeLeads = leads.filter(l => !isClosed(l))
  const pipelineValue = activeLeads.reduce((s, l) => s + (parseFloat(l.value) || 0), 0)
  const highPriority = leads.filter(l => /high/i.test(l.priority || '')).length
  const stalled = activeLeads.filter(l => ageDays(l) > 7).length
  const newThisWeek = leads.filter(l => ageDays(l) <= 7).length
  const avgValue = leads.length > 0 ? leads.reduce((s, l) => s + (parseFloat(l.value) || 0), 0) / leads.length : 0

  const sortedLeads = [...leads].sort((a, b) => {
    if (sort === 'value') return (parseFloat(b.value) || 0) - (parseFloat(a.value) || 0)
    if (sort === 'stage') {
      const ai = stages.findIndex(s => s.id === a.stage_id)
      const bi = stages.findIndex(s => s.id === b.stage_id)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    }
    return ageDays(a) - ageDays(b)
  })

  const allSelected = sortedLeads.length > 0 && sortedLeads.every(l => selected.has(l.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sortedLeads.map(l => l.id)))
  }
  const toggleOne = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const tableGross = sortedLeads.reduce((s, l) => s + (parseFloat(l.value) || 0), 0)

  return (
    <div>
      {/* 6-KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiTile label="Active pipeline" value={fmtMoney(pipelineValue)} sub={`${activeLeads.length} open`} accent="#2563EB" />
        <KpiTile label="Total leads"     value={leads.length}             sub="all-time"                 accent="#16A34A" />
        <KpiTile label="High priority"   value={highPriority}             sub="needs attention"          accent="#DC2626" />
        <KpiTile label="Stalled > 7d"    value={stalled}                  sub="no recent activity"       accent="#D97706" />
        <KpiTile label="New this week"   value={newThisWeek}              sub="last 7 days"              accent="#7C3AED" />
        <KpiTile label="Avg lead value"  value={fmtMoney(avgValue)}       sub="across all stages"        accent="#0F172A" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {selected.size > 0 ? (
          <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-md" style={{ background: '#DBEAFE', border: '1px solid rgba(37,99,235,0.33)' }}>
            <span className="text-[12px] font-semibold text-[var(--sf-blue-500)]">✓ {selected.size} selected</span>
            <button className="text-[12px] text-[var(--sf-blue-500)] hover:underline">Assign owner</button>
            <button className="text-[12px] text-[var(--sf-blue-500)] hover:underline">Change stage</button>
            <button className="text-[12px] text-[var(--sf-blue-500)] hover:underline">Add task</button>
            <button className="text-[12px] text-red-600 hover:underline font-semibold">Delete</button>
          </div>
        ) : (
          <div className="text-[12.5px] text-[var(--sf-text-muted)]">
            Showing <b className="text-[var(--sf-text-primary)]">{sortedLeads.length}</b> lead{sortedLeads.length === 1 ? '' : 's'}
          </div>
        )}
        <div className="flex-1" />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] bg-white border border-[var(--sf-border-light)] rounded-md text-[var(--sf-text-secondary)]"
        >
          <option value="age">Sort: Newest</option>
          <option value="value">Sort: Highest value</option>
          <option value="stage">Sort: By stage</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[12px] border border-[var(--sf-border-light)] shadow-sm overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--sf-bg-page)', borderBottom: '1px solid var(--sf-border-light)' }}>
            <tr>
              <th className="px-3 py-2.5" style={{ width: 36 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 70 }}>ID</th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em' }}>Lead</th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 110 }}>Source</th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 130 }}>Stage</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 110 }}>Value</th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 90 }}>Priority</th>
              <th className="px-3 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 130 }}>Owner</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 70 }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {sortedLeads.map((l) => {
              const stage = stageById.get(l.stage_id)
              const sMeta = sourceMeta(l.source)
              const isSel = selected.has(l.id)
              const closed = isClosed(l)
              const lost = isLost(l)
              const aDays = ageDays(l)
              return (
                <tr
                  key={l.id}
                  className="hover:bg-[var(--sf-bg-hover)] cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--sf-border-light)',
                    opacity: closed && !isSel ? 0.7 : 1,
                    background: isSel ? 'rgba(37,99,235,0.07)' : 'transparent',
                  }}
                  onClick={() => onOpenLead(l)}
                >
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleOne(l.id)} />
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[var(--sf-text-secondary)]" style={{ fontFamily: 'var(--sf-font-mono, ui-monospace, monospace)' }}>
                    L-{String(l.id).slice(-4).padStart(4, '0')}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex-shrink-0 rounded-md inline-flex items-center justify-center"
                        style={{
                          width: 28, height: 28,
                          background: `${stageColor(stage)}1a`,
                          color: stageColor(stage),
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {(l.name || l.contact_name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[13px] font-semibold text-[var(--sf-text-primary)] truncate"
                          style={lost ? { textDecoration: 'line-through' } : undefined}
                        >
                          {l.name || l.contact_name || 'Untitled lead'}
                        </div>
                        {(l.notes || l.description) && (
                          <div className="text-[11px] text-[var(--sf-text-muted)] truncate" style={{ maxWidth: 280 }}>
                            {l.notes || l.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {l.source ? (
                      <span
                        className="inline-flex items-center px-2 py-[2px] rounded-md whitespace-nowrap"
                        style={{ background: sMeta.bg, color: sMeta.color, fontSize: 11, fontWeight: 600 }}
                      >
                        {l.source}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--sf-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StagePill stage={stage} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13.5px] font-bold text-[var(--sf-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {l.value ? fmtMoney(l.value) : <span className="text-[var(--sf-text-muted)] font-normal">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <PriorityDot priority={l.priority} />
                  </td>
                  <td className="px-3 py-2.5">
                    {ownerName(l) ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className="flex-shrink-0 rounded-full inline-flex items-center justify-center"
                          style={{
                            width: 22, height: 22,
                            background: 'rgba(37,99,235,0.15)',
                            color: 'var(--sf-blue-500)',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {ownerInitials(l)}
                        </div>
                        <span className="text-[12px] text-[var(--sf-text-primary)] truncate">
                          {ownerName(l).split(' ')[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--sf-text-muted)] italic">Unassigned</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-[12px]"
                    style={{
                      fontFamily: 'var(--sf-font-mono, ui-monospace, monospace)',
                      color: aDays > 7 ? '#D97706' : 'var(--sf-text-secondary)',
                      fontWeight: aDays > 7 ? 700 : 500,
                    }}
                  >
                    {closed ? 'closed' : ageLabel(l)}
                  </td>
                </tr>
              )
            })}
            {sortedLeads.length === 0 && (
              <tr>
                <td colSpan="9" className="px-6 py-12 text-center text-[12.5px] text-[var(--sf-text-muted)]">
                  No leads match the current filters.
                </td>
              </tr>
            )}
          </tbody>
          {sortedLeads.length > 0 && (
            <tfoot style={{ background: 'var(--sf-bg-page)', borderTop: '1px solid var(--sf-border-light)' }}>
              <tr>
                <td colSpan="5" className="px-3 py-3 text-[11px] font-bold uppercase text-[var(--sf-text-secondary)]" style={{ letterSpacing: '.04em' }}>
                  {sortedLeads.length} lead{sortedLeads.length === 1 ? '' : 's'} · Total
                </td>
                <td className="px-3 py-3 text-right text-[14px] font-bold text-[var(--sf-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(tableGross)}
                </td>
                <td colSpan="3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Sources tab ──
const LeadsSourcesTabView = ({ leads, stages }) => {
  const stageById = new Map(stages.map(s => [s.id, s]))
  const isWon = (l) => /win|won/i.test(stageById.get(l.stage_id)?.name || '')
  const isLost = (l) => /lost/i.test(stageById.get(l.stage_id)?.name || '')

  const grouped = {}
  leads.forEach(l => {
    const key = l.source || 'Other'
    if (!grouped[key]) grouped[key] = { name: key, leads: 0, value: 0, won: 0, wonValue: 0, lost: 0, active: 0 }
    grouped[key].leads += 1
    grouped[key].value += parseFloat(l.value) || 0
    if (isWon(l)) { grouped[key].won += 1; grouped[key].wonValue += parseFloat(l.value) || 0 }
    else if (isLost(l)) grouped[key].lost += 1
    else grouped[key].active += 1
  })
  const sources = Object.values(grouped).sort((a, b) => b.value - a.value)
  const maxLeads = Math.max(1, ...sources.map(s => s.leads))

  const totalLeads = leads.length
  const totalPipeline = leads.reduce((s, l) => s + (isWon(l) || isLost(l) ? 0 : parseFloat(l.value) || 0), 0)
  const totalClosed = sources.reduce((s, x) => s + x.wonValue, 0)
  const topSource = sources[0]
  const bestConv = sources
    .filter(s => s.won + s.lost >= 3)
    .map(s => ({ ...s, rate: s.won / (s.won + s.lost) }))
    .sort((a, b) => b.rate - a.rate)[0]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiTile label="Total leads"     value={totalLeads}                          sub="this period"           accent="#2563EB" />
        <KpiTile label="Pipeline value"  value={fmtMoney(totalPipeline)}             sub="active only"           accent="#16A34A" />
        <KpiTile label="Closed value"    value={fmtMoney(totalClosed)}               sub="won"                   accent="#16A34A" />
        <KpiTile label="Top source"      value={topSource?.name || '—'}              sub={topSource ? `${topSource.leads} leads` : ''} accent="#7C3AED" />
        <KpiTile label="Best conversion" value={bestConv ? `${(bestConv.rate * 100).toFixed(0)}%` : '—'} sub={bestConv ? bestConv.name : 'needs sample'} accent="#D97706" />
        <KpiTile label="Sources"         value={sources.length}                       sub="distinct channels"     accent="#0F172A" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
        {sources.map((s, idx) => {
          const total = s.won + s.lost
          const winRate = total > 0 ? (s.won / total) * 100 : null
          const winColor = winRate == null ? 'var(--sf-text-muted)' : winRate >= 50 ? '#16A34A' : winRate >= 25 ? '#D97706' : '#DC2626'
          const meta = sourceMeta(s.name)
          const wonW = (s.won / maxLeads) * 100
          const activeW = (s.active / maxLeads) * 100
          const lostW = (s.lost / maxLeads) * 100
          return (
            <div key={s.name} className="bg-white rounded-[12px] border border-[var(--sf-border-light)] shadow-sm p-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex-shrink-0 rounded-md inline-flex items-center justify-center"
                  style={{ width: 38, height: 38, background: meta.bg, color: meta.color, fontSize: 14, fontWeight: 700 }}
                >
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold text-[var(--sf-text-primary)] truncate">{s.name}</span>
                    <span className="inline-flex items-center px-1.5 py-[1px] rounded-md text-[10px] font-bold" style={{ background: 'var(--sf-bg-page)', color: 'var(--sf-text-muted)' }}>
                      #{idx + 1}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="text-[22px] font-bold text-[var(--sf-text-primary)] leading-none" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.leads}</div>
                  <div className="text-[10px] uppercase text-[var(--sf-text-muted)] mt-1" style={{ letterSpacing: '.05em' }}>Leads</div>
                </div>
                <div>
                  <div className="text-[22px] font-bold leading-none" style={{ color: '#16A34A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmtMoney(s.value)}</div>
                  <div className="text-[10px] uppercase text-[var(--sf-text-muted)] mt-1" style={{ letterSpacing: '.05em' }}>Pipeline</div>
                </div>
                <div>
                  <div className="text-[22px] font-bold leading-none" style={{ color: winColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                    {winRate == null ? '—' : `${Math.round(winRate)}%`}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--sf-text-muted)] mt-1" style={{ letterSpacing: '.05em' }}>Win rate</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[var(--sf-text-muted)] mb-1.5">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#16A34A' }} /> Won {s.won}</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#2563EB' }} /> Active {s.active}</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: '#CBD5E1' }} /> Lost {s.lost}</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--sf-bg-page)' }}>
                {wonW > 0 && <div style={{ width: `${wonW}%`, background: '#16A34A' }} />}
                {activeW > 0 && <div style={{ width: `${activeW}%`, background: '#2563EB' }} />}
                {lostW > 0 && <div style={{ width: `${lostW}%`, background: '#CBD5E1' }} />}
              </div>
            </div>
          )
        })}
        {sources.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 bg-white rounded-[12px] border border-[var(--sf-border-light)] shadow-sm p-8 text-center text-[12.5px] text-[var(--sf-text-muted)]">
            No source attribution yet — set <b>source</b> on leads to see this breakdown.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Owners tab ──
const LeadsOwnersTabView = ({ leads, teamMembers, stages }) => {
  const stageById = new Map(stages.map(s => [s.id, s]))
  const isWon = (l) => /win|won/i.test(stageById.get(l.stage_id)?.name || '')
  const isLost = (l) => /lost/i.test(stageById.get(l.stage_id)?.name || '')

  const memberById = new Map(teamMembers.map(m => [m.id, m]))
  const memberLabel = (id) => {
    const m = memberById.get(id)
    if (!m) return 'Unassigned'
    return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Cleaner'
  }
  const memberInitials = (id) => {
    const m = memberById.get(id)
    if (!m) return '—'
    return `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase() || '—'
  }

  const grouped = {}
  leads.forEach(l => {
    const id = l.assigned_to_user_id || l.assigned_to || 'unassigned'
    if (!grouped[id]) grouped[id] = { id, leads: 0, value: 0, won: 0, wonValue: 0, lost: 0, active: 0, activeValue: 0 }
    grouped[id].leads += 1
    grouped[id].value += parseFloat(l.value) || 0
    if (isWon(l)) { grouped[id].won += 1; grouped[id].wonValue += parseFloat(l.value) || 0 }
    else if (isLost(l)) grouped[id].lost += 1
    else { grouped[id].active += 1; grouped[id].activeValue += parseFloat(l.value) || 0 }
  })
  const rows = Object.values(grouped).sort((a, b) => b.activeValue - a.activeValue)

  const unassignedCount = grouped['unassigned']?.leads || 0
  const topPerformer = rows.find(r => r.id !== 'unassigned' && r.won > 0)

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiTile label="Owners assigned" value={rows.filter(r => r.id !== 'unassigned').length} sub="active reps" accent="#2563EB" />
        <KpiTile label="Top performer"   value={topPerformer ? memberLabel(topPerformer.id).split(' ')[0] : '—'} sub={topPerformer ? `${topPerformer.won} won` : 'no wins yet'} accent="#16A34A" />
        <KpiTile label="Avg per rep"     value={rows.length > 0 ? (leads.length / rows.length).toFixed(1) : '0'} sub="active leads / rep" accent="#7C3AED" />
        <KpiTile label="Unassigned"      value={unassignedCount} sub="needs owner" accent="#DC2626" />
        <KpiTile label="Avg response"    value="—" sub="needs touch tracking" accent="#D97706" />
        <KpiTile label="Overdue f/u"     value="—" sub="needs touch tracking" accent="#475569" />
      </div>

      <div className="bg-white rounded-[12px] border border-[var(--sf-border-light)] shadow-sm overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--sf-bg-page)', borderBottom: '1px solid var(--sf-border-light)' }}>
            <tr>
              <th className="px-4 py-2.5 text-left text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em' }}>Owner</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 80 }}>Leads</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 100 }}>Active</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 120 }}>Pipeline</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 120 }}>Closed</th>
              <th className="px-3 py-2.5 text-right text-[10.5px] font-bold text-[var(--sf-text-muted)] uppercase" style={{ letterSpacing: '.05em', width: 100 }}>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const total = r.won + r.lost
              const winRate = total > 0 ? (r.won / total) * 100 : null
              const winColor = winRate == null ? 'var(--sf-text-muted)' : winRate >= 50 ? '#16A34A' : winRate >= 25 ? '#D97706' : '#DC2626'
              const isUnassigned = r.id === 'unassigned'
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--sf-border-light)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex-shrink-0 rounded-full inline-flex items-center justify-center"
                        style={{
                          width: 30, height: 30,
                          background: isUnassigned ? 'var(--sf-bg-page)' : 'rgba(37,99,235,0.15)',
                          color: isUnassigned ? 'var(--sf-text-muted)' : 'var(--sf-blue-500)',
                          fontSize: 11, fontWeight: 700,
                        }}
                      >
                        {isUnassigned ? '?' : memberInitials(r.id)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--sf-text-primary)] truncate">
                          {isUnassigned ? 'Unassigned' : memberLabel(r.id)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-[13px] font-bold text-[var(--sf-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.leads}</td>
                  <td className="px-3 py-3 text-right text-[12.5px] text-[var(--sf-text-secondary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.active}</td>
                  <td className="px-3 py-3 text-right text-[13px] font-semibold text-[var(--sf-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(r.activeValue)}</td>
                  <td className="px-3 py-3 text-right text-[13px]" style={{ fontVariantNumeric: 'tabular-nums', color: r.wonValue > 0 ? '#16A34A' : 'var(--sf-text-muted)', fontWeight: r.wonValue > 0 ? 700 : 400 }}>
                    {r.wonValue > 0 ? fmtMoney(r.wonValue) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-[13px] font-bold" style={{ color: winColor, fontVariantNumeric: 'tabular-nums' }}>
                    {winRate == null ? '—' : `${Math.round(winRate)}%`}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-[12.5px] text-[var(--sf-text-muted)]">
                  No leads to attribute yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const LeadsPipeline = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notification, showNotification, hideNotification } = useNotification();
  const [pipeline, setPipeline] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  // LeadsDesign tabs — Pipeline (existing kanban) · List · Sources · Owners
  const [leadsTab, setLeadsTab] = useState('pipeline');
  const [listSelected, setListSelected] = useState(new Set());
  const [listSort, setListSort] = useState('age'); // 'age' | 'value' | 'stage'
  const [teamMembers, setTeamMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskFilter, setTaskFilter] = useState('all'); // 'all', 'pending', 'completed', 'overdue'
  const [showConvertLeadModal, setShowConvertLeadModal] = useState(false);
  const [expandedStages, setExpandedStages] = useState({}); // For mobile accordion view
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState({
    priceMin: '',
    priceMax: '',
    dateFrom: '',
    dateTo: '',
    location: '',
    source: '',
    serviceId: ''
  });

  // Modal states
  const [showCreateLeadModal, setShowCreateLeadModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [showEditStageModal, setShowEditStageModal] = useState(false);
  const [showLeadDetailsModal, setShowLeadDetailsModal] = useState(false);
  const [showServiceSelectionModal, setShowServiceSelectionModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead] = useState(null);
  const [editingStage, setEditingStage] = useState(null);
  
  // Selected service with modifiers for leads
  const [selectedServiceForLead, setSelectedServiceForLead] = useState(null);
  
  // Form states
  const [leadFormData, setLeadFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    source: '',
    notes: '',
    value: '',
    address: '',
    serviceId: ''
  });

  const splitLeadName = (fullName) => {
    const trimmed = (fullName || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return { firstName: '', lastName: '' };
    const parts = trimmed.split(' ');
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  };
  
  // Services and Zillow state
  const [services, setServices] = useState([]);
  const [zillowData, setZillowData] = useState(null);
  const [zillowLoading, setZillowLoading] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(null);
  
  // Lead sources - loaded from API (server-persisted)
  const [leadSources, setLeadSources] = useState([]);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showEditSourceDropdown, setShowEditSourceDropdown] = useState(false);
  const [customSource, setCustomSource] = useState('');
  const [editCustomSource, setEditCustomSource] = useState('');

  // Name autocomplete state
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // Load lead sources from API on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await leadSourcesAPI.list();
        let list = (data.sources || []).map(s => s.name);
        if (list.length === 0) {
          const seeded = await leadSourcesAPI.seed();
          list = (seeded.sources || []).map(s => s.name);
        }
        setLeadSources(list);
      } catch (e) {
        // Fallback to localStorage if API fails
        try {
          const saved = localStorage.getItem('leadSources');
          if (saved) setLeadSources(JSON.parse(saved));
          else setLeadSources(['Website', 'Referral', 'Cold Call', 'Social Media', 'Google', 'Thumbtack', 'Yelp', 'Facebook', 'Other']);
        } catch { setLeadSources(['Website', 'Referral', 'Cold Call', 'Social Media', 'Google', 'Thumbtack', 'Yelp', 'Facebook', 'Other']); }
      }
    })();
  }, []);

  // Helper function to add a custom source and set it as selected
  const addCustomSource = (newSource, isEdit = false) => {
    const trimmedSource = newSource.trim();
    if (!trimmedSource) return;

    // Check if source already exists
    if (leadSources.includes(trimmedSource)) {
      // Source exists, just select it
      setLeadFormData(prev => ({ ...prev, source: trimmedSource }));
      if (isEdit) {
        setEditCustomSource('');
        setShowEditSourceDropdown(false);
      } else {
        setCustomSource('');
        setShowSourceDropdown(false);
      }
      return;
    }

    // Add new source to the list (persist to API)
    const updatedSources = [...leadSources, trimmedSource];
    setLeadSources(updatedSources);
    leadSourcesAPI.create(trimmedSource).catch(() => {});
    
    // Use setTimeout to ensure the select has re-rendered with the new option
    setTimeout(() => {
      setLeadFormData(prev => ({ ...prev, source: trimmedSource }));
      if (isEdit) {
        setEditCustomSource('');
        setShowEditSourceDropdown(false);
      } else {
        setCustomSource('');
        setShowSourceDropdown(false);
      }
    }, 0);
  };
  
  const [stageFormData, setStageFormData] = useState({
    name: '',
    color: '#3B82F6'
  });
  
  // Drag and drop state
  const [draggedLead, setDraggedLead] = useState(null);
  const [draggedStage, setDraggedStage] = useState(null);
  // Card has to be clicked once to select before drag-and-drop turns on
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Pipeline kanban — native overflow-x scroll + click-drag pan on empty space
  const pipelineScrollRef = useRef(null);

  // Stage column width — uniform across all stages, persisted in localStorage
  const STAGE_WIDTH_KEY = 'sf_leads_stage_width';
  const STAGE_WIDTH_MIN = 180;
  const STAGE_WIDTH_MAX = 600;
  const STAGE_WIDTH_DEFAULT = 200;
  const [stageWidth, setStageWidth] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(STAGE_WIDTH_KEY), 10);
      if (Number.isFinite(saved) && saved >= STAGE_WIDTH_MIN && saved <= STAGE_WIDTH_MAX) return saved;
    } catch {}
    return STAGE_WIDTH_DEFAULT;
  });

  // Load pipeline, leads, team members, and services
  useEffect(() => {
    loadPipeline();
    loadLeads();
    loadTeamMembers();
    loadServices();
  }, []);

  // Click-and-drag anywhere on the kanban (empty space, stage headers) to pan horizontally.
  // Skips draggable cards, buttons, and form inputs so they keep their own interactions.
  const handleBoardMouseDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const t = e.target;
    if (t.closest && (
      t.closest('[draggable="true"]') ||
      t.closest('button') ||
      t.closest('a') ||
      t.closest('input,select,textarea')
    )) return;

    const wrapper = pipelineScrollRef.current;
    if (!wrapper) return;
    const scrollable = wrapper.scrollWidth - wrapper.clientWidth;
    if (scrollable <= 0) return;

    const startX = e.clientX;
    const startScroll = wrapper.scrollLeft;
    let moved = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        wrapper.style.cursor = 'grabbing';
        wrapper.style.userSelect = 'none';
      }
      if (moved) {
        ev.preventDefault();
        wrapper.scrollLeft = startScroll - dx;
      }
    };

    const onUp = () => {
      if (moved) {
        wrapper.style.cursor = '';
        wrapper.style.userSelect = '';
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Click on a card: first click selects (enabling drag), second click opens details
  const handleCardClick = (lead) => {
    if (selectedCardId === lead.id) {
      setSelectedLead(lead);
      setShowLeadDetailsModal(true);
      setSelectedCardId(null);
    } else {
      setSelectedCardId(lead.id);
    }
  };

  // Deselect when modal closes or pipeline reloads
  useEffect(() => {
    if (!showLeadDetailsModal) setSelectedCardId(null);
  }, [showLeadDetailsModal]);

  // Drag the right edge of any stage column to resize ALL stages uniformly
  const handleStageResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = stageWidth;
    let lastWidth = startWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      lastWidth = Math.max(STAGE_WIDTH_MIN, Math.min(STAGE_WIDTH_MAX, startWidth + dx));
      setStageWidth(lastWidth);
    };

    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem(STAGE_WIDTH_KEY, String(lastWidth)); } catch {}
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  
  // Helper function to decode HTML entities
  const decodeHtmlEntities = (text) => {
    if (!text || typeof text !== 'string') return text;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };
  
  const loadServices = async () => {
    try {
      if (user?.id) {
        const response = await servicesAPI.getAll(user.id);
        const servicesArray = response.services || response || [];
        // Decode HTML entities in service names and ensure price is properly formatted
        const processedServices = servicesArray.map(service => {
          // Parse modifiers if they exist (they might be stored as JSON string)
          let parsedModifiers = [];
          if (service.modifiers) {
            try {
              parsedModifiers = typeof service.modifiers === 'string' 
                ? JSON.parse(service.modifiers) 
                : service.modifiers;
            } catch (e) {
              console.warn('Error parsing service modifiers:', e);
              parsedModifiers = [];
            }
          }
          
          return {
            ...service,
            name: decodeHtmlEntities(service.name || ''),
            price: parseFloat(service.price) || parseFloat(service.service_price) || 0,
            parsedModifiers: Array.isArray(parsedModifiers) ? parsedModifiers : []
          };
        });
        setServices(processedServices);
      }
    } catch (err) {
      console.error('Error loading services:', err);
    }
  };
  
  // Calculate estimated price based on service and its modifiers
  const calculateServiceEstimatedPrice = (service) => {
    if (!service) return 0;
    
    // Use the selected service with modifiers if available, otherwise use the service from services list
    const serviceToUse = selectedServiceForLead || service;
    
    // Start with base service price (use edited price if available)
    let estimatedPrice = parseFloat(serviceToUse.editedServicePrice !== null 
      ? serviceToUse.editedServicePrice 
      : serviceToUse.price) || parseFloat(serviceToUse.service_price) || 0;
    
    // Add modifier prices if service has selected modifiers
    if (serviceToUse.selectedModifiers && serviceToUse.parsedModifiers && Array.isArray(serviceToUse.parsedModifiers)) {
      const selectedModifiers = serviceToUse.selectedModifiers;
      const editedModifierPrices = serviceToUse.editedModifierPrices || {};
      
      serviceToUse.parsedModifiers.forEach(modifier => {
        const modifierSelection = selectedModifiers[modifier.id];
        if (!modifierSelection) return;
        
        if (modifier.selectionType === 'quantity' && modifierSelection.quantities) {
          // Handle quantity-based modifiers
          Object.entries(modifierSelection.quantities).forEach(([optionId, quantity]) => {
            const option = modifier.options?.find(opt => opt.id === optionId || String(opt.id) === String(optionId));
            if (option && quantity > 0) {
              const priceKey = `${modifier.id}_option_${optionId}`;
              const optionPrice = editedModifierPrices[priceKey] !== undefined
                ? parseFloat(editedModifierPrices[priceKey])
                : parseFloat(option.price) || 0;
              estimatedPrice += optionPrice * quantity;
            }
          });
        } else if (modifier.selectionType === 'multi' && modifierSelection.selections) {
          // Handle multi-select modifiers
          const selections = Array.isArray(modifierSelection.selections) 
            ? modifierSelection.selections 
            : [modifierSelection.selections];
          selections.forEach(optionId => {
            const option = modifier.options?.find(opt => opt.id === optionId || String(opt.id) === String(optionId));
            if (option) {
              const priceKey = `${modifier.id}_option_${optionId}`;
              const optionPrice = editedModifierPrices[priceKey] !== undefined
                ? parseFloat(editedModifierPrices[priceKey])
                : parseFloat(option.price) || 0;
              estimatedPrice += optionPrice;
            }
          });
        } else if (modifier.selectionType === 'single' && modifierSelection.selection) {
          // Handle single-select modifiers
          const option = modifier.options?.find(opt => opt.id === modifierSelection.selection || String(opt.id) === String(modifierSelection.selection));
          if (option) {
            const priceKey = `${modifier.id}_option_${modifierSelection.selection}`;
            const optionPrice = editedModifierPrices[priceKey] !== undefined
              ? parseFloat(editedModifierPrices[priceKey])
              : parseFloat(option.price) || 0;
            estimatedPrice += optionPrice;
          }
        }
      });
    }
    
    return estimatedPrice;
  };
  
  // Handle service selection from ServiceSelectionModal
  const handleServiceSelectForLead = (service) => {
    console.log('🔧 Lead: Service selected with customization:', service);
    
    // Store the selected service with all its customization data
    setSelectedServiceForLead(service);
    
    // Update form data with service ID
    setLeadFormData(prev => ({
      ...prev,
      serviceId: service.id
    }));
    
    // Calculate and update estimated price immediately
    const estimatedPrice = calculateServiceEstimatedPrice(service);
    setLeadFormData(prev => ({
      ...prev,
      value: estimatedPrice.toFixed(2)
    }));
    
    // Close the modal
    setShowServiceSelectionModal(false);
  };
  
  // Check property data when address is selected (using RentCast API)
  const checkZillowProperty = async (addressData) => {
    if (!addressData || !addressData.formattedAddress) return;
    
    setZillowLoading(true);
    setZillowData(null);
    
    try {
      // Call backend API to check Zillow
      const apiModule = await import('../services/api');
      const api = apiModule.default;
      
      const response = await api.post('/zillow/property', {
        address: addressData.formattedAddress,
        street: addressData.components?.streetNumber && addressData.components?.route 
          ? `${addressData.components.streetNumber} ${addressData.components.route}`
          : addressData.formattedAddress,
        city: addressData.components?.city,
        state: addressData.components?.state,
        zipCode: addressData.components?.zipCode
      });
      
      if (response.data) {
        setZillowData(response.data);
      } else {
        // Explicitly set to null if no data (property not found)
        setZillowData(null);
      }
    } catch (err) {
      console.error('Error checking property data:', err);
      // Set to null on error so UI shows "no property found" message
      setZillowData(null);
    } finally {
      setZillowLoading(false);
    }
  };
  
  // Auto-calculate estimated value when service is selected or changed
  useEffect(() => {
    // If we have a selected service with modifiers, use that
    if (selectedServiceForLead) {
      const estimatedPrice = calculateServiceEstimatedPrice(selectedServiceForLead);
      // Always update the value field when service changes (even if price is 0)
      setLeadFormData(prev => ({
        ...prev,
        value: estimatedPrice.toFixed(2)
      }));
      console.log(`💰 Updated estimated value: $${estimatedPrice.toFixed(2)} for service "${selectedServiceForLead.name}"`);
    } else if (leadFormData.serviceId && services.length > 0) {
      // Fallback to simple service lookup if no selected service with modifiers
      const selectedService = services.find(s => s.id === parseInt(leadFormData.serviceId));
      if (selectedService) {
        const estimatedPrice = calculateServiceEstimatedPrice(selectedService);
        // Always update the value field when service changes (even if price is 0)
        setLeadFormData(prev => ({
          ...prev,
          value: estimatedPrice.toFixed(2)
        }));
        console.log(`💰 Updated estimated value: $${estimatedPrice.toFixed(2)} for service "${selectedService.name}"`);
      }
    } else if (!leadFormData.serviceId) {
      // Clear selected service when service ID is cleared
      setSelectedServiceForLead(null);
    }
  }, [selectedServiceForLead, leadFormData.serviceId, services]);
  
  // Load tasks when a lead is selected
  useEffect(() => {
    if (selectedLead?.id) {
      loadTasks(selectedLead.id);
    }
  }, [selectedLead?.id]);
  
  const loadTeamMembers = async () => {
    try {
      if (user?.id) {
        const response = await teamAPI.getAll(user.id, { page: 1, limit: 1000 });
        const members = response.teamMembers || response || [];
        setTeamMembers(members);
      }
    } catch (err) {
      console.error('Error loading team members:', err);
    }
  };
  
  const loadTasks = async (leadId) => {
    try {
      const data = await leadsAPI.getTasks(leadId);
      setTasks(data);
    } catch (err) {
      console.error('Error loading tasks:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load tasks';
      showNotification(errorMessage, 'error', 5000);
    }
  };
  
  const loadPipeline = async () => {
    try {
      setLoading(true);
      const data = await leadsAPI.getPipeline();
      setPipeline(data);
    } catch (err) {
      console.error('Error loading pipeline:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load pipeline';
      showNotification(errorMessage, 'error', 5000);
    } finally {
      setLoading(false);
    }
  };
  
  const loadLeads = async () => {
    try {
      const data = await leadsAPI.getAll();
      setLeads(data);
    } catch (err) {
      console.error('Error loading leads:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load leads';
      showNotification(errorMessage, 'error', 5000);
    }
  };
  
  // Handle create lead
  const handleCreateLead = async (e) => {
    e.preventDefault();
    
    // Basic validation - at least name or email should be provided
    const { firstName, lastName } = splitLeadName(leadFormData.fullName);
    const email = (leadFormData.email || '').trim();

    if (!firstName && !lastName && !email) {
      showNotification('Please provide at least a name or email address', 'error', 5000);
      return;
    }
    
    // Check if pipeline has stages
    if (!pipeline?.stages || pipeline.stages.length === 0) {
      showNotification('Pipeline has no stages. Please set up your pipeline first.', 'error', 5000);
      return;
    }
    
    try {
      // Convert value to number or null (not empty string)
      const value = leadFormData.value && leadFormData.value.toString().trim() !== '' 
        ? (parseFloat(leadFormData.value) || null)
        : null;
      
      // Ensure source is not '__custom__' before submitting
      const submitData = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: (leadFormData.phone || '').trim(),
        company: (leadFormData.company || '').trim(),
        source: leadFormData.source === '__custom__' ? '' : (leadFormData.source || ''),
        notes: (leadFormData.notes || '').trim(),
        value: value, // Send as number or null, never empty string
        address: (leadFormData.address || '').trim(),
        serviceId: leadFormData.serviceId || null,
        stageId: pipeline?.stages?.[0]?.id // Add to first stage
      };
      
      console.log('📝 Creating lead with data:', submitData);
      await leadsAPI.create(submitData);
      showNotification('Lead created successfully!', 'success', 3000);
      setShowCreateLeadModal(false);
      setSelectedServiceForLead(null);
      setLeadFormData({
        fullName: '',
        email: '',
        phone: '',
        company: '',
        source: '',
        notes: '',
        value: '',
        address: '',
        serviceId: ''
      });
      setCustomSource('');
      setShowSourceDropdown(false);
      setZillowData(null);
      setSelectedAddress(null);
      loadLeads();
    } catch (err) {
      console.error('❌ Error creating lead:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.details || 
                          err.message || 
                          'Failed to create lead. Please check your input and try again.';
      showNotification(errorMessage, 'error', 5000);
    }
  };

  // Handle edit lead
  const handleEditLead = async (e) => {
    e.preventDefault();
    if (!editingLead) return;
    
    try {
      // Convert value to number or null (not empty string)
      const value = leadFormData.value && leadFormData.value.toString().trim() !== '' 
        ? (parseFloat(leadFormData.value) || null)
        : null;
      
      // Ensure source is not '__custom__' before submitting
      const editNameParts = splitLeadName(leadFormData.fullName);
      const submitData = {
        firstName: editNameParts.firstName,
        lastName: editNameParts.lastName,
        email: (leadFormData.email || '').trim(),
        phone: (leadFormData.phone || '').trim(),
        company: (leadFormData.company || '').trim(),
        source: leadFormData.source === '__custom__' ? '' : (leadFormData.source || ''),
        notes: (leadFormData.notes || '').trim(),
        value: value, // Send as number or null, never empty string
        address: (leadFormData.address || '').trim(),
        serviceId: leadFormData.serviceId || null
      };

      console.log('📝 Updating lead with data:', submitData);
      await leadsAPI.update(editingLead.id, submitData);
      showNotification('Lead updated successfully!', 'success', 3000);
      setShowEditLeadModal(false);
      setEditingLead(null);
      setLeadFormData({
        fullName: '',
        email: '',
        phone: '',
        company: '',
        source: '',
        notes: '',
        value: '',
        address: '',
        serviceId: ''
      });
      setEditCustomSource('');
      setShowEditSourceDropdown(false);
      setZillowData(null);
      setSelectedAddress(null);
      await loadLeads();
      // Reload selected lead if it was the one being edited
      if (selectedLead?.id === editingLead.id) {
        const updatedLeads = await leadsAPI.getAll();
        const updatedLead = updatedLeads.find(l => l.id === editingLead.id);
        if (updatedLead) {
          setSelectedLead(updatedLead);
        }
      }
    } catch (err) {
      console.error('❌ Error updating lead:', err);
      console.error('❌ Error response:', err.response?.data);
      console.error('❌ Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.details || 
                          err.message || 
                          'Failed to update lead. Please check your input and try again.';
      showNotification(errorMessage, 'error', 5000);
    }
  };

  // Open edit lead modal
  const handleOpenEditLead = (lead) => {
    setEditingLead(lead);
    
    // If lead has a service but no value, try to get the price from the service
    let initialValue = lead.value;
    if (lead.service_id && (!lead.value || lead.value === null || lead.value === '')) {
      const service = services.find(s => s.id === parseInt(lead.service_id));
      if (service && service.price) {
        initialValue = service.price.toString();
      }
    }
    
    const joinedLeadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
    setLeadFormData({
      fullName: joinedLeadName,
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      source: lead.source || '',
      notes: lead.notes || '',
      value: initialValue || '',
      address: lead.address || '',
      serviceId: lead.service_id || ''
    });
    setShowEditLeadModal(true);
    setShowLeadDetailsModal(false);
  };
  
  // Handle update stages
  const handleUpdateStages = async (updatedStages) => {
    try {
      await leadsAPI.updateStages(updatedStages);
      loadPipeline();
    } catch (err) {
      console.error('Error updating stages:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update stages';
      showNotification(errorMessage, 'error', 5000);
    }
  };
  
  // Handle add stage
  const handleAddStage = async (e) => {
    e.preventDefault();
    try {
      const newStage = {
        name: stageFormData.name,
        color: stageFormData.color,
        position: pipeline.stages.length
      };
      
      const updatedStages = [...pipeline.stages, newStage];
      await handleUpdateStages(updatedStages);
      
      showNotification('Stage added successfully!', 'success', 3000);
      setShowEditStageModal(false);
      setStageFormData({ name: '', color: '#3B82F6' });
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to add stage';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error adding stage:', err);
    }
  };
  
  // Handle delete stage
  const handleDeleteStage = async (stageId) => {
    if (!window.confirm('Are you sure you want to delete this stage? Leads in this stage will need to be moved first.')) {
      return;
    }
    
    try {
      await leadsAPI.deleteStage(stageId);
      showNotification('Stage deleted successfully!', 'success', 3000);
      loadPipeline();
      loadLeads();
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete stage';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error deleting stage:', err);
    }
  };
  
  // Handle drag start
  const handleDragStart = (lead, stage) => {
    setDraggedLead(lead);
    setDraggedStage(stage);
  };
  
  // Handle drag over
  const handleDragOver = (e) => {
    e.preventDefault();
  };
  
  // Handle drop
  const handleDrop = async (targetStageId) => {
    if (!draggedLead || draggedLead.stage_id === targetStageId) {
      return;
    }
    
    try {
      await leadsAPI.moveToStage(draggedLead.id, targetStageId);
      loadLeads();
      setDraggedLead(null);
      setDraggedStage(null);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to move lead';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error moving lead:', err);
    }
  };
  
  // Handle convert lead to customer (called from modal)
  const handleConvertLead = async (leadId) => {
    try {
      const result = await leadsAPI.convertToCustomer(leadId);
      showNotification('Lead converted to customer successfully!', 'success', 3000);
      loadLeads();
      setShowLeadDetailsModal(false);
      setShowConvertLeadModal(false);
      return result;
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to convert lead';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error converting lead:', err);
      throw err;
    }
  };
  
  
  // Handle create task
  const handleCreateTask = async (taskData) => {
    try {
      if (editingTask) {
        await leadsAPI.updateTask(editingTask.id, taskData);
        showNotification('Task updated successfully!', 'success', 3000);
      } else {
        await leadsAPI.createTask(selectedLead.id, taskData);
        showNotification('Task created successfully!', 'success', 3000);
      }
      setShowCreateTaskModal(false);
      setEditingTask(null);
      loadTasks(selectedLead.id);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save task';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error saving task:', err);
    }
  };
  
  // Handle edit task
  const handleEditTask = (task) => {
    setEditingTask(task);
    setShowCreateTaskModal(true);
  };
  
  // Handle delete task
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }
    
    try {
      await leadsAPI.deleteTask(taskId);
      showNotification('Task deleted successfully!', 'success', 3000);
      loadTasks(selectedLead.id);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete task';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error deleting task:', err);
    }
  };
  
  // Handle delete lead
  const handleDeleteLead = async (leadId) => {
    if (!window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
      return;
    }
    
    try {
      await leadsAPI.delete(leadId);
      showNotification('Lead deleted successfully!', 'success', 3000);
      setShowLeadDetailsModal(false);
      setSelectedLead(null);
      loadLeads();
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete lead';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error deleting lead:', err);
    }
  };
  
  // Handle task status change
  const handleTaskStatusChange = async (taskId, newStatus) => {
    try {
      await leadsAPI.updateTask(taskId, { status: newStatus });
      loadTasks(selectedLead.id);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update task status';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error updating task status:', err);
    }
  };
  
  // Handle finish - just completes the current task
  const handleFinish = async (task) => {
    try {
      await leadsAPI.updateTask(task.id, { status: 'completed' });
      showNotification('Task completed successfully!', 'success', 3000);
      loadTasks(selectedLead.id);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to complete task';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error completing task:', err);
    }
  };
  
  // Handle finish and follow up - completes current task and creates a new follow-up task
  const handleFinishAndFollowUp = async (task) => {
    try {
      // First, complete the current task
      await leadsAPI.updateTask(task.id, { status: 'completed' });
      
      // Calculate follow-up date (default to tomorrow, or 3 days from now if original task had a due date)
      let followUpDate = new Date();
      if (task.due_date) {
        const originalDate = new Date(task.due_date);
        followUpDate = new Date(originalDate);
        followUpDate.setDate(followUpDate.getDate() + 3);
      } else {
        followUpDate.setDate(followUpDate.getDate() + 1);
      }
      
      // Format date for API (YYYY-MM-DDTHH:mm:ss)
      const followUpDateString = `${followUpDate.toISOString().split('T')[0]}T09:00:00`;
      
      // Create follow-up task with similar details
      const followUpTaskData = {
        title: `Follow up: ${task.title}`,
        description: task.description || null,
        dueDate: followUpDateString,
        priority: task.priority || 'medium',
        assignedTo: task.assigned_to || null,
        status: 'pending'
      };
      
      await leadsAPI.createTask(selectedLead.id, followUpTaskData);
      showNotification('Task completed and follow-up task created!', 'success', 3000);
      loadTasks(selectedLead.id);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to finish and create follow-up task';
      showNotification(errorMessage, 'error', 5000);
      console.error('Error finishing and creating follow-up task:', err);
    }
  };
  
  // Filter tasks
  const getFilteredTasks = () => {
    if (taskFilter === 'all') return tasks;
    if (taskFilter === 'overdue') {
      const now = new Date();
      return tasks.filter(task => 
        task.due_date && 
        new Date(task.due_date) < now && 
        task.status !== 'completed'
      );
    }
    return tasks.filter(task => task.status === taskFilter);
  };
  
  // Get overdue tasks count
  const getOverdueTasksCount = () => {
    const now = new Date();
    return tasks.filter(task => 
      task.due_date && 
      new Date(task.due_date) < now && 
      task.status !== 'completed'
    ).length;
  };
  
  const hasActiveFilters = filters.priceMin || filters.priceMax || filters.dateFrom || filters.dateTo || filters.location || filters.source || filters.serviceId;

  const clearFilters = () => {
    setFilters({ priceMin: '', priceMax: '', dateFrom: '', dateTo: '', location: '', source: '', serviceId: '' });
  };

  // Get leads for a stage (with search + filter)
  const getLeadsForStage = (stageId) => {
    let stageLeads = leads.filter(lead => lead.stage_id === stageId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // Match against the concatenated display name ("First Last") instead of
      // individual first_name / last_name fields. The card UI renders the name
      // as `{first_name} {last_name}`, so searching the visible string
      // (e.g. "Sagar J" for "Sagar" + "J.") previously matched zero records
      // because neither field alone contained the space-joined query.
      stageLeads = stageLeads.filter(lead => {
        const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').toLowerCase();
        return (
          fullName.includes(q) ||
          (lead.email && lead.email.toLowerCase().includes(q)) ||
          (lead.company && lead.company.toLowerCase().includes(q)) ||
          (lead.phone && lead.phone.includes(q))
        );
      });
    }
    // Apply filters
    if (filters.priceMin) {
      stageLeads = stageLeads.filter(lead => (Number.parseFloat(lead.value) || 0) >= Number.parseFloat(filters.priceMin));
    }
    if (filters.priceMax) {
      stageLeads = stageLeads.filter(lead => (Number.parseFloat(lead.value) || 0) <= Number.parseFloat(filters.priceMax));
    }
    if (filters.dateFrom) {
      stageLeads = stageLeads.filter(lead => lead.created_at && new Date(lead.created_at) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      stageLeads = stageLeads.filter(lead => lead.created_at && new Date(lead.created_at) <= toDate);
    }
    if (filters.location) {
      const loc = filters.location.toLowerCase();
      stageLeads = stageLeads.filter(lead => lead.address && lead.address.toLowerCase().includes(loc));
    }
    if (filters.source) {
      stageLeads = stageLeads.filter(lead => lead.source === filters.source);
    }
    if (filters.serviceId) {
      stageLeads = stageLeads.filter(lead => String(lead.service_id) === String(filters.serviceId));
    }
    return stageLeads;
  };

  // Calculate total value for a stage
  const getStageTotalValue = (stageLeads) => {
    return stageLeads.reduce((sum, lead) => sum + (parseFloat(lead.value) || 0), 0);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sf-bg-page)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-[var(--sf-text-secondary)]">Loading pipeline...</p>
        </div>
      </div>
    );
  }
  
  if (!pipeline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sf-bg-page)]">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-[var(--sf-text-secondary)]">Failed to load pipeline</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen sm:h-screen sm:overflow-hidden bg-[var(--sf-bg-page)] flex flex-col">
      {/* Mobile Header */}
      <MobileHeader pageTitle="Leads" />
      
      {/* Toast Notification */}
      <Notification
        show={notification.show}
        message={notification.message}
        type={notification.type}
        onClose={hideNotification}
        duration={5000}
      />
      
      {/* Header */}
      <div className="hidden md:block bg-white border-b border-[var(--sf-border-light)] sticky top-0 z-10 flex-shrink-0">
        <div className="w-full px-4 lg:px-6 py-4">
          {/* Title row */}
          <div className="mb-5">
            <p className="text-[10.5px] font-bold uppercase text-[var(--sf-text-muted)] mb-1" style={{ letterSpacing: '.06em' }}>
              <span>Customers</span>
              <span className="mx-1.5 text-[var(--sf-text-muted)]">›</span>
              <span className="text-[var(--sf-text-primary)]">Leads</span>
            </p>
            <h1 className="text-[22px] font-bold text-[var(--sf-text-primary)]" style={{ letterSpacing: '-0.02em' }}>Leads</h1>
            <p className="text-[13px] text-[var(--sf-text-secondary)] mt-1">
              {(() => {
                const stages = pipeline?.stages || []
                const wonIds = new Set(stages.filter(s => /win|won/i.test(s.name)).map(s => s.id))
                const lostIds = new Set(stages.filter(s => /lost/i.test(s.name)).map(s => s.id))
                const active = leads.filter(l => !wonIds.has(l.stage_id) && !lostIds.has(l.stage_id))
                const newThisWeek = leads.filter(l => {
                  const d = new Date(l.created_at)
                  return !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000
                }).length
                const totalVal = active.reduce((s, l) => s + (parseFloat(l.value) || parseFloat(l.estimated_value) || 0), 0)
                if (leadsTab === 'sources') return 'Channel attribution · conversion + value contribution per source'
                if (leadsTab === 'owners')  return 'Sales rep leaderboard · win rate, response time, pipeline value'
                if (leadsTab === 'list')    return `${leads.length} leads · sort, filter, bulk actions`
                return `${active.length} leads in pipeline · $${Math.round(totalVal).toLocaleString()} potential · ${newThisWeek} new this week`
              })()}
            </p>
          </div>
          {/* Search + Buttons row — all on one line */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sf-text-muted)]" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sf-search-input w-full pl-9 pr-4 py-2 bg-white border border-[var(--sf-border-light)] rounded-lg text-sm text-[var(--sf-text-primary)] placeholder:text-[var(--sf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] transition-colors"
              />
            </div>
            <div className="flex-1" />
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[var(--sf-border-light)] rounded-lg text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)] hover:border-[var(--sf-border)] transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Kanban View</span>
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 border rounded-lg text-sm font-medium transition-colors shadow-sm ${
                  hasActiveFilters
                    ? 'bg-[var(--sf-blue-50)] border-[var(--sf-blue-500)] text-[var(--sf-blue-500)]'
                    : 'bg-white border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)] hover:border-[var(--sf-border)]'
                }`}
              >
                <span>Filter</span>
                <FilterIcon className="w-4 h-4" />
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-[var(--sf-blue-500)] rounded-full" />
                )}
              </button>

              {/* Filter Dropdown */}
              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-[50]" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[var(--sf-border-light)] rounded-xl shadow-xl z-[51] flex flex-col max-h-[calc(100vh-200px)]" style={{ overflow: 'visible' }}>
                    {/* Header — sticky */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
                      <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Filters</h3>
                      {hasActiveFilters && (
                        <button onClick={clearFilters} className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] font-medium">
                          Clear all
                        </button>
                      )}
                    </div>

                    {/* Scrollable filter fields */}
                    <div className="flex-1 overflow-y-auto px-4 space-y-3 scrollbar-hide">
                      {/* Price Range */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--sf-text-muted)] mb-1 uppercase tracking-wide">Price Range</label>
                        <div className="flex items-center gap-2 w-full overflow-hidden">
                          <input
                            type="number"
                            placeholder="Min"
                            value={filters.priceMin}
                            onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
                            className="sf-filter-input-narrow flex-1 w-0 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                          />
                          <span className="text-xs text-[var(--sf-text-muted)] flex-shrink-0">—</span>
                          <input
                            type="number"
                            placeholder="Max"
                            value={filters.priceMax}
                            onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
                            className="sf-filter-input-narrow flex-1 w-0 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                          />
                        </div>
                      </div>

                      {/* Date Range */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--sf-text-muted)] mb-1 uppercase tracking-wide">Date Created</label>
                        <div className="flex items-center gap-2">
                          <SfDatePicker
                            value={filters.dateFrom}
                            onChange={(val) => setFilters({ ...filters, dateFrom: val })}
                            placeholder="mm/dd/yyyy"
                            className="flex-1 w-full px-2.5 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-xs focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] bg-white"
                          />
                          <span className="text-xs text-[var(--sf-text-muted)]">—</span>
                          <SfDatePicker
                            value={filters.dateTo}
                            onChange={(val) => setFilters({ ...filters, dateTo: val })}
                            placeholder="mm/dd/yyyy"
                            className="flex-1 w-full px-2.5 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-xs focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] bg-white"
                          />
                        </div>
                      </div>

                      {/* Location / Territory */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--sf-text-muted)] mb-1 uppercase tracking-wide">Location / Territory</label>
                        <div className="relative">
                          <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--sf-text-muted)] pointer-events-none" />
                          <input
                            type="text"
                            placeholder="City, state, or zip..."
                            value={filters.location}
                            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                            className="sf-search-input w-full pl-7 pr-2.5 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                          />
                        </div>
                      </div>

                      {/* Source */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--sf-text-muted)] mb-1 uppercase tracking-wide">Source</label>
                        <select
                          value={filters.source}
                          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        >
                          <option value="">All sources</option>
                          {leadSources.map((source) => (
                            <option key={source} value={source}>{source}</option>
                          ))}
                        </select>
                      </div>

                      {/* Service */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--sf-text-muted)] mb-1 uppercase tracking-wide">Service</label>
                        <select
                          value={filters.serviceId}
                          onChange={(e) => setFilters({ ...filters, serviceId: e.target.value })}
                          className="w-full px-2.5 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        >
                          <option value="">All services</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Footer — sticky */}
                    <div className="px-4 py-3 flex-shrink-0 border-t border-[var(--sf-border-light)]">
                      <button
                        onClick={() => setShowFilterDropdown(false)}
                        className="w-full py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--sf-blue-600)] transition-colors"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setShowCreateLeadModal(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--sf-blue-600)] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Lead</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* LeadsDesign tabs — Pipeline · List · Sources · Owners */}
      <div className="hidden md:flex items-center gap-0 px-4 lg:px-6 border-b border-[var(--sf-border-light)] bg-white flex-shrink-0">
        {[
          { id: 'pipeline', label: 'Pipeline', count: leads.length },
          { id: 'list',     label: 'List',     count: leads.length },
          { id: 'sources',  label: 'Sources',  count: new Set(leads.map(l => l.source).filter(Boolean)).size },
          { id: 'owners',   label: 'Owners',   count: new Set(leads.map(l => l.assigned_to_user_id || l.assigned_to).filter(Boolean)).size },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setLeadsTab(t.id)}
            className={`relative px-4 py-3 text-[13px] font-semibold transition-colors border-b-2 ${
              leadsTab === t.id
                ? 'text-[var(--sf-text-primary)] border-[var(--sf-blue-500)]'
                : 'text-[var(--sf-text-secondary)] border-transparent hover:text-[var(--sf-text-primary)]'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {t.label}
              {t.count > 0 && (
                <span
                  className="inline-flex items-center px-1.5 py-[1px] rounded-md"
                  style={{
                    background: leadsTab === t.id ? 'rgba(37,99,235,0.10)' : 'var(--sf-bg-page)',
                    color: leadsTab === t.id ? 'var(--sf-blue-500)' : 'var(--sf-text-muted)',
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  {t.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Pipeline KPI strip — design pack §1 toolbar */}
      {leadsTab === 'pipeline' && (() => {
        const stages = pipeline?.stages || []
        const wonIds = new Set(stages.filter(s => /win|won/i.test(s.name)).map(s => s.id))
        const lostIds = new Set(stages.filter(s => /lost/i.test(s.name)).map(s => s.id))
        const isWon = (l) => wonIds.has(l.stage_id)
        const isLost = (l) => lostIds.has(l.stage_id)
        const isClosed = (l) => isWon(l) || isLost(l)
        const active = leads.filter(l => !isClosed(l))
        const closedThisMonth = leads.filter(l => {
          if (!isClosed(l)) return false
          const d = new Date(l.updated_at || l.created_at)
          if (Number.isNaN(d.getTime())) return false
          const now = new Date()
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        })
        const wonThisMonth = closedThisMonth.filter(isWon)
        const winRate = closedThisMonth.length ? Math.round((wonThisMonth.length / closedThisMonth.length) * 100) : 0
        const activeValue = active.reduce((s, l) => s + (parseFloat(l.value) || parseFloat(l.estimated_value) || 0), 0)
        const wonValue = wonThisMonth.reduce((s, l) => s + (parseFloat(l.value) || parseFloat(l.estimated_value) || 0), 0)
        const dealValues = active.map(l => parseFloat(l.value) || parseFloat(l.estimated_value) || 0).filter(v => v > 0)
        const avgDeal = dealValues.length ? dealValues.reduce((a, b) => a + b, 0) / dealValues.length : 0
        const newThisWeek = leads.filter(l => {
          const d = new Date(l.created_at)
          if (Number.isNaN(d.getTime())) return false
          return (Date.now() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000
        }).length
        const fmt = (v) => `$${Math.round(v).toLocaleString()}`
        const fmtShort = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`
        // Avg time to close = avg days for won leads this month
        const closedAges = wonThisMonth.map(l => {
          const c = new Date(l.created_at)
          const u = new Date(l.updated_at || l.created_at)
          return Math.max(0, (u - c) / (24 * 60 * 60 * 1000))
        }).filter(d => d > 0)
        const avgClose = closedAges.length ? closedAges.reduce((a, b) => a + b, 0) / closedAges.length : 0

        return (
          <div className="hidden md:grid gap-3 px-4 lg:px-6 pt-4 pb-2 flex-shrink-0" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <KpiTile label="In pipeline"     value={fmtShort(activeValue)}      sub={`${active.length} active`}                         accent="#2563EB" />
            <KpiTile label="Won this month"  value={fmtShort(wonValue)}         sub={`${wonThisMonth.length} closed-won`}               accent="#16A34A" />
            <KpiTile label="Win rate"        value={`${winRate}%`}              sub={`${wonThisMonth.length}/${closedThisMonth.length} of closed`} accent="#7C3AED" />
            <KpiTile label="Avg deal size"   value={fmtShort(avgDeal)}          sub={`${dealValues.length} valued leads`}               accent="#D97706" />
            <KpiTile label="Avg time to close" value={avgClose > 0 ? `${avgClose.toFixed(1)}d` : '—'} sub={`${newThisWeek} new this week`} accent="#0D9488" />
          </div>
        )
      })()}

      {/* Pipeline Board - Desktop & Tablet: horizontal layout (native scroll + drag-to-pan) */}
      {leadsTab === 'pipeline' && (
      <div
        ref={pipelineScrollRef}
        onMouseDown={handleBoardMouseDown}
        className="pipeline-scrollbar hidden sm:block w-full max-w-full min-w-0 min-h-0 px-3 lg:px-6 pt-5 pb-3 overflow-x-auto overflow-y-hidden flex-1"
      >
        <div
          className="flex gap-4 pb-4"
          style={{
            minHeight: '400px',
            width: 'max-content',
          }}
        >
          {pipeline.stages && pipeline.stages.map((stage) => {
            const stageLeads = getLeadsForStage(stage.id);
            const totalValue = getStageTotalValue(stageLeads);

            return (
              <div
                key={stage.id}
                data-stage-id={stage.id}
                className="relative flex-shrink-0 flex flex-col bg-[var(--sf-bg-page)] rounded-xl"
                style={{ width: `${stageWidth}px` }}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
              >
                {/* Resize handle — drag to resize ALL stages uniformly */}
                <div
                  onMouseDown={handleStageResizeStart}
                  className="group/resize absolute top-0 bottom-0 -right-2 w-4 cursor-col-resize z-20 flex items-center justify-center"
                  title="Drag to resize all stages"
                  data-resize-handle
                >
                  <div className="w-0.5 h-12 bg-[var(--sf-border)] rounded-full opacity-0 group-hover/resize:opacity-100 group-hover/resize:bg-[var(--sf-blue-500)] transition-opacity" />
                </div>
                {/* Stage Header — colored top border accent */}
                <div
                  className="rounded-t-xl overflow-hidden"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="bg-white px-4 pt-3 pb-4 border-b border-x border-[var(--sf-border-light)] rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <h3 className="font-semibold text-sm text-[var(--sf-text-primary)] truncate">{stage.name}</h3>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: stage.color }}>
                          {stageLeads.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowCreateLeadModal(true); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-[var(--sf-text-muted)] hover:text-[var(--sf-blue-500)] hover:bg-[var(--sf-bg-hover)] transition-colors"
                          title="Add lead"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowEditStageModal(true); }}
                          className="w-6 h-6 flex items-center justify-center rounded text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)] transition-colors"
                          title="Stage options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xl font-bold text-[var(--sf-text-primary)] mt-2">
                      $ {totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                {/* Leads in Stage */}
                <div className="flex-1 p-2 space-y-2.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                  {stageLeads.map((lead) => {
                    const isSelected = selectedCardId === lead.id;
                    return (
                    <div
                      key={lead.id}
                      draggable={isSelected}
                      onDragStart={(e) => {
                        if (!isSelected) { e.preventDefault(); return; }
                        handleDragStart(lead, stage);
                      }}
                      onDragEnd={() => setSelectedCardId(null)}
                      onClick={(e) => { e.stopPropagation(); handleCardClick(lead); }}
                      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all group ${
                        isSelected
                          ? 'border-[var(--sf-blue-500)] ring-2 ring-[var(--sf-blue-500)] cursor-grab'
                          : 'border-[var(--sf-border-light)] cursor-pointer'
                      }`}
                    >
                      {/* Card top accent line */}
                      <div className="h-[2px] rounded-t-xl" style={{ backgroundColor: stage.color, opacity: 0.4 }} />

                      <div className="p-3.5">
                        {/* Name + drag handle */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-[var(--sf-text-primary)] truncate leading-tight">
                              {lead.first_name} {lead.last_name}
                            </h4>
                            {lead.company && (
                              <p className="text-xs text-[var(--sf-text-muted)] flex items-center mt-0.5 truncate">
                                <Building className="w-3 h-3 mr-1 flex-shrink-0 text-[var(--sf-text-muted)]" />
                                <span className="truncate">{lead.company}</span>
                              </p>
                            )}
                          </div>
                          <GripVertical className="w-3.5 h-3.5 text-[var(--sf-border)] group-hover:text-[var(--sf-text-muted)] flex-shrink-0 ml-2 transition-colors" />
                        </div>

                        {/* Value */}
                        {lead.value && (
                          <div className="flex items-center mb-2.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold">
                              <DollarSign className="w-3 h-3" />
                              {parseFloat(lead.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}

                        {/* Divider */}
                        <div className="border-t border-[var(--sf-border-light)] my-2" />

                        {/* Contact info */}
                        <div className="space-y-1.5 text-xs text-[var(--sf-text-secondary)]">
                          {lead.email && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0 text-[var(--sf-text-muted)]" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Phone className="w-3 h-3 flex-shrink-0 text-[var(--sf-text-muted)]" />
                              <span className="truncate">{formatPhoneNumber(lead.phone)}</span>
                            </div>
                          )}
                        </div>

                        {/* Timestamps + Source */}
                        <div className="mt-2.5 pt-2 border-t border-[var(--sf-border-light)]">
                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--sf-text-muted)]">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span>Created {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                          </div>
                          {lead.source && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center text-[10px] font-medium bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] px-2 py-0.5 rounded-full border border-[var(--sf-border-light)]">
                                {lead.source}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}

                  {stageLeads.length === 0 && (
                    <div className="text-center py-10 text-[var(--sf-text-muted)]">
                      <button
                        onClick={() => setShowCreateLeadModal(true)}
                        className="w-12 h-12 rounded-xl bg-white border-2 border-dashed border-[var(--sf-border)] flex items-center justify-center mx-auto mb-3 hover:border-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] transition-colors"
                      >
                        <Plus className="w-5 h-5" strokeWidth={2} />
                      </button>
                      <p className="text-xs">No leads in this stage</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* List / Sources / Owners tabs (desktop) */}
      {leadsTab !== 'pipeline' && (
        <div className="hidden sm:block flex-1 overflow-y-auto px-4 lg:px-6 py-5">
          {leadsTab === 'list' && (
            <LeadsListTabView
              leads={leads}
              teamMembers={teamMembers}
              stages={pipeline?.stages || []}
              selected={listSelected}
              setSelected={setListSelected}
              sort={listSort}
              setSort={setListSort}
              onOpenLead={(lead) => navigate(`/lead/${lead.id}`)}
            />
          )}
          {leadsTab === 'sources' && (
            <LeadsSourcesTabView leads={leads} stages={pipeline?.stages || []} />
          )}
          {leadsTab === 'owners' && (
            <LeadsOwnersTabView leads={leads} teamMembers={teamMembers} stages={pipeline?.stages || []} />
          )}
        </div>
      )}

      {/* Mobile: header + search + accordion layout */}
      <div className="sm:hidden flex-shrink-0 bg-white border-b border-[var(--sf-border-light)] sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-[var(--sf-text-primary)]">Leads Pipeline</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditStageModal(true)}
              className="p-2 rounded-lg border border-[var(--sf-border-light)] text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-hover)]"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCreateLeadModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--sf-blue-600)]"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sf-text-muted)]" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sf-search-input w-full pl-9 pr-4 py-2 bg-[var(--sf-bg-input)] border border-[var(--sf-border-light)] rounded-lg text-sm placeholder:text-[var(--sf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
          />
        </div>
      </div>
      <div className="sm:hidden w-full px-3 py-3 pb-20 flex-1 space-y-3">
        {pipeline.stages && pipeline.stages.map((stage) => {
          const stageLeads = getLeadsForStage(stage.id);
          const totalValue = getStageTotalValue(stageLeads);
          const isExpanded = expandedStages[stage.id];

          return (
            <div
              key={stage.id}
              className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden shadow-sm"
              style={{ borderTop: `3px solid ${stage.color}` }}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Stage Header - tap to expand/collapse */}
              <button
                onClick={() => setExpandedStages(prev => ({ ...prev, [stage.id]: !prev[stage.id] }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-white"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-sm text-[var(--sf-text-primary)] truncate">{stage.name}</span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ backgroundColor: stage.color }}>
                    {stageLeads.length}
                  </span>
                  {totalValue > 0 && (
                    <span className="text-xs text-[var(--sf-text-muted)] font-medium">
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-[var(--sf-text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Leads - shown when expanded */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-[var(--sf-border-light)]">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead, stage)}
                      onClick={() => {
                        setSelectedLead(lead);
                        setShowLeadDetailsModal(true);
                      }}
                      className="bg-[var(--sf-bg-page)] rounded-xl border border-[var(--sf-border-light)] p-3.5 cursor-pointer mt-2.5 first:mt-2.5"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-[var(--sf-text-primary)] truncate">
                            {lead.first_name} {lead.last_name}
                          </h4>
                          {lead.company && (
                            <p className="text-xs text-[var(--sf-text-muted)] flex items-center mt-0.5 truncate">
                              <Building className="w-3 h-3 mr-1 flex-shrink-0" />
                              <span className="truncate">{lead.company}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {lead.value && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold mb-2">
                          <DollarSign className="w-3 h-3" />
                          {parseFloat(lead.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}

                      <div className="space-y-1 text-xs text-[var(--sf-text-secondary)]">
                        {lead.email && (
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3 h-3 flex-shrink-0 text-[var(--sf-text-muted)]" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 truncate">
                            <Phone className="w-3 h-3 flex-shrink-0 text-[var(--sf-text-muted)]" />
                            <span className="truncate">{formatPhoneNumber(lead.phone)}</span>
                          </div>
                        )}
                      </div>

                      {lead.source && (
                        <div className="mt-2">
                          <span className="inline-flex items-center text-[10px] font-medium bg-white text-[var(--sf-text-muted)] px-2 py-0.5 rounded-full border border-[var(--sf-border-light)]">
                            {lead.source}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="text-center py-6 text-[var(--sf-text-muted)] text-xs mt-2">
                      No leads in this stage
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Create Lead — Right-side Drawer */}
      {showCreateLeadModal && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Click-away area (transparent) */}
          <div
            className="flex-1"
            onClick={() => {
              setShowCreateLeadModal(false);
              setSelectedServiceForLead(null);
            }}
          />
          {/* Drawer panel */}
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sf-border-light)] flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--sf-text-primary)]">New Lead</h2>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-[var(--sf-blue-500)]">
                  ${selectedServiceForLead ? calculateServiceEstimatedPrice(selectedServiceForLead).toFixed(2) : '0.00'}
                </span>
              <button
                onClick={() => {
                  setShowCreateLeadModal(false);
                  setSelectedServiceForLead(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              <div>
                {/* Form */}
                <form id="create-lead-form" onSubmit={handleCreateLead} className="space-y-4" autoComplete="off">
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={leadFormData.fullName}
                    onChange={(e) => setLeadFormData({ ...leadFormData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={leadFormData.email}
                      onChange={async (e) => {
                        const email = e.target.value;
                        setLeadFormData({ ...leadFormData, email: email });
                        
                        // Search for existing customer/lead by email to auto-populate name
                        if (email && email.includes('@')) {
                          try {
                            // Search in existing leads
                            const existingLeads = leads.filter(lead => 
                              lead.email && lead.email.toLowerCase() === email.toLowerCase()
                            );
                            
                            if (existingLeads.length > 0) {
                              const foundLead = existingLeads[0];
                              setNameSuggestions([{
                                firstName: foundLead.first_name || '',
                                lastName: foundLead.last_name || '',
                                email: foundLead.email || ''
                              }]);
                              setShowNameSuggestions(true);
                            } else {
                              // Try searching customers API if available
                              try {
                                const apiModule = await import('../services/api');
                                if (apiModule.customersAPI) {
                                  const customers = await apiModule.customersAPI.getAll();
                                  const foundCustomer = customers.find(c => 
                                    c.email && c.email.toLowerCase() === email.toLowerCase()
                                  );
                                  
                                  if (foundCustomer) {
                                    setNameSuggestions([{
                                      firstName: foundCustomer.firstName || foundCustomer.first_name || '',
                                      lastName: foundCustomer.lastName || foundCustomer.last_name || '',
                                      email: foundCustomer.email || ''
                                    }]);
                                    setShowNameSuggestions(true);
                                  } else {
                                    setNameSuggestions([]);
                                    setShowNameSuggestions(false);
                                  }
                                } else {
                                  setNameSuggestions([]);
                                  setShowNameSuggestions(false);
                                }
                              } catch (err) {
                                // customersAPI might not be available, that's okay
                                setNameSuggestions([]);
                                setShowNameSuggestions(false);
                              }
                            }
                          } catch (err) {
                            setNameSuggestions([]);
                            setShowNameSuggestions(false);
                          }
                        } else {
                          setNameSuggestions([]);
                          setShowNameSuggestions(false);
                        }
                      }}
                      onBlur={() => {
                        // Delay hiding suggestions to allow click
                        setTimeout(() => setShowNameSuggestions(false), 200);
                      }}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                    {showNameSuggestions && nameSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--sf-border-light)] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {nameSuggestions.map((suggestion, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              const suggestedFullName = [suggestion.firstName, suggestion.lastName].filter(Boolean).join(' ').trim();
                              setLeadFormData({
                                ...leadFormData,
                                fullName: suggestedFullName,
                                email: suggestion.email
                              });
                              setNameSuggestions([]);
                              setShowNameSuggestions(false);
                            }}
                            className="px-4 py-2 hover:bg-[var(--sf-blue-50)] cursor-pointer border-b border-[var(--sf-border-light)] last:border-b-0"
                          >
                            <div className="text-sm font-medium text-[var(--sf-text-primary)]">
                              {suggestion.firstName} {suggestion.lastName}
                            </div>
                            <div className="text-xs text-[var(--sf-text-muted)]">{suggestion.email}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={leadFormData.phone}
                    onChange={(e) => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Source
                  </label>
                  <div className="relative">
                    <div className="flex gap-2">
                      <select
                        value={leadFormData.source}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__custom__') {
                            // Set the source to '__custom__' first, then show the input
                            setLeadFormData({ ...leadFormData, source: '__custom__' });
                            setCustomSource('');
                            setShowSourceDropdown(true);
                          } else {
                            setLeadFormData({ ...leadFormData, source: value });
                            setShowSourceDropdown(false);
                            setCustomSource(''); // Clear custom source when selecting a regular source
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      >
                        <option value="">Select a source...</option>
                        {leadSources.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                        <option value="__custom__">+ Add Custom Source</option>
                      </select>
                    </div>
                    
                    {showSourceDropdown && leadFormData.source === '__custom__' && (
                      <div className="mt-2 p-3 bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg">
                        <label className="block text-xs font-medium text-[var(--sf-text-primary)] mb-1">
                          Custom Source Name
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={customSource}
                            onChange={(e) => setCustomSource(e.target.value)}
                            placeholder="Enter custom source name"
                            className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customSource.trim()) {
                                e.preventDefault();
                                addCustomSource(customSource, false);
                              } else if (e.key === 'Escape') {
                                setCustomSource('');
                                setShowSourceDropdown(false);
                                setLeadFormData({ ...leadFormData, source: '' });
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (customSource.trim()) {
                                addCustomSource(customSource, false);
                              }
                            }}
                            className="px-3 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] text-sm"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomSource('');
                              setShowSourceDropdown(false);
                              setLeadFormData({ ...leadFormData, source: '' });
                            }}
                            className="px-3 py-2 bg-white border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Allow typing custom source directly */}
                    {leadFormData.source && !leadSources.includes(leadFormData.source) && leadFormData.source !== '__custom__' && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newSource = leadFormData.source.trim();
                            if (newSource && !leadSources.includes(newSource)) {
                              const updatedSources = [...leadSources, newSource];
                              setLeadSources(updatedSources);
                              leadSourcesAPI.create(newSource).catch(() => {});
                            }
                          }}
                          className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]"
                        >
                          Save "{leadFormData.source}" as custom source
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Service
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowServiceSelectionModal(true)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] bg-white text-left hover:bg-[var(--sf-bg-page)] flex items-center justify-between"
                    >
                      <span className={leadFormData.serviceId ? "text-[var(--sf-text-primary)]" : "text-[var(--sf-text-muted)]"}>
                        {selectedServiceForLead 
                          ? decodeHtmlEntities(selectedServiceForLead.name || '')
                          : leadFormData.serviceId 
                            ? (() => {
                                const service = services.find(s => s.id === parseInt(leadFormData.serviceId));
                                return service ? decodeHtmlEntities(service.name || '') : 'Select a service...';
                              })()
                            : 'Select a service...'}
                      </span>
                      <span className="text-[var(--sf-text-muted)]">▼</span>
                    </button>
                    {selectedServiceForLead && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedServiceForLead(null);
                            setLeadFormData(prev => ({ ...prev, serviceId: '', value: '' }));
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Clear service
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                    Select a service to set the estimated value.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Location
                  </label>
                  <AddressAutocompleteLeads
                    value={leadFormData.address}
                    onChange={(value) => {
                      setLeadFormData({ ...leadFormData, address: value });
                    }}
                    onAddressSelect={(addressData) => {
                      setSelectedAddress(addressData);
                      setLeadFormData(prev => ({
                        ...prev,
                        address: addressData.formattedAddress
                      }));
                      checkZillowProperty(addressData);
                    }}
                    placeholder="Search location"
                    className="w-full"
                  />
                </div>

                </form>

                {/* Property Info Section */}
                <div className="mt-6 pt-6 border-t border-[var(--sf-border-light)]">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4 flex items-center space-x-2">
                  <Home className="w-5 h-5 text-[var(--sf-blue-500)]" />
                  <span>Property Information</span>
                </h3>
                
                {zillowLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
                    <span className="ml-2 text-[var(--sf-text-secondary)]">Checking property data...</span>
                  </div>
                )}
                
                {!zillowLoading && !zillowData && selectedAddress && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-yellow-800 mb-1">No Property Data Found</h4>
                        <p className="text-sm text-yellow-700">
                          No property information found for this address. The address may not be in the property database, or the property may not have available data.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {!zillowLoading && !zillowData && !selectedAddress && (
                  <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-8 text-center">
                    <MapPin className="w-12 h-12 text-[var(--sf-text-muted)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--sf-text-secondary)]">
                      Enter an address to see property information
                    </p>
                  </div>
                )}
                
                {zillowData && (
                  <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-4 space-y-4">
                    {zillowData.zpid && (
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--sf-border-light)]">
                        <h4 className="font-semibold text-[var(--sf-text-primary)]">Property Information</h4>
                        {zillowData.zpid && zillowData.zpid.startsWith('zpid') && (
                        <a
                            href={`https://www.zillow.com/homedetails/${zillowData.zpid.replace('zpid-', '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--sf-blue-500)] hover:text-blue-800 flex items-center space-x-1"
                        >
                          <span>View on Zillow</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        )}
                      </div>
                    )}
                    
                    {zillowData.address && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Address</label>
                        <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.address}</p>
                      </div>
                    )}
                    
                    {zillowData.price && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Zestimate</label>
                        <p className="text-lg font-semibold text-[var(--sf-text-primary)] mt-1">
                          ${parseInt(zillowData.price).toLocaleString()}
                        </p>
                      </div>
                    )}
                    
                    {zillowData.bedrooms && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Bedrooms</label>
                          <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.bedrooms}</p>
                        </div>
                        {zillowData.bathrooms && (
                          <div>
                            <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Bathrooms</label>
                            <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.bathrooms}</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {zillowData.squareFeet && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Square Feet</label>
                        <p className="text-sm text-[var(--sf-text-primary)] mt-1">{parseInt(zillowData.squareFeet).toLocaleString()} sq ft</p>
                      </div>
                    )}
                    
                    {zillowData.yearBuilt && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Year Built</label>
                        <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.yearBuilt}</p>
                      </div>
                    )}
                    
                    {zillowData.propertyType && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Property Type</label>
                        <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.propertyType}</p>
                      </div>
                    )}
                    
                    {zillowData.lotSize && (
                      <div>
                        <label className="text-xs font-medium text-[var(--sf-text-muted)] uppercase">Lot Size</label>
                        <p className="text-sm text-[var(--sf-text-primary)] mt-1">{zillowData.lotSize}</p>
                      </div>
                    )}
                    
                    {zillowData.image && (
                      <div>
                        <img
                          src={zillowData.image}
                          alt="Property"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

                {/* Notes */}
                <div className="mt-6 pt-6 border-t border-[var(--sf-border-light)]">
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Notes
                  </label>
                  <textarea
                    form="create-lead-form"
                    value={leadFormData.notes}
                    onChange={(e) => setLeadFormData({ ...leadFormData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
              </div>
            </div>
            {/* Footer — fixed at bottom of drawer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-[var(--sf-border-light)] bg-white flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  // Programmatically submit the form
                  const form = document.querySelector('#create-lead-form');
                  if (form) form.requestSubmit();
                }}
                className="flex-1 px-4 py-2.5 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--sf-blue-600)] transition-colors"
              >
                New Lead
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateLeadModal(false);
                  setZillowData(null);
                  setSelectedAddress(null);
                  setSelectedServiceForLead(null);
                }}
                className="px-4 py-2.5 bg-white border border-[var(--sf-border-light)] rounded-lg text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Stage Modal */}
      {showEditStageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--sf-border-light)] flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--sf-text-primary)]">Manage Stages</h2>
              <button
                onClick={() => setShowEditStageModal(false)}
                className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-[var(--sf-text-primary)] mb-2">Add New Stage</h3>
                  <form onSubmit={handleAddStage} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                        Stage Name
                      </label>
                      <input
                        type="text"
                        required
                        value={stageFormData.name}
                        onChange={(e) => setStageFormData({ ...stageFormData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                        Color
                      </label>
                      <input
                        type="color"
                        value={stageFormData.color}
                        onChange={(e) => setStageFormData({ ...stageFormData, color: e.target.value })}
                        className="w-full h-10 border border-[var(--sf-border-light)] rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                    >
                      Add Stage
                    </button>
                  </form>
                </div>
                
                <div className="border-t border-[var(--sf-border-light)] pt-4">
                  <h3 className="font-semibold text-[var(--sf-text-primary)] mb-2">Existing Stages</h3>
                  <div className="space-y-2">
                    {pipeline.stages && pipeline.stages.map((stage) => (
                      <div
                        key={stage.id}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{ backgroundColor: `${stage.color}20` }}
                      >
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <div
                            className="w-4 h-4 rounded flex-shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="font-medium truncate">{stage.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteStage(stage.id)}
                          className="text-red-600 hover:text-red-700 flex-shrink-0 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Lead Modal */}
      {showEditLeadModal && editingLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--sf-border-light)] flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--sf-text-primary)]">Edit Lead</h2>
              <button
                onClick={() => {
                  setShowEditLeadModal(false);
                  setEditingLead(null);
                  setEditCustomSource('');
                  setShowEditSourceDropdown(false);
                }}
                className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Form */}
                <form onSubmit={handleEditLead} className="space-y-4" autoComplete="off">
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={leadFormData.fullName}
                    onChange={(e) => setLeadFormData({ ...leadFormData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={leadFormData.email}
                      onChange={(e) => setLeadFormData({ ...leadFormData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={leadFormData.phone}
                      onChange={(e) => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={leadFormData.company}
                    onChange={(e) => setLeadFormData({ ...leadFormData, company: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Location
                  </label>
                  <AddressAutocompleteLeads
                    value={leadFormData.address}
                    onChange={(value) => {
                      setLeadFormData({ ...leadFormData, address: value });
                    }}
                    onAddressSelect={(addressData) => {
                      setSelectedAddress(addressData);
                      setLeadFormData(prev => ({
                        ...prev,
                        address: addressData.formattedAddress
                      }));
                      // Check property data when address is selected
                      if (addressData.components) {
                        checkZillowProperty(addressData);
                      }
                    }}
                    placeholder="Search location"
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Source
                  </label>
                  <div className="relative">
                    <div className="flex gap-2">
                      <select
                        value={leadFormData.source}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '__custom__') {
                            // Set the source to '__custom__' first, then show the input
                            setLeadFormData({ ...leadFormData, source: '__custom__' });
                            setEditCustomSource('');
                            setShowEditSourceDropdown(true);
                          } else {
                            setLeadFormData({ ...leadFormData, source: value });
                            setShowEditSourceDropdown(false);
                            setEditCustomSource(''); // Clear custom source when selecting a regular source
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      >
                        <option value="">Select a source...</option>
                        {leadSources.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                        <option value="__custom__">+ Add Custom Source</option>
                      </select>
                    </div>
                    
                    {showEditSourceDropdown && leadFormData.source === '__custom__' && (
                      <div className="mt-2 p-3 bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg">
                        <label className="block text-xs font-medium text-[var(--sf-text-primary)] mb-1">
                          Custom Source Name
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editCustomSource}
                            onChange={(e) => setEditCustomSource(e.target.value)}
                            placeholder="Enter custom source name"
                            className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editCustomSource.trim()) {
                                e.preventDefault();
                                addCustomSource(editCustomSource, true);
                              } else if (e.key === 'Escape') {
                                setEditCustomSource('');
                                setShowEditSourceDropdown(false);
                                setLeadFormData({ ...leadFormData, source: '' });
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editCustomSource.trim()) {
                                addCustomSource(editCustomSource, true);
                              }
                            }}
                            className="px-3 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] text-sm"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditCustomSource('');
                              setShowEditSourceDropdown(false);
                              setLeadFormData({ ...leadFormData, source: '' });
                            }}
                            className="px-3 py-2 bg-white border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] rounded-lg hover:bg-[var(--sf-bg-hover)] text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Allow typing custom source directly */}
                    {leadFormData.source && !leadSources.includes(leadFormData.source) && leadFormData.source !== '__custom__' && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newSource = leadFormData.source.trim();
                            if (newSource && !leadSources.includes(newSource)) {
                              const updatedSources = [...leadSources, newSource];
                              setLeadSources(updatedSources);
                              leadSourcesAPI.create(newSource).catch(() => {});
                            }
                          }}
                          className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]"
                        >
                          Save "{leadFormData.source}" as custom source
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Service
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowServiceSelectionModal(true)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] bg-white text-left hover:bg-[var(--sf-bg-page)] flex items-center justify-between"
                    >
                      <span className={leadFormData.serviceId ? "text-[var(--sf-text-primary)]" : "text-[var(--sf-text-muted)]"}>
                        {selectedServiceForLead 
                          ? decodeHtmlEntities(selectedServiceForLead.name || '')
                          : leadFormData.serviceId 
                            ? (() => {
                                const service = services.find(s => s.id === parseInt(leadFormData.serviceId));
                                return service ? decodeHtmlEntities(service.name || '') : 'Select a service...';
                              })()
                            : 'Select a service...'}
                      </span>
                      <span className="text-[var(--sf-text-muted)]">▼</span>
                    </button>
                    {selectedServiceForLead && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedServiceForLead(null);
                            setLeadFormData(prev => ({ ...prev, serviceId: '', value: '' }));
                          }}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Clear service
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                    Select a service to configure modifiers and calculate the estimated value. The estimate will update automatically based on your selections.
                  </p>
                  {selectedServiceForLead && (() => {
                    const estimatedPrice = calculateServiceEstimatedPrice(selectedServiceForLead);
                    return (
                      <p className="text-xs text-[var(--sf-blue-500)] mt-1 font-medium">
                        💰 Estimated value: ${estimatedPrice.toFixed(2)} (includes service and modifiers)
                      </p>
                    );
                  })()}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Estimated Value ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={leadFormData.value || ''}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      // Allow empty string for user to clear, but prevent negative numbers
                      if (inputValue === '' || (!isNaN(parseFloat(inputValue)) && parseFloat(inputValue) >= 0)) {
                        setLeadFormData({ ...leadFormData, value: inputValue });
                      }
                    }}
                    onBlur={(e) => {
                      // On blur, if empty or invalid, set to empty string
                      const inputValue = e.target.value;
                      if (inputValue !== '' && (isNaN(parseFloat(inputValue)) || parseFloat(inputValue) < 0)) {
                        setLeadFormData({ ...leadFormData, value: '' });
                      }
                    }}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    placeholder="0.00"
                  />
                  {leadFormData.serviceId && leadFormData.value && (
                    <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                      Service and estimated value can both be saved
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Notes
                  </label>
                  <textarea
                    value={leadFormData.notes}
                    onChange={(e) => setLeadFormData({ ...leadFormData, notes: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditLeadModal(false);
                      setEditingLead(null);
                      setEditCustomSource('');
                      setShowEditSourceDropdown(false);
                    }}
                    className="bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
                </form>
                
                {/* Right Column - Zillow Data (same as create modal) */}
                <div className="space-y-4">
                  {zillowLoading && (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
                      <span className="ml-2 text-[var(--sf-text-secondary)]">Loading property data...</span>
                    </div>
                  )}
                  
                  {!zillowLoading && zillowData && (
                    <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold text-[var(--sf-text-primary)] mb-3 flex items-center">
                        <Home className="w-5 h-5 mr-2 text-[var(--sf-blue-500)]" />
                        Property Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        {zillowData.propertyType && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Type:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.propertyType}</span>
                          </div>
                        )}
                        {zillowData.bedrooms && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Bedrooms:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.bedrooms}</span>
                          </div>
                        )}
                        {zillowData.bathrooms && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Bathrooms:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.bathrooms}</span>
                          </div>
                        )}
                        {zillowData.squareFootage && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Square Feet:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.squareFootage.toLocaleString()}</span>
                          </div>
                        )}
                        {zillowData.yearBuilt && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Year Built:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.yearBuilt}</span>
                          </div>
                        )}
                        {zillowData.lotSize && (
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">Lot Size:</span>{' '}
                            <span className="text-[var(--sf-text-primary)]">{zillowData.lotSize} sq ft</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {!zillowLoading && !zillowData && selectedAddress && (
                    <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-4 text-sm text-[var(--sf-text-secondary)]">
                      No property data found for this address.
                    </div>
                  )}
                  
                  {!selectedAddress && (
                    <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-4 text-sm text-[var(--sf-text-secondary)]">
                      Enter an address to see property information.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Lead Details Modal */}
      {showLeadDetailsModal && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--sf-border-light)] flex-shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--sf-text-primary)]">Lead Details</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditLead(selectedLead)}
                  className="px-3 py-1.5 text-sm bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] flex items-center gap-1"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => setShowLeadDetailsModal(false)}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                    {selectedLead.first_name} {selectedLead.last_name}
                  </h3>
                  {selectedLead.company && (
                    <p className="text-[var(--sf-text-secondary)] flex items-center mt-1">
                      <Building className="w-4 h-4 mr-2" />
                      {selectedLead.company}
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedLead.email && (
                    <div>
                      <label className="text-sm font-medium text-[var(--sf-text-primary)]">Email</label>
                      <p className="text-[var(--sf-text-primary)] flex items-center mt-1 break-words">
                        <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="break-all">{selectedLead.email}</span>
                      </p>
                    </div>
                  )}
                  {selectedLead.phone && (
                    <div>
                      <label className="text-sm font-medium text-[var(--sf-text-primary)]">Phone</label>
                      <p className="text-[var(--sf-text-primary)] flex items-center mt-1">
                        <Phone className="w-4 h-4 mr-2 flex-shrink-0" />
                        {formatPhoneNumber(selectedLead.phone)}
                      </p>
                    </div>
                  )}
                  {selectedLead.source && (
                    <div>
                      <label className="text-sm font-medium text-[var(--sf-text-primary)]">Source</label>
                      <p className="text-[var(--sf-text-primary)] mt-1">{selectedLead.source}</p>
                    </div>
                  )}
                  {selectedLead.value && (
                    <div>
                      <label className="text-sm font-medium text-[var(--sf-text-primary)]">Estimated Value</label>
                      <p className="text-[var(--sf-text-primary)] font-semibold text-green-600 mt-1">
                        ${parseFloat(selectedLead.value).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
                
                {selectedLead.notes && (
                  <div>
                    <label className="text-sm font-medium text-[var(--sf-text-primary)]">Notes</label>
                    <p className="text-[var(--sf-text-primary)] mt-1 whitespace-pre-wrap">{selectedLead.notes}</p>
                  </div>
                )}
                
                {/* Tasks Section */}
                <div className="pt-4 border-t border-[var(--sf-border-light)] mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Tasks</h3>
                    <button
                      onClick={() => {
                        setEditingTask(null);
                        setShowCreateTaskModal(true);
                      }}
                      className="px-3 py-1.5 text-sm bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                    >
                      + Add Task
                    </button>
                  </div>
                  
                  {/* Task Filters */}
                  {tasks.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        onClick={() => setTaskFilter('all')}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          taskFilter === 'all'
                            ? 'bg-[var(--sf-blue-500)] text-white'
                            : 'bg-white border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]'
                        }`}
                      >
                        All ({tasks.length})
                      </button>
                      <button
                        onClick={() => setTaskFilter('pending')}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          taskFilter === 'pending'
                            ? 'bg-[var(--sf-blue-500)] text-white'
                            : 'bg-white border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]'
                        }`}
                      >
                        Pending ({tasks.filter(t => t.status === 'pending').length})
                      </button>
                      {getOverdueTasksCount() > 0 && (
                        <button
                          onClick={() => setTaskFilter('overdue')}
                          className={`px-3 py-1 text-xs rounded-lg ${
                            taskFilter === 'overdue'
                              ? 'bg-red-600 text-white'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          Overdue ({getOverdueTasksCount()})
                        </button>
                      )}
                      <button
                        onClick={() => setTaskFilter('completed')}
                        className={`px-3 py-1 text-xs rounded-lg ${
                          taskFilter === 'completed'
                            ? 'bg-[var(--sf-blue-500)] text-white'
                            : 'bg-white border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]'
                        }`}
                      >
                        Completed ({tasks.filter(t => t.status === 'completed').length})
                      </button>
                    </div>
                  )}
                  
                  {/* Tasks List */}
                  {getFilteredTasks().length === 0 ? (
                    <div className="text-center py-8 text-[var(--sf-text-muted)]">
                      <p className="mb-2">No tasks {taskFilter !== 'all' ? `(${taskFilter})` : ''}</p>
                      {taskFilter === 'all' && (
                        <button
                          onClick={() => {
                            setEditingTask(null);
                            setShowCreateTaskModal(true);
                          }}
                          className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium"
                        >
                          Create your first task
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {getFilteredTasks().map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onEdit={handleEditTask}
                          onDelete={handleDeleteTask}
                          onStatusChange={handleTaskStatusChange}
                          onFinish={handleFinish}
                          onFinishAndFollowUp={handleFinishAndFollowUp}
                          showLeadInfo={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
                
                {selectedLead.converted_customer_id ? (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 text-green-700">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-semibold">This lead has been converted to a customer</span>
                      </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-[var(--sf-border-light)]">
                      <button
                        onClick={() => {
                          // Get assigned team member from tasks (if any) - find the most recent assigned task
                          const assignedTasks = tasks.filter(t => t.assigned_to);
                          const assignedTeamMemberId = assignedTasks.length > 0 
                            ? assignedTasks[assignedTasks.length - 1].assigned_to 
                            : null;
                          
                          // Navigate with lead data in location state
                          navigate(`/createjob?customerId=${selectedLead.converted_customer_id}`, {
                            state: {
                              fromLead: true,
                              leadData: {
                                serviceId: selectedLead.service_id || null,
                                assignedTeamMemberId: assignedTeamMemberId,
                                notes: selectedLead.notes || null,
                                value: selectedLead.value || null
                              }
                            }
                          });
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] flex items-center justify-center"
                      >
                        <Briefcase className="w-4 h-4 mr-2" />
                        Convert to Job
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end pt-4 border-t border-[var(--sf-border-light)] mt-4">
                    <button
                      onClick={() => setShowConvertLeadModal(true)}
                      className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Convert to Customer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Create/Edit Task Modal */}
      <CreateTaskModal
        isOpen={showCreateTaskModal}
        onClose={() => {
          setShowCreateTaskModal(false);
          setEditingTask(null);
        }}
        onSubmit={handleCreateTask}
        leadId={selectedLead?.id}
        teamMembers={teamMembers}
        initialData={editingTask}
        isEditing={!!editingTask}
      />
      
      {/* Convert Lead Modal */}
      {selectedLead && (
        <ConvertLeadModal
          isOpen={showConvertLeadModal}
          onClose={() => setShowConvertLeadModal(false)}
          lead={selectedLead}
          onConvert={handleConvertLead}
        />
      )}
      
      {/* Service Selection Modal */}
      <ServiceSelectionModal
        isOpen={showServiceSelectionModal}
        onClose={() => setShowServiceSelectionModal(false)}
        onServiceSelect={handleServiceSelectForLead}
        selectedServices={selectedServiceForLead ? [selectedServiceForLead] : []}
        user={user}
      />
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav teamMembers={teamMembers} />
    </div>
  );
};

export default LeadsPipeline;

