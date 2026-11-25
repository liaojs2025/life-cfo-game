import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const visits = sqliteTable('visits', {
  id: text('id').primaryKey(),
});

export const finishes = sqliteTable('finishes', {
  run: text('run').primaryKey(),
  country: text('country').notNull(),
  edition: text('edition').notNull(),
  outcome: text('outcome').notNull(),
  year: integer('year').notNull(),
  wealth: real('wealth').notNull(),
  investmentReturn: real('investment_return').notNull(),
  recordedAt: integer('recorded_at').notNull(),
  finishedAt: integer('finished_at'),
}, t => [
  index('finish_time').on(t.recordedAt),
  index('finish_outcome').on(t.outcome),
  index('finish_rank').on(t.outcome, sql`investment_return DESC`, t.recordedAt, t.run),
]);
