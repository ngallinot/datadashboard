// Runs every library question in every role and prints row counts + first bullet. Usage: npx tsx test-ask.ts

import { LIBRARY } from "@/lib/ask/library";
import { withScopedViews } from "@/lib/ask/views";

const scopes: any[] = [
  { role: "csiu", aun: 116496603, districtName: "Shikellamy", schoolYear: "2026-27" },
  { role: "district", aun: 116496603, districtName: "Shikellamy", schoolYear: "2026-27" },
  { role: "board", aun: 116496603, districtName: "Shikellamy", schoolYear: "2026-27" },
  { role: "teacher", aun: 116496603, districtName: "Shikellamy", schoolYear: "2026-27", classroomId: Number(process.env.CLASSROOM || 0), buildingId: 8372 },
];
let fails = 0;
for (const scope of scopes) {
  console.log(`\n=== ${scope.role}`);
  for (const e of LIBRARY) {
    if (e.studentLevel && scope.role === "board") continue;
    try {
      const out = withScopedViews(scope, ({ run }) => { const r = run(e.sql); const c = e.compareSql ? run(e.compareSql) : undefined; return { r, c, bullets: e.narrate(r.rows, scope, c?.rows) }; });
      console.log(`ok   ${e.id.padEnd(28)} rows=${String(out.r.rows.length).padStart(3)} ${out.r.ms}ms | ${out.bullets[0]?.slice(0, 110)}`);
      if (!out.bullets.length) { fails++; console.log("     !! no bullets"); }
    } catch (err) { fails++; console.log(`FAIL ${e.id}: ${(err as Error).message}`); }
  }
}
console.log(`\n${fails} failures`);
process.exit(fails ? 1 : 0);
