// ── Server address ───────────────────────────────────────────
const SERVER = 'http://localhost:5000';

// ── Save / Get login info ─────────────────────────────────────
function saveLogin(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function getToken() { return localStorage.getItem('token'); }
function getUser()  { return JSON.parse(localStorage.getItem('user') || 'null'); }

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/frontend/index.html';
}

// ── Redirect if not logged in ─────────────────────────────────
function requireLogin() {
  if (!getToken()) {
    window.location.href = '/frontend/index.html';
  }
}

// ── Redirect if not admin ─────────────────────────────────────
function requireAdmin() {
  requireLogin();
  if (getUser()?.role !== 'admin') {
    window.location.href = '/frontend/dashboard.html';
  }
}

// ── Make API calls ────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(SERVER + path, options);
  const data     = await response.json();
  return { ok: response.ok, data };
}

// ── Shortcut functions ────────────────────────────────────────
const GET    = (path)        => apiCall('GET',    path);
const POST   = (path, body)  => apiCall('POST',   path, body);
const DELETE = (path)        => apiCall('DELETE', path);

// ── Show a message on page ────────────────────────────────────
function showMessage(elementId, message, type = 'red') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent  = message;
  el.className    = `alert alert-${type}`;
  el.classList.remove('hidden');
}

// ── Convert seconds to MM:SS format ──────────────────────────
function toMMSS(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Fill in the navbar with user name and logout button ───────
function fillNavbar() {
  const user = getUser();
  const el   = document.getElementById('navbar-user');
  if (el && user) {
    el.innerHTML = `
      <span style="color:#aaa;font-size:0.88rem">Hi, ${user.name}</span>
      <button class="btn btn-gray btn-sm" onclick="logout()">Logout</button>
    `;
  }
}
