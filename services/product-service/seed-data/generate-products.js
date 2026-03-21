const sellerId = "0e37febf-88bc-448d-ac49-86f1d3c40e2a";

const categories = [
  {
    id: "thoi-trang-nam",
    label: "Thời Trang Nam",
    brands: ["CoolMate", "Routine", "Yody", "5S Fashion", "Adam Store"],
    productTypes: [
      "Áo Polo Nam",
      "Áo Sơ Mi Nam",
      "Quần Jean Nam",
      "Quần Tây Nam",
      "Áo Thun Nam",
      "Áo Khoác Nam",
      "Quần Short Nam",
      "Áo Hoodie Nam",
      "Bộ Đồ Thể Thao Nam",
      "Thắt Lưng Nam"
    ],
    materials: ["Cotton", "Polyester", "Denim", "Linen", "Leather"],
    colors: ["black", "white", "blue", "gray", "brown"]
  },
  {
    id: "dien-thoai-phu-kien",
    label: "Điện Thoại & Phụ Kiện",
    brands: ["Samsung", "Apple", "Xiaomi", "Anker", "Baseus"],
    productTypes: [
      "Điện Thoại Smartphone",
      "Tai Nghe Bluetooth",
      "Cáp Sạc Nhanh",
      "Sạc Dự Phòng",
      "Ốp Lưng Điện Thoại",
      "Củ Sạc 65W",
      "Giá Đỡ Điện Thoại",
      "Kính Cường Lực",
      "Loa Bluetooth Mini",
      "Đồng Hồ Thông Minh"
    ],
    materials: ["Aluminum", "ABS", "Glass", "Plastic", "Silicone"],
    colors: ["black", "white", "blue", "gray", "purple"]
  },
  {
    id: "thiet-bi-dien-tu",
    label: "Thiết Bị Điện Tử",
    brands: ["Sony", "LG", "Philips", "JBL", "Asus"],
    productTypes: [
      "Smart TV",
      "Loa Soundbar",
      "Máy Chiếu Mini",
      "Bộ Phát WiFi",
      "Android TV Box",
      "Loa Bluetooth",
      "Tai Nghe Chụp Tai",
      "Webcam Full HD",
      "Ổ Cứng Di Động",
      "Thiết Bị Streaming"
    ],
    materials: ["Aluminum", "ABS", "Plastic", "Glass", "Steel"],
    colors: ["black", "white", "gray", "silver", "blue"]
  },
  {
    id: "may-tinh-laptop",
    label: "Máy Tính & Laptop",
    brands: ["Dell", "HP", "Lenovo", "Asus", "Acer"],
    productTypes: [
      "Laptop Văn Phòng",
      "Laptop Gaming",
      "Chuột Không Dây",
      "Bàn Phím Cơ",
      "Màn Hình 24 Inch",
      "SSD NVMe",
      "RAM Laptop",
      "Dock USB-C",
      "Webcam Máy Tính",
      "Laptop Ultrabook"
    ],
    materials: ["Aluminum", "ABS", "Plastic", "Glass", "Magnesium"],
    colors: ["black", "white", "gray", "silver", "blue"]
  },
  {
    id: "may-anh-may-quay-phim",
    label: "Máy Ảnh & Máy Quay Phim",
    brands: ["Canon", "Sony", "Nikon", "Fujifilm", "DJI"],
    productTypes: [
      "Máy Ảnh Mirrorless",
      "Máy Ảnh DSLR",
      "Ống Kính Zoom",
      "Máy Quay Hành Động",
      "Tripod Camera",
      "Micro Thu Âm",
      "Đèn LED Studio",
      "Thẻ Nhớ SD",
      "Gimbal Chống Rung",
      "Túi Máy Ảnh"
    ],
    materials: ["Aluminum", "ABS", "Glass", "Steel", "Carbon Fiber"],
    colors: ["black", "gray", "silver", "blue", "red"]
  },
  {
    id: "dong-ho",
    label: "Đồng Hồ",
    brands: ["Casio", "Citizen", "Orient", "Seiko", "Tissot"],
    productTypes: [
      "Đồng Hồ Nam",
      "Đồng Hồ Nữ",
      "Đồng Hồ Thể Thao",
      "Đồng Hồ Dây Da",
      "Đồng Hồ Dây Kim Loại",
      "Đồng Hồ Thông Minh",
      "Đồng Hồ Chống Nước",
      "Đồng Hồ Quartz",
      "Đồng Hồ Automatic",
      "Đồng Hồ Mini"
    ],
    materials: ["Stainless Steel", "Leather", "Silicone", "Glass", "Titanium"],
    colors: ["black", "white", "blue", "brown", "silver"]
  },
  {
    id: "giay-dep-nam",
    label: "Giày Dép Nam",
    brands: ["Nike", "Adidas", "Puma", "Biti's", "Vans"],
    productTypes: [
      "Giày Sneaker Nam",
      "Giày Chạy Bộ Nam",
      "Sandal Nam",
      "Dép Nam",
      "Giày Tây Nam",
      "Giày Lười Nam",
      "Boot Nam",
      "Giày Thể Thao Nam",
      "Giày Da Nam",
      "Dép Quai Ngang Nam"
    ],
    materials: ["Leather", "Mesh", "Rubber", "Canvas", "PU"],
    colors: ["black", "white", "blue", "gray", "brown"]
  },
  {
    id: "thiet-bi-dien-gia-dung",
    label: "Thiết Bị Điện Gia Dụng",
    brands: ["Panasonic", "Philips", "Sharp", "Tefal", "Sunhouse"],
    productTypes: [
      "Nồi Chiên Không Dầu",
      "Máy Xay Sinh Tố",
      "Máy Hút Bụi",
      "Ấm Siêu Tốc",
      "Nồi Cơm Điện",
      "Máy Lọc Không Khí",
      "Quạt Điều Hòa",
      "Bàn Ủi Hơi Nước",
      "Máy Sấy Tóc",
      "Lò Vi Sóng"
    ],
    materials: ["ABS", "Steel", "Glass", "Aluminum", "Plastic"],
    colors: ["black", "white", "gray", "blue", "red"]
  },
  {
    id: "the-thao-du-lich",
    label: "Thể Thao & Du Lịch",
    brands: ["Nike", "Adidas", "Quechua", "NatureHike", "Decathlon"],
    productTypes: [
      "Balo Du Lịch",
      "Lều Cắm Trại",
      "Bình Nước Thể Thao",
      "Thảm Yoga",
      "Vợt Cầu Lông",
      "Vali Du Lịch",
      "Giày Leo Núi",
      "Áo Khoác Gió",
      "Túi Ngủ",
      "Đèn Cắm Trại"
    ],
    materials: ["Polyester", "Nylon", "Rubber", "Steel", "Aluminum"],
    colors: ["black", "blue", "green", "gray", "orange"]
  },
  {
    id: "o-to-xe-may-xe-dap",
    label: "Ô Tô & Xe Máy & Xe Đạp",
    brands: ["Honda", "Yamaha", "Michelin", "Motul", "Giant"],
    productTypes: [
      "Mũ Bảo Hiểm",
      "Gương Chiếu Hậu",
      "Khóa Chống Trộm",
      "Bơm Xe Đạp",
      "Đèn Xe Đạp",
      "Dầu Nhớt Xe Máy",
      "Giá Đỡ Điện Thoại Xe",
      "Bạt Phủ Xe",
      "Găng Tay Đi Phượt",
      "Máy Bơm Lốp Mini"
    ],
    materials: ["ABS", "Steel", "Aluminum", "Leather", "Rubber"],
    colors: ["black", "red", "blue", "gray", "white"]
  },
  {
    id: "thoi-trang-nu",
    label: "Thời Trang Nữ",
    brands: ["IVY Moda", "Yody", "Canifa", "Marc", "Lamer"],
    productTypes: [
      "Váy Nữ",
      "Áo Sơ Mi Nữ",
      "Áo Thun Nữ",
      "Quần Jean Nữ",
      "Quần Tây Nữ",
      "Áo Khoác Nữ",
      "Đầm Công Sở",
      "Chân Váy",
      "Áo Len Nữ",
      "Set Đồ Nữ"
    ],
    materials: ["Cotton", "Polyester", "Linen", "Denim", "Silk"],
    colors: ["black", "white", "pink", "blue", "beige"]
  },
  {
    id: "me-be",
    label: "Mẹ & Bé",
    brands: ["Pigeon", "Moony", "Chicco", "Joie", "Abbott"],
    productTypes: [
      "Sữa Bột Trẻ Em",
      "Tã Em Bé",
      "Bình Sữa",
      "Xe Đẩy Em Bé",
      "Ghế Ăn Dặm",
      "Khăn Ướt Em Bé",
      "Nhiệt Kế Điện Tử",
      "Máy Hâm Sữa",
      "Bỉm Quần",
      "Địu Em Bé"
    ],
    materials: ["ABS", "Cotton", "Silicone", "Plastic", "Polyester"],
    colors: ["white", "blue", "pink", "gray", "green"]
  },
  {
    id: "nha-cua-doi-song",
    label: "Nhà Cửa & Đời Sống",
    brands: ["LocknLock", "Duy Tan", "Sunhouse", "Inochi", "Homelux"],
    productTypes: [
      "Hộp Đựng Thực Phẩm",
      "Kệ Nhà Tắm",
      "Đèn Ngủ",
      "Thùng Rác Gia Đình",
      "Móc Treo Quần Áo",
      "Chổi Lau Nhà",
      "Bộ Chăn Ga",
      "Rèm Cửa",
      "Máy Khuếch Tán Tinh Dầu",
      "Ghế Gấp"
    ],
    materials: ["Plastic", "ABS", "Steel", "Cotton", "Wood"],
    colors: ["white", "gray", "blue", "brown", "green"]
  },
  {
    id: "sac-dep",
    label: "Sắc Đẹp",
    brands: ["L'Oreal", "Maybelline", "Innisfree", "Cocoon", "La Roche-Posay"],
    productTypes: [
      "Son Môi",
      "Kem Dưỡng Da",
      "Sữa Rửa Mặt",
      "Kem Chống Nắng",
      "Tẩy Trang",
      "Mặt Nạ Dưỡng Da",
      "Serum Vitamin C",
      "Phấn Nước",
      "Mascara",
      "Toner Dưỡng Ẩm"
    ],
    materials: ["Gel", "Cream", "Liquid", "Powder", "Natural Extract"],
    colors: ["pink", "red", "white", "beige", "orange"]
  },
  {
    id: "suc-khoe",
    label: "Sức Khỏe",
    brands: ["Omron", "Blackmores", "HealthyCare", "DHC", "Nature Made"],
    productTypes: [
      "Máy Đo Huyết Áp",
      "Nhiệt Kế Điện Tử",
      "Vitamin Tổng Hợp",
      "Khẩu Trang Y Tế",
      "Máy Xông Mũi Họng",
      "Viên Uống Omega 3",
      "Máy Massage Cầm Tay",
      "Băng Cá Nhân",
      "Nước Rửa Tay",
      "Máy Đo Đường Huyết"
    ],
    materials: ["ABS", "Cotton", "Plastic", "Herbal Extract", "Steel"],
    colors: ["white", "blue", "green", "gray", "black"]
  },
  {
    id: "giay-dep-nu",
    label: "Giày Dép Nữ",
    brands: ["Nike", "Adidas", "Juno", "Biti's", "Vascara"],
    productTypes: [
      "Giày Sneaker Nữ",
      "Giày Cao Gót",
      "Sandal Nữ",
      "Dép Nữ",
      "Giày Búp Bê",
      "Boot Nữ",
      "Giày Lười Nữ",
      "Giày Thể Thao Nữ",
      "Giày Da Nữ",
      "Dép Quai Ngang Nữ"
    ],
    materials: ["Leather", "Mesh", "Canvas", "Rubber", "PU"],
    colors: ["black", "white", "pink", "beige", "brown"]
  },
  {
    id: "tui-vi-nu",
    label: "Túi Ví Nữ",
    brands: ["Charles & Keith", "Juno", "Vascara", "Pedro", "Lyn"],
    productTypes: [
      "Túi Xách Nữ",
      "Ví Cầm Tay Nữ",
      "Túi Đeo Chéo Nữ",
      "Balo Nữ",
      "Túi Tote Nữ",
      "Ví Dài Nữ",
      "Túi Mini Nữ",
      "Túi Công Sở Nữ",
      "Túi Đi Tiệc",
      "Ví Ngắn Nữ"
    ],
    materials: ["Leather", "PU", "Canvas", "Nylon", "Synthetic"],
    colors: ["black", "white", "pink", "brown", "beige"]
  },
  {
    id: "phu-kien-trang-suc-nu",
    label: "Phụ Kiện & Trang Sức Nữ",
    brands: ["PNJ", "Swarovski", "Juno", "Lacoste", "Charmy"],
    productTypes: [
      "Dây Chuyền Nữ",
      "Bông Tai Nữ",
      "Lắc Tay Nữ",
      "Nhẫn Nữ",
      "Kẹp Tóc",
      "Khăn Choàng",
      "Mắt Kính Nữ",
      "Thắt Lưng Nữ",
      "Vòng Cổ Nữ",
      "Phụ Kiện Tóc"
    ],
    materials: ["Silver", "Gold Plated", "Leather", "Alloy", "Silk"],
    colors: ["gold", "silver", "pink", "white", "black"]
  },
  {
    id: "bach-hoa-online",
    label: "Bách Hóa Online",
    brands: ["Vinamilk", "TH True Milk", "Acecook", "Nestle", "Lavie"],
    productTypes: [
      "Sữa Tươi",
      "Mì Ăn Liền",
      "Nước Suối",
      "Bánh Quy",
      "Dầu Ăn",
      "Nước Giặt",
      "Nước Rửa Chén",
      "Khăn Giấy",
      "Gạo Thơm",
      "Cà Phê Hòa Tan"
    ],
    materials: ["Paper", "Liquid", "Powder", "Plastic Bottle", "Packaged Food"],
    colors: ["white", "blue", "green", "yellow", "red"]
  },
  {
    id: "nha-sach-online",
    label: "Nhà Sách Online",
    brands: ["NXB Trẻ", "Kim Đồng", "Nhã Nam", "Alpha Books", "First News"],
    productTypes: [
      "Sách Kỹ Năng",
      "Sách Thiếu Nhi",
      "Sách Kinh Doanh",
      "Tiểu Thuyết",
      "Vở Học Sinh",
      "Bút Bi",
      "Sổ Tay",
      "Bộ Bút Màu",
      "Từ Điển",
      "Sách Ngoại Ngữ"
    ],
    materials: ["Paper", "Plastic", "Ink", "Hardcover", "Softcover"],
    colors: ["blue", "red", "green", "white", "black"]
  }
];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pick(arr, index) {
  return arr[index % arr.length];
}

