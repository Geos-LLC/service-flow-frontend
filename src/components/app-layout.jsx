"use client"
import { useState, useEffect, useCallback } from "react"
import { Outlet } from "react-router-dom"
import Sidebar from "./sidebar"
import Topbar from "./topbar"
import Spotlight from "./spotlight"
import MobileBottomNav from "./mobile-bottom-nav"
import { useAuth } from "../context/AuthContext"
import { teamAPI } from "../services/api"

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const { user } = useAuth()
  const [teamMembers, setTeamMembers] = useState([])

  // Fetch team members for MobileBottomNav
  useEffect(() => {
    if (user?.id) {
      const fetchTeamMembers = async () => {
        try {
          const teamResponse = await teamAPI.getAll(user.id, { page: 1, limit: 1000 })
          const members = teamResponse.teamMembers || teamResponse || []
          setTeamMembers(members)
        } catch (error) {
          console.error('Error fetching team members:', error)
          setTeamMembers([])
        }
      }
      fetchTeamMembers()
    }
  }, [user?.id])

  // Global ⌘K / Ctrl+K opens Spotlight
  const openSpotlight = useCallback(() => setSpotlightOpen(true), [])
  const closeSpotlight = useCallback(() => setSpotlightOpen(false), [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Skip if the user is typing in an input/textarea AND the focused element
        // isn't the spotlight itself (the spotlight input handles its own keys).
        const tag = (e.target?.tagName || "").toLowerCase()
        const inEditable = tag === "input" || tag === "textarea" || e.target?.isContentEditable
        if (inEditable && !spotlightOpen) {
          // still let users open spotlight from anywhere
        }
        e.preventDefault()
        setSpotlightOpen((v) => !v)
      } else if (e.key === "Escape" && spotlightOpen) {
        setSpotlightOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [spotlightOpen])

  return (
    <div className="min-h-screen bg-[var(--sf-bg-page)] flex">
      {/* Sidebar - Hidden on mobile, shown on desktop */}
      <div className="hidden md:block">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenSpotlight={openSpotlight}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 md:ml-20 lg:ml-[236px] flex flex-col">
        {/* Global desktop topbar */}
        <Topbar
          onOpenSpotlight={openSpotlight}
          onOpenMobileSidebar={() => setSidebarOpen(true)}
        />

        {/* Page Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>

      {/* Bottom Navigation - For all users on mobile */}
      <MobileBottomNav teamMembers={teamMembers} />

      {/* Spotlight ⌘K overlay */}
      {spotlightOpen && <Spotlight onClose={closeSpotlight} />}
    </div>
  )
}

export default AppLayout
