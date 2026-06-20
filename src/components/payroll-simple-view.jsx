"use client"

// Simplified Payroll UX — answers only three questions:
//   1) How much do I need to pay?
//   2) Who did I pay?
//   3) Can I generate/send paystubs?
//
// Ledger / balances / accounting concepts are hidden — this view sits on
// top of the existing payroll + paystub + payout-batch APIs and presents
// a single table of "due this period · per cleaner" with bulk actions.

import { useEffect, useMemo, useState } from "react"
import {
  Search, Download, FileText, Send, CheckCircle2, MoreHorizontal,
  ChevronDown, ChevronRight, X, Eye, Edit, AlertCircle, RefreshCw,
  Mail, DollarSign, Calendar,
} from "lucide-react"
import { paystubsAPI, ledgerAPI } from "../services/api"
import { SfCard, SfButton, SfAvatar, sfInitials } from "./sf-primitives"

// ── Tokens (mirror Service Blue CSS vars) ────────────────────────────────
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
const money = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const moneyShort = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
// 'YYYY-MM-DD' parsed as new Date(str) is UTC midnight, which renders as the
// previous day in any timezone west of UTC. Parse as local midnight instead.
const parseLocalDate = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  if (!y || !m || !d) return new Date(NaN)
  return new Date(y, m - 1, d)
}
const formatRange = (start, end) => {
  if (!start || !end) return "—"
  const s = parseLocalDate(start), e = parseLocalDate(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—"
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
}

// Build the per-member row shape from payrollData.teamMembers + paystub map + batch map
const buildRow = (m, paystub, batch) => {
  const teamMember = m.teamMember || {}
  const id = teamMember.id ?? teamMember.team_member_id ?? m.team_member_id
  const name = teamMember.name || `${teamMember.first_name || ""} ${teamMember.last_name || ""}`.trim() || teamMember.email || "Cleaner"
  return {
    id,
    name,
    role: teamMember.role || "Worker",
    email: teamMember.email || null,
    color: teamMember.color || T.blueDark,
    jobs: m.jobCount || 0,
    hours: Number(m.totalHours) || 0,
    baseEarnings: Number(m.hourlySalary || 0) + Number(m.commissionSalary || 0),
    tips: Number(m.totalTips) || 0,
    incentives: Number(m.totalIncentives) || 0,
    adjustments: Number(m.totalAdjustments || 0),
    cashOffset: Number(m.totalCashCollected || 0),
    totalDue: Number(m.totalSalary) || 0,
    paystub,                 // null | { id, sent_at, ... }
    batch,                   // null | { id, status, ... }
  }
}

// Paystub status pill
const PaystubPill = ({ paystub }) => {
  let label = "Not generated", c = T.ink3, bg = T.panelSoft
  if (paystub?.sent_at) { label = "Sent"; c = T.greenDark; bg = T.greenSoft }
  else if (paystub?.id) { label = "Generated"; c = T.blueDark; bg = T.blueSoft }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, background: bg, color: c,
      fontSize: 10.5, fontWeight: 700,
    }}>
      {paystub?.sent_at && <CheckCircle2 size={10} />}
      {label}
    </span>
  )
}

const PaymentPill = ({ batch }) => {
  if (!batch) {
    return <span style={{
      padding: "2px 8px", borderRadius: 999, background: T.panelSoft, color: T.ink3,
      fontSize: 10.5, fontWeight: 700,
    }}>Unpaid</span>
  }
  const meta = batch.status === "paid"
    ? { label: "Paid",       c: T.greenDark, bg: T.greenSoft }
    : batch.status === "pending"
      ? { label: "Processing", c: T.amberDark, bg: T.amberSoft }
      : { label: batch.status, c: T.ink3, bg: T.panelSoft }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999, background: meta.bg, color: meta.c,
      fontSize: 10.5, fontWeight: 700,
    }}>
      {batch.status === "paid" && <CheckCircle2 size={10} />}
      {meta.label}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════
// PAYSTUB DRAWER — slide-over with earnings breakdown + actions
// ════════════════════════════════════════════════════════════════════════

