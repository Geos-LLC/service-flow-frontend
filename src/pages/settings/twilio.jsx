import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import TwilioAPISetup from '../../components/TwilioAPISetup';
import DefaultPhoneSelector from '../../components/DefaultPhoneSelector';
import SettingsPageLayout from '../../components/settings-page-layout';

const TwilioSettings = () => {
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback
    const connected = searchParams.get('connected');
    const errorParam = searchParams.get('error');

    if (connected === 'true') {
      setError('');
    } else if (errorParam) {
      setError('Failed to connect Twilio account. Please try again.');
    }
  }, [searchParams]);

  return (
    <SettingsPageLayout
      title="SMS notifications"
      subtitle="Configure Twilio to send automated SMS messages to customers"
    >
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-600">{error}</span>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Twilio API Setup */}
        <TwilioAPISetup
          onSuccess={() => {
            setError('');
          }}
          onError={(error) => {
            setError(error.message || 'Failed to connect Twilio account');
          }}
        />

        {/* Default Phone Number Selector */}
        <DefaultPhoneSelector />

        {/* Features */}
        <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">SMS Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Job Confirmations</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Automatically send SMS when jobs are confirmed
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Payment Reminders</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Send SMS reminders for overdue invoices
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Custom Messages</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Send custom SMS messages to customers
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Your Phone Number</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Use your own Twilio phone number for SMS
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Help */}
        <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Need Help?</h2>
          <p className="text-sm text-blue-800 mb-4">
            Twilio Connect allows you to use your own Twilio account for SMS messaging. 
            You'll be billed directly by Twilio for SMS usage.
          </p>
          <div className="space-y-2">
            <a
              href="https://www.twilio.com/docs/connect"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-[var(--sf-blue-500)] hover:text-blue-800 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Learn about Twilio Connect</span>
            </a>
            <a
              href="https://www.twilio.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-[var(--sf-blue-500)] hover:text-blue-800 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Twilio SMS Pricing</span>
            </a>
          </div>
        </div>
      </div>
    </SettingsPageLayout>
  );
};

export default TwilioSettings;
