"use client"

// Lead Detail page — design pack ADDON_lead_detail.md
//
// Wired to existing leadsAPI: getById, getPipeline, getTasks, moveToStage,
// convertToCustomer, update. Tabs for activity/estimates/messages/notes/
// files render graceful empty states until those endpoints land.

import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import {
  ArrowLeft, ChevronRight, Phone, Mail, MapPin, User as UserIcon,
  MessageSquare, FileText, Clipboard, ClipboardCheck, Briefcase,
  Check, CheckCircle2, AlertCircle, RefreshCw, Plus, Edit,
  Target, MoreHorizontal, X, Send, Download, Upload, Calendar,
  Tag, DollarSign, TrendingUp, Clock, Users, Star, Activity,
  Paperclip, ArrowRight,
} from "lucide-react"
import { leadsAPI, teamAPI } from "../services/api"
import { useAuth } from "../context/AuthContext"
import MobileHeader from "../components/mobile-header"
import {
  SfCard, SfCardHeader, SfButton, SfAvatar, sfInitials, SfFilterChip,
} from "../components/sf-primitives"

// ── Tokens ──────────────────────────────────────────────────────────────
const T = {
  ink: "var(--sf-ink)", ink2: "var(--sf-ink-2)", ink3: "var(--sf-ink-3)", ink4: "var(--sf-ink-4, #94a3b8)",
  panel: "var(--sf-panel)", panelSoft: "var(--sf-panel-soft)", panelAlt: "var(--sf-panel-alt, #f8fafc)",
  border: "var(--sf-border)", borderS: "var(--sf-border-soft)",
  blue: "var(--sf-blue)", blueSoft: "var(--sf-blue-soft)", blueDark: "var(--sf-blue-dark)",
  green: "var(--sf-green)", greenSoft: "var(--sf-green-soft)", greenDark: "var(--sf-green-dark)",
  amber: "var(--sf-amber)", amberSoft: "var(--sf-amber-soft)", amberDark: "var(--sf-amber-dark)",
  red: "var(--sf-red)", redSoft: "var(--sf-red-soft)", redDark: "var(--sf-red-dark)",
  purple: "var(--sf-purple, #8b5cf6)", purpleSoft: "var(--sf-purple-soft, #ede9fe)",
  teal: "var(--sf-teal, #14b8a6)", tealSoft: "var(--sf-teal-soft, #ccfbf1)",
}

// ── Helpers ─────────────────────────────────────────────────────────────
const money = (v) => `$${(Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const moneyShort = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
const daysAgo = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
}
const relativeAge = (iso) => {
  const days = daysAgo(iso)
  if (days == null) return "—"
  if (days === 0) {
    const hrs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)))
    if (hrs <= 0) return "just now"
    return `${hrs}h ago`
  }
  if (days === 1) return "1 day ago"
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
const fmtPhone = (p) => {
  if (!p) return null
  const d = String(p).replace(/\D/g, "")
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11) return `+${d[0]} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return p
}
const fullName = (l) => `${l?.first_name || ""} ${l?.last_name || ""}`.trim() || l?.name || l?.email || "Lead"
const cleanedAddress = (l) => {
  const parts = [l?.address, l?.city, l?.state, l?.zip].filter(Boolean)
  return parts.join(", ") || null
}
const probabilityFromStage = (stageName) => {
  if (!stageName) return 0.3
  const n = String(stageName).toLowerCase()
  if (/won/.test(n)) return 1
  if (/lost/.test(n)) return 0
  if (/negoti|propos/.test(n)) return 0.6
  if (/quot/.test(n)) return 0.45
  if (/follow|engag/.test(n)) return 0.4
  if (/contact/.test(n)) return 0.3
  if (/new/.test(n)) return 0.2
  return 0.3
}
const probColor = (p) => (p >= 0.7 ? T.greenDark : p >= 0.4 ? T.amberDark : T.redDark)

// ── Stage progression chevron ───────────────────────────────────────────

