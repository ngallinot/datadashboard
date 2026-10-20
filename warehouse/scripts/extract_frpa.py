"""Extract CSIU 16 district and school measures from PDE Future Ready PA Index data files.

Input:  warehouse/raw/frpa/Datafile_YYYYYYYY.xlsx, SchoolFastFacts_*.xlsx, DistrictFastFacts_*.xlsx
Output: warehouse/raw/frpa/frpa_extract.json  (real public aggregate data; no student-level data)

Run: python3 warehouse/scripts/extract_frpa.py
"""
import json, os, re, sys
import openpyxl

RAW = os.path.join(os.path.dirname(__file__), "..", "raw", "frpa")
YEARS = {"20212022": "2021-22", "20222023": "2022-23", "20232024": "2023-24", "20242025": "2024-25"}

# AUN -> short district name used throughout the app
DISTRICTS = {
    116191004: "Benton Area", 116191103: "Berwick Area", 116191203: "Bloomsburg Area",
    116191503: "Central Columbia", 116471803: "Danville Area", 116604003: "Lewisburg Area",
    116493503: "Line Mountain", 116555003: "Midd-West", 116605003: "Mifflinburg Area",
    116195004: "Millville Area", 116495003: "Milton Area", 116495103: "Mount Carmel Area",
    116557103: "Selinsgrove Area", 116496503: "Shamokin Area", 116496603: "Shikellamy",
    116197503: "Southern Columbia Area", 116498003: "Warrior Run",
}

# measure key -> column prefix (the part before _<Subgroup>)
MEASURES = {
    "math_prof": "PercentProficientorAdvancedonMathematicsAlgebra1",
    "math_adv": "PercentAdvancedonMathematicsAlgebra1",
    "math_growth": "MeetingAnnualAcademicGrowthExpectations_PVAASMathematicsAlgebra1",
    "ela_prof": "PercentProficientorAdvancedonELALiterature",
    "ela_adv": "PercentAdvancedonELALiterature",
    "ela_growth": "MeetingAnnualAcademicGrowthExpectations_PVAASELALiterature",
    "sci_prof": "PercentProficientorAdvancedonScienceBiology",
    "sci_growth": "MeetingAnnualAcademicGrowthExpectations_PVAASScienceBiology",
    "regular_attendance": "PercentPersistentAttendance",
    "chronic_absent_n": "NumberofStudentsChronicAbsent",
    "chronic_absent_pct": "PercentChronicAbsenteeism",
    "grade3_reading": "PercentGrade3Reading",
    "grade7_math": "PercentGrade7Mathematics",
    "el_proficiency": "PercentEnglishLanguageProficiency",
    "grad_4yr": "PercentGraduation4YearCohort",
    "grad_5yr": "PercentGraduation5YearCohort",
    "career_benchmark": "PercentGrade5Grade8andorGrade11CareerStandardsBenchmark",
    "rigorous_courses": "Percent12thGradersRigorousCoursesofStudy",
    "postsec_transition": "PercentofGraduatesPostSecondaryTransitiontoSchoolMilitaryorWork",
}
SUBGROUPS = {
    "all": "AllStudent", "econ": "EconomicallyDisadvantaged", "swd": "StudentswithDisabilities",
    "el": "EnglishLearner", "white": "White", "black": "Black", "hispanic": "Hispanic", "multi": "2orMoreRaces",
}


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s in ("IS", "NA", "N/A", "--", "*"):
        return None  # insufficient sample
    try:
        return float(s.replace("%", ""))
    except ValueError:
        return None


def read_sheet(path, sheet_idx=None):
    wb = openpyxl.load_workbook(path, read_only=True)
    out = []
    sheets = wb.worksheets if sheet_idx is None else [wb.worksheets[sheet_idx]]
    for ws in sheets:
        rows = ws.iter_rows(values_only=True)
        hdr = [str(h) if h is not None else "" for h in next(rows)]
        recs = []
        for r in rows:
            d = dict(zip(hdr, r))
            try:
                aun = int(float(d.get("AUN") or 0))
            except (TypeError, ValueError):
                continue
            if aun in DISTRICTS:
                recs.append(d)
        out.append((ws.title, hdr, recs))
    return out


def school_code(v):
    try:
        return int(float(v or 0))
    except (TypeError, ValueError):
        return 0


