export enum Role {
  BUYER = 'BUYER',
  CUSTOMER = 'CUSTOMER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  SUPPORT = 'SUPPORT',
  SUPER_ADMIN = 'SUPER_ADMIN'
}

export const STAFF_ROLES: Role[] = [Role.ADMIN, Role.MODERATOR, Role.SUPPORT, Role.SUPER_ADMIN];
export const SELLER_ROLES: Role[] = [Role.SELLER];
export const BUYER_ROLES: Role[] = [Role.BUYER, Role.CUSTOMER];
