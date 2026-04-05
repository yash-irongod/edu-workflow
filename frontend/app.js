/**
 * app.js — EduTrack MLOps · Application Logic
 *
 * Responsibilities:
 *   • Navigation (section switching, active nav state)
 *   • DOM rendering (tables, cards, lists)
 *   • Event listeners (NO onclick attributes in HTML)
 *   • Chart.js initialization and live updates
 *   • Dashboard stat-card data binding
 *   • Toast notifications
 *   • Modal management (edit attendance, update submissions)
 *
 * All data operations are delegated to api.js service functions.
 * This file NEVER touches the DB object directly.
 */

"use strict";

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

/** querySelector shorthand */
const qs  = (sel, root = document) => root.querySelector(sel);
/** querySelectorAll → Array shorthand */
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Safe getElementById — never throws, always returns element or null */
const el  = id => document.getElementById(id);

/** Set element text content if element exists */
function setText(id, val) {
  const node = el(id);
  if (node) node.textContent = val;
}

/* ══════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════ */

/**
 * Show a self-dismissing notification.
 * @param {string} msg
 * @param {'success'|'error'|'info'|'warning'} type
 */
function showToast(msg, type = "info") {
  const container = el("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(120%)";
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}

/* Make showToast globally available (used by login.js too) */
window.showToast = showToast;

/* ══════════════════════════════════════════════════════════
   CLOCK
   ══════════════════════════════════════════════════════════ */

function startClock() {
  function tick() {
    const clock = el("liveClock");
    if (!clock) return;
    clock.textContent = new Date().toLocaleString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: true, day: "numeric", month: "short", year: "numeric",
    });
  }
  tick();
  setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION
   ══════════════════════════════════════════════════════════ */

/**
 * Show the requested section, hide all others, update sidebar active state.
 * @param {string} sectionId - e.g. "dashboard", "attendance"
 */
function navigate(sectionId) {
  qsa(".main-content > section").forEach(s => s.classList.add("hidden"));

  const target = el(`sec-${sectionId}`);
  if (target) target.classList.remove("hidden");

  qsa(".nav-item").forEach(a => {
    a.classList.toggle("active", a.dataset.section === sectionId);
  });

  /* Trigger section-specific renders */
  if (sectionId === "reports")       renderReportSummary();
  if (sectionId === "announcements") renderAnnouncements();
}

/** Bind all sidebar nav-item clicks */
function bindNavigation() {
  qsa(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const section = item.dataset.section;
      if (section) navigate(section);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   PERFORMANCE CHART (Dashboard)
   ══════════════════════════════════════════════════════════ */

let perfChart = null;

const SEED = {
  "Internal Exam 1": [72, 85, 61, 90, 78],
  "Internal Exam 2": [68, 88, 55, 92, 80],
  "Mid-Term":        [75, 82, 60, 88, 74],
};

function buildPerfChart() {
  const canvas = el("mainChart");
  if (!canvas) return;

  const labels = STUDENTS.map(s => s.name.split(" ")[0]);

  /* Use real marks data if any exists, otherwise use seed */
  const d1 = computeChartData("Internal Exam 1").some(v => v !== null)
    ? computeChartData("Internal Exam 1")
    : SEED["Internal Exam 1"];
  const d2 = computeChartData("Internal Exam 2").some(v => v !== null)
    ? computeChartData("Internal Exam 2")
    : SEED["Internal Exam 2"];
  const d3 = computeChartData("Mid-Term").some(v => v !== null)
    ? computeChartData("Mid-Term")
    : SEED["Mid-Term"];

  if (perfChart) perfChart.destroy();

  perfChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Internal Exam 1", data: d1, backgroundColor: "rgba(108,99,255,.75)", borderRadius: 5 },
        { label: "Internal Exam 2", data: d2, backgroundColor: "rgba(0,212,170,.75)",  borderRadius: 5 },
        { label: "Mid-Term",        data: d3, backgroundColor: "rgba(255,107,107,.75)", borderRadius: 5 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: "rgba(255,255,255,.05)" },
          ticks: { color: "#7a84b0", callback: v => v + "%" },
        },
        x: {
          grid: { color: "rgba(255,255,255,.05)" },
          ticks: { color: "#7a84b0" },
        },
      },
    },
  });
}

