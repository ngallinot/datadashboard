import "server-only";
import type { Scope } from "../scope";

/**
 * Library of example questions that are guaranteed to work in every scope. Each entry carries the SQL (over the
 * scoped v_* views), a chart spec, optional map highlighting, and a deterministic narrator that writes the bullets
 * from the actual result rows. These also serve as few-shot examples for the live model.
 */
export type ChartType = "bar" | "hbar" | "line" | "grouped" | "table";
export interface ChartSpec { type: ChartType; x?: string; y?: string[]; unit?: string; labels?: Record<string, string>; height?: number }
export interface LibraryEntry {
  id: string; question: string; level: string; keywords: string[]; title: string;
  sql: string; chart: ChartSpec;
  /** column holding the district AUN to highlight on the map (CSIU only) */
  mapAunCol?: string; mapValueCol?: string; mapLabel?: string; mapHigherIsBetter?: boolean;
  compareSql?: string; compareChart?: ChartSpec; compareTitle?: string;
  studentLevel?: boolean;           // not available to the board role
  narrate: (rows: Record<string, any>[], scope: Scope, compare?: Record<string, any>[]) => string[];
}

const f1 = (v: unknown) => (typeof v === "number" ? v.toFixed(1) : String(v ?? "—"));
const signed = (v: unknown) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : String(v ?? "—"));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const top = (rows: Record<string, any>[], n = 3) => rows.slice(0, n);
const regionRow = (rows: Record<string, any>[]) => rows.find((r) => r.is_region_average === 1 || String(r.district ?? "").startsWith("Regional average"));
const own = (rows: Record<string, any>[], scope: Scope) => rows.find((r) => r.district === scope.districtName);

const N_DAYS = "(SELECT COUNT(DISTINCT date) FROM v_attendance_daily)";

