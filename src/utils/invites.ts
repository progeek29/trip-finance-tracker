import { supabase, ensureCloudUser, makeInviteCode } from './supabaseClient';
import { loadUserProfile } from './storage';
import { pullTripShared } from './sync';
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

/** Publish trip to Supabase: write trip doc + invite lookup. */
export async function publishTripInvite(trip: Trip): Promise<{ trip: Trip; code: string }> {
  if (!trip.inviteCode) return { trip, code: trip.inviteCode ?? '' };

  console.log('publishTripInvite: writing code', trip.inviteCode, 'for trip', trip.id);

  // Write trip doc FIRST (invite has FK to trips)
  const { error: tripErr } = await supabase.from('trips').upsert({
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
    updatedAt: Date.now(),
  });
  if (tripErr) console.error('publishTripInvite trip error:', tripErr);

  // Write invite lookup AFTER trip exists
  const { error: inviteErr } = await supabase.from('invites').upsert({
    code: trip.inviteCode,
    tripId: trip.id,
  });
  if (inviteErr) console.error('publishTripInvite invite error:', inviteErr);

  return { trip, code: trip.inviteCode };
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

/** Look up trip ID(s) from an invite code. Checks both invites table AND trips table directly. */
export async function lookupInvite(code: string): Promise<string[]> {
  const clean = code.trim().toUpperCase();
  console.log('Looking up invite code:', clean);

  // 1. Try invites table first
  const { data, error } = await supabase.from('invites').select('tripId').eq('code', clean).maybeSingle();
  if (data?.tripId) {
    console.log('lookupInvite result (invites table):', data);
    return [data.tripId];
  }

  // 2. Fallback: check trips table directly (for trips created before invites table was set up)
  const { data: trips } = await supabase.from('trips').select('*').eq('inviteCode', clean);
  if (Array.isArray(trips) && trips.length > 0) {
    console.log('lookupInvite result (trips table fallback):', trips);
    return trips.map((t: any) => t.id);
  }

  console.log('lookupInvite: no trip found for code', clean);
  return [];
}

/** Fetch trip doc from Supabase. */
export async function fetchTrip(tripId: string): Promise<Trip> {
  const { data } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!data) throw new Error('Trip not found');
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

  // Match ONLY by Firebase UID — never by phone
  const existingIdx = members.findIndex((m) => m.uid === user.uid);
  if (existingIdx >= 0) {
    members[existingIdx] = {
      ...members[existingIdx],
      uid: user.uid,
      isCurrentUser: true,
      name: myName || members[existingIdx].name,
      phone: myPhone || members[existingIdx].phone,
      joinedAt: members[existingIdx].joinedAt || nowIso,
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
  await supabase.from('trips').update({ members: mine, updatedAt: Date.now() }).eq('id', tripId);

  return merged;
}

/** Share message for invite code. */
export function shareMessage(title: string, inviteCode: string): string {
  return `Join "${title}" on WanderSync!\nInvite code: ${inviteCode}\n\nOpen the app → tap "Join Trip" → enter code`;
}
