"use client"

import React from "react"

/**
 * PaystubPreview — renders a paystub snapshot as a React component.
 * Mirrors the email HTML template layout for consistency.
 *
 * Props:
 *   snapshot: { cleaner, company, period, totals, lineItems, payout }
 */

const fmt = (n) => {
  const v = parseFloat(n) || 0
  return `$${v.toFixed(2)}`
}

const fmtNeg = (n) => {
  const v = parseFloat(n) || 0
  return v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const s = String(dateStr)
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const d = new Date(isBareDate ? s + 'T00:00:00' : s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PaystubPreview({ snapshot }) {
  if (!snapshot) return null
  const cleaner = snapshot.cleaner || {}
  const company = snapshot.company || {}
  const period = snapshot.period || {}
  const totals = snapshot.totals || {}
  const lineItems = snapshot.lineItems || []
  const managerSalaryItems = snapshot.managerSalaryItems || []
  const managerCommissionItems = snapshot.managerCommissionItems || []
  const payout = snapshot.payout || {}

  const cleanerName = `${cleaner.firstName || ''} ${cleaner.lastName || ''}`.trim() || 'Team Member'
  const companyName = company.name || 'Service Flow'
  const periodLabel = `${formatDate(period.start)} – ${formatDate(period.end)}`

  return (
    <div className="bg-white rounded-xl border border-[var(--sf-border-light)] overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--sf-blue-500)] text-white px-6 py-4">
        <div className="text-xs uppercase tracking-wider opacity-90">{companyName}</div>
        <div className="text-xl font-bold mt-0.5">Paystub</div>
      </div>

      {/* Body */}
      <div className="p-6">
        <div className="text-sm text-[var(--sf-text-primary)]">
          Hello <strong>{cleanerName}</strong>,
        </div>
        <div className="text-xs text-[var(--sf-text-muted)] mt-1">
          Pay period: <strong className="text-[var(--sf-text-secondary)]">{periodLabel}</strong>
        </div>
        {payout.paidAt && (
          <div className="text-xs text-[var(--sf-text-muted)] mt-1">
            Paid on {formatDate(payout.paidAt)}
          </div>
        )}

        {/* Summary */}
        <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mt-6 mb-2">Summary</h3>
        <table className="w-full text-sm bg-gray-50 rounded-lg overflow-hidden">
          <tbody>
            <tr>
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Earnings</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.earnings)}</td>
            </tr>
            {totals.managerSalary ? (
              <tr className="border-t border-gray-200">
                <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Manager salary</td>
                <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.managerSalary)}</td>
              </tr>
            ) : null}
            {totals.managerCommission ? (
              <tr className="border-t border-gray-200">
                <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Manager commission</td>
                <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.managerCommission)}</td>
              </tr>
            ) : null}
            <tr className="border-t border-gray-200">
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Tips</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.tips)}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Incentives</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.incentives)}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Reimbursements</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmt(totals.reimbursements)}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Adjustments</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmtNeg(totals.adjustments)}</td>
            </tr>
            {totals.deductions ? (
              <tr className="border-t border-gray-200">
                <td className="px-4 py-2.5 text-red-700">Deductions</td>
                <td className="px-4 py-2.5 text-right font-medium text-red-700">{fmtNeg(totals.deductions)}</td>
              </tr>
            ) : null}
            <tr className="border-t border-gray-200">
              <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Cash collected</td>
              <td className="px-4 py-2.5 text-right font-medium">{fmtNeg(totals.cashCollected)}</td>
            </tr>
            {totals.priorDebt ? (
              <tr className="border-t border-gray-200">
                <td className="px-4 py-2.5 text-[var(--sf-text-secondary)]">Prior period debt</td>
                <td className="px-4 py-2.5 text-right font-medium">{fmtNeg(totals.priorDebt)}</td>
              </tr>
            ) : null}
            <tr className="border-t-2 border-[var(--sf-text-primary)]">
              <td className="px-4 py-3 font-bold text-[var(--sf-text-primary)]">Net Earned</td>
              <td className="px-4 py-3 text-right font-bold text-[var(--sf-text-primary)]">{fmt(totals.netPayout)}</td>
            </tr>
          </tbody>
        </table>

        {/* Payment block — only when linked to a payout batch */}
        {(payout.amount !== null && payout.amount !== undefined) && (() => {
          const amt = parseFloat(payout.amount) || 0
          const isPaid = payout.status === 'paid'
          let label, valueText, classes
          if (amt > 0) {
            label = isPaid ? 'Payment Sent' : 'Payment Pending'
            valueText = fmt(amt)
            classes = isPaid ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
          } else if (amt < 0) {
            label = 'Balance Owed (carried to next period)'
            valueText = fmtNeg(amt)
            classes = 'bg-red-50 text-red-800'
          } else {
            label = 'Settled'
            valueText = fmt(0)
            classes = 'bg-gray-100 text-gray-700'
          }
          return (
            <div className={`mt-3 p-4 rounded-lg flex justify-between items-center ${classes}`}>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider">{label}</div>
                {payout.paidAt && (
                  <div className="text-[11px] opacity-80 mt-0.5">on {formatDate(payout.paidAt)}</div>
                )}
              </div>
              <div className="text-lg font-bold">{valueText}</div>
            </div>
          )
        })()}

        {/* Manager salary breakdown */}
        {managerSalaryItems.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mt-6 mb-2">Salary Breakdown</h3>
            <div className="border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Date</th>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Calculation</th>
                    <th className="px-3 py-2 text-right text-[var(--sf-text-muted)] font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {managerSalaryItems.map((it, idx) => (
                    <tr key={idx} className="border-t border-[var(--sf-border-light)]">
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{formatDate(it.date)}</td>
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{(parseFloat(it.hours)||0).toFixed(1)}h × ${(parseFloat(it.rate)||0).toFixed(2)}/hr</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Manager commission breakdown */}
        {managerCommissionItems.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mt-6 mb-2">Commission Breakdown</h3>
            <div className="border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Date</th>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Calculation</th>
                    <th className="px-3 py-2 text-right text-[var(--sf-text-muted)] font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {managerCommissionItems.map((it, idx) => (
                    <tr key={idx} className="border-t border-[var(--sf-border-light)]">
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{formatDate(it.date)}</td>
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{(parseFloat(it.commissionPct)||0).toFixed(2)}% of {fmt(it.dayRevenue)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Line items */}
        {lineItems.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-[var(--sf-text-primary)] mt-6 mb-2">Jobs</h3>
            <div className="border border-[var(--sf-border-light)] rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Date</th>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Service</th>
                    <th className="px-3 py-2 text-left text-[var(--sf-text-muted)] font-semibold">Customer</th>
                    <th className="px-3 py-2 text-right text-[var(--sf-text-muted)] font-semibold">Earning</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={item.jobId || idx} className="border-t border-[var(--sf-border-light)]">
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{formatDate(item.date)}</td>
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{item.service}</td>
                      <td className="px-3 py-2 text-[var(--sf-text-secondary)]">{item.customerName}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(item.earning)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="text-xs text-[var(--sf-text-muted)] mt-6">
          If anything looks incorrect, please contact your administrator.
        </p>
      </div>
    </div>
  )
}
