
export function chunkCommits(commits, chunkSize = 15) {
  if (!commits || commits.length === 0) {
    return [];
  }
  
  // Sort commits by date (oldest first)
  const sortedCommits = [...commits].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  const chunks = [];
  for (let i = 0; i < sortedCommits.length; i += chunkSize) {
    const chunk = sortedCommits.slice(i, i + chunkSize);
    
    const startDate = new Date(chunk[0].date);
    const endDate = new Date(chunk[chunk.length - 1].date);
    
    chunks.push({
      commits: chunk,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period: formatPeriod(startDate, endDate),
      commitCount: chunk.length
    });
  }
  
  return chunks;
}

/**
 * Format date period as human-readable string
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {string} Formatted period string
 */
function formatPeriod(start, end) {
  const options = { year: 'numeric', month: 'short' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', options);
  
  if (startStr === endStr) {
    return startStr;
  }
  
  return `${startStr} - ${endStr}`;
}
