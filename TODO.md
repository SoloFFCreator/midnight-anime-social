# TODO — Midnight Anime Social

## Implemented in the repository

- [x] Preserve the original Midnight Anime logo, dark/orange visual system, supplied social interface references, and supplied gold/blue verification artwork; show the supplied artist badge only for the verified `ffsolo844@gmail.com` account.
- [x] Provide Firebase Google/email-password sign-in, signup, email verification, password reset, editable profile details and atomic lowercase unique-handle claim/repair.
- [x] Provide the Firebase-backed feed, Explore, 24-hour Stories, notifications, private DMs, profiles, follows, likes, comments and saved media; keep post badges inline and fit uploaded videos to their full native frame/aspect ratio instead of cropping YouTube-style landscape clips.
- [x] Provide authenticated private uploads for posts, Stories, Reels and profile photos through both AWS S3 and Cloudflare R2; use measured successful upload latency to prefer the faster backend, and fall back to the other if signing or upload fails.
- [x] Fit the mobile Reel video and action rail within the usable viewport without a clipped fixed-height inner feed; show selected file size plus byte/rate/estimated-time upload progress, and avoid repeatedly retrying a recently failed storage backend.
- [x] Keep mobile video autoplay muted by browser policy, provide a visible sound toggle that explicitly unmutes the actual video element, preserve uploaded original media bytes/audio, and support double-tap like gestures on social Reels.
- [x] Add searchable people/handles in Explore and a visible modal comments sheet on anime episodes.
- [x] Prepare owner-scoped Realtime Database rules that allow an authenticated owner to create their own public post, Story or Reel, while protecting profile ownership, handle uniqueness, social interactions, direct-message membership, and verified-email-only official gold and artist badges.
- [x] Replace anime discovery with TMDB search and TMDB poster/backdrop art through a server-side route. The `TMDB_API_KEY` is configured encrypted/server-only on the production social Vercel project.
- [x] Resolve selected TMDB/IMDb episode identifiers through the same Nuvio provider integration as the original Midnight Anime project; send the streaming site's Origin/Referer, use a custom portrait 9:16 HLS/MP4 player, hide Season/Episode/Audio dropdowns, swipe between episodes with an animation, cycle Sub/Dub/Hindi from the action rail, double-tap to like, and retain a host-restricted media proxy.
- [x] Add actionable Firebase `PERMISSION_DENIED` guidance in post, Story, Reel, profile and signup flows.
- [x] Deploy the private-media Worker and configure `VITE_R2_WORKER_URL` on the social Vercel project. An unauthenticated Worker request correctly returns `Sign in required`.

## Live configuration and verification still required

- [x] Parse and behavior-test the Realtime Database rules in the Firebase emulator: owner publishing, duplicate handles, other-user likes/comments, official badge eligibility, and new/legacy two-person DMs.
- [ ] Review and apply the current [`database.rules.json`](./database.rules.json) to the correct `mid-night-anime` Realtime Database. The new rules are in the repo but Firebase Console rules are not automatically changed by a Git push.
- [ ] Publish the scoped `shareLinks` rules in `database.rules.json`; until then the app intentionally falls back to the longer legacy share-preview URL instead of failing to share. Publicly readable records contain only the share target and card metadata, never the private video URL.
- [x] Existing two-member direct-message records remain supported without migration; new conversations use the explicit `a`/`b` member format.
- [ ] Confirm Email/Password and Google providers are enabled and `midnightsocial.bond` is authorized in Firebase Authentication.
- [ ] Confirm the linked AWS S3 bucket CORS policy permits `POST`, `GET` and `HEAD`, the Cloudflare R2 bucket permits `PUT`, `GET` and `HEAD`, and both private storage providers accept the production origin; test local origins only if needed.
- [x] Deploy and verify the Worker CORS update so `https://midnightsocial.bond` is allowed while retaining `https://social.midnightanime.bond`; live OPTIONS preflights return the matching `Access-Control-Allow-Origin` for both.
- [ ] After deployment, sign in and verify the Vercel AWS OIDC exchange with the corrected `https://sts.amazonaws.com` audience. If AWS still rejects the web identity token, review the IAM OIDC provider and role trust policy audience/subject claims in AWS.
- [ ] Verify a fresh upload selects the faster successful AWS S3 or Cloudflare R2 backend, falls back on failure, and plays with audible sound after tapping the sound button.
- [ ] After the latest Vercel deploy, sign in with a test account and verify AWS S3 photo/video Post, Story and Reel publication/playback; duplicate-handle rejection; profile photo/handle updates; reactions/saves/comments; a new DM; and an actual TMDB/Nuvio provider stream.
- [ ] Authenticate as `mallaprabesh141@gmail.com` with a verified email and confirm the gold badge. Confirm the blue badge at 1,000 follower entries.
- [ ] Perform an authenticated image/video upload and read from private AWS S3 end to end; confirm legacy R2 media still opens. A successful unauthenticated guard alone does not verify the complete AWS flow.

