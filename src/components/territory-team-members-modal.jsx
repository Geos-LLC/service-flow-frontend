"use client"

import { useState, useEffect } from "react"
import { X, Users, Loader2, CheckCircle } from "lucide-react"
import { teamAPI, territoriesAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"

const TerritoryTeamMembersModal = ({ isOpen, onClose, onSuccess, territoryId, userId, currentTeamMembers = [] }) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [availableTeamMembers, setAvailableTeamMembers] = useState([])
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState([])

  // Initialize selected team members from current team members
  useEffect(() => {
    if (isOpen && currentTeamMembers.length > 0) {
      // Extract IDs from current team members (could be objects or IDs)
      const ids = currentTeamMembers.map(member => {
        return member.id || member.team_member_id || member
      }).filter(Boolean)
      setSelectedTeamMemberIds(ids)
    } else if (isOpen) {
      setSelectedTeamMemberIds([])
    }
  }, [isOpen, currentTeamMembers])

  // Fetch available team members
  useEffect(() => {
    if (isOpen && userId) {
      fetchTeamMembers()
    }
  }, [isOpen, userId])

  const fetchTeamMembers = async () => {
    try {
      setLoading(true)
      setError("")
      const response = await teamAPI.getAll(userId, {
        status: 'active',
        page: 1,
        limit: 1000
      })
      
      // Normalize the response
      const teamMembersData = normalizeAPIResponse(response, 'teamMembers') || []
      
      // Filter to only service providers
      const providers = teamMembersData.filter(member => 
        (member.is_service_provider !== false) && 
        member.status === 'active'
      )
      
      setAvailableTeamMembers(providers)
    } catch (error) {
      console.error('Error fetching team members:', error)
      setError("Failed to load team members. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const toggleTeamMember = (memberId) => {
    setSelectedTeamMemberIds(prev => {
      const id = Number(memberId)
      if (prev.includes(id)) {
        return prev.filter(existingId => existingId !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError("")
      
      // Get current territory data to preserve other fields
      const territoryData = await territoriesAPI.getById(territoryId)
      const territory = territoryData.territory || territoryData

      // Sanitize zip_codes on round-trip so legacy garbage doesn't get
      // re-saved by this modal (which only edits team members).
      const cleanZipCodes = (Array.isArray(territory.zip_codes) ? territory.zip_codes : [])
        .map(z => String(z || '').trim().replace(/-.*$/, ''))
        .filter(z => /^\d{5}$/.test(z))

      // Update territory with new team members array
      await territoriesAPI.update(territoryId, {
        userId: userId,
        name: territory.name,
        description: territory.description,
        location: territory.location,
        zipCodes: cleanZipCodes,
        radiusMiles: territory.radius_miles || 25,
        timezone: territory.timezone || "America/New_York",
        status: territory.status || "active",
        businessHours: territory.business_hours || {},
        teamMembers: selectedTeamMemberIds,
        services: territory.services || [],
        pricingMultiplier: territory.pricing_multiplier || 1.00
      })
      
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Error saving team members:', error)
      setError("Failed to save team members. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const getInitials = (firstName, lastName) => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || 'TM'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--sf-border-light)]">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--sf-blue-500)]" />
            <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">Manage Service Providers</h3>
          </div>
          <button 
            onClick={onClose} 
            className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors"
            disabled={saving}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--sf-blue-500)]" />
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--sf-text-secondary)] mb-4">
                Select service providers to assign to this territory. These providers will be available for jobs in this region.
              </p>

              {availableTeamMembers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-[var(--sf-text-muted)] mx-auto mb-3" />
                  <p className="text-sm text-[var(--sf-text-secondary)]">No team members available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableTeamMembers.map((member) => {
                    const memberId = Number(member.id)
                    const isSelected = selectedTeamMemberIds.includes(memberId)
                    const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || 'Unnamed'

                    return (
                      <div
                        key={member.id}
                        onClick={() => toggleTeamMember(member.id)}
                        className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-[var(--sf-blue-50)]'
                            : 'border-[var(--sf-border-light)] hover:border-[var(--sf-border-light)] hover:bg-[var(--sf-bg-page)]'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-200'
                        }`}>
                          <span className={`text-sm font-medium ${
                            isSelected ? 'text-white' : 'text-[var(--sf-text-secondary)]'
                          }`}>
                            {getInitials(member.first_name, member.last_name)}
                          </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--sf-text-primary)] mb-0.5">
                            {fullName}
                          </div>
                          <div className="text-xs text-[var(--sf-text-muted)]">
                            {member.email || 'No email'} {member.role && `• ${member.role}`}
                          </div>
                        </div>

                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-[var(--sf-blue-500)] flex-shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--sf-border-light)] bg-[var(--sf-bg-page)]">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[var(--sf-text-primary)] bg-white border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--sf-blue-500)] rounded-lg hover:bg-[var(--sf-blue-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

export default TerritoryTeamMembersModal

