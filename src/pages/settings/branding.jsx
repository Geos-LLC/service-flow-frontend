"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Check, X } from "lucide-react"
import { brandingAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import SettingsPageLayout from "../../components/settings-page-layout"

const BrandingSettings = () => {
  const [loading, setLoading] = useState(false) // Start with false, not true
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const navigate = useNavigate()
  const { user } = useAuth()
  
  console.log('🔍 BrandingSettings: Component rendered, user:', user);
  
  const [settings, setSettings] = useState({
    logo: null,
    showLogoInAdmin: false,
    primaryColor: "#4CAF50",
  })

  const colors = [
    // Row 1
    "#F44336", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3", "#03A9F4", "#00BCD4",
    // Row 2
    "#009688", "#4CAF50", "#8BC34A", "#CDDC39", "#FFEB3B", "#FFC107", "#FF9800", "#FF5722",
    // Row 3
    "#795548", "#607D8B"
  ]

  useEffect(() => {
    console.log('🔍 useEffect: User changed, user:', user);
    if (user?.id) {
      console.log('🔍 useEffect: User has ID, calling loadBrandingData');
      loadBrandingData()
    } else if (user === null) {
      console.log('🔍 useEffect: User is null, navigating to signin');
      navigate('/signin')
    } else {
      console.log('🔍 useEffect: User is undefined or has no ID');
    }
  }, [user?.id, navigate]) // Only depend on the user ID and navigate function

  const loadBrandingData = async () => {
    // Prevent multiple simultaneous calls
    if (loading) {
      console.log('🔍 loadBrandingData: Already loading, skipping...');
      return;
    }
    
    try {
      setLoading(true)
      console.log('🔍 loadBrandingData: Calling brandingAPI.getBranding...');
      const branding = await brandingAPI.getBranding(user.id)
      console.log('🔍 loadBrandingData: Received branding data:', branding);
      setSettings(branding)
      console.log('🔍 loadBrandingData: Settings updated successfully');
    } catch (error) {
      console.error('🔍 loadBrandingData: Error loading branding data:', error)
      setMessage({ type: 'error', text: 'Failed to load branding settings' })
    } finally {
      console.log('🔍 loadBrandingData: Setting loading to false');
      setLoading(false)
    }
  }

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0]
    if (file) {
      try {
        console.log('🔍 Uploading logo file:', file.name, file.size);
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('logo', file);
        formData.append('userId', user.id);
        
        // Upload to server
        const apiUrl = process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api';
        console.log('🔍 Uploading to:', `${apiUrl}/upload/logo`);
        
        const response = await fetch(`${apiUrl}/upload/logo`, {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('🔍 Logo uploaded successfully:', result.logoUrl);
          setSettings({ ...settings, logo: result.logoUrl });
        } else {
          console.error('🔍 Logo upload failed:', response.status);
          setMessage({ type: 'error', text: 'Failed to upload logo' });
        }
      } catch (error) {
        console.error('🔍 Logo upload error:', error);
        setMessage({ type: 'error', text: 'Failed to upload logo' });
      }
    }
  }

  const handleSaveBranding = async () => {
    try {
      setSaving(true)
      await brandingAPI.updateBranding({
        userId: user.id,
        logo: settings.logo,
        showLogoInAdmin: settings.showLogoInAdmin,
        primaryColor: settings.primaryColor
      })
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem('branding', JSON.stringify(settings));
      
      setMessage({ type: 'success', text: 'Branding settings saved successfully!' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      console.error('Error saving branding settings:', error)
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save branding settings' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SettingsPageLayout title="Branding">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-[var(--sf-text-secondary)]">Loading branding settings…</p>
          </div>
        </div>
      </SettingsPageLayout>
    )
  }

  return (
    <SettingsPageLayout
      title="Branding"
      subtitle="Customize your branding for emails, invoices, and the rescheduling page"
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

      {/* Content */}
            <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-6">
              <p className="text-[var(--sf-text-secondary)] mb-6">
                Customize your emails and rescheduling page to match your brand.
              </p>
              <p className="text-[var(--sf-text-secondary)] mb-8">
                You can customize branding and appearance of you booking page separately in{" "}
                <button 
                  onClick={() => navigate("/online-booking")}
                  className="text-primary-600 hover:text-primary-700"
                >
                  Online Booking &gt; Appearance and branding
                </button>
              </p>

              {/* Logo Upload */}
              <div className="mb-8">
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)] mb-1">Logo</h3>
                <p className="text-sm text-[var(--sf-text-muted)] mb-4">
                  HEIC, PNG, or JPG.
                  <br />
                  Recommended width: 512 pixels minimum.
                </p>
                <div className="mt-2">
                  <div className="border-2 border-dashed border-[var(--sf-border-light)] rounded-lg p-8 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label
                      htmlFor="logo-upload"
                      className="cursor-pointer text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
                    >
                      Click to upload logo
                    </label>
                  </div>
                </div>
                                 {settings.logo && (
                   <div className="mt-4">
                     <img 
                       src={settings.logo} 
                       alt="Logo preview" 
                       className="h-16 w-auto object-contain"
                       onError={(e) => {
                         console.error('Failed to load logo:', settings.logo);
                         e.target.style.display = 'none';
                       }}
                     />
                   </div>
                 )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-[var(--sf-text-secondary)]">Show logo in Serviceflow admin</span>
                  <button
                    onClick={() => setSettings({ ...settings, showLogoInAdmin: !settings.showLogoInAdmin })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 ${
                      settings.showLogoInAdmin ? "bg-primary-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.showLogoInAdmin ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)] mb-1">Primary color</h3>
                <p className="text-sm text-[var(--sf-text-muted)] mb-4">This color will be used for buttons and certain icons</p>
                <div className="grid grid-cols-8 gap-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSettings({ ...settings, primaryColor: color })}
                      className={`w-8 h-8 rounded-full ${
                        settings.primaryColor === color ? "ring-2 ring-offset-2 ring-gray-400" : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-4">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: settings.primaryColor }}
                    />
                    <span className="text-sm text-[var(--sf-text-secondary)] uppercase">{settings.primaryColor}</span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="mt-8 pt-6 border-t border-[var(--sf-border-light)]">
                <button
                  onClick={handleSaveBranding}
                  disabled={saving}
                  className="bg-[var(--sf-blue-500)] text-white px-6 py-2 rounded-md hover:bg-[var(--sf-blue-600)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
    </SettingsPageLayout>
  )
}

export default BrandingSettings