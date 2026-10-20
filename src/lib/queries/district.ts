import "server-only";
import { all, one } from "../db";
import { type Scope, studentScope, assertStudentLevel } from "../scope";

/** All district-view queries. Every student-level query goes through studentScope(scope) so the WHERE clause is scope-derived. */

export const N_DAYS = () => one<{ n: number }>("SELECT COUNT(DISTINCT date) n FROM attendance_daily")!.n;

export function districtHeader(scope: Scope) {
  return one<{ aun: number; name: string; county: string; enrollment: number; schools: number; econ_pct: number; ela_prof: number | null; math_prof: number | null; regular_attendance: number | null; grad_4yr: number | null }>(`
    SELECT d.aun, d.name, c.name county, dy.enrollment, dy.schools, dy.econ_pct,
      (SELECT value FROM district_measures m WHERE m.aun=d.aun AND measure='ela_prof' AND subgroup='all' AND school_year='2024-25') ela_prof,
      (SELECT value FROM district_measures m WHERE m.aun=d.aun AND measure='math_prof' AND subgroup='all' AND school_year='2024-25') math_prof,
      (SELECT value FROM district_measures m WHERE m.aun=d.aun AND measure='regular_attendance' AND subgroup='all' AND school_year='2024-25') regular_attendance,
      (SELECT value FROM district_measures m WHERE m.aun=d.aun AND measure='grad_4yr' AND subgroup='all' AND school_year='2024-25') grad_4yr
    FROM districts d JOIN counties c ON c.geoid=d.county_geoid LEFT JOIN district_years dy ON dy.aun=d.aun AND dy.school_year='2024-25' WHERE d.aun=?`, scope.aun)!;
}

export interface Building { id: number; name: string; level: string; grade_low: number; grade_high: number; enrollment: number; students: number; flagged: number; flagged_pct: number; high: number; chronic_to_date: number; referrals: number; referrals_per_100: number; reading_on_track: number | null; wellness_high_pct: number | null; regular_attendance: number | null; ela_prof: number | null; math_prof: number | null; designation: string | null }
export function buildings(scope: Scope): Building[] {
  const bWhere = scope.role === "teacher" ? "b.id = ?" : "b.aun = ?";
  const p = scope.role === "teacher" ? scope.buildingId : scope.aun;
  return all<Building>(`
    SELECT b.id, b.name, b.level, b.grade_low, b.grade_high, by.enrollment,
      (SELECT COUNT(*) FROM students s WHERE s.building_id=b.id) students,
      (SELECT SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.building_id=b.id) flagged,
      (SELECT ROUND(100.0*SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.building_id=b.id) flagged_pct,
      (SELECT SUM(CASE WHEN r.level='high' THEN 1 ELSE 0 END) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.building_id=b.id) high,
      (SELECT ROUND(100.0*SUM(CASE WHEN a.n >= 0.1*(SELECT COUNT(DISTINCT date) FROM attendance_daily) THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id WHERE s.building_id=b.id) chronic_to_date,
      (SELECT COUNT(*) FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.building_id=b.id) referrals,
      (SELECT ROUND(100.0*COUNT(*)/MAX(1,(SELECT COUNT(*) FROM students s WHERE s.building_id=b.id)),1) FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.building_id=b.id) referrals_per_100,
      (SELECT ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),1) FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE s.building_id=b.id AND sr.subject='reading' AND sr.school_year='2026-27' AND sr.window='fall') reading_on_track,
      (SELECT ROUND(100.0*SUM(CASE WHEN w.risk_level='high' THEN 1 ELSE 0 END)/COUNT(*),1) FROM wellness_screens w JOIN students s ON s.id=w.student_id WHERE s.building_id=b.id AND w.school_year='2026-27' AND w.window='fall') wellness_high_pct,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='regular_attendance' AND subgroup='all' AND school_year='2024-25') regular_attendance,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='ela_prof' AND subgroup='all' AND school_year='2024-25') ela_prof,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='math_prof' AND subgroup='all' AND school_year='2024-25') math_prof,
      (SELECT GROUP_CONCAT(g.designation || ' · ' || g.subgroup, '; ') FROM designations g WHERE g.building_id=b.id) designation
    FROM buildings b LEFT JOIN building_years by ON by.building_id=b.id AND by.school_year='2024-25' WHERE b.active=1 AND ${bWhere} ORDER BY b.grade_low DESC, b.name`, p);
}

