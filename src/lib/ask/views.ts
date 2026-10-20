import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type { Scope } from "../scope";

/**
 * Scoped semantic layer for "Ask a question".
 *
 * Every question — from the library or from the model — runs against TEMP views named v_*. The views are
 * created per request from the user's scope, so a district user's v_students only contains their students, a
 * board member gets no student-level views at all, and "other districts" collapse into one anonymized
 * "Regional average" row. The SQL never sees the base tables (the validator rejects anything else).
 */

const DB_PATH = process.env.WAREHOUSE_PATH ?? path.join(process.cwd(), "warehouse", "insights.db");
declare global { var __csiuAskDb: Database.Database | undefined }
function conn(): Database.Database {
  if (!global.__csiuAskDb) {
    if (!fs.existsSync(DB_PATH)) throw new Error(`Warehouse not found at ${DB_PATH}. Run: npm run seed`);
    global.__csiuAskDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return global.__csiuAskDb;
}

export interface ViewDoc { name: string; level: string; description: string; columns: string; studentLevel?: boolean }

const N_DAYS = "(SELECT COUNT(DISTINCT date) FROM attendance_daily)";

const DISTRICT_BASE = `
  SELECT d.aun, d.name AS district, c.name AS county, dy.enrollment, dy.econ_pct, dy.el_pct, dy.sped_pct,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='ela_prof' AND m.subgroup='all' AND m.school_year='2024-25') AS ela_prof,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='math_prof' AND m.subgroup='all' AND m.school_year='2024-25') AS math_prof,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='sci_prof' AND m.subgroup='all' AND m.school_year='2024-25') AS sci_prof,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='ela_growth' AND m.subgroup='all' AND m.school_year='2024-25') AS ela_growth,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='math_growth' AND m.subgroup='all' AND m.school_year='2024-25') AS math_growth,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='regular_attendance' AND m.subgroup='all' AND m.school_year='2024-25') AS regular_attendance,
    ROUND(100 - (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='regular_attendance' AND m.subgroup='all' AND m.school_year='2024-25'), 1) AS chronic_absence,
    (SELECT value FROM district_measures m WHERE m.aun=d.aun AND m.measure='grad_4yr' AND m.subgroup='all' AND m.school_year='2024-25') AS grad_4yr,
    (SELECT ROUND(100.0*SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.aun=d.aun) AS flagged_pct,
    (SELECT ROUND(100.0*SUM(CASE WHEN a.n >= 0.1*${N_DAYS} THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id WHERE s.aun=d.aun) AS chronic_to_date,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='depressive_symptoms' AND p.grade='all') AS pays_depressive,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='past30_vaping' AND p.grade='all') AS pays_vaping,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='past30_alcohol' AND p.grade='all') AS pays_alcohol,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='past30_marijuana' AND p.grade='all') AS pays_marijuana,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='seriously_considered_suicide' AND p.grade='all') AS pays_ideation,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='feel_safe_at_school' AND p.grade='all') AS pays_safe,
    (SELECT value FROM pays_results p WHERE p.aun=d.aun AND p.school_year='2025-26' AND p.indicator='bullied_past_year' AND p.grade='all') AS pays_bullied,
    (SELECT count FROM sap_summary x WHERE x.aun=d.aun AND x.category='total' AND x.item='cases') AS sap_cases,
    0 AS is_region_average
  FROM districts d JOIN counties c ON c.geoid=d.county_geoid LEFT JOIN district_years dy ON dy.aun=d.aun AND dy.school_year='2024-25'`;

const NUMERIC_DISTRICT_COLS = ["enrollment", "econ_pct", "el_pct", "sped_pct", "ela_prof", "math_prof", "sci_prof", "ela_growth", "math_growth", "regular_attendance", "chronic_absence", "grad_4yr", "flagged_pct", "chronic_to_date", "pays_depressive", "pays_vaping", "pays_alcohol", "pays_marijuana", "pays_ideation", "pays_safe", "pays_bullied", "sap_cases"];

function buildViews(scope: Scope): { name: string; sql: string; doc: ViewDoc }[] {
  const all = scope.role === "csiu";
  const studentLevel = scope.role !== "board";
  const aun = scope.aun;
  const dWhere = all ? "1=1" : `aun = ${aun}`;                       // district-level rows
  const sWhere = all ? "1=1" : scope.role === "teacher" ? `s.classroom_id = ${scope.classroomId}` : `s.aun = ${aun}`;   // student rows
  const bWhere = all ? "1=1" : scope.role === "teacher" ? `b.id = ${scope.buildingId}` : `b.aun = ${aun}`;             // building rows
  const aggWhere = all ? "1=1" : `s.aun = ${aun}`;                  // aggregate "what works" rows: district-wide even for teachers
  const views: { name: string; sql: string; doc: ViewDoc }[] = [];

  // ---- districts
  const regionRow = `SELECT NULL AS aun, 'Regional average (other districts)' AS district, NULL AS county, ${NUMERIC_DISTRICT_COLS.map((c) => `ROUND(AVG(${c}),1) AS ${c}`).join(", ")}, 1 AS is_region_average FROM base WHERE aun <> ${aun}`;
  views.push({ name: "v_districts", sql: all ? `WITH base AS (${DISTRICT_BASE}) SELECT * FROM base` : `WITH base AS (${DISTRICT_BASE}) SELECT * FROM base WHERE aun = ${aun} UNION ALL ${regionRow}`,
    doc: { name: "v_districts", level: "district", description: all ? "One row per district (17) with the latest real measures (PDE 2024-25, PAYS 2025, SAP 2025-26) and synthetic early-warning summaries." : "Your district plus one anonymized 'Regional average (other districts)' row (is_region_average=1). Other districts are never named.", columns: "aun, district, county, enrollment, econ_pct, el_pct, sped_pct, ela_prof, math_prof, sci_prof, ela_growth, math_growth, regular_attendance, chronic_absence, grad_4yr, flagged_pct, chronic_to_date, pays_depressive, pays_vaping, pays_alcohol, pays_marijuana, pays_ideation, pays_safe, pays_bullied, sap_cases, is_region_average" } });

  views.push({ name: "v_district_trends", sql: all
    ? `SELECT m.aun, d.name AS district, m.school_year, m.measure, ROUND(m.value,1) AS value FROM district_measures m JOIN districts d ON d.aun=m.aun WHERE m.subgroup='all'`
    : `SELECT m.aun, d.name AS district, m.school_year, m.measure, ROUND(m.value,1) AS value FROM district_measures m JOIN districts d ON d.aun=m.aun WHERE m.subgroup='all' AND m.aun=${aun}
       UNION ALL SELECT NULL, 'Regional average (other districts)', m.school_year, m.measure, ROUND(AVG(m.value),1) FROM district_measures m WHERE m.subgroup='all' AND m.aun<>${aun} GROUP BY m.school_year, m.measure`,
    doc: { name: "v_district_trends", level: "district", description: "District measures by school year (2021-22 .. 2024-25). measure in: ela_prof, math_prof, sci_prof, ela_growth, math_growth, regular_attendance, grad_4yr, grad_5yr, career_benchmark, grade3_reading, grade7_math. Chronic absence = 100 - regular_attendance.", columns: "aun, district, school_year, measure, value" } });

  views.push({ name: "v_district_subgroups", sql: `SELECT m.aun, d.name AS district, m.school_year, m.measure, m.subgroup, ROUND(m.value,1) AS value FROM district_measures m JOIN districts d ON d.aun=m.aun WHERE ${all ? "1=1" : `m.aun=${aun}`}`,
    doc: { name: "v_district_subgroups", level: "district", description: "Same measures by student group. subgroup in: all, econ (economically disadvantaged), swd (students with disabilities), el, white, black, hispanic, multi.", columns: "aun, district, school_year, measure, subgroup, value" } });

  views.push({ name: "v_statewide", sql: `SELECT school_year, measure, value FROM statewide_measures`, doc: { name: "v_statewide", level: "state", description: "Pennsylvania statewide averages by year for the same measure keys.", columns: "school_year, measure, value" } });

  views.push({ name: "v_adoptions", sql: `SELECT a.aun, d.name AS district, a.program_id, p.name AS program, p.category, a.subject, a.adoption_year, (2026 - a.adoption_year) AS years_in_use, a.grade_low, a.grade_high, a.tier, a.source FROM program_adoptions a JOIN programs p ON p.id=a.program_id JOIN districts d ON d.aun=a.aun WHERE ${all ? "1=1" : `a.aun=${aun}`}`,
    doc: { name: "v_adoptions", level: "district", description: "Curriculum, intervention program, and practice adoptions per district (illustrative). category in: curriculum, intervention, practice, wellness. Program names include 'CKLA (Core Knowledge Language Arts)', 'Eureka Math', 'Illustrative Mathematics', 'Bridges in Mathematics', 'Wit & Wisdom', 'EL Education Language Arts', 'Into Reading', 'Wonders', 'Second Step', 'PBIS', 'Check-In/Check-Out', 'Restorative practices', 'School-based counseling (Project AWARE)', 'Botvin LifeSkills Training'. Match with LIKE, e.g. program LIKE 'CKLA%'.", columns: "aun, district, program_id, program, category, subject (ela|math|sel|behavior|wellness|attendance), adoption_year, years_in_use, grade_low, grade_high, tier" } });

  views.push({ name: "v_screeners_in_use", sql: `SELECT s.aun, d.name AS district, s.tool, s.subject, s.grade_low, s.grade_high, s.since_year FROM screeners_in_use s JOIN districts d ON d.aun=s.aun WHERE ${all ? "1=1" : `s.aun=${aun}`}`,
    doc: { name: "v_screeners_in_use", level: "district", description: "Benchmark screener tool per district and subject (reading|math): 'Acadience Reading', 'Acadience Math', 'aimswebPlus', 'DIBELS 8th Edition', 'Star Reading', 'Star Math', 'i-Ready Diagnostic'.", columns: "aun, district, tool, subject, grade_low, grade_high, since_year" } });

  // ---- buildings
  views.push({ name: "v_buildings", sql: `
    SELECT b.id AS building_id, b.aun, d.name AS district, b.name AS building, b.level, b.grade_low, b.grade_high, by.enrollment, b.title1,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='ela_prof' AND m.subgroup='all' AND m.school_year='2024-25') AS ela_prof,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='math_prof' AND m.subgroup='all' AND m.school_year='2024-25') AS math_prof,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='ela_growth' AND m.subgroup='all' AND m.school_year='2024-25') AS ela_growth,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='regular_attendance' AND m.subgroup='all' AND m.school_year='2024-25') AS regular_attendance,
      ROUND(100 - (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='regular_attendance' AND m.subgroup='all' AND m.school_year='2024-25'),1) AS chronic_absence,
      ROUND(100 - (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='regular_attendance' AND m.subgroup='all' AND m.school_year='2023-24'),1) AS chronic_absence_prev,
      (SELECT value FROM building_measures m WHERE m.building_id=b.id AND m.measure='grad_4yr' AND m.subgroup='all' AND m.school_year='2024-25') AS grad_4yr,
      (SELECT COUNT(*) FROM students s WHERE s.building_id=b.id) AS students,
      (SELECT ROUND(100.0*COUNT(r.id)/MAX(1,(SELECT COUNT(*) FROM students s WHERE s.building_id=b.id)),1) FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.building_id=b.id) AS referrals_per_100,
      (SELECT ROUND(100.0*SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s JOIN student_risk r ON r.student_id=s.id WHERE s.building_id=b.id) AS flagged_pct,
      (SELECT ROUND(100.0*SUM(CASE WHEN a.n >= 0.1*${N_DAYS} THEN 1 ELSE 0 END)/COUNT(*),1) FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id WHERE s.building_id=b.id) AS chronic_to_date,
      (SELECT ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),1) FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE s.building_id=b.id AND sr.subject='reading' AND sr.school_year='2026-27' AND sr.window='fall') AS reading_on_track_pct,
      (SELECT ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),1) FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE s.building_id=b.id AND sr.subject='math' AND sr.school_year='2026-27' AND sr.window='fall') AS math_on_track_pct,
      (SELECT ROUND(100.0*SUM(CASE WHEN w.risk_level='high' THEN 1 ELSE 0 END)/COUNT(*),1) FROM wellness_screens w JOIN students s ON s.id=w.student_id WHERE s.building_id=b.id AND w.school_year='2026-27' AND w.window='fall') AS wellness_high_pct,
      (SELECT minutes_per_day FROM instruction_minutes i WHERE i.building_id=b.id AND i.subject='ela' ORDER BY grade_band LIMIT 1) AS ela_minutes,
      (SELECT minutes_per_day FROM instruction_minutes i WHERE i.building_id=b.id AND i.subject='math' ORDER BY grade_band LIMIT 1) AS math_minutes,
      (SELECT GROUP_CONCAT(g.designation || ' (' || g.subgroup || ')', '; ') FROM designations g WHERE g.building_id=b.id) AS designation,
      (SELECT ROUND(student_teacher_ratio,1) FROM staffing st WHERE st.building_id=b.id AND st.school_year='2026-27') AS student_teacher_ratio,
      (SELECT counselors FROM staffing st WHERE st.building_id=b.id AND st.school_year='2026-27') AS counselors
    FROM buildings b JOIN districts d ON d.aun=b.aun LEFT JOIN building_years by ON by.building_id=b.id AND by.school_year='2024-25' WHERE b.active=1 AND ${bWhere}`,
    doc: { name: "v_buildings", level: "building", description: "One row per school building with real PDE 2024-25 measures and synthetic current-year summaries. level in: elementary, intermediate, middle, high, secondary, k12.", columns: "building_id, aun, district, building, level, grade_low, grade_high, enrollment, title1, ela_prof, math_prof, ela_growth, regular_attendance, chronic_absence, chronic_absence_prev, grad_4yr, students, referrals_per_100, flagged_pct, chronic_to_date, reading_on_track_pct, math_on_track_pct, wellness_high_pct, ela_minutes, math_minutes, designation, student_teacher_ratio, counselors" } });

  views.push({ name: "v_building_monthly", sql: `SELECT m.building_id, b.name AS building, d.name AS district, m.school_year, m.month, m.absence_rate, m.chronic_pct_to_date FROM building_attendance_monthly m JOIN buildings b ON b.id=m.building_id JOIN districts d ON d.aun=b.aun WHERE ${bWhere}`,
    doc: { name: "v_building_monthly", level: "building", description: "Monthly attendance per building for 2023-24 .. 2026-27 (current year has months 8,9,10 only). month is calendar month (8=August). chronic_pct_to_date = percent of students chronically absent so far that year.", columns: "building_id, building, district, school_year, month, absence_rate, chronic_pct_to_date" } });

  views.push({ name: "v_building_subgroups", sql: `SELECT m.building_id, b.name AS building, d.name AS district, m.school_year, m.measure, m.subgroup, ROUND(m.value,1) AS value FROM building_measures m JOIN buildings b ON b.id=m.building_id JOIN districts d ON d.aun=b.aun WHERE ${bWhere}`,
    doc: { name: "v_building_subgroups", level: "building", description: "Building measures by school year and subgroup (real PDE). Same measure/subgroup keys as v_district_subgroups.", columns: "building_id, building, district, school_year, measure, subgroup, value" } });

  views.push({ name: "v_pays", sql: `SELECT p.aun, COALESCE(d.name, 'CSIU 16 region') AS district, p.school_year, p.indicator, p.grade, p.value, p.state_value FROM pays_results p LEFT JOIN districts d ON d.aun=p.aun WHERE ${all ? "1=1" : `(p.aun=${aun} OR p.aun IS NULL)`}`,
    doc: { name: "v_pays", level: "district", description: "PAYS survey results (real, 2025 = school_year '2025-26'; earlier years for trends). grade in: all, 6, 8, 10, 12. Indicators: past30_alcohol, past30_vaping, past30_marijuana, past30_cigarettes, lifetime_alcohol, lifetime_vaping, depressive_symptoms, seriously_considered_suicide, attempted_suicide, self_harm_past_year, feel_safe_at_school, bullied_past_year, stayed_home_bullying, gambling_past30. district 'CSIU 16 region' is the IU-wide row (aun NULL). state_value = Pennsylvania.", columns: "aun, district, school_year, indicator, grade, value, state_value" } });

  views.push({ name: "v_sap", sql: `SELECT s.aun, d.name AS district, s.school_year, s.category, s.item, s.count FROM sap_summary s JOIN districts d ON d.aun=s.aun WHERE ${all ? "1=1" : `s.aun=${aun}`}`,
    doc: { name: "v_sap", level: "district", description: "Student Assistance Program 2025-26 district summary counts (real). category in: total (item='cases'), referrals_by_month, by_grade, by_gender, referral_source, primary_reason, parent_permission, school_service, community_service, action_plan, goals_met. primary_reason items: internalizing_behaviors, externalizing_behaviors, academic_concerns, attendance, substance_use, suicide_ideation_gesture_attempt, bullying, ...", columns: "aun, district, school_year, category, item, count" } });

  views.push({ name: "v_programs", sql: `SELECT id AS program_id, name AS program, category, subject, description FROM programs`, doc: { name: "v_programs", level: "reference", description: "Catalog of programs, interventions, practices, and screeners.", columns: "program_id, program, category, subject, description" } });

  // ---- aggregate "what works" (safe for every role: no student identifiers)
  views.push({ name: "v_support_results", sql: `
    WITH treated AS (SELECT DISTINCT i.student_id, i.domain FROM interventions i WHERE i.status='completed'),
    base AS (SELECT o.domain, o.improved FROM student_outcomes o JOIN students s ON s.id=o.student_id LEFT JOIN treated t ON t.student_id=o.student_id AND t.domain=o.domain
       WHERE t.student_id IS NULL AND ${aggWhere} AND ((o.domain='attendance' AND o.pre_value>=7.8) OR (o.domain='behavior' AND o.pre_value>=0.44) OR (o.domain='academic' AND o.pre_value<25) OR (o.domain='wellness' AND o.pre_value>=6))),
    untreated AS (SELECT domain, ROUND(100.0*AVG(improved),0) AS pct, COUNT(*) AS n FROM base GROUP BY domain)
    SELECT d.name AS district, i.program_id, p.name AS program, i.domain, COUNT(*) AS students, ROUND(100.0*AVG(i.improved),0) AS improved_pct, u.pct AS similar_untreated_pct, u.n AS similar_untreated_n,
      ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start<=14 THEN i.improved END),0) AS improved_pct_early_start,
      ROUND(100.0*AVG(CASE WHEN i.days_from_flag_to_start>14 THEN i.improved END),0) AS improved_pct_late_start,
      ROUND(AVG(i.fidelity),2) AS avg_fidelity, MIN(i.funding) AS funding
    FROM interventions i JOIN students s ON s.id=i.student_id JOIN districts d ON d.aun=s.aun JOIN programs p ON p.id=i.program_id LEFT JOIN untreated u ON u.domain=i.domain
    WHERE i.status='completed' AND ${aggWhere} GROUP BY d.name, i.program_id`,
    doc: { name: "v_support_results", level: "intervention (aggregate)", description: "Prior-year (2025-26) completed supports: students served per district and program, percent improved, and percent improved among similar students with the same baseline who received no support in that domain. domain in: attendance, behavior, academic, wellness. Aggregate only; safe for the board.", columns: "district, program_id, program, domain, students, improved_pct, similar_untreated_pct, similar_untreated_n, improved_pct_early_start, improved_pct_late_start, avg_fidelity, funding" } });

  if (!studentLevel) return views;

  // ---- student level (district, teacher, csiu)
  const label = scope.role === "teacher" ? "s.first_name || ' ' || SUBSTR(s.last_name,1,1) || '.'" : "'Student ' || s.id";
  views.push({ name: "v_students", sql: `
    SELECT s.id AS student_id, ${label} AS student, d.name AS district, b.name AS building, b.id AS building_id, c.name AS classroom, s.classroom_id, s.grade, s.gender, s.race, s.econ_disadvantaged AS econ, s.iep, s.el, s.gifted, s.new_to_building,
      (SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%') AS days_missed,
      ROUND(100.0*(SELECT COUNT(*) FROM attendance_daily a WHERE a.student_id=s.id AND a.status LIKE 'absent%')/${N_DAYS},1) AS absence_rate,
      s.prior_year_absences,
      (SELECT COUNT(*) FROM behavior_referrals r WHERE r.student_id=s.id) AS referrals,
      (SELECT COUNT(*) FROM nurse_visits n WHERE n.student_id=s.id) AS nurse_visits,
      r.score AS risk_score, r.level AS risk_level, r.factors_json AS factors_json,
      (SELECT benchmark FROM screener_results sr WHERE sr.student_id=s.id AND sr.subject='reading' AND sr.school_year='2026-27' AND sr.window='fall') AS reading_benchmark,
      (SELECT benchmark FROM screener_results sr WHERE sr.student_id=s.id AND sr.subject='math' AND sr.school_year='2026-27' AND sr.window='fall') AS math_benchmark,
      (SELECT risk_level FROM wellness_screens w WHERE w.student_id=s.id AND w.school_year='2026-27' AND w.window='fall') AS wellness_level,
      (SELECT GROUP_CONCAT(p.name, '; ') FROM interventions i JOIN programs p ON p.id=i.program_id WHERE i.student_id=s.id AND i.status='active') AS supports,
      (SELECT letter FROM course_grades g WHERE g.student_id=s.id AND g.school_year='2026-27' AND g.term='CURRENT' AND g.subject='Math') AS math_grade,
      (SELECT letter FROM course_grades g WHERE g.student_id=s.id AND g.school_year='2026-27' AND g.term='CURRENT' AND g.subject='ELA') AS ela_grade
    FROM students s JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun LEFT JOIN classrooms c ON c.id=s.classroom_id LEFT JOIN student_risk r ON r.student_id=s.id WHERE ${sWhere}`,
    doc: { name: "v_students", level: "student (synthetic)", description: "One row per student in scope with current-year summaries. risk_level in: low, watch, moderate, high. Benchmarks in: above, on_track, approaching, below. wellness_level in: low, moderate, high. Names are masked except for teachers.", columns: "student_id, student, district, building, building_id, classroom, classroom_id, grade, gender, race, econ, iep, el, gifted, new_to_building, days_missed, absence_rate, prior_year_absences, referrals, nurse_visits, risk_score, risk_level, factors_json, reading_benchmark, math_benchmark, wellness_level, supports, math_grade, ela_grade", studentLevel: true } });

  views.push({ name: "v_interventions", sql: `
    SELECT i.id AS intervention_id, i.student_id, d.name AS district, b.name AS building, s.grade, i.program_id, p.name AS program, i.domain, i.tier, i.start_date, i.end_date, i.status, i.referral_reason,
      i.days_from_flag_to_start, CASE WHEN i.days_from_flag_to_start<=14 THEN 1 ELSE 0 END AS early_start, i.sessions_planned, i.sessions_delivered, i.fidelity, i.funding, i.provider, i.outcome_measure, i.pre_value, i.post_value, i.improved
    FROM interventions i JOIN students s ON s.id=i.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun JOIN programs p ON p.id=i.program_id WHERE ${sWhere}`,
    doc: { name: "v_interventions", level: "student x intervention (synthetic)", description: "One row per support episode. status in: completed (2025-26, with improved 0/1), active (2026-27, improved NULL). domain in: attendance, behavior, academic, wellness. outcome_measure in: absence_rate, referrals_per_month, reading_percentile, math_percentile, gpa, wellness_score.", columns: "intervention_id, student_id, district, building, grade, program_id, program, domain, tier, start_date, end_date, status, referral_reason, days_from_flag_to_start, early_start, sessions_planned, sessions_delivered, fidelity, funding, provider, outcome_measure, pre_value, post_value, improved", studentLevel: true } });

  views.push({ name: "v_outcomes", sql: `
    SELECT o.student_id, d.name AS district, b.name AS building, s.grade, o.domain, o.measure, o.pre_value, o.post_value, o.improved,
      CASE WHEN EXISTS (SELECT 1 FROM interventions i WHERE i.student_id=o.student_id AND i.domain=o.domain AND i.status='completed') THEN 1 ELSE 0 END AS treated,
      s.prior_year_absences
    FROM student_outcomes o JOIN students s ON s.id=o.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_outcomes", level: "student (synthetic)", description: "Prior-year fall-to-spring outcome for EVERY student in each domain, with treated=1 if they received a completed support in that domain. Use it to compare treated vs. similar untreated students (match on pre_value).", columns: "student_id, district, building, grade, domain, measure, pre_value, post_value, improved, treated, prior_year_absences", studentLevel: true } });

  views.push({ name: "v_screener_results", sql: `SELECT sr.student_id, d.name AS district, b.name AS building, s.grade, sr.tool, sr.subject, sr.school_year, sr.window, sr.measure, sr.score, sr.percentile, sr.benchmark FROM screener_results sr JOIN students s ON s.id=sr.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_screener_results", level: "student (synthetic)", description: "Benchmark screener results, K-8, windows fall/winter/spring for 2025-26 and fall for 2026-27. subject in reading, math.", columns: "student_id, district, building, grade, tool, subject, school_year, window, measure, score, percentile, benchmark", studentLevel: true } });

  views.push({ name: "v_referrals", sql: `SELECT r.student_id, d.name AS district, b.name AS building, b.id AS building_id, s.grade, r.date, r.category, r.location, r.time_of_day, r.action, r.minor FROM behavior_referrals r JOIN students s ON s.id=r.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_referrals", level: "student (synthetic)", description: "Office discipline referrals this school year (since 2026-08-25). time_of_day in: morning, mid-day, after lunch, afternoon, dismissal.", columns: "student_id, district, building, building_id, grade, date, category, location, time_of_day, action, minor", studentLevel: true } });

  views.push({ name: "v_wellness", sql: `SELECT w.student_id, d.name AS district, b.name AS building, s.grade, w.school_year, w.window, w.risk_level, w.anxiety, w.depression, w.connectedness, w.safety FROM wellness_screens w JOIN students s ON s.id=w.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_wellness", level: "student (synthetic)", description: "Project AWARE universal wellness screener (grades 3-12), windows fall/spring 2025-26 and fall 2026-27. Scales 0-10 (higher anxiety/depression = more concern).", columns: "student_id, district, building, grade, school_year, window, risk_level, anxiety, depression, connectedness, safety", studentLevel: true } });

  views.push({ name: "v_checkins", sql: `SELECT c.student_id, d.name AS district, b.name AS building, s.grade, c.date, c.score FROM wellness_checkins c JOIN students s ON s.id=c.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_checkins", level: "student (synthetic)", description: "Weekly 1-5 wellness check-in scores (grades 3-12), one per Wednesday this year.", columns: "student_id, district, building, grade, date, score", studentLevel: true } });

  views.push({ name: "v_attendance_daily", sql: `SELECT a.student_id, d.name AS district, b.name AS building, s.grade, a.date, a.status FROM attendance_daily a JOIN students s ON s.id=a.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_attendance_daily", level: "student (synthetic)", description: "Non-present days only (absent_excused, absent_unexcused, tardy) for this school year; present days are not stored. Total school days so far = (SELECT COUNT(DISTINCT date) FROM v_attendance_daily).", columns: "student_id, district, building, grade, date, status", studentLevel: true } });

  views.push({ name: "v_grades", sql: `SELECT g.student_id, d.name AS district, b.name AS building, s.grade AS grade_level, g.school_year, g.term, g.subject, g.letter, g.percent FROM course_grades g JOIN students s ON s.id=g.student_id JOIN buildings b ON b.id=s.building_id JOIN districts d ON d.aun=s.aun WHERE ${sWhere}`,
    doc: { name: "v_grades", level: "student (synthetic)", description: "Course grades. term in: FINAL (2025-26), MP1 and CURRENT (2026-27). subject in: ELA, Math, Science, Social Studies, Elective.", columns: "student_id, district, building, grade_level, school_year, term, subject, letter, percent", studentLevel: true } });

  return views;
}

export interface ExecResult { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; ms: number }

const FORBIDDEN = /\b(attach|detach|pragma|insert|update|delete|drop|create|alter|replace|vacuum|reindex)\b/i;

/** Validates model/library SQL: single SELECT, only v_* views (plus CTE names), no writes. Returns the referenced views. */
export function validateSql(sql: string, allowedViews: Set<string>): string[] {
  const s = sql.trim().replace(/;\s*$/, "");
  if (s.includes(";")) throw new Error("Only a single statement is allowed.");
  if (!/^\s*(select|with)\b/i.test(s)) throw new Error("Only SELECT queries are allowed.");
  if (FORBIDDEN.test(s)) throw new Error("Query contains a forbidden keyword.");
  const ctes = new Set<string>();
  for (const m of s.matchAll(/(?:with|,)\s*([a-z_][a-z0-9_]*)\s+as\s*\(/gi)) ctes.add(m[1].toLowerCase());
  const refs: string[] = [];
  for (const m of s.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)) {
    const name = m[1].toLowerCase();
    if (ctes.has(name)) continue;
    if (!allowedViews.has(name)) throw new Error(`"${name}" is not available in your scope. Use the v_* views only.`);
    refs.push(name);
  }
  return refs;
}

/** Creates the scoped views, runs fn, and tears them down. Synchronous so requests never interleave. */
export function withScopedViews<T>(scope: Scope, fn: (ctx: { run: (sql: string, params?: unknown[]) => ExecResult; docs: ViewDoc[]; allowed: Set<string> }) => T): T {
  const db = conn();
  const views = buildViews(scope);
  const allowed = new Set(views.map((v) => v.name));
  for (const v of views) { db.exec(`DROP VIEW IF EXISTS temp.${v.name}`); db.exec(`CREATE TEMP VIEW ${v.name} AS ${v.sql}`); }
  try {
    const run = (sql: string, params: unknown[] = []): ExecResult => {
      validateSql(sql, allowed);
      const t0 = Date.now();
      const stmt = db.prepare(`SELECT * FROM (${sql.trim().replace(/;\s*$/, "")}) LIMIT 501`);
      if (!stmt.readonly) throw new Error("Query is not read-only.");
      const rows = stmt.all(...params) as Record<string, unknown>[];
      const truncated = rows.length > 500;
      return { columns: stmt.columns().map((c) => c.name), rows: truncated ? rows.slice(0, 500) : rows, truncated, ms: Date.now() - t0 };
    };
    return fn({ run, docs: views.map((v) => v.doc), allowed });
  } finally {
    for (const v of views) db.exec(`DROP VIEW IF EXISTS temp.${v.name}`);
  }
}

export function schemaDoc(docs: ViewDoc[]): string {
  return docs.map((d) => `### ${d.name}  [${d.level}]\n${d.description}\nColumns: ${d.columns}`).join("\n\n");
}
