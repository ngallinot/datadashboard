import "server-only";
import { all, one } from "../db";
import { type Scope, districtScope } from "../scope";

export interface DistrictMetrics {
  aun: number; name: string; county: string; tiger_geoid: string; enrollment: number; econ_pct: number | null; schools: number;
  ela_prof: number | null; math_prof: number | null; sci_prof: number | null; ela_growth: number | null; math_growth: number | null;
  regular_attendance: number | null; chronic_absence: number | null; grad_4yr: number | null; career_benchmark: number | null;
  chronic_to_date: number; flagged_pct: number; flagged_n: number; students: number;
  pays_depressive: number | null; pays_vaping: number | null; pays_safe: number | null; pays_ideation: number | null; sap_cases: number | null;
  ela_program: string | null; ela_program_year: number | null; reading_screener: string | null;
}

export const MAP_METRICS: { id: string; label: string; unit: string; higherIsBetter: boolean; source: string; blurb: string }[] = [
  { id: "ela_prof", label: "ELA proficiency", unit: "%", higherIsBetter: true, source: "PDE 2024-25", blurb: "Percent proficient or advanced on PSSA ELA / Keystone Literature, enrollment-weighted across buildings." },
  { id: "math_prof", label: "Math proficiency", unit: "%", higherIsBetter: true, source: "PDE 2024-25", blurb: "Percent proficient or advanced on PSSA Math / Keystone Algebra I." },
  { id: "ela_growth", label: "ELA growth (PVAAS)", unit: "", higherIsBetter: true, source: "PDE 2024-25", blurb: "Meeting annual academic growth expectations (PVAAS index), enrollment-weighted." },
  { id: "chronic_absence", label: "Chronic absence", unit: "%", higherIsBetter: false, source: "PDE 2024-25", blurb: "Students missing more than 10% of enrolled days (100 minus regular attendance)." },
  { id: "grad_4yr", label: "4-year graduation", unit: "%", higherIsBetter: true, source: "PDE 2024-25", blurb: "Four-year cohort graduation rate." },
  { id: "flagged_pct", label: "Students flagged for support", unit: "%", higherIsBetter: false, source: "Model · synthetic", blurb: "Share of students with a moderate or high early-warning score this fall." },
  { id: "pays_depressive", label: "PAYS: depressive symptoms", unit: "%", higherIsBetter: false, source: "PAYS 2025", blurb: "Students in grades 6-12 who felt depressed or sad most days in the past year." },
  { id: "pays_vaping", label: "PAYS: vaped in past 30 days", unit: "%", higherIsBetter: false, source: "PAYS 2025", blurb: "Any vaping in the past 30 days." },
  { id: "pays_safe", label: "PAYS: feel safe at school", unit: "%", higherIsBetter: true, source: "PAYS 2025", blurb: "Students who say they feel safe at school." },
  { id: "econ_pct", label: "Economically disadvantaged", unit: "%", higherIsBetter: false, source: "PDE 2024-25", blurb: "District enrollment share identified as economically disadvantaged." },
];

export function districtMetrics(scope: Scope): DistrictMetrics[] {
  const ds = districtScope(scope);
  return all<DistrictMetrics>(`
    WITH m AS (SELECT aun, measure, value FROM district_measures WHERE school_year='2024-25' AND subgroup='all'),
    risk AS (SELECT s.aun, COUNT(*) students, SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END) flagged_n,
             ROUND(100.0*SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) flagged_pct
             FROM students s JOIN student_risk r ON r.student_id=s.id GROUP BY s.aun),
    ctd AS (SELECT s.aun, ROUND(100.0*SUM(CASE WHEN a.n >= 0.1*(SELECT COUNT(DISTINCT date) FROM attendance_daily) THEN 1 ELSE 0 END)/COUNT(*),1) chronic_to_date
            FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id GROUP BY s.aun),
    pays AS (SELECT aun,
             MAX(CASE WHEN indicator='depressive_symptoms' THEN value END) pays_depressive,
             MAX(CASE WHEN indicator='past30_vaping' THEN value END) pays_vaping,
             MAX(CASE WHEN indicator='feel_safe_at_school' THEN value END) pays_safe,
             MAX(CASE WHEN indicator='seriously_considered_suicide' THEN value END) pays_ideation
             FROM pays_results WHERE school_year='2025-26' AND grade='all' AND aun IS NOT NULL GROUP BY aun),
    sap AS (SELECT aun, count sap_cases FROM sap_summary WHERE category='total' AND item='cases'),
    ela AS (SELECT a.aun, p.name ela_program, a.adoption_year ela_program_year FROM program_adoptions a JOIN programs p ON p.id=a.program_id WHERE a.subject='ela' AND p.category='curriculum' AND a.grade_low=0 AND p.id NOT IN ('fundations','heggerty')),
    scr AS (SELECT aun, tool reading_screener FROM screeners_in_use WHERE subject='reading')
    SELECT d.aun, d.name, c.name county, d.tiger_geoid, dy.enrollment, dy.econ_pct, dy.schools,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='ela_prof') ela_prof,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='math_prof') math_prof,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='sci_prof') sci_prof,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='ela_growth') ela_growth,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='math_growth') math_growth,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='regular_attendance') regular_attendance,
      ROUND(100 - (SELECT value FROM m WHERE m.aun=d.aun AND measure='regular_attendance'), 1) chronic_absence,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='grad_4yr') grad_4yr,
      (SELECT value FROM m WHERE m.aun=d.aun AND measure='career_benchmark') career_benchmark,
      ctd.chronic_to_date, risk.flagged_pct, risk.flagged_n, risk.students,
      pays.pays_depressive, pays.pays_vaping, pays.pays_safe, pays.pays_ideation, sap.sap_cases,
      ela.ela_program, ela.ela_program_year, scr.reading_screener
    FROM districts d JOIN counties c ON c.geoid=d.county_geoid
    LEFT JOIN district_years dy ON dy.aun=d.aun AND dy.school_year='2024-25'
    LEFT JOIN risk ON risk.aun=d.aun LEFT JOIN ctd ON ctd.aun=d.aun LEFT JOIN pays ON pays.aun=d.aun LEFT JOIN sap ON sap.aun=d.aun
    LEFT JOIN ela ON ela.aun=d.aun LEFT JOIN scr ON scr.aun=d.aun
    WHERE ${ds.sql} ORDER BY d.name`, ...ds.params);
}

