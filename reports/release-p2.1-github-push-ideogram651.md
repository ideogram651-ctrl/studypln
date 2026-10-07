# P2.1 — Connect GitHub + Push Production Backup (ideogram651-ctrl)

**Date:** 2026-10-07 · **Verdict: P2.1 BLOCKED**

> Distinct filename used per §10: `reports/release-p2.1-github-push.md`
> already exists from the previous GitHub-account (`himanshuiitian`) push and
> was **not** overwritten or modified.

## 1. Scope

Switch the existing clean local repository from the previous GitHub remote to
the NEW target repository `https://github.com/ideogram651-ctrl/studypln.git`
and push `main` as a normal, non-forced push. No application changes, no new
repository, no history rewrite, no amend/reset/force-push, no Netlify, no P3.

## 2. Git identity configured

Repo-local only; global configuration untouched (verified still empty):

```text
git config --local user.name  "ideogram651-ctrl"
git config --local user.email "ideogram651@gmail.com"
```

Verified with `git config --local --get` → both values returned
`ideogram651-ctrl` / `ideogram651@gmail.com`. Re-asserted idempotently during
this phase (the pre-flight check already showed these values). Setting or
re-asserting the identity did **not** rewrite any existing commit.

## 3. Previous remote state

Before this phase:

```text
origin  https://github.com/himanshuiitian/Study-Planner.git (fetch)
origin  https://github.com/himanshuiitian/Study-Planner.git (push)
```

Single remote (`origin`), no duplicates, `.git/config` listed exactly one
`remote.origin.url`. This was the previous repository from the earlier push
attempt documented in `reports/release-p2.1-github-push.md`.

## 4. New remote configured

`origin` already existed, so no new remote was added. Only the origin URL was
safely repointed — no commit was modified:

```text
git remote set-url origin https://github.com/ideogram651-ctrl/studypln.git
```

Verified three ways:

```text
git remote get-url origin        → https://github.com/ideogram651-ctrl/studypln.git
git remote -v                    → fetch and push both show the new URL
git config --get-regexp '^remote\.' → remote.origin.url = new URL + normal fetch refspec
```

No duplicate remotes; no second remote created.

## 5. Target GitHub repository

`https://github.com/ideogram651-ctrl/studypln` (git URL:
`https://github.com/ideogram651-ctrl/studypln.git`)

## 6. Remote pre-flight state

- `git fetch origin` → **exit 0** (repository reachable over HTTPS).
- `git ls-remote --heads origin` → **no refs returned** (exit 0).
- Web check (§9): the repository page loads and shows *"This repository is
  empty."* — confirming **Case A: new remote is empty**.
- No existing remote commits, no history relationship to reconcile, no
  unrelated/unknown commits to conflict with.

Case A was the correct, expected clean case. No force-capable option was ever
considered or used.

## 7. Authentication result

**FAILED — permission problem (the §5 STOP condition).**

- First normal `git push -u origin main` was rejected:

  ```text
  remote: Permission to ideogram651-ctrl/studypln.git denied to himanshuiitian.
  fatal: unable to access 'https://github.com/ideogram651-ctrl/studypln.git/': The requested URL returned error: 403
  (exit code 128)
  ```

- Diagnosis of the machine's credential state (secrets never printed):
  - Credential helper: Git Credential Manager 2.9.1 (system gitconfig).
  - Windows Credential Manager holds exactly **one** GitHub entry:
    `git:https://github.com` → user **`himanshuiitian`** (the previous
    account). No credential exists for `ideogram651-ctrl`.
  - `gh` CLI not installed; no GitHub/GH tokens present in the environment;
    no askpass/token configured in the project.
- The normal GCM browser/device-code authentication flow **as
  `ideogram651-ctrl`** was attempted twice (`GCM_INTERACTIVE=always`, with a
  path-scoped credential lookup so the existing `himanshuiitian` credential
  was **not** deleted or overwritten). Both attempts timed out with no
  completion: no device-code flow output, no login completed, and no new
  credential was stored.
- No authentication was bypassed, no password/token was printed, saved in the
  project, or placed in the remote URL, and no credentials were deleted.

**Conclusion:** the only credential available to this machine authenticates as
`himanshuiitian`, which has **no push permission** on
`ideogram651-ctrl/studypln`, and a login as `ideogram651-ctrl` cannot be
completed non-interactively in this environment. Per §5 → STOP and report.

## 8. Push result

**NOT PUSHED.** The push could not be safely completed:

- Attempt 1 (normal, non-forced): `git push -u origin main` → exit 128,
  HTTP 403 (see §7).
- Attempt 2 (interactive credential flow): timed out before authentication
  completed; no push performed.
- After both attempts: `git ls-remote --heads origin` still returns **no
  refs** — the target repository remains empty (nothing overwritten, nothing
  rewritten, nothing partially pushed).
