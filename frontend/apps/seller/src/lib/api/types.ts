export interface SellerApiMeta {
  source: 'backend';
  timestamp: string;
}

export interface SellerApiSuccess<T> {
  success: true;
  data: T;
  meta: SellerApiMeta;
}

export interface SellerApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export type SellerApiResponse<T> = SellerApiSuccess<T> | SellerApiFailure;

export interface SellerAuthUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface SellerAuthSession {
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
  session: SellerAuthSession;
  user: SellerAuthUser;
}

export interface MeOutput {
  user: SellerAuthUser;
}

export interface LogoutInput {
  accessToken: string;
  refreshToken: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardKpis {
  waitingForPickup: number;
  processedOrders: number;
  returnOrCancelledOrders: number;
  lockedProducts: number;
}

export interface SalesAnalysis {
  revenue: number;
  visits: number;
  clicks: number;
  orders: number;
  conversionRate: number;
}

export interface RightPanelPerformance {
  uniquePayments: number;
  uniqueShipments: number;
  refundedAmount: number;
}

export interface HighlightModule {
  title: string;
  subtitle: string;
  primaryValue: number;
  secondaryValue: number;
  unit?: string;
}

export interface SellerNewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  eventType: string | null;
  status: string;
  createdAt: string;
}

export interface SellerDashboardData {
  dateRange: DateRange;
  kpis: DashboardKpis;
  salesAnalysis: SalesAnalysis;
  performance: RightPanelPerformance;
  displayService: HighlightModule;
  kolAffiliate: HighlightModule;
  livestream: HighlightModule;
  campaign: {
    totalCampaigns: number;
    recent: SellerNewsItem[];
  };
  suggestions: string[];
  news: SellerNewsItem[];
}
