# ShallTrack

RFP compliance matrix for Confluence and Jira, built on Atlassian Forge for Codegeist 2026.

Proposal teams must answer every "shall" and "must" of a request for proposal (RFP). ShallTrack reads the RFP pages in Confluence and extracts every requirement with a stable ID, its section, strength (shall, must, will, should, may), type (work requirement, submission instruction, evaluation statement, limit, due date), the page and word limits, the due dates and the evaluation factors. Teams assign owners, check which paragraph of the response draft answers each requirement, create Jira work items for the gaps and export the matrix to a Confluence page. A Rovo agent and an MCP server give agents the same matrix.

The extraction and the coverage check are deterministic code (rules and term matching). The app makes no LLM calls of its own; the semantic second opinion comes from the Rovo agent or from an outside agent through MCP.

## Install

1. Open the installation link: `<installation link - added when the app is shared>`.
2. Choose your Atlassian Cloud site. Confluence is required; Jira is optional (work items and the Jira panel need it); Rovo is needed for the agent.
3. In Confluence, open **Apps > ShallTrack** (the bid desk), or open an RFP page and choose **More actions (...) > ShallTrack: shred RFP or check draft**.

## What it does

| Surface | What you can do |
|---|---|
| Page action on an RFP page | Preview the counts (requirements, mandatory items, limits, due dates, factors) and create a bid |
| Page action on a draft page | Run the coverage check of the draft against a bid |
| Bid desk: Matrix | Filter by section, strength, type, status, coverage and text; open an item to see its ID, source, lead-in, evidence; set owner, status and note |
| Bid desk: Coverage | Mandatory items without full coverage, with the closest paragraph of the draft |
| Bid desk: Limits and dates | Page and word limits with the estimate for the mapped draft section (words per page, default 500), due dates, evaluation factors |
| Bid desk: Outline | Proposal outline that follows the submission instructions and the evaluation factors |
| Bid desk: Export and Jira | Export the matrix as a Confluence table; create one Jira work item per uncovered mandatory requirement (preview first) |
| Jira work item panel | The requirement behind a work item; mark it addressed |
| Rovo agent "ShallTrack Bid Manager" | Uncovered mandatory items, outline, second opinion on partial items, Jira work items with a dry run and a confirmation |

## Try it with the demo data

- `test/fixtures/` holds three US federal RFQs published by GSA/18F on GitHub (public domain; sources in [test/fixtures/SOURCES.md](test/fixtures/SOURCES.md)): TDRS software development (212 items, 113 mandatory), Head Start TTA data platform (190 items, 103 mandatory) and GSA NewPay payroll (draft).
- `demo/headstart_response_draft_demo.md` is a fictional response draft to the Head Start RFQ (bidder "Northwind Civic Software LLC"; all names are invented). Its Technical Approach section is longer than the 5-page limit on purpose, so the page-limit check reports a breach.
- To create Confluence pages from these files: `npm install && npm run build:test && node build/scripts/md-to-storage.js test/fixtures/headstart_rfq.md headstart.xhtml` writes Confluence storage format, which you can put into a page with the Confluence REST API. The bid desk's **Import RFP** dialog also accepts pasted Markdown text.
- The response draft must be a Confluence page for the coverage check; keep its headings as headings so that limits can be mapped to sections.

## Measured extraction quality

Sentence units from the ShallTrack segmenter, labelled by hand (rules in [eval/gold/README.md](eval/gold/README.md)); Wilson 95% intervals; script `eval/run_eval.ts`.

| Set | Units | Gold items | Precision | Recall |
|---|---|---|---|---|
| Test: Head Start RFQ, sections 5, 6, 9.1, 9.2 | 131 | 89 | 98.9% (89/90, CI 94.0-99.8) | 100% (89/89, CI 95.9-100) |
| Test: GSA Payroll RFQ, 7 sections | 56 | 44 | 100% (44/44, CI 92.0-100) | 100% (44/44, CI 92.0-100) |

