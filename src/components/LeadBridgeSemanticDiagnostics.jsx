"use client"

/**
 * LeadBridge Semantic Diagnostics — Phase 1.5 read-only UI.
 *
 * Two panels:
 *   1. SemanticSummary — tenant-wide counts framed by the two-domain model.
 *   2. SemanticInspector — per-entity lookup (job/lead/customer → classification).
 *
 * Visual vocabulary (operator-facing):
 *   "standalone operational work"      (SF/ZB owns it, no LB linkage)
 *   "LB-attributed work"               (acquisition came via LB)
 *   "marketplace-only lead"            (LB has it; SF/ZB doesn't — that's fine)
 *   "informational difference"         (cross-domain, not a failure)
 *   "operationally linked"             (lead reached Won + job exists)
 *   "acquisition-linked"               (customer has acquisition_*)
 *
 * Avoided vocabulary unless true_error: "drift", "gap", "failed sync",
 * "missing job", "broken attribution".
 *
 * READ-ONLY: only calls GET endpoints. Never enqueues, never mutates.
 */

import { useEffect, useState, useCallback } from "react"
import { leadbridgeAPI } from "../services/api"
import {
  Activity, Briefcase, UserCheck, Compass, Inbox, Layers,
  AlertTriangle, CheckCircle2, Search, Loader2, ChevronDown, ChevronRight, RefreshCw, Info
} from "lucide-react"

// ──────────────────────────────────────────────────────────────────
// Vocabulary maps — classification → human-readable label + tone
// ──────────────────────────────────────────────────────────────────
const CLASSIFICATION_LABELS = {
  standalone_sf_work: {
    label: "Standalone operational work",
    description: "SF/ZB owns this work. No LeadBridge acquisition linkage. This is normal — most jobs in a healthy CRM are standalone.",
    tone: "neutral",
  },
  lb_attributed_work: {
    label: "LB-attributed work",
    description: "Originated as a LeadBridge lead and converted into operational SF/ZB work. The acquisition chain is intact.",
    tone: "positive",
  },
  lb_attributed_customers: {
    label: "LB-attributed customers",
    description: "Customers whose first acquisition was through LeadBridge (Thumbtack/Yelp).",
    tone: "positive",
  },
  unconverted_lead: {
    label: "Unconverted LB lead",
    description: "LeadBridge lead that didn't reach \"Won\". Normal — not every lead converts. This is acquisition-pipeline data, not a sync failure.",
    tone: "neutral",
  },
  sf_lead_only: {
    label: "SF-only lead",
    description: "Lead in the CRM with no LeadBridge linkage. Originated from another channel.",
    tone: "neutral",
  },
  lb_lead_with_conversion: {
    label: "LB lead with conversion",
    description: "LeadBridge lead that became an SF customer. Full acquisition → customer journey recorded.",
    tone: "positive",
  },
  recurring_customer_attribution: {
    label: "Recurring LB-acquired customer",
    description: "Originally acquired via LeadBridge and now in a stable recurring relationship. Operationally valid.",
    tone: "positive",
  },
  true_error: {
    label: "Actual errors",
    description: "Outbound events in DLQ or failed state. These are real synchronization failures that need attention.",
    tone: "negative",
  },
}

const CATEGORY_ICONS = {
  standalone_sf_work: Briefcase,
  lb_attributed_work: UserCheck,
  lb_attributed_customers: UserCheck,
  unconverted_lead: Inbox,
  sf_lead_only: Layers,
  lb_lead_with_conversion: CheckCircle2,
  recurring_customer_attribution: Activity,
  true_error: AlertTriangle,
}