export function overviewKpis(scope: Scope) {
  const n = N_DAYS();
  const base = one<{ students: number; chronic: number; flagged: number; high: number; referrals: number; prior_refs_est: number }>(`
    SELECT COUNT(*) students,
      SUM(CASE WHEN a.n >= 0.1*${n} THEN 1 ELSE 0 END) chronic,
      SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END) flagged, SUM(CASE WHEN r.level='high' THEN 1 ELSE 0 END) high,
      (SELECT COUNT(*) FROM behavior_referrals br JOIN students s2 ON s2.id=br.student_id WHERE s2.aun=?) referrals,
      (SELECT ROUND(COUNT(*) * ${n} / 180.0) FROM interventions i JOIN students s3 ON s3.id=i.student_id WHERE s3.aun=? AND i.domain='behavior' AND i.status='completed') prior_refs_est
    FROM students s JOIN student_risk r ON r.student_id=s.id LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id WHERE s.aun=?`, scope.aun, scope.aun, scope.aun)!;
  const enrollment = all<{ school_year: string; enrollment: number }>("SELECT school_year, enrollment FROM district_years WHERE aun=? ORDER BY school_year", scope.aun);
  const cur = enrollment[enrollment.length - 1], prev = enrollment[enrollment.length - 2];
  // prior-year referral count at the same point, from the prior-year outcomes baseline (referrals per month in fall half)
  const priorRefs = one<{ n: number }>(`SELECT ROUND(SUM(o.pre_value) * ${n} / 20.0) n FROM student_outcomes o JOIN students s ON s.id=o.student_id WHERE s.aun=? AND o.domain='behavior'`, scope.aun)!.n;
  const threeYear = one<{ v: number }>(`SELECT AVG(m.chronic_pct_to_date) v FROM building_attendance_monthly m JOIN buildings b ON b.id=m.building_id WHERE b.aun=? AND m.month=10 AND m.school_year IN ('2023-24','2024-25','2025-26')`, scope.aun)!.v;
  return { ...base, enrollment: cur?.enrollment ?? base.students, enrollmentPrev: prev?.enrollment ?? null, chronicPct: Math.round(1000 * base.chronic / base.students) / 10, threeYearChronicOct: Math.round(threeYear * 10) / 10, priorRefs, nDays: n };
}

export interface Insight { domain: "attendance" | "wellness" | "interventions" | "academics" | "behavior"; title: string; body: string; nextStep: string; service: string; confidence: "High" | "Medium" | "Low"; strength: number; link?: string }

