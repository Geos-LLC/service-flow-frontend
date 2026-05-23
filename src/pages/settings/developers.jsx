"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import SettingsRailLayout from "../../components/settings-rail-layout"
import { ChevronLeft, Link2, Trash2, AlertTriangle, Calendar, Users, UserCheck, MapPin, Briefcase, RefreshCw, CheckCircle2 } from "lucide-react"
import api, { jobsAPI, customersAPI, teamAPI, territoriesAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import Notification, { useNotification } from "../../components/notification"

const Developers = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notification, showNotification, hideNotification } = useNotification()
  const [importedJobsCount, setImportedJobsCount] = useState(0)
  const [loadingCount, setLoadingCount] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState({ deleted: 0, total: 0 })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [useDateRange, setUseDateRange] = useState(false)
  
  // Delete all states
  const [showDeleteCustomersConfirm, setShowDeleteCustomersConfirm] = useState(false)
  const [showDeleteJobsConfirm, setShowDeleteJobsConfirm] = useState(false)
  const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false)
  const [showDeleteTerritoriesConfirm, setShowDeleteTerritoriesConfirm] = useState(false)
  const [deletingCustomers, setDeletingCustomers] = useState(false)
  const [deletingJobs, setDeletingJobs] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [deletingTerritories, setDeletingTerritories] = useState(false)

  // Auto-reconcile log (ZB payments caught by the hourly sweep, not webhooks)
  const [reconcileCatches, setReconcileCatches] = useState([])
  const [reconcileRuns, setReconcileRuns] = useState([])
  const [reconcileLoading, setReconcileLoading] = useState(false)
  const [reconcileRunning, setReconcileRunning] = useState(false)

  useEffect(() => {
    loadImportedJobsCount()
    loadReconcileLog()
  }, [startDate, endDate, useDateRange])

  const loadReconcileLog = async () => {
    try {
      setReconcileLoading(true)
      const res = await api.get('/zenbooker/payment-reconcile-log')
      setReconcileCatches(res.data?.catches || [])
      setReconcileRuns(res.data?.runs || [])
    } catch (e) {
      console.error('Failed to load reconcile log:', e)
    } finally {
      setReconcileLoading(false)
    }
  }

  const handleRunReconcile = async () => {
    try {
      setReconcileRunning(true)
      await api.post('/zenbooker/payment-reconcile/run')
      showNotification('Auto-reconcile started. Results appear in ~30-60s.', 'success', 4000)
      // Poll after a short delay to show results
      setTimeout(loadReconcileLog, 15000)
      setTimeout(loadReconcileLog, 45000)
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to start auto-reconcile'
      showNotification(msg, 'error', 5000)
    } finally {
      setReconcileRunning(false)
    }
  }
  
  const loadImportedJobsCount = async () => {
    try {
      setLoadingCount(true)
      const params = {}
      if (useDateRange && startDate) params.startDate = startDate
      if (useDateRange && endDate) params.endDate = endDate
      const response = await jobsAPI.getImportedJobsCount(params)
      setImportedJobsCount(response.count || 0)
    } catch (error) {
      console.error('Error loading imported jobs count:', error)
    } finally {
      setLoadingCount(false)
    }
  }
  
  const handleDeleteImportedJobs = async () => {
    try {
      setDeleting(true)
      setDeleteProgress({ deleted: 0, total: importedJobsCount })
      const params = {}
      if (useDateRange && startDate) params.startDate = startDate
      if (useDateRange && endDate) params.endDate = endDate
      const response = await jobsAPI.deleteImportedJobs(params)
      setDeleteProgress({ deleted: response.deleted, total: importedJobsCount })
      showNotification(`Successfully deleted ${response.deleted} imported job(s)`, 'success', 5000)
      setShowDeleteConfirm(false)
      setDeleteProgress({ deleted: 0, total: 0 })
      await loadImportedJobsCount() // Reload count after deletion
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete imported jobs'
      showNotification(errorMessage, 'error', 5000)
      setDeleteProgress({ deleted: 0, total: 0 })
    } finally {
      setDeleting(false)
    }
  }
  
  const handleClearDateRange = () => {
    setStartDate('')
    setEndDate('')
    setUseDateRange(false)
  }
  
  // Delete All Handlers
  const handleDeleteAllCustomers = async () => {
    try {
      setDeletingCustomers(true)
      await customersAPI.deleteAll()
      showNotification('All customers deleted successfully.', 'success', 5000)
      setShowDeleteCustomersConfirm(false)
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete all customers'
      showNotification(errorMessage, 'error', 5000)
    } finally {
      setDeletingCustomers(false)
    }
  }
  
  const handleDeleteAllJobs = async () => {
    try {
      setDeletingJobs(true)
      console.log('🗑️ Attempting to delete all jobs...')
      const response = await jobsAPI.deleteAll()
      console.log('✅ Delete all jobs response:', response)
      showNotification('All jobs deleted successfully.', 'success', 5000)
      setShowDeleteJobsConfirm(false)
    } catch (error) {
      console.error('❌ Error deleting all jobs:', error)
      console.error('❌ Error response:', error.response)
      console.error('❌ Error data:', error.response?.data)
      console.error('❌ Error status:', error.response?.status)
      
      // Provide more detailed error message
      let errorMessage = 'Failed to delete all jobs'
      if (error.response?.status === 500) {
        errorMessage = 'Server error: The backend encountered an issue while deleting jobs. This may be due to database constraints. Please check the server logs or try again later.'
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }
      
      showNotification(errorMessage, 'error', 8000)
    } finally {
      setDeletingJobs(false)
    }
  }
  
  const handleDeleteAllTeam = async () => {
    try {
      setDeletingTeam(true)
      // Get all team members first
      const response = await teamAPI.getAll(user.id, {
        status: "",
        search: "",
        sortBy: "first_name",
        sortOrder: "ASC",
        page: 1,
        limit: 1000
      })
      const allMembers = response.teamMembers || response || []
      const deletableMembers = allMembers.filter(member => 
        !(member.role === 'account owner' || member.role === 'owner' || member.role === 'admin')
      )
      
      // Delete all deletable members
      for (const member of deletableMembers) {
        await teamAPI.delete(member.id)
      }
      
      showNotification(`${deletableMembers.length} team member(s) deleted successfully.`, 'success', 5000)
      setShowDeleteTeamConfirm(false)
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete all team members'
      showNotification(errorMessage, 'error', 5000)
    } finally {
      setDeletingTeam(false)
    }
  }
  
  const handleDeleteAllTerritories = async () => {
    try {
      setDeletingTerritories(true)
      // Get all territories first
      const response = await territoriesAPI.getAll(user.id)
      const allTerritories = response.territories || response || []
      
      // Delete all territories
      for (const territory of allTerritories) {
        await territoriesAPI.delete(territory.id)
      }
      
      showNotification(`${allTerritories.length} territor(ies) deleted successfully.`, 'success', 5000)
      setShowDeleteTerritoriesConfirm(false)
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete all territories'
      showNotification(errorMessage, 'error', 5000)
    } finally {
      setDeletingTerritories(false)
    }
  }

  return (
    <SettingsRailLayout
      title="Developers"
      section="Integrations"
      subtitle="Webhooks, API tokens, audit log"
    >
      <div className="space-y-12">
            {/* Webhooks Section */}
            <div>
              <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">Webhooks</h2>
              <p className="text-[var(--sf-text-secondary)] mb-6">
                Use webhooks to subscribe to events that happen inside of your Serviceflow account.
              </p>
              <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium text-sm mb-8">
                Learn more about using webhooks
              </button>

              <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-12 text-center">
                <div className="w-16 h-16 bg-[var(--sf-bg-page)] rounded-full flex items-center justify-center mx-auto mb-6">
                  <Link2 className="w-8 h-8 text-[var(--sf-text-muted)]" />
                </div>
                <h3 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">Create your first webhook</h3>
                <p className="text-[var(--sf-text-secondary)] mb-8 max-w-md mx-auto">
                  Receive job details in real-time when something happens in Serviceflow.
                </p>
                <button className="bg-[var(--sf-blue-500)] text-white px-6 py-3 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                  Create a Webhook
                </button>
              </div>
            </div>

            {/* API Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">API</h2>
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-medium">BETA</span>
                </div>
                <p className="text-[var(--sf-text-secondary)] mb-6">
                  Use the Serviceflow API to access your account data, like jobs and customers.
                </p>

                <div className="space-y-4">
                  <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)] mr-4">
                    Create API Key
                  </button>
                  <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium">View Documentation</button>
                </div>
              </div>

              {/* Code Preview */}
              <div className="bg-gray-900 rounded-lg p-6 text-green-400 font-mono text-sm overflow-hidden">
                <div className="flex items-center space-x-2 mb-4">
                  <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">POST</span>
                  <span className="text-gray-300">https://api.service-flow.com/v1/jobs/1d/assign</span>
                </div>
                <div className="space-y-1">
                  <div>{"{"}</div>
                  <div className="ml-4">"staff_id": "2b13-bb-1b8-d00e",</div>
                  <div className="ml-4">"service_schedule_id": 10</div>
                  <div>{"}"}</div>
                </div>
              </div>
            </div>
            
            {/* Imported Jobs Management Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-2">Imported Jobs</h2>
                  <p className="text-[var(--sf-text-secondary)] text-sm">
                    Manage jobs that were imported from external sources (CSV, Google Sheets, etc.)
                  </p>
                </div>
              </div>
              
              {/* Date Range Filter */}
              <div className="mt-4 p-4 bg-[var(--sf-blue-50)] rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    id="useDateRange"
                    checked={useDateRange}
                    onChange={(e) => setUseDateRange(e.target.checked)}
                    className="w-4 h-4 text-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded focus:ring-[var(--sf-blue-500)]"
                  />
                  <label htmlFor="useDateRange" className="text-sm font-medium text-[var(--sf-text-primary)] flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span>Filter by date range</span>
                  </label>
                </div>
                
                {useDateRange && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--sf-text-primary)] mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--sf-text-primary)] mb-1">
                        End Date
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate || undefined}
                          className="flex-1 px-3 py-2 border border-[var(--sf-border-light)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                        />
                        {(startDate || endDate) && (
                          <button
                            onClick={handleClearDateRange}
                            className="px-3 py-2 text-sm text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-6 p-4 bg-[var(--sf-bg-page)] rounded-lg border border-[var(--sf-border-light)]">
                <div className="flex items-center justify-between flex-col sm:flex-row gap-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--sf-text-primary)]">
                      {loadingCount ? 'Loading...' : `${importedJobsCount.toLocaleString()} imported job(s) found`}
                      {useDateRange && (startDate || endDate) && (
                        <span className="text-xs text-[var(--sf-text-muted)] ml-2">
                          ({startDate || 'any'} to {endDate || 'any'})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--sf-text-muted)] mt-1">
                      Jobs tagged with "imported" or "import" will be deleted
                      {useDateRange && (startDate || endDate) && ' within the selected date range'}
                    </p>
                  </div>
                  {importedJobsCount > 0 && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={deleting}
                      className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete {useDateRange && (startDate || endDate) ? 'Filtered' : 'All'} Imported Jobs</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Delete All Data Section */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-2">Delete All Data</h2>
                <p className="text-[var(--sf-text-secondary)] text-sm">
                  Permanently delete all records. These actions cannot be undone.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Delete All Customers */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Users className="w-5 h-5 text-red-600" />
                      <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Delete All Customers</h3>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--sf-text-secondary)] mb-3">
                    Permanently delete all customer records and associated data.
                  </p>
                  <button
                    onClick={() => setShowDeleteCustomersConfirm(true)}
                    disabled={deletingCustomers}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All Customers</span>
                  </button>
                </div>
                
                {/* Delete All Jobs */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Briefcase className="w-5 h-5 text-red-600" />
                      <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Delete All Jobs</h3>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--sf-text-secondary)] mb-3">
                    Permanently delete all job records and associated data.
                  </p>
                  <button
                    onClick={() => setShowDeleteJobsConfirm(true)}
                    disabled={deletingJobs}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All Jobs</span>
                  </button>
                </div>
                
                {/* Delete All Team */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-5 h-5 text-red-600" />
                      <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Delete All Team Members</h3>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--sf-text-secondary)] mb-3">
                    Permanently delete all team members (except account owners).
                  </p>
                  <button
                    onClick={() => setShowDeleteTeamConfirm(true)}
                    disabled={deletingTeam}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All Team</span>
                  </button>
                </div>
                
                {/* Delete All Territories */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-red-600" />
                      <h3 className="text-sm font-semibold text-[var(--sf-text-primary)]">Delete All Territories</h3>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--sf-text-secondary)] mb-3">
                    Permanently delete all territory records.
                  </p>
                  <button
                    onClick={() => setShowDeleteTerritoriesConfirm(true)}
                    disabled={deletingTerritories}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All Territories</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Zenbooker Auto-Reconcile Log */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-1 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Zenbooker Auto-Reconcile Log
                  </h2>
                  <p className="text-[var(--sf-text-secondary)] text-sm">
                    Payments <strong>caught by the hourly sweep</strong> — webhook is the default path; anything listed here means the ZB webhook failed and the safety net picked it up.
                  </p>
                </div>
                <button
                  onClick={handleRunReconcile}
                  disabled={reconcileRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${reconcileRunning ? 'animate-spin' : ''}`} />
                  {reconcileRunning ? 'Starting...' : 'Run now'}
                </button>
              </div>

              {/* Recent runs summary */}
              {reconcileRuns.length > 0 && (
                <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {reconcileRuns.slice(0, 4).map(r => (
                    <div key={r.id} className="bg-[var(--sf-bg-page)] rounded-lg p-3 border border-[var(--sf-border-light)]">
                      <div className="text-xs text-[var(--sf-text-secondary)]">
                        {new Date(r.started_at).toLocaleString()} <span className="uppercase text-[10px]">· {r.triggered_by}</span>
                      </div>
                      <div className="text-sm mt-1">
                        <span className="font-medium text-[var(--sf-text-primary)]">{r.payments_caught}</span>
                        <span className="text-[var(--sf-text-secondary)]"> caught / {r.jobs_scanned} scanned</span>
                        {r.errors > 0 && <span className="text-red-600"> · {r.errors} err</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Catches table */}
              {reconcileLoading ? (
                <div className="text-center py-8 text-[var(--sf-text-secondary)] text-sm">Loading…</div>
              ) : reconcileCatches.length === 0 ? (
                <div className="text-center py-8 text-[var(--sf-text-secondary)] text-sm">
                  No auto-reconcile catches yet. Webhooks are handling all payments — that's the happy path.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--sf-border-light)] text-[var(--sf-text-secondary)] text-xs uppercase">
                        <th className="text-left py-2 pr-4">Caught At</th>
                        <th className="text-left py-2 pr-4">Job</th>
                        <th className="text-left py-2 pr-4">Amount</th>
                        <th className="text-left py-2 pr-4">Payment Method</th>
                        <th className="text-left py-2 pr-4">ZB Invoice</th>
                        <th className="text-left py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconcileCatches.map(c => (
                        <tr key={c.id} className="border-b border-[var(--sf-border-light)] hover:bg-[var(--sf-bg-page)]">
                          <td className="py-2 pr-4 whitespace-nowrap text-[var(--sf-text-secondary)]">{new Date(c.caught_at).toLocaleString()}</td>
                          <td className="py-2 pr-4">
                            <a href={`/job/${c.job_id}`} className="text-[var(--sf-blue-500)] hover:underline" target="_blank" rel="noreferrer">#{c.job_id}</a>
                          </td>
                          <td className="py-2 pr-4 font-medium">${parseFloat(c.amount || 0).toFixed(2)}</td>
                          <td className="py-2 pr-4">{c.payment_method || <span className="text-[var(--sf-text-muted)] italic">unresolved</span>}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-[var(--sf-text-muted)]" title={c.zb_invoice_id}>{c.zb_invoice_id ? c.zb_invoice_id.slice(0, 16) + '…' : '—'}</td>
                          <td className="py-2 text-[var(--sf-text-secondary)] text-xs">{c.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

      {/* Delete Confirmation Modals */}
      {/* Delete All Customers Modal */}
      {showDeleteCustomersConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Delete All Customers?</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    This will permanently delete all customers and all associated data. This action cannot be undone.
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => setShowDeleteCustomersConfirm(false)}
                      disabled={deletingCustomers}
                      className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllCustomers}
                      disabled={deletingCustomers}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {deletingCustomers ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete All Jobs Modal */}
      {showDeleteJobsConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Delete All Jobs?</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    This will permanently delete all jobs and all associated data. This action cannot be undone.
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => setShowDeleteJobsConfirm(false)}
                      disabled={deletingJobs}
                      className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllJobs}
                      disabled={deletingJobs}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {deletingJobs ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete All Team Modal */}
      {showDeleteTeamConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Delete All Team Members?</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    This will permanently delete all team members (except account owners) and all associated data. This action cannot be undone.
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => setShowDeleteTeamConfirm(false)}
                      disabled={deletingTeam}
                      className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllTeam}
                      disabled={deletingTeam}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {deletingTeam ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete All Territories Modal */}
      {showDeleteTerritoriesConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Delete All Territories?</h3>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    This will permanently delete all territories and all associated data. This action cannot be undone.
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => setShowDeleteTerritoriesConfirm(false)}
                      disabled={deletingTerritories}
                      className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAllTerritories}
                      disabled={deletingTerritories}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {deletingTerritories ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">
                    Delete {useDateRange && (startDate || endDate) ? 'Filtered' : 'All'} Imported Jobs?
                  </h3>
                  <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                    {deleting ? (
                      <>
                        Deleting <strong>{importedJobsCount.toLocaleString()} imported job(s)</strong>
                        {useDateRange && (startDate || endDate) && (
                          <span> within the date range ({startDate || 'any'} to {endDate || 'any'})</span>
                        )}
                        {' '}and all associated data. This may take a few minutes...
                      </>
                    ) : (
                      <>
                    This will permanently delete <strong>{importedJobsCount.toLocaleString()} imported job(s)</strong>
                    {useDateRange && (startDate || endDate) && (
                      <span> within the date range ({startDate || 'any'} to {endDate || 'any'})</span>
                    )}
                    {' '}and all associated data (transactions, assignments, etc.). This action cannot be undone.
                      </>
                    )}
                  </p>
                  
                  {deleting && deleteProgress.total > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-[var(--sf-text-secondary)] mb-1">
                        <span>Deleting jobs...</span>
                        <span>{deleteProgress.deleted > 0 ? `${deleteProgress.deleted.toLocaleString()} / ${deleteProgress.total.toLocaleString()}` : 'Processing...'}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-[var(--sf-blue-500)] h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: deleteProgress.deleted > 0 
                              ? `${Math.min((deleteProgress.deleted / deleteProgress.total) * 100, 100)}%` 
                              : '10%'
                          }}
                        ></div>
                      </div>
                      <p className="text-xs text-[var(--sf-text-muted)] mt-2">
                        Please wait while jobs are being deleted. Do not close this window.
                      </p>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="flex-1 px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteImportedJobs}
                      disabled={deleting}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {deleting ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          <span>Delete All</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Notification */}
      <Notification
        show={notification.show}
        message={notification.message}
        type={notification.type}
        onClose={hideNotification}
        duration={5000}
      />
    </SettingsRailLayout>
  )
}

export default Developers
