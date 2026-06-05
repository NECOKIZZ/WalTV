import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseEnabled } from './firebase';
import {
  availableModels,
  availableMoodLabels,
  availableStyleTags,
  Collection,
  CreateCollectionInput,
  difficultyLevels,
  ForkPromptInput,
  Notification,
  PaidLike,
  Prompt,
  PromptCreateInput,
  User,
  Workflow,
  WorkflowCreateInput,
} from './types';
import { mockCollections, mockNotifications, mockPrompts, mockUsers, mockWorkflows } from './mockData';
import {
  extractWalrusBlobIdFromUrl,
  isWalrusConfigured,
  walrusConfig,
  walrusPublishBlob,
} from './walrus';

// Local mirror of the authenticated user, so mock mode (no Firebase) can
// keep a session in localStorage. With zkLogin in production, the source of
// truth is the Enoki session managed by the AuthProvider.
const LOCAL_AUTH_USER_KEY = 'cuerate.auth.user';
const authListeners = new Set<(user: User | null) => void>();
const mockPaidLikes: PaidLike[] = [];

const COLLECTIONS = {
  users: 'users',
  prompts: 'prompts',
  promptLikes: 'promptLikes',
  promptSaves: 'promptSaves',
  promptCopies: 'promptCopies',
  paidLikes: 'paidLikes',
  workflows: 'workflows',
  workflowLikes: 'workflowLikes',
  workflowSaves: 'workflowSaves',
  userFollows: 'userFollows',
  notifications: 'notifications',
  collections: 'collections',
} as const;

const QUERY_LIMITS = {
  users: 300,
  feedPrompts: 200,
  feedWorkflows: 150,
} as const;

function cloneDate<T extends { createdAt: Date }>(item: T): T {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
  };
}

function clonePrompt(prompt: Prompt): Prompt {
  return cloneDate(prompt);
}

function cloneUser(user: User): User {
  return cloneDate(user);
}

function cloneNotification(notification: Notification): Notification {
  return cloneDate(notification);
}

function cloneCollection(collectionItem: Collection): Collection {
  return cloneDate(collectionItem);
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    ...cloneDate(workflow),
    tags: [...workflow.tags],
    steps: workflow.steps.map((step) => ({ ...step })),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedFields(item)) as T;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedFields(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }

  return new Date();
}

// Walrus blobs are content-addressed and immutable from the client. We keep
// the helper for analytics / future Move-attribution lookups, but media
// "deletion" simply drops the Firestore reference — the blob expires on its
// own after its paid epochs lapse.
function extractWalrusBlobIdFromUrlSafe(value: unknown): string | null {
  return extractWalrusBlobIdFromUrl(value);
}

function deserializeUser(id: string, data: Record<string, unknown>): User {
  // The Firestore doc id IS the user's Sui address. We expose it as both
  // `uid` (the legacy field name used everywhere downstream) and
  // `suiAddress` (the explicit name used by onchain code paths).
  return {
    uid: id,
    suiAddress: id,
    handle: String(data.handle ?? ''),
    displayName: String(data.displayName ?? ''),
    avatarUrl: String(data.avatarUrl ?? ''),
    email: data.email ? String(data.email) : undefined,
    bio: String(data.bio ?? ''),
    links: (data.links as User['links']) ?? {},
    primaryModels: Array.isArray(data.primaryModels) ? data.primaryModels.map(String) : [],
    followers: Number(data.followers ?? 0),
    following: Number(data.following ?? 0),
    totalCopies: Number(data.totalCopies ?? 0),
    totalPrompts: Number(data.totalPrompts ?? 0),
    hasOnboarded: typeof data.hasOnboarded === 'boolean' ? data.hasOnboarded : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : undefined,
    lastLoginAt: data.lastLoginAt ? toDate(data.lastLoginAt) : undefined,
  };
}

function deserializePrompt(id: string, data: Record<string, unknown>): Prompt {
  return {
    id,
    authorUid: String(data.authorUid ?? ''),
    authorHandle: String(data.authorHandle ?? ''),
    authorAvatar: String(data.authorAvatar ?? ''),
    videoUrl: String(data.videoUrl ?? ''),
    thumbnailUrl: String(data.thumbnailUrl ?? ''),
    mediaWidth: typeof data.mediaWidth === 'number' ? data.mediaWidth : undefined,
    mediaHeight: typeof data.mediaHeight === 'number' ? data.mediaHeight : undefined,
    promptText: String(data.promptText ?? ''),
    model: String(data.model ?? ''),
    contentType: data.contentType === 'image' ? 'image' : 'video',
    aspectRatio: data.aspectRatio === 'portrait' ? 'portrait' : 'landscape',
    styleTags: Array.isArray(data.styleTags) ? data.styleTags.map(String) : [],
    cameraNotes: String(data.cameraNotes ?? ''),
    moodLabel: String(data.moodLabel ?? ''),
    difficulty: String(data.difficulty ?? ''),
    likes: Number(data.likes ?? 0),
    saves: Number(data.saves ?? 0),
    copies: Number(data.copies ?? 0),
    forks: Number(data.forks ?? 0),
    isForked: Boolean(data.isForked),
    forkedFromId: data.forkedFromId ? String(data.forkedFromId) : null,
    forkedFromAuthorHandle: data.forkedFromAuthorHandle ? String(data.forkedFromAuthorHandle) : null,
    onchainAttributionId: data.onchainAttributionId ? String(data.onchainAttributionId) : undefined,
    onchainAttributionTxDigest: data.onchainAttributionTxDigest ? String(data.onchainAttributionTxDigest) : undefined,
    walrusContentBlobId: data.walrusContentBlobId ? String(data.walrusContentBlobId) : undefined,
    walrusMetadataBlobId: data.walrusMetadataBlobId ? String(data.walrusMetadataBlobId) : undefined,
    createdAt: toDate(data.createdAt),
  };
}

function clonePaidLike(paidLike: PaidLike): PaidLike {
  return cloneDate(paidLike);
}

function deserializeNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    userId: String(data.userId ?? ''),
    type: (data.type as Notification['type']) ?? 'like',
    fromUid: String(data.fromUid ?? ''),
    fromHandle: String(data.fromHandle ?? ''),
    fromAvatar: data.fromAvatar ? String(data.fromAvatar) : undefined,
    promptId: data.promptId ? String(data.promptId) : undefined,
    workflowId: data.workflowId ? String(data.workflowId) : undefined,
    message: String(data.message ?? ''),
    read: Boolean(data.read),
    createdAt: toDate(data.createdAt),
  };
}

