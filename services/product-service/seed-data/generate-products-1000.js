const { writeFileSync } = require('node:fs');

const OUTPUT_FILE = 'services/product-service/seed-data/products-1000.create.json';
const PRODUCTS_PER_CATEGORY = 50;

const categories = [
  {
    id: 'thoi-trang-nam',
    label: 'Thời Trang Nam',
    brands: ['Coolmate', 'Routine', '5S Fashion', 'Yody', 'Adam Store'],
    productTypes: ['Áo Polo Nam', 'Áo Sơ Mi Nam', 'Áo Thun Nam', 'Quần Jean Nam', 'Quần Short Nam', 'Áo Khoác Nam', 'Áo Hoodie Nam', 'Quần Tây Nam', 'Bộ Đồ Thể Thao Nam', 'Thắt Lưng Nam'],
    imageKeywords: ['men-fashion', 'mens-shirt', 'mens-tshirt', 'jeans', 'mens-shorts', 'jacket', 'hoodie', 'trousers', 'sportswear', 'belt'],
    specs: ['Form Regular', 'Form Slimfit', 'Chất Cotton', 'Thoáng Mát', 'Co Giãn 4 Chiều', 'Phong Cách Hàn', 'Mặc Đi Làm', 'Đi Chơi Cuối Tuần'],
    materials: ['Cotton', 'Polyester', 'Denim', 'Linen', 'Kaki'],
    colors: ['đen', 'trắng', 'xám', 'xanh navy', 'be'],
    priceRange: [129000, 699000],
    warrantyMonths: [0, 1, 3]
  },
  {
    id: 'dien-thoai-phu-kien',
    label: 'Điện Thoại & Phụ Kiện',
    brands: ['Samsung', 'Apple', 'Xiaomi', 'Anker', 'Baseus'],
    productTypes: ['Điện Thoại Smartphone', 'Tai Nghe Bluetooth', 'Cáp Sạc Nhanh', 'Sạc Dự Phòng', 'Ốp Lưng Điện Thoại', 'Củ Sạc Nhanh', 'Giá Đỡ Điện Thoại', 'Kính Cường Lực', 'Loa Bluetooth Mini', 'Đồng Hồ Thông Minh'],
    imageKeywords: ['smartphone', 'earbuds', 'charging-cable', 'powerbank', 'phone-case', 'charger', 'phone-stand', 'screen-protector', 'bluetooth-speaker', 'smartwatch'],
    specs: ['Pin Trâu', 'Sạc Nhanh', 'Chuẩn Chính Hãng', 'Kết Nối Ổn Định', 'Thiết Kế Mỏng Nhẹ', 'Bản Mới 2026', 'Hiệu Năng Mượt', 'Chống Va Đập'],
    materials: ['ABS', 'Nhôm', 'Kính cường lực', 'Silicone', 'Nhựa PC'],
    colors: ['đen', 'trắng', 'xanh', 'hồng', 'tím'],
    priceRange: [79000, 24990000],
    warrantyMonths: [3, 6, 12, 18, 24]
  },
  {
    id: 'thiet-bi-dien-tu',
    label: 'Thiết Bị Điện Tử',
    brands: ['Sony', 'LG', 'Philips', 'JBL', 'Asus'],
    productTypes: ['Smart TV', 'Loa Soundbar', 'Máy Chiếu Mini', 'Bộ Phát WiFi', 'Android TV Box', 'Loa Bluetooth', 'Tai Nghe Chụp Tai', 'Webcam Full HD', 'Ổ Cứng Di Động', 'Thiết Bị Streaming'],
    imageKeywords: ['smart-tv', 'soundbar', 'projector', 'router', 'tv-box', 'speaker', 'headphones', 'webcam', 'external-hard-drive', 'streaming-device'],
    specs: ['4K UHD', 'Âm Thanh Sống Động', 'Kết Nối Không Dây', 'Hiệu Suất Ổn Định', 'Bản Nâng Cấp', 'Thiết Kế Tối Giản'],
    materials: ['Nhựa cao cấp', 'Kim loại', 'ABS', 'Kính', 'Hợp kim'],
    colors: ['đen', 'trắng', 'xám', 'bạc', 'xanh đậm'],
    priceRange: [299000, 32990000],
    warrantyMonths: [6, 12, 18, 24]
  },
  {
    id: 'may-tinh-laptop',
    label: 'Máy Tính & Laptop',
    brands: ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer'],
    productTypes: ['Laptop Văn Phòng', 'Laptop Gaming', 'Chuột Không Dây', 'Bàn Phím Cơ', 'Màn Hình 24 Inch', 'SSD NVMe', 'RAM Laptop', 'Dock USB-C', 'Webcam Máy Tính', 'Laptop Ultrabook'],
    imageKeywords: ['laptop', 'gaming-laptop', 'wireless-mouse', 'mechanical-keyboard', 'monitor', 'ssd', 'ram', 'usb-c-dock', 'webcam', 'ultrabook'],
    specs: ['Core i5', 'Core i7', 'Bản 16GB RAM', 'Màn Hình Đẹp', 'Hiệu Năng Cao', 'Mỏng Nhẹ', 'Tản Nhiệt Tốt'],
    materials: ['Nhôm', 'Hợp kim magie', 'ABS', 'Nhựa PC', 'Kính'],
    colors: ['đen', 'bạc', 'xám', 'xanh đen', 'trắng'],
    priceRange: [189000, 45990000],
    warrantyMonths: [12, 18, 24, 36]
  },
  {
    id: 'may-anh-may-quay-phim',
    label: 'Máy Ảnh & Máy Quay Phim',
    brands: ['Canon', 'Sony', 'Nikon', 'Fujifilm', 'DJI'],
    productTypes: ['Máy Ảnh Mirrorless', 'Máy Ảnh DSLR', 'Ống Kính Zoom', 'Máy Quay Hành Động', 'Tripod Camera', 'Micro Thu Âm', 'Đèn LED Studio', 'Thẻ Nhớ SD', 'Gimbal Chống Rung', 'Túi Máy Ảnh'],
    imageKeywords: ['mirrorless-camera', 'dslr', 'camera-lens', 'action-camera', 'tripod', 'microphone', 'studio-light', 'sd-card', 'gimbal', 'camera-bag'],
    specs: ['Quay 4K', 'Chống Rung Tốt', 'Lấy Nét Nhanh', 'Pin Lâu', 'Dành Cho Vlogger', 'Chuẩn Studio'],
    materials: ['Nhôm', 'Carbon', 'ABS', 'Kính', 'Hợp kim'],
    colors: ['đen', 'xám', 'bạc', 'đỏ', 'xanh'],
    priceRange: [99000, 55990000],
    warrantyMonths: [6, 12, 24]
  },
  {
    id: 'dong-ho',
    label: 'Đồng Hồ',
    brands: ['Casio', 'Citizen', 'Orient', 'Seiko', 'Tissot'],
    productTypes: ['Đồng Hồ Nam', 'Đồng Hồ Nữ', 'Đồng Hồ Thể Thao', 'Đồng Hồ Dây Da', 'Đồng Hồ Dây Kim Loại', 'Đồng Hồ Thông Minh', 'Đồng Hồ Chống Nước', 'Đồng Hồ Quartz', 'Đồng Hồ Automatic', 'Đồng Hồ Mini'],
    imageKeywords: ['watch', 'women-watch', 'sport-watch', 'leather-watch', 'metal-watch', 'smartwatch', 'waterproof-watch', 'quartz-watch', 'automatic-watch', 'mini-watch'],
    specs: ['Chống Nước 5ATM', 'Dây Đeo Êm', 'Mặt Kính Cứng', 'Phong Cách Sang Trọng', 'Bền Bỉ'],
    materials: ['Thép không gỉ', 'Da', 'Silicone', 'Kính khoáng', 'Titanium'],
    colors: ['đen', 'trắng', 'nâu', 'bạc', 'xanh navy'],
    priceRange: [299000, 12990000],
    warrantyMonths: [6, 12, 24]
  },
  {
    id: 'giay-dep-nam',
    label: 'Giày Dép Nam',
    brands: ['Nike', 'Adidas', 'Puma', "Biti's", 'Vans'],
    productTypes: ['Giày Sneaker Nam', 'Giày Chạy Bộ Nam', 'Sandal Nam', 'Dép Nam', 'Giày Tây Nam', 'Giày Lười Nam', 'Boot Nam', 'Giày Thể Thao Nam', 'Giày Da Nam', 'Dép Quai Ngang Nam'],
    imageKeywords: ['mens-sneakers', 'running-shoes', 'mens-sandals', 'slippers', 'dress-shoes', 'loafers', 'boots', 'sport-shoes', 'leather-shoes', 'slides'],
    specs: ['Đế Êm', 'Thoáng Khí', 'Chống Trơn', 'Đi Cả Ngày', 'Kiểu Dáng Trẻ'],
    materials: ['Da', 'Lưới Mesh', 'Canvas', 'Cao su', 'PU'],
    colors: ['đen', 'trắng', 'xám', 'nâu', 'xanh'],
    priceRange: [159000, 3990000],
    warrantyMonths: [1, 3, 6]
  },
  {
    id: 'thiet-bi-dien-gia-dung',
    label: 'Thiết Bị Điện Gia Dụng',
    brands: ['Panasonic', 'Philips', 'Sharp', 'Tefal', 'Sunhouse'],
    productTypes: ['Nồi Chiên Không Dầu', 'Máy Xay Sinh Tố', 'Máy Hút Bụi', 'Ấm Siêu Tốc', 'Nồi Cơm Điện', 'Máy Lọc Không Khí', 'Quạt Điều Hòa', 'Bàn Ủi Hơi Nước', 'Máy Sấy Tóc', 'Lò Vi Sóng'],
    imageKeywords: ['air-fryer', 'blender', 'vacuum-cleaner', 'electric-kettle', 'rice-cooker', 'air-purifier', 'air-cooler', 'steam-iron', 'hair-dryer', 'microwave'],
    specs: ['Tiết Kiệm Điện', 'Dung Tích Lớn', 'Dễ Vệ Sinh', 'Hoạt Động Êm', 'Công Suất Mạnh'],
    materials: ['ABS', 'Inox', 'Thủy tinh', 'Nhựa PP', 'Hợp kim'],
    colors: ['đen', 'trắng', 'xám', 'đỏ', 'xanh'],
    priceRange: [249000, 8990000],
    warrantyMonths: [6, 12, 24]
  },
  {
    id: 'the-thao-du-lich',
    label: 'Thể Thao & Du Lịch',
    brands: ['Nike', 'Adidas', 'Quechua', 'NatureHike', 'Decathlon'],
    productTypes: ['Balo Du Lịch', 'Lều Cắm Trại', 'Bình Nước Thể Thao', 'Thảm Yoga', 'Vợt Cầu Lông', 'Vali Du Lịch', 'Giày Leo Núi', 'Áo Khoác Gió', 'Túi Ngủ', 'Đèn Cắm Trại'],
    imageKeywords: ['travel-backpack', 'camping-tent', 'water-bottle', 'yoga-mat', 'badminton-racket', 'suitcase', 'hiking-shoes', 'windbreaker', 'sleeping-bag', 'camping-lantern'],
    specs: ['Nhẹ Bền', 'Chống Nước', 'Dễ Mang Theo', 'Phù Hợp Outdoor', 'Thiết Kế Thể Thao'],
    materials: ['Nylon', 'Polyester', 'Cao su', 'Nhôm', 'Vải dù'],
    colors: ['đen', 'xanh lá', 'cam', 'xám', 'xanh dương'],
    priceRange: [89000, 5990000],
    warrantyMonths: [1, 3, 6, 12]
  },
  {
    id: 'o-to-xe-may-xe-dap',
    label: 'Ô Tô & Xe Máy & Xe Đạp',
    brands: ['Honda', 'Yamaha', 'Michelin', 'Motul', 'Giant'],
    productTypes: ['Mũ Bảo Hiểm', 'Gương Chiếu Hậu', 'Khóa Chống Trộm', 'Bơm Xe Đạp', 'Đèn Xe Đạp', 'Dầu Nhớt Xe Máy', 'Giá Đỡ Điện Thoại Xe', 'Bạt Phủ Xe', 'Găng Tay Đi Phượt', 'Máy Bơm Lốp Mini'],
    imageKeywords: ['helmet', 'rear-view-mirror', 'bike-lock', 'bicycle-pump', 'bike-light', 'motor-oil', 'phone-holder-motorbike', 'car-cover', 'riding-gloves', 'tire-inflator'],
    specs: ['Chắc Chắn', 'Độ Bền Cao', 'Lắp Đặt Nhanh', 'Dùng Mọi Thời Tiết', 'Đi Phượt An Tâm'],
    materials: ['ABS', 'Thép', 'Nhôm', 'Da', 'Cao su'],
    colors: ['đen', 'đỏ', 'xám', 'xanh', 'trắng'],
    priceRange: [69000, 3490000],
    warrantyMonths: [1, 3, 6, 12]
  },
  {
    id: 'thoi-trang-nu',
    label: 'Thời Trang Nữ',
    brands: ['IVY Moda', 'Yody', 'Canifa', 'Marc', 'Lamer'],
    productTypes: ['Váy Nữ', 'Áo Sơ Mi Nữ', 'Áo Thun Nữ', 'Quần Jean Nữ', 'Quần Tây Nữ', 'Áo Khoác Nữ', 'Đầm Công Sở', 'Chân Váy', 'Áo Len Nữ', 'Set Đồ Nữ'],
    imageKeywords: ['women-dress', 'women-shirt', 'women-tshirt', 'women-jeans', 'women-trousers', 'women-jacket', 'office-dress', 'skirt', 'women-sweater', 'women-set'],
    specs: ['Tôn Dáng', 'Dễ Phối Đồ', 'Mềm Mại', 'Phong Cách Thanh Lịch', 'Mặc Đi Làm'],
    materials: ['Cotton', 'Polyester', 'Lụa', 'Linen', 'Denim'],
    colors: ['đen', 'trắng', 'hồng', 'be', 'xanh'],
    priceRange: [119000, 1590000],
    warrantyMonths: [0, 1, 3]
  },
  {
    id: 'me-be',
    label: 'Mẹ & Bé',
    brands: ['Pigeon', 'Moony', 'Chicco', 'Joie', 'Abbott'],
    productTypes: ['Sữa Bột Trẻ Em', 'Tã Em Bé', 'Bình Sữa', 'Xe Đẩy Em Bé', 'Ghế Ăn Dặm', 'Khăn Ướt Em Bé', 'Nhiệt Kế Điện Tử', 'Máy Hâm Sữa', 'Bỉm Quần', 'Địu Em Bé'],
    imageKeywords: ['baby-formula', 'baby-diaper', 'baby-bottle', 'baby-stroller', 'baby-chair', 'baby-wipes', 'baby-thermometer', 'bottle-warmer', 'diaper-pants', 'baby-carrier'],
    specs: ['An Toàn Cho Bé', 'Chất Liệu Lành Tính', 'Mềm Dịu', 'Dễ Sử Dụng', 'Mẹ Bỉm Tin Dùng'],
    materials: ['Nhựa PP', 'Cotton', 'Silicone', 'Vải mềm', 'ABS'],
    colors: ['trắng', 'xanh', 'hồng', 'xám', 'kem'],
    priceRange: [59000, 7990000],
    warrantyMonths: [0, 3, 6, 12]
  },
  {
    id: 'nha-cua-doi-song',
    label: 'Nhà Cửa & Đời Sống',
    brands: ['LocknLock', 'Duy Tan', 'Sunhouse', 'Inochi', 'Homelux'],
    productTypes: ['Hộp Đựng Thực Phẩm', 'Kệ Nhà Tắm', 'Đèn Ngủ', 'Thùng Rác Gia Đình', 'Móc Treo Quần Áo', 'Chổi Lau Nhà', 'Bộ Chăn Ga', 'Rèm Cửa', 'Máy Khuếch Tán Tinh Dầu', 'Ghế Gấp'],
    imageKeywords: ['food-container', 'bathroom-shelf', 'night-lamp', 'trash-bin', 'hanger', 'mop', 'bedding-set', 'curtain', 'essential-oil-diffuser', 'folding-chair'],
    specs: ['Tiện Lợi', 'Thiết Kế Gọn', 'Bền Đẹp', 'Dễ Vệ Sinh', 'Phù Hợp Mọi Gia Đình'],
    materials: ['Nhựa PP', 'ABS', 'Thép', 'Gỗ', 'Vải'],
    colors: ['trắng', 'xám', 'nâu', 'xanh', 'đen'],
    priceRange: [49000, 2390000],
    warrantyMonths: [0, 3, 6, 12]
  },
  {
    id: 'sac-dep',
    label: 'Sắc Đẹp',
    brands: ["L'Oreal", 'Maybelline', 'Innisfree', 'Cocoon', 'La Roche-Posay'],
    productTypes: ['Son Môi', 'Kem Dưỡng Da', 'Sữa Rửa Mặt', 'Kem Chống Nắng', 'Tẩy Trang', 'Mặt Nạ Dưỡng Da', 'Serum Vitamin C', 'Phấn Nước', 'Mascara', 'Toner Dưỡng Ẩm'],
    imageKeywords: ['lipstick', 'moisturizer', 'cleanser', 'sunscreen', 'makeup-remover', 'face-mask', 'vitamin-c-serum', 'cushion-foundation', 'mascara', 'toner'],
    specs: ['Dành Cho Da Nhạy Cảm', 'Không Cồn', 'Dưỡng Ẩm Tốt', 'Bền Màu', 'Lành Tính'],
    materials: ['Gel', 'Cream', 'Liquid', 'Powder', 'Chiết xuất thiên nhiên'],
    colors: ['hồng', 'đỏ', 'cam', 'be', 'trắng'],
    priceRange: [59000, 1290000],
    warrantyMonths: [0]
  },
  {
    id: 'suc-khoe',
    label: 'Sức Khỏe',
    brands: ['Omron', 'Blackmores', 'HealthyCare', 'DHC', 'Nature Made'],
    productTypes: ['Máy Đo Huyết Áp', 'Nhiệt Kế Điện Tử', 'Vitamin Tổng Hợp', 'Khẩu Trang Y Tế', 'Máy Xông Mũi Họng', 'Viên Uống Omega 3', 'Máy Massage Cầm Tay', 'Băng Cá Nhân', 'Nước Rửa Tay', 'Máy Đo Đường Huyết'],
    imageKeywords: ['blood-pressure-monitor', 'digital-thermometer', 'vitamins', 'medical-mask', 'nebulizer', 'omega-3', 'massage-device', 'bandage', 'hand-sanitizer', 'glucose-meter'],
    specs: ['Đạt Chuẩn Chất Lượng', 'Dễ Dùng Tại Nhà', 'An Toàn', 'Độ Chính Xác Cao', 'Bảo Vệ Sức Khỏe'],
    materials: ['ABS', 'Cotton', 'Nhựa y tế', 'Thép', 'Chiết xuất tự nhiên'],
    colors: ['trắng', 'xanh', 'xám', 'đen', 'xanh lá'],
    priceRange: [39000, 4990000],
    warrantyMonths: [0, 6, 12, 24]
  },
  {
    id: 'giay-dep-nu',
    label: 'Giày Dép Nữ',
    brands: ['Nike', 'Adidas', 'Juno', "Biti's", 'Vascara'],
    productTypes: ['Giày Sneaker Nữ', 'Giày Cao Gót', 'Sandal Nữ', 'Dép Nữ', 'Giày Búp Bê', 'Boot Nữ', 'Giày Lười Nữ', 'Giày Thể Thao Nữ', 'Giày Da Nữ', 'Dép Quai Ngang Nữ'],
    imageKeywords: ['women-sneakers', 'high-heels', 'women-sandals', 'women-slippers', 'flats', 'women-boots', 'women-loafers', 'women-sport-shoes', 'women-leather-shoes', 'women-slides'],
    specs: ['Êm Chân', 'Tôn Dáng', 'Dễ Mix Đồ', 'Đi Làm Đi Chơi', 'Form Chuẩn'],
    materials: ['Da', 'Lưới', 'Canvas', 'PU', 'Cao su'],
    colors: ['đen', 'trắng', 'be', 'hồng', 'nâu'],
    priceRange: [139000, 3290000],
    warrantyMonths: [1, 3, 6]
  },
  {
    id: 'tui-vi-nu',
    label: 'Túi Ví Nữ',
    brands: ['Charles & Keith', 'Juno', 'Vascara', 'Pedro', 'Lyn'],
    productTypes: ['Túi Xách Nữ', 'Ví Cầm Tay Nữ', 'Túi Đeo Chéo Nữ', 'Balo Nữ', 'Túi Tote Nữ', 'Ví Dài Nữ', 'Túi Mini Nữ', 'Túi Công Sở Nữ', 'Túi Đi Tiệc', 'Ví Ngắn Nữ'],
    imageKeywords: ['women-handbag', 'clutch-wallet', 'crossbody-bag', 'women-backpack', 'tote-bag', 'long-wallet', 'mini-bag', 'office-bag', 'party-bag', 'short-wallet'],
    specs: ['Da Mềm', 'May Chắc Tay', 'Thiết Kế Sang', 'Ngăn Chứa Tiện', 'Phù Hợp Nhiều Outfit'],
    materials: ['Da PU', 'Da tổng hợp', 'Canvas', 'Nylon', 'Da thật'],
    colors: ['đen', 'trắng', 'be', 'nâu', 'hồng'],
    priceRange: [159000, 2590000],
    warrantyMonths: [1, 3, 6, 12]
  },
  {
    id: 'phu-kien-trang-suc-nu',
    label: 'Phụ Kiện & Trang Sức Nữ',
    brands: ['PNJ', 'Swarovski', 'Juno', 'Lacoste', 'Charmy'],
    productTypes: ['Dây Chuyền Nữ', 'Bông Tai Nữ', 'Lắc Tay Nữ', 'Nhẫn Nữ', 'Kẹp Tóc', 'Khăn Choàng', 'Mắt Kính Nữ', 'Thắt Lưng Nữ', 'Vòng Cổ Nữ', 'Phụ Kiện Tóc'],
    imageKeywords: ['necklace', 'earrings', 'bracelet', 'ring', 'hair-clip', 'scarf', 'women-sunglasses', 'women-belt', 'choker', 'hair-accessories'],
    specs: ['Thiết Kế Tinh Tế', 'Phong Cách Nữ Tính', 'Dễ Phối', 'Món Quà Ý Nghĩa', 'Bản Mới'],
    materials: ['Bạc', 'Mạ vàng', 'Hợp kim', 'Da', 'Lụa'],
    colors: ['vàng', 'bạc', 'hồng', 'đen', 'trắng'],
    priceRange: [49000, 1890000],
    warrantyMonths: [0, 1, 3]
  },
  {
    id: 'bach-hoa-online',
    label: 'Bách Hóa Online',
    brands: ['Vinamilk', 'TH True Milk', 'Acecook', 'Nestle', 'Lavie'],
    productTypes: ['Sữa Tươi', 'Mì Ăn Liền', 'Nước Suối', 'Bánh Quy', 'Dầu Ăn', 'Nước Giặt', 'Nước Rửa Chén', 'Khăn Giấy', 'Gạo Thơm', 'Cà Phê Hòa Tan'],
    imageKeywords: ['milk', 'instant-noodles', 'bottled-water', 'cookies', 'cooking-oil', 'laundry-detergent', 'dishwashing-liquid', 'tissue-paper', 'rice-bag', 'instant-coffee'],
    specs: ['Tiêu Dùng Hàng Ngày', 'Đóng Gói Tiện Lợi', 'Giá Tốt', 'Mua Nhanh Dễ Dùng', 'Nhãn Hàng Uy Tín'],
    materials: ['Hộp giấy', 'Gói', 'Chai nhựa', 'Bao bì thực phẩm', 'Lon'],
    colors: ['xanh', 'trắng', 'đỏ', 'vàng', 'nâu'],
    priceRange: [9000, 499000],
    warrantyMonths: [0]
  },
  {
    id: 'nha-sach-online',
    label: 'Nhà Sách Online',
    brands: ['NXB Trẻ', 'Kim Đồng', 'Nhã Nam', 'Alpha Books', 'First News'],
    productTypes: ['Sách Kỹ Năng', 'Sách Thiếu Nhi', 'Sách Kinh Doanh', 'Tiểu Thuyết', 'Vở Học Sinh', 'Bút Bi', 'Sổ Tay', 'Bộ Bút Màu', 'Từ Điển', 'Sách Ngoại Ngữ'],
    imageKeywords: ['self-help-book', 'children-book', 'business-book', 'novel', 'notebook', 'ballpoint-pen', 'journal', 'colored-pencils', 'dictionary', 'language-book'],
    specs: ['In Rõ Nét', 'Bìa Đẹp', 'Giấy Chất Lượng', 'Nội Dung Hay', 'Phù Hợp Học Tập'],
    materials: ['Giấy', 'Bìa cứng', 'Mực', 'Nhựa', 'Carton'],
    colors: ['xanh', 'đỏ', 'trắng', 'đen', 'vàng'],
    priceRange: [12000, 399000],
    warrantyMonths: [0]
  }
];

