"use client"
import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  Search,
  HelpCircle,
  Bell,
  Plus,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Users,
  Target,
  FileText,
  Receipt,
  CalendarDays,
  MessageSquare,
  MapPin,
  Check,
} from "lucide-react"
import { useLocationScope } from "../context/LocationContext"

/**
 * Global desktop topbar (49px). Renders ServiceFlow breadcrumb on the
 * left, a ⌘K spotlight trigger center-right, and a Help/Bell/+Create
 * cluster on the right.
 *
 * Hidden below md — mobile-header.jsx handles small screens.
 */

// Map first path segment → human label for the breadcrumb.
const PATH_LABELS = {
  dashboard: "Dashboard",
  schedule: "Schedule",
  jobs: "Jobs",
  job: "Job detail",
  customers: "Customers",
  customer: "Customer detail",
  leads: "Leads",
  calendar: "Tasks",
  communications: "Inbox",
  estimates: "Estimates",
  invoices: "Invoices",
  recurring: "Recurring",
  payments: "Payments",
  team: "Team",
  payroll: "Payroll",
  services: "Services",
  coupons: "Coupons",
  territories: "Territories",
  analytics: "Analytics",
  "online-booking": "Online booking",
  settings: "Settings",
  "create-job": "Create job",
  createjob: "Create job",
  "add-team-member": "Add team member",
  notifications: "Notifications",
  help: "Help",
  "whats-new": "What's new",
}

const QUICK_ACTIONS = [
  { id: "job",      label: "Job",      icon: Briefcase,     path: "/createjob" },
  { id: "customer", label: "Customer", icon: Users,         path: "/customers?new=1" },
  { id: "lead",     label: "Lead",     icon: Target,        path: "/leads?new=1" },
  { id: "estimate", label: "Estimate", icon: FileText,      path: "/estimates?new=1" },
  { id: "invoice",  label: "Invoice",  icon: Receipt,       path: "/invoices?new=1" },
  { id: "task",     label: "Task",     icon: CalendarDays,  path: "/calendar?new=1" },
  { id: "message",  label: "Message",  icon: MessageSquare, path: "/communications?new=1" },
]

