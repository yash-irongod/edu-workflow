"use strict";

function resolveApiBase() {
  // Supports Live Server on LAN and local dev.
  // Priority:
  // 1) window.API_BASE (manual override)
  // 2) localStorage apiBase (persisted override)
  // 3) querystring ?apiBase=http://host:5000
  // 4) default: same hostname as frontend, port 5000
  try {
    if (typeof window !== "undefined" && window.API_BASE) return String(window.API_BASE);
    const stored = localStorage.getItem("apiBase");
    if (stored) return stored;
    const qs = new URLSearchParams(window.location.search || "");
    const q = qs.get("apiBase") || qs.get("api");
    if (q) return q;
  } catch { /* ignore */ }

  // If opened as file://, hostname may be empty.
  const host = (window.location && window.location.hostname) ? window.location.hostname : "127.0.0.1";
  return `http://${host}:5000`;
}

const API_BASE = resolveApiBase();

const Session = {
  get() {
    return {
      userId:     localStorage.getItem("userId"),
      role:       localStorage.getItem("role"),
      name:       localStorage.getItem("name"),
      email:      localStorage.getItem("email"),
      rollNo:     localStorage.getItem("rollNo"),
      employeeId: localStorage.getItem("employeeId"),
    };
  },
  save(payload) {
    Object.entries(payload || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) localStorage.setItem(k, String(v));
    });
  },
  clear() {
    ["userId","role","name","email","rollNo","employeeId"].forEach(k => localStorage.removeItem(k));
  },
};

