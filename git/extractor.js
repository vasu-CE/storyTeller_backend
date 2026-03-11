import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Optional depth cap — set GIT_MAX_COMMITS env var for shallow analysis on huge repos.
// Default is 0 (no limit) to capture the entire Git history.
const GIT_MAX_COMMITS = parseInt(process.env.GIT_MAX_COMMITS || '0', 10);

export async function extractCommits(repoUrl) {
  const tempDir = path.join(os.tmpdir(), `git-repo-${Date.now()}`);

  try {
    console.log(`Cloning repository: ${repoUrl}`);
    const git = simpleGit();

    // Clone the full history unless a cap is configured via GIT_MAX_COMMITS.
    const cloneArgs = [];
    if (GIT_MAX_COMMITS > 0) {
      cloneArgs.push('--depth', String(GIT_MAX_COMMITS));
    }
    await git.clone(repoUrl, tempDir, cloneArgs);

    const repoGit = simpleGit(tempDir);

    const logOptions = { '--all': null, '--date': 'iso' };
    if (GIT_MAX_COMMITS > 0) {
      logOptions['--max-count'] = GIT_MAX_COMMITS;
    }
    const log = await repoGit.log(logOptions);

    const commits = [];
    for (const commit of log.all) {
      const stats = await repoGit.show(['--numstat', '--format=', commit.hash]);
      const nameStatus = await repoGit.show(['--name-status', '--format=', commit.hash]);
      const files = parseGitStats(stats);
      const statusEntries = parseGitNameStatus(nameStatus);
      const allFiles = files.map(f => f.file);
      const totalInsertions = files.reduce((sum, f) => sum + f.insertions, 0);
      const totalDeletions  = files.reduce((sum, f) => sum + f.deletions, 0);

      commits.push({
        hash: commit.hash,
        message: commit.message,
        author: { name: commit.author_name, email: commit.author_email },
        date: commit.date,
        filesChanged: files.length,
        insertions: totalInsertions,
        deletions: totalDeletions,
        files: allFiles,
        fileStatus: statusEntries,
        architecturalSignals: detectArchitecturalSignals(
          allFiles, commit.message, totalInsertions, totalDeletions, files.length
        ),
        fileTypes: categorizeFileTypes(allFiles),
        codeChangeInterpretation: interpretCodeChange(
          allFiles,
          statusEntries,
          commit.message,
          totalInsertions,
          totalDeletions,
          files.length
        ),
      });
    }

    console.log(`Extracted ${commits.length} commits`);

    // Derive first-occurrence events across the full sorted history.
    const firstOccurrences = detectFirstOccurrences(commits);

    let branches = [];
    try {
      const branchResult = await repoGit.branch();
      branches = branchResult.all || [];
    } catch (e) {
      console.warn('Could not extract branches:', e.message);
    }

    let tags = [];
    try {
      const tagResult = await repoGit.tags();
      tags = tagResult.all || [];
    } catch (e) {
      console.warn('Could not extract tags:', e.message);
    }

    return { commits, branches, tags, totalCommits: commits.length, firstOccurrences };

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
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('Cleaned up temporary directory');
    } catch (e) {
      console.warn('Failed to clean up temp directory:', e.message);
    }
  }
}

