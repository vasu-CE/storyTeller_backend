import { getContext } from '../store/contextStore.js';
import { buildContext } from '../utils/buildContext.js';
import { callGroq } from '../utils/groqClient.js';
import { restoreContextBySessionId } from '../utils/repositoryCache.js';

function sanitizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && typeof item.content === 'string' && typeof item.role === 'string')
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content.length > 0);
}

export async function chatAgent(sessionId, userQuestion, conversationHistory = []) {
  let context = getContext(sessionId);

  if (!context) {
    context = await restoreContextBySessionId(sessionId);
  }

  if (!context) {
    const error = new Error('Session not found. Please re-analyze the repository.');
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }

  const contextText = buildContext(context);
  const trimmedHistory = sanitizeHistory(conversationHistory).slice(-10);

  const systemPrompt = `You are a knowledgeable senior engineer reviewing a repository.
You must answer ONLY using the repository analysis data provided below.
If the user asks something unrelated to this repository, reply exactly: "I can only answer questions about this repository."
If the answer is not present in the data, reply exactly: "I don't have enough data to answer that accurately."

Answer style requirements:
- Use clear short paragraphs.
- Use bullet points only when listing multiple items.
- Be concise, specific, and factual.

Guidance for common question types:
- Timeline questions ("when did X happen") must reference phase periods and milestone dates.
- Contributor questions ("who worked on X") must reference contributor stats and touched areas when available.
- Feature questions ("when was X introduced") should rely on phase key activities and milestone descriptions.
- Scale questions ("how big is this project") should reference total commits and line changes.
- Health/activity questions should use phase mood and temporal patterns in available data.

=== REPOSITORY ANALYSIS CONTEXT ===
${contextText}
===================================`;

  const messages = [
    ...trimmedHistory,
    { role: 'user', content: userQuestion }
  ];

  try {
    const reply = await callGroq({
      systemPrompt,
      messages,
      json: false,
      max_tokens: 2000
    });

    return String(reply || '').trim();
  } catch (error) {
    if (error?.code === 'SESSION_NOT_FOUND') {
      throw error;
    }

    console.error('chatAgent error:', error);
    throw new Error('AI is temporarily unavailable. Please try again.');
  }
}
