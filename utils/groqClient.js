import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

let quotaCooldownUntilMs = 0;

export async function callGroq(prompt, systemPrompt = 'You are a helpful assistant that responds ONLY with valid JSON. No markdown, no explanations, just pure JSON.', retries = 2) {
  if (Date.now() < quotaCooldownUntilMs) {
    const retryInMs = quotaCooldownUntilMs - Date.now();
    throw createQuotaCooldownError(retryInMs);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Calling Groq API (attempt ${attempt + 1}/${retries + 1})...`);
      
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 2000,
      });
      
      let responseText = completion.choices[0]?.message?.content || '{}';
      
      // Strip markdown code fences if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Parse JSON
      try {
        const parsed = JSON.parse(responseText);
        console.log('Successfully parsed Groq response');
        return parsed;
      } catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        console.error('Raw response:', responseText.substring(0, 200));
        
        if (attempt < retries) {
          const delayMs = getRetryDelayMs(parseError, attempt);
          console.log(`Retrying after ${delayMs}ms...`);
          await sleep(delayMs);
          continue;
        }
        
        throw new Error(`Failed to parse JSON response after ${retries + 1} attempts`);
      }
      
    } catch (error) {
      if (isNonRetryableRateLimit(error)) {
        quotaCooldownUntilMs = Date.now() + getRetryDelayMs(error, attempt);
        throw createQuotaCooldownError(quotaCooldownUntilMs - Date.now(), error);
      }

      if (attempt < retries) {
        const delayMs = getRetryDelayMs(error, attempt);
        console.log(`Error on attempt ${attempt + 1}, retrying after ${delayMs}ms...`);
        await sleep(delayMs);
        continue;
      }
      
      throw error;
    }
  }
}

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(error, attempt) {
  const headers = error?.response?.headers;
  const retryAfterRaw = headers?.['retry-after'];
  const retryAfterSeconds = Number.parseInt(retryAfterRaw, 10);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const status = error?.status || error?.response?.status;
  const baseMs = status === 429 ? 2000 : 800;
  const exponentialMs = baseMs * Math.pow(2, attempt);
  const jitterMs = Math.floor(Math.random() * 250);
  return exponentialMs + jitterMs;
}

function isNonRetryableRateLimit(error) {
  const status = error?.status || error?.response?.status;
  if (status !== 429) {
    return false;
  }

  const shouldRetryHeader = String(error?.headers?.['x-should-retry'] || error?.response?.headers?.['x-should-retry'] || '').toLowerCase();
  const isExplicitNoRetry = shouldRetryHeader === 'false';
  const apiError = error?.error?.error || error?.response?.data?.error;
  const isTokenQuota = apiError?.type === 'tokens' || apiError?.code === 'rate_limit_exceeded';

  return isExplicitNoRetry || isTokenQuota;
}

function createQuotaCooldownError(retryInMs, originalError = null) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryInMs / 1000));
  const error = new Error(`Groq token quota temporarily exhausted. Using fallback responses. Retry after about ${retryAfterSeconds}s.`);
  error.code = 'GROQ_QUOTA_COOLDOWN';
  error.retryAfterMs = retryInMs;
  if (originalError) {
    error.cause = originalError;
  }
  return error;
}
