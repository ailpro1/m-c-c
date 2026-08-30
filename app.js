'use strict';

/* ============================================================
   Commitment Checklist — state, persistence, rendering, effects
   ============================================================ */

// Belt-and-braces zoom lock: iOS Safari's pinch gesture ignores
// touch-action and the viewport meta tag on some versions.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

const STORAGE_KEY = 'commitment-checklist.v1';

const SECTIONS = [
  { key: 'income', title: 'Income', noun: 'income' },
  { key: 'commitments', title: 'Commitments', noun: 'commitment' },
  { key: 'savings', title: 'To Savings', noun: 'savings' },
];

const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

/* ---------------- Cycle month ----------------
   The checklist runs in monthly cycles: clearing the checkmarks starts the
   next one. The stored cycle month is what the header reports, so it stays
   put until the user actually rolls it over. */

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-MY', {
    month: 'long',
    year: 'numeric',
  });
}

/* ---------------- Money formatting ---------------- */

function groupAmount(n) {
  return Math.abs(n).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Compact form for chips and section totals: RM1,200.00
function formatRM(n) {
  return (n < 0 ? '−' : '') + 'RM' + groupAmount(n);
}

// Roomy form for the big balance readouts: RM 1,200.00
function formatRMLarge(n) {
  return (n < 0 ? '−' : '') + 'RM ' + groupAmount(n);
}

/* ---------------- Cent-first amount entry ----------------
   Digits fill from the cents up, the way banking apps and ATMs work:
   typing 1, 2, 5, 0 reads 0.01 → 0.12 → 1.25 → 12.50. The raw digit
   string is the source of truth; the formatted text is derived. */

const MAX_DIGITS = 9; // up to RM9,999,999.99

function digitsToAmount(digits) {
  return digits ? parseInt(digits, 10) / 100 : 0;
}

function amountToDigits(amount) {
  return amount ? String(Math.round(amount * 100)) : '';
}

function normaliseDigits(raw) {
  const stripped = String(raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return stripped.slice(0, MAX_DIGITS);
}

function formatDigits(digits) {
  return groupAmount(digitsToAmount(digits));
}

/* ---------------- Per-digit animated number ----------------
   Re-renders a money string as one span per character and animates only
   the characters that actually changed, so the balance visibly ticks as
   each digit is typed instead of silently swapping. */

function setAnimatedAmount(el, text, direction) {
  const prev = el.dataset.text || '';
  if (prev === text) return;

  const chars = [...text];
  const prevChars = [...prev];
  // Align from the right so digits keep their identity as the number grows.
  const offset = chars.length - prevChars.length;

  const frag = document.createDocumentFragment();
  chars.forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'digit';
    span.textContent = ch;
    if (prev && prevChars[i - offset] !== ch) {
      span.classList.add(direction < 0 ? 'roll-down' : 'roll');
    }
    frag.appendChild(span);
  });

  el.textContent = '';
  el.appendChild(frag);
  el.dataset.text = text;
}

// Balance colour is conditional: in the black, in the red, or break-even.
function applyBalanceTone(el, value) {
  el.classList.toggle('positive', value > 0.004);
  el.classList.toggle('negative', value < -0.004);
  el.classList.toggle('zero', Math.abs(value) <= 0.004);
}

/* ---------------- State ---------------- */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultState() {
  return {
    cycleMonth: monthKey(),
    income: [
      { id: uid(), name: 'Salary', amount: 5000, checked: false },
      { id: uid(), name: 'Side Hustle', amount: 600, checked: false },
    ],
    commitments: [
      { id: uid(), name: 'Rent', amount: 1200, checked: false },
      { id: uid(), name: 'Car Loan', amount: 450, checked: false },
      { id: uid(), name: 'Groceries', amount: 500, checked: false },
    ],
    savings: [
      { id: uid(), name: 'Emergency Fund', amount: 400, checked: false },
      { id: uid(), name: 'Investment', amount: 300, checked: false },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    for (const s of SECTIONS) {
      if (!Array.isArray(parsed[s.key])) parsed[s.key] = [];
    }
    // Data saved before cycles existed starts on the current month.
    if (!parsed.cycleMonth) parsed.cycleMonth = monthKey();
    return parsed;
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return defaultState();
  }
}

let state = loadState();
let saveTimer = null;

function writeState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeState, 150);
}

