import { callGroq } from '../utils/groqClient.js';

function ensureStringArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((item) => String(item));
      }
      return [String(parsed)];
    } catch {
      return [trimmed];
    }
  }

  return [trimmed];
}

export async function generateNarrative(phases, milestones) {
  const phasesSummary = phases.map(p => 
    `**${p.period}**: ${p.phase_name}\n${p.summary}`
  ).join('\n\n');
  
  const milestonesSummary = milestones.map(m =>
    `- ${m.title} (${m.date}): ${m.description}`
  ).join('\n');
  
  const prompt = `Write a compelling documentary-style narrative about this software project's development history.

Phases:
${phasesSummary}

Key Milestones:
${milestonesSummary}

Return a JSON object with this structure:
{
  "opening": "2-3 sentences about project's initial creation and foundation",
  "middle_sections": ["paragraph about main development", "paragraph about key features", "paragraph about major changes"],
  "turning_points": ["major pivot or architectural change"],
  "current_state": "where the project stands today",
  "project_character": "2-3 words describing project (e.g. 'fast-moving startup', 'mature enterprise')"
}`;

  try {
    const result = await callGroq(
      prompt,
      'You are a technical storyteller crafting engaging narratives about software projects. Respond ONLY with valid JSON.'
    );

    return {
      ...result,
      middle_sections: ensureStringArray(result.middle_sections),
      turning_points: ensureStringArray(result.turning_points)
    };
  } catch (error) {
    console.error('Error in narrativeAgent:', error);
    
    // Fallback narrative
    return {
      opening: `This project began with ${phases[0]?.phase_name || 'initial development'}.`,
      middle_sections: phases.slice(1).map(p => p.summary),
      turning_points: milestones.length > 0 ? [milestones[0].description] : ['The project evolved steadily.'],
      current_state: phases[phases.length - 1]?.summary || 'The project continues to develop.',
      project_character: 'evolving codebase'
    };
  }
}
