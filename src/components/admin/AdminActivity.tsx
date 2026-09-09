import React, { useState, useEffect } from 'react';
import { ChevronLeft, Users, MapPin, Trash2, Plus, Pencil, Shield, User, X } from 'lucide-react';
import { supabase, getAllUsers, adminDeleteUser, adminCreateUser, adminUpdateUser, adminResetPassword, type ManagedUser } from '../../utils/supabaseClient';
import type { Trip } from '../../types';

interface AdminActivityProps {
  onBack: () => void;
  myUid: string | null;
}

export function AdminActivity({ onBack, myUid }: AdminActivityProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'users' | 'trips'>('users');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', phone: '', role: 'user' });
  const [modalError, setModalError] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const [u, t] = await Promise.all([
      getAllUsers(),
      supabase.from('trips').select('*').order('updatedAt', { ascending: false }),
    ]);
    setUsers(u);
    setTrips((t.data || []) as Trip[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDeleteUser = async (uid: string) => {
    if (uid === myUid) return;
    if (!confirm('Delete this user and all their trips?')) return;
    try {
      await adminDeleteUser(uid);
      load();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!confirm('Delete this trip?')) return;
    await supabase.from('trips').delete().eq('id', tripId);
    load();
  };

  const handleAddUser = async () => {
    setModalError('');
    if (!newUser.email || !newUser.name) { setModalError('Name and email required'); return; }
    if (!newUser.password || newUser.password.length < 6) { setModalError('Set a login password (min 6 characters)'); return; }
    try {
      await adminCreateUser(newUser.email, newUser.password, newUser.name, newUser.phone, newUser.role);
      setNewUser({ email: '', password: '', name: '', phone: '', role: 'user' });
      setShowAddUser(false);
      load();
    } catch (e: any) {
      setModalError(e?.message || 'Create failed');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setModalError('');
    // Never let an admin demote/remove their own admin access (would lock out)
    const original = users.find((x) => x.id === editingUser.id);
    if (editingUser.id === myUid && original?.role === 'admin' && editingUser.role !== 'admin') {
      setModalError('You cannot remove your own admin role');
      return;
    }
    try {
      await adminUpdateUser(editingUser.id, {
        name: editingUser.name,
        phone: editingUser.phone,
        role: editingUser.role,
      });
      setEditingUser(null);
      setResetPw('');
      setResetMsg('');
      load();
    } catch (e: any) {
      setModalError(e?.message || 'Update failed');
    }
  };

  const handleResetPw = async () => {
    if (!editingUser) return;
    setModalError('');
    setResetMsg('');
    if (resetPw.length < 6) { setModalError('New password must be at least 6 characters'); return; }
    try {
      await adminResetPassword(editingUser.id, resetPw);
      setResetPw('');
      setResetMsg('Password updated — share it with the user securely.');
    } catch (e: any) {
      setModalError(e?.message || 'Reset failed');
    }
  };

  const totalMembers = trips.reduce((a, t) => a + (t.members?.length || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-extrabold text-slate-900">Admin Dashboard</h1>
          <p className="text-[11px] text-slate-500">Full access to all data</p>
        </div>
        <Shield className="w-5 h-5 text-indigo-600" />
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center">
          <p className="text-2xl font-extrabold text-indigo-600">{users.length}</p>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Users</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center">
          <p className="text-2xl font-extrabold text-emerald-600">{trips.length}</p>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Trips</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-slate-100 text-center">
          <p className="text-2xl font-extrabold text-amber-600">{totalMembers}</p>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">Members</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 flex gap-2 mb-3">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            tab === 'users' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab('trips')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            tab === 'trips' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          Trips ({trips.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : tab === 'users' ? (
        <div className="px-4 space-y-2 pb-24">
          {/* Add User Button */}
          <button
            onClick={() => { setShowAddUser(true); setModalError(''); }}
            className="w-full py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-indigo-100"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>

          {users.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No users yet</p>
          )}

          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-2xl p-3 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate">{u.name || 'No name'}</p>
                    {u.role === 'admin' && (
                      <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">ADMIN</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                  {u.phone && <p className="text-[11px] text-slate-400">{u.phone}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingUser(u); setModalError(''); setResetPw(''); setResetMsg(''); }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    disabled={u.id === myUid}
                    title={u.id === myUid ? 'You cannot delete your own account' : 'Delete user'}
                    className="p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 space-y-2 pb-24">
          {trips.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">No trips yet</p>
          )}

          {trips.map((t) => {
            const owner = t.members?.find((m) => m.uid === t.ownerUid);
            return (
              <div key={t.id} className="bg-white rounded-2xl p-3 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{t.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {owner?.name || 'Unknown'} · {t.members?.length || 0} members · {t.status}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteTrip(t.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Add User</h3>
              <button onClick={() => setShowAddUser(false)} className="p-1 cursor-pointer"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="Email" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Login password (min 6)" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500">
              <option value="user">User</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
            </select>
            {modalError && (
              <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{modalError}</p>
            )}
            <button onClick={handleAddUser} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">Create</button>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="p-1 cursor-pointer"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <input value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} placeholder="Name" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <input value={editingUser.email} disabled className="w-full rounded-xl border border-slate-100 px-3 py-2 text-xs bg-slate-50 text-slate-400" />
            <input value={editingUser.phone} onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })} placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500" />
            <select value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:border-indigo-500">
              <option value="user">User</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={handleUpdateUser} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">Save Changes</button>
            {/* Password reset — nobody can SEE a password (bcrypt hashes);
                admin sets a new one and shares it with the user */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-2">
              <p className="text-[11px] font-bold text-slate-700">Reset password</p>
              <div className="flex gap-2">
                <input value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="New password (min 6)" type="password" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-indigo-500" />
                <button onClick={handleResetPw} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer">Set</button>
              </div>
              {resetMsg && (
                <p className="text-[11px] text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{resetMsg}</p>
              )}
            </div>
            {modalError && (
              <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{modalError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
