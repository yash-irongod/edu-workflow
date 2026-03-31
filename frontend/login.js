/* =========================================================
   frontend/login.js
   Final integrated version
   - Teammate 2: stable login flow, validation, spinner, messages
   - Teammate 5: polished UI helpers, background animation, toast,
                 dashboard rendering, charts, forms, logout
   ========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */
const API_BASE = "http://127.0.0.1:5000";
const ROLE_PAGE = {
  student: "student.html",
  teacher: "teacher.html",
  admin: "admin.html",
};

let isLoggingIn = false;

/* =========================
   SMALL HELPERS
========================= */
function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function pageFileName() {
  const path = window.location.pathname;
  const file = path.split("/").pop();
  return file || "index.html";
}

function isLoginPage() {
  const file = pageFileName();
  return file === "index.html" || file === "login.html" || window.location.pathname === "/";
}

function currentRole() {
  return localStorage.getItem("role") || "";
}

function currentName() {
  return localStorage.getItem("name") || "";
}

function currentRollNo() {
  return localStorage.getItem("rollNo") || "";
}

function isDashboardPage() {
  return !isLoginPage();
}

function setTextIfExists(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setLoginButtonLoading(on) {
  const loginBtn = document.getElementById("loginBtn") || qs(".btn");
  const spinner = document.getElementById("spinner");

  if (loginBtn) {
    loginBtn.disabled = on;
    loginBtn.textContent = on ? "Signing In..." : (loginBtn.dataset.defaultText || "Login");
  }

  if (spinner) {
    spinner.classList.toggle("hidden", !on);
  }
}

/* =========================
   TOAST SYSTEM
========================= */
function ensureToastHost() {
  let host = document.getElementById("toastContainer") || document.getElementById("toast");
  if (host) return host;

  host = document.createElement("div");
  host.id = "toastContainer";
  host.style.position = "fixed";
  host.style.right = "24px";
  host.style.bottom = "24px";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.gap = "8px";
  host.style.zIndex = "99999";
  document.body.appendChild(host);
  return host;
}

function clearToastHost() {
  const host = document.getElementById("toastContainer") || document.getElementById("toast");
  if (!host) return;
  host.innerHTML = "";
}

function showToast(message, type = "success") {
  const host = ensureToastHost();

  const normalizedType =
    type === "ok" ? "success" :
    type === "bad" ? "error" :
    type;

  const signature = `${normalizedType}::${message}`;
  const now = Date.now();

  if (!window.__toastHistory) window.__toastHistory = new Map();
  const lastShown = window.__toastHistory.get(signature) || 0;
  if (now - lastShown < 1400) return;
  window.__toastHistory.set(signature, now);

  const toast = document.createElement("div");

  let bg = "#0f172a";
  let color = "#fff";

  if (normalizedType === "success") bg = "#16a34a";
  else if (normalizedType === "error") bg = "#dc2626";
  else if (normalizedType === "warning") bg = "#d97706";
  else if (normalizedType === "info") bg = "#2563eb";

  toast.textContent = message;
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "10px";
  toast.style.background = bg;
  toast.style.color = color;
  toast.style.boxShadow = "0 12px 28px rgba(0,0,0,0.18)";
  toast.style.fontSize = "14px";
  toast.style.maxWidth = "320px";
  toast.style.wordBreak = "break-word";
  toast.style.opacity = "1";
  toast.style.transition = "opacity 0.35s ease, transform 0.35s ease";
  toast.style.transform = "translateY(0)";

  host.appendChild(toast);

  while (host.children.length > 3) {
    host.removeChild(host.firstChild);
  }

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 350);
  }, 2600);
}

window.showToast = showToast;

/* =========================
   INLINE MESSAGE AREA FOR LOGIN
========================= */
function showMessage(message, success = true) {
  const msgBox = document.getElementById("msg");
  if (msgBox) {
    msgBox.textContent = message;
    msgBox.style.color = success ? "#16a34a" : "#ef4444";
    return;
  }
  showToast(message, success ? "success" : "error");
}

