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

Synthesised in the Web Audio API — no audio file ships with the app, so
there's nothing to download or license. A short filtered noise burst for the
"cha", then two bright chime tones for the "ching".

## Staying up to date

`sw.js` is a service worker that serves same-origin requests network-first:
whatever the server has wins whenever the network is reachable, with the
cache kept only as an offline fallback. That means a deploy reaches the
browser on the next load by itself — there are no `?v=` query strings to
bump by hand.

A tab left open would otherwise sit on old code until refreshed, so the page
also polls the `ETag`/`Last-Modified` of `app.js` (on regaining focus, and
every 15 minutes). If it differs from the one seen at load, the page reloads
into the new version — deferred until the add/edit sheet is closed so an
update never interrupts someone entering an amount, with pending state
flushed to storage first.

## Structure

- `index.html` — markup and `<template>`s for sections/items.
- `styles.css` — iOS-style design system (colors, layout, animations).
- `app.js` — state, persistence, rendering, sorting, the add/edit sheet, the
  confetti/sound/vibration "celebration" effect, and update checking.
- `sw.js` — service worker: network-first caching and offline fallback.

No frameworks or external dependencies — easy to extend (e.g. swap
`localStorage` for a backend, or add categories) without a rewrite.
