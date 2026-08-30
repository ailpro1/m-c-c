# Commitment Checklist

A single-page personal budgeting checklist: Income, Commitments and To Savings,
with a live balance at the top. Built as plain HTML/CSS/JS with no build step,
so it runs by opening `index.html` or serving the folder from any static host.

## Features

- Live balance (`Income − Commitments − Savings`) that updates as you type,
  animating the individual digits that changed.
- Adding or tapping an item opens a sheet showing the projected
  "Balance after this", so you can see the effect while entering the amount.
- Amounts are entered cents-first, like a banking app: `1` `2` `5` `0`
  reads 0.01 → 0.12 → 1.25 → 12.50.
- Balance colour is conditional: green in the black, red in the red, grey at
  break-even.
- Items sort largest-to-smallest amount; ticking one off crosses it out,
  animates (confetti + haptic buzz + a "ka-ching" sound) and sends it to the
  bottom of its section.
- Monthly cycles: the header chip shows which cycle month you're in, turning
  amber once the calendar moves past it, with a banner offering to start the
  new cycle. "Clear checkmarks" (at the bottom of the page) rolls the cycle
  to the current month and unticks everything, leaving items and amounts alone.
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

## The "ka-ching" sound

The till sound is synthesised in the Web Audio API — no audio file ships with
the app, so there's nothing to download or license. It models a real cash
register in three parts: the lever clunk ("ka"), a struck brass bell with
inharmonic partials ("ching"), and the drawer sliding open underneath.

To use a real recording instead, drop the file next to `index.html` and set
`KACHING_SAMPLE_URL` near the top of `app.js` to its filename:

```js
const KACHING_SAMPLE_URL = 'kaching.mp3';
```

The app falls back to the synthesised bell if the file is missing or fails to
decode. Make sure you have the rights to whatever recording you use.

## Structure

- `index.html` — markup and `<template>`s for sections/items.
- `styles.css` — iOS-style design system (colors, layout, animations).
- `app.js` — state, persistence, rendering, sorting, and the
  confetti/sound/vibration "celebration" effect.

No frameworks or external dependencies — easy to extend (e.g. swap
`localStorage` for a backend, or add categories) without a rewrite.
