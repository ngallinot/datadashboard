import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getScope } from "@/lib/scope";
import { districtHeader } from "@/lib/queries/district";
import { meta } from "@/lib/db";
import { fmtDateLong } from "@/lib/format";

const NAV = [
  ["/district", "Overview"], ["/district/attendance", "Attendance"], ["/district/behavior", "Behavior"], ["/district/academics", "Academics"],
  ["/district/wellness", "Wellness (Project AWARE)"], ["/district/interventions", "Interventions"], ["/district/students", "Student support list"], ["/district/reports", "Reports"],
] as const;

export default async function DistrictLayout({ children }: LayoutProps<"/district">) {
  const scope = await getScope();
  if (scope.role === "board") redirect("/board");
  if (scope.role === "teacher") redirect("/teacher");
  if (scope.role === "student") redirect("/student");
  const d = districtHeader(scope);
  const h = await headers();
  const current = h.get("x-pathname") ?? "/district";
  const paysLoaded = (JSON.parse(meta("pays_loaded_auns") ?? "[]") as number[]).includes(scope.aun);
  const sapLoaded = (JSON.parse(meta("sap_loaded_auns") ?? "[]") as number[]).includes(scope.aun);
  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[210px_1fr]">
      <aside className="no-print lg:sticky lg:top-[88px] lg:self-start">
        <div className="eyebrow mb-2">Views</div>
        <nav className="space-y-0.5">
          {NAV.map(([href, label]) => <Link key={href} href={href} className={`nav-item ${current === href ? "active" : ""}`}>{label}</Link>)}
        </nav>
        <div className="mt-6 rounded-lg border border-line bg-surface p-3 text-[11.5px] leading-snug text-ink-2">
          <div className="eyebrow mb-1">Data sources</div>
          <div>PIMS / PDE Future Ready · District SIS (Sapphire export) · Project AWARE · PAYS {paysLoaded ? "2025" : "(synthetic)"} · SAP {sapLoaded ? "2025-26" : "(synthetic)"} · Public data</div>
          <div className="mt-1 text-ink-3">Last refreshed: last night · as of {fmtDateLong(meta("as_of"))}</div>
          {scope.role === "csiu" && <div className="mt-2 rounded bg-brand-100 px-2 py-1 text-brand-700">Viewing as CSIU staff. Switch the district in the top bar.</div>}
        </div>
      </aside>
      <div className="min-w-0">
        <div className="mb-4 text-[13px] text-ink-2">{d.name} School District · {d.county} County · {scope.schoolYear}</div>
        {children}
      </div>
    </div>
  );
}