function deserializeCollection(id: string, data: Record<string, unknown>): Collection {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    description: data.description ? String(data.description) : undefined,
    count: Number(data.count ?? 0),
    thumbnails: Array.isArray(data.thumbnails) ? data.thumbnails.map(String) : [],
    createdAt: toDate(data.createdAt),
  };
}

function deserializePaidLike(id: string, data: Record<string, unknown>): PaidLike {
  return {
    id,
    promptId: String(data.promptId ?? ''),
    payerUid: String(data.payerUid ?? ''),
    creatorUid: String(data.creatorUid ?? ''),
    amountMist: String(data.amountMist ?? ''),
    amountSui: String(data.amountSui ?? ''),
    currency: 'SUI',
    paymentRail: 'sui',
    txDigest: String(data.txDigest ?? ''),
    network: data.network === 'mainnet' || data.network === 'devnet' ? data.network : 'testnet',
    createdAt: toDate(data.createdAt),
  };
}

function deserializeWorkflow(id: string, data: Record<string, unknown>): Workflow {
  return {
    id,
    authorUid: String(data.authorUid ?? ''),
    authorHandle: String(data.authorHandle ?? ''),
    authorAvatar: String(data.authorAvatar ?? ''),
    title: String(data.title ?? ''),
    tool: String(data.tool ?? ''),
    description: String(data.description ?? ''),
    coverVideoUrl: String(data.coverVideoUrl ?? ''),
    coverThumbnailUrl: String(data.coverThumbnailUrl ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    stepCount: Number(data.stepCount ?? 0),
    likes: Number(data.likes ?? 0),
    saves: Number(data.saves ?? 0),
    mediaAspectRatio: data.mediaAspectRatio === 'portrait' ? 'portrait' : 'landscape',
    createdAt: toDate(data.createdAt),
    steps: Array.isArray(data.steps)
      ? data.steps.map((entry, index) => {
          const step = (entry ?? {}) as Record<string, unknown>;
          return {
            id: String(step.id ?? `step-${index + 1}`),
            stepNumber: Number(step.stepNumber ?? index + 1),
            label: String(step.label ?? ''),
            model: String(step.model ?? data.tool ?? ''),
            generationType: (step.generationType as Workflow['steps'][number]['generationType']) ?? 'prompt_to_video',
             promptText: step.promptText ? String(step.promptText) : undefined,
             note: step.note ? String(step.note) : undefined,
             inputImageUrl: step.inputImageUrl ? String(step.inputImageUrl) : undefined,
             ingredientsImageUrls: Array.isArray(step.ingredientsImageUrls)
               ? step.ingredientsImageUrls.map(String)
               : undefined,
             startFrameUrl: step.startFrameUrl ? String(step.startFrameUrl) : undefined,
             endFrameUrl: step.endFrameUrl ? String(step.endFrameUrl) : undefined,
            resultMediaUrl: String(step.resultMediaUrl ?? ''),
            resultThumbnailUrl: String(step.resultThumbnailUrl ?? ''),
            resultContentType: step.resultContentType === 'image' ? 'image' : 'video',
          };
        })
      : [],
  };
}

function requireDb() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add your Vite Firebase env vars to enable backend reads/writes.');
  }

  return db;
}

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readLocalAuthUser(): User | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Omit<User, 'createdAt'> & { createdAt: string };
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

function writeLocalAuthUser(user: User | null) {
  if (!canUseBrowserStorage()) {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    return;
  }

  window.localStorage.setItem(
    LOCAL_AUTH_USER_KEY,
    JSON.stringify({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }),
  );
}

function emitAuthUser(user: User | null) {
  for (const listener of authListeners) {
    listener(user ? cloneUser(user) : null);
  }
}

// Build a fresh User record for a Sui address. Used both in mock mode and
// in production for the very first sign-in. The handle defaults to
// user_<addr suffix>; the onboarding flow will let the user customize it.
function buildFreshUserForAddress(input: { suiAddress: string; email?: string; handle?: string }): User {
  const fallbackHandle = `user_${input.suiAddress.slice(2, 8).toLowerCase()}`;
  const handle = sanitizeHandle(input.handle || '') || fallbackHandle;
  return {
    uid: input.suiAddress,
    suiAddress: input.suiAddress,
    handle,
    displayName: handle,
    avatarUrl: '',
    email: input.email,
    bio: '',
    links: {},
    primaryModels: [],
    followers: 0,
    following: 0,
    totalCopies: 0,
    totalPrompts: 0,
    hasOnboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
  };
}

function sanitizeHandle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

function getFallbackUsers() {
  const localAuthUser = readLocalAuthUser();

  if (!localAuthUser) {
    return mockUsers.map(cloneUser);
  }

  const users = mockUsers.filter(
    (user) => user.uid !== localAuthUser.uid && user.handle !== localAuthUser.handle,
  );

  return [cloneUser(localAuthUser), ...users.map(cloneUser)];
}

async function getUserByUid(uid: string): Promise<User | null> {
  if (!firebaseEnabled) {
    const localAuthUser = readLocalAuthUser();
    if (localAuthUser?.uid === uid) {
      return cloneUser(localAuthUser);
    }

    const user = mockUsers.find((entry) => entry.uid === uid) ?? null;
    return user ? cloneUser(user) : null;
  }

  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, COLLECTIONS.users, uid));

  if (!snapshot.exists()) {
    return null;
  }

  return deserializeUser(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function upsertUserProfile(profile: User) {
  if (!firebaseEnabled) {
    writeLocalAuthUser(profile);
    return cloneUser(profile);
  }

  const firestore = requireDb();
  const publicProfile = stripUndefinedFields({
    uid: profile.uid,
    suiAddress: profile.suiAddress,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    bio: profile.bio,
    links: profile.links,
    primaryModels: profile.primaryModels,
    followers: profile.followers,
    following: profile.following,
    totalCopies: profile.totalCopies,
    totalPrompts: profile.totalPrompts,
    hasOnboarded: profile.hasOnboarded,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt ?? new Date(),
    lastLoginAt: profile.lastLoginAt,
  });
  await setDoc(doc(firestore, COLLECTIONS.users, profile.uid), publicProfile, { merge: true });

  return profile;
}

async function handleExists(handle: string) {
  const normalizedHandle = sanitizeHandle(handle);

  if (!normalizedHandle) {
    return false;
  }

  if (!firebaseEnabled) {
    return getFallbackUsers().some((user) => user.handle === normalizedHandle);
  }

  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, COLLECTIONS.users), where('handle', '==', normalizedHandle), limit(1)),
  );

  return !snapshot.empty;
}

