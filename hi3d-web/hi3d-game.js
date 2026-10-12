import { GemScene } from './hi3d-scene.js';
import { SIZE, TYPES, createBoard, findMatches, findMoves, adjacent, isSpecialSwap, planClear, collapse, shuffleBoard, adoptBoard, validateSave } from './hi3d-rules.mjs';
import { LEVEL_COUNT, levelDefinition, createFrost, updateObjectives, objectivesDone, objectiveProgress, starsForScore } from './hi3d-levels.mjs';
import { MAX_LIVES, recoverLives, loseLife, recoveryRemaining } from './hi3d-lives.mjs';

const element = id => document.getElementById(id);
const format = value => value.toLocaleString('zh-CN');
const TYPE_NAMES = ['绿松宝石', '蓝海宝石', '紫晶宝石', '粉色爱心', '琥珀宝石', '蜜桃宝石'];
const SAVE_KEY = 'hi3d-gem-garden-save-v1';
const BEST_KEY = 'hi3d-gem-garden-best-v1';
const SETTINGS_KEY = 'hi3d-gem-garden-settings-v1';
const PROGRESS_KEY = 'hi3d-gem-garden-levels-v2';
const LIVES_KEY = 'hi3d-gem-garden-lives-v3';
const SHORT_NAMES = ['绿松', '蓝海', '紫晶', '爱心', '琥珀', '蜜桃'];
const compactMedia = matchMedia('(max-width: 650px), (max-height: 600px) and (pointer: coarse)');
const state = { board: [], score: 0, best: 0, mode: 'challenge', moves: 22, level: 1, target: 2000, shuffles: 3, hammers: 3, hammerArmed: false, frost: Array(64).fill(0), objectives: [], started: false, paused: false, busy: false, selected: -1, ended: false, sound: false, softMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
let progress = { unlocked: 1, records: {} };
let lives;
let screen = 'home';
let scene;
let savedGame = null;
let toastTimer;
let hintTimer;
let comboTimer;
let dialogCallback = null;
let dialogPreviousFocus;
let dialogWasPaused = false;
let keyboardIndex = 0;
let pointerStart = null;
let audioContext = null;
let storageAvailable = true;

function readStorage(key) {
  if (window.__hi3dNativeSeed) {
    try { return JSON.parse(window.__hi3dNativeSeed[key]); }
    catch { return null; }
  }
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function store(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (window.__hi3dNativeSeed) {
      window.webkit.messageHandlers.hi3dStorage.postMessage({ action: 'set', key, value: serialized });
      window.__hi3dNativeSeed[key] = serialized;
    } else localStorage.setItem(key, serialized);
  }
  catch { storageAvailable = false; document.querySelector('.save-note').textContent = '浏览器未允许保存，本局仍可正常游玩'; element('home-save-note').textContent = '浏览器未允许保存；关闭后进度可能丢失'; }
}

function saveGame() {
  if (!state.started || state.ended) return;
  const data = { version: 2, board: state.board, score: state.score, mode: state.mode, moves: state.moves, level: state.level, target: state.target, shuffles: state.shuffles, hammers: state.hammers, frost: state.frost, objectives: state.objectives };
  if (validateSave(data)) { savedGame = structuredClone(data); store(SAVE_KEY, data); }
}

function clearSave() {
  try {
    if (window.__hi3dNativeSeed) {
      window.webkit.messageHandlers.hi3dStorage.postMessage({ action: 'remove', key: SAVE_KEY });
      delete window.__hi3dNativeSeed[SAVE_KEY];
    } else localStorage.removeItem(SAVE_KEY);
  }
  catch { storageAvailable = false; }
  savedGame = null;
}

function saveSettings() { store(SETTINGS_KEY, { sound: state.sound, softMotion: state.softMotion }); }

function toast(message, duration = 2600) {
  clearTimeout(toastTimer);
  element('toast').textContent = message;
  element('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => element('toast').classList.add('hidden'), duration);
}

function playTone(kind, chain = 1) {
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const notes = kind === 'clear' ? [523.25, 659.25, 783.99].map(note => note * Math.pow(1.05946, Math.min(chain - 1, 6) * 2)) : kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'invalid' ? [220, 196] : kind === 'select' ? [440] : [392, 523.25];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = now + index * .062;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.055, start + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + .20);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + .22);
    });
  } catch { state.sound = false; updateSound(); toast('这台浏览器暂时无法播放音效，继续安静地玩吧。'); }
}

function updateSound() {
  element('sound-button').querySelector('use').setAttribute('href', state.sound ? '#icon-sound' : '#icon-muted');
  element('sound-button').setAttribute('aria-label', state.sound ? '关闭音效' : '打开音效');
  element('sound-button').title = state.sound ? '关闭音效' : '打开音效';
  element('motion-label').textContent = state.softMotion ? '开' : '关';
  document.body.classList.toggle('soft-motion', state.softMotion);
}

