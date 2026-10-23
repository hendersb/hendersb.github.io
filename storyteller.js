"use strict";
// Storyteller companion: NPCs and a roller, map/image assets with a presentation mode, a journal,
// and one scenario file that holds everything.
const R = window.RULES;
const CATS = Object.keys(R.categories);
const DICE_N = R.dice.count, DICE_SIDES = R.dice.sides;
const BAND_COLORS = ["--warn", "--accent", "--good", "--profound"];
const CAT_COLOURS = { Physical: "--warn", Mental: "--teal", Emotional: "--accent", Spiritual: "--profound" };
const MODE_LABELS = { normal: "Normal", advantage: "Advantage", disadvantage: "Disadvantage" };
const MAX_IMAGE_BYTES = 1500000, MAX_IMAGE_SIDE = 1920;
const STORE_KEY = "unorthodox-storyteller";
const MAX_PLAYERS = 12;
const NPC_COLOR = "#e5484d", PLAYER_COLOR = "#3b82f6";
const PALETTE = [["Red", "#e5484d"], ["Orange", "#f97316"], ["Yellow", "#facc15"], ["Green", "#22c55e"], ["Teal", "#2dd4bf"],
  ["Blue", "#3b82f6"], ["Purple", "#a855f7"], ["Pink", "#ec4899"], ["White", "#f8fafc"], ["Black", "#111827"]];
const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) el.append(kid instanceof Node ? kid : document.createTextNode(kid ?? ""));
  return el;
}
const card = (title, ...kids) => h("div", { class: "card" }, title ? h("h3", {}, title) : "", ...kids);
const signed = (n) => (n >= 0 ? "+" : "") + n;
const randInt = (n) => 1 + Math.floor(Math.random() * n);
const toInt = (v) => Math.trunc(Number(v)) || 0;
const clampStress = (v) => Math.min(R.stress.max, Math.max(0, toInt(v)));
const stressPenalty = (stress) => Math.floor(stress / R.stress.points_per_penalty) * R.stress.penalty;
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
function outcomeFor(total) {
  const i = R.outcomes.findIndex((o) => total >= o.min && (o.max == null || total <= o.max));
  if (i < 0) throw new Error("No outcome band covers total " + total);
  return [R.outcomes[i], i];
}
const readFile = (file, as) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result); r.onerror = () => reject(r.error);
  as === "text" ? r.readAsText(file) : r.readAsDataURL(file);
});
// Large images are shrunk so a scenario file stays a manageable size.
async function imageToDataUrl(file) {
  const original = await readFile(file);
  if (file.size <= MAX_IMAGE_BYTES) return original;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i); i.onerror = () => reject(new Error("not a readable image"));
    i.src = original;
  });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
  const canvas = h("canvas", { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ---------- scenario state ----------
const state = { name: "", npcs: [], players: [], assets: [], journal: [], selectedNpc: null, selectedAsset: null, nextId: 1 };
const newId = () => state.nextId++;
let warnedStorage = false, saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(scenarioData())); }
    catch {
      if (!warnedStorage) { warnedStorage = true; toast("Too large to autosave in this browser - use Save scenario to keep your work."); }
    }
  }, 300);
}
function scenarioData() {
  return { format: "unorthodox-scenario", version: 1, name: state.name, npcs: state.npcs, players: state.players, assets: state.assets,
    journal: state.journal, nextId: state.nextId, savedAt: new Date().toISOString() };
}
const validColor = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
function applyScenario(data) {
  if (!data || typeof data !== "object") throw new Error("not a scenario file");
  state.name = String(data.name || "");
  state.npcs = (Array.isArray(data.npcs) ? data.npcs : []).filter((n) => n && Number.isFinite(n.id)).map((n) => ({
    id: n.id, name: String(n.name || "Unnamed"), notes: String(n.notes || ""),
    bases: Object.fromEntries(CATS.map((c) => [c, Math.max(0, toInt(n.bases?.[c]))])),
    stress: Object.fromEntries(CATS.map((c) => [c, clampStress(n.stress?.[c])])),
    color: validColor(n.color, NPC_COLOR), dead: !!n.dead }));
  state.players = (Array.isArray(data.players) ? data.players : []).slice(0, MAX_PLAYERS).map((p) => ({
    name: String(p?.name || ""), color: validColor(p?.color, PLAYER_COLOR), dead: !!p?.dead }));
  state.assets = (Array.isArray(data.assets) ? data.assets : []).filter((a) => a && Number.isFinite(a.id) && typeof a.image === "string").map((a) => ({
    id: a.id, title: String(a.title || "Untitled"), text: String(a.text || ""), image: a.image, showText: !!a.showText,
    tokens: Object.fromEntries(Object.entries(a.tokens || {}).filter(([, p]) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(([k, p]) => [k, { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }])) }));
  state.journal = (Array.isArray(data.journal) ? data.journal : []).filter((e) => e && Number.isFinite(e.id)).map((e) => ({
    id: e.id, date: e.date || new Date().toISOString(), title: String(e.title || "Untitled"), text: String(e.text || "") }));
  const ids = [...state.npcs, ...state.assets, ...state.journal].map((x) => x.id);
  state.nextId = Math.max(Number(data.nextId) || 1, ...ids.map((i) => i + 1), 1);
  state.selectedNpc = state.npcs[0]?.id ?? null;
  state.selectedAsset = state.assets[0]?.id ?? null;
}
const npc = () => state.npcs.find((n) => n.id === state.selectedNpc) || null;
const asset = () => state.assets.find((a) => a.id === state.selectedAsset) || null;
const handle = (i) => "P" + (i + 1);
const textOn = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
};
// Everything that can have a piece on a map: NPCs first, then the numbered players.
function characters() {
  const initials = (s) => (s.split(/\s+/).filter(Boolean).map((p) => p[0]).join("").slice(0, 2) || "?").toUpperCase();
  return [
    ...state.npcs.map((n) => ({ key: "n" + n.id, group: "NPCs", label: n.name || "Unnamed", short: initials(n.name || ""), obj: n, color: n.color })),
    ...state.players.map((p, i) => ({ key: "p" + i, group: "Players", label: handle(i) + (p.name ? " - " + p.name : ""), short: handle(i), obj: p, color: p.color })),
  ];
}