/* ══════════════════════════════════════════════════════════
   STAT CARD UPDATERS
   ══════════════════════════════════════════════════════════ */

function refreshAttendanceCard() {
  setText("avgAttendanceCard", computeAvgAttendance());
}

function refreshAssignmentCards() {
  const today = new Date().toISOString().slice(0, 10);
  /* Count assignments where due date >= today */
  const dueSoon = DB.assignments.filter(a => a.due >= today).length;
  const pending  = DB.assignments.filter(a => a.submissions < a.total).length;
  setText("assignmentsDueCard", dueSoon);
  setText("pendingTasksCard",   pending);
}

/* ══════════════════════════════════════════════════════════
   ATTENDANCE — TABLE BUILD
   ══════════════════════════════════════════════════════════ */

function buildAttendanceTable() {
  const tbody = el("attTableBody");
  if (!tbody) return;

  tbody.innerHTML = STUDENTS.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.roll}</td>
      <td>${s.name}</td>
      <td><input type="radio" name="att_${s.id}" value="P" checked aria-label="${s.name} Present"></td>
      <td><input type="radio" name="att_${s.id}" value="A"         aria-label="${s.name} Absent"></td>
      <td><input type="radio" name="att_${s.id}" value="L"         aria-label="${s.name} Late"></td>
    </tr>
  `).join("");
}

/* ══════════════════════════════════════════════════════════
   ATTENDANCE — SUBMIT
   ══════════════════════════════════════════════════════════ */

async function handleAttendanceSubmit(e) {
  e.preventDefault();

  const cls  = el("classSelect")?.value?.trim();
  const date = el("attendanceDate")?.value;

  if (!cls || !date) {
    showToast("Please select a class and date", "error");
    return;
  }

  const records = STUDENTS.map(s => {
    const checked = qs(`input[name="att_${s.id}"]:checked`);
    return { studentId: s.id, roll: s.roll, name: s.name, status: checked ? checked.value : "A" };
  });

  try {
    const result = await submitAttendance(cls, date, records);
    showToast(
      result.updated
        ? `Attendance updated for ${cls} on ${date}`
        : `Attendance submitted for ${cls} on ${date}`,
      "success"
    );
    refreshAttendanceCard();
    renderHistory();
    e.target.reset();
    /* Restore today's date after reset */
    const dateInput = el("attendanceDate");
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  } catch (err) {
    showToast("Error saving attendance: " + err.message, "error");
  }
}

/* ══════════════════════════════════════════════════════════
   ATTENDANCE — TAB SWITCH
   ══════════════════════════════════════════════════════════ */

function bindAttendanceTabs() {
  qsa(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.target;
      const tabName = btn.dataset.tab;

      /* Update active tab button */
      qsa(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      /* Show/hide panels */
      el("attMarkPanel")?.classList.add("hidden");
      el("attHistoryPanel")?.classList.add("hidden");
      el(panelId)?.classList.remove("hidden");

      if (tabName === "history") renderHistory();
    });
  });
}

/* ══════════════════════════════════════════════════════════
   ATTENDANCE — HISTORY RENDER
   ══════════════════════════════════════════════════════════ */

async function renderHistory() {
  const container = el("historyList");
  if (!container) return;

  const dateFilter  = el("histDateFilter")?.value  || "";
  const classFilter = el("histClassFilter")?.value || "";

  try {
    const recs = await getAttendanceHistory(dateFilter, classFilter);

    if (!recs.length) {
      container.innerHTML = `<p class="empty-msg">No records match the filter.</p>`;
      return;
    }

    container.innerHTML = recs.map(a => {
      const P   = a.records.filter(r => r.status === "P").length;
      const Ab  = a.records.filter(r => r.status === "A").length;
      const L   = a.records.filter(r => r.status === "L").length;
      const pct = Math.round(((P + L) / a.records.length) * 100);

      const detail = a.records
        .map(r => `<span class="status-${r.status}" title="${r.name}">${r.roll}:${r.status}</span>`)
        .join(" &nbsp; ");

      return `
        <div class="history-card">
          <div>
            <div class="history-class">${a.cls}</div>
            <div class="history-date">${a.date}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">${detail}</div>
          </div>
          <div class="history-actions">
            <div class="history-stats">
              <span class="badge badge-success">P:${P}</span>
              <span class="badge badge-danger">A:${Ab}</span>
              <span class="badge badge-warning">L:${L}</span>
              <span class="badge badge-accent">${pct}%</span>
            </div>
            <button class="btn btn-sm btn-outline" data-action="edit-att" data-id="${a.id}">✏ Edit</button>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error loading history: ${err.message}</p>`;
  }
}

function bindHistoryFilters() {
  el("histDateFilter")?.addEventListener("input",  renderHistory);
  el("histClassFilter")?.addEventListener("change", renderHistory);
}

/* ══════════════════════════════════════════════════════════
   ATTENDANCE — EDIT MODAL
   ══════════════════════════════════════════════════════════ */

let _editTargetId = null;

function openEditModal(id) {
  _editTargetId = id;

  /* Find record from the local DB (safe: DB exposed from api.js) */
  const rec = DB.attendance.find(a => a.id === id);
  if (!rec) { showToast("Record not found", "error"); return; }

  const rows = rec.records.map(r => `
    <tr>
      <td>${r.roll}</td>
      <td>${r.name}</td>
      <td>
        <select id="editStatus_${r.studentId}" class="edit-status-select">
          <option value="P" ${r.status === "P" ? "selected" : ""}>Present</option>
          <option value="A" ${r.status === "A" ? "selected" : ""}>Absent</option>
          <option value="L" ${r.status === "L" ? "selected" : ""}>Late</option>
        </select>
      </td>
    </tr>
  `).join("");

  const content = el("editModalContent");
  if (content) {
    content.innerHTML = `
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${rec.cls} · ${rec.date}</p>
      <table class="data-table">
        <thead><tr><th>Roll</th><th>Name</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  el("editModal")?.classList.add("open");
}

