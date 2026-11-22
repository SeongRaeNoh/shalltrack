# Response to the OHS TTA Data Platform RFQ (draft)

Fictional bidder: Northwind Civic Software LLC. All names below are fictional. Demo note: the Technical Approach below is longer than the 5-page limit of Factor 1 on purpose, to show the page-limit check of ShallTrack.

## Technical Approach

### Architecture and technology

Every technology we propose runs on cloud.gov hosting without extra infrastructure. The backend API will be written in TypeScript on the current Node.js LTS release using the Express framework, an open-source framework. The frontend web application will be written in TypeScript with React on its most recent LTS version. Data will live in the PostgreSQL service that cloud.gov provides.

Our team will maintain the deployment scripts and the cloud.gov configuration files, and we will update them whenever the application changes so that continuous deployment keeps working.

The public site will comply with the website standards of the Technology Transformation Services, including the U.S. Web Design System.

### Open and agile delivery

We develop the software in the open: all code goes to the public GitHub repository from the first day under an open source license. We work in two-week sprints with user research in every sprint. Our human centered design practice starts with interviews of Program Specialists and Regional Office staff, then usability tests of each new screen.

We will deliver a first working release to the staging environment in the second sprint and improve it iteratively in every following sprint.

### Risks and obstacles

The main obstacle to efficient development is access to the legacy TTA data sources. We plan to overcome this obstacle by building import adapters early, with synthetic data, while access requests are processed. A second risk is low adoption by regional staff; we plan to address it with onboarding sessions and a feedback channel in the product.

### Discovery and user research

We start with a three-week discovery period that overlaps the first sprint. The research lead interviews Program Specialists, Regional Office staff, national center staff and a sample of grantee directors in at least four regions. Each interview follows a written guide, lasts about one hour and is recorded only with the participant's consent. We synthesize the notes in shared affinity maps and publish a short findings memo at the end of each week, so that OHS can correct our understanding early.

The discovery work answers four questions. Which decisions do TTA leaders make each month, and which data do they need for them? Where does the data for those decisions live today, and who keeps it current? Which steps of the current Activity Report process take the most time? Which reports do regional staff build by hand that the platform could produce? We turn the answers into a ranked list of user needs and into the first version of the product roadmap.

We keep research going after discovery. Every sprint includes at least two sessions with real users: either interviews about a new area of work or usability tests of screens in progress. We recruit participants through the Regional Offices and keep a rotating panel so that no person is asked more than once a quarter. Findings go into the backlog as user stories with the evidence attached, and the product owner decides their priority with OHS in sprint planning.

### Data model and import adapters

The platform stores TTA activities, requests, recipients, topics, goals and outcomes in a relational schema in the PostgreSQL service of cloud.gov. Every record carries its source system, the time it was imported and the person or process that changed it last. We document the schema in the repository and publish an entity diagram that is generated from the migration files, so that the documentation cannot drift from the database.

Legacy data arrives through import adapters, one per source. The first adapters read the spreadsheet exports that regional contractors send today and the CSV files of the existing activity tracking system. Each adapter validates every row, writes rejected rows to a review queue with the reason, and never overwrites a value that a user has corrected in the platform. We run every adapter first on synthetic data that matches the real structure, then on a copy of real data in a separate environment that only cleared team members can reach.

The adapters run on a schedule and can also be started by an administrator. Each run produces a short report: rows read, rows imported, rows rejected and the most common rejection reasons. OHS staff can see these reports in the platform, which makes data quality visible to the people who can fix it at the source.

### Search, reporting and dashboards

Regional staff need answers to simple questions quickly: which grantees received support on a topic, which activities are overdue, and which goals have no recent activity. We provide a search page with filters for region, grantee, topic, date range and status, and every result list can be exported to CSV. Saved searches let a specialist return to the same view each week.

For TTA leaders we build dashboards that show activity counts, topics over time, time from request to completion and the share of activities with a recorded outcome. Each chart has a table view with the same numbers, a plain-language summary and a link to the underlying records. We agree the definitions of each measure with OHS before we build the chart, and we write those definitions on the dashboard page itself.

### Security, privacy and authorization

