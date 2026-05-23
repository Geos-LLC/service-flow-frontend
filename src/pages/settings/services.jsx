"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Edit, Trash2, Settings, Tag, Clock, DollarSign } from "lucide-react"
import { servicesAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import CategoryManagement from "../../components/category-management"
import SettingsRailLayout from "../../components/settings-rail-layout"

const ServicesSettings = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const navigate = useNavigate()
  
  const [settings, setSettings] = useState({
    defaultDuration: 60,
    defaultPrice: 0,
    requirePaymentMethod: false,
    allowOnlineBooking: true,
    showServicePrices: true,
    autoAssignTeamMembers: false
  })

  const [serviceCategories, setServiceCategories] = useState([])
  const [services, setServices] = useState([])

  const { user } = useAuth()

  useEffect(() => {
    if (user?.id) {
      loadServicesData()
    } else if (user === null) {
      navigate('/signin')
    }
  }, [user?.id, navigate])

  const loadServicesData = async () => {
    try {
      setLoading(true)
      
      // Load settings and services first
      const [settingsData, servicesData] = await Promise.all([
        servicesAPI.getServiceSettings(),
        servicesAPI.getServices()
      ])
      
      setSettings(settingsData)
      setServices(servicesData)
      
      // Try to load categories, but handle 404 gracefully
      try {
        const categoriesData = await servicesAPI.getServiceCategories(user.id)
        setServiceCategories(categoriesData)
      } catch (categoriesError) {
        console.log('Categories endpoint not available:', categoriesError.message)
        setServiceCategories([])
      }
    } catch (error) {
      console.error('Error loading services data:', error)
      setMessage({ type: 'error', text: 'Failed to load services settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryChange = () => {
    // Refresh categories when a category is deleted
    loadServicesData()
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      await servicesAPI.updateServiceSettings(settings)
      setMessage({ type: 'success', text: 'Services settings saved successfully!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      console.error('Error saving services settings:', error)
      setMessage({ type: 'error', text: 'Failed to save services settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleToggle = (field) => {
    setSettings(prev => ({
      ...prev,
      [field]: !prev[field]
    }))
  }

  if (loading) {
    return (
      <SettingsRailLayout title="Services catalog" section="Services & pricing">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-[var(--sf-text-secondary)]">Loading services settings…</p>
          </div>
        </div>
      </SettingsRailLayout>
    )
  }

  return (
    <SettingsRailLayout
      title="Services catalog"
      section="Services & pricing"
      subtitle="Manage services and categories"
    >
      <div>
            {/* Message */}
            {message.text && (
              <div className={`mb-6 p-4 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            {/* General Settings */}
            <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] mb-6">
              <div className="px-6 py-4 border-b border-[var(--sf-border-light)]">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">General Settings</h2>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Default Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={settings.defaultDuration}
                      onChange={(e) => handleInputChange('defaultDuration', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--sf-text-primary)] mb-2">
                      Default Price ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={settings.defaultPrice}
                      onChange={(e) => handleInputChange('defaultPrice', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-[var(--sf-border-light)] rounded-lg focus:ring-2 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Require Payment Method</h3>
                      <p className="text-sm text-[var(--sf-text-muted)]">Require customers to provide payment information when booking</p>
                    </div>
                    <button
                      onClick={() => handleToggle('requirePaymentMethod')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.requirePaymentMethod ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.requirePaymentMethod ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Allow Online Booking</h3>
                      <p className="text-sm text-[var(--sf-text-muted)]">Allow customers to book services online</p>
                    </div>
                    <button
                      onClick={() => handleToggle('allowOnlineBooking')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.allowOnlineBooking ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.allowOnlineBooking ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Show Service Prices</h3>
                      <p className="text-sm text-[var(--sf-text-muted)]">Display service prices to customers</p>
                    </div>
                    <button
                      onClick={() => handleToggle('showServicePrices')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.showServicePrices ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.showServicePrices ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Auto-Assign Team Members</h3>
                      <p className="text-sm text-[var(--sf-text-muted)]">Automatically assign team members to new jobs</p>
                    </div>
                    <button
                      onClick={() => handleToggle('autoAssignTeamMembers')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        settings.autoAssignTeamMembers ? 'bg-[var(--sf-blue-500)]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.autoAssignTeamMembers ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Service Categories */}
            <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] mb-6">
              <div className="px-6 py-4 border-b border-[var(--sf-border-light)]">
                <h2 className="text-lg font-semibold text-[var(--sf-text-primary)]">Service Categories</h2>
              </div>
              <div className="p-6">
                <CategoryManagement onCategoryChange={handleCategoryChange} />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] p-6">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-[var(--sf-blue-500)]" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-[var(--sf-text-secondary)]">Total Services</p>
                    <p className="text-2xl font-bold text-[var(--sf-text-primary)]">{services.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] p-6">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Tag className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-[var(--sf-text-secondary)]">Categories</p>
                    <p className="text-2xl font-bold text-[var(--sf-text-primary)]">{serviceCategories.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] p-6">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-[var(--sf-text-secondary)]">Avg Duration</p>
                    <p className="text-2xl font-bold text-[var(--sf-text-primary)]">{settings.defaultDuration}m</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="px-6 py-2 bg-[var(--sf-blue-500)] text-white rounded-lg hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </SettingsRailLayout>
  )
}

export default ServicesSettings
