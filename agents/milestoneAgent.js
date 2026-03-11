import { callGroq } from '../utils/groqClient.js';

function inferMilestoneType(phase = {}, index = 0) {
  const text = `${phase.phase_name || ''} ${phase.summary || ''}`.toLowerCase();
  if (index === 0) {
    return 'launch';
  }
  if (text.includes('refactor') || text.includes('cleanup') || text.includes('rewrite')) {
    return 'refactor';
  }
  if (text.includes('release') || text.includes('ship') || text.includes('deploy')) {
    return 'release';
  }
  if (text.includes('fix') || text.includes('stabil')) {
    return 'growth';
  }
  return 'feature';
}

function summarizePhaseForMilestone(phase = {}) {
  const summary = String(phase.summary || '').trim();
  if (!summary) {
    return `The team completed ${phase.commitCount || 'multiple'} commits and moved the project forward.`;
  }
  const firstSentence = summary.split('.').map((s) => s.trim()).filter(Boolean)[0];
  return firstSentence ? `${firstSentence}.` : summary;
}

export async function detectMilestones(phases, commits) {
  if (!phases || phases.length === 0) {
    return [];
  }
  
  const phasesSummary = phases.map(p => 
    `${p.period}: ${p.phase_name} - ${p.summary}`
  ).join('\n\n');
  
  const prompt = `Based on these development phases, identify 3-5 major milestones in this project's history:

${phasesSummary}

Return a JSON object with this structure:
{
  "milestones": [
    {
      "title": "milestone name",
      "date": "approximate date or period",
      "description": "1-2 sentence explanation",
      "type": "one of: launch, feature, refactor, release, growth, pivot"
    }
  ]
}`;

  try {
    const result = await callGroq({
      systemPrompt: 'You are analyzing software project history. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      json: true
    });
    
    return result.milestones || [];
  } catch (error) {
    if (error?.code === 'GROQ_QUOTA_COOLDOWN') {
      console.warn('milestoneAgent: Groq quota cooldown active, using fallback milestones.');
    } else {
      console.error('Error in milestoneAgent:', error);
    }
    
    const selectedPhases = [
      phases[0],
      phases[Math.floor(phases.length / 2)],
      phases[phases.length - 1]
    ].filter(Boolean);

    const deduped = [];
    for (const phase of selectedPhases) {
      if (!deduped.some((p) => p.period === phase.period && p.phase_name === phase.phase_name)) {
        deduped.push(phase);
      }
    }

    return deduped.map((phase, idx) => ({
      title: phase.phase_name || `Milestone ${idx + 1}`,
      date: phase.period,
      description: summarizePhaseForMilestone(phase),
      type: inferMilestoneType(phase, idx),
      commits_count: phase.commitCount || undefined,
      impact: `This phase covered ${phase.commitCount || 'several'} commits and set direction for the next stage.`
    }));
  }
}
