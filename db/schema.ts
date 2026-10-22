import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  email: text("email").notNull().unique(), authId: text("auth_id").unique(),
  role: text("role").notNull(), state: text("state").notNull(),
  inviteExpires: text("invite_expires"), createdAt: text("created_at").notNull(),
});

// Unique natural keys prevent duplicate attendance, daily and weekly reports.
// Each document is versioned; writes use compare-and-swap inside a D1 batch.
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), kind: text("kind").notNull(),
  naturalKey: text("natural_key").notNull(), ownerId: text("owner_id"),
  projectId: text("project_id"), taskId: text("task_id"), date: text("date"),
  status: text("status").notNull(), revision: integer("revision").notNull().default(1),
  data: text("data").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("record_natural_key").on(t.kind, t.naturalKey), index("record_scope").on(t.kind, t.ownerId), index("record_task").on(t.taskId)]);

export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(),
  action: text("action").notNull(), entityId: text("entity_id").notNull(),
  before: text("before"), after: text("after"), createdAt: text("created_at").notNull(),
});
