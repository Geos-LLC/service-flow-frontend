import React, { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import { GOOGLE_MAPS_API_KEY } from "../config/maps"
import { 
  ArrowLeft, 
  Edit, 
  Save, 
  X, 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Phone, 
  Mail, 
  FileText, 
  CheckCircle, 
  XCircle, 
  PlayCircle, 
  PauseCircle,
  AlertCircle,
  Check,
  DollarSign,
  User,
  UserX,
  Building,
  ChevronDown,
  ChevronUp,
  Settings,
  CreditCard,
  Truck,
  Clipboard,
  Home,
  Plus,
  Tag,
  Star,
  MessageSquare,
  Bell,
  Zap,
  Shield,
  Award,
  Target,
  Navigation,
  Package,
  Tool,
  Wrench,
  Paintbrush,
  Leaf,
  Sparkles,
  MoreVertical,
  ExternalLink,
  Printer,
  CalendarCheck,
  Send,
  Edit3,
  MapPin as LocationIcon,
  Calendar as CalendarIcon,
  Copy,
  Trash2,
  Menu,
  Search,
  ChevronLeft,
  MoreHorizontal,  Timer,  ClipboardList,
  MailCheck,
  Eye,
  RotateCw
} from "lucide-react"
import { jobsAPI, notificationAPI, territoriesAPI, teamAPI, invoicesAPI, twilioAPI, calendarAPI, notificationSettingsAPI, availabilityAPI, paymentMethodsAPI, paymentSettingsAPI } from "../services/api"
import api, { stripeAPI } from "../services/api"
import CancelJobModal from "../components/CancelJobModal"
import CancellationSummary from "../components/CancellationSummary"
import { useAuth } from "../context/AuthContext"
import Sidebar from "../components/sidebar"
import AddressAutocomplete from "../components/address-autocomplete"
import IntakeAnswersDisplay from "../components/intake-answers-display"
import IntakeQuestionsForm from "../components/intake-questions-form"
import StatusProgressBar from "../components/status-progress-bar"
import { formatPhoneNumber } from "../utils/phoneFormatter"
import { formatDateLocal } from "../utils/dateUtils"
import { decodeHtmlEntities } from "../utils/htmlUtils"
import { formatRecurringFrequency } from "../utils/recurringUtils"
import { getMemberDrivingTime } from "../utils/slotUtils"
import { calculateJobTotal, resolveDiscount } from "../utils/priceUtils"
import ConvertToRecurringModal from "../components/convert-to-recurring-modal"
import AssignJobModal from "../components/assign-job-modal"
import DuplicateJobModal from "../components/duplicate-job-modal"
import JobExpensesSection from "../components/job-expenses-section"
import { 
  canViewCustomerContact, 
  canViewCustomerNotes,
  canMarkJobStatus, 
  canResetJobStatuses,
  canRescheduleJobs, 
  canEditJobDetails, 
  canProcessPayments,
  canViewEditJobPrice,
  canSeeOtherProviders
} from "../utils/permissionUtils"
import { isWorker } from "../utils/roleUtils"

const JobDetails = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [error, setError] = useState("")

  // Google Places Autocomplete state (now handled by AddressAutocomplete component)

  // Form data for editing
  const [formData, setFormData] = useState({
    service_name: "",
    bathroom_count: "",
    duration: 0,
    workers_needed: 1,
    skills: [],
    notes: "",
    internal_notes: "",
    serviceAddress: {
      street: "",
      city: "",
      state: "",
      zipCode: ""
    },
    scheduledDate: "",
    scheduledTime: "",
    offer_to_providers: false
  })

  // UI state
  const [editing, setEditing] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showEditServiceModal, setShowEditServiceModal] = useState(false)
  const [showDurationEditor, setShowDurationEditor] = useState(false)
  const [showEditAddressModal, setShowEditAddressModal] = useState(false)
  const [showConvertToRecurringModal, setShowConvertToRecurringModal] = useState(false)
  const [showEditRecurringModal, setShowEditRecurringModal] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showMobileMoreActions, setShowMobileMoreActions] = useState(false)
  const mobileMoreActionsRef = useRef(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showSendInvoiceModal, setShowSendInvoiceModal] = useState(false)
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false)
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [showTipModal, setShowTipModal] = useState(false)
  const [showIncentiveModal, setShowIncentiveModal] = useState(false)
  const [includePaymentLink, setIncludePaymentLink] = useState(true)
  const [stripeConnected, setStripeConnected] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [showEmailRequiredModal, setShowEmailRequiredModal] = useState(false)
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'send' or 'resend'
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const [notificationType, setNotificationType] = useState(null) // 'confirmation' or 'reminder'
  const [notificationEmail, setNotificationEmail] = useState('')
  const [notificationPhone, setNotificationPhone] = useState('')
  const [selectedNotificationMethod, setSelectedNotificationMethod] = useState('email') // 'email' or 'sms'
  const [showCustomMessageModal, setShowCustomMessageModal] = useState(false)
  const [customMessage, setCustomMessage] = useState('')
  const [customMessageEmail, setCustomMessageEmail] = useState('')
  const [openNotificationMenu, setOpenNotificationMenu] = useState(null) // 'confirmation' or 'reminder'
  const [showMessageViewer, setShowMessageViewer] = useState(false)
  const [viewingMessageType, setViewingMessageType] = useState(null) // 'confirmation' or 'reminder'
  const confirmationMenuRef = useRef(null)
  const reminderMenuRef = useRef(null)
  const [editCustomerData, setEditCustomerData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    source: ''
  })
  useEffect(() => {
    function handleClickOutside(event) {
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setMoreDropdown(false);
      }
      if (confirmationMenuRef.current && !confirmationMenuRef.current.contains(event.target)) {
        setOpenNotificationMenu(null);
      }
      if (reminderMenuRef.current && !reminderMenuRef.current.contains(event.target)) {
        setOpenNotificationMenu(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  // Address autopopulation state
  const [addressAutoPopulated, setAddressAutoPopulated] = useState(false)

  // Update form data when edit address modal opens
  useEffect(() => {
    if (showEditAddressModal && job) {
      setFormData(prev => ({
        ...prev,
        serviceAddress: {
          street: job.customer_address || job.service_address_street || "",
          city: job.customer_city || job.service_address_city || "",
          state: job.customer_state || job.service_address_state || "",
          zipCode: job.customer_zip_code || job.service_address_zip || ""
        }
      }))
    }
  }, [showEditAddressModal, job])

  // Update form data when edit service modal opens
  useEffect(() => {
    if (showEditServiceModal && job) {
      console.log('Updating formData for edit service modal:', {
        service_price: job.service_price,
        discount: job.discount,
        additional_fees: job.additional_fees,
        taxes: job.taxes,
        total: job.total
      })
      
      // Store original job data for reset functionality
      setOriginalJobData({
        service_modifiers: job.service_modifiers
      });
      
      // Use initial base price (service_price) for the customize field and calculations -- not job.total
      const servicePrice = parseFloat(job.service_price) || 0;
      const discount = parseFloat(job.discount) || 0;
      const additionalFees = parseFloat(job.additional_fees) || 0;
      const taxes = parseFloat(job.taxes) || 0;
      const modifierPrice = calculateModifierPrice();
      const calculatedTotal = calculateJobTotal({ servicePrice: servicePrice + modifierPrice, discount, additionalFees, taxes });
      
      setFormData(prev => ({
        ...prev,
        service_name: job.service_name || "",
        bathroom_count: job.bathroom_count || "",
        duration: job.duration || job.estimated_duration || 0,
        service_price: servicePrice,
        modifier_price: modifierPrice,
        discount: discount > 0 ? discount : undefined,
        additional_fees: additionalFees,
        taxes: taxes,
        tip: 0,
        total: calculatedTotal
      }))
    }
  }, [showEditServiceModal, job])

  // Data state
  const [territories, setTerritories] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [customPaymentMethods, setCustomPaymentMethods] = useState([])
  const [tipSettings, setTipSettings] = useState({ tipCalculationMode: 'automatic', paymentTypeFees: {} })
  const [companyDrivingTimeMinutes, setCompanyDrivingTimeMinutes] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDriveTime, setShowDriveTime] = useState(true)
  const [invoice, setInvoice] = useState(null)
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [userTwilioConnected, setUserTwilioConnected] = useState(false)
  const [intakeQuestionAnswers, setIntakeQuestionAnswers] = useState({})
  const [originalJobData, setOriginalJobData] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    tipAmount: '',
    paymentMethod: 'cash',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: ''
  })
  
  // Keepalive functionality to prevent Railway backend from sleeping
  useEffect(() => {
    const keepWarm = async () => {
      try {
        await fetch(`${process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api'}/health`, {
          method: 'HEAD',
        });
        console.log('✅ Backend keepalive ping');
      } catch (error) {
        console.log('⚠️ Keepalive ping failed (normal if backend is sleeping)');
      }
    };

    // Initial ping on job details load
    keepWarm();

    // Set up interval to ping every 10 minutes
    const keepaliveInterval = setInterval(keepWarm, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(keepaliveInterval);
  }, []);
  const [isRetrying, setIsRetrying] = useState(false)
  const [statusDropdown, setStatusDropdown] = useState(false)
  const [moreDropdown, setMoreDropdown] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showEditJobRequirementsModal, setShowEditJobRequirementsModal] = useState(false)
  const [editJobRequirementsData, setEditJobRequirementsData] = useState({
    workers_needed: 1,
    required_skills: []
  })
  const moreRef = useRef(null)
  const territoryRef = useRef(null)

  // Progress tracker steps - 4 step system
  const getProgressSteps = () => {
    const currentStatus = job?.status || 'scheduled'
    
    
    const steps = [
      { label: 'Scheduled', status: 'pending' },
      { label: 'Confirmed', status: 'pending' },
      { label: 'In Progress', status: 'pending' },
      { label: 'Completed', status: 'pending' }
    ]
    
    // Map job status to step status - 4 step system
    const statusMap = {
      'scheduled': 0,
      'pending': 0,
      'confirmed': 1,
      'en_route': 2,
      'enroute': 2,
      'in_progress': 2,
      'in-progress': 2,  // Handle hyphenated version
      'in_prog': 2,
      'started': 2,
      'completed': 3,
      'complete': 3,
      'cancelled': -1,
      'canceled': -1
    }
    
    const currentStepIndex = statusMap[currentStatus] || 0
    
    return steps.map((step, index) => {
      if (index < currentStepIndex) {
        return { ...step, status: 'completed' }
      } else if (index === currentStepIndex) {
        return { ...step, status: 'active' }
      } else {
        return { ...step, status: 'pending' }
      }
    })
  }

  const steps = getProgressSteps()

  // Helper function to format time ago
  const getTimeAgo = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now - date) / 1000)
    
    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60)
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600)
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    }
    const days = Math.floor(diffInSeconds / 86400)
    return `${days} ${days === 1 ? 'day' : 'days'} ago`
  }

  // Status update handlers for progress tracker
  const handleStatusUpdate = async (newStatus) => {
    if (!job) {
      console.error('No job data available')
      setError('No job data available')
      return
    }

    // Route ALL cancel transitions through the cancel modal — so the optional
    // cancellation fee / cleaner reimbursement / reason / notes fields are
    // captured. Without this, menu buttons bypass the modal and hit the plain
    // status PATCH, producing a cancelled job with no cancellation metadata.
    if (newStatus === 'cancelled') {
      setShowCancelModal(true)
      return
    }

    try {
      setLoading(true)
      setError('')

      console.log('Updating job status:', { jobId: job.id, newStatus })

      // Use the same method as the existing status dropdown
      await jobsAPI.updateStatus(job.id, newStatus)
      
      // Fetch updated job to get the actual status from backend
      const updatedJobData = await jobsAPI.getById(job.id)
      const actualStatus = updatedJobData?.status || newStatus
      
      console.log('Status update response:', { newStatus, actualStatus, updatedJobData })
      
      // Map and parse the updated job data (including status_history)
      const mappedJob = mapJobData(updatedJobData)
      
      // Update local job state with actual status from backend
      setJob(prev => ({ ...prev, ...mappedJob }))
      
      setSuccessMessage(`Job marked as ${actualStatus.replace('_', ' ').replace('-', ' ')}`)
      setTimeout(() => setSuccessMessage(''), 3000)
      
      // Close dropdowns
      setStatusDropdown(false)
      setMoreDropdown(false)
      
    } catch (error) {
      console.error('Error updating job status:', error)
      console.error('Error response:', error.response)
      console.error('Error data:', error.response?.data)
      
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to update status'
      setError(errorMsg)
      setTimeout(() => setError(''), 5000)
    } finally {
      setLoading(false)
    }
  }

  // Sync job to Google Calendar
  const handleSyncToCalendar = async () => {
    if (!job) return;
    
    try {
      setLoading(true);
      setError('');
      
      const customerName = getCustomerName();
      const serviceName = job.service_name || 'Service';
      const scheduledDate = job.scheduled_date;
      const address = job.service_address_street 
        ? `${job.service_address_street}${job.service_address_unit ? `, ${job.service_address_unit}` : ''}, ${job.service_address_city}, ${job.service_address_state} ${job.service_address_zip}`
        : job.customer_address || '';
      
      // Extract time from scheduled_date
      let scheduledTime = '';
      if (scheduledDate) {
        if (scheduledDate.includes('T')) {
          scheduledTime = scheduledDate.split('T')[1]?.substring(0, 5) || '';
        } else if (scheduledDate.includes(' ')) {
          scheduledTime = scheduledDate.split(' ')[1]?.substring(0, 5) || '';
        }
      }
      
      const duration = job.duration || job.service_duration || 60;
      
      const response = await calendarAPI.syncJob({
        jobId: job.id,
        customerName,
        serviceName,
        scheduledDate: scheduledDate?.split(' ')[0] || scheduledDate?.split('T')[0] || '',
        scheduledTime,
        duration,
        address
      });
      
      console.log('✅ Job synced to calendar:', response);
      
      // Refresh job data to get the updated google_calendar_event_id
      const updatedJob = await jobsAPI.getById(job.id);
      if (updatedJob) {
        const mappedJobData = mapJobData(updatedJob);
        setJob(mappedJobData);
      }
      
      setSuccessMessage('Job synced to Google Calendar successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      setMoreDropdown(false);
    } catch (error) {
      console.error('❌ Error syncing to calendar:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Failed to sync to Google Calendar';
      setError(errorMsg);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Team assignment handler (multi-member via AssignJobModal)
  const handleAssignTeamMember = async (teamMemberIds, forceBook = false) => {
    if (!job) return

    try {
      setError('')

      const memberIdsArray = Array.isArray(teamMemberIds) ? teamMemberIds : (teamMemberIds ? [teamMemberIds] : [])
      const normalizedMemberIds = memberIdsArray.map(id => Number(id)).filter(id => id && !isNaN(id))

      // Get current assignments to remove if needed
      const currentAssignments = job.team_assignments || []
      const currentMemberIds = new Set(
        currentAssignments.map(ta => Number(ta.team_member_id)).filter(id => id)
      )
      if (currentMemberIds.size === 0) {
        const singleId = job.assigned_team_member_id || job.team_member_id
        if (singleId) currentMemberIds.add(Number(singleId))
      }

      if (normalizedMemberIds.length > 0) {
        const primaryMemberId = normalizedMemberIds[0]
        await jobsAPI.assignMultipleTeamMembers(job.id, normalizedMemberIds, primaryMemberId, forceBook)
      } else {
        const removePromises = Array.from(currentMemberIds).map(memberId =>
          jobsAPI.removeTeamMember(job.id, memberId)
        )
        await Promise.all(removePromises)
      }

      // Reload job data from API
      const jobData = await jobsAPI.getById(job.id)
      if (jobData) {
        const mappedJobData = mapJobData(jobData)
        setJob(mappedJobData)
      }

      const actionText = normalizedMemberIds.length === 0
        ? 'All team members unassigned successfully!'
        : normalizedMemberIds.length === 1
        ? 'Team member assigned successfully!'
        : `${normalizedMemberIds.length} team members assigned successfully!`

      setSuccessMessage(actionText)
      setTimeout(() => setSuccessMessage(''), 3000)
      setShowAssignModal(false)

    } catch (error) {
      if (error.response?.status === 409 && error.response?.data?.canForceBook) {
        const conflicts = error.response.data.conflicts || []
        const allWarnings = conflicts.flatMap(c => c.warnings.map(w => `${c.memberLabel}: ${w}`))
        const warningText = allWarnings.length > 0 ? allWarnings.join('\n- ') : (error.response.data.error || 'Scheduling conflict')
        const proceed = window.confirm(
          `Scheduling conflicts detected:\n- ${warningText}\n\nDo you want to override and assign anyway?`
        )
        if (proceed) {
          return handleAssignTeamMember(teamMemberIds, true)
        }
        return
      }
      console.error('Error assigning team member:', error)
      setError(error.response?.data?.error || 'Failed to update team member assignments')
      setTimeout(() => setError(''), 5000)
    }
  }

  // Click outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusDropdown && !event.target.closest('.relative.flex')) {
        setStatusDropdown(false)
      }
      if (moreRef.current && !moreRef.current.contains(event.target)) {
        setMoreDropdown(false)
      }
      if (territoryRef.current && !territoryRef.current.contains(event.target)) {
        if (editingField === 'territory') {
          setEditingField(null)
        }
      }
      if (mobileMoreActionsRef.current && !mobileMoreActionsRef.current.contains(event.target)) {
        setShowMobileMoreActions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingField, statusDropdown])

  // Helper function to map job data from API response
  const mapJobData = (jobData) => {
    // Parse status_history if it's a string
    let parsedStatusHistory = jobData.status_history;
    if (parsedStatusHistory && typeof parsedStatusHistory === 'string') {
      try {
        parsedStatusHistory = JSON.parse(parsedStatusHistory);
      } catch (e) {
        console.error('Error parsing status_history:', e);
        parsedStatusHistory = [];
      }
    }

    // Map assigned team member from various sources
    let assignedTeamMember = null;
    
    // First, try to get from team_assignments array (primary assignment)
    if (jobData.team_assignments && Array.isArray(jobData.team_assignments) && jobData.team_assignments.length > 0) {
      const primaryAssignment = jobData.team_assignments.find(ta => ta.is_primary) || jobData.team_assignments[0];
      if (primaryAssignment && (primaryAssignment.first_name || primaryAssignment.last_name)) {
        assignedTeamMember = {
          id: primaryAssignment.team_member_id,
          first_name: primaryAssignment.first_name,
          last_name: primaryAssignment.last_name,
          email: primaryAssignment.email || null
        };
      }
    }
    
    // Fallback: try to get from team_members join (from Supabase query)
    if (!assignedTeamMember && jobData.team_members) {
      const teamMember = jobData.team_members;
      if (teamMember && (teamMember.first_name || teamMember.last_name)) {
        assignedTeamMember = {
          id: jobData.team_member_id,
          first_name: teamMember.first_name,
          last_name: teamMember.last_name,
          email: teamMember.email || null
        };
      }
    }
    
    // Fallback: try to construct from team_member_id and team_member_first_name/last_name
    if (!assignedTeamMember && jobData.team_member_id && (jobData.team_member_first_name || jobData.team_member_last_name)) {
      assignedTeamMember = {
        id: jobData.team_member_id,
        first_name: jobData.team_member_first_name || '',
        last_name: jobData.team_member_last_name || '',
        email: jobData.team_member_email || null
      };
    }

    return {
      ...jobData,
      customer_first_name: jobData.customers?.first_name || jobData.customer_first_name,
      customer_last_name: jobData.customers?.last_name || jobData.customer_last_name,
      customer_email: jobData.customers?.email || jobData.customer_email,
      customer_phone: jobData.customers?.phone || jobData.customer_phone,
      customer_address: jobData.customers?.address || jobData.customer_address,
      customer_city: jobData.customers?.city || jobData.customer_city,
      customer_state: jobData.customers?.state || jobData.customer_state,
      customer_zip_code: jobData.customers?.zip_code || jobData.customer_zip_code,
      customer_source: jobData.customers?.source || jobData.customer_source,
      service_name: decodeHtmlEntities(jobData.services?.name || jobData.service_name || ''),
      service_price: jobData.service_price || jobData.services?.price,
      service_duration: jobData.services?.duration || jobData.service_duration,
      // Handle multiple services - check if service_name contains multiple services
      service_names: jobData.service_name && jobData.service_name.includes(', ') 
        ? jobData.service_name.split(', ').map(name => decodeHtmlEntities(name)) 
        : null,
      service_ids: jobData.service_ids ? (typeof jobData.service_ids === 'string' ? JSON.parse(jobData.service_ids) : jobData.service_ids) : null,
      // Map additional fields that might be missing
      duration: jobData.duration || jobData.estimated_duration,
      workers_needed: jobData.workers_needed || jobData.workers,
      // Convert ISO date format to expected format for backward compatibility
      scheduled_date: jobData.scheduled_date ? jobData.scheduled_date.replace('T', ' ') : jobData.scheduled_date,
      // Map service modifiers and intake questions
      service_modifiers: jobData.service_modifiers,
      service_intake_questions: jobData.service_intake_questions,
      intake_answers: jobData.intake_answers,
      // Parse status_history
      status_history: parsedStatusHistory,
      // Map recurring job fields
      is_recurring: jobData.is_recurring || jobData.recurring_job || false,
      recurring_frequency: jobData.recurring_frequency || jobData.recurringFrequency || '',
      recurring_end_date: jobData.recurring_end_date || jobData.recurringEndDate || null,
      // Map assigned team member
      assigned_team_member: assignedTeamMember,
      assigned_team_member_id: assignedTeamMember?.id || jobData.assigned_team_member_id || jobData.team_member_id
    }
  }

  // For address modal mapping
  useEffect(() => {
    if (showEditAddressModal && job) {
      setFormData(prev => ({
        ...prev,
        serviceAddress: {
          street: job.service_address_street || "",
          city: job.service_address_city || "",
          state: job.service_address_state || "",
          zipCode: job.service_address_zip || ""
        }
      }))
    }
  }, [showEditAddressModal, job])

  // For reschedule modal mapping
  useEffect(() => {
    if (showRescheduleModal && job) {
      // Extract date and time directly from the string (format: "2024-01-15 10:00:00")
      const datePart = job.scheduled_date ? job.scheduled_date.split(' ')[0] : formatDateLocal(new Date())
      const timePart = job.scheduled_date ? job.scheduled_date.split(' ')[1]?.substring(0, 5) : '09:00'
      
      setFormData(prev => ({
        ...prev,
        scheduledDate: datePart,
        scheduledTime: timePart
      }))
    }
  }, [showRescheduleModal, job])

  // Fetch payment history
  useEffect(() => {
    const fetchPaymentHistory = async () => {
      if (job?.id) {
        try {
          const response = await api.get(`/transactions/job/${job.id}`)
          if (response.data) {
            const transactions = response.data.transactions || []
            const totalPaid = response.data.totalPaid || transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0)
            const totalTips = response.data.totalTips || transactions.reduce((sum, tx) => sum + parseFloat(tx.tip_amount || 0), 0)
            
            setPaymentHistory(transactions)
            
            // Update job state with payment info.
            // Special case: if the job is already marked PAID (e.g. imported as paid) but there are NO
            // completed transactions, treat it as fully paid so Amount due = $0.
            // Otherwise, use the real transaction total.
            setJob(prev => {
              const jobTotal =
                parseFloat(prev?.total) ||
                parseFloat(prev?.total_amount) ||
                parseFloat(prev?.price) ||
                0
              const isPaidWithNoPayments =
                (prev?.invoice_status === 'paid' || prev?.payment_status === 'paid') &&
                jobTotal > 0 &&
                totalPaid <= 0
              const effectivePaid = isPaidWithNoPayments ? jobTotal : totalPaid
              const effectiveTip = Math.max(parseFloat(prev?.tip_amount || 0) || 0, totalTips)
              return {
                ...prev,
                total_paid_amount: effectivePaid,
                invoice_paid_amount: effectivePaid,
                tip_amount: effectiveTip
              }
            })
          }
        } catch (error) {
          console.error('Error fetching payment history:', error)
          setPaymentHistory([])
        }
      }
    }
    fetchPaymentHistory()
  }, [job?.id])

  // Handle record payment
  const handleRecordPayment = async () => {
    if (!job) return
    
    try {
      setLoading(true)
      setError('')
      
      if (!paymentFormData.amount || parseFloat(paymentFormData.amount) <= 0) {
        setError('Please enter a valid payment amount')
        setTimeout(() => setError(''), 3000)
        return
      }
      
      let tipAmount = parseFloat(paymentFormData.tipAmount) || 0
      if (tipSettings.tipCalculationMode === 'automatic') {
        const paidAmount = parseFloat(paymentFormData.amount) || 0
        const totalDue = parseFloat(job?.total ?? job?.total_amount ?? job?.price) || 0
        const alreadyPaid = parseFloat(job?.total_paid_amount || 0)
        const remaining = Math.max(0, totalDue - alreadyPaid)
        const methodKey = paymentFormData.paymentMethod === 'other' && paymentFormData.customPaymentMethod?.trim()
          ? paymentFormData.customPaymentMethod.trim() : paymentFormData.paymentMethod
        const feePercent = tipSettings.paymentTypeFees?.[methodKey] || 0
        const fee = paidAmount * (feePercent / 100)
        tipAmount = Math.max(0, paidAmount - remaining - fee)
      }

      const paymentData = {
        jobId: job.id,
        invoiceId: job.invoice_id || null,
        customerId: job.customer_id || null,
        amount: parseFloat(paymentFormData.amount),
        tipAmount,
        paymentMethod: paymentFormData.paymentMethod === 'other' && paymentFormData.customPaymentMethod?.trim()
          ? paymentFormData.customPaymentMethod.trim()
          : paymentFormData.paymentMethod,
        paymentDate: paymentFormData.paymentDate,
        notes: paymentFormData.notes || null
      }

      console.log('💳 Recording payment:', paymentData)

      const response = await api.post('/transactions/record-payment', paymentData)

      console.log('✅ Payment recorded:', response.data)

      // Auto-save custom payment method for reuse if "Other" was selected
      if (paymentFormData.paymentMethod === 'other' && paymentFormData.customPaymentMethod?.trim()) {
        const customName = paymentFormData.customPaymentMethod.trim()
        const alreadyExists = customPaymentMethods.some(pm => pm.name.toLowerCase() === customName.toLowerCase())
        if (!alreadyExists) {
          try {
            const newMethod = await paymentMethodsAPI.createPaymentMethod({ name: customName })
            setCustomPaymentMethods(prev => [...prev, newMethod])
          } catch (err) {
            console.warn('Could not save custom payment method for reuse:', err)
          }
        }
      }

      // Reset form
      setPaymentFormData({
        amount: '',
        tipAmount: '',
        paymentMethod: 'cash',
        customPaymentMethod: '',
        paymentDate: new Date().toISOString().split('T')[0],
        notes: ''
      })

      // Refresh payment history
      const historyResponse = await api.get(`/transactions/job/${job.id}`)
      if (historyResponse.data) {
        const transactions = historyResponse.data.transactions || []
        const totalPaid = historyResponse.data.totalPaid ?? transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0)

        setPaymentHistory(transactions)

        // Invoice total = job.total (already after discount) + tip. Do NOT subtract discount again.
        setJob(prev => {
          const jobPrice = parseFloat(prev?.total) || 0
          const existingTip = parseFloat(prev?.tip_amount || 0) || 0
          const totalTipsFromPayments = historyResponse.data.totalTips ?? transactions.reduce((s, tx) => s + parseFloat(tx.tip_amount || 0), 0)
          const finalTipAmount = Math.max(existingTip, totalTipsFromPayments)
          const invoiceTotal = jobPrice + finalTipAmount
          const isFullyPaid = totalPaid >= invoiceTotal - 0.01
          return {
            ...prev,
            total_paid_amount: totalPaid,
            invoice_paid_amount: totalPaid,
            tip_amount: finalTipAmount,
            total_invoice_amount: invoiceTotal,
            invoice_status: isFullyPaid ? 'paid' : (invoiceTotal > 0 ? 'invoiced' : prev?.invoice_status || 'draft'),
            payment_status: isFullyPaid ? 'paid' : 'pending'
          }
        })
      }
      
      setSuccessMessage('Payment recorded successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
      setShowAddPaymentModal(false)
    } catch (error) {
      console.error('Error recording payment:', error)
      setError(error.response?.data?.error || 'Failed to record payment')
      setTimeout(() => setError(''), 3000)
    } finally {
      setLoading(false)
    }
  }

  // Delete a recorded payment
  const handleDeletePayment = async (paymentId) => {
    if (!job || !paymentId) return;
    if (!window.confirm('Are you sure you want to delete this payment? This will update the amount paid for this job.')) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      await api.delete(`/transactions/${paymentId}`);

      // Refresh payment history and totals
      const historyResponse = await api.get(`/transactions/job/${job.id}`);
      if (historyResponse.data) {
        const transactions = historyResponse.data.transactions || [];
        const totalPaid = historyResponse.data.totalPaid ?? transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

        setPaymentHistory(transactions);

        setJob(prev => {
          const jobPrice = parseFloat(prev?.total) || 0
          const existingTip = parseFloat(prev?.tip_amount || 0) || 0
          const totalTipsFromPayments = historyResponse.data.totalTips ?? transactions.reduce((s, tx) => s + parseFloat(tx.tip_amount || 0), 0)
          const finalTipAmount = Math.max(existingTip, totalTipsFromPayments)
          const invoiceTotal = jobPrice + finalTipAmount
          const isFullyPaid = totalPaid >= invoiceTotal - 0.01
          return {
            ...prev,
            total_paid_amount: totalPaid,
            invoice_paid_amount: totalPaid,
            tip_amount: finalTipAmount,
            total_invoice_amount: invoiceTotal,
            invoice_status: isFullyPaid ? 'paid' : (invoiceTotal > 0 ? 'invoiced' : prev?.invoice_status || 'draft'),
            payment_status: isFullyPaid ? 'paid' : 'pending'
          };
        });
      }

      setSuccessMessage('Payment deleted successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting payment:', error);
      setError(error.response?.data?.error || 'Failed to delete payment');
      setTimeout(() => setError(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  // Fetch payment status from transactions table
  const fetchInvoiceStatus = async (jobId) => {
    try {
      console.log('💳 Checking payment status for job:', jobId)
      
      // IMPORTANT: Check if job already has paid status from import before overwriting
      setJob(prev => {
        const currentInvoiceStatus = prev?.invoice_status;
        const currentPaymentStatus = prev?.payment_status;
        
        // If job is already marked as paid (from import), preserve it
        if (currentInvoiceStatus === 'paid' || currentPaymentStatus === 'paid') {
          console.log('💳 Job already marked as paid (invoice_status:', currentInvoiceStatus, ', payment_status:', currentPaymentStatus, ') - preserving status');
          return prev; // Don't overwrite paid status
        }
        return prev;
      });
      
      console.log('💳 API URL:', `${process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api'}/transactions/job/${jobId}`)
      
      // Check transactions for this job (use api.get so auth is sent)
      const response = await api.get(`/transactions/job/${jobId}`)
      const data = response.data
      
      if (data) {
        console.log('💳 Transaction API response data:', data)
        
        const { hasPayment, totalPaid, transactionCount, transactions } = data
        
        console.log('💳 Payment status:', { hasPayment, totalPaid, transactionCount })
        
        if (hasPayment && totalPaid > 0) {
          setJob(prev => {
            // job.total already includes tip (from ZB: subtotal + fees + tip = total)
            // Don't add tip_amount again — it's already in total
            const jobTotal = parseFloat(prev?.total) || parseFloat(prev?.total_amount) || 0
            const isFullyPaid = totalPaid >= jobTotal - 0.01
            return {
              ...prev,
              invoice_status: isFullyPaid ? 'paid' : 'invoiced',
              payment_status: isFullyPaid ? 'paid' : 'pending',
              total_paid_amount: totalPaid,
              total_invoice_amount: jobTotal,
              transaction_count: data.transactionCount
            }
          })
        } else {
          // No payment found - check if there are invoices
          console.log('💳 No payment found, checking for invoices...')
          
          setJob(prev => {
            // IMPORTANT: Don't overwrite if already marked as paid from import
            if (prev?.invoice_status === 'paid' || prev?.payment_status === 'paid') {
              console.log('💳 Job already marked as paid - preserving status, not checking invoices');
              return prev;
            }
            return prev;
          });
          
          try {
            const invoiceResponse = await api.get(`/invoices?job_id=${jobId}`)
            console.log('💳 Invoice check result:', invoiceResponse.data)
            
            if (invoiceResponse.data && invoiceResponse.data.length > 0) {
              const invoices = invoiceResponse.data
              let overallStatus = 'none'
              let totalAmount = 0
              let latestInvoice = null
              
              invoices.forEach(invoice => {
                totalAmount += parseFloat(invoice.total_amount || 0)
                
                if (invoice.status === 'sent' || invoice.status === 'invoiced') {
                  if (overallStatus === 'none') {
                    overallStatus = 'invoiced'
                    latestInvoice = invoice
                  }
                } else if (invoice.status === 'draft') {
                  if (overallStatus === 'none') {
                    overallStatus = 'draft'
                    latestInvoice = invoice
                  }
                }
              })
              
              setJob(prev => {
                // Don't overwrite if already paid
                if (prev?.invoice_status === 'paid' || prev?.payment_status === 'paid') {
                  return prev;
                }
                return {
                ...prev,
                invoice_status: overallStatus,
                invoice_id: latestInvoice?.id,
                total_invoice_amount: totalAmount,
                total_paid_amount: 0
                }
              })
            } else {
              // No invoices or payments - but don't overwrite if already paid
              setJob(prev => {
                if (prev?.invoice_status === 'paid' || prev?.payment_status === 'paid') {
                  console.log('💳 Job already marked as paid - preserving status');
                  return prev;
                }
                return {
                ...prev,
                invoice_status: 'none',
                invoice_id: null,
                total_invoice_amount: 0,
                total_paid_amount: 0
                }
              })
            }
          } catch (invoiceError) {
            console.error('💳 Error checking invoices:', invoiceError)
            // Don't overwrite if already paid
            setJob(prev => {
              if (prev?.invoice_status === 'paid' || prev?.payment_status === 'paid') {
                return prev;
              }
              return {
              ...prev,
              invoice_status: 'none',
              invoice_id: null,
              total_invoice_amount: 0,
              total_paid_amount: 0
              }
            })
          }
        }
      } else {
        console.error('💳 Transaction API returned no data')
      }
    } catch (error) {
      console.error('💳 Error checking payment status:', error)
      // Don't show error to user, just log it
    }
  }

  // Auto-refresh invoice status every 30 seconds if there's an invoice
  useEffect(() => {
    if (job?.id && job?.invoice_status && job.invoice_status !== 'paid') {
      console.log('💳 Setting up auto-refresh for invoice status')
      const interval = setInterval(() => {
        console.log('💳 Auto-refreshing invoice status...')
        fetchInvoiceStatus(job.id)
      }, 30000) // 30 seconds

      return () => clearInterval(interval)
    }
  }, [job?.id, job?.invoice_status])

  // Fetch job data with Windows Defender/Firewall retry logic
  useEffect(() => {
    const fetchJob = async (retryCount = 0) => {
      // Wait a bit to ensure authentication state is ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setLoading(true)
      setError("") // Clear any previous errors
      try {
        console.log('🔧 Job Details: Fetching job data for ID:', jobId, retryCount > 0 ? `(retry ${retryCount})` : '')
        const jobData = await jobsAPI.getById(jobId)
        
        
        // Map customer and service data from nested structure
        const mappedJobData = mapJobData(jobData)
        
        console.log('🔧 Job Details: Raw job data from API:', jobData);
        console.log('🔧 Job Details: Mapped job data:', mappedJobData);
        console.log('🔧 Job Details: service_modifiers in mapped data:', mappedJobData.service_modifiers);
        console.log('🔧 Job Details: service_modifiers type:', typeof mappedJobData.service_modifiers);
        console.log('🔧 Job Details: service_modifiers value:', JSON.stringify(mappedJobData.service_modifiers, null, 2));
        console.log('🔧 Job Details: Pricing breakdown:', {
          service_price: mappedJobData.service_price,
          additional_fees: mappedJobData.additional_fees,
          taxes: mappedJobData.taxes,
          discount: mappedJobData.discount,
          total: mappedJobData.total
        });
        
        setJob(mappedJobData)
        
        // Fetch invoice status to show payment information
        console.log('💳 About to fetch invoice status for job ID:', mappedJobData.id)
        await fetchInvoiceStatus(mappedJobData.id)
        
        // Initialize form data
        setFormData({
          service_name: mappedJobData.service_name || "",
          bathroom_count: mappedJobData.bathroom_count || "",
          duration: mappedJobData.duration || mappedJobData.estimated_duration || 0,
          workers_needed: mappedJobData.workers_needed || mappedJobData.workers || 1,
          skills: mappedJobData.skills || [],
          notes: mappedJobData.notes || "",
          internal_notes: mappedJobData.internal_notes || "",
          serviceAddress: {
            street: mappedJobData.customer_address || mappedJobData.service_address_street || "",
            city: mappedJobData.customer_city || mappedJobData.service_address_city || "",
            state: mappedJobData.customer_state || mappedJobData.service_address_state || "",
            zipCode: mappedJobData.customer_zip_code || mappedJobData.service_address_zip || ""
          },
          scheduledDate: mappedJobData.scheduled_date ? (mappedJobData.scheduled_date.includes('T') ? mappedJobData.scheduled_date.split('T')[0] : mappedJobData.scheduled_date.split(' ')[0]) : "",
          scheduledTime: mappedJobData.scheduled_date ? (mappedJobData.scheduled_date.includes('T') ? mappedJobData.scheduled_date.split('T')[1]?.substring(0, 5) : mappedJobData.scheduled_date.split(' ')[1]?.substring(0, 5)) : "",
          offer_to_providers: mappedJobData.offer_to_providers || false,
          // Pricing fields
          service_price: mappedJobData.service_price || 0,
          discount: mappedJobData.discount || 0,
          additional_fees: mappedJobData.additional_fees || 0,
          taxes: mappedJobData.taxes || 0,
          tip: 0
        })

        // Initialize intake question answers
        if (mappedJobData.service_intake_questions) {
          const initialAnswers = {}
          mappedJobData.service_intake_questions.forEach(question => {
            if (question.answer) {
              initialAnswers[question.id] = question.answer
            }
          })
          setIntakeQuestionAnswers(initialAnswers)
        }

        // Check if user has Twilio configured first
        try {
          const twilioResponse = await twilioAPI.getPhoneNumbers()
          console.log('📱 User Twilio status:', twilioResponse)
          setUserTwilioConnected(twilioResponse.phoneNumbers && twilioResponse.phoneNumbers.length > 0)
        } catch (error) {
          console.error('❌ Error checking Twilio status:', error)
          setUserTwilioConnected(false)
        }

        // Fetch customer notification preferences and global settings
        if (jobData.customer_id) {
          try {
            // Load both customer preferences and global notification settings
            const [prefs, globalSettings] = await Promise.all([
              notificationAPI.getPreferences(jobData.customer_id),
              notificationSettingsAPI.getSettings(user.id).catch(() => []) // Don't fail if global settings can't be loaded
            ])
            
            console.log('📧 Loaded customer notification preferences:', prefs)
            console.log('🌐 Loaded global notification settings:', globalSettings)
    
            // Check global appointment confirmation SMS setting
            const appointmentSetting = globalSettings.find(s => s.notification_type === 'appointment_confirmation')
            const globalSmsEnabled = appointmentSetting && appointmentSetting.sms_enabled === 1
            
            // If global SMS is enabled, ensure SMS notifications are enabled for this customer
            let smsShouldBeEnabled = !!prefs.sms_notifications
            if (globalSmsEnabled && !prefs.sms_notifications) {
              // Global setting overrides - enable SMS for this customer
              smsShouldBeEnabled = true
              console.log('🌐 Global appointment confirmation SMS is enabled - enabling SMS for this customer')
              
              // Update customer preferences to match global setting
              try {
                await notificationAPI.updatePreferences(jobData.customer_id, {
                  email_notifications: prefs.email_notifications !== undefined ? !!prefs.email_notifications : true,
                  sms_notifications: true
                })
                console.log('📱 Updated customer preferences to match global SMS setting')
              } catch (updateError) {
                console.error('Failed to update customer preferences:', updateError)
                // Continue anyway - we'll still enable it in the UI
              }
            }
            
            // Set notification states
            setEmailNotifications(!!prefs.email_notifications)
            setSmsNotifications(smsShouldBeEnabled)
            
            console.log('📧 Setting notification states:', {
              email: !!prefs.email_notifications,
              sms: smsShouldBeEnabled,
              globalSmsEnabled,
              userTwilioConnected,
              rawEmail: prefs.email_notifications,
              rawSms: prefs.sms_notifications
            })
            
            // Only auto-enable SMS for customers without email if they don't have preferences yet
            const hasEmail = jobData.customer_email && jobData.customer_email.trim() !== ''
            if (!hasEmail && userTwilioConnected && !smsShouldBeEnabled && !globalSmsEnabled) {
              // Customer has no email and no SMS preference set - auto-enable SMS
              setSmsNotifications(true)
              
              try {
                await notificationAPI.updatePreferences(jobData.customer_id, {
                  email_notifications: false,
                  sms_notifications: true
                })
                console.log('📱 Auto-enabled SMS for customer without email')
              } catch (updateError) {
                console.error('Failed to auto-update notification preferences:', updateError)
              }
            }
          } catch (e) {
            console.error('Failed to load notification preferences:', e)
            // Use defaults - don't show error to user for notification preferences
            setEmailNotifications(true)
            setSmsNotifications(false)
          }
        }
      } catch (err) {
        console.error('Error fetching job:', err)
        
        // Handle Windows Defender/Firewall CORS preflight issues with retry
        if ((err.code === 'ERR_NETWORK' || err.message?.includes('CORS') || err.message?.includes('preflight') || err.message?.includes('Failed to fetch')) && retryCount < 3) {
          console.log(`🔄 Windows Defender/Firewall CORS issue detected, retrying in ${(retryCount + 1) * 2} seconds... (attempt ${retryCount + 1}/3)`)
          
          setIsRetrying(true)
          
          // Wait longer between retries for Windows Defender/firewall issues
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000))
          
          // Retry the request
          return fetchJob(retryCount + 1)
        }
        
        // Handle specific error types
        if (err.code === 'ERR_NETWORK' || err.message?.includes('CORS') || err.message?.includes('preflight')) {
          setError("Network error: Unable to load job details. This may be due to Windows Defender/firewall blocking the request. Please check your connection and try again.")
        } else if (err.response?.status === 404) {
          setError("Job not found. It may have been deleted.")
        } else if (err.response?.status === 401) {
          setError("Authentication required. Please log in again.")
          navigate('/signin')
        } else {
          setError(`Failed to load job details: ${err.message || 'Unknown error'}`)
        }
      } finally {
        setLoading(false)
        setIsRetrying(false)
      }
    }
    if (jobId) fetchJob()
  }, [jobId, navigate])

  // Fetch supporting data
  useEffect(() => {
    const fetchData = async () => {
      // Wait a bit to ensure authentication state is ready
      await new Promise(resolve => setTimeout(resolve, 200))
      
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}')
        if (user.id) {
          const [territoriesData, teamData, paymentMethods, paymentSettingsData] = await Promise.all([
            territoriesAPI.getAll(user.id),
            teamAPI.getAll(user.id),
            paymentMethodsAPI.getPaymentMethods().catch(() => []),
            paymentSettingsAPI.getPaymentSettings().catch(() => ({}))
          ])
          setTerritories(territoriesData.territories || territoriesData)
          console.log('Team data received:', teamData)
          setTeamMembers(teamData.teamMembers || teamData)
          if (paymentSettingsData) {
            setTipSettings({ tipCalculationMode: paymentSettingsData.tipCalculationMode || 'automatic', paymentTypeFees: paymentSettingsData.paymentTypeFees || {} })
          }
          console.log('Team members set:', teamData.teamMembers || teamData)
          setCustomPaymentMethods(paymentMethods || [])
          // Company driving time (for showing travel buffer on job details)
          try {
            const avail = await availabilityAPI.getAvailability(user.id)
            const bh = avail?.businessHours || avail?.business_hours
            const parsed = typeof bh === 'string' ? (() => { try { return JSON.parse(bh) } catch (e) { return null } })() : bh
            if (parsed && (parsed.drivingTime !== undefined && parsed.drivingTime !== null)) {
              setCompanyDrivingTimeMinutes(parseInt(parsed.drivingTime, 10) || 0)
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Failed to fetch supporting data:', e)
      }
    }
    fetchData()
  }, [])

  // Fetch invoice data
  useEffect(() => {
    const fetchInvoice = async () => {
      if (!job || !job.invoice_id) return
      try {
        const data = await invoicesAPI.getById(job.invoice_id, job.user_id)
        setInvoice(data)
      } catch (e) {
        setInvoice(null)
      }
    }
    fetchInvoice()
  }, [job])

  // Check Stripe connection status
  useEffect(() => {
    const checkStripeStatus = async () => {
      try {
        console.log('🔍 Checking Stripe status...')
        const response = await stripeAPI.testConnection()
        console.log('🔍 Stripe status response:', response)
        setStripeConnected(response.connected)
        // If Stripe is not connected, disable payment link
        if (!response.connected) {
          setIncludePaymentLink(false)
        } else {
          // If Stripe is connected, enable payment link by default
          setIncludePaymentLink(true)
        }
      } catch (error) {
        console.error('Error checking Stripe status:', error)
        setStripeConnected(false)
        setIncludePaymentLink(false)
      }
    }
    
    checkStripeStatus()
  }, [])

  const statusOptions = [
    { key: 'pending', label: 'Pending', color: 'bg-gray-400' },
    { key: 'confirmed', label: 'Confirmed', color: 'bg-[var(--sf-blue-500)]' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-orange-500' },
    { key: 'completed', label: 'Completed', color: 'bg-purple-500' },
    { key: 'cancelled', label: 'Cancelled', color: 'bg-red-500' }
  ]

  const handleStatusChange = async (newStatus) => {
    if (!job) return
    try {
      setLoading(true)
      await jobsAPI.updateStatus(job.id, newStatus)
      setJob(prev => ({ ...prev, status: newStatus }))
      setSuccessMessage(`Job marked as ${newStatus}`)
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      setError('Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  const copyCustomerAddressToService = () => {
    if (!job) return;
    
    let parsedAddress = {
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "USA"
    };
    
    // Check if customer has address information
    const hasCustomerAddress = job.customer_address || job.customer_city || job.customer_state || job.customer_zip_code;
    
    if (hasCustomerAddress) {
      // Use separate fields if available
      if (job.customer_city && job.customer_state && job.customer_zip_code) {
        parsedAddress.street = job.customer_address || "";
        parsedAddress.city = job.customer_city;
        parsedAddress.state = job.customer_state;
        parsedAddress.zipCode = job.customer_zip_code;
      } else if (job.customer_address) {
        // Fallback to parsing address string if separate fields aren't available
        const addressParts = job.customer_address.split(',').map(part => part.trim());
        
        if (addressParts.length >= 1) {
          parsedAddress.street = addressParts[0];
        }
        
        if (addressParts.length >= 2) {
          parsedAddress.city = addressParts[1];
        }
        
        if (addressParts.length >= 3) {
          // Handle state and zip code which might be together like "State 12345"
          const stateZipPart = addressParts[2];
          const stateZipMatch = stateZipPart.match(/^([A-Za-z\s]+)\s+(\d{5}(?:-\d{4})?)$/);
          
          if (stateZipMatch) {
            parsedAddress.state = stateZipMatch[1].trim();
            parsedAddress.zipCode = stateZipMatch[2];
          } else {
            // If no zip code pattern, assume it's just state
            parsedAddress.state = stateZipPart;
          }
        }
      }
      
      setFormData(prev => ({
        ...prev,
        serviceAddress: parsedAddress
      }));
      
      // Show feedback
      setAddressAutoPopulated(true);
      setTimeout(() => setAddressAutoPopulated(false), 3000);
    }
  };

  const handleSave = async () => {
    if (!job) return
    try {
      setLoading(true)
      setError("")
      
      const updatedJob = {
        serviceName: formData.service_name,
        bathroomCount: formData.bathroom_count,
        duration: formData.duration,
        workers: formData.workers_needed,
        skills: formData.skills,
        notes: formData.notes,
        internalNotes: formData.internal_notes,
        serviceAddress: {
          street: formData.serviceAddress.street,
          city: formData.serviceAddress.city,
          state: formData.serviceAddress.state,
          zipCode: formData.serviceAddress.zipCode
        },
        offerToProviders: formData.offerToProviders,
        // Pricing fields - use formData if available, otherwise use current job values
        price: formData.service_price !== undefined ? formData.service_price : (job.service_price || 0),
        discount: formData.discount !== undefined ? formData.discount : (job.discount || 0),
        additionalFees: formData.additional_fees !== undefined ? formData.additional_fees : (job.additional_fees || 0),
        taxes: formData.taxes !== undefined ? formData.taxes : (job.taxes || 0),
        // Use consistent calculation for both total and total_amount
        total: calculateTotalPriceHelper(
          formData.service_price !== undefined ? formData.service_price : (job.service_price || 0),
          formData.modifier_price !== undefined ? formData.modifier_price : calculateModifierPrice(),
          formData.additional_fees !== undefined ? formData.additional_fees : (job.additional_fees || 0),
          formData.taxes !== undefined ? formData.taxes : (job.taxes || 0),
          formData.discount !== undefined ? formData.discount : (job.discount || 0)
        ),
        total_amount: calculateTotalPriceHelper(
          formData.service_price !== undefined ? formData.service_price : (job.service_price || 0),
          formData.modifier_price !== undefined ? formData.modifier_price : calculateModifierPrice(),
          formData.additional_fees !== undefined ? formData.additional_fees : (job.additional_fees || 0),
          formData.taxes !== undefined ? formData.taxes : (job.taxes || 0),
          formData.discount !== undefined ? formData.discount : (job.discount || 0)
        ),
        // Use the current service modifiers from job state (which includes any edits)
        serviceModifiers: job.service_modifiers
      }
      
      console.log('🔄 Job Details: Sending update data:', updatedJob);
      console.log('🔄 Job Details: Service address data:', updatedJob.serviceAddress);
      console.log('🔄 Job Details: Pricing data:', {
        price: updatedJob.price,
        discount: updatedJob.discount,
        additionalFees: updatedJob.additionalFees,
        taxes: updatedJob.taxes,
        total: updatedJob.total,
        total_amount: updatedJob.total_amount
      });

      const result = await jobsAPI.update(job.id, updatedJob)
      console.log('🔄 Job Details: API update result:', result);
      
      setSuccessMessage('Job updated successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
      setEditing(false)
      setEditingField(null)
      
      // Update the job state with new data immediately
      setJob(prev => {
        const updatedJobState = {
          ...prev,
          service_address_street: formData.serviceAddress.street,
          service_address_city: formData.serviceAddress.city,
          service_address_state: formData.serviceAddress.state,
          service_address_zip: formData.serviceAddress.zipCode,
          ...updatedJob
        };
        console.log('🔄 Job Details: Updated job state:', updatedJobState);
        return updatedJobState;
      })
      
      // Reload job data to get updated values
      const jobData = await jobsAPI.getById(jobId)
      const mappedJobData = mapJobData(jobData)
      setJob(mappedJobData)
    } catch (error) {
      console.error('Error updating job:', error)
      setError(error.response?.data?.error || 'Failed to update job')
    } finally {
      setLoading(false)
    }
  }

  const handleReschedule = async () => {
    if (!job) return
    try {
      setLoading(true)
      const scheduledDate = formData.scheduledDate && formData.scheduledTime 
        ? `${formData.scheduledDate}T${formData.scheduledTime}:00.000Z`
        : job.scheduled_date
      
      await jobsAPI.update(job.id, {
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime
      })
      setSuccessMessage('Job rescheduled successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
      setShowRescheduleModal(false)
      // Reload job data
      const jobData = await jobsAPI.getById(jobId)
      const mappedJobData = mapJobData(jobData)
      setJob(mappedJobData)
    } catch (error) {
      setError('Failed to reschedule job')
    } finally {
      setLoading(false)
    }
  }

  const handleTerritoryChange = async (territoryId) => {
    if (!job) return
    
    try {
      setLoading(true)
      const updateData = {
        territoryId: territoryId
      }
      
      await jobsAPI.update(job.id, updateData)
      
      setJob(prev => ({ ...prev, territory_id: territoryId }))
      setSuccessMessage('Territory updated successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error('Territory update failed:', error)
      setError('Failed to update territory')
    } finally {
      setLoading(false)
    }
  }

  const handleTestEmail = async () => {
    try {
      setLoading(true)
      
      // Use manual email if provided, otherwise fall back to customer email
      const emailToUse = manualEmail || job.customer_email;
      
      if (!emailToUse) {
        setError('Please enter a customer email address');
        return;
      }
      
      const response = await api.post('/test-sendgrid', {
        testEmail: emailToUse
      })
      
      console.log('Test email result:', response.data)
      setSuccessMessage('Test email sent successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error('Error sending test email:', error)
      setError('Failed to send test email: ' + (error.response?.data?.error || error.message))
    } finally {
      setLoading(false)
    }
  }

  const handleSendInvoice = async () => {
    if (!job) return
    try {
      setLoading(true)
      
      // First, create an invoice record
      const calculatedAmount = calculateTotalPrice();
      console.log('💰 Creating invoice with amount:', calculatedAmount);
      console.log('💰 Job data for calculation:', {
        jobTotal: job.total,
        servicePrice: job.service_price,
        additionalFees: job.additional_fees,
        taxes: job.taxes,
        discount: job.discount,
        tip: formData.tip
      });
      
      // Validate amount before sending
      if (calculatedAmount <= 0) {
        setError('Invoice amount must be greater than $0. Please check the job pricing.');
        return;
      }
      
      const createInvoiceData = {
        jobId: job.id,
        customerId: job.customer_id,
        amount: calculatedAmount,
        taxAmount: 0, // You can calculate tax if needed
        totalAmount: calculatedAmount,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days from now
      };
      
      console.log('💰 Sending invoice data to server:', createInvoiceData);
      
      const invoiceResponse = await api.post('/create-invoice', createInvoiceData)
      
      const invoice = invoiceResponse.data
      console.log('📄 Invoice created:', invoice)
      
      // Send invoice email with the created invoice ID
      // Use manual email if provided, otherwise fall back to customer email
      const emailToUse = manualEmail || job.customer_email;
      
      if (!emailToUse) {
        setError('Please enter a customer email address');
        return;
      }
      
      const invoiceData = {
        invoiceId: invoice.id,
        jobId: job.id,
        customerEmail: emailToUse,
        customerName: `${job.customer_first_name} ${job.customer_last_name}`,
        amount: calculateTotalPrice(),
        serviceName: job.service_name,
        serviceDate: job.scheduled_date,
        address: job.customer_address,
        includePaymentLink: includePaymentLink
      }
      
      console.log('📧 Sending invoice email with data:', invoiceData)
      console.log('📧 Include payment link state:', includePaymentLink)
      
      const emailResponse = await api.post('/send-invoice-email', invoiceData)
      console.log('Invoice email sent:', emailResponse.data)
      
      // Update invoice status to 'sent'
      await api.put(`/invoices/${invoice.id}`, {
        status: 'sent'
      })
      
      // Update job invoice status to 'invoiced'
      await jobsAPI.update(job.id, {
        invoiceStatus: 'invoiced'
      })
      setJob(prev => ({ ...prev, invoice_status: 'invoiced' }))
      setSuccessMessage('Invoice sent successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
      setShowSendInvoiceModal(false)
      setManualEmail('') // Clear manual email after successful send
    } catch (error) {
      console.error('Error sending invoice:', error)
      setError('Failed to send invoice')
    } finally {
      setLoading(false)
    }
  }


  const handleNotificationToggle = async (type, value) => {
    if (!job || !job.customer_id) return
    try {
      setLoading(true)
      setError("") // Clear any previous errors

      console.log('🔄 Toggling notification:', { type, value, customerId: job.customer_id })
      
      // Update local state first
      if (type === 'email') {
        setEmailNotifications(value)
        console.log('📧 Email notification set to:', value)
      } else if (type === 'sms') {
        setSmsNotifications(value)
        console.log('📱 SMS notification set to:', value)
      }
      
      // Update notification preferences in backend
      const preferences = {
        email_notifications: type === 'email' ? value : emailNotifications,
        sms_notifications: type === 'sms' ? value : smsNotifications
      }
      
      console.log('📧 Sending preferences to server:', preferences)
      const result = await notificationAPI.updatePreferences(job.customer_id, preferences)
      console.log('✅ Server response:', result)
      
      // Verify the save was successful by re-fetching preferences
      try {
        const verifyPrefs = await notificationAPI.getPreferences(job.customer_id)
        console.log('✅ Verified saved preferences:', verifyPrefs)
      } catch (verifyError) {
        console.error('❌ Failed to verify saved preferences:', verifyError)
      }
      
      setSuccessMessage(`${type === 'email' ? 'Email' : 'SMS'} notifications ${value ? 'enabled' : 'disabled'}`)
      setTimeout(() => setSuccessMessage(""), 3000)
    } catch (error) {
      console.error('Failed to update notification preferences:', error)
      
      // Show more specific error message
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update notification preferences'
      setError(errorMessage)
      
      // Revert the toggle if update failed
      if (type === 'email') {
        setEmailNotifications(!value)
      } else if (type === 'sms') {
        setSmsNotifications(!value)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleIntakeQuestionsChange = (answers) => {
    console.log('🔄 Job Details: Intake questions changed', answers);
    setIntakeQuestionAnswers(answers)
  }

  const handleSaveIntakeQuestions = async () => {
    if (!job) return
    try {
      setLoading(true)
      setError("")
      
      // Update the job with new intake question answers
      const updatedJob = {
        service_intake_questions: job.service_intake_questions.map(question => ({
          ...question,
          answer: intakeQuestionAnswers[question.id] || null
        }))
      }
      
      await jobsAPI.update(job.id, updatedJob)
      
      setSuccessMessage('Intake question answers updated successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)
      setEditingField(null)
      
      // Update the job state with new data immediately
      setJob(prev => ({
        ...prev,
        service_intake_questions: updatedJob.service_intake_questions
      }))
      
      // Reload job data to get updated values
      const jobData = await jobsAPI.getById(jobId)
      const mappedJobData = mapJobData(jobData)
      setJob(mappedJobData)
    } catch (error) {
      console.error('Error updating intake questions:', error)
      setError(error.response?.data?.error || 'Failed to update intake questions')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveService = async () => {
    if (!job) return
    try {
      setLoading(true)
      setError("")
      
      // Send only the changed values to backend, let backend calculate total
      const updatedJob = {
        service_price: formData.service_price,
        additional_fees: formData.additional_fees,
        taxes: formData.taxes,
        discount: formData.discount,
        duration: formData.duration
      }

      await jobsAPI.update(job.id, updatedJob)
      
      setSuccessMessage('Service details updated successfully!')
      setTimeout(() => setSuccessMessage(""), 3000)

      // Close the modal
      setShowEditServiceModal(false)
      setShowDurationEditor(false)
      
      // Update the job state with new data immediately
      setJob(prev => ({
        ...prev,
        ...updatedJob
      }))
      
      // Reload job data to get updated values
      const jobData = await jobsAPI.getById(jobId)
      const mappedJobData = mapJobData(jobData)
      setJob(mappedJobData)
    } catch (error) {
      console.error('Error updating service details:', error)
      setError(error.response?.data?.error || 'Failed to update service details')
    } finally {
      setLoading(false)
    }
  }

  // Format date for assign modal (Monday, Dec 8)
  const formatDateForAssign = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric'
    })
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Date placeholder'
    
    // Handle both ISO format (2025-08-29T09:00:00) and space format (2025-08-29 09:00:00)
    let datePart
    if (dateString.includes('T')) {
      datePart = dateString.split('T')[0]
    } else {
      datePart = dateString.split(' ')[0]
    }
    
    if (!datePart) return 'Date placeholder'
    
    const [year, month, day] = datePart.split('-')
    if (!year || !month || !day) return 'Date placeholder'
    
    // Use the stored date directly without creating Date objects to avoid timezone conversion
    const y = parseInt(year)
    const m = parseInt(month)
    const d = parseInt(day)
    
    // Create weekday and month names arrays
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    // Calculate weekday using Zeller's congruence to avoid Date object
    let adjustedMonth = m
    let adjustedYear = y
    if (m < 3) {
      adjustedMonth = m + 12
      adjustedYear = y - 1
    }
    
    const k = adjustedYear % 100
    const j = Math.floor(adjustedYear / 100)
    const h = (d + Math.floor((13 * (adjustedMonth + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j) % 7
    
    const weekdayIndex = ((h + 5) % 7) // Adjust for Sunday = 0
    const weekday = weekdays[weekdayIndex]
    const monthName = months[m - 1]
    
    return `${weekday}, ${monthName} ${d}, ${y}`
  }

  const formatTime = (dateString) => formatTimeShared(dateString) || 'Time placeholder'

  // Helper function to calculate total price consistently
  const calculateTotalPriceHelper = (servicePrice, modifierPrice, additionalFees, taxes, discount) => {
    return calculateJobTotal({
      servicePrice: (parseFloat(servicePrice) || 0) + (parseFloat(modifierPrice) || 0),
      discount,
      additionalFees,
      taxes
    });
  };

  // Calculate total modifier price
  const calculateModifierPrice = () => {
    try {
      const serviceModifiers = getServiceModifiers();
      let totalModifierPrice = 0;
      
      serviceModifiers.forEach(modifier => {
        if (modifier.selectedOptions && modifier.selectedOptions.length > 0) {
          modifier.selectedOptions.forEach(option => {
            console.log('🔧 Modifier option details:', {
              id: option.id,
              label: option.label,
              price: option.price,
              totalPrice: option.totalPrice,
              selectedQuantity: option.selectedQuantity
            });
            
            // Use the current price from the job state (which includes any edits)
            const basePrice = parseFloat(option.price || 0);
            
            // If totalPrice exists, use it (it's already calculated with quantity)
            // Otherwise, calculate price * quantity
            if (option.totalPrice !== undefined && option.totalPrice !== null) {
              console.log('🔧 Using totalPrice:', option.totalPrice);
              totalModifierPrice += parseFloat(option.totalPrice);
            } else if (option.selectedQuantity && option.selectedQuantity > 0) {
              // Calculate price * quantity if totalPrice is not available
              const calculatedTotal = basePrice * option.selectedQuantity;
              console.log('🔧 Calculating price * quantity:', basePrice, '*', option.selectedQuantity, '=', calculatedTotal);
              totalModifierPrice += calculatedTotal;
            } else {
              // Fallback to base price if no quantity
              console.log('🔧 Using base price:', basePrice);
              totalModifierPrice += basePrice;
            }
          });
        }
      });
      
      console.log('🔧 calculateModifierPrice: total modifier price:', totalModifierPrice);
      return totalModifierPrice;
    } catch (error) {
      console.error('Error calculating modifier price:', error);
      return 0;
    }
  }

  // Backend stores job.total as (subtotal - discount), so discount is already applied. Tip is separate.
  const calculateTotalPrice = () => {
    try {
      const jobPrice = parseFloat(job?.total) || 0; // already includes - discount
      const tip = parseFloat(job?.tip_amount) || 0;
      return jobPrice + tip;
    } catch (error) {
      console.error('Error getting total price:', error);
      return 0;
    }
  }

  // Edit Service modal: total from visible breakdown (Subtotal - Discount + Fee + Taxes, no tip)
  const getEditServiceModalTotal = () => {
    return Math.max(0, calculateJobTotal({
      servicePrice: parseFloat(formData.service_price) || parseFloat(job?.service_price) || 0,
      discount: job?.discount,
      additionalFees: job?.additional_fees,
      taxes: job?.taxes
    }));
  }

  // $0 jobs are considered free -- show as paid (no amount due)
  const totalPrice = calculateTotalPrice();
  const jobTotal = parseFloat(job?.total) || 0;          // job.total = subtotal - discount + fees + taxes (no tip)
  const jobDiscount = parseFloat(job?.discount) || 0;
  const jobFees = parseFloat(job?.additional_fees) || 0;
  const jobTaxes = parseFloat(job?.taxes) || 0;
  const tipAmountStored = parseFloat(job?.tip_amount) || 0;

  // Breakdown: Subtotal (service_price) → Discount → Total → Fee → Taxes → Total due
  const subtotalDisplay = parseFloat(job?.service_price) || (jobTotal + jobDiscount - jobFees - jobTaxes);
  const totalAfterDiscount = subtotalDisplay - jobDiscount;
  const totalDueAmount = calculateJobTotal({ servicePrice: subtotalDisplay, discount: jobDiscount, additionalFees: jobFees, taxes: jobTaxes });
  const displayServiceTotal = totalDueAmount;                           // alias for backward compat

  const effectiveAmountPaid = parseFloat(job?.total_paid_amount) || 0;

  // Tips = overpayment (amount paid beyond total due). Fallback to stored tip if no overpayment.
  const derivedTip = Math.max(0, effectiveAmountPaid - totalDueAmount);
  const displayTip = derivedTip > 0 ? derivedTip : tipAmountStored;

  // Incentives = sum of per-member incentive_amount from team assignments
  const displayIncentive = parseFloat(job?.incentive_amount) || 0;

  // Balance
  const rawBalance = totalDueAmount - effectiveAmountPaid;
  const isFullyPaidByAmount = rawBalance <= 0.01;
  const isPaidOrFree = totalDueAmount === 0 || isFullyPaidByAmount;
  const displayTotalDue = Math.max(0, rawBalance);
  // Overpayment beyond tip is credit (rare edge case)
  const showCreditLine = false;
  const displayCreditAmount = 0;

  // Parse service modifiers from JSON
  const getServiceModifiers = () => {
    try {
      console.log('🔧 getServiceModifiers: job.service_modifiers:', job.service_modifiers);
      console.log('🔧 getServiceModifiers: job.service_modifiers type:', typeof job.service_modifiers);
      console.log('🔧 getServiceModifiers: job.service_modifiers stringified:', JSON.stringify(job.service_modifiers, null, 2));
      
      // Handle null, undefined, or empty values
      if (!job.service_modifiers || job.service_modifiers === null) {
        console.log('🔧 getServiceModifiers: No modifiers found, returning empty array');
        return [];
      }
      
      if (typeof job.service_modifiers === 'string') {
        const parsed = JSON.parse(job.service_modifiers);
        console.log('🔧 getServiceModifiers: parsed from string:', parsed);
        return Array.isArray(parsed) ? parsed : [];
      }
      
      const result = Array.isArray(job.service_modifiers) ? job.service_modifiers : [];
      console.log('🔧 getServiceModifiers: final result:', result);
      console.log('🔧 getServiceModifiers: result length:', result.length);
      console.log('🔧 getServiceModifiers: result items:', result.map(item => ({ id: item.id, title: item.title, selectedOptions: item.selectedOptions })));
      return result;
    } catch (error) {
      console.error('Error parsing service modifiers:', error);
      return [];
    }
  }

  // Parse service intake questions from JSON
  const getServiceIntakeQuestions = () => {
    try {
      if (!job.service_intake_questions) return [];
      if (typeof job.service_intake_questions === 'string') {
        try {
          const firstParse = JSON.parse(job.service_intake_questions);
          
          // Check if it's double-encoded
          if (typeof firstParse === 'string') {
            const secondParse = JSON.parse(firstParse);
            return Array.isArray(secondParse) ? secondParse : [];
          }
          
          return Array.isArray(firstParse) ? firstParse : [];
        } catch (firstError) {
          return [];
        }
      }
      return Array.isArray(job.service_intake_questions) ? job.service_intake_questions : [];
    } catch (error) {
      console.error('Error parsing service intake questions:', error);
      return [];
    }
  }

  // Format duration for display
  const formatDuration = (minutes) => {
    if (!minutes) return '0h';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const getCustomerInitials = () => {
    const firstName = (job?.customer_first_name || job?.customer?.first_name || job?.customers?.first_name || '').trim()
    const lastName = (job?.customer_last_name || job?.customer?.last_name || job?.customers?.last_name || '').trim()
    
    // If we have names, return initials
    if (firstName || lastName) {
      const firstInitial = firstName ? firstName.charAt(0) : ''
      const lastInitial = lastName ? lastName.charAt(0) : ''
      return `${firstInitial}${lastInitial}`.toUpperCase() || '?'
    }
    
    // Fallback: try to get initial from email
    const email = job?.customer_email || job?.customer?.email || job?.customers?.email || ''
    if (email) {
      return email.charAt(0).toUpperCase()
    }
    
    // Last resort: return '?'
    return '?'
  }

  if (loading || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--sf-bg-page)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <span className="text-[var(--sf-text-muted)] text-lg">
            {isRetrying ? 'Retrying connection...' : 'Loading job details...'}
          </span>
          {isRetrying && (
            <p className="text-sm text-[var(--sf-text-muted)] mt-2">
              Windows Defender/firewall may be blocking the request. Retrying...
            </p>
          )}
        </div>
      </div>
    )
  }

  // Helper function to get customer name
  const getCustomerName = () => {
    if (job?.customer_first_name || job?.customer_last_name) {
      return `${job.customer_first_name || ''} ${job.customer_last_name || ''}`.trim()
    }
    if (job?.customer?.first_name || job?.customer?.last_name) {
      return `${job.customer.first_name || ''} ${job.customer.last_name || ''}`.trim()
    }
    if (job?.customers?.first_name || job?.customers?.last_name) {
      return `${job.customers.first_name || ''} ${job.customers.last_name || ''}`.trim()
    }
    return 'Customer'
  }

  // Job is late only when the scheduled END time (start + duration) has passed -- not when start time has passed.
  // e.g. 5pm job with 2h duration is late only after 7pm, not at 5:01pm.
  const isJobLate = () => {
    if (!job?.scheduled_date) return false
    const status = (job?.status || '').toLowerCase()
    if (status === 'completed' || status === 'paid' || status === 'cancelled') return false
    let startDate
    if (typeof job.scheduled_date === 'string' && job.scheduled_date.includes(' ')) {
      const [datePart, timePart] = job.scheduled_date.split(' ')
      const [hours, minutes] = (timePart || '').split(':').map(Number)
      startDate = new Date(datePart)
      startDate.setHours(hours || 0, minutes || 0, 0, 0)
    } else if (typeof job.scheduled_date === 'string' && job.scheduled_date.includes('T')) {
      const [datePart, timePart] = job.scheduled_date.split('T')
      const [hours, minutes] = (timePart || '').split(':').map(Number)
      startDate = new Date(datePart)
      startDate.setHours(hours || 0, minutes || 0, 0, 0)
    } else {
      startDate = new Date(job.scheduled_date)
    }
    let durationMin = parseInt(job.service_duration || job.duration || job.estimated_duration || 60, 10) || 60
    if (durationMin >= 1 && durationMin <= 24) durationMin = durationMin * 60
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)
    const now = new Date()
    return now > endDate
  }

  // Format arrival window
  const formatArrivalWindow = () => {
    if (!job?.scheduled_date) return ''
    
    // Parse scheduled_date correctly - it's stored as string "YYYY-MM-DD HH:MM:SS"
    let scheduledDate;
    if (typeof job.scheduled_date === 'string' && job.scheduled_date.includes(' ')) {
      // Extract time directly from string to avoid timezone issues
      const [datePart, timePart] = job.scheduled_date.split(' ');
      const [hours, minutes] = timePart.split(':').map(Number);
      scheduledDate = new Date(datePart);
      scheduledDate.setHours(hours || 0, minutes || 0, 0, 0);
    } else if (typeof job.scheduled_date === 'string' && job.scheduled_date.includes('T')) {
      // Handle ISO format
      const [datePart, timePart] = job.scheduled_date.split('T');
      const [hours, minutes] = timePart.split(':').map(Number);
      scheduledDate = new Date(datePart);
      scheduledDate.setHours(hours || 0, minutes || 0, 0, 0);
    } else {
      scheduledDate = new Date(job.scheduled_date);
    }
    
    const duration = parseInt(job.service_duration || job.duration || 60)
    const startTime = new Date(scheduledDate)
    const endTime = new Date(scheduledDate.getTime() + duration * 60000)
    
    const start = formatTimeShared(startTime)
    const end = formatTimeShared(endTime)
    return `${start} - ${end}`
  }

  return (
    <>
    <div className="min-h-screen bg-[var(--sf-bg-page)]">
      {/* Mobile View - Shown on screens smaller than lg */}
      <div className="lg:hidden w-full max-w-full overflow-x-hidden">
        {/* Mobile Header */}
        <div className="bg-white border-b border-[var(--sf-border-light)] sticky top-0 z-10">
          <div className="px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => navigate('/jobs')}
              className="p-2 -ml-2"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--sf-text-primary)]" />
            </button>
            <h1 className="text-base font-semibold text-[var(--sf-text-primary)]">Job #{job?.id || job?.job_id}</h1>
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 -mr-2"
            >
              <MoreVertical className="w-5 h-5 text-[var(--sf-text-primary)]" />
            </button>
          </div>
        </div>

        {/* Map Section */}
        <div className="w-full h-48 bg-gray-200 relative">
          {job?.service_address_street && (
            <iframe
              title="Job Location Map"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(
                `${job.service_address_street}, ${job.service_address_city}, ${job.service_address_state} ${job.service_address_zip}`
              )}&zoom=15`}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </div>

        {/* Job Overview Card - Date, Time, Customer Info */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-[var(--sf-text-primary)]">{formatDate(job?.scheduled_date)}</p>
              {isJobLate() && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800">
                  Late
                </span>
              )}
            </div>
            <button className="flex items-center space-x-1 px-2 py-1 border border-[var(--sf-border-light)] rounded text-xs text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-page)]">
              <Plus className="w-3 h-3" />
              <span>Add Tag</span>
            </button>
          </div>
          <p className="text-sm text-[var(--sf-text-secondary)] mb-4">{formatArrivalWindow()}</p>
          
          {/* Customer Name with Source Badge + Phone Icon */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium text-[var(--sf-text-primary)] truncate">{getCustomerName()}</p>
              {job?.customer_source_resolved && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0">
                  {job.customer_source_resolved}
                </span>
              )}
            </div>
            {canViewCustomerContact(user) && job?.customer_phone && (
              <a href={`tel:${job.customer_phone}`} className="p-1.5 hover:bg-[var(--sf-bg-hover)] rounded flex-shrink-0">
                <Phone className="w-4 h-4 text-[var(--sf-text-secondary)]" />
              </a>
            )}
          </div>
          
          {/* Address */}
          <p className="text-sm text-[var(--sf-text-secondary)] mb-1">
            {job?.service_address_street || ''}
            {job?.service_address_unit && (
              <>
                <br />
                {job.service_address_unit}
              </>
            )}
          </p>
          <p className="text-sm text-[var(--sf-text-secondary)] mb-3">
            {[job?.service_address_city, job?.service_address_state, job?.service_address_zip, job?.service_address_country].filter(Boolean).join(', ')}
          </p>
          
          {/* Google Calendar Sync Indicator */}
          {job?.google_calendar_event_id && (
            <div className="flex items-center space-x-2 mb-4 p-2 bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg">
              <CalendarCheck className="w-4 h-4 text-[var(--sf-blue-500)] flex-shrink-0" />
              <span className="text-xs text-[var(--sf-blue-500)] font-medium flex-1">Synced to Google Calendar</span>
              {job?.google_calendar_event_link ? (
                <a
                  href={job.google_calendar_event_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--sf-blue-500)] hover:text-blue-800 underline flex items-center space-x-1"
                >
                  <span>View</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <a
                  href={`https://calendar.google.com/calendar/u/0/r/day/${new Date(job.scheduled_date || Date.now()).toISOString().split('T')[0].replace(/-/g, '/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--sf-blue-500)] hover:text-blue-800 underline flex items-center space-x-1"
                >
                  <span>View</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          
          {/* Action Links */}
          <div className="flex items-center space-x-4 mb-4">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                `${job?.service_address_street}, ${job?.service_address_city}, ${job?.service_address_state} ${job?.service_address_zip}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--sf-blue-500)] font-medium"
            >
              View directions →
            </a>
            <button
              onClick={() => {
                const address = `${job?.service_address_street}${job?.service_address_unit ? `, ${job.service_address_unit}` : ''}, ${job?.service_address_city}, ${job?.service_address_state} ${job?.service_address_zip}, ${job?.service_address_country || 'USA'}`
                navigator.clipboard.writeText(address)
                setSuccessMessage('Address copied to clipboard!')
                setTimeout(() => setSuccessMessage(''), 3000)
              }}
              className="text-sm text-[var(--sf-blue-500)] font-medium flex items-center space-x-1"
            >
              <Copy className="w-3 h-3" />
              <span>Copy Address</span>
            </button>
          </div>
          
          {/* Action Buttons — team-member PWA. Primary button advances the
              forward status flow (En Route → Start → Complete). More Actions
              dropdown contains real actions (view info, cancel). The status
              progress bar below is read-only context so a team-lead can see
              where the job is in its lifecycle. */}
          <div className="flex space-x-3">
            {canMarkJobStatus(user) && (() => {
              const s = String(job?.status || '').toLowerCase().trim()
              let next = null
              if (!s || s === 'pending' || s === 'scheduled') next = { status: 'en_route', label: 'En Route' }
              else if (s === 'confirmed' || s === 'en_route' || s === 'enroute') next = { status: 'in-progress', label: 'Start' }
              else if (s === 'in-progress' || s === 'in_progress' || s === 'started') next = { status: 'completed', label: 'Complete' }
              if (!next) return null
              return (
                <button
                  onClick={() => handleStatusUpdate(next.status)}
                  disabled={loading}
                  className="flex-1 bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-60"
                >
                  {next.label}
                </button>
              )
            })()}
            <div className="relative flex-1" ref={mobileMoreActionsRef}>
              <button
                onClick={() => setShowMobileMoreActions(prev => !prev)}
                className="w-full bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
              >
                More Actions
              </button>
              {showMobileMoreActions && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-[var(--sf-border-light)] z-30 overflow-hidden">
                  <button
                    onClick={() => { setShowMobileMoreActions(false); setShowMobileSidebar(true) }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] text-sm font-medium text-[var(--sf-text-primary)]"
                  >
                    View Job Info
                  </button>
                  {canRescheduleJobs(user) && job?.status !== 'cancelled' && (
                    <button
                      onClick={() => { setShowMobileMoreActions(false); setShowRescheduleModal(true) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] text-sm font-medium text-[var(--sf-text-primary)] border-t border-[var(--sf-border-light)]"
                    >
                      Reschedule
                    </button>
                  )}
                  {canMarkJobStatus(user) && job?.status !== 'cancelled' && job?.status !== 'completed' && (
                    <button
                      onClick={() => { setShowMobileMoreActions(false); setShowCancelModal(true) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] text-sm font-medium text-red-600 border-t border-[var(--sf-border-light)]"
                    >
                      Cancel Job
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status Progress Bar — read-only on PWA; no hover timing here (web only) */}
          <div className="mt-3 -mx-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="min-w-[440px] px-1">
              <StatusProgressBar
                currentStatus={job?.status || 'scheduled'}
                onStatusChange={handleStatusUpdate}
                statusHistory={undefined}
                jobCreatedAt={job?.created_at}
                invoiceStatus={job?.invoice_status}
              />
            </div>
          </div>
        </div>

        {/* Services Section */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Services</h2>
            {canEditJobDetails(user) && (
              <button
                onClick={() => setShowEditServiceModal(true)}
                className="text-sm text-[var(--sf-blue-500)] font-medium"
              >
                Edit
              </button>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--sf-text-primary)]">{job?.service_name || 'Service'}</p>
            {(() => {
              // Get intake questions and answers
              const intakeQuestions = getServiceIntakeQuestions()
              const equipmentQuestion = intakeQuestions.find(q => 
                q.question?.toLowerCase().includes('equipment') || 
                q.question?.toLowerCase().includes('type of')
              )
              const problemQuestion = intakeQuestions.find(q => 
                q.question?.toLowerCase().includes('problem') || 
                q.question?.toLowerCase().includes('nature') ||
                q.question?.toLowerCase().includes('issue')
              )
              
              return (
                <>
                  {equipmentQuestion?.answer && (
                    <div>
                      <p className="text-xs text-[var(--sf-text-secondary)] mb-1">Type of Equipment:</p>
                      <p className="text-sm text-[var(--sf-text-primary)]">{equipmentQuestion.answer}</p>
                    </div>
                  )}
                  {problemQuestion?.answer && (
                    <div>
                      <p className="text-xs text-[var(--sf-text-secondary)] mb-1">Nature of Problem:</p>
                      <p className="text-sm text-[var(--sf-text-primary)]">{problemQuestion.answer}</p>
                    </div>
                  )}
                  {/* Fallback to job fields if no intake questions */}
                  {!equipmentQuestion?.answer && job?.service_type && (
                    <div>
                      <p className="text-xs text-[var(--sf-text-secondary)] mb-1">Type of Equipment:</p>
                      <p className="text-sm text-[var(--sf-text-primary)]">{job.service_type}</p>
                    </div>
                  )}
                  {!problemQuestion?.answer && job?.service_description && (
                    <div>
                      <p className="text-xs text-[var(--sf-text-secondary)] mb-1">Nature of Problem:</p>
                      <p className="text-sm text-[var(--sf-text-primary)]">{job.service_description}</p>
                    </div>
                  )}
                </>
              )
            })()}
            <div>
              <p className="text-xs text-[var(--sf-text-secondary)] mb-1">Estimated duration:</p>
              <p className="text-sm text-[var(--sf-text-primary)]">
                {(() => {
                  const duration = parseInt(job?.service_duration || job?.duration || 60)
                  const hours = Math.floor(duration / 60)
                  const minutes = duration % 60
                  if (hours > 0 && minutes > 0) {
                    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`
                  } else if (hours > 0) {
                    return `${hours} hour${hours > 1 ? 's' : ''}`
                  } else {
                    return `${minutes} minute${minutes > 1 ? 's' : ''}`
                  }
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Notes and Attachments Section */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
          <h2 className="text-base font-semibold text-[var(--sf-text-primary)] mb-3">Notes and attachments</h2>
          {canViewCustomerNotes(user) ? (
            <button
              onClick={() => setEditingField('notes')}
              className="w-full border-2 border-dashed border-[var(--sf-border-light)] rounded-lg px-4 py-3 text-sm text-[var(--sf-text-secondary)] hover:border-blue-500 hover:text-[var(--sf-blue-500)] transition-colors"
            >
              + Add Note
            </button>
          ) : (
            <p className="text-sm text-[var(--sf-text-muted)] italic">You don't have permission to view notes.</p>
          )}
        </div>

        {/* Invoice Section */}
        {canViewEditJobPrice(user) && (
          <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Invoice</h2>
              <div className="flex items-center space-x-2">
                <button className="p-1.5 hover:bg-[var(--sf-bg-hover)] rounded">
                  <Mail className="w-4 h-4 text-[var(--sf-text-secondary)]" />
                </button>
                <button className="p-1.5 hover:bg-[var(--sf-bg-hover)] rounded">
                  <Printer className="w-4 h-4 text-[var(--sf-text-secondary)]" />
                </button>
                <button className="p-1.5 hover:bg-[var(--sf-bg-hover)] rounded">
                  <MoreVertical className="w-4 h-4 text-[var(--sf-text-secondary)]" />
                </button>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-[var(--sf-text-primary)]">{job?.service_name || 'Service'}</p>
                  <p className="text-xs text-[var(--sf-text-secondary)]">Base Price (${(parseFloat(job?.service_price) || parseFloat(job?.services?.price) || parseFloat(job?.total) || 0).toFixed(2)})</p>
                </div>
                <span className="text-sm font-medium text-[var(--sf-text-primary)]">${(parseFloat(job?.service_price) || parseFloat(job?.services?.price) || parseFloat(job?.total) || 0).toFixed(2)}</span>
              </div>
              {canEditJobDetails(user) && (
                <button 
                  onClick={() => setShowEditServiceModal(true)}
                  className="text-sm text-[var(--sf-blue-500)] font-medium flex items-center space-x-1"
                >
                  <Edit className="w-3 h-3" />
                  <span>Edit Service & Pricing</span>
                </button>
              )}
              <div className="border-t border-[var(--sf-border-light)] pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--sf-text-secondary)]">Subtotal</span>
                  <span className="text-[var(--sf-text-primary)]">${subtotalDisplay.toFixed(2)}</span>
                </div>
                {jobDiscount > 0 ? (
                  <div className="flex justify-between text-sm">
                    <button onClick={() => setShowDiscountModal(true)} className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]">Discount</button>
                    <span className="text-red-600">-${jobDiscount.toFixed(2)}</span>
                  </div>
                ) : (
                  <button onClick={() => setShowDiscountModal(true)} className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]">
                    Add Discount
                  </button>
                )}
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-[var(--sf-text-primary)]">Total</span>
                  <span className="text-[var(--sf-text-primary)]">${totalAfterDiscount.toFixed(2)}</span>
                </div>
                {jobFees > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--sf-text-secondary)]">Fee</span>
                    <span className="text-[var(--sf-text-primary)]">${jobFees.toFixed(2)}</span>
                  </div>
                )}
                {jobTaxes > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--sf-text-secondary)]">Taxes</span>
                    <span className="text-[var(--sf-text-primary)]">${jobTaxes.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-[var(--sf-border-light)]">
                  <span className="text-[var(--sf-text-secondary)]">Total due</span>
                  <span className={`font-semibold ${displayTotalDue === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${displayTotalDue.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--sf-text-secondary)]">Amount paid</span>
                  <span className="text-[var(--sf-text-primary)]">${effectiveAmountPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--sf-text-secondary)]">Tip</span>
                  <button
                    onClick={() => { const curTip = parseFloat(job?.tip_amount) || 0; setFormData(prev => ({ ...prev, tipInput: curTip > 0 ? curTip.toFixed(2) : '' })); setShowTipModal(true); }}
                    className={displayTip > 0 ? "text-green-600 hover:text-green-700" : "text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]"}
                  >
                    {displayTip > 0 ? `+$${displayTip.toFixed(2)}` : 'Add Tip'}
                  </button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--sf-text-secondary)]">Incentives</span>
                  <button
                    onClick={() => { const curIncentive = parseFloat(job?.incentive_amount) || 0; setFormData(prev => ({ ...prev, incentiveInput: curIncentive > 0 ? curIncentive.toFixed(2) : '' })); setShowIncentiveModal(true); }}
                    className={displayIncentive > 0 ? "text-purple-600 hover:text-purple-700" : "text-purple-600 hover:text-purple-700"}
                  >
                    {displayIncentive > 0 ? `+$${displayIncentive.toFixed(2)}` : 'Add Incentive'}
                  </button>
                </div>
                {showCreditLine && displayCreditAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--sf-text-secondary)]">Credit</span>
                    <span className="font-semibold text-green-600">+${displayCreditAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
            {canProcessPayments(user) && (
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSendInvoiceModal(true)}
                  className="flex-1 bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center justify-center space-x-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Charge Customer</span>
                </button>
                <button
                  onClick={() => {
                    setPaymentFormData({
                      amount: calculateTotalPrice().toString(),
                      paymentMethod: 'cash',
                      paymentDate: new Date().toISOString().split('T')[0],
                      notes: ''
                    })
                    setShowAddPaymentModal(true)
                  }}
                  className="flex-1 bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
                >
                  Record a Payment
                </button>
              </div>
            )}
          </div>
        )}

        {/* Payments Section */}
        {canProcessPayments(user) && (
          <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)] mb-3">Payments</h2>
            {paymentHistory && paymentHistory.length > 0 ? (
              <div className="space-y-3">
                {paymentHistory.map((payment, index) => (
                  <div key={payment.id || payment.transaction_id || index} className={`flex items-center justify-between p-3 rounded-lg border ${payment.status === 'voided' ? 'bg-red-50 border-red-200 opacity-60' : 'bg-[var(--sf-bg-page)] border-[var(--sf-border-light)]'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[var(--sf-text-primary)]">
                          ${parseFloat(payment.amount || 0).toFixed(2)}
                        </span>
                        {parseFloat(payment.tip_amount || 0) > 0 && (
                          <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                            +${parseFloat(payment.tip_amount).toFixed(2)} tip
                          </span>
                        )}
                        <span className="text-xs text-[var(--sf-text-muted)] capitalize">
                          {payment.payment_method || 'cash'}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--sf-text-muted)]">
                        {payment.created_at ? new Date(payment.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        }) : 'Date not available'}
                      </div>
                      {payment.notes && (
                        <div className="text-xs text-[var(--sf-text-secondary)] mt-1">
                          {payment.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <span className={`text-xs font-semibold ${payment.status === 'voided' ? 'text-red-500' : 'text-green-600'}`}>
                        {payment.status === 'voided' ? 'Voided' : 'Completed'}
                      </span>
                      {payment.status !== 'voided' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const txId = payment.id || payment.transaction_id;
                            if (!txId || !window.confirm('Void this payment? This cannot be undone.')) return;
                            try {
                              await api.post(`/transactions/${txId}/void`);
                              // Refresh payment history
                              const resp = await fetch(`${process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api'}/transactions/job/${job.id}`);
                              if (resp.ok) {
                                const data = await resp.json();
                                setPaymentHistory(data.transactions || []);
                                setJob(prev => ({ ...prev, total_paid_amount: data.totalPaid || 0, payment_status: data.totalPaid > 0 ? 'paid' : 'pending' }));
                              }
                            } catch (err) { console.error('Void failed:', err); alert('Failed to void payment'); }
                          }}
                          className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                          title="Void payment"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-[var(--sf-text-muted)]">
                  No payments. When you process or record a payment for this invoice, it will appear here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Cancellation summary (cancelled jobs only) */}
        {job?.status === 'cancelled' && (
          <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
            <CancellationSummary job={job} />
          </div>
        )}

        {/* Expenses / Reimbursements Section */}
        {job?.id && (
          <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
            <JobExpensesSection jobId={job.id} teamMembers={teamMembers} />
          </div>
        )}

        {/* Customer Section */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Customer</h2>
            {canEditJobDetails(user) && (
              <button 
                onClick={() => {
                  setEditCustomerData({
                    firstName: job?.customer_first_name || '',
                    lastName: job?.customer_last_name || '',
                    email: job?.customer_email || '',
                    phone: job?.customer_phone || '',
                    source: job?.customer_source || ''
                  })
                  setShowEditCustomerModal(true)
                }}
                className="text-sm text-[var(--sf-blue-500)] font-medium"
              >
                Edit
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 font-semibold text-sm">
                  {getCustomerName().split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-[var(--sf-text-primary)]">{getCustomerName()}</p>
                  {job?.customer_source_resolved && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                      {job.customer_source_resolved}
                    </span>
                  )}
                </div>
                {canViewCustomerContact(user) && job?.customer_phone && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Phone className="w-3 h-3 text-[var(--sf-text-muted)]" />
                    <a href={`tel:${job.customer_phone}`} className="text-xs text-[var(--sf-text-secondary)]">
                      {formatPhoneNumber(job.customer_phone)}
                    </a>
                  </div>
                )}
                {canViewCustomerContact(user) && job?.customer_email && (
                  <div className="flex items-center space-x-1 mt-1">
                    <Mail className="w-3 h-3 text-[var(--sf-text-muted)]" />
                    <a href={`mailto:${job.customer_email}`} className="text-xs text-[var(--sf-text-secondary)] truncate">
                      {job.customer_email}
                    </a>
                  </div>
                )}
              </div>
            </div>
            {canViewEditJobPrice(user) && (
            <div>
              <p className="text-xs text-[var(--sf-text-secondary)] mb-1">EXPECTED PAYMENT METHOD</p>
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--sf-text-primary)]">No payment method on file</p>
                  {canEditJobDetails(user) && (
                <button className="text-sm text-[var(--sf-blue-500)] font-medium">Change</button>
                  )}
              </div>
            </div>
            )}
            {canEditJobDetails(user) && (
            <div>
              <p className="text-xs text-[var(--sf-text-secondary)] mb-1">NOTIFICATION PREFERENCES</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${emailNotifications ? 'bg-green-100 text-green-800' : 'bg-[var(--sf-bg-page)] text-[var(--sf-text-secondary)]'}`}>
                    Email {emailNotifications ? 'Enabled' : 'Disabled'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${smsNotifications ? 'bg-green-100 text-green-800' : 'bg-[var(--sf-bg-page)] text-[var(--sf-text-secondary)]'}`}>
                    SMS {smsNotifications ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <button 
                  onClick={() => setShowNotificationModal(true)}
                  className="text-sm text-[var(--sf-blue-500)] font-medium"
                >
                  Edit
                </button>
              </div>
            </div>
            )}
            <div>
              <p className="text-xs text-[var(--sf-text-secondary)] mb-1">BILLING ADDRESS</p>
              <p className="text-sm text-[var(--sf-text-primary)]">Same as service address</p>
            </div>
          </div>
        </div>

        {/* Team Section */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 py-4 mt-2 mb-20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Team</h2>
            {canEditJobDetails(user) && !isWorker(user) && (
              <button 
                onClick={() => {
                  setEditJobRequirementsData({
                    workers_needed: job?.workers_needed || 1,
                    required_skills: job?.required_skills || []
                  })
                  setShowEditJobRequirementsModal(true)
                }}
                className="text-sm text-[var(--sf-blue-500)] font-medium"
              >
                Edit
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-[var(--sf-text-secondary)] mb-1">JOB REQUIREMENTS</p>
              <p className="text-sm text-[var(--sf-text-primary)] mb-1">Workers needed: {job?.workers_needed || 1} service provider</p>
              <p className="text-sm text-[var(--sf-text-primary)]">Skills needed: {job?.required_skills && job.required_skills.length > 0 ? job.required_skills.join(', ') : 'No skill tags required'}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-[var(--sf-text-secondary)]">ASSIGNED</p>
                {canEditJobDetails(user) && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="text-sm text-[var(--sf-blue-500)] font-medium"
                  >
                    Assign
                  </button>
                )}
              </div>
              {(() => {
                const teamAssignments = job?.team_assignments || [];

                const getTeamMemberInitials = (member) => {
                  if (!member) return '?'
                  const firstName = member.first_name || member.name || ''
                  const lastName = member.last_name || ''
                  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase()
                  if (firstName) return firstName.substring(0, 2).toUpperCase()
                  return '?'
                }
                const getTeamMemberName = (member) => {
                  if (!member) return ''
                  if (member.name) return member.name
                  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim()
                  return fullName || member.email || ''
                }

                if (teamAssignments.length > 0) {
                  return (
                    <div className="space-y-3">
                      {teamAssignments.map((assignment, index) => {
                        let member = assignment.team_members || null;
                        if (!member && assignment.team_member_id) {
                          member = teamMembers.find(m => Number(m.id) === Number(assignment.team_member_id)) || null;
                        }
                        // Build name from assignment fields as last fallback
                        if (!member && (assignment.first_name || assignment.last_name)) {
                          member = { first_name: assignment.first_name, last_name: assignment.last_name, email: assignment.email };
                        }
                        const memberName = member ? getTeamMemberName(member) : 'Unknown Team Member';

                        // Resolve full member for driving time
                        const fullMember = member && member.id
                          ? teamMembers.find(m => Number(m.id) === Number(member.id)) || member
                          : (assignment.team_member_id ? teamMembers.find(m => Number(m.id) === Number(assignment.team_member_id)) || member : member);
                        const drivingMin = fullMember ? getMemberDrivingTime(fullMember, companyDrivingTimeMinutes) : 0;

                        return (
                          <div key={assignment.team_member_id || index} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <div className="relative flex-shrink-0">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                    <span className="text-[var(--sf-blue-500)] font-semibold text-xs">
                                      {getTeamMemberInitials(member)}
                                    </span>
                                  </div>
                                  {assignment.is_primary && (
                                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full flex items-center justify-center border border-white">
                                      <Star className="w-2 h-2 text-white" fill="white" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <p className="text-sm text-[var(--sf-text-primary)] truncate" title={memberName}>
                                    {memberName.length > 22 ? `${memberName.substring(0, 22)}...` : memberName}
                                  </p>
                                  {assignment.is_primary && (
                                    <span className="rounded-full px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 flex-shrink-0">
                                      Primary
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {drivingMin > 0 && (
                              <p className="text-xs text-amber-700 flex items-center gap-1 ml-10">
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                Travel time: {drivingMin} min before & after — blocks this cleaner's schedule
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // Fallback: single member from direct assignment fields
                let assignedMember = null;
                if (!assignedMember) {
                  assignedMember = teamMembers.find(m =>
                    Number(m.id) === Number(job?.assigned_team_member_id) ||
                    Number(m.id) === Number(job?.team_member_id) ||
                    (job?.assigned_team_member && Number(m.id) === Number(job.assigned_team_member.id))
                  ) || null;
                }
                if (!assignedMember && job?.team_members) {
                  assignedMember = job.team_members;
                }
                if (!assignedMember && job?.assigned_team_member) {
                  assignedMember = job.assigned_team_member;
                }

                return assignedMember ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[var(--sf-blue-500)] font-semibold text-xs">
                        {getTeamMemberInitials(assignedMember)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--sf-text-primary)] truncate flex-1 min-w-0" title={getTeamMemberName(assignedMember)}>
                      {getTeamMemberName(assignedMember)}
                    </p>
                  </div>
                ) : (
                  canEditJobDetails(user) && (
                    <button
                      onClick={() => setShowAssignModal(true)}
                      className="text-sm text-[var(--sf-blue-500)] font-medium"
                    >
                      Assign team member
                    </button>
                  )
                )
              })()}
            </div>
            {canEditJobDetails(user) && (
            <div className="pt-3 border-t border-[var(--sf-border-light)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--sf-text-primary)]">Offer job to service providers</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={job?.offer_to_providers || false}
                      disabled={loading}
                    onChange={async (e) => {
                      try {
                        setLoading(true)
                          // Send as offerToProviders (camelCase) to match backend mapping
                          await jobsAPI.update(job.id, { offerToProviders: e.target.checked })
                        setJob(prev => ({ ...prev, offer_to_providers: e.target.checked }))
                        setSuccessMessage(`Job ${e.target.checked ? 'offered' : 'removed from'} service providers`)
                        setTimeout(() => setSuccessMessage(''), 3000)
                      } catch (error) {
                          console.error('Error updating offer status:', error)
                          setError(error.response?.data?.error || 'Failed to update job offer status')
                          setTimeout(() => setError(''), 5000)
                      } finally {
                        setLoading(false)
                      }
                    }}
                    className="sr-only peer"
                  />
                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sf-blue-500)] ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                </label>
              </div>
              <p className="text-xs text-[var(--sf-text-secondary)]">
                  Allows qualified, available providers to see and claim this job. <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]">Learn more</button>
              </p>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop View - Shown on lg screens and above */}
      <div className="hidden lg:flex min-h-screen bg-[var(--sf-bg-page)]">
        {/* Sidebar */}
        
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-40">
        
        {/* Header - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:block  px-4 sm:px-6 py-4">
          <div className="mb-4">
            <button
              className="flex items-center text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] flex-shrink-0"
              onClick={() => navigate('/jobs')}
              style={{ fontFamily: 'Montserrat', fontWeight: 400 }}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              <span className="text-sm">All Jobs</span>
            </button>
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <div className="min-w-0 flex-1">
              <h1 style={{fontFamily: 'Montserrat', fontWeight: 700}} className="text-xl font-bold text-[var(--sf-text-primary)] mb-1">
                {job.service_names && job.service_names.length > 1 
                  ? `${job.service_names.length} Services` 
                  : decodeHtmlEntities(job.service_name || 'Service')
                } <span style={{fontFamily: 'Montserrat', fontWeight: 400}} className="font-normal text-[var(--sf-text-muted)]">for</span>{' '}
                {job.customer_id ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/customer/${job.customer_id}`) }}
                    className="text-[var(--sf-blue-500)] hover:underline"
                  >
                    {job.customer_first_name} {job.customer_last_name}
                  </button>
                ) : (
                  <>{job.customer_first_name} {job.customer_last_name}</>
                )}
              </h1>
              <div className="flex items-center space-x-3">
              <p className="text-sm text-[var(--sf-text-muted)]" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>Job #{job.id || job.job_id}</p>
                {job?.google_calendar_event_id && (
                  <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-[var(--sf-blue-50)] border border-blue-200 rounded-md">
                    <CalendarCheck className="w-3.5 h-3.5 text-[var(--sf-blue-500)]" />
                    <span className="text-xs text-[var(--sf-blue-500)] font-medium">Synced</span>
                    {job?.google_calendar_event_link ? (
                      <a
                        href={job.google_calendar_event_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--sf-blue-500)] hover:text-blue-800 underline flex items-center space-x-0.5 ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <a
                        href={`https://calendar.google.com/calendar/u/0/r/day/${new Date(job.scheduled_date || Date.now()).toISOString().split('T')[0].replace(/-/g, '/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--sf-blue-500)] hover:text-blue-800 underline flex items-center space-x-0.5 ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-[var(--sf-text-muted)] mt-0.5" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>
                Source:{' '}
                <span className="font-medium text-[var(--sf-text-primary)]">
                  {job?.customer_source
                    || job?.customer?.source
                    || job?.customers?.source
                    || 'No source'}
                </span>
              </p>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
              {/* Mobile sidebar toggle */}
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-[var(--sf-bg-hover)] transition-colors"
              >
                <Menu className="w-5 h-5 text-[var(--sf-text-secondary)]" />
              </button>
              
              {/* Territory Assignment */}
              <div className="hidden sm:flex items-center space-x-2 relative" ref={territoryRef}>
                <span className="text-sm text-[var(--sf-text-secondary)]">Territory</span>
                <div 
                  className="flex items-center bg-[var(--sf-bg-page)] px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors relative min-w-0"
                  onClick={() => setEditingField(editingField === 'territory' ? null : 'territory')}
                >
                  {job?.territory_id ? (
                    <Target className="w-4 h-4 text-blue-500 mr-2 flex-shrink-0" />
                  ) : (
                    <Target className="w-4 h-4 text-[var(--sf-text-muted)] mr-2 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium mr-2 truncate flex-1 min-w-0" title={territories.find(t => t.id === job?.territory_id)?.name || 'Unassigned'}>
                    {(() => {
                      const territoryName = territories.find(t => t.id === job?.territory_id)?.name || 'Unassigned';
                      return territoryName.length > 20 ? `${territoryName.substring(0, 20)}...` : territoryName;
                    })()}
                  </span>
                  <ChevronDown className="w-4 h-4 text-[var(--sf-text-muted)] flex-shrink-0" />
                </div>
                {editingField === 'territory' && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-[var(--sf-border-light)] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-2 ${
                        !job?.territory_id ? 'font-semibold bg-[var(--sf-bg-page)]' : ''
                      }`}
                      onClick={() => {
                        handleTerritoryChange(null)
                        setEditingField(null)
                      }}
                    >
                      <Target className="w-4 h-4 text-[var(--sf-text-muted)]" />
                      <span>Unassigned</span>
                    </button>
                    {territories.map(t => (
                      <button
                        key={t.id}
                        className={`w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-2 ${
                          job?.territory_id === t.id ? 'font-semibold bg-[var(--sf-blue-50)]' : ''
                        }`}
                        onClick={() => {
                          handleTerritoryChange(t.id)
                          setEditingField(null)
                        }}
                      >
                        <Target className={`w-4 h-4 ${job?.territory_id === t.id ? 'text-blue-500' : 'text-[var(--sf-text-muted)]'}`} />
                        <span>{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 ">
      {/* Status Action Button with Dropdown - Only show if user has permission */}
      {canMarkJobStatus(user) && (
      <div className="relative flex">
        {(() => {
          const currentStatus = (job?.status || 'pending').toLowerCase().trim()
          
          // Normalize status: pending=scheduled, en_route=confirmed, started=in-progress, complete=completed
          const normalizedStatus = 
            currentStatus === 'scheduled' ? 'pending' :
            currentStatus === 'en_route' || currentStatus === 'enroute' ? 'confirmed' :
            currentStatus === 'started' ? 'in-progress' :
            currentStatus === 'complete' ? 'completed' :
            currentStatus
          
          // Determine next status and button label based on normalized status
          // Only show 3 options: En Route (confirmed), In Progress (in_progress), Complete (completed)
          let nextStatus = null
          let buttonLabel = 'Mark as En Route'
          let buttonColor = 'bg-[var(--sf-blue-500)] hover:bg-[var(--sf-blue-600)]'
          let isDisabled = false
          
          // Status progression: pending → confirmed → in_progress → completed
          if (normalizedStatus === 'pending' || normalizedStatus === 'scheduled') {
            nextStatus = 'confirmed' // Maps to "confirmed" in backend (En Route)
            buttonLabel = 'Mark as En Route'
            buttonColor = 'bg-[var(--sf-blue-500)] hover:bg-[var(--sf-blue-600)]'
          } else if (normalizedStatus === 'confirmed' || normalizedStatus === 'en_route' || normalizedStatus === 'enroute') {
            nextStatus = 'in_progress' // Maps to "in_progress" in backend (In Progress)
            buttonLabel = 'Mark as In Progress'
            buttonColor = 'bg-orange-600 hover:bg-orange-700'
          } else if (normalizedStatus === 'in-progress' || normalizedStatus === 'in_progress' || normalizedStatus === 'in_prog' || normalizedStatus === 'started') {
            nextStatus = 'completed' // Maps to "completed" in backend (Complete)
            buttonLabel = 'Mark as Complete'
            buttonColor = 'bg-green-600 hover:bg-green-700'
          } else if (normalizedStatus === 'completed' || normalizedStatus === 'complete' || normalizedStatus === 'done' || normalizedStatus === 'finished') {
            isDisabled = false
            buttonLabel = 'Job Complete'
            buttonColor = 'bg-green-600 hover:bg-green-700'
          } else if (normalizedStatus === 'paid') {
            isDisabled = false
            buttonLabel = 'Job Paid'
            buttonColor = 'bg-emerald-600 hover:bg-emerald-700'
          } else if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
            isDisabled = true
            buttonLabel = 'Job Cancelled'
            buttonColor = 'bg-gray-400 cursor-not-allowed'
          }
          
          return (
            <>
              <button 
                onClick={() => nextStatus && handleStatusUpdate(nextStatus)}
                disabled={isDisabled || loading}
                style={{fontFamily: 'Montserrat', fontWeight: 700}}
                className={`${buttonColor} text-white font-medium px-3 py-2 rounded-l-lg transition-colors text-xs flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{loading ? 'Updating...' : buttonLabel}</span>
              </button>
              <button 
                onClick={() => setStatusDropdown(!statusDropdown)}
                disabled={loading}
                className={`${buttonColor} text-white px-3 py-2 rounded-r-lg border-l border-white/20 transition-colors disabled:opacity-50`}
              >
                <ChevronDown size={12} />
              </button>
            </>
          )
        })()}
        
        {statusDropdown && (
          <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-xl border border-[var(--sf-border-light)] py-2 min-w-[200px] z-10">
            {[
              { label: 'Mark as En Route', backendStatus: 'confirmed', color: 'bg-[var(--sf-blue-500)]' },
              { label: 'Mark as In Progress', backendStatus: 'in_progress', color: 'bg-orange-500' },
              { label: 'Mark as Complete', backendStatus: 'completed', color: 'bg-green-500' }
            ].map((statusOption) => {
              const currentStatus = (job?.status || 'pending').toLowerCase().trim()
              // Normalize for comparison: scheduled=pending, en_route=confirmed, started=in-progress, complete=completed
              const normalizedCurrent = 
                currentStatus === 'scheduled' || currentStatus === 'pending' ? 'confirmed' :
                currentStatus === 'en_route' || currentStatus === 'enroute' ? 'confirmed' :
                currentStatus === 'started' || currentStatus === 'in_progress' || currentStatus === 'in_prog' || currentStatus === 'in-progress' ? 'in_progress' :
                currentStatus === 'complete' || currentStatus === 'completed' ? 'completed' :
                currentStatus === 'paid' ? 'paid' :
                currentStatus
              const isCurrentStatus = normalizedCurrent === statusOption.backendStatus
              
              return (
                <button
                  key={statusOption.backendStatus}
                  onClick={() => {
                    handleStatusUpdate(statusOption.backendStatus)
                    setStatusDropdown(false)
                  }}
                  disabled={loading}
                  className={`w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-xs disabled:opacity-50 ${
                    isCurrentStatus ? 'bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)]' : ''
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${statusOption.color}`}></div>
                  <span>{statusOption.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* More Options Button */}
      <div className="relative" ref={moreRef}>
        <button 
          onClick={() => setMoreDropdown(!moreDropdown)}
          className="bg-white hover:bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] p-3 rounded-lg transition-colors"
        >
          <MoreHorizontal size={20} />
        </button>
        
        {moreDropdown && (
          <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-xl border border-[var(--sf-border-light)] py-2 min-w-[200px] z-10">
            {(() => {
              const isCompleted = ['completed', 'complete', 'paid'].includes((job?.status || '').toLowerCase());

              // If job is completed/paid, only show Duplicate and Reset options
              if (isCompleted) {
                return (
                  <>
                    {canEditJobDetails(user) && (
                      <button 
                        onClick={() => {
                          setShowDuplicateModal(true)
                          setMoreDropdown(false)
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm"
                      >
                        <Copy size={18} className="text-[var(--sf-text-secondary)]" />
                        Duplicate Job
                      </button>
                    )}
                    {canResetJobStatuses(user) && (
                      <button
                        onClick={() => {
                          if (window.confirm('Reset this completed job? Ledger entries (earnings, tips, incentives) will be removed. Job goes back to pending.')) {
                            handleStatusUpdate('pending')
                            setMoreDropdown(false)
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm"
                      >
                        <RotateCw size={18} className="text-[var(--sf-text-secondary)]" />
                        Reset Job Status
                      </button>
                    )}
                  </>
                )
              }
              
              // Normal menu for non-completed jobs
              return (
                <>
            {canEditJobDetails(user) && (
            <button className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm">
              <ClipboardList size={18} className="text-[var(--sf-text-secondary)]" />
              Edit Service
            </button>
            )}
            {canEditJobDetails(user) && (
            <button className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm">
              <MapPin size={18} className="text-[var(--sf-text-secondary)]" />
              Edit Address
            </button>
            )}
            {canRescheduleJobs(user) && (
            <button onClick={() => { handleStatusUpdate('rescheduled'); setMoreDropdown(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm">
              <Calendar size={18} className="text-[var(--sf-text-secondary)]" />
              Reschedule
            </button>
            )}
            <button onClick={() => { setShowCancelModal(true); setMoreDropdown(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-red-50 transition-colors flex items-center gap-3 text-red-600 font-medium text-sm">
              <XCircle size={18} className="text-red-400" />
              Cancel Job
            </button>
            <div className="border-t border-[var(--sf-border-light)] my-1"></div>
                  {canEditJobDetails(user) && (
                    <button 
                      onClick={() => {
                        setShowDuplicateModal(true)
                        setMoreDropdown(false)
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm"
                    >
                      <Copy size={18} className="text-[var(--sf-text-secondary)]" />
                      Duplicate Job
                    </button>
                  )}
                  {job && !job.google_calendar_event_id && (
                    <button 
                      onClick={handleSyncToCalendar}
                      disabled={loading}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm disabled:opacity-50"
                    >
                      <CalendarCheck size={18} className="text-[var(--sf-text-secondary)]" />
                      Sync to Calendar
                    </button>
                  )}
                  {job?.google_calendar_event_id && (
                    <a
                      href={job?.google_calendar_event_link || `https://calendar.google.com/calendar/u/0/r/day/${new Date(job.scheduled_date || Date.now()).toISOString().split('T')[0].replace(/-/g, '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMoreDropdown(false)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm"
                    >
                      <ExternalLink size={18} className="text-[var(--sf-text-secondary)]" />
                      View in Calendar
                    </a>
                  )}
            <button className="w-full text-left px-4 py-2.5 hover:bg-[var(--sf-bg-page)] transition-colors flex items-center gap-3 text-[var(--sf-text-primary)] font-medium text-sm">
              <ExternalLink size={18} className="text-[var(--sf-text-secondary)]" />
              Rescheduling Page
            </button>
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>
            </div>
          </div>

          {/* Status Progress Bar */}
          <div className="mt-4">
            <StatusProgressBar 
              currentStatus={job?.status || 'scheduled'} 
              onStatusChange={handleStatusUpdate}
              statusHistory={job?.status_history}
              jobCreatedAt={job?.created_at}
              invoiceStatus={job?.invoice_status}
            />
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mx-4 sm:mx-6 mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className="text-green-700 font-medium">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="mx-4 sm:mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row min-w-0">
          {/* Left Column */}
          <div className="flex-1 lg:max-w-xl p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6 min-w-0">
            {/* Map Section */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm mb-3 sm:mb-4 lg:mb-6 divide-y divide-[var(--sf-border-light)]">
              <div className="relative">
                {/* Google Maps Integration */}
                <div className="w-full h-40 sm:h-40 bg-gradient-to-br from-green-100 to-blue-100 rounded-t-lg flex items-center justify-center">
                  {job.service_address_street && job.service_address_city ? (
                    <iframe
                      title="Job Location Map"
                      width="100%"
                      height="100%"
                      style={{ border: 0, borderRadius: '8px 8px 0 0' }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(
                        `${job.service_address_street}, ${job.service_address_city}, ${job.service_address_state || ''} ${job.service_address_zip || ''}`
                      )}&maptype=roadmap&zoom=16`}
                      onError={(e) => {
                        console.error('Map iframe failed to load:', e);
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                      onLoad={() => {
                        console.log('Map loaded successfully for address:', `${job.service_address_street}, ${job.service_address_city}`);
                      }}
                    />
                  ) : null}
                  <div className={`text-center ${job.service_address_street && job.service_address_city ? 'hidden' : 'flex flex-col items-center justify-center'}`}>
                    <div className="w-10 sm:w-12 h-10 sm:h-12 bg-[var(--sf-blue-500)] rounded-lg flex items-center justify-center mx-auto mb-3">
                      <MapPin className="w-5 sm:w-6 h-5 sm:h-6 text-white" />
                    </div>
                    <p className="text-[var(--sf-text-secondary)] font-medium">
                      {job.service_address_street ? 'Map unavailable' : 'No address set'}
                    </p>
                    <p className="text-sm text-[var(--sf-text-muted)]">
                      {job.service_address_street ? 'Unable to load map for this address' : 'Add an address to see the map'}
                    </p>
                  </div>
                </div>
              </div>
              <div className=" m-4 sm:mb-6 p-3 sm:p-4 lg:p-6">
              <div className="flex items-start justify-between">
                <MapPin className="w-5 h-5 text-[var(--sf-text-primary)] flex-shrink-0 mt-5 mr-2" />
                <div className="min-w-0 flex-1">
                  <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-medium text-[var(--sf-text-muted)] mb-1 text-xs sm:text-xs">JOB LOCATION</h3>
                  <p style={{fontFamily: 'Montserrat', fontWeight: 700}} className="text-[var(--sf-text-primary)] capitalize font-medium text-lg sm:text-md truncate">
                    {job.service_address_street || 'Address not set'}
                  </p>
                  <p className="text-[var(--sf-text-primary)] text-sm sm:text-base">
                    {job.service_address_city}, {job.service_address_state} {job.service_address_zip}
                  </p>
                  {job.service_address_street && (
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        `${job.service_address_street}, ${job.service_address_city}, ${job.service_address_state} ${job.service_address_zip}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-xs sm:text-sm font-medium mt-1 flex items-center"
                    >
                      View directions <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>
                <button
                   className="bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
                   onClick={() => setShowEditAddressModal(true)}
                >
                 
                  <span>Edit Address</span>
                </button>
              </div>
            </div>
            <div className="border-t border-[var(--sf-border-light)] m-4 sm:mb-6 p-3 sm:p-4 lg:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-1 sm:space-y-0">
             
                <div>
                  <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-xs font-medium text-[var(--sf-text-secondary)] mb-2 ml-5">DATE & TIME</h3>
                  <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-[var(--sf-text-muted)] flex-shrink-0 mr-2" />
                    <div>
                      <p style={{fontFamily: 'Montserrat', fontWeight: 700}} className="text-lg sm:text-xl font-semibold text-[var(--sf-text-primary)]">
                        {formatTime(job.scheduled_date) || 'Time placeholder'}
                      </p>
                      <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-secondary)] text-sm sm:text-base">{formatDate(job.scheduled_date) || 'Date placeholder'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <button 
                  style={{fontFamily: 'Montserrat', fontWeight: 500}}
                    onClick={() => setShowCancelModal(true)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded hover:border hover:border-red-200 text-sm"
                  >
                    Cancel
                  </button>
                  {canRescheduleJobs(user) && (
                  <button 
                  style={{fontFamily: 'Montserrat', fontWeight: 500}}
                    onClick={() => setShowRescheduleModal(true)}
                    className="bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
                    >
                    Reschedule
                  </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* REPEATS Section - Show if job is recurring */}
            {job.is_recurring && (
              <div className="m-4 sm:mb-6 p-3 sm:p-4 lg:p-6 border-t border-[var(--sf-border-light)]">
                <div className="flex flex-row items-start space-x-4">
                  <RotateCw className="w-5 h-5 text-[var(--sf-text-muted)] mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-xs font-medium text-[var(--sf-text-secondary)]">REPEATS</h3>
                      {canEditJobDetails(user) && (
                        <button
                          onClick={() => setShowEditRecurringModal(true)}
                          className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-xs font-medium"
                          style={{fontFamily: 'Montserrat', fontWeight: 500}}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-full px-4 py-2 inline-block">
                      <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-sm text-blue-800">
                        {(() => {
                          const frequency = job.recurring_frequency || job.recurringFrequency || ''
                          const scheduledDate = job.scheduled_date ? new Date(job.scheduled_date) : null
                          const formatted = formatRecurringFrequency(frequency, scheduledDate)
                          if (formatted && formatted !== 'Never') return formatted
                          // Frequency missing: derive weekday from scheduled_date
                          if (scheduledDate && !isNaN(scheduledDate.getTime())) {
                            const weekday = scheduledDate.toLocaleDateString('en-US', { weekday: 'long' })
                            return `Every week on ${weekday}`
                          }
                          return 'Recurring'
                        })()}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/recurring')}
                      className="mt-2 text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium flex items-center gap-1"
                      style={{fontFamily: 'Montserrat', fontWeight: 500}}
                    >
                      View recurring booking →
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Convert to Recurring Button - Show if job is NOT recurring */}
            {!job.is_recurring && canEditJobDetails(user) && (
              <div className="m-4 sm:mb-6 p-3 sm:p-4 lg:p-6 border-t border-[var(--sf-border-light)]">
                <button
                  onClick={() => setShowConvertToRecurringModal(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] flex items-center justify-center gap-2"
                  style={{fontFamily: 'Montserrat', fontWeight: 500}}
                >
                  <RotateCw className="w-4 h-4" />
                  Convert to Recurring
                </button>
              </div>
            )}
            
            <div className=" m-4 sm:mb-6 p-3 sm:p-4 lg:p-6    ">
            <div className="flex flex-row items-start space-x-4 justify-between">
              <div className="flex flex-row items-start space-x-4">
              <Clipboard className="w-5 h-5 text-[var(--sf-text-muted)] mt-1 flex-shrink-0" />
            
               <div className="flex-1 min-w-0">
               <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-xs font-medium text-[var(--sf-text-secondary)]">JOB DETAILS</h3>
              
                  {/* Display multiple services if available */}
                  {job.service_names && Array.isArray(job.service_names) && job.service_names.length > 1 ? (
                    <div className="">
                      <p className="font-semibold text-[var(--sf-text-primary)]">Multiple Services</p>
                      <div className="space-y-1">
                        {job.service_names.map((serviceName, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-[var(--sf-blue-500)] rounded-full"></div>
                            <span className="text-sm text-[var(--sf-text-primary)]">{decodeHtmlEntities(serviceName || '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                  <p className="font-semibold text-[var(--sf-text-primary)]">{decodeHtmlEntities(job.service_name || '')}</p>
                  )}
                  <p className="text-[var(--sf-text-secondary)] text-sm mb-1">
                    {job.service_names && job.service_names.length > 1 ? `${job.service_names.length} services` : 'Default service category'}
                  </p>
                  {(job.bedroom_count || job.bathroom_count) && (
                    <p className="text-sm text-[var(--sf-text-primary)] mb-1">
                      {job.bedroom_count ? `${job.bedroom_count} bed` : ''}{job.bedroom_count && job.bathroom_count ? ' / ' : ''}{job.bathroom_count ? `${job.bathroom_count} bath` : ''}
                    </p>
                  )}
                  {job.addons && Array.isArray(job.addons) && job.addons.length > 0 && (
                    <div className="mb-1">
                      {job.addons.filter(a => a.price > 0 || (a.value && a.value !== 'No')).map((addon, idx) => (
                        <p key={idx} className="text-sm text-[var(--sf-text-secondary)]">
                          {addon.name}: {addon.value || addon.name}{addon.price > 0 ? ` (+$${parseFloat(addon.price).toFixed(0)})` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-sm text-[var(--sf-text-secondary)] mt-2">
                    {formatDuration(job.duration || 0)}
                    {(job.status === 'completed' || job.status === 'paid') && job.start_time && job.end_time && (() => {
                      const realMin = Math.round((new Date(job.end_time) - new Date(job.start_time)) / 60000);
                      const estMin = job.duration || 0;
                      const diff = realMin - estMin;
                      const color = diff > estMin * 0.1 ? 'text-red-600' : diff < -estMin * 0.1 ? 'text-green-600' : 'text-[var(--sf-text-muted)]';
                      return <span className={`ml-2 text-xs font-medium ${color}`}>(Actual: {formatDuration(realMin)})</span>;
                    })()}
                  </p>
                  {(() => {
                const serviceModifiers = getServiceModifiers();
                if (!serviceModifiers || serviceModifiers.length === 0) return null;

                return (
                  <div className="mt-6 pt-6 space-y-1">
                    {serviceModifiers.map((modifier, modifierIndex) => {
                      if (!modifier.selectedOptions || modifier.selectedOptions.length === 0) return null;

                      const modifierTitle = modifier.title || modifier.name || 'Modifier';

                      return (
                        <div key={modifier.id || modifierIndex} className="space-y-2">
                          <p className="font-semibold text-[var(--sf-text-primary)]">{modifierTitle}:</p>
                          <div className="space-y-2">
                            {modifier.selectedOptions.map((option, optionIndex) => {
                              const optionLabel = option.selectedQuantity
                                ? `${option.selectedQuantity}x ${option.label || option.description || option.name || 'Item'}`
                                : (option.label || option.description || option.name || 'Item');

                              return (
                                <div key={option.id || optionIndex} className="flex items-center space-x-2">
                                  {option.image && (
                                    <img
                                      src={option.image}
                                      alt={option.label || option.name || 'Option'}
                                      className="w-12 h-12 object-cover rounded border border-[var(--sf-border-light)] flex-shrink-0"
                                    />
                                  )}
                                  <p className="text-[var(--sf-text-primary)] text-sm">
                                    {optionLabel}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Intake Questions & Answers */}
              {(() => {
                const intakeQuestions = getServiceIntakeQuestions();
                if (!intakeQuestions || intakeQuestions.length === 0) return null;

                return (
                  <div className=" pt-2 space-y-4">
                    {intakeQuestions.map((question, index) => {
                      // Get answer from multiple possible locations
                      const answer = intakeQuestionAnswers[question.id] || 
                                    question.answer || 
                                    question.answer_text || 
                                    (job.intake_answers && job.intake_answers.find(ans => ans.question_id === question.id)?.answer) ||
                                    null;
                      const questionText = question.question || question.question_text || 'Question';

                      // Parse answer if it's a JSON string
                      let parsedAnswer = answer;
                      if (typeof answer === 'string' && (answer.startsWith('[') || answer.startsWith('{'))) {
                        try {
                          parsedAnswer = JSON.parse(answer);
                        } catch (e) {
                          parsedAnswer = answer;
                        }
                      }

                      // Check if answer is a JSON object with text, image, and/or color (e.g., {"text":"ring","image":"url","color":"blue"})
                      const isObjectAnswer = parsedAnswer && typeof parsedAnswer === 'object' && !Array.isArray(parsedAnswer) && 
                        (parsedAnswer.text || parsedAnswer.image || parsedAnswer.color);
                      
                      // Check if answer is an array of objects with text/image/color
                      const isObjectArrayAnswer = parsedAnswer && Array.isArray(parsedAnswer) && parsedAnswer.length > 0 && 
                        parsedAnswer.every(item => typeof item === 'object' && item !== null && (item.text || item.image || item.color));

                      // Check if answer is an image URL (string)
                      const isImageAnswer = parsedAnswer && typeof parsedAnswer === 'string' && (
                        parsedAnswer.startsWith('http://') || 
                        parsedAnswer.startsWith('https://') ||
                        parsedAnswer.startsWith('data:image/')
                      );

                      // Check if answer is multiple images (array of URLs)
                      const isMultipleImages = parsedAnswer && Array.isArray(parsedAnswer) && parsedAnswer.length > 0 && 
                        parsedAnswer.every(item => typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('data:image/')));

                      const displayAnswer = parsedAnswer || answer;

                      // Handle text answers - check if it's a list or single value
                      const isListAnswer = typeof displayAnswer === 'string' && displayAnswer.includes('\n');
                      const answerList = isListAnswer ? displayAnswer.split('\n').filter(line => line.trim()) : null;
                      
                      // Handle comma-separated answers
                      const isCommaSeparated = typeof displayAnswer === 'string' && displayAnswer.includes(',') && !isImageAnswer;
                      const commaSeparatedList = isCommaSeparated ? displayAnswer.split(',').map(item => item.trim()).filter(item => item) : null;
                      
                      // Handle array answers (multiple selected items)
                      const isArrayAnswer = Array.isArray(displayAnswer) && !isMultipleImages && 
                        displayAnswer.every(item => typeof item === 'string' && !item.startsWith('http') && !item.startsWith('data:image'));

                      return (
                        <div key={question.id || index} className="space-y-2">
                          <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-semibold text-sm text-[var(--sf-text-primary)]">{questionText}</p>
                          {displayAnswer ? (
                            <div className="space-y-1">
                              {isObjectArrayAnswer ? (
                                // Array of objects with text/image/color
                                displayAnswer.map((item, itemIndex) => (
                                  <div key={itemIndex} className="space-y-2">
                                    {item.text && (
                                      <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-primary)] text-xs">{item.text}</p>
                                    )}
                                    {item.color && (
                                      <>
                                        {item.text && <div className="border-t border-[var(--sf-border-light)] pt-2 mt-2"></div>}
                                        <div 
                                          className="w-8 h-8 rounded-full border border-[var(--sf-border-light)] flex-shrink-0"
                                          style={{ backgroundColor: item.color }}
                                        />
                                      </>
                                    )}
                                    {item.image && (
                                      <div className="mt-1">
                                        <img 
                                          src={item.image} 
                                          alt={item.text || `Answer ${index + 1} - Image ${itemIndex + 1}`}
                                          className="max-w-full h-auto max-h-32 object-contain rounded  cursor-pointer"
                                          onClick={() => window.open(item.image, '_blank')}
                                          onError={(e) => {
                                            e.target.style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                ))
                              ) : isObjectAnswer ? (
                                // Single object with text/image/color
                                <div className="space-y-2">
                                  {parsedAnswer.text && (
                                    <p className="text-[var(--sf-text-primary)] text-sm">{parsedAnswer.text}</p>
                                  )}
                                  {parsedAnswer.color && (
                                    <>
                                      {parsedAnswer.text && <div className="border-t border-[var(--sf-border-light)] pt-2 mt-2"></div>}
                                      <div 
                                        className="w-8 h-8 rounded-full border border-[var(--sf-border-light)] flex-shrink-0"
                                        style={{ backgroundColor: parsedAnswer.color }}
                                      />
                                    </>
                                  )}
                                  {parsedAnswer.image && (
                                    <div className="mt-1">
                                      <img 
                                        src={parsedAnswer.image} 
                                        alt={parsedAnswer.text || `Answer ${index + 1}`}
                                        className="max-w-full h-auto max-h-48 object-contain rounded border border-[var(--sf-border-light)] hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => window.open(parsedAnswer.image, '_blank')}
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              ) : isMultipleImages ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                                  {displayAnswer.map((imageUrl, imgIndex) => (
                                    <div key={imgIndex} className="relative">
                                      <img 
                                        src={imageUrl} 
                                        alt={`Answer ${index + 1} - ${imgIndex + 1}`}
                                        className="w-full h-24 sm:h-32 object-cover rounded border border-[var(--sf-border-light)] hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => window.open(imageUrl, '_blank')}
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : isImageAnswer ? (
                                <div className="mt-2">
                                  <img 
                                    src={displayAnswer} 
                                    alt={`Answer ${index + 1}`}
                                    className="max-w-full h-auto max-h-48 object-contain rounded border border-[var(--sf-border-light)] hover:shadow-md transition-shadow cursor-pointer"
                                    onClick={() => window.open(displayAnswer, '_blank')}
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                </div>
                              ) : isListAnswer && answerList ? (
                                answerList.map((line, lineIndex) => (
                                  <p key={lineIndex} className="text-[var(--sf-text-primary)] text-sm">
                                    {line.trim()}
                                  </p>
                                ))
                              ) : isCommaSeparated && commaSeparatedList ? (
                                commaSeparatedList.map((item, itemIndex) => (
                                  <p key={itemIndex} className="text-[var(--sf-text-primary)] text-sm">
                                    {item}
                                  </p>
                                ))
                              ) : isArrayAnswer ? (
                                displayAnswer.map((item, itemIndex) => (
                                  <p key={itemIndex} className="text-[var(--sf-text-primary)] text-sm">
                                    {item}
                                  </p>
                                ))
                              ) : (
                                <p className="text-[var(--sf-text-primary)] text-sm">
                                  {typeof displayAnswer === 'string' ? displayAnswer : JSON.stringify(displayAnswer)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[var(--sf-text-muted)] text-sm italic">No answer provided</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
                </div>
                
              </div>
              
              <button
                   className="bg-white border border-[var(--sf-border-light)] rounded-lg px-4 py-2 text-sm font-medium text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]"
                   onClick={() => setShowEditServiceModal(true)}
                >
                  <span>Edit Service</span>
                </button>
                </div>
            </div>
              {/* Service Modifiers */}
              
            </div>

            
           

          


            {/* Invoice Section */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-3 sm:p-4 lg:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 space-y-2 sm:space-y-0 sm:space-x-2">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-xl font-bold text-[var(--sf-text-primary)]">Invoice</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isPaidOrFree
                        ? 'bg-green-100 text-green-800'
                        : job.invoice_status === 'invoiced' || job.invoice_status === 'sent'
                        ? 'bg-yellow-100 text-yellow-800'
                        : job.invoice_status === 'draft'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
                    }`}>
                      {isPaidOrFree
                        ? (displayServiceTotal === 0 ? 'Free' : 'Paid')
                        : job.invoice_status === 'invoiced' || job.invoice_status === 'sent'
                        ? 'Unpaid'
                        : job.invoice_status === 'draft'
                        ? 'Draft'
                        : 'Draft'}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--sf-text-secondary)]">Due Oct 2, 2025</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                  <button
                    onClick={() => {
                      setPaymentFormData({
                        amount: (parseFloat(job?.total) || parseFloat(job?.service_price) || 0).toString(),
                        paymentMethod: 'cash',
                        paymentDate: new Date().toISOString().split('T')[0],
                        notes: ''
                      })
                      setShowAddPaymentModal(true)
                    }}
                    className="px-2 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] flex items-center justify-center space-x-1 text-xs font-medium"
                  >

                    <span>Add Payment</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      if (!job.customer_email) {
                        setPendingAction('send')
                        setShowEmailRequiredModal(true)
                      } else {
                        setShowSendInvoiceModal(true)
                      }
                    }}
                    className="px-4 py-2 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded-lg hover:bg-[var(--sf-bg-page)] text-sm font-medium"
                  >
                    <MailCheck className="w-4 h-4" />
                  </button>
                  <div className="flex space-x-2">
                    <button className="p-2 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] border border-[var(--sf-border-light)] rounded-lg">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button className="p-2 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] border border-[var(--sf-border-light)] rounded-lg">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-1">Amount paid</p>
                  <p className="text-lg font-semibold text-[var(--sf-text-primary)]">
                    ${effectiveAmountPaid.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-1">Amount due</p>
                  <p className={`text-lg font-semibold ${displayTotalDue <= 0 ? 'text-green-600' : 'text-red-600 underline'}`}>
                    ${Math.max(0, displayTotalDue).toFixed(2)}
                  </p>
                  {showCreditLine && displayCreditAmount > 0 && (
                    <p className="text-sm font-semibold text-green-600 mt-0.5">Credit +${displayCreditAmount.toFixed(2)}</p>
                  )}
                </div>
                </div>

              {/* Payment Status Section */}
              <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${isPaidOrFree ? 'bg-green-500' : job.invoice_status === 'invoiced' || job.invoice_status === 'sent' ? 'bg-yellow-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-[var(--sf-text-primary)]">
                        {isPaidOrFree ? 'Payment Received' : 
                         job.invoice_status === 'invoiced' || job.invoice_status === 'sent' ? 'Invoice Sent' : 
                         'No Invoice Sent'}
                      </p>
                      <p className="text-xs text-[var(--sf-text-muted)]">
                        {isPaidOrFree ? (displayServiceTotal === 0 ? 'Free -- no payment required' : 'Customer has paid the invoice') :
                         job.invoice_status === 'invoiced' || job.invoice_status === 'sent' ? 'Invoice sent to customer, awaiting payment' : 
                         'Invoice not yet sent to customer'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isPaidOrFree && (
                      <div className="flex items-center space-x-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Paid</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        console.log('💳 Manual refresh clicked for job ID:', job.id)
                        fetchInvoiceStatus(job.id)
                      }}
                      className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors"
                      title="Refresh payment status"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Service Details Section - Only show if user has permission */}
              {canViewEditJobPrice(user) ? (
              <div className="bg-[var(--sf-bg-page)] rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-[var(--sf-text-primary)] mb-4">{decodeHtmlEntities(job.service_name || '')}</h4>
                
                <div className="space-y-3">
                  {/* Base Price */}
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-[var(--sf-text-secondary)]">Base Price (${(parseFloat(job.service_price) || parseFloat(job.services?.price) || 0).toFixed(2)})</p>
                  </div>
                    <span className="text-sm font-medium text-[var(--sf-text-primary)]">${(parseFloat(job.service_price) || parseFloat(job.services?.price) || 0).toFixed(2)}</span>
                  </div>
                  
                  {/* Modifiers */}
                  {(() => {
                    const serviceModifiers = getServiceModifiers();
                    let hasModifiers = false;
                    
                    return (
                      <>
                        {serviceModifiers.map((modifier, modifierIndex) => {
                          if (!modifier.selectedOptions || modifier.selectedOptions.length === 0) {
                            return null;
                          }
                          
                          hasModifiers = true;
                          return modifier.selectedOptions.map((option, index) => (
                            <div key={`${modifier.id}-${option.id}-${index}`} className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-[var(--sf-text-secondary)]">
                                  {option.selectedQuantity ? `${option.selectedQuantity} ${option.label || option.description}` : (option.label || option.description)}
                                </p>
                              </div>
                              <span className="text-sm font-medium text-[var(--sf-text-primary)]">
                                ${parseFloat(option.price || 0).toFixed(2)}
                                </span>
                            </div>
                          ));
                        })}
                      </>
                    );
                  })()}
                  
                  {/* Service Adjustment Price */}
                  {(() => {
                    const basePrice = parseFloat(job.services?.price) || 0;
                    const modifierPrice = calculateModifierPrice();
                    const servicePriceVal = parseFloat(job.service_price) || parseFloat(job.total) || 0;
                    const serviceAdjustment = servicePriceVal - (basePrice + modifierPrice);
                    
                    if (Math.abs(serviceAdjustment) > 0.01) {
                      return (
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-[var(--sf-text-secondary)]">Service Adjustment Price (${Math.abs(serviceAdjustment).toFixed(2)})</p>
                          </div>
                          <span className="text-sm font-medium text-[var(--sf-text-primary)]">
                            ${Math.abs(serviceAdjustment).toFixed(2)}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                </div>

                <div className="mt-4 pt-4 border-t border-[var(--sf-border-light)]">
                  <button 
                    onClick={() => setShowEditServiceModal(true)}
                    className="px-3 py-1 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded hover:bg-[var(--sf-bg-page)] flex items-center space-x-2 text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Service & Pricing</span>
                  </button>
                    </div>
              </div>
              ) : (
                <div className="bg-[var(--sf-bg-page)] rounded-lg p-4 mb-6">
                  <p className="text-sm text-[var(--sf-text-muted)] italic">Price and invoice information is not available. You don't have permission to view job pricing.</p>
                </div>
              )}

              {/* Summary Section - Only show if user has permission */}
              {canViewEditJobPrice(user) && (
              <div className="space-y-0">
                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Subtotal</span>
                  <span className="text-sm font-medium text-[var(--sf-text-primary)]">${subtotalDisplay.toFixed(2)}</span>
                </div>
                {jobDiscount > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Discount</span>
                  <span className="text-sm font-medium text-red-600">-${jobDiscount.toFixed(2)}</span>
                </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Total</span>
                  <span className="text-sm font-semibold text-[var(--sf-text-primary)]">${totalAfterDiscount.toFixed(2)}</span>
                </div>
                {jobFees > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Fee</span>
                  <span className="text-sm font-medium text-[var(--sf-text-primary)]">${jobFees.toFixed(2)}</span>
                </div>
                )}
                {jobTaxes > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Taxes</span>
                  <span className="text-sm font-medium text-[var(--sf-text-primary)]">${jobTaxes.toFixed(2)}</span>
                </div>
                )}

                <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Total due</span>
                  <span className={`text-sm font-semibold ${displayTotalDue === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${displayTotalDue.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Amount paid</span>
                  <span className="text-sm font-medium text-[var(--sf-text-primary)]">
                    ${effectiveAmountPaid.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Tip</span>
                  <button type="button" onClick={() => { const curTip = parseFloat(job?.tip_amount) || 0; setFormData(prev => ({ ...prev, tipInput: curTip > 0 ? curTip.toFixed(2) : '' })); setShowTipModal(true); }} className={`text-sm font-medium ${displayTip > 0 ? 'text-green-600 hover:text-green-700' : 'text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]'}`}>
                    {displayTip > 0 ? `+$${displayTip.toFixed(2)}` : 'Add Tip'}
                  </button>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Incentives</span>
                  <button type="button" onClick={() => { const curIncentive = parseFloat(job?.incentive_amount) || 0; setFormData(prev => ({ ...prev, incentiveInput: curIncentive > 0 ? curIncentive.toFixed(2) : '' })); setShowIncentiveModal(true); }} className={`text-sm font-medium ${displayIncentive > 0 ? 'text-purple-600 hover:text-purple-700' : 'text-purple-600 hover:text-purple-700'}`}>
                    {displayIncentive > 0 ? `+$${displayIncentive.toFixed(2)}` : 'Add Incentive'}
                  </button>
                </div>
              </div>
              )}

              {/* Payments Section - Only show if user has permission */}
              {canProcessPayments(user) && (
              <div className="mt-8">
                <h4 className="font-semibold text-[var(--sf-text-primary)] mb-4">Payments</h4>
                {paymentHistory && paymentHistory.length > 0 ? (
                  <div className="space-y-3">
                    {paymentHistory.map((payment, index) => (
                      <div key={payment.id || payment.transaction_id || index} className={`flex items-center justify-between p-3 rounded-lg border ${payment.status === 'voided' ? 'bg-red-50 border-red-200 opacity-60' : 'bg-[var(--sf-bg-page)] border-[var(--sf-border-light)]'}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-semibold ${payment.status === 'voided' ? 'line-through text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-primary)]'}`}>
                              ${parseFloat(payment.amount || 0).toFixed(2)}
                            </span>
                            {parseFloat(payment.tip_amount || 0) > 0 && (
                              <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                +${parseFloat(payment.tip_amount).toFixed(2)} tip
                              </span>
                            )}
                            <span className="text-xs text-[var(--sf-text-muted)] capitalize">
                              {payment.payment_method || 'cash'}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--sf-text-muted)]">
                            {payment.created_at ? new Date(payment.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            }) : 'Date not available'}
                          </div>
                          {payment.notes && (
                            <div className="text-xs text-[var(--sf-text-secondary)] mt-1">
                              {payment.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`text-xs font-semibold ${payment.status === 'voided' ? 'text-red-500' : 'text-green-600'}`}>
                            {payment.status === 'voided' ? 'Voided' : 'Completed'}
                          </span>
                          {payment.status !== 'voided' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const txId = payment.id || payment.transaction_id;
                                if (!txId || !window.confirm('Void this payment? This cannot be undone.')) return;
                                try {
                                  await api.post(`/transactions/${txId}/void`);
                                  const resp = await api.get(`/transactions/job/${job.id}`);
                                  if (resp.data) {
                                    setPaymentHistory(resp.data.transactions || []);
                                    setJob(prev => ({ ...prev, total_paid_amount: resp.data.totalPaid || 0 }));
                                  }
                                } catch (err) { console.error('Void failed:', err); alert('Failed to void payment'); }
                              }}
                              className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                              title="Void payment"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                  <div className="w-12 h-12 bg-[var(--sf-bg-page)] rounded-full flex items-center justify-center mx-auto mb-3">
                    <CreditCard className="w-6 h-6 text-[var(--sf-text-muted)]" />
                  </div>
                    <p className="text-[var(--sf-text-muted)] font-medium">No payments</p>
                  <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                      When you process or record a payment for this invoice, it will appear here.
                    </p>
                  </div>
                )}
                </div>
              )}

              {/* Cancellation summary (cancelled jobs only) */}
              {job?.status === 'cancelled' && (
                <div className="mt-8">
                  <CancellationSummary job={job} />
                </div>
              )}

              {/* Expenses / Reimbursements Section */}
              {job?.id && (
                <div className="mt-8">
                  <JobExpensesSection jobId={job.id} teamMembers={teamMembers} />
                </div>
              )}
            </div>

          </div>
           {/* Right Sidebar - Mobile Collapsible */}
           <div className="lg:block w-full lg:w-80 xl:w-96 p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-6">
            {/* Customer Card */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm py-2">
              {/* Customer Section */}
              <div className="flex items-center justify-between mb-1 px-4">
                <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-medium text-[var(--sf-text-primary)] text-md">Customer</h3>
                <button
                  onClick={() => {
                    setEditCustomerData({
                      firstName: job.customer_first_name || '',
                      lastName: job.customer_last_name || '',
                      email: job.customer_email || '',
                      phone: job.customer_phone || '',
                      source: job.customer_source || ''
                    })
                    setShowEditCustomerModal(true)
                  }}
                  style={{fontFamily: 'Montserrat', fontWeight: 500}}
                  className=" text-[var(--sf-blue-500)] rounded hover:bg-blue-800 flex items-center space-x-2 text-sm font-medium"
                >
                  <span>Edit</span>
                </button>
              </div>
              
              <div className="flex items-center space-x-2 mb-2 px-4">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                  <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-white font-semibold text-sm">{getCustomerInitials()}</span>
                </div>
                <div>
                  <p style={{fontFamily: 'Montserrat', fontWeight: 700}} className="font-bold text-[var(--sf-text-primary)] text-lg">
                    {(() => {
                      // Try multiple sources for customer name
                      const firstName = (job.customer_first_name || job.customer?.first_name || job.customers?.first_name || '').trim()
                      const lastName = (job.customer_last_name || job.customer?.last_name || job.customers?.last_name || '').trim()
                      
                      if (firstName && lastName) {
                        return `${firstName} ${lastName}`
                      }
                      if (firstName) {
                        return firstName
                      }
                      if (lastName) {
                        return lastName
                      }
                      
                      // Fallback: try email
                      const email = job.customer_email || job.customer?.email || job.customers?.email || ''
                      if (email) {
                        return email.split('@')[0] // Use email username as fallback
                      }
                      
                      return 'Customer'
                    })()}
                  </p>
                </div>
              </div>

              {/* Contact Info - Phone and Email (conditional based on permission) */}
              {canViewCustomerContact(user) && (
                <div className="space-y-4 mb-6 px-6">   
                  <div className="flex items-center space-x-3 text-sm">
                    <Phone className="w-4 h-4 text-[var(--sf-text-muted)]" />
                    <span className="text-[var(--sf-text-primary)] font-medium">
                      {job.customer_phone ? formatPhoneNumber(job.customer_phone) : 'Phone placeholder'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm">
                    <Mail className="w-4 h-4 text-[var(--sf-text-muted)]" />
                    <span className="text-[var(--sf-text-primary)] font-medium truncate">
                      {job.customer_email || 'No email address'}
                    </span>
                  </div>
                </div>
              )}
              {!canViewCustomerContact(user) && (
                <div className="mb-6 px-6">
                  <p className="text-xs text-[var(--sf-text-muted)] italic">Contact information not available</p>
                </div>
              )}

              {/* Billing Address Section */}
              <div className="mb-6 border-t border-[var(--sf-border-light)] px-6 pt-3">
                <div className="flex justify-between items-center mb-1">
                  <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-bold text-[var(--sf-text-primary)] text-xs">BILLING ADDRESS</span>
                  <button style={{fontFamily: 'Montserrat', fontWeight: 500}} className=" text-[var(--sf-blue-500)] rounded hover:bg-[var(--sf-blue-50)] flex items-center space-x-2 text-sm font-medium">
                   
                    <span>Edit</span>
                  </button>
                </div>
                <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-xs text-[var(--sf-text-secondary)]">Same as service address</p>
              </div>

              {/* Expected Payment Method Section */}
              <div className="border-t border-[var(--sf-border-light)] px-6 py-3">
                <div className="mb-1">
                  <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-bold text-[var(--sf-text-secondary)] text-xs">EXPECTED PAYMENT METHOD</span>
                </div>
                <div className="flex items-center space-x-3 text-[var(--sf-text-secondary)] mb-1">
                  <CreditCard className="w-4 h-4 text-[var(--sf-text-muted)]" />
                  <span className="text-sm">No payment method on file</span>
                </div>
                <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium">
                  Add a card to charge later
                </button>
              </div>
            </div>

            {/* Team Section */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm py-3">
              <h3 style={{fontFamily: 'Montserrat', fontWeight: 700}} className="font-semibold text-[var(--sf-text-primary)] text-lg mb-2 px-6">Team</h3>
              
              <div className="space-y-4">
                {/* Job Requirements Section */}
                <div className="px-6">
                  <div className="flex justify-between items-center mb-1">
                    <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-bold text-[var(--sf-text-primary)] text-xs">JOB REQUIREMENTS</span>
                    {canEditJobDetails(user) && !isWorker(user) && (
                      <button 
                        onClick={() => {
                          setEditJobRequirementsData({
                            workers_needed: job?.workers_needed || 1,
                            required_skills: job?.required_skills || []
                          })
                          setShowEditJobRequirementsModal(true)
                        }}
                        style={{fontFamily: 'Montserrat', fontWeight: 500}} 
                        className=" text-[var(--sf-blue-500)] rounded hover:bg-[var(--sf-blue-50)] flex items-center space-x-2 text-sm font-medium"
                      >
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-secondary)]">Workers needed</span>
                      <span className="font-medium">{job.workers_needed || 1} service provider</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-secondary)]">Skills needed</span>
                      <span className="font-medium">
                        {job.skills && job.skills.length ? job.skills.join(', ') : 'No skill tags required'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-secondary)]">Intake questions</span>
                      <span className="font-medium">
                        {(() => {
                          const intakeQuestions = getServiceIntakeQuestions();
                          const count = intakeQuestions ? intakeQuestions.length : 0;
                          return count > 0 ? `${count} question${count !== 1 ? 's' : ''}` : 'No questions';
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assigned Section - Show if user has permission or if showing themselves */}
                {(() => {
                  const isCurrentUserAssigned = user?.teamMemberId && job.assigned_team_member?.id === user.teamMemberId;
                  const canSee = canSeeOtherProviders(user) || isCurrentUserAssigned;
                  
                  if (!canSee) {
                    return (
                      <div className="px-6 border-y border-[var(--sf-border-light)] py-3">
                        <div className="flex justify-between items-center mb-2">
                          <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-bold text-[var(--sf-text-primary)] text-xs">ASSIGNED</span>
                        </div>
                        <p className="text-xs text-[var(--sf-text-muted)] italic">Other assigned providers are not visible. You don't have permission to see other providers.</p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="px-6 border-y border-[var(--sf-border-light)] py-3">
                      <div className="flex justify-between items-center mb-2">
                        <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-bold text-[var(--sf-text-primary)] text-xs">ASSIGNED</span>
                        {canEditJobDetails(user) && (
                        <button 
                          onClick={() => setShowAssignModal(true)}
                          style={{fontFamily: 'Montserrat', fontWeight: 500}}
                          className="text-[var(--sf-blue-500)] rounded hover:bg-[var(--sf-blue-50)] flex items-center space-x-2 text-sm font-medium"
                        >
                          Assign
                        </button>
                        )}
                      </div>
                      
                      {(() => {
                        // Get all team members from team_assignments array
                        const teamAssignments = job.team_assignments || [];
                        const hasTeamMembers = teamAssignments.length > 0 || job.assigned_team_member;
                        
                        if (hasTeamMembers && teamAssignments.length > 0) {
                          // Display multiple team members
                          return (
                            <div className="space-y-3">
                              {teamAssignments.map((assignment, index) => {
                                // First try to get member from nested team_members object (from backend relation)
                                let member = assignment.team_members || null;
                                
                                // If not found, try to find in teamMembers array by team_member_id
                                if (!member && assignment.team_member_id) {
                                  member = teamMembers.find(m => Number(m.id) === Number(assignment.team_member_id)) || null;
                                }
                                
                                // Build member name from available data
                                const memberName =
                                  (member && (member.first_name || member.last_name))
                                    ? `${member.first_name || ''} ${member.last_name || ''}`.trim()
                                    : (assignment.first_name || assignment.last_name)
                                      ? `${assignment.first_name || ''} ${assignment.last_name || ''}`.trim()
                                      : (member?.email || assignment.email || 'Unknown Team Member');
                                const memberEmail = member?.email || assignment.email || '';
                                
                                return (
                                  <div key={assignment.team_member_id || index} className="flex items-center space-x-2">
                                    <div className="relative">
                                      <div className="w-10 h-10 bg-[var(--sf-blue-500)] rounded-full flex items-center justify-center">
                                        <span className="text-white font-semibold text-sm">
                                          {member?.first_name?.[0] || assignment.first_name?.[0] || '?'}
                                          {member?.last_name?.[0] || assignment.last_name?.[0] || ''}
                                        </span>
                                      </div>
                                      {assignment.is_primary && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center border-2 border-white">
                                          <Star className="w-2 h-2 text-white" fill="white" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <p className="font-semibold text-[var(--sf-text-primary)] truncate" title={memberName}>
                                          {memberName}
                                        </p>
                                        {assignment.is_primary && (
                                          <span className="rounded-full px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800">
                                            Primary
                                          </span>
                                        )}
                                      </div>
                                      {memberEmail && (
                                        <p className="text-sm text-[var(--sf-text-secondary)] truncate" title={memberEmail}>
                                          {memberEmail}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        } else if (job.assigned_team_member) {
                          // Fallback: single team member (backward compatibility)
                          return (
                        <div className="flex items-center space-x-2">
                          <div className="w-10 h-10 bg-[var(--sf-blue-500)] rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {job.assigned_team_member.first_name?.[0]}{job.assigned_team_member.last_name?.[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[var(--sf-text-primary)] truncate" title={`${job.assigned_team_member.first_name} ${job.assigned_team_member.last_name}`}>
                              {job.assigned_team_member.first_name} {job.assigned_team_member.last_name}
                            </p>
                            <p className="text-sm text-[var(--sf-text-secondary)] truncate" title={job.assigned_team_member.email}>
                              {job.assigned_team_member.email}
                            </p>
                          </div>
                        </div>
                          );
                        } else {
                          // No team members assigned
                          return (
                        <div className="text-center py-2">
                          <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                            <UserX className="w-8 h-8 text-[var(--sf-text-muted)]" />
                          </div>
                          <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-semibold text-sm text-[var(--sf-text-primary)] mb-1">Unassigned</p>
                          <p style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-xs text-[var(--sf-text-muted)]">No service providers are assigned to this job</p>
                        </div>
                          );
                        }
                      })()}
                    </div>
                  );
                })()}

                {/* Offer job to service providers Section */}
                {canEditJobDetails(user) && (
                <div className="px-6 pt-1 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-medium text-[var(--sf-text-primary)] text-sm">Offer job to service providers</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                          checked={job?.offer_to_providers || false}
                          disabled={loading}
                          onChange={async (e) => {
                            try {
                              setLoading(true)
                              // Send as offerToProviders (camelCase) to match backend mapping
                              await jobsAPI.update(job.id, { offerToProviders: e.target.checked })
                              setJob(prev => ({ ...prev, offer_to_providers: e.target.checked }))
                              setSuccessMessage(`Job ${e.target.checked ? 'offered' : 'removed from'} service providers`)
                              setTimeout(() => setSuccessMessage(''), 3000)
                            } catch (error) {
                              console.error('Error updating offer status:', error)
                              setError(error.response?.data?.error || 'Failed to update job offer status')
                              setTimeout(() => setError(''), 5000)
                            } finally {
                              setLoading(false)
                            }
                        }}
                        className="sr-only peer" 
                      />
                        <div className={`w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--sf-blue-500)] ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                    </label>
                  </div>
                  <p className="text-xs text-[var(--sf-text-secondary)]">
                    Allows qualified, available providers to see and claim this job. 
                    <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] ml-1">Learn more</button>
                  </p>
                </div>
                )}
              </div>
            </div>

          

            {/* Notes & Files */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
              <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Notes & Files</h3>
              <div className="py-4 justify-center items-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                {editingField === 'notes' ? (
                  <>
                    <textarea
                      className="w-full border border-[var(--sf-border-light)] rounded p-2 mb-2"
                      rows={4}
                      value={formData.notes}
                      onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        className="px-3 py-1 text-[var(--sf-text-secondary)] border border-[var(--sf-border-light)] rounded"
                        onClick={() => setEditingField(null)}
                      >Cancel</button>
                      <button
                        className="px-3 py-1 bg-[var(--sf-blue-500)] text-white rounded"
                        onClick={handleSave}
                      >Save</button>
                    </div>
                  </>
                ) : (
                  <>
                    {canViewCustomerNotes(user) ? (
                      <>
                        <p className="text-[var(--sf-text-primary)] mb-2 whitespace-pre-line min-h-[48px] text-center">
                          {job.notes || <span style={{fontFamily: 'Montserrat', fontWeight: 500}} className="text-[var(--sf-text-secondary)]">No internal job or customer notes </span>}<br/>
                          {job.notes || <span className="text-[var(--sf-text-muted)] text-xs">Notes and attachments are only visible to employees with appropriate permissions. </span>}
                        </p>
                        <button
                          className="px-3 py-1 border border-[var(--sf-border-light)] border-dashed text-blue-500 rounded hover:text-[var(--sf-blue-500)] hover:border-blue-500 flex items-center justify-self-center space-x-2"
                          onClick={() => setEditingField('notes')}
                        >
                          <Plus className="w-4 h-4" />
                          <span>{job.notes ? "Edit Note" : "Add Note"}</span>
                        </button>
                      </>
                    ) : (
                      <p className="text-[var(--sf-text-muted)] mb-2 whitespace-pre-line min-h-[48px] text-center text-sm italic">
                        Customer notes are not available. You don't have permission to view customer notes.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Customer Notifications */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
              <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Customer notifications</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-medium text-[var(--sf-text-secondary)] mb-3">NOTIFICATION PREFERENCES</h4>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--sf-text-primary)]">Emails</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={emailNotifications}
                          onChange={(e) => handleNotificationToggle('email', e.target.checked)}
                          disabled={loading}
                          className="sr-only peer" 
                        />
                        <div className={`w-9 h-5 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${emailNotifications ? 'bg-[var(--sf-blue-500)] peer-checked:after:translate-x-full peer-checked:after:border-white' : 'bg-gray-200'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                      </label>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${!userTwilioConnected ? 'text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-primary)]'}`}>
                        Text messages
                        {!userTwilioConnected && <span className="text-xs block text-red-500">(Twilio not connected)</span>}
                      </span>
                      <label className={`relative inline-flex items-center ${!userTwilioConnected ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          checked={smsNotifications}
                          onChange={(e) => handleNotificationToggle('sms', e.target.checked)}
                          disabled={loading || !userTwilioConnected}
                          className="sr-only peer" 
                        />
                        <div className={`w-9 h-5 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${smsNotifications ? 'bg-[var(--sf-blue-500)] peer-checked:after:translate-x-full peer-checked:after:border-white' : 'bg-gray-200'} ${loading || !userTwilioConnected ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--sf-border-light)]">
                  <div className="flex items-start space-x-3 items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-[var(--sf-blue-500)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between ">
                        <span className="text-xs text-[var(--sf-text-muted)]">Confirmation</span>
                       
                      </div>
                      <p className="text-sm font-semibold text-[var(--sf-text-primary)] ">Appointment Confirmation</p>
                      <p className="text-xs text-[var(--sf-text-muted)]">
                        {job.confirmation_sent && job.confirmation_sent_at
                          ? `${getTimeAgo(job.confirmation_sent_at)} • Email Sent`
                          : job.confirmation_failed
                            ? `Failed to send: ${job.confirmation_error || 'Unknown error'}`
                            : !emailNotifications && !smsNotifications
                              ? "Notifications are disabled for this customer"
                              : "Not sent yet"}
                      </p>
                    </div>
                    <div className="relative" ref={confirmationMenuRef}>
                          <button
                            onClick={() => setOpenNotificationMenu(openNotificationMenu === 'confirmation' ? null : 'confirmation')}
                            className="w-8 h-8 rounded-full bg-[var(--sf-bg-page)] hover:bg-gray-200 flex items-center justify-center transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-[var(--sf-blue-500)]" />
                          </button>
                          {openNotificationMenu === 'confirmation' && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--sf-border-light)] py-1 min-w-[180px] z-50">
                              <button
                                onClick={() => {
                                  setViewingMessageType('confirmation')
                                  setShowMessageViewer(true)
                                  setOpenNotificationMenu(null)
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-page)] transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                View Message
                              </button>
                              <button
                                onClick={() => {
                                  setNotificationType('confirmation')
                                  const hasEmail = job.customer_email && job.customer_email.trim() !== ''
                                  if (hasEmail && emailNotifications) {
                                    setSelectedNotificationMethod('email')
                                    setNotificationEmail(job.customer_email || '')
                                  } else if (smsNotifications) {
                                    setSelectedNotificationMethod('sms')
                                    setNotificationPhone(job.customer_phone || '')
                                  } else if (emailNotifications) {
                                    setSelectedNotificationMethod('email')
                                    setNotificationEmail(job.customer_email || '')
                                  }
                                  setShowNotificationModal(true)
                                  setOpenNotificationMenu(null)
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-page)] transition-colors"
                                disabled={!emailNotifications && !smsNotifications}
                              >
                                <RotateCw className="w-4 h-4" />
                                Resend Email
                              </button>
                            </div>
                          )}
                        </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--sf-border-light)]">
                  <div className="flex items-start space-x-3 items-center">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center  flex-shrink-0">
                      <Mail className="w-5 h-5 text-[var(--sf-blue-500)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--sf-text-muted)]">Reminder</span>
                        
                      </div>
                      <p className="text-sm font-semibold text-[var(--sf-text-primary)] ">Appointment Reminder</p>
                      <p className="text-xs text-[var(--sf-text-muted)]">
                        {job.reminder_sent && job.reminder_sent_at
                          ? `${getTimeAgo(job.reminder_sent_at)} • Email Sent`
                          : job.reminder_failed
                            ? `Failed to send: ${job.reminder_error || 'Unknown error'}`
                            : !emailNotifications && !smsNotifications
                              ? "Notifications are disabled for this customer"
                              : "Scheduled for 2 hours before appointment"}
                      </p>
                    </div>
                    <div className="relative" ref={reminderMenuRef}>
                          <button
                            onClick={() => setOpenNotificationMenu(openNotificationMenu === 'reminder' ? null : 'reminder')}
                            className="w-8 h-8 rounded-full bg-[var(--sf-bg-page)] hover:bg-gray-200 flex items-center justify-center transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-[var(--sf-blue-500)]" />
                          </button>
                          {openNotificationMenu === 'reminder' && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[var(--sf-border-light)] py-1 min-w-[180px] z-50">
                              <button
                                onClick={() => {
                                  setViewingMessageType('reminder')
                                  setShowMessageViewer(true)
                                  setOpenNotificationMenu(null)
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-page)] transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                                View Message
                              </button>
                              <button
                                onClick={() => {
                                  setNotificationType('reminder')
                                  const hasEmail = job.customer_email && job.customer_email.trim() !== ''
                                  if (hasEmail && emailNotifications) {
                                    setSelectedNotificationMethod('email')
                                    setNotificationEmail(job.customer_email || '')
                                  } else if (smsNotifications) {
                                    setSelectedNotificationMethod('sms')
                                    setNotificationPhone(job.customer_phone || '')
                                  } else if (emailNotifications) {
                                    setSelectedNotificationMethod('email')
                                    setNotificationEmail(job.customer_email || '')
                                  }
                                  setShowNotificationModal(true)
                                  setOpenNotificationMenu(null)
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-page)] transition-colors"
                                disabled={!emailNotifications && !smsNotifications}
                              >
                                <RotateCw className="w-4 h-4" />
                                Resend Email
                              </button>
                            </div>
                          )}
                        </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--sf-border-light)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-[var(--sf-text-primary)]">Custom Notifications</h4>
                      <p className="text-xs text-[var(--sf-text-muted)]">Send custom messages to customer</p>
                    </div>
                    <button 
                      onClick={() => {
                        setCustomMessageEmail(job.customer_email || '')
                        setCustomMessage('')
                        setShowCustomMessageModal(true)
                      }}
                      className="px-3 py-1 bg-[var(--sf-blue-500)] text-white rounded text-xs hover:bg-[var(--sf-blue-600)]"
                    >
                      Send Message
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Feedback */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
              <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Customer feedback</h3>
              
              <p className="text-sm text-[var(--sf-text-secondary)] mb-2">
                An email will be sent to the customer asking them to rate the service after the job is marked complete.
              </p>
              <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium">
                Learn more.
              </button>
            </div>

            {/* Conversion Summary */}
            <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
              <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Conversion summary</h3>
              
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-[var(--sf-bg-page)] rounded-full flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6 text-[var(--sf-text-muted)]" />
                </div>
                <p className="text-[var(--sf-text-muted)] text-sm">No conversion data available</p>
              </div>
            </div>
          </div>
          

       

          {/* Mobile Navigation Bar */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--sf-border-light)] z-30">
            <div className="flex items-center justify-around py-2">
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="flex flex-col items-center space-y-1 px-3 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-blue-500)] transition-colors"
              >
                <User className="w-5 h-5" />
                <span className="text-xs font-medium">Customer</span>
              </button>
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="flex flex-col items-center space-y-1 px-3 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-blue-500)] transition-colors"
              >
                <Users className="w-5 h-5" />
                <span className="text-xs font-medium">Team</span>
              </button>
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="flex flex-col items-center space-y-1 px-3 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-blue-500)] transition-colors"
              >
                <DollarSign className="w-5 h-5" />
                <span className="text-xs font-medium">Invoice</span>
              </button>
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="flex flex-col items-center space-y-1 px-3 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-blue-500)] transition-colors"
              >
                <Settings className="w-5 h-5" />
                <span className="text-xs font-medium">More</span>
              </button>
            </div>
          </div>

          {/* Mobile Sidebar */}
          {showMobileSidebar && (
            <>
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-[9997] lg:hidden" 
                onClick={() => setShowMobileSidebar(false)}
              />
              <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-[9997] lg:hidden overflow-y-auto">
                <div className="p-4 border-b border-[var(--sf-border-light)]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Job Details</h2>
                    <button
                      onClick={() => setShowMobileSidebar(false)}
                      className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
                <div className="p-2 space-y-2">
                  {/* Customer Card */}
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-1">
                    <h3 style={{fontFamily: 'Montserrat', fontWeight: 500}} className="font-semibold text-[var(--sf-text-primary)] mb-4 text-xs">Customer</h3>
                    
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">{getCustomerInitials()}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--sf-text-primary)]">
                          {job.customer_first_name} {job.customer_last_name}
                        </p>
                      </div>
                    </div>

                    {/* Contact Info - Phone and Email (conditional based on permission) */}
                    {canViewCustomerContact(user) ? (
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="w-4 h-4 text-[var(--sf-text-muted)]" />
                          <span className="text-[var(--sf-text-primary)]">
                            {formatPhoneNumber(job.customer_phone)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <Mail className="w-4 h-4 text-[var(--sf-text-muted)]" />
                          <span className="text-[var(--sf-text-primary)] truncate">
                            {job.customer_email}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--sf-text-muted)] italic">Contact information not available</p>
                    )}
                  </div>

                  {/* Job Requirements Section */}
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
                    <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Job Requirements</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Workers needed</span>
                        <span className="font-medium">{job.workers_needed || 1} service provider</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Skills needed</span>
                        <span className="font-medium text-right max-w-xs">
                          {job.skills && job.skills.length ? job.skills.join(', ') : 'No skill tags required'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Intake questions</span>
                        <span className="font-medium">
                          {(() => {
                            const intakeQuestions = getServiceIntakeQuestions();
                            const count = intakeQuestions ? intakeQuestions.length : 0;
                            return count > 0 ? `${count} question${count !== 1 ? 's' : ''}` : 'No questions';
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Intake Questions & Answers */}
                  <IntakeAnswersDisplay intakeAnswers={job.intake_answers || []} />

                  {/* Notes & Files */}
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
                    <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Notes & Files</h3>
                    <div className="py-4">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-[var(--sf-text-primary)] mb-2 whitespace-pre-line min-h-[48px]">
                        {job.notes || <span className="text-[var(--sf-text-muted)]">No notes</span>}
                      </p>
                      <button
                        className="px-3 py-1 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded hover:bg-[var(--sf-bg-page)] flex items-center space-x-2"
                        onClick={() => setEditingField('notes')}
                      >
                        <Edit className="w-4 h-4" />
                        <span>{job.notes ? "Edit Note" : "Add Note"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Customer Notifications */}
                  <div className="bg-white rounded-xl border border-[var(--sf-border-light)] shadow-sm p-4">
                    <h3 className="font-semibold text-[var(--sf-text-primary)] mb-4">Customer notifications</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-[var(--sf-text-primary)] mb-3">NOTIFICATION PREFERENCES</h4>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--sf-text-primary)]">Emails</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={emailNotifications}
                                onChange={(e) => handleNotificationToggle('email', e.target.checked)}
                                disabled={loading}
                                className="sr-only peer" 
                              />
                              <div className={`w-9 h-5 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${emailNotifications ? 'bg-[var(--sf-blue-500)] peer-checked:after:translate-x-full peer-checked:after:border-white' : 'bg-gray-200'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                            </label>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className={`text-sm ${!userTwilioConnected ? 'text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-primary)]'}`}>
                              Text messages
                              {!userTwilioConnected && <span className="text-xs block text-red-500">(Twilio not connected)</span>}
                            </span>
                            <label className={`relative inline-flex items-center ${!userTwilioConnected ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input 
                                type="checkbox" 
                                checked={smsNotifications}
                                onChange={(e) => handleNotificationToggle('sms', e.target.checked)}
                                disabled={loading || !userTwilioConnected}
                                className="sr-only peer" 
                              />
                              <div className={`w-9 h-5 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${smsNotifications ? 'bg-[var(--sf-blue-500)] peer-checked:after:translate-x-full peer-checked:after:border-white' : 'bg-gray-200'} ${loading || !userTwilioConnected ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
        </div>

    {/* Modals - Rendered outside main container for proper z-index stacking */}
        {/* Reschedule Modal */}
        {showRescheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Reschedule Job</h3>
                  <button
                    onClick={() => setShowRescheduleModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Date</label>
                    <input
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Time</label>
                    <input
                      type="time"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
                  <button
                    onClick={() => setShowRescheduleModal(false)}
                    className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReschedule}
                    className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] order-1 sm:order-2"
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal — optional financial adjustments */}
        {showCancelModal && (
          <CancelJobModal
            job={job}
            teamMembers={teamMembers}
            onClose={() => setShowCancelModal(false)}
            onCancelled={(result) => {
              setJob(prev => ({
                ...prev,
                status: 'cancelled',
                cancellation_fee: result.cancellation_fee,
                cancellation_fee_status: result.cancellation_fee_status,
              }))
              setSuccessMessage('Job cancelled')
              setTimeout(() => setSuccessMessage(''), 3000)
              setShowCancelModal(false)
            }}
            onError={(msg) => setError(msg || 'Failed to cancel job')}
          />
        )}

        {/* Edit Service Modal */}
        {showEditServiceModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="p-6 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-[var(--sf-text-primary)]">Edit Job</h3>
                  <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowEditServiceModal(false);
                      setShowDurationEditor(false);
                        setOriginalJobData(null);
                      if (originalJobData) {
                        setJob(prev => ({
                          ...prev,
                          service_modifiers: originalJobData.service_modifiers
                        }));
                      }
                    }}
                      className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveService}
                      className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] text-sm font-medium"
                    >
                      Save Job
                  </button>
                </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Services Section */}
                  <div>
                    <h4 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">Services</h4>
                    
                    {/* Search and Add Options */}
                    <div className="space-y-3 mb-6">
                      <div className="relative">
                    <input
                      type="text"
                          placeholder="Search services..."
                          className="w-full px-4 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                        <Search className="absolute right-3 top-2.5 w-4 h-4 text-[var(--sf-text-muted)]" />
                  </div>
                      <div className="flex space-x-2">
                        <button className="px-3 py-2 text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] text-sm font-medium border border-blue-200 rounded-lg">
                          Add Custom Service or Item
                        </button>
                        <button className="px-3 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] text-sm font-medium border border-[var(--sf-border-light)] rounded-lg">
                          Browse Services
                        </button>
                    </div>
                  </div>
                  
                    {/* Service List */}
                    <div className="border border-[var(--sf-border-light)] rounded-lg">
                      <div className="px-4 py-3 bg-[var(--sf-bg-page)] border-b border-[var(--sf-border-light)]">
                        <div className="grid grid-cols-2 gap-4 text-sm font-medium text-[var(--sf-text-secondary)]">
                          <span>SERVICE</span>
                          <span>PRICE</span>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between py-3 border-b border-[var(--sf-border-light)]">
                  <div>
                            <p className="font-medium text-[var(--sf-text-primary)]">{decodeHtmlEntities(job.service_name || '')}</p>
                            <button
                              onClick={() => setShowDurationEditor(prev => !prev)}
                              className="px-3 py-1 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded hover:bg-[var(--sf-bg-page)] flex items-center space-x-2 text-sm font-medium"
                            >
                              <Edit className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => setShowDurationEditor(prev => !prev)}
                              className="text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] text-sm ml-4"
                            >
                              {showDurationEditor ? 'Hide details' : 'Show details'} &gt;
                            </button>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-[var(--sf-text-primary)]">${(parseFloat(formData.service_price) || parseFloat(job.service_price) || 0).toFixed(2)}</span>
                            <button
                              onClick={() => setShowDurationEditor(true)}
                              className="p-1 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Service Details Editor */}
                        {showDurationEditor && (
                          <div className="mt-3 p-4 bg-[var(--sf-bg-page)] rounded-lg border border-[var(--sf-border-light)] space-y-4">
                            {/* Duration */}
                            <div>
                              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Duration</label>
                              <div className="flex items-center space-x-2">
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={Math.floor((formData.duration || 0) / 60)}
                                    onChange={e => {
                                      const hours = parseInt(e.target.value) || 0;
                                      const currentMins = (formData.duration || 0) % 60;
                                      setFormData(prev => ({ ...prev, duration: hours * 60 + currentMins }));
                                    }}
                                    className="w-16 px-2 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] text-center"
                                  />
                                  <span className="text-sm text-[var(--sf-text-secondary)]">hrs</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    value={(formData.duration || 0) % 60}
                                    onChange={e => {
                                      const mins = Math.min(59, parseInt(e.target.value) || 0);
                                      const currentHours = Math.floor((formData.duration || 0) / 60);
                                      setFormData(prev => ({ ...prev, duration: currentHours * 60 + mins }));
                                    }}
                                    className="w-16 px-2 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)] text-center"
                                  />
                                  <span className="text-sm text-[var(--sf-text-secondary)]">min</span>
                                </div>
                              </div>
                            </div>

                            {/* Service Price (base price of the service itself) */}
                            <div>
                              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Service Price</label>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={formData.service_price === 0 ? "" : formData.service_price}
                                  onFocus={e => { if (e.target.value === "0" || e.target.value === "0.00") e.target.value = ""; }}
                                  onChange={e => {
                                    const newPrice = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, service_price: newPrice }));
                                  }}
                                  className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>

                            {/* Additional Fees */}
                            <div>
                              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Additional Fees</label>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={formData.additional_fees === 0 ? "" : formData.additional_fees}
                                  onFocus={e => { if (e.target.value === "0" || e.target.value === "0.00") e.target.value = ""; }}
                                  onChange={e => {
                                    const val = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, additional_fees: val }));
                                  }}
                                  className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>

                            {/* Taxes */}
                            <div>
                              <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Taxes</label>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={formData.taxes === 0 ? "" : formData.taxes}
                                  onFocus={e => { if (e.target.value === "0" || e.target.value === "0.00") e.target.value = ""; }}
                                  onChange={e => {
                                    const val = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, taxes: val }));
                                  }}
                                  className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Customize Price */}
                        <div className="mt-4 p-3 bg-[var(--sf-blue-50)] rounded-lg border border-blue-200">
                          <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Customize price</label>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                    <input
                      type="number"
                          step="0.01"
                          value={formData.service_price === 0 ? "" : formData.service_price}
                              onFocus={e => {
                                if (e.target.value === "0" || e.target.value === "0.00") {
                                  e.target.value = "";
                                }
                              }}
                          onChange={e => {
                            const newPrice = e.target.value === "" ? 0 : parseFloat(e.target.value) || 0;
                                setFormData(prev => ({
                                ...prev, 
                                service_price: newPrice
                                }));
                              }}
                              className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                          placeholder="0.00"
                        />
                            <button className="text-sm text-red-600 hover:text-red-800">Reset</button>
                      </div>
                          <div className="flex space-x-2 mt-2">
                            <button 
                              onClick={() => setShowEditServiceModal(false)}
                              className="px-3 py-1 text-sm text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={handleSaveService}
                              className="px-3 py-1 text-sm bg-[var(--sf-blue-500)] text-white rounded hover:bg-[var(--sf-blue-600)]"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Cost Breakdown */}
                    <div className="mt-6 space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Subtotal</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${(parseFloat(formData.service_price) || parseFloat(job?.service_price) || 0).toFixed(2)}</span>
                      </div>
                      {parseFloat(job.discount || 0) > 0 ? (
                        <div className="flex justify-between items-center py-2">
                          <button onClick={() => { setFormData(prev => ({ ...prev, discountInput: parseFloat(job.discount).toFixed(2) })); setShowDiscountModal(true); }} className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]">Discount</button>
                          <span className="text-sm font-medium text-red-600">-${parseFloat(job.discount).toFixed(2)}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDiscountModal(true)}
                          className="text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]"
                        >
                          Add Discount
                        </button>
                      )}
                      <div className="flex justify-between items-center py-2 border-t border-[var(--sf-border-light)]">
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">Total</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${Math.max(0, (parseFloat(formData.service_price) || parseFloat(job?.service_price) || 0) - (parseFloat(job?.discount) || 0)).toFixed(2)}</span>
                      </div>
                      {jobFees > 0 && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Fee</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${jobFees.toFixed(2)}</span>
                      </div>
                      )}
                      {jobTaxes > 0 && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Taxes</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${jobTaxes.toFixed(2)}</span>
                      </div>
                      )}
                      {(jobFees > 0 || jobTaxes > 0) && (
                      <div className="flex justify-between items-center py-2 border-t border-[var(--sf-border-light)]">
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">Total due</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${getEditServiceModalTotal().toFixed(2)}</span>
                      </div>
                      )}
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Tip</span>
                        <button
                          onClick={() => { setError(''); const curTip = parseFloat(job?.tip_amount) || 0; setFormData(prev => ({ ...prev, tipInput: curTip > 0 ? curTip.toFixed(2) : '' })); setShowTipModal(true); }}
                          className={`text-sm font-medium ${displayTip > 0 ? 'text-green-600 hover:text-green-700' : 'text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)]'}`}
                        >
                          {displayTip > 0 ? `+$${displayTip.toFixed(2)}` : 'Add Tip'}
                        </button>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Incentives</span>
                        <button
                          onClick={() => { setError(''); const curIncentive = parseFloat(job?.incentive_amount) || 0; setFormData(prev => ({ ...prev, incentiveInput: curIncentive > 0 ? curIncentive.toFixed(2) : '' })); setShowIncentiveModal(true); }}
                          className={`text-sm font-medium ${displayIncentive > 0 ? 'text-purple-600 hover:text-purple-700' : 'text-purple-600 hover:text-purple-700'}`}
                        >
                          {displayIncentive > 0 ? `+$${displayIncentive.toFixed(2)}` : 'Add Incentive'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Section */}
                      <div>
                    <h4 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">Summary</h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Previous Total</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${getEditServiceModalTotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-[var(--sf-border-light)]">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Updated Total</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">${getEditServiceModalTotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[var(--sf-text-secondary)]">Estimated duration</span>
                        <span className="text-sm font-medium text-[var(--sf-text-primary)]">{formatDuration(formData.duration || job.duration || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Address Modal */}
        {showEditAddressModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Edit Address</h3>
                  <button
                    onClick={() => setShowEditAddressModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Copy Customer Address Button */}
                {job && (job.customer_address || job.customer_city || job.customer_state || job.customer_zip_code) && (
                  <div className="flex items-center justify-between p-3 bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg mb-4">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-[var(--sf-blue-500)] mr-2" />
                      <div>
                        <p className="text-sm font-medium text-blue-900">Customer Address Available</p>
                        <p className="text-xs text-[var(--sf-blue-500)]">
                          {job.customer_address || `${job.customer_city}, ${job.customer_state} ${job.customer_zip_code}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={copyCustomerAddressToService}
                      className="px-3 py-1 text-xs font-medium text-[var(--sf-blue-500)] bg-white border border-blue-300 rounded-md hover:bg-[var(--sf-blue-50)] focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue-500)]"
                    >
                      Copy Address
                    </button>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Street Address
                      {addressAutoPopulated && formData.serviceAddress.street && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Auto-filled
                        </span>
                      )}
                    </label>
                    <AddressAutocomplete
                      value={formData.serviceAddress.street}
                      onChange={(value) => {
                        // Only update street if user is typing manually (not from address selection)
                        setFormData(prev => ({
                          ...prev,
                          serviceAddress: {
                            ...prev.serviceAddress,
                            street: value
                          }
                        }));
                      }}
                      onAddressSelect={(addressData) => {
                        console.log('Address selected in job details:', addressData);
                        setFormData(prev => {
                          const updatedFormData = {
                            ...prev,
                            serviceAddress: {
                              street: addressData.formattedAddress || '',
                              city: addressData.components.city || '',
                              state: addressData.components.state || '',
                              zipCode: addressData.components.zipCode || ''
                            }
                          };
                          console.log('🔄 Job Details: Updated form data after address selection:', updatedFormData);
                          return updatedFormData;
                        });
                        setAddressAutoPopulated(true);
                      }}
                      placeholder={job?.service_address_street || "Start typing address..."}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      City
                      {addressAutoPopulated && formData.serviceAddress.city && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Auto-filled
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formData.serviceAddress.city}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        serviceAddress: {
                          ...prev.serviceAddress,
                          city: e.target.value
                        }
                      }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      placeholder={job?.service_address_city || "Enter city"}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                        State
                        {addressAutoPopulated && formData.serviceAddress.state && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Auto-filled
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={formData.serviceAddress.state}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          serviceAddress: {
                            ...prev.serviceAddress,
                            state: e.target.value
                          }
                        }))}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder={job?.service_address_state || "Enter state"}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                        ZIP Code
                        {addressAutoPopulated && formData.serviceAddress.zipCode && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Auto-filled
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={formData.serviceAddress.zipCode}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          serviceAddress: {
                            ...prev.serviceAddress,
                            zipCode: e.target.value
                          }
                        }))}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder={job?.service_address_zip || "Enter ZIP code"}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
                  <button
                    onClick={() => setShowEditAddressModal(false)}
                    className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleSave()
                      setShowEditAddressModal(false)
                    }}
                    className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] order-1 sm:order-2"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Send Invoice Modal */}
        {showSendInvoiceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-[var(--sf-text-primary)]">Email Invoice</h3>
                  <button
                    onClick={() => {
                      setShowSendInvoiceModal(false);
                      setManualEmail('');
                    }}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Payment Link Option */}
                  <div className={`flex items-center justify-between p-4 rounded-lg ${stripeConnected ? 'bg-[var(--sf-bg-page)]' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex-1">
                      <h4 className="font-medium text-[var(--sf-text-primary)]">Include a link to pay this invoice online</h4>
                      <p className="text-sm text-[var(--sf-text-secondary)]">
                        {stripeConnected 
                          ? 'Allow customer to pay directly via Stripe' 
                          : 'Stripe is not connected. Please connect Stripe in Settings to enable online payments.'
                        }
                      </p>
                      {!stripeConnected && (
                        <button
                          onClick={async () => {
                            try {
                              console.log('🔄 Refreshing Stripe status...')
                              const response = await stripeAPI.testConnection()
                              console.log('🔄 Stripe refresh response:', response)
                              setStripeConnected(response.connected)
                              if (response.connected) {
                                setIncludePaymentLink(true)
                              }
                            } catch (error) {
                              console.error('Error refreshing Stripe status:', error)
                            }
                          }}
                          className="mt-2 text-sm text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] underline"
                        >
                          Refresh Stripe Status
                        </button>
                      )}
                    </div>
                    <label className={`relative inline-flex items-center ${stripeConnected ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={includePaymentLink}
                        disabled={!stripeConnected}
                        onChange={(e) => setIncludePaymentLink(e.target.checked)}
                      />
                      <div className={`w-11 h-6 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--sf-blue-500)] ${stripeConnected ? 'bg-gray-200' : 'bg-gray-300'}`}></div>
                    </label>
                  </div>

                  {/* Email Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Send to</label>
                    <input
                      type="email"
                      value={manualEmail || job.customer_email || ''}
                      onChange={(e) => setManualEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      placeholder="Enter email address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Subject</label>
                    <input
                      type="text"
                        defaultValue={`You have a new invoice from ${user?.business_name || 'Your Business'}`}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  </div>

                  {/* Invoice Summary */}
                  <div className="bg-[var(--sf-bg-page)] rounded-lg p-4">
                    <h4 className="font-medium text-[var(--sf-text-primary)] mb-4">Invoice Summary</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--sf-text-secondary)]">AMOUNT DUE</span>
                        <span className="font-semibold">${displayServiceTotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--sf-text-secondary)]">DUE BY</span>
                        <span className="text-sm">{new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--sf-text-secondary)]">SERVICE DATE</span>
                        <span className="text-sm">{new Date(job.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--sf-text-secondary)]">SERVICE ADDRESS</span>
                        <span className="text-sm">{job.customer_address || 'Address not provided'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Service Details */}
                  <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-4">
                    <h4 className="font-medium text-[var(--sf-text-primary)] mb-3">Service Details</h4>
                    <div className="space-y-2">
                      {job.service_names && job.service_names.length > 0 ? (
                        job.service_names.map((service, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span>{decodeHtmlEntities(service || '')}</span>
                            <span>${job.service_prices && job.service_prices[index] ? job.service_prices[index].toFixed(2) : '0.00'}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between text-sm">
                          <span>{job.service_name || 'Service'}</span>
                          <span>${calculateTotalPrice().toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-4">
                    <h4 className="font-medium text-[var(--sf-text-primary)] mb-3">Financial Summary</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Subtotal</span>
                        <span>${subtotalDisplay.toFixed(2)}</span>
                      </div>
                      {jobDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Discount</span>
                        <span className="text-red-600">-${jobDiscount.toFixed(2)}</span>
                      </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span>Total</span>
                        <span>${totalAfterDiscount.toFixed(2)}</span>
                      </div>
                      {jobFees > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Fee</span>
                        <span>${jobFees.toFixed(2)}</span>
                      </div>
                      )}
                      {jobTaxes > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Taxes</span>
                        <span>${jobTaxes.toFixed(2)}</span>
                      </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-2">
                        <span>Total Due</span>
                        <span className={isPaidOrFree ? 'text-green-600' : 'text-red-600'}>
                          ${displayTotalDue.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Amount Paid</span>
                        <span>${effectiveAmountPaid.toFixed(2)}</span>
                      </div>
                      {displayTip > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Tip</span>
                        <span className="text-green-600">+${displayTip.toFixed(2)}</span>
                      </div>
                      )}
                      {displayIncentive > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Incentives</span>
                        <span className="text-purple-600">+${displayIncentive.toFixed(2)}</span>
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Closing Message */}
                  <div className="text-center text-sm text-[var(--sf-text-secondary)]">
                    We appreciate your business.
                  </div>

                  {/* Pay Invoice Button (if payment link is enabled) */}
                  {includePaymentLink && (
                    <div className="text-center">
                      <button className="px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-colors">
                        Pay Invoice
                      </button>
                </div>
                  )}

                  {/* Test Email Button */}
                  <div className="text-center">
                    <button 
                      onClick={handleTestEmail}
                      className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
                    >
                      Test Email
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6 pt-4 border-t">
                  <button
                    onClick={() => {
                      setShowSendInvoiceModal(false);
                      setManualEmail('');
                    }}
                    className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendInvoice}
                    className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] order-1 sm:order-2"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Required Modal */}
        {showEmailRequiredModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Email Required</h3>
                <button
                  onClick={() => {
                    setShowEmailRequiredModal(false);
                    setPendingAction(null);
                  }}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-[var(--sf-text-secondary)]">
                  This customer doesn't have an email address. Please provide an email to {pendingAction === 'send' ? 'send the invoice' : 'resend the notification'}.
                </p>
                
                <div>
                  <label htmlFor="customer-email" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Customer Email
                  </label>
                  <input
                    type="email"
                    id="customer-email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    placeholder="Enter customer email address"
                    required
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowEmailRequiredModal(false);
                      setPendingAction(null);
                      setManualEmail('');
                    }}
                    className="flex-1 px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (manualEmail.trim()) {
                        if (pendingAction === 'send') {
                          setShowSendInvoiceModal(true);
                        } else if (pendingAction === 'resend') {
                          setSuccessMessage('Confirmation sent to customer!');
                          setTimeout(() => setSuccessMessage(""), 3000);
                        }
                        setShowEmailRequiredModal(false);
                        setPendingAction(null);
                      } else {
                        setError('Please enter a valid email address');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                  >
                    {pendingAction === 'send' ? 'Send Invoice' : 'Resend'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Customer Modal - Desktop View */}
        {showEditCustomerModal && (
          <div className="hidden lg:flex fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Edit Customer</h3>
                <button
                  onClick={() => setShowEditCustomerModal(false)}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-first-name" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="edit-first-name"
                    value={editCustomerData.firstName}
                    onChange={(e) => setEditCustomerData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div>
                  <label htmlFor="edit-last-name" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="edit-last-name"
                    value={editCustomerData.lastName}
                    onChange={(e) => setEditCustomerData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                </div>
                
                <div>
                  <label htmlFor="edit-email" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="edit-email"
                    value={editCustomerData.email}
                    onChange={(e) => setEditCustomerData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    placeholder="Enter email address"
                  />
                </div>
                
                <div>
                  <label htmlFor="edit-phone" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="edit-phone"
                    value={editCustomerData.phone}
                    onChange={(e) => setEditCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    placeholder="Enter phone number"
                  />
                </div>

                <div>
                  <label htmlFor="edit-source" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                    Source
                  </label>
                  <input
                    type="text"
                    id="edit-source"
                    value={editCustomerData.source ?? ''}
                    onChange={(e) => setEditCustomerData(prev => ({ ...prev, source: e.target.value }))}
                    className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    placeholder="e.g. Website, Referral"
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setShowEditCustomerModal(false)}
                    className="flex-1 px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      // Frontend validation
                      if (editCustomerData.firstName && editCustomerData.firstName.trim() && (editCustomerData.firstName.trim().length < 2 || editCustomerData.firstName.trim().length > 50)) {
                        setError('First name must be between 2 and 50 characters');
                        return;
                      }
                      
                      if (editCustomerData.lastName && editCustomerData.lastName.trim() && (editCustomerData.lastName.trim().length < 2 || editCustomerData.lastName.trim().length > 50)) {
                        setError('Last name must be between 2 and 50 characters');
                        return;
                      }
                      
                      if (editCustomerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editCustomerData.email)) {
                        setError('Please enter a valid email address');
                        return;
                      }

                      try {
                        setLoading(true);
                        setError(''); // Clear any previous errors
                        
                        const response = await api.put(`/customers/${job.customer_id}`, {
                          firstName: editCustomerData.firstName,
                          lastName: editCustomerData.lastName,
                          email: editCustomerData.email,
                          phone: editCustomerData.phone,
                          source: editCustomerData.source ?? ''
                        });

                        console.log('✅ Customer updated successfully:', response.data);
                        
                        // Update the job data with new customer info
                        setJob(prev => ({
                          ...prev,
                          customer_first_name: editCustomerData.firstName,
                          customer_last_name: editCustomerData.lastName,
                          customer_email: editCustomerData.email,
                          customer_phone: editCustomerData.phone,
                          customer_source: editCustomerData.source ?? ''
                        }));

                        setSuccessMessage('Customer updated successfully!');
                        setTimeout(() => setSuccessMessage(""), 3000);
                        setShowEditCustomerModal(false);
                      } catch (error) {
                        console.error('❌ Error updating customer:', error);
                        setError(`Failed to update customer: ${error.response?.data?.error || error.message}`);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notification Modal - Desktop View (for sending notifications) */}
        {showNotificationModal && notificationType && (
          <div className="hidden lg:flex fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-[var(--sf-text-primary)]">
                    {notificationType === 'confirmation' ? 'Appointment Confirmation' : 'Appointment Reminder'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowNotificationModal(false);
                      setNotificationType(null);
                      setNotificationEmail('');
                    }}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Notification Method Selection */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-3">
                      Send via
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          if (emailNotifications) {
                            setSelectedNotificationMethod('email')
                            setNotificationEmail(job.customer_email || '')
                          }
                        }}
                        disabled={!emailNotifications}
                        className={`p-3 border rounded-lg text-center transition-colors ${
                          !emailNotifications
                            ? 'border-[var(--sf-border-light)] bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] cursor-not-allowed'
                            : selectedNotificationMethod === 'email'
                            ? 'border-blue-500 bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)]'
                            : 'border-[var(--sf-border-light)] hover:border-gray-400'
                        }`}
                        title={!emailNotifications ? 'Email notifications are disabled' : ''}
                      >
                        <Mail className={`w-5 h-5 mx-auto mb-1 ${!emailNotifications ? 'text-[var(--sf-text-muted)]' : ''}`} />
                        <div className={`text-sm font-medium ${!emailNotifications ? 'text-[var(--sf-text-muted)]' : ''}`}>
                          Email
                          {!emailNotifications && <span className="text-xs block text-red-500">(Disabled)</span>}
                        </div>
                        <div className="text-xs text-[var(--sf-text-muted)]">Send via email</div>
                      </button>
                      <button
                        onClick={() => {
                          if (smsNotifications) {
                            setSelectedNotificationMethod('sms')
                            setNotificationPhone(job.customer_phone || '')
                          }
                        }}
                        disabled={!smsNotifications}
                        className={`p-3 border rounded-lg text-center transition-colors ${
                          !smsNotifications
                            ? 'border-[var(--sf-border-light)] bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] cursor-not-allowed'
                            : selectedNotificationMethod === 'sms'
                            ? 'border-blue-500 bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)]'
                            : 'border-[var(--sf-border-light)] hover:border-gray-400'
                        }`}
                        title={!smsNotifications ? 'SMS notifications are disabled' : ''}
                      >
                        <Phone className={`w-5 h-5 mx-auto mb-1 ${!smsNotifications ? 'text-[var(--sf-text-muted)]' : ''}`} />
                        <div className={`text-sm font-medium ${!smsNotifications ? 'text-[var(--sf-text-muted)]' : ''}`}>
                          SMS
                          {!smsNotifications && <span className="text-xs block text-red-500">(Disabled)</span>}
                        </div>
                        <div className="text-xs text-[var(--sf-text-muted)]">Send via text</div>
                      </button>
                    </div>
                  </div>

                  {/* Contact Information Input */}
                  {selectedNotificationMethod === 'email' ? (
                    <div>
                      <label htmlFor="notification-email" className={`block text-sm font-medium mb-2 ${
                        !emailNotifications ? 'text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-primary)]'
                      }`}>
                        Email Address
                        {!emailNotifications && <span className="text-red-500 ml-1">(Disabled)</span>}
                      </label>
                      <input
                        type="email"
                        id="notification-email"
                        value={notificationEmail}
                        onChange={(e) => setNotificationEmail(e.target.value)}
                        disabled={!emailNotifications}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-[var(--sf-blue-500)] ${
                          !emailNotifications 
                            ? 'border-[var(--sf-border-light)] bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] cursor-not-allowed' 
                            : 'border-[var(--sf-border-light)] focus:ring-[var(--sf-blue-500)]'
                        }`}
                        placeholder={!emailNotifications ? "Email notifications are disabled" : "Enter email address"}
                        required
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="notification-phone" className={`block text-sm font-medium mb-2 ${
                        !smsNotifications ? 'text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-primary)]'
                      }`}>
                        Phone Number
                        {!smsNotifications && <span className="text-red-500 ml-1">(Disabled)</span>}
                      </label>
                      <input
                        type="tel"
                        id="notification-phone"
                        value={notificationPhone}
                        onChange={(e) => setNotificationPhone(e.target.value)}
                        disabled={!smsNotifications}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-[var(--sf-blue-500)] ${
                          !smsNotifications 
                            ? 'border-[var(--sf-border-light)] bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] cursor-not-allowed' 
                            : 'border-[var(--sf-border-light)] focus:ring-[var(--sf-blue-500)]'
                        }`}
                        placeholder={!smsNotifications ? "SMS notifications are disabled" : "Enter phone number (e.g., +1234567890)"}
                        required
                      />
                      <p className={`text-xs mt-1 ${
                        !smsNotifications ? 'text-[var(--sf-text-muted)]' : 'text-[var(--sf-text-muted)]'
                      }`}>
                        {!smsNotifications ? "SMS notifications are disabled for this customer" : "Include country code (e.g., +1 for US)"}
                      </p>
                    </div>
                  )}

                  {/* Message Preview */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Message Preview
                    </label>
                    <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-4 max-h-60 overflow-y-auto">
                      {selectedNotificationMethod === 'email' ? (
                        // Email preview
                        notificationType === 'confirmation' ? (
                          <div className="space-y-3">
                            <div className="font-semibold text-[var(--sf-text-primary)]">
                              Hi {job?.customer_first_name || 'Customer'},
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              Your appointment has been confirmed for <strong>{new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })} at {formatTimeShared(job?.scheduled_date)}</strong>.
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              <strong>Service:</strong> {job?.service_name || 'Service'}
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              <strong>Location:</strong> {job?.service_address_street || 'Service Address'}, {job?.service_address_city || 'City'}, {job?.service_address_state || 'State'} {job?.service_address_zip || 'ZIP'}
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              We look forward to serving you!
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              Best regards,<br />
                              Your Service Team
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="font-semibold text-[var(--sf-text-primary)]">
                              Hi {job?.customer_first_name || 'Customer'},
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              This is a friendly reminder that you have an appointment scheduled for <strong>{new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })} at {formatTimeShared(job?.scheduled_date)}</strong>.
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              <strong>Service:</strong> {job?.service_name || 'Service'}
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              <strong>Location:</strong> {job?.service_address_street || 'Service Address'}, {job?.service_address_city || 'City'}, {job?.service_address_state || 'State'} {job?.service_address_zip || 'ZIP'}
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              Please arrive on time. If you need to reschedule, please contact us as soon as possible.
                            </div>
                            <div className="text-[var(--sf-text-primary)]">
                              Best regards,<br />
                              Your Service Team
                            </div>
                          </div>
                        )
                      ) : (
                        // SMS preview
                        notificationType === 'confirmation' ? (
                          <div className="text-[var(--sf-text-primary)]">
                            Hi {job?.customer_first_name || 'Customer'}! Your appointment is confirmed for {job?.service_name || 'Service'} on {new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              month: 'long', 
                              day: 'numeric' 
                            })} at {formatTimeShared(job?.scheduled_date)}. We'll see you soon! - Your Service Team
                          </div>
                        ) : (
                          <div className="text-[var(--sf-text-primary)]">
                            Hi {job?.customer_first_name || 'Customer'}! Reminder: You have an appointment for {job?.service_name || 'Service'} on {new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              month: 'long', 
                              day: 'numeric' 
                            })} at {formatTimeShared(job?.scheduled_date)}. Please arrive on time! - Your Service Team
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t">
                    <button
                      onClick={() => {
                        setShowNotificationModal(false);
                        setNotificationType(null);
                        setNotificationEmail('');
                        setNotificationPhone('');
                        setSelectedNotificationMethod('email');
                      }}
                      className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)] order-2 sm:order-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        // Check if notifications are disabled
                        if (!emailNotifications && !smsNotifications) {
                          setError('Notifications are disabled for this customer. Please enable notifications first.');
                          return;
                        }
                        
                        // Check if the selected method is disabled
                        if (selectedNotificationMethod === 'email' && !emailNotifications) {
                          setError('Email notifications are disabled for this customer.');
                          return;
                        }
                        
                        if (selectedNotificationMethod === 'sms' && !smsNotifications) {
                          setError('SMS notifications are disabled for this customer.');
                          return;
                        }
                        
                        const isValidEmail = selectedNotificationMethod === 'email' && notificationEmail.trim();
                        const isValidPhone = selectedNotificationMethod === 'sms' && notificationPhone.trim();
                        
                        if (isValidEmail || isValidPhone) {
                          try {
                            setLoading(true);
                            
                            // Construct service address
                            const serviceAddress = (() => {
                              if (job?.service_address_street) {
                                const addressParts = [
                                  job.service_address_street,
                                  job.service_address_city,
                                  job.service_address_state,
                                  job.service_address_zip,
                                  job.service_address_country
                                ].filter(Boolean);
                                return addressParts.join(', ');
                              }
                              return 'Service Address';
                            })();

                            if (selectedNotificationMethod === 'email') {
                              // Send email notification
                              const response = await api.post('/send-appointment-notification', {
                                notificationType,
                                customerEmail: notificationEmail,
                                jobId: job.id,
                                customerName: `${job.customer_first_name || ''} ${job.customer_last_name || ''}`.trim() || 'Customer',
                                serviceName: job.service_name || 'Service',
                                scheduledDate: job.scheduled_date,
                                serviceAddress: serviceAddress
                              });

                              console.log('📧 Email notification sent successfully:', response.data);
                              
                              // Update job status
                              if (notificationType === 'confirmation') {
                                setJob(prev => ({
                                  ...prev,
                                  confirmation_sent: true,
                                  confirmation_sent_at: new Date().toISOString(),
                                  confirmation_email: notificationEmail,
                                  confirmation_failed: false,
                                  confirmation_error: null,
                                  confirmation_no_email: false
                                }));
                              } else if (notificationType === 'reminder') {
                                setJob(prev => ({
                                  ...prev,
                                  reminder_sent: true,
                                  reminder_sent_at: new Date().toISOString(),
                                  reminder_email: notificationEmail,
                                  reminder_failed: false,
                                  reminder_error: null,
                                  reminder_no_email: false
                                }));
                              }
                              
                              const isResend = (notificationType === 'confirmation' && job.confirmation_sent) || (notificationType === 'reminder' && job.reminder_sent);
                              setSuccessMessage(`${notificationType === 'confirmation' ? (isResend ? 'Confirmation email resent' : 'Confirmation email sent') : (isResend ? 'Reminder email resent' : 'Reminder email sent')} to ${notificationEmail}!`);
                            } else {
                              // Send SMS notification
                              const smsMessage = notificationType === 'confirmation' 
                                ? `Hi ${job?.customer_first_name || 'Customer'}! Your appointment is confirmed for ${job?.service_name || 'Service'} on ${new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })} at ${formatTimeShared(job?.scheduled_date)}. We'll see you soon! - Your Service Team`
                                : `Hi ${job?.customer_first_name || 'Customer'}! Reminder: You have an appointment for ${job?.service_name || 'Service'} on ${new Date(job?.scheduled_date).toLocaleDateString('en-US', { 
                                    weekday: 'long', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })} at ${formatTimeShared(job?.scheduled_date)}. Please arrive on time! - Your Service Team`;

                              const response = await twilioAPI.sendSMS(notificationPhone, smsMessage);

                              console.log('📱 SMS notification sent successfully:', response);
                              
                              // Update job status for SMS
                              if (notificationType === 'confirmation') {
                                setJob(prev => ({
                                  ...prev,
                                  sms_sent: true,
                                  sms_sent_at: new Date().toISOString(),
                                  sms_phone: notificationPhone,
                                  sms_sid: response.sid,
                                  sms_failed: false,
                                  sms_error: null
                                }));
                              }
                              
                              const isResend = (notificationType === 'confirmation' && job.sms_sent);
                              setSuccessMessage(`${notificationType === 'confirmation' ? (isResend ? 'Confirmation SMS resent' : 'Confirmation SMS sent') : (isResend ? 'Reminder SMS resent' : 'Reminder SMS sent')} to ${notificationPhone}!`);
                            }
                            
                            setTimeout(() => setSuccessMessage(""), 3000);
                            setShowNotificationModal(false);
                            setNotificationType(null);
                            setNotificationEmail('');
                            setNotificationPhone('');
                            setSelectedNotificationMethod('email');
                          } catch (error) {
                            console.error('❌ Error sending notification:', error);
                            
                            // Update job status for failures
                            if (selectedNotificationMethod === 'email') {
                              if (notificationType === 'confirmation') {
                                setJob(prev => ({
                                  ...prev,
                                  confirmation_sent: false,
                                  confirmation_failed: true,
                                  confirmation_error: error.response?.data?.error || error.message
                                }));
                              } else if (notificationType === 'reminder') {
                                setJob(prev => ({
                                  ...prev,
                                  reminder_sent: false,
                                  reminder_failed: true,
                                  reminder_error: error.response?.data?.error || error.message
                                }));
                              }
                            } else {
                              if (notificationType === 'confirmation') {
                                setJob(prev => ({
                                  ...prev,
                                  sms_sent: false,
                                  sms_failed: true,
                                  sms_error: error.response?.data?.error || error.message
                                }));
                              }
                            }
                            
                            setError(`Failed to send ${notificationType === 'confirmation' ? 'confirmation' : 'reminder'} ${selectedNotificationMethod.toUpperCase()}: ${error.response?.data?.error || error.message}`);
                          } finally {
                            setLoading(false);
                          }
                        } else {
                          setError(`Please enter a valid ${selectedNotificationMethod === 'email' ? 'email address' : 'phone number'}`);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg order-1 sm:order-2 ${
                        (!emailNotifications && !smsNotifications) || 
                        (selectedNotificationMethod === 'email' && !emailNotifications) ||
                        (selectedNotificationMethod === 'sms' && !smsNotifications)
                          ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          : 'bg-[var(--sf-blue-500)] text-white hover:bg-[var(--sf-blue-600)]'
                      }`}
                      disabled={
                        loading || 
                        (!emailNotifications && !smsNotifications) ||
                        (selectedNotificationMethod === 'email' && !emailNotifications) ||
                        (selectedNotificationMethod === 'sms' && !smsNotifications)
                      }
                    >
                      {loading ? 'Sending...' : 
                        (!emailNotifications && !smsNotifications) ? 'Notifications Disabled' :
                        (selectedNotificationMethod === 'email' && !emailNotifications) ? 'Email Disabled' :
                        (selectedNotificationMethod === 'sms' && !smsNotifications) ? 'SMS Disabled' :
                        `${selectedNotificationMethod === 'email' ? 'Send Email' : 'Send SMS'} ${notificationType === 'confirmation' ? 'Confirmation' : 'Reminder'}`
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message Viewer Modal */}
        {showMessageViewer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-[var(--sf-border-light)]">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                  {viewingMessageType === 'confirmation' ? 'Appointment Confirmation' : 'Appointment Reminder'}
                </h3>
                <button
                  onClick={() => {
                    setShowMessageViewer(false)
                    setViewingMessageType(null)
                  }}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <div className="bg-[var(--sf-bg-page)] border border-[var(--sf-border-light)] rounded-lg p-6 space-y-4">
                  {viewingMessageType === 'confirmation' ? (
                    <div className="space-y-3">
                      <div className="font-semibold text-[var(--sf-text-primary)]">
                        Hi {job?.customer_first_name || 'Customer'},
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        Your appointment has been confirmed for <strong>{job?.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        }) : 'Date TBD'} at {job?.scheduled_date ? formatTimeShared(job.scheduled_date) : 'Time TBD'}</strong>.
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        <strong>Service:</strong> {job?.service_name || 'Service'}
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        <strong>Location:</strong> {job?.service_address_street || 'Service Address'}, {job?.service_address_city || 'City'}, {job?.service_address_state || 'State'} {job?.service_address_zip || 'ZIP'}
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        We look forward to serving you!
                      </div>
                      <div className="text-[var(--sf-text-primary)] pt-2">
                        Best regards,<br />
                        Your Service Team
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="font-semibold text-[var(--sf-text-primary)]">
                        Hi {job?.customer_first_name || 'Customer'},
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        This is a friendly reminder that you have an appointment scheduled for <strong>{job?.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        }) : 'Date TBD'} at {job?.scheduled_date ? formatTimeShared(job.scheduled_date) : 'Time TBD'}</strong>.
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        <strong>Service:</strong> {job?.service_name || 'Service'}
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        <strong>Location:</strong> {job?.service_address_street || 'Service Address'}, {job?.service_address_city || 'City'}, {job?.service_address_state || 'State'} {job?.service_address_zip || 'ZIP'}
                      </div>
                      <div className="text-[var(--sf-text-primary)]">
                        Please arrive on time. If you need to reschedule, please contact us as soon as possible.
                      </div>
                      <div className="text-[var(--sf-text-primary)] pt-2">
                        Best regards,<br />
                        Your Service Team
                      </div>
                    </div>
                  )}
                </div>
                
                {viewingMessageType && (job.confirmation_sent_at || job.reminder_sent_at) && (
                  <div className="mt-4 text-sm text-[var(--sf-text-muted)]">
                    <p>
                      <strong>Sent:</strong> {viewingMessageType === 'confirmation' 
                        ? (job.confirmation_sent_at ? new Date(job.confirmation_sent_at).toLocaleString() : 'N/A')
                        : (job.reminder_sent_at ? new Date(job.reminder_sent_at).toLocaleString() : 'N/A')}
                    </p>
                    <p className="mt-1">
                      <strong>To:</strong> {job.customer_email || 'N/A'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end p-6 border-t border-[var(--sf-border-light)]">
                <button
                  onClick={() => {
                    setShowMessageViewer(false)
                    setViewingMessageType(null)
                  }}
                  className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Custom Message Modal */}
        {showCustomMessageModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-[var(--sf-text-primary)]">Send Custom Message</h3>
                  <button
                    onClick={() => {
                      setShowCustomMessageModal(false);
                      setCustomMessage('');
                      setCustomMessageEmail('');
                    }}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Email Address */}
                  <div>
                    <label htmlFor="custom-message-email" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Send to
                    </label>
                    <input
                      type="email"
                      id="custom-message-email"
                      value={customMessageEmail}
                      onChange={(e) => setCustomMessageEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      placeholder="Enter email address"
                      required
                    />
                  </div>

                  {/* Custom Message */}
                  <div>
                    <label htmlFor="custom-message-text" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Message
                    </label>
                    <textarea
                      id="custom-message-text"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      rows={6}
                      placeholder="Enter your custom message here..."
                      required
                    />
                  </div>

                  {/* Message Preview */}
                  {customMessage && (
                    <div>
                      <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                        Message Preview
                      </label>
                      <div className="border border-[var(--sf-border-light)] rounded-lg p-4 bg-[var(--sf-bg-page)] max-h-40 overflow-y-auto">
                        <div className="space-y-2">
                          <div className="font-semibold text-[var(--sf-text-primary)]">
                            Hi {job?.customer_first_name || 'Customer'},
                          </div>
                          <div className="text-[var(--sf-text-primary)] whitespace-pre-wrap">
                            {customMessage}
                          </div>
                          <div className="text-[var(--sf-text-primary)]">
                            Best regards,<br />
                            Your Service Team
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t">
                    <button
                      onClick={() => {
                        setShowCustomMessageModal(false);
                        setCustomMessage('');
                        setCustomMessageEmail('');
                      }}
                      className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)] order-2 sm:order-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (customMessageEmail.trim() && customMessage.trim()) {
                          try {
                            setLoading(true);
                            
                            const response = await api.post('/send-custom-message', {
                              customerEmail: customMessageEmail,
                              jobId: job.id,
                              customerName: `${job.customer_first_name || ''} ${job.customer_last_name || ''}`.trim() || 'Customer',
                              message: customMessage
                            });

                            console.log('📧 Custom message sent successfully:', response.data);
                            setSuccessMessage(`Custom message sent to ${customMessageEmail}!`);
                            setTimeout(() => setSuccessMessage(""), 3000);
                            setShowCustomMessageModal(false);
                            setCustomMessage('');
                            setCustomMessageEmail('');
                          } catch (error) {
                            console.error('❌ Error sending custom message:', error);
                            setError(`Failed to send custom message: ${error.response?.data?.error || error.message}`);
                          } finally {
                            setLoading(false);
                          }
                        } else {
                          setError('Please enter both email address and message');
                        }
                      }}
                      className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] order-1 sm:order-2"
                      disabled={loading}
                    >
                      {loading ? 'Sending...' : 'Send Message'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Payment Modal */}
        {showAddPaymentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Add Payment</h3>
                  <button
                    onClick={() => setShowAddPaymentModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Payment Method</label>
                    <select 
                      value={paymentFormData.paymentMethod}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      {customPaymentMethods.map(pm => (
                        <option key={pm.id} value={pm.name}>{pm.name}</option>
                      ))}
                      <option value="other">Other</option>
                    </select>
                    {paymentFormData.paymentMethod === 'other' && (
                      <input
                        type="text"
                        value={paymentFormData.customPaymentMethod || ''}
                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, customPaymentMethod: e.target.value }))}
                        className="w-full mt-2 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder="Enter payment method name"
                        autoFocus
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Tip
                      <span className="text-xs text-[var(--sf-text-muted)] font-normal ml-1">
                        ({tipSettings.tipCalculationMode === 'automatic' ? 'auto-calculated' : 'manual'} — goes to payroll, not revenue)
                      </span>
                    </label>
                    {tipSettings.tipCalculationMode === 'automatic' ? (
                      (() => {
                        const paidAmount = parseFloat(paymentFormData.amount) || 0
                        const totalDue = parseFloat(job?.total ?? job?.total_amount ?? job?.price) || 0
                        const alreadyPaid = parseFloat(job?.total_paid_amount || 0)
                        const remaining = Math.max(0, totalDue - alreadyPaid)
                        const methodKey = paymentFormData.paymentMethod === 'other' && paymentFormData.customPaymentMethod?.trim()
                          ? paymentFormData.customPaymentMethod.trim() : paymentFormData.paymentMethod
                        const feePercent = tipSettings.paymentTypeFees?.[methodKey] || 0
                        const fee = paidAmount * (feePercent / 100)
                        const autoTip = Math.max(0, paidAmount - remaining - fee)
                        return (
                          <div className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg bg-[var(--sf-bg-page)] text-[var(--sf-text-secondary)] text-sm">
                            ${autoTip.toFixed(2)}
                            {feePercent > 0 && <span className="text-xs text-[var(--sf-text-muted)] ml-2">(fee: {feePercent}% = ${fee.toFixed(2)})</span>}
                          </div>
                        )
                      })()
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={paymentFormData.tipAmount}
                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, tipAmount: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder="0.00"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Payment Date</label>
                    <input
                      type="date"
                      value={paymentFormData.paymentDate}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Notes</label>
                    <textarea
                      rows={3}
                      value={paymentFormData.notes}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      placeholder="Optional payment notes"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowAddPaymentModal(false)
                      setPaymentFormData({
                        amount: '',
                        tipAmount: '',
                        paymentMethod: 'cash',
                        paymentDate: new Date().toISOString().split('T')[0],
                        notes: ''
                      })
                    }}
                    className="px-4 py-2 text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRecordPayment}
                    disabled={loading}
                    className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] order-1 sm:order-2 disabled:opacity-50"
                  >
                    {loading ? 'Recording...' : 'Record Payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

        {/* Discount Modal */}
        {showDiscountModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Add Discount</h3>
                  <button
                    onClick={() => setShowDiscountModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Discount Type Toggle */}
                  <div className="inline-flex rounded-lg border-2 border-blue-500 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, discountMode: 'fixed' }))}
                      className={`px-6 py-2 text-base font-semibold transition-colors ${
                        (formData.discountMode || 'fixed') === 'fixed'
                          ? 'bg-[var(--sf-blue-500)] text-white'
                          : 'bg-white text-blue-500 hover:bg-[var(--sf-blue-50)]'
                      }`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, discountMode: 'percentage' }))}
                      className={`px-6 py-2 text-base font-semibold transition-colors ${
                        (formData.discountMode || 'fixed') === 'percentage'
                          ? 'bg-[var(--sf-blue-500)] text-white'
                          : 'bg-white text-blue-500 hover:bg-[var(--sf-blue-50)]'
                      }`}
                    >
                      %
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      {(formData.discountMode || 'fixed') === 'percentage' ? 'Discount Percentage' : 'Discount Amount'}
                    </label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-[var(--sf-text-muted)]">{(formData.discountMode || 'fixed') === 'percentage' ? '%' : '$'}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.discountInput || ''}
                        onChange={e => {
                          const val = e.target.value
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            if ((formData.discountMode || 'fixed') === 'percentage' && parseFloat(val) > 100) return
                            setFormData(prev => ({ ...prev, discountInput: val }))
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder={`${(formData.discountMode || 'fixed') === 'percentage' ? '0' : '0.00'}`}
                        autoFocus
                      />
                    </div>
                    {(formData.discountMode || 'fixed') === 'percentage' && formData.discountInput && (
                      <p className="text-sm text-[var(--sf-text-muted)] mt-1">
                        = ${resolveDiscount(formData.discountInput, 'percentage', (parseFloat(job?.total || 0) + parseFloat(job?.discount || 0))).toFixed(2)} discount
                      </p>
                    )}
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setFormData(prev => ({ ...prev, discountInput: '', discountMode: 'fixed' }))
                        setShowDiscountModal(false)
                      }}
                      className="flex-1 px-4 py-2 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const inputVal = parseFloat(formData.discountInput)
                        if (isNaN(inputVal) || inputVal <= 0) {
                          setError('Please enter a valid discount amount')
                          setTimeout(() => setError(''), 3000)
                          return
                        }
                        const discountSubtotal = (parseFloat(job?.total || 0) + parseFloat(job?.discount || 0))
                        const discountDollars = resolveDiscount(inputVal, formData.discountMode || 'fixed', discountSubtotal)
                        try {
                          setLoading(true)
                          await jobsAPI.update(job.id, { discount: discountDollars })
                          setJob(prev => ({ ...prev, discount: discountDollars }))
                          setFormData(prev => ({ ...prev, discount: discountDollars, discountInput: '', discountMode: 'fixed' }))
                          setSuccessMessage(discountDollars > 0 ? 'Discount updated!' : 'Discount removed!')
                          setTimeout(() => setSuccessMessage(''), 3000)
                          setShowDiscountModal(false)
                        } catch (err) {
                          console.error('Error saving discount:', err)
                          setError('Failed to save discount')
                          setTimeout(() => setError(''), 3000)
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Add Discount'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tip Modal */}
        {showTipModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">{parseFloat(job?.tip_amount) > 0 ? 'Edit' : 'Add'} Tip</h3>
                  <button
                    onClick={() => setShowTipModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Tip Amount</label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.tipInput ?? ''}
                        onChange={e => {
                          const val = e.target.value
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            setFormData(prev => ({ ...prev, tipInput: val }))
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setFormData(prev => ({ ...prev, tipInput: '' }))
                        setShowTipModal(false)
                      }}
                      className="flex-1 px-4 py-2 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const newTip = parseFloat(formData.tipInput) || 0
                        if (newTip < 0) {
                          setError('Please enter a valid tip amount')
                          setTimeout(() => setError(''), 3000)
                          return
                        }
                        try {
                          setError('')
                          setLoading(true)
                          await jobsAPI.update(job.id, { tip_amount: newTip })
                          setJob(prev => ({ ...prev, tip_amount: newTip }))
                          setFormData(prev => ({ ...prev, tip: newTip, tipInput: '' }))
                          setSuccessMessage(newTip > 0 ? 'Tip updated successfully!' : 'Tip removed!')
                          setTimeout(() => setSuccessMessage(''), 3000)
                          setShowTipModal(false)
                        } catch (err) {
                          console.error('Error saving tip:', err)
                          setError('Failed to save tip')
                          setTimeout(() => setError(''), 3000)
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Tip'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Job-Level Incentive Modal */}
        {showIncentiveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">{parseFloat(job?.incentive_amount) > 0 ? 'Edit' : 'Add'} Incentive</h3>
                  <button
                    onClick={() => setShowIncentiveModal(false)}
                    className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">Incentive Amount</label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-[var(--sf-text-muted)]">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formData.incentiveInput ?? ''}
                        onChange={e => {
                          const val = e.target.value
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            setFormData(prev => ({ ...prev, incentiveInput: val }))
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setFormData(prev => ({ ...prev, incentiveInput: '' }))
                        setShowIncentiveModal(false)
                      }}
                      className="flex-1 px-4 py-2 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const newIncentive = parseFloat(formData.incentiveInput) || 0
                        if (newIncentive < 0) {
                          setError('Please enter a valid incentive amount')
                          setTimeout(() => setError(''), 3000)
                          return
                        }
                        try {
                          setError('')
                          setLoading(true)
                          await jobsAPI.update(job.id, { incentive_amount: newIncentive })
                          setJob(prev => ({ ...prev, incentive_amount: newIncentive }))
                          setFormData(prev => ({ ...prev, incentiveInput: '' }))
                          setSuccessMessage(newIncentive > 0 ? 'Incentive updated successfully!' : 'Incentive removed!')
                          setTimeout(() => setSuccessMessage(''), 3000)
                          setShowIncentiveModal(false)
                        } catch (err) {
                          console.error('Error saving incentive:', err)
                          setError('Failed to save incentive')
                          setTimeout(() => setError(''), 3000)
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Incentive'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Team Assignment Modal (AssignJobModal handles both desktop and mobile) */}
        <AssignJobModal
          job={job}
          isOpen={showAssignModal && canEditJobDetails(user)}
          onClose={() => setShowAssignModal(false)}
          onAssign={handleAssignTeamMember}
          companyDrivingTimeMinutes={companyDrivingTimeMinutes}
        />

      {/* Modals - Rendered outside main container for proper z-index stacking */}
      {/* Edit Customer Modal - Mobile View */}
      {showEditCustomerModal && (
        <div className="lg:hidden fixed inset-0 bg-white z-[99999] flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sf-border-light)]">
            <button
              onClick={() => setShowEditCustomerModal(false)}
              className="p-2 -ml-2"
            >
              <X className="w-5 h-5 text-[var(--sf-text-primary)]" />
            </button>
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Edit Customer</h2>
            <div className="w-10"></div> {/* Spacer for centering */}
            </div>

            {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div>
                <label htmlFor="edit-first-name-mobile" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  id="edit-first-name-mobile"
                  value={editCustomerData.firstName}
                  onChange={(e) => setEditCustomerData(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                />
                  </div>
              
              <div>
                <label htmlFor="edit-last-name-mobile" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  id="edit-last-name-mobile"
                  value={editCustomerData.lastName}
                  onChange={(e) => setEditCustomerData(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                />
                          </div>
              
              <div>
                <label htmlFor="edit-email-mobile" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="edit-email-mobile"
                  value={editCustomerData.email}
                  onChange={(e) => setEditCustomerData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  placeholder="Enter email address"
                />
                </div>
                
              <div>
                <label htmlFor="edit-phone-mobile" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="edit-phone-mobile"
                  value={editCustomerData.phone}
                  onChange={(e) => setEditCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  placeholder="Enter phone number"
                />
                  </div>

              <div>
                <label htmlFor="edit-source-mobile" className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                  Source
                </label>
                <input
                  type="text"
                  id="edit-source-mobile"
                  value={editCustomerData.source ?? ''}
                  onChange={(e) => setEditCustomerData(prev => ({ ...prev, source: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  placeholder="e.g. Website, Referral"
                />
              </div>
                  </div>
                  </div>

          {/* Footer with buttons */}
          <div className="border-t border-[var(--sf-border-light)] px-4 py-3 space-y-2">
            <button
              onClick={async () => {
                // Frontend validation
                if (editCustomerData.firstName && editCustomerData.firstName.trim() && (editCustomerData.firstName.trim().length < 2 || editCustomerData.firstName.trim().length > 50)) {
                  setError('First name must be between 2 and 50 characters');
                  return;
                }
                
                if (editCustomerData.lastName && editCustomerData.lastName.trim() && (editCustomerData.lastName.trim().length < 2 || editCustomerData.lastName.trim().length > 50)) {
                  setError('Last name must be between 2 and 50 characters');
                  return;
                }
                
                if (editCustomerData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editCustomerData.email)) {
                  setError('Please enter a valid email address');
                  return;
                }

                try {
                  setLoading(true);
                  setError(''); // Clear any previous errors
                  
                  const response = await api.put(`/customers/${job.customer_id}`, {
                    firstName: editCustomerData.firstName,
                    lastName: editCustomerData.lastName,
                    email: editCustomerData.email,
                    phone: editCustomerData.phone,
                    source: editCustomerData.source ?? ''
                  });

                  console.log('✅ Customer updated successfully:', response.data);
                  
                  // Update the job data with new customer info
                  setJob(prev => ({
                    ...prev,
                    customer_first_name: editCustomerData.firstName,
                    customer_last_name: editCustomerData.lastName,
                    customer_email: editCustomerData.email,
                    customer_phone: editCustomerData.phone,
                    customer_source: editCustomerData.source ?? ''
                  }));

                  setSuccessMessage('Customer updated successfully!');
                  setTimeout(() => setSuccessMessage(""), 3000);
                  setShowEditCustomerModal(false);
                } catch (error) {
                  console.error('❌ Error updating customer:', error);
                  setError(`Failed to update customer: ${error.response?.data?.error || error.message}`);
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full px-4 py-3 bg-[var(--sf-blue-500)] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => setShowEditCustomerModal(false)}
              className="w-full px-4 py-3 text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg font-medium hover:bg-[var(--sf-bg-page)]"
            >
              Cancel
            </button>
                  </div>
                </div>
      )}

      {/* Customer Notifications Modal - Mobile View */}
      {showNotificationModal && !notificationType && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[99999]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          <div className="bg-white rounded-t-2xl w-full max-h-[60vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Customer Notifications</h3>
                <button
                  onClick={() => {
                    setShowNotificationModal(false);
                  }}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-[var(--sf-text-secondary)] mb-6">
                Select how {getCustomerName()} should receive updates for their appointment.
              </p>
              
              <div className="space-y-4">
                {/* Email Toggle */}
                <div className="flex items-center justify-between py-3 border-b border-[var(--sf-border-light)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--sf-text-primary)]">Emails</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailNotifications}
                      onChange={(e) => handleNotificationToggle('email', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      emailNotifications 
                        ? 'bg-green-500 peer-checked:after:translate-x-full' 
                        : 'bg-gray-200'
                    }`}></div>
                  </label>
              </div>

                {/* SMS Toggle */}
                <div className="flex items-center justify-between py-3 border-b border-[var(--sf-border-light)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--sf-text-primary)]">Text messages</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsNotifications}
                      onChange={(e) => handleNotificationToggle('sms', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className={`w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--sf-border-light)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                      smsNotifications 
                        ? 'bg-green-500 peer-checked:after:translate-x-full' 
                        : 'bg-gray-200'
                    }`}></div>
                  </label>
                  </div>
                </div>
              </div>
          </div>
        </div>
      )}


      {/* Edit Job Requirements Modal - Mobile View */}
      {showEditJobRequirementsModal && canEditJobDetails(user) && (
        <div className="lg:hidden fixed inset-0 bg-white z-[99999] flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sf-border-light)]">
            <button
              onClick={() => setShowEditJobRequirementsModal(false)}
              className="p-2 -ml-2"
            >
              <X className="w-5 h-5 text-[var(--sf-text-primary)]" />
            </button>
            <h2 className="text-base font-semibold text-[var(--sf-text-primary)]">Edit Job Requirements</h2>
            <div className="w-10"></div> {/* Spacer for centering */}
                        </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-6">
              {/* Workers Needed Section */}
              <div>
                <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-3">
                  How many service providers are required?
                </label>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      if (editJobRequirementsData.workers_needed > 1) {
                        setEditJobRequirementsData(prev => ({
                          ...prev,
                          workers_needed: prev.workers_needed - 1
                        }))
                      }
                    }}
                    disabled={editJobRequirementsData.workers_needed <= 1}
                    className="w-10 h-10 flex items-center justify-center border border-[var(--sf-border-light)] rounded-lg text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-page)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-xl">−</span>
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={editJobRequirementsData.workers_needed}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1
                      setEditJobRequirementsData(prev => ({
                        ...prev,
                        workers_needed: Math.max(1, value)
                      }))
                    }}
                    className="w-20 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg text-center text-lg font-medium focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                  <button
                    onClick={() => {
                      setEditJobRequirementsData(prev => ({
                        ...prev,
                        workers_needed: prev.workers_needed + 1
                      }))
                    }}
                    className="w-10 h-10 flex items-center justify-center border border-[var(--sf-border-light)] rounded-lg text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-page)]"
                  >
                    <span className="text-xl">+</span>
                  </button>
                      </div>
                </div>

              {/* Required Skills Section */}
              <div>
                <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-3">
                  Required skills
                </label>
                <input
                  type="text"
                  placeholder="Select required skills..."
                  value={editJobRequirementsData.required_skills.join(', ')}
                  onChange={(e) => {
                    const skills = e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    setEditJobRequirementsData(prev => ({
                      ...prev,
                      required_skills: skills
                    }))
                  }}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                />
                <p className="text-sm text-[var(--sf-text-secondary)] mt-2">
                  {editJobRequirementsData.required_skills.length === 0 
                    ? 'No skill tags required. Any service provider can be assigned to this job.'
                    : `${editJobRequirementsData.required_skills.length} skill tag${editJobRequirementsData.required_skills.length !== 1 ? 's' : ''} required.`
                  }
                </p>
                <button className="text-sm text-[var(--sf-blue-500)] mt-1">
                  Learn more about skill tags
                </button>
              </div>
            </div>
          </div>

          {/* Footer with buttons */}
          <div className="border-t border-[var(--sf-border-light)] px-4 py-3 space-y-2">
            <button
              onClick={async () => {
                try {
                  setLoading(true)
                  // API expects 'workers' and 'skills' fields
                  await jobsAPI.update(job.id, {
                    workers: editJobRequirementsData.workers_needed,
                    skills: editJobRequirementsData.required_skills
                  })
                  
                  // Fetch updated job to get the actual data from backend
                  const updatedJobData = await jobsAPI.getById(job.id)
                  
                  // Update the job data with the response from backend
                  setJob(prev => ({
                    ...prev,
                    workers_needed: updatedJobData.workers_needed || updatedJobData.workers || editJobRequirementsData.workers_needed,
                    required_skills: updatedJobData.required_skills || updatedJobData.skills || editJobRequirementsData.required_skills
                  }))

                  setSuccessMessage('Job requirements updated successfully!')
                  setTimeout(() => setSuccessMessage(""), 3000)
                  setShowEditJobRequirementsModal(false)
                } catch (error) {
                  console.error('Error updating job requirements:', error)
                  setError(`Failed to update job requirements: ${error.response?.data?.error || error.message}`)
                } finally {
                  setLoading(false)
                }
              }}
              className="w-full px-4 py-3 bg-[var(--sf-blue-500)] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setShowEditJobRequirementsModal(false)}
              className="w-full px-4 py-3 text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg font-medium hover:bg-[var(--sf-bg-page)]"
            >
              Cancel
            </button>
            </div>
          </div>
        )}

      {/* Edit Job Requirements Modal - Desktop View */}
      {showEditJobRequirementsModal && canEditJobDetails(user) && (
          <div className="hidden lg:flex fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-[9999] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Edit Job Requirements</h3>
                <button
                onClick={() => setShowEditJobRequirementsModal(false)}
                  className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
            <div className="space-y-6">
              {/* Workers Needed Section */}
                <div>
                <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-3">
                  How many service providers are required?
                  </label>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      if (editJobRequirementsData.workers_needed > 1) {
                        setEditJobRequirementsData(prev => ({
                          ...prev,
                          workers_needed: prev.workers_needed - 1
                        }))
                      }
                    }}
                    disabled={editJobRequirementsData.workers_needed <= 1}
                    className="w-10 h-10 flex items-center justify-center border border-[var(--sf-border-light)] rounded-lg text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-page)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-xl">−</span>
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={editJobRequirementsData.workers_needed}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1
                      setEditJobRequirementsData(prev => ({
                        ...prev,
                        workers_needed: Math.max(1, value)
                      }))
                    }}
                    className="w-20 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg text-center text-lg font-medium focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                  />
                  <button
                    onClick={() => {
                      setEditJobRequirementsData(prev => ({
                        ...prev,
                        workers_needed: prev.workers_needed + 1
                      }))
                    }}
                    className="w-10 h-10 flex items-center justify-center border border-[var(--sf-border-light)] rounded-lg text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-page)]"
                  >
                    <span className="text-xl">+</span>
                  </button>
                </div>
                </div>
                
              {/* Required Skills Section */}
              <div>
                <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-3">
                  Required skills
                </label>
                <input
                  type="text"
                  placeholder="Select required skills..."
                  value={editJobRequirementsData.required_skills.join(', ')}
                  onChange={(e) => {
                    const skills = e.target.value.split(',').map(s => s.trim()).filter(s => s)
                    setEditJobRequirementsData(prev => ({
                      ...prev,
                      required_skills: skills
                    }))
                  }}
                  className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                />
                <p className="text-sm text-[var(--sf-text-secondary)] mt-2">
                  {editJobRequirementsData.required_skills.length === 0 
                    ? 'No skill tags required. Any service provider can be assigned to this job.'
                    : `${editJobRequirementsData.required_skills.length} skill tag${editJobRequirementsData.required_skills.length !== 1 ? 's' : ''} required.`
                  }
                </p>
                <button className="text-sm text-[var(--sf-blue-500)] mt-1">
                  Learn more about skill tags
                </button>
              </div>
            </div>

            {/* Footer with buttons */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowEditJobRequirementsModal(false)}
                className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg font-medium hover:bg-[var(--sf-bg-page)]"
                  >
                    Cancel
                  </button>
                  <button
                onClick={async () => {
                  try {
                    setLoading(true)
                    // API expects 'workers' and 'skills' fields
                    await jobsAPI.update(job.id, {
                      workers: editJobRequirementsData.workers_needed,
                      skills: editJobRequirementsData.required_skills
                    })
                    
                    // Fetch updated job to get the actual data from backend
                    const updatedJobData = await jobsAPI.getById(job.id)
                    
                    // Update the job data with the response from backend
                    setJob(prev => ({
                      ...prev,
                      workers_needed: updatedJobData.workers_needed || updatedJobData.workers || editJobRequirementsData.workers_needed,
                      required_skills: updatedJobData.required_skills || updatedJobData.skills || editJobRequirementsData.required_skills
                    }))

                    setSuccessMessage('Job requirements updated successfully!')
                    setTimeout(() => setSuccessMessage(""), 3000)
                    setShowEditJobRequirementsModal(false)
                  } catch (error) {
                    console.error('Error updating job requirements:', error)
                    setError(`Failed to update job requirements: ${error.response?.data?.error || error.message}`)
                  } finally {
                    setLoading(false)
                  }
                }}
                className="flex-1 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
                  >
                {loading ? 'Saving...' : 'Save'}
                  </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Convert to Recurring Modal */}
        <ConvertToRecurringModal
          isOpen={showConvertToRecurringModal}
          onClose={() => setShowConvertToRecurringModal(false)}
          job={job}
          onConvert={async (data) => {
            console.log('🔄 Converting job to recurring with data:', data);
            const result = await jobsAPI.convertToRecurring(jobId, data);
            console.log('✅ Convert to recurring result:', result);
            setSuccessMessage('Job converted to recurring successfully!');
            setTimeout(() => setSuccessMessage(""), 3000);
            // Reload job data
            const updatedJob = await jobsAPI.getById(jobId);
            setJob(updatedJob.job || updatedJob);
          }}
        />

        {/* Edit Recurring Frequency Modal */}
        <ConvertToRecurringModal
          isOpen={showEditRecurringModal}
          onClose={() => setShowEditRecurringModal(false)}
          job={job}
          mode="edit"
          onConvert={async (data) => {
            console.log('🔄 Updating recurring frequency with data:', data);
            const result = await jobsAPI.updateRecurringFrequency(jobId, data);
            console.log('✅ Update recurring frequency result:', result);
            setSuccessMessage('Recurring frequency updated successfully!');
            setTimeout(() => setSuccessMessage(""), 3000);
            // Reload job data
            const updatedJob = await jobsAPI.getById(jobId);
            setJob(updatedJob.job || updatedJob);
          }}
        />

        {/* Duplicate Job Modal */}
        <DuplicateJobModal
          isOpen={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          job={job}
          onDuplicate={async () => {
            // Navigate to create job page with all job details pre-filled
            navigate('/createjob', {
              state: {
                duplicateJob: job,
                fromJobId: jobId
              }
            });
          }}
        />
    </>
  )
}

export default JobDetails 