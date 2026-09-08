export const USER_ROLES = ['admin', 'manager', 'developer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TICKET_TYPES = ['epic', 'story', 'bug'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_SEVERITIES = ['1', '2', '3', '4'] as const;
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];

export const TICKET_ENVS = ['production', 'staging', 'development'] as const;
export type TicketEnv = (typeof TICKET_ENVS)[number];

export const TICKET_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
export type TicketSize = (typeof TICKET_SIZES)[number];

export const DEPARTMENTS = [
  'Engineering Leadership',
  'Engineering',
  'Backend',
  'Infrastructure',
  'Mobile',
  'SRE',
  'Security',
  'Product',
  'Design',
  'QA',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

// Status is intentionally plain text, not a single global enum — validity depends on
// the ticket's type (see STATUS_BY_TYPE) and is enforced server-side at the API layer.
export const EPIC_STATUSES = ['Planned', 'In Progress', 'Done'] as const;
export const STORY_STATUSES = ['Backlog', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done'] as const;
export const BUG_STATUSES = STORY_STATUSES;

export type EpicStatus = (typeof EPIC_STATUSES)[number];
export type StoryStatus = (typeof STORY_STATUSES)[number];
export type BugStatus = (typeof BUG_STATUSES)[number];
export type TicketStatus = EpicStatus | StoryStatus | BugStatus;

/**
 * The union of every type's statuses, in the column order spec 04 gives for the board's
 * Type = "All" view. Also the row order of the overview's status breakdown, so an empty
 * project still renders every status at 0.
 */
export const ALL_STATUSES = [
  'Backlog',
  'Planned',
  'In Progress',
  'In Review',
  'Blocked',
  'On Hold',
  'Done',
] as const;

export const STATUS_BY_TYPE: Record<TicketType, readonly string[]> = {
  epic: EPIC_STATUSES,
  story: STORY_STATUSES,
  bug: BUG_STATUSES,
};

export interface ColorPair {
  fg: string;
  bg: string;
}

export const ROLE_COLORS: Record<UserRole, ColorPair> = {
  admin: { fg: '#6d28d9', bg: '#ede9fe' },
  manager: { fg: '#0369a1', bg: '#e0f2fe' },
  developer: { fg: '#475569', bg: '#f1f5f9' },
};

export const TYPE_COLORS: Record<TicketType, ColorPair> = {
  epic: { fg: '#6d28d9', bg: '#ede9fe' },
  story: { fg: '#0f766e', bg: '#ccfbf1' },
  bug: { fg: '#b91c1c', bg: '#fee2e2' },
};

export const STATUS_COLORS: Record<string, ColorPair> = {
  Backlog: { fg: '#475569', bg: '#f1f5f9' },
  Planned: { fg: '#0369a1', bg: '#e0f2fe' },
  'In Progress': { fg: '#1d4ed8', bg: '#dbeafe' },
  'In Review': { fg: '#7e22ce', bg: '#f3e8ff' },
  Blocked: { fg: '#9f1239', bg: '#ffe4e6' },
  'On Hold': { fg: '#92400e', bg: '#fef3c7' },
  Done: { fg: '#15803d', bg: '#dcfce7' },
};

export const PRIORITY_COLORS: Record<TicketPriority, ColorPair> = {
  critical: { fg: '#b91c1c', bg: '#fee2e2' },
  high: { fg: '#c2410c', bg: '#ffedd5' },
  medium: { fg: '#a16207', bg: '#fef9c3' },
  low: { fg: '#475569', bg: '#f1f5f9' },
};

export const SEVERITY_COLORS: Record<TicketSeverity, ColorPair> = {
  '1': { fg: '#b91c1c', bg: '#fee2e2' },
  '2': { fg: '#c2410c', bg: '#ffedd5' },
  '3': { fg: '#a16207', bg: '#fef9c3' },
  '4': { fg: '#475569', bg: '#f1f5f9' },
};

export const ENV_COLORS: Record<TicketEnv, ColorPair> = {
  production: { fg: '#fff', bg: '#0f172a' },
  staging: { fg: '#92400e', bg: '#fef3c7' },
  development: { fg: '#075985', bg: '#e0f2fe' },
};

export const TAG_PALETTE: readonly ColorPair[] = [
  { fg: '#1d4ed8', bg: '#dbeafe' },
  { fg: '#7e22ce', bg: '#f3e8ff' },
  { fg: '#0f766e', bg: '#ccfbf1' },
  { fg: '#b45309', bg: '#fef3c7' },
  { fg: '#be185d', bg: '#fce7f3' },
  { fg: '#4338ca', bg: '#e0e7ff' },
  { fg: '#15803d', bg: '#dcfce7' },
  { fg: '#b91c1c', bg: '#fee2e2' },
];

export const NEUTRAL_TAG: ColorPair = { fg: '#475569', bg: '#f1f5f9' };
