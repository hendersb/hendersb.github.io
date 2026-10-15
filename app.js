"use strict";
// Static port of the Unorthodox rules engine, character creator and roller.
const R = window.RULES;
const TALENTS = Object.values(R.categories).flat();
const DICE_N = R.dice.count, DICE_SIDES = R.dice.sides;
const BAND_COLORS = ["--warn", "--accent", "--good", "--profound"];
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
  const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}
function pickJson(onChar) {
  const input = h("input", { type: "file", accept: ".json", onchange: async () => {
    try {
      const data = JSON.parse((await input.files[0].text()).replace(/^\uFEFF/, ""));
      if (typeof data !== "object" || data === null) throw new Error("not a character file");
      onChar({ ...newCharacter(), ...data });
      toast("Loaded " + (data.name || "character"));
    } catch (e) { toast("Could not load: " + e.message); }
  } });
  input.click();
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
    flaws: [], inventory: [], stress: zero(Object.keys(R.categories)), experience: 0, photo: "", notes: {},
  };
}
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
  return ch;
}
const callingBonus = () => (ch) => R.calling_attribute_bonuses[ch.calling] || {};
const catBonus = (ch, cat) => { const b = callingBonus()(ch); return b.category === cat ? b.amount || 0 : 0; };
const talentBonus = (ch, t) => { const b = callingBonus()(ch); return (b.specific_talents || []).includes(t) ? b.amount || 0 : 0; };
const effCategory = (ch, cat) => (ch.category_bases[cat] || 0) + catBonus(ch, cat);
const effTalent = (ch, t) => (ch.talents[t] || 0) + talentBonus(ch, t);
const pointsSpent = (ch) => [...Object.values(ch.category_bases), ...Object.values(ch.talents)].reduce((a, b) => a + b, 0);
function validate(ch) {
  const c = R.creation, errors = [], spent = pointsSpent(ch);
  if (spent !== c.talent_points) errors.push(`Spent ${spent} talent points; expected ${c.talent_points}.`);
  if (Math.min(...Object.values(ch.category_bases), ...Object.values(ch.talents)) < 0) errors.push("Talent values cannot be negative.");
  if (Object.values(ch.category_bases).some((v) => v > c.category_base_max)) errors.push(`Category Bases cannot exceed ${c.category_base_max} during creation.`);
  if (Object.values(ch.talents).some((v) => v > c.specific_talent_max)) errors.push(`Specific Talents cannot exceed ${c.specific_talent_max} during creation.`);
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
  let stress = isGift ? 1 : 0, flawXp = 0;
  for (const key of req.modifiers) {
    const m = R.modifiers[key];
    if (m.applies_to === "talent" && isGift) throw new Error(m.label + " applies to talent rolls only.");
    if (m.applies_to === "gifting" && !isGift) throw new Error(m.label + " applies to gifting rolls only.");
    if (m.applies_to === "gifting") continue;
    parts[m.label] = m.value;
    stress += m.stress || 0;
    flawXp = Math.max(flawXp, m.flaw_extra_xp || 0);
  }
  const stressCat = isGift ? "Spiritual" : req.category;
  const penalty = Math.floor((ch.stress[stressCat] || 0) / R.stress.points_per_penalty) * R.stress.penalty;
  if (penalty) parts["Stress penalty"] = -penalty;
  if (req.spend_xp) parts["Experience"] = req.spend_xp * R.experience.points_per_bonus;
  return { parts, stress, flawXp };
}
function rollDice(ch, req) {
  if (req.spend_xp < 0 || req.spend_xp > ch.experience) throw new Error("Cannot spend more experience than available.");
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
  const stressCat = req.gifting ? "Spiritual" : req.category;
  ch.stress[stressCat] = Math.min(R.stress.max, (ch.stress[stressCat] || 0) + stress);
  ch.experience += xpGained - req.spend_xp;
  return { dice, dropped, breakdown: all, total, outcome: outcome.name, idx, frame: outcome.frame,
           xpGained, xpSpent: req.spend_xp, stressAdded: stress, mode: req.mode };
}
function diceLabel(mode) {
  if (mode === "normal") return `${DICE_N}d${DICE_SIDES}`;
  return `${DICE_N + 1}d${DICE_SIDES} keep ${mode === "advantage" ? "best" : "worst"} ${DICE_N}`;
}

// ---------- creation page ----------
const Creation = (() => {
  const w = { narrative: {}, bases: {}, talents: {}, gifts: {}, notes: {} };
  let stress = {}, experience = 0, photo = "", loading = false;
  const intIn = (max) => h("input", { type: "number", min: 0, max, step: 1, value: 0, oninput: refresh });
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
      w.bases[cat] = intIn(c.category_base_max);
      const row = h("div", { class: "row talents" }, h("span", { class: "cat" }, cat), h("label", { class: "f" }, "Base", w.bases[cat]));
      for (const t of ts) { w.talents[t] = intIn(c.specific_talent_max); row.append(h("label", { class: "f" }, t, w.talents[t])); }
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
    w.inventory = group(c.inventory_slots.max, (i) => `Inventory slot ${i}${i <= c.inventory_slots.min ? " *" : ""}`);

    w.profileName = h("div", { style: "font-size:20px;font-weight:bold" });
    w.photoBox = h("div");
    const profile = card("Profile", h("div", { class: "row", style: "align-items:flex-start" }, w.photoBox,
      h("div", {}, w.profileName, h("button", { class: "btn outline", onclick: pickPhoto }, "Upload photo..."))));
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
    ch.flaws = filled(w.flaws); ch.inventory = filled(w.inventory);
    ch.photo = photo; ch.stress = { ...ch.stress, ...stress }; ch.experience = experience;
    ch.notes = Object.fromEntries(Object.entries(w.notes).map(([k, e]) => [k, e.value]));
    return ch;
  }
  function fromCharacter(ch) {
    loading = true;
    stress = { ...ch.stress }; experience = ch.experience || 0;
    w.name.value = ch.name || "";
    w.calling.value = ch.calling in R.callings ? ch.calling : "";
    w.motivation.value = ch.motivation in R.motivations ? ch.motivation : "";
    for (const f in w.narrative) w.narrative[f].value = (ch.narrative || {})[f] ?? "";
    for (const k in w.bases) w.bases[k].value = (ch.category_bases || {})[k] || 0;
    for (const k in w.talents) w.talents[k].value = (ch.talents || {})[k] || 0;
    w.goal.value = ch.goal || ""; w.allegiance.value = ch.allegiance || "";
    for (const [inputs, vals] of [[w.skills, ch.background_skills], [w.flaws, ch.flaws], [w.inventory, ch.inventory]])
      inputs.forEach((inp, i) => (inp.value = (vals || [])[i] ?? ""));
    for (const k in w.notes) w.notes[k].value = k in (ch.notes || {}) ? ch.notes[k] : R.notes[k] || "";
    photo = ch.photo || "";
    loading = false;
    refresh();
  }
  function refresh() {
    if (loading) return;
    const ch = toCharacter();
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
  const s = { kind: "talent", category: Object.keys(R.categories)[0], talent: "", gifting: Object.keys(R.giftings)[0], mode: "normal", spend: 0 };
  const mods = {}, w = {}, modBoxes = {};

  const callingText = () => {
    const b = R.calling_attribute_bonuses[ch.calling] || {};
    const bt = b.category ? `+${b.amount || 0} ${b.category} Base` : `+${b.amount || 0} ${(b.specific_talents || []).join(", ") || "configured talents"}`;
    return [ch.calling, ch.motivation, bt].filter(Boolean).join("  |  ");
  };
  const request = () => {
    const g = s.kind === "gifting";
    return { category: s.category, talent: g ? "" : s.talent, gifting: g ? s.gifting : "",
      modifiers: Object.keys(mods).filter((k) => mods[k] && !modBoxes[k].disabled), spend_xp: s.spend, mode: s.mode };
  };

  function build(root) {
    w.name = h("div", { style: "font-size:22px;font-weight:bold" }); w.calling = h("div", { class: "muted" });
    w.bars = h("div"); w.sheet = h("div", { class: "muted small" });
    w.stress = {}; w.stressNote = {};
    const stressCard = card("Stress and experience");
    for (const cat of Object.keys(R.categories)) {
      w.stress[cat] = h("input", { type: "number", min: 0, max: R.stress.max, step: 1, oninput: () => {
        ch.stress[cat] = Math.max(0, parseInt(w.stress[cat].value) || 0); stressNote(cat); preview(); } });
      w.stressNote[cat] = h("span", { class: "muted small" });
      stressCard.append(h("div", { class: "row" }, h("b", { class: "cat" }, cat), w.stress[cat], w.stressNote[cat]));
    }
    w.xp = h("input", { type: "number", min: 0, step: 1, oninput: () => {
      ch.experience = Math.max(0, parseInt(w.xp.value) || 0);
      w.spend.max = ch.experience;
      if (s.spend > ch.experience) { s.spend = ch.experience; w.spend.value = s.spend; }
      preview(); } });
    stressCard.append(h("div", { class: "row" }, h("b", { class: "cat" }, "Experience"), w.xp));

    const radio = (name, opts, get, set) => h("div", { class: "row" }, Object.entries(opts).map(([v, label]) =>
      h("label", {}, h("input", { type: "radio", name, value: v, checked: get() === v, onchange: () => { set(v); preview(); } }), label)));
    w.kindRadio = radio("kind", { talent: "Talent roll", gifting: "Gifting roll (non-talent action)" }, () => s.kind, (v) => { s.kind = v; applyKind(); });
    w.category = h("select", { onchange: () => { s.category = w.category.value; populateTalents(); preview(); } },
      Object.keys(R.categories).map((k) => h("option", { value: k }, k)));
    w.talentSel = h("select", { onchange: () => { s.talent = w.talentSel.value; preview(); } });
    w.giftSel = h("select", { onchange: () => { s.gifting = w.giftSel.value; preview(); } });
    w.talentLab = h("label", { class: "f" }, "Specific talent", w.talentSel);
    w.giftLab = h("label", { class: "f" }, "Gifting", w.giftSel);
    w.modeRadio = radio("mode", MODE_LABELS, () => s.mode, (v) => (s.mode = v));
    const setup = card("Challenge", w.kindRadio, h("label", { class: "f" }, "Category", w.category), w.talentLab, w.giftLab,
      h("div", { class: "muted small" }, "Storyteller call"), w.modeRadio);

    const modCard = card("Optional modifiers (nominate each one)");
    for (const [key, m] of Object.entries(R.modifiers)) {
      if (m.applies_to === "gifting") continue;
      mods[key] = false;
      modBoxes[key] = h("input", { type: "checkbox", onchange: () => { mods[key] = modBoxes[key].checked; preview(); } });
      modCard.append(h("div", {}, h("label", {}, modBoxes[key], `${m.label}  (${signed(m.value)}${m.stress ? `, +${m.stress} Stress` : ""})`)));
    }
    w.spend = h("input", { type: "number", min: 0, step: 1, value: 0, oninput: () => {
      s.spend = Math.min(ch.experience, Math.max(0, parseInt(w.spend.value) || 0)); preview(); } });
    const spendCard = card("Spend experience", h("div", { class: "row" }, `Points (each +${R.experience.points_per_bonus})`, w.spend));
    w.preview = h("div", { class: "preview" });

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
      h("div", { class: "col" }, card("", w.name, w.calling, w.bars), stressCard, card("Quick reference", w.sheet), w.saveLoad),
      h("div", { class: "col wide" }, h("h2", {}, "Set up your roll"), setup, modCard, spendCard, w.preview),
      h("div", { class: "col" }, result, hist, w.roll)));
    refreshAll();
  }

  function stressNote(cat) {
    const p = Math.floor((ch.stress[cat] || 0) / R.stress.points_per_penalty) * R.stress.penalty;
    w.stressNote[cat].textContent = p ? `-${p} to rolls` : "no penalty";
  }
  function populateTalents() {
    w.talentSel.replaceChildren(...R.categories[s.category].map((t) =>
      h("option", { value: t }, `${t}  (${signed(effTalent(ch, t))})`)));
    s.talent = w.talentSel.value;
  }
  function applyKind() {
    const g = s.kind === "gifting";
    w.talentLab.hidden = g; w.giftLab.hidden = !g;
    for (const [k, box] of Object.entries(modBoxes)) {
      const ok = !(g && R.modifiers[k].applies_to === "talent");
      box.disabled = !ok; box.parentElement.classList.toggle("disabled", !ok);
      if (!ok) { box.checked = false; mods[k] = false; }
    }
  }
  function refreshAll() {
    w.name.textContent = ch.name || "Unnamed";
    w.calling.textContent = callingText();
    const values = Object.fromEntries(TALENTS.map((t) => { const cat = categoryOf(t);
      return [t, (ch.category_bases[cat] || 0) + (ch.talents[t] || 0) + catBonus(ch, cat) + talentBonus(ch, t)]; }));
    const top = Math.max(6, ...Object.values(values));
    w.bars.replaceChildren(...Object.entries(values).map(([t, v]) => h("div", { class: "barrow" }, h("span", {}, t),
      h("div", { class: "barwrap" }, h("div", { class: "bar", style: `width:${Math.max(v, 0) / top * 100}%` })), h("span", {}, signed(v)))));
    for (const cat of Object.keys(R.categories)) { w.stress[cat].value = ch.stress[cat] || 0; stressNote(cat); }
    w.xp.value = ch.experience; w.spend.max = ch.experience;
    if (s.spend > ch.experience) { s.spend = ch.experience; w.spend.value = s.spend; }
    w.giftSel.replaceChildren(...Object.keys(R.giftings).map((g) => h("option", { value: g }, `${g}  (${signed(ch.giftings[g] || 0)})`)));
    w.giftSel.value = s.gifting;
    const prevTalent = s.talent;
    populateTalents();
    if (R.categories[s.category].includes(prevTalent)) { w.talentSel.value = prevTalent; s.talent = prevTalent; }
    const j = (a) => a.join(", ") || "-";
    w.sheet.innerHTML = [`<b>Goal:</b> ${esc(ch.goal || "-")}`, `<b>Allegiance:</b> ${esc(ch.allegiance || "-")}`,
      `<b>Flaws:</b> ${esc(j(ch.flaws))}`, `<b>Background skills:</b> ${esc(j(ch.background_skills))}`,
      `<b>Inventory:</b> ${esc(j(ch.inventory))}`].join("<br>");
    applyKind();
    preview();
  }
  function preview() {
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
    if (r.xpGained) changes.push(`Gained ${r.xpGained} experience`);
    if (r.xpSpent) changes.push(`Spent ${r.xpSpent} experience`);
    if (r.stressAdded) changes.push(`+${r.stressAdded} ${req.gifting ? "Spiritual" : req.category} stress`);
    w.changes.textContent = changes.join(" | ");
    const what = req.gifting || req.talent || req.category, tag = r.mode !== "normal" ? ` [${r.mode}]` : "";
    w.history.prepend(h("div", {}, `${what}${tag}: ${r.total} - ${r.outcome} (${r.frame})`));
  }
  function setCharacter(c) { ch = c; s.spend = 0; w.spend.value = 0; refreshAll(); }
  return { build, setCharacter, get char() { return ch; } };
})();

// ---------- tabs ----------
Creation.build($("page-create"));
Roller.build($("page-roll"));
function show(tab) {
  const roll = tab === "roll";
  $("page-create").hidden = roll; $("page-roll").hidden = !roll;
  $("tab-create").classList.toggle("active", !roll); $("tab-roll").classList.toggle("active", roll);
  if (roll) Roller.setCharacter(Creation.toCharacter()); else Creation.fromCharacter(Roller.char);
}
$("tab-create").onclick = () => show("create");
$("tab-roll").onclick = () => show("roll");
