// Confluence global page: the bid desk with the compliance matrix, coverage, limits, outline, export and Jira tabs.
import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Badge, Box, Button, ButtonGroup, Checkbox, DynamicTable, EmptyState, Heading, Inline, Modal, ModalBody, ModalFooter, ModalHeader,
  ModalTitle, ModalTransition, ProgressBar, SectionMessage, Select, Spinner, Stack, Strong, Tab, TabList, TabPanel, Tabs, Text,
  TextArea, Textfield, User, UserPicker,
} from '@forge/react';
import type { BidIndexEntry } from '../backend/store';
import type { MatrixRow, MatrixSummary, Limit, Deadline, FactorSet, LimitCheck, CoverageReport, MatrixFilter } from '../core';
import { COVERAGES, ErrorBox, Pill, STATUSES, STRENGTHS, TYPES, call, opt, short } from './shared';

interface Matrix {
  bid: { id: string; name: string; sources: Array<{ title: string; pageId?: string }>; responsePages: Array<{ pageId: string; title: string }>; lastCoverageAt?: string; wordsPerPage: number; exportPageId?: string; duplicatesMerged: number };
  summary: MatrixSummary;
  filteredSummary: MatrixSummary;
  sections: Array<{ ref: string; title: string; count: number }>;
  total: number;
  rows: MatrixRow[];
  factors: FactorSet;
  limits: Limit[];
  deadlines: Deadline[];
  coverage: { generatedAt: string; summary: CoverageReport['summary']; limitChecks: LimitCheck[] } | null;
}

type Opt = { label: string; value: string };
const values = (v: unknown): string[] => (Array.isArray(v) ? (v as Opt[]).map((o) => o.value) : v && typeof v === 'object' ? [(v as Opt).value] : []);

