// IDEA-X · 04 Audit log + Emails  (ADDS ONLY — changes nothing that already exists)
// Needs scripts 01–03. Creates the parts in "IDEA-X Library", then builds
// "IDEA-X · Audit log" and "IDEA-X · Emails". Safe to re-run.

// ===== SETTINGS (all screen texts live here) =====
const PAGE_NAME = "IDEA-X"
const LIB_NAME = "IDEA-X Library"
const AUDIT_NAME = "IDEA-X · Audit log"
const EMAILS_NAME = "IDEA-X · Emails"

const AUDIT_TITLE = "Audit log"
const AUDIT_SUB = "Every tuning run is kept, including failed ones. Original alerts are never deleted."
const RUN_COLS = { Run: 70, Started: 150, Budget: 90, Attempts: 90, Result: 190, Alerts: 190, Rules: 130 }   // Recall fills the rest
const RUNS = [  // Run, Started, Budget, Attempts, Result tone, Result label, Alerts, Rules, Recall, selected?
  ["#3", "6 Nov, 21:40", "20/h", "2", "Pass", "Passed", "5,483 → 46", "8", "7 of 7", true],
  ["#2", "6 Nov, 20:55", "10/h", "3", "Fail", "Failed, not used", "5,483 → 31", "8", "6 of 7", false],
  ["#1", "6 Nov, 20:10", "20/h", "1", "Pass", "Passed", "5,483 → 58", "6", "7 of 7", false]
]
const STAGES = [
  { Label: "Before tuning", Title: "373 alerts / hour", Files: "original_alerts.json · flow_table.json", kind: "Bullet",
    items: ["Burn rate 18.6× against 20/h", "Biggest gap: Brute force at web server, +191/h", "Under-alerting: Exploit at Windows Vista host, −1.9/h"] },
  { Label: "Rule changes", Title: "8 rules, 14 values", Files: "tuned_rules.yaml · codex_log.txt", kind: "Bullet",
    items: ["Window W changed on 8 rules", "N_sat changed on 6 rules", "No score below its base S"] },
  { Label: "After tuning", Title: "46 grouped alerts", Files: "tuned_groups.json · evaluate.json", kind: "Pass",
    items: ["Attack recall 7 of 7", "0 benign groups raised", "7 High groups, 7 emails"] }
]

const EMAILS_TITLE = "Emails to the on-call analyst"
const EMAILS_SUB = "Same moment in the replay (1:55:26). Original rules email every High alert. Tuned rules email once per High group."
const FLOOD = { Label: "Original rules", Count: "756 emails", more: "+ 747 more, mostly identical",
  items: Array.from({ length: 9 }, (_, i) => ({ Subject: "[High] Exploit on Windows Vista host", Time: `1:55:${String(26 - i).padStart(2, "0")}`, Meta: "192.168.10.8 · 1 event" })) }
const TUNED_MAIL = { Label: "Tuned rules", Count: "3 emails", items: [
  { Subject: "[High] Exploit on Windows Vista host", Time: "1:41", Meta: "192.168.10.8 · 756 events in group" },
  { Subject: "[High] Web probe on web server", Time: "0:58", Meta: "192.168.10.50 · raised from Low" },
  { Subject: "[High] Brute force on web server", Time: "0:09", Meta: "192.168.10.50 · raised from Medium" }] }
