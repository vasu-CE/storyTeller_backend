
export async function analyzeContributors(commits) {
  const contributorMap = new Map();
  
  // Aggregate contributor stats
  for (const commit of commits) {
    const email = commit.author.email;
    
    if (!contributorMap.has(email)) {
      contributorMap.set(email, {
        name: commit.author.name,
        email: email,
        commits: 0,
        insertions: 0,
        deletions: 0,
        filesChanged: 0,
        firstCommit: commit.date,
        lastCommit: commit.date
      });
    }
    
    const contributor = contributorMap.get(email);
    contributor.commits++;
    contributor.insertions += commit.insertions || 0;
    contributor.deletions += commit.deletions || 0;
    contributor.filesChanged += commit.filesChanged || 0;
    
    // Update date range
    if (new Date(commit.date) < new Date(contributor.firstCommit)) {
      contributor.firstCommit = commit.date;
    }
    if (new Date(commit.date) > new Date(contributor.lastCommit)) {
      contributor.lastCommit = commit.date;
    }
  }
  
  // Convert to array and sort by commit count
  const contributors = Array.from(contributorMap.values())
    .sort((a, b) => b.commits - a.commits);
  
  // Classify contributors
  const totalCommits = commits.length;
  const coreContributors = contributors.filter(c => 
    c.commits >= totalCommits * 0.1 // 10% or more of commits
  );
  
  const occasionalContributors = contributors.filter(c =>
    c.commits < totalCommits * 0.1
  );
  
  return {
    contributors: contributors.slice(0, 10), // Top 10
    totalContributors: contributors.length,
    coreContributors: coreContributors.map(c => ({
      name: c.name,
      commits: c.commits,
      linesChanged: c.insertions + c.deletions
    })),
    insights: {
      mostActive: contributors[0]?.name || 'Unknown',
      totalUniqueContributors: contributors.length,
      coreTeamSize: coreContributors.length,
      occasionalContributors: occasionalContributors.length
    }
  };
}
