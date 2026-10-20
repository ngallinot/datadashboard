// Reference catalogs used by the generator: region facts, programs, and names.
// District/county/building facts are real (PDE, Census). Program adoptions are ILLUSTRATIVE.

export const COUNTIES: Record<string, { geoid: string; name: string }> = {
  Columbia: { geoid: "42037", name: "Columbia" },
  Montour: { geoid: "42093", name: "Montour" },
  Northumberland: { geoid: "42097", name: "Northumberland" },
  Snyder: { geoid: "42109", name: "Snyder" },
  Union: { geoid: "42119", name: "Union" },
};

export interface DistrictFact { aun: number; name: string; county: keyof typeof COUNTIES; tiger: string }
export const DISTRICTS: DistrictFact[] = [
  { aun: 116191004, name: "Benton Area", county: "Columbia", tiger: "4203390" },
  { aun: 116191103, name: "Berwick Area", county: "Columbia", tiger: "4203480" },
  { aun: 116191203, name: "Bloomsburg Area", county: "Columbia", tiger: "4203840" },
  { aun: 116191503, name: "Central Columbia", county: "Columbia", tiger: "4205370" },
  { aun: 116471803, name: "Danville Area", county: "Montour", tiger: "4207320" },
  { aun: 116604003, name: "Lewisburg Area", county: "Union", tiger: "4213590" },
  { aun: 116493503, name: "Line Mountain", county: "Northumberland", tiger: "4214460" },
  { aun: 116555003, name: "Midd-West", county: "Snyder", tiger: "4215210" },
  { aun: 116605003, name: "Mifflinburg Area", county: "Union", tiger: "4226010" },
  { aun: 116195004, name: "Millville Area", county: "Columbia", tiger: "4215450" },
  { aun: 116495003, name: "Milton Area", county: "Northumberland", tiger: "4215480" },
  { aun: 116495103, name: "Mount Carmel Area", county: "Northumberland", tiger: "4215990" },
  { aun: 116557103, name: "Selinsgrove Area", county: "Snyder", tiger: "4221120" },
  { aun: 116496503, name: "Shamokin Area", county: "Northumberland", tiger: "4221240" },
  { aun: 116496603, name: "Shikellamy", county: "Northumberland", tiger: "4221540" },
  { aun: 116197503, name: "Southern Columbia Area", county: "Columbia", tiger: "4222260" },
  { aun: 116498003, name: "Warrior Run", county: "Northumberland", tiger: "4224870" },
];

export const SCHOOL_YEARS = ["2023-24", "2024-25", "2025-26", "2026-27"] as const;
export const CURRENT_YEAR = "2026-27";
export const PRIOR_YEAR = "2025-26";
export const TODAY = "2026-10-20";
export const FIRST_DAY = "2026-08-25";

