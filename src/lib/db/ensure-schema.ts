import { getDb, hasDatabase } from "@/lib/db";
import { sql } from "drizzle-orm";

let ensured = false;

/**
 * Idempotent schema bootstrap (no local drizzle-kit needed).
 * Neon HTTP driver only allows one SQL command per prepared statement,
 * so each statement is executed separately.
 */
export async function ensureSchema() {
  if (ensured || !hasDatabase()) return;
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
      CREATE TABLE IF NOT EXISTS households (
        id text PRIMARY KEY,
        name text NOT NULL DEFAULT 'Nuestro hogar',
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
      CREATE TABLE IF NOT EXISTS categories (
        id text PRIMARY KEY,
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        kind text NOT NULL,
        default_ownership text NOT NULL DEFAULT 'personal',
        is_system boolean NOT NULL DEFAULT true
      )
    `,
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
  ];

  for (const statement of statements) {
    await db.execute(statement);
  }

  ensured = true;
}
