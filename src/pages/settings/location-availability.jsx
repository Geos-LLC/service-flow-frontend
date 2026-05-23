"use client"

import { useState } from "react"
import { useParams } from "react-router-dom"
import { HelpCircle, Calendar } from "lucide-react"
import SettingsRailLayout from "../../components/settings-rail-layout"

const LocationAvailability = () => {
  const [viewMode, setViewMode] = useState("list")
  const { location } = useParams()

  const weeklyHours = [
    { day: "Sunday", hours: "Closed" },
    { day: "Monday", hours: "9:00 AM - 6:00 PM" },
    { day: "Tuesday", hours: "9:00 AM - 6:00 PM" },
    { day: "Wednesday", hours: "9:00 AM - 6:00 PM" },
    { day: "Thursday", hours: "9:00 AM - 6:00 PM" },
    { day: "Friday", hours: "9:00 AM - 6:00 PM" },
    { day: "Saturday", hours: "Closed" },
  ]

  return (
    <SettingsRailLayout
      title={location}
      section="Operations"
      subtitle="Hours of operation for this location"
    >
      <div>
            {/* Hours of Operation */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[var(--sf-text-primary)]">Hours of Operation</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`px-3 py-2 text-sm font-medium rounded ${
                      viewMode === "list" ? "bg-blue-100 text-[var(--sf-blue-500)]" : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                    }`}
                  >
                    List View
                  </button>
                  <button
                    onClick={() => setViewMode("calendar")}
                    className={`px-3 py-2 text-sm font-medium rounded ${
                      viewMode === "calendar" ? "bg-blue-100 text-[var(--sf-blue-500)]" : "text-[var(--sf-text-secondary)] hover:text-[var(--sf-text-primary)]"
                    }`}
                  >
                    Calendar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recurring Hours */}
                <div>
                  <div className="flex items-center space-x-2 mb-4">
                    <h3 className="text-lg font-medium text-[var(--sf-text-primary)]">Recurring Hours</h3>
                    <button className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                      <HelpCircle className="w-3 h-3 text-white" />
                    </button>
                  </div>

                  <div className="bg-white rounded-lg border border-[var(--sf-border-light)]">
                    {weeklyHours.map((schedule, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-4 ${
                          index !== weeklyHours.length - 1 ? "border-b border-[var(--sf-border-light)]" : ""
                        }`}
                      >
                        <span className="font-medium text-[var(--sf-text-primary)]">{schedule.day}</span>
                        <span className="text-[var(--sf-text-secondary)]">{schedule.hours}</span>
                      </div>
                    ))}
                    <div className="p-4 border-t border-[var(--sf-border-light)]">
                      <button className="text-[var(--sf-blue-500)] hover:text-[var(--sf-blue-500)] font-medium text-sm">Edit Hours</button>
                    </div>
                  </div>
                </div>

                {/* Date Overrides */}
                <div>
                  <div className="flex items-center space-x-2 mb-4">
                    <h3 className="text-lg font-medium text-[var(--sf-text-primary)]">Date Overrides</h3>
                    <button className="w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                      <HelpCircle className="w-3 h-3 text-white" />
                    </button>
                  </div>

                  <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-8 text-center">
                    <Calendar className="w-12 h-12 text-[var(--sf-text-muted)] mx-auto mb-4" />
                    <h4 className="font-medium text-[var(--sf-text-primary)] mb-2">Add a date override</h4>
                    <p className="text-[var(--sf-text-secondary)] text-sm mb-6">
                      Update your hours to reflect schedule changes and closures during holidays, vacations, and other
                      special dates.
                    </p>
                    <button className="bg-[var(--sf-blue-500)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--sf-blue-600)]">
                      Add Date Override
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SettingsRailLayout>
  )
}

export default LocationAvailability 