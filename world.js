'use strict';

/*
 * Hunter World - Japan. Reads data/japan.json (made by tools/build_japan.py).
 * Phase 1: read-only world. Money = cash - debt, in INR.
 */
(function () {
  const TOP = 100;
  const $ = (id) => document.getElementById(id);
  const inr = (n) => {
    n = Math.round(n);
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    const trim = (x, d) => x.toFixed(d).replace(/\.?0+$/, '');
    if (a >= 1e7) return sign + '₹' + trim(a / 1e7, 2) + ' cr';
    if (a >= 1e5) return sign + '₹' + trim(a / 1e5, 2) + ' lakh';
    return sign + '₹' + a.toLocaleString('en-IN');
  };
  const num = (n) => Math.round(n).toLocaleString('en-IN');

  // element builder (no innerHTML with data)
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn));
      else node.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => { if (c != null && c !== false) node.append(c); });
    return node;
  }

  let world = null;
  let selected = null;

  /* ---------- money (cash minus debt) ---------- */
  const guildMoney = (g) => g.cash - g.loan;
  const hunterMoney = (m) => m.cash;
  const assocMoney = (a) => a.cash - a.debt;
  const bankMoney = (b) => b.cash;

  function allEntries() {
    const out = [];
    world.guilds.forEach((g) => {
      out.push({ kind: 'Guild', name: g.name, money: guildMoney(g), id: g.id });
      g.members.forEach((m) => out.push({ kind: m.fallen ? 'Fallen' : 'Hunter', name: m.name, money: hunterMoney(m), id: m.id, guild: g.name }));
    });
    out.push({ kind: 'Association', name: world.association.name, money: assocMoney(world.association), id: world.association.id });
    out.push({ kind: 'Bank', name: world.bank.name, money: bankMoney(world.bank), id: world.bank.id });
    return out;
  }

  function rankTable(list, limit) {
    const sorted = list.slice().sort((a, b) => b.money - a.money);
    return sorted.map((x, i) => ({ ...x, rank: i < limit ? i + 1 : null }));
  }

  /* ---------- sections ---------- */
  function renderHeader() {
    $('pop').textContent = 'Population about ' + num(world.country.population) + '. Open hunters: ' + num(world.open_hunters.total) + ' (1% of population).';
  }

  function renderInstitutions() {
    const a = world.association;
    const b = world.bank;
    const aMoney = assocMoney(a);
    const cards = [
      el('article', { class: 'inst', 'data-seal': '協' },
        el('h3', null, a.name),
        el('p', { class: 'hint' }, a.head),
        el('dl', null,
          el('dt', null, 'Cash'), el('dd', null, inr(a.cash)),
          el('dt', null, 'Debt to bank'), el('dd', { class: 'neg' }, inr(a.debt)),
          el('dt', null, 'Money (cash - debt)'), el('dd', { class: aMoney < 0 ? 'neg' : '' }, inr(aMoney)),
          el('dt', null, 'Debt limit before takeover'), el('dd', null, inr(a.debt_limit)))),
      el('article', { class: 'inst', 'data-seal': '銀' },
        el('h3', null, b.name),
        el('p', { class: 'hint' }, b.manager),
        el('dl', null,
          el('dt', null, 'Vault'), el('dd', null, inr(b.vault)),
          el('dt', null, 'Cash'), el('dd', null, inr(b.cash)))),
    ];
    $('inst-cards').replaceChildren(...cards);
  }

  function renderRanks() {
    const r = world.open_hunters.by_rank;
    const max = Math.max(...Object.values(r));
    const order = ['E', 'D', 'C', 'B', 'A', 'S', 'NL'];
    $('ranks').replaceChildren(...order.map((k) => el('div', { class: 'rank-row' },
      el('b', { class: 'r' }, k === 'NL' ? 'NL' : k),
      el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(1, r[k] / max * 100) + '%' })),
      el('span', null, num(r[k])))));
    $('open-note').textContent = 'Open hunters are not stored one by one. Their counts by rank are shown here.';
  }

  function renderPlaques() {
    const list = world.guilds.map((g) => el('button', {
      type: 'button', class: 'ema', 'aria-pressed': selected === g.id ? 'true' : 'false',
      on: { click: () => { selected = g.id; renderPlaques(); renderRoster(); } },
    },
      el('div', { class: 'n' }, g.anime),
      el('div', { class: 'm' }, 'Master: ' + g.leader),
      el('div', { class: 'm' }, num(g.size) + ' members')));
    $('plaques').replaceChildren(...list);
  }

  function renderRoster() {
    const box = $('roster');
    const g = world.guilds.find((x) => x.id === selected);
    if (!g) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;

    const search = el('input', { type: 'search', placeholder: 'Search name', 'aria-label': 'Search roster' });
    const roleSel = el('select', { 'aria-label': 'Filter by role' },
      el('option', { value: '' }, 'All roles'),
      el('option', { value: 'villain' }, 'Villains'),
      el('option', { value: 'fallen' }, 'Fallen'));
    const body = el('tbody');
    const drawRows = () => {
      const q = search.value.trim().toLowerCase();
      const role = roleSel.value;
      const rows = g.members
        .filter((m) => (!q || m.name.toLowerCase().includes(q)))
        .filter((m) => !role || (role === 'villain' ? m.villain : m.fallen))
        .map((m) => el('tr', { class: (m.fallen ? 'tag-fallen' : '') + ' ' + (m.villain ? 'tag-villain' : '') },
          el('td', null, m.name),
          el('td', null, m.role.replace(/_/g, ' ')),
          el('td', null, m.cls),
          el('td', { class: 'num' }, num(m.power)),
          el('td', { class: 'num' }, inr(m.cash)),
          el('td', null, m.fallen ? 'Dead' : 'Alive')));
      body.replaceChildren(...rows);
    };
    search.addEventListener('input', drawRows);
    roleSel.addEventListener('change', drawRows);

    const money = guildMoney(g);
    box.replaceChildren(
      el('h2', null, g.name, el('span', { class: 'count' }, 'Master ' + g.leader)),
      el('div', { class: 'roster-tools' }, search, roleSel,
        el('span', { class: 'hint' }, 'Guild money ' + inr(money) + ' (cash ' + inr(g.cash) + ', loan ' + inr(g.loan) + ')'),
        el('button', { type: 'button', class: 'btn', on: { click: () => { selected = null; renderPlaques(); renderRoster(); } } }, 'Close')),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, ...['Name', 'Role', 'Class', 'Power', 'Cash', 'Status'].map((h) => el('th', null, h)))),
          body)));
    drawRows();
  }

  // World board: every character, institution and guild in the world.
  // Country board: only Japan exists so far, so it is the same set of entries
  // for now; it will split by country once more countries are added.
  function renderBoard(scope) {
    const entries = allEntries();
    const ranked = rankTable(entries, TOP).filter((e) => e.rank != null);
    const rows = ranked.map((e) => el('tr', null,
      el('td', { class: 'num' }, el('span', { class: 'rk ' + (e.rank <= 3 ? 'top' : '') }, e.rank)),
      el('td', null, e.name),
      el('td', null, e.kind),
      el('td', null, e.guild || ''),
      el('td', { class: 'num' }, inr(e.money))));
    const label = scope === 'country' ? 'Japan' : 'World';
    $('board').replaceChildren(
      el('table', null,
        el('thead', null, el('tr', null, ...['Rank', 'Name', 'Type', 'Guild', 'Money'].map((h) => el('th', null, h)))),
        el('tbody', null, rows)),
      el('p', { class: 'hint', style: 'padding:8px 10px' },
        label + ' top ' + TOP + ' of ' + num(entries.length) + ' entries. Everyone else is unranked.'));
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    document.querySelectorAll('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.board === name)));
    renderBoard(name);
  }

  /* ---------- boot ---------- */
  async function boot() {
    try {
      const res = await fetch('data/japan.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      world = await res.json();
    } catch (e) {
      $('pop').textContent = 'Could not load data/japan.json. Serve the folder over http.';
      return;
    }
    renderHeader();
    renderInstitutions();
    renderRanks();
    renderPlaques();
    renderRoster();
    document.querySelectorAll('.tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.board)));
    setTab('world');
  }

  boot();
})();