// ---------- NPCs and roller ----------
const Encounter = (() => {
  const w = { base: {} };
  const rs = { category: CATS[0], mode: "normal", mod: 0 };
  let rolling = false;

  function build(root) {
    w.list = h("div", { class: "jlist" });
    w.empty = h("div", { class: "muted" }, "No NPCs yet. Add one to begin.");
    w.name = h("input", { type: "text", placeholder: "NPC name", oninput: () => { const n = npc(); if (n) { n.name = w.name.value; renderList(); renderRoller(); persist(); } } });
    for (const c of CATS) {
      w.base[c] = h("input", { type: "number", min: 0, step: 1, "aria-label": c + " base", oninput: () => {
        const n = npc(); if (!n) return;
        n.bases[c] = Math.max(0, toInt(w.base[c].value)); renderRoller(); persist(); } });
    }
    w.stress = {};
    const bump = (c, d) => { const n = npc(); if (n) { n.stress[c] = clampStress(n.stress[c] + d); refresh(); persist(); } };
    for (const c of CATS) {
      w.stress[c] = h("input", { type: "number", min: 0, max: R.stress.max, step: 1, "aria-label": c + " stress", oninput: () => {
        const n = npc(); if (!n) return;
        n.stress[c] = clampStress(w.stress[c].value); renderList(); renderRoller(); persist(); },
        onchange: () => { const n = npc(); if (n) w.stress[c].value = n.stress[c]; } });
    }
    w.stressRows = CATS.map((c) => h("div", { class: "row" }, h("b", { class: "cat", style: `color:var(${CAT_COLOURS[c]})` }, c),
      h("button", { class: "btn outline step", title: "Remove 1 stress", "aria-label": "Remove " + c + " stress", onclick: () => bump(c, -1) }, "\u2212"),
      w.stress[c],
      h("button", { class: "btn outline step", title: "Add 1 stress", "aria-label": "Add " + c + " stress", onclick: () => bump(c, 1) }, "+"),
      (w.penalty ??= {})[c] = h("span", { class: "muted small" })));
    w.notes = h("textarea", { rows: 6, placeholder: "Notes: personality, secrets, tactics...", oninput: () => { const n = npc(); if (n) { n.notes = w.notes.value; persist(); } } });
    w.editor = card("Selected NPC", h("label", { class: "f" }, "Name", w.name),
      h("div", { class: "f" }, "Base categories"),
      ...CATS.map((c) => h("div", { class: "row" }, h("b", { class: "cat", style: `color:var(${CAT_COLOURS[c]})` }, c), w.base[c])),
      h("div", { class: "f" }, `Stress (max ${R.stress.max}; every ${R.stress.points_per_penalty} points is -${R.stress.penalty} to rolls in that category)`),
      ...w.stressRows,
      h("div", { class: "row" }, h("button", { class: "btn outline", onclick: () => {
        const n = npc(); if (!n) return;
        for (const c of CATS) n.stress[c] = 0;
        refresh(); persist(); } }, "Clear all stress")),
      h("label", { class: "f" }, "Notes", w.notes),
      h("div", { class: "row" }, h("button", { class: "btn outline", onclick: duplicate }, "Duplicate"),
        h("button", { class: "btn outline", onclick: remove }, "Delete")));

    w.catRadio = h("div", { class: "row" });
    w.mod = h("input", { type: "number", step: 1, value: 0, "aria-label": "Roll modifier", oninput: () => { rs.mod = toInt(w.mod.value); renderRoller(); } });
    w.modeRadio = h("div", { class: "row" }, Object.entries(MODE_LABELS).map(([v, label]) =>
      h("label", {}, h("input", { type: "radio", name: "mode", value: v, checked: rs.mode === v, onchange: () => { rs.mode = v; renderRoller(); } }), label)));
    w.who = h("div", { style: "font-size:20px;font-weight:bold" });
    w.preview = h("div", { class: "preview" });
    w.dice = h("div", { class: "dice" }); w.total = h("div", { class: "total" }, "-");
    w.outcome = h("div", { class: "outcome" }, "Roll the dice to begin");
    w.breakdown = h("div", { class: "small", style: "text-align:left" });
    w.roll = h("button", { class: "btn roll", onclick: startRoll });
    w.history = h("div", { class: "history" });

    root.append(h("div", { class: "cols" },
      h("div", { class: "col" }, card("NPCs (click to select)", w.list, w.empty,
        h("div", { class: "row" }, h("button", { class: "btn", onclick: add }, "Add NPC"))), Players.el, w.editor),
      h("div", { class: "col wide" }, h("h2", {}, "Roll for NPC"), card("Selected", w.who, w.catRadio,
        h("div", { class: "row" }, h("span", { class: "muted" }, "Modifier"), w.mod), w.modeRadio, w.preview),
        card("Result", h("div", { class: "center" }, w.dice, w.total, w.outcome), w.breakdown), w.roll),
      h("div", { class: "col" }, card("", h("div", { class: "row", style: "justify-content:space-between" }, h("b", {}, "History (newest first)"),
        h("button", { class: "btn outline", onclick: () => w.history.replaceChildren() }, "Clear")), w.history))));
    refresh();
  }

  function select(id) { state.selectedNpc = id; refresh(); }
  function add() {
    const n = { id: newId(), name: "New NPC", notes: "", bases: Object.fromEntries(CATS.map((c) => [c, 0])),
      stress: Object.fromEntries(CATS.map((c) => [c, 0])), color: NPC_COLOR, dead: false };
    state.npcs.push(n); persist(); select(n.id);
    w.name.focus(); w.name.select();
  }
  function duplicate() {
    const n = npc(); if (!n) return;
    const copy = { ...n, id: newId(), name: n.name + " (copy)", bases: { ...n.bases }, stress: { ...n.stress } };
    state.npcs.push(copy); persist(); select(copy.id);
  }
  function remove() {
    const n = npc();
    if (!n || !confirm(`Delete ${n.name}?`)) return;
    const i = state.npcs.indexOf(n);
    state.npcs.splice(i, 1);
    state.selectedNpc = (state.npcs[i] || state.npcs[i - 1])?.id ?? null;
    persist(); refresh();
  }
  function renderList() {
    w.list.replaceChildren(...state.npcs.map((n) => h("button", { class: "jentry" + (n.id === state.selectedNpc ? " sel" : ""), onclick: () => select(n.id) },
      h("b", {}, n.name || "Unnamed"),
      h("span", { class: "muted small" }, CATS.map((c) => `${c[0]} ${n.bases[c]}`).join("   ")),
      h("span", { class: "muted small" }, "Stress: " + CATS.map((c) => `${c[0]} ${n.stress[c]}`).join("   ")))));
    w.empty.hidden = state.npcs.length > 0;
  }
  function renderEditor() {
    const n = npc();
    w.editor.hidden = !n;
    if (!n) return;
    w.name.value = n.name; w.notes.value = n.notes;
    for (const c of CATS) {
      w.base[c].value = n.bases[c];
      if (document.activeElement !== w.stress[c]) w.stress[c].value = n.stress[c];
      const p = stressPenalty(n.stress[c]);
      w.penalty[c].textContent = p ? `-${p} to rolls` : "";
    }
  }
  function renderRoller() {
    const n = npc();
    w.who.textContent = n ? n.name || "Unnamed" : "Select or add an NPC";
    w.catRadio.replaceChildren(...CATS.map((c) => h("label", {}, h("input", { type: "radio", name: "cat", checked: rs.category === c,
      disabled: !n, onchange: () => { rs.category = c; renderRoller(); } }), n ? `${c} (${n.bases[c]}${n.stress[c] ? `, stress ${n.stress[c]}` : ""})` : c)));
    w.roll.disabled = !n || rolling;
    const label = diceLabel(rs.mode);
    w.roll.textContent = "ROLL " + label;
    if (!n) { w.preview.textContent = "Add an NPC to roll for them."; return; }
    const parts = parts_(n);
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    w.preview.innerHTML = "";
    w.preview.append(h("b", {}, `${label} ${signed(sum)}`), h("br"), Object.entries(parts).map(([k, v]) => `${k} ${signed(v)}`).join("  "));
  }
  const parts_ = (n) => {
    const p = { [rs.category]: n.bases[rs.category] };
    const penalty = stressPenalty(n.stress[rs.category]);
    if (penalty) p["Stress penalty"] = -penalty;
    if (rs.mod) p.Modifier = rs.mod;
    return p;
  };
  function diceLabel(mode) {
    return mode === "normal" ? `${DICE_N}d${DICE_SIDES}` : `${DICE_N + 1}d${DICE_SIDES} keep ${mode === "advantage" ? "best" : "worst"} ${DICE_N}`;
  }
  function drawDice(dice, dropped = []) {
    w.dice.replaceChildren(...dice.map((d) => h("div", { class: "die" }, d)),
      ...dropped.map((d) => h("div", { class: "die dropped", title: "Dropped" }, d)));
  }
  function rollDice() {
    const extra = rs.mode === "normal" ? 0 : 1;
    const rolled = Array.from({ length: DICE_N + extra }, () => randInt(DICE_SIDES));
    let dice = rolled, dropped = [];
    if (extra) {
      const at = rolled.indexOf(rs.mode === "advantage" ? Math.min(...rolled) : Math.max(...rolled));
      dice = rolled.filter((_, i) => i !== at);
      dropped = [rolled[at]];
    }
    return { dice, dropped };
  }
  async function startRoll() {
    const n = npc();
    if (rolling || !n) return;
    rolling = true; w.roll.disabled = true;
    try {
      const count = DICE_N + (rs.mode === "normal" ? 0 : 1);
      for (let i = 0; i < 8; i++) {
        drawDice(Array.from({ length: count }, () => randInt(DICE_SIDES)));
        await new Promise((r) => setTimeout(r, 100));
      }
      const { dice, dropped } = rollDice();
      const all = { dice: dice.reduce((a, b) => a + b, 0), ...parts_(n) };
      // Three of a kind always totals 20, whatever the modifiers.
      if (dice.length > 1 && dice.every((d) => d === dice[0])) all["Triple (total fixed at 20)"] = 20 - Object.values(all).reduce((a, b) => a + b, 0);
      const total = Object.values(all).reduce((a, b) => a + b, 0);
      const [outcome, idx] = outcomeFor(total);
      show({ dice, dropped, all, total, outcome, idx, who: n.name, cat: rs.category, mode: rs.mode });
    } finally { rolling = false; renderRoller(); }
  }
  function show(r) {
    drawDice(r.dice, r.dropped);
    const colour = `var(${BAND_COLORS[Math.min(r.idx, BAND_COLORS.length - 1)]})`;
    w.total.textContent = r.total; w.total.style.color = colour;
    w.outcome.textContent = `${r.outcome.name} - ${r.outcome.frame}`; w.outcome.style.color = colour;
    const dieText = `${r.dice.join(" + ")}${r.dropped.length ? `, dropped ${r.dropped[0]}` : ""}`;
    w.breakdown.replaceChildren(...Object.entries(r.all).flatMap(([k, v]) => [
      k === "dice" ? h("span", {}, `${diceLabel(r.mode)} (${dieText}): `) : h("span", {}, `${k}: `), h("b", {}, k === "dice" ? v : signed(v)), h("br")]));
    const tag = r.mode !== "normal" ? ` [${r.mode}]` : "";
    w.history.prepend(h("div", { class: "entry" }, h("div", {}, `${r.who} - ${r.cat}${tag}: ${r.total} - ${r.outcome.name} (${r.outcome.frame})`),
      h("div", { class: "muted small" }, Object.entries(r.all).map(([k, v]) => k === "dice" ? `Dice ${r.dice.join("+")} = ${v}` : `${k} ${signed(v)}`).join("  |  "))));
  }
  function refresh() { renderList(); renderEditor(); renderRoller(); }
  return { build, refresh };
})();