async function ensureUniqueHandle(baseHandle: string, currentUserId?: string) {
  const normalizedBase = sanitizeHandle(baseHandle) || 'creator';
  let candidate = normalizedBase;
  let suffix = 1;

  while (true) {
    if (!firebaseEnabled) {
      const conflict = getFallbackUsers().find((user) => user.handle === candidate && user.uid !== currentUserId);
      if (!conflict) {
        return candidate;
      }
    } else {
      const firestore = requireDb();
      const snapshot = await getDocs(
        query(collection(firestore, COLLECTIONS.users), where('handle', '==', candidate), limit(2)),
      );
      const conflict = snapshot.docs.find((docSnapshot) => docSnapshot.id !== currentUserId);
      if (!conflict) {
        return candidate;
      }
    }

    suffix += 1;
    candidate = `${normalizedBase}${suffix}`;
  }
}

async function isHandleTakenByAnotherUser(handle: string, currentUserId: string) {
  const normalizedHandle = sanitizeHandle(handle);
  if (!normalizedHandle) {
    return false;
  }

  if (!firebaseEnabled) {
    return getFallbackUsers().some((user) => user.handle === normalizedHandle && user.uid !== currentUserId);
  }

  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, COLLECTIONS.users), where('handle', '==', normalizedHandle), limit(2)),
  );
  return snapshot.docs.some((docSnapshot) => docSnapshot.id !== currentUserId);
}

async function syncAuthorIdentityOnContent(input: {
  uid: string;
  handle?: string;
  avatarUrl?: string;
}) {
  if (!firebaseEnabled) {
    return;
  }

  const updates = stripUndefinedFields({
    authorHandle: input.handle,
    authorAvatar: input.avatarUrl,
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  const firestore = requireDb();
  const [promptSnapshots, workflowSnapshots] = await Promise.all([
    getDocs(query(collection(firestore, COLLECTIONS.prompts), where('authorUid', '==', input.uid))),
    getDocs(query(collection(firestore, COLLECTIONS.workflows), where('authorUid', '==', input.uid))),
  ]);

  await Promise.all([
    ...promptSnapshots.docs.map((entry) => updateDoc(entry.ref, updates)),
    ...workflowSnapshots.docs.map((entry) => updateDoc(entry.ref, updates)),
  ]);
}

async function createNotification(input: Omit<Notification, 'id' | 'read' | 'createdAt'>) {
  if (!input.userId || !input.fromUid || input.userId === input.fromUid) {
    return;
  }

  const notification: Notification = {
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date(),
    ...input,
  };

  try {
    if (!firebaseEnabled) {
      mockNotifications.unshift(cloneNotification(notification));
      return;
    }

    const firestore = requireDb();
    const notificationDocument = { ...notification } as Omit<Notification, 'id'> & { id?: string };
    delete notificationDocument.id;
    await addDoc(collection(firestore, COLLECTIONS.notifications), stripUndefinedFields(notificationDocument));
  } catch (error) {
    console.error('Could not create notification:', error);
  }
}

// Authentication is owned by Enoki zkLogin (see src/lib/auth-context.tsx).
// This module exposes only the Firestore-backed user operations that the rest
// of the app calls. The flow:
//   1. User signs in with Google -> Enoki returns a Sui address.
//   2. AuthProvider calls `authApi.getOrCreateUserBySuiAddress(address)`.
//   3. That function looks up or creates the user doc in Firestore, keyed by
//      the Sui address (lowercase).
//   4. AuthProvider broadcasts the User to the rest of the app via React context.
//
// `subscribe` is kept for backward compatibility with hooks-free callers but is
// inert in production (the AuthProvider drives identity directly).
export const authApi = {
  async getCurrentUser(): Promise<User | null> {
    // Without a hook context we cannot know who is signed in via Enoki.
    // Callers should use `useAuth()` instead. Kept for code paths that just
    // need the locally-cached profile (mock mode).
    if (!firebaseEnabled) {
      return readLocalAuthUser();
    }
    return null;
  },

  async getOrCreateUserBySuiAddress(
    suiAddress: string,
    options: { email?: string; defaultHandle?: string } = {},
  ): Promise<User> {
    if (!suiAddress) {
      throw new Error('Missing Sui address.');
    }

    const normalizedAddress = suiAddress.toLowerCase();

    if (!firebaseEnabled) {
      const cached = readLocalAuthUser();
      if (cached?.suiAddress === normalizedAddress) {
        return cloneUser({ ...cached, lastLoginAt: new Date() });
      }
      const fresh = buildFreshUserForAddress({
        suiAddress: normalizedAddress,
        email: options.email,
        handle: options.defaultHandle,
      });
      writeLocalAuthUser(fresh);
      emitAuthUser(fresh);
      return cloneUser(fresh);
    }

    const existing = await getUserByUid(normalizedAddress);
    if (existing) {
      // Returning user: refresh lastLoginAt + optionally backfill email.
      const updated: User = {
        ...existing,
        lastLoginAt: new Date(),
        email: existing.email ?? options.email,
      };
      await upsertUserProfile(updated);
      return updated;
    }

    // First-time sign-in: ensure the default handle is unique, then write.
    const fallbackHandle = `user_${normalizedAddress.slice(2, 8).toLowerCase()}`;
    const uniqueHandle = await ensureUniqueHandle(
      options.defaultHandle || fallbackHandle,
      normalizedAddress,
    );
    const fresh = buildFreshUserForAddress({
      suiAddress: normalizedAddress,
      email: options.email,
      handle: uniqueHandle,
    });
    await upsertUserProfile(fresh);
    return fresh;
  },

  async updateProfile(input: {
    uid: string;
    handle: string;
    bio: string;
    avatarUrl?: string;
    links?: User['links'];
    primaryModels?: string[];
    hasOnboarded?: boolean;
  }): Promise<User> {
    if (!input.uid) {
      throw new Error('Missing user id.');
    }

    const existingUser = await getUserByUid(input.uid);
    if (!existingUser) {
      throw new Error('Profile not found.');
    }

    const normalizedHandle = sanitizeHandle(input.handle);
    if (!normalizedHandle) {
      throw new Error('Username must include letters, numbers, or underscores.');
    }

    if (await isHandleTakenByAnotherUser(normalizedHandle, input.uid)) {
      throw new Error('Username taken. Choose another one.');
    }

    const nextUser: User = {
      ...existingUser,
      handle: normalizedHandle,
      displayName: normalizedHandle,
      bio: input.bio.trim(),
      avatarUrl: input.avatarUrl ?? existingUser.avatarUrl,
      links: input.links ?? existingUser.links,
      primaryModels: input.primaryModels ?? existingUser.primaryModels,
      hasOnboarded: input.hasOnboarded ?? existingUser.hasOnboarded,
      updatedAt: new Date(),
    };

    const savedUser = await upsertUserProfile(nextUser);

    const handleChanged = savedUser.handle !== existingUser.handle;
    const avatarChanged = savedUser.avatarUrl !== existingUser.avatarUrl;

    if (handleChanged || avatarChanged) {
      await syncAuthorIdentityOnContent({
        uid: savedUser.uid,
        handle: handleChanged ? savedUser.handle : undefined,
        avatarUrl: avatarChanged ? savedUser.avatarUrl : undefined,
      });
    }

    writeLocalAuthUser(savedUser);
    emitAuthUser(savedUser);
    return cloneUser(savedUser);
  },

  // Mock-mode entry point. In production the AuthProvider triggers Enoki's
  // OAuth redirect directly; this is a thin fallback used only when Firebase
  // is disabled (local dev without env vars).
  async signInWithGoogleMock(): Promise<User | null> {
    if (firebaseEnabled) {
      throw new Error('signInWithGoogleMock is only available in mock mode. Use the AuthProvider in production.');
    }
    const mockAddress = `0x${crypto.randomUUID().replace(/-/g, '')}`;
    const fresh = buildFreshUserForAddress({ suiAddress: mockAddress });
    writeLocalAuthUser(fresh);
    emitAuthUser(fresh);
    return cloneUser(fresh);
  },

  // Clears local cache. The real zkLogin session is cleared by EnokiFlow.logout()
  // inside the AuthProvider.
  async signOut(): Promise<void> {
    writeLocalAuthUser(null);
    emitAuthUser(null);
  },

  subscribe(listener: (user: User | null) => void) {
    authListeners.add(listener);

    listener(readLocalAuthUser());

    if (!firebaseEnabled && typeof window !== 'undefined') {
      const handleStorage = () => listener(readLocalAuthUser());
      window.addEventListener('storage', handleStorage);
      return () => {
        authListeners.delete(listener);
        window.removeEventListener('storage', handleStorage);
      };
    }

    return () => {
      authListeners.delete(listener);
    };
  },
};

export const backendStatus = {
  firebaseEnabled,
  walrusConfigured: isWalrusConfigured,
  walrusNetwork: walrusConfig.network,
};

export const metaApi = {
  getAvailableModels: async () => [...availableModels],
  getAvailableStyleTags: async () => [...availableStyleTags],
  getAvailableMoodLabels: async () => [...availableMoodLabels],
  getDifficultyLevels: async () => [...difficultyLevels],
};

export const usersApi = {
  async getAllUsers(): Promise<User[]> {
    if (!firebaseEnabled) {
      return getFallbackUsers();
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.users),
        orderBy('followers', 'desc'),
        limit(QUERY_LIMITS.users),
      ),
    );
    return snapshot.docs.map((entry) => deserializeUser(entry.id, entry.data() as Record<string, unknown>));
  },

  async getUserByHandle(handle: string): Promise<User | null> {
    if (!firebaseEnabled) {
      const user = getFallbackUsers().find((entry) => entry.handle === handle) ?? null;
      return user ? cloneUser(user) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.users), where('handle', '==', handle), limit(1)),
    );

    if (snapshot.empty) {
      return null;
    }

    const userDoc = snapshot.docs[0];
    return deserializeUser(userDoc.id, userDoc.data() as Record<string, unknown>);
  },
};

