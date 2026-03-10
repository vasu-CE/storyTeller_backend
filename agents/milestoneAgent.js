import { callGroq } from '../utils/groqClient.js';

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
    const result = await callGroq(
      prompt,
      'You are analyzing software project history. Respond ONLY with valid JSON.'
    );
    
    return result.milestones || [];
  } catch (error) {
    console.error('Error in milestoneAgent:', error);
    
    // Fallback: create basic milestones from phases
    return phases.slice(0, 3).map((phase, idx) => ({
      title: phase.phase_name,
      date: phase.period,
      description: phase.summary.split('.')[0] + '.',
      type: idx === 0 ? 'launch' : 'feature'
    }));
  }
}
