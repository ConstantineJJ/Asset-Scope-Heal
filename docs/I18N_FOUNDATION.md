# Asset Doctor — i18n Foundation

Status: implemented on `main`.

## Principle

English remains the **Source of Truth** for development and technical terminology.

Russian is a user-facing translation layer.

Technical terms that are clearer in English may remain untranslated, including examples such as:

- GLB / glTF
- PBR
- UV
- SkinnedMesh
- Root Motion
- Draw Calls
- Runtime Cost

The goal is clarity, not forced literal translation.

## Architecture

`src/i18n/`

- `index.tsx` — provider, language state, translation lookup and fallback
- `locales/en.ts` — canonical English dictionary
- `locales/ru.ts` — Russian dictionary

No external i18n runtime dependency is required.

## Fallback rule

If a Russian key is missing, Asset Doctor automatically falls back to the English Source of Truth.

This lets the application remain usable while Russian coverage grows gradually.

## Persistence

Selected language is stored under:

`asset-doctor.language`

The language therefore survives reloads.

## Current scope

The first pass localizes foundational UI such as:

- language selector
- Open File
- Samples
- topology tests
- Scene Hierarchy
- search / visibility actions
- Inspector tabs
- diagnostic counters
- Focus / location metadata
- issue navigation controls

Diagnostic rule content itself remains primarily English for now.

## Development rule

All new user-facing UI introduced after this foundation should prefer translation keys instead of hard-coded strings.

Full Russian coverage is scheduled closer to beta, after major UI wording stabilizes.