export const followsApi = {
  async getFollowingUserIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followerUid', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().followingUid ?? ''))
      .filter(Boolean);
  },

  async getFollowerCount(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    if (!firebaseEnabled) {
      return 0;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followingUid', '==', userId)),
    );

    return snapshot.size;
  },

  async getFollowingCount(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    if (!firebaseEnabled) {
      return 0;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followerUid', '==', userId)),
    );

    return snapshot.size;
  },

  async isFollowing(followerUid: string, followingUid: string): Promise<boolean> {
    if (!followerUid || !followingUid) {
      return false;
    }

    if (!firebaseEnabled) {
      return false;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.userFollows, `${followerUid}_${followingUid}`));
    return snapshot.exists();
  },

  async toggleFollow(followerUid: string, followingUid: string): Promise<{ following: boolean }> {
    if (!followerUid) {
      throw new Error('Log in to follow creators.');
    }

    if (!followingUid || followerUid === followingUid) {
      throw new Error('Invalid follow target.');
    }

    if (!firebaseEnabled) {
      return { following: true };
    }

    const firestore = requireDb();
    const followRef = doc(firestore, COLLECTIONS.userFollows, `${followerUid}_${followingUid}`);
    const followSnapshot = await getDoc(followRef);

    if (followSnapshot.exists()) {
      await deleteDoc(followRef);
      return { following: false };
    }

    await setDoc(followRef, {
      followerUid,
      followingUid,
      createdAt: new Date(),
    });

    try {
      const follower = await getUserByUid(followerUid);
      const followerHandle = follower?.handle || 'creator';
      await createNotification({
        userId: followingUid,
        type: 'follow',
        fromUid: followerUid,
        fromHandle: followerHandle,
        fromAvatar: follower?.avatarUrl,
        message: `@${followerHandle} started following you`,
      });
    } catch (error) {
      console.error('Could not enqueue follow notification:', error);
    }

    return { following: true };
  },
};

