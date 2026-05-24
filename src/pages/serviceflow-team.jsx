import { useState, useEffect } from "react"
import Sidebar from "../components/sidebar"
import { Plus, Search, Filter, Users, TrendingUp, Calendar, DollarSign, Clock, Eye, Edit, Trash2, UserPlus, BarChart3, AlertCircle, MapPin, Loader2, Power, PowerOff, Zap, Settings, ChevronLeft, ChevronRight, HelpCircle, EyeOff, Mail } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { teamAPI } from "../services/api"
import { isAccountOwner } from "../utils/roleUtils"
import api from "../services/api"
import LoadingButton from "../components/loading-button"
import AddTeamMemberModal from "../components/add-team-member-modal"
import AssignTerritoriesModal from "../components/assign-territories-modal"
import { useNavigate } from "react-router-dom"
import { handleTeamDeletionError, createErrorNotification, createSuccessNotification } from "../utils/errorHandler"
import { getImageUrl } from "../utils/imageUtils"
import MobileHeader from "../components/mobile-header"

// Placeholder card for the design-pack Team tabs (Teams, Schedule,
// Payroll, Performance). The design pack ships a full implementation
// for each; this stub explains what's coming and offers a sensible
// shortcut to existing functionality.
const TeamDesignPlaceholder = ({ title, body, primary, secondary }) => (
  <div className="px-4 sm:px-6 py-10 sm:py-16 text-center">
    <div
      className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl"
      style={{
        width: 64,
        height: 64,
        background: 'rgba(37,99,235,0.10)',
        color: '#2563EB',
      }}
    >
      <Users className="w-7 h-7" />
    </div>
    <h3 className="text-base sm:text-lg font-semibold text-[var(--sf-text-primary)] mb-2">{title}</h3>
    <p className="text-sm text-[var(--sf-text-secondary)] mx-auto mb-5" style={{ maxWidth: 480, lineHeight: 1.55 }}>
      {body}
    </p>
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {primary && (
        <button
          onClick={primary.onClick}
          className="sf-btn-primary inline-flex items-center px-4 py-2 text-sm font-medium"
        >
          {primary.label}
        </button>
      )}
      {secondary && (
        <button
          onClick={secondary.onClick}
          className="inline-flex items-center px-4 py-2 text-sm font-medium border border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] rounded-lg bg-white hover:bg-[var(--sf-bg-hover)]"
        >
          {secondary.label}
        </button>
      )}
    </div>
  </div>
)

