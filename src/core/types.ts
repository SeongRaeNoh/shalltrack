// Shared types of the ShallTrack core library. Pure data, no Forge imports.

export type Strength = 'mandatory' | 'expected' | 'recommended' | 'optional' | 'informational';
export const STRENGTH_RANK: Record<Strength, number> = { mandatory: 4, expected: 3, recommended: 2, optional: 1, informational: 0 };
export type ReqType = 'requirement' | 'instruction' | 'evaluation' | 'limit' | 'deadline';
export type SectionKind = 'instructions' | 'evaluation' | 'work' | 'administration' | 'background' | 'other';
export type Actor = 'bidder' | 'government' | 'unknown';
export type BlockKind = 'heading' | 'paragraph' | 'listItem' | 'tableRow';

/** One structural unit of a source document (a Confluence page or pasted text). */
export interface Block {
  kind: BlockKind;
  text: string;
  /** 0-based position of the block in its document. */
  index: number;
  /** Heading level 1-6 (headings only). */
  level?: number;
  /** List nesting depth, 1 = top level (list items only). */
  depth?: number;
}

export interface Heading {
  /** Section reference such as "9.2.2", "L.4.2" or "M"; empty when the heading has no number. */
  ref: string;
  title: string;
  level: number;
}

export interface SectionInfo {
  ref: string;
  title: string;
  kind: SectionKind;
  /** Heading titles from the outermost to the innermost heading. */
  path: string[];
}

export interface SourceDoc {
  /** Confluence page id, or "paste-<n>" for pasted text. */
  id: string;
  title: string;
  blocks: Block[];
}

export interface SourceRef {
  docId: string;
  docTitle: string;
  blockIndex: number;
  sentenceIndex: number;
  sectionRef: string;
  sectionTitle: string;
  headingPath: string[];
}

export interface Requirement {
  /** Stable id: section reference plus a hash of the normalised text, e.g. "9.2.2-k3f9a". */
  id: string;
  /** 1-based order of first appearance. */
  seq: number;
  text: string;
  /** Lead-in sentence for list items ("The Contractor shall:"). */
  leadIn?: string;
  type: ReqType;
  strength: Strength;
  /** Modal phrase that set the strength ("shall", "must", "imperative", ...). */
  modal: string | null;
  actor: Actor;
  sectionRef: string;
  sectionTitle: string;
  sectionKind: SectionKind;
  source: SourceRef;
  /** Other places where a near-duplicate of the same requirement appears. */
  alsoAt: SourceRef[];
  /** Normalised content terms used for coverage matching. */
  terms: string[];
}

export type LimitKind = 'pages' | 'words' | 'characters' | 'font-size';

export interface Limit {
  id: string;
  kind: LimitKind;
  value: number;
  comparator: 'max' | 'min';
  /** Text of an allowance on top of the base value ("plus one additional page for each resume"). */
  extra?: string;
  /** Set when the limit applies to each item of a kind ("each resume"). */
  perItem?: string;
  /** Title of the RFP section or table row that the limit applies to. */
  scopeTitle: string;
  sectionRef: string;
  text: string;
  source: SourceRef;
  requirementId?: string;
}

export interface Deadline {
  id: string;
  text: string;
  dateText?: string;
  isoDate?: string;
  timeText?: string;
  sectionRef: string;
  source: SourceRef;
}

export interface Factor {
  id: string;
  /** "1", "2", "II" or a letter. */
  number: string;
  name: string;
  sectionRef: string;
  /** Relative weight 0..1 when it can be derived. */
  weight?: number;
  weightSource: 'explicit' | 'order' | 'equal' | 'none';
}

export interface FactorSet {
  factors: Factor[];
  importanceNotes: string[];
}

export interface ExtractionStats {
  documents: number;
  blocks: number;
  sentences: number;
  candidates: number;
  requirements: number;
  duplicatesMerged: number;
  byStrength: Record<Strength, number>;
  byType: Record<ReqType, number>;
}

export interface ExtractionResult {
  requirements: Requirement[];
  limits: Limit[];
  deadlines: Deadline[];
  factors: FactorSet;
  stats: ExtractionStats;
}

export type CoverageStatus = 'covered' | 'partial' | 'missing';

export interface Evidence {
  docId: string;
  docTitle: string;
  blockIndex: number;
  headingPath: string[];
  /** The sentence or paragraph excerpt that best matches. */
  excerpt: string;
  matchedTerms: string[];
  score: number;
}

export interface CoverageItem {
  requirementId: string;
  status: CoverageStatus;
  score: number;
  /** Best evidence first; at most three entries. */
  evidence: Evidence[];
  /** True when the response cites the requirement id or its section reference. */
  explicitReference: boolean;
}

export interface LimitCheck {
  limitId: string;
  kind: LimitKind;
  max: number;
  scopeTitle: string;
  /** Response doc/section the limit was mapped to, if any. */
  mappedTo?: { docId: string; docTitle: string; heading?: string; mapping: 'manual' | 'auto' };
  words?: number;
  estimatedPages?: number;
  status: 'ok' | 'breach' | 'unmapped' | 'not-checkable';
  note: string;
}

export interface CoverageReport {
  generatedAt: string;
  items: CoverageItem[];
  limitChecks: LimitCheck[];
  summary: {
    total: number;
    covered: number;
    partial: number;
    missing: number;
    mandatoryMissing: number;
    limitBreaches: number;
  };
}
