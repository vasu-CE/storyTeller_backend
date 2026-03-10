import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import os from 'os';

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function extractCommits(repoUrl) {
  const tempDir = path.join(os.tmpdir(), `git-repo-${Date.now()}`);
  
  try {
    console.log(`Cloning repository: ${repoUrl}`);
    const git = simpleGit();
    
    // Clone the repository
    await git.clone(repoUrl, tempDir, ['--depth', '500']); // Limit depth for faster cloning
    
    const repoGit = simpleGit(tempDir);
    
    // Get commit log with detailed information
    const log = await repoGit.log({
      '--all': null,
      '--numstat': null,
      '--date': 'iso',
    });
    
    // Extract detailed commit information
    const commits = [];
    for (const commit of log.all) {
      const stats = await repoGit.show([
        '--numstat',
        '--format=',
        commit.hash
      ]);
      
      const files = parseGitStats(stats);
      
      commits.push({
        hash: commit.hash,
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email
        },
        date: commit.date,
        filesChanged: files.length,
        insertions: files.reduce((sum, f) => sum + f.insertions, 0),
        deletions: files.reduce((sum, f) => sum + f.deletions, 0),
        files: files.map(f => f.file)
      });
    }
    
    console.log(`Extracted ${commits.length} commits`);
    
    // Try to get  branches
    let branches = [];
    try {
      const branchResult = await repoGit.branch();
      branches = branchResult.all || [];
    } catch (e) {
      console.warn('Could not extract branches:', e.message);
    }
    
    // Try to get tags
    let tags = [];
    try {
      const tagResult = await repoGit.tags();
      tags = tagResult.all || [];
    } catch (e) {
      console.warn('Could not extract tags:', e.message);
    }
    
    return {
      commits,
      branches,
      tags,
      totalCommits: commits.length
    };
    
  } catch (error) {
    console.error('Error extracting commits:', error);
    
    if (error.message.includes('not found') || error.message.includes('404')) {
      throw new Error('Repository not found or is private');
    }
    if (error.message.includes('Authentication')) {
      throw new Error('Repository requires authentication');
    }
    throw new Error(`Failed to clone repository: ${error.message}`);
    
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('Cleaned up temporary directory');
    } catch (e) {
      console.warn('Failed to clean up temp directory:', e.message);
    }
  }
}

/**
 * Parse git numstat output
 * @param {string} stats - Raw numstat output 
 * @returns {Array} Array of file change objects
 */
function parseGitStats(stats) {
  const lines = stats.trim().split('\n').filter(line => line.trim());
  const files = [];
  
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const insertions = parseInt(parts[0]) || 0;
      const deletions = parseInt(parts[1]) || 0;
      const file = parts[2];
      
      files.push({
        file,
        insertions,
        deletions
      });
    }
  }
  
  return files;
}
