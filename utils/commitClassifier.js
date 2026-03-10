
export function classifyCommits(commits) {
  const classification = {
    feat: [],
    fix: [],
    refactor: [],
    perf: [],
    chore: [],
    test: [],
    ci: [],
    docs: [],
    other: []
  };
  
  for (const commit of commits) {
    const message = commit.message.toLowerCase();
    
    if (message.match(/^feat:|feature:/i) || message.includes('feature')) {
      classification.feat.push(commit);
    } else if (message.match(/^fix:|^bug:/i) || message.includes('fix') || message.includes('bug')) {
      classification.fix.push(commit);
    } else if (message.match(/^refactor:/i) || message.includes('refactor')) {
      classification.refactor.push(commit);
    } else if (message.match(/^perf:/i) || message.includes('performance')) {
      classification.perf.push(commit);
    } else if (message.match(/^chore:|^deps:/i) || message.includes('chore') || message.includes('dependencies')) {
      classification.chore.push(commit);
    } else if (message.match(/^test:/i) || message.includes('test')) {
      classification.test.push(commit);
    } else if (message.match(/^ci:|^build:/i) || message.includes('ci') || message.includes('build')) {
      classification.ci.push(commit);
    } else if (message.match(/^docs:/i) || message.includes('documentation') || message.includes('readme')) {
      classification.docs.push(commit);
    } else {
      classification.other.push(commit);
    }
  }
  
  return {
    classification,
    summary: {
      feat: classification.feat.length,
      fix: classification.fix.length,
      refactor: classification.refactor.length,
      perf: classification.perf.length,
      chore: classification.chore.length,
      test: classification.test.length,
      ci: classification.ci.length,
      docs: classification.docs.length,
      other: classification.other.length,
      total: commits.length
    }
  };
}
