# Drizzle migrations

The numbered `*.sql` files in this directory capture **incremental** schema
changes that have shipped to production. They are NOT a complete schema —
the original tables (`users`, `accounts`, `sessions`, `folders`, `topics`,
`files`, `library_items`, `recent_files`, `shares`, `quiz_attempts`,
`srs_decks`, `study_sessions`, `study_plans`) only exist in
`lib/db/schema.ts`.

## How to deploy

```bash
npm run db:push
```

That maps to `drizzle-kit push`, which diffs the live DB against `schema.ts`
and applies whatever's missing. Always use this for fresh deploys — running
`drizzle-kit migrate` against the SQL files alone would skip the original
tables and produce an incomplete schema.

## Adding a new migration

1. Edit `lib/db/schema.ts` with the new column / table.
2. Either `npm run db:push` (preferred for solo / small-team workflow), or
   `npx drizzle-kit generate` to create the next-numbered SQL file and review
   it before applying.
3. If you write SQL by hand, gate every statement with `IF NOT EXISTS` / `IF
   EXISTS` so it can be re-run safely.

## Production parity

Vercel auto-deploys on push to `main`. The build does NOT run migrations —
DB changes go through `npm run db:push` against the production
`SUPABASE_DATABASE_URL` (or `DATABASE_URL`) explicitly. Plan any schema
change as a two-step deploy: push the schema first, then push the code that
depends on it.
