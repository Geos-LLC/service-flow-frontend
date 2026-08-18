"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Car } from "lucide-react"
import { GOOGLE_MAPS_API_KEY, getGoogleMapsApiKey } from "../config/maps"
import { loadGoogleMapsScript } from "../utils/googleMaps"

// Job route map — replaces the iframe embed on Job Details with a real
// Google Maps JS instance that also renders driving directions from
// each assigned cleaner's home to the job.
//
// Uses DirectionsService (requires the Directions API to be enabled on
// the same Google Cloud project as the Maps JS key). One route per
// assignee, colored distinctly. Max two cleaners is expected — the
// palette + label list is sized accordingly.

const ROUTE_COLORS = ["#7C3AED", "#059669", "#DC2626"]  // purple, emerald, red (fallback)
const JOB_PIN_COLOR = "#EF4444"

const JobRouteMap = ({
  jobAddress,          // full address string of the service location
  assignees = [],       // [{ id, name }]
  teamMembers = [],     // full list — used to look up home addresses
  height = 320,
}) => {
  const mapDivRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const jobMarkerRef = useRef(null)
  const homeMarkersRef = useRef([])
  const routesRef = useRef([])          // DirectionsRenderer instances
  const jobPosRef = useRef(null)

  const [status, setStatus] = useState("loading")
  const [routeInfo, setRouteInfo] = useState([])  // [{id, name, color, duration, distance}]

  // Resolve each assignee to a full team member record with an address.
  const homes = useMemo(() => {
    const out = []
    assignees.forEach((a, i) => {
      const member = teamMembers.find(
        (m) => m.id === a.id || String(m.id) === String(a.id)
      )
      if (!member) return
      const address = [member.location, member.city, member.state, member.zip_code]
        .filter(Boolean)
        .join(", ")
      if (!address) return
      out.push({
        id: a.id,
        name: a.name || `${member.first_name || ""} ${member.last_name || ""}`.trim() || `#${a.id}`,
        address,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      })
    })
    return out
  }, [assignees, teamMembers])

  // Init map + place job pin + all routes.
  useEffect(() => {
    const key = getGoogleMapsApiKey() || GOOGLE_MAPS_API_KEY
    if (!key || !mapDivRef.current) { setStatus("error"); return }
    if (!jobAddress) return

    let cancelled = false
    setStatus("loading")

    loadGoogleMapsScript(key).then(async () => {
      if (cancelled || !mapDivRef.current) return
      const map = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 27.994402, lng: -81.760254 },
        zoom: 11,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      })
      mapInstanceRef.current = map

      // 1. Geocode the job address and drop the primary marker.
      const geocoder = new window.google.maps.Geocoder()
      const { results: jobResults, status: jobStatus } = await new Promise((resolve) =>
        geocoder.geocode({ address: jobAddress }, (results, status) => resolve({ results, status }))
      )
      if (cancelled) return
      if (jobStatus !== "OK" || !jobResults?.[0]) {
        setStatus("error")
        return
      }
      const jobPos = jobResults[0].geometry.location
      jobPosRef.current = jobPos
      jobMarkerRef.current = new window.google.maps.Marker({
        map,
        position: jobPos,
        title: jobAddress,
        icon: {
          path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: JOB_PIN_COLOR,
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
        },
        zIndex: 900,
      })

      // 2. For each assignee's home: geocode, drop home marker, request
      //    directions, and draw the route with the assignee's color.
      const infoRows = []
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(jobPos)

      const directionsService = new window.google.maps.DirectionsService()

      for (const home of homes) {
        const { results: hResults, status: hStatus } = await new Promise((resolve) =>
          geocoder.geocode({ address: home.address }, (results, status) => resolve({ results, status }))
        )
        if (cancelled) return
        if (hStatus !== "OK" || !hResults?.[0]) continue
        const homePos = hResults[0].geometry.location

        // Home marker — colored per assignee, matches the route color.
        const marker = new window.google.maps.Marker({
          map,
          position: homePos,
          title: `${home.name} — home`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: home.color,
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 2.5,
          },
          zIndex: 700,
        })
        homeMarkersRef.current.push(marker)
        bounds.extend(homePos)

        // Draw the route.
        const { result, status: routeStatus } = await new Promise((resolve) =>
          directionsService.route(
            {
              origin: homePos,
              destination: jobPos,
              travelMode: window.google.maps.TravelMode.DRIVING,
            },
            (result, status) => resolve({ result, status })
          )
        )
        if (cancelled) return
        if (routeStatus === "OK" && result?.routes?.[0]) {
          const renderer = new window.google.maps.DirectionsRenderer({
            map,
            directions: result,
            suppressMarkers: true,  // keep our own custom markers
            polylineOptions: {
              strokeColor: home.color,
              strokeWeight: 5,
              strokeOpacity: 0.8,
            },
          })
          routesRef.current.push(renderer)

          const leg = result.routes[0].legs[0]
          infoRows.push({
            id: home.id,
            name: home.name,
            color: home.color,
            duration: leg?.duration?.text || "?",
            distance: leg?.distance?.text || "?",
          })
        } else {
          // Still surface the assignee with a note that no route was found.
          infoRows.push({
            id: home.id,
            name: home.name,
            color: home.color,
            duration: null,
            distance: null,
          })
        }
      }

      if (!cancelled) {
        map.fitBounds(bounds, 60)
        setRouteInfo(infoRows)
        setStatus("ready")
      }
    }).catch((err) => {
      console.error("[JobRouteMap] init failed", err)
      if (!cancelled) setStatus("error")
    })

    return () => {
      cancelled = true
      if (jobMarkerRef.current) { try { jobMarkerRef.current.setMap(null) } catch { /* ignore */ } jobMarkerRef.current = null }
      homeMarkersRef.current.forEach(m => { try { m.setMap(null) } catch { /* ignore */ } })
      homeMarkersRef.current = []
      routesRef.current.forEach(r => { try { r.setMap(null) } catch { /* ignore */ } })
      routesRef.current = []
    }
  }, [jobAddress, homes.map(h => `${h.id}:${h.address}`).join("|")])

  return (
    <div>
      <div className="relative" style={{ height }}>
        <div ref={mapDivRef} className="w-full h-full" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-60 pointer-events-none">
            {status === "error" ? (
              <p className="text-sm text-[var(--sf-text-muted)]">Map failed to load.</p>
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
            )}
          </div>
        )}
      </div>
      {routeInfo.length > 0 && (
        <div className="px-4 py-3 border-t border-[var(--sf-border-light)] bg-[var(--sf-bg-page)]">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {routeInfo.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="font-medium text-[var(--sf-text-primary)]">{r.name}</span>
                {r.duration ? (
                  <span className="flex items-center gap-1 text-[var(--sf-text-secondary)]">
                    <Car className="w-3 h-3" />
                    {r.duration} · {r.distance}
                  </span>
                ) : (
                  <span className="text-[var(--sf-text-muted)]">route unavailable</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default JobRouteMap
