import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { boardSummary, boardActions, boardInvestments, boardMeetingLabel } from "@/lib/queries/board";
import { districtHeader } from "@/lib/queries/district";
import { Page, Card, Pill } from "@/components/ui";
import { fmtPct } from "@/lib/format";

function Question({ q, big, sub, status }: { q: string; big: string; sub: string; status: string }) {
  const ok = status === "On track";
  return (
    <div className="card card-pad flex flex-col">
      <div className="text-[15px] font-semibold leading-snug">{q}</div>
      <div className="hero mt-4">{big}</div>
      <div className="mt-2 text-[13px] leading-snug text-ink-2">{sub}</div>
      <div className="mt-auto pt-4"><Pill tone={ok ? "good" : "warn"} icon>{status}</Pill></div>
    </div>
  );
}

function Compare({ label, last, now, goodWhenUp = true, unit = "%" }: { label: string; last: number; now: number; goodWhenUp?: boolean; unit?: string }) {
  const diff = now - last; const good = goodWhenUp ? diff >= 0 : diff <= 0;
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between text-[13px]"><span className="font-semibold">{label}</span><span className={`font-semibold ${diff === 0 ? "text-ink-2" : good ? "text-good-text" : "text-critical-text"}`}>{diff === 0 ? "No change" : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} ${unit === "%" ? "points" : unit}`}</span></div>
      {[["Last year", last], ["This year", now]].map(([l, v]) => (
        <div key={String(l)} className="mt-1.5 flex items-center gap-3 text-[12.5px] text-ink-2"><span className="w-16">{l}</span><div className="bar-track flex-1"><div className="bar-fill" style={{ width: `${Math.min(100, Number(v))}%`, background: l === "This year" ? "#2a78d6" : "#c9d9ee" }} /></div><span className="num w-10 text-right">{v}{unit}</span></div>
      ))}
    </div>
  );
}

export default async function BoardPage() {
  const scope = await getScope();
  if (scope.role === "teacher" || scope.role === "student") redirect("/");
  const d = districtHeader(scope);
  const s = boardSummary(scope);
  const actions = boardActions(scope);
  const inv = boardInvestments(scope);
  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Board of School Directors · {boardMeetingLabel()} · {d.name} School District</div>
          <h1 className="h1">How are our students doing?</h1>
          <p className="sub mt-1 max-w-2xl">A plain-language summary of four questions the board asked us to track. Student-level details are never shown in this view.</p>
        </div>
        <a className="btn btn-primary" href="/api/report/board?format=pdf" target="_blank" rel="noopener">Download board packet (PDF)</a>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Question q="Are students coming to school?" big={`${s.attending}%`} sub="of students are attending regularly (missing less than 10% of days)." status={s.statuses.attending} />
        <Question q="Are students safe and well?" big={`${s.safe}%`} sub="of students report feeling safe and connected at school." status={s.statuses.safe} />
        <Question q="Are students learning?" big={`${s.onTrack}%`} sub="of students are on track on fall reading and math benchmarks." status={s.statuses.learning} />
        <Question q="Are behavior concerns going down?" big={`${Math.abs(s.refChange)}%`} sub={`${s.refChange <= 0 ? "fewer" : "more"} behavior referrals than at this point last year.`} status={s.statuses.behavior} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Compared with last year" sub="Same point in the school year">
          <div className="divide-y divide-grid">
            <Compare label="Students attending regularly" last={s.attendingLast} now={s.attending} />
            <Compare label="On track in reading and math" last={s.onTrackLast} now={s.onTrack} />
            <Compare label="Students feeling safe and connected" last={s.safeLast} now={s.safe} />
          </div>
        </Card>
        <Card title="What we're doing about it" sub="Actions the administration has started this year">
          <div className="space-y-3">
            {actions.map((a) => <div key={a.domain} className="text-[13.5px] leading-relaxed"><span className="font-semibold">{a.headline}.</span> <span className="text-ink-2">{a.detail}</span></div>)}
          </div>
        </Card>
      </div>

      <Card className="mt-5" title="Are our investments paying off?" sub="Students who received each support compared with similar students who did not">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {inv.map((r) => (
            <div key={r.program_id} className="rounded-lg border border-line bg-surface-2/50 p-4">
              <div className="text-[13.5px] font-semibold">{r.program.replace(/ \(Project AWARE\)/, "")}</div>
              <div className="hero mt-2 text-good-text">{r.improved_pct}%</div>
              <div className="mt-1 text-[12.5px] text-ink-2">of students improved, compared with {r.similar_untreated_pct}% of similar students without it</div>
              <div className="mt-3 text-[11.5px] text-ink-3">{r.students} students served · Funded by {r.funding}{r.funding === "Project AWARE" ? " grant" : r.funding === "District" ? " budget" : ""}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-5" title="State results, 2024-25" sub="From the Future Ready PA Index (real public data)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-center">
          {[["Regular attendance", s.real.regular, "PA 79.6%"], ["ELA proficient", s.real.ela, "PA 49.9%"], ["Math proficient", s.real.math, "PA 41.7%"], ["4-year graduation", s.real.grad, "PA 88.0%"]].map(([l, v, pa]) => (
            <div key={String(l)}><div className="eyebrow">{l}</div><div className="hero mt-2 !text-[28px]">{fmtPct(v as number | null)}</div><div className="mt-1 text-[12px] text-ink-3">{pa}</div></div>
          ))}
        </div>
      </Card>

      <p className="mt-6 text-[12px] text-ink-3">Data sources: PIMS, district student information system, Project AWARE{s.paysSafe !== null ? ", PAYS 2025" : ""}. Figures are summarized for the whole district; no individual student information appears in this report. Benchmark, wellness, and referral figures are synthetic sample data in this prototype.</p>
    </Page>
  );
}
