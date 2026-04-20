"use strict";
/* ============================================================
   EduWorkflow v8.0 — app.js
   Full frontend logic for Student, Teacher, Admin dashboards
   ============================================================ */

// ── Helpers ──────────────────────────────────────────────────
function localDateValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function localMonthValue() { return localDateValue().slice(0, 7); }
function byId(id) { return document.getElementById(id); }
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function H(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function titleize(v) {
  return String(v ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function initials(name) {
  return String(name || "?").trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return v; }
}
function formatLongDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return v; }
}
function formatDateTime(v) {
  if (!v) return "—";
  try {
    const s = String(v).includes("T") ? v : String(v).replace(" ", "T");
    return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return v; }
}
function formatCurrency(v) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v || 0));
}
function formatMonthLabel(v) {
  if (!v) return "All months";
  try { return new Date(`${v}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
  catch { return v; }
}
function formatShortDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit" }); }
  catch { return v; }
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function deadlineLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `${d}d left`;
}
function deadlineClass(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return "dl-ok";
  if (d < 0) return "dl-overdue";
  if (d <= 2) return "dl-urgent";
  return "dl-ok";
}
async function handleAttachmentDownload(itemType, itemId, fallbackName = "download.txt") {
  const out = await window.Api.downloadAttachment(itemType, itemId);
  if (out.type === "json") {
    const body = out.body || {};
    if (body.externalUrl) {
      window.open(body.externalUrl, "_blank");
      return;
    }
    const blob = new Blob([body.content || ""], { type: body.mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = body.filename || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  const blob = await out.response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function exportCsv(filename, headers, rows) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map(row => row.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function downloadCsvResponse(fetchPromise, fallbackName) {
  const res = await fetchPromise;
  if (!res.ok) throw new Error("Export failed");
  downloadBlob(fallbackName, await res.blob());
}
const DAY_ORDER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
const STANDARD_EXAM_TYPES = ["Internal Exam 1", "Internal Exam 2", "Mid-Term", "Lab 1", "Lab 2", "Final Exam"];
function sortByDayAndTime(items = []) {
  return [...items].sort((a, b) => {
    const dayDiff = (DAY_ORDER[a.day_of_week || a.day] || 99) - (DAY_ORDER[b.day_of_week || b.day] || 99);
    if (dayDiff) return dayDiff;
    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  });
}
function buildMatrixLabel(cell) {
  if (!cell || !cell.sessionCount) return "—";
  const parts = [];
  if (cell.presentCount) parts.push(`P${cell.presentCount}`);
  if (cell.absentCount) parts.push(`A${cell.absentCount}`);
  if (cell.lateCount) parts.push(`L${cell.lateCount}`);
  if (cell.medicalLeaveCount) parts.push(`ML${cell.medicalLeaveCount}`);
  return parts.join(" · ") || "—";
}
function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
function flattenWeeklyTimetable(weekly = {}) {
  return sortByDayAndTime(Object.values(weekly || {}).flat());
}

// ── State ─────────────────────────────────────────────────────
const PAGE_MAP = { student: "student.html", teacher: "teacher.html", admin: "admin.html" };
const DEFAULT_SECTION = { student: "overviewSection", teacher: "overviewSection", admin: "overviewSection" };
const DEFAULT_FILTERS = {
  student: {
    attendanceSemester: 6, attendanceSubject: "", attendanceView: "overall",
    attendanceMonth: localMonthValue(), attendanceDate: "", attendanceFromDate: "", attendanceToDate: "",
    timetableDate: localDateValue(), timetableGroup: "day", resultsSemester: 6,
    _semesterInitialised: false,
  },
  teacher: {
    attendanceCourseId: null, marksCourseId: null, marksExamType: "Internal Exam 1",
    teacherDate: localDateValue(), teacherHistoryDate: "", teacherHistoryFromDate: "", teacherHistoryToDate: "",
    teacherAttendanceView: "register", teacherTimetableDay: "", teacherTimetableSection: "", teacherTimetableCourse: "",
  },
  admin: { adminTimetableDay: "", adminTimetableSection: "", adminTimetableDept: "", adminTimetableTeacher: "" },
};

const state = {
  role: document.body.dataset.role,
  session: window.Session.get(),
  dashboard: null,
  charts: {},
  ui: { activeSection: DEFAULT_SECTION[document.body.dataset.role] || "overviewSection", navOpen: false, loading: false, bootstrapped: false },
  filters: JSON.parse(JSON.stringify(DEFAULT_FILTERS[document.body.dataset.role] || {})),
};

const STORE_KEY = `edutrack-v8:${state.role}`;

function persistState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ activeSection: state.ui.activeSection, filters: state.filters })); }
  catch { /* ignore */ }
}
function hydrateState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.activeSection) state.ui.activeSection = p.activeSection;
    if (p.filters) state.filters = { ...state.filters, ...p.filters };
  } catch { /* ignore */ }
}
hydrateState();

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  const host = byId("toastStack");
  if (!host) return;
  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ"}</span><span class="toast-msg">${H(msg)}</span>`;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(20px)"; setTimeout(() => t.remove(), 220); }, 3000);
}

// ── Modal ─────────────────────────────────────────────────────
function openModal({ title, subtitle = "", body, confirmLabel = "Save", cancelLabel = "Cancel", onConfirm, width = "520px", danger = false }) {
  byId("activeModal")?.remove();
  const bd = document.createElement("div");
  bd.id = "activeModal";
  bd.className = "modal-backdrop";
  bd.innerHTML = `
    <div class="modal" style="--mw:${width}">
      <div class="modal-header">
        <div>
          <div class="modal-title">${H(title)}</div>
          ${subtitle ? `<div class="modal-subtitle">${H(subtitle)}</div>` : ""}
        </div>
        <button class="modal-close" data-modal-close>✕</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        ${cancelLabel ? `<button class="btn btn-ghost" data-modal-close>${H(cancelLabel)}</button>` : ""}
        ${confirmLabel ? `<button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="modalConfirmBtn">${H(confirmLabel)}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  qsa("[data-modal-close]", bd).forEach(b => b.addEventListener("click", close));
  bd.addEventListener("click", e => { if (e.target === bd) close(); });
  if (onConfirm) {
    byId("modalConfirmBtn")?.addEventListener("click", async () => {
      const btn = byId("modalConfirmBtn");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      try { await onConfirm(close); }
      catch (e) { showToast(e.message, "error"); if (btn) { btn.disabled = false; btn.textContent = confirmLabel; } }
    });
  }
  return bd;
}

// ── Clock ─────────────────────────────────────────────────────
function startClock() {
  const el = byId("liveClock");
  if (!el) return;
  const tick = () => { el.textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); };
  tick(); setInterval(tick, 10000);
}

// ── Nav ───────────────────────────────────────────────────────
function logout() { window.Session.clear(); localStorage.removeItem(STORE_KEY); window.location.replace("index.html"); }
function protectPage() {
  if (!state.session.role || !state.session.userId) { logout(); return false; }
  if (state.session.role !== state.role) { window.location.replace(PAGE_MAP[state.session.role] || "index.html"); return false; }
  return true;
}
const SECTION_LABELS = {
  student: {
    overviewSection: "Home",
    attendanceSection: "Attendance",
    timetableSection: "Timetable",
    resultsSection: "Results",
    assignmentsSection: "Assignments",
    campusDeskSection: "Campus Desk",
    careerSection: "Career & Fees",
    requestsSection: "Requests",
    profileSection: "Profile",
  },
  teacher: {
    overviewSection: "Home",
    attendanceSection: "Attendance",
    marksSection: "Marks Entry",
    assignmentsSection: "Assignments",
    rosterSection: "Student Roster",
    timetableSection: "Timetable",
    announcementsSection: "Notices",
    profileSection: "Profile",
  },
  admin: {
    overviewSection: "Dashboard",
    activitySection: "Activity Log",
    usersSection: "User Directory",
    deptsSection: "Departments",
    coursesSection: "Courses",
    timetableSection: "Timetable Config",
    grievancesSection: "Grievances",
    noticesSection: "Notice Board",
    reportsSection: "Reports",
    settingsSection: "Settings",
    profileSection: "Profile",
  },
};

function updateSectionLabel(sectionId) {
  const el = byId("sectionLabel");
  if (!el) return;
  const map = SECTION_LABELS[state.role] || SECTION_LABELS.student;
  const def = DEFAULT_SECTION[state.role] || "overviewSection";
  el.textContent = map[sectionId] || map[def] || "Overview";
}

function dashboardSkeletonHtml() {
  const statBlocks = Array.from({ length: 4 }, () => '<div class="dash-sk-stat skeleton" aria-hidden="true"></div>').join("");
  const shortcutBlocks = Array.from({ length: 4 }, () => '<div class="dash-sk-tile skeleton" aria-hidden="true"></div>').join("");
  return `
    <div class="stats-grid dash-sk-stats">${statBlocks}</div>
    <div class="g2 dash-sk-main">
      <div class="card card-p dash-sk-card">
        <div class="dash-sk-h1 skeleton" aria-hidden="true"></div>
        <div class="dash-sk-row skeleton" aria-hidden="true"></div>
        <div class="dash-sk-row skeleton" aria-hidden="true"></div>
        <div class="dash-sk-row skeleton" aria-hidden="true"></div>
      </div>
      <div class="dash-sk-col">
        <div class="card card-p dash-sk-card">
          <div class="dash-sk-h2 skeleton" aria-hidden="true"></div>
          <div class="dash-sk-chart skeleton" aria-hidden="true"></div>
        </div>
        <div class="card card-p dash-sk-card">
          <div class="dash-sk-h2 skeleton" aria-hidden="true"></div>
          <div class="shortcut-grid dash-sk-shortcuts">${shortcutBlocks}</div>
        </div>
      </div>
    </div>
    <p class="dash-loading-hint" aria-live="polite">Loading your workspace…</p>`;
}

function setActiveSection(id) {
  const target = byId(id) ? id : (DEFAULT_SECTION[state.role] || "overviewSection");
  state.ui.activeSection = target;
  qsa(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.target === target));
  qsa(".view-section").forEach(s => s.classList.toggle("hidden", s.id !== target));
  if (state.ui.navOpen) toggleNav(false);
  updateSectionLabel(target);
  persistState();
}
function toggleNav(force) {
  state.ui.navOpen = typeof force === "boolean" ? force : !state.ui.navOpen;
  document.body.classList.toggle("nav-open", state.ui.navOpen);
}
function initNav() {
  qsa(".nav-link").forEach(b => b.addEventListener("click", () => setActiveSection(b.dataset.target)));
  byId("logoutBtn")?.addEventListener("click", logout);
  byId("refreshBtn")?.addEventListener("click", () => loadDashboard());
  byId("menuBtn")?.addEventListener("click", () => toggleNav());
  byId("sidebarScrim")?.addEventListener("click", () => toggleNav(false));
}

function setIdentity(profile) {
  const av = initials(profile.name);
  if (byId("sidebarAvatar")) byId("sidebarAvatar").textContent = av;
  if (byId("sidebarName")) byId("sidebarName").textContent = profile.name || "";
  if (byId("sidebarMeta")) {
    if (profile.role === "student") byId("sidebarMeta").textContent = `${(profile.details?.program || "").split("(")[0].trim()} · Sem ${profile.details?.semester || ""}`;
    else if (profile.role === "teacher") byId("sidebarMeta").textContent = profile.details?.designation || "Faculty";
    else byId("sidebarMeta").textContent = profile.details?.title || "Administrator";
  }
  if (byId("pageTitle")) byId("pageTitle").textContent = profile.name || "Dashboard";
}

// ── Notifications ─────────────────────────────────────────────
const NOTIF_ICONS = { assignment: "📝", results: "🏆", attendance: "📋", timetable: "🗓", notice: "📢", grievance: "⚠️", notification: "💬", fees: "💰", placement: "💼", library: "📚" };

function renderNotifPanel(data) {
  const items = data?.items || [];
  const unread = data?.unreadCount || 0;
  // Map notification category to dashboard section
  const categorySection = {
    assignment: "assignmentsSection", results: "resultsSection",
    attendance: "attendanceSection", timetable: "timetableSection",
    notice: "campusDeskSection", grievance: "requestsSection",
    fees: "careerSection", placement: "careerSection",
    library: "campusDeskSection", notification: "overviewSection",
  };
  return `
    <div class="notif-head">
      <span class="notif-head-title">Notifications ${unread ? `<span class="badge badge-danger">${unread}</span>` : ""}</span>
      ${unread ? `<button class="btn btn-xs btn-ghost" data-action="mark-all-read">Mark all read</button>` : ""}
    </div>
    <div class="notif-list">
      ${items.length ? items.map(n => {
        const section = (n.action_link || "").startsWith("#")
          ? ((n.action_link || "").replace("#", "") + "Section")
          : (categorySection[n.category] || "overviewSection");
        return `<div class="notif-item ${n.is_read ? "" : "unread"}" data-notif-id="${n.id}" data-notif-section="${section}" style="cursor:pointer">
          <div class="notif-item-icon">${NOTIF_ICONS[n.category] || "🔔"}</div>
          <div class="notif-item-body">
            <div class="notif-item-title">${H(n.title)}</div>
            <div class="notif-item-msg">${H(n.message)}</div>
            <div class="notif-item-time">${formatDateTime(n.created_at)}</div>
          </div>
          ${!n.is_read ? `<div style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px"></div>` : ""}
        </div>`;
      }).join("") : `<div class="notif-empty">✓ You're all caught up!</div>`}
    </div>`;
}

async function loadNotifications() {
  try {
    const data = await window.Api.notifications();
    const cnt = data?.unreadCount || 0;
    const el = byId("notifCount");
    if (el) { el.textContent = cnt; el.classList.toggle("hidden", cnt === 0); }
    const panel = byId("notifPanel");
    if (panel) panel.innerHTML = renderNotifPanel(data);
  } catch { /* silent */ }
}

function initNotifBtn() {
  const btn = byId("notifBtn");
  const panel = byId("notifPanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", e => {
    e.stopPropagation();
    const isHidden = panel.classList.contains("hidden");
    panel.classList.toggle("hidden");
    if (isHidden) loadNotifications();
  });

  // Close when clicking outside
  document.addEventListener("click", e => {
    if (!btn.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });

  // Handle notification item clicks (navigate + mark read)
  panel.addEventListener("click", async e => {
    const item = e.target.closest("[data-notif-id]");
    if (item) {
      const notifId = Number(item.dataset.notifId);
      const section = item.dataset.notifSection || "overviewSection";
      // Mark as read silently
      try { await window.Api.readNotification(notifId); } catch { /* silent */ }
      // Navigate to the relevant section
      panel.classList.add("hidden");
      setActiveSection(section);
      // Update badge
      loadNotifications();
      return;
    }
    // Mark-all-read button
    if (e.target.closest("[data-action='mark-all-read']")) {
      try {
        const data = await window.Api.notifications();
        const unread = (data?.items || []).filter(n => !n.is_read);
        await Promise.all(unread.map(n => window.Api.readNotification(n.id)));
        loadNotifications();
      } catch { /* silent */ }
    }
  });
}

// ── Charts ────────────────────────────────────────────────────
function destroyChart(name) { if (state.charts[name]) { state.charts[name].destroy(); state.charts[name] = null; } }

const CHART_COLORS = ["#e05c2a","#1f5fa6","#1a7a56","#c07a15","#6d44d4","#c0384a","#0891b2","#84cc16"];

function lineChart(canvasId, name, labels, datasets) {
  destroyChart(name);
  const canvas = byId(canvasId);
  if (!canvas || typeof Chart === "undefined" || !labels.length) return;
  state.charts[name] = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: datasets.map((d, i) => ({
      label: d.label, data: d.values, borderColor: CHART_COLORS[i] || CHART_COLORS[0],
      backgroundColor: CHART_COLORS[i] + "18", borderWidth: 2, tension: 0.35,
      fill: true, pointBackgroundColor: CHART_COLORS[i], pointRadius: 4, pointHoverRadius: 6,
    })) },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "top", labels: { usePointStyle: true, padding: 16, font: { family: "Manrope", weight: "700", size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#6b7a96", font: { family: "Manrope" } } },
                y: { grid: { color: "rgba(107,122,150,.12)" }, ticks: { color: "#6b7a96", font: { family: "Manrope" } } } } },
  });
}

function barChart(canvasId, name, labels, datasets) {
  destroyChart(name);
  const canvas = byId(canvasId);
  if (!canvas || typeof Chart === "undefined" || !labels.length) return;
  state.charts[name] = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: datasets.map((d, i) => ({
      label: d.label, data: d.values,
      backgroundColor: d.values.map((_, j) => CHART_COLORS[(i + j) % CHART_COLORS.length]),
      borderRadius: 8, borderSkipped: false,
    })) },
    options: { maintainAspectRatio: false, plugins: { legend: { display: datasets.length > 1, position: "top", labels: { usePointStyle: true, padding: 14, font: { family: "Manrope", weight: "700", size: 11 } } } },
      scales: { x: { grid: { display: false }, ticks: { color: "#6b7a96", font: { family: "Manrope" } } },
                y: { grid: { color: "rgba(107,122,150,.12)" }, ticks: { color: "#6b7a96", font: { family: "Manrope" } } } } },
  });
}

function doughnutChart(canvasId, name, labels, values) {
  destroyChart(name);
  const canvas = byId(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  state.charts[name] = new Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 6 }] },
    options: { maintainAspectRatio: false, cutout: "68%",
      plugins: { legend: { position: "right", labels: { usePointStyle: true, padding: 12, font: { family: "Manrope", weight: "600", size: 11 } } } } },
  });
}

// ── Badge / Status helpers ─────────────────────────────────────
function badgeClass(val) {
  const v = String(val || "").toLowerCase();
  if (["active","paid","approved","present","open","credited","applied","scheduled","published","success"].includes(v)) return "badge-success";
  if (["pending","review","late","in_review","ongoing","shortlisted","updated","renewal_requested","medium"].includes(v)) return "badge-warning";
  if (["absent","suspended","archived","cancelled","overdue","resolved","closed","rejected","danger","high"].includes(v)) return "badge-danger";
  if (["student","info","medical_leave","low"].includes(v)) return "badge-info";
  return "badge-neutral";
}

function statusBadge(val) {
  return `<span class="badge ${badgeClass(val)}">${H(titleize(val))}</span>`;
}

function gradeBadge(letter) {
  const cls = {
    "O":  "g-O",
    "A+": "g-Aplus",
    "A":  "g-A",
    "B+": "g-Bplus",
    "B":  "g-B",
    "C":  "g-C",
    "D":  "g-D",
    "F":  "g-F",
    "P":  "g-C",
  }[letter] || "g-C";
  return `<span class="grade ${cls}">${H(letter)}</span>`;
}

// ── Shared card/panel helpers ─────────────────────────────────
function cardHeader(title, subtitle = "", actions = "") {
  return `<div class="card-header">
    <div><div class="card-title">${H(title)}</div>${subtitle ? `<div class="card-subtitle">${H(subtitle)}</div>` : ""}</div>
    ${actions ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${actions}</div>` : ""}
  </div>`;
}

function emptyState(icon, title, desc = "") {
  return `<div class="empty-state" role="status"><div class="empty-icon" aria-hidden="true">${icon}</div><div class="empty-title">${H(title)}</div>${desc ? `<div class="empty-desc">${H(desc)}</div>` : ""}</div>`;
}

function statCard(value, label, icon, color = "c-orange", trend = "", clickTarget = "") {
  return `<div class="stat-card ${color} ${clickTarget ? "clickable" : ""}" ${clickTarget ? `data-jump="${clickTarget}"` : ""}>
    <div class="stat-icon">${icon}</div>
    <div class="stat-value">${H(value)}</div>
    <div class="stat-label">${H(label)}</div>
    ${trend ? `<div class="stat-trend trend-neut">${trend}</div>` : ""}
  </div>`;
}

function progressBar(pct) {
  const cls = pct >= 75 ? "pf-high" : pct >= 60 ? "pf-mid" : "pf-low";
  return `<div class="progress-bar"><div class="progress-fill ${cls}" style="width:${Math.min(pct, 100)}%"></div></div>`;
}

function tableEmpty(colspan, msg = "No data available") {
  return `<tr class="table-empty-row"><td colspan="${colspan}" class="table-empty-cell"><span class="table-empty-msg">${H(msg)}</span></td></tr>`;
}

// ── File zone helper ──────────────────────────────────────────
function fileZone(inputId, accept = "*", label = "Click to upload or drag & drop") {
  return `<div class="file-zone" id="${inputId}Zone">
    <input type="file" id="${inputId}" accept="${accept}" />
    <div class="file-zone-icon">📎</div>
    <div class="file-zone-label">${label}</div>
    <div class="file-zone-sub">Max 10MB · Any format</div>
    <div class="file-chosen hidden" id="${inputId}Chosen"></div>
  </div>`;
}

function bindFileZone(inputId) {
  const input = byId(inputId);
  const chosen = byId(`${inputId}Chosen`);
  if (!input || !chosen) return;
  input.addEventListener("change", () => {
    const f = input.files[0];
    if (f) { chosen.classList.remove("hidden"); chosen.innerHTML = `📄 <strong>${H(f.name)}</strong> (${(f.size / 1024).toFixed(1)} KB)`; }
  });
  const zone = byId(`${inputId}Zone`);
  if (zone) {
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("drag-over"); if (e.dataTransfer.files[0]) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event("change")); } });
  }
}

