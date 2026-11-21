---
name: shalltrack-rfp-compliance
description: Use when an agent writes, reviews or checks a proposal, bid or tender response against an RFP or RFQ whose compliance matrix lives in ShallTrack (an Atlassian Forge app for Confluence and Jira). The skill connects to the ShallTrack MCP tools, plans the response from the submission instructions and evaluation weights, answers every requirement by its ID, runs the coverage check and records evidence.
license: MIT
---

# ShallTrack RFP compliance skill

ShallTrack keeps the compliance matrix of a bid in Confluence: every requirement of the RFP with a stable ID (for example `9.2.2-k3f9a`), its section, strength, type, owner, status and coverage by the response draft. This skill tells an outside agent how to use that matrix through MCP.

## Connect

1. A site or organization admin enables the ShallTrack tools: Atlassian Administration > Apps > Sites > (site) > Connected apps > ShallTrack > turn on the tools.
2. Add the remote MCP server `https://mcp.atlassian.com/forge/<appId>` to the client. `<appId>` is the UUID part of the app id `ari:cloud:ecosystem::app/<appId>`.
3. Sign in when the client opens the OAuth consent screen and pick the site. Tools run with your own Confluence and Jira permissions.

## Tools

| Tool | Verb | What it does | Inputs |
|---|---|---|---|
| `list-bids` | GET | List the bids (RFPs imported into ShallTrack) with their requirement counts. Use it to find the bid the user means. | `nameContains` |
| `import-rfp-page` | CREATE | Create a new bid by extracting requirements (shall, must, will, should, may statements, submission instructions, evaluation statements, page limits and due dates) from one or more Confluence pages of an RFP. | `pageId`, `bidName` |
| `list-requirements` | GET | List rows of the compliance matrix of a bid, with filters. Each row has the requirement id, section, strength, type, status, coverage, owner and text. | `bid`, `section`, `strength`, `type`, `status`, `coverage`, `owner`, `text`, `limit`, `offset` |
| `get-requirement` | GET | Get one requirement with its full text, lead-in, source location, duplicates, owner, status, notes and coverage evidence. | `bid`, `requirementId` (required) |
| `get-coverage-report` | GET | Report which requirements the response draft does not cover yet (missing and partial items), page and word limit checks, and due dates. | `bid`, `onlyMandatory` |
| `run-coverage-check` | UPDATE | Read the response draft pages and find, for every requirement, the paragraph that answers it, with a score and the matched evidence. Also checks page and word limits. | `bid`, `responsePageIds`, `includeChildPages` |
| `update-requirement` | UPDATE | Set the status, owner or note of one or more requirements in the compliance matrix. | `bid`, `requirementIds` (required), `status`, `ownerAccountId`, `ownerName`, `note` |
| `link-evidence` | UPDATE | Record the response paragraph that answers a requirement. This marks the requirement covered. | `bid`, `requirementId` (required), `pageId` (required), `excerpt` (required) |
| `get-match-candidates` | GET | Get a requirement and the best candidate paragraphs from the response draft, for a semantic second opinion on coverage. | `bid`, `requirementId` (required) |
| `record-review` | UPDATE | Record a semantic coverage verdict (covered, partial or missing) with a one-sentence rationale. The verdict overrides the deterministic score in the matrix. | `bid`, `requirementId` (required), `verdict` (required), `rationale` (required) |
| `get-outline-plan` | GET | Get a proposal outline skeleton that follows the submission instructions (Section L style) in order, with page limits, evaluation factor weights (Section M style) and the requirement ids each section must answer. | `bid`, `totalPages` |
| `export-matrix-page` | CREATE | Write the compliance matrix as a table to a Confluence page (creates the page the first time, updates it afterwards). | `bid`, `parentPageId` |
| `create-jira-tasks` | CREATE | Create Jira work items for requirements: by default one per uncovered mandatory requirement. Use dryRun true first to preview. | `bid`, `projectKey`, `scope`, `section`, `requirementIds`, `groupBy`, `dryRun`, `max` |

Every tool accepts `bid` (bid id or part of its name). Without it the most recent bid is used. Lists are comma-separated strings.

Strengths: `mandatory` (shall, must, required, imperative instructions), `expected` (the contractor will), `recommended` (should), `optional` (may, can), `informational` (what will be evaluated).
Types: `requirement` (statement of work), `instruction` (how to prepare the proposal), `evaluation` (evaluation statements), `limit` (page, word, font limits), `deadline`.

## Workflow for writing a response

1. Call `list-bids` and confirm the bid with the user.
2. Call `get-outline-plan` (pass `totalPages` if there is a page budget). Keep its section order, page limits and factor weights.
3. For each outline section call `list-requirements` with `section` and `strength=mandatory,expected`. Write one or more sentences that state how the bidder meets each requirement. Put the requirement ID in square brackets after the sentence that answers it, for example "We encrypt all data at rest with FIPS 140-3 validated modules [C.3-ri3vu]." ShallTrack treats a cited ID as evidence.
4. Keep each section within its page limit. ShallTrack estimates pages as words / 500 unless the bid sets another value.
5. When the draft is saved in Confluence, call `run-coverage-check` with the draft page IDs, then `get-coverage-report` with `onlyMandatory=true`. Fix every `missing` item and re-run.
6. For `partial` items call `get-match-candidates`, decide whether the text answers every element of the requirement, and call `record-review` with `covered`, `partial` or `missing` and one sentence of rationale.
7. Call `link-evidence` when you know the exact paragraph that answers a requirement.

## Rules

- Never invent requirement IDs, section numbers, page limits, due dates or weights. Copy them from tool results.
- The deterministic coverage score is term and synonym matching. A high score is not proof that the requirement is answered; read the evidence.
- Do not create Jira work items without the user's confirmation. Call `create-jira-tasks` with `dryRun=true` first.
- Do not change owners or statuses unless the user asked for it.