// Write immediately — used before reloading for an update, so a debounced
// save can't be lost to the reload.
function flushPersist() {
  clearTimeout(saveTimer);
  writeState();
}

/* ---------------- Sorting ---------------- */
// Unchecked items first (largest amount first), then checked items
// (also largest first), so ticking a box sends it to the bottom.
function sortSection(key) {
  state[key].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return (b.amount || 0) - (a.amount || 0);
  });
}

/* ---------------- Totals & balance ---------------- */

function sectionTotal(key) {
  return state[key].reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function currentBalance() {
  return sectionTotal('income') - sectionTotal('commitments') - sectionTotal('savings');
}

let lastBalance = 0;

function updateTotals() {
  document.getElementById('incomeTotal').textContent = formatRM(sectionTotal('income'));
  document.getElementById('commitmentsTotal').textContent = formatRM(sectionTotal('commitments'));
  document.getElementById('savingsTotal').textContent = formatRM(sectionTotal('savings'));

  for (const s of SECTIONS) {
    const el = document.querySelector(`.section[data-key="${s.key}"] .section-total`);
    if (el) el.textContent = formatRM(sectionTotal(s.key));
  }

  const balance = currentBalance();
  const balanceEl = document.getElementById('balanceAmount');
  setAnimatedAmount(balanceEl, formatRMLarge(balance), balance - lastBalance);
  applyBalanceTone(balanceEl, balance);
  lastBalance = balance;
}

/* ---------------- Rendering ---------------- */

const sectionTemplate = document.getElementById('section-template');
const itemTemplate = document.getElementById('item-template');
const grid = document.getElementById('sectionsGrid');

function buildSectionShells() {
  for (const s of SECTIONS) {
    const node = sectionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.key = s.key;
    node.querySelector('h2').textContent = s.title;
    node.querySelector('.add-row').addEventListener('click', () => {
      openSheet({ mode: 'add', key: s.key });
    });
    grid.appendChild(node);
  }
}

function renderSection(key, { skipFlip } = {}) {
  const list = grid.querySelector(`.section[data-key="${key}"] .item-list`);

  // FLIP: record first positions of existing rows.
  const firstRects = new Map();
  if (!skipFlip) {
    list.querySelectorAll('.item').forEach((row) => {
      firstRects.set(row.dataset.id, row.getBoundingClientRect());
    });
  }

  list.innerHTML = '';

  if (state[key].length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'No items yet — add one below.';
    list.appendChild(hint);
  }

  for (const item of state[key]) {
    const row = itemTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = item.id;
    row.classList.toggle('checked', !!item.checked);

    const checkbox = row.querySelector('.checkbox');
    checkbox.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M5 13l4.5 4.5L19 8" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    checkbox.addEventListener('click', () => toggleItem(key, item.id));

    row.querySelector('.item-name').textContent = item.name;
    row.querySelector('.item-amount').textContent = formatRM(item.amount || 0);
    row.querySelector('.item-body').addEventListener('click', () => {
      openSheet({ mode: 'edit', key, id: item.id });
    });

    row.querySelector('.delete-btn').addEventListener('click', () => deleteItem(key, item.id));

    list.appendChild(row);
  }

  // FLIP: animate from previous position to new position.
  if (!skipFlip) {
    list.querySelectorAll('.item').forEach((row) => {
      const first = firstRects.get(row.dataset.id);
      if (!first) return;
      const last = row.getBoundingClientRect();
      const dy = first.top - last.top;
      if (Math.abs(dy) < 0.5) return;
      row.style.transition = 'none';
      row.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = '';
        row.style.transform = '';
      });
    });
  }
}

function renderAll(opts) {
  for (const s of SECTIONS) renderSection(s.key, opts);
  updateTotals();
  renderCycle();
}

/* ---------------- Cycle month UI ---------------- */

