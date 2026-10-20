import { NextResponse, type NextRequest } from "next/server";
import { getScope } from "@/lib/scope";
import { renderPdf } from "@/lib/pdf";

export async function GET(req: NextRequest) {
  const scope = await getScope();
  if (scope.role === "teacher" || scope.role === "student") return NextResponse.json({ error: "Not available in this role." }, { status: 403 });
  const url = new URL(`/print/board?aun=${scope.aun}`, req.nextUrl.origin).toString();
  const slug = scope.districtName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (req.nextUrl.searchParams.get("format") === "html") return NextResponse.redirect(url);
  const pdf = await renderPdf(url, [{ name: "aun", value: String(scope.aun) }, { name: "role", value: "board" }]);
  if (!pdf) return NextResponse.redirect(url + "&nopdf=1");   // no Chromium available: show the print page; the browser's Print dialog produces the same PDF
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="board-packet-${slug}-2026-11.pdf"` } });
}
