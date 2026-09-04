import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// App users — synced from Neon Auth session on each login
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  image: text("image"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

/** Emails autorizados a usar la app (además del admin fijo). */
export const allowedEmails = pgTable("allowed_emails", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  createdBy: text("created_by"),
});

export const households = pgTable("households", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().default("Mi espacio"),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member">().notNull().default("member"),
    displayName: text("display_name"),
    joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    index("hm_user_idx").on(t.userId),
  ],
);

export const categories = pgTable("categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").$type<"expense" | "payment" | "interest">().notNull(),
  defaultOwnership: text("default_ownership")
    .$type<"personal" | "shared">()
    .notNull()
    .default("personal"),
  isSystem: boolean("is_system").notNull().default(true),
  /** null = categoría global del sistema; set = personalizada del hogar */
  householdId: text("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
});

/** Preferencias por hogar: ocultar categorías del sistema sin borrarlas. */
export const householdCategoryPrefs = pgTable(
  "household_category_prefs",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    hidden: boolean("hidden").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.categoryId] }),
    index("hcp_household_idx").on(t.householdId),
  ],
);

export const merchantRules = pgTable("merchant_rules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  householdId: text("household_id").references(() => households.id, {
    onDelete: "cascade",
  }),
  pattern: text("pattern").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(50),
});

export const cardStatements = pgTable("card_statements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("bbva_xlsx"),
  fileName: text("file_name"),
  importedBy: text("imported_by").references(() => users.id),
  importedAt: timestamp("imported_at", { mode: "date" }).defaultNow().notNull(),
  rowCount: integer("row_count").notNull().default(0),
});

export const transactions = pgTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    statementId: text("statement_id").references(() => cardStatements.id, {
      onDelete: "set null",
    }),
    date: text("date").notNull(),
    descriptionRaw: text("description_raw").notNull(),
    descriptionNormalized: text("description_normalized").notNull(),
    amountArs: numeric("amount_ars", { precision: 14, scale: 2 }),
    amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }),
    installment: text("installment"),
    isPayment: boolean("is_payment").notNull().default(false),
    isCredit: boolean("is_credit").notNull().default(false),
    categoryId: text("category_id").references(() => categories.id),
    ownership: text("ownership")
      .$type<"personal" | "shared">()
      .notNull()
      .default("personal"),
    paidByUserId: text("paid_by_user_id").references(() => users.id),
    splitPct: integer("split_pct").notNull().default(50),
    externalFingerprint: text("external_fingerprint").notNull(),
    source: text("source").notNull().default("bbva_import"),
    bank: text("bank"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("tx_household_fp_uidx").on(t.householdId, t.externalFingerprint),
    index("tx_household_date_idx").on(t.householdId, t.date),
    index("tx_household_cat_idx").on(t.householdId, t.categoryId),
    index("tx_household_bank_idx").on(t.householdId, t.bank),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    merchantName: text("merchant_name"),
    receiptDate: text("receipt_date"),
    totalArs: numeric("total_ars", { precision: 14, scale: 2 }),
    currency: text("currency").default("ARS"),
    ocrRaw: jsonb("ocr_raw"),
    status: text("status")
      .$type<"pending" | "parsed" | "matched" | "failed">()
      .notNull()
      .default("pending"),
    transactionId: text("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("receipts_household_idx").on(t.householdId),
    index("receipts_tx_idx").on(t.transactionId),
  ],
);

export const receiptItems = pgTable("receipt_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  receiptId: text("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).default("1"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  lineTotal: numeric("line_total", { precision: 14, scale: 2 }),
  productCategory: text("product_category"),
});

export const savingsAssets = pgTable(
  "savings_assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"evm" | "cardano" | "bank">().notNull(),
    label: text("label").notNull(),
    address: text("address"),
    amountArs: numeric("amount_ars", { precision: 16, scale: 2 }),
    amountUsd: numeric("amount_usd", { precision: 16, scale: 2 }),
    lastBalanceUsd: numeric("last_balance_usd", { precision: 16, scale: 2 }),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("savings_user_idx").on(t.userId),
    index("savings_household_idx").on(t.householdId),
  ],
);


export const debtSettings = pgTable("debt_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Tasa nominal anual (TNA) en %. Ej: 90 = 90% TNA. */
  ratePct: numeric("rate_pct", { precision: 8, scale: 4 }),
  minPaymentArs: numeric("min_payment_ars", { precision: 14, scale: 2 }),
  /** Día de vencimiento del mes (1–31). */
  dueDay: integer("due_day"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const incomes = pgTable(
  "incomes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    label: text("label").notNull(),
    amountArs: numeric("amount_ars", { precision: 14, scale: 2 }),
    amountUsd: numeric("amount_usd", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("incomes_user_idx").on(t.userId),
    index("incomes_household_date_idx").on(t.householdId, t.date),
  ],
);

export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptItem = typeof receiptItems.$inferSelect;
export type SavingsAsset = typeof savingsAssets.$inferSelect;
export type DebtSettings = typeof debtSettings.$inferSelect;
export type Income = typeof incomes.$inferSelect;
