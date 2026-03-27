// chord-finder.js — 和弦速查 (Chord Quick Lookup)
// Virtual fretboard for chord identification

// ── Tuning Presets (mirrors tuner.js TUNINGS) ─────────────────────────────
const CF_TUNINGS = {
  standard: { midi: [40, 45, 50, 55, 59, 64] },
  dropD:    { midi: [38, 45, 50, 55, 59, 64] },
  halfDown: { midi: [39, 44, 49, 54, 58, 63] },
  fullDown: { midi: [38, 43, 48, 53, 57, 62] },
  openG:    { midi: [38, 43, 50, 55, 59, 62] },
  openD:    { midi: [38, 45, 50, 54, 57, 62] },
  openE:    { midi: [40, 47, 52, 56, 59, 64] },
  openA:    { midi: [40, 45, 52, 57, 61, 64] },
  dadgad:   { midi: [38, 45, 50, 55, 57, 62] },
};

// Guitar-friendly note names (sharps for F#/C#, flats for others)
const CF_NOTE_NAMES  = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const CF_NOTE_SELECT = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const CF_STRING_NAMES = ['E','A','D','G','B','e'];

// ── Chord Database ─────────────────────────────────────────────────────────
const CF_CHORD_TYPES = [
  { symbol: '5',    nameZh: '强力和弦',   nameEn: 'Power',          intervals: [0, 7] },
  { symbol: '',     nameZh: '大三和弦',   nameEn: 'Major',          intervals: [0, 4, 7] },
  { symbol: 'm',    nameZh: '小三和弦',   nameEn: 'Minor',          intervals: [0, 3, 7] },
  { symbol: 'dim',  nameZh: '减三和弦',   nameEn: 'Diminished',     intervals: [0, 3, 6] },
  { symbol: 'aug',  nameZh: '增三和弦',   nameEn: 'Augmented',      intervals: [0, 4, 8] },
  { symbol: 'sus2', nameZh: '挂二和弦',   nameEn: 'Sus2',           intervals: [0, 2, 7] },
  { symbol: 'sus4', nameZh: '挂四和弦',   nameEn: 'Sus4',           intervals: [0, 5, 7] },
  { symbol: '6',    nameZh: '大六和弦',   nameEn: 'Major 6th',      intervals: [0, 4, 7, 9] },
  { symbol: 'm6',   nameZh: '小六和弦',   nameEn: 'Minor 6th',      intervals: [0, 3, 7, 9] },
  { symbol: '7',    nameZh: '属七和弦',   nameEn: 'Dominant 7th',   intervals: [0, 4, 7, 10] },
  { symbol: 'maj7', nameZh: '大七和弦',   nameEn: 'Major 7th',      intervals: [0, 4, 7, 11] },
  { symbol: 'm7',   nameZh: '小七和弦',   nameEn: 'Minor 7th',      intervals: [0, 3, 7, 10] },
  { symbol: 'mM7',  nameZh: '小大七和弦', nameEn: 'Minor-Major 7th',intervals: [0, 3, 7, 11] },
  { symbol: 'dim7', nameZh: '减七和弦',   nameEn: 'Diminished 7th', intervals: [0, 3, 6, 9] },
  { symbol: 'm7b5', nameZh: '半减七和弦', nameEn: 'Half-Dim 7th',   intervals: [0, 3, 6, 10] },
  { symbol: 'aug7', nameZh: '增属七和弦', nameEn: 'Augmented 7th',  intervals: [0, 4, 8, 10] },
  { symbol: 'add9', nameZh: '加九和弦',   nameEn: 'Add 9',          intervals: [0, 2, 4, 7] },
  { symbol: '9',    nameZh: '属九和弦',   nameEn: 'Dominant 9th',   intervals: [0, 2, 4, 7, 10] },
  { symbol: 'maj9', nameZh: '大九和弦',   nameEn: 'Major 9th',      intervals: [0, 2, 4, 7, 11] },
  { symbol: 'm9',   nameZh: '小九和弦',   nameEn: 'Minor 9th',      intervals: [0, 2, 3, 7, 10] },
];

// ── State ──────────────────────────────────────────────────────────────────
let cfTuningKey = 'standard';
let cfTuning    = [...CF_TUNINGS.standard.midi];
let cfCustom    = [...CF_TUNINGS.standard.midi]; // mutable custom tuning
let cfOffset    = 0; // 0 = open position (nut visible, top row = fret 1)

// stringStates[i] = { muted: bool, fret: 0-5 }
// fret 0 = open string; 1-5 = relative fret position above cfOffset
let cfStates = Array.from({ length: 6 }, () => ({ muted: false, fret: 0 }));

// ── Pitch Calculation ──────────────────────────────────────────────────────
function cfActiveMidi() {
  const notes = [];
  for (let s = 0; s < 6; s++) {
    const st = cfStates[s];
    if (st.muted) continue;
    notes.push(cfTuning[s] + (st.fret > 0 ? cfOffset + st.fret : 0));
  }
  return notes;
}

