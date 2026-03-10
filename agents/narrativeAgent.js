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

function oneSentence(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) {
    return '';
  }
  const sentence = cleaned.split('.').map((item) => item.trim()).filter(Boolean)[0];
  return sentence ? `${sentence}.` : cleaned;
}

function buildFallbackNarrative(phases, milestones) {
  const safePhases = Array.isArray(phases) ? phases : [];
  const safeMilestones = Array.isArray(milestones) ? milestones : [];

  const openingPhase = safePhases[0];
  const latestPhase = safePhases[safePhases.length - 1];
  const totalCommits = safePhases.reduce((sum, phase) => sum + (Number(phase.commitCount) || 0), 0);
  const moods = safePhases.map((phase) => String(phase.mood || '')).filter(Boolean);

  const opening = openingPhase
    ? `The story opens in ${openingPhase.period}, when the repository entered ${openingPhase.phase_name || 'its first visible phase'}. ${oneSentence(openingPhase.summary)} Through ${openingPhase.commitCount || 0} early commits, the team established momentum and direction.`
    : 'This repository started with foundational work and gradual momentum.';

  const middleSections = safePhases.slice(1).map((phase, index) => {
    const prefix = index === 0 ? 'From there,' : 'Then,';
    return `${prefix} ${oneSentence(phase.summary)} This chapter added ${phase.commitCount || 0} commits across ${phase.period}.`;
  });

  if (middleSections.length === 0 && openingPhase) {
    middleSections.push(`The early phase alone carries most of the visible history, with ${openingPhase.commitCount || 0} commits shaping the codebase.`);
  }

  const turningPoints = safeMilestones.length > 0
    ? safeMilestones.map((milestone) => `${milestone.title || 'Milestone'} (${milestone.date || 'unknown date'}): ${oneSentence(milestone.description)}`)
    : safePhases.slice(0, 2).map((phase) => `${phase.phase_name || 'Phase'}: ${oneSentence(phase.summary)}`);

  const dominantMood = moods.length > 0 ? moods.sort((a, b) => moods.filter((m) => m === b).length - moods.filter((m) => m === a).length)[0] : 'building';
  const projectCharacterMap = {
    building: 'steady builder',
    growing: 'feature-forward team',
    stabilizing: 'quality-focused maintainer',
    refactoring: 'craft-driven codebase',
    pivoting: 'adaptive product'
  };

  const currentState = latestPhase
    ? `The project currently sits in ${latestPhase.period}, with ${latestPhase.phase_name || 'recent development'} defining the latest direction. Across ${totalCommits} commits, the repository shows a ${dominantMood} rhythm and continued iteration.`
    : 'The repository remains active and continues to evolve through iterative development.';

  return {
    opening,
    middle_sections: middleSections,
    turning_points: turningPoints,
    current_state: currentState,
    project_character: projectCharacterMap[dominantMood] || 'evolving codebase'
  };
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
    if (error?.code === 'GROQ_QUOTA_COOLDOWN') {
      console.warn('narrativeAgent: Groq quota cooldown active, using fallback narrative.');
    } else {
      console.error('Error in narrativeAgent:', error);
    }
    
    return buildFallbackNarrative(phases, milestones);
  }
}
