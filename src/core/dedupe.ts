// Near-duplicate merging: the same requirement stated twice (e.g. in the SOW and in the instructions).
import { Requirement, STRENGTH_RANK } from './types';
import { contentTerms } from './text';

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Merge requirements whose term sets overlap by at least threshold (Jaccard).
 * The first occurrence is kept; later ones are listed in alsoAt. The kept item takes the stronger strength.
 */
export function dedupeRequirements(reqs: Requirement[], threshold = 0.8): { kept: Requirement[]; merged: number } {
  const kept: Requirement[] = [];
  const sets: Array<Set<string>> = [];
  let merged = 0;
  for (const r of reqs) {
    // the lead-in is part of the identity: "backend should use X" and "frontend should use X" are different items
    const set = new Set(contentTerms((r.leadIn ?? '') + ' ' + r.text));
    let dup = -1;
    for (let i = 0; i < kept.length; i++) {
      const k = sets[i];
      if (Math.min(k.size, set.size) < 3) {
        if (k.size === set.size && jaccard(k, set) === 1 && kept[i].text.toLowerCase() === r.text.toLowerCase()) { dup = i; break; }
        continue;
      }
      if (Math.abs(k.size - set.size) / Math.max(k.size, set.size) > 1 - threshold) continue;
      if (jaccard(k, set) >= threshold) { dup = i; break; }
    }
    if (dup >= 0) {
      const k = kept[dup];
      k.alsoAt.push(r.source, ...r.alsoAt);
      if (STRENGTH_RANK[r.strength] > STRENGTH_RANK[k.strength]) { k.strength = r.strength; k.modal = r.modal; }
      merged++;
    } else {
      kept.push(r);
      sets.push(set);
    }
  }
  return { kept, merged };
}
