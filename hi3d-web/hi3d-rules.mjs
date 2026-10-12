export const SIZE = 8;
export const TYPES = 6;
let nextId = 1;

export function makeGem(type, special = null) {
  return { id: nextId++, type, special };
}

export function cloneBoard(board) {
  return board.map(gem => gem ? { ...gem } : null);
}

export function adoptBoard(board) {
  nextId = Math.max(nextId, ...board.filter(Boolean).map(gem => gem.id + 1));
  return cloneBoard(board);
}

export function adjacent(first, second) {
  return Math.abs(Math.floor(first / SIZE) - Math.floor(second / SIZE)) + Math.abs(first % SIZE - second % SIZE) === 1;
}

export function findMatches(board) {
  const segments = [];
  for (const direction of ['row', 'col']) {
    for (let line = 0; line < SIZE; line++) {
      let run = [];
      let previousType = -2;
      for (let offset = 0; offset <= SIZE; offset++) {
        const index = direction === 'row' ? line * SIZE + offset : offset * SIZE + line;
        const gem = offset < SIZE ? board[index] : null;
        const type = gem && gem.special !== 'prism' ? gem.type : -1;
        if (type < 0 || type !== previousType) {
          if (run.length >= 3) segments.push({ indices: run, direction, type: previousType });
          run = [];
        }
        if (type >= 0) run.push(index);
        previousType = type;
      }
    }
  }
  const groups = [];
  for (const segment of segments) {
    const overlapping = groups.filter(group => segment.indices.some(index => group.indices.has(index)));
    if (!overlapping.length) groups.push({ indices: new Set(segment.indices), segments: [segment] });
    else {
      const merged = overlapping[0];
      segment.indices.forEach(index => merged.indices.add(index));
      merged.segments.push(segment);
      for (const other of overlapping.slice(1)) {
        other.indices.forEach(index => merged.indices.add(index));
        merged.segments.push(...other.segments);
        groups.splice(groups.indexOf(other), 1);
      }
    }
  }
  return { segments, groups, cells: new Set(segments.flatMap(segment => segment.indices)) };
}

export function isSpecialSwap(board, first, second) {
  return board[first]?.special === 'prism' || board[second]?.special === 'prism' || Boolean(board[first]?.special && board[second]?.special);
}

export function findMoves(board) {
  const moves = [];
  for (let index = 0; index < board.length; index++) {
    const neighbors = [];
    if (index % SIZE < SIZE - 1) neighbors.push(index + 1);
    if (Math.floor(index / SIZE) < SIZE - 1) neighbors.push(index + SIZE);
    for (const neighbor of neighbors) {
      if (!board[index] || !board[neighbor]) continue;
      if (isSpecialSwap(board, index, neighbor)) {
        moves.push([index, neighbor]);
        continue;
      }
      const copy = board.slice();
      [copy[index], copy[neighbor]] = [copy[neighbor], copy[index]];
      const matched = findMatches(copy).cells;
      if (matched.has(index) || matched.has(neighbor)) moves.push([index, neighbor]);
    }
  }
  return moves;
}

export function createBoard(random = Math.random) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const board = [];
    for (let index = 0; index < SIZE * SIZE; index++) {
      const candidates = Array.from({ length: TYPES }, (_, type) => type).filter(type => {
        if (index % SIZE >= 2 && board[index - 1].type === type && board[index - 2].type === type) return false;
        if (index >= SIZE * 2 && board[index - SIZE].type === type && board[index - SIZE * 2].type === type) return false;
        return true;
      });
      board.push(makeGem(candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]));
    }
    if (findMoves(board).length) return board;
  }
  throw new Error('无法生成可用棋盘');
}

