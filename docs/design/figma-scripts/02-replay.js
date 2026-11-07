// IDEA-X · 02 Replay  (ADDS ONLY — changes nothing that already exists)
// Needs script 01 to have run. Creates the Replay parts in "IDEA-X Library",
// then builds the screen "IDEA-X · Replay" from instances. Safe to re-run.

// ===== SETTINGS (all screen texts live here) =====
const PAGE_NAME = "IDEA-X"
const LIB_NAME = "IDEA-X Library"
const SCREEN_NAME = "IDEA-X · Replay"
const CLOCK = "Demo clock 1:55:26 / 2:41:00"
const NOW = "Now: Infiltration, exploit on Windows Vista host"
const RUN_LABEL = "Tuned rules from run #3 · tuned_rules.yaml"
const ORIGINAL = { Title: "Original rules", Subtitle: "Every alert on its own, scored from the base rules", Count: "4,427", Unit: "alerts raised", High: "756", Medium: "2,374", Low: "1,297", Emails: "756" }
const TUNED = { Title: "Tuned rules", Subtitle: "Related alerts grouped by target and attack type. Repeats raise the score.", Count: "61", Unit: "grouped alerts", High: "3", Medium: "1", Low: "57", Emails: "3" }
const FEED = Array.from({ length: 12 }, (_, i) => ({ Time: `1:55:${String(26 - i).padStart(2, "0")}`, Rule: "Exploit on Windows Vista host", Host: "192.168.10.8", Level: "High" }))
const GROUPS = [
  { Tone: "High", Title: "Exploit on Windows Vista host (192.168.10.8)", Meta: "756 events · High · email sent", Score: "10" },
  { Tone: "High", Title: "Web probe on web server (192.168.10.50)", Meta: "991 events · raised from Low to High · email sent", Score: "10" },
  { Tone: "High", Title: "Brute force on web server (192.168.10.50)", Meta: "2,374 events · raised from Medium to High · email sent", Score: "10" },
  { Tone: "Medium", Title: "Port scan from 172.16.0.1", Meta: "2 events · raised from Low to Medium", Score: "6" },
  { Tone: "Benign", Title: "Benign policy at internal hosts", Meta: "9 events · Low · benign, not raised", Score: "2" }
]
const DETAIL = { Why: "Base 9, W 2 min, N_sat 3. Reached 10 at the 3rd event.", Note: "Original alerts in this group are kept and listed in full.",
  rows: [{ Time: "1:55:26", Rule: "205.174.165.73 → 192.168.10.8:445", Host: "—", Level: "High" }, { Time: "1:41:10", Rule: "First event, base score 9", Host: "—", Level: "High" }] }
const KPIS = [
  { Color: "Default", Value: "99%", Label: "fewer alerts to read" },
  { Color: "Default", Value: "3", Label: "groups moved up a severity band" },
  { Color: "Green", Value: "0", Label: "benign groups raised (must stay 0)" },
  { Color: "Default", Value: "756 → 3", Label: "emails, original → tuned" }
]
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

for (const s of ["Regular", "Medium", "Semi Bold"]) await figma.loadFontAsync({ family: "Inter", style: s })

// ---------- styles ----------
const paintStyles = await figma.getLocalPaintStylesAsync()
const textStyles = await figma.getLocalTextStylesAsync()
const rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const ensureText = (name, family, style, size, lh) => {
  let s = textStyles.find(x => x.name === name)
  if (!s) { s = figma.createTextStyle(); s.name = name; s.fontName = { family, style }; s.fontSize = size; s.lineHeight = { unit: "PIXELS", value: lh }; textStyles.push(s); made.push(`Text style ${name}`) }
  return s
}
ensureText("Type/BodyStrong", "Inter", "Semi Bold", 13, 20)
ensureText("Type/Score", "Inter", "Semi Bold", 20, 24)

// ---------- helpers ----------
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

// =============== LIBRARY ADDITIONS ===============

