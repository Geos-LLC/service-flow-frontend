import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import NotificationTesting from '../../components/NotificationTesting';
import SettingsRailLayout from '../../components/settings-rail-layout';

const NotificationTestingSettings = () => {
  const [error] = useState('');

  return (
    <SettingsRailLayout
      title="Notification testing"
      section="Communications"
      subtitle="Send test messages to verify your email and SMS setup"
    >
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-600">{error}</span>
          </div>
        </div>
      )}
      <NotificationTesting />
    </SettingsRailLayout>
  );
};

export default NotificationTestingSettings;