// ---------- players ----------
const Players = (() => {
  const count = h("input", { type: "number", min: 0, max: MAX_PLAYERS, step: 1, "aria-label": "Number of players",
    onchange: () => setCount(count.value) });
  const list = h("div");
  const el = card("Players", h("div", { class: "row" }, h("span", { class: "muted" }, "Number of players"), count),
    list, h("div", { class: "muted small" }, "Players get handles P1, P2... Names are optional."));
  function setCount(v) {
    const n = Math.min(MAX_PLAYERS, Math.max(0, toInt(v)));
    while (state.players.length < n) state.players.push({ name: "", color: PLAYER_COLOR, dead: false });
    state.players.length = n;
    persist(); refresh();
  }
  function refresh() {
    count.value = state.players.length;
    list.replaceChildren(...state.players.map((p, i) => h("div", { class: "row" }, h("b", { class: "cat" }, handle(i)),
      h("input", { type: "text", placeholder: "Name (optional)", value: p.name, "aria-label": handle(i) + " name",
        oninput: (e) => { p.name = e.target.value; persist(); } }))));
  }
  return { el, refresh };
})();

// ---------- maps & images ----------
const Assets = (() => {
  const w = {};
  function build(root) {
    w.list = h("div", { class: "alist" });
    w.empty = h("div", { class: "muted" }, "No images yet. Upload a map or picture.");
    w.upload = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: upload });
    w.title = h("input", { type: "text", placeholder: "Title", oninput: () => { const a = asset(); if (a) { a.title = w.title.value; renderList(); persist(); } } });
    w.text = h("textarea", { rows: 8, placeholder: "Notes for this map or image...", oninput: () => { const a = asset(); if (a) { a.text = w.text.value; persist(); } } });
    w.showText = h("input", { type: "checkbox", onchange: () => { const a = asset(); if (a) { a.showText = w.showText.checked; persist(); } } });
    w.img = h("img", { class: "aprev", alt: "" });
    w.editor = card("Selected image", w.img, h("label", { class: "f" }, "Title", w.title),
      h("label", { class: "f" }, "Text", w.text),
      h("label", { class: "f" }, w.showText, "Also show this text to players in presentation mode"),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => Present.start(state.selectedAsset) }, "Present"),
        h("button", { class: "btn outline", onclick: () => move(-1) }, "Move up"),
        h("button", { class: "btn outline", onclick: () => move(1) }, "Move down"),
        h("button", { class: "btn outline", onclick: remove }, "Delete")));
    root.append(h("div", { class: "cols" },
      h("div", { class: "col" }, card("Maps & images", w.list, w.empty, w.upload, h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => w.upload.click() }, "Upload images"),
        h("button", { class: "btn outline", onclick: () => Present.start(state.selectedAsset ?? state.assets[0]?.id) }, "Presentation mode")))),
      h("div", { class: "col wide" }, w.editor)));
    refresh();
  }
  async function upload() {
    const files = [...w.upload.files];
    w.upload.value = "";
    for (const f of files) {
      try {
        if (!f.type.startsWith("image/")) throw new Error("not an image");
        const a = { id: newId(), title: f.name.replace(/\.[^.]+$/, ""), text: "", image: await imageToDataUrl(f), showText: false, tokens: {} };
        state.assets.push(a); state.selectedAsset = a.id;
      } catch (e) { toast(`Could not add ${f.name}: ${e.message}`); }
    }
    persist(); refresh();
  }
  function move(d) {
    const i = state.assets.findIndex((a) => a.id === state.selectedAsset), j = i + d;
    if (i < 0 || j < 0 || j >= state.assets.length) return;
    [state.assets[i], state.assets[j]] = [state.assets[j], state.assets[i]];
    persist(); refresh();
  }
  function remove() {
    const a = asset();
    if (!a || !confirm(`Delete "${a.title}"?`)) return;
    const i = state.assets.indexOf(a);
    state.assets.splice(i, 1);
    state.selectedAsset = (state.assets[i] || state.assets[i - 1])?.id ?? null;
    persist(); refresh();
  }
  function renderList() {
    w.list.replaceChildren(...state.assets.map((a, i) => h("button", { class: "jentry aitem" + (a.id === state.selectedAsset ? " sel" : ""),
      onclick: () => { state.selectedAsset = a.id; refresh(); } },
      h("img", { src: a.image, alt: "" }), h("b", {}, `${i + 1}. ${a.title || "Untitled"}`))));
    w.empty.hidden = state.assets.length > 0;
  }
  function refresh() {
    renderList();
    const a = asset();
    w.editor.hidden = !a;
    if (!a) return;
    w.img.src = a.image; w.title.value = a.title; w.text.value = a.text; w.showText.checked = a.showText;
  }
  return { build, refresh };
})();