export const promptsApi = {
  async getFeedPrompts(): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.prompts),
        orderBy('createdAt', 'desc'),
        limit(QUERY_LIMITS.feedPrompts),
      ),
    );
    return snapshot.docs.map((entry) => deserializePrompt(entry.id, entry.data() as Record<string, unknown>));
  },

  async getPromptById(promptId: string): Promise<Prompt | null> {
    if (!promptId) {
      return null;
    }

    if (!firebaseEnabled) {
      const prompt = mockPrompts.find((entry) => entry.id === promptId) ?? null;
      return prompt ? clonePrompt(prompt) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.prompts, promptId));
    if (!snapshot.exists()) {
      return null;
    }

    return deserializePrompt(snapshot.id, snapshot.data() as Record<string, unknown>);
  },

  async getPromptsByAuthorUid(authorUid: string): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.prompts),
        where('authorUid', '==', authorUid),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializePrompt(entry.id, entry.data() as Record<string, unknown>));
  },

  async createPrompt(input: PromptCreateInput): Promise<Prompt> {
    const author = (await getUserByUid(input.authorUid)) ?? mockUsers.find((user) => user.uid === input.authorUid) ?? null;

    if (!author) {
      throw new Error(`Could not find author "${input.authorUid}" for prompt creation.`);
    }

    const prompt: Prompt = {
      id: crypto.randomUUID(),
      authorUid: author.uid,
      authorHandle: author.handle,
      authorAvatar: author.avatarUrl,
      videoUrl: input.videoUrl ?? '',
      thumbnailUrl: input.thumbnailUrl ?? '',
      mediaWidth: input.mediaWidth,
      mediaHeight: input.mediaHeight,
      promptText: input.promptText,
      model: input.model,
      contentType: input.contentType,
      aspectRatio: input.aspectRatio ?? 'landscape',
      styleTags: input.styleTags,
      cameraNotes: input.cameraNotes,
      moodLabel: input.moodLabel,
      difficulty: input.difficulty,
      likes: 0,
      saves: 0,
      copies: 0,
      forks: 0,
      isForked: false,
      forkedFromId: null,
      forkedFromAuthorHandle: null,
      onchainAttributionId: undefined,
      onchainAttributionTxDigest: undefined,
      walrusContentBlobId: input.walrusContentBlobId,
      walrusMetadataBlobId: input.walrusMetadataBlobId,
      createdAt: new Date(),
    };

    if (!firebaseEnabled) {
      return clonePrompt(prompt);
    }

    const firestore = requireDb();
    const promptDocument = { ...prompt } as Omit<Prompt, 'id'> & { id?: string };
    delete promptDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.prompts), {
      ...stripUndefinedFields(promptDocument),
    });

    return {
      ...prompt,
      id: created.id,
    };
  },

  async getLikedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptLikes), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async getSavedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptSaves), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async getCopiedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptCopies), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async recordCopy(promptId: string, userId: string): Promise<{ counted: boolean; copies: number }> {
    if (!userId) {
      throw new Error('Log in to copy prompts.');
    }

    if (!firebaseEnabled) {
      return { counted: true, copies: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const copyRef = doc(firestore, COLLECTIONS.promptCopies, `${promptId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, copySnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(copyRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const currentCopies = Number(promptSnapshot.data().copies ?? 0);
      if (copySnapshot.exists()) {
        return {
          counted: false,
          copies: currentCopies,
        };
      }

      transaction.set(copyRef, {
        promptId,
        userId,
        authorUid: String(promptSnapshot.data().authorUid ?? ''),
        createdAt: new Date(),
      });
      transaction.update(promptRef, { copies: currentCopies + 1 });
      return {
        counted: true,
        copies: currentCopies + 1,
      };
    });
  },

  async toggleLike(promptId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
    if (!userId) {
      throw new Error('Log in to like prompts.');
    }

    if (!firebaseEnabled) {
      return { liked: true, likes: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const likeRef = doc(firestore, COLLECTIONS.promptLikes, `${promptId}_${userId}`);

    const result = await runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(likeRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const promptData = promptSnapshot.data();
      const currentLikes = Number(promptSnapshot.data().likes ?? 0);
      const authorUid = String(promptData.authorUid ?? '');

      if (likeSnapshot.exists()) {
        transaction.delete(likeRef);
        transaction.update(promptRef, { likes: Math.max(0, currentLikes - 1) });
        return {
          liked: false,
          likes: Math.max(0, currentLikes - 1),
          authorUid,
        };
      }

      transaction.set(likeRef, {
        promptId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(promptRef, { likes: currentLikes + 1 });

      return {
        liked: true,
        likes: currentLikes + 1,
        authorUid,
      };
    });

    if (result.liked && result.authorUid && result.authorUid !== userId) {
      try {
        const actor = await getUserByUid(userId);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: result.authorUid,
          type: 'like',
          fromUid: userId,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          promptId,
          message: `@${actorHandle} liked your prompt`,
        });
      } catch (error) {
        console.error('Could not enqueue prompt-like notification:', error);
      }
    }

    return {
      liked: result.liked,
      likes: result.likes,
    };
  },

  async toggleSave(promptId: string, userId: string): Promise<{ saved: boolean; saves: number }> {
    if (!userId) {
      throw new Error('Log in to save prompts.');
    }

    if (!firebaseEnabled) {
      return { saved: true, saves: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const saveRef = doc(firestore, COLLECTIONS.promptSaves, `${promptId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, saveSnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(saveRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const currentSaves = Number(promptSnapshot.data().saves ?? 0);

      if (saveSnapshot.exists()) {
        transaction.delete(saveRef);
        transaction.update(promptRef, { saves: Math.max(0, currentSaves - 1) });
        return {
          saved: false,
          saves: Math.max(0, currentSaves - 1),
        };
      }

      transaction.set(saveRef, {
        promptId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(promptRef, { saves: currentSaves + 1 });
      return {
        saved: true,
        saves: currentSaves + 1,
      };
    });
  },

  async deletePrompt(promptId: string, userId: string): Promise<void> {
    if (!userId) {
      throw new Error('Log in to delete prompts.');
    }

    if (!firebaseEnabled) {
      return;
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const promptSnapshot = await getDoc(promptRef);

    if (!promptSnapshot.exists()) {
      throw new Error('Prompt not found.');
    }

    const promptData = promptSnapshot.data() as Record<string, unknown>;
    if (String(promptData.authorUid ?? '') !== userId) {
      throw new Error('Only the author can delete this prompt.');
    }

    // Walrus blobs are immutable and content-addressed; they expire when their
    // paid epochs lapse. Removing the Firestore record is sufficient — there
    // is no client-side delete call to make. We log the orphaned blob ids for
    // visibility / future cleanup via owned Sui blob objects.
    const orphanedBlobIds = [
      extractWalrusBlobIdFromUrlSafe(promptData.videoUrl),
      extractWalrusBlobIdFromUrlSafe(promptData.thumbnailUrl),
    ].filter((entry): entry is string => Boolean(entry));

    if (orphanedBlobIds.length > 0) {
      console.info('[walrus] orphaned blob ids after prompt delete', orphanedBlobIds);
    }

    const [likeSnapshots, saveSnapshots, copySnapshots] = await Promise.all([
      getDocs(
        query(collection(firestore, COLLECTIONS.promptLikes), where('promptId', '==', promptId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.promptSaves), where('promptId', '==', promptId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.promptCopies), where('promptId', '==', promptId)),
      ),
    ]);

    await Promise.all([
      ...likeSnapshots.docs.map((likeDoc) => deleteDoc(likeDoc.ref)),
      ...saveSnapshots.docs.map((saveDoc) => deleteDoc(saveDoc.ref)),
      ...copySnapshots.docs.map((copyDoc) => deleteDoc(copyDoc.ref)),
    ]);
    await deleteDoc(promptRef);
  },

  async forkPrompt(input: ForkPromptInput): Promise<Prompt> {
    const sourcePrompt = firebaseEnabled
      ? await (async () => {
          const firestore = requireDb();
          const snapshot = await getDoc(doc(firestore, COLLECTIONS.prompts, input.sourcePromptId));
          return snapshot.exists()
            ? deserializePrompt(snapshot.id, snapshot.data() as Record<string, unknown>)
            : null;
        })()
      : (mockPrompts.find((prompt) => prompt.id === input.sourcePromptId) ?? null);

    if (!sourcePrompt) {
      throw new Error(`Could not find prompt "${input.sourcePromptId}" to fork.`);
    }

    const forked = await this.createPrompt({
      authorUid: input.authorUid,
      promptText: input.promptText,
      model: input.model,
      styleTags: input.styleTags,
      cameraNotes: sourcePrompt.cameraNotes,
      moodLabel: input.moodLabel,
      difficulty: sourcePrompt.difficulty,
      contentType: sourcePrompt.contentType,
      aspectRatio: input.aspectRatio ?? sourcePrompt.aspectRatio,
      videoUrl: input.videoUrl ?? sourcePrompt.videoUrl,
      thumbnailUrl: input.thumbnailUrl ?? sourcePrompt.thumbnailUrl,
      mediaWidth: input.mediaWidth ?? sourcePrompt.mediaWidth,
      mediaHeight: input.mediaHeight ?? sourcePrompt.mediaHeight,
      walrusContentBlobId: input.walrusContentBlobId ?? sourcePrompt.walrusContentBlobId,
      walrusMetadataBlobId: input.walrusMetadataBlobId ?? sourcePrompt.walrusMetadataBlobId,
    });

    const result: Prompt = {
      ...forked,
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    };

    if (!firebaseEnabled) {
      const sourcePromptInMock = mockPrompts.find((prompt) => prompt.id === sourcePrompt.id);
      if (sourcePromptInMock) {
        sourcePromptInMock.forks += 1;
      }

      if (sourcePrompt.authorUid !== input.authorUid) {
        try {
          const actor = await getUserByUid(input.authorUid);
          const actorHandle = actor?.handle || 'creator';
          await createNotification({
            userId: sourcePrompt.authorUid,
            type: 'fork',
            fromUid: input.authorUid,
            fromHandle: actorHandle,
            fromAvatar: actor?.avatarUrl,
            promptId: sourcePrompt.id,
            message: `@${actorHandle} forked your prompt`,
          });
        } catch (error) {
          console.error('Could not enqueue fork notification:', error);
        }
      }
      return result;
    }

    const firestore = requireDb();
    await updateDoc(doc(firestore, COLLECTIONS.prompts, result.id), {
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    });

    if (sourcePrompt.authorUid !== input.authorUid) {
      try {
        const actor = await getUserByUid(input.authorUid);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: sourcePrompt.authorUid,
          type: 'fork',
          fromUid: input.authorUid,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          promptId: sourcePrompt.id,
          message: `@${actorHandle} forked your prompt`,
        });
      } catch (error) {
        console.error('Could not enqueue fork notification:', error);
      }
    }

    return result;
  },

  async updateOnchainAttribution(
    promptId: string,
    userId: string,
    input: {
      onchainAttributionId?: string | null;
      onchainAttributionTxDigest?: string | null;
      walrusContentBlobId?: string | null;
      walrusMetadataBlobId?: string | null;
    },
  ): Promise<void> {
    if (!promptId || !userId) {
      return;
    }

    const updates = stripUndefinedFields({
      onchainAttributionId: input.onchainAttributionId || undefined,
      onchainAttributionTxDigest: input.onchainAttributionTxDigest || undefined,
      walrusContentBlobId: input.walrusContentBlobId || undefined,
      walrusMetadataBlobId: input.walrusMetadataBlobId || undefined,
    });

    if (Object.keys(updates).length === 0) {
      return;
    }

    if (!firebaseEnabled) {
      const target = mockPrompts.find((prompt) => prompt.id === promptId && prompt.authorUid === userId);
      if (target) {
        Object.assign(target, updates);
      }
      return;
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const snapshot = await getDoc(promptRef);
    if (!snapshot.exists()) {
      throw new Error('Prompt not found.');
    }
    if (String(snapshot.data().authorUid ?? '') !== userId) {
      throw new Error('Only the author can attach attribution metadata.');
    }

    await updateDoc(promptRef, updates);
  },
};

export const workflowsApi = {
  async getFeedWorkflows(): Promise<Workflow[]> {
    if (!firebaseEnabled) {
      return mockWorkflows.map(cloneWorkflow);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.workflows),
        orderBy('createdAt', 'desc'),
        limit(QUERY_LIMITS.feedWorkflows),
      ),
    );
    return snapshot.docs.map((entry) => deserializeWorkflow(entry.id, entry.data() as Record<string, unknown>));
  },

  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    if (!firebaseEnabled) {
      const workflow = mockWorkflows.find((entry) => entry.id === workflowId) ?? null;
      return workflow ? cloneWorkflow(workflow) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.workflows, workflowId));
    if (!snapshot.exists()) {
      return null;
    }
    return deserializeWorkflow(snapshot.id, snapshot.data() as Record<string, unknown>);
  },

  async createWorkflow(input: WorkflowCreateInput): Promise<Workflow> {
    const author = (await getUserByUid(input.authorUid)) ?? mockUsers.find((user) => user.uid === input.authorUid) ?? null;

    if (!author) {
      throw new Error(`Could not find author "${input.authorUid}" for workflow creation.`);
    }

    const workflow: Workflow = {
      id: crypto.randomUUID(),
      authorUid: author.uid,
      authorHandle: author.handle,
      authorAvatar: author.avatarUrl,
      title: input.title.trim(),
      tool: input.tool.trim(),
      description: input.description.trim(),
      coverVideoUrl: input.coverVideoUrl,
      coverThumbnailUrl: input.coverThumbnailUrl,
      tags: input.tags,
      stepCount: input.steps.length,
      likes: 0,
      saves: 0,
      mediaAspectRatio: input.mediaAspectRatio ?? 'landscape',
      createdAt: new Date(),
      steps: input.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        stepNumber: index + 1,
        label: step.label.trim() || `Step ${index + 1}`,
        model: step.model.trim() || input.tool.trim(),
        generationType: step.generationType,
        promptText: step.promptText?.trim() || undefined,
        note: step.note?.trim() || undefined,
        inputImageUrl: step.inputImageUrl,
        ingredientsImageUrls: step.ingredientsImageUrls,
        startFrameUrl: step.startFrameUrl,
        endFrameUrl: step.endFrameUrl,
        resultMediaUrl: step.resultMediaUrl,
        resultThumbnailUrl: step.resultThumbnailUrl,
        resultContentType: step.resultContentType,
      })),
    };

    if (!firebaseEnabled) {
      return cloneWorkflow(workflow);
    }

    const firestore = requireDb();
    const workflowDocument = { ...workflow } as Omit<Workflow, 'id'> & { id?: string };
    delete workflowDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.workflows), {
      ...stripUndefinedFields(workflowDocument),
    });

    return {
      ...workflow,
      id: created.id,
    };
  },

  async getLikedWorkflowIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.workflowLikes), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().workflowId ?? ''))
      .filter(Boolean);
  },

  async getSavedWorkflowIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.workflowSaves), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().workflowId ?? ''))
      .filter(Boolean);
  },

  async toggleLike(workflowId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
    if (!userId) {
      throw new Error('Log in to like workflows.');
    }

    if (!firebaseEnabled) {
      return { liked: true, likes: 0 };
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const likeRef = doc(firestore, COLLECTIONS.workflowLikes, `${workflowId}_${userId}`);

    const result = await runTransaction(firestore, async (transaction) => {
      const [workflowSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(workflowRef),
        transaction.get(likeRef),
      ]);

      if (!workflowSnapshot.exists()) {
        throw new Error('Workflow not found.');
      }

      const workflowData = workflowSnapshot.data();
      const currentLikes = Number(workflowSnapshot.data().likes ?? 0);
      const authorUid = String(workflowData.authorUid ?? '');
      const workflowTitle = String(workflowData.title ?? '');

      if (likeSnapshot.exists()) {
        transaction.delete(likeRef);
        transaction.update(workflowRef, { likes: Math.max(0, currentLikes - 1) });
        return {
          liked: false,
          likes: Math.max(0, currentLikes - 1),
          authorUid,
          workflowTitle,
        };
      }

      transaction.set(likeRef, {
        workflowId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(workflowRef, { likes: currentLikes + 1 });
      return {
        liked: true,
        likes: currentLikes + 1,
        authorUid,
        workflowTitle,
      };
    });

    if (result.liked && result.authorUid && result.authorUid !== userId) {
      try {
        const actor = await getUserByUid(userId);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: result.authorUid,
          type: 'like',
          fromUid: userId,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          workflowId,
          message: result.workflowTitle
            ? `@${actorHandle} liked your workflow "${result.workflowTitle}"`
            : `@${actorHandle} liked your workflow`,
        });
      } catch (error) {
        console.error('Could not enqueue workflow-like notification:', error);
      }
    }

    return {
      liked: result.liked,
      likes: result.likes,
    };
  },

  async toggleSave(workflowId: string, userId: string): Promise<{ saved: boolean; saves: number }> {
    if (!userId) {
      throw new Error('Log in to save workflows.');
    }

    if (!firebaseEnabled) {
      return { saved: true, saves: 0 };
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const saveRef = doc(firestore, COLLECTIONS.workflowSaves, `${workflowId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [workflowSnapshot, saveSnapshot] = await Promise.all([
        transaction.get(workflowRef),
        transaction.get(saveRef),
      ]);

      if (!workflowSnapshot.exists()) {
        throw new Error('Workflow not found.');
      }

      const currentSaves = Number(workflowSnapshot.data().saves ?? 0);

      if (saveSnapshot.exists()) {
        transaction.delete(saveRef);
        transaction.update(workflowRef, { saves: Math.max(0, currentSaves - 1) });
        return {
          saved: false,
          saves: Math.max(0, currentSaves - 1),
        };
      }

      transaction.set(saveRef, {
        workflowId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(workflowRef, { saves: currentSaves + 1 });
      return {
        saved: true,
        saves: currentSaves + 1,
      };
    });
  },

  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    if (!userId) {
      throw new Error('Log in to delete workflows.');
    }

    if (!firebaseEnabled) {
      return;
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const workflowSnapshot = await getDoc(workflowRef);

    if (!workflowSnapshot.exists()) {
      throw new Error('Workflow not found.');
    }

    const workflowData = workflowSnapshot.data() as Record<string, unknown>;
    if (String(workflowData.authorUid ?? '') !== userId) {
      throw new Error('Only the author can delete this workflow.');
    }

    const steps = Array.isArray(workflowData.steps)
      ? workflowData.steps.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object',
        )
      : [];

    const mediaUrls: Array<string | null | undefined> = [
      typeof workflowData.coverVideoUrl === 'string' ? workflowData.coverVideoUrl : undefined,
      typeof workflowData.coverThumbnailUrl === 'string' ? workflowData.coverThumbnailUrl : undefined,
    ];

    for (const step of steps) {
      mediaUrls.push(
        typeof step.inputImageUrl === 'string' ? step.inputImageUrl : undefined,
        ...(Array.isArray(step.ingredientsImageUrls)
          ? step.ingredientsImageUrls.filter((url): url is string => typeof url === 'string')
          : []),
        typeof step.startFrameUrl === 'string' ? step.startFrameUrl : undefined,
        typeof step.endFrameUrl === 'string' ? step.endFrameUrl : undefined,
        typeof step.resultMediaUrl === 'string' ? step.resultMediaUrl : undefined,
        typeof step.resultThumbnailUrl === 'string' ? step.resultThumbnailUrl : undefined,
      );
    }

    await uploadsApi.deletePublicMediaUrls(mediaUrls);

    const [likeSnapshots, saveSnapshots] = await Promise.all([
      getDocs(
        query(collection(firestore, COLLECTIONS.workflowLikes), where('workflowId', '==', workflowId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.workflowSaves), where('workflowId', '==', workflowId)),
      ),
    ]);

    await Promise.all([
      ...likeSnapshots.docs.map((likeDoc) => deleteDoc(likeDoc.ref)),
      ...saveSnapshots.docs.map((saveDoc) => deleteDoc(saveDoc.ref)),
    ]);
    await deleteDoc(workflowRef);
  },
};

export const notificationsApi = {
  async getNotificationsForUser(userId: string): Promise<Notification[]> {
    if (!firebaseEnabled) {
      return mockNotifications.filter((notification) => notification.userId === userId).map(cloneNotification);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.notifications),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializeNotification(entry.id, entry.data() as Record<string, unknown>));
  },

  async markAllRead(userId: string): Promise<void> {
    if (!firebaseEnabled) {
      for (const notification of mockNotifications) {
        if (notification.userId === userId) {
          notification.read = true;
        }
      }
      return;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.notifications), where('userId', '==', userId), where('read', '==', false)),
    );

    await Promise.all(snapshot.docs.map((entry) => updateDoc(doc(firestore, COLLECTIONS.notifications, entry.id), { read: true })));
  },

  async markRead(notificationId: string, userId: string): Promise<void> {
    if (!notificationId || !userId) {
      return;
    }

    if (!firebaseEnabled) {
      const target = mockNotifications.find((entry) => entry.id === notificationId && entry.userId === userId);
      if (target) {
        target.read = true;
      }
      return;
    }

    const firestore = requireDb();
    await updateDoc(doc(firestore, COLLECTIONS.notifications, notificationId), { read: true });
  },
};

export const collectionsApi = {
  async getCollectionsForUser(userId: string): Promise<Collection[]> {
    if (!firebaseEnabled) {
      return mockCollections.filter((entry) => entry.userId === userId).map(cloneCollection);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.collections),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializeCollection(entry.id, entry.data() as Record<string, unknown>));
  },

  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    const collectionItem: Collection = {
      id: crypto.randomUUID(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      count: 0,
      thumbnails: [],
      createdAt: new Date(),
    };

    if (!firebaseEnabled) {
      return cloneCollection(collectionItem);
    }

    const firestore = requireDb();
    const collectionDocument = { ...collectionItem } as Omit<Collection, 'id'> & { id?: string };
    delete collectionDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.collections), {
      ...stripUndefinedFields(collectionDocument),
    });

    return {
      ...collectionItem,
      id: created.id,
    };
  },
};

export const paymentsApi = {
  async recordPaidLike(input: {
    promptId: string;
    payerUid: string;
    creatorUid: string;
    amountMist: string;
    amountSui: string;
    txDigest: string;
    network: PaidLike['network'];
  }): Promise<PaidLike> {
    if (!input.promptId || !input.payerUid || !input.creatorUid || !input.txDigest) {
      throw new Error('Missing payment receipt fields.');
    }

    const paidLike: PaidLike = {
      id: crypto.randomUUID(),
      promptId: input.promptId,
      payerUid: input.payerUid,
      creatorUid: input.creatorUid,
      amountMist: input.amountMist,
      amountSui: input.amountSui,
      currency: 'SUI',
      paymentRail: 'sui',
      txDigest: input.txDigest,
      network: input.network,
      createdAt: new Date(),
    };

    if (!firebaseEnabled) {
      mockPaidLikes.unshift(clonePaidLike(paidLike));
      return clonePaidLike(paidLike);
    }

    const firestore = requireDb();
    const paidLikeDocument = { ...paidLike } as Omit<PaidLike, 'id'> & { id?: string };
    delete paidLikeDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.paidLikes), {
      ...stripUndefinedFields(paidLikeDocument),
    });

    return {
      ...paidLike,
      id: created.id,
    };
  },

  async getPaidLikesForCreator(creatorUid: string): Promise<PaidLike[]> {
    if (!creatorUid) {
      return [];
    }

    if (!firebaseEnabled) {
      return mockPaidLikes
        .filter((entry) => entry.creatorUid === creatorUid)
        .map(clonePaidLike);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.paidLikes),
        where('creatorUid', '==', creatorUid),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializePaidLike(entry.id, entry.data() as Record<string, unknown>));
  },

  async getPaidLikesForPrompt(promptId: string): Promise<PaidLike[]> {
    if (!promptId) {
      return [];
    }

    if (!firebaseEnabled) {
      return mockPaidLikes
        .filter((entry) => entry.promptId === promptId)
        .map(clonePaidLike);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.paidLikes),
        where('promptId', '==', promptId),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializePaidLike(entry.id, entry.data() as Record<string, unknown>));
  },
};

// Media uploads are routed to Walrus (https://docs.wal.app). The publisher
// returns a content-addressed `blobId`; the aggregator URL built from it is
// what we persist in Firestore (Prompt.videoUrl, User.avatarUrl, etc.) so the
// existing UI consumers (<img>, <video>) keep working unchanged.
//
// The return shape preserves `downloadUrl` for backward compatibility and adds
// `blobId` + `size` so future batches (Move attribution, marketplace) can
// anchor the blob onchain without re-uploading.
export const uploadsApi = {
  async uploadPromptMedia(file: File, _userId: string) {
    if (!isWalrusConfigured) {
      throw new Error(
        'Walrus is not configured. Set VITE_WALRUS_NETWORK (testnet | mainnet) — see walrus-integration-guide.md.',
      );
    }

    const result = await walrusPublishBlob(file);
    return {
      path: result.blobId,
      downloadUrl: result.url,
      blobId: result.blobId,
      blobObjectId: result.blobObjectId,
      size: result.size,
    };
  },

  async uploadProfileAvatar(file: File, _userId: string) {
    if (!isWalrusConfigured) {
      throw new Error(
        'Walrus is not configured. Set VITE_WALRUS_NETWORK (testnet | mainnet) — see walrus-integration-guide.md.',
      );
    }

    const result = await walrusPublishBlob(file);
    return {
      path: result.blobId,
      downloadUrl: result.url,
      blobId: result.blobId,
      blobObjectId: result.blobObjectId,
      size: result.size,
    };
  },

  // Walrus blobs are immutable from the client and expire on their own when
  // their paid epochs lapse. This is intentionally a no-op that just logs the
  // orphaned blob ids, so callers don't need conditional logic.
  async deletePublicMediaUrls(urls: Array<string | null | undefined>) {
    const blobIds = Array.from(
      new Set(
        urls
          .map((entry) => extractWalrusBlobIdFromUrl(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    );

    if (blobIds.length > 0) {
      console.info('[walrus] orphaned blob ids (immutable, will expire on epoch lapse)', blobIds);
    }
  },
};
