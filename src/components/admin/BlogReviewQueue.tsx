import React, { useEffect, useState } from 'react';
import { Check, X, Star, ChevronUp, ChevronDown } from 'lucide-react';
import {
  fetchPendingBlogs,
  fetchBlogs,
  reviewBlog,
  featureBlog,
  deleteBlog,
  moveBlog,
  type BlogPost,
} from '../../utils/blogs';

interface BlogReviewQueueProps {
  notify: (msg: string) => void;
  onOpenBlog: (id: string) => void;
  onChanged?: () => void;
}

/** Admin review queue: pending blogs approve/reject + feature toggle. */
export const BlogReviewQueue: React.FC<BlogReviewQueueProps> = ({ notify, onOpenBlog, onChanged }) => {
  const [pending, setPending] = useState<BlogPost[]>([]);
  const [featured, setFeatured] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([fetchPendingBlogs(), fetchBlogs({ featured: true, limit: 20 })])
      .then(([p, f]) => {
        setPending(p);
        setFeatured(f);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, fn: () => Promise<void>, msg: string) => {
    setBusyId(id);
    try {
      await fn();
      setPending((prev) => prev.filter((p) => p.id !== id));
      notify(msg);
      onChanged?.();
      try {
        window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
      } catch { /* ignore */ }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (pending.length === 0 && featured.length === 0) {
    return <p className="text-center text-sm text-slate-400 py-8">Review queue is empty 🎉</p>;
  }

  const move = (id: string, dir: 'up' | 'down') => {
    setBusyId(id);
    moveBlog(id, dir)
      .then(() => fetchBlogs({ featured: true, limit: 20 }))
      .then((rows) => {
        setFeatured(rows);
        try {
          window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
        } catch { /* ignore */ }
      })
      .catch((e) => notify(e instanceof Error ? e.message : 'Move failed.'))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="px-4 space-y-2 pb-24">
      {featured.length > 0 && (
        <>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1 pt-1">
            Login cards order (top = first)
          </p>
          {featured.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-3 border border-amber-200/70 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-900 truncate">{p.title}</span>
                <span className="block text-[10px] text-slate-400 font-medium">★ featured</span>
              </span>
              <button
                onClick={() => move(p.id, 'up')}
                disabled={busyId === p.id}
                aria-label="Move up"
                className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => move(p.id, 'down')}
                disabled={busyId === p.id}
                aria-label="Move down"
                className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          ))}
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1 pt-3">
            Pending review
          </p>
        </>
      )}
      {pending.map((p) => (
        <div key={p.id} className="bg-white rounded-2xl p-3 border border-slate-100">
          <button onClick={() => onOpenBlog(p.id)} className="w-full text-left cursor-pointer">
            <p className="text-xs font-bold text-slate-900 truncate">{p.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {p.authorName} · {p.tag} · {(p.body || '').split(/\s+/).filter(Boolean).length} words
            </p>
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{p.excerpt}</p>
          </button>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={() => void act(p.id, () => reviewBlog(p.id, true), 'Published.')}
              disabled={busyId === p.id}
              className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Check size={14} strokeWidth={3} /> Approve
            </button>
            <button
              onClick={() => void act(p.id, () => reviewBlog(p.id, false), 'Rejected.')}
              disabled={busyId === p.id}
              className="flex-1 h-9 rounded-xl bg-white border border-slate-200 hover:border-rose-300 text-rose-500 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <X size={14} strokeWidth={3} /> Reject
            </button>
            <button
              onClick={() => void act(p.id, () => featureBlog(p.id, !p.featured), p.featured ? 'Unfeatured.' : 'Featured on login.')}
              disabled={busyId === p.id}
              title="Feature on login page"
              className={`w-10 h-9 rounded-xl border flex items-center justify-center cursor-pointer ${
                p.featured ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-500'
              }`}
            >
              <Star size={15} className={p.featured ? 'fill-amber-400' : ''} />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${p.title}" permanently?`)) {
                  void act(p.id, () => deleteBlog(p.id), 'Deleted.');
                }
              }}
              disabled={busyId === p.id}
              title="Delete"
              className="w-10 h-9 rounded-xl bg-white border border-slate-200 text-slate-300 hover:text-rose-500 hover:border-rose-300 flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BlogReviewQueue;
