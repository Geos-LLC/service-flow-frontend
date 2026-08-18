import { useEffect, useRef, useState } from 'react'
import { getGoogleMapsApiKey } from '../config/maps'
import { decodeHtmlEntities } from '../utils/htmlUtils'

const JobsMap = ({ jobs, teamMembers = [], mapType = 'roadmap' }) => {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const homeMarkersRef = useRef([])  // separate track so home markers don't count toward job-bounds
  const routesRef = useRef([])         // DirectionsRenderer per cleaner (home → job1 → job2 …)
  const geocodeCacheRef = useRef({}) // Cache geocoded addresses
  const [useEmbedAPI, setUseEmbedAPI] = useState(false) // Only use Embed API on actual script load failures
  const [mapReady, setMapReady] = useState(false) // Track when map is fully ready for markers
  const [markersPlaced, setMarkersPlaced] = useState(false) // Track when markers are placed to avoid default view flash
  
  // Helper: get cleaner/team member names from a job
  const getCleanerNames = (job) => {
    const names = []
    if (job.team_assignments && Array.isArray(job.team_assignments) && job.team_assignments.length > 0) {
      job.team_assignments.forEach(ta => {
        // Try to find full name from teamMembers prop
        const member = teamMembers.find(m => m.id === ta.team_member_id)
        if (member) {
          const name = member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim()
          if (name) names.push(name)
        } else {
          // Fallback: use data from assignment itself
          const name = `${ta.first_name || ''} ${ta.last_name || ''}`.trim()
          if (name) names.push(name)
        }
      })
    }
    if (names.length === 0) {
      // Fallback: try team_member_id
      const memberId = job.team_member_id || job.assigned_team_member_id
      if (memberId) {
        const member = teamMembers.find(m => m.id === memberId)
        if (member) {
          const name = member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim()
          if (name) names.push(name)
        }
      }
    }
    return names
  }

  // ✅ Fix 1: Feature flag to disable Embed API fallback for multiple markers
  // Set to false to prevent Embed API fallback (multiple markers require JS API)
  const ALLOW_EMBED_FALLBACK = false // CRITICAL: Set to false for multiple markers to work

  // ✅ Step 2: Create the map ONCE
  useEffect(() => {
    // Prevent re-initialization
    if (mapInstanceRef.current || useEmbedAPI) return

      // Check if Google Maps is already loaded
      if (window.google && window.google.maps) {
          initializeMap()
        return
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
      if (existingScript) {
        // Script exists, wait for it to load
      const checkInterval = setInterval(() => {
          if (window.google && window.google.maps) {
            clearInterval(checkInterval)
              if (!mapInstanceRef.current) {
                initializeMap()
              }
          }
        }, 100)

      // Timeout after 10 seconds - only fallback on actual script load failure
      const timeoutId = setTimeout(() => {
        clearInterval(checkInterval)
          if (!window.google || !window.google.maps) {
          console.error('⚠️ Google Maps API script failed to load - this is a script load issue, not an API configuration issue')
          if (ALLOW_EMBED_FALLBACK) {
            console.error('⚠️ Using Embed API fallback (multiple markers will not work)')
            setUseEmbedAPI(true)
          } else {
            console.error('⚠️ Embed API fallback disabled - fix API configuration for multiple markers to work')
          }
          }
        }, 10000)

      return () => {
        clearInterval(checkInterval)
        clearTimeout(timeoutId)
      }
      }

      // Load Google Maps JavaScript API
      const script = document.createElement('script')
      const apiKey = getGoogleMapsApiKey()
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`
      script.async = true
      script.defer = true
      
      script.onload = () => {
      // Wait for Google Maps to fully initialize
        setTimeout(() => {
          if (window.google && window.google.maps) {
            if (!mapInstanceRef.current) {
              initializeMap()
            }
          } else {
          // This should not happen, but if it does, it's a script load issue
          console.error('⚠️ Google Maps API loaded but not available - script load issue')
          if (ALLOW_EMBED_FALLBACK) {
            setUseEmbedAPI(true)
          } else {
            console.error('⚠️ Embed API fallback disabled - fix API configuration')
          }
          }
        }, 100)
      }
      
      script.onerror = () => {
      // Only fallback on actual script load failure
      console.error('⚠️ Failed to load Google Maps API script')
      if (ALLOW_EMBED_FALLBACK) {
        console.error('⚠️ Using Embed API fallback (multiple markers will NOT work)')
        setUseEmbedAPI(true)
      } else {
        console.error('⚠️ Embed API fallback disabled - fix script loading for multiple markers to work')
      }
    }
    
    document.head.appendChild(script)
  }, [useEmbedAPI])

  // ✅ Step 3: Create markers AFTER map exists
  useEffect(() => {
    // Only create markers if:
    // 1. Map is ready (fully initialized)
    // 2. Using JavaScript API (not Embed API)
    // 3. Google Maps API is available
    if (!mapReady || !mapInstanceRef.current || useEmbedAPI || !window.google?.maps) {
      return
    }

    updateMarkers()
  }, [jobs, mapReady, mapType, useEmbedAPI])

  const initializeMap = () => {
    // Protect against re-initialization
    if (mapInstanceRef.current) return
    
    if (!window.google?.maps) {
      console.error('⚠️ Google Maps API not available')
      // DO NOT fallback to Embed API here - this is an API configuration issue, not a script load issue
      // Let the user fix their API configuration instead of silently falling back
      return
    }

    if (!mapRef.current) return

    // Check if element is actually in the DOM
    if (!document.body.contains(mapRef.current)) return

    // Check if element has dimensions
    const rect = mapRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      // Retry when element gets dimensions
      const checkDimensions = setInterval(() => {
        const newRect = mapRef.current?.getBoundingClientRect()
        if (newRect && newRect.width > 0 && newRect.height > 0) {
          clearInterval(checkDimensions)
          initializeMap()
        }
      }, 100)
      setTimeout(() => clearInterval(checkDimensions), 5000)
      return
    }

    // Default center
    const defaultCenter = { lat: 40.7128, lng: -74.0060 }
    const defaultZoom = 11

    try {
      const map = new window.google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        mapTypeId: mapType === 'satellite' ? window.google.maps.MapTypeId.SATELLITE : window.google.maps.MapTypeId.ROADMAP,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      })

      if (!map) {
        console.error('⚠️ Map initialization returned null')
        // DO NOT fallback - this indicates an API configuration issue
        return
      }

      mapInstanceRef.current = map

      // Wait for map to be fully ready before allowing markers
      // This prevents race conditions
      const checkMapReady = () => {
        try {
          const center = map.getCenter()
          if (center) {
            setMapReady(true)
            console.log('✅ Map is ready for markers')
          } else {
            setTimeout(checkMapReady, 100)
          }
        } catch (err) {
          // Map might not be ready yet, retry
          setTimeout(checkMapReady, 100)
        }
      }

      // Use idle event to ensure map is fully rendered
      window.google.maps.event.addListenerOnce(map, 'idle', () => {
        setMapReady(true)
        console.log('✅ Map is ready for markers (idle event)')
      })

      // Fallback check in case idle event doesn't fire
      setTimeout(checkMapReady, 500)

    } catch (error) {
      console.error('⚠️ Error initializing map:', error)
      // DO NOT fallback to Embed API - this is likely an API configuration issue
      // Log the error so user can fix their API configuration
      console.error('⚠️ If you see ApiNotActivatedMapError, enable the Maps JavaScript API in Google Cloud Console')
    }
  }

  // Helper function to offset markers at the same location (shared by both geocodeAndAddMarkers and addMarkersDirectly)
  // Uses a position-to-count map to track how many times each original position has been offset
  const offsetDuplicatePosition = (position, existingPositions, positionCountMap = {}) => {
      // Create a key for this position (rounded to avoid floating point issues)
      const positionKey = `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`
      
      // Check if this position already exists in existing positions
      const isDuplicate = existingPositions.some(existing => {
        const latDiff = Math.abs(existing.lat - position.lat)
        const lngDiff = Math.abs(existing.lng - position.lng)
        return latDiff < 0.0001 && lngDiff < 0.0001
      })

      if (!isDuplicate) {
        // Not a duplicate, but track this position in case future markers match it
        if (!positionCountMap[positionKey]) {
          positionCountMap[positionKey] = 0
        }
        return position
      }

      // This is a duplicate - increment the count for this original position
      if (!positionCountMap[positionKey]) {
        positionCountMap[positionKey] = 0
      }
      positionCountMap[positionKey]++

      // Use the count to determine offset angle (each duplicate gets unique angle)
      const duplicateCount = positionCountMap[positionKey]
      const offsetDistance = 0.0003 // ~33 meters
      const angle = (duplicateCount * 60) * (Math.PI / 180) // 60 degrees per marker (spiral)
      const offsetLat = position.lat + (offsetDistance * Math.cos(angle))
      const offsetLng = position.lng + (offsetDistance * Math.sin(angle))

      console.log(`🗺️ JobsMap: ⚠️ Marker at duplicate location, offsetting by ${offsetDistance} degrees (${duplicateCount}th duplicate at this spot) -> ${offsetLat.toFixed(7)}, ${offsetLng.toFixed(7)}`)
      
      return { lat: offsetLat, lng: offsetLng }
  }

  // Place a small dark-blue circle marker at each unique assigned
  // cleaner's home address (from team_members table location fields).
  // Runs alongside job markers; not counted in bounds so it doesn't
  // yank the viewport toward off-map cleaners.
  const placeCleanerHomeMarkers = () => {
    if (!mapInstanceRef.current || !window.google?.maps) return
    // Clean up prior homes.
    homeMarkersRef.current.forEach(m => { try { m.setMap(null) } catch { /* ignore */ } })
    homeMarkersRef.current = []
    if (!teamMembers || teamMembers.length === 0 || !jobs || jobs.length === 0) return

    // Dedupe by team_member_id across all jobs.
    const memberIds = new Set()
    jobs.forEach(j => {
      if (Array.isArray(j.team_assignments)) {
        j.team_assignments.forEach(ta => { if (ta?.team_member_id != null) memberIds.add(ta.team_member_id) })
      }
      if (Array.isArray(j.assigned_providers)) {
        j.assigned_providers.forEach(p => { const id = p?.id || p?.team_member_id; if (id != null) memberIds.add(id) })
      }
      const solo = j.team_member_id || j.assigned_team_member_id
      if (solo != null) memberIds.add(solo)
    })

    const geocoder = new window.google.maps.Geocoder()
    memberIds.forEach(id => {
      const member = teamMembers.find(m => m.id === id || m.id === Number(id) || String(m.id) === String(id))
      if (!member) return
      const address = [member.location, member.city, member.state, member.zip_code].filter(Boolean).join(', ')
      if (!address) return
      const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || `Team member #${id}`
      const cacheKey = `home:${address}`
      const cached = geocodeCacheRef.current[cacheKey]
      const drop = (position) => {
        // House icon over a dark-blue disc — same silhouette used on
        // JobRouteMap and ZipCoverageMap so operators pattern-match
        // "cleaner's home" consistently across every map in the app.
        const iconUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="11" fill="#1E3A8A" stroke="#FFFFFF" stroke-width="1.5"/>
            <path d="M5 11 12 5 19 11 19 18 A1 1 0 0 1 18 19 L14 19 L14 14 L10 14 L10 19 L6 19 A1 1 0 0 1 5 18 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.4"/>
          </svg>`
        )}`
        const marker = new window.google.maps.Marker({
          position,
          map: mapInstanceRef.current,
          title: `${fullName} — home`,
          icon: {
            url: iconUrl,
            anchor: new window.google.maps.Point(14, 14),
            scaledSize: new window.google.maps.Size(28, 28),
          },
          zIndex: 500,
        })
        const info = new window.google.maps.InfoWindow({
          content: `<div style="font-family: Montserrat, sans-serif; font-size: 12px; padding: 4px;">
            <strong>${fullName}</strong><br/>
            <span style="color:#64748B">${address}</span>
          </div>`,
        })
        marker.addListener('click', () => info.open({ anchor: marker, map: mapInstanceRef.current }))
        homeMarkersRef.current.push(marker)
      }
      if (cached) { drop(cached); return }
      geocoder.geocode({ address }, (results, statusCode) => {
        if (statusCode !== 'OK' || !results?.[0]) return
        const pos = results[0].geometry.location
        geocodeCacheRef.current[cacheKey] = pos
        drop(pos)
      })
    })
  }

  // Chain a cleaner's day: draw home → job1 → job2 → … as a single
  // DirectionsRenderer polyline colored per cleaner. Reads job positions
  // out of markersRef.current (populated after markers are placed), groups
  // by the PRIMARY assigned cleaner, sorts by scheduled_time, calls
  // DirectionsService once per cleaner (waypoints are cheap — a single
  // billed request each).
  //
  // Deferred slightly so both the direct-coords and async-geocode marker
  // paths have a chance to populate markersRef.current before we group.
  const CLEANER_ROUTE_PALETTE = ['#7C3AED', '#059669', '#F97316', '#3B82F6', '#EC4899', '#EAB308', '#0891B2', '#DC2626']
  const routeColorForCleaner = (id) => {
    const n = Math.abs(Number(id) || 0)
    return CLEANER_ROUTE_PALETTE[n % CLEANER_ROUTE_PALETTE.length]
  }
  const parseTimeMinutes = (t) => {
    if (!t) return null
    const m = String(t).match(/(\d{1,2}):(\d{2})/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const placeCleanerRoutes = async () => {
    if (!mapInstanceRef.current || !window.google?.maps) return
    // Clear prior routes.
    routesRef.current.forEach(r => { try { r.setMap(null) } catch { /* ignore */ } })
    routesRef.current = []
    if (!markersRef.current || markersRef.current.length === 0) return
    if (!teamMembers || teamMembers.length === 0) return

    // Group markers by PRIMARY cleaner id (first in getCleanerNames'
    // resolution order). Multi-cleaner teams travel together so one
    // route per primary is enough — avoids drawing overlapping lines.
    const byCleaner = new Map()
    for (const entry of markersRef.current) {
      const job = entry.job
      if (!job) continue
      let cleanerId = null
      if (Array.isArray(job.team_assignments) && job.team_assignments.length > 0) {
        cleanerId = job.team_assignments[0]?.team_member_id
      }
      if (cleanerId == null && Array.isArray(job.assigned_providers) && job.assigned_providers.length > 0) {
        cleanerId = job.assigned_providers[0]?.id || job.assigned_providers[0]?.team_member_id
      }
      if (cleanerId == null) cleanerId = job.team_member_id || job.assigned_team_member_id
      if (cleanerId == null) continue
      const key = String(cleanerId)
      if (!byCleaner.has(key)) byCleaner.set(key, [])
      byCleaner.get(key).push(entry)
    }

    const directionsService = new window.google.maps.DirectionsService()
    const geocoder = new window.google.maps.Geocoder()

    for (const [cleanerId, entries] of byCleaner) {
      if (entries.length === 0) continue
      // Sort by scheduled_time so the daily order is preserved.
      entries.sort((a, b) => {
        const ta = parseTimeMinutes(a.job.scheduled_time) ?? 0
        const tb = parseTimeMinutes(b.job.scheduled_time) ?? 0
        return ta - tb
      })

      // Look up the cleaner's home. Skip route if no home on file — we
      // can't draw home→jobs without a starting point.
      const member = teamMembers.find(m => m.id === Number(cleanerId) || String(m.id) === cleanerId)
      if (!member) continue
      const homeAddress = [member.location, member.city, member.state, member.zip_code].filter(Boolean).join(', ')
      if (!homeAddress) continue

      // Geocode home (reuse cache from home-marker pass).
      const homeKey = `home:${homeAddress}`
      let homePos = geocodeCacheRef.current[homeKey]
      if (!homePos) {
        const { pos, ok } = await new Promise((resolve) => {
          geocoder.geocode({ address: homeAddress }, (results, status) => {
            if (status === 'OK' && results?.[0]) resolve({ pos: results[0].geometry.location, ok: true })
            else resolve({ pos: null, ok: false })
          })
        })
        if (!ok) continue
        homePos = pos
        geocodeCacheRef.current[homeKey] = homePos
      }

      // Build waypoints: home → job1 → job2 … Google Maps allows up to
      // 25 waypoints per request. Cap defensively.
      const jobPositions = entries.slice(0, 25).map(e => e.position)
      if (jobPositions.length === 0) continue
      const req = {
        origin: homePos,
        destination: jobPositions[jobPositions.length - 1],
        waypoints: jobPositions.slice(0, -1).map(p => ({ location: p, stopover: true })),
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,  // preserve the operator's scheduled order
      }
      const { result, status } = await new Promise((resolve) => {
        directionsService.route(req, (result, status) => resolve({ result, status }))
      })
      if (status !== 'OK' || !result?.routes?.[0]) continue

      const color = routeColorForCleaner(cleanerId)
      const renderer = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        directions: result,
        suppressMarkers: true,  // keep our own job + home markers
        preserveViewport: true, // don't yank the operator's zoom
        polylineOptions: {
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.75,
        },
      })
      routesRef.current.push(renderer)
    }
  }

  const updateMarkers = () => {
    if (!mapInstanceRef.current || !window.google || !window.google.maps) return

    // Clear existing markers first
    markersRef.current.forEach(m => {
      if (m.marker) {
        m.marker.setMap(null)
      }
    })
    markersRef.current = []
    // Clear stale home markers too — they're re-placed below alongside job markers.
    homeMarkersRef.current.forEach(m => { try { m.setMap(null) } catch { /* ignore */ } })
    homeMarkersRef.current = []
    // Clear prior chained routes so they're not left over from the previous set of jobs.
    routesRef.current.forEach(r => { try { r.setMap(null) } catch { /* ignore */ } })
    routesRef.current = []

    // If no jobs, just update map type and return
    if (!jobs || jobs.length === 0) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setMapTypeId(
          mapType === 'satellite' 
            ? window.google.maps.MapTypeId.SATELLITE 
            : window.google.maps.MapTypeId.ROADMAP
        )
      }
      setMarkersPlaced(true)
      return
    }

    console.log(`🗺️ JobsMap: Received ${jobs.length} jobs to process`)
    
    // Debug: Log first job structure to see what fields are available
    if (jobs.length > 0) {
      console.log(`🗺️ JobsMap: DEBUG - First job structure:`, {
        id: jobs[0].id,
        service_address_street: jobs[0].service_address_street,
        service_address_city: jobs[0].service_address_city,
        service_address_state: jobs[0].service_address_state,
        service_address_zip: jobs[0].service_address_zip,
        service_address: jobs[0].service_address,
        customer_address: jobs[0].customer_address,
        address: jobs[0].address,
        customers: jobs[0].customers ? {
          address: jobs[0].customers.address,
          city: jobs[0].customers.city,
          state: jobs[0].customers.state,
          zip_code: jobs[0].customers.zip_code
        } : null,
        service_address_lat: jobs[0].service_address_lat,
        service_address_lng: jobs[0].service_address_lng
      })
    }

    // Separate jobs with direct lat/lng from jobs that need geocoding
    const jobsWithCoordinates = []
    const jobsNeedingGeocoding = []
    const jobsWithoutLocation = []

    jobs.forEach(job => {
      // Check for direct coordinates (multiple possible field names)
      const lat = job.lat || job.latitude || job.service_address_lat || job.service_lat || 
                  job.serviceAddressLat || job.serviceLat
      const lng = job.lng || job.longitude || job.service_address_lng || job.service_lng || 
                  job.serviceAddressLng || job.serviceLng

      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        // Job has direct coordinates - add directly
        jobsWithCoordinates.push({
          ...job,
          position: { lat: parseFloat(lat), lng: parseFloat(lng) }
        })
        console.log(`🗺️ JobsMap: Job ${job.id} has direct coordinates: ${lat}, ${lng}`)
      } else {
        // Job needs geocoding - build address the SAME way as schedule view does
        // According to schedule view: street = service_address_street || customer_address
        // Each job carries its own customer_address (which is the job's address)
        
        // 🔍 DEBUG: Log ALL address-related fields for this job to see what's actually available
        console.log(`🗺️ JobsMap: 🔍 DEBUG Job ${job.id} - ALL address fields:`, {
          // Service address components (try first)
          service_address_street: job.service_address_street,
          service_address_city: job.service_address_city,
          service_address_state: job.service_address_state,
          service_address_zip: job.service_address_zip,
          service_address: job.service_address,
          // Customer address (this is what schedule view uses as fallback)
          customer_address: job.customer_address,
          customer_city: job.customer_city,
          customer_state: job.customer_state,
          customer_zip_code: job.customer_zip_code,
          // Generic fields
          address: job.address,
          city: job.city,
          state: job.state,
          zip: job.zip,
          zip_code: job.zip_code,
          // Nested customer object
          customers: job.customers ? {
            address: job.customers.address,
            city: job.customers.city,
            state: job.customers.state,
            zip_code: job.customers.zip_code
          } : null,
          // Full job object keys (to see what's actually there)
          allKeys: Object.keys(job).filter(key => 
            key.toLowerCase().includes('address') || 
            key.toLowerCase().includes('street') || 
            key.toLowerCase().includes('city') || 
            key.toLowerCase().includes('state') || 
            key.toLowerCase().includes('zip')
          )
        })
        
        // Build address the SAME way as schedule-redesigned.jsx does (lines 3245-3253)
        const addressParts = []
        
        // Street: service_address_street OR customer_address (same as schedule view)
        const street = job.service_address_street || job.customer_address || ''
        
        if (street && street.trim()) {
          addressParts.push(street.trim())
        }
        
        // City: service_address_city OR customer_city (same as schedule view)
        const city = job.service_address_city || job.customer_city || ''
        
        if (city && city.trim()) {
          addressParts.push(city.trim())
        }
        
        // State: service_address_state OR customer_state (same as schedule view)
        const state = job.service_address_state || job.customer_state || ''
        
        if (state && state.trim()) {
          addressParts.push(state.trim())
        }
        
        // Zip: service_address_zip OR customer_zip_code (same as schedule view)
        const zip = job.service_address_zip || job.customer_zip_code || ''
        
        if (zip && zip.trim()) {
          addressParts.push(zip.trim())
        }
        
        // Build address string from parts
        let address = addressParts.join(', ')
        
        // Fallback: try full address fields (same priority as schedule view line 4789)
        if (!address || address.trim() === '') {
          const fallbackAddress = job.customer_address || job.address || job.service_address || ''
          
          if (fallbackAddress && fallbackAddress.trim()) {
            address = fallbackAddress.trim()
            console.log(`🗺️ JobsMap: Job ${job.id} using fallback address field: "${address}"`)
          } else {
            console.warn(`🗺️ JobsMap: Job ${job.id} has NO address data at all!`)
          }
        } else {
          // We have address components - log them
          console.log(`🗺️ JobsMap: Job ${job.id} built address: "${address}"`, {
            street: street || 'none',
            city: city || 'none',
            state: state || 'none',
            zip: zip || 'none',
            source: 'service_address_* || customer_* (same as schedule view)'
          })
        }
        
        // Even if we only have city/state, try to geocode it
        // This ensures we show markers for jobs with partial location data
        if (address.trim() !== '') {
          jobsNeedingGeocoding.push({ ...job, address })
          console.log(`🗺️ JobsMap: Job ${job.id} will be geocoded with address: "${address}"`)
        } else {
          // Last resort: try to build from just city/state if available
          const minimalAddress = [city, state].filter(Boolean).join(', ')
          if (minimalAddress.trim() !== '') {
            jobsNeedingGeocoding.push({ ...job, address: minimalAddress })
            console.log(`🗺️ JobsMap: Job ${job.id} will be geocoded with minimal address: "${minimalAddress}"`)
          } else {
            jobsWithoutLocation.push(job)
            console.warn(`🗺️ JobsMap: Job ${job.id} has NO location data (no coordinates, no address, no city/state)`)
            console.warn(`🗺️ JobsMap: Job ${job.id} available fields:`, {
              service_address_street: job.service_address_street,
              service_address_city: job.service_address_city,
              service_address_state: job.service_address_state,
              service_address_zip: job.service_address_zip,
              service_address: job.service_address,
              customer_address: job.customer_address,
              address: job.address,
              city: job.city,
              state: job.state
            })
          }
        }
      }
    })

    // Log summary
    console.log(`🗺️ JobsMap: Processing summary:`)
    console.log(`  - Jobs with coordinates: ${jobsWithCoordinates.length}`)
    console.log(`  - Jobs needing geocoding: ${jobsNeedingGeocoding.length}`)
    if (jobsWithoutLocation.length > 0) {
      console.warn(`  - Jobs without location: ${jobsWithoutLocation.length} (these will NOT show markers)`)
    }
    
    // CRITICAL DEBUG: Log all addresses that will be geocoded to check for duplicates
    if (jobsNeedingGeocoding.length > 0) {
      console.log(`🗺️ JobsMap: All addresses to be geocoded:`)
      const addressCounts = {}
      jobsNeedingGeocoding.forEach(job => {
        const addr = job.address || 'NO ADDRESS'
        addressCounts[addr] = (addressCounts[addr] || 0) + 1
        console.log(`  - Job ${job.id}: "${addr}"`)
      })
      
      // Check for duplicate addresses
      const duplicates = Object.entries(addressCounts).filter(([addr, count]) => count > 1)
      if (duplicates.length > 0) {
        console.warn(`🗺️ JobsMap: ⚠️ WARNING: Found ${duplicates.length} duplicate address(es):`)
        duplicates.forEach(([addr, count]) => {
          console.warn(`  - "${addr}" is used by ${count} jobs`)
        })
      } else {
        console.log(`🗺️ JobsMap: ✅ All addresses are unique`)
      }
    }

    // Add markers for jobs with direct coordinates
    if (jobsWithCoordinates.length > 0) {
      console.log(`🗺️ JobsMap: Adding ${jobsWithCoordinates.length} markers directly from coordinates`)
      addMarkersDirectly(jobsWithCoordinates, mapInstanceRef.current)
    }

    // Fire home markers in parallel — they don't affect bounds and
    // resolve asynchronously via Geocoder. Called once per updateMarkers
    // regardless of coord/geocode split, since dedup is by team_member_id.
    placeCleanerHomeMarkers()

    // Geocode and add markers for jobs that need it
    if (jobsNeedingGeocoding.length > 0) {
      console.log(`🗺️ JobsMap: Geocoding ${jobsNeedingGeocoding.length} jobs (sequential with throttle)`)
      geocodeAndAddMarkers(jobsNeedingGeocoding, mapInstanceRef.current).then(() => {
        // ✅ Fix 4: Fit bounds ONCE after all markers are added
        fitBoundsToAllMarkers()
        // Chain per-cleaner daily routes now that we have every job's position.
        placeCleanerRoutes()
      }).catch(error => {
        console.error('🗺️ JobsMap: Error updating markers:', error)
        // Still try to fit bounds even if some geocoding failed
        fitBoundsToAllMarkers()
        placeCleanerRoutes()
      })
    } else {
      console.log(`🗺️ JobsMap: No jobs need geocoding`)
      // ✅ Fix 4: Fit bounds ONCE if no geocoding needed
      fitBoundsToAllMarkers()
      // All positions available immediately — chain daily routes now.
      placeCleanerRoutes()
    }

    // Warn about jobs without location
    if (jobsWithoutLocation.length > 0) {
      console.warn(`🗺️ JobsMap: ${jobsWithoutLocation.length} jobs cannot be displayed (no location data)`)
      console.warn(`🗺️ JobsMap: Job IDs without location:`, jobsWithoutLocation.map(j => j.id || j._id || 'unknown'))
    }

    // Update map type
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setMapTypeId(
        mapType === 'satellite' 
          ? window.google.maps.MapTypeId.SATELLITE 
          : window.google.maps.MapTypeId.ROADMAP
      )
    }
  }

  // Helper function to add markers directly when coordinates are available
  const addMarkersDirectly = (jobsWithCoords, map) => {
    if (!window.google || !window.google.maps) return

    const bounds = new window.google.maps.LatLngBounds()
    const newMarkers = []
    const existingPositions = [] // Track positions for duplicate detection
    const positionCountMap = {} // Track how many times each original position has been offset

    // Classic location pin SVG - proper map pin icon (not house)
    const getPinIcon = () => {
      return {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        fillColor: "#3b82f6",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        scale: 1.5,
        anchor: new window.google.maps.Point(12, 24),
      }
    }

    jobsWithCoords.forEach(job => {
      const originalPosition = job.position
      // Offset position if it's a duplicate location
      const finalPosition = offsetDuplicatePosition(originalPosition, existingPositions, positionCountMap)
      
      // ✅ Fix 3: Guard against mid-flight resets
      if (!mapInstanceRef.current || useEmbedAPI) {
        return
      }
          
          // Get customer name from job
          const customerName = job.customer_name || 
            (job.customer_first_name && job.customer_last_name 
              ? `${job.customer_first_name} ${job.customer_last_name}` 
              : job.customer_first_name || job.customer_last_name || '') ||
            (job.customers?.first_name && job.customers?.last_name
              ? `${job.customers.first_name} ${job.customers.last_name}`
              : job.customers?.first_name || job.customers?.last_name || '')
          
      // Build address for info window
      let displayAddress = ''
      if (job.service_address_street) {
        const parts = [job.service_address_street]
        if (job.service_address_city) parts.push(job.service_address_city)
        if (job.service_address_state) parts.push(job.service_address_state)
        if (job.service_address_zip || job.service_address_zip_code) parts.push(job.service_address_zip || job.service_address_zip_code)
        displayAddress = parts.join(', ')
      } else {
        displayAddress = job.service_address || job.customer_address || job.address || ''
      }

      // Create marker (no label on pin – job ID is in the info window with link)
          const marker = new window.google.maps.Marker({
        position: finalPosition,
        map: mapInstanceRef.current,
            title: customerName || decodeHtmlEntities(job.service_name || '') || `Job ${job.id}`,
            icon: getPinIcon(),
            label: null,
            animation: window.google.maps.Animation.DROP
          })

          // Create info window – job ID at top as link, then customer, address, service, cleaner
          const cleanerNames = getCleanerNames(job)
          const cleanerLine = cleanerNames.length > 0
            ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #555;">👤 ${cleanerNames.join(', ')}</p>`
            : `<p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">Unassigned</p>`
          const jobIdLine = job.id
            ? `<p style="margin: 0 0 6px 0; font-size: 12px;"><a href="/job/${job.id}" target="_self" style="color: #2563eb; font-weight: 600; text-decoration: none;">Job #${job.id}</a></p>`
            : ''
          const infoWindow = new window.google.maps.InfoWindow({
            content: `
              <div style="position: relative; padding: 8px; padding-right: 28px; min-width: 200px;">
                <button type="button" class="jobs-map-infowindow-close" style="position: absolute; top: 4px; right: 4px; margin: 0; padding: 0; border: none; background: none; cursor: pointer; font-size: 18px; line-height: 1; color: #666;" aria-label="Close">&times;</button>
                ${jobIdLine}
                <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
                  ${customerName || decodeHtmlEntities(job.service_name || '') || `Job ${job.id || ''}`}
                </h3>
            ${displayAddress ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${displayAddress}</p>` : ''}
                ${job.service_name ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #333;">${decodeHtmlEntities(job.service_name)}</p>` : ''}
                ${cleanerLine}
              </div>
            `
          })
          window.google.maps.event.addListener(infoWindow, 'domready', () => {
            const btn = document.querySelector('.jobs-map-infowindow-close')
            if (btn) btn.onclick = () => infoWindow.close()
          })

      // Add click listener
          marker.addListener('click', () => {
            // Close all other info windows
            markersRef.current.forEach(m => {
              if (m.infoWindow) {
                m.infoWindow.close()
              }
            })
        infoWindow.open(mapInstanceRef.current, marker)
          })

      newMarkers.push({
            marker,
            infoWindow,
        position: finalPosition,
        job,
      })
      existingPositions.push(finalPosition) // Track FINAL position (after offset) for duplicate detection
      bounds.extend(finalPosition)
    })

    // Add new markers to existing markers array
    markersRef.current = [...markersRef.current, ...newMarkers]

    // Check for duplicate locations
    const uniqueLocations = new Set()
    newMarkers.forEach(m => {
      const locationKey = `${m.position.lat.toFixed(6)},${m.position.lng.toFixed(6)}`
      uniqueLocations.add(locationKey)
    })
    
    // ✅ SIMPLE CHECK: Markers count = number of locations looped over
    console.log('📍 Markers count:', markersRef.current.length)
    
    console.log(`🗺️ JobsMap: Added ${newMarkers.length} markers directly from coordinates (total: ${markersRef.current.length})`)
    console.log(`🗺️ JobsMap: 📍 Unique locations: ${uniqueLocations.size}`)
    
    if (newMarkers.length > uniqueLocations.size) {
      console.warn(`🗺️ JobsMap: ⚠️ ${newMarkers.length - uniqueLocations.size} marker(s) at duplicate locations (offset applied)`)
    }

    // ✅ Fix 4: Bounds fitting is now done ONCE in updateMarkers() after all markers are added
    // This prevents multiple fits and zoom snapping
  }

  // ✅ Fix 4: Fit bounds ONCE per update (centralized function)
  const fitBoundsToAllMarkers = () => {
    if (!mapInstanceRef.current || !window.google?.maps || markersRef.current.length === 0) {
      return
    }

    const allBounds = new window.google.maps.LatLngBounds()
    markersRef.current.forEach(m => allBounds.extend(m.position))

    if (markersRef.current.length === 1) {
      // Single marker - center and zoom
      mapInstanceRef.current.setCenter(markersRef.current[0].position)
      mapInstanceRef.current.setZoom(14)
    } else {
      // Multiple markers - fit bounds to show all markers
      // Ensure bounds is valid before fitting
      if (allBounds.getNorthEast().lat() !== allBounds.getSouthWest().lat() || 
          allBounds.getNorthEast().lng() !== allBounds.getSouthWest().lng()) {
        // Use fitBounds with padding to ensure all markers are visible
        mapInstanceRef.current.fitBounds(allBounds, {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50
        })
        
        // Set a maximum zoom level to prevent zooming in too close
        // This ensures all markers stay visible
        window.google.maps.event.addListenerOnce(mapInstanceRef.current, 'bounds_changed', () => {
          if (mapInstanceRef.current.getZoom() > 15) {
            mapInstanceRef.current.setZoom(15)
          }
        })
      } else {
        // All markers at same location, just center on it
        mapInstanceRef.current.setCenter(markersRef.current[0].position)
        mapInstanceRef.current.setZoom(14)
      }
    }
    setMarkersPlaced(true)
  }

  const geocodeAndAddMarkers = async (jobsWithAddresses, map) => {
    if (!window.google || !window.google.maps) return

    // ✅ Fix 3: Guard against mid-flight resets
    if (!mapInstanceRef.current || useEmbedAPI) {
      console.warn('🗺️ JobsMap: Skipping geocoding - map not ready or using Embed API')
          return
        }

    const geocoder = new window.google.maps.Geocoder()
    const bounds = new window.google.maps.LatLngBounds()
    const markers = []

    // Markers are cleared in updateMarkers() before calling this function

    // Classic location pin SVG - proper map pin icon (not house)
    const getPinIcon = () => {
      // Classic location pin SVG path - proper pin shape
      return {
        path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
        fillColor: "#3b82f6", // blue
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
        scale: 1.5,
        anchor: new window.google.maps.Point(12, 24),
      }
    }

    // Helper function to create marker (used by both cached and geocoded paths)
    const createMarker = (job, position, address, existingPositions = [], positionCountMap = {}) => {
      // ✅ Fix 3: Guard against mid-flight resets before creating marker
      if (!mapInstanceRef.current || useEmbedAPI) {
        return null
      }

      // Offset position if it's a duplicate location
      const finalPosition = offsetDuplicatePosition(position, existingPositions, positionCountMap)

            // Get customer name from job
            const customerName = job.customer_name || 
              (job.customer_first_name && job.customer_last_name 
                ? `${job.customer_first_name} ${job.customer_last_name}` 
                : job.customer_first_name || job.customer_last_name || '') ||
              (job.customers?.first_name && job.customers?.last_name
                ? `${job.customers.first_name} ${job.customers.last_name}`
                : job.customers?.first_name || job.customers?.last_name || '')
            
      // Use the address parameter, or build it if not provided
      let displayAddress = address || ''
      if (!displayAddress) {
        if (job.service_address_street) {
          const parts = [job.service_address_street]
          if (job.service_address_city) parts.push(job.service_address_city)
          if (job.service_address_state) parts.push(job.service_address_state)
          if (job.service_address_zip || job.service_address_zip_code) parts.push(job.service_address_zip || job.service_address_zip_code)
          displayAddress = parts.join(', ')
        } else {
          displayAddress = job.service_address || job.customer_address || job.address || ''
        }
      }

      // Create marker (no label on pin – job ID is in the info window with link)
            const marker = new window.google.maps.Marker({
              position: position,
        map: mapInstanceRef.current,
              title: customerName || decodeHtmlEntities(job.service_name || '') || `Job ${job.id}`,
              icon: getPinIcon(),
              label: null,
              animation: window.google.maps.Animation.DROP
            })

            // Create info window – job ID at top as link, then customer, address, service, cleaner
            const cleanerNames = getCleanerNames(job)
            const cleanerLine = cleanerNames.length > 0
              ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #555;">👤 ${cleanerNames.join(', ')}</p>`
              : `<p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">Unassigned</p>`
            const jobIdLine = job.id
              ? `<p style="margin: 0 0 6px 0; font-size: 12px;"><a href="/job/${job.id}" target="_self" style="color: #2563eb; font-weight: 600; text-decoration: none;">Job #${job.id}</a></p>`
              : ''
            const infoWindow = new window.google.maps.InfoWindow({
              content: `
                <div style="position: relative; padding: 8px; padding-right: 28px; min-width: 200px;">
                  <button type="button" class="jobs-map-infowindow-close" style="position: absolute; top: 4px; right: 4px; margin: 0; padding: 0; border: none; background: none; cursor: pointer; font-size: 18px; line-height: 1; color: #666;" aria-label="Close">&times;</button>
                  ${jobIdLine}
                  <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
                    ${customerName || decodeHtmlEntities(job.service_name || '') || `Job ${job.id || ''}`}
                  </h3>
            ${displayAddress ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${displayAddress}</p>` : ''}
                  ${job.service_name ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #333;">${decodeHtmlEntities(job.service_name)}</p>` : ''}
                  ${cleanerLine}
                </div>
              `
            })
            window.google.maps.event.addListener(infoWindow, 'domready', () => {
              const btn = document.querySelector('.jobs-map-infowindow-close')
              if (btn) btn.onclick = () => infoWindow.close()
            })

      // Add click listener
            marker.addListener('click', () => {
              // Close all other info windows
              markersRef.current.forEach(m => {
                if (m.infoWindow) {
                  m.infoWindow.close()
                }
              })
        infoWindow.open(mapInstanceRef.current, marker)
      })

      return { marker, infoWindow, position: finalPosition, job }
    }

    // Track positions to detect duplicates
    const existingPositions = []
    // Track how many times each original position has been offset
    const positionCountMap = {}

    // ✅ Fix 2: Sequential throttled geocoding (instead of parallel)
    for (let index = 0; index < jobsWithAddresses.length; index++) {
      const job = jobsWithAddresses[index]
      const addressKey = job.address.toLowerCase().trim()
      
      // Also check if address is empty or suspicious
      if (!job.address || job.address.trim() === '') {
        console.error(`🗺️ JobsMap: ❌ Job ${job.id} has EMPTY address! Skipping geocoding.`)
        continue
      }
      
      // Log what address we're about to geocode
      console.log(`🗺️ JobsMap: 🔍 Job ${job.id} - About to geocode address: "${job.address}"`)
      
      // Check cache first
      if (geocodeCacheRef.current[addressKey]) {
        const cached = geocodeCacheRef.current[addressKey]
        const originalPosition = cached.position
        
        // ✅ IMPORTANT: Even cached positions need offset checking
        // The cache stores the original geocoded position, but we still need to offset if duplicates exist
        // Note: createMarker will handle the offset, so we pass the original position and positionCountMap
        const markerData = createMarker(job, originalPosition, job.address, existingPositions, positionCountMap)
        if (markerData) {
          markers.push(markerData)
          existingPositions.push(markerData.position) // Track FINAL position (after offset) for duplicate detection
          bounds.extend(markerData.position)
          console.log(`🗺️ JobsMap: ✅ Added cached marker for job ${job.id || job._id || index + 1}: "${job.address}" at ${markerData.position.lat}, ${markerData.position.lng}`)
        }
      } else {
        // Not in cache, geocode it sequentially with throttle
        await new Promise((resolve) => {
          geocoder.geocode({ address: job.address }, (results, status) => {
            // ✅ Fix 3: Guard against mid-flight resets
            if (!mapInstanceRef.current || useEmbedAPI) {
              console.warn(`🗺️ JobsMap: Skipping marker creation - map reset during geocoding`)
              resolve()
              return
            }

            if (status === 'OK' && results[0]) {
              const location = results[0].geometry.location
              const position = { lat: location.lat(), lng: location.lng() }

              // Cache the result
              geocodeCacheRef.current[addressKey] = { position }
              
              console.log(`🗺️ JobsMap: ✅ Geocoded job ${job.id || job._id || index + 1}: "${job.address}" -> ${position.lat}, ${position.lng}`)

              const markerData = createMarker(job, position, job.address, existingPositions)
              if (markerData) {
                markers.push(markerData)
                existingPositions.push(markerData.position) // Track position for duplicate detection
                bounds.extend(markerData.position)
              }
            } else {
              console.warn(`🗺️ JobsMap: ❌ Geocoding failed for job ${job.id || job._id || index + 1}: "${job.address}" - Status: ${status}`)
              // Try to provide helpful error message
              if (status === 'ZERO_RESULTS') {
                console.warn(`🗺️ JobsMap: Address not found: "${job.address}"`)
              } else if (status === 'OVER_QUERY_LIMIT') {
                console.error(`🗺️ JobsMap: Geocoding quota exceeded - throttling will help but may need more delay`)
              } else if (status === 'REQUEST_DENIED') {
                console.error(`🗺️ JobsMap: Geocoding request denied - check API key permissions`)
              } else if (status === 'INVALID_REQUEST') {
                console.error(`🗺️ JobsMap: Invalid geocoding request for: "${job.address}"`)
              }
            }
            resolve()
          })
        })

        // ✅ Fix 2: Throttle delay to avoid OVER_QUERY_LIMIT
        // Small delay between geocoding requests (150ms)
        if (index < jobsWithAddresses.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150))
        }
      }
    }

    // Store markers (merge with any existing direct markers)
    markersRef.current = [...markersRef.current, ...markers]

    const successfulMarkers = markers.length
    const totalMarkers = markersRef.current.length
    
    // ✅ SIMPLE CHECK: Markers count = number of locations looped over
    console.log('📍 Markers count:', markersRef.current.length)
    
    // Check for duplicate locations
    const uniqueLocations = new Set()
    const duplicateLocations = []
    markers.forEach(m => {
      const locationKey = `${m.position.lat.toFixed(6)},${m.position.lng.toFixed(6)}`
      if (uniqueLocations.has(locationKey)) {
        duplicateLocations.push(m.position)
      } else {
        uniqueLocations.add(locationKey)
      }
    })
    
    console.log(`🗺️ JobsMap: ✅ Successfully added ${successfulMarkers} markers from geocoding`)
    console.log(`🗺️ JobsMap: 📍 Total markers on map: ${totalMarkers}`)
    console.log(`🗺️ JobsMap: 📍 Unique locations: ${uniqueLocations.size}`)
    
    if (duplicateLocations.length > 0) {
      console.warn(`🗺️ JobsMap: ⚠️ ${duplicateLocations.length} marker(s) at duplicate locations (offset applied)`)
    }
    
    if (successfulMarkers < jobsWithAddresses.length) {
      const failed = jobsWithAddresses.length - successfulMarkers
      console.warn(`🗺️ JobsMap: ⚠️ ${failed} job(s) failed to geocode and won't show markers`)
    }

    // ✅ Fix 4: Bounds fitting is now done ONCE in updateMarkers() after all markers are added
    // This prevents multiple fits and zoom snapping
  }

  // Generate embed URL - this works without billing or JavaScript API activation
  const generateEmbedUrl = () => {
    const apiKey = getGoogleMapsApiKey()
    if (!jobs || jobs.length === 0) {
      return `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=40.7128,-74.0060&zoom=11&maptype=${mapType === 'satellite' ? 'satellite' : 'roadmap'}`
    }

    const jobsWithAddresses = jobs
      .map(job => {
        let address = ''
        if (job.service_address_street) {
          const parts = [job.service_address_street]
          if (job.service_address_city) parts.push(job.service_address_city)
          if (job.service_address_state) parts.push(job.service_address_state)
          if (job.service_address_zip || job.service_address_zip_code) parts.push(job.service_address_zip || job.service_address_zip_code)
          address = parts.join(', ')
        } else {
          address = job.service_address || job.customer_address || job.address || ''
        }
        return address.trim() !== '' ? address : null
      })
      .filter(addr => addr !== null)

    if (jobsWithAddresses.length === 0) {
      return `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=40.7128,-74.0060&zoom=11&maptype=${mapType === 'satellite' ? 'satellite' : 'roadmap'}`
    }

    if (jobsWithAddresses.length === 1) {
      return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(jobsWithAddresses[0])}&zoom=14&maptype=${mapType === 'satellite' ? 'satellite' : 'roadmap'}`
    }

    // For multiple addresses, use search mode which shows all locations
    const addresses = jobsWithAddresses.join('|')
    return `https://www.google.com/maps/embed/v1/search?key=${apiKey}&q=${encodeURIComponent(addresses)}&zoom=10&maptype=${mapType === 'satellite' ? 'satellite' : 'roadmap'}`
  }

  // Fix #3: DO NOT swap DOM nodes - keep map div mounted always
  // Overlay iframe on top if using Embed API, but never unmount the map container
  return (
    <div className="w-full h-full relative" style={{ minHeight: '256px' }}>
      {/* Hide Google's default InfoWindow close (top-right); we use our own in-content close */}
      <style>{`
        .gm-style-iw + button,
        .gm-style-iw-tc { display: none !important; }
        .gm-style-iw.gm-style-iw-c {
          padding: 0 !important;
          border-radius: 8px !important;
          box-shadow: 0 2px 7px 1px rgba(0,0,0,0.3) !important;
        }
        .gm-style-iw-d {
          overflow: hidden !important;
          max-height: none !important;
        }
      `}</style>
      {/* Loading indicator while map is initializing and placing markers */}
      {!markersPlaced && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--sf-bg-page)] z-10">
          <div className="text-sm text-[var(--sf-text-muted)]">Loading map...</div>
        </div>
      )}
      {/* Map container - always mounted, hidden until markers are placed */}
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ display: 'block', opacity: markersPlaced ? 1 : 0 }}
      />
      
      {/* Embed API fallback - overlay iframe on top if needed */}
      {useEmbedAPI && (
        <iframe
          className="absolute inset-0 w-full h-full"
          frameBorder="0"
          style={{ border: 0, zIndex: 1 }}
          src={generateEmbedUrl()}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Jobs Map"
        />
      )}
    </div>
  )
}

export default JobsMap

