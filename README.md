# Solo Leveling: Hunter Management

A Solo Leveling-style management game built with plain HTML, CSS and JavaScript.
This first version is the login layer only.

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
