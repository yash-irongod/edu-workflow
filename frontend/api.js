/**
 * api.js — EduTrack MLOps · Service Layer
 *
 * This file owns the in-memory DB and exposes async service functions.
 * Every function is written to mirror its eventual fetch() call so that
 * switching to the real Flask backend requires changing ONLY this file —
 * app.js never needs to know whether data came from memory or the network.
 *
 * ─── HOW TO SWITCH TO THE REAL BACKEND ───────────────────────────────
 * 1. Set USE_REAL_API = true (or point API_BASE at your Flask server).
 * 2. Each service function already shows the commented-out fetch() call.
 * 3. Remove the "in-memory fallback" block and uncomment the fetch block.
 * ─────────────────────────────────────────────────────────────────────
 */

"use strict";

/* ── CONFIG ────────────────────────────────────────────── */
const API_BASE    = "http://127.0.0.1:5000";
const USE_REAL_API = false;   // ← flip to true when Flask is running

/* ── STUDENT ROSTER (shared truth) ────────────────────── */
const STUDENTS = [
  { id: 1, roll: "2024CS0401", name: "Rahul Sharma"  },
  { id: 2, roll: "2024CS0402", name: "Anjali Verma"  },
  { id: 3, roll: "2024CS0403", name: "Arjun Kapoor"  },
  { id: 4, roll: "2024CS0404", name: "Sneha Reddy"   },
  { id: 5, roll: "2024CS0472", name: "Priya Sharma"  },
];

/* ── IN-MEMORY DATABASE ────────────────────────────────── */
/**
 * This object mirrors the SQLite schema in db_init.sql.
 * Shape per table:
 *   attendance[]   → { id, cls, date, records:[{studentId,roll,name,status}] }
 *   marks[]        → { id, subject, exam, max, records:[{studentId,roll,name,score,remark,max}] }
 *   assignments[]  → { id, title, subject, desc, due, max, submissions, total, createdAt }
 *   announcements[]→ { id, title, audience, msg, date, priority }
 */
const DB = {
  attendance: [],
  marks: [],
  assignments: [],
  announcements: [
    { id: 1, title: "End-Semester Exam starts next week", audience: "All Students",           msg: "Please prepare accordingly.",     date: "2026-03-25", priority: "HIGH"   },
    { id: 2, title: "Holiday declared on Friday, 28 Mar 2026",  audience: "All Classes",      msg: "Institute holiday.",              date: "2026-03-24", priority: "INFO"   },
    { id: 3, title: "CNN Architecture Lab Report due today",    audience: "CSE AI-ML (Sec A & B)", msg: "Submit via the student portal.", date: "2026-03-20", priority: "MEDIUM" },
  ],
};

/* Internal auto-increment counters */
const _nextId = { att: 1, marks: 1, asg: 1, ann: 4 };

/* ── GENERIC FETCH HELPER ──────────────────────────────── */
/**
 * Wraps fetch with JSON headers and unified error handling.
 * @param {string} path   - URL path, e.g. "/api/teacher/attendance"
 * @param {object} [opts] - Extra fetch options (method, body, etc.)
 * @returns {Promise<any>} Parsed JSON response
 */
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ════════════════════════════════════════════════════════
   ATTENDANCE SERVICES
   ════════════════════════════════════════════════════════ */

/**
 * Submit (or update) attendance for a class on a given date.
 * POST /api/teacher/attendance
 *
 * @param {string}   cls     - Class name
 * @param {string}   date    - ISO date string
 * @param {Array}    records - [{studentId, roll, name, status}]
 * @returns {Promise<{id, cls, date, records, updated: boolean}>}
 */
async function submitAttendance(cls, date, records) {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/attendance", {
      method: "POST",
      body: JSON.stringify({ cls, date, records }),
    });
  }

  /* ── in-memory fallback ── */
  const existing = DB.attendance.findIndex(a => a.cls === cls && a.date === date);
  if (existing >= 0) {
    DB.attendance[existing].records = records;
    return { ...DB.attendance[existing], updated: true };
  }
  const entry = { id: _nextId.att++, cls, date, records };
  DB.attendance.push(entry);
  return { ...entry, updated: false };
}

