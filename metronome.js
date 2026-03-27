// 节拍器 —— 使用 Web Audio API 调度器实现精准节拍时序
const AudioContext = window.AudioContext || window.webkitAudioContext;

// 音频上下文（延迟初始化，需要用户交互后才能创建）
let audioCtx = null;
// 节拍器是否正在运行
let isRunning = false;
// 当前每分钟节拍数（BPM）
let bpm = 120;
// 每小节的拍数（拍号分子）
let beatsPerMeasure = 4;
// 当前拍在小节内的序号（0 为强拍）
let currentBeat = 0;

// --- 调度器状态 ---
// 下一个节拍应该在音频时钟上的触发时间（秒）
let nextNoteTime = 0.0;
// 定时器句柄，用于定期调用调度器
let schedulerTimer = null;
// 提前多少秒将节拍加入音频队列（越大越稳定，但延迟也更高）
const SCHEDULE_AHEAD = 0.1;
// 调度器的调用间隔（毫秒）
const SCHEDULER_INTERVAL = 25;

// --- DOM 元素引用 ---
const bpmValueEl = document.getElementById('bpmValue');   // BPM 数字显示
const bpmSlider = document.getElementById('bpmSlider');   // BPM 滑块
const bpmDown = document.getElementById('bpmDown');       // BPM 减少按钮
const bpmUp = document.getElementById('bpmUp');           // BPM 增加按钮
const startStopBtn = document.getElementById('startStop'); // 开始/停止按钮
const tapBtn = document.getElementById('tapBtn');         // 点击节拍按钮
const beatDotsEl = document.getElementById('beatDots');   // 节拍圆点容器
const pendulum = document.getElementById('pendulum');     // 钟摆元素

// --- 节拍圆点 ---

// 根据当前拍号渲染圆点（每拍一个圆点）
function renderBeatDots() {
  beatDotsEl.innerHTML = '';
  for (let i = 0; i < beatsPerMeasure; i++) {
    const dot = document.createElement('div');
    dot.className = 'beat-dot';
    dot.dataset.index = i;
    beatDotsEl.appendChild(dot);
  }
}

// 点亮指定拍的圆点，第 0 拍（强拍）用强调色
function flashBeat(beatIndex) {
  const dots = beatDotsEl.querySelectorAll('.beat-dot');
  dots.forEach((d, i) => {
    d.classList.remove('active', 'accent');
    if (i === beatIndex) {
      d.classList.add(beatIndex === 0 ? 'accent' : 'active');
    }
  });
}

// --- 钟摆动画 ---

// 记录钟摆上一次摆向（true = 左，false = 右）
let pendulumLeft = false;

// 每拍触发一次摆动，beatDuration 为每拍时长（秒）
function swingPendulum(beatDuration) {
  const halfSwing = beatDuration / 2;
  // 将半拍时长设为 CSS 变量，用于控制过渡动画速度
  pendulum.style.setProperty('--swing-duration', `${halfSwing}s`);
  pendulum.classList.remove('swing-left', 'swing-right');
  // 强制浏览器重排，使 class 移除生效，避免动画不触发
  void pendulum.offsetWidth;
  pendulum.classList.add(pendulumLeft ? 'swing-left' : 'swing-right');
  pendulumLeft = !pendulumLeft;
}

// --- 音频点击声 ---

// 在指定音频时间播放一次点击音（强拍音调更高）
function scheduleClick(time, isAccent) {
  const osc = audioCtx.createOscillator();  // 振荡器，产生音调
  const gain = audioCtx.createGain();       // 增益节点，控制音量包络
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  // 强拍 1000Hz，弱拍 800Hz
  osc.frequency.value = isAccent ? 1000 : 800;
  // 起始音量：强拍 1.0，弱拍 0.7
  gain.gain.setValueAtTime(isAccent ? 1.0 : 0.7, time);
  // 快速衰减至几乎无声，形成短促的"哒"声
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  osc.start(time);
  osc.stop(time + 0.06);
}

// --- 调度器 ---

// 节拍队列：存储已调度但尚未在视觉上显示的节拍 {beat, time}
const beatQueue = [];

// 调度器：提前将若干节拍写入音频时钟，保证时序精准
function scheduler() {
  // 将时间窗口内的所有节拍全部提前调度
  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    scheduleClick(nextNoteTime, currentBeat === 0);
    // 同时将节拍信息推入视觉队列，供 RAF 循环消费
    beatQueue.push({ beat: currentBeat, time: nextNoteTime });

    const secondsPerBeat = 60.0 / bpm;
    nextNoteTime += secondsPerBeat;
    // 循环计数，到达小节末尾后归零
    currentBeat = (currentBeat + 1) % beatsPerMeasure;
  }
}

