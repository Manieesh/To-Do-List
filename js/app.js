"use strict";

const STORAGE_KEYS = {
  tasks: "taskflow.tasks",
  filter: "taskflow.filter"
};

const VALID_FILTERS = new Set(["all", "active", "completed"]);

const elements = {
  form: document.querySelector("#task-form"),
  input: document.querySelector("#task-input"),
  timeInput: document.querySelector("#task-time"),
  durationInput: document.querySelector("#task-duration"),
  validation: document.querySelector("#validation-message"),
  list: document.querySelector("#task-list"),
  filters: document.querySelector(".filters"),
  filterButtons: document.querySelectorAll(".filter-button"),
  clearCompleted: document.querySelector("#clear-completed"),
  activeCount: document.querySelector("#active-count"),
  completedCount: document.querySelector("#completed-count"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCopy: document.querySelector("#empty-copy"),
  todayLabel: document.querySelector("#today-label"),
  toast: document.querySelector("#toast"),
  statTotal: document.querySelector("#stat-total"),
  statActive: document.querySelector("#stat-active"),
  statCompleted: document.querySelector("#stat-completed"),
  statPercent: document.querySelector("#stat-percent"),
  currentYear: document.querySelector("#current-year"),
  backToTop: document.querySelector("#back-to-top")
};

// The state object is the single source of truth for tasks and the current view.
const state = {
  tasks: loadTasks(),
  filter: loadFilter(),
  editingId: null
};

let toastTimer;

function loadTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks));

    if (!Array.isArray(savedTasks)) {
      return [];
    }

    // Ignore malformed stored entries so one bad value cannot break the app.
    return savedTasks.filter((task) =>
      task &&
      typeof task.id === "string" &&
      typeof task.text === "string" &&
      typeof task.completed === "boolean" &&
      typeof task.createdAt === "number" &&
      (task.dueTime === undefined || typeof task.dueTime === "string") &&
      (task.duration === undefined || typeof task.duration === "string")
    );
  } catch {
    return [];
  }
}

function loadFilter() {
  const savedFilter = localStorage.getItem(STORAGE_KEYS.filter);
  return VALID_FILTERS.has(savedFilter) ? savedFilter : "all";
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks));
}

function saveFilter() {
  localStorage.setItem(STORAGE_KEYS.filter, state.filter);
}

function createId() {
  return window.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addTask(text, dueTime, duration) {
  state.tasks.unshift({
    id: createId(),
    text,
    completed: false,
    createdAt: Date.now(),
    dueTime: dueTime || "",
    duration: duration || ""
  });

  commitTasks();
  showToast("Task added");
}

function toggleTask(id) {
  state.tasks = state.tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
  commitTasks();
}

function updateTask(id, text) {
  const cleanText = text.trim();
  const task = state.tasks.find((item) => item.id === id);

  if (!task || !cleanText) {
    state.editingId = null;
    render();
    return;
  }

  if (task.text !== cleanText) {
    state.tasks = state.tasks.map((item) =>
      item.id === id ? { ...item, text: cleanText } : item
    );
    showToast("Task updated");
  }

  state.editingId = null;
  commitTasks();
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);

  if (!task || !window.confirm(`Delete "${task.text}"?`)) {
    return;
  }

  state.tasks = state.tasks.filter((item) => item.id !== id);
  commitTasks();
  showToast("Task deleted");
}

function clearCompletedTasks() {
  const completedCount = state.tasks.filter((task) => task.completed).length;

  if (!completedCount || !window.confirm(`Clear ${completedCount} completed task${completedCount === 1 ? "" : "s"}?`)) {
    return;
  }

  state.tasks = state.tasks.filter((task) => !task.completed);
  commitTasks();
  showToast("Completed tasks cleared");
}

function commitTasks() {
  saveTasks();
  render();
}

function getVisibleTasks() {
  if (state.filter === "active") {
    return state.tasks.filter((task) => !task.completed);
  }

  if (state.filter === "completed") {
    return state.tasks.filter((task) => task.completed);
  }

  return state.tasks;
}

function render() {
  const visibleTasks = getVisibleTasks();
  const fragment = document.createDocumentFragment();

  visibleTasks.forEach((task) => fragment.append(createTaskElement(task)));
  elements.list.replaceChildren(fragment);

  renderCounters();
  renderFilters();
  renderEmptyState(visibleTasks.length);
  renderFooterStats();
}

function renderFooterStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const active = total - completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  if (elements.statTotal) elements.statTotal.textContent = String(total);
  if (elements.statActive) elements.statActive.textContent = String(active);
  if (elements.statCompleted) elements.statCompleted.textContent = String(completed);
  if (elements.statPercent) elements.statPercent.textContent = `${percent}%`;
}

