import "server-only";
import { all, one } from "../db";
import { type Scope, studentScope } from "../scope";
import { N_DAYS } from "./district";

export function studentProfile(scope: Scope, id: number) {
  const sc = studentScope(scope);
  return one<{ id: number; state_id: string; first_name: string; last_name: string; grade: number; building: string; building_id: number; classroom: string; classroom_id: number; teacher: string; new_to_building: number; prior_year_absences: number; prior_year2_absences: number; level: string; score: number; factors_json: string; strengths_json: string; flagged_date: string | null; support_level: string | null; case_lead: string | null; next_meeting: string | null; iep: number; el: number; gifted: number }>(`
    SELECT s.id, s.state_id, s.first_name, s.last_name, s.grade, b.name building, b.id building_id, c.name classroom, c.id classroom_id, (t.first_name || ' ' || t.last_name) teacher, s.new_to_building, s.prior_year_absences, s.prior_year2_absences,
      r.level, r.score, r.factors_json, r.strengths_json, r.flagged_date, sp.support_level, (cl.first_name || ' ' || cl.last_name || ', ' || CASE cl.role WHEN 'counselor' THEN 'School Counselor' ELSE cl.role END) case_lead, sp.next_meeting, s.iep, s.el, s.gifted
    FROM students s JOIN buildings b ON b.id=s.building_id LEFT JOIN classrooms c ON c.id=s.classroom_id LEFT JOIN staff t ON t.id=c.teacher_id JOIN student_risk r ON r.student_id=s.id
    LEFT JOIN support_plans sp ON sp.student_id=s.id LEFT JOIN staff cl ON cl.id=sp.case_lead_staff_id
    WHERE s.id=? AND ${sc.sql}`, id, ...sc.params);
}

/** A good default profile for the demo: a flagged student in scope with rising absences and a grade drop. */
export function defaultStudent(scope: Scope): number | undefined {
  const sc = studentScope(scope);
  const pick = one<{ id: number }>(`SELECT s.id FROM students s JOIN student_risk r ON r.student_id=s.id LEFT JOIN support_plans sp ON sp.student_id=s.id
    WHERE ${sc.sql} AND r.level='high' AND r.factors_json LIKE '%Absences rising quickly%' AND r.factors_json LIKE '%grade dropped%' ${scope.role === "teacher" ? "" : "AND s.grade=6"}
    ORDER BY (sp.student_id IS NOT NULL) DESC, r.score DESC LIMIT 1`, ...sc.params)
    ?? one<{ id: number }>(`SELECT s.id FROM students s JOIN student_risk r ON r.student_id=s.id WHERE ${sc.sql} ORDER BY r.score DESC LIMIT 1`, ...sc.params);
  return pick?.id;
}

export function attendanceDetail(id: number) {
  const byMonth = all<{ month: string; n: number }>(`SELECT strftime('%m', date) month, COUNT(*) n FROM attendance_daily WHERE student_id=? AND status LIKE 'absent%' GROUP BY month ORDER BY month`, id);
  const byDow = all<{ dow: number; n: number }>(`SELECT CAST(strftime('%w', date) AS INTEGER) dow, COUNT(*) n FROM attendance_daily WHERE student_id=? AND status LIKE 'absent%' GROUP BY dow`, id);
  const total = byMonth.reduce((s, r) => s + r.n, 0);
  const nDays = N_DAYS();
  const priorAtSameTime = Math.round((one<{ p: number }>("SELECT prior_year_absences p FROM students WHERE id=?", id)!.p) * nDays / 180);
  const tardies = one<{ n: number }>("SELECT COUNT(*) n FROM attendance_daily WHERE student_id=? AND status='tardy'", id)!.n;
  return { byMonth: [["08", "Aug"], ["09", "Sep"], ["10", "Oct"]].map(([m, l]) => ({ month: l, n: byMonth.find((r) => r.month === m)?.n ?? 0 })), byDow: [1, 2, 3, 4, 5].map((d) => ({ dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d], n: byDow.find((r) => r.dow === d)?.n ?? 0 })), total, priorAtSameTime, tardies, nDays };
}

export function gradesDetail(id: number) {
  return all<{ subject: string; mp1: string; now: string; mp1_pct: number; now_pct: number }>(`SELECT a.subject, a.letter mp1, b.letter now, a.percent mp1_pct, b.percent now_pct FROM course_grades a JOIN course_grades b ON b.student_id=a.student_id AND b.school_year=a.school_year AND b.subject=a.subject AND b.term='CURRENT' WHERE a.student_id=? AND a.school_year='2026-27' AND a.term='MP1' ORDER BY CASE a.subject WHEN 'Math' THEN 0 WHEN 'ELA' THEN 1 WHEN 'Science' THEN 2 ELSE 3 END`, id);
}

export function benchmarks(id: number) {
  return all<{ subject: string; school_year: string; window: string; tool: string; measure: string; score: number; percentile: number; benchmark: string; date: string }>(`SELECT subject, school_year, window, tool, measure, score, percentile, benchmark, date FROM screener_results WHERE student_id=? ORDER BY date`, id);
}

export function progressMonitoring(id: number) {
  return all<{ subject: string; date: string; measure: string; score: number; goal: number }>(`SELECT subject, date, measure, score, goal FROM progress_monitoring WHERE student_id=? ORDER BY date`, id);
}

