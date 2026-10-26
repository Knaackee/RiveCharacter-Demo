export function loadReviewState(storage, currentKey, previousKeys) {
  for (const key of [currentKey, ...previousKeys]) {
    try {
      const value = JSON.parse(storage.getItem(key));
      if (value && typeof value === 'object') return value;
    } catch { /* Ignore a corrupt local revision and try the previous one. */ }
  }
  return {};
}

export function acceptanceRecords(cases, review) {
  return cases.map(([id, title]) => ({
    id, title,
    status: ['open', 'passed', 'failed'].includes(review[id]?.status) ? review[id].status : 'open',
    notes: review[id]?.notes ?? '',
  }));
}