The platform follows the security controls of the cloud.gov FedRAMP authorization and adds the application-level controls that the agency's authorization to operate requires. Users sign in through the agency's single sign-on service with multi-factor authentication. Roles limit what each user can see: regional staff see their region, national staff see all regions, and administrators manage roles and imports. Every change to a record is written to an audit log that administrators can search.

We collect only the data that a user story needs. Narrative fields that may contain personal details about grantee staff are flagged in the schema, excluded from exports by default and reviewed in each privacy assessment. Dependencies are scanned automatically on every pull request, and we patch high-severity findings within the time the agency's policy sets.

### Accessibility and content

Every screen meets Section 508 and WCAG 2.1 AA. We use the components of the U.S. Web Design System, which already meet these standards, and we check each new screen with automated accessibility tests and with a manual keyboard and screen reader pass before release. Content follows plain language guidance: short sentences, the words that users use in interviews, and help text next to the field it explains.

### Quality assurance and automated testing

Each pull request runs unit tests, integration tests against a test database and end-to-end tests of the main user journeys in a headless browser. A pull request cannot be merged until the tests pass and a second engineer has reviewed it. We track test coverage and keep it above 90 percent for the backend. Every merge to the main branch deploys automatically to the staging environment, where the product owner accepts or rejects each story against its acceptance criteria.

### Release plan by sprint

Sprints 1 and 2 deliver the technical foundation and a first useful screen: sign-in, roles, the activity list for one region and the first import adapter. Sprints 3 to 5 deliver activity entry and editing, the review queue for rejected rows, and search with filters and CSV export. Sprints 6 to 8 deliver the dashboards for TTA leaders, saved searches and the remaining import adapters. Sprints 9 and 10 focus on performance, the accessibility audit, the privacy assessment and the material that the agency needs for its authorization decision.

We release to production at the end of every sprint once the authorization allows it. Before that point, each sprint ends with a demonstration on the staging environment to OHS staff and invited users, followed by a short retrospective. The roadmap is a living document; OHS can change priorities at every sprint planning meeting.

### Operations, monitoring and handover

The platform reports errors, response times and failed imports to a monitoring service, and alerts reach the on-call engineer during business hours. We write a runbook for each recurring task: restoring a backup, rerunning an import, adding a region and rotating credentials. All code, configuration and documentation stay in the government's repository, so that OHS or another vendor can take over the work at any time without help from us.

### Activity reports and data entry

Today a specialist at a regional contractor writes an Activity Report in a word processor, emails it, and someone at the Regional Office copies parts of it into a spreadsheet. The platform replaces these steps with one form. The form asks for the grantee, the topics, the participants, the goals the activity supports and the next steps, and it keeps the free-text narrative that specialists value. Topics and goals come from controlled lists that OHS maintains, so that the same topic has the same name in every region.

The form saves a draft every few seconds, works on slow connections and can be completed in several sessions. A specialist can copy a previous report as a starting point for a follow-up activity. When a report is submitted, the platform notifies the reviewer named for that region. The reviewer can approve the report, return it with comments, or edit small errors directly; every action is recorded in the history of the report. Approved reports feed the search page and the dashboards on the same day.

We test the form with specialists from at least three regions before it replaces the current process in any region. We measure the time to complete a report before and after the change and report the result to OHS. If a region needs a field that others do not, we add it as an optional field rather than building a separate form.

### Integration with existing systems

The platform does not replace every system that OHS uses. It reads grantee names, addresses and identifiers from the agency's grants data system through a nightly export, so that grantee records stay consistent with the system of record. It exposes a documented read-only API for the data that other OHS teams need, with keys issued per consuming system and usage limits per key. We describe every endpoint in an OpenAPI file in the repository, and the API documentation page is generated from that file.

Where an integration depends on another team, we agree the interface in writing, build against a mock of the other system first and test against the real system in staging. We keep a list of integration risks in the repository and review it with OHS every month.

### Performance and scalability

The expected load is modest: a few hundred regular users, a few thousand reports per month and a nightly import. We still set targets and test them. Search results and dashboard pages load in under two seconds for the 95th percentile of requests on a typical government laptop and network. Imports of a full year of data finish in under one hour. We run load tests before each major release and record the results next to the release notes.

The application runs as at least two instances on cloud.gov, so that a failure of one instance does not interrupt users. Database backups run every night and are kept for 35 days; we test a restore every quarter and record the time it took.

