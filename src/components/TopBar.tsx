import Link from "next/link";
import { headers } from "next/headers";
import { getScope, ROLES, districtsList, type Role } from "@/lib/scope";
import { DistrictSelect } from "./DistrictSelect";

const HOME: Record<Role, string> = { csiu: "/regional", district: "/district", board: "/board", teacher: "/teacher", student: "/student" };

export async function TopBar() {
  const scope = await getScope();
  const districts = districtsList();
  const h = await headers();
  const current = h.get("x-pathname") ?? "/";
  return (
    <header className="no-print sticky top-0 z-40">
      <div className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-6 py-2.5">
          <Link href={HOME[scope.role]} className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-[13px] font-bold">16</span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">CSIU District Insights</span>
              <span className="block text-[11px] text-white/65">Regional data and AI decision support</span>
            </span>
          </Link>
          <nav className="ml-4 flex items-center gap-1 rounded-lg bg-white/10 p-1" aria-label="Role">
            {ROLES.map((r) => (
              <Link key={r.id} href={`/api/session?role=${r.id}&next=${encodeURIComponent(HOME[r.id])}`} title={r.blurb}
                className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition ${scope.role === r.id ? "bg-white text-brand-900 shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                {r.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/ask" className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition ${current.startsWith("/ask") ? "bg-white text-brand-900" : "bg-white/10 text-white hover:bg-white/20"}`}>
              Ask a question
            </Link>
            <DistrictSelect districts={districts} value={scope.aun} role={scope.role} next={current} />
            <span className="rounded-md border border-white/20 px-2.5 py-1 text-[12px] text-white/85">2026–27</span>
          </div>
        </div>
      </div>
      <div className="border-b border-warn/40 bg-warn-100 text-warn-text">
        <div className="mx-auto flex max-w-[1440px] items-center gap-2 px-6 py-1.5 text-[12px]">
          <span className="font-semibold">Prototype — sample data.</span>
          <span>All student, classroom, and teacher records are synthetic. District and building figures come from public sources (PDE Future Ready PA Index, PAYS, SAP summaries). See DATA_SOURCES.md.</span>
        </div>
      </div>
    </header>
  );
}
