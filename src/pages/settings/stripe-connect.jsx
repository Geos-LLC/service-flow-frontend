import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import StripeAPISetup from '../../components/StripeAPISetup';
import SettingsPageLayout from '../../components/settings-page-layout';

const StripeConnectSettings = () => {
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback
    const connected = searchParams.get('connected');
    const errorParam = searchParams.get('error');

    if (connected === 'true') {
      setError('');
    } else if (errorParam) {
      setError('Failed to connect Stripe account. Please try again.');
    }
  }, [searchParams]);

  return (
    <SettingsPageLayout
      title="Stripe Connect"
      subtitle="Process payments and accept online payments from customers via your own Stripe account"
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
        {/* Stripe API Setup */}
        <StripeAPISetup
          onSuccess={() => {
            setError('');
          }}
          onError={(error) => {
            setError(error.message || 'Failed to connect Stripe account');
          }}
        />

        {/* Features */}
        <div className="bg-white border border-[var(--sf-border-light)] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-4">Payment Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Online Payments</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Accept credit card payments from customers online
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Invoice Payments</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Customers can pay invoices directly online
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Recurring Payments</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Set up automatic recurring payments for subscriptions
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-[var(--sf-text-primary)]">Your Stripe Account</h3>
                <p className="text-sm text-[var(--sf-text-secondary)]">
                  Use your own Stripe account and receive payments directly
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Help */}
        <div className="bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Need Help?</h2>
          <p className="text-sm text-blue-800 mb-4">
            Stripe Connect allows you to use your own Stripe account for payment processing. 
            You'll be billed directly by Stripe for payment processing fees.
          </p>
          <div className="space-y-2">
            <a
              href="https://stripe.com/docs/connect"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-[var(--sf-blue-500)] hover:text-blue-800 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Learn about Stripe Connect</span>
            </a>
            <a
              href="https://stripe.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 text-[var(--sf-blue-500)] hover:text-blue-800 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Stripe Pricing</span>
            </a>
          </div>
        </div>
      </div>
    </SettingsPageLayout>
  );
};

export default StripeConnectSettings;
