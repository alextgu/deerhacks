/**
 * Snowflake client for the Comparison Layer.
 * Server-only: never expose credentials to the frontend.
 * Uses env: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
 * SNOWFLAKE_WAREHOUSE, SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA.
 */

import snowflake from "snowflake-sdk";

const VECTOR_DIM = 768;
const TABLE = "user_archetypes";

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
 * Upsert a user's archetype vector and server_id into Snowflake.
 * Table user_archetypes must have: auth0_id, server_id, embedding VECTOR(FLOAT, 768), updated_at.
 */
export async function upsertUserArchetype(
  auth0Id: string,
  serverId: string,
  vector: number[]
): Promise<void> {
  if (vector.length !== VECTOR_DIM) {
    throw new Error(`Vector must be length ${VECTOR_DIM}, got ${vector.length}`);
  }
  const connection = getConnection();
  await connectAsync(connection);
  try {
    const vectorLiteral = `[${vector.join(",")}]::VECTOR(FLOAT, ${VECTOR_DIM})`;
    const sql = `
      MERGE INTO ${TABLE} AS t
      USING (SELECT ? AS auth0_id, ? AS server_id, ${vectorLiteral} AS embedding) AS s
      ON t.auth0_id = s.auth0_id AND t.server_id = s.server_id
      WHEN MATCHED THEN UPDATE SET t.embedding = s.embedding, t.updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (auth0_id, server_id, embedding, updated_at)
        VALUES (s.auth0_id, s.server_id, s.embedding, CURRENT_TIMESTAMP())
    `;
    await executeAsync(connection, sql, [auth0Id, serverId]);
  } finally {
    connection.destroy(() => {});
  }
}

/**
 * Find top 5 matching auth0_ids by vector cosine similarity within a server.
 * Excludes auth0_ids in the excludedIds list (e.g. flagged users).
 */
export async function findMatches(
  serverId: string,
  vector: number[],
  excludedIds: string[] = []
): Promise<string[]> {
  if (vector.length !== VECTOR_DIM) {
    throw new Error(`Vector must be length ${VECTOR_DIM}, got ${vector.length}`);
  }
  const connection = getConnection();
  await connectAsync(connection);
  try {
    const vectorLiteral = `[${vector.join(",")}]::VECTOR(FLOAT, ${VECTOR_DIM})`;
    const excludeClause =
      excludedIds.length > 0
        ? `AND auth0_id NOT IN (${excludedIds.map((_) => "?").join(",")})`
        : "";
    const sql = `
      SELECT auth0_id
      FROM ${TABLE}
      WHERE server_id = ? ${excludeClause}
      ORDER BY VECTOR_COSINE_SIMILARITY(embedding, ${vectorLiteral}) DESC
      LIMIT 5
    `;
    const binds: snowflake.Binds = [serverId, ...excludedIds];
    const rows = await executeAsync(connection, sql, binds);
    return (rows as { AUTH0_ID: string }[]).map((r) => r.AUTH0_ID);
  } finally {
    connection.destroy(() => {});
  }
}
