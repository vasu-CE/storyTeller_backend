
function toNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function isNoreplyEmail(email) {
  return typeof email === 'string' && /@users\.noreply\.github\.com$/i.test(email.trim());
}

function normalizeName(name) {
  if (typeof name !== 'string') {
    return '';
  }

  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractHandleFromNoreply(email) {
  if (typeof email !== 'string') {
    return '';
  }

  const lower = email.trim().toLowerCase();
  const suffix = '@users.noreply.github.com';
  const suffixIndex = lower.indexOf(suffix);
  if (suffixIndex === -1) {
    return '';
  }

  const localPart = lower.slice(0, suffixIndex);
  const plusIndex = localPart.lastIndexOf('+');
  return plusIndex >= 0 ? localPart.slice(plusIndex + 1) : localPart;
}

function getIdentityParts(person) {
  const email = String(person.email || '').trim().toLowerCase();
  const name = String(person.name || '').trim();
  const normalizedName = normalizeName(name);
  const noreply = isNoreplyEmail(email);
  const nonNoreplyEmail = email && !noreply ? email : '';
  const handle = noreply ? extractHandleFromNoreply(email) : '';

  return { email, name, normalizedName, noreply, nonNoreplyEmail, handle };
}

function handlesMatchName(handle, normalizedName) {
  if (!handle || !normalizedName) {
    return false;
  }

  const compact = normalizedName.replace(/\s+/g, '');
  return handle === compact || handle.includes(compact) || compact.includes(handle);
}

function isSameContributor(existing, incoming) {
  const a = getIdentityParts(existing);
  const b = getIdentityParts(incoming);

  if (a.nonNoreplyEmail && b.nonNoreplyEmail) {
    return a.nonNoreplyEmail === b.nonNoreplyEmail;
  }

  if (a.nonNoreplyEmail && b.noreply) {
    return a.normalizedName && (a.normalizedName === b.normalizedName || handlesMatchName(b.handle, a.normalizedName));
  }

  if (b.nonNoreplyEmail && a.noreply) {
    return b.normalizedName && (a.normalizedName === b.normalizedName || handlesMatchName(a.handle, b.normalizedName));
  }

  if (a.noreply && b.noreply) {
    if (a.handle && b.handle) {
      return a.handle === b.handle;
    }
    return a.normalizedName && a.normalizedName === b.normalizedName;
  }

  return a.normalizedName && a.normalizedName === b.normalizedName;
}

function mergeContributor(target, commitAuthor, commit) {
  target.commits += 1;
  target.insertions += toNumber(commit.insertions);
  target.additions += toNumber(commit.insertions);
  target.deletions += toNumber(commit.deletions);
  target.filesChanged += toNumber(commit.filesChanged);

  const commitDate = commit.date;
  if (commitDate && (!target.firstCommit || new Date(commitDate) < new Date(target.firstCommit))) {
    target.firstCommit = commitDate;
  }
  if (commitDate && (!target.lastCommit || new Date(commitDate) > new Date(target.lastCommit))) {
    target.lastCommit = commitDate;
  }

  const incoming = getIdentityParts(commitAuthor);
  const current = getIdentityParts(target);

  if ((!current.name || current.name.length < incoming.name.length) && incoming.name) {
    target.name = incoming.name;
  }

  // Prefer a real email over GitHub noreply aliases.
  if ((!current.nonNoreplyEmail && incoming.nonNoreplyEmail) || (!target.email && incoming.email)) {
    target.email = incoming.email;
  }
}

export async function analyzeContributors(commits) {
  const contributors = [];

  for (const commit of commits) {
    const commitAuthor = {
      name: commit?.author?.name || 'Unknown',
      email: commit?.author?.email || ''
    };

    let contributor = contributors.find((item) => isSameContributor(item, commitAuthor));

    if (!contributor) {
      contributor = {
        name: commitAuthor.name,
        email: commitAuthor.email,
        commits: 0,
        insertions: 0,
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        firstCommit: commit.date,
        lastCommit: commit.date,
        first_commit_date: commit.date,
        last_commit_date: commit.date
      };
      contributors.push(contributor);
    }

    mergeContributor(contributor, commitAuthor, commit);
    contributor.first_commit_date = contributor.firstCommit;
    contributor.last_commit_date = contributor.lastCommit;
  }

  contributors.sort((a, b) => b.commits - a.commits);

  const totalCommits = commits.length;
  const coreContributors = contributors.filter((c) => c.commits >= totalCommits * 0.1);
  const occasionalContributors = contributors.filter((c) => c.commits < totalCommits * 0.1);

  return {
    contributors: contributors.slice(0, 10),
    totalContributors: contributors.length,
    coreContributors: coreContributors.map((c) => ({
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
