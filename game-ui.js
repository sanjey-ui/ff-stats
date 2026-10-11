'use strict';

/*
 * Solo Leveling: Hunter Management - game screens.
 * Needs engine.js (window.Engine) and players.json. Game progress for all six
 * guilds is saved in this browser's localStorage, so you can log in as each guild.
 */
const GameUI = (function () {
  const E = window.Engine;
  const SAVE_KEY = 'sl_game_v1';
  const PAGE_MARKET = 25;
  const PAGE_DUNGEON = 12;
  const STAT_LABELS = [['str', 'STR'], ['agi', 'AGI'], ['int', 'INT'], ['vit', 'VIT'], ['sense', 'SENSE']];
  const TABS = [['guild', 'Guild'], ['team', 'Team'], ['market', 'Market'], ['dungeons', 'Dungeons'], ['board', 'Leaderboard']];
  const RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'NL'];
  const CLASSES = ['Fighter', 'Tanker', 'Assassin', 'Mage', 'Ranger', 'Healer'];
  const GUILD_COLORS = {
    sanjey: '#4f7cff', chatgpt: '#54e0a8', claude: '#ff9f5c',
    gemini: '#b78bff', perplexity: '#5cd7ff', grok: '#ff5c7a',
  };

  let state = null;
  let pool = null;
  let me = null;
  let tab = 'guild';
  let onLogout = null;
  let battle = null;
  const ui = {
    market: { q: '', rank: '', cls: '', sort: 'power-desc', afford: false, page: 0 },
    dun: { rank: '', sort: 'reward', page: 0 },
  };

  /* ---------------- tiny DOM helpers ---------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'on') Object.keys(v).forEach((ev) => el.addEventListener(ev, v[ev]));
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c); });
    return el;
  }

  function svg(tag, attrs, ...kids) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    kids.flat().forEach((c) => { if (c != null) el.append(c); });
    return el;
  }

  const money = (n) => E.formatINR(n);
  const rankOfPower = (p) => (p >= 10000 ? 'NL' : p >= 4000 ? 'S' : p >= 1500 ? 'A' : p >= 700 ? 'B' : p >= 300 ? 'C' : p >= 100 ? 'D' : 'E');
  const badge = (r) => h('span', { class: 'badge rk-' + r }, r);
  const kpi = (label, value) => h('div', { class: 'kpi' }, h('span', null, label), h('b', null, value));

  function toast(msg, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    box.append(t);
    setTimeout(() => t.remove(), 3800);
  }

  function makeTable(headers, rows) {
    return h('div', { class: 'table-scroll' },
      h('table', null,
        h('thead', null, h('tr', null, headers.map((x) => h('th', null, x)))),
        h('tbody', null, rows)));
  }

  function pager(page, pages, onChange) {
    return h('div', { class: 'actions pager' },
      h('button', { type: 'button', class: 'ghost sm', disabled: page <= 0, on: { click: () => onChange(page - 1) } }, 'Previous'),
      h('span', { class: 'hint' }, 'Page ' + (page + 1) + ' of ' + pages),
      h('button', { type: 'button', class: 'ghost sm', disabled: page >= pages - 1, on: { click: () => onChange(page + 1) } }, 'Next'));
  }

  function statGrid(hu) {
    return h('ul', { class: 'stats' }, STAT_LABELS.map(([k, label]) => h('li', null, h('span', null, label), h('b', null, hu[k]))));
  }

  /* ---------------- save / load ---------------- */
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.version === 1 && s.guilds && s.guilds.sanjey) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save progress (browser storage is blocked).', 'bad'); }
  }

  /* ---------------- lifecycle ---------------- */
  async function start(username, logout) {
    me = username;
    onLogout = logout;
    tab = 'guild';
    battle = null;
    const root = document.getElementById('game');
    root.textContent = '';
    root.append(h('p', { class: 'hint' }, 'Loading hunters...'));

    if (!pool) {
      try {
        const res = await fetch('players.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        pool = E.buildPool(await res.json());
      } catch (e) {
        root.textContent = '';
        root.append(
          h('p', { class: 'error' }, 'Could not load players.json. If you opened this file directly, serve the folder over http (python3 -m http.server).'),
          h('button', { type: 'button', on: { click: logout } }, 'Log out'));
        return;
      }
    }
    state = loadState() || E.newGame();
    saveState();
    render();
  }

  function stop() {
    stopBattle();
    me = null;
  }

  function stopBattle() {
    if (battle && battle.timer) clearInterval(battle.timer);
    if (battle && battle.running && !battle.done && battle.res) {
      toast((battle.res.win ? 'Victory: +' + money(battle.res.reward) : 'Defeat: -' + money(battle.res.penalty)) + ' (battle already resolved).', battle.res.win ? 'good' : 'bad');
    }
    battle = null;
  }

  function go(t) {
    stopBattle();
    tab = t;
    render();
  }

  function act(fn, okMsg) {
    const r = fn();
    if (!r.ok) { toast(r.error, 'bad'); return r; }
    saveState();
    if (okMsg) toast(okMsg, 'good');
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    return r;
  }

  /* ---------------- shell ---------------- */
  function topBar() {
    const g = state.guilds[me];
    const hide = battle && battle.running && !battle.done;
    const cash = hide ? battle.cashBefore : g.cash;
    const runs = hide ? battle.runsBefore : g.runsLeft;
    return h('header', { id: 'topbar', class: 'topbar' },
      h('div', { class: 'who' },
        h('div', { class: 'eyebrow' }, '[ GUILD MASTER ]'),
        h('div', { class: 'gname' }, g.name),
        h('div', { class: 'hint' }, 'Leader: ' + g.leader.name)),
      h('div', { class: 'kpis' },
        kpi('Day', state.day + ' / ' + E.CFG.DAYS),
        kpi('Cash', money(cash)),
        kpi('Entries today', runs + ' / ' + E.CFG.RUNS_PER_DAY),
        kpi('Party', g.party.length + ' / ' + E.CFG.PARTY_MAX),
        kpi('Guild', g.roster.length + ' / ' + E.CFG.ROSTER_MAX)),
      h('button', { type: 'button', class: 'ghost', on: { click: () => { stopBattle(); onLogout(); } } }, 'Log out'));
  }

  function refreshTop() {
    const old = document.getElementById('topbar');
    if (old) old.replaceWith(topBar());
  }

  function tabsBar() {
    return h('nav', { class: 'tabs' }, TABS.map(([id, label]) =>
      h('button', {
        type: 'button',
        class: 'tab' + (tab === id || (tab === 'battle' && id === 'dungeons') ? ' on' : ''),
        on: { click: () => go(id) },
      }, label)));
  }

  function finishedBanner() {
    const w = state.guilds[state.winner];
    const mine = state.winner === me;
    return h('div', { class: 'banner ' + (mine ? 'win' : 'lose') },
      h('b', null, mine ? 'You won the month! ' : 'The month is over. '),
      'Winner: ' + w.name + ' with ' + money(w.cash) + '. Start a new season from the Leaderboard tab.');
  }

  function render() {
    const root = document.getElementById('game');
    root.textContent = '';
    root.append(topBar(), tabsBar());
    if (state.finished) root.append(finishedBanner());
    const views = { guild: guildView, team: teamView, market: marketView, dungeons: dungeonsView, board: boardView, battle: battleView };
    root.append(h('div', { class: 'view' }, views[tab]()));
  }

  /* ---------------- guild ---------------- */
  function personaText(p) {
    return 'takes dungeons it expects to win at least ' + Math.round(p.minWin * 100) +
      '% of the time and spends up to ' + Math.round(p.spendFrac * 100) + '% of its cash on recruits each day (until day ' + E.CFG.BOT_RECRUIT_UNTIL + ').';
  }

  function guildView() {
    const g = state.guilds[me];
    const L = g.leader;
    const lp = E.powerOf(L);
    const lb = E.leaderboard(state);
    const place = lb.findIndex((x) => x.username === me) + 1;
    const persona = (E.LEADERS.find((x) => x.username === me) || {}).persona || { minWin: 0.8, spendFrac: 0.6 };
    const total = g.clears + g.losses;

    const cb = h('input', { type: 'checkbox', id: 'bot-cb' });
    cb.checked = g.bot;
    cb.addEventListener('change', () => {
      g.bot = cb.checked;
      saveState();
      toast(g.bot ? 'Bot mode on: this guild plays itself when the day ends.' : 'Bot mode off: you play this guild yourself.');
    });

    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('h2', null, 'Guild leader'),
        h('div', { class: 'leaderline' }, badge(rankOfPower(lp)), ' ', h('b', null, L.name), ' - ' + L.cls + ' - Power ' + lp),
        statGrid(L),
        h('p', { class: 'hint' }, 'The leader gains +1 to a random stat after every dungeon your guild clears.')),
      h('section', { class: 'gpanel' },
        h('h2', null, 'Standing'),
        h('div', { class: 'kpis' },
          kpi('Place', '#' + place + ' of ' + lb.length),
          kpi('Cash', money(g.cash)),
          kpi('Earned', money(g.earned)),
          kpi('Spent on hunters', money(g.spent)),
          kpi('Dungeons cleared', g.clears),
          kpi('Defeats', g.losses),
          kpi('Win rate', total ? Math.round(g.clears / total * 100) + '%' : '-'))),
      h('section', { class: 'gpanel' },
        h('h2', null, 'Bot mode'),
        h('label', { class: 'check', for: 'bot-cb' }, cb, ' Let a bot play this guild when the day ends'),
        h('p', { class: 'hint' }, 'The bot ' + personaText(persona) + ' The five AI guilds start with bot mode on, so the month can finish without you. Turn it off for any guild you want to play by hand.')),
      h('section', { class: 'gpanel' },
        h('h2', null, 'How to play'),
        h('ol', { class: 'howto' },
          h('li', null, 'Market: buy hunters from the shared pool. Each hunter belongs to one guild, so be quick.'),
          h('li', null, 'Team: pick up to ' + E.CFG.PARTY_MAX + ' hunters for your party. Your guild can hold ' + E.CFG.ROSTER_MAX + '.'),
          h('li', null, 'Dungeons: press Play, check the odds, then Fight. Clear a dungeon to earn its reward. A defeat costs a penalty.'),
          h('li', null, 'Leaderboard: End Day to reset entries and open new dungeons. After day ' + E.CFG.DAYS + ', the guild with the most money wins.'))),
      h('section', { class: 'gpanel' },
        h('h2', null, 'Recent activity'),
        feedList(10)));
  }

  function feedList(n) {
    return h('ul', { class: 'feed' }, state.feed.slice(0, n).map((f) => h('li', null, h('span', null, 'Day ' + f.day + ': '), f.text)));
  }

  /* ---------------- team ---------------- */
  function teamView() {
    const g = state.guilds[me];
    const inParty = (id) => g.party.indexOf(id) >= 0;
    const hunters = E.rosterHunters(state, pool, g).sort((a, b) => (inParty(b.id) - inParty(a.id)) || (E.powerOf(b) - E.powerOf(a)));
    const partyPower = E.partyHunters(state, pool, g).reduce((s, x) => s + E.powerOf(x), 0);

    const rows = hunters.map((hu) => {
      const p = E.powerOf(hu);
      const leader = !!hu.isLeader;
      return h('tr', { class: inParty(hu.id) ? 'inparty' : null },
        h('td', null, h('button', {
          type: 'button',
          class: 'sm ' + (inParty(hu.id) ? '' : 'ghost'),
          on: { click: () => act(() => E.toggleParty(state, me, hu.id)) },
        }, inParty(hu.id) ? 'In party' : 'Bench')),
        h('td', null, (leader ? '★ ' : '') + hu.name),
        h('td', null, badge(leader ? rankOfPower(p) : hu.rank)),
        h('td', null, hu.cls),
        STAT_LABELS.map(([k]) => h('td', { class: 'num' }, hu[k])),
        h('td', { class: 'num' }, p),
        h('td', { class: 'num' }, leader ? '-' : money(hu.price)),
        h('td', null, leader ? '' : h('button', {
          type: 'button',
          class: 'ghost sm',
          on: { click: () => {
            const refund = Math.round(hu.price * E.CFG.SELL_RATE);
            if (confirm('Release ' + hu.name + '? You get back ' + money(refund) + ' (' + Math.round(E.CFG.SELL_RATE * 100) + '% of the price).')) {
              act(() => E.sellHunter(state, pool, me, hu.id), 'Released ' + hu.name + ' (+' + money(refund) + ')');
            }
          } },
        }, 'Release (+' + money(hu.price * E.CFG.SELL_RATE) + ')')));
    });

    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('h2', null, 'Your team'),
        h('div', { class: 'kpis' },
          kpi('Party', g.party.length + ' / ' + E.CFG.PARTY_MAX),
          kpi('Party power', partyPower),
          kpi('Guild members', g.roster.length + ' / ' + E.CFG.ROSTER_MAX)),
        h('div', { class: 'actions left' },
          h('button', { type: 'button', on: { click: () => act(() => E.autoParty(state, pool, me), 'Party set to your strongest hunters.') } }, 'Auto-pick strongest ' + E.CFG.PARTY_MAX),
          h('span', { class: 'hint' }, 'Only the party fights in dungeons. The rest of the guild waits on the bench.'))),
      h('section', { class: 'gpanel' },
        makeTable(['Party', 'Name', 'Rank', 'Class', 'STR', 'AGI', 'INT', 'VIT', 'SENSE', 'Power', 'Value', ''], rows)));
  }

  /* ---------------- market ---------------- */
  function marketView() {
    const m = ui.market;
    const g = state.guilds[me];
    const box = h('div');

    const select = (value, options, onChange) => {
      const el = h('select', null, options.map(([v, t]) => h('option', { value: v }, t)));
      el.value = value;
      el.addEventListener('change', () => onChange(el.value));
      return el;
    };

    const refresh = () => {
      const q = m.q.trim().toLowerCase();
      const cash = g.cash;
      const list = pool.list.filter((x) =>
        !state.owned[x.id] &&
        (!m.rank || x.rank === m.rank) &&
        (!m.cls || x.cls === m.cls) &&
        (!q || x.id.toLowerCase().indexOf(q) >= 0 || x.name.toLowerCase().indexOf(q) >= 0) &&
        (!m.afford || x.price <= cash));
      const sorters = {
        'power-desc': (a, b) => b.power - a.power,
        'power-asc': (a, b) => a.power - b.power,
        'price-asc': (a, b) => a.price - b.price,
        'price-desc': (a, b) => b.price - a.price,
        value: (a, b) => b.power / b.price - a.power / a.price,
      };
      list.sort(sorters[m.sort] || sorters['power-desc']);
      const pages = Math.max(1, Math.ceil(list.length / PAGE_MARKET));
      if (m.page >= pages) m.page = pages - 1;
      const slice = list.slice(m.page * PAGE_MARKET, m.page * PAGE_MARKET + PAGE_MARKET);

      const rows = slice.map((x) => {
        const full = g.roster.length >= E.CFG.ROSTER_MAX;
        const poor = cash < x.price;
        const why = state.finished ? 'The season is over.' : full ? 'Your guild is full.' : poor ? 'Not enough money.' : '';
        return h('tr', null,
          h('td', null, x.id), h('td', null, x.name), h('td', null, badge(x.rank)), h('td', null, x.cls),
          STAT_LABELS.map(([k]) => h('td', { class: 'num' }, x[k])),
          h('td', { class: 'num' }, x.power),
          h('td', { class: 'num' }, money(x.price)),
          h('td', null, h('button', {
            type: 'button', class: 'sm', disabled: !!why, title: why || 'Recruit ' + x.name,
            on: { click: () => act(() => E.buyHunter(state, pool, me, x.id), 'Recruited ' + x.name + ' for ' + money(x.price)) },
          }, 'Buy')));
      });

      box.replaceChildren(
        h('p', { class: 'hint', role: 'status' }, list.length.toLocaleString('en-IN') + ' hunters available. Your cash: ' + money(cash) + '.'),
        makeTable(['ID', 'Name', 'Rank', 'Class', 'STR', 'AGI', 'INT', 'VIT', 'SENSE', 'Power', 'Price', ''], rows),
        pager(m.page, pages, (p) => { m.page = p; refresh(); }));
    };

    const search = h('input', { type: 'search', placeholder: 'e.g. Kim or H00042', value: m.q });
    search.addEventListener('input', () => { m.q = search.value; m.page = 0; refresh(); });
    const afford = h('input', { type: 'checkbox', id: 'mk-afford' });
    afford.checked = m.afford;
    afford.addEventListener('change', () => { m.afford = afford.checked; m.page = 0; refresh(); });

    refresh();
    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('h2', null, 'Hunter market'),
        h('div', { class: 'filters' },
          h('div', null, h('label', null, 'Search'), search),
          h('div', null, h('label', null, 'Rank'), select(m.rank, [['', 'All ranks']].concat(RANKS.map((r) => [r, r])), (v) => { m.rank = v; m.page = 0; refresh(); })),
          h('div', null, h('label', null, 'Class'), select(m.cls, [['', 'All classes']].concat(CLASSES.map((c) => [c, c])), (v) => { m.cls = v; m.page = 0; refresh(); })),
          h('div', null, h('label', null, 'Sort by'), select(m.sort, [
            ['power-desc', 'Power (high to low)'], ['power-asc', 'Power (low to high)'],
            ['price-asc', 'Price (low to high)'], ['price-desc', 'Price (high to low)'],
            ['value', 'Best power per rupee'],
          ], (v) => { m.sort = v; m.page = 0; refresh(); }))),
        h('label', { class: 'check', for: 'mk-afford' }, afford, ' Only hunters I can afford')),
      h('section', { class: 'gpanel' }, box));
  }

  /* ---------------- dungeons ---------------- */
  function dungeonsView() {
    const g = state.guilds[me];
    const d = ui.dun;
    const party = E.partyHunters(state, pool, g);
    const pp = party.reduce((s, x) => s + E.powerOf(x), 0);

    const counts = {};
    state.dungeons.forEach((x) => { counts[x.rank] = (counts[x.rank] || 0) + 1; });
    const sorters = {
      reward: (a, b) => b.reward - a.reward,
      'danger-asc': (a, b) => a.danger - b.danger,
      'danger-desc': (a, b) => b.danger - a.danger,
      closing: (a, b) => (a.expiresDay - b.expiresDay) || (b.reward - a.reward),
    };
    const list = state.dungeons.filter((x) => !d.rank || x.rank === d.rank).sort(sorters[d.sort] || sorters.reward);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_DUNGEON));
    if (d.page >= pages) d.page = pages - 1;
    const slice = list.slice(d.page * PAGE_DUNGEON, d.page * PAGE_DUNGEON + PAGE_DUNGEON);

    const chip = (value, label) => h('button', {
      type: 'button', class: 'chipbtn' + (d.rank === value ? ' on' : ''),
      on: { click: () => { d.rank = value; d.page = 0; render(); } },
    }, label);

    const sortSel = h('select', null, [['reward', 'Reward (high to low)'], ['danger-asc', 'Danger (low to high)'], ['danger-desc', 'Danger (high to low)'], ['closing', 'Closing soonest']].map(([v, t]) => h('option', { value: v }, t)));
    sortSel.value = d.sort;
    sortSel.addEventListener('change', () => { d.sort = sortSel.value; d.page = 0; render(); });

    const cards = slice.map((x) => {
      const ratio = pp / x.danger;
      const cls = ratio >= 1.15 ? 'good' : ratio >= 0.9 ? 'ok' : 'bad';
      return h('article', { class: 'dcard' },
        h('div', { class: 'dhead' }, badge(x.rank), h('b', null, x.name)),
        h('dl', { class: 'dmeta' },
          h('div', null, h('dt', null, 'Danger'), h('dd', null, x.danger.toLocaleString('en-IN'))),
          h('div', null, h('dt', null, 'Reward'), h('dd', { class: 'gain' }, money(x.reward))),
          h('div', null, h('dt', null, 'If defeated'), h('dd', { class: 'loss' }, '-' + money(x.penalty))),
          h('div', null, h('dt', null, 'Monsters'), h('dd', null, x.monsters.length)),
          h('div', null, h('dt', null, 'Open until'), h('dd', null, 'day ' + x.expiresDay))),
        h('div', { class: 'power ' + cls }, 'Your power x' + ratio.toFixed(2)),
        h('button', { type: 'button', disabled: state.finished, on: { click: () => openDungeon(x.id) } }, 'Play'));
    });

    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('h2', null, 'Open dungeons'),
        h('div', { class: 'kpis' },
          kpi('Open now', state.dungeons.length),
          kpi('Your party power', pp),
          kpi('Entries left today', g.runsLeft + ' / ' + E.CFG.RUNS_PER_DAY)),
        h('p', { class: 'hint' }, 'Every cleared dungeon disappears for all guilds. "Your power" is your party power divided by the dungeon danger: about x1.0 or more is usually a win.'),
        h('div', { class: 'chips' }, chip('', 'All (' + state.dungeons.length + ')'), E.RANK_ORDER.map((r) => chip(r, r + ' (' + (counts[r] || 0) + ')'))),
        h('div', { class: 'filters' }, h('div', null, h('label', null, 'Sort by'), sortSel))),
      h('div', { class: 'cards' }, cards.length ? cards : h('p', { class: 'hint' }, 'No dungeons here. End the day on the Leaderboard tab to open new ones.')),
      pager(d.page, pages, (p) => { d.page = p; render(); }));
  }

  /* ---------------- battle ---------------- */
  function openDungeon(id) {
    const d = state.dungeons.find((x) => x.id === id);
    if (!d) { toast('That dungeon is gone.', 'bad'); render(); return; }
    const g = state.guilds[me];
    const party = E.partyHunters(state, pool, g);
    battle = { dungeon: d, est: E.expectedWin(party, d, 60, Math.random), running: false, done: false, speed: 1 };
    tab = 'battle';
    render();
  }

  function tile(kind, name, sub, maxHp, hp) {
    const fill = h('i');
    const hpText = h('span', { class: 'hpnum' });
    const el = h('div', { class: 'tile ' + kind },
      h('div', { class: 'tn' }, name), h('div', { class: 'ts' }, sub), h('div', { class: 'hp' }, fill), hpText);
    const set = (v) => {
      fill.style.width = Math.max(0, v / maxHp * 100) + '%';
      hpText.textContent = v + ' / ' + maxHp;
      el.classList.toggle('dead', v <= 0);
    };
    set(hp);
    return { el, set };
  }

  function battleView() {
    if (!battle) { tab = 'dungeons'; return dungeonsView(); }
    const g = state.guilds[me];
    const d = battle.dungeon;
    const party = E.partyHunters(state, pool, g);
    const pp = party.reduce((s, x) => s + E.powerOf(x), 0);

    battle.pTiles = party.map((x) => { const mh = E.maxHpOf(x); return tile('ally', x.name, x.cls + ' - ' + E.powerOf(x), mh, mh); });
    battle.mTiles = d.monsters.map((m) => tile('foe' + (m.boss ? ' boss' : ''), m.name, 'ATK ' + m.atk, m.hp, m.hp));
    battle.log = h('div', { class: 'log', role: 'log' });
    battle.resultBox = h('div');

    const pct = Math.round(battle.est * 100);
    const estCls = pct >= 75 ? 'good' : pct >= 40 ? 'ok' : 'bad';
    battle.fightBtn = h('button', { type: 'button', class: 'big', disabled: g.runsLeft <= 0 || !party.length || state.finished, on: { click: startFight } }, 'Fight');
    battle.speedBtns = h('div', { class: 'speed' },
      h('button', { type: 'button', class: 'ghost sm', on: { click: () => setSpeed(1) } }, '1x'),
      h('button', { type: 'button', class: 'ghost sm', on: { click: () => setSpeed(3) } }, '3x'),
      h('button', { type: 'button', class: 'ghost sm', on: { click: skipBattle } }, 'Skip'));

    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('div', { class: 'dhead' }, badge(d.rank), h('h2', { class: 'inline' }, d.name)),
        h('div', { class: 'kpis' },
          kpi('Danger', d.danger.toLocaleString('en-IN')),
          kpi('Your party power', pp),
          kpi('Reward', money(d.reward)),
          kpi('If defeated', '-' + money(d.penalty)),
          h('div', { class: 'kpi' }, h('span', null, 'Estimated win chance'), h('b', { class: estCls }, '~' + pct + '%'))),
        g.runsLeft <= 0 ? h('p', { class: 'error' }, 'No entries left today. End the day on the Leaderboard tab.') : null,
        !party.length ? h('p', { class: 'error' }, 'Your party is empty.') : null,
        h('div', { class: 'actions left' },
          battle.fightBtn, battle.speedBtns,
          h('button', { type: 'button', class: 'ghost', on: { click: () => go('team') } }, 'Edit team'),
          h('button', { type: 'button', class: 'ghost', on: { click: () => go('dungeons') } }, 'Back to dungeons'))),
      battle.resultBox,
      h('div', { class: 'arena' },
        h('section', { class: 'gpanel' }, h('h2', null, 'Your party (' + party.length + ')'), h('div', { class: 'tiles' }, battle.pTiles.map((t) => t.el))),
        h('section', { class: 'gpanel' }, h('h2', null, 'Monsters (' + d.monsters.length + ')'), h('div', { class: 'tiles' }, battle.mTiles.map((t) => t.el)))),
      h('section', { class: 'gpanel' }, h('h2', null, 'Battle log'), battle.log));
  }

  function startFight() {
    if (!battle || battle.running || battle.done) return;
    const g = state.guilds[me];
    const cashBefore = g.cash;
    const runsBefore = g.runsLeft;
    const res = E.runDungeon(state, pool, me, battle.dungeon.id, Math.random, true);
    if (!res.ok) { toast(res.error, 'bad'); return; }
    saveState();
    battle.cashBefore = cashBefore;
    battle.runsBefore = runsBefore;
    battle.res = res;
    battle.idx = 0;
    battle.running = true;
    battle.fightBtn.disabled = true;
    battle.fightBtn.textContent = 'Fighting...';
    refreshTop();
    battle.timer = setInterval(stepBattle, 700);
  }

  function setSpeed(s) {
    if (!battle || !battle.running) return;
    clearInterval(battle.timer);
    battle.timer = setInterval(stepBattle, 700 / s);
  }

  function skipBattle() {
    if (!battle || !battle.running) return;
    clearInterval(battle.timer);
    while (battle.idx < battle.res.frames.length) applyFrame(battle.res.frames[battle.idx++]);
    finishBattle();
  }

  function stepBattle() {
    const f = battle.res.frames[battle.idx];
    if (!f) { finishBattle(); return; }
    applyFrame(f);
    battle.idx++;
    if (battle.idx >= battle.res.frames.length) finishBattle();
  }

  function applyFrame(f) {
    const init = battle.res.init;
    const line = (cls, text) => battle.log.append(h('div', { class: cls }, text));
    line('r', 'Round ' + f.round);
    f.ev.forEach((e) => {
      if (e.t === 'heal') line('heal', init.p[e.i].name + ' heals ' + init.p[e.j].name + ' for ' + e.d);
      else if (e.a === 'p') line(e.c ? 'crit' : '', init.p[e.i].name + ' hits ' + init.m[e.j].name + ' for ' + e.d + (e.c ? ' (critical!)' : ''));
      else line('mon', init.m[e.i].name + ' hits ' + init.p[e.j].name + ' for ' + e.d);
    });
    f.p.forEach((v, i) => battle.pTiles[i].set(v));
    f.m.forEach((v, i) => battle.mTiles[i].set(v));
    battle.log.scrollTop = battle.log.scrollHeight;
  }

  function finishBattle() {
    clearInterval(battle.timer);
    battle.running = false;
    battle.done = true;
    const r = battle.res;
    const total = r.init.p.length;
    const gain = r.leaderGain ? ' Your leader gained +1 ' + r.leaderGain.toUpperCase() + '.' : '';
    battle.resultBox.replaceChildren(r.win
      ? h('div', { class: 'banner win' }, h('b', null, 'Victory! '), '+' + money(r.reward) + ' earned. ' + r.survivors + ' of ' + total + ' hunters still standing.' + gain)
      : h('div', { class: 'banner lose' }, h('b', null, 'Defeat. '), '-' + money(r.penalty) + ' in losses. The dungeon stays open for any guild. Recruit stronger hunters or pick an easier gate.'));
    battle.fightBtn.textContent = r.win ? 'Cleared' : 'Defeated';
    refreshTop();
    battle.resultBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---------------- leaderboard ---------------- */
  function chartSvg() {
    const guilds = Object.keys(state.guilds);
    const W = 640, H = 260, L = 64, R = 12, T = 12, B = 28;
    const maxDays = Math.max.apply(null, guilds.map((u) => state.guilds[u].cashHistory.length)) - 1;
    const maxV = Math.max(E.CFG.START_CASH, Math.max.apply(null, guilds.map((u) => Math.max.apply(null, state.guilds[u].cashHistory)))) * 1.05;
    const x = (i) => L + (maxDays ? i / E.CFG.DAYS : 0) * (W - L - R);
    const y = (v) => T + (1 - v / maxV) * (H - T - B);
    const kids = [];
    for (let k = 0; k <= 4; k++) {
      const v = maxV * k / 4;
      kids.push(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#16224a' }));
      kids.push(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', fill: '#7d8fbf', 'font-size': 10 }, money(v)));
    }
    [0, 5, 10, 15, 20, 25, 30].forEach((d) => {
      kids.push(svg('text', { x: x(d), y: H - 8, 'text-anchor': 'middle', fill: '#7d8fbf', 'font-size': 10 }, 'D' + d));
    });
    guilds.forEach((u) => {
      const pts = state.guilds[u].cashHistory.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
      kids.push(svg('polyline', { points: pts, fill: 'none', stroke: GUILD_COLORS[u], 'stroke-width': u === me ? 3 : 1.6, 'stroke-linejoin': 'round' }));
    });
    return svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Cash of each guild by day' }, kids);
  }

  function boardView() {
    const lb = E.leaderboard(state);
    const rows = lb.map((r, i) => h('tr', { class: r.username === me ? 'me' : null },
      h('td', { class: 'num' }, i + 1),
      h('td', null, h('i', { class: 'dot', style: 'background:' + GUILD_COLORS[r.username] }), r.name + (state.winner === r.username ? ' (winner)' : '')),
      h('td', { class: 'num' }, money(r.cash)),
      h('td', { class: 'num' }, r.clears),
      h('td', { class: 'num' }, r.losses),
      h('td', { class: 'num' }, r.members),
      h('td', { class: 'num' }, money(r.earned)),
      h('td', { class: 'num' }, money(r.spent)),
      h('td', null, r.bot ? 'Bot' : 'Manual')));

    return h('div', { class: 'stack' },
      h('section', { class: 'gpanel' },
        h('h2', null, 'Leaderboard - day ' + state.day + ' of ' + E.CFG.DAYS),
        makeTable(['#', 'Guild', 'Cash', 'Cleared', 'Defeats', 'Hunters', 'Earned', 'Spent', 'Played by'], rows),
        state.finished ? null : h('div', { class: 'actions left' },
          h('button', { type: 'button', on: { click: endDayClick } }, 'End day ' + state.day),
          h('button', { type: 'button', class: 'ghost', on: { click: skipToEnd } }, 'Skip to end of month'),
          h('span', { class: 'hint' }, 'Bot guilds play when the day ends. Unused entries are lost.')),
        h('div', { class: 'actions left' },
          h('button', { type: 'button', class: 'ghost', on: { click: newSeason } }, 'Start a new season'))),
      h('section', { class: 'gpanel' },
        h('h2', null, 'Cash by day'), chartSvg(),
        h('div', { class: 'legend' }, Object.keys(state.guilds).map((u) => h('span', null, h('i', { style: 'background:' + GUILD_COLORS[u] }), state.guilds[u].name)))),
      h('section', { class: 'gpanel' }, h('h2', null, 'World activity'), feedList(20)));
  }

  function endDayClick() {
    const g = state.guilds[me];
    const msg = 'End day ' + state.day + '?\n\nBot guilds play now, entries reset to ' + E.CFG.RUNS_PER_DAY + ', and new dungeons open.' +
      (g.runsLeft > 0 && !g.bot ? '\n\nYou still have ' + g.runsLeft + ' unused entries today. They will be lost.' : '');
    if (!confirm(msg)) return;
    const r = E.endDay(state, pool, Math.random);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    saveState();
    toast(r.finished ? 'The month is over! See the winner above.' : 'Day ' + state.day + ' begins.', 'good');
    render();
  }

  function skipToEnd() {
    if (!confirm('Skip to the end of the month? Bot guilds play every remaining day, and manual guilds will not play.')) return;
    toast('Simulating the rest of the month...');
    setTimeout(() => {
      let guard = 0;
      while (!state.finished && guard++ < 40) E.endDay(state, pool, Math.random);
      saveState();
      render();
    }, 30);
  }

  function newSeason() {
    if (!confirm('Start a new season? Every guild resets to ' + money(E.CFG.START_CASH) + ' and all hunters return to the market.')) return;
    stopBattle();
    state = E.newGame();
    saveState();
    tab = 'guild';
    toast('New season started.', 'good');
    render();
  }

  return { start, stop };
})();
