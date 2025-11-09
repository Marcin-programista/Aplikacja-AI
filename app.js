/* 
  Aplikacja ToDo — Vanilla JS + Materialize + localStorage
  Autor: (Twoje imię)
  Komentarze: po polsku
  Nazewnictwo kodu: angielskie
*/

/* ======== CONSTANTS & STATE ======== */
const STORAGE_KEY = "todo.tasks.v1";

/** Globalny stan widoku (filtry, sortowanie, wyszukiwanie) */
const viewState = {
  filter: "all",          // all | active | completed
  sort: "created_desc",   // patrz select #sort
  query: ""               // tekst wyszukiwania
};

/* ======== UTILITIES ======== */

/** Generuje unikalne ID oparte na czasie i losie */
const uid = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Bezpieczny odczyt z localStorage */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Load error:", e);
    M.toast({html: "Błąd odczytu danych z przeglądarki.", classes: "red"});
    return [];
  }
}

/** Bezpieczny zapis do localStorage */
function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error("Save error:", e);
    M.toast({html: "Błąd zapisu — sprawdź uprawnienia przeglądarki.", classes: "red"});
  }
}

/** Mapowanie priorytetu do wagi sortowania */
function priorityWeight(p) {
  switch (p) {
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    default: return 0;
  }
}

/** Parsuje datę (yyyy-mm-dd lub dd mmm yyyy z datepickera Materialize) na timestamp północy */
function toDateStamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  // Normalizujemy do 23:59:59 żeby deadline był "do końca dnia"
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Formatuje timestamp na YYYY-MM-DD */
function formatDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Zwraca true jeśli task przeterminowany i nieukończony */
function isOverdue(task) {
  return !task.completed && task.deadline && task.deadline < Date.now();
}

