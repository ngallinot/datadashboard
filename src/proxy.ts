import { NextResponse, type NextRequest } from "next/server";

// Exposes the current pathname to server components (used by the top bar to highlight navigation).
export function proxy(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!_next|api|favicon.ico|geo).*)"] };
