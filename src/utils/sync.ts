import { supabase, ensureCloudUser } from './supabaseClient';
import { resolveMedia } from './mediaStore';
import type { Trip, Expense, DocumentVaultItem, TripTodo } from '../types';

/**
 * Live sync for shared trips: Supabase DB + Storage.
 * Last-write-wins per document via updatedAt. Local-first: offline works,
 * syncs when back. Deletes propagate via _deleted tombstones.
 */

export interface RemoteSnapshot {
  trip: Partial<Trip> & { updatedAt?: number };
  expenses: (Expense & { _deleted?: boolean })[];
  todos: (TripTodo & { _deleted?: boolean })[];
  documents: (DocumentVaultItem & { _deleted?: boolean })[];
}

async function myUid(): Promise<string> {
  const u = await ensureCloudUser();
  return u.uid;
}

/** Push one trip's shared state up (debounced by caller). */
export async function pushTripShared(
  trip: Trip,
  expenses: Expense[],
  todos: TripTodo[],
  documents: DocumentVaultItem[]
): Promise<void> {
  const uid = await myUid();
  const now = Date.now();

  // Upsert trip
  await supabase.from('trips').upsert({
    id: trip.id,
    title: trip.title,
    description: trip.description,
    coverImage: trip.coverImage,
    startDate: trip.startDate,
    endDate: trip.endDate,
    totalBudget: trip.totalBudget,
    currency: trip.currency,
    inviteCode: trip.inviteCode,
    ownerUid: trip.ownerUid,
    cities: trip.cities,
    members: trip.members,
    isActive: trip.isActive,
    status: trip.status,
    updatedAt: now,
  });

  // Upsert expenses
  const mine = expenses.filter((e) => e.tripId === trip.id);
  if (mine.length > 0) {
    await supabase.from('expenses').upsert(
      mine.map((e) => ({
        id: e.id,
        tripId: e.tripId,
        cityId: e.cityId,
        title: e.title,
        amount: e.amount,
        currency: e.currency,
        category: e.category,
        paymentMode: e.paymentMode,
        paidByMemberId: e.paidByMemberId,
        date: e.date,
        time: e.time,
        notes: e.notes,
        isGroupExpense: e.isGroupExpense,
        splits: e.splits,
        isAutoParsedSMS: e.isAutoParsedSMS,
        originalSMS: e.originalSMS,
        updatedAt: e.updatedAt || now,
      }))
    );
  }

  // Upsert todos
  const myTodos = todos.filter((t) => t.tripId === trip.id);
  if (myTodos.length > 0) {
    await supabase.from('todos').upsert(
      myTodos.map((t) => ({
        id: t.id,
        tripId: t.tripId,
        text: t.text,
        done: t.done,
        updatedAt: t.updatedAt || now,
      }))
    );
  }

  // Upsert documents
  const myDocs = documents.filter((d) => d.tripId === trip.id);
  for (const d of myDocs) {
    let remoteUrl: string | undefined;
    const src = d.previewUrl || d.fileUrl || '';
    if (src) {
      try {
        const dataUrl = await resolveMedia(src);
        if (dataUrl.startsWith('data:')) {
          const ext = dataUrl.startsWith('data:image/png')
            ? 'png'
            : dataUrl.startsWith('data:application/pdf')
              ? 'pdf'
              : 'jpg';
          const bin = atob(dataUrl.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const path = `trips/${trip.id}/docs/${d.id}.${ext}`;
          await supabase.storage.from('vault').upload(path, bytes, {
            contentType: dataUrl.split(';')[0].split(':')[1],
            upsert: true,
          });
          const { data: urlData } = supabase.storage.from('vault').getPublicUrl(path);
          remoteUrl = urlData.publicUrl;
        } else if (/^https?:/.test(src)) {
          remoteUrl = src;
        }
      } catch { /* bytes stay local-only */ }
    }
    await supabase.from('documents').upsert({
      id: d.id,
      tripId: d.tripId,
      title: d.title,
      category: d.category,
      fileType: d.fileType,
      fileUrl: d.fileUrl,
      previewUrl: d.previewUrl,
      fileSize: d.fileSize,
      referenceNumber: d.referenceNumber,
      uploadedAt: d.uploadedAt,
      uploadedByMemberId: d.uploadedByMemberId,
      tags: d.tags,
      notes: d.notes,
      remoteUrl: remoteUrl || null,
      updatedAt: d.updatedAt || now,
    });
  }
}

/** Delete propagation: tombstone so pull removes it everywhere. */
export async function pushTombstone(
  tripId: string,
  col: 'expenses' | 'todos' | 'documents',
  id: string
): Promise<void> {
  try {
    const uid = await myUid();
    await supabase.from(col).upsert({
      id,
      tripId,
      _deleted: true,
      updatedAt: Date.now(),
      updatedBy: uid,
    });
  } catch { /* offline — local delete stands */ }
}

/** One-time pull (join / refresh). */
export async function pullTripShared(tripId: string): Promise<RemoteSnapshot | null> {
  try {
    const [tripRes, expRes, todoRes, docRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase.from('expenses').select('*').eq('tripId', tripId),
      supabase.from('todos').select('*').eq('tripId', tripId),
      supabase.from('documents').select('*').eq('tripId', tripId),
    ]);
    return {
      trip: (tripRes.data || {}) as RemoteSnapshot['trip'],
      expenses: (expRes.data || []) as Expense[],
      todos: (todoRes.data || []) as TripTodo[],
      documents: (docRes.data || []) as DocumentVaultItem[],
    };
  } catch {
    return null;
  }
}