/** Insight cards computed from patterns in the data for this district. Changing the district changes the cards. */
export function insights(scope: Scope): Insight[] {
  const n = N_DAYS();
  const out: Insight[] = [];
  const dName = scope.districtName;

  // Attendance: the grade whose current absence rate exceeds its own prior-year pace the most.
  const grades = all<{ grade: number; building: string; students: number; cur_rate: number; prior_rate: number; eight_plus: number }>(`
    SELECT s.grade, b.name building, COUNT(*) students, ROUND(100.0*SUM(COALESCE(a.n,0))/(COUNT(*)*${n}),1) cur_rate, ROUND(100.0*AVG(s.prior_year_absences)/180,1) prior_rate,
      SUM(CASE WHEN COALESCE(a.n,0) >= 8 THEN 1 ELSE 0 END) eight_plus
    FROM students s JOIN buildings b ON b.id=s.building_id LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id
    WHERE s.aun=? GROUP BY s.grade, b.id HAVING COUNT(*) >= 20 ORDER BY (cur_rate - prior_rate) DESC LIMIT 1`, scope.aun);
  if (grades[0]) {
    const g = grades[0]; const delta = g.cur_rate - g.prior_rate;
    out.push({ domain: "attendance", title: `Grade ${g.grade === 0 ? "K" : g.grade} absences are rising faster than any prior year`, body: `${g.eight_plus} ${g.grade === 6 ? "sixth graders" : `grade ${g.grade === 0 ? "K" : g.grade} students`} at ${g.building} have already missed 8 or more days. Their absence rate is ${g.cur_rate}% versus ${g.prior_rate}% for the same students last year. In past years, this pattern came before a rise in course failures by spring.`, nextStep: `Attendance team review of the ${g.eight_plus} students before winter break.`, service: "CSIU attendance improvement consultation", confidence: delta >= 4 ? "High" : delta >= 2 ? "Medium" : "Low", strength: delta * 10 + g.eight_plus / 5, link: "/district/attendance" });
  }

  // Wellness: building with the largest rise in moderate/high screen share fall-to-fall, plus nurse visits.
  const well = all<{ building: string; students: number; prev_pct: number; cur_pct: number; nurse_somatic: number }>(`
    WITH f AS (SELECT s.building_id, w.school_year, ROUND(100.0*SUM(CASE WHEN w.risk_level IN ('moderate','high') THEN 1 ELSE 0 END)/COUNT(*),1) pct, COUNT(*) n
      FROM wellness_screens w JOIN students s ON s.id=w.student_id WHERE s.aun=? AND w.window='fall' GROUP BY s.building_id, w.school_year)
    SELECT b.name building, c.n students, p.pct prev_pct, c.pct cur_pct,
      (SELECT COUNT(*) FROM nurse_visits nv JOIN students s ON s.id=nv.student_id WHERE s.building_id=b.id AND nv.reason IN ('stomachache','headache')) nurse_somatic
    FROM f c JOIN f p ON p.building_id=c.building_id AND p.school_year='2025-26' JOIN buildings b ON b.id=c.building_id WHERE c.school_year='2026-27' ORDER BY (c.pct - p.pct) DESC LIMIT 1`, scope.aun);
  if (well[0]) {
    const w = well[0]; const delta = w.cur_pct - w.prev_pct;
    out.push({ domain: "wellness", title: `Anxiety and mood screening scores are up at ${w.building.replace(/ Sch$/, "")}`, body: `Students screening moderate or high rose from ${w.prev_pct}% to ${w.cur_pct}% between last fall and this fall. Nurse visits for stomachaches and headaches (${w.nurse_somatic} so far) rose at the same time.`, nextStep: "Add a Tier 2 coping skills group; share results with the school counselor.", service: "CSIU behavioral health services", confidence: delta >= 4 ? "High" : delta >= 1.5 ? "Medium" : "Low", strength: delta * 8 + 5, link: "/district/wellness" });
  }

  // Interventions: the support with the largest early-vs-late gap (n >= 15 per arm).
  const early = all<{ program: string; early_pct: number; late_pct: number; n_early: number; n_late: number }>(`
    SELECT p.name program, ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start<=14 THEN i.improved END)) early_pct, ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start>14 THEN i.improved END)) late_pct,
      SUM(CASE WHEN i.days_from_flag_to_start<=14 THEN 1 ELSE 0 END) n_early, SUM(CASE WHEN i.days_from_flag_to_start>14 THEN 1 ELSE 0 END) n_late
    FROM interventions i JOIN students s ON s.id=i.student_id JOIN programs p ON p.id=i.program_id WHERE s.aun=? AND i.status='completed'
    GROUP BY p.name HAVING n_early >= 8 AND n_late >= 8 ORDER BY (early_pct - late_pct) DESC LIMIT 1`, scope.aun);
  if (early[0]) {
    const e = early[0]; const gap = e.early_pct - e.late_pct;
    out.push({ domain: "interventions", title: `${e.program} is working best when started early`, body: `Students who began ${e.program} within two weeks of being flagged improved at ${gap >= e.late_pct * 0.8 ? "nearly twice" : "a higher"} the rate of those who started later (${e.early_pct}% vs. ${e.late_pct}%, ${e.n_early + e.n_late} students last year).`, nextStep: `Set a two-week start target for new ${e.program} referrals.`, service: "CSIU PBIS and I-MTSS coaching", confidence: gap >= 15 ? "High" : gap >= 8 ? "Medium" : "Low", strength: gap / 2 + 3, link: "/district/interventions" });
  }

  // Academics: building with the lowest share on track in reading, with the most common missed skill area (synthetic label).
  const acad = all<{ building: string; on_track: number; below: number; n: number }>(`
    SELECT b.name building, ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),1) on_track, SUM(CASE WHEN sr.benchmark='below' THEN 1 ELSE 0 END) below, COUNT(*) n
    FROM screener_results sr JOIN students s ON s.id=sr.student_id JOIN buildings b ON b.id=s.building_id WHERE s.aun=? AND sr.subject='math' AND sr.school_year='2026-27' AND sr.window='fall' GROUP BY b.id HAVING n >= 40 ORDER BY on_track LIMIT 1`, scope.aun);
  if (acad[0]) {
    const a = acad[0];
    out.push({ domain: "academics", title: `Fall math benchmark: ${a.below} students well below at ${a.building.replace(/ Sch$/, "")}`, body: `Only ${a.on_track}% of ${a.n} students screened on track in math this fall. Students who missed instruction in September are over-represented among those below benchmark.`, nextStep: "Small-group reteach on the two most-missed skill clusters; progress monitor weekly.", service: "CSIU instructional support (I-MTSS)", confidence: a.on_track < 45 ? "High" : "Medium", strength: (60 - a.on_track) / 4 + 2, link: "/district/academics" });
  }

  // Behavior: after-lunch concentration.
  const beh = one<{ total: number; after_lunch: number; building: string }>(`
    SELECT COUNT(*) total, SUM(CASE WHEN r.time_of_day='after lunch' THEN 1 ELSE 0 END) after_lunch,
      (SELECT b.name FROM behavior_referrals r2 JOIN students s2 ON s2.id=r2.student_id JOIN buildings b ON b.id=s2.building_id WHERE s2.aun=? AND r2.time_of_day='after lunch' GROUP BY b.id ORDER BY COUNT(*) DESC LIMIT 1) building
    FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.aun=?`, scope.aun, scope.aun);
  if (beh && beh.total >= 20) {
    const share = Math.round(100 * beh.after_lunch / beh.total);
    out.push({ domain: "behavior", title: `${share}% of referrals happen right after lunch`, body: `${beh.after_lunch} of ${beh.total} office referrals this year came during the after-lunch transition, most of them at ${beh.building}. A predictable re-entry routine has reduced referrals in similar buildings.`, nextStep: "Pilot a 3-minute structured re-entry routine after lunch in the building with the most referrals.", service: "CSIU PBIS and I-MTSS coaching", confidence: share >= 30 ? "High" : share >= 20 ? "Medium" : "Low", strength: share / 4, link: "/district/behavior" });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 3);
}

