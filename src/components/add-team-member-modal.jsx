"use client"

import { useState, useEffect } from "react"
import { X, UserPlus, Edit, Calendar, DollarSign, Tag, MapPin, Search, CheckCircle, AlertCircle, Plus, Trash2, Clock } from "lucide-react"
import { teamAPI, territoriesAPI } from "../services/api"
import AddressValidation from "./address-validation"
import AddressAutocomplete from "./address-autocomplete"
import Notification from "./notification"

const AddTeamMemberModal = ({ isOpen, onClose, onSuccess, userId, member = null, isEditing = false }) => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    location: "",
    city: "",
    state: "",
    zipCode: "",
    role: "worker",
    isServiceProvider: true,
    isActive: true,
    color: "#2563EB",
    territories: [],
    hourlyRate: null,
    commissionPercentage: null,
    salaryStartDate: new Date().toISOString().split('T')[0],
    availability: {
      monday: { start: "09:00", end: "17:00", available: true },
      tuesday: { start: "09:00", end: "17:00", available: true },
      wednesday: { start: "09:00", end: "17:00", available: true },
      thursday: { start: "09:00", end: "17:00", available: true },
      friday: { start: "09:00", end: "17:00", available: true },
      saturday: { start: "09:00", end: "17:00", available: false },
      sunday: { start: "09:00", end: "17:00", available: false }
    },
    permissions: {
      editAvailability: true,
      viewCustomerContact: false,
      viewCustomerNotes: false,
      markJobStatus: true,
      resetJobStatuses: false,
      editJobDetails: true,
      viewEditJobPrice: false,
      processPayments: false,
      rescheduleJobs: true,
      seeOtherProviders: true
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showErrorNotification, setShowErrorNotification] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [territories, setTerritories] = useState([])
  const [loadingTerritories, setLoadingTerritories] = useState(false)
  const [fullNameInput, setFullNameInput] = useState("") // Local state for full name input to preserve spaces
  const [payRates, setPayRates] = useState([])
  const [showAddRate, setShowAddRate] = useState(false)
  const [editingRateId, setEditingRateId] = useState(null)
  const [newRate, setNewRate] = useState({ hourlyRate: '', commissionPercentage: '', effectiveFrom: '', note: '' })
  const [payRateStatus, setPayRateStatus] = useState(null) // { kind: 'success' | 'error', message }

  // Build the recalc summary message from the backend's `recalculated` payload.
  const buildRecalcMessage = (recalculated, baseAction) => {
    if (!recalculated) return `${baseAction}.`
    const n = recalculated.jobsRebuilt || 0
    const delta = recalculated.totalDelta || 0
    if (n === 0) return `${baseAction}. No unpaid jobs needed recalculation.`
    const sign = delta >= 0 ? '+' : '−'
    const abs = Math.abs(delta).toFixed(2)
    const noun = n === 1 ? 'unpaid job' : 'unpaid jobs'
    return `${baseAction}. Recalculated ${n} ${noun} (${sign}$${abs} to balance).`
  }

  // Load pay rate history when editing
  useEffect(() => {
    if (isOpen && member && isEditing && member.id) {
      teamAPI.getPayRates(member.id).then(data => {
        setPayRates(data.payRates || [])
      }).catch(err => console.error('Error loading pay rates:', err))
    } else if (isOpen && !isEditing) {
      setPayRates([])
    }
  }, [isOpen, isEditing, member?.id])

  // Auto-clear the pay-rate status banner after 6s.
  useEffect(() => {
    if (!payRateStatus) return
    const t = setTimeout(() => setPayRateStatus(null), 6000)
    return () => clearTimeout(t)
  }, [payRateStatus])

  useEffect(() => {
    if (isOpen && member && isEditing) {
      console.log('Setting form data for editing member:', member)
      console.log('Member territories:', member.territories)
      
      let parsedTerritories = []
      if (member.territories) {
        try {
          if (typeof member.territories === 'string') {
            parsedTerritories = JSON.parse(member.territories)
          } else if (Array.isArray(member.territories)) {
            parsedTerritories = member.territories
          }
          console.log('Parsed territories:', parsedTerritories)
        } catch (error) {
          console.error('Error parsing territories:', error)
          parsedTerritories = []
        }
      }
      
      // Parse availability data
      let parsedAvailability = {
        monday: { start: "09:00", end: "17:00", available: true },
        tuesday: { start: "09:00", end: "17:00", available: true },
        wednesday: { start: "09:00", end: "17:00", available: true },
        thursday: { start: "09:00", end: "17:00", available: true },
        friday: { start: "09:00", end: "17:00", available: true },
        saturday: { start: "09:00", end: "17:00", available: false },
        sunday: { start: "09:00", end: "17:00", available: false }
      }
      
      if (member.availability) {
        try {
          if (typeof member.availability === 'string') {
          parsedAvailability = JSON.parse(member.availability)
          } else if (typeof member.availability === 'object' && member.availability !== null) {
            parsedAvailability = member.availability
          }
        } catch (error) {
          console.error('Error parsing availability:', error)
        }
      }
      
      const firstName = member.first_name || ""
      const lastName = member.last_name || ""
      setFullNameInput(`${firstName} ${lastName}`.trim()) // Set full name input for editing
      setFormData({
        firstName: firstName,
        lastName: lastName,
        email: member.email || "",
        phone: member.phone || "",
        location: member.location || "",
        city: member.city || "",
        state: member.state || "",
        zipCode: member.zip_code || "",
        role: member.role || "worker",
        isServiceProvider: member.is_service_provider !== false,
        color: member.color || "#2563EB",
        territories: parsedTerritories,
        hourlyRate: member.hourly_rate || null,
        commissionPercentage: member.commission_percentage || null,
        salaryStartDate: member.salary_start_date ? member.salary_start_date.split('T')[0] : null,
        availability: parsedAvailability,
        permissions: (() => {
          // When editing, use ONLY the saved permissions - no defaults
          // If permissions don't exist or fail to parse, return empty object
          // This ensures each worker only has the permissions that were explicitly saved
          if (!member.permissions) {
            return {}
          }
          
          try {
            if (typeof member.permissions === 'string') {
              const parsed = JSON.parse(member.permissions)
              // Return the parsed permissions exactly as saved, or empty object if null/undefined
              return parsed || {}
            } else if (typeof member.permissions === 'object' && member.permissions !== null) {
              return member.permissions
            }
          } catch (error) {
            console.error('Error parsing permissions:', error)
          }
          
          // If we can't parse permissions, return empty object - don't apply defaults
          return {}
        })()
      })
    } else if (isOpen && !isEditing) {
      // Reset form for new member
      setFullNameInput("") // Reset full name input
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        location: "",
        city: "",
        state: "",
        zipCode: "",
        role: "worker",
        isServiceProvider: true,
        isActive: true,
        color: "#2563EB",
        territories: [],
        hourlyRate: null,
        commissionPercentage: null,
        salaryStartDate: new Date().toISOString().split('T')[0],
        availability: {
          monday: { start: "09:00", end: "17:00", available: true },
          tuesday: { start: "09:00", end: "17:00", available: true },
          wednesday: { start: "09:00", end: "17:00", available: true },
          thursday: { start: "09:00", end: "17:00", available: true },
          friday: { start: "09:00", end: "17:00", available: true },
          saturday: { start: "09:00", end: "17:00", available: false },
          sunday: { start: "09:00", end: "17:00", available: false }
        },
        permissions: {
          editAvailability: true,
          viewCustomerContact: false,
          viewCustomerNotes: false,
          markJobStatus: true,
          resetJobStatuses: false,
          editJobDetails: true,
          viewEditJobPrice: false,
          processPayments: false,
          rescheduleJobs: true,
          seeOtherProviders: true
        }
      })
    }
  }, [isOpen, member, isEditing])

  // Fetch territories when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      fetchTerritories()
    }
  }, [isOpen, userId])

  const fetchTerritories = async () => {
    try {
      setLoadingTerritories(true)
      console.log('Fetching territories for userId:', userId)
      const response = await territoriesAPI.getAll(userId, { status: 'active' })
      console.log('Territories response:', response)
      console.log('Available territories:', response.territories || [])
      setTerritories(response.territories || [])
    } catch (error) {
      console.error('Error fetching territories:', error)
      setTerritories([])
    } finally {
      setLoadingTerritories(false)
    }
  }

  const validateEmail = (email) => {
    if (!email) return false // Email is required
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePhone = (phone) => {
    if (!phone) return true // Phone is optional
    // Remove all formatting characters (spaces, dashes, parentheses)
    const cleaned = phone.replace(/[\s\-()]/g, '')
    // Server validation: must start with + or digit 1-9, then 0-15 more digits
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    return phoneRegex.test(cleaned)
  }

  const formatPhone = (phone) => {
    if (!phone) return phone
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '')
    
    // Format based on length
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`
    } else if (cleaned.length > 10) {
      // International format
      return `+${cleaned}`
    }
    return phone
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value
    const formatted = formatPhone(value)
    handleInputChange('phone', formatted)
  }


  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      }
      
      // When role changes, update default permissions
      // BUT: Only apply defaults if we're creating a new member (not editing)
      // When editing, preserve existing permissions to allow individual customization
      if (field === 'role' && !isEditing) {
        if (value === 'scheduler') {
          // Scheduler defaults: editAvailability checked, processPayments unchecked
          updated.permissions = {
            editAvailability: true,
            viewCustomerContact: true,
            viewCustomerNotes: true,
            markJobStatus: true,
            resetJobStatuses: true,
            editJobDetails: true,
            viewEditJobPrice: true,
            processPayments: false, // Default unchecked for scheduler
            rescheduleJobs: true,
            seeOtherProviders: true
          }
        } else if (value === 'manager') {
          // Manager has full access, so all permissions are enabled
          updated.permissions = {
            editAvailability: true,
            viewCustomerContact: true,
            viewCustomerNotes: true,
            markJobStatus: true,
            resetJobStatuses: true,
            editJobDetails: true,
            viewEditJobPrice: true,
            processPayments: true,
            rescheduleJobs: true,
            seeOtherProviders: true
          }
        } else if (value === 'worker') {
          // Reset to worker defaults if switching from another role
          updated.permissions = {
            editAvailability: true,
            viewCustomerContact: false,
            viewCustomerNotes: false,
            markJobStatus: true,
            resetJobStatuses: false,
            editJobDetails: true,
            viewEditJobPrice: false,
            processPayments: false,
            rescheduleJobs: true,
            seeOtherProviders: true
          }
        }
      }
      
      return updated
    })
  }

  const handleAvailabilityChange = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: {
          ...prev.availability[day],
          [field]: value
        }
      }
    }))
  }

  const handleTerritoryToggle = (territoryId) => {
    console.log('🔄 Toggling territory:', territoryId)
    console.log('🔄 Territory type:', typeof territoryId)
    setFormData(prev => {
      const currentTerritories = prev.territories || []
      const isSelected = currentTerritories.includes(territoryId)
      
      console.log('📋 Current territories before toggle:', currentTerritories)
      console.log('✅ Is territory selected:', isSelected)
      console.log('🔍 Territory ID to toggle:', territoryId)
      
      if (isSelected) {
        const newTerritories = currentTerritories.filter(id => {
          console.log('🔍 Comparing:', id, 'with', territoryId, 'types:', typeof id, typeof territoryId)
          return id !== territoryId
        })
        console.log('❌ Removing territory, new list:', newTerritories)
        return {
          ...prev,
          territories: newTerritories
        }
      } else {
        const newTerritories = [...currentTerritories, territoryId]
        console.log('➕ Adding territory, new list:', newTerritories)
        return {
          ...prev,
          territories: newTerritories
        }
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Names are optional - trim them but don't require them
    const trimmedFirstName = formData.firstName?.trim() || ''
    const trimmedLastName = formData.lastName?.trim() || ''
    
    // Update formData with trimmed values (allow empty strings)
    if (formData.firstName !== trimmedFirstName || formData.lastName !== trimmedLastName) {
      setFormData(prev => ({
        ...prev,
        firstName: trimmedFirstName,
        lastName: trimmedLastName
      }))
    }
    
    if (!formData.email) {
      const errorMsg = "Email is required"
      setError(errorMsg)
      setErrorMessage(errorMsg)
      setShowErrorNotification(true)
      return
    }
    
    // Validate email if provided
    if (formData.email && !validateEmail(formData.email)) {
      const errorMsg = "Please enter a valid email address"
      setError(errorMsg)
      setErrorMessage(errorMsg)
      setShowErrorNotification(true)
      return
    }
    
    // Validate phone if provided
    if (formData.phone && !validatePhone(formData.phone)) {
      const errorMsg = "Please enter a valid phone number"
      setError(errorMsg)
      setErrorMessage(errorMsg)
      setShowErrorNotification(true)
      return
    }

    setLoading(true)
    setError("")
    setShowErrorNotification(false)

    try {
      const memberData = {
        userId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        role: formData.role,
        isServiceProvider: formData.isServiceProvider,
        territories: formData.territories,
        hourlyRate: formData.hourlyRate || null,
        commissionPercentage: formData.commissionPercentage || null,
        salaryStartDate: formData.salaryStartDate || null,
        permissions: typeof formData.permissions === 'string' 
          ? formData.permissions 
          : JSON.stringify(formData.permissions || {}),
        color: formData.color || '#2563EB'
      }
      
      console.log('Sending member data:', memberData)

      if (isEditing && member) {
        await teamAPI.update(member.id, memberData)
      } else {
        await teamAPI.create(memberData)
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error saving team member:', error)
      const errorMsg = error.response?.data?.error || error.message || "Failed to save team member. Please try again."
      setError(errorMsg)
      setErrorMessage(errorMsg)
      setShowErrorNotification(true)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Error Toast Notification */}
      <Notification
        message={errorMessage}
        type="error"
        duration={5000}
        show={showErrorNotification}
        onClose={() => setShowErrorNotification(false)}
      />
      
      <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-2xl sm:max-w-md relative my-4 sm:my-6 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-center justify-center p-4 sm:p-6 border-b border-[var(--sf-border-light)]">
          <div className="flex items-center">
            {/* {isEditing ? (
              <Edit className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--sf-blue-500)] mr-2" />
            ) : (
              <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--sf-blue-500)] mr-2" />
            )} */}
            <h3 className="text-md sm:text-md font-semibold text-[var(--sf-text-primary)]">
              {isEditing ? "Edit Team Member" : "Add Team Member"}
            </h3>
          </div>
          
        </div>
        <button
            onClick={onClose}
            className="text-black cursor-pointer bg-[var(--sf-bg-page)] rounded-sm hover:bg-gray-200 p-1 absolute top-4 right-4"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          <form id="team-member-form" onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Basic Information */}
            <div>
              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullNameInput}
                onChange={(e) => {
                  const value = e.target.value
                  setFullNameInput(value) // Update local state to preserve spaces while typing
                  // Split by spaces and filter out empty strings (handles multiple spaces)
                  const trimmedValue = value.trim()
                  const names = trimmedValue.split(/\s+/).filter(name => name.length > 0)
                  handleInputChange('firstName', names[0] || '')
                  handleInputChange('lastName', names.slice(1).join(' ') || '')
                }}
                onBlur={() => {
                  // Trim the input when user leaves the field
                  const trimmed = fullNameInput.trim()
                  setFullNameInput(trimmed)
                  const names = trimmed.split(/\s+/).filter(name => name.length > 0)
                  handleInputChange('firstName', names[0] || '')
                  handleInputChange('lastName', names.slice(1).join(' ') || '')
                }}
                className="w-full text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Full Name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Email Address"
                required
              />
              <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
                An email will be sent with instructions to log into their Zenbooker account.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                Mobile Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={handlePhoneChange}
                className="w-full text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Optional"
              />
              <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
              Service providers can be notified via SMS when new jobs are assigned to them</p>
            </div>

            {/* Location Section */}
            <div>
              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                Start Location
              </label>
              <AddressAutocomplete
                  value={formData.location}
                onChange={(value) => handleInputChange('location', value)}
                onAddressSelect={(addressData) => {
                  // Update form data with structured address information
                  setFormData(prev => ({
                    ...prev,
                    location: addressData.formattedAddress,
                    city: addressData.components.city,
                    state: addressData.components.state,
                    zipCode: addressData.components.zipCode
                  }));
                }}
                placeholder="Start typing an address..."
                showValidationResults={true}
                className="w-full text-xs"
              />
              <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
                The location this team member starts work from.
              </p>
            </div>

            {/* Service Provider Toggle */}
            <div className="border border-[var(--sf-border-light)] p-2 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                <div>
                  <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Service Provider</h3>
                  <p className="text-xs text-[var(--sf-text-muted)]">Can this team member be assigned to jobs?</p>
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleInputChange('isServiceProvider', !formData.isServiceProvider)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      formData.isServiceProvider ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.isServiceProvider ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="ml-2 text-sm font-medium text-[var(--sf-text-primary)]">
                    {formData.isServiceProvider ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Settings Section */}
            <div className="border-t border-[var(--sf-border-light)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3 flex items-center">
                <DollarSign className="w-4 h-4 mr-2 text-[var(--sf-text-secondary)]" />
                Payment Settings
              </h3>
              <p className="text-xs text-[var(--sf-text-muted)] mb-3">
                Set how this team member gets paid for payroll calculations.
              </p>
              
              <div className="space-y-3">
                {/* Hourly Rate */}
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Hourly Rate
                  </label>
                  <div className="flex items-center space-x-2">
                    <span className="text-[var(--sf-text-muted)]">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.hourlyRate !== null && formData.hourlyRate !== undefined ? formData.hourlyRate : ''}
                      onChange={(e) => handleInputChange('hourlyRate', e.target.value ? parseFloat(e.target.value) : null)}
                      className="flex-1 text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="0.00"
                    />
                    <span className="text-xs text-[var(--sf-text-muted)]">/hour</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
                    Salary = Hours Worked × Hourly Rate
                  </p>
                </div>

                {/* Commission Percentage */}
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Commission Percentage
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.commissionPercentage !== null && formData.commissionPercentage !== undefined ? formData.commissionPercentage : ''}
                      onChange={(e) => handleInputChange('commissionPercentage', e.target.value ? parseFloat(e.target.value) : null)}
                      className="flex-1 text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="0.00"
                    />
                    <span className="text-[var(--sf-text-muted)]">%</span>
                    <span className="text-xs text-[var(--sf-text-muted)]">of job revenue</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
                    Commission = Job Revenue × Commission %
                  </p>
                </div>

                {/* Salary Start Date - shown for all roles */}
                <div>
                  <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-1">
                    Salary Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.salaryStartDate || ''}
                    onChange={(e) => handleInputChange('salaryStartDate', e.target.value || null)}
                    className="w-full text-xs px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-[var(--sf-text-muted)]">
                    {formData.role === 'manager' || formData.role === 'scheduler'
                      ? 'Scheduled salary will be calculated from this date'
                      : 'Date from which salary calculations begin'}
                  </p>
                </div>

                {/* Payment Method Info */}
                {(formData.hourlyRate || formData.commissionPercentage) && (
                  <div className="p-2 bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800">
                      <strong>Payment Method:</strong> {
                        formData.hourlyRate && formData.commissionPercentage
                          ? 'Hybrid (Hourly + Commission)'
                          : formData.hourlyRate
                            ? 'Hourly Rate Only'
                            : 'Commission Percentage Only'
                      }
                    </p>
                  </div>
                )}

                {!formData.hourlyRate && !formData.commissionPercentage && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800">
                      <strong>Note:</strong> Set at least one payment method to enable payroll calculations.
                    </p>
                  </div>
                )}
              </div>

              {/* Pay Rate History - only show when editing */}
              {isEditing && member?.id && (
                <div className="mt-4 border-t border-[var(--sf-border-light)] pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-[var(--sf-text-primary)] flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1.5 text-[var(--sf-text-muted)]" />
                      Pay Rate History
                    </h4>
                    {!editingRateId && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddRate(prev => !prev)
                          setNewRate({ hourlyRate: '', commissionPercentage: '', effectiveFrom: '', note: '' })
                        }}
                        className="text-xs text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] flex items-center"
                      >
                        <Plus className="w-3 h-3 mr-0.5" />
                        Add Rate Change
                      </button>
                    )}
                  </div>

                  {payRateStatus && (
                    <div className={`mb-2 px-2 py-1.5 rounded text-xs border ${
                      payRateStatus.kind === 'success'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                      {payRateStatus.message}
                    </div>
                  )}

                  {(showAddRate || editingRateId) && (
                    <div className="p-3 bg-[var(--sf-bg-page)] rounded-lg mb-2 space-y-2">
                      <div className="text-xs font-medium text-[var(--sf-text-secondary)]">
                        {editingRateId ? 'Edit Rate' : 'New Rate'}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-[var(--sf-text-secondary)] mb-0.5">Hourly Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newRate.hourlyRate}
                            onChange={(e) => setNewRate(prev => ({ ...prev, hourlyRate: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-[var(--sf-border-light)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                            placeholder="$0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--sf-text-secondary)] mb-0.5">Commission %</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={newRate.commissionPercentage}
                            onChange={(e) => setNewRate(prev => ({ ...prev, commissionPercentage: e.target.value }))}
                            className="w-full text-xs px-2 py-1.5 border border-[var(--sf-border-light)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                            placeholder="0%"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--sf-text-secondary)] mb-0.5">Effective From</label>
                        <input
                          type="date"
                          value={newRate.effectiveFrom}
                          onChange={(e) => setNewRate(prev => ({ ...prev, effectiveFrom: e.target.value }))}
                          className="w-full text-xs px-2 py-1.5 border border-[var(--sf-border-light)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--sf-text-secondary)] mb-0.5">Note (optional)</label>
                        <input
                          type="text"
                          value={newRate.note}
                          onChange={(e) => setNewRate(prev => ({ ...prev, note: e.target.value }))}
                          className="w-full text-xs px-2 py-1.5 border border-[var(--sf-border-light)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                          placeholder="e.g. Rate increase, promotion"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddRate(false)
                            setEditingRateId(null)
                            setNewRate({ hourlyRate: '', commissionPercentage: '', effectiveFrom: '', note: '' })
                          }}
                          className="text-xs px-3 py-1 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newRate.effectiveFrom) return
                            try {
                              const body = {
                                hourlyRate: newRate.hourlyRate ? parseFloat(newRate.hourlyRate) : null,
                                commissionPercentage: newRate.commissionPercentage ? parseFloat(newRate.commissionPercentage) : null,
                                effectiveFrom: newRate.effectiveFrom,
                                note: newRate.note || null
                              }
                              const resp = editingRateId
                                ? await teamAPI.updatePayRate(member.id, editingRateId, body)
                                : await teamAPI.addPayRate(member.id, body)
                              const action = editingRateId ? 'Rate updated' : 'Rate added'
                              setPayRateStatus({ kind: 'success', message: buildRecalcMessage(resp?.recalculated, action) })

                              const data = await teamAPI.getPayRates(member.id)
                              setPayRates(data.payRates || [])
                              setShowAddRate(false)
                              setEditingRateId(null)
                              setNewRate({ hourlyRate: '', commissionPercentage: '', effectiveFrom: '', note: '' })
                              const latest = (data.payRates || [])[0]
                              if (latest) {
                                handleInputChange('hourlyRate', latest.hourly_rate ? parseFloat(latest.hourly_rate) : null)
                                handleInputChange('commissionPercentage', latest.commission_percentage ? parseFloat(latest.commission_percentage) : null)
                              }
                            } catch (err) {
                              console.error('Error saving pay rate:', err)
                              setPayRateStatus({ kind: 'error', message: err?.response?.data?.error || 'Failed to save rate' })
                            }
                          }}
                          className="text-xs px-3 py-1 bg-[var(--sf-blue-500)] text-white rounded hover:bg-[var(--sf-blue-600)]"
                          disabled={!newRate.effectiveFrom}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {payRates.length > 0 ? (
                    <div className="space-y-1">
                      {payRates.map((rate, idx) => (
                        <div key={rate.id} className={`flex items-center justify-between p-2 rounded text-xs ${idx === 0 ? 'bg-[var(--sf-blue-50)] border border-blue-200' : 'bg-[var(--sf-bg-page)]'}`}>
                          <div>
                            <span className="font-medium text-[var(--sf-text-primary)]">
                              {rate.hourly_rate ? `$${parseFloat(rate.hourly_rate).toFixed(2)}/hr` : ''}
                              {rate.hourly_rate && rate.commission_percentage ? ' + ' : ''}
                              {rate.commission_percentage ? `${parseFloat(rate.commission_percentage)}%` : ''}
                              {!rate.hourly_rate && !rate.commission_percentage ? 'No pay' : ''}
                            </span>
                            <span className="text-[var(--sf-text-muted)] ml-2">
                              from {new Date(rate.effective_from + 'T00:00:00').toLocaleDateString()}
                            </span>
                            {idx === 0 && <span className="ml-1.5 text-[var(--sf-blue-500)] font-medium">(current)</span>}
                            {rate.note && <span className="text-[var(--sf-text-muted)] ml-1.5">— {rate.note}</span>}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRateId(rate.id)
                                setShowAddRate(false)
                                setNewRate({
                                  hourlyRate: rate.hourly_rate != null ? String(parseFloat(rate.hourly_rate)) : '',
                                  commissionPercentage: rate.commission_percentage != null ? String(parseFloat(rate.commission_percentage)) : '',
                                  effectiveFrom: String(rate.effective_from).split('T')[0].split(' ')[0],
                                  note: rate.note || '',
                                })
                              }}
                              className="text-[var(--sf-text-muted)] hover:text-[var(--sf-blue-500)] p-0.5"
                              title="Edit rate"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const resp = await teamAPI.deletePayRate(member.id, rate.id)
                                  setPayRateStatus({ kind: 'success', message: buildRecalcMessage(resp?.recalculated, 'Rate deleted') })
                                  const data = await teamAPI.getPayRates(member.id)
                                  setPayRates(data.payRates || [])
                                  const latest = (data.payRates || [])[0]
                                  if (latest) {
                                    handleInputChange('hourlyRate', latest.hourly_rate ? parseFloat(latest.hourly_rate) : null)
                                    handleInputChange('commissionPercentage', latest.commission_percentage ? parseFloat(latest.commission_percentage) : null)
                                  } else {
                                    handleInputChange('hourlyRate', null)
                                    handleInputChange('commissionPercentage', null)
                                  }
                                } catch (err) {
                                  console.error('Error deleting pay rate:', err)
                                  setPayRateStatus({ kind: 'error', message: err?.response?.data?.error || 'Failed to delete rate' })
                                }
                              }}
                              className="text-[var(--sf-text-muted)] hover:text-red-500 p-0.5"
                              title="Delete rate"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--sf-text-muted)]">No rate history yet. Current rate will be used for all periods.</p>
                  )}
                </div>
              )}
            </div>

            {/* User Role and Permissions */}
            <div className="border-t border-[var(--sf-border-light)] pt-4 sm:pt-6">
              <h3 className="text-md font-semibold text-black mb-3">User Role and Permissions</h3>
              <div className="space-y-4 ">
                {/* Worker Role */}
                <label className="flex divide-y items-start flex-col border border-[var(--sf-border-light)] rounded-lg cursor-pointer">
                <div className="flex p-3 space-x-2">  
                  <input
                    type="radio"
                    name="role"
                    value="worker"
                    checked={formData.role === 'worker'}
                    onChange={(e) => handleInputChange('role', e.target.value)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] mt-0.5"
                  />
                  <div className="flex flex-col">
                   <span className="text-sm font-medium text-[var(--sf-text-primary)]">Worker</span>
                    <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                      Can only view jobs assigned to them. You can customize what job details they can see and edit.
                    </p>
                    </div>
                    </div>
                       
                    {/* Worker-specific permissions - only show when Worker is selected */}
                    {formData.role === 'worker' && (
                  <div className="p-3 flex w-full bg-[var(--sf-bg-page)]">
                   
                 
                      <div className="mt-2 space-y-3 pl-0 w-full">
                          
                          
                          <div className="ml-6 mt-2 space-y-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.permissions.editAvailability === true}
                              onChange={(e) => handleInputChange('permissions', {
                                ...formData.permissions,
                                editAvailability: e.target.checked
                              })}
                              className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                            />
                            <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Edit their own availability</span>
                          </label>
                            <p className="text-[10px] font-medium text-[var(--sf-text-muted)] mb-2">
                              For jobs assigned to this team member, allow them to:
                            </p>
                            <div className="flex flex-col">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={formData.permissions.viewCustomerContact === true}
                                  onChange={(e) => handleInputChange('permissions', {
                                    ...formData.permissions,
                                    viewCustomerContact: e.target.checked
                                  })}
                                  className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                                />
                                <span className="ml-2 text-xs text-[var(--sf-text-primary)]">View contact info for customer (phone & email)</span>
                              </label>
                              <p className="ml-5 text-[10px] text-[var(--sf-text-muted)] mt-0.5">Note: Address is always visible for workers by default</p>
                            </div>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.viewCustomerNotes === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  viewCustomerNotes: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">View customer notes</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.markJobStatus === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  markJobStatus: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Mark jobs as 'en-route', 'in-progress' & 'complete'</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.resetJobStatuses === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  resetJobStatuses: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Reset job statuses</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.editJobDetails === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  editJobDetails: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Edit job details</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.viewEditJobPrice === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  viewEditJobPrice: e.target.checked
                                })}
                                    className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">View & edit job price, invoice, and line items</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.processPayments === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  processPayments: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Process payments and mark jobs as paid</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.rescheduleJobs === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  rescheduleJobs: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Reschedule jobs</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.seeOtherProviders === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  seeOtherProviders: e.target.checked
                                })}
                                  className="h-3 w-3 rounded-sm text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">See other providers assigned</span>
                            </label>
                          </div>
                      </div>
                  </div>
                  
                )}
                </label>

                {/* Scheduler Role */}
                <label className="flex divide-y items-start flex-col border border-[var(--sf-border-light)] rounded-lg cursor-pointer">
                  
                <div className="flex p-3 space-x-2">  
                  <input
                    type="radio"
                    name="role"
                    value="scheduler"
                    checked={formData.role === 'scheduler'}
                    onChange={(e) => handleInputChange('role', e.target.value)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] mt-0.5"
                  />
                  <div className="ml-3 flex-1">
                    <span className="text-sm font-medium text-[var(--sf-text-primary)]">Scheduler</span>
                    <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                      Full access to all job and client details. Schedulers can create, dispatch, reschedule, and edit jobs.
                    </p>
                    </div>
                    </div>
                    {/* Scheduler-specific permissions - only show when Scheduler is selected */}
                    {formData.role === 'scheduler' && (
                       <div className="p-3 flex w-full bg-[var(--sf-bg-page)]">
                 
                          <div className="space-y-3 p-3">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.editAvailability === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  editAvailability: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Edit their own availability</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.permissions.processPayments === true}
                                onChange={(e) => handleInputChange('permissions', {
                                  ...formData.permissions,
                                  processPayments: e.target.checked
                                })}
                                className="h-3 w-3 rounded-sm text-[var(--sf-blue-500)] focus:ring-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded"
                              />
                              <span className="ml-2 text-xs text-[var(--sf-text-primary)]">Process payments and mark jobs as paid</span>
                            </label>
                      </div>
                      </div>
                    )}
                </label>

                {/* Manager Role */}
                <label className="flex items-start cursor-pointer border border-[var(--sf-border-light)] rounded-lg p-3">
                  <input
                    type="radio"
                    name="role"
                    value="manager"
                    checked={formData.role === 'manager'}
                    onChange={(e) => handleInputChange('role', e.target.value)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-[var(--sf-border-light)] mt-0.5"
                  />
                  <div className="ml-3 flex-1">
                    <span className="text-sm font-medium text-[var(--sf-text-primary)]">Manager</span>
                    <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                      Managers have full access to all areas of the business, including adding or removing users.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </form>
        </div>

        {/* Footer - Fixed */}
        <div className="flex items-center justify-end space-x-3 p-4 sm:p-6 border-t border-[var(--sf-border-light)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              handleSubmit(e)
            }}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-[var(--sf-blue-500)] hover:bg-[var(--sf-blue-600)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                {isEditing ? <Edit className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {isEditing ? "Update" : "Add"} Team Member
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

export default AddTeamMemberModal 