/* =========================
   SESSION HELPERS
========================= */
function saveSession(data) {
  if (!data) return;
  if (data.role) localStorage.setItem("role", data.role);
  if (data.name) localStorage.setItem("name", data.name);
  if (data.rollNo) localStorage.setItem("rollNo", data.rollNo);
}

function clearSession() {
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  localStorage.removeItem("rollNo");
  localStorage.removeItem("rememberMe");
  localStorage.removeItem("rememberedEmail");
}

function handleLogout() {
  clearSession();
  window.location.replace("index.html");
}

function redirectByRole(role) {
  const page = ROLE_PAGE[role];
  if (!page) {
    showToast("Invalid role returned by server", "error");
    handleLogout();
    return;
  }
  window.location.replace(page);
}

/* =========================
   PASSWORD TOGGLE
========================= */
function toggleEye() {
  const passwordInput = document.getElementById("password") || document.getElementById("pwd");
  const toggleBtn = document.getElementById("togglePassword") || document.getElementById("eyeBtn");

  if (!passwordInput || !toggleBtn) return;

  const hidden = passwordInput.type === "password";
  passwordInput.type = hidden ? "text" : "password";

  if (toggleBtn.classList.contains("toggle-password")) {
    toggleBtn.classList.toggle("shown", hidden);
    toggleBtn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  } else {
    toggleBtn.textContent = hidden ? "🙈" : "👁";
  }
}

window.toggleEye = toggleEye;
window.togglePassword = toggleEye;

