import { ticketCreateSchema, type TicketCreateDto, type TicketType } from '@ticket-tracker/shared';

/** Everything the form can hold, flat; only the fields relevant to `type` are submitted. */
export interface CreateForm {
  type: TicketType;
  title: string;
  description: string;
  assigneeId: string;
  labels: string;
  priority: string;
  severity: string;
  env: string;
  size: string;
  epicId: string;
  storyId: string;
  sprintId: string;
  startDate: string;
  estimatedEndDate: string;
}

/**
 * Defaults chosen so a Story/Bug form is valid the moment an epic is picked — the shared
 * schema requires env and size (and severity on bugs) with no defaults of its own.
 */
export const emptyForm = (type: TicketType = 'story'): CreateForm => ({
  type,
  title: '',
  description: '',
  assigneeId: '',
  labels: '',
  priority: 'medium',
  severity: '3',
  env: 'staging',
  size: 'm',
  epicId: '',
  storyId: '',
  sprintId: '',
  startDate: '',
  estimatedEndDate: '',
});

/** "frontend, api" → ["frontend", "api"], dropping blanks and duplicates. */
export function parseLabels(input: string): string[] {
  return [...new Set(input.split(',').map((l) => l.trim()).filter(Boolean))];
}

const orNull = (value: string) => (value === '' ? null : value);

/**
 * Form → the discriminated union the API expects (spec 06). Fields that don't belong to the
 * chosen type are never sent, rather than sent as null — the union rejects unknown members,
 * and the server nulls type-inappropriate columns anyway (M5a).
 *
 * `reporter` is deliberately absent: the server fills it from the acting user.
 */
export function buildPayload(form: CreateForm): TicketCreateDto {
  const base = {
    title: form.title.trim(),
    description: form.description,
    assigneeId: orNull(form.assigneeId),
    labels: parseLabels(form.labels),
  };

  if (form.type === 'epic') {
    return { ...base, type: 'epic', priority: form.priority } as TicketCreateDto;
  }

  const storyOrBug = {
    ...base,
    priority: form.priority,
    env: form.env,
    size: form.size,
    epicId: form.epicId,
    sprintId: orNull(form.sprintId),
    startDate: orNull(form.startDate),
    estimatedEndDate: orNull(form.estimatedEndDate),
  };

  if (form.type === 'story') return { ...storyOrBug, type: 'story' } as TicketCreateDto;
  return { ...storyOrBug, type: 'bug', severity: form.severity, storyId: orNull(form.storyId) } as TicketCreateDto;
}

/**
 * Validates with the **same schema the API enforces**, so the form can't offer a payload the
 * server will reject. Returns field-keyed messages for inline display.
 */
export function validate(form: CreateForm): Record<string, string> {
  const result = ticketCreateSchema.safeParse(buildPayload(form));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}
