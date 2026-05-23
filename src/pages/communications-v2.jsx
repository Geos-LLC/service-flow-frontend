"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  Inbox as InboxIcon,
  Mail as MailIcon,
  MessageSquare,
  Star,
  Archive,
  RefreshCw,
  Send,
  Search as SearchIcon,
  User as UserIcon,
  Briefcase,
  MoreHorizontal,
  Paperclip,
  Smile,
  Zap,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Check,
  Plus,
  X,
  ChevronDown,
  Sparkles,
  Trash2,
  Phone as PhoneIcon,
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useLocationScope } from "../context/LocationContext"
import {
  communicationsAPI,
  leadbridgeAPI,
  openPhoneAPI,
  whatsappAPI,
  connectedEmailAPI,
} from "../services/api"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import MobileHeader from "../components/mobile-header"
import {
  SfCard,
  SfButton,
  SfTag,
  SfAvatar,
  sfInitials,
} from "../components/sf-primitives"

/**
 * Inbox v2 (Wave 4) — Service Blue redesign of /communications.
 *
 * Three panes:
 *   Left  (200px): folders rail (All / Unread / SMS / Email / Reviews
 *                  / Archive) + connected channels.
 *   Mid   (340px): thread list with search + filter-driven rows.
 *   Right (flex):  conversation header + messages + composer.
 *
 * Uses the existing communicationsAPI so no backend changes are
 * required. Reads and writes go through:
 *   - getConversations({ filter, search, channel, archived })
 *   - getProviderAccounts()
 *   - getConversation(id)
 *   - sendMessage(id, { text, channel })
 */

const FOLDERS = [
  { id: "all",     label: "All",      icon: InboxIcon, builtin: true },
  { id: "unread",  label: "Unread",   icon: MessageSquare, urgent: true, builtin: true },
  { id: "sms",     label: "SMS",      icon: MessageSquare, channel: "sms",      builtin: true },
  { id: "whatsapp",label: "WhatsApp", icon: MessageSquare, channel: "whatsapp", builtin: true },
  { id: "email",   label: "Email",    icon: MailIcon,      channel: "email",    builtin: true },
  { id: "reviews", label: "Reviews",  icon: Star,          channel: "review",   builtin: true },
  { id: "thumbtack", label: "Thumbtack", icon: Briefcase,  channel: "thumbtack",builtin: true },
  { id: "yelp",    label: "Yelp",     icon: Star,          channel: "yelp",     builtin: true },
  { id: "archive", label: "Archive",  icon: Archive,       archived: true,      builtin: true },
]

// Channel catalog — every channel type the app supports, whether or
// not the user has actually connected an account for it. The icon
// + color is the visual identity; the count comes from the live
// conversation list at render time.
const CHANNEL_CATALOG = [
  { id: "sms",       label: "SMS",       icon: MessageSquare, c: "var(--sf-green)",  desc: "Twilio / OpenPhone" },
  { id: "whatsapp",  label: "WhatsApp",  icon: MessageSquare, c: "#25D366",          desc: "WhatsApp Business" },
  { id: "email",     label: "Email",     icon: MailIcon,      c: "var(--sf-blue)",   desc: "Gmail / Outlook" },
  { id: "review",    label: "Yelp",      icon: Star,          c: "#C41200",          desc: "Yelp reviews" },
  { id: "thumbtack", label: "Thumbtack", icon: Briefcase,     c: "#1A73E8",          desc: "Thumbtack inbox" },
  { id: "call",      label: "Calls",     icon: PhoneIcon,     c: "var(--sf-purple)", desc: "Inbound + outbound calls" },
]

const CUSTOM_FOLDERS_KEY = "serviceflow.inbox.customFolders"