function NewBidModal(props: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [pages, setPages] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await call<{ bid: { id: string } }>('createBid', { name, pageRefs: pages.split(/[\s,]+/).filter(Boolean), pastedText: text, pastedTitle: name || 'Pasted RFP text' });
      props.onCreated(r.bid.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={props.onClose} width="large">
      <ModalHeader><ModalTitle>Import an RFP</ModalTitle></ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Text>ShallTrack reads the RFP, finds every shall/must/will/should/may statement, submission instruction, evaluation statement, page limit and due date, and gives each item a stable ID.</Text>
          <Textfield name="name" placeholder="Bid name, e.g. TDRS software development RFQ" onChange={(e) => setName(e.target.value)} />
          <Textfield name="pages" placeholder="Confluence page URLs or ids of the RFP, separated by commas" onChange={(e) => setPages(e.target.value)} />
          <TextArea name="text" placeholder="Or paste RFP text here (Markdown or plain text)" onChange={(e) => setText(e.target.value)} />
          <ErrorBox error={error} />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={props.onClose}>Cancel</Button>
          <Button appearance="primary" isDisabled={busy || (!pages.trim() && !text.trim())} onClick={submit}>{busy ? 'Extracting...' : 'Extract requirements'}</Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
}

function DetailModal(props: { bidId: string; row: MatrixRow; onClose: () => void; onSaved: () => void }) {
  const r = props.row;
  const [status, setStatus] = useState<string>(r.status);
  const [owner, setOwner] = useState<string | undefined>(r.owner?.accountId);
  const [note, setNote] = useState(r.note ?? '');
  const [evPage, setEvPage] = useState(r.evidenceDocId ?? '');
  const [evText, setEvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await call('updateRequirements', { bidId: props.bidId, reqIds: [r.id], patch: { status, owner: owner ? { accountId: owner } : null, note } });
      if (evText.trim() && evPage.trim()) await call('linkEvidence', { bidId: props.bidId, reqId: r.id, pageRef: evPage, excerpt: evText });
      props.onSaved();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Modal onClose={props.onClose} width="x-large">
      <ModalHeader><ModalTitle>{r.id + ' - ' + short((r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle, 70)}</ModalTitle></ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <Inline space="space.100"><Pill value={r.strength} bold /><Pill value={r.type} label={r.type} /><Pill value={r.effectiveCoverage} label={'coverage: ' + r.effectiveCoverage} /></Inline>
          <Text><Strong>{r.text}</Strong></Text>
          {r.leadIn ? <Text><Strong>Lead-in:</Strong> {r.leadIn}</Text> : null}
          <Text><Strong>Source:</Strong> {r.docTitle} / {(r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle}{r.duplicates ? ' (also stated ' + r.duplicates + ' more time(s))' : ''}</Text>
          {r.review ? (
            <SectionMessage appearance={r.review.verdict === 'covered' ? 'success' : 'warning'} title={'Second opinion (' + (r.review.reviewer === 'rovo' ? 'Rovo agent' : 'user') + '): ' + r.review.verdict + (r.coverage && r.coverage !== r.review.verdict ? ', replaces term matching (' + r.coverage + ')' : '')}>
              <Text>{r.review.rationale}</Text>
            </SectionMessage>
          ) : null}
          {r.evidenceExcerpt ? (
            <SectionMessage appearance={r.coverageSource === 'manual' || r.coverage === 'covered' ? 'success' : r.coverage === 'missing' ? 'information' : 'warning'} title={(r.coverageSource !== 'manual' && r.coverage === 'missing' ? 'Closest paragraph, not an answer' : 'Best evidence') + (r.coverageSource !== 'manual' && r.coverageScore !== undefined ? ' (score ' + r.coverageScore + ')' : '') + (r.evidenceDocTitle ? ' in ' + r.evidenceDocTitle : '')}>
              <Text>{r.evidenceExcerpt}</Text>
            </SectionMessage>
          ) : null}
          <Text><Strong>Status</Strong></Text>
          <Select options={opt(STATUSES)} defaultValue={{ label: r.status, value: r.status }} onChange={(v: unknown) => setStatus(values(v)[0] ?? r.status)} />
          <UserPicker label="Owner" name="owner" defaultValue={r.owner?.accountId} onChange={(u: unknown) => setOwner((u as { id?: string } | null)?.id)} />
          <TextArea name="note" defaultValue={r.note} placeholder="Note for the writing team" onChange={(e) => setNote(e.target.value)} />
          <Text><Strong>Link evidence by hand</Strong> (marks the item covered):</Text>
          <Textfield name="evpage" defaultValue={r.evidenceDocId} placeholder="Response page URL or id" onChange={(e) => setEvPage(e.target.value)} />
          <TextArea name="evtext" placeholder="Paragraph that answers this requirement" onChange={(e) => setEvText(e.target.value)} />
          <ErrorBox error={error} />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={props.onClose}>Close</Button>
          <Button appearance="primary" onClick={save}>Save</Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
}

function MatrixTab(props: { m: Matrix; onOpen: (r: MatrixRow) => void; filter: MatrixFilter; setFilter: (f: MatrixFilter) => void }) {
  const { m, filter, setFilter } = props;
  const head = { cells: [
    { key: 'id', content: 'ID', isSortable: true }, { key: 'sec', content: 'Section', isSortable: true }, { key: 'text', content: 'Requirement' },
    { key: 'strength', content: 'Strength', isSortable: true }, { key: 'type', content: 'Type', isSortable: true }, { key: 'owner', content: 'Owner' },
    { key: 'status', content: 'Status', isSortable: true }, { key: 'cov', content: 'Coverage', isSortable: true }, { key: 'act', content: '' },
  ] };
  const rows = m.rows.map((r) => ({ key: r.id, cells: [
    { key: 'id', content: r.id }, { key: 'sec', content: short((r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle, 40) },
    { key: 'text', content: short(r.text, 160) }, { key: 'strength', content: <Pill value={r.strength} /> }, { key: 'type', content: r.type },
    { key: 'owner', content: r.owner?.accountId ? <User accountId={r.owner.accountId} /> : r.owner?.name ?? '-' }, { key: 'status', content: <Pill value={r.status} /> },
    { key: 'cov', content: <Pill value={r.effectiveCoverage} label={r.effectiveCoverage + (r.coverageScore !== undefined && r.coverageSource === 'auto' ? ' ' + r.coverageScore.toFixed(2) : r.coverageSource === 'review' ? ' (review)' : r.coverageSource === 'manual' ? ' (manual)' : '')} /> },
    { key: 'act', content: <Button appearance="subtle" onClick={() => props.onOpen(r)}>Open</Button> },
  ] }));
  return (
    <Stack space="space.200">
      <Inline space="space.100" shouldWrap>
        <Select placeholder="Section" isClearable options={m.sections.map((s) => ({ label: short((s.ref ? s.ref + ' ' : '') + s.title, 50) + ' (' + s.count + ')', value: s.ref || s.title }))} onChange={(v: unknown) => setFilter({ ...filter, section: values(v)[0] })} />
        <Select placeholder="Strength" isMulti options={opt(STRENGTHS)} onChange={(v: unknown) => setFilter({ ...filter, strength: values(v) as MatrixFilter['strength'] })} />
        <Select placeholder="Type" isMulti options={opt(TYPES)} onChange={(v: unknown) => setFilter({ ...filter, type: values(v) as MatrixFilter['type'] })} />
        <Select placeholder="Status" isMulti options={opt(STATUSES)} onChange={(v: unknown) => setFilter({ ...filter, status: values(v) as MatrixFilter['status'] })} />
        <Select placeholder="Coverage" isMulti options={opt(COVERAGES)} onChange={(v: unknown) => setFilter({ ...filter, coverage: values(v) as MatrixFilter['coverage'] })} />
        <Textfield name="q" placeholder="Search text or ID" onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
      </Inline>
      <Text>{m.total} of {m.summary.total} items shown.</Text>
      <DynamicTable head={head} rows={rows} rowsPerPage={25} emptyView={<Text>No requirement matches the filters.</Text>} />
    </Stack>
  );
}

function CoverageTab(props: { m: Matrix; reload: () => void; onOpen: (r: MatrixRow) => void }) {
  const { m } = props;
  const [pages, setPages] = useState(m.bid.responsePages.map((p) => p.pageId).join(', '));
  const [children, setChildren] = useState(false);
  const [wpp, setWpp] = useState(String(m.bid.wordsPerPage));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { await call('runCoverage', { bidId: m.bid.id, pageRefs: pages.split(/[\s,]+/).filter(Boolean), includeChildren: children, wordsPerPage: parseInt(wpp, 10) || 500 }); props.reload(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const gaps = m.rows.filter((r) => r.strength === 'mandatory' && (r.effectiveCoverage === 'missing' || r.effectiveCoverage === 'partial'));
  const c = m.coverage?.summary;
  return (
    <Stack space="space.200">
      <Text>Give the pages of your response draft. ShallTrack finds, for every requirement, the paragraph that answers it (term and synonym matching, section references, requirement IDs) and flags what is missing.</Text>
      <Textfield name="pages" defaultValue={pages} placeholder="Response draft page URLs or ids, separated by commas" onChange={(e) => setPages(e.target.value)} />
      <Inline space="space.200" alignBlock="center">
        <Checkbox label="Include child pages" isChecked={children} onChange={() => setChildren(!children)} />
        <Textfield name="wpp" defaultValue={wpp} placeholder="Words per page" onChange={(e) => setWpp(e.target.value)} />
        <Button appearance="primary" isDisabled={busy} onClick={run}>{busy ? 'Checking...' : 'Run coverage check'}</Button>
      </Inline>
      <ErrorBox error={error} />
      {c ? (
        <Stack space="space.100">
          <Inline space="space.200"><Pill value="covered" label={'covered ' + c.covered} /><Pill value="partial" label={'partial ' + c.partial} /><Pill value="missing" label={'missing ' + c.missing} /><Pill value="mandatory" label={'mandatory missing ' + c.mandatoryMissing} bold /><Pill value={c.limitBreaches ? 'missing' : 'covered'} label={'limit breaches ' + c.limitBreaches} /></Inline>
          <ProgressBar value={c.total ? c.covered / c.total : 0} />
          <Text>Last check: {(m.coverage?.generatedAt ?? '').replace('T', ' ').slice(0, 16)} UTC. Ask the ShallTrack Bid Manager agent in Rovo Chat for a semantic second opinion on partial items.</Text>
        </Stack>
      ) : <EmptyState header="No coverage check yet" description="Add the response draft pages and run the check." />}
      <Heading size="small">Mandatory items without full coverage ({gaps.length})</Heading>
      <DynamicTable
        head={{ cells: [{ key: 'id', content: 'ID' }, { key: 'text', content: 'Requirement' }, { key: 'cov', content: 'Coverage' }, { key: 'ev', content: 'Best evidence' }, { key: 'a', content: '' }] }}
        rows={gaps.map((r) => ({ key: r.id, cells: [{ key: 'id', content: r.id }, { key: 'text', content: short(r.text, 140) }, { key: 'cov', content: <Pill value={r.effectiveCoverage} /> }, { key: 'ev', content: r.effectiveCoverage === 'missing' ? 'no paragraph found' : short(r.evidenceExcerpt, 120) || '-' }, { key: 'a', content: <Button appearance="subtle" onClick={() => props.onOpen(r)}>Open</Button> }] }))}
        rowsPerPage={15}
        emptyView={<Text>No gaps among mandatory items.</Text>}
      />
    </Stack>
  );
}

function LimitsTab(props: { m: Matrix }) {
  const { m } = props;
  const checks = new Map((m.coverage?.limitChecks ?? []).map((c) => [c.limitId, c] as const));
  return (
    <Stack space="space.200">
      <Heading size="small">Page, word and font limits ({m.limits.length})</Heading>
      <DynamicTable
        head={{ cells: [{ key: 's', content: 'Applies to' }, { key: 'l', content: 'Limit' }, { key: 'c', content: 'Check' }, { key: 't', content: 'Source text' }] }}
        rows={m.limits.map((l) => { const c = checks.get(l.id); return { key: l.id, cells: [
          { key: 's', content: short((l.sectionRef ? l.sectionRef + ' ' : '') + l.scopeTitle, 50) + (l.perItem ? ' (each ' + l.perItem + ')' : '') },
          { key: 'l', content: (l.comparator === 'max' ? 'max ' : 'min ') + (l.kind === 'font-size' ? 'font size ' + l.value + ' pt' : l.value + ' ' + (l.value === 1 ? l.kind.replace(/s$/, '') : l.kind)) + (l.extra ? ', ' + l.extra : '') },
          { key: 'c', content: c ? <Inline space="space.050"><Pill value={c.status === 'breach' ? 'missing' : c.status === 'ok' ? 'covered' : 'n/a'} label={c.status} /><Text>{short(c.note, 90)}</Text></Inline> : 'not checked' },
          { key: 't', content: short(l.text, 120) },
        ] }; })}
        emptyView={<Text>No limits found.</Text>}
      />
      <Heading size="small">Due dates ({m.deadlines.length})</Heading>
      {m.deadlines.map((d) => <Text key={d.id}><Strong>{d.isoDate ?? d.dateText ?? 'date in RFP'}{d.timeText ? ' ' + d.timeText : ''}</Strong> {short(d.text, 200)}</Text>)}
      <Heading size="small">Evaluation factors</Heading>
      {m.factors.factors.length ? m.factors.factors.map((f) => <Text key={f.id}>Factor {f.number}: {f.name}{f.weight !== undefined ? ' (weight ' + Math.round(f.weight * 100) + '%, from ' + f.weightSource + ')' : ''}</Text>) : <Text>No numbered evaluation factors found.</Text>}
      {m.factors.importanceNotes.map((n, i) => <Text key={'n' + i}>{short(n, 300)}</Text>)}
    </Stack>
  );
}

function OutlineTab(props: { m: Matrix }) {
  const [pages, setPages] = useState('');
  const [o, setO] = useState<{ sections: Array<{ heading: string; pageLimit?: number; pageBudget?: number; factor?: { name: string; weight?: number }; requirementIds: string[]; mandatoryCount: number }>; unplaced: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const build = async () => { setError(null); try { setO(await call('outline', { bidId: props.m.bid.id, totalPages: parseInt(pages, 10) || undefined })); } catch (e) { setError((e as Error).message); } };
  return (
    <Stack space="space.200">
      <Text>Builds a response outline in the order of the submission instructions, with page limits, factor weights and the requirement IDs each section must answer.</Text>
      <Inline space="space.100"><Textfield name="pages" placeholder="Total page budget (optional)" onChange={(e) => setPages(e.target.value)} /><Button appearance="primary" onClick={build}>Build outline</Button></Inline>
      <ErrorBox error={error} />
      {o ? o.sections.map((s) => (
        <Box key={s.heading}>
          <Heading size="xsmall">{s.heading}</Heading>
          <Text>{[s.factor ? s.factor.name + (s.factor.weight !== undefined ? ' (' + Math.round(s.factor.weight * 100) + '%)' : '') : '', s.pageLimit !== undefined ? 'limit ' + s.pageLimit + ' pages' : '', s.pageBudget !== undefined ? 'budget ' + s.pageBudget + ' pages' : '', s.requirementIds.length + ' items, ' + s.mandatoryCount + ' mandatory'].filter(Boolean).join(' | ')}</Text>
          <Text>{short(s.requirementIds.join(', '), 400)}</Text>
        </Box>
      )) : null}
      {o && o.unplaced ? <Text>{o.unplaced} items are not placed in an instruction section.</Text> : null}
    </Stack>
  );
}

function ExportTab(props: { m: Matrix; reload: () => void }) {
  const { m } = props;
  const [parent, setParent] = useState('');
  const [projects, setProjects] = useState<Opt[]>([]);
  const [project, setProject] = useState<string | undefined>();
  const [scope, setScope] = useState('uncovered-mandatory');
  const [groupBy, setGroupBy] = useState('requirement');
  const [section, setSection] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { call<Array<{ key: string; name: string }>>('listJiraProjects').then((ps) => setProjects(ps.map((p) => ({ label: p.name + ' (' + p.key + ')', value: p.key })))).catch(() => setProjects([])); }, []);
  const doExport = async () => { setError(null); try { const r = await call<{ title: string; rows: number }>('exportMatrix', { bidId: m.bid.id, parentPageRef: parent || undefined }); setMsg('Exported ' + r.rows + ' rows to the page "' + r.title + '".'); props.reload(); } catch (e) { setError((e as Error).message); } };
  const jiraRun = async (dryRun: boolean) => {
    setError(null);
    try {
      const r = await call<{ dryRun?: boolean; wouldCreate?: Array<{ summary: string }>; created?: Array<{ key: string }>; skippedBeyondMax?: number }>('createJiraTasks', { bidId: m.bid.id, projectKey: project, scope, section, groupBy, dryRun });
      setMsg((r.skippedBeyondMax ? r.skippedBeyondMax + ' more items are over the limit of this run. ' : '') + (dryRun ? 'Would create ' + (r.wouldCreate?.length ?? 0) + ' work items: ' + short((r.wouldCreate ?? []).map((w) => w.summary).join('; '), 400) : 'Created ' + (r.created?.length ?? 0) + ' work items: ' + (r.created ?? []).map((c) => c.key).join(', ')));
      if (!dryRun) props.reload();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <Stack space="space.200">
      <Heading size="small">Export the matrix to a Confluence page</Heading>
      <Text>{m.bid.exportPageId ? 'The export page exists and will be updated.' : 'A new child page of the first RFP page is created, unless you give a parent page.'}</Text>
      <Inline space="space.100"><Textfield name="parent" placeholder="Parent page URL or id (optional)" onChange={(e) => setParent(e.target.value)} /><Button appearance="primary" onClick={doExport}>Export matrix</Button></Inline>
      <Heading size="small">Create Jira work items</Heading>
      {projects.length ? null : <SectionMessage appearance="information" title="Jira not connected"><Text>Connect ShallTrack to Jira on this site (it is an optional connected app) to create work items.</Text></SectionMessage>}
      <Inline space="space.100" shouldWrap>
        <Select placeholder="Jira space (project)" options={projects} onChange={(v: unknown) => setProject(values(v)[0])} />
        <Select defaultValue={{ label: 'uncovered mandatory items', value: 'uncovered-mandatory' }} options={[{ label: 'uncovered mandatory items', value: 'uncovered-mandatory' }, { label: 'one section', value: 'section' }]} onChange={(v: unknown) => setScope(values(v)[0] ?? 'uncovered-mandatory')} />
        {scope === 'section' ? <Select placeholder="Section" options={m.sections.map((s) => ({ label: short((s.ref ? s.ref + ' ' : '') + s.title, 50), value: s.ref || s.title }))} onChange={(v: unknown) => setSection(values(v)[0])} /> : null}
        <Select defaultValue={{ label: 'one per requirement', value: 'requirement' }} options={[{ label: 'one per requirement', value: 'requirement' }, { label: 'one per section', value: 'section' }]} onChange={(v: unknown) => setGroupBy(values(v)[0] ?? 'requirement')} />
      </Inline>
      <ButtonGroup>
        <Button onClick={() => jiraRun(true)}>Preview</Button>
        <Button appearance="primary" isDisabled={!project} onClick={() => jiraRun(false)}>Create work items</Button>
      </ButtonGroup>
      {msg ? <SectionMessage appearance="success"><Text>{msg}</Text></SectionMessage> : null}
      <ErrorBox error={error} />
    </Stack>
  );
}

function App() {
  const [bids, setBids] = useState<BidIndexEntry[] | null>(null);
  const [bidId, setBidId] = useState<string | undefined>();
  const [m, setM] = useState<Matrix | null>(null);
  const [filter, setFilter] = useState<MatrixFilter>({});
  const [open, setOpen] = useState<MatrixRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBids = async (select?: string) => {
    try { const b = await call<BidIndexEntry[]>('listBids'); setBids(b); setBidId(select ?? bidId ?? b[0]?.id); } catch (e) { setError((e as Error).message); setBids([]); }
  };
  const loadMatrix = async () => {
    if (!bidId) return;
    setLoading(true);
    try { setM(await call<Matrix>('getMatrix', { bidId, filter })); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { loadBids(); }, []);
  useEffect(() => { loadMatrix(); }, [bidId, JSON.stringify(filter)]);

  const s = m?.summary;
  const coveredShare = useMemo(() => (s && s.total ? (s.byCoverage.covered ?? 0) / s.total : 0), [s]);
  if (bids === null) return <Spinner label="Loading bids" />;
  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Heading size="large">ShallTrack</Heading>
          <Text>RFP compliance matrix: every shall, must and page limit, its owner, and the paragraph that answers it.</Text>
        </Stack>
        <ButtonGroup>
          <Button appearance="primary" onClick={() => setShowNew(true)}>Import RFP</Button>
          {bidId ? <Button onClick={async () => { try { await call('reimportBid', { bidId }); loadMatrix(); } catch (e) { setError((e as Error).message); } }}>Re-import</Button> : null}
        </ButtonGroup>
      </Inline>
      <ErrorBox error={error} />
      {!bids.length ? (
        <EmptyState header="No bids yet" description="Import an RFP from Confluence pages or pasted text to build the compliance matrix." primaryAction={<Button appearance="primary" onClick={() => setShowNew(true)}>Import RFP</Button>} />
      ) : (
        <Stack space="space.200">
          <Select options={bids.map((b) => ({ label: b.name + ' (' + b.requirements + ' items)', value: b.id }))} defaultValue={bids.filter((b) => b.id === bidId).map((b) => ({ label: b.name + ' (' + b.requirements + ' items)', value: b.id }))[0]} onChange={(v: unknown) => setBidId(values(v)[0])} />
          {s ? (
            <Inline space="space.200" alignBlock="center" shouldWrap>
              <Text><Strong>{s.total}</Strong> items</Text><Badge appearance="important" max={99999}>{s.mandatory}</Badge><Text>mandatory</Text>
              {m?.coverage ? <><Badge appearance="removed" max={99999}>{s.mandatoryMissing}</Badge><Text>mandatory without coverage</Text></> : <Text>coverage not checked yet</Text>}
              <Badge max={99999}>{s.unassigned}</Badge><Text>without owner</Text>
              <Box xcss={{ width: '200px' }}><ProgressBar value={coveredShare} /></Box><Text>{Math.round(coveredShare * 100)}% covered</Text>
            </Inline>
          ) : null}
          {loading && !m ? <Spinner label="Loading matrix" /> : null}
          {m ? (
            <Tabs id="shalltrack-tabs">
              <TabList>
                <Tab>Matrix</Tab><Tab>Coverage</Tab><Tab>Limits and dates</Tab><Tab>Outline</Tab><Tab>Export and Jira</Tab>
              </TabList>
              <TabPanel><MatrixTab m={m} onOpen={setOpen} filter={filter} setFilter={setFilter} /></TabPanel>
              <TabPanel><CoverageTab m={m} reload={loadMatrix} onOpen={setOpen} /></TabPanel>
              <TabPanel><LimitsTab m={m} /></TabPanel>
              <TabPanel><OutlineTab m={m} /></TabPanel>
              <TabPanel><ExportTab m={m} reload={loadMatrix} /></TabPanel>
            </Tabs>
          ) : null}
        </Stack>
      )}
      <ModalTransition>
        {showNew ? <NewBidModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); loadBids(id); }} /> : null}
        {open && bidId ? <DetailModal bidId={bidId} row={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); loadMatrix(); }} /> : null}
      </ModalTransition>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
