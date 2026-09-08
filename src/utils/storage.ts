import { Trip, Expense, TransitReminder, DocumentVaultItem, SharedPhoto, PlaceRecommendation, TripTodo } from '../types';
import { 
  INITIAL_TRIP, 
  INITIAL_EXPENSES, 
  INITIAL_TRANSIT_REMINDERS, 
  INITIAL_DOCUMENTS, 
  INITIAL_PHOTOS, 
  INITIAL_RECOMMENDATIONS
} from '../data/mockData';

const STORAGE_KEYS = {  TRIPS: 'ws_trips_v2',
  ACTIVE_TRIP_ID: 'ws_active_trip_id_v2',
  // Legacy single-trip key (kept for reference)
  TRIP: 'ws_active_trip_v1',
  EXPENSES: 'ws_expenses_v2',
  REMINDERS: 'ws_reminders_v2',
  DOCUMENTS: 'ws_documents_v1',
  PHOTOS: 'ws_photos_v1',
  RECOMMENDATIONS: 'ws_recommendations_v1',
};

// ─── Safe write (localStorage ~5MB quota: a raw phone photo can burst it) ───

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error('Storage write failed (quota?) for', key, e);
    alert('Phone storage is full — that file was too big to save. Try a smaller photo and save again.');
  }
}

export function loadTripsData(): Trip[] {
  const saved = localStorage.getItem(STORAGE_KEYS.TRIPS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function saveTripsData(trips: Trip[]): void {
  safeSet(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
}

export function loadActiveTripId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP_ID);
}

export function saveActiveTripId(id: string | null): void {
  if (id) {
    safeSet(STORAGE_KEYS.ACTIVE_TRIP_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP_ID);
  }
}

// ─── Legacy single-trip (kept for backward compat) ───────────────────────────

export function loadTripData(): Trip {
  const saved = localStorage.getItem(STORAGE_KEYS.TRIP);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_TRIP;
}

export function saveTripData(trip: Trip): void {
  safeSet(STORAGE_KEYS.TRIP, JSON.stringify(trip));
}

// ─── Expenses (per-trip via tripId filter) ───────────────────────────────────

export function loadExpensesData(): Expense[] {
  const saved = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function saveExpensesData(expenses: Expense[]): void {
  safeSet(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export function loadRemindersData(): TransitReminder[] {
  const saved = localStorage.getItem(STORAGE_KEYS.REMINDERS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function saveRemindersData(reminders: TransitReminder[]): void {
  safeSet(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders));
}

// ─── Documents ───────────────────────────────────────────────────────────────

export function loadDocumentsData(): DocumentVaultItem[] {
  const saved = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function saveDocumentsData(docs: DocumentVaultItem[]): void {
  safeSet(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export function loadPhotosData(): SharedPhoto[] {
  const saved = localStorage.getItem(STORAGE_KEYS.PHOTOS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function savePhotosData(photos: SharedPhoto[]): void {
  safeSet(STORAGE_KEYS.PHOTOS, JSON.stringify(photos));
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export function loadRecommendationsData(): PlaceRecommendation[] {
  const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
}

export function saveRecommendationsData(recs: PlaceRecommendation[]): void {
  safeSet(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recs));
}

// ─── User profile (login: naam + mobile, poori app me "you") ───────────────

export type UserRole = 'admin' | 'owner' | 'user';

export interface UserProfile {
  name: string;
  phone: string;
  role?: UserRole;
  /** ISO date the user first registered on this phone */
  joinedAt?: string;
}

export function getAdminStatus(name: string, phone: string): boolean {
  return name.trim().toLowerCase() === 'krey' && phone.replace(/\D/g, '') === '1234567890';
}

const PROFILE_KEY = 'ws_user_profile_v1';

export function loadUserProfile(): UserProfile | null {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (p && typeof p.name === 'string' && p.name.trim()) return { name: p.name.trim(), phone: String(p.phone || ''), role: p.role, joinedAt: p.joinedAt };
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export function saveUserProfile(profile: UserProfile): void {
  safeSet(PROFILE_KEY, JSON.stringify(profile));
}

// ─── Trip checklist (tiny text — localStorage is fine) ─────────────────────

const TODOS_KEY = 'ws_todos_v1';

export function loadTodosData(): TripTodo[] {
  try {
    const saved = localStorage.getItem(TODOS_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function saveTodosData(todos: TripTodo[]): void {
  safeSet(TODOS_KEY, JSON.stringify(todos));
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function exportCompleteTripJSON(): string {
  const data = {
    trips: loadTripsData(),
    activeTripId: loadActiveTripId(),
    expenses: loadExpensesData(),
    reminders: loadRemindersData(),
    documents: loadDocumentsData(),
    photos: loadPhotosData(),
    recommendations: loadRecommendationsData(),
    exportedAt: new Date().toISOString(),
    version: '2.0.0',
  };
  return JSON.stringify(data, null, 2);
}

export function resetToDemoData(): void {
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  window.location.reload();
}
