# Agent instructions

These rules apply to every coding agent working in this repo (GitHub Copilot coding agent, Claude Code or anything else).

## Source of truth

- `SPEC.md` is the product and build spec. Requirement ids (FR-x, SS-x, EXE-x, MAC-x, AC-x) are referenced in issues and PRs. If code and spec disagree, the spec wins; if the spec is ambiguous, see "Ambiguity" below.
- `design/` holds the UI mockup: one static HTML file per screen plus a PNG in `design/screenshots/`. Match layout, hierarchy and copy, but build with real shadcn/ui components, not the mockup markup. Where a mockup and `SPEC.md` disagree (for example colours), `SPEC.md` wins.
- Work only on the milestone in the issue you were assigned. Do not start the next milestone.

## Architecture rules

- All timer logic lives in `src/engine` as pure TypeScript: `reduce(state, command, now)` and `derive(state, plan, now)`. No timers, I/O, Electron or DOM imports inside `src/engine`.
- Time is always passed in as `now` (epoch ms). Never accumulate intervals. Tests use a fake clock.
- The Electron main process owns the engine and broadcasts state over IPC. Windows only send commands and render state. The preload exposes a typed `window.api` via `contextBridge` with `contextIsolation: true` and `nodeIntegration: false`.
- UI: React + TypeScript, shadcn/ui on Tailwind CSS (zinc theme). Use shadcn's real Dialog, Switch, ToggleGroup, Select, Tabs and Badge, not hand-drawn look-alikes.
- Storage: JSON files in `app.getPath('userData')`, written atomically (temp file then rename). No database. No network at runtime except the update check (EXE-10, EXE-11). No telemetry.

## Tooling

- Node 22, npm (commit `package-lock.json`). Build with electron-vite; package with electron-builder.
- Scripts that must exist and pass before every push: `npm run typecheck`, `npm run lint`, `npm test`. Engine line coverage must stay at or above 90%.
- You run on Linux. Do not try to build the Windows .exe or macOS .dmg locally; CI does that on `windows-latest` and `macos-latest`.
- Playwright Electron smoke tests run headless under `xvfb-run`.
- Keep `.github/workflows/ci.yml` (typecheck, lint, test on every push and PR) green.

## Ambiguity

Pick the simplest behaviour that satisfies the acceptance criteria in `SPEC.md`, and list each such choice in the PR description under a "Decisions" heading.

## Commits and pull requests

- Conventional Commits: imperative, lowercase subject under 72 characters (for example `feat(engine): add catch-up start`). Bodies explain why, not what.
- The PR title must also be a Conventional Commit, because PRs are squash-merged and the title becomes the commit on `main`.
- PR description: what was built (with requirement ids), how it was tested, "Decisions", and "Left for later" if the milestone isn't fully done.
- No AI-tool footers, session links or model names in PR titles or descriptions.
- Writing style for user-facing text and docs: British spelling, plain language, no em dashes.

## Session limits

A session stops after 59 minutes. Commit and push working slices early. If you can't finish, leave the branch passing typecheck, lint and tests, and list what remains under "Left for later" in the PR description.
