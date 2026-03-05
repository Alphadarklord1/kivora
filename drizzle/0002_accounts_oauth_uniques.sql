-- Deduplicate legacy OAuth account rows before applying uniqueness constraints.
WITH ranked_provider_account AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider, provider_account_id
      ORDER BY id
    ) AS rn
  FROM accounts
),
provider_account_dupes AS (
  SELECT id
  FROM ranked_provider_account
  WHERE rn > 1
)
DELETE FROM accounts a
USING provider_account_dupes d
WHERE a.id = d.id;

WITH ranked_user_provider AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, provider
      ORDER BY id
    ) AS rn
  FROM accounts
),
user_provider_dupes AS (
  SELECT id
  FROM ranked_user_provider
  WHERE rn > 1
)
DELETE FROM accounts a
USING user_provider_dupes d
WHERE a.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_provider_account_id_uq
  ON accounts (provider, provider_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_provider_uq
  ON accounts (user_id, provider);

