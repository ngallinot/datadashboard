import { getScope } from "@/lib/scope";
import { paysForDistrict, paysRegion, wellnessByBuilding, sapSummary, nurseByReason, supportList, supportResults } from "@/lib/queries/district";
import { PageHeader, Card, SourceNote, Kpi, Pill, Empty } from "@/components/ui";
import { GroupedBars, VBars, HBars } from "@/components/charts";
import { SupportTable, WhatsWorking } from "@/components/district";
import { fmtPct, titleCase } from "@/lib/format";

const PAYS_KEY: [string, string][] = [["depressive_symptoms", "Depressed or sad most days"], ["seriously_considered_suicide", "Seriously considered suicide"], ["self_harm_past_year", "Self-harm, past year"], ["feel_safe_at_school", "Feel safe at school"], ["bullied_past_year", "Bullied, past year"], ["stayed_home_bullying", "Stayed home: bullying"], ["past30_vaping", "Vaped, past 30 days"], ["past30_alcohol", "Alcohol, past 30 days"], ["past30_marijuana", "Marijuana, past 30 days"]];

export default async function WellnessPage() {
  const scope = await getScope();
  const pays = paysForDistrict(scope);
  const region = paysRegion();
  const hasPays = pays.length > 0;
  const wb = wellnessByBuilding(scope);
  const sap = sapSummary(scope);
  const nurse = nurseByReason(scope);
  const wellRisk = supportList(scope, { limit: 8 }).filter((r) => r.factors.some((f) => f.domain === "wellness"));
  const works = supportResults(scope, 5).filter((w) => w.domain === "wellness");
  const g = (ind: string, grade = "all", sy = "2025-26") => pays.find((p) => p.indicator === ind && p.grade === grade && p.school_year === sy);
  const compare = PAYS_KEY.map(([k, label]) => ({ label, district: g(k)?.value ?? null, state: g(k)?.state_value ?? region.find((r) => r.indicator === k)?.state_value ?? null, iu: region.find((r) => r.indicator === k)?.value ?? null })).filter((r) => r.district !== null);
  const trendRows = ["2021-22", "2023-24", "2025-26"].map((sy) => ({ year: sy.slice(0, 4), depressive: g("depressive_symptoms", "all", sy)?.value ?? null, ideation: g("seriously_considered_suicide", "all", sy)?.value ?? null, vaping: g("past30_vaping", "all", sy)?.value ?? null }));
  const byGrade = ["6", "8", "10", "12"].map((gr) => ({ grade: `Grade ${gr}`, depressive: g("depressive_symptoms", gr)?.value ?? null, ideation: g("seriously_considered_suicide", gr)?.value ?? null, bullied: g("bullied_past_year", gr)?.value ?? null })).filter((r) => r.depressive !== null);
  const fallCur = wb.filter((w) => w.school_year === "2026-27" && w.window === "fall");
  const sapTotal = sap.find((s) => s.category === "total")?.count;
  const sapReasons = sap.filter((s) => s.category === "primary_reason" && s.count > 0).slice(0, 8);
  const n = g("depressive_symptoms")?.value;
  return (
    <>
      <PageHeader title="Wellness (Project AWARE)" sub="PAYS and SAP figures are real district reports; the universal wellness screener, check-ins, and nurse visits are synthetic." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Depressed or sad most days" value={fmtPct(n)} context={hasPays ? `PA ${fmtPct(g("depressive_symptoms")?.state_value)} · CSIU 16 ${fmtPct(region.find((r) => r.indicator === "depressive_symptoms")?.value)}` : "No PAYS report for this district"} source="PAYS 2025" />
        <Kpi label="Feel safe at school" value={fmtPct(g("feel_safe_at_school")?.value)} context={`PA ${fmtPct(g("feel_safe_at_school")?.state_value)}`} source="PAYS 2025" />
        <Kpi label="Screened high this fall" value={fmtPct(100 * fallCur.reduce((s, w) => s + w.high, 0) / Math.max(1, fallCur.reduce((s, w) => s + w.n, 0)))} context={`${fallCur.reduce((s, w) => s + w.high, 0)} students in grades 3-12`} source="AWARE screener" />
        <Kpi label="SAP cases 2025-26" value={sapTotal?.toLocaleString() ?? "—"} context={sapTotal ? `${sap.find((s) => s.category === "parent_permission" && s.item === "yes")?.count ?? "—"} with parent permission` : "No SAP report in Drive"} source="PDE SAP" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="PAYS 2025 vs. Pennsylvania" sub="Grades 6, 8, 10, 12 combined" right={hasPays ? <Pill tone="good">Real survey data</Pill> : <Pill tone="warn">Not available</Pill>}>
          {hasPays ? (
            <table className="tbl"><thead><tr><th>Indicator</th><th className="r">{scope.districtName}</th><th className="r">CSIU 16</th><th className="r">PA</th><th>vs. PA</th></tr></thead>
              <tbody>{compare.map((r) => { const good = r.label.startsWith("Feel safe"); const diff = r.district! - (r.state ?? 0); const worse = good ? diff < -2 : diff > 2; const better = good ? diff > 2 : diff < -2; return (
                <tr key={r.label}><td className="font-medium">{r.label}</td><td className="r font-semibold">{fmtPct(r.district)}</td><td className="r">{fmtPct(r.iu)}</td><td className="r">{fmtPct(r.state)}</td><td><Pill tone={worse ? "serious" : better ? "good" : "neutral"} icon>{diff > 0 ? "+" : ""}{diff.toFixed(1)} pts</Pill></td></tr>); })}</tbody></table>
          ) : <Empty>No PAYS profile report for {scope.districtName} was found in Drive. The regional figures are shown on the Regional view.</Empty>}
          <SourceNote>2025 Pennsylvania Youth Survey district profile report (PCCD / Bach Harrison). Grade 12 samples are small in several districts.</SourceNote>
        </Card>
        <Card title="PAYS by grade, 2025" sub="Depressive symptoms, suicidal ideation, and bullying victimization">
          {byGrade.length ? <GroupedBars data={byGrade} cat="grade" series={[{ key: "depressive", label: "Depressed or sad most days" }, { key: "ideation", label: "Seriously considered suicide" }, { key: "bullied", label: "Bullied, past year" }]} unit="%" height={240} /> : <Empty>No grade-level PAYS data.</Empty>}
          {trendRows.some((t) => t.depressive !== null) && <div className="mt-3 text-[12.5px] text-ink-2">District trend, depressive symptoms: {trendRows.filter((t) => t.depressive !== null).map((t) => `${t.year} ${fmtPct(t.depressive)}`).join(" → ")}</div>}
        </Card>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Universal screener by building" sub="Fall 2026, students in the high range">
          <HBars data={fallCur.map((w) => ({ building: w.building, v: Math.round(1000 * w.high / w.n) / 10 }))} cat="building" val="v" unit="%" />
        </Card>
        <Card title="Nurse visits by reason" sub="This year to date">
          <VBars data={nurse.map((r) => ({ reason: titleCase(r.reason), n: r.n, color: r.reason === "stomachache" || r.reason === "headache" ? "#eb6834" : "#2a78d6" }))} cat="reason" val="n" height={220} />
          <SourceNote>Stomachaches and headaches often track anxiety; the wellness insight card uses them as a corroborating signal.</SourceNote>
        </Card>
        <Card title="SAP referrals by primary reason" sub="2025-26 district summary" right={sap.length ? <Pill tone="good">Real</Pill> : undefined}>
          {sapReasons.length ? <HBars data={sapReasons.map((s) => ({ reason: titleCase(s.item).replace("Suicide Ideation Gesture Attempt", "Suicide-related"), n: s.count }))} cat="reason" val="n" unit="" /> : <Empty>No SAP summary for this district in Drive.</Empty>}
        </Card>
      </div>
      {works.length > 0 && <Card className="mt-5" title="What's working for wellness" sub="Completed 2025-26 supports vs. similar students without support"><WhatsWorking rows={works} /></Card>}
      <Card className="mt-5" title="Students with wellness as a leading factor"><SupportTable rows={wellRisk} /></Card>
    </>
  );
}