// ---------- presentation ----------
const Present = (() => {
  const box = $("present");
  let index = 0, sel = null;
  const img = h("img", { alt: "", draggable: false });
  const tokens = h("div", { class: "ptokens" });
  const wrap = h("div", { class: "pwrap" }, img, tokens);
  const caption = h("div", { class: "pcap" });
  const stage = h("div", { class: "pstage" }, wrap, caption);
  const panel = h("div", { class: "ppanel" });
  const reopen = h("button", { class: "btn outline preopen", title: "Show control panel (H)", onclick: () => setPanel(true) }, "Panel");
  box.append(stage, panel, reopen);

  // Clicking the empty area around the map moves between images; clicking the map itself clears the highlight.
  stage.addEventListener("click", (e) => {
    if (e.target === stage) go(e.clientX - stage.getBoundingClientRect().left < stage.clientWidth / 3 ? -1 : 1);
    else if (e.target === img) selectKey(null, false);
  });
  document.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "Escape") stop();
    else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key === "h" || e.key === "H") setPanel(box.classList.contains("nopanel"));
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !box.hidden) stop(); });

  function setPanel(show) {
    box.classList.toggle("nopanel", !show);
    panel.hidden = !show; reopen.hidden = show;
  }
  const current = () => state.assets[index];
  function drawStage() {
    const a = current();
    img.src = a.image;
    caption.textContent = a.showText ? [a.title, a.text].filter(Boolean).join("\n") : "";
    caption.hidden = !a.showText;
    state.selectedAsset = a.id;
    drawTokens(); drawPanel();
  }
  function drawTokens() {
    const byKey = new Map(characters().map((c) => [c.key, c]));
    tokens.replaceChildren(...Object.entries(current().tokens).filter(([k]) => byKey.has(k)).map(([k, pos]) => tokenEl(byKey.get(k), pos)));
  }
  function tokenEl(c, pos) {
    const dead = c.obj.dead;
    const el = h("div", { class: "ptoken" + (dead ? " dead" : "") + (c.key === sel ? " hl" : ""), title: c.label,
      style: `left:${pos.x * 100}%;top:${pos.y * 100}%;--c:${c.color};--t:${textOn(c.color)}` },
      h("div", { class: "pdot" }, dead ? "\u271D" : c.short), h("div", { class: "plab" }, c.label));
    el.dataset.key = c.key;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      selectKey(c.key, false);
      const move = (ev) => {
        const r = wrap.getBoundingClientRect();
        pos.x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        pos.y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        el.style.left = pos.x * 100 + "%"; el.style.top = pos.y * 100 + "%";
      };
      const up = () => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
        persist();
      };
      el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
    return el;
  }
  // Choosing a character highlights its piece; one not yet on this map is dropped near the middle.
  function selectKey(key, place) {
    sel = key;
    const a = current();
    if (place && key && !a.tokens[key]) {
      const n = Object.keys(a.tokens).length;
      a.tokens[key] = { x: 0.5 + ((n % 5) - 2) * 0.07, y: Math.min(0.9, 0.5 + Math.floor(n / 5) * 0.08) };
      persist(); drawTokens();
    }
    for (const t of tokens.children) t.classList.toggle("hl", t.dataset.key === key);
    drawPanel();
  }
  function changeLook(c, color, dead) {
    if (color) c.obj.color = color;
    c.obj.dead = dead;
    persist(); drawTokens(); drawPanel();
  }
  function controls(c, onMap) {
    const swatches = PALETTE.map(([name, hex]) => h("button", { class: "pcol" + (!c.obj.dead && c.obj.color === hex ? " cur" : ""),
      style: `background:${hex}`, title: name, "aria-label": "Colour " + name, onclick: () => changeLook(c, hex, false) }));
    const cross = h("button", { class: "pcol pcross" + (c.obj.dead ? " cur" : ""), title: "Dead (cross)", "aria-label": "Dead cross",
      onclick: () => changeLook(c, null, true) }, "\u271D");
    return h("div", { class: "pctl" }, h("div", { class: "pcols" }, swatches, cross),
      onMap ? h("button", { class: "btn outline small", onclick: () => { delete current().tokens[c.key]; persist(); drawTokens(); drawPanel(); } }, "Remove from map") : "");
  }
  function drawPanel() {
    const a = current(), cs = characters();
    const group = (name, empty) => {
      const rows = cs.filter((c) => c.group === name).map((c) => {
        const selected = c.key === sel;
        const row = h("button", { class: "prow" + (selected ? " sel" : ""), onclick: () => selectKey(c.key, true) },
          h("span", { class: "psw" + (c.obj.dead ? " x" : ""), style: `--c:${c.color}` }, c.obj.dead ? "\u271D" : ""),
          h("span", { class: "plabel" }, c.label), h("span", { class: "muted small" }, a.tokens[c.key] ? "on map" : ""));
        return h("div", {}, row, selected ? controls(c, !!a.tokens[c.key]) : "");
      });
      return [h("h4", {}, name), ...(rows.length ? rows : [h("div", { class: "muted small" }, empty)])];
    };
    panel.replaceChildren(
      h("div", { class: "row", style: "justify-content:space-between" }, h("b", {}, "Presentation"),
        h("div", { class: "row", style: "margin:0" },
          h("button", { class: "btn outline small", title: "Hide this panel (H) so only the map shows", onclick: () => setPanel(false) }, "Hide"),
          h("button", { class: "btn outline small", title: "Exit presentation (Esc)", onclick: stop }, "Exit"))),
      h("div", { class: "row" }, h("button", { class: "btn outline small", onclick: () => go(-1) }, "\u25C0"),
        h("span", { class: "plabel small" }, `${index + 1} / ${state.assets.length}  ${a.title}`),
        h("button", { class: "btn outline small", onclick: () => go(1) }, "\u25B6")),
      h("div", { class: "muted small" }, "Click a character to highlight its piece (it is placed if missing). Drag pieces on the map."),
      ...group("NPCs", "No NPCs yet."), ...group("Players", "Set the number of players on the NPCs & Roller tab."));
  }
  function go(d) {
    const n = state.assets.length;
    if (!n) return;
    index = Math.min(n - 1, Math.max(0, index + d));
    drawStage();
  }
  function start(id) {
    if (!state.assets.length) return toast("Upload an image first.");
    index = Math.max(0, state.assets.findIndex((a) => a.id === id));
    setPanel(true); drawStage();
    box.hidden = false;
    box.requestFullscreen?.().catch(() => {});
  }
  function stop() {
    box.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    Assets.refresh();
  }
  return { start };
})();

