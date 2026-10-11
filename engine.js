/*
 * Solo Leveling: Hunter Management - game engine.
 *
 * Pure game logic with no DOM access, so it runs in the browser (window.Engine)
 * and in Node (tools/simulate.js) for balance testing.
 *
 * Rules
 *  - Six guilds (Sanjey, ChatGPT, Claude, Gemini, Perplexity, Grok), each led by
 *    its hunter and starting with Rs 50 crore.
 *  - A guild holds up to 50 hunters. A party of up to 15 goes into a dungeon.
 *  - Hunters are bought from one shared pool; a hunter belongs to one guild.
 *  - 30 game days. Each day every guild gets 5 dungeon entries, and 30 new
 *    dungeons open. A cleared dungeon is gone for everyone.
 *  - The guild with the most money after day 30 wins.
 *  - Guilds on "bot" mode are played by simple strategies when the day ends.
 *
 * All numbers are game-balance values, not canon from the story.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    START_CASH: 500000000, // Rs 50 crore
    ROSTER_MAX: 50,
    PARTY_MAX: 15,
    DAYS: 30,
    RUNS_PER_DAY: 5,
    SPAWN_PER_DAY: 30,
    EXPIRE_DAYS: 3,
    SELL_RATE: 0.6,
    MAX_ROUNDS: 40,
    PENALTY_RATE: 0.15,
    FEED_MAX: 80,
    HP_FACTOR: 2.0, // total monster HP = danger * HP_FACTOR
    ATK_FACTOR: 0.3, // total monster damage per round = danger * ATK_FACTOR
    REWARD_MULT: 3, // scales every dungeon payout, so investing in hunters pays off
    BOT_RECRUIT_UNTIL: 24, // bots stop recruiting after this day (it would no longer pay back)
  };

  const STATS = ['str', 'agi', 'int', 'vit', 'sense'];

  const LEADERS = [
    { username: 'sanjey',     display: 'Sanjey',     cls: 'Necromancer', persona: null },
    { username: 'chatgpt',    display: 'ChatGPT',    cls: 'Healer',      persona: { minWin: 0.75, spendFrac: 0.6 } },
    { username: 'claude',     display: 'Claude',     cls: 'Mage',        persona: { minWin: 0.85, spendFrac: 0.5 } },
    { username: 'gemini',     display: 'Gemini',     cls: 'Assassin',    persona: { minWin: 0.7,  spendFrac: 0.7 } },
    { username: 'perplexity', display: 'Perplexity', cls: 'Ranger',      persona: { minWin: 0.8,  spendFrac: 0.55 } },
    { username: 'grok',       display: 'Grok',       cls: 'Fighter',     persona: { minWin: 0.55, spendFrac: 0.85 } },
  ];

  const RANK_INFO = {
    E: { n: 3, danger: [150, 400],     reward: [40000, 120000],       weight: 38,
         places: ['Goblin Burrow', 'Slime Cellar', 'Rat Warren', 'Mushroom Cave'],
         mobs: ['Goblin', 'Slime', 'Giant Rat'] },
    D: { n: 4, danger: [500, 1100],    reward: [150000, 400000],      weight: 28,
         places: ['Orc Camp', 'Lizardman Marsh', 'Spider Nest', 'Bone Quarry'],
         mobs: ['Orc', 'Lizardman', 'Cave Spider'] },
    C: { n: 5, danger: [1500, 3500],   reward: [500000, 1500000],     weight: 17,
         places: ['Ice Elf Hollow', 'Undead Crypt', 'Ogre Fortress', 'Cursed Mine'],
         mobs: ['Ice Elf', 'Skeleton Knight', 'Ogre'] },
    B: { n: 6, danger: [4000, 10000],  reward: [2000000, 6000000],    weight: 10,
         places: ['Demon Outpost', 'Gargoyle Spire', 'Troll Bridge', 'Red Canyon'],
         mobs: ['Demon Knight', 'Gargoyle', 'Troll'] },
    A: { n: 7, danger: [10000, 25000], reward: [10000000, 40000000],  weight: 5,
         places: ["Dragon's Lair", 'Frost Citadel', 'Storm Peak', 'Blood Temple'],
         mobs: ['Wyvern', 'Frost Giant', 'Dark Mage'] },
    S: { n: 8, danger: [30000, 70000], reward: [100000000, 500000000], weight: 2,
         places: ['Abyss of Calamity', "Monarch's Tomb", 'Void Rift', 'World-Eater Pit'],
         mobs: ['Dragon', 'Behemoth', 'Void Lord'] },
  };
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];

  /* ---------------- helpers ---------------- */
  const lerp = (a, b, t) => a + (b - a) * t;

  function roundSig(x, sig) {
    if (!x) return 0;
    const d = sig - Math.floor(Math.log10(Math.abs(x))) - 1;
    const f = Math.pow(10, d);
    return Math.round(x * f) / f;
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatINR(n) {
    n = Math.round(n);
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    const trim = (x, d) => x.toFixed(d).replace(/\.?0+$/, '');
    if (a >= 1e7) return sign + '₹' + trim(a / 1e7, 2) + ' cr';
    if (a >= 1e5) return sign + '₹' + trim(a / 1e5, 2) + ' lakh';
    return sign + '₹' + a.toLocaleString('en-IN');
  }

  const powerOf = (h) => h.str + h.agi + h.int + h.vit + h.sense;

  function buildPool(list) {
    const byId = {};
    list.forEach((h) => { byId[h.id] = h; });
    return { list, byId };
  }

  function getHunter(state, pool, id) {
    if (id.charAt(0) === 'L' && id.charAt(1) === ':') {
      const g = state.guilds[id.slice(2)];
      return g ? g.leader : null;
    }
    return pool.byId[id] || null;
  }

  function partyHunters(state, pool, g) {
    return g.party.map((id) => getHunter(state, pool, id)).filter(Boolean);
  }

  function rosterHunters(state, pool, g) {
    return g.roster.map((id) => getHunter(state, pool, id)).filter(Boolean);
  }

  function log(state, text) {
    state.feed.unshift({ day: state.day, text });
    if (state.feed.length > CFG.FEED_MAX) state.feed.length = CFG.FEED_MAX;
  }

  const fail = (error) => ({ ok: false, error });

  /* ---------------- dungeons ---------------- */
  function makeMonsters(rank, danger, rng) {
    const info = RANK_INFO[rank];
    const n = info.n;
    const hpW = [];
    const atkW = [];
    for (let i = 0; i < n; i++) {
      const boss = i === n - 1;
      hpW.push(boss ? 2.5 : 1);
      atkW.push(boss ? 1.5 : 1);
    }
    const sh = hpW.reduce((a, b) => a + b, 0);
    const sa = atkW.reduce((a, b) => a + b, 0);
    return hpW.map((w, i) => {
      const boss = i === n - 1;
      const jitter = 0.9 + rng() * 0.2;
      const mob = info.mobs[Math.floor(rng() * info.mobs.length)];
      return {
        name: (boss ? 'Boss ' : '') + mob,
        hp: Math.max(10, Math.round(danger * CFG.HP_FACTOR * w / sh * jitter)),
        atk: Math.max(1, Math.round(danger * CFG.ATK_FACTOR * atkW[i] / sa * jitter)),
        boss,
      };
    });
  }

  function makeDungeon(id, rank, day, rng) {
    const info = RANK_INFO[rank];
    const u = rng();
    const danger = Math.round(lerp(info.danger[0], info.danger[1], u));
    const reward = roundSig(lerp(info.reward[0], info.reward[1], u) * (0.9 + rng() * 0.2) * CFG.REWARD_MULT, 2);
    return {
      id,
      rank,
      name: info.places[Math.floor(rng() * info.places.length)],
      danger,
      reward,
      penalty: Math.round(reward * CFG.PENALTY_RATE),
      monsters: makeMonsters(rank, danger, rng),
      openedDay: day,
      expiresDay: day + CFG.EXPIRE_DAYS - 1,
    };
  }

  function spawnDungeons(state, rng) {
    const total = RANK_ORDER.reduce((s, r) => s + RANK_INFO[r].weight, 0);
    for (let i = 0; i < CFG.SPAWN_PER_DAY; i++) {
      let x = rng() * total;
      let rank = 'E';
      for (const r of RANK_ORDER) {
        if (x < RANK_INFO[r].weight) { rank = r; break; }
        x -= RANK_INFO[r].weight;
      }
      state.dungeons.push(makeDungeon(state.nextDungeonId++, rank, state.day, rng));
    }
  }

  /* ---------------- battle ---------------- */
  function maxHpOf(h) {
    const base = 40 + h.vit * 6;
    return Math.round(h.cls === 'Tanker' ? base * 1.5 : base);
  }

  function attackOf(h, rng) {
    let dmg;
    let crit = false;
    switch (h.cls) {
      case 'Fighter': dmg = h.str + h.agi * 0.2; break;
      case 'Tanker': dmg = h.str * 0.7; break;
      case 'Assassin':
        dmg = h.agi;
        if (rng() < Math.min(0.5, h.sense / (h.sense + h.agi + 1))) { dmg *= 2; crit = true; }
        break;
      case 'Mage': dmg = h.int * 1.2; break;
      case 'Ranger': dmg = h.agi * 0.5 + h.sense * 0.6; break;
      case 'Healer': dmg = h.int * 0.3; break;
      case 'Necromancer': dmg = (h.str + h.int) * 0.6; break;
      default: dmg = h.str;
    }
    dmg *= 0.85 + rng() * 0.3;
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  function simulateBattle(party, dungeon, rng, record) {
    const P = party.map((h) => {
      const mh = maxHpOf(h);
      return { id: h.id, name: h.name, cls: h.cls, str: h.str, agi: h.agi, int: h.int, vit: h.vit, sense: h.sense, maxHp: mh, hp: mh };
    });
    const M = dungeon.monsters.map((m) => ({ name: m.name, atk: m.atk, maxHp: m.hp, hp: m.hp, boss: !!m.boss }));
    const frames = record ? [] : null;
    const init = record
      ? { p: P.map((p) => ({ id: p.id, name: p.name, cls: p.cls, maxHp: p.maxHp })),
          m: M.map((m) => ({ name: m.name, maxHp: m.maxHp, boss: m.boss })) }
      : null;
    const anyAlive = (arr) => { for (let i = 0; i < arr.length; i++) if (arr[i].hp > 0) return true; return false; };
    let win = false;
    let round = 0;

    for (round = 1; round <= CFG.MAX_ROUNDS; round++) {
      const ev = record ? [] : null;

      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.hp <= 0) continue;
        const targets = M.filter((m) => m.hp > 0);
        if (!targets.length) break;

        if (p.cls === 'Healer') {
          let low = -1;
          let ratio = 1;
          for (let k = 0; k < P.length; k++) {
            if (P[k].hp > 0 && P[k].hp < P[k].maxHp) {
              const r = P[k].hp / P[k].maxHp;
              if (r < ratio) { ratio = r; low = k; }
            }
          }
          if (low >= 0) {
            const heal = Math.max(1, Math.round(p.int * 0.9));
            const before = P[low].hp;
            P[low].hp = Math.min(P[low].maxHp, before + heal);
            if (ev) ev.push({ t: 'heal', i, j: low, d: P[low].hp - before });
            continue;
          }
        }

        const target = targets[Math.floor(rng() * targets.length)];
        const a = attackOf(p, rng);
        target.hp = Math.max(0, target.hp - a.dmg);
        if (ev) ev.push({ t: 'hit', a: 'p', i, j: M.indexOf(target), d: a.dmg, c: a.crit });
      }

      if (!anyAlive(M)) {
        win = true;
        if (frames) frames.push({ round, ev, p: P.map((x) => x.hp), m: M.map((x) => x.hp) });
        break;
      }

      for (let j = 0; j < M.length; j++) {
        const m = M[j];
        if (m.hp <= 0) continue;
        const live = P.filter((p) => p.hp > 0);
        if (!live.length) break;
        let total = 0;
        const w = live.map((p) => { const x = p.cls === 'Tanker' ? 3 : 1; total += x; return x; });
        let r = rng() * total;
        let k = 0;
        while (k < w.length - 1 && r >= w[k]) { r -= w[k]; k++; }
        const t = live[k];
        const dmg = Math.max(1, Math.round(m.atk * (0.85 + rng() * 0.3)));
        t.hp = Math.max(0, t.hp - dmg);
        if (ev) ev.push({ t: 'hit', a: 'm', i: j, j: P.indexOf(t), d: dmg });
      }

      if (frames) frames.push({ round, ev, p: P.map((x) => x.hp), m: M.map((x) => x.hp) });
      if (!anyAlive(P)) break;
    }

    return { win, rounds: Math.min(round, CFG.MAX_ROUNDS), survivors: P.filter((p) => p.hp > 0).length, frames, init };
  }

  function expectedWin(party, dungeon, trials, rng) {
    let wins = 0;
    for (let i = 0; i < trials; i++) if (simulateBattle(party, dungeon, rng, false).win) wins++;
    return wins / trials;
  }

  /* ---------------- game state ---------------- */
  function newGame(rng) {
    rng = rng || Math.random;
    const guilds = {};
    LEADERS.forEach((L) => {
      const leader = { id: 'L:' + L.username, name: L.display, cls: L.cls, str: 10, agi: 10, int: 10, vit: 10, sense: 10, isLeader: true, price: 0 };
      guilds[L.username] = {
        username: L.username,
        name: L.display + ' Guild',
        leader,
        roster: [leader.id],
        party: [leader.id],
        cash: CFG.START_CASH,
        bot: !!L.persona,
        runsLeft: CFG.RUNS_PER_DAY,
        clears: 0,
        losses: 0,
        earned: 0,
        spent: 0,
        cashHistory: [CFG.START_CASH],
      };
    });
    const state = { version: 1, day: 1, finished: false, winner: null, guilds, owned: {}, dungeons: [], nextDungeonId: 1, feed: [] };
    spawnDungeons(state, rng);
    log(state, 'Season begins. Every guild starts with ' + formatINR(CFG.START_CASH) + '.');
    return state;
  }

  function leaderboard(state) {
    return Object.values(state.guilds)
      .map((g) => ({
        username: g.username, name: g.name, cash: g.cash, clears: g.clears, losses: g.losses,
        earned: g.earned, spent: g.spent, members: g.roster.length, bot: g.bot,
      }))
      .sort((a, b) => b.cash - a.cash);
  }

  /* ---------------- actions ---------------- */
  function buyHunter(state, pool, username, hunterId) {
    if (state.finished) return fail('The season is over.');
    const g = state.guilds[username];
    const h = pool.byId[hunterId];
    if (!g) return fail('Unknown guild.');
    if (!h) return fail('Hunter not found.');
    if (state.owned[h.id]) return fail('That hunter already belongs to a guild.');
    if (g.roster.length >= CFG.ROSTER_MAX) return fail('Your guild is full (' + CFG.ROSTER_MAX + ' members).');
    if (g.cash < h.price) return fail('Not enough money.');
    g.cash -= h.price;
    g.spent += h.price;
    g.roster.push(h.id);
    state.owned[h.id] = username;
    if (g.party.length < CFG.PARTY_MAX) g.party.push(h.id);
    log(state, g.name + ' recruited ' + h.name + ' (' + h.rank + '-rank ' + h.cls + ') for ' + formatINR(h.price) + '.');
    return { ok: true, hunter: h };
  }

  function sellHunter(state, pool, username, hunterId) {
    if (state.finished) return fail('The season is over.');
    const g = state.guilds[username];
    if (!g) return fail('Unknown guild.');
    if (hunterId.charAt(0) === 'L') return fail('The guild leader cannot be released.');
    if (g.roster.indexOf(hunterId) < 0) return fail('That hunter is not in your guild.');
    const h = pool.byId[hunterId];
    const refund = Math.round(h.price * CFG.SELL_RATE);
    g.cash += refund;
    g.roster = g.roster.filter((id) => id !== hunterId);
    g.party = g.party.filter((id) => id !== hunterId);
    delete state.owned[hunterId];
    log(state, g.name + ' released ' + h.name + ' and got back ' + formatINR(refund) + '.');
    return { ok: true, refund };
  }

  function toggleParty(state, username, hunterId) {
    if (state.finished) return fail('The season is over.');
    const g = state.guilds[username];
    if (!g) return fail('Unknown guild.');
    if (g.roster.indexOf(hunterId) < 0) return fail('That hunter is not in your guild.');
    const at = g.party.indexOf(hunterId);
    if (at >= 0) {
      if (g.party.length === 1) return fail('Your party needs at least one hunter.');
      g.party.splice(at, 1);
    } else {
      if (g.party.length >= CFG.PARTY_MAX) return fail('A party holds at most ' + CFG.PARTY_MAX + ' hunters.');
      g.party.push(hunterId);
    }
    return { ok: true };
  }

  function autoParty(state, pool, username) {
    const g = state.guilds[username];
    const sorted = rosterHunters(state, pool, g).sort((a, b) => powerOf(b) - powerOf(a));
    g.party = sorted.slice(0, CFG.PARTY_MAX).map((h) => h.id);
    return { ok: true };
  }

  function runDungeon(state, pool, username, dungeonId, rng, record) {
    rng = rng || Math.random;
    if (state.finished) return fail('The season is over.');
    const g = state.guilds[username];
    if (!g) return fail('Unknown guild.');
    if (g.runsLeft <= 0) return fail('No dungeon entries left today.');
    const d = state.dungeons.find((x) => x.id === dungeonId);
    if (!d) return fail('That dungeon has already been cleared or has closed.');
    const party = partyHunters(state, pool, g);
    if (!party.length) return fail('Your party is empty.');

    const res = simulateBattle(party, d, rng, record);
    g.runsLeft--;
    let reward = 0;
    let penalty = 0;
    let leaderGain = null;
    if (res.win) {
      reward = d.reward;
      g.cash += reward;
      g.earned += reward;
      g.clears++;
      state.dungeons = state.dungeons.filter((x) => x.id !== d.id);
      leaderGain = STATS[Math.floor(rng() * STATS.length)];
      g.leader[leaderGain]++;
      log(state, g.name + ' cleared the ' + d.rank + '-rank ' + d.name + ' (+' + formatINR(reward) + ').');
    } else {
      penalty = Math.min(g.cash, d.penalty);
      g.cash -= penalty;
      g.losses++;
      log(state, g.name + ' was defeated at the ' + d.rank + '-rank ' + d.name + ' (-' + formatINR(penalty) + ').');
    }
    return Object.assign({ ok: true, dungeon: d, reward, penalty, leaderGain }, res);
  }

  /* ---------------- bots ---------------- */
  function sellWeakestBench(state, pool, g) {
    const benched = g.roster
      .filter((id) => g.party.indexOf(id) < 0 && id.charAt(0) !== 'L')
      .map((id) => pool.byId[id])
      .sort((a, b) => a.power - b.power);
    if (!benched.length) return false;
    return sellHunter(state, pool, g.username, benched[0].id).ok;
  }

  function botPlay(state, pool, username, rng) {
    const g = state.guilds[username];
    const L = LEADERS.find((x) => x.username === username);
    const P = (L && L.persona) || { minWin: 0.8, spendFrac: 0.6 };

    // 1. recruit: spend part of the cash on the best strength-for-price hunters
    let budget = state.day <= CFG.BOT_RECRUIT_UNTIL ? g.cash * P.spendFrac : 0;
    for (let step = 0; step < 40; step++) {
      autoParty(state, pool, username);
      const party = partyHunters(state, pool, g);
      const weakest = party.length >= CFG.PARTY_MAX ? powerOf(party[party.length - 1]) : 0;
      let best = null;
      let bestScore = 0;
      for (let i = 0; i < pool.list.length; i++) {
        const h = pool.list[i];
        if (h.price > budget || h.price > g.cash || state.owned[h.id]) continue;
        const gain = h.power - weakest;
        if (gain <= 0) continue;
        const score = gain / Math.pow(h.price, 0.7);
        if (score > bestScore) { bestScore = score; best = h; }
      }
      if (!best) break;
      if (g.roster.length >= CFG.ROSTER_MAX && !sellWeakestBench(state, pool, g)) break;
      const r = buyHunter(state, pool, username, best.id);
      if (!r.ok) break;
      budget -= best.price;
    }
    autoParty(state, pool, username);

    // 2. dungeons: take the best expected-value dungeon it is likely to win
    while (g.runsLeft > 0) {
      const party = partyHunters(state, pool, g);
      const power = party.reduce((s, h) => s + powerOf(h), 0);
      const cands = state.dungeons
        .filter((d) => d.danger <= power * 1.6)
        .sort((a, b) => b.reward - a.reward)
        .slice(0, 10);
      let pick = null;
      let bestEv = 0;
      for (const d of cands) {
        const w = expectedWin(party, d, 12, rng);
        if (w < P.minWin) continue;
        const ev = w * d.reward - (1 - w) * d.penalty;
        if (ev > bestEv) { bestEv = ev; pick = d; }
      }
      if (!pick) break;
      if (!runDungeon(state, pool, username, pick.id, rng, false).ok) break;
    }
  }

  function endDay(state, pool, rng) {
    rng = rng || Math.random;
    if (state.finished) return fail('The season is over.');
    const order = shuffle(Object.keys(state.guilds).filter((u) => state.guilds[u].bot), rng);
    order.forEach((u) => botPlay(state, pool, u, rng));
    Object.values(state.guilds).forEach((g) => g.cashHistory.push(g.cash));

    if (state.day >= CFG.DAYS) {
      state.finished = true;
      const top = leaderboard(state)[0];
      state.winner = top.username;
      log(state, 'The month is over! ' + top.name + ' wins with ' + formatINR(top.cash) + '.');
      return { ok: true, finished: true };
    }
    state.day++;
    Object.values(state.guilds).forEach((g) => { g.runsLeft = CFG.RUNS_PER_DAY; });
    state.dungeons = state.dungeons.filter((d) => d.expiresDay >= state.day);
    spawnDungeons(state, rng);
    log(state, 'Day ' + state.day + ' begins. New dungeons have opened.');
    return { ok: true, finished: false };
  }

  return {
    CFG, LEADERS, RANK_INFO, RANK_ORDER, STATS,
    formatINR, powerOf, buildPool, getHunter, partyHunters, rosterHunters,
    newGame, leaderboard, buyHunter, sellHunter, toggleParty, autoParty,
    runDungeon, endDay, simulateBattle, expectedWin, makeDungeon, maxHpOf,
  };
});