/**
 * Retrieve attendance history, optionally filtered.
 * GET /api/teacher/attendance?date=&cls=
 *
 * @param {string} [dateFilter]  - ISO date or ""
 * @param {string} [classFilter] - Class name or ""
 * @returns {Promise<Array>}
 */
async function getAttendanceHistory(dateFilter = "", classFilter = "") {
  if (USE_REAL_API) {
    const params = new URLSearchParams();
    if (dateFilter)  params.set("date", dateFilter);
    if (classFilter) params.set("cls",  classFilter);
    return apiFetch(`/api/teacher/attendance?${params}`);
  }

  /* ── in-memory fallback ── */
  let recs = [...DB.attendance];
  if (dateFilter)  recs = recs.filter(r => r.date === dateFilter);
  if (classFilter) recs = recs.filter(r => r.cls  === classFilter);
  return recs.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Patch a single attendance record (edit mode).
 * PATCH /api/teacher/attendance/:id
 *
 * @param {number} id      - Attendance record ID
 * @param {Array}  records - Updated [{studentId, status}] list
 * @returns {Promise<object>} Updated record
 */
async function patchAttendance(id, records) {
  if (USE_REAL_API) {
    return apiFetch(`/api/teacher/attendance/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ records }),
    });
  }

  /* ── in-memory fallback ── */
  const rec = DB.attendance.find(a => a.id === id);
  if (!rec) throw new Error("Record not found");
  records.forEach(({ studentId, status }) => {
    const row = rec.records.find(r => r.studentId === studentId);
    if (row) row.status = status;
  });
  return { ...rec };
}

/**
 * Compute overall average attendance percentage from local DB.
 * (Derived stat — no dedicated API endpoint needed.)
 * @returns {string} e.g. "84%"
 */
function computeAvgAttendance() {
  const all = DB.attendance.flatMap(a => a.records);
  if (!all.length) return "—";
  const present = all.filter(r => r.status === "P" || r.status === "L").length;
  return Math.round((present / all.length) * 100) + "%";
}

/* ════════════════════════════════════════════════════════
   MARKS SERVICES
   ════════════════════════════════════════════════════════ */

/**
 * Save a batch of marks for an exam.
 * POST /api/teacher/marks
 *
 * @param {string} subject
 * @param {string} exam
 * @param {number} max
 * @param {Array}  records - [{studentId, roll, name, score, remark}]
 * @returns {Promise<object>} Saved marks entry
 */
async function saveMarks(subject, exam, max, records) {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/marks", {
      method: "POST",
      body: JSON.stringify({ subject, exam, max, records }),
    });
  }

  /* ── in-memory fallback ── */
  const entry = { id: _nextId.marks++, subject, exam, max, records };
  DB.marks.push(entry);
  return { ...entry };
}

/**
 * Get all saved marks records.
 * GET /api/teacher/marks
 * @returns {Promise<Array>}
 */
async function getAllMarks() {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/marks");
  }
  return [...DB.marks];
}

/**
 * Compute per-student averages for each exam type (for Chart.js).
 * Derived locally — no endpoint needed.
 *
 * @param {string} examType - e.g. "Internal Exam 1"
 * @returns {Array<number|null>} One value per student, null if no data
 */
function computeChartData(examType) {
  const matches = DB.marks.filter(m => m.exam === examType);
  if (!matches.length) return STUDENTS.map(() => null);

  return STUDENTS.map(s => {
    const rows = matches.flatMap(m => m.records).filter(r => r.studentId === s.id);
    if (!rows.length) return null;
    const pcts = rows.map(r => r.max > 0 ? Math.round((r.score / r.max) * 100) : 0);
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  });
}

/* ════════════════════════════════════════════════════════
   ASSIGNMENT SERVICES
   ════════════════════════════════════════════════════════ */

/**
 * Create a new assignment.
 * POST /api/teacher/assignments
 *
 * @param {object} payload - {title, subject, desc, due, max}
 * @returns {Promise<object>} Created assignment
 */
async function createAssignment(payload) {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /* ── in-memory fallback ── */
  const entry = {
    id: _nextId.asg++,
    ...payload,
    submissions: 0,
    total: 60,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  DB.assignments.push(entry);
  return { ...entry };
}

/**
 * Get all assignments.
 * GET /api/teacher/assignments
 * @returns {Promise<Array>}
 */
async function getAssignments() {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/assignments");
  }
  return [...DB.assignments];
}

/**
 * Update submission count for an assignment.
 * PATCH /api/teacher/assignments/:id/submissions
 *
 * @param {number} id          - Assignment ID
 * @param {number} submissions - New submission count
 * @returns {Promise<object>}
 */
async function updateSubmissions(id, submissions) {
  if (USE_REAL_API) {
    return apiFetch(`/api/teacher/assignments/${id}/submissions`, {
      method: "PATCH",
      body: JSON.stringify({ submissions }),
    });
  }

  /* ── in-memory fallback ── */
  const asg = DB.assignments.find(a => a.id === id);
  if (!asg) throw new Error("Assignment not found");
  asg.submissions = Math.min(submissions, asg.total);
  return { ...asg };
}

/**
 * Delete an assignment.
 * DELETE /api/teacher/assignments/:id
 * @returns {Promise<void>}
 */
async function deleteAssignment(id) {
  if (USE_REAL_API) {
    return apiFetch(`/api/teacher/assignments/${id}`, { method: "DELETE" });
  }

  /* ── in-memory fallback ── */
  const idx = DB.assignments.findIndex(a => a.id === id);
  if (idx === -1) throw new Error("Assignment not found");
  DB.assignments.splice(idx, 1);
}

/* ════════════════════════════════════════════════════════
   ANNOUNCEMENT SERVICES
   ════════════════════════════════════════════════════════ */

/**
 * Post a new announcement.
 * POST /api/teacher/announcements
 *
 * @param {object} payload - {title, audience, msg, priority}
 * @returns {Promise<object>}
 */
async function postAnnouncement(payload) {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /* ── in-memory fallback ── */
  const entry = {
    id: _nextId.ann++,
    ...payload,
    date: new Date().toISOString().slice(0, 10),
  };
  DB.announcements.unshift(entry);
  return { ...entry };
}

/**
 * Get all announcements.
 * GET /api/teacher/announcements
 * @returns {Promise<Array>}
 */
async function getAnnouncements() {
  if (USE_REAL_API) {
    return apiFetch("/api/teacher/announcements");
  }
  return [...DB.announcements];
}

/* ════════════════════════════════════════════════════════
   REPORTS — derived stats (no dedicated endpoint)
   ════════════════════════════════════════════════════════ */

/**
 * Build a summary object used by the Reports section.
 * All values derived from the local DB (matches what the backend would return).
 * @returns {object}
 */
function computeReportSummary() {
  const allAtt    = DB.attendance.flatMap(a => a.records);
  const present   = allAtt.filter(r => r.status === "P" || r.status === "L").length;
  const attPct    = allAtt.length ? Math.round((present / allAtt.length) * 100) + "%" : "—";

  const allMarks  = DB.marks.flatMap(m => m.records);
  const avgScore  = allMarks.length
    ? Math.round(allMarks.reduce((acc, r) => acc + (r.max > 0 ? r.score / r.max * 100 : 0), 0) / allMarks.length) + "%"
    : "—";

  return {
    attendanceSessions: DB.attendance.length,
    overallAttendance:  attPct,
    marksRecords:       DB.marks.length,
    avgScore,
    assignmentsCreated: DB.assignments.length,
    totalSubmissions:   DB.assignments.reduce((a, x) => a + x.submissions, 0),
  };
}

/* ── EXPORTS (global scope for app.js) ─────────────────── */
/* All service functions and the STUDENTS roster are global. */