// ── Form helpers ──────────────────────────────────────────────
function getFormValues(form) { return Object.fromEntries(new FormData(form).entries()); }

// ── Dashboard Loader ──────────────────────────────────────────
async function loadDashboard() {
  if (state.ui.loading) return;
  state.ui.loading = true;
  const rBtn = byId("refreshBtn");
  const mainEl = document.querySelector("main.workspace");
  if (rBtn) { rBtn.disabled = true; rBtn.classList.add("is-loading"); }
  if (mainEl) mainEl.setAttribute("aria-busy", "true");
  const activeSec = byId(state.ui.activeSection);
  if (!state.ui.bootstrapped && activeSec) activeSec.innerHTML = dashboardSkeletonHtml();
  try {
    if (state.role === "student") {
      const [dash, attDetail] = await Promise.all([
        window.Api.studentDashboard({
          attendanceSemester: state.filters.attendanceSemester,
          resultsSemester: state.filters.resultsSemester,
          subject: state.filters.attendanceSubject,
          attendanceView: state.filters.attendanceView,
          timetableView: "day",
          date: state.filters.timetableDate,
          month: state.filters.attendanceMonth,
          attendanceDate: state.filters.attendanceDate,
          fromDate: state.filters.attendanceFromDate,
          toDate: state.filters.attendanceToDate,
        }),
        window.Api.studentAttendance({
          semester: state.filters.attendanceSemester,
          subject: state.filters.attendanceSubject,
          month: state.filters.attendanceMonth,
          date: state.filters.attendanceDate,
          fromDate: state.filters.attendanceFromDate,
          toDate: state.filters.attendanceToDate,
        }),
      ]);
      state.dashboard = { ...dash, attendanceDetail: attDetail };
      // On first load, use the student's actual current semester from their profile
      if (!state.filters._semesterInitialised) {
        const actualSem = dash.profile?.details?.semester || 6;
        state.filters.attendanceSemester = actualSem;
        state.filters.resultsSemester = actualSem;
        state.filters._semesterInitialised = true;
      }
    } else if (state.role === "teacher") {
      const [dash, attHistory] = await Promise.all([
        window.Api.teacherDashboard(),
        window.Api.teacherAttendance({
          courseId: state.filters.attendanceCourseId || "",
          date: state.filters.teacherHistoryDate,
          fromDate: state.filters.teacherHistoryFromDate,
          toDate: state.filters.teacherHistoryToDate,
        }),
      ]);
      state.dashboard = { ...dash, attendanceHistory: attHistory };
    } else {
      state.dashboard = await window.Api.adminDashboard();
    }
    state.ui.bootstrapped = true;
    setIdentity(state.dashboard.profile);
    loadNotifications();
    renderCurrentRole();
  } catch (err) {
    showToast(err.message || "Failed to load dashboard", "error");
    if (!state.ui.bootstrapped && activeSec) {
      activeSec.innerHTML = emptyState("⚠️", "Could not load this view", "Check your connection and use refresh, or try again in a moment.");
    }
  } finally {
    state.ui.loading = false;
    if (rBtn) { rBtn.disabled = false; rBtn.classList.remove("is-loading"); }
    if (mainEl) mainEl.removeAttribute("aria-busy");
  }
}

