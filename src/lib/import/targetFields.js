// Target field definitions for the Data Import flow.
//
// Single unified catalog. Each field appears once. `targets` declares which
// import types the field applies to — picking a single-target field tells
// the system what kind of data the user is importing.
//
// `requiredFor` is the types where the field is required (must be mapped).

export const TARGET_TYPE_LABELS = {
  customers: 'Customers',
  leads: 'Opportunities',
  jobs: 'Jobs',
  team_members: 'Team Members',
  services: 'Services',
  territories: 'Territories',
  reviews: 'Reviews',
};

export const TARGET_TYPES = ['customers', 'leads', 'jobs', 'team_members', 'services', 'territories', 'reviews'];

// Default tiebreaker when multiple types are equally likely from the mapping.
// Customers beats leads on ties because mapping just First Name / Email / Phone
// is ambiguous between the two, and customers has no required setup (leads
// needs a pipeline + stage). Leads still wins when a lead-only field is
// mapped (Lead Cost, Lead Value, …) via the strong-signal rule in inferType.
const TYPE_PRIORITY = ['customers', 'reviews', 'jobs', 'team_members', 'services', 'territories', 'leads'];

const ALL = TARGET_TYPES;

export const UNIFIED_FIELDS = [
  // ── Identity (shared across people-like types) ──────────────────
  // First/Last name target 'jobs' too — BK route uses these to find or
  // create the linked customer per job row.
  { key: 'firstName', label: 'First Name', group: 'Identity',
    targets: ['customers', 'leads', 'team_members', 'jobs'],
    requiredFor: ['customers', 'team_members', 'jobs'] },
  { key: 'lastName', label: 'Last Name', group: 'Identity',
    targets: ['customers', 'leads', 'team_members', 'jobs'],
    requiredFor: ['customers', 'team_members'] },
  { key: 'email', label: 'Email', group: 'Identity',
    targets: ['customers', 'leads', 'team_members', 'jobs'], requiredFor: ['team_members'] },
  { key: 'phone', label: 'Phone', group: 'Identity',
    targets: ['customers', 'leads', 'team_members', 'jobs'] },
  { key: 'additionalPhone', label: 'Additional Phone', group: 'Identity',
    targets: ['customers'] },
  { key: 'companyName', label: 'Company Name', group: 'Identity',
    targets: ['customers', 'leads'] },

  // ── Address (Customer / Lead / Team / Job service-address) ──────
  { key: 'address', label: 'Address', group: 'Address',
    targets: ['customers', 'leads', 'team_members', 'jobs'] },
  { key: 'apt', label: 'Apt / Suite', group: 'Address',
    targets: ['customers', 'jobs'] },
  { key: 'city', label: 'City', group: 'Address',
    targets: ['customers', 'team_members', 'jobs'] },
  { key: 'state', label: 'State', group: 'Address',
    targets: ['customers', 'team_members', 'jobs'] },
  { key: 'zipCode', label: 'Zip / Postal Code', group: 'Address',
    targets: ['customers', 'team_members', 'jobs'] },

  // ── Lead specifics (also used by Customers) ─────────────────────
  { key: 'source', label: 'Lead Source', group: 'Lead',
    targets: ['customers', 'leads'] },
  { key: 'createdAt', label: 'Lead Created Date / Date Added', group: 'Lead',
    targets: ['customers', 'leads'] },
  { key: 'leadValue', label: 'Lead Value / Estimated Price', group: 'Lead',
    targets: ['leads'] },
  { key: 'leadCost', label: 'Lead Cost / Acquisition Cost (CPL)', group: 'Lead',
    targets: ['leads'] },
  { key: 'leadServiceId', label: 'Service (lead is interested in)', group: 'Lead',
    targets: ['leads'] },
  // Task tracking — populates lead_tasks rows on import
  { key: 'lastTaskDate', label: 'Last Task Date (most recent activity)', group: 'Lead Tasks',
    targets: ['leads'] },
  { key: 'lastTaskTitle', label: 'Last Task Title (optional)', group: 'Lead Tasks',
    targets: ['leads'] },
  { key: 'nextTaskDate', label: 'Next Task Date (follow-up due)', group: 'Lead Tasks',
    targets: ['leads'] },
  { key: 'nextTaskTitle', label: 'Next Task Title (optional)', group: 'Lead Tasks',
    targets: ['leads'] },

  // ── Schedule (Jobs only) ────────────────────────────────────────
  { key: 'scheduledDate', label: 'Scheduled Date', group: 'Schedule',
    targets: ['jobs'], requiredFor: ['jobs'] },
  { key: 'scheduledTime', label: 'Scheduled Time', group: 'Schedule', targets: ['jobs'] },
  { key: 'bookingStartDateTime', label: 'Booking Start (ISO datetime)', group: 'Schedule', targets: ['jobs'] },
  { key: 'bookingEndDateTime', label: 'Booking End (ISO datetime)', group: 'Schedule', targets: ['jobs'] },
  { key: 'duration', label: 'Duration (min or HH:MM)', group: 'Schedule',
    targets: ['jobs', 'services'] },
  { key: 'estimatedDuration', label: 'Estimated Duration (min)', group: 'Schedule', targets: ['jobs'] },
  { key: 'hoursWorked', label: 'Hours Worked (actual — drives cleaner salary)', group: 'Schedule', targets: ['jobs'] },
  { key: 'startTime', label: 'Actual Start Time', group: 'Schedule', targets: ['jobs'] },
  { key: 'endTime', label: 'Actual End Time', group: 'Schedule', targets: ['jobs'] },
  { key: 'isRecurring', label: 'Is Recurring', group: 'Schedule', targets: ['jobs'] },
  { key: 'recurringFrequency', label: 'Recurring Frequency', group: 'Schedule', targets: ['jobs'] },
  { key: 'recurringEndDate', label: 'Recurring End Date', group: 'Schedule', targets: ['jobs'] },

  // ── Service (Jobs / Services overlap) ───────────────────────────
  { key: 'serviceName', label: 'Service Name', group: 'Service', targets: ['jobs'] },
  { key: 'name', label: 'Name', group: 'Service',
    targets: ['services', 'territories'], requiredFor: ['services', 'territories'] },
  { key: 'description', label: 'Description', group: 'Service',
    targets: ['services', 'territories'] },
  { key: 'category', label: 'Category', group: 'Service', targets: ['services'] },
  { key: 'requirePaymentMethod', label: 'Require Payment Method', group: 'Service', targets: ['services'] },
  { key: 'bedroomCount', label: 'Bedrooms', group: 'Service', targets: ['jobs'] },
  { key: 'bathroomCount', label: 'Bathrooms', group: 'Service', targets: ['jobs'] },
  { key: 'workersNeeded', label: 'Workers Needed', group: 'Service', targets: ['jobs'] },
  { key: 'extras', label: 'Extras', group: 'Service', targets: ['jobs'] },
  { key: 'excludes', label: 'Excludes', group: 'Service', targets: ['jobs'] },

  // ── Pricing (Jobs / Services overlap on price) ──────────────────
  { key: 'price', label: 'Price', group: 'Pricing',
    targets: ['jobs', 'services'] },
  { key: 'servicePrice', label: 'Service Price (pre-tax)', group: 'Pricing', targets: ['jobs'] },
  { key: 'serviceTotal', label: 'Service Total', group: 'Pricing', targets: ['jobs'] },
  { key: 'discount', label: 'Discount', group: 'Pricing', targets: ['jobs'] },
  { key: 'additionalFees', label: 'Additional Fees', group: 'Pricing', targets: ['jobs'] },
  { key: 'taxes', label: 'Taxes', group: 'Pricing', targets: ['jobs'] },
  { key: 'total', label: 'Total', group: 'Pricing', targets: ['jobs'] },
  { key: 'finalAmount', label: 'Final Amount', group: 'Pricing', targets: ['jobs'] },
  { key: 'tipAmount', label: 'Tip (total — split across assigned cleaners)', group: 'Pricing', targets: ['jobs'] },
  { key: 'incentiveAmount', label: 'Incentive / Bonus (total)', group: 'Pricing', targets: ['jobs'] },
  // Multi-mappable: pick this SF field for as many CSV columns as you have
  // expense categories. Each mapped column becomes one job_expenses row
  // per job; the type is auto-classified from the column name (Supplies →
  // supplies, Travel → travel, etc., else "other").
  { key: 'expenseAmount', label: 'Expense / Reimbursement Amount (map multiple columns for multiple expenses)', group: 'Pricing', targets: ['jobs'], multi: true },

  // ── Payment (Jobs only) ─────────────────────────────────────────
  { key: 'amountPaidByCustomer', label: 'Amount Paid', group: 'Payment', targets: ['jobs'] },
  { key: 'amountOwed', label: 'Amount Owed', group: 'Payment', targets: ['jobs'] },
  { key: 'paymentMethod', label: 'Payment Method', group: 'Payment', targets: ['jobs'] },
  { key: 'paymentStatus', label: 'Payment Status (paid/unpaid/partial)', group: 'Payment', targets: ['jobs'] },
  { key: 'invoiceId', label: 'Invoice ID', group: 'Payment', targets: ['jobs'] },
  { key: 'invoiceAmount', label: 'Invoice Amount', group: 'Payment', targets: ['jobs'] },
  { key: 'invoiceDate', label: 'Invoice Date', group: 'Payment', targets: ['jobs'] },
  { key: 'paymentDate', label: 'Payment Date', group: 'Payment', targets: ['jobs'] },

  // ── Team Pay / Salary (Team Members only) ───────────────────────
  { key: 'role', label: 'Role (cleaner / manager / office / admin)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'hourlyRate', label: 'Hourly Rate', group: 'Team Pay', targets: ['team_members'] },
  { key: 'commission', label: 'Commission %', group: 'Team Pay', targets: ['team_members'] },
  // Per-job custom salary override (Jobs context — sits in Team Pay group
  // so users find it where they expect "salary" fields).
  { key: 'cleanerSalaryOverride', label: 'Cleaner Salary for this Job (custom $ — overrides hours × rate)', group: 'Team Pay', targets: ['jobs'] },
  { key: 'salaryStartDate', label: 'Salary Start Date', group: 'Team Pay', targets: ['team_members'] },
  { key: 'payoutScheduleType', label: 'Payout Schedule (weekly/biweekly/monthly)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'payoutDayOfWeek', label: 'Payout Day of Week (0=Sun … 6=Sat)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'payoutIntervalDays', label: 'Payout Interval (days)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'isServiceProvider', label: 'Is Service Provider (true/false)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'skills', label: 'Skills (comma-separated)', group: 'Team Pay', targets: ['team_members'] },
  { key: 'color', label: 'Color (calendar)', group: 'Team Pay', targets: ['team_members'] },

  // ── Territory specifics ─────────────────────────────────────────
  { key: 'location', label: 'Location', group: 'Territory',
    targets: ['team_members', 'territories'] },
  { key: 'radius', label: 'Radius (miles)', group: 'Territory', targets: ['territories'] },
  { key: 'timezone', label: 'Timezone', group: 'Territory', targets: ['territories'] },
  { key: 'zipCodes', label: 'Zip Codes (comma/space separated)', group: 'Territory', targets: ['territories'] },
  { key: 'pricingMultiplier', label: 'Pricing Multiplier (e.g. 1.25)', group: 'Territory', targets: ['territories'] },
  { key: 'territory', label: 'Territory (job assignment)', group: 'Territory', targets: ['jobs'] },
  { key: 'serviceRegionExternalId', label: 'Service Region / Location ID', group: 'Territory', targets: ['jobs'] },

  // ── Assignment (Job → Team Member) ───────────────────────────────
  { key: 'assignedTeamMemberName', label: 'Assigned Team Member (name)', group: 'Assignment', targets: ['jobs'] },
  { key: 'assignedTeamMemberEmail', label: 'Assigned Team Member (email)', group: 'Assignment', targets: ['jobs'] },
  { key: 'assignedCrewExternalId', label: 'Assigned Crew (external ID — for BK/ZB exports)', group: 'Assignment', targets: ['jobs'] },

  // ── Status & flags ──────────────────────────────────────────────
  { key: 'status', label: 'Status', group: 'Status', targets: ALL },
  { key: 'isActive', label: 'Active (true/false)', group: 'Status',
    targets: ['team_members', 'services', 'territories'] },
  { key: 'priority', label: 'Priority', group: 'Status', targets: ['jobs'] },
  { key: 'workers', label: 'Workers Assigned (#)', group: 'Status', targets: ['jobs'] },
  { key: 'qualityCheck', label: 'Quality Check (true/false)', group: 'Status', targets: ['jobs'] },
  { key: 'photosRequired', label: 'Photos Required (true/false)', group: 'Status', targets: ['jobs'] },
  { key: 'customerSignature', label: 'Customer Signature (true/false)', group: 'Status', targets: ['jobs'] },
  { key: 'autoInvoice', label: 'Auto-Invoice (true/false)', group: 'Status', targets: ['jobs'] },
  { key: 'autoReminders', label: 'Auto-Reminders (true/false)', group: 'Status', targets: ['jobs'] },

  // ── Reviews ──────────────────────────────────────────────────────
  { key: 'rating', label: 'Rating (1–5)', group: 'Review',
    targets: ['reviews'], requiredFor: ['reviews'] },
  { key: 'ratingMax', label: 'Rating Max (default 5)', group: 'Review', targets: ['reviews'] },
  { key: 'reviewText', label: 'Review Text', group: 'Review', targets: ['reviews'] },
  { key: 'reviewerName', label: 'Reviewer Name', group: 'Review', targets: ['reviews'] },
  { key: 'reviewerEmail', label: 'Reviewer Email (links to existing customer)', group: 'Review', targets: ['reviews'] },
  { key: 'reviewSource', label: 'Source (google / yelp / thumbtack / direct / …)', group: 'Review',
    targets: ['reviews'], requiredFor: ['reviews'] },
  { key: 'reviewDate', label: 'Review Date', group: 'Review', targets: ['reviews'] },
  { key: 'reviewExternalId', label: 'External Review ID (dedup key)', group: 'Review', targets: ['reviews'] },
  { key: 'reviewExternalUrl', label: 'External Review URL', group: 'Review', targets: ['reviews'] },
  { key: 'reviewResponse', label: 'Pro Response Text', group: 'Review', targets: ['reviews'] },
  { key: 'reviewResponseDate', label: 'Pro Response Date', group: 'Review', targets: ['reviews'] },
  { key: 'reviewJobExternalId', label: 'Job External ID (link to existing job)', group: 'Review', targets: ['reviews'] },

  // ── Notes & metadata ────────────────────────────────────────────
  { key: 'notes', label: 'Notes', group: 'Notes',
    targets: ['customers', 'leads', 'jobs', 'team_members', 'services', 'territories'] },
  { key: 'customerNotes', label: 'Customer Notes', group: 'Notes', targets: ['jobs'] },
  { key: 'internalNotes', label: 'Internal Notes', group: 'Notes', targets: ['jobs'] },
  { key: 'specialInstructions', label: 'Special Instructions', group: 'Notes', targets: ['jobs'] },
  { key: 'tags', label: 'Tags (comma-separated)', group: 'Notes',
    targets: ['customers', 'jobs'] },
  { key: 'externalId', label: 'External ID (dedup key)', group: 'Notes',
    targets: ['customers', 'jobs', 'team_members'] },
];

/**
 * Infer the import type from a mapping object.
 *
 * Vote per type: each mapped field counts toward the types it can target.
 * Single-target fields (e.g. `hourlyRate` → team_members only) act as strong
 * signals; multi-target fields contribute to all their targets equally.
 *
 * Returns { type, votes, ambiguous, mappedFields }.
 *   - type: best-guess type (TYPE_PRIORITY breaks ties)
 *   - votes: { customers: N, jobs: N, ... }
 *   - ambiguous: true if multiple types tied AND no single-target field was
 *     mapped (so we can show a hint)
 */
export function inferType(mapping, unifiedFields = UNIFIED_FIELDS) {
  const votes = { customers: 0, jobs: 0, team_members: 0, services: 0, territories: 0, leads: 0, reviews: 0 };
  const strongSignals = new Set(); // every type with a single-target mapped field

  const mappedKeys = Object.keys(mapping || {}).filter((k) => mapping[k]);
  if (mappedKeys.length === 0) return { type: 'customers', votes, ambiguous: false, mappedFields: 0 };

  // scheduledDate is the gate to the BK jobs orchestrator (creates customer +
  // job + team + territory + service + expenses + reviews from one row). If
  // it's mapped, the user wants Jobs regardless of any other signal.
  if (mapping.scheduledDate) {
    return { type: 'jobs', votes, ambiguous: false, mappedFields: mappedKeys.length };
  }

  for (const k of mappedKeys) {
    const f = unifiedFields.find((x) => x.key === k);
    if (!f) continue;
    const targets = f.targets || [];
    if (targets.length === 1) strongSignals.add(targets[0]);
    for (const t of targets) {
      votes[t] = (votes[t] || 0) + (targets.length === 1 ? 5 : 1);
    }
  }

  // When multiple types have single-target signals, prefer in this order so
  // the result aligns with intent (jobs is multi-table orchestrator first;
  // customers last since most paths create them as a side effect).
  const STRONG_PRIORITY = ['jobs', 'leads', 'reviews', 'team_members', 'services', 'territories', 'customers'];
  for (const t of STRONG_PRIORITY) {
    if (strongSignals.has(t)) {
      return { type: t, votes, ambiguous: strongSignals.size > 1, mappedFields: mappedKeys.length };
    }
  }

  // No single-target field — pick highest vote, tiebreak by general priority
  let best = null;
  let bestScore = -1;
  for (const t of TYPE_PRIORITY) {
    if (votes[t] > bestScore) { best = t; bestScore = votes[t]; }
  }
  const tied = Object.values(votes).filter((v) => v === bestScore).length > 1;
  return { type: best || 'customers', votes, ambiguous: tied, mappedFields: mappedKeys.length };
}

/**
 * Required field keys for a given target type.
 */
export function getRequiredFieldsForTarget(target, unifiedFields = UNIFIED_FIELDS) {
  return unifiedFields
    .filter((f) => (f.requiredFor || []).includes(target))
    .map((f) => f.key);
}

/**
 * Filter the mapping to only fields valid for the given target type.
 * Used before sending to the backend so we don't send unrelated fields.
 */
export function filterMappingForTarget(mapping, target, unifiedFields = UNIFIED_FIELDS) {
  const out = {};
  for (const [k, v] of Object.entries(mapping || {})) {
    if (!v) continue;
    const f = unifiedFields.find((x) => x.key === k);
    if (f && (f.targets || []).includes(target)) out[k] = v;
  }
  return out;
}

// Legacy export for any old callers (e.g. preset save flow). Returns the
// per-type field arrays the old code used to consume.
export const TARGET_FIELDS = TARGET_TYPES.reduce((acc, t) => {
  acc[t] = UNIFIED_FIELDS.filter((f) => (f.targets || []).includes(t));
  return acc;
}, {});

export function getRequiredFields(target) {
  return getRequiredFieldsForTarget(target);
}
