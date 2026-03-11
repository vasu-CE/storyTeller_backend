
/**
 * Adaptive commit chunker.
 *
 * Strategy:
 *  – Small repos  (<= 100 commits):  chunks of 10 commits
 *  – Medium repos (101-300 commits): chunks of 20 commits
 *  – Large repos  (> 300 commits):   group by calendar month (or quarter when
 *    the history spans more than 2 years) so each "phase" maps to a real time
 *    period rather than an arbitrary slice.
 */
export function chunkCommits(commits) {
  if (!commits || commits.length === 0) return [];

  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));

  if (sorted.length > 300) {
    return chunkByTimePeriod(sorted);
  }

  const chunkSize = sorted.length > 100 ? 20 : 10;
  return chunkByCount(sorted, chunkSize);
}
// Count-based chunking

function chunkByCount(commits, chunkSize) {
  const chunks = [];
  for (let i = 0; i < commits.length; i += chunkSize) {
    chunks.push(buildChunk(commits.slice(i, i + chunkSize)));
  }
  return chunks;
}

// Time-period-based chunking

function chunkByTimePeriod(commits) {
  const first = new Date(commits[0].date);
  const last  = new Date(commits[commits.length - 1].date);
  const totalMonths =
    (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth());

  // Use quarterly buckets for very long-running projects
  const useQuarterly = totalMonths > 24;
  const groups = new Map();

  for (const commit of commits) {
    const d = new Date(commit.date);
    const key = useQuarterly
      ? `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(commit);
  }

  const chunks = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, g]) => g.length > 0)
    .map(([, g]) => buildChunk(g));

  // Merge lone tiny chunks (< 3 commits) into their neighbour
  return mergeSmallChunks(chunks, 3);
}

// ---------------------------------------------------------------------------
// Chunk builder — attaches aggregate stats to each slice
// ---------------------------------------------------------------------------

function buildChunk(commits) {
  const startDate = new Date(commits[0].date);
  const endDate   = new Date(commits[commits.length - 1].date);

  const fileTypeStats = { frontend: 0, backend: 0, tests: 0, config: 0, docs: 0, infra: 0, database: 0, styles: 0 };
  const allSignals = new Set();

  for (const commit of commits) {
    if (commit.fileTypes) {
      for (const [type, count] of Object.entries(commit.fileTypes)) {
        fileTypeStats[type] = (fileTypeStats[type] || 0) + count;
      }
    }
    for (const signal of (commit.architecturalSignals || [])) {
      allSignals.add(signal);
    }
  }

  return {
    commits,
    startDate: startDate.toISOString(),
    endDate:   endDate.toISOString(),
    period:    formatPeriod(startDate, endDate),
    commitCount: commits.length,
    fileTypeStats,
    architecturalSignals: [...allSignals],
    totalInsertions: commits.reduce((s, c) => s + (c.insertions || 0), 0),
    totalDeletions:  commits.reduce((s, c) => s + (c.deletions  || 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Merge tiny trailing/leading chunks
// ---------------------------------------------------------------------------

function mergeSmallChunks(chunks, minSize) {
  if (chunks.length <= 1) return chunks;

  const result = [];
  let pending = null;

  for (const chunk of chunks) {
    if (chunk.commitCount < minSize) {
      pending = pending
        ? buildChunk([...pending.commits, ...chunk.commits])
        : chunk;
    } else {
      if (pending) {
        result.push(buildChunk([...pending.commits, ...chunk.commits]));
        pending = null;
      } else {
        result.push(chunk);
      }
    }
  }

  if (pending) result.push(pending);
  return result;
}

function formatPeriod(start, end) {
  const opts = { year: 'numeric', month: 'short' };
  const s = start.toLocaleDateString('en-US', opts);
  const e = end.toLocaleDateString('en-US', opts);
  return s === e ? s : `${s} – ${e}`;
}
