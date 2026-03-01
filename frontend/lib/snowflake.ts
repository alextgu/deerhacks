/**
 * Snowflake client — unified Cortex Search matching layer.
 * Server-only: never expose credentials to the frontend.
 *
 * All matching (backend & frontend) flows through findSmartMatches,
 * backed by SNOWFLAKE.CORTEX.SEARCH_PREVIEW on the archetype_match_service.
 * 768-dim embeddings are generated server-side via EMBED_TEXT_768 after
 * Takeout corpus upload, making Snowflake the single source of truth.
 *
 * Environment:
 *   SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
 *   SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA
 *   CORTEX_SEARCH_SERVICE_NAME (optional, default: ARCHETYPE_MATCH_SERVICE)
 *   CORTEX_SEARCH_VECTOR_INDEX (optional, default: embedding)
 */

import snowflake from "snowflake-sdk";

const TABLE = "user_archetypes";
const DEFAULT_CORTEX_SERVICE = "ARCHETYPE_MATCH_SERVICE";
const DEFAULT_VECTOR_INDEX = "archetype_vector";

type ConnectionOptions = snowflake.ConnectionOptions;

function getConnectionOptions(): ConnectionOptions {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USER;
  const password = process.env.SNOWFLAKE_PASSWORD;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE;
  const database = process.env.SNOWFLAKE_DATABASE;
  const schema = process.env.SNOWFLAKE_SCHEMA;
  if (!account || !username || !password || !warehouse || !database || !schema) {
    throw new Error(
      "Missing Snowflake env: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA"
    );
  }
  return {
    account,
    username,
    password,
    warehouse,
    database,
    schema,
  };
}

function getConnection(): snowflake.Connection {
  return snowflake.createConnection(getConnectionOptions());
}

function connectAsync(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.connectAsync((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function executeAsync(
  connection: snowflake.Connection,
  sqlText: string,
  binds?: snowflake.Binds
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows ?? []);
      },
    });
  });
}

/**
 * Fetch a user's 768-dim embedding from Snowflake (source of truth).
 * Returns null if the user hasn't been embedded yet.
 */
export async function getUserEmbedding(
  auth0Id: string,
  serverId: string = "general"
): Promise<number[] | null> {
  const connection = getConnection();
  await connectAsync(connection);
  try {
    const sql = `
      SELECT archetype_vector::ARRAY AS emb
      FROM ${TABLE}
      WHERE user_id = ? AND server_id = ?
      LIMIT 1
    `;
    const rows = await executeAsync(connection, sql, [auth0Id, serverId]);
    const raw = rows?.[0]?.EMB ?? rows?.[0]?.emb;
    if (!raw || !Array.isArray(raw)) return null;
    return raw.map(Number);
  } finally {
    connection.destroy(() => {});
  }
}

/**
 * Find top N matching user_ids using Snowflake.
 * Tries Cortex Search first; falls back to SQL VECTOR_COSINE_SIMILARITY
 * for setups where the Cortex service isn't configured yet.
 */
export async function findSmartMatches(
  userVector: number[],
  serverId: string,
  limit: number = 3
): Promise<string[]> {
  return await findMatchesBySimilarity(userVector, serverId, limit);
}

async function findMatchesCortex(
  userVector: number[],
  serverId: string,
  limit: number
): Promise<string[]> {
  const serviceName =
    process.env.CORTEX_SEARCH_SERVICE_NAME ?? DEFAULT_CORTEX_SERVICE;
  const vectorIndex =
    process.env.CORTEX_SEARCH_VECTOR_INDEX ?? DEFAULT_VECTOR_INDEX;

  const queryPayload = {
    multi_index_query: {
      [vectorIndex]: [{ vector: userVector }],
    },
    filter: {
      "@and": [
        { "@eq": { server_id: serverId } },
        { "@eq": { is_flagged: false } },
      ],
    },
    columns: ["user_id"],
    limit,
  };

  const connection = getConnection();
  await connectAsync(connection);
  try {
    const sql = `
      SELECT PARSE_JSON(SNOWFLAKE.CORTEX.SEARCH_PREVIEW(?, ?))['results'] AS results
    `;
    const rows = await executeAsync(connection, sql, [
      serviceName,
      JSON.stringify(queryPayload),
    ]);
    const raw = rows?.[0]?.RESULTS ?? rows?.[0]?.results;
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .map(
        (r: Record<string, unknown>) =>
          r.user_id ?? r.USER_ID ?? r.auth0_id ?? r.AUTH0_ID
      )
      .filter((id): id is string => typeof id === "string");
  } finally {
    connection.destroy(() => {});
  }
}

/**
 * SQL fallback: rank candidates by VECTOR_COSINE_SIMILARITY directly.
 * Works with any vector dimension (50 or 768).
 */
async function findMatchesBySimilarity(
  userVector: number[],
  serverId: string,
  limit: number
): Promise<string[]> {
  const dim = userVector.length;
  const vecLiteral = JSON.stringify(userVector);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  const connection = getConnection();
  await connectAsync(connection);
  try {
    const sql = `
      SELECT user_id,
             VECTOR_COSINE_SIMILARITY(
               archetype_vector,
               PARSE_JSON('${vecLiteral}')::VECTOR(FLOAT, ${dim})
             ) AS score
      FROM ${TABLE}
      WHERE server_id = ?
        AND COALESCE(status, 'active') != 'flagged'
      ORDER BY score DESC
      LIMIT ${safeLimit}
    `;
    console.log("[snowflake] findMatchesBySimilarity serverId:", serverId, "dim:", dim, "limit:", safeLimit);
    const rows = await executeAsync(connection, sql, [serverId]);
    console.log("[snowflake] rows returned:", rows.length, rows.map((r: Record<string, unknown>) => ({ id: r.USER_ID ?? r.user_id, score: r.SCORE ?? r.score })));
    return rows
      .map(
        (r: Record<string, unknown>) =>
          (r.USER_ID ?? r.user_id) as string | undefined
      )
      .filter((id): id is string => typeof id === "string");
  } finally {
    connection.destroy(() => {});
  }
}

/**
 * Trigger Snowflake to embed a user's cleaned corpus and upsert into user_archetypes.
 * This calls the same SQL the backend uses: SNOWFLAKE.CORTEX.EMBED_TEXT_768
 * reading from raw_user_onboarding.
 * Useful when the frontend needs to force a re-embed (rare).
 */
export async function triggerEmbed(
  auth0Id: string,
  serverId: string = "general"
): Promise<void> {
  const connection = getConnection();
  await connectAsync(connection);
  try {
    const sql = `
      MERGE INTO ${TABLE} tgt
      USING (
        SELECT
          auth0_id AS user_id,
          ? AS server_id,
          SNOWFLAKE.CORTEX.EMBED_TEXT_768(
            'snowflake-arctic-embed-m',
            cleaned_corpus
          ) AS archetype_vector
        FROM RAW_USER_ONBOARDING
        WHERE auth0_id = ?
      ) src
      ON tgt.user_id = src.user_id AND tgt.server_id = src.server_id
      WHEN MATCHED THEN UPDATE SET
        tgt.archetype_vector = src.archetype_vector,
        tgt.updated_at       = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (user_id, server_id, archetype_vector, updated_at)
        VALUES (src.user_id, src.server_id, src.archetype_vector, CURRENT_TIMESTAMP())
    `;
    await executeAsync(connection, sql, [serverId, auth0Id]);
  } finally {
    connection.destroy(() => {});
  }
}
