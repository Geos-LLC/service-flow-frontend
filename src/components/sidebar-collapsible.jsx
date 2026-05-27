"use client"
import { useState, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import UserDropdown from "./user-dropdown"
import { useAuth } from "../context/AuthContext"
import { filterSidebarItems, getUserRole } from "../utils/roleUtils"
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
  Wrench,
  Tag,
  MapPin,
  BarChart3,
  Globe,
  Settings,
  X,
  Target,
  Receipt,
} from "lucide-react"

const Sidebar = ({ isOpen, onClose, forceCollapsed = false }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  const { user } = useAuth()
  console.log('🔍 Sidebar: Current user data:', user)

  const allSidebarItems = [
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: Target, label: "Leads", path: "/leads" },
    { icon: CalendarDays, label: "Tasks", path: "/tasks" },
    { icon: Users, label: "Customers", path: "/customers" },
    { icon: Briefcase, label: "Jobs", path: "/jobs" },
    { icon: Calendar, label: "Schedule", path: "/schedule" },
    { icon: FileText, label: "Estimates", path: "/estimates", hidden: true },
    { icon: FileText, label: "Invoices", path: "/invoices", hidden: true },
    { icon: RotateCcw, label: "Recurring", path: "/recurring", hidden: true },
    { icon: CreditCard, label: "Payments", path: "/payments", hidden: true },
    { icon: UserCheck, label: "Team", path: "/team" },
    { icon: Receipt, label: "Payroll", path: "/payroll" },
    { icon: Tag, label: "Coupons", path: "/coupons", hidden: true },
    { icon: BarChart3, label: "Analytics", path: "/analytics", hidden: true },
    { icon: Globe, label: "Online Booking", path: "/online-booking", hidden: true },
    { icon: Settings, label: "Settings", path: "/settings" },
  ]

  // Filter sidebar items based on user role
  const sidebarItems = useMemo(() => {
    return filterSidebarItems(allSidebarItems, user)
  }, [user])


  const handleNavigation = (path) => {
    navigate(path)
    // Close sidebar on mobile when item is clicked
    if (window.innerWidth < 1024) {
      onClose()
    }
  }

  return (
    <>
      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <div
        className={`
        fixed inset-y-0 left-0 z-40 ${forceCollapsed ? 'w-20' : 'w-64 md:w-20 lg:w-64 xl:w-72'} bg-white border-r border-gray-200 
        transform transition-all duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        flex flex-col shadow-lg
      `}
      >
        {/* Mobile Close Button */}
        <div className="lg:hidden flex justify-end p-4">
          <button onClick={onClose} className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Logo */}
        <div className={`p-4 border-b border-gray-200 ${forceCollapsed ? 'flex justify-center' : 'md:flex md:justify-center lg:justify-start'}`}>
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleNavigation("/dashboard")}>
           <img src="/logo.svg" alt="ServiceFlow Logo" className={`${forceCollapsed ? 'w-8' : 'md:w-8 lg:w-auto'}`} />
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${forceCollapsed ? 'p-4 px-2' : 'p-4 md:px-2 lg:p-4'} overflow-y-auto scrollbar-hide`}>
          <ul className="space-y-1">
            {sidebarItems.map((item, index) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path || (item.path === "/settings" && location.pathname.startsWith("/settings"))
              
              return (
                <li key={index} className={item.hidden ? "feature-hidden" : ""}>
                  <button
                    onClick={() => handleNavigation(item.path)}
                    className={`w-full flex items-center ${forceCollapsed ? 'justify-center' : 'space-x-3 md:justify-center lg:justify-start'} px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left group relative ${
                      isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className={forceCollapsed ? 'hidden' : 'md:hidden lg:inline'}>{item.label}</span>
                    
                    {/* Tooltip for collapsed state */}
                    <div className={`absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 invisible ${forceCollapsed ? 'group-hover:opacity-100 group-hover:visible' : 'md:group-hover:opacity-100 md:group-hover:visible lg:opacity-0 lg:invisible'} transition-all duration-200 whitespace-nowrap z-50`}>
                      {item.label}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-gray-200 relative">
          {/* Debug: Log user object to see what fields are available */}
          {user && (
            <div className="hidden">
              {console.log('🔍 Sidebar: User object:', user)}
              {console.log('🔍 Sidebar: Profile picture field:', user.profilePicture)}
            </div>
          )}
          
          <button
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className={`w-full flex items-center ${forceCollapsed ? 'justify-center' : 'space-x-3 md:justify-center lg:justify-start'} hover:bg-gray-50 rounded-lg p-2 transition-colors`}
          >
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user?.profilePicture ? (
                <img 
                  src={user.profilePicture} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error('Failed to load profile picture in sidebar:', user.profilePicture);
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-white font-medium text-sm">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
                    : user?.firstName?.charAt(0) || user?.email?.charAt(0) || 'U'
                  }
                </span>
              )}
            </div>
            <div className={`flex-1 min-w-0 text-left ${forceCollapsed ? 'hidden' : 'md:hidden lg:block'}`}>
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user?.firstName || user?.email || 'User'
                }
              </p>
              <p className="text-xs text-gray-500 truncate">
                {(() => {
                  const businessName = user?.business_name || user?.businessName || user?.email || 'Business';
                  console.log('🔍 Sidebar: Displaying business name:', businessName, 'from fields:', {
                    business_name: user?.business_name,
                    businessName: user?.businessName,
                    email: user?.email
                  });
                  return businessName;
                })()}
              </p>
            </div>
          </button>
          
          <UserDropdown
            isOpen={isUserDropdownOpen}
            onClose={() => setIsUserDropdownOpen(false)}
            onToggle={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
          />
        </div>
      </div>
    </>
  )
}

export default Sidebar