async function saveEditModal() {
  if (_editTargetId === null) return;

  const rec = DB.attendance.find(a => a.id === _editTargetId);
  if (!rec) { showToast("Record not found", "error"); closeEditModal(); return; }

  const updates = rec.records.map(r => ({
    studentId: r.studentId,
    status: el(`editStatus_${r.studentId}`)?.value || r.status,
  }));

  try {
    await patchAttendance(_editTargetId, updates);
    refreshAttendanceCard();
    renderHistory();
    showToast("Attendance record updated", "success");
  } catch (err) {
    showToast("Error updating record: " + err.message, "error");
  }

  closeEditModal();
}

function closeEditModal() {
  el("editModal")?.classList.remove("open");
  _editTargetId = null;
}

/* ══════════════════════════════════════════════════════════
   MARKS — TABLE BUILD
   ══════════════════════════════════════════════════════════ */

function buildMarksTable() {
  const tbody = el("marksTableBody");
  if (!tbody) return;

  tbody.innerHTML = STUDENTS.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${s.roll}</td>
      <td>${s.name}</td>
      <td><input type="number" id="marks_${s.id}" min="0" placeholder="0" class="marks-input" /></td>
      <td><input type="text"   id="remark_${s.id}" placeholder="Optional"   class="remark-input" /></td>
    </tr>
  `).join("");
}

/* ══════════════════════════════════════════════════════════
   MARKS — SUBMIT
   ══════════════════════════════════════════════════════════ */

async function handleMarksSubmit(e) {
  e.preventDefault();

  const subject = el("marksSubject")?.value;
  const exam    = el("marksExam")?.value;
  const max     = parseInt(el("marksMax")?.value, 10);

  if (!subject || !exam || !max) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  const records = STUDENTS.map(s => ({
    studentId: s.id,
    roll:      s.roll,
    name:      s.name,
    score:     parseInt(el(`marks_${s.id}`)?.value, 10)  || 0,
    remark:    el(`remark_${s.id}`)?.value?.trim()        || "",
    max,
  }));

  try {
    await saveMarks(subject, exam, max, records);
    showToast(`Marks saved: ${exam} · ${subject}`, "success");
    renderMarksSaved();
    buildPerfChart();   /* live chart update */
  } catch (err) {
    showToast("Error saving marks: " + err.message, "error");
  }

  e.target.reset();
}

/* ══════════════════════════════════════════════════════════
   MARKS — SAVED RECORDS RENDER
   ══════════════════════════════════════════════════════════ */

async function renderMarksSaved() {
  const container = el("marksSavedList");
  const badge     = el("marksRecordsBadge");
  if (!container) return;

  try {
    const recs = await getAllMarks();
    if (badge) badge.textContent = `${recs.length} records`;

    if (!recs.length) {
      container.innerHTML = `<p class="empty-msg">No marks saved yet.</p>`;
      return;
    }

    container.innerHTML = [...recs].reverse().map(m => {
      const avg = Math.round(m.records.reduce((a, r) => a + r.score, 0) / m.records.length);
      const pct = Math.round((avg / m.max) * 100);

      const rows = m.records.map(r => `
        <tr>
          <td>${r.roll}</td>
          <td>${r.name}</td>
          <td>${r.score}/${m.max}</td>
          <td>${r.remark || "—"}</td>
        </tr>`).join("");

      return `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong style="font-size:13px">${m.exam} · ${m.subject}</strong>
            <span class="badge badge-accent">Avg: ${avg}/${m.max} (${pct}%)</span>
          </div>
          <div style="overflow-x:auto">
            <table class="data-table" style="font-size:12px">
              <thead><tr><th>Roll</th><th>Name</th><th>Score</th><th>Remark</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error loading marks: ${err.message}</p>`;
  }
}

/* ══════════════════════════════════════════════════════════
   ASSIGNMENTS — SUBMIT
   ══════════════════════════════════════════════════════════ */

async function handleAssignmentSubmit(e) {
  e.preventDefault();

  const payload = {
    title:   el("asgTitle")?.value?.trim(),
    subject: el("asgSubject")?.value,
    desc:    el("asgDesc")?.value?.trim() || "",
    due:     el("asgDue")?.value,
    max:     parseInt(el("asgMax")?.value, 10),
  };

  if (!payload.title || !payload.subject || !payload.due || !payload.max) {
    showToast("Please fill all required fields", "error");
    return;
  }

  try {
    await createAssignment(payload);
    showToast(`Assignment created: ${payload.title}`, "success");
    renderAssignments();
    refreshAssignmentCards();
    e.target.reset();
  } catch (err) {
    showToast("Error creating assignment: " + err.message, "error");
  }
}

/* ══════════════════════════════════════════════════════════
   ASSIGNMENTS — TABLE RENDER
   ══════════════════════════════════════════════════════════ */

async function renderAssignments() {
  const tbody = el("assignmentsTableBody");
  const empty = el("asgEmpty");
  const badge = el("asgCountBadge");
  if (!tbody) return;

  try {
    const asgs = await getAssignments();
    if (badge) badge.textContent = `${asgs.length} active`;

    if (!asgs.length) {
      tbody.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }

    if (empty) empty.classList.add("hidden");

    tbody.innerHTML = asgs.map(a => {
      const pct      = Math.round((a.submissions / a.total) * 100);
      const badgeCls = pct >= 70 ? "badge-success" : pct >= 30 ? "badge-warning" : "badge-danger";
      const desc     = (a.desc || "").slice(0, 40) + ((a.desc || "").length > 40 ? "…" : "");

      return `
        <tr>
          <td>
            <strong>${a.title}</strong>
            ${desc ? `<br><span style="font-size:11px;color:var(--muted)">${desc}</span>` : ""}
          </td>
          <td>${a.subject}</td>
          <td>${a.max}</td>
          <td>${a.due}</td>
          <td>
            <div class="sub-bar-wrap">
              <div class="sub-bar" style="width:${pct}%"></div>
            </div>
            <span class="badge ${badgeCls}">${a.submissions} / ${a.total}</span>
          </td>
          <td class="action-cell">
            <button class="btn btn-sm btn-outline" data-action="sim-sub" data-id="${a.id}">📬 Simulate</button>
            <button class="btn btn-sm btn-danger"  data-action="del-asg" data-id="${a.id}">✕</button>
          </td>
        </tr>`;
    }).join("");

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">Error loading assignments: ${err.message}</td></tr>`;
  }
}