const variantNames = ['Tiêu chuẩn', 'Bản nâng cấp', 'Combo tiết kiệm'];
const DUMMY_PRODUCTS_URL = 'https://dummyjson.com/products?limit=194';
const CATEGORY_IMAGE_SOURCES = {
  'thoi-trang-nam': ['mens-shirts', 'mens-shoes', 'mens-watches'],
  'dien-thoai-phu-kien': ['smartphones', 'mobile-accessories'],
  'thiet-bi-dien-tu': ['mobile-accessories', 'laptops', 'tablets', 'home-decoration'],
  'may-tinh-laptop': ['laptops', 'tablets', 'mobile-accessories'],
  'may-anh-may-quay-phim': ['mobile-accessories', 'smartphones'],
  'dong-ho': ['mens-watches', 'womens-watches'],
  'giay-dep-nam': ['mens-shoes'],
  'thiet-bi-dien-gia-dung': ['kitchen-accessories', 'home-decoration'],
  'the-thao-du-lich': ['sports-accessories'],
  'o-to-xe-may-xe-dap': ['vehicle', 'motorcycle'],
  'thoi-trang-nu': ['tops', 'womens-dresses', 'womens-shoes'],
  'me-be': ['groceries', 'tops', 'home-decoration'],
  'nha-cua-doi-song': ['home-decoration', 'furniture', 'kitchen-accessories'],
  'sac-dep': ['beauty', 'skin-care', 'fragrances'],
  'suc-khoe': ['skin-care', 'beauty', 'groceries'],
  'giay-dep-nu': ['womens-shoes'],
  'tui-vi-nu': ['womens-bags'],
  'phu-kien-trang-suc-nu': ['womens-jewellery', 'sunglasses', 'womens-watches'],
  'bach-hoa-online': ['groceries'],
  'nha-sach-online': ['groceries']
};
const BOOK_COVER_IMAGES = [
  'https://covers.openlibrary.org/b/isbn/9780140328721-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780061120084-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780307277671-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780316769488-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780446310789-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780553382563-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780486415871-L.jpg',
  'https://covers.openlibrary.org/b/isbn/9780439023528-L.jpg'
];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(arr) {
  return [...new Set(arr)];
}

