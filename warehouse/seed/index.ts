// Builds warehouse/insights.db from scratch: real public data + seeded synthetic data.
// Usage: npm run seed            (SEED env var changes the synthetic universe; default 'csiu-2026')
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadReal } from "./real";
import { generate } from "./synth";
import { computeRisk } from "./risk";
import { writeSisExports } from "../../sis/export";
import { CURRENT_YEAR, TODAY } from "./catalog";

const ROOT = path.join(__dirname, "..", "..");
const DB_PATH = process.env.WAREHOUSE_PATH ?? path.join(ROOT, "warehouse", "insights.db");
const SEED = process.env.SEED ?? "csiu-2026";

function main() {
  const t0 = Date.now();
  for (const f of [DB_PATH, DB_PATH + "-wal", DB_PATH + "-shm"]) if (fs.existsSync(f)) fs.unlinkSync(f);
  const db = new Database(DB_PATH);
  db.exec(fs.readFileSync(path.join(ROOT, "warehouse", "schema.sql"), "utf8"));
  db.prepare("INSERT INTO meta(key,value) VALUES ('seed',?),('generated_at',?),('as_of',?),('school_year',?)").run(SEED, new Date().toISOString(), TODAY, CURRENT_YEAR);

  console.log("Loading real public data (PDE Future Ready, Census, PAYS, SAP)...");
  const buildings = db.transaction(() => loadReal(db))();
  console.log(`  ${buildings.length} active buildings`);

  console.log("Generating synthetic students, classrooms, and records (seed=" + SEED + ")...");
  // The generator writes child rows (attendance, grades...) before it persists the student row, so FK checks are deferred.
  db.pragma("foreign_keys = OFF");
  const stats = db.transaction(() => generate(db, buildings, SEED))();
  db.pragma("foreign_keys = ON");
  const fkProblems = db.pragma("foreign_key_check") as unknown[];
  if (fkProblems.length) throw new Error(`Foreign key check failed: ${JSON.stringify(fkProblems.slice(0, 5))}`);
  console.log(`  ${stats.students} students, ${stats.staff} staff, ${stats.interventions} intervention episodes`);

  console.log("Computing explainable risk index...");
  const levels = computeRisk(db);
  console.log("  " + levels.map((l: any) => `${l.level}: ${l.n}`).join(", "));

  console.log("Writing sample Sapphire-style SIS exports for Shikellamy (sis/exports/sample)...");
  const n = writeSisExports(db, 116496603, path.join(ROOT, "sis", "exports", "sample"));
  console.log(`  ${n} files`);

  db.exec("ANALYZE; VACUUM;");
  db.close();
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${DB_PATH}`);
}

main();
