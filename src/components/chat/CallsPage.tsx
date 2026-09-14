import React, { useMemo } from 'react';
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import { ui } from './chatStore';

interface CallsPageProps {
  people: { id: string; name: string; avatar: string }[];
  onDummyAction: (msg: string) => void;
}

interface DemoCall {
  id: string;
  name: string;
  avatar: string;
  direction: 'in' | 'out';
  missed: boolean;
  video: boolean;
  time: string;
}

/** Static call-history skeleton (real calling backend plugs in here later). */
export const CallsPage: React.FC<CallsPageProps> = ({ people, onDummyAction }) => {
  const rows = useMemo<DemoCall[]>(() => {
    const fallback = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan'];
    const names = (people.length > 0 ? people : fallback.map((n, i) => ({ id: `d${i}`, name: n, avatar: '' }))).slice(0, 5);
    const times = ['9:41pm', '7:15pm', 'Yesterday', 'Yesterday', 'Monday'];
    return names.map((p, i) => ({
      id: `call_${p.id}`,
      name: p.name,
      avatar: p.avatar,
      direction: i % 2 === 0 ? 'in' : 'out',
      missed: i === 2,
      video: i % 3 === 0,
      time: times[i % times.length],
    }));
  }, [people]);

  return (
    <div>
      <p className={ui.section}>Recent calls — {rows.length}</p>
      <div className="space-y-2">
        {rows.map((c) => (
          <div key={c.id} className={ui.row}>
            <MemberAvatar name={c.name} avatar={c.avatar} memberId={c.id} index={0} size="md" />
            <span className="min-w-0 flex-1">
              <span className={ui.title}>{c.name}</span>
              <span className="flex items-center gap-1 text-[11px] font-medium">
                {c.direction === 'in' ? (
                  <ArrowDownLeft size={13} className={c.missed ? 'text-rose-500' : 'text-emerald-500'} />
                ) : (
                  <ArrowUpRight size={13} className="text-emerald-500" />
                )}
                <span className={c.missed ? 'text-rose-500 font-bold' : 'text-slate-500'}>
                  {c.missed ? 'Missed' : c.direction === 'in' ? 'Incoming' : 'Outgoing'} · {c.time}
                </span>
              </span>
            </span>
            <button
              onClick={() => onDummyAction(`Call ${c.name} — coming soon`)}
              aria-label={c.video ? 'Video call' : 'Voice call'}
              title={c.video ? 'Video call' : 'Voice call'}
              className={`${ui.iconBtn} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`}
            >
              {c.video ? <Video size={18} /> : <Phone size={17} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
