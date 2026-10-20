import "server-only";
import type { Scope } from "../scope";
import { withScopedViews, schemaDoc, type ExecResult } from "./views";
import { LIBRARY, matchLibrary, libraryForScope, type ChartSpec, type LibraryEntry } from "./library";
import { getProvider } from "../ai/provider";

export interface AskResult {
  question: string; title: string; provider: string; model: string; libraryId?: string;
  columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; chart: ChartSpec;
  compare?: { title: string; columns: string[]; rows: Record<string, unknown>[]; chart: ChartSpec };
  map?: { auns: number[]; values: { aun: number; value: number }[]; label: string; higherIsBetter: boolean };
  bullets: string[]; sql: string; scopeNote: string; ms: number; error?: string; suggestions?: { id: string; question: string; level: string }[];
}

function scopeNote(scope: Scope): string {
  switch (scope.role) {
    case "csiu": return "CSIU scope: all 17 districts, buildings, and (synthetic) students.";
    case "district": return `District scope: ${scope.districtName} only. Other districts appear as an anonymized regional average.`;
    case "board": return `Board scope: ${scope.districtName}, aggregates only. Student-level questions are not available in this role.`;
    case "teacher": return `Teacher scope: your rosters only (${scope.districtName}).`;
    default: return "";
  }
}

function mapFrom(entry: LibraryEntry, rows: Record<string, any>[], scope: Scope): AskResult["map"] | undefined {
  if (scope.role !== "csiu" || !entry.mapAunCol) return undefined;
  const auns = rows.map((r) => r[entry.mapAunCol!]).filter((a): a is number => typeof a === "number");
  if (!auns.length) return undefined;
  const values = entry.mapValueCol ? rows.filter((r) => typeof r[entry.mapAunCol!] === "number" && typeof r[entry.mapValueCol!] === "number").map((r) => ({ aun: r[entry.mapAunCol!] as number, value: r[entry.mapValueCol!] as number })) : [];
  return { auns, values, label: entry.mapLabel ?? entry.title, higherIsBetter: entry.mapHigherIsBetter ?? true };
}

