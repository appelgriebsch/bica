# ADR 0005: Cross-device progress transfer via QR frames, no server

## Status

Accepted. 2026-11-06. Supersedes the file-transfer plan in #34 and the server-sync plan previously in #36. Preserves #33's no-accounts, no-database decision.

## Context

Progress is device-local in bica.progress.v1. snapshot and mergeRemote remain available. Users need an explicit way to move progress between devices. QR transfer is preferred to file export/import. The current PWA has no camera scanner, bounded transfer schema or explicit worker-update action.

A heavy progress fixture measured about 2.6 KB with gzip. The selected wire codec is deflate-raw, so final frame counts need measurement. Multiple small QR frames avoid one dense code. Camera policy currently denies camera access. Native QR decoding is not available on every target browser.

## Decision

- Transfer progress through QR frames only. No server, database, relay, signalling or transfer network request is added.
- Send one way. Repeat in reverse for both devices. Do not imply an acknowledgement or background convergence.
- Encrypt every session. Generate an unbiased random eight-character code from A-Z2-9 excluding O/I/L, with 0/1 excluded. Show XXXX-XXXX. Keep the code outside the QR.
- Derive AES-GCM-256 with PBKDF2-SHA256, 600,000 iterations and salt16. Use iv12. Compress JSON with deflate-raw, encrypt once, then base45-encode once and chunk. Blob = salt16 | iv12 | ciphertext-and-tag. AAD is UTF-8 BQ1|n with canonical decimal n.
- Use BQ1:<SID4>:<i>/<n>: headers and a hand-written RFC 9285 base45 codec. Aim for 450-500 characters per frame. Cap n at 16 and complete frames at 600 characters. Use uqr SVG output.
- Use BarcodeDetector when QR decoding is supported. Otherwise lazy-load precached jsQR in a same-origin Vite module worker. Permit camera=(self), not arbitrary origins. Stop tracks on background and leave.
- Authenticate before streaming inflate. Cap inflated output at 256 KB. Validate a strict bounded progress schema before preview and merge. Refuse unhydrated or failed-hydration stores.
- Preserve mergeRemote field winners and ties. Nothing is deleted or wholesale replaced. Review the actual result, recompute before commit, skip semantic no-ops and report success only after durable local save.
- Expire transient sessions after five minutes. Discard after five failed unlocks. These are UX limits, not captured-ciphertext revocation or offline attack prevention.
- Add explicit Update app support: complete atomic cache installation, waiting worker, user-authorized SKIP_WAITING and one reload after controllerchange. App update can require internet; transfer does not.
- Add the floorUpdatedAt persistence regression from #34. Update README and dated ADR supersession references without erasing history.

## Alternatives rejected

- WebRTC pairing: requires signalling and more lifecycle/failure handling. It is not the lean offline path.
- Server relay with D1: reintroduces the server storage removed by #33.
- JSON file export/import (#34): superseded by the QR-transfer preference. No file fallback is added.
- zxing-wasm: adds about 1 MB plus WebAssembly/CSP complexity. jsQR is the selected fallback.
- Unencrypted transfer: rejected. A transfer code and encryption are mandatory.

## Consequences

- Transfer is deliberate, offline and local. No server learns progress or the transfer code.
- Both devices need the app and cached client assets. Receive also needs a supported camera/decoder. Some users may need help aligning cameras.
- Multiple frames need collection limits, pause/step controls and real-device testing. Oversized payloads fail visibly, never truncate.
- Eight random reduced-alphabet characters provide about 40 bits of entropy. PBKDF2 raises attack cost but does not make captured ciphertext immune to offline guessing. Never claim expiry or five tries revokes a capture. A person who sees both code and QR can decrypt it.
- Existing merge semantics can change individual records/settings and can reduce streak when the later study day has a shorter streak. The UI must not promise that every value only increases.
- Camera policy changes and explicit PWA update code are necessary client work. The existing /_shell fallback omits CSP/Permissions-Policy; broad remediation is outside this decision.
- The schema must distinguish observed timestamps from scheduled SRS due dates. Current scheduling reaches 30 days ahead. Observed dates are bounded at today + 1. cards.due is bounded at today + 31.
