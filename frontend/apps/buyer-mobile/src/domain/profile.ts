import type { BuyerProfile, UpdateBuyerProfileInput } from '@frontend/buyer-contracts';

const phonePattern = /^\+?[1-9]\d{7,14}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

interface UpstreamProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  address?: string | null;
  addressProvince?: string | null;
  addressProvinceCode?: string | null;
  addressWard?: string | null;
  addressWardCode?: string | null;
  gender?: BuyerProfile['gender'] | null;
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function normalizeProfile(profile: UpstreamProfile): BuyerProfile {
  const firstName = profile.firstName?.trim() ?? '';
  const lastName = profile.lastName?.trim() ?? '';
  return {
    id: profile.id,
    email: profile.email,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone: profile.phone?.trim() ?? '',
    address: profile.address?.trim() ?? '',
    addressProvince: profile.addressProvince?.trim() ?? '',
    addressProvinceCode: profile.addressProvinceCode?.trim() ?? '',
    addressWard: profile.addressWard?.trim() ?? '',
    addressWardCode: profile.addressWardCode?.trim() ?? '',
    gender: profile.gender ?? 'unspecified',
    dateOfBirth: profile.dateOfBirth ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

export function validateProfileInput(input: UpdateBuyerProfileInput): Record<string, string | null> {
  const name = input.name?.trim() ?? '';
  if (!name || name.length > 200) {
    throw new Error('Họ tên phải có từ 1 đến 200 ký tự');
  }
  const phone = input.phone?.trim() ?? '';
  if (!phonePattern.test(phone)) {
    throw new Error('Số điện thoại phải ở định dạng quốc tế');
  }
  const address = input.address?.trim() ?? '';
  if (!address || address.length > 255) {
    throw new Error('Địa chỉ phải có từ 1 đến 255 ký tự');
  }
  const addressProvince = input.addressProvince?.trim() ?? '';
  const addressProvinceCode = input.addressProvinceCode?.trim() ?? '';
  const addressWard = input.addressWard?.trim() ?? '';
  const addressWardCode = input.addressWardCode?.trim() ?? '';
  if (!addressProvince || !addressProvinceCode) {
    throw new Error('Vui lòng chọn tỉnh/thành phố giao hàng');
  }
  if (!addressWard || !addressWardCode) {
    throw new Error('Vui lòng chọn phường/xã giao hàng');
  }
  const dateOfBirth = input.dateOfBirth?.trim() || null;
  if (dateOfBirth && (!datePattern.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth)))) {
    throw new Error('Ngày sinh phải theo định dạng YYYY-MM-DD');
  }
  const parts = name.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || parts[0],
    phone,
    address,
    addressProvince,
    addressProvinceCode,
    addressWard,
    addressWardCode,
    gender: input.gender ?? 'unspecified',
    dateOfBirth,
    avatarUrl: input.avatarUrl?.trim() || null
  };
}
