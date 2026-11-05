# Midnight Anime Social — implementation plan

## Product and boundaries

Build a separate social community web app in this repository, visually continuous with `midnight-anime`: near-black midnight surfaces, orange `#F47521` accents, white/soft-white text, Sora display + Inter body typography, rounded cards, anime-culture artwork, dark overlays, compact mobile-first navigation, and restrained motion. This is a social companion, not a streaming catalog.

## Architecture

- React 18 + Vite single-page app, React Router for the feed, Explore, inbox, notifications, and profile routes.
- Firebase Authentication for sessions and Firebase Realtime Database for profiles, posts, likes, comments, stories, follows, notifications, chat metadata and messages. Reuse the public client config from the streaming repo; never use Firebase Admin credentials in the browser.
- Cloudflare R2 for image/video objects in a dedicated private bucket. A Cloudflare Worker verifies Firebase ID tokens, validates media type and size, generates random user-scoped object keys, and signs 15-minute PUT and GET URLs using bucket-scoped R2 S3 credentials held as Worker secrets. Browser uploads bypass the app server; media remains private at the bucket boundary.
- `database.rules.json` provides a reviewable example Realtime Database policy. It is not applied automatically. Deployment secrets and live resource changes remain configuration steps rather than committed credentials.

## Main structure

- `src/App.jsx`: authenticated app shell, desktop side rails, mobile tabs, create/story modal, notification route and sign-in screen.
- `src/pages.jsx`: stories, live feed/post actions, Explore, direct messages and profile interactions.
- `src/session.jsx`: Firebase Auth state and profile bootstrap/update.
- `src/firebase.js`: shared Firebase client configuration.
- `src/styles.css`: design tokens and responsive Midnight Anime visual system.
- `worker/src/index.js`: Firebase token verification and private R2 presigning.
- `worker/wrangler.toml`: Worker and bucket configuration.
- `database.rules.json`: initial RTDB policy for review and deployment.

## Design details

- Design movement: Midnight streaming editorial translated into an anime-fandom social lounge.
- Core principles: immersive darkness; orange as a confident action/identity accent; fan content first; compact, tactile controls; mobile comfort with desktop discovery rails.
- Palette: `#0A0A0F` base, `#111118`/`#18181F` elevated surfaces, `#F47521` signature accent, `#FF9040` highlight, white with stepped opacity for text.
- Typography: Sora 700–800 for brand/headlines, Inter 400–700 for controls and reading. Small uppercase, letter-spaced labels for context.
- Layout: desktop three-column frame (rail/feed/utility) and mobile single-column feed with fixed bottom tabs.
- Signature elements: orange story rings, subtle ambient orange/purple blooms, dark image scrims and tiny orange status markers.
- Interaction: short transitions, compact hover/press feedback, clear upload progress and empty states, no heavy motion; honor reduced-motion preferences.
- Brand essence: a late-night home for anime fans to share moments and find their people; expressive, intimate, welcoming.

## Functional outcome scope

Ship first-release interfaces and Firebase wiring for profile sign-in, follow controls, social feed, photo/video posts, likes, comments, Explore/search, notifications, 24-hour Stories, and direct text messages. R2 is the media object store; Firebase remains for application records. Store R2 object keys rather than credentials or permanent public URLs in post data.

## Delivery constraints

The private R2 bucket has been created in the connected Cloudflare account. Worker deployment requires a bucket-scoped R2 S3 access key pair and Firebase web API key as Worker secrets; these are deliberately not in Git. Firebase provider activation, database-rule review/application, frontend hosting, and setting the Worker origin remain deployment setup items. The project is committed to the selected `SoloFFCreator/midnight-anime-social` repository after checks.
