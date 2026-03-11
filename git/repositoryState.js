import simpleGit from 'simple-git';

export function normalizeRepoUrl(repoUrl) {
  const trimmed = String(repoUrl || '').trim();

  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return trimmed.replace(/\.git$/i, '').replace(/\/+$/, '');
  }
}

export function parseRepositoryIdentity(repoUrl) {
  try {
    const parsed = new URL(repoUrl);
    const segments = parsed.pathname.replace(/\.git$/i, '').split('/').filter(Boolean);

    return {
      provider: parsed.hostname.toLowerCase(),
      repoOwner: segments[0] || null,
      repoName: segments[1] || null,
    };
  } catch {
    return {
      provider: null,
      repoOwner: null,
      repoName: null,
    };
  }
}

export async function getRemoteHeadCommit(repoUrl) {
  try {
    const git = simpleGit();
    const response = await git.listRemote([repoUrl, 'HEAD']);
    const [line] = response.split('\n').map((entry) => entry.trim()).filter(Boolean);

    if (!line) {
      return { hash: null, ref: 'HEAD' };
    }

    const [hash, ref] = line.split(/\s+/);
    return {
      hash: hash || null,
      ref: ref || 'HEAD',
    };
  } catch (error) {
    console.warn(`Unable to resolve remote HEAD for ${repoUrl}:`, error.message);
    return {
      hash: null,
      ref: 'HEAD',
      error: error.message,
    };
  }
}