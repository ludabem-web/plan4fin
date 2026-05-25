const state = {
  selectedPeriod: "Незавершенные",
  periodStart: "",
  periodEnd: "",
  periodNote: "",
  projects: [],
  periodHistory: {}
};

const STORAGE_KEY = "financePlannerState";

const projectCountInput = document.querySelector("#projectCount");
const projectsGrid = document.querySelector("#projectsGrid");
const projectSelect = document.querySelector("#projectSelect");
const taskTextInput = document.querySelector("#taskText");
const taskDeadlineInput = document.querySelector("#taskDeadline");
const addTaskButton = document.querySelector("#addTaskButton");
const periodDates = document.querySelector("#periodDates");
const projectTotal = document.querySelector("#projectTotal");
const doneTotal = document.querySelector("#doneTotal");
const doneProgressBar = document.querySelector("#doneProgressBar");
const periodStartInput = document.querySelector("#periodStart");
const periodEndInput = document.querySelector("#periodEnd");
const periodNoteInput = document.querySelector("#periodNote");
const previousPeriodButton = document.querySelector("#previousPeriodButton");
const nextPeriodButton = document.querySelector("#nextPeriodButton");
const periodDrawer = document.querySelector("#periodDrawer");
const closeDrawerButton = document.querySelector("#closeDrawerButton");
const drawerTitle = document.querySelector("#drawerTitle");
const drawerDates = document.querySelector("#drawerDates");
const drawerTaskList = document.querySelector("#drawerTaskList");
const periodButtons = document.querySelectorAll(".period-button");

const REPORT_TYPES = {
  incomplete: "Незавершенные",
  deadline: "Дедлайн",
  today: "На сегодня"
};

function createProject(index) {
  return {
    id: crypto.randomUUID(),
    name: `Проект ${index + 1}`,
    tasks: []
  };
}

function loadState() {
  const savedState = localStorage.getItem(STORAGE_KEY);
  if (!savedState) return false;

  try {
    const parsedState = JSON.parse(savedState);

    state.selectedPeriod = Object.values(REPORT_TYPES).includes(parsedState.selectedPeriod)
      ? parsedState.selectedPeriod
      : state.selectedPeriod;
    state.periodStart = parsedState.periodStart || "";
    state.periodEnd = parsedState.periodEnd || "";
    state.periodNote = parsedState.periodNote || "";
    state.periodHistory =
      parsedState.periodHistory && typeof parsedState.periodHistory === "object"
        ? parsedState.periodHistory
        : {};
    state.projects = Array.isArray(parsedState.projects)
      ? parsedState.projects.map((project, projectIndex) => ({
          id: project.id || crypto.randomUUID(),
          name: project.name || `Проект ${projectIndex + 1}`,
          tasks: Array.isArray(project.tasks)
            ? project.tasks.map((task) => ({
                id: task.id || crypto.randomUUID(),
                title: task.title || "",
                deadline: task.deadline || "",
                done: Boolean(task.done)
              }))
            : []
        }))
      : [];

    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

function saveState() {
  saveCurrentPeriodSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncControlsWithState() {
  projectCountInput.value = state.projects.length;
  periodStartInput.value = state.periodStart;
  periodEndInput.value = state.periodEnd;
  periodNoteInput.value = state.periodNote;

  periodButtons.forEach((button) => {
    button.classList.remove("active");
  });
}

function syncProjectCount() {
  saveCurrentPeriodSnapshot();
  const requestedCount = Math.max(0, Math.min(Number(projectCountInput.value) || 0, 24));
  projectCountInput.value = requestedCount;

  while (state.projects.length < requestedCount) {
    state.projects.push(createProject(state.projects.length));
  }

  state.projects = state.projects.slice(0, requestedCount);
  render();
}

function addTask() {
  const text = taskTextInput.value.trim();
  const projectId = projectSelect.value;

  if (!text || !projectId) {
    taskTextInput.focus();
    return;
  }

  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;

  project.tasks.push({
    id: crypto.randomUUID(),
    title: text,
    deadline: taskDeadlineInput.value,
    done: false
  });

  taskTextInput.value = "";
  taskDeadlineInput.value = "";
  taskTextInput.focus();
  render();
}

function updateProject(projectId, field, value) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;

  project[field] = value;
  renderProjectSelect();
  saveState();
}

function toggleTask(projectId, taskId, done) {
  const project = state.projects.find((item) => item.id === projectId);
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!task) return;

  task.done = done;
  render();
}

function toggleTaskEverywhere(projectId, taskId, done) {
  let changed = false;
  const project = state.projects.find((item) => item.id === projectId);
  const task = project?.tasks.find((item) => item.id === taskId);

  if (task) {
    task.done = done;
    changed = true;
  }

  Object.values(state.periodHistory).forEach((snapshot) => {
    if (!snapshot || !Array.isArray(snapshot.projects)) return;

    const snapshotProject = snapshot.projects.find((item) => item.id === projectId);
    const snapshotTask = snapshotProject?.tasks.find((item) => item.id === taskId);

    if (snapshotTask) {
      snapshotTask.done = done;
      changed = true;
    }
  });

  if (changed) render();
}

function updateTaskDeadline(projectId, taskId, deadline) {
  const project = state.projects.find((item) => item.id === projectId);
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!task || task.done) return;

  task.deadline = deadline;
  render();
}