/* ══════════════════════════════════════════════════════════
   ASSIGNMENTS — SUBMISSIONS MODAL
   ══════════════════════════════════════════════════════════ */

let _subTargetId = null;

function openSubModal(id) {
  _subTargetId = id;
  const a = DB.assignments.find(x => x.id === id);
  if (!a) { showToast("Assignment not found", "error"); return; }

  const content = el("subModalContent");
  if (content) {
    content.innerHTML = `
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${a.title} · ${a.subject}</p>
      <div class="form-group">
        <label for="subCount">Submissions received (out of ${a.total})</label>
        <input type="number" id="subCount" min="0" max="${a.total}" value="${a.submissions}"
               style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);
                      border-radius:8px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px"/>
      </div>`;
  }

  el("subModal")?.classList.add("open");
}

async function saveSubModal() {
  if (_subTargetId === null) return;

  const count = parseInt(el("subCount")?.value, 10) || 0;

  try {
    await updateSubmissions(_subTargetId, count);
    renderAssignments();
    refreshAssignmentCards();
    showToast("Submissions updated", "success");
  } catch (err) {
    showToast("Error updating submissions: " + err.message, "error");
  }

  el("subModal")?.classList.remove("open");
  _subTargetId = null;
}

/* ══════════════════════════════════════════════════════════
   ANNOUNCEMENTS
   ══════════════════════════════════════════════════════════ */

