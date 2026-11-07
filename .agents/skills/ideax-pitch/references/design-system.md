# IDEA-X deck design system

## Colours

| Token | Hex | Use |
|---|---|---|
| steel | `#004488` | Dark slide background (cover, story, idea, demo, results, different, close); key numbers on light slides |
| smoke | `#F2F2F2` | Light slide background |
| red | `#BD2024` | Alarms, emails, eyebrows on light slides, the single red thesis slide (blind) |
| blue-grey | `#6A9DCF` | Secondary: arrows, tuned dots, orbit segments |
| ink | `#0B1420` | Text on light slides |
| ink-soft | `#3B4A5C` | Body text on light slides |
| label-grey | `#5A6878` | Footers/labels on light slides |
| card | `#FBFBF8` | Card fill on light slides, border `#CBD5E0` |
| on-steel text | `#F2F2F2` | Headings on dark slides |
| on-steel soft | `#D5E3F2` | Body on dark slides |
| on-steel label | `#A9C8EA` | Eyebrows, footers on dark slides |
| steel rule | `#3A6FA8` | Divider lines on dark slides |
| marks | `#0F5196` | Alert-mark texture on steel |
| tile | `#0A3A6E`, border `#2E66A3` | CCTV monitor tiles (story slide) |
| red text | `#FBF4F4`, deep `#2A0709` | Text on the red slide |
| log | bg `#0B1420`, text `#C9D4DF`, command `#8DB8E6`, pass `#7FD3A6` | Codex log card |

Never: purple, gradients, glows, sparkles, robots, chat bubbles.

## Typography

- **Oswald** 500–600: hero numbers and headings. `https://fonts.googleapis.com/css2?family=Oswald:wght@400..700`
- **IBM Plex Sans** 400/500/600: body, card titles.
- **JetBrains Mono** 400/600: eyebrows (uppercase, letter-spacing 3px), labels, footers, logs, code.
- Scale (px on 1920×1080): hero 280 / 190 / 132–140; headings 72–96; card titles 40; body 30–40; labels and footers 24–26. Minimum 24.
- Fallbacks if fonts are missing: Arial Narrow (Oswald), Arial (Plex), Courier New (mono).

## Layout

- Canvas 1920×1080. Margins 128px (bottom 160px on slides with a footer).
- Eyebrow at top-left, then heading, then one visual block. Heading never centred with the body.
- Footer row pinned at bottom 64px: source or note on the left, two-digit page number on the right. Cover, demo and close have no footer.
- Cards: 2px border, 8px radius, 36–40px padding. No drop shadows.

## Motif: one mark = one alert

- Mark: 12×6 rect, 1px radius, on a 24×18 grid (texture), colour `#0F5196` on steel. On cover, demo and close it fills only the right-hand part of the slide so text stays clean.
- Red mark = an alert that emailed a human.
- Slide 9 (collapse): left = exactly 5,483 marks (80 columns × 69 rows, last 37 covered), about 28% red (1,535/5,483); right = 46 dots (r 20, 64px grid), first 7 red = High groups. Redraw both to match tomorrow's real numbers.
- Story slide: 4×3 wall of monitor tiles, 11 "door open", 1 red "STORE 14 · break-in · unchecked".