const cycleChip = document.getElementById('cycleChip');
const cycleLabel = document.getElementById('cycleLabel');
const cycleBanner = document.getElementById('cycleBanner');

function renderCycle() {
  const thisMonth = monthKey();
  const behind = state.cycleMonth !== thisMonth;

  cycleLabel.textContent = monthLabel(state.cycleMonth);
  cycleChip.classList.toggle('stale', behind);

  cycleBanner.hidden = !behind;
  if (behind) {
    document.getElementById('bannerNewMonth').textContent = monthLabel(thisMonth);
    document.getElementById('bannerOldMonth').textContent = monthLabel(state.cycleMonth);
  }
}

// Rolls to the current calendar month and clears every checkmark.
function startNewCycle() {
  state.cycleMonth = monthKey();
  for (const s of SECTIONS) {
    state[s.key].forEach((it) => (it.checked = false));
    sortSection(s.key);
  }
  renderAll();
  persist();
}

/* ---------------- Add / edit sheet ---------------- */

const sheetBackdrop = document.getElementById('sheetBackdrop');
const sheetTitle = document.getElementById('sheetTitle');
const sheetName = document.getElementById('sheetName');
const sheetAmount = document.getElementById('sheetAmount');
const sheetBalance = document.getElementById('sheetBalance');
const sheetDelta = document.getElementById('sheetDelta');
const sheetDeleteBtn = document.getElementById('sheetDelete');

let sheetCtx = null;
let sheetLastProjection = 0;
// Set when a service-worker update lands while the sheet is open.
let pendingReload = false;

// Balance as it would stand if the sheet were saved right now.
function projectedBalance() {
  const totals = {
    income: sectionTotal('income'),
    commitments: sectionTotal('commitments'),
    savings: sectionTotal('savings'),
  };
  if (sheetCtx.mode === 'edit') {
    const item = state[sheetCtx.key].find((it) => it.id === sheetCtx.id);
    if (item) totals[sheetCtx.key] -= Number(item.amount) || 0;
  }
  totals[sheetCtx.key] += digitsToAmount(sheetCtx.digits);
  return totals.income - totals.commitments - totals.savings;
}

function updateSheetPreview() {
  const projected = projectedBalance();
  setAnimatedAmount(sheetBalance, formatRMLarge(projected), projected - sheetLastProjection);
  applyBalanceTone(sheetBalance, projected);
  sheetLastProjection = projected;

  const delta = projected - currentBalance();
  if (Math.abs(delta) <= 0.004) {
    sheetDelta.textContent = 'No change yet';
  } else {
    sheetDelta.textContent = `${delta > 0 ? '▲' : '▼'} ${formatRM(Math.abs(delta))} vs now`;
  }
}

function openSheet({ mode, key, id }) {
  const section = SECTION_BY_KEY[key];
  sheetCtx = { mode, key, id: id || null, digits: '' };

  if (mode === 'edit') {
    const item = state[key].find((it) => it.id === id);
    if (!item) return;
    sheetCtx.digits = amountToDigits(item.amount);
    sheetName.value = item.name;
    sheetTitle.textContent = `Edit ${section.noun}`;
    sheetDeleteBtn.hidden = false;
  } else {
    sheetName.value = '';
    sheetTitle.textContent = `New ${section.noun}`;
    sheetDeleteBtn.hidden = true;
  }

  sheetAmount.value = sheetCtx.digits ? formatDigits(sheetCtx.digits) : '';

  // Start the preview from today's balance so the first keystroke animates.
  sheetBalance.dataset.text = '';
  sheetLastProjection = currentBalance();
  updateSheetPreview();

  sheetBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => sheetBackdrop.classList.add('open'));

  setTimeout(() => {
    const target = mode === 'edit' ? sheetAmount : sheetName;
    target.focus();
    if (target === sheetAmount) {
      const end = sheetAmount.value.length;
      sheetAmount.setSelectionRange(end, end);
    }
  }, 260);
}

