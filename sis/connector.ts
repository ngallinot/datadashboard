/**
 * SIS integration layer (stubbed).
 *
 * In production, a connector per vendor (Sapphire, PowerSchool, Skyward, ...) pulls nightly extracts
 * through the vendor's API or SFTP drop. In this prototype the only implementation reads Sapphire-style
 * CSV export files from a folder. The warehouse loader (sis/load.ts) depends on the interface only, so a real
 * connector plugs in without touching the loader or the app.
 *
 * Export shapes mirror common Sapphire report exports (column names are illustrative, not an official spec).
 */
import fs from "node:fs";
import path from "node:path";

export interface DemographicsRow { student_number: string; state_id: string; last_name: string; first_name: string; grade: string; gender: string; race_ethnicity: string; school_code: string; school_name: string; homeroom: string; homeroom_teacher: string; econ_disadvantaged: "Y" | "N"; iep: "Y" | "N"; el: "Y" | "N"; gifted: "Y" | "N"; section_504: "Y" | "N"; entry_date: string }
export interface AttendanceRow { student_number: string; date: string; code: string; description: string }       // codes: A (absent), E (excused), U (unexcused), T (tardy)
export interface GradeRow { student_number: string; school_year: string; course: string; subject: string; term: string; letter: string; percent: string }
export interface DisciplineRow { student_number: string; incident_date: string; infraction: string; location: string; time_of_day: string; action_taken: string; minor: "Y" | "N" }
export interface AssessmentRow { student_number: string; assessment: string; subject: string; school_year: string; window: string; measure: string; score: string; percentile: string; benchmark_status: string; test_date: string }

export interface SisExtract {
  demographics: DemographicsRow[]; attendance: AttendanceRow[]; grades: GradeRow[]; discipline: DisciplineRow[];
  /** Third-party assessment files imported into the SIS (Acadience/DIBELS/aimsweb CSVs). */
  assessments: AssessmentRow[];
}

export interface SisConnector {
  readonly vendor: string;
  readonly districtAun: number;
  /** Pull the latest extract for the district. */
  fetch(): Promise<SisExtract>;
}

/** Reads Sapphire-style CSV exports from a directory. This is the only connector in the prototype. */
export class SapphireFileConnector implements SisConnector {
  readonly vendor = "Sapphire (file export)";
  constructor(readonly districtAun: number, private dir: string) {}
  async fetch(): Promise<SisExtract> {
    const read = <T,>(name: string): T[] => {
      const f = path.join(this.dir, name);
      if (!fs.existsSync(f)) return [];
      return parseCsv(fs.readFileSync(f, "utf8")) as T[];
    };
    const assessments = fs.readdirSync(this.dir).filter((f) => /^assessment_.*\.csv$/.test(f)).flatMap((f) => read<AssessmentRow>(f));
    return { demographics: read("demographics.csv"), attendance: read("attendance.csv"), grades: read("grades.csv"), discipline: read("discipline.csv"), assessments };
  }
}

/** Placeholder for a live API connector; throws so it is obvious where real integration work goes. */
export class SapphireApiConnector implements SisConnector {
  readonly vendor = "Sapphire (API)";
  constructor(readonly districtAun: number, _baseUrl: string, _apiKey: string) {}
  async fetch(): Promise<SisExtract> { throw new Error("Not implemented in the prototype: live SIS connectors are stubbed. Use SapphireFileConnector with export files."); }
}

// --- tiny CSV helpers (RFC 4180-ish; enough for our exports) -----------------------------------------
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const [hdr, ...body] = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  return body.map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])));
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}
