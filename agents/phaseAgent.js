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
  const messages = commits.map((commit) => String(commit.message || ''));
  const allFiles = commits.flatMap((commit) => commit.files || []);

  const keywordCount = new Map();
  for (const message of messages) {
    for (const rawToken of message.split(/\s+/)) {
      const token = cleanToken(rawToken);
      if (!token || token.length < 4 || STOP_WORDS.has(token)) {
        continue;
      }
      keywordCount.set(token, (keywordCount.get(token) || 0) + 1);
    }
  }

  const topKeywords = [...keywordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([keyword]) => keyword);

  const area = detectPrimaryArea(allFiles);
  const totalFilesChanged = commits.reduce((sum, commit) => sum + (Number(commit.filesChanged) || 0), 0);
  const totalInsertions = commits.reduce((sum, commit) => sum + (Number(commit.insertions) || 0), 0);
  const totalDeletions = commits.reduce((sum, commit) => sum + (Number(commit.deletions) || 0), 0);

  let mood = 'building';
  if (totalDeletions > totalInsertions * 1.2) {
    mood = 'refactoring';
  } else if (messages.some((m) => /^fix:|\bbug\b|hotfix/i.test(m))) {
    mood = 'stabilizing';
  } else if (messages.some((m) => /refactor|cleanup|rewrite/i.test(m))) {
    mood = 'refactoring';
  } else if (messages.some((m) => /feat|feature|add|implement/i.test(m))) {
    mood = 'growing';
  }

  const phaseNameByArea = {
    frontend: 'Interface Expansion',
    backend: 'Core Logic Buildout',
    infra: 'Delivery Pipeline Setup',
    tests: 'Quality Hardening',
    docs: 'Documentation Pass',
    product: 'Product Development'
  };

  const activities = [
    `Shipped ${chunk.commitCount} commits spanning ${chunk.period}`,
    `Touched about ${totalFilesChanged} files with ${totalInsertions} insertions and ${totalDeletions} deletions`,
    topKeywords.length > 0
      ? `Recurring themes: ${topKeywords.join(', ')}`
      : `Primary focus area: ${area}`
  ];

  const summaryParts = [
    `During ${chunk.period}, the team pushed ${chunk.commitCount} commits focused on ${area}.`,
    topKeywords.length > 0
      ? `The commit trail repeatedly highlighted ${topKeywords.join(', ')}, showing a clear direction for this phase.`
      : `The commit trail shows consistent incremental progress rather than isolated one-off changes.`,
    `This period changed ${totalFilesChanged} files and carried a ${mood} tone.`
  ];

  return {
    phase_name: phaseNameByArea[area] || 'Development Phase',
    period: chunk.period,
    summary: summaryParts.join(' '),
    key_activities: activities,
    mood,
    startDate: chunk.startDate,
    endDate: chunk.endDate,
    commitCount: chunk.commitCount
  };
}

export async function analyzePhase(chunk) {
  const commitsText = chunk.commits.map(c => 
    `- ${c.date}: ${c.message} (${c.author.name})`
  ).join('\n');
  
  const prompt = `Analyze the following Git commits and describe this development phase in a documentary style.

Commits (${chunk.commitCount} total, ${chunk.period}):
${commitsText}

Return a JSON object with this structure:
{
  "phase_name": "a short descriptive name (2-4 words)",
  "period": "${chunk.period}",
  "summary": "2-3 sentences describing what happened in documentary style",
  "key_activities": ["activity 1", "activity 2", "activity 3"],
  "mood": "one of: building, growing, stabilizing, refactoring, pivoting"
}`;

  try {
    const result = await callGroq(
      prompt,
      'You are a technical historian analyzing software development. Respond ONLY with valid JSON.'
    );
    
    return {
      ...result,
      period: chunk.period,
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      commitCount: chunk.commitCount
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
