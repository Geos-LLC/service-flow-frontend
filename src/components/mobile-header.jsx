"use client"

import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { getImageUrl } from "../utils/imageUtils"

const MobileHeader = ({ pageTitle }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Determine if we're on dashboard
  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard'

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!user) return 'Z'
    const firstName = user.first_name || user.firstName || ''
    const lastName = user.last_name || user.lastName || ''
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    if (firstName) {
      return firstName[0].toUpperCase()
    }
    if (user.email) {
      return user.email[0].toUpperCase()
    }
    return 'Z'
  }

  // Get profile picture URL
  const getProfilePictureUrl = () => {
    if (!user) return null
    const profilePicture = user.profile_picture || user.profilePicture
    if (profilePicture) {
      return getImageUrl(profilePicture)
    }
    return null
  }

  // Handle avatar click - navigate to settings
  const handleAvatarClick = () => {
    navigate('/settings')
  }

  // Get business name (for dashboard) or page title (for other pages)
  const getDisplayName = () => {
    if (isDashboard) {
      // Dashboard: Show business name
      if (!user) return 'Zenbooker'
      return user.business_name || user.businessName || 'Zenbooker'
    } else {
      // Other pages: Show page title
      if (pageTitle) return pageTitle
      
      // Auto-detect page title from route
      const path = location.pathname
      if (path.includes('/schedule')) return 'Schedule'
      if (path.includes('/jobs')) return 'Jobs'
      if (path.includes('/opportunities') || path.includes('/opportunity/') || path.includes('/leads') || path.includes('/lead/')) return 'Opportunities'
      if (path.includes('/analytics')) return 'Analytics'
      if (path.includes('/calendar')) return 'My Availability'
      if (path.includes('/createjob')) return 'Create Job'
      if (path.includes('/customer')) return 'Customer'
      if (path.includes('/notifications')) return 'Notifications'
      
      return 'Zenbooker'
    }
  }

  const profilePictureUrl = getProfilePictureUrl()
  const [imageError, setImageError] = useState(false)

  // Reset image error when profile picture URL changes
  useEffect(() => {
    setImageError(false)
  }, [profilePictureUrl])

  return (
    <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center w-full max-w-full">
      {/* LEFT - Avatar (clickable, leads to settings) */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleAvatarClick}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 overflow-hidden"
          style={{ 
            backgroundColor: (profilePictureUrl && !imageError) ? 'transparent' : '#3B82F6'
          }}
        >
          {profilePictureUrl && !imageError ? (
            <img 
              src={profilePictureUrl} 
              alt={user?.first_name || user?.firstName || 'User'}
              className="w-full h-full rounded-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="text-white font-semibold text-xs">{getUserInitials()}</span>
          )}
        </button>
      </div>

      {/* MIDDLE - Business Name (dashboard) or Page Title (other pages) */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <span className="text-base font-semibold text-gray-800 truncate whitespace-nowrap text-center">
          {getDisplayName()}
        </span>
      </div>

      {/* RIGHT - Empty (spacer for centering) */}
      <div className="w-8 flex-shrink-0"></div>
    </div>
  )
}

export default MobileHeader