# P1 — Production Path Audit

**Date:** 2026-10-06 · **Scope:** deployment-readiness audit only (U0–U6 locked, no feature work)

## 1. Production entry point

`src/index.html` — remains the **sole** runtime entry point. Served as
`/src/` (directory index) or `/src/index.html`. No second entry point was
created; no application file was duplicated.

## 2. Recommended publish directory

**The repository root** (Netlify publish directory `.` / repo root).

Rationale: every runtime path in the app is relative to `src/index.html`:

- `css/…`, `js/…`, `components/…` → resolve inside `src/`
- `../data/schedule/daily/`, `../data/syllabus/`, `../data/calendar/…` → repo `data/`
- `../assets/logo/…`, `../assets/svg/…`, `../assets/favicon_io/…` → repo `assets/`

Publishing `src/` alone would break `../data/` and `../assets/` (they would fall
outside the published tree). Publishing the root preserves the existing
structure with **zero file movement** — the smallest, safest architecture.

## 3. Recommended live URL structure

- `https://<site>/` → **302 → `/src/`** (clean root URL; see netlify.toml)
- `https://<site>/src/` → application
- Deep links (hash, no server rewrites needed):
  - `…/src/#/calendar`, `…/src/#/progress`, `…/src/#/reports`
  - `…/src/#/reports/week/1`, `…/src/#/reports/day/2026-10-02`, `…/src/#/day/2026-10-02`

A **redirect** (not a rewrite) is used deliberately: a rewrite would leave the
URL bar at `/` and the app's relative paths (`css/…`, `../data/…`) would resolve
against the wrong base. The redirect puts `/src/` in the URL bar, so all
relative paths resolve exactly as they do locally. Browsers preserve the
`#fragment` across this redirect, so deep links survive.

## 4. Path audit result — **PASS**

| Area | Result |
|---|---|
| HTML `<script src>` / `<link href>` | All relative (`css/…`, `js/…`, `components/…`) — 0 missing, 0 absolute |
| Favicon links | Relative `../assets/favicon_io/…` (favicon.ico, 32×32, 16×16) |
| Image/SVG refs | Relative `../assets/logo/…`, `../assets/svg/…` (logo + Home/Progress/Reports nav + shared back-arrow in JS-rendered HTML) |
| JS `fetch(...)` | Only `DataEngine.loadJsonFromUrl(url)` fed by `window.STUDY_PLANNER_CONFIG` / `DEFAULT_CONFIG`, all relative (`../data/…`) |
| Dynamic URL construction | Only `dataBase + date + '.json'` and config syllabus/calendar paths — no host/origin/absolute construction (`location.href/origin/host`: **0 hits** in `src/`) |
| CSS `url(...)` | **None** — zero `url()` references in `src/css/**`; all imagery is `<img>` |
| Export download | `Blob` + `URL.createObjectURL` (client-side, no server, no paths) |

## 5. Data path result — **PASS** (verified live, HTTP 200)

- `data/calendar/calendar-2026.json` → 200
- `data/schedule/daily/2026-10-02.json` … `2026-10-29.json` → **all 28 files 200**
- `data/syllabus/{mathematics-i,statistics,computational-thinking,english}.json` → 200 (loaded when Reports open)
- `data/progress/progress.json` is **not fetched at runtime** — `progress-engine.js`
  only references it in comments as the derived-cache *shape*; progress state is
  computed from localStorage (`storage.js`). No runtime dependency.

## 6. Asset path result — **PASS** (verified live, HTTP 200)

- `assets/logo/Study-Planner-Logo.svg` → 200
- `assets/svg/{home,progress,report}.svg` → 200 (nav); `assets/svg/back-arrow.svg` referenced relatively by components
- All asset references are relative — **no absolute Windows path anywhere in runtime code**

## 7. Favicon result — **PASS** (verified live, HTTP 200)

`assets/favicon_io/favicon.ico` requested and returned **200** on boot from
`/src/`. The three `<link>` tags (ico, 32×32, 16×16) resolve correctly from the
production `/src/` location via `../assets/favicon_io/`. The ico + PNG set on
disk matches exactly what `index.html` references — no dangling references.

## 8. Hash-routing result — **PASS**

`router.js` is a pure hash router (`location.hash` + `hashchange`; no
`pushState`, no server-route assumptions). The server only ever sees `/src/`;
every `#/…` deep link is client-side. Verified **hard refresh
(cache-bypassed reload)** of `http://…/src/#/reports/day/2026-10-02`: content
fully re-rendered, zero console errors. Static hosting needs **no rewrites**
for any existing route.

## 9. Export result — **PASS** (verified live)

Clicked *Export HTML* on `#/reports/day/2026-10-02`; captured the generated
document before download:

- File `2026-10-02.html`, 9,912 bytes, title `Daily report — 2026-10-02`
- `<script src>`: **none** · external stylesheet: **none** · `localhost`/`127.0.0.1`/`file://`: **none** · external HTTP refs: **none**

Fully standalone; download uses Blob/object-URL, works identically on any
static host. Export behavior/HTML structure **unchanged** (no production-path
defect found).

## 10. Localhost / filesystem dependency result — **CLEAN**

Searched the entire runtime tree `src/**` for `localhost`, `127.0.0.1`,
`:8099`, `:8098`, `file:///`, `E:\`, `http(s)://`:

