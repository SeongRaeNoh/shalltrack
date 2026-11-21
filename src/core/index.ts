// Public API of the ShallTrack core library (pure functions, no Forge imports).
export * from './types';
export * from './text';
export { markdownToBlocks, storageToBlocks, textToBlocks, inlineMarkdownToText, looksLikeHeading } from './blocks';
export { splitSentences } from './segment';
export { parseHeading, classifySection, SectionTracker } from './sections';
export { extractLimits, extractDeadline } from './limits';
export { extractFactors, applyWeights } from './factors';
export { dedupeRequirements, jaccard } from './dedupe';
export { extractRequirements, scanDocument, classifySentence, findModals, findActor, requirementId } from './extract';
export { checkCoverage, checkLimits, coverageStatus, isCoverable, responseParagraphs, scoreRequirement, terms } from './coverage';
export * from './matrix';
export { buildOutline } from './outline';
export type { Outline, OutlineSection } from './outline';
