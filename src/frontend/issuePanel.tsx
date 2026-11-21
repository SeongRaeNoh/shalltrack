// Jira work item panel: shows the RFP requirements this work item answers and their coverage.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Inline, Spinner, Stack, Strong, Text, useProductContext } from '@forge/react';
import type { MatrixRow } from '../core';
import { ErrorBox, Pill, call } from './shared';

function App() {
  const ctx = useProductContext();
  const issueKey = (ctx?.extension as { issue?: { key?: string } } | undefined)?.issue?.key;
  const [data, setData] = useState<{ bid: { id: string; name: string }; rows: MatrixRow[] } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const load = () => { if (issueKey) call<{ bid: { id: string; name: string }; rows: MatrixRow[] } | null>('issueContext', { issueKey }).then(setData).catch((e) => setError((e as Error).message)); };
  useEffect(load, [issueKey]);
  if (data === undefined && !error) return <Spinner label="Loading" />;
  if (!data) return <Stack space="space.100"><ErrorBox error={error} /><Text>This work item was not created by ShallTrack.</Text></Stack>;
  const mark = async (id: string) => { try { await call('updateRequirements', { bidId: data.bid.id, reqIds: [id], patch: { status: 'addressed' } }); load(); } catch (e) { setError((e as Error).message); } };
  return (
    <Stack space="space.200">
      <Text>Bid: <Strong>{data.bid.name}</Strong></Text>
      {data.rows.map((r) => (
        <Stack key={r.id} space="space.050">
          <Inline space="space.100"><Text><Strong>{r.id}</Strong></Text><Pill value={r.strength} /><Pill value={r.status} /><Pill value={r.effectiveCoverage} label={'coverage: ' + r.effectiveCoverage} /></Inline>
          <Text>{r.text}</Text>
          <Text>Source: {(r.sectionRef ? r.sectionRef + ' ' : '') + r.sectionTitle} ({r.docTitle})</Text>
          {r.status !== 'addressed' ? <Button onClick={() => mark(r.id)}>Mark addressed</Button> : null}
        </Stack>
      ))}
      <ErrorBox error={error} />
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
