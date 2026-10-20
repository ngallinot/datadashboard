"use client";
// Chart primitives built on Recharts. One axis per chart; thin marks; recessive grid; legend for >= 2 series; tooltips on everything.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const tooltipStyle = { contentStyle: { borderRadius: 10, border: "1px solid rgba(15,23,32,.1)", fontSize: 12.5, boxShadow: "0 2px 8px rgba(15,23,32,.08)" }, labelStyle: { fontWeight: 600, color: "#0f1720" } };

export interface LineSeries { key: string; label: string; color?: string; dashed?: boolean; width?: number; muted?: boolean }

/** Multi-series line chart. Pass `emphasis` to highlight one series (others gray, thin). */
export function TrendLines({ data, x, series, height = 240, unit = "", domain, refLabel, refValue }: { data: Record<string, unknown>[]; x: string; series: LineSeries[]; height?: number; unit?: string; domain?: [number | "auto", number | "auto"]; refLabel?: string; refValue?: number }) {
  const labeled = series.filter((s) => !s.muted);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} tickLine={false} axisLine={false} dy={6} />
        <YAxis tickLine={false} axisLine={false} domain={domain ?? ["auto", "auto"]} tickFormatter={(v) => `${v}${unit}`} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [`${typeof v === "number" ? v.toFixed(1) : v}${unit}`, n]} />
        {refValue !== undefined && <ReferenceLine y={refValue} stroke="#7c8792" strokeWidth={1} label={{ value: refLabel, position: "insideTopRight", fontSize: 11, fill: "#7c8792" }} />}
        {labeled.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} legendType={s.muted ? "none" : "plainline"} stroke={s.muted ? "#d5d7d0" : s.color ?? SERIES[i % SERIES.length]} strokeWidth={s.muted ? 1 : s.width ?? 2} strokeDasharray={s.dashed ? "5 4" : undefined} dot={s.muted ? false : { r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars, one series, optional emphasis of a single category and a reference line. */
export function HBars({ data, cat, val, height, unit = "%", emphasize, color = "#2a78d6", refValue, refLabel, domain }: { data: Record<string, unknown>[]; cat: string; val: string; height?: number; unit?: string; emphasize?: string; color?: string; refValue?: number; refLabel?: string; domain?: [number, number] }) {
  const h = height ?? Math.max(120, data.length * 26 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} domain={domain ?? [0, "auto"]} tickFormatter={(v) => `${v}${unit}`} />
        <YAxis type="category" dataKey={cat} width={150} tickLine={false} axisLine={false} interval={0} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(15,23,32,.04)" }} formatter={(v: any) => [`${typeof v === "number" ? v.toFixed(1) : v}${unit}`, ""]} />
        {refValue !== undefined && <ReferenceLine x={refValue} stroke="#7c8792" label={{ value: refLabel, position: "top", fontSize: 11, fill: "#7c8792" }} />}
        <Bar dataKey={val} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "#4b5560", formatter: (v: any) => typeof v === "number" ? `${v.toFixed(0)}${unit}` : v }}>
          {data.map((row, i) => <Cell key={i} fill={typeof row.color === "string" ? row.color : emphasize && row[cat] !== emphasize ? "#c9d9ee" : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Grouped vertical bars for 2-3 series (e.g., treated vs comparison). */
export function GroupedBars({ data, cat, series, height = 220, unit = "%" }: { data: Record<string, unknown>[]; cat: string; series: { key: string; label: string; color?: string }[]; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }} barCategoryGap={18} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={cat} tickLine={false} axisLine={false} dy={6} interval={0} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${unit}`} width={44} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(15,23,32,.04)" }} formatter={(v: any, n: any) => [`${typeof v === "number" ? v.toFixed(1) : v}${unit}`, series.find((s) => s.key === n)?.label ?? n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => series.find((s) => s.key === v)?.label ?? v} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} fill={s.color ?? SERIES[i]} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={38} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Area + line with a projection segment (used for chronic absence early warning). */
export function ProjectionChart({ data, x, height = 240, unit = "%" }: { data: { label: string; actual: number | null; projected: number | null; avg: number | null }[]; x?: string; height?: number; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x ?? "label"} tickLine={false} axisLine={false} dy={6} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${unit}`} width={44} domain={[0, "auto"]} />
        <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [v === null ? "—" : `${Number(v).toFixed(1)}${unit}`, n === "actual" ? "This year" : n === "projected" ? "Projected" : "3-year average"]} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === "actual" ? "This year" : v === "projected" ? "Projected" : "3-year average"} />
        <Area type="monotone" dataKey="actual" stroke="#2a78d6" strokeWidth={2} fill="#2a78d6" fillOpacity={0.12} dot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
        <Line type="monotone" dataKey="projected" stroke="#2a78d6" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="avg" stroke="#7c8792" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Small single-series area sparkline. */
export function Spark({ data, k, color = "#2a78d6", height = 44 }: { data: Record<string, unknown>[]; k: string; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Area type="monotone" dataKey={k} stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Simple vertical bars, one series, optional per-bar color. */
export function VBars({ data, cat, val, height = 200, unit = "", color = "#2a78d6", goal }: { data: Record<string, unknown>[]; cat: string; val: string; height?: number; unit?: string; color?: string; goal?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={cat} tickLine={false} axisLine={false} dy={6} interval={0} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${unit}`} width={44} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(15,23,32,.04)" }} formatter={(v: any) => [`${typeof v === "number" ? v.toFixed(1) : v}${unit}`, ""]} />
        {goal !== undefined && <ReferenceLine y={goal} stroke="#7c8792" label={{ value: "goal", position: "insideTopRight", fontSize: 11, fill: "#7c8792" }} />}
        <Bar dataKey={val} radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={40} label={{ position: "top", fontSize: 11, fill: "#4b5560", formatter: (v: any) => typeof v === "number" ? `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}` : v }}>
          {data.map((row, i) => <Cell key={i} fill={typeof row.color === "string" ? row.color : color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
