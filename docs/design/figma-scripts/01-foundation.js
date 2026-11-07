// IDEA-X · 01 Foundation  (ADDS ONLY — changes nothing that already exists)
// Creates: page "IDEA-X", a library frame, 2 text styles + 5 log colours,
// and the shared components every screen uses.
// Safe to re-run: anything that already exists is skipped.

// ===== SETTINGS =====
const PAGE_NAME = "IDEA-X"
const LIB_NAME = "IDEA-X Library"
const SOURCE_TEXT = "CIC-IDS2017 · Thursday · eve_demo_FINAL.json · 5,483 alerts"
const NOTICE_TEXT = "Attack and benign tags come from the CIC-IDS2017 labels. In a live deployment they would come from analyst feedback."
const TABS = ["Replay", "Tuning", "Audit log", "Emails"]
const SPEEDS = ["60×", "120×", "360×"]
const MONO_FAMILIES = ["JetBrains Mono", "Roboto Mono", "IBM Plex Mono"]   // first one installed wins
// ====================

await figma.loadAllPagesAsync()
const notes = [], made = []
const findMaster = name => figma.root.findOne(n => n.name === name &&
  (n.type === "COMPONENT_SET" || (n.type === "COMPONENT" && n.parent.type !== "COMPONENT_SET")))

// ---------- page ----------
let page = figma.root.children.find(p => p.name === PAGE_NAME)
if (!page) { page = figma.createPage(); page.name = PAGE_NAME; made.push(`Page "${PAGE_NAME}"`) }
await figma.setCurrentPageAsync(page)

// ---------- fonts ----------
for (const s of ["Regular", "Medium", "Semi Bold"]) await figma.loadFontAsync({ family: "Inter", style: s })
let MONO = null
for (const fam of MONO_FAMILIES) {
  try { await figma.loadFontAsync({ family: fam, style: "Regular" }); await figma.loadFontAsync({ family: fam, style: "Medium" }); MONO = fam; break } catch (e) {}
}
if (!MONO) { MONO = "Inter"; notes.push("No mono font found; Type/Mono falls back to Inter.") }

// ---------- styles ----------
const paintStyles = await figma.getLocalPaintStylesAsync()
const textStyles = await figma.getLocalTextStylesAsync()
const rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const ensurePaint = (name, hex) => {
  let s = paintStyles.find(x => x.name === name)
  if (!s) { s = figma.createPaintStyle(); s.name = name; s.paints = [{ type: "SOLID", color: rgb(hex) }]; paintStyles.push(s); made.push(`Color style ${name}`) }
  return s
}
const ensureText = (name, family, style, size, lh) => {
  let s = textStyles.find(x => x.name === name)
  if (!s) { s = figma.createTextStyle(); s.name = name; s.fontName = { family, style }; s.fontSize = size; s.lineHeight = { unit: "PIXELS", value: lh }; textStyles.push(s); made.push(`Text style ${name}`) }
  return s
}
ensurePaint("Color/logBg", "#0F1720")
ensurePaint("Color/logText", "#C9D4DF")
ensurePaint("Color/logBlue", "#8DB8E6")
ensurePaint("Color/logGreen", "#7FD3A6")
ensurePaint("Color/logRed", "#FF8A8D")
ensureText("Type/Mono", MONO, "Regular", 12, 18)
ensureText("Type/Display", "Inter", "Semi Bold", 44, 48)