function updateModeUI() {
  const level = levelDefinition(state.level);
  element('board-label').textContent = level.title;
  element('level-label').textContent = `第 ${state.level} 关`;
  element('goal-title').textContent = '本关收集目标';
  element('goal-copy').textContent = '先完成目标，连锁与剩余步数还能赢星星。';
  element('moves-row').classList.remove('hidden');
  element('mode-description').querySelector('strong').textContent = '收集、破冰，点亮星星';
  element('mode-description').querySelector('p').textContent = '15 个小关卡，随时接着玩。';
  element('hud-goal-title').textContent = '本关目标';
  element('hud-moves-label').textContent = '剩余步数';
  element('goal-numbers').classList.add('hidden');
  element('levels-button').setAttribute('aria-label', screen === 'home' ? '定位当前关卡' : '保存并回到首页');
  element('levels-button').title = screen === 'home' ? '关卡树' : '保存并回到首页';
  element('levels-button').disabled = state.busy;
}

function renderGoals(container, mobile) {
  const goals = state.objectives;
  const signature = goals.map(goal => `${goal.kind}:${goal.type}:${goal.target}:${goal.kind === 'score' ? state.score : goal.current}`).join('|');
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren();
  for (const goal of goals) {
    const current = goal.kind === 'score' ? state.score : goal.current;
    const done = current >= goal.target;
    const chip = document.createElement('div');
    chip.className = `goal-chip${done ? ' complete' : ''}`;
    chip.setAttribute('aria-label', `${goal.kind === 'ice' ? '清除冰层' : goal.kind === 'score' ? '分数' : SHORT_NAMES[goal.type]}，已完成 ${Math.min(current, goal.target)}，目标 ${goal.target}`);
    const icon = document.createElement('span');
    icon.className = goal.kind === 'collect' ? `goal-gem gem-${goal.type}` : `goal-symbol ${goal.kind}`;
    icon.textContent = goal.kind === 'collect' ? (goal.type === 3 ? '♥' : '◆') : goal.kind === 'ice' ? '❄' : '✦';
    const label = document.createElement('span');
    label.className = 'goal-chip-label';
    label.textContent = goal.kind === 'ice' ? '冰层' : goal.kind === 'score' ? '分数' : SHORT_NAMES[goal.type];
    const count = document.createElement('strong');
    count.textContent = done ? '✓' : goal.kind === 'score' ? `${format(current)}/${format(goal.target)}` : `${current}/${goal.target}`;
    chip.append(icon);
    if (!mobile || goal.kind !== 'score') chip.append(label);
    chip.append(count);
    container.appendChild(chip);
  }
}

function updateUI() {
  element('score-value').textContent = format(state.score);
  element('best-value').textContent = format(state.best);
  element('goal-current').textContent = format(Math.min(state.score, state.target));
  element('goal-target').textContent = format(state.target);
  element('moves-value').textContent = state.moves;
  const goalPercent = objectiveProgress(state.objectives, state.score) * 100;
  element('progress-fill').style.width = `${goalPercent}%`;
  element('goal-progress').setAttribute('aria-valuemax', 100);
  element('goal-progress').setAttribute('aria-valuenow', Math.round(goalPercent));
  element('hud-score').textContent = format(state.score);
  element('hud-moves').textContent = state.moves;
  document.querySelector('.move-counter').classList.toggle('low-moves', state.moves <= 5);
  renderGoals(element('hud-goals'), true);
  renderGoals(element('desktop-goals'), false);
  const stars = starsForScore(state.level, state.score);
  [...element('hud-stars').querySelectorAll('span')].forEach((star, index) => star.classList.toggle('lit', index < stars));
  element('hud-stars').setAttribute('aria-label', `当前 ${stars} 星`);
  element('hud-star-copy').textContent = stars >= 3 ? '三星闪耀！继续完成目标' : '完成目标过关，连锁赢更多星星';
  const disabled = screen === 'home' || !state.started || state.busy || state.paused || state.ended;
  element('hint-button').disabled = disabled;
  element('hammer-button').disabled = disabled || state.hammers === 0;
  element('hammer-button').setAttribute('aria-pressed', String(state.hammerArmed));
  element('hammer-button').classList.toggle('armed', state.hammerArmed);
  document.body.classList.toggle('hammer-active', state.hammerArmed);
  element('hammer-note').textContent = `剩余 ${state.hammers} 次`;
  element('shuffle-button').disabled = disabled || state.shuffles === 0;
  element('pause-button').disabled = !state.started || state.ended;
  element('restart-button').disabled = state.busy;
  element('levels-button').disabled = state.busy;
  element('shuffle-note').textContent = `剩余 ${state.shuffles} 次`;
  element('level-label').textContent = `第 ${state.level} 关`;
  element('game-canvas').setAttribute('aria-busy', String(state.busy));
  document.body.dataset.gameState = screen === 'home' ? 'home' : state.paused ? 'paused' : state.busy ? 'resolving' : 'playing';
  element('pause-button').querySelector('use').setAttribute('href', state.paused ? '#icon-play' : '#icon-pause');
  element('pause-button').setAttribute('aria-label', state.paused ? '继续游戏' : '暂停游戏');
  updateAccessibleBoard();
}

