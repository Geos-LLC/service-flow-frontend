import React, { useState, useEffect } from 'react';
import { X, CheckCircle, User, DollarSign, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ConvertLeadModal = ({ 
  isOpen, 
  onClose, 
  lead, 
  onConvert
}) => {
  const navigate = useNavigate();
  const [createJob, setCreateJob] = useState(false);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen && lead) {
      // Reset form when modal opens
      setCreateJob(false);
    }
  }, [isOpen, lead]);
  
  const handleConvert = async () => {
    setLoading(true);
    try {
      // Convert lead to customer
      const result = await onConvert(lead.id);
      
      // If user wants to create a job, navigate to create job page with customer pre-selected
      if (createJob && result?.customer) {
        navigate(`/createjob?customerId=${result.customer.id}`);
      }
      
      // Close modal
      onClose();
    } catch (err) {
      console.error('Error converting lead:', err);
      // Error handling is done in parent component
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen || !lead) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[var(--sf-border-light)] flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-[var(--sf-text-primary)]">
            Convert Opportunity to Customer
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {/* Lead Information Preview */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mb-3">Opportunity Information</h3>
            <div className="bg-[var(--sf-bg-page)] rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-[var(--sf-text-muted)]" />
                <span className="text-[var(--sf-text-primary)] font-medium">
                  {lead.first_name} {lead.last_name}
                </span>
              </div>
              {lead.email && (
                <div className="flex items-center space-x-2 text-sm text-[var(--sf-text-secondary)]">
                  <span className="font-medium">Email:</span>
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center space-x-2 text-sm text-[var(--sf-text-secondary)]">
                  <span className="font-medium">Phone:</span>
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.company && (
                <div className="flex items-center space-x-2 text-sm text-[var(--sf-text-secondary)]">
                  <span className="font-medium">Company:</span>
                  <span>{lead.company}</span>
                </div>
              )}
              {lead.value && (
                <div className="flex items-center space-x-2 text-sm text-[var(--sf-text-secondary)]">
                  <DollarSign className="w-4 h-4 text-[var(--sf-text-muted)]" />
                  <span className="font-medium">Estimated Value:</span>
                  <span className="text-green-600 font-semibold">
                    ${parseFloat(lead.value).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Conversion Options */}
          <div className="mb-6">
            <div className="flex items-start space-x-3 p-4 bg-[var(--sf-blue-50)] border border-blue-200 rounded-lg">
              <input
                type="checkbox"
                id="createJob"
                checked={createJob}
                onChange={(e) => setCreateJob(e.target.checked)}
                className="mt-1 w-4 h-4 text-[var(--sf-blue-500)] border-[var(--sf-border-light)] rounded focus:ring-[var(--sf-blue-500)]"
                disabled={loading}
              />
              <div className="flex-1">
                <label htmlFor="createJob" className="text-sm font-medium text-[var(--sf-text-primary)] cursor-pointer">
                  Create job for this customer
                </label>
                <p className="text-xs text-[var(--sf-text-secondary)] mt-1">
                  You'll be taken to the create job page with this customer pre-selected
                </p>
              </div>
            </div>
          </div>
          
          {/* Info Message */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">What happens when you convert?</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>A new customer record will be created with the lead's information</li>
                  <li>The lead will be marked as converted and linked to the customer</li>
                  {createJob && (
                    <li>You'll be redirected to the create job page with this customer pre-selected</li>
                  )}
                  <li>You can view the customer in the Customers page</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 p-4 sm:p-6 border-t border-[var(--sf-border-light)] flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-[var(--sf-text-primary)] bg-[var(--sf-bg-page)] rounded-lg hover:bg-gray-200"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={loading}
            className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Converting...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Convert to Customer{createJob ? ' & Create Job' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConvertLeadModal;