/* =========================
   BACKGROUND / HERO ANIMATION
   (login page only)
========================= */
function startLoginAnimation() {
  const canvas = document.getElementById("bg");
  const glowEl = document.getElementById("glow");
  const heroEl = document.querySelector(".hero");
  const cardEl = document.querySelector(".card");

  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let W = 0;
  let H = 0;
  let mouseX = 0;
  let mouseY = 0;
  let easedX = 0;
  let easedY = 0;
  let prevX = 0;
  let prevY = 0;
  let tick = 0;
  let scrollShift = 0;

  const stars = [];
  const orbs = [
    { x: 0.16, y: 0.22, r: 240, c: [59, 130, 246], speed: 0.00012, phase: 0 },
    { x: 0.79, y: 0.64, r: 200, c: [168, 85, 247], speed: 0.00015, phase: 2 },
    { x: 0.50, y: 0.90, r: 180, c: [6, 182, 212], speed: 0.00014, phase: 4 },
    { x: 0.92, y: 0.15, r: 150, c: [34, 197, 94], speed: 0.00010, phase: 5.5 },
  ];

  for (let i = 0; i < 220; i++) {
    stars.push({
      fx: Math.random(),
      fy: Math.random(),
      z: Math.random(),
      vz: -(Math.random() * 0.00055 + 0.00008),
      r: Math.random() * 1.3 + 0.25,
      group: Math.floor(Math.random() * 3),
    });
  }

  const starColors = [
    "rgba(120,170,255,",
    "rgba(180,120,255,",
    "rgba(80,210,255,",
  ];

  const nodes = [];
  for (let i = 0; i < 32; i++) {
    nodes.push({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      r: Math.random() * 2.5 + 1.1,
      bright: false,
    });
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function onMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (glowEl) {
      glowEl.style.left = `${mouseX}px`;
      glowEl.style.top = `${mouseY}px`;
    }
  }

  function onWheel(e) {
    scrollShift += e.deltaY * 0.0004;
  }

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("mousemove", onMouseMove);
  window.addEventListener("wheel", onWheel, { passive: true });

  function render() {
    tick += 0.013;

    prevX = easedX;
    prevY = easedY;
    easedX += (mouseX - easedX) * 0.06;
    easedY += (mouseY - easedY) * 0.06;

    const velX = easedX - prevX;
    const velY = easedY - prevY;

    const dx = (easedX / W - 0.5) * 0.18;
    const dy = (easedY / H - 0.5) * 0.18 + scrollShift;
    scrollShift *= 0.92;

    if (heroEl) {
      heroEl.style.transform = `translateY(calc(-50% + ${dy * 30}px)) translateX(${dx * 20}px)`;
    }

    if (cardEl) {
      const cx = window.innerWidth * 0.79;
      const cy = window.innerHeight * 0.5;
      const rx = ((mouseY - cy) / window.innerHeight) * 12;
      const ry = -((mouseX - cx) / window.innerWidth) * 12;
      cardEl.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.01)`;
    }

    ctx.fillStyle = "#03060f";
    ctx.fillRect(0, 0, W, H);

    for (const orb of orbs) {
      const ox = (orb.x + Math.sin(tick * orb.speed * 55 + orb.phase) * 0.05 - dx * 0.5) * W;
      const oy = (orb.y + Math.cos(tick * orb.speed * 55 + orb.phase) * 0.05 - dy * 0.5) * H;
      const gradient = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.r);
      const [r, g, b] = orb.c;

      gradient.addColorStop(0, `rgba(${r},${g},${b},0.20)`);
      gradient.addColorStop(0.45, `rgba(${r},${g},${b},0.08)`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");

      ctx.beginPath();
      ctx.arc(ox, oy, orb.r, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    for (const s of stars) {
      s.z += s.vz;
      if (s.z <= 0) s.z = 1;

      const px = (s.fx - 0.5) / s.z * 0.5 + 0.5 + dx * s.z * 0.18;
      const py = (s.fy - 0.5) / s.z * 0.5 + 0.5 + dy * s.z * 0.18;

      if (px < 0 || px > 1 || py < 0 || py > 1) continue;

      const size = s.r * (1 - s.z) * 0.9 + 0.15;
      const alpha = Math.min(1, (1 - s.z) * 1.5);

      ctx.beginPath();
      ctx.arc(px * W, py * H, size, 0, Math.PI * 2);
      ctx.fillStyle = starColors[s.group] + (alpha * 0.65) + ")";
      ctx.fill();
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const px = n.x * W;
      const py = n.y * H;
      const dist = Math.hypot(px - easedX, py - easedY);

      if (dist < 180) {
        const force = (180 - dist) / 180;
        const safeDist = Math.max(dist, 0.001);
        n.vx += ((px - easedX) / safeDist) * force * 0.0018;
        n.vy += ((py - easedY) / safeDist) * force * 0.0018;
        n.bright = true;
      } else {
        n.bright = false;
      }

      n.vx += velX * 0.00006;
      n.vy += velY * 0.00006;
      n.vx *= 0.97;
      n.vy *= 0.97;
      n.x += n.vx;
      n.y += n.vy;

      if (n.x < 0) n.x = 1;
      if (n.x > 1) n.x = 0;
      if (n.y < 0) n.y = 1;
      if (n.y > 1) n.y = 0;
    }

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const ax = a.x * W;
      const ay = a.y * H;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const bx = b.x * W;
        const by = b.y * H;
        const dist = Math.hypot(ax - bx, ay - by);

        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.strokeStyle = `rgba(100,160,255,${((a.bright || b.bright) ? 0.16 : 0.07) * (1 - dist / 150)})`;
          ctx.lineWidth = (a.bright || b.bright) ? 0.9 : 0.45;
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(ax, ay, a.r, 0, Math.PI * 2);
      ctx.fillStyle = a.bright ? "rgba(160,210,255,0.75)" : "rgba(120,175,255,0.32)";
      ctx.fill();

      if (a.bright) {
        ctx.beginPath();
        ctx.arc(ax, ay, a.r + 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100,170,255,0.18)";
        ctx.fill();
      }
    }

    const speed = Math.hypot(velX, velY);
    if (speed > 1) {
      ctx.beginPath();
      ctx.arc(easedX, easedY, speed * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(80,140,255,${Math.min(0.15, speed * 0.012)})`;
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();

  document.addEventListener("click", (e) => {
    const ripple = document.createElement("div");
    ripple.style.position = "fixed";
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    ripple.style.width = "12px";
    ripple.style.height = "12px";
    ripple.style.borderRadius = "50%";
    ripple.style.border = "1px solid rgba(120,180,255,0.55)";
    ripple.style.transform = "translate(-50%, -50%) scale(1)";
    ripple.style.pointerEvents = "none";
    ripple.style.zIndex = "9999";
    ripple.style.transition = "transform 0.6s ease, opacity 0.6s ease";
    document.body.appendChild(ripple);

    requestAnimationFrame(() => {
      ripple.style.transform = "translate(-50%, -50%) scale(18)";
      ripple.style.opacity = "0";
    });

    setTimeout(() => ripple.remove(), 650);
  });
}

/* =========================
   DASHBOARD VISUALS
========================= */
function renderAvatar(name) {
  const avatar = document.getElementById("avatarInitials");
  if (!avatar || !name) return;

  const parts = name.trim().split(/\s+/).filter(Boolean);
  let initials = "";

  if (parts.length >= 2) {
    initials = `${parts[0][0]}${parts[parts.length - 1][0]}`;
  } else {
    initials = name.slice(0, 2);
  }

  avatar.textContent = initials.toUpperCase();
}

function startClock() {
  const el = document.getElementById("liveClock");
  if (!el) return;

  el.style.whiteSpace = "nowrap";
  el.style.lineHeight = "1";
  el.style.minWidth = "260px";
  el.style.textAlign = "center";
  el.style.display = "inline-flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontVariantNumeric = "tabular-nums";
  el.style.letterSpacing = "0.01em";
  el.style.transition = "none";

  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }

  tick();
  if (window.__clockTimer) clearInterval(window.__clockTimer);
  window.__clockTimer = setInterval(tick, 1000);
}

