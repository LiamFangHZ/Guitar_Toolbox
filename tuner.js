// Guitar Tuner — Web Audio API + autocorrelation pitch detection
// Supports alternate tunings and adjustable A4 reference frequency

const NOTE_STRINGS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Tuning definitions: MIDI note numbers for strings 6→1 (low→high)
// MIDI 69 = A4 (440 Hz reference baseline)
const TUNINGS = {
  standard: { label: 'Standard',    midi: [40, 45, 50, 55, 59, 64] },
  dropD:    { label: 'Drop D',      midi: [38, 45, 50, 55, 59, 64] },
  halfDown: { label: 'Half Step ↓', midi: [39, 44, 49, 54, 58, 63] },
  fullDown: { label: 'Full Step ↓', midi: [38, 43, 48, 53, 57, 62] },
  openG:    { label: 'Open G',      midi: [38, 43, 50, 55, 59, 62] },
  openD:    { label: 'Open D',      midi: [38, 45, 50, 54, 57, 62] },
  openE:    { label: 'Open E',      midi: [40, 47, 52, 56, 59, 64] },
  openA:    { label: 'Open A',      midi: [40, 45, 52, 57, 61, 64] },
  dadgad:   { label: 'DADGAD',      midi: [38, 45, 50, 55, 57, 62] },
};

