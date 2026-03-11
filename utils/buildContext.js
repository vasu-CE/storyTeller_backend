function toList(value, fallback = 'none') {
  if (Array.isArray(value) && value.length > 0) {
    return value.join(', ');
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeRepoMeta(analysisResult = {}) {
  return analysisResult.repoMeta || analysisResult.repository || {};
}

function normalizeContributors(analysisResult = {}) {
  const contributors = analysisResult.contributors;

  if (Array.isArray(contributors)) {
    return contributors;
  }

  if (Array.isArray(contributors?.contributors)) {
    return contributors.contributors;
  }

  return [];
}

function normalizeCommits(analysisResult = {}) {
  return Array.isArray(analysisResult.commits) ? analysisResult.commits : [];
}

export function buildContext(analysisResult) {
  const repoMeta = normalizeRepoMeta(analysisResult);
  const phases = Array.isArray(analysisResult?.phases) ? analysisResult.phases : [];
  const milestones = Array.isArray(analysisResult?.milestones) ? analysisResult.milestones : [];
  const contributors = normalizeContributors(analysisResult);
  const narrative = analysisResult?.narrative || {};
  const commits = normalizeCommits(analysisResult);

  const repoSummary = [
    `Repository: ${repoMeta.url || 'unknown'}`,
    `Total Commits: ${repoMeta.totalCommits || commits.length || 0}`,
    `Branches: ${toList(repoMeta.branches)}`,
    `Tags / Releases: ${toList(repoMeta.tags, 'none')}`
  ].join('\n');

  const phaseSummary = phases
    .map((phase) => [
      `Phase: ${phase.phase_name || 'unknown'} | Period: ${phase.period || 'unknown'} | Mood: ${phase.mood || 'unknown'}`,
      `Summary: ${phase.summary || 'No summary available.'}`,
      `Key Activities: ${toList(phase.key_activities, 'none')}`
    ].join('\n'))
    .join('\n\n');

  const milestoneSummary = milestones
    .map((milestone) => `[${milestone.type || 'milestone'}] ${milestone.title || 'Untitled'} - ${milestone.date || 'unknown date'}: ${milestone.description || 'No description.'}`)
    .join('\n');

  const contributorSummary = contributors
    .map((contributor) => {
      const additions = Number(contributor.additions ?? contributor.insertions ?? 0) || 0;
      const deletions = Number(contributor.deletions ?? 0) || 0;
      const totalCommits = Number(contributor.totalCommits ?? contributor.commits ?? 0) || 0;
      return `${contributor.author || contributor.name || 'Unknown'}: ${totalCommits} commits, +${additions}/-${deletions} lines`;
    })
    .join('\n');

  const middleSections = toArray(narrative.middle_sections).join(' | ') || 'No development details available.';
  const turningPoints = toArray(narrative.turning_points).join(' | ') || 'No turning points available.';

  const narrativeSummary = [
    `Opening: ${narrative.opening || 'No opening available.'}`,
    `Development: ${middleSections}`,
    `Turning Points: ${turningPoints}`,
    `Current State: ${narrative.current_state || 'No current state available.'}`
  ].join('\n');

  const commitHighlights = commits
    .map((commit) => {
      const additions = Number(commit.additions ?? commit.insertions ?? 0) || 0;
      const deletions = Number(commit.deletions ?? 0) || 0;
      return {
        ...commit,
        additions,
        deletions,
        impact: additions + deletions
      };
    })
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 20)
    .map((commit) => `${commit.date || 'unknown date'} | ${commit.author?.name || commit.author || 'Unknown'} | ${commit.message || 'No message'} | +${commit.additions}/-${commit.deletions}`)
    .join('\n');

  const context = [
    '=== REPOSITORY SUMMARY ===',
    repoSummary,
    '',
    '=== PHASE SUMMARY ===',
    phaseSummary || 'No phase data available.',
    '',
    '=== MILESTONE SUMMARY ===',
    milestoneSummary || 'No milestone data available.',
    '',
    '=== CONTRIBUTOR SUMMARY ===',
    contributorSummary || 'No contributor data available.',
    '',
    '=== NARRATIVE SUMMARY ===',
    narrativeSummary,
    '',
    '=== COMMIT HIGHLIGHTS (TOP 20 BY CHANGE SIZE) ===',
    commitHighlights || 'No commit highlights available.'
  ].join('\n');

  console.log(`buildContext: built context with ${context.length} characters`);
  return context;
}
