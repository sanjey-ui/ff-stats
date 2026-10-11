'use strict';

const PAGE_SIZE = 50;
const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S', 'NL'];

const $ = (id) => document.getElementById(id);
const inr = new Intl.NumberFormat('en-IN');

let all = [];
let view = [];
let page = 0;

function fillSelect(select, label, values) {
  select.textContent = '';
  [['', label]].concat(values.map((v) => [v, v])).forEach(([value, text]) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    select.appendChild(o);
  });
}

function renderSummary() {
  const box = $('summary');
  box.textContent = '';
  RANK_ORDER.forEach((r) => {
    const n = all.filter((p) => p.rank === r).length;
    const chip = document.createElement('div');
    chip.className = 'chip';
    const b = document.createElement('b');
    b.textContent = r;
    const s = document.createElement('span');
    s.textContent = inr.format(n);
    chip.append(b, s);
    box.appendChild(chip);
  });
}

function applyFilters() {
  const q = $('f-search').value.trim().toLowerCase();
  const rank = $('f-rank').value;
  const cls = $('f-class').value;
  const sort = $('f-sort').value;

  view = all.filter((p) =>
    (!rank || p.rank === rank) &&
    (!cls || p.cls === cls) &&
    (!q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
  );

  if (sort === 'power-desc') view.sort((a, b) => b.power - a.power);
  else if (sort === 'power-asc') view.sort((a, b) => a.power - b.power);
  else if (sort === 'price-desc') view.sort((a, b) => b.price - a.price);
  else if (sort === 'price-asc') view.sort((a, b) => a.price - b.price);
  else view.sort((a, b) => (a.id < b.id ? -1 : 1));

  page = 0;
  render();
}

function render() {
  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const slice = view.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const tbody = $('rows');
  tbody.textContent = '';

  slice.forEach((p) => {
    const tr = document.createElement('tr');
    [p.id, p.name, p.rank, p.cls, p.str, p.agi, p.int, p.vit, p.sense, p.power, '₹' + inr.format(p.price)]
      .forEach((val, i) => {
        const td = document.createElement('td');
        td.textContent = String(val);
        if (i >= 4) td.className = 'num';
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });

  $('status').textContent = inr.format(view.length) + ' hunters match.';
  $('page-info').textContent = 'Page ' + (page + 1) + ' of ' + pages;
  $('prev').disabled = page === 0;
  $('next').disabled = page >= pages - 1;
}

async function boot() {
  try {
    const res = await fetch('players.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    all = await res.json();
  } catch (e) {
    $('status').textContent =
      'Could not load players.json. If you opened this file directly, serve the folder over http (python3 -m http.server).';
    return;
  }

  fillSelect($('f-rank'), 'All ranks', RANK_ORDER);
  fillSelect($('f-class'), 'All classes', [...new Set(all.map((p) => p.cls))].sort());
  renderSummary();

  ['f-search', 'f-rank', 'f-class', 'f-sort'].forEach((id) => {
    $(id).addEventListener(id === 'f-search' ? 'input' : 'change', applyFilters);
  });
  $('prev').addEventListener('click', () => { if (page > 0) { page--; render(); } });
  $('next').addEventListener('click', () => { page++; render(); });

  applyFilters();
}

boot();
