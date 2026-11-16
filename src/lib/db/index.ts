import "server-only";
import { neon, neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonWs } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";
import * as relations from "./relations";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const full = { ...schema, ...relations };
const isNeon = /neon\.tech|neon\.build/.test(url);

type Db = ReturnType<typeof drizzleNeonHttp<typeof full>>;
type DbTx = ReturnType<typeof drizzleNeonWs<typeof full>>;

declare global {
  // eslint-disable-next-line no-var
  var __jh: { db: Db; dbTx: DbTx } | undefined;
}

function create() {
  if (isNeon) {
    if (typeof WebSocket === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      neonConfig.webSocketConstructor = require("ws");
    }
    return {
      db: drizzleNeonHttp(neon(url!), { schema: full }) as Db,
      dbTx: drizzleNeonWs(new NeonPool({ connectionString: url }), { schema: full }) as DbTx,
    };
  }
  // Local Postgres for development/tests only (production target is Neon).
  const pool = new PgPool({ connectionString: url, max: 5 });
  const d = drizzlePg(pool, { schema: full }) as unknown as Db;
  return { db: d, dbTx: d as unknown as DbTx };
}

const inst = (globalThis.__jh ??= create());

/** Default client. Neon HTTP in prod (stateless, fast). */
export const db = inst.db;
/** Use for real transactions: `dbTx.transaction(async (tx) => {...})` (Neon WebSocket pool in prod). */
export const dbTx = inst.dbTx;
export { schema };