/** Live pull: trip + expenses + todos + documents via Supabase Realtime. */
export function subscribeTripShared(tripId: string, cb: (snap: RemoteSnapshot) => void): () => void {
  const state: RemoteSnapshot = { trip: {}, expenses: [], todos: [], documents: [] };
  const emit = () => cb({ ...state });

  // Initial load
  (async () => {
    const snap = await pullTripShared(tripId);
    if (snap) {
      state.trip = snap.trip;
      state.expenses = snap.expenses;
      state.todos = snap.todos;
      state.documents = snap.documents;
      emit();
    }
  })();

  // Subscribe to changes
  const tripSub = supabase
    .channel(`trip:${tripId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        state.trip = {};
      } else {
        state.trip = payload.new as RemoteSnapshot['trip'];
      }
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `tripId=eq.${tripId}` }, (payload) => {
      const row = payload.new as Expense;
      const idx = state.expenses.findIndex((e) => e.id === row.id);
      if (payload.eventType === 'DELETE') {
        state.expenses = state.expenses.filter((e) => e.id !== (payload.old as any).id);
      } else if (idx >= 0) {
        state.expenses[idx] = row;
      } else {
        state.expenses.push(row);
      }
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `tripId=eq.${tripId}` }, (payload) => {
      const row = payload.new as TripTodo;
      const idx = state.todos.findIndex((t) => t.id === row.id);
      if (payload.eventType === 'DELETE') {
        state.todos = state.todos.filter((t) => t.id !== (payload.old as any).id);
      } else if (idx >= 0) {
        state.todos[idx] = row;
      } else {
        state.todos.push(row);
      }
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `tripId=eq.${tripId}` }, (payload) => {
      const row = payload.new as DocumentVaultItem;
      const idx = state.documents.findIndex((d) => d.id === row.id);
      if (payload.eventType === 'DELETE') {
        state.documents = state.documents.filter((d) => d.id !== (payload.old as any).id);
      } else if (idx >= 0) {
        state.documents[idx] = row;
      } else {
        state.documents.push(row);
      }
      emit();
    })
    .subscribe();

  return () => {
    tripSub.unsubscribe();
  };
}

/** Delete entire trip from Supabase (owner only). Cascade handles subtables. */
export async function deleteTripFromFirestore(tripId: string): Promise<void> {
  try {
    await supabase.from('trips').delete().eq('id', tripId);
  } catch { /* offline — local delete stands */ }
}

/** Delete invite lookup by code. */
export async function deleteInviteByCode(code: string): Promise<void> {
  try {
    await supabase.from('invites').delete().eq('code', code);
  } catch { /* best effort */ }
}
