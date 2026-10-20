import Link from "next/link";
import { getScope } from "@/lib/scope";
import { overviewKpis, insights, chronicProjection, buildings, supportResults, supportList } from "@/lib/queries/district";
import { PageHeader, Card, Kpi, SourceNote, Delta } from "@/components/ui";
import { InsightCard, WhatsWorking, SupportTable } from "@/components/district";
import { ProjectionChart } from "@/components/charts";
import { fmtNum, fmtPct } from "@/lib/format";

export default async function DistrictOverview() {
  const scope = await getScope();
  const k = overviewKpis(scope);
  const cards = insights(scope);
  const proj = chronicProjection(scope);
  const bl = buildings(scope);
  const works = supportResults(scope, 10).slice(0, 5);
  const list = supportList(scope, { limit: 6 });
  const enrollDelta = k.enrollmentPrev ? Math.round(1000 * (k.enrollment - k.enrollmentPrev) / k.enrollmentPrev) / 10 : null;
  const refDelta = k.priorRefs ? Math.round(100 * (k.referrals - k.priorRefs) / k.priorRefs) : null;
  const maxFlag = Math.max(...bl.map((b) => b.flagged_pct), 1);
  return (
    <>
      <PageHeader title="District Overview" actions={<><Link href="/district/reports" className="btn">Export data</Link><Link href="/district/reports#board" className="btn btn-primary">Create board report</Link></>} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Enrollment" value={fmtNum(k.enrollment)} delta={enrollDelta !== null ? <Delta value={enrollDelta} unit="%" /> : undefined} context="from last year" source="PDE 2024-25" />
        <Kpi label="Chronic absence" value={fmtPct(k.chronicPct)} delta={<Delta value={k.chronicPct - k.threeYearChronicOct} goodWhenPositive={false} />} context="vs. 3-year average at this point" source="SIS · to date" />
        <Kpi label="Students flagged for support" value={fmtNum(k.flagged)} context={`${fmtPct(100 * k.flagged / k.students)} of enrollment · ${k.high} high`} source="Model" href="/district/students" />
        <Kpi label="Behavior referrals (year to date)" value={fmtNum(k.referrals)} delta={refDelta !== null ? <Delta value={refDelta} unit="%" goodWhenPositive={false} digits={0} /> : undefined} context="from this time last year" source="SIS" href="/district/behavior" />
      </div>

      <Card className="mt-5" title="What the model is seeing" sub="Patterns compared to this district's 3-year history and similar districts in the region">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{cards.map((c) => <InsightCard key={c.domain} i={c} />)}</div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Chronic absence: early warning" sub="Percent of students missing 10% or more of days, with the model's projection">
          <ProjectionChart data={proj.data} height={230} />
          <div className="mt-1 flex gap-4 text-[12.5px] text-ink-2"><span><b className="text-ink">{fmtPct(proj.now)}</b> now</span><span><b className="text-ink">{fmtPct(proj.projectedEnd)}</b> projected by June</span><span><b className="text-ink">{fmtPct(proj.threeYearNow)}</b> 3-yr avg at this point</span></div>
          <SourceNote>Projection applies last year's October-to-June ratio to this October. Prior-year monthly series are synthetic but anchored to each building's real year-end rate (PDE).</SourceNote>
        </Card>
        <Card title="Students flagged for support, by building" sub="Share of enrolled students with two or more risk indicators">
          <div className="space-y-3">
            {bl.map((b) => (
              <div key={b.id}>
                <div className="mb-1 flex items-center justify-between text-[13px]"><Link href={`/district/students?building=${b.id}`} className="font-medium hover:underline">{b.name}</Link><span className="num text-ink-2">{fmtPct(b.flagged_pct)} · {b.flagged} students</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${100 * b.flagged_pct / maxFlag}%`, background: b.flagged_pct >= 15 ? "#ec835a" : "#2a78d6" }} /></div>
              </div>
            ))}
          </div>
          <SourceNote>Indicators include attendance, behavior referrals, course performance, benchmark screeners, and wellness screening results.</SourceNote>
        </Card>
      </div>

      <Card className="mt-5" title="What's working: intervention results" sub="Students who received each support compared with similar students who did not" right={<span className="pill pill-brand">Uses implementation data</span>}>
        <WhatsWorking rows={works} compact />
        <div className="mt-2 text-right"><Link href="/district/interventions" className="link text-[12.5px]">All supports and timing →</Link></div>
      </Card>

      <Card className="mt-5" title="Student support list" sub="Visible only to authorized staff. Names are hidden on this view." right={<Link href="/district/students" className="btn btn-sm">Full list</Link>}>
        <SupportTable rows={list} />
      </Card>
    </>
  );
}