const StageProgress = ({ stages, currentStageId, lead, onAdvance, advancing }) => {
  // Map our pipeline stages onto a 5-step happy path; cap to 5 for layout
  const visible = (stages || []).filter((s) => !/lost/i.test(s.name)).slice(0, 5)
  const idx = visible.findIndex((s) => String(s.id) === String(currentStageId))
  const currentIdx = idx === -1 ? 0 : idx
  const isLost = (stages || []).find((s) => String(s.id) === String(currentStageId))?.name?.match(/lost/i)
  const isWon = visible[currentIdx] && /won/i.test(visible[currentIdx].name)
  const nextStage = !isLost && !isWon && visible[currentIdx + 1]

  return (
    <SfCard padding={false}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
        <TrendingUp size={14} color={T.ink2} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Stage progression</div>
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Pipeline flow · this lead</div>
        </div>
        <div style={{ flex: 1 }} />
        {isLost && (
          <span style={{ padding: "3px 9px", borderRadius: 999, background: T.redSoft, color: T.redDark, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
            Lost
          </span>
        )}
        {nextStage && (
          <SfButton variant="primary" size="sm" icon={ArrowRight} onClick={() => onAdvance?.(nextStage)} disabled={advancing}>
            Advance to {nextStage.name}
          </SfButton>
        )}
      </div>
      <div style={{ padding: "20px 18px 22px", display: "flex", alignItems: "flex-start", opacity: isLost ? 0.45 : 1 }}>
        {visible.map((s, i) => {
          const reached = i <= currentIdx
          const isCurrent = i === currentIdx
          const c = s.color || T.blueDark
          return (
            <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                {/* left connector */}
                <div style={{
                  flex: 1, height: 2,
                  background: i === 0 ? "transparent" : (reached ? c : T.borderS),
                }} />
                {/* node */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: isCurrent ? c : reached ? `${c}22` : T.panelAlt,
                  border: isCurrent ? `2px solid ${c}` : reached ? `1px solid ${c}33` : `1px solid ${T.borderS}`,
                  boxShadow: isCurrent ? `0 0 0 4px ${c}22` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isCurrent ? "#fff" : reached ? c : T.ink3,
                  fontSize: 12.5, fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {reached && !isCurrent ? <Check size={14} /> : i + 1}
                </div>
                {/* right connector */}
                <div style={{
                  flex: 1, height: 2,
                  background: i === visible.length - 1 ? "transparent" : (i < currentIdx ? c : T.borderS),
                }} />
              </div>
              <div style={{
                fontSize: 11.5, color: isCurrent ? T.ink : T.ink3,
                fontWeight: isCurrent ? 700 : 500, marginTop: 8,
                textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "100%",
              }}>{s.name}</div>
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Activity meta + row ─────────────────────────────────────────────────

const ACT_META = {
  lead:     { icon: Target,         c: T.amberDark, bg: T.amberSoft },
  call:     { icon: Phone,          c: T.blue,      bg: T.blueSoft },
  msg:      { icon: MessageSquare,  c: T.blue,      bg: T.blueSoft },
  email:    { icon: Mail,           c: T.teal,      bg: T.tealSoft },
  estimate: { icon: Clipboard,      c: T.purple,    bg: T.purpleSoft },
  note:     { icon: Briefcase,      c: T.amberDark, bg: T.amberSoft },
  stage:    { icon: RefreshCw,      c: T.greenDark, bg: T.greenSoft },
  file:     { icon: FileText,       c: T.ink2,      bg: T.panelSoft },
  task:     { icon: CheckCircle2,   c: T.green,     bg: T.greenSoft },
  update:   { icon: Edit,           c: T.ink2,      bg: T.panelSoft },
}

const ActivityRow = ({ act, isLast }) => {
  const meta = ACT_META[act.kind] || ACT_META.update
  const Icon = meta.icon
  return (
    <div style={{ position: "relative", display: "flex", gap: 12, padding: "10px 0" }}>
      {!isLast && (
        <div style={{
          position: "absolute", left: 16, top: 38, bottom: -4,
          width: 2, background: T.borderS,
        }} />
      )}
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: meta.bg, color: meta.c,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1,
      }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            padding: "1px 7px", borderRadius: 999, background: meta.bg, color: meta.c,
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em",
          }}>{act.kind}</span>
          <span style={{ fontSize: 11, color: T.ink3 }}>{act.when}</span>
          {act.amount && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.greenDark, fontVariantNumeric: "tabular-nums" }}>{act.amount}</span>
          )}
        </div>
        <div style={{ fontSize: 13, color: T.ink, marginTop: 4, lineHeight: 1.4 }}>{act.text}</div>
        {act.who && (
          <div style={{ fontSize: 11, color: T.ink3, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <UserIcon size={11} />
            {act.who}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline copyable contact row ─────────────────────────────────────────

const ContactRow = ({ icon: Icon, label, value, sub, href, showToast }) => {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1400)
      showToast?.("Copied to clipboard")
    })
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
      borderBottom: `1px solid ${T.borderS}`,
    }}>
      <Icon size={14} color={T.ink3} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {href ? <a href={href} style={{ color: T.ink, textDecoration: "none" }}>{value}</a> : value}
        </div>
        {sub && <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{sub}</div>}
      </div>
      <button onClick={copy} title="Copy" style={{
        padding: 5, borderRadius: 6, border: `1px solid ${T.borderS}`,
        background: T.panel, color: copied ? T.greenDark : T.ink2, cursor: "pointer",
      }}>
        {copied ? <ClipboardCheck size={12} /> : <Clipboard size={12} />}
      </button>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────

const EmptyState = ({ icon: Icon, title, body, cta, onCta }) => (
  <div style={{
    padding: "40px 24px", textAlign: "center", color: T.ink3,
  }}>
    {Icon && (
      <div style={{
        width: 56, height: 56, borderRadius: 14, margin: "0 auto",
        background: T.panelAlt, color: T.ink3,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={26} strokeWidth={1.5} />
      </div>
    )}
    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink2, marginTop: 12 }}>{title}</div>
    {body && <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 6, maxWidth: 380, marginInline: "auto", lineHeight: 1.5 }}>{body}</div>}
    {cta && (
      <div style={{ marginTop: 14 }}>
        <SfButton variant="primary" size="md" onClick={onCta}>{cta}</SfButton>
      </div>
    )}
  </div>
)

// ════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════

const LeadDetailsPage = () => {
  const { leadId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [lead, setLead] = useState(null)
  const [stages, setStages] = useState([])
  const [tasks, setTasks] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tab, setTab] = useState("overview")
  const [advancing, setAdvancing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [toast, setToast] = useState(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const showToast = (msg, type = "info") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2200)
  }

  const fetchAll = async () => {
    if (!leadId) return
    setLoading(true); setError("")
    try {
      const [leadData, pipelineData, tasksData, teamResp] = await Promise.all([
        leadsAPI.getById(leadId).catch((e) => { throw e }),
        leadsAPI.getPipeline().catch(() => ({ stages: [] })),
        leadsAPI.getTasks(leadId).catch(() => []),
        user?.id ? teamAPI.getAll(user.id, { page: 1, limit: 200 }).catch(() => null) : Promise.resolve(null),
      ])
      // /leads/:id sometimes returns the row directly, sometimes wrapped in `lead`
      setLead(leadData?.lead || leadData)
      setStages(pipelineData?.stages || [])
      setTasks(Array.isArray(tasksData) ? tasksData : [])
      if (teamResp) setTeamMembers(teamResp.teamMembers || teamResp || [])
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to load lead. It may have been deleted.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [leadId, user?.id])

  // Memoized derivations
  const currentStage = useMemo(() => stages.find((s) => String(s.id) === String(lead?.stage_id)) || null, [stages, lead])
  const stageColor = currentStage?.color || T.blueDark
  const isWon = !!currentStage && /win|won/i.test(currentStage.name)
  const isLost = !!currentStage && /lost/i.test(currentStage.name)
  const probability = useMemo(() => probabilityFromStage(currentStage?.name), [currentStage])
  const dealValue = parseFloat(lead?.value) || parseFloat(lead?.estimated_value) || 0
  const ageInPipeline = useMemo(() => daysAgo(lead?.created_at), [lead])
  const ownerMember = useMemo(() => {
    const oid = lead?.assigned_to_user_id || lead?.assigned_to
    if (!oid) return null
    return teamMembers.find((m) => String(m.id) === String(oid)) || null
  }, [teamMembers, lead])

  // Synthesized activity timeline — pulls from real signals on the lead row + tasks
  const activities = useMemo(() => {
    const acts = []
    if (lead?.created_at) {
      acts.push({ kind: "lead", text: `Lead created from ${lead.source || "direct"}`, when: relativeAge(lead.created_at), who: ownerMember ? `${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() : "System" })
    }
    if (lead?.updated_at && lead.updated_at !== lead.created_at) {
      acts.push({ kind: "update", text: `Lead updated`, when: relativeAge(lead.updated_at), who: ownerMember ? `${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() : "System" })
    }
    if (currentStage) {
      acts.push({ kind: "stage", text: `Stage: ${currentStage.name}${isWon ? " · ready to convert" : ""}`, when: relativeAge(lead?.updated_at || lead?.created_at), who: ownerMember ? `${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() : "System" })
    }
    tasks.forEach((t) => {
      acts.push({
        kind: "task",
        text: t.title || t.description || "Task",
        when: relativeAge(t.created_at || t.due_date),
        who: ownerMember ? `${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() : "System",
      })
    })
    return acts.slice(0, 50)
  }, [lead, currentStage, tasks, ownerMember, isWon])

  // Notes — parse the lead.notes field if present (single string for now)
  const notesList = useMemo(() => {
    if (!lead?.notes) return []
    return [{
      id: "lead-note",
      author: "Lead notes",
      created_at: lead.updated_at || lead.created_at,
      body: lead.notes,
    }]
  }, [lead])

  // Actions
  const handleAdvance = async (nextStage) => {
    if (!nextStage || !lead) return
    try {
      setAdvancing(true)
      await leadsAPI.moveToStage(lead.id, nextStage.id)
      showToast(`Moved to ${nextStage.name}`, "success")
      fetchAll()
    } catch (e) {
      showToast(e?.response?.data?.error || "Failed to advance stage", "error")
    } finally { setAdvancing(false) }
  }

  const handleConvert = async () => {
    if (!lead) return
    if (!window.confirm("Convert this lead to a customer? This will close the lead as won.")) return
    try {
      setConverting(true)
      const result = await leadsAPI.convertToCustomer(lead.id)
      const customerId = result?.customer?.id || result?.id
      showToast("Converted to customer", "success")
      if (customerId) navigate(`/customer/${customerId}`)
      else navigate("/customers")
    } catch (e) {
      showToast(e?.response?.data?.error || "Failed to convert", "error")
    } finally { setConverting(false) }
  }

  const handleSaveNote = async () => {
    const next = (lead?.notes ? lead.notes + "\n\n" : "") + noteDraft.trim()
    if (!noteDraft.trim()) return
    try {
      setSavingNote(true)
      await leadsAPI.update(lead.id, { notes: next })
      setNoteDraft("")
      showToast("Note saved", "success")
      fetchAll()
    } catch (e) {
      showToast(e?.response?.data?.error || "Failed to save note", "error")
    } finally { setSavingNote(false) }
  }

  // Loading / error states
  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "var(--sf-bg, #f7f8fa)" }}>
        <MobileHeader pageTitle="Lead" />
        <div style={{ padding: 60, textAlign: "center", color: T.ink3 }}>
          <RefreshCw size={20} className="animate-spin" style={{ display: "inline-block", marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>Loading lead…</div>
        </div>
      </div>
    )
  }
  if (error || !lead) {
    return (
      <div className="min-h-screen" style={{ background: "var(--sf-bg, #f7f8fa)" }}>
        <MobileHeader pageTitle="Lead" />
        <div style={{ padding: 60, textAlign: "center" }}>
          <AlertCircle size={28} color={T.redDark} style={{ display: "inline-block", marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink2 }}>{error || "Lead not found"}</div>
          <div style={{ marginTop: 14 }}>
            <SfButton variant="secondary" size="md" icon={ArrowLeft} onClick={() => navigate("/leads")}>Back to Leads</SfButton>
          </div>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "activity",  label: "Activity",  count: activities.length },
    { id: "tasks",     label: "Tasks",     count: tasks.length },
    { id: "estimates", label: "Estimates" },
    { id: "messages",  label: "Messages" },
    { id: "notes",     label: "Notes",     count: notesList.length },
    { id: "files",     label: "Files" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "var(--sf-bg, #f7f8fa)", fontFamily: "var(--sf-font-ui)" }}>
      <MobileHeader pageTitle={fullName(lead)} />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 80,
          padding: "10px 14px", borderRadius: 8,
          background: toast.type === "error" ? T.redDark : toast.type === "success" ? T.greenDark : T.ink,
          color: "#fff", fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(15,23,42,.18)",
        }}>{toast.msg}</div>
      )}

      {/* Hero header */}
      <div style={{ background: T.panel, borderBottom: `1px solid ${T.borderS}`, padding: "16px 24px 0" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, marginBottom: 14 }}>
          <Link to="/leads" style={{ color: T.ink3, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
            <ArrowLeft size={11} />
            Leads
          </Link>
          <ChevronRight size={11} color={T.ink4} />
          <span style={{ color: T.ink, fontWeight: 600 }}>{fullName(lead)}</span>
          <span style={{
            color: T.ink3, fontFamily: "var(--sf-font-mono, ui-monospace, monospace)", fontSize: 11, marginLeft: 4,
          }}>L-{String(lead.id).slice(-6).padStart(3, "0")}</span>
        </div>

        {/* Hero row */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <SfAvatar initials={sfInitials(fullName(lead))} color={stageColor} size={60} />
            <div style={{
              position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9,
              background: stageColor, border: `2px solid ${T.panel}`,
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: T.ink, letterSpacing: "-0.02em", margin: 0 }}>{fullName(lead)}</h1>
              {currentStage && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, background: `${stageColor}22`, color: stageColor,
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: stageColor }} />
                  {currentStage.name}
                </span>
              )}
              {(lead.priority || "").toLowerCase() === "high" && (
                <span style={{
                  padding: "3px 9px", borderRadius: 999, background: T.redSoft, color: T.redDark,
                  fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em",
                }}>High</span>
              )}
              {lead.source && (
                <span style={{
                  padding: "3px 9px", borderRadius: 999, background: T.panelAlt, color: T.ink2,
                  fontSize: 10.5, fontWeight: 600,
                }}>{lead.source}</span>
              )}
            </div>
            {/* Contact metadata */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14, marginTop: 8, flexWrap: "wrap",
              fontSize: 12.5, color: T.ink2,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <UserIcon size={13} color={T.ink3} /> {fullName(lead)}
              </span>
              {lead.email && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Mail size={13} color={T.ink3} /> {lead.email}
                </span>
              )}
              {lead.phone && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Phone size={13} color={T.ink3} /> {fmtPhone(lead.phone)}
                </span>
              )}
              {cleanedAddress(lead) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <MapPin size={13} color={T.ink3} /> {cleanedAddress(lead)}
                </span>
              )}
            </div>
          </div>
          {/* Action cluster */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {lead.phone && (
              <SfButton variant="secondary" size="md" icon={Phone} onClick={() => window.location.href = `tel:${lead.phone}`}>Call</SfButton>
            )}
            {lead.email && (
              <SfButton variant="secondary" size="md" icon={Mail} onClick={() => window.location.href = `mailto:${lead.email}`}>Email</SfButton>
            )}
            <SfButton variant="secondary" size="md" icon={MessageSquare} onClick={() => navigate("/communications")}>Message</SfButton>
            {!isWon && !isLost && (
              <SfButton variant="primary" size="md" icon={CheckCircle2} onClick={handleConvert} disabled={converting}>
                {converting ? "Converting…" : "Convert to customer"}
              </SfButton>
            )}
          </div>
        </div>

        {/* Inline stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 32, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.borderS}`,
        }}>
          {[
            { label: "Deal value",       value: dealValue > 0 ? money(dealValue) : "—", sub: lead.value ? "estimated" : "not set" },
            { label: "Win probability",  value: `${Math.round(probability * 100)}%`,    sub: "based on stage", color: probColor(probability) },
            { label: "Days in pipeline", value: ageInPipeline != null ? `${ageInPipeline}d` : "—", sub: lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "" },
            { label: "Owner",            value: ownerMember ? `${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() || ownerMember.email : "—", sub: ownerMember ? ownerMember.role : "Unassigned" },
            { label: "Activities",       value: activities.length, sub: `${tasks.length} task${tasks.length === 1 ? "" : "s"}` },
          ].map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink3, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.label}</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: s.color || T.ink, marginTop: 4,
                letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {s.value}
              </div>
              {s.sub && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Tab strip */}
        <div style={{
          display: "flex", alignItems: "center", marginTop: 14,
          borderBottom: `1px solid ${T.borderS}`,
          marginInline: -24, paddingInline: 24,
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                position: "relative", padding: "10px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                color: tab === t.id ? T.ink : T.ink3,
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  padding: "1px 6px", borderRadius: 999,
                  background: tab === t.id ? T.blueSoft : T.panelAlt,
                  color: tab === t.id ? T.blueDark : T.ink3,
                  fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                }}>{t.count}</span>
              )}
              {tab === t.id && (
                <span style={{
                  position: "absolute", left: 8, right: 8, bottom: -1, height: 2,
                  background: T.blue, borderRadius: 1,
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: "18px 24px 32px" }}>
        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2.1fr) minmax(0, 1fr)", gap: 14 }}>
            {/* Left col */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <StageProgress
                stages={stages}
                currentStageId={lead.stage_id}
                lead={lead}
                onAdvance={handleAdvance}
                advancing={advancing}
              />

              {/* Deal summary */}
              <SfCard padding={false}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: T.greenSoft, color: T.greenDark, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <DollarSign size={15} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Deal summary</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Estimated value · service mix</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums" }}>
                      {dealValue > 0 ? money(dealValue) : "—"}
                    </div>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>est. value</div>
                  </div>
                </div>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  borderBottom: `1px solid ${T.borderS}`,
                }}>
                  {[
                    { label: "Property",       value: lead.property || lead.service_type || "—" },
                    { label: "Frequency",      value: lead.frequency || lead.recurrence || "One-time" },
                    { label: "First service",  value: lead.first_service_date ? new Date(lead.first_service_date).toLocaleDateString() : "—" },
                    { label: "Source",         value: lead.source || "Direct" },
                  ].map((c, i) => (
                    <div key={c.label} style={{ padding: "12px 16px", borderRight: i < 3 ? `1px solid ${T.borderS}` : "none" }}>
                      <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{c.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "12px 18px", background: T.panelAlt, display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Win probability</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <div style={{ flex: 1, height: 7, background: T.panelSoft, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${probability * 100}%`, height: "100%", background: probColor(probability), borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: probColor(probability), fontVariantNumeric: "tabular-nums", minWidth: 42, textAlign: "right" }}>
                        {Math.round(probability * 100)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ minWidth: 90 }}>
                    <div style={{ fontSize: 10, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Projected LTV</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.greenDark, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                      {dealValue > 0 ? moneyShort(dealValue * 4) : "—"}
                    </div>
                  </div>
                </div>
              </SfCard>

              {/* Recent activity */}
              <SfCard padding={false}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center" }}>
                  <Activity size={14} color={T.ink2} />
                  <div style={{ marginLeft: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Recent activity</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Latest {Math.min(5, activities.length)} of {activities.length}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {activities.length > 5 && (
                    <SfButton variant="ghost" size="sm" onClick={() => setTab("activity")}>View all</SfButton>
                  )}
                </div>
                <div style={{ padding: "8px 18px" }}>
                  {activities.length === 0 ? (
                    <EmptyState icon={Activity} title="No activity yet" body="Calls, messages, and stage changes will appear here." />
                  ) : (
                    activities.slice(0, 5).map((a, i, arr) => (
                      <ActivityRow key={i} act={a} isLast={i === arr.length - 1} />
                    ))
                  )}
                </div>
              </SfCard>
            </div>

            {/* Right col */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              {/* Contact card */}
              <SfCard padding={false}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <SfAvatar initials={sfInitials(fullName(lead))} color={stageColor} size={38} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{fullName(lead)}</div>
                    <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>Primary contact</div>
                  </div>
                </div>
                <div style={{ padding: "0 18px" }}>
                  <ContactRow icon={Mail}   label="Email"   value={lead.email}              href={lead.email ? `mailto:${lead.email}` : null} showToast={showToast} />
                  <ContactRow icon={Phone}  label="Phone"   value={lead.phone ? fmtPhone(lead.phone) : null} href={lead.phone ? `tel:${lead.phone}` : null} showToast={showToast} />
                  <ContactRow icon={MapPin} label="Address" value={cleanedAddress(lead)} showToast={showToast} />
                </div>
                <div style={{ padding: "10px 14px", background: T.panelAlt, display: "flex", gap: 8 }}>
                  <a href={lead.phone ? `tel:${lead.phone}` : "#"} title="Call"
                     style={{ flex: 1, padding: "8px", borderRadius: 8, background: T.panel, border: `1px solid ${T.borderS}`,
                              display: "flex", alignItems: "center", justifyContent: "center", color: lead.phone ? T.ink2 : T.ink4, textDecoration: "none",
                              pointerEvents: lead.phone ? "auto" : "none", opacity: lead.phone ? 1 : 0.5 }}>
                    <Phone size={14} />
                  </a>
                  <a href={lead.email ? `mailto:${lead.email}` : "#"} title="Email"
                     style={{ flex: 1, padding: "8px", borderRadius: 8, background: T.panel, border: `1px solid ${T.borderS}`,
                              display: "flex", alignItems: "center", justifyContent: "center", color: lead.email ? T.ink2 : T.ink4, textDecoration: "none",
                              pointerEvents: lead.email ? "auto" : "none", opacity: lead.email ? 1 : 0.5 }}>
                    <Mail size={14} />
                  </a>
                  <button onClick={() => navigate("/communications")} title="Message"
                          style={{ flex: 1, padding: "8px", borderRadius: 8, background: T.panel, border: `1px solid ${T.borderS}`,
                                   display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, cursor: "pointer" }}>
                    <MessageSquare size={14} />
                  </button>
                </div>
              </SfCard>

              {/* Pipeline card */}
              <SfCard padding={false}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <Target size={14} color={T.ink2} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Pipeline details</div>
                </div>
                <div style={{ padding: "0 18px" }}>
                  {[
                    {
                      label: "Owner",
                      value: ownerMember
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <SfAvatar initials={sfInitials(`${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`)} color={ownerMember.color || T.blue} size={20} />
                            {`${ownerMember.first_name || ""} ${ownerMember.last_name || ""}`.trim() || ownerMember.email}
                          </span>
                        : <span style={{ color: T.ink3 }}>Unassigned</span>,
                    },
                    {
                      label: "Priority",
                      value: lead.priority
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{
                              width: 7, height: 7, borderRadius: 4,
                              background: lead.priority === "high" ? T.red : lead.priority === "medium" ? T.amber : T.ink3,
                            }} />
                            <span style={{ textTransform: "capitalize" }}>{lead.priority}</span>
                          </span>
                        : <span style={{ color: T.ink3 }}>—</span>,
                    },
                    { label: "Created", value: lead.created_at ? `${relativeAge(lead.created_at)} · ${new Date(lead.created_at).toLocaleDateString()}` : "—" },
                    { label: "Updated", value: lead.updated_at ? relativeAge(lead.updated_at) : "—" },
                    {
                      label: "Next task",
                      value: tasks.find((t) => t.status !== "completed") ? (
                        <span style={{ color: T.ink }}>
                          {tasks.find((t) => t.status !== "completed").title || tasks.find((t) => t.status !== "completed").description}
                        </span>
                      ) : <span style={{ color: T.ink3 }}>None</span>,
                    },
                  ].map((r) => (
                    <div key={r.label} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                      borderBottom: `1px solid ${T.borderS}`,
                    }}>
                      <span style={{ fontSize: 11, color: T.ink3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", width: 90 }}>
                        {r.label}
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.ink2, flex: 1, minWidth: 0 }}>
                        {r.value}
                      </div>
                    </div>
                  ))}
                </div>
              </SfCard>
            </div>
          </div>
        )}

        {/* ACTIVITY */}
        {tab === "activity" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Activity size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>All activity</div>
              <div style={{ flex: 1 }} />
              <SfFilterChip>All types</SfFilterChip>
              <SfFilterChip>All users</SfFilterChip>
            </div>
            <div style={{ padding: "8px 18px" }}>
              {activities.length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" body="Activity events from calls, messages, stage changes, and notes will appear here once the lead has any history." />
              ) : (
                activities.map((a, i, arr) => <ActivityRow key={i} act={a} isLast={i === arr.length - 1} />)
              )}
            </div>
          </SfCard>
        )}

        {/* TASKS */}
        {tab === "tasks" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <CheckCircle2 size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Tasks</div>
              <div style={{ flex: 1 }} />
              <SfButton variant="primary" size="sm" icon={Plus} onClick={() => navigate("/tasks")}>New task</SfButton>
            </div>
            {tasks.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No tasks for this lead" body="Add tasks to track follow-ups, call-backs, and reminders." cta="Open Tasks" onCta={() => navigate("/tasks")} />
            ) : (
              <div>
                {tasks.map((t, i) => {
                  const done = t.status === "completed"
                  return (
                    <div key={t.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 18px",
                      borderBottom: i < tasks.length - 1 ? `1px solid ${T.borderS}` : "none",
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 5,
                        border: `1.5px solid ${done ? T.greenDark : T.border}`,
                        background: done ? T.greenDark : "transparent",
                        color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {done && <Check size={12} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: T.ink,
                          textDecoration: done ? "line-through" : "none",
                          opacity: done ? 0.6 : 1,
                        }}>
                          {t.title || t.description}
                        </div>
                        {t.due_date && (
                          <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                            Due {new Date(t.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SfCard>
        )}

        {/* ESTIMATES */}
        {tab === "estimates" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Clipboard size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Estimates</div>
              <div style={{ flex: 1 }} />
              <SfButton variant="primary" size="sm" icon={Plus} onClick={() => navigate("/estimates")}>New estimate</SfButton>
            </div>
            <EmptyState
              icon={Clipboard}
              title="No estimates linked to this lead"
              body="Create an estimate to send a quote. Once accepted, the lead converts to a booking."
              cta="Open Estimates"
              onCta={() => navigate("/estimates")}
            />
          </SfCard>
        )}

        {/* MESSAGES */}
        {tab === "messages" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <MessageSquare size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Messages</div>
              <div style={{ flex: 1 }} />
              <SfButton variant="primary" size="sm" icon={Send} onClick={() => navigate("/communications")}>Open inbox</SfButton>
            </div>
            <EmptyState
              icon={MessageSquare}
              title="Message history lives in the Inbox"
              body="Open the unified inbox to see SMS and email threads with this contact."
              cta="Open Inbox"
              onCta={() => navigate("/communications")}
            />
          </SfCard>
        )}

        {/* NOTES */}
        {tab === "notes" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Briefcase size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Notes</div>
              <div style={{ flex: 1 }} />
            </div>
            {/* Composer */}
            <div style={{
              margin: "14px 18px", padding: "12px",
              background: T.amberSoft, border: `1px solid ${T.amber}33`, borderRadius: 8,
            }}>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add an internal note about this lead…"
                rows={3}
                style={{
                  width: "100%", padding: 10, fontSize: 13, lineHeight: 1.4, color: T.ink,
                  background: "transparent", border: "none", outline: "none", resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: `1px dashed ${T.amber}55` }}>
                <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,.6)", color: T.amberDark, fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>Internal</span>
                <div style={{ flex: 1 }} />
                <SfButton variant="primary" size="sm" onClick={handleSaveNote} disabled={!noteDraft.trim() || savingNote}>
                  {savingNote ? "Saving…" : "Save note"}
                </SfButton>
              </div>
            </div>
            {notesList.length === 0 ? (
              <EmptyState icon={Briefcase} title="No notes yet" body="Add internal notes about preferences, objections, or follow-ups." />
            ) : (
              <div style={{ padding: "0 18px 14px" }}>
                {notesList.map((n) => (
                  <div key={n.id} style={{
                    padding: "12px 14px", background: T.panelAlt, borderRadius: 8, marginBottom: 10,
                    display: "flex", gap: 10,
                  }}>
                    <SfAvatar initials="LN" color={T.amberDark} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{n.author}</span>
                        <span style={{ fontSize: 11, color: T.ink3 }}>{relativeAge(n.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {n.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SfCard>
        )}

        {/* FILES */}
        {tab === "files" && (
          <SfCard padding={false}>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderS}`, display: "flex", alignItems: "center", gap: 10 }}>
              <Paperclip size={14} color={T.ink2} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Files</div>
              <div style={{ flex: 1 }} />
              <SfButton variant="primary" size="sm" icon={Upload} disabled>Upload</SfButton>
            </div>
            <EmptyState
              icon={Paperclip}
              title="No files attached"
              body="File attachments will be wired in a follow-up — they need the file storage endpoints to be enabled."
            />
          </SfCard>
        )}
      </div>
    </div>
  )
}

export default LeadDetailsPage
