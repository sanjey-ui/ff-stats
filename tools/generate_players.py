#!/usr/bin/env python3
"""Generate the 10,000-hunter market list for the Solo Leveling game.

Rank counts are exact (not sampled), so the ratio is always:
E 6000, D 2500, C 1000, B 350, A 120, S 29, National-Level 1.

Stats: STR, AGI, INT, VIT, SENSE. Every stat is at least 10 (the level-1
starting value), and power = the sum of the five stats.
Price is a one-time recruit fee in Indian rupees (INR).

All numbers are game-balance values, not canon from the story.
Run:  python3 tools/generate_players.py
"""
import csv
import json
import math
import os
import random

SEED = 20261011
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# rank: (count, power_min, power_max, price_min_inr, price_max_inr)
RANKS = {
    "E":  (6000,    50,    99,        5_000,        25_000),
    "D":  (2500,   100,   299,       30_000,       150_000),
    "C":  (1000,   300,   699,      200_000,       800_000),
    "B":  (350,    700,  1499,    1_000_000,     4_000_000),
    "A":  (120,   1500,  3999,    6_000_000,    30_000_000),
    "S":  (29,    4000,  9999,   80_000_000,   400_000_000),
    "NL": (1,    10000, 15000, 1_500_000_000, 3_000_000_000),
}

# class: (spawn weight, price multiplier, stat weights STR, AGI, INT, VIT, SENSE)
CLASSES = {
    "Fighter":  (25, 0.95, (0.35, 0.15, 0.05, 0.25, 0.20)),
    "Tanker":   (14, 1.10, (0.20, 0.05, 0.05, 0.55, 0.15)),
    "Assassin": (15, 1.00, (0.15, 0.40, 0.05, 0.10, 0.30)),
    "Mage":     (25, 1.10, (0.05, 0.10, 0.55, 0.10, 0.20)),
    "Ranger":   (15, 1.00, (0.10, 0.30, 0.10, 0.10, 0.40)),
    "Healer":   (6,  1.40, (0.05, 0.10, 0.35, 0.30, 0.20)),
}

SURNAMES = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim",
            "Han", "Oh", "Seo", "Shin", "Kwon", "Hwang", "Ahn", "Song", "Yoo", "Hong",
            "Jeon", "Ko", "Moon", "Yang", "Son", "Bae", "Baek", "Heo", "Nam", "Ryu"]
GIVEN = ["Min-jun", "Seo-jun", "Ha-joon", "Do-yun", "Eun-woo", "Si-woo", "Ji-ho", "Joon-seo",
         "Yu-jun", "Hyun-woo", "Seo-yeon", "Ji-woo", "Ha-eun", "Seo-yun", "Ha-yoon", "Ji-an",
         "Soo-ah", "Da-eun", "Yu-na", "Chae-won", "Tae-yang", "Jae-min", "Sung-ho", "Dong-hyun",
         "Woo-jin", "Kyung-soo", "Young-ho", "Min-seo", "Hye-jin", "So-yeon", "Ji-hoon", "Byung-chul",
         "Eun-ji", "Na-ri", "Ga-eun", "Bo-ram", "Kang-min", "Tae-oh", "Jin-woo", "Hee-chul"]


def round_sig(x, sig=3):
    if x == 0:
        return 0
    digits = sig - int(math.floor(math.log10(abs(x)))) - 1
    return int(round(x, digits))


def make_stats(rng, total, weights):
    """Split `total` across five stats, each at least 10, summing exactly to total."""
    extra = total - 50
    raw = [w * rng.uniform(0.6, 1.4) for w in weights]
    s = sum(raw)
    extras = [int(extra * r / s) for r in raw]
    # hand out the rounding remainder one point at a time to random stats
    for _ in range(extra - sum(extras)):
        extras[rng.randrange(5)] += 1
    return [10 + e for e in extras]


def main():
    rng = random.Random(SEED)
    class_names = list(CLASSES)
    class_weights = [CLASSES[c][0] for c in class_names]

    players = []
    for rank, (count, p_lo, p_hi, c_lo, c_hi) in RANKS.items():
        for _ in range(count):
            cls = rng.choices(class_names, class_weights)[0]
            _, price_mult, stat_w = CLASSES[cls]
            # u in [0,1): skewed low, so most hunters sit near the bottom of their rank
            u = rng.random() ** 1.6
            total = p_lo + int(u * (p_hi - p_lo))
            stats = make_stats(rng, total, stat_w)
            price = c_lo * ((c_hi / c_lo) ** u) * rng.uniform(0.9, 1.1) * price_mult
            players.append({
                "name": f"{rng.choice(SURNAMES)} {rng.choice(GIVEN)}",
                "rank": rank,
                "cls": cls,
                "str": stats[0], "agi": stats[1], "int": stats[2],
                "vit": stats[3], "sense": stats[4],
                "power": sum(stats),
                "price": round_sig(price, 3),
            })

    rng.shuffle(players)
    for i, p in enumerate(players, start=1):
        p["id"] = f"H{i:05d}"
    players = [{"id": p["id"], **{k: v for k, v in p.items() if k != "id"}} for p in players]

    with open(os.path.join(OUT_DIR, "players.json"), "w", encoding="utf-8") as f:
        json.dump(players, f, separators=(",", ":"), ensure_ascii=False)

    with open(os.path.join(OUT_DIR, "players.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "rank", "class", "str", "agi", "int", "vit", "sense", "power", "price_inr"])
        for p in players:
            w.writerow([p["id"], p["name"], p["rank"], p["cls"], p["str"], p["agi"],
                        p["int"], p["vit"], p["sense"], p["power"], p["price"]])

    print(f"wrote {len(players)} hunters")


if __name__ == "__main__":
    main()
