# ProdNote Agent Guide

## Project Intent

ProdNote is a local-first Russian-language PWA for notes, tasks, time tracking, Pomodoro focus work, calendar planning, and statistics.

Detailed project documentation lives in `docs/README.md`. Read it before making broad architectural, storage, or UI changes.

Core product constraints:

- No server and no accounts in the current product direction.
- IndexedDB `prodnote-db` is the primary local source of truth.
- `.prodnote.json` export/import is the backup and transfer mechanism.
- UI language is Russian.
- Native Web Components with Shadow DOM are required.

## Tech Stack

- Vite + TypeScript.
- Vanilla Custom Elements only; do not add React, Vue, Svelte, Lit, or another UI framework unless explicitly requested.
- Vitest for unit tests.
- PWA files live in `public/manifest.webmanifest` and `public/sw.js`.

Useful commands:

```bash
npm run dev
npm test
npm run build
```

After UI changes, run at least:

```bash
npm test
npm run build
```

For meaningful frontend changes, also open `http://127.0.0.1:5173/` in the in-app browser and smoke-test the changed screen.

## Architecture

Important files:

- `src/domain/types.ts`: domain model and schema version.
- `src/domain/defaults.ts`: entity factories and labels.
- `src/domain/stats.ts`: statistics calculations.
- `src/domain/pomodoro.ts`: Pomodoro cycle logic.
- `src/domain/markdown.ts`: small safe Markdown renderer.
- `src/storage/idb.ts`: IndexedDB persistence.
- `src/storage/export.ts`: `.prodnote.json` import/export validation.
- `src/state.ts`: app store and all write operations.
- `src/ui/*`: internal design system helpers, shared CSS, and small UI HTML fragments.
- `src/components/shadow.ts`: shared Shadow DOM rendering helper.
- `src/components/app-root.ts`: routing shell.
- `src/components/*-view.ts`: application screens.

Keep business rules out of components where practical. Put reusable calculations in `src/domain/*` and persistence operations in `src/storage/*`.

## Web Component Rules

- Every custom element must render through Shadow DOM using `renderShadow()`.
- Do not rely on global CSS for component internals.
- Keep `src/styles/global.css` minimal: document/body level styles only.
- Keep `src/ui` pragmatic. It is an internal design system layer, not a reusable headless framework.
- Add UI helpers only for repeated markup/styles; do not prebuild tabs, comboboxes, menus, dialogs, or state machines without a concrete screen need.
- Register new components in `src/main.ts` before `app-root` if `app-root` may render them.
- Prefer accessible native controls: `button`, `form`, `label`, `select`, `textarea`, `input`.

## State And Data Rules

- Mutations should go through `ProdNoteStore` in `src/state.ts`.
- Save persistent changes with `commit()` so IndexedDB and subscribers stay consistent.
- Deleting a project must not delete tasks or notes; clear their `projectId` instead.
- Note edits must go through `ProdNoteStore.updateNote()` so `editHistory` records the edit save timestamp.
- Time sessions must stay linked to tasks.
- Pomodoro focus phases create `TimeSession` records; break phases do not.
- Import must validate `schemaVersion` and replace the current workspace only after user confirmation in the UI.
- When changing persisted data shape, increment `SCHEMA_VERSION` and add migration/compatibility handling.

## UI/UX Direction

- Keep the interface intentional and app-like, not a generic admin panel.
- Preserve the current warm paper/ink/accent visual language unless the user asks for a redesign.
- Russian copy should be clear and action-oriented.
- Prefer safe defaults over destructive behavior.
- Destructive actions need confirmation and must explain what happens to linked data.

## Testing Expectations

Add or update tests when changing:

- Statistics logic.
- Pomodoro logic.
- Import/export validation.
- Store mutations in `ProdNoteStore`.
- Any behavior that changes persisted data or linked entities.

Existing test files:

- `src/domain/stats.test.ts`
- `src/domain/pomodoro.test.ts`
- `src/domain/markdown.test.ts`
- `src/storage/export.test.ts`
- `src/state.test.ts`

## Current Known Limits

- There is no server sync.
- There is no multi-workspace support.
- CRUD is partial: create/delete exists for some entities, but editing and deletion coverage should be expanded deliberately.
- Browser automation can be flaky with nested Shadow DOM forms; use tests for state-level guarantees and browser checks for rendering/navigation.
