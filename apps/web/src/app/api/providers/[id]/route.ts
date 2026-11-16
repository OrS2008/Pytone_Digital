// GET    /api/providers/:id   — re-check the account with the provider
// DELETE /api/providers/:id   — remove the connection (and its secrets)

import { NextRequest, NextResponse } from 'next/server';
import { loadOwned, clientFor, errorResponse } from '@/lib/providers/http';
import { listProviders, saveProviders, publicView } from '@/lib/providers/store';
import { ProviderError } from '@/lib/providers';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const owned = await loadOwned(req, id);
  if (owned instanceof Response) return owned;
  const { viewer, record } = owned;
  try {
    let account = record.account;
    let problem: string | null = null;
    try { account = await clientFor(record).login(); }
    catch (e) { if (e instanceof ProviderError) problem = e.code; else throw e; }
    const list = await listProviders(viewer.kv, viewer.userId);
    const next = list.map((p) => (p.id === id ? { ...p, account, checkedAt: Date.now() } : p));
    await saveProviders(viewer.kv, viewer.userId, next);
    return NextResponse.json({ provider: publicView(next.find((p) => p.id === id)!), problem });
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const owned = await loadOwned(req, id, false);
  if (owned instanceof Response) return owned;
  const { viewer } = owned;
  try {
    const list = await listProviders(viewer.kv, viewer.userId);
    await saveProviders(viewer.kv, viewer.userId, list.filter((p) => p.id !== id));
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