export interface Program { id: string; name: string; category: "curriculum" | "intervention" | "practice" | "screener" | "wellness"; subject: string | null; publisher?: string; description: string }
export const PROGRAMS: Program[] = [
  // ELA core curricula
  { id: "ckla", name: "CKLA (Core Knowledge Language Arts)", category: "curriculum", subject: "ela", publisher: "Amplify", description: "Knowledge-building K-5 ELA curriculum with explicit foundational skills." },
  { id: "wit_wisdom", name: "Wit & Wisdom", category: "curriculum", subject: "ela", publisher: "Great Minds", description: "Text-based K-8 ELA curriculum." },
  { id: "el_education", name: "EL Education Language Arts", category: "curriculum", subject: "ela", publisher: "EL Education", description: "Module-based K-8 ELA curriculum." },
  { id: "into_reading", name: "Into Reading", category: "curriculum", subject: "ela", publisher: "HMH", description: "K-6 comprehensive ELA program." },
  { id: "wonders", name: "Wonders", category: "curriculum", subject: "ela", publisher: "McGraw Hill", description: "K-6 comprehensive ELA program." },
  { id: "fundations", name: "Fundations", category: "curriculum", subject: "ela", publisher: "Wilson", description: "K-3 structured phonics supplement." },
  { id: "heggerty", name: "Heggerty Phonemic Awareness", category: "curriculum", subject: "ela", publisher: "Heggerty", description: "Daily phonemic awareness routine, PreK-2." },
  // Math core curricula
  { id: "eureka", name: "Eureka Math", category: "curriculum", subject: "math", publisher: "Great Minds", description: "K-12 math curriculum aligned to progressions." },
  { id: "illustrative", name: "Illustrative Mathematics", category: "curriculum", subject: "math", publisher: "Illustrative Mathematics", description: "Problem-based K-12 math curriculum." },
  { id: "bridges", name: "Bridges in Mathematics", category: "curriculum", subject: "math", publisher: "Math Learning Center", description: "K-5 math with Number Corner." },
  { id: "envision", name: "enVision Mathematics", category: "curriculum", subject: "math", publisher: "Savvas", description: "K-12 math program." },
  { id: "big_ideas", name: "Big Ideas Math", category: "curriculum", subject: "math", publisher: "Big Ideas Learning", description: "6-12 math program." },
  // Academic interventions
  { id: "reading_intervention", name: "Small-group reading intervention", category: "intervention", subject: "ela", description: "Tier 2 skills-based reading group, 3-5x/week, progress monitored." },
  { id: "wilson", name: "Wilson Reading System", category: "intervention", subject: "ela", publisher: "Wilson", description: "Tier 3 structured literacy intervention." },
  { id: "math_reteach", name: "Small-group math reteach", category: "intervention", subject: "math", description: "Targeted reteach of missed benchmark skills, 2-4x/week." },
  { id: "credit_recovery", name: "Credit recovery plan", category: "intervention", subject: "academic", description: "Structured plan to recover failed credits with check-ins." },
  { id: "tutoring", name: "High-dosage tutoring", category: "intervention", subject: "academic", description: "1:3 tutoring 3x/week during the school day." },
  // Behavior / SEL
  { id: "pbis", name: "PBIS (School-wide Positive Behavior Supports)", category: "practice", subject: "behavior", description: "Tier 1 framework with taught expectations and acknowledgment systems." },
  { id: "cico", name: "Check-In/Check-Out", category: "intervention", subject: "behavior", description: "Daily check-in with a trusted adult and a point card; Tier 2." },
  { id: "second_step", name: "Second Step", category: "curriculum", subject: "sel", publisher: "Committee for Children", description: "K-8 social-emotional learning curriculum." },
  { id: "zones", name: "Zones of Regulation", category: "curriculum", subject: "sel", description: "Self-regulation framework and lessons." },
  { id: "botvin", name: "Botvin LifeSkills Training", category: "curriculum", subject: "wellness", description: "Evidence-based substance use prevention, grades 6-9." },
  { id: "restorative", name: "Restorative practices", category: "practice", subject: "behavior", description: "Circles and restorative conferences as alternatives to exclusion." },
  { id: "mentoring", name: "Adult mentoring", category: "intervention", subject: "behavior", description: "Weekly structured mentoring with a staff member." },
  { id: "behavior_plan", name: "Individual behavior support plan", category: "intervention", subject: "behavior", description: "Function-based plan with teaching, prevention, and reinforcement." },
  // Attendance / family
  { id: "attendance_meeting", name: "Family attendance meeting", category: "intervention", subject: "attendance", description: "Structured meeting with family to identify barriers and agree on a plan (SAIP)." },
  { id: "attendance_team", name: "Attendance team monitoring", category: "intervention", subject: "attendance", description: "Weekly review and outreach by the school attendance team." },
  { id: "morning_checkin", name: "Monday connection check-in", category: "intervention", subject: "attendance", description: "Brief welcome routine with a trusted adult on high-absence days." },
  { id: "home_visit", name: "Home visit", category: "intervention", subject: "family", description: "Visit by a school social worker or liaison to reduce barriers." },
  { id: "transportation", name: "Transportation / basic-needs support", category: "intervention", subject: "family", description: "Help with transportation, clothing, or food insecurity." },
  // Wellness / SAP
  { id: "sap", name: "Student Assistance Program (SAP) referral", category: "intervention", subject: "wellness", description: "Team-based referral with screening by the CSIU/county SAP liaison." },
  { id: "school_counseling", name: "School-based counseling (Project AWARE)", category: "intervention", subject: "wellness", description: "Short-term individual counseling by a school-based clinician." },
  { id: "coping_group", name: "Tier 2 coping skills group", category: "intervention", subject: "wellness", description: "6-8 week small group on anxiety and coping skills." },
  { id: "outpatient", name: "Community mental health referral", category: "intervention", subject: "wellness", description: "Referral to outpatient services; school coordinates with provider." },
  { id: "wellness_checkin", name: "Weekly wellness check-in", category: "practice", subject: "wellness", description: "Brief weekly check-in screen reviewed by the counselor." },
  // Screeners
  { id: "acadience", name: "Acadience Reading", category: "screener", subject: "ela", publisher: "Acadience Learning", description: "K-6 reading benchmark and progress monitoring (DIBELS Next successor)." },
  { id: "aimsweb", name: "aimswebPlus", category: "screener", subject: "ela", publisher: "Pearson", description: "K-8 reading and math benchmark and progress monitoring." },
  { id: "dibels8", name: "DIBELS 8th Edition", category: "screener", subject: "ela", publisher: "University of Oregon", description: "K-8 reading benchmark." },
  { id: "star", name: "Star Reading / Star Math", category: "screener", subject: "ela", publisher: "Renaissance", description: "Computer-adaptive K-12 reading and math screener." },
  { id: "iready", name: "i-Ready Diagnostic", category: "screener", subject: "ela", publisher: "Curriculum Associates", description: "K-8 adaptive reading and math diagnostic." },
];

// Screener tools per district. Drive evidence: Bloomsburg trains on Acadience; Millville and Southern Columbia hold aimsweb reports.
// Everything else is illustrative.
export const SCREENER_TOOLS: Record<string, { reading: string; math: string }> = {
  "Benton Area": { reading: "DIBELS 8th Edition", math: "Star Math" },
  "Berwick Area": { reading: "Acadience Reading", math: "aimswebPlus" },
  "Bloomsburg Area": { reading: "Acadience Reading", math: "Acadience Math" },
  "Central Columbia": { reading: "Star Reading", math: "Star Math" },
  "Danville Area": { reading: "Acadience Reading", math: "i-Ready Diagnostic" },
  "Lewisburg Area": { reading: "DIBELS 8th Edition", math: "i-Ready Diagnostic" },
  "Line Mountain": { reading: "aimswebPlus", math: "aimswebPlus" },
  "Midd-West": { reading: "Acadience Reading", math: "Star Math" },
  "Mifflinburg Area": { reading: "Acadience Reading", math: "aimswebPlus" },
  "Millville Area": { reading: "aimswebPlus", math: "aimswebPlus" },
  "Milton Area": { reading: "Acadience Reading", math: "Acadience Math" },
  "Mount Carmel Area": { reading: "DIBELS 8th Edition", math: "Star Math" },
  "Selinsgrove Area": { reading: "Star Reading", math: "Star Math" },
  "Shamokin Area": { reading: "aimswebPlus", math: "aimswebPlus" },
  "Shikellamy": { reading: "Acadience Reading", math: "i-Ready Diagnostic" },
  "Southern Columbia Area": { reading: "aimswebPlus", math: "aimswebPlus" },
  "Warrior Run": { reading: "Acadience Reading", math: "Star Math" },
};

// Illustrative core curriculum adoptions. Adoption years vary so "years in use" has an answer.
// ELA K-5 choice, Math K-5 choice, Math 6-12 choice, SEL choice.
export const ADOPTIONS: Record<string, { ela: [string, number]; ela68?: [string, number]; math: [string, number]; math612: [string, number]; sel: [string, number]; phonics?: [string, number] }> = {
  "Benton Area": { ela: ["wonders", 2018], math: ["envision", 2020], math612: ["big_ideas", 2019], sel: ["second_step", 2021], phonics: ["heggerty", 2022] },
  "Berwick Area": { ela: ["ckla", 2024], math: ["eureka", 2017], math612: ["eureka", 2017], sel: ["second_step", 2019], phonics: ["fundations", 2020] },
  "Bloomsburg Area": { ela: ["into_reading", 2021], math: ["bridges", 2022], math612: ["illustrative", 2023], sel: ["zones", 2020], phonics: ["heggerty", 2021] },
  "Central Columbia": { ela: ["wit_wisdom", 2020], ela68: ["wit_wisdom", 2020], math: ["eureka", 2016], math612: ["big_ideas", 2021], sel: ["second_step", 2018] },
  "Danville Area": { ela: ["ckla", 2022], math: ["illustrative", 2022], math612: ["illustrative", 2022], sel: ["second_step", 2017], phonics: ["fundations", 2019] },
  "Lewisburg Area": { ela: ["el_education", 2019], ela68: ["el_education", 2019], math: ["bridges", 2018], math612: ["illustrative", 2021], sel: ["second_step", 2016] },
  "Line Mountain": { ela: ["wonders", 2019], math: ["envision", 2021], math612: ["big_ideas", 2020], sel: ["zones", 2022], phonics: ["fundations", 2023] },
  "Midd-West": { ela: ["ckla", 2023], math: ["eureka", 2019], math612: ["big_ideas", 2018], sel: ["second_step", 2020], phonics: ["heggerty", 2023] },
  "Mifflinburg Area": { ela: ["into_reading", 2022], math: ["envision", 2023], math612: ["envision", 2023], sel: ["second_step", 2019] },
  "Millville Area": { ela: ["wonders", 2017], math: ["envision", 2019], math612: ["big_ideas", 2019], sel: ["zones", 2021], phonics: ["heggerty", 2024] },
  "Milton Area": { ela: ["ckla", 2019], math: ["eureka", 2018], math612: ["eureka", 2018], sel: ["second_step", 2018], phonics: ["fundations", 2019] },
  "Mount Carmel Area": { ela: ["into_reading", 2020], math: ["envision", 2018], math612: ["big_ideas", 2022], sel: ["second_step", 2022], phonics: ["heggerty", 2022] },
  "Selinsgrove Area": { ela: ["wit_wisdom", 2021], ela68: ["wit_wisdom", 2021], math: ["bridges", 2020], math612: ["illustrative", 2024], sel: ["second_step", 2017], phonics: ["fundations", 2021] },
  "Shamokin Area": { ela: ["wonders", 2021], math: ["eureka", 2021], math612: ["eureka", 2021], sel: ["zones", 2023], phonics: ["heggerty", 2021] },
  "Shikellamy": { ela: ["ckla", 2021], math: ["illustrative", 2023], math612: ["illustrative", 2023], sel: ["second_step", 2020], phonics: ["fundations", 2021] },
  "Southern Columbia Area": { ela: ["into_reading", 2019], math: ["envision", 2017], math612: ["big_ideas", 2017], sel: ["second_step", 2021], phonics: ["heggerty", 2020] },
  "Warrior Run": { ela: ["ckla", 2020], math: ["bridges", 2019], math612: ["big_ideas", 2021], sel: ["zones", 2019], phonics: ["heggerty", 2020] },
};

// Behavior frameworks and wellness programs (illustrative).
export const PRACTICES: Record<string, { pbis: number | null; cico: number | null; restorative: number | null; aware: number | null; botvin: number | null }> = {
  "Benton Area": { pbis: 2019, cico: 2021, restorative: null, aware: 2024, botvin: null },
  "Berwick Area": { pbis: 2016, cico: 2018, restorative: 2023, aware: 2023, botvin: 2021 },
  "Bloomsburg Area": { pbis: 2018, cico: 2020, restorative: null, aware: 2023, botvin: null },
  "Central Columbia": { pbis: 2017, cico: 2019, restorative: null, aware: null, botvin: 2022 },
  "Danville Area": { pbis: 2015, cico: 2017, restorative: 2022, aware: 2023, botvin: null },
  "Lewisburg Area": { pbis: 2016, cico: 2019, restorative: 2021, aware: null, botvin: 2020 },
  "Line Mountain": { pbis: 2021, cico: 2023, restorative: null, aware: 2024, botvin: null },
  "Midd-West": { pbis: 2018, cico: 2020, restorative: null, aware: 2024, botvin: 2023 },
  "Mifflinburg Area": { pbis: 2017, cico: 2021, restorative: null, aware: null, botvin: null },
  "Millville Area": { pbis: 2020, cico: 2022, restorative: null, aware: 2024, botvin: null },
  "Milton Area": { pbis: 2014, cico: 2016, restorative: 2020, aware: 2023, botvin: 2019 },
  "Mount Carmel Area": { pbis: 2019, cico: 2022, restorative: null, aware: 2023, botvin: null },
  "Selinsgrove Area": { pbis: 2016, cico: 2018, restorative: 2024, aware: null, botvin: 2021 },
  "Shamokin Area": { pbis: 2017, cico: 2019, restorative: 2022, aware: 2023, botvin: 2020 },
  "Shikellamy": { pbis: 2015, cico: 2017, restorative: 2021, aware: 2023, botvin: 2022 },
  "Southern Columbia Area": { pbis: 2018, cico: 2021, restorative: null, aware: null, botvin: null },
  "Warrior Run": { pbis: 2019, cico: 2021, restorative: null, aware: 2024, botvin: null },
};