function closeSheet() {
  sheetBackdrop.classList.remove('open');
  document.body.style.overflow = '';
  sheetCtx = null;
  setTimeout(() => {
    sheetBackdrop.hidden = true;
    // An update that arrived while the sheet was open applies now.
    if (pendingReload) { flushPersist(); window.location.reload(); }
  }, 300);
}

function saveSheet() {
  if (!sheetCtx) return;
  const { mode, key, id } = sheetCtx;
  const amount = digitsToAmount(sheetCtx.digits);
  const name = sheetName.value.trim();

  if (mode === 'add') {
    if (!name && !amount) { closeSheet(); return; }
    state[key].push({ id: uid(), name: name || 'New item', amount, checked: false });
  } else {
    const item = state[key].find((it) => it.id === id);
    if (item) {
      item.name = name || item.name;
      item.amount = amount;
    }
  }

  closeSheet();
  sortSection(key);
  renderSection(key);
  updateTotals();
  persist();
}

sheetAmount.addEventListener('input', () => {
  if (!sheetCtx) return;
  sheetCtx.digits = normaliseDigits(sheetAmount.value);
  sheetAmount.value = sheetCtx.digits ? formatDigits(sheetCtx.digits) : '';
  updateSheetPreview();
});

sheetName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sheetAmount.focus(); }
});
sheetAmount.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveSheet(); }
});

document.getElementById('sheetSave').addEventListener('click', saveSheet);
document.getElementById('sheetCancel').addEventListener('click', closeSheet);
sheetDeleteBtn.addEventListener('click', () => {
  if (!sheetCtx || sheetCtx.mode !== 'edit') return;
  const { key, id } = sheetCtx;
  closeSheet();
  deleteItem(key, id);
});
sheetBackdrop.addEventListener('click', (e) => {
  if (e.target === sheetBackdrop) closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetCtx) closeSheet();
});

/* ---------------- Mutations ---------------- */

function deleteItem(key, id) {
  const row = grid.querySelector(`.section[data-key="${key}"] .item[data-id="${id}"]`);
  if (row) {
    row.classList.add('dragging-out');
    requestAnimationFrame(() => { row.style.transform = 'translateX(30px)'; });
  }
  setTimeout(() => {
    state[key] = state[key].filter((it) => it.id !== id);
    renderSection(key, { skipFlip: true });
    updateTotals();
    persist();
  }, 180);
}

function toggleItem(key, id) {
  const item = state[key].find((it) => it.id === id);
  if (!item) return;

  item.checked = !item.checked;

  if (item.checked) {
    const row = grid.querySelector(`.section[data-key="${key}"] .item[data-id="${id}"]`);
    if (row) {
      row.classList.add('checked', 'just-checked');
      celebrate(row.querySelector('.checkbox'));
      setTimeout(() => row.classList.remove('just-checked'), 500);
    }
  }

  // Give the celebration a beat before the row hops to the bottom.
  setTimeout(() => {
    sortSection(key);
    renderSection(key);
  }, item.checked ? 260 : 0);

  persist();
}

/* ---------------- Celebration: confetti + vibration + sound ---------------- */

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Percussive "cha" plus two bright chime tones — the original ka-ching.
function playKaChing() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Percussive "cha" — short filtered noise burst.
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1800;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.09);

  // Bright "ching" bell tones, two quick chimes.
  [1760, 2637].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const start = now + 0.04 + i * 0.07;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.28, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.56);
  });
}

const confettiCanvas = document.getElementById('confettiCanvas');
const cctx = confettiCanvas.getContext('2d');
let confettiParticles = [];
let confettiRunning = false;

