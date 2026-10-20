// SYNTHETIC generator for everything below the building level: staff, classrooms, students, attendance,
// grades, screeners, progress monitoring, behavior, nurse visits, wellness, interventions, outcomes.
// Deterministic for a given seed. Student data is calibrated so that building-level aggregates stay
// consistent with the real PDE measures (chronic absence, proficiency), but no row describes a real person.
import type Database from "better-sqlite3";
import { Rng, clamp, round, sigmoid, logit } from "./rng";
import { DISTRICTS, FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, PRACTICES, SCREENER_TOOLS, CURRENT_YEAR, PRIOR_YEAR, TODAY, FIRST_DAY } from "./catalog";
import type { BuildingInfo } from "./real";

// ------------------------------------------------------------------ calendar
function schoolDays(from: string, to: string, holidays: Set<string>): string[] {
  const out: string[] = [];
  const d = new Date(from + "T12:00:00Z"); const end = new Date(to + "T12:00:00Z");
  while (d <= end) {
    const dow = d.getUTCDay(); const iso = d.toISOString().slice(0, 10);
    if (dow >= 1 && dow <= 5 && !holidays.has(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const HOLIDAYS = new Set(["2026-09-07", "2026-10-12"]);
export const CURRENT_DAYS = schoolDays(FIRST_DAY, TODAY, HOLIDAYS);          // ~40 days
const PRIOR_DAYS_TOTAL = 180;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

// Acklam's inverse normal approximation (enough precision for calibration).
function probit(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425, ph = 1 - pl;
  let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > ph) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const normCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x: number) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

const letterFor = (pct: number) => pct >= 97 ? "A+" : pct >= 93 ? "A" : pct >= 90 ? "A-" : pct >= 87 ? "B+" : pct >= 83 ? "B" : pct >= 80 ? "B-" : pct >= 77 ? "C+" : pct >= 73 ? "C" : pct >= 70 ? "C-" : pct >= 67 ? "D+" : pct >= 63 ? "D" : pct >= 60 ? "D-" : "F";
const benchFor = (pctile: number) => pctile >= 80 ? "above" : pctile >= 40 ? "on_track" : pctile >= 20 ? "approaching" : "below";

// Program effects: probability a treated student "improves" on the domain outcome. Untreated base is 0.36.
const EFFECT: Record<string, number> = {
  cico: 0.61, school_counseling: 0.58, sap: 0.48, mentoring: 0.53, attendance_meeting: 0.57, attendance_team: 0.46,
  reading_intervention: 0.55, wilson: 0.56, math_reteach: 0.49, tutoring: 0.6, coping_group: 0.52, outpatient: 0.5,
  home_visit: 0.5, morning_checkin: 0.5, credit_recovery: 0.45, behavior_plan: 0.5, transportation: 0.54,
};
const UNTREATED_IMPROVE = 0.36;

interface Student {
  id: number; aun: number; buildingId: number; classroomId: number; grade: number; gender: string; race: string;
  econ: number; iep: number; el: number; gifted: number; s504: number; newToBuilding: number; enrolledSince: string;
  zA: number; zAtt: number; zB: number; zW: number;            // latents: academic(+good), attendance(+bad), behavior(+bad), wellness(+bad)
  traj: "none" | "rising_absence" | "grade_drop" | "wellness_decline" | "behavior_spike" | "improving";
  mondayPattern: boolean; afterLunchPattern: boolean;
  // prior-year generated state
  priorAbsFall: number; priorAbsSpring: number; priorRefFall: number; priorRefSpring: number;
  readFall: number; readSpring: number; mathFall: number; mathSpring: number;  // percentiles
  wellFall: number; wellSpring: number;  // 0..10 composite (higher = more concern)
  priorFinal: Record<string, number>;
  // current year
  curAbsRate: number; curRefs: number; curGrades: Record<string, [number, number]>; readCur: number; mathCur: number; wellCur: number;
}

export interface SynthStats { students: number; staff: number; interventions: number }

export function generate(db: Database.Database, buildings: BuildingInfo[], seed: string): SynthStats {
  const rng = new Rng(seed);
  const districtByAun = new Map(DISTRICTS.map((d) => [d.aun, d]));
  const districtMeasure = db.prepare("SELECT value FROM district_measures WHERE aun=? AND measure=? AND subgroup='all' ORDER BY school_year DESC LIMIT 1");

  const ins = {
    staff: db.prepare("INSERT INTO staff(id,aun,building_id,first_name,last_name,role,email) VALUES (?,?,?,?,?,?,?)"),
    classroom: db.prepare("INSERT INTO classrooms(id,building_id,school_year,grade,section,name,teacher_id) VALUES (?,?,?,?,?,?,?)"),
    student: db.prepare(`INSERT INTO students(id,state_id,aun,building_id,classroom_id,first_name,last_name,grade,gender,race,econ_disadvantaged,iep,el,gifted,section504,enrolled_since,new_to_building,prior_year_absences,prior_year2_absences,prior_year3_absences,latent_academic,latent_attendance,latent_behavior,latent_wellness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    att: db.prepare("INSERT INTO attendance_daily(student_id,date,status) VALUES (?,?,?)"),
    bam: db.prepare("INSERT INTO building_attendance_monthly(building_id,school_year,month,days,enrolled,absence_rate,chronic_pct_to_date) VALUES (?,?,?,?,?,?,?)"),
    grade: db.prepare("INSERT INTO course_grades(student_id,school_year,term,subject,letter,percent) VALUES (?,?,?,?,?,?)"),
    scr: db.prepare("INSERT INTO screener_results(student_id,tool,subject,school_year,window,measure,score,percentile,benchmark,date) VALUES (?,?,?,?,?,?,?,?,?,?)"),
    pm: db.prepare("INSERT INTO progress_monitoring(student_id,subject,date,measure,score,goal) VALUES (?,?,?,?,?,?)"),
    ref: db.prepare("INSERT INTO behavior_referrals(student_id,date,category,location,time_of_day,action,minor) VALUES (?,?,?,?,?,?,?)"),
    nurse: db.prepare("INSERT OR IGNORE INTO nurse_visits(student_id,date,reason) VALUES (?,?,?)"),
    well: db.prepare("INSERT INTO wellness_screens(student_id,school_year,window,anxiety,depression,connectedness,safety,risk_level,date) VALUES (?,?,?,?,?,?,?,?,?)"),
    checkin: db.prepare("INSERT INTO wellness_checkins(student_id,date,score) VALUES (?,?,?)"),
    interv: db.prepare(`INSERT INTO interventions(student_id,program_id,domain,tier,start_date,end_date,status,referral_reason,days_from_flag_to_start,sessions_planned,sessions_delivered,fidelity,funding,provider,outcome_measure,pre_value,post_value,improved,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    outcome: db.prepare("INSERT INTO student_outcomes(student_id,domain,measure,pre_value,post_value,improved) VALUES (?,?,?,?,?,?)"),
    minutes: db.prepare("INSERT INTO instruction_minutes(building_id,subject,grade_band,minutes_per_day) VALUES (?,?,?,?)"),
    staffing: db.prepare("INSERT INTO staffing(building_id,school_year,teachers,counselors,social_workers,psychologists,nurses,paraprofessionals,student_teacher_ratio) VALUES (?,?,?,?,?,?,?,?,?)"),
    contact: db.prepare("INSERT INTO student_contacts(student_id,date,kind,title,detail) VALUES (?,?,?,?,?)"),
    plan: db.prepare("INSERT INTO support_plans(student_id,support_level,case_lead_staff_id,next_meeting) VALUES (?,?,?,?)"),
  };

  let staffId = 1000, classroomId = 1, studentId = 10000, stateSeq = 0;
  const stats: SynthStats = { students: 0, staff: 0, interventions: 0 };
  const counselorsByBuilding = new Map<number, number>();
  const bam: Record<string, { days: number; enrolled: number; abs: number; chronic: number }> = {};

  const districtAdoptions = (aun: number) => new Set((db.prepare("SELECT program_id FROM program_adoptions WHERE aun=?").all(aun) as { program_id: string }[]).map((r) => r.program_id));

  for (const b of buildings) {
    const dist = districtByAun.get(b.aun)!;
    const adopted = districtAdoptions(b.aun);
    const tools = SCREENER_TOOLS[dist.name];
    // ---- calibration from real measures
    const regAtt = b.measures.regular_attendance ?? (districtMeasure.get(b.aun, "regular_attendance") as any)?.value ?? 80;
    const chronic = clamp((100 - regAtt) / 100, 0.04, 0.6);
    const attShift = 0.62 - probit(1 - chronic);                      // see notes: P(z > 0.52) == chronic
    const elaProf = b.measures.ela_prof ?? (districtMeasure.get(b.aun, "ela_prof") as any)?.value ?? 50;
    const acadShift = (elaProf - 50) / 28;
    const mathProf = b.measures.math_prof ?? (districtMeasure.get(b.aun, "math_prof") as any)?.value ?? 40;
    const mathShift = (mathProf - 42) / 28;
    const bRng = new Rng(`${seed}:b:${b.id}`);
    const afterLunchBuilding = b.level === "middle" || (b.level === "secondary") || bRng.chance(0.25);
    const transitionGrade = b.gradeLow > 0 ? b.gradeLow : -1;         // first grade in a new building

    // ---- staffing & instruction minutes
    const nTeachers = Math.max(6, Math.round(b.enrollment / (b.level === "high" ? 14 : 16)));
    const nCounselors = Math.max(1, Math.round(b.enrollment / 350));
    ins.staffing.run(b.id, CURRENT_YEAR, nTeachers, nCounselors, b.enrollment > 500 ? 1 : 0.5, 0.5, 1, Math.round(nTeachers * 0.35), round(b.enrollment / nTeachers, 1));
    ins.staffing.run(b.id, PRIOR_YEAR, nTeachers - 1, nCounselors, b.enrollment > 500 ? 1 : 0.5, 0.5, 1, Math.round(nTeachers * 0.33), round(b.enrollment / (nTeachers - 1), 1));
    const elaMin = bRng.int(90, 150), mathMin = bRng.int(60, 90);
    if (b.gradeLow <= 5) { ins.minutes.run(b.id, "ela", "K-5", elaMin); ins.minutes.run(b.id, "math", "K-5", mathMin); ins.minutes.run(b.id, "science", "K-5", bRng.int(25, 45)); }
    if (b.gradeHigh >= 6) { ins.minutes.run(b.id, "ela", "6-12", bRng.int(42, 90)); ins.minutes.run(b.id, "math", "6-12", bRng.int(42, 85)); ins.minutes.run(b.id, "science", "6-12", bRng.int(42, 60)); }

    const principal = ++staffId; ins.staff.run(principal, b.aun, b.id, bRng.pick(FIRST_NAMES_F.concat(FIRST_NAMES_M)), bRng.pick(LAST_NAMES), "principal", null); stats.staff++;
    const counselor = ++staffId; const cLast = bRng.pick(LAST_NAMES); ins.staff.run(counselor, b.aun, b.id, bRng.pick(FIRST_NAMES_F.concat(FIRST_NAMES_M)), cLast, "counselor", null); stats.staff++;
    counselorsByBuilding.set(b.id, counselor);
    const nurse = ++staffId; ins.staff.run(nurse, b.aun, b.id, bRng.pick(FIRST_NAMES_F), bRng.pick(LAST_NAMES), "nurse", null); stats.staff++;

    // ---- classrooms and students
    const grades: number[] = []; for (let g = b.gradeLow; g <= b.gradeHigh; g++) grades.push(g);
    const perGrade = b.enrollment / grades.length;
    const students: Student[] = [];
    for (const g of grades) {
      const n = Math.max(8, Math.round(perGrade * bRng.normal(1, 0.08)));
      const sectionSize = g <= 5 ? 22 : 26;
      const nSections = Math.max(1, Math.round(n / sectionSize));
      const rooms: number[] = [];
      for (let s = 0; s < nSections; s++) {
        const tid = ++staffId; const tLast = bRng.pick(LAST_NAMES); const tFirst = bRng.pick(FIRST_NAMES_F.concat(FIRST_NAMES_M));
        ins.staff.run(tid, b.aun, b.id, tFirst, tLast, "teacher", `${tFirst[0].toLowerCase()}${tLast.toLowerCase()}@example.org`); stats.staff++;
        const cid = classroomId++; const label = `${g === 0 ? "K" : g}${String.fromCharCode(65 + s)}`;
        ins.classroom.run(cid, b.id, CURRENT_YEAR, g, label, `Homeroom ${label}`, tid); rooms.push(cid);
      }
      for (let i = 0; i < n; i++) {
        const sr = bRng;
        const gender = sr.chance(0.51) ? "M" : "F";
        const race = sr.weighted<[string, number][]>([["White", b.white], ["Hispanic", b.hispanic], ["Black", b.black], ["Two or more", Math.max(1, 100 - b.white - b.hispanic - b.black - 1)], ["Asian", 1]] as any) as unknown as string;
        const econ = sr.chance(b.econ / 100) ? 1 : 0; const iep = sr.chance(b.sped / 100) ? 1 : 0; const el = sr.chance(b.el / 100) ? 1 : 0;
        const gifted = !iep && sr.chance(0.04) ? 1 : 0; const s504 = !iep && sr.chance(0.04) ? 1 : 0;
        const zA = sr.normal(acadShift - 0.25 * econ - 0.7 * iep - 0.4 * el + 0.9 * gifted, 0.9);
        const zAtt = sr.normal(attShift + 0.25 * econ + 0.15 * iep - 0.15 * zA, 0.95);
        const zB = sr.normal(0.2 * econ + 0.25 * (gender === "M" ? 1 : 0) + 0.2 * iep - 0.2 * zA + (g >= 6 && g <= 9 ? 0.15 : 0), 0.95);
        const zW = sr.normal(0.3 * zAtt + 0.15 * (gender === "F" ? 1 : 0) + (g >= 7 ? 0.2 : 0) - 0.1 * zA, 0.95);
        const newToBuilding = g === transitionGrade || sr.chance(0.06) ? 1 : 0;
        let traj: Student["traj"] = "none";
        const t = sr.float();
        const risingBoost = g === transitionGrade ? 0.07 : 0;
        if (t < 0.06 + risingBoost) traj = "rising_absence"; else if (t < 0.11 + risingBoost) traj = "grade_drop"; else if (t < 0.15 + risingBoost && g >= 3) traj = "wellness_decline"; else if (t < 0.18 + risingBoost) traj = "behavior_spike"; else if (t < 0.24 + risingBoost) traj = "improving";
        students.push({
          id: studentId++, aun: b.aun, buildingId: b.id, classroomId: rooms[i % rooms.length], grade: g, gender, race, econ, iep, el, gifted, s504, newToBuilding,
          enrolledSince: newToBuilding && sr.chance(0.3) ? "2026-08-25" : `${2026 - Math.min(g + 1, sr.int(1, 8))}-08-25`,
          zA, zAtt, zB, zW, traj, mondayPattern: sr.chance(0.25), afterLunchPattern: afterLunchBuilding && sr.chance(0.5),
          priorAbsFall: 0, priorAbsSpring: 0, priorRefFall: 0, priorRefSpring: 0, readFall: 50, readSpring: 50, mathFall: 50, mathSpring: 50, wellFall: 3, wellSpring: 3,
          priorFinal: {}, curAbsRate: 0, curRefs: 0, curGrades: {}, readCur: 50, mathCur: 50, wellCur: 3,
        });
      }
    }

    // ---- prior year (2025-26): baseline halves, then interventions, then post state
    const subjects = b.gradeHigh >= 6 && b.gradeLow >= 6 ? ["ELA", "Math", "Science", "Social Studies", "Elective"] : ["ELA", "Math", "Science", "Social Studies"];
    for (const s of students) {
      const absRate = sigmoid(logit(0.05) + 0.85 * s.zAtt);
      s.priorAbsFall = Math.round(absRate * 90 * bRng.normal(1, 0.25));
      s.priorAbsSpring = Math.round(absRate * 90 * bRng.normal(1.05, 0.25));
      const lam = (b.gradeLow <= 2 ? 0.18 : 0.3) * Math.exp(1.1 * s.zB);
      s.priorRefFall = poisson(bRng, lam * 0.5); s.priorRefSpring = poisson(bRng, lam * 0.5);
      s.readFall = clamp(100 * normCdf(s.zA + bRng.normal(0, 0.3)), 1, 99);
      s.readSpring = clamp(100 * normCdf(s.zA + 0.05 + bRng.normal(0, 0.3)), 1, 99);
      s.mathFall = clamp(100 * normCdf(s.zA + (mathShift - acadShift) + bRng.normal(0, 0.3)), 1, 99);
      s.mathSpring = clamp(100 * normCdf(s.zA + (mathShift - acadShift) + 0.05 + bRng.normal(0, 0.3)), 1, 99);
      s.wellFall = clamp(3.5 + 1.6 * s.zW + bRng.normal(0, 0.8), 0, 10);
      s.wellSpring = clamp(3.5 + 1.6 * s.zW + bRng.normal(0, 0.8), 0, 10);
    }

    // interventions in the prior year
    const availablePrograms = (domain: string): string[] => {
      const map: Record<string, string[]> = {
        attendance: ["attendance_meeting", "attendance_team", "morning_checkin", "home_visit", "transportation", "mentoring"],
        behavior: ["cico", "mentoring", "behavior_plan", "restorative"],
        academic: ["reading_intervention", "math_reteach", "tutoring", "wilson", "credit_recovery"],
        wellness: ["school_counseling", "coping_group", "sap", "outpatient", "mentoring"],
      };
      return map[domain].filter((p) => ["attendance_meeting", "attendance_team", "morning_checkin", "home_visit", "transportation", "mentoring", "behavior_plan", "coping_group", "sap", "outpatient", "wilson", "tutoring", "credit_recovery", "reading_intervention", "math_reteach"].includes(p) || adopted.has(p));
    };
    const providerFor = (p: string) => p === "school_counseling" ? "CSIU behavioral health clinician" : p === "sap" ? "SAP team / CSIU liaison" : p === "outpatient" ? "Community provider" : p === "home_visit" || p === "transportation" ? "School social worker" : p === "attendance_meeting" || p === "attendance_team" ? "Attendance team" : p === "cico" || p === "mentoring" || p === "morning_checkin" ? "School staff mentor" : p === "coping_group" ? "School counselor" : "Classroom / intervention teacher";
    const fundingFor = (p: string) => p === "school_counseling" || p === "coping_group" ? "Project AWARE" : p === "reading_intervention" || p === "tutoring" || p === "wilson" ? "Title I" : p === "sap" ? "District / county" : "District";

    const priorEpisodes: { s: Student; domain: string; program: string; improved: boolean; early: boolean; fidelity: number; start: string; pre: number; post: number; measure: string }[] = [];
    for (const s of students) {
      const cand: { domain: string; measure: string; pre: number }[] = [];
      if (s.priorAbsFall >= 7) cand.push({ domain: "attendance", measure: "absence_rate", pre: round(100 * s.priorAbsFall / 90, 1) });
      if (s.priorRefFall >= 2) cand.push({ domain: "behavior", measure: "referrals_per_month", pre: round(s.priorRefFall / 4.5, 2) });
      if (s.readFall < 25 && s.grade <= 8) cand.push({ domain: "academic", measure: "reading_percentile", pre: round(s.readFall, 0) });
      else if (s.mathFall < 22 && s.grade <= 8) cand.push({ domain: "academic", measure: "math_percentile", pre: round(s.mathFall, 0) });
      else if (s.grade >= 9 && s.zA < -1.1) cand.push({ domain: "academic", measure: "gpa", pre: round(clamp(2.2 + 0.6 * s.zA, 0.3, 4), 2) });
      if (s.wellFall >= 6 && s.grade >= 3) cand.push({ domain: "wellness", measure: "wellness_score", pre: round(s.wellFall, 1) });
      for (const c of cand) {
        if (!bRng.chance(0.55)) {               // untreated comparison group
          const improved = bRng.chance(UNTREATED_IMPROVE);
          applyOutcome(s, c.domain, improved, bRng);
          continue;
        }
        const progs = availablePrograms(c.domain);
        let program = bRng.pick(progs);
        if (c.domain === "academic") program = c.measure === "math_percentile" ? "math_reteach" : c.measure === "gpa" ? bRng.pick(["credit_recovery", "tutoring"]) : bRng.pick(adopted.has("wilson") ? ["reading_intervention", "wilson", "tutoring"] : ["reading_intervention", "tutoring"]);
        if (c.domain === "wellness" && program === "sap" && s.grade < 5) program = "coping_group";
        const early = bRng.chance(0.45);
        const fidelity = clamp(bRng.normal(0.78, 0.12), 0.3, 1);
        let p = EFFECT[program] ?? 0.5; if (early) p += 0.12; p += 0.25 * (fidelity - 0.78); if (c.domain === "attendance" && program === "attendance_team") p -= 0.04;
        const improved = bRng.chance(clamp(p, 0.1, 0.9));
        applyOutcome(s, c.domain, improved, bRng);
        const start = addDays("2025-10-01", bRng.int(0, 110));
        priorEpisodes.push({ s, domain: c.domain, program, improved, early, fidelity, start, pre: c.pre, post: 0, measure: c.measure });
      }
    }
    // persist prior-year outcomes for every student in each domain where they had a measurable baseline
    for (const s of students) {
      ins.outcome.run(s.id, "attendance", "absence_rate", round(100 * s.priorAbsFall / 90, 1), round(100 * s.priorAbsSpring / 90, 1), s.priorAbsSpring < s.priorAbsFall * 0.8 ? 1 : 0);
      ins.outcome.run(s.id, "behavior", "referrals_per_month", round(s.priorRefFall / 4.5, 2), round(s.priorRefSpring / 4.5, 2), s.priorRefSpring < s.priorRefFall * 0.7 || (s.priorRefFall >= 1 && s.priorRefSpring === 0) ? 1 : 0);
      if (s.grade <= 8) ins.outcome.run(s.id, "academic", "reading_percentile", round(s.readFall, 0), round(s.readSpring, 0), s.readSpring - s.readFall >= 8 ? 1 : 0);
      if (s.grade >= 3) ins.outcome.run(s.id, "wellness", "wellness_score", round(s.wellFall, 1), round(s.wellSpring, 1), s.wellSpring <= s.wellFall - 1.5 ? 1 : 0);
    }
    for (const e of priorEpisodes) {
      const s = e.s;
      const post = e.domain === "attendance" ? round(100 * s.priorAbsSpring / 90, 1) : e.domain === "behavior" ? round(s.priorRefSpring / 4.5, 2) : e.measure === "reading_percentile" ? round(s.readSpring, 0) : e.measure === "math_percentile" ? round(s.mathSpring, 0) : e.measure === "gpa" ? round(clamp(e.pre + (e.improved ? 0.5 : -0.1) + bRng.normal(0, 0.15), 0, 4), 2) : round(s.wellSpring, 1);
      const planned = e.program === "cico" || e.program === "morning_checkin" ? 60 : e.program === "attendance_meeting" || e.program === "home_visit" ? 1 : e.program === "coping_group" ? 8 : e.program === "sap" ? 3 : 20;
      ins.interv.run(s.id, e.program, e.domain, e.program === "wilson" || e.program === "outpatient" || e.program === "behavior_plan" ? "tier3" : "tier2", e.start, addDays(e.start, bRng.int(50, 110)), "completed",
        reasonFor(e.domain, s), e.early ? bRng.int(2, 14) : bRng.int(15, 45), planned, Math.round(planned * e.fidelity), round(e.fidelity, 2), fundingFor(e.program), providerFor(e.program), e.measure, e.pre, post, e.improved ? 1 : 0, null);
      stats.interventions++;
    }

    // ---- current year (2026-27) to date
    const curEpisodes: { s: Student; domain: string; program: string; start: string; measure: string; pre: number; early: boolean }[] = [];
    const monthKey = (iso: string) => parseInt(iso.slice(5, 7), 10);
    for (const s of students) {
      const base = sigmoid(logit(0.05) + 0.85 * s.zAtt) * (s.traj === "improving" ? 0.7 : 1) * (s.priorAbsSpring < s.priorAbsFall ? 0.9 : 1.05);
      let absences = 0; let unexcused = 0;
      let abs3first = 0, abs3last = 0;
      const nDays = CURRENT_DAYS.length;
      for (let i = 0; i < nDays; i++) {
        const day = CURRENT_DAYS[i];
        let p = base;
        if (s.traj === "rising_absence") p = base * (0.9 + 3.2 * (i / nDays));
        if (s.mondayPattern && p > 0.05) p = dow(day) === 1 ? p * 2.2 : p * 0.7;
        const absent = bRng.chance(clamp(p, 0, 0.95));
        let status = "present";
        if (absent) { absences++; const unex = bRng.chance(s.econ ? 0.55 : 0.4); if (unex) unexcused++; status = unex ? "absent_unexcused" : "absent_excused"; if (i < 15) abs3first++; if (i >= nDays - 15) abs3last++; }
        else if (bRng.chance(0.03 + (s.zAtt > 0.8 ? 0.04 : 0))) status = "tardy";
        if (status !== "present") ins.att.run(s.id, day, status);
        const k = `${b.id}:${monthKey(day)}`; const m = (bam[k] ??= { days: 0, enrolled: 0, abs: 0, chronic: 0 });
        if (i === 0 || monthKey(CURRENT_DAYS[i - 1]) !== monthKey(day)) m.enrolled++;
        if (absent) m.abs++;
      }
      s.curAbsRate = absences / nDays;
      // chronic to date per month
      for (const mo of new Set(CURRENT_DAYS.map(monthKey))) { const k = `${b.id}:${mo}`; const m = bam[k]; const upto = CURRENT_DAYS.filter((d) => monthKey(d) <= mo).length; m.days = upto; }
      const chronicToDate = s.curAbsRate >= 0.10;
      for (const mo of new Set(CURRENT_DAYS.map(monthKey))) { if (chronicToDate) bam[`${b.id}:${mo}`].chronic++; }

      // grades: prior-year final, current MP1 and running grade
      const absPenalty = 22 * Math.max(0, s.curAbsRate - 0.06);
      for (const subj of subjects) {
        const subjShift = subj === "Math" ? (mathShift - acadShift) * 8 : subj === "Elective" ? 4 : 0;
        const prior = clamp(85 + 7 * s.zA + subjShift + bRng.normal(0, 3.5), 45, 99);
        s.priorFinal[subj] = prior;
        ins.grade.run(s.id, PRIOR_YEAR, "FINAL", subj, letterFor(prior), round(prior, 0));
        let mp1 = clamp(prior + bRng.normal(0, 3) - absPenalty * 0.5, 35, 99);
        let cur = clamp(mp1 + bRng.normal(0, 2.5) - absPenalty * 0.8, 30, 99);
        if (s.traj === "grade_drop" && subj === (s.zA < 0 ? "Math" : bRng.pick(["Math", "ELA", "Science"]))) cur = clamp(cur - bRng.int(12, 20), 30, 99);
        if (s.traj === "rising_absence" && subj === "Math") cur = clamp(cur - bRng.int(8, 16), 30, 99);
        if (s.traj === "improving") cur = clamp(cur + 4, 30, 99);
        s.curGrades[subj] = [mp1, cur];
        ins.grade.run(s.id, CURRENT_YEAR, "MP1", subj, letterFor(mp1), round(mp1, 0));
        ins.grade.run(s.id, CURRENT_YEAR, "CURRENT", subj, letterFor(cur), round(cur, 0));
      }

      // screeners (K-8): prior fall/winter/spring + current fall
      if (s.grade <= 8) {
        const readTool = tools.reading, mathTool = tools.math;
        const acadienceBoost = readTool.startsWith("Acadience") ? 2.5 : 0;   // slightly higher fall->winter growth where Acadience + PM routines are in place
        const readWinter = clamp((s.readFall + s.readSpring) / 2 + acadienceBoost + bRng.normal(0, 3), 1, 99);
        s.readCur = clamp(s.readSpring + (s.traj === "grade_drop" ? -6 : 0) + bRng.normal(-1, 4), 1, 99);
        s.mathCur = clamp(s.mathSpring + (s.traj === "grade_drop" ? -5 : 0) + bRng.normal(-1, 4), 1, 99);
        const mathWinter = clamp((s.mathFall + s.mathSpring) / 2 + bRng.normal(0, 3), 1, 99);
        const rm = s.grade <= 1 ? (s.grade === 0 ? "FSF/PSF" : "NWF") : s.grade <= 6 ? "ORF" : "MAZE";
        const scoreFor = (pct: number, g: number) => round((g <= 1 ? 20 + 45 * pct / 100 : g <= 6 ? (25 + 22 * g) * (0.45 + 1.1 * pct / 100) : 8 + 22 * pct / 100), 0);
        const prevGrade = Math.max(0, s.grade - 1);
        ins.scr.run(s.id, readTool, "reading", PRIOR_YEAR, "fall", rm, scoreFor(s.readFall, prevGrade), round(s.readFall, 0), benchFor(s.readFall), "2025-09-15");
        ins.scr.run(s.id, readTool, "reading", PRIOR_YEAR, "winter", rm, scoreFor(readWinter, prevGrade), round(readWinter, 0), benchFor(readWinter), "2026-01-14");
        ins.scr.run(s.id, readTool, "reading", PRIOR_YEAR, "spring", rm, scoreFor(s.readSpring, prevGrade), round(s.readSpring, 0), benchFor(s.readSpring), "2026-05-13");
        ins.scr.run(s.id, readTool, "reading", CURRENT_YEAR, "fall", rm, scoreFor(s.readCur, s.grade), round(s.readCur, 0), benchFor(s.readCur), "2026-09-16");
        const mm = s.grade <= 1 ? "NNF/QDF" : "Composite";
        ins.scr.run(s.id, mathTool, "math", PRIOR_YEAR, "fall", mm, round(300 + 2.2 * s.mathFall + 15 * prevGrade, 0), round(s.mathFall, 0), benchFor(s.mathFall), "2025-09-16");
        ins.scr.run(s.id, mathTool, "math", PRIOR_YEAR, "winter", mm, round(300 + 2.2 * mathWinter + 15 * prevGrade + 10, 0), round(mathWinter, 0), benchFor(mathWinter), "2026-01-15");
        ins.scr.run(s.id, mathTool, "math", PRIOR_YEAR, "spring", mm, round(300 + 2.2 * s.mathSpring + 15 * prevGrade + 20, 0), round(s.mathSpring, 0), benchFor(s.mathSpring), "2026-05-14");
        ins.scr.run(s.id, mathTool, "math", CURRENT_YEAR, "fall", mm, round(300 + 2.2 * s.mathCur + 15 * s.grade, 0), round(s.mathCur, 0), benchFor(s.mathCur), "2026-09-17");
      }

      // behavior referrals (current year to date) with location/time patterns
      const lamCur = (b.gradeLow <= 2 ? 0.18 : 0.3) * Math.exp(1.1 * s.zB) * (CURRENT_DAYS.length / 180) * (s.traj === "behavior_spike" ? 3.5 : s.traj === "improving" ? 0.5 : 1);
      s.curRefs = poisson(bRng, lamCur);
      for (let r = 0; r < s.curRefs; r++) {
        const day = bRng.pick(CURRENT_DAYS);
        const afterLunch = s.afterLunchPattern && bRng.chance(0.7);
        const cat = bRng.weighted<[string, number][]>([["disruption", 30], ["defiance", 22], ["verbal", 15], ["physical", 10], ["tardy", 12], ["technology", 6], ["other", 5]] as any) as unknown as string;
        ins.ref.run(s.id, day, cat, afterLunch ? bRng.pick(["cafeteria", "hallway"]) : bRng.pick(["classroom", "classroom", "hallway", "bus", "playground"]), afterLunch ? "after lunch" : bRng.pick(["morning", "mid-day", "afternoon", "dismissal"]), bRng.pick(["conference", "parent contact", "detention", "loss of privilege", "in-school suspension", "referral to counselor"]), cat === "physical" ? 0 : (bRng.chance(0.7) ? 1 : 0));
      }

      // nurse visits
      const nv = poisson(bRng, 0.3 + 0.5 * Math.exp(0.7 * s.zW) * (s.traj === "wellness_decline" ? 2 : 1) * (CURRENT_DAYS.length / 180) * 3);
      for (let v = 0; v < nv; v++) ins.nurse.run(s.id, bRng.pick(CURRENT_DAYS), bRng.weighted<[string, number][]>([["stomachache", 35], ["headache", 30], ["injury", 15], ["other", 20]] as any) as unknown as string);

      // wellness screens (grades 3-12) and weekly check-ins
      if (s.grade >= 3) {
        s.wellCur = clamp(s.wellSpring + (s.traj === "wellness_decline" ? 2.2 : 0) + (s.traj === "improving" ? -0.8 : 0) + bRng.normal(0, 0.7), 0, 10);
        const screen = (w: number, sy: string, win: string, date: string) => {
          const anx = clamp(w + bRng.normal(0, 0.9), 0, 10), dep = clamp(w - 0.6 + bRng.normal(0, 0.9), 0, 10);
          const conn = clamp(8 - 0.5 * w + bRng.normal(0, 1), 0, 10), safe = clamp(8.5 - 0.3 * w + bRng.normal(0, 1), 0, 10);
          const lvl = w >= 6.5 ? "high" : w >= 4.5 ? "moderate" : "low";
          ins.well.run(s.id, sy, win, round(anx, 1), round(dep, 1), round(conn, 1), round(safe, 1), lvl, date);
        };
        screen(s.wellFall, PRIOR_YEAR, "fall", "2025-10-06"); screen(s.wellSpring, PRIOR_YEAR, "spring", "2026-04-20"); screen(s.wellCur, CURRENT_YEAR, "fall", "2026-09-29");
        const weeks = CURRENT_DAYS.filter((d) => dow(d) === 3);
        weeks.forEach((d, i) => {
          let base = clamp(4.3 - 0.35 * s.wellCur + bRng.normal(0, 0.5), 1, 5);
          if (s.traj === "wellness_decline" && i >= weeks.length - 3) base -= (i - (weeks.length - 4)) * 0.7;
          ins.checkin.run(s.id, d, Math.round(clamp(base, 1, 5)));
        });
      }

      // current-year supports (active): flagged early in the year
      const cur: { domain: string; measure: string; pre: number; program: string }[] = [];
      const progsFor = (dom: string) => availablePrograms(dom);
      if (s.curAbsRate >= 0.12 && bRng.chance(0.45)) cur.push({ domain: "attendance", measure: "absence_rate", pre: round(100 * s.curAbsRate, 1), program: bRng.pick(progsFor("attendance")) });
      if (s.curRefs >= 2 && bRng.chance(0.5)) cur.push({ domain: "behavior", measure: "referrals_per_month", pre: round(s.curRefs / 2, 2), program: adopted.has("cico") && bRng.chance(0.6) ? "cico" : bRng.pick(progsFor("behavior")) });
      if (s.grade <= 8 && s.readCur < 20 && bRng.chance(0.6)) cur.push({ domain: "academic", measure: "reading_percentile", pre: round(s.readCur, 0), program: "reading_intervention" });
      else if (s.grade <= 8 && s.mathCur < 18 && bRng.chance(0.5)) cur.push({ domain: "academic", measure: "math_percentile", pre: round(s.mathCur, 0), program: "math_reteach" });
      if (s.grade >= 3 && s.wellCur >= 6.5 && bRng.chance(0.45)) cur.push({ domain: "wellness", measure: "wellness_score", pre: round(s.wellCur, 1), program: adopted.has("school_counseling") && bRng.chance(0.5) ? "school_counseling" : bRng.pick(progsFor("wellness").filter((p) => p !== "school_counseling")) });
      for (const c of cur) {
        const early = bRng.chance(0.5);
        const start = addDays("2026-09-08", bRng.int(0, 35));
        if (start > TODAY) continue;
        curEpisodes.push({ s, ...c, start, early });
      }
    }
    for (const e of curEpisodes) {
      const s = e.s;
      const planned = e.program === "cico" || e.program === "morning_checkin" ? 60 : e.program === "attendance_meeting" || e.program === "home_visit" ? 1 : e.program === "coping_group" ? 8 : e.program === "sap" ? 3 : 20;
      const weeksIn = Math.max(1, Math.round((new Date(TODAY).getTime() - new Date(e.start).getTime()) / (7 * 86400e3)));
      ins.interv.run(s.id, e.program, e.domain, e.program === "wilson" || e.program === "outpatient" ? "tier3" : "tier2", e.start, null, "active", reasonFor(e.domain, s), e.early ? bRng.int(2, 14) : bRng.int(15, 40), planned, Math.min(planned, Math.round(weeksIn * (planned >= 20 ? 3 : planned === 60 ? 5 : 1) * clamp(bRng.normal(0.8, 0.1), 0.4, 1))), round(clamp(bRng.normal(0.8, 0.1), 0.3, 1), 2), fundingFor(e.program), providerFor(e.program), e.measure, e.pre, null, null, `Week ${weeksIn}`);
      stats.interventions++;
      // weekly progress monitoring for academic supports
      if (e.domain === "academic") {
        const measure = e.measure === "math_percentile" ? "Composite" : s.grade <= 1 ? "NWF" : s.grade <= 6 ? "ORF" : "MAZE";
        const startScore = e.measure === "math_percentile" ? 300 + 2.2 * s.mathCur + 15 * s.grade : s.grade <= 1 ? 20 + 45 * s.readCur / 100 : s.grade <= 6 ? (25 + 22 * s.grade) * (0.45 + 1.1 * s.readCur / 100) : 8 + 22 * s.readCur / 100;
        const goal = startScore * 1.35; const slope = bRng.chance(0.6) ? 1.4 : 0.7;
        for (let w = 0; w < weeksIn; w++) {
          const d = addDays(e.start, 7 * w); if (d > TODAY) break;
          ins.pm.run(s.id, e.measure === "math_percentile" ? "math" : "reading", d, measure, round(startScore + slope * (goal - startScore) / 12 * w + bRng.normal(0, startScore * 0.04), 0), round(goal, 0));
        }
      }
    }

    // ---- persist students (prior-year totals) and flagged-student timeline fixtures
    for (const s of students) {
      stats.students++;
      const prior = s.priorAbsFall + s.priorAbsSpring;
      ins.student.run(s.id, `${7000000000 + (++stateSeq) * 37}`.slice(0, 10), s.aun, s.buildingId, s.classroomId, s.gender === "F" ? bRng.pick(FIRST_NAMES_F) : bRng.pick(FIRST_NAMES_M), bRng.pick(LAST_NAMES), s.grade, s.gender, s.race, s.econ, s.iep, s.el, s.gifted, s.s504, s.enrolledSince, s.newToBuilding, prior, Math.max(0, Math.round(prior * bRng.normal(0.9, 0.3))), Math.max(0, Math.round(prior * bRng.normal(0.85, 0.3))), round(s.zA, 3), round(s.zAtt, 3), round(s.zB, 3), round(s.zW, 3));
    }
    const counselorId = counselorsByBuilding.get(b.id)!;
    for (const s of students) {
      if (s.traj === "rising_absence" && s.curAbsRate >= 0.12) {
        ins.contact.run(s.id, "2026-10-14", "flag", "Flagged by the model", "Rising absences plus a course grade drop.");
        if (bRng.chance(0.7)) ins.contact.run(s.id, "2026-10-15", "referral", "Referred to attendance team", "Referred by homeroom teacher after the dashboard flag.");
        if (bRng.chance(0.5)) ins.contact.run(s.id, "2026-10-19", "family_call", "Family phone call", "Family shared a change in the morning routine at home.");
        if (bRng.chance(0.5)) { ins.contact.run(s.id, "2026-10-28", "meeting", "Team meeting scheduled", "Counselor, homeroom teacher, and family."); ins.plan.run(s.id, "High: plan in progress", counselorId, "2026-10-28 14:30"); }
      }
    }
  }

  // building monthly roll-ups (current year) + synthetic prior-year monthly series anchored on real chronic rates
  for (const [k, m] of Object.entries(bam)) {
    const [bid, mo] = k.split(":").map(Number);
    const daysInMonth = CURRENT_DAYS.filter((d) => parseInt(d.slice(5, 7), 10) === mo).length;
    ins.bam.run(bid, CURRENT_YEAR, mo, daysInMonth, m.enrolled, round(m.abs / Math.max(1, m.enrolled * daysInMonth), 4), round(100 * m.chronic / Math.max(1, m.enrolled), 1));
  }
  const bRows = db.prepare("SELECT id FROM buildings WHERE active=1").all() as { id: number }[];
  const enroll = db.prepare("SELECT enrollment FROM building_years WHERE building_id=? ORDER BY school_year DESC LIMIT 1");
  const realChronic = db.prepare("SELECT school_year, value FROM building_measures WHERE building_id=? AND measure='regular_attendance' AND subgroup='all'");
  for (const { id } of bRows) {
    const e = (enroll.get(id) as any)?.enrollment ?? 300;
    const byYear = new Map((realChronic.all(id) as any[]).map((r) => [r.school_year, 100 - r.value]));
    for (const sy of ["2023-24", "2024-25", "2025-26"]) {
      const endChronic = byYear.get(sy) ?? byYear.get("2024-25") ?? 20;
      const months = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
      let cum = 0;
      months.forEach((mo, i) => {
        const days = mo === 8 ? 5 : mo === 6 ? 8 : mo === 12 ? 15 : 19; cum += days;
        // chronic-to-date starts high (few days, noisy) and settles toward the real end-of-year rate
        const ctd = endChronic * (1.35 - 0.35 * (i / (months.length - 1))) + (new Rng(`${seed}:m:${id}:${sy}:${mo}`).normal(0, 1.2));
        const ar = (endChronic / 100) * 0.42 + (mo === 12 || mo === 1 || mo === 2 ? 0.012 : 0) + (mo === 5 || mo === 6 ? 0.01 : 0);
        ins.bam.run(id, sy, mo, days, Math.round(e), round(ar, 4), round(clamp(ctd, 1, 80), 1));
      });
    }
  }
  return stats;
}

function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rng.float(); } while (p > L);
  return k - 1;
}

/** Mutates the student's prior-year spring state to reflect improvement (or not) in a domain. */
function applyOutcome(s: Student, domain: string, improved: boolean, rng: Rng) {
  if (domain === "attendance") s.priorAbsSpring = improved ? Math.round(s.priorAbsFall * rng.normal(0.55, 0.12)) : Math.round(s.priorAbsFall * rng.normal(1.05, 0.15));
  if (domain === "behavior") s.priorRefSpring = improved ? Math.max(0, Math.round(s.priorRefFall * rng.normal(0.4, 0.2))) : Math.round(s.priorRefFall * rng.normal(1.1, 0.3));
  if (domain === "academic") { const d = improved ? rng.normal(14, 4) : rng.normal(1, 4); s.readSpring = clamp(s.readFall + d, 1, 99); s.mathSpring = clamp(s.mathFall + d * 0.8, 1, 99); }
  if (domain === "wellness") s.wellSpring = clamp(s.wellFall + (improved ? -rng.normal(2.4, 0.6) : rng.normal(0.2, 0.6)), 0, 10);
  if (improved && domain !== "wellness") s.zAtt -= 0.15; // small carry-over into the current year
}

function reasonFor(domain: string, s: Student): string {
  switch (domain) {
    case "attendance": return s.traj === "rising_absence" ? "Absences rising month over month" : "Missed 10% or more of days";
    case "behavior": return s.afterLunchPattern ? "Repeated referrals during transitions" : "Two or more office referrals";
    case "academic": return s.grade >= 9 ? "Credits behind / course failures" : "Below benchmark on screener";
    default: return s.traj === "wellness_decline" ? "Wellness check-in scores dropping" : "Elevated wellness screener score";
  }
}