function initStudentChart(canvasId, dataPoints) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Sem I", "Sem II", "Sem III", "Sem IV", "Sem V", "Sem VI"],
      datasets: [
        {
          label: "Cumulative CGPA",
          data: dataPoints,
          borderColor: "#e8490f",
          backgroundColor: "rgba(232,73,15,0.08)",
          pointBackgroundColor: "#e8490f",
          fill: true,
          tension: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function initTeacherChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Internal 1", "Internal 2", "Mid-Term", "Lab 1", "Lab 2"],
      datasets: [
        {
          label: "Sec A",
          data: [38, 41, 35, 44, 43],
          backgroundColor: "rgba(232,73,15,0.75)",
        },
        {
          label: "Sec B",
          data: [35, 38, 33, 40, 41],
          backgroundColor: "rgba(26,86,219,0.65)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function initAdminChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["CSE", "ECE", "ME", "CE", "EE", "MBA"],
      datasets: [
        {
          label: "Students",
          data: [420, 380, 310, 290, 260, 180],
          backgroundColor: "rgba(232,73,15,0.75)",
        },
        {
          label: "Faculty",
          data: [28, 24, 20, 18, 17, 14],
          backgroundColor: "rgba(26,86,219,0.65)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function setStatCardValueByLabel(labelText, valueText, forceHTML = false) {
  const cards = qsa(".stat-card");
  const needle = String(labelText).toLowerCase();

  for (const card of cards) {
    const labelEl = card.querySelector(".sc-label");
    const valueEl = card.querySelector(".sc-value");
    if (!labelEl || !valueEl) continue;

    const label = labelEl.textContent.trim().toLowerCase();
    if (label.includes(needle)) {
      if (forceHTML) valueEl.innerHTML = valueText;
      else valueEl.textContent = valueText;
    }
  }
}

function updateDashboardFromAPI(role, data) {
  if (!data) return;

  if (role === "student") {
    if (typeof data.attendance !== "undefined") setStatCardValueByLabel("attendance", `${data.attendance}%`);
    if (typeof data.cgpa !== "undefined") setStatCardValueByLabel("cgpa", `${data.cgpa}`);
    if (typeof data.subjects !== "undefined") setStatCardValueByLabel("subjects", `${data.subjects}`);
  }

  if (role === "teacher") {
    if (typeof data.classes !== "undefined") setStatCardValueByLabel("total classes", `${data.classes}`);
    if (typeof data.students !== "undefined") setStatCardValueByLabel("total students", `${data.students}`);
    if (typeof data.pending !== "undefined") setStatCardValueByLabel("pending tasks", `${data.pending}`);
  }

  if (role === "admin") {
    if (typeof data.users !== "undefined") setStatCardValueByLabel("total users", `${data.users}`);
    if (typeof data.reports !== "undefined") setStatCardValueByLabel("reports", `${data.reports}`);
    if (typeof data.status !== "undefined") setStatCardValueByLabel("system status", `● ${String(data.status).toLowerCase() === "online" ? "Online" : data.status}`);
  }
}

async function loadDashboardData(role) {
  const endpoints = {
    student: "/api/student/dashboard",
    teacher: "/api/teacher/dashboard",
    admin: "/api/admin/dashboard",
  };

  const endpoint = endpoints[role];
  if (!endpoint) return;

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "GET",
      headers: {
        "X-Role": role,
      },
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) return;
    updateDashboardFromAPI(role, data);
  } catch (err) {
    console.warn("Dashboard API unavailable:", err);
  }
}

/* =========================
   DASHBOARD ACTION HELPERS
========================= */
function createDynamicModal(title, contentHtml, onConfirm) {
  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:rgba(0,0,0,0.58)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "z-index:100000",
    "backdrop-filter:blur(4px)",
    "padding:16px",
  ].join(";");

  const modal = document.createElement("div");
  modal.style.cssText = [
    "width:min(92vw,420px)",
    "background:#fff",
    "border-radius:14px",
    "padding:22px",
    "box-shadow:0 16px 40px rgba(0,0,0,0.22)",
    "font-family:inherit",
  ].join(";");

  modal.innerHTML = `
    <h3 style="margin:0 0 14px 0;font-size:18px;">${title}</h3>
    <div style="margin-bottom:18px;text-align:left;">${contentHtml}</div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      <button type="button" class="btn btn-outline cancel-btn">Cancel</button>
      <button type="button" class="btn btn-accent confirm-btn">Confirm & Submit</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  modal.querySelector(".cancel-btn").addEventListener("click", close);
  modal.querySelector(".confirm-btn").addEventListener("click", () => onConfirm(close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

function payFees() {
  const formHtml = `
    <div style="margin-bottom:12px;">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;">Card Number</label>
      <input type="text" placeholder="XXXX-XXXX-XXXX-XXXX" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
    </div>
    <div style="display:flex;gap:10px;margin-bottom:12px;">
      <div style="flex:1;">
        <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;">Expiry</label>
        <input type="text" placeholder="MM/YY" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
      </div>
      <div style="flex:1;">
        <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;">CVV</label>
        <input type="password" placeholder="***" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-top:16px;font-size:16px;font-weight:bold;text-align:right;color:#dc2626;">Total Amount: ₹3,700</div>
  `;

  createDynamicModal("Secure Payment Gateway", formHtml, (closeModal) => {
    const feeRows = qsa("#fees .data-table tbody tr");
    feeRows.forEach((row) => {
      const statusBadge = row.querySelector(".badge-danger");
      if (statusBadge && statusBadge.textContent.trim() === "Unpaid") {
        statusBadge.className = "badge badge-success";
        statusBadge.textContent = "Paid";
      }
    });

    const totalRow = document.querySelector("#fees .data-table tfoot tr");
    if (totalRow) {
      totalRow.innerHTML = `<td colspan="2"><strong>Total Pending</strong></td><td colspan="2"><strong style="color:#22c55e;">₹0</strong></td>`;
    }

    showToast("Payment of ₹3,700 processed successfully!", "success");
    closeModal();
  });
}

window.payFees = payFees;

function applyPlacement(btnElement, company) {
  const formHtml = `
    <div style="margin-bottom:12px;">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;">Resume Link</label>
      <input type="text" placeholder="https://..." style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;">
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:600;">Cover Letter (Optional)</label>
      <textarea rows="3" placeholder="Why are you a good fit?" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;"></textarea>
    </div>
  `;

  createDynamicModal(`Apply to ${company}`, formHtml, (closeModal) => {
    if (btnElement) {
      btnElement.textContent = "Applied";
      btnElement.className = "btn btn-sm btn-outline";
      btnElement.disabled = true;
      btnElement.onclick = null;

      const row = btnElement.closest("tr");
      const statusCell = row ? row.querySelector("td:nth-last-child(2)") : null;
      if (statusCell) {
        statusCell.innerHTML = `<span class="badge badge-info">Applied</span>`;
      }
    }

    showToast(`Application submitted to ${company} successfully!`, "success");
    closeModal();
  });
}

window.applyPlacement = applyPlacement;

function filterStudents(query) {
  const q = (query || "").toLowerCase().trim();
  const rows = qsa("#studentTable tbody tr");

  rows.forEach((row) => {
    const hay = (row.getAttribute("data-name") || row.textContent || "").toLowerCase();
    row.style.display = !q || hay.includes(q) ? "" : "none";
  });
}

window.filterStudents = filterStudents;

function filterAdminUsers(query) {
  const inputQuery = (query || "").toLowerCase().trim();
  const roleFilter = (document.getElementById("roleFilterSelect")?.value || "").toLowerCase().trim();
  const rows = qsa("#adminUserTable tbody tr");

  rows.forEach((row) => {
    const rowRole = (row.getAttribute("data-role") || "").toLowerCase();
    const text = row.textContent.toLowerCase();

    const roleMatch = !roleFilter || rowRole === roleFilter;
    const queryMatch = !inputQuery || text.includes(inputQuery);

    row.style.display = roleMatch && queryMatch ? "" : "none";
  });
}

window.filterAdminUsers = filterAdminUsers;

function bindSidebarNavigation() {
  const navItems = qsa(".sidebar-nav .nav-item");
  const sections = qsa("main .section, .page-header");

  if (!navItems.length) return;

  function setActiveByHash(hash) {
    navItems.forEach((item) => item.classList.remove("active"));

    const target = navItems.find((item) => item.getAttribute("href") === hash);
    if (target) target.classList.add("active");
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const href = item.getAttribute("href");
      if (href && href.startsWith("#")) {
        setTimeout(() => setActiveByHash(href), 0);
      }
    });
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible && visible.target && visible.target.id) {
          setActiveByHash(`#${visible.target.id}`);
        }
      },
      { root: null, threshold: 0.35 }
    );

    sections.forEach((section) => {
      if (section.id) observer.observe(section);
    });
  }
}