function updateAccessibleBoard() {
  const container = element('accessible-board');
  if (!container.children.length) {
    for (let index = 0; index < SIZE * SIZE; index++) {
      const button = document.createElement('button');
      button.setAttribute('role', 'gridcell');
      button.dataset.cell = index;
      button.addEventListener('click', () => selectCell(index));
      button.addEventListener('focus', () => { keyboardIndex = index; scene.hovered = index; });
      container.appendChild(button);
    }
  }
  [...container.children].forEach((button, index) => {
    const gem = state.board[index];
    const specialName = gem?.special ? ({ row: '横向条纹', col: '竖向条纹', burst: '爆炸', prism: '彩虹' })[gem.special] : '';
    button.textContent = gem?.special === 'prism' ? '✦' : String((gem?.type ?? 0) + 1);
    button.setAttribute('aria-label', `第 ${Math.floor(index / SIZE) + 1} 行，第 ${index % SIZE + 1} 列，${gem?.special === 'prism' ? '彩虹宝石' : TYPE_NAMES[gem?.type] || '宝石'}${specialName ? `，${specialName}` : ''}`);
    button.setAttribute('aria-selected', String(state.selected === index));
    button.disabled = !state.started || state.busy || state.paused || state.ended;
    button.tabIndex = index === keyboardIndex ? 0 : -1;
  });
}

function clearSelection() {
  state.selected = -1;
  scene.selected = -1;
  scene.hinted = [];
  clearTimeout(hintTimer);
}

function selectCell(index) {
  if (!state.started || state.busy || state.paused || state.ended || index < 0 || index >= state.board.length) return;
  if (state.hammerArmed) { useHammer(index).catch(showFatal); return; }
  scene.hinted = [];
  clearTimeout(hintTimer);
  keyboardIndex = index;
  if (state.selected === index) { clearSelection(); element('status-text').textContent = '不着急，慢慢找一颗喜欢的宝石'; }
  else if (state.selected >= 0 && adjacent(state.selected, index)) { swapGems(state.selected, index).catch(showFatal); return; }
  else {
    state.selected = index;
    scene.selected = index;
    playTone('select');
    element('status-text').textContent = '再选一颗上下左右相邻的宝石';
  }
  updateAccessibleBoard();
}

function floatingScore(index, points) {
  const node = document.createElement('span');
  node.className = 'floating-score';
  node.textContent = `+${format(points)}`;
  const position = scene.screenPosition(index);
  node.style.left = `${position.x}px`;
  node.style.top = `${position.y}px`;
  element('score-pop-container').appendChild(node);
  setTimeout(() => node.remove(), 1100);
}

function showCombo(chain) {
  clearTimeout(comboTimer);
  const popup = element('combo-pop');
  popup.classList.remove('hidden');
  popup.querySelector('strong').textContent = `连锁 ×${chain}`;
  popup.querySelector('span').textContent = ['好事连连', '灵感绽放', '今天运气真不错', '快乐停不下来'][Math.min(chain - 2, 3)];
  comboTimer = setTimeout(() => popup.classList.add('hidden'), 1600);
}

async function swapGems(first, second) {
  state.busy = true;
  clearSelection();
  updateUI();
  await scene.swap(state.board, first, second);
  [state.board[first], state.board[second]] = [state.board[second], state.board[first]];
  scene.board = state.board;
  let matches = findMatches(state.board);
  if (!matches.cells.size && !isSpecialSwap(state.board, first, second)) {
    playTone('invalid');
    element('status-text').textContent = '差一点点！试试让同色宝石排成一线';
    await scene.swap(state.board, first, second);
    [state.board[first], state.board[second]] = [state.board[second], state.board[first]];
    scene.board = state.board;
    state.busy = false;
    updateUI();
    return;
  }
  state.moves--;
  await resolveTurn(matches, [first, second]);
}

async function resolveTurn(matches, swap = null) {
  let chain = 1;
  let total = 0;
  while (matches.cells.size || (swap && isSpecialSwap(state.board, ...swap))) {
    const plan = planClear(state.board, matches, chain === 1 && swap ? [swap[1], swap[0]] : [], swap);
    if (!plan.removed.size) break;
    const points = plan.removed.size * 50 * chain + plan.activated.size * 100;
    total += points;
    state.score += points;
    const objectives = updateObjectives(state.objectives, state.board, plan.removed, state.frost);
    state.objectives = objectives.objectives;
    state.frost = objectives.frost;
    if (state.score > state.best) { state.best = state.score; store(BEST_KEY, state.best); }
    floatingScore([...plan.removed][Math.floor(plan.removed.size / 2)], points);
    if (chain > 1) showCombo(chain);
    playTone('clear', chain);
    element('status-text').textContent = `${chain > 1 ? `连锁 ${chain} 次 · ` : ''}收集 ${plan.removed.size} 颗宝石，+${format(points)} 分`;
    updateUI();
    await scene.clear(state.board, plan);
    scene.setFrost(state.frost);
    for (const index of plan.removed) state.board[index] = null;
    for (const [index, special] of plan.creations) {
      state.board[index] = { ...state.board[index], ...special };
      scene.removeGem(state.board[index].id);
      const group = scene.createGem(state.board[index]);
      const position = scene.position(index);
      group.position.set(position.x, position.y, position.z);
      if (special.special === 'prism') toast('拾到一颗彩虹！和任意宝石交换，消除同色宝石。', 3300);
      else if (special.special === 'burst') toast('T / L 形惊喜！这颗宝石会绽放整个九宫格。');
    }
    const dropped = collapse(state.board);
    state.board = dropped.board;
    await scene.drop(state.board, dropped.movements);
    matches = findMatches(state.board);
    swap = null;
    chain++;
    if (chain > 60) { state.board = shuffleBoard(state.board); await scene.shuffle(state.board); break; }
  }
  if (!findMoves(state.board).length) {
    element('status-text').textContent = '没有可交换的组合了，正在自动换个排列';
    state.board = shuffleBoard(state.board);
    await scene.shuffle(state.board);
    toast('花园换了个排列，分数和特殊宝石都还在。');
  }
  state.busy = false;
  element('status-text').textContent = `${chain > 2 ? `${chain - 1} 次连锁 · ` : ''}这一步收集了 ${format(total)} 分，慢慢享受吧`;
  updateUI();
  if (objectivesDone(state.objectives, state.score) || state.moves === 0) finishChallenge();
  else saveGame();
}

