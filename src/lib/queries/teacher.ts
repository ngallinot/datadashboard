import "server-only";
import { all, one } from "../db";
import type { Scope } from "../scope";
import { N_DAYS } from "./district";

export interface RosterRow { id: number; first_name: string; last_name: string; label: string; days_missed: number; monday_missed: number; reading: string | null; math: string | null; checkin_trend: "Steady" | "Dropping" | "Up and down" | "Improving" | "—"; referrals: number; supports: string | null; level: string; score: number; factors: { factor: string; weight: string; detail: string; domain: string }[]; math_grade: string | null; math_mp1: string | null; recent_abs: number; early_abs: number; nurse: number }

export function classroomInfo(scope: Scope) {
  return one<{ id: number; name: string; grade: number; building: string; building_id: number; teacher_first: string; teacher_last: string; students: number }>(`
    SELECT c.id, c.name, c.grade, b.name building, b.id building_id, st.first_name teacher_first, st.last_name teacher_last, (SELECT COUNT(*) FROM students s WHERE s.classroom_id=c.id) students
    FROM classrooms c JOIN buildings b ON b.id=c.building_id JOIN staff st ON st.id=c.teacher_id WHERE c.id=?`, scope.classroomId)!;
}

export function classroomsForDistrict(scope: Scope) {
  return all<{ id: number; name: string; grade: number; building: string; flagged: number }>(`SELECT c.id, c.name, c.grade, b.name building, (SELECT COUNT(*) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.classroom_id=c.id AND r.level IN ('high','moderate')) flagged FROM classrooms c JOIN buildings b ON b.id=c.building_id WHERE b.aun=? ORDER BY b.grade_low, b.name, c.grade, c.section`, scope.aun);
}

const BENCH: Record<string, string> = { above: "Above", on_track: "On track", approaching: "Approaching", below: "Below" };

export function roster(scope: Scope): RosterRow[] {
  const n = N_DAYS();
  const rows = all<any>(`
    SELECT s.id, s.first_name, s.last_name, r.level, r.score, r.factors_json,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%') days_missed,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%' AND CAST(strftime('%w', a.date) AS INTEGER)=1) monday_missed,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%' AND a.date >= date('2026-10-20', '-14 days')) recent_abs,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%' AND a.date < date('2026-10-20', '-14 days')) early_abs,
      (SELECT benchmark FROM screener_results sr WHERE sr.student_id=s.id AND sr.subject='reading' AND sr.school_year='2026-27' AND sr.window='fall') reading,
      (SELECT benchmark FROM screener_results sr WHERE sr.student_id=s.id AND sr.subject='math' AND sr.school_year='2026-27' AND sr.window='fall') math,
      (SELECT COUNT(*) FROM behavior_referrals br WHERE br.student_id=s.id) referrals,
      (SELECT COUNT(*) FROM nurse_visits nv WHERE nv.student_id=s.id) nurse,
      (SELECT GROUP_CONCAT(p.name, '; ') FROM interventions i JOIN programs p ON p.id=i.program_id WHERE i.student_id=s.id AND i.status='active') supports,
      (SELECT letter FROM course_grades g WHERE g.student_id=s.id AND g.school_year='2026-27' AND g.term='CURRENT' AND g.subject='Math') math_grade,
      (SELECT letter FROM course_grades g WHERE g.student_id=s.id AND g.school_year='2026-27' AND g.term='MP1' AND g.subject='Math') math_mp1,
      (SELECT GROUP_CONCAT(score, ',') FROM (SELECT score FROM wellness_checkins c WHERE c.student_id=s.id ORDER BY date DESC LIMIT 4)) checkins
    FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.classroom_id=? ORDER BY r.score DESC, s.last_name`, scope.classroomId);
  return rows.map((r) => {
    const c = (r.checkins ? String(r.checkins).split(",").map(Number) : []) as number[];   // newest first
    let trend: RosterRow["checkin_trend"] = "—";
    if (c.length >= 3) {
      if (c[0] < c[1] && c[1] < c[2]) trend = "Dropping";
      else if (c[0] > c[1] && c[1] > c[2]) trend = "Improving";
      else if (Math.max(...c) - Math.min(...c) >= 2) trend = "Up and down";
      else trend = "Steady";
    }
    return { ...r, label: `${r.first_name} ${r.last_name[0]}.`, reading: r.reading ? BENCH[r.reading] : null, math: r.math ? BENCH[r.math] : null, checkin_trend: trend, factors: JSON.parse(r.factors_json), nDays: n };
  });
}

