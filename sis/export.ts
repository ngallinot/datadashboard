// Writes Sapphire-style export files for one district from the (synthetic) warehouse.
// Used by the seed script to produce sample files that the loader can round-trip.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { toCsv } from "./connector";

export function writeSisExports(db: Database.Database, aun: number, dir: string): number {
  fs.mkdirSync(dir, { recursive: true });
  const dist = db.prepare("SELECT name FROM districts WHERE aun=?").get(aun) as { name: string };
  const demo = db.prepare(`SELECT s.id AS student_number, s.state_id, s.last_name, s.first_name, s.grade, s.gender, s.race AS race_ethnicity,
      b.id AS school_code, b.name AS school_name, c.name AS homeroom, (st.last_name || ', ' || st.first_name) AS homeroom_teacher,
      CASE s.econ_disadvantaged WHEN 1 THEN 'Y' ELSE 'N' END AS econ_disadvantaged, CASE s.iep WHEN 1 THEN 'Y' ELSE 'N' END AS iep,
      CASE s.el WHEN 1 THEN 'Y' ELSE 'N' END AS el, CASE s.gifted WHEN 1 THEN 'Y' ELSE 'N' END AS gifted, CASE s.section504 WHEN 1 THEN 'Y' ELSE 'N' END AS section_504,
      s.enrolled_since AS entry_date
    FROM students s JOIN buildings b ON b.id=s.building_id LEFT JOIN classrooms c ON c.id=s.classroom_id LEFT JOIN staff st ON st.id=c.teacher_id
    WHERE s.aun=? ORDER BY b.id, s.grade, s.last_name`).all(aun) as Record<string, unknown>[];
  const att = db.prepare(`SELECT a.student_id AS student_number, a.date,
      CASE a.status WHEN 'absent_excused' THEN 'E' WHEN 'absent_unexcused' THEN 'U' WHEN 'tardy' THEN 'T' ELSE 'A' END AS code,
      CASE a.status WHEN 'absent_excused' THEN 'Absent - Excused' WHEN 'absent_unexcused' THEN 'Absent - Unexcused' WHEN 'tardy' THEN 'Tardy' ELSE 'Absent' END AS description
    FROM attendance_daily a JOIN students s ON s.id=a.student_id WHERE s.aun=? ORDER BY a.date, a.student_id`).all(aun) as Record<string, unknown>[];
  const grades = db.prepare(`SELECT g.student_id AS student_number, g.school_year, (g.subject || ' ' || s.grade) AS course, g.subject, g.term, g.letter, g.percent
    FROM course_grades g JOIN students s ON s.id=g.student_id WHERE s.aun=? ORDER BY g.student_id, g.school_year, g.term`).all(aun) as Record<string, unknown>[];
  const disc = db.prepare(`SELECT r.student_id AS student_number, r.date AS incident_date, r.category AS infraction, r.location, r.time_of_day, r.action AS action_taken,
      CASE r.minor WHEN 1 THEN 'Y' ELSE 'N' END AS minor
    FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.aun=? ORDER BY r.date`).all(aun) as Record<string, unknown>[];
  const tools = db.prepare(`SELECT DISTINCT tool FROM screener_results r JOIN students s ON s.id=r.student_id WHERE s.aun=?`).all(aun) as { tool: string }[];
  let n = 0;
  const write = (name: string, rows: Record<string, unknown>[]) => { fs.writeFileSync(path.join(dir, name), toCsv(rows)); n++; };
  write("demographics.csv", demo); write("attendance.csv", att); write("grades.csv", grades); write("discipline.csv", disc);
  for (const { tool } of tools) {
    const rows = db.prepare(`SELECT r.student_id AS student_number, r.tool AS assessment, r.subject, r.school_year, r.window, r.measure, r.score, r.percentile, r.benchmark AS benchmark_status, r.date AS test_date
      FROM screener_results r JOIN students s ON s.id=r.student_id WHERE s.aun=? AND r.tool=? ORDER BY r.date, r.student_id`).all(aun, tool) as Record<string, unknown>[];
    write(`assessment_${tool.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`, rows);
  }
  fs.writeFileSync(path.join(dir, "README.md"), `# Sample SIS export — ${dist.name}\n\nSapphire-style CSV exports generated from the synthetic warehouse (no real students). These files are what a nightly\nSIS extract would deliver; \`npm run sis:load\` reads them through the \`SapphireFileConnector\` and upserts them into the warehouse.\n\n| File | Rows | Source system |\n|---|---|---|\n| demographics.csv | ${demo.length} | SIS student demographics |\n| attendance.csv | ${att.length} | SIS daily attendance (non-present codes only) |\n| grades.csv | ${grades.length} | SIS gradebook |\n| discipline.csv | ${disc.length} | SIS discipline / ODR |\n${tools.map((t) => `| assessment_${t.tool.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv | — | ${t.tool} import file |`).join("\n")}\n`);
  return n + 1;
}