function randomRating(index) {
  return Number((3.8 + (index % 12) * 0.1).toFixed(1));
}

function randomWarranty(categoryId, index) {
  if (["bach-hoa-online", "nha-sach-online", "sac-dep"].includes(categoryId)) return 0;
  const options = [3, 6, 12, 18, 24];
  return options[index % options.length];
}

function buildVariants(productIndex, basePrice) {
  const variants = [
    {
      sku: `SKU-${String(productIndex).padStart(3, "0")}-A`,
      name: "Standard",
      price: Number(basePrice.toFixed(2)),
      currency: "USD",
      compareAtPrice: Number((basePrice * 1.25).toFixed(2)),
      isDefault: true,
      metadata: { package: "standard" }
    }
  ];

  if (productIndex % 2 === 0) {
    variants.push({
      sku: `SKU-${String(productIndex).padStart(3, "0")}-B`,
      name: "Premium",
      price: Number((basePrice * 1.18).toFixed(2)),
      currency: "USD",
      compareAtPrice: Number((basePrice * 1.42).toFixed(2)),
      isDefault: false,
      metadata: { package: "premium" }
    });
  }

  if (productIndex % 5 === 0) {
    variants.push({
      sku: `SKU-${String(productIndex).padStart(3, "0")}-C`,
      name: "Bundle",
      price: Number((basePrice * 1.35).toFixed(2)),
      currency: "USD",
      compareAtPrice: Number((basePrice * 1.6).toFixed(2)),
      isDefault: false,
      metadata: { package: "bundle" }
    });
  }

  return variants;
}

