"use client"
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"
import { useAuth } from "./AuthContext"
import { territoriesAPI } from "../services/api"
import { normalizeAPIResponse } from "../utils/dataHandler"

/**
 * Scopes data shown across the app to a single location ("territory"
 * in the existing schema). Selection persists to localStorage so it
 * survives reloads. `'all'` (the default) means no filtering.
 *
 * Companion to the multi-location handoff addon. Backend `locationId`
 * params on list endpoints are out of scope for this wave — pages
 * receive the active location id and filter results client-side for
 * now.
 */

const STORAGE_KEY = "serviceflow.location"

const LocationContext = createContext({
  locationId: "all",
  setLocationId: () => {},
  locations: [],
  loading: false,
  selectedLocation: null,
})

const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || "all"
  } catch {
    return "all"
  }
}

export const LocationProvider = ({ children }) => {
  const { user } = useAuth()
  const [locationId, setLocationIdRaw] = useState(readStored)
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(false)

  const setLocationId = useCallback((id) => {
    setLocationIdRaw(id || "all")
    try {
      localStorage.setItem(STORAGE_KEY, id || "all")
    } catch {
      /* storage may be unavailable in some embeds */
    }
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setLocations([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const resp = await territoriesAPI.getAll(user.id, { page: 1, limit: 200 })
        const list = normalizeAPIResponse(resp, "territories")
        if (!cancelled) setLocations(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setLocations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Validate stored location id still exists in the list — if a user
  // had a location selected that has since been deleted, fall back to all.
  useEffect(() => {
    if (locationId === "all") return
    if (!locations.length) return
    const exists = locations.some((l) => String(l.id) === String(locationId))
    if (!exists) setLocationId("all")
  }, [locations, locationId, setLocationId])

  const selectedLocation = useMemo(() => {
    if (locationId === "all") return null
    return locations.find((l) => String(l.id) === String(locationId)) || null
  }, [locationId, locations])

  const value = useMemo(
    () => ({ locationId, setLocationId, locations, loading, selectedLocation }),
    [locationId, setLocationId, locations, loading, selectedLocation]
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export const useLocationScope = () => useContext(LocationContext)

/**
 * Filter helper for the dashboard / list pages. Compares a record's
 * territory_id against the currently scoped location. When locationId
 * is "all", returns the input unchanged.
 *
 * Record shape is flexible: we check territory_id, territoryId,
 * location_id, locationId. If none is present, the record is kept
 * (legacy data without a scope shouldn't disappear silently).
 */
export const filterByLocation = (records, locationId) => {
  if (!locationId || locationId === "all") return records
  return records.filter((r) => {
    const candidate = r.territory_id ?? r.territoryId ?? r.location_id ?? r.locationId
    if (candidate == null) return true
    return String(candidate) === String(locationId)
  })
}
