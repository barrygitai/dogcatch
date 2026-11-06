/* DogCatch demo — UI + scan + detection + alley clash */
(() => {
  "use strict";

  const D = window.CatchData;
  const S = window.CatchStore;

  const state = {
    data: S.load(),
    tab: "album",
    stream: null,
    track: null,
    torchOn: false,
    detector: null,
    detectorLoading: null,
    scanMode: null, // "live" | "demo"
    demoPhoto: null,
    triesLeft: 3,
    pendingDog: null,
    pendingRarity: null,
    map: null,
    mapReady: false,
    userLat: null,
    userLng: null,
    geoDenied: false,
    markers: [],
    aimRaf: null,
    aimPos: 0,
    aimDir: 1,
    aimFrozen: false,
    dragging: false,
    // battle
    battleLead: null,
    battleSupports: [],
    battle: null,
    baAimRaf: null,
    baAimPos: 0,
    baAimDir: 1
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg, ms = 2200) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  function refreshResources() {
    S.applyRecharge(state.data);
    S.rollToday(state.data);
    S.save(state.data);
    const { cans, coins, xp } = state.data.resources;
    $("#res-cans").textContent = cans;
    $("#res-coins").textContent = coins;
    $("#res-xp").textContent = xp;
    $("#scan-cans").textContent = cans;
    $("#mg-cans").textContent = cans;
    $("#profile-coins").textContent = coins;
  }

  function stickerImgStyle(style) {
    if (!style) return "";
    const rot = style.rotate || 0;
    const sx = 1 + (style.cropX || 0) / 100;
    const sy = 1 + (style.cropY || 0) / 100;
    const scale = style.scale || 1.1;
    const filter = style.filter || "none";
    return `transform: rotate(${rot}deg) scale(${scale * Math.max(sx, sy)}); filter: ${filter}; object-position: ${50 + (style.cropX || 0) / 2}% ${50 + (style.cropY || 0) / 2}%;`;
  }

  function renderAlbum() {
    const grid = $("#album-grid");
    const empty = $("#album-empty");
    $$(".sticker-card", grid).forEach((n) => n.remove());
    const dogs = state.data.dogs;
    if (!dogs.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const ordered = [...dogs].reverse();
    for (const dog of ordered) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sticker-card rarity-${dog.rarity}`;
      const styleAttr = dog.stickerStyle ? stickerImgStyle(dog.stickerStyle) : "";
      btn.innerHTML = `
        <img class="sticker-img${dog.stickerStyle ? " has-style" : ""}" src="${dog.photo}" alt="${escapeAttr(dog.name)}" style="${styleAttr}" />
        <span class="sticker-label"><span>${escapeHtml(dog.name)}</span><i class="paw">🐾</i></span>
      `;
      btn.addEventListener("click", () => showCard(dog));
      grid.appendChild(btn);
    }
  }

  function renderProfile() {
    const dogs = state.data.dogs;
    const xp = state.data.resources.xp;
    const lvl = D.levelFromXp(xp);
    $("#profile-count").textContent = dogs.length;
    $("#profile-lvl").textContent = `LVL ${lvl}`;
    $("#profile-xp-fill").style.width = `${Math.round(D.xpProgress(xp) * 100)}%`;
    $("#profile-rarest").textContent = S.rarest(dogs) || "—";
    $("#profile-today").textContent = state.data.todayCount || 0;
  }

  function setTab(tab) {
    state.tab = tab;
    $$(".tab-panel").forEach((p) => { p.hidden = true; });
    $(`#tab-${tab}`).hidden = false;
    $$(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    if (tab === "album") renderAlbum();
    if (tab === "profile") renderProfile();
    if (tab === "map") ensureMap();
    if (tab === "battle") renderBattleSetup();
    refreshResources();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- Map ---------- */
  function ensureMap() {
    if (!state.mapReady) {
      state.map = L.map("map", {
        zoomControl: false,
        attributionControl: true
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.map);
      state.mapReady = true;
      // Do NOT default to Hangzhou — wait for GPS or show a neutral world view briefly
      state.map.setView([20, 0], 2);
      tryGeolocate(true);
    }
    setTimeout(() => state.map.invalidateSize(), 80);
    refreshMapPins();
  }

  function tryGeolocate(center) {
    if (!navigator.geolocation) {
      toast("需要定位才能把地图放到你附近");
      state.geoDenied = true;
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userLat = pos.coords.latitude;
        state.userLng = pos.coords.longitude;
        state.geoDenied = false;
        if (center && state.map) {
          state.map.setView([state.userLat, state.userLng], 15);
        }
        if (state.mapReady) refreshMapPins();
      },
      () => {
        state.geoDenied = true;
        toast("需要定位才能把地图放到你附近");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function refreshMapPins() {
    if (!state.map) return;
    state.markers.forEach((m) => m.remove());
    state.markers = [];

    if (state.userLat == null || state.userLng == null) {
      // No GPS yet — only show player's dogs that already have coords
      for (const dog of state.data.dogs) {
        if (dog.lat == null || dog.lng == null) continue;
        addPin(dog.lat, dog.lng, dog.photo, dog.name, `${dog.rarity} · ${D.formatSerial(dog.serial)}`, false, dog);
      }
      return;
    }

    const baseLat = state.userLat;
    const baseLng = state.userLng;

    for (const s of D.SAMPLE_OFFSETS) {
      addPin(baseLat + s.dLat, baseLng + s.dLng, s.photo, s.name, "社区记录 · 示例", true);
    }

    for (const dog of state.data.dogs) {
      let lat = dog.lat;
      let lng = dog.lng;
      if (lat == null || lng == null) {
        lat = baseLat + (Math.random() - 0.5) * 0.012;
        lng = baseLng + (Math.random() - 0.5) * 0.012;
      }
      addPin(lat, lng, dog.photo, dog.name, `${dog.rarity} · ${D.formatSerial(dog.serial)}`, false, dog);
    }
  }

  function addPin(lat, lng, photo, name, meta, sample, dog) {
    const icon = L.divIcon({
      className: "",
      html: `<img class="dog-pin${sample ? " sample" : ""}" src="${photo}" alt="" />`,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(state.map);
    marker.on("click", () => {
      if (dog) {
        showCard(dog);
      } else {
        $("#pin-preview-img").src = photo;
        $("#pin-preview-name").textContent = name;
        $("#pin-preview-meta").textContent = meta;
        $("#pin-preview").hidden = false;
      }
    });
    state.markers.push(marker);
  }

  /* ---------- Scan ---------- */
  async function openScan() {
    refreshResources();
    if (state.data.resources.cans <= 0) {
      toast("罐头用完了，等一会儿会自动回复");
      return;
    }
    state.triesLeft = 3;
    state.scanMode = null;
    state.demoPhoto = null;
    state.pendingRarity = null;
    updateTriesUI();
    $("#scan-screen").hidden = false;
    $("#minigame").hidden = true;
    $("#detecting").hidden = true;
    $("#demo-frame").hidden = true;
    $("#scan-video").hidden = false;
    $("#scan-hint").textContent = "点一下或拖动罐头，开始瞄准";
    resetCanPosition();
    // best-effort GPS for catch location
    if (state.userLat == null) tryGeolocate(false);
    await startCamera();
  }

  function updateTriesUI() {
    const t = `${state.triesLeft} / 3 次`;
    $("#scan-tries").textContent = t;
    $("#mg-tries").textContent = t;
    $("#scan-cans").textContent = state.data.resources.cans;
    $("#mg-cans").textContent = state.data.resources.cans;
  }

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("无法打开相机，可用「演示狗」试玩");
      $("#flash-panel").hidden = true;
      return;
    }
    const constraints = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: "user" }, audio: false },
      { video: true, audio: false }
    ];
    let stream = null;
    for (const c of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (_) { /* try next */ }
    }
    if (!stream) {
      toast("无法打开相机，可用「演示狗」试玩");
      $("#flash-panel").hidden = true;
      return;
    }
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] || null;
    const video = $("#scan-video");
    video.srcObject = stream;
    try { await video.play(); } catch (_) {}
    setupTorchUI();
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
    }
    state.stream = null;
    state.track = null;
    state.torchOn = false;
    const video = $("#scan-video");
    video.srcObject = null;
  }

  function setupTorchUI() {
    const panel = $("#flash-panel");
    const caps = state.track && state.track.getCapabilities ? state.track.getCapabilities() : {};
    if (caps.torch) {
      panel.hidden = false;
      $("#flash-toggle").classList.toggle("on", state.torchOn);
    } else {
      panel.hidden = true;
    }
  }

  async function toggleTorch() {
    if (!state.track) return;
    const caps = state.track.getCapabilities ? state.track.getCapabilities() : {};
    if (!caps.torch) return;
    state.torchOn = !state.torchOn;
    try {
      await state.track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
    } catch {
      state.torchOn = false;
    }
    $("#flash-toggle").classList.toggle("on", state.torchOn);
  }

  function closeScan(opts = {}) {
    stopAim();
    stopCamera();
    $("#scan-screen").hidden = true;
    $("#minigame").hidden = true;
    $("#detecting").hidden = true;
    $("#demo-frame").hidden = true;
    state.scanMode = null;
    state.demoPhoto = null;
    state.pendingRarity = null;
    if (opts.toast) toast(opts.toast);
    setTab("album");
  }

  function resetCanPosition() {
    const can = $("#can-drag");
    can.style.position = "";
    can.style.left = "";
    can.style.top = "";
    can.style.transform = "";
    can.classList.remove("dragging");
  }

  /* Drag / tap can */
  function setupCanDrag() {
    const can = $("#can-drag");
    let startX = 0, startY = 0, origX = 0, origY = 0;
    let moved = false;

    const onDown = (e) => {
      if (!$("#minigame").hidden) return;
      e.preventDefault();
      state.dragging = true;
      moved = false;
      can.classList.add("dragging");
      const pt = point(e);
      const rect = can.getBoundingClientRect();
      can.style.position = "fixed";
      can.style.left = `${rect.left}px`;
      can.style.top = `${rect.top}px`;
      can.style.transform = "none";
      startX = pt.x;
      startY = pt.y;
      origX = rect.left;
      origY = rect.top;
      if (e.pointerId != null && can.setPointerCapture) {
        try { can.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };

    const onMove = (e) => {
      if (!state.dragging) return;
      e.preventDefault();
      const pt = point(e);
      if (Math.abs(pt.x - startX) + Math.abs(pt.y - startY) > 6) moved = true;
      can.style.left = `${origX + (pt.x - startX)}px`;
      can.style.top = `${origY + (pt.y - startY)}px`;
    };

    const onUp = () => {
      if (!state.dragging) return;
      state.dragging = false;
      can.classList.remove("dragging");
      if (!$("#minigame").hidden || $("#scan-screen").hidden) return;
      // Tap or drag-release both start the aim minigame
      void moved;
      beginMinigame(state.scanMode === "demo");
    };

    can.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function point(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  /* Demo mode */
  function startDemo() {
    state.scanMode = "demo";
    state.demoPhoto = D.pick(D.DEMO_PHOTOS);
    const img = $("#demo-frame");
    img.src = state.demoPhoto;
    img.hidden = false;
    $("#scan-video").hidden = true;
    $("#scan-hint").textContent = "点一下或拖动罐头，开始瞄准";
    resetCanPosition();
    toast("演示模式：点一下或拖动罐头");
  }

  /* Minigame */
  function beginMinigame(fromDemo) {
    if (fromDemo) state.scanMode = "demo";
    $("#minigame").hidden = false;

    // Roll rarity once for this catch attempt (tier label + final card)
    if (!state.pendingRarity) {
      state.pendingRarity = D.weightedRarity();
    }
    $("#mg-tier").textContent = `${state.pendingRarity.id} Tier`;
    updateTriesUI();

    const isCoach = (state.data.lifetimeMinigames || 0) < 3;
    const green = $("#aim-green");
    const width = isCoach
      ? 24 + Math.floor(Math.random() * 8)
      : 18 + Math.floor(Math.random() * 10);
    const left = 15 + Math.floor(Math.random() * (70 - width));
    green.style.width = `${width}%`;
    green.style.left = `${left}%`;

    const release = $("#mg-release");
    if (isCoach) {
      release.textContent = "橙色准星进绿色时，点屏幕";
      release.classList.add("mg-coach");
    } else {
      release.textContent = "准星进入绿色时点屏幕";
      release.classList.remove("mg-coach");
    }

    state.aimPos = 0;
    state.aimDir = 1;
    state.aimFrozen = false;
    $("#aim-marker").classList.remove("frozen");
    startAim(isCoach);
  }

  function startAim(isCoach) {
    stopAim();
    const marker = $("#aim-marker");
    const speed = isCoach
      ? 0.35 + Math.random() * 0.20
      : 0.55 + Math.random() * 0.35;
    const tick = () => {
      if (state.aimFrozen) {
        state.aimRaf = requestAnimationFrame(tick);
        return;
      }
      state.aimPos += state.aimDir * speed;
      if (state.aimPos >= 100) { state.aimPos = 100; state.aimDir = -1; }
      if (state.aimPos <= 0) { state.aimPos = 0; state.aimDir = 1; }
      marker.style.left = `${state.aimPos}%`;
      state.aimRaf = requestAnimationFrame(tick);
    };
    state.aimRaf = requestAnimationFrame(tick);

    const release = (e) => {
      if (e.target.closest("#mg-cancel, #mg-cancel-x")) return;
      if (state.aimFrozen) return;
      e.preventDefault();
      e.stopPropagation();
      resolveAim();
    };
    $("#minigame").onpointerdown = release;
  }

  function stopAim() {
    if (state.aimRaf) cancelAnimationFrame(state.aimRaf);
    state.aimRaf = null;
    $("#minigame").onpointerdown = null;
  }

  function resolveAim() {
    const green = $("#aim-green");
    const gLeft = parseFloat(green.style.left);
    const gWidth = parseFloat(green.style.width);
    const hit = state.aimPos >= gLeft && state.aimPos <= gLeft + gWidth;

    // Count this as a lifetime minigame attempt (for coach mode)
    state.data.lifetimeMinigames = (state.data.lifetimeMinigames || 0) + 1;
    S.save(state.data);

    if (hit) {
      stopAim();
      $("#minigame").hidden = true;
      runDetection();
      return;
    }

    // Freeze marker briefly on miss
    state.aimFrozen = true;
    $("#aim-marker").classList.add("frozen");
    state.triesLeft -= 1;
    updateTriesUI();

    setTimeout(() => {
      state.aimFrozen = false;
      $("#aim-marker").classList.remove("frozen");
      if (state.triesLeft <= 0) {
        stopAim();
        const result = S.consumeCanOnMissFail(state.data);
        if (result.consumed) {
          closeScan({ toast: "三次都没对准，罐头用掉一罐" });
        } else {
          closeScan({ toast: `三次都没对准（新手保护，罐头还在 · 剩${result.remainingFree}次）` });
        }
      } else {
        toast("没对准绿色区域，再试一次");
        beginMinigame(state.scanMode === "demo");
      }
    }, 400);
  }

  function cancelMinigame() {
    stopAim();
    $("#minigame").hidden = true;
    state.pendingRarity = null;
    resetCanPosition();
    if (state.scanMode === "demo") {
      $("#demo-frame").hidden = false;
    }
  }

  /* Detection */
  async function ensureDetector() {
    if (state.detector) return state.detector;
    if (state.detectorLoading) return state.detectorLoading;
    state.detectorLoading = (async () => {
      if (!window.cocoSsd) throw new Error("coco-ssd 未加载");
      state.detector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      return state.detector;
    })();
    try {
      return await state.detectorLoading;
    } finally {
      state.detectorLoading = null;
    }
  }

  async function runDetection() {
    $("#detecting").hidden = false;
    try {
      let photoDataUrl;
      let found = false;

      if (state.scanMode === "demo") {
        photoDataUrl = await imageToDataUrl(state.demoPhoto || D.DEMO_PHOTOS[0], true);
        found = true;
      } else {
        const frame = captureFrame();
        if (!frame) {
          toast("取景失败，请重试或用演示狗");
          $("#detecting").hidden = true;
          resetCanPosition();
          return;
        }
        photoDataUrl = frame;
        try {
          const model = await ensureDetector();
          const img = await loadImage(photoDataUrl);
          const preds = await model.detect(img);
          found = preds.some((p) => p.class === "dog" && p.score >= 0.35);
        } catch (err) {
          console.warn("detection error", err);
          toast("识别模型加载失败，可用演示狗");
          $("#detecting").hidden = true;
          state.triesLeft = Math.max(0, state.triesLeft - 1);
          updateTriesUI();
          if (state.triesLeft <= 0) {
            state.data.resources.cans = Math.max(0, state.data.resources.cans - 1);
            S.save(state.data);
            closeScan({ toast: "识别失败，罐头用掉一罐" });
          } else {
            resetCanPosition();
          }
          return;
        }
      }

      $("#detecting").hidden = true;

      if (!found) {
        state.triesLeft = Math.max(0, state.triesLeft - 1);
        updateTriesUI();
        toast("没有识别到狗，换个角度再试");
        if (state.triesLeft <= 0) {
          closeScan({ toast: "这次没抓到，罐头还在" });
        } else {
          resetCanPosition();
        }
        return;
      }

      // Success — consume 1 can
      state.data.resources.cans = Math.max(0, state.data.resources.cans - 1);
      const serial = state.data.nextSerial++;
      let lat = state.userLat;
      let lng = state.userLng;
      if (lat == null && navigator.geolocation) {
        tryGeolocate(false);
        lat = state.userLat;
        lng = state.userLng;
      }
      // Only place on map if we have real GPS — never invent Hangzhou coords
      if (lat == null || lng == null) {
        lat = null;
        lng = null;
      }

      const used = state.data.dogs.map((c) => c.name);
      const rarityId = state.pendingRarity ? state.pendingRarity.id : null;
      const dog = D.generateDog({
        photo: photoDataUrl,
        lat, lng,
        serial,
        demo: state.scanMode === "demo",
        rarityId,
        usedNames: used,
        style: state.scanMode === "demo" ? D.stickerStyle() : null
      });

      state.data.dogs.push(dog);
      state.data.resources.xp += dog.xpGain;
      state.data.resources.coins += dog.coinsGain;
      state.data.todayCount = (state.data.todayCount || 0) + 1;
      state.pendingRarity = null;
      S.save(state.data);

      stopCamera();
      $("#scan-screen").hidden = true;
      showFound(dog);
    } catch (err) {
      console.error(err);
      $("#detecting").hidden = true;
      toast("出了点问题，请再试一次");
      resetCanPosition();
    }
  }

  function captureFrame() {
    const video = $("#scan-video");
    if (!video.videoWidth) return null;
    const canvas = $("#scan-canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function imageToDataUrl(src, withStickerCrop) {
    const img = await loadImage(src);
    const canvas = document.createElement("canvas");
    const max = 800;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > max || h > max) {
      const scale = max / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (withStickerCrop) {
      const style = D.stickerStyle();
      const sx = Math.floor((style.cropX / 100) * (img.naturalWidth || img.width) * 0.15);
      const sy = Math.floor((style.cropY / 100) * (img.naturalHeight || img.height) * 0.15);
      const sw = (img.naturalWidth || img.width) - sx * 2;
      const sh = (img.naturalHeight || img.height) - sy * 2;
      ctx.filter = style.filter === "none" ? "none" : style.filter;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      ctx.filter = "none";
    } else {
      ctx.drawImage(img, 0, 0, w, h);
    }
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  /* Found */
  function showFound(dog) {
    state.pendingDog = dog;
    const stars = $("#found-stars");
    stars.innerHTML = "";
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("i");
      s.textContent = "★";
      s.style.left = `${8 + Math.random() * 84}%`;
      s.style.top = `${5 + Math.random() * 45}%`;
      s.style.animationDelay = `${Math.random()}s`;
      s.style.fontSize = `${14 + Math.random() * 14}px`;
      stars.appendChild(s);
    }
    $("#found-photo").src = dog.photo;
    if (dog.stickerStyle) {
      $("#found-photo").style.cssText = stickerImgStyle(dog.stickerStyle);
    } else {
      $("#found-photo").style.cssText = "";
    }
    $("#found-name").textContent = dog.name;
    $("#found-xp").textContent = `XP +${dog.xpGain}`;
    $("#found-coins").textContent = `🪙 +${dog.coinsGain}`;
    $("#found-serial").textContent = D.formatSerial(dog.serial);
    $("#found-screen").hidden = false;
  }

  function continueFromFound() {
    const dog = state.pendingDog;
    $("#found-screen").hidden = true;
    if (dog) showCard(dog);
    else setTab("album");
  }

  /* Card */
  function showCard(dog) {
    $("#card-name").textContent = dog.name;
    $("#card-serial").textContent = D.formatSerial(dog.serial);
    $("#card-photo").src = dog.photo;
    if (dog.stickerStyle) {
      $("#card-photo").style.cssText = stickerImgStyle(dog.stickerStyle);
    } else {
      $("#card-photo").style.cssText = "";
    }
    $("#card-rarity").textContent = dog.rarity;
    $("#card-type").textContent = `Iconic Dog · ${dog.type}`;
    $("#card-snack").textContent = dog.snack;
    $("#card-charm").textContent = dog.charm;
    $("#card-ability").textContent = dog.ability;

    const kw = $("#card-keywords");
    kw.innerHTML = "";
    for (const k of dog.keywords || []) {
      const chip = document.createElement("div");
      chip.className = "kw-chip";
      chip.innerHTML = `<span class="kw-ico">${k.icon}</span>${escapeHtml(k.name)}`;
      kw.appendChild(chip);
    }

    const detail = $("#keyword-detail");
    detail.innerHTML = `<p style="font-size:11px;font-weight:800;letter-spacing:.08em;color:#999;margin-bottom:8px">KEYWORDS</p>`;
    for (const k of dog.keywords || []) {
      const item = document.createElement("div");
      item.className = "kd-item";
      item.innerHTML = `<strong><span>${k.icon}</span>${escapeHtml(k.name)}</strong><p>${escapeHtml(k.desc)}</p>`;
      detail.appendChild(item);
    }

    $("#card-screen").hidden = false;
  }

  function closeCard() {
    $("#card-screen").hidden = true;
    state.pendingDog = null;
    setTab(state.tab === "battle" ? "battle" : "album");
    renderAlbum();
    refreshResources();
  }

  /* ---------- Battle (Alley Clash training) ---------- */
  function renderBattleSetup() {
    const dogs = state.data.dogs;
    const empty = $("#battle-empty");
    const setup = $("#battle-setup");
    const arena = $("#battle-arena");
    const result = $("#battle-result");
    arena.hidden = true;
    result.hidden = true;
    stopBaAim();
    state.battle = null;

    if (!dogs.length) {
      empty.hidden = false;
      setup.hidden = true;
      return;
    }
    empty.hidden = true;
    setup.hidden = false;

    // Keep previous picks if still valid
    if (state.battleLead && !dogs.find((d) => d.id === state.battleLead.id)) {
      state.battleLead = null;
    }
    state.battleSupports = state.battleSupports.filter((s) => dogs.find((d) => d.id === s.id));

    const leadRow = $("#battle-lead-picks");
    const supportRow = $("#battle-support-picks");
    leadRow.innerHTML = "";
    supportRow.innerHTML = "";

    for (const dog of dogs) {
      leadRow.appendChild(makePickCard(dog, "lead"));
      supportRow.appendChild(makePickCard(dog, "support"));
    }
    updateBattleStartBtn();
  }

  function makePickCard(dog, mode) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bp-card";
    const isLead = state.battleLead && state.battleLead.id === dog.id;
    const isSupport = state.battleSupports.some((s) => s.id === dog.id);
    if (mode === "lead" && isLead) btn.classList.add("selected");
    if (mode === "support" && isSupport) btn.classList.add("selected");
    if (mode === "support" && isLead) btn.classList.add("disabled");
    if (mode === "lead" && isSupport) btn.classList.add("disabled");
    btn.innerHTML = `<img src="${dog.photo}" alt="" /><span>${escapeHtml(dog.name)}</span>`;
    btn.addEventListener("click", () => {
      if (mode === "lead") {
        state.battleLead = isLead ? null : dog;
        state.battleSupports = state.battleSupports.filter((s) => s.id !== dog.id);
      } else {
        if (isLead) return;
        if (isSupport) {
          state.battleSupports = state.battleSupports.filter((s) => s.id !== dog.id);
        } else if (state.battleSupports.length < 2) {
          state.battleSupports.push(dog);
        } else {
          toast("支援最多 2 只");
          return;
        }
      }
      renderBattleSetup();
    });
    return btn;
  }

  function updateBattleStartBtn() {
    $("#battle-start").disabled = !state.battleLead;
  }

  function startBattle() {
    if (!state.battleLead) return;
    const playerCrew = [state.battleLead, ...state.battleSupports].map((d) => ({
      ...d,
      maxHp: D.dogHp(d),
      hp: D.dogHp(d),
      guard: false,
      loaf: false,
      napSkip: false,
      usedSkills: new Set()
    }));
    const rivals = D.makeRivalCrew().map((d) => ({
      ...d,
      maxHp: D.dogHp(d),
      hp: D.dogHp(d),
      guard: false,
      loaf: false,
      napSkip: false,
      usedSkills: new Set()
    }));

    state.battle = {
      playerCrew,
      rivalCrew: rivals,
      pIdx: 0,
      rIdx: 0,
      turn: "player",
      lastSkill: null,
      critNext: false,
      finaleNext: false,
      zoomiesExtra: false,
      skipAttack: false,
      over: false
    };

    $("#battle-setup").hidden = true;
    $("#battle-result").hidden = true;
    $("#battle-arena").hidden = false;
    syncBattleUI();
    beginPlayerTurn();
  }

  function activePlayer() {
    return state.battle.playerCrew[state.battle.pIdx];
  }
  function activeRival() {
    return state.battle.rivalCrew[state.battle.rIdx];
  }

  function syncBattleUI() {
    const b = state.battle;
    if (!b) return;
    const p = activePlayer();
    const r = activeRival();
    $("#ba-player-name").textContent = p.name;
    $("#ba-player-rarity").textContent = `${p.rarity} · SNACK ${p.snack}`;
    $("#ba-player-photo").src = p.photo;
    $("#ba-player-hp").style.width = `${Math.max(0, Math.round((p.hp / p.maxHp) * 100))}%`;
    $("#ba-enemy-name").textContent = r.name;
    $("#ba-enemy-rarity").textContent = `${r.rarity} · SNACK ${r.snack}`;
    $("#ba-enemy-photo").src = r.photo;
    $("#ba-enemy-hp").style.width = `${Math.max(0, Math.round((r.hp / r.maxHp) * 100))}%`;

    const pc = $("#ba-player-crew");
    const ec = $("#ba-enemy-crew");
    pc.innerHTML = "";
    ec.innerHTML = "";
    b.playerCrew.forEach((d, i) => {
      const img = document.createElement("img");
      img.src = d.photo;
      if (i === b.pIdx) img.classList.add("active");
      if (d.hp <= 0) img.style.filter = "grayscale(1)";
      pc.appendChild(img);
    });
    b.rivalCrew.forEach((d, i) => {
      const img = document.createElement("img");
      img.src = d.photo;
      if (i === b.rIdx) img.classList.add("active");
      if (d.hp <= 0) img.style.filter = "grayscale(1)";
      ec.appendChild(img);
    });

    const skills = $("#ba-skills");
    skills.innerHTML = "";
    for (const k of p.keywords || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ba-skill";
      btn.textContent = `${k.icon} ${k.name}`;
      btn.disabled = b.turn !== "player" || b.over || p.usedSkills.has(k.name);
      btn.title = k.desc;
      btn.addEventListener("click", () => useSkill(k));
      skills.appendChild(btn);
    }
  }

  function baLog(msg) {
    $("#ba-log").textContent = msg;
  }

  function beginPlayerTurn() {
    const b = state.battle;
    if (!b || b.over) return;
    b.turn = "player";
    b.critNext = false;
    b.finaleNext = false;
    b.zoomiesExtra = false;
    b.skipAttack = false;
    const p = activePlayer();
    p.guard = false;
    p.loaf = false;
    syncBattleUI();
    baLog(`${p.name} 的回合 — 准星进绿色时点屏幕`);
    startBaAim();
  }

  function startBaAim() {
    stopBaAim();
    const green = $("#ba-aim-green");
    const width = 20 + Math.floor(Math.random() * 10);
    const left = 12 + Math.floor(Math.random() * (70 - width));
    green.style.width = `${width}%`;
    green.style.left = `${left}%`;
    state.baAimPos = 0;
    state.baAimDir = 1;
    const marker = $("#ba-aim-marker");
    const speed = 0.5 + Math.random() * 0.35;
    const tick = () => {
      state.baAimPos += state.baAimDir * speed;
      if (state.baAimPos >= 100) { state.baAimPos = 100; state.baAimDir = -1; }
      if (state.baAimPos <= 0) { state.baAimPos = 0; state.baAimDir = 1; }
      marker.style.left = `${state.baAimPos}%`;
      state.baAimRaf = requestAnimationFrame(tick);
    };
    state.baAimRaf = requestAnimationFrame(tick);
    $("#ba-aim-wrap").onpointerdown = (e) => {
      e.preventDefault();
      resolveBaAim();
    };
  }

  function stopBaAim() {
    if (state.baAimRaf) cancelAnimationFrame(state.baAimRaf);
    state.baAimRaf = null;
    const wrap = $("#ba-aim-wrap");
    if (wrap) wrap.onpointerdown = null;
  }

  function resolveBaAim() {
    const b = state.battle;
    if (!b || b.turn !== "player" || b.over) return;
    stopBaAim();
    if (b.skipAttack) {
      baLog("本回合跳过攻击（Nap）");
      b.skipAttack = false;
      setTimeout(enemyTurn, 700);
      return;
    }
    const green = $("#ba-aim-green");
    const gLeft = parseFloat(green.style.left);
    const gWidth = parseFloat(green.style.width);
    const hit = state.baAimPos >= gLeft && state.baAimPos <= gLeft + gWidth;
    const p = activePlayer();
    let dmg = hit ? p.snack + 2 : Math.max(1, Math.floor(p.snack / 2));
    if (b.critNext) dmg = Math.round(dmg * 1.5);
    if (b.finaleNext) dmg *= 2;
    if (b.zoomiesExtra) dmg = Math.max(1, dmg - 2);
    dealDamage(activeRival(), dmg, p.name);
    b.critNext = false;
    b.finaleNext = false;

    if (checkBattleEnd()) return;

    if (b.zoomiesExtra) {
      b.zoomiesExtra = false;
      baLog("Zoomies！再攻一次");
      setTimeout(() => {
        if (b.over) return;
        const extra = Math.max(1, p.snack - 2);
        dealDamage(activeRival(), extra, p.name);
        if (!checkBattleEnd()) setTimeout(enemyTurn, 700);
      }, 500);
      return;
    }
    setTimeout(enemyTurn, 700);
  }

  function dealDamage(target, raw, fromName) {
    let dmg = raw;
    if (target.guard) {
      dmg = 0;
      target.guard = false;
      baLog(`${target.name} 的 Guard 挡住了攻击！`);
    } else if (target.loaf) {
      dmg = Math.ceil(dmg / 2);
      target.loaf = false;
      target.hp = Math.max(0, target.hp - dmg);
      baLog(`${fromName} 打出 ${dmg}（Loaf 减半）→ ${target.name}`);
    } else {
      target.hp = Math.max(0, target.hp - dmg);
      baLog(`${fromName} 造成 ${dmg} 伤害 → ${target.name}`);
    }
    syncBattleUI();
  }

  function useSkill(kw) {
    const b = state.battle;
    if (!b || b.turn !== "player" || b.over) return;
    const p = activePlayer();
    if (p.usedSkills.has(kw.name)) return;
    p.usedSkills.add(kw.name);
    const prevSkill = b.lastSkill;

    switch (kw.name) {
      case "Guard":
        p.guard = true;
        baLog(`${p.name} 举起 Guard！`);
        break;
      case "Loaf":
        p.loaf = true;
        baLog(`${p.name} 缩成 Loaf，减伤中`);
        break;
      case "Snacktime":
        p.hp = Math.min(p.maxHp, p.hp + p.snack);
        baLog(`Snacktime！回复 ${p.snack} 生命`);
        break;
      case "Purrfect":
        b.critNext = true;
        baLog("Purrfect！下次攻击必定暴击");
        break;
      case "Finale":
        b.finaleNext = true;
        baLog("Finale！下次攻击伤害翻倍");
        break;
      case "Nap":
        activeRival().napSkip = true;
        b.skipAttack = true;
        baLog("Nap… 跳过敌方下一击，本回合不攻击");
        break;
      case "Zoomies":
        b.zoomiesExtra = true;
        baLog("Zoomies！命中后会再攻一次");
        break;
      case "Copycat":
        if (prevSkill && prevSkill !== "Copycat") {
          const again = (p.keywords || []).find((k) => k.name === prevSkill) ||
            D.KEYWORDS.find((k) => k.name === prevSkill);
          if (again) {
            baLog(`Copycat → 再放一次 ${again.name}`);
            // Apply copied effect inline
            if (again.name === "Guard") p.guard = true;
            else if (again.name === "Loaf") p.loaf = true;
            else if (again.name === "Snacktime") p.hp = Math.min(p.maxHp, p.hp + p.snack);
            else if (again.name === "Purrfect") b.critNext = true;
            else if (again.name === "Finale") b.finaleNext = true;
            else if (again.name === "Nap") { activeRival().napSkip = true; b.skipAttack = true; }
            else if (again.name === "Zoomies") b.zoomiesExtra = true;
            b.lastSkill = prevSkill;
            syncBattleUI();
            return;
          }
        }
        baLog("Copycat：还没有可复制的技能");
        p.usedSkills.delete(kw.name);
        syncBattleUI();
        return;
      default:
        baLog(`${kw.name} 发动了`);
    }
    b.lastSkill = kw.name;
    syncBattleUI();
  }

  function enemyTurn() {
    const b = state.battle;
    if (!b || b.over) return;
    b.turn = "enemy";
    stopBaAim();
    syncBattleUI();

    // Advance to living rival if needed
    if (activeRival().hp <= 0) {
      const next = b.rivalCrew.findIndex((d, i) => i > b.rIdx && d.hp > 0);
      if (next >= 0) {
        b.rIdx = next;
        syncBattleUI();
      } else if (checkBattleEnd()) return;
    }

    const r = activeRival();
    const p = activePlayer();

    if (r.napSkip) {
      r.napSkip = false;
      baLog(`${r.name} 被 Nap 困住，跳过一击`);
      setTimeout(beginPlayerTurn, 700);
      return;
    }

    // Simple AI: maybe use a skill, then attack
    const unused = (r.keywords || []).filter((k) => !r.usedSkills.has(k.name));
    if (unused.length && Math.random() < 0.45) {
      const sk = D.pick(unused);
      r.usedSkills.add(sk.name);
      if (sk.name === "Guard") r.guard = true;
      else if (sk.name === "Loaf") r.loaf = true;
      else if (sk.name === "Snacktime") r.hp = Math.min(r.maxHp, r.hp + r.snack);
      else if (sk.name === "Finale") r._finale = true;
      else if (sk.name === "Purrfect") r._crit = true;
      baLog(`对手用了 ${sk.name}`);
    }

    setTimeout(() => {
      if (b.over) return;
      let dmg = r.snack + Math.floor(Math.random() * 3);
      if (r._crit) { dmg = Math.round(dmg * 1.5); r._crit = false; }
      if (r._finale) { dmg *= 2; r._finale = false; }
      dealDamage(p, dmg, r.name);

      if (p.hp <= 0) {
        const next = b.playerCrew.findIndex((d, i) => i > b.pIdx && d.hp > 0);
        if (next >= 0) {
          b.pIdx = next;
          baLog(`${activePlayer().name} 上场！`);
          syncBattleUI();
          setTimeout(beginPlayerTurn, 700);
          return;
        }
      }
      if (!checkBattleEnd()) setTimeout(beginPlayerTurn, 700);
    }, 600);
  }

  function checkBattleEnd() {
    const b = state.battle;
    if (!b) return true;
    const playerAlive = b.playerCrew.some((d) => d.hp > 0);
    const rivalAlive = b.rivalCrew.some((d) => d.hp > 0);

    // Swap fainted active
    if (activePlayer().hp <= 0 && playerAlive) {
      b.pIdx = b.playerCrew.findIndex((d) => d.hp > 0);
      syncBattleUI();
    }
    if (activeRival().hp <= 0 && rivalAlive) {
      b.rIdx = b.rivalCrew.findIndex((d) => d.hp > 0);
      syncBattleUI();
    }

    if (!rivalAlive) {
      endBattle(true);
      return true;
    }
    if (!playerAlive) {
      endBattle(false);
      return true;
    }
    return false;
  }

  function endBattle(won) {
    const b = state.battle;
    b.over = true;
    stopBaAim();
    const xp = won ? 20 + Math.floor(Math.random() * 16) : 6 + Math.floor(Math.random() * 6);
    const coins = won ? 5 + Math.floor(Math.random() * 8) : 1 + Math.floor(Math.random() * 3);
    state.data.resources.xp += xp;
    state.data.resources.coins += coins;
    S.save(state.data);
    refreshResources();

    $("#battle-arena").hidden = true;
    $("#battle-result").hidden = false;
    $("#br-title").textContent = won ? "胜利！" : "惜败";
    $("#br-rewards").textContent = `XP +${xp} · 🪙 +${coins}`;
    baLog(won ? "训练胜利！" : "下次再练练瞄准");
  }

  function fleeBattle() {
    stopBaAim();
    state.battle = null;
    $("#battle-arena").hidden = true;
    $("#battle-result").hidden = true;
    renderBattleSetup();
  }

  /* Wire UI */
  function bind() {
    $$(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });
    $("#btn-scan").addEventListener("click", openScan);
    $("#scan-close").addEventListener("click", () => closeScan());
    $("#demo-btn").addEventListener("click", startDemo);
    $("#flash-toggle").addEventListener("click", toggleTorch);
    $("#mg-cancel").addEventListener("click", cancelMinigame);
    $("#mg-cancel-x").addEventListener("click", cancelMinigame);
    $("#found-continue").addEventListener("click", continueFromFound);
    $("#found-screen").addEventListener("click", (e) => {
      if (e.target.id === "found-continue" || e.target.closest(".found-card") || e.target.closest(".found-sticker-wrap")) {
        continueFromFound();
      }
    });
    $("#card-close").addEventListener("click", closeCard);
    $("#notice-close").addEventListener("click", () => { $("#map-notice").hidden = true; });
    $("#pin-preview-close").addEventListener("click", () => { $("#pin-preview").hidden = true; });
    $("#map-locate").addEventListener("click", () => tryGeolocate(true));
    $("#battle-start").addEventListener("click", startBattle);
    $("#ba-flee").addEventListener("click", fleeBattle);
    $("#br-again").addEventListener("click", () => {
      state.battle = null;
      renderBattleSetup();
    });
    setupCanDrag();
  }

  function boot() {
    bind();
    refreshResources();
    setTab("album");
    if (window.cocoSsd) {
      ensureDetector().catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
