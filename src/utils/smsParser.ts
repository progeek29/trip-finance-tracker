import { ExpenseCategory, SMSParseResult } from '../types';

/**
 * Intelligent Bank SMS & Debit Notification Parser
 * Supports major banks & UPI applications (HDFC, SBI, ICICI, Axis, Kotak, PayTM, PhonePe, GPay)
 */
export function parseBankSMS(smsText: string): SMSParseResult | null {
  if (!smsText || typeof smsText !== 'string') return null;

  const cleanText = smsText.trim();

  // Check if it is a debit message
  const debitKeywords = ['debited', 'debit', 'paid', 'spent', 'sent', 'deducted', 'withdrawn', 'purchase', 'used for', 'payment of', 'txn of', 'transaction of'];
  const isDebit = debitKeywords.some(kw => cleanText.toLowerCase().includes(kw));

  // Check for credit keywords that might disqualify
  const creditKeywords = ['credited', 'refunded', 'received', 'cashback'];
  const hasCredit = creditKeywords.some(kw => cleanText.toLowerCase().includes(kw));

  if (!isDebit || (hasCredit && !cleanText.toLowerCase().includes('debited'))) {
    // If not a debit transaction
    return null;
  }

  // 1. Amount Extraction (Matches INR, Rs., Rs, INR., ₹ followed by numbers and optional commas/decimals)
  const amountPatterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:for|amount of|of)\s+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+\.\d{2})\s*(?:debited|credited|paid)/i,
  ];
  let amount = 0;
  for (const re of amountPatterns) {
    const m = cleanText.match(re);
    if (m && m[1]) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(v) && v > 0) { amount = v; break; }
    }
  }

  if (!amount || isNaN(amount)) return null;

  // 2. Bank / Wallet Name Extraction
  let bankName = 'Bank / UPI';
  if (/HDFC/i.test(cleanText)) bankName = 'HDFC Bank';
  else if (/SBI|State Bank/i.test(cleanText)) bankName = 'State Bank of India';
  else if (/ICICI/i.test(cleanText)) bankName = 'ICICI Bank';
  else if (/Axis/i.test(cleanText)) bankName = 'Axis Bank';
  else if (/Kotak/i.test(cleanText)) bankName = 'Kotak Bank';
  else if (/Yes Bank|YESBANK/i.test(cleanText)) bankName = 'Yes Bank';
  else if (/Punjab|PNB/i.test(cleanText)) bankName = 'PNB';
  else if (/Canara/i.test(cleanText)) bankName = 'Canara Bank';
  else if (/PhonePe/i.test(cleanText)) bankName = 'PhonePe UPI';
  else if (/Paytm/i.test(cleanText)) bankName = 'Paytm';
  else if (/Google\s*Pay|GPay/i.test(cleanText)) bankName = 'Google Pay';
  else if (/BHIM/i.test(cleanText)) bankName = 'BHIM UPI';
  else if (/Amazon Pay/i.test(cleanText)) bankName = 'Amazon Pay';

  // 3. Account / Card ending
  const acctMatch = /(?:A\/C|Acct|Card|ending|XX)\s*(?:no\.?)?\s*([X\*\d]{2,4}\d{2,4}|\d{4})/i.exec(cleanText);
  const accountEnding = acctMatch ? acctMatch[1] : undefined;

  // 4. Merchant / Payee Extraction
  let merchant = 'General Debit';
  const merchantPatterns = [
    /(?:at|to|info\/|transfer to|VPA|paid to)\s+([A-Za-z0-9\s&'-]+?)(?:\s+on|\s+ref|\s+UPI|\s+Avail|\s+Bal|\.|$)/i,
    /(?:used at|towards)\s+([A-Za-z0-9\s&'-]+?)(?:\s+on|\s+at|\.|$)/i,
  ];

  for (const pattern of merchantPatterns) {
    const match = pattern.exec(cleanText);
    if (match && match[1] && match[1].trim().length > 1) {
      const candidate = match[1].trim();
      // Avoid junk words
      if (!['your', 'the', 'rs', 'inr'].includes(candidate.toLowerCase())) {
        merchant = candidate.slice(0, 35);
        break;
      }
    }
  }

  // 5. Intelligent Category Inference
  const category = inferCategoryFromMerchant(merchant + ' ' + cleanText);

  // 6. Date & Time
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    amount,
    merchant,
    bankName,
    accountEnding,
    date: dateStr,
    time: timeStr,
    category,
    rawSMS: cleanText,
    isDebit: true,
  };
}

/**
 * Maps merchant and transaction keywords to travel expense categories
 */
export function inferCategoryFromMerchant(text: string): ExpenseCategory {
  const lower = text.toLowerCase();

  if (/shack|curlies|thalassa|titos|club|bar|beer|liquor|brewery|pub|wine|cocktail/i.test(lower)) {
    return 'drinks';
  }
  if (/restaurant|cafe|dhaba|zomato|swiggy|mcdonald|kfc|starbucks|burger|pizza|diner|food|kitchen|bakery/i.test(lower)) {
    return 'food';
  }
  if (/uber|ola|rapido|indigo|air india|irctc|railway|train|zingbus|redbus|flight|cab|taxi|metro|toll/i.test(lower)) {
    return 'transit';
  }
  if (/taj|marriott|resort|hotel|hostel|airbnb|stay|villa|oyo|booking\.com|agoda/i.test(lower)) {
    return 'stay';
  }
  if (/scuba|watersports|trek|entry|ticket|cruise|safari|cinema|museum|monument|fort|parasailing|casino/i.test(lower)) {
    return 'activities';
  }
  if (/petrol|fuel|diesel|hpcl|bpcl|ioc|shell|gas station/i.test(lower)) {
    return 'fuel';
  }
  if (/bazaar|market|mall|decathlon|zara|souvenir|store|supermarket|mart|shop/i.test(lower)) {
    return 'shopping';
  }
  if (/hospital|pharmacy|chemist|clinic|apollo|medplus/i.test(lower)) {
    return 'emergency';
  }

  return 'other';
}

/**
 * Recurring/non-trip debits that must NEVER auto-log as trip expenses:
 * SIP, mutual funds, EMIs, loans, rent, credit-card bills, insurance, etc.
 * A 3rd-May Rs.6000 SIP during a trip stays out of the ledger.
 */
const RECURRING_SKIP_PATTERNS = [
  /\bsips?\b/i,
  /mutual\s*fund/i,
  /\bamc\b/i,
  /\bemi\b/i,
  /equated/i,
  /\brent\b/i,
  /house\s*rent/i,
  /credit\s*card.*(bill|due|payment|outstanding|autopay|minimum)/i,
  /(bill|due|outstanding).*(credit\s*card)/i,
  /insurance/i,
  /\blic\b/i,
  /\bloan\b/i,
  /\bppf\b/i,
  /\bnps\b/i,
  /\brd\b/i,
  /\brecurring\b/i,
  /demat/i,
  /zerodha/i,
  /groww/i,
  /upstox/i,
  /angel\s*one/i,
  /folio/i,
  /\bnach\b/i,
  /\becs\b/i,
  /mandate/i,
  /premium\s*(paid|due|debit)/i,
];

export function isRecurringDebit(smsText: string): boolean {
  const t = (smsText || '').toLowerCase();
  return RECURRING_SKIP_PATTERNS.some((re) => re.test(t));
}

/**
 * Checks whether an expense date falls within an active trip date range
 */
export function isDateWithinTrip(dateStr: string, startDate: string, endDate: string): boolean {
  const target = new Date(dateStr).getTime();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  // Allow leeway of 1 day before/after
  return target >= start - 86400000 && target <= end + 86400000;
}
