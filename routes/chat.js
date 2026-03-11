import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { chatAgent } from '../agents/chatAgent.js';

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please try again in a minute.' }
});

const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string()
});

const chatSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
  message: z.string().trim().min(1, 'message is required').max(1000, 'message must be 1000 characters or fewer'),
  history: z.array(historyMessageSchema)
});

router.post('/chat', chatLimiter, async (req, res) => {
  const validation = chatSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues[0]?.message || 'Validation failed' });
  }

  const { sessionId, message, history } = validation.data;

  try {
    const reply = await chatAgent(sessionId, message, history);
    return res.json({ reply });
  } catch (err) {
    if (err?.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'Session not found. Please re-analyze the repository.' });
    }

    return res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

export default router;