export interface TrendPoint { school_year: string; aun: number; name: string; value: number }
export function districtTrend(measure: string, scope: Scope): TrendPoint[] {
  const ds = districtScope(scope);
  return all<TrendPoint>(`SELECT m.school_year, d.aun, d.name, ROUND(m.value,1) value FROM district_measures m JOIN districts d ON d.aun=m.aun
    WHERE m.measure=? AND m.subgroup='all' AND ${ds.sql} ORDER BY m.school_year, d.name`, measure, ...ds.params);
}

export function iuTrend(measure: string): { school_year: string; iu: number; state: number | null }[] {
  return all(`SELECT m.school_year, ROUND(SUM(m.value*COALESCE(by.enrollment,1))/SUM(COALESCE(by.enrollment,1)),1) iu,
      (SELECT value FROM statewide_measures s WHERE s.school_year=m.school_year AND s.measure=m.measure) state
    FROM building_measures m LEFT JOIN building_years by ON by.building_id=m.building_id AND by.school_year=m.school_year
    WHERE m.measure=? AND m.subgroup='all' GROUP BY m.school_year ORDER BY m.school_year`, measure);
}

export function iuKpis() {
  const enrollment = one<{ n: number }>("SELECT SUM(enrollment) n FROM district_years WHERE school_year='2024-25'")!.n;
  const w = (measure: string, sy = "2024-25") => one<{ v: number }>(`SELECT ROUND(SUM(m.value*COALESCE(by.enrollment,1))/SUM(COALESCE(by.enrollment,1)),1) v FROM building_measures m LEFT JOIN building_years by ON by.building_id=m.building_id AND by.school_year=m.school_year WHERE m.measure=? AND m.subgroup='all' AND m.school_year=?`, measure, sy)!.v;
  const state = (measure: string) => one<{ v: number }>("SELECT value v FROM statewide_measures WHERE measure=? AND school_year='2024-25'", measure)?.v ?? null;
  const flagged = one<{ n: number; pct: number }>("SELECT SUM(CASE WHEN level IN ('high','moderate') THEN 1 ELSE 0 END) n, ROUND(100.0*SUM(CASE WHEN level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) pct FROM student_risk")!;
  const students = one<{ n: number }>("SELECT COUNT(*) n FROM students")!.n;
  const pays = one<{ v: number; s: number }>("SELECT value v, state_value s FROM pays_results WHERE aun IS NULL AND school_year='2025-26' AND indicator='depressive_symptoms' AND grade='all'");
  const sap = one<{ n: number }>("SELECT SUM(count) n FROM sap_summary WHERE category='total' AND item='cases'")!.n;
  return {
    enrollment, students, buildings: one<{ n: number }>("SELECT COUNT(*) n FROM buildings WHERE active=1")!.n,
    ela: w("ela_prof"), elaPrev: w("ela_prof", "2023-24"), elaState: state("ela_prof"),
    math: w("math_prof"), mathPrev: w("math_prof", "2023-24"), mathState: state("math_prof"),
    regAtt: w("regular_attendance"), regAttPrev: w("regular_attendance", "2023-24"), regAttState: state("regular_attendance"),
    grad: w("grad_4yr"), gradState: state("grad_4yr"),
    flaggedN: flagged.n, flaggedPct: flagged.pct, paysDepressive: pays?.v ?? null, paysDepressiveState: pays?.s ?? null, sapCases: sap,
  };
}

/** PAYS CSIU 16 vs all other IUs, 2019-2025 (from the CSIU 16 cross-sectional trends report). */
export function paysIuTrends(indicators: string[]) {
  const rows = all<{ school_year: string; indicator: string; value: number; state_value: number | null }>(
    `SELECT school_year, indicator, value, state_value FROM pays_results WHERE aun IS NULL AND indicator IN (${indicators.map(() => "?").join(",")}) ORDER BY school_year`, ...indicators);
  return rows;
}

export function designationsByDistrict() {
  return all<{ aun: number; building: string; designation: string; subgroup: string }>("SELECT b.aun, b.name building, g.designation, g.subgroup FROM designations g JOIN buildings b ON b.id=g.building_id ORDER BY b.aun");
}