/* =========================
   DASHBOARD EVENT BINDING
========================= */
function initializeDashboardEvents() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });
  }

  const attendanceForm = document.getElementById("attendanceForm");
  if (attendanceForm) {
    attendanceForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("Attendance saved.", "success");
    });
  }

  const marksForm = document.getElementById("marksForm");
  if (marksForm) {
    marksForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("Marks saved successfully.", "success");
    });
  }

  const grievanceForm = document.getElementById("grievanceForm");
  if (grievanceForm) {
    grievanceForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("Grievance submitted successfully!", "success");
      grievanceForm.reset();
    });
  }

  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showToast("System settings saved.", "success");
    });
  }

  const assignmentForm = document.getElementById("assignmentForm");
  if (assignmentForm) {
    assignmentForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const inputs = assignmentForm.querySelectorAll("input, select, textarea");
      const title = inputs[0]?.value || "New Assignment";
      const subject = inputs[1]?.value || "Subject";
      const dueDate = inputs[3]?.value || "Pending";
      const maxMarks = inputs[4]?.value || "10";

      const tbody = document.querySelector("#assignments .data-table tbody");
      if (tbody) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${title}</td>
          <td>${subject}</td>
          <td>${maxMarks}</td>
          <td>${dueDate}</td>
          <td><span class="badge badge-warning">0 / 120</span></td>
          <td><button class="btn btn-sm btn-outline" type="button" onclick="showToast('No submissions yet.', 'info')">View</button></td>
        `;
        tbody.prepend(tr);
      }

      showToast("Assignment created and published to students.", "success");
      assignmentForm.reset();
    });
  }

  const announcementForm = document.getElementById("announcementForm");
  if (announcementForm) {
    announcementForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const inputs = announcementForm.querySelectorAll("input, select, textarea");
      const title = inputs[0]?.value || "New Announcement";
      const target = inputs[1]?.value || "All";
      const date = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const ul = document.querySelector("#announcements ul");
      if (ul) {
        const li = document.createElement("li");
        li.style.cssText = "padding:14px 16px;background:var(--paper);border:1px solid var(--border);border-radius:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px";
        li.innerHTML = `
          <div>
            <strong>${title}</strong>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">Posted to: ${target} &nbsp;·&nbsp; ${date}</div>
          </div>
          <span class="badge badge-info">NEW</span>
        `;
        ul.prepend(li);
      }

      showToast("Announcement posted successfully.", "success");
      announcementForm.reset();
    });
  }

  const addUserForm = document.getElementById("addUserForm");
  if (addUserForm) {
    addUserForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("newUserName")?.value.trim() || "New User";
      const email = document.getElementById("newUserEmail")?.value.trim() || "user@edu.in";
      const role = (document.getElementById("newUserRole")?.value || "student").toLowerCase();
      const dept = document.getElementById("newUserDept")?.value || "CSE";

      const tbody = document.querySelector("#adminUserTable tbody");
      if (tbody) {
        const badgeClass =
          role === "admin" ? "badge-danger" :
          role === "teacher" ? "badge-warning" :
          "badge-info";

        const label = role.charAt(0).toUpperCase() + role.slice(1);

        const tr = document.createElement("tr");
        tr.setAttribute("data-role", role);
        tr.innerHTML = `
          <td>${name}</td>
          <td>${email}</td>
          <td><span class="badge ${badgeClass}">${label}</span></td>
          <td>${dept}</td>
          <td><span class="dot dot-green"></span>Active</td>
          <td>Just now</td>
          <td class="action-cell">
            <button class="btn btn-sm btn-outline" type="button" onclick="showToast('Opening profile: ${name}', 'success')">View</button>
          </td>
        `;
        tbody.prepend(tr);
      }

      showToast(`User "${name}" created successfully.`, "success");
      addUserForm.reset();
    });
  }

  const noticeForm = document.getElementById("noticeForm");
  if (noticeForm) {
    noticeForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const title = document.getElementById("noticeTitle")?.value || "New Notice";
      const audience = document.getElementById("noticeAudience")?.value || "All Users";
      const priority = document.getElementById("noticePriority")?.value || "Low";

      const tbody = document.querySelector("#notices .data-table tbody");
      if (tbody) {
        const pClass =
          priority.toLowerCase() === "high" ? "badge-danger" :
          priority.toLowerCase() === "medium" ? "badge-warning" :
          "badge-neutral";

        const date = new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>New</td>
          <td>${title}</td>
          <td>${audience}</td>
          <td>Admin</td>
          <td>${date}</td>
          <td><span class="badge ${pClass}">${priority.toUpperCase()}</span></td>
          <td><button class="btn btn-sm btn-outline" type="button" onclick="showToast('Notice unpublished.', 'error')">Unpublish</button></td>
        `;
        tbody.prepend(tr);
      }

      showToast("Notice published to all users.", "success");
      noticeForm.reset();
    });
  }

  bindSidebarNavigation();
}