const CommunicationsV2 = () => {
  const { user } = useAuth()
  const { locationId } = useLocationScope()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialFolder = FOLDERS.find((f) => f.id === searchParams.get("folder"))?.id || "all"
  const initialConv = searchParams.get("conversation")

  const [folder, setFolder] = useState(initialFolder)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  // `allConversations` is the unfiltered server result for the current
  // search/location scope. Folder filtering happens client-side so the
  // folder counts in the sidebar never change when the user clicks
  // between folders (previously each click re-queried with a channel
  // filter, zeroing out the other folder counts).
  const [allConversations, setAllConversations] = useState([])
  const [accounts, setAccounts] = useState([])
  const [integrations, setIntegrations] = useState({}) // per-channel connection status
  const [loadingList, setLoadingList] = useState(true)

  const [selectedId, setSelectedId] = useState(initialConv || null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [composeText, setComposeText] = useState("")
  const [composeChannel, setComposeChannel] = useState(null)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  // Custom folders — user-defined, persisted to localStorage. Each
  // folder is { id, label, channels: [...channel ids] }. When active
  // they filter the conversation list to ANY of their channels.
  const [customFolders, setCustomFolders] = useState(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FOLDERS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const persistFolders = useCallback((next) => {
    setCustomFolders(next)
    try { localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(next)) } catch {}
  }, [])

  // URL sync
  useEffect(() => {
    setSearchParams((sp) => {
      const next = new URLSearchParams(sp)
      next.set("folder", folder)
      if (selectedId) next.set("conversation", String(selectedId))
      else next.delete("conversation")
      return next
    }, { replace: true })
  }, [folder, selectedId, setSearchParams])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  // Load conversations. Pull every channel in a single unfiltered
  // query so folder counts are stable, then a second query for the
  // archived threads (API treats archived as a separate scope), and
  // merge. Folder filtering happens client-side in `conversations`
  // below. Search and location still scope server-side because they
  // change the universe of relevant threads.
  const fetchConversations = useCallback(async () => {
    if (!user?.id) return
    setLoadingList(true)
    try {
      const base = {}
      if (debouncedSearch) base.search = debouncedSearch
      if (locationId && locationId !== "all") base.locationId = locationId
      const [activeResp, archivedResp] = await Promise.allSettled([
        communicationsAPI.getConversations(base),
        communicationsAPI.getConversations({ ...base, archived: "true" }),
      ])
      const toList = (r) => {
        const v = r.status === "fulfilled" ? r.value : null
        return Array.isArray(v)
          ? v
          : Array.isArray(v?.conversations)
          ? v.conversations
          : []
      }
      const active = toList(activeResp)
      const archived = toList(archivedResp).map((c) => ({ ...c, isArchived: true }))
      // Merge, de-dupe by id (active wins if a row appears in both
      // — shouldn't happen, but be defensive).
      const seen = new Set()
      const merged = []
      ;[...active, ...archived].forEach((c) => {
        if (seen.has(c.id)) return
        seen.add(c.id)
        merged.push(c)
      })
      setAllConversations(merged)
    } finally {
      setLoadingList(false)
    }
  }, [user?.id, debouncedSearch, locationId])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  // Apply folder filter client-side. Built-in single-channel folders
  // match c.channel; "unread" filters by unreadCount; "archive" by
  // isArchived; custom folders match any of their listed channels.
  const conversations = useMemo(() => {
    const builtIn = FOLDERS.find((x) => x.id === folder)
    const custom = customFolders.find((x) => x.id === folder)
    // Default behavior: hide archived threads except in the Archive
    // folder. Everything else flows through the channel/unread filter.
    let list = allConversations.filter((c) => !c.isArchived)
    if (builtIn?.id === "all") {
      // already filtered above
    } else if (builtIn?.id === "unread") {
      list = list.filter((c) => (c.unreadCount ?? 0) > 0)
    } else if (builtIn?.archived) {
      list = allConversations.filter((c) => c.isArchived)
    } else if (builtIn?.channel) {
      list = list.filter((c) => (c.channel || "").toLowerCase() === builtIn.channel)
    } else if (custom && Array.isArray(custom.channels)) {
      const set = new Set(custom.channels)
      list = list.filter((c) => set.has((c.channel || "").toLowerCase()))
    }
    return list
  }, [allConversations, folder, customFolders])

  // Auto-select first conversation when the filtered list changes
  useEffect(() => {
    if (loadingList) return
    if (selectedId && conversations.some((c) => String(c.id) === String(selectedId))) return
    if (conversations.length > 0) setSelectedId(conversations[0].id)
  }, [conversations, selectedId, loadingList])

  // Load every integration status in parallel — Communication Hub
  // settings query all of these too, so the connection state mirrors
  // what the user sees there. LeadBridge owns Yelp + Thumbtack;
  // OpenPhone owns SMS + Calls; WhatsApp is its own; Connected Email
  // is Gmail/Outlook for the Email channel.
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      communicationsAPI.getProviderAccounts(),
      leadbridgeAPI.getStatus(),
      openPhoneAPI.getStatus(),
      whatsappAPI.getStatus(),
      connectedEmailAPI.listAccounts(),
    ]).then(([paResp, lbResp, opResp, waResp, ceResp]) => {
      if (cancelled) return
      // Provider accounts (Sigcore-side roll-up)
      const pa = paResp.status === "fulfilled" ? paResp.value : null
      const paList = Array.isArray(pa) ? pa : (pa?.accounts || [])
      setAccounts(Array.isArray(paList) ? paList : [])

      // LeadBridge — Comm Hub treats LB as the umbrella provider for
      // both Yelp and Thumbtack: if LB is connected, both channels
      // show "Connected" there. Match that behavior so the Inbox and
      // Comm Hub agree. If the LB accounts list happens to surface a
      // per-channel record we use it to enrich the subtitle, but it's
      // no longer required for the connected dot.
      const lb = lbResp.status === "fulfilled" ? lbResp.value : null
      const lbConnected = !!lb?.connected
      const lbAccounts = Array.isArray(lb?.accounts) ? lb.accounts : []
      const yelpAcct = lbAccounts.find((a) =>
        JSON.stringify(a || {}).toLowerCase().includes("yelp")
      )
      const thumbAcct = lbAccounts.find((a) =>
        JSON.stringify(a || {}).toLowerCase().includes("thumbtack")
      )
      const hasYelp = lbConnected
      const hasThumb = lbConnected

      // OpenPhone — SMS + Calls
      const op = opResp.status === "fulfilled" ? opResp.value : null
      const opConnected = !!op?.connected

      // WhatsApp — Comm Hub considers it connected only if status is
      // "connected" with a phone number; the bare `connected` flag
      // can be true while the user hasn't completed onboarding yet,
      // which is why Inbox previously showed green while Comm Hub
      // showed grey.
      const wa = waResp.status === "fulfilled" ? waResp.value : null
      const waStatus = String(wa?.status || "").toLowerCase()
      const waPhone = wa?.phoneNumber || wa?.phone_number || null
      const waConnected = !!wa?.connected && (waStatus === "connected" || !!waPhone)

      // Connected Email (Gmail / Outlook)
      const ce = ceResp.status === "fulfilled" ? ceResp.value : null
      const ceAccounts = Array.isArray(ce?.accounts) ? ce.accounts : []
      const emailConnected = ceAccounts.length > 0

      setIntegrations({
        sms:       { connected: opConnected, sub: opConnected ? `${op?.phoneNumbers?.length || 1} number${op?.phoneNumbers?.length === 1 ? "" : "s"}` : null },
        whatsapp:  { connected: waConnected, sub: waConnected ? (waPhone || "Connected") : null },
        email:     { connected: emailConnected, sub: emailConnected ? `${ceAccounts.length} mailbox${ceAccounts.length === 1 ? "" : "es"}` : null },
        yelp:      { connected: hasYelp, sub: hasYelp ? (yelpAcct ? "via LeadBridge" : "via LeadBridge · pending profile") : null },
        thumbtack: { connected: hasThumb, sub: hasThumb ? (thumbAcct ? "via LeadBridge" : "via LeadBridge · pending profile") : null },
        review:    { connected: hasYelp, sub: hasYelp ? "via LeadBridge" : null },
        call:      { connected: opConnected, sub: opConnected ? "via OpenPhone" : null },
        // Special LeadBridge meta so we can show its overall status if
        // neither Yelp nor Thumbtack profile is configured yet.
        _leadbridge: { connected: lbConnected, accounts: lbAccounts.length },
      })
    })
    return () => { cancelled = true }
  }, [user?.id])

  // Load conversation detail when selected changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    communicationsAPI.getConversation(selectedId, { limit: 100 })
      .then((data) => {
        if (cancelled) return
        setDetail(data)
        // Mark read locally
        setAllConversations((prev) =>
          prev.map((c) =>
            String(c.id) === String(selectedId) ? { ...c, unreadCount: 0 } : c
          )
        )
      })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  // Auto-scroll to bottom when new messages load
  useEffect(() => {
    if (!detail) return
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }, [detail])

  // Channel of the most recent message (or fallback to conversation
  // channel). This is the default "Sending as" channel — the user
  // can override via the dropdown.
  const latestChannel = useMemo(() => {
    const events = detail?.events || []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      const t = e.type || ""
      if (t.startsWith("message_") && e.channel) return e.channel.toLowerCase()
    }
    return (detail?.conversation?.channel || conversations.find((c) => String(c.id) === String(selectedId))?.channel || "sms").toLowerCase()
  }, [detail, conversations, selectedId])

  // Reset compose channel when the selected thread changes
  useEffect(() => { setComposeChannel(null) }, [selectedId])
  const effectiveSendChannel = composeChannel || latestChannel

  // Channels available to send on for the active thread. Preference:
  // detail.availableSendChannels (server-provided) → channels seen in
  // events → conversation.channel.
  const availableSendChannels = useMemo(() => {
    if (Array.isArray(detail?.availableSendChannels) && detail.availableSendChannels.length) {
      return Array.from(new Set(detail.availableSendChannels.map((c) => c.toLowerCase())))
    }
    const set = new Set()
    ;(detail?.events || []).forEach((e) => {
      const t = e.type || ""
      if (t.startsWith("message_") && e.channel) set.add(e.channel.toLowerCase())
    })
    const convCh = conversations.find((c) => String(c.id) === String(selectedId))?.channel
    if (convCh) set.add(String(convCh).toLowerCase())
    if (!set.size) set.add("sms")
    return Array.from(set)
  }, [detail, conversations, selectedId])

  const onSend = async () => {
    const text = composeText.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    try {
      await communicationsAPI.sendMessage(selectedId, { text, channel: effectiveSendChannel })
      setComposeText("")
      // Refresh detail
      const fresh = await communicationsAPI.getConversation(selectedId, { limit: 100 })
      setDetail(fresh)
      // Bump preview in the list
      setAllConversations((prev) =>
        prev.map((c) =>
          String(c.id) === String(selectedId)
            ? { ...c, lastPreview: text, lastEventAt: new Date().toISOString() }
            : c
        )
      )
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || "Could not send the message.")
    } finally {
      setSending(false)
    }
  }

  const onKeyDownCompose = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      onSend()
    }
  }

  // Folder counts are derived from the unfiltered server result so
  // they stay stable when the user clicks between folders. (Previously
  // each click re-queried the API with a `channel` param, zeroing the
  // counts of the other folders.)
  const folderCounts = useMemo(() => {
    const counts = {
      all: 0, unread: 0,
      sms: 0, whatsapp: 0, email: 0,
      reviews: 0, thumbtack: 0, yelp: 0,
      archive: 0,
    }
    allConversations.forEach((c) => {
      const ch = (c.channel || "").toLowerCase()
      if (c.isArchived) {
        counts.archive += 1
        return
      }
      counts.all += 1
      if ((c.unreadCount ?? 0) > 0) counts.unread += 1
      if (ch === "sms") counts.sms += 1
      else if (ch === "whatsapp") counts.whatsapp += 1
      else if (ch === "email") counts.email += 1
      else if (ch === "review") counts.reviews += 1
      else if (ch === "thumbtack") counts.thumbtack += 1
      else if (ch === "yelp") counts.yelp += 1
    })
    customFolders.forEach((f) => {
      const set = new Set(f.channels || [])
      counts[f.id] = allConversations.filter(
        (c) => !c.isArchived && set.has((c.channel || "").toLowerCase())
      ).length
    })
    return counts
  }, [allConversations, customFolders])

  // Channel connection status. Priority of signals:
  //   1. integrations.{channel}.connected (per-channel integration
  //      check — LB for Yelp/Thumbtack, OpenPhone for SMS/Call,
  //      WhatsApp for WhatsApp, Connected Email for Email).
  //   2. provider-accounts (Sigcore-side roll-up) — handles channels
  //      we didn't query directly.
  //   3. Conversations exist for the channel → "in use".
  const channelStatus = useMemo(() => {
    const status = {}
    // 1) Integrations
    Object.entries(integrations).forEach(([k, v]) => {
      if (v?.connected) status[k] = "connected"
    })
    // 2) Sigcore provider accounts as a safety net
    accounts.forEach((a) => {
      const k = (a.channel || "").toLowerCase()
      if (k && !status[k]) status[k] = "connected"
    })
    // 3) Conversations imply "in use" (we have history even without
    //    a current active integration row). Use the unfiltered list
    //    so channel status doesn't shift based on which folder is open.
    allConversations.forEach((c) => {
      const k = (c.channel || "").toLowerCase()
      if (k && !status[k]) status[k] = "in_use"
    })
    return status
  }, [integrations, accounts, allConversations])

  const selectedConv = useMemo(
    () => conversations.find((c) => String(c.id) === String(selectedId)) || null,
    [conversations, selectedId]
  )

  return (
    <div
      className="bg-[var(--sf-bg-page)] flex flex-col"
      style={{ minHeight: "100vh", fontFamily: "var(--sf-font-ui)" }}
    >
      <MobileHeader title="Inbox" />

      {/* Page header */}
      <div className="px-4 sm:px-6 lg:px-8 pt-5">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1
              className="text-[22px] sm:text-[24px] font-bold text-[var(--sf-ink)] m-0"
              style={{ letterSpacing: "-0.02em" }}
            >
              Inbox
            </h1>
            <div className="text-[13px] text-[var(--sf-ink-2)] mt-1">
              {folderCounts.unread} unread · {(() => {
                const n = CHANNEL_CATALOG.filter((c) => integrations[c.id]?.connected).length
                return `${n} channel${n === 1 ? "" : "s"} connected`
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SfButton variant="secondary" size="md" icon={RefreshCw} onClick={fetchConversations}>
              Sync
            </SfButton>
            <SfButton variant="primary" size="md" icon={Send}>
              New message
            </SfButton>
          </div>
        </div>
      </div>

      {/* 3-pane body */}
      <div
        className="px-4 sm:px-6 lg:px-8 pt-3 pb-6 flex gap-3.5"
        style={{ height: "calc(100vh - 110px)", minHeight: 520 }}
      >
        {/* Folders rail */}
        <div className="hidden md:flex flex-col gap-3.5" style={{ width: 200, flexShrink: 0 }}>
          <SfCard padding={"10px 8px"}>
            <div className="flex items-center" style={{ padding: "4px 8px 6px" }}>
              <SectionLabel inline>Folders</SectionLabel>
              <div className="flex-1" />
              <button
                onClick={() => setNewFolderOpen(true)}
                aria-label="New folder"
                className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)] hover:bg-[var(--sf-panel-soft)]"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <Plus size={13} />
              </button>
            </div>
            {FOLDERS.map((f) => (
              <FolderRow
                key={f.id}
                folder={f}
                active={folder === f.id}
                count={folderCounts[f.id] || 0}
                onSelect={() => { setFolder(f.id); setSelectedId(null) }}
              />
            ))}
            {customFolders.length > 0 && (
              <>
                <div
                  className="text-[9.5px] font-bold uppercase text-[var(--sf-ink-3)]"
                  style={{ padding: "8px 10px 4px", letterSpacing: ".06em" }}
                >
                  Custom
                </div>
                {customFolders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    active={folder === f.id}
                    count={folderCounts[f.id] || 0}
                    custom
                    onSelect={() => { setFolder(f.id); setSelectedId(null) }}
                    onDelete={() => {
                      persistFolders(customFolders.filter((x) => x.id !== f.id))
                      if (folder === f.id) setFolder("all")
                    }}
                  />
                ))}
              </>
            )}
          </SfCard>

          <SfCard padding={"10px 8px"}>
            <SectionLabel>Channels</SectionLabel>
            {CHANNEL_CATALOG.map((c) => {
              const Icon = c.icon
              const state = channelStatus[c.id]
              const integ = integrations[c.id]
              const connected = state === "connected"
              const inUse = state === "in_use"
              const dotColor = connected
                ? "var(--sf-green)"
                : inUse
                ? "var(--sf-amber)"
                : "var(--sf-ink-4)"
              const subtitle = connected
                ? (integ?.sub || c.desc)
                : inUse
                ? `${c.desc} (history only)`
                : c.desc + " · not connected"
              return (
                <div key={c.id} className="flex items-center gap-2.5" style={{ padding: "7px 10px" }}>
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: `${c.c}1a`, color: c.c }}
                  >
                    <Icon size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-semibold text-[var(--sf-ink)] leading-tight truncate">
                        {c.label}
                      </span>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: dotColor }}
                        title={connected ? "Connected" : inUse ? "In use" : "Not connected"}
                      />
                    </div>
                    <div
                      className="text-[10px] text-[var(--sf-ink-3)] mt-px truncate"
                      title={subtitle}
                    >
                      {subtitle}
                    </div>
                  </div>
                </div>
              )
            })}
          </SfCard>
        </div>

        {/* Thread list */}
        <SfCard
          padding={0}
          className="hidden sm:flex flex-col"
          style={{ width: 340, flexShrink: 0, minHeight: 0 }}
        >
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--sf-border-soft)" }}>
            <div
              className="flex items-center gap-2 rounded-md bg-[var(--sf-panel-alt)] border border-[var(--sf-border-soft)] px-2.5 py-[5px]"
            >
              <SearchIcon size={13} className="text-[var(--sf-ink-3)] flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search inbox"
                className="flex-1 bg-transparent border-none outline-none text-[12px] text-[var(--sf-ink)]"
                style={{ padding: 0, boxShadow: "none", fontFamily: "var(--sf-font-ui)" }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
            {loadingList ? (
              <div className="py-10 text-center text-[12px] text-[var(--sf-ink-3)]">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="py-10 px-4 text-center text-[12px] text-[var(--sf-ink-3)]">
                {debouncedSearch ? "No conversations match." : "No conversations in this folder."}
              </div>
            ) : (
              conversations.map((c) => (
                <ThreadRow
                  key={c.id}
                  conv={c}
                  active={String(c.id) === String(selectedId)}
                  onSelect={() => setSelectedId(c.id)}
                />
              ))
            )}
          </div>
        </SfCard>

        {/* New folder modal */}
        <NewFolderModal
          open={newFolderOpen}
          onClose={() => setNewFolderOpen(false)}
          onSubmit={(folder) => {
            persistFolders([...customFolders, folder])
            setFolder(folder.id)
            setSelectedId(null)
          }}
        />

        {/* Conversation */}
        <SfCard padding={0} className="flex-1 flex flex-col min-w-0" style={{ minHeight: 0 }}>
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ background: "var(--sf-panel-soft)", color: "var(--sf-ink-3)" }}
              >
                <InboxIcon size={22} />
              </div>
              <div className="text-[14px] font-semibold text-[var(--sf-ink)]">No conversation selected</div>
              <div className="text-[12.5px] text-[var(--sf-ink-2)] mt-1 max-w-sm">
                Pick a thread from the list to see the full message history.
              </div>
            </div>
          ) : (
            <ConversationPane
              conv={selectedConv}
              detail={detail}
              loading={detailLoading}
              composeText={composeText}
              setComposeText={setComposeText}
              composeChannel={effectiveSendChannel}
              setComposeChannel={setComposeChannel}
              availableSendChannels={availableSendChannels}
              onSend={onSend}
              onKeyDownCompose={onKeyDownCompose}
              sending={sending}
              messagesEndRef={messagesEndRef}
              onViewCustomer={() => {
                const cid = detail?.lead?.id || selectedConv?.customerId
                if (cid) navigate(`/customer/${cid}`)
              }}
              onCreateJob={() => {
                const cid = detail?.lead?.id || selectedConv?.customerId
                navigate(cid ? `/createjob?customerId=${cid}` : "/createjob")
              }}
            />
          )}
        </SfCard>
      </div>
    </div>
  )
}

