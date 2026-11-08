# Midnight Anime Social

A mobile-first anime community app paired with the Midnight Anime streaming product. It retains the reviewed near-black and ember-orange design system, original Midnight Anime logo, warm typography and the Instagram-inspired interaction patterns from the supplied screenshots.

## Product features

The app supports Google and email/password authentication, registration, email verification, password reset, editable profiles and unique `@handles`; a Firebase-backed feed, Explore, Stories, notifications, private messages and saved items; and short-form social Reels with likes, comments, share links and private R2 uploads. Gold verification is reserved for the verified `mallaprabesh141@gmail.com` account; the blue community badge is derived from at least 1,000 follower entries and is not editable by the user.

Anime discovery is powered by TMDB search, posters and backdrops. From a title, open an episode directly in a portrait 9:16 Reels-style player. Episode playback calls the same Nuvio stream-provider integration used by the original Midnight Anime codebase ([SoloFFCreator/midnight-anime](https://github.com/SoloFFCreator/midnight-anime)). The player handles provider HLS/MP4 sources with custom controls and does not use native browser video controls or an iframe to the streaming homepage. TMDB data/artwork attribution appears in the directory. Availability depends on the selected provider returning a compatible source.

## Architecture

```text
src/
  App.jsx, pages.jsx           App shell, feed, Stories, Explore, inbox and profiles
  AuthScreen.jsx               Email/password, Google, registration and reset states
  ProfileEditor.jsx            Profile fields and unique-handle transactions
  InstagramVideo.jsx           Custom controls for social post/story video
  reels.jsx                    Social Reel feed, actions and private video upload
  AnimePage.jsx                TMDB anime discovery, posters and backdrops
  AnimeReelPlayer.jsx          Portrait episode experience using provider streams
  StreamPlayer.jsx             Custom HLS/MP4 playback via hls.js
  api/tmdb.js, api/nuvio.js     Browser clients for same-origin service routes
api/
  anime-catalog.js             Server-side TMDB catalog/details proxy
  hindi-stream.js              Nuvio provider stream resolver
  megavid-proxy.js             Host-restricted HLS playlist/media proxy
worker/
  src/index.js                 Firebase token verification and private R2 URL signing
  wrangler.toml                Worker name, R2 binding and allowed origins
database.rules.json            Reviewable Realtime Database authorization rules
public/badges/                 Gold and blue badge artwork from the supplied ZIP
```

Firebase Realtime Database stores profile metadata and social records. Large images and videos upload from the browser to the private `midnight-anime-social` R2 bucket through short-lived presigned URLs. The Worker verifies Firebase ID tokens, signs object-scoped upload/read URLs, and checks ownership/publication references before serving private media. The S3 credential is held only as an encrypted Worker secret; no S3 key is sent to the browser.

The private Worker is deployed at `https://midnight-anime-social-media.soloffofficial-83a.workers.dev`. `VITE_R2_WORKER_URL` is configured for the Vercel project `midnight-anime-social-7u58`, which owns `https://social.midnightanime.bond`, for production, preview and development. An unauthenticated Worker check correctly returns `Sign in required`. The bucket remains private; do not enable public `r2.dev` access.

## Run locally

```bash
npm install
cp .env.example .env.local
npx vercel dev
```

Vercel CLI's local server runs the app plus `/api/anime-catalog`, `/api/hindi-stream` and `/api/megavid-proxy`. Firebase web identifiers in `.env.example` are public client configuration, not admin credentials. Replace the TMDB placeholder with a real server-side `TMDB_API_KEY` in `.env.local`; do not put TMDB, Firebase Admin, Cloudflare or R2 secrets in `VITE_*` variables or source control. `VITE_R2_WORKER_URL` may point at the deployed Worker; add `http://localhost:5173` to the Worker allowlist for local uploads.

## Firebase setup and the post/Story permission error

`PERMISSION_DENIED` on Create Post, Story or Reel means the deployed Realtime Database rules are rejecting the write. Updating repository code does **not** update the live Firebase project. Review and apply the current [`database.rules.json`](./database.rules.json) to Realtime Database → Rules in Firebase Console for project `mid-night-anime`. The rules explicitly allow a signed-in user to create their own public post, Story or Reel and require the matching `authorId`, object ID, media key/type, handle and timestamp. They also enforce owner-only profile writes and atomic lowercase handle reservations. Make sure the app user is signed in to the same Firebase project and reload after publishing the rules.

New conversations use an explicit two-slot `a`/`b` member record. Existing two-member chats using the legacy `{uid:true}` map remain readable and writable; no chat-data migration is needed. In Firebase Authentication, enable **Email/Password** and **Google** sign-in; add `social.midnightanime.bond` under Authorized domains. The Firebase auth callback remains `mid-night-anime.firebaseapp.com`.

The gold badge is set only when Firebase reports the exact official email as verified. Other accounts receive the blue badge only when the follower index contains at least 1,000 entries. A user-editable verification field is not provided.

## Private Cloudflare R2 media

The dedicated `midnight-anime-social` bucket remains private. Its CORS policy permits browser PUT/GET/HEAD from the social app and local development; CORS governs browser access and is not authorization. The Worker allows `https://social.midnightanime.bond` and `http://localhost:5173`.

To deploy the Worker separately, provision a Cloudflare R2 API token with **Object Read & Write** permission scoped only to this bucket. Keep `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `FIREBASE_API_KEY` and `FIREBASE_DATABASE_URL` as Worker secrets. Deploy with `npx wrangler deploy --config worker/wrangler.toml`, then set `VITE_R2_WORKER_URL` to that Worker origin. The connected Worker and production variable are already configured.

The current single-object upload flow supports large objects within Cloudflare's per-request limit; multipart upload is not implemented.

## TMDB and Nuvio configuration

Set a valid server-side `TMDB_API_KEY` on Vercel (production, preview and development) and in `.env.local` for local development. The browser calls `/api/anime-catalog`, which validates catalog operations and never returns the key. TMDB supplies search metadata, posters and backdrops.

Episode requests go to `/api/hindi-stream` and the same Nuvio provider endpoint used in the original Midnight Anime repository. Nuvio may return no source for a title, episode or audio track; in that case try another source/audio option or try again later. HLS sources on the supported Megavid host pass through `/api/megavid-proxy`; this route accepts only that specific HTTPS host rather than acting as a general-purpose proxy. Anime source content is not stored in social R2.

## Validation

```bash
npm run build
npx wrangler deploy --dry-run --config worker/wrangler.toml
python3 -m json.tool database.rules.json >/dev/null
python3 -m json.tool public/manus-routes.json >/dev/null
npm audit --omit=dev --audit-level=high
git diff --check
```

After applying rules and enabling providers, test with real signed-in accounts: publish a photo/video post and Story, create and play a Reel, edit a handle, follow/unfollow, comment/save, open a DM and test provider playback. Add abuse reporting, moderation, server-side quotas/rate limits, account deletion and operational alerts before opening public sign-ups broadly.
