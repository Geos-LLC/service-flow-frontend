"use client"

import React, { useState, useMemo, useRef, useEffect } from "react"
import { formatTime as formatTimeShared } from "../utils/formatTime"
import { useNavigate } from "react-router-dom"
import {
  Search, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing,
  Mail, MessageSquare, MessageCircle, Star, ThumbsUp,
  Info, Send, Paperclip, FileText, Smile, ChevronDown,
  Archive, CheckCheck, Trash2, Plus, Calendar, Briefcase,
  User, Users, Tag, Clock, ArrowLeft, MoreVertical, X, Image, ExternalLink,
  AlertCircle, RefreshCw, Loader2, Download
} from "lucide-react"
import { useAuth } from "../context/AuthContext"
import Sidebar from "../components/sidebar"
import MobileHeader from "../components/mobile-header"
import api, { communicationsAPI, openPhoneAPI, whatsappAPI, territoriesAPI, connectedEmailAPI } from "../services/api"

// ═══════════════════════════════════════════════════════════════
// Channel configuration
// ═══════════════════════════════════════════════════════════════

const CHANNELS = {
  yelp:       { label: 'Yelp',       color: 'bg-red-100 text-red-700',       Icon: Star },
  thumbtack:  { label: 'Thumbtack',  color: 'bg-green-100 text-green-700',   Icon: ThumbsUp },
  openphone:  { label: 'OpenPhone',  color: 'bg-blue-100 text-blue-700',     Icon: Phone },
  call:       { label: 'Call',       color: 'bg-purple-100 text-purple-700', Icon: PhoneCall },
  email:      { label: 'Email',      color: 'bg-yellow-100 text-yellow-700', Icon: Mail },
  whatsapp:   { label: 'WhatsApp',   color: 'bg-emerald-100 text-emerald-700', Icon: MessageCircle },
  messenger:  { label: 'Messenger',  color: 'bg-indigo-100 text-indigo-700', Icon: MessageSquare },
  system:     { label: 'System',     color: 'bg-gray-100 text-gray-500',     Icon: Info },
}

// ═══════════════════════════════════════════════════════════════
// Mock data
// ═══════════════════════════════════════════════════════════════

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-1', leadId: 'lead-1', displayName: 'Sarah Johnson',
    fallbackIdentifier: '(555) 123-4567',
    lastPreview: 'Thanks for the quick response! When can you come by?',
    lastEventAt: '2026-04-02T14:30:00Z', unreadCount: 2,
    channels: ['yelp', 'openphone', 'call'], isArchived: false,
  },
  {
    id: 'conv-2', leadId: 'lead-2', displayName: 'Mike Rodriguez',
    fallbackIdentifier: '(555) 234-5678',
    lastPreview: 'Can I get a quote for deep cleaning?',
    lastEventAt: '2026-04-02T11:00:00Z', unreadCount: 1,
    channels: ['thumbtack'], isArchived: false,
  },
  {
    id: 'conv-3', leadId: 'lead-3', displayName: 'Emily Chen',
    fallbackIdentifier: 'emily.chen@gmail.com',
    lastPreview: 'Call completed - discussed weekly cleaning schedule',
    lastEventAt: '2026-04-01T16:45:00Z', unreadCount: 0,
    channels: ['openphone', 'call', 'email'], isArchived: false,
  },
  {
    id: 'conv-4', leadId: 'lead-4', displayName: 'David Kim',
    fallbackIdentifier: '(555) 345-6789',
    lastPreview: 'I need to reschedule my appointment',
    lastEventAt: '2026-04-01T09:20:00Z', unreadCount: 0,
    channels: ['openphone'], isArchived: false,
  },
  {
    id: 'conv-5', leadId: 'lead-5', displayName: 'Anna Martinez',
    fallbackIdentifier: '(555) 456-7890',
    lastPreview: 'Auto-reply sent via LeadBridge',
    lastEventAt: '2026-03-31T18:00:00Z', unreadCount: 0,
    channels: ['yelp', 'openphone'], isArchived: false,
  },
  {
    id: 'conv-6', leadId: null, displayName: '',
    fallbackIdentifier: '(555) 999-0000',
    lastPreview: 'Missed call',
    lastEventAt: '2026-03-31T12:00:00Z', unreadCount: 1,
    channels: ['call'], isArchived: false,
  },
]

