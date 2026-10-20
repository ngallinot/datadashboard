"use client";
import { useEffect, useRef, useState } from "react";
import { RegionMap, type MapDistrict } from "./RegionMap";
import { HBars, VBars, GroupedBars, TrendLines } from "./charts";
import type { AskResult } from "@/lib/ask/engine";

interface LibraryItem { id: string; question: string; level: string }
interface Props { library: LibraryItem[]; role: string; mapDistricts: Omit<MapDistrict, "value" | "rank">[]; initialQuestion?: string; live: boolean }

const pretty = (k: string) => k.replace(/_(\d{4})_(\d{2})\b/g, " $1-$2").replace(/_/g, " ").replace(/\b(pct|pts)\b/g, (m) => (m === "pct" ? "%" : "pts")).replace(/\b\w/g, (c) => c.toUpperCase());
const fmt = (v: unknown, col = "") => typeof v === "number" ? (Number.isInteger(v) ? (/year|grade|aun|id$/.test(col) ? String(v) : v.toLocaleString()) : v.toFixed(1)) : v === null || v === undefined ? "—" : String(v);

export function AskPanel({ library, role, mapDistricts, initialQuestion, live }: Props) {
  const [q, setQ] = useState(initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(question: string) {
    const text = question.trim(); if (!text) return;
    setBusy(true); setQ(text);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      const j = await r.json();
      if (!r.ok) setRes({ question: text, title: "Something went wrong", provider: "", model: "", columns: [], rows: [], truncated: false, chart: { type: "table" }, bullets: [j.error ?? "Unknown error"], sql: "", scopeNote: "", ms: 0, error: j.error });
      else { setRes(j); setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 6)); }
    } finally { setBusy(false); }
  }
  // Run a question passed in the URL (?q=) once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { if (initialQuestion) void submit(initialQuestion); }, []);

  const byLevel = library.reduce<Record<string, LibraryItem[]>>((m, l) => { const k = l.level.split(" · ")[0]; (m[k] ??= []).push(l); return m; }, {});

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <form className="card card-pad" onSubmit={(e) => { e.preventDefault(); void submit(q); }}>
          <label className="eyebrow mb-2 block">Your question</label>
          <div className="flex gap-2">
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Show me what districts are using CKLA" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand-500" />
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "…" : "Ask"}</button>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">{live ? "The model writes a query over the scoped warehouse views, the app runs it, then the model picks a chart and writes the bullets." : "Example questions are answered without a model. Free-form questions need a model key."}</p>
          {history.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{history.map((h) => <button key={h} type="button" className="chip" onClick={() => void submit(h)}>{h}</button>)}</div>}
        </form>
        <div className="card card-pad">
          <div className="eyebrow mb-2">Example questions · {library.length}</div>
          <div className="space-y-3">
            {Object.entries(byLevel).map(([lvl, items]) => (
              <div key={lvl}>
                <div className="mb-1 text-[11px] font-semibold text-ink-3">{lvl} level</div>
                <div className="flex flex-wrap gap-1.5">{items.map((l) => <button key={l.id} type="button" className="chip" onClick={() => void submit(l.question)} disabled={busy}>{l.question}</button>)}</div>
              </div>
            ))}
          </div>
          {role === "board" && <p className="mt-3 text-[11.5px] text-ink-3">Student-level questions are not shown in the board role.</p>}
        </div>
      </aside>

      <section className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
        {!res && (
          <div className="card card-pad">
            <h2 className="h2">Try the canonical example</h2>
            <p className="sub mt-1">“Show me what districts are using CKLA.” highlights the CKLA districts on the map, lists grades covered, adoption year and years in use, ELA proficiency and the change since adoption, their rank in the IU, and compares CKLA districts with the rest.</p>
            <button className="btn btn-primary mt-3" onClick={() => void submit("Show me what districts are using CKLA.")}>Run it</button>
          </div>
        )}
        {res && <Result res={res} role={role} mapDistricts={mapDistricts} showSql={showSql} setShowSql={setShowSql} onAsk={submit} />}
      </section>
    </div>
  );
}

