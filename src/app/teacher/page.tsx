import Link from "next/link";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { classroomInfo, roster, checkIns, classStrategies, classKpis, classroomsForDistrict } from "@/lib/queries/teacher";
import { Page, Card, Kpi, Pill, type Tone } from "@/components/ui";
import { ClassroomSelect } from "@/components/ClassroomSelect";

const tone = (v: string | null): Tone => v === "Above" ? "good" : v === "On track" ? "good" : v === "Approaching" ? "warn" : v === "Below" ? "critical" : "neutral";

export default async function TeacherPage({ searchParams }: PageProps<"/teacher">) {
  const sp = await searchParams;
  const scope = await getScope(sp);
  if (scope.role !== "teacher") redirect(`/api/session?role=teacher&next=${encodeURIComponent("/teacher")}`);
  const c = classroomInfo(scope);
  const rows = roster(scope);
  const ci = checkIns(rows);
  const strategies = classStrategies(scope, rows);
  const k = classKpis(scope, rows);
  const rooms = classroomsForDistrict(scope);
  const showAll = sp.all === "1";
  const shown = showAll ? rows : rows.slice(0, 8);
  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">{c.building} · {scope.schoolYear}</div>
          <h1 className="h1">Good morning, {c.teacher_first[0] === c.teacher_first[0].toUpperCase() ? "" : ""}{c.teacher_last.length > 0 ? `${c.teacher_first} ${c.teacher_last}` : c.teacher_last}</h1>
          <div className="sub mt-1">Grade {c.grade === 0 ? "K" : c.grade} · {c.name} · {c.students} students · You see only students on your rosters</div>
        </div>
        <ClassroomSelect rooms={rooms} value={c.id} />
      </div>

      <Card title="Check in with these students this week" sub="Students whose patterns changed recently">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ci.map((x) => (
            <div key={x.id} className="rounded-lg border border-line p-4">
              <div className="flex items-center justify-between"><Link href={`/student/${x.id}`} className="text-[15px] font-semibold hover:underline">{x.label}</Link><Pill tone={x.domain === "Attendance" ? "brand" : x.domain === "Wellness" ? "serious" : x.domain === "Behavior" ? "warn" : "neutral"}>{x.domain}</Pill></div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{x.what}</p>
              <p className="mt-2 text-[13px]"><span className="font-semibold">Try:</span> {x.try}</p>
            </div>
          ))}
          {!ci.length && <div className="text-[13px] text-ink-3">No recent pattern changes on this roster.</div>}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Attendance this month" value={`${k.attendance}%`} context={`School average: ${k.schoolAttendance}%`} />
        <Kpi label="On track in reading" value={k.hasScreeners ? `${k.readingOn} of ${rows.length}` : "—"} context={k.hasScreeners ? "Fall benchmark" : "No benchmark for this grade"} />
        <Kpi label="On track in math" value={k.hasScreeners ? `${k.mathOn} of ${rows.length}` : "—"} context={k.hasScreeners ? "Fall benchmark" : "No benchmark for this grade"} />
        <Kpi label="Receiving extra support" value={`${k.supported} students`} context="CICO, counseling, or intervention" />
      </div>

      <Card className="mt-5" title="My class at a glance" sub="Select a student to open their profile" right={<div className="flex gap-1.5 text-[11.5px]"><Pill tone="good">On track</Pill><Pill tone="warn">Watch</Pill><Pill tone="critical">Concern</Pill></div>}>
        <table className="tbl">
          <thead><tr><th>Student</th><th>Attendance</th><th>Reading</th><th>Math</th><th>Wellness check-in</th><th>Behavior</th><th>Supports</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/student/${r.id}`} className="link">{r.label}</Link></td>
                <td><span className={`font-medium ${r.days_missed >= 6 ? "text-critical-text" : r.days_missed >= 3 ? "text-warn-text" : ""}`}>{r.days_missed} day{r.days_missed === 1 ? "" : "s"} missed</span></td>
                <td>{r.reading ? <Pill tone={tone(r.reading)}>{r.reading}</Pill> : <span className="text-ink-3">—</span>}</td>
                <td>{r.math ? <Pill tone={tone(r.math)}>{r.math}</Pill> : <span className="text-ink-3">—</span>}</td>
                <td className={r.checkin_trend === "Dropping" ? "font-medium text-critical-text" : r.checkin_trend === "Up and down" ? "text-warn-text" : "text-ink-2"}>{r.checkin_trend}</td>
                <td className={r.referrals >= 2 ? "font-medium text-critical-text" : "text-ink-2"}>{r.referrals ? `${r.referrals} referral${r.referrals === 1 ? "" : "s"}` : "None"}</td>
                <td className="text-ink-2">{r.supports ?? (r.level === "high" || r.level === "moderate" ? "None yet" : "None")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[12.5px] text-ink-2">Showing {shown.length} of {rows.length} students. {!showAll && rows.length > 8 && <Link href="/teacher?all=1" className="link">Show all</Link>}</div>
      </Card>

      <Card className="mt-5" title="Classroom strategies for this group" sub="Suggested from what has worked for similar classes in the region">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {strategies.map((s) => (
            <div key={s.title} className="rounded-lg border border-line p-4">
              <div className="text-[14px] font-semibold">{s.title}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              <Link href={s.link} className="link mt-3 inline-block text-[12.5px]">{s.linkLabel} →</Link>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
