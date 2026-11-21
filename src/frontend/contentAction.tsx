// Confluence page action: import the current page as an RFP, or check it as a response draft against a bid.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, ButtonGroup, Heading, Inline, SectionMessage, Select, Spinner, Stack, Strong, Text, Textfield, useProductContext } from '@forge/react';
import { view } from '@forge/bridge';
import type { BidIndexEntry } from '../backend/store';
import { ErrorBox, Pill, call, short } from './shared';

interface Preview { page: { title: string }; stats: { requirements: number; byStrength: Record<string, number>; duplicatesMerged: number }; sample: Array<{ id: string; strength: string; type: string; text: string }>; limits: number; deadlines: number; factors: Array<{ number: string; name: string }> }

function App() {
  const ctx = useProductContext();
  const pageId = (ctx?.extension as { content?: { id?: string } } | undefined)?.content?.id;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [bids, setBids] = useState<BidIndexEntry[]>([]);
  const [name, setName] = useState('');
  const [target, setTarget] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pageId) return;
    call<Preview>('previewPage', { pageRef: pageId }).then(setPreview).catch((e) => setError((e as Error).message));
    call<BidIndexEntry[]>('listBids').then((b) => { setBids(b); setTarget(b[0]?.id); }).catch(() => setBids([]));
  }, [pageId]);

  const importPage = async () => {
    setBusy(true); setError(null);
    try { const r = await call<{ bid: { name: string }; stats: { requirements: number } }>('createBid', { name: name || preview?.page.title, pageRefs: [pageId] }); setMsg('Created bid "' + r.bid.name + '" with ' + r.stats.requirements + ' items. Open ShallTrack from the apps menu to see the matrix.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const checkDraft = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      const r = await call<{ summary: { covered: number; partial: number; missing: number; mandatoryMissing: number; limitBreaches: number } }>('runCoverage', { bidId: target, pageRefs: [pageId] });
      setMsg('Coverage: ' + r.summary.covered + ' covered, ' + r.summary.partial + ' partial, ' + r.summary.missing + ' missing (' + r.summary.mandatoryMissing + ' mandatory), ' + r.summary.limitBreaches + ' limit breaches.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!pageId) return <Text>Open this action from a Confluence page.</Text>;
  return (
    <Stack space="space.200">
      <Heading size="medium">ShallTrack</Heading>
      <ErrorBox error={error} />
      {msg ? <SectionMessage appearance="success"><Text>{msg}</Text></SectionMessage> : null}
      <Heading size="small">Use this page as an RFP</Heading>
      {preview ? (
        <Stack space="space.100">
          <Text><Strong>{preview.stats.requirements}</Strong> items found in "{preview.page.title}": {preview.stats.byStrength.mandatory ?? 0} mandatory, {preview.limits} limits, {preview.deadlines} due dates, {preview.factors.length} evaluation factors.</Text>
          {preview.sample.slice(0, 5).map((s) => <Inline key={s.id} space="space.100"><Pill value={s.strength} /><Text>{s.id}: {short(s.text, 140)}</Text></Inline>)}
          <Inline space="space.100"><Textfield name="name" placeholder="Bid name" onChange={(e) => setName(e.target.value)} /><Button appearance="primary" isDisabled={busy} onClick={importPage}>Create bid from this page</Button></Inline>
        </Stack>
      ) : <Spinner label="Reading page" />}
      <Heading size="small">Or check this page as a response draft</Heading>
      {bids.length ? (
        <Inline space="space.100">
          <Select options={bids.map((b) => ({ label: b.name, value: b.id }))} defaultValue={bids[0] ? { label: bids[0].name, value: bids[0].id } : undefined} onChange={(v: unknown) => setTarget((v as { value?: string } | null)?.value)} />
          <Button isDisabled={busy || !target} onClick={checkDraft}>Check coverage</Button>
        </Inline>
      ) : <Text>No bids yet.</Text>}
      <ButtonGroup><Button appearance="subtle" onClick={() => view.close()}>Close</Button></ButtonGroup>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
