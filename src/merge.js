/**
 * Merge two annotation arrays by id.
 * Union, dedup by id, sort by ts ascending.
 * For duplicate ids: incoming wins for resolved + replies fields.
 */
export function mergeAnnotations(onDisk, incoming) {
  const map = new Map();

  for (const a of onDisk) {
    map.set(a.id, { ...a });
  }

  for (const a of incoming) {
    if (map.has(a.id)) {
      const existing = map.get(a.id);
      // Incoming wins for resolved state and replies
      const inReplies  = Array.isArray(a.replies)        ? a.replies        : [];
      const exReplies  = Array.isArray(existing.replies) ? existing.replies : [];
      map.set(a.id, {
        ...existing,
        resolved: a.resolved,
        replies: inReplies.length >= exReplies.length ? inReplies : exReplies,
      });
    } else {
      map.set(a.id, { ...a });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
}