function pick(arr, index) {
  return arr[index % arr.length];
}

function vndRound(num) {
  return Math.round(num / 1000) * 1000;
}

function computeBasePrice([min, max], index) {
  const spread = max - min;
  const ratio = ((index * 73) % 997) / 997;
  return vndRound(min + spread * ratio);
}

function makeFallbackImagePool(categoryLabel) {
  const encoded = encodeURIComponent(categoryLabel);
  return [
    `https://dummyjson.com/image/800x800/f8f8f8/444444?text=${encoded}`,
    `https://dummyjson.com/image/800x800/f1f1f1/444444?text=${encoded}`
  ];
}

async function buildCategoryImagePools() {
  try {
    const response = await fetch(DUMMY_PRODUCTS_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch image source: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const sourcePools = {};

    for (const product of payload.products ?? []) {
      const key = product.category;
      if (!key) continue;
      sourcePools[key] = sourcePools[key] ?? [];
      const imageSet = Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : (product.thumbnail ? [product.thumbnail] : []);
      sourcePools[key].push(...imageSet);
    }

    Object.keys(sourcePools).forEach((key) => {
      sourcePools[key] = unique(sourcePools[key]);
    });

    const globalPool = unique(Object.values(sourcePools).flat());
    const categoryPools = {};

    for (const category of categories) {
      const sourceKeys = CATEGORY_IMAGE_SOURCES[category.id] ?? [];
      const pool = unique(sourceKeys.flatMap((key) => sourcePools[key] ?? []));
      categoryPools[category.id] = pool.length > 1 ? pool : globalPool;
    }

    categoryPools['nha-sach-online'] = [...BOOK_COVER_IMAGES];

    return categoryPools;
  } catch (error) {
    console.warn('Cannot load remote image pools, using fallback placeholders.', error.message);
    return Object.fromEntries(categories.map((category) => [category.id, makeFallbackImagePool(category.label)]));
  }
}

function buildImages(imagePool, globalIndex) {
  if (!imagePool || imagePool.length === 0) return [];
  const firstIndex = (globalIndex * 3) % imagePool.length;
  const secondRaw = (globalIndex * 7 + 1) % imagePool.length;
  const secondIndex = secondRaw === firstIndex ? (secondRaw + 1) % imagePool.length : secondRaw;
  return [imagePool[firstIndex], imagePool[secondIndex]];
}

function buildVariants(categoryCode, globalIndex, basePrice) {
  return [
    {
      sku: `ECM-${categoryCode}-${String(globalIndex).padStart(5, '0')}-A`,
      name: variantNames[0],
      price: basePrice,
      currency: 'VND',
      compareAtPrice: vndRound(basePrice * 1.18),
      isDefault: true,
      metadata: { pack: 'standard' }
    },
    {
      sku: `ECM-${categoryCode}-${String(globalIndex).padStart(5, '0')}-B`,
      name: variantNames[1],
      price: vndRound(basePrice * 1.12),
      currency: 'VND',
      compareAtPrice: vndRound(basePrice * 1.28),
      isDefault: false,
      metadata: { pack: 'premium' }
    }
  ];
}

function generateProducts(categoryImagePools) {
  const products = [];
  let globalIndex = 1;

  for (const category of categories) {
    const categoryCode = slugify(category.id).split('-').map(part => part[0]).join('').toUpperCase().slice(0, 4);
    const imagePool = categoryImagePools[category.id];

    for (let i = 1; i <= PRODUCTS_PER_CATEGORY; i += 1) {
      const type = pick(category.productTypes, i);
      const brand = pick(category.brands, i + 1);
      const spec = pick(category.specs, i + 2);
      const color = pick(category.colors, i + 3);
      const material = pick(category.materials, i + 4);
      const model = `M${String(globalIndex).padStart(4, '0')}`;

      const name = `${type} ${brand} ${spec} ${model}`;
      const slug = `${slugify(name)}-${globalIndex}`;
      const basePrice = computeBasePrice(category.priceRange, globalIndex);
      const variants = buildVariants(categoryCode, globalIndex, basePrice);

      products.push({
        name,
        slug,
        description: `${type} ${brand} phiên bản ${model}, phù hợp nhu cầu mua sắm hằng ngày. Sản phẩm thuộc danh mục ${category.label}, chất lượng ổn định, giao hàng nhanh và dễ sử dụng.`,
        categoryId: category.id,
        brand,
        attributes: {
          color,
          material,
          origin: 'Việt Nam',
          warrantyMonths: pick(category.warrantyMonths, i),
          rating: Number((4 + ((globalIndex % 10) * 0.09)).toFixed(1))
        },
        images: buildImages(imagePool, globalIndex),
        variants
      });

      globalIndex += 1;
    }
  }

  return products;
}

async function main() {
  const categoryImagePools = await buildCategoryImagePools();
  const products = generateProducts(categoryImagePools);
  writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf8');

  console.log(`Generated ${products.length} products -> ${OUTPUT_FILE}`);
  console.log(`Categories: ${categories.length}, products/category: ${PRODUCTS_PER_CATEGORY}`);
}

main().catch((error) => {
  console.error('Failed to generate products:', error);
  process.exitCode = 1;
});