const MOCK_DETAILS = {
  'conv-1': {
    events: [
      { id: 'e1', conversationId: 'conv-1', channel: 'yelp', type: 'message_in', senderRole: 'customer', text: 'Hi, I found you on Yelp. I need a house cleaning for my 3BR apartment this week. Are you available?', timestamp: '2026-04-01T10:00:00Z' },
      { id: 'e2', conversationId: 'conv-1', channel: 'system', type: 'system', senderRole: 'system', text: 'Lead created from Yelp request', timestamp: '2026-04-01T10:00:05Z' },
      { id: 'e3', conversationId: 'conv-1', channel: 'yelp', type: 'message_out', senderRole: 'agent', text: 'Thanks for reaching out! We have availability this Thursday and Friday. Which works better for you?', timestamp: '2026-04-01T10:15:00Z' },
      { id: 'e4', conversationId: 'conv-1', channel: 'openphone', type: 'message_out', senderRole: 'agent', text: 'Hi Sarah, following up via text. Let me know if Thursday or Friday works for the cleaning!', timestamp: '2026-04-01T14:00:00Z' },
      { id: 'e5', conversationId: 'conv-1', channel: 'call', type: 'call_out', senderRole: 'agent', text: 'Outbound call', timestamp: '2026-04-01T16:00:00Z', callDurationSeconds: 260 },
      { id: 'e6', conversationId: 'conv-1', channel: 'openphone', type: 'message_in', senderRole: 'customer', text: 'Thanks for the quick response! When can you come by? Thursday works great.', timestamp: '2026-04-02T14:30:00Z' },
    ],
    availableSendChannels: ['openphone', 'yelp', 'email'],
    lead: { id: 'lead-1', name: 'Sarah Johnson', phone: '(555) 123-4567', email: 'sarah.j@example.com', source: 'Yelp', tags: ['Residential', 'Priority'], status: 'Qualified' },
  },
  'conv-2': {
    events: [
      { id: 'e10', conversationId: 'conv-2', channel: 'thumbtack', type: 'message_in', senderRole: 'customer', text: 'Can I get a quote for deep cleaning? I have a 4-bedroom house, about 2500 sqft.', timestamp: '2026-04-02T11:00:00Z' },
      { id: 'e11', conversationId: 'conv-2', channel: 'system', type: 'system', senderRole: 'system', text: 'Lead created from Thumbtack request', timestamp: '2026-04-02T11:00:02Z' },
    ],
    availableSendChannels: ['thumbtack', 'openphone'],
    lead: { id: 'lead-2', name: 'Mike Rodriguez', phone: '(555) 234-5678', email: null, source: 'Thumbtack', tags: ['Deep Clean'], status: 'New' },
  },
  'conv-3': {
    events: [
      { id: 'e20', conversationId: 'conv-3', channel: 'email', type: 'message_in', senderRole: 'customer', text: 'Hi, I would like to set up weekly cleaning. Can we discuss pricing?', timestamp: '2026-03-30T09:00:00Z' },
      { id: 'e21', conversationId: 'conv-3', channel: 'email', type: 'message_out', senderRole: 'agent', text: 'Hi Emily, thanks for your interest! Our weekly cleaning starts at $150. I can call you to discuss details.', timestamp: '2026-03-30T10:30:00Z' },
      { id: 'e22', conversationId: 'conv-3', channel: 'openphone', type: 'message_out', senderRole: 'agent', text: 'Hi Emily, it\'s us from the cleaning company. Would you be free for a quick call this afternoon?', timestamp: '2026-03-31T13:00:00Z' },
      { id: 'e23', conversationId: 'conv-3', channel: 'openphone', type: 'message_in', senderRole: 'customer', text: 'Sure, call me anytime after 3pm!', timestamp: '2026-03-31T13:15:00Z' },
      { id: 'e24', conversationId: 'conv-3', channel: 'call', type: 'call_out', senderRole: 'agent', text: 'Call completed - discussed weekly cleaning schedule', timestamp: '2026-04-01T16:45:00Z', callDurationSeconds: 480 },
    ],
    availableSendChannels: ['openphone', 'email'],
    lead: { id: 'lead-3', name: 'Emily Chen', phone: '(555) 345-0001', email: 'emily.chen@gmail.com', source: 'Website', tags: ['Recurring', 'Residential'], status: 'Qualified' },
  },
  'conv-4': {
    events: [
      { id: 'e30', conversationId: 'conv-4', channel: 'openphone', type: 'message_in', senderRole: 'customer', text: 'I need to reschedule my appointment from Wednesday to Friday if possible.', timestamp: '2026-04-01T09:20:00Z' },
    ],
    availableSendChannels: ['openphone'],
    lead: { id: 'lead-4', name: 'David Kim', phone: '(555) 345-6789', email: 'david.k@example.com', source: 'Referral', tags: [], status: 'Customer' },
  },
  'conv-5': {
    events: [
      { id: 'e40', conversationId: 'conv-5', channel: 'yelp', type: 'message_in', senderRole: 'customer', text: 'Do you serve the downtown area? I live on 5th street.', timestamp: '2026-03-31T17:50:00Z' },
      { id: 'e41', conversationId: 'conv-5', channel: 'system', type: 'system', senderRole: 'system', text: 'Auto-reply sent via LeadBridge', timestamp: '2026-03-31T17:50:03Z' },
      { id: 'e42', conversationId: 'conv-5', channel: 'yelp', type: 'message_out', senderRole: 'agent', text: 'Hi Anna! Yes, we service the downtown area. We\'d love to help you out!', timestamp: '2026-03-31T18:00:00Z' },
    ],
    availableSendChannels: ['yelp', 'openphone'],
    lead: { id: 'lead-5', name: 'Anna Martinez', phone: '(555) 456-7890', email: null, source: 'Yelp', tags: ['Downtown'], status: 'New' },
  },
  'conv-6': {
    events: [
      { id: 'e50', conversationId: 'conv-6', channel: 'call', type: 'call_in', senderRole: 'customer', text: 'Missed call', timestamp: '2026-03-31T12:00:00Z', callDurationSeconds: 0 },
    ],
    availableSendChannels: ['openphone'],
    lead: null,
  },
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function relativeTime(dateStr) {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimestamp(dateStr) {
  const d = new Date(dateStr)
  return formatTimeShared(d)
}

function formatCallDuration(seconds) {
  if (!seconds) return 'No answer'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function getDateLabel(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// WhatsApp-style avatar colors — matches WhatsApp's contact color scheme
const AVATAR_COLORS = [
  { bg: '#25D366', text: '#FFFFFF' }, // whatsapp green
  { bg: '#128C7E', text: '#FFFFFF' }, // whatsapp teal
  { bg: '#075E54', text: '#FFFFFF' }, // whatsapp dark teal
  { bg: '#34B7F1', text: '#FFFFFF' }, // whatsapp light blue
  { bg: '#00A884', text: '#FFFFFF' }, // whatsapp sea green
  { bg: '#FF6B6B', text: '#FFFFFF' }, // coral red
  { bg: '#7C4DFF', text: '#FFFFFF' }, // purple
  { bg: '#FF7043', text: '#FFFFFF' }, // deep orange
  { bg: '#26A69A', text: '#FFFFFF' }, // teal
  { bg: '#5C6BC0', text: '#FFFFFF' }, // indigo
  { bg: '#EC407A', text: '#FFFFFF' }, // pink
  { bg: '#42A5F5', text: '#FFFFFF' }, // blue
  { bg: '#66BB6A', text: '#FFFFFF' }, // green
  { bg: '#FFA726', text: '#FFFFFF' }, // amber
]

// Known source brands with custom styling
const SOURCE_BRANDS = {
  'Thumbtack': { bg: '#E8EAF6', text: '#283593', icon: '📌' },
  'LeadBridge': { bg: '#E3F2FD', text: '#0D47A1', icon: '⚡' },
  'Yelp': { bg: '#FFEBEE', text: '#C62828', icon: '★' },
  'HomeAdvisor': { bg: '#FFF3E0', text: '#E65100', icon: '🏠' },
}

function getAvatarStyle(name, phone) {
  // Check for known source brands
  if (name) {
    for (const [brand, style] of Object.entries(SOURCE_BRANDS)) {
      if (name.toLowerCase().startsWith(brand.toLowerCase())) return style
    }
  }
  // Hash-based color from name or phone
  const str = name || phone || '?'
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Avatar component with image fallback ──
function ConversationAvatar({ conv, size = 40 }) {
  const [imgFailed, setImgFailed] = React.useState(false)
  const style = getAvatarStyle(conv?.displayName, conv?.fallbackIdentifier)
  const isBrand = conv?.displayName && SOURCE_BRANDS[Object.keys(SOURCE_BRANDS).find(b => conv.displayName.toLowerCase().startsWith(b.toLowerCase()))]
  const isGroup = conv?.isGroup
  const avatarUrl = conv?.avatarUrl
  const sizeClass = size >= 48 ? 'w-16 h-16' : 'w-10 h-10'
  const textSize = size >= 48 ? 'text-xl font-bold' : 'text-sm font-semibold'
  const iconSize = size >= 48 ? 28 : 18

  if (isGroup) {
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center bg-violet-100 text-violet-600`}>
        <Users size={iconSize} />
      </div>
    )
  }

  if (avatarUrl && !imgFailed) {
    return (
      <img src={avatarUrl} alt="" className={`${sizeClass} rounded-full object-cover`}
        onError={() => setImgFailed(true)} />
    )
  }

  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center ${textSize}`}
      style={{ backgroundColor: style.bg, color: style.text }}>
      {isBrand ? isBrand.icon : getInitials(conv?.displayName)}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Email body renderer — minimal sanitizer, no external dep.
// Strips <script>, <style>, on* handlers, and javascript: URLs.
// Renders in a sandboxed container with expand/collapse.
// ═══════════════════════════════════════════════════════════════
function sanitizeHtml(html) {
  if (!html) return ''
  let s = String(html)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  s = s.replace(/javascript:/gi, 'blocked:')
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  s = s.replace(/<object[\s\S]*?<\/object>/gi, '')
  s = s.replace(/<embed[\s\S]*?>/gi, '')
  return s
}

function EmailBody({ html, text }) {
  const [expanded, setExpanded] = React.useState(false)
  const preview = (text || '').replace(/\s+/g, ' ').slice(0, 200)

  if (!expanded) {
    return (
      <div className="px-4 py-3">
        <p className="text-sm text-[var(--sf-text-secondary)] line-clamp-2">{preview || '(no preview)'}</p>
        {(html || (text && text.length > 200)) && (
          <button onClick={() => setExpanded(true)} className="mt-2 text-xs font-medium text-[var(--sf-blue-500)] hover:underline">
            Show more
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="px-4 py-3">
      {html ? (
        <div className="email-body text-sm text-[var(--sf-text-primary)] prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
      ) : (
        <pre className="text-sm text-[var(--sf-text-primary)] whitespace-pre-wrap font-sans">{text || ''}</pre>
      )}
      <button onClick={() => setExpanded(false)} className="mt-2 text-xs font-medium text-[var(--sf-blue-500)] hover:underline">
        Show less
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════

function ChannelBadge({ channel, size = 14 }) {
  const ch = CHANNELS[channel]
  if (!ch) return null
  const { Icon, color } = ch
  return (
    <span className={`inline-flex items-center justify-center rounded-full p-0.5 ${color}`} title={ch.label}>
      <Icon size={size} />
    </span>
  )
}

function EmptyState({ icon: IconComp, title, subtitle }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        {IconComp && <IconComp size={48} className="mx-auto mb-4 text-gray-300" />}
        <h3 className="text-lg font-semibold text-[var(--sf-text-primary)] mb-1">{title}</h3>
        {subtitle && <p className="text-sm text-[var(--sf-text-muted)]">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Conversation List Item ──
function ConversationRow({ conv, isSelected, onClick }) {
  const name = conv.displayName || conv.fallbackIdentifier || 'Unknown'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex gap-3 transition-colors border-l-2 ${
        isSelected
          ? 'bg-[var(--sf-bg-active)] border-[var(--sf-blue-500)]'
          : 'border-transparent hover:bg-[var(--sf-bg-hover)]'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <ConversationAvatar conv={conv} size={40} />
        {conv.endpointSymbol && (
          <span className="absolute -bottom-0.5 -right-0.5 text-xs" title={conv.endpointPhone}>
            {conv.endpointSymbol}
          </span>
        )}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-[var(--sf-text-primary)]' : 'font-medium text-[var(--sf-text-primary)]'}`}>
              {name}
            </span>
            {/* Company / lead source badge (from OpenPhone contact) */}
            {conv.company && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 flex-shrink-0 truncate max-w-[120px]"
                title={`Source: ${conv.company}`}>
                {conv.company}
              </span>
            )}
            {/* Location badge (primary) + account tooltip (secondary) */}
            {conv.provider === 'leadbridge' && (
              conv.locationName ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0 truncate max-w-[100px]"
                  title={conv.accountName ? `Account: ${conv.accountName}` : undefined}>
                  {conv.locationName}
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 flex-shrink-0"
                  title={conv.accountName ? `Account: ${conv.accountName}` : undefined}>
                  Unassigned
                </span>
              )
            )}
          </div>
          <span className="text-[10px] text-[var(--sf-text-muted)] flex-shrink-0 ml-2">{relativeTime(conv.lastEventAt)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-xs truncate flex items-center gap-1 ${conv.unreadCount > 0 ? 'text-[var(--sf-text-secondary)]' : 'text-[var(--sf-text-muted)]'}`}>
            {/📞/.test(conv.lastPreview || '') && (
              <PhoneCall size={11} className="flex-shrink-0 text-purple-500" />
            )}
            <span className="truncate">{conv.lastPreview}</span>
          </span>
          {conv.unreadCount > 0 && (
            <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full bg-[var(--sf-blue-500)] text-white text-[10px] font-bold flex items-center justify-center">
              {conv.unreadCount}
            </span>
          )}
        </div>
        {/* Channel badges */}
        <div className="flex gap-1 mt-1">
          {conv.channels.map(ch => <ChannelBadge key={ch} channel={ch} size={12} />)}
        </div>
      </div>
    </button>
  )
}

// ── WhatsApp media (new contract) ──
const MEDIA_STATUS_MESSAGES = {
  skipped_too_large: 'File too large (>5 MB)',
  unsupported_store_message: 'Media unavailable for this chat',
  not_found: 'Media unavailable',
  failed: 'Media unavailable',
}

function MediaPlaceholder({ icon: Icon = AlertCircle, label, onRetry }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sf-bg-input)] border border-[var(--sf-border-light)] text-xs text-[var(--sf-text-muted)] max-w-[280px]">
      <Icon size={14} className="flex-shrink-0 opacity-70" />
      <span className="flex-1 truncate">{label}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex-shrink-0 p-1 rounded hover:bg-black/5 text-[var(--sf-text-primary)]"
          title="Retry"
        >
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  )
}

function stripApiPrefix(url) {
  // backend returns /api/..., axios baseURL already ends in /api — strip to avoid double prefix
  if (!url) return url
  return url.startsWith('/api/') ? url.slice(4) : url
}

function AuthedMedia({ url, type, mimetype, filename }) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let localUrl = null
    setState('loading')
    setObjectUrl(null)

    api.get(stripApiPrefix(url), { responseType: 'blob' })
      .then(({ data }) => {
        if (!active) return
        // Prefer blob's own type; fall back to declared mimetype
        const blob = (mimetype && data.type !== mimetype)
          ? new Blob([data], { type: mimetype })
          : data
        localUrl = URL.createObjectURL(blob)
        setObjectUrl(localUrl)
        setState('ready')
      })
      .catch(() => {
        if (!active) return
        setState('error')
      })

    return () => {
      active = false
      if (localUrl) URL.revokeObjectURL(localUrl)
    }
  }, [url, mimetype, attempt])

  const retry = () => setAttempt(a => a + 1)

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sf-bg-input)] border border-[var(--sf-border-light)] text-xs text-[var(--sf-text-muted)] max-w-[280px]">
        <Loader2 size={14} className="animate-spin opacity-70" />
        <span>Loading…</span>
      </div>
    )
  }
  if (state === 'error' || !objectUrl) {
    return <MediaPlaceholder label="Media unavailable" onRetry={retry} />
  }

  if (type === 'image') {
    return (
      <a href={objectUrl} target="_blank" rel="noopener noreferrer">
        <img src={objectUrl} alt={filename || ''} className="max-w-[240px] max-h-[280px] rounded-xl object-cover border border-[var(--sf-border-light)]" />
      </a>
    )
  }
  if (type === 'video') {
    return <video src={objectUrl} controls className="max-w-[280px] max-h-[320px] rounded-xl border border-[var(--sf-border-light)]" />
  }
  if (type === 'audio') {
    return <audio src={objectUrl} controls className="max-w-[280px]" />
  }
  // document (or unknown): download link
  return (
    <a
      href={objectUrl}
      download={filename || 'download'}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sf-bg-input)] border border-[var(--sf-border-light)] text-xs text-[var(--sf-text-primary)] hover:bg-black/5 max-w-[280px]"
    >
      <Download size={14} />
      <span className="flex-1 truncate">{filename || 'Download attachment'}</span>
    </a>
  )
}

function WhatsAppMedia({ event }) {
  const status = event.mediaStatus
  const url = event.mediaUrl

  // Non-downloaded states: surface mediaStatus with placeholder
  if (status && status !== 'downloaded') {
    const label = MEDIA_STATUS_MESSAGES[status] || 'Media unavailable'
    const retryable = status === 'not_found' || status === 'failed'
    // retryable statuses still have a URL — force a fresh AuthedMedia mount on retry
    return retryable && url
      ? <AuthedMedia url={url} type={event.mediaType} mimetype={event.mediaMimetype} filename={event.mediaFilename} />
      : <MediaPlaceholder label={label} />
  }

  // Media present but no URL (missing sigcore_message_id) — log contract violation
  if (!url) {
    return <MediaPlaceholder label="Media unavailable" />
  }

  return <AuthedMedia url={url} type={event.mediaType} mimetype={event.mediaMimetype} filename={event.mediaFilename} />
}

// ── Timeline Event ──
function TimelineEvent({ event }) {
  const ch = CHANNELS[event.channel]

  // System event
  if (event.type === 'system') {
    return (
      <div className="flex items-center gap-3 py-2 px-4">
        <div className="flex-1 border-t border-[var(--sf-border-light)]" />
        <span className="text-[11px] text-[var(--sf-text-muted)] flex items-center gap-1.5 whitespace-nowrap">
          <Info size={12} /> {event.text}
        </span>
        <div className="flex-1 border-t border-[var(--sf-border-light)]" />
      </div>
    )
  }

  // Call event
  if (event.type === 'call_in' || event.type === 'call_out') {
    const isInbound = event.type === 'call_in'
    const CallIcon = isInbound ? PhoneIncoming : PhoneOutgoing
    const audioUrl = event.recordingUrl || event.voicemailUrl
    return (
      <div className="flex justify-center py-2 px-4">
        <div className="inline-flex flex-col items-center gap-1.5">
          <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 rounded-full px-4 py-1.5 text-xs">
            <CallIcon size={14} />
            <span className="font-medium">
              {event.voicemailUrl ? 'Voicemail' : isInbound ? 'Inbound call' : 'Outbound call'}
            </span>
            <span className="text-purple-500">{formatCallDuration(event.callDurationSeconds)}</span>
            <span className="text-purple-400">{formatTimestamp(event.timestamp)}</span>
          </div>
          {audioUrl && (
            <audio controls preload="none" className="h-8 w-64">
              <source src={audioUrl} />
            </audio>
          )}
          {event.transcription && (
            <div className="max-w-sm text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2 italic">
              "{event.transcription}"
            </div>
          )}
        </div>
      </div>
    )
  }

  // Email message — full-width card with subject header + sanitized html body.
  if (event.channel === 'email') {
    const isOutbound = event.type === 'message_out' || event.direction === 'outbound'
    const subject = event.email_subject || event.subject
    const from = event.from_email
    const to = event.to_email
    return (
      <div className="px-4 py-2">
        <div className={`border border-[var(--sf-border-light)] rounded-xl bg-white overflow-hidden ${isOutbound ? 'ml-8' : 'mr-8'}`}>
          <div className="px-4 py-2 border-b border-[var(--sf-border-light)] bg-[var(--sf-bg-input)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ChannelBadge channel="email" size={12} />
                <span className="text-xs font-semibold text-[var(--sf-text-primary)] truncate">{subject || '(no subject)'}</span>
              </div>
              <span className="text-[10px] text-[var(--sf-text-muted)] flex-shrink-0">{formatTimestamp(event.timestamp)}</span>
            </div>
            <div className="text-[11px] text-[var(--sf-text-muted)] mt-0.5 truncate">
              {isOutbound ? `To: ${to || '—'}` : `From: ${from || '—'}`}
            </div>
          </div>
          <EmailBody html={event.body_html} text={event.body_text || event.text || event.body} />
        </div>
      </div>
    )
  }

  // Message bubble
  const isOutbound = event.type === 'message_out'
  const legacyMediaUrls = event.mediaUrls || []
  // Priority: new WhatsApp contract → legacy OpenPhone mediaUrls → text-only
  const hasNewMedia = !!event.hasMedia
  return (
    <div className={`flex px-4 py-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isOutbound ? 'order-1' : ''}`}>
        {hasNewMedia ? (
          <div className={`mb-1 ${isOutbound ? 'flex justify-end' : ''}`}>
            <WhatsAppMedia event={event} />
          </div>
        ) : legacyMediaUrls.length > 0 ? (
          <div className={`flex flex-wrap gap-1.5 mb-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
            {legacyMediaUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="max-w-[240px] max-h-[200px] rounded-xl object-cover border border-[var(--sf-border-light)]" />
              </a>
            ))}
          </div>
        ) : null}
        {!event.text && !hasNewMedia && legacyMediaUrls.length === 0 && (
          <a href="https://my.openphone.com" target="_blank" rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm ${
              isOutbound
                ? 'bg-[var(--sf-blue-500)] text-white/80 rounded-br-md'
                : 'bg-[var(--sf-bg-input)] text-[var(--sf-text-muted)] border border-[var(--sf-border-light)] rounded-bl-md'
            }`}>
            <Image size={16} />
            <span>MMS Attachment</span>
            <ExternalLink size={12} className="opacity-60" />
          </a>
        )}
        {event.text && (
          <div className={`rounded-2xl px-4 py-2.5 text-sm ${
            isOutbound
              ? 'bg-[var(--sf-blue-500)] text-white rounded-br-md'
              : 'bg-[var(--sf-bg-input)] text-[var(--sf-text-primary)] border border-[var(--sf-border-light)] rounded-bl-md'
          }`}>
            {event.text}
          </div>
        )}
        <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <ChannelBadge channel={event.channel} size={11} />
          <span className="text-[10px] text-[var(--sf-text-muted)]">{formatTimestamp(event.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Composer with channel tabs ──
function Composer({ availableChannels, sendChannel, setSendChannel, text, setText, onSend, channelFilter, onChannelFilter, channelUnread, emailSubject, onEmailSubjectChange, endpointEmail }) {
  const sourceTabs = [
    { key: 'all', label: 'All', Icon: MessageSquare },
    { key: 'openphone', label: 'OpenPhone', Icon: Phone },
    ...availableChannels.filter(c => c === 'thumbtack' || c === 'yelp' || c === 'whatsapp' || c === 'email').map(c => {
      const ch = CHANNELS[c]
      return ch ? { key: c, label: ch.label, Icon: ch.Icon } : null
    }).filter(Boolean),
  ]
  const isEmail = sendChannel === 'email'

  return (
    <div className="border-t border-[var(--sf-border-light)] bg-white">
      {/* Source tabs — All shows everything, others filter by channel */}
      <div className="flex border-b border-[var(--sf-border-light)] px-3 pt-1">
        {sourceTabs.map(tab => {
          const isActive = (channelFilter || 'all') === tab.key
          const unread = tab.key === 'all'
            ? Object.values(channelUnread || {}).reduce((s, n) => s + n, 0)
            : (channelUnread || {})[tab.key] || 0
          return (
            <button key={tab.key} onClick={() => {
              onChannelFilter(tab.key === 'all' ? null : tab.key)
              if (tab.key !== 'all') setSendChannel(tab.key)
            }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[var(--sf-blue-500)] text-[var(--sf-blue-500)]'
                  : 'border-transparent text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)]'
              }`}>
              <tab.Icon size={13} /> {tab.label}
              {unread > 0 && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {/* Email subject + mailbox indicator (only for email channel) */}
      {isEmail && (
        <div className="px-3 pt-2 space-y-1">
          {endpointEmail && (
            <div className="text-[11px] text-[var(--sf-text-muted)]">Sending from: <span className="font-medium">{endpointEmail}</span></div>
          )}
          <input
            value={emailSubject || ''}
            onChange={e => onEmailSubjectChange && onEmailSubjectChange(e.target.value)}
            placeholder="Subject"
            className="w-full border border-[var(--sf-border-light)] rounded-lg px-3 py-1.5 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
          />
        </div>
      )}
      {/* Input row */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex gap-1 pb-1.5">
          <button className="p-1.5 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] rounded" title="Attach file">
            <Paperclip size={18} />
          </button>
          <button className="p-1.5 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-secondary)] rounded" title="Templates">
            <FileText size={18} />
          </button>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Send via ${CHANNELS[sendChannel]?.label || 'message'}...`}
          rows={1}
          className="flex-1 resize-none border border-[var(--sf-border-light)] rounded-lg px-3 py-2 text-sm bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)] focus:border-[var(--sf-blue-500)]"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        />
        <button onClick={onSend} disabled={!text.trim()}
          className="p-2.5 rounded-lg bg-[var(--sf-blue-500)] text-white hover:bg-[var(--sf-blue-600)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}

// ── Lead Context Panel ──
function LeadPanel({ lead, conversation }) {
  const navigate = useNavigate()
  const displayName = lead?.name || conversation?.displayName || ''
  const phone = lead?.phone || conversation?.participantPhone || ''
  const email = lead?.email || ''
  const style = getAvatarStyle(displayName, phone)

  return (
    <div className="p-4 space-y-5">
      {/* Contact header — always shown */}
      <div className="text-center">
        <div className="mx-auto mb-3">
          <ConversationAvatar conv={conversation} size={64} />
        </div>
        <h3 className="text-base font-bold text-[var(--sf-text-primary)]">{displayName || 'Unknown'}</h3>
        {phone && <p className="text-sm text-[var(--sf-text-muted)] mt-0.5">{phone}</p>}
      </div>

      {/* Contact details */}
      <div className="space-y-2 text-sm">
        {phone && (
          <div className="flex items-center gap-2 text-[var(--sf-text-secondary)]">
            <Phone size={14} className="text-[var(--sf-text-muted)]" /> {phone}
          </div>
        )}
        {email && (
          <div className="flex items-center gap-2 text-[var(--sf-text-secondary)]">
            <Mail size={14} className="text-[var(--sf-text-muted)]" /> {email}
          </div>
        )}
        {(lead?.source || conversation?.company) && (
          <div className="flex items-center gap-2 text-[var(--sf-text-secondary)]">
            <Info size={14} className="text-[var(--sf-text-muted)]" /> Source: {lead?.source || conversation?.company}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex flex-wrap gap-1.5">
        {lead?.status ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sf-blue-50)] text-[var(--sf-blue-500)] font-medium">{lead.status}</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">No lead linked</span>
        )}
        {(lead?.tags || []).map(t => (
          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[var(--sf-text-secondary)]">{t}</span>
        ))}
      </div>

      {/* Quick actions — always shown */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase mb-2">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            ...(lead?.entityType === 'customer' ? [
              { icon: User, label: 'Open Customer', action: () => navigate(`/customer/${lead.id}`) },
              { icon: Briefcase, label: 'Create Job', action: () => navigate(`/jobs?customerId=${lead.id}`) },
            ] : lead?.entityType === 'lead' ? [
              { icon: User, label: 'Open Lead', action: () => navigate('/opportunities') },
              { icon: Briefcase, label: 'Create Job', action: () => navigate('/jobs') },
            ] : [
              { icon: User, label: 'View Leads', action: () => navigate('/opportunities') },
              { icon: Star, label: 'View Customers', action: () => navigate('/customers') },
            ]),
            { icon: Calendar, label: 'Schedule', action: () => navigate('/schedule') },
            { icon: Plus, label: 'Create Job', action: () => navigate('/jobs') },
          ].map(a => (
            <button key={a.label}
              onClick={a.action}
              className="flex flex-col items-center gap-1 p-3 border border-[var(--sf-border-light)] rounded-lg hover:bg-[var(--sf-bg-hover)] transition-colors text-[var(--sf-text-secondary)]">
              <a.icon size={18} />
              <span className="text-[10px] font-medium text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Placeholder sections */}
      {[
        { title: 'Upcoming Job', content: 'No upcoming jobs' },
        { title: 'Assigned Team Member', content: 'Unassigned' },
        { title: 'Active Workflows', content: 'None' },
      ].map(s => (
        <div key={s.title}>
          <h4 className="text-xs font-semibold text-[var(--sf-text-muted)] uppercase mb-1.5">{s.title}</h4>
          <p className="text-xs text-[var(--sf-text-muted)]">{s.content}</p>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════

const Communications = () => {
  const { user } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState('recents')
  const [channelFilter, setChannelFilter] = useState(null) // null = all, 'openphone', 'thumbtack', 'yelp'
  const [channelUnread, setChannelUnread] = useState({}) // { openphone: 2, thumbtack: 1, yelp: 0 }
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [sendChannel, setSendChannel] = useState(null)
  const [composerText, setComposerText] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [mobileView, setMobileView] = useState('list')
  const [showLeadPanel, setShowLeadPanel] = useState(false)
  const [locationFilter, setLocationFilter] = useState(null) // null = all, 'unassigned', or location id
  const [emailFolder, setEmailFolder] = useState('inbox') // 'inbox' | 'archived' | 'all'
  const [emailMailboxFilter, setEmailMailboxFilter] = useState(null) // null = all, or mailbox email
  const [sfLocations, setSfLocations] = useState([]) // [{id, name, shortName}]
  const timelineEndRef = useRef(null)
  const timelineScrollRef = useRef(null)

  // Real data state
  const [conversations, setConversations] = useState([])
  const [detail, setDetail] = useState(null)
  const [isConnected, setIsConnected] = useState(null) // null = loading, true/false = known
  const [convLoading, setConvLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const whatsappSeenRef = useRef(false) // sticky: once WhatsApp convos are seen, tab stays
  const [connectedEmailAccounts, setConnectedEmailAccounts] = useState([])

  const selectedConv = conversations.find(c => String(c.id) === String(selectedId))
  const hasConnectedEmail = connectedEmailAccounts.some(a => a.status === 'connected')
  // Show WhatsApp tab if connected OR if WhatsApp conversations were ever seen this session
  if (conversations.some(c => c.channel === 'whatsapp' || c.provider === 'whatsapp')) {
    whatsappSeenRef.current = true
  }
  const availableChannels = [
    'openphone',
    'thumbtack',
    'yelp',
    ...(whatsappConnected || whatsappSeenRef.current ? ['whatsapp'] : []),
    ...(hasConnectedEmail ? ['email'] : []),
  ]
  // Endpoint email for the currently selected conversation (if it's an email thread)
  const selectedConvEndpointEmail = detail?.conversation?.endpoint_email
    || (selectedConv?.channel === 'email' ? selectedConv?.endpoint_email : null)

  // Check connection status + load conversations + load provider accounts
  useEffect(() => {
    if (!user?.id) return
    // Load territories as locations for dropdown
    territoriesAPI.getAll(user?.id, { status: 'active', limit: 100 }).then(data => {
      // territoriesAPI returns { territories: [...] } or array directly
      const territories = data?.territories || data || []
      setSfLocations(territories.map(t => ({ id: t.id, name: t.name })))
    }).catch(() => {})

    openPhoneAPI.getStatus().then(status => {
      setIsConnected(status.connected)
      if (status.connected) loadConversations()
      else {
        // Use mock data when not connected
        setConversations(MOCK_CONVERSATIONS)
        setIsConnected(false)
      }
    }).catch(() => {
      setConversations(MOCK_CONVERSATIONS)
      setIsConnected(false)
    })

    // Check WhatsApp connection
    whatsappAPI.getStatus().then(s => setWhatsappConnected(s.connected || false)).catch(() => {})

    // Load connected email accounts to enable the Email tab / composer.
    connectedEmailAPI.listAccounts()
      .then(data => setConnectedEmailAccounts(data.accounts || []))
      .catch(() => setConnectedEmailAccounts([]))
  }, [user?.id])

  const loadConversations = async (filter, search, channel, locId) => {
    try {
      setConvLoading(true)
      const data = await communicationsAPI.getConversations({
        filter: filter || (activeFilter === 'unread' ? 'unread' : undefined),
        search,
        channel: channel !== undefined ? channel : channelFilter,
        locationId: locId !== undefined ? locId : locationFilter,
      })
      setConversations(data.conversations || [])
      if (data.channelUnread) setChannelUnread(data.channelUnread)
    } catch (e) {
      console.error('Failed to load conversations:', e)
      setConversations(MOCK_CONVERSATIONS) // fallback
    } finally {
      setConvLoading(false)
    }
  }

  // Reload on filter/search change (only when connected)
  useEffect(() => {
    if (isConnected) loadConversations(activeFilter === 'unread' ? 'unread' : undefined, searchQuery || undefined, channelFilter, locationFilter)
  }, [activeFilter, searchQuery, channelFilter, locationFilter, isConnected])

  // Light refresh: conversation list only, every 10s (webhooks update the DB, this refreshes the UI)
  // Preserves current channel filter — doesn't reset to "all"
  useEffect(() => {
    if (!isConnected) return
    const refresh = () => loadConversations(
      activeFilter === 'unread' ? 'unread' : undefined,
      searchQuery || undefined,
      channelFilter,
      locationFilter
    )
    const interval = setInterval(refresh, 10000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [isConnected, activeFilter, searchQuery, channelFilter, locationFilter])

  // Load conversation detail when selected
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    // Clear stale detail immediately — avoids showing previous conversation's messages
    setDetail(null)
    if (!isConnected) {
      setDetail(MOCK_DETAILS[selectedId] || null)
      return
    }
    setDetailLoading(true)
    // Capture current selectedId so we can guard against stale fetch results
    const fetchingId = selectedId
    // Load more messages up front (100) — matches WhatsApp Web behaviour and avoids empty appearance
    communicationsAPI.getConversation(selectedId, { limit: 100 }).then(data => {
      // Guard: if user switched conversations mid-fetch, ignore this response
      if (fetchingId !== selectedId) return
      setDetail(data)
      // Update local unread count + recalculate channel badges immediately
      setConversations(prev => {
        const updated = prev.map(c =>
          String(c.id) === String(selectedId) ? { ...c, unreadCount: 0 } : c
        )
        // Recalculate channel unread from local state (instant, no server round-trip)
        const counts = {}
        for (const c of updated) {
          if (c.unreadCount > 0) {
            const key = c.provider === 'openphone' ? 'openphone' : c.channel
            counts[key] = (counts[key] || 0) + 1
          }
        }
        setChannelUnread(counts)
        return updated
      })
    }).catch(e => {
      if (fetchingId !== selectedId) return
      console.error('Failed to load conversation:', e)
      setDetail(null)
    }).finally(() => {
      if (fetchingId === selectedId) setDetailLoading(false)
    })
  }, [selectedId, isConnected])

  // Load older messages (infinite scroll)
  const loadMore = async () => {
    if (!detail?.hasMore || !detail?.oldestTimestamp || loadingMore) return
    const el = timelineScrollRef.current
    const prevHeight = el?.scrollHeight || 0
    setLoadingMore(true)
    try {
      const older = await communicationsAPI.getConversation(selectedId, { before: detail.oldestTimestamp, limit: 20 })
      if (older?.events?.length) {
        setDetail(prev => ({
          ...prev,
          events: [...older.events, ...prev.events],
          hasMore: older.hasMore,
          oldestTimestamp: older.oldestTimestamp,
        }))
        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight
        })
      } else {
        setDetail(prev => ({ ...prev, hasMore: false }))
      }
    } catch (e) { console.error('Load more failed:', e) }
    setLoadingMore(false)
  }

  // Auto-scroll timeline to bottom on conversation change
  useEffect(() => {
    if (detail && timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [selectedId])

  // Infinite scroll: load older messages when scrolled to top
  useEffect(() => {
    const el = timelineScrollRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollTop < 50 && detail?.hasMore && !loadingMore) {
        loadMore()
      }
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [detail?.hasMore, detail?.oldestTimestamp, loadingMore])

  // Default send channel = last customer inbound channel
  useEffect(() => {
    if (detail?.events?.length) {
      const lastInbound = [...detail.events].reverse().find(e => e.senderRole === 'customer' && e.channel !== 'system')
      setSendChannel(lastInbound?.channel || detail.availableSendChannels?.[0] || 'openphone')
      // Pre-fill email subject for replies
      const lastEmailWithSubject = [...detail.events].reverse().find(e => e.channel === 'email' && e.email_subject)
      if (lastEmailWithSubject?.email_subject) {
        const subj = lastEmailWithSubject.email_subject
        setEmailSubject(subj.startsWith('Re: ') ? subj : `Re: ${subj}`)
      } else {
        setEmailSubject('')
      }
    }
  }, [selectedId, detail])

  // Filtered conversations (client-side for mock, server-side for real — but still apply for consistency)
  const filteredConversations = useMemo(() => {
    let list = [...conversations]
    if (!isConnected) {
      // Client-side filtering for mock
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        list = list.filter(c =>
          (c.displayName || '').toLowerCase().includes(q) ||
          (c.fallbackIdentifier || '').toLowerCase().includes(q) ||
          (c.lastPreview || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q)
        )
      }
      if (activeFilter === 'unread') list = list.filter(c => c.unreadCount > 0)
    }
    // Email folder filter — applies to all channels (server-synced or mock).
    // Only affects the email tab; if another tab is active the conversations
    // list is already channel-filtered by the server.
    if (channelFilter === 'email') {
      if (emailFolder === 'inbox') list = list.filter(c => !c.isArchived && !c.is_archived)
      else if (emailFolder === 'archived') list = list.filter(c => c.isArchived || c.is_archived)
      // 'all' — no filter
      if (emailMailboxFilter) {
        list = list.filter(c => (c.endpoint_email || '').toLowerCase() === emailMailboxFilter.toLowerCase())
      }
    }
    list.sort((a, b) => new Date(b.lastEventAt) - new Date(a.lastEventAt))
    return list
  }, [conversations, activeFilter, searchQuery, isConnected, channelFilter, emailFolder, emailMailboxFilter])

  // Group events by date for timeline
  const groupedEvents = useMemo(() => {
    if (!detail?.events) return []
    const groups = []
    let currentDate = null
    for (const evt of detail.events) {
      const dateKey = new Date(evt.timestamp).toDateString()
      if (dateKey !== currentDate) {
        currentDate = dateKey
        groups.push({ type: 'date', label: getDateLabel(evt.timestamp), key: dateKey })
      }
      groups.push({ type: 'event', event: evt, key: evt.id })
    }
    return groups
  }, [detail])

  const handleSelectConversation = (id) => {
    setSelectedId(id)
    setComposerText('')
    setMobileView('thread')
    setShowLeadPanel(false)
  }

  const handleSend = async () => {
    if (!composerText.trim()) return
    if (!isConnected) { console.log('Send via', sendChannel, ':', composerText); setComposerText(''); return }
    setSending(true)
    try {
      const payload = { text: composerText.trim(), channel: sendChannel }
      if (sendChannel === 'email' && emailSubject?.trim()) payload.subject = emailSubject.trim()
      const sentMsg = await communicationsAPI.sendMessage(selectedId, payload)
      // Append to local detail
      if (detail) {
        setDetail(prev => ({ ...prev, events: [...(prev?.events || []), sentMsg] }))
      }
      setComposerText('')
      // Refresh conversation list to update preview
      loadConversations()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--sf-bg-page)] flex items-center justify-center">
        <h2 className="text-xl font-bold text-[var(--sf-text-primary)]">Please log in</h2>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--sf-bg-page)] overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* 3-column layout */}
        <div className="flex-1 flex overflow-hidden">

          {/* ═══ LEFT COLUMN: Conversation List ═══ */}
          <div className={`w-full sm:w-80 flex-shrink-0 bg-white border-r border-[var(--sf-border-light)] flex flex-col ${
            mobileView === 'thread' ? 'hidden sm:flex' : 'flex'
          }`}>
            {/* Header */}
            <div className="p-4 border-b border-[var(--sf-border-light)]">
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-lg font-bold text-[var(--sf-text-primary)]">Communications</h1>
                <button className="p-1.5 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] rounded-lg hover:bg-[var(--sf-bg-hover)]" title="New conversation">
                  <Plus size={18} />
                </button>
              </div>
              {/* Filter tabs */}
              <div className="flex gap-1 mb-3">
                {['unread', 'recents', 'all'].map(f => (
                  <button key={f} onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                      activeFilter === f
                        ? 'bg-[var(--sf-blue-500)] text-white'
                        : 'bg-[var(--sf-bg-input)] text-[var(--sf-text-secondary)] hover:bg-[var(--sf-bg-hover)]'
                    }`}>
                    {f}
                    {f === 'unread' && (
                      <span className="ml-1">({conversations.filter(c => c.unreadCount > 0).length})</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Search + (Email only) folder selector */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sf-text-muted)]" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--sf-border-light)] rounded-lg bg-[var(--sf-bg-input)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]"
                  />
                </div>
                {channelFilter === 'email' && (
                  <select
                    value={emailFolder}
                    onChange={e => setEmailFolder(e.target.value)}
                    title="Folder"
                    className="text-xs border border-[var(--sf-border-light)] rounded-lg px-2 py-1.5 bg-white text-[var(--sf-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]">
                    <option value="inbox">📥 Inbox</option>
                    <option value="archived">🗄 Archived</option>
                    <option value="all">All</option>
                  </select>
                )}
              </div>
            </div>

            {/* Location filter — shown on Thumbtack/Yelp when 2+ locations exist */}
            {(channelFilter === 'thumbtack' || channelFilter === 'yelp') && sfLocations.length > 1 && (
              <div className="px-4 pb-2">
                <select value={locationFilter || ''} onChange={e => setLocationFilter(e.target.value || null)}
                  className="w-full text-xs border border-[var(--sf-border-light)] rounded-lg px-2 py-1.5 bg-white text-[var(--sf-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]">
                  <option value="">All Locations</option>
                  {sfLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.shortName || l.name}</option>
                  ))}
                  <option value="unassigned">Unassigned Location</option>
                </select>
              </div>
            )}

            {/* Mailbox filter — shown on Email when 2+ connected mailboxes exist */}
            {channelFilter === 'email' && connectedEmailAccounts.filter(a => a.status === 'connected').length > 1 && (
              <div className="px-4 pb-2">
                <select value={emailMailboxFilter || ''} onChange={e => setEmailMailboxFilter(e.target.value || null)}
                  className="w-full text-xs border border-[var(--sf-border-light)] rounded-lg px-2 py-1.5 bg-white text-[var(--sf-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-blue-500)]">
                  <option value="">All Mailboxes</option>
                  {connectedEmailAccounts.filter(a => a.status === 'connected').map(a => {
                    const addr = a.target_mailbox_email || a.email_address
                    const suffix = a.mailbox_type === 'shared' ? ' (shared)' : ''
                    return <option key={a.id} value={addr}>{addr}{suffix}</option>
                  })}
                </select>
              </div>
            )}

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-[var(--sf-text-muted)]">
                  <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No conversations found</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--sf-border-light)]">
                  {filteredConversations.map(c => (
                    <ConversationRow key={c.id} conv={c} isSelected={c.id === selectedId}
                      onClick={() => handleSelectConversation(c.id)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ═══ CENTER COLUMN: Thread ═══ */}
          <div className={`flex-1 flex flex-col min-w-0 ${
            mobileView === 'list' ? 'hidden sm:flex' : 'flex'
          }`}>
            {!selectedId ? (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState icon={MessageSquare} title="Select a conversation" subtitle="Choose a conversation from the list to view the thread" />
                </div>
                <Composer
                  availableChannels={availableChannels}
                  sendChannel={sendChannel || 'openphone'}
                  setSendChannel={setSendChannel}
                  text={composerText}
                  setText={setComposerText}
                  onSend={() => {}}
                  channelFilter={channelFilter}
                  onChannelFilter={(ch) => { setChannelFilter(ch); setLocationFilter(null) }}
                  channelUnread={channelUnread}
                  emailSubject={emailSubject}
                  onEmailSubjectChange={setEmailSubject}
                  endpointEmail={selectedConvEndpointEmail}
                />
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-[var(--sf-border-light)] bg-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setMobileView('list')} className="sm:hidden p-1 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)]">
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h2 className="text-sm font-bold text-[var(--sf-text-primary)]">
                        {selectedConv?.displayName || selectedConv?.fallbackIdentifier || 'Unknown'}
                      </h2>
                      <div className="flex items-center gap-1.5">
                        {selectedConv?.channels.map(ch => <ChannelBadge key={ch} channel={ch} size={11} />)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowLeadPanel(!showLeadPanel)} className="xl:hidden p-2 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)] rounded-lg" title="Lead info">
                      <User size={18} />
                    </button>
                    <button onClick={() => console.log('Archive')} className="p-2 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)] rounded-lg" title="Archive">
                      <Archive size={18} />
                    </button>
                    <button onClick={() => console.log('Mark read')} className="p-2 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)] hover:bg-[var(--sf-bg-hover)] rounded-lg" title="Mark as read">
                      <CheckCheck size={18} />
                    </button>
                    <button onClick={() => console.log('Delete')} className="p-2 text-[var(--sf-text-muted)] hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div ref={timelineScrollRef} className="flex-1 overflow-y-auto bg-[var(--sf-bg-page)] py-3">
                  {loadingMore && (
                    <div className="flex justify-center py-2">
                      <span className="text-xs text-[var(--sf-text-muted)]">Loading older messages...</span>
                    </div>
                  )}
                  {groupedEvents.map(item => {
                    if (item.type === 'date') {
                      return (
                        <div key={item.key} className="flex items-center gap-3 px-4 py-2 my-1">
                          <div className="flex-1 border-t border-[var(--sf-border-light)]" />
                          <span className="text-[11px] font-medium text-[var(--sf-text-muted)] bg-[var(--sf-bg-page)] px-2">{item.label}</span>
                          <div className="flex-1 border-t border-[var(--sf-border-light)]" />
                        </div>
                      )
                    }
                    return <TimelineEvent key={item.key} event={item.event} />
                  })}
                  <div ref={timelineEndRef} />
                </div>

                {/* Composer */}
                <Composer
                  availableChannels={availableChannels}
                  sendChannel={sendChannel || channelFilter || 'openphone'}
                  setSendChannel={setSendChannel}
                  text={composerText}
                  setText={setComposerText}
                  onSend={handleSend}
                  channelFilter={channelFilter}
                  onChannelFilter={(ch) => { setChannelFilter(ch); setLocationFilter(null) }}
                  channelUnread={channelUnread}
                  emailSubject={emailSubject}
                  onEmailSubjectChange={setEmailSubject}
                  endpointEmail={selectedConvEndpointEmail}
                />
              </>
            )}
          </div>

          {/* ═══ RIGHT COLUMN: Lead Context ═══ */}
          <div className={`w-80 flex-shrink-0 bg-white border-l border-[var(--sf-border-light)] overflow-y-auto ${
            showLeadPanel ? 'fixed inset-0 z-40 w-full sm:w-80 sm:static' : 'hidden xl:block'
          }`}>
            {showLeadPanel && (
              <div className="xl:hidden flex items-center justify-between p-3 border-b border-[var(--sf-border-light)]">
                <h3 className="text-sm font-bold text-[var(--sf-text-primary)]">Lead Info</h3>
                <button onClick={() => setShowLeadPanel(false)} className="p-1 text-[var(--sf-text-muted)] hover:text-[var(--sf-text-primary)]">
                  <X size={18} />
                </button>
              </div>
            )}
            {selectedId ? (
              <LeadPanel lead={detail?.lead} conversation={detail?.conversation} />
            ) : (
              <EmptyState icon={User} title="No lead selected" subtitle="Select a conversation to see lead details" />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default Communications