const PREVIEW = {
  head: [["From", "IDEA-X alerts"], ["To", "SOC on-call"], ["Subject", "[High] Exploit on Windows Vista host (192.168.10.8), 756 events"]],
  Intro: "A group of related alerts reached High.",
  fields: [["Target", "192.168.10.8, Windows Vista host"], ["Attack type", "Exploit"], ["Score", "10 (base 9, raised by volume)"], ["Events", "756, first at 1:41:10"], ["Source", "205.174.165.73"], ["Rule settings", "W 2 min, N_sat 3 (run #3)"], ["Label", "Attack (CIC-IDS2017)"]],
  Footnote: "One email per group. New events update the group on the dashboard instead of sending more email.",
  Button: "Open group in IDEA-X"
}
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
if (!findMaster("List/CheckItem")) throw new Error("List/CheckItem not found. Run script 03 first.")

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
const newScreen = async (name, tab, after) => {
  const s = figma.createFrame(); page.appendChild(s); s.name = name
  s.layoutMode = "VERTICAL"; s.counterAxisSizingMode = "FIXED"; s.resize(1440, 900); s.primaryAxisSizingMode = "AUTO"
  await fillStyle(s, "Color/canvas")
  const prev = page.children.find(n => n.name === after)
  s.x = prev ? prev.x + prev.width + 120 : lib.x + lib.width + 200; s.y = 0
  const header = pick("Navigation/AppHeader").createInstance(); s.appendChild(header); fillW(header)
  for (const t of header.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Tab · "))) await setProps(t, { State: t.name === "Tab · " + tab ? "Selected" : "Default" })
  const body = frame("Body", "VERTICAL", s); fillW(body); body.paddingTop = 20; body.paddingBottom = 28; body.paddingLeft = body.paddingRight = 32; body.itemSpacing = 16
  return body
}
const titleBlock = async (body, title, sub) => {
  const tb = frame("Title", "VERTICAL", body); tb.itemSpacing = 2; fillW(tb)
  await text(tb, title, "Type/PageTitle", "Color/ink", "Page title")
  const s = await text(tb, sub, "Type/Small", "Color/muted", "Page subtitle"); wrap(s)
}

// =============== LIBRARY ADDITIONS ===============

// ---------- Table/RunHeader + Table/RunRow (State=Default|Selected) ----------
const runCells = async (c, header) => {
  const st = header ? "Type/Label" : "Type/Label", col = header ? "Color/muted" : "Color/ink"
  await cell(c, header ? "Run" : "#3", header ? st : "Type/BodyStrong", col, "Run", RUN_COLS.Run)
  await cell(c, header ? "Started" : "6 Nov, 21:40", st, col, "Started", RUN_COLS.Started)
  await cell(c, header ? "Budget" : "20/h", st, col, "Budget", RUN_COLS.Budget, "RIGHT")
  await cell(c, header ? "Attempts" : "2", st, col, "Attempts", RUN_COLS.Attempts, "RIGHT")
  if (header) await cell(c, "Result", st, col, "Result", RUN_COLS.Result)
  else {
    const holder = frame("Result", "HORIZONTAL", c); holder.primaryAxisSizingMode = "FIXED"; holder.resize(RUN_COLS.Result, 20); holder.counterAxisSizingMode = "AUTO"
    const b = pick("Badge/Status", { Tone: "Pass" }).createInstance(); holder.appendChild(b); b.name = "Result badge"
  }
  await cell(c, header ? "Alerts before → after" : "5,483 → 46", st, col, "Alerts", RUN_COLS.Alerts, "RIGHT")
  await cell(c, header ? "Rules changed" : "8", st, col, "Rules", RUN_COLS.Rules, "RIGHT")
  const r = await text(c, header ? "Attack recall" : "7 of 7", st, col, "Recall"); wrap(r)
}
if (!findMaster("Table/RunHeader")) {
  const c = comp("Table/RunHeader", "HORIZONTAL"); pad(c, 8, 12); c.itemSpacing = 12; c.counterAxisAlignItems = "CENTER"
  await fillStyle(c, "Color/surface"); await border(c); sideStroke(c, "bottom", 1)
  fixedWidth(c, 1376)
  await runCells(c, true)
  const row = await rowFor("Audit"); row.appendChild(c)
  made.push("Table/RunHeader")
}
if (!findMaster("Table/RunRow")) {
  const vs = []
  for (const st of ["Default", "Selected"]) {
    const c = comp(`State=${st}`, "HORIZONTAL"); pad(c, 10, 12); c.itemSpacing = 12; c.counterAxisAlignItems = "CENTER"
    await fillStyle(c, st === "Selected" ? "Color/blueTint" : "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
    fixedWidth(c, 1376)
    await runCells(c, false)
    vs.push(c)
  }
  const set = makeSet(vs, "Table/RunRow")
  const d = { Run: "#3", Started: "6 Nov, 21:40", Budget: "20/h", Attempts: "2", Alerts: "5,483 → 46", Rules: "8", Recall: "7 of 7" }
  for (const [p, v] of Object.entries(d)) bindSet(set, p, v, p)
  for (const v of set.children) { const b = v.findOne(n => n.name === "Result badge"); if (b) b.isExposedInstance = true }
  const row = await rowFor("Audit"); row.appendChild(set)
  made.push("Table/RunRow")
}

// ---------- List/Bullet ----------
if (!findMaster("List/Bullet")) {
  const c = comp("List/Bullet", "HORIZONTAL"); c.itemSpacing = 8; c.counterAxisAlignItems = "MIN"
  fixedWidth(c, 400)
  await cell(c, "·", "Type/BodyStrong", "Color/muted", "Mark", 14, "CENTER")
  const t = await text(c, "Burn rate 18.6× against 20/h", "Type/Label", "Color/ink", "Text"); wrap(t)
  bind(c, "Text", t)
  const row = await rowFor("Audit"); row.appendChild(c)
  made.push("List/Bullet")
}

// ---------- Card/AuditStage ----------
if (!findMaster("Card/AuditStage")) {
  const c = comp("Card/AuditStage", "VERTICAL"); pad(c, 14, 16); c.itemSpacing = 8; c.cornerRadius = 6
  await fillStyle(c, "Color/canvas"); await border(c)
  fixedWidth(c, 440)
  const l = await text(c, "Before tuning", "Type/Label", "Color/muted", "Label")
  const ti = await text(c, "373 alerts / hour", "Type/Heading", "Color/ink", "Title")
  const list = frame("Items", "VERTICAL", c); fillW(list); list.itemSpacing = 4
  for (let i = 0; i < 3; i++) { const b = pick("List/Bullet").createInstance(); list.appendChild(b); fillW(b); b.name = "Item " + (i + 1) }
  const f = await text(c, "original_alerts.json · flow_table.json", "Type/Mono", "Color/muted", "Files"); wrap(f)
  bind(c, "Label", l); bind(c, "Title", ti); bind(c, "Files", f)
  for (const b of list.children) b.isExposedInstance = true
  const row = await rowFor("Audit"); row.appendChild(c)
  made.push("Card/AuditStage")
}

// ---------- List/EmailItem (State=Default|Selected) ----------
if (!findMaster("List/EmailItem")) {
  const vs = []
  for (const st of ["Default", "Selected"]) {
    const c = comp(`State=${st}`, "VERTICAL"); pad(c, 8, 12); c.itemSpacing = 2
    await fillStyle(c, st === "Selected" ? "Color/blueTint" : "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
    fixedWidth(c, 380)
    const top = frame("Top", "HORIZONTAL", c); fillW(top); top.itemSpacing = 8; top.counterAxisAlignItems = "CENTER"
    const s = await text(top, "[High] Exploit on Windows Vista host", "Type/BodyStrong", "Color/ink", "Subject"); s.layoutSizingHorizontal = "FILL"; s.textAutoResize = "HEIGHT"; s.textTruncation = "ENDING"; s.maxLines = 1
    await text(top, "1:55:26", "Type/Small", "Color/muted", "Time")
    const m = await text(c, "192.168.10.8 · 1 event", "Type/Small", "Color/muted", "Meta"); wrap(m)
    vs.push(c)
  }
  const set = makeSet(vs, "List/EmailItem")
  bindSet(set, "Subject", "[High] Exploit on Windows Vista host", "Subject")
  bindSet(set, "Time", "1:55:26", "Time")
  bindSet(set, "Meta", "192.168.10.8 · 1 event", "Meta")
  const row = await rowFor("Emails"); row.appendChild(set)
  made.push("List/EmailItem")
}

// ---------- List/FieldRow ----------
if (!findMaster("List/FieldRow")) {
  const c = comp("List/FieldRow", "HORIZONTAL"); c.itemSpacing = 12; c.counterAxisAlignItems = "MIN"; c.paddingTop = c.paddingBottom = 4
  await border(c); sideStroke(c, "bottom", 1)
  fixedWidth(c, 480)
  const l = await cell(c, "Target", "Type/Small", "Color/muted", "Label", 96)
  const v = await text(c, "192.168.10.8, Windows Vista host", "Type/Label", "Color/ink", "Value"); wrap(v)
  bind(c, "Label", l); bind(c, "Value", v)
  const row = await rowFor("Emails"); row.appendChild(c)
  made.push("List/FieldRow")
}

// ---------- Card/EmailPreview ----------
if (!findMaster("Card/EmailPreview")) {
  const c = comp("Card/EmailPreview", "VERTICAL"); pad(c, 16, 20); c.itemSpacing = 12; c.cornerRadius = 6
  await fillStyle(c, "Color/canvas"); await border(c)
  fixedWidth(c, 520)
  const head = frame("Header", "VERTICAL", c); fillW(head)
  for (let i = 0; i < 3; i++) { const r = pick("List/FieldRow").createInstance(); head.appendChild(r); fillW(r); r.name = "Header " + (i + 1) }
  const intro = await text(c, PREVIEW.Intro, "Type/Body", "Color/ink", "Intro"); wrap(intro)
  const fields = frame("Fields", "VERTICAL", c); fillW(fields)
  for (let i = 0; i < 7; i++) { const r = pick("List/FieldRow").createInstance(); fields.appendChild(r); fillW(r); r.name = "Field " + (i + 1) }
  const foot = await text(c, PREVIEW.Footnote, "Type/Small", "Color/muted", "Footnote"); wrap(foot)
  const btn = pick("Button/Primary").createInstance(); c.appendChild(btn); btn.name = "Action"
  bind(c, "Intro", intro); bind(c, "Footnote", foot)
  for (const r of [...head.children, ...fields.children]) r.isExposedInstance = true
  btn.isExposedInstance = true
  const row = await rowFor("Emails"); row.appendChild(c)
  made.push("Card/EmailPreview")
}

// =============== SCREEN: AUDIT LOG ===============
if (page.children.find(n => n.name === AUDIT_NAME)) notes.push(`"${AUDIT_NAME}" already exists, so it was not rebuilt.`)
else {
  const body = await newScreen(AUDIT_NAME, "Audit log", "IDEA-X · Tuning")
  await titleBlock(body, AUDIT_TITLE, AUDIT_SUB)
  const table = await card("Runs", body); fillW(table)
  const th = pick("Table/RunHeader").createInstance(); table.appendChild(th); fillW(th)
  for (const r of RUNS) {
    const inst = pick("Table/RunRow", { State: r[9] ? "Selected" : "Default" }).createInstance(); table.appendChild(inst); fillW(inst)
    await setProps(inst, { Run: r[0], Started: r[1], Budget: r[2], Attempts: r[3], Alerts: r[6], Rules: r[7], Recall: r[8] })
    const b = inst.findOne(n => n.type === "INSTANCE" && n.name === "Result badge")
    if (b) { await setProps(b, { Tone: r[4] }); await setProps(b, { Label: r[5] }) }
  }
  await text(body, "Run #3 in detail", "Type/Heading", "Color/ink", "Detail title")
  const stages = frame("Stages", "HORIZONTAL", body); fillW(stages); stages.itemSpacing = 16; stages.counterAxisAlignItems = "MIN"
  for (const s of STAGES) {
    const inst = pick("Card/AuditStage").createInstance(); stages.appendChild(inst); inst.layoutGrow = 1; fillW(inst)
    await setProps(inst, { Label: s.Label, Title: s.Title, Files: s.Files })
    const items = inst.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Item "))
    for (let i = 0; i < items.length; i++) {
      let it = items[i]
      if (s.kind === "Pass") { try { it.swapComponent(pick("List/CheckItem", { State: "Pass" })) } catch (e) { notes.push("Could not swap a bullet to a check mark: " + e.message) } }
      await setProps(it, { Text: s.items[i] || "" })
    }
  }
  const notice = pick("Feedback/Notice").createInstance(); body.appendChild(notice); fillW(notice)
  await setProps(notice, { Message: "Failed runs stay in the log and are never used. Each run keeps its input data, the YAML diff, the Codex log and the evaluate result." })
  made.push(`Screen "${AUDIT_NAME}"`)
}

// =============== SCREEN: EMAILS ===============
if (page.children.find(n => n.name === EMAILS_NAME)) notes.push(`"${EMAILS_NAME}" already exists, so it was not rebuilt.`)
else {
  const body = await newScreen(EMAILS_NAME, "Emails", AUDIT_NAME)
  await titleBlock(body, EMAILS_TITLE, EMAILS_SUB)
  const cols = frame("Columns", "HORIZONTAL", body); fillW(cols); cols.itemSpacing = 16; cols.counterAxisAlignItems = "MIN"
  const listCard = async (data, countColor) => {
    const f = await card(data.Label, cols); f.counterAxisSizingMode = "FIXED"; f.resize(380, f.height); f.primaryAxisSizingMode = "AUTO"
    const h = frame("Head", "VERTICAL", f); fillW(h); pad(h, 12, 16); h.itemSpacing = 2; await border(h); sideStroke(h, "bottom", 1)
    await text(h, data.Label, "Type/Label", "Color/muted", "Label")
    await text(h, data.Count, "Type/Score", countColor, "Count")
    for (let i = 0; i < data.items.length; i++) {
      const it = pick("List/EmailItem", { State: data === TUNED_MAIL && i === 0 ? "Selected" : "Default" }).createInstance(); f.appendChild(it); fillW(it)
      await setProps(it, data.items[i])
    }
    if (data.more) { const m = frame("More", "HORIZONTAL", f); fillW(m); pad(m, 10, 12); m.primaryAxisAlignItems = "CENTER"; await text(m, data.more, "Type/Small", "Color/muted", "More") }
    return f
  }
  await listCard(FLOOD, "Color/ink")
  await listCard(TUNED_MAIL, "Color/green")
  const pv = pick("Card/EmailPreview").createInstance(); cols.appendChild(pv); pv.layoutGrow = 1; fillW(pv)
  await setProps(pv, { Intro: PREVIEW.Intro, Footnote: PREVIEW.Footnote })
  const hs = pv.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Header "))
  for (let i = 0; i < hs.length; i++) await setProps(hs[i], { Label: PREVIEW.head[i][0], Value: PREVIEW.head[i][1] })
  const fs = pv.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Field "))
  for (let i = 0; i < fs.length; i++) await setProps(fs[i], { Label: PREVIEW.fields[i][0], Value: PREVIEW.fields[i][1] })
  const btn = pv.findOne(n => n.type === "INSTANCE" && n.name === "Action"); if (btn) await setProps(btn, { Label: PREVIEW.Button, "Show Icon": false })
  made.push(`Screen "${EMAILS_NAME}"`)
}

const shown = page.children.filter(n => n.name === AUDIT_NAME || n.name === EMAILS_NAME)
if (shown.length) figma.viewport.scrollAndZoomIntoView(shown)
const out = [made.length ? "Created:" : "Nothing new.", ...made.map(m => "  + " + m)]
print(out.concat(notes.length ? ["", "Notes:", ...notes.map(n => "  ⚠ " + n)] : []).join("\n"))
