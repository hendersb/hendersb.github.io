"use strict";
// Static port of the Unorthodox rules engine, character creator and roller.
const R = window.RULES;
const TALENTS = Object.values(R.categories).flat();
const DICE_N = R.dice.count, DICE_SIDES = R.dice.sides;
const BAND_COLORS = ["--warn", "--accent", "--good", "--profound"];
const CAT_COLOURS = { Physical: "--warn", Mental: "--teal", Emotional: "--accent", Spiritual: "--profound" };
const LONG_FIELDS = ["Character Description", "Distinguishing Features"];
const MAX_PHOTO = 1500000;
const MODE_LABELS = { normal: "Normal", advantage: "Advantage", disadvantage: "Disadvantage" };
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
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const signed = (n) => (n >= 0 ? "+" : "") + n;
const randInt = (n) => 1 + Math.floor(Math.random() * n);
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}
function download(obj, name) {
  const data = { ...obj, journal: Journal.entries };
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}
function pickJson(onChar) {
  const input = h("input", { type: "file", accept: ".json", onchange: async () => {
    try {
      const data = JSON.parse((await input.files[0].text()).replace(/^\uFEFF/, ""));
      if (typeof data !== "object" || data === null) throw new Error("not a character file");
      onChar(normalizeCharacter(data));
      if (Array.isArray(data.journal)) Journal.load(data.journal);
      toast("Loaded " + (data.name || "character"));
    } catch (e) { toast("Could not load: " + e.message); }
  } });
  input.click();
}

