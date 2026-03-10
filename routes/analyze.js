import express from 'express';
import { z } from 'zod';
import { analyzePipeline } from '../pipeline.js';

const router = express.Router();
const inFlightAnalysis = new Map();

// Validation schema
const repoUrlSchema = z.object({
  repoUrl: z.string().url('Invalid URL format')
});

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
