"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { MapPin, ChevronRight, Check, X, Calendar, Trash2, Edit, Plus, Clock } from "lucide-react"
import TimeslotTemplateModal from "../../components/timeslot-template-modal"
import DateOverrideModal from "../../components/date-override-modal"
import { availabilityAPI, teamAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import { isWorker } from "../../utils/roleUtils"
import SettingsRailLayout from "../../components/settings-rail-layout"
import { SfCard, SfButton, SfTag } from "../../components/sf-primitives"

const Availability = () => {
  const [isTimeslotTemplateModalOpen, setIsTimeslotTemplateModalOpen] = useState(false)
  const [editingTemplateIndex, setEditingTemplateIndex] = useState(null)
  const [showDateOverrideModal, setShowDateOverrideModal] = useState(false)
  const [editingOverrideIndex, setEditingOverrideIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const navigate = useNavigate()

  // Debug counter to track renders
  const renderCount = useMemo(() => {
    console.log('🔄 Availability component rendered')
    return Date.now()
  }, [])

  const [availabilityData, setAvailabilityData] = useState({
    businessHours: {
      monday: { start: '09:00', end: '17:00', enabled: true },
      tuesday: { start: '09:00', end: '17:00', enabled: true },
      wednesday: { start: '09:00', end: '17:00', enabled: true },
      thursday: { start: '09:00', end: '17:00', enabled: true },
      friday: { start: '09:00', end: '17:00', enabled: true },
      saturday: { start: '09:00', end: '17:00', enabled: false },
      sunday: { start: '09:00', end: '17:00', enabled: false }
    },
    drivingTime: 0,
    timeslotTemplates: [],
    dateOverrides: []
  })

  // Business hours editor state
  const [showBusinessHoursEditor, setShowBusinessHoursEditor] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Get current user with useMemo to prevent infinite re-renders
  const { user } = useAuth()

  // Stabilize navigate function
  const handleNavigate = useCallback(() => {
    navigate('/signin')
  }, [navigate])

  const loadAvailabilityData = useCallback(async () => {
    try {
      setLoading(true)
      setMessage({ type: '', text: '' })
      
      console.log('🔄 Loading availability data for user:', user.id, 'isWorker:', isWorker(user), 'teamMemberId:', user?.teamMemberId)
      
      let availability
      let businessHours = null
      let loadedTimeslotTemplates = []
      let loadedDrivingTime = 0
      let loadedDateOverrides = []
      
      // Workers should load their own team member availability
      if (isWorker(user) && user?.teamMemberId) {
        availability = await teamAPI.getAvailability(user.teamMemberId)
        console.log('✅ Worker availability data loaded:', availability)
        
        // Parse worker availability - convert workingHours to businessHours format
        let availData = availability?.availability
        if (typeof availData === 'string') {
          try {
            availData = JSON.parse(availData)
          } catch (e) {
            console.error('Error parsing availability string:', e)
            availData = {}
          }
        }
        
        // Convert workingHours to businessHours format
        if (availData?.workingHours) {
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
          businessHours = {}
          
          days.forEach(day => {
            const dayWorkingHours = availData.workingHours[day]
            if (dayWorkingHours) {
              const isAvailable = dayWorkingHours.available !== false
              let start = '09:00'
              let end = '17:00'
              
              if (isAvailable) {
                // Get time slots
                if (dayWorkingHours.timeSlots && Array.isArray(dayWorkingHours.timeSlots) && dayWorkingHours.timeSlots.length > 0) {
                  const firstSlot = dayWorkingHours.timeSlots[0]
                  start = firstSlot.start || '09:00'
                  end = firstSlot.end || '17:00'
                } else if (dayWorkingHours.start && dayWorkingHours.end) {
                  start = dayWorkingHours.start
                  end = dayWorkingHours.end
                }
              }
              
              businessHours[day] = {
                start: start,
                end: end,
                enabled: isAvailable
              }
            } else {
              // Default for days not set
              businessHours[day] = {
                start: '09:00',
                end: '17:00',
                enabled: day !== 'saturday' && day !== 'sunday'
              }
            }
          })
        }
        loadedTimeslotTemplates = availData?.timeslotTemplates || []
        loadedDrivingTime = availData?.drivingTime ?? 0
        loadedDateOverrides = availData?.customAvailability || []
      } else {
        // Account owners/managers load their own availability
        availability = await availabilityAPI.getAvailability(user.id)
        console.log('✅ Availability data loaded:', availability)
        
        // Parse business hours - handle different response formats
        businessHours = availability?.businessHours || availability?.business_hours
        
        // If businessHours is a string, parse it
        if (typeof businessHours === 'string') {
          try {
            businessHours = JSON.parse(businessHours)
          } catch (e) {
            console.error('Error parsing businessHours string:', e)
            businessHours = null
          }
        }
        loadedTimeslotTemplates = availability?.timeslotTemplates || availability?.timeslot_templates || []
        const bh = availability?.businessHours || availability?.business_hours
        loadedDrivingTime = (typeof bh === 'object' && bh?.drivingTime != null) ? bh.drivingTime : 0
        loadedDateOverrides = availability?.customAvailability || (typeof bh === 'object' ? bh?.customAvailability : null) || []
      }
      
      // If no business hours, use defaults
      if (!businessHours || typeof businessHours !== 'object') {
        businessHours = {
          monday: { start: '09:00', end: '17:00', enabled: true },
          tuesday: { start: '09:00', end: '17:00', enabled: true },
          wednesday: { start: '09:00', end: '17:00', enabled: true },
          thursday: { start: '09:00', end: '17:00', enabled: true },
          friday: { start: '09:00', end: '17:00', enabled: true },
          saturday: { start: '09:00', end: '17:00', enabled: false },
          sunday: { start: '09:00', end: '17:00', enabled: false }
        }
      }
      
      // Ensure all days have the correct structure
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      const normalizedBusinessHours = {}
      days.forEach(day => {
        if (businessHours[day]) {
          normalizedBusinessHours[day] = {
            start: businessHours[day].start || '09:00',
            end: businessHours[day].end || '17:00',
            enabled: businessHours[day].enabled !== undefined ? businessHours[day].enabled : true
          }
        } else {
          normalizedBusinessHours[day] = {
            start: '09:00',
            end: '17:00',
            enabled: day === 'saturday' || day === 'sunday' ? false : true
          }
        }
      })
      
      setAvailabilityData({
        businessHours: normalizedBusinessHours,
        drivingTime: loadedDrivingTime ?? (businessHours?.drivingTime || 0),
        timeslotTemplates: loadedTimeslotTemplates,
        dateOverrides: loadedDateOverrides
      })
    } catch (error) {
      console.error('❌ Error loading availability data:', error)
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      })
      
      // Set default data on error
      setAvailabilityData({
        businessHours: {
          monday: { start: '09:00', end: '17:00', enabled: true },
          tuesday: { start: '09:00', end: '17:00', enabled: true },
          wednesday: { start: '09:00', end: '17:00', enabled: true },
          thursday: { start: '09:00', end: '17:00', enabled: true },
          friday: { start: '09:00', end: '17:00', enabled: true },
          saturday: { start: '09:00', end: '17:00', enabled: false },
          sunday: { start: '09:00', end: '17:00', enabled: false }
        },
        drivingTime: 0,
        timeslotTemplates: [],
        dateOverrides: []
      })
      
      // Show more detailed error message
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error'
      if (error.response?.status === 404) {
        setMessage({ type: 'error', text: 'Availability settings not found. Using default settings.' })
      } else if (error.response?.status === 500) {
        setMessage({ type: 'error', text: `Server error: ${errorMessage}. Using default availability settings.` })
      } else if (error.message?.includes('Network') || error.code === 'NETWORK_ERROR') {
        setMessage({ type: 'error', text: 'Network error. Please check your connection and try again.' })
      } else {
        setMessage({ type: 'error', text: `Failed to load availability settings: ${errorMessage}. Using defaults.` })
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    console.log('🔄 Availability useEffect triggered:', { user: !!user, userId: user?.id, hasLoaded })
    
    if (user?.id && !hasLoaded) {
      console.log('✅ Loading availability data...')
      setHasLoaded(true)
      loadAvailabilityData()
    } else if (user === null) {
      console.log('❌ No current user, redirecting to signin')
      handleNavigate()
    } else {
      console.log('⏭️ Skipping load - already loaded or no user')
    }
  }, [user?.id, hasLoaded, handleNavigate, loadAvailabilityData, user])

  const handleSaveTimeslotTemplate = async (template) => {
    try {
      setSaving(true)

      let updatedTemplates
      if (editingTemplateIndex !== null) {
        updatedTemplates = [...availabilityData.timeslotTemplates]
        updatedTemplates[editingTemplateIndex] = template
      } else {
        updatedTemplates = [...availabilityData.timeslotTemplates, template]
      }

      const newDrivingTime = template.drivingTime ?? availabilityData.drivingTime ?? 0

      if (isWorker(user) && user?.teamMemberId) {
        // Team members: save templates to their own team member availability (not user/owner)
        const currentAvailability = await teamAPI.getAvailability(user.teamMemberId)
        let availData = currentAvailability?.availability
        if (typeof availData === 'string') {
          try {
            availData = JSON.parse(availData)
          } catch (e) {
            availData = { workingHours: {}, customAvailability: [] }
          }
        }
        if (!availData) availData = { workingHours: {}, customAvailability: [] }
        if (!availData.workingHours) availData.workingHours = {}
        // Merge current businessHours from UI into workingHours so we don't lose them
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        days.forEach(day => {
          const h = availabilityData.businessHours[day]
          if (h?.enabled) {
            availData.workingHours[day] = {
              available: true,
              timeSlots: [{ start: h.start || '09:00', end: h.end || '17:00' }]
            }
          } else {
            availData.workingHours[day] = { available: false, timeSlots: [] }
          }
        })
        availData.timeslotTemplates = updatedTemplates
        availData.drivingTime = newDrivingTime
        await teamAPI.updateAvailability(user.teamMemberId, availData)
      } else {
        // Account owners: save to user_availability
        await availabilityAPI.updateAvailability({
          userId: user.id,
          businessHours: { ...availabilityData.businessHours, drivingTime: newDrivingTime },
          timeslotTemplates: updatedTemplates
        })
      }

      setAvailabilityData(prev => ({
        ...prev,
        drivingTime: newDrivingTime,
        timeslotTemplates: updatedTemplates
      }))

      setMessage({ type: 'success', text: editingTemplateIndex !== null ? 'Template updated successfully!' : 'Timeslot template saved successfully!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      setIsTimeslotTemplateModalOpen(false)
      setEditingTemplateIndex(null)
    } catch (error) {
      console.error('Error saving timeslot template:', error)
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save timeslot template' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTimeslotTemplate = async (indexToDelete) => {
    try {
      setSaving(true)
      const updatedTemplates = availabilityData.timeslotTemplates.filter((_, i) => i !== indexToDelete)

      if (isWorker(user) && user?.teamMemberId) {
        const currentAvailability = await teamAPI.getAvailability(user.teamMemberId)
        let availData = currentAvailability?.availability
        if (typeof availData === 'string') {
          try {
            availData = JSON.parse(availData)
          } catch (e) {
            availData = { workingHours: {}, customAvailability: [] }
          }
        }
        if (!availData) availData = { workingHours: {}, customAvailability: [] }
        availData.timeslotTemplates = updatedTemplates
        if (availabilityData.drivingTime != null) availData.drivingTime = availabilityData.drivingTime
        await teamAPI.updateAvailability(user.teamMemberId, availData)
      } else {
        await availabilityAPI.updateAvailability({
          userId: user.id,
          businessHours: { ...availabilityData.businessHours, drivingTime: availabilityData.drivingTime || 0 },
          timeslotTemplates: updatedTemplates
        })
      }

      setAvailabilityData(prev => ({
        ...prev,
        timeslotTemplates: updatedTemplates
      }))

      setMessage({ type: 'success', text: 'Template deleted successfully!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      console.error('Error deleting timeslot template:', error)
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to delete timeslot template' })
    } finally {
      setSaving(false)
    }
  }

  const handleEditTemplate = (index) => {
    setEditingTemplateIndex(index)
    setIsTimeslotTemplateModalOpen(true)
  }

  const handleSaveDateOverride = async (overrideData) => {
    try {
      setSaving(true)

      let updatedOverrides
      if (editingOverrideIndex !== null) {
        updatedOverrides = [...availabilityData.dateOverrides]
        updatedOverrides[editingOverrideIndex] = overrideData
      } else {
        updatedOverrides = [...availabilityData.dateOverrides, overrideData]
      }

      // Sort by date
      updatedOverrides.sort((a, b) => a.date.localeCompare(b.date))

      if (isWorker(user) && user?.teamMemberId) {
        const currentAvailability = await teamAPI.getAvailability(user.teamMemberId)
        let availData = currentAvailability?.availability
        if (typeof availData === 'string') {
          try { availData = JSON.parse(availData) } catch (e) { availData = { workingHours: {}, customAvailability: [] } }
        }
        if (!availData) availData = { workingHours: {}, customAvailability: [] }
        availData.customAvailability = updatedOverrides
        await teamAPI.updateAvailability(user.teamMemberId, availData)
      } else {
        await availabilityAPI.updateAvailability({
          userId: user.id,
          businessHours: { ...availabilityData.businessHours, drivingTime: availabilityData.drivingTime || 0 },
          timeslotTemplates: availabilityData.timeslotTemplates,
          customAvailability: updatedOverrides
        })
      }

      setAvailabilityData(prev => ({ ...prev, dateOverrides: updatedOverrides }))
      setMessage({ type: 'success', text: editingOverrideIndex !== null ? 'Date override updated!' : 'Date override added!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      setShowDateOverrideModal(false)
      setEditingOverrideIndex(null)
    } catch (error) {
      console.error('Error saving date override:', error)
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save date override' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDateOverride = async (indexToDelete) => {
    try {
      setSaving(true)
      const updatedOverrides = availabilityData.dateOverrides.filter((_, i) => i !== indexToDelete)

      if (isWorker(user) && user?.teamMemberId) {
        const currentAvailability = await teamAPI.getAvailability(user.teamMemberId)
        let availData = currentAvailability?.availability
        if (typeof availData === 'string') {
          try { availData = JSON.parse(availData) } catch (e) { availData = { workingHours: {}, customAvailability: [] } }
        }
        if (!availData) availData = { workingHours: {}, customAvailability: [] }
        availData.customAvailability = updatedOverrides
        await teamAPI.updateAvailability(user.teamMemberId, availData)
      } else {
        await availabilityAPI.updateAvailability({
          userId: user.id,
          businessHours: { ...availabilityData.businessHours, drivingTime: availabilityData.drivingTime || 0 },
          timeslotTemplates: availabilityData.timeslotTemplates,
          customAvailability: updatedOverrides
        })
      }

      setAvailabilityData(prev => ({ ...prev, dateOverrides: updatedOverrides }))
      setMessage({ type: 'success', text: 'Date override deleted!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      console.error('Error deleting date override:', error)
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to delete date override' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveBusinessHours = async () => {
    try {
      setSaving(true)
      setMessage({ type: '', text: '' })
      
      console.log('💾 Saving business hours:', {
        userId: user.id,
        isWorker: isWorker(user),
        teamMemberId: user?.teamMemberId,
        businessHours: availabilityData.businessHours,
        timeslotTemplates: availabilityData.timeslotTemplates
      })
      
      // Workers should save to their team member availability
      if (isWorker(user) && user?.teamMemberId) {
        // Get current availability
        const currentAvailability = await teamAPI.getAvailability(user.teamMemberId)
        let availData = currentAvailability?.availability
        
        if (typeof availData === 'string') {
          try {
            availData = JSON.parse(availData)
          } catch (e) {
            console.error('Error parsing availability:', e)
            availData = { workingHours: {}, customAvailability: [] }
          }
        }
        
        if (!availData) {
          availData = { workingHours: {}, customAvailability: [] }
        }
        
        // Convert businessHours format to workingHours format
        const workingHours = {}
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        
        days.forEach(day => {
          const dayBusinessHours = availabilityData.businessHours[day]
          if (dayBusinessHours.enabled) {
            workingHours[day] = {
              available: true,
              timeSlots: [{
                start: dayBusinessHours.start,
                end: dayBusinessHours.end
              }]
            }
          } else {
            workingHours[day] = {
              available: false,
              timeSlots: []
            }
          }
        })
        
        // Update availability with new workingHours
        availData.workingHours = workingHours
        
        // Save to team member availability (pass object so backend stringifies once)
        await teamAPI.updateAvailability(user.teamMemberId, availData)
        
        console.log('✅ Worker availability saved successfully')
        setMessage({ type: 'success', text: 'Availability hours saved successfully!' })
      } else {
        // Account owners/managers save to their own availability
        const response = await availabilityAPI.updateAvailability({
          userId: user.id,
          businessHours: { ...availabilityData.businessHours, drivingTime: availabilityData.drivingTime || 0 },
          timeslotTemplates: availabilityData.timeslotTemplates
        })
        
        console.log('✅ Save response:', response)
        setMessage({ type: 'success', text: 'Business hours saved successfully!' })
      }
      
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      setShowBusinessHoursEditor(false)
      
      // Refresh data to ensure it's in sync
      await loadAvailabilityData()
    } catch (error) {
      console.error('❌ Error saving business hours:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Failed to save business hours'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setSaving(false)
    }
  }

  const handleBusinessHoursChange = (day, field, value) => {
    setAvailabilityData(prev => ({
      ...prev,
      businessHours: {
        ...prev.businessHours,
        [day]: {
          ...prev.businessHours[day],
          [field]: value
        }
      }
    }))
  }

  if (loading) {
    return (
      <SettingsRailLayout title="Availability" section="Operations">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-[var(--sf-text-secondary)]">Loading availability…</p>
          </div>
        </div>
      </SettingsRailLayout>
    )
  }

  return (
    <SettingsRailLayout
      title="Availability"
      section="Operations"
      subtitle="Business hours, time-slot templates, and date overrides"
    >
        {/* Message */}
        {message.text && (
          <div className={`px-6 py-3 ${message.type === 'success' ? 'bg-green-50 border-l-4 border-green-400' : 'bg-red-50 border-l-4 border-red-400'}`}>
            <div className="flex items-center">
              {message.type === 'success' ? (
                <Check className="w-5 h-5 text-green-400 mr-2" />
              ) : (
                <X className="w-5 h-5 text-red-400 mr-2" />
              )}
              <span className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {message.text}
              </span>
            </div>
        </div>
        )}

      <div className="flex flex-col gap-4">
        {/* Hours of operation */}
        <SfCard padding={0}>
          <div
            className="flex items-center"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
                Hours of operation
              </div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                The time slots that customers can book online
              </div>
            </div>
            {!showBusinessHoursEditor && (
              <SfButton
                variant="secondary"
                size="sm"
                icon={Edit}
                onClick={() => setShowBusinessHoursEditor(true)}
              >
                Edit hours
              </SfButton>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-col gap-1">
              {Object.entries(availabilityData.businessHours).map(([day, hours]) => (
                <div
                  key={day}
                  className="flex items-center gap-3 flex-wrap"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: showBusinessHoursEditor
                      ? "var(--sf-panel-alt)"
                      : "transparent",
                  }}
                >
                  {showBusinessHoursEditor ? (
                    <DaySwitch
                      on={hours.enabled}
                      onChange={() =>
                        handleBusinessHoursChange(day, "enabled", !hours.enabled)
                      }
                    />
                  ) : (
                    <span
                      className="inline-block rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        background: hours.enabled ? "var(--sf-green)" : "var(--sf-ink-4)",
                      }}
                    />
                  )}
                  <span
                    className="text-[13px] font-semibold capitalize"
                    style={{
                      color: hours.enabled ? "var(--sf-ink)" : "var(--sf-ink-3)",
                      width: 100,
                    }}
                  >
                    {day}
                  </span>
                  {showBusinessHoursEditor && hours.enabled ? (
                    <div className="inline-flex items-center gap-1.5">
                      <input
                        type="time"
                        value={hours.start}
                        onChange={(e) =>
                          handleBusinessHoursChange(day, "start", e.target.value)
                        }
                        className="rounded-md text-[12.5px] text-[var(--sf-ink)]"
                        style={{
                          padding: "5px 8px",
                          border: "1px solid var(--sf-border-soft)",
                          background: "var(--sf-panel)",
                          fontFamily: "var(--sf-font-ui)",
                        }}
                      />
                      <span className="text-[12px] text-[var(--sf-ink-3)]">to</span>
                      <input
                        type="time"
                        value={hours.end}
                        onChange={(e) =>
                          handleBusinessHoursChange(day, "end", e.target.value)
                        }
                        className="rounded-md text-[12.5px] text-[var(--sf-ink)]"
                        style={{
                          padding: "5px 8px",
                          border: "1px solid var(--sf-border-soft)",
                          background: "var(--sf-panel)",
                          fontFamily: "var(--sf-font-ui)",
                        }}
                      />
                    </div>
                  ) : (
                    <span
                      className="text-[12.5px]"
                      style={{
                        color: hours.enabled ? "var(--sf-ink-2)" : "var(--sf-ink-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {hours.enabled ? `${hours.start} – ${hours.end}` : "Closed"}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {showBusinessHoursEditor && (
              <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--sf-border-soft)" }}>
                <SfButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowBusinessHoursEditor(false)}
                >
                  Cancel
                </SfButton>
                <div className="flex-1" />
                <SfButton
                  variant="primary"
                  size="sm"
                  onClick={handleSaveBusinessHours}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save hours"}
                </SfButton>
              </div>
            )}
          </div>
        </SfCard>

        {/* Date overrides */}
        <SfCard padding={0}>
          <div
            className="flex items-center flex-wrap gap-2"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
                Date overrides
              </div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                Holidays, vacations, or one-off changes to your regular hours
              </div>
            </div>
            <SfButton
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingOverrideIndex(null)
                setShowDateOverrideModal(true)
              }}
            >
              Add override
            </SfButton>
          </div>
          {availabilityData.dateOverrides.length === 0 ? (
            <div className="py-10 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
                style={{ background: "var(--sf-panel-soft)", color: "var(--sf-ink-3)" }}
              >
                <Calendar size={20} />
              </div>
              <div className="text-[12.5px] text-[var(--sf-ink-3)]">No date overrides set</div>
            </div>
          ) : (
            availabilityData.dateOverrides.map((override, index) => {
              const dt = new Date(override.date + "T00:00:00")
              const dateLabel = dt.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 flex-wrap"
                  style={{
                    padding: "12px 18px",
                    borderBottom:
                      index < availabilityData.dateOverrides.length - 1
                        ? "1px solid var(--sf-border-soft)"
                        : "none",
                  }}
                >
                  <span
                    className="inline-block rounded-full flex-shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      background: override.available ? "var(--sf-green)" : "var(--sf-red)",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--sf-ink)] inline-flex items-center gap-1.5 flex-wrap">
                      {dateLabel}
                      {override.label && (
                        <SfTag color="var(--sf-ink-2)" bg="var(--sf-panel-alt)">
                          {override.label}
                        </SfTag>
                      )}
                    </div>
                    <div
                      className="text-[11.5px] mt-0.5"
                      style={{
                        color: override.available
                          ? "var(--sf-green-dark)"
                          : "var(--sf-red-dark)",
                      }}
                    >
                      {override.available
                        ? override.hours?.length > 0
                          ? override.hours.map((h) => `${h.start} – ${h.end}`).join(", ")
                          : "Custom hours (regular)"
                        : "Unavailable"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <SfButton
                      variant="ghost"
                      size="sm"
                      icon={Edit}
                      onClick={() => {
                        setEditingOverrideIndex(index)
                        setShowDateOverrideModal(true)
                      }}
                    >
                      Edit
                    </SfButton>
                    <button
                      onClick={() => handleDeleteDateOverride(index)}
                      aria-label="Delete override"
                      className="text-[var(--sf-ink-3)] hover:text-[var(--sf-red-dark)]"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 6,
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </SfCard>

        {/* Timeslot templates */}
        <SfCard padding={0}>
          <div
            className="flex items-center flex-wrap gap-2"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
                Timeslot templates
              </div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                Override default hours, timeslot settings, and driving time for specific services
              </div>
            </div>
            <SfButton
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingTemplateIndex(null)
                setIsTimeslotTemplateModalOpen(true)
              }}
            >
              New template
            </SfButton>
          </div>
          {availabilityData.timeslotTemplates.length === 0 ? (
            <div className="py-10 text-center">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2"
                style={{ background: "var(--sf-panel-soft)", color: "var(--sf-ink-3)" }}
              >
                <Clock size={20} />
              </div>
              <div className="text-[12.5px] text-[var(--sf-ink-3)]">
                No timeslot templates yet
              </div>
            </div>
          ) : (
            availabilityData.timeslotTemplates.map((template, index) => (
              <div
                key={index}
                className="flex items-center gap-3 flex-wrap"
                style={{
                  padding: "12px 18px",
                  borderBottom:
                    index < availabilityData.timeslotTemplates.length - 1
                      ? "1px solid var(--sf-border-soft)"
                      : "none",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[var(--sf-ink)]">
                    {template.name || `Template ${index + 1}`}
                  </div>
                  {template.description && (
                    <div className="text-[11.5px] text-[var(--sf-ink-2)] mt-0.5">
                      {template.description}
                    </div>
                  )}
                  <div className="text-[11px] text-[var(--sf-ink-3)] mt-1 inline-flex items-center gap-3 flex-wrap">
                    <span>{template.timeslotType || "Arrival windows"}</span>
                    {template.arrivalWindowLength && (
                      <span>
                        {template.arrivalWindowLength >= 60
                          ? `${template.arrivalWindowLength / 60}h`
                          : `${template.arrivalWindowLength}m`}{" "}
                        window
                      </span>
                    )}
                    {template.drivingTime > 0 && (
                      <span className="text-[var(--sf-amber-dark)]">
                        {template.drivingTime} min interval
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <SfButton
                    variant="ghost"
                    size="sm"
                    icon={Edit}
                    onClick={() => handleEditTemplate(index)}
                  >
                    Edit
                  </SfButton>
                  <button
                    onClick={() => handleDeleteTimeslotTemplate(index)}
                    aria-label="Delete template"
                    className="text-[var(--sf-ink-3)] hover:text-[var(--sf-red-dark)]"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 6,
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </SfCard>
      </div>

      <TimeslotTemplateModal
        isOpen={isTimeslotTemplateModalOpen}
        onClose={() => { setIsTimeslotTemplateModalOpen(false); setEditingTemplateIndex(null) }}
        onSave={handleSaveTimeslotTemplate}
        existingTemplate={editingTemplateIndex !== null ? availabilityData.timeslotTemplates[editingTemplateIndex] : null}
      />

      <DateOverrideModal
        isOpen={showDateOverrideModal}
        onClose={() => { setShowDateOverrideModal(false); setEditingOverrideIndex(null) }}
        onSave={handleSaveDateOverride}
        existingOverride={editingOverrideIndex !== null ? availabilityData.dateOverrides[editingOverrideIndex] : null}
      />
    </SettingsRailLayout>
  )
}

const DaySwitch = ({ on, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    aria-pressed={on}
    style={{
      width: 32,
      height: 18,
      borderRadius: 999,
      border: "none",
      padding: 0,
      background: on ? "var(--sf-blue)" : "#cbd5e1",
      cursor: "pointer",
      position: "relative",
      transition: "background .15s",
      flexShrink: 0,
    }}
  >
    <span
      style={{
        position: "absolute",
        top: 2,
        left: on ? 16 : 2,
        width: 14,
        height: 14,
        background: "#fff",
        borderRadius: 7,
        boxShadow: "0 1px 2px rgba(15,23,42,.18)",
        transition: "left .15s",
      }}
    />
  </button>
)

export default Availability
