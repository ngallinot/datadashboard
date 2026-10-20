import { getScope } from "@/lib/scope";
import { referralsBreakdown, buildings, supportList, supportResults } from "@/lib/queries/district";
import { PageHeader, Card, SourceNote, Kpi } from "@/components/ui";
import { VBars, HBars, TrendLines } from "@/components/charts";
import { SupportTable, WhatsWorking } from "@/components/district";
import { fmtDate, fmtNum, titleCase } from "@/lib/format";

export default async function BehaviorPage() {
  const scope = await getScope();
  const b = referralsBreakdown(scope);
  const bl = buildings(scope);
  const total = b.category.reduce((s, r) => s + r.n, 0);
  const afterLunch = b.time.find((t) => t.k === "after lunch")?.n ?? 0;
  const behRisk = supportList(scope, { limit: 8 }).filter((r) => r.factors.some((f) => f.domain === "behavior"));
  const works = supportResults(scope, 5).filter((w) => w.domain === "behavior");
  return (
    <>
      <PageHeader title="Behavior" sub="Office discipline referrals from the SIS this year (synthetic). PBIS and Check-In/Check-Out results are on the Interventions tab." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Referrals year to date" value={fmtNum(total)} context={`${fmtNum(b.repeat.total_students_referred)} students referred`} source="SIS" />
        <Kpi label="Students with 3+ referrals" value={fmtNum(b.repeat.students_with_3plus)} context="Tier 2 trigger used in most PBIS schools" source="SIS" />
        <Kpi label="After-lunch share" value={`${Math.round(100 * afterLunch / Math.max(1, total))}%`} context="of referrals during the after-lunch transition" source="SIS" />
        <Kpi label="Minor vs. major" value={`${Math.round(100 * (b.category.filter((c) => c.k !== "physical").reduce((s, c) => s + c.n, 0)) / Math.max(1, total))}%`} context="classroom-managed minors" source="SIS" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="By time of day"><VBars data={b.time.map((t) => ({ time: titleCase(t.k), n: t.n, color: t.k === "after lunch" ? "#eb6834" : "#2a78d6" }))} cat="time" val="n" height={220} /></Card>
        <Card title="By location"><HBars data={b.location.map((t) => ({ location: titleCase(t.k), n: t.n }))} cat="location" val="n" unit="" /></Card>
        <Card title="By category"><HBars data={b.category.map((t) => ({ category: titleCase(t.k), n: t.n }))} cat="category" val="n" unit="" /></Card>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Referrals per week" sub="Weeks starting Monday">
          <TrendLines data={b.weekly.map((w) => ({ week: fmtDate(w.week), n: w.n }))} x="week" series={[{ key: "n", label: "Referrals", color: "#2a78d6" }]} height={220} />
        </Card>
        <Card title="Referrals per 100 students, by building">
          <HBars data={bl.map((x) => ({ building: x.name, v: x.referrals_per_100 }))} cat="building" val="v" unit="" />
          <SourceNote>Middle and secondary buildings run higher; compare within level, not across.</SourceNote>
        </Card>
      </div>
      {works.length > 0 && <Card className="mt-5" title="What's working for behavior" sub="Completed 2025-26 supports vs. similar students without support"><WhatsWorking rows={works} /></Card>}
      <Card className="mt-5" title="Students with behavior as a leading factor"><SupportTable rows={behRisk} /></Card>
    </>
  );
}
