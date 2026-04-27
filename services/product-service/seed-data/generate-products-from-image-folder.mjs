#!/usr/bin/env node

import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGE_ROOT = path.join(__dirname, 'image');
const OUTPUT_FILE = path.join(__dirname, 'products-50.from-images.create.json');
const IMAGE_BASE_URL = process.env.PRODUCT_IMAGE_BASE_URL ?? 'http://127.0.0.1:3003/api/v1/products/assets';

const CATEGORY_MAP = {
  thoitrangnam: {
    categoryId: 'thoi-trang-nam',
    brand: 'ECM Men',
    code: 'TMN',
    minBase: 199000,
    minStep: 12000,
    maxGapBase: 150000
  },
  trangsucnu: {
    categoryId: 'thoi-trang-nu',
    brand: 'ECM Women',
    code: 'TTN',
    minBase: 189000,
    minStep: 13000,
    maxGapBase: 140000
  },
  dienthoaivaphukien: {
    categoryId: 'dien-thoai-phu-kien',
    brand: 'ECM Mobile',
    code: 'DTPK',
    minBase: 249000,
    minStep: 25000,
    maxGapBase: 180000
  },
  maytinhvalaptop: {
    categoryId: 'may-tinh-laptop',
    brand: 'ECM Tech',
    code: 'MTLT',
    minBase: 299000,
    minStep: 30000,
    maxGapBase: 220000
  },
  sacdep: {
    categoryId: 'sac-dep',
    brand: 'ECM Beauty',
    code: 'SD',
    minBase: 169000,
    minStep: 11000,
    maxGapBase: 120000
  }
};

function titleFromSlug(slug) {
  const specialNames = {
    'ban-phim-co': 'Bàn Phím Cơ',
    'ban-phim-mini': 'Bàn Phím Mini',
    'iphone15': 'iPhone 15',
    'iphone17': 'iPhone 17',
    'op-lung-chong-ban': 'Ốp Lưng Chống Bẩn',
    'samsung-galaxy-j7pro': 'Samsung Galaxy J7 Pro',
    'usb-1tb': 'USB 1TB',
    'iphone17promax': 'iPhone 17 Pro Max',
    'iphone16-plus': 'iPhone 16 Plus',
    'macbook-pro-14inch': 'MacBook Pro 14 Inch',
    'guong-soi-de-ban': 'Gương Soi Để Bàn',
    'may-lam-toc': 'Máy Làm Tóc',
    'dam-maxi': 'Đầm Maxi',
    'long-mi-gia': 'Lông Mi Giả'
  };

  if (specialNames[slug]) {
    return specialNames[slug];
  }

  const dict = {
    ao: 'Áo',
    quan: 'Quần',
    vay: 'Váy',
    chan: 'Chân',
    thun: 'Thun',
    that: 'Thắt',
    eo: 'Eo',
    baby: 'Baby',
    doll: 'Doll',
    ba: 'Ba',
    lo: 'Lỗ',
    khoac: 'Khoác',
    bomber: 'Bomber',
    cadigan: 'Cardigan',
    maxi: 'Maxi',
    xep: 'Xếp',
    ly: 'Ly',
    tat: 'Tất',
    nam: 'Nam',
    nu: 'Nữ',
    jean: 'Jean',
    ong: 'Ống',
    rong: 'Rộng',
    dui: 'Đùi',
    lot: 'Lót',
    hoodie: 'Hoodie',
    zip: 'Zip',
    sweater: 'Sweater',
    sac: 'Sạc',
    du: 'Dự',
    phong: 'Phòng',
    op: 'Ốp',
    lung: 'Lưng',
    chong: 'Chống',
    ban: 'Bẩn',
    may: 'Máy',
    tinh: 'Tính',
    laptop: 'Laptop',
    tai: 'Tai',
    nghe: 'Nghe',
    nhet: 'Nhét',
    chuot: 'Chuột',
    khong: 'Không',
    day: 'Dây',
    phim: 'Phím',
    loa: 'Loa',
    bluetooth: 'Bluetooth',
    pro: 'Pro',
    gel: 'Gel',
    rua: 'Rửa',
    mat: 'Mặt',
    nuoc: 'Nước',
    hoa: 'Hoa',
    hong: 'Hồng',
    mong: 'Móng',
    tay: 'Tay',
    gia: 'Giả',
    guong: 'Gương',
    soi: 'Soi',
    de: 'Để',
    lam: 'Làm',
    toc: 'Tóc',
    dau: 'Dầu',
    goi: 'Gội',
    argan: 'Argan',
    kem: 'Kem',
    body: 'Body',
    sua: 'Sữa',
    duong: 'Dưỡng',
    the: 'Thể',
    iphone: 'iPhone',
    samsung: 'Samsung',
    galaxy: 'Galaxy',
    macbook: 'MacBook',
    lenovo: 'Lenovo',
    thinkpad: 'ThinkPad',
    usb: 'USB'
  };

  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => {
      const normalized = token.toLowerCase();
      if (dict[normalized]) {
        return dict[normalized];
      }
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
}

function createSlug(folder, baseName, index) {
  return `${folder}-${baseName}-${String(index).padStart(3, '0')}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function vndRound(value) {
  return Math.round(value / 1000) * 1000;
}

async function main() {
  const folders = (await readdir(IMAGE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && CATEGORY_MAP[entry.name])
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const products = [];

  for (const folder of folders) {
    const category = CATEGORY_MAP[folder];
    const files = (await readdir(path.join(IMAGE_ROOT, folder), { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    for (let index = 0; index < files.length; index += 1) {
      const fileName = files[index];
      const fileBaseName = fileName.replace(/\.[^.]+$/, '');
      const productName = titleFromSlug(fileBaseName);
      const productSlug = createSlug(folder, fileBaseName, index + 1);
      const minPrice = vndRound(category.minBase + index * category.minStep);
      const maxPrice = vndRound(minPrice + category.maxGapBase + index * 6000);
      const imageUrl = `${IMAGE_BASE_URL}/${folder}/${encodeURIComponent(fileName)}`;

      products.push({
        name: productName,
        slug: productSlug,
        description: `${productName} thuộc danh mục ${category.categoryId}, dữ liệu được tạo tự động từ tên file ảnh.`,
        categoryId: category.categoryId,
        brand: category.brand,
        attributes: {
          source: 'seed-data/image',
          folder,
          imageFile: fileName
        },
        images: [imageUrl],
        variants: [
          {
            sku: `IMG-${category.code}-${String(index + 1).padStart(3, '0')}`,
            name: 'Bản Tiêu Chuẩn',
            price: minPrice,
            currency: 'VND',
            compareAtPrice: vndRound(minPrice * 1.12),
            isDefault: true,
            metadata: {
              generatedFrom: 'image-filename'
            }
          },
          {
            sku: `IMG-${category.code}-${String(index + 1).padStart(3, '0')}-P`,
            name: 'Bản Cao Cấp',
            price: maxPrice,
            currency: 'VND',
            compareAtPrice: vndRound(maxPrice * 1.1),
            isDefault: false,
            metadata: {
              generatedFrom: 'image-filename'
            }
          }
        ]
      });
    }
  }

  await writeFile(OUTPUT_FILE, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
  console.log(`Generated ${products.length} products -> ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