// ---------- Lane/AlertRow ----------
if (!findMaster("Lane/AlertRow")) {
  const c = comp("Lane/AlertRow", "HORIZONTAL"); pad(c, 5, 16); c.itemSpacing = 8; c.counterAxisAlignItems = "CENTER"
  await fillStyle(c, "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
  fixedWidth(c, 600)
  const tm = await text(c, "1:55:26", "Type/Small", "Color/muted", "Time"); tm.textAutoResize = "HEIGHT"; tm.resize(62, tm.height)
  const ru = await text(c, "Exploit on Windows Vista host", "Type/Label", "Color/ink", "Rule"); ru.layoutSizingHorizontal = "FILL"; ru.textAutoResize = "HEIGHT"; ru.textTruncation = "ENDING"; ru.maxLines = 1
  const ho = await text(c, "192.168.10.8", "Type/Small", "Color/muted", "Host"); ho.textAutoResize = "HEIGHT"; ho.resize(120, ho.height)
  const badge = pick("Badge/Severity", { Level: "High" }).createInstance(); c.appendChild(badge); badge.name = "Severity"
  bind(c, "Time", tm); bind(c, "Rule", ru); bind(c, "Host", ho)
  badge.isExposedInstance = true
  const row = await rowFor("Replay"); row.appendChild(c)
  made.push("Lane/AlertRow")
}

// ---------- Card/GroupAlert (Tone=High|Medium|Low|Benign) ----------
if (!findMaster("Card/GroupAlert")) {
  const stripes = { High: "Color/accent", Medium: "Color/yellow", Low: "Color/green", Benign: "Color/border" }
  const vs = []
  for (const [tone, color] of Object.entries(stripes)) {
    const c = comp(`Tone=${tone}`, "HORIZONTAL"); c.itemSpacing = 12; c.paddingTop = c.paddingBottom = 10; c.paddingLeft = 0; c.paddingRight = 12
    c.cornerRadius = 4; c.clipsContent = true
    await fillStyle(c, "Color/canvas"); await border(c)
    fixedWidth(c, 600)
    const stripe = figma.createRectangle(); c.appendChild(stripe); stripe.name = "Stripe"; stripe.resize(4, 40); await fillStyle(stripe, color); stripe.layoutAlign = "STRETCH"
    const col = frame("Content", "VERTICAL", c); col.layoutSizingHorizontal = "FILL"; col.itemSpacing = 2
    const ti = await text(col, "Exploit on Windows Vista host (192.168.10.8)", "Type/BodyStrong", "Color/ink", "Title"); ti.layoutSizingHorizontal = "FILL"; ti.textAutoResize = "HEIGHT"
    const me = await text(col, "756 events · High · email sent", "Type/Small", "Color/muted", "Meta"); me.layoutSizingHorizontal = "FILL"; me.textAutoResize = "HEIGHT"
    const sc = await text(c, "10", "Type/Score", "Color/ink", "Score")
    c.counterAxisAlignItems = "CENTER"
    vs.push(c)
  }
  const set = makeSet(vs, "Card/GroupAlert")
  bindSet(set, "Title", "Exploit on Windows Vista host (192.168.10.8)", "Title")
  bindSet(set, "Meta", "756 events · High · email sent", "Meta")
  bindSet(set, "Score", "10", "Score")
  const row = await rowFor("Replay"); row.appendChild(set)
  made.push("Card/GroupAlert")
}

// ---------- Card/GroupDetail ----------
if (!findMaster("Card/GroupDetail")) {
  const c = comp("Card/GroupDetail", "VERTICAL"); pad(c, 10, 12); c.itemSpacing = 6; c.cornerRadius = 4
  await fillStyle(c, "Color/canvas"); await border(c, "Color/primary")
  fixedWidth(c, 600)
  const why = await text(c, DETAIL.Why, "Type/Label", "Color/muted", "Why"); why.layoutSizingHorizontal = "FILL"; why.textAutoResize = "HEIGHT"
  const ev = frame("Events", "VERTICAL", c); fillW(ev)
  for (let i = 0; i < 3; i++) { const r = pick("Lane/AlertRow").createInstance(); ev.appendChild(r); fillW(r); r.name = "Event " + (i + 1) }
  const note = await text(c, DETAIL.Note, "Type/Small", "Color/muted", "Note")
  bind(c, "Why", why); bind(c, "Note", note)
  for (const r of ev.children) r.isExposedInstance = true
  const row = await rowFor("Replay"); row.appendChild(c)
  made.push("Card/GroupDetail")
}

// ---------- Panel/LaneSummary (Lane=Original|Tuned) ----------
if (!findMaster("Panel/LaneSummary")) {
  const mk = async lane => {
    const c = comp(`Lane=${lane}`, "VERTICAL"); pad(c, 14, 16); c.itemSpacing = 4
    await fillStyle(c, "Color/canvas"); await border(c); sideStroke(c, "bottom", 1)
    fixedWidth(c, 600)
    const d = lane === "Original" ? ORIGINAL : TUNED
    await text(c, d.Title, "Type/Heading", "Color/ink", "Title")
    const sub = await text(c, d.Subtitle, "Type/Small", "Color/muted", "Subtitle"); sub.layoutSizingHorizontal = "FILL"; sub.textAutoResize = "HEIGHT"
    const big = await text(c, d.Count, "Type/Display", lane === "Original" ? "Color/ink" : "Color/green", "Count")
    await text(c, d.Unit, "Type/Small", "Color/muted", "Unit")
    const mini = frame("Breakdown", "HORIZONTAL", c); mini.itemSpacing = 18; mini.paddingTop = 6
    for (const [key, label, color] of [["High", "High", "Color/accent"], ["Medium", "Medium", "Color/yellow"], ["Low", "Low", "Color/green"], ["Emails", "emails sent", "Color/primary"]]) {
      const it = frame(key, "VERTICAL", mini); it.paddingLeft = 8
      it.strokes = [{ type: "SOLID", color: rgb("#D8E0E8") }]; await strokeStyle(it, color); sideStroke(it, "left", 3)
      await text(it, d[key], "Type/Heading", "Color/ink", key + " value")
      await text(it, label, "Type/Small", "Color/muted", key + " label")
    }
    return c
  }
  const set = makeSet([await mk("Original"), await mk("Tuned")], "Panel/LaneSummary")
  for (const p of ["Title", "Subtitle", "Count", "Unit"]) bindSet(set, p, ORIGINAL[p], p)
  for (const p of ["High", "Medium", "Low", "Emails"]) bindSet(set, p, ORIGINAL[p], p + " value")
  const row = await rowFor("Replay"); row.appendChild(set)
  made.push("Panel/LaneSummary")
}

// ---------- Chart/Timeline (static picture of the cumulative chart) ----------
if (!findMaster("Chart/Timeline")) {
  const W = 1376, H = 196, SW = W - 32, SH = 132, OX = 16, OY = 40
  const end = 9660, now = 6926, top = 4, ch = 90
  const windows = [[300, 2700, "Brute force"], [3300, 4500, "XSS"], [4800, 4920, "SQL injection"], [6000, 7500, "Infiltration"], [7800, 9000, "Port scan"]]
  const sx = t => 36 + (t / end) * (SW - 46)
  const rate = t => { let r = 0.08; for (const [a, b] of windows) if (t >= a && t <= b) r += (a === 300 ? 0.95 : a === 6000 ? (t > 6700 ? 1.6 : 0.2) : 0.35); return r }
  let c1 = 0, c2 = 0; const p1 = [], p2 = []
  for (let t = 0; t <= now; t += 60) { c1 += rate(t) * 60; c2 += (rate(t) > 0.5 ? 0.012 : 0.006) * 60; p1.push([t, c1]); p2.push([t, c2]) }
  const k1 = 4427 / c1, k2 = 61 / c2, ymax = 5483
  const sy = v => top + ch - (v / ymax) * ch
  const path = (pts, k) => pts.map(([t, v], i) => `${i ? "L" : "M"}${sx(t).toFixed(1)},${sy(v * k).toFixed(1)}`).join("")
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}">`
  for (const v of [0, 2000, 4000]) svg += `<line x1="36" x2="${SW - 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="#EEF1F4" stroke-width="1"/>`
  for (const [a, b] of windows) svg += `<rect x="${sx(a)}" y="${top + ch + 6}" width="${Math.max(3, sx(b) - sx(a))}" height="12" fill="#E8A3A5"/>`
  svg += `<path d="${path(p1, k1)}" fill="none" stroke="#020202" stroke-width="1.6"/>`
  svg += `<path d="${path(p2, k2)}" fill="none" stroke="#1F7A4D" stroke-width="2"/>`
  svg += `<line x1="${sx(now)}" x2="${sx(now)}" y1="${top}" y2="${top + ch + 20}" stroke="#004488" stroke-width="1" stroke-dasharray="3 3"/>`
  svg += `<circle cx="${sx(now)}" cy="${sy(4427)}" r="3.5" fill="#020202"/><circle cx="${sx(now)}" cy="${sy(61)}" r="3.5" fill="#1F7A4D"/></svg>`

  const c = figma.createComponent(); c.name = "Chart/Timeline"; c.resize(W, H); c.cornerRadius = 6; c.clipsContent = true
  await fillStyle(c, "Color/canvas"); await border(c)
  const put = async (chars, x, y, color, align, type = "Type/Small") => {
    const t = await text(c, chars, type, color, chars)
    t.x = align === "RIGHT" ? x - t.width : align === "CENTER" ? x - t.width / 2 : x; t.y = y
    return t
  }
  await put("Total alerts raised so far", 16, 12, "Color/muted", "LEFT", "Type/Label")
  await put("Black line: original rules · Green line: tuned rules · Red blocks: attack in progress (from labels)", W - 16, 12, "Color/muted", "RIGHT")
  const g = figma.createNodeFromSvg(svg); g.name = "Plot"; c.appendChild(g); g.x = OX; g.y = OY
  for (const [v, lbl] of [[0, "0"], [2000, "2,000"], [4000, "4,000"]]) await put(lbl, OX + 30, OY + sy(v) - 8, "Color/muted", "RIGHT")
  for (const [a, , l] of windows) await put(l, OX + sx(a), OY + top + ch + 20, "Color/muted", "LEFT")
  const ticks = ["0:00", "0:40", "1:20", "2:00", "2:41"]
  for (let i = 0; i < ticks.length; i++) await put(ticks[i], OX + sx((i * end) / 4), H - 20, "Color/muted", i === 0 ? "LEFT" : i === 4 ? "RIGHT" : "CENTER")
  await put("4,427", OX + sx(now) - 6, OY + sy(4427) - 18, "Color/ink", "RIGHT", "Type/BodyStrong")
  await put("61", OX + sx(now) + 6, OY + sy(61) - 22, "Color/green", "LEFT", "Type/BodyStrong")
  const row = await rowFor("Replay charts"); row.appendChild(c)
  made.push("Chart/Timeline")
}

