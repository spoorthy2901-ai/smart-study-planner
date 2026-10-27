const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "smartStudyPlannerTasks_v1";
let tasks = loadTasks();
let editingId = null;
let timerInterval = null;
let timerSeconds = 25 * 60;
let timerIsRunning = false;
let timerIsBreak = false;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  catch { alert("Your browser could not save tasks. You can still use the planner in this session."); }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function prettyDate(date) {
  if (!date) return "";
  const parsed = new Date(date + "T00:00:00");
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function renderTasks() {
  const filter = $("filterSelect").value;
  const shown = tasks.filter(task => filter === "all" || (filter === "active" && !task.completed) || (filter === "completed" && task.completed));
  $("taskList").innerHTML = shown.map(task => {
    const meta = [
      task.subject ? `<span class="tag">${escapeHTML(task.subject)}</span>` : "",
      task.dueDate ? `<span>📅 ${escapeHTML(prettyDate(task.dueDate))}</span>` : "",
      task.time ? `<span>◷ ${escapeHTML(task.time)}</span>` : "",
      `<span class="tag priority-${task.priority.toLowerCase()}">${escapeHTML(task.priority)} priority</span>`
    ].filter(Boolean).join("");
    return `<article class="task-item ${task.completed ? "is-complete" : ""}">
      <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} complete" data-action="toggle" data-id="${task.id}" ${task.completed ? "checked" : ""}>
      <div class="task-content"><div class="task-title">${escapeHTML(task.title)}</div><div class="task-meta">${meta}</div></div>
      <div class="task-actions"><button class="icon-button" type="button" title="Edit task" aria-label="Edit task" data-action="edit" data-id="${task.id}">✎</button><button class="icon-button" type="button" title="Delete task" aria-label="Delete task" data-action="delete" data-id="${task.id}">×</button></div>
    </article>`;
  }).join("");
  $("emptyState").hidden = shown.length > 0;
  $("clearCompleted").hidden = !tasks.some(task => task.completed);
  const total = tasks.length;
  const completed = tasks.filter(task => task.completed).length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  $("totalCount").textContent = total;
  $("completedCount").textContent = completed;
  $("remainingCount").textContent = total - completed;
  $("progressPercent").textContent = percent + "%";
  $("progressBar").style.width = percent + "%";
  $("taskPill").textContent = `${total} ${total === 1 ? "task" : "tasks"}`;
}
function resetForm() {
  $("taskForm").reset();
  editingId = null;
  $("taskForm").querySelector("button[type=submit]").innerHTML = "<span>＋</span> Add study task";
  $("taskInput").focus();
}
$("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("taskInput").value.trim();
  if (!title) { $("taskInput").focus(); return; }
  const data = {
    title,
    subject: $("subjectInput").value.trim(),
    dueDate: $("dateInput").value,
    time: $("timeInput").value,
    priority: $("priorityInput").value
  };
  if (editingId !== null) {
    tasks = tasks.map(task => task.id === editingId ? { ...task, ...data } : task);
  } else {
    tasks.unshift({ id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random(), ...data, completed: false, createdAt: Date.now() });
  }
  saveTasks();
  resetForm();
  renderTasks();
});
$("taskList").addEventListener("click", (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const id = control.dataset.id;
  const action = control.dataset.action;
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  if (action === "toggle") {
    task.completed = control.checked;
  } else if (action === "delete") {
    tasks = tasks.filter(item => item.id !== id);
    if (editingId === id) resetForm();
  } else if (action === "edit") {
    editingId = id;
    $("taskInput").value = task.title;
    $("subjectInput").value = task.subject || "";
    $("dateInput").value = task.dueDate || "";
    $("timeInput").value = task.time || "";
    $("priorityInput").value = task.priority || "Medium";
    $("taskForm").querySelector("button[type=submit]").innerHTML = "✓ Save changes";
    $("taskInput").focus();
    $("taskForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  saveTasks();
  renderTasks();
});
$("filterSelect").addEventListener("change", renderTasks);
$("clearCompleted").addEventListener("click", () => {
  tasks = tasks.filter(task => !task.completed);
  if (editingId && !tasks.some(task => task.id === editingId)) resetForm();
  saveTasks();
  renderTasks();
});

// Pomodoro timer
function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60).toString().padStart(2, "0");
  const seconds = (timerSeconds % 60).toString().padStart(2, "0");
  $("timerDisplay").textContent = `${minutes}:${seconds}`;
  const elapsedFraction = 1 - timerSeconds / (timerIsBreak ? 5 * 60 : 25 * 60);
  $("timerDisplay").setAttribute("aria-label", `${minutes} minutes ${seconds} seconds remaining`);
  document.querySelector(".timer-circle").style.background = `conic-gradient(var(--purple) ${Math.max(0, elapsedFraction) * 360}deg, #eeeafa 0deg)`;
  $("timerMode").textContent = timerIsBreak ? "BREAK TIME" : "FOCUS TIME";
  $("timerStart").textContent = timerIsRunning ? "Ⅱ Pause" : "▶ Start";
  $("timerModeToggle").textContent = timerIsBreak ? "Switch to 25-minute focus" : "Switch to 5-minute break";
}
function stopTimer() {
  if (timerInterval !== null) clearInterval(timerInterval);
  timerInterval = null;
  timerIsRunning = false;
}
$("timerStart").addEventListener("click", () => {
  if (timerIsRunning) {
    stopTimer();
    updateTimerDisplay();
    return;
  }
  timerIsRunning = true;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    if (timerSeconds <= 0) {
      stopTimer();
      timerSeconds = 0;
      updateTimerDisplay();
      alert(timerIsBreak ? "Break finished! Ready to focus again?" : "Focus session complete! Time for a short break.");
      return;
    }
    updateTimerDisplay();
  }, 1000);
});
$("timerReset").addEventListener("click", () => {
  stopTimer();
  timerSeconds = timerIsBreak ? 5 * 60 : 25 * 60;
  updateTimerDisplay();
});
$("timerModeToggle").addEventListener("click", () => {
  stopTimer();
  timerIsBreak = !timerIsBreak;
  timerSeconds = timerIsBreak ? 5 * 60 : 25 * 60;
  updateTimerDisplay();
});

const tips = [
  "Break big topics into small tasks. A clear next step makes starting easier.",
  "Try studying for 25 minutes, then take a short screen-free break.",
  "Put your phone away while studying to reduce distractions.",
  "At the end of each session, write down one thing you learned.",
  "Start with the task that matters most, not necessarily the easiest one.",
  "Keep your study space tidy and prepare your materials before you begin."
];
let tipIndex = 0;
$("nextTip").addEventListener("click", () => {
  tipIndex = (tipIndex + 1) % tips.length;
  $("tipText").textContent = tips[tipIndex];
});
$("todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
renderTasks();
updateTimerDisplay();
