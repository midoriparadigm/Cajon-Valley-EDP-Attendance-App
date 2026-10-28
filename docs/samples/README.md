# EDP Reports (samples)

Samples of the locked audit-trail reports the app would save to the district's Google Drive
(or other cloud storage). **All data in them is made up.** They are laid out in the same
folders they would have in Drive:

```
Sample Elementary EDP/
  2026-27/
    Daily Reports/
      edp-daily-2026-10-27.pdf        one per site per day: every student
    Grade 2/
      Liam Smith/
        edp-2026-10-27-1012.pdf       one per student per day attended
```

The school year sits above the grade folders because a student's grade changes each August.

- **Daily Report**: the whole site for one day, with totals, every incident report and
  parent letter, the attendance sheet and the full activity log.
- **Student Daily Report**: one student for one day: attendance and time attended, that
  student's incident reports, every letter and text sent to the family, and every log entry.
  A student only gets one for days they attended.

Student files are named `edp-<date>-<student ID>.pdf`, so they sort by date within the
student's folder and stay unique if downloaded together. This sample day covers every report
type: a Green Card (Liam Smith), a We Care report (Noor Ali), a head injury report (Mateo
Rodriguez), an early release and a pickup contact approval (Sofia Yako), and an undone
check-in (Omar Khan).

To regenerate all of them (needs Google Chrome; set `CHROME` to its path if it isn't in
/Applications):

```bash
node docs/samples/make-record-samples.mjs
```

Layout follows the CDE PDF Standards (https://www.cde.ca.gov/re/di/ws/pdf.asp):
Letter size, tagged PDF, a single H1 and ordered headings in Title Case, Arial
12 pt or larger, simple tables with one header row that repeats on each page,
no blank cells, black on white, document title and language set, no author name.
