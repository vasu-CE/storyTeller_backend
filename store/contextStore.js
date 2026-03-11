const store = new Map();
const ttlTimers = new Map();

const TTL_MS = 2 * 60 * 60 * 1000;

function clearSessionTimer(sessionId) {
  const existingTimer = ttlTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    ttlTimers.delete(sessionId);
  }
}

export function saveContext(sessionId, analysisResult) {
  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  clearSessionTimer(sessionId);
  store.set(sessionId, {
    analysisResult,
    createdAt: Date.now()
  });

  const timeout = setTimeout(() => {
    store.delete(sessionId);
    ttlTimers.delete(sessionId);
  }, TTL_MS);

  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }

  ttlTimers.set(sessionId, timeout);
}

export function getContext(sessionId) {
  const entry = store.get(sessionId);

  if (!entry) {
    console.warn(`contextStore: Unknown sessionId requested: ${sessionId}`);
    return null;
  }

  return entry.analysisResult || null;
}

export function deleteContext(sessionId) {
  clearSessionTimer(sessionId);
  return store.delete(sessionId);
}