export interface CheckIn { id: number; label: string; domain: "Attendance" | "Wellness" | "Behavior" | "Academics"; what: string; try: string }
/** "Check in with these students this week": students whose patterns changed recently, one line each, with a concrete suggestion. */
export function checkIns(rows: RosterRow[]): CheckIn[] {
  const out: CheckIn[] = [];
  for (const r of rows) {
    if (out.length >= 3) break;
    const mathDrop = r.math_mp1 && r.math_grade && r.math_mp1 !== r.math_grade && "ABCDF".indexOf(r.math_grade[0]) - "ABCDF".indexOf(r.math_mp1[0]) >= 1;
    if (r.days_missed >= 6 && r.recent_abs >= 3 && !out.some((o) => o.domain === "Attendance")) {
      out.push({ id: r.id, label: r.label, domain: "Attendance", what: `Missed ${r.days_missed} days so far${r.monday_missed >= 3 ? `, ${r.monday_missed} of them Mondays` : ""}.${mathDrop ? ` Math grade dropped from ${r.math_mp1} to ${r.math_grade}.` : ""}`, try: r.monday_missed >= 3 ? "A quick personal check-in Monday morning; let the attendance team know what you learn." : "Ask what is getting in the way this month; let the attendance team know what you learn." });
      continue;
    }
    if (r.checkin_trend === "Dropping" && !out.some((o) => o.domain === "Wellness")) {
      out.push({ id: r.id, label: r.label, domain: "Wellness", what: `Wellness check-in scores dropped three weeks in a row.${r.nurse >= 3 ? ` ${r.nurse} nurse visits this fall.` : " Quieter in class."}`, try: "Connect with the school counselor; offer a calm-down space option." });
      continue;
    }
    if (r.referrals >= 2 && !out.some((o) => o.domain === "Behavior")) {
      out.push({ id: r.id, label: r.label, domain: "Behavior", what: `${r.referrals} referrals since August, mostly during transitions.`, try: "Give a job or pre-correct before the after-lunch transition." });
      continue;
    }
    if (mathDrop && !out.some((o) => o.domain === "Academics")) {
      out.push({ id: r.id, label: r.label, domain: "Academics", what: `Math grade dropped from ${r.math_mp1} to ${r.math_grade}; ${r.math === "Below" ? "below benchmark on the fall screener" : "on track on the fall screener"}.`, try: "Pull into the reteach group for the skills missed in September." });
    }
  }
  return out;
}

export function classStrategies(scope: Scope, rows: RosterRow[]) {
  const afterLunch = one<{ share: number; n: number }>(`SELECT ROUND(100.0*SUM(r.time_of_day='after lunch')/MAX(1,COUNT(*))) share, COUNT(*) n FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.classroom_id=?`, scope.classroomId)!;
  const mathBelow = rows.filter((r) => r.math === "Below" || r.math === "Approaching").length;
  const monday = rows.reduce((s, r) => s + r.monday_missed, 0), allAbs = rows.reduce((s, r) => s + r.days_missed, 0);
  const strategies: { title: string; body: string; link: string; linkLabel: string }[] = [];
  if (afterLunch.n >= 3 && afterLunch.share >= 30) strategies.push({ title: "Structured after-lunch transitions", body: `${afterLunch.share}% of this class's referrals happen right after lunch. A predictable 3-minute re-entry routine has reduced referrals in similar classrooms.`, link: "/district/behavior", linkLabel: "See the routine" });
  if (mathBelow >= 4) strategies.push({ title: "Small-group math reteach", body: `${mathBelow} students are approaching or below on the fall math benchmark, most missing the same skill cluster. A short reteach group could cover it.`, link: "/district/academics", linkLabel: "View skill breakdown" });
  if (allAbs >= 10 && monday / allAbs >= 0.3) strategies.push({ title: "Monday connection check-ins", body: `${Math.round(100 * monday / allAbs)}% of this class's absences fall on a Monday. A brief welcome routine at the door helps students feel expected.`, link: "/district/attendance", linkLabel: "Ideas from CSIU coaches" });
  if (strategies.length < 3) strategies.push({ title: "Two-minute weekly check-ins", body: "Students whose weekly wellness check-ins drop three weeks in a row improved more when a trusted adult noticed within the week.", link: "/district/wellness", linkLabel: "Ideas from CSIU coaches" });
  return strategies.slice(0, 3);
}

export function classKpis(scope: Scope, rows: RosterRow[]) {
  const n = N_DAYS();
  const present = rows.length ? 100 - 100 * rows.reduce((s, r) => s + r.days_missed, 0) / (rows.length * n) : 0;
  const school = one<{ v: number }>(`SELECT 100 - 100.0*(SELECT COUNT(*) FROM attendance_daily a JOIN students s ON s.id=a.student_id WHERE s.building_id=? AND a.status LIKE 'absent%')/MAX(1,(SELECT COUNT(*) FROM students WHERE building_id=?)*${n}) v`, scope.buildingId, scope.buildingId)!.v;
  return { attendance: Math.round(present * 10) / 10, schoolAttendance: Math.round(school * 10) / 10, readingOn: rows.filter((r) => r.reading === "On track" || r.reading === "Above").length, mathOn: rows.filter((r) => r.math === "On track" || r.math === "Above").length, supported: rows.filter((r) => r.supports).length, hasScreeners: rows.some((r) => r.reading) };
}
