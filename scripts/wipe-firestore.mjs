// One-off wipe script: clears all content collections that contain
// Supabase-pointing media URLs from before the Walrus migration. Leaves
// `users` and `usersPrivate` intact but blanks out the legacy `avatarUrl`
// field so old broken Supabase URLs don't keep rendering.
//
// USAGE:
//   1. Download a service account key from Firebase Console:
//      Project settings → Service accounts → "Generate new private key"
//      Save it as `service-account.json` in the project root (gitignored).
//   2. From the project root, run:
//        node scripts/wipe-firestore.mjs
//
//      Add --dry-run to preview the count without deleting:
//        node scripts/wipe-firestore.mjs --dry-run
//
//      Add --keep-users to skip clearing avatarUrl on user docs:
//        node scripts/wipe-firestore.mjs --keep-users
//
// DEPENDENCIES (one-time install — kept out of package.json since this is
// a dev-only script):
//   npm install --no-save firebase-admin
//
// SAFETY:
//   - Always run --dry-run first.
//   - This is destructive. There is no undo. Make sure the project id below
//     matches the one you actually want to wipe.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const KEEP_USERS = args.has('--keep-users');

const SERVICE_ACCOUNT_PATH = path.join(projectRoot, 'service-account.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} catch (error) {
  console.error(
    `\nCould not read service account at ${SERVICE_ACCOUNT_PATH}.\n` +
      `Generate one in Firebase Console (Project settings → Service accounts → Generate new private key)\n` +
      `and save it as service-account.json in the project root.\n\nUnderlying error: ${error.message}\n`,
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

// Collections to fully wipe — everything that referenced Supabase media or
// social activity tied to deleted prompts/workflows.
const COLLECTIONS_TO_WIPE = [
  'prompts',
  'promptLikes',
  'promptSaves',
  'promptCopies',
  'workflows',
  'workflowLikes',
  'workflowSaves',
  'notifications',
  'collections',
];

async function deleteCollection(collectionName, batchSize = 400) {
  const collectionRef = db.collection(collectionName);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }

    if (DRY_RUN) {
      totalDeleted += snapshot.size;
      console.log(`  [dry-run] would delete ${snapshot.size} docs from ${collectionName} (running total: ${totalDeleted})`);
      // In dry-run, break after the first page so we don't loop forever.
      const remaining = await collectionRef.count().get();
      totalDeleted = remaining.data().count;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`  deleted ${snapshot.size} docs from ${collectionName} (running total: ${totalDeleted})`);

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return totalDeleted;
}

async function clearLegacyAvatarUrls() {
  const snapshot = await db.collection('users').get();
  let cleared = 0;

  for (const userDoc of snapshot.docs) {
    const data = userDoc.data();
    const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : '';
    // Only clear avatars that look like Supabase URLs. Walrus aggregator URLs
    // are left untouched.
    if (avatarUrl.includes('supabase.co') || avatarUrl.includes('/storage/v1/object/public/')) {
      if (DRY_RUN) {
        console.log(`  [dry-run] would clear avatarUrl on user ${userDoc.id} (was: ${avatarUrl.slice(0, 80)}...)`);
      } else {
        await userDoc.ref.update({ avatarUrl: '' });
      }
      cleared += 1;
    }
  }

  return cleared;
}

async function main() {
  console.log(`\nFirestore wipe — project: ${serviceAccount.project_id}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (destructive)'}\n`);

  if (!DRY_RUN) {
    console.log('Starting in 3 seconds. Ctrl+C to abort.');
    await new Promise((r) => setTimeout(r, 3000));
  }

  let total = 0;
  for (const collectionName of COLLECTIONS_TO_WIPE) {
    console.log(`\n→ ${collectionName}`);
    const count = await deleteCollection(collectionName);
    total += count;
  }

  if (!KEEP_USERS) {
    console.log(`\n→ users.avatarUrl (Supabase URLs only)`);
    const cleared = await clearLegacyAvatarUrls();
    console.log(`  ${cleared} user avatar(s) ${DRY_RUN ? 'would be ' : ''}cleared`);
  }

  console.log(`\nDone. ${DRY_RUN ? 'Would delete' : 'Deleted'} ${total} docs across ${COLLECTIONS_TO_WIPE.length} collections.\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error('\nWipe failed:', error);
  process.exit(1);
});
