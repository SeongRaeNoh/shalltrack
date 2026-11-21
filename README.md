# ShallTrack

RFP compliance matrix for Confluence and Jira, built on Atlassian Forge for Codegeist 2026.

Proposal teams must answer every "shall" and "must" of a request for proposal (RFP). ShallTrack reads the RFP pages in Confluence, extracts every requirement with a stable ID, its section, strength (shall/must/will/should/may), type (work requirement, submission instruction, evaluation statement, limit, due date), page and word limits, and evaluation factors. Teams assign owners, check which paragraph of the response draft answers each requirement, create Jira work items for the gaps, and export the matrix to a Confluence page. A Rovo agent and an MCP server expose the same matrix to agents.

## Modules

- `confluence:globalPage` ShallTrack bid desk (matrix, coverage, limits and dates, outline, export and Jira)
- `confluence:contentAction` "ShallTrack: shred RFP or check draft" on any page
- `jira:issuePanel` requirement panel on work items created by ShallTrack
- `rovo:agent` ShallTrack Bid Manager, 13 `action` modules
- `rovo:mcp` the same 13 actions as MCP tools; outside agents use [skills/shalltrack-rfp-compliance/SKILL.md](skills/shalltrack-rfp-compliance/SKILL.md)
- Storage: Forge Key-Value Store. No Forge LLM calls and no external egress.

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

Deploy (needs an Atlassian login): `forge register`, `forge deploy -e production`, `forge install --demo-site`.

## Data

`test/fixtures` holds three US federal RFQs published by GSA/18F on GitHub (public domain). See [test/fixtures/SOURCES.md](test/fixtures/SOURCES.md).

## License

MIT, see [LICENSE](LICENSE).
