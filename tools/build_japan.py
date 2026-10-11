#!/usr/bin/env python3
"""Phase 1 world data: Japan.

- 50 anime guilds (one per anime), each with exactly 50 members.
- Japan Hunter Association and Japan National Bank.
- Open hunters = 1% of population, stored as counts by rank and class.
- Anime members include heroes, villains, fallen (dead) characters and common people.

Population is approximate (about 123 million); replace with the official figure in
data/countries.json when it is verified. Character names are bot characters.
Run: python3 tools/build_japan.py
"""
import json
import os
import random

SEED = 20251012
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
POPULATION = 123_000_000
OPEN_HUNTER_RATE = 0.01  # 1% of population

# (anime, leader) - 50 anime guilds. Leader is the guild's hunter master.
ANIME = [
    ("Jujutsu Kaisen", "Gojo Satoru"), ("Naruto", "Naruto Uzumaki"), ("One Piece", "Monkey D. Luffy"),
    ("Demon Slayer", "Tanjiro Kamado"), ("Attack on Titan", "Eren Yeager"), ("Dragon Ball", "Son Goku"),
    ("Death Note", "Light Yagami"), ("Bleach", "Ichigo Kurosaki"), ("Hunter x Hunter", "Gon Freecss"),
    ("My Hero Academia", "Izuku Midoriya"), ("One Punch Man", "Saitama"), ("Mob Psycho 100", "Shigeo Kageyama"),
    ("Chainsaw Man", "Denji"), ("Spy x Family", "Loid Forger"), ("Fullmetal Alchemist", "Edward Elric"),
    ("Code Geass", "Lelouch vi Britannia"), ("Cowboy Bebop", "Spike Spiegel"), ("Neon Genesis Evangelion", "Shinji Ikari"),
    ("Sailor Moon", "Usagi Tsukino"), ("Gintama", "Gintoki Sakata"), ("Vinland Saga", "Thorfinn"),
    ("Tokyo Ghoul", "Ken Kaneki"), ("Haikyuu!!", "Shoyo Hinata"), ("Blue Lock", "Yoichi Isagi"),
    ("Black Clover", "Asta"), ("Fire Force", "Shinra Kusakabe"), ("Sword Art Online", "Kirito"),
    ("Re:Zero", "Subaru Natsuki"), ("Overlord", "Ainz Ooal Gown"), ("Mushoku Tensei", "Rudeus Greyrat"),
    ("Hellsing", "Alucard"), ("JoJo's Bizarre Adventure", "Jotaro Kujo"), ("Berserk", "Guts"),
    ("Gurren Lagann", "Simon"), ("Dr. Stone", "Senku Ishigami"), ("Frieren", "Frieren"),
    ("Violet Evergarden", "Violet Evergarden"), ("Akira", "Kaneda Shotaro"), ("Ghost in the Shell", "Motoko Kusanagi"),
    ("Dororo", "Hyakkimaru"), ("Samurai Champloo", "Mugen"), ("Kaguya-sama", "Kaguya Shinomiya"),
    ("Oshi no Ko", "Ai Hoshino"), ("Tokyo Revengers", "Takemichi Hanagaki"), ("Blue Exorcist", "Rin Okumura"),
    ("Noragami", "Yato"), ("Yu Yu Hakusho", "Yusuke Urameshi"), ("Assassination Classroom", "Koro-sensei"),
    ("Parasyte", "Shinichi Izumi"), ("Mirai Nikki", "Yuno Gasai"),
]

# class weights (same as the global game) and stat tilt
CLASSES = {"Fighter": 25, "Tanker": 14, "Assassin": 15, "Mage": 25, "Ranger": 15, "Healer": 6}

# rank weights for open hunters (game-balance pyramid, same as the earlier spec)
RANK_SHARE = {"E": 0.60, "D": 0.25, "C": 0.10, "B": 0.035, "A": 0.012, "S": 0.0029, "NL": 0.0001}

