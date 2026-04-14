"use strict";

function localDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localMonthValue() {
  return localDateValue().slice(0, 7);
}

const pageByRole = {
  student: "student.html",
  teacher: "teacher.html",
  admin: "admin.html",
};

const defaultSectionByRole = {
  student: "overviewSection",
  teacher: "overviewSection",
  admin: "overviewSection",
};

const defaultFiltersByRole = {
  student: {
    attendanceSemester: 6,
    attendanceSubject: "",
    attendanceView: "overall",
    attendanceMonth: localMonthValue(),
    attendanceDate: "",
    timetableDate: localDateValue(),
    timetableView: "day",
    resultsSemester: 6,
  },
  teacher: {
    attendanceCourseId: null,
    marksCourseId: null,
    assignmentCourseId: null,
    teacherDate: localDateValue(),
    teacherHistoryDate: "",
  },
  admin: {},
};

const state = {
  role: document.body.dataset.role,
  session: window.Session.get(),
  dashboard: null,
  charts: {},
  ui: {
    activeSection: defaultSectionByRole[document.body.dataset.role] || "overviewSection",
    navOpen: false,
    bootstrapped: false,
    loading: false,
  },
  filters: JSON.parse(JSON.stringify(defaultFiltersByRole[document.body.dataset.role] || {})),
};

const storageKey = `eduworkflow-ui:${state.role}`;

function byId(id) {
  return document.getElementById(id);
}

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleize(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shortAttendanceLabel(status) {
  const labels = {
    present: "P",
    absent: "A",
    late: "L",
    medical_leave: "ML",
  };
  return labels[status] || titleize(status);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLongDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  const normalized = String(value).includes("T") ? value : String(value).replace(" ", "T");
  return new Date(normalized).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatMonthLabel(value) {
  if (!value) return "All months";
  return new Date(`${value}-01`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function persistUiState() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        activeSection: state.ui.activeSection,
        filters: state.filters,
      }),
    );
  } catch (_error) {
    // Ignore storage failures.
  }
}

function hydrateUiState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.activeSection) state.ui.activeSection = parsed.activeSection;
    if (parsed.filters && typeof parsed.filters === "object") {
      state.filters = { ...state.filters, ...parsed.filters };
    }
  } catch (_error) {
    // Ignore malformed storage entries.
  }
}

hydrateUiState();

function showToast(message, type = "info") {
  const host = byId("toastContainer");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function startClock() {
  const node = byId("liveClock");
  if (!node) return;
  const tick = () => {
    node.textContent = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  tick();
  setInterval(tick, 1000);
}

function logout() {
  window.Session.clear();
  localStorage.removeItem(storageKey);
  window.location.replace("index.html");
}

function protectPage() {
  if (!state.session.role || !state.session.userId) {
    logout();
    return false;
  }
  if (state.session.role !== state.role) {
    window.location.replace(pageByRole[state.session.role] || "index.html");
    return false;
  }
  return true;
}

function setIdentity(profile) {
  const initials = (profile.name || "EW")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  byId("sidebarAvatar").textContent = initials;
  byId("sidebarName").textContent = profile.name;
  if (profile.role === "student") {
    byId("sidebarMeta").textContent = `${profile.details.program.split("(")[0].trim()} - Section ${profile.details.section}`;
  } else if (profile.role === "teacher") {
    byId("sidebarMeta").textContent = `${profile.details.designation} - ${profile.department.code || ""}`;
  } else {
    byId("sidebarMeta").textContent = profile.details.title;
  }
}

function setPageHeader(title, subtitle) {
  byId("pageTitle").textContent = title;
  byId("pageSubtitle").textContent = subtitle;
}

function toggleNav(force) {
  state.ui.navOpen = typeof force === "boolean" ? force : !state.ui.navOpen;
  document.body.classList.toggle("nav-open", state.ui.navOpen);
}

function setActiveSection(sectionId) {
  const fallback = defaultSectionByRole[state.role] || "overviewSection";
  const nextSection = byId(sectionId) ? sectionId : fallback;
  state.ui.activeSection = nextSection;
  qsa(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.target === nextSection);
  });
  qsa(".view-section").forEach((section) => {
    section.classList.toggle("hidden", section.id !== nextSection);
  });
  toggleNav(false);
  persistUiState();
}

function restoreSectionState() {
  setActiveSection(state.ui.activeSection);
}

function openModal({ title, body, confirmLabel = "Save", onConfirm }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-card">
      <div class="panel-header">
        <div><h3 class="panel-title">${escapeHtml(title)}</h3></div>
        <button class="ghost-btn" type="button" data-modal-close>Close</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="button-row" style="margin-top: 18px;">
        <button class="ghost-btn" type="button" data-modal-close>Cancel</button>
        <button class="primary-btn" type="button" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  qsa("[data-modal-close]", backdrop).forEach((button) => button.addEventListener("click", close));
  qs("[data-modal-confirm]", backdrop).addEventListener("click", async () => {
    try {
      await onConfirm(backdrop, close);
    } catch (error) {
      showToast(error.message, "error");
    }
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function renderLineChart(canvasId, name, labels, values, label) {
  destroyChart(name);
  const canvas = byId(canvasId);
  if (!canvas || typeof Chart === "undefined" || !labels.length) return;
  state.charts[name] = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        borderColor: "#245b9f",
        backgroundColor: "rgba(36, 91, 159, 0.1)",
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: "#9e4d1b",
        pointBorderWidth: 0,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#667085" } },
        y: { grid: { color: "rgba(138, 146, 166, 0.18)" }, ticks: { color: "#667085" } },
      },
    },
  });
}

function renderBarChart(canvasId, name, labels, values, seriesLabel) {
  destroyChart(name);
  const canvas = byId(canvasId);
  if (!canvas || typeof Chart === "undefined" || !labels.length) return;
  state.charts[name] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: seriesLabel,
        data: values,
        backgroundColor: ["#9e4d1b", "#245b9f", "#4b7d62", "#d39c2d", "#6d4e9f", "#b54d5f"],
        borderRadius: 10,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#667085" } },
        y: { grid: { color: "rgba(138, 146, 166, 0.18)" }, ticks: { color: "#667085" } },
      },
    },
  });
}

function renderState(type, title, copy) {
  return `
    <div class="state-card ${type === "loading" ? "loading" : ""}">
      <div class="state-title">${escapeHtml(title)}</div>
      <div class="state-copy">${escapeHtml(copy)}</div>
    </div>
  `;
}

function badgeClass(kind) {
  const normalized = String(kind || "").toLowerCase();
  if (["paid", "active", "approved", "stable", "success", "present", "open", "credited", "applied", "scheduled", "read"].includes(normalized)) return "badge-success";
  if (["pending", "review", "warning", "late", "in_review", "ongoing", "renewal_requested", "shortlisted", "updated"].includes(normalized)) return "badge-warning";
  if (["absent", "danger", "suspended", "archived", "cancelled", "overdue", "resolved", "closed"].includes(normalized)) return "badge-danger";
  return "badge-info";
}

function sectionHeader(title, subtitle, actions = "") {
  return `
    <div class="panel-header">
      <div>
        <h3 class="panel-title">${escapeHtml(title)}</h3>
        <p class="panel-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      ${actions}
    </div>
  `;
}

