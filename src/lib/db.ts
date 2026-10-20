import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const DB_PATH = process.env.WAREHOUSE_PATH ?? path.join(process.cwd(), "warehouse", "insights.db");

declare global { var __csiuDb: Database.Database | undefined }

/** Read-only connection to the warehouse, shared across requests. Run `npm run seed` to create it. */
export function db(): Database.Database {
  if (!global.__csiuDb) {
    if (!fs.existsSync(DB_PATH)) throw new Error(`Warehouse not found at ${DB_PATH}. Run: npm run seed`);
    global.__csiuDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    global.__csiuDb.pragma("query_only = 1");
  }
  return global.__csiuDb;
}

export type Row = Record<string, unknown>;
export const all = <T = Row>(sql: string, ...params: unknown[]): T[] => db().prepare(sql).all(...params) as T[];
export const one = <T = Row>(sql: string, ...params: unknown[]): T | undefined => db().prepare(sql).get(...params) as T | undefined;
export const meta = (key: string): string | undefined => one<{ value: string }>("SELECT value FROM meta WHERE key=?", key)?.value;
