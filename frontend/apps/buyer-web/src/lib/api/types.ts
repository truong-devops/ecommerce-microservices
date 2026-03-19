export interface FlashSaleItem {
  id: string;
  name: string;
  price: number;
  discountPercent: number;
  soldLabel: string;
  image: string;
}

export interface MallDealItem {
  id: string;
  brand: string;
  title: string;
  image: string;
}

export interface TopSearchItem {
  id: string;
  name: string;
  soldPerMonth: string;
  image: string;
}

export interface ProductItem {
  id: string;
  title: string;
  price: number;
  sold: string;
  discountPercent: number;
  image: string;
}

export interface BuyerApiMeta {
  source: 'backend';
  timestamp: string;
}

export interface BuyerApiSuccess<T> {
  success: true;
  data: T;
  meta: BuyerApiMeta;
}

export interface BuyerApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export type BuyerApiResponse<T> = BuyerApiSuccess<T> | BuyerApiFailure;

export interface HomeSectionsData {
  keywords: string[];
  flashSaleItems: FlashSaleItem[];
  mallDeals: MallDealItem[];
  topSearchItems: TopSearchItem[];
  recommendationProducts: ProductItem[];
}

export interface BuyerAuthUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface BuyerAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  role?: 'CUSTOMER' | 'SELLER';
}

export interface RegisterOutput {
  userId: string;
  email: string;
  role: string;
  emailVerificationRequired: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginOutput {
  session: BuyerAuthSession;
  user: BuyerAuthUser;
}

export interface LogoutInput {
  accessToken: string;
  refreshToken: string;
}

export interface MeOutput {
  user: BuyerAuthUser;
}