const Topbar = ({ onOpenSpotlight, onOpenMobileSidebar }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [createOpen, setCreateOpen] = useState(false)
  const createRef = useRef(null)

  // Close +Create dropdown on outside click
  useEffect(() => {
    if (!createOpen) return
    const onClick = (e) => {
      if (createRef.current && !createRef.current.contains(e.target)) {
        setCreateOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [createOpen])

  // Build breadcrumb segments from current pathname
  const segments = location.pathname.split("/").filter(Boolean)
  const firstSeg = segments[0] || "dashboard"
  const currentLabel = PATH_LABELS[firstSeg] || firstSeg.charAt(0).toUpperCase() + firstSeg.slice(1)
  // If a second segment exists and is non-numeric, label it too
  const secondSeg = segments[1]
  const secondLabel = secondSeg && PATH_LABELS[secondSeg]

  return (
    <header
      className="hidden md:flex items-center gap-3 px-4 lg:px-5 bg-[var(--sf-panel)] border-b border-[var(--sf-border-soft)]"
      style={{ height: 49, fontFamily: "var(--sf-font-ui)" }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 min-w-0 flex-shrink">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-[12.5px] font-medium text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] transition-colors whitespace-nowrap"
        >
          ServiceFlow
        </button>
        <ChevronRight size={12} className="text-[var(--sf-ink-4)] flex-shrink-0" strokeWidth={2} />
        <span className="text-[12.5px] font-semibold text-[var(--sf-ink)] truncate">
          {currentLabel}
        </span>
        {secondLabel && (
          <>
            <ChevronRight size={12} className="text-[var(--sf-ink-4)] flex-shrink-0" strokeWidth={2} />
            <span className="text-[12.5px] font-medium text-[var(--sf-ink-2)] truncate">
              {secondLabel}
            </span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Location switcher pill */}
      <LocationPill />

      {/* ⌘K Spotlight trigger — desktop only */}
      <button
        onClick={() => onOpenSpotlight?.()}
        className="hidden lg:flex items-center gap-2 px-3 py-[6px] rounded-[8px] bg-[var(--sf-panel-alt)] border border-[var(--sf-border-soft)] text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] hover:bg-[var(--sf-panel-soft)] transition-colors"
        style={{ width: 280 }}
      >
        <Search size={13} />
        <span className="flex-1 text-left text-[12.5px]">Search jobs, customers…</span>
        <span
          className="px-[5px] py-[1px] rounded text-[10px] text-[var(--sf-ink-3)] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)]"
          style={{ fontFamily: "var(--sf-font-mono)" }}
        >
          ⌘K
        </span>
      </button>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => navigate("/help")}
          aria-label="Help"
          className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] hover:bg-[var(--sf-panel-soft)] transition-colors"
        >
          <HelpCircle size={16} strokeWidth={1.85} />
        </button>

        <button
          onClick={() => navigate("/notifications")}
          aria-label="Notifications"
          className="relative w-8 h-8 flex items-center justify-center rounded-[8px] text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] hover:bg-[var(--sf-panel-soft)] transition-colors"
        >
          <Bell size={16} strokeWidth={1.85} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--sf-red)]" />
        </button>

        {/* +Create dropdown */}
        <div className="relative ml-1" ref={createRef}>
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-[7px] rounded-[8px] bg-[var(--sf-blue)] text-white text-[12.5px] font-semibold hover:bg-[var(--sf-blue-dark)] transition-colors"
            style={{ boxShadow: "0 1px 2px rgba(37,99,235,.3)" }}
          >
            <Plus size={14} strokeWidth={2.4} />
            <span>Create</span>
            <ChevronDown size={12} strokeWidth={2.4} />
          </button>

          {createOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-56 rounded-[10px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] py-1.5 z-50"
              style={{ boxShadow: "var(--sf-shadow-l)" }}
            >
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setCreateOpen(false)
                      navigate(a.path)
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12.5px] font-medium text-[var(--sf-ink-2)] hover:bg-[var(--sf-panel-soft)] hover:text-[var(--sf-ink)] transition-colors"
                  >
                    <Icon size={14} strokeWidth={1.85} className="text-[var(--sf-ink-3)]" />
                    <span>{a.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ── Location switcher pill ─────────────────────────────────

const LocationPill = () => {
  const { locationId, setLocationId, locations, loading, selectedLocation } = useLocationScope()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  // Hide when the user has no locations defined — the switcher is
  // meaningless without at least one to choose from.
  if (!loading && locations.length === 0) return null

  const label = locationId === "all" ? "All locations" : (selectedLocation?.name || "Location")
  const dotColor = locationId === "all"
    ? "var(--sf-ink-3)"
    : (selectedLocation?.color || "var(--sf-blue)")

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-[6px] rounded-[8px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] text-[var(--sf-ink-2)] hover:bg-[var(--sf-panel-soft)] transition-colors"
        style={{ fontFamily: "var(--sf-font-ui)" }}
      >
        {locationId === "all" ? (
          <MapPin size={13} strokeWidth={1.85} className="text-[var(--sf-ink-3)]" />
        ) : (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        )}
        <span className="text-[12.5px] font-semibold text-[var(--sf-ink)] max-w-[160px] truncate">
          {label}
        </span>
        <ChevronDown size={12} strokeWidth={2} className="text-[var(--sf-ink-3)] flex-shrink-0" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-[260px] rounded-[10px] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)] py-1.5 z-50 max-h-[60vh] overflow-y-auto"
          style={{ boxShadow: "var(--sf-shadow-l)" }}
        >
          <button
            onClick={() => { setLocationId("all"); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12.5px] font-medium hover:bg-[var(--sf-panel-soft)] transition-colors"
            style={{
              color: locationId === "all" ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
              background: locationId === "all" ? "var(--sf-blue-soft)" : "transparent",
            }}
          >
            <MapPin size={13} strokeWidth={1.85} className="text-[var(--sf-ink-3)]" />
            <span className="flex-1 text-left">All locations</span>
            {locationId === "all" && <Check size={13} strokeWidth={2.4} className="text-[var(--sf-blue-dark)]" />}
          </button>
          {locations.length > 0 && (
            <div className="my-1 border-t border-[var(--sf-border-soft)]" />
          )}
          {locations.map((loc) => {
            const sel = String(loc.id) === String(locationId)
            return (
              <button
                key={loc.id}
                onClick={() => { setLocationId(loc.id); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-[7px] text-[12.5px] font-medium hover:bg-[var(--sf-panel-soft)] transition-colors"
                style={{
                  color: sel ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
                  background: sel ? "var(--sf-blue-soft)" : "transparent",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: loc.color || "var(--sf-blue)" }}
                />
                <span className="flex-1 text-left truncate">{loc.name}</span>
                {sel && <Check size={13} strokeWidth={2.4} className="text-[var(--sf-blue-dark)]" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Topbar
