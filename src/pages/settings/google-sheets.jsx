import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle, AlertCircle, Download, Upload } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SheetsExport from '../../components/SheetsExport';
import GoogleSheetsImport from '../../components/GoogleSheetsImport';
import { authAPI } from '../../services/api';
import api from '../../services/api';
import SettingsPageLayout from '../../components/settings-page-layout';

const GoogleSheetsSettings = () => {
  const { user, refreshUserProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('export'); // 'export' or 'import'

  useEffect(() => {
    // Check if Google account is connected
    const isConnected = !!user?.google_access_token;
    setConnected(isConnected);
    console.log('Google connection status:', { isConnected, hasToken: !!user?.google_access_token, userId: user?.id });
  }, [user]);

  // Handle OAuth callback from Google redirect
  useEffect(() => {
    const successParam = searchParams.get('success');
    const errorParam = searchParams.get('error');
    
    if (successParam === 'true') {
      setSuccess('Google account connected successfully!');
      // Refresh user profile to get updated Google token
      if (refreshUserProfile) {
        // Refresh user profile - this will update the user state in AuthContext
        refreshUserProfile(false).catch((error) => {
          console.error('Error refreshing user profile:', error);
        });
      }
      // Clear URL params
      navigate('/settings/google-sheets', { replace: true });
      setTimeout(() => setSuccess(''), 5000);
    } else if (errorParam) {
      const errorMessages = {
        'user_not_authenticated': 'You must be logged in to connect your Google account.',
        'invalid_client_credentials': 'Google OAuth configuration error. Please contact support.',
        'access_denied': 'Google account connection was cancelled.',
      };
      setError(errorMessages[errorParam] || 'Failed to connect Google account. Please try again.');
      // Clear URL params
      navigate('/settings/google-sheets', { replace: true });
      setTimeout(() => setError(''), 5000);
    }
  }, [searchParams, navigate]);

  const handleConnectError = (error) => {
    setError(error.message || 'Failed to connect Google account');
    setTimeout(() => setError(''), 5000);
  };

  const handleConnectGoogle = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Get authorization URL from backend (uses authorization code flow with proper scopes)
      const { authUrl } = await authAPI.getGoogleAuthUrl();
      
      // Redirect to Google OAuth consent screen
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting Google account:', error);
      setError(error.response?.data?.error || 'Failed to connect Google account. Please try again.');
      setTimeout(() => setError(''), 5000);
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Clear Google tokens from database
      await api.put('/user/google-disconnect', {});
      
      setConnected(false);
      setSuccess('Google account disconnected successfully');
      setTimeout(() => setSuccess(''), 5000);
      
      // Refresh user data
      window.location.reload();
    } catch (error) {
      console.error('Disconnect error:', error);
      setError('Failed to disconnect Google account');
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsPageLayout
      title="Google Sheets"
      subtitle="Export data to Google Sheets and import from existing spreadsheets"
      maxWidth={1200}
    >
        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
              <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                {connected ? 'Connected' : 'Not Connected'}
              </h3>
            </div>
            {connected ? (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <div>
                {process.env.REACT_APP_GOOGLE_CLIENT_ID ? (
                  <>
                    <button
                      onClick={handleConnectGoogle}
                      disabled={loading}
                      className="w-full sm:w-auto px-6 py-2.5 bg-white border-2 border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-page)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sf-blue-500)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-colors"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      <span className="text-[var(--sf-text-primary)] font-medium">
                        {loading ? 'Connecting...' : 'Connect Google Account'}
                      </span>
                    </button>
                    <p className="text-xs text-[var(--sf-text-muted)] mt-2">
                      Clicking the button will redirect you to Google to authorize access to Sheets and Calendar. 
                      You'll be redirected back after authorization.
                    </p>
                  </>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-red-800 mb-1">Configuration Required</h4>
                        <p className="text-sm text-red-700">
                          Google Client ID is not configured. Please set <code className="bg-red-100 px-1 rounded">REACT_APP_GOOGLE_CLIENT_ID</code> in your environment variables to enable Google Sheets integration.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {connected ? (
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Your Google account is connected and ready to use.</span>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800 mb-1">Connect Your Google Account</h4>
                  <p className="text-sm text-yellow-700">
                    To use Google Sheets integration, you need to connect your Google account. 
                    This will allow you to export data to Google Sheets and import data from existing spreadsheets.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              <span>{success}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] mb-6">
          <div className="border-b border-[var(--sf-border-light)]">
            <nav className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('export')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'export'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4" />
                  <span>Export to Sheets</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'import'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:border-[var(--sf-border-light)]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Upload className="w-4 h-4" />
                  <span>Import from Sheets</span>
                </div>
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'export' ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Export Data to Google Sheets</h3>
                  <p className="text-[var(--sf-text-secondary)] text-sm mb-6">
                    Export your customers or jobs data directly to a new Google Spreadsheet.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Export Customers */}
                  <div className="border border-[var(--sf-border-light)] rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Download className="w-5 h-5 text-[var(--sf-blue-500)]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--sf-text-primary)]">Export Customers</h4>
                        <p className="text-sm text-[var(--sf-text-secondary)]">Export all customer data</p>
                      </div>
                    </div>
                    <SheetsExport
                      exportType="customers"
                      onSuccess={(result) => {
                        setSuccess(`Customers exported successfully! Opening spreadsheet...`);
                        if (result.spreadsheetUrl) {
                          window.open(result.spreadsheetUrl, '_blank');
                        }
                        setTimeout(() => setSuccess(''), 5000);
                      }}
                      onError={(error) => {
                        setError(error.response?.data?.error || 'Failed to export customers');
                        setTimeout(() => setError(''), 5000);
                      }}
                    />
                  </div>

                  {/* Export Jobs */}
                  <div className="border border-[var(--sf-border-light)] rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Download className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--sf-text-primary)]">Export Jobs</h4>
                        <p className="text-sm text-[var(--sf-text-secondary)]">Export all job data</p>
                      </div>
                    </div>
                    <SheetsExport
                      exportType="jobs"
                      onSuccess={(result) => {
                        setSuccess(`Jobs exported successfully! Opening spreadsheet...`);
                        if (result.spreadsheetUrl) {
                          window.open(result.spreadsheetUrl, '_blank');
                        }
                        setTimeout(() => setSuccess(''), 5000);
                      }}
                      onError={(error) => {
                        setError(error.response?.data?.error || 'Failed to export jobs');
                        setTimeout(() => setError(''), 5000);
                      }}
                    />
                  </div>
                </div>

                <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">How Export Works</h4>
                  <ul className="text-sm text-[var(--sf-blue-500)] space-y-1">
                    <li>• A new Google Spreadsheet will be created automatically</li>
                    <li>• All your data will be formatted and organized in columns</li>
                    <li>• The spreadsheet will be accessible in your Google Drive</li>
                    <li>• You can share, edit, or download the spreadsheet anytime</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-2">Import Data from Google Sheets</h3>
                  <p className="text-[var(--sf-text-secondary)] text-sm mb-6">
                    Import customers or jobs from an existing Google Spreadsheet. You'll be able to map fields manually.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Import Customers */}
                  <div className="border border-[var(--sf-border-light)] rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Upload className="w-5 h-5 text-[var(--sf-blue-500)]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--sf-text-primary)]">Import Customers</h4>
                        <p className="text-sm text-[var(--sf-text-secondary)]">Import customer data from a spreadsheet</p>
                      </div>
                    </div>
                    <GoogleSheetsImport
                      importType="customers"
                      onSuccess={(result) => {
                        setSuccess(`Successfully imported ${result.imported || 0} customers!`);
                        setTimeout(() => setSuccess(''), 5000);
                      }}
                      onError={(error) => {
                        setError(error.response?.data?.error || 'Failed to import customers');
                        setTimeout(() => setError(''), 5000);
                      }}
                    />
                  </div>

                  {/* Import Jobs */}
                  <div className="border border-[var(--sf-border-light)] rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Upload className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--sf-text-primary)]">Import Jobs</h4>
                        <p className="text-sm text-[var(--sf-text-secondary)]">Import job data from a spreadsheet</p>
                      </div>
                    </div>
                    <GoogleSheetsImport
                      importType="jobs"
                      onSuccess={(result) => {
                        setSuccess(`Successfully imported ${result.imported || 0} jobs!`);
                        setTimeout(() => setSuccess(''), 5000);
                      }}
                      onError={(error) => {
                        setError(error.response?.data?.error || 'Failed to import jobs');
                        setTimeout(() => setError(''), 5000);
                      }}
                    />
                  </div>
                </div>

                <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">How Import Works</h4>
                  <ul className="text-sm text-[var(--sf-blue-500)] space-y-1">
                    <li>• Select a Google Spreadsheet from your Google Drive</li>
                    <li>• Preview the data to verify it looks correct</li>
                    <li>• Map spreadsheet columns to Serviceflow fields</li>
                    <li>• Choose to skip duplicates or update existing records</li>
                    <li>• Import your data with one click</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="bg-white rounded-lg shadow-sm border border-[var(--sf-border-light)] p-6">
          <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">Need Help?</h3>
          <div className="space-y-3 text-sm text-[var(--sf-text-secondary)]">
            <p>
              <strong>Export:</strong> Your data will be exported to a new Google Spreadsheet. 
              The spreadsheet will be created in your Google Drive and you'll receive a link to open it.
            </p>
            <p>
              <strong>Import:</strong> You can import data from any Google Spreadsheet you have access to. 
              The import wizard will guide you through selecting the spreadsheet, previewing data, and mapping fields.
            </p>
            <p>
              <strong>Permissions:</strong> This integration requires access to your Google Sheets and Google Drive. 
              You can revoke access at any time in your Google account settings.
            </p>
          </div>
        </div>
    </SettingsPageLayout>
  );
};

export default GoogleSheetsSettings;

