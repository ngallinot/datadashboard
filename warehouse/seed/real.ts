// Loads REAL public aggregate data into the warehouse: districts, buildings, Future Ready measures,
// designations, PAYS and SAP summaries (where found in Drive). Nothing here is student-level.
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { COUNTIES, DISTRICTS, PROGRAMS, ADOPTIONS, PRACTICES, SCREENER_TOOLS } from "./catalog";

const RAW = path.join(__dirname, "..", "raw");

export interface BuildingInfo { id: number; aun: number; name: string; level: string; gradeLow: number; gradeHigh: number; enrollment: number; econ: number; el: number; sped: number; white: number; hispanic: number; black: number; measures: Record<string, number> }

function parseGrades(text: string | null): [number, number] {
  if (!text) return [0, 12];
  const g: number[] = [];
  for (const tok of text.split(",").map((s) => s.trim())) {
    if (/^PreK/i.test(tok)) g.push(-1);
    else if (/^K/i.test(tok)) g.push(0);
    else if (/^\d+$/.test(tok)) g.push(parseInt(tok, 10));
  }
  if (!g.length) return [0, 12];
  return [Math.max(0, Math.min(...g)), Math.max(...g)];
}

function levelFor(lo: number, hi: number): string {
  if (hi <= 5 && lo <= 2) return "elementary";
  if (hi <= 5) return "intermediate";
  if (lo >= 9) return "high";
  if (lo >= 5 && hi <= 8) return "middle";
  if (lo <= 2 && hi >= 11) return "k12";
  if (lo >= 6) return "secondary";
  return "elementary";
}

