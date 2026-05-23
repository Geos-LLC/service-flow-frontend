"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Search,
  Briefcase,
  Users,
  Target,
  FileText,
  Receipt,
  CalendarDays,
  MessageSquare,
  LayoutDashboard,
  Calendar as CalendarIcon,
  Settings as SettingsIcon,
  BarChart3,
} from "lucide-react"

/**
 * ⌘K spotlight overlay. Centered near the top of the viewport with a blurred
 * backdrop. The list is keyboard-navigable (↑/↓/Enter, Esc closes).
 *
 * Wave 1 ships the shell — it lists quick actions, common navigation
 * destinations, and a typed-search filter. Later waves can wire in
 * recent jobs and customers from the API.
 */

const NAV_ENTRIES = [
  { kind: "nav", label: "Dashboard",      icon: LayoutDashboard, path: "/dashboard",      keywords: "home overview" },
  { kind: "nav", label: "Schedule",       icon: CalendarIcon,    path: "/schedule",       keywords: "calendar week timeline" },
  { kind: "nav", label: "Jobs",           icon: Briefcase,       path: "/jobs",           keywords: "appointments work" },
  { kind: "nav", label: "Customers",      icon: Users,           path: "/customers",      keywords: "clients people" },
  { kind: "nav", label: "Leads",          icon: Target,          path: "/leads",          keywords: "pipeline prospects" },
  { kind: "nav", label: "Inbox",          icon: MessageSquare,   path: "/communications", keywords: "messages sms email" },
  { kind: "nav", label: "Tasks",          icon: CalendarDays,    path: "/calendar",       keywords: "todo" },
  { kind: "nav", label: "Estimates",      icon: FileText,        path: "/estimates",      keywords: "quotes proposals" },
  { kind: "nav", label: "Invoices",       icon: FileText,        path: "/invoices",       keywords: "billing" },
  { kind: "nav", label: "Team",           icon: Users,           path: "/team",           keywords: "members staff cleaners" },
  { kind: "nav", label: "Payroll",        icon: Receipt,         path: "/payroll",        keywords: "wages pay" },
  { kind: "nav", label: "Analytics",      icon: BarChart3,       path: "/analytics",      keywords: "stats reports" },
  { kind: "nav", label: "Settings",       icon: SettingsIcon,    path: "/settings",       keywords: "preferences config" },
]

const QUICK_ACTIONS = [
  { kind: "action", label: "Create job",      icon: Briefcase,    path: "/createjob",          keywords: "new job booking" },
  { kind: "action", label: "Add customer",    icon: Users,        path: "/customers?new=1",    keywords: "new customer client" },
  { kind: "action", label: "Add lead",        icon: Target,       path: "/leads?new=1",        keywords: "new lead" },
  { kind: "action", label: "New estimate",    icon: FileText,     path: "/estimates?new=1",    keywords: "quote proposal" },
  { kind: "action", label: "New invoice",     icon: Receipt,      path: "/invoices?new=1",     keywords: "bill" },
]

const Spotlight = ({ onClose }) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // All entries grouped — quick actions first, then nav
  const allEntries = useMemo(() => [...QUICK_ACTIONS, ...NAV_ENTRIES], [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allEntries
    return allEntries.filter((e) => {
      const haystack = `${e.label} ${e.keywords || ""}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [query, allEntries])

  // Reset selection when filter changes
  useEffect(() => { setSelectedIdx(0) }, [query])

  const groups = useMemo(() => {
    const out = []
    const actions = filtered.filter((e) => e.kind === "action")
    const nav = filtered.filter((e) => e.kind === "nav")
    if (actions.length) out.push({ label: "Quick actions", items: actions })
    if (nav.length)     out.push({ label: "Go to",         items: nav })
    return out
  }, [filtered])

  const handleSelect = (entry) => {
    navigate(entry.path)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const entry = filtered[selectedIdx]
      if (entry) handleSelect(entry)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      style={{
        background: "rgba(15,23,42,.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        fontFamily: "var(--sf-font-ui)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-[14px] overflow-hidden flex flex-col"
        style={{
          background: "var(--sf-panel)",
          border: "1px solid var(--sf-border-soft)",
          boxShadow: "var(--sf-shadow-l)",
          maxHeight: "calc(100vh - 160px)",
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--sf-border-soft)]">
          <Search size={16} className="text-[var(--sf-ink-3)] flex-shrink-0" strokeWidth={1.85} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search jobs, customers, or jump to…"
            className="flex-1 bg-transparent outline-none border-none text-[14px] text-[var(--sf-ink)] placeholder:text-[var(--sf-ink-3)]"
            style={{
              padding: 0,
              fontFamily: "var(--sf-font-ui)",
              boxShadow: "none",
            }}
          />
          <span
            className="px-[6px] py-[1px] rounded text-[10.5px] text-[var(--sf-ink-3)] bg-[var(--sf-panel-soft)] border border-[var(--sf-border-soft)] flex-shrink-0"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            esc
          </span>
        </div>

        {/* Results */}
        <div className="overflow-y-auto py-2">
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              No results
            </div>
          )}
          {groups.map((g) => {
            let runningIdx = filtered.findIndex((e) => g.items.includes(e))
            return (
              <div key={g.label} className="mb-2 last:mb-0">
                <div className="px-4 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--sf-ink-3)]">
                  {g.label}
                </div>
                <div>
                  {g.items.map((entry, i) => {
                    const idx = runningIdx + i
                    const isSel = idx === selectedIdx
                    const Icon = entry.icon
                    return (
                      <button
                        key={`${entry.kind}-${entry.label}`}
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2 text-left
                          ${isSel
                            ? "bg-[var(--sf-blue-soft)]"
                            : "bg-transparent"
                          }
                        `}
                      >
                        <Icon
                          size={15}
                          strokeWidth={isSel ? 2.1 : 1.85}
                          className={isSel ? "text-[var(--sf-blue-dark)]" : "text-[var(--sf-ink-3)]"}
                        />
                        <span
                          className={`
                            text-[13px] flex-1 truncate
                            ${isSel
                              ? "text-[var(--sf-blue-dark)] font-semibold"
                              : "text-[var(--sf-ink)] font-medium"
                            }
                          `}
                        >
                          {entry.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--sf-border-soft)] bg-[var(--sf-panel-alt)]">
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--sf-ink-3)]">
            <span
              className="px-[5px] py-[1px] rounded text-[10px] text-[var(--sf-ink-2)] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)]"
              style={{ fontFamily: "var(--sf-font-mono)" }}
            >
              ↑↓
            </span>
            navigate
          </span>
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--sf-ink-3)]">
            <span
              className="px-[5px] py-[1px] rounded text-[10px] text-[var(--sf-ink-2)] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)]"
              style={{ fontFamily: "var(--sf-font-mono)" }}
            >
              ⏎
            </span>
            select
          </span>
        </div>
      </div>
    </div>
  )
}

export default Spotlight