// ── Section label inside a card ────────────────────────────

const SectionLabel = ({ children, inline }) => (
  <div
    className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
    style={{ padding: inline ? "0" : "4px 10px 8px", letterSpacing: ".06em" }}
  >
    {children}
  </div>
)

// ── Folder row ─────────────────────────────────────────────

const FolderRow = ({ folder, active, count, custom, onSelect, onDelete }) => {
  const Icon = folder.icon || InboxIcon
  return (
    <div
      className="group flex items-center gap-2.5 w-full rounded-md"
      style={{
        background: active ? "var(--sf-blue-soft)" : "transparent",
      }}
    >
      <button
        onClick={onSelect}
        className="flex items-center gap-2.5 flex-1 text-left rounded-md"
        style={{
          padding: "7px 10px",
          background: "transparent",
          color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
          border: "none",
          fontSize: 12.5,
          fontWeight: active ? 600 : 500,
          cursor: "pointer",
          fontFamily: "var(--sf-font-ui)",
        }}
      >
        <Icon size={14} color={folder.urgent ? "var(--sf-red)" : undefined} />
        <span className="flex-1 truncate">{folder.label}</span>
        <span
          style={{
            fontSize: 11,
            color: active ? "var(--sf-blue-dark)" : "var(--sf-ink-3)",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
      </button>
      {custom && onDelete && (
        <button
          onClick={onDelete}
          aria-label="Delete folder"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--sf-ink-3)] hover:text-[var(--sf-red-dark)]"
          style={{
            background: "transparent",
            border: "none",
            padding: "4px 6px 4px 0",
            cursor: "pointer",
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ── New folder modal ───────────────────────────────────────

const NewFolderModal = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState("")
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    if (open) { setName(""); setSelected(new Set()) }
  }, [open])

  if (!open) return null

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const canSubmit = name.trim() && selected.size > 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(15,23,42,.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        fontFamily: "var(--sf-font-ui)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[14px] bg-[var(--sf-panel)] w-full max-w-[420px]"
        style={{
          border: "1px solid var(--sf-border-soft)",
          boxShadow: "var(--sf-shadow-l)",
        }}
      >
        <div
          className="flex items-center px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--sf-border-soft)" }}
        >
          <div className="text-[14px] font-semibold text-[var(--sf-ink)]">New folder</div>
          <div className="flex-1" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)]"
            style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
              style={{ letterSpacing: ".04em" }}
            >
              Folder name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Bookings, VIP, Reviews & Surveys"
              className="rounded-md border border-[var(--sf-border-soft)]"
              style={{
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "var(--sf-font-ui)",
              }}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[10.5px] font-bold uppercase text-[var(--sf-ink-3)]"
              style={{ letterSpacing: ".04em" }}
            >
              Show channels
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_CATALOG.map((c) => {
                const on = selected.has(c.id)
                const Icon = c.icon
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-full"
                    style={{
                      padding: "5px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      background: on ? "var(--sf-blue-soft)" : "var(--sf-panel)",
                      color: on ? "var(--sf-blue-dark)" : "var(--sf-ink-2)",
                      border: "1px solid " + (on ? "var(--sf-blue-soft-2)" : "var(--sf-border-soft)"),
                      cursor: "pointer",
                      fontFamily: "var(--sf-font-ui)",
                    }}
                  >
                    <Icon size={11} color={c.c} />
                    {c.label}
                    {on && <Check size={10} strokeWidth={3} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{
            background: "var(--sf-panel-alt)",
            borderTop: "1px solid var(--sf-border-soft)",
            borderRadius: "0 0 14px 14px",
          }}
        >
          <SfButton variant="ghost" size="md" onClick={onClose}>
            Cancel
          </SfButton>
          <SfButton
            variant="primary"
            size="md"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              onSubmit({
                id: `custom-${Date.now()}`,
                label: name.trim(),
                channels: Array.from(selected),
              })
              onClose()
            }}
          >
            Create folder
          </SfButton>
        </div>
      </div>
    </div>
  )
}