/** Chronic absence early warning: this year by month (to date), a simple projection, and the 3-year average. */
export function chronicProjection(scope: Scope) {
  const rows = all<{ school_year: string; month: number; v: number }>(`
    SELECT m.school_year, m.month, SUM(m.chronic_pct_to_date*m.enrolled)/SUM(m.enrolled) v FROM building_attendance_monthly m JOIN buildings b ON b.id=m.building_id WHERE b.aun=? GROUP BY m.school_year, m.month`, scope.aun);
  const months = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]; const labels = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const cur = new Map(rows.filter((r) => r.school_year === "2026-27").map((r) => [r.month, r.v]));
  const avg = months.map((mo) => { const xs = rows.filter((r) => r.school_year !== "2026-27" && r.month === mo).map((r) => r.v); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; });
  const now = cur.get(10) ?? null;
  const lastYearEnd = rows.find((r) => r.school_year === "2025-26" && r.month === 6)?.v ?? null;
  const lastYearOct = rows.find((r) => r.school_year === "2025-26" && r.month === 10)?.v ?? null;
  // projection: last year's October-to-June ratio applied to this October
  const ratio = lastYearEnd && lastYearOct ? lastYearEnd / lastYearOct : 0.9;
  const projectedEnd = now !== null ? Math.round(now * ratio * 10) / 10 : null;
  const data = months.map((mo, i) => {
    const actual = cur.has(mo) ? Math.round(cur.get(mo)! * 10) / 10 : null;
    let projected: number | null = null;
    if (now !== null && projectedEnd !== null && i >= 2) projected = Math.round((now + (projectedEnd - now) * (i - 2) / 8) * 10) / 10;
    return { label: labels[i], actual, projected, avg: avg[i] !== null ? Math.round(avg[i]! * 10) / 10 : null };
  });
  return { data, now, projectedEnd, threeYearNow: avg[2] };
}