async function request(path, options = {}) {
  const sess = Session.get();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (sess.role)   headers["X-Role"]    = sess.role;
  if (sess.userId) headers["X-User-Id"] = sess.userId;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    throw new Error(`Could not fetch backend at ${API_BASE}. Make sure backend is running and reachable.`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed ${res.status}`);
  return body;
}

function authHeaders(extra = {}) {
  const sess = Session.get();
  const headers = { ...extra };
  if (sess.role) headers["X-Role"] = sess.role;
  if (sess.userId) headers["X-User-Id"] = sess.userId;
  return headers;
}

function buildQuery(filters = {}) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const q = p.toString();
  return q ? `?${q}` : "";
}

const Api = {
  /* ── Auth ──────────────────────────────────────────────── */
  login(email, password) {
    return request("/login", { method:"POST", body: JSON.stringify({email, password}) });
  },

  /* ── Me / Profile ──────────────────────────────────────── */
  me() { return request("/api/me"); },
  updateProfile(payload) {
    return request("/api/me", { method:"PATCH", body: JSON.stringify(payload) });
  },
  changePassword(payload) {
    return request("/api/me/change-password", { method:"POST", body: JSON.stringify(payload) });
  },

  /* ── Notifications ─────────────────────────────────────── */
  notifications() { return request("/api/me/notifications"); },
  readNotification(id) {
    return request(`/api/me/notifications/${id}/read`, { method:"POST" });
  },

  /* ── Student ───────────────────────────────────────────── */
  studentDashboard(filters = {}) {
    return request(`/api/student/dashboard${buildQuery(filters)}`);
  },
  studentAttendance(filters = {}) {
    return request(`/api/student/attendance${buildQuery(filters)}`);
  },

  // Assignments
  submitAssignment(assignmentId, payload) {
    return request(`/api/student/assignments/${assignmentId}/submit`, {
      method:"POST", body: JSON.stringify(payload),
    });
  },
  updateAssignmentSubmission(assignmentId, payload) {
    return request(`/api/student/assignments/${assignmentId}/submit`, {
      method:"PATCH", body: JSON.stringify(payload),
    });
  },
  deleteAssignmentSubmission(assignmentId) {
    return request(`/api/student/assignments/${assignmentId}/submit`, { method:"DELETE" });
  },

  // Requests & Grievances
  submitStudentRequest(payload) {
    return request("/api/student/requests", { method:"POST", body: JSON.stringify(payload) });
  },
  submitGrievance(payload) {
    return request("/api/student/grievances", { method:"POST", body: JSON.stringify(payload) });
  },

  // Fees
  payFees(feeIds) {
    return request("/api/student/fees/pay", { method:"POST", body: JSON.stringify({feeIds}) });
  },

  // Placements
  applyPlacementWithDetails(placementId, payload) {
    return request(`/api/student/placements/${placementId}/apply`, {
      method:"POST", body: JSON.stringify(payload),
    });
  },

  // Library
  renewLibraryLoan(loanId) {
    return request(`/api/student/library/${loanId}/renew`, { method:"POST" });
  },

  // Documents (ID card, bonafide)
  getStudentDocument(docType) {
    return request(`/api/student/documents/${docType}`);
  },
  async downloadAttachment(itemType, itemId) {
    const res = await fetch(`${API_BASE}/api/files/${itemType}/${itemId}`, { headers: authHeaders() });
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      let msg = `Request failed ${res.status}`;
      if (contentType.includes("application/json")) {
        const body = await res.json().catch(() => ({}));
        msg = body.error || msg;
      }
      throw new Error(msg);
    }
    if (contentType.includes("application/json")) return { type: "json", body: await res.json() };
    return { type: "file", response: res };
  },

  /* ── Teacher ───────────────────────────────────────────── */
  teacherDashboard() { return request("/api/teacher/dashboard"); },
  teacherAttendance(filters = {}) {
    return request(`/api/teacher/attendance${buildQuery(filters)}`);
  },
  getAttendanceSession(courseId, date) {
    return request(`/api/teacher/attendance/session?courseId=${courseId}&date=${date}`);
  },
  getMarksSession(courseId, examType) {
    return request(`/api/teacher/marks/session?courseId=${courseId}&examType=${encodeURIComponent(examType)}`);
  },
  getAssignmentSubmissions(assignmentId) {
    return request(`/api/teacher/assignments/${assignmentId}/submissions`);
  },
  submitTeacherAttendance(payload) {
    return request("/api/teacher/attendance", { method:"POST", body: JSON.stringify(payload) });
  },
  submitTeacherMarks(payload) {
    return request("/api/teacher/marks", { method:"POST", body: JSON.stringify(payload) });
  },
  createTeacherAssignment(payload) {
    return request("/api/teacher/assignments", { method:"POST", body: JSON.stringify(payload) });
  },
  updateTeacherAssignment(id, payload) {
    return request(`/api/teacher/assignments/${id}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  deleteTeacherAssignment(id) {
    return request(`/api/teacher/assignments/${id}`, { method:"DELETE" });
  },
  notifyStudent(payload) {
    return request("/api/teacher/notifications", { method:"POST", body: JSON.stringify(payload) });
  },
  updateTeacherSlot(slotId, payload) {
    return request(`/api/teacher/timetable/${slotId}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  createTeacherNotice(payload) {
    return request("/api/teacher/notices", { method:"POST", body: JSON.stringify(payload) });
  },

  /* ── Admin ─────────────────────────────────────────────── */
  adminDashboard() { return request("/api/admin/dashboard"); },

  // Users
  createUser(payload) {
    return request("/api/admin/users", { method:"POST", body: JSON.stringify(payload) });
  },
  updateUser(userId, payload) {
    return request(`/api/admin/users/${userId}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  updateUserStatus(userId, status) {
    return request(`/api/admin/users/${userId}/status`, { method:"PATCH", body: JSON.stringify({status}) });
  },
  resetUserPassword(userId, newPassword) {
    return request(`/api/admin/users/${userId}/reset-password`, {
      method:"POST", body: JSON.stringify({newPassword}),
    });
  },

  // Departments
  createDepartment(payload) {
    return request("/api/admin/departments", { method:"POST", body: JSON.stringify(payload) });
  },
  manageDepartment(deptId, payload) {
    return request(`/api/admin/departments/${deptId}`, { method:"PATCH", body: JSON.stringify(payload) });
  },

  // Courses
  createCourse(payload) {
    return request("/api/admin/courses", { method:"POST", body: JSON.stringify(payload) });
  },
  updateCourse(courseId, payload) {
    return request(`/api/admin/courses/${courseId}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  exportCoursesCsv() {
    const sess = Session.get();
    const h = {};
    if (sess.role)   h["X-Role"]    = sess.role;
    if (sess.userId) h["X-User-Id"] = sess.userId;
    return fetch(`${API_BASE}/api/admin/courses/export`, { headers: h });
  },
  exportAttendanceCsv() {
    const sess = Session.get();
    const h = {};
    if (sess.role)   h["X-Role"]    = sess.role;
    if (sess.userId) h["X-User-Id"] = sess.userId;
    return fetch(`${API_BASE}/api/admin/reports/attendance-export`, { headers: h });
  },
  exportMarksCsv() {
    const sess = Session.get();
    const h = {};
    if (sess.role)   h["X-Role"]    = sess.role;
    if (sess.userId) h["X-User-Id"] = sess.userId;
    return fetch(`${API_BASE}/api/admin/reports/marks-export`, { headers: h });
  },

  // Timetable
  saveTimetable(payload, slotId = null) {
    return request(slotId ? `/api/admin/timetable/${slotId}` : "/api/admin/timetable", {
      method: slotId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
  },
  checkTimetableClashes() { return request("/api/admin/timetable/clashes"); },

  // Notices
  publishNotice(payload) {
    return request("/api/admin/notices", { method:"POST", body: JSON.stringify(payload) });
  },
  updateNotice(noticeId, payload) {
    return request(`/api/admin/notices/${noticeId}`, { method:"PATCH", body: JSON.stringify(payload) });
  },
  unpublishNotice(noticeId) {
    return request(`/api/admin/notices/${noticeId}`, { method:"DELETE" });
  },

  // Grievances
  resolveGrievance(grievanceId, resolutionNote, status = "resolved") {
    return request(`/api/admin/grievances/${grievanceId}/resolve`, {
      method:"POST", body: JSON.stringify({resolutionNote, status}),
    });
  },
  reviewWorkflowRequest(requestId, decision, reviewNote = "") {
    return request(`/api/admin/workflow-requests/${requestId}/review`, {
      method:"POST", body: JSON.stringify({decision, reviewNote}),
    });
  },
  createFeeItems(payload) {
    return request("/api/admin/fees", { method:"POST", body: JSON.stringify(payload) });
  },
  enrollStudent(payload) {
    return request("/api/admin/enrollments", { method:"POST", body: JSON.stringify(payload) });
  },
  unenrollStudent(payload) {
    return request("/api/admin/enrollments", { method:"DELETE", body: JSON.stringify(payload) });
  },

  // Settings
  getSettings() { return request("/api/admin/settings"); },
  updateSettings(payload) {
    return request("/api/admin/settings", { method:"PATCH", body: JSON.stringify(payload) });
  },
};

window.Api     = Api;
window.Session = Session;