// ---------- journal ----------
const Journal = (() => {
  let current = null; // entry being edited, or null for a new one
  const w = {};
  const stamp = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  function build(root) {
    w.title = h("input", { type: "text", placeholder: "Heading" });
    w.body = h("textarea", { rows: 16, placeholder: "Write your notes here..." });
    w.meta = h("div", { class: "muted small" });
    w.list = h("div", { class: "jlist" });
    w.del = h("button", { class: "btn outline", onclick: remove }, "Delete");
    root.append(h("div", { class: "cols jcols" },
      h("div", { class: "col wide" }, card("Journal entry", w.meta, w.title, w.body,
        h("div", { class: "row" }, h("button", { class: "btn", onclick: save }, "Save entry"),
          h("button", { class: "btn outline", onclick: () => edit(null) }, "New entry"), w.del))),
      h("div", { class: "col" }, card("Entries (newest first)", w.list))));
    edit(null);
  }
  function edit(e) {
    current = e;
    w.title.value = e ? e.title : ""; w.body.value = e ? e.text : "";
    w.meta.textContent = e ? `Entry #${e.id} - ${stamp(e.date)}` : "New entry";
    w.del.hidden = !e;
    render();
  }
  function save() {
    const title = w.title.value.trim(), text = w.body.value.trim();
    if (!title && !text) return toast("Nothing to save");
    if (current) { current.title = title || "Untitled"; current.text = text; }
    else {
      current = { id: newId(), date: new Date().toISOString(), title: title || "Untitled", text };
      state.journal.push(current);
    }
    persist(); edit(current); toast("Entry saved");
  }
  function remove() {
    if (!current || !confirm(`Delete entry #${current.id}?`)) return;
    state.journal = state.journal.filter((e) => e !== current);
    persist(); edit(null);
  }
  function render() {
    const sorted = [...state.journal].sort((a, b) => b.id - a.id);
    w.list.replaceChildren(...(sorted.length ? sorted.map((e) => h("button", { class: "jentry" + (e === current ? " sel" : ""), onclick: () => edit(e) },
      h("b", {}, `#${e.id}  ${e.title}`), h("span", { class: "muted small" }, stamp(e.date)))) : [h("div", { class: "muted" }, "No entries yet.")]));
  }
  return { build, refresh: () => edit(null) };
})();