export function shuffleBoard(board, random = Math.random) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const copy = cloneBoard(board);
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.min(index, Math.floor(random() * (index + 1)));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    if (!findMatches(copy).cells.size && findMoves(copy).length) return copy;
  }
  const fresh = createBoard(random);
  const positions = Array.from({ length: fresh.length }, (_, index) => index);
  for (const special of board.filter(gem => gem?.special)) {
    const index = positions.splice(Math.floor(random() * positions.length), 1)[0];
    fresh[index].special = special.special;
    if (special.special === 'prism') fresh[index].type = -1;
  }
  return fresh;
}

export function planClear(board, matches, preferred = [], swap = null) {
  let effectBoard = board;
  const removed = new Set(matches.cells);
  const creations = new Map();
  const activated = new Set();
  if (swap && isSpecialSwap(board, ...swap)) {
    const [first, second] = swap;
    if (board[first].special === 'prism' && board[second].special === 'prism') {
      board.forEach((gem, index) => { if (gem) removed.add(index); });
    } else if (board[first].special === 'prism' || board[second].special === 'prism') {
      const prismIndex = board[first].special === 'prism' ? first : second;
      const otherIndex = prismIndex === first ? second : first;
      if (board[otherIndex].special) {
        effectBoard = board.map((gem, index) => gem?.type === board[otherIndex].type ? { ...gem, special: board[otherIndex].special === 'burst' ? 'burst' : index % 2 ? 'row' : 'col' } : gem);
      }
      board.forEach((gem, index) => { if (gem?.type === board[otherIndex].type) removed.add(index); });
      removed.add(first);
      removed.add(second);
      activated.add(prismIndex);
    } else {
      removed.add(first);
      removed.add(second);
      const row = Math.floor(first / SIZE);
      const column = first % SIZE;
      const specials = [board[first].special, board[second].special];
      if (specials.every(special => special === 'burst')) {
        for (let targetRow = Math.max(0, row - 2); targetRow <= Math.min(SIZE - 1, row + 2); targetRow++) {
          for (let targetColumn = Math.max(0, column - 2); targetColumn <= Math.min(SIZE - 1, column + 2); targetColumn++) removed.add(targetRow * SIZE + targetColumn);
        }
      } else if (specials.includes('burst')) {
        for (let offset = -1; offset <= 1; offset++) {
          for (let line = 0; line < SIZE; line++) {
            if (row + offset >= 0 && row + offset < SIZE) removed.add((row + offset) * SIZE + line);
            if (column + offset >= 0 && column + offset < SIZE) removed.add(line * SIZE + column + offset);
          }
        }
      } else {
        for (let offset = 0; offset < SIZE; offset++) { removed.add(row * SIZE + offset); removed.add(offset * SIZE + column); }
      }
    }
  } else {
    for (const group of matches.groups) {
      const longest = group.segments.reduce((best, segment) => segment.indices.length > best.indices.length ? segment : best);
      const cross = group.segments.some(segment => segment.direction === 'row') && group.segments.some(segment => segment.direction === 'col');
      const special = longest.indices.length >= 5 ? 'prism' : cross ? 'burst' : longest.indices.length >= 4 ? longest.direction : null;
      if (!special) continue;
      const chosen = preferred.find(index => group.indices.has(index) && !board[index]?.special);
      const intersection = cross ? [...group.indices].find(index => group.segments.filter(segment => segment.indices.includes(index)).length > 1 && !board[index]?.special) : undefined;
      const anchor = chosen ?? intersection ?? [...group.indices].find(index => !board[index]?.special);
      if (anchor !== undefined) {
        creations.set(anchor, { type: special === 'prism' ? -1 : board[anchor].type, special });
        removed.delete(anchor);
      }
    }
  }
  const pending = [...removed];
  const add = index => {
    if (index < 0 || index >= board.length || !board[index] || removed.has(index)) return;
    removed.add(index);
    creations.delete(index);
    pending.push(index);
  };
  while (pending.length) {
    const index = pending.shift();
    const gem = effectBoard[index];
    if (!gem?.special || activated.has(index)) continue;
    activated.add(index);
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    if (gem.special === 'row') for (let offset = 0; offset < SIZE; offset++) add(row * SIZE + offset);
    if (gem.special === 'col') for (let offset = 0; offset < SIZE; offset++) add(offset * SIZE + column);
    if (gem.special === 'burst') {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
        for (let colOffset = -1; colOffset <= 1; colOffset++) {
          const targetRow = row + rowOffset;
          const targetColumn = column + colOffset;
          if (targetRow >= 0 && targetRow < SIZE && targetColumn >= 0 && targetColumn < SIZE) add(targetRow * SIZE + targetColumn);
        }
      }
    }
    if (gem.special === 'prism') {
      const counts = Array.from({ length: TYPES }, (_, type) => board.filter(cell => cell?.type === type).length);
      const color = counts.indexOf(Math.max(...counts));
      board.forEach((cell, cellIndex) => { if (cell?.type === color) add(cellIndex); });
    }
  }
  return { removed, creations, activated };
}

