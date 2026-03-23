/* =========================================================
   frontend/login.js
   FINAL MERGED VERSION (Week-1) ✅
   ---------------------------------------------------------
   Combines:
   - Teammate 2: UI, spinner, toggle password, messages
   - Teammate 5: session handling, redirects, page protection

   Backend expectations (Week-1):
   POST /login
   Success: { role, name }
   Error:   { error }

   NOTE:
   - Extra helpers are FUTURE-READY but DO NOT break Week-1
   - Only API_BASE is critical for fixing "Server not reachable"
   ========================================================= */

/* ---------- CONFIG (FIXED) ---------- */
// IMPORTANT: backend runs on Flask at this URL
const API_BASE = "http://127.0.0.1:5000";

/* ---------- DOM ELEMENTS ---------- */
const loginBtn = document.getElementById("loginBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const spinner = document.getElementById("spinner");
const msgBox = document.getElementById("msg");
const togglePassword = document.getElementById("togglePassword");
const forgotPwd = document.getElementById("forgotPwd");

/* ---------- UI HELPERS ---------- */
function showMessage(text, success = true) {
  if (!msgBox) return;
  msgBox.textContent = text;
  msgBox.style.color = success ? "#16a34a" : "#ef4444";
}

function setLoading(on) {
  if (!spinner || !loginBtn) return;
  if (on) {
    spinner.classList.remove("hidden");
    loginBtn.disabled = true;
  } else {
    spinner.classList.add("hidden");
    loginBtn.disabled = false;
  }
}

/* ---------- PASSWORD TOGGLE (EYE ICON) ---------- */
if (togglePassword && passwordInput) {
  togglePassword.addEventListener("click", () => {
    const hidden = passwordInput.type === "password";
    passwordInput.type = hidden ? "text" : "password";
    togglePassword.classList.toggle("shown", hidden);
    togglePassword.setAttribute(
      "aria-label",
      hidden ? "Hide password" : "Show password"
    );
  });
}

/* ---------- SESSION HELPERS (Week-1 SIMPLE) ---------- */
function saveSession(data) {
  if (!data) return;
  localStorage.setItem("role", data.role);
  localStorage.setItem("name", data.name);
}

function handleLogout() {
  localStorage.clear();
  window.location.replace("index.html");
}

/* ---------- REDIRECT LOGIC ---------- */
function handleRedirect(role) {
  const routes = {
    student: "student.html",
    teacher: "teacher.html",
    admin: "admin.html"
  };
  window.location.replace(routes[role] || "index.html");
}

/* ---------- MAIN LOGIN FLOW ---------- */
async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    showMessage("Please enter email and password", false);
    return;
  }

  setLoading(true);
  showMessage("");

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showMessage(data.error || "Invalid credentials ❌", false);
      return;
    }

    // ✅ SUCCESS (Week-1)
    saveSession(data);
    showMessage("Login successful ✅", true);

    setTimeout(() => {
      handleRedirect(data.role);
    }, 400);

  } catch (err) {
    console.error(err);
    showMessage("Server not reachable ❌", false);
  } finally {
    setLoading(false);
  }
}

/* ---------- EVENT BINDINGS ---------- */
loginBtn.addEventListener("click", login);

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement.tagName === "INPUT") {
    login();
  }
});

if (forgotPwd) {
  forgotPwd.addEventListener("click", () => {
    if (!emailInput.value) {
      alert("Please enter your email first");
      return;
    }
    alert("Password reset link sent to: " + emailInput.value);
  });
}

/* ---------- PAGE PROTECTION (Week-1) ---------- */
(function protectPages() {
  const path = window.location.pathname;
  const isLogin =
    path.endsWith("index.html") || path === "/" || path.endsWith("login.html");

  if (isLogin) return;

  if (!localStorage.getItem("role")) {
    handleLogout();
  }
})();

/* ---------- LOGOUT BUTTON ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });
  }
});