function prepareNewGame(levelNumber) {
  state.board = createBoard();
  state.mode = 'challenge';
  state.score = 0;
  state.level = Math.min(LEVEL_COUNT, Math.max(1, levelNumber));
  const level = levelDefinition(state.level);
  state.target = level.stars[0];
  state.moves = level.moves;
  state.objectives = level.goals;
  state.frost = createFrost(state.level);
  state.shuffles = 3;
  state.hammers = 3;
  state.hammerArmed = false;
}

function startGame({ fresh = false, forceLevel = null } = {}) {
  refreshLives();
  if (lives.count === 0 && !(savedGame && !fresh)) { showLives(); return; }
  clearSelection();
  clearTimeout(comboTimer);
  element('combo-pop').classList.add('hidden');
  if (!fresh && savedGame) {
    Object.assign(state, { ...savedGame, board: adoptBoard(savedGame.board) });
    savedGame = null;
    toast('上一局的小快乐，已经替你留好了。');
  } else {
    const number = forceLevel ?? progress.unlocked;
    if (!Number.isInteger(number) || number < 1 || number > progress.unlocked) return;
    prepareNewGame(number);
    clearSave();
  }
  state.started = true;
  state.ended = false;
  state.busy = false;
  state.paused = false;
  screen = 'game';
  element('home-screen').classList.add('hidden');
  element('game-screen').classList.remove('hidden');
  document.body.classList.remove('at-home');
  fitViewport();
  scene.resize();
  keyboardIndex = 0;
  scene.setBoard(state.board);
  scene.setFrost(state.frost);
  element('welcome-overlay').classList.add('hidden');
  element('pause-overlay').classList.add('hidden');
  element('status-text').textContent = '完成上方目标就能过关；冰层要在原格消除宝石';
  updateModeUI();
  updateUI();
  saveGame();
  element('game-canvas').focus({ preventScroll: true });
  playTone('select');
}

function setPaused(paused) {
  if (!state.started || state.ended) return;
  state.paused = paused;
  element('pause-overlay').classList.toggle('hidden', !paused);
  element('status-text').textContent = paused ? '歇一小会儿，宝石在等你' : '回来啦，继续慢慢收集';
  if (paused) { state.hammerArmed = false; clearSelection(); if (!state.busy) saveGame(); }
  else element('game-canvas').focus({ preventScroll: true });
  updateUI();
}

function openDialog({ title, mark = '✧', content, actions, closeable = true }) {
  if (!element('dialog-backdrop').classList.contains('hidden')) closeDialog();
  dialogPreviousFocus = document.activeElement;
  dialogWasPaused = state.paused;
  state.paused = true;
  element('dialog-title').textContent = title;
  element('dialog-mark').textContent = mark;
  element('dialog-content').innerHTML = content;
  element('dialog-close').classList.toggle('hidden', !closeable);
  element('dialog-actions').replaceChildren();
  dialogCallback = closeable ? () => closeDialog() : null;
  for (const action of actions) {
    const button = document.createElement('button');
    button.className = action.primary ? 'primary-button' : 'secondary-button';
    button.textContent = action.label;
    button.id = action.id || '';
    button.addEventListener('click', () => { closeDialog(); action.run?.(); });
    element('dialog-actions').appendChild(button);
  }
  element('dialog-backdrop').classList.remove('hidden');
  element('dialog-actions').querySelector('button').focus({ preventScroll: true });
  updateUI();
}

function closeDialog() {
  element('dialog-backdrop').classList.add('hidden');
  state.paused = dialogWasPaused;
  dialogCallback = null;
  updateUI();
  dialogPreviousFocus?.focus({ preventScroll: true });
}

function finishChallenge() {
  if (state.ended) return;
  const won = objectivesDone(state.objectives, state.score);
  const bonus = won ? state.moves * 60 : 0;
  state.score += bonus;
  if (state.score > state.best) { state.best = state.score; store(BEST_KEY, state.best); }
  const stars = starsForScore(state.level, state.score, won);
  if (won) {
    const previous = progress.records[state.level] || { stars: 0, score: 0 };
    progress.records[state.level] = { stars: Math.max(previous.stars, stars), score: Math.max(previous.score, state.score) };
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVEL_COUNT, state.level + 1));
    store(PROGRESS_KEY, progress);
  }
  state.ended = true;
  state.paused = false;
  if (!won) { lives = loseLife(lives); store(LIVES_KEY, lives); }
  clearSave();
  goHome();
  if (won) playTone('win');
  openDialog({ title: won ? '小小挑战，大大满足。' : '这一次，也很不错。', mark: won ? '✦' : '☁', closeable: false,
    content: `<div class="result-stars">${[0, 1, 2].map(index => `<span class="${won && index < stars ? 'lit' : ''}">★</span>`).join('')}</div><p>${won ? `第 ${state.level} 关目标全部完成！<br>剩余 ${state.moves} 步，奖励 ${format(bonus)} 分。${state.level === LEVEL_COUNT ? '<br>整棵关卡树点亮啦，可以重玩挑战三星！' : '<br>下一关已经在树上等你。'}` : `步数用完啦，换个思路再试试。<br>消耗 1 颗 ♥，还剩 ${lives.count} 颗。`}</p><div class="result-score">${format(state.score)}<small>收集的快乐 / POINTS</small></div>`,
    actions: [{ label: '回到关卡树', id: 'result-home', primary: true, run: focusCurrentLevel }],
  });
}