/* =========================
   RENDER DASHBOARD CONTENT
========================= */
function renderDashboard() {
  const role = currentRole();
  const name = currentName();
  const rollNo = currentRollNo();

  if (!role || !ROLE_PAGE[role]) {
    handleLogout();
    return;
  }

  const expectedPage = ROLE_PAGE[role];
  const actualPage = pageFileName();

  if (actualPage !== expectedPage) {
    window.location.replace(expectedPage);
    return;
  }

  const displayName = name || (role === "student" ? "Student" : role === "teacher" ? "Teacher" : "Admin");
  const footerLabel = rollNo && role === "student" ? `${displayName} (${rollNo})` : displayName;

  setTextIfExists("studentName", displayName);
  setTextIfExists("teacherName", displayName);
  setTextIfExists("adminName", displayName);

  setTextIfExists("sidebarName", displayName);
  setTextIfExists("sidebarTeacherName", displayName);
  setTextIfExists("sidebarAdminName", displayName);

  setTextIfExists("profileName", displayName);
  setTextIfExists("footerUser", footerLabel);

  renderAvatar(displayName);
  startClock();

  if (role === "student") {
    initStudentChart("mainChart", [8.2, 8.4, 8.5, 8.6, 8.7, 8.74]);
  } else if (role === "teacher") {
    initTeacherChart("mainChart");
  } else if (role === "admin") {
    initAdminChart("mainChart");
  }

  loadDashboardData(role);
  initializeDashboardEvents();
}