function updateTaskTitle(projectId, taskId, title) {
  const project = state.projects.find((item) => item.id === projectId);
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!task || task.done) return;

  task.title = title;
  saveState();
  if (periodDrawer.classList.contains("open")) {
    renderDrawerTasks();
  }
}

function updateDatedPeriod() {
  const previousPeriodKey = getPeriodKey();
  const incompleteTasksByProject = getIncompleteTasksByProject();
  saveCurrentPeriodSnapshot();

  state.periodStart = periodStartInput.value;
  state.periodEnd = periodEndInput.value;
  state.periodNote = periodNoteInput.value.trim();

  if (previousPeriodKey !== getPeriodKey() && !restorePeriodSnapshot()) {
    carryIncompleteTasks(incompleteTasksByProject);
  }

  render();
}

function shiftPeriod(direction) {
  ensurePeriodDates();
  saveCurrentPeriodSnapshot();

  const startDate = parseDate(state.periodStart);
  const endDate = parseDate(state.periodEnd);
  if (!startDate || !endDate) return;

  const incompleteTasksByProject = getIncompleteTasksByProject();
  const periodLength = getPeriodLengthInDays(startDate, endDate);
  const nextStartDate = addDays(startDate, periodLength * direction);
  const nextEndDate = addDays(endDate, periodLength * direction);

  state.periodStart = toInputDate(nextStartDate);
  state.periodEnd = toInputDate(nextEndDate);
  periodStartInput.value = state.periodStart;
  periodEndInput.value = state.periodEnd;

  if (direction < 0) {
    restorePeriodSnapshot();
  } else {
    carryIncompleteTasks(incompleteTasksByProject);
  }

  render();
}

function ensurePeriodDates() {
  if (state.periodStart && state.periodEnd) return;

  const today = new Date();
  const periodLength = getFallbackPeriodLength();
  const startDate = state.periodStart ? parseDate(state.periodStart) : today;
  const endDate = state.periodEnd ? parseDate(state.periodEnd) : addDays(startDate, periodLength - 1);

  state.periodStart = toInputDate(startDate);
  state.periodEnd = toInputDate(endDate);
  periodStartInput.value = state.periodStart;
  periodEndInput.value = state.periodEnd;
}

function getFallbackPeriodLength() {
  return 7;
}

function getPeriodLengthInDays(startDate, endDate) {
  const dayLength = 24 * 60 * 60 * 1000;
  const diff = Math.round((endDate - startDate) / dayLength);
  return Math.max(Math.abs(diff) + 1, 1);
}

function getIncompleteTasksByProject() {
  return state.projects.reduce((result, project) => {
    result[project.id] = project.tasks.filter((task) => !task.done).map(cloneTask);
    return result;
  }, {});
}

function carryIncompleteTasks(incompleteTasksByProject) {
  state.projects.forEach((project) => {
    project.tasks = incompleteTasksByProject[project.id] || [];
  });
}

function getPeriodKey() {
  if (!state.periodStart || !state.periodEnd) return "";
  return `${state.periodStart}|${state.periodEnd}`;
}

function saveCurrentPeriodSnapshot() {
  const periodKey = getPeriodKey();
  if (!periodKey) return;

  state.periodHistory[periodKey] = {
    projects: state.projects.map((project) => ({
      id: project.id,
      tasks: project.tasks.map(cloneTask)
    }))
  };
}

function restorePeriodSnapshot() {
  const periodKey = getPeriodKey();
  const snapshot = state.periodHistory[periodKey];
  if (!snapshot || !Array.isArray(snapshot.projects)) return false;

  state.projects.forEach((project) => {
    const savedProject = snapshot.projects.find((item) => item.id === project.id);
    project.tasks = savedProject && Array.isArray(savedProject.tasks) ? savedProject.tasks.map(cloneTask) : [];
  });

  return true;
}

function cloneTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "",
    deadline: task.deadline || "",
    done: Boolean(task.done)
  };
}

function renderProjectSelect() {
  const previousValue = projectSelect.value;

  projectSelect.innerHTML = "";
  state.projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name || "Без названия";
    projectSelect.append(option);
  });

  if (state.projects.some((project) => project.id === previousValue)) {
    projectSelect.value = previousValue;
  }

  projectSelect.disabled = state.projects.length === 0;
  addTaskButton.disabled = state.projects.length === 0;
}

function renderSummary() {
  const totalTasks = state.projects.reduce((sum, project) => sum + project.tasks.length, 0);
  const completedTasks = state.projects.reduce(
    (sum, project) => sum + project.tasks.filter((task) => task.done).length,
    0
  );

  periodDates.textContent = getPeriodLabel();
  projectTotal.textContent = state.projects.length;
  doneTotal.textContent = `${completedTasks} из ${totalTasks}`;
  doneProgressBar.style.width = `${totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%`;
}

function getPeriodLabel() {
  const start = formatDate(state.periodStart);
  const end = formatDate(state.periodEnd);
  const dates = start && end ? `${start} - ${end}` : start || end || "Не указаны";

  return state.periodNote ? `${dates}: ${state.periodNote}` : dates;
}

