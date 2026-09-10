import React, { useState, useEffect, useRef } from 'react';
import {
  Trip,
  Expense,
  DocumentVaultItem,
  SharedPhoto,
  PlaceRecommendation,
  TripTodo,
  ChatMessage,
  Settlement,
  ExpenseEvent,
} from './types';
import { Receipt } from 'lucide-react';
import {
  loadTripsData,
  saveTripsData,
  loadActiveTripId,
  saveActiveTripId,
  loadUserProfile,
  saveUserProfile,
  getAdminStatus,
  type UserProfile,
  loadExpensesData,
  saveExpensesData,
  loadDocumentsData,
  saveDocumentsData,
  loadPhotosData,
  savePhotosData,
  loadRecommendationsData,
  saveRecommendationsData,
  loadTodosData,
  saveTodosData,
  loadSettlementsData,
  saveSettlementsData,
  loadExpenseEventsData,
  saveExpenseEventsData,
} from './utils/storage';

import { Navbar, CleanTab } from './components/common/Navbar';
import { AtSign, Bell, Check, MapPin, MessageCircle, Radio } from 'lucide-react';
import { WelcomeScreen } from './components/trip/WelcomeScreen';
import { ChatView } from './components/chat/ChatView';
import { TodoView } from './components/todo/TodoView';
import { publishTripInvite, lookupInvite, joinTripById, shareMessage } from './utils/invites';
import { ensureCloudUser, authGetUser, authSignOut, supabase } from './utils/supabaseClient';
import { pushTripShared, subscribeTripShared, pushTombstone, deleteTripFromFirestore, deleteInviteByCode, type RemoteSnapshot } from './utils/sync';
import { joinTripRoom } from './utils/socket';
import { playReceiverSiren, playChime as playChimeSoft } from './utils/chime';
import { registerPushToken } from './utils/push';
import { playVoiceLoud, deleteVoiceFile, ringLocalSiren, markVoicePlayed, wasVoicePlayed } from './utils/voice';
import { consumePendingVoice, fetchLatestVoiceClip, fetchVoiceClipByUrl, lastNativePlayed } from './utils/voiceWake';
import { PushNotifications } from '@capacitor/push-notifications';
import { ShareDialog } from './components/common/ShareDialog';
import { TripLandingView } from './components/trip/TripLandingView';
import { TripCreateModal } from './components/trip/TripCreateModal';
import { CleanTripView } from './components/trip/CleanTripView';
import { CleanExpensesView } from './components/finance/CleanExpensesView';
import { CleanSplitView } from './components/splitwise/CleanSplitView';
import { CleanVaultView } from './components/vault/CleanVaultView';
import { QuickAddModal } from './components/sms/QuickAddModal';
import { TripEditorModal } from './components/trip/TripEditorModal';
import { AdminActivity } from './components/admin/AdminActivity';
import { AuthScreen } from './components/common/AuthScreen';
import { ProfilePage } from './components/common/ProfilePage';

type AppView = 'landing' | 'trip_dashboard' | 'admin_activity' | 'profile';

import { migrateDataUrl, deleteMediaRefs, collectRefs } from './utils/mediaStore';
import { viewerBudget, tripOwnerUid } from './utils/budget';
import {
  parseActivity,
  parseChatMessage,
  type FeedItem,
} from './utils/notifications';
import { isNativeApp, NativeSms } from './utils/nativeBridge';
import { systemShare } from './utils/share';
import { parseBankSMS, isDateWithinTrip, isRecurringDebit } from './utils/smsParser';
import { deleteManyFromPhoneFolder } from './utils/phoneFolder';
import { ensureReminderChannel, loudNotify, cancelNotify } from './utils/notify';

/** "6 Sep, 4:25 pm" for notifications. */
function notifDate(createdAt: unknown): string {
  try {
    const d = (createdAt as { toDate?: () => Date })?.toDate?.();
    if (!d) return '';
    const day = d.getDate();
    const mon = d.toLocaleDateString([], { month: 'short' });
    let h = d.getHours();
    const suffix = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${day} ${mon}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
  } catch {
    return '';
  }
}

