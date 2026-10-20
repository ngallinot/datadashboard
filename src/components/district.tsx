import Link from "next/link";
import { Pill, type Tone } from "./ui";
import type { Insight, SupportListRow, SupportResult } from "@/lib/queries/district";

const DOMAIN_LABEL: Record<Insight["domain"], string> = { attendance: "Attendance", wellness: "Wellness", interventions: "Interventions", academics: "Academics", behavior: "Behavior" };

export function InsightCard({ i }: { i: Insight }) {
  const tone: Tone = i.confidence === "High" ? "brand" : i.confidence === "Medium" ? "neutral" : "neutral";
  return (
    <article className="card card-pad flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <Pill tone="neutral">{DOMAIN_LABEL[i.domain]}</Pill>
        <span className={`text-[11.5px] font-semibold ${i.confidence === "High" ? "text-good-text" : i.confidence === "Medium" ? "text-warn-text" : "text-ink-3"}`}>Confidence: {i.confidence}</span>
      </div>
      <h3 className="h3 mt-3 text-[15px] leading-snug">{i.link ? <Link href={i.link} className="hover:underline">{i.title}</Link> : i.title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{i.body}</p>
      <p className="mt-3 text-[13px]"><span className="font-semibold">Suggested next step:</span> {i.nextStep}</p>
      <div className="mt-auto pt-3"><span className={`pill pill-${tone}`}>{i.service}</span></div>
    </article>
  );
}

export function EvidencePill({ e }: { e: string }) {
  const tone: Tone = e === "Strong" ? "good" : e === "Moderate" ? "brand" : e.startsWith("Early") ? "warn" : "neutral";
  return <Pill tone={tone}>{e}</Pill>;
}

export function WhatsWorking({ rows, compact }: { rows: SupportResult[]; compact?: boolean }) {
  return (
    <table className="tbl">
      <thead><tr><th>Support</th><th className="r">Students</th><th className="r">Improved</th><th className="r">Similar students, no support</th>{!compact && <th className="r">Started early / late</th>}<th>Evidence</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.program_id}>
            <td><div className="font-medium">{r.program}</div><div className="text-[11px] text-ink-3">{r.domain} · funded by {r.funding}</div></td>
            <td className="r">{r.students}</td>
            <td className="r font-semibold text-good-text">{r.improved_pct}%</td>
            <td className="r">{r.similar_untreated_pct ?? "—"}%</td>
            {!compact && <td className="r">{r.early_pct ?? "—"}% / {r.late_pct ?? "—"}%</td>}
            <td><EvidencePill e={r.evidence} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RiskPill({ level }: { level: string }) {
  const tone: Tone = level === "high" ? "critical" : level === "moderate" ? "serious" : level === "watch" ? "warn" : "good";
  return <Pill tone={tone} icon>{level === "high" ? "High" : level === "moderate" ? "Moderate" : level === "watch" ? "Watch" : "Low"}</Pill>;
}

export function SupportTable({ rows, showBuilding = true, linkStudents = true }: { rows: SupportListRow[]; showBuilding?: boolean; linkStudents?: boolean }) {
  return (
    <table className="tbl">
      <thead><tr><th>Student</th><th className="r">Grade</th>{showBuilding && <th>Building</th>}<th>Risk</th><th>Main factors</th><th>Current supports</th><th>Suggested next step</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap">{linkStudents ? <Link className="link" href={`/student/${r.id}`}>{r.label}</Link> : r.label}</td>
            <td className="r">{r.grade === 0 ? "K" : r.grade}</td>
            {showBuilding && <td className="text-ink-2">{r.building}</td>}
            <td><RiskPill level={r.level} /></td>
            <td className="text-ink-2">{r.factors.slice(0, 2).map((f) => f.factor).join(", ") || "—"}</td>
            <td className="text-ink-2">{r.supports ?? "None"}</td>
            <td>{r.next_step}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} className="text-center text-ink-3">No students match.</td></tr>}
      </tbody>
    </table>
  );
}