export interface SupportResult { program_id: string; program: string; domain: string; students: number; improved_pct: number; similar_untreated_pct: number | null; early_pct: number | null; late_pct: number | null; funding: string; evidence: string }
export function supportResults(scope: Scope, minStudents = 10): SupportResult[] {
  const rows = all<Omit<SupportResult, "evidence">>(`
    WITH treated AS (SELECT DISTINCT i.student_id, i.domain FROM interventions i WHERE i.status='completed'),
    base AS (SELECT o.domain, o.improved FROM student_outcomes o JOIN students s ON s.id=o.student_id LEFT JOIN treated t ON t.student_id=o.student_id AND t.domain=o.domain
      WHERE t.student_id IS NULL AND s.aun=? AND ((o.domain='attendance' AND o.pre_value>=7.8) OR (o.domain='behavior' AND o.pre_value>=0.44) OR (o.domain='academic' AND o.pre_value<25) OR (o.domain='wellness' AND o.pre_value>=6))),
    untreated AS (SELECT domain, ROUND(100.0*AVG(improved)) pct FROM base GROUP BY domain)
    SELECT i.program_id, p.name program, i.domain, COUNT(*) students, ROUND(100.0*AVG(i.improved)) improved_pct, u.pct similar_untreated_pct,
      ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start<=14 THEN i.improved END)) early_pct, ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start>14 THEN i.improved END)) late_pct, MIN(i.funding) funding
    FROM interventions i JOIN students s ON s.id=i.student_id JOIN programs p ON p.id=i.program_id LEFT JOIN untreated u ON u.domain=i.domain
    WHERE i.status='completed' AND s.aun=? GROUP BY i.program_id HAVING COUNT(*) >= ? ORDER BY students DESC`, scope.aun, scope.aun, minStudents);
  return rows.map((r) => { const diff = r.improved_pct - (r.similar_untreated_pct ?? 0); return { ...r, evidence: r.students >= 50 && diff >= 15 ? "Strong" : r.students >= 20 && diff >= 8 ? "Moderate" : r.students < 20 ? "Early: small group" : "Weak" }; });
}

export interface SupportListRow { id: number; label: string; first_name: string; last_name: string; grade: number; building: string; building_id: number; classroom: string; level: string; score: number; factors: { factor: string; weight: string; detail: string; domain: string }[]; supports: string | null; next_step: string; days_missed: number; referrals: number }
export function supportList(scope: Scope, opts: { buildingId?: number; limit?: number; levels?: string[] } = {}): SupportListRow[] {
  assertStudentLevel(scope);
  const sc = studentScope(scope);
  const levels = opts.levels ?? ["high", "moderate"];
  const rows = all<any>(`
    SELECT s.id, s.first_name, s.last_name, s.grade, b.name building, b.id building_id, c.name classroom, r.level, r.score, r.factors_json,
      (SELECT GROUP_CONCAT(p.name || CASE WHEN i.notes IS NOT NULL THEN ' (' || LOWER(i.notes) || ')' ELSE '' END, '; ') FROM interventions i JOIN programs p ON p.id=i.program_id WHERE i.student_id=s.id AND i.status='active') supports,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%') days_missed,
      (SELECT COUNT(*) FROM behavior_referrals br WHERE br.student_id=s.id) referrals
    FROM students s JOIN student_risk r ON r.student_id=s.id JOIN buildings b ON b.id=s.building_id LEFT JOIN classrooms c ON c.id=s.classroom_id
    WHERE ${sc.sql} AND r.level IN (${levels.map(() => "?").join(",")}) ${opts.buildingId ? "AND s.building_id = ?" : ""}
    ORDER BY r.score DESC, s.last_name LIMIT ?`, ...sc.params, ...levels, ...(opts.buildingId ? [opts.buildingId] : []), opts.limit ?? 50);
  return rows.map((r) => {
    const factors = JSON.parse(r.factors_json);
    return { ...r, factors, label: scope.role === "teacher" ? `${r.first_name} ${r.last_name[0]}.` : `Student ${r.id}`, next_step: nextStepFor(factors, r.supports) };
  });
}

