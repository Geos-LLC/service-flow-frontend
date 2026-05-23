"use client"

import SettingsRailLayout from "../../components/settings-rail-layout"

const JobAssignmentTeam = () => (
  <SettingsRailLayout
    title="Team assignment"
    section="Communications"
    subtitle="Notification sent to service providers when they are assigned to a new job"
  >
    <div className="bg-white rounded-lg border border-[var(--sf-border-light)] p-8 text-center">
      <h2 className="text-xl font-semibold text-[var(--sf-text-primary)] mb-4">
        Job assignment notifications
      </h2>
      <p className="text-[var(--sf-text-secondary)] mb-4">
        Configure notifications sent to service providers when they are assigned to a new job.
      </p>
      <p className="text-sm text-[var(--sf-text-muted)]">
        Template configuration interface coming soon.
      </p>
    </div>
  </SettingsRailLayout>
)

export default JobAssignmentTeam
