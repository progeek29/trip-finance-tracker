import React, { useEffect, useState } from 'react';
import { X, Heart, MessageCircle, Share2, Send } from 'lucide-react';
import { MediaImg } from '../common/MediaImg';
import { DandelionLike } from '../trip/DandelionLike';
import {
  fetchBlog,
  toggleBlogLike,
  fetchBlogComments,
  postBlogComment,
  deleteBlogComment,
  type BlogPost,
  type BlogComment,
} from '../../utils/blogs';
import { systemShare } from '../../utils/share';

interface BlogReaderProps {
  blogId: string;
  myUid: string | null;
  myName: string;
  notify: (msg: string) => void;
  onClose: () => void;
  onOpenAuthor: (uid: string, name: string) => void;
  /** Logged-out viewers read only — actions nudge to login. */
  onLoginNeeded?: () => void;
}

/** Full-page minimal blog reader (never a popup): cover, title, meta,
 *  sectioned body, embedded moments, likes, share, comments. */
export const BlogReader: React.FC<BlogReaderProps> = ({
  blogId,
  myUid,
  myName,
  notify,
  onClose,
  onOpenAuthor,
  onLoginNeeded,
}) => {
  const [blog, setBlog] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchBlog(blogId).then((b) => {
      if (!live) return;
      setBlog(b);
      setLiked(!!b?.likedByMe);
      setLoading(false);
    });
    fetchBlogComments(blogId).then((rows) => {
      if (live) setComments(rows);
    });
    return () => {
      live = false;
    };
  }, [blogId]);

  const needLogin = (): boolean => {
    if (!myUid) {
      if (onLoginNeeded) onLoginNeeded();
      else notify('Login to like and comment.');
      return true;
    }
    return false;
  };

  const doToggleLike = () => {
    if (needLogin() || !blog || likeBusy) return;
    const toLiked = !liked;
    setLiked(toLiked);
    setLikeBusy(true);
    void toggleBlogLike(blog.id, toLiked)
      .then((r) => {
        if (!r) {
          setLiked(!toLiked);
          notify('Could not update like. Check internet.');
          return;
        }
        setBlog((b) => (b ? { ...b, likesCount: r.count, likedByMe: r.liked } : b));
        if (r.liked !== toLiked) setLiked(r.liked);
      })
      .finally(() => setLikeBusy(false));
  };

  const sendComment = () => {
    if (needLogin() || !blog) return;
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    void postBlogComment(blog.id, text)
      .then((row) => {
        if (!row) {
          notify('Could not send comment.');
          return;
        }
        setComments((prev) => [...prev, row]);
        setDraft('');
      })
      .finally(() => setSending(false));
  };

  const removeComment = (cid: string) => {
    if (!blog || !window.confirm('Delete this comment?')) return;
    void deleteBlogComment(blog.id, cid).then((ok) => {
      if (!ok) {
        notify('Could not delete comment.');
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== cid));
    });
  };

  const share = () => {
    if (!blog) return;
    try {
      const link = `${window.location.origin}/?blog=${encodeURIComponent(blog.slug || blog.id)}`;
      void systemShare(blog.title, `${blog.title}\n${link}`).then((r) =>
        notify(r === 'shared' ? 'Blog shared.' : 'Link copied.')
      );
    } catch {
      notify('Could not share.');
    }
  };

  // Plain-text body with tappable http(s) links (moment links users paste in).
  const renderBody = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((seg, i) =>
      /^https?:\/\/\S+$/.test(seg) ? (
        <a
          key={i}
          href={seg}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 font-bold underline break-all"
        >
          {seg}
        </a>
      ) : (
        <span key={i}>{seg}</span>
      )
    );
  };

  // Minimal sectioning: blank-line separated blocks → paragraphs.
  const sections = (blog?.body || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Back"
            className="p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="text-sm font-extrabold text-slate-900 truncate">
            {loading ? 'Loading…' : blog?.title || 'Story'}
          </span>
          <button
            onClick={share}
            aria-label="Share"
            className="ml-auto p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer flex-shrink-0"
          >
            <Share2 size={17} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading || !blog ? (
          <p className="text-[11px] text-slate-400 text-center py-16">Loading story…</p>
        ) : (
          <article className="max-w-2xl mx-auto px-4 pt-5 pb-32">
            {blog.coverUrl ? (
              <MediaImg srcRef={blog.coverUrl} alt={blog.title} className="w-full rounded-3xl object-cover bg-slate-100 max-h-80" />
            ) : null}
            <p className="mt-4 flex items-center gap-2 text-[11px] font-bold">
              <button
                onClick={() => onOpenAuthor(blog.authorUid, blog.authorName)}
                className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {blog.authorName}
              </button>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">
                {blog.updatedAt ? new Date(blog.updatedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">{blog.views} reads</span>
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1.5">{blog.title}</h1>
            <div className="mt-4 space-y-4">
              {sections.length === 0 ? (
                <p className="text-sm text-slate-400 mt-2">(Empty story)</p>
              ) : (
                sections.map((s, i) => (
                  <p key={i} className="text-[15px] text-slate-700 leading-relaxed">{renderBody(s)}</p>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 mt-8 pt-4 border-t border-slate-100">
              <DandelionLike liked={liked} count={Number(blog.likesCount || 0)} onToggle={doToggleLike} />
              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <MessageCircle size={15} /> {comments.length}
              </span>
            </div>

            <h3 className="text-sm font-extrabold text-slate-900 mt-4 mb-2">Comments</h3>
            {comments.length === 0 ? (
              <p className="text-[11px] text-slate-400">No comments yet — be the first.</p>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => {
                  const canDelete = !!myUid && (c.uid === myUid || blog.authorUid === myUid);
                  return (
                    <p key={c.id} className="text-xs text-slate-600 flex items-start gap-1">
                      <span className="flex-1">
                        <strong className="font-extrabold text-slate-900">{c.name}</strong> {c.text}
                      </span>
                      {canDelete && (
                        <button
                          onClick={() => removeComment(c.id)}
                          aria-label="Delete comment"
                          className="p-0.5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </p>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2 mt-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendComment();
                }}
                onFocus={() => {
                  if (!myUid) needLogin();
                }}
                placeholder={myUid ? 'Add a comment…' : 'Login to comment…'}
                maxLength={500}
                className="flex-1 h-10 px-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-400 placeholder-slate-400"
              />
              <button
                onClick={sendComment}
                disabled={sending || !draft.trim()}
                aria-label="Send comment"
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white cursor-pointer"
              >
                <Send size={14} />
              </button>
            </div>
          </article>
        )}
      </div>
    </div>
  );
};

export default BlogReader;
