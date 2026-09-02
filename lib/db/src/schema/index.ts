import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["CITIZEN", "STAFF", "ADMIN"]);
export const complaintStatusEnum = pgEnum("complaint_status", [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
]);

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const complaints = pgTable("complaints", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 30 }).notNull().unique(),
  title: varchar("title", { length: 180 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 180 }).notNull(),
  status: complaintStatusEnum("status").notNull().default("PENDING"),
  citizenId: integer("citizen_id").notNull().references(() => users.id),
  departmentId: integer("department_id").notNull().references(() => departments.id),
  assignedStaffId: integer("assigned_staff_id").references(() => users.id),
  remarks: text("remarks"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  complaintId: integer("complaint_id").references(() => complaints.id),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 180 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departmentRelations = relations(departments, ({ many }) => ({
  users: many(users),
  complaints: many(complaints),
}));

export const userRelations = relations(users, ({ one, many }) => ({
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  citizenComplaints: many(complaints, { relationName: "citizen" }),
  assignedComplaints: many(complaints, { relationName: "assignee" }),
  notifications: many(notifications),
}));

export const complaintRelations = relations(complaints, ({ one, many }) => ({
  citizen: one(users, {
    fields: [complaints.citizenId],
    references: [users.id],
    relationName: "citizen",
  }),
  department: one(departments, {
    fields: [complaints.departmentId],
    references: [departments.id],
  }),
  assignedStaff: one(users, {
    fields: [complaints.assignedStaffId],
    references: [users.id],
    relationName: "assignee",
  }),
  notifications: many(notifications),
}));

export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  complaint: one(complaints, {
    fields: [notifications.complaintId],
    references: [complaints.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type Notification = typeof notifications.$inferSelect;