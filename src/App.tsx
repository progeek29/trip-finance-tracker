import React, { useState, useEffect, useRef } from 'react';
import {
  Trip,
  Expense,
  DocumentVaultItem,
  SharedPhoto,
  PlaceRecommendation,
  TripTodo,
  ChatMessage,
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
} from './utils/storage';

import { Navbar, CleanTab } from './components/common/Navbar';
import { WelcomeScreen } from './components/trip/WelcomeScreen';
import { ChatView } from './components/chat/ChatView';
import { TodoView } from './components/todo/TodoView';
import { publishTripInvite, lookupInvite, joinTripById, shareMessage } from './utils/invites';
import { ensureCloudUser, authGetUser, authSignOut } from './utils/supabaseClient';
import { pushTripShared, subscribeTripShared, pushTombstone, deleteTripFromFirestore, deleteInviteByCode, type RemoteSnapshot } from './utils/sync';
import { subscribeChat } from './utils/chat';
import { registerPushToken } from './utils/push';
import { playVoiceLoud, deleteVoiceFile, ringLocalSiren } from './utils/voice';
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

  const [activeTab, setActiveTab] = useState<CleanTab>(loadSessionTab);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isTripEditorOpen, setIsTripEditorOpen] = useState(false);
  const [isTripCreateOpen, setIsTripCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

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

  // One-time: purane data: URLs ko bade godown (IndexedDB) me shift karo — UI same
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
    // Auto-publish to Supabase so invite code works for others
    publishTripInvite(trip).then(({ trip: updated }) => {
      setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }).catch((e) => {
      console.error('publishTripInvite failed:', e);
    });
  };

  const handleUpdateTrip = (updated: Trip) => {
    setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleDeleteTrip = (tripId: string) => {
    const doomed = trips.find((t) => t.id === tripId);
    const tripPhotos = photos.filter((p) => p.tripId === tripId);
    const tripDocs = documents.filter((d) => d.tripId === tripId);
    if (doomed) deleteMediaRefs(collectRefs([doomed, ...tripPhotos, ...tripDocs]));
    deleteManyFromPhoneFolder([
      ...tripPhotos.map((p) => p.phonePath),
      ...tripDocs.flatMap((d) => [d.phonePath, ...(d.phonePaths || [])]),
    ]);
    setPhotos((prev) => prev.filter((p) => p.tripId !== tripId));
    setDocuments((prev) => prev.filter((d) => d.tripId !== tripId));
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    if (activeTripId === tripId) {
      setActiveTripId(null);
      setAppView('landing');
    }
    // Delete from Firestore so all members lose access
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
      updatedAt: Date.now(),
      updatedBy: myUid || 'local',
    };
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === stamped.id);
      if (exists) return prev.map((e) => (e.id === stamped.id ? stamped : e));
      return [stamped, ...prev];
    });
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
    if (activeTrip?.inviteCode) {
      pushTombstone(activeTrip.id, 'expenses', id).catch(() => undefined);
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
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

  // Trip checklist — chhota sa todo (buy this, meet them)
  const handleAddTodo = (text: string) => {
    if (!activeTrip || !text.trim()) return;
    setTodos((prev) => [
      { id: `todo_${Date.now()}`, tripId: activeTrip.id, text: text.trim().slice(0, 120), done: false, createdAt: new Date().toISOString(), updatedAt: Date.now(), updatedBy: myUid || 'local' },
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
    setTrips((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) =>
          m.isCurrentUser ? { ...m, name: p.name, phone: p.phone } : m
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
        if (ids.length > 0) {
          handleJoinTripById(await joinTripById(ids[0]));
        }
      } catch {
        showNotifFlash('Could not find trip for this code. Check the code and try again.');
      }
    }
  };
  const [myUid, setMyUid] = useState<string | null>(null);
  const isAdmin = profile?.role === 'admin' || (!!(profile?.name && profile?.phone) && getAdminStatus(profile.name, profile.phone));
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'owned' | 'joined'>('all');
  const [pushFlash, setPushFlash] = useState<{ text: string; name?: string } | null>(null);
  const pushFlashTimer = useRef<number | null>(null);
  const showNotifFlash = (msg: string, name?: string) => {
    setPushFlash({ text: msg, name });
    if (pushFlashTimer.current) window.clearTimeout(pushFlashTimer.current);
    pushFlashTimer.current = window.setTimeout(() => setPushFlash(null), 5000);
  };

  // Check auth on mount
  useEffect(() => {
    authGetUser().then((u) => {
      setAuthed(!!u);
      if (u) setMyUid(u.uid);
    }).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    ensureCloudUser()
      .then((u) => setMyUid(u.uid))
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
              if (ids.length > 0) {
                const joined = await joinTripById(ids[0]);
                handleJoinTripById(joined);
                showNotifFlash(`Joined "${joined.title}"!`);
              }
            } catch {
              showNotifFlash(`Could not find trip for code: ${joinCode}`);
            }
          })();
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Trip isolation: once we know myUid, remove trips where I'm not a member
  useEffect(() => {
    if (!myUid) return;
    setTrips((prev) => {
      const filtered = prev.filter((t) =>
        t.members.some((m) => m.uid === myUid)
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [myUid]);

  // Notifications: unread count + @mention watch + panel feed
  const [notifOpen, setNotifOpen] = useState(false);
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
    const off = subscribeChat(activeTrip.id, setChatFeed);
    return () => off();
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
        showNotifFlash(`${m.senderName} mentioned you • ${when}`, m.senderName);
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
  const knownExpenseIds = useRef<Set<string>>(new Set());
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
      pushTripShared(activeTrip, expenses, todos, documents).catch(() => undefined);
    }, 1500);
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, activeTrip?.inviteCode, appView, expenses, todos, documents, trips]);

  // Pull remote changes, merge last-write-wins, notify on newcomers
  useEffect(() => {
    if (!activeTrip?.inviteCode || appView !== 'trip_dashboard') return;
    const tripId = activeTrip.id;
    const off = subscribeTripShared(tripId, (snap) => {
      // Trip fields (members/cities join here)
      const remoteAt = (snap.trip as { updatedAt?: number }).updatedAt || 0;
      if (remoteAt > (tripSyncAt.current[tripId] || 0)) {
        tripSyncAt.current[tripId] = remoteAt;
        setTrips((prev) =>
          prev.map((t) => {
            if (t.id !== tripId) return t;
            const r = snap.trip;
            return {
              ...t,
              title: typeof r.title === 'string' ? r.title : t.title,
              description: typeof r.description === 'string' ? r.description : t.description,
              coverImage: typeof r.coverImage === 'string' ? r.coverImage : t.coverImage,
              startDate: typeof r.startDate === 'string' ? r.startDate : t.startDate,
              endDate: typeof r.endDate === 'string' ? r.endDate : t.endDate,
              totalBudget: typeof r.totalBudget === 'number' ? r.totalBudget : t.totalBudget,
              members: Array.isArray(r.members) && r.members.length > 0 ? (r.members as Trip['members']) : t.members,
              cities: Array.isArray(r.cities) ? (r.cities as Trip['cities']) : t.cities,
            };
          })
        );
      }
      // Expenses: tombstones + LWW + newcomer alerts
      setExpenses((prev) => {
        let next = [...prev];
        let changed = false;
        for (const r of snap.expenses) {
          const idx = next.findIndex((e) => e.id === r.id);
          if ((r as { _deleted?: boolean })._deleted) {
            if (idx >= 0) {
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
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip?.id, activeTrip?.inviteCode, appView]);

  // Newcomer expense alerts (split → involved members, with payer name highlighted)
  const seenExpTripRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTrip) return;
    if (seenExpTripRef.current !== activeTrip.id) {
      seenExpTripRef.current = activeTrip.id;
      expenses.forEach((e) => knownExpenseIds.current.add(e.id));
      return;
    }
    const me = activeTrip.members.find((m) => m.isCurrentUser);
    for (const e of expenses) {
      if (e.tripId !== activeTrip.id || knownExpenseIds.current.has(e.id)) continue;
      knownExpenseIds.current.add(e.id);
      if (!e.updatedBy || (myUid && e.updatedBy === myUid)) continue;
      const payer = activeTrip.members.find((m) => m.id === e.paidByMemberId);
      const payerName = payer ? payer.name.replace(/\(You\)/g, '').trim() : 'Someone';
      const nd = new Date();
      const when = `${nd.getDate()} ${nd.toLocaleDateString([], { month: 'short' })}, ${nd.getHours() % 12 || 12}:${String(nd.getMinutes()).padStart(2, '0')} ${nd.getHours() >= 12 ? 'pm' : 'am'}`;
      const iInSplit = me && e.splits.some((s) => s.memberId === me.id);
      if (e.isGroupExpense && iInSplit) {
        const withList = e.splits
          .map((s) => activeTrip.members.find((mm) => mm.id === s.memberId)?.name?.replace(/\(You\)/g, '').trim() || '')
          .filter((n) => n && n !== payerName);
        const withStr = withList.length > 0 ? ` with @${withList.join(', @')}` : '';
        const title = `${payerName} just logged Rs.${e.amount.toLocaleString('en-IN')} for ${e.title}${withStr}`;
        pushActivity({ id: `exp_${e.id}`, title, sub: when, at: Date.now() });
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
          const d = (n.data || {}) as { kind?: string; title?: string; body?: string; voiceUrl?: string; voicePath?: string };
          if (d.kind === 'voice' && d.voiceUrl) {
            await playVoiceLoud(d.voiceUrl);
            if (d.voicePath) await deleteVoiceFile(d.voicePath);
            showFlash('Voice played • vanished');
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
          setAuthed(true);
          if (signupProfile) {
            // Signup: save profile immediately so WelcomeScreen is skipped
            handleSaveProfile({ name: signupProfile.name, phone: signupProfile.phone });
            // Handle invite code join after render
            if (signupProfile.inviteCode) {
              lookupInvite(signupProfile.inviteCode).then((ids) => {
                if (ids.length > 0) joinTripById(ids[0]).then(handleJoinTripById);
              }).catch(() => {});
            }
          }
        }}
      />
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
      <ProfilePage
        profile={profile}
        onSave={handleSaveProfile}
        onJoinTrip={handleJoinTripById}
        onBack={() => setAppView('landing')}
        onOpenAdmin={() => setAppView('admin_activity')}
        onLogout={async () => {
          const { authSignOut } = await import('./utils/supabaseClient');
          await authSignOut();
          setAuthed(false);
          setProfile(null);
          setMyUid(null);
        }}
      />
    );
  }

  if (appView === 'landing') {
    return (
      <>
        <TripLandingView
          trips={trips}
          expenses={expenses}
          onSelectTrip={handleSelectTrip}
          onCreateTrip={handleCreateTrip}
          onEditTrip={handleEditTripFromLanding}
          onDeleteTrip={handleDeleteTrip}
          userName={profile?.name}
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
      <Navbar
        activeTab={activeTab}
        onTabChange={(t) => {
          setActiveTab(t);
          setNotifOpen(false);
        }}
        onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
        totalSpent={totalSpent}
        totalBudget={activeTrip.totalBudget}
        tripTitle={activeTrip.title}
        onBackToTrips={() => setAppView('landing')}
        unreadCount={chatFeed.filter((m) => msgTimeMs(m.createdAt) > lastSeen && m.senderId !== myUid && m.type !== 'system').length}
        onBellClick={() => setNotifOpen((v) => !v)}
      />
      {notifOpen && (() => {
        const me = activeTrip?.members.find((m) => m.isCurrentUser);
        const isUnread = (m: (typeof chatFeed)[number]) =>
          msgTimeMs(m.createdAt) > lastSeen && m.senderId !== myUid && m.type !== 'system';
        const unreadList = chatFeed.filter(isUnread);
        const mentionList = [...chatFeed]
          .reverse()
          .filter(
            (m) =>
              m.senderId !== myUid &&
              (m.mentions || []).some(
                (x) => (me && x.id === me.id) || (me && me.name ? x.name === me.name : false)
              )
          )
          .slice(0, 5);
        const openChat = () => {
          setNotifOpen(false);
          setActiveTab('chat');
        };
        const row = (m: (typeof chatFeed)[number], unread: boolean) => (
          <button
            key={m.id}
            onClick={openChat}
            className={`w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer flex items-start gap-2 ${unread ? 'bg-indigo-50/40' : ''}`}
          >
            {unread && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 flex-shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold text-slate-900 truncate">
                {m.type === 'siren' || m.type === 'system' ? m.text : m.senderName}
              </span>
              {m.type !== 'siren' && m.type !== 'system' && (
                <span className="block text-[11px] text-slate-500 truncate">
                  {(m.text || (m.type === 'location' ? 'Shared location' : '')).slice(0, 40)}
                </span>
              )}
              <span className="block text-[10px] text-slate-400 font-medium">{notifDate(m.createdAt)}</span>
            </span>
          </button>
        );
        return (
          <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
              <button onClick={() => setNotifOpen(false)} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <h4 className="text-sm font-extrabold text-slate-900">
                Notifications{unreadList.length > 0 ? ` — You have ${unreadList.length} unread` : ''}
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              {(() => {
                const fmtNow = () => {
                  const d = new Date();
                  let h = d.getHours();
                  const suf = h >= 12 ? 'pm' : 'am';
                  h = h % 12 || 12;
                  return `${d.getDate()} ${d.toLocaleDateString([], { month: 'short' })}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${suf}`;
                };
                void fmtNow;
                const renderTitle = (title: string) => {
                  const segs = title.split(/(@[\w ]+)/g);
                  return segs.map((seg, i) =>
                    seg.startsWith('@') ? (
                      <span key={i} className="text-indigo-600 font-bold">{seg}</span>
                    ) : (
                      <span key={i}>{seg}</span>
                    )
                  );
                };
                const recentAll: { id: string; at: number; node: React.ReactNode }[] = [
                  ...activity.map((a) => ({
                    id: a.id,
                    at: a.at,
                    node: (
                      <div
                        key={a.id}
                        className="w-full text-left px-4 py-2.5 border-b border-slate-50 flex items-center gap-2"
                      >
                        <span className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center flex-shrink-0">
                          <Receipt size={12} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-slate-600 truncate">{renderTitle(a.title)}</span>
                          <span className="block text-[10px] text-slate-400 truncate">{a.sub}</span>
                        </span>
                      </div>
                    ),
                  })),
                  ...mentionList.map((m) => ({
                    id: `men-${m.id}`,
                    at: msgTimeMs(m.createdAt) || 0,
                    node: (
                      <button
                        key={`men-${m.id}`}
                        onClick={openChat}
                        className="w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer flex items-start gap-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-extrabold text-slate-900 truncate">
                            {m.senderName} mentioned you
                          </span>
                          <span className="block text-[10px] text-slate-400 font-medium">{notifDate(m.createdAt)}</span>
                        </span>
                      </button>
                    ),
                  })),
                  ...[...chatFeed]
                    .filter((m) => m.type !== 'system' && !isUnread(m))
                    .slice(-8)
                    .reverse()
                    .map((m) => ({
                      id: m.id,
                      at: msgTimeMs(m.createdAt) || 0,
                      node: row(m, false),
                    })),
                ];
                recentAll.sort((a, b) => b.at - a.at);
                const unreadRows = [...chatFeed].filter(isUnread).reverse().map((m) => ({ id: m.id, at: msgTimeMs(m.createdAt) || 0, node: row(m, true) }));
                const all = [...unreadRows, ...recentAll].slice(0, 20);
                return (
                  <>
                    {unreadRows.length > 0 && <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-600">Unread — {unreadList.length}</p>}
                    {all.map((x) => x.node)}
                  </>
                );
              })()}
              {chatFeed.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-6">No notifications yet.</p>
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
            todos={tripTodos}
            onAddTodo={handleAddTodo}
            onToggleTodo={handleToggleTodo}
            onDeleteTodo={handleDeleteTodo}
          />
        )}
        {activeTab === 'expenses' && (
          <CleanExpensesView
            trip={activeTrip}
            expenses={tripExpenses}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            onGoSplit={() => setActiveTab('split')}
          />
        )}
        {activeTab === 'split' && (
          <CleanSplitView
            trip={activeTrip}
            expenses={tripExpenses}
            onOpenQuickAdd={() => { setEditingExpense(null); setIsQuickAddOpen(true); }}
            onEditExpense={handleEditExpense}
            onDeleteExpense={handleDeleteExpense}
            onBackToExpenses={() => setActiveTab('expenses')}
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
