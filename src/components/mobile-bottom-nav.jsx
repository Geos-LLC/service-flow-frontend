"use client"

import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { filterSidebarItems, isWorker } from "../utils/roleUtils"
import { getImageUrl } from "../utils/imageUtils"
import {
  Home,
  Briefcase,
  Calendar,
  CalendarDays,
  Bell,
  Menu,
  X,
  MessageSquare,
  FileText,
  RotateCw,
  CreditCard,
  Users,
  UserCheck,
  Wrench,
  Tag,
  MapPin,
  BarChart3,
  Globe,
  Settings,
  ChevronRight,
  LogOut,
  Clock,
  Target,
  Receipt,
} from "lucide-react"

const MobileBottomNav = ({ teamMembers = [] }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [showMoreOverlay, setShowMoreOverlay] = useState(false)
  const overlayRef = useRef(null)
  const isWorkerUser = isWorker(user)

  // Bottom nav items - always visible
  const bottomNavItems = isWorkerUser
    ? [
        { icon: Home, label: "Home", path: "/dashboard" },
        { icon: Briefcase, label: "Jobs", path: "/jobs" },
        { icon: Calendar, label: "Schedule", path: "/schedule" },
        { icon: Clock, label: "Availability", path: "/availability" },
        { icon: Bell, label: "Notifications", path: "/notifications" },
      ]
    : [
        { icon: Home, label: "Home", path: "/dashboard" },
        { icon: Briefcase, label: "Jobs", path: "/jobs" },
        { icon: Calendar, label: "Schedule", path: "/schedule" },
        { icon: Bell, label: "Notifications", path: "/notifications" },
      ]

  // All sidebar items
  const allSidebarItems = [
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: MessageSquare, label: "Requests", path: "/request" },
    { icon: Calendar, label: "Schedule", path: "/schedule" },
    { icon: CalendarDays, label: "Tasks", path: "/tasks" },
    { icon: Briefcase, label: "Jobs", path: "/jobs" },
    { icon: FileText, label: "Estimates", path: "/estimates", hidden: true },
    { icon: FileText, label: "Invoices", path: "/invoices", hidden: true },
    { icon: RotateCw, label: "Recurring", path: "/recurring" },
    { icon: CreditCard, label: "Payments", path: "/payments", hidden: true },
    { icon: Users, label: "Customers", path: "/customers" },
    { icon: Target, label: "Leads", path: "/leads" },
    { icon: MessageSquare, label: "Communications", path: "/communications" },
    { icon: UserCheck, label: "Team", path: "/team" },
    { icon: Receipt, label: "Payroll", path: "/payroll" },
    { icon: Wrench, label: "Services", path: "/services" },
    { icon: Tag, label: "Coupons", path: "/coupons", hidden: true },
    { icon: MapPin, label: "Territories", path: "/territories" },
    { icon: BarChart3, label: "Analytics", path: "/analytics", hidden: true },
    { icon: Globe, label: "Online Booking", path: "/online-booking", hidden: true },
    { icon: Settings, label: "Settings", path: "/settings" },
  ]

  // Filter sidebar items by role
  const filteredSidebarItems = filterSidebarItems(allSidebarItems, user)

  // Items already in bottom nav
  const bottomNavPaths = ['/dashboard', '/jobs', '/schedule']

  // Get remaining items not in bottom nav
  const remainingItems = filteredSidebarItems.filter(item => 
    !bottomNavPaths.includes(item.path) && !item.hidden
  )

  // Handle sign out
  const handleSignOut = () => {
    logout()
    navigate('/signin')
    setShowMoreOverlay(false)
  }

  // Get initials helper
  const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase()
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  // Check if route is active
  const isActive = (path) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard"
    }
    return location.pathname.startsWith(path)
  }

  // Handle navigation
  const handleNavigation = (path) => {
    navigate(path)
    setShowMoreOverlay(false)
  }

  // Close overlay when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (overlayRef.current && !overlayRef.current.contains(event.target)) {
        setShowMoreOverlay(false)
      }
    }

    if (showMoreOverlay) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMoreOverlay])

  // Get current user's team member data
  const currentUserTeamMember = user?.teamMemberId 
    ? teamMembers.find(member => member.id === user.teamMemberId)
    : null

  const userColor = currentUserTeamMember?.color || '#2563EB'
  const userFirstName = user?.firstName || user?.first_name || ''
  const userLastName = user?.lastName || user?.last_name || ''
  const userName = `${userFirstName} ${userLastName}`.trim() || user?.email || 'User'
  const userProfilePicture = user?.profilePicture || user?.profile_picture || null

  // Show "More" button for all users
  const showMoreButton = true

  return (
    <>
      <div className="lg:hidden fixed-bottom-nav bg-white border-t pb-4 border-[var(--sf-border-light)] z-[100] shadow-lg" style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)` }}>
        <div className="flex items-center justify-around py-3.5 px-2 safe-area-bottom">
          {bottomNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            
            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={`flex flex-col items-center space-y-1.5 px-2 py-1.5 flex-1 transition-colors ${
                  active 
                    ? 'text-[var(--sf-blue-500)]' 
                    : 'text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]'
                }`}
              >
                <Icon size={24} className={active ? 'text-[var(--sf-blue-500)]' : ''} />
                <span className={`text-[12px] font-medium ${active ? 'text-[var(--sf-blue-500)]' : 'text-[var(--sf-text-secondary)]'}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
          
          {/* More button - show only for non-workers */}
          {showMoreButton && !isWorkerUser && (
            <button
              onClick={() => setShowMoreOverlay(true)}
              className={`flex flex-col items-center space-y-1.5 px-2 py-1.5 flex-1 transition-colors ${
                showMoreOverlay
                  ? 'text-[var(--sf-blue-500)]' 
                  : 'text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]'
              }`}
            >
              <Menu size={24} className={showMoreOverlay ? 'text-[var(--sf-blue-500)]' : ''} />
              <span className={`text-[12px] font-medium ${showMoreOverlay ? 'text-[var(--sf-blue-500)]' : 'text-[var(--sf-text-secondary)]'}`}>
                More
              </span>
            </button>
          )}
        </div>
        {/* iOS home indicator spacer - ensures proper spacing on devices with home indicator */}
        <div 
          className="bg-white h-safe-area-inset-bottom" 
          style={{ 
            minHeight: 'max(8px, env(safe-area-inset-bottom, 8px))' // Minimum 8px padding even without safe area
          }} 
        />
      </div>

      {/* More Overlay - Mobile Only */}
      {showMoreOverlay && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-end justify-center"
          onClick={() => setShowMoreOverlay(false)}
        >
          <div 
            ref={overlayRef}
            className="bg-white rounded-t-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sf-border-light)] sticky top-0 bg-white z-10">
              <div className="flex items-center space-x-3">
                <img src="/logo.svg" alt="zenbooker" className="h-6" />
              </div>
              <button
                onClick={() => setShowMoreOverlay(false)}
                className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-[var(--sf-text-secondary)]" />
              </button>
            </div>
            
            {/* Account Section - Only show for non-workers */}
            {!isWorkerUser && (
              <div 
                className="px-6 py-4 border-b border-[var(--sf-border-light)] cursor-pointer hover:bg-[var(--sf-bg-hover)] transition-colors"
                onClick={() => {
                  navigate('/settings/account')
                  setShowMoreOverlay(false)
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: userProfilePicture ? 'transparent' : userColor }}
                    >
                      {userProfilePicture ? (
                        <img 
                          src={getImageUrl(userProfilePicture)} 
                          alt={userName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <span 
                        className={`text-white font-bold text-sm ${userProfilePicture ? 'hidden' : 'flex items-center justify-center'}`}
                      >
                        {getInitials(userName)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--sf-text-primary)]">
                        {user?.business_name || user?.businessName || user?.email || 'Business'}
                      </p>
                      <p className="text-xs text-[var(--sf-text-muted)]">Account Settings</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                </div>
              </div>
            )}
            
            {/* Menu Items */}
            <div className="py-2">
              {/* For workers, show Availability and Settings */}
              {isWorkerUser ? (
                <>
                  <button
                    onClick={() => handleNavigation('/availability')}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--sf-bg-hover)] transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-[var(--sf-text-secondary)]" />
                      <span className="text-sm font-medium text-[var(--sf-text-primary)]">Availability</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                  </button>
                  <button
                    onClick={() => handleNavigation('/settings')}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--sf-bg-hover)] transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Settings className="w-5 h-5 text-[var(--sf-text-secondary)]" />
                      <span className="text-sm font-medium text-[var(--sf-text-primary)]">Settings</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                  </button>
                </>
              ) : (
                <>
                  {remainingItems.map((item, index) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={index}
                        onClick={() => handleNavigation(item.path)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--sf-bg-hover)] transition-colors text-left"
                      >
                        <div className="flex items-center space-x-3">
                          <Icon className="w-5 h-5 text-[var(--sf-text-secondary)]" />
                          <span className="text-sm font-medium text-[var(--sf-text-primary)]">{item.label}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      </button>
                    )
                  })}
                  {/* Availability for all users - use mobile view */}
                  <button
                    onClick={() => handleNavigation('/availability')}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--sf-bg-hover)] transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Clock className="w-5 h-5 text-[var(--sf-text-secondary)]" />
                      <span className="text-sm font-medium text-[var(--sf-text-primary)]">Availability</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
                  </button>
                </>
              )}
              
              {/* Sign Out Button - Show for all users */}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--sf-bg-hover)] transition-colors text-left border-t border-[var(--sf-border-light)] mt-2"
              >
                <div className="flex items-center space-x-3">
                  <LogOut className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Sign Out</span>
                </div>
                <ChevronRight className="w-5 h-5 text-[var(--sf-text-muted)]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default MobileBottomNav

