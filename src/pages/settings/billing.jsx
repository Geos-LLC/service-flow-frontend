"use client"

import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Lock,
  Check,
  X,
  CreditCard,
  AlertCircle,
  Sparkles,
  Loader2,
  Download,
  ChevronDown,
  ExternalLink,
} from "lucide-react"
import { billingAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js"
import SettingsRailLayout from "../../components/settings-rail-layout"
import { SfCard, SfButton, SfTag } from "../../components/sf-primitives"

/**
 * Billing & plan page — Service Blue redesign.
 *
 * Keeps all existing wiring: billingAPI (subscription / payment methods),
 * stripeAPI.testConnection, Stripe Elements for new card setup. Inlines
 * the plan selector so users can switch plans without the popup modal.
 */

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || "")

// ── Plan tiers (matches PlanSelectionModal so behavior stays the same)

// Plan caps drive the Usage card progress bars. `null` = unlimited.
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 19,
    description: "Perfect for small businesses getting started",
    caps: { teams: 1, jobs: 50, sms: 1000, storageGb: 5, apiCalls: 10000 },
    features: [
      "Up to 50 jobs per month",
      "Basic scheduling",
      "Customer management",
      "Email notifications",
      "Mobile app access",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    price: 29,
    description: "Most popular for growing businesses",
    popular: true,
    caps: { teams: 5, jobs: null, sms: 5000, storageGb: 10, apiCalls: 50000 },
    features: [
      "Unlimited jobs",
      "Advanced scheduling",
      "Customer management",
      "SMS & email notifications",
      "Mobile app access",
      "Online booking",
      "Payment processing",
      "Basic reporting",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 49,
    description: "Established businesses needing advanced features",
    caps: { teams: 10, jobs: null, sms: 25000, storageGb: 50, apiCalls: 250000 },
    features: [
      "Everything in Standard",
      "Advanced reporting & analytics",
      "Team management",
      "API access",
      "Custom branding",
      "Priority support",
      "Integrations",
    ],
  },
]

// ── Stripe payment form (unchanged from v1, just restyled) ─────

