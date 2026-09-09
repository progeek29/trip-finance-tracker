import type { Trip, Expense } from '../types';

/**
 * Budget mapping — single source of truth, used on every surface:
 * cards, navbar, trip view, squad list.
 *
 * OWNER → the trip's total budget (personal budget never applies to owners;
 *         owner edits it via Edit Trip).
 * MEMBER → their own personal budget (0 = not set).
 */

export function myMemberOf(trip: Trip, myUid?: string | null) {
  return (
    (myUid ? trip.members.find((m) => m.uid === myUid) : undefined) ||
    trip.members.find((m) => m.isCurrentUser)
  );
}

export function isTripOwner(trip: Trip, myUid?: string | null, isAdmin = false): boolean {
  return isAdmin || !trip.ownerUid || trip.ownerUid === myUid;
}

/** This viewer's share of costs = sum of their split amounts. */
export function myShareSpent(trip: Trip, expenses: Expense[], myUid?: string | null): number {
  const me = myMemberOf(trip, myUid);
  if (!me) return 0;
  return expenses.reduce((sum, e) => {
    const s = e.splits.find((x) => x.memberId === me.id);
    return sum + (Number(s?.amount) || 0);
  }, 0);
}

export interface ViewerBudget {
  /** true → personal budget applies; false → trip total applies (owner). */
  personal: boolean;
  /** The budget number to display. */
  budget: number;
  /** The spent number to display against it. */
  spent: number;
}

export function viewerBudget(
  trip: Trip,
  tripExpenses: Expense[],
  myUid?: string | null,
  isAdmin = false
): ViewerBudget {
  if (isTripOwner(trip, myUid, isAdmin)) {
    const spent = tripExpenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    return { personal: false, budget: Number(trip.totalBudget) || 0, spent };
  }
  const me = myMemberOf(trip, myUid);
  return {
    personal: true,
    budget: Number(me?.budget) || 0,
    spent: myShareSpent(trip, tripExpenses, myUid),
  };
}