// Legacy → semantic mapping. Old reports still emit these keys; we show
// them in a de-emphasized "legacy sync terminology" section.
const LEGACY_TERMINOLOGY = [
  {
    legacy: "lifecycle_drift",
    semantic: "informational difference",
    explanation: "An SF status differs from its LB lead status. Not a failure — the two domains track different lifecycles.",
  },
  {
    legacy: "no_matching_customer",
    semantic: "unconverted LB lead / marketplace-only lead",
    explanation: "An LB lead exists with no matching SF customer. Normal — the lead didn't convert into business.",
  },
  {
    legacy: "pipeline_regression",
    semantic: "informational difference (LB ahead of SF)",
    explanation: "LB shows the lead more advanced than SF. Often means LB auto-closed an inactive lead. Not pushable, not a problem.",
  },
  {
    legacy: "sf_status_not_mappable",
    semantic: "not applicable to LB",
    explanation: "An SF status has no LB equivalent (e.g. SF future-scheduled). LB isn't involved in operational scheduling.",
  },
  {
    legacy: "missing_job",
    semantic: "no operational conversion",
    explanation: "A lead exists without an operational job. Common — leads that didn't book.",
  },
]

// ──────────────────────────────────────────────────────────────────
// Small UI primitives
// ──────────────────────────────────────────────────────────────────
function Stat({ label, value, sublabel, Icon, tone = "neutral", description }) {
  const toneClasses = {
    positive: "bg-emerald-50 text-emerald-700 border-emerald-100",
    neutral: "bg-slate-50 text-slate-700 border-slate-200",
    negative: "bg-rose-50 text-rose-700 border-rose-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
  }[tone]
  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`} title={description || ""}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 opacity-60" />}
      </div>
      <div className="text-xl font-semibold tabular-nums">{value == null ? "—" : value.toLocaleString()}</div>
      {sublabel && <div className="text-[11px] mt-0.5 opacity-70">{sublabel}</div>}
    </div>
  )
}

function ClassificationCard({ classKey, count }) {
  const meta = CLASSIFICATION_LABELS[classKey] || { label: classKey, description: "", tone: "neutral" }
  const Icon = CATEGORY_ICONS[classKey] || Briefcase
  return (
    <Stat
      label={meta.label}
      value={count}
      sublabel={meta.tone === "positive" ? "Healthy" : meta.tone === "negative" ? "Needs attention" : "Normal"}
      Icon={Icon}
      tone={meta.tone}
      description={meta.description}
    />
  )
}

function HealthBanner({ trueError, totalJobs, lbAttributed }) {
  const healthy = (trueError || 0) === 0
  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${
      healthy ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
    }`}>
      {healthy ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-none" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 flex-none" />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${healthy ? "text-emerald-800" : "text-rose-800"}`}>
          {healthy ? "Integration healthy" : `${trueError} actual error(s) — needs attention`}
        </div>
        <p className={`text-xs mt-0.5 ${healthy ? "text-emerald-700" : "text-rose-700"}`}>
          {healthy
            ? `${totalJobs?.toLocaleString() ?? "—"} total jobs · ${lbAttributed?.toLocaleString() ?? "—"} LB-attributed · 0 events in DLQ/failed. Cross-domain differences below are normal.`
            : "Outbound events in DLQ or failed state. Investigate via the events log."}
        </p>
      </div>
    </div>
  )
}

function ModelCard() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 flex items-start gap-2">
      <Compass className="w-4 h-4 text-slate-500 mt-0.5 flex-none" />
      <div className="flex-1">
        <div className="font-semibold mb-1">Two-domain model</div>
        <p className="opacity-80">
          <span className="font-medium">LeadBridge</span> owns acquisition + conversation (Thumbtack/Yelp leads).{" "}
          <span className="font-medium">ServiceFlow/ZB</span> owns operational work (jobs, payment, payroll).{" "}
          Attribution is an <span className="italic">optional</span> bridge, not a required synchronization.
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// SemanticSummary panel
// ──────────────────────────────────────────────────────────────────
function SemanticSummary() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showLegacy, setShowLegacy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await leadbridgeAPI.getSemanticSummary()
      setData(result)
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading semantic summary…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Could not load semantic summary: {error}
      </div>
    )
  }
  if (!data) return null

  const c = data.counts || {}
  const k = data.classifications || {}

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">LeadBridge integration diagnostics</h3>
          <p className="text-xs text-[var(--sf-text-muted)]">Read-only view of attribution + operational state.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          title="Refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <ModelCard />

      <HealthBanner trueError={k.true_error} totalJobs={c.sf_jobs_total} lbAttributed={c.sf_jobs_lb_attributed} />

      {/* Operational classifications */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wide mb-2">Operational lifecycle</h4>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <ClassificationCard classKey="standalone_sf_work" count={k.standalone_sf_work} />
          <ClassificationCard classKey="lb_attributed_work" count={k.lb_attributed_work} />
          <ClassificationCard classKey="lb_attributed_customers" count={k.lb_attributed_customers} />
        </div>
      </div>

      {/* Acquisition / lead classifications */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wide mb-2">Acquisition + conversation</h4>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <ClassificationCard classKey="unconverted_lead" count={k.unconverted_lead} />
          <ClassificationCard classKey="sf_lead_only" count={k.sf_lead_only} />
          <ClassificationCard classKey="lb_lead_with_conversion" count={k.lb_lead_with_conversion} />
        </div>
      </div>

      {/* Errors (only meaningful if non-zero) */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wide mb-2">Errors</h4>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <ClassificationCard classKey="true_error" count={k.true_error} />
          <Stat label="Outbound DLQ" value={c.outbound_queue_dlq} tone={c.outbound_queue_dlq > 0 ? "negative" : "neutral"} Icon={AlertTriangle} description="Events that exhausted retries." />
          <Stat label="Outbound failed" value={c.outbound_queue_failed} tone={c.outbound_queue_failed > 0 ? "negative" : "neutral"} Icon={AlertTriangle} description="Events that failed delivery (not yet DLQ)." />
        </div>
      </div>

      {/* Cross-domain note */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 flex-none" />
        <div>
          <span className="font-semibold">Cross-domain differences</span> (SF/LB statuses that don't match) are computed by running a sync. They're not sync failures — they're informational. Look for the{" "}
          <code className="font-mono bg-white/60 px-1 rounded">cross_domain_difference</code> and{" "}
          <code className="font-mono bg-white/60 px-1 rounded">not_applicable_to_lb</code> counts in the sync result.
        </div>
      </div>

      {/* Legacy terminology (collapsed) */}
      <div className="rounded-lg border border-slate-200 bg-slate-50">
        <button onClick={() => setShowLegacy(!showLegacy)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          <span className="flex items-center gap-2">
            {showLegacy ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Legacy sync terminology (deprecated — kept for backwards compatibility)
          </span>
        </button>
        {showLegacy && (
          <div className="px-3 pb-3 space-y-2">
            {LEGACY_TERMINOLOGY.map(item => (
              <div key={item.legacy} className="bg-white rounded border border-slate-200 p-2.5 text-xs">
                <div className="flex items-baseline gap-2 mb-1">
                  <code className="font-mono text-slate-400 line-through">{item.legacy}</code>
                  <span className="text-slate-300">→</span>
                  <span className="font-semibold text-slate-700">{item.semantic}</span>
                </div>
                <p className="text-slate-500">{item.explanation}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// SemanticInspector panel — per-entity lookup
// ──────────────────────────────────────────────────────────────────
function SemanticInspector() {
  const [type, setType] = useState("job")
  const [id, setId] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const inspect = async (e) => {
    if (e) e.preventDefault()
    if (!id) { setError("Enter an ID"); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const data = await leadbridgeAPI.getEntitySemanticState(type, id)
      setResult(data)
    } catch (e) {
      if (e.response?.status === 404) {
        setError(`${type} ${id} not found in your account`)
      } else {
        setError(e.response?.data?.error || e.message || "Failed to load")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Inspect a specific entity</h3>
        <p className="text-xs text-[var(--sf-text-muted)]">Look up a single job, lead, or customer to see its classification + attribution state.</p>
      </div>

      <form onSubmit={inspect} className="flex items-end gap-2">
        <div className="flex-none">
          <label className="block text-[11px] font-medium text-[var(--sf-text-muted)] mb-1">Entity</label>
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="w-28 px-2.5 py-1.5 rounded-md border border-slate-300 text-sm bg-white">
            <option value="job">Job</option>
            <option value="lead">Lead</option>
            <option value="customer">Customer</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[11px] font-medium text-[var(--sf-text-muted)] mb-1">ID</label>
          <input value={id} onChange={(e) => setId(e.target.value)} type="number" min="1"
            placeholder="e.g. 141339"
            className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 text-sm" />
        </div>
        <button type="submit" disabled={loading || !id}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--sf-blue-500)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Inspect
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      {result && <InspectorResult result={result} />}
    </div>
  )
}

function InspectorResult({ result }) {
  const meta = CLASSIFICATION_LABELS[result.classification] || { label: result.classification, description: "", tone: "neutral" }
  const Icon = CATEGORY_ICONS[result.classification] || Briefcase
  const toneBg = {
    positive: "bg-emerald-50 border-emerald-200",
    neutral: "bg-slate-50 border-slate-200",
    negative: "bg-rose-50 border-rose-200",
  }[meta.tone] || "bg-slate-50 border-slate-200"

  return (
    <div className="space-y-3">
      {/* Top classification card */}
      <div className={`rounded-lg border p-3 ${toneBg}`}>
        <div className="flex items-start gap-3">
          <Icon className="w-5 h-5 mt-0.5 flex-none opacity-80" />
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide font-medium opacity-70">
              {result.type} #{result.id}
            </div>
            <div className="text-base font-semibold mt-0.5">{meta.label}</div>
            <p className="text-xs mt-1.5 opacity-80">{result.reason}</p>
            <p className="text-[11px] mt-2 opacity-70 italic">{meta.description}</p>
          </div>
        </div>
      </div>

      {/* Sync decision */}
      <div className={`rounded-lg border p-3 ${result.should_sync_to_lb ? "bg-sky-50 border-sky-200" : "bg-slate-50 border-slate-200"}`}>
        <div className="text-[11px] uppercase tracking-wide font-semibold opacity-70 mb-1">
          Sync to LeadBridge
        </div>
        <div className="text-sm font-medium">
          {result.should_sync_to_lb === true && <span className="text-sky-800">✓ Eligible (operationally linked)</span>}
          {result.should_sync_to_lb === false && <span className="text-slate-700">— Not pushed</span>}
          {result.should_sync_to_lb == null && <span className="text-slate-500">Not applicable to this entity type</span>}
        </div>
        {result.sync_reason && (
          <p className="text-xs mt-1 text-slate-600">{result.sync_reason}</p>
        )}
      </div>

      {/* Tri-panel: SF state · ZB state · LB attribution / Acquisition */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {result.sf_state && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">ServiceFlow state</div>
            <KeyValueList data={result.sf_state} />
          </div>
        )}
        {result.zb_state && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">Zenbooker state</div>
            <KeyValueList data={result.zb_state} />
          </div>
        )}
        {result.lb_attribution && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">LeadBridge attribution</div>
            <KeyValueList data={result.lb_attribution} />
          </div>
        )}
        {result.acquisition_attribution && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">Acquisition</div>
            <KeyValueList data={result.acquisition_attribution} />
          </div>
        )}
        {result.job_rollup && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">Job rollup</div>
            <KeyValueList data={result.job_rollup} />
          </div>
        )}
        {result.operational_link && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">Operational link</div>
            <KeyValueList data={result.operational_link} />
          </div>
        )}
      </div>
    </div>
  )
}

function KeyValueList({ data }) {
  if (!data || typeof data !== "object") return null
  const entries = Object.entries(data)
  if (entries.length === 0) return <div className="text-xs text-slate-400">—</div>
  return (
    <dl className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
          <dt className="text-slate-500 truncate" title={k}>{prettyKey(k)}</dt>
          <dd className="text-slate-800 font-medium text-right break-all">
            {v === null || v === undefined ? <span className="text-slate-300">—</span>
              : typeof v === "boolean" ? (v ? "Yes" : "No")
              : typeof v === "object" ? JSON.stringify(v)
              : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function prettyKey(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// ──────────────────────────────────────────────────────────────────
// Main exported wrapper — both panels stacked
// ──────────────────────────────────────────────────────────────────
export default function LeadBridgeSemanticDiagnostics() {
  return (
    <div className="space-y-6 pt-4 mt-4 border-t border-slate-200">
      <SemanticSummary />
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <SemanticInspector />
      </div>
    </div>
  )
}

export { SemanticSummary, SemanticInspector }