def main():
    result = {"source": "PA Future Ready Index data files (futurereadypa.org/Home/DataFiles), PDE",
              "downloaded": "2026-10-20", "years": {}, "districts": {}, "schools": {}}

    for code, label in YEARS.items():
        year = {"measures": {}, "statewide": {}}
        for title, hdr, recs in read_sheet(os.path.join(RAW, f"Datafile_{code}.xlsx")):
            for d in recs:
                aun = int(float(d["AUN"]))
                schl = school_code(d.get("Schl"))
                key = f"{aun}:{schl}"
                entry = year["measures"].setdefault(key, {"aun": aun, "schl": schl, "name": d.get("Name")})
                for mk, prefix in MEASURES.items():
                    for sk, sfx in SUBGROUPS.items():
                        col = f"{prefix}_{sfx}"
                        if col in d:
                            v = num(d[col])
                            if v is not None:
                                entry[f"{mk}__{sk}"] = v
                    sw = f"StatewideAverage{prefix}_AllStudent"
                    if sw in d and num(d[sw]) is not None:
                        year["statewide"][mk] = num(d[sw])
        result["years"][label] = year

        # fast facts
        sf = os.path.join(RAW, f"SchoolFastFacts_{code}.xlsx")
        if os.path.exists(sf):
            for title, hdr, recs in read_sheet(sf, 0):
                for d in recs:
                    aun = int(float(d["AUN"])); schl = school_code(d.get("Schl"))
                    s = result["schools"].setdefault(f"{aun}:{schl}", {"aun": aun, "schl": schl, "district": DISTRICTS[aun], "years": {}})
                    s["name"] = d.get("Name")
                    s["years"][label] = {
                        "grades": d.get("GradesOffered"), "title1": d.get("TitleISchool"),
                        "enrollment": num(d.get("Enrollment")),
                        "econ_pct": num(d.get("EconomicallyDisadvantaged")), "el_pct": num(d.get("EnglishLearner")),
                        "sped_pct": num(d.get("SpecialEducation")), "white_pct": num(d.get("White")),
                        "hispanic_pct": num(d.get("Hispanic")), "black_pct": num(d.get("Black")),
                        "lat": num(d.get("Latitude")), "lon": num(d.get("Longitude")),
                        "address": d.get("StreetAddress"), "city": d.get("City"), "zip": d.get("ZipCode"),
                    }
        df = os.path.join(RAW, f"DistrictFastFacts_{code}.xlsx")
        if os.path.exists(df):
            for title, hdr, recs in read_sheet(df, 0):
                for d in recs:
                    aun = int(float(d["AUN"]))
                    dd = result["districts"].setdefault(str(aun), {"aun": aun, "name": DISTRICTS[aun], "pde_name": d.get("DistrictName"), "years": {}})
                    dd["years"][label] = {
                        "schools": num(d.get("NumberofSchools")), "enrollment": num(d.get("DistrictEnrollment")),
                        "econ_pct": num(d.get("EconomicallyDisadvantaged")), "el_pct": num(d.get("EnglishLearner")),
                        "sped_pct": num(d.get("SpecialEducation")), "gifted_pct": num(d.get("PercentofGiftedStudents")),
                        "white_pct": num(d.get("White")), "hispanic_pct": num(d.get("Hispanic")), "black_pct": num(d.get("Black")),
                        "multi_pct": num(d.get("TwoOrMoreRaces")), "asian_pct": num(d.get("Asian")),
                        "ctc_enrollment": num(d.get("EnrollmentinPartneringCareerandTechnicalCenter")),
                        "charter_enrollment": num(d.get("CharterSchoolEnrollment")),
                        "sq_miles": num(d.get("GeographicSizeofDistrict")), "ctc_name": d.get("CareerandTechnicalCenterName"),
                        "foster_pct": num(d.get("FosterCare")), "homeless_pct": num(d.get("Homeless")),
                        "military_pct": num(d.get("MilitaryConnected")), "lat": num(d.get("Latitude")), "lon": num(d.get("Longitude")),
                        "website": d.get("Website"),
                    }

    out = os.path.join(RAW, "frpa_extract.json")
    with open(out, "w") as f:
        json.dump(result, f, indent=1)
    # summary
    for label, y in result["years"].items():
        n_d = sum(1 for k in y["measures"] if k.endswith(":0"))
        print(label, "rows:", len(y["measures"]), "district rows:", n_d, "statewide keys:", len(y["statewide"]))
    print("schools:", len(result["schools"]), "districts:", len(result["districts"]))
    print("wrote", out)


if __name__ == "__main__":
    main()
