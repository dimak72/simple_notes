(() => {
  "use strict";

  const DB_NAME = "simple-notes";
  const DB_VERSION = 1;
  const SETTINGS_KEY = "appSettings";
  const NOTE_TEXT_MAX_LENGTH = 1024;
  const CANVAS_MIN_ZOOM = 0.25;
  const CANVAS_MAX_ZOOM = 3;
  const CANVAS_DEFAULT_ZOOM = 1;
  const PINCH_ZOOM_SENSITIVITY = 0.002;
  const MAX_WHEEL_ZOOM_STEP = 1.12;
  const NOTE_CARD_WORLD_WIDTH = 260;
  const NOTE_CARD_WORLD_HEIGHT = 220;
  const DEFAULT_NOTE_COLOR = "#fff7cc";
  const NOTE_COLOR_PALETTE = ["#fff7cc", "#ffd6d6", "#d6ecff", "#dcfce7", "#f3e8ff", "#f5f5f4"];

  const defaultViewport = () => ({ x: 120, y: 90, zoom: CANVAS_DEFAULT_ZOOM });
  const defaultSettings = () => ({ activeProjectId: null, viewMode: "canvas", canvasViewportByProject: {} });

  const state = {
    projects: [],
    activeProject: null,
    activeNotes: [],
    searchQuery: "",
    viewport: defaultViewport(),
    settings: defaultSettings(),
    error: null,
    pendingStatus: "loading",
    noteDrafts: {},
    noteErrors: {},
    unsavedPositions: new Set(),
    selectedNoteIds: new Set(),
    draggingNoteId: null,
    hoveredNoteId: null,
    isFullScreenMode: false,
  };

  const elements = {
    projectForm: document.querySelector("#projectForm"),
    appShell: document.querySelector("#app"),
    fullscreenButton: document.querySelector("#fullscreenButton"),
    projectName: document.querySelector("#projectName"),
    projectList: document.querySelector("#projectList"),
    activeProjectMeta: document.querySelector("#activeProjectMeta"),
    activeProjectName: document.querySelector("#activeProjectName"),
    searchInput: document.querySelector("#searchInput"),
    addNoteButton: document.querySelector("#addNoteButton"),
    recenterButton: document.querySelector("#recenterButton"),
    deleteProjectButton: document.querySelector("#deleteProjectButton"),
    zoomInButton: document.querySelector("#zoomInButton"),
    zoomOutButton: document.querySelector("#zoomOutButton"),
    statusBanner: document.querySelector("#statusBanner"),
    canvasSurface: document.querySelector("#canvasSurface"),
    canvasContent: document.querySelector("#canvasContent"),
    emptyState: document.querySelector("#emptyState"),
  };

  const ok = (value) => ({ ok: true, value });
  const fail = (code, message, field) => ({ ok: false, error: { code, message, field } });

  function nowISO() {
    return new Date().toISOString();
  }

  function newId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function normalizeTags(tags) {
    const seen = new Set();
    const normalized = [];
    for (const tag of tags) {
      const clean = String(tag).trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(clean);
    }
    return normalized;
  }

  function normalizeSearchTag(tag) {
    return String(tag).trim().replace(/^@+/, "").replace(/,+$/, "").toLowerCase();
  }

  function parseSearchQuery(query) {
    const textParts = [];
    const tags = [];
    const seenTags = new Set();

    for (const token of query.trim().split(/\s+/)) {
      if (!token) {
        continue;
      }

      if (token.startsWith("@") && token.length > 1) {
        const tag = normalizeSearchTag(token);
        if (tag && !seenTags.has(tag)) {
          seenTags.add(tag);
          tags.push(tag);
        }
        continue;
      }

      textParts.push(token);
    }

    return {
      text: textParts.join(" ").toLowerCase(),
      tags,
    };
  }

  function validateProjectName(name) {
    if (!name.trim()) {
      return fail("project_name_required", "Project name is required.", "name");
    }
    return ok(name.trim());
  }

  function validateNoteText(text) {
    if (!text.trim()) {
      return fail("note_text_required", "Note text is required.", "text");
    }
    if (text.length > NOTE_TEXT_MAX_LENGTH) {
      return fail("note_text_too_long", `Notes are limited to ${NOTE_TEXT_MAX_LENGTH} characters.`, "text");
    }
    return ok(text);
  }

  function validateNoteColor(color) {
    return NOTE_COLOR_PALETTE.includes(color) ? color : DEFAULT_NOTE_COLOR;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  class StorageRepository {
    constructor() {
      this.db = null;
    }

    async init() {
      if (!globalThis.indexedDB) {
        return fail("storage_unavailable", "IndexedDB is unavailable in this browser.");
      }

      try {
        this.db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("projects")) {
              db.createObjectStore("projects", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("notes")) {
              const notes = db.createObjectStore("notes", { keyPath: "id" });
              notes.createIndex("projectId", "projectId", { unique: false });
            }
            if (!db.objectStoreNames.contains("settings")) {
              db.createObjectStore("settings", { keyPath: "key" });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
          request.onblocked = () => reject(new Error("IndexedDB open request was blocked"));
        });
        return ok(undefined);
      } catch (error) {
        return fail("storage_unavailable", error.message || "Unable to initialize storage.");
      }
    }

    store(name, mode = "readonly") {
      return this.db.transaction(name, mode).objectStore(name);
    }

    async listProjects() {
      try {
        const projects = await requestToPromise(this.store("projects").getAll());
        projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return ok(projects);
      } catch (error) {
        return fail("storage_read_failed", error.message || "Unable to read projects.");
      }
    }

    async getProject(projectId) {
      try {
        return ok((await requestToPromise(this.store("projects").get(projectId))) || null);
      } catch (error) {
        return fail("storage_read_failed", error.message || "Unable to read project.");
      }
    }

    async saveProject(project) {
      try {
        await requestToPromise(this.store("projects", "readwrite").put(project));
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to save project.");
      }
    }

    async deleteProject(projectId) {
      try {
        await requestToPromise(this.store("projects", "readwrite").delete(projectId));
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to delete project.");
      }
    }

    async listNotes(projectId) {
      try {
        const index = this.store("notes").index("projectId");
        const notes = await requestToPromise(index.getAll(projectId));
        notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return ok(notes);
      } catch (error) {
        return fail("storage_read_failed", error.message || "Unable to read notes.");
      }
    }

    async getNote(noteId) {
      try {
        return ok((await requestToPromise(this.store("notes").get(noteId))) || null);
      } catch (error) {
        return fail("storage_read_failed", error.message || "Unable to read note.");
      }
    }

    async saveNote(note) {
      try {
        await requestToPromise(this.store("notes", "readwrite").put(note));
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to save note.");
      }
    }

    async deleteNote(noteId) {
      try {
        await requestToPromise(this.store("notes", "readwrite").delete(noteId));
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to delete note.");
      }
    }

    async deleteNotesForProject(projectId) {
      try {
        const tx = this.db.transaction("notes", "readwrite");
        const index = tx.objectStore("notes").index("projectId");
        const request = index.openCursor(IDBKeyRange.only(projectId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        await transactionDone(tx);
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to delete project notes.");
      }
    }

    async getSettings() {
      try {
        const record = await requestToPromise(this.store("settings").get(SETTINGS_KEY));
        return ok({ ...defaultSettings(), ...(record ? record.value : {}) });
      } catch (error) {
        return fail("storage_read_failed", error.message || "Unable to read settings.");
      }
    }

    async saveSettings(settings) {
      try {
        await requestToPromise(this.store("settings", "readwrite").put({ key: SETTINGS_KEY, value: settings }));
        return ok(undefined);
      } catch (error) {
        return fail("storage_write_failed", error.message || "Unable to save settings.");
      }
    }
  }

  class ProjectService {
    constructor(storage) {
      this.storage = storage;
    }

    listProjects() {
      return this.storage.listProjects();
    }

    async createProject(input) {
      const validated = validateProjectName(input.name);
      if (!validated.ok) {
        return validated;
      }

      const timestamp = nowISO();
      const project = {
        id: newId("project"),
        name: validated.value,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const saved = await this.storage.saveProject(project);
      return saved.ok ? ok(project) : saved;
    }

    async loadProject(projectId) {
      const project = await this.storage.getProject(projectId);
      if (!project.ok) {
        return project;
      }
      if (!project.value) {
        return fail("not_found", "Project was not found.");
      }
      const notes = await this.storage.listNotes(projectId);
      if (!notes.ok) {
        return notes;
      }
      return ok({ project: project.value, notes: notes.value });
    }

    async deleteProject(projectId) {
      const notesDeleted = await this.storage.deleteNotesForProject(projectId);
      if (!notesDeleted.ok) {
        return notesDeleted;
      }
      return this.storage.deleteProject(projectId);
    }
  }

  class NoteService {
    constructor(storage) {
      this.storage = storage;
    }

    async touchProject(projectId, timestamp) {
      const project = await this.storage.getProject(projectId);
      if (!project.ok || !project.value) {
        return project.ok ? fail("not_found", "Project was not found.") : project;
      }
      return this.storage.saveProject({ ...project.value, updatedAt: timestamp });
    }

    async createNote(input) {
      const validated = validateNoteText(input.text);
      if (!validated.ok) {
        return validated;
      }

      const timestamp = nowISO();
      const note = {
        id: newId("note"),
        projectId: input.projectId,
        text: validated.value,
        color: validateNoteColor(input.color || DEFAULT_NOTE_COLOR),
        tags: normalizeTags(input.tags || []),
        position: input.position,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const saved = await this.storage.saveNote(note);
      if (!saved.ok) {
        return saved;
      }
      const touched = await this.touchProject(input.projectId, timestamp);
      return touched.ok ? ok(note) : touched;
    }

    async updateNoteText(input) {
      const validated = validateNoteText(input.text);
      if (!validated.ok) {
        return validated;
      }
      return this.updateNote(input.noteId, (note, timestamp) => ({ ...note, text: validated.value, updatedAt: timestamp }));
    }

    async updateNotePosition(input) {
      return this.updateNote(input.noteId, (note, timestamp) => ({ ...note, position: input.position, updatedAt: timestamp }));
    }

    async updateNoteMetadata(input) {
      return this.updateNote(input.noteId, (note, timestamp) => ({
        ...note,
        color: input.color ? validateNoteColor(input.color) : note.color,
        tags: input.tags ? normalizeTags(input.tags) : note.tags,
        updatedAt: timestamp,
      }));
    }

    async deleteNote(noteId) {
      const found = await this.storage.getNote(noteId);
      if (!found.ok) {
        return found;
      }
      if (!found.value) {
        return fail("not_found", "Note was not found.");
      }
      const deleted = await this.storage.deleteNote(noteId);
      if (!deleted.ok) {
        return deleted;
      }
      return this.touchProject(found.value.projectId, nowISO());
    }

    async updateNote(noteId, updater) {
      const found = await this.storage.getNote(noteId);
      if (!found.ok) {
        return found;
      }
      if (!found.value) {
        return fail("not_found", "Note was not found.");
      }
      const timestamp = nowISO();
      const updated = updater(found.value, timestamp);
      const saved = await this.storage.saveNote(updated);
      if (!saved.ok) {
        return saved;
      }
      const touched = await this.touchProject(updated.projectId, timestamp);
      return touched.ok ? ok(updated) : touched;
    }
  }

  const SearchService = {
    matchState(note, query) {
      const search = parseSearchQuery(query);
      if (!search.text && search.tags.length === 0) {
        return "none";
      }

      const textMatches = !search.text || note.text.toLowerCase().includes(search.text);
      const noteTags = new Set((note.tags || []).map(normalizeSearchTag).filter(Boolean));
      const tagsMatch = search.tags.every((tag) => noteTags.has(tag));

      return textMatches && tagsMatch ? "match" : "non_match";
    },
  };

  const storage = new StorageRepository();
  const projectService = new ProjectService(storage);
  const noteService = new NoteService(storage);

  function setError(error) {
    state.error = error;
    renderStatus();
  }

  function clearError() {
    state.error = null;
    renderStatus();
  }

  function renderStatus() {
    if (!state.error) {
      elements.statusBanner.hidden = true;
      elements.statusBanner.textContent = "";
      return;
    }
    elements.statusBanner.hidden = false;
    elements.statusBanner.textContent = state.error.message;
  }

  function render() {
    renderDisplayMode();
    renderProjects();
    renderHeader();
    renderCanvas();
    renderStatus();
  }

  function renderDisplayMode() {
    elements.appShell.classList.toggle("fullscreen-mode", state.isFullScreenMode);
    elements.fullscreenButton.setAttribute("aria-label", state.isFullScreenMode ? "Exit full screen mode" : "Enter full screen mode");
    elements.fullscreenButton.setAttribute("aria-pressed", String(state.isFullScreenMode));
  }

  function renderProjects() {
    elements.projectList.innerHTML = "";
    if (state.projects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "meta-line";
      empty.textContent = "No saved projects yet.";
      elements.projectList.append(empty);
      return;
    }

    for (const project of state.projects) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `project-item${state.activeProject && state.activeProject.id === project.id ? " active" : ""}`;
      button.dataset.projectId = project.id;
      button.innerHTML = `<strong></strong><span class="meta-line"></span>`;
      button.querySelector("strong").textContent = project.name;
      button.querySelector("span").textContent = `Updated ${formatDate(project.updatedAt)}`;
      button.addEventListener("click", () => selectProject(project.id));
      elements.projectList.append(button);
    }
  }

  function renderHeader() {
    const hasProject = Boolean(state.activeProject);
    elements.activeProjectName.textContent = hasProject ? state.activeProject.name : "Pick or create a project";
    const selectedCount = state.selectedNoteIds.size;
    const selectedMeta = selectedCount > 0 ? ` · ${selectedCount} selected` : "";
    elements.activeProjectMeta.textContent = hasProject
      ? `${state.activeNotes.length} note${state.activeNotes.length === 1 ? "" : "s"}${selectedMeta} · Updated ${formatDate(state.activeProject.updatedAt)}`
      : "No project selected";

    elements.searchInput.disabled = !hasProject;
    elements.addNoteButton.disabled = !hasProject;
    elements.recenterButton.disabled = !hasProject;
    elements.deleteProjectButton.disabled = !hasProject;
    elements.zoomInButton.disabled = !hasProject;
    elements.zoomOutButton.disabled = !hasProject;
    elements.searchInput.value = state.searchQuery;
  }

  function renderCanvas() {
    elements.canvasContent.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
    elements.canvasContent.innerHTML = "";
    elements.canvasContent.append(createCanvasGridElement());

    if (!state.activeProject) {
      showEmptyState("No project selected", "Create or select a project to start arranging notes.");
      return;
    }

    if (state.activeNotes.length === 0) {
      state.hoveredNoteId = null;
      showEmptyState("This project has no notes", "Use Add note to place the first card on the canvas.");
      return;
    }

    if (state.hoveredNoteId && !state.activeNotes.some((note) => note.id === state.hoveredNoteId)) {
      state.hoveredNoteId = null;
    }
    syncSelectedNotes();

    elements.emptyState.hidden = true;
    for (const note of state.activeNotes) {
      elements.canvasContent.append(createNoteElement(note));
    }
  }

  function showEmptyState(title, body) {
    elements.emptyState.hidden = false;
    elements.emptyState.querySelector("h3").textContent = title;
    elements.emptyState.querySelector("p").textContent = body;
  }

  function createCanvasGridElement() {
    const grid = document.createElement("div");
    grid.className = "canvas-grid";
    return grid;
  }

  function createNoteElement(note) {
    const matchState = SearchService.matchState(note, state.searchQuery);
    const isSelected = state.selectedNoteIds.has(note.id);
    const card = document.createElement("article");
    card.className = `note-card${matchState === "non_match" ? " non-match" : ""}${isSelected ? " selected" : ""}${state.draggingNoteId === note.id ? " dragging" : ""}`;
    card.dataset.noteId = note.id;
    card.setAttribute("aria-selected", String(isSelected));
    card.style.left = `${note.position.x}px`;
    card.style.top = `${note.position.y}px`;
    card.style.background = note.color;

    const textValue = Object.prototype.hasOwnProperty.call(state.noteDrafts, note.id) ? state.noteDrafts[note.id] : note.text;
    const error = state.noteErrors[note.id];
    const unsaved = state.unsavedPositions.has(note.id);

    const tools = document.createElement("div");
    tools.className = "note-tools";
    const palette = document.createElement("div");
    palette.className = "palette";
    for (const color of NOTE_COLOR_PALETTE) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = `swatch${note.color === color ? " active" : ""}`;
      swatch.style.setProperty("--swatch-color", color);
      swatch.title = `Set color ${color}`;
      swatch.addEventListener("click", (event) => {
        event.stopPropagation();
        updateNoteMetadata(note.id, { color });
      });
      palette.append(swatch);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-note-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteNote(note.id);
    });
    tools.append(palette, deleteButton);

    const textarea = document.createElement("textarea");
    textarea.maxLength = NOTE_TEXT_MAX_LENGTH + 1;
    textarea.value = textValue;
    textarea.addEventListener("pointerdown", (event) => event.stopPropagation());
    textarea.addEventListener("input", () => {
      state.noteDrafts[note.id] = textarea.value;
      const counter = card.querySelector("[data-counter]");
      counter.textContent = `${textarea.value.length}/${NOTE_TEXT_MAX_LENGTH}`;
    });
    textarea.addEventListener("blur", () => saveNoteTextOnBlur(note.id, textarea.value));

    const tags = document.createElement("input");
    tags.className = "tags-input";
    tags.type = "text";
    tags.value = note.tags.join(", ");
    tags.placeholder = "tags: idea, todo";
    tags.addEventListener("pointerdown", (event) => event.stopPropagation());
    tags.addEventListener("blur", () => updateNoteMetadata(note.id, { tags: tags.value.split(",") }));

    const footer = document.createElement("div");
    footer.className = "note-footer";
    footer.innerHTML = `<span data-counter>${textValue.length}/${NOTE_TEXT_MAX_LENGTH}</span><span></span>`;
    footer.querySelector("span:last-child").textContent = unsaved ? "Position unsaved" : `Updated ${formatDate(note.updatedAt)}`;

    card.append(tools, textarea, tags, footer);
    if (error) {
      const errorNode = document.createElement("div");
      errorNode.className = "inline-error";
      errorNode.textContent = error.message;
      card.append(errorNode);
    }

    card.addEventListener("pointerenter", () => {
      state.hoveredNoteId = note.id;
    });
    card.addEventListener("pointerleave", () => {
      if (state.hoveredNoteId === note.id) {
        state.hoveredNoteId = null;
      }
    });
    card.addEventListener("pointerdown", startNoteDrag);
    return card;
  }

  async function refreshProjects() {
    const projects = await projectService.listProjects();
    if (!projects.ok) {
      setError(projects.error);
      return projects;
    }
    state.projects = projects.value;
    return projects;
  }

  async function persistSettings() {
    const saved = await storage.saveSettings(state.settings);
    if (!saved.ok) {
      setError(saved.error);
    }
    return saved;
  }

  let pendingViewportSave = 0;
  function scheduleViewportSave() {
    if (!state.activeProject) {
      return;
    }
    state.settings.canvasViewportByProject[state.activeProject.id] = { ...state.viewport };
    clearTimeout(pendingViewportSave);
    pendingViewportSave = setTimeout(() => {
      persistSettings();
    }, 220);
  }

  async function selectProject(projectId, options = {}) {
    clearError();
    const loaded = await projectService.loadProject(projectId);
    if (!loaded.ok) {
      setError(loaded.error);
      return;
    }
    const preservedSelection = options.preserveSelection ? new Set(state.selectedNoteIds) : new Set();
    state.activeProject = loaded.value.project;
    state.activeNotes = loaded.value.notes;
    state.searchQuery = "";
    state.noteDrafts = {};
    state.noteErrors = {};
    state.unsavedPositions.clear();
    state.selectedNoteIds = preservedSelection;
    syncSelectedNotes();
    state.hoveredNoteId = null;
    state.viewport = state.settings.canvasViewportByProject[projectId] || defaultViewport();
    state.settings.activeProjectId = projectId;
    await persistSettings();
    render();
  }

  async function createProject(name) {
    clearError();
    const created = await projectService.createProject({ name });
    if (!created.ok) {
      setError(created.error);
      return;
    }
    elements.projectName.value = "";
    await refreshProjects();
    await selectProject(created.value.id);
  }

  async function deleteActiveProject() {
    if (!state.activeProject) {
      return;
    }
    const confirmed = confirm(`Delete project "${state.activeProject.name}" and all of its notes?`);
    if (!confirmed) {
      return;
    }

    clearError();
    const projectId = state.activeProject.id;
    const deleted = await projectService.deleteProject(projectId);
    if (!deleted.ok) {
      setError(deleted.error);
      return;
    }
    delete state.settings.canvasViewportByProject[projectId];
    state.settings.activeProjectId = null;
    state.activeProject = null;
    state.activeNotes = [];
    state.searchQuery = "";
    state.selectedNoteIds.clear();
    state.viewport = defaultViewport();
    await persistSettings();
    await refreshProjects();
    render();
  }

  function viewportCenterPosition() {
    const rect = elements.canvasSurface.getBoundingClientRect();
    return {
      x: Math.round((rect.width / 2 - state.viewport.x) / state.viewport.zoom - 130),
      y: Math.round((rect.height / 2 - state.viewport.y) / state.viewport.zoom - 90),
    };
  }

  async function createNoteAtCenter() {
    if (!state.activeProject) {
      return;
    }
    clearError();
    const created = await noteService.createNote({
      projectId: state.activeProject.id,
      text: "New note",
      color: DEFAULT_NOTE_COLOR,
      tags: [],
      position: viewportCenterPosition(),
    });
    if (!created.ok) {
      setError(created.error);
      return;
    }
    await selectProject(state.activeProject.id);
  }

  async function saveNoteTextOnBlur(noteId, text) {
    const current = state.activeNotes.find((note) => note.id === noteId);
    if (!current || current.text === text) {
      delete state.noteDrafts[noteId];
      delete state.noteErrors[noteId];
      render();
      return;
    }

    clearError();
    const updated = await noteService.updateNoteText({ noteId, text });
    if (!updated.ok) {
      state.noteDrafts[noteId] = text;
      state.noteErrors[noteId] = updated.error;
      render();
      return;
    }
    delete state.noteDrafts[noteId];
    delete state.noteErrors[noteId];
    await selectProject(updated.value.projectId);
  }

  async function updateNoteMetadata(noteId, metadata) {
    clearError();
    const updated = await noteService.updateNoteMetadata({ noteId, ...metadata });
    if (!updated.ok) {
      setError(updated.error);
      return;
    }
    await selectProject(updated.value.projectId);
  }

  async function deleteNote(noteId) {
    const confirmed = confirm("Delete this note?");
    if (!confirmed) {
      return;
    }
    clearError();
    const deleted = await noteService.deleteNote(noteId);
    if (!deleted.ok) {
      setError(deleted.error);
      return;
    }
    await selectProject(state.activeProject.id);
  }

  function isTypingTarget(target) {
    if (!target) {
      return false;
    }
    const tagName = target.tagName ? target.tagName.toLowerCase() : "";
    return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
  }

  function shouldIgnoreShortcut(event) {
    return event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target);
  }

  function handleKeyboardShortcut(event) {
    if (shouldIgnoreShortcut(event)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "n") {
      if (!state.activeProject || state.hoveredNoteId) {
        return;
      }
      event.preventDefault();
      createNoteAtCenter();
      return;
    }

    if (key === "d") {
      if (!state.activeProject || !state.hoveredNoteId) {
        return;
      }
      event.preventDefault();
      deleteNote(state.hoveredNoteId);
    }
  }

  function syncSelectedNotes() {
    for (const noteId of state.selectedNoteIds) {
      if (!state.activeNotes.some((note) => note.id === noteId)) {
        state.selectedNoteIds.delete(noteId);
      }
    }
  }

  function updateSelectedNoteClasses() {
    for (const note of state.activeNotes) {
      const card = findNoteCard(note.id);
      if (!card) {
        continue;
      }
      const isSelected = state.selectedNoteIds.has(note.id);
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-selected", String(isSelected));
    }
    renderHeader();
  }

  function findNoteCard(noteId) {
    for (const card of elements.canvasContent.querySelectorAll(".note-card")) {
      if (card.dataset.noteId === noteId) {
        return card;
      }
    }
    return null;
  }

  function selectOnlyNote(noteId) {
    state.selectedNoteIds.clear();
    state.selectedNoteIds.add(noteId);
    updateSelectedNoteClasses();
  }

  function clearNoteSelection() {
    if (state.selectedNoteIds.size === 0) {
      return;
    }
    state.selectedNoteIds.clear();
    updateSelectedNoteClasses();
  }

  async function persistNotePositions(positions) {
    for (const item of positions) {
      state.unsavedPositions.add(item.noteId);
    }
    render();

    let projectId = state.activeProject ? state.activeProject.id : null;
    for (const item of positions) {
      const updated = await noteService.updateNotePosition({ noteId: item.noteId, position: item.position });
      if (!updated.ok) {
        setError(updated.error);
        return;
      }
      projectId = updated.value.projectId;
      state.unsavedPositions.delete(item.noteId);
    }

    if (projectId) {
      await selectProject(projectId, { preserveSelection: true });
    }
  }

  function screenToWorld(clientX, clientY) {
    const rect = elements.canvasSurface.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.viewport.x) / state.viewport.zoom,
      y: (clientY - rect.top - state.viewport.y) / state.viewport.zoom,
    };
  }

  function startNoteDrag(event) {
    if (event.button !== 0 || event.target.closest("textarea, input, button")) {
      return;
    }
    const card = event.currentTarget;
    const noteId = card.dataset.noteId;
    const note = state.activeNotes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }
    if (event.shiftKey) {
      startNoteSelectionDrag(event);
      return;
    }

    if (!state.selectedNoteIds.has(noteId)) {
      selectOnlyNote(noteId);
    }

    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    card.setPointerCapture(pointerId);
    state.draggingNoteId = noteId;
    card.classList.add("dragging");
    const draggedNotes = state.activeNotes.filter((item) => state.selectedNoteIds.has(item.id));
    const notePositions = new Map(draggedNotes.map((item) => [item.id, { ...item.position }]));
    const noteCards = new Map(draggedNotes.map((item) => [item.id, findNoteCard(item.id)]));
    const startWorld = screenToWorld(event.clientX, event.clientY);
    let moved = false;

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const nextWorld = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const delta = {
        x: nextWorld.x - startWorld.x,
        y: nextWorld.y - startWorld.y,
      };
      for (const draggedNote of draggedNotes) {
        const initial = notePositions.get(draggedNote.id);
        const nextPosition = {
          x: Math.round(initial.x + delta.x),
          y: Math.round(initial.y + delta.y),
        };
        moved = moved || nextPosition.x !== initial.x || nextPosition.y !== initial.y;
        draggedNote.position = nextPosition;
        const draggedCard = noteCards.get(draggedNote.id);
        if (draggedCard) {
          draggedCard.style.left = `${nextPosition.x}px`;
          draggedCard.style.top = `${nextPosition.y}px`;
        }
      }
    };

    const end = (endEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }
      if (card.hasPointerCapture(pointerId)) {
        card.releasePointerCapture(pointerId);
      }
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", end);
      card.removeEventListener("pointercancel", end);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      state.draggingNoteId = null;
      card.classList.remove("dragging");
      if (!moved) {
        return;
      }
      persistNotePositions(draggedNotes.map((draggedNote) => ({ noteId: draggedNote.id, position: { ...draggedNote.position } })));
    };

    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function setupCanvasPanAndZoom() {
    let panStart = null;
    let lastGestureScale = 1;

    elements.canvasSurface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".note-card")) {
        return;
      }
      if (document.activeElement && isTypingTarget(document.activeElement)) {
        document.activeElement.blur();
      }
      if (event.shiftKey && state.activeProject) {
        startNoteSelectionDrag(event);
        return;
      }
      clearNoteSelection();
      panStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        viewport: { ...state.viewport },
      };
      elements.canvasSurface.classList.add("panning");
      elements.canvasSurface.setPointerCapture(event.pointerId);
    });

    elements.canvasSurface.addEventListener("pointermove", (event) => {
      if (!panStart || panStart.pointerId !== event.pointerId) {
        return;
      }
      state.viewport = {
        ...state.viewport,
        x: panStart.viewport.x + event.clientX - panStart.x,
        y: panStart.viewport.y + event.clientY - panStart.y,
      };
      elements.canvasContent.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
    });

    const endPan = (event) => {
      if (!panStart || panStart.pointerId !== event.pointerId) {
        return;
      }
      panStart = null;
      elements.canvasSurface.classList.remove("panning");
      scheduleViewportSave();
    };

    elements.canvasSurface.addEventListener("pointerup", endPan);
    elements.canvasSurface.addEventListener("pointercancel", endPan);

    elements.canvasSurface.addEventListener("wheel", (event) => {
      if (!state.activeProject) {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomCanvas(wheelZoomMultiplier(event.deltaY), { x: event.clientX, y: event.clientY });
      } else {
        panCanvasByWheel(event);
      }
      scheduleViewportSave();
    }, { passive: false });

    elements.canvasSurface.addEventListener("gesturestart", (event) => {
      if (!state.activeProject) {
        return;
      }
      event.preventDefault();
      lastGestureScale = event.scale || 1;
    });

    elements.canvasSurface.addEventListener("gesturechange", (event) => {
      if (!state.activeProject) {
        return;
      }
      event.preventDefault();
      const currentScale = event.scale || 1;
      const multiplier = clamp(currentScale / lastGestureScale, 1 / MAX_WHEEL_ZOOM_STEP, MAX_WHEEL_ZOOM_STEP);
      lastGestureScale = currentScale;
      zoomCanvas(multiplier, { x: event.clientX, y: event.clientY });
      scheduleViewportSave();
    });

    elements.canvasSurface.addEventListener("gestureend", (event) => {
      event.preventDefault();
      lastGestureScale = 1;
    });
  }

  function startNoteSelectionDrag(event) {
    event.preventDefault();
    event.stopPropagation();

    const surfaceRect = elements.canvasSurface.getBoundingClientRect();
    const startPoint = {
      x: event.clientX - surfaceRect.left,
      y: event.clientY - surfaceRect.top,
    };
    const baseSelected = new Set(state.selectedNoteIds);
    const selectionBox = document.createElement("div");
    selectionBox.className = "note-selection-box";
    elements.canvasSurface.append(selectionBox);
    elements.canvasSurface.classList.add("selecting");
    const pointerId = event.pointerId;
    elements.canvasSurface.setPointerCapture(pointerId);

    const updateSelection = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const currentPoint = {
        x: moveEvent.clientX - surfaceRect.left,
        y: moveEvent.clientY - surfaceRect.top,
      };
      const screenRect = normalizeRect(startPoint, currentPoint);
      selectionBox.style.left = `${screenRect.x}px`;
      selectionBox.style.top = `${screenRect.y}px`;
      selectionBox.style.width = `${screenRect.width}px`;
      selectionBox.style.height = `${screenRect.height}px`;

      const worldRect = normalizeWorldRect(
        screenToWorld(surfaceRect.left + screenRect.x, surfaceRect.top + screenRect.y),
        screenToWorld(surfaceRect.left + screenRect.x + screenRect.width, surfaceRect.top + screenRect.y + screenRect.height),
      );
      state.selectedNoteIds = new Set(baseSelected);
      for (const note of state.activeNotes) {
        if (noteIntersectsWorldRect(note, worldRect)) {
          state.selectedNoteIds.add(note.id);
        }
      }
      updateSelectedNoteClasses();
    };

    const endSelection = (endEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }
      if (elements.canvasSurface.hasPointerCapture(pointerId)) {
        elements.canvasSurface.releasePointerCapture(pointerId);
      }
      elements.canvasSurface.classList.remove("selecting");
      selectionBox.remove();
      elements.canvasSurface.removeEventListener("pointermove", updateSelection);
      elements.canvasSurface.removeEventListener("pointerup", endSelection);
      elements.canvasSurface.removeEventListener("pointercancel", endSelection);
      window.removeEventListener("pointermove", updateSelection);
      window.removeEventListener("pointerup", endSelection);
      window.removeEventListener("pointercancel", endSelection);
    };

    updateSelection(event);
    elements.canvasSurface.addEventListener("pointermove", updateSelection);
    elements.canvasSurface.addEventListener("pointerup", endSelection);
    elements.canvasSurface.addEventListener("pointercancel", endSelection);
    window.addEventListener("pointermove", updateSelection);
    window.addEventListener("pointerup", endSelection);
    window.addEventListener("pointercancel", endSelection);
  }

  function normalizeRect(startPoint, currentPoint) {
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    return {
      x,
      y,
      width: Math.abs(currentPoint.x - startPoint.x),
      height: Math.abs(currentPoint.y - startPoint.y),
    };
  }

  function normalizeWorldRect(startWorld, endWorld) {
    const x = Math.min(startWorld.x, endWorld.x);
    const y = Math.min(startWorld.y, endWorld.y);
    return {
      x,
      y,
      width: Math.abs(endWorld.x - startWorld.x),
      height: Math.abs(endWorld.y - startWorld.y),
    };
  }

  function noteIntersectsWorldRect(note, rect) {
    const noteRight = note.position.x + NOTE_CARD_WORLD_WIDTH;
    const noteBottom = note.position.y + NOTE_CARD_WORLD_HEIGHT;
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;
    return note.position.x <= rectRight && noteRight >= rect.x && note.position.y <= rectBottom && noteBottom >= rect.y;
  }

  function wheelZoomMultiplier(deltaY) {
    const rawMultiplier = Math.exp(-deltaY * PINCH_ZOOM_SENSITIVITY);
    return clamp(rawMultiplier, 1 / MAX_WHEEL_ZOOM_STEP, MAX_WHEEL_ZOOM_STEP);
  }

  function panCanvasByWheel(event) {
    state.viewport = {
      ...state.viewport,
      x: state.viewport.x - event.deltaX,
      y: state.viewport.y - event.deltaY,
    };
    elements.canvasContent.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
  }

  function zoomCanvas(multiplier, screenPoint) {
    if (!state.activeProject) {
      return;
    }
    const rect = elements.canvasSurface.getBoundingClientRect();
    const pointer = screenPoint
      ? { x: screenPoint.x - rect.left, y: screenPoint.y - rect.top }
      : { x: rect.width / 2, y: rect.height / 2 };
    const before = {
      x: (pointer.x - state.viewport.x) / state.viewport.zoom,
      y: (pointer.y - state.viewport.y) / state.viewport.zoom,
    };
    const zoom = clamp(state.viewport.zoom * multiplier, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
    state.viewport = {
      x: pointer.x - before.x * zoom,
      y: pointer.y - before.y * zoom,
      zoom,
    };
    elements.canvasContent.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.zoom})`;
  }

  function recenterCanvas() {
    if (!state.activeProject) {
      return;
    }
    const rect = elements.canvasSurface.getBoundingClientRect();
    if (state.activeNotes.length === 0) {
      state.viewport = defaultViewport();
    } else {
      const padding = 120;
      const minX = Math.min(...state.activeNotes.map((note) => note.position.x));
      const minY = Math.min(...state.activeNotes.map((note) => note.position.y));
      const maxX = Math.max(...state.activeNotes.map((note) => note.position.x + NOTE_CARD_WORLD_WIDTH));
      const maxY = Math.max(...state.activeNotes.map((note) => note.position.y + NOTE_CARD_WORLD_HEIGHT));
      const width = Math.max(1, maxX - minX + padding * 2);
      const height = Math.max(1, maxY - minY + padding * 2);
      const zoom = clamp(Math.min(rect.width / width, rect.height / height), CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM);
      state.viewport = {
        zoom,
        x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
        y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
      };
    }
    scheduleViewportSave();
    renderCanvas();
  }

  function bindEvents() {
    elements.projectForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createProject(elements.projectName.value);
    });

    elements.searchInput.addEventListener("input", () => {
      state.searchQuery = elements.searchInput.value;
      renderCanvas();
    });

    document.addEventListener("keydown", handleKeyboardShortcut);
    elements.addNoteButton.addEventListener("click", createNoteAtCenter);
    elements.deleteProjectButton.addEventListener("click", deleteActiveProject);
    elements.fullscreenButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    elements.fullscreenButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.isFullScreenMode = !state.isFullScreenMode;
      renderDisplayMode();
      renderCanvas();
    });
    elements.zoomInButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    elements.zoomOutButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    elements.recenterButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    elements.zoomInButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zoomCanvas(1.2);
      scheduleViewportSave();
    });
    elements.zoomOutButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zoomCanvas(1 / 1.2);
      scheduleViewportSave();
    });
    elements.recenterButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      recenterCanvas();
    });
    setupCanvasPanAndZoom();
  }

  async function boot() {
    bindEvents();
    const initialized = await storage.init();
    if (!initialized.ok) {
      state.pendingStatus = "storage_error";
      setError(initialized.error);
      render();
      return;
    }

    const settings = await storage.getSettings();
    if (settings.ok) {
      state.settings = settings.value;
    } else {
      setError(settings.error);
    }

    await refreshProjects();
    const activeProjectExists = state.settings.activeProjectId && state.projects.some((project) => project.id === state.settings.activeProjectId);
    if (activeProjectExists) {
      await selectProject(state.settings.activeProjectId);
    } else {
      render();
    }
  }

  boot();
})();
