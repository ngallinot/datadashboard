import { getScope } from "@/lib/scope";
import { boardSummary, boardActions, boardInvestments, boardMeetingLabel } from "@/lib/queries/board";
import { districtHeader } from "@/lib/queries/district";
import { fmtPct, fmtDateLong } from "@/lib/format";
import { meta } from "@/lib/db";

function Q({ q, big, sub, status }: { q: string; big: string; sub: string; status: string }) {
  return (
    <div className="q"><div style={{ fontWeight: 700, fontSize: 12.5 }}>{q}</div><div className="big">{big}</div><div style={{ color: "#4b5560" }}>{sub}</div><span className={`status ${status === "On track" ? "ok" : "warn"}`}>{status === "On track" ? "✓ On track" : "! Needs attention"}</span></div>
  );
}
function Cmp({ label, last, now, goodWhenUp = true }: { label: string; last: number; now: number; goodWhenUp?: boolean }) {
    const diff = now - last; const good = goodWhenUp ? diff >= 0 : diff <= 0;
    return (
      <div style={{ padding: "7px 0", borderBottom: "1px solid #e6e7e2", breakInside: "avoid" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><b>{label}</b><b style={{ color: diff === 0 ? "#4b5560" : good ? "#006300" : "#9c1f1f" }}>{diff === 0 ? "No change" : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} points`}</b></div>
        {[["Last year", last, "#c9d9ee"], ["This year", now, "#2a78d6"]].map(([l, v, c]) => <div key={String(l)} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, color: "#4b5560" }}><span style={{ width: 56 }}>{l}</span><div className="bar" style={{ flex: 1 }}><div style={{ width: `${v}%`, background: String(c) }} /></div><span className="r" style={{ width: 32 }}>{v}%</span></div>)}
      </div>
    );
  };

export default async function PrintBoard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope({ ...sp, role: "board" });
  const d = districtHeader(scope);
  const s = boardSummary(scope);
  const actions = boardActions(scope);
  const inv = boardInvestments(scope);
  return (
    <div className="report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><div className="muted" style={{ letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 600 }}>Board of School Directors · {boardMeetingLabel()}</div><h1>How are our students doing?</h1><div style={{ color: "#4b5560", marginTop: 2 }}>{d.name} School District · {d.county} County · {scope.schoolYear}</div></div>
        <div className="muted" style={{ textAlign: "right" }}>CSIU District Insights<br />Prepared {fmtDateLong(meta("as_of"))}</div>
      </div>
      <div className="banner">Prototype — sample data. District and state figures are real public data; benchmark, wellness, and referral figures are synthetic.</div>
      <p className="lead" style={{ marginTop: 10 }}>A plain-language summary of four questions the board asked us to track. Student-level details are never shown in this report.</p>

      <div className="sec"><div className="kpis" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <Q q="Are students coming to school?" big={`${s.attending}%`} sub="of students are attending regularly (missing less than 10% of days)." status={s.statuses.attending} />
        <Q q="Are students safe and well?" big={`${s.safe}%`} sub="of students report feeling safe and connected at school." status={s.statuses.safe} />
        <Q q="Are students learning?" big={`${s.onTrack}%`} sub="of students are on track on fall reading and math benchmarks." status={s.statuses.learning} />
        <Q q="Are behavior concerns going down?" big={`${Math.abs(s.refChange)}%`} sub={`${s.refChange <= 0 ? "fewer" : "more"} behavior referrals than at this point last year.`} status={s.statuses.behavior} />
      </div></div>

      <div className="sec grid2">
        <div className="card"><h2>Compared with last year</h2><p className="lead">Same point in the school year</p>
          <Cmp label="Students attending regularly" last={s.attendingLast} now={s.attending} />
          <Cmp label="On track in reading and math" last={s.onTrackLast} now={s.onTrack} />
          <Cmp label="Students feeling safe and connected" last={s.safeLast} now={s.safe} />
        </div>
        <div className="card"><h2>What we're doing about it</h2><p className="lead">Actions the administration has started this year</p>
          {actions.map((a) => <p key={a.domain} style={{ margin: "0 0 8px" }}><b>{a.headline}.</b> <span style={{ color: "#4b5560" }}>{a.detail}</span></p>)}
        </div>
      </div>

      <div className="sec"><h2>Are our investments paying off?</h2><p className="lead">Students who received each support compared with similar students who did not</p>
        <div className="grid3">
          {inv.map((r) => <div key={r.program_id} className="card"><div style={{ fontWeight: 700 }}>{r.program.replace(/ \(Project AWARE\)/, "")}</div><div style={{ fontSize: 26, fontWeight: 700, color: "#006300", margin: "4px 0" }}>{r.improved_pct}%</div><div style={{ color: "#4b5560" }}>of students improved, compared with {r.similar_untreated_pct}% of similar students without it</div><div className="muted" style={{ marginTop: 6 }}>{r.students} students served · Funded by {r.funding}</div></div>)}
        </div>
      </div>

      <div className="sec"><h2>State results, 2024-25</h2><p className="lead">From the Future Ready PA Index (real public data)</p>
        <div className="kpis">
          {[["Regular attendance", s.real.regular, "PA 79.6%"], ["ELA proficient", s.real.ela, "PA 49.9%"], ["Math proficient", s.real.math, "PA 41.7%"], ["4-year graduation", s.real.grad, "PA 88.0%"]].map(([l, v, pa]) => <div key={String(l)} className="kpi"><div className="l">{l}</div><div className="v">{fmtPct(v as number | null)}</div><div className="c">{pa}</div></div>)}
        </div>
      </div>

      <div className="footer">Data sources: PIMS, district student information system, Project AWARE{s.paysSafe !== null ? ", PAYS 2025" : ""}. Figures are summarized for the whole district; no individual student information appears in this report. District data remains the property of the district and is protected under FERPA.</div>
    </div>
  );
}