function showHelp() {
  openDialog({ title: '收集、连锁，开心闯关。', content: '<ul class="help-list"><li><strong>过关：</strong>在步数内完成上方全部目标，不只追求分数。剩余步数每步奖励 60 分；完成目标至少获得一星。</li><li><strong>交换：</strong>点击相邻宝石，或向邻格滑动。至少三颗同色消除，无效交换不扣步。</li><li><strong>破冰：</strong>在冰层所在格消除宝石，破一层冰。双层冰要击中两次，冰不会随宝石掉落或洗牌移动。</li><li><strong>特殊宝石：</strong>四连产生直线特效，T / L 形产生九宫格爆炸，五连产生消除同色的彩虹。</li><li><strong>组合：</strong>双直线形成十字；爆炸＋直线清三行三列；双爆炸扩大到五乘五；彩虹＋特效让同色宝石一起释放特效；双彩虹清全屏。</li><li><strong>道具：</strong>提示不限次；小木槌点一颗消除，不扣步；每关有三次小木槌和洗牌。无路可走时免费自动洗牌。</li></ul><p class="help-keyboard">右上奖杯保存并返回关卡树；星级、最高分和当前棋盘本地保存。失败消耗 1 颗 ♥，每 30 分钟恢复 1 颗。<br>键盘：方向键移动 · Enter 选中 · H 提示 · P 暂停</p><button class="help-motion" id="help-motion">轻柔动效：' + (state.softMotion ? '开' : '关') + '</button>', actions: [{ label: '懂啦，开始收集', id: 'help-done', primary: true }] });
  element('help-motion').addEventListener('click', () => {
    state.softMotion = !state.softMotion;
    updateSound(); saveSettings();
    element('help-motion').textContent = `轻柔动效：${state.softMotion ? '开' : '关'}`;
  });
  const record = document.createElement('p');
  record.className = 'help-record';
  record.textContent = `本机最高分 ${format(state.best)} · 已解锁 ${progress.unlocked} / ${LEVEL_COUNT} 关`;
  element('help-motion').before(record);
}

function refreshLives() {
  const recovered = recoverLives(lives);
  if (!lives || recovered.count !== lives.count || (recovered.count < MAX_LIVES && recovered.anchor !== lives.anchor)) store(LIVES_KEY, recovered);
  lives = recovered;
  element('lives-count').textContent = lives.count;
  const seconds = Math.ceil(recoveryRemaining(lives) / 1000);
  element('lives-timer').textContent = seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '已满';
  element('lives-button').setAttribute('aria-label', `${lives.count} / ${MAX_LIVES} 颗生命，${seconds ? '恢复倒计时 ' + element('lives-timer').textContent : '已满'}`);
  if (screen === 'home') {
    element('home-play').disabled = lives.count === 0 && !savedGame;
    element('home-play').innerHTML = `${savedGame ? `继续第 ${savedGame.level} 关` : lives.count === 0 ? '生命恢复后再出发' : `开始第 ${progress.unlocked} 关`} <svg><use href="#icon-arrow"/></svg>`;
  }
}

function showLives() {
  refreshLives();
  openDialog({ title: lives.count ? '满满的心，慢慢闯。' : '让爱心歇一会儿。', mark: '♥', content: `<div class="lives-display">${Array.from({ length: MAX_LIVES }, (_, i) => `<span class="${i < lives.count ? 'filled' : ''}">♥</span>`).join('')}</div><p>失败或放弃重开会消耗 1 颗生命。<br>过关不扣生命；中途回首页可以保存继续。<br>每 30 分钟恢复 1 颗，上限 5 颗，关闭游戏也会恢复。${lives.count < MAX_LIVES ? `<br>下一颗恢复倒计时：${element('lives-timer').textContent}` : ''}</p>`, actions: [{ label: '知道啦', id: 'lives-done', primary: true }] });
}

function focusCurrentLevel() {
  const number = savedGame?.level || progress.unlocked;
  const node = element('level-tree').querySelector(`[data-level="${number}"]`);
  if (!node) return;
  const scroll = element('tree-scroll');
  scroll.scrollTop = node.offsetTop - scroll.clientHeight * .60;
}

