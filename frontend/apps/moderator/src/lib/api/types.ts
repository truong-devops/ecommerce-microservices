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
  mfaCode?: string;
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
  sellerId: string;
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