export const LIBRARY: LibraryEntry[] = [
  {
    id: "ckla", question: "Show me what districts are using CKLA.", level: "District · curriculum", keywords: ["ckla", "using", "districts", "core knowledge"],
    title: "Districts using CKLA (Core Knowledge Language Arts)",
    sql: `WITH ck AS (SELECT aun, district, adoption_year, years_in_use, grade_low, grade_high FROM v_adoptions WHERE program LIKE 'CKLA%'),
      cur AS (SELECT aun, district, value FROM v_district_trends WHERE measure='ela_prof' AND school_year='2024-25'),
      ranked AS (SELECT aun, RANK() OVER (ORDER BY value DESC) AS rank_in_iu FROM cur WHERE aun IS NOT NULL)
      SELECT ck.district, ('K-' || ck.grade_high) AS grades, ck.adoption_year, ck.years_in_use, cur.value AS ela_prof_2024_25,
        (SELECT t.school_year FROM v_district_trends t WHERE t.aun=ck.aun AND t.measure='ela_prof' AND t.school_year >= (ck.adoption_year || '-' || SUBSTR(CAST(ck.adoption_year+1 AS TEXT),3,2)) ORDER BY t.school_year LIMIT 1) AS baseline_year,
        ROUND(cur.value - (SELECT t.value FROM v_district_trends t WHERE t.aun=ck.aun AND t.measure='ela_prof' AND t.school_year >= (ck.adoption_year || '-' || SUBSTR(CAST(ck.adoption_year+1 AS TEXT),3,2)) ORDER BY t.school_year LIMIT 1),1) AS change_since_baseline,
        r.rank_in_iu, ck.aun
      FROM ck JOIN cur ON cur.aun=ck.aun LEFT JOIN ranked r ON r.aun=ck.aun ORDER BY cur.value DESC`,
    chart: { type: "hbar", x: "district", y: ["ela_prof_2024_25"], unit: "%" }, mapAunCol: "aun", mapValueCol: "ela_prof_2024_25", mapLabel: "ELA proficiency (CKLA districts)", mapHigherIsBetter: true,
    compareSql: `WITH ck AS (SELECT aun FROM v_adoptions WHERE program LIKE 'CKLA%')
      SELECT CASE WHEN d.aun IN (SELECT aun FROM ck) THEN 'CKLA districts' ELSE 'Other districts' END AS grp, ROUND(AVG(d.ela_prof),1) AS ela_prof, ROUND(AVG(d.ela_growth),1) AS ela_growth, COUNT(*) AS districts
      FROM v_districts d WHERE d.aun IS NOT NULL GROUP BY grp ORDER BY grp`,
    compareChart: { type: "grouped", x: "grp", y: ["ela_prof", "ela_growth"], unit: "", labels: { ela_prof: "ELA proficiency 2024-25 (%)", ela_growth: "ELA growth index (PVAAS)" } }, compareTitle: "CKLA districts vs. other districts",
    narrate: (rows, scope, cmp) => {
      if (!rows.length) return [`${scope.districtName} does not use CKLA. The regional average ELA proficiency is ${f1(regionRow(cmp ?? [])?.ela_prof ?? "—")}%.`];
      const b: string[] = [];
      b.push(`${rows.length} ${plural(rows.length, "district uses", "districts use")} CKLA as the K-5 ELA core: ${rows.map((r) => `${r.district} (since ${r.adoption_year})`).join(", ")}.`);
      const best = rows[0]; b.push(`${best.district} has the highest ELA proficiency among them at ${f1(best.ela_prof_2024_25)}% (rank ${best.rank_in_iu ?? "—"} of 17 in the IU).`);
      const longest = [...rows].sort((a, c) => c.years_in_use - a.years_in_use)[0];
      b.push(`${longest.district} has used it longest (${longest.years_in_use} years); its ELA proficiency has moved ${f1(longest.change_since_baseline)} points since ${longest.baseline_year}.`);
      const improving = rows.filter((r) => (r.change_since_baseline ?? 0) > 0);
      b.push(`${improving.length} of ${rows.length} CKLA districts improved ELA proficiency since their baseline year; the others slipped (statewide ELA fell about 1.5 points over the same period).`);
      if (cmp?.length === 2) { const ck = cmp.find((r) => r.grp === "CKLA districts"), ot = cmp.find((r) => r.grp === "Other districts"); if (ck && ot) b.push(`On average, CKLA districts sit at ${f1(ck.ela_prof)}% ELA proficient versus ${f1(ot.ela_prof)}% for the other ${ot.districts} districts — a small sample and an illustrative adoption list, not a causal finding.`); }
      return b;
    },
  },
  {
    id: "math_improved", question: "Which districts improved math proficiency most over three years?", level: "District · assessment", keywords: ["math", "improved", "proficiency", "three years", "most", "districts"],
    title: "Change in math proficiency, 2021-22 to 2024-25",
    sql: `SELECT district, aun, MAX(CASE WHEN school_year='2021-22' THEN value END) AS math_2021_22, MAX(CASE WHEN school_year='2024-25' THEN value END) AS math_2024_25,
        ROUND(MAX(CASE WHEN school_year='2024-25' THEN value END) - MAX(CASE WHEN school_year='2021-22' THEN value END),1) AS change_pts
      FROM v_district_trends WHERE measure='math_prof' GROUP BY district ORDER BY change_pts DESC`,
    chart: { type: "hbar", x: "district", y: ["change_pts"], unit: " pts" }, mapAunCol: "aun", mapValueCol: "change_pts", mapLabel: "Math proficiency change (pts)", mapHigherIsBetter: true,
    narrate: (rows, scope) => {
      const b: string[] = []; const named = rows.filter((r) => r.aun); const t = top(named);
      if (named.length > 1) b.push(`${t.map((r) => `${r.district} (${signed(r.change_pts)} pts)`).join(", ")} improved the most over three years.`);
      const up = rows.filter((r) => r.change_pts > 0 && r.aun); if (named.length > 1) b.push(`${up.length} of ${rows.filter((r) => r.aun).length} districts gained ground; Pennsylvania's math proficiency rose about 4 points statewide over the same window.`);
      const o = own(rows, scope); if (o) b.push(`${o.district}: ${f1(o.math_2021_22)}% → ${f1(o.math_2024_25)}% (${signed(o.change_pts)} pts).`);
      const r = regionRow(rows); if (r) b.push(`Other districts in the region averaged ${f1(r.math_2021_22)}% → ${f1(r.math_2024_25)}%.`);
      const last = named[named.length - 1]; if (named.length > 1 && last && last.change_pts < 0) b.push(`The largest decline was ${last.district} at ${f1(last.change_pts)} pts.`);
      return b;
    },
  },
  {
    id: "chronic_rising", question: "Where is chronic absence rising fastest this year?", level: "Building · attendance", keywords: ["chronic", "absence", "rising", "fastest", "this year", "where"],
    title: "Chronic absence to date vs. the same point last year, by building",
    sql: `SELECT c.building, c.district, c.building_id, c.chronic_pct_to_date AS this_year_pct, p.chronic_pct_to_date AS last_year_pct, ROUND(c.chronic_pct_to_date - p.chronic_pct_to_date,1) AS change_pts
      FROM v_building_monthly c JOIN v_building_monthly p ON p.building_id=c.building_id AND p.school_year='2025-26' AND p.month=c.month
      WHERE c.school_year='2026-27' AND c.month=10 ORDER BY change_pts DESC LIMIT 15`,
    chart: { type: "hbar", x: "building", y: ["change_pts"], unit: " pts" },
    narrate: (rows) => {
      if (!rows.length) return ["No buildings in scope."];
      const b: string[] = []; const t = top(rows);
      b.push(`Chronic absence to date is up most at ${t.map((r) => `${r.building} (${r.district}, ${signed(r.change_pts)} pts to ${f1(r.this_year_pct)}%)`).join("; ")}.`);
      const rising = rows.filter((r) => r.change_pts > 0); b.push(`${rising.length} of the ${rows.length} buildings shown are above their own pace from last October; early-year rates are noisy and usually settle by winter.`);
      b.push("Suggested next step: have each attendance team review the students who have already missed 10% of days before winter break — in past years that pattern came before a rise in course failures by spring.");
      return b;
    },
  },
  {
    id: "odr_per_100", question: "Which buildings have the highest office discipline referrals per 100 students?", level: "Building · behavior", keywords: ["referrals", "discipline", "office", "per 100", "highest", "buildings", "odr"],
    title: "Office discipline referrals per 100 students, this year to date",
    sql: `SELECT building, district, level, students, referrals_per_100, flagged_pct FROM v_buildings ORDER BY referrals_per_100 DESC LIMIT 15`,
    chart: { type: "hbar", x: "building", y: ["referrals_per_100"], unit: "" },
    narrate: (rows) => {
      if (!rows.length) return ["No buildings in scope."];
      const b: string[] = []; const t = top(rows);
      b.push(`${t.map((r) => `${r.building} (${r.district}) at ${f1(r.referrals_per_100)} per 100`).join(", ")} lead the region since August.`);
      const mids = rows.filter((r) => r.level === "middle" || r.level === "secondary").length; b.push(`${mids} of the top ${rows.length} are middle or secondary buildings, where after-lunch transitions account for a large share of referrals.`);
      b.push("Suggested next step: compare referral times and locations for the top buildings (ask: \"most common referral times and locations\") and pair with CSIU PBIS / I-MTSS coaching.");
      return b;
    },
  },
  {
    id: "interventions_rising_absence", question: "What interventions have the best outcomes for students with rising absences in grades 6–8?", level: "Student · interventions", keywords: ["interventions", "best", "outcomes", "rising", "absences", "grades 6", "6-8", "middle"], studentLevel: true,
    title: "Attendance supports for grades 6-8 students with rising absences (2025-26 completed episodes)",
    sql: `WITH untreated AS (SELECT ROUND(100.0*AVG(improved),0) AS pct, COUNT(*) AS n FROM v_outcomes WHERE domain='attendance' AND treated=0 AND grade BETWEEN 6 AND 8 AND pre_value >= 7.8)
      SELECT i.program, COUNT(*) AS students, ROUND(100.0*AVG(i.improved),0) AS improved_pct, u.pct AS similar_untreated_pct,
        ROUND(100.0*AVG(CASE WHEN i.early_start=1 THEN i.improved END),0) AS improved_pct_early_start, ROUND(AVG(i.fidelity),2) AS avg_fidelity
      FROM v_interventions i, untreated u WHERE i.domain='attendance' AND i.status='completed' AND i.grade BETWEEN 6 AND 8 AND i.referral_reason LIKE 'Absences rising%'
      GROUP BY i.program HAVING COUNT(*) >= 3 ORDER BY improved_pct DESC`,
    chart: { type: "grouped", x: "program", y: ["improved_pct", "similar_untreated_pct"], unit: "%", labels: { improved_pct: "Received support: % improved", similar_untreated_pct: "Similar students, no support" } },
    narrate: (rows) => {
      if (!rows.length) return ["No completed attendance supports for grades 6-8 in scope."];
      const b: string[] = []; const best = rows[0];
      b.push(`${best.program} had the best outcomes: ${best.improved_pct}% of ${best.students} ${plural(best.students, "student", "students")} improved their attendance, compared with ${best.similar_untreated_pct}% of similar students who received no support.`);
      const early = rows.filter((r) => r.improved_pct_early_start !== null && r.improved_pct_early_start > r.improved_pct); if (early.length) b.push(`Starting within two weeks of the flag mattered: ${early.map((r) => `${r.program} ${r.improved_pct_early_start}% when started early`).join("; ")}.`);
      b.push(`Every listed support beat the no-support comparison (${best.similar_untreated_pct}%), but samples are small for ${rows.filter((r) => r.students < 30).map((r) => r.program).join(", ") || "none"}.`);
      b.push("Predictions and comparisons support professional judgment; the student's team decides what fits.");
      return b;
    },
  },
  {
    id: "acadience_growth", question: "Which schools use Acadience and how do their fall-to-winter growth rates compare?", level: "District · screeners", keywords: ["acadience", "growth", "fall", "winter", "screener", "schools", "use"], studentLevel: true,
    title: "Reading screener tool by district and fall-to-winter growth (2025-26)",
    sql: `WITH g AS (SELECT f.district, ROUND(AVG(w.percentile - f.percentile),1) AS fall_to_winter_growth, COUNT(*) AS students
        FROM v_screener_results f JOIN v_screener_results w ON w.student_id=f.student_id AND w.subject=f.subject AND w.school_year=f.school_year AND w.window='winter'
        WHERE f.window='fall' AND f.subject='reading' AND f.school_year='2025-26' GROUP BY f.district)
      SELECT s.district, s.aun, s.tool, s.since_year, g.fall_to_winter_growth, g.students FROM v_screeners_in_use s LEFT JOIN g ON g.district=s.district WHERE s.subject='reading' ORDER BY g.fall_to_winter_growth DESC`,
    chart: { type: "hbar", x: "district", y: ["fall_to_winter_growth"], unit: " pctl" }, mapAunCol: "aun", mapValueCol: "fall_to_winter_growth", mapLabel: "Fall→winter growth (percentile points)", mapHigherIsBetter: true,
    narrate: (rows) => {
      const ac = rows.filter((r) => String(r.tool).startsWith("Acadience")); const other = rows.filter((r) => !String(r.tool).startsWith("Acadience"));
      const avg = (xs: any[]) => xs.length ? xs.reduce((s, r) => s + (r.fall_to_winter_growth ?? 0), 0) / xs.length : null;
      const b: string[] = [];
      b.push(ac.length ? `${ac.length} ${plural(ac.length, "district uses", "districts use")} Acadience Reading: ${ac.map((r) => r.district).join(", ")}.` : "No district in scope uses Acadience Reading.");
      if (ac.length && other.length) b.push(`Acadience districts averaged ${f1(avg(ac))} percentile points of fall-to-winter growth versus ${f1(avg(other))} for districts on ${[...new Set(other.map((r) => r.tool))].join(", ")}.`);
      if (rows[0]) b.push(`Highest growth: ${rows[0].district} (${f1(rows[0].fall_to_winter_growth)} points, ${rows[0].tool}).`);
      b.push("Growth here is synthetic benchmark data; the tool-in-use list reflects Drive evidence for Bloomsburg (Acadience), Millville and Southern Columbia (aimsweb) and is illustrative elsewhere.");
      return b;
    },
  },
  {
    id: "pays_substance", question: "How do PAYS substance-use indicators compare across districts?", level: "District · PAYS", keywords: ["pays", "substance", "alcohol", "vaping", "marijuana", "compare", "districts"],
    title: "PAYS 2025: past-30-day use, grades 6-12 combined",
    sql: `SELECT district, aun, pays_alcohol AS alcohol_past30, pays_vaping AS vaping_past30, pays_marijuana AS marijuana_past30,
        (SELECT state_value FROM v_pays WHERE aun IS NULL AND indicator='past30_alcohol' AND grade='all' AND school_year='2025-26') AS state_alcohol,
        (SELECT state_value FROM v_pays WHERE aun IS NULL AND indicator='past30_vaping' AND grade='all' AND school_year='2025-26') AS state_vaping,
        (SELECT state_value FROM v_pays WHERE aun IS NULL AND indicator='past30_marijuana' AND grade='all' AND school_year='2025-26') AS state_marijuana
      FROM v_districts WHERE pays_vaping IS NOT NULL ORDER BY vaping_past30 DESC`,
    chart: { type: "grouped", x: "district", y: ["alcohol_past30", "vaping_past30", "marijuana_past30"], unit: "%", labels: { alcohol_past30: "Alcohol", vaping_past30: "Vaping", marijuana_past30: "Marijuana" }, height: 300 }, mapAunCol: "aun", mapValueCol: "vaping_past30", mapLabel: "PAYS: vaped in past 30 days", mapHigherIsBetter: false,
    narrate: (rows) => {
      if (!rows.length) return ["No PAYS results in scope."];
      const st = rows[0]; const b: string[] = [];
      b.push(`Statewide 2025: ${f1(st.state_alcohol)}% alcohol, ${f1(st.state_vaping)}% vaping, ${f1(st.state_marijuana)}% marijuana in the past 30 days.`);
      const aboveV = rows.filter((r) => r.aun && r.vaping_past30 > r.state_vaping); b.push(aboveV.length ? `Above the state on vaping: ${aboveV.map((r) => `${r.district} (${f1(r.vaping_past30)}%)`).join(", ")}.` : "No district in scope is above the state rate for vaping.");
      const hiA = [...rows].filter((r) => r.aun).sort((a, c) => c.alcohol_past30 - a.alcohol_past30)[0]; if (hiA) b.push(`Highest past-30-day alcohol use: ${hiA.district} at ${f1(hiA.alcohol_past30)}%.`);
      b.push("Source: 2025 PAYS district profile reports (PCCD). Line Mountain did not have a report in Drive and is not shown.");
      return b;
    },
  },
  {
    id: "ela_minutes", question: "Which districts have the lowest minutes of ELA instruction and what are their scores?", level: "Building · instruction", keywords: ["minutes", "ela", "instruction", "lowest", "scores"],
    title: "Daily ELA instructional minutes (K-5 buildings) and ELA results",
    sql: `SELECT building, district, ela_minutes, ela_prof, reading_on_track_pct, enrollment FROM v_buildings WHERE grade_low <= 2 AND ela_minutes IS NOT NULL ORDER BY ela_minutes ASC LIMIT 15`,
    chart: { type: "hbar", x: "building", y: ["ela_minutes"], unit: " min" },
    narrate: (rows) => {
      if (!rows.length) return ["No elementary buildings in scope."];
      const b: string[] = []; const t = top(rows);
      b.push(`Lowest scheduled ELA time: ${t.map((r) => `${r.building} (${r.district}, ${r.ela_minutes} min/day)`).join("; ")}.`);
      const withScores = rows.filter((r) => r.ela_prof !== null); if (withScores.length) { const lo = withScores.slice(0, Math.ceil(withScores.length / 2)), hi = withScores.slice(Math.ceil(withScores.length / 2)); const avg = (xs: any[]) => xs.reduce((s, r) => s + r.ela_prof, 0) / Math.max(1, xs.length); b.push(`Buildings in the lower half for minutes average ${f1(avg(lo))}% ELA proficient versus ${f1(avg(hi))}% in the upper half of this list.`); }
      b.push("Instructional minutes are synthetic schedule data (90-150 min/day); proficiency is real PDE 2024-25. Treat this as a prompt for a schedule review, not a finding.");
      return b;
    },
  },
  {
    id: "attendance_by_grade", question: "How does attendance compare across grade levels in my district?", level: "Grade · attendance", keywords: ["attendance", "grade levels", "grades", "compare", "my district", "by grade"], studentLevel: true,
    title: "Attendance by grade level this year to date",
    sql: `SELECT CASE grade WHEN 0 THEN 'K' ELSE CAST(grade AS TEXT) END AS grade_label, grade, COUNT(*) AS students, ROUND(AVG(absence_rate),1) AS avg_absence_rate,
        ROUND(100.0*SUM(CASE WHEN days_missed >= 0.1*${N_DAYS} THEN 1 ELSE 0 END)/COUNT(*),1) AS chronic_to_date_pct
      FROM v_students GROUP BY grade ORDER BY grade`,
    chart: { type: "bar", x: "grade_label", y: ["chronic_to_date_pct"], unit: "%" },
    narrate: (rows, scope) => {
      if (!rows.length) return ["No students in scope."];
      const worst = [...rows].sort((a, c) => c.chronic_to_date_pct - a.chronic_to_date_pct)[0]; const best = [...rows].sort((a, c) => a.chronic_to_date_pct - c.chronic_to_date_pct)[0];
      const b = rows.length === 1 ? [`Grade ${worst.grade_label}: ${f1(worst.chronic_to_date_pct)}% of ${worst.students} students are chronically absent to date (average absence rate ${f1(worst.avg_absence_rate)}%).`] : [`Chronic absence to date is highest in grade ${worst.grade_label} (${f1(worst.chronic_to_date_pct)}% of ${worst.students} students) and lowest in grade ${best.grade_label} (${f1(best.chronic_to_date_pct)}%).`];
      const hs = rows.filter((r) => r.grade >= 9), el = rows.filter((r) => r.grade <= 5); const avg = (xs: any[]) => xs.reduce((s, r) => s + r.chronic_to_date_pct, 0) / Math.max(1, xs.length);
      if (hs.length && el.length) b.push(`High school grades average ${f1(avg(hs))}% versus ${f1(avg(el))}% in K-5 — the usual pattern across the region.`);
      const g6 = rows.find((r) => r.grade === 6), g5 = rows.find((r) => r.grade === 5); if (g6 && g5 && g6.chronic_to_date_pct > g5.chronic_to_date_pct) b.push(`The step up from grade 5 (${f1(g5.chronic_to_date_pct)}%) to grade 6 (${f1(g6.chronic_to_date_pct)}%) points to the building transition; sixth graders new to the middle school are flagged more often.`);
      b.push(`Scope: ${scope.role === "teacher" ? "your rosters" : scope.districtName}. Student-level data is synthetic.`);
      return b;
    },
  },
  {
    id: "classrooms_flagged", question: "Which classrooms have the most students flagged for support?", level: "Classroom · early warning", keywords: ["classrooms", "flagged", "support", "most", "homeroom"], studentLevel: true,
    title: "Students flagged (moderate or high) by homeroom",
    sql: `SELECT building, classroom, grade, COUNT(*) AS students, SUM(CASE WHEN risk_level IN ('high','moderate') THEN 1 ELSE 0 END) AS flagged, ROUND(100.0*SUM(CASE WHEN risk_level IN ('high','moderate') THEN 1 ELSE 0 END)/COUNT(*),1) AS flagged_pct,
        SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) AS high_risk
      FROM v_students GROUP BY classroom_id ORDER BY flagged DESC, flagged_pct DESC LIMIT 15`,
    chart: { type: "hbar", x: "classroom", y: ["flagged"], unit: "" },
    narrate: (rows) => {
      if (!rows.length) return ["No classrooms in scope."];
      const t = rows[0]; const b = [`${t.classroom} at ${t.building} has the most flagged students: ${t.flagged} of ${t.students} (${f1(t.flagged_pct)}%), ${t.high_risk} at high risk.`];
      const g = rows.reduce<Record<string, number>>((m, r) => { m[r.grade] = (m[r.grade] ?? 0) + 1; return m; }, {}); const topG = Object.entries(g).sort((a, c) => c[1] - a[1])[0]; if (topG) b.push(`Grade ${topG[0] === "0" ? "K" : topG[0]} homerooms appear ${topG[1]} times in the top ${rows.length}.`);
      b.push("Suggested next step: the building MTSS team reviews the top homerooms together with their teachers; classroom-level strategies from similar classes are on the Teacher view.");
      return b;
    },
  },
  {
    id: "sap_reasons", question: "How many SAP referrals did each district make last year, and for what reasons?", level: "District · SAP", keywords: ["sap", "referrals", "reasons", "student assistance", "each district", "last year"],
    title: "SAP 2025-26 referrals by district and primary reason",
    sql: `SELECT district, aun, SUM(CASE WHEN category='total' THEN count END) AS total_cases,
        SUM(CASE WHEN category='primary_reason' AND item='internalizing_behaviors' THEN count END) AS internalizing,
        SUM(CASE WHEN category='primary_reason' AND item='externalizing_behaviors' THEN count END) AS externalizing,
        SUM(CASE WHEN category='primary_reason' AND item='attendance' THEN count END) AS attendance,
        SUM(CASE WHEN category='primary_reason' AND item='academic_concerns' THEN count END) AS academic,
        SUM(CASE WHEN category='primary_reason' AND item IN ('substance_use','policy_violation_substance') THEN count END) AS substance,
        SUM(CASE WHEN category='primary_reason' AND item='suicide_ideation_gesture_attempt' THEN count END) AS suicide_related
      FROM v_sap WHERE school_year='2025-26' GROUP BY district ORDER BY total_cases DESC`,
    chart: { type: "hbar", x: "district", y: ["total_cases"], unit: "" }, mapAunCol: "aun", mapValueCol: "total_cases", mapLabel: "SAP cases 2025-26", mapHigherIsBetter: false,
    narrate: (rows) => {
      if (!rows.length) return ["No SAP summaries in scope (Benton, Lewisburg, and Line Mountain had no report in Drive)."];
      const total = rows.reduce((s, r) => s + (r.total_cases ?? 0), 0); const b = [`${total.toLocaleString()} SAP cases across ${rows.length} district${rows.length === 1 ? "" : "s"} in 2025-26.`];
      const wr = rows.find((r) => r.district === "Warrior Run"); if (wr) b.push(`Warrior Run's ${wr.total_cases} are not comparable: ${wr.attendance} were attendance letters logged through SAP, with almost no parent permissions or action plans.`);
      const mc = rows.find((r) => r.district === "Mount Carmel Area"); if (mc) b.push(`Mount Carmel's ${mc.total_cases} include ${mc.academic} academic-concern referrals.`);
      const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0); b.push(`Across districts, internalizing behaviors (${sum("internalizing")}) and externalizing behaviors (${sum("externalizing")}) lead the reasons; ${sum("suicide_related")} referrals were suicide-related and ${sum("substance")} substance-related.`);
      b.push("Source: PDE SAP district summary reports in Drive, extracted and checked against each report's totals.");
      return b;
    },
  },
  {
    id: "grade6_absent", question: "Which students in grade 6 have missed 8 or more days?", level: "Student · attendance", keywords: ["students", "grade 6", "missed", "8 or more", "days", "sixth"], studentLevel: true,
    title: "Grade 6 students with 8+ days missed this year",
    sql: `SELECT student, building, classroom, days_missed, absence_rate, prior_year_absences, risk_level, math_grade, supports FROM v_students WHERE grade=6 AND days_missed >= 8 ORDER BY days_missed DESC, risk_score DESC`,
    chart: { type: "table" },
    narrate: (rows, scope) => {
      const b = [`${rows.length} sixth ${plural(rows.length, "grader has", "graders have")} missed 8 or more days ${scope.role === "teacher" ? "on your rosters" : `in ${scope.districtName}`} (about one day in five).`];
      const none = rows.filter((r) => !r.supports).length; b.push(`${none} of them have no active support yet; ${rows.length - none} are already in a support such as CICO, mentoring, or an attendance meeting.`);
      const worse = rows.filter((r) => r.days_missed > r.prior_year_absences * 0.3).length; b.push(`${worse} are well ahead of their own pace from last year — the pattern that preceded course failures by spring in prior years.`);
      b.push("Suggested next step: attendance team review before winter break; names are masked for district users and visible only to staff on each student's team.");
      return b;
    },
  },
  {
    id: "reading_on_track", question: "What share of students are on track on fall reading benchmarks by building?", level: "Building · screeners", keywords: ["on track", "reading", "benchmarks", "fall", "building", "share"],
    title: "Fall 2026 benchmark: percent on track or above, by building",
    sql: `SELECT building, district, level, reading_on_track_pct, math_on_track_pct, students FROM v_buildings WHERE grade_low <= 8 AND reading_on_track_pct IS NOT NULL ORDER BY reading_on_track_pct DESC`,
    chart: { type: "grouped", x: "building", y: ["reading_on_track_pct", "math_on_track_pct"], unit: "%", labels: { reading_on_track_pct: "Reading on track", math_on_track_pct: "Math on track" }, height: 320 },
    narrate: (rows) => {
      if (!rows.length) return ["No K-8 buildings in scope."];
      const b = rows.length === 1 ? [`${rows[0].building}: ${f1(rows[0].reading_on_track_pct)}% on track in reading and ${f1(rows[0].math_on_track_pct)}% in math on the fall benchmark.`] : [`${rows[0].building} (${rows[0].district}) has the highest share on track in reading at ${f1(rows[0].reading_on_track_pct)}%; ${rows[rows.length - 1].building} the lowest at ${f1(rows[rows.length - 1].reading_on_track_pct)}%.`];
      const avgR = rows.reduce((s, r) => s + r.reading_on_track_pct, 0) / rows.length, avgM = rows.reduce((s, r) => s + (r.math_on_track_pct ?? 0), 0) / rows.length; b.push(`Across these ${rows.length} buildings, ${f1(avgR)}% are on track in reading and ${f1(avgM)}% in math.`);
      b.push("Benchmark results are synthetic but calibrated to each building's real ELA/Math proficiency, so the ranking is a fair stand-in for a screener dashboard.");
      return b;
    },
  },
  {
    id: "new_math_curriculum", question: "Which districts adopted a new math curriculum since 2022 and how is math proficiency trending?", level: "District · curriculum", keywords: ["math", "curriculum", "adopted", "new", "since 2022", "trending"],
    title: "Math curriculum adoptions since 2022 and proficiency trend",
    sql: `SELECT a.district, a.aun, a.program, a.adoption_year, a.years_in_use, ('K-' || a.grade_high) AS grades,
        (SELECT value FROM v_district_trends t WHERE t.aun=a.aun AND t.measure='math_prof' AND t.school_year='2021-22') AS math_2021_22,
        (SELECT value FROM v_district_trends t WHERE t.aun=a.aun AND t.measure='math_prof' AND t.school_year='2024-25') AS math_2024_25,
        ROUND((SELECT value FROM v_district_trends t WHERE t.aun=a.aun AND t.measure='math_prof' AND t.school_year='2024-25') - (SELECT value FROM v_district_trends t WHERE t.aun=a.aun AND t.measure='math_prof' AND t.school_year='2021-22'),1) AS change_pts
      FROM v_adoptions a WHERE a.subject='math' AND a.category='curriculum' AND a.adoption_year >= 2022 AND a.grade_low=0 ORDER BY a.adoption_year, a.district`,
    chart: { type: "hbar", x: "district", y: ["change_pts"], unit: " pts" }, mapAunCol: "aun", mapValueCol: "change_pts", mapLabel: "Math change since 2021-22 (pts)", mapHigherIsBetter: true,
    narrate: (rows, scope) => {
      if (!rows.length) return [`${scope.districtName} has not adopted a new K-5 math curriculum since 2022 (per the illustrative adoption list).`];
      const b = [`${rows.length} district${rows.length === 1 ? "" : "s"} adopted a new K-5 math core since 2022: ${rows.map((r) => `${r.district} (${String(r.program).replace(/ \(.*\)/, "")}, ${r.adoption_year})`).join("; ")}.`];
      const up = rows.filter((r) => r.change_pts > 0); b.push(`${up.length} of ${rows.length} have higher math proficiency now than in 2021-22; adoptions this recent are still inside the usual 2-3 year implementation dip.`);
      const best = [...rows].sort((a, c) => c.change_pts - a.change_pts)[0]; b.push(`Largest gain: ${best.district} (+${f1(best.change_pts)} pts since 2021-22).`);
      b.push("Adoption years are illustrative; proficiency is real PDE data.");
      return b;
    },
  },
  {
    id: "wellness_by_building", question: "How do wellness screener results compare across buildings this fall?", level: "Building · wellness", keywords: ["wellness", "screener", "buildings", "fall", "compare", "aware", "anxiety"],
    title: "Fall 2026 universal wellness screen: percent in the high range, by building",
    sql: `SELECT building, district, level, wellness_high_pct, flagged_pct, students FROM v_buildings WHERE grade_high >= 3 AND wellness_high_pct IS NOT NULL ORDER BY wellness_high_pct DESC`,
    chart: { type: "hbar", x: "building", y: ["wellness_high_pct"], unit: "%", height: 420 },
    narrate: (rows) => {
      if (!rows.length) return ["No buildings in scope."];
      const b = [`${rows[0].building} (${rows[0].district}) has the largest share of students screening in the high range at ${f1(rows[0].wellness_high_pct)}%.`];
      const sec = rows.filter((r) => ["middle", "high", "secondary"].includes(r.level)), el = rows.filter((r) => !["middle", "high", "secondary"].includes(r.level)); const avg = (xs: any[]) => xs.reduce((s, r) => s + r.wellness_high_pct, 0) / Math.max(1, xs.length);
      if (sec.length && el.length) b.push(`Secondary buildings average ${f1(avg(sec))}% versus ${f1(avg(el))}% for elementary and intermediate buildings.`);
      b.push("Screens are synthetic Project AWARE-style data. Real PAYS 2025 results show the same regional pattern: 35.8% of CSIU 16 students in grades 6-12 reported depressive symptoms, above the state's 32.8%.");
      b.push("Suggested next step: Tier 2 coping-skills groups where the high-range share exceeds 10%, with CSIU behavioral health support.");
      return b;
    },
  },
  {
    id: "early_start", question: "Which supports started within two weeks of a flag, and did that matter?", level: "Intervention · timing", keywords: ["two weeks", "early", "start", "flag", "matter", "timing", "supports"],
    title: "Early start (within 14 days of the flag) vs. later start, by support",
    sql: `SELECT program, domain, SUM(students) AS students, ROUND(SUM(improved_pct*students)/SUM(students),0) AS improved_pct,
        ROUND(SUM(improved_pct_early_start*students)/SUM(students),0) AS improved_pct_early_start, ROUND(SUM(improved_pct_late_start*students)/SUM(students),0) AS improved_pct_late_start,
        ROUND(SUM(similar_untreated_pct*students)/SUM(students),0) AS similar_untreated_pct
      FROM v_support_results GROUP BY program, domain HAVING SUM(students) >= 20 ORDER BY (improved_pct_early_start - improved_pct_late_start) DESC`,
    chart: { type: "grouped", x: "program", y: ["improved_pct_early_start", "improved_pct_late_start", "similar_untreated_pct"], unit: "%", labels: { improved_pct_early_start: "Started within 2 weeks", improved_pct_late_start: "Started later", similar_untreated_pct: "Similar students, no support" }, height: 320 },
    narrate: (rows) => {
      if (!rows.length) return ["No completed supports in scope."];
      const b: string[] = []; const t = rows[0];
      b.push(`Timing matters most for ${t.program}: ${t.improved_pct_early_start}% improved when started within two weeks versus ${t.improved_pct_late_start}% when started later.`);
      const gaps = rows.filter((r) => r.improved_pct_early_start - r.improved_pct_late_start >= 8); b.push(`${gaps.length} of ${rows.length} supports show an early-start advantage of 8 points or more; across all supports the gap averages ${f1(rows.reduce((s, r) => s + (r.improved_pct_early_start - r.improved_pct_late_start), 0) / rows.length)} points.`);
      b.push("Suggested next step: set a two-week start target for new referrals and track it on the district Interventions tab.");
      b.push("Based on 2025-26 completed episodes (synthetic implementation data); the comparison group is students with the same baseline and no support in that domain.");
      return b;
    },
  },
  {
    id: "swd_attendance", question: "How do students with disabilities attend compared with all students, by district?", level: "District · subgroups", keywords: ["disabilities", "swd", "attend", "attendance", "all students", "subgroup", "iep"],
    title: "Regular attendance 2024-25: students with disabilities vs. all students",
    sql: `SELECT district, aun, MAX(CASE WHEN subgroup='all' THEN value END) AS all_students, MAX(CASE WHEN subgroup='swd' THEN value END) AS students_with_disabilities,
        ROUND(MAX(CASE WHEN subgroup='swd' THEN value END) - MAX(CASE WHEN subgroup='all' THEN value END),1) AS gap_pts
      FROM v_district_subgroups WHERE measure='regular_attendance' AND school_year='2024-25' GROUP BY district ORDER BY gap_pts`,
    chart: { type: "grouped", x: "district", y: ["all_students", "students_with_disabilities"], unit: "%", labels: { all_students: "All students", students_with_disabilities: "Students with disabilities" }, height: 300 }, mapAunCol: "aun", mapValueCol: "gap_pts", mapLabel: "SwD attendance gap (pts)", mapHigherIsBetter: true,
    narrate: (rows, scope) => {
      if (!rows.length) return ["No subgroup data in scope."];
      const b = [`Students with disabilities attend regularly less often in ${rows.filter((r) => r.gap_pts < 0).length} of ${rows.length} district${rows.length === 1 ? "" : "s"}; the widest gap is ${rows[0].district} (${f1(rows[0].gap_pts)} pts).`];
      const o = own(rows, scope); if (o) b.push(`${o.district}: ${f1(o.students_with_disabilities)}% of students with disabilities attend regularly versus ${f1(o.all_students)}% of all students.`);
      b.push("Seven of the region's 13 TSI/ATSI-designated schools carry the students-with-disabilities subgroup, and the designated subgroup attends below its own school in 14 of 16 designations.");
      b.push("Real PDE Future Ready data, enrollment-weighted across buildings; subgroups are reported only when 20 or more students.");
      return b;
    },
  },
  {
    id: "tsi_attendance", question: "Which buildings are designated TSI/ATSI and how is their attendance trending?", level: "Building · designations", keywords: ["tsi", "atsi", "designated", "designation", "improvement", "attendance", "trending"],
    title: "School improvement designations (2026-27) and regular attendance trend",
    sql: `SELECT b.building, b.district, b.designation, b.regular_attendance AS regular_attendance_2024_25,
        (SELECT value FROM v_building_subgroups s WHERE s.building_id=b.building_id AND s.measure='regular_attendance' AND s.subgroup='all' AND s.school_year='2021-22') AS regular_attendance_2021_22,
        ROUND(b.regular_attendance - (SELECT value FROM v_building_subgroups s WHERE s.building_id=b.building_id AND s.measure='regular_attendance' AND s.subgroup='all' AND s.school_year='2021-22'),1) AS change_pts,
        (SELECT value FROM v_building_subgroups s WHERE s.building_id=b.building_id AND s.measure='regular_attendance' AND s.subgroup='swd' AND s.school_year='2024-25') AS swd_2024_25
      FROM v_buildings b WHERE b.designation IS NOT NULL ORDER BY b.regular_attendance`,
    chart: { type: "grouped", x: "building", y: ["regular_attendance_2021_22", "regular_attendance_2024_25"], unit: "%", labels: { regular_attendance_2021_22: "2021-22", regular_attendance_2024_25: "2024-25" }, height: 300 },
    narrate: (rows, scope) => {
      if (!rows.length) return [`No TSI/ATSI-designated buildings in ${scope.role === "csiu" ? "the region" : scope.districtName}.`];
      const b = [`${rows.length} designated building${rows.length === 1 ? "" : "s"} in scope; ${rows.filter((r) => r.regular_attendance_2024_25 < 79.6).length} attend below the 2024-25 state average of 79.6%.`];
      b.push(`${rows[0].building} (${rows[0].district}) has the lowest regular attendance at ${f1(rows[0].regular_attendance_2024_25)}%${rows[0].swd_2024_25 ? `, and ${f1(rows[0].swd_2024_25)}% for students with disabilities` : ""}.`);
      const down = rows.filter((r) => r.change_pts < 0); b.push(`${down.length} of ${rows.length} have lower regular attendance than in 2021-22.`);
      b.push("Designations from PDE's 2026-27 list; attendance from the Future Ready PA Index.");
      return b;
    },
  },
  {
    id: "referral_times", question: "What are the most common behavior referral times and locations in my district?", level: "Classroom · behavior", keywords: ["referral", "times", "locations", "behavior", "common", "when", "where", "lunch"], studentLevel: true,
    title: "Behavior referrals by time of day, with the most common location",
    sql: `SELECT time_of_day, COUNT(*) AS referrals, ROUND(100.0*COUNT(*)/(SELECT COUNT(*) FROM v_referrals),1) AS share_pct,
        (SELECT location FROM v_referrals r2 WHERE r2.time_of_day=r.time_of_day GROUP BY location ORDER BY COUNT(*) DESC LIMIT 1) AS top_location,
        (SELECT category FROM v_referrals r3 WHERE r3.time_of_day=r.time_of_day GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1) AS top_category
      FROM v_referrals r GROUP BY time_of_day ORDER BY referrals DESC`,
    chart: { type: "bar", x: "time_of_day", y: ["referrals"], unit: "" },
    narrate: (rows, scope) => {
      if (!rows.length) return ["No referrals in scope this year."];
      const t = rows[0]; const b = [`${t.share_pct}% of referrals ${scope.role === "teacher" ? "on your rosters" : `in ${scope.districtName}`} happen ${t.time_of_day === "after lunch" ? "right after lunch" : `in the ${t.time_of_day}`}, most often in the ${t.top_location} (${t.top_category}).`];
      const al = rows.find((r) => r.time_of_day === "after lunch"); if (al && al !== t) b.push(`After-lunch transitions account for ${al.share_pct}% (${al.referrals} referrals).`);
      b.push("Suggested next step: a predictable 3-minute re-entry routine after lunch has reduced referrals in similar buildings; CSIU PBIS coaches can model it.");
      return b;
    },
  },
  {
    id: "checkins_falling", question: "Which grade levels have the most students with falling check-in scores?", level: "Grade · wellness", keywords: ["check-in", "checkin", "falling", "dropping", "grade levels", "wellness", "scores"], studentLevel: true,
    title: "Students with three straight weeks of lower wellness check-in scores, by grade",
    sql: `WITH last3 AS (SELECT student_id, grade, score, ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY date DESC) AS rn FROM v_checkins),
      declining AS (SELECT a.student_id, a.grade FROM last3 a JOIN last3 b ON b.student_id=a.student_id AND b.rn=2 JOIN last3 c ON c.student_id=a.student_id AND c.rn=3 WHERE a.rn=1 AND a.score < b.score AND b.score < c.score),
      totals AS (SELECT grade, COUNT(DISTINCT student_id) AS students FROM v_checkins GROUP BY grade)
      SELECT t.grade, t.students, COUNT(d.student_id) AS declining, ROUND(100.0*COUNT(d.student_id)/t.students,1) AS declining_pct FROM totals t LEFT JOIN declining d ON d.grade=t.grade GROUP BY t.grade ORDER BY t.grade`,
    chart: { type: "bar", x: "grade", y: ["declining_pct"], unit: "%" },
    narrate: (rows) => {
      if (!rows.length) return ["No check-in data in scope (grades 3-12 only)."];
      const worst = [...rows].sort((a, c) => c.declining_pct - a.declining_pct)[0]; const total = rows.reduce((s, r) => s + r.declining, 0);
      const b = [`${total} students have had three straight weeks of lower check-in scores; the share is highest in grade ${worst.grade} (${f1(worst.declining_pct)}% of ${worst.students}).`];
      b.push("Three consecutive drops is the trigger used on the Teacher view's \"check in with these students this week\" list.");
      b.push("Suggested next step: counselors review the list weekly; students who also have rising absences or nurse visits are routed to the wellness team.");
      return b;
    },
  },
];