const PaystubDrawer = ({ open, row, periodStart, periodEnd, onClose, onAction }) => {
  if (!open || !row) return null
  const earnings = [
    { label: "Base earnings (hourly + commission)", value: row.baseEarnings },
    { label: "Tips",                                  value: row.tips },
    { label: "Bonus / incentives",                    value: row.incentives },
    { label: "Adjustments",                           value: row.adjustments },
    { label: "Cash already collected (offset)",       value: -row.cashOffset, isNegative: true },
  ]

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,.32)", zIndex: 60,
      }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 520, maxWidth: "100vw",
        background: T.panel, zIndex: 61, boxShadow: "-12px 0 32px rgba(15,23,42,.18)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: `1px solid ${T.borderS}`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <SfAvatar initials={sfInitials(row.name)} color={row.color} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{row.name}</div>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>{row.email || row.role}</div>
          </div>
          <button onClick={onClose} style={{
            padding: 6, borderRadius: 6, border: `1px solid ${T.borderS}`,
            background: T.panel, color: T.ink2, cursor: "pointer",
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Period banner */}
        <div style={{
          padding: "12px 18px", background: T.panelAlt,
          borderBottom: `1px solid ${T.borderS}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Calendar size={14} color={T.ink2} />
          <div>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Pay period</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginTop: 1 }}>
              {formatRange(periodStart, periodEnd)}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Jobs · Hours</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
              {row.jobs} · {row.hours.toFixed(1)}h
            </div>
          </div>
        </div>

        {/* Earnings breakdown */}
        <div style={{ padding: "14px 18px", flex: 1, overflowY: "auto" }}>
          <div style={{
            fontSize: 11, color: T.ink3, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8,
          }}>Earnings breakdown</div>
          {earnings.map((e, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 0", borderBottom: i < earnings.length - 1 ? `1px solid ${T.borderS}` : "none",
            }}>
              <span style={{ fontSize: 13, color: T.ink2 }}>{e.label}</span>
              <span style={{
                fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                color: e.isNegative ? T.redDark : (e.value > 0 ? T.ink : T.ink3),
              }}>
                {e.isNegative ? `−${money(Math.abs(e.value))}` : money(e.value)}
              </span>
            </div>
          ))}

          {/* Total */}
          <div style={{
            marginTop: 16, padding: "14px 16px",
            background: `linear-gradient(135deg, ${T.ink} 0%, #475569 100%)`,
            borderRadius: 10, color: "#fff",
          }}>
            <div style={{ fontSize: 10.5, opacity: .75, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Total due</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
              {money(row.totalDue)}
            </div>
            <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>
              {row.paystub?.id ? `Paystub #${row.paystub.id}` : "Paystub not yet generated"} ·{" "}
              {row.batch?.status === "paid" ? "Paid" : row.batch?.status === "pending" ? "Processing" : "Unpaid"}
            </div>
          </div>

          {/* Status notes */}
          {row.paystub?.sent_at && (
            <div style={{
              marginTop: 12, padding: "10px 12px", background: T.greenSoft,
              border: `1px solid ${T.greenDark}33`, borderRadius: 7,
              fontSize: 12, color: T.greenDark,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <CheckCircle2 size={14} />
              Paystub sent {new Date(row.paystub.sent_at).toLocaleDateString()}.
              {row.email && ` Delivered to ${row.email}.`}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: "12px 18px", borderTop: `1px solid ${T.borderS}`,
          background: T.panelAlt, display: "flex", gap: 8, flexWrap: "wrap",
        }}>
          {!row.paystub?.id && (
            <SfButton variant="secondary" size="sm" icon={FileText} onClick={() => onAction("generate", row)}>
              Generate PDF
            </SfButton>
          )}
          {row.paystub?.id && !row.paystub.sent_at && row.email && (
            <SfButton variant="secondary" size="sm" icon={Send} onClick={() => onAction("send", row)}>
              Send to cleaner
            </SfButton>
          )}
          {row.paystub?.id && row.paystub.sent_at && row.email && (
            <SfButton variant="ghost" size="sm" icon={Send} onClick={() => onAction("resend", row)}>
              Resend
            </SfButton>
          )}
          {row.paystub?.id && (
            <SfButton variant="ghost" size="sm" icon={Download} onClick={() => onAction("download", row)}>
              Download
            </SfButton>
          )}
          <div style={{ flex: 1 }} />
          {!row.batch || row.batch.status !== "paid" ? (
            <SfButton variant="primary" size="sm" icon={CheckCircle2} onClick={() => onAction("markPaid", row)}>
              Mark paid
            </SfButton>
          ) : (
            <span style={{
              padding: "6px 12px", borderRadius: 8, background: T.greenSoft, color: T.greenDark,
              fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <CheckCircle2 size={13} />
              Paid {row.batch.paid_at ? new Date(row.batch.paid_at).toLocaleDateString() : ""}
            </span>
          )}
        </div>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// ACTION MENU — popover for per-row actions
// ════════════════════════════════════════════════════════════════════════

const ActionMenu = ({ row, onAction, onClose }) => {
  const items = [
    { id: "view",     label: "View details",      icon: Eye },
    { id: "edit",     label: "Edit payroll",       icon: Edit },
    { id: "generate", label: row.paystub?.id ? "Regenerate paystub" : "Generate paystub", icon: FileText },
    ...(row.email && row.paystub?.id ? [{ id: "send", label: row.paystub.sent_at ? "Resend paystub" : "Send paystub", icon: Send }] : []),
    ...(row.paystub?.id ? [{ id: "download", label: "Download PDF", icon: Download }] : []),
    ...(!row.batch || row.batch.status !== "paid" ? [{ id: "markPaid", label: "Mark paid", icon: CheckCircle2 }] : []),
  ]
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70 }} />
      <div style={{
        position: "absolute", right: 0, top: "100%", marginTop: 4,
        background: T.panel, border: `1px solid ${T.borderS}`, borderRadius: 8,
        boxShadow: "0 8px 24px rgba(15,23,42,.12)", zIndex: 71, minWidth: 180,
        padding: 4,
      }}>
        {items.map((it) => (
          <button
            key={it.id}
            onClick={(e) => { e.stopPropagation(); onAction(it.id, row); onClose() }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "7px 10px", border: "none", background: "transparent",
              borderRadius: 6, fontSize: 12.5, fontWeight: 500, color: T.ink2,
              cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.panelSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <it.icon size={13} />
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SIMPLE PAY VIEW — main table
// ════════════════════════════════════════════════════════════════════════

export const SimplePayView = ({
  payrollData, batches, startDate, endDate, onRefresh, showToast, onEditMember, onViewMember,
}) => {
  const [selected, setSelected] = useState(new Set())
  const [paystubs, setPaystubs] = useState([])
  const [paystubsLoading, setPaystubsLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [drawerRow, setDrawerRow] = useState(null)
  const [actionMenuId, setActionMenuId] = useState(null)
  const [busy, setBusy] = useState(false)

  // ── Fetch existing paystubs for the period ──
  const fetchPaystubs = async () => {
    if (!startDate || !endDate) return
    setPaystubsLoading(true)
    try {
      const data = await paystubsAPI.list({ periodStart: startDate, periodEnd: endDate, limit: 1000 })
      setPaystubs(data?.paystubs || data || [])
    } catch (e) {
      // Ignore — list may 404 in some environments
      setPaystubs([])
    } finally {
      setPaystubsLoading(false)
    }
  }
  useEffect(() => { fetchPaystubs() }, [startDate, endDate])

  // Index paystubs + batches by team_member_id
  const paystubByMember = useMemo(() => {
    const map = {}
    paystubs.forEach((p) => {
      const id = p.team_member_id ?? p.teamMemberId
      if (id != null) map[String(id)] = p
    })
    return map
  }, [paystubs])

  const batchByMember = useMemo(() => {
    const map = {}
    // Only consider batches in this period
    ;(batches || []).forEach((b) => {
      if (b.status === "cancelled") return
      const periodMatches = (() => {
        if (!startDate || !endDate) return true
        const ps = b.period_start || b.period_end || ""
        return ps && ps >= startDate && ps <= endDate
      })()
      if (!periodMatches) return
      const id = String(b.team_member_id)
      // Prefer paid over pending if multiple
      if (!map[id] || (b.status === "paid" && map[id].status !== "paid")) map[id] = b
    })
    return map
  }, [batches, startDate, endDate])

  // Build rows
  const rows = useMemo(() => {
    const members = payrollData?.teamMembers || []
    return members
      .map((m) => {
        const id = m.teamMember?.id ?? m.teamMember?.team_member_id ?? m.team_member_id
        return buildRow(m, paystubByMember[String(id)] || null, batchByMember[String(id)] || null)
      })
      .filter((r) => r.id != null)
  }, [payrollData, paystubByMember, batchByMember])

  // Search filter
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q))
  }, [rows, search])

  // KPIs
  const kpis = useMemo(() => {
    const totalDue = rows.reduce((s, r) => s + r.totalDue, 0)
    const paid = rows.filter((r) => r.batch?.status === "paid")
    const totalPaid = paid.reduce((s, r) => s + r.totalDue, 0)
    const sent = rows.filter((r) => r.paystub?.sent_at).length
    const generated = rows.filter((r) => r.paystub?.id).length
    return {
      totalDue,
      totalPaid,
      remaining: Math.max(0, totalDue - totalPaid),
      cleanerCount: rows.length,
      paidCount: paid.length,
      paystubGenerated: generated,
      paystubSent: sent,
    }
  }, [rows])

  // ── Selection helpers ──
  const allVisibleIds = filteredRows.map((r) => String(r.id))
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))
  const someSelected = allVisibleIds.some((id) => selected.has(id))
  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected); allVisibleIds.forEach((id) => next.delete(id)); setSelected(next)
    } else {
      const next = new Set(selected); allVisibleIds.forEach((id) => next.add(id)); setSelected(next)
    }
  }
  const toggleOne = (id) => {
    const next = new Set(selected)
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id))
    setSelected(next)
  }
  const selectedRows = filteredRows.filter((r) => selected.has(String(r.id)))

  // ── Actions ──
  const generatePaystub = async (row) => {
    try {
      setBusy(true)
      const data = {
        teamMemberId: row.id,
        periodStart: startDate,
        periodEnd: endDate,
        totalEarnings: row.baseEarnings,
        totalTips: row.tips,
        totalBonus: row.incentives,
        totalAdjustments: row.adjustments,
        totalCashOffset: row.cashOffset,
        totalAmount: row.totalDue,
        jobCount: row.jobs,
        totalHours: row.hours,
      }
      await paystubsAPI.create(data)
      showToast?.("Paystub generated", "success")
      await fetchPaystubs()
    } catch (e) {
      showToast?.(e?.response?.data?.error || "Failed to generate paystub", "error")
    } finally { setBusy(false) }
  }

  const bulkGenerate = async () => {
    if (selectedRows.length === 0) return
    try {
      setBusy(true)
      await paystubsAPI.bulkCreate({
        periodStart: startDate,
        periodEnd: endDate,
        teamMemberIds: selectedRows.map((r) => r.id),
        rows: selectedRows.map((r) => ({
          teamMemberId: r.id,
          totalEarnings: r.baseEarnings,
          totalTips: r.tips,
          totalBonus: r.incentives,
          totalAdjustments: r.adjustments,
          totalCashOffset: r.cashOffset,
          totalAmount: r.totalDue,
          jobCount: r.jobs,
          totalHours: r.hours,
        })),
      })
      showToast?.(`Generated ${selectedRows.length} paystub${selectedRows.length === 1 ? "" : "s"}`, "success")
      await fetchPaystubs()
    } catch (e) {
      showToast?.(e?.response?.data?.error || "Failed to bulk generate", "error")
    } finally { setBusy(false) }
  }

  const sendPaystub = async (row) => {
    if (!row.paystub?.id) {
      await generatePaystub(row)
      // After generate, paystub list is refreshed — caller can re-trigger
      showToast?.("Paystub created — click Send again to email", "info")
      return
    }
    try {
      setBusy(true)
      if (row.paystub.sent_at) await paystubsAPI.resend(row.paystub.id)
      else await paystubsAPI.send(row.paystub.id)
      showToast?.(row.paystub.sent_at ? "Paystub resent" : "Paystub sent", "success")
      await fetchPaystubs()
    } catch (e) {
      showToast?.(e?.response?.data?.error || "Failed to send paystub", "error")
    } finally { setBusy(false) }
  }

  const bulkSend = async () => {
    const sendable = selectedRows.filter((r) => r.paystub?.id && r.email)
    if (sendable.length === 0) {
      showToast?.("No selected rows have a generated paystub + email", "info")
      return
    }
    try {
      setBusy(true)
      await paystubsAPI.bulkSend({ ids: sendable.map((r) => r.paystub.id) })
      showToast?.(`Sent ${sendable.length} paystub${sendable.length === 1 ? "" : "s"}`, "success")
      await fetchPaystubs()
    } catch (e) {
      showToast?.(e?.response?.data?.error || "Failed to bulk send", "error")
    } finally { setBusy(false) }
  }

  const downloadPaystub = async (row) => {
    if (!row.paystub?.id) {
      showToast?.("Generate the paystub first", "info")
      return
    }
    try {
      await paystubsAPI.downloadPdf(row.paystub.id, `paystub_${row.name.replace(/\s+/g, "_")}_${endDate}.pdf`)
    } catch (e) {
      showToast?.("Failed to download PDF", "error")
    }
  }

  const markPaid = async (row) => {
    try {
      setBusy(true)
      let batchId = row.batch?.id
      if (!batchId) {
        const created = await ledgerAPI.createPayoutBatch({
          teamMemberId: row.id,
          periodStart: startDate,
          periodEnd: endDate,
          includeScheduled: false,
        })
        batchId = created?.batch?.id || created?.id || created?.batchId
      }
      if (!batchId) {
        showToast?.("Could not find a batch to mark paid", "error")
        return
      }
      await ledgerAPI.markBatchPaid(batchId)
      showToast?.("Marked paid", "success")
      onRefresh?.()
    } catch (e) {
      showToast?.(e?.response?.data?.error || "Failed to mark paid", "error")
    } finally { setBusy(false) }
  }

  const bulkMarkPaid = async () => {
    if (selectedRows.length === 0) return
    try {
      setBusy(true)
      for (const row of selectedRows) await markPaid(row)
      showToast?.(`Marked ${selectedRows.length} as paid`, "success")
    } finally { setBusy(false) }
  }

  const exportCSV = () => {
    const cols = ["Cleaner", "Email", "Jobs", "Hours", "Base", "Tips", "Bonus/Incentives", "Adjustments", "Cash offset", "Total due", "Paystub", "Payment"]
    const lines = [cols.join(",")]
    filteredRows.forEach((r) => {
      lines.push([
        `"${r.name}"`,
        r.email || "",
        r.jobs,
        r.hours.toFixed(2),
        r.baseEarnings.toFixed(2),
        r.tips.toFixed(2),
        r.incentives.toFixed(2),
        r.adjustments.toFixed(2),
        r.cashOffset.toFixed(2),
        r.totalDue.toFixed(2),
        r.paystub?.sent_at ? "Sent" : r.paystub?.id ? "Generated" : "Not generated",
        r.batch?.status === "paid" ? "Paid" : r.batch?.status === "pending" ? "Processing" : "Unpaid",
      ].join(","))
    })
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `payroll_${startDate}_to_${endDate}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const handleAction = (action, row) => {
    if (action === "view")     onViewMember?.(row)
    if (action === "edit")     onEditMember?.(row)
    if (action === "generate") generatePaystub(row)
    if (action === "send" || action === "resend") sendPaystub(row)
    if (action === "download") downloadPaystub(row)
    if (action === "markPaid") markPaid(row)
  }

  return (
    <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Period banner + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total due this period", value: money(kpis.totalDue),    sub: `${kpis.cleanerCount} cleaner${kpis.cleanerCount === 1 ? "" : "s"}`, accent: T.blueDark },
          { label: "Already paid",          value: money(kpis.totalPaid),   sub: `${kpis.paidCount} paid`,                                            accent: T.greenDark },
          { label: "Remaining to pay",      value: money(kpis.remaining),   sub: `${kpis.cleanerCount - kpis.paidCount} pending`,                     accent: T.amberDark },
          { label: "Paystubs",              value: `${kpis.paystubGenerated} / ${kpis.cleanerCount}`, sub: `${kpis.paystubSent} sent`,                accent: T.purple },
        ].map((k) => (
          <SfCard key={k.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: T.ink3, fontWeight: 600 }}>{k.label}</span>
              <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 3, background: k.accent }} />
            </div>
            <div style={{
              fontSize: 22, fontWeight: 700, color: T.ink, marginTop: 6,
              letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
            }}>
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{k.sub}</div>
          </SfCard>
        ))}
      </div>

      {/* Search + bulk-action toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Search size={14} color={T.ink3} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            type="text"
            placeholder="Search cleaners…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "7px 10px 7px 30px",
              fontSize: 12.5, fontWeight: 500, color: T.ink,
              background: T.panel, border: `1px solid ${T.borderS}`, borderRadius: 8, outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {selected.size > 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 10px", background: T.blueSoft, border: `1px solid ${T.blue}33`,
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: T.blueDark,
          }}>
            <CheckCircle2 size={13} />
            {selected.size} selected
          </div>
        )}

        <SfButton variant="secondary" size="sm" icon={FileText} onClick={bulkGenerate} disabled={busy || selected.size === 0}>
          Generate paystubs
        </SfButton>
        <SfButton variant="secondary" size="sm" icon={Send} onClick={bulkSend} disabled={busy || selected.size === 0}>
          Send paystubs
        </SfButton>
        <SfButton variant="secondary" size="sm" icon={CheckCircle2} onClick={bulkMarkPaid} disabled={busy || selected.size === 0}>
          Mark paid
        </SfButton>
        <SfButton variant="ghost" size="sm" icon={Download} onClick={exportCSV}>
          Export CSV
        </SfButton>
      </div>

      {/* Table */}
      <SfCard padding={false}>
        {paystubsLoading && (
          <div style={{
            padding: "6px 14px", fontSize: 11, color: T.ink3,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={11} className="animate-spin" /> Loading paystub status…
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: T.panelAlt, borderBottom: `1px solid ${T.borderS}` }}>
                <th style={{ width: 36, padding: "10px 8px 10px 16px" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected }}
                    onChange={toggleAll}
                  />
                </th>
                {[
                  ["Cleaner", "left"],
                  ["Jobs", "right"],
                  ["Hours", "right"],
                  ["Tips", "right"],
                  ["Bonus", "right"],
                  ["Adjust.", "right"],
                  ["Total due", "right"],
                  ["Paystub", "left"],
                  ["Payment", "left"],
                  ["", "right"],
                ].map(([label, align]) => (
                  <th key={label} style={{
                    padding: "10px 12px", textAlign: align,
                    fontSize: 10.5, fontWeight: 700, color: T.ink3,
                    textTransform: "uppercase", letterSpacing: ".04em",
                  }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 40, textAlign: "center", color: T.ink3, fontSize: 13 }}>
                    No cleaners with earnings in this period.
                  </td>
                </tr>
              ) : filteredRows.map((r, i) => {
                const isSelected = selected.has(String(r.id))
                return (
                  <tr key={r.id} style={{
                    borderBottom: i < filteredRows.length - 1 ? `1px solid ${T.borderS}` : "none",
                    background: isSelected ? T.blueSoft + "55" : "transparent",
                  }}>
                    <td style={{ padding: "12px 8px 12px 16px" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(r.id)} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <SfAvatar initials={sfInitials(r.name)} color={r.color} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{r.name}</div>
                          <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{r.role}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.jobs}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.hours.toFixed(1)}h</td>
                    <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.tips > 0 ? T.greenDark : T.ink3 }}>
                      {r.tips > 0 ? money(r.tips) : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.incentives > 0 ? T.amberDark : T.ink3 }}>
                      {r.incentives > 0 ? money(r.incentives) : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.adjustments !== 0 ? T.ink : T.ink3 }}>
                      {r.adjustments !== 0 ? money(r.adjustments) : "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color: T.ink,
                        letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums",
                      }}>{money(r.totalDue)}</span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <PaystubPill paystub={r.paystub} />
                    </td>
                    <td style={{ padding: "12px" }}>
                      <PaymentPill batch={r.batch} />
                    </td>
                    <td style={{ padding: "12px", textAlign: "right", position: "relative" }}>
                      <button
                        onClick={() => setDrawerRow(r)}
                        title="View details"
                        style={{
                          padding: 5, marginRight: 4, borderRadius: 6,
                          border: `1px solid ${T.borderS}`, background: T.panel, color: T.ink2, cursor: "pointer",
                        }}
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => setActionMenuId(actionMenuId === r.id ? null : r.id)}
                        title="More actions"
                        style={{
                          padding: 5, borderRadius: 6,
                          border: `1px solid ${T.borderS}`, background: T.panel, color: T.ink2, cursor: "pointer",
                        }}
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {actionMenuId === r.id && (
                        <ActionMenu row={r} onAction={handleAction} onClose={() => setActionMenuId(null)} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SfCard>

      <PaystubDrawer
        open={!!drawerRow}
        row={drawerRow}
        periodStart={startDate}
        periodEnd={endDate}
        onClose={() => setDrawerRow(null)}
        onAction={(action, row) => {
          handleAction(action, row)
          if (action === "markPaid") setDrawerRow(null)
        }}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// SIMPLE HISTORY VIEW — one row per past payroll run (period-grouped)
// ════════════════════════════════════════════════════════════════════════

export const SimpleHistoryView = ({ batches, teamMembers, onViewRun, showToast }) => {
  // Group batches by period_start+period_end → one "run" per period
  const runs = useMemo(() => {
    const map = {}
    ;(batches || []).filter((b) => b.status !== "cancelled").forEach((b) => {
      const key = `${b.period_start || ""}|${b.period_end || ""}`
      if (!map[key]) map[key] = {
        period_start: b.period_start, period_end: b.period_end,
        batches: [], totalPaid: 0, cleanerIds: new Set(), allPaid: true,
      }
      map[key].batches.push(b)
      map[key].totalPaid += parseFloat(b.total_amount) || 0
      if (b.team_member_id != null) map[key].cleanerIds.add(b.team_member_id)
      if (b.status !== "paid") map[key].allPaid = false
    })
    return Object.values(map)
      .map((r) => ({
        ...r,
        cleanerCount: r.cleanerIds.size,
        paystubsSent: r.batches.filter((b) => b.paystub_sent_at).length, // best-effort
        latestDate: r.batches.reduce((d, b) => (b.paid_at || b.created_at) > d ? (b.paid_at || b.created_at) : d, ""),
      }))
      .sort((a, b) => (b.latestDate || "").localeCompare(a.latestDate || ""))
  }, [batches])

  const downloadRunCSV = (run) => {
    const cols = ["Cleaner", "Period start", "Period end", "Amount", "Status", "Paid at"]
    const lines = [cols.join(",")]
    run.batches.forEach((b) => {
      const tm = (teamMembers || []).find((m) => String(m.id) === String(b.team_member_id))
      const name = tm ? `${tm.first_name || ""} ${tm.last_name || ""}`.trim() : `Member #${b.team_member_id}`
      lines.push([
        `"${name}"`, b.period_start || "", b.period_end || "",
        (parseFloat(b.total_amount) || 0).toFixed(2),
        b.status, b.paid_at || "",
      ].join(","))
    })
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `payroll_run_${run.period_start}_to_${run.period_end}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  if (runs.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: "center", background: T.panel,
        border: `1px solid ${T.borderS}`, borderRadius: 10,
      }}>
        <DollarSign size={28} color={T.ink3} style={{ margin: "0 auto" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink2, marginTop: 8 }}>No payroll runs yet</div>
        <div style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>
          Pay your first cleaner from the Simple Pay tab — history will populate automatically.
        </div>
      </div>
    )
  }

  return (
    <SfCard padding={false}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: T.panelAlt, borderBottom: `1px solid ${T.borderS}` }}>
              {["Period", "Total paid", "Cleaners paid", "Paystubs sent", "Status", "Actions"].map((label, i) => (
                <th key={label} style={{
                  padding: "10px 14px",
                  textAlign: i === 1 || i === 2 || i === 3 ? "right" : "left",
                  fontSize: 10.5, fontWeight: 700, color: T.ink3,
                  textTransform: "uppercase", letterSpacing: ".04em",
                }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i} style={{
                borderBottom: i < runs.length - 1 ? `1px solid ${T.borderS}` : "none",
              }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {formatRange(r.period_start, r.period_end)}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>
                    {r.latestDate ? `last activity ${new Date(r.latestDate).toLocaleDateString()}` : ""}
                  </div>
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                    {money(r.totalPaid)}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.cleanerCount}
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.paystubsSent}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 999,
                    background: r.allPaid ? T.greenSoft : T.amberSoft,
                    color: r.allPaid ? T.greenDark : T.amberDark,
                    fontSize: 10.5, fontWeight: 700,
                  }}>{r.allPaid ? "Complete" : "Partial"}</span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <SfButton variant="ghost" size="sm" icon={Eye} onClick={() => onViewRun?.(r)}>View</SfButton>
                    <SfButton variant="ghost" size="sm" icon={Download} onClick={() => downloadRunCSV(r)}>CSV</SfButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SfCard>
  )
}