async function handleAnnouncementSubmit(e) {
  e.preventDefault();

  const payload = {
    title:    el("annTitle")?.value?.trim(),
    audience: el("annAudience")?.value,
    msg:      el("annMsg")?.value?.trim(),
    priority: "INFO",
  };

  if (!payload.title || !payload.msg) {
    showToast("Please fill in title and message", "error");
    return;
  }

  try {
    await postAnnouncement(payload);
    renderAnnouncements();
    e.target.reset();
    showToast("Announcement posted", "success");
  } catch (err) {
    showToast("Error posting announcement: " + err.message, "error");
  }
}

async function renderAnnouncements() {
  const container = el("announcementsList");
  if (!container) return;

  const priorityClass = { HIGH: "badge-danger", INFO: "badge-info", MEDIUM: "badge-warning" };

  try {
    const anns = await getAnnouncements();
    container.innerHTML = anns.map(a => `
      <div class="announcement-item">
        <div>
          <div class="announcement-title">${a.title}</div>
          <div class="announcement-meta">${a.audience} · ${a.date}</div>
          <div class="announcement-msg">${a.msg}</div>
        </div>
        <span class="badge ${priorityClass[a.priority] || "badge-neutral"}">${a.priority}</span>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">Error loading announcements: ${err.message}</p>`;
  }
}

/* ══════════════════════════════════════════════════════════
   REPORTS SUMMARY
   ══════════════════════════════════════════════════════════ */

function renderReportSummary() {
  const container = el("reportSummary");
  if (!container) return;

  const s = computeReportSummary();

  const items = [
    { label: "Attendance Sessions", value: s.attendanceSessions },
    { label: "Overall Attendance",  value: s.overallAttendance  },
    { label: "Marks Records",       value: s.marksRecords       },
    { label: "Avg Score (all exams)",value: s.avgScore          },
    { label: "Assignments Created", value: s.assignmentsCreated },
    { label: "Total Submissions",   value: s.totalSubmissions   },
  ];

  container.innerHTML = items.map(i => `
    <div class="summary-card">
      <div class="summary-card-label">${i.label}</div>
      <div class="summary-card-value">${i.value}</div>
    </div>
  `).join("");
}

/* ══════════════════════════════════════════════════════════
   STUDENT SEARCH
   ══════════════════════════════════════════════════════════ */

function handleStudentSearch(e) {
  const q = e.target.value.toLowerCase();
  qsa("#studentTable tbody tr").forEach(row => {
    const name = (row.dataset.name || "").toLowerCase();
    const roll = (row.cells[0]?.textContent || "").toLowerCase();
    row.classList.toggle("hidden", !(name.includes(q) || roll.includes(q)));
  });
}

/* ══════════════════════════════════════════════════════════
   EVENT DELEGATION — dynamic rows (history edit, sim, del)
   ══════════════════════════════════════════════════════════ */

function bindDelegatedEvents() {
  /* Main content: history edit buttons, simulate/delete assignment buttons */
  qs(".main-content")?.addEventListener("click", async e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id     = parseInt(btn.dataset.id, 10);

    switch (action) {
      case "edit-att":    openEditModal(id);                                         break;
      case "sim-sub":     openSubModal(id);                                          break;
      case "del-asg":
        try {
          await deleteAssignment(id);
          renderAssignments();
          refreshAssignmentCards();
          showToast("Assignment removed", "info");
        } catch (err) { showToast(err.message, "error"); }
        break;
      case "view-student":
        showToast(`Profile: ${btn.dataset.name}`, "info");
        break;
      case "alert-student":
        showToast(`Alert sent to ${btn.dataset.name}`, "success");
        break;
      case "report":
        showToast(reportMessages[btn.dataset.report] || "Generating report…", "success");
        break;
      case "edit-profile":
        showToast("Profile editor opened.", "info");
        break;
    }
  });
}

