"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import Sidebar from "../components/sidebar"
import MobileHeader from "../components/mobile-header"
import {
  ArrowLeft,
  Save,
  Search,
  X,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { territoriesAPI } from "../services/api"
import { GOOGLE_MAPS_API_KEY, getGoogleMapsApiKey } from "../config/maps"
import { loadGoogleMapsScript } from "../utils/googleMaps"
import { getAllZipBoundaries } from "../utils/zipBoundaries"

// Palette used to color each territory. Cycled by index; if a tenant
// has more territories than colors, that's fine — collisions read as
// "these two are close enough visually," and the sidebar disambiguates.
const PALETTE = [
  "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EC4899",
  "#14B8A6", "#F97316", "#6366F1", "#84CC16", "#06B6D4",
]
const OVERLAP_COLOR = "#DC2626"       // red-600
const UNASSIGNED_COLOR = "#94A3B8"    // slate-400

function colorFor(index) {
  return PALETTE[index % PALETTE.length]
}

function normalizeZipsFromTerritory(territory) {
  return (Array.isArray(territory?.zip_codes) ? territory.zip_codes : [])
    .map((z) => String(z || "").trim().replace(/-.*$/, ""))
    .filter((z) => /^\d{5}$/.test(z))
}

const ZipManager = () => {
  const { user, authLoading } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [territories, setTerritories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  // Assignment state: Map<territoryId, Set<zip>>
  // Kept as a plain object with Sets so React re-renders on identity swap.
  const [assignments, setAssignments] = useState({})
  const initialAssignmentsRef = useRef({})

  const [selectedTerritoryId, setSelectedTerritoryId] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [showUnassigned, setShowUnassigned] = useState(false)

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const dataLayerFeatures = useRef([])  // features added so we can clear on redraw
  const zipToFeature = useRef(new Map())  // zip → Data.Feature for style refresh
  const allFeaturesRef = useRef(null)  // full ZCTA FeatureCollection cache
  const [mapStatus, setMapStatus] = useState("loading")

  // Load territories
  useEffect(() => {
    if (authLoading) return
    if (!user?.id) { window.location.href = "/signin"; return }
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const resp = await territoriesAPI.getAll(user.id, { status: "active", page: 1, limit: 500 })
        if (cancelled) return
        const list = resp.territories || resp || []
        setTerritories(list)

        const initial = {}
        for (const t of list) initial[t.id] = new Set(normalizeZipsFromTerritory(t))
        setAssignments(initial)
        initialAssignmentsRef.current = Object.fromEntries(
          Object.entries(initial).map(([id, s]) => [id, new Set(s)])
        )

        if (!selectedTerritoryId && list.length > 0) setSelectedTerritoryId(list[0].id)
      } catch (err) {
        console.error("[ZipManager] load failed", err)
        setError("Failed to load territories.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id])

  // Derived: ZIP → owning territory IDs (used for color + overlap detection)
  const zipOwnership = useMemo(() => {
    const owners = new Map()  // zip → number[] (territory ids)
    for (const [tid, zips] of Object.entries(assignments)) {
      for (const zip of zips) {
        if (!owners.has(zip)) owners.set(zip, [])
        owners.get(zip).push(Number(tid))
      }
    }
    return owners
  }, [assignments])

  const overlapZips = useMemo(() => {
    const out = []
    for (const [zip, owners] of zipOwnership) if (owners.length > 1) out.push(zip)
    return out
  }, [zipOwnership])

  // Color per-territory: stable index in the sorted-by-id list.
  const territoryColors = useMemo(() => {
    const out = {}
    territories.forEach((t, i) => { out[t.id] = colorFor(i) })
    return out
  }, [territories])

  // Pending-change detection (used to enable Save and show a badge).
  const pendingCount = useMemo(() => {
    let n = 0
    const initial = initialAssignmentsRef.current
    const ids = new Set([...Object.keys(assignments), ...Object.keys(initial)])
    for (const id of ids) {
      const a = assignments[id] || new Set()
      const b = initial[id] || new Set()
      if (a.size !== b.size) { n += 1; continue }
      for (const z of a) if (!b.has(z)) { n += 1; break }
    }
    return n
  }, [assignments])

  // Initialize the Google Map once
  useEffect(() => {
    if (loading) return
    const key = getGoogleMapsApiKey() || GOOGLE_MAPS_API_KEY
    if (!key) { setMapStatus("error"); return }

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

      // Load ZCTA once, but don't add features yet — the effect below adds
      // and re-styles them based on `assignments`.
      const fc = await getAllZipBoundaries()

      map.data.setStyle((feature) => styleForFeature(feature))
      map.data.addListener("click", (evt) => {
        const zip = evt.feature.getProperty("zip")
        if (zip) toggleZipRef.current(zip)
      })

      // Preload features but keep visibility off for unassigned — we
      // control display by adding/removing from data layer to keep the
      // performance profile reasonable (drawing 900+ polygons is heavy).
      // We do NOT add all here; we add per-effect based on assignments +
      // showUnassigned toggle.
      allFeaturesRef.current = fc
      setMapStatus("ready")
    }).catch((err) => {
      console.error("[ZipManager] map init failed", err)
      setMapStatus("error")
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Redraw the data layer whenever assignments or the unassigned toggle changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== "ready" || !allFeaturesRef.current) return

    // Clear previous features
    for (const f of dataLayerFeatures.current) {
      try { map.data.remove(f) } catch { /* ignore */ }
    }
    dataLayerFeatures.current = []
    zipToFeature.current.clear()

    // Determine visible ZIP set: everything assigned to any territory,
    // plus (optionally) all Florida ZIPs if the operator wants to see
    // what's available.
    const visibleZips = new Set()
    for (const zips of Object.values(assignments)) for (const z of zips) visibleZips.add(z)

    const featuresToAdd = []
    for (const feature of allFeaturesRef.current.features) {
      const zip = feature.properties?.ZCTA5CE10
      if (!zip) continue
      const isAssigned = visibleZips.has(zip)
      if (!isAssigned && !showUnassigned) continue
      // Clone with a stable `zip` property so click handlers don't rely
      // on ZCTA5CE10 knowledge.
      featuresToAdd.push({
        type: "Feature",
        properties: { zip, assigned: isAssigned },
        geometry: feature.geometry,
      })
    }

    const added = map.data.addGeoJson({ type: "FeatureCollection", features: featuresToAdd })
    dataLayerFeatures.current = added
    for (const f of added) {
      const z = f.getProperty("zip")
      if (z) zipToFeature.current.set(z, f)
    }

    // Fit bounds to assigned polygons only (unassigned would zoom out
    // to the whole state and lose focus).
    const bounds = new window.google.maps.LatLngBounds()
    for (const f of added) {
      if (!f.getProperty("assigned")) continue
      f.getGeometry().forEachLatLng((ll) => bounds.extend(ll))
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 60)
  }, [assignments, showUnassigned, mapStatus, territories])

  // Style function — closes over the latest zipOwnership + selection.
  // Re-set on each dependency change so Google Maps picks up the new
  // colors without re-adding features.
  useEffect(() => {
    const map = mapRef.current
    if (!map || mapStatus !== "ready") return
    map.data.setStyle((feature) => styleForFeature(feature))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipOwnership, selectedTerritoryId, territoryColors, mapStatus])

  function styleForFeature(feature) {
    const zip = feature.getProperty("zip")
    const owners = zipOwnership.get(zip) || []
    if (owners.length === 0) {
      return {
        fillColor: UNASSIGNED_COLOR,
        fillOpacity: 0.12,
        strokeColor: UNASSIGNED_COLOR,
        strokeWeight: 1,
        strokeOpacity: 0.5,
        clickable: true,
      }
    }
    if (owners.length > 1) {
      return {
        fillColor: OVERLAP_COLOR,
        fillOpacity: 0.45,
        strokeColor: OVERLAP_COLOR,
        strokeWeight: 2.5,
        clickable: true,
      }
    }
    const owner = owners[0]
    const isSelected = owner === selectedTerritoryId
    return {
      fillColor: territoryColors[owner] || PALETTE[0],
      fillOpacity: isSelected ? 0.55 : 0.35,
      strokeColor: territoryColors[owner] || PALETTE[0],
      strokeWeight: isSelected ? 3 : 1.5,
      clickable: true,
    }
  }

  // Click handler kept in a ref so the data-layer listener never
  // captures a stale closure over `selectedTerritoryId` / `assignments`.
  const toggleZipRef = useRef(() => {})
  toggleZipRef.current = (zip) => {
    if (!selectedTerritoryId) {
      setMessage("Pick a territory in the sidebar first, then click ZIPs.")
      return
    }
    const owners = zipOwnership.get(zip) || []
    if (owners.length === 1 && owners[0] === selectedTerritoryId) {
      // Currently in selected territory — remove.
      mutateAssignment(selectedTerritoryId, (s) => { s.delete(zip) })
      return
    }
    if (owners.length === 0) {
      // Unassigned — add to selected.
      mutateAssignment(selectedTerritoryId, (s) => { s.add(zip) })
      return
    }
    // Owned by other(s). Confirm reassignment (removes from all, adds to selected).
    const ownerNames = owners
      .map((id) => territories.find((t) => t.id === id)?.name || `#${id}`)
      .join(", ")
    const ok = window.confirm(
      `ZIP ${zip} is currently in ${ownerNames}. Reassign to ${
        territories.find((t) => t.id === selectedTerritoryId)?.name || "selected territory"
      }?`
    )
    if (!ok) return
    setAssignments((prev) => {
      const next = { ...prev }
      for (const id of owners) {
        next[id] = new Set(prev[id] || [])
        next[id].delete(zip)
      }
      next[selectedTerritoryId] = new Set(prev[selectedTerritoryId] || [])
      next[selectedTerritoryId].add(zip)
      return next
    })
  }

  function mutateAssignment(tid, fn) {
    setAssignments((prev) => {
      const next = { ...prev, [tid]: new Set(prev[tid] || []) }
      fn(next[tid])
      return next
    })
  }

  const removeZipFromCurrent = (zip) => {
    if (!selectedTerritoryId) return
    mutateAssignment(selectedTerritoryId, (s) => { s.delete(zip) })
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true); setError(""); setMessage("")
    try {
      const initial = initialAssignmentsRef.current
      const changed = []
      const ids = new Set([...Object.keys(assignments), ...Object.keys(initial)])
      for (const id of ids) {
        const a = assignments[id] || new Set()
        const b = initial[id] || new Set()
        if (a.size !== b.size) { changed.push(id); continue }
        for (const z of a) if (!b.has(z)) { changed.push(id); break }
      }
      // For each changed territory, load the full record (so we don't
      // clobber unrelated fields via the PUT endpoint's all-fields
      // semantics) and PUT with the new zip_codes.
      let ok = 0, failed = 0
      for (const idStr of changed) {
        const id = Number(idStr)
        try {
          const fullResp = await territoriesAPI.getById(id)
          const t = fullResp.territory || fullResp
          const nextZips = Array.from(assignments[id] || new Set()).sort()
          await territoriesAPI.update(id, {
            userId: user.id,
            name: t.name,
            description: t.description,
            location: t.location,
            zipCodes: nextZips,
            radiusMiles: t.radius_miles || 25,
            timezone: t.timezone || "America/New_York",
            status: t.status || "active",
            businessHours: t.business_hours || {},
            teamMembers: t.team_members || [],
            services: t.services || [],
            pricingMultiplier: t.pricing_multiplier || 1.0,
          })
          ok += 1
        } catch (err) {
          console.error("[ZipManager] failed to save territory", id, err)
          failed += 1
        }
      }
      // Snapshot new baseline so pendingCount goes back to 0.
      initialAssignmentsRef.current = Object.fromEntries(
        Object.entries(assignments).map(([tid, s]) => [tid, new Set(s)])
      )
      if (failed === 0) setMessage(`Saved ${ok} territor${ok === 1 ? "y" : "ies"}.`)
      else setError(`Saved ${ok}; ${failed} failed. See console.`)
    } finally {
      setSaving(false)
    }
  }, [assignments, saving, user?.id])

  // Sidebar sub-lists
  const currentZips = useMemo(() => {
    const set = assignments[selectedTerritoryId] || new Set()
    return Array.from(set).sort()
  }, [assignments, selectedTerritoryId])

  const filteredCurrentZips = useMemo(() => {
    const q = searchTerm.trim()
    if (!q) return currentZips
    return currentZips.filter((z) => z.includes(q))
  }, [currentZips, searchTerm])

  if (loading) {
    return (
      <div className="flex h-screen bg-[var(--sf-bg-page)]">
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--sf-blue-500)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[var(--sf-bg-page)]">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <MobileHeader setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-[var(--sf-border-light)] px-4 md:px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/territories")}
              className="p-2 hover:bg-[var(--sf-bg-page)] rounded-lg"
              title="Back to territories"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--sf-text-primary)]" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[var(--sf-text-primary)]" style={{ fontFamily: "Montserrat", fontWeight: 700 }}>
                Manage ZIP Assignments
              </h1>
              <p className="text-xs text-[var(--sf-text-secondary)]">
                Click a ZIP on the map to assign it to the selected territory.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {message && (
              <span className="text-sm text-green-700 mr-2">{message}</span>
            )}
            {error && (
              <span className="text-sm text-red-700 mr-2">{error}</span>
            )}
            <button
              onClick={() => setShowUnassigned((v) => !v)}
              className="px-3 py-2 border border-[var(--sf-border-light)] rounded-lg text-sm flex items-center gap-2 hover:bg-[var(--sf-bg-page)]"
              title={showUnassigned ? "Hide unassigned ZIPs" : "Show unassigned ZIPs"}
            >
              {showUnassigned ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showUnassigned ? "Hide unassigned" : "Show unassigned"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || pendingCount === 0}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                pendingCount === 0
                  ? "bg-[var(--sf-bg-page)] text-[var(--sf-text-muted)] cursor-not-allowed"
                  : "bg-[var(--sf-blue-500)] text-white hover:bg-[var(--sf-blue-600)]"
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving…" : pendingCount > 0 ? `Save (${pendingCount})` : "Saved"}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 bg-white border-r border-[var(--sf-border-light)] overflow-y-auto p-4 flex flex-col gap-4">
            {/* Territory list */}
            <div>
              <h2 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wider mb-2">
                Territories
              </h2>
              <div className="space-y-1">
                {territories.map((t) => {
                  const count = (assignments[t.id] || new Set()).size
                  const isSel = t.id === selectedTerritoryId
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTerritoryId(t.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        isSel ? "bg-[var(--sf-blue-50)] border border-[var(--sf-blue-500)]" : "hover:bg-[var(--sf-bg-page)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: territoryColors[t.id] }} />
                        <span className="truncate font-medium text-[var(--sf-text-primary)]">{t.name}</span>
                      </div>
                      <span className="text-xs text-[var(--sf-text-secondary)]">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Overlaps */}
            {overlapZips.length > 0 && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">{overlapZips.length} overlap{overlapZips.length === 1 ? "" : "s"}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {overlapZips.slice(0, 20).map((z) => (
                    <span key={z} className="inline-flex items-center px-2 py-0.5 bg-white border border-red-300 text-red-800 rounded text-xs">
                      {z}
                    </span>
                  ))}
                  {overlapZips.length > 20 && (
                    <span className="text-xs text-red-800 self-center">+{overlapZips.length - 20} more</span>
                  )}
                </div>
              </div>
            )}

            {/* Current territory's ZIPs */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase tracking-wider">
                  ZIPs in {territories.find((t) => t.id === selectedTerritoryId)?.name || "—"}
                </h2>
                <span className="text-xs text-[var(--sf-text-secondary)]">{currentZips.length}</span>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sf-text-muted)]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter ZIPs…"
                  className="w-full pl-8 pr-2 py-1.5 border border-[var(--sf-border-light)] rounded-lg text-sm"
                />
              </div>
              <div className="overflow-y-auto flex-1 -mx-2 px-2">
                {filteredCurrentZips.length === 0 ? (
                  <p className="text-xs text-[var(--sf-text-muted)] italic px-2 py-1">
                    {currentZips.length === 0 ? "No ZIPs — click polygons on the map." : "No matches."}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {filteredCurrentZips.map((zip) => (
                      <span
                        key={zip}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--sf-blue-50)] border border-[var(--sf-blue-500)] text-[var(--sf-blue-500)] rounded text-xs"
                      >
                        {zip}
                        <button
                          onClick={() => removeZipFromCurrent(zip)}
                          className="hover:text-red-600"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            <div ref={mapDivRef} className="absolute inset-0" />
            {mapStatus !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--sf-bg-page)]">
                {mapStatus === "error" ? (
                  <p className="text-sm text-[var(--sf-text-muted)]">Map failed to load.</p>
                ) : (
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--sf-blue-500)]" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZipManager
