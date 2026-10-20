# Sample SIS export — Shikellamy

Sapphire-style CSV exports generated from the synthetic warehouse (no real students). These files are what a nightly
SIS extract would deliver; `npm run sis:load` reads them through the `SapphireFileConnector` and upserts them into the warehouse.

| File | Rows | Source system |
|---|---|---|
| demographics.csv | 2741 | SIS student demographics |
| attendance.csv | 12074 | SIS daily attendance (non-present codes only) |
| grades.csv | 37284 | SIS gradebook |
| discipline.csv | 552 | SIS discipline / ODR |
| assessment_i_ready_diagnostic.csv | — | i-Ready Diagnostic import file |
| assessment_acadience_reading.csv | — | Acadience Reading import file |
