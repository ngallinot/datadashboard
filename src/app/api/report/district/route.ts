import { NextResponse, type NextRequest } from "next/server";
import { getScope } from "@/lib/scope";
import { renderPdf } from "@/lib/pdf";
import { zipFiles, toCsv } from "@/lib/zip";
import { buildings, attendanceByGrade, supportResults, supportList, activeSupports, insights, overviewKpis, referralsBreakdown } from "@/lib/queries/district";

export async function GET(req: NextRequest) {
  const scope = await getScope();
  if (scope.role !== "district" && scope.role !== "csiu") return NextResponse.json({ error: "Not available in this role." }, { status: 403 });
  const slug = scope.districtName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  if (format === "csv") {
    const k = overviewKpis(scope); const beh = referralsBreakdown(scope);
    const files = [
      { name: "README.txt", data: `CSIU District Insights — data-ready export for ${scope.districtName} (${scope.schoolYear}), generated ${new Date().toISOString()}\n\nPROTOTYPE WITH SAMPLE DATA. Building, enrollment, and state assessment figures are real public data (PDE Future Ready PA Index). All student-level rows are synthetic; student IDs do not correspond to real students.\n\nFiles: overview.csv, insights.csv, buildings.csv, attendance_by_grade.csv, referrals_by_time.csv, referrals_by_location.csv, whats_working.csv, active_supports.csv, student_support_list.csv\n` },
      { name: "overview.csv", data: toCsv([{ district: scope.districtName, school_year: scope.schoolYear, enrollment: k.enrollment, students_modeled: k.students, chronic_absence_to_date_pct: k.chronicPct, three_year_avg_chronic_oct_pct: k.threeYearChronicOct, students_flagged: k.flagged, students_high_risk: k.high, referrals_ytd: k.referrals, referrals_same_point_last_year: k.priorRefs, school_days_elapsed: k.nDays }]) },
      { name: "insights.csv", data: toCsv(insights(scope).map((i) => ({ domain: i.domain, title: i.title, confidence: i.confidence, body: i.body, next_step: i.nextStep, csiu_service: i.service }))) },
      { name: "buildings.csv", data: toCsv(buildings(scope).map(({ id, ...b }) => ({ building_id: id, ...b }))) },
      { name: "attendance_by_grade.csv", data: toCsv(attendanceByGrade(scope).map((r) => ({ ...r }))) },
      { name: "referrals_by_time.csv", data: toCsv(beh.time.map((r) => ({ time_of_day: r.k, referrals: r.n }))) },
      { name: "referrals_by_location.csv", data: toCsv(beh.location.map((r) => ({ location: r.k, referrals: r.n }))) },
      { name: "whats_working.csv", data: toCsv(supportResults(scope, 5).map((r) => ({ ...r }))) },
      { name: "active_supports.csv", data: toCsv(activeSupports(scope).map((r) => ({ ...r }))) },
      { name: "student_support_list.csv", data: toCsv(supportList(scope, { limit: 500 }).map((r) => ({ student_id: r.id, grade: r.grade, building: r.building, classroom: r.classroom, risk_level: r.level, risk_score: r.score, main_factors: r.factors.map((f) => f.factor).join("; "), current_supports: r.supports ?? "", suggested_next_step: r.next_step, days_missed: r.days_missed, referrals: r.referrals }))) },
    ];
    return new NextResponse(new Uint8Array(zipFiles(files)), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="district-data-${slug}-2026-10-20.zip"` } });
  }
  const url = new URL(`/print/district?aun=${scope.aun}`, req.nextUrl.origin).toString();
  if (format === "html") return NextResponse.redirect(url);
  const pdf = await renderPdf(url, [{ name: "aun", value: String(scope.aun) }, { name: "role", value: "district" }]);
  if (!pdf) return NextResponse.redirect(url + "&nopdf=1");
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="district-meeting-${slug}-2026-10-20.pdf"` } });
}
