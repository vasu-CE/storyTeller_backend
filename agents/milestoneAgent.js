import { callGroq } from '../utils/groqClient.js';


export async function detectMilestones(phases, commits, {
  tags = [],
  firstOccurrences = {},
  classification = {},
} = {}) {
  if (!phases || phases.length === 0) return [];

  const phasesSummary = phases.map(p =>
    `[${p.period}] "${p.phase_name}" — ${p.summary}`
  ).join('\n\n');

  const tagSection = tags.length > 0
    ? `Version / release tags found in repository:\n${tags.slice(0, 25).map(t => `  - ${t}`).join('\n')}\n`
    : '';

  const firstOccSection = Object.keys(firstOccurrences).length > 0
    ? `First-time architectural events detected:\n${
        Object.entries(firstOccurrences)
          .map(([event, data]) => {
            const d = new Date(data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
            return `  - First ${event.replace(/_/g, ' ')}: ${d} — "${data.message}"`;
          })
          .join('\n')
      }\n`
    : '';

  const archChanges = (classification.architecturalChanges || []).slice(0, 8);
  const archSection = archChanges.length > 0
    ? `Significant architectural commits:\n${
        archChanges.map(c => {
          const d = new Date(c.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          return `  - ${d}: ${c.message} (${c.filesChanged} files, +${c.insertions}/-${c.deletions})`;
        }).join('\n')
      }\n`
    : '';

  const summary = classification.summary || {};
  const classSection = Object.keys(summary).length > 0
    ? `Commit type breakdown: ${
        Object.entries(summary)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join('  ')
      }\n`
    : '';

  const stabilPeriods = (classification.stabilizationPeriods || []);
  const stabilSection = stabilPeriods.length > 0
    ? `Stabilization periods detected:\n${
        stabilPeriods.map(p => {
          const s = new Date(p.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          const e = new Date(p.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          return `  - ${s} → ${e}: ${p.description}`;
        }).join('\n')
      }\n`
    : '';

  const prompt = `You are a software project historian identifying the most significant milestones in a project's development timeline.

=== DEVELOPMENT PHASES ===
${phasesSummary}

${tagSection}${firstOccSection}${archSection}${classSection}${stabilSection}
Identify 4-7 milestones that represent GENUINE turning points or achievements in the project's history. Consider:
• Project birth and foundational architecture decisions
• Infrastructure maturation (first CI/CD, first tests, containerisation)
• Major feature introductions that expanded the product
• Architectural pivots, rewrites, or structural overhauls
• Stabilisation phases where quality was the focus
• Version releases documented by tags
• Team or collaboration inflection points

For each milestone explain not only WHAT happened but WHY it mattered for the project trajectory.

Return a JSON object with this structure:
{
  "milestones": [
    {
      "title": "Milestone name (3-6 words)",
      "date": "Period or date string (e.g. 'Jan 2024' or 'Q2 2023')",
      "description": "2 sentences: what happened and why it was a turning point",
      "type": "one of: launch | feature | architecture | infrastructure | quality | growth | pivot | release | security",
      "impact": "one sentence on the lasting impact on the codebase or team"
    }
  ]
}`;

  try {
    const result = await callGroq({
      systemPrompt: 'You are a precise software project historian. Identify only milestones with genuine lasting impact. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      json: true,
    });

    return Array.isArray(result.milestones) ? result.milestones : [];
  } catch (error) {
    if (error?.code === 'GROQ_QUOTA_COOLDOWN') {
      console.warn('milestoneAgent: Groq quota cooldown active, using fallback milestones.');
    } else {
      console.error('Error in milestoneAgent:', error);
    }

    return buildFallbackMilestones(phases, firstOccurrences, tags, classification);
  }
}

