"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { territoriesAPI } from "../services/api"
import { GOOGLE_MAPS_API_KEY, getGoogleMapsApiKey } from "../config/maps"
import { loadGoogleMapsScript } from "../utils/googleMaps"
import { getAllZipBoundaries } from "../utils/zipBoundaries"

// Interactive ZIP-boundary map embedded in the Edit Territory modal.
//
// Renders three visual buckets:
//   - THIS  (purple, filled)    → currently in `zipCodes`
//   - OTHER (orange, dashed)    → claimed by another active territory
//   - FREE  (gray, thin outline) → unassigned FL ZIP, only shown when
//                                  `showUnassigned` toggle is on
//
// Owns no ZIP state — the caller controls `zipCodes`. When the operator
// clicks a polygon:
//   - THIS  → onToggleZip(zip) so the caller removes it
//   - FREE  → onToggleZip(zip) so the caller adds it
//   - OTHER → confirm dialog first, then onToggleZip(zip) with a hint
//             that the caller should also treat this as reassignment
//             (the caller may just add locally; actual removal from the
//             other territory happens at that territory's next save).
//
// Loads ownership context (all active territories except this one) once
// per open so the OTHER coloring is accurate.

const COLOR_THIS_FILL = "#8B5CF6"
const COLOR_THIS_STROKE = "#7C3AED"
const COLOR_OTHER_FILL = "#F97316"
const COLOR_OTHER_STROKE = "#EA580C"
const COLOR_FREE_FILL = "#94A3B8"
const COLOR_FREE_STROKE = "#64748B"

