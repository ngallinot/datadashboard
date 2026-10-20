import { getScope } from "@/lib/scope";
import { PageHeader, Card } from "@/components/ui";

export default async function ReportsPage() {
  const scope = await getScope();
  return (
    <>
      <PageHeader title="Reports" sub="Meeting-ready exports. PDFs are rendered from the same queries as the screens, with page breaks that keep headings with their content." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Data-ready for the meeting" sub="District leadership team, MTSS, or budget meetings">
          <p className="text-[13px] text-ink-2">Overview KPIs, the three current insights, attendance and behavior summaries, what's working, and the student support list (IDs only).</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn btn-primary" href="/api/report/district?format=pdf" target="_blank" rel="noopener">Download PDF</a>
            <a className="btn" href="/api/report/district?format=csv">Download CSV bundle</a>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-3">The CSV bundle is a zip with one file per section (buildings, grades, supports, support list) for {scope.districtName}.</p>
        </Card>
        <Card title="Board packet" sub="Plain-language summary for the Board of School Directors" >
          <p id="board" className="text-[13px] text-ink-2">Four questions the board asked us to track, comparisons with last year, what the administration is doing, and whether investments are paying off. No student-level details.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn btn-primary" href="/api/report/board?format=pdf" target="_blank" rel="noopener">Download board packet (PDF)</a>
            <a className="btn" href="/board">Preview the board view</a>
          </div>
        </Card>
      </div>
    </>
  );
}
