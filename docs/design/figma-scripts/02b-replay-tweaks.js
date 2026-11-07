// IDEA-X · 02b Replay tweaks  (CHANGES existing things → run with DRY_RUN = true first)
// 1. New compact component Card/Stat (Tone=Default|Good|Alert).
// 2. Panel/LaneSummary: the big count and the High/Medium/Low/emails breakdown move onto one row
//    (count left, breakdown right) to remove the empty space and save height.
// 3. Replay screen: the 4 big summary cards become a compact Card/Stat strip right under the controls.
// Texts on screens are recorded first and put back afterwards.

// ===== SETTINGS =====
const DRY_RUN = true
const PAGE_NAME = "IDEA-X"
const LIB_NAME = "IDEA-X Library"
const SCREEN_NAME = "IDEA-X · Replay"
// ====================

await figma.loadAllPagesAsync()
const notes = [], out = []
const findMaster = name => figma.root.findOne(n => n.name === name &&
  (n.type === "COMPONENT_SET" || (n.type === "COMPONENT" && n.parent.type !== "COMPONENT_SET")))
const page = figma.root.children.find(p => p.name === PAGE_NAME)
if (!page) throw new Error(`Page "${PAGE_NAME}" not found.`)
await figma.setCurrentPageAsync(page)
const lib = page.children.find(n => n.name === LIB_NAME)
for (const s of ["Regular", "Medium", "Semi Bold"]) await figma.loadFontAsync({ family: "Inter", style: s })

const paintStyles = await figma.getLocalPaintStylesAsync()
const textStyles = await figma.getLocalTextStylesAsync()
const rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const P = name => paintStyles.find(s => s.name === name)
const T = name => textStyles.find(s => s.name === name)
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
const frame = (name, dir, parent) => {
  const f = figma.createFrame(); f.name = name; if (parent) parent.appendChild(f)
  f.layoutMode = dir; f.fills = []; f.primaryAxisSizingMode = "AUTO"; f.counterAxisSizingMode = "AUTO"
  return f
}
const pad = (n, v, h) => { n.paddingTop = n.paddingBottom = v; n.paddingLeft = n.paddingRight = h }
const loadFonts = async root => {
  for (const t of root.findAllWithCriteria({ types: ["TEXT"] })) {
    const fonts = t.fontName === figma.mixed ? t.getRangeAllFontNames(0, t.characters.length) : [t.fontName]
    for (const f of fonts) await figma.loadFontAsync(f)
  }
}
const keyOf = (inst, base) => Object.keys(inst.componentProperties).find(x => x.split("#")[0] === base)
const propVal = (inst, base) => { const k = keyOf(inst, base); return k ? inst.componentProperties[k].value : null }
const setProps = async (inst, values) => {
  await loadFonts(inst)
  const props = {}
  for (const [base, val] of Object.entries(values)) { const k = keyOf(inst, base); if (k) props[k] = val; else notes.push(`${inst.name}: no "${base}" property`) }
  if (Object.keys(props).length) inst.setProperties(props)
}
const variantOf = (set, want) => set.children.find(v => Object.entries(want).every(([k, val]) => v.name.split(", ").includes(`${k}=${val}`)))

// ---------- 1. read: Panel/LaneSummary ----------
const laneSet = findMaster("Panel/LaneSummary")
if (!laneSet) throw new Error("Panel/LaneSummary not found. Run script 02 first.")
const laneInsts = []
for (const inst of figma.root.findAllWithCriteria({ types: ["INSTANCE"] })) {
  const m = await inst.getMainComponentAsync()
  if (m && m.parent && m.parent.id === laneSet.id) laneInsts.push(inst)
}
const laneTodo = laneSet.children.filter(v => !v.findOne(n => n.name === "Numbers"))
out.push(`Panel/LaneSummary: ${laneSet.children.length} variants (${laneTodo.length} to restructure), ${laneInsts.length} instance(s) to protect`)
for (const v of laneTodo) {
  const missing = ["Count", "Unit", "Breakdown"].filter(n => !v.findOne(x => x.name === n))
  out.push(`  ${v.name}: ${missing.length ? "⚠ missing " + missing.join(", ") : "Count + Unit + Breakdown → one row"}`)
}

// ---------- 2. read: summary cards on the screen ----------
const screen = page.children.find(n => n.name === SCREEN_NAME)
let body = null, oldSummary = null, stats = []
if (!screen) notes.push(`Screen "${SCREEN_NAME}" not found; only the library is changed.`)
else {
  body = screen.findOne(n => n.name === "Body" && n.type === "FRAME")
  oldSummary = body && body.children.find(n => n.name === "Summary")
  if (!oldSummary) notes.push(`No "Summary" frame in ${SCREEN_NAME} › Body (already converted?).`)
  else {
    for (const c of oldSummary.children.filter(n => n.type === "INSTANCE")) {
      const m = await c.getMainComponentAsync()
      const tone = m && /Color=Green/.test(m.name) ? "Good" : m && /Color=Red/.test(m.name) ? "Alert" : "Default"
      stats.push({ Value: propVal(c, "Value") || "", Label: propVal(c, "Label") || "", Tone: tone })
    }
    out.push(`Replay screen: ${stats.length} summary cards → compact strip under the controls`)
    for (const s of stats) out.push(`  [${s.Tone}] ${s.Value} · ${s.Label}`)
  }
}
out.push(findMaster("Card/Stat") ? "Card/Stat already exists (kept)" : "Card/Stat will be created (Tone=Default|Good|Alert)")