function detectArchitecturalSignals(files, message, insertions, deletions, filesChanged) {
  const signals = new Set();
  const msg = (message || '').toLowerCase();

  for (const file of files) {
    const lower = (file || '').toLowerCase();

    if (
      lower.endsWith('package.json') || lower.endsWith('requirements.txt') ||
      lower.endsWith('pom.xml') || lower.endsWith('go.mod') ||
      lower.endsWith('cargo.toml') || lower.endsWith('gemfile') ||
      lower.endsWith('build.gradle') || lower.endsWith('pyproject.toml')
    ) {
      signals.add('dependency_change');
    }

    if (
      lower.includes('.github/workflows') || lower.includes('jenkinsfile') ||
      lower.includes('.gitlab-ci') || lower.includes('.travis.yml') ||
      lower.includes('.circleci') || lower.includes('azure-pipelines')
    ) {
      signals.add('ci_cd');
    }

    if (
      lower.includes('dockerfile') || lower.includes('docker-compose') ||
      lower.includes('.dockerignore')
    ) {
      signals.add('containerization');
    }

    if (
      lower.endsWith('.sql') || lower.includes('/migrations/') ||
      lower.includes('migration') || lower.endsWith('.prisma') ||
      lower.includes('/schema/') || lower.includes('alembic')
    ) {
      signals.add('database_migration');
    }

    if (
      lower.includes('/test') || lower.includes('/spec') ||
      lower.endsWith('.test.js') || lower.endsWith('.spec.ts') ||
      lower.endsWith('.test.ts') || lower.endsWith('.test.py') ||
      lower.includes('jest.config') || lower.includes('vitest') ||
      lower.includes('cypress') || lower.includes('playwright')
    ) {
      signals.add('testing');
    }

    if (
      lower.includes('k8s') || lower.includes('kubernetes') ||
      lower.endsWith('.tf') || lower.includes('terraform') ||
      lower.includes('helm') || lower.includes('ansible')
    ) {
      signals.add('infrastructure_as_code');
    }

    if (
      lower.includes('security') || lower.includes('oauth') ||
      lower.includes('jwt') || lower.includes('auth') ||
      lower.includes('permission') || lower.includes('rbac') ||
      lower.includes('cors') || lower.includes('csp')
    ) {
      signals.add('security');
    }

    if (
      lower.endsWith('readme.md') || lower.includes('changelog') ||
      lower.includes('/docs/') || lower.includes('contributing')
    ) {
      signals.add('documentation');
    }
  }

  // Message-based signals
  if (/refactor|rewrit|restructur|reorganiz|rearchitect|overhaul/i.test(msg)) {
    signals.add('refactoring');
  }
  if (/\bbreaking[ -]change\b|break.*api|remove.*endpoint|deprecat.*api|\[breaking\]/i.test(msg)) {
    signals.add('breaking_change');
  }
  if (/security|cve-?\d+|xss|sql.*inject|csrf|vulnerabilit|exploit/i.test(msg)) {
    signals.add('security_fix');
  }
  if (/performance|optim|speed.?up|latency|throughput|cache/i.test(msg)) {
    signals.add('performance');
  }
  if (/release|version|v\d+\.\d+|changelog|deploy/i.test(msg)) {
    signals.add('release');
  }
  if (/^(init|initial commit|bootstrap|scaffold|setup|create project)/i.test(msg)) {
    signals.add('foundation');
  }

  // Structural mass change
  if (deletions > 200 && insertions > 200 && filesChanged > 10) {
    signals.add('large_scale_change');
  }

  return [...signals];
}

// ---------------------------------------------------------------------------
// File type categorisation per commit
// ---------------------------------------------------------------------------

function categorizeFileTypes(files) {
  const types = { frontend: 0, backend: 0, tests: 0, config: 0, docs: 0, infra: 0, database: 0, styles: 0 };

  for (const file of files) {
    const lower = (file || '').toLowerCase();

    if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass') || lower.endsWith('.less')) {
      types.styles++;
    } else if (lower.includes('test') || lower.includes('spec')) {
      types.tests++;
    } else if (lower.endsWith('.md') || lower.includes('/docs/') || lower.includes('readme')) {
      types.docs++;
    } else if (
      lower.includes('docker') || lower.includes('.github') || lower.includes('k8s') ||
      lower.includes('terraform') || lower.endsWith('.yml') || lower.endsWith('.yaml')
    ) {
      types.infra++;
    } else if (lower.endsWith('.sql') || lower.includes('migration') || lower.endsWith('.prisma') || lower.includes('/schema')) {
      types.database++;
    } else if (
      lower.endsWith('package.json') || lower.endsWith('.config.js') || lower.endsWith('.config.ts') ||
      lower.endsWith('.env.example') || lower.endsWith('.editorconfig') || lower.endsWith('.eslintrc') ||
      lower.endsWith('.gitignore') || lower.endsWith('tsconfig.json') || lower.endsWith('.babelrc')
    ) {
      types.config++;
    } else if (
      lower.endsWith('.jsx') || lower.endsWith('.tsx') || lower.endsWith('.vue') || lower.endsWith('.svelte') ||
      lower.includes('/components/') || lower.includes('/pages/') || lower.includes('/views/')
    ) {
      types.frontend++;
    } else if (
      lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.py') || lower.endsWith('.go') ||
      lower.endsWith('.rs') || lower.endsWith('.java') || lower.endsWith('.rb') || lower.endsWith('.php') ||
      lower.endsWith('.cs') || lower.endsWith('.cpp') || lower.endsWith('.c') || lower.endsWith('.h')
    ) {
      types.backend++;
    }
  }

  return types;
}

