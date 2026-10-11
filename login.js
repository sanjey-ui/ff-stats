'use strict';

/*
 * Gate Access - login logic.
 *
 * The Access Key is never stored in this file: only a salted PBKDF2-SHA256 hash
 * of it is. That keeps the plain text out of the public repo, but this check
 * runs in the browser, so it is a game gate, not real security (anyone can read
 * the page source or skip the check). Real protection needs a server.
 */
(function () {
  const AUTH = {
    user: 'sanjey',
    display: 'Sanjey',
    iterations: 200000,
    salt: 'A1FFzKS8tKhxD2H4dhxMEQ==',
    hash: 'l5qgYNzsty60Meycz+8sksNbX/czem3lUX3pn93pwHQ=',
  };
  const MAX_SEALS = 5;
  const LOCK_SECONDS = 30;
  const K_SESSION = 'sl_hunter';
  const K_SEALS = 'sl_seals';
  const K_LOCK = 'sl_lock';

  const $ = (id) => document.getElementById(id);
  const el = {
    form: $('login-form'), id: $('hunter-id'), key: $('access-key'), reveal: $('reveal'),
    open: $('open'), msg: $('msg'), seals: $('seals'), license: $('license'),
    stamp: $('stamp'), status: $('status'), welcome: $('welcome'), who: $('who'), logout: $('logout'),
  };

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function derive(password) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromB64(AUTH.salt), iterations: AUTH.iterations, hash: 'SHA-256' },
      key,
      256
    );
    return new Uint8Array(bits);
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  /* ---------- state ---------- */
  let seals = MAX_SEALS;
  let busy = false;
  let lockTimer = null;

  const savedSeals = parseInt(store.get(K_SEALS), 10);
  if (savedSeals >= 0 && savedSeals <= MAX_SEALS) seals = savedSeals;

  function setMsg(text, kind) {
    el.msg.textContent = text || '';
    el.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function renderSeals(breakIndex) {
    const pips = el.seals.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('broken', i >= seals);
      pips[i].classList.remove('breaking');
    }
    if (typeof breakIndex === 'number' && pips[breakIndex]) {
      void pips[breakIndex].offsetWidth; // restart the animation
      pips[breakIndex].classList.add('breaking');
    }
    el.seals.setAttribute('aria-label', seals + ' of ' + MAX_SEALS + ' gate seals intact');
  }

  function setLocked(locked) {
    el.id.disabled = locked;
    el.key.disabled = locked;
    el.open.disabled = locked;
    el.reveal.disabled = locked;
  }

  /* ---------- lockout: all seals broken ---------- */
  function startLock(until) {
    setLocked(true);
    clearInterval(lockTimer);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(lockTimer);
        store.del(K_LOCK);
        seals = MAX_SEALS;
        store.set(K_SEALS, String(seals));
        renderSeals();
        setLocked(false);
        setMsg('The Gate has stirred. You may try again.', 'warn');
        el.id.focus();
        return;
      }
      setMsg('Every seal is broken. The Gate re-opens in ' + left + 's.');
    };
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  /* ---------- success / logout ---------- */
  function showOpen(animated) {
    store.set(K_SESSION, AUTH.user);
    store.del(K_SEALS);
    store.del(K_LOCK);
    seals = MAX_SEALS;
    renderSeals();
    el.who.textContent = AUTH.display;
    el.stamp.textContent = 'Verified';
    el.stamp.classList.add('ok');
    el.status.textContent = 'Verified';
    el.welcome.setAttribute('aria-hidden', 'false');
    el.logout.tabIndex = 0;
    document.body.classList.add('gate-open');
    if (animated) setTimeout(() => el.logout.focus(), 1400);
  }

  function closeGate() {
    store.del(K_SESSION);
    document.body.classList.remove('gate-open');
    el.welcome.setAttribute('aria-hidden', 'true');
    el.logout.tabIndex = -1;
    el.stamp.textContent = 'Unverified';
    el.stamp.classList.remove('ok');
    el.status.textContent = 'Unverified';
    el.form.reset();
    setMsg('');
    setLocked(false);
    el.open.textContent = 'Open the Gate';
    setTimeout(() => el.id.focus(), 300);
  }

  /* ---------- events ---------- */
  el.reveal.addEventListener('click', () => {
    const show = el.key.type === 'password';
    el.key.type = show ? 'text' : 'password';
    el.reveal.textContent = show ? 'Hide' : 'Reveal';
    el.reveal.setAttribute('aria-pressed', String(show));
  });

  el.logout.addEventListener('click', closeGate);

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || el.open.disabled) return;

    const id = el.id.value.trim().toLowerCase();
    const key = el.key.value;
    if (!id || !key) { setMsg('Enter your Hunter ID and Access Key.', 'warn'); return; }
    if (!(window.crypto && crypto.subtle)) {
      setMsg('This gate needs a secure (https) connection to read your key.');
      return;
    }

    busy = true;
    el.open.disabled = true;
    el.open.textContent = 'Reading the runes...';
    setMsg('');

    let ok = false;
    try {
      // always hash, so a wrong ID and a wrong key take the same time
      const got = await derive(key);
      const keyOk = sameBytes(got, fromB64(AUTH.hash));
      ok = keyOk && id === AUTH.user;
    } catch (err) {
      busy = false;
      el.open.disabled = false;
      el.open.textContent = 'Open the Gate';
      setMsg('The runes would not read. Please try again.');
      return;
    }

    busy = false;
    el.open.textContent = 'Open the Gate';

    if (ok) {
      el.open.disabled = false;
      showOpen(true);
      return;
    }

    seals = Math.max(0, seals - 1);
    store.set(K_SEALS, String(seals));
    renderSeals(seals);
    el.key.value = '';
    el.license.classList.remove('shake');
    void el.license.offsetWidth;
    el.license.classList.add('shake');

    if (seals === 0) {
      const until = Date.now() + LOCK_SECONDS * 1000;
      store.set(K_LOCK, String(until));
      startLock(until);
    } else {
      el.open.disabled = false;
      setMsg('Unknown Hunter ID or Access Key. ' + seals + (seals === 1 ? ' seal' : ' seals') + ' left.');
      el.key.focus();
    }
  });

  /* ---------- boot ---------- */
  renderSeals();
  if (store.get(K_SESSION) === AUTH.user) {
    showOpen(false);
  } else {
    const until = parseInt(store.get(K_LOCK), 10);
    if (until && until > Date.now()) startLock(until);
    else if (seals === 0) { seals = MAX_SEALS; renderSeals(); }
    el.id.focus();
  }
})();
