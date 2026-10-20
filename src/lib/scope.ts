// Role-based scoping. The scope is resolved once per request (from cookies + URL) and passed to every query.
// Queries build their WHERE clauses from the scope, so a district user physically cannot read another district's rows,
// and the board role cannot call student-level queries at all (assertStudentLevel throws).
import { cookies } from "next/headers";
import { all, one } from "./db";

export type Role = "csiu" | "district" | "board" | "teacher" | "student";
export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "csiu", label: "CSIU Regional", blurb: "IU staff: all 17 districts, map, rankings" },
  { id: "district", label: "District", blurb: "Superintendent and central office" },
  { id: "board", label: "School Board", blurb: "Plain-language aggregates only" },
  { id: "teacher", label: "Teacher", blurb: "Your rosters only" },
  { id: "student", label: "Student", blurb: "A flagged student's profile" },
];

export interface Scope {
  role: Role;
  aun: number;                // district in focus (always set; for csiu it is the "selected" district)
  districtName: string;
  buildingId?: number;        // teacher scope
  classroomId?: number;       // teacher scope
  teacherId?: number;
  schoolYear: string;
}

export const DEFAULT_AUN = 116496603; // Shikellamy

export async function getScope(searchParams?: Record<string, string | string[] | undefined>): Promise<Scope> {
  const jar = await cookies();
  const pick = (k: string) => { const v = searchParams?.[k]; return (Array.isArray(v) ? v[0] : v) ?? jar.get(k)?.value; };
  const roleRaw = pick("role");
  const role: Role = ROLES.some((r) => r.id === roleRaw) ? (roleRaw as Role) : "csiu";
  let aun = parseInt(pick("aun") ?? "", 10);
  if (!aun || !one("SELECT 1 FROM districts WHERE aun=?", aun)) aun = DEFAULT_AUN;
  const districtName = one<{ name: string }>("SELECT name FROM districts WHERE aun=?", aun)!.name;
  const scope: Scope = { role, aun, districtName, schoolYear: "2026-27" };
  if (role === "teacher") {
    const cid = parseInt(pick("classroom") ?? "", 10);
    const room = (cid && one<{ id: number; building_id: number; teacher_id: number }>("SELECT c.id, c.building_id, c.teacher_id FROM classrooms c JOIN buildings b ON b.id=c.building_id WHERE c.id=? AND b.aun=?", cid, aun))
      || defaultClassroom(aun);
    scope.classroomId = room.id; scope.buildingId = room.building_id; scope.teacherId = room.teacher_id;
  }
  return scope;
}

/** A homeroom with an interesting mix for the demo: grade 6 (or lowest secondary grade) with the most flagged students. */
export function defaultClassroom(aun: number) {
  return one<{ id: number; building_id: number; teacher_id: number }>(`
    SELECT c.id, c.building_id, c.teacher_id FROM classrooms c JOIN buildings b ON b.id=c.building_id
    JOIN students s ON s.classroom_id=c.id JOIN student_risk r ON r.student_id=s.id
    WHERE b.aun=? AND c.grade=6 GROUP BY c.id ORDER BY SUM(CASE WHEN r.level IN ('high','moderate') THEN 1 ELSE 0 END) DESC LIMIT 1`, aun)
    ?? one<{ id: number; building_id: number; teacher_id: number }>("SELECT c.id, c.building_id, c.teacher_id FROM classrooms c JOIN buildings b ON b.id=c.building_id WHERE b.aun=? ORDER BY c.grade DESC LIMIT 1", aun)!;
}

/** SQL fragment restricting `students s` rows to what this scope may see. */
export function studentScope(scope: Scope): { sql: string; params: unknown[] } {
  assertStudentLevel(scope);
  if (scope.role === "teacher") return { sql: "s.classroom_id = ?", params: [scope.classroomId] };
  if (scope.role === "csiu") return { sql: "1=1", params: [] };
  return { sql: "s.aun = ?", params: [scope.aun] };
}

/** SQL fragment restricting district-level rows (`d.aun`). CSIU sees all; everyone else their own district. */
export function districtScope(scope: Scope, col = "d.aun"): { sql: string; params: unknown[] } {
  if (scope.role === "csiu") return { sql: "1=1", params: [] };
  return { sql: `${col} = ?`, params: [scope.aun] };
}

export function assertStudentLevel(scope: Scope) {
  if (scope.role === "board") throw new Error("Board role has no access to student-level data.");
}

export function canSeeOtherDistricts(scope: Scope) { return scope.role === "csiu"; }

export function districtsList() { return all<{ aun: number; name: string }>("SELECT aun, name FROM districts ORDER BY name"); }
