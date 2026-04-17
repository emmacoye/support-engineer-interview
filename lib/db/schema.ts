import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").unique().notNull(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  ssn: text("ssn").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    accountNumber: text("account_number").unique().notNull(),
    accountType: text("account_type").notNull(), // checking, savings
    // PERF-406: SQLite type REAL; values are whole-number **cents** after `perf406_dollars_to_cents` migration.
    balance: real("balance").default(0).notNull(),
    status: text("status").default("pending"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    // PERF-407: list accounts by user (getAccounts, ownership checks).
    userIdIdx: index("accounts_user_id_idx").on(t.userId),
  })
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .references(() => accounts.id)
      .notNull(),
    type: text("type").notNull(), // deposit, withdrawal
    // PERF-406: SQLite type REAL; values are whole-number **cents** after migration.
    amount: real("amount").notNull(),
    description: text("description"),
    status: text("status").default("pending").notNull(),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    processedAt: text("processed_at"),
  },
  (t) => ({
    // PERF-407: history query filters by account_id and orders by created_at DESC — composite avoids full scans.
    accountIdCreatedAtIdx: index("transactions_account_id_created_at_idx").on(t.accountId, t.createdAt),
  })
);

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  token: text("token").unique().notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