if (DRY_RUN) {
  out.unshift("DRY RUN, nothing changed. Check the plan, then set DRY_RUN = false and run again.", "")
} else {
  // ---------- create Card/Stat ----------
  let statSet = findMaster("Card/Stat")
  if (!statSet) {
    const tones = { Default: ["Color/canvas", "Color/ink"], Good: ["Color/greenTint", "Color/green"], Alert: ["Color/redTint", "Color/accent"] }
    const vs = []
    for (const [tone, [bg, fg]] of Object.entries(tones)) {
      const c = figma.createComponent(); c.name = `Tone=${tone}`
      c.layoutMode = "HORIZONTAL"; c.counterAxisAlignItems = "CENTER"; c.itemSpacing = 10; pad(c, 10, 14); c.cornerRadius = 6
      c.primaryAxisSizingMode = "FIXED"; c.resize(320, 44); c.counterAxisSizingMode = "AUTO"
      await fillStyle(c, bg); await border(c)
      await text(c, "99%", "Type/Score", fg, "Value")
      const l = await text(c, "fewer alerts to read", "Type/Small", "Color/muted", "Label")
      l.layoutSizingHorizontal = "FILL"; l.textAutoResize = "HEIGHT"; l.textTruncation = "ENDING"; l.maxLines = 2
      vs.push(c)
    }
    statSet = figma.combineAsVariants(vs, page); statSet.name = "Card/Stat"
    statSet.layoutMode = "VERTICAL"; statSet.primaryAxisSizingMode = "AUTO"; statSet.counterAxisSizingMode = "AUTO"; statSet.itemSpacing = 16; pad(statSet, 16, 16)
    for (const [prop, def] of [["Value", "99%"], ["Label", "fewer alerts to read"]]) {
      const k = statSet.addComponentProperty(prop, "TEXT", def)
      for (const v of statSet.children) v.findOne(n => n.name === prop).componentPropertyReferences = { characters: k }
    }
    const row = lib && lib.children.find(n => n.name === "Row · Replay")
    const items = row && row.children.find(n => n.name === "Items")
    if (items) items.appendChild(statSet); else notes.push("Card/Stat left on the page (library row not found).")
    out.push("+ Card/Stat")
  }

  // ---------- restructure Panel/LaneSummary (snapshot → change → restore) ----------
  const snaps = laneInsts.map(inst => ({ inst, props: Object.fromEntries(Object.entries(inst.componentProperties).map(([k, v]) => [k, v.value])) }))
  for (const v of laneTodo) {
    const count = v.findOne(n => n.name === "Count"), unit = v.findOne(n => n.name === "Unit"), bd = v.findOne(n => n.name === "Breakdown")
    if (!count || !unit || !bd) continue
    const idx = v.children.indexOf(count)
    const numbers = frame("Numbers", "HORIZONTAL", null); v.insertChild(idx, numbers)
    numbers.layoutSizingHorizontal = "FILL"; numbers.primaryAxisAlignItems = "SPACE_BETWEEN"; numbers.counterAxisAlignItems = "MAX"; numbers.paddingTop = 6
    const block = frame("Count block", "VERTICAL", numbers)
    block.appendChild(count); block.appendChild(unit)
    numbers.appendChild(bd); bd.paddingTop = 0; bd.paddingBottom = 4
    out.push(`~ ${v.name}: count and breakdown on one row`)
  }
  for (const s of snaps) {
    await loadFonts(s.inst)
    const diff = {}
    for (const [k, val] of Object.entries(s.props)) if (s.inst.componentProperties[k] && s.inst.componentProperties[k].value !== val) diff[k] = val
    if (Object.keys(diff).length) { s.inst.setProperties(diff); out.push(`  restored ${Object.keys(diff).length} value(s) on ${s.inst.name}`) }
  }

  // ---------- replace the summary cards on the screen ----------
  if (oldSummary && stats.length) {
    const controls = body.children.find(n => n.name === "Controls")
    const idx = controls ? body.children.indexOf(controls) + 1 : 0
    const strip = frame("Summary", "HORIZONTAL", null); body.insertChild(idx, strip)
    strip.layoutSizingHorizontal = "FILL"; strip.itemSpacing = 12
    for (const s of stats) {
      const inst = variantOf(statSet, { Tone: s.Tone }).createInstance(); strip.appendChild(inst)
      inst.layoutGrow = 1; inst.layoutSizingHorizontal = "FILL"
      await setProps(inst, { Value: s.Value, Label: s.Label })
    }
    oldSummary.remove()
    out.push(`~ ${SCREEN_NAME}: summary is now a compact strip under the controls`)
  }
  if (screen) figma.viewport.scrollAndZoomIntoView([screen])
}

print(out.concat(notes.length ? ["", "Notes:", ...notes.map(n => "  ⚠ " + n)] : []).join("\n"))