/* =========================
   LOGIN FLOW
========================= */
async function doLogin() {
  if (isLoggingIn) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password") || document.getElementById("pwd");
  const loginBtn = document.getElementById("loginBtn") || qs(".btn");
  const rememberCheck = qs(".remember input");

  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!email || !password) {
    showMessage("Please enter email and password", false);
    return;
  }

  if (loginBtn && !loginBtn.dataset.defaultText) {
    loginBtn.dataset.defaultText = loginBtn.textContent || "Login";
  }

  isLoggingIn = true;
  setLoginButtonLoading(true);
  showMessage("");
  clearToastHost();

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      showMessage(data.error || "Invalid credentials", false);
      return;
    }

    saveSession(data);

    if (rememberCheck) {
      localStorage.setItem("rememberMe", rememberCheck.checked ? "true" : "false");
      if (rememberCheck.checked) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    }

    showMessage("Login successful ✅", true);
    showToast("Welcome back!", "success");

    setTimeout(() => {
      redirectByRole(data.role);
    }, 450);
  } catch (err) {
    console.error(err);
    showMessage("Server not reachable", false);
  } finally {
    setLoginButtonLoading(false);
    isLoggingIn = false;
  }
}

window.doLogin = doLogin;

/* =========================
   FORGOT PASSWORD PLACEHOLDER
========================= */
function bindForgotPassword() {
  const forgot =
    document.getElementById("forgotPwd") ||
    document.querySelector(".forgot");

  if (!forgot) return;

  forgot.addEventListener("click", (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("email") || document.getElementById("pwd")?.closest("div")?.querySelector("input[type='email']");
    const email = emailInput ? emailInput.value.trim() : "";

    if (!email) {
      alert("Please enter your email first");
      return;
    }

    alert("Password reset link sent to: " + email);
  });
}