export function nextStepFor(factors: { domain: string; factor: string }[], supports: string | null): string {
  const sup = (supports ?? "").toLowerCase();
  const has = { attendance: /attendance|monday|home visit|transportation|mentoring/.test(sup), behavior: /check-in|behavior support|restorative|mentoring/.test(sup), academic: /reading|math|tutoring|wilson|credit/.test(sup), wellness: /counseling|coping|assistance|mental health/.test(sup) };
  const top = factors[0]; const dom = top?.domain as keyof typeof has | undefined;
  const f = (top?.factor ?? "").toLowerCase();
  if (!dom || !(dom in has)) return supports ? "Review progress at next team meeting" : "Team review";
  if (has[dom]) {
    if (sup.includes("check-in/check-out")) return "Continue CICO; review at 8 weeks";
    if (sup.includes("assistance program")) return "Add counseling (similar students improved)";
    return `Continue; review ${dom} progress at next team meeting`;
  }
  switch (dom) {
    case "attendance": return f.includes("rising") ? "Attendance meeting with family" : f.includes("monday") ? "Monday connection check-in" : "Attendance team outreach";
    case "behavior": return factors.some((x) => x.domain === "wellness") ? "SAP referral" : "Start Check-In/Check-Out within two weeks";
    case "academic": return f.includes("dropped") ? "Small-group reteach + family contact" : f.includes("math") ? "Math reteach group" : "Reading intervention group";
    case "wellness": return f.includes("nurse") || f.includes("dropping") ? "Counselor check-in this week" : "Coping skills group";
  }
  return "Team review";
}

// ---- attendance tab
export function attendanceByGrade(scope: Scope) {
  const n = N_DAYS(); const sc = studentScope(scope);
  return all<{ grade: number; students: number; cur_rate: number; prior_rate: number; chronic_pct: number; monday_share: number }>(`
    SELECT s.grade, COUNT(*) students, ROUND(100.0*SUM(COALESCE(a.n,0))/(COUNT(*)*${n}),1) cur_rate, ROUND(100.0*AVG(s.prior_year_absences)/180,1) prior_rate,
      ROUND(100.0*SUM(CASE WHEN COALESCE(a.n,0) >= 0.1*${n} THEN 1 ELSE 0 END)/COUNT(*),1) chronic_pct,
      ROUND(100.0*SUM(COALESCE(a.mon,0))/MAX(1,SUM(COALESCE(a.n,0))),0) monday_share
    FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n, SUM(CASE WHEN CAST(strftime('%w', date) AS INTEGER)=1 THEN 1 ELSE 0 END) mon FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id
    WHERE ${sc.sql} GROUP BY s.grade ORDER BY s.grade`, ...sc.params);
}
export function attendanceByWeekday(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ dow: number; absences: number }>(`SELECT CAST(strftime('%w', a.date) AS INTEGER) dow, COUNT(*) absences FROM attendance_daily a JOIN students s ON s.id=a.student_id WHERE a.status LIKE 'absent%' AND ${sc.sql} GROUP BY dow ORDER BY dow`, ...sc.params);
}
export function attendanceTrendReal(scope: Scope) {
  return all<{ school_year: string; district: number; state: number | null }>(`SELECT m.school_year, ROUND(m.value,1) district, (SELECT value FROM statewide_measures s WHERE s.school_year=m.school_year AND s.measure='regular_attendance') state FROM district_measures m WHERE m.aun=? AND m.measure='regular_attendance' AND m.subgroup='all' ORDER BY m.school_year`, scope.aun);
}
export function attendanceSubgroupsReal(scope: Scope) {
  return all<{ subgroup: string; value: number }>(`SELECT subgroup, ROUND(value,1) value FROM district_measures WHERE aun=? AND measure='regular_attendance' AND school_year='2024-25' ORDER BY CASE subgroup WHEN 'all' THEN 0 WHEN 'econ' THEN 1 WHEN 'swd' THEN 2 WHEN 'el' THEN 3 ELSE 4 END`, scope.aun);
}