# fixed roles inside every anime guild (50 members in total)
ROLE_MIX = (
    ["hero"] * 8 + ["villain"] * 6 + ["fallen"] * 6 + ["commoner"] * 10
    + ["ally"] * 12 + ["mentor"] * 4 + ["rival"] * 4
)  # 50 entries

ROLE_TITLE = {
    "hero": "Hero", "villain": "Villain", "fallen": "Fallen Soul",
    "commoner": "Common Hunter", "ally": "Ally", "mentor": "Mentor", "rival": "Rival",
}

# every guild, member and bot has a stable ID, so the same data always means the same world
def make_guild(rng, idx, anime, leader_name):
    members = []
    names = [leader_name]
    # the leader fills the first slot, then 49 members follow the role mix
    roles = ["leader"] + ROLE_MIX[:49]
    rng.shuffle(roles[1:])
    for i, role in enumerate(roles):
        if i == 0:
            name = leader_name
            label = "Guild Master"
        else:
            name = f"{ROLE_TITLE[role]} #{i:02d} of {anime}"
            label = ROLE_TITLE[role]
        cls = rng.choices(list(CLASSES), weights=list(CLASSES.values()))[0]
        stats = rng.randint(120, 900) if role != "fallen" else rng.randint(60, 500)
        members.append({
            "id": f"JP-G{idx:02d}-{i:02d}",
            "name": name,
            "role": label.lower().replace(" ", "_"),
            "fallen": role == "fallen",
            "villain": role == "villain",
            "cls": cls,
            "power": stats,
            "cash": rng.randint(1_000_000, 80_000_000),
        })
    return {
        "id": f"JP-G{idx:02d}",
        "name": f"{anime} Guild",
        "anime": anime,
        "leader": leader_name,
        "members": members,
        "cash": 50_00_00_000,  # Rs 50 crore starting cash
        "loan": 20_00_00_000,  # Rs 20 crore starting loan from the National Bank
        "size": len(members),
    }


def open_hunter_counts():
    total = round(POPULATION * OPEN_HUNTER_RATE)
    by_rank = {}
    running = 0
    ranks = list(RANK_SHARE)
    for r in ranks[:-1]:
        n = round(total * RANK_SHARE[r])
        by_rank[r] = n
        running += n
    by_rank[ranks[-1]] = total - running
    return total, by_rank


def main():
    rng = random.Random(SEED)
    guilds = [make_guild(rng, i + 1, anime, leader) for i, (anime, leader) in enumerate(ANIME)]
    assert len(guilds) == 50 and all(g["size"] == 50 for g in guilds)

    total, by_rank = open_hunter_counts()
    association = {
        "id": "JP-ASSOC",
        "name": "Japan Hunter Association",
        "head": "Association Head - Mikumo Shizuka",
        "cash": 100_00_00_000,  # starts with the Rs 100 crore loan as its cash
        "debt": 100_00_00_000,
        "debt_limit": 1_00_00_00_00_00_00,  # Rs 1 trillion
    }
    bank = {
        "id": "JP-BANK",
        "name": "National Bank of Japan",
        "manager": "Bank Manager - Hiroshi Kagami",
        "vault": 1_00_00_00_00_00_00_00,  # Rs 1 trillion vault (display in INR)
        "cash": 1_00_00_00_00_00_00_00,
    }

    data = {
        "country": {"code": "JP", "name": "Japan", "population": POPULATION},
        "open_hunters": {"rate": OPEN_HUNTER_RATE, "total": total, "by_rank": by_rank},
        "association": association,
        "bank": bank,
        "guilds": guilds,
        "dungeons_per_day": 100,
        "new_hunters_per_day": 1,
    }

    out = os.path.join(ROOT, "data")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "japan.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"guilds: {len(guilds)} x {guilds[0]['size']} | open hunters: {total:,} | by rank: {by_rank}")


if __name__ == "__main__":
    main()
