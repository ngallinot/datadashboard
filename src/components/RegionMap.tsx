"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MLMap, Popup, NavigationControl, setWorkerUrl } from "maplibre-gl";

// MapLibre 6 loads its worker as a separate module; serve it from /public so it works under any bundler.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import { useRouter } from "next/navigation";

export interface MapDistrict { aun: number; name: string; tiger_geoid: string; value: number | null; rank: number | null; enrollment: number; county: string; extra?: string }
export interface MapProps {
  districts: MapDistrict[];
  metricLabel: string; unit: string; higherIsBetter: boolean; source: string;
  highlight?: number[] | null;          // AUNs to emphasize (others fade). null/undefined = none.
  selectedAun?: number | null;
  height?: number;
  onSelect?: (aun: number) => void;     // if omitted, click navigates to the district view
  compact?: boolean;
}

const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const BOUNDS: [[number, number], [number, number]] = [[-77.45, 40.55], [-76.05, 41.45]];

function breaks(values: number[]): number[] {
  const v = [...values].sort((a, b) => a - b); if (v.length < 2) return [];
  const qs = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6].map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]);
  return [...new Set(qs)];
}
export function colorFor(value: number | null, br: number[]): string {
  if (value === null || value === undefined) return "#e7e8e3";
  let i = 0; while (i < br.length && value > br[i]) i++;
  return RAMP[Math.min(RAMP.length - 1, Math.round(i * (RAMP.length - 1) / Math.max(1, br.length)))];
}

