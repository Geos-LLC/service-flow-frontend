"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { territoriesAPI } from "../services/api"
import { GOOGLE_MAPS_API_KEY, getGoogleMapsApiKey } from "../config/maps"
import { loadGoogleMapsScript } from "../utils/googleMaps"
import { getAllZipBoundaries } from "../utils/zipBoundaries"

// ZIP Coverage map for the Team Member details page.
//
// Semantics:
//   - COVERED  (green, filled)         → ZIP is in one of the member's
//                                        assigned territories AND NOT in
//                                        their exclusion list.
//   - EXCLUDED (red, red stroke)       → ZIP is in a territory the member
//                                        is on, but they've opted out of
//                                        (present in zipExclusions).
//   - OUT      (gray, no interaction)  → ZIP is on some other territory
//                                        the member is not assigned to.
//                                        Kept in view for context; not
//                                        clickable so the member can't
//                                        "exclude" a ZIP they never
//                                        covered anyway.
//
// Click behavior:
//   - COVERED → onToggleExclusion(zip)  → caller adds to exclusions
//   - EXCLUDED → onToggleExclusion(zip) → caller removes from exclusions
//   - OUT     → ignored
//
// Owns no ZIP state — the caller controls both the assigned territories
// (via `territoryIds`) and the exclusions (via `zipExclusions`). This
// component only renders + surfaces click intent.

const COLOR_COVERED_FILL = "#10B981"    // emerald-500
const COLOR_COVERED_STROKE = "#059669"  // emerald-600
const COLOR_EXCLUDED_FILL = "#EF4444"   // red-500
const COLOR_EXCLUDED_STROKE = "#B91C1C" // red-700
const COLOR_OUT_FILL = "#CBD5E1"        // slate-300
const COLOR_OUT_STROKE = "#94A3B8"      // slate-400

