/**
 * Role-based access control utilities
 * 
 * Roles:
 * - 'owner' or null/undefined: Account owner - full access
 * - 'manager': Manager - full access except account owner settings
 * - 'scheduler': Scheduler - full access to jobs and clients
 * - 'worker': Worker - limited access (Dashboard, Schedule, Jobs view only, Profile)
 */

/**
 * Get user role from user object
 * @param {Object} user - User object from AuthContext
 * @returns {string} - User role ('owner', 'manager', 'scheduler', 'worker', or null)
 */
export const getUserRole = (user) => {
  if (!user) return null;
  
  // Check if user has a role field
  // Role might be stored as user.role, user.teamMemberRole, or in user.teamMember.role
  const role = user.role || user.teamMemberRole || user.teamMember?.role;
  
  // If no role is set and user has teamMemberId, they're likely a team member
  // Default team members to 'worker' role if no role is specified
  if (!role && user.teamMemberId) {
    return 'worker'; // Default team member role
  }
  
  // Normalize role names
  if (!role || role === 'account owner' || role === 'owner' || role === 'admin') {
    return 'owner';
  }
  
  // Normalize to lowercase for comparison
  const normalizedRole = role.toLowerCase();
  
  if (normalizedRole === 'manager') return 'manager';
  if (normalizedRole === 'scheduler') return 'scheduler';
  if (normalizedRole === 'worker' || normalizedRole === 'technician' || normalizedRole === 'field_worker') {
    return 'worker';
  }
  
  // Default to owner if role is not recognized
  return 'owner';
};

/**
 * Check if user is account owner
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isAccountOwner = (user) => {
  return getUserRole(user) === 'owner';
};

/**
 * Check if user is manager
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isManager = (user) => {
  return getUserRole(user) === 'manager';
};

/**
 * Check if user is scheduler
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isScheduler = (user) => {
  return getUserRole(user) === 'scheduler';
};

/**
 * Check if user is worker
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const isWorker = (user) => {
  return getUserRole(user) === 'worker';
};

/**
 * Check if user can access a specific route/path
 * @param {Object} user - User object from AuthContext
 * @param {string} path - Route path
 * @returns {boolean}
 */
export const canAccessRoute = (user, path) => {
  const role = getUserRole(user);
  
  // Analytics is only accessible to account owners
  if (path === '/analytics' || path.startsWith('/analytics')) {
    return role === 'owner';
  }
  
  // Availability page is accessible to all authenticated users
  if (path === '/availability' || path.startsWith('/availability/')) {
    return true;
  }
  
  // Account owners and managers can access everything (except account owner settings and billing for managers)
  if (role === 'owner' || role === 'manager') {
    // Managers cannot access account owner settings
    if (role === 'manager' && path === '/settings/account') {
      return false;
    }
    // Managers cannot access billing/subscription settings
    if (role === 'manager' && (path === '/settings/billing' || path.startsWith('/settings/billing/') || path.includes('/billing'))) {
      return false;
    }
    return true;
  }
  
  // Schedulers have full access to jobs and clients
  if (role === 'scheduler') {
    return true;
  }
  
  // Workers have limited access - only specific routes
  if (role === 'worker') {
    // Explicitly deny access to Stripe Connect and SMS Settings for workers
    if (path === '/settings/stripe-connect' || path === '/settings/sms-settings') {
      return false;
    }
    
    const allowedRoutes = [
      '/dashboard',
      '/schedule',
      '/calendar',
      '/jobs',
      '/job', // Job details pages (matches /job/:jobId)
      '/availability', // Availability page (mobile view)
      '/offers', // Available jobs page
      '/notifications', // Notifications page
      '/settings', // Settings page (will redirect to team profile)
      '/settings/account', // Only their profile settings
      '/settings/profile', // Profile settings alias
      '/team', // Team member profile pages (matches /team/:memberId)
    ];
    
    // Check if path matches any allowed route
    return allowedRoutes.some(route => {
      if (route === '/job') {
        // Special handling for job routes - allow /job/:jobId
        return path === '/job' || path.startsWith('/job/');
      }
      if (route === '/team') {
        // Special handling for team routes - allow /team/:memberId
        // But only if the memberId matches the user's teamMemberId (their own profile)
        if (path === '/team' || path.startsWith('/team/')) {
          // Extract memberId from path
          const match = path.match(/^\/team\/(\d+)$/);
          if (match) {
            const memberId = parseInt(match[1]);
            // Allow if it's their own profile
            return user?.teamMemberId === memberId;
          }
          // Allow /team route itself (will redirect)
          return path === '/team';
        }
        return false;
      }
      if (route === '/settings') {
        // Allow /settings route (will redirect team members to their profile)
        // But exclude integration routes which are already denied above
        return path === '/settings' || path.startsWith('/settings/');
      }
      if (route.endsWith('/')) {
        return path.startsWith(route);
      }
      return path === route || path.startsWith(route + '/');
    });
  }
  
  // Default: deny access
  return false;
};

