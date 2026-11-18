# Midnight Anime Social — implementation plan

## Product direction and design

Midnight Anime Social remains the social companion to Midnight Anime. Preserve the reviewed near-black surfaces (`#0A0A0F`, `#111118`, `#18181F`), ember orange (`#F47521`), warm-white text, Sora display + Inter UI typography, rounded dark surfaces, and the original `public/midnight-anime-logo.svg`. The supplied mobile references inform familiar social navigation and gestures without copying the Instagram brand. Social posts, Stories and Reels use custom video controls; anime episodes use a contained 9:16 frame so landscape video is not cropped. The new distribution console is a role-gated, operational tool in the same visual system, distinct from artist self-service.

## Architecture

- React + Vite SPA and React Router: feed, Explore, social Reels, saved items, DMs, notifications, profiles, auth, TMDB anime discovery, and `/reels/anime/:mediaType/:id/:season/:episode`.
- Firebase Authentication: Google, email/password, signup, verification email and reset. Provider switches and authorized domains remain Firebase Console settings.
- Firebase Realtime Database: existing social data. Keep `database.rules.json` byte-for-byte unchanged. Distribution state is written only through Firebase Admin on server routes with a server-only service account. Admin access is an explicit server-side UID allowlist; profile badges are never authorization.
- Vercel serverless functions: authenticated intake, DDEX parsing, multipart asset-upload URL signing, admin review/status transitions, and published-catalog access. Partner API keys and S3/Firebase service credentials remain server-only environment variables. No default/demo credentials or success statuses.
- AWS S3: existing private-media bucket and Vercel OIDC role. Distribution masters, artwork, and original ERN XML use separate private prefixes. S3 multipart uploads support master assets up to 10 GB; metadata tracks expected size/type/checksum and upload completion. The role's distribution-prefix permissions must be confirmed before activation.
- DDEX ERN: accept ERN 4.3-family XML only after secure XML parsing and envelope checks. Licensed ERN XSD files must not be copied into this repository without the required DDEX implementation licence. A release cannot be approved for catalogue publication until schema validation has been performed by a configured, trusted validator. DDEX messages that have only passed structural parsing remain pending; no simulated acknowledgements.
- Partner API: only `MONTYXLABEL.cyou` and `smusicdistrition.com` are configured as partner identities, initially `pending configuration`. Authentic endpoint details, partner tokens, delivery conventions, and commercial approvals remain explicit environment/partner settings; no partner is represented as connected without end-to-end verification.
- SFTP: Vercel functions cannot accept inbound SFTP. A separate persistent service is required. Provide an infrastructure/deployment boundary for a real SFTP receiver; do not claim it is live until its hosting target, credentials/SSH keys, S3 path mapping, and a real partner transfer have been configured and tested. This external resource is not provisioned automatically.
- Identity/release handling: artist-account candidate matching, external artist IDs, verified claims/merges, and full artist/release/track deduplication are not implemented yet; incoming artist names remain ERN metadata only. Current duplicate UPC/ISRC conflicts require human review. Approved records carry explicitly reviewed release dates and territory grants. Takedowns remove catalogue availability, never erase the audit trail.
- Existing Midnight Anime and social-media flows are unchanged. No changes to Firebase rules, existing media permissions, or current social routes are needed for the distribution console.

## Structure

- `src/App.jsx`, `src/pages.jsx`: app shell, feed, Stories, Explore, messages, notifications, profiles and saved items.
- `src/AuthScreen.jsx`, `src/session.jsx`, `src/ProfileEditor.jsx`: authentication, profile bootstrap and transactional unique-handle claim/repair.
- `src/InstagramVideo.jsx`, `src/reels.jsx`: custom controls for social media and Reels upload/playback.
- `src/AnimePage.jsx`, `src/AnimeReelPlayer.jsx`, `src/StreamPlayer.jsx`: TMDB directory, portrait episode player, provider selection and HLS/MP4 controls.
- `src/api/tmdb.js`, `src/api/nuvio.js`, `api/anime-catalog.js`, `api/hindi-stream.js`, `api/megavid-proxy.js`: TMDB and original Nuvio provider integration.
- `api/distribution/`, `api/_distribution.js`: server-only partner auth, ERN intake, multipart asset actions, validator handoff, catalogue access, and admin workflow.
- `src/DistributionAdmin.jsx`, `src/DistributionCatalog.jsx`: role-gated review UI and public, territory/date-aware catalogue player.
- `infra/distribution-sftp/`: separately deployable SFTP receiver configuration; credentials and provisioning remain operator-supplied.
- `src/firebase.js`, `src/ui.jsx`, `src/styles.css`, `worker/`: Firebase client, brand/shared components, responsive design and private media service.
- `database.rules.json`, `README.md`, `TODO.md`: unchanged Firebase policy, setup/deployment guidance and remaining live checks.

## Acceptance and validation

Run `npm run build`, relevant API/unit tests, `npm audit --omit=dev --audit-level=high`, `npx wrangler deploy --dry-run --config worker/wrangler.toml`, JSON parsing of rule/route manifests and `git diff --check`. Verify the distribution routes deny missing/malformed partner credentials, user/admin tokens, unvalidated ERN, duplicate identifiers, and unauthorized state changes. Live acceptance requires real Firebase Admin/S3 environment credentials, licensed XSD validator, partner endpoint/key exchange, persistent SFTP hosting and a real partner test; until those are available, production integration status remains pending. Do not claim existing social/Anime functionality or live delivery behavior changed or tested beyond the evidence.
