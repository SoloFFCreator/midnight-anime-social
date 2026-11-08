# TODO — Midnight Anime Social

## Implemented in the repository

- [x] Preserve the original Midnight Anime logo, dark/orange visual system, supplied social interface references, and supplied gold/blue verification artwork.
- [x] Provide Firebase Google/email-password sign-in, signup, email verification, password reset, editable profile details and atomic lowercase unique-handle claim/repair.
- [x] Provide the Firebase-backed feed, Explore, 24-hour Stories, notifications, private DMs, profiles, follows, likes, comments and saved media.
- [x] Provide authenticated private AWS S3 uploads through the Vercel OIDC integration for posts, Stories, Reels and profile photos; keep existing R2 objects readable through the legacy Worker.
- [x] Keep mobile video autoplay muted by browser policy, make “Tap for sound” persistently visible, and preserve the uploaded original media bytes/audio.
- [x] Add searchable people/handles in Explore and a visible modal comments sheet on anime episodes.
- [x] Prepare owner-scoped Realtime Database rules that allow an authenticated owner to create their own public post, Story or Reel, while protecting profile ownership, handle uniqueness, social interactions, direct-message membership and official-badge eligibility.
- [x] Replace anime discovery with TMDB search and TMDB poster/backdrop art through a server-side route. The `TMDB_API_KEY` is configured encrypted/server-only on the production social Vercel project.
- [x] Resolve selected TMDB/IMDb episode identifiers through the same Nuvio provider integration as the original Midnight Anime project; send the streaming site's Origin/Referer, use a custom portrait 9:16 HLS/MP4 player, add swipe/scroll episode navigation, social interactions, and a host-restricted media proxy.
- [x] Add actionable Firebase `PERMISSION_DENIED` guidance in post, Story, Reel, profile and signup flows.
- [x] Deploy the private-media Worker and configure `VITE_R2_WORKER_URL` on the social Vercel project. An unauthenticated Worker request correctly returns `Sign in required`.

## Live configuration and verification still required

- [x] Parse and behavior-test the Realtime Database rules in the Firebase emulator: owner publishing, duplicate handles, other-user likes/comments, official badge eligibility, and new/legacy two-person DMs.
- [ ] Review and apply the current [`database.rules.json`](./database.rules.json) to the correct `mid-night-anime` Realtime Database. The new rules are in the repo but Firebase Console rules are not automatically changed by a Git push.
- [x] Existing two-member direct-message records remain supported without migration; new conversations use the explicit `a`/`b` member format.
- [ ] Confirm Email/Password and Google providers are enabled and `social.midnightanime.bond` is authorized in Firebase Authentication.
- [ ] Confirm the linked AWS S3 bucket CORS policy permits `POST`, `GET` and `HEAD` from `https://social.midnightanime.bond` (and local development) and allows browser headers.
- [ ] After the latest Vercel deploy, sign in with a test account and verify AWS S3 photo/video Post, Story and Reel publication/playback; duplicate-handle rejection; profile photo/handle updates; reactions/saves/comments; a new DM; and an actual TMDB/Nuvio provider stream.
- [ ] Authenticate as `mallaprabesh141@gmail.com` with a verified email and confirm the gold badge. Confirm the blue badge at 1,000 follower entries.
- [ ] Perform an authenticated image/video upload and read from private AWS S3 end to end; confirm legacy R2 media still opens. A successful unauthenticated guard alone does not verify the complete AWS flow.

## Later production hardening

- [ ] Add abuse reporting/moderation, server-side rate limits and quotas, account deletion, and monitoring before broad public sign-ups.
- [ ] Add multipart S3 upload if files larger than the current single-object 5 GB limit are required.