// ---------------------------------------------------------------------------
// First-occurrence tracking across full history
// ---------------------------------------------------------------------------

const TRACKABLE_SIGNALS = [
  'ci_cd', 'containerization', 'database_migration', 'testing',
  'infrastructure_as_code', 'security', 'breaking_change', 'refactoring',
  'performance', 'release', 'large_scale_change', 'dependency_change',
  'security_fix', 'foundation',
];

function detectFirstOccurrences(commits) {
  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstOccurrences = {};

  for (const commit of sorted) {
    for (const signal of (commit.architecturalSignals || [])) {
      if (TRACKABLE_SIGNALS.includes(signal) && !firstOccurrences[signal]) {
        firstOccurrences[signal] = {
          date: commit.date,
          hash: commit.hash,
          message: commit.message,
          author: commit.author?.name,
        };
      }
    }
  }

  return firstOccurrences;
}

// ---------------------------------------------------------------------------
// Git numstat parser
// ---------------------------------------------------------------------------

function parseGitStats(stats) {
  const lines = stats.trim().split('\n').filter(line => line.trim());
  const files = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      files.push({
        file: parts[2],
        insertions: parseInt(parts[0]) || 0,
        deletions: parseInt(parts[1]) || 0,
      });
    }
  }

  return files;
}

function parseGitNameStatus(output) {
  const lines = String(output || '').trim().split('\n').filter(line => line.trim());
  const entries = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const rawStatus = parts[0];
    const status = rawStatus[0];

    if ((status === 'R' || status === 'C') && parts.length >= 3) {
      entries.push({
        status,
        score: parseInt(rawStatus.slice(1), 10) || null,
        from: parts[1],
        to: parts[2],
        file: parts[2],
      });
      continue;
    }

    entries.push({
      status,
      score: null,
      from: null,
      to: parts[1],
      file: parts[1],
    });
  }

  return entries;
}