const ZipCoverageMap = ({
  userId,
  territoryIds = [],       // number[] — the member's assigned territories
  zipExclusions = [],       // string[]
  onToggleExclusion,        // (zip: string) => void
  memberAddress = null,     // free-form address string; geocoded to drop a home marker
  memberName = "",          // shown in the marker infowindow
  height = 380,
  showOutOfScope = true,    // show sibling territories in gray for context
}) => {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const featuresRef = useRef([])
  const allFcRef = useRef(null)
  const didInitialFitRef = useRef(false)
  const homeMarkerRef = useRef(null)

  const zipExclusionsRef = useRef(zipExclusions)
  const coveredByAssignedRef = useRef(new Set())
  zipExclusionsRef.current = zipExclusions

  const [status, setStatus] = useState("loading")
  const [territories, setTerritories] = useState([])

  // Fetch all active territories once so we can compute coverage from
  // territoryIds and know what's "out of scope" for this member.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await territoriesAPI.getAll(userId, { status: "active", page: 1, limit: 500 })
        if (cancelled) return
        setTerritories(resp.territories || resp || [])
      } catch (err) {
        console.warn("[ZipCoverageMap] load territories failed", err)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  // Split all ZIPs into three buckets keyed off `territoryIds`.
  const buckets = useMemo(() => {
    const assignedSet = new Set((territoryIds || []).map(Number))
    const coveredByAssigned = new Set()
    const claimedByOthers = new Set()
    for (const t of territories) {
      const zips = (Array.isArray(t.zip_codes) ? t.zip_codes : [])
        .map((z) => String(z || "").trim())
        .filter((z) => /^\d{5}$/.test(z))
      if (assignedSet.has(Number(t.id))) {
        for (const z of zips) coveredByAssigned.add(z)
      } else {
        for (const z of zips) claimedByOthers.add(z)
      }
    }
    return { coveredByAssigned, claimedByOthers }
  }, [territories, territoryIds])

  coveredByAssignedRef.current = buckets.coveredByAssigned

  // Init map + attach click handler once
  useEffect(() => {
    const key = getGoogleMapsApiKey() || GOOGLE_MAPS_API_KEY
    if (!key || !mapDivRef.current) { setStatus("error"); return }
    let cancelled = false

    loadGoogleMapsScript(key).then(async () => {
      if (cancelled || !mapDivRef.current) return
      const map = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 27.994402, lng: -81.760254 },
        zoom: 7,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      })
      mapRef.current = map
      map.data.setStyle(styleForFeature)
      map.data.addListener("click", (evt) => {
        const zip = evt.feature.getProperty("zip")
        const bucket = evt.feature.getProperty("bucket")
        if (!zip || bucket === "out") return
        onToggleExclusionRef.current(zip)
      })

      allFcRef.current = await getAllZipBoundaries()
      if (cancelled) return
      setStatus("ready")
    }).catch((err) => {
      console.error("[ZipCoverageMap] init failed", err)
      if (!cancelled) setStatus("error")
    })

    return () => { cancelled = true }
  }, [])

  const onToggleExclusionRef = useRef(onToggleExclusion)
  onToggleExclusionRef.current = onToggleExclusion

  // Re-render polygons when buckets/exclusions/toggle changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready" || !allFcRef.current) return

    for (const f of featuresRef.current) {
      try { map.data.remove(f) } catch { /* ignore */ }
    }
    featuresRef.current = []

    const exclSet = new Set(zipExclusions)
    const featuresToAdd = []
    for (const feature of allFcRef.current.features) {
      const zip = feature.properties?.ZCTA5CE10
      if (!zip) continue
      const isCovered = buckets.coveredByAssigned.has(zip)
      const isExcluded = isCovered && exclSet.has(zip)
      const isOut = !isCovered && buckets.claimedByOthers.has(zip)

      if (isExcluded) {
        featuresToAdd.push({ type: "Feature", properties: { zip, bucket: "excluded" }, geometry: feature.geometry })
      } else if (isCovered) {
        featuresToAdd.push({ type: "Feature", properties: { zip, bucket: "covered" }, geometry: feature.geometry })
      } else if (isOut && showOutOfScope) {
        featuresToAdd.push({ type: "Feature", properties: { zip, bucket: "out" }, geometry: feature.geometry })
      }
    }
    const added = map.data.addGeoJson({ type: "FeatureCollection", features: featuresToAdd })
    featuresRef.current = added

    // Fit-bounds only on first render — subsequent exclusion toggles
    // shouldn't reset the operator's zoom.
    if (didInitialFitRef.current) return
    const bounds = new window.google.maps.LatLngBounds()
    for (const f of added) {
      const bucket = f.getProperty("bucket")
      if (bucket === "covered" || bucket === "excluded") {
        f.getGeometry().forEachLatLng((ll) => bounds.extend(ll))
      }
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 40)
      didInitialFitRef.current = true
    }
  }, [buckets, zipExclusions.join(","), showOutOfScope, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return
    map.data.setStyle(styleForFeature)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Geocode the team member's address and drop a home marker.
  // Rerun whenever the address changes; the marker doesn't move the
  // viewport (fit-bounds already handled it), so it just anchors the
  // operator visually while they toggle ZIPs around it.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return
    // Tear down any previous marker before rerendering.
    if (homeMarkerRef.current) {
      try { homeMarkerRef.current.setMap(null) } catch { /* ignore */ }
      homeMarkerRef.current = null
    }
    if (!memberAddress || !window.google?.maps?.Geocoder) return
    let cancelled = false
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ address: memberAddress }, (results, statusCode) => {
      if (cancelled) return
      if (statusCode !== "OK" || !results?.[0]) return
      const position = results[0].geometry.location
      const marker = new window.google.maps.Marker({
        map,
        position,
        title: memberName ? `${memberName} — home` : "Team member home",
        // Distinctive dark-blue drop pin so it stands out over the
        // green/red polygon fills; no label to keep it uncluttered.
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#1E3A8A",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 3,
        },
        zIndex: 1000,
      })
      const info = new window.google.maps.InfoWindow({
        content: `<div style="font-family: Montserrat, sans-serif; font-size: 12px;">
          <strong>${memberName || "Home"}</strong><br/>
          <span style="color:#64748B">${memberAddress}</span>
        </div>`,
      })
      marker.addListener("click", () => info.open({ anchor: marker, map }))
      homeMarkerRef.current = marker
    })
    return () => { cancelled = true }
  }, [memberAddress, memberName, status])

  function styleForFeature(feature) {
    const bucket = feature.getProperty("bucket")
    if (bucket === "excluded") {
      return {
        fillColor: COLOR_EXCLUDED_FILL,
        fillOpacity: 0.35,
        strokeColor: COLOR_EXCLUDED_STROKE,
        strokeWeight: 2.5,
        clickable: true,
      }
    }
    if (bucket === "covered") {
      return {
        fillColor: COLOR_COVERED_FILL,
        fillOpacity: 0.4,
        strokeColor: COLOR_COVERED_STROKE,
        strokeWeight: 2,
        clickable: true,
      }
    }
    // out
    return {
      fillColor: COLOR_OUT_FILL,
      fillOpacity: 0.15,
      strokeColor: COLOR_OUT_STROKE,
      strokeWeight: 1,
      strokeOpacity: 0.5,
      clickable: false,
    }
  }

  return (
    <div className="border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
      <div className="flex items-center gap-4 px-3 py-2 bg-[var(--sf-bg-page)] border-b border-[var(--sf-border-light)] text-xs text-[var(--sf-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_COVERED_FILL, opacity: 0.6 }} />
          Covered ({buckets.coveredByAssigned.size - zipExclusions.filter((z) => buckets.coveredByAssigned.has(z)).length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_EXCLUDED_FILL, opacity: 0.6 }} />
          Excluded ({zipExclusions.filter((z) => buckets.coveredByAssigned.has(z)).length})
        </span>
        {showOutOfScope && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_OUT_FILL, opacity: 0.5 }} />
            Other territories (view-only)
          </span>
        )}
      </div>
      <div className="relative" style={{ height }}>
        <div ref={mapDivRef} className="absolute inset-0" />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 pointer-events-none">
            {status === "error" ? (
              <p className="text-sm text-[var(--sf-text-muted)]">Map failed to load.</p>
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-[var(--sf-blue-500)]" />
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2 text-xs text-[var(--sf-text-muted)] bg-[var(--sf-bg-page)] border-t border-[var(--sf-border-light)]">
        Click a green ZIP to exclude this member from it. Click a red one to un-exclude. Gray ZIPs belong to territories this member isn't assigned to.
      </div>
    </div>
  )
}

export default ZipCoverageMap
