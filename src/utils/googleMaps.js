// Google Maps utility functions for frontend-based Places API

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadingCallbacks = [];

// Load Google Maps JavaScript API with Places + Geometry.
// Geometry is needed by the polyline-offset helper in JobRouteMap
// (computeHeading + computeOffset). Loading both by default so no
// matter which component loads the script first, geometry is there.
export const loadGoogleMapsScript = (apiKey, libraries = 'places,geometry') => {
  return new Promise((resolve, reject) => {
    // If already loaded, resolve immediately
    if (googleMapsLoaded && window.google && window.google.maps && window.google.maps.places) {
      resolve();
      return;
    }

    // Check if script already exists in DOM (even if not loaded yet)
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script exists in DOM, wait for it to load instead of creating a new one
      // Add to callback queue (will be resolved when script loads)
      if (!googleMapsLoading) {
        googleMapsLoading = true;
      }
      loadingCallbacks.push({ resolve, reject });
      
      // Start checking if it's already loaded
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkLoaded);
          googleMapsLoaded = true;
          googleMapsLoading = false;
          
          // Resolve all pending callbacks
          loadingCallbacks.forEach(callback => callback.resolve());
          loadingCallbacks.length = 0;
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkLoaded);
        if (!googleMapsLoaded) {
          googleMapsLoading = false;
          const error = new Error('Google Maps API failed to load within timeout');
          loadingCallbacks.forEach(callback => callback.reject(error));
          loadingCallbacks.length = 0;
        }
      }, 10000);
      
      return;
    }

    // If currently loading (but script not in DOM yet), add to callback queue
    if (googleMapsLoading) {
      loadingCallbacks.push({ resolve, reject });
      return;
    }

    // Start loading
    googleMapsLoading = true;
    loadingCallbacks.push({ resolve, reject });

    // Create script element
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      // Wait for the library to fully initialize
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkLoaded);
          googleMapsLoaded = true;
          googleMapsLoading = false;
          
          // Resolve all pending callbacks
          loadingCallbacks.forEach(callback => callback.resolve());
          loadingCallbacks.length = 0;
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkLoaded);
        if (!googleMapsLoaded) {
          googleMapsLoading = false;
          const error = new Error('Google Maps API failed to load within timeout');
          loadingCallbacks.forEach(callback => callback.reject(error));
          loadingCallbacks.length = 0;
        }
      }, 5000);
    };
    
    script.onerror = (error) => {
      googleMapsLoading = false;
      console.error('Failed to load Google Maps script:', error);
      
      // Reject all pending callbacks
      loadingCallbacks.forEach(callback => callback.reject(error));
      loadingCallbacks.length = 0;
    };

    // Add script to document
    document.head.appendChild(script);
  });
};

// Initialize Google Places Autocomplete
// Using legacy Autocomplete API by default to avoid referer restriction issues with new API
// The new PlaceAutocompleteElement requires Places API (New) and proper referer configuration
export const initializePlacesAutocomplete = (inputElement, options = {}) => {
  if (!window.google || !window.google.maps || !window.google.maps.places) {
    throw new Error('Google Maps Places API not loaded');
  }

  // Use legacy Autocomplete API (works with existing API keys and referer restrictions)
  // The new PlaceAutocompleteElement API has stricter referer requirements and requires
  // Places API (New) to be enabled, which may not be configured for all API keys
  const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
    types: options.types || ['geocode'],
    componentRestrictions: options.componentRestrictions || { country: 'us' },
    ...options
  });
  autocomplete._isPlaceAutocompleteElement = false;
  return autocomplete;
};

// Get place details
export const getPlaceDetails = (placeId) => {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      reject(new Error('Google Maps Places API not loaded'));
      return;
    }

    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    
    service.getDetails({
      placeId: placeId,
      fields: ['formatted_address', 'address_components', 'geometry', 'name']
    }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK) {
        resolve(place);
      } else {
        reject(new Error(`Places service error: ${status}`));
      }
    });
  });
};

// Search for places (alternative to autocomplete)
export const searchPlaces = (query, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      reject(new Error('Google Maps Places API not loaded'));
      return;
    }

    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    
    service.textSearch({
      query: query,
      type: 'address',
      ...options
    }, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK) {
        resolve(results);
      } else {
        reject(new Error(`Places search error: ${status}`));
      }
    });
  });
};

// Check if Google Maps is loaded
export const isGoogleMapsLoaded = () => {
  return googleMapsLoaded && window.google && window.google.maps && window.google.maps.places;
};