function buildFallbackMilestones(phases, firstOccurrences, tags, classification) {
  const milestones = [];

  // 1. Project birth
  if (phases[0]) {
    const p = phases[0];
    milestones.push({
      title: 'Project Foundation',
      date: p.period,
      description: `The repository was created and its initial architecture established. ${oneSentence(p.summary)}`,
      type: 'launch',
      impact: `Established the core structure and set the technical direction for the project.`,
    });
  }

  // 2. First-occurrence milestones
  const firstOccMilestoneMap = {
    ci_cd:             { title: 'CI/CD Pipeline Established',        type: 'infrastructure' },
    testing:           { title: 'Testing Infrastructure Introduced',  type: 'quality' },
    containerization:  { title: 'Containerisation Adopted',          type: 'infrastructure' },
    database_migration:{ title: 'Database Layer Formalised',         type: 'architecture' },
    security_fix:      { title: 'First Security Hardening',          type: 'security' },
    breaking_change:   { title: 'First Breaking API Change',         type: 'pivot' },
    large_scale_change:{ title: 'Large-Scale Structural Overhaul',   type: 'architecture' },
    performance:       { title: 'Performance Optimisation Push',     type: 'feature' },
  };

  for (const [signal, meta] of Object.entries(firstOccMilestoneMap)) {
    if (firstOccurrences[signal]) {
      const fo = firstOccurrences[signal];
      const d = new Date(fo.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      milestones.push({
        title: meta.title,
        date: d,
        description: `The project first encountered "${signal.replace(/_/g, ' ')}" in this period. Commit: "${fo.message}".`,
        type: meta.type,
        impact: `This marked an expansion of the project's operational maturity.`,
      });
    }
  }

  // 3. Stabilisation periods
  for (const period of (classification.stabilizationPeriods || []).slice(0, 2)) {
    const s = new Date(period.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    milestones.push({
      title: 'Stabilisation Phase',
      date: s,
      description: `A concentrated period of bug-fixing and quality improvement. ${period.description}.`,
      type: 'quality',
      impact: 'Reduced technical debt and improved reliability.',
    });
  }

  // 4. Tag-based releases
  for (const tag of tags.slice(0, 3)) {
    milestones.push({
      title: `Release ${tag}`,
      date: 'tag',
      description: `Version ${tag} was tagged, marking a formal release milestone.`,
      type: 'release',
      impact: 'Stabilised APIs or features for external consumers.',
    });
  }

  // 5. Middle and final phases
  const midPhase  = phases[Math.floor(phases.length / 2)];
  const lastPhase = phases[phases.length - 1];

  if (midPhase && midPhase !== phases[0]) {
    milestones.push({
      title: midPhase.phase_name || 'Growth Phase',
      date: midPhase.period,
      description: oneSentence(midPhase.summary) + ' The team consolidated its approach here.',
      type: inferType(midPhase),
      impact: `This phase carried ${midPhase.commitCount || 'several'} commits and shaped subsequent development.`,
    });
  }

  if (lastPhase && lastPhase !== phases[0] && lastPhase !== midPhase) {
    milestones.push({
      title: lastPhase.phase_name || 'Current State',
      date: lastPhase.period,
      description: oneSentence(lastPhase.summary) + ' This represents the most recent development direction.',
      type: inferType(lastPhase),
      impact: 'Sets the foundation for the next iteration of the project.',
    });
  }

  // Cap at 7 and deduplicate by title
  return milestones
    .filter((m, idx, arr) => arr.findIndex(x => x.title === m.title) === idx)
    .slice(0, 7);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function oneSentence(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const part = s.split('.').map(x => x.trim()).filter(Boolean)[0];
  return part ? `${part}.` : s;
}

function inferType(phase = {}) {
  const text = `${phase.phase_name || ''} ${phase.summary || ''}`.toLowerCase();
  if (text.includes('refactor') || text.includes('cleanup') || text.includes('rewrite')) return 'architecture';
  if (text.includes('release') || text.includes('ship') || text.includes('deploy'))      return 'release';
  if (text.includes('fix') || text.includes('stabil'))                                    return 'quality';
  if (text.includes('feat') || text.includes('add') || text.includes('implement'))        return 'feature';
  return 'growth';
}
