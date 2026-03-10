import express from 'express';
import { z } from 'zod';
import { analyzePipeline } from '../pipeline.js';

const router = express.Router();
const inFlightAnalysis = new Map();
const STEP_PROGRESS = {
  extracting: 10,
  chunking: 25,
  phase: 50,
  milestones: 75,
  narrative: 85,
  contributors: 95,
  complete: 100
};

// Validation schema
const repoUrlSchema = z.object({
  repoUrl: z.string().url('Invalid URL format')
});

function getProgressPercent(progress) {
  if (progress?.step === 'phase') {
    const current = Number(progress.current);
    const total = Number(progress.total);

    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return Math.round((current / total) * 30) + 25;
    }
  }

  return STEP_PROGRESS[progress?.step] || 0;
}

function writeSse(res, payload) {
  if (res.writableEnded) {
    return;
  }

  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post('/analyze', async (req, res) => {
  try {
    // Validate request body
    const validation = repoUrlSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }
    
    const { repoUrl } = validation.data;
    const normalizedRepoUrl = repoUrl.trim();
    
    console.log(`Analyzing repository: ${normalizedRepoUrl}`);
    
    if (inFlightAnalysis.has(normalizedRepoUrl)) {
      console.log(`Reusing in-flight analysis for: ${normalizedRepoUrl}`);
      const existingResult = await inFlightAnalysis.get(normalizedRepoUrl);
      return res.json(existingResult);
    }
    
    // Run analysis pipeline
    const analysisPromise = analyzePipeline(normalizedRepoUrl)
      .finally(() => {
        inFlightAnalysis.delete(normalizedRepoUrl);
      });

    inFlightAnalysis.set(normalizedRepoUrl, analysisPromise);

    const result = await analysisPromise;
    res.json(result);
    
  } catch (error) {
    console.error('Analysis error:', error);
    
    const statusCode = error.message.includes('not found') || 
                       error.message.includes('private') ? 404 :
                       error.message.includes('too few commits') ? 400 : 500;
    
    res.status(statusCode).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

router.get('/analyze-stream', async (req, res) => {
  let clientDisconnected = false;

  const handleClose = () => {
    clientDisconnected = true;
    console.log('Analysis stream client disconnected');
  };

  req.on('close', handleClose);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    const validation = repoUrlSchema.safeParse(req.query);

    if (!validation.success) {
      writeSse(res, { step: 'error', message: 'Invalid URL format' });
      return;
    }

    const normalizedRepoUrl = validation.data.repoUrl.trim();
    console.log(`Streaming analysis for repository: ${normalizedRepoUrl}`);

    const result = await analyzePipeline(normalizedRepoUrl, (progress) => {
      if (clientDisconnected || progress?.step === 'complete' || progress?.step === 'error') {
        return;
      }

      writeSse(res, {
        ...progress,
        percent: getProgressPercent(progress)
      });
    });

    if (!clientDisconnected) {
      writeSse(res, {
        step: 'complete',
        message: 'Analysis complete!',
        percent: STEP_PROGRESS.complete,
        result
      });
    }
  } catch (error) {
    console.error('Stream analysis error:', error);

    if (!clientDisconnected) {
      writeSse(res, {
        step: 'error',
        message: error.message
      });
    }
  } finally {
    req.off('close', handleClose);

    if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    groqApiConfigured: !!process.env.GROQ_API_KEY
  });
});

export default router;
