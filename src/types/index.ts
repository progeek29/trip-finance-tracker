export type ExpenseCategory = 
  | 'food' 
  | 'transit' 
  | 'stay' 
  | 'activities' 
  | 'shopping' 
  | 'fuel' 
  | 'emergency' 
  | 'drinks' 
  | 'other';

export type PaymentMode = 'upi' | 'card' | 'cash' | 'netbanking' | 'sms_auto';

export interface TripMember {
  id: string;
  name: string;
  avatar: string;
  avatarColor?: string;
  isCurrentUser?: boolean;
  phone?: string;
  upiId?: string;
  /** Firebase anonymous uid of this member's device (pairing + targeted notifications) */
  uid?: string;
  /** ISO date this member joined the trip */
  joinedAt?: string;
  /** Per-member budget (in INR) — each member can set their own spend limit */
  budget?: number;
}

export interface CityStop {
  id: string;
  name: string;
  stateOrCountry: string;
  startDate: string;
  endDate: string;
  budget: number;
  bannerImage?: string;
  notes?: string;
}

export interface ExpenseSplit {
  memberId: string;
  amount: number;
  percentage?: number;
}

export interface SyncedMeta {
  updatedAt?: number;
  updatedBy?: string;
}

export interface Expense extends SyncedMeta {
  id: string;
  tripId: string;
  cityId?: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paymentMode?: PaymentMode;
  paidByMemberId: string;
  date: string;
  time?: string;
  notes?: string;
  isGroupExpense: boolean;
  splits: ExpenseSplit[]; // how it's divided
  receiptUrl?: string;
  isAutoParsedSMS?: boolean;
  originalSMS?: string;
}

export interface SettlementDebt {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/** Recorded pay-back between two members. Balance ledger only — never touches spend. */
export interface Settlement extends SyncedMeta {
  id: string;
  tripId: string;
  fromMemberId: string; // who paid (the ower)
  toMemberId: string; // who received
  amount: number;
  date: string;
  note?: string;
}

/** Transparent edit log for expenses — visible in trip history. */
export interface ExpenseEvent {
  id: string;
  tripId: string;
  expenseId: string;
  action: 'created' | 'updated' | 'deleted';
  title: string;
  amount: number;
  byUid?: string;
  byName: string;
  at: number;
}

export interface TransitReminder {
  id: string;
  tripId: string;
  title: string;
  type: 'flight' | 'train' | 'bus' | 'cab' | 'hotel_checkin';
  transitNumber?: string; // e.g. 6E-204, 12051 Madgaon Exp
  operator?: string; // IndiGo, IRCTC, Zingbus
  departureLocation: string;
  arrivalLocation: string;
  departureTime: string; // ISO string or format
  arrivalTime: string;
  pnrOrBookingRef?: string;
  seatOrBerth?: string;
  terminalGate?: string;
  reminderHoursBefore: number;
  ticketDocumentId?: string;
  isCompleted?: boolean;
}

export interface DocumentVaultItem extends SyncedMeta {
  id: string;
  tripId: string;
  title: string;
  category: 'ticket' | 'id_proof' | 'hotel' | 'visa' | 'insurance' | 'rental' | 'other';
  fileType: 'pdf' | 'image' | 'csv' | 'file' | 'link';
  fileUrl?: string;
  previewUrl?: string;
  fileName?: string;
  fileSize?: string;
  notes?: string;
  uploadedAt: string;
  uploadedByMemberId: string;
  tags?: string[];
  referenceNumber?: string;
  /** Extra "about this stay" write-up shown on the ticket card (hotel category) */
  stayDetails?: string;
  /** Extra stay photos shown on the ticket card (hotel category) */
  stayPhotos?: string[];
  /** Bell on the ticket itself — remind datetime (ISO) + free-text note */
  remindAt?: string;
  reminderNote?: string;
  /** Phone folder mirror path(s): Documents/WanderSync/<trip>/ (native only) */
  phonePath?: string;
  phonePaths?: string[];
}

export interface SharedPhoto {
  id: string;
  tripId: string;
  cityId?: string;
  url: string;
  caption?: string;
  uploadedByMemberId: string;
  uploadedByName: string;
  uploadedAt: string;
  likesCount: number;
  locationTag?: string;
  isPublicHighlight?: boolean;
  /** Phone folder mirror path (native only) */
  phonePath?: string;
}

export interface PlaceRecommendation {
  id: string;
  title: string;
  cityName: string;
  category: 'must_visit' | 'food_cafe' | 'stay' | 'hidden_gem' | 'adventure';
  description: string;
  estimatedFareOrCost: number; // in INR
  costType: 'per_person' | 'per_night' | 'entry_fee' | 'meal_for_two';
  rating: number; // 1-5
  imageUrl: string;
  /** Extra photos for this place (imageUrl stays the cover for compat) */
  imageUrls?: string[];
  bestTimeToVisit?: string;
  tips?: string;
  authorName: string;
  authorAvatar: string;
  verifiedByTrip: boolean;
  addressOrLandmark?: string;
  /** Phone folder mirror paths (native only) */
  phonePaths?: string[];
}

export interface Trip {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  currency: string;
  members: TripMember[];
  cities: CityStop[];
  isActive: boolean;
  status: 'upcoming' | 'inprogress' | 'completed';
  /** 6-char share code (created on Share, used to join from other phones) */
  inviteCode?: string;
  /** Firebase uid of the trip creator (admin) */
  ownerUid?: string;
}

export interface TripTodo extends SyncedMeta {
  id: string;
  tripId: string;
  text: string;
  done: boolean;
  createdAt: string;
  /** Creator's uid — har user ka TODO separate dikhta hai */
  ownerUid?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'location' | 'siren' | 'system' | 'bell';
  text?: string;
  mentions?: { id: string; name: string }[];
  lat?: number;
  lng?: number;
  replyTo?: { id: string; senderName: string; text: string };
  createdAt?: unknown;
}

export interface SMSParseResult {  amount: number;
  merchant: string;
  bankName: string;
  accountEnding?: string;
  date: string;
  time: string;
  category: ExpenseCategory;
  rawSMS: string;
  isDebit: boolean;
}