// Convert MIDI note number to note name (e.g. 40 → "E2")
function midiToName(midi) {
  const name = NOTE_STRINGS[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

// Custom tuning (mutable copy of standard as default)
TUNINGS.custom = { label: 'Custom', midi: [...TUNINGS.standard.midi] };

// Current settings
let refA4 = 440;
let currentTuningKey = 'standard';

// Expose current tuning for chord-finder.js
window.getTunerMidi = () => ({ key: currentTuningKey, midi: [...TUNINGS[currentTuningKey].midi] });

// DOM refs
const tunerStartStop  = document.getElementById('tunerStartStop');
const tunerNoteEl     = document.getElementById('tunerNote');
const tunerOctaveEl   = document.getElementById('tunerOctave');
const tunerFreqEl     = document.getElementById('tunerFreq');
const tunerCentsEl    = document.getElementById('tunerCents');
const tunerStatusEl   = document.getElementById('tunerStatus');
const gaugeNeedle     = document.getElementById('gaugeNeedle');
const stringRefsEl    = document.getElementById('stringRefs');
const tuningSelect    = document.getElementById('tuningSelect');
const refPitchSelect  = document.getElementById('refPitchSelect');
const customTuningEl  = document.getElementById('customTuning');
const customTuningGrid = document.getElementById('customTuningGrid');

let tunerRunning = false;
let tunerAudioCtx = null;
let analyser = null;
let micStream = null;
let tunerRafId = null;
const tunerBuffer = new Float32Array(2048);

// --- Frequency smoothing ---
// Median filter over recent readings to reject outliers,
// then EMA to damp residual oscillation without adding too much lag.
const FREQ_HISTORY_MAX = 8;
const MIN_HISTORY = 5;         // frames needed before we trust a reading
const EMA_ALPHA = 0.2;
const SILENCE_HOLDOVER = 120;  // ~2s at 60fps before blanking display
const JUMP_THRESHOLD = 1.122;  // ~2 semitones — reset history on large pitch jump

const freqHistory = [];
let smoothedFreqEMA = -1;
let silenceFrames = 0;

function smoothFrequency(raw) {
  if (raw === -1) {
    silenceFrames++;
    if (silenceFrames >= SILENCE_HOLDOVER) {
      freqHistory.length = 0;
      smoothedFreqEMA = -1;
      return -1;
    }
    // Hold last reading during brief silence (note decay)
    return smoothedFreqEMA === -1 ? -1 : smoothedFreqEMA;
  }

  silenceFrames = 0;

  // New note: if pitch jumps more than ~2 semitones, reset and start fresh
  if (smoothedFreqEMA !== -1) {
    const ratio = raw / smoothedFreqEMA;
    if (ratio > JUMP_THRESHOLD || ratio < 1 / JUMP_THRESHOLD) {
      freqHistory.length = 0;
      smoothedFreqEMA = -1;
    }
  }

  freqHistory.push(raw);
  if (freqHistory.length > FREQ_HISTORY_MAX) freqHistory.shift();

  // Don't show anything until we have enough history
  if (freqHistory.length < MIN_HISTORY) return -1;

  // Consistency check: reject if readings span more than ~1 semitone
  // (catches octave-doubling errors from autocorrelation)
  const max = Math.max(...freqHistory);
  const min = Math.min(...freqHistory);
  if (max / min > 1.06) return -1;

  const sorted = [...freqHistory].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  smoothedFreqEMA = smoothedFreqEMA === -1 ? median : EMA_ALPHA * median + (1 - EMA_ALPHA) * smoothedFreqEMA;
  return smoothedFreqEMA;
}

// --- String reference UI ---

function renderStringRefs() {
  const tuning = TUNINGS[currentTuningKey];
  stringRefsEl.innerHTML = '';
  tuning.midi.forEach(midi => {
    const div = document.createElement('div');
    div.className = 'string-ref';
    div.dataset.midi = midi;
    div.textContent = midiToName(midi);
    stringRefsEl.appendChild(div);
  });
}

// --- Frequency helpers ---

// Frequency of a MIDI note at the current reference pitch
function midiToFreq(midi) {
  return refA4 * Math.pow(2, (midi - 69) / 12);
}

// Detect the nearest string in the current tuning (within ±50 cents)
function nearestString(freq) {
  const tuning = TUNINGS[currentTuningKey];
  let best = null, bestCents = Infinity;
  for (const midi of tuning.midi) {
    const target = midiToFreq(midi);
    const cents = Math.abs(1200 * Math.log2(freq / target));
    if (cents < bestCents) { bestCents = cents; best = midi; }
  }
  return bestCents <= 50 ? best : null;
}

// --- Pitch detection via autocorrelation ---

function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // silence

  // Trim to zero crossings
  let r1 = 0, r2 = SIZE - 1;
  for (let i = 0; i < SIZE / 2; i++) { if (buf[i] < 0) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (buf[SIZE - i] < 0) { r2 = SIZE - i; break; } }
  const trimmed = buf.slice(r1, r2);
  const N = trimmed.length;

  // Autocorrelation
  const c = new Float32Array(N);
  for (let lag = 0; lag < N; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // Find first dip then first peak
  let d = 0;
  while (d < N && c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i < N; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0) return -1;

  // Parabolic interpolation for sub-sample accuracy
  const x1 = c[maxPos - 1] ?? 0;
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a !== 0 ? -b / (2 * a) : 0;

  return sampleRate / (maxPos + shift);
}

// --- Note name + cents from frequency ---

function freqToNote(freq) {
  // Semitones above C0 using current reference
  const semitones = 12 * Math.log2(freq / refA4) + 69; // semitones from C-1
  const rounded = Math.round(semitones);
  const octave = Math.floor(rounded / 12) - 1;
  const name = NOTE_STRINGS[((rounded % 12) + 12) % 12];
  const cents = Math.round((semitones - rounded) * 100);
  return { name, octave, cents };
}

// --- Update UI ---

function updateTunerUI(freq) {
  if (freq === -1) {
    tunerNoteEl.textContent = '--';
    tunerNoteEl.className = 'tuner-note';
    tunerOctaveEl.textContent = '';
    tunerFreqEl.textContent = '';
    tunerCentsEl.textContent = '0 ¢';
    tunerStatusEl.textContent = '';
    tunerStatusEl.className = 'tuner-status';
    gaugeNeedle.style.left = '50%';
    gaugeNeedle.className = 'gauge-needle';
    stringRefsEl.querySelectorAll('.string-ref').forEach(el => el.classList.remove('active'));
    return;
  }

  const { name, octave, cents } = freqToNote(freq);
  const inTune = Math.abs(cents) <= 5;

  tunerNoteEl.textContent = name;
  tunerNoteEl.className = 'tuner-note' + (inTune ? ' in-tune' : '');
  tunerOctaveEl.textContent = octave;
  tunerFreqEl.textContent = freq.toFixed(1) + ' Hz';
  tunerCentsEl.textContent = (cents >= 0 ? '+' : '') + cents + ' ¢';

  // Needle position: cents -50..+50 → 0%..100%
  const clamped = Math.max(-50, Math.min(50, cents));
  gaugeNeedle.style.left = ((clamped + 50) / 100 * 100) + '%';
  gaugeNeedle.className = 'gauge-needle' + (inTune ? ' in-tune' : '');

  // Flat / Sharp / In-Tune status text
  if (inTune) {
    tunerStatusEl.textContent = t('inTune');
    tunerStatusEl.className = 'tuner-status in-tune';
  } else if (cents < 0) {
    tunerStatusEl.textContent = t('flat');
    tunerStatusEl.className = 'tuner-status flat';
  } else {
    tunerStatusEl.textContent = t('sharp');
    tunerStatusEl.className = 'tuner-status sharp';
  }

  // Highlight nearest string
  const nearestMidi = nearestString(freq);
  stringRefsEl.querySelectorAll('.string-ref').forEach(el => {
    el.classList.toggle('active', nearestMidi !== null && Number(el.dataset.midi) === nearestMidi);
  });
}

// --- Analysis loop ---

function tunerLoop() {
  if (!tunerRunning) return;
  analyser.getFloatTimeDomainData(tunerBuffer);
  const raw = autoCorrelate(tunerBuffer, tunerAudioCtx.sampleRate);
  updateTunerUI(smoothFrequency(raw));
  tunerRafId = requestAnimationFrame(tunerLoop);
}

// --- Start / Stop ---

async function startTuner() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    alert(t('micDenied'));
    return;
  }

  tunerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = tunerAudioCtx.createAnalyser();
  analyser.fftSize = 2048;

  const source = tunerAudioCtx.createMediaStreamSource(micStream);
  source.connect(analyser);

  tunerRunning = true;
  tunerStartStop.textContent = t('stopTuner');
  tunerStartStop.classList.add('running');
  tunerLoop();
}