/** Zwraca listę tagów/kategorii (po przecinkach/spacjach) */
function parseTags(categoryStr) {
  if (!categoryStr) return [];
  return categoryStr
    .split(/[,#]/)       // podział po przecinku lub '#'
    .map(t => t.trim())
    .filter(Boolean);
}

/* ======== DATA ACCESS ======== */
let tasks = loadTasks();

/* ======== DOM ELEMENTS ======== */
const els = {
  taskForm: document.getElementById("taskForm"),
  taskId: document.getElementById("taskId"),
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  assignee: document.getElementById("assignee"),
  priority: document.getElementById("priority"),
  deadline: document.getElementById("deadline"),
  category: document.getElementById("category"),

  taskList: document.getElementById("taskList"),
  taskItemTemplate: document.getElementById("taskItemTemplate"),

  filterBtns: document.querySelectorAll(".filter-btn"),
  sortSelect: document.getElementById("sort"),
  searchInput: document.getElementById("search"),

  activeCount: document.getElementById("activeCount"),
  totalCount: document.getElementById("totalCount"),

  clearCompletedBtn: document.getElementById("clearCompletedBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importModal: document.getElementById("importModal"),
  importTextarea: document.getElementById("importTextarea"),
  importFile: document.getElementById("importFile"),
  confirmImportBtn: document.getElementById("confirmImportBtn"),
  mergeImport: document.getElementById("mergeImport"),

  emptyState: document.getElementById("emptyState"),
  resetBtn: document.getElementById("resetBtn")
};

/* ======== MATERIALIZE INIT ======== */
document.addEventListener("DOMContentLoaded", () => {
  // Init select & datepicker & modal & tooltips
  const selects = document.querySelectorAll("select");
  M.FormSelect.init(selects);

  const datepickers = document.querySelectorAll(".datepicker");
  M.Datepicker.init(datepickers, {
    firstDay: 1,
    format: "yyyy-mm-dd",
    i18n: {
      cancel: "Anuluj", clear: "Wyczyść", done: "OK",
      months: ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"],
      monthsShort:["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"],
      weekdays: ["Niedziela","Poniedziałek","Wtorek","Środa","Czwartek","Piątek","Sobota"],
      weekdaysShort: ["Nd","Pn","Wt","Śr","Cz","Pt","So"],
      weekdaysAbbrev: ["N","P","W","Ś","C","P","S"]
    }
  });

  const modals = document.querySelectorAll(".modal");
  M.Modal.init(modals);

  const tooltips = document.querySelectorAll(".tooltipped");
  M.Tooltip.init(tooltips);

  render();
});

/* ======== RENDERING ======== */

/** Zwraca listę zadań po filtrach, wyszukiwaniu i sortowaniu */
function getVisibleTasks() {
  const q = viewState.query.trim().toLowerCase();

  let filtered = tasks.filter(t => {
    // filtr statusu
    if (viewState.filter === "active" && t.completed) return false;
    if (viewState.filter === "completed" && !t.completed) return false;

    // wyszukiwanie
    if (q) {
      const hay = [
        t.title || "",
        t.description || "",
        t.assignee || "",
        t.category || ""
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // sortowanie
  filtered.sort((a, b) => {
    switch (viewState.sort) {
      case "created_asc": return a.createdAt - b.createdAt;
      case "created_desc": return b.createdAt - a.createdAt;
      case "deadline_asc": return (a.deadline || Infinity) - (b.deadline || Infinity);
      case "deadline_desc": return (b.deadline || -Infinity) - (a.deadline || -Infinity);
      case "priority_desc": return priorityWeight(b.priority) - priorityWeight(a.priority);
      case "priority_asc": return priorityWeight(a.priority) - priorityWeight(b.priority);
      case "assignee_asc": return (a.assignee || "").localeCompare(b.assignee || "");
      case "assignee_desc": return (b.assignee || "").localeCompare(a.assignee || "");
      default: return 0;
    }
  });

  return filtered;
}

/** Renderuje licznik, listę i pusty stan */
function render() {
  // liczniki
  const active = tasks.filter(t => !t.completed).length;
  document.getElementById("activeCount").textContent = `Aktywne: ${active}`;
  document.getElementById("totalCount").textContent = `Łącznie: ${tasks.length}`;

  // lista
  const visible = getVisibleTasks();
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  const emptyState = document.getElementById("emptyState");
  if (visible.length === 0) {
    emptyState.classList.remove("hide");
  } else {
    emptyState.classList.add("hide");
  }

  visible.forEach(task => {
    const node = renderTaskItem(task);
    list.appendChild(node);
  });
}

/** Tworzy element listy zadania */
function renderTaskItem(task) {
  const tmpl = document.getElementById("taskItemTemplate").content.cloneNode(true);
  const li = tmpl.querySelector("li");
  li.dataset.id = task.id;
  li.classList.add("added");

  const title = tmpl.querySelector(".task-title");
  const meta = tmpl.querySelector(".task-meta");
  const tagsWrap = tmpl.querySelector(".task-tags");
  const checkbox = tmpl.querySelector(".complete-checkbox");
  const editBtn = tmpl.querySelector(".edit-btn");
  const deleteBtn = tmpl.querySelector(".delete-btn");

  title.textContent = task.title || "(bez tytułu)";

  // badge priorytetu
  const badge = document.createElement("span");
  badge.className = "badge-priority";
  if (task.priority === "high") badge.classList.add("priority-high");
  if (task.priority === "medium") badge.classList.add("priority-medium");
  if (task.priority === "low") badge.classList.add("priority-low");
  badge.textContent = (task.priority === "high" ? "Wysoki"
                    : task.priority === "medium" ? "Średni"
                    : "Niski");
  title.appendChild(badge);

  // meta (opis, wykonawca, deadline)
  const parts = [];
  if (task.description) parts.push(task.description);
  if (task.assignee) parts.push(`👤 ${task.assignee}`);
  parts.push(`⏳ ${task.deadline ? formatDate(task.deadline) : "-"}`);
  meta.textContent = parts.join(" • ");

  // tagi/kategorie jako chipy
  const tags = parseTags(task.category);
  tags.forEach(t => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = t;
    tagsWrap.appendChild(chip);
  });

  // ukończone
  if (task.completed) {
    li.classList.add("task-completed");
    checkbox.checked = true;
  }

  // przeterminowane
  if (isOverdue(task)) {
    li.classList.add("overdue");
  }

  // handlers
  checkbox.addEventListener("change", () => {
    toggleComplete(task.id, checkbox.checked);
  });

  editBtn.addEventListener("click", () => {
    startEdit(task.id);
  });

  deleteBtn.addEventListener("click", () => {
    deleteTask(task.id);
  });

  return li;
}

/* ======== CRUD ======== */

/** Dodaje zadanie na podstawie danych formularza */
function addTask(data) {
  const now = Date.now();
  const newTask = {
    id: uid(),
    title: data.title,
    description: data.description || "",
    completed: false,
    assignee: data.assignee || "",
    priority: data.priority || "low",
    deadline: data.deadline || null,
    category: data.category || "",
    createdAt: now,
    updatedAt: now
  };
  tasks.unshift(newTask);
  saveTasks(tasks);
  M.toast({html: "Dodano zadanie.", classes: "teal"});
  render();
}

/** Aktualizuje istniejące zadanie */
function updateTask(id, patch) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], ...patch, updatedAt: Date.now() };
  saveTasks(tasks);
  M.toast({html: "Zaktualizowano zadanie.", classes: "teal"});
  render();
}

/** Usuwa zadanie */
function deleteTask(id) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const li = document.getElementById("taskList").querySelector(`li[data-id="${id}"]`);
  if (li) {
    li.classList.add("removed");
    setTimeout(() => {
      tasks.splice(idx, 1);
      saveTasks(tasks);
      render();
      M.toast({html: "Usunięto zadanie.", classes: "grey darken-1"});
    }, 220);
  } else {
    tasks.splice(idx, 1);
    saveTasks(tasks);
    render();
  }
}

/** Oznacza ukończenie/reaktywację */
function toggleComplete(id, completed) {
  updateTask(id, { completed });
  M.toast({html: completed ? "Zadanie zakończone." : "Przywrócono zadanie.", classes: completed ? "green" : "blue"});
}

/** Rozpoczyna edycję — wypełnia formularz danymi */
function startEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById("taskId").value = task.id;
  document.getElementById("title").value = task.title;
  document.getElementById("description").value = task.description;
  document.getElementById("assignee").value = task.assignee;
  document.getElementById("category").value = task.category;

  // select priority
  const priorityEl = document.getElementById("priority");
  priorityEl.value = task.priority;
  M.FormSelect.getInstance(priorityEl).destroy(); // odśwież
  M.FormSelect.init(priorityEl);

  // date
  const deadlineEl = document.getElementById("deadline");
  const dp = M.Datepicker.getInstance(deadlineEl);
  if (dp) {
    dp.setDate(task.deadline ? new Date(task.deadline) : null);
    dp._finishSelection(); // odśwież label
  }
  deadlineEl.value = task.deadline ? formatDate(task.deadline) : "";

  // labels
  M.updateTextFields();

  M.toast({html: "Tryb edycji — wprowadź zmiany i zapisz.", classes: "blue"});
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ======== FORM HANDLERS ======== */
document.getElementById("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const titleEl = document.getElementById("title");
  const deadlineEl = document.getElementById("deadline");

  // walidacja tytułu
  if (!titleEl.value.trim()) {
    M.toast({html: "Tytuł jest wymagany.", classes: "red"});
    titleEl.focus();
    return;
  }

  const payload = {
    title: titleEl.value.trim(),
    description: document.getElementById("description").value.trim(),
    assignee: document.getElementById("assignee").value.trim(),
    priority: document.getElementById("priority").value,
    deadline: toDateStamp(deadlineEl.value),
    category: document.getElementById("category").value.trim()
  };

  const editingId = document.getElementById("taskId").value;
  if (editingId) {
    updateTask(editingId, payload);
  } else {
    addTask(payload);
  }

  // reset form
  document.getElementById("taskForm").reset();
  document.getElementById("taskId").value = "";
  M.updateTextFields();
  const dp = M.Datepicker.getInstance(deadlineEl);
  if (dp) dp.setDate(null);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  document.getElementById("taskId").value = "";
  M.updateTextFields();
});

/* ======== FILTERS, SORT, SEARCH ======== */
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("teal", "lighten-1"));
    btn.classList.add("teal", "lighten-1");
    viewState.filter = btn.dataset.filter;
    render();
  });
});

