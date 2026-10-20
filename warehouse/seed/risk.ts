// Explainable early-warning index. Simple additive points with plain-language factors.
// Explainability over sophistication: every point is traceable to a visible fact about the student.
import type Database from "better-sqlite3";
import { CURRENT_YEAR, PRIOR_YEAR, TODAY } from "./catalog";

export interface Factor { factor: string; weight: "strong" | "some"; detail: string; domain: string }

const LETTER_RANK: Record<string, number> = { "A+": 12, A: 11, "A-": 10, "B+": 9, B: 8, "B-": 7, "C+": 6, C: 5, "C-": 4, "D+": 3, D: 2, "D-": 1, F: 0 };

export function computeRisk(db: Database.Database) {
  const students = db.prepare("SELECT id, grade, new_to_building, prior_year_absences, building_id FROM students").all() as any[];
  const nDays = (db.prepare("SELECT COUNT(DISTINCT date) AS n FROM attendance_daily").get() as any).n || 40;
  const absQ = db.prepare("SELECT date, status FROM attendance_daily WHERE student_id=? AND status LIKE 'absent%' ORDER BY date");
  const refQ = db.prepare("SELECT COUNT(*) AS n FROM behavior_referrals WHERE student_id=?");
  const gradeQ = db.prepare("SELECT subject, term, letter, percent FROM course_grades WHERE student_id=? AND school_year=?");
  const scrQ = db.prepare("SELECT subject, benchmark FROM screener_results WHERE student_id=? AND school_year=? AND window='fall'");
  const wellQ = db.prepare("SELECT risk_level, anxiety FROM wellness_screens WHERE student_id=? AND school_year=? AND window='fall'");
  const chkQ = db.prepare("SELECT score FROM wellness_checkins WHERE student_id=? ORDER BY date DESC LIMIT 4");
  const nurseQ = db.prepare("SELECT COUNT(*) AS n FROM nurse_visits WHERE student_id=?");
  const ins = db.prepare("INSERT OR REPLACE INTO student_risk(student_id,as_of,score,level,attendance_pts,behavior_pts,course_pts,screener_pts,wellness_pts,factors_json,strengths_json,flagged_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  const allDates = (db.prepare("SELECT DISTINCT date FROM attendance_daily ORDER BY date").all() as any[]).map((r) => r.date);
  const firstHalf = new Set(allDates.slice(0, Math.floor(nDays / 2)));

  const tx = db.transaction(() => {
    for (const s of students) {
      const factors: Factor[] = []; const strengths: string[] = [];
      let att = 0, beh = 0, course = 0, scr = 0, well = 0;
      const abs = absQ.all(s.id) as { date: string; status: string }[];
      const rate = abs.length / nDays;
      const early = abs.filter((a) => firstHalf.has(a.date)).length, late = abs.length - early;
      const mondays = abs.filter((a) => new Date(a.date + "T12:00:00Z").getUTCDay() === 1).length;
      const priorAtSameTime = Math.round(s.prior_year_absences * nDays / 180);
      if (rate >= 0.2) { att += 30; factors.push({ domain: "attendance", factor: "Missing one day in five", weight: "strong", detail: `${abs.length} days missed in ${nDays} school days (${Math.round(rate * 100)}%).` }); }
      else if (rate >= 0.1) { att += 16; factors.push({ domain: "attendance", factor: "On pace for chronic absence", weight: "strong", detail: `${abs.length} days missed so far; 10% or more of days is chronic absence.` }); }
      else if (rate >= 0.07) { att += 6; factors.push({ domain: "attendance", factor: "Absences above the building average", weight: "some", detail: `${abs.length} days missed so far this year.` }); }
      if (late >= 3 && late >= early * 2) { att += 10; factors.push({ domain: "attendance", factor: "Absences rising quickly", weight: "strong", detail: `${late} of ${abs.length} absences came in the most recent weeks, compared with ${priorAtSameTime} at this time last year.` }); }
      if (mondays >= 3 && mondays / Math.max(1, abs.length) >= 0.5) factors.push({ domain: "attendance", factor: "Most absences fall on Mondays", weight: "some", detail: `${mondays} of ${abs.length} absences were on a Monday.` });
      if (abs.length <= 1) strengths.push(abs.length === 0 ? "Perfect attendance so far this year" : "Strong attendance: only 1 day missed");

      const refs = (refQ.get(s.id) as any).n as number;
      if (refs >= 3) { beh += 18; factors.push({ domain: "behavior", factor: "Repeated behavior referrals", weight: "strong", detail: `${refs} office referrals since August.` }); }
      else if (refs === 2) { beh += 10; factors.push({ domain: "behavior", factor: "Two behavior referrals", weight: "some", detail: "Two office referrals this year." }); }
      else if (refs === 1) beh += 3;
      else strengths.push("No behavior referrals this year");

      const grades = gradeQ.all(s.id, CURRENT_YEAR) as any[];
      const bySubj: Record<string, { MP1?: any; CURRENT?: any }> = {};
      for (const g of grades) (bySubj[g.subject] ??= {})[g.term as "MP1" | "CURRENT"] = g;
      let lowCount = 0;
      for (const [subj, t] of Object.entries(bySubj)) {
        const cur = t.CURRENT, mp1 = t.MP1; if (!cur) continue;
        if (LETTER_RANK[cur.letter] <= 2) { lowCount++; }
        if (mp1 && LETTER_RANK[mp1.letter] - LETTER_RANK[cur.letter] >= 4) { course += 8; factors.push({ domain: "academic", factor: `${subj} grade dropped ${Math.round((LETTER_RANK[mp1.letter] - LETTER_RANK[cur.letter]) / 3)} letter grades`, weight: "strong", detail: `From ${mp1.letter} at the first marking period to ${cur.letter} now.` }); }
        if (LETTER_RANK[cur.letter] >= 10) strengths.push(`Strong in ${subj} (${cur.letter})`);
      }
      if (lowCount) { course += Math.min(20, 10 * lowCount); factors.push({ domain: "academic", factor: lowCount === 1 ? "One course grade at D or F" : `${lowCount} course grades at D or F`, weight: lowCount > 1 ? "strong" : "some", detail: "Current running grades." }); }

      const scrs = scrQ.all(s.id, CURRENT_YEAR) as any[];
      for (const r of scrs) {
        if (r.benchmark === "below") { scr += 10; factors.push({ domain: "academic", factor: `Below benchmark in ${r.subject} (fall screener)`, weight: "strong", detail: "Well below the fall benchmark goal." }); }
        else if (r.benchmark === "approaching") { scr += 4; factors.push({ domain: "academic", factor: `Approaching benchmark in ${r.subject}`, weight: "some", detail: "Just under the fall benchmark goal." }); }
        else if (r.benchmark === "above") strengths.push(`Above benchmark in ${r.subject} on the fall screener`);
        else strengths.push(`On track in ${r.subject} on the fall screener`);
      }

      const w = wellQ.get(s.id, CURRENT_YEAR) as any;
      if (w?.risk_level === "high") { well += 18; factors.push({ domain: "wellness", factor: "High wellness screener score", weight: "strong", detail: "Fall universal screener (Project AWARE) flagged elevated anxiety or low mood." }); }
      else if (w?.risk_level === "moderate") { well += 8; factors.push({ domain: "wellness", factor: "Moderate wellness screener score", weight: "some", detail: "Fall universal screener in the moderate range." }); }
      const chk = (chkQ.all(s.id) as any[]).map((r) => r.score);
      if (chk.length >= 3 && chk[0] < chk[1] && chk[1] < chk[2] && chk[0] <= 2) { well += 8; factors.push({ domain: "wellness", factor: "Weekly check-in scores dropping", weight: "strong", detail: "Three weeks in a row of lower check-in scores." }); }
      const nurse = (nurseQ.get(s.id) as any).n as number;
      if (nurse >= 4) { well += 4; factors.push({ domain: "wellness", factor: "Frequent nurse visits", weight: "some", detail: `${nurse} nurse visits since August, often for stomachaches or headaches.` }); }
      if (s.new_to_building && (att + course) >= 15) { factors.push({ domain: "context", factor: "First year in a new building", weight: "some", detail: "In past years, this combination of factors came before course failures by spring." }); }

      const score = Math.min(100, att + beh + course + scr + well + (s.new_to_building && (att + course) >= 15 ? 5 : 0));
      const level = score >= 60 ? "high" : score >= 40 ? "moderate" : score >= 22 ? "watch" : "low";
      ins.run(s.id, TODAY, score, level, att, beh, course, scr, well, JSON.stringify(factors.sort((a, b) => (a.weight === b.weight ? 0 : a.weight === "strong" ? -1 : 1))), JSON.stringify(strengths.slice(0, 4)), level === "high" || level === "moderate" ? "2026-10-14" : null);
    }
  });
  tx();
  return (db.prepare("SELECT level, COUNT(*) AS n FROM student_risk GROUP BY level").all() as any[]);
}