function resizeCanvas() {
  confettiCanvas.width = window.innerWidth * devicePixelRatio;
  confettiCanvas.height = window.innerHeight * devicePixelRatio;
  confettiCanvas.style.width = window.innerWidth + 'px';
  confettiCanvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const CONFETTI_COLORS = ['#34C759', '#007AFF', '#FF9500', '#AF52DE', '#FF3B30', '#30B0C7', '#FFD60A'];

function burstConfetti(x, y) {
  for (let i = 0; i < 26; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    confettiParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
      life: 0,
      maxLife: 55 + Math.random() * 25,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    requestAnimationFrame(tickConfetti);
  }
}

function tickConfetti() {
  cctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  confettiParticles.forEach((p) => {
    p.life++;
    p.vy += 0.16; // gravity
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;

    cctx.save();
    cctx.globalAlpha = Math.max(1 - p.life / p.maxLife, 0);
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rotation);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    cctx.restore();
  });

  confettiParticles = confettiParticles.filter((p) => p.life < p.maxLife);

  if (confettiParticles.length > 0) {
    requestAnimationFrame(tickConfetti);
  } else {
    confettiRunning = false;
    cctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function celebrate(anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
  playKaChing();
  if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
}

/* ---------------- New-cycle confirmation ---------------- */

const modalBackdrop = document.getElementById('modalBackdrop');
const modalBody = document.getElementById('modalBody');

function askNewCycle() {
  const thisMonth = monthKey();
  modalBody.textContent = state.cycleMonth === thisMonth
    ? `This unchecks every item in the ${monthLabel(thisMonth)} cycle. Your items and amounts stay the same.`
    : `This unchecks every item and moves you from ${monthLabel(state.cycleMonth)} to ${monthLabel(thisMonth)}. Your items and amounts stay the same.`;
  modalBackdrop.classList.add('open');
}

document.getElementById('clearBtn').addEventListener('click', askNewCycle);
document.getElementById('cycleRollBtn').addEventListener('click', askNewCycle);
document.getElementById('modalCancel').addEventListener('click', () => {
  modalBackdrop.classList.remove('open');
});
document.getElementById('modalConfirm').addEventListener('click', () => {
  modalBackdrop.classList.remove('open');
  startNewCycle();
});
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
});

// If the app is left open across midnight into a new month, catch up.
setInterval(renderCycle, 60 * 1000);

/* ---------------- Init ---------------- */

for (const s of SECTIONS) sortSection(s.key);
buildSectionShells();
renderAll({ skipFlip: true });

// Unlock audio on first interaction (mobile autoplay policies).
window.addEventListener('pointerdown', () => getAudioCtx(), { once: true });

/* ---------------- Service worker: keep the app self-updating ----------------
   Assets are served network-first, so a deploy reaches the browser on the
   next load without any manual cache-busting. When a new worker takes over
   an already-controlled page, reload so the running app matches the files
   just fetched — deferred if the user is mid-edit in the sheet. */

let reloadingForUpdate = false;

function applyUpdateWhenIdle() {
  if (reloadingForUpdate) return;
  reloadingForUpdate = true;
  // Don't yank the page out from under someone typing an amount.
  if (sheetCtx) { pendingReload = true; return; }
  flushPersist();
  window.location.reload();
}

/* A tab left open all day would otherwise sit on old code until it is
   refreshed, since network-first only helps at load time. So compare the
   validator the server reports for app.js against the one it reported when
   this page loaded; if the deploy changed, reload into it. */

let assetSignature = null;

async function readAssetSignature() {
  try {
    const res = await fetch('app.js', { method: 'HEAD', cache: 'reload' });
    if (!res.ok) return null;
    return res.headers.get('etag') || res.headers.get('last-modified');
  } catch (e) {
    return null; // Offline, or the host hides validators — try again later.
  }
}

async function checkForUpdate(registration) {
  if (registration) registration.update();
  const signature = await readAssetSignature();
  if (!signature) return;
  if (assetSignature === null) {
    assetSignature = signature;
  } else if (signature !== assetSignature) {
    assetSignature = signature;
    applyUpdateWhenIdle();
  }
}

if ('serviceWorker' in navigator) {
  // Null on a first visit; an update should only reload an already-live page.
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) applyUpdateWhenIdle();
  });

  window.addEventListener('load', async () => {
    let registration = null;
    try {
      registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    } catch (e) {
      console.warn('Service worker registration failed; running without it.', e);
    }
    checkForUpdate(registration);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate(registration);
    });
    setInterval(() => checkForUpdate(registration), 15 * 60 * 1000);
  });
}
