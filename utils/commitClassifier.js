
// Priority-ordered classifiers — first match wins per commit.
const CLASSIFIERS = [
  {
    type: 'security',
    patterns: [
      /^security:|^sec:/i,
      /security.*(fix|patch|hardening)|cve-?\d+|xss|csrf|sql.inject|vulnerabilit|exploit/i,
    ],
  },
  {
    type: 'breaking',
    patterns: [
      /breaking.change|break.*api|remove.*endpoint|deprecat.*api|\[breaking\]/i,
      /^!feat:|^!fix:/,
    ],
  },
  {
    type: 'arch',
    patterns: [
      /^arch:|^architecture:/i,
      /\breadd\b|restructure|reorganize|rearchitect|overhaul|migration.to|move.to|switch.to|replac.*with/i,
    ],
  },
  {
    type: 'feat',
    patterns: [
      /^feat:|^feature:/i,
      /\badd\b|\bintroduc\b|\bimplement\b|\bnew\b.*(api|service|component|feature|module)\b/i,
    ],
  },
  {
    type: 'fix',
    patterns: [
      /^fix:|^bugfix:|^hotfix:|^bug:/i,
      /\bfix(?:ed|es|ing)?\b|\bpatch\b|\bresolv\b|\bhack\b|\bworkaround\b|\brevert\b/i,
    ],
  },
  {
    type: 'refactor',
    patterns: [
      /^refactor:/i,
      /\brefactor\b|\bcleanup\b|\bclean up\b|\bimprove\b.*\bcode\b|\bextract\b|\bsimplify\b/i,
    ],
  },
  {
    type: 'perf',
    patterns: [
      /^perf:|^performance:/i,
      /\boptimiz\b|\bspeed.?up\b|\bperformance\b|\bcach\b|\blatency\b|\bthroughput\b/i,
    ],
  },
  {
    type: 'deps',
    patterns: [
      /^deps:|^dep:|^chore\(deps\):|bump\s/i,
      /\bupgrade\b|\bupdat.*depend|\bupdate.*package(s)?\b/i,
    ],
  },
  {
    type: 'test',
    patterns: [
      /^test:|^tests:/i,
      /\btest\b|\bspec\b|\bcoverage\b|\bunit.?test\b|\be2e\b|\bintegration.?test\b/i,
    ],
  },
  {
    type: 'ci',
    patterns: [
      /^ci:|^build:|^cd:/i,
      /\bci\b|\bcd\b|\bpipeline\b|\bworkflow\b|\bdeploy\b|\brelease\b/i,
    ],
  },
  {
    type: 'docs',
    patterns: [
      /^docs:|^doc:/i,
      /\bdocument\b|\breadme\b|\bchangelog\b|\bcomment\b/i,
    ],
  },
  {
    type: 'chore',
    patterns: [
      /^chore:/i,
      /\bchore\b|\bmaintenance\b|\bupkeep\b|\bformat(?:ting)?\b|\blinting\b/i,
    ],
  },
  {
    type: 'style',
    patterns: [
      /^style:/i,
      /\bstyl\b|\bprettier\b|\beslint.*fix\b/i,
    ],
  },
];

export function classifyCommits(commits) {
  const classification = {
    feat: [], fix: [], refactor: [], perf: [], chore: [],
    test: [], ci: [], docs: [], arch: [], security: [],
    breaking: [], deps: [], style: [], other: [],
  };

  for (const commit of commits) {
    const message = commit.message || '';
    let classified = false;

    for (const { type, patterns } of CLASSIFIERS) {
      if (patterns.some(p => p.test(message))) {
        classification[type].push(commit);
        classified = true;
        break;
      }
    }

    if (!classified) {
      classification.other.push(commit);
    }
  }

  const stabilizationPeriods = detectStabilizationPeriods(commits);
  const architecturalChanges = detectArchitecturalChanges(commits);
  const velocityData = calculateCommitVelocity(commits);

  return {
    classification,
    summary: Object.fromEntries(
      Object.entries(classification).map(([type, list]) => [type, list.length])
    ),
    stabilizationPeriods,
    architecturalChanges,
    velocityData,
    total: commits.length,
  };
}

// ---------------------------------------------------------------------------
// Stabilization period detection
// ---------------------------------------------------------------------------

export function detectStabilizationPeriods(commits) {
  if (!commits || commits.length < 5) return [];

  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const windowSize = Math.max(5, Math.min(15, Math.floor(sorted.length / 5)));
  const periods = [];
  let inPeriod = false;
  let periodStart = null;

  for (let i = 0; i <= sorted.length - windowSize; i++) {
    const window = sorted.slice(i, i + windowSize);
    const fixCount = window.filter(c =>
      /fix|bug|hotfix|patch|resolv|revert|regression|crash|error/i.test(c.message || '')
    ).length;
    const ratio = fixCount / windowSize;

    if (ratio >= 0.4 && !inPeriod) {
      inPeriod = true;
      periodStart = window[0].date;
    } else if (ratio < 0.2 && inPeriod) {
      inPeriod = false;
      periods.push({
        start: periodStart,
        end: window[0].date,
        commitCount: window.length,
        description: 'Bug-fixing and stabilization period',
      });
      periodStart = null;
    }
  }

  if (inPeriod && periodStart) {
    periods.push({
      start: periodStart,
      end: sorted[sorted.length - 1].date,
      description: 'Ongoing stabilization phase',
    });
  }

  return periods;
}


export function detectArchitecturalChanges(commits) {
  if (!commits || commits.length === 0) return [];

  const archCommits = [];

  for (const commit of commits) {
    const signals = commit.architecturalSignals || [];
    const msg = (commit.message || '').toLowerCase();

    const isArch =
      signals.includes('large_scale_change') ||
      signals.includes('database_migration') ||
      signals.includes('containerization') ||
      signals.includes('ci_cd') ||
      signals.includes('breaking_change') ||
      /^arch:|restructure|reorganize|rearchitect|overhaul|replac.*with|migrat.*to|switch.*to|introduc.*new|adopt/i.test(msg) ||
      (commit.filesChanged > 15 && commit.insertions > 300) ||
      (commit.deletions > 300 && commit.filesChanged > 10);

    if (isArch) {
      archCommits.push({
        hash: commit.hash,
        date: commit.date,
        author: commit.author?.name,
        message: commit.message,
        filesChanged: commit.filesChanged,
        insertions: commit.insertions,
        deletions: commit.deletions,
        signals: signals.filter(s => [
          'large_scale_change', 'database_migration', 'containerization',
          'ci_cd', 'breaking_change', 'refactoring', 'infrastructure_as_code',
        ].includes(s)),
      });
    }
  }

  return archCommits.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function calculateCommitVelocity(commits) {
  if (!commits || commits.length < 2) return [];

  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const monthlyGroups = new Map();

  for (const commit of sorted) {
    const date = new Date(commit.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyGroups.has(key)) monthlyGroups.set(key, []);
    monthlyGroups.get(key).push(commit);
  }

  return [...monthlyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthCommits]) => ({
      month,
      commits: monthCommits.length,
      insertions: monthCommits.reduce((s, c) => s + (c.insertions || 0), 0),
      deletions: monthCommits.reduce((s, c) => s + (c.deletions || 0), 0),
      contributors: new Set(monthCommits.map(c => c.author?.email || c.author?.name)).size,
      netLines:
        monthCommits.reduce((s, c) => s + (c.insertions || 0), 0) -
        monthCommits.reduce((s, c) => s + (c.deletions || 0), 0),
    }));
}