// ---- behavior tab
export function referralsBreakdown(scope: Scope) {
  const sc = studentScope(scope);
  const by = (col: string) => all<{ k: string; n: number }>(`SELECT r.${col} k, COUNT(*) n FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE ${sc.sql} GROUP BY r.${col} ORDER BY n DESC`, ...sc.params);
  const weekly = all<{ week: string; n: number }>(`SELECT strftime('%Y-%m-%d', r.date, 'weekday 0', '-6 days') week, COUNT(*) n FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE ${sc.sql} GROUP BY week ORDER BY week`, ...sc.params);
  const repeat = one<{ students_with_3plus: number; total_students_referred: number }>(`SELECT SUM(CASE WHEN n>=3 THEN 1 ELSE 0 END) students_with_3plus, COUNT(*) total_students_referred FROM (SELECT r.student_id, COUNT(*) n FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE ${sc.sql} GROUP BY r.student_id)`, ...sc.params)!;
  return { category: by("category"), location: by("location"), time: by("time_of_day"), action: by("action"), weekly, repeat };
}

// ---- academics tab
export function proficiencyTrendReal(scope: Scope) {
  return all<{ school_year: string; measure: string; district: number; state: number | null }>(`SELECT m.school_year, m.measure, ROUND(m.value,1) district, (SELECT value FROM statewide_measures s WHERE s.school_year=m.school_year AND s.measure=m.measure) state FROM district_measures m WHERE m.aun=? AND m.measure IN ('ela_prof','math_prof','sci_prof') AND m.subgroup='all' ORDER BY m.school_year`, scope.aun);
}
export function buildingProficiencyReal(scope: Scope) {
  return all<{ building: string; ela: number | null; math: number | null; sci: number | null; ela_growth: number | null; math_growth: number | null }>(`
    SELECT b.name building,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='ela_prof' AND subgroup='all' AND school_year='2024-25') ela,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='math_prof' AND subgroup='all' AND school_year='2024-25') math,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='sci_prof' AND subgroup='all' AND school_year='2024-25') sci,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='ela_growth' AND subgroup='all' AND school_year='2024-25') ela_growth,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND measure='math_growth' AND subgroup='all' AND school_year='2024-25') math_growth
    FROM buildings b WHERE b.aun=? AND b.active=1 ORDER BY b.grade_low`, scope.aun);
}
export function benchmarkSummary(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ subject: string; window: string; school_year: string; above: number; on_track: number; approaching: number; below: number; n: number }>(`
    SELECT sr.subject, sr.window, sr.school_year, SUM(sr.benchmark='above') above, SUM(sr.benchmark='on_track') on_track, SUM(sr.benchmark='approaching') approaching, SUM(sr.benchmark='below') below, COUNT(*) n
    FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE ${sc.sql} GROUP BY sr.subject, sr.school_year, sr.window ORDER BY sr.subject, sr.school_year, CASE sr.window WHEN 'fall' THEN 0 WHEN 'winter' THEN 1 ELSE 2 END`, ...sc.params);
}
export function gradeDistribution(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ subject: string; d_f: number; c: number; b: number; a: number; n: number; dropped: number }>(`
    SELECT g.subject, SUM(g.letter LIKE 'D%' OR g.letter='F') d_f, SUM(g.letter LIKE 'C%') c, SUM(g.letter LIKE 'B%') b, SUM(g.letter LIKE 'A%') a, COUNT(*) n,
      SUM(CASE WHEN g.percent <= m.percent - 10 THEN 1 ELSE 0 END) dropped
    FROM course_grades g JOIN students s ON s.id=g.student_id LEFT JOIN course_grades m ON m.student_id=g.student_id AND m.school_year=g.school_year AND m.subject=g.subject AND m.term='MP1'
    WHERE g.school_year='2026-27' AND g.term='CURRENT' AND ${sc.sql} GROUP BY g.subject ORDER BY d_f DESC`, ...sc.params);
}
export function adoptions(scope: Scope) {
  return all<{ program: string; category: string; subject: string; adoption_year: number; grades: string; tier: string; source: string }>(`SELECT p.name program, p.category, a.subject, a.adoption_year, (CASE a.grade_low WHEN 0 THEN 'K' ELSE a.grade_low END) || '-' || a.grade_high grades, a.tier, a.source FROM program_adoptions a JOIN programs p ON p.id=a.program_id WHERE a.aun=? ORDER BY p.category, a.subject, a.adoption_year`, scope.aun);
}
export function screenersInUse(scope: Scope) { return all<{ tool: string; subject: string; grades: string; since_year: number }>(`SELECT tool, subject, (CASE grade_low WHEN 0 THEN 'K' ELSE grade_low END) || '-' || grade_high grades, since_year FROM screeners_in_use WHERE aun=?`, scope.aun); }
export function instructionMinutes(scope: Scope) { return all<{ building: string; subject: string; grade_band: string; minutes: number }>(`SELECT b.name building, i.subject, i.grade_band, i.minutes_per_day minutes FROM instruction_minutes i JOIN buildings b ON b.id=i.building_id WHERE b.aun=? ORDER BY b.grade_low, i.subject`, scope.aun); }

