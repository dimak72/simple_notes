# Architecture

Simple Notes is a static browser application with a small Go domain package for contract-level validation tests.

## Capabilities

- Manage local note projects.
- Create, edit, delete, tag, and color notes inside the active project.
- Arrange notes on a pannable and zoomable canvas.
- Persist projects, notes, note positions, and per-project canvas viewport in IndexedDB.
- Search note text with case-insensitive partial matching; non-matching cards become mostly transparent.
- Delete projects with confirmation, including their notes and saved viewport.

## Components

- App Shell owns active project, notes, search, viewport, and error state.
- Project Service creates, loads, lists, and deletes projects.
- Note Service validates and mutates notes, and touches the parent project timestamp.
- Search Service computes per-note search match state.
- Canvas Workspace handles pan, zoom, note dragging, recentering, and rendering.
- Storage Repository wraps IndexedDB stores for projects, notes, and settings.

## Storage Contract

IndexedDB database: `simple-notes`, version `1`.

Object stores:

- `projects`, keyed by `id`.
- `notes`, keyed by `id`, with `projectId` index.
- `settings`, keyed by `key`.

## Key Rules

- Project names must not be empty or whitespace-only.
- Note text must not be empty or whitespace-only.
- Note text is limited to 1,024 characters.
- Note text is persisted on blur.
- Note colors are constrained to the fixed v1 palette.
- Tags are trimmed, empty tags are removed, and duplicates collapse case-insensitively.
- Note positions are world coordinates; canvas viewport is stored separately per project.
