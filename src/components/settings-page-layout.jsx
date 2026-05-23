"use client"

import { SettingsRailLayout } from "./settings-rail-layout"

/**
 * Backwards-compatible shim. Earlier sub-pages used
 * <SettingsPageLayout title=... subtitle=... actions=...> with a
 * breadcrumb back-button chrome. The Settings redesign moved to a
 * persistent-rail layout instead. Routing everything through
 * SettingsRailLayout means every page that already migrated gets the
 * rail for free — no per-page edits.
 *
 * The maxWidth prop is no-op now: SettingsRailLayout sizes the
 * content column to fill the available space next to the rail.
 *
 * New pages should import SettingsRailLayout directly so they can
 * pass section/onSave/onDiscard.
 */
export const SettingsPageLayout = ({
  title,
  subtitle,
  actions,
  children,
  // eslint-disable-next-line no-unused-vars
  maxWidth,
}) => (
  <SettingsRailLayout title={title} subtitle={subtitle} actions={actions}>
    {children}
  </SettingsRailLayout>
)

export default SettingsPageLayout
