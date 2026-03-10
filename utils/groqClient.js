import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export async function callGroq(prompt, systemPrompt = 'You are a helpful assistant that responds ONLY with valid JSON. No markdown, no explanations, just pure JSON.', retries = 2) {
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
          console.log('Retrying...');
          await sleep(300); // Delay before retry
          continue;
        }
        
        throw new Error(`Failed to parse JSON response after ${retries + 1} attempts`);
      }
      
    } catch (error) {
      if (attempt < retries) {
        console.log(`Error on attempt ${attempt + 1}, retrying...`);
        await sleep(300);
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
