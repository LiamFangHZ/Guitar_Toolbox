// app.js — i18n, settings panel, card visibility
// Loaded before metronome.js and tuner.js so that window.t() is available to both.

const TRANSLATIONS = {
  en: {
    appTitle: 'Guitar Practice',
    settings: 'Settings',
    language: 'Language',
    visibleCards: 'Visible Cards',
    // Metronome
    metronome: 'Metronome',
    timeSig: 'Time Signature',
    start: 'Start',
    stop: 'Stop',
    tapTempo: 'Tap Tempo',
    // Tuner
    tuner: 'Tuner',
    tuning: 'Tuning',
    a4ref: 'A4 Reference',
    startTuner: 'Start Tuner',
    stopTuner: 'Stop Tuner',
    inTune: 'IN TUNE',
    flat: '▼ FLAT',
    sharp: '▲ SHARP',
    micDenied: 'Microphone access denied. Please allow microphone access to use the tuner.',
    // Tuning select options
    tuningStandard: 'Standard (EADGBe)',
    tuningDropD: 'Drop D (DADGBe)',
    tuningHalfDown: 'Half Step Down (Eb Ab Db Gb Bb eb)',
    tuningFullDown: 'Full Step Down (DGCFAd)',
    tuningOpenG: 'Open G (DGDGBd)',
    tuningOpenD: 'Open D (DADf#Ad)',
    tuningOpenE: 'Open E (EBE G#Be)',
    tuningOpenA: 'Open A (EAEAc#e)',
    tuningDadgad: 'DADGAD',
    tuningCustom: 'Custom…',
    // Custom tuning editor column headers
    stringLabel: 'String',
    noteLabel: 'Note',
    octaveLabel: 'Oct',
  },
  zh: {
    appTitle: '吉他练习',
    settings: '设置',
    language: '语言',
    visibleCards: '显示模块',
    // Metronome
    metronome: '节拍器',
    timeSig: '拍号',
    start: '开始',
    stop: '停止',
    tapTempo: '点击节拍',
    // Tuner
    tuner: '调音器',
    tuning: '调弦方式',
    a4ref: 'A4 参考音高',
    startTuner: '开始调音',
    stopTuner: '停止调音',
    inTune: '准确',
    flat: '▼ 偏低',
    sharp: '▲ 偏高',
    micDenied: '麦克风访问被拒绝，请允许麦克风权限以使用调音器。',
    // Tuning select options
    tuningStandard: '标准调弦 (EADGBe)',
    tuningDropD: 'Drop D (DADGBe)',
    tuningHalfDown: '降半音 (Eb Ab Db Gb Bb eb)',
    tuningFullDown: '降全音 (DGCFAd)',
    tuningOpenG: '开放 G (DGDGBd)',
    tuningOpenD: '开放 D (DADf#Ad)',
    tuningOpenE: '开放 E (EBE G#Be)',
    tuningOpenA: '开放 A (EAEAc#e)',
    tuningDadgad: 'DADGAD',
    tuningCustom: '自定义…',
    // Custom tuning editor column headers
    stringLabel: '弦',
    noteLabel: '音名',
    octaveLabel: '八度',
  },
};

const TUNING_OPTION_KEYS = {
  standard: 'tuningStandard',
  dropD:    'tuningDropD',
  halfDown: 'tuningHalfDown',
  fullDown: 'tuningFullDown',
  openG:    'tuningOpenG',
  openD:    'tuningOpenD',
  openE:    'tuningOpenE',
  openA:    'tuningOpenA',
  dadgad:   'tuningDadgad',
  custom:   'tuningCustom',
};

// --- Settings state (persisted in localStorage) ---
const settings = {
  lang:          localStorage.getItem('gp_lang') || 'en',
  showMetronome: localStorage.getItem('gp_showMetronome') !== 'false',
  showTuner:     localStorage.getItem('gp_showTuner') !== 'false',
};

// Global translation function — called by metronome.js and tuner.js
window.t = function(key) {
  return (TRANSLATIONS[settings.lang] || TRANSLATIONS.en)[key] ?? key;
};

function saveSettings() {
  localStorage.setItem('gp_lang',          settings.lang);
  localStorage.setItem('gp_showMetronome', settings.showMetronome);
  localStorage.setItem('gp_showTuner',     settings.showTuner);
}

// Update all [data-i18n] elements, tuning options, then fix JS-managed text
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  // Tuning select option labels
  const tuningSelect = document.getElementById('tuningSelect');
  if (tuningSelect) {
    tuningSelect.querySelectorAll('option').forEach(opt => {
      const key = TUNING_OPTION_KEYS[opt.value];
      if (key) opt.textContent = t(key);
    });
  }

  // Language button active state
  document.querySelectorAll('.btn-lang').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === settings.lang);
  });

  document.title = t('appTitle');

  // Fix text for elements whose content is driven by JS running state
  applyDynamicStrings();
}

// Sync text for elements managed by metronome.js / tuner.js
function applyDynamicStrings() {
  const startStop = document.getElementById('startStop');
  if (startStop) {
    startStop.textContent = startStop.classList.contains('running') ? t('stop') : t('start');
  }
  const tunerStartStop = document.getElementById('tunerStartStop');
  if (tunerStartStop) {
    tunerStartStop.textContent = tunerStartStop.classList.contains('running') ? t('stopTuner') : t('startTuner');
  }
  const tunerStatus = document.getElementById('tunerStatus');
  if (tunerStatus) {
    if      (tunerStatus.classList.contains('in-tune')) tunerStatus.textContent = t('inTune');
    else if (tunerStatus.classList.contains('flat'))    tunerStatus.textContent = t('flat');
    else if (tunerStatus.classList.contains('sharp'))   tunerStatus.textContent = t('sharp');
  }
}

function applyCardVisibility() {
  const metCard = document.getElementById('metronomeCard');
  const tunCard = document.getElementById('tunerCard');
  if (metCard) metCard.style.display = settings.showMetronome ? '' : 'none';
  if (tunCard) tunCard.style.display = settings.showTuner     ? '' : 'none';
}

// --- Settings panel ---
function openSettings() {
  document.getElementById('settingsPanel').classList.add('open');
  document.getElementById('settingsBackdrop').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('settingsBackdrop').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);

  // Language buttons
  document.querySelectorAll('.btn-lang').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.lang = btn.dataset.lang;
      saveSettings();
      applyTranslations();
    });
  });

  // Card visibility toggles
  const toggleMet = document.getElementById('toggleMetronome');
  const toggleTun = document.getElementById('toggleTuner');
  toggleMet.checked = settings.showMetronome;
  toggleTun.checked = settings.showTuner;
  toggleMet.addEventListener('change', e => {
    settings.showMetronome = e.target.checked;
    saveSettings();
    applyCardVisibility();
  });
  toggleTun.addEventListener('change', e => {
    settings.showTuner = e.target.checked;
    saveSettings();
    applyCardVisibility();
  });

  applyTranslations();
  applyCardVisibility();
});
