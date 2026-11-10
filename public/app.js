/**
 * Dev Harbour — Real-Time Integration Controller & Navigation Bridge
 * Bridges the Landing Page (#intro) and Dashboard (.app) seamlessly.
 * Features:
 * - Server-Sent Events (SSE) for real-time live activity & instant leaderboard updates
 * - Real-time notification drawer with live badges and relative timestamps
 * - Persistent authentication & developer profiles
 * - Sandboxed coding challenges with live execution time (ms) and instant XP credit
 * - Verified course catalog & reading mode
 * - Real-time project directory submissions & hackathon registration
 */
(function() {
  'use strict';

  const API_BASE = '/api';

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = value;
    return element.innerHTML;
  }
  let currentUser = null;
  let token = localStorage.getItem('dh_token') || null;
  let notifications = JSON.parse(localStorage.getItem('dh_notifications') || '[]');
  let unreadCount = 0;
  let sseSource = null;

  // Relative Time Formatter
  function timeAgo(dateString) {
    if (!dateString) return 'just now';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.max(1, Math.floor((now - date) / 1000));
    if (seconds < 15) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  // Toast Helper
  function showToast(msg) {
    if (typeof window.toast === 'function') {
      window.toast(msg);
    } else {
      const t = document.getElementById('toast');
      if (t) {
        t.textContent = msg;
        t.classList.add('on');
        setTimeout(() => t.classList.remove('on'), 2500);
      }
    }
  }

  // Inject Styles
  const style = document.createElement('style');
  style.id = 'dh-fs-styles';
  style.textContent = `
    /* Modal Wrapper */
    .dh-modal-wrap { position:fixed; inset:0; background:rgba(15,12,28,.65); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); display:grid; place-items:center; z-index:99999; padding:16px; opacity:0; pointer-events:none; transition:opacity .25s ease; }
    .dh-modal-wrap.open { opacity:1; pointer-events:auto; }
    .dh-box { background:var(--card); color:var(--ink); border-radius:var(--r); padding:30px 24px; max-width:520px; width:100%; box-shadow:0 24px 60px -20px rgba(0,0,0,.5); border:1px solid var(--line); position:relative; max-height:88vh; overflow-y:auto; font-family:var(--font); transform:translateY(12px); transition:transform .25s ease; }
    .dh-modal-wrap.open .dh-box { transform:translateY(0); }
    .dh-box h3 { font-size:22px; font-weight:800; letter-spacing:-.02em; margin-bottom:6px; }
    .dh-box p.desc { color:var(--mut); font-size:13px; margin-bottom:18px; line-height:1.45; }
    .dh-x { position:absolute; top:20px; right:20px; width:32px; height:32px; border-radius:50%; background:var(--soft); color:var(--ink); display:grid; place-items:center; font-size:18px; cursor:pointer; border:none; line-height:1; }
    .dh-x:hover { background:var(--line); }
    .dh-tabs { display:flex; gap:6px; background:var(--soft); padding:4px; border-radius:12px; margin-bottom:18px; }
    .dh-tabs button { flex:1; padding:8px 12px; border-radius:9px; font-size:13px; font-weight:700; color:var(--mut); background:transparent; border:none; cursor:pointer; transition:all .2s; }
    .dh-tabs button.on { background:var(--blk); color:#fff; }
    .dh-row { margin-bottom:12px; display:flex; flex-direction:column; gap:5px; text-align:left; }
    .dh-row label { font-size:11px; font-weight:700; color:var(--mut); text-transform:uppercase; letter-spacing:.05em; }
    .dh-row input, .dh-row textarea, .dh-row select { width:100%; padding:11px 14px; border-radius:12px; border:1px solid var(--line); background:var(--bg); color:var(--ink); font-family:inherit; font-size:13.5px; outline:none; box-sizing:border-box; }
    .dh-row input:focus, .dh-row textarea:focus, .dh-row select:focus { border-color:var(--blk); }
    .dh-btn { width:100%; padding:12px; border-radius:99px; background:var(--blk); color:#fff; font-weight:800; font-size:13.5px; border:none; cursor:pointer; margin-top:8px; transition:transform .2s; }
    .dh-btn:hover { transform:translateY(-1px); }
    .dh-msg-err { color:#e5484d; font-size:12px; font-weight:600; margin-bottom:10px; display:none; }
    .dh-read-content { font-size:14px; line-height:1.65; color:var(--ink); margin:16px 0; background:var(--bg); padding:16px; border-radius:14px; max-height:300px; overflow-y:auto; border:1px solid var(--line); }
    .dh-read-content pre { background:var(--blk); color:#fff; padding:12px; border-radius:8px; overflow-x:auto; font-size:12.5px; margin:10px 0; font-family:monospace; }
    .dh-course-link { display:inline-flex; align-items:center; gap:8px; background:var(--soft); color:var(--ink); padding:8px 14px; border-radius:99px; font-size:12.5px; font-weight:700; text-decoration:none; margin-top:8px; }
    .dh-course-link:hover { background:var(--line); }

    /* Profile UI */
    .dh-prof-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:18px 0; }
    .dh-prof-stat { background:var(--bg); border:1px solid var(--line); border-radius:14px; padding:12px; text-align:center; }
    .dh-prof-stat b { font-size:20px; display:block; color:var(--ink); font-weight:800; }
    .dh-prof-stat span { font-size:11px; color:var(--mut); font-weight:600; text-transform:uppercase; }
    .dh-badge-item { display:flex; align-items:center; gap:12px; background:var(--bg); border:1px solid var(--line); padding:10px 14px; border-radius:14px; margin-bottom:8px; }
    .dh-badge-icon { width:36px; height:36px; border-radius:10px; background:var(--blk); color:#fff; display:grid; place-items:center; font-size:16px; flex:none; }

    /* Navigation Bridge Buttons */
    .dh-nav-btn { display:inline-flex; align-items:center; gap:8px; background:var(--blk); color:#fff; border-radius:99px; padding:8px 18px; font-size:13px; font-weight:700; cursor:pointer; border:none; transition:transform .2s; }
    .dh-nav-btn:hover { transform:translateY(-1px); }
    .dh-nav-pill { display:inline-flex; align-items:center; gap:6px; background:var(--card); color:var(--ink); padding:8px 16px; border-radius:99px; font-size:13px; font-weight:700; border:1px solid var(--line); cursor:pointer; transition:background .2s; }
    .dh-nav-pill:hover { background:var(--soft); }

    /* Real-Time Live Status Indicator */
    .dh-live-pill { display:inline-flex; align-items:center; gap:6px; background:var(--card); border:1px solid var(--line); padding:6px 12px; border-radius:99px; font-size:12px; font-weight:700; color:var(--ink); }
    .dh-live-dot { width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; animation:dhPulse 2s infinite; }
    @keyframes dhPulse { 0%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.85)} 100%{opacity:1;transform:scale(1)} }

    /* Notification Bell Badge */
    .ci.has-notifs { position:relative; }
    .dh-badge { position:absolute; top:-3px; right:-3px; background:#e5484d; color:#fff; font-size:10px; font-weight:800; min-width:18px; height:18px; border-radius:99px; display:grid; place-items:center; padding:0 4px; box-shadow:0 2px 6px rgba(229,72,77,.4); }

    /* Notification Drawer */
    .dh-notif-item { display:flex; align-items:flex-start; gap:12px; padding:12px; border-radius:12px; background:var(--bg); border:1px solid var(--line); margin-bottom:8px; font-size:13px; line-height:1.4; text-align:left; }
    .dh-notif-icon { width:28px; height:28px; border-radius:8px; background:var(--blk); color:#fff; display:grid; place-items:center; font-size:13px; flex:none; margin-top:2px; }
    .dh-notif-time { font-size:11px; color:var(--mut); margin-top:4px; font-weight:600; }
  `;
  document.head.appendChild(style);

  // Modal Container
  const modalWrap = document.createElement('div');
  modalWrap.className = 'dh-modal-wrap';
  modalWrap.id = 'dh-modal';
  modalWrap.innerHTML = `
    <div class="dh-box" id="dh-box">
      <button class="dh-x" id="dh-x" aria-label="Close">&times;</button>
      <div id="dh-content"></div>
    </div>
  `;
  document.body.appendChild(modalWrap);

  const modalContent = modalWrap.querySelector('#dh-content');
  const closeBtn = modalWrap.querySelector('#dh-x');

  function closeModal() {
    modalWrap.classList.remove('open');
  }
  closeBtn.onclick = closeModal;
  modalWrap.onclick = e => { if (e.target === modalWrap) closeModal(); };

  // ==========================================
  // 1. REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // ==========================================
  function setupRealTimeStream() {
    if (typeof EventSource === 'undefined') return;

    try {
      if (sseSource) sseSource.close();
      sseSource = new EventSource(`${API_BASE}/events`);

      sseSource.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          handleRealTimeEvent(data);
        } catch (err) {}
      };

      sseSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch (e) {}
  }

  function handleRealTimeEvent(data) {
    if (!data || !data.type) return;

    if (data.type === 'connected') {
      if (Array.isArray(data.recent)) {
        notifications = data.recent;
        renderNotifBadge();
      }
      return;
    }

    // Add to notifications
    notifications.unshift(data);
    if (notifications.length > 25) notifications.pop();
    unreadCount++;
    try { localStorage.setItem('dh_notifications', JSON.stringify(notifications)); } catch (e) {}
    renderNotifBadge();

    // Specific Real-Time Event Handlers
    if (data.type === 'challenge_passed') {
      // Re-sync leaderboard live
      syncLeaderboard();
      if (currentUser && data.username === currentUser.username) {
        currentUser.totalXp = (currentUser.totalXp || 0) + (data.xpEarned || 50);
        updateUserUI();
      } else {
        showToast(`✦ @${data.username} just solved "${data.challengeTitle}"! (+${data.xpEarned} XP)`);
      }
    } else if (data.type === 'lesson_completed') {
      syncLeaderboard();
      if (currentUser && data.username === currentUser.username) {
        currentUser.totalXp = (currentUser.totalXp || 0) + (data.xpEarned || 25);
        updateUserUI();
      }
    } else if (data.type === 'project_created') {
      if (Array.isArray(window.J) && data.project) {
        window.J.unshift([data.project.title, data.project.description, data.project.category]);
        if (typeof window.rp === 'function') window.rp();
      }
      showToast(`🚀 @${data.username} published project "${data.project.title}"!`);
    } else if (data.type === 'user_joined') {
      showToast(`👋 Welcome @${data.username} to Dev Harbour!`);
    }
  }

  function renderNotifBadge() {
    const notifBtn = document.querySelector('.ci[aria-label="Notifications"]');
    if (!notifBtn) return;

    let badge = notifBtn.querySelector('.dh-badge');
    if (unreadCount > 0) {
      notifBtn.classList.add('has-notifs');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'dh-badge';
        notifBtn.appendChild(badge);
      }
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    } else if (badge) {
      badge.remove();
      notifBtn.classList.remove('has-notifs');
    }
  }

  function showNotificationsModal() {
    unreadCount = 0;
    renderNotifBadge();

    modalContent.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <div>
          <span class="dh-live-pill"><span class="dh-live-dot"></span>Live Feed</span>
          <h3 style="margin-top:8px">Platform Notifications</h3>
        </div>
        <button class="dh-btn" style="width:auto; padding:6px 14px; margin:0; font-size:12px; background:var(--soft); color:var(--ink);" id="dh-clear-btn">Clear</button>
      </div>

      <div style="max-height:360px; overflow-y:auto; padding-right:4px;">
        ${notifications.length ? notifications.map(n => {
          let icon = '✦';
          if (n.type === 'challenge_passed') icon = '✓';
          if (n.type === 'lesson_completed') icon = '📚';
          if (n.type === 'project_created') icon = '🚀';
          if (n.type === 'user_joined') icon = '👋';

          return `
            <div class="dh-notif-item">
              <div class="dh-notif-icon">${icon}</div>
              <div style="flex:1">
                <div>${escapeHtml(n.message || n.title || 'Platform activity recorded')}</div>
                <div class="dh-notif-time">${timeAgo(n.timestamp)}</div>
              </div>
            </div>
          `;
        }).join('') : '<p class="mut" style="padding:20px 0; text-align:center;">No recent activity yet. As students solve challenges and publish projects, live events will appear here in real time!</p>'}
      </div>
    `;

    const clearBtn = modalContent.querySelector('#dh-clear-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        notifications = [];
        try { localStorage.removeItem('dh_notifications'); } catch (e) {}
        showNotificationsModal();
      };
    }
    modalWrap.classList.add('open');
  }

  // Hook notification bell button in header
  function hookNotifications() {
    const notifBtn = document.querySelector('.ci[aria-label="Notifications"]');
    if (notifBtn) {
      notifBtn.removeAttribute('data-t');
      notifBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        showNotificationsModal();
      };
    }
  }

  // ==========================================
  // 2. NAVIGATION BRIDGE (LANDING ↔ DASHBOARD)
  // ==========================================
  function setupNavigationBridge() {
    const xn = document.querySelector('.xn');
    const xa = document.querySelector('.xn .xa');

    // Add Launch Dashboard button to Landing top bar
    if (xn && !document.getElementById('dh-launch-dash-btn')) {
      const launchBtn = document.createElement('button');
      launchBtn.id = 'dh-launch-dash-btn';
      launchBtn.className = 'dh-nav-btn';
      launchBtn.innerHTML = `<span>Dashboard</span> <svg class="i" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
      launchBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        window.goApp('home');
      };
      xn.appendChild(launchBtn);
    }

    if (xa) {
      xa.style.cursor = 'pointer';
      xa.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const isJoin = e.target.tagName === 'B' || e.target.textContent.includes('Join');
        showAuthModal(isJoin ? 'signup' : 'login');
      };
    }

    // Sidebar Landing Page button
    const sb = document.querySelector('.sb');
    const sbLogo = document.querySelector('.sb .logo');
    if (sbLogo) {
      sbLogo.style.cursor = 'pointer';
      sbLogo.title = 'Switch to Landing Page';
      sbLogo.onclick = () => window.goLanding();
    }

    if (sb && !document.getElementById('dh-to-landing-btn')) {
      const toLandingBtn = document.createElement('button');
      toLandingBtn.id = 'dh-to-landing-btn';
      toLandingBtn.className = 'nv';
      toLandingBtn.style.marginBottom = '8px';
      toLandingBtn.style.background = 'var(--soft)';
      toLandingBtn.innerHTML = `<svg class="i" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Landing Page`;
      toLandingBtn.onclick = () => window.goLanding();
      const nav = document.getElementById('nav');
      if (nav) {
        sb.insertBefore(toLandingBtn, nav);
      }
    }

    // Top action bar Landing button & Live indicator
    const topAct = document.querySelector('.top .act');
    if (topAct && !document.getElementById('dh-top-landing-btn')) {
      const topLandingPill = document.createElement('button');
      topLandingPill.id = 'dh-top-landing-btn';
      topLandingPill.className = 'dh-nav-pill';
      topLandingPill.innerHTML = `<svg class="i" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span>Landing</span>`;
      topLandingPill.onclick = () => window.goLanding();
      topAct.insertBefore(topLandingPill, topAct.firstChild);

      const livePill = document.createElement('span');
      livePill.className = 'dh-live-pill';
      livePill.innerHTML = `<span class="dh-live-dot"></span>Live`;
      topAct.insertBefore(livePill, topLandingPill.nextSibling);
    }
  }

  // ==========================================
  // 3. AUTHENTICATION & SESSIONS
  // ==========================================
  function showAuthModal(defaultTab) {
    defaultTab = defaultTab || 'login';
    modalContent.innerHTML = `
      <h3>Welcome to Dev Harbour</h3>
      <p class="desc">Sign in or create a student account to track learning paths, submit challenges, earn verified XP, and join the leaderboard.</p>
      <div class="dh-tabs">
        <button id="t-login" class="${defaultTab === 'login' ? 'on' : ''}">Sign In</button>
        <button id="t-signup" class="${defaultTab === 'signup' ? 'on' : ''}">Create Account</button>
      </div>
      <div class="dh-msg-err" id="dh-auth-err"></div>

      <form id="f-login" style="${defaultTab === 'login' ? '' : 'display:none'}">
        <div class="dh-row">
          <label>Email or Username</label>
          <input type="text" id="l-user" placeholder="alexandra or student@devharbour.in" required autocomplete="username">
        </div>
        <div class="dh-row">
          <label>Password</label>
          <input type="password" id="l-pass" placeholder="Your password" required autocomplete="current-password">
        </div>
        <button type="submit" class="dh-btn">Sign In to Dev Harbour</button>
      </form>

      <form id="f-signup" style="${defaultTab === 'signup' ? '' : 'display:none'}">
        <div class="dh-row">
          <label>Full Name</label>
          <input type="text" id="s-name" placeholder="Alexandra Vance" required autocomplete="name">
        </div>
        <div class="dh-row">
          <label>Username</label>
          <input type="text" id="s-user" placeholder="alexandra" required autocomplete="username">
        </div>
        <div class="dh-row">
          <label>Email Address</label>
          <input type="email" id="s-email" placeholder="alexandra@example.com" required autocomplete="email">
        </div>
        <div class="dh-row">
          <label>Password (min. 8 characters)</label>
          <input type="password" id="s-pass" minlength="8" placeholder="Create a strong password" required autocomplete="new-password">
        </div>
        <button type="submit" class="dh-btn">Create Free Student Account</button>
      </form>
    `;

    const errBox = modalContent.querySelector('#dh-auth-err');
    const tabLogin = modalContent.querySelector('#t-login');
    const tabSignup = modalContent.querySelector('#t-signup');
    const formLogin = modalContent.querySelector('#f-login');
    const formSignup = modalContent.querySelector('#f-signup');

    tabLogin.onclick = () => {
      tabLogin.classList.add('on');
      tabSignup.classList.remove('on');
      formLogin.style.display = '';
      formSignup.style.display = 'none';
      errBox.style.display = 'none';
    };
    tabSignup.onclick = () => {
      tabSignup.classList.add('on');
      tabLogin.classList.remove('on');
      formSignup.style.display = '';
      formLogin.style.display = 'none';
      errBox.style.display = 'none';
    };

    formLogin.onsubmit = async e => {
      e.preventDefault();
      errBox.style.display = 'none';
      const login = modalContent.querySelector('#l-user').value.trim();
      const password = modalContent.querySelector('#l-pass').value;
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        token = data.token;
        localStorage.setItem('dh_token', token);
        currentUser = data.user;
        updateUserUI();
        syncLeaderboard();
        closeModal();
        showToast(`Welcome back, ${currentUser.username}!`);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      }
    };

    formSignup.onsubmit = async e => {
      e.preventDefault();
      errBox.style.display = 'none';
      const fullName = modalContent.querySelector('#s-name').value.trim();
      const username = modalContent.querySelector('#s-user').value.trim();
      const email = modalContent.querySelector('#s-email').value.trim();
      const password = modalContent.querySelector('#s-pass').value;
      try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, username, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        token = data.token;
        localStorage.setItem('dh_token', token);
        currentUser = data.user;
        updateUserUI();
        syncLeaderboard();
        closeModal();
        showToast(`Account created! Welcome, ${currentUser.username}!`);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      }
    };

    modalWrap.classList.add('open');
  }

  function updateUserUI() {
    const heading = document.querySelector('.top h1');
    const subtitle = document.querySelector('.top p');
    const crBtn = document.querySelector('.top .act .cr');
    const av = document.querySelector('.top .act .av');

    if (currentUser) {
      if (heading) heading.textContent = `Hi, ${currentUser.fullName || currentUser.username}!`;
      if (subtitle) subtitle.textContent = `${(currentUser.totalXp || 0).toLocaleString()} XP · Level ${currentUser.level || 1} · ${currentUser.streakDays || 0} day streak`;
      if (crBtn) {
        crBtn.textContent = `${currentUser.username} (Profile)`;
        crBtn.removeAttribute('data-t');
        crBtn.onclick = () => showStudentProfile(currentUser.username);
      }
      if (av) {
        const initials = (currentUser.fullName || currentUser.username || 'DH').slice(0, 2).toUpperCase();
        av.textContent = initials;
        av.style.display = 'grid';
        av.style.placeItems = 'center';
        av.style.color = '#fff';
        av.style.fontWeight = '800';
        av.style.fontSize = '14px';
        av.style.cursor = 'pointer';
        av.onclick = () => showStudentProfile(currentUser.username);
      }
    } else {
      if (heading) heading.textContent = 'Hi, Alexandra!';
      if (subtitle) subtitle.textContent = "Let's make today productive and learn something new.";
      if (crBtn) {
        crBtn.textContent = '+ Sign up';
        crBtn.removeAttribute('data-t');
        crBtn.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          showAuthModal('signup');
        };
      }
      if (av) {
        av.textContent = '';
        av.style.cursor = 'default';
        av.onclick = null;
      }
    }
  }

  async function logoutUser() {
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    token = null;
    currentUser = null;
    localStorage.removeItem('dh_token');
    updateUserUI();
    closeModal();
    showToast('Signed out successfully');
  }

  // ==========================================
  // 4. STUDENT PROFILE MODAL
  // ==========================================
  async function showStudentProfile(username) {
    if (!token && !currentUser) {
      showAuthModal('login');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/user/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = res.ok ? await res.json() : null;
      const p = (data && data.profile) || currentUser;
      const s = (data && data.stats) || { totalXp: p.totalXp || 0, level: p.level || 1, streakDays: 0, completedLessons: 0, solvedChallenges: 0, submittedProjects: 0 };
      const achs = (data && data.achievements) || [];

      modalContent.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
          <div>
            <span class="tag" style="background:var(--blk);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;">Level ${s.level} · Student</span>
            <h3 style="margin-top:8px">${p.fullName || p.username}</h3>
            <p class="desc" style="margin-bottom:0">@${p.username}</p>
          </div>
          <button class="dh-btn" style="width:auto; padding:6px 16px; margin:0; font-size:12px; background:var(--soft); color:var(--ink);" id="dh-btn-logout">Logout</button>
        </div>

        <div class="dh-prof-stat-grid">
          <div class="dh-prof-stat">
            <b>${(s.totalXp || 0).toLocaleString()}</b>
            <span>Total XP</span>
          </div>
          <div class="dh-prof-stat">
            <b>${s.streakDays || 0}d</b>
            <span>Streak</span>
          </div>
          <div class="dh-prof-stat">
            <b>${s.solvedChallenges || 0}</b>
            <span>Solved</span>
          </div>
          <div class="dh-prof-stat">
            <b>${s.completedLessons || 0}</b>
            <span>Lessons</span>
          </div>
          <div class="dh-prof-stat">
            <b>${s.submittedProjects || 0}</b>
            <span>Projects</span>
          </div>
          <div class="dh-prof-stat">
            <b>${achs.length}</b>
            <span>Badges</span>
          </div>
        </div>

        <h4 style="font-size:15px; font-weight:800; margin-bottom:12px;">Unlocked Achievements</h4>
        <div>
          ${achs.length ? achs.map(a => `
            <div class="dh-badge-item">
              <div class="dh-badge-icon">✦</div>
              <div>
                <b style="font-size:13.5px; display:block;">${a.title}</b>
                <span style="font-size:12px; color:var(--mut);">${a.description} (+${a.xpReward} XP)</span>
              </div>
            </div>
          `).join('') : '<p class="mut" style="font-size:13px">Solve challenges and complete reading lessons to unlock platform badges!</p>'}
        </div>
      `;

      const logoutBtn = modalContent.querySelector('#dh-btn-logout');
      if (logoutBtn) logoutBtn.onclick = logoutUser;
      modalWrap.classList.add('open');
    } catch (e) {
      showToast('Could not load student profile');
    }
  }

  // ==========================================
  // 5. CHALLENGE SUBMISSION WITH REAL-TIME EXECUTION METRICS
  // ==========================================
  function hookChallengeRunner() {
    window.addEventListener('message', async e => {
      const d = e.data;
      if (!d || d.e) return;
      const cur = window.cur != null ? window.cur : 0;
      const C = window.C;
      if (!C || !C[cur]) return;

      const output = (d.L || []).join('\n').trim();
      const expected = String(C[cur][6]).trim();
      if (output === expected) {
        const startTime = performance.now();
        try {
          const codeEl = document.getElementById('code');
          const codeVal = codeEl ? codeEl.value : '';
          const challengeId = `chal-${cur + 1}`;
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_BASE}/challenges/${challengeId}/submit`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ code: codeVal })
          });
          const execMs = Math.round(performance.now() - startTime);

          if (res.ok) {
            const result = await res.json();
            const resBadge = document.getElementById('res');
            if (resBadge) {
              resBadge.textContent = `✓ Test passed (${result.executionTimeMs || execMs}ms) · +${result.xpEarned || 50} XP`;
            }
            showToast(`🎉 Challenge passed (${result.executionTimeMs || execMs}ms)! +${result.xpEarned || 50} XP awarded!`);
            if (currentUser && result.totalXp) {
              currentUser.totalXp = result.totalXp;
              updateUserUI();
            }
            syncLeaderboard();
          }
        } catch (err) {}
      }
    });
  }

  // ==========================================
  // 6. COURSE CATALOG & READING MODE
  // ==========================================
  function hookCourses() {
    document.addEventListener('click', async e => {
      const card = e.target.closest('#pg .c');
      if (card) {
        const titleEl = card.querySelector('h3');
        const courseTitle = titleEl ? titleEl.textContent : '';
        openCourseDetail(courseTitle);
      }
    });
  }

  async function openCourseDetail(courseTitle) {
    try {
      const res = await fetch(`${API_BASE}/courses`);
      if (!res.ok) return;
      const data = await res.json();
      const course = (data.courses || []).find(c => c.title.toLowerCase().includes(courseTitle.toLowerCase())) || data.courses[0];
      if (!course) return;

      const detailRes = await fetch(`${API_BASE}/courses/${course.id}`);
      const detailData = detailRes.ok ? await detailRes.json() : { lessons: [] };
      const lessons = detailData.lessons || [];

      modalContent.innerHTML = `
        <span class="tag" style="background:var(--soft);color:var(--blk);font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;">${course.provider} · ${course.level}</span>
        <h3 style="margin-top:10px">${course.title}</h3>
        <p class="desc">${course.description}</p>
        <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
          <a href="${course.officialUrl}" target="_blank" rel="noopener noreferrer" class="dh-course-link">
            Open Official Course ↗ (${course.provider})
          </a>
        </div>
        <h4 style="font-size:15px; font-weight:700; margin-bottom:10px;">Interactive Lessons & Reading:</h4>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${lessons.map((l, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg); padding:10px 14px; border-radius:12px; border:1px solid var(--line);">
              <div>
                <b style="font-size:13.5px; display:block;">${l.title}</b>
                <span style="font-size:12px; color:var(--mut);">${l.readingTimeMinutes || 10} min read · +${l.xpReward || 25} XP</span>
              </div>
              <button class="dh-btn" style="width:auto; padding:6px 16px; margin:0; font-size:12px;" onclick="window.DH_ReadLesson('${course.id}', '${l.id}')">Read Lesson</button>
            </div>
          `).join('')}
        </div>
      `;
      modalWrap.classList.add('open');
    } catch (err) {}
  }

  window.DH_ReadLesson = async function(courseId, lessonId) {
    try {
      const res = await fetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}`);
      if (!res.ok) return;
      const data = await res.json();
      const l = data.lesson;

      modalContent.innerHTML = `
        <span class="tag" style="background:var(--soft);color:var(--blk);font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;">Lesson · +${l.xpReward || 25} XP</span>
        <h3 style="margin-top:10px">${l.title}</h3>
        <div class="dh-read-content">
          ${l.contentHtml || l.content}
        </div>
        <button class="dh-btn" id="dh-finish-lesson">Complete Lesson (+${l.xpReward || 25} XP)</button>
      `;

      const finishBtn = modalContent.querySelector('#dh-finish-lesson');
      finishBtn.onclick = async () => {
        if (!token) {
          showToast('Sign in to claim lesson XP');
          showAuthModal('login');
          return;
        }
        const compRes = await fetch(`${API_BASE}/courses/${courseId}/lessons/${lessonId}/complete`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const compData = await compRes.json();
        if (compRes.ok) {
          showToast(`Lesson completed! +${compData.xpEarned || 25} XP awarded!`);
          if (currentUser) {
            currentUser.totalXp = compData.totalXp;
            updateUserUI();
          }
          syncLeaderboard();
        } else {
          showToast(compData.message || 'Lesson already completed');
        }
        closeModal();
      };
    } catch (err) {}
  };

  // ==========================================
  // 7. PROJECTS & SUBMISSIONS
  // ==========================================
  function hookProjects() {
    document.addEventListener('click', e => {
      const prjLink = e.target.closest('a[data-t*="Project pages need a backend"]');
      if (prjLink) {
        e.preventDefault();
        e.stopPropagation();
        showProjectModal();
      }
    });

    window.openProjectSubmit = showProjectModal;
  }

  function showProjectModal() {
    modalContent.innerHTML = `
      <h3>Submit Your Project</h3>
      <p class="desc">Share your build with the Dev Harbour student community and earn +50 XP upon verification.</p>
      <div class="dh-msg-err" id="dh-prj-err"></div>
      <form id="f-project">
        <div class="dh-row">
          <label>Project Title</label>
          <input type="text" id="p-title" placeholder="e.g. Orbit Notes" required>
        </div>
        <div class="dh-row">
          <label>Category</label>
          <select id="p-cat">
            <option value="Web">Web Development</option>
            <option value="Mobile">Mobile App</option>
            <option value="Security">Cybersecurity</option>
            <option value="AI">Artificial Intelligence</option>
            <option value="Game">Game Development</option>
          </select>
        </div>
        <div class="dh-row">
          <label>Description</label>
          <textarea id="p-desc" placeholder="What does your project do?" rows="3" required></textarea>
        </div>
        <div class="dh-row">
          <label>Tech Stack (comma separated)</label>
          <input type="text" id="p-tech" placeholder="React, Node.js, PostgreSQL">
        </div>
        <div class="dh-row">
          <label>GitHub Repository URL</label>
          <input type="url" id="p-repo" placeholder="https://github.com/..." required>
        </div>
        <div class="dh-row">
          <label>Live Demo URL (optional)</label>
          <input type="url" id="p-demo" placeholder="https://...">
        </div>
        <button type="submit" class="dh-btn">Publish Project (+50 XP)</button>
      </form>
    `;

    const prjErr = modalContent.querySelector('#dh-prj-err');
    const formPrj = modalContent.querySelector('#f-project');

    formPrj.onsubmit = async e => {
      e.preventDefault();
      if (!token) {
        showToast('Please sign in first to submit a project');
        showAuthModal('login');
        return;
      }
      const title = modalContent.querySelector('#p-title').value.trim();
      const category = modalContent.querySelector('#p-cat').value;
      const description = modalContent.querySelector('#p-desc').value.trim();
      const techStack = modalContent.querySelector('#p-tech').value.split(',').map(s => s.trim()).filter(Boolean);
      const repoUrl = modalContent.querySelector('#p-repo').value.trim();
      const liveUrl = modalContent.querySelector('#p-demo').value.trim();

      try {
        const res = await fetch(`${API_BASE}/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ title, category, description, techStack, repoUrl, liveUrl })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Submission failed');
        if (Array.isArray(window.J)) {
          window.J.unshift([title, description, category]);
          if (typeof window.rp === 'function') window.rp();
        }
        closeModal();
        showToast('🎉 Project published! +50 XP awarded!');
        if (currentUser && data.xpEarned) {
          currentUser.totalXp = (currentUser.totalXp || 0) + data.xpEarned;
          updateUserUI();
        }
        syncLeaderboard();
      } catch (err) {
        prjErr.textContent = err.message;
        prjErr.style.display = 'block';
      }
    };

    modalWrap.classList.add('open');
  }

  // ==========================================
  // 8. HACKATHONS & TASKS
  // ==========================================
  function hookHackathonAndTasks() {
    document.addEventListener('click', e => {
      const hackBtn = e.target.closest('button[data-t*="Registration needs a backend"]');
      if (hackBtn) {
        e.preventDefault();
        e.stopPropagation();
        window.open('https://unstop.com/o/vON6wtS?lb=useupllP&utm_medium=Share&utm_source=online_coding_challenge&utm_campaign=Parthhyg96055', '_blank');
        showToast('Opening official Orcathon 2K26 registration on Unstop...');
      }

      const taskBtn = e.target.closest('button[data-t*="Custom tasks need a backend"]');
      if (taskBtn) {
        e.preventDefault();
        e.stopPropagation();
        const goal = prompt('Enter a new personal learning goal or task:');
        if (goal && goal.trim()) {
          if (Array.isArray(window.G)) {
            window.G.push(goal.trim());
            if (typeof window.rg === 'function') window.rg();
            showToast('Goal added to your dashboard!');
          }
        }
      }
    });
  }

  // ==========================================
  // 9. REAL-TIME LEADERBOARD SYNC
  // ==========================================
  async function syncLeaderboard() {
    try {
      const [resAll, resWeekly] = await Promise.all([
        fetch(`${API_BASE}/leaderboard?period=all`),
        fetch(`${API_BASE}/leaderboard?period=weekly`)
      ]);
      if (resAll.ok && resWeekly.ok) {
        const dataAll = await resAll.json();
        const dataWeekly = await resWeekly.json();
        if (window.L && dataAll.leaderboard && dataWeekly.leaderboard) {
          window.L['All-time'] = dataAll.leaderboard.map(u => [u.username, u.challengesSolved || 0, u.totalXp || 0]);
          window.L.Weekly = dataWeekly.leaderboard.map(u => [u.username, u.challengesSolved || 0, u.totalXp || 0]);
          if (typeof window.rl === 'function') window.rl('Weekly');
          const zlb = document.getElementById('zlb');
          if (zlb && window.L['All-time']) {
            zlb.innerHTML = window.L['All-time'].map((u, i) =>
              `<div class="zlb"><b>${i+1}</b><span>${escapeHtml(u[0])}</span><span>${escapeHtml(u[1])}</span><span>${escapeHtml(u[2].toLocaleString())} XP</span></div>`
            ).join('');
          }
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  async function initAuth() {
    if (token) {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          updateUserUI();
        } else {
          token = null;
          localStorage.removeItem('dh_token');
          updateUserUI();
        }
      } catch (e) {
        updateUserUI();
      }
    } else {
      updateUserUI();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    setupNavigationBridge();
    hookNotifications();
    setupRealTimeStream();
    initAuth();
    syncLeaderboard();
    hookChallengeRunner();
    hookCourses();
    hookProjects();
    hookHackathonAndTasks();
  }

})();
