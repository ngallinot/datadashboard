import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { districtMetrics, districtTrend, iuKpis, iuTrend, MAP_METRICS, paysIuTrends, designationsByDistrict, type DistrictMetrics } from "@/lib/queries/regional";
import { Page, PageHeader, Card, Kpi, SourceNote, Delta, Pill } from "@/components/ui";
import { RegionMap } from "@/components/RegionMap";
import { TrendLines, HBars } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

export default async function RegionalPage({ searchParams }: PageProps<"/regional">) {
  const sp = await searchParams;
  const scope = await getScope(sp);
  if (scope.role !== "csiu") redirect("/");
  const metricId = (typeof sp.metric === "string" && MAP_METRICS.some((m) => m.id === sp.metric)) ? sp.metric : "ela_prof";
  const metric = MAP_METRICS.find((m) => m.id === metricId)!;
  const districts = districtMetrics(scope);
  const kpi = iuKpis();
  const val = (d: DistrictMetrics) => d[metricId as keyof DistrictMetrics] as number | null;
  const ranked = [...districts].filter((d) => val(d) !== null).sort((a, b) => metric.higherIsBetter ? (val(b)! - val(a)!) : (val(a)! - val(b)!));
  const rankOf = new Map(ranked.map((d, i) => [d.aun, i + 1]));
  const mapDistricts = districts.map((d) => ({ aun: d.aun, name: d.name, tiger_geoid: d.tiger_geoid, value: val(d), rank: rankOf.get(d.aun) ?? null, enrollment: d.enrollment, county: d.county, extra: d.ela_program ? `ELA: ${d.ela_program.replace(/ \(.*\)/, "")} since ${d.ela_program_year}` : undefined }));

  // Proficiency trend: focus district emphasized, IU and state as references, other districts muted.
  const trendRows = districtTrend("ela_prof", scope);
  const iu = iuTrend("ela_prof");
  const years = [...new Set(trendRows.map((r) => r.school_year))].sort();
  const trendData = years.map((y) => {
    const row: Record<string, unknown> = { year: y };
    for (const r of trendRows.filter((r) => r.school_year === y)) row[`d${r.aun}`] = r.value;
    const i = iu.find((x) => x.school_year === y); row.iu = i?.iu ?? null; row.state = i?.state ?? null;
    return row;
  });
  const series = [
    ...districts.filter((d) => d.aun !== scope.aun).map((d) => ({ key: `d${d.aun}`, label: d.name, muted: true })),
    { key: "state", label: "Pennsylvania", color: "#7c8792", dashed: true },
    { key: "iu", label: "CSIU 16 (weighted)", color: "#1baf7a" },
    { key: `d${scope.aun}`, label: scope.districtName, color: "#2a78d6", width: 2.5 },
  ];

  const pays = paysIuTrends(["seriously_considered_suicide", "depressive_symptoms"]);
  const paysYears = [...new Set(pays.map((r) => r.school_year))].sort();
  const paysData = paysYears.map((y) => ({ year: y.slice(0, 4), ideation: pays.find((r) => r.school_year === y && r.indicator === "seriously_considered_suicide")?.value ?? null, ideationOther: pays.find((r) => r.school_year === y && r.indicator === "seriously_considered_suicide")?.state_value ?? null, depressive: pays.find((r) => r.school_year === y && r.indicator === "depressive_symptoms")?.value ?? null, depressiveOther: pays.find((r) => r.school_year === y && r.indicator === "depressive_symptoms")?.state_value ?? null }));

  const desig = designationsByDistrict();
  const chronicChange = districtTrend("regular_attendance", scope);
  const change = districts.map((d) => { const a = chronicChange.find((r) => r.aun === d.aun && r.school_year === "2021-22")?.value; const b = chronicChange.find((r) => r.aun === d.aun && r.school_year === "2024-25")?.value; const change = a !== undefined && b !== undefined ? Math.round((b - a) * 10) / 10 : null; return { name: d.name, change, color: d.aun === scope.aun ? "#2a78d6" : (change ?? 0) >= 0 ? "#9ec5f4" : "#f4b9a5" }; }).filter((r) => r.change !== null).sort((a, b) => (b.change! - a.change!));

  return (
    <Page wide>
      <PageHeader eyebrow="CSIU Regional · 5 counties · 17 districts" title="Region at a glance" sub={<>Real district and building figures from the Future Ready PA Index and PAYS; student-level indicators are synthetic. Focus district: <b>{scope.districtName}</b> (change it in the top bar or click the map).</>}
        actions={<Link href="/ask" className="btn btn-primary">Ask a question</Link>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Enrollment" value={fmtNum(kpi.enrollment)} context={`${kpi.buildings} buildings · 2024-25`} source="PDE" />
        <Kpi label="Regular attendance" value={fmtPct(kpi.regAtt)} delta={<Delta value={kpi.regAtt - kpi.regAttPrev} />} context={`vs. 2023-24 · PA ${fmtPct(kpi.regAttState)}`} source="PDE" />
        <Kpi label="ELA proficient" value={fmtPct(kpi.ela)} delta={<Delta value={kpi.ela - kpi.elaPrev} />} context={`vs. 2023-24 · PA ${fmtPct(kpi.elaState)}`} source="PDE" />
        <Kpi label="Math proficient" value={fmtPct(kpi.math)} delta={<Delta value={kpi.math - kpi.mathPrev} />} context={`vs. 2023-24 · PA ${fmtPct(kpi.mathState)}`} source="PDE" />
        <Kpi label="Students flagged" value={fmtNum(kpi.flaggedN)} context={`${fmtPct(kpi.flaggedPct)} of students · moderate or high`} source="Model · synthetic" />
        <Kpi label="PAYS: depressive symptoms" value={fmtPct(kpi.paysDepressive)} context={`of grades 6-12 · PA ${fmtPct(kpi.paysDepressiveState)}`} source="PAYS 2025" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card title="Map" sub={metric.blurb} right={<span className="pill pill-neutral">{metric.source}</span>}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {MAP_METRICS.map((m) => (
              <Link key={m.id} href={`/regional?metric=${m.id}`} className={`chip ${m.id === metricId ? "!border-brand-500 !bg-brand-100 !text-brand-700" : ""}`}>{m.label}</Link>
            ))}
          </div>
          <RegionMap districts={mapDistricts} metricLabel={metric.label} unit={metric.unit} higherIsBetter={metric.higherIsBetter} source={metric.source} selectedAun={scope.aun} height={540} />
          <SourceNote>Boundaries: U.S. Census TIGER/Line 2024 unified school districts and counties. Basemap © CARTO, © OpenStreetMap contributors. District values are enrollment-weighted roll-ups of PDE building data; PDE does not publish district rows.</SourceNote>
        </Card>

        <Card title={`Ranked by ${metric.label.toLowerCase()}`} sub={`${metric.higherIsBetter ? "Highest" : "Lowest"} first · ${ranked.length} of 17 districts reported`} pad={false}>
          <div className="max-h-[640px] overflow-auto px-2 pb-2">
            <table className="tbl">
              <thead><tr><th>#</th><th>District</th><th className="r">{metric.label}</th><th className="r">Enroll.</th><th className="r">Chronic abs.</th><th className="r">ELA</th><th className="r">Math</th><th className="r">Flagged</th></tr></thead>
              <tbody>
                {ranked.map((d, i) => (
                  <tr key={d.aun} className={d.aun === scope.aun ? "bg-brand-100/60" : ""}>
                    <td className="num text-ink-3">{i + 1}</td>
                    <td><Link className="link" href={`/api/session?aun=${d.aun}&next=%2Fdistrict`}>{d.name}</Link><div className="text-[11px] text-ink-3">{d.county} Co.{desig.some((x) => x.aun === d.aun) ? " · TSI/ATSI" : ""}</div></td>
                    <td className="r font-semibold">{val(d) === null ? "—" : `${val(d)!.toFixed(1)}${metric.unit}`}</td>
                    <td className="r">{fmtNum(d.enrollment)}</td>
                    <td className="r">{fmtPct(d.chronic_absence)}</td>
                    <td className="r">{fmtPct(d.ela_prof)}</td>
                    <td className="r">{fmtPct(d.math_prof)}</td>
                    <td className="r">{fmtPct(d.flagged_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="ELA proficiency, four years" sub={`${scope.districtName} against the region and the state; other districts in gray`}>
          <TrendLines data={trendData} x="year" series={series} unit="%" height={250} />
          <SourceNote>PSSA ELA and Keystone Literature, percent proficient or advanced. PDE Future Ready PA Index data files 2021-22 to 2024-25.</SourceNote>
        </Card>
        <Card title="Regular attendance change since 2021-22" sub="Percentage-point change in students attending 90% of days or more, 2021-22 to 2024-25">
          <HBars data={change} cat="name" val="change" unit=" pts" emphasize={scope.districtName} domain={[-30, 15]} refValue={0} />
          <SourceNote>Statewide regular attendance: 82.2% (2021-22) → 79.6% (2024-25). Berwick's middle years show a reporting anomaly; lean on 2024-25.</SourceNote>
        </Card>
        <Card title="CSIU 16 vs. other IUs: student mental health" sub="PAYS, grades 6-12, 2019 to 2025 — a first look at a multi-IU view (Version D)" right={<Pill tone="brand">Regional</Pill>}>
          <TrendLines data={paysData} x="year" series={[{ key: "depressive", label: "Depressed or sad most days · CSIU 16", color: "#2a78d6", width: 2.5 }, { key: "depressiveOther", label: "Depressed or sad · all other IUs", color: "#9ec5f4", dashed: true }, { key: "ideation", label: "Seriously considered suicide · CSIU 16", color: "#eb6834", width: 2.5 }, { key: "ideationOther", label: "Seriously considered suicide · all other IUs", color: "#f4b9a5", dashed: true }]} unit="%" height={250} domain={[0, 50]} />
          <SourceNote>Runge & Knoster, CSIU 16 PAYS Cross-Sectional Trends 2019-2025 (Project AWARE IMPACT & MHAT), and the 2025 CSIU 16 PAYS profile report.</SourceNote>
        </Card>
      </div>
    </Page>
  );
}
