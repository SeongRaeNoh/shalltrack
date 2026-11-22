# ShallTrack privacy policy

Last updated: 2026-11-22. Applies to the ShallTrack Forge app (app id `ari:cloud:ecosystem::app/f79f6de3-cdcb-422d-831d-5b96d5b4c587`), published from https://github.com/SeongRaeNoh/shalltrack.

## What the app stores

ShallTrack stores the following in Forge hosted storage (the Forge Key-Value Store) of your site's installation:

| Data | Content |
|---|---|
| Bids | Bid name, creation time, the Atlassian account ID of the user who created it, the Confluence page IDs, titles and links of the RFP and of the response draft, the Jira project key and the export page ID |
| Requirement matrix | Requirement text extracted from your RFP pages, its section, strength, type, source location, page and word limits, due dates and evaluation factors |
| Work state per requirement | Status, owner (Atlassian account ID, or a name given to the Rovo agent), note, the account ID of the user who last changed it, evidence linked by hand (page and excerpt) and second-opinion verdicts with their rationale |
| Coverage results | For each requirement: status, score and up to three excerpts (at most 280 characters each) of the response draft |
| Jira links | Jira work item keys with the bid and requirement IDs they belong to |

Personal data: Atlassian account IDs, owner names typed into the agent and anything users write into notes. The app does not store e-mail addresses.

Content the app creates in your site (the exported matrix page in Confluence and Jira work items) is normal Confluence and Jira content. It stays in your site under your site's own rules.

## Where the data goes

- The data stays on Atlassian. Forge hosted storage runs on Atlassian's infrastructure, and "Every Forge-hosted persistent storage capability is data residency-enabled" (Atlassian, Data lifecycle for Forge-hosted storage, https://developer.atlassian.com/platform/forge/storage-reference/hosted-storage-data-lifecycle/).
- The app sends no data outside Atlassian: the manifest declares no external fetch or egress permissions.
- The app makes no LLM calls. The Rovo agent runs inside Atlassian Rovo under your organization's Rovo settings. If an admin enables the MCP tools, outside AI clients that a user connects with Atlassian's OAuth consent can call the tools with that user's permissions; what those clients do with the results is governed by their own terms.
- The author of the app does not receive your data. Atlassian may share app logs with the developer when your admin leaves "Logs access" enabled in Connected apps; ShallTrack writes no log lines of its own.

## How to delete the data

- Uninstall the app (Atlassian Administration > Apps > Sites > your site > Connected apps > ShallTrack > Uninstall). Atlassian's documentation states: "Forge hosted storage retains data for 28 days after uninstallation" (Storage, https://developer.atlassian.com/platform/forge/storage-reference/, last updated Sep 28, 2026), and "When an app is uninstalled, the data is first 'soft deleted' and then retained for the rest of the retention period" (Data lifecycle for Forge-hosted storage, same date).
- Exported Confluence pages and Jira work items are deleted in Confluence and Jira like any other content.
- The current version has no button to delete a single bid; uninstalling removes all ShallTrack data of the site.

## Contact

Questions about this policy: https://github.com/SeongRaeNoh/shalltrack/issues (do not post confidential RFP content in a public issue).
