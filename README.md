# Commitment Checklist

A single-page personal budgeting checklist: Income, Commitments and To Savings,
with a live balance at the top. Built as plain HTML/CSS/JS with no build step,
so it runs by opening `index.html` or serving the folder from any static host.

## Features

- Live balance (`Income − Commitments − Savings`) that updates as you type.
- Add, rename and re-price items freely in each section.
- Items sort largest-to-smallest amount; ticking one off crosses it out,
  animates (confetti + haptic buzz + a "ka-ching" sound) and sends it to the
  bottom of its section.
- "Clear checkmarks" resets every tick without touching your items or amounts.
- Amounts are shown in RM (Malaysian Ringgit).
- iOS-inspired UI: translucent blur header, spring animations, light/dark
  mode via `prefers-color-scheme`, responsive from a single mobile column up
  to a 3-column desktop layout.
- Data is saved to the browser's `localStorage`, per device.

## Running locally

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

- `index.html` — markup and `<template>`s for sections/items.
- `styles.css` — iOS-style design system (colors, layout, animations).
- `app.js` — state, persistence, rendering, sorting, and the
  confetti/sound/vibration "celebration" effect.

No frameworks or external dependencies — easy to extend (e.g. swap
`localStorage` for a backend, or add categories) without a rewrite.
