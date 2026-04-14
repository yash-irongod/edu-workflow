"use strict";

const API_BASE = "http://127.0.0.1:5000";

const Session = {
  get() {
    return {
      userId: localStorage.getItem("userId"),
      role: localStorage.getItem("role"),
      name: localStorage.getItem("name"),
      email: localStorage.getItem("email"),
      rollNo: localStorage.getItem("rollNo"),
      employeeId: localStorage.getItem("employeeId"),
    };
  },
  save(payload) {
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        localStorage.setItem(key, String(value));
      }
    });
  },
  clear() {
    ["userId", "role", "name", "email", "rollNo", "employeeId"].forEach((key) => localStorage.removeItem(key));
  },
};

async function request(path, options = {}) {
  const session = Session.get();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (session.role) {
    headers["X-Role"] = session.role;
  }
  if (session.userId) {
    headers["X-User-Id"] = session.userId;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

const Api = {
  login(email, password) {
    return request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  me() {
    return request("/api/me");
  },
  updateProfile(payload) {
    return request("/api/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  changePassword(payload) {
    return request("/api/me/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  notifications() {
    return request("/api/me/notifications");
  },
  readNotification(notificationId) {
    return request(`/api/me/notifications/${notificationId}/read`, { method: "POST" });
  },
  studentDashboard(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });
    return request(`/api/student/dashboard${params.toString() ? `?${params}` : ""}`);
  },
  studentAttendance(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });
    return request(`/api/student/attendance${params.toString() ? `?${params}` : ""}`);
  },
  submitStudentRequest(payload) {
    return request("/api/student/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  submitGrievance(payload) {
    return request("/api/student/grievances", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  payFees(feeIds) {
    return request("/api/student/fees/pay", {
      method: "POST",
      body: JSON.stringify({ feeIds }),
    });
  },
  applyPlacement(placementId) {
    return request(`/api/student/placements/${placementId}/apply`, { method: "POST" });
  },
  renewLibraryLoan(loanId) {
    return request(`/api/student/library/${loanId}/renew`, { method: "POST" });
  },
  teacherDashboard() {
    return request("/api/teacher/dashboard");
  },
  teacherAttendance(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });
    return request(`/api/teacher/attendance${params.toString() ? `?${params}` : ""}`);
  },
  submitTeacherAttendance(payload) {
    return request("/api/teacher/attendance", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  submitTeacherMarks(payload) {
    return request("/api/teacher/marks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  createTeacherAssignment(payload) {
    return request("/api/teacher/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  notifyStudent(payload) {
    return request("/api/teacher/notifications", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateTeacherSlot(slotId, payload) {
    return request(`/api/teacher/timetable/${slotId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  createTeacherNotice(payload) {
    return request("/api/teacher/notices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  adminDashboard() {
    return request("/api/admin/dashboard");
  },
  createUser(payload) {
    return request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateUserStatus(userId, status) {
    return request(`/api/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  resetUserPassword(userId, newPassword) {
    return request(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
  },
  updateCourse(courseId, payload) {
    return request(`/api/admin/courses/${courseId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  saveTimetable(payload, slotId = null) {
    return request(slotId ? `/api/admin/timetable/${slotId}` : "/api/admin/timetable", {
      method: slotId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
  },
  publishNotice(payload) {
    return request("/api/admin/notices", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  unpublishNotice(noticeId) {
    return request(`/api/admin/notices/${noticeId}`, { method: "DELETE" });
  },
  resolveGrievance(grievanceId, resolutionNote) {
    return request(`/api/admin/grievances/${grievanceId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolutionNote }),
    });
  },
  getSettings() {
    return request("/api/admin/settings");
  },
  updateSettings(payload) {
    return request("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};

window.Api = Api;
window.Session = Session;
