"use client"

import { Plus } from "lucide-react"
import SettingsPageLayout from "../../components/settings-page-layout"

const TaxesFees = () => {
  return (
    <SettingsPageLayout
      title="Taxes & fees"
      subtitle="Manage tax rates, fees, and adjustment rules for your services"
    >
      <div className="flex">
            {/* Left Panel */}
            <div className="flex-1 p-6 space-y-8">
              {/* Tax Rates */}
              <div>
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">Tax Rates</h2>
                <p className="text-[var(--sf-text-secondary)] mb-6">
                  Create your tax rates, and select which services and territories the tax applies to
                </p>

                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-8 text-center">
                  <p className="text-[var(--sf-text-muted)] mb-4">No tax rates created yet</p>
                  <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                    Create Tax
                  </button>
                </div>
              </div>

              {/* Price Adjustments */}
              <div>
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">Price Adjustments</h2>
                <p className="text-[var(--sf-text-secondary)] mb-6">Price adjustments allow you to add fees or discounts jobs</p>

                <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-8 text-center">
                  <p className="text-[var(--sf-text-muted)] mb-4">No price adjustments created yet</p>
                  <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                    Create Price Adjustment
                  </button>
                </div>
              </div>

              {/* Adjustment Rules */}
              <div>
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">Adjustment Rules</h2>
                <p className="text-[var(--sf-text-secondary)] mb-6">
                  Adjustment rules allow you to automatically apply price adjustments when certain conditions are met
                </p>

                <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                  Create Rule
                </button>
              </div>
            </div>

            {/* Right Panel - Preview */}
            <div className="w-96 bg-[var(--sf-bg-page)] p-6">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h4 className="font-medium text-[var(--sf-text-primary)] mb-4">BOOKING CONDITIONS</h4>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input type="radio" name="condition" defaultChecked />
                    <span className="text-sm text-[var(--sf-text-primary)]">Day of week is...</span>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-xs">
                    <div className="text-center py-1">Sun</div>
                    <div className="text-center py-1">Mon</div>
                    <div className="text-center py-1 bg-blue-100 text-[var(--sf-blue-500)] rounded">Tue</div>
                    <div className="text-center py-1">Wed</div>
                    <div className="text-center py-1">Thu</div>
                    <div className="text-center py-1">Fri</div>
                    <div className="text-center py-1">Sat</div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input type="radio" name="condition" />
                    <span className="text-sm text-[var(--sf-text-primary)]">Job start time is between...</span>
                  </div>

                  <div className="flex items-center space-x-2 text-sm">
                    <select className="border border-[var(--sf-border-light)] rounded px-2 py-1 text-xs">
                      <option>12:00 PM</option>
                    </select>
                    <span>-</span>
                    <select className="border border-[var(--sf-border-light)] rounded px-2 py-1 text-xs">
                      <option>12:30 PM</option>
                    </select>
                    <button className="text-red-500">🗑</button>
                  </div>

                  <button className="text-[var(--sf-blue-500)] text-sm flex items-center space-x-1">
                    <Plus className="w-3 h-3" />
                    <span>Add Hours</span>
                  </button>

                  <button className="text-[var(--sf-blue-500)] text-sm flex items-center space-x-1">
                    <Plus className="w-3 h-3" />
                    <span>Add Condition</span>
                  </button>

                  <div className="border-t pt-4 mt-6">
                    <h5 className="font-medium text-[var(--sf-text-primary)] mb-2">ADJUSTMENTS TO APPLY</h5>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-[var(--sf-blue-500)] rounded-full"></div>
                      <span className="text-sm">Surge Pricing</span>
                      <span className="text-xs bg-[var(--sf-bg-page)] px-2 py-1 rounded">5%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
    </SettingsPageLayout>
  )
}

export default TaxesFees
