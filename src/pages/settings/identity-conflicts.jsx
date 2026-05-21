"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Filter,
  GitMerge,
  Layers,
  Link2,
  RefreshCw,
  Sparkles,
  Trash2,
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

const DELETE_SUPPORTED = new Set(["customer", "team_member", "lead"])
const COMBINE_SUPPORTED = new Set(["customer", "lead"])

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

const DetailDrawer = ({ open, conflict, onClose, onResolve, onDeleteOwner, onCombine, onLinkLeadToCustomer, deletingKey }) => {
  if (!open || !conflict) return null
  const sev = SEVERITY_STYLES[conflict.severity] || SEVERITY_STYLES.same_role_duplicate
  const stat = STATUS_STYLES[conflict.status] || STATUS_STYLES.open
  const owners = Array.isArray(conflict.owners) ? conflict.owners : []
  // Combine is only meaningful when there are ≥2 owners of the same
  // combinable type (customer or lead).
  const combineEligibleTypes = Array.from(
    owners.reduce((acc, o) => {
      if (COMBINE_SUPPORTED.has(o.entity_type)) {
        acc.set(o.entity_type, (acc.get(o.entity_type) || 0) + 1)
      }
      return acc
    }, new Map())
  ).filter(([, count]) => count >= 2)
  const canCombine = combineEligibleTypes.length > 0
  // Lead → Customer link is offered when the conflict has exactly one
  // lead and one customer (the most common reconciliation pattern).
  const customerCount = owners.filter((o) => o.entity_type === "customer").length
  const leadCount = owners.filter((o) => o.entity_type === "lead").length
  const canLinkLeadToCustomer = customerCount === 1 && leadCount === 1
  const linkCustomer = canLinkLeadToCustomer ? owners.find((o) => o.entity_type === "customer") : null
  const linkLead = canLinkLeadToCustomer ? owners.find((o) => o.entity_type === "lead") : null
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

                    {/* Action row per owner: Open record + Delete */}
                    {!o.missing && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        {detailHref && (
                          <a
                            href={detailHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11.5px] font-semibold underline"
                            style={{ color: "var(--sf-blue-dark)" }}
                          >
                            Open record →
                          </a>
                        )}
                        {DELETE_SUPPORTED.has(o.entity_type) && conflict.status === "open" && (
                          <SfButton
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            disabled={deletingKey === `${o.entity_type}:${o.entity_id}`}
                            onClick={() => onDeleteOwner(o)}
                          >
                            {deletingKey === `${o.entity_type}:${o.entity_id}` ? "Deleting…" : "Delete this record"}
                          </SfButton>
                        )}
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
            <>
              <SfCard>
                <SfCardHeader title="How to resolve this" />
                <ol
                  className="text-[12px] text-[var(--sf-ink-2)] leading-relaxed pl-4"
                  style={{ listStyle: "decimal" }}
                >
                  {canLinkLeadToCustomer && (
                    <li className="mb-1.5">
                      <strong>Link lead → customer</strong> — this conflict is a lead that converted to a
                      customer (same person, lifecycle artifact). Click <em>Link lead → customer</em> below to
                      set <code style={{ fontFamily: "var(--sf-font-mono)" }}>leads.converted_customer_id</code>{" "}
                      and preserve the funnel analytics. The lead stays, the conflict auto-resolves.
                    </li>
                  )}
                  <li className="mb-1.5">
                    <strong>Delete a record</strong> — click the red trash button on any owner card to remove
                    that source row entirely. The conflict auto-resolves when only one owner remains. Use this
                    for test data or genuine duplicates with no useful history.
                  </li>
                  <li className="mb-1.5">
                    <strong>Combine</strong> — merge same-type duplicates (customer↔customer or lead↔lead) into
                    a single canonical record. All jobs, invoices, properties, etc. re-point to the primary; the
                    secondaries are deleted. Available below when ≥ 2 customers or leads are present.
                  </li>
                  <li>
                    <strong>Keep separate</strong> — distinct people sharing a phone (household, shared work
                    line, or multi-role testing). This consents to the collision and <strong>unblocks SMS</strong>{" "}
                    to this phone.
                  </li>
                </ol>
              </SfCard>

              <div className="flex items-center gap-2 flex-wrap">
                {canLinkLeadToCustomer && (
                  <SfButton
                    variant="primary"
                    size="md"
                    icon={Link2}
                    onClick={() => onLinkLeadToCustomer({ lead: linkLead, customer: linkCustomer })}
                  >
                    Link lead → customer
                  </SfButton>
                )}
                <SfButton
                  variant={canLinkLeadToCustomer ? "secondary" : "primary"}
                  size="md"
                  onClick={() => onResolve(conflict, "keep_separate")}
                  icon={CheckCircle2}
                >
                  Keep separate
                </SfButton>
                {canCombine ? (
                  <SfButton variant="secondary" size="md" onClick={onCombine} icon={GitMerge}>
                    Combine{" "}
                    {combineEligibleTypes
                      .map(([type, count]) => `${count} ${ENTITY_TYPE_LABEL[type] || type}s`)
                      .join(" or ")}
                  </SfButton>
                ) : !canLinkLeadToCustomer ? (
                  <SfButton
                    variant="secondary"
                    size="md"
                    icon={GitMerge}
                    disabled
                    title="Combine requires ≥ 2 owners of the same role (customer or lead). Use Delete or Keep separate."
                  >
                    Combine — not available
                  </SfButton>
                ) : null}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

// ── Resolve modal ──────────────────────────────────────────────────

const KeepSeparateModal = ({ open, conflict, onClose, onConfirm, submitting }) => {
  const [note, setNote] = useState("")
  useEffect(() => { if (open) setNote("") }, [open])
  if (!open || !conflict) return null
  return (
    <ModalShell title="Keep separate" onClose={onClose}>
      <p className="text-[12.5px] text-[var(--sf-ink-2)] leading-relaxed">
        Mark this collision as <strong>intentional</strong>. By confirming, you're stating these owners are
        expected to share a phone — for example multi-role testing on a single device.
      </p>
      <div
        className="mt-3 rounded-md p-2.5 text-[11.5px]"
        style={{
          background: "var(--sf-green-soft)",
          border: "1px solid var(--sf-green-dark)",
          color: "var(--sf-green-dark)",
        }}
      >
        <strong>This will unblock SMS</strong> to this phone. Subsequent customer-facing or cleaner-facing sends
        will go through with a{" "}
        <code style={{ fontFamily: "var(--sf-font-mono)", fontSize: 11 }}>[RecipientIntegrityBypass]</code>{" "}
        audit log entry. If owner data changes later, a new conflict will reappear.
      </div>
      <label className="block mt-3 text-[11.5px] font-semibold text-[var(--sf-ink-2)]">Note (optional)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add context for the audit trail"
        rows={3}
        maxLength={1000}
        className="w-full mt-1 rounded-md border bg-[var(--sf-panel)] text-[12.5px] px-2.5 py-2 outline-none"
        style={{ borderColor: "var(--sf-border-2)", color: "var(--sf-ink)", fontFamily: "var(--sf-font-ui)" }}
      />
      <ModalActions onClose={onClose} submitting={submitting} submitLabel="Keep separate" onSubmit={() => onConfirm(note)} />
    </ModalShell>
  )
}

const DeleteOwnerModal = ({ open, conflict, owner, onClose, onConfirm, submitting }) => {
  if (!open || !conflict || !owner) return null
  const ownerLabel = `${ENTITY_TYPE_LABEL[owner.entity_type] || owner.entity_type} #${owner.entity_id} (${owner.name || "unnamed"})`
  return (
    <ModalShell title="Delete this record?" onClose={onClose}>
      <p className="text-[12.5px] text-[var(--sf-ink-2)] leading-relaxed">
        Permanently delete <strong>{ownerLabel}</strong>. This removes the source row from the database and
        archives the registry entry. If this is the only remaining duplicate, the conflict auto-resolves.
      </p>
      <div
        className="mt-3 rounded-md p-2.5 text-[11.5px]"
        style={{
          background: "var(--sf-red-soft)",
          border: "1px solid var(--sf-red-dark)",
          color: "var(--sf-red-dark)",
        }}
      >
        <strong>This cannot be undone.</strong> If the record has dependent rows (jobs, invoices, transactions),
        the database will refuse the delete and you'll see the foreign-key error — in that case, use{" "}
        <strong>Combine</strong> instead, or reassign the dependent rows first.
      </div>
      <ModalActions
        onClose={onClose}
        submitting={submitting}
        submitLabel={`Delete ${ENTITY_TYPE_LABEL[owner.entity_type] || owner.entity_type}`}
        submitVariant="danger"
        onSubmit={onConfirm}
      />
    </ModalShell>
  )
}

const LinkLeadModal = ({ open, conflict, target, onClose, onConfirm, submitting }) => {
  if (!open || !conflict || !target || !target.lead || !target.customer) return null
  return (
    <ModalShell title="Link lead → customer" onClose={onClose}>
      <p className="text-[12.5px] text-[var(--sf-ink-2)] leading-relaxed">
        Mark <strong>Lead #{target.lead.entity_id} ({target.lead.name || "—"})</strong> as converted to{" "}
        <strong>Customer #{target.customer.entity_id} ({target.customer.name || "—"})</strong>.
      </p>
      <div
        className="mt-3 rounded-md p-2.5 text-[11.5px]"
        style={{
          background: "var(--sf-blue-soft)",
          border: "1px solid var(--sf-blue-dark)",
          color: "var(--sf-blue-dark)",
        }}
      >
        Sets <code style={{ fontFamily: "var(--sf-font-mono)" }}>leads.converted_customer_id = {target.customer.entity_id}</code>.
        The lead row remains — funnel analytics are preserved. The conflict auto-resolves.
      </div>
      <ModalActions
        onClose={onClose}
        submitting={submitting}
        submitLabel="Confirm link"
        onSubmit={onConfirm}
      />
    </ModalShell>
  )
}

const CombineModal = ({ open, conflict, onClose, onConfirm, submitting }) => {
  const owners = conflict && Array.isArray(conflict.owners) ? conflict.owners : []
  // Group combinable owners by type so the operator picks within one role.
  const customerOwners = owners.filter((o) => o.entity_type === "customer")
  const leadOwners = owners.filter((o) => o.entity_type === "lead")
  const initialType = customerOwners.length >= 2 ? "customer" : leadOwners.length >= 2 ? "lead" : null

  const [type, setType] = useState(initialType)
  const [primaryId, setPrimaryId] = useState(null)
  useEffect(() => {
    if (open) {
      setType(initialType)
      setPrimaryId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !conflict) return null

  const pool = type === "customer" ? customerOwners : type === "lead" ? leadOwners : []
  const primary = pool.find((o) => String(o.entity_id) === String(primaryId)) || null
  const secondaries = pool.filter((o) => String(o.entity_id) !== String(primaryId))

  return (
    <ModalShell title="Combine duplicate records" onClose={onClose} width={520}>
      <p className="text-[12.5px] text-[var(--sf-ink-2)] leading-relaxed">
        Pick one record to keep. All matching {type === "lead" ? "leads" : "customers"} are merged into the
        primary — their jobs, invoices, properties, files, and history all re-point to the primary. The
        secondaries are deleted afterwards.
      </p>

      {customerOwners.length >= 2 && leadOwners.length >= 2 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[var(--sf-ink-2)]">Combine:</span>
          <button
            onClick={() => { setType("customer"); setPrimaryId(null) }}
            style={typeChip(type === "customer")}
          >
            Customers ({customerOwners.length})
          </button>
          <button
            onClick={() => { setType("lead"); setPrimaryId(null) }}
            style={typeChip(type === "lead")}
          >
            Leads ({leadOwners.length})
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold text-[var(--sf-ink-2)]">Keep this record (primary):</span>
        {pool.map((o) => (
          <label
            key={`${o.entity_type}:${o.entity_id}`}
            className="flex items-start gap-2 rounded-md p-2 cursor-pointer"
            style={{
              border: `1px solid ${String(primaryId) === String(o.entity_id) ? "var(--sf-blue)" : "var(--sf-border-2)"}`,
              background: String(primaryId) === String(o.entity_id) ? "var(--sf-blue-soft)" : "var(--sf-panel)",
            }}
          >
            <input
              type="radio"
              name="combine-primary"
              checked={String(primaryId) === String(o.entity_id)}
              onChange={() => setPrimaryId(o.entity_id)}
              style={{ marginTop: 2, accentColor: "var(--sf-blue)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
                {o.name || `${ENTITY_TYPE_LABEL[o.entity_type]} #${o.entity_id}`}
              </div>
              <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5">
                <span style={{ fontFamily: "var(--sf-font-mono)" }}>#{o.entity_id}</span>
                {o.phone ? <> · {formatPhone(o.phone)}</> : null}
                {o.email ? <> · {o.email}</> : null}
                {o.external_source ? (
                  <> · From {EXTERNAL_SOURCE_STYLES[o.external_source]?.label || o.external_source}</>
                ) : null}
              </div>
            </div>
          </label>
        ))}
      </div>

      {primary && secondaries.length > 0 && (
        <div
          className="mt-3 rounded-md p-2.5 text-[11.5px]"
          style={{
            background: "var(--sf-amber-soft, #FEF3C7)",
            border: "1px solid var(--sf-amber-dark, #B45309)",
            color: "var(--sf-amber-dark, #B45309)",
          }}
        >
          About to merge <strong>{secondaries.length} {type === "lead" ? "lead(s)" : "customer(s)"}</strong> into{" "}
          <strong>#{primary.entity_id}</strong>:{" "}
          {secondaries.map((s) => `#${s.entity_id}`).join(", ")}. This cannot be undone.
        </div>
      )}

      <ModalActions
        onClose={onClose}
        submitting={submitting}
        submitLabel={
          submitting
            ? "Combining…"
            : primary && secondaries.length > 0
            ? `Combine ${secondaries.length} into #${primary.entity_id}`
            : "Combine"
        }
        submitDisabled={!primary || secondaries.length === 0}
        onSubmit={() => onConfirm({ primary, secondaries })}
      />
    </ModalShell>
  )
}

const typeChip = (active) => ({
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${active ? "var(--sf-blue)" : "var(--sf-border-2)"}`,
  background: active ? "var(--sf-blue-soft)" : "var(--sf-panel)",
  color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "var(--sf-font-ui)",
})

// ── Generic modal shell + action footer ────────────────────────────

const ModalShell = ({ title, onClose, children, width = 420 }) => (
  <>
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 50 }}
    />
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(${width}px, 92vw)`,
        background: "var(--sf-panel)",
        borderRadius: 12,
        zIndex: 51,
        boxShadow: "0 24px 64px rgba(15,23,42,0.25)",
        overflow: "hidden",
        fontFamily: "var(--sf-font-ui)",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--sf-border-soft)" }}>
        <div className="text-[14px] font-semibold text-[var(--sf-ink)]">{title}</div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded hover:bg-[var(--sf-panel-soft)]"
          style={{ border: "none", background: "transparent", cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-3" style={{ overflowY: "auto" }}>{children}</div>
    </div>
  </>
)

const ModalActions = ({ onClose, submitting, submitLabel, submitVariant = "primary", submitDisabled, onSubmit }) => (
  <div className="px-4 py-3 border-t flex items-center justify-end gap-2 mt-3 -mx-4 -mb-3" style={{ borderColor: "var(--sf-border-soft)" }}>
    <SfButton variant="ghost" size="md" onClick={onClose}>
      Cancel
    </SfButton>
    <SfButton
      variant={submitVariant}
      size="md"
      onClick={onSubmit}
      disabled={submitting || submitDisabled}
    >
      {submitting ? "Working…" : submitLabel}
    </SfButton>
  </div>
)

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
  const [keepSeparateOpen, setKeepSeparateOpen] = useState(false)
  const [combineOpen, setCombineOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // owner being deleted (modal trigger)
  const [linkTarget, setLinkTarget] = useState(null)     // {lead, customer} for link-lead modal
  const [deletingKey, setDeletingKey] = useState(null)   // 'entity_type:entity_id' while in flight
  const [submitting, setSubmitting] = useState(false)
  const [repairing, setRepairing] = useState(false)
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

  const handleKeepSeparate = useCallback(
    async (note) => {
      if (!selected) return
      setSubmitting(true)
      try {
        await api.post(`/identity-conflicts/${selected.id}/resolve`, {
          action: "keep_separate",
          note: note || undefined,
        })
        setKeepSeparateOpen(false)
        setSelected(null)
        setRefreshKey((k) => k + 1)
        flash("Conflict resolved — SMS to this phone is now allowed.")
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

  const handleDeleteOwner = useCallback(
    async () => {
      if (!selected || !deleteTarget) return
      const key = `${deleteTarget.entity_type}:${deleteTarget.entity_id}`
      setDeletingKey(key)
      setSubmitting(true)
      try {
        await api.post(`/identity-conflicts/${selected.id}/delete-owner`, {
          entity_type: deleteTarget.entity_type,
          entity_id: deleteTarget.entity_id,
        })
        flash(`Deleted ${ENTITY_TYPE_LABEL[deleteTarget.entity_type] || deleteTarget.entity_type} #${deleteTarget.entity_id}.`)
        setDeleteTarget(null)
        // Refresh the open conflict so the deleted owner disappears.
        try {
          const res = await api.get(`/identity-conflicts/${selected.id}`)
          if (res.data?.conflict) {
            setSelected(res.data.conflict)
          } else {
            // Conflict was auto-resolved → close the drawer
            setSelected(null)
          }
        } catch {
          setSelected(null)
        }
        setRefreshKey((k) => k + 1)
      } catch (err) {
        const e = err?.response?.data || {}
        const msg = e.sourceError
          ? `Cannot delete: ${e.sourceError}`
          : e.error || "Delete failed."
        flash(msg, "err")
        setDeleteTarget(null)
      } finally {
        setSubmitting(false)
        setDeletingKey(null)
      }
    },
    [selected, deleteTarget, flash]
  )

  const handleLinkLeadToCustomer = useCallback(
    async () => {
      if (!selected || !linkTarget || !linkTarget.lead || !linkTarget.customer) return
      setSubmitting(true)
      try {
        await api.post(`/identity-conflicts/${selected.id}/link-lead`, {
          lead_entity_id: linkTarget.lead.entity_id,
          customer_entity_id: linkTarget.customer.entity_id,
        })
        flash(`Linked Lead #${linkTarget.lead.entity_id} → Customer #${linkTarget.customer.entity_id}.`)
        setLinkTarget(null)
        setSelected(null)
        setRefreshKey((k) => k + 1)
      } catch (err) {
        const e = err?.response?.data || {}
        flash(e.error === "lead_already_converted"
          ? `Lead already converted to a different customer (#${e.current}). Open the lead record to investigate.`
          : e.error || "Link failed.", "err")
      } finally {
        setSubmitting(false)
      }
    },
    [selected, linkTarget, flash]
  )

  const handleRepairAll = useCallback(
    async (dryRun) => {
      setRepairing(true)
      try {
        const res = await api.post("/identity-conflicts/repair-lead-links", { dryRun, limit: 200 })
        const d = res.data || {}
        if (dryRun) {
          flash(
            `Dry-run: ${d.total_candidates || 0} lead↔customer conflicts. ${d.high || 0} would auto-link, ${d.medium || 0} pending review, ${d.low || 0} too weak.`
          )
        } else {
          flash(
            `Repair applied: ${d.linked || 0} of ${d.total_candidates || 0} conflicts linked. ${d.medium || 0} pending review.`
          )
          setRefreshKey((k) => k + 1)
        }
      } catch (err) {
        flash(err?.response?.data?.error || "Repair failed.", "err")
      } finally {
        setRepairing(false)
      }
    },
    [flash]
  )

  const handleCombine = useCallback(
    async ({ primary, secondaries }) => {
      if (!selected || !primary || !secondaries || secondaries.length === 0) return
      setSubmitting(true)
      try {
        await api.post(`/identity-conflicts/${selected.id}/combine`, { primary, secondaries })
        setCombineOpen(false)
        setSelected(null)
        setRefreshKey((k) => k + 1)
        flash(`Combined ${secondaries.length} record(s) into #${primary.entity_id}.`)
      } catch (err) {
        const e = err?.response?.data || {}
        const msg = e.sourceError
          ? `Combine failed: ${e.sourceError}`
          : e.error || "Combine failed."
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
        <div className="flex items-center gap-2 flex-wrap">
          <SfButton
            variant="secondary"
            size="md"
            icon={Sparkles}
            disabled={repairing}
            onClick={() => handleRepairAll(true)}
            title="Preview which open lead↔customer conflicts the auto-linker would resolve. No data changes."
          >
            {repairing ? "Scanning…" : "Auto-link: dry run"}
          </SfButton>
          <SfButton
            variant="primary"
            size="md"
            icon={Link2}
            disabled={repairing}
            onClick={() => {
              if (!window.confirm("Apply auto-linker to all open lead↔customer conflicts. HIGH-confidence matches will be linked atomically. Proceed?")) return
              handleRepairAll(false)
            }}
            title="Apply the auto-linker: HIGH-confidence lead↔customer matches set leads.converted_customer_id and resolve the conflict. Lower-confidence matches stay open for manual review."
          >
            {repairing ? "Linking…" : "Auto-link: apply"}
          </SfButton>
          <SfButton variant="ghost" size="md" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </SfButton>
        </div>
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

        {/* Available actions cheat-sheet */}
        <SfCard>
          <SfCardHeader
            title="What you can do"
            subtitle="Quick reference for the actions available in each conflict drawer."
          />
          <ul className="text-[12px] text-[var(--sf-ink-2)] leading-relaxed pl-4" style={{ listStyle: "disc" }}>
            <li className="mb-1">
              <strong>Delete</strong> — red button on each owner card. Removes that source row entirely.
              The conflict auto-resolves when down to 1 owner.
            </li>
            <li className="mb-1">
              <strong>Combine</strong> — merge ≥ 2 customers (or ≥ 2 leads) into a single primary. All jobs,
              invoices, properties re-point to the primary; secondaries are deleted. Team-member combine
              is not supported (the ledger is immutable).
            </li>
            <li>
              <strong>Keep separate</strong> — consent to the collision. Unblocks SMS to this phone.
            </li>
          </ul>
        </SfCard>
      </div>

      {/* Drawer + modals */}
      <DetailDrawer
        open={!!selected && !keepSeparateOpen && !combineOpen && !deleteTarget && !linkTarget}
        conflict={selected}
        onClose={() => setSelected(null)}
        onResolve={(_c, action) => {
          if (action === "keep_separate") setKeepSeparateOpen(true)
        }}
        onDeleteOwner={(owner) => setDeleteTarget(owner)}
        onCombine={() => setCombineOpen(true)}
        onLinkLeadToCustomer={(pair) => setLinkTarget(pair)}
        deletingKey={deletingKey}
      />
      <LinkLeadModal
        open={!!linkTarget}
        conflict={selected}
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onConfirm={handleLinkLeadToCustomer}
        submitting={submitting}
      />
      <KeepSeparateModal
        open={keepSeparateOpen}
        conflict={selected}
        onClose={() => setKeepSeparateOpen(false)}
        onConfirm={handleKeepSeparate}
        submitting={submitting}
      />
      <DeleteOwnerModal
        open={!!deleteTarget}
        conflict={selected}
        owner={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteOwner}
        submitting={submitting}
      />
      <CombineModal
        open={combineOpen}
        conflict={selected}
        onClose={() => setCombineOpen(false)}
        onConfirm={handleCombine}
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
