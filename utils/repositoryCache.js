import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { normalizeRepoUrl, parseRepositoryIdentity, getRemoteHeadCommit } from '../git/repositoryState.js';
import { saveContext } from '../store/contextStore.js';

function toDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getTotalContributors(analysisResult) {
  const contributorPayload = analysisResult?.contributors;

  if (typeof contributorPayload?.totalContributors === 'number') {
    return contributorPayload.totalContributors;
  }

  if (Array.isArray(contributorPayload?.contributors)) {
    return contributorPayload.contributors.length;
  }

  if (Array.isArray(contributorPayload)) {
    return contributorPayload.length;
  }

  return 0;
}

function buildCacheMetadata(record, source) {
  const analyzedHeadHash = record.analyzedHeadHash || null;
  const latestHeadHash = record.lastKnownHeadHash || analyzedHeadHash || null;
  const isStale = Boolean(analyzedHeadHash && latestHeadHash && analyzedHeadHash !== latestHeadHash);

  return {
    source,
    repositoryId: record.id,
    normalizedRepoUrl: record.normalizedRepoUrl,
    analyzedAt: toIsoString(record.analyzedAt),
    analyzedHeadHash,
    latestHeadHash,
    lastCheckedAt: toIsoString(record.lastCheckedAt),
    syncStatus: isStale ? 'stale' : 'synchronized',
    needsSync: isStale,
  };
}

function stripEphemeralFields(analysisResult) {
  if (!analysisResult || typeof analysisResult !== 'object') {
    return analysisResult;
  }

  const { sessionId, cache, ...persisted } = analysisResult;
  return persisted;
}

function createSessionResult(analysisData, cacheMetadata) {
  const sessionId = crypto.randomUUID();
  const result = {
    ...analysisData,
    sessionId,
    cache: cacheMetadata,
  };

  saveContext(sessionId, result);
  return result;
}

export async function getCachedAnalysis(repoUrl, options = {}) {
  const { checkSync = true } = options;
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);

  if (!normalizedRepoUrl) {
    return null;
  }

  let record = await prisma.repositoryAnalysis.findUnique({
    where: { normalizedRepoUrl },
  });

  if (!record) {
    return null;
  }

  if (checkSync) {
    const remoteHead = await getRemoteHeadCommit(record.repoUrl);

    record = await prisma.repositoryAnalysis.update({
      where: { id: record.id },
      data: {
        lastCheckedAt: new Date(),
        lastKnownHeadHash: remoteHead.hash || record.lastKnownHeadHash,
      },
    });
  }

  const cacheMetadata = buildCacheMetadata(record, 'database');
  return {
    record,
    result: createSessionResult(record.analysisData, cacheMetadata),
  };
}

export async function storeAnalysisResult(repoUrl, analysisResult) {
  const normalizedRepoUrl = normalizeRepoUrl(repoUrl);
  const identity = parseRepositoryIdentity(repoUrl);
  const commits = Array.isArray(analysisResult?.commits) ? analysisResult.commits : [];
  const latestCommitHash =
    analysisResult?.repository?.latestCommitHash ||
    analysisResult?.repoMeta?.latestCommitHash ||
    commits[0]?.hash ||
    null;
  const firstCommitAt = toDate(commits[commits.length - 1]?.date);
  const lastCommitAt = toDate(commits[0]?.date);
  const analyzedAt = toDate(analysisResult?.repository?.analyzedAt || analysisResult?.repoMeta?.analyzedAt) || new Date();
  const persistedAnalysis = stripEphemeralFields(analysisResult);

  const record = await prisma.repositoryAnalysis.upsert({
    where: { normalizedRepoUrl },
    create: {
      normalizedRepoUrl,
      repoUrl,
      provider: identity.provider,
      repoOwner: identity.repoOwner,
      repoName: identity.repoName,
      totalCommits: analysisResult?.repository?.totalCommits || analysisResult?.repoMeta?.totalCommits || 0,
      totalContributors: getTotalContributors(analysisResult),
      firstCommitAt,
      lastCommitAt,
      analyzedAt,
      analyzedHeadHash: latestCommitHash,
      lastKnownHeadHash: latestCommitHash,
      lastCheckedAt: analyzedAt,
      analysisData: persistedAnalysis,
    },
    update: {
      repoUrl,
      provider: identity.provider,
      repoOwner: identity.repoOwner,
      repoName: identity.repoName,
      totalCommits: analysisResult?.repository?.totalCommits || analysisResult?.repoMeta?.totalCommits || 0,
      totalContributors: getTotalContributors(analysisResult),
      firstCommitAt,
      lastCommitAt,
      analyzedAt,
      analyzedHeadHash: latestCommitHash,
      lastKnownHeadHash: latestCommitHash,
      lastCheckedAt: analyzedAt,
      analysisData: persistedAnalysis,
    },
  });

  const cacheMetadata = buildCacheMetadata(record, 'fresh-analysis');
  return {
    record,
    result: createSessionResult(persistedAnalysis, cacheMetadata),
  };
}

export async function listStoredRepositories() {
  const records = await prisma.repositoryAnalysis.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return records.map((record) => {
    const cacheMetadata = buildCacheMetadata(record, 'database');

    return {
      id: record.id,
      repoUrl: record.repoUrl,
      normalizedRepoUrl: record.normalizedRepoUrl,
      provider: record.provider,
      repoOwner: record.repoOwner,
      repoName: record.repoName,
      totalCommits: record.totalCommits,
      totalContributors: record.totalContributors,
      firstCommitAt: toIsoString(record.firstCommitAt),
      lastCommitAt: toIsoString(record.lastCommitAt),
      analyzedAt: toIsoString(record.analyzedAt),
      updatedAt: toIsoString(record.updatedAt),
      cache: cacheMetadata,
    };
  });
}