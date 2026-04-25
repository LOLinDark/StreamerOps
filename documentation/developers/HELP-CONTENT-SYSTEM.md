# Help Content System (Centralized, Code-Driven)

## Why This System

StreamerOps is growing quickly. Writing long help text inside feature files mixes concerns and makes maintenance harder.

This system keeps help content centralized while still allowing contextual help in the UI.

Goals:
- Keep feature code focused on behavior and UI logic.
- Keep help content in one maintainable location.
- Reuse the same help source for in-app help and public docs.
- Support a full Help Center/FAQ index page.

---

## Recommended Content Model

Use structured metadata + markdown body files.

### 1) Index File (metadata)

Create a single index JSON file, for example:

- `app/content/help/help-index.json`

Each entry should include:
- `code`: unique stable ID (example: `SEQ_EXPORT_FFCONCAT`)
- `title`: short display title
- `feature`: owning feature area (example: `sequence-builder`)
- `tags`: search/filter tags
- `summary`: short in-app summary
- `articlePath`: path to full markdown content
- `status`: `draft` | `live` | `deprecated`

### 2) Article Files (full body)

Store full help articles as markdown:

- `app/content/help/articles/<code>.md`

Markdown keeps long content readable and editor-friendly.

---

## Runtime Architecture

### 1) Lookup Function

Create a small helper that fetches by code:

- `getHelpByCode(code)`

Responsibilities:
- load from `help-index.json`
- resolve article content
- return normalized shape for components

### 2) Contextual Help Component

Create a shared component:

- `HelpByCode`

Example usage inside a feature page:
- `HelpByCode code="SEQ_BULK_MATCHING"`

### 3) Help Center / FAQ Page

Create one route that lists all entries from index with:
- search by title/summary/tags
- filter by `feature`
- direct links to full article view

This gives one place to browse all help content.

### 4) Periodic Loading-Style Tips

Add a reusable runtime helper for rotating operational tips like game loading screens.

Recommended pieces:
- `getHelpTips(tipSetKey)` for retrieving short tip arrays by feature context
- `useRotatingTips(tips, intervalMs)` for timed tip rotation

Usage examples:
- Playout windows: show low-profile tips for fullscreen keys, stage mode, and recovery actions
- Remote control pages: show operational tips for presets, close guard, and lock mode

Rules:
- Keep each tip short (single sentence) for glance readability
- Prefer action-oriented wording ("Press F to fullscreen")
- Scope tips by feature (`overlaysPlayout`, `overlaysRemote`, etc.)
- Rotate every 8 to 12 seconds unless UX requires faster cadence

---

## Governance Rules

1. Never hardcode long help text in page components.
2. Every help entry must have a unique `code`.
3. Feature pages only reference help by code.
4. Long-form canonical help lives in markdown articles.
5. Public docs can be generated from the same source.

---

## Validation Checklist

Add a small validation script to prevent content drift:

- all referenced help `code` values exist in index
- all `articlePath` files exist
- no duplicate `code` values
- no orphaned drafts older than target window

Run this script in CI and pre-release checks.

---

## Implementation Phases

### Phase 1 (fastest)
- create index JSON + 5 to 10 core entries
- add `getHelpByCode`
- add one shared `HelpByCode` component
- wire into Sequence Builder and Streamer background-removal pages

### Phase 2
- build full Help Center/FAQ route with search
- add feature/tag filtering
- add docs links from key pages

### Phase 3
- optional: publish pipeline that converts help content to docs site pages
- optional: analytics for top-viewed help topics

---

## Initial Entry Suggestions

Start with codes for current streamer workflows:
- `SEQ_EXPORT_JSON`
- `SEQ_EXPORT_VLC_XSPF`
- `SEQ_EXPORT_FFCONCAT`
- `SEQ_BULK_MATCHING`
- `SEQ_UNMATCHED_VIDEOS`
- `STREAM_BG_REMOVAL_CLIPDROP`

---

## Stream-Online Priority Note

Do not block go-live work for full Help Center polish.

For immediate progress:
1. Add code-driven contextual help for Sequence Builder exports.
2. Add one central Help Center page with basic search.
3. Expand content incrementally while streaming workflow stabilizes.
