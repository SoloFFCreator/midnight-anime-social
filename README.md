# Midnight Anime Social

A mobile-first anime community app paired with the Midnight Anime streaming product. It retains the reviewed near-black and ember-orange design system, original Midnight Anime logo, warm typography and the Instagram-inspired interaction patterns from the supplied screenshots.

## Product features

The app supports Google and email/password authentication, registration, email verification, password reset, editable profiles and unique `@handles`; a Firebase-backed feed, Explore, Stories, notifications, private messages and saved items; and short-form social Reels with likes, comments, share links and private AWS S3/Cloudflare R2 uploads. Gold verification is reserved for the verified `mallaprabesh141@gmail.com` account; the blue community badge is derived from at least 1,000 follower entries and is not editable by the user.

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
  media.js                     Shared authenticated AWS S3/R2 adaptive upload helper
  api/tmdb.js, api/nuvio.js     Browser clients for same-origin service routes
api/
  anime-catalog.js             Server-side TMDB catalog/details proxy
  aws-media.js                 Firebase-authenticated AWS S3 URL signer using Vercel OIDC
  hindi-stream.js              Nuvio provider stream resolver
  megavid-proxy.js             Host-restricted HLS playlist/media proxy
worker/
  src/index.js                 Firebase token verification and private R2 URL signing
  wrangler.toml                Worker name, R2 binding and allowed origins
database.rules.json            Reviewable Realtime Database authorization rules
public/badges/                 Gold and blue badge artwork from the supplied ZIP
```

Firebase Realtime Database stores profile metadata and social records. New social uploads (posts, Stories, Reels and profile photos) use whichever private backend has recently uploaded fastest: AWS S3 through Vercel OIDC or the existing Cloudflare R2 Worker. The client remembers only successful upload latency as a preference, tries the preferred backend first and falls back to the other on failure. S3 keys use `aws/<uid>/…`; R2 keys use `<uid>/…`. Both providers remain private and existing R2 media stays readable.

The Vercel project `midnight-anime-social-7u58`, which owns `https://social.midnightanime.bond`, has AWS integration variables for `AWS_ROLE_ARN`, `AWS_REGION` and `S3_BUCKET_NAME`. The route uses the official Vercel AWS OIDC credential provider with the AWS STS audience `https://sts.amazonaws.com` (the scheme is required). To upload directly from a browser, the S3 bucket CORS policy must allow `POST`, `GET` and `HEAD` from `https://social.midnightanime.bond` and local development. Keep the bucket private; do not grant public object access. The signing API only generates authenticated short-lived object URLs and checks Firebase publication references for non-owner reads. If AWS still reports `The web identity token provided could not be validated`, verify the deployed function uses `https://sts.amazonaws.com` as its token audience and that the AWS IAM OIDC provider and role trust policy allow the Vercel role subject for this project/environment.

`VITE_R2_WORKER_URL` and the dedicated private `midnight-anime-social` R2 bucket are configured for upload fallback and reads. The Worker remains at `https://midnight-anime-social-media.soloffofficial-83a.workers.dev` and uses Firebase-token checks. Its configured `ALLOWED_ORIGINS` must include the production site (and local origin when needed). S3 and R2 uploads use their separate authenticated signing endpoints and keys are routed to the corresponding store when read.
## Run locally

```bash
npm install
cp .env.example .env.local
npx vercel dev
```

Vercel CLI's local server runs the app plus `/api/anime-catalog`, `/api/aws-media`, `/api/hindi-stream` and `/api/megavid-proxy`. Local AWS uploads require the Vercel AWS OIDC environment; if that exchange is unavailable, uploads can fall back to the configured R2 Worker. Firebase web identifiers in `.env.example` are public client configuration, not admin credentials. Replace the TMDB placeholder with a real server-side `TMDB_API_KEY` in `.env.local`; do not put TMDB, Firebase Admin, Cloudflare or R2 secrets in `VITE_*` variables or source control. `VITE_R2_WORKER_URL` must point to the deployed Worker for R2 uploads/reads and its origin allowlist must include any local dev origin.

## Firebase setup and the post/Story permission error

`PERMISSION_DENIED` on Create Post, Story or Reel means the deployed Realtime Database rules are rejecting the write. Updating repository code does **not** update the live Firebase project. Review and apply the current [`database.rules.json`](./database.rules.json) to Realtime Database → Rules in Firebase Console for project `mid-night-anime`. The rules explicitly allow a signed-in user to create their own public post, Story or Reel and require the matching `authorId`, object ID, media key/type, handle and timestamp. They also enforce owner-only profile writes and atomic lowercase handle reservations. Make sure the app user is signed in to the same Firebase project and reload after publishing the rules.

New conversations use an explicit two-slot `a`/`b` member record. Existing two-member chats using the legacy `{uid:true}` map remain readable and writable; no chat-data migration is needed. In Firebase Authentication, enable **Email/Password** and **Google** sign-in; add `social.midnightanime.bond` under Authorized domains. The Firebase auth callback remains `mid-night-anime.firebaseapp.com`.

The gold badge is set only when Firebase reports the exact official email as verified. Other accounts receive the blue badge only when the follower index contains at least 1,000 entries. A user-editable verification field is not provided.

## Storage migration and private media

New uploads use the Vercel-linked private AWS S3 bucket. Configure its CORS policy to permit browser `POST`, `GET` and `HEAD` from `https://social.midnightanime.bond` and `http://localhost:5173`; `AllowedHeaders: ["*"]` permits browser media requests. CORS governs browser access and is not authorization; the bucket must remain private. The Vercel AWS integration supplies the OIDC role, region and bucket name; do not add static AWS access keys. In the bucket's **Permissions → Cross-origin resource sharing (CORS)** setting, use:

```json
[
  {
    "AllowedOrigins": ["https://social.midnightanime.bond", "http://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD", "POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
    "MaxAgeSeconds": 3000
  }
]
```

In Cloudflare, keep the R2 bucket private and add a bucket CORS policy that allows the site and local origin to use `PUT`, `GET` and `HEAD`, with `AllowedHeaders: ["*"]`. The worker's own `ALLOWED_ORIGINS` must include the site origin for its authenticated signing endpoint.

Cloudflare R2 remains available for older media and as the adaptive upload fallback. Its Worker still verifies Firebase ID tokens and signs private object reads/uploads. The Worker and `VITE_R2_WORKER_URL` are already configured; new media keys identify which private store to use on reads.

AWS uploads use policy-signed S3 POST with a server-enforced size range, support single objects up to 5 GB, and preserve the uploaded bytes (including audio). Multipart upload is not implemented. R2 is attempted if the last-faster provider is unavailable, and vice versa; configure both private stores and their own CORS/origin rules before relying on fallback.

## TMDB and Nuvio configuration

Set a valid server-side `TMDB_API_KEY` on Vercel (production, preview and development) and in `.env.local` for local development. The browser calls `/api/anime-catalog`, which validates catalog operations and never returns the key. TMDB supplies search metadata, posters and backdrops.

Episode requests go to `/api/hindi-stream` and the same Nuvio provider endpoint used in the original Midnight Anime repository. The resolver sends the streaming site's `Origin` and `Referer`; the Megavid HLS proxy sends Megavid's own `Origin`, `Referer` and browser-like user agent, then rewrites playlist resources through the same host-restricted proxy. Nuvio may return no source for a title, episode or audio track; in that case try another source/audio option or try again later. Anime source content is not stored in either social-media bucket.

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