/* =========================
   PAGE PROTECTION
========================= */
function protectPages() {
  if (isLoginPage()) return;

  const role = currentRole();
  const page = pageFileName();

  if (!role || ROLE_PAGE[role] !== page) {
    handleLogout();
  }
}

/* =========================
   LOGIN PAGE SETUP
========================= */
function setupLoginPage() {
  const loginBtn = document.getElementById("loginBtn") || qs(".btn");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password") || document.getElementById("pwd");
  const toggleBtn = document.getElementById("togglePassword") || document.getElementById("eyeBtn");
  const rememberCheck = qs(".remember input");

  if (loginBtn && !loginBtn.dataset.defaultText) {
    loginBtn.dataset.defaultText = loginBtn.textContent || "Login";
  }

  if (toggleBtn && !toggleBtn.getAttribute("onclick")) {
    toggleBtn.addEventListener("click", toggleEye);
  }

  if (loginBtn && !loginBtn.getAttribute("onclick")) {
    loginBtn.addEventListener("click", doLogin);
  }

  if (emailInput && passwordInput) {
    const remembered = localStorage.getItem("rememberMe") === "true";
    const savedEmail = localStorage.getItem("rememberedEmail");

    if (remembered && savedEmail && !emailInput.value) {
      emailInput.value = savedEmail;
      if (rememberCheck) rememberCheck.checked = true;
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (document.activeElement === emailInput || document.activeElement === passwordInput)) {
        doLogin();
      }
    });
  }

  bindForgotPassword();
  startLoginAnimation();

  const role = currentRole();
  if (role && ROLE_PAGE[role]) {
    window.location.replace(ROLE_PAGE[role]);
  }
}

/* =========================
   BOOT
========================= */
function boot() {
  if (isLoginPage()) {
    setupLoginPage();
    return;
  }

  protectPages();
  renderDashboard();
}

if (window.__eduWorkflowBooted) {
  // Prevent duplicate init if the script gets included twice
} else {
  window.__eduWorkflowBooted = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}