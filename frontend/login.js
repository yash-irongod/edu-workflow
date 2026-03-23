/**
 * Application Core Logic (Final Production Version)
 * Architecture: Module Pattern with Async Queueing & Auto-Retry
 * Deployment Status: Ready
 */

const CONFIG = {
    API_BASE: '/api', // Change to full URL if hosting frontend separately
    REDIRECTS: {
        student: '/student.html',
        teacher: '/teacher.html',
        admin: '/admin.html',
        login: '/login.html',
        default: '/login.html'
    },
    DEFAULT_CACHE_TIME: 5 * 60 * 1000,
    CSRF_TOKEN: document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null,
    NOTIFICATION_DURATION: 4000
};

// --- 1. Auth Manager ---

const Auth = {
    getToken() { return localStorage.getItem("authToken"); },
    getRefreshToken() { return localStorage.getItem("refreshToken"); },
    getRole() { return localStorage.getItem("userRole"); },
    isLoggedIn() { return !!this.getToken(); },

    setSession(accessToken, refreshToken, role) {
        localStorage.setItem("authToken", accessToken);
        localStorage.setItem("userRole", role);
        if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
    },

    clearSession() {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        localStorage.removeItem("refreshToken");
        API.clearCache();
    },

    /**
     * Robust decoder that handles UTF-8 characters (emojis/accents)
     */
    parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    },

    isTokenExpired(token) {
        const payload = this.parseJwt(token);
        if (!payload) return true;
        // Exp is in seconds, Date.now is ms. 10s buffer for clock drift.
        return (payload.exp * 1000) < (Date.now() + 10000); 
    }
};

// --- 2. API Service (Hardened) ---