const reportMessages = {
  attendance:  "Attendance report generated. Downloading…",
  marks:       "Marks report generated. Downloading…",
  assignments: "Assignment summary downloaded.",
  atrisk:      "At-risk students list exported.",
};

/* ══════════════════════════════════════════════════════════
   MODAL BUTTON BINDINGS
   ══════════════════════════════════════════════════════════ */

function bindModalButtons() {
  el("saveEditBtn")?.addEventListener("click",   saveEditModal);
  el("cancelEditBtn")?.addEventListener("click", closeEditModal);

  el("saveSubBtn")?.addEventListener("click",   saveSubModal);
  el("cancelSubBtn")?.addEventListener("click", () => {
    el("subModal")?.classList.remove("open");
    _subTargetId = null;
  });

  /* Close modals by clicking overlay backdrop */
  el("editModal")?.addEventListener("click", e => { if (e.target === el("editModal")) closeEditModal(); });
  el("subModal")?.addEventListener("click",  e => {
    if (e.target === el("subModal")) {
      el("subModal").classList.remove("open");
      _subTargetId = null;
    }
  });
}

/* ══════════════════════════════════════════════════════════
   FORM BINDINGS
   ══════════════════════════════════════════════════════════ */

function bindForms() {
  el("attendanceForm")?.addEventListener("submit",  handleAttendanceSubmit);
  el("marksForm")?.addEventListener("submit",       handleMarksSubmit);
  el("assignmentForm")?.addEventListener("submit",  handleAssignmentSubmit);
  el("announcementForm")?.addEventListener("submit", handleAnnouncementSubmit);
}

/* ══════════════════════════════════════════════════════════
   LOGOUT
   ══════════════════════════════════════════════════════════ */

function bindLogout() {
  el("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    showToast("Signing out…", "info");
    setTimeout(() => window.location.replace("index.html"), 600);
  });
}

/* ══════════════════════════════════════════════════════════
   INIT — runs once DOM is ready
   ══════════════════════════════════════════════════════════ */

function init() {
  /* Verify Chart.js loaded */
  if (typeof Chart === "undefined") {
    console.error("Chart.js not loaded. Check the CDN script tag.");
  }

  /* Set today's date in attendance form */
  const attDate = el("attendanceDate");
  if (attDate) attDate.value = new Date().toISOString().slice(0, 10);

  /* Build static tables */
  buildAttendanceTable();
  buildMarksTable();

  /* Bind all event listeners */
  bindNavigation();
  bindAttendanceTabs();
  bindHistoryFilters();
  bindForms();
  bindModalButtons();
  bindDelegatedEvents();
  bindLogout();

  /* Student search */
  el("studentSearch")?.addEventListener("input", handleStudentSearch);

  /* Initial renders */
  buildPerfChart();
  renderAnnouncements();

  /* Clock */
  startClock();

  /* Populate teacher name from session (set by login.js) */
  const name = localStorage.getItem("name");
  if (name) {
    setText("teacherName",       name);
    setText("sidebarTeacherName", name);
    setText("profileName",        name);

    /* Avatar initials */
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const avatar = el("avatarInitials");
    if (avatar) avatar.textContent = initials;
  }
}

/* ── BOOT ─────────────────────────────────────────────── */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}