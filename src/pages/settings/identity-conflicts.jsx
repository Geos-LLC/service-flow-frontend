"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Filter,
  Layers,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from "lucide-react"
import api from "../../services/api"
import SettingsRailLayout from "../../components/settings-rail-layout"
import {
  SfButton,
  SfCard,
  SfCardHeader,
  SfTag,
} from "../../components/sf-primitives"

/**
 * Settings → Data Integrity → Identity Conflicts.
 *
 * Backed by /api/identity-conflicts/* endpoints (P0.1, 2026-05-20).
 * See docs/operations/recipient_source_map.md + lib/phone-identity-registry.js
 * in the backend repo.
 *
 * Phase 1 actions: keep_separate, ignore.
 * Phase 2 actions (merge, change_owner) are surfaced with a "Coming soon"
 * disabled state so operators can see they exist.
 */

// ── helpers ────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  cross_role_duplicate: {
    label: "Cross-role",
    color: "var(--sf-red-dark)",
    bg: "var(--sf-red-soft)",
    icon: AlertOctagon,
  },
  same_role_duplicate: {
    label: "Same-role",
    color: "var(--sf-amber-dark, #B45309)",
    bg: "var(--sf-amber-soft, #FEF3C7)",
    icon: AlertTriangle,
  },
  cross_tenant_duplicate: {
    label: "Cross-tenant",
    color: "var(--sf-purple, #7C3AED)",
    bg: "var(--sf-purple-soft, #EDE9FE)",
    icon: AlertOctagon,
  },
}

const STATUS_STYLES = {
  open: { label: "Open", color: "var(--sf-red-dark)", bg: "var(--sf-red-soft)" },
  resolved: { label: "Resolved", color: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" },
  ignored: { label: "Ignored", color: "var(--sf-ink-3)", bg: "var(--sf-panel-soft)" },
}

const ENTITY_TYPE_LABEL = {
  customer: "Customer",
  team_member: "Team member",
  user: "Owner",
  lead: "Lead",
  conversation: "Conversation",
  external: "External",
}

const EXTERNAL_SOURCE_STYLES = {
  zenbooker: { label: "Zenbooker", color: "#1E3A8A", bg: "#DBEAFE" },
  leadbridge: { label: "LeadBridge", color: "#92400E", bg: "#FEF3C7" },
  openphone: { label: "OpenPhone", color: "#5B21B6", bg: "#EDE9FE" },
  sf: { label: "ServiceFlow", color: "var(--sf-ink-2)", bg: "var(--sf-panel-soft)" },
  unknown: { label: "Unknown", color: "var(--sf-ink-3)", bg: "var(--sf-panel-soft)" },
}

const maskPhone = (p) => {
  if (!p) return "—"
  const digits = String(p).replace(/\D/g, "")
  if (digits.length < 4) return "***"
  return `*** *** ${digits.slice(-4)}`
}

// Format a phone for display in the drawer (unmasked — the operator
// needs the actual number to act on the conflict). Falls back to the
// raw stored value if it isn't 10 / 11 digits.
const formatPhone = (p) => {
  if (!p) return "—"
  const digits = String(p).replace(/\D/g, "")
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return p
}

const fmtDate = (iso) => {
  if (!iso) return "—"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

// ── KPI card ──────────────────────────────────────────────────────

const Kpi = ({ label, value, sub, icon: Icon, accent, loading }) => (
  <SfCard padding={0} className="flex-1 min-w-[170px]">
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        {Icon && (
          <Icon
            size={13}
            strokeWidth={2}
            style={{ color: accent || "var(--sf-ink-3)" }}
          />
        )}
        <span className="text-[11.5px] text-[var(--sf-ink-3)] font-medium">{label}</span>
      </div>
      <div
        className="text-[24px] font-bold text-[var(--sf-ink)] leading-none mt-1.5"
        style={{ letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
      >
        {loading ? "…" : value}
      </div>
      {sub && <div className="text-[11px] text-[var(--sf-ink-3)] mt-1">{sub}</div>}
    </div>
  </SfCard>
)

// ── tiny inline sparkline (SVG, no deps) ──────────────────────────

const Sparkline = ({ data, width = 320, height = 64 }) => {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11.5px] text-[var(--sf-ink-3)]"
        style={{ width, height }}
      >
        No data in window
      </div>
    )
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  const pad = 6
  const w = width - pad * 2
  const h = height - pad * 2
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const points = data
    .map((d, i) => {
      const x = pad + i * step
      const y = pad + h - (d.count / max) * h
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg width={width} height={height} aria-label="Conflicts per day">
      <polyline
        fill="none"
        stroke="var(--sf-blue)"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      {data.map((d, i) => {
        const x = pad + i * step
        const y = pad + h - (d.count / max) * h
        return (
          <circle key={d.day} cx={x} cy={y} r={2.2} fill="var(--sf-blue)">
            <title>{`${d.day}: ${d.count}`}</title>
          </circle>
        )
      })}
    </svg>
  )
}

// ── Filter bar ─────────────────────────────────────────────────────

const FilterBar = ({ filters, setFilters, onReset }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex items-center gap-1.5 text-[12px] text-[var(--sf-ink-3)]">
      <Filter size={13} />
      <span className="font-medium">Filters:</span>
    </div>
    <select
      value={filters.status}
      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
      className="rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2 py-1"
      style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink-2)" }}
    >
      <option value="open">Status: Open</option>
      <option value="resolved">Status: Resolved</option>
      <option value="ignored">Status: Ignored</option>
    </select>
    <select
      value={filters.severity}
      onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
      className="rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2 py-1"
      style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink-2)" }}
    >
      <option value="">Severity: All</option>
      <option value="cross_role_duplicate">Cross-role</option>
      <option value="same_role_duplicate">Same-role</option>
      <option value="cross_tenant_duplicate">Cross-tenant</option>
    </select>
    <input
      type="date"
      value={filters.dateFrom || ""}
      onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
      className="rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2 py-1"
      style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink-2)" }}
    />
    <span className="text-[11px] text-[var(--sf-ink-3)]">→</span>
    <input
      type="date"
      value={filters.dateTo || ""}
      onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
      className="rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2 py-1"
      style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink-2)" }}
    />
    <SfButton variant="ghost" size="sm" onClick={onReset}>
      Reset
    </SfButton>
  </div>
)

