# TODO — Midnight Anime Social

## Implemented in the repository

- [x] Preserve the original Midnight Anime logo, dark/orange visual system, supplied social interface references, and supplied gold/blue verification artwork.
- [x] Provide Firebase Google/email-password sign-in, signup, email verification, password reset, editable profile details and atomic lowercase unique-handle claim/repair.
- [x] Provide the Firebase-backed feed, Explore, 24-hour Stories, notifications, private DMs, profiles, follows, likes, comments and saved media.
- [x] Provide authenticated private uploads for posts, Stories, Reels and profile photos through both AWS S3 and Cloudflare R2; use measured successful upload latency to prefer the faster backend, and fall back to the other if signing or upload fails.
- [x] Keep mobile video autoplay muted by browser policy, provide a visible sound toggle that explicitly unmutes the actual video element, preserve uploaded original media bytes/audio, and support double-tap like gestures on social Reels.
- [x] Add searchable people/handles in Explore and a visible modal comments sheet on anime episodes.
- [x] Prepare owner-scoped Realtime Database rules that allow an authenticated owner to create their own public post, Story or Reel, while protecting profile ownership, handle uniqueness, social interactions, direct-message membership and official-badge eligibility.
- [x] Replace anime discovery with TMDB search and TMDB poster/backdrop art through a server-side route. The `TMDB_API_KEY` is configured encrypted/server-only on the production social Vercel project.
- [x] Resolve selected TMDB/IMDb episode identifiers through the same Nuvio provider integration as the original Midnight Anime project; send the streaming site's Origin/Referer, use a custom portrait 9:16 HLS/MP4 player, hide Season/Episode/Audio dropdowns, swipe between episodes with an animation, cycle Sub/Dub/Hindi from the action rail, double-tap to like, and retain a host-restricted media proxy.
- [x] Add actionable Firebase `PERMISSION_DENIED` guidance in post, Story, Reel, profile and signup flows.
- [x] Deploy the private-media Worker and configure `VITE_R2_WORKER_URL` on the social Vercel project. An unauthenticated Worker request correctly returns `Sign in required`.

## Live configuration and verification still required

- [x] Parse and behavior-test the Realtime Database rules in the Firebase emulator: owner publishing, duplicate handles, other-user likes/comments, official badge eligibility, and new/legacy two-person DMs.
- [ ] Review and apply the current [`database.rules.json`](./database.rules.json) to the correct `mid-night-anime` Realtime Database. The new rules are in the repo but Firebase Console rules are not automatically changed by a Git push.
- [x] Existing two-member direct-message records remain supported without migration; new conversations use the explicit `a`/`b` member format.
- [ ] Confirm Email/Password and Google providers are enabled and `social.midnightanime.bond` is authorized in Firebase Authentication.
- [ ] Confirm the linked AWS S3 bucket CORS policy permits `POST`, `GET` and `HEAD`, the Cloudflare R2 bucket permits `PUT`, `GET` and `HEAD`, and both private storage providers accept the production origin; test local origins only if needed.
- [ ] After deployment, sign in and verify the Vercel AWS OIDC exchange with the corrected `https://sts.amazonaws.com` audience. If AWS still rejects the web identity token, review the IAM OIDC provider and role trust policy audience/subject claims in AWS.
- [ ] Verify a fresh upload selects the faster successful AWS S3 or Cloudflare R2 backend, falls back on failure, and plays with audible sound after tapping the sound button.
- [ ] After the latest Vercel deploy, sign in with a test account and verify AWS S3 photo/video Post, Story and Reel publication/playback; duplicate-handle rejection; profile photo/handle updates; reactions/saves/comments; a new DM; and an actual TMDB/Nuvio provider stream.
- [ ] Authenticate as `mallaprabesh141@gmail.com` with a verified email and confirm the gold badge. Confirm the blue badge at 1,000 follower entries.
- [ ] Perform an authenticated image/video upload and read from private AWS S3 end to end; confirm legacy R2 media still opens. A successful unauthenticated guard alone does not verify the complete AWS flow.

## Later production hardening

- [ ] Add abuse reporting/moderation, server-side rate limits and quotas, account deletion, and monitoring before broad public sign-ups.
- [ ] Add multipart S3 upload if files larger than the current single-object 5 GB limit are required.
