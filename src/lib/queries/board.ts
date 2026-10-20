import "server-only";
import { all, one } from "../db";
import type { Scope } from "../scope";
import { insights, supportResults, N_DAYS } from "./district";

/** Board view: aggregates only. No function here accepts or returns a student identifier. */
export function boardSummary(scope: Scope) {
  const n = N_DAYS();
  const aun = scope.aun;
  const att = one<{ regular: number; students: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN COALESCE(a.n,0) < 0.1*${n} THEN 1 ELSE 0 END)/COUNT(*),0) regular, COUNT(*) students FROM students s LEFT JOIN (SELECT student_id, COUNT(*) n FROM attendance_daily WHERE status LIKE 'absent%' GROUP BY student_id) a ON a.student_id=s.id WHERE s.aun=?`, aun)!;
  const attLast = one<{ regular: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN prior_year_absences < 18 THEN 1 ELSE 0 END)/COUNT(*),0) regular FROM students WHERE aun=?`, aun)!;
  const safe = one<{ pct: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN w.safety >= 6 AND w.connectedness >= 5 THEN 1 ELSE 0 END)/COUNT(*),0) pct FROM wellness_screens w JOIN students s ON s.id=w.student_id WHERE s.aun=? AND w.school_year='2026-27' AND w.window='fall'`, aun)!;
  const safeLast = one<{ pct: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN w.safety >= 6 AND w.connectedness >= 5 THEN 1 ELSE 0 END)/COUNT(*),0) pct FROM wellness_screens w JOIN students s ON s.id=w.student_id WHERE s.aun=? AND w.school_year='2025-26' AND w.window='fall'`, aun)!;
  const onTrack = one<{ pct: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),0) pct FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE s.aun=? AND sr.school_year='2026-27' AND sr.window='fall'`, aun)!;
  const onTrackLast = one<{ pct: number }>(`SELECT ROUND(100.0*SUM(CASE WHEN sr.benchmark IN ('on_track','above') THEN 1 ELSE 0 END)/COUNT(*),0) pct FROM screener_results sr JOIN students s ON s.id=sr.student_id WHERE s.aun=? AND sr.school_year='2025-26' AND sr.window='fall'`, aun)!;
  const refs = one<{ n: number }>(`SELECT COUNT(*) n FROM behavior_referrals r JOIN students s ON s.id=r.student_id WHERE s.aun=?`, aun)!.n;
  const refsLast = one<{ n: number }>(`SELECT ROUND(SUM(o.pre_value) * ${n} / 20.0) n FROM student_outcomes o JOIN students s ON s.id=o.student_id WHERE s.aun=? AND o.domain='behavior'`, aun)!.n;
  const paysSafe = one<{ value: number; state_value: number | null }>("SELECT value, state_value FROM pays_results WHERE aun=? AND school_year='2025-26' AND indicator='feel_safe_at_school' AND grade='all'", aun);
  const real = one<{ ela: number | null; math: number | null; regular: number | null; grad: number | null }>(`SELECT
      (SELECT value FROM district_measures WHERE aun=? AND measure='ela_prof' AND subgroup='all' AND school_year='2024-25') ela,
      (SELECT value FROM district_measures WHERE aun=? AND measure='math_prof' AND subgroup='all' AND school_year='2024-25') math,
      (SELECT value FROM district_measures WHERE aun=? AND measure='regular_attendance' AND subgroup='all' AND school_year='2024-25') regular,
      (SELECT value FROM district_measures WHERE aun=? AND measure='grad_4yr' AND subgroup='all' AND school_year='2024-25') grad`, aun, aun, aun, aun)!;
  const refChange = refsLast ? Math.round(100 * (refs - refsLast) / refsLast) : 0;
  return {
    attending: att.regular, attendingLast: attLast.regular, safe: safe.pct, safeLast: safeLast.pct, onTrack: onTrack.pct, onTrackLast: onTrackLast.pct,
    refs, refsLast, refChange, paysSafe: paysSafe?.value ?? null, paysSafeState: paysSafe?.state_value ?? null, real, students: att.students,
    statuses: { attending: att.regular >= 85 ? "On track" : "Needs attention", safe: safe.pct >= 75 ? "On track" : "Needs attention", learning: onTrack.pct >= 60 ? "On track" : "Needs attention", behavior: refChange <= 0 ? "On track" : "Needs attention" },
  };
}

export function boardActions(scope: Scope) {
  return insights(scope).map((i) => ({ domain: i.domain, headline: i.domain === "attendance" ? i.title.replace(/absences are rising.*$/i, "attendance focus") : i.domain === "wellness" ? `More wellness support at ${i.title.split(" at ").pop()}` : i.domain === "interventions" ? `Faster start for ${i.title.split(" is ")[0]}` : i.domain === "academics" ? "Math reteach groups" : "Calmer transitions after lunch", detail: i.nextStep + (i.service ? ` With ${i.service.replace("CSIU ", "CSIU ")}.` : "") }));
}

export function boardInvestments(scope: Scope) {
  return supportResults(scope, 15).filter((r) => (r.similar_untreated_pct ?? 0) < r.improved_pct).sort((a, b) => (b.improved_pct - (b.similar_untreated_pct ?? 0)) - (a.improved_pct - (a.similar_untreated_pct ?? 0))).slice(0, 3);
}

export function boardMeetingLabel() {
  const d = new Date("2026-11-10T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) + " meeting";
}

export function districtsForBoard() { return all<{ aun: number; name: string }>("SELECT aun, name FROM districts ORDER BY name"); }
