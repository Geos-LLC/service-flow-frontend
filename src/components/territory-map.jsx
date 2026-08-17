import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MapPin, Target, Users, DollarSign, Maximize2, X } from 'lucide-react'
import { GOOGLE_MAPS_API_KEY, getGoogleMapsApiKey } from '../config/maps'
import { loadGoogleMapsScript } from '../utils/googleMaps'
import { getZipBoundaries } from '../utils/zipBoundaries'

// Purple palette matches the Thumbtack-style service-area rendering.
const POLYGON_FILL = '#8B5CF6'
const POLYGON_STROKE = '#7C3AED'
const POLYGON_FILL_OPACITY = 0.35
const POLYGON_STROKE_WEIGHT = 2

// Debug logger — TEMPORARILY enabled by default while diagnosing the
// small↔large view flip loop. To silence: `window.__SF_TM_DEBUG = false`
// in devtools. Remove the default-on once the root cause is fixed.
const tmLog = (...args) => {
  const on = typeof window === 'undefined' || window.__SF_TM_DEBUG !== false
  if (!on) return
  // eslint-disable-next-line no-console
  console.log('[TM]', ...args)
}

let __tmInstanceCounter = 0

const TerritoryMap = ({
  territory,
  height = '400px',
  showDetails = true,
  className = '',
  onTerritoryClick = null,
  compact = false,
  enlargeable = true,  // show Expand button; disable when this IS the enlarged instance
}) => {
  const [expanded, setExpanded] = useState(false)

  // Instance id + render counter so we can tell WHICH TerritoryMap
  // (outer card vs. enlarged modal) is churning.
  const instanceIdRef = useRef(0)
  if (instanceIdRef.current === 0) instanceIdRef.current = ++__tmInstanceCounter
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  tmLog(`render #${renderCountRef.current}`, {
    inst: instanceIdRef.current,
    territoryId: territory?.id,
    territoryName: territory?.name,
    expanded,
    compact,
    enlargeable,
  })

  useEffect(() => {
    if (!expanded) return
    tmLog('escape-listener MOUNTED', { inst: instanceIdRef.current })
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      tmLog('escape-listener UNMOUNTED', { inst: instanceIdRef.current })
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const dataLayerFeaturesRef = useRef([])
  const fallbackCircleRef = useRef(null)
  const [status, setStatus] = useState('idle')  // 'idle' | 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('')

  const details = formatTerritoryDetails(territory)
  const zipCodes = Array.isArray(details?.zipCodes) ? details.zipCodes : []
  const openInGoogleMapsUrl = territory?.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(territory.location)}`
    : null

  // Initialize the map once the container is mounted and Google Maps is
  // available. We deliberately re-initialize when `territory.id` changes
  // so the map picks up a completely different territory cleanly.
  useEffect(() => {
    let cancelled = false
    if (!territory || !mapRef.current) return

    setStatus('loading')
    setErrorMessage('')

    const apiKey = getGoogleMapsApiKey() || GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setStatus('error')
      setErrorMessage('Google Maps API key not configured.')
      return
    }

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) return
        // Initialize a bare map centered on Florida — proper bounds are set
        // once polygons/geocoding resolve.
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: 27.994402, lng: -81.760254 },
          zoom: 7,
          disableDefaultUI: compact,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: !compact,
          zoomControl: true,
        })
        mapInstanceRef.current = map
        map.data.setStyle({
          fillColor: POLYGON_FILL,
          fillOpacity: POLYGON_FILL_OPACITY,
          strokeColor: POLYGON_STROKE,
          strokeWeight: POLYGON_STROKE_WEIGHT,
          clickable: false,
        })

        return renderTerritory(map, territory, zipCodes)
      })
      .then(() => { if (!cancelled) setStatus('ready') })
      .catch((err) => {
        if (cancelled) return
        console.error('[TerritoryMap] init failed', err)
        setStatus('error')
        setErrorMessage(err?.message || 'Failed to load map.')
      })

    return () => {
      cancelled = true
      // Cleanup: remove any features we added to the data layer and drop
      // the fallback circle. We leave the map instance itself alone —
      // Google Maps handles container teardown when the div unmounts.
      if (mapInstanceRef.current) {
        for (const f of dataLayerFeaturesRef.current) {
          try { mapInstanceRef.current.data.remove(f) } catch { /* ignore */ }
        }
        dataLayerFeaturesRef.current = []
      }
      if (fallbackCircleRef.current) {
        try { fallbackCircleRef.current.setMap(null) } catch { /* ignore */ }
        fallbackCircleRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territory?.id, territory?.location, territory?.radius_miles, zipCodes.join(',')])

  async function renderTerritory(map, terr, zips) {
    if (zips && zips.length > 0) {
      // Path 1: render ZIP polygons and fit bounds.
      const fc = await getZipBoundaries(zips)
      if (!fc.features.length) {
        // ZIPs entered but none matched the Florida ZCTA file — either
        // they're outside FL or the file is missing them. Fall back to
        // the radius circle so the operator still sees something.
        return renderRadiusFallback(map, terr)
      }
      const added = map.data.addGeoJson(fc)
      dataLayerFeaturesRef.current = added

      const bounds = new window.google.maps.LatLngBounds()
      extendBoundsFromGeoJson(bounds, fc)
      if (!bounds.isEmpty()) map.fitBounds(bounds, compact ? 20 : 40)
      return
    }
    // Path 2: no ZIPs configured — draw the legacy radius circle so
    // existing territories still get a visual.
    return renderRadiusFallback(map, terr)
  }

  async function renderRadiusFallback(map, terr) {
    if (!terr?.location) return
    try {
      const geocoder = new window.google.maps.Geocoder()
      const { results } = await geocoder.geocode({ address: terr.location })
      if (!results || results.length === 0) return
      const center = results[0].geometry.location
      map.setCenter(center)
      map.setZoom(Math.max(9, Math.min(13, 14 - Math.log2(terr.radius_miles || 25))))
      const circle = new window.google.maps.Circle({
        map,
        center,
        radius: (terr.radius_miles || 25) * 1609.34,  // miles → meters
        fillColor: POLYGON_FILL,
        fillOpacity: POLYGON_FILL_OPACITY,
        strokeColor: POLYGON_STROKE,
        strokeWeight: POLYGON_STROKE_WEIGHT,
        clickable: false,
      })
      fallbackCircleRef.current = circle
    } catch (err) {
      // Geocoding failure isn't fatal — the map still shows the general
      // area, just without the circle overlay.
      console.warn('[TerritoryMap] geocode fallback failed', err)
    }
  }

  if (!territory) {
    return (
      <div className={`bg-[var(--sf-bg-page)] rounded-lg flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center text-[var(--sf-text-muted)]">
          <MapPin className="w-8 h-8 mx-auto mb-2 text-[var(--sf-text-muted)]" />
          <p>No territory data available</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative bg-white overflow-hidden ${className || 'rounded-lg border border-[var(--sf-border-light)]'}`}
      style={height === '100%' ? { height: '100%' } : {}}
      onClick={onTerritoryClick ? () => onTerritoryClick(territory) : undefined}
    >
      <div className="relative h-full" style={height !== '100%' ? { height } : {}}>
        <div ref={mapRef} className="w-full h-full" />

        {/* Status overlays */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-[var(--sf-bg-page)] bg-opacity-70 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--sf-blue-500)] mx-auto mb-2"></div>
              <p className="text-[var(--sf-text-secondary)] text-sm">Loading map…</p>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 bg-[var(--sf-bg-page)] flex items-center justify-center">
            <div className="text-center text-[var(--sf-text-muted)] px-4">
              <MapPin className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">{errorMessage || 'Map failed to load'}</p>
            </div>
          </div>
        )}

        {/* Info card — non-compact only */}
        {!compact && status !== 'error' && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 max-w-xs pointer-events-none">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="w-4 h-4 text-[var(--sf-blue-500)]" />
              <h3 className="font-semibold text-[var(--sf-text-primary)]">{details.name}</h3>
            </div>
            <div className="space-y-1 text-sm text-[var(--sf-text-secondary)]">
              <div className="flex items-center space-x-2">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{details.location}</span>
              </div>
              {zipCodes.length > 0 ? (
                <div className="flex items-center space-x-2">
                  <Target className="w-3 h-3" />
                  <span>{zipCodes.length} ZIP{zipCodes.length === 1 ? '' : 's'}</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Target className="w-3 h-3" />
                  <span>{details.radius} mi radius</span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Users className="w-3 h-3" />
                <span>{details.teamMembers} team members</span>
              </div>
              <div className="flex items-center space-x-2">
                <DollarSign className="w-3 h-3" />
                <span>{details.pricingMultiplier}x pricing</span>
              </div>
            </div>
          </div>
        )}

        {/* Compact info chip */}
        {compact && status !== 'error' && (
          <div className="absolute top-2 left-2 bg-white rounded-md shadow-md p-2 max-w-[160px] pointer-events-none">
            <div className="flex items-center space-x-1 mb-1">
              <Target className="w-3 h-3 text-[var(--sf-blue-500)]" />
              <h3 className="font-medium text-[var(--sf-text-primary)] text-xs truncate">{details.name}</h3>
            </div>
            <div className="text-xs text-[var(--sf-text-secondary)]">
              {zipCodes.length > 0
                ? `${zipCodes.length} ZIP${zipCodes.length === 1 ? '' : 's'}`
                : `${details.radius} mi`}
            </div>
          </div>
        )}

        {/* Status badge — non-interactive, keep it out of the map's
            pointer stream so the cursor doesn't flicker between grab
            (map) and default (badge) as it crosses the boundary. */}
        {status !== 'error' && (
          <div className={`absolute ${compact ? 'top-2 right-2' : 'top-4 right-4'} pointer-events-none`}>
            <span className={`inline-flex items-center ${compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} rounded-full font-medium ${
              details.status === 'active'
                ? 'bg-green-100 text-green-800'
                : 'bg-[var(--sf-bg-page)] text-[var(--sf-text-primary)]'
            }`}>
              {details.status}
            </span>
          </div>
        )}

        {/* Bottom-right button stack — Expand + Open in Google Maps.
            Wrapper is pointer-events-none so hovering the gap doesn't
            steal the map's grab cursor; each button re-enables events. */}
        {status !== 'error' && (
          <div className={`absolute ${compact ? 'bottom-2 right-2' : 'bottom-4 right-4'} flex gap-2 pointer-events-none`}>
            {enlargeable && (
              <button
                type="button"
                onClick={(e) => {
                  tmLog('MAXIMIZE clicked', { inst: instanceIdRef.current, target: e.target?.tagName })
                  e.stopPropagation()
                  setExpanded(true)
                }}
                className={`pointer-events-auto inline-flex ${compact ? 'p-1.5' : 'p-2'} bg-white rounded-lg shadow-md hover:bg-[var(--sf-bg-page)] transition-colors`}
                title="Expand map"
              >
                <Maximize2 className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-[var(--sf-text-primary)]`} />
              </button>
            )}
            {openInGoogleMapsUrl && (
              <a
                href={openInGoogleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`pointer-events-auto inline-flex ${compact ? 'p-1.5' : 'p-2'} bg-white rounded-lg shadow-md hover:bg-[var(--sf-bg-page)] transition-colors`}
                title="Open in Google Maps"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 3L21 3M21 3V9M21 3L13 11M10 5H7C4.79086 5 3 6.79086 3 9V17C3 19.2091 4.79086 21 7 21H15C17.2091 21 19 19.2091 19 17V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Detail strip below the map */}
      {showDetails && details && (
        <div className="p-4 border-t border-[var(--sf-border-light)]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--sf-blue-500)]">{details.radius}</div>
              <div className="text-sm text-[var(--sf-text-secondary)]">Mile Radius</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{details.teamMembers}</div>
              <div className="text-sm text-[var(--sf-text-secondary)]">Team Members</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{details.pricingMultiplier}x</div>
              <div className="text-sm text-[var(--sf-text-secondary)]">Pricing Multiplier</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{zipCodes.length}</div>
              <div className="text-sm text-[var(--sf-text-secondary)]">ZIP Codes</div>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged view — portaled to document.body so backdrop clicks
          can't bubble back into the map card's DOM and re-trigger
          anything. `enlargeable={false}` on the nested map prevents
          recursion. */}
      {expanded && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4"
          onMouseDown={(e) => {
            // Only close if the actual mousedown is on the backdrop
            // itself, not on a descendant (which would mean the drag
            // started inside the map and released on the backdrop).
            if (e.target !== e.currentTarget) return
            tmLog('BACKDROP mousedown → close', { inst: instanceIdRef.current })
            e.stopPropagation()
            setExpanded(false)
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
            style={{ height: '85vh' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--sf-border-light)]">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[var(--sf-blue-500)]" />
                <h3 className="text-lg font-semibold text-[var(--sf-text-primary)]">
                  {details.name}
                  <span className="ml-2 text-sm font-normal text-[var(--sf-text-secondary)]">
                    {zipCodes.length > 0
                      ? `${zipCodes.length} ZIP${zipCodes.length === 1 ? '' : 's'}`
                      : `${details.radius} mi radius`}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  tmLog('CLOSE-X clicked', { inst: instanceIdRef.current })
                  e.stopPropagation()
                  setExpanded(false)
                }}
                className="text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <TerritoryMap
                territory={territory}
                height="100%"
                showDetails={false}
                compact={false}
                enlargeable={false}
                className="h-full rounded-none border-0"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function formatTerritoryDetails(territory) {
  if (!territory) return null
  return {
    name: territory.name || 'Unnamed Territory',
    location: territory.location || 'No location specified',
    radius: territory.radius_miles || 25,
    teamMembers: Array.isArray(territory.team_members) ? territory.team_members.length : 0,
    pricingMultiplier: territory.pricing_multiplier || 1.0,
    status: territory.status || 'active',
    zipCodes: (Array.isArray(territory.zip_codes) ? territory.zip_codes : [])
      .map(z => String(z || '').trim())
      .filter(z => /^\d{5}$/.test(z)),
  }
}

// Walk raw GeoJSON coordinates so we can build a LatLngBounds without
// materializing Data.Feature objects (which forces us into the async
// forEach loop). Handles Polygon and MultiPolygon.
function extendBoundsFromGeoJson(bounds, fc) {
  const g = window.google
  for (const feature of fc.features || []) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates || []) {
        for (const [lng, lat] of ring) bounds.extend(new g.maps.LatLng(lat, lng))
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates || []) {
        for (const ring of poly) {
          for (const [lng, lat] of ring) bounds.extend(new g.maps.LatLng(lat, lng))
        }
      }
    }
  }
}

export default TerritoryMap