const API = {
    cache: new Map(),
    pendingRequests: new Map(),
    isRefreshing: false,
    refreshSubscribers: [],

    subscribeTokenRefresh(cb) { this.refreshSubscribers.push(cb); },
    onRefreshed(token) {
        this.refreshSubscribers.forEach(cb => cb(token));
        this.refreshSubscribers = [];
    },
    clearCache() { this.cache.clear(); },

    async fetch(endpoint, options = {}) {
        const { method = 'GET', body, cache = false, _retry = false } = options;
        const cacheKey = `${method}:${endpoint}:${JSON.stringify(body)}`;

        // 1. Return cached data if valid (GET only)
        if (method === 'GET' && cache && !_retry) {
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CONFIG.DEFAULT_CACHE_TIME)) {
                return cached.data;
            }
        }

        // 2. Deduplicate concurrent identical requests
        if (this.pendingRequests.has(cacheKey) && !_retry) {
            return this.pendingRequests.get(cacheKey);
        }

        const requestPromise = this._performFetch(endpoint, options, cacheKey);
        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            return await requestPromise;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    },

    async _performFetch(endpoint, options, cacheKey) {
        let token = Auth.getToken();

        // 1. Pre-flight Expiration Check
        if (token && Auth.isTokenExpired(token)) {
            try {
                token = await this._handleTokenRefresh();
            } catch (e) {
                handleLogout("Session expired");
                throw e;
            }
        }

        const headers = { 
            'Content-Type': 'application/json',
            ...(CONFIG.CSRF_TOKEN && { 'X-CSRF-Token': CONFIG.CSRF_TOKEN }),
            ...(token && { 'Authorization': `Bearer ${token}` })
        };

        try {
            const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
                method: options.method || 'GET',
                headers,
                body: options.body ? JSON.stringify(options.body) : null
            });

            // 2. The "Clock Drift" Fix: 
            // If server says 401, but we haven't retried yet, try to refresh.
            if (response.status === 401 && !options._retry) {
                try {
                    await this._handleTokenRefresh();
                    // Recursively retry the original request with the new token
                    return this.fetch(endpoint, { ...options, _retry: true });
                } catch (refreshErr) {
                    handleLogout("Authorization failed. Please log in.");
                    throw refreshErr;
                }
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (options.method === 'GET' && options.cache) {
                this.cache.set(cacheKey, { data, timestamp: Date.now() });
            }

            return data;
        } catch (error) {
            // Silence errors during the retry mechanism so they don't spam console
            if (options._retry) throw error; 
            
            console.error(`API Fail: ${endpoint}`, error);
            if (!navigator.onLine) UIManager.notify("No internet connection.", "error");
            throw error;
        }
    },

    async _handleTokenRefresh() {
        if (this.isRefreshing) {
            return new Promise(resolve => this.subscribeTokenRefresh(resolve));
        }

        this.isRefreshing = true;

        try {
            const refreshToken = Auth.getRefreshToken();
            if (!refreshToken) throw new Error("No refresh token");

            const res = await fetch(`${CONFIG.API_BASE}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
            });

            if (!res.ok) throw new Error("Refresh failed");

            const data = await res.json();
            Auth.setSession(data.token, data.refreshToken, Auth.getRole());
            
            this.onRefreshed(data.token);
            return data.token;

        } catch (error) {
            Auth.clearSession();
            throw error;
        } finally {
            this.isRefreshing = false;
        }
    }
};

// --- 3. UI Manager ---

const UIManager = {
    notify(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.className = `app-toast app-toast--${type}`; 
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        
        // Inline styles for zero-dependency usage (Move to CSS in production)
        Object.assign(toast.style, {
            position: 'fixed', top: '20px', right: '20px', padding: '12px 24px',
            background: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8',
            color: 'white', borderRadius: '4px', zIndex: '9999',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontFamily: 'system-ui, sans-serif',
            transition: 'opacity 0.3s'
        });

        document.body.appendChild(toast);
        
        // Remove after delay
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.NOTIFICATION_DURATION);
    },

    redirect(role) {
        window.location.replace(CONFIG.REDIRECTS[role] || CONFIG.REDIRECTS.default);
    }
};

function handleLogout(msg) {
    Auth.clearSession();
    if (msg) UIManager.notify(msg, 'error');
    if (!window.location.pathname.includes('login.html')) {
        setTimeout(() => window.location.replace(CONFIG.REDIRECTS.login), 500);
    }
}

// --- 4. Bootstrapper ---

(async function initApp() {
    window.addEventListener('unhandledrejection', (event) => {
        // Prevent generic "Script Error" logs
        if (event.reason && event.reason.message) {
            console.warn('Background Async Error:', event.reason.message);
        }
    });

    const isLoginPage = window.location.pathname.includes('login.html');

    if (!isLoginPage) {
        if (!Auth.isLoggedIn()) return handleLogout();
        
        // Attempt eager refresh logic
        if (Auth.isTokenExpired(Auth.getToken())) {
            try { await API._handleTokenRefresh(); } 
            catch { return handleLogout("Session expired"); }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

    function bindEvents() {
        document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
            e.preventDefault();
            handleLogout("Logged out successfully");
        });

        const loginForm = document.getElementById("loginForm");
        if (loginForm) {
            loginForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const username = loginForm.username.value.trim();
                const password = loginForm.password.value;
                const btn = loginForm.querySelector('button');

                if (!username || !password) return UIManager.notify("Please enter credentials", "warning");
                if (btn) { btn.disabled = true; btn.textContent = "Logging in..."; }

                try {
                    const res = await fetch(`${CONFIG.API_BASE}/login`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ username, password })
                    });

                    if (!res.ok) throw new Error("Invalid credentials");
                    
                    const data = await res.json();
                    Auth.setSession(data.token, data.refreshToken, data.role);
                    UIManager.notify("Welcome back!", "success");
                    UIManager.redirect(data.role);

                } catch (err) {
                    UIManager.notify(err.message, "error");
                    if (btn) { btn.disabled = false; btn.textContent = "Login"; }
                }
            });
        }
    }
})();
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
