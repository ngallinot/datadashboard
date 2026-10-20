import Link from "next/link";
import type { ReactNode } from "react";

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={`mx-auto w-full ${wide ? "max-w-[1440px]" : "max-w-[1280px]"} px-6 py-6`}>{children}</main>;
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {sub && <div className="sub mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, sub, right, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode; pad?: boolean }) {
  return (
    <section className={`card ${pad ? "card-pad" : ""} ${className}`}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 ${pad ? "mb-3" : "px-5 pt-4 pb-2"}`}>
          <div>{title && <h2 className="h2">{title}</h2>}{sub && <div className="sub mt-0.5">{sub}</div>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "good" | "warn" | "serious" | "critical" | "neutral" | "brand";
export function Pill({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  const glyph = tone === "good" ? "✓" : tone === "warn" ? "!" : tone === "serious" ? "!" : tone === "critical" ? "✕" : "";
  return <span className={`pill pill-${tone}`}>{icon && glyph && <span aria-hidden>{glyph}</span>}{children}</span>;
}

/** Stat tile: hero number + context line + optional delta. */
export function Kpi({ label, value, context, delta, deltaTone, source, href }: { label: string; value: ReactNode; context?: ReactNode; delta?: ReactNode; deltaTone?: Tone; source?: string; href?: string }) {
  const body = (
    <div className="card card-pad flex h-full flex-col">
      <div className="flex items-start justify-between gap-2"><div className="eyebrow">{label}</div>{source && <span className="text-[10.5px] text-ink-3">{source}</span>}</div>
      <div className="hero mt-2 text-ink">{value}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-2">
        {delta && <span className={`font-semibold ${deltaTone === "good" ? "text-good-text" : deltaTone === "critical" ? "text-critical-text" : deltaTone === "warn" ? "text-warn-text" : "text-ink-2"}`}>{delta}</span>}
        {context && <span>{context}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:[&>div]:border-brand-500/50">{body}</Link> : body;
}

export function SourceNote({ children }: { children: ReactNode }) { return <p className="mt-3 text-[11.5px] leading-snug text-ink-3">{children}</p>; }

export function Empty({ children }: { children: ReactNode }) { return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">{children}</div>; }

export function Delta({ value, unit = " pts", goodWhenPositive = true, digits = 1 }: { value: number | null | undefined; unit?: string; goodWhenPositive?: boolean; digits?: number }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-ink-3">—</span>;
  const good = goodWhenPositive ? value > 0 : value < 0;
  const flat = Math.abs(value) < 0.05;
  return <span className={`font-semibold ${flat ? "text-ink-2" : good ? "text-good-text" : "text-critical-text"}`}>{flat ? "" : value > 0 ? "▲ " : "▼ "}{value > 0 ? "+" : ""}{value.toFixed(digits)}{unit}</span>;
}
