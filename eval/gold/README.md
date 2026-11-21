# Gold labels for extraction precision/recall

Labelled by hand (the build agent, 2026-11-21) from the sentence units printed by `eval/dump_sentences.ts`.
Each entry: `key` = doc#blockIndex.sentenceIndex, `label`, `prefix` = first 50 characters (used to detect misalignment after parser changes).

Labels: M mandatory (shall, must, required, cannot, imperative instruction), E expected (bidder "will"), R recommended (should, encouraged, preferable),
O optional/permission (may, can), V evaluation criterion statement, N not a compliance item.

Conventions:
- An item is a sentence a proposal manager would put in a compliance matrix: an obligation, recommendation or permission addressed to the bidder,
  its staff, its product or its quote; a submission instruction, format or page limit; a due date; or a statement of what will be evaluated.
- Not items: background, explanations, references ("See Appendix 1"), consequences ("will be deemed nonresponsive"), government actions.
- A sentence ending in ":" that introduces a list is not an item when the list items complete it; the list items are items with the lead-in's strength.
- Strength follows the strongest modal that binds the bidder in the sentence.

Sets:
- dev_tdrs.json: TDRS RFQ (18F/tdrs-app-rfq) sections 5, 6, 9.1, 9.2. Used while developing the rules.
- test_headstart.json, test_payroll.json: labelled before the extractor was run on them; not used for tuning.