function msgTimeMs(createdAt: unknown): number {
  try {
    const d = (createdAt as { toDate?: () => Date })?.toDate?.();
    return d ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

let mediaMigrated = false;

/** Stable notification id per ticket (so edit/delete can reschedule/cancel). */
function ticketNotifId(docId: string): number {
  let h = 0;
  for (let i = 0; i < docId.length; i++) h = (Math.imul(h, 31) + docId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
}

/** Ticket reminder → phone notification at that time, even with app closed (native only). */
async function scheduleTicketReminder(d: DocumentVaultItem): Promise<void> {
  const id = ticketNotifId(d.id);
  await cancelNotify(id);
  if (!d.remindAt || !isNativeApp()) return;
  const at = new Date(d.remindAt);
  if (isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
  await loudNotify(d.title, d.reminderNote || 'Ticket reminder', id, at);
}

async function cancelTicketReminder(docId: string): Promise<void> {
  await cancelNotify(ticketNotifId(docId));
}

const VALID_TABS: CleanTab[] = ['trip', 'todo', 'expenses', 'chat', 'split', 'vault'];

function loadSessionView(): AppView {
  try {
    const v = sessionStorage.getItem('ws_app_view');
    if (v === 'trip_dashboard' || v === 'admin_activity') return v;
    return 'landing';
  } catch {
    return 'landing';
  }
}

function loadSessionTab(): CleanTab {
  try {
    const t = sessionStorage.getItem('ws_active_tab') as CleanTab;
    // 'vault' may be stored from before it was disabled — fall back to trip
    if (t === 'vault') return 'trip';
    return VALID_TABS.includes(t) ? t : 'trip';
  } catch {
    return 'trip';
  }
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [profile, setProfile] = useState<UserProfile | null>(loadUserProfile);
  const [trips, setTrips] = useState<Trip[]>(loadTripsData);
  const [activeTripId, setActiveTripId] = useState<string | null>(loadActiveTripId);
  // Reload-proof: a page refresh returns to the same trip + tab instead of My Trips
  const [appView, setAppView] = useState<AppView>(loadSessionView);

  const [expenses, setExpenses] = useState<Expense[]>(loadExpensesData);
  const [documents, setDocuments] = useState<DocumentVaultItem[]>(loadDocumentsData);
  const [photos, setPhotos] = useState<SharedPhoto[]>(loadPhotosData);
  const [recommendations, setRecommendations] = useState<PlaceRecommendation[]>(loadRecommendationsData);
  const [todos, setTodos] = useState<TripTodo[]>(loadTodosData);
  const [settlements, setSettlements] = useState<Settlement[]>(loadSettlementsData);
  const [expenseEvents, setExpenseEvents] = useState<ExpenseEvent[]>(loadExpenseEventsData);

  const [activeTab, setActiveTab] = useState<CleanTab>(loadSessionTab);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false);
  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  // NOTE: myUid lives up here — selectors below use it during render (avoids TDZ crash)
  const [myUid, setMyUid] = useState<string | null>(null);
  const [tripsHydrating, setTripsHydrating] = useState(false);

  const activeTrip = trips.find((t) => t.id === activeTripId) ?? trips[0];

  useEffect(() => { saveTripsData(trips); }, [trips]);
  useEffect(() => { saveActiveTripId(activeTripId); }, [activeTripId]);
  useEffect(() => {
    try {
      sessionStorage.setItem('ws_app_view', appView);
      sessionStorage.setItem('ws_active_tab', activeTab);
    } catch { /* private mode */ }
  }, [appView, activeTab]);
  useEffect(() => { saveExpensesData(expenses); }, [expenses]);
  useEffect(() => { saveDocumentsData(documents); }, [documents]);
  useEffect(() => { savePhotosData(photos); }, [photos]);
  useEffect(() => { saveRecommendationsData(recommendations); }, [recommendations]);
  useEffect(() => { saveTodosData(todos); }, [todos]);
  useEffect(() => { saveSettlementsData(settlements); }, [settlements]);
  useEffect(() => { saveExpenseEventsData(expenseEvents); }, [expenseEvents]);

  // One-time: move legacy data: URLs into the large store (IndexedDB) — UI unchanged
  useEffect(() => {
    if (mediaMigrated) return;
    mediaMigrated = true;
    (async () => {
      try {
        let changed = false;
        const newPhotos = await Promise.all(
          photos.map(async (p) => {
            if (p.url.startsWith('data:')) {
              changed = true;
              return { ...p, url: await migrateDataUrl(p.tripId, 'image', p.url) };
            }
            return p;
          })
        );
        const newDocs = await Promise.all(
          documents.map(async (d) => {
            let doc = d;
            const move = async (u: string | undefined, kind: 'image' | 'file', name?: string) =>
              u && u.startsWith('data:') ? migrateDataUrl(d.tripId, kind, u, name) : u;
            const previewUrl = await move(d.previewUrl, d.previewUrl?.startsWith('data:image') ? 'image' : 'file', d.fileName);
            const fileUrl = await move(d.fileUrl, d.fileUrl?.startsWith('data:image') ? 'image' : 'file', d.fileName);
            const stayPhotos = d.stayPhotos
              ? await Promise.all(d.stayPhotos.map((s) => move(s, 'image') as Promise<string>))
              : d.stayPhotos;
            if (previewUrl !== d.previewUrl || fileUrl !== d.fileUrl || stayPhotos !== d.stayPhotos) {
              changed = true;
              doc = { ...d, previewUrl, fileUrl, stayPhotos };
            }
            return doc;
          })
        );
        const newRecs = await Promise.all(
          recommendations.map(async (r) => {
            const moveList = async (list: string[] | undefined) =>
              list ? Promise.all(list.map((u) => (u.startsWith('data:') ? migrateDataUrl('shared', 'image', u) : Promise.resolve(u)))) : list;
            const imageUrls = await moveList(r.imageUrls);
            const imageUrl = r.imageUrl.startsWith('data:') ? await migrateDataUrl('shared', 'image', r.imageUrl) : r.imageUrl;
            if (imageUrls !== r.imageUrls || imageUrl !== r.imageUrl) {
              changed = true;
              return { ...r, imageUrls, imageUrl };
            }
            return r;
          })
        );
        const newTrips = await Promise.all(
          trips.map(async (t) => {
            if (t.coverImage.startsWith('data:')) {
              changed = true;
              return { ...t, coverImage: await migrateDataUrl(t.id, 'image', t.coverImage) };
            }
            return t;
          })
        );
        if (changed) {
          setPhotos(newPhotos);
          setDocuments(newDocs);
          setRecommendations(newRecs);
          setTrips(newTrips);
        }
      } catch (e) {
        console.error('media migration failed (app still works):', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tripExpenses = activeTrip ? expenses.filter((e) => e.tripId === activeTrip.id) : [];
  const tripDocuments = activeTrip ? documents.filter((d) => d.tripId === activeTrip.id) : documents;
  const tripPhotos = activeTrip ? photos.filter((p) => p.tripId === activeTrip.id) : photos;
  const tripTodos = activeTrip ? todos.filter((t) => t.tripId === activeTrip.id) : [];
  // Each user's TODOs are separate: only your own todos are shown.
  // (checks both ownerUid and updatedBy — legacy unattributed todos stay visible to all, transitional)
  const myTripTodos = activeTrip
    ? tripTodos.filter((t) => {
        if (!myUid) return true;
        if (t.ownerUid) return t.ownerUid === myUid;
        if (t.updatedBy && t.updatedBy !== 'local') return t.updatedBy === myUid;
        return true;
      })
    : [];
  const tripSettlements = activeTrip ? settlements.filter((s) => s.tripId === activeTrip.id) : [];
  const tripExpenseEvents = activeTrip
    ? expenseEvents.filter((e) => e.tripId === activeTrip.id).sort((a, b) => b.at - a.at)
    : [];

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
    // Auto-publish so the invite code works for others (fixes "no trip found")
    publishTripInvite(trip).then(({ trip: updated }) => {
      setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }).catch((e) => {
      console.error('publishTripInvite failed:', e);
      showNotifFlash('Trip saved on this phone, but share-code upload failed. Check internet — reopen the app to retry.');
    });
  };

  const handleUpdateTrip = (updated: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleDeleteTrip = (tripId: string) => {
    const doomed = trips.find((t) => t.id === tripId);
    purgeTripLocal(tripId);
    // Server se delete — refresh ke time sab members ke phone se trip hategi
    if (doomed?.inviteCode) deleteInviteByCode(doomed.inviteCode).catch(() => undefined);
    deleteTripFromFirestore(tripId).catch(() => undefined);
  };

  const handleEditTripFromLanding = (trip: Trip) => {
    setEditingTrip(trip);
    setIsTripCreateOpen(true);
  };

  const handleSaveExpense = (newOrUpdated: Expense) => {
    const stamped: Expense = {
      ...newOrUpdated,
      // Amounts are always numbers (a string amount causes the "013244" concat bug)
      amount: Number(newOrUpdated.amount) || 0,
      splits: Array.isArray(newOrUpdated.splits)
        ? newOrUpdated.splits.map((s) => ({ ...s, amount: Number(s.amount) || 0 }))
        : newOrUpdated.splits,
      updatedAt: Date.now(),
      updatedBy: myUid || 'local',
    };
    const isUpdate = expenses.some((e) => e.id === stamped.id);
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === stamped.id);
      if (exists) return prev.map((e) => (e.id === stamped.id ? stamped : e));
      return [stamped, ...prev];
    });
    // Transparent history log (timestamped, synced, visible in Expense tab)
    if (activeTrip) {
      const evt: ExpenseEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tripId: activeTrip.id,
        expenseId: stamped.id,
        action: isUpdate ? 'updated' : 'created',
        title: stamped.title,
        amount: stamped.amount,
        byUid: myUid || undefined,
        byName: profile?.name || activeTrip.members.find((m) => m.isCurrentUser)?.name?.replace(/\(You\)/g, '').trim() || 'Someone',
        at: Date.now(),
      };
      setExpenseEvents((prev) => [evt, ...prev].slice(0, 300));
    }
    setEditingExpense(null);
    if (!activeTrip) return;
    const nowD2 = new Date();
    const when = `${nowD2.getDate()} ${nowD2.toLocaleDateString([], { month: 'short' })}, ${nowD2.getHours() % 12 || 12}:${String(nowD2.getMinutes()).padStart(2, '0')} ${nowD2.getHours() >= 12 ? 'pm' : 'am'}`;
    // Bell: every expense (personal + split) — phone: split involving me only
    // Format per spec: "[User] just logged Rs.X for [Desc]" + date below (7 Sep, 4:25 pm)
    const isPersonal = !stamped.isGroupExpense || stamped.splits.length === 1;
    if (isPersonal) {
      pushActivity({ id: `exp_${stamped.id}`, title: `You just logged Rs.${stamped.amount.toLocaleString('en-IN')} for ${stamped.title}`, sub: when, at: Date.now() });
      showNotifFlash(`You just logged Rs.${stamped.amount.toLocaleString('en-IN')} for ${stamped.title} • ${when}`);
    } else {
      const payer = activeTrip.members.find((m) => m.id === stamped.paidByMemberId);
      const payerName = payer ? payer.name.replace(/\(You\)/g, '').trim() : 'You';
      const withList = stamped.splits
        .map((s) => activeTrip.members.find((mm) => mm.id === s.memberId)?.name?.replace(/\(You\)/g, '').trim() || '')
        .filter((n) => n && n !== payerName);
      const withStr = withList.length > 0 ? ` with @${withList.join(', @')}` : '';
      const title = `${payerName} just logged Rs.${stamped.amount.toLocaleString('en-IN')} for ${stamped.title}${withStr}`;
      const withMentions = withList.map((n) => ({ id: n, name: n }));
      pushActivity({ id: `exp_${stamped.id}`, title, sub: when, at: Date.now(), withNames: withList } as never);
      // Store for rendering blue highlights in bell
      setActivity((prev) => prev.map((a) => a.id === `exp_${stamped.id}` ? { ...a, withNames: withList } as never : a));
      showNotifFlash(`${title} • ${when}`, payerName);
      loudNotify(title, when, Date.now() % 2147483647);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsQuickAddOpen(true);
  };

  const handleDeleteExpense = (id: string) => {
    const doomed = expenses.find((e) => e.id === id);
    if (activeTrip?.inviteCode) {
      pushTombstone(activeTrip.id, 'expenses', id).catch(() => undefined);
    }
    if (doomed && activeTrip) {
      const evt: ExpenseEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tripId: activeTrip.id,
        expenseId: id,
        action: 'deleted',
        title: doomed.title,
        amount: doomed.amount,
        byUid: myUid || undefined,
        byName: profile?.name || activeTrip.members.find((m) => m.isCurrentUser)?.name?.replace(/\(You\)/g, '').trim() || 'Someone',
        at: Date.now(),
      };
      setExpenseEvents((prev) => [evt, ...prev].slice(0, 300));
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  // Settle Up: recorded pay-back — balance ledger se debt clear, spend untouched
  const handleSettle = (fromMemberId: string, toMemberId: string, amount: number) => {
    if (!activeTrip || !amount || amount <= 0) return;
    const now = Date.now();
    const s: Settlement = {
      id: `stl_${now}_${Math.random().toString(36).slice(2, 8)}`,
      tripId: activeTrip.id,
      fromMemberId,
      toMemberId,
      amount: Math.round(amount * 100) / 100,
      date: new Date().toISOString().split('T')[0],
      updatedAt: now,
      updatedBy: myUid || 'local',
    };
    setSettlements((prev) => [s, ...prev]);
    const from = activeTrip.members.find((m) => m.id === fromMemberId)?.name?.replace(/\(You\)/g, '').trim() || 'Someone';
    const to = activeTrip.members.find((m) => m.id === toMemberId)?.name?.replace(/\(You\)/g, '').trim() || 'Someone';
    pushActivity({ id: s.id, title: `${from} settled Rs.${s.amount.toLocaleString('en-IN')} with ${to}`, sub: fmtWhen(), at: now });
  };
  const handleUndoSettlement = (id: string) => {
    if (activeTrip?.inviteCode) {
      pushTombstone(activeTrip.id, 'settlements', id).catch(() => undefined);
    }
    setSettlements((prev) => prev.filter((s) => s.id !== id));
  };

  // Vault documents — a ticket can carry its own optional reminder (scheduled natively)
  const handleAddDocument = (d: DocumentVaultItem) => {
    const stamped: DocumentVaultItem = { ...d, updatedAt: Date.now(), updatedBy: myUid || 'local' };
    setDocuments((prev) => [stamped, ...prev]);
    scheduleTicketReminder(stamped);
  };
  const handleUpdateDocument = (d: DocumentVaultItem) => {
    const stamped: DocumentVaultItem = { ...d, updatedAt: Date.now(), updatedBy: myUid || 'local' };
    setDocuments((prev) => prev.map((x) => (x.id === d.id ? stamped : x)));
    scheduleTicketReminder(stamped);
  };
  const handleDeleteDocument = (id: string) => {
    const doomed = documents.find((d) => d.id === id);
    if (doomed) {
      deleteMediaRefs(collectRefs(doomed));
      deleteManyFromPhoneFolder([doomed.phonePath, ...(doomed.phonePaths || [])]);
    }
    if (activeTrip?.inviteCode) {
      pushTombstone(activeTrip.id, 'documents', id).catch(() => undefined);
    }
    cancelTicketReminder(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  // Photos (gallery rebuild coming soon — data kept intact)
  const handleAddPhoto = (p: SharedPhoto) => setPhotos((prev) => [p, ...prev]);
  const handleAddPhotos = (ps: SharedPhoto[]) => setPhotos((prev) => [...ps, ...prev]);
  const handleUpdatePhoto = (p: SharedPhoto) => setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const handleDeletePhoto = (id: string) => {
    const doomed = photos.find((p) => p.id === id);
    if (doomed) {
      deleteMediaRefs(collectRefs(doomed));
      deleteManyFromPhoneFolder([doomed.phonePath]);
    }
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  // Trip checklist — one per user (medicine, bakery, itinerary...)
  const handleAddTodo = (text: string) => {
    if (!activeTrip || !text.trim()) return;
    setTodos((prev) => [
      { id: `todo_${Date.now()}`, tripId: activeTrip.id, text: text.trim().slice(0, 120), done: false, createdAt: new Date().toISOString(), ownerUid: myUid || undefined, updatedAt: Date.now(), updatedBy: myUid || 'local' },
      ...prev,
    ]);
  };
  const handleToggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: Date.now(), updatedBy: myUid || 'local' } : t)));
  };
  const handleDeleteTodo = (id: string) => {
    if (activeTrip?.inviteCode) {
      pushTombstone(activeTrip.id, 'todos', id).catch(() => undefined);
    }
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };
  // Places
  const handleAddPlace = (p: PlaceRecommendation) => setRecommendations((prev) => [p, ...prev]);
  const handleUpdatePlace = (p: PlaceRecommendation) => setRecommendations((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const handleDeletePlace = (id: string) => {
    const doomed = recommendations.find((p) => p.id === id);
    if (doomed) {
      deleteMediaRefs(collectRefs(doomed));
      deleteManyFromPhoneFolder(doomed.phonePaths || []);
    }
    setRecommendations((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSaveProfile = (p: UserProfile) => {
    const role = p.role || (getAdminStatus(p.name, p.phone) ? 'admin' : p.role);
    const withDate: UserProfile = { ...p, role, joinedAt: profile?.joinedAt || p.joinedAt || new Date().toISOString() };
    setProfile(withDate);
    saveUserProfile(withDate);
    // Profile name/phone = dynamic everywhere: every trip's "you" member updates
    // (matched by uid first — isCurrentUser flag can go stale after a remote merge)
    const uid = myUidRef.current;
    setTrips((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) =>
          m.isCurrentUser || (uid && m.uid === uid) ? { ...m, name: p.name, phone: p.phone } : m
        ),
      }))
    );
  };

  // First launch: one screen — name + mobile + optional invite code
  const handleWelcomeDone = async (p: UserProfile, inviteCode?: string) => {
    handleSaveProfile(p);
    if (inviteCode) {
      try {
        const ids = await lookupInvite(inviteCode);
        handleJoinTripById(await joinTripById(ids[0]));
      } catch (err) {
        showNotifFlash(
          err instanceof Error && err.message === 'NOT_FOUND'
            ? 'No trip found with this code. Check the letters and try again.'
            : 'Could not join right now. Check internet and retry.'
        );
      }
    }
  };
  const isAdmin = profile?.role === 'admin' || (!!(profile?.name && profile?.phone) && getAdminStatus(profile.name, profile.phone));
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'owned' | 'joined'>('all');
  const [pushFlash, setPushFlash] = useState<{ text: string; name?: string } | null>(null);
  const pushFlashTimer = useRef<number | null>(null);
  // Bell pulse — jiggle + red + vibrate on every new notification (Navbar)
  const [bellPulse, setBellPulse] = useState(0);
  // Panel open time — newer items are unread, older ones are read
  const [notifSeenAt, setNotifSeenAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('ws_notif_seen_v1')) || 0;
    } catch {
      return 0;
    }
  });
  const showNotifFlash = (msg: string, name?: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setPushFlash({ text: msg, name });
      if (pushFlashTimer.current) window.clearTimeout(pushFlashTimer.current);
      pushFlashTimer.current = window.setTimeout(() => setPushFlash(null), 5000);
    }
    setBellPulse((p) => p + 1);
  };

  // Check auth on mount — and restore name/phone from server so login
  // never asks for them again on a new device / cleared storage.
  useEffect(() => {
    authGetUser().then((u) => {
      setAuthed(!!u);
      if (u) {
        setMyUid(u.uid);
        if (u.name?.trim() && !loadUserProfile()?.name) {
          const restored: UserProfile = {
            name: u.name.trim(),
            phone: u.phone || '',
            role: (u.role as UserProfile['role']) || (u.isAdmin ? 'admin' : undefined),
            joinedAt: new Date().toISOString(),
          };
          setProfile(restored);
          saveUserProfile(restored);
        }
      }
    }).catch(() => setAuthed(false));
  }, []);

  // Ask once after login so local reminders and system notifications can reach
  // the Android notification tray instead of remaining in-app only.
  useEffect(() => {
    if (authed && isNativeApp()) void ensureReminderChannel();
  }, [authed]);

  const hydrateRemoteTrips = async (uid: string) => {
    setTripsHydrating(true);
    try {
      const { data } = await supabase.from('trips').select('*');
      const remoteTrips = (Array.isArray(data) ? data : [])
        .filter((t) => {
          const trip = t as Trip;
          return tripOwnerUid(trip) === uid || trip.members?.some((m) => m.uid === uid);
        })
        .map((t) => {
          const trip = t as Trip;
          return { ...trip, members: (trip.members || []).map((m) => ({ ...m, isCurrentUser: m.uid === uid })) };
        });
      setTrips((prev) => {
        const byId = new Map(prev.map((trip) => [trip.id, trip]));
        remoteTrips.forEach((trip) => byId.set(trip.id, { ...byId.get(trip.id), ...trip }));
        const merged = [...byId.values()];
        saveTripsData(merged);
        return merged;
      });
    } catch { /* offline: keep the local trip cache */ }
    finally {
      setTripsHydrating(false);
    }
  };

  useEffect(() => {
    ensureCloudUser()
      .then(async (u) => { setMyUid(u.uid); await hydrateRemoteTrips(u.uid); })
      .catch(() => setMyUid(null));

    // Deep link auto-join: ?join=CODE
    try {
      const search = window.location.search;
      if (search) {
        const params = new URLSearchParams(search);
        const joinCode = params.get('join');
        if (joinCode) {
          window.history.replaceState({}, document.title, window.location.pathname);
          (async () => {
            try {
              const ids = await lookupInvite(joinCode.trim().toUpperCase());
              const joined = await joinTripById(ids[0]);
              handleJoinTripById(joined);
              showNotifFlash(`Joined "${joined.title}"!`);
            } catch (err) {
              showNotifFlash(
                err instanceof Error && (err.message === 'NOT_FOUND')
                  ? `No trip found for code: ${joinCode.trim().toUpperCase()}`
                  : 'Could not join right now. Check internet and retry.'
              );
            }
          })();
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Trip isolation: keep my own trips + trips where I'm a member.
  // Unpublished local trips have no ownerUid yet — NEVER drop those
  // (dropping + persisting = permanent data loss, Luxmi case).
  const myUidRef = useRef<string | null>(null);
  useEffect(() => {
    myUidRef.current = myUid;
  }, [myUid]);
  useEffect(() => {
    if (!myUid) return;
    setTrips((prev) => {
      const filtered = prev.filter((t) =>
        !tripOwnerUid(t) ||
        t.members.some((m) => m.uid === myUid) ||
        tripOwnerUid(t) === myUid
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [myUid]);

  // Remove one trip + all its local data (used for owner-delete propagation too)
  const purgeTripLocal = (tripId: string) => {
    const doomedPhotos = photos.filter((p) => p.tripId === tripId);
    const doomedDocs = documents.filter((d) => d.tripId === tripId);
    const doomedTrip = trips.find((t) => t.id === tripId);
    if (doomedTrip) deleteMediaRefs(collectRefs([doomedTrip, ...doomedPhotos, ...doomedDocs]));
    deleteManyFromPhoneFolder([
      ...doomedPhotos.map((p) => p.phonePath),
      ...doomedDocs.flatMap((d) => [d.phonePath, ...(d.phonePaths || [])]),
    ]);
    setPhotos((prev) => prev.filter((p) => p.tripId !== tripId));
    setDocuments((prev) => prev.filter((d) => d.tripId !== tripId));
    setExpenses((prev) => prev.filter((e) => e.tripId !== tripId));
    setTodos((prev) => prev.filter((t) => t.tripId !== tripId));
    setSettlements((prev) => prev.filter((s) => s.tripId !== tripId));
    setExpenseEvents((prev) => prev.filter((e) => e.tripId !== tripId));
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    if (activeTripId === tripId) {
      setActiveTripId(null);
      setAppView('landing');
    }
  };

  // Shared-trip refresh (landing): any name/date/budget/members change reaches
  // all members. A trip deleted by its owner is removed from every phone.
  const refreshSharedTrips = async () => {
    const uid = myUidRef.current;
    let locals: Trip[];
    try {
      locals = JSON.parse(localStorage.getItem('ws_trips_v2') || '[]');
    } catch {
      return;
    }
    const shared = locals.filter((t) => t.inviteCode);
    if (shared.length === 0) return;
    const updates: Record<string, Partial<Trip>> = {};
    await Promise.all(
      shared.map(async (local) => {
        try {
          const { data, error } = await supabase.from('trips').select('*').eq('id', local.id).maybeSingle();
          if (error) {
            // A 401, timeout, or transient API error is not a deletion signal.
            return;
          }
          if (!data) {
            // A missing row may be a stale replica or a deployment race. Never
            // delete local user data from a refresh; explicit deletes are local.
            return;
          }
          const remote = data as unknown as Trip & { updatedAt?: number };
          // Removed from the squad (and not the owner) → drop the trip
          if (uid && tripOwnerUid(remote) !== uid && !remote.members?.some((m) => m.uid === uid)) {
            // Keep the local copy until the user explicitly removes it or an
            // audited recovery flow confirms the remote deletion.
            return;
          }
          const remoteAt = Number(remote.updatedAt) || 0;
          if (remoteAt > (tripSyncAt.current[local.id] || 0)) {
            tripSyncAt.current[local.id] = remoteAt;
            const remoteBudget = Number((remote as { totalBudget?: unknown }).totalBudget);
            updates[local.id] = {
              title: typeof remote.title === 'string' ? remote.title : local.title,
              description: typeof remote.description === 'string' ? remote.description : local.description,
              coverImage: typeof remote.coverImage === 'string' ? remote.coverImage : local.coverImage,
              startDate: typeof remote.startDate === 'string' ? remote.startDate : local.startDate,
              endDate: typeof remote.endDate === 'string' ? remote.endDate : local.endDate,
              totalBudget: Number.isFinite(remoteBudget) ? remoteBudget : local.totalBudget,
              members:
                Array.isArray(remote.members) && remote.members.length > 0
                  ? remote.members.map((m) => ({
                      ...m,
                      budget: m.budget === undefined || m.budget === null || (m.budget as unknown) === '' ? undefined : Number(m.budget) || 0,
                      isCurrentUser: uid ? m.uid === uid : m.isCurrentUser,
                    }))
                  : local.members,
              cities: Array.isArray(remote.cities) ? remote.cities : local.cities,
            };
          }
        } catch { /* offline — local data stands */ }
      })
    );
    if (Object.keys(updates).length === 0) return;
    setTrips((prev) =>
      prev
        .map((t) => (updates[t.id] ? { ...t, ...updates[t.id] } : t))
    );
  };

  // Squad-wide emergency siren: keep a room joined for every shared trip (landing too).
  // A siren anywhere → alarm + flash + bell on this phone. An open chat tab is
  // handled by ChatView instead (skipped here to avoid double sound).
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const joinedSirenRooms = useRef<Map<string, () => void>>(new Map());
  useEffect(() => {
    if (!authed) return;
    const uid = myUidRef.current;
    const name = profile?.name || 'Friend';
    const want = new Set(
      trips.filter((t) => t.inviteCode).map((t) => t.id)
    );
    // Leave stale rooms
    for (const [id, leave] of joinedSirenRooms.current) {
      if (!want.has(id)) {
        leave();
        joinedSirenRooms.current.delete(id);
      }
    }
    // Join new rooms
    for (const id of want) {
      if (joinedSirenRooms.current.has(id)) continue;
      const leave = joinTripRoom(id, { uid, name }, {
        onVoiceBurst: (v) => {
          if (uid && v.senderId === uid) return; // own voice — already heard it live
          markVoicePlayed(v.clipId); // socket won — FCM fallback must not replay
          const who = v.senderName || 'Someone';
          const when = fmtWhen();
          pushActivity({ id: `voice_${id}_${Date.now()}`, title: `${who} is talking on walkie-talkie`, sub: when, at: Date.now() });
          showNotifFlash(`${who} is talking`, who);
          playVoiceLoud(v.voiceUrl).catch(() => undefined);
        },
        onBellRing: (b) => {
          if (uid && b.uid === uid) return; // own ping — already chimed locally
          playChimeSoft();
          const who = b.name || 'Someone';
          const when = fmtWhen();
          pushActivity({ id: `bell_${id}_${Date.now()}`, title: `@${who} rang the bell`, sub: when, at: Date.now() });
          showNotifFlash(`@${who} rang the bell`, who, { silent: true });
        },
        onMessage: (m) => {
          const r = m as ChatMessage & { _deleted?: boolean };
          if (r._deleted) return;
          if (uid && r.senderId === uid) return;
          if (r.type !== 'siren') return;
          const viewingThisChat =
            appViewRef.current === 'trip_dashboard' &&
            activeTabRef.current === 'chat' &&
            activeTripId === id;
          if (viewingThisChat) return; // ChatView already alarming
          playReceiverSiren();
          const who = r.senderName || 'Someone';
          const when = fmtWhen();
          const title = `${who} triggered the emergency siren`;
          pushActivity({ id: `siren_${r.id}`, title, sub: when, at: Date.now() });
          showNotifFlash(`${title} • ${when}`, who);
          setSirenBanner(`${who} triggered the emergency siren`);
          if (sirenBannerTimer.current) window.clearTimeout(sirenBannerTimer.current);
          sirenBannerTimer.current = window.setTimeout(() => setSirenBanner(null), 5000);
        },
      });
      joinedSirenRooms.current.set(id, leave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, myUid, trips]);

  // Receiver red banner (drops from header, auto-fades with the sound)
  const [sirenBanner, setSirenBanner] = useState<string | null>(null);
  const sirenBannerTimer = useRef<number | null>(null);

  // Landing refresh triggers: open landing, focus window, periodic poll

  // Receiver siren banner — red, drops from header, auto-fades with the sound
  const SirenBanner = sirenBanner ? (
    <div className="fixed top-0 left-0 right-0 z-[70] flex justify-center pointer-events-none px-4">
      <div className="siren-toast-drop bg-[#ef4444] text-white text-[13px] font-semibold px-4 py-2 rounded-b-xl shadow-lg truncate max-w-md w-fit">
        {sirenBanner}
      </div>
    </div>
  ) : null;

  // Flash toast — premium success style: white card, short text, no datetime
  const FlashToast = pushFlash ? (
    <div className="fixed top-16 left-0 right-0 z-[70] flex justify-center px-4 pointer-events-none">
      <div className="siren-toast-drop max-w-md w-fit bg-white border border-slate-200 rounded-2xl pl-2.5 pr-4 py-2 shadow-xl shadow-slate-900/10 flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${/siren|emergency/i.test(pushFlash.text) ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'}`}>
          {/siren|emergency/i.test(pushFlash.text) ? <Bell size={13} /> : <Check size={14} strokeWidth={3} />}
        </span>
        <p className="text-xs font-bold text-slate-800 truncate">{pushFlash.text.split(' • ')[0].slice(0, 80)}</p>
      </div>
    </div>
  ) : null;
  const appViewRef = useRef(appView);
  useEffect(() => {
    appViewRef.current = appView;
    if (appView === 'landing') refreshSharedTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appView]);
  useEffect(() => {
    const onFocus = () => {
      if (appViewRef.current === 'landing') refreshSharedTrips();
    };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (appViewRef.current === 'landing' && navigator.onLine) refreshSharedTrips();
    }, 20000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notifications: unread count + @mention watch + panel feed
  const [notifOpen, setNotifOpen] = useState(false);
  // Panel khula → sab seen (badge + dots clear)
  useEffect(() => {
    if (notifOpen) {
      const now = Date.now();
      setNotifSeenAt(now);
      try {
        localStorage.setItem('ws_notif_seen_v1', String(now));
      } catch { /* private mode */ }
    }
  }, [notifOpen]);
  const [chatFeed, setChatFeed] = useState<ChatMessage[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => Date.now());
  const notifiedRef = useRef<Set<string>>(new Set());
  const seenTripRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTrip || appView !== 'trip_dashboard') return;
    const key = `ws_chat_seen_${activeTrip.id}`;
    try {
      const s = localStorage.getItem(key);
      if (s) {
        setLastSeen(Number(s));
      } else {
        const now = Date.now();
        setLastSeen(now);
        localStorage.setItem(key, String(now));
      }
    } catch {
      setLastSeen(Date.now());
    }
    seenTripRef.current = null;
  }, [activeTrip?.id, appView]);

  useEffect(() => {
    if (!activeTrip || appView !== 'trip_dashboard') return;
    const tripId = activeTrip.id;
    let cancelled = false;
    // History (REST) + live socket — bell/mentions stay live without opening chat
    (async () => {
      try {
        const { data } = await supabase.from('chat_messages').select('*').eq('tripId', tripId).order('createdAt', { ascending: true }).limit(200);
        if (!cancelled) setChatFeed(((data || []) as (ChatMessage & { _deleted?: boolean })[]).filter((m) => !m._deleted));
      } catch {
        if (!cancelled) setChatFeed([]);
      }
    })();
    const leave = joinTripRoom(tripId, { uid: myUid, name: profile?.name }, {
      onMessage: (m) => {
        const r = m as ChatMessage & { _deleted?: boolean };
        setChatFeed((prev) =>
          r._deleted
            ? prev.filter((x) => x.id !== r.id)
            : prev.some((x) => x.id === r.id) ? prev : [...prev, r]
        );
      },
    });
    return () => {
      cancelled = true;
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, appView]);

  // Mark read while chat is open
  useEffect(() => {
    if (!activeTrip || activeTab !== 'chat' || chatFeed.length === 0) return;
    const now = Date.now();
    setLastSeen(now);
    try {
      localStorage.setItem(`ws_chat_seen_${activeTrip.id}`, String(now));
    } catch { /* ignore */ }
  }, [activeTab, chatFeed, activeTrip?.id]);

  // Mention watch: ping only the mentioned member (never the whole squad)
  useEffect(() => {
    if (!activeTrip || activeTab === 'chat') return;
    if (seenTripRef.current !== activeTrip.id) {
      seenTripRef.current = activeTrip.id;
      chatFeed.forEach((m) => notifiedRef.current.add(m.id));
      return;
    }
    const me = activeTrip.members.find((m) => m.isCurrentUser);
    for (const m of chatFeed) {
      if (notifiedRef.current.has(m.id)) continue;
      notifiedRef.current.add(m.id);
      const mentionsMe =
        m.senderId !== myUid &&
        (m.mentions || []).some(
          (x) => (me && x.id === me.id) || (me && me.name ? x.name === me.name : false)
        );
      if (mentionsMe) {
        const when = notifDate(m.createdAt);
        showNotifFlash(`${m.senderName} mentioned you • ${when}`, m.senderName, { silent: true });
        loudNotify(
          'Mention in squad chat',
          `${m.senderName} mentioned you • ${when}`,
          Date.now() % 2147483647
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatFeed, activeTab, activeTrip?.id, myUid]);

  // ── Live sync (shared trips only) + split/personal notifications ──
  const [activity, setActivity] = useState<{ id: string; title: string; sub: string; at: number }[]>(() => {
    try {
      const s = localStorage.getItem('ws_activity_v1');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ws_activity_v1', JSON.stringify(activity.slice(0, 30)));
    } catch { /* quota */ }
  }, [activity]);
  const tripSyncAt = useRef<Record<string, number>>({});
  const pushTimer = useRef<number | null>(null);

  const pushActivity = (item: { id: string; title: string; sub: string; at: number }) => {
    setActivity((prev) => {
      if (prev.some((a) => a.id === item.id)) return prev;
      return [item, ...prev].slice(0, 20);
    });
  };

  // Push local changes up (debounced, shared trips only)
  useEffect(() => {
    if (!activeTrip?.inviteCode || appView !== 'trip_dashboard') return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      const now = Date.now();
      tripSyncAt.current[activeTrip.id] = now;
      pushTripShared(activeTrip, expenses, todos, documents, settlements, expenseEvents).catch(() => undefined);
    }, 1500);
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, activeTrip?.inviteCode, appView, expenses, todos, documents, trips, settlements, expenseEvents]);

  // Pull remote changes, merge last-write-wins, notify on newcomers
  useEffect(() => {
    if (!activeTrip?.inviteCode || appView !== 'trip_dashboard') return;
    const tripId = activeTrip.id;
    const off = subscribeTripShared(tripId, (snap) => {
      // Trip fields (members/cities join here)
      const remoteAt = (snap.trip as { updatedAt?: number }).updatedAt || 0;
      if (remoteAt > (tripSyncAt.current[tripId] || 0)) {
        tripSyncAt.current[tripId] = remoteAt;
        const uid = myUidRef.current;
        setTrips((prev) =>
          prev.map((t) => {
            if (t.id !== tripId) return t;
            const r = snap.trip;
            const remoteMembers = Array.isArray(r.members) && r.members.length > 0
              ? (r.members as Trip['members']).map((m) => ({
                  ...m,
                  budget: m.budget === undefined || m.budget === null || (m.budget as unknown) === '' ? undefined : Number(m.budget) || 0,
                  isCurrentUser: uid ? m.uid === uid : m.isCurrentUser,
                }))
              : t.members;
            const remoteBudget = Number((r as { totalBudget?: unknown }).totalBudget);
            return {
              ...t,
              title: typeof r.title === 'string' ? r.title : t.title,
              description: typeof r.description === 'string' ? r.description : t.description,
              coverImage: typeof r.coverImage === 'string' ? r.coverImage : t.coverImage,
              startDate: typeof r.startDate === 'string' ? r.startDate : t.startDate,
              endDate: typeof r.endDate === 'string' ? r.endDate : t.endDate,
              totalBudget: Number.isFinite(remoteBudget) ? remoteBudget : t.totalBudget,
              members: remoteMembers,
              cities: Array.isArray(r.cities) ? (r.cities as Trip['cities']) : t.cities,
            };
          })
        );
      }
      // Expenses: tombstones + LWW + newcomer alerts
      const normExp = (r: Expense): Expense => ({
        ...r,
        amount: Number(r.amount) || 0,
        splits: Array.isArray(r.splits)
          ? r.splits.map((s) => ({ ...s, amount: Number(s.amount) || 0 }))
          : r.splits,
      });
      setExpenses((prev) => {
        let next = [...prev];
        let changed = false;
        for (const raw of snap.expenses) {
          const r = normExp(raw);
          const idx = next.findIndex((e) => e.id === r.id);
          if ((r as { _deleted?: boolean })._deleted) {
            if (idx >= 0) {
              // Transparency: remember who deleted what for the watcher below
              const gone = next[idx];
              const by = (r as Expense).updatedBy || (gone.updatedBy as string | undefined);
              if (!deletedExpQueue.current.some((q) => q.id === r.id)) {
                deletedExpQueue.current.push({
                  id: r.id,
                  title: gone.title,
                  amount: gone.amount,
                  by,
                  splitIds: gone.splits.map((s) => s.memberId),
                });
              }
              next = next.filter((e) => e.id !== r.id);
              changed = true;
            }
            continue;
          }
          if (idx < 0) {
            next = [r, ...next];
            changed = true;
          } else if ((r.updatedAt || 0) > (next[idx].updatedAt || 0)) {
            next[idx] = r;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      // Todos + documents: same merge, no alerts
      setTodos((prev) => {
        let next = [...prev];
        let changed = false;
        for (const r of snap.todos) {
          const idx = next.findIndex((t) => t.id === r.id);
          if ((r as { _deleted?: boolean })._deleted) {
            if (idx >= 0) {
              next = next.filter((t) => t.id !== r.id);
              changed = true;
            }
            continue;
          }
          if (idx < 0) {
            next = [r, ...next];
            changed = true;
          } else if ((r.updatedAt || 0) > (next[idx].updatedAt || 0)) {
            next[idx] = r;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setDocuments((prev) => {
        let next = [...prev];
        let changed = false;
        for (const r of snap.documents) {
          const idx = next.findIndex((d) => d.id === r.id);
          if ((r as { _deleted?: boolean })._deleted) {
            if (idx >= 0) {
              next = next.filter((d) => d.id !== r.id);
              changed = true;
            }
            continue;
          }
          if (idx < 0) {
            next = [r, ...next];
            changed = true;
          } else if ((r.updatedAt || 0) > (next[idx].updatedAt || 0)) {
            next[idx] = r;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      // Settlements: tombstones + LWW (balance ledger)
      setSettlements((prev) => {
        let next = [...prev];
        let changed = false;
        for (const raw of snap.settlements) {
          const r = { ...raw, amount: Number(raw.amount) || 0 };
          const idx = next.findIndex((s) => s.id === r.id);
          if ((r as { _deleted?: boolean })._deleted) {
            if (idx >= 0) {
              next = next.filter((s) => s.id !== r.id);
              changed = true;
            }
            continue;
          }
          if (idx < 0) {
            next = [r, ...next];
            changed = true;
          } else if ((r.updatedAt || 0) > (next[idx].updatedAt || 0)) {
            next[idx] = r;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      // Expense events: immutable — union by id
      setExpenseEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const fresh = snap.expenseEvents.filter((e) => !ids.has(e.id));
        return fresh.length > 0 ? [...fresh, ...prev].slice(0, 300) : prev;
      });
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, activeTrip?.inviteCode, appView]);

  // Expense alerts: add/update/delete → ONLY that split's members
  // (spec §3.4). Never notify yourself for your own changes.
  const seenExpTripRef = useRef<string | null>(null);
  const expSeenAt = useRef<Map<string, number>>(new Map());
  const deletedExpQueue = useRef<{ id: string; title: string; amount: number; by?: string; splitIds: string[] }[]>([]);
  const membersRef = useRef<Trip['members']>([]);
  membersRef.current = activeTrip?.members ?? [];

  const actorName = (uid?: string): string => {
    if (!uid) return 'Someone';
    const m = membersRef.current.find((x) => x.uid === uid);
    return m ? m.name.replace(/\(You\)/g, '').trim() || 'Someone' : 'Someone';
  };
  const fmtWhen = (): string => {
    const nd = new Date();
    return `${nd.getDate()} ${nd.toLocaleDateString([], { month: 'short' })}, ${nd.getHours() % 12 || 12}:${String(nd.getMinutes()).padStart(2, '0')} ${nd.getHours() >= 12 ? 'pm' : 'am'}`;
  };

  useEffect(() => {
    if (!activeTrip) return;
    if (seenExpTripRef.current !== activeTrip.id) {
      // First load seeds silently — no noise for old entries
      seenExpTripRef.current = activeTrip.id;
      expSeenAt.current = new Map(expenses.filter((e) => e.tripId === activeTrip.id).map((e) => [e.id, e.updatedAt || 0]));
      deletedExpQueue.current = [];
      return;
    }
    const uid = myUidRef.current;
    const myMemberId =
      (uid && activeTrip.members.find((m) => m.uid === uid)?.id) ||
      activeTrip.members.find((m) => m.isCurrentUser)?.id;
    // Deletes (tombstones from server) — split members only
    for (const q of deletedExpQueue.current) {
      if (q.by && uid && q.by === uid) continue;
      if (myMemberId && !q.splitIds.includes(myMemberId)) continue;
      const who = actorName(q.by);
      const when = fmtWhen();
      const title = `${who} deleted "${q.title}" (Rs.${Number(q.amount).toLocaleString('en-IN')})`;
      pushActivity({ id: `expdel_${q.id}_${Date.now()}`, title, sub: when, at: Date.now() });
      showNotifFlash(`${title} • ${when}`, who);
      loudNotify(title, when, Date.now() % 2147483647);
    }
    deletedExpQueue.current = [];
    // Adds + updates — only that split's members
    for (const e of expenses) {
      if (e.tripId !== activeTrip.id) continue;
      if (e.updatedBy && uid && e.updatedBy === uid) {
        expSeenAt.current.set(e.id, e.updatedAt || 0);
        continue;
      }
      if (myMemberId && !e.splits.some((s) => s.memberId === myMemberId)) {
        expSeenAt.current.set(e.id, e.updatedAt || 0);
        continue;
      }
      const prevAt = expSeenAt.current.get(e.id);
      const payer = activeTrip.members.find((m) => m.id === e.paidByMemberId);
      const payerName = payer ? payer.name.replace(/\(You\)/g, '').trim() : actorName(e.updatedBy);
      const when = fmtWhen();
      if (prevAt === undefined) {
        expSeenAt.current.set(e.id, e.updatedAt || 0);
        const withList = e.splits
          .map((s) => activeTrip.members.find((mm) => mm.id === s.memberId)?.name?.replace(/\(You\)/g, '').trim() || '')
          .filter((n) => n && n !== payerName);
        const withStr = withList.length > 0 ? ` with @${withList.join(', @')}` : '';
        const title = `${payerName} added Rs.${Number(e.amount).toLocaleString('en-IN')} for ${e.title}${withStr}`;
        pushActivity({ id: `exp_${e.id}`, title, sub: when, at: Date.now() });
        showNotifFlash(`${title} • ${when}`, payerName);
        loudNotify(title, when, Date.now() % 2147483647);
      } else if ((e.updatedAt || 0) > prevAt) {
        expSeenAt.current.set(e.id, e.updatedAt || 0);
        const title = `${payerName} updated Rs.${Number(e.amount).toLocaleString('en-IN')} for ${e.title}`;
        pushActivity({ id: `expupd_${e.id}_${e.updatedAt}`, title, sub: when, at: Date.now() });
        showNotifFlash(`${title} • ${when}`, payerName);
        loudNotify(title, when, Date.now() % 2147483647);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, activeTrip?.id, myUid]);

  // Mobile chat lock: prevents outer window/body scroll & input box dragging
  const [chatViewportHeight, setChatViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab !== 'chat' || appView !== 'trip_dashboard') {
      setChatViewportHeight(null);
      document.documentElement.classList.remove('chat-active');
      document.body.classList.remove('chat-active');
      return;
    }

    document.documentElement.classList.add('chat-active');
    document.body.classList.add('chat-active');
    window.scrollTo(0, 0);

    const updateHeight = () => {
      if (window.visualViewport) {
        setChatViewportHeight(window.visualViewport.height);
      }
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    updateHeight();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateHeight);
      vv.addEventListener('scroll', updateHeight);
    }
    window.addEventListener('scroll', updateHeight, { passive: true });

    return () => {
      document.documentElement.classList.remove('chat-active');
      document.body.classList.remove('chat-active');
      if (vv) {
        vv.removeEventListener('resize', updateHeight);
        vv.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('scroll', updateHeight);
    };
  }, [activeTab, appView]);

  // Push token per open trip (closed-app reach) + incoming push handler
  useEffect(() => {
    if (!isNativeApp() || !activeTripId) return;
    registerPushToken(activeTripId);
    const showFlash = (msg: string) => {
      showNotifFlash(msg);
    };
    let handle: { remove: () => void } | null = null;
    (async () => {
      try {
        handle = await PushNotifications.addListener('pushNotificationReceived', async (n) => {
          const d = (n.data || {}) as { kind?: string; title?: string; body?: string; voiceUrl?: string; voicePath?: string; clipId?: string; clipUrl?: string };
          if (d.kind === 'voice' && d.voiceUrl) {
            await playVoiceLoud(d.voiceUrl);
            if (d.voicePath) await deleteVoiceFile(d.voicePath);
            showFlash('Voice played • vanished');
          } else if (d.kind === 'voice' && d.clipId && d.clipUrl && !wasVoicePlayed(d.clipId)) {
            // Foreground FCM fallback (socket missed it) — fetch + play once.
            try {
              const clip = await fetchVoiceClipByUrl(d.clipUrl);
              if (clip) {
                markVoicePlayed(d.clipId);
                await playVoiceLoud(clip.voiceUrl);
                showFlash(`Voice from ${clip.senderName} • played`);
              }
            } catch { /* clip expired */ }
          } else if (d.kind === 'siren') {
            ringLocalSiren();
            showFlash(d.body || 'Siren');
          }
        });
      } catch { /* push unavailable */ }
    })();
    return () => {
      handle?.remove();
    };
  }, [activeTripId]);

  // Closed-app voice: notification tap → open that trip + play the missed clip
  // (skips autoplay when native already played it — tap still opens for reply)
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    (async () => {
      try {
        const pending = await consumePendingVoice();
        if (cancelled || !pending) return;
        setActiveTripId(pending.tripId);
        setAppView('trip_dashboard');
        const native = await lastNativePlayed().catch(() => null);
        if (cancelled) return;
        if (native && pending.clipId && native.clipId === pending.clipId) {
          markVoicePlayed(pending.clipId);
          showNotifFlash('Voice played • tap PTT to reply');
          return;
        }
        const clip = await fetchLatestVoiceClip(pending.tripId, Date.now() - 6 * 60 * 1000);
        if (cancelled) return;
        if (clip) {
          await playVoiceLoud(clip.voiceUrl);
          showNotifFlash(`Voice from ${clip.senderName} • played`);
        }
      } catch { /* clip expired — trip still opens for reply */ }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  // Missed-voice sweep: notification-only FCM carries no data, so on every
  // launch pull the freshest unexpired clip across my trips and play it once.
  // (Persistent played-guard: relaunch never replays what was heard.)
  const voiceSweepDone = useRef(false);
  useEffect(() => {
    if (!authed || trips.length === 0 || voiceSweepDone.current) return;
    voiceSweepDone.current = true;
    (async () => {
      try {
        const since = Date.now() - 5 * 60 * 1000;
        const found: { tripId: string; clipId: string; voiceUrl: string; senderName: string; at: number }[] = [];
        await Promise.all(
          trips.slice(0, 20).map(async (t) => {
            try {
              const clip = await fetchLatestVoiceClip(t.id, since);
              if (clip && clip.clipId) found.push({ tripId: t.id, ...clip });
            } catch { /* per-trip fail, skip */ }
          })
        );
        found.sort((a, b) => b.at - a.at);
        const fresh = found.find((f) => !wasVoicePlayed(f.clipId));
        if (!fresh) return;
        markVoicePlayed(fresh.clipId);
        setActiveTripId(fresh.tripId);
        setAppView('trip_dashboard');
        await playVoiceLoud(fresh.voiceUrl);
        showNotifFlash(`Voice from ${fresh.senderName} • played`);
      } catch { /* silent */ }
    })();
  }, [authed, trips]);

  // Card Share: publish under the trip's stable code and open the Google-style Public Link Share dialog
  const [shareSheet, setShareSheet] = useState<{
    title?: string;
    tripTitle?: string;
    inviteCode?: string;
    url?: string;
    text?: string;
  } | null>(null);

  const handleShareTripCard = async (trip: Trip) => {
    try {
      const { trip: updated, code } = await publishTripInvite(trip);
      setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      const text = shareMessage(updated.title, code);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wandersync.app';
      const url = `${origin}/?join=${code}`;
      setShareSheet({
        title: 'Share public link',
        tripTitle: updated.title,
        inviteCode: code,
        url,
        text,
      });
    } catch {
      alert('Could not generate share link right now. Check internet and retry.');
    }
  };

  // Join: trip object from Profile join flow → lands on my phone
  const handleJoinTripById = (trip: Trip) => {
    setTrips((prev) => {
      const exists = prev.some((t) => t.id === trip.id);
      return exists ? prev.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...prev];
    });
    setActiveTripId(trip.id);
    setActiveTab('trip');
    setAppView('trip_dashboard');
  };

  // Native SMS auto-log (Android app only): bank debit SMS → expense + notification
  const smsCtx = useRef({ trips, activeTripId });
  smsCtx.current = { trips, activeTripId };
  const lastSmsAt = useRef<{ body: string; at: number }>({ body: '', at: 0 });
  useEffect(() => {
    if (!isNativeApp()) return;
    ensureReminderChannel();
    let handle: { remove: () => void } | null = null;
    (async () => {
      try {
        await NativeSms.requestSmsPermission();
        await ensureReminderChannel();
        handle = await NativeSms.addListener('smsReceived', async ({ body }) => {
          const now = Date.now();
          if (body === lastSmsAt.current.body && now - lastSmsAt.current.at < 60000) return;
          lastSmsAt.current = { body, at: now };
          const res = parseBankSMS(body);
          if (!res) return;
          // SIP / EMI / rent / mutual-fund debits are never trip expenses — skip silently
          if (isRecurringDebit(body)) return;
          const { trips: t, activeTripId: aid } = smsCtx.current;
          const trip = t.find((x) => x.id === aid) ?? t[0];
          if (!trip || !isDateWithinTrip(res.date, trip.startDate, trip.endDate)) return;
          const me = trip.members.find((m) => m.isCurrentUser) || trip.members[0];
          if (!me) return;
          const perHead = Math.round((res.amount / trip.members.length) * 100) / 100;
          handleSaveExpense({
            id: `exp_sms_${now}`,
            tripId: trip.id,
            cityId: trip.cities[0]?.id,
            title: res.merchant,
            amount: res.amount,
            currency: 'INR',
            category: res.category,
            paymentMode: 'sms_auto',
            paidByMemberId: me.id,
            date: res.date,
            time: res.time,
            notes: `Auto-logged from ${res.bankName} SMS`,
            isGroupExpense: true,
            splits: trip.members.map((m) => ({ memberId: m.id, amount: perHead })),
            isAutoParsedSMS: true,
            originalSMS: body,
          });
          try {
            await loudNotify(
              'Expense auto-logged',
              `Rs.${res.amount.toLocaleString('en-IN')} at ${res.merchant} — ${trip.title}`,
              now % 2147483647
            );
          } catch { /* notifications unavailable */ }
        });
      } catch { /* permission denied — manual paste still works */ }
    })();
    return () => {
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authed) {
    return (
      <AuthScreen
        onAuth={(signupProfile) => {
          setTripsHydrating(true);
          setAuthed(true);
          setAppView('landing');
          if (signupProfile) {
            // Signup: save profile immediately so WelcomeScreen is skipped
            handleSaveProfile({ name: signupProfile.name, phone: signupProfile.phone });
            setTripsHydrating(false);
            // Handle invite code join after render
            if (signupProfile.inviteCode) {
              lookupInvite(signupProfile.inviteCode).then((ids) => {
                return joinTripById(ids[0]).then(handleJoinTripById);
              }).catch(() => {});
            }
          } else {
            // Login: pull name/phone from server so WelcomeScreen is skipped
            authGetUser().then((u) => {
              if (u) {
                setMyUid(u.uid);
                hydrateRemoteTrips(u.uid).catch(() => setTripsHydrating(false));
                if (u.name?.trim()) {
                  const restored: UserProfile = {
                    name: u.name.trim(),
                    phone: u.phone || '',
                    role: (u.role as UserProfile['role']) || (u.isAdmin ? 'admin' : undefined),
                    joinedAt: profile?.joinedAt || new Date().toISOString(),
                  };
                  setProfile(restored);
                  saveUserProfile(restored);
                }
              }
            }).catch(() => setTripsHydrating(false));
          }
        }}
      />
    );
  }

  if (tripsHydrating) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return <WelcomeScreen onDone={handleWelcomeDone} />;
  }

  if (appView === 'admin_activity') {
    return (
      <AdminActivity
        onBack={() => setAppView('landing')}
        myUid={myUid}
      />
    );
  }

  if (appView === 'profile') {
    return (
      <>
        <ProfilePage
          profile={profile}
          onSave={handleSaveProfile}
          onJoinTrip={handleJoinTripById}
          onBack={() => setAppView('landing')}
          onOpenAdmin={() => setAppView('admin_activity')}
          onLogout={async () => {
            const { authSignOutAll } = await import('./utils/supabaseClient');
            await authSignOutAll();
            setAuthed(false);
            setProfile(null);
            setMyUid(null);
          }}
        />
        {SirenBanner}
        {FlashToast}
      </>
    );
  }

  if (appView === 'landing') {
    return (
      <>
        {SirenBanner}
        {FlashToast}
        <TripLandingView
          trips={trips}
          expenses={expenses}
          onSelectTrip={handleSelectTrip}
          onCreateTrip={handleCreateTrip}
          onEditTrip={handleEditTripFromLanding}
          onDeleteTrip={handleDeleteTrip}
          userName={profile?.name}
          userId={myUid}
          onOpenProfile={() => setAppView('profile')}
          onShareTrip={handleShareTripCard}
          myUid={myUid}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={setOwnerFilter}
        />
        <TripCreateModal
          isOpen={isTripCreateOpen}
          onClose={() => setIsTripCreateOpen(false)}
          onSaveTrip={handleSaveNewTrip}
          editingTrip={editingTrip}
          ownerUid={myUid}
        />
        {shareSheet && (
          <ShareDialog
            title={shareSheet.title || 'Share public link'}
            tripTitle={shareSheet.tripTitle}
            inviteCode={shareSheet.inviteCode}
            url={shareSheet.url}
            text={shareSheet.text}
            onClose={() => setShareSheet(null)}
          />
        )}
      </>
    );
  }

  if (!activeTrip) {
    setAppView('landing');
    return null;
  }

  return (
    <div
      className={`bg-slate-50 text-slate-800 flex flex-col selection:bg-indigo-500 selection:text-white ${
        activeTab === 'chat'
          ? 'fixed inset-0 w-full h-[100dvh] max-h-[100dvh] overflow-hidden justify-start pb-0 overscroll-none'
          : 'min-h-screen justify-between pb-24'
      }`}
      style={
        activeTab === 'chat' && chatViewportHeight
          ? { height: `${chatViewportHeight}px`, maxHeight: `${chatViewportHeight}px` }
          : undefined
      }
    >
      {SirenBanner}
      {FlashToast}
      <Navbar
        activeTab={activeTab}
        onTabChange={(t) => {
          setActiveTab(t);
          setNotifOpen(false);
        }}
        onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
        totalSpent={viewerBudget(activeTrip, tripExpenses, myUid, isAdmin).spent}
        totalBudget={viewerBudget(activeTrip, tripExpenses, myUid, isAdmin).budget}
        tripTitle={activeTrip.title}
        onBackToTrips={() => setAppView('landing')}
        unreadCount={chatFeed.filter((m) => msgTimeMs(m.createdAt) > lastSeen && m.senderId !== myUid && m.type !== 'system').length}
        onBellClick={() => setNotifOpen((v) => !v)}
        bellPulse={bellPulse}
      />
      {notifOpen && (() => {
        const openChat = () => {
          setNotifOpen(false);
          setActiveTab('chat');
        };
        // Unified smart feed: latest first, cap 30 — splitwise no longer sticks to the top
        const feed: FeedItem[] = [
          ...activity.flatMap((a) => {
            const it = parseActivity(a, a.at > notifSeenAt, profile?.name);
            return it ? [it] : [];
          }),
          ...chatFeed.flatMap((m) => {
            const it = parseChatMessage(
              m,
              myUid,
              msgTimeMs(m.createdAt) > lastSeen && m.senderId !== myUid && m.type !== 'system'
            );
            return it ? [it] : [];
          }),
        ]
          .sort((a, b) => b.at - a.at)
          .slice(0, 30);
        const unreadCount = feed.filter((f) => f.isUnread).length;
        const META: Record<FeedItem['category'], { icon: React.ReactNode; box: string }> = {
          transaction: {
            icon: <Receipt size={12} />,
            box: 'bg-emerald-50 border-emerald-200 text-emerald-600',
          },
          mention: {
            icon: <AtSign size={12} />,
            box: 'bg-indigo-50 border-indigo-200 text-indigo-600',
          },
          message: {
            icon: <MessageCircle size={12} />,
            box: 'bg-slate-100 border-slate-200 text-slate-500',
          },
          location: {
            icon: <MapPin size={12} />,
            box: 'bg-teal-50 border-teal-200 text-teal-600',
          },
          siren: {
            icon: <Bell size={12} />,
            box: 'bg-violet-50 border-violet-200 text-violet-600',
          },
          voice: {
            icon: <Radio size={12} />,
            box: 'bg-indigo-50 border-indigo-200 text-indigo-600',
          },
        };
        const renderBody = (f: FeedItem) => {
          // Handles (@squad / @Member) + trip name (join lines) blue — baaki plain.
          const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const handles = [
            'squad',
            ...activeTrip.members.map((m) => m.name.replace(/\(You\)/g, '').trim()).filter(Boolean),
          ].sort((a, b) => b.length - a.length).map((n) => `@${esc(n)}`);
          if (f.tripHighlight) handles.push(esc(f.tripHighlight));
          if (handles.length === 0) return <span>{f.messageBody}</span>;
          const parts = f.messageBody.split(new RegExp(`(${handles.join('|')})(?!\\w)`, 'gi'));
          return parts.map((seg, i) =>
            i % 2 === 1 ? (
              <span key={i} className="text-indigo-600 font-bold">{seg}</span>
            ) : (
              <span key={i}>{seg}</span>
            )
          );
        };
        return (
          <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
              <button onClick={() => setNotifOpen(false)} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <h4 className="text-sm font-extrabold text-slate-900">
                Notifications{unreadCount > 0 ? ` — ${unreadCount} unread` : ''}
              </h4>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-white overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {unreadCount > 0 && (
                <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 sticky top-0 bg-white">
                  Unread — {unreadCount}
                </p>
              )}
              {feed.map((f) => {
                const meta = META[f.category];
                const inner = (
                  <>
                    {f.isUnread && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />}
                    <span className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.box}`}>
                      {meta.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-slate-600 truncate">
                        <strong className="font-extrabold text-slate-900">{f.actor}</strong>{' '}{renderBody(f)}{' '}
                        {f.highlightData && (
                          <span className={`inline-block px-1.5 py-px rounded-md text-[10px] font-extrabold ${f.category === 'transaction' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                            {f.highlightData}
                          </span>
                        )}
                      </span>
                      {f.previewText && (f.category === 'message' || f.category === 'mention') && (
                        <span className="block text-[11px] text-slate-500 truncate">"{f.previewText}"</span>
                      )}
                      <span className="block text-[10px] text-slate-400 font-medium">{f.relativeTime}</span>
                    </span>
                  </>
                );
                return f.opensChat ? (
                  <button
                    key={f.id}
                    onClick={openChat}
                    className={`w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer flex items-start gap-2 ${f.isUnread ? 'bg-indigo-50/40' : ''}`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    key={f.id}
                    className={`w-full text-left px-4 py-2.5 border-b border-slate-50 flex items-start gap-2 ${f.isUnread ? 'bg-indigo-50/40' : ''}`}
                  >
                    {inner}
                  </div>
                );
              })}
              {feed.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-6">No notifications yet.</p>
              )}
              {feed.length >= 30 && (
                <p className="text-[10px] text-slate-400 text-center py-3 font-medium">Showing latest 30 — scroll up for more</p>
              )}
            </div>
          </div>
        );
      })()}

      <main className={`max-w-3xl mx-auto w-full flex-1 ${activeTab === 'chat' ? 'px-3 sm:px-6 pt-1 pb-1 flex flex-col min-h-0 overflow-hidden' : 'px-4 sm:px-6 py-6'}`}>
        {activeTab === 'trip' && (
          <CleanTripView
            trip={activeTrip}
            expenses={tripExpenses}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onOpenTripEditor={() => setIsTripEditorOpen(true)}
            onGoExpenses={() => setActiveTab('expenses')}
            onUpdateTrip={handleUpdateTrip}
            onShareTrip={() => {
              if (activeTrip) handleShareTripCard(activeTrip);
            }}
            myUid={myUid}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'todo' && (
          <TodoView
            todos={myTripTodos}
            onAddTodo={handleAddTodo}
            onToggleTodo={handleToggleTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        )}
        {activeTab === 'expenses' && (
          <CleanExpensesView
            trip={activeTrip}
            expenses={tripExpenses}
            settlements={tripSettlements}
            expenseEvents={tripExpenseEvents}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            onGoSplit={() => setActiveTab('split')}
            onSettle={handleSettle}
            myUid={myUid}
          />
        )}
        {activeTab === 'split' && (
          <CleanSplitView
            trip={activeTrip}
            expenses={tripExpenses}
            settlements={tripSettlements}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            onBackToExpenses={() => setActiveTab('expenses')}
            onSettle={handleSettle}
            onUndoSettlement={handleUndoSettlement}
            myUid={myUid}
          />
        )}
        {activeTab === 'chat' && (
          <ChatView
            trip={activeTrip}
            myName={profile?.name || activeTrip.members.find((m) => m.isCurrentUser)?.name || 'Friend'}
            myUid={myUid}
            unreadIds={chatFeed
              .filter((m) => msgTimeMs(m.createdAt) > lastSeen && m.senderId !== myUid && m.type !== 'system')
              .map((m) => m.id)}
          />
        )}
        {activeTab === 'vault' && (
          <CleanVaultView
            documents={tripDocuments}
            photos={tripPhotos}
            recommendations={recommendations}
            trip={activeTrip}
            onAddDocument={handleAddDocument}
            onUpdateDocument={handleUpdateDocument}
            onDeleteDocument={handleDeleteDocument}
            onAddPhoto={handleAddPhoto}
            onAddPhotos={handleAddPhotos}
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
        ownerUid={myUid}
      />
      {shareSheet && (
        <ShareDialog
          title={shareSheet.title || 'Share public link'}
          tripTitle={shareSheet.tripTitle}
          inviteCode={shareSheet.inviteCode}
          url={shareSheet.url}
          text={shareSheet.text}
          onClose={() => setShareSheet(null)}
        />
      )}
    </div>
  );
}

export default App;
