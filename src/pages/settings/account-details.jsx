"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Shield, Briefcase, Calendar, Sparkles,
  Mail, Phone, Globe, Camera, Check, X, ChevronRight,
  Truck, Archive, User as UserIcon, Smartphone,
  CreditCard, Banknote, FileText, Download, AlertTriangle,
  Monitor, Tablet, LogOut, Loader2, ExternalLink,
} from "lucide-react"
import { userProfileAPI, authAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import { getUserRole } from "../../utils/roleUtils"
import SettingsRailLayout from "../../components/settings-rail-layout"
import { SfCard, SfButton, SfTag, SfAvatar, sfInitials } from "../../components/sf-primitives"

/**
 * Your account — role-aware design per ADDON_your_account_role_aware.md.
 *
 * One page, four variants (Owner / Manager / Scheduler / Cleaner).
 * Sections render conditionally on `effectiveRole`. The Preview-as
 * switcher at top lets owners flip into other roles for QA — for
 * other users it stays hidden and the page renders for their actual
 * role.
 */

// ── Role meta + permission matrix ─────────────────────────

const ROLE_META = {
  owner: {
    label: "Owner",
    tagline: "Full access",
    color: "var(--sf-purple)",
    bg: "var(--sf-purple-soft)",
    icon: Shield,
  },
  manager: {
    label: "Manager",
    tagline: "Ops + finance · no billing",
    color: "var(--sf-blue)",
    bg: "var(--sf-blue-soft)",
    icon: Briefcase,
  },
  scheduler: {
    label: "Scheduler",
    tagline: "Schedule + messaging only",
    color: "var(--sf-teal, #0E7490)",
    bg: "var(--sf-teal-soft, #ECFEFF)",
    icon: Calendar,
  },
  cleaner: {
    label: "Cleaner",
    tagline: "Field app only",
    color: "var(--sf-green-dark)",
    bg: "var(--sf-green-soft)",
    icon: Sparkles,
  },
}

// Normalise the codebase's role token ('worker') into the spec's ('cleaner')
const normaliseRole = (role) => (role === "worker" ? "cleaner" : role)

const PERMISSIONS = [
  ["Manage jobs & schedule",   true,        true,        true,            false],
  ["View customer details",    true,        true,        true,            "limited:own jobs only"],
  ["Send invoices",            true,        true,        false,           false],
  ["Process payroll",          true,        true,        false,           false],
  ["Manage team & roles",      true,        "limited:below your seniority", false, false],
  ["Edit services & pricing",  true,        true,        false,           false],
  ["Manage integrations",      true,        false,       false,           false],
  ["Billing & subscription",   true,        false,       false,           false],
  ["View analytics",           true,        true,        "limited",       false],
  ["Delete data",              true,        false,       false,           false],
]
const PERM_COL = { owner: 1, manager: 2, scheduler: 3, cleaner: 4 }

const NOTIFICATIONS = [
  { event: "New booking received",       roles: ["owner", "manager", "scheduler"],          defaults: { inApp: true, email: true } },
  { event: "Job assigned to you",        roles: ["owner", "manager", "scheduler", "cleaner"], defaults: { inApp: true, push: true } },
  { event: "Job rescheduled",            roles: ["owner", "manager", "scheduler", "cleaner"], defaults: { inApp: true, email: true, push: true } },
  { event: "Job running late",           roles: ["owner", "manager", "scheduler"],          defaults: { inApp: true, sms: true } },
  { event: "Customer cancelled",         roles: ["owner", "manager", "scheduler", "cleaner"], defaults: { inApp: true, email: true } },
  { event: "Payment received",           roles: ["owner", "manager"],                       defaults: { inApp: true, email: true } },
  { event: "Tip received",               roles: ["cleaner"],                                defaults: { push: true } },
  { event: "Invoice overdue",            roles: ["owner", "manager"],                       defaults: { email: true } },
  { event: "New lead from website",      roles: ["owner", "manager", "scheduler"],          defaults: { inApp: true, email: true, sms: true } },
  { event: "New review · 4★ or below",   roles: ["owner", "manager"],                       defaults: { inApp: true, email: true } },
  { event: "You received a 5★ review",   roles: ["cleaner"],                                defaults: { inApp: true, push: true } },
  { event: "Time-off request",           roles: ["owner", "manager"],                       defaults: { inApp: true, email: true } },
  { event: "Time-off approved / denied", roles: ["cleaner"],                                defaults: { inApp: true, push: true } },
  { event: "Pay stub available",         roles: ["cleaner"],                                defaults: { email: true, push: true } },
  { event: "Weekly summary",             roles: ["owner", "manager"],                       defaults: { email: true } },
  { event: "Product updates",            roles: ["owner", "manager", "scheduler", "cleaner"], defaults: { email: true } },
]

const CONNECTED_PROVIDERS_BY_ROLE = {
  owner:     ["google", "apple", "microsoft", "slack"],
  manager:   ["google", "apple", "microsoft", "slack"],
  scheduler: ["google", "apple", "slack"],
  cleaner:   ["google", "apple"],
}

const PROVIDER_META = {
  google:    { label: "Google",    icon: Globe },
  apple:     { label: "Apple",     icon: Sparkles },
  microsoft: { label: "Microsoft", icon: Briefcase },
  slack:     { label: "Slack",     icon: Smartphone },
}

// ── Page ──────────────────────────────────────────────────

const AccountDetails = () => {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const actualRole = useMemo(() => normaliseRole(getUserRole(authUser)) || "manager", [authUser])
  const canPreviewOtherRoles = actualRole === "owner"

  const [previewRole, setPreviewRole] = useState(null)
  const effectiveRole = previewRole || actualRole
  const meta = ROLE_META[effectiveRole] || ROLE_META.manager

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    pronouns: "",
    jobTitle: "",
    timezone: "America/New_York",
    locale: "en-US",
    profilePicture: "",
    emailVerified: true,
    phoneVerified: false,
  })
  const [initial, setInitial] = useState(profile)
  const [dirty, setDirty] = useState(false)

  // Notifications state — initial values pulled from the per-role
  // defaults. Persistence lands later (would need a new endpoint).
  const [notifPrefs, setNotifPrefs] = useState({})
  useEffect(() => {
    const next = {}
    NOTIFICATIONS.forEach((n) => {
      next[n.event] = {
        inApp: !!n.defaults.inApp,
        email: !!n.defaults.email,
        push:  !!n.defaults.push,
        sms:   !!n.defaults.sms,
      }
    })
    setNotifPrefs(next)
  }, [])

  useEffect(() => {
    if (!authUser?.id) return
    ;(async () => {
      setLoading(true)
      try {
        const data = await userProfileAPI.getProfile(authUser.id)
        const next = {
          firstName: data.firstName || data.first_name || "",
          lastName:  data.lastName || data.last_name || "",
          email:     data.email || "",
          phone:     data.phone || "",
          pronouns:  data.pronouns || "",
          jobTitle:  data.jobTitle || data.title || "",
          timezone:  data.timezone || "America/New_York",
          locale:    data.locale || "en-US",
          profilePicture: data.profilePicture || data.profile_picture || "",
          emailVerified: data.emailVerified !== false,
          phoneVerified: !!data.phoneVerified,
        }
        setProfile(next)
        setInitial(next)
        setDirty(false)
      } catch (e) {
        setMessage({ type: "error", text: "Couldn't load your profile" })
      } finally {
        setLoading(false)
      }
    })()
  }, [authUser?.id])

  const update = (field, value) => {
    setProfile((p) => ({ ...p, [field]: value }))
    setDirty(true)
  }
  const handleDiscard = () => {
    setProfile(initial)
    setDirty(false)
    setMessage(null)
  }
  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await userProfileAPI.updateProfile({
        userId: authUser.id,
        firstName: profile.firstName,
        lastName:  profile.lastName,
        email:     profile.email,
        phone:     profile.phone,
        pronouns:  profile.pronouns,
        jobTitle:  profile.jobTitle,
        timezone:  profile.timezone,
        locale:    profile.locale,
      })
      setInitial(profile)
      setDirty(false)
      setMessage({ type: "success", text: "Saved" })
      setTimeout(() => setMessage(null), 2500)
    } catch (e) {
      setMessage({ type: "error", text: e?.response?.data?.error || "Failed to save" })
    } finally {
      setSaving(false)
    }
  }

  const onSignOut = () => {
    authAPI.signout()
    navigate("/signin")
  }

  const isCleaner = effectiveRole === "cleaner"
  const isOwner = effectiveRole === "owner"

  if (loading) {
    return (
      <SettingsRailLayout title="Your account" section="Account">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-[var(--sf-ink-3)] animate-spin" />
        </div>
      </SettingsRailLayout>
    )
  }

  return (
    <SettingsRailLayout
      title="Your account"
      section="Account"
      subtitle="Profile, notifications, sessions, and personal data"
      onSave={dirty ? handleSave : undefined}
      onDiscard={dirty ? handleDiscard : undefined}
      saving={saving}
    >
      {message && (
        <div
          className="mb-4 rounded-md px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-2"
          style={{
            background: message.type === "success" ? "var(--sf-green-soft)" : "var(--sf-red-soft)",
            color:      message.type === "success" ? "var(--sf-green-dark)" : "var(--sf-red-dark)",
            border: `1px solid ${
              message.type === "success" ? "rgba(22,163,74,.25)" : "rgba(220,38,38,.25)"
            }`,
          }}
        >
          {message.type === "success" ? <Check size={13} /> : <X size={13} />}
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {canPreviewOtherRoles && (
          <PreviewSwitcher
            current={effectiveRole}
            isPreviewing={!!previewRole}
            onChange={(r) => setPreviewRole(r === actualRole ? null : r)}
          />
        )}

        <IdentityCard profile={profile} update={update} meta={meta} />

        <LoginContactCard profile={profile} update={update} />

        {isCleaner && <PayBankingCard />}
        {isCleaner && <VehicleGearCard />}
        {isCleaner && <SkillsCard />}

        <NotificationsCard
          role={effectiveRole}
          prefs={notifPrefs}
          setPrefs={setNotifPrefs}
        />

        <PermissionsCard role={effectiveRole} isOwner={isOwner} isCleaner={isCleaner} />

        <ConnectedAccountsCard role={effectiveRole} />

        <SessionsCard isCleaner={isCleaner} />

        <DangerZoneCard isOwner={isOwner} onSignOut={onSignOut} />
      </div>
    </SettingsRailLayout>
  )
}

// ── Preview switcher ──────────────────────────────────────

const PreviewSwitcher = ({ current, isPreviewing, onChange }) => {
  const roles = ["owner", "manager", "scheduler", "cleaner"]
  const idx = roles.indexOf(current) + 1
  return (
    <div
      className="rounded-[10px]"
      style={{
        padding: "10px 14px",
        background: "var(--sf-panel-alt)",
        border: "1.5px dashed var(--sf-border-soft)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
          style={{ letterSpacing: ".06em" }}
        >
          👁 Preview as
        </span>
        <div className="flex" style={{ background: "var(--sf-panel)", borderRadius: 6, padding: 2 }}>
          {roles.map((r) => {
            const m = ROLE_META[r]
            const Icon = m.icon
            const active = r === current
            return (
              <button
                key={r}
                onClick={() => onChange(r)}
                style={{
                  padding: "5px 9px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: active ? m.bg : "transparent",
                  color: active ? m.color : "var(--sf-ink-2)",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontFamily: "var(--sf-font-ui)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon size={12} />
                {m.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-[var(--sf-ink-3)] italic">
          Role {idx}/4 · sections shown vary by permissions
          {isPreviewing && " · previewing"}
        </span>
      </div>
    </div>
  )
}

// ── Identity ──────────────────────────────────────────────

const IdentityCard = ({ profile, update, meta }) => {
  const inputRef = useRef(null)
  const displayName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "—"
  return (
    <SfCard padding={0}>
      <CardHeader title="Identity" />
      <div className="px-5 pb-5 flex items-start gap-5 flex-wrap">
        <div className="flex flex-col items-center gap-2 flex-shrink-0">
          {profile.profilePicture ? (
            <img
              src={profile.profilePicture}
              alt="Profile"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                objectFit: "cover",
                border: `2px solid ${meta.color}30`,
              }}
            />
          ) : (
            <SfAvatar
              initials={sfInitials(displayName)}
              color={meta.color}
              size={64}
              style={{ fontSize: 22 }}
            />
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-[11.5px] font-semibold text-[var(--sf-blue-dark)]"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              Upload
            </button>
            {profile.profilePicture && (
              <button
                onClick={() => update("profilePicture", "")}
                className="text-[11.5px] font-semibold text-[var(--sf-red-dark)]"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                const reader = new FileReader()
                reader.onload = (ev) => update("profilePicture", ev.target.result)
                reader.readAsDataURL(f)
              }
              if (e.target) e.target.value = ""
            }}
          />
          <div className="text-[10px] text-[var(--sf-ink-3)] text-center" style={{ maxWidth: 140 }}>
            Or use the photo from your Gravatar
          </div>
        </div>
        <div className="flex-1 min-w-[280px] flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First name">
              <TextInput value={profile.firstName} onChange={(v) => update("firstName", v)} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <TextInput value={profile.lastName} onChange={(v) => update("lastName", v)} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Pronouns" hint="Optional · shown next to your name in team views">
            <TextInput value={profile.pronouns} onChange={(v) => update("pronouns", v)} placeholder="e.g. she/her" />
          </Field>
          <Field label="Job title">
            <TextInput
              value={profile.jobTitle}
              onChange={(v) => update("jobTitle", v)}
              placeholder="e.g. Operations Manager"
              autoComplete="organization-title"
            />
          </Field>
        </div>
      </div>
    </SfCard>
  )
}

// ── Login & contact ───────────────────────────────────────

const LoginContactCard = ({ profile, update }) => (
  <SfCard padding={0}>
    <CardHeader title="Login & contact" />
    <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Email">
        <div className="flex items-center gap-2">
          <TextInput
            value={profile.email}
            onChange={(v) => update("email", v)}
            icon={Mail}
            type="email"
            autoComplete="email"
          />
          {profile.emailVerified ? (
            <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">Verified</SfTag>
          ) : (
            <SfTag color="var(--sf-amber-dark)" bg="var(--sf-amber-soft)">Unverified</SfTag>
          )}
        </div>
      </Field>
      <Field label="Mobile">
        <div className="flex items-center gap-2">
          <TextInput
            value={profile.phone}
            onChange={(v) => update("phone", v)}
            icon={Phone}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
          {profile.phoneVerified ? (
            <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">Verified</SfTag>
          ) : (
            <SfTag color="var(--sf-ink-3)" bg="var(--sf-panel-soft)">Unverified</SfTag>
          )}
        </div>
      </Field>
      <Field label="Time zone">
        <SelectInput
          value={profile.timezone}
          onChange={(v) => update("timezone", v)}
          options={[
            "America/New_York", "America/Chicago", "America/Denver",
            "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
          ]}
        />
      </Field>
      <Field label="Locale & language">
        <SelectInput
          value={profile.locale}
          onChange={(v) => update("locale", v)}
          options={["en-US · English (US)", "en-GB · English (UK)", "es-MX · Español (México)", "fr-CA · Français (Canada)"]}
        />
      </Field>
    </div>
  </SfCard>
)

// ── Cleaner: Pay & banking ────────────────────────────────

const PayBankingCard = () => (
  <SfCard padding={0}>
    <div
      className="flex items-center"
      style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
    >
      <div className="text-[13.5px] font-semibold text-[var(--sf-ink)] flex-1">Pay & banking</div>
      <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">Direct deposit active</SfTag>
    </div>
    <div className="px-5 pb-5 pt-4 flex flex-col gap-3">
      <Field label="Direct deposit account">
        <div className="flex items-center gap-2">
          <TextInput value="Chase Bank · Checking ····8421" onChange={() => {}} icon={Banknote} />
          <SfButton variant="secondary" size="sm">Update</SfButton>
        </div>
      </Field>
      <Field label="W-9 / W-4 on file">
        <div className="flex items-center gap-2">
          <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">
            <Check size={10} className="inline-block mr-0.5" /> Verified Jan 12, 2026
          </SfTag>
          <SfButton variant="ghost" size="sm" icon={Download}>Download</SfButton>
        </div>
      </Field>
      <Field label="Hourly rate" hint="Set by your manager">
        <TextInput value="$24.00 / hr" onChange={() => {}} icon={CreditCard} />
      </Field>
      <Field label="Tip distribution">
        <SelectInput
          value="Even split with teammate"
          onChange={() => {}}
          options={[
            "Even split with teammate",
            "Lead gets 60%",
            "I keep my own",
          ]}
        />
      </Field>
      <Field label="Pay stubs">
        <SfButton variant="secondary" size="sm" icon={FileText}>View all (24)</SfButton>
      </Field>
    </div>
  </SfCard>
)

// ── Cleaner: Vehicle & gear ───────────────────────────────

const VehicleGearCard = () => {
  const items = [
    { eyebrow: "Vehicle",          value: "Sparkle Van #3",   sub: "License 7-XYZ-921 · Toyota Sienna", icon: Truck,     bg: "var(--sf-blue-soft)",    color: "var(--sf-blue-dark)" },
    { eyebrow: "Supply locker",    value: "Locker 12",        sub: "Brooklyn HQ · last restocked 5/10", icon: Archive,   bg: "var(--sf-amber-soft)",   color: "var(--sf-amber-dark)" },
    { eyebrow: "Uniform size",     value: "Women's M",         sub: "Last issued Jan 2026",              icon: UserIcon,  bg: "var(--sf-purple-soft)",  color: "var(--sf-purple)" },
    { eyebrow: "Phone allowance",  value: "$30 / mo",          sub: "Reimbursed with payroll",           icon: Smartphone, bg: "var(--sf-green-soft)",  color: "var(--sf-green-dark)" },
  ]
  return (
    <SfCard padding={0}>
      <CardHeader title="Vehicle & gear" />
      <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((it) => {
          const Icon = it.icon
          return (
            <div
              key={it.eyebrow}
              className="rounded-md flex gap-3 items-start"
              style={{
                padding: "12px 14px",
                background: "var(--sf-panel)",
                border: "1px solid var(--sf-border-soft)",
              }}
            >
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: it.bg, color: it.color }}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[10px] font-bold uppercase text-[var(--sf-ink-3)]"
                  style={{ letterSpacing: ".06em" }}
                >
                  {it.eyebrow}
                </div>
                <div className="text-[13.5px] font-bold text-[var(--sf-ink)] mt-0.5">{it.value}</div>
                <div className="text-[11px] text-[var(--sf-ink-3)] mt-px">{it.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Cleaner: Skills & certifications ──────────────────────

const SkillsCard = () => {
  const skills = [
    { label: "Standard Clean",      color: "var(--sf-green)",       certified: true },
    { label: "Deep Clean",           color: "var(--sf-blue)",        certified: true },
    { label: "Move-in / Move-out",   color: "var(--sf-purple)",      certified: true },
    { label: "Eco-friendly only",    color: "var(--sf-green-dark)",  certified: true },
    { label: "Commercial",           color: "var(--sf-amber-dark)",  certified: true },
    { label: "Window detailing",     color: "var(--sf-teal, #0E7490)", certified: true },
    { label: "Post-construction",    color: "var(--sf-ink-3)",       certified: false },
    { label: "Pet hair specialist",  color: "var(--sf-purple)",      certified: true },
  ]
  const training = [
    { name: "OSHA Bloodborne Pathogens", date: "2026-03-14", trainer: "ServSafe", score: "98%" },
    { name: "Eco-cleaning Certification", date: "2026-02-02", trainer: "Green Seal", score: "Pass" },
    { name: "Customer Service Basics",   date: "2025-11-09", trainer: "Internal",   score: "Pass" },
  ]
  return (
    <SfCard padding={0}>
      <CardHeader title="Skills & certifications" />
      <div className="px-5 pb-5">
        <div className="flex flex-wrap gap-1.5 mb-5">
          {skills.map((s) => (
            <span
              key={s.label}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-full"
              style={{
                padding: "4px 10px",
                background: s.certified ? `${s.color}1a` : "transparent",
                color: s.certified ? s.color : "var(--sf-ink-3)",
                border: s.certified ? `1px solid ${s.color}40` : "1px dashed var(--sf-border-soft)",
                fontFamily: "var(--sf-font-ui)",
              }}
            >
              {s.certified ? <Check size={11} strokeWidth={2.5} /> : null}
              {s.label}
            </span>
          ))}
        </div>
        <div
          className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)] mb-2"
          style={{ letterSpacing: ".06em" }}
        >
          Training history
        </div>
        <div className="divide-y divide-[var(--sf-border-soft)]">
          {training.map((t) => (
            <div key={t.name} className="flex items-center gap-2.5 py-2.5">
              <Check size={13} className="text-[var(--sf-green)] flex-shrink-0" strokeWidth={2.5} />
              <div className="min-w-0 flex-1">
                <span className="text-[12.5px] font-semibold text-[var(--sf-ink)]">{t.name}</span>
                <span
                  className="text-[11px] text-[var(--sf-ink-3)] ml-2"
                  style={{ fontFamily: "var(--sf-font-mono)" }}
                >
                  {t.date}
                </span>
                <span className="text-[11px] text-[var(--sf-ink-3)] ml-2">by {t.trainer}</span>
              </div>
              <SfTag color="var(--sf-ink-2)" bg="var(--sf-panel-alt)">{t.score}</SfTag>
            </div>
          ))}
        </div>
      </div>
    </SfCard>
  )
}

// ── Notifications ─────────────────────────────────────────

const NotificationsCard = ({ role, prefs, setPrefs }) => {
  const channels = [
    { key: "inApp",  label: "In-app" },
    { key: "email",  label: "Email"  },
    { key: "push",   label: "Push"   },
    { key: "sms",    label: "SMS"    },
  ]
  const visible = NOTIFICATIONS.filter((n) => n.roles.includes(role))
  const toggle = (event, key) =>
    setPrefs((p) => ({
      ...p,
      [event]: { ...(p[event] || {}), [key]: !p[event]?.[key] },
    }))
  return (
    <SfCard padding={0}>
      <CardHeader
        title="Notification preferences"
        subtitle="Decide which events reach you, and on which channels"
      />
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--sf-panel-alt)", borderBottom: "1px solid var(--sf-border-soft)" }}>
              <th
                className="text-left text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
                style={{ padding: "8px 18px", letterSpacing: ".06em" }}
              >
                Event
              </th>
              {channels.map((c) => (
                <th
                  key={c.key}
                  className="text-center text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
                  style={{ padding: "8px 12px", letterSpacing: ".06em", width: 76 }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((n, i) => (
              <tr
                key={n.event}
                style={{
                  borderBottom:
                    i < visible.length - 1 ? "1px solid var(--sf-border-soft)" : "none",
                }}
              >
                <td className="text-[12.5px] text-[var(--sf-ink)]" style={{ padding: "10px 18px" }}>
                  {n.event}
                </td>
                {channels.map((c) => (
                  <td key={c.key} style={{ padding: "8px 12px", textAlign: "center" }}>
                    <Switch
                      on={!!prefs[n.event]?.[c.key]}
                      onChange={() => toggle(n.event, c.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="text-[11px] text-[var(--sf-ink-3)]"
        style={{ padding: "10px 18px", borderTop: "1px solid var(--sf-border-soft)" }}
      >
        Quiet hours: {role === "cleaner" ? "outside shift hours" : "9pm – 7am"}
      </div>
    </SfCard>
  )
}

// ── Role & permissions ────────────────────────────────────

const PermissionsCard = ({ role, isOwner, isCleaner }) => {
  const meta = ROLE_META[role] || ROLE_META.manager
  const col = PERM_COL[role]
  const footerCopy = isOwner
    ? "As the owner you have all permissions by default."
    : isCleaner
    ? "Permissions are managed by your owner or manager. Contact your manager to request changes."
    : "Permissions are set by the workspace owner. Contact the owner for changes."
  return (
    <SfCard padding={0}>
      <CardHeader title="Role & permissions" />
      <div className="px-5 pb-5">
        <div
          className="rounded-md flex items-center gap-3 mb-4"
          style={{
            padding: "12px 14px",
            background: meta.bg,
            border: `1px solid ${meta.color}30`,
          }}
        >
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: meta.color, color: "#fff" }}
          >
            <meta.icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold" style={{ color: meta.color }}>{meta.label}</div>
            <div className="text-[11.5px] text-[var(--sf-ink-2)] mt-px">{meta.tagline}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {PERMISSIONS.map(([label, ...row]) => {
            const value = row[col - 1]
            return <PermissionRow key={label} label={label} value={value} />
          })}
        </div>
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-4 italic">
          {footerCopy}
        </div>
      </div>
    </SfCard>
  )
}

const PermissionRow = ({ label, value }) => {
  const isLimited = typeof value === "string" && value.startsWith("limited")
  const note = isLimited ? value.split(":")[1]?.trim() : null
  let dot, text, fadedText = false
  if (value === true) {
    dot = <Check size={11} className="text-[var(--sf-green-dark)]" strokeWidth={3} />
    text = label
  } else if (isLimited) {
    dot = <span style={{ color: "var(--sf-amber-dark)", fontWeight: 800, fontSize: 13 }}>~</span>
    text = label
  } else {
    dot = <X size={11} className="text-[var(--sf-ink-3)]" strokeWidth={3} />
    text = label
    fadedText = true
  }
  return (
    <div
      className="flex items-center gap-2 py-2"
      style={{ borderBottom: "1px solid var(--sf-border-soft)" }}
    >
      <span
        className="w-5 h-5 rounded-full inline-flex items-center justify-center flex-shrink-0"
        style={{
          background:
            value === true
              ? "var(--sf-green-soft)"
              : isLimited
              ? "var(--sf-amber-soft)"
              : "var(--sf-panel-soft)",
        }}
      >
        {dot}
      </span>
      <span
        className={`text-[12.5px] ${fadedText ? "line-through text-[var(--sf-ink-3)]" : "text-[var(--sf-ink-2)]"}`}
      >
        {text}
      </span>
      {isLimited && note && (
        <SfTag color="var(--sf-amber-dark)" bg="var(--sf-amber-soft)">Limited · {note}</SfTag>
      )}
    </div>
  )
}

// ── Connected accounts ────────────────────────────────────

const ConnectedAccountsCard = ({ role }) => {
  const providers = CONNECTED_PROVIDERS_BY_ROLE[role] || []
  return (
    <SfCard padding={0}>
      <CardHeader title="Connected accounts" subtitle="Sign in with your existing account" />
      <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {providers.map((p) => {
          const meta = PROVIDER_META[p]
          const Icon = meta.icon
          return (
            <div
              key={p}
              className="flex items-center gap-3 rounded-md"
              style={{
                padding: "10px 14px",
                background: "var(--sf-panel)",
                border: "1px solid var(--sf-border-soft)",
              }}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--sf-panel-alt)", color: "var(--sf-ink-2)" }}
              >
                <Icon size={15} />
              </div>
              <div className="text-[13px] font-semibold text-[var(--sf-ink)] flex-1">
                {meta.label}
              </div>
              <button
                className="text-[11.5px] font-semibold text-[var(--sf-blue-dark)]"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                Connect
              </button>
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Active sessions ───────────────────────────────────────

const SessionsCard = ({ isCleaner }) => {
  const officeSessions = [
    { device: "MacBook · Chrome",   loc: "Brooklyn, NY · Current",   icon: Monitor,   current: true },
    { device: "iPhone · Mobile app", loc: "Brooklyn, NY · 2 hrs ago", icon: Smartphone },
    { device: "iPad · Safari",      loc: "Manhattan, NY · 1 day ago", icon: Tablet },
    { device: "Windows PC · Edge",  loc: "Queens HQ · 3 days ago",   icon: Monitor },
  ]
  const cleanerSessions = [
    { device: "iPhone · Field App", loc: "Brooklyn, NY · Current",  icon: Smartphone, current: true },
    { device: "iPad mini · van mount", loc: "Sparkle Van #3 · 1 hr ago", icon: Tablet },
  ]
  const sessions = isCleaner ? cleanerSessions : officeSessions
  return (
    <SfCard padding={0}>
      <CardHeader title="Active sessions" subtitle="Sign out anywhere you don't recognize" />
      <div>
        {sessions.map((s, i) => {
          const Icon = s.icon
          return (
            <div
              key={s.device}
              className="flex items-center gap-3"
              style={{
                padding: "12px 18px",
                borderBottom:
                  i < sessions.length - 1 ? "1px solid var(--sf-border-soft)" : "none",
              }}
            >
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--sf-panel-alt)", color: "var(--sf-ink-2)" }}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-[var(--sf-ink)] inline-flex items-center gap-1.5">
                  {s.device}
                  {s.current && (
                    <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">Current</SfTag>
                  )}
                </div>
                <div className="text-[11px] text-[var(--sf-ink-3)] mt-px">{s.loc}</div>
              </div>
              {!s.current && (
                <SfButton variant="ghost" size="sm" icon={LogOut}>
                  Sign out
                </SfButton>
              )}
            </div>
          )
        })}
      </div>
    </SfCard>
  )
}

// ── Danger zone ───────────────────────────────────────────

const DangerZoneCard = ({ isOwner, onSignOut }) => (
  <SfCard
    padding={0}
    style={{ border: "1px solid rgba(220,38,38,.25)", background: "rgba(254,242,242,.5)" }}
  >
    <div
      className="flex items-center gap-2"
      style={{ padding: "14px 18px", borderBottom: "1px solid rgba(220,38,38,.18)" }}
    >
      <AlertTriangle size={15} className="text-[var(--sf-red-dark)]" />
      <span className="text-[13.5px] font-bold text-[var(--sf-red-dark)]">Personal danger zone</span>
    </div>
    <DangerRow
      title="Export your data"
      desc="Download a copy of everything attached to your account (profile, jobs, messages, files)"
      action={<SfButton variant="secondary" size="sm" icon={Download}>Request export</SfButton>}
    />
    <DangerRow
      title="Leave workspace"
      desc={isOwner ? "Owners must transfer ownership before leaving" : "Remove yourself from this workspace"}
      action={
        isOwner ? (
          <SfButton variant="secondary" size="sm" disabled>Transfer first…</SfButton>
        ) : (
          <SfButton variant="secondary" size="sm" icon={LogOut} onClick={onSignOut}>
            Leave workspace…
          </SfButton>
        )
      }
    />
    <DangerRow
      title="Delete account"
      desc="Permanently delete your account. This cannot be undone."
      action={
        <button
          onClick={() => window.location.href = "mailto:support@service-flow.pro?subject=Delete account"}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "6px 14px",
            fontSize: 12.5,
            fontWeight: 600,
            background: "var(--sf-red)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "var(--sf-font-ui)",
          }}
        >
          <ExternalLink size={12} />
          Email support
        </button>
      }
      isLast
    />
  </SfCard>
)

const DangerRow = ({ title, desc, action, isLast }) => (
  <div
    className="flex items-center gap-4 flex-wrap"
    style={{
      padding: "14px 18px",
      borderBottom: isLast ? "none" : "1px solid rgba(220,38,38,.12)",
    }}
  >
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-semibold text-[var(--sf-ink)]">{title}</div>
      <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">{desc}</div>
    </div>
    {action}
  </div>
)

// ── Primitives ────────────────────────────────────────────

const CardHeader = ({ title, subtitle }) => (
  <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}>
    <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">{title}</div>
    {subtitle && <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">{subtitle}</div>}
  </div>
)

const Field = ({ label, hint, children }) => (
  <div>
    <div className="text-[12.5px] font-semibold text-[var(--sf-ink-2)] mb-1">{label}</div>
    {hint && <div className="text-[11px] text-[var(--sf-ink-3)] mb-1.5">{hint}</div>}
    {children}
  </div>
)

const TextInput = ({ value, onChange, placeholder, icon: Icon, type = "text", autoComplete, inputMode }) => (
  <div
    className="flex items-center gap-2 rounded-md bg-[var(--sf-panel)] flex-1"
    style={{ padding: "6px 10px", border: "1px solid var(--sf-border-soft)" }}
  >
    {Icon && <Icon size={14} className="text-[var(--sf-ink-3)] flex-shrink-0" />}
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      inputMode={inputMode}
      className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--sf-ink)]"
      style={{ padding: 0, boxShadow: "none", fontFamily: "var(--sf-font-ui)" }}
    />
  </div>
)

const SelectInput = ({ value, onChange, options }) => (
  <div
    className="flex items-center rounded-md bg-[var(--sf-panel)]"
    style={{ padding: "2px 10px", border: "1px solid var(--sf-border-soft)" }}
  >
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-transparent border-none outline-none text-[13px] text-[var(--sf-ink)]"
      style={{ padding: "6px 0", boxShadow: "none", fontFamily: "var(--sf-font-ui)", appearance: "none" }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
)

const Switch = ({ on, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    aria-pressed={on}
    style={{
      width: 32,
      height: 18,
      borderRadius: 999,
      border: "none",
      padding: 0,
      background: on ? "var(--sf-blue)" : "#cbd5e1",
      cursor: "pointer",
      position: "relative",
      transition: "background .15s",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 2,
        left: on ? 16 : 2,
        width: 14,
        height: 14,
        background: "#fff",
        borderRadius: 7,
        boxShadow: "0 1px 2px rgba(15,23,42,.18)",
        transition: "left .15s",
      }}
    />
  </button>
)

// Suppress ChevronRight unused warning
// eslint-disable-next-line no-unused-vars
const _suppressUnused = ChevronRight

export default AccountDetails
