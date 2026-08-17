"use client"

import { useState, useEffect } from "react"
import Sidebar from "../components/sidebar"
import TerritoryMap from "../components/territory-map"
import {
  Plus,
  MapPin,
  Users,
  Edit,
  Calendar,
  Globe,
  Loader2,
  Trash2,
  Map as MapIcon,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useNavigate } from "react-router-dom"
import { territoriesAPI } from "../services/api"
import CreateTerritoryModal from "../components/create-territory-modal"
import MobileHeader from "../components/mobile-header"

const ServiceFlowTerritories = () => {
  const { user, authLoading } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [territories, setTerritories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedTerritory, setSelectedTerritory] = useState(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [filters, setFilters] = useState({
    status: "active",
    search: "",
    sortBy: "name",
    sortOrder: "ASC"
  })

  // Initial data fetch
  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchTerritories()
    } else if (!authLoading && !user?.id) {
      window.location.href = '/signin'
    }
  }, [authLoading, user?.id])

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (user?.id) {
        fetchTerritories()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [filters.status, filters.search, filters.sortBy, filters.sortOrder, user?.id])

  const fetchTerritories = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError("")

      const response = await territoriesAPI.getAll(user.id, {
        status: filters.status,
        search: filters.search,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: 1,
        limit: 50
      })

      setTerritories(response.territories || [])
    } catch (error) {
      console.error('Error fetching territories:', error)
      setError("Failed to load territories. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500 text-white'
      case 'inactive': return 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
      case 'archived': return 'bg-red-100 text-red-700'
      default: return 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Enabled'
      case 'inactive': return 'Disabled'
      case 'archived': return 'Archived'
      default: return 'Unknown'
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0)
  }

  const handleCreateTerritory = () => {
    setIsCreateModalOpen(true)
  }

  const handleEditTerritory = (e, territory) => {
    e.stopPropagation() // Prevent card click navigation
    setSelectedTerritory(territory)
    setIsEditModalOpen(true)
  }

  const handleTerritoryUpdate = () => {
    fetchTerritories()
    setIsCreateModalOpen(false)
    setIsEditModalOpen(false)
    setSelectedTerritory(null)
  }

  const handleDeleteTerritory = async (e, territory) => {
    e.stopPropagation() // Prevent card click navigation

    if (!window.confirm(`Are you sure you want to delete "${territory.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setLoading(true)
      const result = await territoriesAPI.delete(territory.id)
      const impact = result?.impact || {}
      const parts = []
      if (impact.jobs_unlinked) parts.push(`${impact.jobs_unlinked} job${impact.jobs_unlinked === 1 ? '' : 's'} unlinked`)
      if (impact.conversations_unlinked) parts.push(`${impact.conversations_unlinked} conversation${impact.conversations_unlinked === 1 ? '' : 's'} unlinked`)
      if (impact.endpoint_mappings_deleted) parts.push(`${impact.endpoint_mappings_deleted} endpoint mapping${impact.endpoint_mappings_deleted === 1 ? '' : 's'} removed`)
      if (impact.pricing_rows_deleted) parts.push(`${impact.pricing_rows_deleted} pricing row${impact.pricing_rows_deleted === 1 ? '' : 's'} removed`)
      const suffix = parts.length ? ` (${parts.join(', ')})` : ''
      setSuccessMessage(`Territory "${territory.name}" deleted successfully${suffix}`)
      setTimeout(() => setSuccessMessage(""), 5000)
      fetchTerritories()
    } catch (error) {
      console.error('Error deleting territory:', error)
      setError(`Failed to delete territory: ${error.response?.data?.error || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleTerritoryClick = (territory) => {
    // Navigate to territory details page
    navigate(`/territories/${territory.id}`)
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--sf-blue-500)]" />
      </div>
    )
  }

  const activeCount = territories.filter(t => t.status === 'active').length
  const disabledCount = territories.filter(t => t.status === 'inactive').length

  return (
    <div className="flex h-screen bg-[var(--sf-bg-page)]">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <MobileHeader pageTitle="Territories" />

        <main className="flex-1 overflow-y-auto">
          <div className="px-5 lg:px-40 xl:px-44 2xl:px-48 py-4 sm:py-6 lg:py-8">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-[var(--sf-text-primary)] mb-2" style={{ fontFamily: 'Montserrat', fontWeight: 700 }}>Service Territories</h1>
              <p className="text-[var(--sf-text-secondary)] text-sm mb-1" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>
                Manage the geographic areas where you provide services and do work. You can create multiple service territories with unique hours, services, and service providers.{' '}
                <a href="#" className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] underline">Learn more</a>
              </p>
              <p className="text-[var(--sf-text-secondary)] text-sm" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>
                You are currently using <span className="font-medium text-[var(--sf-text-primary)]" style={{ fontFamily: 'Montserrat', fontWeight: 500 }}>{activeCount} of 2</span> service territories available on your plan.
              </p>
            </div>

            {/* Controls Bar */}
            <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={() => navigate('/territories/zip-manager')}
                className="px-4 py-2 border border-[var(--sf-border-light)] text-[var(--sf-text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--sf-bg-page)] flex items-center gap-2"
                style={{ fontFamily: 'Montserrat', fontWeight: 500 }}
              >
                <MapIcon className="w-4 h-4" />
                Manage ZIPs
              </button>
              <button
                onClick={handleCreateTerritory}
                className="px-4 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--sf-blue-600)] flex items-center gap-2"
                style={{ fontFamily: 'Montserrat', fontWeight: 500 }}
              >
                <Plus className="w-4 h-4" />
                New Territory
              </button>
            </div>

            {/* Main Content Layout */}
            <div>

            {/* Success Message */}
            {successMessage && (
              <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">{successMessage}</p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

                {/* Territories List */}
                {loading ? (
                  <div className="flex items-center justify-center py-12 bg-white border border-[var(--sf-border-light)] rounded-lg">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--sf-blue-500)]" />
                  </div>
                ) : territories.length === 0 ? (
                  <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-8 text-center">
                    <MapPin className="mx-auto h-12 w-12 text-[var(--sf-text-muted)]" />
                    <h3 className="mt-2 text-sm font-medium text-[var(--sf-text-primary)]">No territories found</h3>
                    <p className="mt-1 text-sm text-[var(--sf-text-muted)]">
                      Get started by creating your first service territory.
                    </p>
                    <div className="mt-6">
                      <button
                        onClick={handleCreateTerritory}
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-[var(--sf-blue-500)] hover:bg-[var(--sf-blue-600)]"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        New Territory
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {territories.map((territory) => (
                      <div
                        key={territory.id}
                        className="bg-white border border-[var(--sf-border-light)] rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {/* Map Section - Reduced Height */}
                        <div className="w-full relative" style={{ height: '200px' }}>
                          <TerritoryMap
                            territory={territory}
                            height="100%"
                            showDetails={false}
                          />
                          {/* Action Buttons Overlay */}
                          <div className="absolute top-2 right-2 flex gap-2 z-10">
                            <button
                              onClick={(e) => handleEditTerritory(e, territory)}
                              className="p-2 bg-white rounded-lg shadow-md hover:bg-[var(--sf-bg-page)] transition-colors"
                              title="Edit territory"
                            >
                              <Edit className="w-4 h-4 text-[var(--sf-text-primary)]" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteTerritory(e, territory)}
                              className="p-2 bg-white rounded-lg shadow-md hover:bg-red-50 transition-colors"
                              title="Delete territory"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>

                        {/* Territory Details - Compact Layout */}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <h3 
                                className="text-lg font-bold text-[var(--sf-text-primary)] cursor-pointer hover:text-[var(--sf-blue-500)] transition-colors" 
                                style={{ fontFamily: 'Montserrat', fontWeight: 700 }}
                                onClick={() => handleTerritoryClick(territory)}
                              >
                                {territory.name}
                              </h3>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(territory.status)}`} style={{ fontFamily: 'Montserrat', fontWeight: 500 }}>
                              {getStatusLabel(territory.status)}
                            </span>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--sf-text-secondary)] mb-4" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>{territory.location || `${territory.name}`}</p>

                          {/* Territory Attributes - Compact Grid */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-[var(--sf-text-muted)] flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-[var(--sf-text-muted)] uppercase" style={{ fontFamily: 'Montserrat', fontWeight: 600 }}>Area</div>
                                <div className="text-sm text-[var(--sf-text-primary)] truncate" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>{territory.radius_miles || 30} mi</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-[var(--sf-text-muted)] flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-[var(--sf-text-muted)] uppercase" style={{ fontFamily: 'Montserrat', fontWeight: 600 }}>Timezone</div>
                                <div className="text-sm text-[var(--sf-text-primary)] truncate" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>{territory.timezone?.split('/').pop() || 'Default'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-[var(--sf-text-muted)] flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-[var(--sf-text-muted)] uppercase" style={{ fontFamily: 'Montserrat', fontWeight: 600 }}>Booking</div>
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                  <span className="text-sm text-[var(--sf-text-primary)]" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>On</span>
                              </div>
                              </div>
                            </div>

                              <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-[var(--sf-text-muted)] flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-[var(--sf-text-muted)] uppercase" style={{ fontFamily: 'Montserrat', fontWeight: 600 }}>Providers</div>
                                <div className="flex items-center gap-1.5">
                                {territory.team_members && territory.team_members.length > 0 ? (
                                  <>
                                      <div className="flex -space-x-1.5">
                                      {territory.team_members.slice(0, 3).map((member, idx) => (
                                          <div key={idx} className="w-5 h-5 rounded-full bg-green-300 border-2 border-white flex items-center justify-center text-xs font-medium text-[var(--sf-text-primary)]" style={{ fontFamily: 'Montserrat', fontWeight: 500 }}>
                                          {member.initials || member.first_name?.[0] || 'A'}
                                        </div>
                                      ))}
                                    </div>
                                    {territory.team_members.length > 3 && (
                                        <span className="text-xs text-[var(--sf-text-secondary)]" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>+{territory.team_members.length - 3}</span>
                                    )}
                                  </>
                                ) : (
                                    <span className="text-sm text-[var(--sf-text-muted)]" style={{ fontFamily: 'Montserrat', fontWeight: 400 }}>0</span>
                                )}
                              </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </main>
      </div>

      {/* Territory Creation Modal */}
      <CreateTerritoryModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTerritoryUpdate}
        userId={user?.id}
      />

      {/* Territory Edit Modal */}
      <CreateTerritoryModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleTerritoryUpdate}
        territory={selectedTerritory}
        isEditing={true}
        userId={user?.id}
      />
    </div>
  )
}

export default ServiceFlowTerritories