function renderHome() {
  const xPositions = [50, 28, 65, 76, 44, 24, 56, 77, 45, 25, 66, 76, 43, 25, 50];
  const height = 1580;
  const points = xPositions.map((x, i) => [x * 3.8, height - 110 - i * 98]);
  let path = `M 190 ${height}`;
  let prev = [190, height];
  for (const [x, y] of points) { path += ` C ${prev[0]} ${prev[1] - 48}, ${x} ${y + 48}, ${x} ${y}`; prev = [x, y]; }
  const leaves = points.map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? 45 : -45)}" cy="${y - 37}" rx="28" ry="11" transform="rotate(${i % 2 ? -32 : 32} ${x + (i % 2 ? 45 : -45)} ${y - 37})" fill="${i % 3 ? '#a9c7a4' : '#b9d3b1'}" opacity=".75"/>`).join('');
  element('level-tree').innerHTML = `<svg class="tree-art" viewBox="0 0 380 ${height}" preserveAspectRatio="none" aria-hidden="true">${leaves}<path d="${path}" fill="none" stroke="#d4ddc1" stroke-width="22"/><path d="${path}" fill="none" stroke="#f4f7e9" stroke-width="12"/><path d="${path}" fill="none" stroke="#c2ceb1" stroke-width="2" stroke-dasharray="2 12"/></svg><span class="tree-crown" aria-hidden="true">✦</span><span class="tree-root">每一颗星，都是一点小快乐</span>`;
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const record = progress.records[n];
    const locked = n > progress.unlocked;
    const button = document.createElement('button');
    button.className = `tree-node${locked ? ' locked' : record ? ' cleared' : ''}${n === (savedGame?.level || progress.unlocked) ? ' current' : ''}`;
    button.dataset.level = n;
    button.style.left = `${xPositions[n - 1]}%`;
    button.style.top = `${points[n - 1][1] - 31}px`;
    button.disabled = locked;
    button.setAttribute('aria-label', `第 ${n} 关，${levelDefinition(n).title}，${locked ? '通关前一关解锁' : `已得 ${record?.stars || 0} 星`}`);
    button.innerHTML = `<span class="node-number">${locked ? '♧' : n}</span><span class="node-stars${record ? ' earned' : ''}">${locked ? '待解锁' : '★'.repeat(record?.stars || 0) + '☆'.repeat(3 - (record?.stars || 0))}</span><small>${levelDefinition(n).title}</small>${n === (savedGame?.level || progress.unlocked) ? '<i>你在这里</i>' : ''}`;
    button.addEventListener('click', () => previewLevel(n));
    element('level-tree').appendChild(button);
  }
  const complete = Object.keys(progress.records).length;
  const stars = Object.values(progress.records).reduce((sum, record) => sum + record.stars, 0);
  element('journey-progress').textContent = `${complete} / ${LEVEL_COUNT} 关 · ${stars} ★`;
  element('home-caption').textContent = savedGame ? `第 ${savedGame.level} 关棋盘已保留，接着玩吧` : complete === LEVEL_COUNT ? '全关卡点亮！再收集一些三星吧' : complete ? '新的枝头，等你点亮下一颗星' : '从第一颗星星开始 · 上滑探索关卡';
  refreshLives();
}

function goHome() {
  if (state.busy) return;
  if (!state.ended) saveGame();
  state.paused = true;
  state.hammerArmed = false;
  clearSelection();
  screen = 'home';
  element('game-screen').classList.add('hidden');
  element('home-screen').classList.remove('hidden');
  document.body.classList.add('at-home');
  renderHome(); updateModeUI(); updateUI();
  requestAnimationFrame(focusCurrentLevel);
}

function previewLevel(number) {
  if (number > progress.unlocked) return;
  if (savedGame?.level === number) { startGame(); return; }
  refreshLives();
  if (!lives.count) { showLives(); return; }
  const level = levelDefinition(number);
  const goals = level.goals.map(goal => `${goal.kind === 'ice' ? '❄ 清除冰层' : goal.kind === 'score' ? '✦ 收集分数' : `◆ 收集${SHORT_NAMES[goal.type]}`} ${format(goal.target)}`).join('<br>');
  openDialog({ title: `第 ${number} 关 · ${level.title}`, mark: '♧', content: `<p>${level.moves} 步内完成目标</p><div class="level-preview-goals">${goals}</div><p>小木槌 3 次 · 洗牌 3 次 · 提示不限次数${savedGame ? '<br>开启此关将放弃已保存的一局，消耗 1 颗 ♥。' : ''}</p>`, actions: [{ label: '再看看' }, { label: '开始闯关', id: 'level-start', primary: true, run: () => {
    if (savedGame) { lives = loseLife(lives); store(LIVES_KEY, lives); clearSave(); state.ended = true; }
    startGame({ fresh: true, forceLevel: number });
  } }] });
}

function requestRestart() {
  if (state.busy) return;
  openDialog({ title: '这一局先歇歇？', content: '<p>放弃本局会消耗 1 颗 ♥，回到关卡树。<br>星级和已解锁关卡都会保留。<br>如果只是暂时休息，可以点顶部奖杯保存回首页。</p>', actions: [{ label: '继续这一局', id: 'restart-cancel' }, { label: '放弃并回首页', id: 'restart-confirm', primary: true, run: () => {
    if (state.ended) return;
    state.ended = true; lives = loseLife(lives); store(LIVES_KEY, lives); clearSave(); goHome();
  } }] });
}

