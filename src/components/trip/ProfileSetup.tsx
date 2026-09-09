import React, { useState } from 'react';
import { Logo } from '../common/Logo';
import type { UserProfile } from '../../utils/storage';

interface ProfileSetupProps {
  onSave: (profile: UserProfile) => void;
}

/** First launch: name + mobile. The whole app's "you" comes from here. */
export const ProfileSetup: React.FC<ProfileSetupProps> = ({ onSave }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter your name');
      return;
    }
    onSave({ name: name.trim(), phone: phone.trim() });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="max-w-sm w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-7 space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size={52} />
          <h1 className="text-xl font-extrabold text-slate-900 font-display">Welcome to WanderSync</h1>
          <p className="text-xs text-slate-500 font-medium">Before we start — who are you?</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">What can we call you? *</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">Mobile number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Your mobile number"
            className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
          />
        </div>
        <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer">
          Save
        </button>
      </form>
    </div>
  );
};
