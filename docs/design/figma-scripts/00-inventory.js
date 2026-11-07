// IDEA-X · 00 Inventory (READ-ONLY — changes nothing)
// Run in Scripter on the file that holds the AIDS Dashboard + Components Library.
await figma.loadAllPagesAsync()
const hex = c => "#" + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase()
const lines = []

// 1. Pages and top-level frames
for (const p of figma.root.children) {
  lines.push(`PAGE | ${p.name} | ${p.children.length} top-level`)
  for (const n of p.children) lines.push(`  ${n.type} | ${n.name} | ${Math.round(n.width)}x${Math.round(n.height)} @ ${Math.round(n.x)},${Math.round(n.y)}`)
}

// 2. Components with properties and usage
const instances = figma.root.findAllWithCriteria({ types: ["INSTANCE"] })
const use = new Map()
for (const i of instances) { const m = await i.getMainComponentAsync(); if (m) use.set(m.id, (use.get(m.id) || 0) + 1) }
const fmt = node => {
  try {
    return Object.entries(node.componentPropertyDefinitions).map(([k, d]) => {
      const n = k.split("#")[0]
      return d.type === "VARIANT" ? `${n}=[${d.variantOptions.join(",")}]` : `${n}(${d.type}${d.type === "TEXT" ? `:"${d.defaultValue}"` : ""})`
    }).join("; ")
  } catch (e) { return "⚠ ERROR reading props (set has errors)" }
}
lines.push("")
const sets = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET"] })
for (const s of sets) lines.push(`SET | ${s.name} | page ${s.parent && s.parent.type === "PAGE" ? s.parent.name : "(nested: " + s.parent.name + ")"} | ${s.children.length} variants | used ${s.children.reduce((n, c) => n + (use.get(c.id) || 0), 0)}x | ${Math.round(s.width)}x${Math.round(s.height)} | ${fmt(s)}`)
const comps = figma.root.findAllWithCriteria({ types: ["COMPONENT"] }).filter(c => c.parent && c.parent.type !== "COMPONENT_SET")
for (const c of comps) lines.push(`COMP | ${c.name} | parent ${c.parent.name} | used ${use.get(c.id) || 0}x | ${Math.round(c.width)}x${Math.round(c.height)} | ${fmt(c)}`)

// 3. Styles and variables
const paint = await figma.getLocalPaintStylesAsync(), text = await figma.getLocalTextStylesAsync(), eff = await figma.getLocalEffectStylesAsync()
lines.push("")
for (const s of paint) lines.push(`COLOR | ${s.name} | ${s.paints.map(p => p.type === "SOLID" ? hex(p.color) + ((p.opacity ?? 1) < 1 ? "@" + Math.round(p.opacity * 100) + "%" : "") : p.type).join("+")}`)
for (const s of text) lines.push(`TEXT | ${s.name} | ${s.fontName.family} ${s.fontName.style} ${s.fontSize}px | lh ${s.lineHeight.unit === "AUTO" ? "auto" : s.lineHeight.value + (s.lineHeight.unit === "PERCENT" ? "%" : "px")}`)
for (const s of eff) lines.push(`EFFECT | ${s.name}`)
const vars = await figma.variables.getLocalVariablesAsync()
const cols = await figma.variables.getLocalVariableCollectionsAsync()
for (const c of cols) lines.push(`VARCOLL | ${c.name} | modes ${c.modes.map(m => m.name).join(",")} | ${c.variableIds.length} vars`)
for (const v of vars) {
  const val = Object.values(v.valuesByMode)[0]
  lines.push(`VAR | ${v.name} | ${v.resolvedType} | ${val && typeof val === "object" && "r" in val ? hex(val) : JSON.stringify(val)}`)
}

// 4. Fonts in use
const fonts = new Map()
for (const t of figma.root.findAllWithCriteria({ types: ["TEXT"] })) {
  if (t.fontName === figma.mixed) continue
  const k = `${t.fontName.family} ${t.fontName.style}`; fonts.set(k, (fonts.get(k) || 0) + 1)
}
lines.push("", "FONTS | " + [...fonts].map(([k, n]) => `${k} (${n})`).join(", "))
lines.push(`TOTAL | ${sets.length} sets, ${comps.length} standalone, ${instances.length} instances, ${paint.length} color / ${text.length} text styles, ${vars.length} variables`)
print(lines.join("\n"))
