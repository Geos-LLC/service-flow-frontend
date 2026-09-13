/** Shared helpers for customer / job photo galleries (ProofPix + SF uploads). */

export const PHOTO_MODE_LABEL = {
  before: "Before",
  after: "After",
  combined: "Combined",
  progress: "Progress",
}

export const isImageMime = (mime) => String(mime || "").toLowerCase().startsWith("image/")

export const formatRoomName = (room) => {
  if (!room || typeof room !== "string") return null
  return room.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export const proofpixMeta = (file) => {
  if (!file?.proofpix_metadata || typeof file.proofpix_metadata !== "object") return null
  return file.proofpix_metadata
}

export const photoCapturedBy = (file) => {
  const meta = proofpixMeta(file)
  const fromProofpix = typeof meta?.captured_by === "string" ? meta.captured_by.trim() : ""
  if (fromProofpix) return fromProofpix
  if (typeof file?.captured_by === "string" && file.captured_by.trim()) return file.captured_by.trim()
  if (typeof file?.uploaded_by_name === "string" && file.uploaded_by_name.trim()) {
    return file.uploaded_by_name.trim()
  }
  return null
}

export const photoCaptureTimeMs = (file) => {
  const meta = proofpixMeta(file)
  if (meta && Number.isFinite(Number(meta.timestamp))) return Number(meta.timestamp)
  if (file?.uploaded_at) {
    const t = new Date(file.uploaded_at).getTime()
    if (Number.isFinite(t)) return t
  }
  return 0
}

export const sortPhotosChronologically = (files, { ascending = true } = {}) => {
  const list = [...files]
  list.sort((a, b) => {
    const diff = photoCaptureTimeMs(a) - photoCaptureTimeMs(b)
    if (diff !== 0) return ascending ? diff : -diff
    return String(a.id).localeCompare(String(b.id))
  })
  return list
}

export const groupPhotosByCleaner = (files) => {
  const groups = new Map()
  for (const file of files) {
    const key = photoCapturedBy(file) || "Unknown"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(file)
  }
  for (const [, items] of groups) {
    items.sort((a, b) => photoCaptureTimeMs(a) - photoCaptureTimeMs(b))
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "Unknown") return 1
    if (b === "Unknown") return -1
    return a.localeCompare(b)
  })
}

export const photoModeLabel = (file) => {
  const meta = proofpixMeta(file)
  const mode = meta?.mode
  return mode ? (PHOTO_MODE_LABEL[mode] || mode) : null
}

/** Build before/after pairs grouped by job + room for admin report view. */
export const buildBeforeAfterReport = (files) => {
  const photos = files.filter((f) => isImageMime(f.mime_type))
  const byJobRoom = new Map()

  for (const file of photos) {
    const meta = proofpixMeta(file)
    const mode = String(meta?.mode || "").toLowerCase()
    if (mode !== "before" && mode !== "after") continue
    const jobId = file.job_id || "none"
    const room = formatRoomName(meta?.room) || "General"
    const key = `${jobId}::${room}`
    if (!byJobRoom.has(key)) {
      byJobRoom.set(key, { jobId: file.job_id, room, before: [], after: [] })
    }
    const bucket = byJobRoom.get(key)
    const entry = { file, capturedBy: photoCapturedBy(file), at: photoCaptureTimeMs(file) }
    if (mode === "before") bucket.before.push(entry)
    else bucket.after.push(entry)
  }

  return [...byJobRoom.values()]
    .map((section) => ({
      ...section,
      before: section.before.sort((a, b) => a.at - b.at),
      after: section.after.sort((a, b) => a.at - b.at),
    }))
    .filter((s) => s.before.length > 0 || s.after.length > 0)
    .sort((a, b) => {
      const jobCmp = String(a.jobId || "").localeCompare(String(b.jobId || ""))
      if (jobCmp !== 0) return jobCmp
      return a.room.localeCompare(b.room)
    })
}

const ACTIVE_JOB_STATUSES = new Set([
  "in_progress", "in progress", "in-progress",
  "en_route", "en route", "enroute",
  "started", "onsite", "on_site",
])

const jobAssigneeIds = (job) => {
  const ids = new Set()
  const add = (v) => {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  add(job?.team_member_id)
  add(job?.assigned_team_member_id)
  ;(job?.team_assignments || job?.job_team_assignments || []).forEach((a) => {
    add(a?.team_member_id || a?.id)
  })
  ;(job?.assigned_providers || []).forEach((p) => {
    add(p?.id || p?.team_member_id || p?.provider_id)
  })
  return ids
}

const jobIsAssignedTo = (job, teamMemberId) => {
  if (!teamMemberId) return true
  return jobAssigneeIds(job).has(Number(teamMemberId))
}

/** Pick the job SF uploads should attach to — no manual client/job picker. */
export const pickUploadJobForCustomer = (jobs, teamMemberId) => {
  if (!Array.isArray(jobs) || jobs.length === 0) return null

  const sorted = [...jobs].sort((a, b) => {
    const da = jobDateStr(a)
    const db = jobDateStr(b)
    return db.localeCompare(da)
  })

  const todayStr = todayStrLocal()

  for (const job of sorted) {
    const status = String(job.status || "").toLowerCase()
    if (ACTIVE_JOB_STATUSES.has(status) && jobIsAssignedTo(job, teamMemberId)) {
      return job.id
    }
  }

  for (const job of sorted) {
    if (jobDateStr(job) === todayStr && jobIsAssignedTo(job, teamMemberId)) {
      return job.id
    }
  }

  for (const job of sorted) {
    if (jobIsAssignedTo(job, teamMemberId)) return job.id
  }

  return sorted[0]?.id ?? null
}

function jobDateStr(job) {
  return String(job?.scheduled_date || "").split("T")[0].split(" ")[0]
}

function todayStrLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
