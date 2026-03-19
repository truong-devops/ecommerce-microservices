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

export const keywords = [
  'phone case',
  'air fryer',
  'wireless earbuds',
  't-shirt',
  'office lamp',
  'running shoes'
];

export const flashSaleItems: FlashSaleItem[] = [
  {
    id: 'fs-1',
    name: 'USB-C Cable Set',
    price: 9.9,
    discountPercent: 42,
    soldLabel: 'Hot sale',
    image: 'https://picsum.photos/seed/fs1/360/360'
  },
  {
    id: 'fs-2',
    name: 'Mini Bluetooth Speaker',
    price: 14.5,
    discountPercent: 31,
    soldLabel: 'Fast moving',
    image: 'https://picsum.photos/seed/fs2/360/360'
  },
  {
    id: 'fs-3',
    name: 'Travel Storage Box',
    price: 12.2,
    discountPercent: 26,
    soldLabel: 'Trending',
    image: 'https://picsum.photos/seed/fs3/360/360'
  },
  {
    id: 'fs-4',
    name: 'Slip-On Sandals',
    price: 11.8,
    discountPercent: 60,
    soldLabel: 'Best choice',
    image: 'https://picsum.photos/seed/fs4/360/360'
  },
  {
    id: 'fs-5',
    name: 'Portable Fan',
    price: 18.7,
    discountPercent: 29,
    soldLabel: 'Almost gone',
    image: 'https://picsum.photos/seed/fs5/360/360'
  },
  {
    id: 'fs-6',
    name: 'Desk Organizer',
    price: 7.6,
    discountPercent: 48,
    soldLabel: 'Top pick',
    image: 'https://picsum.photos/seed/fs6/360/360'
  }
];

export const mallDeals: MallDealItem[] = [
  { id: 'mall-1', brand: 'AURORA', title: 'Up to 50% off', image: 'https://picsum.photos/seed/mall1/240/240' },
  { id: 'mall-2', brand: 'NOVA', title: 'Buy 1 get 1', image: 'https://picsum.photos/seed/mall2/240/240' },
  { id: 'mall-3', brand: 'LUMI', title: 'Gift with order', image: 'https://picsum.photos/seed/mall3/240/240' },
  { id: 'mall-4', brand: 'VANTA', title: 'Daily vouchers', image: 'https://picsum.photos/seed/mall4/240/240' },
  { id: 'mall-5', brand: 'MIRA', title: 'Free shipping', image: 'https://picsum.photos/seed/mall5/240/240' },
  { id: 'mall-6', brand: 'VELA', title: 'Member rewards', image: 'https://picsum.photos/seed/mall6/240/240' },
  { id: 'mall-7', brand: 'SOLA', title: 'Combo discounts', image: 'https://picsum.photos/seed/mall7/240/240' },
  { id: 'mall-8', brand: 'ORBIT', title: 'New arrivals', image: 'https://picsum.photos/seed/mall8/240/240' }
];

export const topSearchItems: TopSearchItem[] = [
  { id: 'top-1', name: 'Street Tee', soldPerMonth: '52k / month', image: 'https://picsum.photos/seed/top1/300/300' },
  { id: 'top-2', name: 'Comfort Bra', soldPerMonth: '63k / month', image: 'https://picsum.photos/seed/top2/300/300' },
  { id: 'top-3', name: 'Indoor Slippers', soldPerMonth: '57k / month', image: 'https://picsum.photos/seed/top3/300/300' },
  { id: 'top-4', name: 'Lip Tint Set', soldPerMonth: '92k / month', image: 'https://picsum.photos/seed/top4/300/300' },
  { id: 'top-5', name: 'Travel Mirror', soldPerMonth: '33k / month', image: 'https://picsum.photos/seed/top5/300/300' },
  { id: 'top-6', name: 'Phone Tripod', soldPerMonth: '41k / month', image: 'https://picsum.photos/seed/top6/300/300' }
];

export const recommendationProducts: ProductItem[] = [
  { id: 'p-1', title: 'Soft Home Slippers', price: 15, sold: '10k+', discountPercent: 40, image: 'https://picsum.photos/seed/p1/500/500' },
  { id: 'p-2', title: 'Bluetooth Earbuds', price: 29, sold: '8k+', discountPercent: 35, image: 'https://picsum.photos/seed/p2/500/500' },
  { id: 'p-3', title: 'Mini USB Fan', price: 11, sold: '6k+', discountPercent: 28, image: 'https://picsum.photos/seed/p3/500/500' },
  { id: 'p-4', title: 'Waterproof Lamp', price: 22, sold: '12k+', discountPercent: 41, image: 'https://picsum.photos/seed/p4/500/500' },
  { id: 'p-5', title: 'Bike Helmet', price: 30, sold: '3k+', discountPercent: 24, image: 'https://picsum.photos/seed/p5/500/500' },
  { id: 'p-6', title: 'RGB Light Strip', price: 18, sold: '7k+', discountPercent: 33, image: 'https://picsum.photos/seed/p6/500/500' },
  { id: 'p-7', title: 'Daily Backpack', price: 26, sold: '5k+', discountPercent: 31, image: 'https://picsum.photos/seed/p7/500/500' },
  { id: 'p-8', title: 'Portable Speaker', price: 32, sold: '9k+', discountPercent: 22, image: 'https://picsum.photos/seed/p8/500/500' },
  { id: 'p-9', title: 'Sport Sneakers', price: 39, sold: '4k+', discountPercent: 27, image: 'https://picsum.photos/seed/p9/500/500' },
  { id: 'p-10', title: 'Laptop Table', price: 45, sold: '2k+', discountPercent: 19, image: 'https://picsum.photos/seed/p10/500/500' },
  { id: 'p-11', title: 'Phone Stand', price: 8, sold: '14k+', discountPercent: 52, image: 'https://picsum.photos/seed/p11/500/500' },
  { id: 'p-12', title: 'Travel Pouch Set', price: 12, sold: '11k+', discountPercent: 39, image: 'https://picsum.photos/seed/p12/500/500' },
  { id: 'p-13', title: 'Keyboard Wrist Rest', price: 10, sold: '6k+', discountPercent: 30, image: 'https://picsum.photos/seed/p13/500/500' },
  { id: 'p-14', title: 'Wireless Mouse', price: 17, sold: '9k+', discountPercent: 34, image: 'https://picsum.photos/seed/p14/500/500' },
  { id: 'p-15', title: 'Room Fragrance Set', price: 13, sold: '5k+', discountPercent: 21, image: 'https://picsum.photos/seed/p15/500/500' }
];
