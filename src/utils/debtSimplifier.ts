import { Expense, SettlementDebt, TripMember, Settlement } from '../types';

export interface MemberBalance {
  memberId: string;
  member: TripMember;
  totalPaid: number;
  totalOwed: number;
  netBalance: number; // positive = get back, negative = owes
}

/**
 * Calculates net balances for each member based on group expenses.
 * Settlements (recorded pay-backs) adjust ONLY the balance ledger —
 * spend totals are never touched.
 */
export function calculateMemberBalances(members: TripMember[], expenses: Expense[], settlements: Settlement[] = []): MemberBalance[] {
  const memberMap = new Map<string, TripMember>(members.map(m => [m.id, m]));
  
  // Initialize balance map
  const paidMap = new Map<string, number>();
  const owedMap = new Map<string, number>();

  members.forEach(m => {
    paidMap.set(m.id, 0);
    owedMap.set(m.id, 0);
  });

  expenses.forEach(exp => {
    if (!exp.isGroupExpense && exp.splits.length <= 1) {
      // Individual personal expense, not split among group
      return;
    }

    // Add amount paid by the payer
    const currentPaid = paidMap.get(exp.paidByMemberId) || 0;
    paidMap.set(exp.paidByMemberId, currentPaid + exp.amount);

    // Add amount owed by each split participant
    exp.splits.forEach(split => {
      const currentOwed = owedMap.get(split.memberId) || 0;
      owedMap.set(split.memberId, currentOwed + split.amount);
    });
  });

  return members.map(m => {
    const totalPaid = paidMap.get(m.id) || 0;
    const totalOwed = owedMap.get(m.id) || 0;
    // Settlements: fromMember paid outside the expense list → their net rises,
    // receiver's net falls. Spend ledger untouched.
    let settledOut = 0;
    let settledIn = 0;
    for (const s of settlements) {
      const amt = Number(s.amount) || 0;
      if (s.fromMemberId === m.id) settledOut += amt;
      if (s.toMemberId === m.id) settledIn += amt;
    }
    const netBalance = Math.round((totalPaid - totalOwed + settledOut - settledIn) * 100) / 100;

    return {
      memberId: m.id,
      member: memberMap.get(m.id) || m,
      totalPaid,
      totalOwed,
      netBalance,
    };
  });
}

/**
 * Minimum Cash Flow Algorithm to simplify group debts into the fewest transactions
 */
export function simplifyDebts(balances: MemberBalance[]): SettlementDebt[] {
  // Filter into debtors and creditors
  interface Person {
    memberId: string;
    amount: number;
  }

  const debtors: Person[] = []; // owes money (negative net balance)
  const creditors: Person[] = []; // receives money (positive net balance)

  balances.forEach(b => {
    if (b.netBalance < -0.01) {
      debtors.push({ memberId: b.memberId, amount: -b.netBalance });
    } else if (b.netBalance > 0.01) {
      creditors.push({ memberId: b.memberId, amount: b.netBalance });
    }
  });

  // Sort descending by amount for greedy matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements: SettlementDebt[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settledAmount = Math.min(debtor.amount, creditor.amount);
    const roundedAmount = Math.round(settledAmount * 100) / 100;

    if (roundedAmount > 0) {
      settlements.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: roundedAmount,
      });
    }

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount < 0.01) {
      i++;
    }
    if (creditor.amount < 0.01) {
      j++;
    }
  }

  return settlements;
}
