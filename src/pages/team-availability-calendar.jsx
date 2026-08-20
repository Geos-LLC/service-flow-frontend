"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar, Clock, Users, Filter, Edit, X, Check, AlertCircle } from "lucide-react"
import { teamAPI, jobsAPI, availabilityAPI } from "../services/api"
import { useAuth } from "../context/AuthContext"
import { getImageUrl } from "../utils/imageUtils"

const TeamAvailabilityCalendar = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState([])
  const [availabilityData, setAvailabilityData] = useState({}) // { memberId: { date: { available, hours, remainingHours, assignedJobs } } }
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedMember, setSelectedMember] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAvailability, setEditingAvailability] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all") // all, active, inactive
  const [message, setMessage] = useState({ type: '', text: '' })
  const [calendarView, setCalendarView] = useState("remaining") // "base" or "remaining"
  const [companyDrivingTime, setCompanyDrivingTime] = useState(60) // Default 60 minutes (1 hour)

  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())
    
    const days = []
    const currentDate = new Date(startDate)
    
    for (let i = 0; i < 42; i++) {
      days.push({
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === currentMonth,
        isToday: currentDate.toDateString() === new Date().toDateString()
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return days
  }, [currentMonth, currentYear])

  // Fetch company driving time from settings
  useEffect(() => {
    if (!user?.id) return
    availabilityAPI.getAvailability(user.id).then((data) => {
      const hours = data?.businessHours || data?.business_hours
      const parsed = typeof hours === 'string' ? (() => { try { return JSON.parse(hours) } catch (e) { return null } })() : hours
      if (parsed && parsed.drivingTime !== undefined && parsed.drivingTime !== null) {
        const v = parseInt(parsed.drivingTime, 10)
        if (Number.isFinite(v)) setCompanyDrivingTime(v)
      }
    }).catch(() => {})
  }, [user?.id])

  // Fetch team members
  const fetchTeamMembers = useCallback(async () => {
    if (!user?.id) return
    
    try {
      setLoading(true)
      const response = await teamAPI.getAll(user.id, {
        status: filterStatus === "all" ? "" : filterStatus,
        page: 1,
        limit: 100
      })
      
      const members = response.teamMembers || response || []
      setTeamMembers(members)
      
      // Fetch availability for all members
      await fetchAllAvailability(members)
    } catch (error) {
      console.error('Error fetching team members:', error)
      setMessage({ type: 'error', text: 'Failed to load team members' })
    } finally {
      setLoading(false)
    }
  }, [user?.id, filterStatus])

  // Helper to convert time string to minutes since midnight
  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
  }

  // Helper to convert minutes since midnight to time string
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  // Get per-member driving time, falling back to company default
  const getMemberDrivingTime = (member) => {
    if (!member) return companyDrivingTime
    try {
      const avail = member.availability
        ? (typeof member.availability === 'string' ? JSON.parse(member.availability) : member.availability)
        : null
      if (avail && avail.drivingTime !== undefined && avail.drivingTime !== null) {
        const v = parseInt(avail.drivingTime, 10)
        if (Number.isFinite(v)) return v
      }
    } catch (e) { /* ignore */ }
    return companyDrivingTime
  }

  // Calculate remaining availability by subtracting assigned jobs + driving lag from base availability
  const calculateRemainingAvailability = (baseHours, assignedJobs, drivingTimeMinutes = 0) => {
    if (!baseHours || baseHours.length === 0) return []
    if (!assignedJobs || assignedJobs.length === 0) return baseHours

    // Convert base hours to time ranges in minutes
    const baseRanges = baseHours.map(slot => ({
      start: timeToMinutes(slot.start),
      end: timeToMinutes(slot.end)
    }))

    // Convert assigned jobs to time ranges in minutes
    const jobRanges = assignedJobs.map(job => {
      // Extract time from scheduled_time or scheduled_date
      let jobTime = '09:00' // Default

      // First try scheduled_time field
      if (job.scheduled_time) {
        // scheduled_time might be "09:00" or "09:00:00" or a full datetime
        const timeStr = job.scheduled_time.toString()
        if (timeStr.includes('T')) {
          // ISO datetime format - extract time part
          const timePart = timeStr.split('T')[1]?.split('.')[0] || timeStr.split('T')[1]
          if (timePart && timePart.includes(':')) {
            jobTime = timePart.split(':').slice(0, 2).join(':')
          }
        } else if (timeStr.includes(':')) {
          // Time string format "HH:MM" or "HH:MM:SS"
          jobTime = timeStr.split(':').slice(0, 2).join(':')
        }
      } else if (job.scheduled_date) {
        // Extract time from scheduled_date (format: "2025-10-07 09:00:00" or ISO string)
        const dateStr = job.scheduled_date.toString()
        if (dateStr.includes('T')) {
          // ISO format - extract time part
          const timePart = dateStr.split('T')[1]?.split('.')[0] || dateStr.split('T')[1]
          if (timePart && timePart.includes(':')) {
            jobTime = timePart.split(':').slice(0, 2).join(':')
          }
        } else {
          // Try to match time pattern in string
          const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/)
          if (timeMatch) {
            jobTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
          }
        }
      }

      const jobStartMinutes = timeToMinutes(jobTime)
      const duration = job.duration || 60 // Default 60 minutes
      return {
        start: jobStartMinutes,
        end: jobStartMinutes + duration
      }
    })

    // Build driving time ranges (buffer before and after each job)
    const driving = typeof drivingTimeMinutes === 'number' && drivingTimeMinutes > 0 ? drivingTimeMinutes : 0
    let drivingTimeRanges = []
    if (driving > 0 && jobRanges.length > 0) {
      const overallStart = Math.min(...baseRanges.map(r => r.start))
      const overallEnd = Math.max(...baseRanges.map(r => r.end))
      jobRanges.forEach(jr => {
        drivingTimeRanges.push({ start: Math.max(jr.start - driving, overallStart), end: jr.start })
        drivingTimeRanges.push({ start: jr.end, end: Math.min(jr.end + driving, overallEnd) })
      })
    }

    // Merge all blocked ranges (jobs + driving buffers)
    const allBlocked = [...jobRanges, ...drivingTimeRanges]
      .sort((a, b) => a.start - b.start)
    const mergedBlocked = []
    allBlocked.forEach(range => {
      if (mergedBlocked.length === 0) {
        mergedBlocked.push({ ...range })
      } else {
        const prev = mergedBlocked[mergedBlocked.length - 1]
        if (range.start <= prev.end) {
          prev.end = Math.max(prev.end, range.end)
        } else {
          mergedBlocked.push({ ...range })
        }
      }
    })

    // Subtract blocked ranges from base availability
    const remainingRanges = []
    baseRanges.forEach(baseRange => {
      let currentStart = baseRange.start
      const relevant = mergedBlocked
        .filter(b => b.start < baseRange.end && b.end > baseRange.start)
        .sort((a, b) => a.start - b.start)

      relevant.forEach(blocked => {
        if (currentStart < blocked.start) {
          remainingRanges.push({
            start: currentStart,
            end: blocked.start
          })
        }
        currentStart = Math.max(currentStart, blocked.end)
      })

      if (currentStart < baseRange.end) {
        remainingRanges.push({
          start: currentStart,
          end: baseRange.end
        })
      }
    })

    // Convert back to time strings and filter out slots less than 15 minutes
    return remainingRanges
      .filter(range => range.end - range.start >= 15) // Minimum 15-minute slots
      .map(range => ({
        start: minutesToTime(range.start),
        end: minutesToTime(range.end)
      }))
  }

  // Fetch availability for all team members
  const fetchAllAvailability = async (members) => {
    if (!members || members.length === 0) return
    
    const startDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
    const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]
    
    const availabilityPromises = members.map(async (member) => {
      try {
        // Fetch base availability
        const availability = await teamAPI.getAvailability(member.id, startDate, endDate)
        
        // Debug: Log what we received
        console.log(`[Calendar] Member ${member.id} (${member.first_name}):`, {
          hasAvailability: !!availability,
          hasBaseAvailability: !!availability?.baseAvailability,
          hasRemainingAvailability: !!availability?.remainingAvailability,
          availabilityKeys: availability ? Object.keys(availability) : [],
          availabilityData: availability?.availability ? (typeof availability.availability === 'string' ? 'string' : 'object') : 'none'
        })
        
        // Fetch assigned jobs for this member
        let assignedJobs = []
        try {
          const jobsResponse = await jobsAPI.getAll(
            user.id,
            '', // status
            '', // search
            1, // page
            1000, // limit - get all jobs for the month
            '', // dateFilter
            `${startDate},${endDate}`, // dateRange
            'scheduled_date', // sortBy
            'ASC', // sortOrder
            member.id.toString(), // teamMember filter
            '', // invoiceStatus
            '', // customerId
            '', // territoryId
            '', // recurring
            null // signal
          )
          assignedJobs = jobsResponse.jobs || jobsResponse || []
        } catch (jobError) {
          console.error(`Error fetching jobs for member ${member.id}:`, jobError)
        }
        
        return { memberId: member.id, availability, assignedJobs }
      } catch (error) {
        console.error(`Error fetching availability for member ${member.id}:`, error)
        return { memberId: member.id, availability: null, assignedJobs: [] }
      }
    })
    
    const results = await Promise.all(availabilityPromises)
    
        // Process availability data
        // Use backend-calculated data if available, otherwise calculate on frontend
        const processedData = {}
        results.forEach(({ memberId, availability, assignedJobs }) => {
          processedData[memberId] = {}
          
          // Debug: Log processing for this member
          console.log(`[Calendar] Processing member ${memberId}:`, {
            hasBaseAvailability: !!availability?.baseAvailability,
            hasRemainingAvailability: !!availability?.remainingAvailability,
            baseAvailabilityKeys: availability?.baseAvailability ? Object.keys(availability.baseAvailability) : [],
            hasAvailability: !!availability?.availability
          })
          
          // Use backend-calculated base and remaining availability if available
          if (availability?.baseAvailability && Object.keys(availability.baseAvailability).length > 0) {
            // Backend provides base availability; recalculate remaining with driving lag on frontend
            console.log(`[Calendar] Using backend base availability for member ${memberId}`)
            const member = members.find(m => m.id === memberId || Number(m.id) === memberId)
            const drivingTime = getMemberDrivingTime(member)
            Object.keys(availability.baseAvailability).forEach(dateStr => {
              const baseData = availability.baseAvailability[dateStr]
              const baseHours = baseData.hours || []

              // Get jobs assigned for this day
              const dayJobs = assignedJobs.filter(job => {
                const jobDate = new Date(job.scheduled_date || job.scheduledDate)
                return jobDate.toISOString().split('T')[0] === dateStr
              })

              // Recalculate remaining availability with driving lag
              const remainingHours = baseData.available && baseHours.length > 0
                ? calculateRemainingAvailability(baseHours, dayJobs, drivingTime)
                : []

              processedData[memberId][dateStr] = {
                available: baseData.available,
                hours: baseHours,
                remainingHours: remainingHours,
                assignedJobs: dayJobs
              }
            })
          } else if (availability?.availability) {
            // Fallback to frontend calculation if backend didn't provide daily breakdown
            console.log(`[Calendar] Using frontend calculation for member ${memberId}`)
            // Fallback to frontend calculation if backend didn't provide daily breakdown
            let availData = availability.availability
            if (typeof availData === 'string') {
              try {
                availData = JSON.parse(availData)
              } catch (e) {
                console.error('Error parsing availability:', e)
              }
            }
            
            const workingHours = availData.workingHours || availData || {}
            const customAvailability = availData.customAvailability || []
            
            // Process each day in the month
            calendarDays.forEach(({ date }) => {
              if (!date.isCurrentMonth) return
              
              const dateStr = date.date.toISOString().split('T')[0]
              const dayOfWeek = date.date.getDay()
              const dayName = dayNamesFull[dayOfWeek].toLowerCase()
              
              // Check for custom availability override
              const dateOverride = customAvailability.find(item => item.date === dateStr)
              
              let dayData = {
                available: false,
                hours: null, // Base availability hours
                remainingHours: [], // Remaining availability after jobs
                assignedJobs: [] // Jobs assigned for this day
              }
              
              // Get base availability
              let baseHours = []
              if (dateOverride) {
                if (dateOverride.available === false) {
                  dayData.available = false
                } else if (dateOverride.hours) {
                  dayData.available = true
                  baseHours = Array.isArray(dateOverride.hours) 
                    ? dateOverride.hours 
                    : [dateOverride.hours]
                }
              } else {
                // Use working hours for the day
                const dayWorkingHours = workingHours[dayName]
                if (dayWorkingHours) {
                  // Check if available is explicitly false, or if available property exists and is true
                  const isDayAvailable = dayWorkingHours.available !== false && 
                                        (dayWorkingHours.available === true || dayWorkingHours.available === undefined)
                  
                  if (isDayAvailable) {
                    dayData.available = true
                    if (dayWorkingHours.timeSlots && dayWorkingHours.timeSlots.length > 0) {
                      baseHours = dayWorkingHours.timeSlots.map(slot => ({
                        start: slot.start,
                        end: slot.end
                      }))
                    } else if (dayWorkingHours.hours) {
                      // Parse hours string like "9:00 AM - 5:00 PM" or "9:00 AM - 6:00 PM"
                      const hoursMatch = dayWorkingHours.hours.match(/(\d+):(\d+)\s*(AM|PM)\s*-\s*(\d+):(\d+)\s*(AM|PM)/)
                      if (hoursMatch) {
                        baseHours = [{
                          start: convertTo24Hour(hoursMatch[1], hoursMatch[2], hoursMatch[3]),
                          end: convertTo24Hour(hoursMatch[4], hoursMatch[5], hoursMatch[6])
                        }]
                      } else {
                        // Try alternative format without spaces: "9:00AM-6:00PM"
                        const hoursMatch2 = dayWorkingHours.hours.match(/(\d+):(\d+)(AM|PM)-(\d+):(\d+)(AM|PM)/)
                        if (hoursMatch2) {
                          baseHours = [{
                            start: convertTo24Hour(hoursMatch2[1], hoursMatch2[2], hoursMatch2[3]),
                            end: convertTo24Hour(hoursMatch2[4], hoursMatch2[5], hoursMatch2[6])
                          }]
                        }
                      }
                    }
                  } else {
                    dayData.available = false
                  }
                } else {
                  // No working hours defined for this day
                  dayData.available = false
                }
              }
              
              dayData.hours = baseHours
              
              // Get jobs assigned for this day
              const dayJobs = assignedJobs.filter(job => {
                const jobDate = new Date(job.scheduled_date || job.scheduledDate)
                return jobDate.toISOString().split('T')[0] === dateStr
              })
              
              dayData.assignedJobs = dayJobs
              
              // Calculate remaining availability (including driving lag)
              if (dayData.available && baseHours.length > 0) {
                const member = members.find(m => m.id === memberId || Number(m.id) === memberId)
                const drivingTime = getMemberDrivingTime(member)
                dayData.remainingHours = calculateRemainingAvailability(baseHours, dayJobs, drivingTime)
              }
              
              processedData[memberId][dateStr] = dayData
            })
          }
        })
        
        setAvailabilityData(processedData)
  }

  // Helper to convert 12-hour to 24-hour format
  const convertTo24Hour = (hour, minute, ampm) => {
    let h = parseInt(hour)
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return `${h.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`
  }

  useEffect(() => {
    fetchTeamMembers()
  }, [fetchTeamMembers, currentMonth, currentYear])

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const handleDayClick = (day, member) => {
    setSelectedDate(day.date)
    setSelectedMember(member)
    const dateStr = day.date.toISOString().split('T')[0]
    const memberAvailability = availabilityData[member.id]?.[dateStr] || { available: false, hours: null, remainingHours: [], assignedJobs: [] }
    setEditingAvailability({
      date: dateStr,
      available: memberAvailability.available,
      hours: memberAvailability.hours || []
    })
    setShowEditModal(true)
  }

  const handleSaveAvailability = async () => {
    if (!selectedMember || !editingAvailability) return
    
    try {
      setSaving(true)
      
      // Get current availability
      const currentAvailability = await teamAPI.getAvailability(selectedMember.id)
      let availData = currentAvailability?.availability
      
      if (typeof availData === 'string') {
        try {
          availData = JSON.parse(availData)
        } catch (e) {
          availData = { workingHours: {}, customAvailability: [] }
        }
      }
      
      if (!availData) {
        availData = { workingHours: {}, customAvailability: [] }
      }
      
      if (!availData.customAvailability) {
        availData.customAvailability = []
      }
      
      // Update or add custom availability for the date
      const existingIndex = availData.customAvailability.findIndex(item => item.date === editingAvailability.date)
      
      if (editingAvailability.available && editingAvailability.hours && editingAvailability.hours.length > 0) {
        const customItem = {
          date: editingAvailability.date,
          available: true,
          hours: editingAvailability.hours
        }
        
        if (existingIndex >= 0) {
          availData.customAvailability[existingIndex] = customItem
        } else {
          availData.customAvailability.push(customItem)
        }
      } else {
        // Mark as unavailable
        const customItem = {
          date: editingAvailability.date,
          available: false
        }
        
        if (existingIndex >= 0) {
          availData.customAvailability[existingIndex] = customItem
        } else {
          availData.customAvailability.push(customItem)
        }
      }
      
      // Save to backend
      await teamAPI.updateAvailability(selectedMember.id, JSON.stringify(availData))
      
      setMessage({ type: 'success', text: 'Availability updated successfully!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      
      // Refresh data
      await fetchTeamMembers()
      setShowEditModal(false)
    } catch (error) {
      console.error('Error saving availability:', error)
      setMessage({ type: 'error', text: 'Failed to save availability' })
    } finally {
      setSaving(false)
    }
  }

  const getMemberColor = (memberId) => {
    const member = teamMembers.find(m => m.id === memberId)
    return member?.color || '#3B82F6'
  }

  const getMemberInitials = (member) => {
    const firstName = member?.first_name || ''
    const lastName = member?.last_name || ''
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase()
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase()
    }
    return 'TM'
  }

  const formatTime = (time) => formatTimeShared(time)

  // Compact wall-clock: "9a", "5:30p", "12p" — for dense cells where the
  // full formatTime ("9:00 AM") wraps every slot to a second line.
  const formatTimeCompact = (hhmm) => {
    if (!hhmm || typeof hhmm !== 'string') return ''
    const m = hhmm.match(/^(\d{1,2}):(\d{2})/)
    if (!m) return String(hhmm)
    const h = +m[1], mi = +m[2]
    const suffix = h >= 12 ? 'p' : 'a'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return mi === 0 ? `${h12}${suffix}` : `${h12}:${String(mi).padStart(2, '0')}${suffix}`
  }

  const totalMinutes = (slots) =>
    Array.isArray(slots)
      ? slots.reduce((s, sl) => s + Math.max(0, timeToMinutes(sl.end) - timeToMinutes(sl.start)), 0)
      : 0

  const joinSlotsCompact = (slots) =>
    Array.isArray(slots)
      ? slots.map(s => `${formatTimeCompact(s.start)}–${formatTimeCompact(s.end)}`).join(', ')
      : ''

  const getAvailabilityDisplay = (memberId, dateStr) => {
    const memberData = availabilityData[memberId]?.[dateStr]
    if (!memberData) return { status: 'unknown', text: 'No data', freeMinutes: 0, shiftMinutes: 0 }

    const shiftMinutes = totalMinutes(memberData.hours)

    if (!memberData.available) {
      return { status: 'unavailable', text: 'OFF', freeMinutes: 0, shiftMinutes: 0 }
    }

    // Show different data based on calendar view
    if (calendarView === "base") {
      if (memberData.hours && memberData.hours.length > 0) {
        return {
          status: 'available',
          text: joinSlotsCompact(memberData.hours),
          freeMinutes: shiftMinutes,
          shiftMinutes,
        }
      }
      return { status: 'available', text: 'Available', freeMinutes: 0, shiftMinutes: 0 }
    }

    // "remaining" view — show all free windows joined, not just first + count
    if (memberData.remainingHours && memberData.remainingHours.length > 0) {
      return {
        status: 'available',
        text: joinSlotsCompact(memberData.remainingHours),
        freeMinutes: totalMinutes(memberData.remainingHours),
        shiftMinutes,
      }
    }

    // All time booked — surface the job count for context
    if (memberData.assignedJobs && memberData.assignedJobs.length > 0) {
      return {
        status: 'booked',
        text: `Full — ${memberData.assignedJobs.length} job${memberData.assignedJobs.length === 1 ? '' : 's'}`,
        freeMinutes: 0,
        shiftMinutes,
      }
    }

    if (memberData.hours && memberData.hours.length > 0) {
      return {
        status: 'available',
        text: joinSlotsCompact(memberData.hours),
        freeMinutes: shiftMinutes,
        shiftMinutes,
      }
    }

    return { status: 'available', text: 'Available', freeMinutes: 0, shiftMinutes: 0 }
  }

  // Per-member totals across all visible days in the current month.
  // Used by the legend header to show "N.Nh free / N.Nh shift" per cleaner
  // without re-scanning cells during render.
  const monthlyTotalsByMember = useMemo(() => {
    const totals = {}
    for (const member of teamMembers) {
      let free = 0
      let shift = 0
      const memberDays = availabilityData[member.id] || {}
      for (const day of calendarDays) {
        if (!day.isCurrentMonth) continue
        const dateStr = day.date.toISOString().split('T')[0]
        const d = memberDays[dateStr]
        if (!d) continue
        shift += totalMinutes(d.hours)
        free += totalMinutes(d.remainingHours)
      }
      totals[member.id] = { freeMinutes: free, shiftMinutes: shift, bookedMinutes: Math.max(0, shift - free) }
    }
    return totals
  }, [teamMembers, availabilityData, calendarDays])

  const fmtHours = (mins) => (Math.round((mins / 60) * 10) / 10).toFixed(1)

  if (loading && teamMembers.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--sf-bg-page)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-[var(--sf-text-secondary)]">Loading remaining availability...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--sf-bg-page)] pb-24 lg:pb-0">
      {/* Header */}
      <div className="bg-white border-b border-[var(--sf-border-light)] sticky top-0 z-10">
        <div className="px-4 py-4 lg:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/team')}
                className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[var(--sf-text-secondary)]" />
              </button>
              <div>
                <h1 className="text-xl lg:text-2xl font-semibold text-[var(--sf-text-primary)]">Worker Availability Calendar</h1>
                <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                  {calendarView === "base" 
                    ? "When workers are generally available to work"
                    : "Time slots still open after existing jobs are scheduled"}
                </p>
              </div>
            </div>
            
            {/* View Toggle and Filter */}
            <div className="flex items-center space-x-4">
              {/* Calendar View Toggle */}
              <div className="flex items-center space-x-2 bg-[var(--sf-bg-page)] rounded-lg p-1">
                <button
                  onClick={() => setCalendarView("base")}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    calendarView === "base"
                      ? "bg-white text-[var(--sf-blue-500)] shadow-sm"
                      : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                  }`}
                >
                  Base Availability
                </button>
                <button
                  onClick={() => setCalendarView("remaining")}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    calendarView === "remaining"
                      ? "bg-white text-[var(--sf-blue-500)] shadow-sm"
                      : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                  }`}
                >
                  Remaining Availability
                </button>
              </div>
              
              {/* Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-[var(--sf-text-muted)]" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                >
                  <option value="all">All Members</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div className={`px-4 py-3 ${message.type === 'success' ? 'bg-green-50 border-l-4 border-green-400' : 'bg-red-50 border-l-4 border-red-400'}`}>
          <span className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        </div>
      )}

      {/* Month Navigation */}
      <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => setCurrentDate(new Date(currentYear - 1, currentMonth, 1))}
              className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-lg transition-colors"
              title="Previous year"
            >
              <ChevronsLeft className="w-5 h-5 text-[var(--sf-text-secondary)]" />
            </button>
            <button
              onClick={handlePreviousMonth}
              className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-lg transition-colors"
              title="Previous month"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--sf-text-secondary)]" />
            </button>
          </div>

          <h2 className="text-lg lg:text-xl font-semibold text-[var(--sf-text-primary)]">
            {monthNames[currentMonth]} {currentYear}
          </h2>

          <div className="flex items-center">
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-lg transition-colors"
              title="Next month"
            >
              <ChevronRight className="w-5 h-5 text-[var(--sf-text-secondary)]" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date(currentYear + 1, currentMonth, 1))}
              className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-lg transition-colors"
              title="Next year"
            >
              <ChevronsRight className="w-5 h-5 text-[var(--sf-text-secondary)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Team Members Legend — includes monthly free vs booked hours per
          cleaner. Numbers reflect the current month view; switch months
          and totals recompute against the new visible range. */}
      {teamMembers.length > 0 && (
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-3 lg:px-6 overflow-x-auto">
          <div className="flex items-center space-x-3 min-w-max">
            {teamMembers.map((member) => {
              const t = monthlyTotalsByMember[member.id] || { freeMinutes: 0, shiftMinutes: 0, bookedMinutes: 0 }
              const noShift = t.shiftMinutes === 0
              return (
                <div
                  key={member.id}
                  className="flex items-center space-x-2 flex-shrink-0 border border-[var(--sf-border-light)] rounded-lg px-2 py-1"
                  title={`${member.first_name} ${member.last_name}: ${fmtHours(t.freeMinutes)}h free of ${fmtHours(t.shiftMinutes)}h shift (${fmtHours(t.bookedMinutes)}h booked) — this month`}
                >
                  <div
                    className="w-4 h-4 rounded-full border border-[var(--sf-border-light)] flex-shrink-0"
                    style={{ backgroundColor: getMemberColor(member.id) }}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium text-[var(--sf-text-primary)] whitespace-nowrap">
                      {member.first_name} {member.last_name}
                    </span>
                    <span className="text-[11px] text-[var(--sf-text-muted)] whitespace-nowrap">
                      {noShift ? (
                        <>no shift set</>
                      ) : (
                        <>
                          <span className="text-green-700 font-medium">{fmtHours(t.freeMinutes)}h free</span>
                          {' / '}
                          <span className="text-orange-700 font-medium">{fmtHours(t.bookedMinutes)}h booked</span>
                          <span className="text-[var(--sf-text-muted)]">{' · '}{fmtHours(t.shiftMinutes)}h shift</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="px-4 py-4 lg:px-6 overflow-x-auto">
        <div className="min-w-max">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {dayNames.map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-[var(--sf-text-muted)] w-32">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, index) => {
              const dateStr = day.date.toISOString().split('T')[0]
              
              return (
                <div
                  key={index}
                  className={`w-32 border border-[var(--sf-border-light)] rounded-lg p-2 min-h-[120px] ${
                    day.isCurrentMonth ? 'bg-white' : 'bg-[var(--sf-bg-page)]'
                  } ${day.isToday ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <div className={`text-sm font-semibold mb-2 ${
                    day.isCurrentMonth ? 'text-[var(--sf-text-primary)]' : 'text-[var(--sf-text-muted)]'
                  } ${day.isToday ? 'text-[var(--sf-blue-500)]' : ''}`}>
                    {day.date.getDate()}
                  </div>
                  
                  {/* Team Member Availability */}
                  <div className="space-y-1">
                    {teamMembers.map((member) => {
                      const availability = getAvailabilityDisplay(member.id, dateStr)
                      const memberColor = getMemberColor(member.id)
                      
                      return (
                        <button
                          key={member.id}
                          onClick={() => day.isCurrentMonth && handleDayClick(day, member)}
                          disabled={!day.isCurrentMonth}
                          className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                            !day.isCurrentMonth ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                          } ${
                            availability.status === 'available' 
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : availability.status === 'unavailable'
                              ? 'bg-[var(--sf-bg-page)] text-[var(--sf-text-secondary)] border border-[var(--sf-border-light)]'
                              : availability.status === 'booked'
                              ? 'bg-orange-100 text-orange-800 border border-orange-200'
                              : 'bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] border border-[var(--sf-border-light)]'
                          }`}
                          style={availability.status === 'available' ? { borderLeftColor: memberColor, borderLeftWidth: '3px' } : {}}
                          title={`${member.first_name} ${member.last_name}: ${availability.text}`}
                        >
                          <div className="flex items-start space-x-1">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0 mt-[3px]"
                              style={{ backgroundColor: memberColor }}
                            />
                            <span className="font-medium break-words leading-tight">{availability.text}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit Availability Modal */}
      {showEditModal && selectedMember && editingAvailability && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-end justify-center lg:items-center">
          <div className="bg-white rounded-t-2xl lg:rounded-2xl w-full lg:w-[600px] max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sf-border-light)] flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: getMemberColor(selectedMember.id) }}
                >
                  {getMemberInitials(selectedMember)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                    {selectedMember.first_name} {selectedMember.last_name}
                  </h3>
                  <p className="text-sm text-[var(--sf-text-muted)]">
                    {new Date(editingAvailability.date).toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                  <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                    {calendarView === "base" 
                      ? "Editing base availability (when worker is generally available)"
                      : "Editing base availability (affects remaining availability)"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-[var(--sf-bg-hover)] rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-[var(--sf-text-secondary)]" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Available Toggle */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={editingAvailability.available}
                    onChange={(e) => setEditingAvailability({
                      ...editingAvailability,
                      available: e.target.checked,
                      hours: e.target.checked && (!editingAvailability.hours || editingAvailability.hours.length === 0)
                        ? [{ start: '09:00', end: '17:00' }]
                        : editingAvailability.hours
                    })}
                    className="w-4 h-4 text-[var(--sf-blue-500)] rounded focus:ring-[var(--sf-blue-500)] border-[var(--sf-border-light)]"
                  />
                  <label className="text-sm font-medium text-[var(--sf-text-primary)]">Available on this date</label>
                </div>
                
                {/* Time Slots */}
                {editingAvailability.available && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)]">Working Hours</label>
                    {editingAvailability.hours && editingAvailability.hours.length > 0 ? (
                      editingAvailability.hours.map((slot, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => {
                              const newHours = [...editingAvailability.hours]
                              newHours[index] = { ...slot, start: e.target.value }
                              setEditingAvailability({ ...editingAvailability, hours: newHours })
                            }}
                            className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                          />
                          <span className="text-[var(--sf-text-muted)]">to</span>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => {
                              const newHours = [...editingAvailability.hours]
                              newHours[index] = { ...slot, end: e.target.value }
                              setEditingAvailability({ ...editingAvailability, hours: newHours })
                            }}
                            className="border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                          />
                          {editingAvailability.hours.length > 1 && (
                            <button
                              onClick={() => {
                                const newHours = editingAvailability.hours.filter((_, i) => i !== index)
                                setEditingAvailability({ ...editingAvailability, hours: newHours })
                              }}
                              className="p-2 text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <button
                        onClick={() => setEditingAvailability({
                          ...editingAvailability,
                          hours: [{ start: '09:00', end: '17:00' }]
                        })}
                        className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium"
                      >
                        + Add Hours
                      </button>
                    )}
                    
                    {editingAvailability.hours && editingAvailability.hours.length > 0 && (
                      <button
                        onClick={() => setEditingAvailability({
                          ...editingAvailability,
                          hours: [...editingAvailability.hours, { start: '09:00', end: '17:00' }]
                        })}
                        className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium"
                      >
                        + Add Another Time Slot
                      </button>
                    )}
                  </div>
                )}

                {/* Remaining Availability Info */}
                {(() => {
                  const dateStr = editingAvailability.date
                  const memberData = availabilityData[selectedMember.id]?.[dateStr]
                  const assignedJobs = memberData?.assignedJobs || []
                  const remainingHours = memberData?.remainingHours || []
                  
                  if (assignedJobs.length > 0 || remainingHours.length > 0) {
                    return (
                      <div className="mt-6 pt-6 border-t border-[var(--sf-border-light)] space-y-3">
                        <h4 className="text-sm font-semibold text-[var(--sf-text-primary)]">Remaining Availability</h4>
                        
                        {assignedJobs.length > 0 && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-orange-800 mb-2">
                              {assignedJobs.length} job{assignedJobs.length > 1 ? 's' : ''} assigned
                            </p>
                            <div className="space-y-1">
                              {assignedJobs.slice(0, 3).map((job, idx) => {
                                // Extract time from scheduled_date or use scheduled_time field
                                let jobTime = '09:00'
                                if (job.scheduled_time) {
                                  jobTime = job.scheduled_time.includes(':') ? job.scheduled_time.split(':').slice(0, 2).join(':') : job.scheduled_time
                                } else if (job.scheduled_date) {
                                  const dateStr = job.scheduled_date.toString()
                                  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/)
                                  if (timeMatch) {
                                    jobTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
                                  }
                                }
                                return (
                                  <p key={idx} className="text-xs text-orange-700">
                                    • {job.service_name || 'Job'} at {formatTime(jobTime)}
                                  </p>
                                )
                              })}
                              {assignedJobs.length > 3 && (
                                <p className="text-xs text-orange-600">+ {assignedJobs.length - 3} more</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {remainingHours.length > 0 ? (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-green-800 mb-2">
                              Available time slots:
                            </p>
                            <div className="space-y-1">
                              {remainingHours.map((slot, idx) => (
                                <p key={idx} className="text-xs text-green-700">
                                  • {formatTime(slot.start)} - {formatTime(slot.end)}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : assignedJobs.length > 0 && editingAvailability.available ? (
                          <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-3">
                            <p className="text-xs text-[var(--sf-text-secondary)]">
                              All available time is booked
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-[var(--sf-border-light)] flex-shrink-0">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAvailability}
                disabled={saving}
                className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamAvailabilityCalendar

