// IDEA-X · 03 Tuning  (ADDS ONLY — changes nothing that already exists)
// Needs scripts 01, 02 and 02b. Creates the Tuning parts in "IDEA-X Library",
// then builds the screen "IDEA-X · Tuning" (attempt 2 shown). Safe to re-run.

// ===== SETTINGS (all screen texts live here) =====
const PAGE_NAME = "IDEA-X"
const LIB_NAME = "IDEA-X Library"
const SCREEN_NAME = "IDEA-X · Tuning"
const RUN = { Title: "Tuning run #3", Sub: "6 Nov 2026, 21:40 · Codex CLI · 2 attempts · 3 min 12 s", Status: "Passed guardrail" }
const BUDGET = "20"
const STATS = [
  { Tone: "Default", Value: "373 / h", Label: "observed, original rules" },
  { Tone: "Alert", Value: "18.6×", Label: "burn rate (observed ÷ budget)" },
  { Tone: "Good", Value: "46", Label: "grouped alerts after tuning (−99.2%)" }
]
const GAPS = [  // rule, S, observed/h, allowed/h, gap, Direction, change (attempt 2)
  ["Brute force at web server", "5", "194", "3.2", "+191", "Over", "W 5→30 · N_sat 60→120"],
  ["Benign policy at internal hosts", "2", "83", "0.3", "+83", "Over", "W 5→60"],
  ["Web probe at web server", "4", "51", "2.6", "+49", "Over", "W 5→30 · N_sat 60→40"],
  ["Benign policy at web server", "3", "25", "0.4", "+24", "Over", "W 5→60"],
  ["SQL injection at web server", "7", "9.1", "4.5", "+4.6", "Over", "W 5→10 · N_sat 60→9"],
  ["Port scan, internal", "3", "4.3", "1.9", "+2.4", "Over", "W 5→15 · N_sat 60→6"],
  ["Exploit at Windows Vista host", "9", "3.9", "5.8", "−1.9", "Under", "W 5→2 · N_sat 60→3"],
  ["Ping sweep, internal", "2", "2.2", "1.3", "+0.9", "Over", "W 5→10 · N_sat 60→4"]
]
const ATTEMPTS = ["Attempt 1 · Failed", "Attempt 2 · Passed"]   // second one shown as selected
const CHECKS = [
  ["Pass", "Alert reduction 99.2% (5,483 → 46)"],
  ["Pass", "Attack recall 7 of 7"],
  ["Pass", "0 benign groups raised"],
  ["Pass", "No score below its base S"],
  ["Pass", "Rules with S ≥ 8 keep W ≤ 5 min"],
  ["Pass", "Only tuned_rules.yaml changed"]
]
const CHECK_NOTE = "All checks passed. These settings are used for the tuned replay."
const DIFFS = [
  ["exploit@win_vista_host.window_min:", "5", "2", "Gap −1.9/h: under-alerting for its priority. Alert at once, never merge for long."],
  ["exploit@win_vista_host.n_sat:", "60", "3", "Escalate to 10 after 3 events."],
  ["brute_force@web_server.window_min:", "5", "30", "Gap +191/h. 30-minute groups fit the 3.2/h share."],
  ["brute_force@web_server.n_sat:", "60", "120", "p95 burst size is 118 events."],
  ["benign_policy@internal.window_min:", "5", "60", "Gap +83/h. Benign: grouped, never raised."]
]
const LOG = [  // Tone: Command | Plain | Pass | Fail
  ["Command", "$ codex exec --cd tuning \"$(cat tuning_task.md)\""],
  ["Plain", "read base_rules.yaml (8 rules), asset_map.yaml"],
  ["Plain", "read original_alerts.json: 5,483 alerts"],
  ["Plain", "flow: 373 alerts/h, budget 20/h, burn rate 18.6x"],
  ["Plain", "wrote tuned_rules.yaml (attempt 1, 14 values)"],
  ["Plain", "evaluate: reduction 99.3%, recall 7/7, benign raised 0"],
  ["Fail", "guardrail FAIL: exploit@win_vista_host window_min 15 > max 5 for S >= 8"],
  ["Plain", "revise: exploit@win_vista_host window_min 15 -> 2, n_sat 60 -> 3"],
  ["Plain", "wrote tuned_rules.yaml (attempt 2, 14 values)"],
  ["Plain", "evaluate: reduction 99.2%, recall 7/7, benign raised 0"],
  ["Pass", "guardrail PASS (6/6 checks)"],
  ["Plain", "done in 3m 12s"]
]
// column widths of the gap table
const COLS = { S: 36, Observed: 84, Allowed: 84, Gap: 64, Change: 200 }
// ==================================================

await figma.loadAllPagesAsync()
const notes = [], made = []
const findMaster = name => figma.root.findOne(n => n.name === name &&
  (n.type === "COMPONENT_SET" || (n.type === "COMPONENT" && n.parent.type !== "COMPONENT_SET")))
const page = figma.root.children.find(p => p.name === PAGE_NAME)
if (!page) throw new Error(`Page "${PAGE_NAME}" not found. Run script 01 first.`)
await figma.setCurrentPageAsync(page)
const lib = page.children.find(n => n.name === LIB_NAME)
if (!lib) throw new Error(`Frame "${LIB_NAME}" not found. Run script 01 first.`)
if (!findMaster("Card/Stat")) throw new Error("Card/Stat not found. Run script 02b (DRY_RUN = false) first.")

for (const s of ["Regular", "Medium", "Semi Bold"]) await figma.loadFontAsync({ family: "Inter", style: s })

const paintStyles = await figma.getLocalPaintStylesAsync()
const textStyles = await figma.getLocalTextStylesAsync()
const rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const P = name => paintStyles.find(s => s.name === name)
const T = name => textStyles.find(s => s.name === name)
const mono = T("Type/Mono"); if (mono) await figma.loadFontAsync(mono.fontName)
const fillStyle = async (node, name) => { const s = P(name); if (s) await node.setFillStyleIdAsync(s.id); else notes.push(`Missing color style ${name}`) }
const strokeStyle = async (node, name) => { const s = P(name); if (s) await node.setStrokeStyleIdAsync(s.id); else notes.push(`Missing color style ${name}`) }
const border = async (node, name = "Color/border", w = 1) => { node.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(node, name); node.strokeWeight = w; node.strokeAlign = "INSIDE" }
const text = async (parent, chars, typeName, colorName, name) => {
  const t = figma.createText(); parent.appendChild(t)
  const st = T(typeName)
  t.fontName = st ? st.fontName : { family: "Inter", style: "Regular" }
  t.characters = chars; t.name = name || chars
  if (st) await t.setTextStyleIdAsync(st.id); else notes.push(`Missing text style ${typeName}`)
  await fillStyle(t, colorName)
  return t
}
const cell = async (parent, chars, typeName, colorName, name, w, align = "LEFT") => {
  const t = await text(parent, chars, typeName, colorName, name)
  t.textAutoResize = "HEIGHT"; t.resize(w, t.height); t.textAlignHorizontal = align
  return t
}
const frame = (name, dir, parent) => {
  const f = figma.createFrame(); f.name = name; if (parent) parent.appendChild(f)
  f.layoutMode = dir; f.fills = []; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"
  return f
}
const comp = (name, dir) => {
  const c = figma.createComponent(); c.name = name
  c.layoutMode = dir; c.fills = []; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "AUTO"
  return c
}
const pad = (n, v, h) => { n.paddingTop = n.paddingBottom = v; n.paddingLeft = n.paddingRight = h }
const sideStroke = (n, side, w) => {
  n.strokeAlign = "INSIDE"
  n.strokeTopWeight = side === "top" ? w : 0; n.strokeBottomWeight = side === "bottom" ? w : 0
  n.strokeLeftWeight = side === "left" ? w : 0; n.strokeRightWeight = side === "right" ? w : 0
}
const fixedWidth = (n, w) => { const isH = n.layoutMode === "HORIZONTAL"; if (isH) n.primaryAxisSizingMode = "FIXED"; else n.counterAxisSizingMode = "FIXED"; n.resize(w, Math.max(n.height, 1)); if (isH) n.counterAxisSizingMode = "AUTO"; else n.primaryAxisSizingMode = "AUTO" }
const fillW = n => { n.layoutSizingHorizontal = "FILL" }
const wrap = t => { t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT" }
const loadFonts = async root => {
  for (const t of root.findAllWithCriteria({ types: ["TEXT"] })) {
    const fonts = t.fontName === figma.mixed ? t.getRangeAllFontNames(0, t.characters.length) : [t.fontName]
    for (const f of fonts) await figma.loadFontAsync(f)
  }
}
const keyOf = (inst, base) => Object.keys(inst.componentProperties).find(x => x.split("#")[0] === base)
const setProps = async (inst, values) => {
  await loadFonts(inst)
  const props = {}
  for (const [base, val] of Object.entries(values)) { const k = keyOf(inst, base); if (k) props[k] = val; else notes.push(`${inst.name}: no "${base}" property`) }
  if (Object.keys(props).length) inst.setProperties(props)
}
const variantOf = (set, want) => set.children.find(v => Object.entries(want).every(([k, val]) => v.name.split(", ").includes(`${k}=${val}`)))
const pick = (name, want = {}) => {
  const m = findMaster(name); if (!m) throw new Error("Not found in library: " + name)
  if (m.type === "COMPONENT") return m
  const v = Object.keys(want).length ? variantOf(m, want) : (m.defaultVariant || m.children[0])
  if (!v) throw new Error(`${name}: no variant ${JSON.stringify(want)}`)
  return v
}
const makeSet = (variants, name) => {
  const set = figma.combineAsVariants(variants, page); set.name = name
  set.layoutMode = "VERTICAL"; set.primaryAxisSizingMode = "AUTO"; set.counterAxisSizingMode = "AUTO"
  set.itemSpacing = 16; pad(set, 16, 16)
  return set
}
const bindSet = (set, prop, def, layerName) => {
  const k = set.addComponentProperty(prop, "TEXT", def)
  for (const v of set.children) { const t = v.findOne(n => n.name === layerName && n.type === "TEXT"); if (t) t.componentPropertyReferences = { characters: k } }
}
const bind = (c, prop, textNode) => { const k = c.addComponentProperty(prop, "TEXT", textNode.characters); textNode.componentPropertyReferences = { characters: k } }
const rowFor = async label => {
  let r = lib.children.find(n => n.name === "Row · " + label)
  if (!r) {
    r = frame("Row · " + label, "VERTICAL", lib); r.itemSpacing = 16
    await text(r, label.toUpperCase(), "Type/Label", "Color/muted", "Row label")
    const items = frame("Items", "HORIZONTAL", r); items.itemSpacing = 32; items.counterAxisAlignItems = "MIN"
  }
  return r.children.find(n => n.name === "Items")
}
const card = async (name, parent) => {
  const f = frame(name, "VERTICAL", parent); f.cornerRadius = 6; f.clipsContent = true
  await fillStyle(f, "Color/canvas"); await border(f)
  return f
}
const cardHead = async (parent, title, sub) => {
  const h = frame("Head", "VERTICAL", parent); fillW(h); pad(h, 12, 16); h.itemSpacing = 2
  await border(h); sideStroke(h, "bottom", 1)
  await text(h, title, "Type/Heading", "Color/ink", "Title")
  if (sub) { const s = await text(h, sub, "Type/Small", "Color/muted", "Subtitle"); wrap(s) }
  return h
}

// =============== LIBRARY ADDITIONS ===============

// ---------- Card/StatInput (budget box in the stat strip) ----------
if (!findMaster("Card/StatInput")) {
  const c = comp("Card/StatInput", "HORIZONTAL"); c.counterAxisAlignItems = "CENTER"; c.itemSpacing = 10; pad(c, 6, 14); c.cornerRadius = 6
  await fillStyle(c, "Color/canvas"); await border(c)
  fixedWidth(c, 320)
  const inp = pick("Input/Number").createInstance(); c.appendChild(inp); inp.isExposedInstance = true
  const l = await text(c, "analyst budget", "Type/Small", "Color/muted", "Label"); wrap(l)
  bind(c, "Label", l)
  const row = await rowFor("Tuning"); row.appendChild(c)
  made.push("Card/StatInput")
}

// ---------- Table/GapHeader + Table/GapRow (Direction=Over|Under) ----------
const gapCells = async (c, vals, header, dir) => {
  const tStyle = header ? "Type/Label" : "Type/Label"
  const muted = "Color/muted"
  const r = await text(c, vals[0], header ? "Type/Label" : "Type/Label", header ? muted : "Color/ink", "Rule"); wrap(r)
  await cell(c, vals[1], tStyle, header ? muted : "Color/ink", "S", COLS.S, "RIGHT")
  await cell(c, vals[2], tStyle, header ? muted : "Color/ink", "Observed", COLS.Observed, "RIGHT")
  await cell(c, vals[3], tStyle, header ? muted : "Color/ink", "Allowed", COLS.Allowed, "RIGHT")
  await cell(c, vals[4], header ? "Type/Label" : "Type/BodyStrong", header ? muted : (dir === "Under" ? "Color/primary" : "Color/accent"), "Gap", COLS.Gap, "RIGHT")
  await cell(c, vals[5], header ? "Type/Label" : "Type/Mono", header ? muted : "Color/ink", "Change", COLS.Change, "LEFT")
}
if (!findMaster("Table/GapHeader")) {
  const c = comp("Table/GapHeader", "HORIZONTAL"); pad(c, 8, 12); c.itemSpacing = 12; c.counterAxisAlignItems = "CENTER"
  await fillStyle(c, "Color/surface"); await border(c); sideStroke(c, "bottom", 1)
  fixedWidth(c, 760)
  await gapCells(c, ["Rule", "S", "Observed/h", "Allowed/h", "Gap", "Change"], true)
  const row = await rowFor("Tuning"); row.appendChild(c)
  made.push("Table/GapHeader")
}
if (!findMaster("Table/GapRow")) {
  const vs = []
  for (const dir of ["Over", "Under"]) {
    const c = comp(`Direction=${dir}`, "HORIZONTAL"); pad(c, 8, 12); c.itemSpacing = 12; c.counterAxisAlignItems = "CENTER"
    await fillStyle(c, "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
    fixedWidth(c, 760)
    await gapCells(c, ["Brute force at web server", "5", "194", "3.2", "+191", "W 5→30 · N_sat 60→120"], false, dir)
    vs.push(c)
  }
  const set = makeSet(vs, "Table/GapRow")
  const d = ["Brute force at web server", "5", "194", "3.2", "+191", "W 5→30 · N_sat 60→120"]
  ;["Rule", "S", "Observed", "Allowed", "Gap", "Change"].forEach((p, i) => bindSet(set, p, d[i], p))
  const row = await rowFor("Tuning"); row.appendChild(set)
  made.push("Table/GapRow")
}

// ---------- List/CheckItem (State=Pass|Fail) ----------
if (!findMaster("List/CheckItem")) {
  const vs = []
  for (const st of ["Pass", "Fail"]) {
    const c = comp(`State=${st}`, "HORIZONTAL"); c.itemSpacing = 8; c.counterAxisAlignItems = "MIN"
    fixedWidth(c, 560)
    const m = await cell(c, st === "Pass" ? "✓" : "✕", "Type/BodyStrong", st === "Pass" ? "Color/green" : "Color/accent", "Mark", 14, "CENTER")
    const t = await text(c, "Attack recall 7 of 7", "Type/Label", "Color/ink", "Text"); wrap(t)
    vs.push(c)
  }
  const set = makeSet(vs, "List/CheckItem")
  bindSet(set, "Text", "Attack recall 7 of 7", "Text")
  const row = await rowFor("Tuning"); row.appendChild(set)
  made.push("List/CheckItem")
}

// ---------- Code/DiffLine ----------
if (!findMaster("Code/DiffLine")) {
  const c = comp("Code/DiffLine", "VERTICAL"); pad(c, 8, 12); c.itemSpacing = 2
  await fillStyle(c, "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
  fixedWidth(c, 560)
  const line = frame("Change", "HORIZONTAL", c); line.itemSpacing = 6; line.counterAxisAlignItems = "CENTER"
  const r = await text(line, "exploit@win_vista_host.window_min:", "Type/Mono", "Color/ink", "Rule")
  const o = await text(line, "5", "Type/Mono", "Color/accent", "Old")
  await text(line, "→", "Type/Mono", "Color/muted", "Arrow")
  const n = await text(line, "2", "Type/Mono", "Color/green", "New")
  const w = await text(c, "Gap −1.9/h: under-alerting for its priority.", "Type/Small", "Color/muted", "Why"); wrap(w)
  bind(c, "Rule", r); bind(c, "Old", o); bind(c, "New", n); bind(c, "Why", w)
  const row = await rowFor("Tuning"); row.appendChild(c)
  made.push("Code/DiffLine")
}

// ---------- Code/LogLine (Tone=Command|Plain|Pass|Fail) ----------
if (!findMaster("Code/LogLine")) {
  const tones = { Command: "Color/logBlue", Plain: "Color/logText", Pass: "Color/logGreen", Fail: "Color/logRed" }
  const vs = []
  for (const [tone, color] of Object.entries(tones)) {
    const c = comp(`Tone=${tone}`, "HORIZONTAL"); await fillStyle(c, "Color/logBg"); pad(c, 0, 0)
    fixedWidth(c, 560)
    const t = await text(c, "evaluate: reduction 99.2%, recall 7/7, benign raised 0", "Type/Mono", color, "Text"); wrap(t)
    vs.push(c)
  }
  const set = makeSet(vs, "Code/LogLine")
  bindSet(set, "Text", "evaluate: reduction 99.2%, recall 7/7, benign raised 0", "Text")
  const row = await rowFor("Tuning"); row.appendChild(set)
  made.push("Code/LogLine")
}

// =============== SCREEN ===============
let screen = page.children.find(n => n.name === SCREEN_NAME)
if (screen) {
  notes.push(`"${SCREEN_NAME}" already exists, so it was not rebuilt. Rename or delete it to build a fresh one.`)
} else {
  const replay = page.children.find(n => n.name === "IDEA-X · Replay")
  screen = figma.createFrame(); page.appendChild(screen); screen.name = SCREEN_NAME
  screen.layoutMode = "VERTICAL"; screen.counterAxisSizingMode = "FIXED"
  screen.resize(1440, 900); screen.primaryAxisSizingMode = "AUTO"; await fillStyle(screen, "Color/canvas")
  screen.x = replay ? replay.x + replay.width + 120 : lib.x + lib.width + 200; screen.y = 0

  // header with the Tuning tab selected
  const header = pick("Navigation/AppHeader").createInstance(); screen.appendChild(header); fillW(header)
  for (const tab of header.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Tab · "))) {
    await setProps(tab, { State: tab.name === "Tab · Tuning" ? "Selected" : "Default" })
  }

  const body = frame("Body", "VERTICAL", screen); fillW(body); body.paddingTop = 20; body.paddingBottom = 28; body.paddingLeft = body.paddingRight = 32; body.itemSpacing = 16

  // title row
  const titleRow = frame("Title row", "HORIZONTAL", body); fillW(titleRow); titleRow.primaryAxisAlignItems = "SPACE_BETWEEN"; titleRow.counterAxisAlignItems = "CENTER"
  const tl = frame("Run", "VERTICAL", titleRow); tl.itemSpacing = 2
  await text(tl, RUN.Title, "Type/PageTitle", "Color/ink", "Run title")
  await text(tl, RUN.Sub, "Type/Small", "Color/muted", "Run meta")
  const actions = frame("Actions", "HORIZONTAL", titleRow); actions.itemSpacing = 10; actions.counterAxisAlignItems = "CENTER"
  const status = pick("Badge/Status", { Tone: "Pass" }).createInstance(); actions.appendChild(status); await setProps(status, { Label: RUN.Status })
  const view = pick("Button/Secondary").createInstance(); actions.appendChild(view); await setProps(view, { Label: "View tuned_rules.yaml", "Show Icon": false })
  const again = pick("Button/Primary").createInstance(); actions.appendChild(again); await setProps(again, { Label: "Run tuning again", "Show Icon": false })

  // stat strip
  const strip = frame("Summary", "HORIZONTAL", body); fillW(strip); strip.itemSpacing = 12
  const bud = pick("Card/StatInput").createInstance(); strip.appendChild(bud); bud.layoutGrow = 1; fillW(bud)
  const num = bud.findOne(n => n.type === "INSTANCE"); if (num) await setProps(num, { Value: BUDGET, Suffix: "alerts / hour" })
  await setProps(bud, { Label: "analyst budget" })
  for (const s of STATS) {
    const inst = pick("Card/Stat", { Tone: s.Tone }).createInstance(); strip.appendChild(inst); inst.layoutGrow = 1; fillW(inst)
    await setProps(inst, { Value: s.Value, Label: s.Label })
  }

  // two columns
  const cols = frame("Columns", "HORIZONTAL", body); fillW(cols); cols.itemSpacing = 16; cols.counterAxisAlignItems = "MIN"
  const left = await card("Where the load comes from", cols); left.layoutGrow = 1; fillW(left)
  await cardHead(left, "Where the load comes from", "Per rule, from the original run. Allowed = budget × weight ÷ total weight. Change shown for attempt 2.")
  const th = pick("Table/GapHeader").createInstance(); left.appendChild(th); fillW(th)
  for (const g of GAPS) {
    const r = pick("Table/GapRow", { Direction: g[5] }).createInstance(); left.appendChild(r); fillW(r)
    await setProps(r, { Rule: g[0], S: g[1], Observed: g[2], Allowed: g[3], Gap: g[4], Change: g[6] })
  }

  const right = frame("Right column", "VERTICAL", cols); right.itemSpacing = 12; right.counterAxisSizingMode = "FIXED"; right.resize(560, right.height); right.primaryAxisSizingMode = "AUTO"

  const att = await card("Attempts", right); fillW(att)
  const ah = frame("Head", "HORIZONTAL", att); fillW(ah); pad(ah, 12, 16); ah.primaryAxisAlignItems = "SPACE_BETWEEN"; ah.counterAxisAlignItems = "CENTER"
  await text(ah, "Attempts", "Type/Heading", "Color/ink", "Title")
  const sw = frame("Attempt switch", "HORIZONTAL", ah); sw.cornerRadius = 4; sw.clipsContent = true; await border(sw)
  for (let i = 0; i < ATTEMPTS.length; i++) {
    const it = pick("Control/SegmentItem", { Selected: i === ATTEMPTS.length - 1 ? "True" : "False" }).createInstance(); sw.appendChild(it)
    await setProps(it, { Label: ATTEMPTS[i] })
  }
  const list = frame("Checks", "VERTICAL", att); fillW(list); list.paddingLeft = list.paddingRight = 16; list.paddingBottom = 12; list.itemSpacing = 6
  for (const [st, t] of CHECKS) { const ci = pick("List/CheckItem", { State: st }).createInstance(); list.appendChild(ci); fillW(ci); await setProps(ci, { Text: t }) }
  const cn = await text(list, CHECK_NOTE, "Type/Small", "Color/muted", "Note"); wrap(cn)

  const ch = await card("Rule changes", right); fillW(ch)
  await cardHead(ch, "Rule changes in this attempt", "Old value → new value, with Codex’s reason")
  for (const [r, o, n, w] of DIFFS) { const d = pick("Code/DiffLine").createInstance(); ch.appendChild(d); fillW(d); await setProps(d, { Rule: r, Old: o, New: n, Why: w }) }

  const lg = frame("Codex log", "VERTICAL", right); fillW(lg); lg.itemSpacing = 6
  await text(lg, "Codex log", "Type/Label", "Color/muted", "Label")
  const box = frame("Log", "VERTICAL", lg); fillW(box); pad(box, 10, 12); box.itemSpacing = 0; box.cornerRadius = 4; await fillStyle(box, "Color/logBg")
  for (const [tone, t] of LOG) { const l = pick("Code/LogLine", { Tone: tone }).createInstance(); box.appendChild(l); fillW(l); await setProps(l, { Text: t }) }

  const notice = pick("Feedback/Notice").createInstance(); body.appendChild(notice); fillW(notice)
  await setProps(notice, { Message: "Codex proposes settings and tests them. A fixed guardrail decides whether they are used. Budget and the 0.2 benign weight are operator inputs." })

  made.push(`Screen "${SCREEN_NAME}"`)
  figma.viewport.scrollAndZoomIntoView([screen])
}

const out = [made.length ? "Created:" : "Nothing new.", ...made.map(m => "  + " + m)]
print(out.concat(notes.length ? ["", "Notes:", ...notes.map(n => "  ⚠ " + n)] : []).join("\n"))
