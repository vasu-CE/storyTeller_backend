import { callGroq } from '../utils/groqClient.js';

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
    console.error('Error in phaseAgent:', error);
    
    // Fallback response
    return {
      phase_name: 'Development Phase',
      period: chunk.period,
      summary: `Development phase with ${chunk.commitCount} commits.`,
      key_activities: ['Code changes', 'Updates', 'Improvements'],
      mood: 'building',
      startDate: chunk.startDate,
      endDate: chunk.endDate,
      commitCount: chunk.commitCount
    };
  }
}
