import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LanguageCode, languageOptions, localePacks } from '../../constants/i18n';
import { isTokenInvalidMessage, refreshAccessToken } from '../../services/auth-service';
import { addItemToCart, fetchMyCart, updateCartItemQuantity } from '../../services/cart-service';
import { createCustomerOrder } from '../../services/order-service';
import { fetchPublicProducts } from '../../services/product-service';
import { homeStyles } from '../../styles/home-styles';
import { LoginUser } from '../../types/auth';
import { CartSnapshot } from '../../types/cart';
import { ProductItem, ProductVariant } from '../../types/product';

interface BuyerHomeProps {
  user: LoginUser | null;
  onLogout: () => Promise<void>;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
}

interface NoticeState {
  type: 'idle' | 'success' | 'error';
  message: string;
}

type HomeView = 'search' | 'mall' | 'live' | 'detail' | 'cart' | 'notice' | 'user';
type SortMode = 'relevant' | 'newest' | 'bestseller' | 'price';
type MobileTabKey = 'home' | 'mall' | 'live' | 'notice' | 'user';

interface ProductCardView {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: string;
  sold: string;
  soldCount: number;
  createdAtMs: number;
  category: 'perfume' | 'beauty' | 'fashion' | 'home';
  city: 'hcm' | 'hanoi' | 'danang';
  rating: number;
  shopName: string;
  product?: ProductItem;
}

type ProductTheme = 'perfume' | 'skincare' | 'audio' | 'laptop' | 'fashion' | 'home';

interface DisplayProductData {
  name: string;
  description: string;
  images: string[];
  shopName: string;
  category: ProductCardView['category'];
}

interface CommerceCopy {
  addToCart: string;
  addingToCart: string;
  viewDetail: string;
  detailTitle: string;
  detailFallback: string;
  customerOnlyCart: string;
  cartLoadFailedPrefix: string;
  addToCartSuccessPrefix: string;
  addToCartFailedPrefix: string;
  cartTitle: string;
  cartEmpty: string;
  cartLabelPrefix: string;
  quantity: string;
  remove: string;
  subtotal: string;
  total: string;
  cartLoginRequired: string;
  cartUpdated: string;
  searchResultFor: string;
  filterTitle: string;
  sortBy: string;
  sortRelevant: string;
  sortNewest: string;
  sortBestSeller: string;
  sortPrice: string;
  relatedShop: string;
  viewShop: string;
  backToSearch: string;
  buyNow: string;
  placingOrder: string;
  checkoutAll: string;
  checkoutEmpty: string;
  pleaseSignInCart: string;
  goToSignIn: string;
  orderPlacedPrefix: string;
  sessionExpired: string;
  noSearchResultTitle: string;
  noSearchResultHint: string;
  chatWithSeller: string;
  chatTitle: string;
  chatPlaceholder: string;
  chatSend: string;
  chatGreeting: string;
  allFilter: string;
}

const categoryItems = [
  'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=220&q=60',
  'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=220&q=60'
];

const heroBanners = {
  main: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1280&q=80',
  sideTop: 'https://images.unsplash.com/photo-1607082350920-b676f0a38fba?auto=format&fit=crop&w=640&q=80',
  sideBottom: 'https://images.unsplash.com/photo-1607082352121-fa243f3dde32?auto=format&fit=crop&w=640&q=80'
};

const fallbackImages = [
  'https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1608571423539-e951a8f4a5a9?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=420&q=60',
  'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=420&q=60'
];

const initialNotice: NoticeState = { type: 'idle', message: '' };
const sessionStorageKeys = ['buyerAccessToken', 'buyerRefreshToken', 'buyerUser'] as const;
const mobileTabs: {
  key: MobileTabKey;
  view: HomeView;
  icon: string;
  iconActive: string;
}[] = [
  { key: 'home', view: 'search', icon: '⌂', iconActive: '⌂' },
  { key: 'mall', view: 'mall', icon: '▦', iconActive: '▣' },
  { key: 'live', view: 'live', icon: '▷', iconActive: '▶' },
  { key: 'notice', view: 'notice', icon: '◌', iconActive: '●' },
  { key: 'user', view: 'user', icon: '◯', iconActive: '⬤' }
];

const defaultProfileDraft: UserProfileDraft = {
  displayName: 'guest_user',
  bio: 'Shopper moi, thich deal hot va livestream.',
  location: 'Ho Chi Minh City',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=220&q=60'
};

const demoLiveSessions = [
  {
    id: 'live-1',
    host: 'Epay Beauty Mall',
    title: 'Flash sale my pham - gia soc 60 phut',
    viewers: '12.4k',
    cover: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=640&q=80'
  },
  {
    id: 'live-2',
    host: 'Tech City Mall',
    title: 'Deal tai nghe, loa bluetooth va phu kien',
    viewers: '8.2k',
    cover: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=640&q=80'
  },
  {
    id: 'live-3',
    host: 'Home Living Mall',
    title: 'Livestream do gia dung va decor nha',
    viewers: '5.6k',
    cover: 'https://images.unsplash.com/photo-1556909190-eccf4a8bf97a?auto=format&fit=crop&w=640&q=80'
  }
];


interface ChatMessage {
  id: string;
  sender: 'buyer' | 'seller';
  text: string;
}

interface NotificationItem {
  id: string;
  title: string;
  preview: string;
  unread: number;
}

interface CartGroupView {
  sellerId: string;
  shopName: string;
  items: CartSnapshot['items'];
}

interface UserProfileDraft {
  displayName: string;
  bio: string;
  location: string;
  avatarUrl: string;
}

const productThemeAssets: Record<
  ProductTheme,
  {
    namesVi: string[];
    descriptionsVi: string[];
    images: string[];
    shopsVi: string[];
    category: ProductCardView['category'];
  }