// ---------- tooltips (text comes from help.yaml) ----------
const HELP = window.HELP || {};
const HELP_VARS = {
  work_bonus: R.modifiers.motivation_work.value, work_stress: R.modifiers.motivation_work.stress,
  gifting_bonus: R.creation.gifting_bonus, gifting_bonus_count: R.creation.gifting_bonus_count,
  works_per_motivation: 4, points_per_penalty: R.stress.points_per_penalty, penalty: R.stress.penalty,
  max_stress: R.stress.max, xp_bonus: R.experience.points_per_bonus,
};
const fill = (t) => String(t ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in HELP_VARS ? HELP_VARS[k] : m));
const paras = (...texts) => texts.filter(Boolean).map((t) => h("p", {}, fill(t)));
// Each builder returns {title, summary, detail: () => Node[]} or null when no text exists yet.
const helpFor = {
  talent(t) {
    const e = HELP.talents?.[t];
    return e?.summary ? { title: t, summary: fill(e.summary), detail: e.detail && e.detail !== e.summary ? () => paras(e.detail) : null } : null;
  },
  gifting(g) {
    const e = HELP.giftings?.[g];
    if (!e?.summary) return null;
    return { title: g, summary: fill(e.summary), detail: () => [...paras(e.detail !== e.summary ? e.detail : "", e.use),
      ...Object.entries(e.levels || {}).map(([lvl, txt]) => h("p", {}, h("b", {}, lvl + ": "), fill(txt)))] };
  },
  work(motivation, work) {
    const m = HELP.motivations?.[motivation], e = m?.works?.[work];
    if (!e?.summary) return null;
    const talent = R.motivations[motivation].works[work];
    return { title: `${work} (+${HELP_VARS.work_bonus} ${talent})`, summary: fill(e.summary),
      detail: () => [...paras(m.intro), h("ul", {}, (e.uses || []).map((u) => h("li", {}, fill(u))))] };
  },
  concept(name) {
    const e = HELP.concepts?.[name];
    return e?.summary ? { title: name, summary: fill(e.summary), detail: e.detail ? () => paras(e.detail) : null } : null;
  },
};
const Tip = (() => {
  const box = h("div", { id: "tip", hidden: true });
  document.body.append(box);
  let target = null, content = null, pinned = false, timer;
  function render() {
    box.replaceChildren(h("b", {}, content.title));
    if (!(pinned && content.detail)) box.append(h("div", {}, content.summary)); // the detail already repeats the summary
    if (!content.detail) return;
    if (pinned) box.append(h("div", { class: "tip-detail" }, content.detail()));
    else box.append(h("a", { class: "tip-more", href: "#", onclick: (e) => { e.preventDefault(); pinned = true; render(); place(); } }, "More..."));
  }
  function place() {
    const r = target.getBoundingClientRect(), b = box.getBoundingClientRect(), pad = 8;
    let x = r.right + pad, y = r.top;
    if (x + b.width > innerWidth - pad) x = Math.max(pad, r.left - b.width - pad);
    if (x < pad || (r.left < b.width + pad && r.right + b.width + pad > innerWidth)) { x = Math.max(pad, r.left); y = r.bottom + 4; }
    y = Math.min(y, innerHeight - b.height - pad);
    box.style.left = Math.max(pad, x) + "px"; box.style.top = Math.max(pad, y) + "px";
  }
  function show(el, c) {
    clearTimeout(timer);
    if (pinned && el !== target) pinned = false;
    target = el; content = c; box.hidden = false; render(); place();
  }
  function hide() { if (pinned) return; clearTimeout(timer); box.hidden = true; }
  function leave() { clearTimeout(timer); timer = setTimeout(hide, 180); }
  function close() { pinned = false; clearTimeout(timer); box.hidden = true; }
  box.addEventListener("mouseenter", () => clearTimeout(timer));
  box.addEventListener("mouseleave", leave);
  document.addEventListener("mousedown", (e) => { if (!box.hidden && !box.contains(e.target) && !target?.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  function attach(el, getContent) {
    const on = () => { const c = getContent(); if (c) show(el, c); };
    el.addEventListener("mouseenter", on); el.addEventListener("focus", on);
    el.addEventListener("mouseleave", leave); el.addEventListener("blur", leave);
    return el;
  }
  return { attach, close };
})();

// A styled dropdown so each option can carry its own hover tooltip (native <option>s cannot).
function dropdown(onchange) {
  let opts = [], value = "", open = false;
  const text = h("span", {});
  const btn = h("button", { type: "button", class: "dd-btn", onclick: () => toggle(!open) }, text, h("span", { class: "dd-arrow" }, "\u25BE"));
  const list = h("div", { class: "dd-list", role: "listbox", hidden: true });
  const el = h("div", { class: "dd" }, btn, list);
  function toggle(v) { open = v && !btn.disabled; list.hidden = !open; if (!open) Tip.close(); }
  function draw() {
    const cur = opts.find((o) => o.value === value) || opts[0];
    text.textContent = cur ? cur.label : "";
    list.replaceChildren(...opts.map((o) => {
      const item = h("div", { class: "dd-item" + (o.value === value ? " sel" : ""), role: "option", tabindex: 0,
        onclick: () => { value = o.value; draw(); toggle(false); onchange(); },
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); item.click(); } } }, o.label);
      return o.tip ? Tip.attach(item, o.tip) : item;
    }));
  }
  document.addEventListener("mousedown", (e) => { if (open && !el.contains(e.target) && !$("tip").contains(e.target)) toggle(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(false); });
  return {
    el,
    get value() { return value; },
    set value(v) { value = v; draw(); },
    get disabled() { return btn.disabled; },
    set disabled(v) { btn.disabled = v; if (v) toggle(false); },
    setOptions(list_) { opts = list_; if (!opts.some((o) => o.value === value)) value = opts[0]?.value ?? ""; draw(); },
  };
}

// A radio list whose options can carry hover tooltips.
function radioGroup(name, onchange) {
  let opts = [], value = "", disabled = false;
  const el = h("div", { class: "rg" });
  function draw() {
    el.replaceChildren(...opts.map((o) => {
      const inp = h("input", { type: "radio", name, checked: o.value === value, disabled,
        onchange: () => { value = o.value; onchange(); } });
      const lab = h("label", { class: disabled ? "disabled" : "" }, inp, o.label);
      return o.tip ? Tip.attach(lab, o.tip) : lab;
    }));
  }
  return {
    el,
    get value() { return value; },
    set value(v) { value = v; draw(); },
    get disabled() { return disabled; },
    set disabled(v) { disabled = v; draw(); },
    setOptions(list) { opts = list; if (!opts.some((o) => o.value === value)) value = opts[0]?.value ?? ""; draw(); },
  };
}

// ---------- rules / character ----------
const categoryOf = (t) => Object.keys(R.categories).find((c) => R.categories[c].includes(t));
function outcomeFor(total) {
  const i = R.outcomes.findIndex((o) => total >= o.min && (o.max == null || total <= o.max));
  if (i < 0) throw new Error("No outcome band covers total " + total);
  return [R.outcomes[i], i];
}
const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
function newCharacter() {
  return {
    name: "", calling: "", motivation: "",
    narrative: Object.fromEntries(R.creation.narrative_fields.map((f) => [f, ""])),
    category_bases: zero(Object.keys(R.categories)), talents: zero(TALENTS),
    giftings: zero(Object.keys(R.giftings)), background_skills: [], goal: "", allegiance: "",
    flaws: [], inventory: [], inventory_points: [], upgrades: zero(TALENTS), stress: zero(Object.keys(R.categories)), experience: zero(Object.keys(R.categories)), photo: "", notes: {},
  };
}
// Saves from before per-category buckets stored one number; start those afresh.
// Category Bases are no longer used, so they are always zero.
function normalizeCharacter(data) {
  const ch = { ...newCharacter(), ...data };
  ch.category_bases = zero(Object.keys(R.categories));
  if (typeof ch.experience !== "object" || ch.experience === null) ch.experience = newCharacter().experience;
  if (typeof ch.upgrades !== "object" || ch.upgrades === null) ch.upgrades = zero(TALENTS);
  ch.inventory_points = (ch.inventory || []).map((_, i) => parseInt((ch.inventory_points || [])[i]) || 0);
  return ch;
}
const xpBucket = (req) => (req.gifting ? "Spiritual" : req.category);
function applyCallingBonuses(ch) {
  const granted = R.callings[ch.calling] || [];
  for (const g of Object.keys(R.giftings)) ch.giftings[g] = granted.includes(g) ? R.creation.gifting_bonus : 0;
}
function defaultCharacter() {
  const ch = newCharacter(), d = R.defaults;
  for (const a of ["name", "calling", "motivation", "goal", "allegiance"]) ch[a] = String(d[a] ?? "");
  for (const a of ["narrative", "category_bases", "talents"])
    for (const [k, v] of Object.entries(d[a] || {})) if (k in ch[a]) ch[a][k] = a === "narrative" ? v : parseInt(v);
  for (const a of ["background_skills", "flaws", "inventory"]) ch[a] = (d[a] || []).map(String);
  applyCallingBonuses(ch);
  ch.notes = { ...R.notes };
  ch.inventory_points = ch.inventory.map(() => 0);
  return ch;
}
const callingBonus = () => (ch) => R.calling_attribute_bonuses[ch.calling] || {};
const catBonus = (ch, cat) => { const b = callingBonus()(ch); return b.category === cat ? b.amount || 0 : 0; };
const talentBonus = (ch, t) => { const b = callingBonus()(ch); return (b.specific_talents || []).includes(t) ? b.amount || 0 : 0; };
const effCategory = (ch, cat) => (ch.category_bases[cat] || 0) + catBonus(ch, cat);
const effTalent = (ch, t) => (ch.talents[t] || 0) + talentBonus(ch, t) ;
// Talent values include Experience upgrades; only the rest were paid from creation points.
const upgradeTotal = (ch) => Object.values(ch.upgrades || {}).reduce((a, b) => a + b, 0);
const pointsSpent = (ch) => [...Object.values(ch.category_bases), ...Object.values(ch.talents)].reduce((a, b) => a + b, 0) - upgradeTotal(ch);
function validate(ch) {
  const c = R.creation, errors = [], spent = pointsSpent(ch);
  if (spent !== c.talent_points) errors.push(`Spent ${spent} talent points; expected ${c.talent_points}.`);
  if (Math.min(...Object.values(ch.category_bases), ...Object.values(ch.talents)) < 0) errors.push("Talent values cannot be negative.");
  if (Object.values(ch.category_bases).some((v) => v > c.category_base_max)) errors.push(`Category Bases cannot exceed ${c.category_base_max} during creation.`);
  if (Object.entries(ch.talents).some(([t, v]) => v - ((ch.upgrades || {})[t] || 0) > c.specific_talent_max)) errors.push(`Specific Talents cannot exceed ${c.specific_talent_max} during creation.`);
  if (!(ch.calling in R.callings)) errors.push("Choose a valid Calling.");
  if (ch.background_skills.length > c.max_background_skills) errors.push(`At most ${c.max_background_skills} background skills.`);
  if (ch.flaws.length !== c.flaws) errors.push(`Choose exactly ${c.flaws} flaws.`);
  const s = c.inventory_slots;
  if (ch.inventory.length < s.min || ch.inventory.length > s.max) errors.push(`Inventory needs ${s.min}-${s.max} items.`);
  return errors;
}

// ---------- engine ----------
function breakdown(ch, req) {
  if (!(req.category in R.categories)) throw new Error("Unknown category: " + req.category);
  if (req.talent && categoryOf(req.talent) !== req.category) throw new Error(`${req.talent} is not in ${req.category}`);
  const parts = {}, isGift = !!req.gifting;
  if (isGift) parts[req.gifting] = ch.giftings[req.gifting] || 0;
  else {
    parts[req.category] = effCategory(ch, req.category);
    if (req.talent) parts[req.talent] = effTalent(ch, req.talent);
  }
  let stress = 0, flawXp = 0;
  for (const key of req.modifiers) {
    const m = R.modifiers[key];
    if (m.applies_to === "talent" && isGift) throw new Error(m.label + " applies to talent rolls only.");
    if (m.applies_to === "gifting" && !isGift) throw new Error(m.label + " applies to gifting rolls only.");
    if (m.applies_to === "gifting") continue;
    parts[m.label] = m.value;
    stress += m.stress || 0;
    flawXp = Math.max(flawXp, m.flaw_extra_xp || 0);
  }
  const item = req.item;
  if (item != null && item >= 0 && ch.inventory[item]) parts["Equipment: " + ch.inventory[item]] = (ch.inventory_points || [])[item] || 0;
  const stressCat = isGift ? "Spiritual" : req.category;
  const penalty = Math.floor((ch.stress[stressCat] || 0) / R.stress.points_per_penalty) * R.stress.penalty;
  if (penalty) parts["Stress penalty"] = -penalty;
  if (req.spend_xp) parts["Experience"] = req.spend_xp * R.experience.points_per_bonus;
  return { parts, stress, flawXp };
}
function rollDice(ch, req) {
  const bucket = xpBucket(req);
  if (req.spend_xp < 0 || req.spend_xp > (ch.experience[bucket] || 0)) throw new Error(`Cannot spend more ${bucket} experience than available.`);
  const { parts, stress, flawXp } = breakdown(ch, req);
  const extra = req.mode === "normal" ? 0 : 1;
  const rolled = Array.from({ length: DICE_N + extra }, () => randInt(DICE_SIDES));
  let dice = rolled, dropped = [];
  if (extra) {
    const at = rolled.indexOf(req.mode === "advantage" ? Math.min(...rolled) : Math.max(...rolled));
    dice = rolled.filter((_, i) => i !== at);
    dropped = [rolled[at]];
  }
  const all = { dice: dice.reduce((a, b) => a + b, 0), ...parts };
  const total = Object.values(all).reduce((a, b) => a + b, 0);
  const [outcome, idx] = outcomeFor(total);
  let xpGained = outcome.experience;
  if (outcome.experience) xpGained += flawXp;
  ch.stress[bucket] = Math.min(R.stress.max, (ch.stress[bucket] || 0) + stress);
  ch.experience[bucket] = (ch.experience[bucket] || 0) + xpGained - req.spend_xp;
  return { dice, dropped, breakdown: all, total, outcome: outcome.name, idx, frame: outcome.frame,
           xpGained, xpSpent: req.spend_xp, stressAdded: stress, mode: req.mode, xpCategory: bucket };
}
function diceLabel(mode) {
  if (mode === "normal") return `${DICE_N}d${DICE_SIDES}`;
  return `${DICE_N + 1}d${DICE_SIDES} keep ${mode === "advantage" ? "best" : "worst"} ${DICE_N}`;
}

// ---------- creation page ----------
const Creation = (() => {
  const w = { narrative: {}, bases: {}, talents: {}, gifts: {}, notes: {}, avail: {}, prev: {} };
  let stress = {}, experience = {}, upgrades = {}, photo = "", loading = false;
  // Raising a talent uses free creation points first (within the creation cap); anything beyond
  // that is paid from the talent's own category Experience. Lowering refunds Experience first.
  function talentChanged(t) {
    const cat = categoryOf(t), prev = w.prev[t] || 0, up = upgrades[t] || 0;
    let v = Math.max(0, parseInt(w.talents[t].value) || 0);
    const delta = v - prev;
    if (delta > 0) {
      const spent = Object.values(w.prev).reduce((a, b) => a + b, 0) - Object.values(upgrades).reduce((a, b) => a + b, 0);
      const free = Math.max(0, c.talent_points - spent), room = Math.max(0, c.specific_talent_max - (prev - up));
      const fromFree = Math.min(delta, free, room);
      const needXp = Math.min(delta - fromFree, experience[cat] || 0);
      v = prev + fromFree + needXp;
      experience[cat] = (experience[cat] || 0) - needXp; upgrades[t] = up + needXp;
    } else if (delta < 0) {
      const refund = Math.min(-delta, up);
      experience[cat] = (experience[cat] || 0) + refund; upgrades[t] = up - refund;
    }
    w.talents[t].value = v; w.prev[t] = v;
    refresh();
  }
  const intIn = (t) => h("input", { type: "number", min: 0, step: 1, value: 0, oninput: () => (loading ? refresh() : talentChanged(t)) });
  const txt = (label) => { const i = h("input", { type: "text", oninput: refresh }); return [i, h("label", { class: "f" }, label, i)]; };
  const filled = (list) => list.map((i) => i.value.trim()).filter(Boolean);
  const c = R.creation;
  const mk = (label) => { const [i, l] = txt(label); return { i, l }; };

  function build(root) {
    const name = mk("Name"); w.name = name.i;
    w.calling = h("select", { onchange: refresh }, Object.keys(R.callings).map((k) => h("option", { value: k }, k)));
    w.motivation = h("select", { onchange: refresh }, Object.keys(R.motivations).map((k) => h("option", { value: k }, k)));
    const identity = card("Identity", name.l, h("label", { class: "f" }, "Calling", w.calling),
      h("label", { class: "f" }, "Motivation", w.motivation));
    for (const f of c.narrative_fields) {
      if (LONG_FIELDS.includes(f)) {
        w.narrative[f] = h("textarea", { rows: 3, oninput: refresh });
        identity.append(h("label", { class: "f" }, f, w.narrative[f]));
      } else { const m = mk(f); w.narrative[f] = m.i; identity.append(m.l); }
    }
    const talents = card("Talents");
    for (const [cat, ts] of Object.entries(R.categories)) {
      const row = h("div", { class: "row talents" }, h("span", { class: "cat" }, cat));
      for (const t of ts) {
        w.talents[t] = intIn(t);
        w.avail[t] = Tip.attach(h("span", { class: "xpavail" }), () => helpFor.concept("Upgrade"));
        row.append(h("label", { class: "f" }, t, " ", w.avail[t], w.talents[t]));
      }
      talents.append(row);
    }
    w.bonus = h("div", { class: "muted" }); talents.append(w.bonus);
    const gifts = card("Giftings (set by Calling)");
    for (const [g, d] of Object.entries(R.giftings)) {
      w.gifts[g] = h("b", { style: "display:inline-block;width:32px" }, "0");
      gifts.append(h("div", {}, w.gifts[g], `${g} - ${d}`));
    }
    const more = card("Background, goal, allegiance, flaws, inventory");
    const group = (n, fmt) => Array.from({ length: n }, (_, i) => { const m = mk(fmt(i + 1)); more.append(m.l); return m.i; });
    w.skills = group(c.max_background_skills, (i) => `Background skill ${i}`);
    const g = mk("Goal"); w.goal = g.i; more.append(g.l);
    const a = mk("Allegiance"); w.allegiance = a.i; a.i.placeholder = "Character name and relationship"; more.append(a.l);
    w.flaws = group(c.flaws, (i) => `Flaw ${i}`);
    w.inventory = []; w.invPts = [];
    for (let i = 1; i <= c.inventory_slots.max; i++) {
      const name = h("input", { type: "text", oninput: refresh, "aria-label": "Inventory item " + i });
      const pts = h("input", { type: "number", step: 1, value: 0, class: "invpts", oninput: refresh, "aria-label": "Item " + i + " points" });
      w.inventory.push(name); w.invPts.push(pts);
      more.append(h("div", { class: "row inv" }, h("span", { class: "muted small" }, "Item " + i), name, h("span", { class: "muted small" }, "Points"), pts));
    }

    w.profileName = h("div", { style: "font-size:20px;font-weight:bold" });
    w.photoBox = h("div");
    const profile = card("Profile", h("div", { class: "row", style: "align-items:flex-start" }, w.photoBox,
      h("div", {}, w.profileName, h("button", { class: "btn outline", onclick: pickPhoto }, "Update Image"))));
    const notes = h("div", { class: "col" }, h("h2", {}, "Helper notes"));
    for (const k of [...["Name", "Calling", "Motivation"], ...c.narrative_fields,
      ...["Talents", "Giftings", "Background skills", "Goal", "Allegiance", "Flaws", "Inventory"]]) {
      w.notes[k] = h("textarea", { rows: 3 });
      notes.append(card(k, w.notes[k]));
    }
    w.status = h("div", { class: "status" }); w.points = h("b", { style: "color:var(--teal)" });
    root.append(
      h("div", { class: "cols" }, h("div", { class: "col wide" }, h("h2", {}, "Create your character"), profile, identity, talents, gifts, more), notes),
      h("div", { style: "padding:0 16px 16px" }, w.status, h("div", { class: "row" },
        h("button", { class: "btn outline", onclick: () => fromCharacter(defaultCharacter()) }, "Reset to defaults"),
        h("button", { class: "btn outline", onclick: () => pickJson(fromCharacter) }, "Load character"),
        h("button", { class: "btn outline", onclick: save }, "Save character"), w.points)));
    fromCharacter(defaultCharacter());
  }

  function toCharacter() {
    const ch = newCharacter();
    ch.name = w.name.value.trim(); ch.calling = w.calling.value; ch.motivation = w.motivation.value;
    for (const f in w.narrative) ch.narrative[f] = w.narrative[f].value.trim();
    for (const k in w.bases) ch.category_bases[k] = parseInt(w.bases[k].value) || 0;
    for (const k in w.talents) ch.talents[k] = parseInt(w.talents[k].value) || 0;
    applyCallingBonuses(ch);
    ch.background_skills = filled(w.skills); ch.goal = w.goal.value.trim(); ch.allegiance = w.allegiance.value.trim();
    ch.flaws = filled(w.flaws);
    const items = w.inventory.map((inp, i) => [inp.value.trim(), parseInt(w.invPts[i].value) || 0]).filter(([n]) => n);
    ch.inventory = items.map(([n]) => n); ch.inventory_points = items.map(([, p]) => p);
    ch.upgrades = { ...ch.upgrades, ...upgrades };
    ch.photo = photo; ch.stress = { ...ch.stress, ...stress }; ch.experience = { ...ch.experience, ...experience };
    ch.notes = Object.fromEntries(Object.entries(w.notes).map(([k, e]) => [k, e.value]));
    return ch;
  }
  function fromCharacter(ch) {
    loading = true;
    stress = { ...ch.stress }; experience = { ...(ch.experience || {}) }; upgrades = { ...(ch.upgrades || {}) };
    w.name.value = ch.name || "";
    w.calling.value = ch.calling in R.callings ? ch.calling : "";
    w.motivation.value = ch.motivation in R.motivations ? ch.motivation : "";
    for (const f in w.narrative) w.narrative[f].value = (ch.narrative || {})[f] ?? "";
    for (const k in w.bases) w.bases[k].value = (ch.category_bases || {})[k] || 0;
    for (const k in w.talents) { w.talents[k].value = (ch.talents || {})[k] || 0; w.prev[k] = (ch.talents || {})[k] || 0; }
    w.goal.value = ch.goal || ""; w.allegiance.value = ch.allegiance || "";
    for (const [inputs, vals] of [[w.skills, ch.background_skills], [w.flaws, ch.flaws], [w.inventory, ch.inventory]])
      inputs.forEach((inp, i) => (inp.value = (vals || [])[i] ?? ""));
    w.invPts.forEach((inp, i) => (inp.value = (ch.inventory_points || [])[i] || 0));
    for (const k in w.notes) w.notes[k].value = k in (ch.notes || {}) ? ch.notes[k] : R.notes[k] || "";
    photo = ch.photo || "";
    loading = false;
    refresh();
  }
  function refresh() {
    if (loading) return;
    const ch = toCharacter();
    for (const t in w.avail) {
      const n = experience[categoryOf(t)] || 0;
      w.avail[t].textContent = n > 0 ? `(${n})` : "";
    }
    w.points.textContent = "Talent points remaining: " + (c.talent_points - pointsSpent(ch));
    const granted = R.callings[ch.calling] || [];
    for (const g in w.gifts) w.gifts[g].textContent = granted.includes(g) ? "+" + c.gifting_bonus : "0";
    const ab = R.calling_attribute_bonuses[ch.calling] || {};
    w.bonus.textContent = ab.category
      ? `Calling bonus: +${ab.amount || 0} ${ab.category} Category Base`
      : `Calling bonus: +${ab.amount || 0} to ${(ab.specific_talents || []).join(", ") || "configured Specific Talents"}`;
    const errors = validate(ch);
    w.status.textContent = errors.length ? "To do: " + errors.join(" ") : "Ready to save.";
    w.status.style.color = errors.length ? "#f2c94c" : "#6fcf97";
    w.profileName.textContent = ch.name;
    w.photoBox.replaceChildren(photo.startsWith("data:") ? h("img", { class: "photo", src: photo }) : h("div", { class: "photo-empty" }, "No photo"));
  }
  function pickPhoto() {
    const input = h("input", { type: "file", accept: "image/*", onchange: () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > MAX_PHOTO) return toast("Photo is too large (limit 1.5 MB).");
      const rd = new FileReader();
      rd.onload = () => { photo = rd.result; refresh(); };
      rd.readAsDataURL(f);
    } });
    input.click();
  }
  function save() {
    const ch = toCharacter(), errors = validate(ch);
    if (errors.length) toast("Saved with open issues: " + errors.join(" "));
    download(ch, (ch.name || "character") + ".json");
  }
  return { build, toCharacter, fromCharacter };
})();

// ---------- roller page ----------
const Roller = (() => {
  let ch = defaultCharacter(), rolling = false;
  const firstCat = Object.keys(R.categories)[0];
  const s = { kind: "talent", category: firstCat, talent: R.categories[firstCat][0], gifting: Object.keys(R.giftings)[0], mode: "normal", spend: 0 };
  const mods = {}, w = {}, modBoxes = {};
  const penalty = (cat) => Math.floor((ch.stress[cat] || 0) / R.stress.points_per_penalty) * R.stress.penalty;

  const callingText = () => {
    const b = R.calling_attribute_bonuses[ch.calling] || {};
    const bt = b.category ? `+${b.amount || 0} ${b.category} Base` : `+${b.amount || 0} ${(b.specific_talents || []).join(", ") || "configured talents"}`;
    return [ch.calling, ch.motivation, bt].filter(Boolean).join("  |  ");
  };
  const request = () => {
    const g = s.kind === "gifting";
    return { category: s.category, talent: g ? "" : s.talent, gifting: g ? s.gifting : "",
      modifiers: Object.keys(mods).filter((k) => mods[k] && !modBoxes[k].disabled), spend_xp: s.spend, mode: s.mode,
      item: w.equipSel.value === "" ? null : parseInt(w.equipSel.value) };
  };

  function build(root) {
    w.name = h("div", { style: "font-size:22px;font-weight:bold" }); w.calling = h("div", { class: "muted" });
    w.stress = {}; w.xp = {}; w.val = {}; w.talentBtn = {};
    const grid = h("div", { class: "tgrid" });
    for (const [cat, ts] of Object.entries(R.categories)) {
      for (const head of ["", "Roll", "Stress", "Exp."]) {
        const th = h("i", { class: "th" }, head);
        grid.append(head ? Tip.attach(th, () => helpFor.concept(head)) : th);
      }
      const bg = `background:var(${CAT_COLOURS[cat] || "--accent"})`;
      w.stress[cat] = h("input", { type: "number", min: 0, max: R.stress.max, step: 1, "aria-label": cat + " stress", oninput: () => {
        ch.stress[cat] = Math.max(0, parseInt(w.stress[cat].value) || 0); renderValues(); preview(); } });
      w.xp[cat] = h("input", { type: "number", min: 0, step: 1, "aria-label": cat + " experience", oninput: () => {
        ch.experience[cat] = Math.max(0, parseInt(w.xp[cat].value) || 0); preview(); } });
      Tip.attach(w.stress[cat], () => helpFor.concept("Stress")); Tip.attach(w.xp[cat], () => helpFor.concept("Exp."));
      grid.append(h("b", { class: "band first", style: bg }, cat), h("span", { class: "band", style: bg }),
        h("span", { class: "band", style: bg }, w.stress[cat]), h("span", { class: "band last", style: bg }, w.xp[cat]));
      for (const t of ts) {
        w.talentBtn[t] = Tip.attach(h("button", { class: "talent", onclick: () => selectTalent(t) }, t), () => helpFor.talent(t));
        w.val[t] = Tip.attach(h("span", { class: "tval" }), () => helpFor.concept("Roll"));
        grid.append(w.talentBtn[t], w.val[t], h("span"), h("span"));
      }
    }
    const radio = (name, opts, get, set, tips = {}) => h("div", { class: "row" }, Object.entries(opts).map(([v, label]) => {
      const lab = h("label", {}, h("input", { type: "radio", name, value: v, checked: get() === v, onchange: () => { set(v); preview(); } }), label);
      return tips[v] ? Tip.attach(lab, () => helpFor.concept(tips[v])) : lab;
    }));
    w.kindRadio = radio("kind", { talent: "Talent roll", gifting: "Gifting roll (non-talent action)" }, () => s.kind, (v) => { s.kind = v; applyKind(); },
      { talent: "Talent roll", gifting: "Gifting roll" });
    w.motivation = h("b", { style: "color:var(--teal)" });
    w.workSel = radioGroup("work", () => {
      const talent = R.motivations[ch.motivation]?.works[w.workSel.value];
      mods.motivation_work = !!talent; modBoxes.motivation_work.checked = !!talent;
      if (talent) selectTalent(talent); else preview();
    });
    w.giftSel = dropdown(() => { s.gifting = w.giftSel.value; preview(); });
    w.giftLab = h("div", { class: "f" }, "Gifting", w.giftSel.el);
    w.modeRadio = radio("mode", MODE_LABELS, () => s.mode, (v) => (s.mode = v));
    const setup = card("Challenge", w.kindRadio, h("div", { class: "row" }, h("span", { class: "muted" }, "Motivation"), w.motivation),
      w.giftLab, Tip.attach(h("div", { class: "muted small" }, "Storyteller call"), () => helpFor.concept("Storyteller call")), w.modeRadio);

    const modCard = card("Optional modifiers (nominate each one)");
    const modTip = { motivation_work: "Motivation Work", background_skill: "Background Skill", goal: "Goal", allegiance: "Allegiance", flaw: "Flaw" };
    w.modText = {};
    for (const [key, m] of Object.entries(R.modifiers)) {
      if (m.applies_to === "gifting") continue;
      mods[key] = false;
      modBoxes[key] = h("input", { type: "checkbox", onchange: () => { mods[key] = modBoxes[key].checked; preview(); } });
      w.modText[key] = h("span", { class: "muted small" });
      // Motivation Work is driven by the Work list below, so its checkbox is not offered separately.
      const lab = h("label", {}, modBoxes[key], `${m.label}  (${signed(m.value)}${m.stress ? `, +${m.stress} Stress` : ""}) `, w.modText[key]);
      modCard.append(h("div", { hidden: key === "motivation_work" }, modTip[key] ? Tip.attach(lab, () => helpFor.concept(modTip[key])) : lab));
    }
    w.workHead = Tip.attach(h("div", { class: "muted small mh" }), () => helpFor.concept("Motivation Work"));
    w.equipSel = radioGroup("equip", preview);
    modCard.append(w.workHead, w.workSel.el,
      Tip.attach(h("div", { class: "muted small mh" }, "Equipment (optional)"), () => helpFor.concept("Equipment")), w.equipSel.el);
    w.spend = h("input", { type: "number", min: 0, step: 1, value: 0, oninput: () => {
      s.spend = Math.max(0, parseInt(w.spend.value) || 0); preview(); } });
    w.spendLabel = h("span", {});
    const spendCard = card("Spend experience", h("div", { class: "row" }, w.spendLabel, w.spend));
    Tip.attach(w.spendLabel, () => helpFor.concept("Spend experience"));
    w.preview = Tip.attach(h("div", { class: "preview" }), () => helpFor.concept("Roll preview"));

    w.dice = h("div", { class: "dice" }); w.total = h("div", { class: "total" }, "-");
    w.outcome = h("div", { class: "outcome" }, "Roll the dice to begin");
    w.breakdown = h("div", { class: "small", style: "text-align:left" }); w.changes = h("div", { class: "muted" });
    w.history = h("div", { class: "history" });
    w.roll = h("button", { class: "btn roll", onclick: startRoll });
    const result = card("Result", h("div", { class: "center" }, w.dice, w.total, w.outcome), w.breakdown, w.changes);
    const hist = card("", h("div", { class: "row", style: "justify-content:space-between" }, h("b", {}, "History (newest first)"),
      h("button", { class: "btn outline", onclick: () => w.history.replaceChildren() }, "Clear")), w.history);

    w.saveLoad = h("div", { class: "row" },
      h("button", { class: "btn outline", onclick: () => download(ch, (ch.name || "character") + ".json") }, "Save character"),
      h("button", { class: "btn outline", onclick: () => pickJson(setCharacter) }, "Load character"));
    root.append(h("div", { class: "cols" },
      h("div", { class: "col" }, card("Character", w.name, w.calling, grid), w.saveLoad),
      h("div", { class: "col wide" }, h("h2", {}, "Set up your roll"), setup, modCard, spendCard),
      h("div", { class: "col" }, w.preview, result, w.roll, hist)));
    populateWorks();
    refreshAll();
  }

  function renderValues() {
    for (const t of TALENTS) {
      const cat = categoryOf(t), p = penalty(cat);
      w.val[t].innerHTML = signed(effCategory(ch, cat) + effTalent(ch, t)) + (p ? ` <span class="pen">-${p}</span>` : "");
    }
  }
  function populateWorks() {
    const works = R.motivations[ch.motivation]?.works || {};
    w.motivation.textContent = ch.motivation || "-";
    w.workHead.textContent = `Motivation Work${ch.motivation ? " (" + ch.motivation + ")" : ""}`;
    w.workSel.setOptions([{ value: "", label: "None" },
      ...Object.entries(works).map(([work, talent]) => ({ value: work, label: `${work}  (+${R.modifiers.motivation_work.value} ${talent})`,
        tip: () => helpFor.work(ch.motivation, work) }))]);
    clearWork();
  }
  function clearWork() {
    w.workSel.value = "";
    mods.motivation_work = false; modBoxes.motivation_work.checked = false;
  }
  function selectTalent(t) {
    const work = R.motivations[ch.motivation]?.works[w.workSel.value];
    if (work && work !== t) clearWork(); // a Work only boosts its own talent
    s.kind = "talent"; s.category = categoryOf(t); s.talent = t;
    w.kindRadio.querySelector("input[value=talent]").checked = true;
    applyKind();
    preview();
  }
  function applyKind() {
    const g = s.kind === "gifting";
    w.giftLab.hidden = !g;
    w.workSel.disabled = g;
    if (g) clearWork();
    for (const [k, box] of Object.entries(modBoxes)) {
      const ok = !(g && R.modifiers[k].applies_to === "talent");
      box.disabled = !ok; box.parentElement.classList.toggle("disabled", !ok);
      if (!ok) { box.checked = false; mods[k] = false; }
    }
    for (const [t, btn] of Object.entries(w.talentBtn)) btn.classList.toggle("sel", !g && t === s.talent);
  }
  function refreshAll() {
    w.name.textContent = ch.name || "Unnamed";
    w.calling.textContent = callingText();
    renderValues();
    for (const cat of Object.keys(R.categories)) { w.stress[cat].value = ch.stress[cat] || 0; w.xp[cat].value = ch.experience[cat] || 0; }
    w.giftSel.setOptions(Object.keys(R.giftings).map((g) => ({ value: g, label: `${g}  (${signed(ch.giftings[g] || 0)})`, tip: () => helpFor.gifting(g) })));
    w.giftSel.value = s.gifting;
    const j = (a) => a.join(", ") || "-";
    w.modText.background_skill.textContent = j(ch.background_skills);
    w.modText.goal.textContent = ch.goal || "-";
    w.modText.allegiance.textContent = ch.allegiance || "-";
    w.modText.flaw.textContent = j(ch.flaws);
    w.equipSel.setOptions([{ value: "", label: "None" },
      ...ch.inventory.map((n, i) => ({ value: String(i), label: `${n}  (${signed((ch.inventory_points || [])[i] || 0)})` }))]);
    applyKind();
    preview();
  }
  function preview() {
    const bucket = s.kind === "gifting" ? "Spiritual" : s.category, available = ch.experience[bucket] || 0;
    w.spend.max = available;
    w.spendLabel.textContent = `${bucket} points, ${available} available (each +${R.experience.points_per_bonus})`;
    if (s.spend > available) { s.spend = available; w.spend.value = available; }
    const req = request();
    w.roll.textContent = "ROLL " + diceLabel(req.mode);
    try {
      const { parts, stress } = breakdown(ch, req);
      const terms = Object.entries(parts).map(([k, v]) => `${esc(k)} ${signed(v)}`).join("  ");
      const sum = Object.values(parts).reduce((a, b) => a + b, 0);
      w.preview.innerHTML = `<b>${diceLabel(req.mode)} ${signed(sum)}</b><br>${terms}` +
        (stress ? `<br>Costs +${stress} Stress in ${req.gifting ? "Spiritual" : s.category}` : "");
    } catch (e) { w.preview.textContent = e.message; }
  }
  function drawDice(dice, dropped = []) {
    w.dice.replaceChildren(...dice.map((d) => h("div", { class: "die" }, d)),
      ...dropped.map((d) => h("div", { class: "die dropped", title: "Dropped" }, d)));
  }
  async function startRoll() {
    if (rolling) return;
    rolling = true; w.roll.disabled = true;
    try {
      const req = request(), n = DICE_N + (req.mode === "normal" ? 0 : 1);
      for (let i = 0; i < 8; i++) {
        drawDice(Array.from({ length: n }, () => randInt(DICE_SIDES)));
        await new Promise((r) => setTimeout(r, 100));
      }
      let r;
      try { r = rollDice(ch, req); } catch (e) { toast(e.message); return; }
      showResult(r, req);
      s.mode = "normal";
      w.modeRadio.querySelector("input[value=normal]").checked = true;
      refreshAll();
    } finally { rolling = false; w.roll.disabled = false; }
  }
  function showResult(r, req) {
    drawDice(r.dice, r.dropped);
    const colour = `var(${BAND_COLORS[Math.min(r.idx, BAND_COLORS.length - 1)]})`;
    w.total.textContent = r.total; w.total.style.color = colour;
    w.outcome.textContent = `${r.outcome} - ${r.frame}`; w.outcome.style.color = colour;
    w.breakdown.innerHTML = Object.entries(r.breakdown).map(([k, v]) => k === "dice"
      ? `${diceLabel(r.mode)} (${r.dice.join(" + ")}${r.dropped.length ? `, dropped ${r.dropped[0]}` : ""}): <b>${v}</b>`
      : `${esc(k)}: <b>${signed(v)}</b>`).join("<br>");
    const changes = [];
    if (r.xpGained) changes.push(`Gained ${r.xpGained} ${r.xpCategory} experience`);
    if (r.xpSpent) changes.push(`Spent ${r.xpSpent} ${r.xpCategory} experience`);
    if (r.stressAdded) changes.push(`+${r.stressAdded} ${req.gifting ? "Spiritual" : req.category} stress`);
    w.changes.textContent = changes.join(" | ");
    const work = w.workSel.value;
    const terms = Object.entries(r.breakdown).map(([k, v]) => {
      if (k === "dice") return `Dice ${r.dice.join("+")}${r.dropped.length ? `, dropped ${r.dropped[0]}` : ""} = ${v}`;
      if (k === R.modifiers.motivation_work.label && work) return `${k} (${ch.motivation}: ${work}) ${signed(v)}`;
      return `${k} ${signed(v)}`;
    });
    const cat = req.gifting ? "Spiritual" : req.category, notes = [];
    if (r.xpGained) notes.push(`gained ${r.xpGained} ${r.xpCategory} exp`);
    if (r.xpSpent) notes.push(`spent ${r.xpSpent} ${r.xpCategory} exp`);
    if (r.stressAdded) notes.push(`+${r.stressAdded} ${cat} stress`);
    const what = req.gifting || req.talent || req.category, tag = r.mode !== "normal" ? ` [${r.mode}]` : "";
    w.history.prepend(h("div", { class: "entry" }, h("div", {}, `${what}${tag}: ${r.total} - ${r.outcome} (${r.frame})`),
      h("div", { class: "muted small" }, terms.join("  |  ")), notes.length ? h("div", { class: "muted small" }, notes.join(", ")) : ""));
  }
  function setCharacter(c) { ch = c; s.spend = 0; w.spend.value = 0; w.equipSel.value = ""; populateWorks(); refreshAll(); }
  return { build, setCharacter, get char() { return ch; } };
})();

// ---------- journal ----------
const Journal = (() => {
  const KEY = "unorthodox-journal";
  let entries = [], current = null; // current: entry being edited, or null for a new one
  const w = {};
  try { entries = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { entries = []; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* storage unavailable */ } };
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
      current = { id: Math.max(0, ...entries.map((e) => e.id)) + 1, date: new Date().toISOString(), title: title || "Untitled", text };
      entries.push(current);
    }
    persist(); edit(current); toast("Entry saved");
  }
  function remove() {
    if (!current || !confirm(`Delete entry #${current.id}?`)) return;
    entries = entries.filter((e) => e !== current);
    persist(); edit(null);
  }
  function render() {
    const sorted = [...entries].sort((a, b) => b.id - a.id);
    w.list.replaceChildren(...(sorted.length ? sorted.map((e) => h("button", { class: "jentry" + (e === current ? " sel" : ""), onclick: () => edit(e) },
      h("b", {}, `#${e.id}  ${e.title}`), h("span", { class: "muted small" }, stamp(e.date)))) : [h("div", { class: "muted" }, "No entries yet.")]));
  }
  function load(list) {
    entries = list.filter((e) => e && Number.isFinite(e.id)).map((e) => ({ id: e.id, date: e.date || new Date().toISOString(), title: String(e.title || "Untitled"), text: String(e.text || "") }));
    persist(); edit(null);
  }
  return { build, load, get entries() { return entries; } };
})();

// ---------- tabs ----------
Creation.build($("page-create"));
Roller.build($("page-roll"));
Journal.build($("page-journal"));
const TABS = ["create", "roll", "journal"];
let currentTab = "create";
function show(tab) {
  if (tab === currentTab) return;
  if (currentTab === "roll") Creation.fromCharacter(Roller.char);
  if (tab === "roll") Roller.setCharacter(Creation.toCharacter());
  currentTab = tab;
  for (const t of TABS) { $("page-" + t).hidden = t !== tab; $("tab-" + t).classList.toggle("active", t === tab); }
}
for (const t of TABS) $("tab-" + t).onclick = () => show(t);