### Training and adoption

Adoption is the main risk of any new system for regional staff. We address it in three ways. First, the people who will use the platform help design it through the research sessions described above. Second, we roll out region by region, starting with two regions that volunteer, and we fix the problems they find before the next region starts. Third, we provide short training material: a ten-minute video for each main task, a one-page guide for reviewers, and open office hours every week during each regional rollout.

We track adoption with simple measures: the share of activities entered in the platform instead of by email, the number of weekly active users per region, and the number of support requests per user. We share these numbers with OHS every sprint and adjust the rollout plan when a region falls behind.

### Collaboration with OHS and other vendors

We work in the open with OHS. The backlog, the roadmap, the research findings and the sprint reviews are visible to every OHS staff member involved in the project. The product owner from OHS joins sprint planning and the sprint review, and we hold a short weekly check-in to resolve open questions between sprints. Decisions that change scope or cost are recorded in a decision log in the repository, with the date, the people involved and the reason.

Other vendors may work on related systems during the contract. We share our design system choices, our API documentation and our data definitions with them, and we take part in joint planning when OHS asks for it. Our code review rules apply to every contribution to the repository, whether it comes from our team, from OHS staff or from another vendor.

### Measuring outcomes

The contract succeeds if TTA leaders can make better decisions with less manual work. We propose four outcome measures and agree the baseline for each during discovery: hours spent each month on compiling reports by hand, time from a TTA request to the start of the activity, the share of activities linked to a grantee goal, and the share of TTA leaders who say the data they need is available when they need it. We report these measures each quarter, explain changes in plain language, and propose backlog changes when a measure does not improve.

### Data governance and quality

Good dashboards depend on consistent data. We propose a small data governance group with one person from OHS, one from a Regional Office and our data engineer. The group meets once a month, owns the lists of topics and goals, approves new fields and decides how to treat records that conflict between sources. Its decisions are published in the platform's help pages, so that every user can see why a value is named or counted the way it is.

The platform checks data quality continuously. It flags activities without a grantee, reports without a topic, dates in the future and duplicate records that share a grantee, a date and a topic. Regional reviewers see the flags for their region on their home page and can resolve them in a few clicks. We report the number of open flags per region every month, together with the trend.

### Transition from current tools

The current tools stay available until each region has moved to the platform. During the transition, the import adapters bring new spreadsheet reports into the platform every night, so that the dashboards show complete data even in regions that have not moved yet. When a region moves, we import its history, run a side-by-side check of the totals with the regional staff and switch off the spreadsheet import for that region only after they confirm the numbers.

We plan the transition so that no specialist has to enter the same activity twice. If a region needs more time, we keep its import running and agree a new date with OHS. At the end of the transition we archive the old spreadsheets in a read-only location that OHS chooses, with an index that links each archived file to the records imported from it.

### Documentation

We treat documentation as part of each story, not as a task at the end. Each feature ships with an update to the user help pages, the API reference when an endpoint changes, and the architecture notes when a component changes. The repository holds a short decision record for every significant technical choice: the options considered, the choice made and the reason. New team members, OHS staff and future vendors can read these records to understand why the system is built the way it is.

At the end of each quarter we review the documentation with OHS. We remove pages that no longer apply, merge duplicates and check that every runbook still works by having a team member who did not write it follow it step by step. Findings from this review go into the backlog like any other work.

## Staffing Plan

### Approach to staffing

We staff this project with one cross-functional agile team of five people who have delivered government products together for three years. All team members assigned to this contract will obtain an HSPD-12 low risk security clearance before they start work.

### Key personnel

We designate the following key personnel. Facilitator: Dana Whitfield. Technical Lead: Omar Castillo. Design Lead: Priya Raman. The Technical Lead and the Design Lead are two different people.

Dana Whitfield has worked as a scrum master and agile coach on four federal projects. Omar Castillo is a senior software engineer with twelve years of experience in web applications.

### Labor categories and level of effort

The labor categories proposed are Facilitator, Technical Lead, Design Lead, Software Engineer and Content Designer. Each team member works full time in the base period, which is 1,920 hours per person, and half time (960 hours) for the Content Designer in the option periods.
