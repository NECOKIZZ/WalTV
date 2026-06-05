
  # cuerate

  This is a code bundle for cuerate. The original project is available at https://www.figma.com/design/ZKcHrhvpcXDJFv9Qv1tJ1R/cuerate.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Firebase Setup

  Copy `.env.example` to `.env` and fill in your Firebase web app values.
  Also set Sui/Enoki and Walrus vars because auth now uses zkLogin and media uploads use Walrus.

  The app now reads through `src/lib/backend.ts`, which uses Firebase Firestore when env vars are present and falls back to local stubs/mock data when they are not.

  Firebase config scaffolding is included in `firebase.json`, `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.

  Authentication is wired through the `/auth` route and the shared auth provider in `src/lib/auth-context.tsx`. For the hackathon fork, Firebase Auth is not used; Firestore documents are keyed by the user's zkLogin-derived Sui address.

  Important: the included Firestore rules are hackathon/demo rules for a client-only Enoki app. They make the current Sui-address flow work without Firebase Auth, but production should verify zkLogin signatures server-side or mint Firebase custom tokens before allowing protected writes.

  ## Move Attribution

  The hackathon fork includes a Sui Move package at `move/cuerate_attribution`.
  Publish it, then set `VITE_CUERATE_ATTRIBUTION_PACKAGE_ID` in `.env`.
  When configured, prompt creation and prompt forks best-effort write an
  `AttributionRecord` on Sui and store the resulting object id/digest back on
  the Firestore prompt document.

  ## Sui Paid Likes

  Paid likes can send a tiny SUI payment to the prompt creator before the app
  records the like. Configure the amount with `VITE_SUI_PAID_LIKE_MIST`
  (`1000000` MIST = `0.001` SUI) and toggle the feature with
  `VITE_ENABLE_SUI_PAID_LIKES`.

  ## Firebase Commands

  These scripts are shortcuts so you do not have to remember the full Firebase commands.

  `npm run firebase:login`
  Signs your computer into Firebase.

  `npm run firebase:use`
  Tells Firebase to use the `cuerate-e31b5` project for this repo.

  `npm run firebase:deploy-rules`
  Uploads your Firestore and Storage rules to Firebase.

  `npm run firebase:emulators`
  Starts a local fake Firebase on your machine so you can test safely without touching production.

  In plain English:
  The app is already wired to talk to Firebase. These commands just help you turn the connection on, point it at the right project, and test or publish the rules safely.
  
