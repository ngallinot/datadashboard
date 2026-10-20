"use client";
import { useRouter } from "next/navigation";

export function ClassroomSelect({ rooms, value }: { rooms: { id: number; name: string; grade: number; building: string; flagged: number }[]; value: number }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
      Class
      <select className="select" value={value} onChange={(e) => router.push(`/api/session?classroom=${e.target.value}&next=${encodeURIComponent("/teacher")}`)} aria-label="Select classroom">
        {rooms.map((r) => <option key={r.id} value={r.id}>{r.building} · {r.name}{r.flagged ? ` (${r.flagged} flagged)` : ""}</option>)}
      </select>
    </label>
  );
}
