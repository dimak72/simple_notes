# Simple Notes Project Requirements

This file captures the intended behavior and current implementation status for the Simple Notes app. Keep it specific enough that a pair-programming partner can understand the product without extra context.

## Current Status

Simple Notes is implemented as a static browser app served from `index.html` with `assets/app.js` and `assets/styles.css`. It persists data in IndexedDB and can also be packaged into an nginx Docker image for deployment.

Implemented v1 capabilities:

- Create, select, rename, and delete local note projects.
- Persist project name, creation time, update time, and the last active project.
- Create, edit, move, select, and delete notes inside the active project.
- Enforce a 1,024-character maximum note length and reject empty or whitespace-only note text.
- Persist note text, color, tags, position, size, creation time, and update time.
- Arrange notes on a zoomable and pannable canvas.
- Persist the canvas viewport per project.
- Recenter the canvas around existing notes.
- Enter a canvas-focused full screen mode.
- Search active-project notes by case-insensitive partial text and `@tag` tokens.
- Edit note tags as comma-separated values and deduplicate tags case-insensitively.
- Choose note colors from a fixed palette.
- Select multiple notes with shift-drag and move selected notes together.
- Resize note cards manually and auto-fit selected or hovered cards to their content with the `f` shortcut.

Not implemented in v1:

- A conventional list view.
- User accounts, sharing, collaboration, sync, or server-side persistence.
- A backend API or Go web server.

## Problem

Users need a web-based note taking application where they can organize text notes into separate note projects and work with those notes spatially on a zoomable, pannable canvas. A conventional list view remains a possible later enhancement. The first version should run locally in the browser without accounts, sharing, or centralized storage.

## Goals

- Provide a default web page that loads the note taking application.
- Let users select a note project from previously saved note projects.
- Let users create a new note project.
- Let users rename or delete any saved note project from its sidebar actions.
- Let users create and manage text-based notes inside a selected project.
- Enforce a maximum size for each note.
- Display notes in a project on an infinite-scroll-style canvas.
- Keep a list view optional for a later release.
- Let users move notes around on the canvas.
- Support canvas panning and zooming.
- Provide text search across notes within a single selected project.
- Persist note projects, notes, and canvas state in local browser storage for the initial version.
- Keep the initial implementation simple, with as few dependencies as practical.

## Non-Goals

- User authentication is not required for the initial version.
- Sharing note projects between users is not required for the initial version.
- Centralized server-side storage is not required for the initial version.
- A backend API or Go web server is not required for the initial version.
- Collaborative editing, real-time sync, and multi-device sync are out of scope for the initial version.

## Users

The primary user is an individual note taker who wants to capture short text notes, group them by project, search within a project, and optionally arrange notes spatially in a freeform canvas inspired by tools such as Apple Freeform or Excalidraw.

## Inputs

- User opens the default web page in a browser.
- User selects an existing note project from a list of locally saved projects.
- User enters a name or other identifying information for a new note project.
- User renames or deletes a project from the actions contained in its sidebar card.
- User enters note text, ranging from a single word to several sentences, subject to a maximum note size.
- User enters optional comma-separated note tags.
- User chooses a note color from the configured palette.
- User searches by entering text or `@tag` tokens to match notes in the selected project.
- User pans and zooms the canvas.
- User recenters the canvas or enters canvas-focused full screen mode.
- User drags notes to new positions on the canvas.
- User resizes note cards or auto-fits note cards to their content.
- User shift-drags to select multiple notes.

## Outputs

- The application displays the list of locally saved note projects.
- The application displays the currently selected note project.
- The application displays notes in a movable canvas view.
- The application persists note projects, note contents, note metadata, canvas note positions, note card sizes, and per-project canvas viewport in IndexedDB.
- The application visually distinguishes search matches from non-matching notes for the active project.
- The application prevents or reports note text that exceeds the configured maximum size.
- The application preserves locally stored note data across page reloads within the same browser storage context.

## Constraints

- The initial version stores data locally in the browser.
- IndexedDB is the preferred browser storage mechanism.
- The initial version has no authentication.
- The initial version has no centralized server-side persistence.
- There is no intentional product limit on the number of notes in a project, though browser storage and rendering performance may impose practical limits.
- The code should remain simple and use as few dependencies as practical.
- Canvas behavior is implemented with standard browser DOM and pointer APIs.
- The app can be delivered as static HTML, CSS, and JavaScript from a web server.
- The current deployment path serves the static app through nginx on container port `8080`.
- Go code is limited to domain contract validation and tests; there is no Go server in v1.

## Edge Cases

- No note projects exist yet.
- A user creates a note project without a valid project name.
- A user renames a project without a valid project name.
- A user opens a project with zero notes.
- A user creates an empty note or whitespace-only note.
- A user enters note text at or above the maximum note size.
- Browser IndexedDB is unavailable, full, cleared, blocked, or fails during a read/write.
- A project contains many notes, making search or canvas rendering slow.
- A search query has no matches in the selected project.
- Canvas zoom reaches minimum or maximum allowed levels.
- Notes are dragged far from the initial viewport and must remain recoverable through pan, zoom, or another navigation affordance.
- The active project saved in settings has been deleted or is no longer available.
- Tags include duplicates, casing differences, blanks, or leading `@` tokens in search.

## Answered Questions

- What exact maximum size should be enforced for a single note? 1,024 characters
- Should the canvas view and list view both be required in the first version, or is one acceptable for the first release? Canvas view is required. List view is optional
- What note fields are required beyond text, such as title, creation time, update time, color, or tags? all of the above except for title
- What project fields are required beyond the project name? date created and date updated
- Should search match only note text, or also project names and future metadata? note text and note tags for v1
- Should search be case-insensitive, partial-match, or support more advanced query behavior? case-insensitive and partial match for v1
- What browser storage mechanism should be preferred for the first version: localStorage, IndexedDB, or another local persistence option? IndexedDB
- Should a lightweight Go server be part of the initial deliverable, or should the first version remain static-only? let's keep it static only for v1

## Open Questions

- Should a later release add a list view, and if so should it be read-only, editable, or a full alternative workspace?
- Should search filter non-matching notes out of the canvas or continue dimming non-matches in place?