> = {
  perfume: {
    namesVi: [
      'Nước Hoa Nữ Hương Dịu Dàng Premium',
      'Nước Hoa Mini 10ml Lưu Hương Lâu',
      'Bộ Nước Hoa Nữ 3 Mùi Thanh Lịch',
      'Nước Hoa Unisex Mùi Gỗ Ấm'
    ],
    descriptionsVi: [
      'Hương thơm nhẹ nhàng, phù hợp đi làm và đi chơi.',
      'Thiết kế nhỏ gọn, tiện mang theo mỗi ngày.',
      'Mùi hương cân bằng giữa ngọt và thanh, độ lưu hương tốt.',
      'Phù hợp nhiều độ tuổi, tạo cảm giác sang trọng.'
    ],
    images: [
      'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1610461888750-10bfc601b874?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Hasaki Việt Nam', 'Amour Perfume', 'Epay Beauty Mall', 'Parfum House'],
    category: 'perfume'
  },
  skincare: {
    namesVi: [
      'Combo Nước Tẩy Trang Dịu Nhẹ 4 Chai',
      'Serum Cấp Ẩm Phục Hồi Da Ban Đêm',
      'Kem Chống Nắng SPF50+ Nâng Tông',
      'Sữa Rửa Mặt Tạo Bọt Sạch Sâu'
    ],
    descriptionsVi: [
      'Công thức lành tính, phù hợp da nhạy cảm.',
      'Bổ sung độ ẩm và hỗ trợ làm dịu da tức thì.',
      'Kết cấu mỏng nhẹ, không bết dính, dùng hằng ngày.',
      'Làm sạch hiệu quả, da vẫn giữ độ mềm mịn.'
    ],
    images: [
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1611080541599-8c6dbde6ed28?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Hasaki Official', 'Epay Skincare', 'Beauty Corner', 'Lumi Cosmetics'],
    category: 'beauty'
  },
  audio: {
    namesVi: [
      'Tai Nghe Bluetooth Chống Ồn Chủ Động',
      'Tai Nghe Không Dây Pin 40 Giờ',
      'Loa Bluetooth Mini Âm Trầm Mạnh',
      'Tai Nghe Chụp Tai Gaming RGB'
    ],
    descriptionsVi: [
      'Âm thanh chi tiết, đeo êm tai, kết nối nhanh.',
      'Micro rõ nét, phù hợp học tập và làm việc online.',
      'Thiết kế hiện đại, hỗ trợ Bluetooth ổn định.',
      'Chất âm cân bằng, trải nghiệm giải trí tốt.'
    ],
    images: [
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f37?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1612444530582-fc66183b16f7?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Audio Center', 'Epay Digital', 'Tech Sound VN', 'Gear Studio'],
    category: 'home'
  },
  laptop: {
    namesVi: [
      'Túi Chống Sốc Laptop 14 inch Cao Cấp',
      'Bàn Phím Cơ Layout 87 Phím',
      'Chuột Không Dây 2.4G Pin Sạc',
      'Hub Chuyển Đổi USB-C Đa Năng'
    ],
    descriptionsVi: [
      'Hoàn thiện chắc chắn, phù hợp dân văn phòng.',
      'Thiết kế tối giản, hỗ trợ thao tác nhanh và chính xác.',
      'Chất liệu bền bỉ, tối ưu cho nhu cầu làm việc.',
      'Phụ kiện tiện lợi, tăng hiệu suất sử dụng laptop.'
    ],
    images: [
      'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Epay Tech Mall', 'Laptop Center', 'Office Gear', 'Bàn Phím Việt'],
    category: 'home'
  },
  fashion: {
    namesVi: [
      'Áo Thun Nam Basic Cotton 4 Chiều',
      'Đầm Dự Tiệc Nữ Form Ôm Thanh Lịch',
      'Giày Sneaker Trắng Đế Êm',
      'Túi Xách Nữ Công Sở Chống Thấm'
    ],
    descriptionsVi: [
      'Chất vải thoáng mát, mặc thoải mái cả ngày.',
      'Form dáng tôn dáng, dễ phối đồ nhiều phong cách.',
      'Đường may tỉ mỉ, bền đẹp theo thời gian.',
      'Thiết kế thời trang, phù hợp đi làm và đi chơi.'
    ],
    images: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Epay Fashion Mall', 'Urban Closet', 'Thời Trang Việt', 'Style Room'],
    category: 'fashion'
  },
  home: {
    namesVi: [
      'Bộ Chăn Ga Cotton Mềm Mại',
      'Máy Xông Tinh Dầu Mini 500ml',
      'Bộ Dụng Cụ Nhà Bếp 7 Món',
      'Đèn Ngủ Trang Trí 3D'
    ],
    descriptionsVi: [
      'Thiết kế tiện dụng, phù hợp nhiều không gian sống.',
      'Hoàn thiện chắc chắn, dễ vệ sinh và bảo quản.',
      'Màu sắc hài hòa, nâng cấp thẩm mỹ cho ngôi nhà.',
      'Phù hợp gia đình trẻ, tối ưu nhu cầu sử dụng hằng ngày.'
    ],
    images: [
      'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1582582621959-48d27397dc69?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80'
    ],
    shopsVi: ['Nhà Xinh Store', 'Epay Home', 'Cozy Living', 'Gia Dụng 24H'],
    category: 'home'
  }
};


function pickByIndex<T>(items: T[], index: number): T {
  return items[index % items.length];
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function detectProductTheme(product: ProductItem): ProductTheme {
  const text = normalizeSearchTerm(`${product.categoryId} ${product.name} ${product.description ?? ''}`);

  if (text.includes('perfume') || text.includes('fragrance') || text.includes('nuoc hoa')) {
    return 'perfume';
  }
  if (
    text.includes('beauty') ||
    text.includes('skin') ||
    text.includes('sunscreen') ||
    text.includes('serum') ||
    text.includes('micellar') ||
    text.includes('cosmetic')
  ) {
    return 'skincare';
  }
  if (text.includes('earbud') || text.includes('headphone') || text.includes('audio') || text.includes('speaker')) {
    return 'audio';
  }
  if (text.includes('laptop') || text.includes('keyboard') || text.includes('mouse') || text.includes('hub')) {
    return 'laptop';
  }
  if (text.includes('fashion') || text.includes('dress') || text.includes('shirt') || text.includes('shoe') || text.includes('bag')) {
    return 'fashion';
  }
  return 'home';
}

function buildDisplayProductData(product: ProductItem, index: number, language: LanguageCode): DisplayProductData {
  const theme = detectProductTheme(product);
  const themeAssets = productThemeAssets[theme];
  const seed = Math.abs(
    Array.from(normalizeSlug(product.id + product.slug)).reduce((sum, char) => sum + char.charCodeAt(0), 0) + index
  );

  const nameVi = pickByIndex(themeAssets.namesVi, seed);
  const descriptionVi = pickByIndex(themeAssets.descriptionsVi, seed);
  const shopName = pickByIndex(themeAssets.shopsVi, seed);
  const imageOffset = seed % themeAssets.images.length;
  const gallery = new Array(5)
    .fill(null)
    .map((_, imageIndex) => themeAssets.images[(imageOffset + imageIndex) % themeAssets.images.length]);

  const name = language === 'vi' ? nameVi : product.name;
  const description =
    language === 'vi'
      ? `${descriptionVi} ${product.description ?? ''}`.trim()
      : product.description ?? 'Product description is being updated.';

  return {
    name,
    description,
    images: gallery,
    shopName,
    category: themeAssets.category
  };
}

function pickDefaultVariant(product: ProductItem): ProductVariant | null {
  if (!product.variants || product.variants.length === 0) {
    return null;
  }
  return product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
}

function resolveProductImage(product: ProductItem): string {
  const image = product.images.find((item) => /^https?:\/\//i.test(item));
  return image ?? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=420&q=60';
}

function buildProductGallery(product: ProductItem | null, display: DisplayProductData | null): string[] {
  if (!product) {
    return [];
  }

  const sources = [...(display?.images ?? []), ...product.images, resolveProductImage(product)];
  return Array.from(new Set(sources.filter((item) => /^https?:\/\//i.test(item))));
}

function resolveLocale(language: LanguageCode): string {
  if (language === 'vi') return 'vi-VN';
  if (language === 'ko') return 'ko-KR';
  return 'en-US';
}

function formatMoney(value: number, currency: string, language: LanguageCode): string {
  try {
    return new Intl.NumberFormat(resolveLocale(language), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
}

function soldLabel(index: number): string {
  const labels = ['200k+', '90k+', '40k+', '12k+', '4k+', '1k+'];
  return labels[index % labels.length];
}

function parseSoldCount(label: string): number {
  const normalized = label.trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)(k)?/);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return match[2] ? value * 1000 : value;
}

function buildCardMeta(index: number): Pick<ProductCardView, 'city' | 'rating'> {
  const cityMap: ProductCardView['city'][] = ['hcm', 'hanoi', 'danang'];
  const city = cityMap[index % cityMap.length];
  const rating = 3 + (index % 3);

  return { city, rating };
}

function getCommerceCopy(language: LanguageCode): CommerceCopy {
  if (language === 'en' || language === 'ko') {
    return {
      addToCart: 'Add to cart',
      addingToCart: 'Adding...',
      viewDetail: 'View detail',
      detailTitle: 'Product detail',
      detailFallback: 'This product has no long description yet.',
      customerOnlyCart: 'Only customer account can use cart',
      cartLoadFailedPrefix: 'Cannot load cart',
      addToCartSuccessPrefix: 'Added to cart',
      addToCartFailedPrefix: 'Add to cart failed',
      cartTitle: 'Shopping cart',
      cartEmpty: 'Cart is empty. Add products to continue.',
      cartLabelPrefix: 'items',
      quantity: 'Qty',
      remove: 'Remove',
      subtotal: 'Subtotal',
      total: 'Total',
      cartLoginRequired: 'Sign in to manage cart',
      cartUpdated: 'Cart updated',
      searchResultFor: 'Results for',
      filterTitle: 'Search filters',
      sortBy: 'Sort by',
      sortRelevant: 'Relevant',
      sortNewest: 'Newest',
      sortBestSeller: 'Best seller',
      sortPrice: 'Price',
      relatedShop: 'Related shop',
      viewShop: 'View shop',
      backToSearch: 'Back to search',
      buyNow: 'Buy now',
      placingOrder: 'Placing order...',
      checkoutAll: 'Checkout selected',
      checkoutEmpty: 'No items selected yet',
      pleaseSignInCart: 'Please sign in as customer to use cart.',
      goToSignIn: 'Go to sign in',
      orderPlacedPrefix: 'Order placed. Number',
      sessionExpired: 'Session expired. Please sign in again.',
      noSearchResultTitle: 'No products found',
      noSearchResultHint: 'Try another keyword or clear filters.',
      chatWithSeller: 'Chat seller',
      chatTitle: 'Chat',
      chatPlaceholder: 'Type a message...',
      chatSend: 'Send',
      chatGreeting: 'Hello, can I support you with this product?',
      allFilter: 'All'
    };
  }

  return {
    addToCart: 'Thêm vào giỏ',
    addingToCart: 'Đang thêm...',
    viewDetail: 'Xem chi tiết',
    detailTitle: 'Chi tiết sản phẩm',
    detailFallback: 'Sản phẩm chưa có mô tả chi tiết.',
    customerOnlyCart: 'Chỉ tài khoản khách hàng mới dùng được giỏ hàng',
    cartLoadFailedPrefix: 'Không tải được giỏ hàng',
    addToCartSuccessPrefix: 'Đã thêm vào giỏ',
    addToCartFailedPrefix: 'Thêm vào giỏ thất bại',
    cartTitle: 'Giỏ hàng',
    cartEmpty: 'Giỏ hàng đang trống. Hãy thêm sản phẩm để mua.',
    cartLabelPrefix: 'sản phẩm',
    quantity: 'Số lượng',
    remove: 'Xóa',
    subtotal: 'Tạm tính',
    total: 'Tổng cộng',
    cartLoginRequired: 'Đăng nhập để quản lý giỏ hàng',
    cartUpdated: 'Đã cập nhật giỏ hàng',
    searchResultFor: 'Kết quả tìm kiếm cho',
    filterTitle: 'Bộ lọc tìm kiếm',
    sortBy: 'Sắp xếp theo',
    sortRelevant: 'Liên quan',
    sortNewest: 'Mới nhất',
    sortBestSeller: 'Bán chạy',
    sortPrice: 'Giá',
    relatedShop: 'Shop liên quan',
    viewShop: 'Xem shop',
    backToSearch: 'Quay lại tìm kiếm',
    buyNow: 'Mua ngay',
    placingOrder: 'Đang đặt hàng...',
    checkoutAll: 'Mua hàng',
    checkoutEmpty: 'Bạn chưa chọn sản phẩm',
    pleaseSignInCart: 'Vui lòng đăng nhập tài khoản khách hàng để sử dụng giỏ hàng.',
    goToSignIn: 'Đăng nhập ngay',
    orderPlacedPrefix: 'Đặt hàng thành công. Mã đơn',
    sessionExpired: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.',
    noSearchResultTitle: 'Không tìm thấy sản phẩm',
    noSearchResultHint: 'Thử từ khóa khác hoặc bớt bộ lọc.',
    chatWithSeller: 'Chat với shop',
    chatTitle: 'Chat',
    chatPlaceholder: 'Nhập tin nhắn...',
    chatSend: 'Gửi',
    chatGreeting: 'Xin chào, mình có thể hỗ trợ gì cho bạn?',
    allFilter: 'Tất cả'
  };
}


export function BuyerHome({
  user,
  onLogout,
  onOpenLogin,
  onOpenRegister,
  language,
  onLanguageChange
}: BuyerHomeProps): ReactElement {
  const { width } = useWindowDimensions();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [homeView, setHomeView] = useState<HomeView>('search');
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTabKey>('home');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('relevant');
  const [selectedCity, setSelectedCity] = useState<'all' | 'hcm' | 'hanoi' | 'danang'>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'perfume' | 'beauty' | 'fashion' | 'home'>('all');
  const [priceBand, setPriceBand] = useState<'all' | 'under100' | '100to300' | 'over300'>('all');
  const [minimumRating, setMinimumRating] = useState<0 | 3 | 4 | 5>(0);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [isProductsLoading, setIsProductsLoading] = useState(true);
  const [productsLoadError, setProductsLoadError] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [didMainImageFail, setDidMainImageFail] = useState(false);
  const [detailQuantity, setDetailQuantity] = useState(1);

  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [cartUpdatingItemId, setCartUpdatingItemId] = useState<string | null>(null);
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const [didTouchCartSelection, setDidTouchCartSelection] = useState(false);

  const [notice, setNotice] = useState<NoticeState>(initialNotice);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [orderingProductId, setOrderingProductId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatShopName, setChatShopName] = useState('Epay Mall');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<UserProfileDraft>(defaultProfileDraft);
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>(defaultProfileDraft);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const isDesktop = width >= 1200;
  const isTablet = width >= 820;
  const isMobile = width < 768;
  const showFilterColumn = width >= 1040;
  const productCardWidth = isDesktop ? '20%' : isTablet ? '33.33%' : isMobile ? '50%' : '50%';
  const categoryCardWidth = isDesktop ? '20%' : isTablet ? '25%' : '50%';
  const serviceCardWidth = isDesktop ? '20%' : isTablet ? '33.33%' : '50%';

  const locale = localePacks[language];
  const commerceCopy = useMemo(() => getCommerceCopy(language), [language]);
  const mobileCopy = useMemo(
    () =>
      language === 'vi'
        ? {
            home: 'Home',
            mall: 'Mall',
            live: 'Live',
            notice: 'Thông báo',
            user: 'Tôi',
            accountTitle: 'Tôi',
            orderSection: 'Đơn mua',
            orderHistory: 'Xem lịch sử mua hàng',
            utilities: 'Tiện ích của tôi',
            finance: 'Dịch vụ tài chính',
            more: 'Xem thêm',
            chatNow: 'Mua sắm ngay',
            notifyTitle: 'Thông báo',
            readAll: 'Đọc tất cả',
            orderUpdate: 'Cập nhật đơn hàng',
            notifyEmpty: 'Chưa có cập nhật đơn hàng',
            selectAll: 'Tất cả',
            buySelected: 'Mua hàng',
            cartEdit: 'Sửa',
            freeShip: 'Bạn đã được hưởng miễn phí vận chuyển!',
            cartVoucher: 'Shopee Voucher',
            noResult: 'Không có kết quả'
          }
        : {
            home: 'Home',
            mall: 'Mall',
            live: 'Live',
            notice: 'Notice',
            user: 'Me',
            accountTitle: 'My account',
            orderSection: 'My orders',
            orderHistory: 'Order history',
            utilities: 'My utilities',
            finance: 'Financial services',
            more: 'See more',
            chatNow: 'Shop now',
            notifyTitle: 'Notifications',
            readAll: 'Read all',
            orderUpdate: 'Order updates',
            notifyEmpty: 'No order updates yet',
            selectAll: 'All',
            buySelected: 'Checkout',
            cartEdit: 'Edit',
            freeShip: 'You got free shipping!',
            cartVoucher: 'Shop Voucher',
            noResult: 'No result'
          },
    [language]
  );

  const currentLanguageLabel = useMemo(
    () => languageOptions.find((item) => item.code === language)?.label ?? 'Tiếng Việt',
    [language]
  );

  const productDisplayMap = useMemo(() => {
    const nextMap = new Map<string, DisplayProductData>();
    products.forEach((product, index) => {
      nextMap.set(product.id, buildDisplayProductData(product, index, language));
    });
    return nextMap;
  }, [language, products]);

  const productCards = useMemo<ProductCardView[]>(() => {
    if (products.length === 0) {
      if (activeSearchTerm.trim()) {
        return [];
      }

      return fallbackImages.map((image, index) => ({
        id: `fallback-${index}`,
        name: locale.home.recommendTitles[index] ?? `Product ${index + 1}`,
        image,
        price: 19000 + index * 9000,
        currency: 'VND',
        sold: soldLabel(index),
        soldCount: parseSoldCount(soldLabel(index)),
        createdAtMs: Date.now() - index * 60_000,
        category: index % 2 === 0 ? 'perfume' : 'beauty',
        city: index % 3 === 0 ? 'hcm' : index % 3 === 1 ? 'hanoi' : 'danang',
        rating: 3 + (index % 3),
        shopName: `Epay Mall #${index + 1}`
      }));
    }

    return products.map((product, index) => {
      const variant = pickDefaultVariant(product);
      const display = productDisplayMap.get(product.id);
      const meta = buildCardMeta(index);
      const sold = soldLabel(index);
      const createdAtMs = Number(new Date(product.createdAt));

      return {
        id: product.id,
        name: display?.name ?? product.name,
        image: display?.images[0] ?? resolveProductImage(product),
        price: variant?.price ?? product.minPrice,
        currency: variant?.currency ?? 'VND',
        sold,
        soldCount: parseSoldCount(sold),
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now() - index * 60_000,
        category: display?.category ?? 'home',
        city: meta.city,
        rating: meta.rating,
        shopName: display?.shopName ?? `Shop ${product.sellerId.slice(0, 6).toUpperCase()}`,
        product
      };
    });
  }, [activeSearchTerm, locale.home.recommendTitles, productDisplayMap, products]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );
  const selectedProductDisplay = useMemo(
    () => (selectedProduct ? productDisplayMap.get(selectedProduct.id) ?? null : null),
    [productDisplayMap, selectedProduct]
  );
  const selectedProductCard = useMemo(
    () => productCards.find((item) => item.id === selectedProductId) ?? null,
    [productCards, selectedProductId]
  );
  const selectedGallery = useMemo(
    () => buildProductGallery(selectedProduct, selectedProductDisplay),
    [selectedProduct, selectedProductDisplay]
  );
  const selectedImageIndex = useMemo(() => {
    if (selectedGallery.length === 0) {
      return 0;
    }

    const index = selectedGallery.findIndex((item) => item === selectedImage);
    return index >= 0 ? index : 0;
  }, [selectedGallery, selectedImage]);

  const sortedCards = useMemo(() => {
    const source = [...productCards];
    if (sortMode === 'newest') return source.sort((a, b) => b.createdAtMs - a.createdAtMs);
    if (sortMode === 'bestseller') return source.sort((a, b) => b.soldCount - a.soldCount);
    if (sortMode === 'price') return source.sort((a, b) => a.price - b.price);
    return source;
  }, [productCards, sortMode]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = normalizeSearchTerm(activeSearchTerm);
    const sortedPriceValues = [...sortedCards].map((card) => card.price).sort((a, b) => a - b);
    const lowThreshold = sortedPriceValues[Math.floor(sortedPriceValues.length / 3)] ?? 0;
    const highThreshold = sortedPriceValues[Math.floor((sortedPriceValues.length * 2) / 3)] ?? Number.MAX_SAFE_INTEGER;

    return sortedCards.filter((card) => {
      const searchable = `${card.name} ${card.shopName} ${card.category}`;
      if (normalizedSearch && !normalizeSearchTerm(searchable).includes(normalizedSearch)) {
        return false;
      }

      if (selectedCity !== 'all' && card.city !== selectedCity) {
        return false;
      }

      if (selectedCategory !== 'all' && card.category !== selectedCategory) {
        return false;
      }

      if (priceBand === 'under100' && card.price > lowThreshold) {
        return false;
      }

      if (priceBand === '100to300' && (card.price <= lowThreshold || card.price >= highThreshold)) {
        return false;
      }

      if (priceBand === 'over300' && card.price < highThreshold) {
        return false;
      }

      if (minimumRating > 0 && card.rating < minimumRating) {
        return false;
      }

      return true;
    });
  }, [activeSearchTerm, minimumRating, priceBand, selectedCategory, selectedCity, sortedCards]);

  const notifications = useMemo<NotificationItem[]>(
    () =>
      language === 'vi'
        ? [
            { id: 'promo', title: 'Khuyến mãi', preview: 'Highlands Coffee 25.000đ - Pizza mua 1 tặng 1.', unread: 16 },
            { id: 'finance', title: 'Thông tin tài chính', preview: 'Trạm săn thưởng đã lên sóng, nhận quà mỗi ngày.', unread: 7 },
            { id: 'update', title: 'Cập nhật Epay', preview: 'Yêu cầu đăng nhập tài khoản để tiếp tục mua sắm.', unread: 7 }
          ]
        : [
            { id: 'promo', title: 'Promotions', preview: 'Highlands Coffee 25,000d - pizza deal and coupons.', unread: 16 },
            { id: 'finance', title: 'Finance', preview: 'Reward station is live. Claim your daily rewards.', unread: 7 },
            { id: 'update', title: 'Epay updates', preview: 'Sign in is required for personalized notifications.', unread: 7 }
          ],
    [language]
  );


  const mobileShortcutApps = useMemo(
    () =>
      language === 'vi'
        ? ['ShopeeFood', 'Shopee Mart', 'ShopeeVIP', 'Deal từ 1.000đ', 'Mã giảm giá']
        : ['ShopeeFood', 'Shopee Mart', 'ShopeeVIP', 'Deal from 1,000d', 'Promo codes'],
    [language]
  );

  const cityFilterOptions = useMemo(
    () =>
      language === 'vi'
        ? [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'hcm', label: 'TP. Hồ Chí Minh' },
            { key: 'hanoi', label: 'Hà Nội' },
            { key: 'danang', label: 'Đà Nẵng' }
          ]
        : [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'hcm', label: 'Ho Chi Minh City' },
            { key: 'hanoi', label: 'Ha Noi' },
            { key: 'danang', label: 'Da Nang' }
          ],
    [commerceCopy.allFilter, language]
  );

  const categoryFilterOptions = useMemo(
    () =>
      language === 'vi'
        ? [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'perfume', label: 'Nước hoa' },
            { key: 'beauty', label: 'Làm đẹp' },
            { key: 'fashion', label: 'Thời trang' },
            { key: 'home', label: 'Gia dụng' }
          ]
        : [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'perfume', label: 'Perfume' },
            { key: 'beauty', label: 'Beauty' },
            { key: 'fashion', label: 'Fashion' },
            { key: 'home', label: 'Home' }
          ],
    [commerceCopy.allFilter, language]
  );

  const priceFilterOptions = useMemo(
    () =>
      language === 'vi'
        ? [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'under100', label: 'Giá thấp' },
            { key: '100to300', label: 'Giá trung bình' },
            { key: 'over300', label: 'Giá cao' }
          ]
        : [
            { key: 'all', label: commerceCopy.allFilter },
            { key: 'under100', label: 'Low price' },
            { key: '100to300', label: 'Medium price' },
            { key: 'over300', label: 'High price' }
          ],
    [commerceCopy.allFilter, language]
  );

  const ratingFilterOptions = useMemo(
    () =>
      language === 'vi'
        ? [
            { key: 0, label: commerceCopy.allFilter },
            { key: 5, label: '5 sao' },
            { key: 4, label: 'Từ 4 sao' },
            { key: 3, label: 'Từ 3 sao' }
          ]
        : [
            { key: 0, label: commerceCopy.allFilter },
            { key: 5, label: '5 stars' },
            { key: 4, label: '4 stars & up' },
            { key: 3, label: '3 stars & up' }
          ],
    [commerceCopy.allFilter, language]
  );

  const sellerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    productCards.forEach((card) => {
      if (card.product) {
        map.set(card.product.sellerId, card.shopName);
      }
    });
    return map;
  }, [productCards]);

  const cartGroups = useMemo<CartGroupView[]>(() => {
    if (!cart) {
      return [];
    }

    const groupMap = new Map<string, CartGroupView>();
    cart.items.forEach((item) => {
      const fromMeta = typeof item.metadata?.shopName === 'string' ? String(item.metadata.shopName) : '';
      const fallbackName = sellerNameMap.get(item.sellerId) ?? `Shop ${item.sellerId.slice(0, 6).toUpperCase()}`;
      const shopName = fromMeta || fallbackName;
      const current = groupMap.get(item.sellerId);
      if (current) {
        current.items.push(item);
        return;
      }
      groupMap.set(item.sellerId, {
        sellerId: item.sellerId,
        shopName,
        items: [item]
      });
    });
    return Array.from(groupMap.values());
  }, [cart, sellerNameMap]);

  const selectedItemSet = useMemo(() => new Set(selectedCartItemIds), [selectedCartItemIds]);

  const selectedCartItems = useMemo(
    () => (cart ? cart.items.filter((item) => selectedItemSet.has(item.id)) : []),
    [cart, selectedItemSet]
  );

  const selectedSubtotal = useMemo(
    () => selectedCartItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [selectedCartItems]
  );

  const selectedQuantity = useMemo(
    () => selectedCartItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedCartItems]
  );

  const cartItemsCount = useMemo(() => {
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSavedProfile(): Promise<void> {
      try {
        const raw = await AsyncStorage.getItem('buyerProfileDraft');
        if (!raw || !mounted) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<UserProfileDraft>;
        const nextProfile: UserProfileDraft = {
          displayName: parsed.displayName ?? defaultProfileDraft.displayName,
          bio: parsed.bio ?? defaultProfileDraft.bio,
          location: parsed.location ?? defaultProfileDraft.location,
          avatarUrl: parsed.avatarUrl ?? defaultProfileDraft.avatarUrl
        };

        setProfile(nextProfile);
        setProfileDraft(nextProfile);
      } catch {
        // ignore broken profile cache
      }
    }

    void loadSavedProfile();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  useEffect(() => {
    if (selectedProduct) {
      setSelectedImage(buildProductGallery(selectedProduct, selectedProductDisplay)[0] ?? resolveProductImage(selectedProduct));
      setDetailQuantity(1);
    }
  }, [selectedProduct, selectedProductDisplay]);

  useEffect(() => {
    setDidMainImageFail(false);
  }, [selectedImage]);

  useEffect(() => {
    if (!selectedGallery.length) {
      return;
    }

    if (!selectedGallery.includes(selectedImage)) {
      setSelectedImage(selectedGallery[0]);
    }
  }, [selectedGallery, selectedImage]);

  // loadCartSilently is intentionally triggered only when user identity/role changes.
  useEffect(() => {
    if (user?.role === 'CUSTOMER') {
      void loadCartSilently();
      return;
    }
    setCart(null);
    setSelectedCartItemIds([]);
    setDidTouchCartSelection(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!cart) {
      setSelectedCartItemIds([]);
      setDidTouchCartSelection(false);
      return;
    }

    setSelectedCartItemIds((current) => {
      const validIds = new Set(cart.items.map((item) => item.id));
      const filtered = current.filter((id) => validIds.has(id));
      if (!didTouchCartSelection && filtered.length === 0 && cart.items.length > 0) {
        return cart.items.map((item) => item.id);
      }
      return filtered;
    });
  }, [cart, didTouchCartSelection]);

  useEffect(() => {
    if (homeView === 'mall') {
      setActiveMobileTab('mall');
      return;
    }
    if (homeView === 'live') {
      setActiveMobileTab('live');
      return;
    }
    if (homeView === 'notice') {
      setActiveMobileTab('notice');
      return;
    }
    if (homeView === 'user') {
      setActiveMobileTab('user');
      return;
    }
    if (homeView === 'search' && ['mall', 'live', 'notice', 'user'].includes(activeMobileTab)) {
      setActiveMobileTab('home');
    }
  }, [activeMobileTab, homeView]);

  async function loadProducts(search?: string): Promise<void> {
    setIsProductsLoading(true);
    setProductsLoadError('');

    try {
      const response = await fetchPublicProducts(search);
      setProducts(response.items);
      if (response.items.length > 0) {
        setSelectedProductId(response.items[0].id);
      }
    } catch (error) {
      setProducts([]);
      setProductsLoadError((error as Error).message);
    } finally {
      setIsProductsLoading(false);
    }
  }

  async function clearSessionAndRedirect(): Promise<void> {
    await AsyncStorage.multiRemove([...sessionStorageKeys]);
    setCart(null);
    onOpenLogin();
  }

  async function tryRefreshAccessToken(): Promise<string | null> {
    const refreshToken = await AsyncStorage.getItem('buyerRefreshToken');
    if (!refreshToken) {
      return null;
    }

    try {
      const refreshed = await refreshAccessToken({ refreshToken });
      await AsyncStorage.multiSet([
        ['buyerAccessToken', refreshed.accessToken],
        ['buyerRefreshToken', refreshed.refreshToken]
      ]);
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  async function resolveCustomerToken(options?: { silent?: boolean }): Promise<string | null> {
    if (!user) {
      if (!options?.silent) {
        onOpenLogin();
      }
      return null;
    }

    if (user.role !== 'CUSTOMER') {
      if (!options?.silent) {
        setNotice({ type: 'error', message: commerceCopy.customerOnlyCart });
      }
      return null;
    }

    const accessToken = await AsyncStorage.getItem('buyerAccessToken');
    if (accessToken) {
      return accessToken;
    }

    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return refreshed;
    }

    if (!options?.silent) {
      setNotice({ type: 'error', message: commerceCopy.sessionExpired });
      await clearSessionAndRedirect();
    }

    return null;
  }

  async function runWithCustomerToken<T>(
    action: (accessToken: string) => Promise<T>,
    options?: { silent?: boolean }
  ): Promise<T | null> {
    const token = await resolveCustomerToken(options);
    if (!token) {
      return null;
    }

    try {
      return await action(token);
    } catch (error) {
      const message = (error as Error).message;
      if (!isTokenInvalidMessage(message)) {
        throw error;
      }

      const refreshedToken = await tryRefreshAccessToken();
      if (!refreshedToken) {
        if (!options?.silent) {
          setNotice({ type: 'error', message: commerceCopy.sessionExpired });
          await clearSessionAndRedirect();
        }
        throw new Error(commerceCopy.sessionExpired);
      }

      return action(refreshedToken);
    }
  }

  async function loadCartSilently(silent = true): Promise<void> {
    if (!user || user.role !== 'CUSTOMER') {
      setCart(null);
      return;
    }

    setIsCartLoading(true);
    try {
      const nextCart = await runWithCustomerToken((accessToken) => fetchMyCart(accessToken), { silent });
      if (nextCart) {
        setCart(nextCart);
      }
    } catch (error) {
      setNotice({ type: 'error', message: `${commerceCopy.cartLoadFailedPrefix}: ${(error as Error).message}` });
    } finally {
      setIsCartLoading(false);
    }
  }

  async function handleSearchSubmit(): Promise<void> {
    const normalized = searchKeyword.trim();
    setActiveSearchTerm(normalized);
    setHomeView('search');
  }

  function resetSearchFilters(): void {
    setSortMode('relevant');
    setSelectedCity('all');
    setSelectedCategory('all');
    setPriceBand('all');
    setMinimumRating(0);
  }

  function openProfileModal(): void {
    setProfileDraft(profile);
    setIsProfileModalOpen(true);
  }

  async function saveProfileDraft(): Promise<void> {
    const normalizedProfile: UserProfileDraft = {
      displayName: profileDraft.displayName.trim() || defaultProfileDraft.displayName,
      bio: profileDraft.bio.trim() || defaultProfileDraft.bio,
      location: profileDraft.location.trim() || defaultProfileDraft.location,
      avatarUrl: profileDraft.avatarUrl.trim() || defaultProfileDraft.avatarUrl
    };

    setProfile(normalizedProfile);
    setProfileDraft(normalizedProfile);
    setIsProfileModalOpen(false);
    await AsyncStorage.setItem('buyerProfileDraft', JSON.stringify(normalizedProfile));
    setNotice({ type: 'success', message: language === 'vi' ? 'Da cap nhat ho so thanh cong' : 'Profile updated successfully' });
  }

  function handleOpenDetail(product: ProductItem): void {
    setSelectedProductId(product.id);
    setHomeView('detail');
    setNotice(initialNotice);
  }

  function handleDetailMainImageError(): void {
    if (selectedGallery.length === 0) {
      setDidMainImageFail(true);
      return;
    }

    const currentIndex = selectedGallery.findIndex((item) => item === selectedImage);
    if (currentIndex < 0) {
      setSelectedImage(selectedGallery[0]);
      return;
    }

    const nextImage = selectedGallery[currentIndex + 1];
    if (nextImage) {
      setSelectedImage(nextImage);
      return;
    }

    setDidMainImageFail(true);
  }

  async function handleOpenCart(): Promise<void> {
    if (!user) {
      onOpenLogin();
      return;
    }

    if (user.role !== 'CUSTOMER') {
      setNotice({ type: 'error', message: commerceCopy.customerOnlyCart });
      return;
    }

    setHomeView('cart');
    await loadCartSilently(false);
  }

  function toggleCartItemSelection(itemId: string): void {
    setDidTouchCartSelection(true);
    setSelectedCartItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }

  function toggleShopSelection(group: CartGroupView): void {
    const allShopItemIds = group.items.map((item) => item.id);
    const isSelected = allShopItemIds.every((id) => selectedItemSet.has(id));
    setDidTouchCartSelection(true);
    setSelectedCartItemIds((current) => {
      if (isSelected) {
        return current.filter((id) => !allShopItemIds.includes(id));
      }
      const next = new Set(current);
      allShopItemIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }

  function toggleSelectAllCart(): void {
    if (!cart || cart.items.length === 0) {
      return;
    }
    const shouldSelectAll = selectedCartItemIds.length !== cart.items.length;
    setDidTouchCartSelection(true);
    setSelectedCartItemIds(shouldSelectAll ? cart.items.map((item) => item.id) : []);
  }

  async function handleAddToCart(product: ProductItem, quantity = 1): Promise<void> {
    const variant = pickDefaultVariant(product);
    const display = productDisplayMap.get(product.id);
    if (!variant) {
      setNotice({ type: 'error', message: `${commerceCopy.addToCartFailedPrefix}: Product has no variant.` });
      return;
    }

    setAddingProductId(product.id);
    setNotice(initialNotice);

    try {
      const nextCart = await runWithCustomerToken((accessToken) =>
        addItemToCart(accessToken, {
          productId: product.id,
          sku: variant.sku,
          name: display?.name ?? product.name,
          image: display?.images[0] ?? resolveProductImage(product),
          unitPrice: variant.price,
          quantity: Math.max(1, Math.min(99, quantity)),
          sellerId: product.sellerId,
          currency: variant.currency,
          metadata: { source: 'buyer-app' }
        })
      );
      if (!nextCart) {
        return;
      }
      setCart(nextCart);
      setNotice({ type: 'success', message: `${commerceCopy.addToCartSuccessPrefix}: ${display?.name ?? product.name}` });
    } catch (error) {
      setNotice({ type: 'error', message: `${commerceCopy.addToCartFailedPrefix}: ${(error as Error).message}` });
    } finally {
      setAddingProductId(null);
    }
  }

  async function handlePlaceOrder(product: ProductItem, quantity = 1): Promise<void> {
    const variant = pickDefaultVariant(product);
    const display = productDisplayMap.get(product.id);
    if (!variant) {
      setNotice({ type: 'error', message: `${locale.home.orderFailedPrefix}: Product has no variant.` });
      return;
    }

    setOrderingProductId(product.id);
    try {
      const response = await runWithCustomerToken((accessToken) =>
        createCustomerOrder(accessToken, {
          currency: variant.currency,
          items: [
            {
              productId: product.id,
              sku: variant.sku,
              productName: display?.name ?? product.name,
              quantity: Math.max(1, Math.min(99, quantity)),
              unitPrice: variant.price
            }
          ]
        })
      );
      if (!response) {
        return;
      }
      setNotice({ type: 'success', message: `${commerceCopy.orderPlacedPrefix}: ${response.orderNumber}` });
      await loadCartSilently();
    } catch (error) {
      setNotice({ type: 'error', message: `${locale.home.orderFailedPrefix}: ${(error as Error).message}` });
    } finally {
      setOrderingProductId(null);
    }
  }

  async function handleCheckoutCart(): Promise<void> {
    if (!cart || cart.items.length === 0) {
      setNotice({ type: 'error', message: commerceCopy.checkoutEmpty });
      return;
    }
    if (selectedCartItems.length === 0) {
      setNotice({ type: 'error', message: commerceCopy.checkoutEmpty });
      return;
    }

    setOrderingProductId('checkout-cart');
    try {
      const response = await runWithCustomerToken((accessToken) =>
        createCustomerOrder(accessToken, {
          currency: cart.currency,
          items: selectedCartItems.map((item) => ({
            productId: item.productId,
            sku: item.sku,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice
          }))
        })
      );
      if (!response) {
        return;
      }
      setNotice({ type: 'success', message: `${commerceCopy.orderPlacedPrefix}: ${response.orderNumber}` });
      await loadCartSilently();
      setDidTouchCartSelection(false);
    } catch (error) {
      setNotice({ type: 'error', message: `${locale.home.orderFailedPrefix}: ${(error as Error).message}` });
    } finally {
      setOrderingProductId(null);
    }
  }

  async function handleAdjustCartItem(itemId: string, nextQuantity: number): Promise<void> {
    if (!cart) return;

    setCartUpdatingItemId(itemId);
    try {
      const nextCart = await runWithCustomerToken((accessToken) =>
        updateCartItemQuantity(accessToken, itemId, {
          quantity: Math.max(0, nextQuantity),
          expectedVersion: cart.version
        })
      );
      if (!nextCart) {
        return;
      }
      setCart(nextCart);
      setNotice({ type: 'success', message: commerceCopy.cartUpdated });
    } catch (error) {
      setNotice({ type: 'error', message: `${commerceCopy.cartLoadFailedPrefix}: ${(error as Error).message}` });
    } finally {
      setCartUpdatingItemId(null);
    }
  }

  function handleOpenChat(shopName: string): void {
    setChatShopName(shopName);
    setIsChatOpen(true);
    setChatMessages([
      {
        id: `seller-${Date.now()}`,
        sender: 'seller',
        text: commerceCopy.chatGreeting
      }
    ]);
  }

  function handleSendChat(): void {
    const message = chatInput.trim();
    if (!message) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      {
        id: `buyer-${Date.now()}`,
        sender: 'buyer',
        text: message
      },
      {
        id: `seller-auto-${Date.now() + 1}`,
        sender: 'seller',
        text: language === 'vi' ? 'Shop đã nhận tin. Bên mình phản hồi trong ít phút nhé.' : 'Shop received your message and will reply shortly.'
      }
    ];

    setChatMessages(nextMessages);
    setChatInput('');
  }

  const relatedShopProducts = filteredCards.slice(0, 4);
  const mallShowcaseProducts = useMemo(
    () => filteredCards.slice(0, 12).map((item, index) => ({ ...item, mallRank: index + 1 })),
    [filteredCards]
  );
  const liveShowcaseProducts = useMemo(
    () => filteredCards.slice(0, 6),
    [filteredCards]
  );
  const selectedVariant = selectedProduct ? pickDefaultVariant(selectedProduct) : null;
  const selectedPrice = selectedVariant?.price ?? selectedProduct?.minPrice ?? 0;
  const selectedCurrency = selectedVariant?.currency ?? 'VND';
  const selectedComparePrice = Math.round(selectedPrice * 1.85);
  const selectedDiscountPercent = selectedComparePrice > 0 ? Math.max(5, Math.round(((selectedComparePrice - selectedPrice) / selectedComparePrice) * 100)) : 0;

  return (
    <View style={homeStyles.root}>
      <ScrollView style={homeStyles.scrollContainer} contentContainerStyle={homeStyles.scrollContent}>
        <View style={homeStyles.page}>
        {!isMobile ? (
          <View style={homeStyles.headerWrap}>
            <View style={[homeStyles.centerContainer, homeStyles.utilityRow]}>
              <View style={homeStyles.utilityLeft}>
                <Text style={homeStyles.utilityText}>{locale.home.sellerChannel}</Text>
                <Text style={homeStyles.utilityText}>{locale.home.becomeSeller}</Text>
                <Text style={homeStyles.utilityText}>{locale.home.downloadApp}</Text>
                <Text style={homeStyles.utilityText}>{locale.home.connect}</Text>
              </View>

              <View style={homeStyles.utilityRight}>
                <Text style={homeStyles.utilityText}>{locale.home.notification}</Text>
                <Text style={homeStyles.utilityText}>{locale.home.support}</Text>

                <View style={homeStyles.languageWrap}>
                  <Pressable style={homeStyles.languageButton} onPress={() => setIsLanguageMenuOpen((prev) => !prev)}>
                    <Text style={homeStyles.languageButtonText}>{currentLanguageLabel}</Text>
                  </Pressable>

                  {isLanguageMenuOpen ? (
                    <View style={homeStyles.languageMenu}>
                      {languageOptions.map((item) => (
                        <Pressable
                          key={item.code}
                          style={[homeStyles.languageMenuItem, item.code === language ? homeStyles.languageMenuItemActive : undefined]}
                          onPress={() => {
                            onLanguageChange(item.code);
                            setIsLanguageMenuOpen(false);
                          }}
                        >
                          <Text style={homeStyles.languageMenuText}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>

                {user ? (
                  <>
                    <Text style={homeStyles.accountText}>{user.email}</Text>
                    <Pressable style={homeStyles.utilityAuthButton} onPress={onLogout}>
                      <Text style={homeStyles.utilityAuthButtonText}>{locale.home.logout}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable style={homeStyles.utilityAuthButton} onPress={onOpenRegister}>
                      <Text style={homeStyles.utilityAuthButtonText}>{locale.home.register}</Text>
                    </Pressable>
                    <Pressable style={homeStyles.utilityAuthButton} onPress={onOpenLogin}>
                      <Text style={homeStyles.utilityAuthButtonText}>{locale.home.login}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            <View style={[homeStyles.centerContainer, homeStyles.searchRow]}>
              <Pressable style={homeStyles.brandWrap} onPress={() => setHomeView('search')}>
                <View style={homeStyles.brandMark}>
                  <Text style={homeStyles.brandMarkText}>eMall</Text>
                </View>
                <Text style={homeStyles.brandText}>eMall</Text>
              </Pressable>

              <View style={homeStyles.searchArea}>
                <View style={homeStyles.searchInputRow}>
                  <TextInput
                    style={homeStyles.searchInput}
                    placeholder={locale.home.searchPlaceholder}
                    placeholderTextColor="#9f9f9f"
                    value={searchKeyword}
                    onChangeText={setSearchKeyword}
                    onSubmitEditing={() => {
                      void handleSearchSubmit();
                    }}
                  />
                  <Pressable style={homeStyles.searchButton} onPress={() => void handleSearchSubmit()}>
                    <Text style={homeStyles.searchButtonText}>{locale.home.searchButton}</Text>
                  </Pressable>
                </View>

                <View style={homeStyles.keywordRow}>
                  {locale.home.keywords.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => {
                        setSearchKeyword(item);
                        setActiveSearchTerm(item);
                        setHomeView('search');
                      }}
                    >
                      <Text style={homeStyles.keywordText}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable style={homeStyles.cartWrap} onPress={() => void handleOpenCart()}>
                <Text style={homeStyles.cartIcon}>{locale.home.cart}</Text>
                <View style={homeStyles.cartBadge}>
                  <Text style={homeStyles.cartBadgeText}>{cartItemsCount}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        ) : null}

        {notice.type !== 'idle' ? (
          <View style={[homeStyles.centerContainer, homeStyles.noticeWrap]}>
            <Text style={notice.type === 'success' ? homeStyles.noticeSuccessText : homeStyles.noticeErrorText}>{notice.message}</Text>
          </View>
        ) : null}

        {homeView === 'search' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.searchPageWrap]}>
            {isMobile ? (
              <>
                <View style={homeStyles.mobileHeaderWrap}>
                  <View style={homeStyles.mobileSearchBar}>
                    <TextInput
                      style={homeStyles.mobileSearchInput}
                      placeholder={locale.home.searchPlaceholder}
                      placeholderTextColor="#9f9f9f"
                      value={searchKeyword}
                      onChangeText={setSearchKeyword}
                      onSubmitEditing={() => {
                        void handleSearchSubmit();
                      }}
                    />
                    <Pressable style={homeStyles.mobileSearchAction} onPress={() => void handleSearchSubmit()}>
                      <Text style={homeStyles.mobileSearchActionText}>{locale.home.searchButton}</Text>
                    </Pressable>
                  </View>
                  <Pressable style={homeStyles.mobileHeaderIcon} onPress={() => void handleOpenCart()}>
                    <Text style={homeStyles.mobileHeaderIconText}>GIỎ</Text>
                    <View style={homeStyles.mobileHeaderCount}>
                      <Text style={homeStyles.mobileHeaderCountText}>{cartItemsCount}</Text>
                    </View>
                  </Pressable>
                  <Pressable style={homeStyles.mobileHeaderIcon} onPress={() => handleOpenChat('Epay Mall')}>
                    <Text style={homeStyles.mobileHeaderIconText}>CHAT</Text>
                  </Pressable>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={homeStyles.mobileKeywordRow}>
                  {locale.home.keywords.map((item) => (
                    <Pressable
                      key={item}
                      style={homeStyles.mobileKeywordChip}
                      onPress={() => {
                        setSearchKeyword(item);
                        setActiveSearchTerm(item);
                        setHomeView('search');
                      }}
                    >
                      <Text style={homeStyles.mobileKeywordChipText}>{item}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={homeStyles.mobileWalletCard}>
                  {[
                    { title: 'ShopeePay', subtitle: language === 'vi' ? 'Giảm đến 40.000đ' : 'Save up to 40,000d' },
                    { title: 'Điểm danh', subtitle: language === 'vi' ? 'Lên đến 700 Xu' : 'Up to 700 coins' },
                    { title: 'SEasy', subtitle: language === 'vi' ? 'Vay nhanh tới 50 triệu' : 'Quick loan up to 50M' }
                  ].map((item) => (
                    <View key={item.title} style={homeStyles.mobileWalletItem}>
                      <Text style={homeStyles.mobileWalletTitle}>{item.title}</Text>
                      <Text style={homeStyles.mobileWalletSub} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    </View>
                  ))}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={homeStyles.mobileShortcutRow}>
                  {mobileShortcutApps.map((item) => (
                    <Pressable key={item} style={homeStyles.mobileShortcutItem}>
                      <View style={homeStyles.mobileShortcutIcon}>
                        <Text style={homeStyles.mobileShortcutIconText}>eMall</Text>
                      </View>
                      <Text style={homeStyles.mobileShortcutLabel} numberOfLines={2}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={homeStyles.mobileMediaRow}>
                  <View style={homeStyles.mobileMediaCard}>
                    <Text style={homeStyles.mobileMediaTitle}>Epay LIVE</Text>
                    <View style={homeStyles.mobileMediaThumbRow}>
                      <Image source={{ uri: heroBanners.sideTop }} style={homeStyles.mobileMediaThumb} />
                      <Image source={{ uri: heroBanners.sideBottom }} style={homeStyles.mobileMediaThumb} />
                    </View>
                  </View>
                  <View style={homeStyles.mobileMediaCard}>
                    <Text style={homeStyles.mobileMediaTitle}>Epay VIDEO</Text>
                    <View style={homeStyles.mobileMediaThumbRow}>
                      <Image source={{ uri: heroBanners.main }} style={homeStyles.mobileMediaThumb} />
                      <Image source={{ uri: categoryItems[3] }} style={homeStyles.mobileMediaThumb} />
                    </View>
                  </View>
                </View>

                <View style={homeStyles.mobileFeatureCard}>
                  <View style={homeStyles.mobileFeatureGrid}>
                    {locale.home.services.map((service) => (
                      <View key={service.title} style={homeStyles.mobileFeatureItem}>
                        <Text style={homeStyles.mobileFeatureTitle}>{service.title}</Text>
                        <Text style={homeStyles.mobileFeatureSub}>{service.subtitle}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={homeStyles.mobileCategoryGrid}>
                  {categoryItems.map((item, index) => (
                    <View key={`${locale.home.categoryLabels[index]}-${index}`} style={homeStyles.mobileCategoryItem}>
                      <Image source={{ uri: item }} style={homeStyles.mobileCategoryImage} />
                      <Text style={homeStyles.mobileCategoryText}>{locale.home.categoryLabels[index]}</Text>
                    </View>
                  ))}
                </View>

                <View style={homeStyles.mobileSortCard}>
                  <Text style={homeStyles.mobileSortLabel}>{commerceCopy.sortBy}</Text>
                  <View style={homeStyles.mobileSortRow}>
                    <Pressable style={[homeStyles.mobileSortChip, sortMode === 'relevant' ? homeStyles.mobileSortChipActive : undefined]} onPress={() => setSortMode('relevant')}>
                      <Text style={[homeStyles.mobileSortChipText, sortMode === 'relevant' ? homeStyles.mobileSortChipTextActive : undefined]}>{commerceCopy.sortRelevant}</Text>
                    </Pressable>
                    <Pressable style={[homeStyles.mobileSortChip, sortMode === 'newest' ? homeStyles.mobileSortChipActive : undefined]} onPress={() => setSortMode('newest')}>
                      <Text style={[homeStyles.mobileSortChipText, sortMode === 'newest' ? homeStyles.mobileSortChipTextActive : undefined]}>{commerceCopy.sortNewest}</Text>
                    </Pressable>
                    <Pressable style={[homeStyles.mobileSortChip, sortMode === 'bestseller' ? homeStyles.mobileSortChipActive : undefined]} onPress={() => setSortMode('bestseller')}>
                      <Text style={[homeStyles.mobileSortChipText, sortMode === 'bestseller' ? homeStyles.mobileSortChipTextActive : undefined]}>{commerceCopy.sortBestSeller}</Text>
                    </Pressable>
                    <Pressable style={[homeStyles.mobileSortChip, sortMode === 'price' ? homeStyles.mobileSortChipActive : undefined]} onPress={() => setSortMode('price')}>
                      <Text style={[homeStyles.mobileSortChipText, sortMode === 'price' ? homeStyles.mobileSortChipTextActive : undefined]}>{commerceCopy.sortPrice}</Text>
                    </Pressable>
                  </View>
                </View>

                {isProductsLoading ? (
                  <View style={homeStyles.loadingWrap}><ActivityIndicator color="#ee4d2d" /></View>
                ) : null}

                {!isProductsLoading && filteredCards.length === 0 ? (
                  <View style={homeStyles.mobileEmptyState}>
                    <Text style={homeStyles.mobileEmptyStateTitle}>{mobileCopy.noResult}</Text>
                  </View>
                ) : null}

                <View style={homeStyles.mobileProductGrid}>
                  {filteredCards.map((item) => (
                    <Pressable
                      key={item.id}
                      style={homeStyles.mobileProductCard}
                      onPress={() => {
                        if (item.product) {
                          handleOpenDetail(item.product);
                        }
                      }}
                    >
                      <Image source={{ uri: item.image }} style={homeStyles.mobileProductImage} />
                      <Text style={homeStyles.mobileProductName} numberOfLines={2}>{item.name}</Text>
                      <Text style={homeStyles.mobileProductPrice}>{formatMoney(item.price, item.currency, language)}</Text>
                      <Text style={homeStyles.mobileProductMeta}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
            <View style={homeStyles.heroRow}>
              <Image source={{ uri: heroBanners.main }} style={homeStyles.heroMainImage} />
              <View style={homeStyles.heroSideColumn}>
                <Image source={{ uri: heroBanners.sideTop }} style={homeStyles.heroSideImage} />
                <Image source={{ uri: heroBanners.sideBottom }} style={homeStyles.heroSideImage} />
              </View>
            </View>

            <View style={homeStyles.categoryStrip}>
              {categoryItems.map((item, index) => (
                <View key={`${locale.home.categoryLabels[index]}-${index}`} style={[homeStyles.categoryItem, { width: categoryCardWidth }]}>
                  <Image source={{ uri: item }} style={homeStyles.categoryImage} />
                  <Text style={homeStyles.categoryText}>{locale.home.categoryLabels[index]}</Text>
                </View>
              ))}
            </View>

            <View style={homeStyles.serviceHighlightRow}>
              {locale.home.services.map((service) => (
                <View key={service.title} style={[homeStyles.serviceHighlightItem, { width: serviceCardWidth }]}>
                  <Text style={homeStyles.serviceHighlightTitle}>{service.title}</Text>
                  <Text style={homeStyles.serviceHighlightSub}>{service.subtitle}</Text>
                </View>
              ))}
            </View>

            <View style={homeStyles.resultLayout}>
              {showFilterColumn ? (
                <View style={homeStyles.filterColumn}>
                  <Text style={homeStyles.filterTitle}>{commerceCopy.filterTitle}</Text>
                  <Text style={homeStyles.filterSubTitle}>{language === 'vi' ? 'Noi ban' : 'Location'}</Text>
                  {cityFilterOptions.map((item) => (
                    <Pressable
                      key={`city-next-${item.key}`}
                      style={homeStyles.filterOptionRow}
                      onPress={() => setSelectedCity(item.key as 'all' | 'hcm' | 'hanoi' | 'danang')}
                    >
                      <View style={[homeStyles.filterCheckBox, selectedCity === item.key ? homeStyles.filterCheckBoxActive : undefined]}>
                        {selectedCity === item.key ? <Text style={homeStyles.filterCheckMark}>x</Text> : null}
                      </View>
                      <Text style={homeStyles.filterOption}>{item.label}</Text>
                    </Pressable>
                  ))}

                  <Text style={[homeStyles.filterSubTitle, homeStyles.filterSubTitleSpacing]}>{language === 'vi' ? 'Nganh hang' : 'Category'}</Text>
                  {categoryFilterOptions.map((item) => (
                    <Pressable
                      key={`cate-next-${item.key}`}
                      style={homeStyles.filterOptionRow}
                      onPress={() => setSelectedCategory(item.key as 'all' | 'perfume' | 'beauty' | 'fashion' | 'home')}
                    >
                      <View style={[homeStyles.filterCheckBox, selectedCategory === item.key ? homeStyles.filterCheckBoxActive : undefined]}>
                        {selectedCategory === item.key ? <Text style={homeStyles.filterCheckMark}>x</Text> : null}
                      </View>
                      <Text style={homeStyles.filterOption}>{item.label}</Text>
                    </Pressable>
                  ))}

                  <Text style={[homeStyles.filterSubTitle, homeStyles.filterSubTitleSpacing]}>{language === 'vi' ? 'Khoang gia' : 'Price band'}</Text>
                  {priceFilterOptions.map((item) => (
                    <Pressable
                      key={`price-next-${item.key}`}
                      style={homeStyles.filterOptionRow}
                      onPress={() => setPriceBand(item.key as 'all' | 'under100' | '100to300' | 'over300')}
                    >
                      <View style={[homeStyles.filterCheckBox, priceBand === item.key ? homeStyles.filterCheckBoxActive : undefined]}>
                        {priceBand === item.key ? <Text style={homeStyles.filterCheckMark}>x</Text> : null}
                      </View>
                      <Text style={homeStyles.filterOption}>{item.label}</Text>
                    </Pressable>
                  ))}

                  <Text style={[homeStyles.filterSubTitle, homeStyles.filterSubTitleSpacing]}>{language === 'vi' ? 'Danh gia' : 'Rating'}</Text>
                  {ratingFilterOptions.map((item) => (
                    <Pressable
                      key={`rating-next-${item.key}`}
                      style={homeStyles.filterOptionRow}
                      onPress={() => setMinimumRating(item.key as 0 | 3 | 4 | 5)}
                    >
                      <View style={[homeStyles.filterCheckBox, minimumRating === item.key ? homeStyles.filterCheckBoxActive : undefined]}>
                        {minimumRating === item.key ? <Text style={homeStyles.filterCheckMark}>x</Text> : null}
                      </View>
                      <Text style={homeStyles.filterOption}>{item.label}</Text>
                    </Pressable>
                  ))}

                  <Pressable style={homeStyles.sortChip} onPress={resetSearchFilters}>
                    <Text style={homeStyles.sortChipText}>{language === 'vi' ? 'Xoa bo loc' : 'Clear filters'}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={homeStyles.resultColumn}>
                <View style={homeStyles.relatedShopBox}>
                  <Text style={homeStyles.relatedTitle}>{`${commerceCopy.relatedShop}: Epay Mall`}</Text>
                  <View style={homeStyles.relatedRow}>
                    {relatedShopProducts.map((item) => (
                      <View key={`related-${item.id}`} style={homeStyles.relatedProductItem}>
                        <Image source={{ uri: item.image }} style={homeStyles.relatedImage} />
                        <Text style={homeStyles.relatedPrice}>{formatMoney(item.price, item.currency, language)}</Text>
                      </View>
                    ))}
                    <Pressable style={homeStyles.relatedShopButton}>
                      <Text style={homeStyles.relatedShopButtonText}>{commerceCopy.viewShop}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={homeStyles.sortRow}>
                  <Text style={homeStyles.sortLabel}>{commerceCopy.sortBy}</Text>
                  <Pressable style={[homeStyles.sortChip, sortMode === 'relevant' ? homeStyles.sortChipActive : undefined]} onPress={() => setSortMode('relevant')}>
                    <Text style={[homeStyles.sortChipText, sortMode === 'relevant' ? homeStyles.sortChipTextActive : undefined]}>{commerceCopy.sortRelevant}</Text>
                  </Pressable>
                  <Pressable style={[homeStyles.sortChip, sortMode === 'newest' ? homeStyles.sortChipActive : undefined]} onPress={() => setSortMode('newest')}>
                    <Text style={[homeStyles.sortChipText, sortMode === 'newest' ? homeStyles.sortChipTextActive : undefined]}>{commerceCopy.sortNewest}</Text>
                  </Pressable>
                  <Pressable style={[homeStyles.sortChip, sortMode === 'bestseller' ? homeStyles.sortChipActive : undefined]} onPress={() => setSortMode('bestseller')}>
                    <Text style={[homeStyles.sortChipText, sortMode === 'bestseller' ? homeStyles.sortChipTextActive : undefined]}>{commerceCopy.sortBestSeller}</Text>
                  </Pressable>
                  <Pressable style={[homeStyles.sortChip, sortMode === 'price' ? homeStyles.sortChipActive : undefined]} onPress={() => setSortMode('price')}>
                    <Text style={[homeStyles.sortChipText, sortMode === 'price' ? homeStyles.sortChipTextActive : undefined]}>{commerceCopy.sortPrice}</Text>
                  </Pressable>
                </View>

                <Text style={homeStyles.resultTitle}>
                  {`${commerceCopy.searchResultFor} "${activeSearchTerm || locale.home.recommendationTitle}" (${filteredCards.length})`}
                </Text>

                {isProductsLoading ? (
                  <View style={homeStyles.loadingWrap}><ActivityIndicator color="#ee4d2d" /></View>
                ) : null}

                {!isProductsLoading && productsLoadError ? (
                  <Text style={homeStyles.apiErrorText}>{`${locale.home.productLoadFailed} ${productsLoadError}`}</Text>
                ) : null}

                {filteredCards.length === 0 && !isProductsLoading ? (
                  <View style={homeStyles.noResultBox}>
                    <Text style={homeStyles.noResultTitle}>{commerceCopy.noSearchResultTitle}</Text>
                    <Text style={homeStyles.noResultHint}>{commerceCopy.noSearchResultHint}</Text>
                  </View>
                ) : null}

                <View style={homeStyles.productGrid}>
                  {filteredCards.map((item) => (
                    <View key={item.id} style={[homeStyles.productCard, { width: productCardWidth }]}>
                      <Pressable
                        onPress={() => {
                          if (item.product) {
                            handleOpenDetail(item.product);
                          }
                        }}
                      >
                        <Image source={{ uri: item.image }} style={homeStyles.productImage} />
                      </Pressable>
                      <View style={homeStyles.productBody}>
                        <View style={homeStyles.productBadgeRow}>
                          <Text style={homeStyles.mallBadge}>Mall</Text>
                          <Text style={homeStyles.discountBadge}>-15%</Text>
                        </View>
                        <Text style={homeStyles.productName} numberOfLines={2}>{item.name}</Text>
                        <Text style={homeStyles.productPrice}>{formatMoney(item.price, item.currency, language)}</Text>
                        <Text style={homeStyles.productSold}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                        <View style={homeStyles.productActionRow}>
                          {item.product ? (
                            <>
                              <Pressable style={homeStyles.detailButton} onPress={() => handleOpenDetail(item.product as ProductItem)}>
                                <Text style={homeStyles.detailButtonText}>{commerceCopy.viewDetail}</Text>
                              </Pressable>
                              <Pressable
                                style={[homeStyles.addButton, addingProductId === item.id ? homeStyles.actionDisabled : undefined]}
                                disabled={addingProductId === item.id}
                                onPress={() => void handleAddToCart(item.product as ProductItem)}
                              >
                                <Text style={homeStyles.addButtonText}>{addingProductId === item.id ? commerceCopy.addingToCart : commerceCopy.addToCart}</Text>
                              </Pressable>
                            </>
                          ) : (
                            <Pressable style={homeStyles.detailButtonDisabled}>
                              <Text style={homeStyles.detailButtonText}>{commerceCopy.viewDetail}</Text>
                            </Pressable>
                          )}
                        </View>
                        <Pressable style={homeStyles.chatSellerButton} onPress={() => handleOpenChat(item.shopName)}>
                          <Text style={homeStyles.chatSellerButtonText}>{commerceCopy.chatWithSeller}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
              </View>
              </>
            )}
            </View>
        ) : null}

        {homeView === 'mall' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.searchPageWrap]}>
            {isMobile ? (
              <>
                <View style={homeStyles.mobileScreenHeader}>
                  <Text style={homeStyles.mobileScreenHeaderTitle}>Epay Mall</Text>
                  <Pressable onPress={() => setHomeView('search')}>
                    <Text style={homeStyles.mobileScreenHeaderAction}>{language === 'vi' ? 'Trang chu' : 'Home'}</Text>
                  </Pressable>
                </View>

                <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1dfd7', padding: 12, marginBottom: 12 }}>
                  <Text style={{ color: '#ee4d2d', fontSize: 18, fontWeight: '800' }}>Mall Official</Text>
                  <Text style={{ color: '#6e6e6e', marginTop: 4 }}>
                    {language === 'vi' ? 'Shop chinh hang, giao nhanh, bao hanh ro rang' : 'Official stores with verified products'}
                  </Text>
                </View>

                <View style={homeStyles.mobileProductGrid}>
                  {mallShowcaseProducts.map((item) => (
                    <Pressable
                      key={`mall-${item.id}`}
                      style={homeStyles.mobileProductCard}
                      onPress={() => {
                        if (item.product) {
                          handleOpenDetail(item.product);
                        }
                      }}
                    >
                      <Image source={{ uri: item.image }} style={homeStyles.mobileProductImage} />
                      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#ee4d2d', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>MALL</Text>
                      </View>
                      <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>#{item.mallRank}</Text>
                      </View>
                      <Text style={homeStyles.mobileProductName} numberOfLines={2}>{item.name}</Text>
                      <Text style={homeStyles.mobileProductPrice}>{formatMoney(item.price, item.currency, language)}</Text>
                      <Text style={homeStyles.mobileProductMeta}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <View style={homeStyles.emptyCard}>
                <Text style={homeStyles.emptyText}>Mall view is optimized for mobile.</Text>
              </View>
            )}
          </View>
        ) : null}

        {homeView === 'live' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.searchPageWrap]}>
            {isMobile ? (
              <>
                <View style={homeStyles.mobileScreenHeader}>
                  <Text style={homeStyles.mobileScreenHeaderTitle}>Epay Live</Text>
                  <Pressable onPress={() => setHomeView('search')}>
                    <Text style={homeStyles.mobileScreenHeaderAction}>{language === 'vi' ? 'Trang chu' : 'Home'}</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 12 }}>
                  {demoLiveSessions.map((session) => (
                    <Pressable key={session.id} style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f0d7ce', overflow: 'hidden' }}>
                      <View>
                        <Image source={{ uri: session.cover }} style={{ width: '100%', height: 180 }} />
                        <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#ef4444', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>LIVE</Text>
                        </View>
                        <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(17,24,39,0.8)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>{session.viewers}</Text>
                        </View>
                      </View>
                      <View style={{ padding: 12 }}>
                        <Text style={{ fontSize: 13, color: '#ef6a4d', fontWeight: '700' }}>{session.host}</Text>
                        <Text style={{ fontSize: 16, color: '#0f172a', fontWeight: '700', marginTop: 4 }}>{session.title}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                <Text style={{ marginTop: 14, marginBottom: 10, color: '#0f172a', fontWeight: '700', fontSize: 18 }}>
                  {language === 'vi' ? 'San pham dang len live' : 'Live featured products'}
                </Text>
                <View style={homeStyles.mobileProductGrid}>
                  {liveShowcaseProducts.map((item) => (
                    <Pressable
                      key={`live-product-${item.id}`}
                      style={homeStyles.mobileProductCard}
                      onPress={() => {
                        if (item.product) {
                          handleOpenDetail(item.product);
                        }
                      }}
                    >
                      <Image source={{ uri: item.image }} style={homeStyles.mobileProductImage} />
                      <Text style={homeStyles.mobileProductName} numberOfLines={2}>{item.name}</Text>
                      <Text style={homeStyles.mobileProductPrice}>{formatMoney(item.price, item.currency, language)}</Text>
                      <Text style={homeStyles.mobileProductMeta}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <View style={homeStyles.emptyCard}>
                <Text style={homeStyles.emptyText}>Live view is optimized for mobile.</Text>
              </View>
            )}
          </View>
        ) : null}

        {homeView === 'detail' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.detailPageWrap]}>
            {isMobile ? (
              <View style={homeStyles.mobileScreenHeader}>
                <Pressable onPress={() => setHomeView('search')}>
                  <Text style={homeStyles.mobileBackButton}>{"<"}</Text>
                </Pressable>
                <Text style={homeStyles.mobileScreenHeaderTitle} numberOfLines={1}>{selectedProductDisplay?.name ?? selectedProduct?.name ?? ''}</Text>
                <Pressable onPress={() => void handleOpenCart()}>
                  <Text style={homeStyles.mobileScreenHeaderAction}>GIỎ</Text>
                </Pressable>
              </View>
            ) : (
              <View style={homeStyles.detailBreadcrumbRow}>
                <Pressable onPress={() => setHomeView('search')}>
                  <Text style={homeStyles.backToSearchText}>{commerceCopy.backToSearch}</Text>
                </Pressable>
                {selectedProductDisplay ? <Text style={homeStyles.breadcrumbName}> / {selectedProductDisplay.name}</Text> : null}
              </View>
            )}

            {selectedProduct ? (
              <>
                <View style={[homeStyles.detailCard, isMobile ? homeStyles.mobileDetailCard : undefined]}>
                  <View style={[homeStyles.detailImageColumn, isMobile ? homeStyles.mobileDetailImageColumn : undefined]}>
                    {didMainImageFail ? (
                      <View style={homeStyles.detailMainImageFallback}>
                        <Text style={homeStyles.detailMainImageFallbackText}>Image unavailable</Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: selectedImage }}
                        style={[homeStyles.detailMainImage, isMobile ? homeStyles.mobileDetailMainImage : undefined]}
                        resizeMode="cover"
                        onError={handleDetailMainImageError}
                      />
                    )}
                    <View style={homeStyles.thumbnailRow}>
                      {selectedGallery.slice(0, isMobile ? 8 : 5).map((thumb, index) => {
                        return (
                          <Pressable
                            key={`thumb-${index}`}
                            style={[
                              homeStyles.thumbnailButton,
                              isMobile ? homeStyles.mobileThumbnailButton : undefined,
                              selectedImage === thumb ? homeStyles.thumbnailButtonActive : undefined
                            ]}
                            onPress={() => setSelectedImage(thumb)}
                          >
                            <Image source={{ uri: thumb }} style={[homeStyles.thumbnailImage, isMobile ? homeStyles.mobileThumbnailImage : undefined]} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={[homeStyles.detailInfoColumn, isMobile ? homeStyles.mobileDetailInfoColumn : undefined]}>
                    <View style={homeStyles.detailTagRow}>
                      <Text style={homeStyles.detailTagFavorite}>Yêu thích+</Text>
                      <Text style={homeStyles.detailTagMall}>Mall Chính Hãng</Text>
                    </View>
                    <Text style={[homeStyles.detailName, isMobile ? homeStyles.mobileDetailName : undefined]}>{selectedProductDisplay?.name ?? selectedProduct.name}</Text>
                    <View style={homeStyles.detailMetaRow}>
                      <Text style={homeStyles.detailMetaText}>{selectedProductCard ? selectedProductCard.rating.toFixed(1) : '4.9'}</Text>
                      <Text style={homeStyles.detailMetaDivider}>|</Text>
                      <Text style={homeStyles.detailMetaText}>{`${locale.home.soldPrefix} ${selectedProductCard?.sold ?? '13k+'}`}</Text>
                    </View>

                    <View style={[homeStyles.detailPricePanel, isMobile ? homeStyles.mobileDetailPricePanel : undefined]}>
                      <View style={homeStyles.detailPriceTopRow}>
                        <Text style={homeStyles.detailOldPriceText}>{formatMoney(selectedComparePrice, selectedCurrency, language)}</Text>
                        <Text style={homeStyles.detailDiscountBadge}>-{selectedDiscountPercent}%</Text>
                      </View>
                      <Text style={[homeStyles.detailPriceText, isMobile ? homeStyles.mobileDetailPriceText : undefined]}>{formatMoney(selectedPrice, selectedCurrency, language)}</Text>
                    </View>

                    <View style={homeStyles.detailInfoList}>
                      <Text style={homeStyles.shippingText}>Mã giảm giá: Giảm 25k • Giảm 50k</Text>
                      <Text style={homeStyles.shippingText}>Vận chuyển: Nhận hàng trong 2-3 ngày • Miễn phí vận chuyển</Text>
                      <Text style={homeStyles.shippingText}>An tâm mua sắm: Trả hàng 15 ngày • Chính hãng 100%</Text>
                    </View>

                    <View style={homeStyles.quantityRow}>
                      <Text style={homeStyles.quantityLabel}>{commerceCopy.quantity}</Text>
                      <View style={homeStyles.quantityControl}>
                        <Pressable style={homeStyles.qtyButton} onPress={() => setDetailQuantity((prev) => Math.max(1, prev - 1))}>
                          <Text style={homeStyles.qtyButtonText}>-</Text>
                        </Pressable>
                        <Text style={homeStyles.qtyValue}>{detailQuantity}</Text>
                        <Pressable style={homeStyles.qtyButton} onPress={() => setDetailQuantity((prev) => Math.min(99, prev + 1))}>
                          <Text style={homeStyles.qtyButtonText}>+</Text>
                        </Pressable>
                      </View>
                      <Text style={homeStyles.detailStockText}>Còn hàng</Text>
                    </View>

                    <View style={[homeStyles.detailActionRow, isMobile ? homeStyles.mobileDetailActionRow : undefined]}>
                      <Pressable
                        style={[
                          homeStyles.detailAddButton,
                          isMobile ? homeStyles.mobileDetailAddButton : undefined,
                          addingProductId === selectedProduct.id ? homeStyles.actionDisabled : undefined
                        ]}
                        disabled={addingProductId === selectedProduct.id}
                        onPress={() => void handleAddToCart(selectedProduct, detailQuantity)}
                      >
                        <Text style={homeStyles.detailAddButtonText}>{addingProductId === selectedProduct.id ? commerceCopy.addingToCart : commerceCopy.addToCart}</Text>
                      </Pressable>

                      <Pressable
                        style={[homeStyles.detailBuyButton, isMobile ? homeStyles.mobileDetailBuyButton : undefined, orderingProductId === selectedProduct.id ? homeStyles.actionDisabled : undefined]}
                        disabled={orderingProductId === selectedProduct.id}
                        onPress={() => void handlePlaceOrder(selectedProduct, detailQuantity)}
                      >
                        <Text style={homeStyles.detailBuyButtonText}>{orderingProductId === selectedProduct.id ? commerceCopy.placingOrder : commerceCopy.buyNow}</Text>
                      </Pressable>

                      <Pressable
                        style={[homeStyles.detailChatButton, isMobile ? homeStyles.mobileDetailChatButton : undefined]}
                        onPress={() => handleOpenChat(selectedProductDisplay?.shopName ?? selectedProduct.sellerId.slice(0, 6).toUpperCase())}
                      >
                        <Text style={homeStyles.detailChatButtonText}>{commerceCopy.chatWithSeller}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={homeStyles.detailShopCard}>
                  <View style={homeStyles.detailShopLeft}>
                    <View style={homeStyles.detailShopAvatar}>
                      <Text style={homeStyles.detailShopAvatarText}>Epay</Text>
                    </View>
                    <View>
                      <Text style={homeStyles.detailShopName}>{selectedProductDisplay?.shopName ?? 'Epay Mall'}</Text>
                      <Text style={homeStyles.detailShopStatus}>Online • Phản hồi trong vài phút</Text>
                    </View>
                  </View>
                  <View style={[homeStyles.detailShopStatRow, isMobile ? homeStyles.mobileDetailShopStatRow : undefined]}>
                    <Text style={homeStyles.detailShopStat}>Đánh giá: 4.9</Text>
                    <Text style={homeStyles.detailShopStat}>Sản phẩm: 4.5k</Text>
                    <Text style={homeStyles.detailShopStat}>Tỷ lệ phản hồi: 99%</Text>
                  </View>
                </View>

                <View style={homeStyles.detailDescriptionBox}>
                  <Text style={homeStyles.detailDescriptionTitle}>{commerceCopy.detailTitle}</Text>
                  <Text style={homeStyles.detailDescriptionText}>{selectedProductDisplay?.description ?? selectedProduct.description ?? commerceCopy.detailFallback}</Text>
                </View>
              </>
            ) : (
              <View style={homeStyles.emptyCard}><Text style={homeStyles.emptyText}>Chưa chọn sản phẩm.</Text></View>
            )}
          </View>
        ) : null}

        {homeView === 'notice' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.mobileNoticeWrap]}>
            <View style={homeStyles.mobileScreenHeader}>
              <Text style={homeStyles.mobileScreenHeaderTitle}>{mobileCopy.notifyTitle}</Text>
              <View style={homeStyles.mobileNoticeHeaderActions}>
                <Pressable style={homeStyles.mobileNoticeIconButton} onPress={() => void handleOpenCart()}>
                  <Text style={homeStyles.mobileNoticeIconText}>GIỎ</Text>
                  <View style={homeStyles.mobileHeaderCount}>
                    <Text style={homeStyles.mobileHeaderCountText}>{cartItemsCount}</Text>
                  </View>
                </Pressable>
                <Pressable style={homeStyles.mobileNoticeIconButton} onPress={() => handleOpenChat('Epay Mall')}>
                  <Text style={homeStyles.mobileNoticeIconText}>CHAT</Text>
                </Pressable>
              </View>
            </View>

            <View style={homeStyles.mobileNoticeList}>
              {notifications.map((item) => (
                <Pressable key={item.id} style={homeStyles.mobileNoticeItem}>
                  <View style={homeStyles.mobileNoticeBullet}>
                    <Text style={homeStyles.mobileNoticeBulletText}>Epay</Text>
                  </View>
                  <View style={homeStyles.mobileNoticeBody}>
                    <Text style={homeStyles.mobileNoticeTitle}>{item.title}</Text>
                    <Text style={homeStyles.mobileNoticePreview} numberOfLines={1}>{item.preview}</Text>
                  </View>
                  <View style={homeStyles.mobileNoticeBadge}>
                    <Text style={homeStyles.mobileNoticeBadgeText}>{item.unread}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={homeStyles.mobileNoticeOrderHead}>
              <Text style={homeStyles.mobileNoticeOrderTitle}>{mobileCopy.orderUpdate}</Text>
              <Text style={homeStyles.mobileNoticeOrderReadAll}>{mobileCopy.readAll}</Text>
            </View>

            <View style={homeStyles.mobileNoticeEmptyBox}>
              <Text style={homeStyles.mobileNoticeEmptyIcon}>Epay</Text>
              <Text style={homeStyles.mobileNoticeEmptyText}>{mobileCopy.notifyEmpty}</Text>
              <Pressable style={homeStyles.mobileNoticeCTA} onPress={() => setHomeView('search')}>
                <Text style={homeStyles.mobileNoticeCTAText}>{mobileCopy.chatNow}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {homeView === 'user' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.mobileUserWrap]}>
            <View style={homeStyles.mobileUserHeader}>
              <View style={homeStyles.mobileUserTopRow}>
                <Pressable style={homeStyles.mobileUserSellButton}>
                  <Text style={homeStyles.mobileUserSellText}>Bắt đầu bán</Text>
                </Pressable>
                <View style={homeStyles.mobileUserIconRow}>
                  <Pressable style={homeStyles.mobileUserIcon} onPress={openProfileModal}>
                    <Text style={homeStyles.mobileUserIconText}>SET</Text>
                  </Pressable>
                  <Pressable style={homeStyles.mobileUserIcon} onPress={() => void handleOpenCart()}>
                    <Text style={homeStyles.mobileUserIconText}>GIỎ</Text>
                  </Pressable>
                  <Pressable style={homeStyles.mobileUserIcon} onPress={() => handleOpenChat('Epay Mall')}>
                    <Text style={homeStyles.mobileUserIconText}>CHAT</Text>
                  </Pressable>
                </View>
              </View>

              <View style={homeStyles.mobileUserProfileRow}>
                <Image
                  source={{ uri: profile.avatarUrl }}
                  style={homeStyles.mobileUserAvatar}
                />
                <View>
                  <Text style={homeStyles.mobileUserName}>{profile.displayName || (user?.email?.split('@')[0] ?? 'guest_user')}</Text>
                  <Text style={homeStyles.mobileUserStats}>{`${profile.location} | ${profile.bio}`}</Text>
                </View>
              </View>

              <Pressable
                style={homeStyles.mobileUserProfileEditButton}
                onPress={openProfileModal}
              >
                <Text style={homeStyles.mobileUserProfileEditText}>{language === 'vi' ? 'Tao/Sua ho so' : 'Create/Edit profile'}</Text>
              </Pressable>
            </View>

            <View style={homeStyles.mobileUserVoucherRow}>
              <Text style={homeStyles.mobileUserVoucherText}>VIP • Nhận voucher giảm 20% mỗi ngày</Text>
            </View>

            <View style={homeStyles.mobileUserSection}>
              <View style={homeStyles.mobileUserSectionHead}>
                <Text style={homeStyles.mobileUserSectionTitle}>{mobileCopy.orderSection}</Text>
                <Text style={homeStyles.mobileUserSectionAction}>{mobileCopy.orderHistory}</Text>
              </View>
              <View style={homeStyles.mobileUserOrderRow}>
                {['Chờ xác nhận', 'Chờ lấy hàng', 'Chờ giao hàng', 'Đánh giá'].map((item) => (
                  <View key={item} style={homeStyles.mobileUserOrderItem}>
                    <Text style={homeStyles.mobileUserOrderIcon}>O</Text>
                    <Text style={homeStyles.mobileUserOrderText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={homeStyles.mobileUserSection}>
              <View style={homeStyles.mobileUserSectionHead}>
                <Text style={homeStyles.mobileUserSectionTitle}>{mobileCopy.utilities}</Text>
              </View>
              <View style={homeStyles.mobileUserUtilityRow}>
                {['Ví EpayPay', 'SPayLater', 'Shopee Xu', 'Kho voucher'].map((item) => (
                  <View key={item} style={homeStyles.mobileUserUtilityItem}>
                    <Text style={homeStyles.mobileUserUtilityIcon}>O</Text>
                    <Text style={homeStyles.mobileUserUtilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={homeStyles.mobileUserSection}>
              <View style={homeStyles.mobileUserSectionHead}>
                <Text style={homeStyles.mobileUserSectionTitle}>{mobileCopy.finance}</Text>
                <Text style={homeStyles.mobileUserSectionAction}>{mobileCopy.more}</Text>
              </View>
              <View style={homeStyles.mobileUserUtilityRow}>
                {['Vay tiền nhanh', 'Tài chính Epay', 'Bảo hiểm của tôi'].map((item) => (
                  <View key={item} style={[homeStyles.mobileUserUtilityItem, { width: '32%' }]}>
                    <Text style={homeStyles.mobileUserUtilityIcon}>O</Text>
                    <Text style={homeStyles.mobileUserUtilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={homeStyles.mobileUserSection}>
              <View style={homeStyles.mobileUserSectionHead}>
                <Text style={homeStyles.mobileUserSectionTitle}>Tiện ích khác</Text>
                <Text style={homeStyles.mobileUserSectionAction}>Xem tất cả</Text>
              </View>
              <View style={homeStyles.mobileUserUtilityRow}>
                {['Khách hàng thân thiết', 'Kênh người sáng tạo'].map((item) => (
                  <View key={item} style={homeStyles.mobileUserExtraItem}>
                    <Text style={homeStyles.mobileUserUtilityText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {homeView === 'cart' ? (
          <View style={[isMobile ? homeStyles.mobilePageContainer : homeStyles.centerContainer, homeStyles.cartPageWrap]}>
            {isMobile ? (
              <View style={homeStyles.mobileScreenHeader}>
                <Pressable onPress={() => setHomeView('search')}>
                  <Text style={homeStyles.mobileBackButton}>{"<"}</Text>
                </Pressable>
                <Text style={homeStyles.mobileScreenHeaderTitle}>{`${commerceCopy.cartTitle} (${cartItemsCount})`}</Text>
                <Text style={homeStyles.mobileScreenHeaderAction}>{mobileCopy.cartEdit}</Text>
              </View>
            ) : (
              <View style={homeStyles.cartHeaderRow}>
                <Pressable onPress={() => setHomeView('search')}>
                  <Text style={homeStyles.backToSearchText}>{commerceCopy.backToSearch}</Text>
                </Pressable>
                <Text style={homeStyles.cartHeaderTitle}>{commerceCopy.cartTitle}</Text>
              </View>
            )}

            {!user || user.role !== 'CUSTOMER' ? (
              <View style={homeStyles.cartLoginBox}>
                <Text style={homeStyles.cartLoginText}>{commerceCopy.pleaseSignInCart}</Text>
                <Pressable style={homeStyles.cartLoginButton} onPress={onOpenLogin}>
                  <Text style={homeStyles.cartLoginButtonText}>{commerceCopy.goToSignIn}</Text>
                </Pressable>
              </View>
            ) : isCartLoading ? (
              <View style={homeStyles.loadingWrap}><ActivityIndicator color="#ee4d2d" /></View>
            ) : cart && cart.items.length > 0 ? (
              <>
                {isMobile ? (
                  <View style={homeStyles.mobileCartGroupList}>
                    {cartGroups.map((group) => {
                      const groupIds = group.items.map((item) => item.id);
                      const isGroupSelected = groupIds.length > 0 && groupIds.every((id) => selectedItemSet.has(id));
                      return (
                        <View key={group.sellerId} style={homeStyles.mobileCartShopCard}>
                          <View style={homeStyles.mobileCartShopHeader}>
                            <Pressable
                              style={[homeStyles.mobileCheckbox, isGroupSelected ? homeStyles.mobileCheckboxActive : undefined]}
                              onPress={() => toggleShopSelection(group)}
                            >
                              {isGroupSelected ? <Text style={homeStyles.mobileCheckboxMark}>x</Text> : null}
                            </Pressable>
                            <Text style={homeStyles.mobileCartShopName}>{group.shopName}</Text>
                            <Text style={homeStyles.mobileCartEdit}>{mobileCopy.cartEdit}</Text>
                          </View>

                          <View style={homeStyles.mobileCartHintRow}>
                            <Text style={homeStyles.mobileCartHintText}>{mobileCopy.freeShip}</Text>
                          </View>

                          {group.items.map((item) => {
                            const isSelected = selectedItemSet.has(item.id);
                            return (
                              <View key={item.id} style={homeStyles.mobileCartItemRow}>
                                <Pressable
                                  style={[homeStyles.mobileCheckbox, isSelected ? homeStyles.mobileCheckboxActive : undefined]}
                                  onPress={() => toggleCartItemSelection(item.id)}
                                >
                                  {isSelected ? <Text style={homeStyles.mobileCheckboxMark}>x</Text> : null}
                                </Pressable>
                                <Image
                                  source={{ uri: item.image ?? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=220&q=60' }}
                                  style={homeStyles.mobileCartImage}
                                />
                                <View style={homeStyles.mobileCartItemInfo}>
                                  <Text style={homeStyles.mobileCartItemName} numberOfLines={2}>{item.name}</Text>
                                  <Text style={homeStyles.mobileCartItemPrice}>{formatMoney(item.unitPrice, cart.currency, language)}</Text>
                                  <View style={homeStyles.mobileCartQtyRow}>
                                    <Pressable
                                      style={homeStyles.mobileQtyButton}
                                      disabled={cartUpdatingItemId === item.id}
                                      onPress={() => void handleAdjustCartItem(item.id, Math.max(0, item.quantity - 1))}
                                    >
                                      <Text style={homeStyles.mobileQtyButtonText}>-</Text>
                                    </Pressable>
                                    <Text style={homeStyles.mobileQtyValue}>{item.quantity}</Text>
                                    <Pressable
                                      style={homeStyles.mobileQtyButton}
                                      disabled={cartUpdatingItemId === item.id}
                                      onPress={() => void handleAdjustCartItem(item.id, item.quantity + 1)}
                                    >
                                      <Text style={homeStyles.mobileQtyButtonText}>+</Text>
                                    </Pressable>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <>
                    <View style={homeStyles.cartTableHeader}>
                      <Text style={[homeStyles.cartHeaderCell, homeStyles.cartHeaderProduct]}>Sản phẩm</Text>
                      <Text style={[homeStyles.cartHeaderCell, homeStyles.cartHeaderPrice]}>Đơn giá</Text>
                      <Text style={[homeStyles.cartHeaderCell, homeStyles.cartHeaderQty]}>Số lượng</Text>
                      <Text style={[homeStyles.cartHeaderCell, homeStyles.cartHeaderTotal]}>Số tiền</Text>
                      <Text style={[homeStyles.cartHeaderCell, homeStyles.cartHeaderAction]}>Thao tác</Text>
                    </View>

                    <View style={homeStyles.cartListWrap}>
                      {cart.items.map((item) => (
                        <View key={item.id} style={homeStyles.cartRow}>
                          <View style={[homeStyles.cartCell, homeStyles.cartCellProduct]}>
                            <Image
                              source={{ uri: item.image ?? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=220&q=60' }}
                              style={homeStyles.cartItemImage}
                            />
                            <Text style={homeStyles.cartItemName} numberOfLines={2}>{item.name}</Text>
                          </View>

                          <View style={[homeStyles.cartCell, homeStyles.cartCellPrice]}>
                            <Text style={homeStyles.cartPriceText}>{formatMoney(item.unitPrice, cart.currency, language)}</Text>
                          </View>

                          <View style={[homeStyles.cartCell, homeStyles.cartCellQty]}>
                            <View style={homeStyles.quantityControl}>
                              <Pressable
                                style={homeStyles.qtyButton}
                                disabled={cartUpdatingItemId === item.id}
                                onPress={() => void handleAdjustCartItem(item.id, Math.max(0, item.quantity - 1))}
                              >
                                <Text style={homeStyles.qtyButtonText}>-</Text>
                              </Pressable>
                              <Text style={homeStyles.qtyValue}>{item.quantity}</Text>
                              <Pressable
                                style={homeStyles.qtyButton}
                                disabled={cartUpdatingItemId === item.id}
                                onPress={() => void handleAdjustCartItem(item.id, item.quantity + 1)}
                              >
                                <Text style={homeStyles.qtyButtonText}>+</Text>
                              </Pressable>
                            </View>
                          </View>

                          <View style={[homeStyles.cartCell, homeStyles.cartCellTotal]}>
                            <Text style={homeStyles.cartTotalText}>{formatMoney(item.lineTotal, cart.currency, language)}</Text>
                          </View>

                          <View style={[homeStyles.cartCell, homeStyles.cartCellAction]}>
                            <Pressable onPress={() => void handleAdjustCartItem(item.id, 0)}>
                              <Text style={homeStyles.removeText}>{commerceCopy.remove}</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                <View style={[homeStyles.cartSummaryBar, isMobile ? homeStyles.mobileCartSummaryBar : undefined]}>
                  <Pressable style={homeStyles.mobileSelectAllRow} onPress={toggleSelectAllCart}>
                    <View style={[homeStyles.mobileCheckbox, selectedCartItemIds.length === cart.items.length ? homeStyles.mobileCheckboxActive : undefined]}>
                      {selectedCartItemIds.length === cart.items.length ? <Text style={homeStyles.mobileCheckboxMark}>x</Text> : null}
                    </View>
                    <Text style={homeStyles.mobileSelectAllText}>{mobileCopy.selectAll}</Text>
                  </Pressable>

                  <View>
                    <Text style={homeStyles.cartSummaryMuted}>{`${commerceCopy.subtotal}: ${formatMoney(selectedSubtotal, cart.currency, language)}`}</Text>
                    <Text style={homeStyles.cartSummaryStrong}>{`${commerceCopy.total}: ${formatMoney(selectedSubtotal, cart.currency, language)}`}</Text>
                  </View>

                  <Pressable
                    style={[homeStyles.checkoutButton, isMobile ? homeStyles.mobileCheckoutButton : undefined, orderingProductId === 'checkout-cart' ? homeStyles.actionDisabled : undefined]}
                    disabled={orderingProductId === 'checkout-cart'}
                    onPress={() => void handleCheckoutCart()}
                  >
                    <Text style={homeStyles.checkoutButtonText}>
                      {orderingProductId === 'checkout-cart' ? commerceCopy.placingOrder : `${mobileCopy.buySelected} (${selectedQuantity})`}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={homeStyles.emptyCard}><Text style={homeStyles.emptyText}>{commerceCopy.cartEmpty}</Text></View>
            )}
          </View>
        ) : null}
        </View>
      </ScrollView>

      {isMobile && (homeView === 'search' || homeView === 'mall' || homeView === 'live' || homeView === 'notice' || homeView === 'user') ? (
        <View style={homeStyles.mobileBottomNav}>
          {mobileTabs.map((tab) => {
            const isActive = activeMobileTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={homeStyles.mobileBottomNavItem}
                onPress={() => {
                  setActiveMobileTab(tab.key);
                  setHomeView(tab.view);
                }}
              >
                <View style={[homeStyles.mobileBottomNavIconWrap, isActive ? homeStyles.mobileBottomNavIconWrapActive : undefined]}>
                  <Text style={[homeStyles.mobileBottomNavIcon, isActive ? homeStyles.mobileBottomNavIconActive : undefined]}>
                    {isActive ? tab.iconActive : tab.icon}
                  </Text>
                </View>
                <Text style={[homeStyles.mobileBottomNavLabel, isActive ? homeStyles.mobileBottomNavLabelActive : undefined]}>
                  {tab.key === 'home'
                    ? mobileCopy.home
                    : tab.key === 'mall'
                      ? mobileCopy.mall
                      : tab.key === 'live'
                        ? mobileCopy.live
                        : tab.key === 'notice'
                          ? mobileCopy.notice
                          : mobileCopy.user}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Modal visible={isProfileModalOpen} transparent animationType="slide" onRequestClose={() => setIsProfileModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a' }}>
              {language === 'vi' ? 'Tao ho so ca nhan' : 'Create profile'}
            </Text>
            <TextInput
              value={profileDraft.displayName}
              onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, displayName: value }))}
              placeholder={language === 'vi' ? 'Ten hien thi' : 'Display name'}
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TextInput
              value={profileDraft.location}
              onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, location: value }))}
              placeholder={language === 'vi' ? 'Khu vuc' : 'Location'}
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TextInput
              value={profileDraft.avatarUrl}
              onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, avatarUrl: value }))}
              placeholder={language === 'vi' ? 'URL anh dai dien' : 'Avatar URL'}
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            <TextInput
              value={profileDraft.bio}
              onChangeText={(value) => setProfileDraft((prev) => ({ ...prev, bio: value }))}
              placeholder={language === 'vi' ? 'Gioi thieu ngan' : 'Short bio'}
              multiline
              numberOfLines={3}
              style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 76 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={{ flex: 1, borderWidth: 1, borderColor: '#ee4d2d', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setIsProfileModalOpen(false)}
              >
                <Text style={{ color: '#ee4d2d', fontWeight: '700' }}>{language === 'vi' ? 'Huy' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, backgroundColor: '#ee4d2d', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => void saveProfileDraft()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{language === 'vi' ? 'Luu ho so' : 'Save profile'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {isChatOpen ? (
        <View style={homeStyles.chatPanel}>
          <View style={homeStyles.chatPanelHeader}>
            <View>
              <Text style={homeStyles.chatPanelTitle}>{commerceCopy.chatTitle}</Text>
              <Text style={homeStyles.chatPanelShopName}>{chatShopName}</Text>
            </View>
            <Pressable onPress={() => setIsChatOpen(false)} style={homeStyles.chatCloseButton}>
              <Text style={homeStyles.chatCloseButtonText}>x</Text>
            </Pressable>
          </View>

          <View style={homeStyles.chatMessagesArea}>
            {chatMessages.map((message) => (
              <View
                key={message.id}
                style={message.sender === 'buyer' ? homeStyles.chatBubbleBuyerWrap : homeStyles.chatBubbleSellerWrap}
              >
                <View style={message.sender === 'buyer' ? homeStyles.chatBubbleBuyer : homeStyles.chatBubbleSeller}>
                  <Text style={homeStyles.chatBubbleText}>{message.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={homeStyles.chatInputRow}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={commerceCopy.chatPlaceholder}
              placeholderTextColor="#9f9f9f"
              style={homeStyles.chatInput}
              onSubmitEditing={handleSendChat}
            />
            <Pressable style={homeStyles.chatSendButton} onPress={handleSendChat}>
              <Text style={homeStyles.chatSendButtonText}>{commerceCopy.chatSend}</Text>
            </Pressable>
          </View>
        </View>
      ) : !isMobile ? (
        <Pressable style={homeStyles.chatFloatingButton} onPress={() => handleOpenChat('Epay Mall')}>
          <Text style={homeStyles.chatFloatingButtonText}>{commerceCopy.chatTitle}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}





