'use strict';

/* ============================================================
   Commitment Checklist — state, persistence, rendering, effects
   ============================================================ */

const STORAGE_KEY = 'commitment-checklist.v1';

const SECTIONS = [
  { key: 'income', title: 'Income' },
  { key: 'commitments', title: 'Commitments' },
  { key: 'savings', title: 'To Savings' },
];

const currency = new Intl.NumberFormat('en-MY', {
  style: 'currency',
  currency: 'MYR',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format;

function formatRM(amount) {
  // en-MY renders MYR as "RM" — normalise spacing just in case.
  return currency(amount || 0).replace('RM', 'RM').replace(/\s+/g, '');
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultState() {
  return {
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
    return parsed;
  } catch (e) {
    console.warn('Could not read saved data, starting fresh.', e);
    return defaultState();
  }
}

let state = loadState();
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, 150);
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

function updateTotals(animateBalance) {
  const income = sectionTotal('income');
  const commitments = sectionTotal('commitments');
  const savings = sectionTotal('savings');
  const balance = income - commitments - savings;

  document.getElementById('incomeTotal').textContent = formatRM(income);
  document.getElementById('commitmentsTotal').textContent = formatRM(commitments);
  document.getElementById('savingsTotal').textContent = formatRM(savings);

  for (const s of SECTIONS) {
    const el = document.querySelector(`.section[data-key="${s.key}"] .section-total`);
    if (el) el.textContent = formatRM(sectionTotal(s.key));
  }

  const balanceEl = document.getElementById('balanceAmount');
  balanceEl.innerHTML = formatRM(balance).replace('RM', 'RM&nbsp;');
  balanceEl.classList.toggle('negative', balance < 0);
  if (animateBalance) {
    balanceEl.classList.remove('pulse');
    void balanceEl.offsetWidth; // restart animation
    balanceEl.classList.add('pulse');
  }
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

    const form = node.querySelector('.add-item-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addItem(s.key, form);
    });

    grid.appendChild(node);
  }
}

function renderSection(key, { skipFlip } = {}) {
  const sectionEl = grid.querySelector(`.section[data-key="${key}"]`);
  const list = sectionEl.querySelector('.item-list');

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

    const nameInput = row.querySelector('.item-name');
    nameInput.value = item.name;
    nameInput.addEventListener('input', () => {
      item.name = nameInput.value;
      persist();
    });

    const amountInput = row.querySelector('.item-amount');
    amountInput.value = item.amount ? trimAmount(item.amount) : '';
    amountInput.placeholder = '0.00';
    amountInput.addEventListener('input', () => {
      item.amount = parseFloat(amountInput.value) || 0;
      updateTotals(true);
      persist();
    });
    amountInput.addEventListener('change', () => {
      sortSection(key);
      renderSection(key);
      persist();
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
  updateTotals(false);
}

function trimAmount(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/* ---------------- Mutations ---------------- */

function addItem(key, form) {
  const nameInput = form.querySelector('.add-name');
  const amountInput = form.querySelector('.add-amount');
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value) || 0;
  if (!name && !amount) return;

  state[key].push({ id: uid(), name: name || 'New item', amount, checked: false });
  sortSection(key);
  renderSection(key);
  updateTotals(true);
  persist();

  nameInput.value = '';
  amountInput.value = '';
  nameInput.focus();
}

function deleteItem(key, id) {
  const row = grid.querySelector(`.section[data-key="${key}"] .item[data-id="${id}"]`);
  if (row) {
    row.classList.add('dragging-out');
    requestAnimationFrame(() => {
      row.style.transform = 'translateX(30px)';
    });
  }
  setTimeout(() => {
    state[key] = state[key].filter((it) => it.id !== id);
    renderSection(key, { skipFlip: true });
    updateTotals(true);
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
      const cb = row.querySelector('.checkbox');
      celebrate(cb);
      setTimeout(() => row.classList.remove('just-checked'), 500);
    }
  }

  // Give the celebration a beat before the row hops to the bottom.
  const delay = item.checked ? 260 : 0;
  setTimeout(() => {
    sortSection(key);
    renderSection(key);
  }, delay);

  updateTotals(true);
  persist();
}

function clearAllCheckmarks() {
  for (const s of SECTIONS) {
    state[s.key].forEach((it) => (it.checked = false));
    sortSection(s.key);
  }
  renderAll();
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
  const count = 26;
  for (let i = 0; i < count; i++) {
    const angle = (Math.random() * Math.PI * 2);
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

    const fade = 1 - p.life / p.maxLife;
    cctx.save();
    cctx.globalAlpha = Math.max(fade, 0);
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

/* ---------------- Clear-checkmarks modal ---------------- */

const modalBackdrop = document.getElementById('modalBackdrop');
document.getElementById('clearBtn').addEventListener('click', () => {
  modalBackdrop.classList.add('open');
});
document.getElementById('modalCancel').addEventListener('click', () => {
  modalBackdrop.classList.remove('open');
});
document.getElementById('modalConfirm').addEventListener('click', () => {
  modalBackdrop.classList.remove('open');
  clearAllCheckmarks();
});
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
});

/* ---------------- Init ---------------- */

for (const s of SECTIONS) sortSection(s.key);
buildSectionShells();
renderAll({ skipFlip: true });

// Unlock audio on first interaction (mobile autoplay policies).
window.addEventListener('pointerdown', () => getAudioCtx(), { once: true });