export function loadReal(db: Database.Database): BuildingInfo[] {
  const frpa = JSON.parse(fs.readFileSync(path.join(RAW, "frpa", "frpa_extract.json"), "utf8"));
  const years: string[] = Object.keys(frpa.years);
  const latest = years[years.length - 1];

  db.prepare("INSERT INTO meta(key,value) VALUES ('frpa_source',?),('frpa_downloaded',?)").run(frpa.source, frpa.downloaded);
  const insCounty = db.prepare("INSERT INTO counties(geoid,name,lat,lon) VALUES (?,?,?,?)");
  const counties = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "public", "geo", "counties.geojson"), "utf8"));
  for (const f of counties.features) insCounty.run(f.properties.geoid, f.properties.name, f.properties.lat, f.properties.lon);

  const insDistrict = db.prepare(`INSERT INTO districts(aun,name,pde_name,county_geoid,tiger_geoid,lat,lon,sq_miles,website) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insDY = db.prepare(`INSERT INTO district_years(aun,school_year,enrollment,schools,econ_pct,el_pct,sped_pct,gifted_pct,white_pct,black_pct,hispanic_pct,multi_pct,asian_pct,foster_pct,homeless_pct,military_pct,ctc_enrollment,charter_enrollment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const d of DISTRICTS) {
    const rec = frpa.districts[String(d.aun)];
    const ly = rec?.years?.[latest] ?? {};
    insDistrict.run(d.aun, d.name, rec?.pde_name ?? `${d.name} SD`, COUNTIES[d.county].geoid, d.tiger, ly.lat ?? null, ly.lon ?? null, ly.sq_miles ?? null, ly.website ?? null);
    for (const [sy, y] of Object.entries<any>(rec?.years ?? {})) {
      insDY.run(d.aun, sy, y.enrollment, y.schools, y.econ_pct, y.el_pct, y.sped_pct, y.gifted_pct, y.white_pct, y.black_pct, y.hispanic_pct, y.multi_pct, y.asian_pct, y.foster_pct, y.homeless_pct, y.military_pct, y.ctc_enrollment, y.charter_enrollment);
    }
  }

  const insB = db.prepare(`INSERT INTO buildings(id,aun,name,level,grade_low,grade_high,grades_text,title1,lat,lon,address,city,zip,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insBY = db.prepare(`INSERT INTO building_years(building_id,school_year,enrollment,econ_pct,el_pct,sped_pct,white_pct,hispanic_pct,black_pct) VALUES (?,?,?,?,?,?,?,?,?)`);
  const buildings: BuildingInfo[] = [];
  for (const s of Object.values<any>(frpa.schools)) {
    const yrs = Object.keys(s.years).sort();
    const last = yrs[yrs.length - 1];
    const y = s.years[last];
    const active = last === latest ? 1 : 0;
    const [lo, hi] = parseGrades(y.grades);
    insB.run(s.schl, s.aun, s.name, levelFor(lo, hi), lo, hi, y.grades, /yes/i.test(String(y.title1)) ? 1 : 0, y.lat, y.lon, y.address, y.city, y.zip, active);
    for (const sy of yrs) { const yy = s.years[sy]; insBY.run(s.schl, sy, yy.enrollment, yy.econ_pct, yy.el_pct, yy.sped_pct, yy.white_pct, yy.hispanic_pct, yy.black_pct); }
    if (active) buildings.push({ id: s.schl, aun: s.aun, name: s.name, level: levelFor(lo, hi), gradeLow: lo, gradeHigh: hi, enrollment: y.enrollment ?? 300, econ: y.econ_pct ?? 45, el: y.el_pct ?? 1, sped: y.sped_pct ?? 18, white: y.white_pct ?? 85, hispanic: y.hispanic_pct ?? 5, black: y.black_pct ?? 2, measures: {} });
  }

  const insM = db.prepare(`INSERT OR REPLACE INTO building_measures(building_id,school_year,measure,subgroup,value) VALUES (?,?,?,?,?)`);
  const insSW = db.prepare(`INSERT OR REPLACE INTO statewide_measures(school_year,measure,value) VALUES (?,?,?)`);
  const byId = new Map(buildings.map((b) => [b.id, b]));
  for (const [sy, y] of Object.entries<any>(frpa.years)) {
    for (const [m, v] of Object.entries<any>(y.statewide)) insSW.run(sy, m, v);
    for (const row of Object.values<any>(y.measures)) {
      for (const [k, v] of Object.entries<any>(row)) {
        const mm = k.match(/^(\w+)__(\w+)$/);
        if (!mm) continue;
        insM.run(row.schl, sy, mm[1], mm[2], v);
        if (sy === latest && mm[2] === "all" && byId.has(row.schl)) byId.get(row.schl)!.measures[mm[1]] = v;
      }
    }
  }

  // Enrollment-weighted district roll-ups (the user's own regional attendance workbook uses the same method).
  db.exec(`INSERT INTO district_measures(aun,school_year,measure,subgroup,value,n_buildings)
    SELECT b.aun, m.school_year, m.measure, m.subgroup,
           SUM(m.value * COALESCE(by.enrollment, 1)) / SUM(COALESCE(by.enrollment, 1)), COUNT(*)
    FROM building_measures m JOIN buildings b ON b.id = m.building_id
    LEFT JOIN building_years by ON by.building_id = m.building_id AND by.school_year = m.school_year
    GROUP BY b.aun, m.school_year, m.measure, m.subgroup`);

  // School improvement designations 2026-27 (from PDE list of ATSI schools and the CSIU regional attendance workbook).
  const desig: [string, string, string, string | null][] = [
    ["Berwick Area HS", "TSI", "Students with Disabilities", null], ["Berwick Area MS", "TSI", "Students with Disabilities", null],
    ["East Berwick El Sch", "TSI", "Students with Disabilities", null], ["West Berwick El Sch", "TSI", "Students with Disabilities", null],
    ["Line Mountain MS", "TSI", "Students with Disabilities", null], ["Midd-West HS", "TSI", "Students with Disabilities", null],
    ["Mount Carmel Area HS", "TSI", "Students with Disabilities", null], ["Selinsgrove Area HS", "ATSI", "Students with Disabilities", "Grad rate only; pending appeal"],
    ["Shamokin Area El Sch", "TSI", "Students with Disabilities", null], ["Shamokin Area El Sch", "ATSI", "Black", null], ["Shamokin Area El Sch", "ATSI", "Hispanic", null],
    ["Shamokin Area MS", "ATSI", "Hispanic", null], ["Shikellamy HS", "ATSI", "Students with Disabilities", null], ["Shikellamy MS", "ATSI", "English Learner", null],
  ];
  const findB = db.prepare("SELECT id FROM buildings WHERE name = ? AND active = 1");
  const insD = db.prepare("INSERT OR IGNORE INTO designations(building_id,designation,subgroup,note) VALUES (?,?,?,?)");
  for (const [name, t, sg, note] of desig) { const b = findB.get(name) as { id: number } | undefined; if (b) insD.run(b.id, t, sg, note); }

  // Programs and (illustrative) adoptions.
  const insP = db.prepare("INSERT INTO programs(id,name,category,subject,publisher,description) VALUES (?,?,?,?,?,?)");
  for (const p of PROGRAMS) insP.run(p.id, p.name, p.category, p.subject, p.publisher ?? null, p.description);
  const insA = db.prepare("INSERT OR REPLACE INTO program_adoptions(aun,program_id,subject,adoption_year,grade_low,grade_high,tier,notes,source) VALUES (?,?,?,?,?,?,?,?,?)");
  const insS = db.prepare("INSERT OR REPLACE INTO screeners_in_use(aun,tool,subject,grade_low,grade_high,since_year,source) VALUES (?,?,?,?,?,?,?)");
  for (const d of DISTRICTS) {
    const a = ADOPTIONS[d.name]; const p = PRACTICES[d.name]; const s = SCREENER_TOOLS[d.name];
    insA.run(d.aun, a.ela[0], "ela", a.ela[1], 0, 5, "tier1", null, "illustrative");
    if (a.ela68) insA.run(d.aun, a.ela68[0], "ela", a.ela68[1], 0, 8, "tier1", null, "illustrative");
    if (a.phonics) insA.run(d.aun, a.phonics[0], "ela", a.phonics[1], 0, 3, "tier1", "Foundational skills supplement", "illustrative");
    insA.run(d.aun, a.math[0], "math", a.math[1], 0, 5, "tier1", null, "illustrative");
    insA.run(d.aun, a.math612[0], "math", a.math612[1], 6, 12, "tier1", null, "illustrative");
    insA.run(d.aun, a.sel[0], "sel", a.sel[1], 0, 8, "tier1", null, "illustrative");
    if (p.pbis) insA.run(d.aun, "pbis", "behavior", p.pbis, 0, 12, "tier1", null, "illustrative");
    if (p.cico) insA.run(d.aun, "cico", "behavior", p.cico, 0, 12, "tier2", null, "illustrative");
    if (p.restorative) insA.run(d.aun, "restorative", "behavior", p.restorative, 6, 12, "tier1", null, "illustrative");
    if (p.aware) insA.run(d.aun, "school_counseling", "wellness", p.aware, 0, 12, "tier2", "Project AWARE partner district (illustrative)", "illustrative");
    if (p.botvin) insA.run(d.aun, "botvin", "wellness", p.botvin, 6, 9, "tier1", null, "illustrative");
    insA.run(d.aun, "sap", "wellness", 2010, 0, 12, "tier2", "Required in all PA districts (Act 211 / Chapter 12)", "pde");
    insA.run(d.aun, "reading_intervention", "ela", 2015, 0, 8, "tier2", null, "illustrative");
    insA.run(d.aun, "math_reteach", "math", 2018, 0, 8, "tier2", null, "illustrative");
    insA.run(d.aun, "attendance_team", "attendance", 2022, 0, 12, "tier2", "Attendance team per SAIP guidance", "illustrative");
    const sinceR = 2015 + (d.aun % 7); const sinceM = 2017 + (d.aun % 5);
    insS.run(d.aun, s.reading, "reading", 0, s.reading.startsWith("Star") || s.reading.startsWith("i-Ready") ? 8 : 6, sinceR, d.name === "Bloomsburg Area" || d.name === "Millville Area" || d.name === "Southern Columbia Area" ? "drive" : "illustrative");
    insS.run(d.aun, s.math, "math", 0, 8, sinceM, "illustrative");
  }

  loadPays(db);
  loadSap(db);
  return buildings;
}

function loadPays(db: Database.Database) {
  const dir = path.join(RAW, "drive");
  const files = ["pays_part1.json", "pays_part2.json"].map((f) => path.join(dir, f)).filter(fs.existsSync);
  const ins = db.prepare("INSERT OR REPLACE INTO pays_results(aun,school_year,indicator,grade,value,state_value,n_surveyed,source) VALUES (?,?,?,?,?,?,?,?)");
  const aunByName = new Map(DISTRICTS.map((d) => [d.name, d.aun]));
  const loaded = new Set<number>();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const rows: any[] = [...(j.districts ?? [])];
    if (j.iu) rows.push({ ...j.iu, district: "__IU__" });
    for (const d of rows) {
      const aun = d.district === "__IU__" ? null : aunByName.get(d.district);
      if (aun === undefined) continue;
      if (aun) loaded.add(aun);
      for (const [ind, v] of Object.entries<any>(d.indicators ?? {})) {
        if (!v || typeof v !== "object") continue;
        for (const [g, val] of Object.entries<any>(v)) {
          if (val === null || typeof val !== "number") continue;
          if (g === "district_2023_all") { ins.run(aun, "2023-24", ind, "all", val, null, null, "pays"); continue; }
          if (g === "district_2021_all") { ins.run(aun, "2021-22", ind, "all", val, null, null, "pays"); continue; }
          if (g === "state") continue;
          const stateByGrade = v.state_by_grade?.[g];
          ins.run(aun, "2025-26", ind, g.replace(/^g/, ""), val, typeof stateByGrade === "number" ? stateByGrade : (g === "all" && typeof v.state === "number" ? v.state : null), d.n_surveyed ?? null, "pays");
        }
      }
    }
    // IU-wide trend series (2019..2025) from the CSIU 16 cross-sectional trends report and IU profile.
    for (const [yr, obj] of Object.entries<any>(j.trends ?? {})) {
      if (!/^\d{4}$/.test(yr) || !obj || typeof obj !== "object") continue;
      const sy = `${yr}-${String((parseInt(yr, 10) + 1) % 100).padStart(2, "0")}`;
      for (const [ind, v] of Object.entries<any>(obj)) {
        const val = typeof v === "number" ? v : typeof v?.csiu16 === "number" ? v.csiu16 : null;
        if (val === null) continue;
        const cmp = typeof v?.all_other_ius === "number" ? v.all_other_ius : (typeof v?.state === "number" ? v.state : null);
        if (sy === "2025-26") continue;   // the IU profile row above already covers 2025
        ins.run(null, sy, ind, "all", val, cmp, null, "pays");
      }
    }
  }
  db.prepare("INSERT INTO meta(key,value) VALUES ('pays_loaded_auns',?)").run(JSON.stringify([...loaded]));
}

function loadSap(db: Database.Database) {
  const f = path.join(RAW, "drive", "sap_2526.json");
  if (!fs.existsSync(f)) return;
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const ins = db.prepare("INSERT OR REPLACE INTO sap_summary(aun,school_year,category,item,count,source) VALUES (?,?,?,?,?,?)");
  const aunByName = new Map(DISTRICTS.map((d) => [d.name, d.aun]));
  const loaded = new Set<number>();
  for (const d of j.districts ?? []) {
    const aun = aunByName.get(d.district);
    if (!aun) continue;
    loaded.add(aun);
    if (typeof d.total_cases === "number") ins.run(aun, "2025-26", "total", "cases", d.total_cases, "sap");
    for (const cat of ["referrals_by_month", "by_grade", "by_gender", "referral_source", "primary_reason", "parent_permission", "school_service", "community_service", "action_plan", "goals_met", "discontinued_reasons", "special_education"]) {
      const obj = d[cat]; if (!obj || typeof obj !== "object") continue;
      for (const [item, n] of Object.entries<any>(obj)) if (typeof n === "number") ins.run(aun, "2025-26", cat, item, n, "sap");
    }
  }
  db.prepare("INSERT INTO meta(key,value) VALUES ('sap_loaded_auns',?)").run(JSON.stringify([...loaded]));
}
