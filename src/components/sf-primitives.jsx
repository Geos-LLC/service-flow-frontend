"use client"
import { ArrowUp, ArrowDown, ChevronDown } from "lucide-react"

/**
 * Service Blue design-system primitives. Mirrors the design pack's
 * `app/components.jsx`. These are presentation-only — they take props
 * and render UI. Wave 2 builds Dashboard / Jobs / Job detail on top.
 *
 * Tokens live in src/index.css under --sf-*.
 */

// ── Card ────────────────────────────────────────────────────
export const SfCard = ({ children, padding = true, className = "", style = {}, ...rest }) => (
  <div
    className={`bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] rounded-[10px] ${className}`}
    style={{
      boxShadow: "var(--sf-shadow)",
      padding: padding === true ? "16px 18px" : padding || 0,
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
)

export const SfCardHeader = ({ title, subtitle, right, className = "" }) => (
  <div className={`flex items-center mb-3 ${className}`}>
    <div className="min-w-0 flex-1">
      <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]" style={{ letterSpacing: "-0.005em" }}>
        {title}
      </div>
      {subtitle && (
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">{subtitle}</div>
      )}
    </div>
    {right && <div className="flex items-center gap-2 ml-2 flex-shrink-0">{right}</div>}
  </div>
)

// ── Page header ────────────────────────────────────────────
export const SfPageHeader = ({ eyebrow, title, subtitle, actions, tabs }) => (
  <div className="px-6 pt-5 lg:px-8">
    <div className="flex items-end gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div
            className="text-[11.5px] font-semibold text-[var(--sf-ink-3)] uppercase mb-1.5"
            style={{ letterSpacing: ".04em" }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="text-[22px] sm:text-[24px] font-bold text-[var(--sf-ink)] leading-tight m-0"
          style={{ letterSpacing: "-0.02em", fontFamily: "var(--sf-font-ui)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <div className="text-[13px] text-[var(--sf-ink-2)] mt-1.5">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
    {tabs && (
      <div className="flex items-center mt-4 border-b border-[var(--sf-border-soft)] -mx-6 lg:-mx-8 px-6 lg:px-8">
        {tabs}
      </div>
    )}
  </div>
)

// ── Button ─────────────────────────────────────────────────
export const SfButton = ({
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  children,
  kbd,
  className = "",
  style = {},
  ...rest
}) => {
  const sizes = {
    sm: { pad: "5px 10px",  font: 12,   gap: 5, icon: 13 },
    md: { pad: "8px 14px",  font: 13,   gap: 7, icon: 15 },
    lg: { pad: "10px 18px", font: 14,   gap: 8, icon: 17 },
  }
  const s = sizes[size]
  const variants = {
    primary:   { bg: "var(--sf-blue)",     fg: "#fff",                   border: "transparent",            shadow: "0 1px 2px rgba(37,99,235,.3)" },
    secondary: { bg: "var(--sf-panel)",    fg: "var(--sf-ink-2)",        border: "var(--sf-border-2)",     shadow: "var(--sf-shadow)" },
    ghost:     { bg: "transparent",        fg: "var(--sf-ink-2)",        border: "transparent",            shadow: "none" },
    danger:    { bg: "var(--sf-panel)",    fg: "var(--sf-red-dark)",     border: "var(--sf-red-soft)",     shadow: "var(--sf-shadow)" },
    dark:      { bg: "var(--sf-ink)",      fg: "#fff",                   border: "transparent",            shadow: "0 1px 2px rgba(15,23,42,.25)" },
  }
  const v = variants[variant]
  const isLight = variant === "primary" || variant === "dark"
  return (
    <button
      {...rest}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: s.pad,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.border}`,
        borderRadius: 10,
        fontSize: s.font,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: v.shadow,
        fontFamily: "var(--sf-font-ui)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {Icon && <Icon size={s.icon} strokeWidth={isLight ? 2.2 : 1.85} />}
      {children}
      {IconRight && <IconRight size={s.icon} strokeWidth={1.85} />}
      {kbd && (
        <span
          className="ml-1.5 px-[5px] py-[1px] rounded text-[10px] opacity-85"
          style={{
            fontFamily: "var(--sf-font-mono)",
            background: isLight ? "rgba(255,255,255,.18)" : "var(--sf-panel-soft)",
            color: "inherit",
          }}
        >
          {kbd}
        </span>
      )}
    </button>
  )
}

// ── KPI tile ───────────────────────────────────────────────
export const SfKPI = ({ label, value, delta, deltaPos, sub, accent, mono = true }) => (
  <SfCard padding={0} className="flex-1">
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] text-[var(--sf-ink-3)] font-medium">{label}</span>
        {accent && (
          <span
            className="ml-auto w-1.5 h-1.5 rounded-full"
            style={{ background: accent }}
          />
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1.5">
        <div
          className="text-[24px] font-bold text-[var(--sf-ink)] leading-none"
          style={{
            letterSpacing: "-0.02em",
            fontVariantNumeric: mono ? "tabular-nums" : "normal",
          }}
        >
          {value}
        </div>
        {delta && (
          <span
            className={`inline-flex items-center gap-px text-[11.5px] font-semibold ${
              deltaPos ? "text-[var(--sf-green-dark)]" : "text-[var(--sf-red-dark)]"
            }`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {deltaPos ? <ArrowUp size={11} strokeWidth={2.4} /> : <ArrowDown size={11} strokeWidth={2.4} />}
            {delta}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-[var(--sf-ink-3)] mt-1">{sub}</div>}
    </div>
  </SfCard>
)

// ── Status pill — handles jobs, invoices, estimates, leads ──
const STATUS_MAP = {
  // Jobs
  "In progress": { bg: "var(--sf-green-soft)", fg: "var(--sf-green-dark)", dot: "#22C55E" },
  "En route":    { bg: "var(--sf-blue-soft)",  fg: "var(--sf-blue-dark)",  dot: "var(--sf-blue)" },
  Scheduled:     { bg: "var(--sf-panel-soft)", fg: "var(--sf-ink-2)",      dot: "var(--sf-ink-3)" },
  Unassigned:    { bg: "var(--sf-red-soft)",   fg: "var(--sf-red-dark)",   dot: "var(--sf-red)" },
  Completed:     { bg: "var(--sf-panel-soft)", fg: "var(--sf-ink-2)",      dot: "var(--sf-ink-3)" },
  Cancelled:     { bg: "var(--sf-panel-soft)", fg: "var(--sf-ink-3)",      dot: "var(--sf-ink-4)" },
  // Invoices
  Paid:          { bg: "var(--sf-green-soft)", fg: "var(--sf-green-dark)", dot: "#22C55E" },
  Sent:          { bg: "var(--sf-blue-soft)",  fg: "var(--sf-blue-dark)",  dot: "var(--sf-blue)" },
  Viewed:        { bg: "var(--sf-teal-soft)",  fg: "#0E7490",              dot: "var(--sf-teal)" },
  Draft:         { bg: "var(--sf-panel-soft)", fg: "var(--sf-ink-2)",      dot: "var(--sf-ink-3)" },
  Overdue:       { bg: "var(--sf-red-soft)",   fg: "var(--sf-red-dark)",   dot: "var(--sf-red)" },
  // Estimates
  Accepted:      { bg: "var(--sf-green-soft)", fg: "var(--sf-green-dark)", dot: "#22C55E" },
  Declined:      { bg: "var(--sf-red-soft)",   fg: "var(--sf-red-dark)",   dot: "var(--sf-red)" },
  Expired:       { bg: "var(--sf-panel-soft)", fg: "var(--sf-ink-3)",      dot: "var(--sf-ink-4)" },
}

export const SfStatusPill = ({ status }) => {
  const c = STATUS_MAP[status] || STATUS_MAP.Scheduled
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full whitespace-nowrap"
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 11.5,
        fontWeight: 600,
        border: `1px solid ${c.dot}25`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {status}
    </span>
  )
}

// ── Tag chip ───────────────────────────────────────────────
export const SfTag = ({ children, color = "#475569", bg = "var(--sf-panel-soft)" }) => (
  <span
    className="inline-flex items-center px-2 py-[2px] rounded-md whitespace-nowrap"
    style={{
      color,
      background: bg,
      fontSize: 11,
      fontWeight: 600,
      border: `1px solid ${color}1f`,
    }}
  >
    {children}
  </span>
)

// ── Filter chip ────────────────────────────────────────────
export const SfFilterChip = ({ children, active, count, icon: Icon, onClick }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12px] font-semibold whitespace-nowrap transition-colors ${
      active
        ? "bg-[var(--sf-blue-soft)] text-[var(--sf-blue-dark)] border border-[var(--sf-blue-soft-2)]"
        : "bg-[var(--sf-panel)] text-[var(--sf-ink-2)] border border-[var(--sf-border-soft)] hover:bg-[var(--sf-panel-soft)]"
    }`}
    style={{ fontFamily: "var(--sf-font-ui)" }}
  >
    {Icon && <Icon size={13} strokeWidth={1.85} />}
    {children}
    {count !== undefined && count !== null && (
      <span
        className={`inline-flex items-center justify-center min-w-[16px] px-[5px] rounded-md text-[10.5px] font-semibold ${
          active ? "bg-[var(--sf-blue)] text-white" : "bg-[var(--sf-panel-soft)] text-[var(--sf-ink-2)]"
        }`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {count}
      </span>
    )}
  </button>
)

// ── Tab (underline-style) ──────────────────────────────────
export const SfTab = ({ active, children, count, onClick }) => (
  <button
    onClick={onClick}
    className="px-3.5 py-2.5 bg-transparent inline-flex items-center gap-1.5 text-[13px] -mb-px"
    style={{
      fontWeight: active ? 600 : 500,
      color: active ? "var(--sf-ink)" : "var(--sf-ink-2)",
      borderBottom: `2px solid ${active ? "var(--sf-blue)" : "transparent"}`,
      fontFamily: "var(--sf-font-ui)",
    }}
  >
    {children}
    {count !== undefined && count !== null && (
      <span
        className="text-[11px] font-semibold px-1.5 py-px rounded-md"
        style={{
          background: active ? "var(--sf-blue-soft)" : "var(--sf-panel-soft)",
          color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    )}
  </button>
)

// ── Avatar / Avatar stack ──────────────────────────────────
export const SfAvatar = ({ initials, color = "#475569", size = 28, ring = null, style = {}, children }) => (
  <span
    className="inline-flex items-center justify-center font-semibold text-white flex-shrink-0"
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: color,
      fontSize: Math.round(size * 0.42),
      letterSpacing: "-0.01em",
      boxShadow: ring ? `0 0 0 2px ${ring}` : "none",
      ...style,
    }}
  >
    {children || initials}
  </span>
)

export const SfAvatarStack = ({ items, size = 24, max = 3, ring = "#fff" }) => (
  <span className="inline-flex">
    {items.slice(0, max).map((m, i) => (
      <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
        <SfAvatar
          initials={m.initials || m.i}
          color={m.color}
          size={size}
          ring={ring}
        />
      </span>
    ))}
    {items.length > max && (
      <span
        className="inline-flex items-center justify-center text-[var(--sf-ink-2)] bg-[var(--sf-border-2)] font-semibold flex-shrink-0"
        style={{
          marginLeft: -6,
          width: size,
          height: size,
          borderRadius: size / 2,
          fontSize: size * 0.36,
          boxShadow: `0 0 0 2px ${ring}`,
        }}
      >
        +{items.length - max}
      </span>
    )}
  </span>
)

// ── Segmented control (Day/Week/Month etc.) ────────────────
export const SfSegmented = ({ options, value, onChange }) => (
  <div className="inline-flex bg-[var(--sf-panel-soft)] rounded-[7px] p-[2px]">
    {options.map((opt) => {
      const v = typeof opt === "string" ? opt : opt.value
      const label = typeof opt === "string" ? opt : opt.label
      const sel = v === value
      return (
        <button
          key={v}
          onClick={() => onChange?.(v)}
          className="px-3 py-1 rounded-[5px] text-[11.5px] font-semibold transition-colors"
          style={{
            background: sel ? "var(--sf-panel)" : "transparent",
            color: sel ? "var(--sf-ink)" : "var(--sf-ink-2)",
            boxShadow: sel ? "0 1px 2px rgba(0,0,0,.06)" : "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      )
    })}
  </div>
)

// ── Initials helper ────────────────────────────────────────
export const sfInitials = (name) => {
  if (!name) return ""
  return name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// ── Team color cycle ───────────────────────────────────────
// Raw hex so callers can compose with alpha (`${color}26` etc.). The
// matching --sf-team-* CSS vars in index.css still exist for static
// styling needs.
const TEAM_COLORS = [
  "#2563EB", // blue
  "#16A34A", // green
  "#D97706", // amber
  "#7C3AED", // purple
  "#0891B2", // teal
  "#DB2777", // pink
  "#4F46E5", // indigo
  "#65A30D", // lime
  "#EA580C", // orange
  "#0D9488", // emerald-teal
]
export const sfTeamColor = (idx) => TEAM_COLORS[(idx ?? 0) % TEAM_COLORS.length]

/**
 * Assign visually-distinct colors to a deterministically-ordered list
 * of ids. Same id → same color whenever the surrounding set is the same,
 * and *different* ids always get different colors as long as the set is
 * within the palette size. Implementation: order ids by stable hash,
 * then walk the palette.
 */
const stringHash = (s) => {
  const str = String(s ?? "")
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
export const sfAssignTeamColors = (ids) => {
  const unique = Array.from(new Set(ids.map((x) => String(x))))
  const ordered = unique.slice().sort((a, b) => stringHash(a) - stringHash(b))
  const out = new Map()
  ordered.forEach((id, i) => out.set(id, sfTeamColor(i)))
  return out
}

// Re-export ChevronDown for callers that want a consistent dropdown caret
export { ChevronDown as SfChevronDown }
