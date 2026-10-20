import type { NextRequest } from "next/server";

/** Public origin as the browser sees it (honors reverse-proxy headers on Render, Railway, etc.). */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Origin the server can reach itself on (used by the PDF renderer, which runs inside the same container). */
export function internalOrigin(): string {
  return process.env.INTERNAL_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}