// Task elements are created from state. Action handling stays on the parent list.
function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = `task-item${task.completed ? " is-completed" : ""}`;
  item.dataset.id = task.id;

  const toggleControl = document.createElement("label");
  toggleControl.className = "task-check-control";

  const toggle = document.createElement("input");
  toggle.className = "task-checkbox";
  toggle.type = "checkbox";
  toggle.dataset.action = "toggle";
  toggle.checked = task.completed;
  toggle.setAttribute("aria-label", task.completed ? `Mark ${task.text} as active` : `Mark ${task.text} as completed`);

  const checkmark = document.createElement("span");
  checkmark.className = "checkmark";
  checkmark.setAttribute("aria-hidden", "true");
  checkmark.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6.5 12.5 3.2 3.2 7.8-8.1"></path></svg>';
  toggleControl.append(toggle, checkmark);

  const content = document.createElement("div");
  content.className = "task-content";

  if (state.editingId === task.id) {
    content.append(createEditInput(task));
  } else {
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    const date = document.createElement("time");
    date.className = "task-date";
    date.dateTime = new Date(task.createdAt).toISOString();
    date.textContent = formatCreatedAt(task.createdAt);

    content.append(text, date);

    if (task.dueTime) {
      const dueTime = document.createElement("span");
      dueTime.className = "task-time";
      dueTime.textContent = `Due ${formatDueTime(task.dueTime)}`;
      content.append(dueTime);
    }

    if (task.duration) {
      const duration = document.createElement("span");
      duration.className = "task-duration";
      duration.textContent = task.dueTime ? ` • ${task.duration} mins` : `${task.duration} mins`;
      content.append(duration);
    }
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(
    createIconButton("edit", `Edit ${task.text}`, '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>'),
    createIconButton("delete", `Delete ${task.text}`, '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"></path>')
  );

  item.append(toggleControl, content, actions);
  return item;
}

function createEditInput(task) {
  const input = document.createElement("input");
  input.className = "edit-input";
  input.type = "text";
  input.value = task.text;
  input.maxLength = 160;
  input.dataset.editInput = "";
  input.setAttribute("aria-label", `Edit ${task.text}`);

  // Focus after the newly rendered field enters the document.
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  return input;
}

function createIconButton(action, label, iconPaths) {
  const button = document.createElement("button");
  button.className = "icon-button";
  button.type = "button";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths}</svg>`;
  return button;
}

function renderCounters() {
  const completed = state.tasks.filter((task) => task.completed).length;
  elements.activeCount.textContent = String(state.tasks.length - completed);
  elements.completedCount.textContent = String(completed);
  elements.clearCompleted.disabled = completed === 0;
}

function renderFilters() {
  elements.filterButtons.forEach((button) => {
    const isActive = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderEmptyState(visibleCount) {
  elements.emptyState.hidden = visibleCount > 0;

  const messages = {
    all: ["Your day is wide open", "Add a task above and take the first step."],
    active: ["Everything is complete", "You have no active tasks right now."],
    completed: ["Nothing completed yet", "Finished tasks will appear here."]
  };

  [elements.emptyTitle.textContent, elements.emptyCopy.textContent] = messages[state.filter];
}

function formatCreatedAt(timestamp) {
  const createdDate = new Date(timestamp);
  const today = new Date();
  const isToday = createdDate.toDateString() === today.toDateString();

  return isToday
    ? `Today at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(createdDate)}`
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(createdDate);
}

function formatDueTime(timeString) {
  if (!timeString) {
    return "";
  }

  const [hours, minutes] = timeString.split(":").map(Number);
  const dueDate = new Date();
  dueDate.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(dueDate);
}

function showValidation(message) {
  elements.validation.textContent = message;
  elements.input.setAttribute("aria-invalid", String(Boolean(message)));
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function submitEdit(input) {
  const item = input.closest(".task-item");
  if (item) {
    updateTask(item.dataset.id, input.value);
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.input.value.trim();
  const dueTime = elements.timeInput.value;
  const duration = elements.durationInput.value;

  if (!text) {
    showValidation("Enter a task before adding it.");
    elements.input.focus();
    return;
  }

  showValidation("");
  addTask(text, dueTime, duration);
  elements.form.reset();
  elements.input.focus();
});

elements.input.addEventListener("input", () => {
  if (elements.input.value.trim()) {
    showValidation("");
  }
});

elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");

  if (!button || button.dataset.filter === state.filter) {
    return;
  }

  state.filter = button.dataset.filter;
  state.editingId = null;
  saveFilter();
  render();
});

// A single delegated listener handles every dynamic task action.
elements.list.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  const item = event.target.closest(".task-item");

  if (!actionButton || !item) {
    return;
  }

  const { id } = item.dataset;
  const { action } = actionButton.dataset;

  if (action === "toggle") {
    toggleTask(id);
  } else if (action === "edit") {
    state.editingId = id;
    render();
  } else if (action === "delete") {
    deleteTask(id);
  }
});

elements.list.addEventListener("keydown", (event) => {
  if (!event.target.matches("[data-edit-input]")) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitEdit(event.target);
  } else if (event.key === "Escape") {
    state.editingId = null;
    render();
  }
});

elements.list.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-edit-input]")) {
    submitEdit(event.target);
  }
});

elements.clearCompleted.addEventListener("click", clearCompletedTasks);

elements.todayLabel.textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric"
}).format(new Date());

render();
