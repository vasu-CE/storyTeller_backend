import { callGroq } from '../utils/groqClient.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'about', 'update',
  'minor', 'small', 'merge', 'branch', 'main', 'master', 'issue', 'pull', 'request',
  'added', 'adding', 'fix', 'fixed', 'feat', 'chore', 'docs', 'test', 'tests', 'ci'
]);

function cleanToken(token) {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectPrimaryArea(files = []) {
  const areaScore = {
    frontend: 0,
    backend: 0,
    infra: 0,
    tests: 0,
    docs: 0
  };

  for (const file of files) {
    const lower = String(file || '').toLowerCase();
    if (!lower) {
      continue;
    }
    if (lower.includes('frontend') || lower.includes('src/') || lower.endsWith('.jsx') || lower.endsWith('.tsx') || lower.endsWith('.css')) {
      areaScore.frontend += 1;
    }
    if (lower.includes('backend') || lower.includes('api') || lower.endsWith('.js') || lower.endsWith('.ts')) {
      areaScore.backend += 1;
    }
    if (lower.includes('.github') || lower.includes('docker') || lower.includes('k8s') || lower.includes('pipeline') || lower.includes('workflow')) {
      areaScore.infra += 1;
    }
    if (lower.includes('test') || lower.includes('spec')) {
      areaScore.tests += 1;
    }
    if (lower.endsWith('.md') || lower.includes('readme') || lower.includes('docs')) {
      areaScore.docs += 1;
    }
  }

  const top = Object.entries(areaScore).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : 'product';
}

function buildFallbackPhase(chunk) {
  const commits = chunk.commits || [];
  const messages = commits.map((c) => String(c.message || ''));
  const allFiles = commits.flatMap((c) => c.files || []);

  const keywordCount = new Map();
  for (const message of messages) {
    for (const rawToken of message.split(/\s+/)) {
      const token = cleanToken(rawToken);
      if (!token || token.length < 4 || STOP_WORDS.has(token)) continue;
      keywordCount.set(token, (keywordCount.get(token) || 0) + 1);
    }
  }

  const topKeywords = [...keywordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kw]) => kw);

  // Prefer the richer fileTypeStats from the chunk if available
  const fileStats = chunk.fileTypeStats || {};
  const area = Object.entries(fileStats).length > 0
    ? Object.entries(fileStats).sort(([, a], [, b]) => b - a)[0][0]
    : detectPrimaryArea(allFiles);

  const totalFilesChanged = commits.reduce((s, c) => s + (Number(c.filesChanged) || 0), 0);
  const totalInsertions = chunk.totalInsertions ?? commits.reduce((s, c) => s + (Number(c.insertions) || 0), 0);
  const totalDeletions  = chunk.totalDeletions  ?? commits.reduce((s, c) => s + (Number(c.deletions)  || 0), 0);

  let mood = 'building';
  const archSignals = chunk.architecturalSignals || [];
  if (archSignals.includes('refactoring') || totalDeletions > totalInsertions * 1.2) {
    mood = 'refactoring';
  } else if (archSignals.includes('ci_cd') || archSignals.includes('containerization') || archSignals.includes('infrastructure_as_code')) {
    mood = 'growing';
  } else if (messages.some((m) => /^fix:|\bbug\b|hotfix|crash|revert/i.test(m))) {
    mood = 'stabilizing';
  } else if (messages.some((m) => /feat|feature|add|implement|introduc/i.test(m))) {
    mood = 'growing';
  }

  const phaseNameByArea = {
    frontend: 'Interface Expansion',
    backend: 'Core Logic Buildout',
    infra: 'Delivery Pipeline Setup',
    infrastructure: 'Infrastructure Hardening',
    tests: 'Quality Hardening',
    testing: 'Quality Hardening',
    docs: 'Documentation Pass',
    documentation: 'Documentation Pass',
    database: 'Data Layer Work',
    config: 'Config & Tooling',
    styles: 'UI Polish',
    product: 'Product Development',
    'full-stack': 'Full-Stack Development',
  };

  // Highlight any architectural signals in this phase
  const archHighlight = archSignals.includes('database_migration')
    ? 'This phase introduced or modified database schema.'
    : archSignals.includes('containerization')
      ? 'Containerization was introduced or updated in this period.'
      : archSignals.includes('ci_cd')
        ? 'CI/CD pipeline work featured prominently in this phase.'
        : archSignals.includes('refactoring')
          ? 'A significant refactor shaped the codebase during this period.'
          : null;

  const summaryParts = [
    `During ${chunk.period}, the team pushed ${chunk.commitCount} commits concentrated on ${area}.`,
    topKeywords.length > 0
      ? `The commit trail repeatedly highlighted ${topKeywords.join(', ')}, pointing to a clear direction.`
      : 'Consistent incremental progress defined this stretch rather than isolated one-off changes.',
    `${totalFilesChanged} files were touched (+${totalInsertions}/-${totalDeletions} lines), reflecting a ${mood} tone.`,
  ];

  const activities = [
    `Shipped ${chunk.commitCount} commits across ${chunk.period}`,
    archHighlight || (topKeywords.length > 0 ? `Recurring themes: ${topKeywords.join(', ')}` : `Primary focus: ${area}`),
    `${totalFilesChanged} files changed (+${totalInsertions}/-${totalDeletions} lines)`,
  ];

  return {
    phase_name: phaseNameByArea[area] || 'Development Phase',
    period: chunk.period,
    summary: summaryParts.join(' '),
    key_activities: activities,
    mood,
    architectural_impact: archHighlight || null,
    dominant_area: area,
    startDate: chunk.startDate,
    endDate: chunk.endDate,
    commitCount: chunk.commitCount,
    fileTypeStats: chunk.fileTypeStats,
    architecturalSignals: chunk.architecturalSignals,
  };
}

