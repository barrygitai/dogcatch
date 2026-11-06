/* DogCatch demo — localStorage persistence */
window.CatchStore = (() => {
  const KEY = "dogcatch_demo_v1";
  const CAN_CAP = 24;
  const CAN_START = 20;
  const RECHARGE_MS = 3 * 60 * 1000; // +1 can every 3 minutes
  const FREE_MISS_CAP = 10; // first 10 lifetime 3-miss fails do not consume a can

  function defaults() {
    return {
      dogs: [],
      resources: { cans: CAN_START, coins: 0, xp: 0 },
      nextSerial: 1,
      lastCanRechargeAt: Date.now(),
      todayKey: dayKey(),
      todayCount: 0,
      lifetimeMissFails: 0,
      lifetimeMinigames: 0
    };
  }

  function dayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function load() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") data = defaults();
    data.resources = data.resources || { cans: CAN_START, coins: 0, xp: 0 };
    // migrate cats → dogs if an older draft existed
    if (!Array.isArray(data.dogs)) {
      data.dogs = Array.isArray(data.cats) ? data.cats : [];
    }
    delete data.cats;
    data.nextSerial = data.nextSerial || 1;
    data.lastCanRechargeAt = data.lastCanRechargeAt || Date.now();
    data.lifetimeMissFails = data.lifetimeMissFails || 0;
    data.lifetimeMinigames = data.lifetimeMinigames || 0;
    applyRecharge(data);
    rollToday(data);
    save(data);
    return data;
  }

  function applyRecharge(data) {
    const now = Date.now();
    let last = data.lastCanRechargeAt || now;
    let gained = 0;
    while (data.resources.cans < CAN_CAP && now - last >= RECHARGE_MS) {
      data.resources.cans += 1;
      last += RECHARGE_MS;
      gained += 1;
    }
    data.lastCanRechargeAt = data.resources.cans >= CAN_CAP ? now : last;
    return gained;
  }

  function rollToday(data) {
    const k = dayKey();
    if (data.todayKey !== k) {
      data.todayKey = k;
      data.todayCount = 0;
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function rarest(dogs) {
    const order = ["Alley", "Garden", "Moonlit", "Velvet", "Golden"];
    let best = null;
    let bestIdx = -1;
    for (const c of dogs) {
      const i = order.indexOf(c.rarity);
      if (i > bestIdx) {
        bestIdx = i;
        best = c.rarity;
      }
    }
    return best;
  }

  /** Consume a can after a 3-miss fail. First FREE_MISS_CAP lifetime fails are free. */
  function consumeCanOnMissFail(data) {
    if (data.lifetimeMissFails < FREE_MISS_CAP) {
      data.lifetimeMissFails += 1;
      save(data);
      return { consumed: false, remainingFree: FREE_MISS_CAP - data.lifetimeMissFails };
    }
    data.resources.cans = Math.max(0, data.resources.cans - 1);
    save(data);
    return { consumed: true, remainingFree: 0 };
  }

  return {
    KEY, CAN_CAP, CAN_START, RECHARGE_MS, FREE_MISS_CAP,
    load, save, applyRecharge, rollToday, rarest, dayKey, consumeCanOnMissFail
  };
})();
