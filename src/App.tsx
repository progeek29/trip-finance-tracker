import React, { useState, useEffect } from 'react';
import {
  Trip,
  Expense,
  TransitReminder,
  DocumentVaultItem,
  SharedPhoto,
  PlaceRecommendation,
} from './types';
import {
  loadTripsData,
  saveTripsData,
  loadActiveTripId,
  saveActiveTripId,
  loadExpensesData,
  saveExpensesData,
  loadRemindersData,
  saveRemindersData,
  loadDocumentsData,
  saveDocumentsData,
  loadPhotosData,
  savePhotosData,
  loadRecommendationsData,
  saveRecommendationsData,
} from './utils/storage';

import { Navbar, CleanTab } from './components/common/Navbar';
import { TripLandingView } from './components/trip/TripLandingView';
import { TripCreateModal } from './components/trip/TripCreateModal';
import { CleanTripView } from './components/trip/CleanTripView';
import { CleanExpensesView } from './components/finance/CleanExpensesView';
import { CleanSplitView } from './components/splitwise/CleanSplitView';
import { CleanVaultView } from './components/vault/CleanVaultView';
import { QuickAddModal } from './components/sms/QuickAddModal';
import { TripEditorModal } from './components/trip/TripEditorModal';

type AppView = 'landing' | 'trip_dashboard';

