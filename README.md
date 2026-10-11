# Solo Leveling: Hunter Management

A Solo Leveling-style management game built with plain HTML, CSS and JavaScript.
Six guilds compete for the most money in a 30-day month.

## The game

- **Six guilds:** Sanjey, ChatGPT, Claude, Gemini, Perplexity and Grok. Each leader runs a guild and starts with **Rs 50 crore**.
- **Teams:** a guild holds up to **50 hunters**. A party of up to **15** fights in dungeons.
- **Market:** buy hunters from the shared pool of 10,000 (each hunter belongs to one guild). Release a hunter to get 60% back.
- **Dungeons:** 30 new dungeons open every day (E to S rank) and stay open for 3 days. Press **Play**,
  check the estimated win chance, then **Fight** and watch the battle. A cleared dungeon is gone for every guild.
  A defeat costs 15% of the reward. Each guild gets 5 entries per day.
- **Leader growth:** the guild leader gains +1 to a random stat after every dungeon the guild clears.
- **Month end:** press **End day** on the Leaderboard tab. After day 30, the guild with the **most money wins**.
- **Bot mode:** the five AI guilds start with bot mode on, so a bot plays them when the day ends
  (simple strategies: recruit, then take dungeons it expects to win). Turn it off in a guild's Guild tab to play it yourself.
  These bots are game strategies, not the real AI assistants.
- **Logging in as another guild:** log out and pick a different hunter. All six guilds share one saved game in this browser.

Battle rules, rewards and prices are game-balance numbers, not canon. To check the balance:

```
node tools/simulate.js            # win-rate table + one full month with all guilds on bots
node tools/simulate.js months 20  # tally winners over 20 simulated months
```

## Hunter profiles

| Username     | Display name | Type      |
|--------------|--------------|-----------|
| `sanjey`     | Sanjey       | Player    |
| `chatgpt`    | ChatGPT      | AI Hunter |
| `claude`     | Claude       | AI Hunter |
| `gemini`     | Gemini       | AI Hunter |
| `perplexity` | Perplexity   | AI Hunter |
| `grok`       | Grok         | AI Hunter |

Each profile starts **unclaimed**. The first login on a profile sets its password;
after that, the same password is required.

## Hunter Market (10,000 hunters)

`players.json` and `players.csv` hold 10,000 generated hunters, browsable at `hunters.html`.

| Rank | Count | Power (sum of 5 stats) | Recruit price (INR) |
|------|------:|------------------------|---------------------|
| E  | 6,000 | 50 - 99 | 5,000 - 25,000 |
| D  | 2,500 | 100 - 299 | 30,000 - 1.5 lakh |
| C  | 1,000 | 300 - 699 | 2 - 8 lakh |
| B  | 350 | 700 - 1,499 | 10 - 40 lakh |
| A  | 120 | 1,500 - 3,999 | 60 lakh - 3 crore |
| S  | 29 | 4,000 - 9,999 | 8 - 40 crore |
| National-Level | 1 | 10,000+ | about 150 - 300 crore |

Every stat (STR, AGI, INT, VIT, SENSE) starts at a minimum of 10. Class (Fighter, Tanker,
Assassin, Mage, Ranger, Healer) shapes how the stat points are split and nudges the price
(Healers cost the most). Rank counts are exact, and the data is reproducible:

```
python3 tools/generate_players.py
```

All values are game-balance numbers, not canon from the story.

## How the login works

- No passwords are stored in this repo. Only a salted PBKDF2 (SHA-256) hash is kept.
- Hashes live in the browser's `localStorage`, so profiles exist **per browser**.
- There is no server, so this is a game profile system, not real security.
  Clearing site data resets every profile.

## Run locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Password hashing needs a secure context, which means `https://` or `localhost`.

## Host on GitHub Pages

1. Repo **Settings -> Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save. The site goes live at `https://sanjey-ui.github.io/ff-stats/`