function Result({ res, role, mapDistricts, showSql, setShowSql, onAsk }: { res: AskResult; role: string; mapDistricts: Omit<MapDistrict, "value" | "rank">[]; showSql: boolean; setShowSql: (b: boolean) => void; onAsk: (q: string) => void }) {
  const chartEl = renderChart(res.chart, res.rows);
  const cmpEl = res.compare ? renderChart(res.compare.chart, res.compare.rows) : null;
  const vals = new Map((res.map?.values ?? []).map((v) => [v.aun, v.value]));
  const highlight = res.map?.auns ?? null;
  return (
    <>
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{res.provider === "library" ? "Example question · deterministic" : res.provider === "anthropic" ? `Answered by ${res.model}` : "Not answered"}</div>
            <h2 className="h1 mt-1 !text-[22px]">{res.title}</h2>
            <div className="sub mt-1">“{res.question}” · {res.scopeNote} {res.ms ? `· ${res.ms} ms` : ""}</div>
          </div>
          {res.sql && <button className="btn btn-sm" onClick={() => setShowSql(!showSql)}>{showSql ? "Hide query" : "Show query"}</button>}
        </div>
        {showSql && res.sql && <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-[11.5px] leading-snug text-ink-2">{res.sql}</pre>}
        <ul className="mt-4 space-y-2">
          {res.bullets.map((b, i) => <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-ink"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{b}</li>)}
        </ul>
        {res.suggestions && <div className="mt-4 flex flex-wrap gap-1.5">{res.suggestions.map((s) => <button key={s.id} className="chip" onClick={() => onAsk(s.question)}>{s.question}</button>)}</div>}
      </div>

      {role === "csiu" && res.map && (
        <div className="card card-pad">
          <h3 className="h2 mb-2">Map · {res.map.label}</h3>
          <RegionMap districts={mapDistricts.map((d) => ({ ...d, value: vals.get(d.aun) ?? null, rank: null }))} metricLabel={res.map.label} unit="" higherIsBetter={res.map.higherIsBetter} source="query result" highlight={highlight} height={420} />
        </div>
      )}

      {(chartEl || cmpEl) && (
        <div className={`grid gap-4 ${chartEl && cmpEl ? "lg:grid-cols-[1.4fr_1fr]" : ""}`}>
          {chartEl && <div className="card card-pad"><h3 className="h2 mb-2">Chart</h3>{chartEl}</div>}
          {cmpEl && <div className="card card-pad"><h3 className="h2 mb-2">{res.compare?.title}</h3>{cmpEl}</div>}
        </div>
      )}

      {res.rows.length > 0 && (
        <div className="card" >
          <div className="flex items-center justify-between px-5 pt-4 pb-2"><h3 className="h2">Table · {res.rows.length}{res.truncated ? "+" : ""} rows</h3><span className="text-[11.5px] text-ink-3">{res.columns.length} columns</span></div>
          <div className="max-h-[480px] overflow-auto px-2 pb-2">
            <table className="tbl">
              <thead><tr>{res.columns.filter((c) => c !== "aun" && c !== "factors_json").map((c) => <th key={c} className={typeof res.rows[0]?.[c] === "number" ? "r" : ""}>{pretty(c)}</th>)}</tr></thead>
              <tbody>{res.rows.map((r, i) => <tr key={i}>{res.columns.filter((c) => c !== "aun" && c !== "factors_json").map((c) => <td key={c} className={typeof r[c] === "number" ? "r" : ""}>{fmt(r[c], c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function renderChart(spec: AskResult["chart"], rows: Record<string, unknown>[]) {
  if (!rows.length || spec.type === "table" || !spec.x || !spec.y?.length) return null;
  const x = spec.x, ys = spec.y.filter((y) => rows.some((r) => typeof r[y] === "number"));
  if (!ys.length) return null;
  const data = rows.slice(0, 40).map((r) => ({ ...r, [x]: String(r[x] ?? "") }));
  const labels = spec.labels ?? {};
  if (spec.type === "grouped" || (ys.length > 1 && spec.type !== "line")) return <GroupedBars data={data} cat={x} series={ys.map((y) => ({ key: y, label: labels[y] ?? pretty(y) }))} unit={spec.unit ?? ""} height={spec.height ?? 260} />;
  if (spec.type === "line") return <TrendLines data={data} x={x} series={ys.map((y) => ({ key: y, label: labels[y] ?? pretty(y) }))} unit={spec.unit ?? ""} height={spec.height ?? 260} />;
  if (spec.type === "bar") return <VBars data={data} cat={x} val={ys[0]} unit={spec.unit ?? ""} height={spec.height ?? 240} />;
  const vals = data.map((r) => r[ys[0]] as number); const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  return <HBars data={data} cat={x} val={ys[0]} unit={spec.unit ?? ""} domain={min < 0 ? [Math.floor(min), Math.ceil(max)] : undefined} refValue={min < 0 ? 0 : undefined} height={spec.height ?? Math.max(140, data.length * 26 + 30)} />;
}
