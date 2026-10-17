export interface ModeratorApiMeta {
  source: 'backend';
  timestamp: string;
}

export interface ModeratorApiSuccess<T> {
  success: true;
  data: T;
  meta: ModeratorApiMeta;
}

export interface ModeratorApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export type ModeratorApiResponse<T> = ModeratorApiSuccess<T> | ModeratorApiFailure;

export interface ModeratorAuthUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface ModeratorAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  session: ModeratorAuthSession;
  user: ModeratorAuthUser;
}

export interface MeOutput {
  user: ModeratorAuthUser;
}

export interface LogoutInput {
  accessToken: string;
  refreshToken: string;
}

export type ModerationProductStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

export interface ModerationProductVariant {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface ModerationProduct {
  id: string;
  productCode: string;
  sellerId: string;
  sellerCode: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ModerationProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: ModerationProductVariant[];
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ModerationListOutput {
  items: ModerationProduct[];
  page: number;
  pageSize: number;
  hasNext: boolean;
  totalItems: number;
  totalPages: number;
}

export interface UpdateModerationProductStatusInput {
  status: ModerationProductStatus;
  reason?: string;
}

export type ModerationVideoStatus = 'draft' | 'processing' | 'review_pending' | 'published' | 'hidden' | 'rejected' | 'archived';

export interface ModerationVideoProduct {
  productId: string;
  name: string;
  image: string | null;
  price: number;
  currency: string;
  status: string;
}

export interface ModerationVideo {
  videoId: string;
  sellerId: string;
  title: string;
  description: string | null;
  status: ModerationVideoStatus;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  products: ModerationVideoProduct[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationVideoListOutput {
  items: ModerationVideo[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ChatViolationSignal {
  ruleId: string;
  score: number;
  evidenceType: string;
}

export interface ChatViolation {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  ruleId: string;
  score: number;
  signals: ChatViolationSignal[];
  textPreview: string;
  createdAt: string;
}

export interface ChatViolationListOutput {
  items: ChatViolation[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export type BankAccountStatus = 'UNVERIFIED' | 'ALLOWLISTED' | 'DISABLED';
export type PayoutStatus = 'REQUESTED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface AdminBankAccount {
  id: string;
  bankCode: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  status: BankAccountStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWallet {
  id: string;
  sellerId: string;
  currency: string;
  heldAmount: number;
  availableAmount: number;
  payoutPendingAmount: number;
  totalPaidOut: number;
  isFrozen: boolean;
  bankAccount?: AdminBankAccount;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWalletSummary {
  totalWallets: number;
  frozenWallets: number;
  unverifiedBankAccounts: number;
  disabledBankAccounts: number;
  pendingPayouts: number;
  heldAmount: number;
  availableAmount: number;
  payoutPendingAmount: number;
  totalPaidOut: number;
}

export interface WalletTransaction {
  id: string;
  type: string;
  referenceType: string;
  referenceId: string;
  amount: number;
  currency: string;
  description?: string;
  occurredAt: string;
  createdAt: string;
}

export interface AdminPayout {
  id: string;
  walletId: string;
  sellerId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  bankCode: string;
  accountHolderName: string;
  maskedAccountNumber: string;
  provider?: string;
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  requestedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletAuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  walletId: string;
  bankAccountId?: string;
  previousStatus?: string;
  newStatus?: string;
  reason: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedOutput<T> {
  items: T[];
  pagination: Pagination;
}