function renderMetricStrip(items) {
  return `
    <div class="metric-strip">
      ${items.map((item) => `
        <article class="metric-card ${item.tone ? `tone-${item.tone}` : ""}">
          <div class="metric-label">${escapeHtml(item.label)}</div>
          <div class="metric-value">${escapeHtml(item.value)}</div>
          <div class="metric-subvalue">${escapeHtml(item.meta || "")}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderNotificationPanel(notifications) {
  if (!notifications?.items?.length) {
    return renderState("empty", "No notifications", "You are caught up for now.");
  }
  return `
    <div class="inline-list">
      ${notifications.items.slice(0, 4).map((item) => `
        <div class="list-item">
          <div class="list-item-header">
            <div class="list-title">${escapeHtml(item.title)}</div>
            <span class="badge ${item.is_read ? "badge-info" : "badge-warning"}">${item.is_read ? "Read" : "New"}</span>
          </div>
          <div class="list-meta">${escapeHtml(item.message)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAgenda(items, emptyTitle, emptyCopy) {
  if (!items?.length) {
    return renderState("empty", emptyTitle, emptyCopy);
  }
  return `
    <div class="agenda-list">
      ${items.map((item) => `
        <div class="agenda-item">
          <div class="agenda-time">${escapeHtml(item.time || `${item.start_time} - ${item.end_time}`)}</div>
          <div class="agenda-body">
            <div class="agenda-title">${escapeHtml(item.course || item.subject)}</div>
            <div class="agenda-meta">${escapeHtml(item.teacher ? `${item.teacher} - ${item.room}` : `${item.section ? `Section ${item.section} - ` : ""}${item.room}`)}</div>
          </div>
          <span class="badge ${badgeClass(item.status)}">${escapeHtml(titleize(item.status || "scheduled"))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAttendanceDaywise(daywise) {
  if (!daywise?.length) {
    return renderState("empty", "No attendance entries", "Choose a different filter to view daily attendance records.");
  }
  return `
    <div class="daywise-grid">
      ${daywise.map((day) => `
        <article class="day-card">
          <div class="list-item-header">
            <div class="list-title">${escapeHtml(formatLongDate(day.date))}</div>
            <span class="badge badge-info">${escapeHtml(`${day.sessionCount} session${day.sessionCount === 1 ? "" : "s"}`)}</span>
          </div>
          <div class="chip-row">
            <span class="badge badge-success">P ${escapeHtml(day.presentCount)}</span>
            <span class="badge badge-danger">A ${escapeHtml(day.absentCount)}</span>
            <span class="badge badge-warning">L ${escapeHtml(day.lateCount)}</span>
            <span class="badge badge-info">ML ${escapeHtml(day.medicalLeaveCount)}</span>
          </div>
          <div class="session-stack">
            ${day.sessions.map((session) => `
              <div class="session-line">
                <div>
                  <strong>${escapeHtml(session.subject)}</strong>
                  <span class="session-code">${escapeHtml(session.code)}</span>
                </div>
                <div class="chip-row">
                  <span class="chip-muted">${escapeHtml(`${session.start_time} - ${session.end_time}`)}</span>
                  <span class="badge ${badgeClass(session.status)}">${escapeHtml(shortAttendanceLabel(session.status))}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTableEmpty(colspan, title, copy) {
  return `
    <tr>
      <td colspan="${colspan}">
        ${renderState("empty", title, copy)}
      </td>
    </tr>
  `;
}

function profilePanel(profile) {
  const details = profile.details || {};
  const rows = Object.entries(details).map(([key, value]) => `
    <tr>
      <th>${escapeHtml(titleize(key))}</th>
      <td>${escapeHtml(value)}</td>
    </tr>
  `).join("");
  return `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Profile Details", "Academic, departmental, and contact information currently on record.")}
        <div class="table-scroll">
          <table class="data-table">
            <tbody>
              <tr><th>Name</th><td>${escapeHtml(profile.name)}</td></tr>
              <tr><th>Email</th><td>${escapeHtml(profile.email)}</td></tr>
              <tr><th>Phone</th><td>${escapeHtml(profile.phone || "-")}</td></tr>
              <tr><th>Status</th><td><span class="badge ${badgeClass(profile.status)}">${escapeHtml(titleize(profile.status))}</span></td></tr>
              <tr><th>Department</th><td>${escapeHtml(profile.department?.name || "-")}</td></tr>
              <tr><th>Last Login</th><td>${escapeHtml(formatDateTime(profile.lastLoginAt))}</td></tr>
              ${rows}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        ${sectionHeader("Account Settings", "Update your display details and password without leaving the portal.")}
        <form id="profileForm" class="field-block">
          <label for="profileNameInput">Display Name</label>
          <input id="profileNameInput" name="name" value="${escapeHtml(profile.name)}" />
          <label for="profilePhoneInput">Phone</label>
          <input id="profilePhoneInput" name="phone" value="${escapeHtml(profile.phone || "")}" />
          <div class="button-row"><button class="primary-btn" type="submit">Save Profile</button></div>
        </form>
        <form id="passwordForm" class="field-block" style="margin-top: 20px;">
          <label for="currentPassword">Current Password</label>
          <input id="currentPassword" name="currentPassword" type="password" required />
          <label for="newPassword">New Password</label>
          <input id="newPassword" name="newPassword" type="password" required />
          <div class="button-row"><button class="secondary-btn" type="submit">Change Password</button></div>
        </form>
      </article>
    </div>
  `;
}

function sanitizeStudentFilters(data) {
  const subjects = new Set((data.attendanceDetail?.summary?.items || []).map((item) => item.subject));
  if (state.filters.attendanceSubject && !subjects.has(state.filters.attendanceSubject)) {
    state.filters.attendanceSubject = "";
  }
  const resultSemesters = (data.results.summary || []).map((item) => Number(item.semester));
  if (resultSemesters.length && !resultSemesters.includes(Number(state.filters.resultsSemester))) {
    state.filters.resultsSemester = resultSemesters[resultSemesters.length - 1];
  }
}

function renderStudent() {
  const data = state.dashboard;
  sanitizeStudentFilters(data);
  const profile = data.profile;
  const attendanceDetail = data.attendanceDetail;
  const attendanceSummary = attendanceDetail.summary;
  const pendingAssignments = data.assignments.filter((item) => item.submission_status === "pending");
  const pendingFees = data.fees.items.filter((item) => item.status === "pending" || item.status === "overdue");
  const pendingRequests = data.requests.filter((item) => item.status !== "approved" && item.status !== "resolved");
  const timetableItems = data.timetable.items || [];
  const weeklyTimetable = timetableItems.reduce((groups, slot) => {
    groups[slot.day] = groups[slot.day] || [];
    groups[slot.day].push(slot);
    return groups;
  }, {});

  setIdentity(profile);
  setPageHeader(
    `${getGreeting()}, ${profile.name.split(" ")[0]}`,
    `${profile.details.program} - Semester ${profile.details.semester} - ${profile.details.academic_year}`,
  );

  byId("overviewSection").innerHTML = `
    <div class="content-grid">
      <article class="panel masthead-panel">
        <div class="operational-head">
          <div>
            <div class="panel-kicker">Student Home</div>
            <h2 class="section-title">Academic work at a glance</h2>
            <p class="panel-subtitle">Open the next task quickly, review today's classes, and stay on top of attendance, fees, and requests.</p>
          </div>
          <div class="quick-actions">
            <button class="primary-btn" type="button" data-jump="attendanceSection">Attendance</button>
            <button class="secondary-btn" type="button" data-jump="timetableSection">Timetable</button>
            <button class="ghost-btn" type="button" data-jump="requestsSection">Requests</button>
          </div>
        </div>
        <div class="module-grid">
          <button class="module-tile" type="button" data-jump="attendanceSection">
            <span class="module-label">Attendance</span>
            <strong class="module-value">${escapeHtml(`${data.kpis.attendance}%`)}</strong>
            <span class="module-meta">${escapeHtml(`${attendanceSummary.attendedTotal}/${attendanceSummary.deliveredTotal} sessions credited`)}</span>
          </button>
          <button class="module-tile" type="button" data-jump="resultsSection">
            <span class="module-label">Current CGPA</span>
            <strong class="module-value">${escapeHtml(data.kpis.cgpa)}</strong>
            <span class="module-meta">${escapeHtml(`Rank ${data.kpis.rank}`)}</span>
          </button>
          <button class="module-tile" type="button" data-jump="servicesSection">
            <span class="module-label">Pending fees</span>
            <strong class="module-value">${escapeHtml(formatCurrency(data.kpis.pendingFees))}</strong>
            <span class="module-meta">${escapeHtml(`${pendingFees.length} item${pendingFees.length === 1 ? "" : "s"} due`)}</span>
          </button>
          <button class="module-tile" type="button" data-jump="requestsSection">
            <span class="module-label">Requests in progress</span>
            <strong class="module-value">${escapeHtml(String(pendingRequests.length))}</strong>
            <span class="module-meta">${escapeHtml(`${data.kpis.openGrievances} support issue${data.kpis.openGrievances === 1 ? "" : "s"} open`)}</span>
          </button>
        </div>
      </article>
      <article class="panel">
        ${sectionHeader("Notice Board", `${data.notifications.unreadCount} unread notification${data.notifications.unreadCount === 1 ? "" : "s"}.`)}
        ${renderNotificationPanel(data.notifications)}
      </article>
    </div>
    ${renderMetricStrip([
      { label: "Credits Earned", value: `${data.kpis.credits}/${data.kpis.totalCredits}`, meta: "Programme progress" },
      { label: "Pending Assignments", value: pendingAssignments.length, meta: "Awaiting submission" },
      { label: "Approved Leave", value: data.requests.filter((item) => item.status === "approved").length, meta: "Requests cleared" },
      { label: "Library Items", value: data.library.length, meta: "Currently issued" },
    ])}
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Today's Timetable", state.filters.timetableView === "day" ? formatLongDate(state.filters.timetableDate) : "Weekly classroom schedule")}
        ${renderAgenda(timetableItems, "No classes scheduled", state.filters.timetableView === "day" ? "No classes are scheduled for the selected date." : "No timetable slots are available for the selected week view.")}
      </article>
      <article class="panel">
        ${sectionHeader("Attendance Summary", `Showing ${attendanceSummary.items.length} subject${attendanceSummary.items.length === 1 ? "" : "s"} for the selected semester.`)}
        <div class="inline-list">
          ${attendanceSummary.items.slice(0, 5).map((item) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(item.subject)}</div>
                <span class="badge ${badgeClass(item.percentage >= 75 ? "active" : "warning")}">${escapeHtml(`${item.percentage}%`)}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${item.attended}/${item.delivered} credited - ${item.code}`)}</div>
              <div class="chip-row">
                <span class="chip-muted">Present ${escapeHtml(item.presentCount)}</span>
                <span class="chip-muted">Absent ${escapeHtml(item.absentCount)}</span>
                <span class="chip-muted">Medical leave ${escapeHtml(item.medicalLeaveCount)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Performance Trend", "Semester progression across SGPA and CGPA history.")}
        <div class="chart-wrap"><canvas id="studentCgpaChart"></canvas></div>
      </article>
      <article class="panel">
        ${sectionHeader("Recent Notices", "Academic, placement, and campus updates published for the portal.")}
        <div class="inline-list">
          ${data.notices.slice(0, 4).map((notice) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(notice.title)}</div>
                <span class="badge ${badgeClass(notice.priority)}">${escapeHtml(titleize(notice.priority))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${titleize(notice.audience)} - ${formatDate(notice.created_at)}`)}</div>
              <div class="list-meta">${escapeHtml(notice.message)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;

  byId("attendanceSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Attendance Summary", "Review subject totals, switch to day-wise history, and keep filters pinned while you work.")}
      <form id="studentAttendanceFilters" class="filters filter-bar">
        <div class="field">
          <label for="attendanceSemester">Semester</label>
          <select id="attendanceSemester" name="attendanceSemester">
            ${[1, 2, 3, 4, 5, 6].map((value) => `<option value="${value}" ${Number(value) === Number(state.filters.attendanceSemester) ? "selected" : ""}>Semester ${value}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="attendanceSubject">Subject</label>
          <select id="attendanceSubject" name="attendanceSubject">
            <option value="">All subjects</option>
            ${attendanceSummary.items.map((item) => `<option value="${escapeHtml(item.subject)}" ${item.subject === state.filters.attendanceSubject ? "selected" : ""}>${escapeHtml(item.subject)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="attendanceMonth">Month</label>
          <input id="attendanceMonth" name="attendanceMonth" type="month" value="${escapeHtml(state.filters.attendanceMonth || "")}" />
        </div>
        <div class="field">
          <label for="attendanceDate">Date</label>
          <input id="attendanceDate" name="attendanceDate" type="date" value="${escapeHtml(state.filters.attendanceDate || "")}" />
        </div>
        <div class="field">
          <label for="attendanceView">View</label>
          <select id="attendanceView" name="attendanceView">
            <option value="overall" ${state.filters.attendanceView === "overall" ? "selected" : ""}>Overall</option>
            <option value="daywise" ${state.filters.attendanceView === "daywise" ? "selected" : ""}>Day-wise</option>
          </select>
        </div>
        <div class="field field-actions">
          <button class="primary-btn" type="submit">Apply</button>
          <button class="ghost-btn" type="button" data-action="reset-student-attendance">Reset</button>
        </div>
      </form>
      ${renderMetricStrip([
        { label: "Attendance", value: `${attendanceSummary.overallPercentage}%`, meta: `${attendanceSummary.attendedTotal}/${attendanceSummary.deliveredTotal} sessions credited` },
        { label: "Present", value: attendanceSummary.presentTotal, meta: formatMonthLabel(state.filters.attendanceMonth) },
        { label: "Absent", value: attendanceSummary.absentTotal, meta: state.filters.attendanceDate ? formatDate(state.filters.attendanceDate) : "Selected range" },
        { label: "Medical Leave", value: attendanceSummary.medicalLeaveTotal, meta: `Late ${attendanceSummary.lateTotal}` },
      ])}
    </article>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Subject-wise Breakdown", "Delivered, credited, and status counts for each enrolled subject.")}
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Held</th><th>Credited</th><th>P / A / ML</th><th>Attendance</th></tr></thead>
            <tbody>
              ${attendanceSummary.items.length ? attendanceSummary.items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.subject)} <span class="table-meta">${escapeHtml(item.code)}</span></td>
                  <td>${escapeHtml(item.delivered)}</td>
                  <td>${escapeHtml(item.attended)}</td>
                  <td>${escapeHtml(`${item.presentCount} / ${item.absentCount} / ${item.medicalLeaveCount}`)}</td>
                  <td><span class="badge ${badgeClass(item.percentage >= 75 ? "active" : "warning")}">${escapeHtml(`${item.percentage}%`)}</span></td>
                </tr>
              `).join("") : renderTableEmpty(5, "No subjects found", "No attendance summary matches the selected filter.")}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        ${sectionHeader(state.filters.attendanceView === "daywise" ? "Day-wise Attendance" : "Session Register", state.filters.attendanceView === "daywise" ? "Each date groups the session records already posted for you." : "Recent attendance entries with date, time, and recorded status.")}
        ${state.filters.attendanceView === "daywise"
          ? renderAttendanceDaywise(attendanceDetail.daywise)
          : `
            <div class="table-scroll">
              <table class="data-table">
                <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Status</th></tr></thead>
                <tbody>
                  ${attendanceDetail.sessions.length ? attendanceDetail.sessions.map((session) => `
                    <tr>
                      <td>${escapeHtml(formatDate(session.session_date))}</td>
                      <td>${escapeHtml(`${session.start_time} - ${session.end_time}`)}</td>
                      <td>${escapeHtml(session.subject)} <span class="table-meta">${escapeHtml(session.code)}</span></td>
                      <td><span class="badge ${badgeClass(session.status)}">${escapeHtml(titleize(session.status))}</span></td>
                    </tr>
                  `).join("") : renderTableEmpty(4, "No attendance records", "No attendance entries match the selected filter.")}
                </tbody>
              </table>
            </div>
          `}
      </article>
    </div>
  `;

  byId("timetableSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Class Timetable", "Switch between a single-day agenda and the full weekly classroom plan.")}
      <form id="studentTimetableFilters" class="filters filter-bar">
        <div class="field">
          <label for="timetableDate">Date</label>
          <input id="timetableDate" name="timetableDate" type="date" value="${escapeHtml(state.filters.timetableDate)}" />
        </div>
        <div class="field">
          <label for="timetableView">View</label>
          <select id="timetableView" name="timetableView">
            <option value="day" ${state.filters.timetableView === "day" ? "selected" : ""}>Day</option>
            <option value="week" ${state.filters.timetableView === "week" ? "selected" : ""}>Week</option>
          </select>
        </div>
        <div class="field field-actions"><button class="primary-btn" type="submit">Update View</button></div>
      </form>
      ${state.filters.timetableView === "day"
        ? renderAgenda(timetableItems, "No classes scheduled", "No timetable slots are scheduled for the selected date.")
        : `
          <div class="week-grid">
            ${Object.keys(weeklyTimetable).length
              ? Object.entries(weeklyTimetable).map(([day, slots]) => `
                <article class="week-column">
                  <div class="week-heading">${escapeHtml(day)}</div>
                  <div class="inline-list">
                    ${slots.map((slot) => `
                      <div class="list-item compact">
                        <div class="list-title">${escapeHtml(slot.course)}</div>
                        <div class="list-meta">${escapeHtml(`${slot.time} - ${slot.room}`)}</div>
                        <div class="list-meta">${escapeHtml(slot.teacher)}</div>
                      </div>
                    `).join("")}
                  </div>
                </article>
              `).join("")
              : renderState("empty", "No timetable slots", "No timetable slots are available for the selected week view.")}
          </div>
        `}
    </article>
  `;

  byId("resultsSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Result Details", "Review semester performance history and subject-level scores from the academic record.")}
      <form id="studentResultsFilters" class="filters filter-bar">
        <div class="field">
          <label for="resultsSemester">Semester</label>
          <select id="resultsSemester" name="resultsSemester">
            ${data.results.summary.map((item) => `<option value="${item.semester}" ${Number(item.semester) === Number(state.filters.resultsSemester) ? "selected" : ""}>Semester ${item.semester} - ${escapeHtml(item.academic_year)}</option>`).join("")}
          </select>
        </div>
        <div class="field field-actions"><button class="primary-btn" type="submit">Load Result</button></div>
      </form>
      ${renderMetricStrip([
        { label: "Selected Semester", value: `Semester ${data.results.semester}`, meta: `SGPA ${data.results.sgpa}` },
        { label: "CGPA", value: profile.details.cgpa, meta: profile.details.academic_year },
        { label: "Credits Earned", value: profile.details.earned_credits, meta: `Out of ${profile.details.total_credits}` },
        { label: "Class Rank", value: profile.details.rank_position, meta: "Current standing" },
      ])}
    </article>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Semester Ledger", "Each row shows the recorded SGPA, CGPA, credits, and rank for that semester.")}
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Semester</th><th>Year</th><th>SGPA</th><th>CGPA</th><th>Credits</th><th>Rank</th></tr></thead>
            <tbody>
              ${data.results.summary.map((item) => `
                <tr>
                  <td>${escapeHtml(item.semester)}</td>
                  <td>${escapeHtml(item.academic_year)}</td>
                  <td>${escapeHtml(item.sgpa)}</td>
                  <td>${escapeHtml(item.cgpa)}</td>
                  <td>${escapeHtml(`${item.credits_earned}/${item.credits_registered}`)}</td>
                  <td>${escapeHtml(item.rank_position)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        ${sectionHeader(`Semester ${data.results.semester} Result`, "Internal, external, total, grade, and credit information by subject.")}
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Internal</th><th>External</th><th>Total</th><th>Grade</th><th>Credits</th></tr></thead>
            <tbody>
              ${data.results.items.length ? data.results.items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.subject)} <span class="table-meta">${escapeHtml(item.code)}</span></td>
                  <td>${escapeHtml(item.internal_score)}</td>
                  <td>${escapeHtml(item.external_score)}</td>
                  <td>${escapeHtml(item.total_score)}</td>
                  <td><span class="badge badge-info">${escapeHtml(`${item.grade_letter} / ${item.grade_point}`)}</span></td>
                  <td>${escapeHtml(item.credits)}</td>
                </tr>
              `).join("") : renderTableEmpty(6, "No result rows", "No detailed results are available for the selected semester.")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;

  byId("servicesSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Assignments", "Keep track of submissions and open coursework from your enrolled subjects.")}
        <div class="inline-list">
          ${data.assignments.length ? data.assignments.map((assignment) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(assignment.title)}</div>
                <span class="badge ${badgeClass(assignment.submission_status)}">${escapeHtml(titleize(assignment.submission_status))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${assignment.subject} - Due ${formatDate(assignment.due_date)}`)}</div>
              <div class="list-meta">${escapeHtml(`Max score ${assignment.max_score}`)}</div>
            </div>
          `).join("") : renderState("empty", "No assignments listed", "There are no assignments assigned to you right now.")}
        </div>
      </article>
      <article class="panel">
        ${sectionHeader("Fees and Scholarships", "View outstanding items, payment status, and scholarship credits in one place.", pendingFees.length ? `<button class="primary-btn" type="button" data-action="pay-all-fees">Pay Pending</button>` : "")}
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Fee Head</th><th>Term</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${data.fees.items.map((item) => `
                <tr>
                  <td>${escapeHtml(item.fee_head)}</td>
                  <td>${escapeHtml(item.term_label)}</td>
                  <td>${escapeHtml(formatCurrency(item.amount))}</td>
                  <td><span class="badge ${badgeClass(item.status)}">${escapeHtml(titleize(item.status))}</span></td>
                  <td>${item.status === "pending" || item.status === "overdue" ? `<button class="secondary-btn" type="button" data-action="pay-fee" data-fee-id="${item.id}">Pay</button>` : "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ${data.fees.scholarships.length ? `<div class="chip-row scholarship-row">${data.fees.scholarships.map((item) => `<span class="badge badge-success">${escapeHtml(`${item.name} - ${formatCurrency(item.amount)}`)}</span>`).join("")}</div>` : ""}
      </article>
    </div>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Library and Notices", "Renew active loans and stay updated on campus-wide announcements.")}
        <div class="inline-list">
          ${data.library.map((loan) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(loan.title)}</div>
                ${loan.status === "issued" ? `<button class="secondary-btn" type="button" data-action="renew-loan" data-loan-id="${loan.id}">Renew</button>` : `<span class="badge ${badgeClass(loan.status)}">${escapeHtml(titleize(loan.status))}</span>`}
              </div>
              <div class="list-meta">${escapeHtml(`${loan.author} - Due ${formatDate(loan.due_date)}`)}</div>
              <div class="list-meta">${escapeHtml(`Fine ${formatCurrency(loan.fine_amount)}`)}</div>
            </div>
          `).join("")}
          ${data.notices.slice(0, 3).map((notice) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(notice.title)}</div>
                <span class="badge ${badgeClass(notice.priority)}">${escapeHtml(titleize(notice.priority))}</span>
              </div>
              <div class="list-meta">${escapeHtml(notice.message)}</div>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="panel">
        ${sectionHeader("Placement Desk", "Track open drives and apply directly where your profile is eligible.")}
        <div class="inline-list">
          ${data.placements.length ? data.placements.map((placement) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(`${placement.company} - ${placement.role}`)}</div>
                <button class="${placement.application_status ? "ghost-btn" : "primary-btn"}" type="button" data-action="apply-placement" data-placement-id="${placement.id}" ${placement.application_status ? "disabled" : ""}>${escapeHtml(placement.application_status ? titleize(placement.application_status) : "Apply")}</button>
              </div>
              <div class="list-meta">${escapeHtml(`${formatCurrency((placement.package_lpa || 0) * 100000)} package - Min CGPA ${placement.min_cgpa}`)}</div>
              <div class="list-meta">${escapeHtml(`${placement.location} - Drive ${formatDate(placement.drive_date)}`)}</div>
            </div>
          `).join("") : renderState("empty", "No placement drives", "There are no placement drives listed at the moment.")}
        </div>
      </article>
    </div>
  `;

  byId("requestsSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Medical Leave / Absence Request", "Submit date-bound requests with the reason and supporting file name, if any.")}
        <form id="leaveRequestForm" class="field-block">
          <label for="requestType">Request Type</label>
          <select id="requestType" name="requestType">
            <option value="medical_leave">Medical Leave</option>
            <option value="absence">Academic / Placement Absence</option>
          </select>
          <label for="requestFromDate">From Date</label>
          <input id="requestFromDate" name="fromDate" type="date" required />
          <label for="requestToDate">To Date</label>
          <input id="requestToDate" name="toDate" type="date" required />
          <label for="requestReason">Reason</label>
          <textarea id="requestReason" name="reason" required></textarea>
          <label for="requestAttachment">Supporting file name</label>
          <input id="requestAttachment" name="attachmentName" placeholder="medical_certificate.pdf" />
          <div class="button-row"><button class="primary-btn" type="submit">Submit Request</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Raise a Grievance", "Send academic, fees, hostel, library, or examination issues to the admin queue.")}
        <form id="studentGrievanceForm" class="field-block">
          <label for="grievanceCategory">Category</label>
          <select id="grievanceCategory" name="category">
            <option>Academic</option><option>Fees</option><option>Examination</option><option>Library</option><option>Hostel</option>
          </select>
          <label for="grievanceSubject">Subject</label>
          <input id="grievanceSubject" name="subject" required />
          <label for="grievanceMessage">Message</label>
          <textarea id="grievanceMessage" name="message" required></textarea>
          <label for="grievancePriority">Priority</label>
          <select id="grievancePriority" name="priority">
            <option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option>
          </select>
          <div class="button-row"><button class="secondary-btn" type="submit">Submit Grievance</button></div>
        </form>
      </article>
    </div>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Request History", "Track leave and absence requests without losing your current filter context.")}
        <div class="inline-list">
          ${data.requests.length ? data.requests.map((item) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(titleize(item.request_type))}</div>
                <span class="badge ${badgeClass(item.status)}">${escapeHtml(titleize(item.status))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${formatDate(item.from_date)} to ${formatDate(item.to_date)}`)}</div>
              <div class="list-meta">${escapeHtml(item.reason)}</div>
            </div>
          `).join("") : renderState("empty", "No requests filed", "You have not filed any leave or absence requests yet.")}
        </div>
      </article>
      <article class="panel">
        ${sectionHeader("Grievance History", "Review submitted grievances and their latest status.")}
        <div class="inline-list">
          ${data.grievances.length ? data.grievances.map((item) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(item.subject)}</div>
                <span class="badge ${badgeClass(item.status)}">${escapeHtml(titleize(item.status))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${item.category} - ${formatDate(item.created_at)}`)}</div>
              <div class="list-meta">${escapeHtml(item.message)}</div>
              ${item.resolution_note ? `<div class="chip-muted">Resolution: ${escapeHtml(item.resolution_note)}</div>` : ""}
            </div>
          `).join("") : renderState("empty", "No grievances filed", "You have not raised any grievances yet.")}
        </div>
      </article>
    </div>
  `;

  byId("profileSection").innerHTML = profilePanel(profile);

  renderLineChart("studentCgpaChart", "studentCgpa", data.results.summary.map((item) => `Sem ${item.semester}`), data.results.summary.map((item) => item.cgpa), "CGPA");
}

function sanitizeTeacherFilters(data) {
  const courseIds = data.courses.map((course) => course.id);
  if (!courseIds.includes(Number(state.filters.attendanceCourseId))) state.filters.attendanceCourseId = courseIds[0] || null;
  if (!courseIds.includes(Number(state.filters.marksCourseId))) state.filters.marksCourseId = courseIds[0] || null;
  if (!courseIds.includes(Number(state.filters.assignmentCourseId))) state.filters.assignmentCourseId = courseIds[0] || null;
}

function renderTeacher() {
  const data = state.dashboard;
  sanitizeTeacherFilters(data);
  const profile = data.profile;
  const attendanceCourse = data.courses.find((course) => course.id === Number(state.filters.attendanceCourseId)) || data.courses[0];
  const marksCourse = data.courses.find((course) => course.id === Number(state.filters.marksCourseId)) || data.courses[0];
  const assignmentCourse = data.courses.find((course) => course.id === Number(state.filters.assignmentCourseId)) || data.courses[0];
  const attendanceRoster = data.roster.filter((student) => student.section === attendanceCourse?.section);
  const marksRoster = data.roster.filter((student) => student.section === marksCourse?.section);
  const visibleHistory = data.attendanceHistory.filter((item) => !state.filters.teacherHistoryDate || item.session_date === state.filters.teacherHistoryDate);
  const todayName = new Date(state.filters.teacherDate).toLocaleDateString("en-IN", { weekday: "long" });
  const todaySlots = data.timetable.filter((slot) => slot.day_of_week === todayName);

  setIdentity(profile);
  setPageHeader(`${getGreeting()}, ${profile.name}`, `${profile.details.designation} - ${profile.details.specialization}`);

  byId("overviewSection").innerHTML = `
    <article class="panel masthead-panel">
      <div class="operational-head">
        <div>
          <div class="panel-kicker">Faculty Dashboard</div>
          <h2 class="section-title">Class operations for the day</h2>
          <p class="panel-subtitle">Mark attendance, publish marks, issue notices, and review the teaching schedule without losing your current class context.</p>
        </div>
        <div class="quick-actions">
          <button class="primary-btn" type="button" data-jump="operationsSection">Class Desk</button>
          <button class="secondary-btn" type="button" data-jump="rosterSection">Roster</button>
          <button class="ghost-btn" type="button" data-jump="timetableSection">Timetable</button>
        </div>
      </div>
      ${renderMetricStrip([
        { label: "Classes", value: data.kpis.classes, meta: "Assigned this term" },
        { label: "Students", value: data.kpis.students, meta: "Across all sections" },
        { label: "Average Attendance", value: `${data.kpis.avgAttendance}%`, meta: "Marked sessions" },
        { label: "Open Assignments", value: data.kpis.pendingAssignments, meta: "Currently active" },
      ])}
    </article>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Today's Teaching Schedule", formatLongDate(state.filters.teacherDate))}
        ${renderAgenda(todaySlots.map((slot) => ({ time: `${slot.start_time} - ${slot.end_time}`, course: slot.subject, room: `${slot.room} - Section ${slot.section}`, status: slot.status })), "No classes scheduled", "No classes are scheduled for the selected date.")}
      </article>
      <article class="panel">
        ${sectionHeader("Class Performance", "Average score by course from the marks already published.")}
        <div class="chart-wrap"><canvas id="teacherPerformanceChart"></canvas></div>
      </article>
    </div>
  `;

  byId("operationsSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Attendance Entry", "Stay on the selected section after saving and keep the date pinned between updates.")}
        <form id="teacherAttendanceForm" class="field-block">
          <label for="teacherAttendanceCourse">Course</label>
          <select id="teacherAttendanceCourse" name="courseId">
            ${data.courses.map((course) => `<option value="${course.id}" ${course.id === attendanceCourse?.id ? "selected" : ""}>${escapeHtml(`${course.code} - ${course.name} (Section ${course.section})`)}</option>`).join("")}
          </select>
          <label for="teacherAttendanceDate">Date</label>
          <input id="teacherAttendanceDate" name="date" type="date" value="${escapeHtml(state.filters.teacherDate)}" />
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Student</th><th>Roll No.</th><th>Status</th></tr></thead>
              <tbody>
                ${attendanceRoster.length ? attendanceRoster.map((student) => `
                  <tr>
                    <td>${escapeHtml(student.name)}</td>
                    <td>${escapeHtml(student.roll_no)}</td>
                    <td>
                      <select name="status-${student.id}">
                        <option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="medical_leave">Medical Leave</option>
                      </select>
                    </td>
                  </tr>
                `).join("") : renderTableEmpty(3, "No roster found", "No students are mapped to this class section yet.")}
              </tbody>
            </table>
          </div>
          <div class="button-row"><button class="primary-btn" type="submit">Save Attendance</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Marks Entry", "Use a separate course selector so attendance and marks work independently.")}
        <form id="teacherMarksForm" class="field-block">
          <label for="teacherMarksCourse">Course</label>
          <select id="teacherMarksCourse" name="courseId">
            ${data.courses.map((course) => `<option value="${course.id}" ${course.id === marksCourse?.id ? "selected" : ""}>${escapeHtml(`${course.code} - ${course.name} (Section ${course.section})`)}</option>`).join("")}
          </select>
          <label for="teacherExamType">Exam Type</label>
          <select id="teacherExamType" name="examType"><option>Internal Exam 1</option><option>Internal Exam 2</option><option>Mid-Term</option></select>
          <label for="teacherMaxScore">Maximum Score</label>
          <input id="teacherMaxScore" name="maxScore" type="number" value="50" />
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Student</th><th>Score</th><th>Remark</th></tr></thead>
              <tbody>
                ${marksRoster.length ? marksRoster.map((student) => `
                  <tr>
                    <td>${escapeHtml(student.name)}</td>
                    <td><input name="score-${student.id}" type="number" min="0" max="100" value="0" /></td>
                    <td><input name="remark-${student.id}" value="Reviewed" /></td>
                  </tr>
                `).join("") : renderTableEmpty(3, "No roster found", "No students are mapped to this class section yet.")}
              </tbody>
            </table>
          </div>
          <div class="button-row"><button class="secondary-btn" type="submit">Publish Marks</button></div>
        </form>
      </article>
    </div>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Assignment and Class Communication", "Create assignments and keep announcements tied to the current academic workflow.")}
        <form id="teacherAssignmentForm" class="field-block">
          <label for="assignmentCourse">Course</label>
          <select id="assignmentCourse" name="courseId">
            ${data.courses.map((course) => `<option value="${course.id}" ${course.id === assignmentCourse?.id ? "selected" : ""}>${escapeHtml(`${course.code} - ${course.name} (Section ${course.section})`)}</option>`).join("")}
          </select>
          <label for="assignmentTitle">Title</label>
          <input id="assignmentTitle" name="title" required />
          <label for="assignmentDescription">Description</label>
          <textarea id="assignmentDescription" name="description" required></textarea>
          <label for="assignmentDueDate">Due Date</label>
          <input id="assignmentDueDate" name="dueDate" type="date" required />
          <label for="assignmentMaxScore">Max Score</label>
          <input id="assignmentMaxScore" name="maxScore" type="number" value="20" required />
          <div class="button-row"><button class="primary-btn" type="submit">Publish Assignment</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Attendance Register", "Review recent submissions without leaving class operations.")}
        <div class="field-block compact">
          <label for="teacherHistoryDate">Filter by Date</label>
          <input id="teacherHistoryDate" type="date" value="${escapeHtml(state.filters.teacherHistoryDate || "")}" />
        </div>
        <div class="inline-list">
          ${visibleHistory.length ? visibleHistory.slice(0, 8).map((item) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(`${item.course_name} - Section ${item.section}`)}</div>
                <span class="badge badge-success">${escapeHtml(`${item.present_count || 0} present`)}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${formatDate(item.session_date)} - ${item.absent_count || 0} absent - ${item.late_count || 0} late`)}</div>
            </div>
          `).join("") : renderState("empty", "No attendance register", "No attendance entries match the current filter.")}
        </div>
      </article>
    </div>
  `;

  byId("rosterSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Student Roster", "Use contact actions when a student needs a reminder or follow-up from faculty.")}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Student</th><th>Section</th><th>CGPA</th><th>Attendance</th><th>Contact</th></tr></thead>
          <tbody>
            ${data.roster.map((student) => `
              <tr>
                <td>${escapeHtml(student.name)}<div class="table-meta">${escapeHtml(`${student.roll_no} - ${student.email}`)}</div></td>
                <td>${escapeHtml(student.section)}</td>
                <td>${escapeHtml(student.cgpa)}</td>
                <td><span class="badge ${student.risk === "at_risk" ? "badge-warning" : "badge-success"}">${escapeHtml(`${student.attendance}%`)}</span></td>
                <td><button class="secondary-btn" type="button" data-action="contact-student" data-student-id="${student.id}" data-student-name="${escapeHtml(student.name)}">Notify</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;

  byId("timetableSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Teaching Timetable", "Room changes and timetable updates stay tied to the selected slot instead of resetting the portal.")}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Course</th><th>Day</th><th>Time</th><th>Room</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${data.timetable.map((slot) => `
              <tr>
                <td>${escapeHtml(`${slot.subject} - Section ${slot.section}`)}</td>
                <td>${escapeHtml(slot.day_of_week)}</td>
                <td>${escapeHtml(`${slot.start_time} - ${slot.end_time}`)}</td>
                <td>${escapeHtml(slot.room)}</td>
                <td><span class="badge ${badgeClass(slot.status)}">${escapeHtml(titleize(slot.status))}</span></td>
                <td><button class="secondary-btn" type="button" data-action="update-slot" data-slot-id="${slot.id}" data-room="${escapeHtml(slot.room)}" data-status="${escapeHtml(slot.status)}">Update</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;

  byId("announcementsSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Faculty Announcement", "Publish section notices directly from the faculty portal.")}
        <form id="teacherNoticeForm" class="field-block">
          <label for="teacherNoticeTitle">Title</label>
          <input id="teacherNoticeTitle" name="title" required />
          <label for="teacherNoticeAudience">Audience</label>
          <select id="teacherNoticeAudience" name="audience"><option value="student">Students</option><option value="all">All Users</option></select>
          <label for="teacherNoticePriority">Priority</label>
          <select id="teacherNoticePriority" name="priority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <label for="teacherNoticeMessage">Message</label>
          <textarea id="teacherNoticeMessage" name="message" required></textarea>
          <div class="button-row"><button class="primary-btn" type="submit">Publish Notice</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Recent Notices", "Announcements already published from the faculty side.")}
        <div class="inline-list">
          ${data.announcements.length ? data.announcements.map((notice) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(notice.title)}</div>
                <span class="badge ${badgeClass(notice.priority)}">${escapeHtml(titleize(notice.priority))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${titleize(notice.audience)} - ${formatDate(notice.created_at)}`)}</div>
              <div class="list-meta">${escapeHtml(notice.message)}</div>
            </div>
          `).join("") : renderState("empty", "No notices yet", "No faculty announcements have been published yet.")}
        </div>
      </article>
    </div>
  `;

  byId("profileSection").innerHTML = profilePanel(profile);

  renderBarChart("teacherPerformanceChart", "teacherPerformance", data.chart.labels, data.chart.values, "Average score");
}

