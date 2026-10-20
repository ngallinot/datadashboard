import Link from "next/link";
import { getScope } from "@/lib/scope";
import { supportList, buildings } from "@/lib/queries/district";
import { PageHeader, Card } from "@/components/ui";
import { SupportTable } from "@/components/district";

export default async function StudentsPage({ searchParams }: PageProps<"/district/students">) {
  const sp = await searchParams;
  const scope = await getScope();
  const bl = buildings(scope);
  const buildingId = typeof sp.building === "string" ? parseInt(sp.building, 10) : undefined;
  const level = typeof sp.level === "string" && ["high", "moderate", "watch"].includes(sp.level) ? sp.level : undefined;
  const rows = supportList(scope, { buildingId: buildingId && bl.some((b) => b.id === buildingId) ? buildingId : undefined, levels: level ? [level] : ["high", "moderate"], limit: 200 });
  const link = (b?: number, l?: string) => `/district/students?${[b ? `building=${b}` : "", l ? `level=${l}` : ""].filter(Boolean).join("&")}`;
  return (
    <>
      <PageHeader title="Student support list" sub="Students with two or more risk indicators, highest scores first. Visible only to authorized staff; names are hidden on this view and access to profiles is logged." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Building</span>
        <Link href={link(undefined, level)} className={`chip ${!buildingId ? "!border-brand-500 !bg-brand-100 !text-brand-700" : ""}`}>All</Link>
        {bl.map((b) => <Link key={b.id} href={link(b.id, level)} className={`chip ${buildingId === b.id ? "!border-brand-500 !bg-brand-100 !text-brand-700" : ""}`}>{b.name} · {b.flagged}</Link>)}
        <span className="eyebrow ml-4 mr-1">Risk</span>
        {[["", "High + moderate"], ["high", "High"], ["moderate", "Moderate"], ["watch", "Watch"]].map(([l, label]) => <Link key={l} href={link(buildingId, l || undefined)} className={`chip ${(level ?? "") === l ? "!border-brand-500 !bg-brand-100 !text-brand-700" : ""}`}>{label}</Link>)}
      </div>
      <Card pad={false} title={`${rows.length} students`} sub="Click a student to open the profile (demo: names are shown on the profile as the student's team would see them)">
        <div className="px-2 pb-2"><SupportTable rows={rows} /></div>
      </Card>
    </>
  );
}