// ── Detail drawer ─────────────────────────────────────────────────

const DetailDrawer = ({ open, conflict, onClose, onResolve }) => {
  if (!open || !conflict) return null
  const sev = SEVERITY_STYLES[conflict.severity] || SEVERITY_STYLES.same_role_duplicate
  const stat = STATUS_STYLES[conflict.status] || STATUS_STYLES.open
  const owners = Array.isArray(conflict.owners) ? conflict.owners : []
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.35)",
          zIndex: 40,
        }}
      />
      <aside
        role="dialog"
        aria-label="Conflict detail"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 95vw)",
          background: "var(--sf-panel)",
          zIndex: 41,
          boxShadow: "-12px 0 32px rgba(15,23,42,0.18)",
          overflowY: "auto",
          fontFamily: "var(--sf-font-ui)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--sf-border-soft)" }}>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase text-[var(--sf-ink-3)]" style={{ letterSpacing: ".05em" }}>
              Conflict #{conflict.id}
            </div>
            <div className="text-[17px] font-semibold text-[var(--sf-ink)] truncate mt-0.5" style={{ fontFamily: "var(--sf-font-mono)", letterSpacing: "-0.01em" }}>
              {formatPhone(conflict.normalized_phone)}
            </div>
            <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5">
              Raw normalized: <span style={{ fontFamily: "var(--sf-font-mono)" }}>{conflict.normalized_phone}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded hover:bg-[var(--sf-panel-soft)]"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <SfTag color={sev.color} bg={sev.bg}>
              {sev.label}
            </SfTag>
            <SfTag color={stat.color} bg={stat.bg}>
              {stat.label}
            </SfTag>
            <SfTag>
              {owners.length} {owners.length === 1 ? "owner" : "owners"}
            </SfTag>
          </div>

          <SfCard>
            <SfCardHeader title="Owners" subtitle="Entities currently registered against this phone" />
            <div className="flex flex-col gap-2">
              {owners.map((o, i) => {
                const ext = EXTERNAL_SOURCE_STYLES[o.external_source] || EXTERNAL_SOURCE_STYLES.unknown
                const detailHref =
                  o.entity_type === "customer" ? `/customers/${o.entity_id}`
                  : o.entity_type === "team_member" ? `/team`
                  : o.entity_type === "lead" ? `/leads`
                  : null
                return (
                  <div
                    key={`${o.entity_type}-${o.entity_id}-${i}`}
                    className="rounded-md p-3"
                    style={{
                      background: "var(--sf-panel-soft)",
                      border: "1px solid var(--sf-border-soft)",
                    }}
                  >
                    {/* Top row: type + name + ext source chip + missing flag */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <SfTag color="var(--sf-ink-2)" bg="var(--sf-panel)">
                        {ENTITY_TYPE_LABEL[o.entity_type] || o.entity_type}
                      </SfTag>
                      {o.missing ? (
                        <SfTag color="var(--sf-red-dark)" bg="var(--sf-red-soft)">
                          Source row not found
                        </SfTag>
                      ) : (
                        <>
                          <span className="text-[13px] font-semibold text-[var(--sf-ink)]">
                            {o.name || `#${o.entity_id}`}
                          </span>
                          <SfTag color={ext.color} bg={ext.bg}>
                            From {ext.label}
                          </SfTag>
                        </>
                      )}
                    </div>

                    {/* Body: ID, phone, email, source, first_seen */}
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                      <div>
                        <span className="text-[var(--sf-ink-3)]">ID:</span>{" "}
                        <span className="text-[var(--sf-ink-2)]" style={{ fontFamily: "var(--sf-font-mono)" }}>
                          #{o.entity_id}
                        </span>
                      </div>
                      {!o.missing && (
                        <>
                          <div>
                            <span className="text-[var(--sf-ink-3)]">Phone:</span>{" "}
                            <span className="text-[var(--sf-ink-2)]" style={{ fontFamily: "var(--sf-font-mono)" }}>
                              {formatPhone(o.phone) || "—"}
                            </span>
                          </div>
                          {o.email && (
                            <div>
                              <span className="text-[var(--sf-ink-3)]">Email:</span>{" "}
                              <span className="text-[var(--sf-ink-2)]">{o.email}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div>
                        <span className="text-[var(--sf-ink-3)]">Registry source:</span>{" "}
                        <span className="text-[var(--sf-ink-2)]">{o.source || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[var(--sf-ink-3)]">First seen:</span>{" "}
                        <span className="text-[var(--sf-ink-2)]">{fmtDate(o.first_seen)}</span>
                      </div>
                    </div>

                    {/* Open-record link (operator can navigate to the underlying entity) */}
                    {!o.missing && detailHref && (
                      <div className="mt-2">
                        <a
                          href={detailHref}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11.5px] font-semibold underline"
                          style={{ color: "var(--sf-blue-dark)" }}
                        >
                          Open record →
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
              {owners.length === 0 && (
                <div className="text-[12px] text-[var(--sf-ink-3)] italic">No owner records.</div>
              )}
            </div>
          </SfCard>

          <SfCard>
            <SfCardHeader title="Timeline" />
            <div className="text-[12px] text-[var(--sf-ink-2)] space-y-1.5">
              <div>
                <span className="text-[var(--sf-ink-3)]">First detected:</span>{" "}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(conflict.created_at)}</span>
              </div>
              <div>
                <span className="text-[var(--sf-ink-3)]">Last updated:</span>{" "}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(conflict.updated_at)}</span>
              </div>
              {conflict.resolved_at && (
                <div>
                  <span className="text-[var(--sf-ink-3)]">Resolved:</span>{" "}
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDate(conflict.resolved_at)}</span>{" "}
                  {conflict.resolution && (
                    <SfTag color="var(--sf-ink-2)" bg="var(--sf-panel-soft)">
                      {conflict.resolution}
                    </SfTag>
                  )}
                </div>
              )}
              {conflict.resolution_note && (
                <div>
                  <span className="text-[var(--sf-ink-3)]">Note:</span>{" "}
                  <span>{conflict.resolution_note}</span>
                </div>
              )}
            </div>
          </SfCard>

          {conflict.status === "open" && (
            <div className="flex items-center gap-2">
              <SfButton variant="primary" size="md" onClick={() => onResolve(conflict, "keep_separate")} icon={CheckCircle2}>
                Keep separate
              </SfButton>
              <SfButton variant="secondary" size="md" onClick={() => onResolve(conflict, "ignore")} icon={EyeOff}>
                Ignore
              </SfButton>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

// ── Resolve modal ──────────────────────────────────────────────────

const ResolveModal = ({ open, action, conflict, onClose, onConfirm, submitting }) => {
  const [note, setNote] = useState("")
  useEffect(() => {
    if (open) setNote("")
  }, [open])
  if (!open || !conflict) return null
  const isKeepSeparate = action === "keep_separate"
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.45)",
          zIndex: 50,
        }}
      />
      <div
        role="dialog"
        aria-label="Resolve conflict"
        style={{
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, 92vw)",
          background: "var(--sf-panel)",
          borderRadius: 12,
          zIndex: 51,
          boxShadow: "0 24px 64px rgba(15,23,42,0.25)",
          overflow: "hidden",
          fontFamily: "var(--sf-font-ui)",
        }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--sf-border-soft)" }}>
          <div className="text-[14px] font-semibold text-[var(--sf-ink)]">
            {isKeepSeparate ? "Keep separate" : "Ignore conflict"}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-[var(--sf-panel-soft)]"
            style={{ border: "none", background: "transparent", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12.5px] text-[var(--sf-ink-2)] leading-relaxed">
            {isKeepSeparate ? (
              <>
                Mark this collision as <strong>intentional</strong>. SMS sends to this phone will still be blocked
                by the recipient-integrity guard until the underlying entities are reconciled or the guard is
                relaxed.
              </>
            ) : (
              <>
                Hide this conflict from the open list. A new conflict for the same phone will reappear automatically
                if data changes in the future.
              </>
            )}
          </p>
          <label className="block mt-3 text-[11.5px] font-semibold text-[var(--sf-ink-2)]">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for the audit trail"
            rows={3}
            maxLength={1000}
            className="w-full mt-1 rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2.5 py-2 outline-none"
            style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink)", fontFamily: "var(--sf-font-ui)" }}
          />
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--sf-border-soft)" }}>
          <SfButton variant="ghost" size="md" onClick={onClose}>
            Cancel
          </SfButton>
          <SfButton
            variant="primary"
            size="md"
            onClick={() => onConfirm(action, note)}
            disabled={submitting}
          >
            {submitting ? "Resolving…" : isKeepSeparate ? "Keep separate" : "Ignore"}
          </SfButton>
        </div>
      </div>
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────

const IdentityConflictsPage = () => {
  const [filters, setFilters] = useState({ status: "open", severity: "", dateFrom: "", dateTo: "" })
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [summary, setSummary] = useState(null)
  const [perDay, setPerDay] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState(null)
  const [resolveAction, setResolveAction] = useState(null) // 'keep_separate' | 'ignore' | null
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const flash = useCallback((text, kind = "ok") => {
    setToast({ text, kind })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Client-side date-range filter (server doesn't yet take date params).
  const visibleRows = useMemo(() => {
    if (!filters.dateFrom && !filters.dateTo) return rows
    return rows.filter((r) => {
      const created = r.created_at ? r.created_at.slice(0, 10) : null
      if (filters.dateFrom && (!created || created < filters.dateFrom)) return false
      if (filters.dateTo && (!created || created > filters.dateTo)) return false
      return true
    })
  }, [rows, filters.dateFrom, filters.dateTo])

  useEffect(() => {
    let cancelled = false
    setLoadingList(true)
    const params = { status: filters.status, limit: 200 }
    if (filters.severity) params.severity = filters.severity
    api
      .get("/identity-conflicts", { params })
      .then((res) => {
        if (cancelled) return
        setRows(res.data?.rows || [])
        setTotal(res.data?.total || 0)
      })
      .catch(() => {
        if (cancelled) return
        setRows([])
        setTotal(0)
      })
      .finally(() => {
        if (cancelled) return
        setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters.status, filters.severity, refreshKey])

  useEffect(() => {
    let cancelled = false
    api
      .get("/identity-conflicts/summary", { params: { windowDays: 7 } })
      .then((res) => {
        if (cancelled) return
        setSummary(res.data)
      })
      .catch(() => {})
    api
      .get("/identity-conflicts/per-day", { params: { days: 14 } })
      .then((res) => {
        if (cancelled) return
        setPerDay(res.data?.rows || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const handleResolve = useCallback(
    async (action, note) => {
      if (!selected) return
      setSubmitting(true)
      try {
        await api.post(`/identity-conflicts/${selected.id}/resolve`, { action, note: note || undefined })
        setResolveAction(null)
        setSelected(null)
        setRefreshKey((k) => k + 1)
        flash(action === "ignore" ? "Conflict ignored." : "Conflict marked as resolved.")
      } catch (err) {
        const msg =
          err?.response?.data?.error === "not_open"
            ? "Conflict is no longer open."
            : err?.response?.data?.error || "Failed to resolve conflict."
        flash(msg, "err")
      } finally {
        setSubmitting(false)
      }
    },
    [selected, flash]
  )

  return (
    <SettingsRailLayout
      title="Identity conflicts"
      section="Data integrity"
      subtitle="Cross-role and same-role phone collisions detected in your data. Resolve to prevent SMS misroutes."
      actions={
        <SfButton variant="secondary" size="md" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>
          Refresh
        </SfButton>
      }
    >
      <div className="flex flex-col gap-4">
        {/* KPI row */}
        <div className="flex flex-wrap items-stretch gap-3">
          <Kpi
            label="Open conflicts"
            value={summary?.identity_conflict_count ?? "—"}
            icon={AlertOctagon}
            accent="var(--sf-red-dark)"
            loading={!summary}
            sub="Total awaiting review"
          />
          <Kpi
            label="Cross-role"
            value={summary?.cross_role_phone_count ?? "—"}
            icon={Layers}
            accent="var(--sf-red-dark)"
            loading={!summary}
            sub="Different roles share a phone"
          />
          <Kpi
            label="Same-role"
            value={summary?.same_role_phone_count ?? "—"}
            icon={Users}
            accent="var(--sf-amber-dark, #B45309)"
            loading={!summary}
            sub="Duplicate within the same role"
          />
          <Kpi
            label="New (7d)"
            value={summary?.new_conflicts_in_window ?? "—"}
            icon={TrendingUp}
            accent="var(--sf-blue)"
            loading={!summary}
            sub={`Detected in the last ${summary?.window_days ?? 7} days`}
          />
        </div>

        {/* Sparkline */}
        <SfCard>
          <SfCardHeader
            title="New conflicts per day"
            subtitle="Last 14 days · hover dots for daily count"
          />
          <Sparkline data={perDay} width={520} height={72} />
        </SfCard>

        {/* Filters */}
        <SfCard>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            onReset={() => setFilters({ status: "open", severity: "", dateFrom: "", dateTo: "" })}
          />
        </SfCard>

        {/* Table */}
        <SfCard padding={0}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--sf-border-soft)" }}>
            <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
              {filters.status === "open" ? "Open" : filters.status === "ignored" ? "Ignored" : "Resolved"} conflicts
            </div>
            <div className="text-[11.5px] text-[var(--sf-ink-3)]">
              Showing {visibleRows.length} of {total}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--sf-font-ui)" }}>
              <thead>
                <tr style={{ background: "var(--sf-panel-soft)" }}>
                  <Th>Phone</Th>
                  <Th>Severity</Th>
                  <Th>Owners</Th>
                  <Th>First seen</Th>
                  <Th>Status</Th>
                  <Th style={{ textAlign: "right", paddingRight: 16 }}>Action</Th>
                </tr>
              </thead>
              <tbody>
                {loadingList && (
                  <tr>
                    <Td colSpan={6}>
                      <div className="text-[12px] text-[var(--sf-ink-3)] py-6 text-center">Loading…</div>
                    </Td>
                  </tr>
                )}
                {!loadingList && visibleRows.length === 0 && (
                  <tr>
                    <Td colSpan={6}>
                      <div className="text-[12px] text-[var(--sf-ink-3)] py-6 text-center">
                        No conflicts match the current filters.
                      </div>
                    </Td>
                  </tr>
                )}
                {!loadingList &&
                  visibleRows.map((r) => {
                    const sev = SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.same_role_duplicate
                    const stat = STATUS_STYLES[r.status] || STATUS_STYLES.open
                    const ownersList = Array.isArray(r.owners) ? r.owners : []
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        style={{
                          borderTop: "1px solid var(--sf-border-soft)",
                          cursor: "pointer",
                        }}
                      >
                        <Td>
                          <span style={{ fontFamily: "var(--sf-font-mono)", fontSize: 13, fontWeight: 600 }}>
                            {maskPhone(r.normalized_phone)}
                          </span>
                        </Td>
                        <Td>
                          <SfTag color={sev.color} bg={sev.bg}>
                            {sev.label}
                          </SfTag>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {ownersList.map((o, i) => {
                              const ext = EXTERNAL_SOURCE_STYLES[o.external_source] || EXTERNAL_SOURCE_STYLES.unknown
                              const label = o.name
                                ? `${ENTITY_TYPE_LABEL[o.entity_type] || o.entity_type}: ${o.name}`
                                : `${ENTITY_TYPE_LABEL[o.entity_type] || o.entity_type} #${o.entity_id}`
                              return (
                                <SfTag key={i} color={ext.color} bg={ext.bg}>
                                  {label}
                                </SfTag>
                              )
                            })}
                          </div>
                        </Td>
                        <Td>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
                            {fmtDate(r.created_at)}
                          </span>
                        </Td>
                        <Td>
                          <SfTag color={stat.color} bg={stat.bg}>
                            {stat.label}
                          </SfTag>
                        </Td>
                        <Td style={{ textAlign: "right", paddingRight: 16 }}>
                          {r.status === "open" && (
                            <SfButton
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelected(r)
                              }}
                            >
                              Review
                            </SfButton>
                          )}
                        </Td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </SfCard>

        {/* Phase 2 callout */}
        <SfCard>
          <SfCardHeader
            title="Coming soon"
            subtitle="Advanced resolutions land in a future release."
          />
          <div className="flex flex-wrap gap-2">
            <SfButton variant="secondary" size="md" disabled>
              Merge records · coming soon
            </SfButton>
            <SfButton variant="secondary" size="md" disabled>
              Change owner · coming soon
            </SfButton>
          </div>
          <p className="text-[11.5px] text-[var(--sf-ink-3)] mt-2">
            Merge and change-owner actions require FK propagation across jobs, communications, and ledger entries.
            They will land in Phase 2 after operator review of edge cases.
          </p>
        </SfCard>
      </div>

      {/* Drawer + modal */}
      <DetailDrawer
        open={!!selected && !resolveAction}
        conflict={selected}
        onClose={() => setSelected(null)}
        onResolve={(c, action) => setResolveAction(action)}
      />
      <ResolveModal
        open={!!resolveAction}
        action={resolveAction}
        conflict={selected}
        onClose={() => setResolveAction(null)}
        onConfirm={handleResolve}
        submitting={submitting}
      />

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.kind === "err" ? "var(--sf-red-dark)" : "var(--sf-ink)",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            boxShadow: "0 10px 24px rgba(15,23,42,0.3)",
            fontSize: 13,
            fontWeight: 600,
            zIndex: 60,
            fontFamily: "var(--sf-font-ui)",
          }}
        >
          {toast.text}
        </div>
      )}
    </SettingsRailLayout>
  )
}

// ── tiny table cells ──────────────────────────────────────────────

const Th = ({ children, style }) => (
  <th
    style={{
      textAlign: "left",
      padding: "8px 12px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".04em",
      textTransform: "uppercase",
      color: "var(--sf-ink-3)",
      ...style,
    }}
  >
    {children}
  </th>
)

const Td = ({ children, colSpan, style }) => (
  <td colSpan={colSpan} style={{ padding: "10px 12px", verticalAlign: "middle", ...style }}>
    {children}
  </td>
)

export default IdentityConflictsPage