function hint() {
  if (element('hint-button').disabled) return;
  const moves = findMoves(state.board);
  if (!moves.length) return;
  clearSelection();
  state.hammerArmed = false;
  updateUI();
  const special = moves.find(move => isSpecialSwap(state.board, ...move));
  scene.hinted = special || moves[Math.floor(Math.random() * moves.length)];
  element('status-text').textContent = '发光的两颗宝石，试着交换一下 ✧';
  playTone('select');
  hintTimer = setTimeout(() => { scene.hinted = []; }, 5500);
  updateAccessibleBoard();
}

async function shuffle() {
  if (element('shuffle-button').disabled) return;
  clearSelection();
  state.hammerArmed = false;
  state.busy = true;
  state.shuffles--;
  updateUI();
  state.board = shuffleBoard(state.board);
  await scene.shuffle(state.board);
  state.busy = false;
  element('status-text').textContent = '换个排列，也换个心情，分数还在';
  playTone('shuffle');
  updateUI(); saveGame();
}

function armHammer() {
  if (element('hammer-button').disabled) return;
  clearSelection();
  state.hammerArmed = !state.hammerArmed;
  element('status-text').textContent = state.hammerArmed ? '点一颗宝石，小木槌帮你消除，不消耗步数' : '小木槌收好啦，继续交换宝石';
  updateUI();
}

async function useHammer(index) {
  state.hammerArmed = false;
  state.busy = true;
  clearSelection();
  state.hammers--;
  updateUI();
  await resolveTurn({ cells: new Set([index]), segments: [], groups: [] });
}

function showFatal(error) {
  state.busy = false;
  state.paused = true;
  screen = 'game';
  element('home-screen').classList.add('hidden');
  element('game-screen').classList.remove('hidden');
  element('loading-cover').classList.add('hidden');
  element('fatal-error').classList.remove('hidden');
  element('error-copy').textContent = error?.message?.includes('WebGL') ? '浏览器没有可用的 WebGL。请开启浏览器硬件加速，或换用支持 WebGL 的浏览器后重试。' : '棋盘加载遇到了问题。已保存的上一局仍会保留，可以重新加载继续尝试。';
  document.body.dataset.gameState = 'error';
  console.error(error);
}

function bindEvents() {
  element('start-button').addEventListener('click', () => startGame());
  element('home-play').addEventListener('click', () => savedGame ? startGame() : previewLevel(progress.unlocked));
  element('lives-button').addEventListener('click', showLives);
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); if (!state.busy) goHome(); });
  element('hint-button').addEventListener('click', hint);
  element('hammer-button').addEventListener('click', armHammer);
  element('levels-button').addEventListener('click', () => screen === 'home' ? focusCurrentLevel() : goHome());
  element('shuffle-button').addEventListener('click', () => shuffle().catch(showFatal));
  element('restart-button').addEventListener('click', () => {
    if (!state.started) { savedGame = null; startGame({ fresh: true }); }
    else requestRestart();
  });
  element('pause-button').addEventListener('click', () => setPaused(!state.paused));
  element('resume-button').addEventListener('click', () => setPaused(false));
  element('help-button').addEventListener('click', showHelp);
  element('sound-button').addEventListener('click', () => { state.sound = !state.sound; updateSound(); saveSettings(); if (state.sound) playTone('select'); });
  element('reduce-motion-button').addEventListener('click', () => { state.softMotion = !state.softMotion; updateSound(); saveSettings(); toast(state.softMotion ? '动效轻一些，快乐一样多。' : '已恢复完整宝石动效。'); });
  element('reload-button').addEventListener('click', () => location.reload());
  element('dialog-close').addEventListener('click', () => dialogCallback?.());
  element('dialog-backdrop').addEventListener('click', event => { if (event.target === element('dialog-backdrop')) dialogCallback?.(); });
  const canvas = element('game-canvas');
  canvas.addEventListener('pointerdown', event => {
    if (!state.started || state.busy || state.paused || state.ended) return;
    const index = scene.pick(event.clientX, event.clientY);
    pointerStart = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointermove', event => {
    if (state.busy || state.paused) return;
    scene.hovered = scene.pick(event.clientX, event.clientY);
    canvas.style.cursor = scene.hovered >= 0 && state.started ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { scene.hovered = -1; });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
    const { index, x, y } = pointerStart;
    pointerStart = null;
    if (state.busy || state.paused || index < 0) return;
    if (state.hammerArmed) { selectCell(index); return; }
    const deltaX = event.clientX - x;
    const deltaY = event.clientY - y;
    if (Math.hypot(deltaX, deltaY) > 19) {
      const offset = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX > 0 ? 1 : -1 : deltaY > 0 ? SIZE : -SIZE;
      const target = index + offset;
      if (target >= 0 && target < state.board.length && adjacent(index, target)) swapGems(index, target).catch(showFatal);
    } else selectCell(index);
  });
  document.addEventListener('keydown', event => {
    if (!element('dialog-backdrop').classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); dialogCallback?.(); }
      if (event.key === 'Tab') {
        const focusable = [...element('dialog-backdrop').querySelectorAll('button')].filter(button => !button.classList.contains('hidden'));
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (screen === 'home' || !state.started || state.ended) return;
    if (event.key.toLowerCase() === 'p') { event.preventDefault(); setPaused(!state.paused); return; }
    if (state.paused || state.busy) return;
    if (event.key.toLowerCase() === 'h') { event.preventDefault(); hint(); return; }
    if (event.key === 'Escape') { state.hammerArmed = false; clearSelection(); updateUI(); return; }
    if (document.activeElement !== canvas && !element('accessible-board').contains(document.activeElement)) return;
    const arrows = { ArrowUp: -SIZE, ArrowDown: SIZE, ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in arrows) {
      event.preventDefault();
      const target = keyboardIndex + arrows[event.key];
      if (target >= 0 && target < state.board.length && adjacent(keyboardIndex, target)) {
        keyboardIndex = target;
        scene.hovered = target;
        if (element('accessible-board').contains(document.activeElement)) { updateAccessibleBoard(); element('accessible-board').children[target].focus(); }
        else { updateAccessibleBoard(); element('status-text').textContent = `第 ${Math.floor(target / SIZE) + 1} 行，第 ${target % SIZE + 1} 列，${state.board[target].special === 'prism' ? '彩虹宝石' : TYPE_NAMES[state.board[target].type]}；回车选中`; }
      }
    }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCell(keyboardIndex); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLives(); if (document.hidden && screen === 'game' && state.started && !state.ended && element('dialog-backdrop').classList.contains('hidden')) setPaused(true); });
  window.addEventListener('pagehide', () => { if (!state.busy) saveGame(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); showFatal(new Error('WebGL context lost')); });
}

