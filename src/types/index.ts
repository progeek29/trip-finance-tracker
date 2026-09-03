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

export interface Expense {
  id: string;
  tripId: string;
  cityId?: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  paymentMode: PaymentMode;
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

export interface DocumentVaultItem {
  id: string;
  tripId: string;
  title: string;
  category: 'ticket' | 'id_proof' | 'hotel' | 'visa' | 'insurance' | 'rental' | 'other';
  fileType: 'pdf' | 'image' | 'link';
  fileUrl?: string;
  previewUrl?: string;
  fileSize?: string;
  notes?: string;
  uploadedAt: string;
  uploadedByMemberId: string;
  tags?: string[];
  referenceNumber?: string;
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
  bestTimeToVisit?: string;
  tips?: string;
  authorName: string;
  authorAvatar: string;
  verifiedByTrip: boolean;
  addressOrLandmark?: string;
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
  status: 'upcoming' | 'ongoing' | 'completed';
}

export interface SMSParseResult {
  amount: number;
  merchant: string;
  bankName: string;
  accountEnding?: string;
  date: string;
  time: string;
  category: ExpenseCategory;
  rawSMS: string;
  isDebit: boolean;
}
