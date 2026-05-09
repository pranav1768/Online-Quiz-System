// js/utils.js - Shared utilities: API client, auth, toast, helpers

const API_BASE = 'http://localhost:5000/api';

// ============================================================
// AUTH HELPERS
// ============================================================
const Auth = {
  getToken() { return localStorage.getItem('quiz_token'); },
  getUser()  { const u = localStorage.getItem('quiz_user'); return u ? JSON.parse(u) : null; },

  setSession(token, user) {
    localStorage.setItem('quiz_token', token);
    localStorage.setItem('quiz_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('quiz_token');
    localStorage.removeItem('quiz_user');
  },

  isLoggedIn()  { return !!this.getToken(); },
  isAdmin()     { const u = this.getUser(); return u && u.role === 'admin'; },

  requireAuth(adminOnly = false) {
    if (!this.isLoggedIn()) {
      window.location.href = '/frontend/index.html';
      return false;
    }
    if (adminOnly && !this.isAdmin()) {
      window.location.href = '/frontend/dashboard.html';
      return false;
    }
    return true;
  },

  redirectIfLoggedIn() {
    if (this.isLoggedIn()) {
      const user = this.getUser();
      window.location.href = user.role === 'admin'
        ? '/frontend/admin/dashboard.html'
        : '/frontend/dashboard.html';
    }
  },

  logout() {
    this.clearSession();
    window.location.href = '/frontend/index.html';
  },
};

// ============================================================
// API CLIENT
// ============================================================
const API = {
  async request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token   = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res  = await fetch(`${API_BASE}${endpoint}`, opts);
    const data = await res.json();

    // Handle token expiry globally
    if (res.status === 401 && Auth.isLoggedIn()) {
      Auth.clearSession();
      Toast.show('Session expired. Please log in again.', 'error');
      setTimeout(() => window.location.href = '/frontend/index.html', 1500);
    }

    return { ok: res.ok, status: res.status, data };
  },

  get(ep)        { return this.request('GET',    ep); },
  post(ep, b)    { return this.request('POST',   ep, b); },
  patch(ep, b)   { return this.request('PATCH',  ep, b); },
  delete(ep)     { return this.request('DELETE', ep); },
};

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      zIndex: '9999', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    });
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3500) {
    this.init();
    const colors = {
      success: '#3fb950', error: '#f85149', warning: '#d29922', info: '#58a6ff'
    };
    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };

    const toast = document.createElement('div');
    Object.assign(toast.style, {
      background: '#1c2128', border: `1px solid ${colors[type]}`,
      color: '#e6edf3', padding: '0.75rem 1rem', borderRadius: '8px',
      fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: '320px',
      animation: 'fadeIn 0.25s ease',
      fontFamily: "'Space Grotesk', sans-serif",
    });

    toast.innerHTML = `
      <span style="color:${colors[type]};font-weight:700">${icons[type]}</span>
      <span>${message}</span>
    `;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
};

// ============================================================
// HELPERS
// ============================================================
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(minutes) {
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes} min`;
}

function secondsToMMSS(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function populateNavbar(role) {
  const nav = document.getElementById('navbar-links');
  if (!nav) return;
  const user = Auth.getUser();
  if (!user) return;

  const adminLinks = role === 'admin' ? `
    <a href="/frontend/admin/dashboard.html">Dashboard</a>
    <a href="/frontend/admin/quizzes.html">Quizzes</a>
    <a href="/frontend/admin/users.html">Users</a>
    <a href="/frontend/admin/results.html">Results</a>
  ` : `
    <a href="/frontend/dashboard.html">Home</a>
    <a href="/frontend/my-results.html">My Results</a>
  `;

  nav.innerHTML = `
    ${adminLinks}
    <span style="color:var(--text-muted);font-size:0.82rem;padding:0 0.5rem">${user.username}</span>
    <button class="btn btn-secondary btn-sm" onclick="Auth.logout()">Logout</button>
  `;
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
}

function hideError(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.classList.add('hidden');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Loading...';
  } else {
    btn.innerHTML = btn._originalText;
  }
}
