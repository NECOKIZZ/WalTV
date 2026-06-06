export interface UserLinks {
  x?: string;
  instagram?: string;
  youtube?: string;
  website?: string;
}

export interface User {
  // The user's Sui address, derived via zkLogin from their Google OAuth
  // identity. This IS the user's primary identity in WalTube \u2014 there is no
  // separate Firebase uid layer. Sui addresses are lowercase, 66 chars
  // (0x + 64 hex). The Firestore doc id matches this exactly.
  uid: string;
  // Same as `uid` for users created via zkLogin. Kept as a distinct field for
  // readability in code that specifically signals onchain identity (tipping,
  // attribution, etc.). Optional only because mock-data users have no Sui
  // address; every real user from Firestore has it populated.
  suiAddress?: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  // Optional email, populated from the Google id_token on first sign-in.
  // Never used for auth or recovery \u2014 just for display / outreach.
  email?: string;
  bio: string;
  links: UserLinks;
  primaryModels: string[];
  followers: number;
  following: number;
  totalCopies: number;
  totalPrompts: number;
  // False until the user finishes the onboarding flow (picks handle, AI tools, follows).
  hasOnboarded?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

export type PromptContentType = 'image' | 'video';
export type PromptAspectRatio = 'portrait' | 'landscape';

export interface Prompt {
  id: string;
  authorUid: string;
  authorHandle: string;
  authorAvatar: string;
  videoUrl: string;
  thumbnailUrl: string;
  mediaWidth?: number;
  mediaHeight?: number;
  promptText: string;
  model: string;
  contentType: PromptContentType;
  aspectRatio?: PromptAspectRatio;
  styleTags: string[];
  cameraNotes: string;
  moodLabel: string;
  difficulty: string;
  likes: number;
  saves: number;
  copies: number;
  forks: number;
  isForked: boolean;
  forkedFromId: string | null;
  forkedFromAuthorHandle: string | null;
  onchainAttributionId?: string;
  onchainAttributionTxDigest?: string;
  walrusContentBlobId?: string;
  walrusMetadataBlobId?: string;
  createdAt: Date;
}

export type WorkflowGenerationType =
  | 'prompt_to_video'
  | 'image_to_video'
  | 'frames_to_video'
  | 'prompt_to_image'
  | 'ingredients';

export interface WorkflowStep {
  id: string;
  stepNumber: number;
  label: string;
  model: string;
  generationType: WorkflowGenerationType;
  promptText?: string;
  note?: string;
  inputImageUrl?: string;
  ingredientsImageUrls?: string[];
  startFrameUrl?: string;
  endFrameUrl?: string;
  resultMediaUrl: string;
  resultThumbnailUrl: string;
  resultContentType: PromptContentType;
}

export interface Workflow {
  id: string;
  authorUid: string;
  authorHandle: string;
  authorAvatar: string;
  title: string;
  tool: string;
  description: string;
  coverVideoUrl: string;
  coverThumbnailUrl: string;
  tags: string[];
  stepCount: number;
  likes: number;
  saves: number;
  mediaAspectRatio: PromptAspectRatio;
  createdAt: Date;
  steps: WorkflowStep[];
}

export interface WorkflowStepCreateInput {
  label: string;
  model: string;
  generationType: WorkflowGenerationType;
  promptText?: string;
  note?: string;
  inputImageUrl?: string;
  ingredientsImageUrls?: string[];
  startFrameUrl?: string;
  endFrameUrl?: string;
  resultMediaUrl: string;
  resultThumbnailUrl: string;
  resultContentType: PromptContentType;
}

export interface WorkflowCreateInput {
  authorUid: string;
  title: string;
  tool: string;
  description: string;
  coverVideoUrl: string;
  coverThumbnailUrl: string;
  tags: string[];
  mediaAspectRatio?: PromptAspectRatio;
  steps: WorkflowStepCreateInput[];
}

export type NotificationType =
  | 'follow'
  | 'like'
  | 'copy'
  | 'fork'
  | 'chain_fork'
  | 'rating'
  | 'weekly_digest';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  fromUid: string;
  fromHandle: string;
  fromAvatar?: string;
  promptId?: string;
  workflowId?: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  description?: string;
  count: number;
  thumbnails: string[];
  createdAt: Date;
}

export interface PaidLike {
  id: string;
  promptId: string;
  payerUid: string;
  creatorUid: string;
  amountMist: string;
  amountSui: string;
  currency: 'SUI';
  paymentRail: 'sui';
  txDigest: string;
  network: 'testnet' | 'mainnet' | 'devnet';
  createdAt: Date;
}

export interface PromptCreateInput {
  authorUid: string;
  promptText: string;
  model: string;
  styleTags: string[];
  cameraNotes: string;
  moodLabel: string;
  difficulty: string;
  contentType: PromptContentType;
  aspectRatio?: PromptAspectRatio;
  videoUrl?: string;
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  walrusContentBlobId?: string;
  walrusMetadataBlobId?: string;
}

export interface ForkPromptInput {
  sourcePromptId: string;
  authorUid: string;
  promptText: string;
  model: string;
  styleTags: string[];
  moodLabel: string;
  aspectRatio?: PromptAspectRatio;
  mediaWidth?: number;
  mediaHeight?: number;
  thumbnailUrl?: string;
  videoUrl?: string;
  walrusContentBlobId?: string;
  walrusMetadataBlobId?: string;
}

export interface CreateCollectionInput {
  userId: string;
  name: string;
  description?: string;
}

export const availableStyleTags = [
  'cinematic',
  'aerial',
  'slowmo',
  'abstract',
  'nature',
  'motion',
  'surreal',
  'urban',
  'macro',
  'timelapse',
  'fashion',
  'neon',
] as const;

export const availableModels = ['Sora', 'Runway', 'Kling', 'Pika', 'Hailuo', 'NanoBanana', 'Other'] as const;

export const availableMoodLabels = [
  'Cinematic',
  'Surreal',
  'Abstract',
  'Naturalistic',
  'Dramatic',
  'Minimal',
  'Energetic',
] as const;

export const difficultyLevels = ['Beginner', 'Intermediate', 'Advanced'] as const;
