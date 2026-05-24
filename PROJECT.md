# Project Requirements

Use this file to capture the product requirements before asking AI to design or implement code. Keep it specific enough that a pair-programming partner can understand the intended behavior without extra context.

## Problem

Users need a web-based note taking application where they can organize text notes into separate note projects and work with those notes either spatially on a zoomable, pannable canvas or in a conventional list view. The first version should run locally in the browser without accounts, sharing, or centralized storage.

## Goals

- Provide a default web page that loads the note taking application.
- Let users select a note project from previously saved note projects.
- Let users create a new note project.
- Let users create and manage text-based notes inside a selected project.
- Enforce a maximum size for each note.
- Display notes in a project on an infinite-scroll-style canvas or in a list view.
- Let users move notes around on the canvas.
- Support canvas panning and zooming.
- Provide text search across notes within a single selected project.
- Persist note projects and notes in local browser storage for the initial version.
- Keep the initial implementation simple, with as few dependencies as practical.

## Non-Goals

- User authentication is not required for the initial version.
- Sharing note projects between users is not required for the initial version.
- Centralized server-side storage is not required for the initial version.
- A backend API is not required for the initial version unless static file serving or a lightweight Go server is chosen for delivery.
- Collaborative editing, real-time sync, and multi-device sync are out of scope for the initial version.

## Users

The primary user is an individual note taker who wants to capture short text notes, group them by project, search within a project, and optionally arrange notes spatially in a freeform canvas inspired by tools such as Apple Freeform or Excalidraw.

## Inputs

- User opens the default web page in a browser.
- User selects an existing note project from a list of locally saved projects.
- User enters a name or other identifying information for a new note project.
- User enters note text, ranging from a single word to several sentences, subject to a maximum note size.
- User searches by entering text or `@tag` tokens to match notes in the selected project.
- User switches between canvas and list display modes when both modes are available.
- User pans and zooms the canvas.
- User drags notes to new positions on the canvas.

## Outputs

- The application displays the list of locally saved note projects.
- The application displays the currently selected note project.
- The application displays notes in either a movable canvas view or a list view.
- The application persists note projects, note contents, and canvas note positions in local browser storage.
- The application shows search results or filtered notes for the active project.
- The application prevents or reports note text that exceeds the configured maximum size.
- The application preserves locally stored note data across page reloads within the same browser storage context.

## Constraints

- The initial version stores data locally in the browser.
- The initial version has no authentication.
- The initial version has no centralized server-side persistence.
- There is no intentional product limit on the number of notes in a project, though browser storage and rendering performance may impose practical limits.
- The code should remain simple and use as few dependencies as practical.
- A canvas framework may be used if it materially simplifies panning, zooming, and dragging without adding excessive complexity.
- The app can be delivered as static HTML, CSS, and JavaScript from a web server.
- A lightweight Go server may be considered for serving HTML if useful for later backend iterations.

## Edge Cases

- No note projects exist yet.
- A user creates a note project without a valid project name.
- A user opens a project with zero notes.
- A user creates an empty note or whitespace-only note.
- A user enters note text at or above the maximum note size.
- Browser local storage is unavailable, full, cleared, or blocked.
- A project contains many notes, making search or canvas rendering slow.
- A search query has no matches in the selected project.
- Canvas zoom reaches minimum or maximum allowed levels.
- Notes are dragged far from the initial viewport and must remain recoverable through pan, zoom, or another navigation affordance.

## Answered Questions

- What exact maximum size should be enforced for a single note? - 1K of characters
- Should the canvas view and list view both be required in the first version, or is one acceptable for the first release? Canvas view is required. List view is optional
- What note fields are required beyond text, such as title, creation time, update time, color, or tags? all of the above except for title
- What project fields are required beyond the project name? date created and date updated
- Should search match only note text, or also project names and future metadata? note text and note tags for v1
- Should search be case-insensitive, partial-match, or support more advanced query behavior? case-insensitive and partial match for v1
- What browser storage mechanism should be preferred for the first version: localStorage, IndexedDB, or another local persistence option? Recommed the best option
- Should a lightweight Go server be part of the initial deliverable, or should the first version remain static-only? let's keep it static only for v1

## Open Questions
