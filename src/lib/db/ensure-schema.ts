import { getDb, hasDatabase } from "@/lib/db";
import { sql } from "drizzle-orm";

let ensured = false;
let ensuring: Promise<void> | null = null;

/** Errors that mean “already there” under concurrent serverless boots. */
function isIgnorableSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const cause =
    e && typeof e === "object" && "cause" in e
      ? (e as { cause?: { code?: string; message?: string } }).cause
      : undefined;
  const code = cause?.code ?? "";
  const text = `${msg} ${cause?.message ?? ""}`;
  return (
    code === "42P07" || // duplicate_table
    code === "42710" || // duplicate_object
    code === "42701" || // duplicate_column
    code === "23505" || // unique_violation (pg_type race)
    /already exists/i.test(text) ||
    /duplicate key/i.test(text) ||
    /duplicate column/i.test(text)
  );
}

async function runStatement(
  db: ReturnType<typeof getDb>,
  statement: ReturnType<typeof sql>,
) {
  try {
    await db.execute(statement);
  } catch (e) {
    if (isIgnorableSchemaError(e)) return;
    throw e;
  }
}

/**
 * Idempotent schema bootstrap (no local drizzle-kit needed).
 * Neon HTTP driver only allows one SQL command per prepared statement,
 * so each statement is executed separately. Concurrent cold starts are safe.
 */
