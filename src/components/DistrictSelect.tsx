"use client";
import { useRouter } from "next/navigation";

export function DistrictSelect({ districts, value, role, next }: { districts: { aun: number; name: string }[]; value: number; role: string; next: string }) {
  const router = useRouter();
  const label = role === "csiu" ? "Focus district" : role === "teacher" ? "District" : "District";
  return (
    <label className="flex items-center gap-2 text-[12px] text-white/70">
      <span className="hidden 2xl:inline">{label}</span>
      <select
        className="select !bg-white/10 !border-white/20 !text-white !py-1 !text-[12.5px] [&>option]:text-ink"
        value={value}
        onChange={(e) => router.push(`/api/session?aun=${e.target.value}&next=${encodeURIComponent(next)}`)}
        aria-label="Select district"
      >
        {districts.map((d) => <option key={d.aun} value={d.aun}>{d.name}</option>)}
      </select>
    </label>
  );
}