function generateProducts() {
  const products = [];
  let globalIndex = 1;
  const now = new Date().toISOString();

  for (const category of categories) {
    for (let i = 1; i <= 20; i++) {
      const brand = pick(category.brands, i);
      const productType = pick(category.productTypes, i + 1);
      const color = pick(category.colors, i + 2);
      const material = pick(category.materials, i + 3);
      const name = `${brand} ${productType} ${i}`;
      const slug = slugify(name);
      const basePrice = 10 + globalIndex * 2.5;

      const variants = buildVariants(globalIndex, basePrice);
      const minPrice = Math.min(...variants.map(v => v.price));

      products.push({
        sellerId,
        name,
        slug,
        description: `${name} belongs to ${category.label}. Designed for daily use with reliable quality and practical features.`,
        categoryId: category.id,
        brand,
        status: "ACTIVE",
        attributes: {
          color,
          material,
          warrantyMonths: randomWarranty(category.id, i),
          rating: randomRating(i)
        },
        images: [
          `https://picsum.photos/seed/product-${globalIndex}-1/800/800`,
          `https://picsum.photos/seed/product-${globalIndex}-2/800/800`
        ],
        variants,
        minPrice,
        deletedAt: null,
        createdAt: { $date: now },
        updatedAt: { $date: now }
      });

      globalIndex++;
    }
  }

  console.log(JSON.stringify(products, null, 2));
}

generateProducts();