export async function ensureSchema() {
  if (ensured || !hasDatabase()) return;
  if (ensuring) {
    await ensuring;
    return;
  }

  ensuring = (async () => {
    const db = getDb();

    const statements = [
      sql`
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          name text,
          email text UNIQUE,
          image text,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS allowed_emails (
          email text PRIMARY KEY,
          created_at timestamp DEFAULT now() NOT NULL,
          created_by text
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS households (
          id text PRIMARY KEY,
          name text NOT NULL DEFAULT 'Mi espacio',
          invite_code text NOT NULL UNIQUE,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS household_members (
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role text NOT NULL DEFAULT 'member',
          display_name text,
          joined_at timestamp DEFAULT now() NOT NULL,
          PRIMARY KEY (household_id, user_id)
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS hm_user_idx ON household_members(user_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS household_api_tokens (
          id text PRIMARY KEY,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          token_hash text NOT NULL,
          token_prefix text NOT NULL,
          created_by text REFERENCES users(id) ON DELETE SET NULL,
          created_at timestamp DEFAULT now() NOT NULL,
          last_used_at timestamp,
          revoked_at timestamp
        )
      `,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS hat_hash_uidx ON household_api_tokens(token_hash)`,
      sql`CREATE INDEX IF NOT EXISTS hat_household_idx ON household_api_tokens(household_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS categories (
          id text PRIMARY KEY,
          slug text NOT NULL UNIQUE,
          name text NOT NULL,
          kind text NOT NULL,
          default_ownership text NOT NULL DEFAULT 'personal',
          is_system boolean NOT NULL DEFAULT true
        )
      `,
      // No FK inline — safer on existing DBs / concurrent ALTERs
      sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS household_id text`,
      sql`
        CREATE TABLE IF NOT EXISTS household_category_prefs (
          household_id text NOT NULL,
          category_id text NOT NULL,
          hidden boolean NOT NULL DEFAULT true,
          PRIMARY KEY (household_id, category_id)
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS hcp_household_idx ON household_category_prefs(household_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS merchant_rules (
          id text PRIMARY KEY,
          household_id text REFERENCES households(id) ON DELETE CASCADE,
          pattern text NOT NULL,
          category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          priority integer NOT NULL DEFAULT 50
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS card_statements (
          id text PRIMARY KEY,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          source text NOT NULL DEFAULT 'bbva_xlsx',
          file_name text,
          imported_by text REFERENCES users(id),
          imported_at timestamp DEFAULT now() NOT NULL,
          row_count integer NOT NULL DEFAULT 0
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS transactions (
          id text PRIMARY KEY,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          statement_id text REFERENCES card_statements(id) ON DELETE SET NULL,
          date text NOT NULL,
          description_raw text NOT NULL,
          description_normalized text NOT NULL,
          amount_ars numeric(14,2),
          amount_usd numeric(14,2),
          installment text,
          is_payment boolean NOT NULL DEFAULT false,
          is_credit boolean NOT NULL DEFAULT false,
          category_id text REFERENCES categories(id),
          ownership text NOT NULL DEFAULT 'personal',
          paid_by_user_id text REFERENCES users(id),
          split_pct integer NOT NULL DEFAULT 50,
          external_fingerprint text NOT NULL,
          source text NOT NULL DEFAULT 'bbva_import',
          bank text,
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`
        CREATE UNIQUE INDEX IF NOT EXISTS tx_household_fp_uidx
          ON transactions(household_id, external_fingerprint)
      `,
      sql`
        CREATE INDEX IF NOT EXISTS tx_household_date_idx
          ON transactions(household_id, date)
      `,
      sql`
        CREATE INDEX IF NOT EXISTS tx_household_cat_idx
          ON transactions(household_id, category_id)
      `,
      sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank text`,
      sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_last4 text`,
      sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_transaction_id text`,
      sql`CREATE INDEX IF NOT EXISTS tx_linked_idx ON transactions(linked_transaction_id)`,
      sql`
        CREATE INDEX IF NOT EXISTS tx_household_bank_idx
          ON transactions(household_id, bank)
      `,
      sql`
        CREATE TABLE IF NOT EXISTS receipts (
          id text PRIMARY KEY,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          image_url text NOT NULL,
          merchant_name text,
          receipt_date text,
          total_ars numeric(14,2),
          currency text DEFAULT 'ARS',
          ocr_raw jsonb,
          status text NOT NULL DEFAULT 'pending',
          transaction_id text REFERENCES transactions(id) ON DELETE SET NULL,
          created_by text REFERENCES users(id),
          created_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS receipts_household_idx ON receipts(household_id)`,
      sql`CREATE INDEX IF NOT EXISTS receipts_tx_idx ON receipts(transaction_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS receipt_items (
          id text PRIMARY KEY,
          receipt_id text NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
          name text NOT NULL,
          quantity numeric(10,3) DEFAULT '1',
          unit_price numeric(14,2),
          line_total numeric(14,2),
          product_category text
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS savings_assets (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          kind text NOT NULL,
          label text NOT NULL,
          address text,
          amount_ars numeric(16,2),
          amount_usd numeric(16,2),
          last_balance_usd numeric(16,2),
          last_synced_at timestamp,
          sync_error text,
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS savings_user_idx ON savings_assets(user_id)`,
      sql`CREATE INDEX IF NOT EXISTS savings_household_idx ON savings_assets(household_id)`,
      sql`
        CREATE TABLE IF NOT EXISTS debt_settings (
          user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          rate_pct numeric(8,4),
          min_payment_ars numeric(14,2),
          due_day integer,
          notes text,
          force_settled boolean NOT NULL DEFAULT false,
          cleared_at timestamp,
          card_last4 text,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS incomes (
          id text PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          kind text NOT NULL DEFAULT 'variable',
          frequency text,
          date text NOT NULL,
          label text NOT NULL,
          amount_ars numeric(14,2),
          amount_usd numeric(14,2),
          created_at timestamp DEFAULT now() NOT NULL,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`ALTER TABLE debt_settings ADD COLUMN IF NOT EXISTS force_settled boolean NOT NULL DEFAULT false`,
      sql`ALTER TABLE debt_settings ADD COLUMN IF NOT EXISTS cleared_at timestamp`,
      sql`ALTER TABLE debt_settings ADD COLUMN IF NOT EXISTS card_last4 text`,
      sql`ALTER TABLE incomes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'variable'`,
      sql`ALTER TABLE incomes ADD COLUMN IF NOT EXISTS frequency text`,
      sql`ALTER TABLE incomes ADD COLUMN IF NOT EXISTS external_fingerprint text`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS incomes_household_fp_uidx ON incomes(household_id, external_fingerprint) WHERE external_fingerprint IS NOT NULL`,
      sql`CREATE INDEX IF NOT EXISTS incomes_user_idx ON incomes(user_id)`,
      sql`CREATE INDEX IF NOT EXISTS incomes_household_date_idx ON incomes(household_id, date)`,
      sql`CREATE INDEX IF NOT EXISTS incomes_user_kind_idx ON incomes(user_id, kind)`,
      sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          polar_subscription_id text PRIMARY KEY,
          status text NOT NULL,
          current_period_end timestamp,
          updated_at timestamp DEFAULT now() NOT NULL
        )
      `,
      sql`CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id)`,
    ];

    for (const statement of statements) {
      await runStatement(db, statement);
    }

    ensured = true;
  })();

  try {
    await ensuring;
  } finally {
    ensuring = null;
  }
}