export async function ask(question: string, scope: Scope): Promise<AskResult> {
  const t0 = Date.now();
  const q = question.trim();
  const base = { question: q, scopeNote: scopeNote(scope) };

  // 1) Library match: deterministic, always works, no model needed.
  const m = matchLibrary(q, scope);
  if (m) {
    const e = m.entry;
    return withScopedViews(scope, ({ run }) => {
      const res = run(e.sql);
      const cmp = e.compareSql ? run(e.compareSql) : undefined;
      const map = mapFrom(e, res.rows, scope);
      return { ...base, title: e.title, provider: "library", model: "deterministic", libraryId: e.id, columns: res.columns, rows: res.rows, truncated: res.truncated, chart: e.chart,
        compare: cmp && e.compareChart ? { title: e.compareTitle ?? "Comparison", columns: cmp.columns, rows: cmp.rows, chart: e.compareChart } : undefined,
        map, bullets: e.narrate(res.rows, scope, cmp?.rows), sql: e.sql.trim(), ms: Date.now() - t0 };
    });
  }

  // 2) Free-form: text-to-SQL with the model, over the same scoped views.
  const provider = await getProvider();
  if (!provider.isLive) {
    return { ...base, title: "This question needs the live model", provider: provider.id, model: provider.model, columns: [], rows: [], truncated: false, chart: { type: "table" },
      bullets: ["The prototype is running without an Anthropic API key, so only the example questions below are answered. Add ANTHROPIC_API_KEY to .env.local to enable free-form questions.", "Pick one of the suggested questions, or rephrase using the same wording."],
      sql: "", ms: Date.now() - t0, error: "no_live_model", suggestions: libraryForScope(scope).slice(0, 6) };
  }

  return withScopedViews(scope, async ({ run, docs }) => {
    const system = `You translate plain-language questions from school leaders into SQLite SQL over a small, documented set of views, then describe the result.
Rules:
- Use ONLY the v_* views listed below. Never reference other tables. One SELECT statement (CTEs allowed), no semicolons. SQLite dialect.
- Keep results small: aggregate, ORDER BY the most relevant column, LIMIT 25 unless the question is a list of students.
- ${scope.role === "csiu" ? "The user is CSIU staff and may see every district by name." : `The user is in ${scope.districtName}. Other districts are NOT visible by name; v_districts contains only this district plus a 'Regional average (other districts)' row. Compare the district against that row when asked about 'all districts'.`}
- Student rows are synthetic sample data; district and building measures are real public data.
- Output JSON: {"sql": string, "title": string, "chart": {"type": "bar"|"hbar"|"line"|"grouped"|"table", "x": column, "y": [numeric columns], "unit": "%"|" pts"|""}, "map_aun_column": column holding a district aun to highlight (or null)}
Views:
${schemaDoc(docs)}

Examples (question -> sql):
${LIBRARY.slice(0, 5).map((e) => `Q: ${e.question}\nSQL: ${e.sql.replace(/\s+/g, " ").trim()}`).join("\n\n")}`;

    let sql = "", title = q, chart: ChartSpec = { type: "table" }, mapCol: string | null = null, res: ExecResult | undefined, lastErr = "";
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      const userMsg = attempt === 0 ? `Question: ${q}` : `Question: ${q}\nYour previous SQL failed with: ${lastErr}\nPrevious SQL: ${sql}\nFix it.`;
      const out = await provider.complete({ system, user: userMsg, json: true, maxTokens: 2000 });
      const parsed = parseJson(out.text);
      sql = String(parsed.sql ?? ""); title = String(parsed.title ?? q); chart = normalizeChart(parsed.chart); mapCol = typeof parsed.map_aun_column === "string" ? parsed.map_aun_column : null;
      try { res = run(sql); } catch (e) { lastErr = (e as Error).message; }
    }
    if (!res) return { ...base, title: "Could not answer that question", provider: provider.id, model: provider.model, columns: [], rows: [], truncated: false, chart: { type: "table" }, bullets: [`The model's query could not be run: ${lastErr}`, "Try rephrasing, or pick an example question."], sql, ms: Date.now() - t0, error: lastErr, suggestions: libraryForScope(scope).slice(0, 6) };

    // Narrative: 3-5 bullets from the actual rows.
    const sample = res.rows.slice(0, 40);
    const narr = await provider.complete({ system: "You write 3-5 short, plain-language bullets for school leaders about a query result. Be concrete (name the top items and numbers), note one caveat if data is synthetic or a sample is small, and end with one suggested next step when appropriate. Output JSON: {\"bullets\": string[]}", user: `Question: ${q}\nScope: ${scopeNote(scope)}\nColumns: ${res.columns.join(", ")}\nRows (first ${sample.length} of ${res.rows.length}): ${JSON.stringify(sample)}`, json: true, maxTokens: 1200 });
    const bullets = (parseJson(narr.text).bullets as string[] | undefined)?.filter((b) => typeof b === "string").slice(0, 5) ?? ["See the table and chart above."];
    let map: AskResult["map"] | undefined;
    if (scope.role === "csiu" && mapCol && res.columns.includes(mapCol)) {
      const auns = res.rows.map((r) => r[mapCol!]).filter((a): a is number => typeof a === "number");
      const valCol = chart.y?.[0]; const values = valCol ? res.rows.filter((r) => typeof r[mapCol!] === "number" && typeof r[valCol] === "number").map((r) => ({ aun: r[mapCol!] as number, value: r[valCol] as number })) : [];
      if (auns.length) map = { auns, values, label: valCol ?? title, higherIsBetter: true };
    }
    return { ...base, title, provider: provider.id, model: provider.model, columns: res.columns, rows: res.rows, truncated: res.truncated, chart, map, bullets, sql, ms: Date.now() - t0 };
  });
}

function parseJson(text: string): Record<string, any> {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return {};
}

function normalizeChart(c: any): ChartSpec {
  const type = ["bar", "hbar", "line", "grouped", "table"].includes(c?.type) ? c.type : "table";
  return { type, x: typeof c?.x === "string" ? c.x : undefined, y: Array.isArray(c?.y) ? c.y.filter((v: unknown) => typeof v === "string").slice(0, 4) : undefined, unit: typeof c?.unit === "string" ? c.unit : "" };
}

export { libraryForScope };