// ── Send-channel dropdown (in the composer) ────────────────

const SendChannelDropdown = ({ channel, options, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  const cur = CHANNEL_META[(channel || "").toLowerCase()] || CHANNEL_META.sms

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-[11px] font-semibold"
        style={{
          background: cur.bg,
          color: cur.c,
          border: `1px solid ${cur.c}22`,
          cursor: options.length > 1 ? "pointer" : "default",
          fontFamily: "var(--sf-font-ui)",
        }}
      >
        Sending as {cur.label}
        {options.length > 1 && <ChevronDown size={11} />}
      </button>
      {open && options.length > 1 && (
        <div
          className="absolute right-0 bottom-full mb-1.5 z-50 rounded-md py-1 bg-[var(--sf-panel)] border border-[var(--sf-border-soft)]"
          style={{ boxShadow: "var(--sf-shadow-l)", minWidth: 170 }}
        >
          {options.map((opt) => {
            const m = CHANNEL_META[opt] || CHANNEL_META.sms
            const sel = opt === (channel || "").toLowerCase()
            return (
              <button
                key={opt}
                onClick={() => { onChange?.(opt); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px]"
                style={{
                  background: sel ? "var(--sf-blue-soft)" : "transparent",
                  color: sel ? "var(--sf-blue-dark)" : "var(--sf-ink)",
                  fontWeight: sel ? 600 : 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--sf-font-ui)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: m.c }}
                />
                <span className="flex-1">{m.label}</span>
                {sel && <Check size={12} strokeWidth={2.4} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Suggested reply (UI scaffold) ──────────────────────────
// TODO(ai): hook to a real AI suggestion endpoint. For now the
// suggestion is templated off the last incoming message so the
// surface feels populated and the layout reads correctly.

const buildPlaceholderSuggestion = (latestEvent, threadName) => {
  const txt = (latestEvent?.text || "").toLowerCase()
  const first = String(threadName || "there").split(" ")[0]
  if (!latestEvent || latestEvent.type === "message_out") return null
  if (txt.includes("price") || txt.includes("quote") || txt.includes("how much")) {
    return `Hi ${first}! Happy to give you a quote — could you share the property size and any add-ons you'd like (oven, fridge, windows)?`
  }
  if (txt.includes("cancel")) {
    return `Hi ${first}, no problem — I can cancel that booking. Would you like to reschedule for another day instead?`
  }
  if (txt.includes("late") || txt.includes("eta") || txt.includes("on my way") || txt.includes("how long")) {
    return `Hi ${first}! Just confirmed with the team — they're on their way and should be at your place shortly.`
  }
  if (txt.includes("thank")) {
    return `Thanks for the kind words, ${first}! Looking forward to seeing you next time.`
  }
  return `Hi ${first}! Thanks for reaching out — happy to help. Could you share a few more details so I can get back to you with specifics?`
}

const SuggestedReply = ({ composeText, setComposeText, latestEvent, threadName }) => {
  const [dismissed, setDismissed] = useState(false)
  const suggestion = useMemo(
    () => buildPlaceholderSuggestion(latestEvent, threadName),
    [latestEvent, threadName]
  )
  if (!suggestion || dismissed || composeText.trim()) return null
  return (
    <div className="px-4 sm:px-5 pt-2 pb-1 flex-shrink-0" style={{ background: "var(--sf-panel)" }}>
      <div
        className="flex items-start gap-2.5 rounded-[10px] p-3"
        style={{
          background: "var(--sf-purple-soft)",
          border: "1px solid rgba(124,58,237,.25)",
        }}
      >
        <Sparkles size={15} color="var(--sf-purple)" className="flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div
            className="text-[10.5px] font-bold uppercase"
            style={{ color: "var(--sf-purple)", letterSpacing: ".04em" }}
          >
            Suggested reply
            <span className="ml-1.5 text-[var(--sf-ink-3)] font-medium normal-case">
              · AI hookup pending
            </span>
          </div>
          <div className="text-[12.5px] text-[var(--sf-ink-2)] mt-1 leading-snug">
            "{suggestion}"
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <SfButton
              variant="secondary"
              size="sm"
              onClick={() => setComposeText(suggestion)}
            >
              Use
            </SfButton>
            <SfButton variant="ghost" size="sm" disabled>
              Refine
            </SfButton>
            <div className="flex-1" />
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss suggestion"
              className="text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)]"
              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Thread row ─────────────────────────────────────────────

const ThreadRow = ({ conv, active, onSelect }) => {
  const channel = (conv.channel || "").toLowerCase()
  const channelMeta =
    channel === "email"
      ? { c: "var(--sf-purple)" }
      : channel === "review"
      ? { c: "var(--sf-amber)" }
      : { c: "var(--sf-green)" }
  const ChannelIcon =
    channel === "email" ? MailIcon : channel === "review" ? Star : MessageSquare
  const unread = (conv.unreadCount ?? 0) > 0
  const name = conv.displayName || conv.fallbackIdentifier || "Unknown"
  const isLead = conv.leadId && !conv.customerId

  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-start gap-2.5 px-3 py-3 hover:bg-[var(--sf-panel-alt)] transition-colors"
      style={{
        background: active ? "var(--sf-blue-soft)" : "transparent",
        borderLeft: active ? "3px solid var(--sf-blue)" : "3px solid transparent",
        borderBottom: "1px solid var(--sf-border-soft)",
        border: "none",
        borderRadius: 0,
        cursor: "pointer",
        fontFamily: "var(--sf-font-ui)",
      }}
    >
      <div className="relative flex-shrink-0">
        <SfAvatar
          initials={sfInitials(name)}
          color="var(--sf-ink)"
          size={32}
        />
        {unread && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 9,
              height: 9,
              borderRadius: 5,
              background: "var(--sf-blue)",
              border: "1.5px solid var(--sf-panel)",
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[12.5px] truncate flex-1"
            style={{ fontWeight: unread ? 700 : 600, color: "var(--sf-ink)" }}
          >
            {name}
          </span>
          <span
            className="text-[10.5px] text-[var(--sf-ink-3)] flex-shrink-0"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatRelative(conv.lastEventAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <ChannelIcon size={11} style={{ color: channelMeta.c, opacity: 0.8 }} />
          {conv.company && (
            <span
              className="text-[10.5px] text-[var(--sf-ink-3)] font-medium truncate"
              style={{ maxWidth: 120 }}
            >
              {conv.company}
            </span>
          )}
        </div>
        {conv.lastPreview && (
          <div
            className="text-[11.5px] text-[var(--sf-ink-3)] mt-1 leading-snug"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {conv.lastPreview}
          </div>
        )}
        {isLead && (
          <div className="mt-1.5">
            <SfTag color="#0E7490" bg="var(--sf-teal-soft)">Lead</SfTag>
          </div>
        )}
      </div>
    </button>
  )
}

// ── Conversation pane ──────────────────────────────────────

const ConversationPane = ({
  conv,
  detail,
  loading,
  composeText,
  setComposeText,
  composeChannel,
  setComposeChannel,
  availableSendChannels,
  onSend,
  onKeyDownCompose,
  sending,
  messagesEndRef,
  onViewCustomer,
  onCreateJob,
}) => {
  const events = useMemo(() => detail?.events || [], [detail])
  const lead = detail?.lead || null
  const channel = (detail?.conversation?.channel || conv?.channel || "sms").toLowerCase()
  const name = detail?.conversation?.displayName || conv?.displayName || conv?.fallbackIdentifier || "Unknown"
  const subline =
    channel === "email"
      ? detail?.conversation?.participantEmail || conv?.participantEmail || conv?.fallbackIdentifier
      : detail?.conversation?.participantPhone || conv?.fallbackIdentifier

  // Group events by calendar day for date dividers
  const grouped = useMemo(() => groupByDay(events), [events])

  return (
    <>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 sm:px-5 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--sf-border-soft)" }}
      >
        <SfAvatar initials={sfInitials(name)} color="var(--sf-ink)" size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-[var(--sf-ink)] truncate">{name}</div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
            {channel === "email" ? <MailIcon size={11} /> : <MessageSquare size={11} />}
            <span className="truncate">{subline || "—"}</span>
            {lead?.lifetime_value != null && (
              <>
                <span className="text-[var(--sf-ink-4)]">·</span>
                <span>${Math.round(lead.lifetime_value || 0).toLocaleString()} LTV</span>
              </>
            )}
            {lead?.entityType === "lead" && (
              <>
                <span className="text-[var(--sf-ink-4)]">·</span>
                <span>Lead</span>
              </>
            )}
          </div>
        </div>
        <SfButton variant="secondary" size="sm" icon={UserIcon} onClick={onViewCustomer} disabled={!lead?.id && !conv?.customerId}>
          View customer
        </SfButton>
        <SfButton variant="secondary" size="sm" icon={Briefcase} onClick={onCreateJob}>
          Create job
        </SfButton>
        <button
          aria-label="More actions"
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--sf-ink-3)] hover:bg-[var(--sf-panel-soft)] transition-colors"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-3"
        style={{ background: "var(--sf-panel-alt)", minHeight: 0 }}
      >
        {loading ? (
          <div className="text-center text-[12px] text-[var(--sf-ink-3)] py-8">Loading messages…</div>
        ) : events.length === 0 ? (
          <div className="text-center text-[12px] text-[var(--sf-ink-3)] py-8">No messages yet.</div>
        ) : (
          grouped.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-3">
              <div className="flex justify-center">
                <span
                  className="text-[10.5px] font-bold uppercase rounded-full"
                  style={{
                    padding: "3px 10px",
                    background: "var(--sf-panel)",
                    border: "1px solid var(--sf-border-soft)",
                    color: "var(--sf-ink-3)",
                    letterSpacing: ".04em",
                  }}
                >
                  {group.label}
                </span>
              </div>
              {group.events.map((e) => (
                <EventBubble key={e.id} event={e} name={name} />
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested reply — UI scaffold for the AI suggestion. Even
          without the AI behind it, having the slot in place keeps the
          surface ready and makes the design intent clear. */}
      <SuggestedReply
        composeText={composeText}
        setComposeText={setComposeText}
        latestEvent={(detail?.events || []).slice(-1)[0]}
        threadName={name}
      />

      {/* Composer */}
      <div
        className="px-4 sm:px-5 pt-3 pb-3 flex-shrink-0"
        style={{ borderTop: "1px solid var(--sf-border-soft)", background: "var(--sf-panel)" }}
      >
        <div
          className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5"
          style={{ border: "1.5px solid var(--sf-border-2)", background: "var(--sf-panel)" }}
        >
          <textarea
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={onKeyDownCompose}
            placeholder={`Reply to ${name.split(" ")[0] || "this thread"}…`}
            rows={2}
            className="flex-1 bg-transparent outline-none border-none text-[13px] text-[var(--sf-ink)]"
            style={{
              resize: "none",
              padding: 0,
              boxShadow: "none",
              fontFamily: "var(--sf-font-ui)",
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <SfButton variant="ghost" size="sm" icon={Paperclip} disabled>
            Attach
          </SfButton>
          <SfButton variant="ghost" size="sm" icon={Smile} disabled>
            Emoji
          </SfButton>
          <SfButton variant="ghost" size="sm" icon={Zap} disabled>
            Templates
          </SfButton>
          <div className="flex-1" />
          <SendChannelDropdown
            channel={composeChannel}
            options={availableSendChannels}
            onChange={setComposeChannel}
          />
          <SfButton
            variant="primary"
            size="md"
            icon={Send}
            kbd="⌘↵"
            onClick={onSend}
            disabled={sending || !composeText.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </SfButton>
        </div>
      </div>
    </>
  )
}

// ── Event bubble (message or call) ─────────────────────────

const EventBubble = ({ event, name }) => {
  const isCall = event.type === "call_in" || event.type === "call_out" || event.channel === "call"
  const isOut = event.type === "message_out" || event.type === "call_out"

  if (isCall) {
    const incoming = event.type === "call_in"
    const missed = (event.text || "").toLowerCase().includes("missed")
    const Icon = missed ? PhoneMissed : incoming ? PhoneIncoming : PhoneOutgoing
    const dur = event.callDurationSeconds
      ? `${Math.floor(event.callDurationSeconds / 60)}m ${event.callDurationSeconds % 60}s`
      : null
    return (
      <div className="flex justify-center">
        <div
          className="inline-flex items-center gap-2 rounded-full"
          style={{
            padding: "5px 12px",
            background: missed ? "var(--sf-red-soft)" : "var(--sf-panel)",
            color: missed ? "var(--sf-red-dark)" : "var(--sf-ink-2)",
            border: `1px solid ${missed ? "rgba(220,38,38,.25)" : "var(--sf-border-soft)"}`,
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: "var(--sf-font-ui)",
          }}
        >
          <Icon size={12} />
          <span>{event.text || (incoming ? "Incoming call" : "Outgoing call")}</span>
          {dur && (
            <span
              className="text-[10.5px] text-[var(--sf-ink-3)]"
              style={{ fontFamily: "var(--sf-font-mono)" }}
            >
              {dur}
            </span>
          )}
          <span
            className="text-[10.5px] text-[var(--sf-ink-3)]"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            {formatTimeShared(event.timestamp)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex gap-2.5"
      style={{
        flexDirection: isOut ? "row-reverse" : "row",
        alignItems: "flex-end",
      }}
    >
      <SfAvatar
        initials={isOut ? "Me" : sfInitials(name)}
        color={isOut ? "var(--sf-blue)" : "var(--sf-ink)"}
        size={28}
      />
      <div
        style={{
          maxWidth: "70%",
          display: "flex",
          flexDirection: "column",
          alignItems: isOut ? "flex-end" : "flex-start",
        }}
      >
        <div
          style={{
            padding: "9px 13px",
            background: isOut ? "var(--sf-blue)" : "var(--sf-panel)",
            color: isOut ? "#fff" : "var(--sf-ink)",
            borderRadius: isOut ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: isOut ? "0 1px 2px rgba(37,99,235,.25)" : "var(--sf-shadow)",
            border: isOut ? "none" : "1px solid var(--sf-border-soft)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {event.text || ""}
          {event.mediaUrl && (
            <div className="mt-2">
              {event.mediaType === "image" || (event.mediaMimetype || "").startsWith("image/") ? (
                <img
                  src={event.mediaUrl}
                  alt={event.mediaFilename || "attachment"}
                  className="rounded-md max-w-full"
                  style={{ maxHeight: 240 }}
                />
              ) : (
                <a
                  href={event.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] underline"
                  style={{ color: isOut ? "#cfe1ff" : "var(--sf-blue-dark)" }}
                >
                  {event.mediaFilename || "attachment"}
                </a>
              )}
            </div>
          )}
        </div>
        <div
          className="text-[10.5px] text-[var(--sf-ink-3)] mt-1 inline-flex items-center gap-1.5"
          style={{ paddingLeft: isOut ? 0 : 4, paddingRight: isOut ? 4 : 0 }}
        >
          <ChannelBadge channel={event.channel} />
          <span>{formatTimeShared(event.timestamp)}</span>
          {isOut && <Check size={10} />}
        </div>
      </div>
    </div>
  )
}

// ── Channel badge ──────────────────────────────────────────

const CHANNEL_META = {
  sms:       { label: "SMS",       c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" },
  whatsapp:  { label: "WhatsApp",  c: "#15803D",              bg: "#DCFCE7" },
  email:     { label: "Email",     c: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)" },
  review:    { label: "Yelp",      c: "#9F1A0A",              bg: "var(--sf-amber-soft)" },
  thumbtack: { label: "Thumbtack", c: "var(--sf-blue-dark)",  bg: "var(--sf-blue-soft)" },
  yelp:      { label: "Yelp",      c: "#9F1A0A",              bg: "var(--sf-red-soft)" },
  call:      { label: "Call",      c: "var(--sf-purple)",     bg: "var(--sf-purple-soft)" },
  openphone: { label: "SMS",       c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" },
}

const ChannelBadge = ({ channel, size = "sm" }) => {
  const key = String(channel || "").toLowerCase()
  const m = CHANNEL_META[key] || CHANNEL_META.sms
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{
        background: m.bg,
        color: m.c,
        fontSize: size === "md" ? 11 : 10,
        padding: size === "md" ? "2px 7px" : "1px 5px",
        borderRadius: 999,
        border: `1px solid ${m.c}22`,
        lineHeight: 1.3,
      }}
    >
      {m.label}
    </span>
  )
}

// ── Helpers ────────────────────────────────────────────────

const groupByDay = (events) => {
  if (!events.length) return []
  const groups = []
  let currentKey = null
  let currentLabel = null
  let currentList = []
  events.forEach((e) => {
    const d = new Date(e.timestamp)
    if (isNaN(d)) return
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (key !== currentKey) {
      if (currentList.length) groups.push({ label: currentLabel, events: currentList })
      currentKey = key
      currentLabel = labelForDay(d)
      currentList = []
    }
    currentList.push(e)
  })
  if (currentList.length) groups.push({ label: currentLabel, events: currentList })
  return groups
}

const labelForDay = (d) => {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return "Today"
  if (sameDay(d, yesterday)) return "Yesterday"
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

const formatRelative = (iso) => {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d)) return "—"
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default CommunicationsV2
