# TODO — Midnight Anime Social

## Implemented in the repository

- [x] Reuse the original Midnight Anime logo and dark/orange interface; adapt the supplied mobile screenshots for social navigation and interactions.
- [x] Use the supplied gold and blue badge art. Gold is reserved for verified `mallaprabesh141@gmail.com`; blue is derived from a follower count of at least 1,000 and is not user-editable.
- [x] Provide Firebase email/password sign-in, Google sign-in, signup, verification-email dispatch, password reset, and clear provider/domain errors.
- [x] Provide editable profile photo, display name, unique handle, bio, pronouns and website.
- [x] Provide Reels upload/playback, like, comment, share and save; store only R2 object keys in Firebase.
- [x] Provide feed, Explore, 24-hour Stories, notifications, profile pages, saved items and direct messages.
- [x] Add a searchable/trending anime directory using AniList metadata. Episode links use the existing Midnight Anime `/watch/{anilistId}/{episode}` route and provider.
- [x] Deploy the private R2 Worker at `https://midnight-anime-social-media.soloffofficial-83a.workers.dev`; set the live Vercel project's `VITE_R2_WORKER_URL` for all deployment targets. The unauthenticated Worker check correctly returns `Sign in required`.
- [x] Add Firebase Realtime Database rules for owner-scoped profile/content changes, handle claims, eligible badge state, private saves, and explicit two-party chat membership.
- [x] Document architecture, setup, deployment and migration steps in `README.md`.

## Required live setup / verification

- [ ] In Firebase Authentication, confirm both **Email/Password** and **Google** providers are enabled and that `social.midnightanime.bond` is authorized. These provider toggles cannot be confirmed from repository code.
- [ ] Review and apply `database.rules.json` in the correct Firebase project. Existing chats need the two participant UIDs backfilled into `/chats/{chatId}/participants` before applying the stricter chat rule if those conversations must be preserved.
- [ ] From the deployed app, sign in with a test account and complete an authenticated image/video upload, profile photo update, Reel playback, follow/unfollow, comment/save, and new DM test. The Worker no-token check is verified; a full signed-in browser upload has not been performed.
- [ ] Sign in as `mallaprabesh141@gmail.com` with a verified Firebase email and confirm the gold badge appears on that profile.

## Later production hardening

- [ ] Add abuse reporting/moderation, server-side rate limits and quotas, account deletion, and monitoring before broad public sign-ups.
- [ ] Add multipart R2 uploads if video files beyond the current single-PUT limit are required.
