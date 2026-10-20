import { getScope } from "@/lib/scope";
import { districtHeader, overviewKpis, insights, chronicProjection, buildings, supportResults, supportList, attendanceByGrade, referralsBreakdown, activeSupports } from "@/lib/queries/district";
import { fmtPct, fmtNum, fmtDateLong, gradeLabel, titleCase } from "@/lib/format";
import { meta } from "@/lib/db";

export default async function PrintDistrict({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope({ ...sp, role: "district" });
  const d = districtHeader(scope);
  const k = overviewKpis(scope);
  const cards = insights(scope);
  const proj = chronicProjection(scope);
  const bl = buildings(scope);
  const works = supportResults(scope, 10);
  const byGrade = attendanceByGrade(scope);
  const beh = referralsBreakdown(scope);
  const active = activeSupports(scope);
  const list = supportList(scope, { limit: 40 });
  return (
    <div className="report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><div className="muted" style={{ letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600 }}>Data-ready for the meeting</div><h1>{d.name} School District</h1><div style={{ color: "#4b5560", marginTop: 2 }}>{d.county} County · {scope.schoolYear} · as of {fmtDateLong(meta("as_of"))}</div></div>
        <div className="muted" style={{ textAlign: "right" }}>CSIU District Insights<br />For district leadership, MTSS, and budget meetings</div>
      </div>
      <div className="banner">Prototype — sample data. Enrollment, state assessment, attendance history, PAYS and SAP figures are real public data; all student-level records are synthetic.</div>

      <div className="sec"><h2>Overview</h2>
        <div className="kpis">
          <div className="kpi"><div className="l">Enrollment</div><div className="v">{fmtNum(k.enrollment)}</div><div className="c">PDE 2024-25 · {d.schools} buildings</div></div>
          <div className="kpi"><div className="l">Chronic absence to date</div><div className="v">{fmtPct(k.chronicPct)}</div><div className="c">3-yr avg at this point {fmtPct(k.threeYearChronicOct)} · projected {fmtPct(proj.projectedEnd)} by June</div></div>
          <div className="kpi"><div className="l">Students flagged</div><div className="v">{fmtNum(k.flagged)}</div><div className="c">{fmtPct(100 * k.flagged / k.students)} of students · {k.high} high</div></div>
          <div className="kpi"><div className="l">Behavior referrals YTD</div><div className="v">{fmtNum(k.referrals)}</div><div className="c">about {fmtNum(k.priorRefs)} at this point last year</div></div>
        </div>
      </div>

      <div className="sec"><h2>What the model is seeing</h2><p className="lead">Patterns compared to this district's 3-year history and similar districts in the region</p>
        <div className="grid3">
          {cards.map((c) => <div key={c.domain} className="card"><div className="muted" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{c.domain} · confidence {c.confidence}</div><h3 style={{ marginTop: 4 }}>{c.title}</h3><p style={{ margin: "4px 0", color: "#4b5560" }}>{c.body}</p><p style={{ margin: 0 }}><b>Next step:</b> {c.nextStep}</p><div className="muted" style={{ marginTop: 4 }}>{c.service}</div></div>)}
        </div>
      </div>

      <div className="sec-loose"><h2>Attendance</h2><p className="lead">Real 2024-25 regular attendance by building, and this year's chronic absence to date</p>
        <table><thead><tr><th>Building</th><th>Grades</th><th className="r">Enrollment</th><th className="r">Regular attendance 2024-25</th><th className="r">Chronic to date</th><th className="r">Flagged</th><th>Designation</th></tr></thead>
          <tbody>{bl.map((b) => <tr key={b.id}><td><b>{b.name}</b></td><td>{gradeLabel(b.grade_low)}-{b.grade_high}</td><td className="r">{fmtNum(b.enrollment)}</td><td className="r">{fmtPct(b.regular_attendance)}</td><td className="r">{fmtPct(b.chronic_to_date)}</td><td className="r">{fmtPct(b.flagged_pct)}</td><td>{b.designation ?? "—"}</td></tr>)}</tbody></table>
        <h3 style={{ marginTop: 12 }}>By grade (this year to date)</h3>
        <table><thead><tr><th>Grade</th><th className="r">Students</th><th className="r">Absence rate</th><th className="r">Same students last year</th><th className="r">Chronic to date</th><th className="r">Monday share</th></tr></thead>
          <tbody>{byGrade.map((g) => <tr key={g.grade}><td>{gradeLabel(g.grade)}</td><td className="r">{g.students}</td><td className="r">{fmtPct(g.cur_rate)}</td><td className="r">{fmtPct(g.prior_rate)}</td><td className="r">{fmtPct(g.chronic_pct)}</td><td className="r">{g.monday_share}%</td></tr>)}</tbody></table>
      </div>

      <div className="sec"><h2>Behavior</h2><p className="lead">{fmtNum(beh.category.reduce((s, c) => s + c.n, 0))} referrals year to date · {beh.repeat.students_with_3plus} students with 3 or more</p>
        <div className="grid3">
          {([["By time of day", beh.time], ["By location", beh.location], ["By category", beh.category]] as [string, { k: string; n: number }[]][]).map(([t, rows]) => <div key={t} className="card"><h3>{t}</h3><table><tbody>{(rows as { k: string; n: number }[]).slice(0, 6).map((r) => <tr key={r.k}><td>{titleCase(r.k)}</td><td className="r">{r.n}</td></tr>)}</tbody></table></div>)}
        </div>
      </div>

      <div className="sec-loose"><h2>What's working: intervention results</h2><p className="lead">2025-26 completed supports: students who received each support compared with similar students who did not</p>
        <table><thead><tr><th>Support</th><th>Domain</th><th className="r">Students</th><th className="r">Improved</th><th className="r">Similar, no support</th><th className="r">Early / late start</th><th>Evidence</th></tr></thead>
          <tbody>{works.map((w) => <tr key={w.program_id}><td><b>{w.program}</b><div className="muted">Funded by {w.funding}</div></td><td>{w.domain}</td><td className="r">{w.students}</td><td className="r"><b>{w.improved_pct}%</b></td><td className="r">{w.similar_untreated_pct ?? "—"}%</td><td className="r">{w.early_pct ?? "—"}% / {w.late_pct ?? "—"}%</td><td>{w.evidence}</td></tr>)}</tbody></table>
        <h3 style={{ marginTop: 12 }}>Active supports this fall</h3>
        <table><thead><tr><th>Support</th><th>Domain</th><th className="r">Active</th><th className="r">Avg days to start</th><th className="r">Started within 2 weeks</th><th className="r">Fidelity</th></tr></thead>
          <tbody>{active.map((a) => <tr key={a.program}><td>{a.program}</td><td>{a.domain}</td><td className="r">{a.active}</td><td className="r">{a.avg_days_to_start}</td><td className="r">{a.early_share}%</td><td className="r">{Math.round(a.avg_fidelity * 100)}%</td></tr>)}</tbody></table>
      </div>

      <div className="sec-loose page-break"><h2>Student support list</h2><p className="lead">Students with two or more risk indicators, highest scores first (top {list.length}). IDs only; this page is for the student support team.</p>
        <table><thead><tr><th>Student</th><th className="r">Grade</th><th>Building</th><th>Risk</th><th>Main factors</th><th>Current supports</th><th>Suggested next step</th></tr></thead>
          <tbody>{list.map((r) => <tr key={r.id}><td>Student {r.id}</td><td className="r">{gradeLabel(r.grade)}</td><td>{r.building}</td><td>{titleCase(r.level)}</td><td>{r.factors.slice(0, 2).map((f) => f.factor).join(", ")}</td><td>{r.supports ?? "None"}</td><td>{r.next_step}</td></tr>)}</tbody></table>
      </div>

      <div className="footer">Sources: PDE Future Ready PA Index (2021-22 to 2024-25), U.S. Census TIGER, PAYS 2025 district profile reports, PDE SAP 2025-26 summaries, district SIS (synthetic). District data remains the property of the district and is protected under FERPA. Predictions support professional judgment; they do not replace it.</div>
    </div>
  );
}