// --- 视觉更新循环（requestAnimationFrame）---

// 每帧检查节拍队列，在正确时刻更新 UI（与音频时钟同步）
function visualLoop() {
  if (!isRunning) return;

  const now = audioCtx.currentTime;
  // 取出所有"该显示了"的节拍并更新界面
  while (beatQueue.length > 0 && beatQueue[0].time <= now) {
    const { beat } = beatQueue.shift();
    flashBeat(beat);
    swingPendulum(60.0 / bpm);
  }

  requestAnimationFrame(visualLoop);
}

// --- 开始 / 停止 ---

function start() {
  // 首次启动时创建音频上下文（浏览器要求用户交互后才能创建）
  if (!audioCtx) audioCtx = new AudioContext();
  // 某些浏览器在页面加载时会暂停音频上下文，需手动恢复
  if (audioCtx.state === 'suspended') audioCtx.resume();

  isRunning = true;
  currentBeat = 0;
  beatQueue.length = 0;  // 清空旧队列
  nextNoteTime = audioCtx.currentTime + 0.05;  // 稍微延迟，避免第一拍太仓促
  pendulumLeft = false;

  schedulerTimer = setInterval(scheduler, SCHEDULER_INTERVAL);
  requestAnimationFrame(visualLoop);

  startStopBtn.textContent = t('stop');
  startStopBtn.classList.add('running');
}

function stop() {
  isRunning = false;
  clearInterval(schedulerTimer);
  beatQueue.length = 0;

  // 清除所有圆点高亮和钟摆动画
  beatDotsEl.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('active', 'accent'));
  pendulum.classList.remove('swing-left', 'swing-right');

  startStopBtn.textContent = t('start');
  startStopBtn.classList.remove('running');
}

startStopBtn.addEventListener('click', () => {
  isRunning ? stop() : start();
});

// --- BPM 控制 ---

// 设置 BPM，限制在 40~240 范围内，并同步更新显示和滑块
function setBpm(val) {
  bpm = Math.min(240, Math.max(40, val));
  bpmValueEl.textContent = bpm;
  bpmSlider.value = bpm;
}

bpmDown.addEventListener('click', () => setBpm(bpm - 1));
bpmUp.addEventListener('click', () => setBpm(bpm + 1));
bpmSlider.addEventListener('input', () => setBpm(Number(bpmSlider.value)));

// 长按 +/- 按钮时持续调整 BPM：按住 400ms 后开始每 80ms 连续触发
function holdRepeat(btn, fn) {
  let timeout, interval;
  btn.addEventListener('mousedown', () => {
    fn();
    timeout = setTimeout(() => { interval = setInterval(fn, 80); }, 400);
  });
  const cancel = () => { clearTimeout(timeout); clearInterval(interval); };
  btn.addEventListener('mouseup', cancel);
  btn.addEventListener('mouseleave', cancel);
}
holdRepeat(bpmDown, () => setBpm(bpm - 1));
holdRepeat(bpmUp, () => setBpm(bpm + 1));

// --- 拍号切换 ---

const timeSigButtons = document.querySelectorAll('.btn-time');
timeSigButtons.forEach(btn => {
  btn.classList.remove('active');
  if (Number(btn.dataset.beats) === beatsPerMeasure) btn.classList.add('active');

  btn.addEventListener('click', () => {
    beatsPerMeasure = Number(btn.dataset.beats);
    timeSigButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentBeat = 0;
    renderBeatDots();
    // 如果正在播放，重启以应用新拍号
    if (isRunning) { stop(); start(); }
  });
});

// --- 点击节拍（Tap Tempo）---

const tapTimes = [];  // 记录每次点击的时间戳
tapBtn.addEventListener('click', () => {
  const now = performance.now();
  tapTimes.push(now);

  // 只保留最近 8 次且 3 秒内的点击
  while (tapTimes.length > 8) tapTimes.shift();
  const recent = tapTimes.filter(t => now - t < 3000);

  if (recent.length >= 2) {
    // 计算相邻点击间隔的平均值，转换为 BPM
    const intervals = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i] - recent[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setBpm(Math.round(60000 / avg));
  }
});

// --- 初始化 ---
renderBeatDots();
// 默认选中 4/4 拍
timeSigButtons.forEach(b => {
  b.classList.remove('active');
  if (Number(b.dataset.beats) === 4) b.classList.add('active');
});
