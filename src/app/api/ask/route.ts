import { NextResponse, type NextRequest } from "next/server";
import { getScope } from "@/lib/scope";
import { ask, libraryForScope } from "@/lib/ask/engine";
import { providerStatus } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  if (!question.trim()) return NextResponse.json({ error: "Question is required." }, { status: 400 });
  const scope = await getScope();
  try {
    const result = await ask(question, scope);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const scope = await getScope();
  return NextResponse.json({ library: libraryForScope(scope), provider: providerStatus(), scope: { role: scope.role, district: scope.districtName } });
}
