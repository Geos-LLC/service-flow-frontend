"use client"
import { useState, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import UserDropdown from "./user-dropdown"
import { useAuth } from "../context/AuthContext"
import { filterSidebarItems } from "../utils/roleUtils"
import {
  Home,
  Calendar,
  CalendarDays,
  Briefcase,
  FileText,
  RotateCcw,
  CreditCard,
  Users,
  UserCheck,
  Tag,
  BarChart3,
  Globe,
  Settings,
  X,
  Target,
  Receipt,
  MessageSquare,
  Search,
  ChevronDown,
  Wrench,
} from "lucide-react"

// Reorganized into 4 sections per the Service Blue redesign.
// `section` here is one of: today, customers, operations, system.
// `badge` is optional and rendered as a pill on the right of the item.
// `aliases` are extra path prefixes that should also highlight the item
// (e.g. detail screens — /job/:id keeps "Jobs" highlighted).
const ALL_SIDEBAR_ITEMS = [
  { icon: Home,            label: "Dashboard",      path: "/dashboard",      section: "today" },
  { icon: Calendar,        label: "Schedule",       path: "/schedule",       section: "today" },
  { icon: Briefcase,       label: "Jobs",           path: "/jobs",           section: "today", aliases: ["/job/"] },
  { icon: MessageSquare,   label: "Inbox",          path: "/communications", section: "today" },

  { icon: Users,           label: "Customers",      path: "/customers",      section: "customers", aliases: ["/customer/"] },
  { icon: Target,          label: "Leads",          path: "/leads",          section: "customers" },
  { icon: CalendarDays,    label: "Tasks",          path: "/calendar",       section: "customers" },

  { icon: UserCheck,       label: "Team",           path: "/team",           section: "operations", aliases: ["/team/"] },
  { icon: Receipt,         label: "Payroll",        path: "/payroll",        section: "operations" },
  { icon: Wrench,          label: "Services",       path: "/services",       section: "operations", aliases: ["/services/"], hidden: true },
  { icon: FileText,        label: "Estimates",      path: "/estimates",      section: "operations", hidden: true },
  { icon: FileText,        label: "Invoices",       path: "/invoices",       section: "operations", hidden: true },
  { icon: RotateCcw,       label: "Recurring",      path: "/recurring",      section: "operations", hidden: true },
  { icon: CreditCard,      label: "Payments",       path: "/payments",       section: "operations", hidden: true },
  { icon: Tag,             label: "Coupons",        path: "/coupons",        section: "operations", hidden: true },

  { icon: BarChart3,       label: "Analytics",      path: "/analytics",      section: "system" },
  { icon: Globe,           label: "Online Booking", path: "/online-booking", section: "system", hidden: true },
  { icon: Settings,        label: "Settings",       path: "/settings",       section: "system", aliases: ["/settings/"] },
]

const Sidebar = ({ isOpen, onClose, onOpenSpotlight }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const { user } = useAuth()

  const sidebarItems = useMemo(() => filterSidebarItems(ALL_SIDEBAR_ITEMS, user), [user])

  const SECTIONS = [
    { id: "today",      label: "Today" },
    { id: "customers",  label: "Customers" },
    { id: "operations", label: "Operations" },
    { id: "system",     label: "System" },
  ]

  const handleNavigation = (path) => {
    navigate(path)
    if (window.innerWidth < 1024) onClose()
  }

  const isItemActive = (item) => {
    if (location.pathname === item.path) return true
    if (item.aliases?.some((a) => location.pathname.startsWith(a))) return true
    return false
  }

  const renderNavItem = (item) => {
    const Icon = item.icon
    const active = isItemActive(item)

    return (
      <li key={item.path} className={item.hidden ? "feature-hidden" : ""}>
        <button
          onClick={() => handleNavigation(item.path)}
          className={`
            sf-nav-item group relative w-full flex items-center gap-3
            md:justify-center md:px-2 lg:justify-start lg:px-3
            py-[7px] rounded-[8px] text-[13px] font-medium
            transition-colors
            ${active
              ? "bg-[var(--sf-blue-soft)] text-[var(--sf-blue-dark)] font-semibold"
              : "text-[var(--sf-ink-2)] hover:bg-[var(--sf-panel-soft)] hover:text-[var(--sf-ink)]"
            }
          `}
        >
          <Icon
            className="flex-shrink-0"
            size={16}
            strokeWidth={active ? 2.1 : 1.85}
          />
          <span className="md:hidden lg:inline flex-1 text-left truncate">{item.label}</span>
          {item.badge !== undefined && item.badge !== null && (
            <span
              className={`
                md:hidden lg:inline-flex items-center justify-center
                min-w-[18px] h-[18px] px-[5px] rounded-[9px]
                text-[10.5px] font-semibold sf-tabular
                ${active
                  ? "bg-[var(--sf-blue)] text-white"
                  : "bg-[var(--sf-panel-soft)] text-[var(--sf-ink-2)]"
                }
              `}
            >
              {item.badge}
            </span>
          )}

          {/* Tooltip for collapsed (tablet) state */}
          <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-[var(--sf-ink)] text-white text-xs rounded-md opacity-0 invisible md:group-hover:opacity-100 md:group-hover:visible lg:opacity-0 lg:invisible transition-all duration-200 whitespace-nowrap z-50 shadow-lg pointer-events-none">
            {item.label}
          </div>
        </button>
      </li>
    )
  }

  const renderSection = (sectionId, label, isFirst) => {
    const items = sidebarItems.filter((it) => it.section === sectionId)
    if (items.length === 0) return null
    return (
      <div key={sectionId} className={isFirst ? "" : "mt-5"}>
        <div className="hidden lg:block px-3 mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--sf-ink-3)]">
          {label}
        </div>
        {/* Separator for collapsed tablet view to mark section breaks */}
        {!isFirst && <div className="md:block lg:hidden my-3 mx-2 border-t border-[var(--sf-border-soft)]" />}
        <ul className="space-y-0.5">
          {items.map(renderNavItem)}
        </ul>
      </div>
    )
  }

  const businessName = user?.business_name || user?.businessName || "Service Flow"
  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
    : user?.firstName?.charAt(0) || user?.email?.charAt(0) || "U"
  const userDisplayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.email || "User"
  const userRole = user?.role || "Owner"

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col
          w-[236px] md:w-20 lg:w-[236px]
          bg-[var(--sf-panel)] border-r border-[var(--sf-border-soft)]
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ fontFamily: "var(--sf-font-ui)" }}
      >
        {/* Mobile Close Button */}
        <div className="lg:hidden flex justify-end p-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] hover:bg-[var(--sf-panel-soft)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brand block */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={() => handleNavigation("/dashboard")}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-[var(--sf-panel-soft)] transition-colors"
          >
            <span
              className="flex-shrink-0 w-[30px] h-[30px] rounded-[8px] bg-[var(--sf-blue)] text-white flex items-center justify-center font-bold text-[13px]"
              style={{ letterSpacing: "-0.02em" }}
            >
              SF
            </span>
            <span className="hidden lg:flex flex-col min-w-0 flex-1 text-left">
              <span className="text-[13.5px] font-bold text-[var(--sf-ink)] leading-tight truncate" style={{ letterSpacing: "-0.01em" }}>
                ServiceFlow
              </span>
              <span className="text-[11px] text-[var(--sf-ink-3)] leading-tight truncate">
                {businessName}
              </span>
            </span>
            <ChevronDown size={13} className="hidden lg:block text-[var(--sf-ink-3)] flex-shrink-0" strokeWidth={2} />
          </button>
        </div>

        {/* ⌘K Search */}
        <div className="hidden lg:block px-3 pb-3">
          <button
            onClick={() => onOpenSpotlight?.()}
            className="w-full flex items-center gap-2 px-3 py-[7px] rounded-[8px] bg-[var(--sf-panel-alt)] border border-[var(--sf-border-soft)] text-[var(--sf-ink-3)] hover:text-[var(--sf-ink-2)] transition-colors"
          >
            <Search size={13} />
            <span className="flex-1 text-left text-[12.5px]">Search</span>
            <span
              className="px-[5px] py-[1px] rounded text-[10px] text-[var(--sf-ink-3)] bg-[var(--sf-panel)] border border-[var(--sf-border-soft)]"
              style={{ fontFamily: "var(--sf-font-mono)" }}
            >
              ⌘K
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto scrollbar-hide pb-3">
          {SECTIONS.map((s, idx) => renderSection(s.id, s.label, idx === 0))}
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-[var(--sf-border-soft)] relative">
          <button
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-[var(--sf-panel-soft)] transition-colors md:justify-center lg:justify-start"
          >
            <div className="w-7 h-7 bg-[var(--sf-blue)] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user?.profilePicture ? (
                <img
                  src={user.profilePicture}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = "none" }}
                />
              ) : (
                <span className="text-white font-semibold text-[11px]">
                  {userInitials}
                </span>
              )}
            </div>
            <div className="hidden lg:flex flex-col flex-1 min-w-0 text-left">
              <span className="text-[12.5px] font-semibold text-[var(--sf-ink)] truncate leading-tight">
                {userDisplayName}
              </span>
              <span className="text-[10.5px] text-[var(--sf-ink-3)] truncate leading-tight mt-0.5">
                {userRole}
              </span>
            </div>
            <ChevronDown size={13} className="hidden lg:block text-[var(--sf-ink-3)] flex-shrink-0" strokeWidth={2} />
          </button>

          <UserDropdown
            isOpen={isUserDropdownOpen}
            onClose={() => setIsUserDropdownOpen(false)}
            onToggle={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
          />
        </div>
      </aside>
    </>
  )
}

export default Sidebar
