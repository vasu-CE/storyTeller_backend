
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
      const fallbackType = inferCommitTypeFromDiff(commit);
      if (fallbackType && classification[fallbackType]) {
        classification[fallbackType].push(commit);
      } else {
        classification.other.push(commit);
      }
    }
  }

  const stabilizationPeriods = detectStabilizationPeriods(commits);
  const architecturalChanges = detectArchitecturalChanges(commits);
  const velocityData = calculateCommitVelocity(commits);
  const codeChangeInterpretation = analyzeCodeChangeInterpretation(commits);

  return {
    classification,
    summary: Object.fromEntries(
      Object.entries(classification).map(([type, list]) => [type, list.length])
    ),
    stabilizationPeriods,
    architecturalChanges,
    velocityData,
    codeChangeInterpretation,
    total: commits.length,
  };
}

function inferCommitTypeFromDiff(commit) {
  const interpretationCategories = commit?.codeChangeInterpretation?.categories || [];
  const signals = commit?.architecturalSignals || [];
  const files = Array.isArray(commit?.files) ? commit.files.map((f) => String(f).toLowerCase()) : [];
  const fileTypes = commit?.fileTypes || {};
  const insertions = Number(commit?.insertions) || 0;
  const deletions = Number(commit?.deletions) || 0;

  if (interpretationCategories.includes('infrastructure_or_build_system_changes') || signals.includes('ci_cd')) {
    return 'ci';
  }

  if (
    interpretationCategories.includes('configuration_updates') ||
    signals.includes('dependency_change') ||
    files.some((f) => f.endsWith('package.json') || f.includes('lock') || f.endsWith('requirements.txt') || f.endsWith('pom.xml'))
  ) {
    return 'deps';
  }

  if (
    interpretationCategories.includes('test_suite_additions') ||
    signals.includes('testing') ||
    (fileTypes.tests || 0) > 0 ||
    files.some((f) => f.includes('/test') || f.includes('/spec') || /\.test\.|\.spec\./.test(f))
  ) {
    return 'test';
  }

  if (
    interpretationCategories.includes('large_scale_refactoring') ||
    interpretationCategories.includes('file_restructuring') ||
    signals.includes('refactoring') ||
    signals.includes('large_scale_change') ||
    deletions > insertions * 1.2
  ) {
    return 'refactor';
  }

  if (
    signals.includes('security_fix') ||
    signals.includes('security') ||
    files.some((f) => /security|auth|jwt|oauth|permission|rbac/.test(f))
  ) {
    return 'security';
  }

  if (
    interpretationCategories.includes('new_module_or_component_introduction') ||
    insertions > deletions * 1.4 ||
    (fileTypes.frontend || 0) + (fileTypes.backend || 0) >= 3
  ) {
    return 'feat';
  }

  if ((fileTypes.docs || 0) > 0 && (fileTypes.backend || 0) + (fileTypes.frontend || 0) === 0) {
    return 'docs';
  }

  return null;
}

export function analyzeCodeChangeInterpretation(commits) {
  const categories = {
    new_module_or_component_introduction: 0,
    large_scale_refactoring: 0,
    file_restructuring: 0,
    configuration_updates: 0,
    test_suite_additions: 0,
    infrastructure_or_build_system_changes: 0,
  };

  const interpretedCommits = [];

  for (const commit of (commits || [])) {
    const interpretation = commit?.codeChangeInterpretation;
    if (!interpretation || !Array.isArray(interpretation.categories)) {
      continue;
    }

    for (const category of interpretation.categories) {
      if (Object.prototype.hasOwnProperty.call(categories, category)) {
        categories[category] += 1;
      }
    }

    interpretedCommits.push({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      categories: interpretation.categories,
      impactSummary: interpretation.impactSummary,
      impactMagnitude: (commit.insertions || 0) + (commit.deletions || 0),
    });
  }

  const majorImpactEvents = interpretedCommits
    .sort((a, b) => b.impactMagnitude - a.impactMagnitude)
    .slice(0, 20)
    .map(({ impactMagnitude, ...event }) => event);

  const systemImpactSummary = buildSystemImpactSummary(categories, interpretedCommits.length);

  return {
    categories,
    interpretedCommits: interpretedCommits.length,
    majorImpactEvents,
    systemImpactSummary,
  };
}

function buildSystemImpactSummary(categories, interpretedCount) {
  const lines = [];

  if (categories.new_module_or_component_introduction > 0) {
    lines.push(`Feature surface expanded through ${categories.new_module_or_component_introduction} module/component introduction commits.`);
  }
  if (categories.large_scale_refactoring > 0) {
    lines.push(`Architecture and internal quality were reshaped by ${categories.large_scale_refactoring} large-scale refactoring efforts.`);
  }
  if (categories.file_restructuring > 0) {
    lines.push(`Repository organization evolved in ${categories.file_restructuring} restructuring commits, improving project layout and maintainability.`);
  }
  if (categories.configuration_updates > 0) {
    lines.push(`Operational behavior was tuned via ${categories.configuration_updates} configuration updates.`);
  }
  if (categories.test_suite_additions > 0) {
    lines.push(`Reliability posture improved with ${categories.test_suite_additions} test-suite expansion commits.`);
  }
  if (categories.infrastructure_or_build_system_changes > 0) {
    lines.push(`Delivery pipeline maturity advanced through ${categories.infrastructure_or_build_system_changes} infrastructure/build-system changes.`);
  }

  if (lines.length === 0) {
    lines.push('No specialized diff-interpretation categories were detected; changes appear primarily incremental.');
  }

  lines.push(`Interpretation coverage: ${interpretedCount} commits with explicit code-change impact classification.`);
  return lines;
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