const ServiceFlowTeam = () => {
  const { user, loading: authLoading } = useAuth()
  console.log('Current user:', user)
  console.log('Auth loading:', authLoading)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("active")
  const [selectedMember, setSelectedMember] = useState(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState(null)
  const [showActivationModal, setShowActivationModal] = useState(false)
  const [activationLoading, setActivationLoading] = useState(false)
  const [memberToToggle, setMemberToToggle] = useState(null)
  const [showResendModal, setShowResendModal] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [memberToResend, setMemberToResend] = useState(null)
  const [territoriesMember, setTerritoriesMember] = useState(null) // member whose territories are being edited
  const [notification, setNotification] = useState(null)
  const [deleteError, setDeleteError] = useState("")
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)
  const [deletableMembersCount, setDeletableMembersCount] = useState(0)

  // API State
  const [teamMembers, setTeamMembers] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filters, setFilters] = useState({
    status: "",
    search: "",
    sortBy: "first_name",
    sortOrder: "ASC"
  })
  const [staffLocationsEnabled, setStaffLocationsEnabled] = useState(true)
  const [updatingLocationSetting, setUpdatingLocationSetting] = useState(false)

  const navigate = useNavigate()

  // Initial data fetch - wait for auth to load
  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchTeamMembers()
    } else if (!authLoading && !user?.id) {
      // Redirect to signin if no user after auth has loaded
      navigate('/signin')
    }
  }, [authLoading, user?.id])

  // Debounced search
  useEffect(() => {
    if (!authLoading && user?.id) {
      const timeoutId = setTimeout(() => {
        fetchTeamMembers()
      }, 300)

      return () => clearTimeout(timeoutId)
    }
  }, [authLoading, user?.id, filters.status, filters.search, filters.sortBy, filters.sortOrder])

  useEffect(() => {
    if (activeTab === "analytics" && !authLoading && user?.id) {
      fetchAnalytics()
    }
  }, [activeTab, authLoading, user?.id])

  useEffect(() => {
    if (user?.id && isAccountOwner(user)) {
      fetchStaffLocationsSetting()
    }
  }, [user])

  const fetchStaffLocationsSetting = async () => {
    try {
      const response = await api.get('/user/staff-locations-setting')
      setStaffLocationsEnabled(response.data?.staff_locations_enabled !== false) // Default to true
    } catch (error) {
      console.error('Error fetching staff locations setting:', error)
      console.error('Error details:', error.response?.status, error.response?.data)
      // Default to enabled if error (404 means endpoint doesn't exist yet, so default to enabled)
      setStaffLocationsEnabled(true)
    }
  }

  const handleToggleStaffLocations = async () => {
    if (!isAccountOwner(user)) return
    
    setUpdatingLocationSetting(true)
    try {
      const newValue = !staffLocationsEnabled
      const response = await api.put('/user/staff-locations-setting', { staff_locations_enabled: newValue })
      setStaffLocationsEnabled(newValue)
      setNotification({
        type: 'success',
        message: newValue ? 'Staff locations are now visible' : 'Staff locations are now hidden globally'
      })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Error updating staff locations setting:', error)
      console.error('Error details:', error.response?.status, error.response?.data)
      setNotification({
        type: 'error',
        message: error.response?.data?.error || 'Failed to update setting. Please try again.'
      })
      setTimeout(() => setNotification(null), 5000)
    } finally {
      setUpdatingLocationSetting(false)
    }
  }

  const fetchTeamMembers = async () => {
    console.log('Fetching team members for user:', user?.id)
    if (!user?.id) {
      console.log('No user ID found, skipping fetch')
      return
    }

    try {
      setLoading(true)
      setError("")

      // limit:1000 matches schedule page — listing is filtered client-side, so we
      // need every row up front. Previous limit:50 dropped null-role rows past the
      // first page (no stable tiebreaker on the backend's ORDER BY role ASC), making
      // active members like "Georgiy Team Member" silently disappear from the UI.
      console.log('Calling teamAPI.getAll with params:', {
        userId: user.id,
        status: filters.status,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: 1,
        limit: 1000
      })

      const response = await teamAPI.getAll(user.id, {
        status: filters.status,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: 1,
        limit: 1000
      })

      console.log('Team API response:', response)
      setTeamMembers(response.teamMembers || [])
    } catch (error) {
      console.error('Error fetching team members:', error)
      setError("Failed to load team members. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError("")

      const response = await teamAPI.getAnalytics(user.id)
      setAnalytics(response)
    } catch (error) {
      console.error('Error fetching analytics:', error)
      setError("Failed to load analytics. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = () => {
    setIsAddModalOpen(true)
  }

  const handleMemberAdded = () => {
    fetchTeamMembers()
  }

  const handleEditMember = (member) => {
    // For account owner, navigate to account settings instead
    if (member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') {
      navigate('/settings/account')
      return
    }
    setSelectedMember(member)
    setIsEditModalOpen(true)
  }

  const handleViewMember = (member) => {
    // Navigate to team member details page for all members including account owner
    navigate(`/team/${member.id}`)
  }

  const handleDeleteMember = (member) => {
    // Prevent deleting account owner
    if (member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') {
      setNotification({
        type: 'error',
        message: 'Cannot delete account owner'
      })
      setTimeout(() => setNotification(null), 5000)
      return
    }
    setMemberToDelete(member)
    setShowDeleteModal(true)
  }

  const confirmDeleteMember = async () => {
    if (!memberToDelete) return

    try {
      setDeleteLoading(true)
      setDeleteError("")
      console.log('Deleting team member:', memberToDelete.id)
      const response = await teamAPI.delete(memberToDelete.id)
      console.log('Delete response:', response)

      setNotification(createSuccessNotification(
        `Team member ${memberToDelete.first_name} ${memberToDelete.last_name} has been deleted successfully.`
      ))

      setShowDeleteModal(false)
      setMemberToDelete(null)
      setDeleteError("") // Clear any previous errors
      fetchTeamMembers()

      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Error deleting team member:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)

      const errorInfo = handleTeamDeletionError(error)
      const errorMessage = errorInfo.message || 
                          error.response?.data?.userMessage || 
                          error.response?.data?.error || 
                          'Failed to delete team member. Please try again.'
      
      setDeleteError(errorMessage)

      console.log('Error details:', {
        type: errorInfo.type,
        status: errorInfo.status,
        details: errorInfo.details,
        message: errorMessage,
        userMessage: error.response?.data?.userMessage
      })
      
      // Keep modal open so user can see the error
      // Don't close the modal on error
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteAll = async () => {
    try {
      // Fetch all team members to get accurate count
      const response = await teamAPI.getAll(user.id, {
        status: "", // No status filter - get all
        search: "", // No search filter - get all
        sortBy: "first_name",
        sortOrder: "ASC",
        page: 1,
        limit: 1000 // High limit to get all members
      })
      const allMembers = response.teamMembers || response || []
      
      // Check if there are any deletable members (exclude account owners)
      const deletableMembers = allMembers.filter(member => 
        !(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin')
      )
      
      if (deletableMembers.length === 0) {
        setNotification({
          type: 'error',
          message: 'No team members can be deleted. Account owners cannot be deleted.'
        })
        setTimeout(() => setNotification(null), 5000)
        return
      }
      
      setDeletableMembersCount(deletableMembers.length)
      setShowDeleteAllModal(true)
    } catch (error) {
      console.error('Error fetching team members for delete all:', error)
      setNotification({
        type: 'error',
        message: 'Failed to load team members. Please try again.'
      })
      setTimeout(() => setNotification(null), 5000)
    }
  }

  const confirmDeleteAll = async () => {
    try {
      setDeleteAllLoading(true)
      
      // Fetch ALL team members (without filters) to ensure we delete everything
      let allMembers = []
      try {
        const response = await teamAPI.getAll(user.id, {
          status: "", // No status filter - get all
          search: "", // No search filter - get all
          sortBy: "first_name",
          sortOrder: "ASC",
          page: 1,
          limit: 1000 // High limit to get all members
        })
        allMembers = response.teamMembers || response || []
      } catch (error) {
        console.error('Error fetching all team members:', error)
        setNotification({
          type: 'error',
          message: 'Failed to fetch team members. Please try again.'
        })
        setShowDeleteAllModal(false)
        setTimeout(() => setNotification(null), 5000)
        return
      }
      
      // Get all deletable members (exclude account owners)
      const deletableMembers = allMembers.filter(member => 
        !(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin')
      )
      
      if (deletableMembers.length === 0) {
        setNotification({
          type: 'error',
          message: 'No team members can be deleted. Account owners cannot be deleted.'
        })
        setShowDeleteAllModal(false)
        setTimeout(() => setNotification(null), 5000)
        return
      }

      // Delete all members one by one
      let successCount = 0
      let errorCount = 0
      const errorMessages = []
      
      for (const member of deletableMembers) {
        try {
          await teamAPI.delete(member.id)
          successCount++
        } catch (error) {
          console.error(`Error deleting team member ${member.id}:`, error)
          errorCount++
          
          // Extract error message for this specific member
          const errorInfo = handleTeamDeletionError(error)
          const memberName = `${member.first_name} ${member.last_name}`
          errorMessages.push(`${memberName}: ${errorInfo.message}`)
        }
      }

      setShowDeleteAllModal(false)
      
      if (successCount > 0 && errorCount === 0) {
        setNotification(createSuccessNotification(
          `${successCount} team member(s) have been deleted successfully.`
        ))
      } else if (successCount > 0 && errorCount > 0) {
        // Some succeeded, some failed
        const errorSummary = errorMessages.slice(0, 3).join('; ')
        const moreErrors = errorCount > 3 ? ` and ${errorCount - 3} more` : ''
        setNotification({
          type: 'error',
          message: `${successCount} deleted, ${errorCount} failed: ${errorSummary}${moreErrors}`
        })
      } else {
        // All failed
        const errorSummary = errorMessages.slice(0, 3).join('; ')
        const moreErrors = errorCount > 3 ? ` and ${errorCount - 3} more` : ''
        setNotification({
          type: 'error',
          message: `Failed to delete team members: ${errorSummary}${moreErrors}`
        })
      }

      fetchTeamMembers()
      setTimeout(() => setNotification(null), errorCount > 0 ? 8000 : 3000)
    } catch (error) {
      console.error('Error deleting all team members:', error)
      const errorInfo = handleTeamDeletionError(error)
      setNotification({
        type: 'error',
        message: errorInfo.message || 'An error occurred while deleting team members. Please try again.'
      })
      setTimeout(() => setNotification(null), 5000)
    } finally {
      setDeleteAllLoading(false)
    }
  }

  const handleMemberUpdate = () => {
    fetchTeamMembers()
    setIsEditModalOpen(false)
    setSelectedMember(null)
  }

  const handleResendInvite = (member) => {
    setMemberToResend(member)
    setShowResendModal(true)
  }

  const confirmResendInvite = async () => {
    if (!memberToResend) return

    try {
      setResendLoading(true)
      await teamAPI.resendInvite(memberToResend.id)
      setShowResendModal(false)
      setMemberToResend(null)
      setNotification({
        type: 'success',
        message: 'Invitation resent successfully!'
      })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Error resending invite:', error)
      setNotification({
        type: 'error',
        message: 'Failed to resend invitation. Please try again.'
      })
      setTimeout(() => setNotification(null), 5000)
    } finally {
      setResendLoading(false)
    }
  }

  const handleToggleActivation = async (member) => {
    // Prevent deactivating account owner
    if (member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') {
      setNotification({
        type: 'error',
        message: 'Cannot deactivate account owner'
      })
      setTimeout(() => setNotification(null), 5000)
      return
    }
    setMemberToToggle(member)
    setShowActivationModal(true)
  }

  const confirmToggleActivation = async () => {
    if (!memberToToggle) return

    try {
      setActivationLoading(true)
      const newStatus = memberToToggle.status === 'active' ? 'inactive' : 'active';
      await teamAPI.update(memberToToggle.id, { status: newStatus });
      fetchTeamMembers();
      setShowActivationModal(false)
      setMemberToToggle(null)
      setNotification({
        type: 'success',
        message: `${memberToToggle.first_name} ${memberToToggle.last_name} has been ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully.`
      })
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Error toggling team member activation:', error);
      setError("Failed to update team member status.");
    } finally {
      setActivationLoading(false)
    }
  }

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      case 'invited':
        return 'bg-blue-100 text-[var(--sf-blue-500)]'
      case 'inactive':
        return 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
      case 'on_leave':
        return 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
      default:
        return 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':
        return 'ACTIVATED'
      case 'pending':
        return 'PENDING'
      case 'invited':
        return 'INVITED'
      case 'inactive':
        return 'INACTIVE'
      case 'on_leave':
        return 'ON LEAVE'
      default:
        return 'Unknown'
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0)
  }

  const formatDuration = (minutes) => {
    if (!minutes) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getFilteredMembers = () => {
    if (!Array.isArray(teamMembers)) return [];

    const filtered = teamMembers.filter(member => {
      if (activeTab === "active") return member.status === 'active';
      if (activeTab === "invited") return member.status === 'invited' || member.status === 'pending';
      if (activeTab === "deactivated") return member.status === 'inactive' || member.status === 'on_leave';
      // Design-pack "Members" tab — shows every member regardless of status
      if (activeTab === "members") return true;
      return true;
    });
    
    // Sort to ensure account owner is always first
    return filtered.sort((a, b) => {
      const aIsOwner = a.role === 'account owner' || a.role === 'owner' || a.role === 'admin';
      const bIsOwner = b.role === 'account owner' || b.role === 'owner' || b.role === 'admin';
      
      if (aIsOwner && !bIsOwner) return -1;
      if (!aIsOwner && bIsOwner) return 1;
      return 0;
    });
  }

  const filteredMembers = getFilteredMembers();

  return (
    <div className="flex h-screen bg-[var(--sf-bg-page)] overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 lg:px-40 xl:px-44 2xl:px-48">
          {/* Mobile Header */}
          <MobileHeader pageTitle="Team" />

          <main className="flex-1 overflow-y-auto">
            <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full max-w-full">
              {authLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
                    <span className="text-[var(--sf-text-secondary)]">Loading...</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="mb-4 sm:mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                      <h1 className="text-xl sm:text-2xl font-semibold text-[var(--sf-text-primary)]">Team Members</h1>
                      <div className="flex items-center gap-2 sm:gap-3">
                        {isAccountOwner(user) && (
                          <button
                            onClick={handleToggleStaffLocations}
                            disabled={updatingLocationSetting}
                            className={`inline-flex items-center px-3 sm:px-4 py-2 text-sm font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)] transition-colors ${
                              staffLocationsEnabled
                                ? 'border-[var(--sf-border-light)] text-[var(--sf-text-primary)] bg-white hover:bg-[var(--sf-bg-page)]'
                                : 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
                            } disabled:opacity-50`}
                            title={staffLocationsEnabled ? 'Hide Staff Locations Globally' : 'Show Staff Locations Globally'}
                          >
                            {staffLocationsEnabled ? (
                              <>
                                <Eye className="w-4 h-4 mr-1.5 sm:mr-2" />
                                <span className="hidden sm:inline">Hide Locations</span>
                                <span className="sm:hidden">Hide</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-4 h-4 mr-1.5 sm:mr-2" />
                                <span className="hidden sm:inline">Show Locations</span>
                                <span className="sm:hidden">Show</span>
                              </>
                            )}
                          </button>
                        )}
                      <button
                        onClick={handleAddMember}
                        className="sf-btn-primary w-full sm:w-auto inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-medium"
                      >
                        Add Team Member
                      </button>
                      </div>
                    </div>
                  </div>

                  {/* Content Card */}
                  <div className="sf-card overflow-hidden">
                    {/* Tabs - Scrollable on mobile */}
                    <div className="border-b border-[var(--sf-border-light)] overflow-x-auto">
                      <nav className="flex min-w-max sm:min-w-0 ">
                        <button
                          onClick={() => setActiveTab("active")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "active"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Active ({teamMembers.filter(m => m.status === 'active').length})
                        </button>
                        <button
                          onClick={() => setActiveTab("invited")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "invited"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Invited ({teamMembers.filter(m => m.status === 'invited' || m.status === 'pending').length})
                        </button>
                        <button
                          onClick={() => setActiveTab("deactivated")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "deactivated"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Deactivated ({teamMembers.filter(m => m.status === 'inactive' || m.status === 'on_leave').length})
                        </button>
                        {/* Design-pack tabs — TeamDesign.zip §screens/team.jsx */}
                        <button
                          onClick={() => setActiveTab("teams")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "teams"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Teams
                        </button>
                        <button
                          onClick={() => setActiveTab("members")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "members"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Members ({teamMembers.length})
                        </button>
                        <button
                          onClick={() => setActiveTab("schedule")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "schedule"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Schedule
                        </button>
                        <button
                          onClick={() => setActiveTab("payroll")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "payroll"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Payroll
                        </button>
                        <button
                          onClick={() => setActiveTab("performance")}
                          className={`px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium border-b-[3px] transition-colors whitespace-nowrap ${
                            activeTab === "performance"
                              ? "border-blue-600 text-[var(--sf-blue-500)]"
                              : "border-transparent text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]"
                          }`}
                        >
                          Performance
                        </button>
                      </nav>
                    </div>

                    {/* Design-pack placeholder tabs */}
                    {activeTab === "teams" && (
                      <TeamDesignPlaceholder
                        title="Teams — coming soon"
                        body="Group your workers into named teams (Team A, Team B) and assign them to territories. The design pack includes the full layout — implementation is on the next wave."
                        primary={{ label: "Add Team Member", onClick: handleAddMember }}
                      />
                    )}
                    {activeTab === "schedule" && (
                      <TeamDesignPlaceholder
                        title="Team schedule"
                        body="A team-centric week view lives at /schedule with the Availability tab. Open it now or use the shortcut below."
                        primary={{ label: "Open Schedule", onClick: () => navigate('/schedule') }}
                        secondary={{ label: "Open Availability", onClick: () => navigate('/team-availability') }}
                      />
                    )}
                    {activeTab === "payroll" && (
                      <TeamDesignPlaceholder
                        title="Team payroll"
                        body="The full payroll surface — biweekly period banner, KPIs, per-cleaner breakdown, payouts — lives on the Payroll page."
                        primary={{ label: "Open Payroll", onClick: () => navigate('/payroll') }}
                      />
                    )}
                    {activeTab === "performance" && (
                      <TeamDesignPlaceholder
                        title="Performance — coming soon"
                        body="Per-member trend sparklines, on-time / repeat / CSAT metrics, and territory performance will live here. Until then, click any member to see their detail view."
                      />
                    )}

                    {/* Filters */}
                    {['active','invited','deactivated','members'].includes(activeTab) && (<>
                    <div className="p-4 sm:p-6 border-b border-[var(--sf-border-light)]">
                      <div className="flex flex-col gap-3">
                        <div className="w-full">
                          <select
                            value={filters.status}
                            onChange={(e) => handleFilterChange({ status: e.target.value })}
                            className="w-full px-3 py-2.5 text-sm border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] transition-colors"
                          >
                            <option value="">All team members</option>
                            <option value="active">Active only</option>
                            <option value="invited">Invited only</option>
                            <option value="inactive">Inactive only</option>
                          </select>
                        </div>

                        <div className="relative w-full">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--sf-text-muted)] w-4 h-4" />
                          <input
                            type="text"
                            placeholder="Search team members..."
                            value={filters.search}
                            onChange={(e) => handleFilterChange({ search: e.target.value })}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] transition-colors"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="mx-4 sm:mx-6 mt-4 sm:mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex">
                          <AlertCircle className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                          <p className="text-sm text-red-700">{error}</p>
                        </div>
                      </div>
                    )}

                    {/* Loading State */}
                    {loading ? (
                      <div className="flex items-center justify-center py-12 sm:py-16">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
                          <span className="text-sm sm:text-base text-[var(--sf-text-secondary)]">Loading team members...</span>
                        </div>
                      </div>
                    ) : filteredMembers.length === 0 ? (
                      <div className="text-center py-12 sm:py-16 px-4">
                        <Users className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-[var(--sf-text-muted)]" />
                        <h3 className="mt-2 text-sm font-medium text-[var(--sf-text-primary)]">No team members found</h3>
                        <p className="mt-1 text-xs sm:text-sm text-[var(--sf-text-secondary)]">
                          {filters.search || filters.status
                            ? "Try adjusting your search or filter criteria."
                            : "Get started by adding your first team member."}
                        </p>
                        {!filters.search && !filters.status && (
                          <div className="mt-6">
                            <button
                              onClick={handleAddMember}
                              className="sf-btn-primary inline-flex items-center px-4 py-2 text-sm font-medium"
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              Add Team Member
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table View */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-[var(--sf-border-light)]">
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--sf-text-muted)] uppercase tracking-wider">
                                  Team Member
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--sf-text-muted)] uppercase tracking-wider">
                                  Access Role
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--sf-text-muted)] uppercase tracking-wider">
                                  <div className="flex items-center">
                                    Service Provider
                                    <HelpCircle className="w-3.5 h-3.5 ml-1.5 text-[var(--sf-text-muted)]" />
                                  </div>
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-[var(--sf-text-muted)] uppercase tracking-wider">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--sf-border-light)]">
                              {filteredMembers.map((member) => (
                                <tr
                                  key={member.id}
                                  className="hover:bg-[var(--sf-bg-hover)] transition-colors cursor-pointer"
                                  onClick={() => handleViewMember(member)}
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center">
                                      <div 
                                        className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center overflow-hidden"
                                        style={{ 
                                          backgroundColor: member.profile_picture ? 'transparent' : (member.color || '#DC2626')
                                        }}
                                      >
                                        {member.profile_picture ? (
                                          <img 
                                            src={getImageUrl(member.profile_picture)} 
                                            alt={`${member.first_name} ${member.last_name}`}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <span className="text-sm font-semibold text-white">
                                            {member.first_name?.[0]}{member.last_name?.[0]}
                                          </span>
                                        )}
                                      </div>
                                      <div className="ml-4">
                                        <div className="flex items-center space-x-2">
                                          <div className="text-sm font-medium text-[var(--sf-text-primary)]">
                                            {member.first_name} {member.last_name}
                                          </div>
                                          {member.status === 'active' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                              {getStatusLabel(member.status)}
                                            </span>
                                          )}
                                          {member.status === 'invited' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-[var(--sf-blue-500)]">
                                              {getStatusLabel(member.status)}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-sm text-[var(--sf-text-secondary)]">
                                          {member.email || member.phone}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm text-[var(--sf-text-primary)]">
                                      {member.role === 'account owner' || member.role === 'owner' || member.role === 'admin' ? 'Account Owner' :
                                       member.role === 'manager' ? 'Manager' :
                                       member.role === 'scheduler' ? 'Scheduler' :
                                       member.role === 'worker' || member.role === 'technician' ? 'Worker' :
                                       member.role || 'Team Member'}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm text-[var(--sf-text-primary)]">
                                      {member.is_service_provider ? 'Yes' : 'No'}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end space-x-3">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewMember(member);
                                        }}
                                        className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors"
                                        title="View schedule"
                                      >
                                        <Clock className="w-5 h-5" />
                                      </button>
                                      {!(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') && (
                                        <>
                                          {member.status === 'active' ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleActivation(member);
                                              }}
                                              className="text-red-600 hover:text-red-700 transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                              title="Deactivate"
                                            >
                                              <PowerOff className="w-4 h-4" />
                                              <span>Deactivate</span>
                                            </button>
                                          ) : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleActivation(member);
                                              }}
                                              className="text-green-600 hover:text-green-700 transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                              title="Activate"
                                            >
                                              <Power className="w-4 h-4" />
                                              <span>Activate</span>
                                            </button>
                                          )}
                                          {member.email && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleResendInvite(member);
                                              }}
                                              className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-600)] transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                              title="Resend invitation"
                                            >
                                              <Mail className="w-4 h-4" />
                                              <span>Invite</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setTerritoriesMember(member);
                                            }}
                                            className="text-[var(--sf-text-muted)] hover:text-[var(--sf-blue-600)] transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                            title="Assign territories (multiple supported)"
                                          >
                                            <MapPin className="w-4 h-4" />
                                            <span>Territories</span>
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleEditMember(member);
                                            }}
                                            className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors"
                                            title="More options"
                                          >
                                            <Settings className="w-5 h-5" />
                                          </button>
                                        </>
                                      )}
                                      {(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') && (
                                        <span className="text-xs text-[var(--sf-text-muted)] italic">Account Owner</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Card View */}
                        <div className="sm:hidden divide-y divide-[var(--sf-border-light)]">
                          {filteredMembers.map((member) => (
                            <div
                              key={member.id}
                              onClick={() => handleViewMember(member)}
                              className="p-4 hover:bg-[var(--sf-bg-hover)] transition-colors cursor-pointer"
                            >
                              <div className="flex items-start gap-3">
                                <div 
                                  className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center overflow-hidden"
                                  style={{ 
                                    backgroundColor: member.profile_picture ? 'transparent' : (member.color || '#DC2626')
                                  }}
                                >
                                  {member.profile_picture ? (
                                    <img 
                                      src={getImageUrl(member.profile_picture)} 
                                      alt={`${member.first_name} ${member.last_name}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs font-semibold text-white">
                                      {member.first_name?.[0]}{member.last_name?.[0]}
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-[var(--sf-text-primary)] truncate">
                                      {member.first_name} {member.last_name}
                                    </span>
                                    {member.status === 'active' && (
                                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                        ACTIVE
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-[var(--sf-text-secondary)] truncate mb-1">
                                    {member.email || member.phone}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-[var(--sf-text-secondary)]">
                                    <span>{member.role === 'account owner' || member.role === 'owner' || member.role === 'admin' ? 'Account Owner' :
                                       member.role === 'manager' ? 'Manager' :
                                       member.role === 'scheduler' ? 'Scheduler' :
                                       member.role === 'worker' || member.role === 'technician' ? 'Worker' :
                                       member.role || 'Team Member'}</span>
                                    <span className="text-[var(--sf-text-muted)]">•</span>
                                    <span>{member.is_service_provider ? 'Service Provider' : 'Non-Provider'}</span>
                                  </div>
                                </div>

                                <div className="flex-shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  {!(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin') && (
                                    <>
                                      {member.status === 'active' ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleActivation(member);
                                          }}
                                          className="text-red-600 hover:text-red-700 transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                          title="Deactivate"
                                        >
                                          <PowerOff className="w-4 h-4" />
                                          <span>Deactivate</span>
                                        </button>
                                      ) : (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleActivation(member);
                                          }}
                                          className="text-green-600 hover:text-green-700 transition-colors flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                                          title="Activate"
                                        >
                                          <Power className="w-4 h-4" />
                                          <span>Activate</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTerritoriesMember(member);
                                        }}
                                        className="text-[var(--sf-text-muted)] hover:text-[var(--sf-blue-600)] transition-colors p-2"
                                        title="Assign territories"
                                      >
                                        <MapPin className="w-5 h-5" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditMember(member);
                                        }}
                                        className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors p-2"
                                      >
                                        <Settings className="w-5 h-5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pagination */}
                        <div className="px-4 sm:px-6 py-4 border-t border-[var(--sf-border-light)]">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              disabled
                              className="p-2 rounded-lg border border-[var(--sf-border-light)] text-[var(--sf-text-muted)] cursor-not-allowed"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                              disabled
                              className="p-2 rounded-lg border border-[var(--sf-border-light)] text-[var(--sf-text-muted)] cursor-not-allowed"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    </>)}
                  </div>
                </>
              )}
            </div>
          </main>
        </div>

      {/* Modals */}
      {isAddModalOpen && (
        <AddTeamMemberModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false)
          }}
          onSuccess={handleMemberAdded}
          userId={user?.id}
          member={null}
          isEditing={false}
        />
      )}

      {isEditModalOpen && selectedMember && (
        <AddTeamMemberModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setSelectedMember(null)
          }}
          onSuccess={handleMemberUpdate}
          userId={user?.id}
          member={selectedMember}
          isEditing={true}
        />
      )}

      <AssignTerritoriesModal
        isOpen={!!territoriesMember}
        member={territoriesMember}
        userId={user?.id}
        onClose={() => setTerritoriesMember(null)}
        onSaved={() => {
          fetchTeamMembers()
          setTerritoriesMember(null)
        }}
      />

      {showDeleteModal && memberToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 mr-3 flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-medium text-[var(--sf-text-primary)]">Delete Team Member</h3>
            </div>

            {deleteError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-red-800 mb-1">Unable to Delete Team Member</h4>
                    <p className="text-sm text-red-700 leading-relaxed">{deleteError}</p>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs sm:text-sm text-[var(--sf-text-muted)] mb-6">
              Are you sure you want to delete <strong>{memberToDelete.first_name} {memberToDelete.last_name}</strong>?
              This action cannot be undone.
            </p>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setMemberToDelete(null)
                  setDeleteError("")
                }}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteMember}
                disabled={deleteLoading}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 mr-3 flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-medium text-[var(--sf-text-primary)]">Delete All Team Members</h3>
            </div>

            <p className="text-xs sm:text-sm text-[var(--sf-text-muted)] mb-2">
              Are you sure you want to delete all team members? This will delete{' '}
              <strong>{deletableMembersCount}</strong>{' '}
              team member(s). Account owners will not be deleted.
            </p>
            <p className="text-xs sm:text-sm text-red-600 font-medium mb-6">
              This action cannot be undone.
            </p>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowDeleteAllModal(false)
                  setDeletableMembersCount(0)
                }}
                disabled={deleteAllLoading}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAll}
                disabled={deleteAllLoading}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleteAllLoading ? "Deleting..." : "Delete All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation Confirmation Modal */}
      {showActivationModal && memberToToggle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              {memberToToggle.status === 'active' ? (
                <PowerOff className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 mr-3 flex-shrink-0" />
              ) : (
                <Power className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 mr-3 flex-shrink-0" />
              )}
              <h3 className="text-base sm:text-lg font-medium text-[var(--sf-text-primary)]">
                {memberToToggle.status === 'active' ? 'Deactivate' : 'Activate'} Team Member
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[var(--sf-text-muted)] mb-6">
              {memberToToggle.status === 'active' ? (
                <>Are you sure you want to deactivate <strong>{memberToToggle.first_name} {memberToToggle.last_name}</strong>?</>
              ) : (
                <>Are you sure you want to activate <strong>{memberToToggle.first_name} {memberToToggle.last_name}</strong>?</>
              )}
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowActivationModal(false)
                  setMemberToToggle(null)
                }}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggleActivation}
                disabled={activationLoading}
                className={`w-full sm:w-auto px-4 py-2 text-sm font-medium text-white rounded-md ${
                  memberToToggle.status === 'active'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {activationLoading ? "Updating..." : (memberToToggle.status === 'active' ? "Deactivate" : "Activate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resend Invite Confirmation Modal */}
      {showResendModal && memberToResend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--sf-blue-500)] mr-3 flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-medium text-[var(--sf-text-primary)]">Resend Invitation</h3>
            </div>
            <p className="text-xs sm:text-sm text-[var(--sf-text-muted)] mb-6">
              Are you sure you want to resend the invitation to <strong>{memberToResend.first_name} {memberToResend.last_name}</strong>?
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowResendModal(false)
                  setMemberToResend(null)
                }}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmResendInvite}
                disabled={resendLoading}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-[var(--sf-blue-500)] rounded-md hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
              >
                {resendLoading ? "Sending..." : "Resend Invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm mx-4 ${
          notification.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <div className="flex items-center">
            {notification.type === 'success' ? (
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            <span className="font-medium text-sm">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServiceFlowTeam