"use client"

import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import CalendarSyncSettings from "../../components/CalendarSyncSettings"
import { CheckCircle, AlertCircle } from "lucide-react"
import SettingsPageLayout from "../../components/settings-page-layout"

const CalendarSyncing = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [oauthMessage, setOauthMessage] = useState(null)

  useEffect(() => {
    // Check for OAuth callback parameters
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    
    if (success === 'connected') {
      setOauthMessage({ type: 'success', text: 'Google account connected successfully! Refresh token saved. You can now sync jobs to Google Calendar.' });
      // Remove query params from URL
      navigate('/settings/calendar-syncing', { replace: true });
      setTimeout(() => setOauthMessage(null), 5000);
    } else if (success === 'connected_no_refresh') {
      setOauthMessage({ type: 'warning', text: 'Google account connected, but no refresh token was provided. You may need to disconnect and reconnect to get a refresh token.' });
      // Remove query params from URL
      navigate('/settings/calendar-syncing', { replace: true });
      setTimeout(() => setOauthMessage(null), 8000);
    } else if (error) {
      const errorMessages = {
        'user_not_authenticated': 'You must be logged in to connect your Google account.',
        'user_not_found': 'User account not found. Please try logging in again.',
        'update_failed': 'Failed to save Google account connection. Please try again.',
        'callback_failed': 'Google OAuth callback failed. Please try again.',
        'invalid_client_credentials': 'Google OAuth client credentials are invalid. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your backend environment variables.'
      };
      setOauthMessage({ 
        type: 'error', 
        text: errorMessages[error] || 'Failed to connect Google account. Please try again.' 
      });
      // Remove query params from URL
      navigate('/settings/calendar-syncing', { replace: true });
      setTimeout(() => setOauthMessage(null), 5000);
    }
  }, [searchParams, navigate]);

  return (
    <SettingsPageLayout
      title="Calendar syncing"
      subtitle="Sync your ServiceFlow schedule to external calendar apps"
    >
      <div className="space-y-6">
            {/* OAuth Callback Messages */}
            {oauthMessage && (
              <div className={`p-4 rounded-lg border ${
                oauthMessage.type === 'success' 
                  ? 'bg-green-50 border-green-200' 
                  : oauthMessage.type === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center space-x-2">
                  {oauthMessage.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : oauthMessage.type === 'warning' ? (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={`text-sm font-medium ${
                    oauthMessage.type === 'success' 
                      ? 'text-green-800' 
                      : oauthMessage.type === 'warning'
                      ? 'text-yellow-800'
                      : 'text-red-800'
                  }`}>
                    {oauthMessage.text}
                  </span>
                </div>
              </div>
            )}

        {/* Google Calendar Sync Settings */}
        <CalendarSyncSettings />
      </div>
    </SettingsPageLayout>
  )
}

export default CalendarSyncing
