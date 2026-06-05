# Cuerate Go-Live Checklist

## 1) Environment And Secrets
- Verify `VITE_FIREBASE_*` values are set in production deployment.
- Verify `VITE_ENOKI_PUBLIC_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, and `VITE_SUI_NETWORK` are set.
- Verify `VITE_WALRUS_NETWORK` and any publisher/aggregator overrides are set.
- Confirm no real secrets are committed in repo (`.env` should stay local-only).
- Confirm Enoki, Google OAuth redirect URIs, Walrus network, and Firebase project match the deployment environment.

## 2) Firestore Rules Deployment
- Review and deploy Firestore rules:
  - The current rules are hackathon/demo rules for a client-only Enoki zkLogin app.
  - They accept Sui-address-shaped user IDs because Firebase Auth is no longer used.
  - Before production, replace this with a backend verifier or Firebase custom-token bridge so protected writes are tied to a verified zkLogin session.
- Deploy:
  - `npm run firebase:deploy-rules`

## 3) Walrus Storage Verification
- Confirm prompt media, thumbnails, avatars, and workflow step media upload through Walrus.
- Confirm testnet blobs are not treated as production data.
- For mainnet, confirm storage epochs, publisher reliability, and `VITE_WALRUS_SEND_OBJECT_TO` ownership behavior.

## 3.5) Move Attribution Verification
- Build and publish `move/cuerate_attribution` to the selected Sui network.
- Set `VITE_CUERATE_ATTRIBUTION_PACKAGE_ID` to the published package id.
- Create an original prompt and confirm an `AttributionRecord` object is created.
- Fork a prompt and confirm the fork record references the parent attribution object.

## 4) Build And Type Safety
- Run:
  - `npx tsc --noEmit`
  - `npm run build`
- Confirm no blocking errors.
- Track bundle size warning and plan chunk splitting post-launch.

## 5) Auth Flow Verification
- Test Google zkLogin sign-in end-to-end.
- Confirm the same Google account derives the same Sui address after logout/login.
- Confirm signed-out users are blocked from app screens and redirected to `/auth`.

## 6) Posting Verification
- Prompt post:
  - image post with `NanoBanana` only
  - video post with non-`NanoBanana` models
- Workflow post:
  - all generation modes including `ingredients`
  - ingredients supports 1-5 images
  - ingredients allows image/video output
  - saved workflow step data persists to profile and detail pages

## 7) Deletion And Cleanup Verification
- Delete prompt and confirm Walrus blob references are removed from Firestore.
- Delete workflow and confirm:
  - cover media references are removed
  - step media references are removed
  - `ingredientsImageUrls` media references are removed

## 8) Security Regression Checks
- Confirm user public profile reads do not expose email/private auth metadata.
- Confirm signed-in users cannot freely edit like/save/copy counters.
- Confirm notifications cannot be spoofed with arbitrary `fromHandle/fromAvatar`.

## 9) Core UX Smoke Test
- Feed, Explore, Prompt detail, Workflow detail, Profile, User profile, Settings.
- Save/unsave, like/unlike, follow/unfollow, copy prompt, fork prompt.
- Mobile and desktop nav checks.

## 10) Rollback Plan
- Keep a tagged pre-launch commit.
- Keep prior Firestore rules snapshot.
- If issues occur:
  - rollback app deploy
  - rollback Firestore rules
  - re-run smoke tests.