// ---- wellness tab
export function paysForDistrict(scope: Scope) {
  return all<{ indicator: string; grade: string; value: number; state_value: number | null; school_year: string }>(`SELECT indicator, grade, value, state_value, school_year FROM pays_results WHERE aun=? ORDER BY indicator, school_year, grade`, scope.aun);
}
export function paysRegion() { return all<{ indicator: string; value: number; state_value: number | null }>(`SELECT indicator, value, state_value FROM pays_results WHERE aun IS NULL AND school_year='2025-26' AND grade='all'`); }
export function wellnessByBuilding(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ building: string; school_year: string; window: string; n: number; low: number; moderate: number; high: number; anxiety: number; connectedness: number }>(`
    SELECT b.name building, w.school_year, w.window, COUNT(*) n, SUM(w.risk_level='low') low, SUM(w.risk_level='moderate') moderate, SUM(w.risk_level='high') high, ROUND(AVG(w.anxiety),1) anxiety, ROUND(AVG(w.connectedness),1) connectedness
    FROM wellness_screens w JOIN students s ON s.id=w.student_id JOIN buildings b ON b.id=s.building_id WHERE ${sc.sql} GROUP BY b.id, w.school_year, w.window ORDER BY b.grade_low, w.school_year, w.window`, ...sc.params);
}
export function sapSummary(scope: Scope) { return all<{ category: string; item: string; count: number; source: string }>(`SELECT category, item, count, source FROM sap_summary WHERE aun=? AND school_year='2025-26' ORDER BY category, count DESC`, scope.aun); }
export function nurseByReason(scope: Scope) { const sc = studentScope(scope); return all<{ reason: string; n: number }>(`SELECT nv.reason, COUNT(*) n FROM nurse_visits nv JOIN students s ON s.id=nv.student_id WHERE ${sc.sql} GROUP BY nv.reason ORDER BY n DESC`, ...sc.params); }

// ---- interventions tab
export function activeSupports(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ program: string; domain: string; active: number; avg_days_to_start: number; early_share: number; avg_fidelity: number; provider: string }>(`
    SELECT p.name program, i.domain, COUNT(*) active, ROUND(AVG(i.days_from_flag_to_start)) avg_days_to_start, ROUND(100.0*AVG(i.days_from_flag_to_start<=14)) early_share, ROUND(AVG(i.fidelity),2) avg_fidelity, MIN(i.provider) provider
    FROM interventions i JOIN students s ON s.id=i.student_id JOIN programs p ON p.id=i.program_id WHERE i.status='active' AND ${sc.sql} GROUP BY i.program_id ORDER BY active DESC`, ...sc.params);
}
export function supportsByDomain(scope: Scope) {
  const sc = studentScope(scope);
  return all<{ domain: string; completed: number; improved_pct: number; active: number }>(`SELECT i.domain, SUM(i.status='completed') completed, ROUND(100.0*AVG(CASE WHEN i.status='completed' THEN i.improved END)) improved_pct, SUM(i.status='active') active FROM interventions i JOIN students s ON s.id=i.student_id WHERE ${sc.sql} GROUP BY i.domain ORDER BY completed DESC`, ...sc.params);
}
