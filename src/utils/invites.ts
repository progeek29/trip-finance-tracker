import { supabase, ensureCloudUser, makeInviteCode } from './supabaseClient';
import { loadUserProfile } from './storage';
import { pullTripShared } from './sync';
import { sendChatMessage } from './chat';
import { sendChatViaSocket } from './socket';
import { getRandomEmoji } from './avatar';
import type { Trip, TripMember } from '../types';

/**
 * Invite-code flow: create → lookup → join.
 * Uses Supabase DB (invites + trips tables).
 */

export { makeInviteCode };

/** Generate a unique 6-char code not already in DB. */
async function freshUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = makeInviteCode();
    const { data } = await supabase.from('invites').select('code').eq('code', candidate).maybeSingle();
    if (!data) return candidate;
  }
  return makeInviteCode() + 'X'; // fallback
}

/** Publish trip to Supabase: write trip doc + invite lookup. Always ensures a code exists. */
export async function publishTripInvite(trip: Trip): Promise<{ trip: Trip; code: string }> {
  let code = trip.inviteCode?.trim().toUpperCase() || '';
  let working: Trip = trip;

  // Trip without a code (old local trip) → mint one now so join never says NOT_FOUND
  if (!code) {
    code = await freshUniqueCode();
    working = { ...trip, inviteCode: code };
  } else {
    // Collision guard: same code pointing at a DIFFERENT trip → mint a fresh one
    try {
      const { data } = await supabase.from('invites').select('tripId').eq('code', code).maybeSingle();
      const owner = (data as { tripId?: string } | null)?.tripId;
      if (owner && owner !== trip.id) {
        code = await freshUniqueCode();
        working = { ...trip, inviteCode: code };
      }
    } catch { /* offline — keep local code */ }
  }

  console.log('publishTripInvite: writing code', code, 'for trip', working.id);

  // Write trip doc FIRST (invite has FK to trips)
  const { error: tripErr } = await supabase.from('trips').upsert({
    id: working.id,
    title: working.title,
    description: working.description,
    coverImage: working.coverImage,
    startDate: working.startDate,
    endDate: working.endDate,
    totalBudget: working.totalBudget,
    currency: working.currency,
    inviteCode: code,
    ownerUid: working.ownerUid,
    cities: working.cities,
    members: working.members,
    isActive: working.isActive,
    status: working.status,
    updatedAt: Date.now(),
  });
  if (tripErr) {
    console.error('publishTripInvite trip error:', tripErr);
    throw new Error('PUBLISH_FAILED');
  }

  // Write invite lookup AFTER trip exists
  const { error: inviteErr } = await supabase.from('invites').upsert({
    code,
    tripId: working.id,
  });
  if (inviteErr) {
    console.error('publishTripInvite invite error:', inviteErr);
    throw new Error('PUBLISH_FAILED');
  }

  return { trip: working, code };
}

/** Reset trip invite code (delete old, create new). */
export async function resetTripInviteCode(trip: Trip): Promise<Trip> {
  const oldCode = trip.inviteCode;
  const newCode = await freshUniqueCode();

  // Delete old invite
  if (oldCode) {
    await supabase.from('invites').delete().eq('code', oldCode);
  }

  // Write new invite + update trip
  await supabase.from('invites').upsert({ code: newCode, tripId: trip.id });
  await supabase.from('trips').update({ inviteCode: newCode, updatedAt: Date.now() }).eq('id', trip.id);

  return { ...trip, inviteCode: newCode };
}

/** Look up trip ID(s) from an invite code. Throws NOT_FOUND when the code doesn't exist. */
export async function lookupInvite(code: string): Promise<string[]> {
  const clean = code.trim().toUpperCase();
  if (clean.length < 4) throw new Error('NOT_FOUND');
  console.log('Looking up invite code:', clean);

  // 1. Try invites table first
  try {
    const { data } = await supabase.from('invites').select('tripId').eq('code', clean).maybeSingle();
    const tripId = (data as { tripId?: string } | null)?.tripId;
    if (tripId) {
      console.log('lookupInvite result (invites table):', data);
      return [tripId];
    }
  } catch (e) {
    // Network/server failure → let caller show the retry message (not NOT_FOUND)
    if (e instanceof TypeError) throw e;
    throw e;
  }

  // 2. Fallback: check trips table directly (for trips created before invites table was set up)
  const { data: trips } = await supabase.from('trips').select('*').eq('inviteCode', clean);
  const tripRows = (trips ?? []) as { id: string }[];
  if (tripRows.length > 0) {
    console.log('lookupInvite result (trips table fallback):', trips);
    const ids = tripRows.map((t) => t.id).filter(Boolean);
    if (ids.length > 0) return ids;
  }

  console.log('lookupInvite: no trip found for code', clean);
  throw new Error('NOT_FOUND');
}