// ── Chord Identification ───────────────────────────────────────────────────
function cfIdentify() {
  const midi = cfActiveMidi();
  if (midi.length < 2) return [];

  const bassPC  = midi[0] % 12;
  const pcs     = [...new Set(midi.map(n => n % 12))];
  const results = [];

  for (let root = 0; root < 12; root++) {
    const intv = new Set(pcs.map(pc => (pc - root + 12) % 12));
    for (const ct of CF_CHORD_TYPES) {
      if (!ct.intervals.every(i => intv.has(i))) continue;

      const exact    = pcs.length === ct.intervals.length;
      const invert   = bassPC !== root;
      const extra    = pcs.length - ct.intervals.length;

      // Score: more chord tones > exact match > root bass > fewer extras
      let score = ct.intervals.length * 2;
      if (exact)  score += 10;
      if (!invert) score += 5;
      score -= extra * 3;

      const name =
        CF_NOTE_NAMES[root] + ct.symbol +
        (invert ? '/' + CF_NOTE_NAMES[bassPC] : '');

      results.push({ name, root, type: ct, invert, pcs, bassPC, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  }).slice(0, 3);
}

// ── Fretboard Rendering ────────────────────────────────────────────────────
function cfRender() {
  const wrapper = document.getElementById('cfFretboard');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  // ─ Header row: string names + O/X toggles ─
  const hdr = document.createElement('div');
  hdr.className = 'cf-row cf-hdr-row';

  for (let s = 0; s < 6; s++) {
    const col = document.createElement('div');
    col.className = 'cf-str-col';

    const nm = document.createElement('div');
    nm.className = 'cf-str-name';
    nm.textContent = CF_STRING_NAMES[s];
    col.appendChild(nm);

    const st  = cfStates[s];
    const btn = document.createElement('button');
    btn.className = 'cf-ox-btn ' + (st.muted ? 'cf-muted' : 'cf-open');
    btn.textContent = st.muted ? '✕' : '○';
    btn.addEventListener('click', () => {
      cfStates[s].muted = !cfStates[s].muted;
      if (cfStates[s].muted) cfStates[s].fret = 0;
      cfRender();
      cfUpdateResult();
    });
    col.appendChild(btn);
    hdr.appendChild(col);
  }
  // Spacer on the right to match fret-label column width
  const spc = document.createElement('div');
  spc.className = 'cf-fret-lbl';
  hdr.appendChild(spc);
  wrapper.appendChild(hdr);

  // ─ Nut (thick bar, only when no capo offset) ─
  if (cfOffset === 0) {
    const nut = document.createElement('div');
    nut.className = 'cf-nut-row';
    for (let s = 0; s < 6; s++) {
      const seg = document.createElement('div');
      seg.className = 'cf-nut-seg';
      nut.appendChild(seg);
    }
    const nutSpc = document.createElement('div');
    nutSpc.className = 'cf-fret-lbl';
    nut.appendChild(nutSpc);
    wrapper.appendChild(nut);
  }

  // ─ Fret rows ─
  for (let f = 1; f <= 5; f++) {
    const row = document.createElement('div');
    row.className = 'cf-row cf-fret-row';

    for (let s = 0; s < 6; s++) {
      const cell = document.createElement('div');
      cell.className = 'cf-cell';

      const st = cfStates[s];
      if (!st.muted && st.fret === f) {
        const dot = document.createElement('div');
        dot.className = 'cf-dot';
        cell.appendChild(dot);
      }

      cell.addEventListener('click', () => {
        if (cfStates[s].fret === f) {
          cfStates[s].fret = 0; // deselect → open
        } else {
          cfStates[s].fret = f;
          cfStates[s].muted = false;
        }
        cfRender();
        cfUpdateResult();
      });

      row.appendChild(cell);
    }
    // Fret label on the right
    const lbl = document.createElement('div');
    lbl.className = 'cf-fret-lbl';
    if (cfOffset > 0) {
      lbl.textContent = f === 1 ? (cfOffset + 1) + 'fr' : cfOffset + f;
    }
    row.appendChild(lbl);
    wrapper.appendChild(row);
  }
}

// ── Result Display ─────────────────────────────────────────────────────────
function cfUpdateResult() {
  const el = document.getElementById('cfResult');
  if (!el) return;

  const midi = cfActiveMidi();
  if (midi.length < 2) {
    el.innerHTML = `<p class="cf-hint">${window.t('cfHint')}</p>`;
    return;
  }

  // Collect unique pitch classes in order from lowest string
  const pcs = [];
  const seen = new Set();
  for (const m of midi) {
    const pc = m % 12;
    if (!seen.has(pc)) { pcs.push(pc); seen.add(pc); }
  }
  const noteStr = pcs.map(pc => CF_NOTE_NAMES[pc]).join(' · ');

  const matches = cfIdentify();
  if (matches.length === 0) {
    el.innerHTML =
      `<div class="cf-unknown">${window.t('cfUnknown')}</div>` +
      `<div class="cf-constituent">${noteStr}</div>`;
    return;
  }

  const lang = (typeof settings !== 'undefined') ? settings.lang : 'en';
  let html = '<div class="cf-matches">';
  matches.forEach((m, i) => {
    const type = lang === 'zh' ? m.type.nameZh : m.type.nameEn;
    html += `<div class="cf-match ${i === 0 ? 'cf-primary' : 'cf-secondary'}">
      <span class="cf-match-name">${m.name}</span>
      <span class="cf-match-type">${type}</span>
    </div>`;
  });
  html += '</div>';
  html += `<div class="cf-constituent">${noteStr}</div>`;
  el.innerHTML = html;
}

// ── Custom Tuning Editor ───────────────────────────────────────────────────
function cfRenderCustomEditor() {
  const grid = document.getElementById('cfCustomGrid');
  if (!grid) return;
  grid.innerHTML = '';

  cfCustom.forEach((midi, idx) => {
    const noteIdx = ((midi % 12) + 12) % 12;
    const octave  = Math.floor(midi / 12) - 1;
    const strNum  = 6 - idx;

    const row = document.createElement('div');
    row.className = 'custom-string-control';

    const label = document.createElement('span');
    label.className = 'custom-string-label';
    label.textContent = strNum;

    const noteSelect = document.createElement('select');
    CF_NOTE_SELECT.forEach((n, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = n;
      if (i === noteIdx) opt.selected = true;
      noteSelect.appendChild(opt);
    });

    const octSelect = document.createElement('select');
    for (let o = 1; o <= 6; o++) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === octave) opt.selected = true;
      octSelect.appendChild(opt);
    }

    const onChange = () => {
      cfCustom[idx] = (Number(octSelect.value) + 1) * 12 + Number(noteSelect.value);
      cfTuning = [...cfCustom];
      cfUpdateResult();
    };
    noteSelect.addEventListener('change', onChange);
    octSelect.addEventListener('change', onChange);

    row.appendChild(label);
    row.appendChild(noteSelect);
    row.appendChild(octSelect);
    grid.appendChild(row);
  });
}