export function App() {
  const [trips, setTrips] = useState<Trip[]>(loadTripsData);
  const [activeTripId, setActiveTripId] = useState<string | null>(loadActiveTripId);
  const [appView, setAppView] = useState<AppView>('landing');

  const [expenses, setExpenses] = useState<Expense[]>(loadExpensesData);
  const [reminders, setReminders] = useState<TransitReminder[]>(loadRemindersData);
  const [documents, setDocuments] = useState<DocumentVaultItem[]>(loadDocumentsData);
  const [photos, setPhotos] = useState<SharedPhoto[]>(loadPhotosData);
  const [recommendations, setRecommendations] = useState<PlaceRecommendation[]>(loadRecommendationsData);

  const [activeTab, setActiveTab] = useState<CleanTab>('trip');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false);
  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? trips[0];

  useEffect(() => { saveTripsData(trips); }, [trips]);
  useEffect(() => { saveActiveTripId(activeTripId); }, [activeTripId]);
  useEffect(() => { saveExpensesData(expenses); }, [expenses]);
  useEffect(() => { saveRemindersData(reminders); }, [reminders]);
  useEffect(() => { saveDocumentsData(documents); }, [documents]);
  useEffect(() => { savePhotosData(photos); }, [photos]);
  useEffect(() => { saveRecommendationsData(recommendations); }, [recommendations]);

  const tripExpenses = activeTrip ? expenses.filter((e) => e.tripId === activeTrip.id) : [];
  const tripReminders = activeTrip ? reminders.filter((r) => r.tripId === activeTrip.id) : [];
  const tripDocuments = activeTrip ? documents.filter((d) => d.tripId === activeTrip.id) : documents;
  const tripPhotos = activeTrip ? photos.filter((p) => p.tripId === activeTrip.id) : photos;

  const totalSpent = tripExpenses.reduce((a, b) => a + b.amount, 0);

  const handleSelectTrip = (trip: Trip) => {
    setActiveTripId(trip.id);
    setActiveTab('trip');
    setAppView('trip_dashboard');
  };

  const handleCreateTrip = () => {
    setEditingTrip(null);
    setIsTripCreateOpen(true);
  };

  const handleSaveNewTrip = (trip: Trip) => {
    setTrips((prev) => {
      const exists = prev.find((t) => t.id === trip.id);
      return exists ? prev.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...prev];
    });
    setActiveTripId(trip.id);
    setAppView('trip_dashboard');
    setActiveTab('trip');
  };

  const handleUpdateTrip = (updated: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleDeleteTrip = (tripId: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    if (activeTripId === tripId) {
      setActiveTripId(null);
      setAppView('landing');
    }
  };

  const handleEditTripFromLanding = (trip: Trip) => {
    setEditingTrip(trip);
    setIsTripCreateOpen(true);
  };

  const handleSaveExpense = (newOrUpdated: Expense) => {
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === newOrUpdated.id);
      if (exists) return prev.map((e) => (e.id === newOrUpdated.id ? newOrUpdated : e));
      return [newOrUpdated, ...prev];
    });
    setEditingExpense(null);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsQuickAddOpen(true);
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('Delete this expense?')) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  };

  // Reminders
  const handleAddReminder = (r: TransitReminder) => setReminders((prev) => [r, ...prev]);
  const handleUpdateReminder = (r: TransitReminder) => setReminders((prev) => prev.map((x) => (x.id === r.id ? r : x)));
  const handleDeleteReminder = (id: string) => {
    if (confirm('Delete this transit reminder?')) setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  // Vault documents
  const handleAddDocument = (d: DocumentVaultItem) => setDocuments((prev) => [d, ...prev]);
  const handleUpdateDocument = (d: DocumentVaultItem) => setDocuments((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  const handleDeleteDocument = (id: string) => setDocuments((prev) => prev.filter((d) => d.id !== id));

  // Photos
  const handleAddPhoto = (p: SharedPhoto) => setPhotos((prev) => [p, ...prev]);
  const handleUpdatePhoto = (p: SharedPhoto) => setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const handleDeletePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));
  const handleLikePhoto = (photoId: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, likesCount: p.likesCount + 1 } : p)));
  };

  // Places
  const handleAddPlace = (p: PlaceRecommendation) => setRecommendations((prev) => [p, ...prev]);
  const handleUpdatePlace = (p: PlaceRecommendation) => setRecommendations((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const handleDeletePlace = (id: string) => setRecommendations((prev) => prev.filter((p) => p.id !== id));

  if (appView === 'landing') {
    return (
      <>
        <TripLandingView
          trips={trips}
          onSelectTrip={handleSelectTrip}
          onCreateTrip={handleCreateTrip}
          onEditTrip={handleEditTripFromLanding}
          onDeleteTrip={handleDeleteTrip}
        />
        <TripCreateModal
          isOpen={isTripCreateOpen}
          onClose={() => setIsTripCreateOpen(false)}
          onSaveTrip={handleSaveNewTrip}
          editingTrip={editingTrip}
        />
      </>
    );
  }

  if (!activeTrip) {
    setAppView('landing');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between pb-28 selection:bg-indigo-500 selection:text-white">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
        totalSpent={totalSpent}
        totalBudget={activeTrip.totalBudget}
        tripTitle={activeTrip.title}
        onBackToTrips={() => setAppView('landing')}
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {activeTab === 'trip' && (
          <CleanTripView
            trip={activeTrip}
            reminders={tripReminders}
            expenses={tripExpenses}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onOpenTripEditor={() => setIsTripEditorOpen(true)}
            onUpdateTrip={handleUpdateTrip}
            onAddReminder={handleAddReminder}
            onUpdateReminder={handleUpdateReminder}
            onDeleteReminder={handleDeleteReminder}
          />
        )}
        {activeTab === 'expenses' && (
          <CleanExpensesView
            trip={activeTrip}
            expenses={tripExpenses}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}
        {activeTab === 'split' && (
          <CleanSplitView
            trip={activeTrip}
            expenses={tripExpenses}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}
        {activeTab === 'vault' && (
          <CleanVaultView
            documents={tripDocuments}
            photos={tripPhotos}
            recommendations={recommendations}
            trip={activeTrip}
            onLikePhoto={handleLikePhoto}
            onAddDocument={handleAddDocument}
            onUpdateDocument={handleUpdateDocument}
            onDeleteDocument={handleDeleteDocument}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handleUpdatePhoto}
            onDeletePhoto={handleDeletePhoto}
            onAddPlace={handleAddPlace}
            onUpdatePlace={handleUpdatePlace}
            onDeletePlace={handleDeletePlace}
          />
        )}
      </main>

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => { setIsQuickAddOpen(false); setEditingExpense(null); }}
        trip={activeTrip}
        onSaveExpense={handleSaveExpense}
        initialExpense={editingExpense}
      />

      <TripEditorModal
        isOpen={isTripEditorOpen}
        onClose={() => setIsTripEditorOpen(false)}
        trip={activeTrip}
        onSaveTrip={handleUpdateTrip}
      />

      <TripCreateModal
        isOpen={isTripCreateOpen}
        onClose={() => setIsTripCreateOpen(false)}
        onSaveTrip={handleSaveNewTrip}
        editingTrip={editingTrip}
      />
    </div>
  );
}

export default App;