const STOP = new Set(["the", "a", "an", "of", "in", "on", "and", "or", "to", "for", "is", "are", "what", "which", "how", "do", "does", "me", "my", "our", "with", "by", "this", "that", "show", "list", "have", "has", "across", "their", "year", "s"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\- ]+/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));

/** Best library match for a free-text question, or null if nothing is close enough. */
export function matchLibrary(question: string, scope: Scope): { entry: LibraryEntry; score: number } | null {
  const q = question.trim().toLowerCase().replace(/[?.]+$/, "");
  const qt = new Set(tokens(q));
  let best: { entry: LibraryEntry; score: number } | null = null;
  for (const e of LIBRARY) {
    if (e.studentLevel && scope.role === "board") continue;
    if (e.question.toLowerCase().replace(/[?.]+$/, "") === q) return { entry: e, score: 1 };
    const kw = e.keywords.map((k) => k.toLowerCase());
    let hits = 0; for (const k of kw) { const parts = tokens(k); if (parts.length && parts.every((p) => qt.has(p))) hits++; }
    const et = new Set(tokens(e.question)); let overlap = 0; for (const t of qt) if (et.has(t)) overlap++;
    const score = hits / kw.length * 0.7 + (qt.size ? overlap / qt.size : 0) * 0.3;
    if (!best || score > best.score) best = { entry: e, score };
  }
  return best && best.score >= 0.45 ? best : null;
}

export function libraryForScope(scope: Scope) { return LIBRARY.filter((e) => !(e.studentLevel && scope.role === "board")).map((e) => ({ id: e.id, question: e.question, level: e.level })); }
