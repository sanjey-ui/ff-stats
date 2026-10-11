'use strict';

/*
 * Solo Leveling: Hunter Management - login layer.
 *
 * Six reserved hunter profiles. A profile starts unclaimed: the first login
 * sets its password. Passwords are never stored in plain text and none are
 * hard-coded in this public repo - only a salted PBKDF2 hash is kept, and only
 * in this browser's localStorage. This is a game profile system, not real
 * authentication: there is no server, so anyone with access to the browser can
 * clear or reset the data.
 */

const USERS_KEY = 'sl_users_v1';
const SESSION_KEY = 'sl_session_v1';
const MIN_PASSWORD = 6;
const PBKDF2_ITERATIONS = 150000;

const ROSTER = [
  { username: 'sanjey',     display: 'Sanjey',     kind: 'Player',    title: 'The Weakest Hunter' },
  { username: 'chatgpt',    display: 'ChatGPT',    kind: 'AI Hunter', title: 'The Scholar' },
  { username: 'claude',     display: 'Claude',     kind: 'AI Hunter', title: 'The Strategist' },
  { username: 'gemini',     display: 'Gemini',     kind: 'AI Hunter', title: 'The Twin Blade' },
  { username: 'perplexity', display: 'Perplexity', kind: 'AI Hunter', title: 'The Seeker' },
  { username: 'grok',       display: 'Grok',       kind: 'AI Hunter', title: 'The Wildcard' },
];

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();

/* ---------- storage helpers (localStorage can throw, so wrap it) ---------- */
function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveUsers(users) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); return true; }
  catch (e) { return false; }
}
function getSession() {
  try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
}
function setSession(username) {
  try {
    if (username) sessionStorage.setItem(SESSION_KEY, username);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) { /* ignore */ }
}

/* ---------- hashing ---------- */
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return toB64(bits);
}

/* ---------- views ---------- */
let pending = null; // roster entry currently being logged into

function show(screenId) {
  ['screen-select', 'screen-login', 'screen-game'].forEach((id) => {
    $(id).classList.toggle('hidden', id !== screenId);
  });
  document.body.classList.toggle('in-game', screenId === 'screen-game');
}

function findHunter(username) {
  return ROSTER.find((h) => h.username === username) || null;
}

function renderRoster() {
  const users = loadUsers();
  const list = $('roster');
  list.textContent = '';

  ROSTER.forEach((h) => {
    const claimed = Boolean(users[h.username]);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.setAttribute('role', 'listitem');

    const kind = document.createElement('div');
    kind.className = 'kind';
    kind.textContent = h.kind;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = h.display;

    const ttl = document.createElement('div');
    ttl.className = 'ttl';
    ttl.textContent = '@' + h.username + ' - ' + h.title;

    const state = document.createElement('div');
    state.className = 'state' + (claimed ? '' : ' new');
    state.textContent = claimed ? 'Registered' : 'Unclaimed - set a password';

    btn.append(kind, name, ttl, state);
    btn.addEventListener('click', () => openLogin(h));
    list.appendChild(btn);
  });
}

function openLogin(hunter) {
  pending = hunter;
  const claimed = Boolean(loadUsers()[hunter.username]);

  $('login-eyebrow').textContent = claimed ? '[ LOGIN ]' : '[ CLAIM PROFILE ]';
  $('login-title').textContent = hunter.display + ' (@' + hunter.username + ')';
  $('login-hint').textContent = claimed
    ? 'Enter your password to continue.'
    : 'First login claims this profile. Choose a password of at least ' + MIN_PASSWORD + ' characters.';
  $('confirm-row').classList.toggle('hidden', claimed);
  $('submit').textContent = claimed ? 'Enter' : 'Claim & enter';
  $('password').autocomplete = claimed ? 'current-password' : 'new-password';
  $('login-form').reset();
  $('login-error').textContent = '';
  show('screen-login');
  $('password').focus();
}

function openHome(username) {
  const hunter = findHunter(username);
  if (!hunter) { setSession(null); renderRoster(); show('screen-select'); return; }
  show('screen-game');
  GameUI.start(username, onLogout);
}

/* ---------- actions ---------- */
async function onSubmit(event) {
  event.preventDefault();
  if (!pending) return;

  const errorEl = $('login-error');
  const submit = $('submit');
  const password = $('password').value;
  const users = loadUsers();
  const record = users[pending.username];

  errorEl.textContent = '';

  if (password.length < MIN_PASSWORD) {
    errorEl.textContent = 'Password must be at least ' + MIN_PASSWORD + ' characters.';
    return;
  }
  if (!record && password !== $('confirm').value) {
    errorEl.textContent = 'Passwords do not match.';
    return;
  }
  if (!(window.crypto && crypto.subtle)) {
    errorEl.textContent = 'This browser cannot hash passwords here. Open the site over HTTPS.';
    return;
  }

  submit.disabled = true;
  try {
    if (record) {
      const hash = await hashPassword(password, fromB64(record.salt));
      if (hash !== record.hash) {
        errorEl.textContent = 'Wrong password.';
        return;
      }
    } else {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await hashPassword(password, salt);
      users[pending.username] = { salt: toB64(salt), hash, createdAt: new Date().toISOString() };
      if (!saveUsers(users)) {
        errorEl.textContent = 'Could not save the profile. Browser storage may be blocked.';
        return;
      }
    }
    setSession(pending.username);
    openHome(pending.username);
  } finally {
    submit.disabled = false;
  }
}

function onBack() {
  pending = null;
  renderRoster();
  show('screen-select');
}

function onLogout() {
  GameUI.stop();
  setSession(null);
  pending = null;
  renderRoster();
  show('screen-select');
}

/* ---------- boot ---------- */
$('login-form').addEventListener('submit', onSubmit);
$('back').addEventListener('click', onBack);

renderRoster();
const existing = getSession();
if (existing && loadUsers()[existing]) openHome(existing);
else show('screen-select');