// ── Sync Tuning From Tuner ─────────────────────────────────────────────────
function cfSyncFromTuner(key, midi) {
  cfTuning    = [...midi];
  cfCustom    = [...midi];
  cfTuningKey = key;
  const sel = document.getElementById('cfTuningSelect');
  if (sel) {
    const opt = sel.querySelector(`option[value="${key}"]`);
    sel.value = opt ? key : 'custom';
  }
  document.getElementById('cfCustomEditor')?.classList.remove('visible');
  cfUpdateResult();
}

// ── Init ───────────────────────────────────────────────────────────────────
function cfInit() {
  cfRender();
  cfUpdateResult();

  // ── Tuning select ──
  document.getElementById('cfTuningSelect').addEventListener('change', function () {
    cfTuningKey = this.value;
    const isCustom = cfTuningKey === 'custom';
    document.getElementById('cfCustomEditor').classList.toggle('visible', isCustom);
    if (isCustom) {
      cfTuning = [...cfCustom];
      cfRenderCustomEditor();
    } else {
      cfTuning = [...CF_TUNINGS[cfTuningKey].midi];
    }
    cfUpdateResult();
  });

  // ── Fret offset ──
  const cfFretInput = document.getElementById('cfFretDisplay');

  const cfApplyFret = (fret) => {
    const clamped = Math.max(1, Math.min(20, fret));
    cfOffset = clamped - 1;
    cfFretInput.value = clamped;
    cfRender();
    cfUpdateResult();
  };

  document.getElementById('cfFretDec').addEventListener('click', () => {
    cfApplyFret(cfOffset);  // cfOffset + 1 - 1 = cfOffset
  });
  document.getElementById('cfFretInc').addEventListener('click', () => {
    cfApplyFret(cfOffset + 2);  // cfOffset + 1 + 1 = cfOffset + 2
  });

  cfFretInput.addEventListener('change', () => {
    cfApplyFret(parseInt(cfFretInput.value) || 1);
  });
  cfFretInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') cfFretInput.blur();
  });

  // ── Clear ──
  document.getElementById('cfClearBtn').addEventListener('click', () => {
    cfStates = Array.from({ length: 6 }, () => ({ muted: false, fret: 0 }));
    cfRender();
    cfUpdateResult();
  });

  // ── Listen for tuner tuning changes ──
  document.addEventListener('tunerTuningChanged', (e) => {
    if (typeof settings !== 'undefined' && settings.syncChordTuning) {
      cfSyncFromTuner(e.detail.key, e.detail.midi);
    }
  });

  // ── Initial sync if enabled ──
  if (typeof settings !== 'undefined' && settings.syncChordTuning) {
    if (typeof window.getTunerMidi === 'function') {
      const { key, midi } = window.getTunerMidi();
      cfSyncFromTuner(key, midi);
    }
  }
}

// Also expose cfUpdateResult so app.js can call it on language change
window.cfUpdateResult = cfUpdateResult;

document.addEventListener('DOMContentLoaded', cfInit);
