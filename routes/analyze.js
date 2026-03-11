import express from 'express';
import { z } from 'zod';
import { analyzePipeline } from '../pipeline.js';
import { getCachedAnalysis, listStoredRepositories, storeAnalysisResult } from '../utils/repositoryCache.js';
import { normalizeRepoUrl } from '../git/repositoryState.js';

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
const analyzeRequestSchema = z.object({
  repoUrl: z.string().url('Invalid URL format'),
  forceSync: z.union([z.boolean(), z.string()]).optional().default(false)
});

function parseForceSync(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return false;
}

async function resolveAnalysis(repoUrl, options = {}) {
  const { forceSync = false, progressCallback = null } = options;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);

  if (!forceSync) {
    const cached = await getCachedAnalysis(repoUrl, { checkSync: true });

    if (cached) {
      return cached.result;
    }
  }

  if (inFlightAnalysis.has(normalizedRepoUrl)) {
    console.log(`Reusing in-flight analysis for: ${normalizedRepoUrl}`);
    return inFlightAnalysis.get(normalizedRepoUrl);
  }

  const analysisPromise = analyzePipeline(repoUrl, progressCallback)
    .then((result) => storeAnalysisResult(repoUrl, result).then(({ result: storedResult }) => storedResult))
    .finally(() => {
      inFlightAnalysis.delete(normalizedRepoUrl);
    });

  inFlightAnalysis.set(normalizedRepoUrl, analysisPromise);
  return analysisPromise;
}

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
    const validation = analyzeRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }
    
    const { repoUrl } = validation.data;
    const forceSync = parseForceSync(validation.data.forceSync);
    const normalizedRepoUrl = repoUrl.trim();
    
    console.log(`Analyzing repository: ${normalizedRepoUrl}`);

    const result = await resolveAnalysis(normalizedRepoUrl, { forceSync });
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
    const validation = analyzeRequestSchema.safeParse(req.query);

    if (!validation.success) {
      writeSse(res, { step: 'error', message: 'Invalid URL format' });
      return;
    }

    const normalizedRepoUrl = validation.data.repoUrl.trim();
    const forceSync = parseForceSync(validation.data.forceSync);
    console.log(`Streaming analysis for repository: ${normalizedRepoUrl}`);

    const result = await resolveAnalysis(normalizedRepoUrl, {
      forceSync,
      progressCallback: (progress) => {
        if (clientDisconnected || progress?.step === 'complete' || progress?.step === 'error') {
          return;
        }

        writeSse(res, {
          ...progress,
          percent: getProgressPercent(progress)
        });
      }
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

router.get('/repositories', async (req, res, next) => {
  try {
    const repositories = await listStoredRepositories();
    res.json({ repositories });
  } catch (error) {
    next(error);
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
