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

export type DashboardMetricType = 'currency' | 'number' | 'percent';

export type DashboardTrend = 'up' | 'down' | 'flat';

export interface SellerDashboardKpi {
  id: string;
  label: string;
  value: number;
  metricType: DashboardMetricType;
  changePercent: number;
  trend: DashboardTrend;
  sparkline: number[];
}

export interface DashboardSeriesPoint {
  label: string;
  value: number;
}

export interface OrderStatusSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface TopProductPerformance {
  id: string;
  name: string;
  imageUrl: string | null;
  revenue: number;
  sold: number;
}

export interface TrafficSourceSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  accent: 'orange' | 'blue' | 'green' | 'purple' | 'slate';
}

export interface DashboardAlertItem {
  id: string;
  level: 'warning' | 'info' | 'success';
  title: string;
  description: string;
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
  kpis: SellerDashboardKpi[];
  revenueSeries: DashboardSeriesPoint[];
  orderStatus: OrderStatusSlice[];
  topProducts: TopProductPerformance[];
  trafficSources: TrafficSourceSlice[];
  quickActions: QuickActionItem[];
  alerts: DashboardAlertItem[];
  insights: string[];
  news: SellerNewsItem[];
}
