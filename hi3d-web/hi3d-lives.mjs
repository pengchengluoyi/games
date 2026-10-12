export const MAX_LIVES = 5;
export const RECOVERY_MS = 30 * 60 * 1000;

// All time is local, in milliseconds. This module has no storage or network effects.
export function recoverLives(record, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('Invalid time');
  if (!record || record.version !== 1 || !Number.isInteger(record.count) || record.count < 0 || record.count > MAX_LIVES || !Number.isSafeInteger(record.anchor) || record.anchor < 0) return { version: 1, count: MAX_LIVES, anchor: now };
  if (record.count === MAX_LIVES) return { version: 1, count: MAX_LIVES, anchor: now };
  const anchor = Math.min(record.anchor, now);
  const gained = Math.floor((now - anchor) / RECOVERY_MS);
  const count = Math.min(MAX_LIVES, record.count + gained);
  return { version: 1, count, anchor: count === MAX_LIVES ? now : anchor + gained * RECOVERY_MS };
}

export function loseLife(record, now = Date.now()) {
  const current = recoverLives(record, now);
  return { ...current, count: Math.max(0, current.count - 1), anchor: current.count === MAX_LIVES ? now : current.anchor };
}

export function recoveryRemaining(record, now = Date.now()) {
  const current = recoverLives(record, now);
  return current.count === MAX_LIVES ? 0 : Math.max(0, RECOVERY_MS - (now - current.anchor));
}
