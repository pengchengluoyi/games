const COLLECTION = (type, target) => ({ kind: 'collect', type, target, current: 0 });
const ICE = target => ({ kind: 'ice', target, current: 0 });

const LEVELS = [
  { title: '初遇花园', moves: 22, goals: [COLLECTION(0, 8), COLLECTION(3, 8)], ice: 0 },
  { title: '蓝色心情', moves: 24, goals: [COLLECTION(1, 10), COLLECTION(4, 10)], ice: 0 },
  { title: '紫晶小径', moves: 25, goals: [COLLECTION(2, 12), COLLECTION(5, 12)], ice: 0 },
  { title: '薄霜清晨', moves: 26, goals: [ICE(12)], ice: 12 },
  { title: '春日融冰', moves: 28, goals: [COLLECTION(0, 12), COLLECTION(3, 12), ICE(8)], ice: 8 },
  { title: '三色花语', moves: 28, goals: [COLLECTION(1, 10), COLLECTION(2, 10), COLLECTION(4, 10)], ice: 0 },
  { title: '双层霜花', moves: 28, goals: [ICE(16)], ice: 8, double: 8 },
  { title: '心动雪地', moves: 29, goals: [COLLECTION(3, 15), ICE(12)], ice: 12 },
  { title: '琥珀午后', moves: 30, goals: [COLLECTION(0, 18), COLLECTION(4, 18)], ice: 0 },
  { title: '冰晶回廊', moves: 32, goals: [ICE(28)], ice: 20, double: 8 },
  { title: '蜜桃派对', moves: 32, goals: [COLLECTION(1, 15), COLLECTION(3, 15), COLLECTION(5, 15)], ice: 0 },
  { title: '霜色交响', moves: 32, goals: [COLLECTION(2, 12), COLLECTION(4, 12), ICE(20)], ice: 16, double: 4 },
  { title: '缤纷花海', moves: 34, goals: [COLLECTION(0, 20), COLLECTION(5, 20), ICE(16)], ice: 12, double: 4 },
  { title: '融雪奇迹', moves: 34, goals: [ICE(40)], ice: 24, double: 16 },
  { title: '拾光盛典', moves: 36, goals: [COLLECTION(1, 18), COLLECTION(3, 18), ICE(24)], ice: 16, double: 8 },
];

export const LEVEL_COUNT = LEVELS.length;

export function levelDefinition(number) {
  const level = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, number - 1))];
  return { ...level, goals: level.goals.map(goal => ({ ...goal })), stars: [1200 + number * 150, 2300 + number * 250, 3500 + number * 350] };
}

export function createFrost(number) {
  const level = levelDefinition(number);
  const frost = Array(64).fill(0);
  const order = [27, 28, 35, 36, 19, 20, 43, 44, 26, 29, 34, 37, 18, 21, 42, 45, 10, 13, 50, 53, 17, 22, 41, 46, 9, 14, 49, 54, 25, 30, 33, 38];
  for (let offset = 0; offset < level.ice; offset++) frost[order[offset]] = offset < (level.double || 0) ? 2 : 1;
  return frost;
}

export function updateObjectives(objectives, board, removed, frost) {
  const nextFrost = frost.slice();
  let layers = 0;
  const colors = Array(6).fill(0);
  for (const index of removed) {
    const gem = board[index];
    if (gem?.type >= 0) colors[gem.type]++;
    if (nextFrost[index] > 0) { nextFrost[index]--; layers++; }
  }
  const goals = objectives.map(goal => ({ ...goal, current: Math.min(goal.target, goal.current + (goal.kind === 'collect' ? colors[goal.type] : goal.kind === 'ice' ? layers : 0)) }));
  return { objectives: goals, frost: nextFrost, layers };
}

export function objectivesDone(objectives, score) {
  return objectives.length > 0 && objectives.every(goal => (goal.kind === 'score' ? score : goal.current) >= goal.target);
}

export function objectiveProgress(objectives, score) {
  if (!objectives.length) return 0;
  return objectives.reduce((total, goal) => total + Math.min(1, (goal.kind === 'score' ? score : goal.current) / goal.target), 0) / objectives.length;
}

export function starsForScore(level, score, completed = false) {
  const stars = levelDefinition(level).stars.filter(target => score >= target).length;
  return completed ? Math.max(1, stars) : stars;
}
