# Midnight Anime Social

A mobile-first anime community app paired with the Midnight Anime streaming product. Its visual system keeps the midnight-black surfaces, ember-orange accent, original Midnight Anime logo, and warm typography; its mobile interactions take inspiration from the supplied Instagram screenshots without copying Instagram branding.

## Product features

- Firebase authentication with Google and email/password sign-in, account creation, email verification, and password-reset emails.
- Editable profile photo, display name, unique `@handle`, bio, pronouns, and website.
- Community feed, Explore, 24-hour Stories, notifications, private direct messages, profile pages, and saved media.
- Short-form Reels with private R2 video upload/playback, likes, comments, sharing, and saved state.
- Gold official-account badge for the verified `mallaprabesh141@gmail.com` account; blue fan badge once the account has 1,000 followers. Badge images come from the supplied ZIP and are not user-editable.
- An anime directory backed by AniList search/discovery. Selecting an episode opens the existing Midnight Anime player at `https://www.midnightanime.bond/watch/{anilistId}/{episode}` in a new tab. This deliberately reuses the established streaming provider/player instead of proxying or re-uploading third-party anime through social R2.

## Architecture

```text
src/
  App.jsx, pages.jsx       App shell, feed, Stories, Explore, inbox, profiles
  AuthScreen.jsx           Email/password, Google, registration and reset states
  ProfileEditor.jsx        Profile fields and private avatar upload
  reels.jsx                Reel feed, actions and private video upload
  AnimePage.jsx            AniList discovery and canonical streaming links
  session.jsx              Firebase Auth session and profile bootstrap
  firebase.js              Public Firebase web-app configuration
  ui.jsx                   Original logo, private media and verification badges
  styles.css               Midnight Anime design system and responsive UI
worker/
  src/index.js             Firebase token verification and R2 URL signing
  wrangler.toml            Worker name, private bucket and allowed origins
database.rules.json        Reviewable Firebase Realtime Database rules
public/badges/             Supplied gold and blue badge artwork
```

Firebase Realtime Database stores profile metadata and social records. Large images/videos are uploaded directly from the browser to the private `midnight-anime-social` R2 bucket through short-lived presigned URLs. The Worker verifies Firebase ID tokens and signs 15-minute, object-specific upload/read URLs. The S3 credential is held as an encrypted Worker secret; no S3 key is sent to the browser. The Worker checks that requested media belongs to an authenticated user's own profile or a published social item.

The Worker endpoint is deployed at `https://midnight-anime-social-media.soloffofficial-83a.workers.dev`. `VITE_R2_WORKER_URL` is configured on the Vercel project `midnight-anime-social-7u58`, which owns `https://social.midnightanime.bond`, for production, preview, and development. An unauthenticated endpoint check returns `Sign in required`, as expected. Complete an authenticated upload test from the live app after the production frontend rebuild. The bucket stays private; do not enable `r2.dev` public access.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Firebase web configuration is the public configuration for the dedicated social web app in the `mid-night-anime` Firebase project. These web identifiers are not admin credentials. Do not put Firebase Admin keys, Cloudflare API tokens, or R2 S3 secrets in `VITE_*` variables or source control.

For local media uploads, set `VITE_R2_WORKER_URL` to the deployed Worker URL and add `http://localhost:5173` to the Worker allowlist (already included in `worker/wrangler.toml`).

## Firebase setup and rules

1. In Firebase Console for project `mid-night-anime`, enable **Email/Password** and **Google** under Authentication → Sign-in method. Google sign-in also needs the production hostname `social.midnightanime.bond` in Authentication → Settings → Authorized domains. `authDomain` remains `mid-night-anime.firebaseapp.com`.
2. Review `database.rules.json` and apply it in Realtime Database → Rules. It is a repository policy file and does not update the live Firebase project automatically. The rules derive official status from the verified email, limit handle/profile writes to the owner, and restrict chat reads/messages to explicit participants.
3. The updated direct-message rules use `/chats/{chatId}/participants`. New conversations create that map on first send. Existing conversations created before this schema have no participant map; backfill the two member UIDs before applying the rules if preserving those chats is important.
4. Run an end-to-end sign-in, profile edit, follow/unfollow, Reel upload, comment/save, and direct-message check with actual test accounts after applying provider settings and database rules.

The official account receives a gold badge only when Firebase reports the email as verified. Ordinary community accounts receive the blue badge when the Firebase followers index contains at least 1,000 follower entries. The client does not offer an editable badge field; the database rule also prevents other users from claiming the gold badge.

## Cloudflare R2 and Worker

The dedicated `midnight-anime-social` bucket is configured for the app and remains private. Its CORS policy permits browser PUT/GET/HEAD requests from the social app and local development; CORS only governs browser access and is not authorization. The Worker allowlist is `https://social.midnightanime.bond,http://localhost:5173`.

For a separate deployment, provision a Cloudflare R2 API token with **Object Read & Write** permission scoped only to this bucket. Set Worker secrets (never commit their values):

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `FIREBASE_API_KEY`
- `FIREBASE_DATABASE_URL`

Then deploy with `npx wrangler deploy --config worker/wrangler.toml` and set the frontend's `VITE_R2_WORKER_URL` to the resulting Worker origin. The deployed social Worker and Vercel variable above are already configured in the connected accounts.

R2 single-object PUT supports large files up to the Worker limit; multipart S3 uploads are not implemented. Keep UI limits within the supported single-PUT/R2 object maximum.

## Build and checks

```bash
npm run build
npx wrangler deploy --dry-run --config worker/wrangler.toml
python3 -m json.tool database.rules.json >/dev/null
npm audit --omit=dev --audit-level=high
```

Before opening sign-ups broadly, add server-side moderation, abuse reporting, rate limiting/quota controls, account deletion, and operational alerting. Apply Firebase rules only after reviewing the direct-message participant migration note.