const ZipEditorMap = ({
  userId,
  territoryId,        // number | null (null means new territory)
  zipCodes = [],       // string[]
  onToggleZip,         // (zip: string) => void
  location = "",
  height = 350,
}) => {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const featuresRef = useRef([])       // features currently on the data layer
  const allFcRef = useRef(null)         // full ZCTA FeatureCollection cache
  const zipCodesRef = useRef(zipCodes)  // latest zipCodes for click closure
  const otherOwnersRef = useRef(new Map())  // zip → territoryName (for confirms)

  const [status, setStatus] = useState("loading")
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [otherTerritories, setOtherTerritories] = useState([])

  zipCodesRef.current = zipCodes

  // Ownership context — every ZIP claimed by a DIFFERENT active
  // territory, so we can color it orange and warn on reassignment.
  const otherOwnersByZip = useMemo(() => {
    const map = new Map()
    for (const t of otherTerritories) {
      if (t.id === territoryId) continue
      const zips = Array.isArray(t.zip_codes) ? t.zip_codes : []
      for (const raw of zips) {
        const z = String(raw || "").trim()
        if (!/^\d{5}$/.test(z)) continue
        map.set(z, t.name || `#${t.id}`)
      }
    }
    return map
  }, [otherTerritories, territoryId])

  otherOwnersRef.current = otherOwnersByZip

  // Load other territories once
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const resp = await territoriesAPI.getAll(userId, { status: "active", page: 1, limit: 500 })
        if (cancelled) return
        setOtherTerritories(resp.territories || resp || [])
      } catch (err) {
        console.warn("[ZipEditorMap] could not load other territories", err)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

  // Init map once
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

      // Click handler kept as a stable function; feature.zip is read
      // fresh each call and zipCodesRef.current has the latest value.
      map.data.addListener("click", (evt) => {
        const zip = evt.feature.getProperty("zip")
        if (!zip) return
        const current = new Set(zipCodesRef.current)
        if (current.has(zip)) {
          onToggleZipRef.current(zip)
          return
        }
        const otherOwner = otherOwnersRef.current.get(zip)
        if (otherOwner) {
          const ok = window.confirm(
            `ZIP ${zip} is currently in "${otherOwner}". Add it to this territory anyway?`
          )
          if (!ok) return
        }
        onToggleZipRef.current(zip)
      })

      allFcRef.current = await getAllZipBoundaries()
      if (cancelled) return
      setStatus("ready")
    }).catch((err) => {
      console.error("[ZipEditorMap] init failed", err)
      if (!cancelled) setStatus("error")
    })

    return () => { cancelled = true }
  }, [])

  // Stable ref for click handler
  const onToggleZipRef = useRef(onToggleZip)
  onToggleZipRef.current = onToggleZip

  // Re-render polygons whenever the visible set changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready" || !allFcRef.current) return

    // Clear previous features
    for (const f of featuresRef.current) {
      try { map.data.remove(f) } catch { /* ignore */ }
    }
    featuresRef.current = []

    const thisSet = new Set(zipCodes)
    const otherSet = otherOwnersByZip  // Map<zip, name>

    const featuresToAdd = []
    for (const feature of allFcRef.current.features) {
      const zip = feature.properties?.ZCTA5CE10
      if (!zip) continue
      const inThis = thisSet.has(zip)
      const inOther = otherSet.has(zip)
      if (!inThis && !inOther && !showUnassigned) continue
      featuresToAdd.push({
        type: "Feature",
        properties: { zip, bucket: inThis ? "this" : inOther ? "other" : "free" },
        geometry: feature.geometry,
      })
    }
    const added = map.data.addGeoJson({ type: "FeatureCollection", features: featuresToAdd })
    featuresRef.current = added

    // Fit bounds to THIS territory's polygons. Fall back to OTHER
    // context if no THIS polygons yet (so a brand-new territory zooms
    // to the operator's existing service area instead of the whole state).
    const bounds = new window.google.maps.LatLngBounds()
    let anchor = "this"
    for (const f of added) {
      if (f.getProperty("bucket") === "this") {
        f.getGeometry().forEachLatLng((ll) => bounds.extend(ll))
      }
    }
    if (bounds.isEmpty()) {
      anchor = "other"
      for (const f of added) {
        if (f.getProperty("bucket") === "other") {
          f.getGeometry().forEachLatLng((ll) => bounds.extend(ll))
        }
      }
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 40)
  }, [zipCodes.join(","), otherOwnersByZip, showUnassigned, status])

  // Re-set style function so it re-reads the latest zipCodes / owners.
  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== "ready") return
    map.data.setStyle(styleForFeature)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipCodes.join(","), otherOwnersByZip, status])

  function styleForFeature(feature) {
    const bucket = feature.getProperty("bucket")
    if (bucket === "this") {
      return {
        fillColor: COLOR_THIS_FILL,
        fillOpacity: 0.5,
        strokeColor: COLOR_THIS_STROKE,
        strokeWeight: 2,
        clickable: true,
      }
    }
    if (bucket === "other") {
      return {
        fillColor: COLOR_OTHER_FILL,
        fillOpacity: 0.25,
        strokeColor: COLOR_OTHER_STROKE,
        strokeWeight: 1.5,
        strokeOpacity: 0.9,
        clickable: true,
      }
    }
    // free / unassigned
    return {
      fillColor: COLOR_FREE_FILL,
      fillOpacity: 0.12,
      strokeColor: COLOR_FREE_STROKE,
      strokeWeight: 1,
      strokeOpacity: 0.5,
      clickable: true,
    }
  }

  return (
    <div className="border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
      {/* Legend + toggle bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--sf-bg-page)] border-b border-[var(--sf-border-light)]">
        <div className="flex items-center gap-4 text-xs text-[var(--sf-text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_THIS_FILL, opacity: 0.6 }} />
            This territory
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOR_OTHER_FILL, opacity: 0.5 }} />
            Other territories
          </span>
          {showUnassigned && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border" style={{ backgroundColor: COLOR_FREE_FILL, opacity: 0.3 }} />
              Unassigned
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowUnassigned((v) => !v)}
          className="text-xs px-2 py-1 border border-[var(--sf-border-light)] rounded-md bg-white flex items-center gap-1 hover:bg-[var(--sf-bg-page)]"
        >
          {showUnassigned ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showUnassigned ? "Hide unassigned" : "Show unassigned"}
        </button>
      </div>

      {/* Map */}
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

      {/* Hint footer */}
      <div className="px-3 py-2 text-xs text-[var(--sf-text-muted)] bg-[var(--sf-bg-page)] border-t border-[var(--sf-border-light)]">
        Click a purple polygon to remove it. {showUnassigned ? "Click a gray polygon to add." : "Enable \"Show unassigned\" to add new ZIPs."} Orange polygons belong to other territories.
      </div>
    </div>
  )
}

export default ZipEditorMap
