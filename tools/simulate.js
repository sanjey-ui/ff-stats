#!/usr/bin/env node
/*
 * Balance checks for the game engine.
 *   node tools/simulate.js            -> win-rate calibration + one full month
 *   node tools/simulate.js months 20  -> repeat the full month 20 times and tally winners
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'players.json'), 'utf8'));
const pool = E.buildPool(list);
const byRank = {};
list.forEach((h) => { (byRank[h.rank] = byRank[h.rank] || []).push(h); });

function pick(arr, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(Math.random() * arr.length)]);
  return out;
}

/* Win rate when party power is r x the dungeon's danger. */
function calibrate() {
  console.log('Win rate by (party power / dungeon danger). Party built from hunters of the same rank.');
  console.log('rank   0.5x    0.7x    1.0x    1.3x    1.6x');
  for (const rank of E.RANK_ORDER) {
    const info = E.RANK_INFO[rank];
    const mid = Math.round((info.danger[0] + info.danger[1]) / 2);
    const row = [];
    for (const r of [0.5, 0.7, 1.0, 1.3, 1.6]) {
      let wins = 0;
      const trials = 150;
      for (let t = 0; t < trials; t++) {
        const d = E.makeDungeon(1, rank, 1, Math.random);
        const target = d.danger * r;
        const party = [];
        let sum = 0;
        const pool_ = byRank[rank] || list;
        while (sum < target && party.length < 15) {
          const h = pool_[Math.floor(Math.random() * pool_.length)];
          party.push(h);
          sum += h.power;
        }
        if (E.simulateBattle(party, d, Math.random, false).win) wins++;
      }
      row.push((wins / trials * 100).toFixed(0).padStart(4) + '% ');
    }
    console.log(rank.padEnd(4), ' ', row.join('  '), '  (mid danger ' + mid + ')');
  }
}

function playMonth() {
  const state = E.newGame(Math.random);
  state.guilds.sanjey.bot = true; // let a default-strategy bot play Sanjey's guild too
  const t0 = Date.now();
  let guard = 0;
  while (!state.finished && guard++ < 40) E.endDay(state, pool, Math.random);
  const ms = Date.now() - t0;
  return { state, ms };
}

function report(state, ms) {
  console.log('\nFull month simulated in ' + ms + ' ms (all six guilds on bot mode).');
  console.log('guild          cash           clears losses members  earned          spent');
  E.leaderboard(state).forEach((g) => {
    console.log(
      g.name.padEnd(18) + E.formatINR(g.cash).padStart(14) + String(g.clears).padStart(8) +
      String(g.losses).padStart(7) + String(g.members).padStart(8) + E.formatINR(g.earned).padStart(14) +
      E.formatINR(g.spent).padStart(14)
    );
  });
  console.log('winner:', state.winner);
}

const args = process.argv.slice(2);
if (args[0] === 'months') {
  const n = parseInt(args[1] || '10', 10);
  const wins = {};
  const total = {};
  for (let i = 0; i < n; i++) {
    const { state } = playMonth();
    wins[state.winner] = (wins[state.winner] || 0) + 1;
    E.leaderboard(state).forEach((g) => { total[g.username] = (total[g.username] || 0) + g.cash; });
  }
  console.log('winners over ' + n + ' months:', wins);
  Object.keys(total).forEach((u) => console.log(u.padEnd(11), 'avg final cash', E.formatINR(total[u] / n)));
} else {
  calibrate();
  const { state, ms } = playMonth();
  report(state, ms);
}
