import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { studentProfile, attendanceDetail, gradesDetail, benchmarks, progressMonitoring, timeline, recommendedStrategies, activeSupportNames, strengths } from "@/lib/queries/student";
import { Page, Card, Pill } from "@/components/ui";
import { VBars, TrendLines } from "@/components/charts";
import { fmtDate, gradeLabel } from "@/lib/format";

const timeLabel = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "p.m." : "a.m."}`; };
const LETTER_RANK: Record<string, number> = { "A+": 12, A: 11, "A-": 10, "B+": 9, B: 8, "B-": 7, "C+": 6, C: 5, "C-": 4, "D+": 3, D: 2, "D-": 1, F: 0 };
const changeText = (a: string, b: string) => { const d = LETTER_RANK[a] - LETTER_RANK[b]; if (d >= 3) return [`Down ${Math.round(d / 3)} grade${d >= 6 ? "s" : ""}`, "text-critical-text"]; if (d >= 1) return ["Down slightly", "text-warn-text"]; if (d <= -3) return ["Up", "text-good-text"]; if (d === 0) return ["No change", "text-ink-2"]; return ["About the same", "text-ink-2"]; };

export default async function StudentPage({ params }: PageProps<"/student/[id]">) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  const scope = await getScope();
  if (scope.role === "board") redirect("/board");
  const s = studentProfile(scope, id);
  if (!s) notFound();
  const att = attendanceDetail(id);
  const grades = gradesDetail(id);
  const bm = benchmarks(id);
  const pm = progressMonitoring(id);
  const tl = timeline(id);
  const factors = JSON.parse(s.factors_json) as { factor: string; weight: string; detail: string; domain: string }[];
  const active = activeSupportNames(id);
  const strat = recommendedStrategies(scope, id, factors, active);
  const str = strengths(id, JSON.parse(s.strengths_json));
  const fallRead = bm.filter((b) => b.subject === "reading" && b.school_year === "2026-27")[0];
  const fallMath = bm.filter((b) => b.subject === "math" && b.school_year === "2026-27")[0];
  const benchLabel = (b?: { benchmark: string }) => b ? ({ above: "Above", on_track: "On track", approaching: "Approaching", below: "Below" } as Record<string, string>)[b.benchmark] : "—";
  const mondays = att.byDow.find((d) => d.dow === "Mon")?.n ?? 0;
  const pmSubject = pm[0]?.subject;
  const pmData = pm.filter((p) => p.subject === pmSubject).map((p) => ({ date: fmtDate(p.date), score: p.score, goal: p.goal }));
  const back = scope.role === "teacher" ? { href: "/teacher", label: `Back to ${s.classroom}` } : { href: "/district/students", label: "Back to student support list" };
  const initials = `${s.first_name[0]}${s.last_name[0]}`;
  const levelTone = s.level === "high" ? "critical" : s.level === "moderate" ? "serious" : s.level === "watch" ? "warn" : "good";
  const levelText = s.level === "high" ? "High: no plan yet" : s.level === "moderate" ? "Moderate" : s.level === "watch" ? "Watch" : "Low";
  const levelPill = s.support_level ? <Pill tone="critical">{s.support_level}</Pill> : <Pill tone={levelTone}>{levelText}</Pill>;
  const meeting = s.next_meeting ? `${fmtDate(s.next_meeting)}, ${timeLabel(s.next_meeting.slice(11, 16))}` : "Not scheduled";
  return (
    <Page>
      <Link href={back.href} className="link text-[13px]">← {back.label}</Link>
      <div className="card card-pad mt-3 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-[18px] font-bold text-brand-700">{initials}</div>
          <div>
            <h1 className="h1">{s.first_name} {s.last_name[0]}.</h1>
            <div className="sub mt-0.5">Grade {gradeLabel(s.grade)} · {s.classroom} · {s.building} · Student ID {s.id}{s.iep ? " · IEP" : ""}{s.el ? " · EL" : ""}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-8 text-[12.5px]">
          <div><div className="eyebrow">Support level</div><div className="mt-1">{levelPill}</div></div>
          <div><div className="eyebrow">Case lead</div><div className="mt-1 font-medium">{s.case_lead ?? "Not assigned"}</div></div>
          <div><div className="eyebrow">Next team meeting</div><div className="mt-1 font-medium">{meeting}</div></div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={`Why ${s.first_name} was flagged`} sub="The factors the model weighed most, in plain language">
          <div className="space-y-4">
            {factors.slice(0, 4).map((f) => (
              <div key={f.factor} className="flex gap-3">
                <span className={`pill mt-0.5 h-fit shrink-0 ${f.weight === "strong" ? "pill-critical" : "pill-neutral"}`}>{f.weight === "strong" ? "Strong" : "Some"}</span>
                <div><div className="text-[14px] font-semibold">{f.factor}</div><div className="mt-0.5 text-[13px] text-ink-2">{f.detail}</div></div>
              </div>
            ))}
            {!factors.length && <div className="text-[13px] text-ink-3">No risk factors at this time.</div>}
          </div>
          <div className="mt-4 text-[11.5px] text-ink-3">Early-warning score {Math.round(s.score)} of 100{s.flagged_date ? ` · flagged ${fmtDate(s.flagged_date)}` : ""}. Points come from attendance, behavior, course grades, benchmark screeners, and wellness screening.</div>
        </Card>
        <Card title="Strengths to build on" sub="From teacher input and records">
          <ul className="space-y-2.5">{str.map((x) => <li key={x} className="flex gap-2.5 text-[13.5px]"><span className="mt-0.5 text-good">✓</span>{x}</li>)}</ul>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Attendance" sub={`${att.total} days missed so far (last year at this time: ${att.priorAtSameTime})${att.tardies ? ` · ${att.tardies} tardies` : ""}`}>
          <div className="eyebrow mb-1">Days missed by month</div>
          <VBars data={att.byMonth} cat="month" val="n" height={150} />
          <div className="eyebrow mt-3 mb-1">Which days</div>
          <div className="grid grid-cols-5 gap-2">{att.byDow.map((d) => <div key={d.dow} className={`rounded-lg border p-2 text-center ${d.n >= 3 && d.dow === "Mon" ? "border-serious bg-serious-100" : "border-line"}`}><div className="text-[11px] text-ink-3">{d.dow}</div><div className="text-[18px] font-semibold">{d.n}</div></div>)}</div>
          {mondays >= 3 && <div className="mt-2 text-[12.5px] text-ink-2">{mondays} of {att.total} absences fell on a Monday.</div>}
        </Card>
        <Card title="Grades and benchmarks" sub="Current grades compared with the start of the year">
          <table className="tbl"><thead><tr><th>Subject</th><th>September</th><th>Now</th><th>Change</th></tr></thead>
            <tbody>{grades.map((g) => { const [t, cls] = changeText(g.mp1, g.now); return <tr key={g.subject}><td className="font-medium">{g.subject === "ELA" ? "English Language Arts" : g.subject}</td><td>{g.mp1}</td><td className="font-semibold">{g.now}</td><td className={`font-medium ${cls}`}>{t}</td></tr>; })}</tbody></table>
          {(fallRead || fallMath) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-3"><div className="eyebrow">Fall reading benchmark</div><div className={`mt-1 text-[14px] font-semibold ${fallRead?.benchmark === "below" ? "text-critical-text" : fallRead?.benchmark === "approaching" ? "text-warn-text" : "text-good-text"}`}>{benchLabel(fallRead)}</div><div className="text-[11.5px] text-ink-3">{fallRead ? `${fallRead.tool} · ${fallRead.measure} ${fallRead.score} · ${fallRead.percentile}th pctl` : ""}</div></div>
              <div className="rounded-lg border border-line p-3"><div className="eyebrow">Fall math benchmark</div><div className={`mt-1 text-[14px] font-semibold ${fallMath?.benchmark === "below" ? "text-critical-text" : fallMath?.benchmark === "approaching" ? "text-warn-text" : "text-good-text"}`}>{benchLabel(fallMath)}{fallMath?.benchmark === "below" ? ": ratios, unit rates" : ""}</div><div className="text-[11.5px] text-ink-3">{fallMath ? `${fallMath.tool} · ${fallMath.percentile}th pctl` : ""}</div></div>
            </div>
          )}
          {pmData.length > 1 && (
            <div className="mt-4"><div className="eyebrow mb-1">Progress monitoring · {pmSubject} ({pm[0].measure})</div><TrendLines data={pmData} x="date" series={[{ key: "score", label: "Score", color: "#2a78d6" }, { key: "goal", label: "Goal", color: "#7c8792", dashed: true }]} height={150} /></div>
          )}
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="What has helped similar students" sub={`Based on regional students with a similar pattern. The team decides what fits ${s.first_name}.`}>
          <div className="space-y-3">
            {strat.map((x) => (
              <div key={x.program} className="flex items-center justify-between gap-4 rounded-lg border border-line p-3">
                <div><div className="text-[14px] font-semibold">{x.program}</div><div className="text-[12.5px] text-ink-2">{x.note}</div></div>
                <div className="shrink-0 text-right"><div className="text-[22px] font-bold leading-none text-good-text">{x.improved_pct}%</div><div className="text-[11px] text-ink-3">improved</div><div className="text-[11px] text-ink-3">vs. {x.similar_untreated_pct ?? "—"}% without</div></div>
              </div>
            ))}
            {!strat.length && <div className="text-[13px] text-ink-3">No comparable supports with enough students to report.</div>}
          </div>
          <p className="mt-3 text-[11.5px] text-ink-3">Comparison group: students in the same grade band with the same baseline who received no support in that domain. Predictions support professional judgment; they do not replace it.</p>
        </Card>
        <Card title="Supports and contacts" sub="Most recent first" right={<button className="btn btn-sm" type="button">Add a note or contact</button>}>
          <ol className="space-y-3">
            {tl.map((t, i) => (
              <li key={i} className="flex gap-4 text-[13px]"><div className="w-16 shrink-0 text-ink-3">{t.kind === "history" ? t.date : fmtDate(t.date)}</div><div><div className="font-semibold">{t.title}</div>{t.detail && <div className="text-ink-2">{t.detail}</div>}</div></li>
            ))}
          </ol>
        </Card>
      </div>

      <p className="mt-6 text-[12px] text-ink-3">Access to this page is limited to staff working directly with this student and is logged. This is a fictional student; all details are synthetic sample data. Predictions support professional judgment; they do not replace it.</p>
    </Page>
  );
}
