/* DogCatch demo — name banks, rarities, abilities */
window.CatchData = (() => {
  const TITLES = [
    "Sir", "Dame", "Count", "Officer", "Lord", "Lady", "Captain",
    "Professor", "Duke", "Miss", "Baron", "Agent", "Mayor", "Chef",
    "Scout", "Ranger"
  ];
  const ADJECTIVES = [
    "Bouncy", "Loyal", "Velvet", "Clover", "Woofy", "Puddle",
    "Sassy", "Midnight", "Butter", "Crispy", "Noble", "Chaos",
    "Pudding", "Waggy", "Sunny", "Stormy", "Cozy", "Mighty",
    "Spotty", "Fluffy"
  ];
  const FOODS = [
    "Maximus", "Donut", "Stinker", "Biscuit", "Noodle", "Bagel",
    "Mochi", "Tofu", "Waffle", "Pretzel", "Dumpling", "Croissant",
    "Pancake", "Scone", "Ramen", "Latte", "Truffle", "Pickle",
    "Bone", "Kibble"
  ];
  const SOLO = [
    "Sir Barksalot", "Dame Biscuit", "Officer Puddle",
    "Captain Tailspin", "General Goodboy", "Loafus Maximus",
    "Butterbean Supreme", "Hooligan", "Smoosh", "Sapphire",
    "Chaos", "Scout Waggles", "Mayor Muttley", "Professor Sniff"
  ];

  const RARITIES = [
    { id: "Alley", weight: 45, xp: 40, coins: [4, 8], hpBase: 28 },
    { id: "Garden", weight: 28, xp: 70, coins: [7, 12], hpBase: 34 },
    { id: "Moonlit", weight: 15, xp: 110, coins: [10, 16], hpBase: 40 },
    { id: "Velvet", weight: 9, xp: 160, coins: [14, 22], hpBase: 48 },
    { id: "Golden", weight: 3, xp: 250, coins: [20, 32], hpBase: 58 }
  ];

  const TYPES = [
    "Goodboy", "Retriever", "Spotted", "Fluffball", "Mutt",
    "Hound", "Pup", "Corgi", "Bean", "Stripes"
  ];

  // Keyword names kept for battle skill-breaks; descs describe combat effects
  const KEYWORDS = [
    { name: "Guard", icon: "🛡️", desc: "本回合抵挡一次敌方攻击，伤害变为 0。" },
    { name: "Copycat", icon: "🐕", desc: "立刻再放一次上一个用过的技能。" },
    { name: "Finale", icon: "🎆", desc: "本回合攻击伤害翻倍，作为终局一击。" },
    { name: "Snacktime", icon: "🥫", desc: "立刻回复相当于 SNACK 数值的生命。" },
    { name: "Purrfect", icon: "✨", desc: "本次攻击必定暴击，伤害 ×1.5。" },
    { name: "Nap", icon: "😴", desc: "跳过敌方下一击，但本回合你不能攻击。" },
    { name: "Zoomies", icon: "💨", desc: "立刻再攻击一次，但每次伤害 -2。" },
    { name: "Loaf", icon: "🍞", desc: "本回合受到的伤害减半。" }
  ];

  // Relative offsets around the user — applied when GPS is known
  const SAMPLE_OFFSETS = [
    { name: "Community Wag", dLat: 0.0018, dLng: -0.0012, photo: "assets/demo-dog-1.jpg", sample: true },
    { name: "Park Goodboy", dLat: -0.0014, dLng: 0.0020, photo: "assets/demo-dog-2.jpg", sample: true },
    { name: "Alley Pup", dLat: 0.0009, dLng: 0.0015, photo: "assets/demo-dog-3.jpg", sample: true },
    { name: "Corner Sniff", dLat: -0.0021, dLng: -0.0008, photo: "assets/demo-dog-4.jpg", sample: true }
  ];

  const DEMO_PHOTOS = [
    "assets/demo-dog-1.jpg",
    "assets/demo-dog-2.jpg",
    "assets/demo-dog-3.jpg",
    "assets/demo-dog-4.jpg",
    "assets/demo-dog-5.jpg",
    "assets/demo-dog-6.jpg"
  ];

  const RIVAL_NAMES = [
    "Alley Rival", "Street Scout", "Park Challenger",
    "Corner Hound", "Trainee Pup", "Shadow Mutt"
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function weightedRarity() {
    const total = RARITIES.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * total;
    for (const r of RARITIES) {
      roll -= r.weight;
      if (roll <= 0) return r;
    }
    return RARITIES[0];
  }

  function rarityById(id) {
    return RARITIES.find((r) => r.id === id) || RARITIES[0];
  }

  function generateName(used) {
    const set = new Set(used || []);
    for (let i = 0; i < 60; i++) {
      let name;
      if (Math.random() < 0.08) {
        name = pick(SOLO);
      } else if (Math.random() < 0.5) {
        name = `${pick(TITLES)} ${pick(ADJECTIVES)}`;
      } else {
        name = `${pick(TITLES)} ${pick(ADJECTIVES)} ${pick(FOODS)}`;
      }
      if (!set.has(name)) return name;
    }
    return `${pick(TITLES)} ${pick(FOODS)} ${Math.floor(Math.random() * 90 + 10)}`;
  }

  function stickerStyle() {
    const filters = [
      "none",
      "contrast(1.08) saturate(1.12)",
      "sepia(0.18) saturate(1.1)",
      "hue-rotate(-8deg) saturate(1.15)",
      "brightness(1.06) contrast(1.05)",
      "saturate(1.25)"
    ];
    return {
      rotate: Math.round((Math.random() * 10 - 5) * 10) / 10,
      cropX: Math.round(Math.random() * 18),
      cropY: Math.round(Math.random() * 18),
      scale: 1.08 + Math.random() * 0.18,
      filter: pick(filters)
    };
  }

  function generateDog({ photo, lat, lng, serial, demo, rarityId, usedNames, style }) {
    const rarity = rarityId ? rarityById(rarityId) : weightedRarity();
    const kws = [];
    const pool = [...KEYWORDS];
    const count = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      kws.push(pool.splice(idx, 1)[0]);
    }
    const snack = 2 + Math.floor(Math.random() * 8);
    const charm = 2 + Math.floor(Math.random() * 9);
    const coins = rarity.coins[0] + Math.floor(Math.random() * (rarity.coins[1] - rarity.coins[0] + 1));
    return {
      id: `dog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: generateName(usedNames),
      serial,
      photo,
      rarity: rarity.id,
      type: pick(TYPES),
      keywords: kws,
      ability: kws[0] ? kws[0].desc : "一只路过的神秘狗狗。",
      snack,
      charm,
      xpGain: rarity.xp,
      coinsGain: coins,
      lat: lat ?? null,
      lng: lng ?? null,
      demo: !!demo,
      stickerStyle: style || (demo ? stickerStyle() : null),
      capturedAt: Date.now()
    };
  }

  // Back-compat alias used by shared helpers
  function generateCat(opts) {
    return generateDog(opts);
  }

  function dogHp(dog) {
    const r = rarityById(dog.rarity);
    return (r.hpBase || 28) + (dog.charm || 0) * 3;
  }

  function makeRivalCrew() {
    const crew = [];
    const used = [];
    for (let i = 0; i < 3; i++) {
      const rarity = weightedRarity();
      const snack = 2 + Math.floor(Math.random() * 8);
      const charm = 2 + Math.floor(Math.random() * 9);
      const kws = [];
      const pool = [...KEYWORDS];
      const count = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < count && pool.length; k++) {
        const idx = Math.floor(Math.random() * pool.length);
        kws.push(pool.splice(idx, 1)[0]);
      }
      const name = generateName(used);
      used.push(name);
      crew.push({
        id: `rival_${i}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        rarity: rarity.id,
        type: pick(TYPES),
        keywords: kws,
        snack,
        charm,
        photo: pick(DEMO_PHOTOS),
        rival: true
      });
    }
    return crew;
  }

  function formatSerial(n) {
    return `#${String(n).padStart(6, "0")}`;
  }

  function levelFromXp(xp) {
    return Math.max(1, Math.floor(xp / 100) + 1);
  }

  function xpProgress(xp) {
    return (xp % 100) / 100;
  }

  return {
    RARITIES, TYPES, KEYWORDS, SAMPLE_OFFSETS, DEMO_PHOTOS, RIVAL_NAMES,
    generateName, generateDog, generateCat, weightedRarity, rarityById,
    formatSerial, levelFromXp, xpProgress, pick, stickerStyle, dogHp, makeRivalCrew
  };
})();
