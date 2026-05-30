import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api',
  timeout: 30000, // Back to 30 seconds since we fixed the email hanging issue
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    console.log('API Request:', config.method?.toUpperCase(), config.url, 'Token:', token ? 'Present' : 'Missing');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


// Response interceptor for error handling with retry logic
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  async (error) => {
    const config = error?.config;
    if (!config) {
      return Promise.reject(error);
    }
    
    // Handle 429 (Too Many Requests) with exponential backoff
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : null;
      
      // Initialize retry count if not exists
      if (!config.__retryCount) {
        config.__retryCount = 0;
      }
      
      // Don't retry more than 3 times for 429 errors
      if (config.__retryCount >= 3) {
        console.error('❌ Rate limit exceeded - too many retries. Please wait before making more requests.');
        return Promise.reject(error);
      }
      
      config.__retryCount++;
      
      // Calculate delay: use retry-after header if available, otherwise exponential backoff
      const delay = retryDelay || Math.min(1000 * Math.pow(2, config.__retryCount), 30000); // Max 30 seconds
      
      console.warn(`⚠️ Rate limit (429) - Retrying in ${delay}ms (attempt ${config.__retryCount}/3):`, config.url);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return api(config);
    }
    
    // Don't retry if we've already retried or if it's not a network error
    if (config.__retryCount >= 3 || (error.response?.status && error.response?.status !== 429)) {
      // Handle non-network errors normally
      if (error.response) {
        const { status, data } = error.response;
        
        switch (status) {
          case 401: {
            // Only redirect on actual SF session failures. SF's auth middleware
            // emits specific error codes ('Access token required' | 'Token expired').
            // Any other 401 — including upstream proxied 401s from Sigcore /
            // OpenPhone / LeadBridge — must NOT clear the session, because doing
            // so dumps the user back to /signin even though their SF token is fine.
            const isPaymentContext = window.location.pathname.includes('/payment') ||
                                     window.location.pathname.includes('/public/');
            const isSigninPage = window.location.pathname.includes('/signin');
            const errCode = data?.error;
            const isSfSessionFailure = errCode === 'Access token required' || errCode === 'Token expired';

            if (isSfSessionFailure && !isPaymentContext && !isSigninPage) {
              console.warn('SF session expired — clearing tokens and redirecting to /signin', { url: config?.url, errCode });
              localStorage.removeItem('authToken');
              localStorage.removeItem('user');
              window.location.href = '/signin';
            } else if (isSigninPage) {
              console.log('Already on signin page — not redirecting');
            } else if (isPaymentContext) {
              console.log('Payment context detected — not redirecting to login');
            } else {
              // Non-session 401 (upstream proxy auth failure). Preserve session;
              // propagate the error so the calling component can surface it.
              console.warn('Non-session 401 — preserving session, propagating error', { url: config?.url, errCode });
            }
            break;
          }
          case 403:
            console.error('Access forbidden');
            break;
          case 404:
            console.error('Resource not found');
            break;
          case 500:
            console.error('Server error occurred');
            break;
          default:
            console.error('API error:', data?.error || 'Unknown error');
        }
      } else if (error.request) {
        console.error('Network error - no response received');
      } else {
        console.error('Request setup error:', error.message);
      }
      
      return Promise.reject(error);
    }
    
    // Only retry on network errors (ERR_NETWORK, ERR_FAILED, timeout, Railway cold start)
    // Skip retries for non-critical endpoints that already handle errors gracefully
    const nonCriticalPaths = ['/notification-settings', '/twilio/phone-numbers'];
    const isNonCritical = nonCriticalPaths.some(p => config.url?.includes(p));
    if (!isNonCritical && (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || error.code === 'ECONNABORTED' ||
        error.message?.includes('Failed to fetch') || error.message?.includes('CORS') ||
        error.message?.includes('preflight'))) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      
      console.log(`🔄 Retrying request (attempt ${config.__retryCount}/3):`, config.url);
      console.log(`🔄 Error details:`, error.message);
      
      // Wait longer for Railway cold start (exponential backoff with longer delays)
      const delay = 2000 * config.__retryCount; // 2s, 4s, 6s
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return api(config);
    }
    
    // Don't log canceled requests as errors - they're expected behavior
    if (error.message === 'canceled' || error.code === 'ERR_CANCELED') {
      console.log('🔄 Request was canceled - this is expected behavior');
      return Promise.reject(error);
    }
    
    console.error('API Error:', error.response?.status, error.response?.config?.url, error.message);
    return Promise.reject(error);
  }
);