document.getElementById("sort").addEventListener("change", (e) => {
  viewState.sort = e.target.value;
  render();
});

document.getElementById("search").addEventListener("input", (e) => {
  viewState.query = e.target.value;
  render();
});

/* ======== BULK ACTIONS ======== */
document.getElementById("clearCompletedBtn").addEventListener("click", () => {
  const before = tasks.length;
  tasks = tasks.filter(t => !t.completed);
  saveTasks(tasks);
  render();
  const diff = before - tasks.length;
  M.toast({html: diff ? `Usunięto zakończone: ${diff}` : "Brak zakończonych do usunięcia.", classes: diff ? "grey darken-1" : "blue"});
});

/* ======== EXPORT / IMPORT ======== */
document.getElementById("exportBtn").addEventListener("click", () => {
  const dataStr = JSON.stringify(tasks, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks_export_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  M.toast({html: "Wyeksportowano JSON.", classes: "teal"});
});

document.getElementById("confirmImportBtn").addEventListener("click", () => {
  const textarea = document.getElementById("importTextarea");
  const fileInput = document.getElementById("importFile");
  const merge = document.getElementById("mergeImport").checked;

  const file = fileInput.files && fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => tryImport(reader.result, merge);
    reader.onerror = () => M.toast({html: "Błąd odczytu pliku.", classes: "red"});
    reader.readAsText(file);
  } else if (textarea.value.trim()) {
    tryImport(textarea.value.trim(), merge);
  } else {
    M.toast({html: "Wklej JSON lub wybierz plik.", classes: "red"});
  }
});

