# Midnight Anime Social — implementation plan

## Product direction and design

Midnight Anime Social is the social companion to Midnight Anime: fans share their own anime moments, follow and message one another, watch short Reels, and discover the official account. Preserve the reviewed design system: near-black surfaces (`#0A0A0F`, `#111118`, `#18181F`), ember orange (`#F47521`), warm-white text, Sora display + Inter UI typography, rounded dark surfaces, and the original `public/midnight-anime-logo.svg`. The mobile Instagram screenshots guide familiar navigation and interaction patterns without copying Instagram's brand.

## Architecture

- React + Vite single-page app and React Router; routes cover feed, Explore, Reels, saved items, messages, notifications, profiles, auth and `/anime`.
- Firebase Authentication supports Google and email/password, account creation, verification mail and password reset. Provider toggles and authorized domains are Firebase Console settings.
- Firebase Realtime Database stores profiles, unique handle indexes, posts, Stories, Reels, likes, comments, saves, follows, notifications and direct messages. User profile changes are owner-scoped; official badge eligibility is tied to the exact verified email; blue verification is derived from 1,000+ follower entries.
- Direct-message chat records have explicit `participants` to constrain chat reads and message writes. The new `database.rules.json` policy uses this membership map; existing chats without it need a two-member backfill before applying the stricter rules.
- Cloudflare R2 remains a dedicated private bucket. `midnight-anime-social-media` verifies Firebase ID tokens, checks ownership/publication references for reads, creates user-scoped keys, and issues short-lived signed URLs. The bucket-specific R2 Object Read/Write credential and Firebase Worker secrets are kept only as Worker secrets. Production CORS is limited to `https://social.midnightanime.bond` and local development.
- Vercel project `midnight-anime-social-7u58` owns the live social domain and has `VITE_R2_WORKER_URL` set for production/preview/development. The Worker is routed at `https://midnight-anime-social-media.soloffofficial-83a.workers.dev`.
- The `/anime` directory uses AniList for search/trending metadata and hands episodes to the canonical Midnight Anime route `https://www.midnightanime.bond/watch/{anilistId}/{episode}`. Playback itself remains on the existing provider/player; no third-party anime media is stored in the social R2 bucket.

## Structure

- `src/App.jsx`: authenticated shell, navigation, media creation.
- `src/AuthScreen.jsx`: email/password login, account creation, Google sign-in and reset.
- `src/ProfileEditor.jsx`: profile image, display name, unique handle, bio, pronouns and website.
- `src/pages.jsx`: feed, Stories, Explore, inbox, notifications, profiles and saved collection.
- `src/reels.jsx`: video creation/playback, likes, comments, sharing and saved state.
- `src/AnimePage.jsx`: AniList discovery and canonical streaming links.
- `src/session.jsx`, `src/firebase.js`, `src/ui.jsx`, `src/styles.css`: session/profile state, Firebase client, shared UI/brand/badges, responsive design.
- `worker/src/index.js`, `worker/wrangler.toml`: private media service and deployment config.
- `database.rules.json`, `README.md`, `TODO.md`: security policy, provider/deployment setup, remaining acceptance checks.

## Acceptance and validation

Build and lint-like validation: `npm run build`, `npm audit --omit=dev --audit-level=high`, `npx wrangler deploy --dry-run --config worker/wrangler.toml`, JSON parse validation for database rules, and `git diff --check`. A no-token test of the deployed Worker returns `Sign in required`; complete a live authenticated upload test after Vercel deploy. Firebase providers/rules and old-chat membership backfill remain console-side setup and should be verified with real accounts.
