import { NextResponse, type NextRequest } from "next/server";
import { ROLES } from "@/lib/scope";

/** Sets the role / district / classroom cookies that stand in for a login in this prototype, then redirects. */
export function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get("next") || "/";
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin), 303);
  const opts = { path: "/", sameSite: "lax" as const, httpOnly: false };
  const role = url.searchParams.get("role");
  if (role && ROLES.some((r) => r.id === role)) res.cookies.set("role", role, opts);
  const aun = url.searchParams.get("aun");
  if (aun && /^\d+$/.test(aun)) { res.cookies.set("aun", aun, opts); res.cookies.delete("classroom"); }
  const classroom = url.searchParams.get("classroom");
  if (classroom && /^\d+$/.test(classroom)) res.cookies.set("classroom", classroom, opts);
  return res;
}