export function RegionMap(p: MapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const br = useMemo(() => breaks(p.districts.map((d) => d.value).filter((v): v is number => v !== null)), [p.districts]);
  const byGeoid = useMemo(() => new Map(p.districts.map((d) => [d.tiger_geoid, d])), [p.districts]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = new MLMap({ container: el.current, style: BASEMAP, bounds: BOUNDS, fitBoundsOptions: { padding: 12 }, attributionControl: { compact: true }, cooperativeGestures: false, maxZoom: 11, minZoom: 7 });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.scrollZoom.disable();
    mapRef.current = map;
    map.on("load", async () => {
      const [districts, counties] = await Promise.all([fetch("/geo/districts.geojson").then((r) => r.json()), fetch("/geo/counties.geojson").then((r) => r.json())]);
      map.addSource("districts", { type: "geojson", data: districts, promoteId: "geoid" });
      map.addSource("counties", { type: "geojson", data: counties });
      map.addSource("county-labels", { type: "geojson", data: { type: "FeatureCollection", features: counties.features.map((f: any) => ({ type: "Feature", properties: { name: f.properties.name.toUpperCase() + " COUNTY" }, geometry: { type: "Point", coordinates: [f.properties.lon, f.properties.lat] } })) } });
      map.addSource("district-labels", { type: "geojson", data: { type: "FeatureCollection", features: districts.features.map((f: any) => ({ type: "Feature", properties: { name: f.properties.name.replace(/ Area$/, ""), geoid: f.properties.geoid }, geometry: { type: "Point", coordinates: [f.properties.lon, f.properties.lat] } })) } });
      map.addLayer({ id: "d-fill", type: "fill", source: "districts", paint: { "fill-color": "#e7e8e3", "fill-opacity": 0.85 } });
      map.addLayer({ id: "d-line", type: "line", source: "districts", paint: { "line-color": "#ffffff", "line-width": 1.2 } });
      map.addLayer({ id: "d-hover", type: "line", source: "districts", paint: { "line-color": "#0f2a44", "line-width": 2.5 }, filter: ["==", ["get", "geoid"], ""] });
      map.addLayer({ id: "c-line", type: "line", source: "counties", paint: { "line-color": "#0f2a44", "line-width": 1.6, "line-opacity": 0.55 } });
      map.addLayer({ id: "d-label", type: "symbol", source: "district-labels", layout: { "text-field": ["get", "name"], "text-size": 10.5, "text-font": ["Montserrat Medium"], "text-allow-overlap": false }, paint: { "text-color": "#0f1720", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.4 } });
      map.addLayer({ id: "c-label", type: "symbol", source: "county-labels", layout: { "text-field": ["get", "name"], "text-size": 11, "text-letter-spacing": 0.12, "text-font": ["Montserrat Bold"], "text-offset": [0, -2.2], "text-allow-overlap": true }, paint: { "text-color": "#1d4f7c", "text-opacity": 0.8, "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.2 } });
      setReady(true);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // paint + interactions, re-run when data changes
  useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const hl = p.highlight ? new Set(p.highlight) : null;
    const colorExpr: any = ["match", ["get", "geoid"]];
    const opacityExpr: any = ["match", ["get", "geoid"]];
    for (const d of p.districts) {
      colorExpr.push(d.tiger_geoid, colorFor(d.value, br));
      opacityExpr.push(d.tiger_geoid, hl ? (hl.has(d.aun) ? 0.92 : 0.18) : 0.85);
    }
    colorExpr.push("#e7e8e3"); opacityExpr.push(0.5);
    map.setPaintProperty("d-fill", "fill-color", colorExpr);
    map.setPaintProperty("d-fill", "fill-opacity", opacityExpr);
    map.setPaintProperty("d-line", "line-color", hl ? ["match", ["get", "geoid"], ...p.districts.flatMap((d) => [d.tiger_geoid, hl.has(d.aun) ? "#0f2a44" : "#ffffff"]), "#ffffff"] as any : "#ffffff");
    map.setPaintProperty("d-line", "line-width", hl ? ["match", ["get", "geoid"], ...p.districts.flatMap((d) => [d.tiger_geoid, hl.has(d.aun) ? 2 : 1]), 1] as any : 1.2);
    const sel = p.districts.find((d) => d.aun === p.selectedAun);
    map.setFilter("d-hover", ["==", ["get", "geoid"], sel?.tiger_geoid ?? ""]);

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: "260px" });
    const onMove = (e: any) => {
      const f = e.features?.[0]; if (!f) return;
      const d = byGeoid.get(f.properties.geoid); if (!d) return;
      map.getCanvas().style.cursor = "pointer";
      map.setFilter("d-hover", ["==", ["get", "geoid"], f.properties.geoid]);
      const val = d.value === null ? "Not reported" : `${d.value.toFixed(1)}${p.unit}`;
      popup.setLngLat(e.lngLat).setHTML(`<div style="padding:10px 12px;min-width:200px">
        <div style="font-weight:650;font-size:13px;color:#0f1720">${d.name}</div>
        <div style="font-size:11px;color:#7c8792;margin-bottom:6px">${d.county} County · ${d.enrollment.toLocaleString()} students</div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:#4b5560">${p.metricLabel}</span><span style="font-weight:650">${val}</span></div>
        ${d.rank ? `<div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:#4b5560">Rank in IU</span><span style="font-weight:650">${d.rank} of ${p.districts.length}</span></div>` : ""}
        ${d.extra ? `<div style="font-size:11.5px;color:#4b5560;margin-top:4px">${d.extra}</div>` : ""}
        <div style="font-size:11px;color:#2a78d6;margin-top:6px;font-weight:600">Click to open district →</div></div>`).addTo(map);
    };
    const onLeave = () => { map.getCanvas().style.cursor = ""; popup.remove(); map.setFilter("d-hover", ["==", ["get", "geoid"], sel?.tiger_geoid ?? ""]); };
    const onClick = (e: any) => {
      const f = e.features?.[0]; const d = f && byGeoid.get(f.properties.geoid); if (!d) return;
      if (p.onSelect) p.onSelect(d.aun); else router.push(`/api/session?aun=${d.aun}&next=${encodeURIComponent("/district")}`);
    };
    map.on("mousemove", "d-fill", onMove); map.on("mouseleave", "d-fill", onLeave); map.on("click", "d-fill", onClick);
    return () => { map.off("mousemove", "d-fill", onMove); map.off("mouseleave", "d-fill", onLeave); map.off("click", "d-fill", onClick); popup.remove(); };
  }, [ready, p.districts, p.highlight, p.selectedAun, br, byGeoid, p.metricLabel, p.unit, p.onSelect, router]);

  const legendValues = useMemo(() => {
    const vals = p.districts.map((d) => d.value).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [p.districts]);

  return (
    <div className="relative overflow-hidden rounded-[12px] border border-line" style={{ height: p.height ?? 520 }}>
      <div ref={el} className="h-full w-full" />
      {legendValues && (
        <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-surface/95 px-3 py-2 text-[11.5px] shadow-sm backdrop-blur">
          <div className="mb-1 font-semibold text-ink">{p.metricLabel}</div>
          <div className="flex items-center gap-1">
            <span className="num text-ink-3">{legendValues.min.toFixed(0)}{p.unit}</span>
            <span className="flex h-2.5 w-28 overflow-hidden rounded-sm">{RAMP.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
            <span className="num text-ink-3">{legendValues.max.toFixed(0)}{p.unit}</span>
          </div>
          <div className="mt-1 text-ink-3">{p.higherIsBetter ? "Darker is higher (better)" : "Darker is higher (more concern)"} · {p.source}</div>
          {p.highlight && <div className="mt-1 font-medium text-brand-700">{p.highlight.length} district{p.highlight.length === 1 ? "" : "s"} highlighted; others faded</div>}
        </div>
      )}
    </div>
  );
}