function interpretCodeChange(files, statusEntries, message, insertions, deletions, filesChanged) {
  const categories = new Set();
  const msg = String(message || '').toLowerCase();

  const added = statusEntries.filter((f) => f.status === 'A');
  const renamedOrCopied = statusEntries.filter((f) => f.status === 'R' || f.status === 'C');
  const deleted = statusEntries.filter((f) => f.status === 'D');

  const addedComponentLike = added.filter(({ file }) => {
    const lower = String(file || '').toLowerCase();
    return (
      lower.includes('/components/') ||
      lower.includes('/modules/') ||
      lower.includes('/services/') ||
      lower.includes('/features/') ||
      /component|module|service|feature/.test(lower)
    );
  });

  if (addedComponentLike.length > 0 || /introduc|implement|new module|new component|bootstrap/.test(msg)) {
    categories.add('new_module_or_component_introduction');
  }

  const refactorMessage = /refactor|rewrite|re-?architect|overhaul|cleanup|rework/.test(msg);
  const heavyChange = filesChanged >= 12 && insertions + deletions >= 400;
  if (refactorMessage || heavyChange) {
    categories.add('large_scale_refactoring');
  }

  if (renamedOrCopied.length >= 2 || (deleted.length >= 3 && added.length >= 3) || /restructure|reorganize|move files?|folder layout/.test(msg)) {
    categories.add('file_restructuring');
  }

  const configTouched = files.some((file) => {
    const lower = String(file || '').toLowerCase();
    return (
      lower.endsWith('.json') ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.yml') ||
      lower.endsWith('.toml') ||
      lower.endsWith('.ini') ||
      lower.endsWith('.env') ||
      lower.endsWith('.env.example') ||
      lower.includes('config') ||
      lower.includes('settings') ||
      lower.endsWith('package.json') ||
      lower.endsWith('tsconfig.json') ||
      lower.endsWith('eslint.config.js')
    );
  });
  if (configTouched) {
    categories.add('configuration_updates');
  }

  const testAdded = added.some(({ file }) => {
    const lower = String(file || '').toLowerCase();
    return (
      lower.includes('/test') ||
      lower.includes('/spec') ||
      lower.endsWith('.test.js') ||
      lower.endsWith('.spec.js') ||
      lower.endsWith('.test.ts') ||
      lower.endsWith('.spec.ts') ||
      lower.endsWith('.test.py') ||
      lower.endsWith('.spec.py')
    );
  });
  if (testAdded || /add.*test|test suite|coverage/.test(msg)) {
    categories.add('test_suite_additions');
  }

  const infraTouched = files.some((file) => {
    const lower = String(file || '').toLowerCase();
    return (
      lower.includes('.github/workflows') ||
      lower.includes('dockerfile') ||
      lower.includes('docker-compose') ||
      lower.includes('jenkinsfile') ||
      lower.includes('pipeline') ||
      lower.includes('k8s') ||
      lower.includes('terraform') ||
      lower.includes('helm') ||
      lower.includes('.gitlab-ci') ||
      lower.includes('build.gradle') ||
      lower.includes('pom.xml')
    );
  });
  if (infraTouched) {
    categories.add('infrastructure_or_build_system_changes');
  }

  const impactSummary = summarizeChangeImpact({ categories: [...categories], filesChanged, insertions, deletions, renamedCount: renamedOrCopied.length, testAdded });

  return {
    categories: [...categories],
    impactSummary,
    metrics: {
      filesChanged,
      insertions,
      deletions,
      addedFiles: added.length,
      deletedFiles: deleted.length,
      renamedOrCopied: renamedOrCopied.length,
    },
  };
}

function summarizeChangeImpact({ categories, filesChanged, insertions, deletions, renamedCount, testAdded }) {
  const parts = [];

  if (categories.includes('new_module_or_component_introduction')) {
    parts.push('Introduced new functional surface area, expanding system capabilities.');
  }
  if (categories.includes('large_scale_refactoring')) {
    parts.push('Reshaped significant code paths to improve maintainability and long-term evolvability.');
  }
  if (categories.includes('file_restructuring')) {
    parts.push('Reorganized repository structure to improve discoverability and ownership boundaries.');
  }
  if (categories.includes('configuration_updates')) {
    parts.push('Adjusted runtime/build configuration, likely altering deployment or behavior defaults.');
  }
  if (categories.includes('test_suite_additions')) {
    parts.push('Increased verification coverage, reducing regression risk in future iterations.');
  }
  if (categories.includes('infrastructure_or_build_system_changes')) {
    parts.push('Changed delivery/tooling infrastructure, affecting release reliability and automation.');
  }

  if (parts.length === 0) {
    if (filesChanged >= 8 || insertions + deletions >= 250) {
      return 'Made broad cross-cutting updates with moderate to high system impact.';
    }
    return 'Applied focused incremental changes with localized system impact.';
  }

  const quantitativeTail = `Scope: ${filesChanged} files, +${insertions}/-${deletions} lines${renamedCount ? `, ${renamedCount} moved/renamed` : ''}${testAdded ? ', test coverage expanded' : ''}.`;
  return `${parts.join(' ')} ${quantitativeTail}`;
}
