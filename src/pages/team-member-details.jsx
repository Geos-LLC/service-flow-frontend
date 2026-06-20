import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/sidebar'
import AddressValidation from '../components/address-validation'
import AddressAutocomplete from '../components/address-autocomplete'
import { GOOGLE_MAPS_API_KEY } from '../config/maps'
import { 
  ChevronLeft, 
  Edit,
  Save,
  Trash2, 
  Phone, 
  Mail, 
  MapPin,
  Calendar,
  Settings,
  Users,
  Star,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  Plus,
  X,
  Bell,
  MessageSquare,
  DollarSign,
  User,
  AlertCircle
} from 'lucide-react'
import { teamAPI, territoriesAPI, staffLocationsAPI, jobsAPI } from '../services/api'
import { normalizeAPIResponse } from '../utils/dataHandler'
import { formatTime as formatTimeShared } from '../utils/formatTime'
import DateOverrideModal from '../components/date-override-modal'
import AddTeamMemberModal from '../components/add-team-member-modal'
import { getImageUrl } from '../utils/imageUtils'
import { decodeHtmlEntities } from '../utils/htmlUtils'

const TeamMemberDetails = () => {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // State
  const [teamMember, setTeamMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editFormData, setEditFormData] = useState({})
  const [territories, setTerritories] = useState([])
  const [displayedTerritories, setDisplayedTerritories] = useState([])
  const [hasLoadedAvailability, setHasLoadedAvailability] = useState(false) // Track if availability has been loaded
  const [hasLoadedPermissions, setHasLoadedPermissions] = useState(false) // Track if permissions have been loaded
  const [workingHours, setWorkingHours] = useState({
    sunday: { available: false, hours: "" },
    monday: { available: true, hours: "9:00 AM - 6:00 PM" },
    tuesday: { available: true, hours: "9:00 AM - 6:00 PM" },
    wednesday: { available: true, hours: "9:00 AM - 6:00 PM" },
    thursday: { available: true, hours: "9:00 AM - 6:00 PM" },
    friday: { available: true, hours: "9:00 AM - 6:00 PM" },
    saturday: { available: false, hours: "" }
  })
  const [customAvailability, setCustomAvailability] = useState([])
  const [memberAvailabilityRaw, setMemberAvailabilityRaw] = useState(null)
  const [editingHours, setEditingHours] = useState(false)
  const [editingAvailability, setEditingAvailability] = useState(false)
  const [savingHours, setSavingHours] = useState(false)
  const [savingCustomAvailability, setSavingCustomAvailability] = useState(false)
  const [savingDay, setSavingDay] = useState(null) // Track which day is being saved
  const [showWeeklyHoursModal, setShowWeeklyHoursModal] = useState(false)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [overrideModalMode, setOverrideModalMode] = useState('unavailable') // 'unavailable' | 'custom_hours'
  const [editingOverride, setEditingOverride] = useState(null)
  const [selectedDates, setSelectedDates] = useState([])
  const [settings, setSettings] = useState({
    isServiceProvider: true,
    canEditAvailability: true,
    limitJobsPerDay: false,
    canAutoAssign: true,
    canClaimJobs: true,
    emailNotifications: true,
    smsNotifications: false
  })
  const [performanceData, setPerformanceData] = useState({
    jobsCompleted: 0,
    averageRating: 0,
    hoursWorked: 0,
    revenueGenerated: 0
  })
  const [recentJobs, setRecentJobs] = useState([])
  const [memberJobs, setMemberJobs] = useState([])
  const [memberJobsLoading, setMemberJobsLoading] = useState(true)
  const [memberJobsTab, setMemberJobsTab] = useState('upcoming') // 'upcoming' | 'past' | 'all'
  const [allTeamMembers, setAllTeamMembers] = useState([]) // For map display
  const [staffLocationsEnabled, setStaffLocationsEnabled] = useState(true) // Global setting for staff locations
  // Lightweight inline toast for quick-action feedback (no provider, no deps).
  // { id, message, kind: 'success' | 'error' } — set null to dismiss.
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = (message, kind = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), message, kind })
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])
  
  // Google Places Autocomplete
  const addressRef = useRef(null)
  const [addressSuggestions, setAddressSuggestions] = useState([])
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)
  const [addressLoading, setAddressLoading] = useState(false)
  

  // Territories modal
  const [showAddTerritoryModal, setShowAddTerritoryModal] = useState(false)
  const [availableTerritories, setAvailableTerritories] = useState([])
  const [territoryLoading, setTerritoryLoading] = useState(false)

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [resendingInvite, setResendingInvite] = useState(false)
  
  // Notifications
  const [notification, setNotification] = useState(null)

  // Load team member data
  useEffect(() => {
    if (memberId) {
      fetchTeamMemberDetails()
      fetchAvailableTerritories()
      fetchAllTeamMembers() // Fetch all members for map
      fetchStaffLocationsSetting() // Fetch global setting
      fetchMemberJobs()
    } else if (user?.teamMemberId) {
      // If no memberId in URL but user is a team member, navigate to their own profile
      navigate(`/team/${user.teamMemberId}`, { replace: true })
    }
  }, [memberId, user?.teamMemberId])

  // Fetch jobs assigned to this member.
  // Pulls a wide window (~6 months back, 6 months forward) and lets the
  // section's tabs slice it into upcoming / past / all.
  const fetchMemberJobs = async () => {
    if (!memberId || !user?.id) return
    setMemberJobsLoading(true)
    try {
      const today = new Date()
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const start = new Date(today); start.setMonth(start.getMonth() - 6)
      const end = new Date(today); end.setMonth(end.getMonth() + 6)
      const range = `${fmt(start)} to ${fmt(end)}`
      // jobsAPI.getAll(userId, status, search, page, limit, dateFilter, dateRange, sortBy, sortOrder, teamMember)
      const resp = await jobsAPI.getAll(user.id, '', '', 1, 500, null, range, 'scheduled_date', 'DESC', memberId)
      const list = normalizeAPIResponse(resp, 'jobs')
      // Backend may not honor teamMember filter on every deploy — defend client-side.
      const mine = list.filter((j) => {
        const ids = []
        if (Array.isArray(j.assigned_providers)) j.assigned_providers.forEach((p) => ids.push(String(p?.id || p?.team_member_id || p?.provider_id || '')))
        if (Array.isArray(j.team_members)) j.team_members.forEach((m) => ids.push(String(m?.id || m?.team_member_id || '')))
        if (Array.isArray(j.job_team_assignments)) j.job_team_assignments.forEach((a) => ids.push(String(a?.team_member_id || a?.id || '')))
        if (Array.isArray(j.team_assignments)) j.team_assignments.forEach((a) => ids.push(String(a?.team_member_id || a?.id || '')))
        if (j.team_member_id) ids.push(String(j.team_member_id))
        if (j.assigned_to) ids.push(String(j.assigned_to))
        return ids.includes(String(memberId))
      })
      setMemberJobs(mine)
    } catch (e) {
      console.error('Error fetching jobs for team member:', e)
      setMemberJobs([])
    } finally {
      setMemberJobsLoading(false)
    }
  }

  // Fetch global staff locations setting
  const fetchStaffLocationsSetting = async () => {
    try {
      const response = await staffLocationsAPI.getStaffLocationsSetting()
      setStaffLocationsEnabled(response?.staff_locations_enabled !== false) // Default to true
    } catch (error) {
      console.error('Error fetching staff locations setting:', error)
      // Default to enabled if error
      setStaffLocationsEnabled(true)
    }
  }

  // Fetch all team members for map display
  const fetchAllTeamMembers = async () => {
    try {
      if (user?.id) {
        const response = await teamAPI.getAll(user.id, { status: 'active' })
        const members = response.teamMembers || response || []
        setAllTeamMembers(members)
      }
    } catch (error) {
      console.error('Error fetching all team members:', error)
    }
  }



  const fetchTeamMemberDetails = async () => {
    try {
      setLoading(true)
      setError('')
      
      console.log('Fetching team member with ID:', memberId)
      console.log('Current user:', user)
      console.log('User teamMemberId:', user?.teamMemberId)
      const response = await teamAPI.getById(memberId)
      console.log('Team member response:', response)
      console.log('Team member data:', JSON.stringify(response, null, 2))
      console.log('Team member availability from API:', response.teamMember?.availability)
      console.log('Team member permissions from API:', response.teamMember?.permissions)
      console.log('Team member territories from API:', response.teamMember?.territories)
      
      if (response && response.teamMember) {
        const teamMemberData = response.teamMember
        setTeamMember(teamMemberData)
        

        // Parse territories
        if (teamMemberData.territories) {
          try {
            console.log('Raw territories from team member:', teamMemberData.territories)
            let parsedTerritories
            if (typeof teamMemberData.territories === 'string') {
              console.log('Territories is string, parsing as JSON...')
              try {
                parsedTerritories = JSON.parse(teamMemberData.territories)
                console.log('First parse successful:', parsedTerritories)
              } catch (e) {
                console.log('First parse failed, trying double parse')
                try {
                  parsedTerritories = JSON.parse(JSON.parse(teamMemberData.territories))
                  console.log('Double parse successful:', parsedTerritories)
                } catch (e2) {
                  console.log('Double parse also failed, extracting numbers from string...')
                  // If JSON parsing fails, try to extract numbers from the string
                  const matches = teamMemberData.territories.match(/\d+/g)
                  parsedTerritories = matches ? matches.map(Number) : []
                  console.log('Extracted numbers from string:', parsedTerritories)
                }
              }
            } else {
              parsedTerritories = teamMemberData.territories
            }
            console.log('Final parsed territories:', parsedTerritories)
            console.log('Type of parsedTerritories:', typeof parsedTerritories)
            console.log('Is Array?', Array.isArray(parsedTerritories))
            console.log('Length:', parsedTerritories ? parsedTerritories.length : 'undefined')
            
            // Robust parsing to ensure we always have an array of territory IDs
            let finalTerritories = []
            
            // If parsedTerritories is a string, try to parse it again
            if (typeof parsedTerritories === 'string') {
              console.log('parsedTerritories is string, attempting to re-parse...')
              try {
                const reParsed = JSON.parse(parsedTerritories)
                console.log('Re-parsed result:', reParsed)
                if (Array.isArray(reParsed)) {
                  finalTerritories = reParsed
                }
              } catch (e) {
                console.log('Re-parsing failed:', e)
              }
            } else if (Array.isArray(parsedTerritories)) {
              console.log('parsedTerritories is already an array')
              finalTerritories = parsedTerritories
            } else if (parsedTerritories && typeof parsedTerritories === 'object' && parsedTerritories.length > 0) {
              console.log('parsedTerritories is array-like object')
              finalTerritories = parsedTerritories
            }
            
            // Filter to ensure we only have numeric IDs
            finalTerritories = finalTerritories.filter(id => typeof id === 'number' || (typeof id === 'string' && !isNaN(parseInt(id))))
            console.log('Final filtered territories:', finalTerritories)
            
            setTerritories(finalTerritories)
          } catch (e) {
            console.error('Error parsing territories:', e)
            setTerritories([])
          }
        } else {
          console.log('No territories found in team member data')
          setTerritories([])
        }

        // Parse availability - use actual data from database, only use defaults if truly no data exists
        if (teamMemberData.availability !== null && teamMemberData.availability !== undefined) {
          try {
            let parsedAvailability;
            
            if (typeof teamMemberData.availability === 'string') {
              // If it's a string, try to parse it
              try {
                parsedAvailability = JSON.parse(teamMemberData.availability);
              } catch (parseError) {
                console.error('Error parsing availability string:', parseError);
                parsedAvailability = null;
              }
            } else if (typeof teamMemberData.availability === 'object' && teamMemberData.availability !== null) {
              // If it's already an object, use it directly
              parsedAvailability = teamMemberData.availability;
            } else {
              parsedAvailability = null;
            }
            
            if (parsedAvailability && typeof parsedAvailability === 'object') {
              setMemberAvailabilityRaw(parsedAvailability)
              if (parsedAvailability.workingHours) {
                // Normalize: ensure days with legacy "hours" string get a timeSlots array so they display and save correctly
                const normalized = { ...parsedAvailability.workingHours }
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                days.forEach(day => {
                  const d = normalized[day]
                  if (d && d.available && (d.hours || d.timeSlots?.length)) {
                    if (!d.timeSlots || d.timeSlots.length === 0) {
                      // Legacy format: convert "9:00 AM - 6:00 PM" to one timeSlot
                      const hoursStr = d.hours || ''
                      const match = hoursStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
                      if (match) {
                        let sh = parseInt(match[1], 10), eh = parseInt(match[4], 10)
                        if (match[3]?.toUpperCase() === 'PM' && sh !== 12) sh += 12
                        if (match[3]?.toUpperCase() === 'AM' && sh === 12) sh = 0
                        if (match[6]?.toUpperCase() === 'PM' && eh !== 12) eh += 12
                        if (match[6]?.toUpperCase() === 'AM' && eh === 12) eh = 0
                        normalized[day] = {
                          ...d,
                          timeSlots: [{
                            id: d.id ?? Date.now() + day.length,
                            start: `${String(sh).padStart(2, '0')}:${match[2]}`,
                            end: `${String(eh).padStart(2, '0')}:${match[5]}`,
                            enabled: true
                          }]
                        }
                      } else {
                        normalized[day] = { ...d, timeSlots: [{ id: Date.now(), start: '09:00', end: '17:00', enabled: true }] }
                      }
                    }
                  }
                })
                setWorkingHours(normalized)
              }
              if (parsedAvailability.customAvailability !== undefined) {
                setCustomAvailability(parsedAvailability.customAvailability || [])
              }
              setHasLoadedAvailability(true) // Mark as loaded
            }
          } catch (e) {
            console.error('Error processing availability:', e)
            // Don't reset to defaults on error - data might exist but be malformed
            setHasLoadedAvailability(true) // Mark as attempted to load
          }
        } else {
          // No availability in database (null or undefined)
          // Only set defaults if this is the first time loading (hasn't been loaded before)
          if (!hasLoadedAvailability) {
            // Only set defaults on first load when no data exists
            console.log('No availability in database, setting defaults for first load')
          setWorkingHours({
            sunday: { available: false, hours: "" },
            monday: { available: true, hours: "9:00 AM - 6:00 PM" },
            tuesday: { available: true, hours: "9:00 AM - 6:00 PM" },
            wednesday: { available: true, hours: "9:00 AM - 6:00 PM" },
            thursday: { available: true, hours: "9:00 AM - 6:00 PM" },
            friday: { available: true, hours: "9:00 AM - 6:00 PM" },
            saturday: { available: false, hours: "" }
          })
            setCustomAvailability([])
          } else {
            // Already loaded before, availability is null - keep current state (don't reset)
            console.log('No availability in database, but already loaded - keeping current state')
          }
          setHasLoadedAvailability(true) // Mark as loaded (even though it's null)
        }

        // Parse permissions/settings - use actual data from database
        if (teamMemberData.permissions !== null && teamMemberData.permissions !== undefined) {
          try {
            let parsedPermissions;
            
            if (typeof teamMemberData.permissions === 'string') {
              // If it's a string, try to parse it
              try {
                parsedPermissions = JSON.parse(teamMemberData.permissions);
              } catch (parseError) {
                console.error('Error parsing permissions string:', parseError);
                parsedPermissions = null;
              }
            } else if (typeof teamMemberData.permissions === 'object' && teamMemberData.permissions !== null) {
              // If it's already an object, use it directly
              parsedPermissions = teamMemberData.permissions;
            } else {
              parsedPermissions = null;
            }
            
            if (parsedPermissions && typeof parsedPermissions === 'object') {
              // Use the actual permissions from database
              setSettings(parsedPermissions);
              setHasLoadedPermissions(true) // Mark as loaded
            }
          } catch (e) {
            console.error('Error processing permissions:', e)
            // Don't reset settings on error - keep current state
            setHasLoadedPermissions(true) // Mark as attempted to load
          }
        } else {
          // No permissions in database (null or undefined)
          // Don't apply defaults - use empty object to ensure each worker only has explicitly saved permissions
          setSettings({});
          setHasLoadedPermissions(true) // Mark as loaded (even though it's null)
        }

        // Set recent jobs if available
        if (response.jobs) {
          setRecentJobs(response.jobs)
        }
      }
    } catch (error) {
      console.error('Error fetching team member:', error)
      setError('Failed to load team member details')
    } finally {
      setLoading(false)
    }
  }

  const handleEditMember = () => {
    setEditFormData({
      first_name: teamMember?.first_name || '',
      last_name: teamMember?.last_name || '',
      email: teamMember?.email || '',
      phone: teamMember?.phone || '',
      role: teamMember?.role || '',
      location: teamMember?.location || '',
      city: teamMember?.city || '',
      state: teamMember?.state || '',
      zip_code: teamMember?.zip_code || '',
      hourly_rate: teamMember?.hourly_rate || null,
      commission_percentage: teamMember?.commission_percentage || null
    })
    setEditing(true)
  }

  const handleMemberUpdate = () => {
    fetchTeamMemberDetails()
    setEditing(false)
  }

  const handleSaveMember = async () => {
    try {
      setSaving(true)
      
      const updateData = {
        ...editFormData,
        color: editFormData.color || '#2563EB',
        territories: JSON.stringify(territories.map(t => typeof t === 'object' ? t.id : t)),
        permissions: JSON.stringify(settings)
      }
      
      console.log('Saving team member with data:', updateData)
      await teamAPI.update(memberId, updateData)
      // Save availability via dedicated endpoint so timeSlots persist correctly
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability })
      
      // Refresh data
      await fetchTeamMemberDetails()
      setEditing(false)
    } catch (error) {
      console.error('Error saving team member:', error)
      setError('Failed to save team member')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditFormData({})
  }

  const handleDeleteMember = () => {
    setShowDeleteModal(true)
  }

  const handleResendInvite = async () => {
    if (!teamMember?.id) return;
    
    try {
      setResendingInvite(true);
      await teamAPI.resendInvite(teamMember.id);
      setNotification({
        type: 'success',
        message: 'Invitation email sent successfully!'
      });
      // Clear notification after 3 seconds
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error resending invite:', error);
      setNotification({
        type: 'error',
        message: error.response?.data?.error || 'Failed to resend invitation. Please try again.'
      });
      // Clear notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setResendingInvite(false);
    }
  }

  const confirmDeactivateMember = async () => {
    // Prevent deactivating account owner
    if (teamMember?.role === 'account owner' || teamMember?.role === 'owner' || teamMember?.role === 'admin') {
      setDeleteError('Cannot deactivate account owner')
      return
    }
    
    try {
      setDeleting(true)
      setDeleteError("") // Clear any previous errors
      await teamAPI.update(memberId, { status: 'inactive' })
      
      // Refresh team member data to reflect the status change
      await fetchTeamMemberDetails()
      
      // Show success notification
      setNotification({
        type: 'success',
        message: `Team member has been deactivated successfully.`
      })
      
      // Close the modal
      setShowDeleteModal(false)
      setTimeout(() => setNotification(null), 3000)
    } catch (error) {
      console.error('Error deactivating team member:', error)
      
      // Enhanced error handling with specific error types
      let errorMessage = 'Failed to deactivate team member. Please try again.'
      
      if (error.response?.data) {
        const errorData = error.response.data
        
        // Use user-friendly message if available
        if (errorData.userMessage) {
          errorMessage = errorData.userMessage
        } else if (errorData.error) {
          errorMessage = errorData.error
        }
        
        // Log additional details for debugging
        console.log('Error details:', {
          errorType: errorData.errorType,
          status: error.response.status,
          details: errorData.details
        })
      } else if (error.message) {
        errorMessage = error.message
      }
      
      // Handle specific error types with additional context
      if (error.response?.status === 400) {
        // Business rule violations - show the specific error message
        setDeleteError(errorMessage)
      } else if (error.response?.status === 404) {
        setDeleteError('Team member not found. They may have already been deleted.')
      } else if (error.response?.status === 403) {
        setDeleteError('You do not have permission to delete this team member.')
      } else if (error.response?.status === 500) {
        setDeleteError('Server error occurred. Please try again later or contact support.')
      } else if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
        setDeleteError('Network error. Please check your internet connection and try again.')
      } else {
        setDeleteError(errorMessage)
      }
      
      // Don't close the modal on error - let user see the error message
    } finally {
      setDeleting(false)
    }
  }


  const fetchAvailableTerritories = async () => {
    try {
      setTerritoryLoading(true)
      console.log('Fetching available territories for user:', user?.id)
      const response = await territoriesAPI.getAll(user?.id, { status: 'active' })
      console.log('Available territories response:', response)
      console.log('Available territories array:', response.territories)
      console.log('Available territories count:', response.territories?.length || 0)
      console.log('Full API response structure:', Object.keys(response))
      setAvailableTerritories(response.territories || [])
    } catch (error) {
      console.error('Error fetching territories:', error)
      setAvailableTerritories([])
    } finally {
      setTerritoryLoading(false)
    }
  }

  const handleAddTerritory = () => {
    setShowAddTerritoryModal(true)
  }

  const handleSaveTerritory = async (territoryId) => {
    try {
      console.log('handleSaveTerritory called with territoryId:', territoryId)
      const foundTerritory = availableTerritories.find(t => t.id === territoryId)
      console.log('Found territory:', foundTerritory)
      
      if (foundTerritory) {
        const updatedTerritories = [...territories, territoryId]
        console.log('Updated territories array:', updatedTerritories)
        
        // Save to database - ensure we save as array of IDs
        const updateData = {
          territories: JSON.stringify(updatedTerritories)
        }
        console.log('Saving territories to database with data:', updateData)
        
        const response = await teamAPI.update(memberId, updateData)
        console.log('Team API update response:', response)
        
        // Update local state
        setTerritories(updatedTerritories)

      // Refresh team member data
      await fetchTeamMemberDetails()
        
        setShowAddTerritoryModal(false)
        console.log('Territory added successfully')
      } else {
        console.error('Territory not found for ID:', territoryId)
        alert('Territory not found. Please try again.')
      }
    } catch (error) {
      console.error('Error adding territory:', error)
      console.error('Error details:', error.response?.data || error.message)
      alert('Failed to add territory. Please try again.')
    }
  }

  const handleRemoveTerritory = async (territoryToRemove) => {
    try {
      console.log('Removing territory:', territoryToRemove)
      console.log('Current territories:', territories)
      
      // Get the territory ID to remove
      let territoryIdToRemove
      if (typeof territoryToRemove === 'object' && territoryToRemove.id) {
        territoryIdToRemove = territoryToRemove.id
      } else {
        territoryIdToRemove = territoryToRemove
      }
      
      console.log('Territory ID to remove:', territoryIdToRemove)
      
      // Remove the territory by its ID from the territories array
      const updatedTerritories = territories.filter(territoryId => {
        const numericId = typeof territoryId === 'string' ? parseInt(territoryId) : territoryId
        const numericRemoveId = typeof territoryIdToRemove === 'string' ? parseInt(territoryIdToRemove) : territoryIdToRemove
        
        console.log('Comparing territory ID:', numericId, 'with remove ID:', numericRemoveId)
        const shouldKeep = numericId !== numericRemoveId
        console.log('Should keep territory:', shouldKeep)
        return shouldKeep
      })
      
      console.log('Updated territories after removal:', updatedTerritories)
      
      // Save to database
      const updateData = {
        territories: JSON.stringify(updatedTerritories)
      }
      console.log('Saving territories to database after removal:', updateData)
      
      await teamAPI.update(memberId, updateData)
      
      // Update local state
      setTerritories(updatedTerritories)
      
      // Refresh team member data
      await fetchTeamMemberDetails()
      
      console.log('Territory removed successfully')
    } catch (error) {
      console.error('Error removing territory:', error)
      alert('Failed to remove territory. Please try again.')
    }
  }

  const handleSaveHours = async () => {
    try {
      console.log('handleSaveHours called')
      console.log('Current workingHours:', workingHours)
      
      setSavingHours(true)
      
      console.log('Saving recurring hours via updateAvailability')
      const availData = { workingHours, customAvailability }
      if (memberAvailabilityRaw?.break) availData.break = memberAvailabilityRaw.break
      await teamAPI.updateAvailability(memberId, availData)
      
      // Refresh team member data
      await fetchTeamMemberDetails()
      
      setEditingHours(false)
      setShowWeeklyHoursModal(false)
      console.log('Recurring hours saved successfully')
    } catch (error) {
      console.error('Error saving recurring hours:', error)
      alert('Failed to save recurring hours. Please try again.')
    } finally {
      setSavingHours(false)
    }
  }

  const handleSaveCustomAvailability = async () => {
    try {
      console.log('handleSaveCustomAvailability called')
      console.log('Current customAvailability:', customAvailability)
      
      setSavingCustomAvailability(true)
      
      console.log('Saving custom availability via updateAvailability')
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability })
      
      // Refresh team member data
      await fetchTeamMemberDetails()
      
      setEditingAvailability(false)
      console.log('Custom availability saved successfully')
    } catch (error) {
      console.error('Error saving custom availability:', error)
      alert('Failed to save custom availability. Please try again.')
    } finally {
      setSavingCustomAvailability(false)
    }
  }

  const handleSaveDay = async (day) => {
    try {
      console.log(`handleSaveDay called for ${day}`)
      console.log(`Current ${day} hours:`, workingHours[day])
      
      setSavingDay(day)
      
      console.log(`Saving ${day} availability via updateAvailability`)
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability })
      
      // Refresh team member data
      await fetchTeamMemberDetails()
      
      console.log(`${day} availability saved successfully`)
    } catch (error) {
      console.error(`Error saving ${day} availability:`, error)
      alert(`Failed to save ${day} availability. Please try again.`)
    } finally {
      setSavingDay(null)
    }
  }

  const handleAddCustomAvailability = () => {
    setShowAvailabilityModal(true)
  }

  // Quick-action helpers for Time Off — see handleQuickTimeOff below.
  // Date math is local-time intentionally: time-off entries are calendar-date
  // labels for the worker's day, not timestamps. Using toISOString() would
  // shift the date backwards in any timezone west of UTC.
  const toLocalISODate = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const getQuickTimeOffChips = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dow = today.getDay() // 0 = Sun .. 6 = Sat
    const chips = []
    chips.push({ key: 'today', label: 'Today', date: toLocalISODate(today) })
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    chips.push({ key: 'tomorrow', label: 'Tomorrow', date: toLocalISODate(tomorrow) })
    const addNextWeekday = (targetDow, label) => {
      // Next occurrence of targetDow that is NOT today and NOT tomorrow.
      const d = new Date(today)
      let delta = (targetDow - dow + 7) % 7
      if (delta === 0 || delta === 1) delta += 7 // skip today/tomorrow — those have their own chips
      d.setDate(today.getDate() + delta)
      chips.push({ key: label.toLowerCase(), label, date: toLocalISODate(d) })
    }
    addNextWeekday(1, 'This Mon')
    addNextWeekday(5, 'This Fri')
    return chips
  }
  const handleQuickTimeOff = async (date, label = 'Custom') => {
    // Idempotent: if a time-off entry already exists for this date, surface
    // that without an extra round-trip. Don't silently overwrite, since the
    // existing entry may have a different label the operator chose on purpose.
    const existing = customAvailability.find(item => item.date === date)
    if (existing && existing.available === false) {
      showToast(`Already marked off on ${date}`, 'success')
      return
    }
    const newEntry = {
      id: Date.now() + Math.random(),
      date,
      available: false,
      hours: [],
      label,
    }
    // Replace any existing same-date entry (e.g. an Additional Hours entry
    // the user is flipping to Time Off) so we don't end up with both.
    const updatedCustom = existing
      ? customAvailability.map(item => item.date === date ? newEntry : item)
      : [...customAvailability, newEntry]
    setCustomAvailability(updatedCustom)
    try {
      setSavingCustomAvailability(true)
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability: updatedCustom })
      await fetchTeamMemberDetails()
      const memberName = teamMember?.first_name || 'Team member'
      showToast(`${memberName} marked off on ${date}`, 'success')
    } catch (error) {
      console.error('Error saving quick time off:', error)
      // Revert local optimistic update on failure
      setCustomAvailability(customAvailability)
      showToast('Failed to save time off — please try again', 'error')
    } finally {
      setSavingCustomAvailability(false)
    }
  }

  const handleAvailabilityModalSave = async (availabilityData) => {
    // availabilityData shape from DateOverrideModal: { date, available, hours: [{start,end}], label }
    const existingIndex = customAvailability.findIndex(item => item.date === availabilityData.date)

    const normalizedHours = availabilityData.available && Array.isArray(availabilityData.hours)
      ? availabilityData.hours.filter(h => h && h.start && h.end)
      : []

    const availabilityItem = {
      id: existingIndex >= 0 ? customAvailability[existingIndex].id : Date.now() + Math.random(),
      date: availabilityData.date,
      available: availabilityData.available && normalizedHours.length > 0,
      hours: normalizedHours,
      label: availabilityData.label || ''
    }

    const updatedCustom = existingIndex >= 0
      ? customAvailability.map((item, index) => index === existingIndex ? availabilityItem : item)
      : [...customAvailability, availabilityItem]

    setCustomAvailability(updatedCustom)

    try {
      setSavingCustomAvailability(true)
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability: updatedCustom })
      await fetchTeamMemberDetails()
      setShowAvailabilityModal(false)
      setEditingOverride(null)
    } catch (error) {
      console.error('Error saving custom availability:', error)
      alert('Failed to save availability. Please try again.')
    } finally {
      setSavingCustomAvailability(false)
    }
  }

  const handleRemoveCustomAvailability = async (id) => {
    try {
      setSavingCustomAvailability(true)
      
      // Remove from local state
      const updatedCustomAvailability = customAvailability.filter(item => item.id !== id)
      setCustomAvailability(updatedCustomAvailability)
      
      // Save to backend via dedicated availability endpoint
      await teamAPI.updateAvailability(memberId, { ...(memberAvailabilityRaw || {}), workingHours, customAvailability: updatedCustomAvailability })
      
      // Refresh team member data
      await fetchTeamMemberDetails()
    } catch (error) {
      console.error('Error removing custom availability:', error)
      alert('Failed to remove date override. Please try again.')
      // Revert local state on error
      await fetchTeamMemberDetails()
    } finally {
      setSavingCustomAvailability(false)
    }
  }

  const handleAddTimeSlot = (day) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: [
          ...(prev[day]?.timeSlots || []),
          {
            id: Date.now(),
            start: '09:00',
            end: '17:00',
            enabled: true
          }
        ]
      }
    }))
  }

  const handleRemoveTimeSlot = (day, slotId) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: (prev[day]?.timeSlots || []).filter(slot => slot.id !== slotId)
      }
    }))
  }

  const handleTimeSlotChange = (day, slotId, field, value) => {
    setWorkingHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        timeSlots: (prev[day]?.timeSlots || []).map(slot => 
          slot.id === slotId ? { ...slot, [field]: value } : slot
        )
      }
    }))
  }

  const generateTimeOptions = () => {
    const options = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
        options.push(time)
      }
    }
    return options
  }

  const timeOptions = generateTimeOptions()

  const getDayColor = (day) => {
    const colors = {
      sunday: 'bg-red-50 border-red-200',
      monday: 'bg-[var(--sf-blue-50)] border-blue-200',
      tuesday: 'bg-green-50 border-green-200',
      wednesday: 'bg-yellow-50 border-yellow-200',
      thursday: 'bg-purple-50 border-purple-200',
      friday: 'bg-pink-50 border-pink-200',
      saturday: 'bg-indigo-50 border-indigo-200'
    }
    return colors[day.toLowerCase()] || 'bg-[var(--sf-bg-page)] border-[var(--sf-border-light)]'
  }

  const handleSaveSettings = async (newSettings) => {
    try {
      const updateData = {
        permissions: JSON.stringify(newSettings)
      }
      
      console.log('Saving settings:', updateData)
      await teamAPI.update(memberId, updateData)
      
      setSettings(newSettings)
      // Refresh team member data
      await fetchTeamMemberDetails()
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings. Please try again.')
    }
  }

  // Handle address input change with backend proxy
  const handleLocationChange = async (e) => {
    const value = e.target.value
    setEditFormData(prev => ({ ...prev, location: value }))
    
    if (value.length < 3) {
      setAddressSuggestions([])
      setShowAddressSuggestions(false)
      return
    }

    try {
      setAddressLoading(true)
      const response = await fetch(`https://service-flow-backend-production.up.railway.app/api/places/autocomplete?input=${encodeURIComponent(value)}`)
      const data = await response.json()
      
      if (!response.ok) {
        console.error('Address suggestions API error:', data)
        setError(`Address suggestions failed: ${data.error || 'Unknown error'}`)
        setAddressSuggestions([])
        setShowAddressSuggestions(false)
        return
      }
      
      if (data.predictions) {
        setAddressSuggestions(data.predictions)
        setShowAddressSuggestions(true)
      }
    } catch (error) {
      console.error('Error fetching address suggestions:', error)
    } finally {
      setAddressLoading(false)
    }
  }

  // Handle address selection
  const handleAddressSelect = async (suggestion) => {
    try {
      const response = await fetch(`https://service-flow-backend-production.up.railway.app/api/places/details?place_id=${suggestion.place_id}`)
      const data = await response.json()
      
      if (data.result) {
        const place = data.result
        let city = ''
        let state = ''
        let zipCode = ''
        
        // Extract address components
        if (place.address_components) {
          place.address_components.forEach(component => {
            if (component.types.includes('locality')) {
              city = component.long_name
            }
            if (component.types.includes('administrative_area_level_1')) {
              state = component.short_name
            }
            if (component.types.includes('postal_code')) {
              zipCode = component.long_name
            }
          })
        }
        
        setEditFormData(prev => ({
          ...prev,
          location: suggestion.description,
          city: city,
          state: state,
          zip_code: zipCode
        }))
      }
    } catch (error) {
      console.error('Error fetching place details:', error)
    } finally {
      setShowAddressSuggestions(false)
      setAddressSuggestions([])
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addressRef.current && !addressRef.current.contains(event.target)) {
        setShowAddressSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])



  // Map territory IDs to full territory objects when available territories load
  useEffect(() => {
    if (availableTerritories.length > 0) {
      const mappedTerritories = territories.map(territoryId => {
        // Ensure territoryId is a number for comparison
        const numericId = typeof territoryId === 'string' ? parseInt(territoryId) : territoryId
        
        // Find the full territory object by ID
        const fullTerritory = availableTerritories.find(t => t.id === numericId)
        
        if (fullTerritory) {
          return fullTerritory
        } else {
          return { id: numericId, name: `Territory ${numericId}` }
        }
      })
      
      setDisplayedTerritories(mappedTerritories)
    } else if (territories.length === 0) {
      // If no territories, clear displayed territories
      setDisplayedTerritories([])
    }
  }, [availableTerritories, territories])

  if (loading) {
    return (
      <div className="flex h-screen bg-[var(--sf-bg-page)]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-[var(--sf-text-secondary)]">Loading team member details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen bg-[var(--sf-bg-page)]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => navigate('/team')}
              className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
          >
            Back to Team
          </button>
          </div>
        </div>
      </div>
    )
  }

  if (!teamMember) {
    return (
      <div className="flex h-screen bg-[var(--sf-bg-page)]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
            <XCircle className="w-12 h-12 text-[var(--sf-text-muted)] mx-auto mb-4" />
            <p className="text-[var(--sf-text-secondary)] mb-4">Team member not found</p>
          <button 
            onClick={() => navigate('/team')}
              className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
          >
            Back to Team
          </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
   <div className="flex h-screen bg-[var(--sf-bg-page)] overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Notification Display */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg shadow-lg ${
            notification.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center">
              {notification.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              )}
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-[var(--sf-bg-page)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">

            {/* Main Content */}
            <div className="space-y-4 sm:space-y-6">
              {/* Profile Header Card with Map */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 gap-4">
            <button
              onClick={() => navigate("/team")}
                    className="flex items-center text-sm text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] self-start"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              All Team Members
            </button>
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <button
                      onClick={handleEditMember}
                      className="px-3 sm:px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)]"
                    >
                      Edit
                    </button>
                    {!(teamMember?.role === 'account owner' || teamMember?.role === 'owner' || teamMember?.role === 'admin') && (
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>

                {/* Two Column Layout: Profile Info Left, Map Right */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Profile Information */}
                  <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6">
                  {/* Profile Picture - Larger and Circular */}
                    <div
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl font-semibold overflow-hidden flex-shrink-0 mx-auto sm:mx-0"
                    style={{ backgroundColor: teamMember?.profile_picture ? 'transparent' : (teamMember?.color || '#2563EB') }}
                    >
                    {teamMember?.profile_picture ? (
                      <img 
                        src={getImageUrl(teamMember.profile_picture)} 
                        alt={`${decodeHtmlEntities(teamMember?.first_name || '')} ${decodeHtmlEntities(teamMember?.last_name || '')}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Failed to load profile picture:', teamMember.profile_picture);
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-xl sm:text-2xl">
                      {decodeHtmlEntities(teamMember?.first_name || 'T')?.charAt(0) || 'T'}{decodeHtmlEntities(teamMember?.last_name || 'M')?.charAt(0) || 'M'}
                      </span>
                    )}
                    </div>
                  <div className="flex-1 w-full text-center sm:text-left">
                    <h1 className="text-xl sm:text-2xl font-semibold text-[var(--sf-text-primary)] mb-1">
                        {decodeHtmlEntities(teamMember?.first_name || 'First')} {decodeHtmlEntities(teamMember?.last_name || 'Last')}
                      </h1>
                    <p className="text-sm text-[var(--sf-text-secondary)] mb-4 sm:mb-6">
                        {teamMember?.role === 'account owner' || teamMember?.role === 'owner' || teamMember?.role === 'admin' 
                          ? 'Account Owner' 
                          : teamMember?.role === 'manager' 
                            ? 'Manager' 
                            : teamMember?.role === 'scheduler' 
                              ? 'Scheduler' 
                              : teamMember?.role === 'worker' || teamMember?.role === 'technician' 
                              ? 'Team member' 
                                : teamMember?.role || 'Team Member'}
                      </p>
                    </div>
                </div>

                {/* Notification Banner */}
                {notification && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    notification.type === 'success' 
                      ? 'bg-green-50 border border-green-200 text-green-800' 
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{notification.message}</span>
                      <button
                        onClick={() => setNotification(null)}
                        className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Contact Information Grid */}
                <div className="mt-4 sm:mt-6 space-y-3">
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Mobile phone</span>
                    <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">{teamMember?.phone || 'No phone number'}</span>
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Email</span>
                    <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2 break-words">{teamMember?.email || 'No email'}</span>
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Address</span>
                    <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">
                      {teamMember?.location || 'No address on file'}
                      {teamMember?.city && teamMember?.state && (
                        <span className="block text-[var(--sf-text-secondary)]">
                          {teamMember.city}, {teamMember.state} {teamMember.zip_code}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Status</span>
                    <span className="text-sm sm:col-span-2">
                      {(() => {
                        const status = teamMember?.status?.toLowerCase() || 'unknown';
                        if (status === 'active' || status === 'activated') {
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Account Activated
                            </span>
                          );
                        } else if (status === 'invited' || status === 'pending') {
                          return (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Pending Invitation
                              </span>
                              <button
                                onClick={handleResendInvite}
                                disabled={resendingInvite}
                                className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium underline disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {resendingInvite ? 'Sending...' : 'Resend Invite'}
                              </button>
                            </div>
                          );
                        } else if (status === 'inactive' || status === 'deactivated') {
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]">
                              <XCircle className="w-3 h-3 mr-1" />
                              Inactive
                            </span>
                          );
                        } else {
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]">
                              {teamMember?.status || 'Unknown'}
                            </span>
                          );
                        }
                      })()}
                    </span>
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Role</span>
                    <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">
                      {teamMember?.role === 'account owner' || teamMember?.role === 'owner' || teamMember?.role === 'admin' 
                        ? 'Account Owner' 
                        : teamMember?.role === 'manager' 
                          ? 'Manager' 
                          : teamMember?.role === 'scheduler' 
                            ? 'Scheduler' 
                            : teamMember?.role === 'worker' || teamMember?.role === 'technician' 
                              ? 'Worker' 
                              : teamMember?.role || 'Team Member'}
                    </span>
                  </div>
                  {/* Payment Settings Section */}
                  <div className="border-t border-[var(--sf-border-light)] pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3">Payment Settings</h3>
                    
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Hourly Rate</span>
                    <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">
                      {editing ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-[var(--sf-text-muted)]">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editFormData.hourly_rate !== undefined ? editFormData.hourly_rate : (teamMember?.hourly_rate || '')}
                            onChange={(e) => setEditFormData({ ...editFormData, hourly_rate: parseFloat(e.target.value) || null })}
                            className="flex-1 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                            placeholder="0.00"
                          />
                            <span className="text-xs text-[var(--sf-text-muted)]">/hour</span>
                        </div>
                      ) : (
                          <div className="flex items-center space-x-2">
                            {teamMember?.hourly_rate 
                              ? <span>${parseFloat(teamMember.hourly_rate).toFixed(2)}/hour</span>
                              : <span className="text-[var(--sf-text-muted)] italic">Not set</span>
                            }
                            {!editing && (
                              <button
                                onClick={handleEditMember}
                                className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] underline ml-2"
                              >
                                Set hourly rate
                              </button>
                            )}
                          </div>
                      )}
                    </span>
                    </div>
                    
                    <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                      <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Commission %</span>
                      <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">
                        {editing ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editFormData.commission_percentage !== undefined ? editFormData.commission_percentage : (teamMember?.commission_percentage || '')}
                              onChange={(e) => setEditFormData({ ...editFormData, commission_percentage: parseFloat(e.target.value) || null })}
                              className="flex-1 border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                              placeholder="0.00"
                            />
                            <span className="text-[var(--sf-text-muted)]">%</span>
                            <span className="text-xs text-[var(--sf-text-muted)]">of job revenue</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            {teamMember?.commission_percentage 
                              ? <span>{parseFloat(teamMember.commission_percentage).toFixed(2)}% of job revenue</span>
                              : <span className="text-[var(--sf-text-muted)] italic">Not set</span>
                            }
                            {!editing && (
                              <button
                                onClick={handleEditMember}
                                className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] underline ml-2"
                              >
                                Set commission
                              </button>
                            )}
                          </div>
                        )}
                      </span>
                    </div>
                    
                    {(teamMember?.hourly_rate || teamMember?.commission_percentage) && (
                      <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Payment Method</span>
                        <span className="text-sm text-[var(--sf-text-primary)] sm:col-span-2">
                          {teamMember?.hourly_rate && teamMember?.commission_percentage 
                            ? 'Hybrid (Hourly + Commission)'
                            : teamMember?.hourly_rate 
                              ? 'Hourly Rate Only'
                              : 'Commission Percentage Only'
                          }
                        </span>
                      </div>
                    )}
                    
                    {!editing && !teamMember?.hourly_rate && !teamMember?.commission_percentage && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-xs text-yellow-800">
                          <strong>Note:</strong> Set an hourly rate or commission percentage to enable payroll calculations. Click "Edit" above to set payment settings.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 py-2">
                    <span className="text-sm text-[var(--sf-text-secondary)] font-medium sm:font-normal">Role permissions</span>
                    <div className="text-sm text-[var(--sf-text-primary)] sm:col-span-2 space-y-1">
                      {(() => {
                        // Define permission list based on role
                        const permissions = [];
                        if (teamMember?.role === 'worker') {
                          // Worker permissions from settings - use exact field names from database
                          // Only show permissions that are explicitly set to true
                          if (settings.viewCustomerContact === true) permissions.push('View contact info for customer (phone & email)');
                          if (settings.viewCustomerNotes === true) permissions.push('View customer notes');
                          if (settings.markJobStatus === true) permissions.push('Mark jobs as \'en-route\', \'in-progress\' & \'complete\'');
                          if (settings.resetJobStatuses === true) permissions.push('Reset job statuses');
                          if (settings.editJobDetails === true) permissions.push('Edit job details');
                          if (settings.viewEditJobPrice === true) permissions.push('View & edit job price, invoice, and line items');
                          if (settings.processPayments === true) permissions.push('Process payments and mark jobs as paid');
                          if (settings.rescheduleJobs === true) permissions.push('Reschedule jobs');
                          if (settings.seeOtherProviders === true) permissions.push('See other providers assigned');
                          if (settings.editAvailability === true) permissions.push('Edit their own availability');
                        } else if (teamMember?.role === 'scheduler') {
                          permissions.push('Access all jobs and all customers');
                          permissions.push('Create, edit, cancel, reschedule jobs');
                          permissions.push('Assign or un-assign jobs');
                          if (settings.processPayments) permissions.push('Process payments for jobs');
                        } else if (teamMember?.role === 'manager') {
                          permissions.push('Full access to all areas except billing');
                        } else {
                          permissions.push('Full access to all areas of account');
                        }
                        
                        if (permissions.length === 0) {
                          return <span>No specific permissions set</span>;
                        }
                        
                        return (
                          <ul className="space-y-1">
                            {permissions.map((permission, index) => (
                              <li key={index} className="flex items-center">
                                <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                                <span>{permission}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                  </div>

                  {/* Right Column: Map */}
                  <div className="lg:col-span-1">
                    {!staffLocationsEnabled ? (
                      <div className="h-64 sm:h-80 bg-[var(--sf-bg-page)] rounded-lg flex items-center justify-center border border-[var(--sf-border-light)]">
                        <div className="text-center px-4">
                          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-[var(--sf-text-muted)]">Staff locations are currently hidden</p>
                        </div>
                      </div>
                    ) : (() => {
                      // Helper function to get address from team member
                      const getMemberAddress = (member) => {
                        if (member.location) return member.location
                        if (member.city && member.state) {
                          const parts = [member.city, member.state]
                          if (member.zip_code) parts.push(member.zip_code)
                          return parts.join(', ')
                        }
                        if (member.address) return member.address
                        return null
                      }

                      // Get current team member's address only
                      const currentAddress = getMemberAddress(teamMember)

                      if (!currentAddress) {
                        return (
                          <div className="h-64 sm:h-80 bg-[var(--sf-bg-page)] rounded-lg flex items-center justify-center border border-[var(--sf-border-light)]">
                            <div className="text-center">
                              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                              <p className="text-sm text-[var(--sf-text-muted)]">No address on file</p>
                            </div>
                          </div>
                        )
                      }

                      // Build Google Maps URL for current member's address only
                      // Use place API with higher zoom (15) for close range view
                      const mapUrl = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(currentAddress)}&zoom=15&maptype=roadmap`

                      return (
                        <div className="relative">
                          <div className="h-64 sm:h-80 rounded-lg overflow-hidden border border-[var(--sf-border-light)]">
                            <iframe
                              title="Team Member Location"
                              width="100%"
                              height="100%"
                              style={{ border: 0 }}
                              loading="lazy"
                              allowFullScreen
                              referrerPolicy="no-referrer-when-downgrade"
                              src={mapUrl}
                            />
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Jobs Card */}
              <TeamMemberJobsSection
                jobs={memberJobs}
                loading={memberJobsLoading}
                tab={memberJobsTab}
                onTabChange={setMemberJobsTab}
                onJobClick={(id) => navigate(`/job/${id}`)}
                onViewAll={() => navigate(`/jobs?teamMember=${memberId}`)}
              />

              {/* Availability Card */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base font-semibold text-[var(--sf-text-primary)] mb-2">Availability</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)]">
                    Manage this team member's availability by editing their regular work hours, or by adding custom availability for specific dates.{' '}
                    <a href="#" className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]">Learn more...</a>
                  </p>
                </div>

                {/* Allow Edit Availability Toggle */}
                <div className="flex items-center justify-between py-4 border-b border-[var(--sf-border-light)]">
                  <div className="flex items-start space-x-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--sf-text-primary)]">
                        Allow this team member to edit their availability
                      </p>
                      <p className="text-sm text-[var(--sf-text-secondary)]">
                        The team member's role allows them to edit their availability
                      </p>
                    </div>
                  </div>
                  <button
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      settings.canEditAvailability ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                    onClick={async () => {
                      const newSettings = { ...settings, canEditAvailability: !settings.canEditAvailability }
                      setSettings(newSettings)
                      await handleSaveSettings(newSettings)
                    }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.canEditAvailability ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Recurring Hours and Custom Availability Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mt-4 sm:mt-6">
                  {/* Recurring Hours */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-[var(--sf-text-muted)]" />
                        <h4 className="text-xs font-semibold text-[var(--sf-text-primary)] uppercase tracking-wide">Recurring Hours</h4>
                        <HelpCircle className="w-4 h-4 text-[var(--sf-text-muted)]" />
                      </div>
                    </div>

                    <div className="space-y-0 border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
                      {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day, index) => {
                        const { available = false, hours = '', timeSlots = [], start, end } = workingHours[day] || {};
                        return (
                        <div
                          key={day}
                          className={`flex items-center justify-between px-4 py-3 ${
                            index !== 6 ? 'border-b border-[var(--sf-border-light)]' : ''
                          }`}
                        >
                          <span className="text-sm font-medium text-[var(--sf-text-primary)] capitalize w-24">
                            {day}
                          </span>
                          <span className="text-sm text-[var(--sf-text-secondary)] text-right flex-1">
                            {available ? (
                              start && end ? (
                                `${start} - ${end}`
                              ) : timeSlots.length > 0 ? (
                                timeSlots.map((slot, slotIndex) => (
                                  <span key={slot.id || slotIndex}>
                                    {slot.start} - {slot.end}
                                    {slotIndex < timeSlots.length - 1 && ', '}
                                  </span>
                                ))
                              ) : (
                                hours || '9:00 AM - 6:00 PM'
                              )
                            ) : (
                              'Unavailable'
                            )}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                    {memberAvailabilityRaw?.break && (
                      <div className="mt-3 flex justify-between items-center text-sm bg-[var(--sf-bg-page)] rounded-lg px-4 py-2.5 border border-[var(--sf-border-light)]">
                        <span className="font-medium text-[var(--sf-text-primary)]">Break</span>
                        <span className="text-[var(--sf-text-secondary)]">{memberAvailabilityRaw.break.start} - {memberAvailabilityRaw.break.end}</span>
                      </div>
                    )}

                    <button
                      onClick={() => setShowWeeklyHoursModal(true)}
                      className="mt-3 text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium"
                    >
                      Edit Hours
                    </button>
                  </div>

                  {/* Custom Availability */}
                  {(() => {
                    const formatOverrideHours = (hours) => {
                      if (!hours) return ''
                      if (Array.isArray(hours)) {
                        return hours
                          .filter(h => h && h.start && h.end)
                          .map(h => `${h.start} - ${h.end}`)
                          .join(', ')
                      }
                      if (typeof hours === 'string') {
                        if (hours.toLowerCase() === 'unavailable') return ''
                        return hours
                      }
                      return ''
                    }
                    const timeOffEntries = customAvailability.filter(item => item.available === false)
                    const additionalHoursEntries = customAvailability.filter(item => item.available !== false && Array.isArray(item.hours) && item.hours.length > 0)
                    const openModal = (mode, existing = null) => {
                      setOverrideModalMode(mode)
                      setEditingOverride(existing)
                      setShowAvailabilityModal(true)
                    }
                    return (
                      <>
                        {/* Time Off */}
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-[var(--sf-text-muted)]" />
                              <h4 className="text-xs font-semibold text-[var(--sf-text-primary)] uppercase tracking-wide">Time Off</h4>
                              <HelpCircle className="w-4 h-4 text-[var(--sf-text-muted)]" />
                            </div>
                          </div>
                          {/* Quick-action chips — one click writes a time-off entry for the
                              chosen date. Skips the modal entirely for the 90% workflow.
                              Each chip is disabled while a save is in flight to prevent
                              double-fire races. */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {getQuickTimeOffChips().map(chip => {
                              const alreadyOff = customAvailability.some(
                                item => item.date === chip.date && item.available === false
                              )
                              return (
                                <button
                                  key={chip.key}
                                  type="button"
                                  onClick={() => handleQuickTimeOff(chip.date, chip.label)}
                                  disabled={savingCustomAvailability || alreadyOff}
                                  title={alreadyOff ? `Already off on ${chip.date}` : `Mark off on ${chip.date}`}
                                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                                    alreadyOff
                                      ? 'bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] border-[var(--sf-border-light)] cursor-not-allowed'
                                      : savingCustomAvailability
                                        ? 'bg-white text-[var(--sf-text-muted)] border-[var(--sf-border-light)] cursor-wait'
                                        : 'bg-white text-[var(--sf-text-primary)] border-[var(--sf-border-light)] hover:bg-[var(--sf-bg-page)] hover:border-[var(--sf-blue-500)]'
                                  }`}
                                >
                                  {alreadyOff ? `${chip.label} ✓` : chip.label}
                                </button>
                              )
                            })}
                            <button
                              type="button"
                              onClick={() => openModal('unavailable')}
                              disabled={savingCustomAvailability}
                              className="text-xs font-medium px-3 py-1.5 rounded-full border border-dashed border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-page)] hover:border-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Custom date…
                            </button>
                          </div>
                          {timeOffEntries.length === 0 ? (
                            <div className="border-2 border-dashed border-[var(--sf-border-light)] rounded-lg p-6 text-center">
                              <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                              <p className="text-xs text-[var(--sf-text-secondary)]">
                                No time off scheduled. Use a quick action above or "Custom date…".
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {timeOffEntries.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-3 border border-[var(--sf-border-light)] rounded-lg"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-[var(--sf-text-primary)]">{item.date}</p>
                                    <p className="text-xs text-[var(--sf-text-secondary)]">{item.label || 'Unavailable'}</p>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveCustomAvailability(item.id)}
                                    className="text-[var(--sf-text-muted)] hover:text-red-600"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Additional Hours */}
                        <div className="mt-8">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-[var(--sf-text-muted)]" />
                              <h4 className="text-xs font-semibold text-[var(--sf-text-primary)] uppercase tracking-wide">Additional Hours</h4>
                              <HelpCircle className="w-4 h-4 text-[var(--sf-text-muted)]" />
                            </div>
                          </div>
                          {additionalHoursEntries.length === 0 ? (
                            <div className="border-2 border-dashed border-[var(--sf-border-light)] rounded-lg p-8 text-center">
                              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                              <h5 className="text-sm font-medium text-[var(--sf-text-primary)] mb-1">Add additional hours</h5>
                              <p className="text-xs text-[var(--sf-text-secondary)] mb-4">
                                Add custom working hours on a specific date (e.g. a day normally off).
                              </p>
                              <button
                                onClick={() => openModal('custom_hours')}
                                className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium"
                              >
                                Add Additional Hours
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {additionalHoursEntries.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-3 border border-[var(--sf-border-light)] rounded-lg"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-[var(--sf-text-primary)]">{item.date}</p>
                                    <p className="text-xs text-[var(--sf-text-secondary)]">{formatOverrideHours(item.hours)}</p>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveCustomAvailability(item.id)}
                                    className="text-[var(--sf-text-muted)] hover:text-red-600"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => openModal('custom_hours')}
                                className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium"
                              >
                                Add Additional Hours
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
              {/* Notifications Card */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base font-semibold text-[var(--sf-text-primary)] mb-2">Notifications</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)]">
                    How should this service provider be notified when they are assigned to a job?
                  </p>
                </div>

                <div className="bg-[var(--sf-bg-page)] rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <Bell className="w-5 h-5 text-[var(--sf-text-muted)] mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[var(--sf-text-primary)]">Push Alerts: Not enabled</p>
                      <p className="text-sm text-[var(--sf-text-secondary)]">
                        This service provider has not enabled push notifications.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-[var(--sf-border-light)]">
                    <div className="flex items-center space-x-3">
                      <Mail className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      <span className="text-sm text-[var(--sf-text-primary)]">Emails</span>
                    </div>
                    <button
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                        settings.emailNotifications ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                      onClick={async () => {
                        const newSettings = { ...settings, emailNotifications: !settings.emailNotifications }
                        setSettings(newSettings)
                        await handleSaveSettings(newSettings)
                      }}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          settings.emailNotifications ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center space-x-3">
                      <MessageSquare className="w-5 h-5 text-[var(--sf-text-muted)]" />
                      <span className="text-sm text-[var(--sf-text-primary)]">Text Messages (SMS)</span>
                    </div>
                    <button
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                        settings.smsNotifications ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                      onClick={async () => {
                        const newSettings = { ...settings, smsNotifications: !settings.smsNotifications }
                        setSettings(newSettings)
                        await handleSaveSettings(newSettings)
                      }}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          settings.smsNotifications ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Skills Card */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base font-semibold text-[var(--sf-text-primary)] mb-2">Skills</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)]">
                    Skill tags can be used to make sure workers meet specific job-related skills, certifications, equipment and licensing requirements.
                  </p>
                </div>

                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">This provider doesn't have any skill tags yet</p>
                  <button className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium">
                    Edit Skills
                  </button>
                </div>
              </div>

              {/* Calendar Color Card */}
              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-base font-semibold text-[var(--sf-text-primary)]">Calendar color</h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    '#F97316', // Orange
                    '#EC4899', // Pink
                    '#EF4444', // Red
                    '#EAB308', // Yellow
                    '#A855F7', // Purple
                    '#3B82F6', // Blue
                    '#10B981', // Green
                    '#06B6D4', // Cyan
                    '#14B8A6', // Teal
                    '#E11D48', // Rose
                    '#DC2626', // Dark Red
                    '#1E293B', // Slate
                    '#0D9488', // Teal Dark
                    '#7C3AED', // Violet
                  ].map((color) => (
                    <button
                      key={color}
                      onClick={async () => {
                        setEditFormData({ ...editFormData, color })
                        const updateData = { ...teamMember, color }
                        await teamAPI.update(memberId, { color })
                        setTeamMember(updateData)
                      }}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${
                        (editFormData.color || teamMember?.color) === color
                          ? 'border-gray-900 scale-110'
                          : 'border-[var(--sf-border-light)] hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Delete Button - Hidden for account owner */}
              {!(teamMember?.role === 'account owner' || teamMember?.role === 'owner' || teamMember?.role === 'admin') && (
                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
                  <button
                    onClick={handleDeleteMember}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Delete Team Member
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
         
      {/* Add Territory Modal */}
      {showAddTerritoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
                      <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Add Territory</h3>
                        <button 
                onClick={() => setShowAddTerritoryModal(false)}
                className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                        >
                <X className="w-5 h-5" />
                        </button>
                      </div>
                      
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Select Territory</label>
                {territoryLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-[var(--sf-text-muted)] mt-2">Loading territories...</p>
                                </div>
                ) : (
                  <select
                    onChange={(e) => {
                      const territoryId = parseInt(e.target.value)
                      if (territoryId) {
                        handleSaveTerritory(territoryId)
                        e.target.value = "" // Reset dropdown
                      }
                    }}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-md text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>Select a territory</option>
                    {console.log('Available territories in modal:', availableTerritories)}
                    {console.log('Current territories:', territories)}
                    {availableTerritories
                      .filter(t => !territories.find(ct => (typeof ct === 'object' ? ct.id : ct) === t.id))
                      .map(territory => (
                        <option key={territory.id} value={territory.id}>
                          {territory.name} {territory.location ? `- ${territory.location}` : ''}
                        </option>
                      ))}
                  </select>
                )}
        </div>
      </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowAddTerritoryModal(false)}
                className="flex-1 px-4 py-2 border border-[var(--sf-border-light)] rounded-md text-sm font-medium text-[var(--sf-text-primary)] bg-white hover:bg-[var(--sf-bg-page)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Hours Modal */}
      {showWeeklyHoursModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[var(--sf-border-light)]">
              <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Edit Weekly Hours</h3>
              <button
                onClick={() => setShowWeeklyHoursModal(false)}
                className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {Object.entries(workingHours).map(([day, { available, hours, timeSlots = [] }], index) => (
                  <div key={day} className="flex items-center justify-between p-4 bg-[var(--sf-bg-page)] rounded-lg">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={available}
                        onChange={(e) => setWorkingHours(prev => ({
                          ...prev,
                          [day]: { ...prev[day], available: e.target.checked }
                        }))}
                        className="h-4 w-4 text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded"
                      />
                      <span className="text-sm font-medium text-[var(--sf-text-primary)] capitalize min-w-[80px]">
                        {day}
                      </span>
                    </div>

                    {available ? (
                      <div className="flex-1 flex items-center justify-end min-w-0">
                        <div className="flex flex-col space-y-2 w-full max-w-xs">
                          {timeSlots.length === 0 && (
                            <button
                              onClick={() => handleAddTimeSlot(day)}
                              className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium self-start"
                            >
                              + Add Hours
                            </button>
                          )}
                          {timeSlots.map((slot, slotIndex) => (
                            <div key={slot.id} className="flex items-center space-x-2 flex-wrap">
                              <select
                                value={slot.start}
                                onChange={(e) => handleTimeSlotChange(day, slot.id, 'start', e.target.value)}
                                className="text-sm border border-[var(--sf-border-light)] rounded px-2 py-1 min-w-0 flex-shrink-0"
                              >
                                {timeOptions.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-sm text-[var(--sf-text-muted)] flex-shrink-0">to</span>
                              <select
                                value={slot.end}
                                onChange={(e) => handleTimeSlotChange(day, slot.id, 'end', e.target.value)}
                                className="text-sm border border-[var(--sf-border-light)] rounded px-2 py-1 min-w-0 flex-shrink-0"
                              >
                                {timeOptions.map(time => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleRemoveTimeSlot(day, slot.id)}
                                className="text-red-600 hover:text-red-700 p-1 flex-shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              {slotIndex === timeSlots.length - 1 && (
                                <button
                                  onClick={() => handleAddTimeSlot(day)}
                                  className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium flex-shrink-0"
                                >
                                  + Add More
                                </button>
                              )}
                            </div>
                          ))}
                          {timeSlots.length > 0 && (
                            <button
                              onClick={() => handleSaveDay(day)}
                              disabled={savingDay === day}
                              className={`text-xs font-medium px-2 py-1 rounded self-start ${savingDay === day
                                  ? 'text-[var(--sf-text-muted)] cursor-not-allowed bg-[var(--sf-bg-page)]'
                                  : 'text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100'
                                }`}
                            >
                              {savingDay === day ? 'Saving...' : 'Save'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-[var(--sf-text-muted)]">
                        Unavailable
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Common Break */}
              <div className="mt-4 p-4 bg-[var(--sf-bg-page)] rounded-lg">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={!!memberAvailabilityRaw?.break}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setMemberAvailabilityRaw(prev => ({ ...prev, break: { start: '13:00', end: '14:00' } }))
                      } else {
                        setMemberAvailabilityRaw(prev => { const { break: _, ...rest } = prev || {}; return rest; })
                      }
                    }}
                    className="h-4 w-4 text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded"
                  />
                  <span className="text-sm font-medium text-[var(--sf-text-primary)]">Daily Break</span>
                </label>
                {memberAvailabilityRaw?.break && (
                  <div className="flex items-center space-x-2 mt-3 ml-7">
                    <select
                      value={memberAvailabilityRaw.break.start}
                      onChange={(e) => setMemberAvailabilityRaw(prev => ({ ...prev, break: { ...prev.break, start: e.target.value } }))}
                      className="text-sm border border-[var(--sf-border-light)] rounded px-2 py-1"
                    >
                      {Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2,'0')}:00`, `${String(h).padStart(2,'0')}:30`]).flat().map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-sm text-[var(--sf-text-muted)]">to</span>
                    <select
                      value={memberAvailabilityRaw.break.end}
                      onChange={(e) => setMemberAvailabilityRaw(prev => ({ ...prev, break: { ...prev.break, end: e.target.value } }))}
                      className="text-sm border border-[var(--sf-border-light)] rounded px-2 py-1"
                    >
                      {Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2,'0')}:00`, `${String(h).padStart(2,'0')}:30`]).flat().map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-[var(--sf-border-light)]">
              <button
                onClick={() => setShowWeeklyHoursModal(false)}
                className="px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-md hover:bg-[var(--sf-bg-page)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveHours}
                disabled={savingHours}
                className={`px-4 py-2 text-sm font-medium text-white bg-[var(--sf-blue-500)] border border-transparent rounded-md hover:bg-[var(--sf-blue-600)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)] disabled:opacity-50 ${savingHours ? 'cursor-not-allowed' : ''}`}
              >
                {savingHours ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteModal(false)
            }
          }}
        >
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                  Deactivate Team Member
                </h3>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-muted)] hover:bg-[var(--sf-bg-hover)] p-1 rounded-full transition-colors"
                  disabled={deleting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Error Message Display */}
              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                    <p className="text-sm text-red-700">{deleteError}</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <p className="text-[var(--sf-text-secondary)]">
                  Are you sure you want to deactivate <strong>{decodeHtmlEntities(teamMember?.first_name || '')} {decodeHtmlEntities(teamMember?.last_name || '')}</strong>? 
                  They will no longer be able to access the system, but their data will be preserved and they can be reactivated later.
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false)
                    setDeleteError("") // Clear error when closing modal
                  }}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-[var(--sf-border-light)] rounded-md text-sm font-medium text-[var(--sf-text-primary)] bg-white hover:bg-[var(--sf-bg-page)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeactivateMember}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {deleting ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Override Modal */}
      <DateOverrideModal
        isOpen={showAvailabilityModal}
        onClose={() => { setShowAvailabilityModal(false); setEditingOverride(null) }}
        onSave={handleAvailabilityModalSave}
        existingOverride={editingOverride}
        defaultMode={overrideModalMode}
      />

      {/* Edit Team Member Modal */}
      {editing && teamMember && (
        <AddTeamMemberModal
          isOpen={editing}
          onClose={() => {
            setEditing(false)
          }}
          onSuccess={handleMemberUpdate}
          userId={user?.id}
          member={teamMember}
          isEditing={true}
        />
      )}

      {/* Inline toast — quick feedback for chip-driven saves so the operator
          isn't left wondering whether the click landed. Auto-dismisses after
          3.5s; keyed by id so a fresh toast restarts the timer cleanly. */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.kind === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-[var(--sf-text-primary)] text-white'
          }`}
        >
          {toast.kind === 'error'
            ? <AlertCircle className="w-4 h-4" />
            : <CheckCircle className="w-4 h-4" />}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  )
}

// ── Jobs Section ─────────────────────────────────────────────
// Shows jobs assigned to this team member with Upcoming / Past / All
// slices and a link out to the Jobs page pre-filtered to this member.

const tmTodayYMD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tmJobDate = (j) => String(j.scheduled_date || '').split('T')[0].split(' ')[0]

const tmIsCancelled = (j) => {
  const s = (j.status || '').toLowerCase()
  return s === 'cancelled' || s === 'canceled'
}

const tmIsPast = (j) => {
  const s = (j.status || '').toLowerCase()
  if (s === 'completed' || s === 'complete' || s === 'done' || s === 'finished') return true
  return tmJobDate(j) < tmTodayYMD() && !tmIsCancelled(j)
}

const tmFormatDateShort = (s) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  if (!y) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const tmStatusBadge = (raw) => {
  const s = (raw || '').toLowerCase()
  if (s.includes('progress')) return { label: 'In progress', fg: '#0E7490', bg: '#CFFAFE' }
  if (s === 'en_route' || s === 'enroute' || s === 'en route') return { label: 'En route', fg: '#7C2D12', bg: '#FFEDD5' }
  if (s === 'completed' || s === 'complete' || s === 'done') return { label: 'Completed', fg: '#15803D', bg: '#ECFDF5' }
  if (s === 'cancelled' || s === 'canceled') return { label: 'Cancelled', fg: '#9F1239', bg: '#FFE4E6' }
  return { label: 'Scheduled', fg: '#1D4ED8', bg: '#DBEAFE' }
}

const TeamMemberJobsSection = ({ jobs, loading, tab, onTabChange, onJobClick, onViewAll }) => {
  const today = tmTodayYMD()

  const counts = {
    upcoming: jobs.filter((j) => tmJobDate(j) >= today && !tmIsCancelled(j)).length,
    past: jobs.filter(tmIsPast).length,
    all: jobs.length,
  }

  let visible = jobs
  if (tab === 'upcoming') visible = jobs.filter((j) => tmJobDate(j) >= today && !tmIsCancelled(j))
  else if (tab === 'past') visible = jobs.filter(tmIsPast)

  // Upcoming: soonest first. Past/All: most recent first.
  visible = [...visible].sort((a, b) => {
    const ad = tmJobDate(a)
    const bd = tmJobDate(b)
    if (tab === 'upcoming') return ad.localeCompare(bd)
    return bd.localeCompare(ad)
  })

  const TABS = [
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
    { id: 'past', label: 'Past', count: counts.past },
    { id: 'all', label: 'All', count: counts.all },
  ]

  return (
    <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-[var(--sf-text-primary)] mb-2">Jobs</h3>
          <p className="text-sm text-[var(--sf-text-secondary)]">
            Jobs assigned to this team member across the past and next six months.
          </p>
        </div>
        <button
          onClick={onViewAll}
          className="text-sm text-[var(--sf-blue-500)] hover:underline font-medium whitespace-nowrap"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          View all in Jobs →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium"
              style={{
                background: active ? 'var(--sf-blue-soft, #DBEAFE)' : 'transparent',
                color: active ? 'var(--sf-blue-dark, #1D4ED8)' : 'var(--sf-text-secondary, #475569)',
                border: `1px solid ${active ? 'var(--sf-blue-soft-2, #BFDBFE)' : 'var(--sf-border-light, #E2E8F0)'}`,
                cursor: 'pointer',
              }}
            >
              {t.label}
              <span
                className="inline-flex items-center justify-center min-w-[18px] px-1.5 rounded text-[11px] font-semibold"
                style={{
                  background: active ? 'var(--sf-blue-500, #3B82F6)' : 'var(--sf-bg-page, #F1F5F9)',
                  color: active ? '#fff' : 'var(--sf-text-secondary, #475569)',
                }}
              >
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--sf-text-muted)]">Loading jobs…</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--sf-text-muted)]">
          {tab === 'upcoming' ? 'No upcoming jobs assigned.' : tab === 'past' ? 'No past jobs in this window.' : 'No jobs assigned in this window.'}
        </div>
      ) : (
        <div className="divide-y divide-[var(--sf-border-light)] border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
          {visible.slice(0, 15).map((j) => {
            const date = tmJobDate(j)
            const customer = j.customer_name || `${j.customer_first_name || ''} ${j.customer_last_name || ''}`.trim() || '—'
            const status = tmStatusBadge(j.status)
            const value = parseFloat(j.total || j.service_price || 0)
            const addr = j.service_address || j.customer_address || ''
            const idDisp = j.id ? `#${String(j.id).slice(-4)}` : ''
            let timeStr = ''
            if (j.scheduled_date && j.scheduled_date.includes('T')) {
              const d = new Date(j.scheduled_date)
              if (!isNaN(d)) timeStr = formatTimeShared(d)
            }
            return (
              <button
                key={j.id}
                onClick={() => onJobClick(j.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-[var(--sf-bg-page,#F8FAFC)] transition-colors"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ width: 110 }} className="flex-shrink-0">
                  <div className="text-[11px] text-[var(--sf-text-muted)] font-mono">{idDisp}</div>
                  <div className="text-sm font-semibold text-[var(--sf-text-primary)]">{tmFormatDateShort(date)}</div>
                  {timeStr && <div className="text-xs text-[var(--sf-text-secondary)]">{timeStr}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--sf-text-primary)] truncate">{customer}</div>
                  <div className="text-xs text-[var(--sf-text-secondary)] truncate">
                    {j.service_name || 'Service'}
                    {addr && <> · {addr.split(',')[0]}</>}
                  </div>
                </div>
                <div className="hidden sm:block text-sm font-semibold text-[var(--sf-text-primary)]" style={{ width: 70, textAlign: 'right' }}>
                  {value ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </div>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                  style={{ color: status.fg, background: status.bg }}
                >
                  {status.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {visible.length > 15 && (
        <div className="mt-3 text-center">
          <button
            onClick={onViewAll}
            className="text-sm text-[var(--sf-blue-500)] hover:underline font-medium"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            View all {visible.length} jobs →
          </button>
        </div>
      )}
    </div>
  )
}

export default TeamMemberDetails