export async function analyzePhase(chunk) {
  // Sample up to 30 commits for the prompt (keeps token count manageable on large phases)
  const sample = chunk.commits.slice(0, 30);
  const commitsText = sample.map(c =>
    `- ${c.date} [${c.author?.name || 'unknown'}] ${c.message} (+${c.insertions || 0}/-${c.deletions || 0})`
  ).join('\n');

  // File-area breakdown for this phase
  const fileStats = chunk.fileTypeStats || {};
  const fileStatsText = Object.entries(fileStats)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, n]) => `${type}: ${n} files`)
    .join(', ');

  const archSignals = chunk.architecturalSignals || [];
  const archContext = archSignals.length > 0
    ? `\nArchitectural events in this phase: ${archSignals.join(', ')}`
    : '';

  const prompt = `You are a technical documentary historian studying a software project's Git history.

Phase window: ${chunk.period}
Commits: ${chunk.commitCount}  |  Lines added: ${chunk.totalInsertions || 0}  |  Lines removed: ${chunk.totalDeletions || 0}
File areas touched: ${fileStatsText || 'unknown'}${archContext}

Commit sample (newest last):
${commitsText}

Analyse this phase with depth and context. Infer the team's motivation — not just WHAT they did, but WHY. Identify whether they were exploring, executing on a plan, fighting fires, or rethinking the system.

Return a JSON object with EXACTLY this structure:
{
  "phase_name": "2-4 word name capturing the spirit of this period",
  "period": "${chunk.period}",
  "summary": "2-3 sentences in documentary prose: what happened, WHY the team was doing it, and the broader context",
  "key_activities": ["specific concrete activity with brief context", "another activity", "third activity"],
  "mood": "one of: building, growing, stabilizing, refactoring, pivoting, experimenting",
  "architectural_impact": "one sentence on any structural change made — or null if none",
  "dominant_area": "primary focus area: frontend | backend | infrastructure | testing | documentation | full-stack"
}`;

  try {
    const result = await callGroq({
      systemPrompt: 'You are a technical historian who writes insightful documentary analysis of software development history. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      json: true
    });

    return {
      ...result,
      period: chunk.period,
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      commitCount: chunk.commitCount,
      fileTypeStats: chunk.fileTypeStats,
      architecturalSignals: chunk.architecturalSignals,
    };
  } catch (error) {
    if (error?.code === 'GROQ_QUOTA_COOLDOWN') {
      console.warn('phaseAgent: Groq quota cooldown active, using fallback phase summary.');
    } else {
      console.error('Error in phaseAgent:', error);
    }

    return buildFallbackPhase(chunk);
  }
}
