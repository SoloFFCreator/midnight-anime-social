# Midnight Anime Social — implementation plan

## Product direction and design

Midnight Anime Social remains the social companion to Midnight Anime. Preserve the reviewed near-black surfaces (`#0A0A0F`, `#111118`, `#18181F`), ember orange (`#F47521`), warm-white text, Sora display + Inter UI typography, rounded dark surfaces, and the original `public/midnight-anime-logo.svg`. The supplied mobile references inform familiar social navigation and gestures without copying the Instagram brand. Social posts, Stories and Reels use custom video controls; anime episodes use a contained 9:16 frame so landscape video is not cropped.

## Architecture

- React + Vite SPA and React Router: feed, Explore, social Reels, saved items, DMs, notifications, profiles, auth, TMDB anime discovery, and `/reels/anime/:mediaType/:id/:season/:episode`.
- Firebase Authentication: Google, email/password, signup, verification email and reset. Provider switches and authorized domains remain Firebase Console settings.
- Firebase Realtime Database: profiles, lowercase unique handle index, posts, Stories, Reels, likes, comments, saves, follows, notifications and direct messages. Rules bind content to its author, constrain DMs to two participants, derive the gold badge from the exact verified official email, and derive the blue badge from 1,000 follower-index entries.
- Cloudflare R2 remains a dedicated private bucket. `midnight-anime-social-media` verifies Firebase ID tokens, checks ownership/publication references for reads and issues short-lived signed URLs. The scoped R2 credential stays in Worker secrets; production CORS is limited to the live social origin and local development.
- Vercel project `midnight-anime-social-7u58` owns the social domain and has its public `VITE_R2_WORKER_URL`; the private media Worker endpoint is `https://midnight-anime-social-media.soloffofficial-83a.workers.dev`.
- TMDB supplies anime discovery metadata, posters and backdrops through a same-origin serverless function using encrypted server-only `TMDB_API_KEY`. Episodes resolve through the same Nuvio provider used by the original Midnight Anime product. `hls.js` and a custom React player deliver a portrait Reel-style experience with episode/audio/source choice, social reactions and no native browser controls. The Megavid media proxy is host-restricted; anime streams never enter social R2.
- Realtime Database rules live in `database.rules.json`. Repository edits do not change production rules. Review and apply the exact rule file in Firebase Console. The inbox supports legacy two-member participant maps as well as the new two-slot format.

## Structure

- `src/App.jsx`, `src/pages.jsx`: app shell, feed, Stories, Explore, messages, notifications, profiles and saved items.
- `src/AuthScreen.jsx`, `src/session.jsx`, `src/ProfileEditor.jsx`: authentication, profile bootstrap and transactional unique-handle claim/repair.
- `src/InstagramVideo.jsx`, `src/reels.jsx`: custom controls for social media and Reels upload/playback.
- `src/AnimePage.jsx`, `src/AnimeReelPlayer.jsx`, `src/StreamPlayer.jsx`: TMDB directory, portrait episode player, provider selection and HLS/MP4 controls.
- `src/api/tmdb.js`, `src/api/nuvio.js`, `api/anime-catalog.js`, `api/hindi-stream.js`, `api/megavid-proxy.js`: TMDB and original Nuvio provider integration.
- `src/firebase.js`, `src/ui.jsx`, `src/styles.css`, `worker/`: Firebase client, brand/shared components, responsive design and private media service.
- `database.rules.json`, `README.md`, `TODO.md`: Firebase authorization policy, setup/deployment guidance and remaining live checks.

## Acceptance and validation

Run `npm run build`, `npm audit --omit=dev --audit-level=high`, `npx wrangler deploy --dry-run --config worker/wrangler.toml`, JSON parsing of rule/route manifests and `git diff --check`. Live acceptance requires applying rules, testing a signed-in post/Story/Reel, editing a handle, and confirming a real provider stream with an authorized test account. Do not claim these database/provider actions are complete until they pass.