## Later production hardening

- [ ] Add abuse reporting/moderation, server-side rate limits and quotas, account deletion, and monitoring before broad public sign-ups.
- [ ] Add multipart S3 upload if files larger than the current single-object 5 GB limit are required.

## UX polish delivered
- [x] Add an animated, reduced-motion-aware Midnight Anime splash using the original logo while authentication or lazy-loaded UI is resolving.
- [x] Fade and disable custom video controls and sound actions after playback inactivity; reveal them on interaction and keep them visible while paused.
- [x] Redesign Inbox with a real-profile horizontal people strip, existing-chat prioritization, deduplicated profiles, and responsive conversation/chat layouts.

## Reel sharing, comments, and public URLs
- [x] Make Reel sharing call the native share sheet immediately with canonical `https://midnightsocial.bond/reels/{reelId}` URLs; do not perform Firebase or media work before the tap action, and never include private video URLs in share metadata.
- [x] Add a single shared Instagram-inspired comments sheet to social and Anime Reels with readable rows, a composer, backdrop dismissal, Escape dismissal, and a clear close button.
- [x] Apply shared Reel action-rail styling and remove blur/filter from comment and tap overlays while preserving playback and episode controls.
- [x] Add `/reels/:reelId` and `/profile/@username` client routes and canonical links; keep legacy profile and Reel routes supported.
- [x] Add bot-only HTML previews, public-only safe metadata mirrors, sitemap, robots.txt and llms.txt; private media URLs are excluded.
- [x] Resolve `/profile/@username` to a profile instead of the home route and add a Back-to-Home button on Reels.
- [ ] Apply the scoped `publicContent` Firebase rules to the live database and verify crawler access after deployment; live Firebase anonymous reads were previously denied.


## Music-distribution receiving system (implementation in progress)

- [ ] **Partner delivery interfaces:** Allow external music distributors and record labels to deliver music releases to Midnight Social; support multiple distribution partners, secure API and SFTP delivery interfaces, DDEX ERN music delivery standards, distributor authentication and partner credentials. The only named partners are exactly **MONTYXLABEL.cyou** and **smusicdistrition.com**. Do not report either as connected until authentic endpoint details, credentials, approvals and a real end-to-end transfer are verified; never fabricate partner integrations or delivery confirmations.
- [ ] **Release ingestion:** Receive audio masters and cover artwork for album, EP and single releases; parse incoming music metadata including ISRC and UPC/EAN identifiers, release dates and scheduled releases, primary artists, featured artists and contributors, copyright, label, genre and language. Support audio master files up to 10 GB using resumable/multipart transfer; keep original masters and artwork in private storage.
- [ ] **Artist metadata and identity matching:** Automatically suggest matches between incoming artist metadata and existing Midnight Social artist accounts; maintain one canonical artist identity and external artist profile identifiers; detect duplicate artist profiles; support verified profile claiming and merging; detect duplicate releases and tracks. Do not silently merge ambiguous identities or identifiers.
- [ ] **Music catalogue management:** Add accepted releases to the Midnight Social music catalogue, connect tracks to correct artists/albums, support music search, streaming, playlists and discovery, and respect scheduled release dates and territory restrictions.
- [ ] **Distribution management:** Provide truthful delivery acknowledgements, processing state/history, delivery and publishing status, metadata corrections, replacement audio/artwork, takedown requests, and an auditable distribution history. Distinguish receipt, validation, review, approval, publication and takedown; do not simulate a downstream partner acknowledgement.
- [ ] **Admin dashboard:** Provide administrators with partner management, incoming release approval/rejection, metadata review, artist identity conflict resolution, delivery failure monitoring, catalogue management and takedown review. Admin authorization must be enforced server-side and cannot derive from existing profile badges.
- [ ] **Backward compatibility/security:** Keep all existing Midnight Anime functionality and existing security rules unchanged. Use secure ingestion and asset validation, private scalable audio/artwork storage, server-only partner credentials, and a DDEX-compatible architecture. Leave partner-specific credentials and commercial approvals configurable; do not present unconfigured infrastructure as live.
- [ ] **Activation boundary:** Vercel serverless functions do not receive inbound SFTP; a separate persistent SFTP endpoint/host and partner SSH keys are needed. Firebase Admin service credentials, AWS S3 distribution-prefix permissions, licensed/current ERN 4.3.x schema validation, partner protocol details, and admin UID allowlist also remain unconfigured until supplied/approved. Research noted the `montyxlabel.cyou` apex presently displays domain parking and no public API/SFTP contract was verified; `smusicdistrition.com` did not return readable integration documentation. Preserve the exact partner names and leave both pending rather than inferring an endpoint.
