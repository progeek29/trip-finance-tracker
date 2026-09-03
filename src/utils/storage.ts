import { Trip, Expense, TransitReminder, DocumentVaultItem, SharedPhoto, PlaceRecommendation } from '../types';
import { 
  INITIAL_TRIP, 
  INITIAL_EXPENSES, 
  INITIAL_TRANSIT_REMINDERS, 
  INITIAL_DOCUMENTS, 
  INITIAL_PHOTOS, 
  INITIAL_RECOMMENDATIONS,
  INITIAL_TRIPS
} from '../data/mockData';

const STORAGE_KEYS = {
  TRIPS: 'ws_trips_v2',
  ACTIVE_TRIP_ID: 'ws_active_trip_id_v2',
  // Legacy single-trip key (kept for reference)
  TRIP: 'ws_active_trip_v1',
  EXPENSES: 'ws_expenses_v2',
  REMINDERS: 'ws_reminders_v2',
  DOCUMENTS: 'ws_documents_v1',
  PHOTOS: 'ws_photos_v1',
  RECOMMENDATIONS: 'ws_recommendations_v1',
};

// ─── Multi-Trip Support ───────────────────────────────────────────────────────

export function loadTripsData(): Trip[] {
  const saved = localStorage.getItem(STORAGE_KEYS.TRIPS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_TRIPS;
}

export function saveTripsData(trips: Trip[]): void {
  localStorage.setItem(STORAGE_KEYS.TRIPS, JSON.stringify(trips));
}

export function loadActiveTripId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP_ID);
}

export function saveActiveTripId(id: string | null): void {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP_ID, id);
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
  localStorage.setItem(STORAGE_KEYS.TRIP, JSON.stringify(trip));
}

// ─── Expenses (per-trip via tripId filter) ───────────────────────────────────

export function loadExpensesData(): Expense[] {
  const saved = localStorage.getItem(STORAGE_KEYS.EXPENSES);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_EXPENSES;
}

export function saveExpensesData(expenses: Expense[]): void {
  localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export function loadRemindersData(): TransitReminder[] {
  const saved = localStorage.getItem(STORAGE_KEYS.REMINDERS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_TRANSIT_REMINDERS;
}

export function saveRemindersData(reminders: TransitReminder[]): void {
  localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders));
}

// ─── Documents ───────────────────────────────────────────────────────────────

export function loadDocumentsData(): DocumentVaultItem[] {
  const saved = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_DOCUMENTS;
}

export function saveDocumentsData(docs: DocumentVaultItem[]): void {
  localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
}

// ─── Photos ──────────────────────────────────────────────────────────────────

export function loadPhotosData(): SharedPhoto[] {
  const saved = localStorage.getItem(STORAGE_KEYS.PHOTOS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_PHOTOS;
}

export function savePhotosData(photos: SharedPhoto[]): void {
  localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(photos));
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export function loadRecommendationsData(): PlaceRecommendation[] {
  const saved = localStorage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return INITIAL_RECOMMENDATIONS;
}

export function saveRecommendationsData(recs: PlaceRecommendation[]): void {
  localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(recs));
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
