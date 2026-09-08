import { date, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const sprints = pgTable('sprints', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
});
