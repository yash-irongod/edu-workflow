"use strict";

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function pageFileName() {
  const file = window.location.pathname.split("/").pop();
  return file || "index.html";
}

function showMessage(message, success = false) {
  const toastType = success ? "success" : "error";
  if (message) {
    const toastHost = document.getElementById("toast");
    if (toastHost) {
      toastHost.textContent = message;
      toastHost.className = success ? "show ok" : "show bad";
      setTimeout(() => {
        toastHost.className = "";
      }, 2600);
    }
  }
  if (window.showToast && message) {
    window.showToast(message, toastType);
  }
}

function toggleEye() {
  const passwordInput = document.getElementById("pwd");
  const eyeButton = document.getElementById("eyeBtn");
  if (!passwordInput || !eyeButton) return;
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  eyeButton.textContent = showing ? "\u{1F441}" : "\u{1F648}";
}

window.toggleEye = toggleEye;

function startLoginAnimation() {
  const canvas = document.getElementById("bg");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random(),
    y: Math.random(),
    dx: (Math.random() - 0.5) * 0.0005,
    dy: (Math.random() - 0.5) * 0.0005,
    radius: Math.random() * 2.5 + 0.6,
  }));

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#08111f");
    gradient.addColorStop(1, "#101f3c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle) => {
      particle.x += particle.dx;
      particle.y += particle.dy;
      if (particle.x < 0 || particle.x > 1) particle.dx *= -1;
      if (particle.y < 0 || particle.y > 1) particle.dy *= -1;
      context.beginPath();
      context.arc(particle.x * canvas.width, particle.y * canvas.height, particle.radius, 0, Math.PI * 2);
      context.fillStyle = "rgba(127, 178, 255, 0.55)";
      context.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
}

async function doLogin() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("pwd")?.value.trim();
  const loginButton = document.querySelector(".btn");
  if (!email || !password) {
    showMessage("Please enter email and password");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Signing In...";

  try {
    const payload = await window.Api.login(email, password);
    window.Session.clear();
    window.Session.save(payload);
    showMessage("Login successful", true);
    setTimeout(() => {
      window.location.replace(
        payload.role === "student" ? "student.html" :
        payload.role === "teacher" ? "teacher.html" :
        "admin.html"
      );
    }, 320);
  } catch (error) {
    showMessage(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
}

window.doLogin = doLogin;

function bootLogin() {
  if (pageFileName() !== "index.html") return;
  if (window.Session.get().role) {
    const role = window.Session.get().role;
    window.location.replace(role === "student" ? "student.html" : role === "teacher" ? "teacher.html" : "admin.html");
    return;
  }
  startLoginAnimation();
  document.getElementById("eyeBtn")?.addEventListener("click", toggleEye);
  document.querySelector(".btn")?.addEventListener("click", doLogin);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootLogin);
} else {
  bootLogin();
}