function renderProjects() {
  projectsGrid.innerHTML = "";

  if (state.projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Укажите количество проектов, чтобы начать планирование.";
    projectsGrid.append(empty);
    return;
  }

  state.projects.forEach((project) => {
    const completed = project.tasks.filter((task) => task.done).length;
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <label class="field">
          <span>Название проекта</span>
          <input class="project-name-input" type="text" value="${escapeAttribute(project.name)}" />
        </label>
      </div>
      <div class="tasks-header">
        <h2>Задачи</h2>
        <span class="task-counter">${completed} / ${project.tasks.length} выполнено</span>
      </div>
    `;

    const nameInput = card.querySelector(".project-name-input");

    nameInput.addEventListener("input", (event) => {
      updateProject(project.id, "name", event.target.value);
    });

    const taskList = document.createElement("ul");
    taskList.className = "task-list";

    if (project.tasks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "Пока нет задач по проекту.";
      taskList.append(empty);
    } else {
      project.tasks.forEach((task) => {
        const item = document.createElement("li");

        item.className = `task-item${task.done ? " done" : ""}`;
        item.innerHTML = `
          <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Отметить выполнение" />
          <input class="task-title-edit" type="text" value="${escapeAttribute(task.title)}" ${task.done ? "disabled" : ""} aria-label="Текст задачи" />
          <label class="task-deadline-label">
            <input class="task-deadline-edit" type="date" value="${task.deadline}" ${task.done ? "disabled" : ""} aria-label="Дедлайн задачи" />
          </label>
        `;

        item.querySelector('input[type="checkbox"]').addEventListener("change", (event) => {
          toggleTask(project.id, task.id, event.target.checked);
        });

        item.querySelector(".task-title-edit").addEventListener("input", (event) => {
          updateTaskTitle(project.id, task.id, event.target.value);
        });

        item.querySelector(".task-deadline-edit").addEventListener("change", (event) => {
          updateTaskDeadline(project.id, task.id, event.target.value);
        });

        taskList.append(item);
      });
    }

    card.append(taskList);
    projectsGrid.append(card);
  });
}

function render() {
  renderProjectSelect();
  renderSummary();
  renderProjects();
  if (periodDrawer.classList.contains("open")) {
    renderDrawerTasks();
  }
  saveState();
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function openPeriodDrawer(reportType) {
  saveState();
  state.selectedPeriod = reportType;
  periodButtons.forEach((item) => item.classList.toggle("active", item.dataset.report === reportType));
  renderDrawerTasks();
  periodDrawer.classList.add("open");
  periodDrawer.setAttribute("aria-hidden", "false");
  saveState();
}

function closePeriodDrawer() {
  periodDrawer.classList.remove("open");
  periodDrawer.setAttribute("aria-hidden", "true");
}

function renderDrawerTasks() {
  const tasks = getTasksForReport(state.selectedPeriod);

  drawerTitle.textContent = state.selectedPeriod;
  drawerDates.textContent = getReportDescription(state.selectedPeriod);
  drawerTaskList.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "В этом списке задач нет.";
    drawerTaskList.append(empty);
    return;
  }

  tasks.forEach((item) => {
    const taskElement = document.createElement("article");
    const deadlineText = item.task.deadline ? formatDate(item.task.deadline) : "Без дедлайна";

    taskElement.className = `drawer-task-item${item.task.done ? " done" : ""}`;
    taskElement.innerHTML = `
      <div class="drawer-task-top">
          <input class="drawer-task-checkbox" type="checkbox" aria-label="Отметить выполнение" />
          <span class="drawer-task-title">${escapeHtml(item.task.title)}</span>
          <span class="drawer-task-deadline${item.task.deadline ? "" : " empty"}">${deadlineText}</span>
        </div>
      <div class="drawer-task-meta">${escapeHtml(item.projectName)}</div>
    `;

    taskElement.querySelector(".drawer-task-checkbox").addEventListener("change", (event) => {
      toggleTaskEverywhere(item.projectId, item.task.id, event.target.checked);
    });

    drawerTaskList.append(taskElement);
  });
}

function getTasksForReport(reportType) {
  const today = toInputDate(new Date());
  const allTasks = getAllReportTasks();

  if (reportType === REPORT_TYPES.incomplete) {
    return allTasks.filter((item) => !item.task.done).sort(compareDrawerTasks);
  }

  if (reportType === REPORT_TYPES.deadline) {
    return allTasks
      .filter((item) => !item.task.done && item.task.deadline && item.task.deadline < today)
      .sort(compareDrawerTasks);
  }

  if (reportType === REPORT_TYPES.today) {
    return allTasks.filter((item) => !item.task.done && item.task.deadline === today).sort(compareDrawerTasks);
  }

  return allTasks.sort(compareDrawerTasks);
}

function getReportDescription(reportType) {
  const today = toInputDate(new Date());

  if (reportType === REPORT_TYPES.incomplete) {
    return "Все незавершенные задачи";
  }

  if (reportType === REPORT_TYPES.deadline) {
    return `Просрочены до ${formatDate(today)}`;
  }

  if (reportType === REPORT_TYPES.today) {
    return `Дедлайн сегодня: ${formatDate(today)}`;
  }

  return "Все проекты";
}

function getAllReportTasks() {
  const tasksById = new Map();

  saveCurrentPeriodSnapshot();

  Object.entries(state.periodHistory).forEach(([periodKey, snapshot]) => {
    if (!snapshot || !Array.isArray(snapshot.projects)) return;

    snapshot.projects.forEach((snapshotProject) => {
      const project = state.projects.find((item) => item.id === snapshotProject.id);
      if (!project || !Array.isArray(snapshotProject.tasks)) return;

      snapshotProject.tasks.forEach((task) => {
        tasksById.set(`${project.id}-${task.id}`, {
          projectId: project.id,
          projectName: project.name || "Без названия",
          task: cloneTask(task)
        });
      });
    });
  });

  addCurrentTasksToReport(tasksById);
  return Array.from(tasksById.values()).sort(compareDrawerTasks);
}

function addCurrentTasksToReport(tasksById) {
  state.projects.forEach((project) => {
    project.tasks.forEach((task) => {
      tasksById.set(`${project.id}-${task.id}`, {
        projectId: project.id,
        projectName: project.name || "Без названия",
        task: cloneTask(task)
      });
    });
  });
}

function compareDrawerTasks(first, second) {
  if (first.task.done !== second.task.done) return Number(first.task.done) - Number(second.task.done);
  return (first.task.deadline || "9999-12-31").localeCompare(second.task.deadline || "9999-12-31");
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

periodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openPeriodDrawer(button.dataset.report);
  });
});

projectCountInput.addEventListener("input", syncProjectCount);
addTaskButton.addEventListener("click", addTask);
taskTextInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTask();
});
taskDeadlineInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTask();
});
periodStartInput.addEventListener("change", updateDatedPeriod);
periodEndInput.addEventListener("change", updateDatedPeriod);
periodNoteInput.addEventListener("input", updateDatedPeriod);
previousPeriodButton.addEventListener("click", () => shiftPeriod(-1));
nextPeriodButton.addEventListener("click", () => shiftPeriod(1));
closeDrawerButton.addEventListener("click", closePeriodDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePeriodDrawer();
});

if (loadState()) {
  syncControlsWithState();
  render();
} else {
  syncProjectCount();
}