function stopTuner() {
  tunerRunning = false;
  cancelAnimationFrame(tunerRafId);
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (tunerAudioCtx) { tunerAudioCtx.close(); tunerAudioCtx = null; }
  freqHistory.length = 0;
  smoothedFreqEMA = -1;
  silenceFrames = 0;
  updateTunerUI(-1);
  tunerStartStop.textContent = t('startTuner');
  tunerStartStop.classList.remove('running');
}

tunerStartStop.addEventListener('click', () => {
  tunerRunning ? stopTuner() : startTuner();
});

// --- Custom tuning editor ---

function renderCustomTuningEditor() {
  customTuningGrid.innerHTML = '';
  // midi array is ordered string 6 (low) → string 1 (high)
  TUNINGS.custom.midi.forEach((midi, idx) => {
    const stringNum = 6 - idx;
    const noteIdx = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;

    const row = document.createElement('div');
    row.className = 'custom-string-control';

    const label = document.createElement('span');
    label.className = 'custom-string-label';
    label.textContent = stringNum;

    const noteSelect = document.createElement('select');
    NOTE_STRINGS.forEach((n, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = n;
      if (i === noteIdx) opt.selected = true;
      noteSelect.appendChild(opt);
    });

    const octaveSelect = document.createElement('select');
    for (let o = 1; o <= 6; o++) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === octave) opt.selected = true;
      octaveSelect.appendChild(opt);
    }

    const updateMidi = () => {
      TUNINGS.custom.midi[idx] = (Number(octaveSelect.value) + 1) * 12 + Number(noteSelect.value);
      renderStringRefs();
      document.dispatchEvent(new CustomEvent('tunerTuningChanged', {
        detail: { key: 'custom', midi: [...TUNINGS.custom.midi] }
      }));
    };
    noteSelect.addEventListener('change', updateMidi);
    octaveSelect.addEventListener('change', updateMidi);

    row.appendChild(label);
    row.appendChild(noteSelect);
    row.appendChild(octaveSelect);
    customTuningGrid.appendChild(row);
  });
}

// --- Settings listeners ---

tuningSelect.addEventListener('change', () => {
  currentTuningKey = tuningSelect.value;
  const isCustom = currentTuningKey === 'custom';
  customTuningEl.classList.toggle('visible', isCustom);
  if (isCustom) renderCustomTuningEditor();
  renderStringRefs();
  document.dispatchEvent(new CustomEvent('tunerTuningChanged', {
    detail: { key: currentTuningKey, midi: [...TUNINGS[currentTuningKey].midi] }
  }));
});

refPitchSelect.addEventListener('change', () => {
  refA4 = Number(refPitchSelect.value);
  renderStringRefs(); // update displayed frequencies if needed
});

// --- Init ---
renderStringRefs();