function fitViewport() {
  const height = Math.round(window.visualViewport?.height || window.innerHeight);
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  const stage = element('board-stage');
  if (compactMedia.matches && screen === 'game') {
    const rect = element('board-viewport').getBoundingClientRect();
    const edge = Math.max(100, Math.floor(Math.min(rect.width, rect.height)));
    stage.style.width = `${edge}px`;
    stage.style.height = `${edge}px`;
  } else {
    stage.style.width = '';
    stage.style.height = '';
  }
}

function initialize() {
  const best = readStorage(BEST_KEY);
  state.best = Number.isSafeInteger(best) && best >= 0 ? best : 0;
  const settings = readStorage(SETTINGS_KEY);
  if (settings && typeof settings.sound === 'boolean') state.sound = settings.sound;
  if (settings && typeof settings.softMotion === 'boolean') state.softMotion = settings.softMotion;
  const previous = readStorage(SAVE_KEY);
  const record = readStorage(PROGRESS_KEY);
  if (record && Number.isInteger(record.unlocked) && record.unlocked >= 1 && record.unlocked <= LEVEL_COUNT && record.records && typeof record.records === 'object') {
    progress.unlocked = record.unlocked;
    for (const [level, entry] of Object.entries(record.records)) {
      if (Number.isInteger(Number(level)) && Number(level) >= 1 && Number(level) <= LEVEL_COUNT && Number.isInteger(entry?.stars) && entry.stars >= 1 && entry.stars <= 3 && Number.isSafeInteger(entry.score) && entry.score >= 0) progress.records[level] = { stars: entry.stars, score: entry.score };
    }
  }
  lives = recoverLives(readStorage(LIVES_KEY));
  store(LIVES_KEY, lives);
  if (validateSave(previous) && previous.mode === 'challenge') {
    savedGame = previous.version === 1 ? { ...previous, version: 2, level: Math.min(LEVEL_COUNT, previous.level), frost: Array(64).fill(0), hammers: 3, objectives: previous.mode === 'challenge' ? [{ kind: 'score', target: previous.target, current: Math.min(previous.score, previous.target) }] : [] } : previous;
    Object.assign(state, { ...savedGame, board: adoptBoard(savedGame.board) });
    if (state.mode === 'challenge') progress.unlocked = Math.max(progress.unlocked, state.level);
    state.best = Math.max(state.best, state.score);
    element('start-button').innerHTML = '继续上次 <svg><use href="#icon-arrow"/></svg>';
  } else {
    if (validateSave(previous) && previous.mode === 'relax') {
      // Keep legacy results even though the retired mode is no longer playable.
      store('hi3d-gem-garden-retired-relax-v3', previous);
      state.best = Math.max(state.best, previous.score);
      store(BEST_KEY, state.best);
    }
    prepareNewGame(progress.unlocked);
  }
  fitViewport();
  scene = new GemScene(element('game-canvas'), { paused: () => state.paused, visible: () => screen === 'game' && !document.hidden, reducedMotion: () => state.softMotion, compact: () => compactMedia.matches });
  scene.setBoard(state.board);
  scene.setFrost(state.frost);
  updateModeUI(); updateSound(); updateUI();
  bindEvents();
  const viewportObserver = new ResizeObserver(fitViewport);
  viewportObserver.observe(element('board-viewport'));
  window.addEventListener('resize', fitViewport);
  window.visualViewport?.addEventListener('resize', fitViewport);
  compactMedia.addEventListener('change', () => { fitViewport(); scene.resize(); });
  element('loading-cover').classList.add('hidden');
  element('welcome-overlay').classList.add('hidden');
  goHome();
  setInterval(refreshLives, 1000);
  window.addEventListener('error', event => { if (event.message && !event.message.includes('ResizeObserver')) showFatal(event.error || new Error(event.message)); });
  window.addEventListener('unhandledrejection', event => showFatal(event.reason));
}

try { initialize(); } catch (error) { showFatal(error); element('reload-button').addEventListener('click', () => location.reload()); }