Caveats:
- The rules were tuned on the TDRS RFQ (the development set); TDRS numbers are not quoted because they measure the tuning data.
- Two general rule fixes were made after the first run on the test sets (first-run precision: Head Start 96.7%, 89/92; Payroll 97.8%, 44/45; recall 100% on both).
- The same person wrote the rules and the labels; there is no second labeller.
- Head Start and TDRS use the same 18F template, so Head Start is close to the tuning data. Payroll is the independent test and is small.
- Only the listed sections are labelled; whole-document precision and segmentation errors are not measured.

The coverage scorer was checked on a short fictional draft (`test/fixtures/headstart_response_draft.md`) against a gold list (`eval/coverage_gold.json`). Both were written by the author of the scorer, so the result (`eval/results_coverage.txt`) is a sanity check, not a performance claim. Known weakness: term matching marks an item "covered" when the draft uses the same words without answering it (for example "Include resumes for ..." when the draft only names the people). The Rovo second opinion (`get-match-candidates` + `record-review`) is meant for these items.

## MCP tools and SKILL.md for outside agents

The `rovo:mcp` module exposes 13 tools: `list-bids`, `import-rfp-page`, `list-requirements`, `get-requirement`, `get-coverage-report`, `run-coverage-check`, `update-requirement`, `link-evidence`, `get-match-candidates`, `record-review`, `get-outline-plan`, `export-matrix-page`, `create-jira-tasks`.

- Rovo Studio: create a custom agent, **Add tools > Connected apps > ShallTrack**, pick the tools.
- Outside MCP clients (Preview feature of Atlassian):
  1. A site or organization admin enables the tools: Atlassian Administration > Apps > Sites > (your site) > Connected apps > ShallTrack > View app details > Tools: **Enable tools**.
  2. Add the remote MCP server `https://mcp.atlassian.com/forge/f79f6de3-cdcb-422d-831d-5b96d5b4c587` to the client (for Claude Code: `claude mcp add --transport http shalltrack https://mcp.atlassian.com/forge/f79f6de3-cdcb-422d-831d-5b96d5b4c587`).
  3. The client opens Atlassian's OAuth consent screen; choose the site and select **Accept**. Tools run with your own Confluence and Jira permissions.
- [skills/shalltrack-rfp-compliance/SKILL.md](skills/shalltrack-rfp-compliance/SKILL.md) (MIT) tells an outside agent how to plan a response from the instructions and evaluation weights, answer requirements by ID, run the coverage check and record evidence. Put the folder where your agent loads skills (for Claude Code: `~/.claude/skills/shalltrack-rfp-compliance/`).

## Data and privacy

ShallTrack stores bids, requirement matrices, owner account IDs, notes and coverage results in Forge storage on Atlassian. No data leaves Atlassian. See [PRIVACY.md](PRIVACY.md).

## Support

GitHub Issues: https://github.com/SeongRaeNoh/shalltrack/issues. See [SUPPORT.md](SUPPORT.md).

## Develop

```
npm install
npm run typecheck      # TypeScript, all sources
npm test               # unit tests and real-RFP tests (node:test)
npm run bundle:check   # esbuild bundles of the backend and the three UI Kit entries
FORGE_CLI_DIR=<path to @forge/cli> node scripts/validate-manifest.cjs   # offline manifest validation
FORGE_CLI_DIR=<path to @forge/cli> node scripts/offline-lint.cjs        # Forge client-side linters without login
node build/eval/run_eval.js test/fixtures all      # extraction precision/recall on the gold sets (after npm test)
node build/eval/run_coverage_eval.js test/fixtures  # coverage scorer on the sample response draft
```

Deploy your own copy (needs an Atlassian login): `forge register` (gives a new app id), `forge deploy -e production`, `forge install`.

Modules: `confluence:globalPage` (bid desk), `confluence:contentAction` (page action), `jira:issuePanel`, `rovo:agent` with 13 `action` modules, `rovo:mcp` with the same 13 actions. Storage: Forge Key-Value Store. Scopes: `storage:app`, `read:page:confluence`, `write:page:confluence`, `read:jira-work`, `write:jira-work`. No external egress.

## License

MIT, see [LICENSE](LICENSE).
