import { getScope } from "@/lib/scope";
import { attendanceByGrade, attendanceByWeekday, attendanceTrendReal, attendanceSubgroupsReal, buildings, chronicProjection, supportList } from "@/lib/queries/district";
import { PageHeader, Card, SourceNote, Kpi } from "@/components/ui";
import { VBars, TrendLines, HBars, GroupedBars } from "@/components/charts";
import { SupportTable } from "@/components/district";
import { fmtPct, gradeLabel } from "@/lib/format";

const SUB: Record<string, string> = { all: "All students", econ: "Econ. disadvantaged", swd: "Students w/ disabilities", el: "English learners", white: "White", black: "Black", hispanic: "Hispanic", multi: "Two or more races" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AttendancePage() {
  const scope = await getScope();
  const byGrade = attendanceByGrade(scope);
  const dow = attendanceByWeekday(scope);
  const trend = attendanceTrendReal(scope);
  const subs = attendanceSubgroupsReal(scope);
  const bl = buildings(scope);
  const proj = chronicProjection(scope);
  const attRisk = supportList(scope, { limit: 8 }).filter((r) => r.factors.some((f) => f.domain === "attendance"));
  const total = dow.reduce((s, r) => s + r.absences, 0);
  return (
    <>
      <PageHeader title="Attendance" sub="Regular attendance history is real PDE data; this year's daily attendance is synthetic SIS data." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Chronic absence to date" value={fmtPct(proj.now)} context={`projected ${fmtPct(proj.projectedEnd)} by June`} source="SIS" />
        <Kpi label="Regular attendance 2024-25" value={fmtPct(trend[trend.length - 1]?.district)} context={`PA ${fmtPct(trend[trend.length - 1]?.state)}`} source="PDE" />
        <Kpi label="Monday share of absences" value={fmtPct(100 * (dow.find((d) => d.dow === 1)?.absences ?? 0) / Math.max(1, total), 0)} context="of all absences this year" source="SIS" />
        <Kpi label="Grade with highest chronic rate" value={gradeLabel([...byGrade].sort((a, b) => b.chronic_pct - a.chronic_pct)[0]?.grade ?? 0)} context={`${fmtPct([...byGrade].sort((a, b) => b.chronic_pct - a.chronic_pct)[0]?.chronic_pct)} chronically absent to date`} source="SIS" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Regular attendance, four years" sub="Students present 90% or more of enrolled days (inverse of chronic absence)">
          <TrendLines data={trend.map((t) => ({ year: t.school_year, district: t.district, state: t.state }))} x="year" series={[{ key: "district", label: scope.districtName, color: "#2a78d6", width: 2.5 }, { key: "state", label: "Pennsylvania", color: "#7c8792", dashed: true }]} unit="%" height={230} domain={[50, 100]} />
          <SourceNote>PDE Future Ready PA Index, enrollment-weighted across buildings. Statewide fell from 82.2% (2021-22) to 79.6% (2024-25).</SourceNote>
        </Card>
        <Card title="Regular attendance by student group, 2024-25" sub="Reported only for groups of 20 or more students">
          <HBars data={subs.map((s) => ({ group: SUB[s.subgroup] ?? s.subgroup, value: s.value, color: s.subgroup === "all" ? "#2a78d6" : "#9ec5f4" }))} cat="group" val="value" unit="%" domain={[0, 100]} refValue={79.6} refLabel="PA" />
          <SourceNote>Real PDE data. The gap for students with disabilities is the most common TSI designation driver in the region.</SourceNote>
        </Card>
        <Card title="Chronic absence to date by grade" sub="This year vs. the same students' prior-year absence rate">
          <GroupedBars data={byGrade.map((g) => ({ grade: gradeLabel(g.grade), cur: g.cur_rate, prior: g.prior_rate }))} cat="grade" series={[{ key: "cur", label: "Absence rate this year" }, { key: "prior", label: "Same students, last year" }]} unit="%" height={240} />
          <SourceNote>Grade 6 and grade 9 (building transitions) typically show the largest jumps.</SourceNote>
        </Card>
        <Card title="Absences by day of week" sub="All absences this year">
          <VBars data={dow.map((d) => ({ day: DOW[d.dow], absences: d.absences, color: d.dow === 1 ? "#2a78d6" : "#9ec5f4" }))} cat="day" val="absences" height={240} />
          <SourceNote>A Monday concentration usually points to household routines rather than illness; Monday connection check-ins are the matching strategy.</SourceNote>
        </Card>
      </div>
      <Card className="mt-5" title="By building" sub="Real 2024-25 regular attendance alongside this year's chronic absence to date">
        <table className="tbl"><thead><tr><th>Building</th><th>Grades</th><th className="r">Enrollment</th><th className="r">Regular attendance 2024-25</th><th className="r">Chronic to date</th><th className="r">Flagged</th><th>Designation</th></tr></thead>
          <tbody>{bl.map((b) => <tr key={b.id}><td className="font-medium">{b.name}</td><td>{gradeLabel(b.grade_low)}-{b.grade_high}</td><td className="r">{b.enrollment?.toLocaleString()}</td><td className="r">{fmtPct(b.regular_attendance)}</td><td className="r">{fmtPct(b.chronic_to_date)}</td><td className="r">{fmtPct(b.flagged_pct)}</td><td className="text-ink-2">{b.designation ?? "—"}</td></tr>)}</tbody></table>
      </Card>
      <Card className="mt-5" title="Students with attendance as a leading factor" sub="Highest early-warning scores where attendance contributes">
        <SupportTable rows={attRisk} />
      </Card>
    </>
  );
}
