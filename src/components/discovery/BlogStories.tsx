import React, { useEffect, useState } from 'react';
import { PenLine, Pencil, Search, Trash2, X, ChevronRight } from 'lucide-react';
import { MediaImg } from '../common/MediaImg';
import { deleteBlog, fetchBlogs, BLOG_TAGS, type BlogPost, type BlogTag } from '../../utils/blogs';

interface BlogStoriesProps {
  myUid: string | null;
  notify: (msg: string) => void;
  onOpenBlog: (id: string) => void;
  onWrite: () => void;
  onEditBlog?: (blogId: string) => void;
}

/** Community section (replaces the old empty places feed): blogs with tag
 *  pills + search + Write, then the saved-places strip. One section, no
 *  duplication. */
export const BlogStories: React.FC<BlogStoriesProps> = ({
  myUid,
  notify,
  onOpenBlog,
  onWrite,
  onEditBlog,
}) => {
  const [tag, setTag] = useState<BlogTag | ''>('');
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchBlogs({ tag: tag || undefined, limit: 30 }).then((rows) => {
      if (live) {
        setPosts(rows);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [tag, refreshTick]);

  // A delete/publish anywhere (Profile, Admin queue, Composer, a cover
  // photo removed from My posts) must vanish/appear here too — refetch on
  // focus + explicit change events.
  useEffect(() => {
    const refresh = () => setRefreshTick((t) => t + 1);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('ws_blogs_changed', refresh);
    window.addEventListener('ws_moments_changed', refresh);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('ws_blogs_changed', refresh);
      window.removeEventListener('ws_moments_changed', refresh);
    };
  }, []);

  const removeMine = (p: BlogPost) => {
    if (!window.confirm(`Delete "${p.title || '(untitled)'}" everywhere? Discover, Profile and search will lose it permanently.`)) return;
    void deleteBlog(p.id).then(() => {
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      notify('Story deleted everywhere.');
      try {
        window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
        window.dispatchEvent(new CustomEvent('ws_moments_changed'));
      } catch { /* ignore */ }
    }).catch(() => notify('Could not delete. Check internet and retry.'));
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.excerpt || '').toLowerCase().includes(q) ||
          p.authorName.toLowerCase().includes(q)
      )
    : posts;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-extrabold text-slate-900">Community</h3>
        <button
          onClick={onWrite}
          className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <PenLine size={14} /> Write
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        <TagPill active={tag === ''} label="All Feeds" onClick={() => setTag('')} />
        {BLOG_TAGS.map((t) => (
          <TagPill key={t.id} active={tag === t.id} label={t.label} onClick={() => setTag(t.id)} />
        ))}
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stories, places, authors…"
          className="w-full h-10 pl-9 pr-9 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-100 placeholder-slate-400"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400 text-center py-8">Loading community…</p>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-slate-200/70 rounded-3xl p-6 text-center">
          <p className="text-xs font-extrabold text-slate-700">No places match this filter</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1 mb-3">Try another search, or be the first to share.</p>
          <button
            onClick={onWrite}
            className="px-5 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
          >
            Write the first story
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const mine = !!myUid && !!p.authorUid && p.authorUid === myUid;
            return (
            <div
              key={p.id}
              className="bg-white rounded-3xl overflow-hidden border border-slate-200/70 shadow-sm hover:shadow-md transition-all"
            >
              <button
                onClick={() => onOpenBlog(p.id)}
                className="w-full text-left active:scale-[0.99] transition-transform cursor-pointer"
              >
                {p.coverUrl ? (
                  <MediaImg srcRef={p.coverUrl} alt={p.title} className="w-full max-h-44 object-cover bg-slate-100" />
                ) : null}
                <span className="flex items-center gap-2 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-slate-900 leading-snug">{p.title}</span>
                    <span className="block text-[13px] text-slate-500 leading-relaxed mt-1 line-clamp-3">{p.excerpt}</span>
                    <span className="block text-[11px] text-slate-400 font-bold mt-1.5">
                      {p.authorName} · {p.views} reads
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                </span>
              </button>
              {mine && (
                <div className="flex items-center gap-1 px-3 pb-2.5">
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-2 py-1">Your story</span>
                  <span className="flex-1" />
                  <button
                    onClick={() => onEditBlog?.(p.id)}
                    aria-label="Edit your story"
                    title="Edit"
                    className="flex items-center gap-1 h-8 px-3 rounded-xl text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={() => removeMine(p)}
                    aria-label="Delete your story everywhere"
                    title="Delete everywhere"
                    className="flex items-center gap-1 h-8 px-3 rounded-xl text-[11px] font-bold text-rose-500 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

function TagPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 h-8 px-3.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
        active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'bg-white border border-slate-200 text-slate-500'
      }`}
    >
      {label}
    </button>
  );
}

export default BlogStories;
