export const fmtPct = (v: number | null | undefined, d = 1) => v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(d)}%`;
export const fmtNum = (v: number | null | undefined, d = 0) => v === null || v === undefined || Number.isNaN(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtPts = (v: number | null | undefined, d = 1) => v === null || v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(d)} pts`;
export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => iso ? new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" }) : "—";
export const fmtDateLong = (iso: string | null | undefined) => fmtDate(iso, { month: "long", day: "numeric", year: "numeric" });
export const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const gradeLabel = (g: number) => g === 0 ? "K" : g === -1 ? "PreK" : String(g);
export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const MEASURE_LABELS: Record<string, string> = {
  ela_prof: "ELA proficiency", math_prof: "Math proficiency", sci_prof: "Science proficiency", ela_growth: "ELA growth (PVAAS)", math_growth: "Math growth (PVAAS)",
  regular_attendance: "Regular attendance", chronic_absence: "Chronic absence", grad_4yr: "4-year graduation", career_benchmark: "Career standards benchmark",
  risk_index: "Students flagged for support", pays_depressive: "PAYS: depressive symptoms", pays_vaping: "PAYS: vaped in past 30 days", pays_safe: "PAYS: feel safe at school",
};
