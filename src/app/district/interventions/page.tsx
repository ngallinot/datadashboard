import { getScope } from "@/lib/scope";
import { supportResults, activeSupports, supportsByDomain } from "@/lib/queries/district";
import { PageHeader, Card, SourceNote, Kpi } from "@/components/ui";
import { GroupedBars } from "@/components/charts";
import { WhatsWorking } from "@/components/district";
import { titleCase } from "@/lib/format";

export default async function InterventionsPage() {
  const scope = await getScope();
  const works = supportResults(scope, 5);
  const active = activeSupports(scope);
  const dom = supportsByDomain(scope);
  const totalActive = active.reduce((s, a) => s + a.active, 0);
  const earlyShare = Math.round(active.reduce((s, a) => s + a.early_share * a.active, 0) / Math.max(1, totalActive));
  const timing = works.filter((w) => w.early_pct !== null && w.late_pct !== null && w.students >= 15).map((w) => ({ program: w.program.replace(/ \(.*\)/, ""), early: w.early_pct, late: w.late_pct, none: w.similar_untreated_pct }));
  return (
    <>
      <PageHeader title="Interventions" sub="Implementation data: what was delivered, how quickly, with what fidelity, and what happened next. All student-level records are synthetic." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Active supports" value={totalActive.toLocaleString()} context={`${active.length} programs in use this fall`} source="SIS / AWARE" />
        <Kpi label="Started within 2 weeks" value={`${earlyShare}%`} context="of this year's supports" source="Implementation log" />
        <Kpi label="Completed last year" value={dom.reduce((s, d) => s + d.completed, 0).toLocaleString()} context="episodes with before/after outcomes" source="Implementation log" />
        <Kpi label="Improved overall" value={`${Math.round(dom.reduce((s, d) => s + d.improved_pct * d.completed, 0) / Math.max(1, dom.reduce((s, d) => s + d.completed, 0)))}%`} context="vs. ~36% of similar students without support" source="Model" />
      </div>
      <Card className="mt-5" title="What's working: all supports" sub="Students who received each support compared with similar students who did not (same domain, same baseline)">
        <WhatsWorking rows={works} />
        <SourceNote>Evidence labels: Strong = 50+ students and 15+ point difference; Moderate = 20+ students and 8+ points; Early = fewer than 20 students. These are descriptive comparisons, not causal estimates.</SourceNote>
      </Card>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Does starting early matter?" sub="Percent improved by start timing">
          <GroupedBars data={timing} cat="program" series={[{ key: "early", label: "Started within 2 weeks", color: "#1baf7a" }, { key: "late", label: "Started later", color: "#2a78d6" }, { key: "none", label: "No support", color: "#c3c2b7" }]} unit="%" height={300} />
        </Card>
        <Card title="Active supports this fall" sub="Where the time from flag to start is slipping">
          <table className="tbl"><thead><tr><th>Support</th><th className="r">Active</th><th className="r">Avg days to start</th><th className="r">Started early</th><th className="r">Fidelity</th></tr></thead>
            <tbody>{active.map((a) => <tr key={a.program}><td><div className="font-medium">{a.program}</div><div className="text-[11px] text-ink-3">{titleCase(a.domain)} · {a.provider}</div></td><td className="r">{a.active}</td><td className={`r ${a.avg_days_to_start > 14 ? "text-critical-text font-semibold" : ""}`}>{a.avg_days_to_start}</td><td className="r">{a.early_share}%</td><td className="r">{Math.round(a.avg_fidelity * 100)}%</td></tr>)}</tbody></table>
        </Card>
      </div>
    </>
  );
}