// Authentication API functions
export const authAPI = {
  signup: async (userData) => {
    try {
      const response = await api.post('/auth/signup', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  signin: async (credentials) => {
    try {
      const response = await api.post('/auth/signin', credentials);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  signout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('authToken');
  },

  googleAuth: async (googleData) => {
    try {
      const response = await api.post('/auth/google', googleData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  connectGoogle: async (googleData) => {
    try {
      const response = await api.post('/auth/connect-google', googleData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getGoogleAuthUrl: async () => {
    try {
      console.log('🔗 Calling /auth/google/authorize endpoint...');
      const response = await api.get('/auth/google/authorize');
      console.log('🔗 Authorization URL response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting Google auth URL:', error.response?.data || error.message);
      throw error;
    }
  },
  deleteAccount: async (userId) => {
    try {
      const response = await api.delete(`/auth/delete-account/${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Services API functions
export const servicesAPI = {
  getAll: async (userId) => {
    try {
      console.log('🌐 API: Fetching services for user:', userId)
      const response = await api.get(`/services?userId=${userId}`);
      console.log('🌐 API: Services response:', response.data)
      return response.data;
    } catch (error) {
      console.error('🌐 API: Services fetch error:', error)
      throw error;
    }
  },

  getById: async (id) => {
    try {
      console.log('🔍 API: Getting service by ID:', id);
      const response = await api.get(`/services/${id}`);
      console.log('🔍 API: Service response:', response.data);
      console.log('🔍 API: Service modifiers:', response.data.modifiers);
      return response.data;
    } catch (error) {
      console.error('🔍 API: Error getting service:', error);
      throw error;
    }
  },

  create: async (serviceData) => {
    try {
      const response = await api.post('/services', serviceData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, serviceData) => {
    try {
      const response = await api.put(`/services/${id}`, serviceData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/services/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteAll: async () => {
    try {
      const response = await api.delete('/services/all');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getServiceSettings: async () => {
    try {
      const response = await api.get('/services/settings');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateServiceSettings: async (settings) => {
    try {
      const response = await api.put('/services/settings', settings);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getServiceCategories: async (userId) => {
    try {
      const response = await api.get(`/services/categories?userId=${userId}`);
      // The server returns { data: categories }, so we need to extract the data property
      return response.data.data || response.data;
    } catch (error) {
      throw error;
    }
  },

  createCategory: async (categoryData) => {
    try {
      const response = await api.post('/services/categories', categoryData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateCategory: async (id, categoryData) => {
    try {
      const response = await api.put(`/services/categories/${id}`, categoryData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteCategory: async (id) => {
    try {
      console.log('🔄 deleteCategory API called with id:', id);
      console.log('🔄 Making DELETE request to:', `/services/categories/${id}`);
      console.log('🔄 About to make API call...');
      
      const response = await api.delete(`/services/categories/${id}`);
      console.log('✅ DELETE response received:', response);
      console.log('✅ DELETE response data:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ DELETE request failed:', error);
      console.error('❌ Error type:', typeof error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      if (error.response) {
        console.error('❌ Response status:', error.response.status);
        console.error('❌ Response data:', error.response.data);
      }
      throw error;
    }
  },

  getServices: async () => {
    try {
      const response = await api.get('/services');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};


export const customersAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.search) queryParams.append('search', params.search);
      if (params.status) queryParams.append('status', params.status);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      
      console.log('Making customers API call with params:', { userId, ...params });
      const response = await api.get(`/customers?${queryParams}`);
      console.log('Customers API response:', response);
      
      return response.data.customers || response.data;
    } catch (error) {
      console.error('Customers API error:', error);
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/customers/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (customerData) => {
    try {
      const response = await api.post('/customers', customerData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, customerData) => {
    try {
      const response = await api.put(`/customers/${id}`, customerData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id, userId) => {
    try {
      const response = await api.delete(`/customers/${id}?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteAll: async () => {
    try {
      const response = await api.delete('/customers/all');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  export: async (format = 'csv') => {
    try {
      if (format === 'csv') {
        // For CSV, we need to get the raw response text
        const response = await api.get(`/customers/export?format=${format}`, {
          responseType: 'text'
        });
        return response.data;
      } else {
        // For JSON, return the parsed data
        const response = await api.get(`/customers/export?format=${format}`);
        return response.data;
      }
    } catch (error) {
      throw error;
    }
  },

  importCustomers: async (customers) => {
    try {
      const response = await api.post('/customers/import', { customers });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Customer Properties API — multi-address support per customer
export const customerPropertiesAPI = {
  list: async (customerId) => {
    const response = await api.get(`/customers/${customerId}/properties`);
    return response.data.properties || [];
  },

  create: async (customerId, payload) => {
    const response = await api.post(`/customers/${customerId}/properties`, payload);
    return response.data.property;
  },

  update: async (customerId, propertyId, payload) => {
    const response = await api.patch(`/customers/${customerId}/properties/${propertyId}`, payload);
    return response.data.property;
  },

  remove: async (customerId, propertyId) => {
    const response = await api.delete(`/customers/${customerId}/properties/${propertyId}`);
    return response.data;
  },
};


// Estimates API functions
export const estimatesAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.status) queryParams.append('status', params.status);
      if (params.customerId) queryParams.append('customerId', params.customerId);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      
      const response = await api.get(`/estimates?${queryParams}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/estimates/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (estimateData) => {
    try {
      const response = await api.post('/estimates', estimateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, estimateData) => {
    try {
      const response = await api.put(`/estimates/${id}`, estimateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/estimates/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  send: async (id) => {
    try {
      const response = await api.post(`/estimates/${id}/send`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  convertToInvoice: async (id, dueDate) => {
    try {
      const response = await api.post(`/estimates/${id}/convert-to-invoice`, { dueDate });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Invoices API functions
export const invoicesAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.search) queryParams.append('search', params.search);
      if (params.status) queryParams.append('status', params.status);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      if (params.customerId) queryParams.append('customerId', params.customerId);
      
      const response = await api.get(`/invoices?${queryParams}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (id, userId) => {
    try {
      const response = await api.get(`/invoices/${id}?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (invoiceData) => {
    try {
      const response = await api.post('/invoices', invoiceData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, invoiceData, userId) => {
    try {
      const response = await api.put(`/invoices/${id}`, { ...invoiceData, userId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateStatus: async (id, status, userId) => {
    try {
      const response = await api.put(`/invoices/${id}/status`, { userId, status });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id, userId) => {
    try {
      const response = await api.delete(`/invoices/${id}?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  send: async (invoiceId, invoiceData) => {
    try {
      const response = await api.post('/send-invoice-email', {
        invoiceId,
        ...invoiceData
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// User profile API functions
export const userProfileAPI = {
  getProfile: async (userId) => {
    try {
      // Note: userId parameter is kept for compatibility but endpoint uses JWT token
      // The endpoint will automatically detect if user is team member or account owner
      const response = await api.get(`/user/profile`);
      console.log('🔍 userProfileAPI.getProfile response:', response.data);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('Request timeout - please check your connection');
      }
      throw error;
    }
  },

  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/user/profile', profileData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateProfilePicture: async (userId, file, isTeamMember = false) => {
    try {
      console.log('🔍 Uploading profile picture for:', isTeamMember ? 'team member' : 'account owner', userId);
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('profilePicture', file);
      formData.append('userId', userId);
      formData.append('isTeamMember', isTeamMember.toString());
      
      // Upload to server
      const apiUrl = process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api';
      console.log('🔍 Uploading to:', `${apiUrl}/upload/profile-picture`);
      
      const response = await fetch(`${apiUrl}/upload/profile-picture`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('🔍 Profile picture uploaded successfully:', result.profilePictureUrl);
        return { profilePicture: result.profilePictureUrl };
      } else {
        console.error('🔍 Profile picture upload failed:', response.status);
        throw new Error('Failed to upload profile picture');
      }
    } catch (error) {
      console.error('🔍 Profile picture upload error:', error);
      throw error;
    }
  },

  removeProfilePicture: async (userId, isTeamMember = false) => {
    try {
      console.log('🔍 Removing profile picture for:', isTeamMember ? 'team member' : 'account owner', userId);
      
      const apiUrl = process.env.REACT_APP_API_URL || 'https://service-flow-backend-production-4568.up.railway.app/api';
      console.log('🔍 Removing from:', `${apiUrl}/user/profile-picture`);
      
      // Note: Backend now uses JWT token to determine user/team member, so we don't need to send userId
      const response = await fetch(`${apiUrl}/user/profile-picture`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (response.ok) {
        console.log('🔍 Profile picture removed successfully');
        return { success: true };
      } else {
        console.error('🔍 Profile picture removal failed:', response.status);
        throw new Error('Failed to remove profile picture');
      }
    } catch (error) {
      console.error('🔍 Profile picture removal error:', error);
      throw error;
    }
  },

  updatePassword: async (passwordData) => {
    try {
      const response = await api.put('/user/password', passwordData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateEmail: async (emailData) => {
    try {
      const response = await api.put('/user/email', emailData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Notification Templates API functions
export const notificationTemplatesAPI = {
  getTemplates: async (userId, templateType = null, notificationName = null) => {
    try {
      const params = new URLSearchParams({ userId });
      if (templateType) params.append('templateType', templateType);
      if (notificationName) params.append('notificationName', notificationName);
      
      const response = await api.get(`/user/notification-templates?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTemplate: async (templateData) => {
    try {
      const response = await api.put('/user/notification-templates', templateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Notification Settings API functions
export const notificationSettingsAPI = {
  getSettings: async (userId) => {
    try {
      const response = await api.get(`/user/notification-settings?userId=${userId}`);
      // Ensure we return an array even if the response structure is different
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data?.settings && Array.isArray(response.data.settings)) {
        return response.data.settings;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      // If response is not an array, return empty array to prevent errors
      console.warn('Notification settings API returned unexpected format:', response.data);
      return [];
    } catch (error) {
      // Log the error but return empty array instead of throwing
      // This allows the app to continue functioning even if the API fails
      console.warn('Failed to load notification settings (using defaults):', error.response?.status, error.message);
      return []; // Return empty array so calling code can continue
    }
  },

  updateSetting: async (settingData) => {
    try {
      const response = await api.put('/user/notification-settings', settingData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Public booking API functions
export const publicBookingAPI = {
  getUserBySlug: async (slug) => {
    try {
      const response = await api.get(`/public/user/${slug}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getServices: async (userId) => {
    try {
      const response = await api.get(`/public/services/${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getBusinessInfo: async (userId) => {
    try {
      const response = await api.get(`/public/user/${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAvailability: async (userId, date) => {
    try {
      const response = await api.get(`/public/availability/${userId}?date=${date}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createBooking: async (bookingData) => {
    try {
      const response = await api.post('/public/bookings', bookingData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Jobs API functions
export const recurringBookingsAPI = {
  getAll: async (status = 'active') => {
    try {
      const response = await api.get(`/recurring-bookings?status=${status}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export const jobsAPI = {
  getAll: async (userId, status, search, page = 1, limit = 20, dateFilter, dateRange, sortBy, sortOrder, teamMember, invoiceStatus, customerId, territoryId, recurring, signal) => {
    try {
      const params = new URLSearchParams({ userId });
      if (status) params.append('status', status);
      if (search) params.append('search', search);
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      if (dateFilter) params.append('dateFilter', dateFilter);
      if (dateRange) params.append('dateRange', dateRange);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      if (teamMember) params.append('teamMember', teamMember);
      if (invoiceStatus) params.append('invoiceStatus', invoiceStatus);
      if (customerId) params.append('customerId', customerId);
      if (territoryId) params.append('territoryId', territoryId);
      if (recurring) params.append('recurring', recurring);
      
      const config = signal ? { signal } : {};
      const response = await api.get(`/jobs?${params}`, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/jobs/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (jobData) => {
    try {
      const response = await api.post('/jobs', jobData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, jobData) => {
    try {
      const response = await api.put(`/jobs/${id}`, jobData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Multi-line per-cleaner incentives on a job.
  listIncentives: async (jobId) => {
    const response = await api.get(`/jobs/${jobId}/incentives`);
    return response.data;
  },
  addIncentive: async (jobId, payload) => {
    const response = await api.post(`/jobs/${jobId}/incentives`, payload);
    return response.data;
  },
  updateIncentive: async (jobId, incentiveId, payload) => {
    const response = await api.patch(`/jobs/${jobId}/incentives/${incentiveId}`, payload);
    return response.data;
  },
  deleteIncentive: async (jobId, incentiveId) => {
    const response = await api.delete(`/jobs/${jobId}/incentives/${incentiveId}`);
    return response.data;
  },

  convertToRecurring: async (id, data) => {
    try {
      const response = await api.post(`/jobs/${id}/convert-to-recurring`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateRecurringFrequency: async (id, data) => {
    try {
      const response = await api.put(`/jobs/${id}/recurring-frequency`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  duplicate: async (id, data) => {
    try {
      const response = await api.post(`/jobs/${id}/duplicate`, data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getImportedJobsCount: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      const queryString = queryParams.toString();
      const url = `/jobs/imported/count${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteImportedJobs: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      const queryString = queryParams.toString();
      const url = `/jobs/delete-imported${queryString ? `?${queryString}` : ''}`;
      const response = await api.delete(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get available jobs for workers
  getAvailableForWorkers: async () => {
    try {
      const response = await api.get('/jobs/available-for-workers');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Claim a job (for workers)
  claim: async (jobId, notes) => {
    try {
      const response = await api.post(`/jobs/${jobId}/claim`, { notes });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/jobs/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteAll: async () => {
    try {
      const response = await api.delete('/jobs/all');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateStatus: async (id, status) => {
    try {
      const response = await api.patch(`/jobs/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Cancel a job with optional financial adjustments (fee, reimbursement).
  // payload: { cancellation_fee, cleaner_reimbursement, reimbursement_team_member_id, reason, notes }
  cancel: async (id, payload = {}) => {
    try {
      const response = await api.post(`/jobs/${id}/cancel`, payload);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  assignToTeamMember: async (jobId, teamMemberId) => {
    try {
      const response = await api.post(`/jobs/${jobId}/assign`, { teamMemberId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  removeTeamMember: async (jobId, teamMemberId) => {
    try {
      const response = await api.delete(`/jobs/${jobId}/assign/${teamMemberId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  assignMultipleTeamMembers: async (jobId, teamMemberIds, primaryMemberId, forceBook = false) => {
    try {
      const response = await api.post(`/jobs/${jobId}/assign-multiple`, {
        teamMemberIds,
        primaryMemberId,
        forceBook
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getTeamAssignments: async (jobId) => {
    try {
      const response = await api.get(`/jobs/${jobId}/assignments`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  export: async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
          params.append(key, filters[key]);
        }
      });
      
      const response = await api.get(`/jobs/export?${params.toString()}`, {
        responseType: 'text'
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  importJobs: async (jobs) => {
    try {
      // Use a longer timeout for import operations (2 minutes)
      const response = await api.post('/jobs/import', { jobs }, { timeout: 120000 });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAvailableSlots: async ({ date, duration, workerId, serviceId, customerAddress }) => {
    try {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      if (duration) params.append('duration', duration);
      if (workerId) params.append('workerId', workerId);
      if (serviceId) params.append('serviceId', serviceId);
      if (customerAddress) params.append('customerAddress', customerAddress);

      const response = await api.get(`/jobs/available-slots?${params.toString()}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

};

// Team Management API functions
export const teamAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.status) queryParams.append('status', params.status);
      if (params.search) queryParams.append('search', params.search);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      
      const response = await api.get(`/team-members?${queryParams}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/team-members/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (teamMemberData) => {
    try {
      const response = await api.post('/team-members/register', teamMemberData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, teamMemberData) => {
    try {
      const response = await api.put(`/team-members/${id}`, teamMemberData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/team-members/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAvailability: async (id, startDate, endDate) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/team-members/${id}/availability?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateAvailability: async (id, availability) => {
    try {
      const response = await api.put(`/team-members/${id}/availability`, { availability });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Time tracking and salary
  recordStartTime: async (jobId, startTime) => {
    try {
      const response = await api.post(`/jobs/${jobId}/start-time`, { startTime });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  recordEndTime: async (jobId, endTime) => {
    try {
      const response = await api.post(`/jobs/${jobId}/end-time`, { endTime });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getSalary: async (teamMemberId, startDate, endDate) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await api.get(`/team-members/${teamMemberId}/salary?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Pay rate history
  getPayRates: async (teamMemberId) => {
    const response = await api.get(`/team-members/${teamMemberId}/pay-rates`);
    return response.data;
  },

  addPayRate: async (teamMemberId, rateData) => {
    const response = await api.post(`/team-members/${teamMemberId}/pay-rates`, rateData);
    return response.data;
  },

  updatePayRate: async (teamMemberId, rateId, rateData) => {
    const response = await api.put(`/team-members/${teamMemberId}/pay-rates/${rateId}`, rateData);
    return response.data;
  },

  deletePayRate: async (teamMemberId, rateId) => {
    const response = await api.delete(`/team-members/${teamMemberId}/pay-rates/${rateId}`);
    return response.data;
  },

  getAnalytics: async (userId, startDate, endDate) => {
    try {
      const params = new URLSearchParams({ userId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/team-analytics?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  resendInvite: async (memberId) => {
    try {
      const response = await api.post(`/team-members/${memberId}/resend-invite`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPerformance: async (memberId) => {
    try {
      const response = await api.get(`/team-members/${memberId}/performance`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getSettings: async (memberId) => {
    try {
      const response = await api.get(`/team-members/${memberId}/settings`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateSettings: async (memberId, settings) => {
    try {
      const response = await api.put(`/team-members/${memberId}/settings`, { settings });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Payroll API functions
export const payrollAPI = {
  getPayroll: async (startDate, endDate, jobFilter = 'completed') => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (jobFilter && jobFilter !== 'completed') params.append('jobFilter', jobFilter);
      const response = await api.get(`/payroll?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getSalaryAnalytics: async (startDate, endDate, groupBy = 'day') => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (groupBy) params.append('groupBy', groupBy);
      const response = await api.get(`/analytics/salary?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  updateJobPayroll: async (jobId, data) => {
    const response = await api.patch(`/jobs/${jobId}/payroll`, data);
    return response.data;
  }
};

// Staff Locations API functions
export const staffLocationsAPI = {
  // Record a staff location
  recordLocation: async (locationData) => {
    try {
      const response = await api.post('/staff-locations', locationData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get current staff locations
  getLocations: async (teamMemberId = null) => {
    try {
      const params = new URLSearchParams();
      if (teamMemberId) params.append('teamMemberId', teamMemberId);
      const response = await api.get(`/staff-locations?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get location history for a team member
  getLocationHistory: async (teamMemberId, startDate = null, endDate = null, limit = 100) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (limit) params.append('limit', limit);
      const response = await api.get(`/staff-locations/${teamMemberId}/history?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get global staff locations setting
  getStaffLocationsSetting: async () => {
    try {
      const response = await api.get('/user/staff-locations-setting');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update global staff locations setting
  updateStaffLocationsSetting: async (enabled) => {
    try {
      const response = await api.put('/user/staff-locations-setting', { staff_locations_enabled: enabled });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Service Templates API functions
export const serviceTemplatesAPI = {
  getAll: async () => {
    try {
      const response = await api.get('/service-templates');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Service Availability API functions
export const serviceAvailabilityAPI = {
  getAvailability: async (serviceId) => {
    try {
      const response = await api.get(`/services/${serviceId}/availability`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateAvailability: async (serviceId, availabilityData) => {
    try {
      const response = await api.put(`/services/${serviceId}/availability`, availabilityData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createSchedulingRule: async (serviceId, ruleData) => {
    try {
      const response = await api.post(`/services/${serviceId}/scheduling-rules`, ruleData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteSchedulingRule: async (serviceId, ruleId) => {
    try {
      const response = await api.delete(`/services/${serviceId}/scheduling-rules/${ruleId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createTimeslotTemplate: async (serviceId, templateData) => {
    try {
      const response = await api.post(`/services/${serviceId}/timeslot-templates`, templateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTimeslotTemplate: async (serviceId, templateId, templateData) => {
    try {
      const response = await api.put(`/services/${serviceId}/timeslot-templates/${templateId}`, templateData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTimeslotTemplate: async (serviceId, templateId) => {
    try {
      const response = await api.delete(`/services/${serviceId}/timeslot-templates/${templateId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Availability API functions
export const availabilityAPI = {
  getAvailability: async (userId) => {
    try {
      // Try with userId in query first, then fallback to using auth token
      const response = await api.get(`/user/availability?userId=${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching availability:', error);
      // If it fails with userId, try without (uses auth token)
      if (error.response?.status === 401 || error.response?.status === 400) {
        try {
          const response = await api.get('/user/availability');
          return response.data;
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
          throw retryError;
        }
      }
      throw error;
    }
  },

  updateAvailability: async (availabilityData) => {
    try {
      const response = await api.put('/user/availability', availabilityData);
      return response.data;
    } catch (error) {
      console.error('Error updating availability:', error);
      throw error;
    }
  }
};

// Service areas API functions
export const serviceAreasAPI = {
  getServiceAreas: async (userId) => {
    try {
      const response = await api.get(`/user/service-areas?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateServiceAreas: async (serviceAreasData) => {
    try {
      const response = await api.put('/user/service-areas', serviceAreasData);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Billing API functions
export const billingAPI = {
  getBilling: async (userId) => {
    try {
      const response = await api.get(`/user/billing?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createSetupIntent: async (userData) => {
    try {
      const response = await api.post('/user/billing/setup-intent', userData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createSubscription: async (subscriptionData) => {
    try {
      const response = await api.post('/user/billing/subscription', subscriptionData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPaymentMethods: async (userId) => {
    try {
      const response = await api.get(`/user/billing/payment-methods?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  cancelSubscription: async (userId) => {
    try {
      const response = await api.post('/user/billing/cancel-subscription', { userId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getInvoices: async () => {
    const response = await api.get('/user/billing/invoices');
    return response.data; // { invoices: [...] }
  },

  getUsage: async () => {
    const response = await api.get('/user/billing/usage');
    return response.data; // { activeTeams, jobsThisMonth, smsSent, storageBytes, apiCalls, periodStart, periodEnd }
  },
};

// Payment settings API functions
export const paymentSettingsAPI = {
  getPaymentSettings: async () => {
    try {
      const response = await api.get('/user/payment-settings');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePaymentSettings: async (settings) => {
    try {
      const response = await api.put('/user/payment-settings', settings);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  setupPaymentProcessor: async (processor) => {
    try {
      const response = await api.post('/user/payment-processor/setup', { processor });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Payment methods API functions
export const paymentMethodsAPI = {
  getPaymentMethods: async () => {
    try {
      const response = await api.get('/user/payment-methods');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createPaymentMethod: async (paymentMethod) => {
    try {
      const response = await api.post('/user/payment-methods', paymentMethod);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePaymentMethod: async (id, paymentMethod) => {
    try {
      const response = await api.put(`/user/payment-methods/${id}`, paymentMethod);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deletePaymentMethod: async (id) => {
    try {
      const response = await api.delete(`/user/payment-methods/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Branding API functions
export const brandingAPI = {
  getBranding: async (userId) => {
    try {
      console.log('🔍 Frontend: Calling getBranding with userId:', userId);
      
      // Add a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const apiPromise = api.get(`/user/branding?userId=${userId}`);
      const response = await Promise.race([apiPromise, timeoutPromise]);
      
      console.log('🔍 Frontend: getBranding response:', response.data);
      return response.data;
    } catch (error) {
      console.error('🔍 Frontend: getBranding error:', error);
      throw error;
    }
  },

  updateBranding: async (brandingData) => {
    try {
      console.log('🔍 Frontend: Calling updateBranding with data:', brandingData);
      const response = await api.put('/user/branding', brandingData);
      console.log('🔍 Frontend: updateBranding response:', response.data);
      return response.data;
    } catch (error) {
      console.error('🔍 Frontend: updateBranding error:', error);
      throw error;
    }
  }
};

// Business Details API functions
export const businessDetailsAPI = {
  getBusinessDetails: async (userId) => {
    try {
      const response = await api.get(`/user/business-details?userId=${userId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateBusinessDetails: async (businessData) => {
    try {
      const response = await api.put('/user/business-details', businessData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  uploadLogo: async (file) => {
    const form = new FormData();
    form.append('logo', file);
    const response = await api.post('/upload-logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data; // { url }
  },
};

// Territory Management API functions
export const territoriesAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.status) queryParams.append('status', params.status);
      if (params.search) queryParams.append('search', params.search);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      
      const response = await api.get(`/territories?${queryParams}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/territories/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (territoryData) => {
    try {
      const response = await api.post('/territories', territoryData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, territoryData) => {
    try {
      const response = await api.put(`/territories/${id}`, territoryData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/territories/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPricing: async (id) => {
    try {
      const response = await api.get(`/territories/${id}/pricing`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePricing: async (id, pricingData) => {
    try {
      const response = await api.post(`/territories/${id}/pricing`, pricingData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAnalytics: async (id, startDate, endDate) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/territories/${id}/analytics?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Territory detection based on customer location
  detectTerritory: async (userId, customerAddress, customerZipCode) => {
    try {
      const response = await api.post('/territories/detect', {
        userId,
        customerAddress,
        customerZipCode
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get available team members for a territory
  getTerritoryTeamMembers: async (territoryId) => {
    try {
      const response = await api.get(`/territories/${territoryId}/team-members`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get territory business hours
  getTerritoryBusinessHours: async (territoryId) => {
    try {
      const response = await api.get(`/territories/${territoryId}/business-hours`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Analytics API functions
export const analyticsAPI = {
  getOverview: async (userId, startDate, endDate) => {
    try {
      const params = new URLSearchParams({ userId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/analytics/overview?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getRevenue: async (userId, startDate, endDate, groupBy = 'day') => {
    try {
      const params = new URLSearchParams({ userId, groupBy });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/analytics/revenue?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getTeamPerformance: async (userId, startDate, endDate) => {
    try {
      const params = new URLSearchParams({ userId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/analytics/team-performance?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getCustomerInsights: async (userId, startDate, endDate) => {
    try {
      const params = new URLSearchParams({ userId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/analytics/customer-insights?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getServicePerformance: async (userId, startDate, endDate) => {
    try {
      const params = new URLSearchParams({ userId });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const response = await api.get(`/analytics/service-performance?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getConversionMetrics: async (startDate, endDate, groupBy = 'day') => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (groupBy) params.append('groupBy', groupBy);
      
      const response = await api.get(`/analytics/conversion?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getRecurringConversionMetrics: async (startDate, endDate, groupBy = 'day') => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (groupBy) params.append('groupBy', groupBy);
      
      const response = await api.get(`/analytics/recurring-conversion?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getLostCustomersMetrics: async (startDate, endDate, groupBy = 'day', inactiveDays = 90) => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (groupBy) params.append('groupBy', groupBy);
      if (inactiveDays) params.append('inactiveDays', inactiveDays);
      
      const response = await api.get(`/analytics/lost-customers?${params}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Payment API functions
export const paymentAPI = {
  createPaymentIntent: async (amount, currency = 'usd', metadata = {}) => {
    try {
      const response = await api.post('/payments/create-payment-intent', {
        amount,
        currency,
        metadata
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  confirmPayment: async (paymentIntentId, invoiceId, customerId) => {
    try {
      const response = await api.post('/payments/confirm-payment', {
        paymentIntentId,
        invoiceId,
        customerId
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  createSubscription: async (customerId, priceId, metadata = {}) => {
    try {
      const response = await api.post('/payments/create-subscription', {
        customerId,
        priceId,
        metadata
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Tax API functions
export const taxAPI = {
  calculateTax: async (subtotal, state, city, zipCode) => {
    try {
      const response = await api.post('/tax/calculate', {
        subtotal,
        state,
        city,
        zipCode
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Notification API functions
export const notificationAPI = {
  sendEmail: async (to, subject, html, text) => {
    try {
      const response = await api.post('/notifications/send-email', {
        to,
        subject,
        html,
        text
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPreferences: async (customerId) => {
    try {
      const response = await api.get(`/customers/${customerId}/notifications`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updatePreferences: async (customerId, preferences) => {
    try {
      const response = await api.put(`/customers/${customerId}/notifications`, preferences);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getHistory: async (customerId) => {
    try {
      const response = await api.get(`/customers/${customerId}/notifications/history`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Google Calendar API functions
export const calendarAPI = {
  syncJob: async (jobData) => {
    try {
      const response = await api.post('/calendar/sync-job', jobData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  getSettings: async () => {
    try {
      const response = await api.get('/calendar/settings');
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  updateSettings: async (settings) => {
    try {
      const response = await api.put('/calendar/settings', settings);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Google Sheets API functions
export const sheetsAPI = {
  exportCustomers: async (userId) => {
    try {
      const response = await api.post('/sheets/export-customers', { userId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  exportJobs: async (userId, dateRange = null) => {
    try {
      const response = await api.post('/sheets/export-jobs', { userId, dateRange });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// SMS API functions
export const smsAPI = {
  sendSMS: async (to, message) => {
    try {
      const response = await api.post('/sms/send', { to, message });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  sendJobConfirmation: async (customerPhone, jobDetails, customerName) => {
    try {
      const response = await api.post('/sms/job-confirmation', { 
        customerPhone, 
        jobDetails, 
        customerName 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  sendPaymentReminder: async (customerPhone, invoiceDetails, customerName) => {
    try {
      const response = await api.post('/sms/payment-reminder', { 
        customerPhone, 
        invoiceDetails, 
        customerName 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Twilio OAuth/API Integration functions
export const twilioAPI = {
  // Simple OAuth setup - user provides their own Twilio credentials
  setupCredentials: async (accountSid, authToken, phoneNumber) => {
    try {
      const response = await api.post('/twilio/setup-credentials', {
        accountSid,
        authToken,
        phoneNumber
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user's Twilio phone numbers
  getPhoneNumbers: async () => {
    try {
      const response = await api.get('/twilio/phone-numbers');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Setup SMS messaging for notifications
  setupSMSNotifications: async (phoneNumber, notificationTypes) => {
    try {
      const response = await api.post('/twilio/setup-sms-notifications', {
        phoneNumber,
        notificationTypes
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Send SMS using user's Twilio account
  sendSMS: async (to, message) => {
    try {
      const response = await api.post('/twilio/send-sms', { to, message });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Test SMS functionality
  testSMS: async (phoneNumber) => {
    try {
      const response = await api.post('/twilio/test-sms', { phoneNumber });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Disconnect Twilio integration
  disconnect: async () => {
    try {
      const response = await api.delete('/twilio/disconnect');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get current default phone number
  getDefaultPhoneNumber: async () => {
    try {
      const response = await api.get('/twilio/default-phone-number');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Set default phone number
  setDefaultPhoneNumber: async (phoneNumber) => {
    try {
      const response = await api.post('/twilio/set-default-phone-number', {
        phoneNumber
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Check if Stripe is connected
  checkStripeStatus: async () => {
    try {
      const response = await api.get('/stripe/status');
      return response.data;
    } catch (error) {
      console.error('Error checking Stripe status:', error);
      throw error;
    }
  }
};

// Stripe OAuth/API Integration functions
export const stripeAPI = {
  // Simple OAuth setup - user provides their own Stripe API keys
  setupCredentials: async (publishableKey, secretKey) => {
    try {
      const response = await api.post('/stripe/setup-credentials', {
        publishableKey,
        secretKey
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create invoice using user's Stripe account
  createInvoice: async (customerId, amount, description, dueDate) => {
    try {
      const response = await api.post('/stripe/create-invoice', {
        customerId,
        amount,
        description,
        dueDate
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Send invoice to customer
  sendInvoice: async (invoiceId, customerEmail) => {
    try {
      const response = await api.post('/stripe/send-invoice', {
        invoiceId,
        customerEmail
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create payment intent for direct payments
  createPaymentIntent: async (amount, currency = 'usd', customerId, metadata = {}) => {
    try {
      const response = await api.post('/stripe/create-payment-intent', {
        amount,
        currency,
        customerId,
        metadata
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get payment status
  getPaymentStatus: async (paymentIntentId) => {
    try {
      const response = await api.get(`/stripe/payment-status/${paymentIntentId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create customer in user's Stripe account
  createCustomer: async (email, name, phone) => {
    try {
      const response = await api.post('/stripe/create-customer', {
        email,
        name,
        phone
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Test Stripe connection
  testConnection: async () => {
    try {
      const response = await api.get('/stripe/test-connection');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Disconnect Stripe integration
  disconnect: async () => {
    try {
      const response = await api.delete('/stripe/disconnect');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Health check API
export const healthAPI = {
  check: async () => {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Requests API functions
export const requestsAPI = {
  getAll: async (userId, params = {}) => {
    try {
      const queryParams = new URLSearchParams({ userId });
      
      if (params.filter) queryParams.append('filter', params.filter);
      if (params.status) queryParams.append('status', params.status);
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      
      console.log('Making requests API call with params:', params);
      const response = await api.get(`/requests?${queryParams}`);
      console.log('Requests API response:', response);
      
      return response.data.requests || response.data;
    } catch (error) {
      console.error('Requests API error:', error);
      throw error;
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/requests/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (requestData) => {
    try {
      const response = await api.post('/requests', requestData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (id, requestData) => {
    try {
      const response = await api.put(`/requests/${id}`, requestData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/requests/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  approve: async (id) => {
    try {
      const response = await api.post(`/requests/${id}/approve`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  reject: async (id, reason) => {
    try {
      const response = await api.post(`/requests/${id}/reject`, { reason });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Address Validation API functions
export const addressValidationAPI = {
  validate: async (address) => {
    try {
      const response = await api.post('/address/validate', { address });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  geocode: async (address) => {
    try {
      const response = await api.post('/address/geocode', { address });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Google Places API functions
export const placesAPI = {
  autocomplete: async (input) => {
    try {
      const response = await api.get(`/places/autocomplete?input=${encodeURIComponent(input)}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getDetails: async (placeId) => {
    try {
      const response = await api.get(`/places/details?place_id=${placeId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Leads Pipeline API functions
export const leadsAPI = {
  // Get pipeline with stages
  getPipeline: async () => {
    try {
      const response = await api.get('/leads/pipeline');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update pipeline stages
  updateStages: async (stages) => {
    try {
      const response = await api.put('/leads/pipeline/stages', { stages });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete a stage
  deleteStage: async (stageId) => {
    try {
      const response = await api.delete(`/leads/pipeline/stages/${stageId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get all leads
  getAll: async () => {
    try {
      const response = await api.get('/leads');
      return response.data.leads || [];
    } catch (error) {
      throw error;
    }
  },

  // Get a single lead
  getById: async (id) => {
    try {
      const response = await api.get(`/leads/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create a new lead
  create: async (leadData) => {
    try {
      const response = await api.post('/leads', leadData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update a lead
  update: async (id, leadData) => {
    try {
      const response = await api.put(`/leads/${id}`, leadData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete a lead
  delete: async (id) => {
    try {
      const response = await api.delete(`/leads/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Move lead to different stage
  moveToStage: async (leadId, stageId) => {
    try {
      const response = await api.put(`/leads/${leadId}/move`, { stageId });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Convert lead to customer
  convertToCustomer: async (leadId) => {
    try {
      const response = await api.post(`/leads/${leadId}/convert`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Tasks API
  getTasks: async (leadId) => {
    try {
      const response = await api.get(`/leads/${leadId}/tasks`);
      return response.data.tasks || [];
    } catch (error) {
      throw error;
    }
  },

  getAllTasks: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.append('status', params.status);
      if (params.overdue) queryParams.append('overdue', params.overdue);
      
      const response = await api.get(`/leads/tasks?${queryParams}`);
      return response.data.tasks || [];
    } catch (error) {
      throw error;
    }
  },

  createTask: async (leadId, taskData) => {
    try {
      const response = await api.post(`/leads/${leadId}/tasks`, taskData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  updateTask: async (taskId, taskData) => {
    try {
      const response = await api.put(`/leads/tasks/${taskId}`, taskData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  deleteTask: async (taskId) => {
    try {
      const response = await api.delete(`/leads/tasks/${taskId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Cleaner Ledger API
export const ledgerAPI = {
  // Get all cleaners' balance summary
  getBalances: async (params = {}) => {
    const response = await api.get('/ledger/balances', { params });
    return response.data;
  },

  // Get single cleaner balance
  getBalance: async (teamMemberId) => {
    const response = await api.get(`/ledger/balance/${teamMemberId}`);
    return response.data;
  },

  // Get ledger entries with filters
  getEntries: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.teamMemberId) query.append('teamMemberId', params.teamMemberId);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.type) query.append('type', params.type);
    if (params.payoutStatus) query.append('payoutStatus', params.payoutStatus);
    if (params.jobId) query.append('jobId', params.jobId);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const response = await api.get(`/ledger/entries?${query}`);
    return response.data;
  },

  // Create manual adjustment
  createAdjustment: async (data) => {
    const response = await api.post('/ledger/adjustment', data);
    return response.data;
  },

  // Record cash collected
  recordCashCollected: async (data) => {
    const response = await api.post('/ledger/cash-collected', data);
    return response.data;
  },

  updateCashCollected: async (jobId, teamMemberId, amount) => {
    const response = await api.patch(`/ledger/cash-collected/${jobId}/${teamMemberId}`, { amount });
    return response.data;
  },

  // Record cash delivered to company (no salary impact)
  recordCashToCompany: async (data) => {
    const response = await api.post('/ledger/cash-to-company', data);
    return response.data;
  },

  // Create adjustment + rebuild payout batch in one call
  adjustAndRebuildBatch: async (data) => {
    const response = await api.post('/ledger/adjust-and-rebuild-batch', data);
    return response.data;
  },

  // Create payout batch
  createPayoutBatch: async (data) => {
    const response = await api.post('/ledger/payout-batch', data);
    return response.data;
  },

  // Create payout batches for ALL team members at once (server-side loop)
  createPayoutBatchAll: async (data) => {
    const response = await api.post('/ledger/payout-batch/all', data);
    return response.data;
  },

  // Mark payout batch as paid
  markBatchPaid: async (batchId, note) => {
    const response = await api.patch(`/ledger/payout-batch/${batchId}/pay`, { note });
    return response.data;
  },

  // Cancel payout batch
  cancelBatch: async (batchId) => {
    const response = await api.patch(`/ledger/payout-batch/${batchId}/cancel`);
    return response.data;
  },

  // Delete a pending payout batch entirely
  deleteBatch: async (batchId) => {
    const response = await api.delete(`/ledger/payout-batch/${batchId}`);
    return response.data;
  },

  // Bulk mark all unpaid entries as paid up to a cutoff date
  bulkMarkPaid: async (cutoffDate, note) => {
    const response = await api.post('/ledger/bulk-mark-paid', { cutoffDate, note });
    return response.data;
  },

  // Get payout batches list
  getPayoutBatches: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.teamMemberId) query.append('teamMemberId', params.teamMemberId);
    if (params.status) query.append('status', params.status);
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    const response = await api.get(`/ledger/payout-batches?${query}`);
    return response.data;
  },

  // Get payout batch detail
  getPayoutBatch: async (batchId) => {
    const response = await api.get(`/ledger/payout-batch/${batchId}`);
    return response.data;
  },

  // Backfill ledger for existing completed jobs
  backfill: async (data) => {
    const response = await api.post('/ledger/backfill', data, { timeout: 600000 });
    return response.data;
  },

  // Poll backfill progress
  getBackfillProgress: async () => {
    const response = await api.get('/ledger/backfill/progress');
    return response.data;
  },

  // Cancel running backfill
  cancelBackfill: async () => {
    const response = await api.post('/ledger/backfill/cancel');
    return response.data;
  },

  // Update payout preferences
  updatePayoutPreferences: async (teamMemberId, data) => {
    const response = await api.patch(`/team-members/${teamMemberId}/payout-preferences`, data);
    return response.data;
  }
};

// ═══ Communications API (Sigcore-backed) ═══

export const openPhoneAPI = {
  connect: async (apiKey) => { const r = await api.post('/communications/connect-openphone', { apiKey }); return r.data; },
  getStatus: async () => { const r = await api.get('/communications/status'); return r.data; },
  getNumbers: async () => { const r = await api.get('/communications/phone-numbers'); return r.data; },
  disconnect: async () => { const r = await api.delete('/communications/disconnect-openphone'); return r.data; },
  sync: async (limit) => { const r = await api.post('/communications/sync', limit ? { limit } : {}); return r.data; },
  getSyncProgress: async () => { const r = await api.get('/communications/sync/progress'); return r.data; },
  cancelSync: async () => { const r = await api.post('/communications/sync/cancel'); return r.data; },
  relink: async () => { const r = await api.post('/communications/relink'); return r.data; },
};

export const whatsappAPI = {
  getStatus: async () => { const r = await api.get('/integrations/whatsapp/status'); return r.data; },
  connect: async () => { const r = await api.post('/integrations/whatsapp/connect'); return r.data; },
  getQR: async () => { const r = await api.get('/integrations/whatsapp/qr'); return r.data; },
  disconnect: async () => { const r = await api.post('/integrations/whatsapp/disconnect'); return r.data; },
  sync: async (messageLimit) => { const r = await api.post('/integrations/whatsapp/sync', messageLimit ? { messageLimit } : {}); return r.data; },
  getSyncProgress: async () => { const r = await api.get('/integrations/whatsapp/sync/progress'); return r.data; },
};

export const notificationEmailAPI = {
  getSettings: async () => { const r = await api.get('/notification-email/settings'); return r.data; },
  saveSettings: async (data) => { const r = await api.put('/notification-email/settings', data); return r.data; },
  sendTest: async (testEmail) => { const r = await api.post('/notification-email/test', { testEmail }); return r.data; },
  getLogs: async (params) => { const r = await api.get('/notification-email/logs', { params }); return r.data; },
};

export const paystubsAPI = {
  list: async (params = {}) => { const r = await api.get('/paystubs', { params }); return r.data; },
  get: async (id) => { const r = await api.get(`/paystubs/${id}`); return r.data; },
  create: async (data) => { const r = await api.post('/paystubs', data); return r.data; },
  bulkCreate: async (data) => { const r = await api.post('/paystubs/bulk', data); return r.data; },
  send: async (id) => { const r = await api.post(`/paystubs/${id}/send`); return r.data; },
  resend: async (id) => { const r = await api.post(`/paystubs/${id}/resend`); return r.data; },
  bulkSend: async (data = {}) => { const r = await api.post('/paystubs/bulk/send', data); return r.data; },
  delete: async (id) => { const r = await api.delete(`/paystubs/${id}`); return r.data; },
  htmlUrl: (id) => `/paystubs/${id}/html`,
  downloadPdf: async (id, filename) => {
    const r = await api.get(`/paystubs/${id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([r.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `paystub_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export const jobExpensesAPI = {
  list: async (jobId) => { const r = await api.get(`/jobs/${jobId}/expenses`); return r.data; },
  create: async (jobId, data) => { const r = await api.post(`/jobs/${jobId}/expenses`, data); return r.data; },
  update: async (id, data) => { const r = await api.patch(`/job-expenses/${id}`, data); return r.data; },
  approve: async (id) => { const r = await api.post(`/job-expenses/${id}/approve`); return r.data; },
  reject: async (id) => { const r = await api.post(`/job-expenses/${id}/reject`); return r.data; },
  delete: async (id) => { const r = await api.delete(`/job-expenses/${id}`); return r.data; },
};

// Set Company tag for an OpenPhone contact directly in SF (without going
// through OpenPhone). After save, source-fill propagates to customer/lead.
export const opContactsAPI = {
  setCompany: async (phone, company) => {
    const r = await api.patch('/op-contacts/set-company', { phone, company });
    return r.data;
  },
  bulkSetCompany: async (items) => {
    const r = await api.post('/op-contacts/bulk-set-company', { items });
    return r.data;
  },
  // Triggers Sigcore to re-pull all OpenPhone contacts (with their Company
  // custom field) into Sigcore's snapshot table. After it completes (~2-5min),
  // run Sync All to pull the updated company values into SF.
  refreshFromOpenPhone: async () => {
    const r = await api.post('/op-contacts/refresh-from-openphone');
    return r.data;
  },
  // One-shot: kick off Sigcore /contacts/sync, await completion, then run SF sync.
  // Returns { started, started_at }. Poll refreshAndSyncProgress for live state.
  refreshAndSync: async () => {
    const r = await api.post('/op-contacts/refresh-and-sync');
    return r.data;
  },
  refreshAndSyncProgress: async () => {
    const r = await api.get('/op-contacts/refresh-and-sync/progress');
    return r.data;
  },
  // Soft-delete an OP-missing-Company entry — sets company='(hidden)' on
  // every conversation for this phone and marks the linked identity hidden.
  hideByPhone: async (phone) => {
    const r = await api.post('/op-contacts/hide-by-phone', { phone });
    return r.data;
  },
};

export const zenbookerAPI = {
  sync: async (opts = {}) => {
    const r = await api.post('/zenbooker/sync', opts);
    return r.data;
  },
  syncProgress: async () => {
    const r = await api.get('/zenbooker/sync/progress');
    return r.data;
  },
};

export const leadbridgeAPI = {
  connect: async (email, password) => { const r = await api.post('/integrations/leadbridge/connect', { email, password }); return r.data; },
  getStatus: async () => { const r = await api.get('/integrations/leadbridge/status'); return r.data; },
  getAccounts: async () => { const r = await api.get('/integrations/leadbridge/accounts'); return r.data; },
  disconnect: async () => { const r = await api.delete('/integrations/leadbridge/disconnect'); return r.data; },
  sync: async (accountId, limit) => { const r = await api.post('/integrations/leadbridge/sync', { accountId, limit }); return r.data; },
  getSyncProgress: async () => { const r = await api.get('/integrations/leadbridge/sync/progress'); return r.data; },
  // Phase 1.5 — semantic observability (read-only diagnostic endpoints)
  getSemanticSummary: async () => { const r = await api.get('/integrations/leadbridge/semantic-summary'); return r.data; },
  getEntitySemanticState: async (type, id) => { const r = await api.get(`/integrations/leadbridge/entity/${type}/${id}/semantic-state`); return r.data; },
};

export const leadAutomationAPI = {
  getRules: async () => { const r = await api.get('/lead-automation/rules'); return r.data; },
  saveRule: async (data) => { const r = await api.post('/lead-automation/rules', data); return r.data; },
  seedDefaults: async () => { const r = await api.post('/lead-automation/seed-defaults'); return r.data; },
  backfill: async () => { const r = await api.post('/lead-automation/backfill'); return r.data; },
};

export const leadSourcesAPI = {
  list: async () => { const r = await api.get('/lead-sources'); return r.data; },
  create: async (name) => { const r = await api.post('/lead-sources', { name }); return r.data; },
  update: async (id, data) => { const r = await api.put(`/lead-sources/${id}`, data); return r.data; },
  remove: async (id) => { const r = await api.delete(`/lead-sources/${id}`); return r.data; },
  seed: async () => { const r = await api.post('/lead-sources/seed'); return r.data; },
  reorder: async (order) => { const r = await api.put('/lead-sources/reorder', { order }); return r.data; },
  importFromOpenPhone: async () => { const r = await api.post('/lead-sources/import-from-openphone'); return r.data; },
};

export const leadSourceMappingsAPI = {
  list: async () => { const r = await api.get('/lead-source-mappings'); return r.data; },
  save: async (data) => { const r = await api.post('/lead-source-mappings', data); return r.data; },
  saveBulk: async (mappings) => { const r = await api.post('/lead-source-mappings/bulk', { mappings }); return r.data; },
  remove: async (id) => { const r = await api.delete(`/lead-source-mappings/${id}`); return r.data; },
  autoSuggest: async () => { const r = await api.post('/lead-source-mappings/auto-suggest'); return r.data; },
};

export const sourceIssuesAPI = {
  list: async () => { const r = await api.get('/source-issues'); return r.data; },
  mergeCustomers: async (sourceId, targetId) => { const r = await api.post(`/customers/${sourceId}/merge-into/${targetId}`); return r.data; },
};

export const participantsAPI = {
  backfillDryRun: async () => { const r = await api.post('/participants/backfill'); return r.data; },
  backfillApply: async () => { const r = await api.post('/participants/backfill?apply=1'); return r.data; },
  backfillProgress: async () => { const r = await api.get('/participants/backfill/progress'); return r.data; },
  reconcile: async () => { const r = await api.post('/participants/reconcile'); return r.data; },
  reclassifyDryRun: async () => { const r = await api.post('/participants/reclassify'); return r.data; },
  reclassifyApply: async () => { const r = await api.post('/participants/reclassify?apply=1'); return r.data; },
  reclassifyProgress: async () => { const r = await api.get('/participants/reclassify/progress'); return r.data; },
  upgradeLbSourcesDryRun: async () => { const r = await api.post('/participants/upgrade-lb-sources'); return r.data; },
  upgradeLbSourcesApply: async () => { const r = await api.post('/participants/upgrade-lb-sources?apply=1'); return r.data; },
};

// Phase F — unified identity reporting + backfill.
export const identitiesAPI = {
  status: async () => { const r = await api.get('/identities/status'); return r.data; },
  bySource: async () => { const r = await api.get('/identities/by-source'); return r.data; },
  unresolved: async ({ limit = 50, offset = 0 } = {}) => {
    const r = await api.get(`/identities/unresolved?limit=${limit}&offset=${offset}`);
    return r.data;
  },
  reconciliationFailures: async ({ status = 'open', limit = 50, offset = 0 } = {}) => {
    const r = await api.get(`/identities/reconciliation-failures?status=${status}&limit=${limit}&offset=${offset}`);
    return r.data;
  },
  reconciliationFailuresCsv: async ({ status = 'open' } = {}) => {
    const r = await api.get(`/identities/reconciliation-failures/export.csv?status=${status}`, { responseType: 'blob' });
    return r.data;
  },
  ambiguityCandidates: async (id) => {
    const r = await api.get(`/identities/ambiguities/${id}/candidates`);
    return r.data;
  },
  resolveAmbiguity: async (id, body) => {
    const r = await api.post(`/identities/ambiguities/${id}/resolve`, body);
    return r.data;
  },
  backfillDryRun: async () => { const r = await api.post('/identities/backfill'); return r.data; },
  backfillApply: async () => { const r = await api.post('/identities/backfill?apply=1'); return r.data; },
  backfillProgress: async () => { const r = await api.get('/identities/backfill/progress'); return r.data; },
  opLeadOutcomes: async () => { const r = await api.get('/identities/op-lead-outcomes'); return r.data; },
  classify: async (id) => { const r = await api.post(`/identities/${id}/classify`); return r.data; },
  classifyBatch: async (ids, max = 200) => { const r = await api.post('/identities/classify-batch', { ids, max }); return r.data; },
  classifyBatchProgress: async () => { const r = await api.get('/identities/classify-batch/progress'); return r.data; },
  // Soft-delete an identity from triage lists (floating + ambig). Sets hidden_at,
  // abandons related ambigs, marks its OP convs as hidden.
  hide: async (id) => { const r = await api.post(`/identities/${id}/hide`); return r.data; },
  abandonAmbiguity: async (id) => { const r = await api.post(`/identities/ambiguities/${id}/abandon`); return r.data; },
};

// Phase J — unified integrations. One Connect & Sync per source.
export const integrationsAPI = {
  status: async () => { const r = await api.get('/integrations/status'); return r.data; },
  sync: async (source) => { const r = await api.post(`/integrations/${source}/sync`); return r.data; },
  syncProgress: async (source) => { const r = await api.get(`/integrations/${source}/sync/progress`); return r.data; },
};

export const locationsAPI = {
  list: async () => { const r = await api.get('/locations'); return r.data; },
  create: async (data) => { const r = await api.post('/locations', data); return r.data; },
  update: async (id, data) => { const r = await api.patch(`/locations/${id}`, data); return r.data; },
  getMappings: async () => { const r = await api.get('/communications/location-mappings'); return r.data; },
  createMapping: async (data) => { const r = await api.post('/communications/location-mappings', data); return r.data; },
};

export const communicationsAPI = {
  getProviderAccounts: async () => { const r = await api.get('/communications/provider-accounts'); return r.data; },
  getConversations: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.filter) query.append('filter', params.filter);
    if (params.search) query.append('search', params.search);
    if (params.archived) query.append('archived', params.archived);
    if (params.accountId) query.append('accountId', params.accountId);
    if (params.channel) query.append('channel', params.channel);
    if (params.locationId) query.append('locationId', params.locationId);
    const r = await api.get(`/communications/conversations?${query}`);
    return r.data;
  },
  getConversation: async (id, params) => { const r = await api.get(`/communications/conversations/${id}`, { params }); return r.data; },
  sendMessage: async (id, data) => { const r = await api.post(`/communications/conversations/${id}/send`, data); return r.data; },
  updateConversation: async (id, data) => { const r = await api.patch(`/communications/conversations/${id}`, data); return r.data; },
  savePreferences: async (prefs) => { const r = await api.put('/communications/settings/preferences', prefs); return r.data; },
};

// Customer files — per-customer photo / document library backing
// the Files tab on the customer detail page. Storage is Supabase
// (job-attachments bucket); this API just wraps the metadata CRUD.
export const customerFilesAPI = {
  list: async (customerId) => {
    const r = await api.get(`/customers/${customerId}/files`);
    return r.data;
  },
  upload: async (customerId, files, { jobId } = {}) => {
    const form = new FormData();
    (Array.isArray(files) ? files : [files]).forEach((f) => form.append('files', f));
    if (jobId) form.append('jobId', String(jobId));
    const r = await api.post(`/customers/${customerId}/files`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return r.data;
  },
  remove: async (customerId, fileId) => {
    const r = await api.delete(`/customers/${customerId}/files/${fileId}`);
    return r.data;
  },
};

// Property data lookup via RentCast (server-side). Given a parsed
// address, returns bedrooms / bathrooms / squareFeet / yearBuilt /
// propertyType / estimatedValue / estimatedRent / lotSize / lastSale*
// / assessedValue. Endpoint is /api/zillow/property for legacy naming
// reasons — the upstream provider is RentCast, not Zillow.
export const propertyDataAPI = {
  lookup: async ({ address, street, city, state, zipCode }) => {
    const r = await api.post('/zillow/property', { address, street, city, state, zipCode });
    return r.data;
  },
};

// Connected Email (Gmail/Outlook OAuth) — System 2 mailbox integration for Communications Hub.
// Separate from notificationEmailAPI (System 1 / SendGrid).
export const connectedEmailAPI = {
  listAccounts: async () => { const r = await api.get('/connected-email/accounts'); return r.data; },
  startOAuth: async (provider) => { const r = await api.post(`/connected-email/oauth/${provider}/start`); return r.data; },
  disconnect: async (accountId, reason) => { const r = await api.post(`/connected-email/accounts/${accountId}/disconnect`, { reason }); return r.data; },
  deleteAccount: async (accountId) => { const r = await api.delete(`/connected-email/accounts/${accountId}`); return r.data; },
  validateMailbox: async (accountId, mailboxEmail) => {
    const r = await api.post(`/connected-email/accounts/${accountId}/validate-mailbox`, { mailboxEmail });
    return r.data;
  },
  selectMailbox: async (accountId, mailboxEmail) => {
    const r = await api.post(`/connected-email/accounts/${accountId}/select-mailbox`, { mailboxEmail });
    return r.data;
  },
  resync: async (accountId) => { const r = await api.post(`/connected-email/accounts/${accountId}/resync`); return r.data; },
  getSyncProgress: async (accountId) => { const r = await api.get(`/connected-email/accounts/${accountId}/sync-progress`); return r.data; },
  testSync: async (accountId, { days = 7, maxMessages = 50 } = {}) => {
    const r = await api.post(`/connected-email/accounts/${accountId}/test-sync`, { days, maxMessages });
    return r.data;
  },
  validateMailbox: async (accountId, mailboxEmail) => {
    const r = await api.post(`/connected-email/accounts/${accountId}/validate-mailbox`, { mailboxEmail });
    return r.data;
  },
  selectMailbox: async (accountId, mailboxEmail) => {
    const r = await api.post(`/connected-email/accounts/${accountId}/select-mailbox`, { mailboxEmail });
    return r.data;
  },
  deleteAccount: async (accountId) => { const r = await api.delete(`/connected-email/accounts/${accountId}`); return r.data; },
};

export default api;