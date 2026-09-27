/* Drum Incremental — el pad jugable de la web.
   Mismo modelo que el juego: clic IZQUIERDO = mano L, clic DERECHO = mano R; cada acierto suma
   Puntos de Ritmo (base x multiplicador del rudimento x zona x combo); un fallo rompe el ciclo
   pero el patron sigue; 3 ciclos limpios seguidos = rudimento dominado. El profesor sube una
   cara por fallo y se calma una cada 4 aciertos. Sin dependencias, sin red (salvo sus audios). */
(function () {
  "use strict";
  var root = document.getElementById("toy");
  if (!root) return;
  var S = JSON.parse(root.getAttribute("data-strings"));
  var LANG = document.documentElement.lang || "en";
  var FMT = new Intl.NumberFormat(LANG, { maximumFractionDigits: 0 });
  var FMT1 = new Intl.NumberFormat(LANG, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var BASE = root.getAttribute("data-base") || "";

  // Rudimentos (patrones y multiplicadores de data/rudiments.json del juego)
  var RUDS = [
    { name: S.r1, pattern: ["R", "L"], mult: 1.0 },
    { name: S.r2, pattern: ["R", "R", "L", "L"], mult: 4.5 },
    { name: S.r3, pattern: ["R", "L", "R", "R", "L", "R", "L", "L"], mult: 25 }
  ];
  var NEED = 3;
  var FACES = ["neutral", "annoyed", "angry", "furious"];
  var ZONES = [["center", 2.0, 0.42, 0.0, 0.33], ["mid", 1.0, 0.43, 0.33, 0.72], ["edge", 0.5, 0.15, 0.72, 0.95]];

  var $ = function (sel) { return root.querySelector(sel); };
  var stage = $(".stage"), fx = $(".fx"), steps = $(".steps"), rname = $(".rname");
  // el destello rojo del fallo dura lo que su animacion: sin esto el pad quedaba tenido para siempre
  stage.addEventListener("animationend", function () { stage.classList.remove("miss"); });
  var prEl = $(".pr .num"), comboEl = $(".combo"), cyclesEl = $(".cycles"), live = $(".sr-live");
  var bubble = $(".bubble"), face = $(".teacher img"), faceLbl = $(".teacher .face");
  var armL = $(".arm.left"), armR = $(".arm.right"), done = $(".done-card");

  var st = { ri: 0, step: 0, clean: true, cleanCycles: 0, streak: 0, pr: 0, anger: 0, good: 0, over: false, happyUntil: 0 };

  // ── audio (Web Audio; se crea con el primer gesto del visitante) ──────────────
  var ctx = null, buffers = {};
  var SOUNDS = { miss: "miss", combo: "combo", unlock: "unlock" };
  ["center", "mid", "edge"].forEach(function (z) { for (var i = 1; i <= 3; i++) SOUNDS["hit-" + z + "-" + i] = "hit-" + z + "-" + i; });
  function audioInit() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    Object.keys(SOUNDS).forEach(function (k) {
      fetch(BASE + "assets/audio/" + SOUNDS[k] + ".mp3")
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return ctx.decodeAudioData(b); })
        .then(function (buf) { buffers[k] = buf; })
        .catch(function () {});
    });
  }
  function play(k, vol) {
    if (!ctx || !buffers[k]) return;
    if (ctx.state === "suspended") ctx.resume();
    var s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buffers[k];
    g.gain.value = vol == null ? 0.9 : vol;
    s.playbackRate.value = 0.96 + Math.random() * 0.08;
    s.connect(g); g.connect(ctx.destination); s.start();
  }

  // ── pintado ─────────────────────────────────────────────────────────────────
  function renderStrip() {
    var r = RUDS[st.ri];
    rname.textContent = r.name + "  ×" + FMT1.format(r.mult).replace(/[.,]0$/, "");
    steps.innerHTML = "";
    r.pattern.forEach(function (h, i) {
      var img = document.createElement("img");
      img.src = BASE + "assets/img/click-" + (h === "L" ? "left" : "right") + ".webp";
      img.alt = h === "L" ? S.left : S.right;
      img.width = 34; img.height = 46;
      if (i === st.step) img.className = "now";
      else if (i < st.step) img.className = "done";
      steps.appendChild(img);
    });
    cyclesEl.querySelectorAll("i").forEach(function (d, i) { d.classList.toggle("on", i < st.cleanCycles); });
  }
  function renderHud() {
    prEl.textContent = FMT.format(Math.floor(st.pr));
    var c = comboMult();
    comboEl.textContent = c > 1 ? S.combo + " ×" + FMT1.format(c) : "";
  }
  function comboMult() { return st.streak >= 5 ? Math.min(1 + 0.2 * (st.streak - 4), 3) : 1; }

  function setFace(name, say) {
    face.src = BASE + "assets/img/teacher-" + name + ".webp";
    face.alt = S.faces[name];
    faceLbl.textContent = S.faces[name];
    face.classList.remove("bounce"); void face.offsetWidth; face.classList.add("bounce");
    setTimeout(function () { face.classList.remove("bounce"); }, 140);
    if (say) bubble.textContent = say;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function spawn(cls, x, y, text) {
    var el = document.createElement("div");
    el.className = cls;
    el.style.left = x + "px"; el.style.top = y + "px";
    if (text) el.textContent = text;
    fx.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function impact(zoneIdx) {
    var s = stage.getBoundingClientRect(), p = stage.querySelector(".pad").getBoundingClientRect();
    var z = ZONES[zoneIdx], rad = p.width / 2 * 0.86;
    var r = rad * (z[3] + Math.random() * (z[4] - z[3])), a = Math.random() * Math.PI * 2;
    return { x: p.left - s.left + p.width / 2 + Math.cos(a) * r, y: p.top - s.top + p.height / 2 + Math.sin(a) * r };
  }
  function rollZone() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < ZONES.length; i++) { acc += ZONES[i][2]; if (r < acc) return i; }
    return 0;
  }
  function swing(hand) {
    var arm = hand === "L" ? armL : armR;
    arm.classList.add("swing");
    stage.classList.add("hit");
    setTimeout(function () { arm.classList.remove("swing"); stage.classList.remove("hit"); }, 90);
  }

  // ── el golpe ────────────────────────────────────────────────────────────────
  function hit(hand) {
    audioInit();
    if (st.over) return;
    var r = RUDS[st.ri], expected = r.pattern[st.step];
    swing(hand);
    if (hand === expected) {
      var zi = rollZone(), z = ZONES[zi], pt = impact(zi);
      var gain = 1 * r.mult * z[1] * comboMult();
      st.pr += gain;
      play("hit-" + z[0] + "-" + (1 + Math.floor(Math.random() * 3)), zi === 2 ? 0.7 : 0.95);
      spawn("ring " + z[0], pt.x, pt.y);
      spawn("float " + z[0], pt.x, pt.y - 10, "+" + (gain < 100 ? FMT1.format(gain) : FMT.format(gain)));
      st.good++;
      if (st.anger > 0 && st.good >= 4) {
        st.anger--; st.good = 0;
        setFace(FACES[st.anger], pick(S.say.calm));
      }
    } else {
      var p2 = impact(0);
      st.clean = false; st.streak = 0; st.good = 0;
      st.anger = Math.min(3, st.anger + 1);
      play("miss", 0.6);
      spawn("ring bad", p2.x, p2.y);
      spawn("float bad", p2.x, p2.y - 10, "✗");
      stage.classList.remove("miss"); void stage.offsetWidth; stage.classList.add("miss");
      setFace(FACES[st.anger], (expected === "L" ? S.say.wantL : S.say.wantR));
    }
    st.step++;
    if (st.step >= r.pattern.length) cycleEnd();
    renderStrip(); renderHud();
  }

  function cycleEnd() {
    st.step = 0;
    if (st.clean) {
      st.cleanCycles++; st.streak++;
      if (st.streak === 5 || st.streak === 10) play("combo", 0.7);
    } else {
      st.cleanCycles = 0;
    }
    st.clean = true;
    if (st.cleanCycles >= NEED) master();
  }

  function master() {
    var s = stage.getBoundingClientRect();
    play("unlock", 0.8);
    spawn("float big", s.width / 2, s.height * 0.3, S.mastered);
    live.textContent = S.mastered + ": " + RUDS[st.ri].name;
    st.cleanCycles = 0; st.anger = 0; st.good = 0;
    if (st.ri < RUDS.length - 1) {
      st.ri++;
      setFace("happy", S.say.next.replace("{name}", RUDS[st.ri].name));
      setTimeout(function () { if (!st.over && st.anger === 0) setFace("neutral"); }, 1800);
    } else {
      st.over = true;
      setFace("happy", S.say.finale);
      done.classList.add("show");
      live.textContent = S.finale;
    }
  }

  function reset() {
    fx.textContent = "";
    st = { ri: 0, step: 0, clean: true, cleanCycles: 0, streak: 0, pr: 0, anger: 0, good: 0, over: false, happyUntil: 0 };
    done.classList.remove("show");
    setFace("neutral", S.say.start);
    renderStrip(); renderHud();
  }

  // ── entradas ────────────────────────────────────────────────────────────────
  stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  stage.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") {
      if (e.button === 0) hit("L"); else if (e.button === 2) hit("R"); else return;
    } else {
      var b = stage.getBoundingClientRect();
      hit(e.clientX - b.left < b.width / 2 ? "L" : "R");   // tactil: mitad izquierda / derecha
    }
    e.preventDefault();
  });
  root.querySelectorAll(".tap").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      btn.classList.add("pressed");
      hit(btn.getAttribute("data-hand"));
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      btn.addEventListener(ev, function () { btn.classList.remove("pressed"); });
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hit(btn.getAttribute("data-hand")); }
    });
  });
  var visible = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.35 }).observe(stage);
  }
  document.addEventListener("keydown", function (e) {
    if (!visible || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA") return;
    var k = e.key.toLowerCase();
    if (k === "f" || k === "arrowleft") { e.preventDefault(); hit("L"); }
    else if (k === "j" || k === "arrowright") { e.preventDefault(); hit("R"); }
  });
  var again = $(".again");
  if (again) again.addEventListener("click", reset);

  // ── banda sonora (Samuel) ───────────────────────────────────────────────────
  var mbtn = $(".music-btn"), music = null;
  if (mbtn) mbtn.addEventListener("click", function () {
    if (!music) { music = new Audio(BASE + "assets/audio/music.mp3"); music.loop = true; music.volume = 0.35; }
    var on = mbtn.getAttribute("aria-pressed") !== "true";
    mbtn.setAttribute("aria-pressed", on ? "true" : "false");
    mbtn.textContent = on ? S.musicOff : S.musicOn;
    if (on) music.play().catch(function () {}); else music.pause();
  });

  reset();
})();
