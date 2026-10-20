// Loads a SIS extract into the warehouse through the SisConnector interface.
// Usage: npm run sis:load -- [exportDir] [aun]      (defaults: sis/exports/sample, Shikellamy)
// Idempotent: rows are upserted by natural key. Demonstrates the integration path; real connectors plug into connector.ts.
import path from "node:path";
import Database from "better-sqlite3";
import { SapphireFileConnector, type SisConnector } from "./connector";

const ROOT = path.join(__dirname, "..");

export async function loadFromConnector(db: Database.Database, connector: SisConnector) {
  const x = await connector.fetch();
  const statusFor = (code: string) => code === "E" ? "absent_excused" : code === "U" ? "absent_unexcused" : code === "T" ? "tardy" : "absent_unexcused";
  const upAtt = db.prepare("INSERT OR REPLACE INTO attendance_daily(student_id,date,status) VALUES (?,?,?)");
  const upGrade = db.prepare("INSERT OR REPLACE INTO course_grades(student_id,school_year,term,subject,letter,percent) VALUES (?,?,?,?,?,?)");
  const exists = db.prepare("SELECT 1 FROM students WHERE id=?");
  const upDemo = db.prepare("UPDATE students SET grade=?, gender=?, econ_disadvantaged=?, iep=?, el=?, gifted=?, section504=? WHERE id=?");
  const counts = { demographics: 0, attendance: 0, grades: 0, discipline: 0, assessments: 0, skipped: 0 };
  const tx = db.transaction(() => {
    for (const d of x.demographics) {
      if (!exists.get(d.student_number)) { counts.skipped++; continue; }   // new students would be inserted here in production
      upDemo.run(parseInt(d.grade, 10), d.gender, d.econ_disadvantaged === "Y" ? 1 : 0, d.iep === "Y" ? 1 : 0, d.el === "Y" ? 1 : 0, d.gifted === "Y" ? 1 : 0, d.section_504 === "Y" ? 1 : 0, d.student_number);
      counts.demographics++;
    }
    for (const a of x.attendance) { upAtt.run(a.student_number, a.date, statusFor(a.code)); counts.attendance++; }
    for (const g of x.grades) { upGrade.run(g.student_number, g.school_year, g.term, g.subject, g.letter, parseFloat(g.percent)); counts.grades++; }
    const hasRef = db.prepare("SELECT 1 FROM behavior_referrals WHERE student_id=? AND date=? AND category=? AND location=?");
    const insRef = db.prepare("INSERT INTO behavior_referrals(student_id,date,category,location,time_of_day,action,minor) VALUES (?,?,?,?,?,?,?)");
    for (const r of x.discipline) { if (!hasRef.get(r.student_number, r.incident_date, r.infraction, r.location)) { insRef.run(r.student_number, r.incident_date, r.infraction, r.location, r.time_of_day, r.action_taken, r.minor === "Y" ? 1 : 0); counts.discipline++; } }
    const hasScr = db.prepare("SELECT id FROM screener_results WHERE student_id=? AND tool=? AND subject=? AND school_year=? AND window=? AND measure=?");
    const upScr = db.prepare("UPDATE screener_results SET score=?, percentile=?, benchmark=?, date=? WHERE id=?");
    const insScr = db.prepare("INSERT INTO screener_results(student_id,tool,subject,school_year,window,measure,score,percentile,benchmark,date) VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const s of x.assessments) {
      const row = hasScr.get(s.student_number, s.assessment, s.subject, s.school_year, s.window, s.measure) as { id: number } | undefined;
      if (row) upScr.run(parseFloat(s.score), parseFloat(s.percentile), s.benchmark_status, s.test_date, row.id);
      else insScr.run(s.student_number, s.assessment, s.subject, s.school_year, s.window, s.measure, parseFloat(s.score), parseFloat(s.percentile), s.benchmark_status, s.test_date);
      counts.assessments++;
    }
    db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES (?,?)").run(`sis_last_load_${connector.districtAun}`, new Date().toISOString());
  });
  tx();
  return counts;
}

if (require.main === module) {
  const dir = process.argv[2] ?? path.join(ROOT, "sis", "exports", "sample");
  const aun = parseInt(process.argv[3] ?? "116496603", 10);
  const db = new Database(process.env.WAREHOUSE_PATH ?? path.join(ROOT, "warehouse", "insights.db"));
  loadFromConnector(db, new SapphireFileConnector(aun, dir)).then((c) => { console.log("Loaded via", "SapphireFileConnector:", c); db.close(); });
}