export function timeline(id: number) {
  const contacts = all<{ date: string; kind: string; title: string; detail: string | null }>(`SELECT date, kind, title, detail FROM student_contacts WHERE student_id=? ORDER BY date DESC`, id);
  const supports = all<{ date: string; kind: string; title: string; detail: string | null }>(`SELECT i.start_date date, 'support' kind, (p.name || CASE i.status WHEN 'active' THEN ' started' ELSE ' (' || i.status || ')' END) title, (i.provider || ' · ' || i.referral_reason || CASE WHEN i.status='completed' THEN ' · ' || CASE i.improved WHEN 1 THEN 'improved' ELSE 'no change' END ELSE '' END) detail FROM interventions i JOIN programs p ON p.id=i.program_id WHERE i.student_id=? ORDER BY i.start_date DESC`, id);
  const prior = one<{ p: number; p2: number }>("SELECT prior_year_absences p, prior_year2_absences p2 FROM students WHERE id=?", id)!;
  const priorSupports = supports.filter((s) => s.date < "2026-08-01").length;
  const items = [...contacts, ...supports].sort((a, b) => b.date.localeCompare(a.date));
  items.push({ date: "2025-26", kind: "history", title: `Last year: ${priorSupports ? `${priorSupports} support${priorSupports === 1 ? "" : "s"} delivered` : "no supports needed"}`, detail: `Missed ${prior.p} days all year${prior.p < 6 ? "; on track in all subjects" : ""}.` });
  return items;
}

export interface Strategy { program: string; domain: string; improved_pct: number; similar_untreated_pct: number | null; n: number; note: string }
/** 2-4 strategies drawn from what worked for similar students across any domain. "Similar" = same domain baseline band and grade band. */
export function recommendedStrategies(scope: Scope, id: number, factors: { domain: string; factor: string }[], activeSupports: string[]): Strategy[] {
  const s = one<{ grade: number; aun: number }>("SELECT grade, aun FROM students WHERE id=?", id)!;
  const gLo = s.grade <= 5 ? 0 : s.grade <= 8 ? 6 : 9, gHi = s.grade <= 5 ? 5 : s.grade <= 8 ? 8 : 12;
  const domains = [...new Set(factors.map((f) => f.domain))].filter((d) => ["attendance", "behavior", "academic", "wellness"].includes(d));
  if (!domains.length) domains.push("attendance");
  const out: Strategy[] = [];
  for (const dom of domains) {
    const rows = all<{ program_id: string; program: string; n: number; improved_pct: number; early_pct: number | null; similar_untreated_pct: number | null }>(`
      WITH untreated AS (SELECT ROUND(100.0*AVG(o.improved)) pct FROM student_outcomes o JOIN students st ON st.id=o.student_id WHERE o.domain=? AND st.grade BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM interventions i WHERE i.student_id=o.student_id AND i.domain=o.domain AND i.status='completed')
        AND ((o.domain='attendance' AND o.pre_value>=7.8) OR (o.domain='behavior' AND o.pre_value>=0.44) OR (o.domain='academic' AND o.pre_value<25) OR (o.domain='wellness' AND o.pre_value>=6)))
      SELECT i.program_id, p.name program, COUNT(*) n, ROUND(100.0*AVG(i.improved)) improved_pct, ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start<=14 THEN i.improved END)) early_pct, (SELECT pct FROM untreated) similar_untreated_pct
      FROM interventions i JOIN students st ON st.id=i.student_id JOIN programs p ON p.id=i.program_id WHERE i.status='completed' AND i.domain=? AND st.grade BETWEEN ? AND ?
      GROUP BY i.program_id HAVING COUNT(*) >= 15 ORDER BY improved_pct DESC LIMIT 2`, dom, gLo, gHi, dom, gLo, gHi);
    for (const r of rows) {
      if (activeSupports.some((a) => a.startsWith(r.program))) continue;
      const note = r.early_pct !== null && r.early_pct > r.improved_pct + 5 ? `Most effective when started within 2 weeks of the flag (${r.early_pct}% improved)` : r.program_id === "cico" ? "Daily check-in with a trusted adult; best started early" : r.program_id === "math_reteach" ? "Targets the skills missed during absences" : r.program_id === "attendance_meeting" ? "Identify barriers with the family and agree on a plan" : r.program_id === "school_counseling" ? "Short-term, school-based, no transportation barrier" : r.program_id === "coping_group" ? "6-8 weeks, small group, run by the counselor" : `Based on ${r.n} similar students in grades ${gLo === 0 ? "K" : gLo}-${gHi}`;
      out.push({ program: r.program, domain: dom, improved_pct: r.improved_pct, similar_untreated_pct: r.similar_untreated_pct, n: r.n, note });
    }
  }
  // de-duplicate programs across domains, keep the best, cap at 4
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.program) ? false : (seen.add(x.program), true))).sort((a, b) => b.improved_pct - a.improved_pct).slice(0, 4);
}

export function activeSupportNames(id: number) { return all<{ name: string }>("SELECT p.name FROM interventions i JOIN programs p ON p.id=i.program_id WHERE i.student_id=? AND i.status='active'", id).map((r) => r.name); }
export function strengths(id: number, stored: string[]) {
  const extra: string[] = [];
  const sci = one<{ pct: number }>("SELECT percent pct FROM course_grades WHERE student_id=? AND school_year='2026-27' AND term='CURRENT' AND subject='Science'", id);
  if (sci && sci.pct >= 88) extra.push(`Turns in science work on time (${Math.round(sci.pct)}% of assignments)`);
  const refsLast = one<{ n: number }>("SELECT COUNT(*) n FROM interventions WHERE student_id=? AND domain='behavior'", id)!.n;
  const refsNow = one<{ n: number }>("SELECT COUNT(*) n FROM behavior_referrals WHERE student_id=?", id)!.n;
  if (!refsNow && !refsLast) extra.push("No behavior referrals this year or last year");
  const act = ["Plays in the school band; band teacher reports great effort", "Helps younger students at recess", "Strong participation in class discussions", "Member of the robotics club"][id % 4];
  return [...new Set([...stored, ...extra, act])].slice(0, 4);
}
