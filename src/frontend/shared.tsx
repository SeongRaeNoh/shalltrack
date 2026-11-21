// Helpers shared by the UI Kit surfaces.
import React from 'react';
import { invoke } from '@forge/bridge';
import { Lozenge, SectionMessage, Text } from '@forge/react';

export interface Res<T> { ok: boolean; data?: T; error?: string }

export async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = (await invoke(name, payload)) as Res<T>;
  if (!r || !r.ok) throw new Error(r?.error ?? 'Request failed');
  return r.data as T;
}

type LozengeAppearance = 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success';

const APPEARANCE: Record<string, LozengeAppearance> = {
  mandatory: 'removed', expected: 'moved', recommended: 'inprogress', optional: 'default', informational: 'new',
  covered: 'success', partial: 'moved', missing: 'removed', unchecked: 'default', 'n/a': 'default',
  open: 'default', 'in-progress': 'inprogress', addressed: 'success', 'not-applicable': 'default',
};

export function Pill(props: { value: string; label?: string; bold?: boolean }) {
  return <Lozenge appearance={APPEARANCE[props.value] ?? 'default'} isBold={props.bold}>{props.label ?? props.value}</Lozenge>;
}

export function ErrorBox(props: { error?: string | null }) {
  if (!props.error) return null;
  return (
    <SectionMessage appearance="error" title="Something went wrong">
      <Text>{props.error}</Text>
    </SectionMessage>
  );
}

export function opt(values: readonly string[]): Array<{ label: string; value: string }> {
  return values.map((v) => ({ label: v, value: v }));
}

export function short(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

export const STRENGTHS = ['mandatory', 'expected', 'recommended', 'optional', 'informational'] as const;
export const TYPES = ['requirement', 'instruction', 'evaluation', 'limit', 'deadline'] as const;
export const STATUSES = ['open', 'in-progress', 'addressed', 'not-applicable'] as const;
export const COVERAGES = ['covered', 'partial', 'missing', 'unchecked', 'n/a'] as const;