function renderAdmin() {
  const data = state.dashboard;
  const profile = data.profile;
  setIdentity(profile);
  setPageHeader("Administration", "Operational controls for users, academic records, notices, and institutional settings.");

  const teacherOptions = data.users.filter((user) => user.role === "teacher").map((teacher) => `<option value="${teacher.id}">${escapeHtml(`${teacher.name} - ${teacher.department || "-"}`)}</option>`).join("");
  const courseOptions = data.courses.map((course) => `<option value="${course.id}">${escapeHtml(`${course.code} - ${course.name} (Section ${course.section})`)}</option>`).join("");

  byId("overviewSection").innerHTML = `
    <article class="panel masthead-panel">
      <div class="operational-head">
        <div>
          <div class="panel-kicker">Admin Dashboard</div>
          <h2 class="section-title">Academic operations and service controls</h2>
          <p class="panel-subtitle">Manage users, courses, timetable changes, grievances, notices, and institution settings from a stable control console.</p>
        </div>
        <div class="quick-actions">
          <button class="primary-btn" type="button" data-jump="usersSection">Users</button>
          <button class="secondary-btn" type="button" data-jump="grievancesSection">Grievances</button>
          <button class="ghost-btn" type="button" data-jump="settingsSection">Settings</button>
        </div>
      </div>
      ${renderMetricStrip([
        { label: "Total Users", value: data.kpis.totalUsers, meta: `${data.kpis.students} students / ${data.kpis.teachers} teachers` },
        { label: "Departments", value: data.kpis.departments, meta: "Active departments" },
        { label: "Open Grievances", value: data.kpis.pendingGrievances, meta: "Pending resolution" },
        { label: "System Status", value: data.kpis.systemStatus, meta: data.settings.current_session || "Current session" },
      ])}
    </article>
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Department Snapshot", "Student counts by department from the current directory.")}
        <div class="chart-wrap"><canvas id="adminOverviewChart"></canvas></div>
      </article>
      <article class="panel">
        ${sectionHeader("Operations Watchlist", "High-priority items that need admin attention.")}
        <div class="inline-list">
          <div class="list-item"><div class="list-item-header"><div class="list-title">Open grievances</div><span class="badge badge-warning">${escapeHtml(data.reports.openGrievances)}</span></div><div class="list-meta">Resolve student issues without leaving the grievance queue.</div></div>
          <div class="list-item"><div class="list-item-header"><div class="list-title">Courses under review</div><span class="badge badge-info">${escapeHtml(data.reports.reviewCourses)}</span></div><div class="list-meta">Teacher assignment and course status updates remain visible here.</div></div>
          <div class="list-item"><div class="list-item-header"><div class="list-title">Active notices</div><span class="badge badge-success">${escapeHtml(data.reports.activeNotices)}</span></div><div class="list-meta">Current notices published to users across the portal.</div></div>
        </div>
      </article>
    </div>
  `;

  byId("usersSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Create User", "Add student, teacher, or admin accounts and keep them inside the same academic directory.")}
        <form id="createUserForm" class="field-block">
          <label for="newUserName">Full Name</label><input id="newUserName" name="name" required />
          <label for="newUserEmail">Email</label><input id="newUserEmail" name="email" type="email" required />
          <label for="newUserRole">Role</label>
          <select id="newUserRole" name="role"><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option></select>
          <label for="newUserDepartment">Department</label>
          <select id="newUserDepartment" name="department">${data.departments.map((department) => `<option value="${department.code}">${escapeHtml(department.name)}</option>`).join("")}</select>
          <label for="newUserPassword">Temporary Password</label><input id="newUserPassword" name="password" value="changeme123" />
          <div class="button-row"><button class="primary-btn" type="submit">Create User</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Departments", "Live student and faculty counts by department.")}
        <div class="inline-list">
          ${data.departments.map((department) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(department.name)}</div>
                <span class="badge ${department.active ? "badge-success" : "badge-info"}">${department.active ? "Active" : "Inactive"}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${department.code} - ${department.hod_name}`)}</div>
              <div class="list-meta">${escapeHtml(`${department.faculty_count} faculty / ${department.student_count} students`)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
    <article class="panel">
      ${sectionHeader("User Directory", "Suspend, restore, archive, or reset passwords without losing your place in the directory.")}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.users.map((user) => `
              <tr>
                <td>${escapeHtml(user.name)}<div class="table-meta">${escapeHtml(user.email)}</div></td>
                <td>${escapeHtml(titleize(user.role))}</td>
                <td>${escapeHtml(user.department || "-")}</td>
                <td><span class="badge ${badgeClass(user.status)}">${escapeHtml(titleize(user.status))}</span></td>
                <td>${escapeHtml(formatDateTime(user.last_login_at))}</td>
                <td class="button-row">
                  <button class="secondary-btn" type="button" data-action="reset-password" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}">Reset</button>
                  <button class="ghost-btn" type="button" data-action="toggle-status" data-user-id="${user.id}" data-current-status="${escapeHtml(user.status)}">${user.status === "active" ? "Suspend" : "Restore"}</button>
                  ${user.status === "archived" ? "" : `<button class="ghost-btn" type="button" data-action="archive-user" data-user-id="${user.id}">Archive</button>`}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;

  byId("coursesSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Course Assignment and Status", "Update teacher ownership and course state from one form.")}
        <form id="courseUpdateForm" class="field-block">
          <label for="courseToUpdate">Course</label><select id="courseToUpdate" name="courseId">${courseOptions}</select>
          <label for="teacherForCourse">Teacher</label><select id="teacherForCourse" name="teacherId">${teacherOptions}</select>
          <label for="courseStatusUpdate">Status</label>
          <select id="courseStatusUpdate" name="status"><option value="active">Active</option><option value="review">Review</option><option value="archived">Archived</option></select>
          <label for="courseUpdateNote">Note</label><textarea id="courseUpdateNote" name="note"></textarea>
          <div class="button-row"><button class="primary-btn" type="submit">Update Course</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Course Registry", "Ownership, credits, section, and current status for each course.")}
        <div class="inline-list">
          ${data.courses.map((course) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(`${course.code} - ${course.name}`)}</div>
                <span class="badge ${badgeClass(course.status)}">${escapeHtml(titleize(course.status))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${course.department} - Section ${course.section} - ${course.credits} credits`)}</div>
              <div class="list-meta">${escapeHtml(course.teacher_name)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;

  byId("timetableSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Timetable Slot", "Create or revise a slot without changing sections unexpectedly after save.")}
        <form id="timetableForm" class="field-block">
          <label for="slotCourse">Course</label><select id="slotCourse" name="courseId">${courseOptions}</select>
          <label for="slotDay">Day</label><select id="slotDay" name="dayOfWeek"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option></select>
          <label for="slotStart">Start Time</label><input id="slotStart" name="startTime" placeholder="09:00" />
          <label for="slotEnd">End Time</label><input id="slotEnd" name="endTime" placeholder="10:00" />
          <label for="slotRoom">Room</label><input id="slotRoom" name="room" />
          <label for="slotType">Type</label><input id="slotType" name="slotType" value="Lecture" />
          <label for="slotStatus">Status</label><select id="slotStatus" name="status"><option value="scheduled">Scheduled</option><option value="updated">Updated</option><option value="cancelled">Cancelled</option></select>
          <label for="slotNote">Note</label><textarea id="slotNote" name="note"></textarea>
          <div class="button-row"><button class="primary-btn" type="submit">Save Slot</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Current Timetable", "Existing slots remain editable from the same view.")}
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Course</th><th>Day</th><th>Time</th><th>Room</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${data.timetable.map((slot) => `
                <tr>
                  <td>${escapeHtml(`${slot.course_code} - ${slot.course_name} (Section ${slot.section})`)}</td>
                  <td>${escapeHtml(slot.day_of_week)}</td>
                  <td>${escapeHtml(`${slot.start_time} - ${slot.end_time}`)}</td>
                  <td>${escapeHtml(slot.room)}</td>
                  <td><span class="badge ${badgeClass(slot.status)}">${escapeHtml(titleize(slot.status))}</span></td>
                  <td><button class="secondary-btn" type="button" data-action="edit-admin-slot" data-slot-id="${slot.id}" data-course-id="${slot.course_id}" data-room="${escapeHtml(slot.room)}" data-status="${escapeHtml(slot.status)}" data-day="${escapeHtml(slot.day_of_week)}" data-start="${escapeHtml(slot.start_time)}" data-end="${escapeHtml(slot.end_time)}" data-type="${escapeHtml(slot.slot_type)}">Edit</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;

  byId("grievancesSection").innerHTML = `
    <article class="panel">
      ${sectionHeader("Grievance Queue", "Review open issues and resolve them without being pushed back to the dashboard overview.")}
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Submitted By</th><th>Category</th><th>Subject</th><th>Status</th><th>Priority</th><th>Action</th></tr></thead>
          <tbody>
            ${data.grievances.map((item) => `
              <tr>
                <td>${escapeHtml(item.submitted_by)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td>${escapeHtml(item.subject)}</td>
                <td><span class="badge ${badgeClass(item.status)}">${escapeHtml(titleize(item.status))}</span></td>
                <td><span class="badge ${badgeClass(item.priority)}">${escapeHtml(titleize(item.priority))}</span></td>
                <td>${item.status === "resolved" ? escapeHtml(item.resolution_note || "-") : `<button class="primary-btn" type="button" data-action="resolve-grievance" data-grievance-id="${item.id}" data-subject="${escapeHtml(item.subject)}">Resolve</button>`}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;

  byId("noticesSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("Publish Notice", "Post institution-wide updates or target students and teachers separately.")}
        <form id="adminNoticeForm" class="field-block">
          <label for="adminNoticeTitle">Title</label><input id="adminNoticeTitle" name="title" required />
          <label for="adminNoticeAudience">Audience</label><select id="adminNoticeAudience" name="audience"><option value="all">All Users</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
          <label for="adminNoticePriority">Priority</label><select id="adminNoticePriority" name="priority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <label for="adminNoticeMessage">Message</label><textarea id="adminNoticeMessage" name="message" required></textarea>
          <div class="button-row"><button class="primary-btn" type="submit">Publish Notice</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Notice Register", "Active and previously published notices from the admin side.")}
        <div class="inline-list">
          ${data.notices.map((notice) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(notice.title)}</div>
                <div class="button-row">
                  <span class="badge ${badgeClass(notice.priority)}">${escapeHtml(titleize(notice.priority))}</span>
                  ${notice.active ? `<button class="ghost-btn" type="button" data-action="unpublish-notice" data-notice-id="${notice.id}">Unpublish</button>` : ""}
                </div>
              </div>
              <div class="list-meta">${escapeHtml(`${titleize(notice.audience)} - ${notice.published_by} - ${formatDate(notice.created_at)}`)}</div>
              <div class="list-meta">${escapeHtml(notice.message)}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;

  byId("settingsSection").innerHTML = `
    <div class="two-up">
      <article class="panel">
        ${sectionHeader("System Settings", "Portal availability, attendance threshold, and current academic session controls.")}
        <form id="settingsForm" class="field-block">
          <label for="siteName">Institution Name</label><input id="siteName" name="site_name" value="${escapeHtml(data.settings.site_name || "EduWorkflow")}" />
          <label for="currentSession">Current Session</label><input id="currentSession" name="current_session" value="${escapeHtml(data.settings.current_session || "2025-2026")}" />
          <label for="attendanceThreshold">Attendance Threshold</label><input id="attendanceThreshold" name="attendance_threshold" type="number" value="${escapeHtml(data.settings.attendance_threshold || 75)}" />
          <label><input type="checkbox" name="student_portal_enabled" ${data.settings.student_portal_enabled === "1" ? "checked" : ""} /> Student portal enabled</label>
          <label><input type="checkbox" name="teacher_portal_enabled" ${data.settings.teacher_portal_enabled === "1" ? "checked" : ""} /> Teacher portal enabled</label>
          <label><input type="checkbox" name="grievance_module_active" ${data.settings.grievance_module_active === "1" ? "checked" : ""} /> Grievance module enabled</label>
          <label><input type="checkbox" name="maintenance_mode" ${data.settings.maintenance_mode === "1" ? "checked" : ""} /> Maintenance mode</label>
          <div class="button-row"><button class="primary-btn" type="submit">Save Settings</button></div>
        </form>
      </article>
      <article class="panel">
        ${sectionHeader("Audit Trail", "Recent changes across users, timetable, notices, and settings.")}
        <div class="inline-list">
          ${data.auditLogs.map((entry) => `
            <div class="list-item">
              <div class="list-item-header">
                <div class="list-title">${escapeHtml(entry.actor_name)}</div>
                <span class="badge badge-info">${escapeHtml(formatDateTime(entry.created_at))}</span>
              </div>
              <div class="list-meta">${escapeHtml(`${entry.action} - ${entry.entity_type}${entry.entity_id ? ` #${entry.entity_id}` : ""}`)}</div>
              <div class="list-meta">${escapeHtml(entry.details || "-")}</div>
            </div>
          `).join("")}
        </div>
      </article>
    </div>
  `;

  byId("profileSection").innerHTML = profilePanel(profile);
  renderBarChart("adminOverviewChart", "adminOverview", data.chart.map((item) => item.code), data.chart.map((item) => item.students), "Students");
}

function renderCurrentRole() {
  if (state.role === "student") renderStudent();
  else if (state.role === "teacher") renderTeacher();
  else renderAdmin();
  restoreSectionState();
  persistUiState();
}

function setLoadingSections() {
  qsa(".view-section").forEach((section) => {
    if (!section.innerHTML.trim()) {
      section.innerHTML = renderState("loading", "Loading portal data", "Please wait while the latest records are prepared.");
    }
  });
}

async function loadDashboard() {
  if (state.ui.loading) return;
  state.ui.loading = true;
  const refreshBtn = byId("refreshBtn");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing";
  }
  if (!state.ui.bootstrapped) {
    setLoadingSections();
  }
  try {
    if (state.role === "student") {
      const [dashboard, attendanceDetail] = await Promise.all([
        window.Api.studentDashboard({
          attendanceSemester: state.filters.attendanceSemester,
          resultsSemester: state.filters.resultsSemester,
          subject: state.filters.attendanceSubject,
          attendanceView: state.filters.attendanceView,
          timetableView: state.filters.timetableView,
          date: state.filters.timetableDate,
        }),
        window.Api.studentAttendance({
          semester: state.filters.attendanceSemester,
          subject: state.filters.attendanceSubject,
          month: state.filters.attendanceMonth,
          date: state.filters.attendanceDate,
        }),
      ]);
      state.dashboard = { ...dashboard, attendanceDetail };
    } else if (state.role === "teacher") {
      const [dashboard, attendanceHistory] = await Promise.all([
        window.Api.teacherDashboard(),
        window.Api.teacherAttendance({}),
      ]);
      state.dashboard = { ...dashboard, attendanceHistory };
    } else {
      state.dashboard = await window.Api.adminDashboard();
    }
    state.ui.bootstrapped = true;
    renderCurrentRole();
  } catch (error) {
    qsa(".view-section").forEach((section) => {
      section.innerHTML = renderState("error", "Unable to load portal", error.message);
    });
    showToast(error.message, "error");
    if (error.message.includes("maintenance") && state.role !== "admin") {
      setPageHeader("Portal temporarily unavailable", "Maintenance mode is active. Admin access remains available.");
    }
  } finally {
    state.ui.loading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh";
    }
  }
}

function initNavigation() {
  qsa(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSection(button.dataset.target);
    });
  });
}

function getFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();

  try {
    if (form.id === "profileForm") {
      await window.Api.updateProfile(getFormValues(form));
      showToast("Profile updated", "success");
    } else if (form.id === "passwordForm") {
      await window.Api.changePassword(getFormValues(form));
      form.reset();
      showToast("Password updated", "success");
    } else if (form.id === "studentAttendanceFilters") {
      const values = getFormValues(form);
      state.filters.attendanceSemester = Number(values.attendanceSemester);
      state.filters.attendanceSubject = values.attendanceSubject || "";
      state.filters.attendanceMonth = values.attendanceMonth || "";
      state.filters.attendanceDate = values.attendanceDate || "";
      state.filters.attendanceView = values.attendanceView;
      persistUiState();
      await loadDashboard();
      return;
    } else if (form.id === "studentTimetableFilters") {
      const values = getFormValues(form);
      state.filters.timetableDate = values.timetableDate;
      state.filters.timetableView = values.timetableView;
      persistUiState();
      await loadDashboard();
      return;
    } else if (form.id === "studentResultsFilters") {
      state.filters.resultsSemester = Number(getFormValues(form).resultsSemester);
      persistUiState();
      await loadDashboard();
      return;
    } else if (form.id === "leaveRequestForm") {
      await window.Api.submitStudentRequest(getFormValues(form));
      form.reset();
      showToast("Request submitted", "success");
    } else if (form.id === "studentGrievanceForm") {
      await window.Api.submitGrievance(getFormValues(form));
      form.reset();
      showToast("Grievance submitted", "success");
    } else if (form.id === "teacherAttendanceForm") {
      const values = getFormValues(form);
      const courseId = Number(values.courseId);
      const course = state.dashboard.courses.find((item) => item.id === courseId);
      const roster = state.dashboard.roster.filter((student) => student.section === course.section);
      await window.Api.submitTeacherAttendance({
        courseId,
        date: values.date,
        records: roster.map((student) => ({ studentId: student.id, status: values[`status-${student.id}`] })),
      });
      state.filters.attendanceCourseId = courseId;
      state.filters.teacherDate = values.date;
      showToast("Attendance saved", "success");
    } else if (form.id === "teacherMarksForm") {
      const values = getFormValues(form);
      const courseId = Number(values.courseId);
      const course = state.dashboard.courses.find((item) => item.id === courseId);
      const roster = state.dashboard.roster.filter((student) => student.section === course.section);
      await window.Api.submitTeacherMarks({
        courseId,
        examType: values.examType,
        maxScore: Number(values.maxScore),
        records: roster.map((student) => ({
          studentId: student.id,
          score: Number(values[`score-${student.id}`] || 0),
          remark: values[`remark-${student.id}`] || "",
        })),
      });
      state.filters.marksCourseId = courseId;
      showToast("Marks published", "success");
    } else if (form.id === "teacherAssignmentForm") {
      await window.Api.createTeacherAssignment(getFormValues(form));
      form.reset();
      showToast("Assignment published", "success");
    } else if (form.id === "teacherNoticeForm") {
      await window.Api.createTeacherNotice(getFormValues(form));
      form.reset();
      showToast("Notice published", "success");
    } else if (form.id === "createUserForm") {
      await window.Api.createUser(getFormValues(form));
      form.reset();
      showToast("User created", "success");
    } else if (form.id === "courseUpdateForm") {
      const values = getFormValues(form);
      await window.Api.updateCourse(Number(values.courseId), values);
      showToast("Course updated", "success");
    } else if (form.id === "timetableForm") {
      await window.Api.saveTimetable(getFormValues(form));
      form.reset();
      showToast("Timetable slot saved", "success");
    } else if (form.id === "adminNoticeForm") {
      await window.Api.publishNotice(getFormValues(form));
      form.reset();
      showToast("Notice published", "success");
    } else if (form.id === "settingsForm") {
      const values = getFormValues(form);
      ["student_portal_enabled", "teacher_portal_enabled", "grievance_module_active", "maintenance_mode"].forEach((key) => {
        values[key] = form.elements[key].checked ? "1" : "0";
      });
      await window.Api.updateSettings(values);
      showToast("Settings saved", "success");
    }
    persistUiState();
    await loadDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function onClick(event) {
  const button = event.target.closest("[data-action], [data-jump]");
  if (!button) return;
  if (button.dataset.jump) {
    setActiveSection(button.dataset.jump);
    return;
  }

  try {
    if (button.dataset.action === "reset-student-attendance") {
      state.filters.attendanceSubject = "";
      state.filters.attendanceMonth = localMonthValue();
      state.filters.attendanceDate = "";
      state.filters.attendanceView = "overall";
      persistUiState();
      await loadDashboard();
      return;
    }
    if (button.dataset.action === "pay-fee") {
      await window.Api.payFees([Number(button.dataset.feeId)]);
      showToast("Fee payment recorded", "success");
    } else if (button.dataset.action === "pay-all-fees") {
      const feeIds = state.dashboard.fees.items.filter((item) => item.status === "pending" || item.status === "overdue").map((item) => item.id);
      if (!feeIds.length) {
        showToast("No pending fee items", "info");
        return;
      }
      await window.Api.payFees(feeIds);
      showToast("Pending fees paid", "success");
    } else if (button.dataset.action === "apply-placement") {
      await window.Api.applyPlacement(Number(button.dataset.placementId));
      showToast("Placement application submitted", "success");
    } else if (button.dataset.action === "renew-loan") {
      await window.Api.renewLibraryLoan(Number(button.dataset.loanId));
      showToast("Renewal request sent", "success");
    } else if (button.dataset.action === "contact-student") {
      openModal({
        title: `Notify ${button.dataset.studentName}`,
        body: `
          <div class="field-block">
            <label for="contactTitle">Title</label>
            <input id="contactTitle" value="Faculty Update" />
            <label for="contactMessage">Message</label>
            <textarea id="contactMessage">Please review your current attendance trend and meet during office hours if support is required.</textarea>
          </div>
        `,
        confirmLabel: "Send Notification",
        onConfirm: async (_modal, close) => {
          await window.Api.notifyStudent({ studentId: Number(button.dataset.studentId), title: byId("contactTitle").value, message: byId("contactMessage").value });
          close();
          showToast("Student notified", "success");
          await loadDashboard();
        },
      });
      return;
    } else if (button.dataset.action === "update-slot") {
      openModal({
        title: "Update Timetable Slot",
        body: `
          <div class="field-block">
            <label for="slotRoomUpdate">Room</label><input id="slotRoomUpdate" value="${escapeHtml(button.dataset.room)}" />
            <label for="slotStatusUpdate">Status</label>
            <select id="slotStatusUpdate"><option value="scheduled">Scheduled</option><option value="updated">Updated</option><option value="cancelled">Cancelled</option></select>
            <label for="slotNoteUpdate">Note</label><textarea id="slotNoteUpdate">Updated from faculty portal.</textarea>
          </div>
        `,
        confirmLabel: "Save Update",
        onConfirm: async (_modal, close) => {
          await window.Api.updateTeacherSlot(Number(button.dataset.slotId), {
            room: byId("slotRoomUpdate").value,
            status: byId("slotStatusUpdate").value,
            note: byId("slotNoteUpdate").value,
          });
          close();
          showToast("Timetable updated", "success");
          await loadDashboard();
        },
      });
      byId("slotStatusUpdate").value = button.dataset.status;
      return;
    } else if (button.dataset.action === "reset-password") {
      openModal({
        title: `Reset password for ${button.dataset.userName}`,
        body: `<div class="field-block"><label for="adminResetPassword">New Temporary Password</label><input id="adminResetPassword" value="temp1234" /></div>`,
        confirmLabel: "Reset Password",
        onConfirm: async (_modal, close) => {
          await window.Api.resetUserPassword(Number(button.dataset.userId), byId("adminResetPassword").value);
          close();
          showToast("Password reset complete", "success");
          await loadDashboard();
        },
      });
      return;
    } else if (button.dataset.action === "toggle-status") {
      const nextStatus = button.dataset.currentStatus === "active" ? "suspended" : "active";
      await window.Api.updateUserStatus(Number(button.dataset.userId), nextStatus);
      showToast(`User ${nextStatus}`, "success");
    } else if (button.dataset.action === "archive-user") {
      await window.Api.updateUserStatus(Number(button.dataset.userId), "archived");
      showToast("User archived", "warning");
    } else if (button.dataset.action === "edit-admin-slot") {
      openModal({
        title: "Edit Timetable Slot",
        body: `
          <div class="field-block">
            <label for="adminSlotRoom">Room</label><input id="adminSlotRoom" value="${escapeHtml(button.dataset.room)}" />
            <label for="adminSlotStatus">Status</label>
            <select id="adminSlotStatus"><option value="scheduled">Scheduled</option><option value="updated">Updated</option><option value="cancelled">Cancelled</option></select>
            <label for="adminSlotNote">Note</label><textarea id="adminSlotNote">Updated from admin console.</textarea>
          </div>
        `,
        confirmLabel: "Save Slot",
        onConfirm: async (_modal, close) => {
          await window.Api.saveTimetable({
            courseId: Number(button.dataset.courseId),
            dayOfWeek: button.dataset.day,
            startTime: button.dataset.start,
            endTime: button.dataset.end,
            room: byId("adminSlotRoom").value,
            slotType: button.dataset.type,
            status: byId("adminSlotStatus").value,
            note: byId("adminSlotNote").value,
          }, Number(button.dataset.slotId));
          close();
          showToast("Timetable slot updated", "success");
          await loadDashboard();
        },
      });
      byId("adminSlotStatus").value = button.dataset.status;
      return;
    } else if (button.dataset.action === "resolve-grievance") {
      openModal({
        title: `Resolve grievance: ${button.dataset.subject}`,
        body: `<div class="field-block"><label for="resolutionNote">Resolution Note</label><textarea id="resolutionNote">Issue reviewed and resolved.</textarea></div>`,
        confirmLabel: "Resolve",
        onConfirm: async (_modal, close) => {
          await window.Api.resolveGrievance(Number(button.dataset.grievanceId), byId("resolutionNote").value);
          close();
          showToast("Grievance resolved", "success");
          await loadDashboard();
        },
      });
      return;
    } else if (button.dataset.action === "unpublish-notice") {
      await window.Api.unpublishNotice(Number(button.dataset.noticeId));
      showToast("Notice unpublished", "warning");
    }
    await loadDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindSharedEvents() {
  byId("logoutBtn").addEventListener("click", logout);
  byId("refreshBtn").addEventListener("click", loadDashboard);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onClick);

  const menuToggleBtn = byId("menuToggleBtn");
  const sidebarScrim = byId("sidebarScrim");
  if (menuToggleBtn) menuToggleBtn.addEventListener("click", () => toggleNav());
  if (sidebarScrim) sidebarScrim.addEventListener("click", () => toggleNav(false));

  document.addEventListener("change", (event) => {
    if (event.target.id === "teacherAttendanceCourse") {
      state.filters.attendanceCourseId = Number(event.target.value);
      persistUiState();
      renderTeacher();
    }
    if (event.target.id === "teacherMarksCourse") {
      state.filters.marksCourseId = Number(event.target.value);
      persistUiState();
      renderTeacher();
    }
    if (event.target.id === "assignmentCourse") {
      state.filters.assignmentCourseId = Number(event.target.value);
      persistUiState();
    }
    if (event.target.id === "teacherHistoryDate") {
      state.filters.teacherHistoryDate = event.target.value;
      persistUiState();
      renderTeacher();
    }
  });
}

function boot() {
  if (!protectPage()) return;
  initNavigation();
  bindSharedEvents();
  startClock();
  restoreSectionState();
  loadDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
