export function tokens(text = '') {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length > 2));
}

export function jaccardSimilarity(first, second) {
  const a = tokens(first);
  const b = tokens(second);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size;
}

