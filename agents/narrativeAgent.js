import { callGroq } from '../utils/groqClient.js';


export async function generateNarrative(phases, milestones, {
  contributors = {},
  classification = {},
  firstOccurrences = {},
} = {}) {
  const phasesSummary = phases.map(p =>
    `[${p.period}] "${p.phase_name}" (mood: ${p.mood || 'unknown'})\n${p.summary}\nKey activities: ${(p.key_activities || []).join(' | ')}`
  ).join('\n\n');

  const milestonesSummary = milestones.map(m =>
    `• [${m.type || 'milestone'}] ${m.title} (${m.date}): ${m.description}${m.impact ? ' — Impact: ' + m.impact : ''}`
  ).join('\n');

  const summary = classification.summary || {};
  const classText = Object.keys(summary).length > 0
    ? Object.entries(summary).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join('  |  ')
    : '';

  const archChanges = (classification.architecturalChanges || []).slice(0, 10);
  const archText = archChanges.length > 0
    ? archChanges.map(c => {
        const d = new Date(c.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        return `  ${d}: ${c.message}`;
      }).join('\n')
    : '';

  const firstOccText = Object.keys(firstOccurrences).length > 0
    ? Object.entries(firstOccurrences).map(([event, data]) => {
        const d = new Date(data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        return `  ${d}: first ${event.replace(/_/g, ' ')} — "${data.message}"`;
      }).join('\n')
    : '';

  const stabilPeriods = classification.stabilizationPeriods || [];
  const stabilText = stabilPeriods.length > 0
    ? stabilPeriods.map(p => {
        const s = new Date(p.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        const e = new Date(p.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        return `  ${s} → ${e}: ${p.description}`;
      }).join('\n')
    : '';

  const contribList = (contributors.contributors || []).slice(0, 5);
  const collabText = contribList.length > 0
    ? contribList.map(c => `  ${c.name}: ${c.commits} commits, +${c.additions || c.insertions || 0}/-${c.deletions || 0}`).join('\n')
    : '';

  const busFactor = contributors.busFactor;
  const busFactorText = busFactor != null ? `Bus factor: ${busFactor} (${busFactor === 1 ? 'single-person project' : `${busFactor} core contributors cover 50 %+ of commits`})` : '';

  const topVelocity = (classification.velocityData || [])
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 3)
    .map(v => `  ${v.month}: ${v.commits} commits by ${v.contributors} contributor(s)`)
    .join('\n');

  const prompt = `You are writing an authoritative technical documentary about a software project's development journey. Using the structured data below, craft a rich, insightful narrative that a senior engineer or tech lead would find compelling.

=== DEVELOPMENT PHASES (chronological) ===
${phasesSummary}

=== KEY MILESTONES ===
${milestonesSummary || 'None identified'}

${classText ? `=== COMMIT TYPE BREAKDOWN ===\n${classText}\n` : ''}
${archText ? `=== SIGNIFICANT ARCHITECTURAL COMMITS ===\n${archText}\n` : ''}
${firstOccText ? `=== FIRST-TIME ARCHITECTURAL EVENTS ===\n${firstOccText}\n` : ''}
${stabilText ? `=== STABILISATION PERIODS ===\n${stabilText}\n` : ''}
${collabText ? `=== TOP CONTRIBUTORS ===\n${collabText}\n${busFactorText}\n` : ''}
${topVelocity ? `=== PEAK VELOCITY MONTHS ===\n${topVelocity}\n` : ''}

Write a technical documentary narrative. For each section, go beyond surface facts — infer motivations, explain consequences, and interpret what the data reveals about the project's culture and technical evolution.

Return a JSON object with EXACTLY these keys (all required):
{
  "opening": "3-4 sentences establishing the project's origin, initial purpose, and the problem it set out to solve. Convey the founding energy.",

  "foundation_phase": "2-3 sentences describing the early architectural choices. What technology stack did the team select? What foundational patterns were laid down in the first commits, and what do they reveal about the team's approach?",

  "growth_narrative": [
    "paragraph about early feature development — the first building blocks and what drove their creation",
    "paragraph about expanding capabilities — how features compounded and the rhythm of delivery",
    "paragraph about growth challenges — the first signs of complexity, technical debt, or scaling pressure"
  ],

  "architectural_evolution": "2-3 sentences on how the system's structure changed over its lifetime. Describe any pivots, rewrites, or additions of major infrastructure layers. Explain the 'why' behind the changes when it can be inferred.",

  "collaboration_story": "2 sentences interpreting the contributor dynamics. Is this a solo project, a tight-knit team, or a sprawling open-source community? What does the commit pattern say about how decisions were made?",

  "technical_decisions": [
    "Inferred decision 1: describe the decision AND the likely reasoning behind it",
    "Inferred decision 2: describe the decision AND the likely reasoning behind it",
    "Inferred decision 3: describe the decision AND the likely reasoning behind it"
  ],

  "stabilization_narrative": "1-2 sentences about bug-fix periods and quality focus. Did the team tend towards continuous quality or episodic clean-up? What does that pattern reveal?",

  "turning_points": [
    "Turning point 1 — a sentence or two describing a pivotal event and its consequence",
    "Turning point 2",
    "Turning point 3"
  ],

  "current_state": "2 sentences on where the project currently stands, what the trajectory suggests about its maturity, and what the next chapter might look like.",

  "project_character": "4-6 words characterising the project's personality and culture (e.g. 'methodical enterprise architect', 'fast-moving product startup', 'community-driven open-source library', 'solo craftsperson codebase')"
}`;

  try {
    const result = await callGroq({
      systemPrompt: 'You are a senior technical writer crafting documentary-style narratives about software projects. Write with authority, insight, and depth. Respond ONLY with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      json: true,
    });

    return {
      ...result,
      growth_narrative:   ensureStringArray(result.growth_narrative),
      technical_decisions: ensureStringArray(result.technical_decisions),
      turning_points:     ensureStringArray(result.turning_points),
      middle_sections:    ensureStringArray(result.growth_narrative),   // backwards-compat alias
    };
  } catch (error) {
    if (error?.code === 'GROQ_QUOTA_COOLDOWN') {
      console.warn('narrativeAgent: Groq quota cooldown active, using fallback narrative.');
    } else {
      console.error('Error in narrativeAgent:', error);
    }

    return buildFallbackNarrative(phases, milestones, contributors, classification, firstOccurrences);
  }
}

function buildFallbackNarrative(phases, milestones, contributors, classification, firstOccurrences) {
  const safePhases      = Array.isArray(phases)    ? phases    : [];
  const safeMilestones  = Array.isArray(milestones) ? milestones : [];
  const openingPhase    = safePhases[0];
  const latestPhase     = safePhases[safePhases.length - 1];
  const totalCommits    = safePhases.reduce((s, p) => s + (Number(p.commitCount) || 0), 0);
  const moods           = safePhases.map(p => String(p.mood || '')).filter(Boolean);
  const contribs        = (contributors.contributors || []);
  const summary         = classification.summary || {};

  // Dominant mood
  const dominantMood = moods.length > 0
    ? moods.sort((a, b) =>
        moods.filter(m => m === b).length - moods.filter(m => m === a).length
      )[0]
    : 'building';

  const projectCharacterMap = {
    building:     'steady, methodical builder',
    growing:      'feature-forward, delivery-focused team',
    stabilizing:  'quality-conscious, reliability-focused maintainer',
    refactoring:  'craft-driven, improvement-oriented codebase',
    pivoting:     'adaptive, evolving product',
    experimenting:'exploratory, prototype-driven project',
  };

  // Opening
  const opening = openingPhase
    ? `The story opens in ${openingPhase.period}, when the repository took its first steps as ${openingPhase.phase_name || 'a new project'}. ${oneSentence(openingPhase.summary)} Over ${openingPhase.commitCount || 0} early commits, the foundation was laid — choices made here would echo through every phase that followed.`
    : 'This project began with foundational work that gradually built momentum and established direction.';

  // Foundation phase
  const firstOccKeys = Object.keys(firstOccurrences);
  const foundation = openingPhase
    ? `The earliest commits reveal the team's instincts: a ${openingPhase.dominant_area || 'focused'} codebase, shaped by ${openingPhase.phase_name || 'initial'} priorities. ${firstOccKeys.length > 0 ? `Early architectural decisions included ${firstOccKeys.slice(0, 3).map(k => k.replace(/_/g, ' ')).join(', ')}.` : ''} These choices, visible in the first ${openingPhase.commitCount || 'few'} commits, established the project's technical personality.`
    : 'The project was established with deliberate architectural choices that shaped its long-term structure.';

  // Growth narrative
  const growthPhases = safePhases.slice(1, -1);
  const growthNarrative = growthPhases.length > 0
    ? [
        `Building on the foundation, the project entered a phase of active development. ${oneSentence(safePhases[1]?.summary)} The team added ${safePhases[1]?.commitCount || 0} commits in ${safePhases[1]?.period || 'this stretch'}.`,
        growthPhases.length > 1
          ? `As capabilities expanded, patterns began to consolidate. ${oneSentence(growthPhases[Math.floor(growthPhases.length / 2)]?.summary)}`
          : 'The codebase grew steadily, with each phase building on the last.',
        summary.fix > 0
          ? `Complexity brought its own pressures: ${summary.fix} fix commits suggest the team regularly addressed emerging bugs alongside new development.`
          : 'The team maintained focus throughout the growth period, keeping technical debt in check.',
      ]
    : [
        `${oneSentence(openingPhase?.summary)} The project grew through ${totalCommits} commits that defined its current form.`,
        'Each phase of development added incremental value, compounding towards the current state.',
        'The team prioritised sustained delivery over large one-off efforts.',
      ];

  // Architectural evolution
  const archChanges = classification.architecturalChanges || [];
  const foEvents = Object.keys(firstOccurrences);
  const architecturalEvolution = archChanges.length > 0
    ? `The project underwent ${archChanges.length} notable architectural shift${archChanges.length > 1 ? 's' : ''}. ${oneSentence(archChanges[0]?.message)} ${foEvents.includes('containerization') ? 'Containerisation was later adopted, suggesting a move toward scalable deployment.' : ''}`
    : foEvents.length > 0
      ? `Key infrastructure decisions included ${foEvents.slice(0, 3).map(e => e.replace(/_/g, ' ')).join(', ')}, each expanding the project's operational capabilities.`
      : 'The codebase evolved incrementally, with no single large-scale structural reversal detected.';

  // Collaboration story
  const collabStory = contribs.length > 1
    ? `With ${contributors.totalContributors || contribs.length} contributors, this project shows collaborative ownership. ${contribs[0]?.name || 'The primary author'} led with ${contribs[0]?.commits || 0} commits${contributors.busFactor === 1 ? ', though a single contributor accounts for the majority of changes' : ''}.`
    : contribs.length === 1
      ? `This appears to be a solo or near-solo project: ${contribs[0]?.name || 'one author'} authored the vast majority of commits, suggesting a focused individual effort.`
      : 'Contribution patterns indicate a small, tightly-focused team.';

  // Technical decisions
  const technicalDecisions = [
    foEvents.includes('testing')
      ? `Testing infrastructure was introduced early, reflecting a commitment to code quality from the start.`
      : 'Testing was not a primary early focus, suggesting the team prioritised shipping features first.',
    foEvents.includes('ci_cd')
      ? `CI/CD was adopted to automate delivery, a decision that typically indicates growing team confidence and a shift toward continuous deployment.`
      : 'Manual deployment remained the norm — the team had not yet invested in automated delivery pipelines.',
    summary.refactor > 0
      ? `${summary.refactor} refactor commits indicate the team actively managed technical debt rather than letting it accumulate unchecked.`
      : 'Few explicit refactor commits suggest the team either embedded improvements into feature work or deferred structural cleanup.',
  ];

  // Stabilisation
  const stabilPeriods = classification.stabilizationPeriods || [];
  const stabilNarrative = stabilPeriods.length > 0
    ? `The project endured ${stabilPeriods.length} identifiable stabilisation ${stabilPeriods.length > 1 ? 'periods' : 'period'} — concentrated stretches of bug-fixing that followed bursts of feature development. This episodic pattern suggests the team shipped aggressively and then consolidated.`
    : summary.fix > totalCommits * 0.15
      ? 'Bug fixes were distributed throughout the timeline rather than concentrated, suggesting a culture of immediate quality response rather than deferred stabilisation.'
      : 'The low frequency of fix commits points to a codebase maintained with consistent care, or to a young project that has not yet encountered significant production pressure.';

  // Turning points
  const turningPoints = safeMilestones.slice(1, 4).map(m =>
    `${m.title} (${m.date}): ${oneSentence(m.description)}`
  );
  if (turningPoints.length === 0 && safePhases.length > 2) {
    turningPoints.push(
      `${safePhases[1].phase_name} (${safePhases[1].period}) marked a shift from foundation-building to active development.`
    );
  }

  // Current state
  const currentState = latestPhase
    ? `The project currently sits in its "${latestPhase.phase_name || 'latest'}" phase (${latestPhase.period}), carrying a ${latestPhase.mood || dominantMood} momentum. Across ${totalCommits} total commits, the codebase has matured into a ${projectCharacterMap[dominantMood] || 'evolving'} — its next chapter will likely continue this trajectory.`
    : 'The project remains active, continuing to evolve through iterative development.';

  const narrative = {
    opening,
    foundation_phase:    foundation,
    growth_narrative:    growthNarrative,
    architectural_evolution: architecturalEvolution,
    collaboration_story: collabStory,
    technical_decisions: technicalDecisions,
    stabilization_narrative: stabilNarrative,
    turning_points:      turningPoints,
    current_state:       currentState,
    project_character:   projectCharacterMap[dominantMood] || 'evolving codebase',
    // backwards-compat aliases consumed by existing frontend / ChatPanel
    middle_sections: growthNarrative,
  };

  return narrative;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureStringArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string' && value.trim()) {
    if (value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value.trim());
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch { /* fall through */ }
    }
    return [value.trim()];
  }
  return [];
}

function oneSentence(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const part = s.split('.').map(x => x.trim()).filter(Boolean)[0];
  return part ? `${part}.` : s;
}