/** Fetch trip doc from Supabase. */
export async function fetchTrip(tripId: string): Promise<Trip> {
  const { data } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!data) throw new Error('NOT_FOUND');
  return data as unknown as Trip;
}

/** Join one specific trip (links me by uid, else adds me as new member). */
export async function joinTripById(tripId: string): Promise<Trip> {
  const remote = await fetchTrip(tripId);
  const user = await ensureCloudUser();
  const profile = loadUserProfile();
  const myName = profile?.name || 'Friend';
  const myPhone = profile?.phone || '';
  const members: TripMember[] = [...(remote.members || [])];
  const nowIso = new Date().toISOString();

  // Match by uid first; else adopt the pre-added row with my phone number
  // (if the owner already entered this name+number, adopt that row instead of
  // creating a duplicate member — the joiner inherits its budget/split history).
  // Phone match only when both sides have a real number, so an empty number
  // never matches the wrong row.
  const digits = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
  const myDigits = digits(myPhone);
  let existingIdx = members.findIndex((m) => m.uid === user.uid);
  if (existingIdx < 0 && myDigits.length === 10) {
    existingIdx = members.findIndex((m) => !m.uid && digits(m.phone) === myDigits && myDigits !== '');
  }
  // First-time join? (uid was not linked before) — post the join message only then
  const hadUid = existingIdx >= 0 && !!members[existingIdx].uid;
  if (existingIdx >= 0) {
    const prev = members[existingIdx];
    members[existingIdx] = {
      ...prev,
      uid: user.uid,
      isCurrentUser: true,
      // Keep your real name if you have one; otherwise keep the name the owner
      // entered (never overwrite it with "Friend")
      name: profile?.name?.trim() || prev.name,
      phone: myPhone || prev.phone,
      joinedAt: prev.joinedAt || nowIso,
    };
  } else {
    members.push({
      id: `m_${user.uid.slice(0, 8)}`,
      name: myName,
      avatar: getRandomEmoji(),
      isCurrentUser: true,
      phone: myPhone,
      uid: user.uid,
      joinedAt: nowIso,
    });
  }

  const mine = members.map((m) => (m.uid && m.uid === user.uid ? m : { ...m, isCurrentUser: false }));
  const merged: Trip = { ...remote, members: mine };

  // Update trip members
  const { error: updErr } = await supabase.from('trips').update({ members: mine, updatedAt: Date.now() }).eq('id', tripId);
  if (updErr) throw new Error('JOIN_FAILED');

  // Self-heal: old trips may lack an invites row → re-create it so the code never 404s
  try {
    if (merged.inviteCode) {
      await supabase.from('invites').upsert({ code: merged.inviteCode.trim().toUpperCase(), tripId });
    }
  } catch { /* best effort */ }

  try {
    await supabase.from('members_joined').insert({ id: `${tripId}_${user.uid}`, tripId, uid: user.uid });
  } catch { /* best effort */ }

  // First join only: "@Name joined the Goa trip squad" (dynamic trip title)
  if (!hadUid) {
    const joinName = (profile?.name?.trim() || members[existingIdx]?.name?.replace(/\(You\)/g, '').trim() || 'Friend');
    const tripName = (remote.title || 'the trip').trim().slice(0, 40);
    const joinText = `@${joinName} joined the ${tripName} trip squad`;
    const payload = {
      id: `msg_join_${tripId}_${user.uid}`,
      tripId,
      type: 'system',
      text: joinText,
      senderId: user.uid,
      senderName: joinName,
    };
    // Socket (live) → fallback REST — it should arrive one way or another
    sendChatViaSocket(payload).catch(() => {
      sendChatMessage(tripId, joinName, { type: 'system', text: joinText }).catch(() => {});
    });
  }

  return merged;
}

/** Share message for invite code. */
export function shareMessage(title: string, inviteCode: string): string {
  return `Join "${title}" on WanderSync!\nInvite code: ${inviteCode}\n\nOpen the app → tap "Join Trip" → enter code`;
}