// ---------- scenario file ----------
function saveScenario() {
  const data = scenarioData();
  const name = (state.name || "scenario").replace(/[^\w\- ]+/g, "").trim() || "scenario";
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })), download: name + ".scenario.json" });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function loadScenario() {
  const input = h("input", { type: "file", accept: ".json", onchange: async () => {
    try {
      const data = JSON.parse((await readFile(input.files[0], "text")).replace(/^\uFEFF/, ""));
      if (data.format !== "unorthodox-scenario") throw new Error("not an Unorthodox scenario file");
      applyScenario(data);
      refreshAll(); persist();
      toast("Loaded " + (state.name || "scenario"));
    } catch (e) { toast("Could not load: " + e.message); }
  } });
  input.click();
}
function refreshAll() {
  $("s-name").value = state.name;
  Players.refresh(); Encounter.refresh(); Assets.refresh(); Journal.refresh();
}

// ---------- start up and tabs ----------
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (saved) applyScenario(saved);
} catch { /* ignore a damaged autosave */ }
Encounter.build($("page-encounter"));
Players.refresh();
Assets.build($("page-assets"));
Journal.build($("page-journal"));
$("s-name").value = state.name;
$("s-name").oninput = () => { state.name = $("s-name").value; persist(); };
$("s-save").onclick = saveScenario;
$("s-load").onclick = loadScenario;
const TABS = ["encounter", "assets", "journal"];
for (const t of TABS) {
  $("tab-" + t).onclick = () => {
    for (const o of TABS) { $("page-" + o).hidden = o !== t; $("tab-" + o).classList.toggle("active", o === t); }
  };
}