const PaymentForm = ({ onSuccess, plan, loading, setLoading }) => {
  const stripe = useStripe()
  const elements = useElements()
  const { user } = useAuth()
  const [clientSecret, setClientSecret] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const createSetupIntent = async () => {
      try {
        const response = await billingAPI.createSetupIntent({
          userId: user.id,
          email: user.email,
          name: user.name || user.email,
        })
        setClientSecret(response.setup_intent)
      } catch (e) {
        setError("Failed to initialize payment form")
      }
    }
    if (user?.id) createSetupIntent()
  }, [user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setLoading(true)
    setError("")
    const cardElement = elements.getElement(CardElement)
    try {
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: user.name || user.email, email: user.email },
        },
      })
      if (stripeError) {
        setError(stripeError.message)
        return
      }
      await billingAPI.createSubscription({
        userId: user.id,
        plan,
        paymentMethodId: setupIntent.payment_method,
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || "Payment failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const cardOptions = {
    style: {
      base: { fontSize: "15px", color: "#0f172a", "::placeholder": { color: "#94a3b8" } },
      invalid: { color: "#dc2626" },
    },
    hidePostalCode: true,
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-[12px] font-semibold text-[var(--sf-ink-2)] inline-flex items-center gap-1.5">
        <CreditCard size={13} className="text-[var(--sf-ink-3)]" /> Card details
        <Lock size={11} className="text-[var(--sf-ink-3)] ml-auto" />
      </label>
      <div
        className="rounded-md bg-[var(--sf-panel)]"
        style={{
          border: "1.5px solid var(--sf-border-soft)",
          padding: "12px",
        }}
      >
        <CardElement options={cardOptions} />
      </div>
      {error && (
        <div className="text-[12px] text-[var(--sf-red-dark)] inline-flex items-center gap-1">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      <SfButton variant="primary" size="md" disabled={!stripe || loading} type="submit">
        {loading ? "Processing…" : `Start ${plan} subscription`}
      </SfButton>
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────────

const BillingSettings = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [invoices, setInvoices] = useState([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [usage, setUsage] = useState(null)
  const [showAddCard, setShowAddCard] = useState(false)

  const [billing, setBilling] = useState({
    currentPlan: "Standard",
    isTrial: true,
    trialDaysLeft: 14,
    trialEndDate: "",
    monthlyPrice: 29,
    subscriptionStatus: "trialing",
  })

  const currentPlanMeta = useMemo(() => {
    const name = String(billing.currentPlan || "").toLowerCase()
    return PLANS.find((p) => p.id === name) || PLANS[1]
  }, [billing.currentPlan])

  useEffect(() => {
    if (user?.id) {
      loadAll()
    } else if (user === null) {
      navigate("/signin")
    }
  }, [user?.id, navigate])

  const loadAll = async () => {
    setLoading(true)
    await Promise.all([loadBilling(), loadPaymentMethods(), loadInvoices(), loadUsage()])
    setLoading(false)
  }

  const loadUsage = async () => {
    try {
      const u = await billingAPI.getUsage()
      setUsage(u)
    } catch (e) {
      setUsage(null)
    }
  }

  const loadBilling = async () => {
    try {
      const data = await billingAPI.getBilling(user.id)
      setBilling((prev) => ({ ...prev, ...data }))
    } catch (e) {
      setMessage({ type: "error", text: "Failed to load billing info" })
    }
  }
  const loadPaymentMethods = async () => {
    try {
      const r = await billingAPI.getPaymentMethods(user.id)
      setPaymentMethods(r.payment_methods || [])
    } catch (e) {/* silent */}
  }
  const loadInvoices = async () => {
    setInvoicesLoading(true)
    try {
      const r = await billingAPI.getInvoices()
      setInvoices(Array.isArray(r?.invoices) ? r.invoices : [])
    } catch (e) {
      setInvoices([])
    } finally {
      setInvoicesLoading(false)
    }
  }

  const onCancel = async () => {
    if (
      !window.confirm(
        "Cancel your subscription? You'll keep access through the end of the current billing period."
      )
    ) {
      return
    }
    setSaving(true)
    try {
      await billingAPI.cancelSubscription(user.id)
      setMessage({ type: "success", text: "Subscription cancelled. Access continues until period end." })
      setTimeout(() => setMessage(null), 5000)
      loadBilling()
    } catch (e) {
      setMessage({ type: "error", text: "Failed to cancel subscription" })
    } finally {
      setSaving(false)
    }
  }

  const onSwitchPlan = async (planId) => {
    if (planId === (billing.currentPlan || "").toLowerCase()) return
    if (!window.confirm(`Switch to the ${planId} plan? Pro-rated billing applies on the next invoice.`)) return
    setSaving(true)
    try {
      // Reuse the createSubscription endpoint with the existing payment method
      const defaultPm = paymentMethods[0]?.id
      if (!defaultPm) {
        setShowAddCard(true)
        setMessage({ type: "error", text: "Add a payment method to switch plans" })
        return
      }
      await billingAPI.createSubscription({
        userId: user.id,
        plan: planId,
        paymentMethodId: defaultPm,
      })
      setMessage({ type: "success", text: "Plan updated" })
      setTimeout(() => setMessage(null), 3000)
      loadBilling()
    } catch (e) {
      setMessage({ type: "error", text: e?.response?.data?.error || "Failed to switch plan" })
    } finally {
      setSaving(false)
    }
  }

  const onSubscribeSuccess = () => {
    setMessage({ type: "success", text: "Subscription started" })
    setTimeout(() => setMessage(null), 3000)
    setShowAddCard(false)
    loadBilling()
    loadPaymentMethods()
  }

  if (loading) {
    return (
      <SettingsRailLayout title="Billing & plan" section="Account">
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-[var(--sf-ink-3)] animate-spin" />
        </div>
      </SettingsRailLayout>
    )
  }

  const status = (billing.subscriptionStatus || "").toLowerCase()
  const isTrial = billing.isTrial || status === "trialing"
  const isCancelled = status === "canceled" || status === "cancelled"
  const isActive = status === "active"

  return (
    <SettingsRailLayout
      title="Billing & plan"
      section="Account"
      subtitle="Manage your plan, payment methods, and Stripe payouts"
    >
      {message && (
        <div
          className="mb-4 rounded-md px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-2"
          style={{
            background: message.type === "success" ? "var(--sf-green-soft)" : "var(--sf-red-soft)",
            color: message.type === "success" ? "var(--sf-green-dark)" : "var(--sf-red-dark)",
            border: `1px solid ${message.type === "success" ? "rgba(22,163,74,.25)" : "rgba(220,38,38,.25)"}`,
          }}
        >
          {message.type === "success" ? <Check size={13} /> : <X size={13} />}
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {/* Current plan banner */}
        <CurrentPlanCard
          billing={billing}
          isTrial={isTrial}
          isCancelled={isCancelled}
          isActive={isActive}
          planMeta={currentPlanMeta}
          onCancel={onCancel}
          saving={saving}
        />

        {/* Usage this period */}
        <UsageCard usage={usage} planMeta={currentPlanMeta} />

        {/* Plan grid */}
        <div>
          <div className="mb-3">
            <h2 className="text-[14.5px] font-bold text-[var(--sf-ink)]">Available plans</h2>
            <div className="text-[12px] text-[var(--sf-ink-3)] mt-0.5">
              Switch any time. Pro-rated billing applies on the next invoice.
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLANS.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                current={p.id === (billing.currentPlan || "").toLowerCase()}
                disabled={saving}
                onSelect={() => onSwitchPlan(p.id)}
              />
            ))}
          </div>
        </div>

        {/* Payment methods */}
        <SfCard padding={0}>
          <div
            className="flex items-center"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">Payment methods</div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                Cards we'll charge for your ServiceFlow subscription
              </div>
            </div>
            <SfButton
              variant="secondary"
              size="sm"
              icon={CreditCard}
              onClick={() => setShowAddCard((v) => !v)}
            >
              {showAddCard ? "Cancel" : "Add card"}
            </SfButton>
          </div>
          {paymentMethods.length === 0 && !showAddCard && (
            <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              No payment methods on file yet.
            </div>
          )}
          {paymentMethods.map((m, i) => (
            <PaymentMethodRow
              key={m.id}
              method={m}
              isFirst={i === 0}
              isLast={i === paymentMethods.length - 1 && !showAddCard}
            />
          ))}
          {showAddCard && (
            <div
              style={{
                padding: "16px 18px",
                background: "var(--sf-panel-alt)",
                borderTop: paymentMethods.length > 0 ? "1px solid var(--sf-border-soft)" : "none",
              }}
            >
              <Elements stripe={stripePromise}>
                <PaymentForm
                  onSuccess={onSubscribeSuccess}
                  plan={currentPlanMeta.id}
                  loading={saving}
                  setLoading={setSaving}
                />
              </Elements>
            </div>
          )}
        </SfCard>

        {/* Billing history — Stripe invoices for this tenant */}
        <SfCard padding={0}>
          <div
            className="flex items-center"
            style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">Billing history</div>
              <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
                Invoices and receipts for your ServiceFlow subscription
              </div>
            </div>
          </div>
          {invoicesLoading ? (
            <div className="py-10 text-center">
              <Loader2 size={20} className="text-[var(--sf-ink-3)] animate-spin inline-block" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-[var(--sf-ink-3)]">
              No invoices yet. Past charges will show up here after your first billing cycle.
            </div>
          ) : (
            invoices.map((inv, i) => (
              <InvoiceRow key={inv.id} invoice={inv} isLast={i === invoices.length - 1} />
            ))
          )}
        </SfCard>
      </div>
    </SettingsRailLayout>
  )
}

const InvoiceRow = ({ invoice, isLast }) => {
  const date = invoice.created
    ? new Date(invoice.created * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—"
  const amount = `$${(((invoice.amount_paid || invoice.amount_due) || 0) / 100).toFixed(2)}`
  const statusMeta =
    invoice.status === "paid"
      ? { label: "Paid", c: "var(--sf-green-dark)", bg: "var(--sf-green-soft)" }
      : invoice.status === "open"
      ? { label: "Open", c: "var(--sf-amber-dark)", bg: "var(--sf-amber-soft)" }
      : invoice.status === "void" || invoice.status === "uncollectible"
      ? { label: "Void", c: "var(--sf-red-dark)", bg: "var(--sf-red-soft)" }
      : { label: invoice.status || "—", c: "var(--sf-ink-3)", bg: "var(--sf-panel-soft)" }
  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      style={{
        padding: "12px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
      }}
    >
      <div style={{ width: 90 }} className="flex-shrink-0">
        <div
          className="text-[12.5px] font-semibold text-[var(--sf-ink)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {date}
        </div>
        {invoice.number && (
          <div
            className="text-[10.5px] text-[var(--sf-ink-3)]"
            style={{ fontFamily: "var(--sf-font-mono)" }}
          >
            {invoice.number}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[var(--sf-ink)] truncate">
          {invoice.description || "Subscription"}
        </div>
      </div>
      <SfTag color={statusMeta.c} bg={statusMeta.bg}>
        {statusMeta.label}
      </SfTag>
      <div
        className="text-[13px] font-semibold text-[var(--sf-ink)] flex-shrink-0"
        style={{ fontVariantNumeric: "tabular-nums", width: 80, textAlign: "right" }}
      >
        {amount}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {invoice.hosted_url && (
          <a
            href={invoice.hosted_url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] font-semibold text-[var(--sf-blue-dark)] hover:underline inline-flex items-center gap-1"
            style={{ fontFamily: "var(--sf-font-ui)" }}
          >
            View <ExternalLink size={11} />
          </a>
        )}
        {invoice.pdf_url && (
          <a
            href={invoice.pdf_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Download invoice PDF"
            className="text-[var(--sf-ink-3)] hover:text-[var(--sf-ink)]"
          >
            <Download size={14} />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Current plan banner ────────────────────────────────────────

const CurrentPlanCard = ({
  billing, isTrial, isCancelled, isActive, planMeta, onCancel, saving,
}) => (
  <SfCard
    padding={0}
    style={{
      background: "linear-gradient(135deg, var(--sf-blue-soft) 0%, var(--sf-purple-soft) 100%)",
      border: "1px solid var(--sf-blue-soft-2)",
    }}
  >
    <div className="flex items-start gap-4 flex-wrap" style={{ padding: "18px 22px" }}>
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "rgba(37,99,235,.15)",
          color: "var(--sf-blue-dark)",
        }}
      >
        <Sparkles size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] font-bold uppercase text-[var(--sf-ink-3)]"
            style={{ letterSpacing: ".06em" }}
          >
            Current plan
          </span>
          {isTrial && (
            <SfTag color="var(--sf-amber-dark)" bg="var(--sf-amber-soft)">
              Trial · {billing.trialDaysLeft || 0} days left
            </SfTag>
          )}
          {isActive && (
            <SfTag color="var(--sf-green-dark)" bg="var(--sf-green-soft)">
              Active
            </SfTag>
          )}
          {isCancelled && (
            <SfTag color="var(--sf-red-dark)" bg="var(--sf-red-soft)">
              Cancelled
            </SfTag>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          <span
            className="text-[24px] font-bold text-[var(--sf-ink)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            {planMeta.name}
          </span>
          <span
            className="text-[16px] font-semibold text-[var(--sf-ink-2)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            · ${planMeta.price}/mo
          </span>
        </div>
        <div className="text-[12.5px] text-[var(--sf-ink-2)] mt-1">
          {isTrial && billing.trialEndDate
            ? `You won't be charged until your trial ends on ${billing.trialEndDate}.`
            : isCancelled
            ? "Subscription cancelled — you have access until the current period ends."
            : "Renews monthly. Cancel any time."}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isActive && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-[12.5px] font-semibold"
            style={{
              padding: "7px 14px",
              border: "1px solid var(--sf-red-soft-2, rgba(220,38,38,.3))",
              background: "var(--sf-panel)",
              color: "var(--sf-red-dark)",
              borderRadius: 6,
              cursor: saving ? "wait" : "pointer",
              fontFamily: "var(--sf-font-ui)",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Cancelling…" : "Cancel subscription"}
          </button>
        )}
      </div>
    </div>
  </SfCard>
)

// ── Single plan card in the grid ───────────────────────────────

// ── Usage this period ─────────────────────────────────────────

const fmtNumber = (n) =>
  typeof n === "number" ? n.toLocaleString() : n != null ? String(n) : "—"

const fmtPeriod = (startIso, endIso) => {
  if (!startIso || !endIso) return ""
  const s = new Date(startIso)
  const e = new Date(endIso)
  // The endIso is exclusive (1st of next month) — display the last day of the period.
  const lastDay = new Date(e.getTime() - 24 * 3600 * 1000)
  const sMonth = s.toLocaleDateString("en-US", { month: "short" })
  return `${sMonth} ${s.getDate()} – ${lastDay.getDate()}`
}

const UsageCard = ({ usage, planMeta }) => {
  const caps = planMeta?.caps || {}
  const rows = [
    {
      label: "Active teams",
      value: usage?.activeTeams,
      cap: caps.teams,
      unit: "teams",
      color: "var(--sf-blue)",
    },
    {
      label: "Jobs · this month",
      value: usage?.jobsThisMonth,
      cap: caps.jobs, // null = unlimited
      unit: "jobs",
      hideBarWhenUnlimited: true,
      color: "var(--sf-blue)",
    },
    {
      label: "SMS sent",
      value: usage?.smsSent,
      cap: caps.sms,
      unit: "messages",
      color: "var(--sf-amber)",
    },
    {
      label: "Storage",
      value:
        usage?.storageBytes != null
          ? Math.round((usage.storageBytes / 1073741824) * 10) / 10
          : null,
      cap: caps.storageGb,
      unit: "GB",
      color: "var(--sf-blue)",
    },
    {
      label: "API calls",
      value: usage?.apiCalls,
      cap: caps.apiCalls,
      unit: "requests",
      color: "var(--sf-blue)",
    },
  ]

  return (
    <SfCard padding={0}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--sf-border-soft)" }}>
        <div className="text-[13.5px] font-semibold text-[var(--sf-ink)]">
          Usage this period
        </div>
        <div className="text-[11.5px] text-[var(--sf-ink-3)] mt-0.5">
          {fmtPeriod(usage?.periodStart, usage?.periodEnd) || "Current calendar month"}
        </div>
      </div>
      <div style={{ padding: "12px 18px 16px" }} className="flex flex-col gap-3">
        {rows.map((row) => (
          <UsageRow key={row.label} row={row} />
        ))}
      </div>
    </SfCard>
  )
}

const UsageRow = ({ row }) => {
  const isUnlimited = row.cap == null
  const numericValue = typeof row.value === "number" ? row.value : null
  const pct =
    !isUnlimited && numericValue != null && row.cap > 0
      ? Math.min(100, Math.round((numericValue / row.cap) * 100))
      : 0
  const showBar = !(isUnlimited && row.hideBarWhenUnlimited) && numericValue != null
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <span className="text-[12.5px] font-semibold text-[var(--sf-ink)]">{row.label}</span>
        <div className="flex-1" />
        {numericValue == null ? (
          <span className="text-[11.5px] text-[var(--sf-ink-3)]">—</span>
        ) : (
          <span
            className="text-[12.5px] font-semibold text-[var(--sf-ink)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmtNumber(numericValue)}
            {!isUnlimited && (
              <span className="text-[var(--sf-ink-3)] font-medium ml-1">
                / {fmtNumber(row.cap)} {row.unit}
              </span>
            )}
          </span>
        )}
      </div>
      {showBar ? (
        <div
          style={{
            height: 6,
            background: "var(--sf-panel-alt)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {!isUnlimited && (
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: pct >= 90 ? "var(--sf-red)" : pct >= 75 ? "var(--sf-amber)" : row.color,
                transition: "width .2s",
              }}
            />
          )}
        </div>
      ) : (
        <div className="text-[11px] text-[var(--sf-ink-3)]">
          {isUnlimited && numericValue != null ? `Unlimited on ${row.unit ? "this plan" : "your plan"}` : ""}
        </div>
      )}
    </div>
  )
}

const PlanCard = ({ plan, current, disabled, onSelect }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <SfCard
      padding={0}
      style={{
        border: current
          ? "2px solid var(--sf-blue)"
          : plan.popular
          ? "1.5px solid rgba(37,99,235,.25)"
          : "1px solid var(--sf-border-soft)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {plan.popular && !current && (
        <div
          className="text-[9.5px] font-bold uppercase"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "var(--sf-blue)",
            color: "#fff",
            padding: "1.5px 6px",
            borderRadius: 4,
            letterSpacing: ".06em",
          }}
        >
          Popular
        </div>
      )}
      {current && (
        <div
          className="text-[9.5px] font-bold uppercase"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "var(--sf-blue-dark)",
            color: "#fff",
            padding: "1.5px 6px",
            borderRadius: 4,
            letterSpacing: ".06em",
          }}
        >
          Current
        </div>
      )}

      <div style={{ padding: "12px 14px" }}>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[13.5px] font-bold text-[var(--sf-ink)]">{plan.name}</span>
          <span
            className="text-[12.5px] font-semibold text-[var(--sf-ink-2)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            · ${plan.price}/mo
          </span>
        </div>
        <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5 leading-snug">
          {plan.description}
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <SfButton
            variant={current ? "secondary" : plan.popular ? "primary" : "secondary"}
            size="sm"
            onClick={onSelect}
            disabled={disabled || current}
            style={{ flex: 1, justifyContent: "center" }}
          >
            {current ? "Current plan" : "Switch"}
          </SfButton>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Hide features" : "Show features"}
            className="inline-flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 6,
              background: "var(--sf-panel-alt)",
              border: "1px solid var(--sf-border-soft)",
              color: "var(--sf-ink-2)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "transform .15s",
              transform: expanded ? "rotate(180deg)" : "rotate(0)",
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            padding: "10px 14px 12px",
            borderTop: "1px solid var(--sf-border-soft)",
            background: "var(--sf-panel-alt)",
          }}
        >
          <ul className="flex flex-col gap-1">
            {plan.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-1.5 text-[11.5px] text-[var(--sf-ink-2)]"
              >
                <Check
                  size={12}
                  className="text-[var(--sf-green)] flex-shrink-0 mt-px"
                  strokeWidth={2.5}
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SfCard>
  )
}

// ── Payment method row ────────────────────────────────────────

const PaymentMethodRow = ({ method, isFirst, isLast }) => (
  <div
    className="flex items-center gap-3 flex-wrap"
    style={{
      padding: "14px 18px",
      borderBottom: isLast ? "none" : "1px solid var(--sf-border-soft)",
    }}
  >
    <div
      className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
      style={{
        background: "var(--sf-panel-alt)",
        color: "var(--sf-ink-2)",
      }}
    >
      <CreditCard size={16} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-semibold text-[var(--sf-ink)] inline-flex items-center gap-2">
        {String(method.brand || "card").toUpperCase()}
        <span style={{ fontFamily: "var(--sf-font-mono)" }}>•••• {method.last4}</span>
        {isFirst && (
          <SfTag color="var(--sf-blue-dark)" bg="var(--sf-blue-soft)">
            Default
          </SfTag>
        )}
      </div>
      <div className="text-[11px] text-[var(--sf-ink-3)] mt-0.5">
        Expires {String(method.exp_month).padStart(2, "0")}/{method.exp_year}
      </div>
    </div>
  </div>
)

export default BillingSettings
