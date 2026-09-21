# Timeline Social — locked plan (discussed, building one by one)

> Source: YouTube bottom-bar + Create-post + Instagram profile/post references.
> Rule: max 5 bottom tabs; merge smartly (avatar = profile + posts).

## Locked decisions

1. **Main Timeline is PUBLIC** — every registered user sees it. Author name tap →
   public profile page → chat request button from there.
2. **Composer placement = context decides, NO destination picker.** Landing
   Timeline me post → main timeline me rehta hai. Trip ke andar Timeline me
   post → us trip me. (Picker confusing tha — "kisi ka kisi pe post" risk.)
3. **+ lives INSIDE Timeline** (header button), not a separate tab. YouTube
   shows feed directly — same here.
4. **Avatar = My posts.** Profile me posts grid (Instagram Image 1 jaisa —
   trip + main sab ek saath). Tap → full post (trip wala → trip khulta hai,
   main wala → detail view).
5. **Post detail (Instagram Image 2 jaisa):** photo left, right side caption +
   comments + likes. Mobile par stacked. Text-only posts detail me full text.
6. **Grid + normal view toggle** (own timeline + main timeline dono me):
   grid = uniform squares (text-only = styled gradient text card, grid me fit);
   normal = natural sizes (text card apne content ke hisab se).
7. **Aggregation:** Timeline pills — All · Main · per-trip pills + trip
   dropdown (kisi ek trip ke saare photos ek saath).
8. **5-tab rule stays:** Discover · My Trips · Timeline · Expenses · Chat.
   Chat untouched.

## Build order

- [x] 1. Backend: trip-less moments, `GET /api/feed/main`, comments table +
   `GET/POST /api/comments`, like via upsert (all live-tested local).
- [x] 2. Main composer (Timeline header +): photo or text-only, `tripId`
   empty, appears instantly.
- [x] 3. Main Timeline feed (normal + grid toggle, pills: All/Main/trips +
   trip dropdown, text-only styled cards).
- [x] 4. Post detail modal (image + caption + likes + comments + author →
   public profile link).
- [x] 5. Public profile page (posts grid + request button) + ProfilePage
   "My posts" grid (own posts, both timelines).
- [x] 6. Trip-side: trip Timeline composer unchanged (posts to trip);
   trip posts appear in trip feed + own profile grid (NOT main feed).
- [x] 7. Verified local (tsc + build + API tests). Live push below.
- [x] 8. Relational likes (photo_likes table, toggle everywhere), full CRUD,
  grids, search, icons sync — see commit.
- [x] 9. Blogs P1: tables + endpoints + reader page + composer (autosave) +
  Stories section + login cards + 3 admin seeds + review queue + profile.
- [ ] 10. P2: SEO (`/blog/:slug` server HTML + sitemap submit).
- [ ] 11. P3: profile tabs (likes/comments/saved), reply threads, affiliate.

## Non-goals (later)

- Public moderation/report, private main posts, video posts, stories.