// ---------- helpers ----------
const P = name => paintStyles.find(s => s.name === name)
const T = name => textStyles.find(s => s.name === name)
const fillStyle = async (node, name) => { const s = P(name); if (s) await node.setFillStyleIdAsync(s.id); else notes.push(`Missing color style ${name}`) }
const strokeStyle = async (node, name) => { const s = P(name); if (s) await node.setStrokeStyleIdAsync(s.id); else notes.push(`Missing color style ${name}`) }
const text = async (parent, chars, typeName, colorName, name) => {
  const t = figma.createText(); parent.appendChild(t)
  const st = T(typeName)
  t.fontName = st ? st.fontName : { family: "Inter", style: "Regular" }
  t.characters = chars; t.name = name || chars
  if (st) await t.setTextStyleIdAsync(st.id); else notes.push(`Missing text style ${typeName}`)
  await fillStyle(t, colorName)
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
const makeSet = (variants, name) => {
  const set = figma.combineAsVariants(variants, page); set.name = name
  set.layoutMode = "HORIZONTAL"; set.primaryAxisSizingMode = "AUTO"; set.counterAxisSizingMode = "AUTO"
  set.itemSpacing = 16; pad(set, 16, 16); set.counterAxisAlignItems = "CENTER"
  return set
}
const bindAll = (set, prop, def, layerName) => {
  const k = set.addComponentProperty(prop, "TEXT", def)
  for (const v of set.children) { const t = v.findOne(n => n.name === layerName && n.type === "TEXT"); if (t) t.componentPropertyReferences = { characters: k } }
  return k
}
const variantOf = (set, want) => set.children.find(v => Object.entries(want).every(([k, val]) => v.name.split(", ").includes(`${k}=${val}`)))

// ---------- library frame ----------
let lib = page.children.find(n => n.name === LIB_NAME)
if (!lib) {
  lib = figma.createFrame(); page.appendChild(lib); lib.name = LIB_NAME
  lib.layoutMode = "VERTICAL"; lib.primaryAxisSizingMode = "AUTO"; lib.counterAxisSizingMode = "AUTO"
  pad(lib, 40, 40); lib.itemSpacing = 40; lib.cornerRadius = 8; lib.x = 0; lib.y = 0
  await fillStyle(lib, "Color/surface")
  await text(lib, "IDEA-X Library", "Type/PageTitle", "Color/ink", "Title")
  made.push(`Frame "${LIB_NAME}"`)
}
const rowFor = async label => {
  let r = lib.children.find(n => n.name === "Row · " + label)
  if (!r) {
    r = frame("Row · " + label, "VERTICAL", lib); r.itemSpacing = 16
    await text(r, label.toUpperCase(), "Type/Label", "Color/muted", "Row label")
    const items = frame("Items", "HORIZONTAL", r); items.itemSpacing = 32; items.counterAxisAlignItems = "MIN"
  }
  return r.children.find(n => n.name === "Items")
}

// ---------- Brand/Logo ----------
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="330" viewBox="40 40 330 330"><g transform="translate(205 205)"><circle cx="0" cy="0" r="73" fill="#004488"/><path d="M-148 0 A148 148 0 0 1 45 -141" fill="none" stroke="#004488" stroke-width="31" stroke-linecap="round"/><path d="M80 -124 A148 148 0 0 1 133 62" fill="none" stroke="#6A9DCF" stroke-width="31" stroke-linecap="round"/><path d="M112 97 A148 148 0 0 1 51 139" fill="none" stroke="#004488" stroke-width="31" stroke-linecap="round"/><path d="M16 147 A148 148 0 0 1 -128 75" fill="none" stroke="#6A9DCF" stroke-width="31" stroke-linecap="round"/><circle cx="89" cy="-122" r="31" fill="#BD2024"/></g></svg>`
if (!findMaster("Brand/Logo")) {
  const c = comp("Brand/Logo", "HORIZONTAL"); c.itemSpacing = 10; c.counterAxisAlignItems = "CENTER"
  const mark = figma.createNodeFromSvg(MARK_SVG); mark.name = "Mark"; c.appendChild(mark); mark.rescale(32 / mark.width)
  const col = frame("Wordmark", "VERTICAL", c)
  await text(col, "IDEA-X", "Type/Heading", "Color/ink", "Name")
  await text(col, "Intrusion Detection Escalation", "Type/Small", "Color/muted", "Tagline")
  const row = await rowFor("Brand"); row.appendChild(c)
  made.push("Brand/Logo")
}

// ---------- Navigation/Tab (State=Default|Selected) ----------
if (!findMaster("Navigation/Tab")) {
  const mk = async sel => {
    const c = comp(`State=${sel ? "Selected" : "Default"}`, "HORIZONTAL"); pad(c, 10, 12)
    await text(c, "Replay", "Type/Label", sel ? "Color/primary" : "Color/muted", "Label")
    c.strokes = [{ type: "SOLID", color: rgb("#004488"), opacity: sel ? 1 : 0 }]
    if (sel) await strokeStyle(c, "Color/primary")
    sideStroke(c, "bottom", 2)
    return c
  }
  const set = makeSet([await mk(false), await mk(true)], "Navigation/Tab")
  bindAll(set, "Label", "Replay", "Label")
  const row = await rowFor("Navigation"); row.appendChild(set)
  made.push("Navigation/Tab")
}

// ---------- Badge/Status (Tone=Pass|Fail|Neutral|Info) ----------
if (!findMaster("Badge/Status")) {
  const tones = { Pass: ["Color/greenTint", "Color/green", "Passed"], Fail: ["Color/redTint", "Color/accent", "Failed"], Neutral: ["Color/surface", "Color/muted", "Benign"], Info: ["Color/blueTint", "Color/primary", "Info"] }
  const vs = []
  for (const [tone, [bg, fg, label]] of Object.entries(tones)) {
    const c = comp(`Tone=${tone}`, "HORIZONTAL"); pad(c, 2, 8); c.cornerRadius = 3
    await fillStyle(c, bg)
    await text(c, label, "Type/Label", fg, "Label")
    vs.push(c)
  }
  const set = makeSet(vs, "Badge/Status")
  const k = set.addComponentProperty("Label", "TEXT", "Passed")
  for (const v of set.children) v.findOne(n => n.name === "Label").componentPropertyReferences = { characters: k }
  const row = await rowFor("Badges"); row.appendChild(set)
  made.push("Badge/Status")
}

// ---------- Control/SegmentItem (Selected=False|True) + Control/SpeedSelector ----------
if (!findMaster("Control/SegmentItem")) {
  const mk = async sel => {
    const c = comp(`Selected=${sel ? "True" : "False"}`, "HORIZONTAL"); pad(c, 5, 11)
    await fillStyle(c, sel ? "Color/ink" : "Color/canvas")
    await text(c, "120×", "Type/Label", sel ? "Color/canvas" : "Color/ink", "Label")
    return c
  }
  const set = makeSet([await mk(false), await mk(true)], "Control/SegmentItem")
  bindAll(set, "Label", "120×", "Label")
  const row = await rowFor("Controls"); row.appendChild(set)
  made.push("Control/SegmentItem")
}
if (!findMaster("Control/SpeedSelector")) {
  const segSet = findMaster("Control/SegmentItem")
  const c = comp("Control/SpeedSelector", "HORIZONTAL"); c.cornerRadius = 4; c.clipsContent = true
  c.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(c, "Color/border"); c.strokeWeight = 1; c.strokeAlign = "INSIDE"
  for (const s of SPEEDS) {
    const inst = variantOf(segSet, { Selected: s === "120×" ? "True" : "False" }).createInstance()
    c.appendChild(inst); inst.name = "Speed " + s
    await setProps(inst, { Label: s })
  }
  for (const inst of c.children) inst.isExposedInstance = true
  const row = await rowFor("Controls"); row.appendChild(c)
  made.push("Control/SpeedSelector")
}

// ---------- Input/Number ----------
if (!findMaster("Input/Number")) {
  const c = comp("Input/Number", "HORIZONTAL"); c.itemSpacing = 8; c.counterAxisAlignItems = "CENTER"
  const box = frame("Box", "HORIZONTAL", c); pad(box, 4, 10); box.cornerRadius = 4
  await fillStyle(box, "Color/canvas"); box.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(box, "Color/border"); box.strokeWeight = 1
  const v = await text(box, "20", "Type/Heading", "Color/ink", "Value")
  const s = await text(c, "alerts / hour", "Type/Small", "Color/muted", "Suffix")
  const kv = c.addComponentProperty("Value", "TEXT", "20"); v.componentPropertyReferences = { characters: kv }
  const ks = c.addComponentProperty("Suffix", "TEXT", "alerts / hour"); s.componentPropertyReferences = { characters: ks }
  const row = await rowFor("Controls"); row.appendChild(c)
  made.push("Input/Number")
}

// ---------- Feedback/Notice ----------
if (!findMaster("Feedback/Notice")) {
  const c = comp("Feedback/Notice", "HORIZONTAL"); pad(c, 6, 12)
  c.primaryAxisSizingMode = "FIXED"; c.resize(800, 30); c.counterAxisSizingMode = "AUTO"
  await fillStyle(c, "Color/blueTint")
  c.strokes = [{ type: "SOLID", color: rgb("#6A9DCF") }]; await strokeStyle(c, "Color/secondary"); sideStroke(c, "left", 3)
  const t = await text(c, NOTICE_TEXT, "Type/Label", "Color/muted", "Message")
  t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT"
  const k = c.addComponentProperty("Message", "TEXT", NOTICE_TEXT); t.componentPropertyReferences = { characters: k }
  const row = await rowFor("Feedback"); row.appendChild(c)
  made.push("Feedback/Notice")
}

// ---------- Navigation/AppHeader ----------
if (!findMaster("Navigation/AppHeader")) {
  const c = comp("Navigation/AppHeader", "HORIZONTAL"); c.counterAxisAlignItems = "CENTER"; pad(c, 14, 32); c.itemSpacing = 24
  await fillStyle(c, "Color/canvas")
  c.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(c, "Color/border"); sideStroke(c, "bottom", 1)
  const logo = findMaster("Brand/Logo").createInstance(); c.appendChild(logo)
  const tabs = frame("Tabs", "HORIZONTAL", c); tabs.itemSpacing = 4; tabs.counterAxisAlignItems = "CENTER"
  const tabSet = findMaster("Navigation/Tab")
  for (let i = 0; i < TABS.length; i++) {
    const inst = variantOf(tabSet, { State: i === 0 ? "Selected" : "Default" }).createInstance()
    tabs.appendChild(inst); inst.name = "Tab · " + TABS[i]
    await setProps(inst, { Label: TABS[i] })
  }
  const spacer = frame("Spacer", "HORIZONTAL", c); spacer.layoutGrow = 1
  const chip = frame("Source", "HORIZONTAL", c); pad(chip, 4, 10); chip.cornerRadius = 4
  await fillStyle(chip, "Color/surface"); chip.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(chip, "Color/border"); chip.strokeWeight = 1
  const st = await text(chip, SOURCE_TEXT, "Type/Small", "Color/muted", "Source text")
  const k = c.addComponentProperty("Source", "TEXT", SOURCE_TEXT); st.componentPropertyReferences = { characters: k }
  for (const t of tabs.children) t.isExposedInstance = true
  c.primaryAxisSizingMode = "FIXED"; c.resize(1440, c.height); c.counterAxisSizingMode = "AUTO"
  const row = await rowFor("Navigation"); row.appendChild(c)
  made.push("Navigation/AppHeader")
}

// ---------- summary ----------
figma.viewport.scrollAndZoomIntoView([lib])
const out = [`Mono font used: ${MONO}`, "", made.length ? "Created:" : "Nothing new (everything already existed).", ...made.map(m => "  + " + m)]
print(out.concat(notes.length ? ["", "Notes:", ...notes.map(n => "  ⚠ " + n)] : []).join("\n"))
