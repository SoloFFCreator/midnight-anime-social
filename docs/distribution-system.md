# Midnight Social distribution receiving system

## What is implemented

The Vercel API currently provides an authenticated DDEX intake endpoint, private archival of the original XML, a partner-scoped status endpoint, resumable S3 multipart asset transfer, a trusted schema-validator callback, administrator review and takedown operations, a date/territory-gated catalogue API, and per-user persistent playlists. The React application exposes `/music` and `/distribution-admin`. All privileged writes use Firebase Admin on the server; `database.rules.json` remains unchanged. Existing profile badges are not used as roles.

A submission receipt is an acknowledgement that Midnight Social received a particular message. It does **not** claim that the ERN conforms to the licensed XSD, that a partner's catalog delivered successfully, that a release is approved, or that any external DSP accepted it. Partner status and the event history keep these phases distinct.

## Partner API contract

Both partner identities are exact and allowlisted: `montyxlabel` maps to **MONTYXLABEL.cyou**, and `smusicdistrition` maps to **smusicdistrition.com**. Neither has an endpoint or credential embedded in source. Until configured, both are disabled and `/api/distribution/intake` returns 401.

A partner sends `POST /api/distribution/intake` with `Authorization: Bearer <partner token>`, `X-Distributor-Id: montyxlabel|smusicdistrition`, and JSON `{ "ernXml": "<NewReleaseMessage...>", "assets": [{ "role": "audio|artwork", "filename": "...", "contentType": "...", "size": 123, "resourceReference": "...", "sha256": "optional lowercase hex" }] }`. The XML limit is 2 MB. The intake accepts the ERN 4.3 namespace family (`ern/43`) for safe structural parsing only, rejects DTD/entity declarations, and requires a DDEX message ID, at least one audio master and cover-art asset, and a valid manifest. It records the message idempotently. HTTP 202 means “received, pending validation”; replayed identical messages are idempotent. It does not mean accepted/published.

For each manifest item, call `POST /api/distribution/assets` with the same partner headers. Use `operation: "initiate"`, then for each sequential part call `operation: "sign-part"` with `deliveryId`, `assetId`, `uploadId`, `partNumber`, and base64 SHA-256 for the exact part bytes; PUT the bytes to the returned URL with the required checksum header. Parts are 16 MiB; master assets may be up to 10,000,000,000 bytes (about 10 GB), artwork 25 MB, and combined package assets 50 GB. Use `operation: "complete"` to let the server verify all sequential S3 parts, full object size/type, and media-family signature. URLs expire after 15 minutes. `operation: "abort"` cancels an incomplete multipart upload. The partner then reads `GET /api/distribution/status?deliveryId=...` using the same partner credentials.

## Status and approval gates

Records flow through receipt, pending/failed schema validation, identity conflict, awaiting review, correction requested, rejected, scheduled, approved, taken down, or merged-to-canonical states. The validator callback is separate from partner credentials (`POST /api/distribution/validation`). It is disabled unless the operator confirms a DDEX implementation licence, configures an ERN 4.3.x exact schema version, and supplies a separate strong validator token. That callback is a trusted integration boundary; it must be called only after an actual local licensed-XSD validation result. No XSD is bundled, and structural parsing is not advertised as schema conformance.

Before approval the server requires: a passing licensed schema result, complete and signature-checked audio/artwork assets, a known release type, title, artist names, UPC/EAN, release date, territory terms, matched DDEX resource references, and resolved identifier conflicts. The administrator must explicitly attest to metadata and rights review, select a release date and territory grants present in the DDEX message, and inspect the original XML deal terms from the admin dashboard. An approved release is visible only after its confirmed date. Country-limited publication remains blocked unless `DISTRIBUTION_GEO_PROVIDER=vercel` is deliberately configured after verifying trusted country headers; without that setting only `WORLDWIDE` grants are streamable. Signed audio/artwork URLs live for five minutes. Takedown removes catalogue availability while preserving the record and audit history.

## Server-only configuration

Configure values only in the Vercel server environment, never `VITE_*`:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: Firebase service-account JSON with only the permissions needed for distribution records and ID-token verification.
- `FIREBASE_DATABASE_URL`: existing Midnight Social Realtime Database URL.
- `DISTRIBUTION_ADMIN_UIDS`: comma-separated Firebase Auth UIDs approved to operate the console.
- `MUSIC_DISTRIBUTION_PARTNERS_JSON`: secret JSON map. Example shape (replace placeholders with independently generated secrets and confirmed partner data): `{"montyxlabel":{"enabled":false,"apiToken":"<at-least-32-random-characters>","integrationVerified":false},"smusicdistrition":{"enabled":false,"apiToken":"<at-least-32-random-characters>","integrationVerified":false}}`. Do not set `enabled:true` until the partner agrees to the documented contract; only set `integrationVerified:true` after a real end-to-end test.
- `DISTRIBUTION_VALIDATOR_TOKEN`, `DDEX_IMPLEMENTATION_LICENSE_CONFIRMED=true`, and `DDEX_ERN_SCHEMA_VERSION=4.3.2` (or another exact licensed ERN 4.3.x schema version) are required to accept validator callbacks. Do not supply a passing callback without a real licensed XSD check.
- Existing `AWS_REGION`, `AWS_ROLE_ARN`, and `S3_BUCKET_NAME` must work for Vercel OIDC. Extend the AWS role only after review to cover private `distribution/inbound/*` reads/writes, upload-part/list/complete/abort, and `distribution/catalog` object reads. S3 default encryption, versioning, lifecycle, request logging, and bucket denial of public access should be verified. The distribution routes do not reuse the social media Firebase client permissions.

Partner tokens should be random 256-bit or stronger values generated and exchanged out of band. Keep credentials rotated and do not log Authorization headers. API key acceptance is intentionally disabled if the full partner configuration is absent or `enabled` is false.

## SFTP boundary

Vercel serverless functions cannot listen for inbound SFTP. `infra/distribution-sftp/` contains an AWS Transfer Family deployment template that can create separate named-user SFTP access and land files in private S3 staging prefixes; it is not deployed. Transfer Family and data transfer may incur AWS charges. Public-key parameters are partner-supplied and the account operator must review the template, permissions, DNS/host-key pinning, encryption, retention and monitoring before stack creation. The current landing template alone does not trigger ERN validation or create an app receipt; do not tell a partner that an upload has entered the app until an authenticated ingestion/processing worker and end-to-end transfer test are added.

## Current external verification

The apex `https://montyxlabel.cyou` displayed a parked-domain page during research; `https://user.montyxlabel.cyou/docs/creating-a-music-video` gave a user-facing music-video submission guide but no verified API/SFTP/DDEX contract. `https://smusicdistrition.com` did not return readable integration documentation. Exact names are retained as requested, but the integrations are not claimed live. DDEX source references and research details are in [`distribution-research.md`](./distribution-research.md).