function tryImport(text, merge) {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("Nieprawidłowy format (oczekiwana tablica).");

    // validate minimal shape
    const normalized = arr.map(raw => ({
      id: raw.id || uid(),
      title: String(raw.title || "(bez tytułu)"),
      description: String(raw.description || ""),
      completed: !!raw.completed,
      assignee: String(raw.assignee || ""),
      priority: ["low","medium","high"].includes(raw.priority) ? raw.priority : "low",
      deadline: raw.deadline ? Number(raw.deadline) : null,
      category: String(raw.category || ""),
      createdAt: raw.createdAt ? Number(raw.createdAt) : Date.now(),
      updatedAt: raw.updatedAt ? Number(raw.updatedAt) : Date.now()
    }));

    if (merge) {
      // scalanie po id — nadpisujemy istniejące o tym samym id
      const map = new Map(tasks.map(t => [t.id, t]));
      normalized.forEach(t => map.set(t.id, t));
      tasks = Array.from(map.values());
    } else {
      tasks = normalized;
    }

    saveTasks(tasks);
    render();
    M.toast({html: "Zaimportowano zadania.", classes: "teal"});
    const modal = M.Modal.getInstance(document.getElementById("importModal"));
    modal.close();
    document.getElementById("importTextarea").value = "";
    document.getElementById("importFile").value = "";
    M.updateTextFields();
  } catch (e) {
    console.error(e);
    M.toast({html: "Błąd importu JSON.", classes: "red"});
  }
}

/* ======== ACCESSIBILITY & EDGE CASES ======== */
try {
  const testKey = "__test__";
  localStorage.setItem(testKey, "1");
  localStorage.removeItem(testKey);
} catch (e) {
  M.toast({html: "localStorage niedostępny — dane nie będą zapisywane.", classes: "red"});
}

/* ======== SAMPLE SEED (opcjonalnie, jeśli pusto) ======== */
if (tasks.length === 0) {
  tasks = [
    {
      id: uid(),
      title: "Przykładowe zadanie",
      description: "Zapoznaj się z aplikacją.",
      completed: false,
      assignee: "Jan",
      priority: "medium",
      deadline: toDateStamp(new Date(Date.now() + 86400000).toISOString().slice(0,10)),
      category: "demo, start",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  saveTasks(tasks);
}

/* ======== FIRST RENDER ======== */
render();
