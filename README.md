# Midnight Anime Social

A mobile-first anime community app, visually aligned with the Midnight Anime streaming product: near-black surfaces, orange accents, Sora/Inter typography, rounded content cards, and low-key motion. The social product is a separate app and repository.

## Current product surface

- Firebase Google sign-in and profile bootstrap, profile pages and follow controls.
- Community feed with photo/video posts, likes, comments and creator attribution.
- 24-hour Stories with a dedicated viewer and photo/video upload flow.
- Explore/search view, notifications stream, and a direct-message inbox with private text conversations.
- Responsive mobile navigation and desktop side rails.
- Cloudflare R2 media integration uses short-lived, Firebase-authenticated upload/download URLs. The R2 bucket stays private; no S3 credentials belong in the browser.

The feed includes a small set of editorial demo moments until real posts exist. Real app data is stored in Firebase Realtime Database. A production release still needs the Worker deployed, Firebase Authentication's Google provider enabled, and the database rules reviewed and applied.

## Architecture

```
src/
  App.jsx, pages.jsx       App shell, feed, stories, explore, inbox, profile
  session.jsx              Firebase Auth session and profile bootstrap
  firebase.js              Shared Midnight Anime Firebase project client
  styles.css               Midnight Anime design system and responsive layout
worker/
  src/index.js             Firebase ID token verification and R2 URL signing
  wrangler.toml            Worker name, private bucket name and local origin
 database.rules.json       Example RTDB authorization rules (review before applying)
```

The Worker checks Firebase ID tokens via Identity Toolkit, validates supported media types and a 5 GiB object-size ceiling, creates random user-scoped object keys, and returns 15-minute presigned R2 PUT/GET URLs. Browser uploads go directly to R2, avoiding the application server as a video proxy. R2 objects are private; only authenticated app sessions can request a media URL. For very large files over the single-PUT R2 limit, add S3 multipart upload support before enabling that upload size in the UI.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Firebase web configuration is prefilled with the public web-app identifiers used by `SoloFFCreator/midnight-anime`. Override those values in `.env.local` only if your Firebase project changes. These web-app identifiers are not Firebase Admin credentials.

Set `VITE_R2_WORKER_URL` to the deployed Worker origin after deployment, for example `https://midnight-anime-social-media.<your-subdomain>.workers.dev`.

## Configure Cloudflare R2 and Worker

The dedicated bucket `midnight-anime-social` has been created in the connected Cloudflare account, in APAC, Standard storage. It remains private; do not enable a public `r2.dev` URL. Its CORS policy permits browser PUT/GET/HEAD requests to presigned object URLs; CORS is not authorization, and Worker endpoints still require a Firebase ID token. The Worker `ALLOWED_ORIGINS` variable should be restricted to the final app origin(s) before production.

1. Create an R2 API token scoped to **Object Read & Write** for only the `midnight-anime-social` bucket. Keep the Access Key ID and Secret Access Key secret.
2. Set the deployment account ID in `worker/wrangler.toml` by adding `CLOUDFLARE_ACCOUNT_ID` to `[vars]`, or set it as a Worker variable.
3. Install the repository dependencies and deploy once to create the Worker script:

   ```bash
   npm install
   npx wrangler deploy --config worker/wrangler.toml
   ```

4. Add secrets to that Worker, then deploy again to apply the final configuration:

   ```bash
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID --config worker/wrangler.toml
   npx wrangler secret put R2_ACCESS_KEY_ID --config worker/wrangler.toml
   npx wrangler secret put R2_SECRET_ACCESS_KEY --config worker/wrangler.toml
   npx wrangler secret put FIREBASE_API_KEY --config worker/wrangler.toml
   npx wrangler deploy --config worker/wrangler.toml
   ```

   `CLOUDFLARE_ACCOUNT_ID` is an identifier, but is kept in Worker secret configuration alongside credentials for operational simplicity. For production, set `ALLOWED_ORIGINS` to the exact deployed website origin(s), comma-separated; the Worker rejects browser origins outside that allowlist. Keep `http://localhost:5173` for local development.

5. Set `VITE_R2_WORKER_URL` to the deployed Worker URL in the frontend deployment environment and rebuild the app.

The Worker uses AWS Signature V4 against the R2 S3 endpoint. It does not use or expose the Cloudflare global API token.

## Firebase setup

- Enable Google sign-in in Firebase Authentication and add the deployed app domain under authorized domains.
- Review `database.rules.json` against the live data layout, then apply it in Firebase Realtime Database Rules. The file is a starting policy and is not automatically applied by this repository.
- Posts, stories, profiles, follows, notifications and chats are stored in Realtime Database. Authentication is required for reads of community content. Each account can only create/update its own authored posts and stories.
- Consider adding server-side moderation, rate limiting, abuse reporting, account deletion, and authoritative notification fan-out before opening sign-ups widely.

## Build

```bash
npm run build
```