function renderCurrentRole() {
  if (state.role === "student") renderStudent();
  else if (state.role === "teacher") renderTeacher();
  else renderAdmin();
  setActiveSection(state.ui.activeSection);
  persistState();
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE PANEL (shared across roles)
// ═══════════════════════════════════════════════════════════════
function profilePanel(profile) {
  const d = profile?.details || {};
  const fields = [];
  if (profile.role === "student") {
    fields.push(["Roll No.", state.session.rollNo || profile.rollNo || "—"], ["Program", d.program], ["Semester", d.semester], ["Section", d.section], ["Batch", d.batch], ["CGPA", d.cgpa], ["Credits", `${d.earned_credits ?? "—"} / ${d.total_credits ?? "—"}`], ["Advisor", d.advisor_name], ["Hostel", d.hostel_name || "Day Scholar"], ["Scholarship", d.scholarship_status || "—"], ["Date of Birth", formatDate(d.date_of_birth)], ["Phone", profile.phone]);
  } else if (profile.role === "teacher") {
    fields.push(["Employee ID", state.session.employeeId || "—"], ["Designation", d.designation], ["Specialization", d.specialization], ["Qualification", d.qualification], ["Experience", d.experience_years ? `${d.experience_years} yrs` : "—"], ["Office Room", d.office_room], ["Department", profile.department?.name], ["Phone", profile.phone]);
  } else {
    fields.push(["Admin ID", profile.userId || "—"], ["Role", d.super_admin ? "Super Admin" : "Administrator"], ["Email", profile.email], ["Phone", profile.phone], ["Last Login", formatDateTime(profile.lastLoginAt)]);
  }

  const hasPhoto = Boolean(profile.profileImageData);
  const avatarMarkup = hasPhoto
    ? `<img src="${H(profile.profileImageData)}" alt="${H(profile.name)}" class="profile-photo">`
    : `<div class="avatar av-xl">${initials(profile.name)}</div>`;
  return `
    <div class="card card-p">
      <div class="profile-hero">
        <div class="profile-avatar-wrap">${avatarMarkup}</div>
        <div class="profile-info">
          <div class="profile-name">${H(profile.name)}</div>
          <div class="profile-role">${H(profile.email)} &nbsp;·&nbsp; ${statusBadge(profile.role)}</div>
          <div class="profile-actions">
            <button class="btn btn-primary btn-sm" data-action="open-profile-edit" data-current-name="${H(profile.name)}" data-current-phone="${H(profile.phone || "")}">✎ Edit Profile</button>
            <button class="btn btn-ghost btn-sm" data-action="open-password-change">🔐 Change Password</button>
            <button class="btn btn-ghost btn-sm" data-action="upload-profile-image">🖼 Upload Photo</button>
            ${profile.role === "student" ? `<button class="btn btn-ghost btn-sm" data-action="download-doc" data-doc="id_card">📄 ID Card</button><button class="btn btn-ghost btn-sm" data-action="download-doc" data-doc="bonafide">📑 Bonafide</button><button class="btn btn-ghost btn-sm" data-action="download-doc" data-doc="admit_card">🎫 Admit Card</button>` : ""}
          </div>
        </div>
      </div>
    </div>
    <div class="card card-p">
      <div class="card-kicker">Details</div>
      <div class="detail-grid">
        ${fields.filter(([, v]) => v != null && v !== "").map(([l, v]) => `
          <div class="detail-item">
            <div class="detail-label">${l}</div>
            <div class="detail-value">${H(String(v))}</div>
          </div>`).join("")}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  STUDENT SECTIONS
// ═══════════════════════════════════════════════════════════════

function renderStudent() {
  const d = state.dashboard;
  const p = d.profile;
  const att = d.attendanceDetail?.summary || {};
  const tItems = d.timetable?.items || [];
  const pending = (d.assignments || []).filter(a => a.submission_status === "pending" || a.submission_status === "late");
  const fees = d.fees?.items || [];
  const pendingFees = fees.filter(f => f.status === "pending" || f.status === "overdue");

  // Update assignment badge
  const badge = byId("assignBadge");
  if (badge) { badge.textContent = pending.length; badge.classList.toggle("hidden", pending.length === 0); }

  // ── Home ──────────────────────────────────────────────────────
  byId("overviewSection").innerHTML = `
    <div class="stats-grid">
      ${statCard(`${att.overallPercentage ?? 0}%`, "Attendance", "📋", att.overallPercentage >= 75 ? "c-green" : att.overallPercentage >= 60 ? "c-yellow" : "c-orange", progressBar(att.overallPercentage || 0), "attendanceSection")}
      ${statCard(p.details?.cgpa ?? "—", "CGPA", "🏆", "c-blue", `Rank #${p.details?.rank_position ?? "—"}`, "resultsSection")}
      ${statCard(pending.length, "Pending Assignments", "📝", "c-yellow", `${(d.assignments || []).length} total`, "assignmentsSection")}
      ${statCard(pendingFees.length, "Pending Fees", "💰", pendingFees.length > 0 ? "c-red" : "c-green", `${fees.filter(f => f.status === "paid").length} paid`, "careerSection")}
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Today's Schedule", formatLongDate(state.filters.timetableDate), `<button class="btn btn-ghost btn-sm" data-jump="timetableSection">Full view →</button>`)}
        ${tItems.length ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${tItems.map(s => `<div class="tt-slot ${s.status === "cancelled" ? "tt-cancelled" : s.status === "updated" ? "tt-updated" : ""}">
            <div class="tt-time">${H(s.start_time)}–${H(s.end_time)}</div>
            <div class="tt-info">
              <div class="tt-subject">${H(s.course_name || s.subject || "")}</div>
              <div class="tt-meta">${H(s.course_code || "")} · ${H(s.slot_type || "")}</div>
              ${s.note ? `<div style="font-size:.74rem;color:var(--warning);margin-top:3px">📌 ${H(s.note)}</div>` : ""}
            </div>
            <div class="tt-room-badge">📍 ${H(s.room || "—")}</div>
          </div>`).join("")}
        </div>` : emptyState("🌟", "No classes today", "Enjoy your free day!")}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card card-p">
          <div class="card-kicker">CGPA Trend</div>
          <div class="chart-wrap"><canvas id="cgpaTrendChart"></canvas></div>
        </div>
        <div class="card card-p">
          <div class="card-title" style="margin-bottom:12px">Quick Navigate</div>
          <div class="shortcut-grid">
            ${[["📋","Attendance","attendanceSection"],["🗓","Timetable","timetableSection"],["🏆","Results","resultsSection"],["📝","Assignments","assignmentsSection"],["🏫","Campus Desk","campusDeskSection"],["💼","Career","careerSection"],["📬","Requests","requestsSection"],["👤","Profile","profileSection"]]
              .map(([icon, label, target]) => `<button class="shortcut-tile" data-jump="${target}"><div class="shortcut-icon">${icon}</div><div class="shortcut-label">${label}</div></button>`).join("")}
          </div>
        </div>
      </div>
    </div>
    ${(d.notices || []).length ? `<div class="card card-p">
      ${cardHeader("Latest Notices", "Campus announcements")}
      <div style="display:flex;flex-direction:column;gap:8px">
        ${(d.notices || []).slice(0, 4).map(n => `<div class="notice-card nc-${n.priority || "medium"}" data-action="open-campus-notices" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div><div class="notice-title">${H(n.title)}</div><div class="notice-meta">${H(n.published_by || "")} · ${formatDate(n.created_at)}</div></div>
            ${statusBadge(n.priority || "medium")}
          </div>
          <div class="notice-body">${H(n.message)}</div>
        </div>`).join("")}
      </div>
    </div>` : ""}
  `;
  lineChart("cgpaTrendChart", "cgpaTrend", (d.results?.summary || []).map(s => `Sem ${s.semester}`), [{ label: "CGPA", values: (d.results?.summary || []).map(s => s.cgpa) }, { label: "SGPA", values: (d.results?.summary || []).map(s => s.sgpa) }]);

  // ── Attendance ────────────────────────────────────────────────
  const attItems = att.items || [];
  const attDaywise = d.attendanceDetail?.daywise || [];
  const attMatrix = d.attendanceDetail?.matrix || { dates: [], rows: [] };
  byId("attendanceSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Attendance", "View-first filters for overall, day-wise, and matrix attendance")}
      <div class="filter-bar">
        <div class="field"><label>Semester</label>
          <select id="attSemFilter">${[1,2,3,4,5,6].map(s => `<option value="${s}"${s == state.filters.attendanceSemester ? " selected" : ""}>Semester ${s}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Subject</label>
          <select id="attSubjectFilter"><option value="">All subjects</option>${attItems.map(i => `<option value="${H(i.subject)}"${i.subject === state.filters.attendanceSubject ? " selected" : ""}>${H(i.subject)}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Month</label><input type="month" id="attMonthFilter" value="${H(state.filters.attendanceMonth || "")}"></div>
        <div class="field"><label>Date</label><input type="date" id="attDateFilter" value="${H(state.filters.attendanceDate || "")}"></div>
        <div class="field"><label>From</label><input type="date" id="attFromDateFilter" value="${H(state.filters.attendanceFromDate || "")}"></div>
        <div class="field"><label>To</label><input type="date" id="attToDateFilter" value="${H(state.filters.attendanceToDate || "")}"></div>
        <div class="field" style="min-width:220px"><label>View</label>
          <div class="tab-bar" id="attViewTabs">
            <button type="button" class="tab-btn ${state.filters.attendanceView === "overall" ? "active" : ""}" data-view="overall">Overall</button>
            <button type="button" class="tab-btn ${state.filters.attendanceView === "daywise" ? "active" : ""}" data-view="daywise">Day-wise</button>
            <button type="button" class="tab-btn ${state.filters.attendanceView === "matrix" ? "active" : ""}" data-view="matrix">Matrix</button>
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" id="applyAttBtn">Apply</button>
          <button class="btn btn-ghost" id="resetAttBtn">Reset</button>
        </div>
      </div>
      <div class="subtle-note" style="margin-top:10px">Exact date isolates one day. From/To lets you review a range without losing semester and subject context.</div>
      <div class="stats-grid" style="margin-bottom:18px">
        ${statCard(`${att.overallPercentage ?? 0}%`, "Overall", "📊", att.overallPercentage >= 75 ? "c-green" : "c-yellow")}
        ${statCard(att.presentTotal ?? 0, "Present", "✅", "c-green")}
        ${statCard(att.absentTotal ?? 0, "Absent", "❌", "c-red")}
        ${statCard(att.lateTotal ?? 0, "Late", "⏰", "c-yellow")}
        ${statCard(att.medicalLeaveTotal ?? 0, "Med. Leave", "🏥", "c-blue")}
      </div>
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Subject-wise Breakdown")}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Subject</th><th>Held</th><th>Attended</th><th>P/A/L/ML</th><th>%</th><th>Status</th></tr></thead>
            <tbody>
              ${attItems.length ? attItems.map(i => `<tr>
                <td><strong>${H(i.subject)}</strong><br><span style="font-size:.74rem;color:var(--muted)">${H(i.code || "")}</span></td>
                <td>${i.delivered}</td><td>${i.attended}</td>
                <td style="font-size:.78rem">${i.presentCount}/${i.absentCount}/${i.lateCount}/${i.medicalLeaveCount}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:50px">${progressBar(i.percentage)}</div>
                    <strong>${i.percentage}%</strong>
                  </div>
                </td>
                <td>${statusBadge(i.percentage >= 75 ? "active" : i.percentage >= 60 ? "pending" : "absent")}</td>
              </tr>`).join("") : tableEmpty(6, "No attendance data")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card card-p">
        ${cardHeader(state.filters.attendanceView === "matrix" ? "Attendance Matrix" : state.filters.attendanceView === "daywise" ? "Day-wise Attendance" : "Session Register")}
        ${state.filters.attendanceView === "matrix" ? `
          <div class="table-wrap">
            <table class="data-table matrix-table">
              <thead><tr><th>Subject</th>${attMatrix.dates.map(date => `<th>${formatShortDate(date)}</th>`).join("")}<th>Total</th></tr></thead>
              <tbody>
                ${attMatrix.rows.length ? attMatrix.rows.map(row => `<tr>
                  <td><strong>${H(row.subject)}</strong><div style="font-size:.72rem;color:var(--muted)">${H(row.code || "")}</div></td>
                  ${row.cells.map(cell => `<td class="matrix-cell">${buildMatrixLabel(cell)}</td>`).join("")}
                  <td><strong>${row.total}/${row.delivered}</strong></td>
                </tr>`).join("") : tableEmpty(Math.max(attMatrix.dates.length + 2, 3), "No matrix records for this filter")}
              </tbody>
            </table>
          </div>
        ` : ""}
        ${state.filters.attendanceView === "daywise" ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${attDaywise.length ? attDaywise.map(day => `<div class="insight-card">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
                <div>
                  <div class="insight-title">${formatLongDate(day.date)}</div>
                  <div class="insight-sub">${day.sessionCount} sessions · P ${day.presentCount} · A ${day.absentCount} · L ${day.lateCount} · ML ${day.medicalLeaveCount}</div>
                </div>
                <div class="badge badge-info">${day.presentCount + day.lateCount + day.medicalLeaveCount}/${day.sessionCount} attended</div>
              </div>
              <div class="mini-list" style="margin-top:10px">
                ${day.sessions.map(s => `<div class="mini-list-item">
                  <span><strong>${H(s.subject)}</strong> <span style="color:var(--muted)">${H(s.code || "")}</span></span>
                  <span>${H(s.start_time || "")}–${H(s.end_time || "")}</span>
                  <span>${statusBadge(s.status)}</span>
                </div>`).join("")}
              </div>
            </div>`).join("") : emptyState("📋", "No day-wise attendance in this range")}
          </div>
        ` : ""}
        <div class="table-wrap ${state.filters.attendanceView === "overall" ? "" : "hidden"}">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Subject</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>
              ${(d.attendanceDetail?.sessions || []).length
                ? (d.attendanceDetail?.sessions || []).slice(0, 30).map(s => `<tr>
                  <td>${formatDate(s.session_date)}</td>
                  <td>${H(s.subject || "")} <span style="font-size:.72rem;color:var(--muted)">${H(s.code || "")}</span></td>
                  <td style="font-size:.78rem;color:var(--muted)">${H(s.start_time || "")}–${H(s.end_time || "")}</td>
                  <td>${statusBadge(s.status)}</td>
                </tr>`).join("")
                : tableEmpty(4, "No session records")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${attItems.length ? `<div class="card card-p">${cardHeader("Attendance Chart")}<div class="chart-wrap"><canvas id="attChartCanvas"></canvas></div></div>` : ""}
  `;

  byId("applyAttBtn")?.addEventListener("click", async () => {
    state.filters.attendanceSemester = Number(byId("attSemFilter").value);
    state.filters.attendanceSubject = byId("attSubjectFilter").value;
    state.filters.attendanceMonth = byId("attMonthFilter").value;
    state.filters.attendanceDate = byId("attDateFilter").value;
    state.filters.attendanceFromDate = byId("attFromDateFilter").value;
    state.filters.attendanceToDate = byId("attToDateFilter").value;
    state.filters.attendanceView = byId("attViewTabs")?.querySelector(".tab-btn.active")?.dataset.view || state.filters.attendanceView;
    persistState(); await loadDashboard();
  });
  byId("attViewTabs")?.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      byId("attViewTabs")?.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.attendanceView = btn.dataset.view;
    });
  });
  byId("resetAttBtn")?.addEventListener("click", async () => {
    state.filters.attendanceSemester = 6; state.filters.attendanceSubject = "";
    state.filters.attendanceMonth = localMonthValue(); state.filters.attendanceDate = "";
    state.filters.attendanceFromDate = ""; state.filters.attendanceToDate = "";
    state.filters.attendanceView = "overall"; persistState(); await loadDashboard();
  });
  if (attItems.length) barChart("attChartCanvas", "attChart", attItems.map(i => i.subject.length > 12 ? i.subject.slice(0, 12) + "…" : i.subject), [{ label: "Attendance %", values: attItems.map(i => i.percentage) }]);

  // ── Timetable ─────────────────────────────────────────────────
  const weekly = d.timetable?.weekly || {};
  const allWeeklySlots = flattenWeeklyTimetable(weekly);
  const groupedStudentTimetable = state.filters.timetableGroup === "course"
    ? groupBy(allWeeklySlots, slot => `${slot.course_code}__${slot.course_name}`)
    : state.filters.timetableGroup === "teacher"
      ? groupBy(allWeeklySlots, slot => slot.teacher || "Faculty")
      : groupBy(allWeeklySlots, slot => slot.day || "Other");
  byId("timetableSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Class Timetable", "Today's schedule by default — change the date to navigate")}
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="ttPrevBtn">← Prev</button>
        <input type="date" id="ttDateInput" value="${H(state.filters.timetableDate)}" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.84rem;font-family:inherit;outline:none">
        <button class="btn btn-ghost btn-sm" id="ttNextBtn">Next →</button>
        <span style="font-size:.84rem;color:var(--muted);margin-left:4px" id="ttDateLabel">${formatLongDate(state.filters.timetableDate)}</span>
        <div class="field" style="min-width:190px"><label>Structured View</label>
          <select id="ttGroupSel">
            <option value="day"${state.filters.timetableGroup === "day" ? " selected" : ""}>Group by day</option>
            <option value="course"${state.filters.timetableGroup === "course" ? " selected" : ""}>Group by course</option>
            <option value="teacher"${state.filters.timetableGroup === "teacher" ? " selected" : ""}>Group by teacher</option>
          </select>
        </div>
      </div>
      ${tItems.length ? `<div style="display:flex;flex-direction:column;gap:8px">
        ${tItems.map(s => `<div class="tt-slot ${s.status === "cancelled" ? "tt-cancelled" : s.status === "updated" ? "tt-updated" : ""}">
          <div class="tt-time">${H(s.start_time || "")}–${H(s.end_time || "")}</div>
          <div class="tt-info">
            <div class="tt-subject">${H(s.course_name || s.subject || "")}</div>
            <div class="tt-meta">${H(s.course_code || "")} · ${H(s.slot_type || "")}</div>
            ${s.status && s.status !== "scheduled" ? `<div style="margin-top:4px">${statusBadge(s.status)}</div>` : ""}
            ${s.note ? `<div style="font-size:.74rem;color:var(--warning);margin-top:3px">📌 ${H(s.note)}</div>` : ""}
          </div>
          <div class="tt-room-badge">📍 ${H(s.room || "—")}</div>
        </div>`).join("")}
      </div>` : emptyState("🌟", "No classes on this day")}
    </div>
    <div class="card card-p">
      ${cardHeader("Weekly Overview")}
      <div class="week-grid">
        ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(day => {
          const slots = weekly[day] || [];
          return `<div class="week-col">
            <div class="week-col-head">${day.slice(0,3)}</div>
            <div class="week-col-body">
              ${slots.length ? slots.map(s => `<div class="week-slot">
                <div class="week-slot-time">${H(s.start_time || "")}–${H(s.end_time || "")}</div>
                <div class="week-slot-name">${H(s.course_name || s.subject || "")}</div>
                <div class="week-slot-room">📍 ${H(s.room || "")}</div>
              </div>`).join("") : `<div class="week-free">Free</div>`}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="card card-p">
      ${cardHeader("Structured Table View", state.filters.timetableGroup === "course" ? "Grouped course-by-course" : state.filters.timetableGroup === "teacher" ? "Grouped teacher-wise" : "Grouped day-wise")}
      <div style="display:flex;flex-direction:column;gap:12px">
        ${Object.entries(groupedStudentTimetable).length ? Object.entries(groupedStudentTimetable).map(([group, slots]) => `<div class="insight-card">
          <div class="insight-title">${H(group.replace("__", " · "))}</div>
          <div class="table-wrap" style="margin-top:10px">
            <table class="data-table compact-table">
              <thead><tr><th>Day</th><th>Course</th><th>Time</th><th>Room</th><th>Faculty</th><th>Status</th></tr></thead>
              <tbody>
                ${slots.map(slot => `<tr>
                  <td>${H(slot.day || "")}</td>
                  <td><strong>${H(slot.course_name || "")}</strong><div style="font-size:.72rem;color:var(--muted)">${H(slot.course_code || "")}</div></td>
                  <td>${H(slot.start_time || "")}–${H(slot.end_time || "")}</td>
                  <td>${H(slot.room || "—")}</td>
                  <td>${H(slot.teacher || "Faculty")}</td>
                  <td>${statusBadge(slot.status || "scheduled")}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>`).join("") : emptyState("🗓", "No timetable entries available")}
      </div>
    </div>
  `;

  byId("ttDateInput")?.addEventListener("change", async e => {
    state.filters.timetableDate = e.target.value;
    if (byId("ttDateLabel")) byId("ttDateLabel").textContent = formatLongDate(state.filters.timetableDate);
    persistState(); await loadDashboard();
  });
  byId("ttGroupSel")?.addEventListener("change", e => {
    state.filters.timetableGroup = e.target.value;
    persistState();
    renderStudent();
    setActiveSection("timetableSection");
  });
  function shiftDate(delta) {
    const d2 = new Date(state.filters.timetableDate); d2.setDate(d2.getDate() + delta);
    state.filters.timetableDate = d2.toISOString().slice(0, 10);
    persistState(); loadDashboard();
  }
  byId("ttPrevBtn")?.addEventListener("click", () => shiftDate(-1));
  byId("ttNextBtn")?.addEventListener("click", () => shiftDate(1));

  // ── Results ───────────────────────────────────────────────────
  const results = d.results || {};
  const summary = results.summary || [];
  byId("resultsSection").innerHTML = `
    <div class="stats-grid">
      ${statCard(p.details?.cgpa ?? "—", "Current CGPA", "🏆", "c-blue")}
      ${statCard(p.details?.rank_position ?? "—", "Class Rank", "🥇", "c-orange")}
      ${statCard(p.details?.earned_credits ?? "—", "Credits Earned", "📚", "c-green", `Out of ${p.details?.total_credits ?? "—"}`)}
      ${statCard(`Semester ${results.semester ?? "—"}`, "Viewing", "🎓", "c-purple", `SGPA ${results.sgpa ?? "—"}`)}
    </div>
    <div class="card card-p">
      ${cardHeader("Academic Results", "Select semester to view detailed scores")}
      <div class="filter-bar">
        <div class="field"><label>Semester</label>
          <select id="resSemFilter">${summary.map(s => `<option value="${s.semester}"${s.semester == state.filters.resultsSemester ? " selected" : ""}>Semester ${s.semester} · ${s.academic_year}</option>`).join("")}</select>
        </div>
        <div class="filter-actions"><button class="btn btn-primary" id="applyResBtn">Load Result</button></div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Subject</th><th>Code</th><th>Assessments</th><th>Total</th><th>Grade</th><th>Points</th><th>Credits</th><th>Teacher Remark</th><th>Result</th></tr></thead>
          <tbody>
            ${results.items?.length ? results.items.map(i => `<tr>
              <td><strong>${H(i.subject)}</strong></td>
              <td><span class="badge badge-neutral">${H(i.code || "")}</span></td>
              <td>
                ${(i.assessments || []).length
                  ? (i.assessments || []).map(a => `<div style="font-size:.74rem;line-height:1.5"><strong>${H(a.examType)}</strong>: ${a.score}/${a.maxScore}</div>`).join("")
                  : `<div style="font-size:.74rem;color:var(--muted)">Internal: ${i.internal_score} · External: ${i.external_score}</div>`}
              </td>
              <td><strong>${i.total_score}</strong></td>
              <td>${gradeBadge(i.grade_letter)}</td>
              <td>${i.grade_point}</td>
              <td>${i.credits}</td>
              <td style="font-size:.76rem;max-width:180px;color:var(--muted)">${H(i.teacher_remark || "—")}</td>
              <td>${statusBadge(i.grade_letter === "F" ? "absent" : "active")}</td>
            </tr>`).join("") : tableEmpty(9, summary.length ? "No results for this semester yet" : "No semester data available")}
          </tbody>
        </table>
      </div>
      ${results.sgpa ? `<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;background:var(--success-bg);border-radius:var(--r-md)">
        <span style="font-weight:700;color:var(--success)">SGPA: ${results.sgpa}</span>
        <span style="color:var(--muted)">Credits: ${results.credits_earned}/${results.credits_registered}</span>
        <span style="color:var(--muted)">Rank: #${results.rank_position}</span>
      </div>` : ""}
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Semester History")}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Sem</th><th>Year</th><th>SGPA</th><th>CGPA</th><th>Credits</th><th>Rank</th></tr></thead>
            <tbody>
              ${summary.length ? summary.map(s => `<tr>
                <td><strong>Sem ${s.semester}</strong></td><td>${H(s.academic_year)}</td>
                <td><strong>${s.sgpa}</strong></td><td>${s.cgpa}</td>
                <td>${s.credits_earned}/${s.credits_registered}</td>
                <td>#${s.rank_position}</td>
              </tr>`).join("") : tableEmpty(6, "No semester history")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card card-p">
        ${cardHeader("Performance Trend")}
        <div class="chart-wrap"><canvas id="perfTrendChart"></canvas></div>
      </div>
    </div>
  `;
  byId("applyResBtn")?.addEventListener("click", async () => {
    state.filters.resultsSemester = Number(byId("resSemFilter").value);
    persistState(); await loadDashboard();
  });
  lineChart("perfTrendChart", "perfTrend", summary.map(s => `S${s.semester}`), [{ label: "SGPA", values: summary.map(s => s.sgpa) }, { label: "CGPA", values: summary.map(s => s.cgpa) }]);

  // ── Assignments ───────────────────────────────────────────────
  const allAssign = d.assignments || [];
  const submittedAsgn = allAssign.filter(a => a.submission_status === "submitted" || a.submission_status === "graded");

  function renderAssignList(list) {
    if (!list.length) return emptyState("📭", "No assignments here");
    return list.map(a => `
      <div class="assignment-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div>
            <div class="assignment-title">${H(a.title)}</div>
            <div class="assignment-course">${H(a.subject || a.course_name || "")}</div>
          </div>
          <span class="deadline-chip ${deadlineClass(a.due_date)}">${deadlineLabel(a.due_date)}</span>
        </div>
        <div class="assignment-desc">${H(a.description || "")}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">
          ${statusBadge(a.submission_status)}
          ${a.score != null ? `<span class="badge badge-info">Score: ${a.score}/${a.max_score}</span>` : `<span class="badge badge-neutral">Max: ${a.max_score} marks</span>`}
          ${a.attachment_name ? `<button class="btn btn-info btn-xs" data-action="download-assignment-file" data-assignment-id="${a.id}" data-assignment-file="${H(a.attachment_name)}">📥 Teacher File</button>` : ""}
          ${a.submission_attachment_name ? `<span class="badge badge-info">📎 ${H(a.submission_attachment_name)}</span>` : ""}
          <div style="margin-left:auto;display:flex;gap:6px">
            <button class="btn btn-${a.submission_status === "submitted" || a.submission_status === "graded" ? "ghost" : "primary"} btn-sm"
              data-action="${(daysUntil(a.due_date) < 0 && a.submission_status !== "graded") ? "assignment-overdue-info" : (a.submission_status === "submitted" || a.submission_status === "graded" ? "edit-assignment-submission" : "submit-assignment")}"
              data-assignment-id="${a.id}" data-assignment-title="${H(a.title)}"
              data-assignment-note="${H(a.submission_text || a.feedback || "")}"
              data-assignment-file="${H(a.file_name || "")}"
              data-assignment-desc="${H(a.description || "")}"
              data-assignment-due="${H(a.due_date || "")}"
              data-assignment-course="${H(a.subject || a.course_name || "")}">
              ${(daysUntil(a.due_date) < 0 && a.submission_status !== "graded") ? "Locked" : (a.submission_status === "submitted" || a.submission_status === "graded" ? "Update" : "Submit")}
            </button>
            ${a.submission_status === "submitted" && daysUntil(a.due_date) >= 0 ? `<button class="btn btn-ghost btn-sm" data-action="delete-assignment-submission" data-assignment-id="${a.id}">Remove</button>` : ""}
          </div>
        </div>
        ${a.feedback ? `<div style="margin-top:8px;padding:8px 10px;background:var(--info-bg);border-radius:var(--r-sm);font-size:.8rem"><strong>Feedback:</strong> ${H(a.feedback)}</div>` : ""}
      </div>`).join("");
  }

  byId("assignmentsSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Assignments & Deadlines", "Submit work, track deadlines, and manage submissions")}
      <div class="tab-bar" id="assignTabBar" style="margin-bottom:16px">
        <button class="tab-btn active" data-tab="pending">Pending (${pending.length})</button>
        <button class="tab-btn" data-tab="submitted">Submitted (${submittedAsgn.length})</button>
        <button class="tab-btn" data-tab="all">All (${allAssign.length})</button>
      </div>
      <div id="assignListContainer">
        <div style="display:flex;flex-direction:column;gap:10px">${renderAssignList(pending)}</div>
      </div>
    </div>
  `;

  byId("assignTabBar")?.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      byId("assignTabBar").querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      const list = tab === "pending" ? pending : tab === "submitted" ? submittedAsgn : allAssign;
      byId("assignListContainer").innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">${renderAssignList(list)}</div>`;
    });
  });

  // ── Campus Desk ───────────────────────────────────────────────
  const library = d.library || [];
  const notices = d.notices || [];
  const studyMaterials = d.studyMaterials || d.study_materials || [];
  const examSchedule = d.examSchedule || d.exam_schedule || [];

  byId("campusDeskSection").innerHTML = `
    <div class="tab-bar" id="cdTabBar" style="margin-bottom:16px">
      <button class="tab-btn active" data-tab="library">Library (${library.length})</button>
      <button class="tab-btn" data-tab="notices">Notices (${notices.length})</button>
      ${examSchedule.length ? `<button class="tab-btn" data-tab="exams">Exams (${examSchedule.length})</button>` : ""}
      ${studyMaterials.length ? `<button class="tab-btn" data-tab="materials">Study Material</button>` : ""}
    </div>

    <div id="cdLibraryPane">
      <div class="card card-p">
        ${cardHeader("My Library Books", "Borrowed books and renewal status")}
        ${library.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Book Title</th><th>Author</th><th>ISBN</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th>Fine</th><th>Action</th></tr></thead>
          <tbody>
            ${library.map(l => `<tr>
              <td><strong>${H(l.title || l.book_title || "")}</strong></td>
              <td>${H(l.author || "")}</td>
              <td><span style="font-size:.74rem;color:var(--muted)">${H(l.isbn || "")}</span></td>
              <td>${formatDate(l.issue_date)}</td>
              <td>${formatDate(l.due_date)}</td>
              <td>${statusBadge(l.status)}</td>
              <td>${l.fine_amount > 0 ? `<span style="color:var(--danger);font-weight:700">${formatCurrency(l.fine_amount)}</span>` : "—"}</td>
              <td>${l.status === "issued" || l.status === "overdue" ? `<button class="btn btn-primary btn-sm" data-action="renew-loan" data-loan-id="${l.id}">Renew</button>` : `<span class="badge badge-neutral">${H(titleize(l.status))}</span>`}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>` : emptyState("📚", "No borrowed books", "Visit the library to borrow books")}
      </div>
    </div>

    <div id="cdNoticesPane" class="hidden">
      <div class="card card-p">
        ${cardHeader("Notice Board", "Campus-wide announcements")}
        <div style="display:flex;flex-direction:column;gap:10px">
          ${notices.length ? notices.map(n => `<div class="notice-card nc-${n.priority || "medium"}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
              <div><div class="notice-title">${H(n.title)}</div><div class="notice-meta">By ${H(n.published_by || "")} · ${formatDate(n.created_at)} · ${H(titleize(n.audience || ""))}</div></div>
              ${statusBadge(n.priority || "medium")}
            </div>
            <div class="notice-body">${H(n.message)}</div>
          </div>`).join("") : emptyState("📭", "No notices posted")}
        </div>
      </div>
    </div>

    <div id="cdExamsPane" class="hidden">
      <div class="card card-p">
        ${cardHeader("Exam Schedule")}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Subject</th><th>Exam Type</th><th>Date</th><th>Time</th><th>Venue</th><th>Max Marks</th></tr></thead>
          <tbody>
            ${examSchedule.length ? examSchedule.map(e => `<tr>
              <td><strong>${H(e.subject || e.course_name || "")}</strong></td>
              <td>${statusBadge(e.exam_type || e.type || "exam")}</td>
              <td>${formatDate(e.exam_date || e.date)}</td>
              <td>${H(e.start_time || "")}${e.end_time ? `–${H(e.end_time)}` : ""}</td>
              <td>${H(e.venue || e.room || "—")}</td>
              <td>${e.max_marks || e.max_score || "—"}</td>
            </tr>`).join("") : tableEmpty(6, "No exam schedule")}
          </tbody>
        </table></div>
      </div>
    </div>

    <div id="cdMaterialsPane" class="hidden">
      <div class="card card-p">
        ${cardHeader("Study Materials")}
        ${studyMaterials.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Title</th><th>Subject</th><th>Type</th><th>Uploaded By</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>
            ${studyMaterials.map(m => `<tr>
              <td><strong>${H(m.title)}</strong></td>
              <td>${H(m.course_name || m.subject || "")}</td>
              <td>${statusBadge(m.material_type || "notes")}</td>
              <td>${H(m.teacher_name || m.uploaded_by || "Faculty")}</td>
              <td>${formatDate(m.created_at)}</td>
              <td>
                ${m.external_url ? `<a href="${H(m.external_url)}" target="_blank" class="btn btn-info btn-xs">Open Link</a>` : ""}
                ${m.attachment_name ? `<button class="btn btn-info btn-xs" data-action="download-study-material" data-material-id="${m.id}" data-material-file="${H(m.attachment_name)}">Download</button>` : (!m.external_url ? "—" : "")}
              </td>
            </tr>`).join("")}
          </tbody>
        </table></div>` : emptyState("📖", "No study materials yet")}
      </div>
    </div>
  `;

  // Tab switching for Campus Desk
  byId("cdTabBar")?.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      byId("cdTabBar").querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      ["cdLibraryPane","cdNoticesPane","cdExamsPane","cdMaterialsPane"].forEach(id => byId(id)?.classList.add("hidden"));
      const paneId = btn.dataset.tab === "library" ? "cdLibraryPane" : btn.dataset.tab === "notices" ? "cdNoticesPane" : btn.dataset.tab === "exams" ? "cdExamsPane" : "cdMaterialsPane";
      byId(paneId)?.classList.remove("hidden");
    });
  });

  // ── Career & Fees ─────────────────────────────────────────────
  const placements = d.placements || [];
  const scholarships = d.fees?.scholarships || [];

  byId("careerSection").innerHTML = `
    <div class="tab-bar" id="cfTabBar" style="margin-bottom:16px">
      <button class="tab-btn active" data-tab="fees">Fees & Finance</button>
      <button class="tab-btn" data-tab="placements">Placement Drives</button>
    </div>

    <div id="cfFeesPane">
      ${scholarships.length ? `<div class="card card-p" style="margin-bottom:14px">
        ${cardHeader("Scholarships & Awards")}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Scholarship</th><th>Amount</th><th>Status</th><th>Disbursed</th></tr></thead>
          <tbody>
            ${scholarships.map(s => `<tr>
              <td><strong>${H(s.name)}</strong></td>
              <td>${formatCurrency(s.amount)}</td>
              <td>${statusBadge(s.status)}</td>
              <td>${s.disbursed_at ? formatDate(s.disbursed_at) : "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>` : ""}
      <div class="card card-p">
        ${cardHeader("Fee Ledger", "Track and pay outstanding fees", pendingFees.length ? `<button class="btn btn-primary btn-sm" data-action="open-payment-gateway">💳 Pay All Pending</button>` : "")}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th><input type="checkbox" id="feeSelectAll"></th><th>Fee Head</th><th>Term</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid On</th><th>Action</th></tr></thead>
          <tbody>
            ${fees.length ? fees.map(f => `<tr>
              <td>${f.status === "pending" || f.status === "overdue" ? `<input type="checkbox" class="fee-chk" value="${f.id}">` : ""}</td>
              <td><strong>${H(f.fee_head)}</strong></td>
              <td>${H(f.term_label)}</td>
              <td><strong>${formatCurrency(f.amount)}</strong></td>
              <td>${formatDate(f.due_date)}</td>
              <td><span style="font-weight:700;color:var(--${f.status === "paid" ? "success" : f.status === "overdue" ? "danger" : "warning"})">${H(titleize(f.status))}</span></td>
              <td style="font-size:.8rem;color:var(--muted)">${f.paid_at ? formatDate(f.paid_at) : "—"}</td>
              <td>${f.status === "pending" || f.status === "overdue" ? `<button class="btn btn-primary btn-sm" data-action="pay-single-fee" data-fee-id="${f.id}" data-fee-amount="${f.amount}" data-fee-head="${H(f.fee_head)}">Pay</button>` : ""}</td>
            </tr>`).join("") : tableEmpty(8, "No fee records")}
          </tbody>
        </table></div>
        ${pendingFees.length ? `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px">
          <button class="btn btn-ghost btn-sm" id="paySelectedBtn">Pay Selected</button>
        </div>` : ""}
      </div>
    </div>

    <div id="cfPlacementsPane" class="hidden">
      <div class="card card-p">
        ${cardHeader("Placement Drives", "Apply to open campus recruitment drives")}
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Company</th><th>Role</th><th>Package</th><th>Drive Date</th><th>Location</th><th>Min CGPA</th><th>Status</th><th>My Status</th><th>Action</th></tr></thead>
          <tbody>
            ${placements.length ? placements.map(pl => `<tr>
              <td><strong>${H(pl.company)}</strong></td>
              <td>${H(pl.role)}</td>
              <td><strong>₹${pl.package_lpa} LPA</strong></td>
              <td>${formatDate(pl.drive_date)}</td>
              <td>${H(pl.location || "—")}</td>
              <td><span class="badge badge-neutral">${pl.min_cgpa}+</span></td>
              <td>${statusBadge(pl.status)}</td>
              <td>${pl.application_status ? statusBadge(pl.application_status) : `<span class="badge badge-neutral">Not applied</span>`}</td>
              <td>
                ${pl.application_status
                  ? `<button class="btn btn-ghost btn-sm" data-action="view-placement-app" data-company="${H(pl.company)}" data-role="${H(pl.role)}" data-package="${pl.package_lpa}" data-drive="${H(pl.drive_date)}" data-status="${H(pl.application_status)}" data-resume="${H(pl.resume_link || "")}" data-cover="${H(pl.cover_letter || "")}">View</button>`
                  : pl.status === "open"
                    ? `<button class="btn btn-primary btn-sm" data-action="apply-placement" data-placement-id="${pl.id}" data-company="${H(pl.company)}">Apply</button>`
                    : `<span class="badge badge-neutral">Closed</span>`}
              </td>
            </tr>`).join("") : tableEmpty(9, "No placement drives available")}
          </tbody>
        </table></div>
      </div>
    </div>
  `;

  byId("cfTabBar")?.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      byId("cfTabBar").querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      byId("cfFeesPane")?.classList.toggle("hidden", btn.dataset.tab !== "fees");
      byId("cfPlacementsPane")?.classList.toggle("hidden", btn.dataset.tab !== "placements");
    });
  });

  byId("feeSelectAll")?.addEventListener("change", e => qsa(".fee-chk").forEach(cb => { cb.checked = e.target.checked; }));

  byId("paySelectedBtn")?.addEventListener("click", () => {
    const ids = qsa(".fee-chk:checked").map(cb => Number(cb.value));
    if (!ids.length) { showToast("Select at least one fee to pay", "warning"); return; }
    openPaymentGateway(ids, fees);
  });

  // ── Requests ──────────────────────────────────────────────────
  const requests = d.requests || [];
  const grievances = d.grievances || [];

  byId("requestsSection").innerHTML = `
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Submit Leave Request", "Medical leave or absence request with document upload")}
        <form id="leaveRequestForm">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>Request Type</label>
              <select id="reqType" name="requestType">
                <option value="medical_leave">Medical Leave</option>
                <option value="absence">Academic / Placement Absence</option>
              </select>
            </div>
            <div class="form-grid">
              <div class="field"><label>From Date</label><input type="date" name="fromDate" required></div>
              <div class="field"><label>To Date</label><input type="date" name="toDate" required></div>
            </div>
            <div class="field"><label>Reason</label><textarea name="reason" rows="3" placeholder="Explain the reason…" required></textarea></div>
            <div class="field"><label>Supporting Document</label>
              ${fileZone("reqDocFile", ".pdf,.jpg,.png,.doc,.docx", "Upload medical certificate / supporting doc")}
              <input type="hidden" name="attachmentName" id="reqAttachmentName">
            </div>
            <button type="submit" class="btn btn-primary">Submit Request</button>
          </div>
        </form>
      </div>
      <div class="card card-p">
        ${cardHeader("Raise a Grievance", "Send issues to the admin queue")}
        <form id="studentGrievanceForm">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>Category</label>
              <select name="category"><option>Academic</option><option>Fees</option><option>Examination</option><option>Library</option><option>Hostel</option><option>Other</option></select>
            </div>
            <div class="field"><label>Subject</label><input name="subject" placeholder="Brief subject line" required></div>
            <div class="field"><label>Message</label><textarea name="message" rows="4" placeholder="Describe in detail…" required></textarea></div>
            <div class="field"><label>Priority</label>
              <select name="priority"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select>
            </div>
            <button type="submit" class="btn btn-secondary">Submit Grievance</button>
          </div>
        </form>
      </div>
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Request History", `${requests.length} requests`)}
        ${requests.length ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${requests.map(r => `<div style="padding:12px;border:1px solid var(--border);border-radius:var(--r-md)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
              <strong style="font-size:.88rem">${H(titleize(r.request_type))}</strong>
              ${statusBadge(r.status)}
            </div>
            <div style="font-size:.8rem;color:var(--muted)">${formatDate(r.from_date)} – ${formatDate(r.to_date)}</div>
            <div style="font-size:.82rem;margin-top:4px">${H(r.reason)}</div>
            ${r.attachment_name ? `<div style="margin-top:5px;font-size:.76rem;color:var(--info)">📎 ${H(r.attachment_name)}</div>` : ""}
            ${r.reviewed_at ? `<div style="margin-top:4px;font-size:.74rem;color:var(--muted)">Reviewed: ${formatDateTime(r.reviewed_at)}</div>` : ""}
          </div>`).join("")}
        </div>` : emptyState("📬", "No requests filed yet")}
      </div>
      <div class="card card-p">
        ${cardHeader("Grievance History", `${grievances.length} grievances`)}
        ${grievances.length ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${grievances.map(g => `<div style="padding:12px;border:1px solid var(--border);border-radius:var(--r-md)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
              <strong style="font-size:.88rem">${H(g.subject)}</strong>
              ${statusBadge(g.status)}
            </div>
            <div style="font-size:.8rem;color:var(--muted)">${H(g.category)} · ${formatDate(g.created_at)}</div>
            <div style="font-size:.82rem;margin-top:4px">${H(g.message)}</div>
            ${g.resolution_note ? `<div style="margin-top:8px;padding:8px 10px;background:var(--success-bg);border-radius:var(--r-sm);font-size:.8rem;color:var(--success)">✓ ${H(g.resolution_note)}</div>` : ""}
          </div>`).join("")}
        </div>` : emptyState("🕊", "No grievances filed")}
      </div>
    </div>
  `;

  // Bind file zone for request
  bindFileZone("reqDocFile");
  byId("reqDocFile")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (f && byId("reqAttachmentName")) byId("reqAttachmentName").value = f.name;
  });

  // Profile section
  byId("profileSection").innerHTML = profilePanel(p);
}

// ── Payment Gateway ───────────────────────────────────────────
function openPaymentGateway(feeIds, fees) {
  const total = feeIds.reduce((sum, id) => sum + (fees.find(f => f.id === id)?.amount || 0), 0);
  openModal({
    title: "Fee Payment",
    width: "560px",
    body: `
      <div class="payment-summary">
        <div class="payment-summary-label">Total Amount Due</div>
        <div class="payment-summary-amount">${formatCurrency(total)}</div>
        <div style="font-size:.78rem;opacity:.65;margin-top:4px">${feeIds.length} fee item${feeIds.length > 1 ? "s" : ""} selected</div>
      </div>
      <div class="modal-section-title">Select Payment Method</div>
      <div class="pay-method-grid" id="payMethodGrid">
        <div class="pay-method selected" data-method="upi"><div class="pay-method-icon">📱</div><div class="pay-method-label">UPI</div></div>
        <div class="pay-method" data-method="netbanking"><div class="pay-method-icon">🏦</div><div class="pay-method-label">Net Banking</div></div>
        <div class="pay-method" data-method="card"><div class="pay-method-icon">💳</div><div class="pay-method-label">Debit/Credit Card</div></div>
      </div>
      <div id="upiInput" class="field" style="margin-bottom:12px">
        <label>UPI ID</label>
        <div style="position:relative">
          <input id="upiIdField" placeholder="yourname@upi" style="padding-right:80px">
          <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:.72rem;font-weight:700;color:var(--muted)">@upi</span>
        </div>
      </div>
      <div id="netbankingInput" class="field hidden" style="margin-bottom:12px">
        <label>Select Bank</label>
        <select><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Punjab National Bank</option><option>Bank of Baroda</option><option>Axis Bank</option></select>
      </div>
      <div id="cardInput" class="hidden">
        <div class="form-grid" style="margin-bottom:10px">
          <div class="field form-full"><label>Card Number</label><input placeholder="1234 5678 9012 3456" maxlength="19"></div>
        </div>
        <div class="form-grid" style="margin-bottom:0">
          <div class="field"><label>Expiry</label><input placeholder="MM/YY" maxlength="5"></div>
          <div class="field"><label>CVV</label><input placeholder="•••" maxlength="3" type="password"></div>
        </div>
      </div>
      <div style="font-size:.74rem;color:var(--muted);margin-top:12px">🔒 Payments are processed securely. Transaction details are recorded for audit.</div>`,
    confirmLabel: "Pay Now",
    onConfirm: async (close) => {
      await window.Api.payFees(feeIds);
      close();
      showToast(`Payment of ${formatCurrency(total)} processed successfully!`, "success");
      await loadDashboard();
    },
  });

  // Method switching
  setTimeout(() => {
    qs("#payMethodGrid")?.querySelectorAll(".pay-method").forEach(m => {
      m.addEventListener("click", () => {
        qs("#payMethodGrid").querySelectorAll(".pay-method").forEach(x => x.classList.remove("selected"));
        m.classList.add("selected");
        byId("upiInput")?.classList.toggle("hidden", m.dataset.method !== "upi");
        byId("netbankingInput")?.classList.toggle("hidden", m.dataset.method !== "netbanking");
        byId("cardInput")?.classList.toggle("hidden", m.dataset.method !== "card");
      });
    });
  }, 50);
}

// ═══════════════════════════════════════════════════════════════
//  TEACHER SECTIONS
// ═══════════════════════════════════════════════════════════════

function renderTeacher() {
  const d = state.dashboard;
  const p = d.profile;
  const courses = d.courses || [];
  const roster = d.roster || [];

  // Sanitize filters
  const courseIds = courses.map(c => c.id);
  if (!courseIds.includes(Number(state.filters.attendanceCourseId))) state.filters.attendanceCourseId = courseIds[0] || null;
  if (!courseIds.includes(Number(state.filters.marksCourseId))) state.filters.marksCourseId = courseIds[0] || null;

  const todayName = new Date(state.filters.teacherDate).toLocaleDateString("en-IN", { weekday: "long" });
  const todaySlots = (d.timetable || []).filter(s => s.day_of_week === todayName);
  const assignments = d.assignments || [];

  // ── Teacher Home ──────────────────────────────────────────────
  byId("overviewSection").innerHTML = `
    <div class="stats-grid">
      ${statCard(courses.length, "My Courses", "📚", "c-blue", "This semester", "attendanceSection")}
      ${statCard(d.kpis?.students ?? roster.length, "Total Students", "👥", "c-green", "Across sections", "rosterSection")}
      ${statCard(`${d.kpis?.avgAttendance ?? 0}%`, "Avg Attendance", "📋", "c-orange", "Marked sessions", "attendanceSection")}
      ${statCard(assignments.filter(a => a.status === "open").length, "Active Assignments", "📝", "c-yellow", `${assignments.length} total`, "assignmentsSection")}
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Today's Teaching Schedule", formatLongDate(state.filters.teacherDate), `<button class="btn btn-ghost btn-sm" data-jump="timetableSection">Full view →</button>`)}
        ${todaySlots.length ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${todaySlots.map(s => `<div class="tt-slot ${s.status === "cancelled" ? "tt-cancelled" : s.status === "updated" ? "tt-updated" : ""}">
            <div class="tt-time">${H(s.start_time)}–${H(s.end_time)}</div>
            <div class="tt-info">
              <div class="tt-subject">${H(s.subject || s.course_name || "")}</div>
              <div class="tt-meta">Section ${H(s.section || "")} · ${H(s.slot_type || "")}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
              <div class="tt-room-badge">📍 ${H(s.room || "—")}</div>
              ${s.status && s.status !== "scheduled" ? statusBadge(s.status) : ""}
            </div>
          </div>`).join("")}
        </div>` : emptyState("🌟", "No classes scheduled today")}
      </div>
      <div class="card card-p">
        ${cardHeader("Class Performance", "Average scores by course")}
        <div class="chart-wrap"><canvas id="teacherPerfChart"></canvas></div>
      </div>
    </div>
    <div class="card card-p">
      <div class="card-title" style="margin-bottom:14px">Quick Actions</div>
      <div class="shortcut-grid">
        ${[["📋","Mark Attendance","attendanceSection"],["📊","Enter Marks","marksSection"],["📝","Assignments","assignmentsSection"],["👥","Roster","rosterSection"],["🗓","Timetable","timetableSection"],["📢","Post Notice","announcementsSection"],["👤","Profile","profileSection"]].map(([icon, label, target]) => `<button class="shortcut-tile" data-jump="${target}"><div class="shortcut-icon">${icon}</div><div class="shortcut-label">${label}</div></button>`).join("")}
      </div>
    </div>
  `;
  if (d.chart?.labels?.length) barChart("teacherPerfChart", "teacherPerf", d.chart.labels, [{ label: "Avg Score", values: d.chart.values }]);

  // ── Attendance ────────────────────────────────────────────────
  const attCourse = courses.find(c => c.id === Number(state.filters.attendanceCourseId)) || courses[0];
  const attRoster = roster.filter(s => s.section === attCourse?.section);
  const history = Array.isArray(d.attendanceHistory) ? d.attendanceHistory : [];
  const historyDates = [...new Set(history.map(item => item.session_date))].sort();
  const historyMatrixRows = Object.values(groupBy(history, item => item.course_code || item.course_name || "Course")).map(group => ({
    label: group[0]?.course_code || group[0]?.course_name || "Course",
    title: group[0]?.course_name || "Course",
    section: group[0]?.section || "",
    cells: historyDates.map(sessionDate => group.find(item => item.session_date === sessionDate) || null),
  }));

  byId("attendanceSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Mark Attendance", "Click buttons to mark each student's status")}
      <form id="teacherAttendanceForm">
        <div class="filter-bar">
          <div class="field"><label>Course</label>
            <select id="teacherAttCourse" name="courseId">
              ${courses.map(c => `<option value="${c.id}"${c.id === attCourse?.id ? " selected" : ""}>${H(c.code)} – ${H(c.name)} (Sec ${H(c.section)})</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Date</label><input type="date" name="date" value="${H(state.filters.teacherDate)}" id="attDateInput"></div>
          <div class="filter-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="markAllPresentBtn">✓ All Present</button>
            <button type="button" class="btn btn-ghost btn-sm" id="markAllAbsentBtn">✕ All Absent</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Student</th><th>Roll No.</th><th>Mark Attendance</th><th>Remark</th></tr></thead>
            <tbody>
              ${attRoster.length ? attRoster.map((s, i) => `<tr>
                <td style="color:var(--muted)">${i + 1}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="avatar av-sm">${initials(s.name)}</div>
                    <div><strong>${H(s.name)}</strong><div style="font-size:.74rem;color:var(--muted)">${H(s.email || "")}</div></div>
                  </div>
                </td>
                <td><span class="badge badge-neutral">${H(s.roll_no || s.rollNo || "")}</span></td>
                <td>
                  <div class="att-btn-group" data-student="${s.id}">
                    <button type="button" class="att-btn sel-present" data-val="present">P</button>
                    <button type="button" class="att-btn" data-val="late">L</button>
                    <button type="button" class="att-btn" data-val="absent">A</button>
                    <button type="button" class="att-btn" data-val="medical_leave">ML</button>
                  </div>
                </td>
                <td><input name="remark-${s.id}" placeholder="Optional remark" style="border:1.5px solid var(--border);border-radius:var(--r-sm);padding:5px 9px;font-size:.8rem;width:140px;outline:none"></td>
              </tr>`).join("") : tableEmpty(5, "No students in this section")}
            </tbody>
          </table>
        </div>
        ${attRoster.length ? `<div style="display:flex;align-items:center;gap:12px;margin-top:14px">
          <button type="submit" class="btn btn-primary">Save Attendance</button>
          <span style="font-size:.82rem;color:var(--muted)">${attRoster.length} students</span>
        </div>` : ""}
      </form>
    </div>
    <div class="card card-p">
      ${cardHeader("Attendance Register", "Structured register with exact-date and range filters", `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="field"><input type="date" id="histDateFilter" value="${H(state.filters.teacherHistoryDate || "")}" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.8rem;outline:none"></div>
        <div class="field"><input type="date" id="histFromDateFilter" value="${H(state.filters.teacherHistoryFromDate || "")}" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.8rem;outline:none"></div>
        <div class="field"><input type="date" id="histToDateFilter" value="${H(state.filters.teacherHistoryToDate || "")}" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--r-sm);font-size:.8rem;outline:none"></div>
      </div>`)}
      <div class="tab-bar" id="teacherAttendanceViewTabs" style="margin-bottom:12px">
        <button type="button" class="tab-btn ${state.filters.teacherAttendanceView === "register" ? "active" : ""}" data-view="register">Register</button>
        <button type="button" class="tab-btn ${state.filters.teacherAttendanceView === "matrix" ? "active" : ""}" data-view="matrix">Matrix</button>
      </div>
      ${state.filters.teacherAttendanceView === "matrix" ? `
        <div class="table-wrap">
          <table class="data-table matrix-table">
            <thead><tr><th>Course</th>${historyDates.map(date => `<th>${formatShortDate(date)}</th>`).join("")}</tr></thead>
            <tbody>
              ${historyMatrixRows.length ? historyMatrixRows.map(row => `<tr>
                <td><strong>${H(row.label)}</strong><div style="font-size:.72rem;color:var(--muted)">${H(row.title)} · Sec ${H(row.section || "—")}</div></td>
                ${row.cells.map(cell => `<td class="matrix-cell">${cell ? `P${cell.present_count || 0} · A${cell.absent_count || 0} · L${cell.late_count || 0}` : "—"}</td>`).join("")}
              </tr>`).join("") : tableEmpty(Math.max(historyDates.length + 1, 3), "No attendance history")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Course</th><th>Section</th><th>Present</th><th>Absent</th><th>Late</th><th>ML</th></tr></thead>
            <tbody>
              ${history.length ? history.slice(0, 24).map(h => `<tr>
                <td>${formatDate(h.session_date)}</td>
                <td><strong>${H(h.course_name || "")}</strong><div style="font-size:.72rem;color:var(--muted)">${H(h.course_code || "")}</div></td>
                <td>${H(h.section || "")}</td>
                <td><span style="color:var(--success);font-weight:700">${h.present_count || 0}</span></td>
                <td><span style="color:var(--danger);font-weight:700">${h.absent_count || 0}</span></td>
                <td><span style="color:var(--warning);font-weight:700">${h.late_count || 0}</span></td>
                <td>${h.medical_leave_count || 0}</td>
              </tr>`).join("") : tableEmpty(7, "No attendance history")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // Bind attendance section events
  async function loadAttendancePreload() {
    const courseId = Number(byId("teacherAttCourse")?.value || state.filters.attendanceCourseId);
    const date = byId("attDateInput")?.value || state.filters.teacherDate;
    if (!courseId || !date) return;
    try {
      const data = await window.Api.getAttendanceSession(courseId, date);
      if (!data.exists) return;
      const recordMap = {};
      const remarkMap = {};
      (data.records || []).forEach(r => { recordMap[r.student_id] = r.status; remarkMap[r.student_id] = r.remark || ""; });
      byId("attendanceSection")?.querySelectorAll(".att-btn-group").forEach(group => {
        const studentId = Number(group.dataset.student);
        const status = recordMap[studentId];
        if (status) {
          group.querySelectorAll(".att-btn").forEach(b => { b.className = "att-btn"; });
          const match = group.querySelector(`[data-val="${status}"]`);
          if (match) match.className = `att-btn sel-${status}`;
        }
        const remarkInput = byId("attendanceSection")?.querySelector(`[name="remark-${studentId}"]`);
        if (remarkInput && remarkMap[studentId]) remarkInput.value = remarkMap[studentId];
      });
    } catch { /* silent — new date, no existing record */ }
  }

  byId("teacherAttCourse")?.addEventListener("change", e => {
    state.filters.attendanceCourseId = Number(e.target.value);
    persistState(); renderTeacher();
  });
  byId("attDateInput")?.addEventListener("change", e => {
    state.filters.teacherDate = e.target.value;
    persistState();
    loadAttendancePreload();
  });
  byId("histDateFilter")?.addEventListener("change", e => {
    state.filters.teacherHistoryDate = e.target.value;
    persistState(); loadDashboard();
  });
  byId("histFromDateFilter")?.addEventListener("change", e => {
    state.filters.teacherHistoryFromDate = e.target.value;
    persistState(); loadDashboard();
  });
  byId("histToDateFilter")?.addEventListener("change", e => {
    state.filters.teacherHistoryToDate = e.target.value;
    persistState(); loadDashboard();
  });
  byId("teacherAttendanceViewTabs")?.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      byId("teacherAttendanceViewTabs")?.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.teacherAttendanceView = btn.dataset.view;
      persistState();
      renderTeacher();
      setActiveSection("attendanceSection");
    });
  });

  // Load preexisting attendance for initial date+course on render
  loadAttendancePreload();

  // Att btn toggle
  byId("attendanceSection")?.querySelectorAll(".att-btn-group").forEach(group => {
    group.querySelectorAll(".att-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".att-btn").forEach(b => { b.className = `att-btn`; });
        btn.className = `att-btn sel-${btn.dataset.val}`;
      });
    });
  });
  byId("markAllPresentBtn")?.addEventListener("click", () => { byId("attendanceSection").querySelectorAll(".att-btn-group").forEach(g => { g.querySelectorAll(".att-btn").forEach(b => b.className = "att-btn"); g.querySelector("[data-val='present']").className = "att-btn sel-present"; }); });
  byId("markAllAbsentBtn")?.addEventListener("click", () => { byId("attendanceSection").querySelectorAll(".att-btn-group").forEach(g => { g.querySelectorAll(".att-btn").forEach(b => b.className = "att-btn"); g.querySelector("[data-val='absent']").className = "att-btn sel-absent"; }); });

  // ── Marks ─────────────────────────────────────────────────────
  const marksCourse = courses.find(c => c.id === Number(state.filters.marksCourseId)) || courses[0];
  const marksRoster = roster.filter(s => s.section === marksCourse?.section);

  byId("marksSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Marks Entry", "Publish assessment scores for your classes")}
      <form id="teacherMarksForm">
        <div class="filter-bar">
          <div class="field"><label>Course</label>
            <select name="courseId" id="marksCourseSel">
              ${courses.map(c => `<option value="${c.id}"${c.id === marksCourse?.id ? " selected" : ""}>${H(c.code)} – ${H(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Exam Type</label>
            <select name="examType" id="examTypeSel">
              ${STANDARD_EXAM_TYPES.map(type => `<option${type === state.filters.marksExamType ? " selected" : ""}>${type}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Max Score (Admin Controlled)</label><input type="number" name="maxScore" value="50" min="1" max="200" id="maxScoreInput" style="width:120px" readonly></div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Student</th><th>Roll No.</th><th>Score (Max: <span id="maxScoreLabel">50</span>)</th><th>Remark</th></tr></thead>
            <tbody>
              ${marksRoster.length ? marksRoster.map((s, i) => `<tr>
                <td style="color:var(--muted)">${i + 1}</td>
                <td><div style="display:flex;align-items:center;gap:8px"><div class="avatar av-sm">${initials(s.name)}</div><strong>${H(s.name)}</strong></div></td>
                <td>${H(s.roll_no || s.rollNo || "")}</td>
                <td><input type="number" name="score-${s.id}" min="0" max="200" value="0" style="width:80px;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:6px 10px;font-size:.88rem;outline:none"></td>
                <td><input name="remark-${s.id}" placeholder="e.g. Good work" style="border:1.5px solid var(--border);border-radius:var(--r-sm);padding:5px 9px;font-size:.8rem;width:150px;outline:none"></td>
              </tr>`).join("") : tableEmpty(5, "No students in this section")}
            </tbody>
          </table>
        </div>
        ${marksRoster.length ? `<div style="margin-top:14px"><button type="submit" class="btn btn-primary">Publish Marks</button></div>` : ""}
      </form>
    </div>
  `;
  // Marks — preload existing scores when course or exam type changes
  async function loadMarksPreload() {
    const courseId = Number(byId("marksCourseSel")?.value || state.filters.marksCourseId);
    const examType = byId("examTypeSel")?.value;
    if (!courseId || !examType) return;
    try {
      const form = document.getElementById("teacherMarksForm");
      if (form) {
        form.querySelectorAll(`input[name^="score-"]`).forEach(input => { input.value = 0; });
        form.querySelectorAll(`input[name^="remark-"]`).forEach(input => { input.value = ""; });
      }
      if (byId("maxScoreInput")) byId("maxScoreInput").value = 50;
      if (byId("maxScoreLabel")) byId("maxScoreLabel").textContent = 50;
      const data = await window.Api.getMarksSession(courseId, examType);
      if (data.maxScore && byId("maxScoreInput")) {
        byId("maxScoreInput").value = data.maxScore;
        if (byId("maxScoreLabel")) byId("maxScoreLabel").textContent = data.maxScore;
      }
      if (!data.exists || !data.records?.length) return;
      const scoreMap = {};
      const remarkMap = {};
      data.records.forEach(r => {
        scoreMap[r.student_id] = r.score;
        remarkMap[r.student_id] = r.remark || "";
      });
      if (!form) return;
      Object.entries(scoreMap).forEach(([sid, score]) => {
        const input = form.querySelector(`[name="score-${sid}"]`);
        if (input) input.value = score ?? 0;
      });
      Object.entries(remarkMap).forEach(([sid, remark]) => {
        const input = form.querySelector(`[name="remark-${sid}"]`);
        if (input && remark) input.value = remark;
      });
    } catch { /* silent */ }
  }

  byId("marksCourseSel")?.addEventListener("change", e => {
    state.filters.marksCourseId = Number(e.target.value);
    persistState(); renderTeacher();
  });
  byId("examTypeSel")?.addEventListener("change", e => {
    state.filters.marksExamType = e.target.value;
    persistState();
    loadMarksPreload();
  });
  byId("maxScoreInput")?.addEventListener("input", e => {
    if (byId("maxScoreLabel")) byId("maxScoreLabel").textContent = e.target.value;
  });

  // Load existing marks for the current course + first exam type on render
  loadMarksPreload();

  // ── Assignments ───────────────────────────────────────────────
  byId("assignmentsSection").innerHTML = `
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Create Assignment", "Publish new coursework with file attachment")}
        <form id="teacherAssignmentForm">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>Course</label>
              <select name="courseId">${courses.map(c => `<option value="${c.id}">${H(c.code)} – ${H(c.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Title</label><input name="title" placeholder="Assignment title" required></div>
            <div class="field"><label>Description / Instructions</label><textarea name="description" rows="3" placeholder="Detailed instructions for students…" required></textarea></div>
            <div class="form-grid">
              <div class="field"><label>Due Date</label><input type="date" name="dueDate" required></div>
              <div class="field"><label>Max Score</label><input type="number" name="maxScore" value="20" min="1"></div>
            </div>
            <div class="field"><label>Attachment for Students (optional)</label>
              ${fileZone("teacherAsgFile", ".pdf,.doc,.docx,.ppt,.pptx,.zip", "Upload question paper or reference file")}
              <input type="hidden" name="attachmentName" id="teacherAsgAttName">
              <input type="hidden" name="attachmentPath" id="teacherAsgAttPath">
            </div>
            <button type="submit" class="btn btn-primary">Publish Assignment</button>
          </div>
        </form>
      </div>
      <div class="card card-p">
        ${cardHeader("Published Assignments", "View, edit, and track submissions")}
        ${assignments.length ? `<div style="display:flex;flex-direction:column;gap:10px">
          ${assignments.map(a => `<div style="padding:14px;border:1px solid var(--border);border-radius:var(--r-md)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
              <strong style="font-size:.9rem">${H(a.title)}</strong>
              ${statusBadge(a.status)}
            </div>
            <div style="font-size:.78rem;color:var(--accent);font-weight:700;margin-bottom:4px">${H(a.subject || a.course_name || "")}</div>
            <div style="font-size:.8rem;color:var(--muted)">Due ${formatDate(a.due_date)} · Max ${a.max_score} marks</div>
            <div style="font-size:.8rem;color:var(--muted);margin-top:3px">
              Submissions: <strong>${a.submitted_count || 0}</strong> / ${a.total_students || 0}
              ${a.attachment_name ? ` · 📎 ${H(a.attachment_name)}` : ""}
            </div>
            <div style="display:flex;gap:7px;margin-top:10px">
              <button class="btn btn-ghost btn-sm" data-action="view-teacher-assignment-progress"
                data-assignment-title="${H(a.title)}"
                data-assignment-total="${a.total_students || 0}"
                data-assignment-submitted="${a.submitted_count || 0}"
                data-assignment-id="${a.id}">View Progress</button>
              <button class="btn btn-secondary btn-sm" data-action="edit-teacher-assignment"
                data-assignment-id="${a.id}"
                data-assignment-title="${H(a.title)}"
                data-assignment-description="${H(a.description)}"
                data-assignment-due="${H(a.due_date)}"
                data-assignment-max="${a.max_score}"
                data-assignment-status="${H(a.status)}">Edit</button>
              <button class="btn btn-danger btn-sm" data-action="delete-teacher-assignment" data-assignment-id="${a.id}" data-assignment-title="${H(a.title)}">Delete</button>
            </div>
          </div>`).join("")}
        </div>` : emptyState("📝", "No assignments yet", "Create your first assignment using the form")}
      </div>
    </div>
  `;
  bindFileZone("teacherAsgFile");
  byId("teacherAsgFile")?.addEventListener("change", e => { const f = e.target.files[0]; if (f) { if (byId("teacherAsgAttName")) byId("teacherAsgAttName").value = f.name; if (byId("teacherAsgAttPath")) byId("teacherAsgAttPath").value = f.name; } });

  // ── Roster ────────────────────────────────────────────────────
  byId("rosterSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Student Roster", "Manage your students — view details and send notifications", `<div style="display:flex;gap:8px"><input type="text" id="rosterSearch" placeholder="Search students…" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none;width:200px"><select id="rosterSectionFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none"><option value="">All Sections</option>${[...new Set(roster.map(s => s.section))].map(sec => `<option value="${sec}">Section ${sec}</option>`).join("")}</select></div>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Student</th><th>Section</th><th>Roll No.</th><th>CGPA</th><th>Attendance</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="rosterTbody">
            ${roster.length ? roster.map((s, i) => `<tr data-name="${H((s.name||"").toLowerCase())}" data-sec="${H(s.section||"")}">
              <td style="color:var(--muted)">${i + 1}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar av-sm">${initials(s.name)}</div>
                  <div><strong>${H(s.name)}</strong><div style="font-size:.74rem;color:var(--muted)">${H(s.email || "")}</div></div>
                </div>
              </td>
              <td><span class="badge badge-info">Sec ${H(s.section || "")}</span></td>
              <td>${H(s.roll_no || s.rollNo || "—")}</td>
              <td><strong>${s.cgpa ?? "—"}</strong></td>
              <td>
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="width:50px">${progressBar(s.attendance || 0)}</div>
                  <span style="font-size:.8rem">${s.attendance ?? 0}%</span>
                </div>
              </td>
              <td>${statusBadge(s.risk === "at_risk" ? "pending" : "active")}</td>
              <td>
                <div class="action-btns">
                  <button class="btn btn-ghost btn-sm" data-action="view-student-detail"
                    data-student-id="${s.id}" data-student-name="${H(s.name)}"
                    data-student-roll="${H(s.roll_no || s.rollNo || "")}"
                    data-student-email="${H(s.email || "")}"
                    data-student-cgpa="${s.cgpa ?? "—"}"
                    data-student-attendance="${s.attendance ?? 0}"
                    data-student-risk="${H(s.risk || "stable")}">View</button>
                  <button class="btn btn-secondary btn-sm" data-action="contact-student"
                    data-student-id="${s.id}" data-student-name="${H(s.name)}">Notify</button>
                </div>
              </td>
            </tr>`).join("") : tableEmpty(8, "No students in your courses")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  byId("rosterSearch")?.addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    byId("rosterTbody")?.querySelectorAll("tr[data-name]").forEach(row => { row.style.display = row.dataset.name.includes(q) ? "" : "none"; });
  });
  byId("rosterSectionFilter")?.addEventListener("change", e => {
    const sec = e.target.value;
    byId("rosterTbody")?.querySelectorAll("tr[data-sec]").forEach(row => { row.style.display = !sec || row.dataset.sec === sec ? "" : "none"; });
  });

  // ── Timetable ─────────────────────────────────────────────────
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const teacherTimetableSlots = sortByDayAndTime(d.timetable || []).filter(slot => {
    if (state.filters.teacherTimetableDay && slot.day_of_week !== state.filters.teacherTimetableDay) return false;
    if (state.filters.teacherTimetableSection && slot.section !== state.filters.teacherTimetableSection) return false;
    return true;
  });
  byId("timetableSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("My Teaching Timetable", "Update room or status for individual slots", `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="teacherTtDayFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none">
          <option value="">All days</option>${days.map(day => `<option value="${day}"${day === state.filters.teacherTimetableDay ? " selected" : ""}>${day}</option>`).join("")}
        </select>
        <select id="teacherTtSectionFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none">
          <option value="">All sections</option>${[...new Set((d.timetable || []).map(slot => slot.section))].filter(Boolean).map(section => `<option value="${section}"${section === state.filters.teacherTimetableSection ? " selected" : ""}>Sec ${section}</option>`).join("")}
        </select>
      </div>`)}
      <div class="week-grid" style="margin-bottom:18px">
        ${days.map(day => {
          const slots = teacherTimetableSlots.filter(s => s.day_of_week === day);
          return `<div class="week-col">
            <div class="week-col-head">${day}</div>
            <div class="week-col-body">
              ${slots.length ? slots.map(s => `<div class="week-slot">
                <div class="week-slot-time">${H(s.start_time)}–${H(s.end_time)}</div>
                <div class="week-slot-name">${H(s.subject || s.course_name || "")}</div>
                <div class="week-slot-room">📍 ${H(s.room || "")} · Sec ${H(s.section || "")}</div>
                <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:5px" data-action="update-slot"
                  data-slot-id="${s.id}" data-room="${H(s.room || "")}" data-status="${H(s.status || "scheduled")}">Update</button>
              </div>`).join("") : `<div class="week-free">Free</div>`}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
    <div class="card card-p">
      ${cardHeader("All Timetable Slots", `${teacherTimetableSlots.length} visible slot${teacherTimetableSlots.length === 1 ? "" : "s"}`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Course</th><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${teacherTimetableSlots.length ? teacherTimetableSlots.map(s => `<tr>
              <td><strong>${H(s.subject || s.course_name || "")}</strong></td>
              <td>${H(s.section || "")}</td>
              <td>${H(s.day_of_week || "")}</td>
              <td>${H(s.start_time || "")}–${H(s.end_time || "")}</td>
              <td>${H(s.room || "")}</td>
              <td>${H(s.slot_type || "")}</td>
              <td>${statusBadge(s.status || "scheduled")}</td>
              <td><button class="btn btn-ghost btn-sm" data-action="update-slot"
                data-slot-id="${s.id}" data-room="${H(s.room || "")}" data-status="${H(s.status || "scheduled")}">Update</button></td>
            </tr>`).join("") : tableEmpty(8, "No timetable assigned")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // ── Notices ───────────────────────────────────────────────────
  byId("teacherTtDayFilter")?.addEventListener("change", e => {
    state.filters.teacherTimetableDay = e.target.value;
    persistState(); renderTeacher(); setActiveSection("timetableSection");
  });
  byId("teacherTtSectionFilter")?.addEventListener("change", e => {
    state.filters.teacherTimetableSection = e.target.value;
    persistState(); renderTeacher(); setActiveSection("timetableSection");
  });
  byId("announcementsSection").innerHTML = `
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Publish Notice", "Post announcements for students")}
        <form id="teacherNoticeForm">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>Title</label><input name="title" placeholder="Notice title" required></div>
            <div class="form-grid">
              <div class="field"><label>Audience</label>
                <select name="audience"><option value="student">Students</option><option value="all">All Users</option></select>
              </div>
              <div class="field"><label>Priority</label>
                <select name="priority"><option value="high">🔴 High</option><option value="medium" selected>🟡 Medium</option><option value="low">🟢 Low</option></select>
              </div>
            </div>
            <div class="field"><label>Message</label><textarea name="message" rows="4" required></textarea></div>
            <button type="submit" class="btn btn-primary">Publish Notice</button>
          </div>
        </form>
      </div>
      <div class="card card-p">
        ${cardHeader("My Notices", "Announcements you've published")}
        ${(d.announcements || []).length ? `<div style="display:flex;flex-direction:column;gap:10px">
          ${(d.announcements || []).map(n => `<div class="notice-card nc-${n.priority || "medium"}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div><div class="notice-title">${H(n.title)}</div><div class="notice-meta">For ${H(titleize(n.audience || ""))} · ${formatDate(n.created_at)}</div></div>
              ${statusBadge(n.priority || "medium")}
            </div>
            <div class="notice-body">${H(n.message)}</div>
          </div>`).join("")}
        </div>` : emptyState("📢", "No notices published yet")}
      </div>
    </div>
  `;

  byId("profileSection").innerHTML = profilePanel(p);
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN SECTIONS
// ═══════════════════════════════════════════════════════════════

function renderAdmin() {
  const d = state.dashboard;
  const p = d.profile;
  const users = d.users || [];
  const depts = d.departments || [];
  const courses = d.courses || [];
  const timetable = d.timetable || [];
  const grievances = d.grievances || [];
  const workflowRequests = d.workflowRequests || [];
  const feeSummary = d.feeSummary || [];
  const notices = d.notices || [];
  const openGrievances = grievances.filter(g => g.status === "open" || g.status === "in_review");

  // Update grievance badge
  const grvBadge = byId("grvBadge");
  if (grvBadge) { grvBadge.textContent = openGrievances.length; grvBadge.classList.toggle("hidden", openGrievances.length === 0); }

  const teacherOptions = users.filter(u => u.role === "teacher").map(t => `<option value="${t.id}">${H(t.name)} (${H(t.department || "—")})</option>`).join("");
  const courseOptions = courses.map(c => `<option value="${c.id}">${H(c.code)} – ${H(c.name)} (Sec ${H(c.section)})</option>`).join("");
  const deptCodeOptions = depts.map(d2 => `<option value="${H(d2.code)}">${H(d2.code)} – ${H(d2.name)}</option>`).join("");

  // ── Admin Home ────────────────────────────────────────────────
  byId("overviewSection").innerHTML = `
    <div class="stats-grid">
      ${statCard(d.kpis?.students ?? 0, "Students", "🎓", "c-blue", "", "usersSection")}
      ${statCard(d.kpis?.teachers ?? 0, "Faculty", "👨‍🏫", "c-orange", "", "usersSection")}
      ${statCard(courses.length, "Courses", "📚", "c-green", `${depts.length} depts`, "coursesSection")}
      ${statCard(openGrievances.length, "Open Grievances", "⚠️", openGrievances.length > 0 ? "c-red" : "c-green", `${grievances.length} total`, "grievancesSection")}
      ${statCard(notices.filter(n => n.active).length, "Active Notices", "📢", "c-purple", "", "noticesSection")}
      ${statCard(d.kpis?.systemStatus ?? "Active", "System Status", "⚙️", "c-blue", d.settings?.current_session || "", "settingsSection")}
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Department Overview", "Student & faculty distribution")}
        <div class="chart-wrap"><canvas id="adminDeptChart"></canvas></div>
      </div>
      <div class="card card-p">
        ${cardHeader("Operations Watchlist", "Items needing admin attention")}
        <div style="display:flex;flex-direction:column;gap:0">
          ${[
            ["Open Grievances", openGrievances.length, openGrievances.length > 0 ? "badge-danger" : "badge-success", "grievancesSection"],
            ["Courses Under Review", courses.filter(c => c.status === "review").length, "badge-warning", "coursesSection"],
            ["Active Notices", notices.filter(n => n.active).length, "badge-success", "noticesSection"],
            ["Total Users", users.filter(u => u.status === "active").length, "badge-info", "usersSection"],
          ].map(([label, val, cls, target]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(221,215,204,.4)">
            <div style="font-size:.88rem;font-weight:600">${label}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="badge ${cls}">${val}</span>
              <button class="btn btn-ghost btn-xs" data-jump="${target}">View →</button>
            </div>
          </div>`).join("")}
        </div>
      </div>
    </div>
    ${(d.auditLogs || []).length ? `<div class="card card-p">
      ${cardHeader("Recent Activity", "Latest system actions", `<button class="btn btn-ghost btn-sm" data-jump="activitySection">View all →</button>`)}
      <div>
        ${(d.auditLogs || []).slice(0, 6).map(l => `<div class="feed-item">
          <div class="feed-icon">🔧</div>
          <div class="feed-body">
            <div class="feed-text"><strong>${H(l.actor_name)}</strong> — ${H(l.action)}</div>
            <div class="feed-meta">${H(l.entity_type)} · ${formatDateTime(l.created_at)}</div>
          </div>
        </div>`).join("")}
      </div>
    </div>` : ""}
  `;
  if ((d.chart || []).length) barChart("adminDeptChart", "adminDept", d.chart.map(x => x.code), [{ label: "Students", values: d.chart.map(x => x.students) }, { label: "Faculty", values: d.chart.map(x => x.teachers) }]);

  // ── Activity Log ──────────────────────────────────────────────
  byId("activitySection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Audit Log", "All system actions", `<button class="btn btn-ghost btn-sm" data-action="export-audit">Export</button>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            ${(d.auditLogs || []).length ? (d.auditLogs || []).map(l => `<tr>
              <td style="font-size:.78rem;color:var(--muted);white-space:nowrap">${formatDateTime(l.created_at)}</td>
              <td><strong>${H(l.actor_name)}</strong></td>
              <td>${H(l.action)}</td>
              <td>${statusBadge(l.entity_type)}</td>
              <td style="font-size:.8rem;color:var(--muted)">${H(l.details || "—")}</td>
            </tr>`).join("") : tableEmpty(5, "No activity yet")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // ── Users ─────────────────────────────────────────────────────
  byId("usersSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("User Directory", `${users.length} total users`, `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <input type="text" id="userSearch" placeholder="🔍 Search by name or email…" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none;min-width:200px">
        <select id="userRoleFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none"><option value="">All Roles</option><option value="student">Students</option><option value="teacher">Faculty</option><option value="admin">Admin</option></select>
        <button class="btn btn-primary btn-sm" data-action="add-user">+ Add User</button>
      </div>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody id="usersTbody">
            ${users.map(u => `<tr data-name="${H((u.name||"").toLowerCase())} ${H((u.email||"").toLowerCase())}" data-role="${H(u.role||"")}">
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar av-sm">${initials(u.name)}</div>
                  <div><strong>${H(u.name)}</strong><div style="font-size:.74rem;color:var(--muted)">${H(u.email)}</div></div>
                </div>
              </td>
              <td>${statusBadge(u.role)}</td>
              <td>${H(u.department || "—")}</td>
              <td>${statusBadge(u.status)}</td>
              <td style="font-size:.78rem;color:var(--muted)">${formatDateTime(u.last_login_at)}</td>
              <td>
                <div class="action-btns">
                  <button class="btn btn-ghost btn-sm" data-action="view-user" data-user-id="${u.id}" data-user-name="${H(u.name)}" data-user-email="${H(u.email)}" data-user-role="${H(u.role)}" data-user-department="${H(u.department||"—")}" data-user-status="${H(u.status)}" data-user-last-login="${H(formatDateTime(u.last_login_at))}">View</button>
                  <button class="btn btn-secondary btn-sm" data-action="edit-user" data-user-id="${u.id}" data-user-name="${H(u.name)}" data-user-email="${H(u.email)}" data-user-role="${H(u.role)}" data-user-department="${H(u.department||"")}">Edit</button>
                  ${u.role === "student" ? `<button class="btn btn-ghost btn-sm" data-action="manage-student-enrollment" data-student-id="${u.id}" data-student-name="${H(u.name)}" data-enrolled-course-ids="${(u.enrolledCourseIds || []).join(",")}">Enroll</button>` : ""}
                  <button class="btn btn-ghost btn-sm" data-action="reset-password" data-user-id="${u.id}" data-user-name="${H(u.name)}">Reset Pwd</button>
                  <button class="btn btn-${u.status === "active" ? "danger" : "success"} btn-sm" data-action="toggle-status" data-user-id="${u.id}" data-current-status="${H(u.status)}">${u.status === "active" ? "Suspend" : "Restore"}</button>
                </div>
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  byId("userSearch")?.addEventListener("input", e => { const q = e.target.value.toLowerCase(); byId("usersTbody")?.querySelectorAll("tr[data-name]").forEach(row => { row.style.display = row.dataset.name.includes(q) ? "" : "none"; }); });
  byId("userRoleFilter")?.addEventListener("change", e => { const r = e.target.value; byId("usersTbody")?.querySelectorAll("tr[data-role]").forEach(row => { row.style.display = !r || row.dataset.role === r ? "" : "none"; }); });

  // ── Departments ───────────────────────────────────────────────
  byId("deptsSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Departments", `${depts.length} departments`, `<button class="btn btn-primary btn-sm" data-action="create-dept">+ Add Department</button>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Department Name</th><th>Head of Dept</th><th>Faculty</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${depts.length ? depts.map(dept => `<tr>
              <td><span class="badge badge-info">${H(dept.code)}</span></td>
              <td><strong>${H(dept.name)}</strong></td>
              <td>${H(dept.hod_name || "—")}</td>
              <td><span class="badge badge-neutral">${dept.faculty_count || 0} faculty</span></td>
              <td><span class="badge badge-neutral">${dept.student_count || 0} students</span></td>
              <td>${statusBadge(dept.active ? "active" : "archived")}</td>
              <td>
                <button class="btn btn-secondary btn-sm" data-action="manage-department"
                  data-department-id="${dept.id}" data-department-name="${H(dept.name)}"
                  data-department-code="${H(dept.code)}" data-department-hod="${H(dept.hod_name||"")}"
                  data-department-active="${dept.active ? "1" : "0"}">Manage</button>
              </td>
            </tr>`).join("") : tableEmpty(7, "No departments found")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // ── Courses ───────────────────────────────────────────────────
  byId("coursesSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Course Registry", `${courses.length} courses`, `<div style="display:flex;gap:8px">
        <input type="text" id="courseSearch" placeholder="🔍 Search courses…" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none;min-width:180px">
        <button class="btn btn-ghost btn-sm" data-action="export-courses">↗ Export CSV</button>
        <button class="btn btn-primary btn-sm" data-action="add-course">+ Add Course</button>
      </div>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Course Name</th><th>Dept</th><th>Section</th><th>Sem</th><th>Credits</th><th>Teacher</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="coursesTbody">
            ${courses.map(c => `<tr data-search="${H((c.code||"").toLowerCase())} ${H((c.name||"").toLowerCase())}">
              <td><span class="badge badge-info">${H(c.code)}</span></td>
              <td><strong>${H(c.name)}</strong></td>
              <td>${H(c.department || "")}</td>
              <td>${H(c.section || "")}</td>
              <td>${c.semester}</td>
              <td>${c.credits}</td>
              <td>${H(c.teacher_name || "—")}</td>
              <td>${statusBadge(c.status)}</td>
              <td>
                <button class="btn btn-secondary btn-sm" data-action="manage-course"
                  data-course-id="${c.id}" data-course-name="${H(c.name)}"
                  data-course-status="${H(c.status)}" data-course-teacher-id="${c.teacher_id || ""}">Manage</button>
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  byId("courseSearch")?.addEventListener("input", e => { const q = e.target.value.toLowerCase(); byId("coursesTbody")?.querySelectorAll("tr[data-search]").forEach(row => { row.style.display = row.dataset.search.includes(q) ? "" : "none"; }); });

  const filteredTimetable = sortByDayAndTime(timetable).filter(slot => {
    if (state.filters.adminTimetableDay && slot.day_of_week !== state.filters.adminTimetableDay) return false;
    if (state.filters.adminTimetableSection && slot.section !== state.filters.adminTimetableSection) return false;
    if (state.filters.adminTimetableDept && slot.department_code !== state.filters.adminTimetableDept) return false;
    if (state.filters.adminTimetableTeacher && slot.teacher_name !== state.filters.adminTimetableTeacher) return false;
    return true;
  });

  // ── Timetable Config ──────────────────────────────────────────
  byId("timetableSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Timetable Configuration", `${filteredTimetable.length} visible slot${filteredTimetable.length === 1 ? "" : "s"}`, `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-action="check-timetable-clash">🔍 Check Clashes</button>
        <button class="btn btn-primary btn-sm" data-action="open-create-slot">+ Create Slot</button>
      </div>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Course</th><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Type</th><th>Status</th><th>Note</th><th>Action</th></tr></thead>
          <tbody>
            ${filteredTimetable.length ? filteredTimetable.map(s => `<tr>
              <td><strong>${H(s.course_code || "")}</strong><br><span style="font-size:.74rem;color:var(--muted)">${H(s.course_name || "")}</span></td>
              <td>${H(s.section || "")}</td>
              <td>${H(s.day_of_week || "")}</td>
              <td>${H(s.start_time || "")}–${H(s.end_time || "")}</td>
              <td>${H(s.room || "")}</td>
              <td>${H(s.slot_type || "")}</td>
              <td>${statusBadge(s.status || "scheduled")}</td>
              <td style="font-size:.78rem;color:var(--muted);max-width:100px">${H(s.note || "—")}</td>
              <td><button class="btn btn-ghost btn-sm" data-action="edit-admin-slot"
                data-slot-id="${s.id}" data-course-id="${s.course_id}"
                data-room="${H(s.room || "")}" data-status="${H(s.status || "scheduled")}"
                data-day="${H(s.day_of_week || "")}" data-start="${H(s.start_time || "")}"
                data-end="${H(s.end_time || "")}" data-type="${H(s.slot_type || "Lecture")}">Edit</button></td>
            </tr>`).join("") : tableEmpty(9, "No timetable slots configured")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // ── Grievances ────────────────────────────────────────────────
  byId("grievancesSection").innerHTML = `
    <div class="card card-p">
      ${cardHeader("Grievance Management", `${openGrievances.length} pending`, `<select id="grvFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none"><option value="">All Status</option><option value="open">Open</option><option value="in_review">In Review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>Submitted By</th><th>Category</th><th>Subject</th><th>Priority</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="grvTbody">
            ${grievances.length ? grievances.map(g => `<tr data-status="${H(g.status||"")}">
              <td><span class="badge badge-neutral">#${g.id}</span></td>
              <td><strong>${H(g.submitted_by)}</strong></td>
              <td><span class="badge badge-neutral">${H(g.category)}</span></td>
              <td style="max-width:180px">${H(g.subject)}</td>
              <td>${statusBadge(g.priority)}</td>
              <td style="font-size:.78rem;color:var(--muted)">${formatDate(g.created_at)}</td>
              <td>${statusBadge(g.status)}</td>
              <td>
                <div class="action-btns">
                  <button class="btn btn-ghost btn-sm" data-action="view-grievance"
                    data-grievance-id="${g.id}"
                    data-grievance-submitted-by="${H(g.submitted_by)}"
                    data-grievance-category="${H(g.category)}"
                    data-grievance-subject="${H(g.subject)}"
                    data-grievance-status="${H(g.status)}"
                    data-grievance-priority="${H(g.priority)}"
                    data-grievance-message="${H(g.message || "")}"
                    data-grievance-note="${H(g.resolution_note||"")}">View</button>
                  ${g.status !== "resolved" && g.status !== "closed" ? `<button class="btn btn-primary btn-sm" data-action="resolve-grievance"
                    data-grievance-id="${g.id}" data-subject="${H(g.subject)}"
                    data-grievance-by="${H(g.submitted_by)}" data-grievance-cat="${H(g.category)}"
                    data-grievance-msg="${H(g.message||"")}">Resolve</button>` : ""}
                </div>
              </td>
            </tr>`).join("") : tableEmpty(8, "No grievances")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Workflow Requests", `${workflowRequests.filter(r => r.status === "pending").length} pending`, `<select id="wfFilter" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--r-md);font-size:.82rem;outline:none"><option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>`)}
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Student</th><th>Type</th><th>Dates</th><th>Status</th><th>Attachment</th><th>Actions</th></tr></thead>
            <tbody id="wfTbody">
              ${workflowRequests.length ? workflowRequests.map(r => `<tr data-status="${H(r.status || "")}">
                <td><strong>${H(r.student_name)}</strong><div style="font-size:.74rem;color:var(--muted)">${H(r.roll_no || "—")}</div></td>
                <td>${statusBadge(r.request_type)}</td>
                <td style="font-size:.78rem">${formatDate(r.from_date)} → ${formatDate(r.to_date)}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.attachment_name ? `<span class="badge badge-info">📎 ${H(r.attachment_name)}</span>` : "—"}</td>
                <td>
                  ${r.status === "pending" ? `<button class="btn btn-primary btn-sm" data-action="review-workflow-request" data-request-id="${r.id}" data-request-type="${H(r.request_type)}" data-student-name="${H(r.student_name)}" data-request-reason="${H(r.reason)}">Review</button>` : `<span class="badge badge-neutral">Reviewed</span>`}
                </td>
              </tr>`).join("") : tableEmpty(6, "No workflow requests")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="card card-p">
        ${cardHeader("Fee Controls", "Create pending fee items")}
        <div style="margin-bottom:12px">
          <button class="btn btn-primary btn-sm" data-action="open-admin-add-fee">+ Add Fee Item</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Student</th><th>Roll No</th><th>Pending Items</th><th>Due Amount</th></tr></thead>
            <tbody>
              ${feeSummary.length ? feeSummary.slice(0, 12).map(row => `<tr>
                <td><strong>${H(row.student_name)}</strong></td>
                <td>${H(row.roll_no || "—")}</td>
                <td>${row.pending_items || 0}</td>
                <td style="font-weight:700">${formatCurrency(row.due_amount || 0)}</td>
              </tr>`).join("") : tableEmpty(4, "No fee data available")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  byId("grvFilter")?.addEventListener("change", e => {
    const s = e.target.value;
    byId("grvTbody")?.querySelectorAll("tr[data-status]").forEach(row => { row.style.display = !s || row.dataset.status === s ? "" : "none"; });
  });
  byId("wfFilter")?.addEventListener("change", e => {
    const s = e.target.value;
    byId("wfTbody")?.querySelectorAll("tr[data-status]").forEach(row => { row.style.display = !s || row.dataset.status === s ? "" : "none"; });
  });

  // ── Notices ───────────────────────────────────────────────────
  byId("noticesSection").innerHTML = `
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Publish Notice", "Post updates to students, faculty, or everyone")}
        <form id="adminNoticeForm">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label>Title</label><input name="title" required placeholder="Notice title"></div>
            <div class="form-grid">
              <div class="field"><label>Audience</label>
                <select name="audience"><option value="all">All Users</option><option value="student">Students</option><option value="teacher">Faculty</option></select>
              </div>
              <div class="field"><label>Priority</label>
                <select name="priority"><option value="high">🔴 High</option><option value="medium" selected>🟡 Medium</option><option value="low">🟢 Low</option></select>
              </div>
            </div>
            <div class="field"><label>Message</label><textarea name="message" rows="4" required></textarea></div>
            <button type="submit" class="btn btn-primary">Publish Notice</button>
          </div>
        </form>
      </div>
      <div class="card card-p">
        ${cardHeader("Notice Register", `${notices.length} total`)}
        <div style="display:flex;flex-direction:column;gap:10px;max-height:520px;overflow-y:auto">
          ${notices.length ? notices.map(n => `<div class="notice-card nc-${n.priority||"medium"}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <div class="notice-title">${H(n.title)}</div>
                <div class="notice-meta">${H(n.published_by||"")} · ${H(titleize(n.audience||""))} · ${formatDate(n.created_at)}</div>
              </div>
              <div style="display:flex;gap:5px;align-items:center;flex-shrink:0">
                ${statusBadge(n.active ? n.priority||"medium" : "archived")}
                ${statusBadge(n.active ? "active" : "archived")}
              </div>
            </div>
            <div class="notice-body">${H(n.message)}</div>
            <div class="notice-footer">
              <button class="btn btn-ghost btn-sm" data-action="edit-notice"
                data-notice-id="${n.id}" data-notice-title="${H(n.title)}"
                data-notice-message="${H(n.message)}" data-notice-priority="${H(n.priority||"medium")}"
                data-notice-audience="${H(n.audience||"all")}" data-notice-active="${n.active ? "1" : "0"}">Edit</button>
              ${n.active ? `<button class="btn btn-danger btn-sm" data-action="unpublish-notice" data-notice-id="${n.id}">Unpublish</button>` : `<button class="btn btn-success btn-sm" data-action="republish-notice" data-notice-id="${n.id}">Republish</button>`}
            </div>
          </div>`).join("") : emptyState("📭", "No notices published")}
        </div>
      </div>
    </div>
  `;

  // ── Reports ───────────────────────────────────────────────────
  byId("reportsSection").innerHTML = `
    <div class="stats-grid">
      ${statCard(users.filter(u => u.status === "active" && u.role === "student").length, "Active Students", "🎓", "c-blue")}
      ${statCard(users.filter(u => u.status === "active" && u.role === "teacher").length, "Active Faculty", "👨‍🏫", "c-orange")}
      ${statCard(courses.filter(c => c.status === "active").length, "Active Courses", "📚", "c-green")}
      ${statCard(grievances.filter(g => g.status === "resolved").length, "Resolved Grievances", "✅", "c-green")}
      ${statCard(notices.filter(n => n.active).length, "Active Notices", "📢", "c-purple")}
      ${statCard(depts.filter(d2 => d2.active).length, "Active Departments", "🏛", "c-blue")}
    </div>
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Department Distribution")}
        <div class="chart-wrap"><canvas id="reportsDeptChart"></canvas></div>
      </div>
      <div class="card card-p">
        ${cardHeader("Export Reports")}
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[["📋","Attendance Report","export-attendance"],["📊","Marks Summary","export-marks"],["⚠️","Grievance Report","export-grievances"],["👥","User Directory","export-users"],["📚","Course Catalogue","export-courses"]].map(([icon, label, action]) => `<button class="btn btn-ghost" style="justify-content:flex-start;gap:10px" data-action="${action}">${icon} ${label}</button>`).join("")}
        </div>
      </div>
    </div>
  `;
  if ((d.chart || []).length) doughnutChart("reportsDeptChart", "reportsDept", d.chart.map(x => x.code), d.chart.map(x => x.students));

  // ── Settings ──────────────────────────────────────────────────
  byId("settingsSection").innerHTML = `
    <div class="g2">
      <div class="card card-p">
        ${cardHeader("Institution Settings", "Configure portal behaviour")}
        <form id="settingsForm">
          <div style="display:flex;flex-direction:column;gap:14px">
            <div class="field"><label>Institution Name</label><input name="site_name" value="${H(d.settings?.site_name||"EduWorkflow")}"></div>
            <div class="field"><label>Current Academic Session</label><input name="current_session" value="${H(d.settings?.current_session||"2025-2026")}"></div>
            <div class="field"><label>Attendance Threshold (%)</label><input type="number" name="attendance_threshold" value="${H(d.settings?.attendance_threshold||75)}" min="0" max="100"></div>
            <button type="submit" class="btn btn-primary">Save Configuration</button>
          </div>
        </form>
      </div>
      <div class="card card-p">
        ${cardHeader("Feature Toggles", "Enable or disable portal modules")}
        <div>
          ${[
            ["student_portal_enabled","Student Portal","Allow students to access the portal"],
            ["teacher_portal_enabled","Teacher Portal","Allow faculty to access the portal"],
            ["grievance_module_active","Grievance Module","Allow students to raise grievances"],
            ["maintenance_mode","Maintenance Mode","Block student/teacher access for maintenance"],
          ].map(([key, label, desc]) => `<div class="toggle-row">
            <div class="toggle-info">
              <div class="toggle-label">${label}</div>
              <div class="toggle-desc">${desc}</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" class="settings-toggle" data-key="${key}" ${d.settings?.[key] === "1" ? "checked" : ""}>
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
          </div>`).join("")}
        </div>
      </div>
    </div>
    <div class="card card-p">
      ${cardHeader("Recent Audit Trail", "System changes", `<button class="btn btn-ghost btn-sm" data-jump="activitySection">Full log →</button>`)}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            ${(d.auditLogs || []).slice(0, 8).map(l => `<tr>
              <td style="font-size:.76rem;color:var(--muted)">${formatDateTime(l.created_at)}</td>
              <td><strong>${H(l.actor_name)}</strong></td>
              <td>${H(l.action)}</td>
              <td>${statusBadge(l.entity_type)}</td>
              <td style="font-size:.78rem;color:var(--muted)">${H(l.details||"—")}</td>
            </tr>`).join("") || tableEmpty(5, "No activity")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind settings toggles
  setTimeout(() => {
    byId("settingsSection")?.querySelectorAll(".settings-toggle").forEach(cb => {
      cb.addEventListener("change", async e => {
        try { await window.Api.updateSettings({ [e.target.dataset.key]: e.target.checked ? "1" : "0" }); showToast(`${e.target.dataset.key.replace(/_/g," ")} ${e.target.checked ? "enabled" : "disabled"}`, "success"); }
        catch (err) { showToast(err.message, "error"); e.target.checked = !e.target.checked; }
      });
    });
  }, 50);

  byId("profileSection").innerHTML = profilePanel(p);
}

// ═══════════════════════════════════════════════════════════════
//  FORM HANDLERS
// ═══════════════════════════════════════════════════════════════

async function onSubmit(e) {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  e.preventDefault();
  const submitBtn = form.querySelector("[type=submit]");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }

  try {
    // ── Student forms ──────────────────────────────────────────
    if (form.id === "leaveRequestForm") {
      const vals = getFormValues(form);
      await window.Api.submitStudentRequest(vals);
      form.reset(); showToast("Request submitted successfully", "success"); await loadDashboard();

    } else if (form.id === "studentGrievanceForm") {
      await window.Api.submitGrievance(getFormValues(form));
      form.reset(); showToast("Grievance submitted", "success"); await loadDashboard();

    } else if (form.id === "studentAttendanceFilters") {
      const v = getFormValues(form);
      Object.assign(state.filters, { attendanceSemester: Number(v.attendanceSemester), attendanceSubject: v.attendanceSubject||"", attendanceMonth: v.attendanceMonth||"", attendanceDate: v.attendanceDate||"", attendanceView: v.attendanceView });
      persistState(); await loadDashboard();

    } else if (form.id === "studentTimetableFilters") {
      state.filters.timetableDate = getFormValues(form).timetableDate;
      persistState(); await loadDashboard();

    } else if (form.id === "studentResultsFilters") {
      state.filters.resultsSemester = Number(getFormValues(form).resultsSemester);
      persistState(); await loadDashboard();

    // ── Teacher forms ──────────────────────────────────────────
    } else if (form.id === "teacherAttendanceForm") {
      const vals = getFormValues(form);
      const courseId = Number(vals.courseId);
      const course = (state.dashboard.courses || []).find(c => c.id === courseId);
      const ros = (state.dashboard.roster || []).filter(s => s.section === course?.section);
      const records = ros.map(s => ({
        studentId: s.id,
        status: form.querySelector(`.att-btn-group[data-student="${s.id}"] .att-btn[class*="sel-"]`)?.dataset.val || "present",
        remark: vals[`remark-${s.id}`] || "",
      }));
      await window.Api.submitTeacherAttendance({ courseId, date: vals.date, records });
      state.filters.attendanceCourseId = courseId; state.filters.teacherDate = vals.date;
      showToast(`Attendance saved for ${records.length} students`, "success"); await loadDashboard();

    } else if (form.id === "teacherMarksForm") {
      const vals = getFormValues(form);
      const courseId = Number(vals.courseId);
      const course = (state.dashboard.courses || []).find(c => c.id === courseId);
      const ros = (state.dashboard.roster || []).filter(s => s.section === course?.section);
      await window.Api.submitTeacherMarks({ courseId, examType: vals.examType, maxScore: Number(vals.maxScore), records: ros.map(s => ({ studentId: s.id, score: Number(vals[`score-${s.id}`]||0), remark: vals[`remark-${s.id}`]||"" })) });
      showToast("Marks published successfully", "success"); await loadDashboard();

    } else if (form.id === "teacherAssignmentForm") {
      await window.Api.createTeacherAssignment(getFormValues(form));
      form.reset(); showToast("Assignment published", "success"); await loadDashboard();

    } else if (form.id === "teacherNoticeForm") {
      await window.Api.createTeacherNotice(getFormValues(form));
      form.reset(); showToast("Notice published", "success"); await loadDashboard();

    // ── Admin forms ────────────────────────────────────────────
    } else if (form.id === "adminNoticeForm") {
      await window.Api.publishNotice(getFormValues(form));
      form.reset(); showToast("Notice published", "success"); await loadDashboard();

    } else if (form.id === "settingsForm") {
      const vals = getFormValues(form);
      // Toggles are handled live via their change events (see settings section binding).
      // Only save the text/number fields here.
      await window.Api.updateSettings({
        site_name: vals.site_name,
        current_session: vals.current_session,
        attendance_threshold: vals.attendance_threshold,
      });
      showToast("Configuration saved", "success"); await loadDashboard();
    }
  } catch (err) {
    showToast(err.message || "Something went wrong", "error");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.textContent.replace("Saving…", "Save"); }
    // Restore original button text
    const origTexts = { leaveRequestForm: "Submit Request", studentGrievanceForm: "Submit Grievance", teacherAttendanceForm: "Save Attendance", teacherMarksForm: "Publish Marks", teacherAssignmentForm: "Publish Assignment", teacherNoticeForm: "Publish Notice", adminNoticeForm: "Publish Notice", settingsForm: "Save Configuration" };
    if (submitBtn && origTexts[form.id]) submitBtn.textContent = origTexts[form.id];
  }
}

// ═══════════════════════════════════════════════════════════════
//  CLICK HANDLER (data-action and data-jump)
// ═══════════════════════════════════════════════════════════════

async function onClick(e) {
  const btn = e.target.closest("[data-action],[data-jump]");
  if (!btn) return;
  if (btn.dataset.jump) { setActiveSection(btn.dataset.jump); return; }

  const action = btn.dataset.action;
  try {
    // ── Profile ─────────────────────────────────────────────────
    if (action === "open-profile-edit") {
      openModal({ title: "Edit Profile", body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Full Name</label><input id="mpName" value="${H(btn.dataset.currentName||"")}"></div>
          <div class="field"><label>Phone Number</label><input id="mpPhone" value="${H(btn.dataset.currentPhone||"")}" placeholder="+91 99999 99999"></div>
        </div>`, confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          await window.Api.updateProfile({ name: byId("mpName").value, phone: byId("mpPhone").value });
          close(); showToast("Profile updated", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "open-password-change") {
      openModal({ title: "Change Password", body: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Current Password</label><input type="password" id="mpCurPwd"></div>
          <div class="field"><label>New Password</label><input type="password" id="mpNewPwd" placeholder="Min 6 characters"></div>
        </div>`, confirmLabel: "Update Password",
        onConfirm: async (close) => {
          await window.Api.changePassword({ currentPassword: byId("mpCurPwd").value, newPassword: byId("mpNewPwd").value });
          close(); showToast("Password changed successfully", "success");
        } });
      return;
    }
    if (action === "download-doc") {
      try {
        const doc = await window.Api.getStudentDocument(btn.dataset.doc);
        const blob = new Blob([doc.content || ""], { type: doc.mimeType || "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = doc.filename || `${btn.dataset.doc}.txt`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        showToast("Document downloaded", "success");
      } catch { showToast("Document generation failed", "error"); }
      return;
    }
    if (action === "open-campus-notices") {
      setActiveSection("campusDeskSection");
      setTimeout(() => byId("cdTabBar")?.querySelector('[data-tab="notices"]')?.click(), 20);
      return;
    }
    if (action === "download-study-material") {
      await handleAttachmentDownload("study_material", Number(btn.dataset.materialId), btn.dataset.materialFile || "study-material.txt");
      showToast("Study material downloaded", "success");
      return;
    }
    if (action === "download-assignment-file") {
      await handleAttachmentDownload("assignment_file", Number(btn.dataset.assignmentId), btn.dataset.assignmentFile || "assignment-file.txt");
      showToast("Assignment file downloaded", "success");
      return;
    }
    if (action === "upload-profile-image") {
      openModal({
        title: "Upload Profile Photo",
        body: `<div class="field"><label>Image File</label>${fileZone("profileImageFile", ".png,.jpg,.jpeg,.webp", "Upload profile image for documents and profile")}</div>`,
        confirmLabel: "Save Photo",
        onConfirm: async (close) => {
          const file = byId("profileImageFile")?.files?.[0];
          if (!file) throw new Error("Please select an image");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await window.Api.updateProfile({ profileImageData: dataUrl, profileImageMime: file.type || "image/png" });
          close();
          showToast("Profile photo updated", "success");
          await loadDashboard();
        },
      });
      setTimeout(() => bindFileZone("profileImageFile"), 40);
      return;
    }

    // ── Notifications ────────────────────────────────────────────
    if (action === "mark-all-read") {
      const items = state.dashboard?.notifications?.items || [];
      await Promise.all(items.filter(n => !n.is_read).map(n => window.Api.readNotification(n.id)));
      loadNotifications(); showToast("All notifications marked as read", "success"); return;
    }

    // ── Student actions ──────────────────────────────────────────
    if (action === "pay-single-fee") {
      openPaymentGateway([Number(btn.dataset.feeId)], state.dashboard?.fees?.items || []);
      return;
    }
    if (action === "open-payment-gateway") {
      const fees = state.dashboard?.fees?.items || [];
      const pending = fees.filter(f => f.status === "pending" || f.status === "overdue");
      if (!pending.length) { showToast("No pending fees", "info"); return; }
      openPaymentGateway(pending.map(f => f.id), fees);
      return;
    }
    if (action === "apply-placement") {
      openModal({ title: `Apply to ${btn.dataset.company}`, subtitle: "Your application will be reviewed by the placement committee",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Resume Link</label><input id="plResumeLink" placeholder="https://drive.google.com/your-resume" type="url"></div>
          <div class="field"><label>Cover Letter / Note</label><textarea id="plCoverLetter" rows="4" placeholder="Why are you a good fit? Share any relevant experience…"></textarea></div>
        </div>`,
        confirmLabel: "Submit Application",
        onConfirm: async (close) => {
          await window.Api.applyPlacementWithDetails(Number(btn.dataset.placementId), { resumeLink: byId("plResumeLink").value, coverLetter: byId("plCoverLetter").value });
          close(); showToast(`Application submitted to ${btn.dataset.company}!`, "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "view-placement-app") {
      openModal({ title: `${btn.dataset.company} Application`, cancelLabel: "Close", confirmLabel: null,
        body: `<div class="info-grid">
          ${[["Role", btn.dataset.role], ["Package", `₹${btn.dataset.package} LPA`], ["Drive Date", formatDate(btn.dataset.drive)], ["Status", statusBadge(btn.dataset.status)], ["Resume", btn.dataset.resume ? `<a href="${H(btn.dataset.resume)}" target="_blank" style="color:var(--accent)">${H(btn.dataset.resume)}</a>` : "—"], ["Cover Letter", btn.dataset.cover || "—"]].map(([k,v]) => `<div class="info-row"><div class="info-key">${k}</div><div class="info-val">${v}</div></div>`).join("")}
        </div>` });
      return;
    }
    if (action === "submit-assignment" || action === "edit-assignment-submission") {
      const isEdit = action === "edit-assignment-submission";
      openModal({ title: `${isEdit ? "Update" : "Submit"} Assignment`,
        subtitle: `${H(btn.dataset.assignmentCourse||"")} · Due ${formatDate(btn.dataset.assignmentDue||"")}`,
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div style="padding:10px 12px;background:var(--surface-raise);border-radius:var(--r-md);border:1px solid var(--border)">
            <strong>${H(btn.dataset.assignmentTitle)}</strong>
            ${btn.dataset.assignmentDesc ? `<div style="font-size:.82rem;color:var(--muted);margin-top:4px">${H(btn.dataset.assignmentDesc)}</div>` : ""}
          </div>
          <div class="field"><label>Submission Notes</label><textarea id="subNotes" rows="4" placeholder="Add any notes, summary, or links…">${H(btn.dataset.assignmentNote||"")}</textarea></div>
          <div class="field"><label>Attachment</label>
            ${fileZone("subFile", "*", "Upload your assignment file")}
            <input type="hidden" id="subFileName">
          </div>
          ${btn.dataset.assignmentFile ? `<div style="font-size:.78rem;color:var(--info)">Current: 📎 ${H(btn.dataset.assignmentFile)}</div>` : ""}
        </div>`,
        confirmLabel: isEdit ? "Update Submission" : "Submit Assignment",
        onConfirm: async (close) => {
          const payload = { submissionText: byId("subNotes")?.value||"", attachmentName: byId("subFileName")?.value || byId("subFile")?.files?.[0]?.name || btn.dataset.assignmentFile || "" };
          if (isEdit) await window.Api.updateAssignmentSubmission(Number(btn.dataset.assignmentId), payload);
          else await window.Api.submitAssignment(Number(btn.dataset.assignmentId), payload);
          close(); showToast(isEdit ? "Submission updated!" : "Assignment submitted!", "success"); await loadDashboard();
        } });
      setTimeout(() => bindFileZone("subFile"), 50);
      setTimeout(() => { byId("subFile")?.addEventListener("change", e => { const f = e.target.files[0]; if (f && byId("subFileName")) byId("subFileName").value = f.name; }); }, 80);
      return;
    }
    if (action === "delete-assignment-submission") {
      openModal({ title: "Remove Submission", body: `<p style="color:var(--muted)">Are you sure you want to remove your submission? This cannot be undone.</p>`, confirmLabel: "Remove", danger: true,
        onConfirm: async (close) => {
          await window.Api.deleteAssignmentSubmission(Number(btn.dataset.assignmentId));
          close(); showToast("Submission removed", "warning"); await loadDashboard();
        } });
      return;
    }
    if (action === "assignment-overdue-info") {
      showToast("Deadline has passed. Submission is now locked.", "warning");
      return;
    }
    if (action === "renew-loan") {
      await window.Api.renewLibraryLoan(Number(btn.dataset.loanId));
      showToast("Renewal request submitted", "success"); await loadDashboard(); return;
    }

    // ── Teacher actions ──────────────────────────────────────────
    if (action === "update-slot") {
      openModal({ title: "Update Timetable Slot",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Room</label><input id="slotRoomUpd" value="${H(btn.dataset.room)}"></div>
          <div class="field"><label>Status</label>
            <select id="slotStatusUpd"><option value="scheduled">Scheduled</option><option value="updated">Updated</option><option value="cancelled">Cancelled</option></select>
          </div>
          <div class="field"><label>Note (shown to students)</label><textarea id="slotNoteUpd" rows="2" placeholder="e.g. Room changed to B-201"></textarea></div>
        </div>`,
        confirmLabel: "Save Update",
        onConfirm: async (close) => {
          await window.Api.updateTeacherSlot(Number(btn.dataset.slotId), { room: byId("slotRoomUpd").value, status: byId("slotStatusUpd").value, note: byId("slotNoteUpd").value });
          close(); showToast("Timetable slot updated — students notified", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("slotStatusUpd")) byId("slotStatusUpd").value = btn.dataset.status || "scheduled"; }, 30);
      return;
    }
    if (action === "view-teacher-assignment-progress") {
      const assignmentId = Number(btn.dataset.assignmentId);
      const title = btn.dataset.assignmentTitle || "Assignment";
      const modal = openModal({ title: `Submissions — ${title}`, cancelLabel: "Close", confirmLabel: null,
        width: "700px",
        body: `<div style="text-align:center;padding:24px;color:var(--muted)">Loading submissions…</div>` });
      try {
        const data = await window.Api.getAssignmentSubmissions(assignmentId);
        const subs = data.submissions || [];
        const stats = data.stats || {};
        const pct = stats.total ? Math.round(((stats.submitted || 0) / stats.total) * 100) : 0;
        const bodyEl = modal?.querySelector(".modal-body");
        if (bodyEl) bodyEl.innerHTML = `
          <div class="stats-grid" style="margin-bottom:14px;grid-template-columns:repeat(4,1fr)">
            <div class="stat-card c-blue" style="padding:12px 10px"><div class="stat-icon" style="margin-bottom:6px">👥</div><div class="stat-value" style="font-size:1.3rem">${stats.total||0}</div><div class="stat-label">Total</div></div>
            <div class="stat-card c-green" style="padding:12px 10px"><div class="stat-icon" style="margin-bottom:6px">✅</div><div class="stat-value" style="font-size:1.3rem">${stats.submitted||0}</div><div class="stat-label">Submitted</div></div>
            <div class="stat-card c-orange" style="padding:12px 10px"><div class="stat-icon" style="margin-bottom:6px">⏳</div><div class="stat-value" style="font-size:1.3rem">${stats.pending||0}</div><div class="stat-label">Pending</div></div>
            <div class="stat-card c-purple" style="padding:12px 10px"><div class="stat-icon" style="margin-bottom:6px">🏆</div><div class="stat-value" style="font-size:1.3rem">${stats.graded||0}</div><div class="stat-label">Graded</div></div>
          </div>
          <div style="margin-bottom:14px">${progressBar(pct)}<span style="font-size:.74rem;color:var(--muted);margin-top:4px;display:block">${pct}% of students have submitted</span></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Student</th><th>Roll No.</th><th>Status</th><th>Score</th><th>Submitted</th><th>File</th></tr></thead>
              <tbody>
                ${subs.length ? subs.map(s => `<tr>
                  <td><strong>${H(s.student_name||"")}</strong></td>
                  <td style="font-size:.78rem">${H(s.roll_no||"—")}</td>
                  <td>${statusBadge(s.status)}</td>
                  <td>${s.score != null ? `<strong>${s.score}</strong>` : "<span style='color:var(--muted)'>—</span>"}</td>
                  <td style="font-size:.76rem;color:var(--muted)">${s.submitted_at ? formatDate(s.submitted_at) : "—"}</td>
                  <td>${s.file_name ? `<button class="btn btn-info btn-xs" data-action="download-assignment-submission" data-submission-id="${s.submission_id}" data-file-name="${H(s.file_name)}">📎 Download</button>` : "<span style='color:var(--muted)'>—</span>"}</td>
                </tr>`).join("") : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">No submissions yet</td></tr>`}
              </tbody>
            </table>
          </div>`;
      } catch (err) {
        const bodyEl = modal?.querySelector(".modal-body");
        if (bodyEl) bodyEl.innerHTML = `<div style="color:var(--danger);padding:16px">${H(err.message || "Failed to load submissions")}</div>`;
      }
      return;
    }
    if (action === "download-assignment-submission") {
      await handleAttachmentDownload("assignment_submission", Number(btn.dataset.submissionId), btn.dataset.fileName || "submission.txt");
      showToast("Submission downloaded", "success");
      return;
    }
    if (action === "edit-teacher-assignment") {
      openModal({ title: "Edit Assignment",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Title</label><input id="etaTitle" value="${H(btn.dataset.assignmentTitle||"")}"></div>
          <div class="field"><label>Description</label><textarea id="etaDesc" rows="3">${H(btn.dataset.assignmentDescription||"")}</textarea></div>
          <div class="form-grid">
            <div class="field"><label>Due Date</label><input type="date" id="etaDue" value="${H(btn.dataset.assignmentDue||"")}"></div>
            <div class="field"><label>Max Score</label><input type="number" id="etaMax" value="${btn.dataset.assignmentMax||20}"></div>
          </div>
          <div class="field"><label>Status</label>
            <select id="etaStatus"><option value="open">Open</option><option value="closed">Closed</option></select>
          </div>
          <div class="field"><label>Replace Attachment</label>${fileZone("etaFile", "*", "Upload new attachment (optional)")}</div>
        </div>`,
        confirmLabel: "Update Assignment",
        onConfirm: async (close) => {
          const payload = { title: byId("etaTitle").value, description: byId("etaDesc").value, dueDate: byId("etaDue").value, maxScore: Number(byId("etaMax").value), status: byId("etaStatus").value };
          const f = byId("etaFile")?.files?.[0];
          if (f) { payload.attachmentName = f.name; payload.attachmentPath = f.name; }
          await window.Api.updateTeacherAssignment(Number(btn.dataset.assignmentId), payload);
          close(); showToast("Assignment updated", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("etaStatus")) byId("etaStatus").value = btn.dataset.assignmentStatus || "open"; bindFileZone("etaFile"); }, 30);
      return;
    }
    if (action === "delete-teacher-assignment") {
      openModal({
        title: "Delete Assignment",
        body: `<div style="color:var(--muted)">Delete <strong>${H(btn.dataset.assignmentTitle || "this assignment")}</strong>? This removes all linked submissions.</div>`,
        confirmLabel: "Delete",
        danger: true,
        onConfirm: async (close) => {
          await window.Api.deleteTeacherAssignment(Number(btn.dataset.assignmentId));
          close();
          showToast("Assignment deleted", "warning");
          await loadDashboard();
        },
      });
      return;
    }
    if (action === "contact-student") {
      openModal({ title: `Notify ${btn.dataset.studentName}`,
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Message Template</label>
            <select id="notifTemplate">
              <option value="Faculty Update">General Update</option>
              <option value="Attendance Alert">Attendance Alert</option>
              <option value="Assignment Reminder">Assignment Reminder</option>
              <option value="Meeting Request">Meeting Request</option>
            </select>
          </div>
          <div class="field"><label>Title</label><input id="notifTitle" value="Faculty Message"></div>
          <div class="field"><label>Message</label><textarea id="notifMsg" rows="3">Please review your academic progress and feel free to reach out during office hours.</textarea></div>
        </div>`,
        confirmLabel: "Send Notification",
        onConfirm: async (close) => {
          await window.Api.notifyStudent({ studentId: Number(btn.dataset.studentId), title: byId("notifTitle").value, message: byId("notifMsg").value });
          close(); showToast(`${btn.dataset.studentName} notified`, "success");
        } });
      setTimeout(() => {
        byId("notifTemplate")?.addEventListener("change", e => {
          const templates = { "Faculty Update": "Please review your academic progress and feel free to reach out during office hours.", "Attendance Alert": "Your attendance has fallen below the required threshold. Please ensure regular attendance.", "Assignment Reminder": "Please submit your pending assignments before the deadline.", "Meeting Request": "Please meet me during office hours to discuss your academic performance." };
          if (byId("notifMsg")) byId("notifMsg").value = templates[e.target.value] || "";
          if (byId("notifTitle")) byId("notifTitle").value = e.target.value;
        });
      }, 30);
      return;
    }
    if (action === "view-student-detail") {
      openModal({ title: btn.dataset.studentName, cancelLabel: "Close", confirmLabel: null,
        body: `<div class="info-grid">
          ${[["Roll No.", btn.dataset.studentRoll||"—"], ["Email", btn.dataset.studentEmail||"—"], ["CGPA", btn.dataset.studentCgpa||"—"], ["Attendance", `${btn.dataset.studentAttendance||0}%`], ["Risk Status", statusBadge(btn.dataset.studentRisk === "at_risk" ? "pending" : "active")]].map(([k,v]) => `<div class="info-row"><div class="info-key">${k}</div><div class="info-val">${v}</div></div>`).join("")}
        </div>` });
      return;
    }

    // ── Admin actions ────────────────────────────────────────────
    if (action === "add-user") {
      const depts = state.dashboard?.departments || [];
      openModal({ title: "Create New User", width: "600px",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-grid">
            <div class="field"><label>Full Name</label><input id="nuName" placeholder="Jane Smith" required></div>
            <div class="field"><label>Email</label><input type="email" id="nuEmail" placeholder="jane@college.edu" required></div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Role</label>
              <select id="nuRole"><option value="student">Student</option><option value="teacher">Faculty</option><option value="admin">Admin</option></select>
            </div>
            <div class="field"><label>Department</label>
              <select id="nuDept">${depts.map(d2 => `<option value="${H(d2.code)}">${H(d2.name)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Roll No / Employee ID (optional)</label><input id="nuId" placeholder="2024CS001"></div>
            <div class="field"><label>Temporary Password</label><input id="nuPwd" value="changeme123"></div>
          </div>
          <div class="field"><label>Phone (optional)</label><input id="nuPhone" placeholder="+91 99999 99999"></div>
        </div>`,
        confirmLabel: "Create User",
        onConfirm: async (close) => {
          await window.Api.createUser({ name: byId("nuName").value, email: byId("nuEmail").value, role: byId("nuRole").value, department: byId("nuDept").value, identifier: byId("nuId").value, password: byId("nuPwd").value, phone: byId("nuPhone").value });
          close(); showToast("User created successfully", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "view-user") {
      openModal({ title: btn.dataset.userName, cancelLabel: "Close", confirmLabel: null,
        body: `<div class="info-grid">
          ${[["Email", btn.dataset.userEmail||"—"], ["Role", statusBadge(btn.dataset.userRole)], ["Department", btn.dataset.userDepartment||"—"], ["Status", statusBadge(btn.dataset.userStatus)], ["Last Login", btn.dataset.userLastLogin||"Never"]].map(([k,v]) => `<div class="info-row"><div class="info-key">${k}</div><div class="info-val">${v}</div></div>`).join("")}
        </div>` });
      return;
    }
    if (action === "edit-user") {
      openModal({ title: `Edit: ${btn.dataset.userName}`, width: "560px",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Full Name</label><input id="euName" value="${H(btn.dataset.userName||"")}"></div>
          <div class="field"><label>Email</label><input type="email" id="euEmail" value="${H(btn.dataset.userEmail||"")}"></div>
          <div class="form-grid">
            <div class="field"><label>Role</label>
              <select id="euRole"><option value="student">Student</option><option value="teacher">Faculty</option><option value="admin">Admin</option></select>
            </div>
            <div class="field"><label>Department Code</label><input id="euDept" value="${H(btn.dataset.userDepartment||"")}"></div>
          </div>
        </div>`,
        confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          await window.Api.updateUser(Number(btn.dataset.userId), { name: byId("euName").value, email: byId("euEmail").value, role: byId("euRole").value, department: byId("euDept").value });
          close(); showToast("User updated", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("euRole")) byId("euRole").value = btn.dataset.userRole || "student"; }, 30);
      return;
    }
    if (action === "manage-student-enrollment") {
      const courses = state.dashboard?.courses || [];
      const enrolled = new Set(String(btn.dataset.enrolledCourseIds || "").split(",").filter(Boolean).map(Number));
      openModal({
        title: `Manage Enrollments — ${btn.dataset.studentName}`,
        width: "700px",
        body: `
          <div style="max-height:380px;overflow:auto">
            <table class="data-table">
              <thead><tr><th>Course</th><th>Section</th><th>Semester</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${courses.length ? courses.map(c => `<tr>
                  <td><strong>${H(c.code)}</strong> · ${H(c.name)}</td>
                  <td>${H(c.section || "-")}</td>
                  <td>${c.semester}</td>
                  <td>${enrolled.has(c.id) ? `<span class="badge badge-success">Enrolled</span>` : `<span class="badge badge-neutral">Not Enrolled</span>`}</td>
                  <td>${enrolled.has(c.id)
                    ? `<button class="btn btn-danger btn-xs" data-action="unenroll-course" data-student-id="${btn.dataset.studentId}" data-course-id="${c.id}">Remove</button>`
                    : `<button class="btn btn-primary btn-xs" data-action="enroll-course" data-student-id="${btn.dataset.studentId}" data-course-id="${c.id}">Assign</button>`}
                  </td>
                </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--muted)">No courses found</td></tr>`}
              </tbody>
            </table>
          </div>
          <div style="font-size:.74rem;color:var(--muted);margin-top:10px">Tip: assigning courses maps student attendance, timetable, assignments, and results workflow.</div>
        `,
        confirmLabel: null,
      });
      return;
    }
    if (action === "enroll-course") {
      await window.Api.enrollStudent({ studentId: Number(btn.dataset.studentId), courseId: Number(btn.dataset.courseId) });
      showToast("Student enrolled to course", "success");
      await loadDashboard();
      return;
    }
    if (action === "unenroll-course") {
      await window.Api.unenrollStudent({ studentId: Number(btn.dataset.studentId), courseId: Number(btn.dataset.courseId) });
      showToast("Enrollment removed", "warning");
      await loadDashboard();
      return;
    }
    if (action === "reset-password") {
      openModal({ title: `Reset Password for ${btn.dataset.userName}`,
        body: `<div class="field"><label>New Temporary Password</label><input id="resetPwd" value="changeme123"></div>`,
        confirmLabel: "Reset Password",
        onConfirm: async (close) => {
          await window.Api.resetUserPassword(Number(btn.dataset.userId), byId("resetPwd").value);
          close(); showToast("Password reset — notify the user of their new password", "success");
        } });
      return;
    }
    if (action === "toggle-status") {
      const userId = Number(btn.dataset.userId);
      const next = btn.dataset.currentStatus === "active" ? "suspended" : "active";
      try {
        await window.Api.updateUserStatus(userId, next);
        showToast(`User ${next}`, next === "suspended" ? "warning" : "success");
        // Update DOM in-place: find the row and swap status badge + button
        const row = btn.closest("tr");
        if (row) {
          // Update status badge cell (4th td — index 3)
          const statusCell = row.cells[3];
          if (statusCell) statusCell.innerHTML = statusBadge(next);
          // Swap button appearance & dataset
          btn.className = `btn btn-${next === "active" ? "danger" : "success"} btn-sm`;
          btn.textContent = next === "active" ? "Suspend" : "Restore";
          btn.dataset.currentStatus = next;
          // Update dashboard state so subsequent re-renders are correct
          const users = state.dashboard?.users || [];
          const idx = users.findIndex(u => u.id === userId);
          if (idx !== -1) users[idx].status = next;
        }
      } catch (err) { showToast(err.message || "Action failed", "error"); }
      return;
    }
    if (action === "archive-user") {
      const userId = Number(btn.dataset.userId);
      try {
        await window.Api.updateUserStatus(userId, "archived");
        showToast("User archived", "warning");
        // Remove the row entirely
        const row = btn.closest("tr");
        if (row) row.remove();
        const users = state.dashboard?.users || [];
        const idx = users.findIndex(u => u.id === userId);
        if (idx !== -1) users.splice(idx, 1);
      } catch (err) { showToast(err.message || "Action failed", "error"); }
      return;
    }
    if (action === "create-dept") {
      openModal({ title: "Create Department",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-grid">
            <div class="field"><label>Department Code</label><input id="ndCode" placeholder="CSE"></div>
            <div class="field"><label>Department Name</label><input id="ndName" placeholder="Computer Science & Engineering"></div>
          </div>
          <div class="field"><label>Head of Department</label><input id="ndHod" placeholder="Dr. Name"></div>
        </div>`,
        confirmLabel: "Create Department",
        onConfirm: async (close) => {
          await window.Api.createDepartment({ code: byId("ndCode").value, name: byId("ndName").value, hodName: byId("ndHod").value });
          close(); showToast("Department created", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "manage-department") {
      openModal({ title: `Manage: ${btn.dataset.departmentName}`,
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-grid">
            <div class="field"><label>Code</label><input id="mdCode" value="${H(btn.dataset.departmentCode||"")}"></div>
            <div class="field"><label>Name</label><input id="mdName" value="${H(btn.dataset.departmentName||"")}"></div>
          </div>
          <div class="field"><label>Head of Department</label><input id="mdHod" value="${H(btn.dataset.departmentHod||"")}"></div>
          <div class="field"><label>Status</label>
            <select id="mdActive"><option value="1">Active</option><option value="0">Inactive</option></select>
          </div>
        </div>`,
        confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          await window.Api.manageDepartment(Number(btn.dataset.departmentId), { code: byId("mdCode").value, name: byId("mdName").value, hodName: byId("mdHod").value, active: byId("mdActive").value });
          close(); showToast("Department updated", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("mdActive")) byId("mdActive").value = btn.dataset.departmentActive || "1"; }, 30);
      return;
    }
    if (action === "add-course") {
      const depts = state.dashboard?.departments || [];
      const teachers = (state.dashboard?.users || []).filter(u => u.role === "teacher");
      openModal({ title: "Add New Course", width: "620px",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="form-grid">
            <div class="field"><label>Course Code</label><input id="ncCode" placeholder="CS601"></div>
            <div class="field"><label>Course Name</label><input id="ncName" placeholder="Advanced AI Systems"></div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Department</label>
              <select id="ncDept">${depts.map(d2 => `<option value="${H(d2.code)}">${H(d2.code)} – ${H(d2.name)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Teacher</label>
              <select id="ncTeacher"><option value="">Select teacher</option>${teachers.map(t => `<option value="${t.id}">${H(t.name)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="form-grid-3">
            <div class="field"><label>Semester</label><input type="number" id="ncSem" value="6" min="1" max="8"></div>
            <div class="field"><label>Section</label><input id="ncSection" value="A"></div>
            <div class="field"><label>Credits</label><input type="number" id="ncCredits" value="4" min="1" max="6"></div>
          </div>
        </div>`,
        confirmLabel: "Create Course",
        onConfirm: async (close) => {
          await window.Api.createCourse({ code: byId("ncCode").value, name: byId("ncName").value, department: byId("ncDept").value, teacherId: Number(byId("ncTeacher").value), semester: Number(byId("ncSem").value), section: byId("ncSection").value, credits: Number(byId("ncCredits").value), status: "active" });
          close(); showToast("Course created", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "manage-course") {
      const teachers = (state.dashboard?.users || []).filter(u => u.role === "teacher");
      const selectedCourse = (state.dashboard?.courses || []).find(c => c.id === Number(btn.dataset.courseId));
      const coursePolicies = (state.dashboard?.marksAudit || []).filter(item => item.course_code === selectedCourse?.code);
      openModal({ title: `Manage Course: ${btn.dataset.courseName}`,
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Assigned Teacher</label>
            <select id="mcTeacher"><option value="">Keep current</option>${teachers.map(t => `<option value="${t.id}"${t.id == btn.dataset.courseTeacherId ? " selected" : ""}>${H(t.name)}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Course Status</label>
            <select id="mcStatus"><option value="active">Active</option><option value="review">Under Review</option><option value="archived">Archived</option></select>
          </div>
          <div class="field">
            <label>Assessment Max Marks (Admin Controlled)</label>
            <div class="mini-list">
              ${STANDARD_EXAM_TYPES.map(type => {
                const existing = coursePolicies.find(item => item.exam_type === type);
                return `<div class="mini-list-item">
                  <span>${H(type)}</span>
                  <input id="policy-${type.replace(/\s+/g, "-")}" type="number" min="1" max="200" value="${existing?.max_score || ""}" placeholder="Not set" style="width:90px">
                </div>`;
              }).join("")}
            </div>
          </div>
          <div class="field"><label>Notes</label><textarea id="mcNote" rows="2" placeholder="Optional note…"></textarea></div>
        </div>`,
        confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          const payload = { status: byId("mcStatus").value, note: byId("mcNote").value };
          const teacherId = byId("mcTeacher").value;
          if (teacherId) payload.teacherId = Number(teacherId);
          payload.assessmentPolicies = STANDARD_EXAM_TYPES.map(type => ({
            examType: type,
            maxScore: Number(byId(`policy-${type.replace(/\s+/g, "-")}`)?.value || 0),
          })).filter(item => item.maxScore > 0);
          await window.Api.updateCourse(Number(btn.dataset.courseId), payload);
          close(); showToast("Course updated", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("mcStatus")) byId("mcStatus").value = btn.dataset.courseStatus || "active"; }, 30);
      return;
    }
    if (action === "export-courses") {
      await downloadCsvResponse(window.Api.exportCoursesCsv(), "courses-export.csv");
      showToast("Courses exported to CSV", "success"); return;
    }
    if (action === "open-create-slot") {
      const courses = state.dashboard?.courses || [];
      openModal({ title: "Create Timetable Slot", width: "560px",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Course</label>
            <select id="nsCourseSel">${courses.map(c => `<option value="${c.id}">${H(c.code)} – ${H(c.name)} (Sec ${H(c.section)})</option>`).join("")}</select>
          </div>
          <div class="form-grid">
            <div class="field"><label>Day</label>
              <select id="nsDay"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select>
            </div>
            <div class="field"><label>Slot Type</label>
              <select id="nsType"><option value="Lecture">Lecture</option><option value="Lab">Lab</option><option value="Tutorial">Tutorial</option></select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Start Time</label><input type="time" id="nsStart" value="09:00"></div>
            <div class="field"><label>End Time</label><input type="time" id="nsEnd" value="10:00"></div>
          </div>
          <div class="field"><label>Room</label><input id="nsRoom" placeholder="e.g. A-101"></div>
        </div>`,
        confirmLabel: "Create Slot",
        onConfirm: async (close) => {
          await window.Api.saveTimetable({ courseId: Number(byId("nsCourseSel").value), dayOfWeek: byId("nsDay").value, startTime: byId("nsStart").value, endTime: byId("nsEnd").value, room: byId("nsRoom").value, slotType: byId("nsType").value, status: "scheduled" });
          close(); showToast("Timetable slot created", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "check-timetable-clash") {
      const res = await window.Api.checkTimetableClashes();
      if (!res.hasClash) { showToast("✓ No timetable clashes detected", "success"); }
      else {
        openModal({ title: "Timetable Clashes Found", cancelLabel: "Close", confirmLabel: null,
          body: `<div style="color:var(--danger);font-weight:700;margin-bottom:12px">⚠️ ${res.clashes?.length || 0} clash(es) found</div>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Day</th><th>Time</th><th>Room</th><th>Courses</th></tr></thead>
            <tbody>${(res.clashes || []).map(c => `<tr><td>${H(c.day||"")}</td><td>${H(c.startTime||"")}–${H(c.endTime||"")}</td><td>${H(c.room||"")}</td><td>${H(c.courses||"")}</td></tr>`).join("") || tableEmpty(4, "No clash details")}</tbody>
          </table></div>` });
      }
      return;
    }
    if (action === "edit-admin-slot") {
      openModal({ title: "Edit Timetable Slot",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Room</label><input id="asRoom" value="${H(btn.dataset.room||"")}"></div>
          <div class="field"><label>Status</label>
            <select id="asStatus"><option value="scheduled">Scheduled</option><option value="updated">Updated</option><option value="cancelled">Cancelled</option></select>
          </div>
          <div class="field"><label>Note</label><textarea id="asNote" rows="2" placeholder="e.g. Room changed due to maintenance"></textarea></div>
        </div>`,
        confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          await window.Api.saveTimetable({ courseId: Number(btn.dataset.courseId), dayOfWeek: btn.dataset.day, startTime: btn.dataset.start, endTime: btn.dataset.end, room: byId("asRoom").value, slotType: btn.dataset.type || "Lecture", status: byId("asStatus").value, note: byId("asNote").value }, Number(btn.dataset.slotId));
          close(); showToast("Slot updated", "success"); await loadDashboard();
        } });
      setTimeout(() => { if (byId("asStatus")) byId("asStatus").value = btn.dataset.status || "scheduled"; }, 30);
      return;
    }
    if (action === "view-grievance") {
      openModal({ title: `Grievance #${btn.dataset.grievanceId}`, cancelLabel: "Close", confirmLabel: null,
        body: `<div class="info-grid">
          ${[["Submitted By", H(btn.dataset.grievanceSubmittedBy||"—")], ["Category", H(btn.dataset.grievanceCategory||"—")], ["Subject", H(btn.dataset.grievanceSubject||"—")], ["Priority", statusBadge(btn.dataset.grievancePriority||"medium")], ["Status", statusBadge(btn.dataset.grievanceStatus||"open")], ["Description", H(btn.dataset.grievanceMessage||"No description")], ["Resolution", H(btn.dataset.grievanceNote||"Not yet resolved")]].map(([k,v]) => `<div class="info-row"><div class="info-key">${k}</div><div class="info-val">${v}</div></div>`).join("")}
        </div>` });
      return;
    }
    if (action === "resolve-grievance") {
      openModal({ title: `Resolve Grievance: ${btn.dataset.subject}`,
        body: `<div style="padding:12px;background:var(--surface-raise);border-radius:var(--r-md);border:1px solid var(--border);margin-bottom:14px;font-size:.86rem">
          <div><strong>${H(btn.dataset.grievanceBy||"")}</strong> · ${H(btn.dataset.grievanceCat||"")}</div>
          <div style="color:var(--muted);margin-top:4px">${H(btn.dataset.grievanceMsg||"")}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Update Status</label>
            <select id="grvStatus"><option value="in_review">In Review</option><option value="resolved" selected>Resolved</option><option value="closed">Closed</option></select>
          </div>
          <div class="field"><label>Resolution Note</label><textarea id="grvNote" rows="3" placeholder="Describe the action taken or resolution provided…"></textarea></div>
        </div>`,
        confirmLabel: "Save Resolution",
        onConfirm: async (close) => {
          await window.Api.resolveGrievance(Number(btn.dataset.grievanceId), byId("grvNote").value, byId("grvStatus").value);
          close(); showToast("Grievance updated", "success"); await loadDashboard();
        } });
      return;
    }
    if (action === "review-workflow-request") {
      openModal({
        title: `Review Request #${btn.dataset.requestId}`,
        subtitle: `${H(titleize(btn.dataset.requestType || ""))} · ${H(btn.dataset.studentName || "")}`,
        body: `
          <div style="padding:10px 12px;background:var(--surface-raise);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:12px">
            ${H(btn.dataset.requestReason || "No reason provided")}
          </div>
          <div class="field">
            <label>Decision</label>
            <select id="wfDecision"><option value="approved">Approve</option><option value="rejected">Reject</option></select>
          </div>
          <div class="field" style="margin-top:10px">
            <label>Review Note</label>
            <textarea id="wfReviewNote" rows="3" placeholder="Optional note for the student"></textarea>
          </div>
        `,
        confirmLabel: "Submit Review",
        onConfirm: async (close) => {
          const res = await window.Api.reviewWorkflowRequest(Number(btn.dataset.requestId), byId("wfDecision").value, byId("wfReviewNote").value);
          close();
          const markMsg = res?.autoMarkedAttendance ? ` (${res.autoMarkedAttendance} attendance entries auto-marked)` : "";
          showToast(`Request reviewed${markMsg}`, "success");
          await loadDashboard();
        },
      });
      return;
    }
    if (action === "open-admin-add-fee") {
      const students = (state.dashboard?.users || []).filter(u => u.role === "student" && u.status === "active");
      openModal({
        title: "Create Fee Item",
        width: "620px",
        body: `
          <div class="form-grid">
            <div class="field"><label>Fee Head</label><input id="feeHeadInp" placeholder="Transport Fee"></div>
            <div class="field"><label>Term</label><input id="feeTermInp" placeholder="Semester 6"></div>
          </div>
          <div class="form-grid" style="margin-top:10px">
            <div class="field"><label>Amount</label><input type="number" id="feeAmtInp" min="1" step="0.01"></div>
            <div class="field"><label>Due Date</label><input type="date" id="feeDueInp"></div>
          </div>
          <div class="field" style="margin-top:10px">
            <label>Target</label>
            <select id="feeTargetInp"><option value="student">Specific Student</option><option value="all_students">All Students</option></select>
          </div>
          <div class="field" style="margin-top:10px" id="feeStudentWrap">
            <label>Student</label>
            <select id="feeStudentInp">${students.map(s => `<option value="${s.id}">${H(s.name)} (${H(s.roll_no || "—")})</option>`).join("")}</select>
          </div>
          <div class="field" style="margin-top:10px"><label>Note (optional)</label><textarea id="feeNoteInp" rows="2"></textarea></div>
        `,
        confirmLabel: "Create Fee",
        onConfirm: async (close) => {
          await window.Api.createFeeItems({
            feeHead: byId("feeHeadInp").value,
            termLabel: byId("feeTermInp").value,
            amount: Number(byId("feeAmtInp").value),
            dueDate: byId("feeDueInp").value,
            target: byId("feeTargetInp").value,
            studentId: Number(byId("feeStudentInp")?.value || 0),
            note: byId("feeNoteInp").value,
          });
          close();
          showToast("Fee item(s) created", "success");
          await loadDashboard();
        },
      });
      setTimeout(() => {
        byId("feeTargetInp")?.addEventListener("change", e => {
          byId("feeStudentWrap")?.classList.toggle("hidden", e.target.value !== "student");
        });
      }, 50);
      return;
    }
    if (action === "edit-notice") {
      openModal({ title: "Edit Notice",
        body: `<div style="display:flex;flex-direction:column;gap:12px">
          <div class="field"><label>Title</label><input id="enTitle" value="${H(btn.dataset.noticeTitle||"")}"></div>
          <div class="form-grid">
            <div class="field"><label>Audience</label>
              <select id="enAudience"><option value="all">All</option><option value="student">Students</option><option value="teacher">Faculty</option></select>
            </div>
            <div class="field"><label>Priority</label>
              <select id="enPriority"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            </div>
          </div>
          <div class="field"><label>Visibility</label>
            <select id="enActive"><option value="1">Active</option><option value="0">Archived</option></select>
          </div>
          <div class="field"><label>Message</label><textarea id="enMessage" rows="4">${H(btn.dataset.noticeMessage||"")}</textarea></div>
        </div>`,
        confirmLabel: "Save Changes",
        onConfirm: async (close) => {
          await window.Api.updateNotice(Number(btn.dataset.noticeId), { title: byId("enTitle").value, audience: byId("enAudience").value, priority: byId("enPriority").value, message: byId("enMessage").value, active: byId("enActive").value === "1" });
          close(); showToast("Notice updated", "success"); await loadDashboard();
        } });
      setTimeout(() => {
        if (byId("enAudience")) byId("enAudience").value = btn.dataset.noticeAudience||"all";
        if (byId("enPriority")) byId("enPriority").value = btn.dataset.noticePriority||"medium";
        if (byId("enActive")) byId("enActive").value = btn.dataset.noticeActive || "1";
      }, 30);
      return;
    }
    if (action === "unpublish-notice") {
      await window.Api.unpublishNotice(Number(btn.dataset.noticeId));
      showToast("Notice unpublished", "warning"); await loadDashboard(); return;
    }
    if (action === "republish-notice") {
      await window.Api.updateNotice(Number(btn.dataset.noticeId), { active: true });
      showToast("Notice republished", "success"); await loadDashboard(); return;
    }
    if (action === "export-audit") {
      const logs = state.dashboard?.auditLogs || [];
      exportCsv(
        "audit-log.csv",
        ["Time", "Actor", "Action", "Entity", "Details"],
        logs.map(l => [l.created_at, l.actor_name, l.action, l.entity_type, l.details || ""])
      );
      showToast("Audit log exported", "success");
      return;
    }
    if (action === "export-grievances") {
      const rows = (state.dashboard?.grievances || []).map(g => [g.id, g.submitted_by, g.category, g.subject, g.priority, g.status, g.created_at]);
      exportCsv("grievances-report.csv", ["ID", "Submitted By", "Category", "Subject", "Priority", "Status", "Created At"], rows);
      showToast("Grievance report exported", "success");
      return;
    }
    if (action === "export-users") {
      const rows = (state.dashboard?.users || []).map(u => [u.id, u.name, u.email, u.role, u.department || "", u.status, u.last_login_at || ""]);
      exportCsv("user-directory.csv", ["ID", "Name", "Email", "Role", "Department", "Status", "Last Login"], rows);
      showToast("User directory exported", "success");
      return;
    }
    if (action === "export-attendance") {
      await downloadCsvResponse(window.Api.exportAttendanceCsv(), "attendance-report.csv");
      showToast("Attendance report exported", "success");
      return;
    }
    if (action === "export-marks") {
      await downloadCsvResponse(window.Api.exportMarksCsv(), "marks-summary.csv");
      showToast("Marks summary exported", "success");
      return;
    }

    // Notification read
    if (btn.dataset.notifId) {
      await window.Api.readNotification(Number(btn.dataset.notifId));
      loadNotifications(); return;
    }

  } catch (err) {
    showToast(err.message || "Action failed", "error");
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════════

function boot() {
  if (!protectPage()) return;
  startClock();
  initNav();
  initNotifBtn();
  updateSectionLabel(state.ui.activeSection);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onClick);
  loadDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
