export interface UserSummary {
  id: string;
  email: string;
  role: 'buyer' | 'seller' | 'admin';
}
