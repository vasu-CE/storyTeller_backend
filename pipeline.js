import { extractCommits } from './git/extractor.js';
import { chunkCommits } from './utils/chunkCommits.js';
import { classifyCommits, detectArchitecturalChanges, detectStabilizationPeriods, calculateCommitVelocity } from './utils/commitClassifier.js';
import { analyzePhase } from './agents/phaseAgent.js';
import { detectMilestones } from './agents/milestoneAgent.js';
import { generateNarrative } from './agents/narrativeAgent.js';
import { analyzeContributors } from './agents/contributorAgent.js';
import crypto from 'crypto';

export async function analyzePipeline(repoUrl, progressCallback = null) {
  try {
    // Step 1: Extract commits
    if (progressCallback) {
      progressCallback({ step: 'extracting', message: 'Cloning repository and extracting commits...' });
    }
    
    const { commits, branches, tags, totalCommits, firstOccurrences } = await extractCommits(repoUrl);
    const commitCount = Number.isFinite(totalCommits) ? totalCommits : commits.length;
    
    if (!commits || commits.length === 0) {
      throw new Error('No commits found in repository');
    }
    
    if (commitCount < 5) {
      throw new Error('Repository has too few commits for meaningful analysis (minimum 5 required)');
    }
    
    // Step 2: Chunk commits
    if (progressCallback) {
      progressCallback({ step: 'chunking', message: `Processing ${commitCount} commits...` });
    }
    
    const chunks = chunkCommits(commits);
    console.log(`Created ${chunks.length} chunks`);
    
    // Step 3: Classify commits
    const classification = classifyCommits(commits);
    
    // Step 4: Analyze phases (process each chunk)
    const phases = [];
    for (let i = 0; i < chunks.length; i++) {
      if (progressCallback) {
        progressCallback({
          step: 'phase',
          current: i + 1,
          total: chunks.length,
          message: `Analyzing phase ${i + 1} of ${chunks.length}...`
        });
      }
      
      const phase = await analyzePhase(chunks[i]);
      phases.push(phase);
      
      // Small delay to avoid rate limiting
      await sleep(300);
    }
    
    // Step 5: Detect milestones
    if (progressCallback) {
      progressCallback({ step: 'milestones', message: 'Detecting major milestones...' });
    }
    
    const milestones = await detectMilestones(phases, commits, {
      tags,
      firstOccurrences,
      classification,
    });
    await sleep(300);
    
    // Step 6: Generate narrative
    if (progressCallback) {
      progressCallback({ step: 'narrative', message: 'Writing project story...' });
    }
    
    // Step 7: Contributors (must run before narrative to provide collaboration context)
    if (progressCallback) {
      progressCallback({ step: 'contributors', message: 'Analyzing contributors...' });
    }
    
    const contributors = await analyzeContributors(commits);
    await sleep(300);

    // Step 6 (deferred): Generate narrative with full enriched context
    if (progressCallback) {
      progressCallback({ step: 'narrative', message: 'Writing project story...' });
    }

    // Generate narrative with full enriched context: contributors, classification, firstOccurrences
    const narrative = await generateNarrative(phases, milestones, {
      contributors,
      classification,
      firstOccurrences,
    });
    
    // Compile final result
    const repoMeta = {
      url: repoUrl,
      totalCommits: commitCount,
      latestCommitHash: commits[0]?.hash || null,
      branches,
      tags,
      analyzedAt: new Date().toISOString()
    };

    const sessionId = crypto.randomUUID();
    const result = {
      sessionId,
      repoMeta,
      repository: repoMeta,
      commits,
      narrative,
      phases,
      milestones,
      contributors,
      classification: classification.summary,
      architecturalChanges: classification.architecturalChanges,
      stabilizationPeriods: classification.stabilizationPeriods,
      velocityData: classification.velocityData,
      codeChangeInterpretation: classification.codeChangeInterpretation,
      firstOccurrences,
    };
    
    if (progressCallback) {
      progressCallback({ step: 'complete', message: 'Analysis complete!', result });
    }
    
    return result;
    
  } catch (error) {
    console.error('Pipeline error:', error);
    
    if (progressCallback) {
      progressCallback({ step: 'error', message: error.message });
    }
    
    throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
