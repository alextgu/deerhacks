# Snowflake setup for Comparison Layer

Run in **Snowflake** (not Supabase). Create the table and warehouse/schema if needed.

## Table: user_archetypes

```sql
CREATE TABLE IF NOT EXISTS user_archetypes (
  auth0_id   VARCHAR(255) NOT NULL,
  server_id  VARCHAR(255) NOT NULL,
  embedding  VECTOR(FLOAT, 768) NOT NULL,
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (auth0_id, server_id)
);
```

Use the same database/schema as in your Snowflake env vars (`SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`).
