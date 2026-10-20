import { getScope } from "@/lib/scope";
import { proficiencyTrendReal, buildingProficiencyReal, benchmarkSummary, gradeDistribution, adoptions, screenersInUse, instructionMinutes, districtHeader } from "@/lib/queries/district";
import { PageHeader, Card, SourceNote, Kpi, Pill } from "@/components/ui";
import { TrendLines, GroupedBars } from "@/components/charts";
import { fmtPct, titleCase } from "@/lib/format";

export default async function AcademicsPage() {
  const scope = await getScope();
  const d = districtHeader(scope);
  const trend = proficiencyTrendReal(scope);
  const years = [...new Set(trend.map((t) => t.school_year))].sort();
  const tdata = years.map((y) => ({ year: y, ela: trend.find((t) => t.school_year === y && t.measure === "ela_prof")?.district ?? null, math: trend.find((t) => t.school_year === y && t.measure === "math_prof")?.district ?? null, sci: trend.find((t) => t.school_year === y && t.measure === "sci_prof")?.district ?? null, elaState: trend.find((t) => t.school_year === y && t.measure === "ela_prof")?.state ?? null, mathState: trend.find((t) => t.school_year === y && t.measure === "math_prof")?.state ?? null }));
  const bprof = buildingProficiencyReal(scope);
  const bench = benchmarkSummary(scope);
  const grades = gradeDistribution(scope);
  const adopt = adoptions(scope);
  const scr = screenersInUse(scope);
  const mins = instructionMinutes(scope);
  const benchRows = bench.map((b) => ({ label: `${titleCase(b.subject)} · ${b.window} ${b.school_year.slice(2)}`, on: Math.round(1000 * (b.on_track + b.above) / b.n) / 10, approaching: Math.round(1000 * b.approaching / b.n) / 10, below: Math.round(1000 * b.below / b.n) / 10 }));
  return (
    <>
      <PageHeader title="Academics" sub="State assessment results and growth are real PDE data; benchmark screeners and course grades are synthetic SIS data." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="ELA proficient 2024-25" value={fmtPct(d.ela_prof)} context={`PA ${fmtPct(tdata[tdata.length - 1]?.elaState)}`} source="PDE" />
        <Kpi label="Math proficient 2024-25" value={fmtPct(d.math_prof)} context={`PA ${fmtPct(tdata[tdata.length - 1]?.mathState)}`} source="PDE" />
        <Kpi label="4-year graduation" value={fmtPct(d.grad_4yr)} context="PA 88.0%" source="PDE" />
        <Kpi label="Courses at D/F now" value={fmtPct(100 * grades.reduce((s, g) => s + g.d_f, 0) / Math.max(1, grades.reduce((s, g) => s + g.n, 0)))} context={`${grades.reduce((s, g) => s + g.dropped, 0)} grades dropped 10+ points since MP1`} source="SIS" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Proficiency, four years" sub="Percent proficient or advanced, district (solid) vs. Pennsylvania (dashed)">
          <TrendLines data={tdata} x="year" series={[{ key: "ela", label: "ELA", color: "#2a78d6", width: 2.5 }, { key: "math", label: "Math", color: "#eb6834", width: 2.5 }, { key: "elaState", label: "ELA · PA", color: "#2a78d6", dashed: true, width: 1.5 }, { key: "mathState", label: "Math · PA", color: "#eb6834", dashed: true, width: 1.5 }]} unit="%" height={240} domain={[0, 100]} />
          <SourceNote>PSSA grades 3-8 and Keystone (Literature, Algebra I) combined as published in the Future Ready PA Index. Science is reported for fewer buildings.</SourceNote>
        </Card>
        <Card title="Fall benchmark screeners" sub="Share of K-8 students on track, approaching, and below">
          <GroupedBars data={benchRows} cat="label" series={[{ key: "on", label: "On track / above", color: "#1baf7a" }, { key: "approaching", label: "Approaching", color: "#eda100" }, { key: "below", label: "Below", color: "#e34948" }]} unit="%" height={240} />
          <SourceNote>Tools in use: {scr.map((s) => `${s.tool} (${s.subject}, ${s.grades}, since ${s.since_year})`).join("; ")}.</SourceNote>
        </Card>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card title="By building, 2024-25" sub="Real PDE proficiency and PVAAS growth (100 = meeting growth expectations)">
          <table className="tbl"><thead><tr><th>Building</th><th className="r">ELA</th><th className="r">Math</th><th className="r">Science</th><th className="r">ELA growth</th><th className="r">Math growth</th></tr></thead>
            <tbody>{bprof.map((b) => <tr key={b.building}><td className="font-medium">{b.building}</td><td className="r">{fmtPct(b.ela)}</td><td className="r">{fmtPct(b.math)}</td><td className="r">{fmtPct(b.sci)}</td><td className="r">{b.ela_growth ?? "—"}</td><td className="r">{b.math_growth ?? "—"}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Current grades by subject" sub="Running grades this marking period">
          <table className="tbl"><thead><tr><th>Subject</th><th className="r">A</th><th className="r">B</th><th className="r">C</th><th className="r">D/F</th><th className="r">Dropped 10+</th></tr></thead>
            <tbody>{grades.map((g) => <tr key={g.subject}><td className="font-medium">{g.subject}</td><td className="r">{Math.round(100 * g.a / g.n)}%</td><td className="r">{Math.round(100 * g.b / g.n)}%</td><td className="r">{Math.round(100 * g.c / g.n)}%</td><td className="r font-semibold text-critical-text">{Math.round(100 * g.d_f / g.n)}%</td><td className="r">{g.dropped}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Curriculum and programs in use" sub="Adoption year and grades covered" right={<Pill tone="warn">Illustrative</Pill>}>
          <table className="tbl"><thead><tr><th>Program</th><th>Area</th><th>Grades</th><th className="r">Since</th><th className="r">Years</th></tr></thead>
            <tbody>{adopt.map((a) => <tr key={a.program + a.subject}><td className="font-medium">{a.program}</td><td className="text-ink-2">{titleCase(a.category)} · {a.subject.toUpperCase()}</td><td>{a.grades}</td><td className="r">{a.adoption_year}</td><td className="r">{2026 - a.adoption_year}</td></tr>)}</tbody></table>
          <SourceNote>Adoption records would come from the district's curriculum office in production; here they are a plausible list so "how long have they used it" has an answer.</SourceNote>
        </Card>
        <Card title="Minutes of instruction per day" sub="Scheduled minutes by building and subject (synthetic)">
          <table className="tbl"><thead><tr><th>Building</th><th>Band</th><th className="r">ELA</th><th className="r">Math</th><th className="r">Science</th></tr></thead>
            <tbody>{[...new Set(mins.map((m) => m.building + "|" + m.grade_band))].map((key) => { const [bname, band] = key.split("|"); const g = (s: string) => mins.find((m) => m.building === bname && m.grade_band === band && m.subject === s)?.minutes ?? "—"; return <tr key={key}><td className="font-medium">{bname}</td><td>{band}</td><td className="r">{g("ela")}</td><td className="r">{g("math")}</td><td className="r">{g("science")}</td></tr>; })}</tbody></table>
        </Card>
      </div>
    </>
  );
}
