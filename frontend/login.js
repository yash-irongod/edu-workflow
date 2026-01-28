/**
 * Application Core Logic
 * Merges API handling, Authentication, Login, and Logout functionality.
 */

// --- 1. Constants & Configuration ---
const API_BASE = '/api';

// --- 2. Shared Utilities ---

/**
 * Centralized Logout Handler
 * Clears storage and redirects to login if not already there.
 */
function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    // Or use localStorage.clear() if you want to wipe everything

    if (!window.location.pathname.includes("login.html")) {
        window.location.replace("login.html");
    }
}

/**
 * Check if a JWT token is expired
 */
function isTokenExpired(token) {
    try {
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        // Check if expiry time (exp) is in the past
        return payload.exp * 1000 < Date.now();
    } catch (e) {
        return true; // Treat invalid tokens as expired
    }
}

// --- 3. API Service ---

const api = {
    request: async (endpoint, method = 'GET', body = null) => {
        const token = localStorage.getItem("authToken");

        const headers = {
            'Content-Type': 'application/json'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const config = {
                method,
                headers,
            };
            
            if (body) config.body = JSON.stringify(body);

            const response = await fetch(`${API_BASE}${endpoint}`, config);

            // Handle Unauthorized access globally
            if (response.status === 401) {
                handleLogout(); // Uses centralized logout
                return null;
            }

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            console.error("API Request Failed:", error);
            throw error;
        }
    }
};

// --- 4. Login Logic ---

async function loginUser(username, password) {
    const loginBtn = document.getElementById("loginBtn");
    const errorDisplay = document.getElementById("errorDisplay");

    // Reset UI
    if (errorDisplay) errorDisplay.innerText = "";

    if (!username || !password) {
        if (errorDisplay) errorDisplay.innerText = "Please enter your credentials.";
        return;
    }

    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "Logging in...";
    }

    try {
        // We use fetch directly here since the api.request wrapper requires a token 
        // usually, but login is public. However, sticking to raw fetch for auth 
        // prevents circular dependencies if api.request enforces auth strictly later.
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) throw new Error("Invalid credentials");

        const data = await response.json();

        if (!data.token || !data.role) {
            throw new Error("Server response missing token or role.");
        }

        // Store Session Data
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userRole", data.role);

        handleRedirect(data.role);

    } catch (error) {
        if (errorDisplay) {
            errorDisplay.innerText = "Login failed: " + error.message;
        } else {
            alert("Login failed: " + error.message);
        }
    } finally {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "Login";
        }
    }
}

function handleRedirect(role) {
    const routes = {
        'student': 'student.html',
        'teacher': 'teacher.html',
        'admin': 'admin.html'
    };
    window.location.replace(routes[role] || 'login.html');
}

// --- 5. Initialization & Event Listeners ---

// This runs immediately to secure pages before content fully renders
(function checkAuth() {
    const currentPage = window.location.pathname;

    // Skip auth check if we are already on the login page
    if (currentPage.includes("login.html")) return;

    const token = localStorage.getItem("authToken");
    const role = localStorage.getItem("userRole");

    // 1. Check if credentials exist
    if (!token || !role) {
        handleLogout();
        return;
    }

    // 2. Check if token is expired
    if (isTokenExpired(token)) {
        handleLogout();
    }
})();

// DOMContentLoaded handles event binding (Logout button, Forms, etc.)
document.addEventListener("DOMContentLoaded", () => {
    
    // Bind Logout Button
    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) {
        logoutButton.addEventListener("click", (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    // Optional: Bind Login Form Submit if it exists
    const loginForm = document.getElementById("loginForm"); 
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = loginForm.elements['username'].value; // Adjust based on your HTML name attributes
            const password = loginForm.elements['password'].value;
            loginUser(username, password);
        });
    }
});