- Forbidden operations confirmed **never used**: `--force`,
  `--force-with-lease`, `reset`, `rebase`, `amend`,
  `--allow-unrelated-histories`.

## 9. Final branch/status

Local repository (completely unchanged by this phase):

```text
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  reports/release-p2.1-github-push.md

nothing added to commit but untracked files present
```

```text
git log --oneline --decorate -5
9413aef (HEAD -> main, origin/main) Add P2 GitHub backup release report
7abd228 Initial production-ready Study Planner
```

- Local `main` exists ✓ · 2 commits intact, none rewritten ✓
- `git log origin/main..main` → empty ✓
- **Note:** the `origin/main` shown above is the *stale remote-tracking ref*
  inherited from the previous remote (fetching an empty repository does not
  prune it). The **actual** target remote currently has no refs — see §11.
- Working tree contains only the pre-existing untracked report from the
  previous push phase, left untouched per instructions.

## 10. Latest commit hash

- Local `HEAD` = **`9413aeffc24af2db711811cf4e807f5c603540fa`**
- Unchanged from pre-flight (verified before and after all attempts).
- Both baseline commits intact: `7abd228` (root) and `9413aef` (P2 report).

## 11. Remote commit verification

**FAILED — target remote has no commits.**

- `git ls-remote --heads origin` → no `refs/heads/main` (empty output, exit 0).
- GitHub web page shows *"This repository is empty."*
- The production baseline (`7abd228`, `9413aef`) is therefore **not yet
  present** on `origin`. Verification must be repeated after authentication
  as `ideogram651-ctrl` is restored and the push is re-run.

## 12. Repository integrity verification

Local tracked baseline (`git ls-files`) — all present:

- Directories: `src/`, `data/`, `assets/`, `tests/`, `docs/`, `reports/`,
  `tools/` (plus pre-existing `generated/`, `reference/`)
- Files: `README.md`, `PROJECT_SPECIFICATION.md`, `netlify.toml`,
  `.gitignore`, `src/index.html`, `tools/generate-plans.js`, `CLAUDE.md`,
  `TRACKING_STORAGE_MANIFEST.json` — all tracked and unmodified
  (`git status --porcelain` shows zero modified/deleted tracked files).

Forbidden-tracking scan → **empty**: no `.claude/`, `.cortex/`, `.env*`,
logs, caches, OS/editor junk, or machine-specific temp files are tracked.

Working-tree diff against the baseline: **zero changes** to `src/**`,
`data/**`, `assets/**`, `tests/**`, `README.md`, `.gitignore`, `netlify.toml`,
docs, planner/progress/calendar/report/export engines. Integrity confirmed
green on the local side; the integrity of the *pushed* copy could not be
confirmed because the push did not occur (§11).

## 13. Files changed

| File | Change |
|---|---|
| `.git/config` | `remote.origin.url` repointed from `himanshuiitian/Study-Planner.git` → `ideogram651-ctrl/studypln.git`; local identity confirmed as `ideogram651-ctrl <ideogram651@gmail.com>` |
| `reports/release-p2.1-github-push-ideogram651.md` | this report — created as a new, distinct, **untracked** file (original report preserved) |

No other file was created, modified, or deleted. No commit was made.

## 14. Files intentionally untouched

`src/**`, `data/**`, `assets/**`, `tests/**`, `docs/**`, `tools/**`,
prior `reports/**` (including `release-p2.1-github-push.md`), `reference/**`,
`README.md`, `PROJECT_SPECIFICATION.md`, `CLAUDE.md`,
`TRACKING_STORAGE_MANIFEST.json`, `netlify.toml`, `.gitignore`. Global Git
config untouched. Existing history untouched (no amend/reset/rebase/force).
No GitHub-side edits (read-only web check only). No Netlify action. No P3.

## 15. Risks / notes

- **Blocker:** the machine's only GitHub credential is the previous account
  `himanshuiitian` (403 on the new repository). Pushing requires an
  interactive GitHub sign-in as `ideogram651-ctrl` — e.g. re-run
  `git push -u origin main` from an interactive terminal where Git Credential
  Manager can open its browser/device-code flow, or complete a GitHub login
  for `ideogram651-ctrl` in VS Code's Git authentication prompt.
- The stale local `origin/main` remote-tracking ref (from the old remote)
  makes `git status` report "up to date" — do not trust it until a successful
  push or `git fetch --prune` against the populated new remote confirms state.
- The target repository is publicly visible and empty (verified read-only).
- The stored `himanshuiitian` credential was deliberately left intact;
  replacing it is a user decision, out of P2.1 scope.
- Benign Windows `core.autocrlf` LF/CRLF notices may appear; they were
  recorded in P2 and change nothing.

## 16. Final verdict

P2.1 BLOCKED