export function collapse(board, random = Math.random) {
  const result = Array(board.length).fill(null);
  const movements = [];
  for (let column = 0; column < SIZE; column++) {
    const survivors = [];
    for (let row = SIZE - 1; row >= 0; row--) {
      const index = row * SIZE + column;
      if (board[index]) survivors.push({ gem: board[index], from: index });
    }
    for (let row = SIZE - 1; row >= 0; row--) {
      const index = row * SIZE + column;
      const offset = SIZE - 1 - row;
      const survivor = survivors[offset];
      result[index] = survivor ? survivor.gem : makeGem(Math.min(TYPES - 1, Math.floor(random() * TYPES)));
      movements.push({ gem: result[index], from: survivor ? survivor.from : -(SIZE - survivors.length - row) * SIZE + column, to: index, fresh: !survivor });
    }
  }
  return { board: result, movements };
}

export function validateSave(data) {
  if (!data || ![1, 2].includes(data.version) || !['relax', 'challenge'].includes(data.mode) || !Array.isArray(data.board) || data.board.length !== SIZE * SIZE) return false;
  const ids = new Set();
  for (const gem of data.board) {
    if (!gem || !Number.isSafeInteger(gem.id) || gem.id < 1 || ids.has(gem.id)) return false;
    ids.add(gem.id);
    if (![null, 'row', 'col', 'burst', 'prism'].includes(gem.special) || !Number.isInteger(gem.type) || (gem.special === 'prism' ? gem.type !== -1 : gem.type < 0 || gem.type >= TYPES)) return false;
  }
  if (!Number.isSafeInteger(data.score) || data.score < 0 || !Number.isSafeInteger(data.moves) || data.moves < 0 || data.moves > 50 || !Number.isSafeInteger(data.level) || data.level < 1 || !Number.isSafeInteger(data.target) || data.target < 1 || !Number.isSafeInteger(data.shuffles) || data.shuffles < 0 || data.shuffles > 3) return false;
  if (data.version === 2) {
    if (!Array.isArray(data.frost) || data.frost.length !== SIZE * SIZE || data.frost.some(layer => !Number.isInteger(layer) || layer < 0 || layer > 2)) return false;
    if (!Number.isSafeInteger(data.hammers) || data.hammers < 0 || data.hammers > 3 || !Array.isArray(data.objectives) || data.objectives.length > 3) return false;
    if (data.mode === 'challenge' && (!data.objectives.length || data.level > 15)) return false;
    for (const goal of data.objectives) {
      if (!['collect', 'ice', 'score'].includes(goal.kind) || !Number.isSafeInteger(goal.target) || goal.target < 1 || !Number.isSafeInteger(goal.current) || goal.current < 0 || goal.current > goal.target) return false;
      if (goal.kind === 'collect' && (!Number.isInteger(goal.type) || goal.type < 0 || goal.type >= TYPES)) return false;
    }
  }
  return !findMatches(data.board).cells.size && findMoves(data.board).length > 0;
}
