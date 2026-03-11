-- CreateTable
CREATE TABLE "RepositoryAnalysis" (
    "id" TEXT NOT NULL,
    "normalizedRepoUrl" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "provider" TEXT,
    "repoOwner" TEXT,
    "repoName" TEXT,
    "totalCommits" INTEGER NOT NULL DEFAULT 0,
    "totalContributors" INTEGER NOT NULL DEFAULT 0,
    "firstCommitAt" TIMESTAMP(3),
    "lastCommitAt" TIMESTAMP(3),
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "analyzedHeadHash" TEXT,
    "lastKnownHeadHash" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "analysisData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepositoryAnalysis_normalizedRepoUrl_key" ON "RepositoryAnalysis"("normalizedRepoUrl");

-- CreateIndex
CREATE INDEX "RepositoryAnalysis_updatedAt_idx" ON "RepositoryAnalysis"("updatedAt");