- Only 2 hits, both **comments**: `index.html` (note that `file://` blocks
  `fetch`) and `app.js:1444` ("localhost says" — explaining why native prompts
  are not used). Neither executes or resolves anything.
- Project-wide `localhost`/`:8099` hits outside `src/` are confined to
  `reports/*.md` (historical QA documentation — legitimately descriptive).
- `127.0.0.1` hits are confined to saved reference HTML under `reference/`
  (SingleFile metadata; never loaded by the app).
- `E:\Study-Planner` hits only in `.claude/settings.json` / `.cortex/config.json`
  (agent tooling; not runtime).
- **No runtime code depends on a local machine path or dev server.**

## 11. GitHub readiness — **READY (with one P2 action)**

- Committed-safe: `src/`, `data/`, `assets/`, `docs/`, `tests/`, `reports/`,
  `tools/`, `reference/`, `README.md`, `PROJECT_SPECIFICATION.md`, `CLAUDE.md`,
  `TRACKING_STORAGE_MANIFEST.json`, `generated/.gitkeep`, `.gitignore`, `netlify.toml`.
- **Action for P2 (not done here — no git repo was created in P1):** add
  `.claude/` to `.gitignore` before the first commit. `src/manifest.json` and
  `src/service-worker.js` are **0-byte orphan stubs** (U0 audit R-10); they are
  not referenced by `index.html`, not registered (no `serviceWorker` code
  exists), and are inert — leaving them is harmless.
- No temporary browser/server artifacts exist in the tree (verified root listing).

## 12. Netlify readiness — **READY**

- **Publish directory:** `.` (repository root) — declared in `netlify.toml`
- **Build command:** none (no build system; browser is the runtime)
- **User URL:** `https://<site>/` → 302 → `/src/`
- **Other settings required:** none. Hash routes need no redirects/rewrites;
  no headers/functions/CDN config required for correctness.
- Total added configuration: **one file, 18 lines** (`netlify.toml`). No build
  system, bundler, npm dependency, backend, or framework was added.

## 13. Files modified / created

| File | Change | Justification (concrete production-path problem) |
|---|---|---|
| `netlify.toml` | **Created** | Publish directory must be the repo root (publishing `src/` breaks `../data/` + `../assets/`), and the site root has no `index.html` — the 302 to `/src/` safely provides the ideal clean root URL without duplicating any application file |
| `reports/release-p1-production-path-audit.md` | **Created** | This report (required by P1 §15) |

**No application file was modified** — no production-path defect required a code fix.

## 14. Files intentionally untouched

`src/index.html`, all `src/js/**` (`router.js`, `app.js`, `data-engine.js`,
`storage.js`, `progress-engine.js`, `planner-engine.js`, `report-model.js`,
`export-engine.js`, `calendar.js`, `renderer.js`, `calendar-metadata.js`),
all `src/components/**`, all `src/css/**`, `src/manifest.json`,
`src/service-worker.js` (orphan stubs), `data/**` (canonical calendar,
syllabus, 28 daily plans, progress schema), `assets/**`, `tests/**`, `docs/**`,
`reports/**` (prior phases), `reference/**`, `tools/**`,
`TRACKING_STORAGE_MANIFEST.json`, `.gitignore` (P2 call), `.claude/`, `.cortex/`.

## 15. Remaining deployment risks (non-blocking)

1. **Root publish exposes dev/reference material** — publishing the repo root
   publicly serves `reference/`, `tests/`, `tools/`, `docs/`, `reports/` (and
   `.claude/` if committed). Not a path/behavior risk; P2 may optionally trim
   what gets committed/published. The alternative (publishing `src/` alone) is
   rejected because it breaks `../data/` and `../assets/`.
2. **First-visit data fetch** — boot fetches calendar JSON + 28 daily plans;
   reports fetch 4 syllabus JSONs. All small static files; fine on any static
   host. A future P3+ optimization (not P1 scope) could add caching headers.
3. **`manifest.json` / `service-worker.js` orphans** — 0 bytes, unreferenced,
   inert. If PWA work is ever started, they must be implemented or removed;
   today they have zero effect.
4. **No app-controlled cache headers** — host defaults apply. Deep-link refresh
   was verified working; stale-CSS risk after future deploys is a host-cache
   concern, not a path defect.

## 16. Focused verification evidence (P1 §14)

1. Entry behavior: `/src/` boots, title `Study-Planner — IIT Madras BS`, **0 console errors**.
2. All 6 routes render real content: `#/calendar` (weekly grid), `#/progress`
   (0/413 tasks), `#/reports` (index), `#/reports/week/1` (0/87 tasks),
   `#/reports/day/2026-10-02` (0/19 tasks), `#/day/2026-10-02` (tracker, 19 tasks).
3. Data: calendar-2026.json 200, all 28 daily plans 200, all 4 syllabus JSONs 200.
4. Assets: logo 200, 3 nav SVGs 200, favicon.ico 200.
5. **Hard refresh** (cache-bypassed) on `#/reports/day/2026-10-02`: full content
   re-rendered, 0 console errors.
6. Export: `2026-10-02.html` generated live — standalone, zero external refs.
7. Code search: no runtime localhost/127.0.0.1/:8099/file:///E:\ dependency.
8. Test suite: **483/483 pass, 0 fail** (unchanged by this phase).

---

# P1 READY