export const FIRST_NAMES_F = ["Ava", "Emma", "Olivia", "Sophia", "Mia", "Isabella", "Harper", "Evelyn", "Abigail", "Ella", "Grace", "Lily", "Chloe", "Zoey", "Nora", "Hazel", "Aubrey", "Addison", "Brooklyn", "Savannah", "Leah", "Stella", "Maya", "Natalie", "Lucy", "Paisley", "Kinsley", "Aurora", "Everly", "Willow", "Madelyn", "Piper", "Ruby", "Aria", "Scarlett", "Layla", "Riley", "Peyton", "Mackenzie", "Kaylee", "Autumn", "Sadie", "Hadley", "Josie", "Elena", "Sofia", "Valeria", "Camila", "Isla", "Nevaeh", "Jade", "Brielle", "Delaney", "Kendall", "Quinn", "Reagan", "Sawyer", "Tessa", "Vivian", "Wren"];
export const FIRST_NAMES_M = ["Liam", "Noah", "Oliver", "Elijah", "Lucas", "Mason", "Logan", "Ethan", "Jacob", "Aiden", "Jackson", "Levi", "Owen", "Wyatt", "Carter", "Luke", "Jordan", "Eli", "Isaac", "Caleb", "Hunter", "Landon", "Colton", "Brayden", "Easton", "Cooper", "Nolan", "Ryder", "Bentley", "Gavin", "Jaxon", "Micah", "Silas", "Theo", "Tucker", "Weston", "Zane", "Mateo", "Luis", "Diego", "Santiago", "Andre", "Julian", "Adrian", "Kai", "Rowan", "Asher", "Finn", "Grayson", "Hudson", "Jace", "Kyler", "Lincoln", "Maddox", "Parker", "Reid", "Sawyer", "Tanner", "Wesley", "Xavier"];
export const LAST_NAMES = ["Miller", "Smith", "Snyder", "Yoder", "Zimmerman", "Hoffman", "Kline", "Reichenbach", "Keiser", "Wagner", "Shaffer", "Fisher", "Weaver", "Stahl", "Kerstetter", "Wolfe", "Bingaman", "Shultz", "Herr", "Bowersox", "Troutman", "Rhoads", "Hummel", "Kratzer", "Beaver", "Lauver", "Moyer", "Dietrich", "Brouse", "Steiner", "Rivera", "Martinez", "Garcia", "Lopez", "Hernandez", "Torres", "Ramos", "Reyes", "Johnson", "Williams", "Brown", "Jones", "Davis", "Thomas", "Wilson", "Anderson", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Carter", "Mitchell", "Roberts", "Campbell", "Phillips", "Evans", "Turner", "Parker", "Collins", "Edwards", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Reed", "Bailey", "Bell", "Cooper", "Richardson", "Cox", "Howard", "Ward", "Peterson", "Gray", "James", "Watson", "Brooks", "Kelly", "Sanders", "Price", "Bennett", "Wood", "Barnes", "Ross", "Henderson", "Coleman", "Jenkins", "Perry", "Powell", "Long", "Patterson", "Hughes", "Flores", "Washington", "Butler", "Simmons", "Foster", "Gonzales", "Bryant", "Alexander", "Russell", "Griffin", "Diaz", "Hayes", "Nguyen", "Patel", "Kim", "Chen"];
