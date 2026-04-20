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
    { x: 0.5, y: 0.9, r: 180, c: [6, 182, 212], speed: 0.00014, phase: 4 },
    { x: 0.92, y: 0.15, r: 150, c: [34, 197, 94], speed: 0.0001, phase: 5.5 },
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

async function doLogin() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("pwd")?.value.trim();
  const loginButton = document.getElementById("loginBtn") || document.querySelector(".btn");
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

async function bootLogin() {
  if (pageFileName() !== "index.html") return;
  const session = window.Session.get();
  if (session.role && session.userId) {
    try {
      // Only auto-redirect when the stored session is still valid on backend.
      await window.Api.me();
      const role = session.role;
      window.location.replace(role === "student" ? "student.html" : role === "teacher" ? "teacher.html" : "admin.html");
      return;
    } catch {
      window.Session.clear();
    }
  }
  startLoginAnimation();
  const eyeBtn = document.getElementById("eyeBtn");
  if (eyeBtn && !eyeBtn.getAttribute("onclick")) {
    eyeBtn.addEventListener("click", toggleEye);
  }
  const signInBtn = document.getElementById("loginBtn") || document.querySelector(".btn");
  if (signInBtn && !signInBtn.getAttribute("onclick")) {
    signInBtn.addEventListener("click", doLogin);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { bootLogin(); });
} else {
  bootLogin();
}