// =============== SCREEN ===============
let screen = page.children.find(n => n.name === SCREEN_NAME)
if (screen) {
  notes.push(`"${SCREEN_NAME}" already exists, so it was not rebuilt. Rename or delete it to build a fresh one.`)
} else {
  screen = figma.createFrame(); page.appendChild(screen); screen.name = SCREEN_NAME
  screen.layoutMode = "VERTICAL"; screen.counterAxisSizingMode = "FIXED"; screen.primaryAxisSizingMode = "AUTO"
  screen.resize(1440, 900); screen.primaryAxisSizingMode = "AUTO"; await fillStyle(screen, "Color/canvas")
  screen.x = lib.x + lib.width + 200; screen.y = 0

  const header = pick("Navigation/AppHeader").createInstance(); screen.appendChild(header); fillW(header)

  const body = frame("Body", "VERTICAL", screen); fillW(body); body.paddingTop = 20; body.paddingBottom = 28; body.paddingLeft = body.paddingRight = 32; body.itemSpacing = 16

  // controls row
  const controls = frame("Controls", "HORIZONTAL", body); fillW(controls); controls.counterAxisAlignItems = "CENTER"; controls.primaryAxisAlignItems = "SPACE_BETWEEN"
  const left = frame("Playback", "HORIZONTAL", controls); left.itemSpacing = 10; left.counterAxisAlignItems = "CENTER"
  const play = pick("Button/Primary").createInstance(); left.appendChild(play); await setProps(play, { Label: "Pause", "Show Icon": false })
  const restart = pick("Button/Secondary").createInstance(); left.appendChild(restart); await setProps(restart, { Label: "Restart", "Show Icon": false })
  const speed = pick("Control/SpeedSelector").createInstance(); left.appendChild(speed)
  await text(left, CLOCK, "Type/Label", "Color/muted", "Clock")
  await text(left, NOW, "Type/Label", "Color/accent", "Now")
  await text(controls, RUN_LABEL, "Type/Label", "Color/muted", "Run")

  // timeline
  const chart = pick("Chart/Timeline").createInstance(); body.appendChild(chart); fillW(chart)

  // lanes
  const lanes = frame("Lanes", "HORIZONTAL", body); fillW(lanes); lanes.itemSpacing = 16; lanes.counterAxisAlignItems = "MIN"
  const laneCard = async name => {
    const f = frame(name, "VERTICAL", lanes); f.layoutGrow = 1; f.layoutSizingHorizontal = "FILL"
    f.cornerRadius = 6; f.clipsContent = true; await fillStyle(f, "Color/canvas"); await border(f)
    return f
  }
  const origCard = await laneCard("Lane · Original rules")
  const os = pick("Panel/LaneSummary", { Lane: "Original" }).createInstance(); origCard.appendChild(os); fillW(os); await setProps(os, ORIGINAL)
  const feed = frame("Feed", "VERTICAL", origCard); fillW(feed)
  for (const r of FEED) {
    const inst = pick("Lane/AlertRow").createInstance(); feed.appendChild(inst); fillW(inst)
    await setProps(inst, { Time: r.Time, Rule: r.Rule, Host: r.Host })
  }

  const tunedCard = await laneCard("Lane · Tuned rules")
  const ts = pick("Panel/LaneSummary", { Lane: "Tuned" }).createInstance(); tunedCard.appendChild(ts); fillW(ts); await setProps(ts, TUNED)
  const groups = frame("Groups", "VERTICAL", tunedCard); fillW(groups); pad(groups, 10, 12); groups.itemSpacing = 8
  for (let i = 0; i < GROUPS.length; i++) {
    const g = GROUPS[i]
    const inst = pick("Card/GroupAlert", { Tone: g.Tone }).createInstance(); groups.appendChild(inst); fillW(inst)
    await setProps(inst, { Title: g.Title, Meta: g.Meta, Score: g.Score })
    if (i === 0) {
      const d = pick("Card/GroupDetail").createInstance(); groups.appendChild(d); fillW(d); d.name = "Detail (expanded group)"
      await setProps(d, { Why: DETAIL.Why, Note: DETAIL.Note })
      const evs = d.findAll(n => n.type === "INSTANCE" && n.name.startsWith("Event "))
      for (let j = 0; j < evs.length; j++) {
        if (j < DETAIL.rows.length) await setProps(evs[j], { Time: DETAIL.rows[j].Time, Rule: DETAIL.rows[j].Rule, Host: DETAIL.rows[j].Host })
        else evs[j].visible = false
      }
    }
  }

  // KPIs
  const kpis = frame("Summary", "HORIZONTAL", body); fillW(kpis); kpis.itemSpacing = 16
  for (const k of KPIS) {
    let inst
    try { inst = pick("Card", { Color: k.Color }).createInstance() } catch (e) { inst = pick("Card").createInstance(); notes.push(`Card has no Color=${k.Color}; used default.`) }
    kpis.appendChild(inst); inst.layoutGrow = 1; inst.layoutSizingHorizontal = "FILL"
    await setProps(inst, { Value: k.Value, Label: k.Label })
  }

  // notice
  const notice = pick("Feedback/Notice").createInstance(); body.appendChild(notice); fillW(notice)

  made.push(`Screen "${SCREEN_NAME}"`)
  figma.viewport.scrollAndZoomIntoView([screen])
}

const out = [made.length ? "Created:" : "Nothing new.", ...made.map(m => "  + " + m)]
print(out.concat(notes.length ? ["", "Notes:", ...notes.map(n => "  ⚠ " + n)] : []).join("\n"))