/**
 * Check if user can create jobs
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const canCreateJobs = (user) => {
  const role = getUserRole(user);
  // Workers cannot create jobs
  return role !== 'worker';
};

/**
 * Check if user can edit account owner settings
 * @param {Object} user - User object from AuthContext
 * @returns {boolean}
 */
export const canEditAccountOwnerSettings = (user) => {
  return isAccountOwner(user);
};

/**
 * Get allowed sidebar items for a user role
 * @param {Object} user - User object from AuthContext
 * @returns {Array} - Array of allowed sidebar item paths
 */
export const getAllowedSidebarItems = (user) => {
  const role = getUserRole(user);
  
  // Account owners and managers see all items (except account owner settings and billing for managers)
  if (role === 'owner' || role === 'manager') {
    const items = [
      '/dashboard',
      '/request',
      '/schedule',
      '/calendar',
      '/jobs',
      '/estimates',
      '/invoices',
      '/recurring',
      '/payments',
      '/customers',
      '/leads',
      '/tasks',
      '/communications',
      '/team',
      '/payroll',
      '/services',
      '/coupons',
      '/territories',
      '/online-booking',
      '/settings',
    ];

    // Only account owners can access analytics
    if (role === 'owner') {
      items.push('/analytics');
    }
    
    // Managers cannot access billing/subscription settings
    if (role === 'manager') {
      return items.filter(item => !item.includes('/billing'));
    }
    
    return items;
  }
  
  // Schedulers have full access to jobs and clients
  if (role === 'scheduler') {
    return [
      '/dashboard',
      '/request',
      '/schedule',
      '/calendar',
      '/jobs',
      '/estimates',
      '/invoices',
      '/recurring',
      '/payments',
      '/customers',
      '/leads',
      '/tasks',
      '/services',
      '/territories',
      '/settings',
    ];
  }

  // Workers have limited access
  if (role === 'worker') {
    return [
      '/dashboard',
      '/schedule',
      '/calendar',
      '/jobs',
      '/availability',
      '/settings',
    ];
  }
  
  // Default: return all items (fallback)
  return [
    '/dashboard',
    '/request',
    '/schedule',
    '/calendar',
    '/jobs',
    '/estimates',
    '/invoices',
    '/recurring',
      '/payments',
      '/customers',
      '/leads',
      '/tasks',
      '/team',
      '/services',
    '/coupons',
    '/territories',
    '/analytics',
    '/online-booking',
    '/settings',
  ];
};

/**
 * Filter sidebar items based on user role
 * @param {Array} sidebarItems - Array of sidebar items with path property
 * @param {Object} user - User object from AuthContext
 * @returns {Array} - Filtered sidebar items
 */
export const filterSidebarItems = (sidebarItems, user) => {
  const allowedPaths = getAllowedSidebarItems(user);
  const role = getUserRole(user);
  
  return sidebarItems.filter(item => {
    // Always show items that are explicitly allowed
    if (allowedPaths.includes(item.path)) {
      // For managers, hide account owner settings
      if (role === 'manager' && item.path === '/settings/account') {
        return false;
      }
      return true;
    }
    
    // Check if path starts with any allowed path (for nested routes)
    return allowedPaths.some(allowedPath => {
      if (allowedPath.endsWith('/')) {
        return item.path.startsWith(allowedPath);
      }
      return item.path === allowedPath || item.path.startsWith(allowedPath + '/');
    });
  });
};

