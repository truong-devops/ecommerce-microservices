#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(process.argv[2] ?? 'services/product-service/seed-data/products-vietnam-demo.json');

const imageByCategory = {
  'thoi-trang-nam': 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
  'thoi-trang-nu': 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=80',
  'dien-thoai-phu-kien': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
  'thiet-bi-dien-tu': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80',
  'may-tinh-laptop': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80',
  'may-anh-may-quay-phim': 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=900&q=80',
  'dong-ho': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
  'giay-dep-nam': 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  'thiet-bi-dien-gia-dung': 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80',
  'the-thao-du-lich': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
  'o-to-xe-may-xe-dap': 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80',
  'me-va-be': 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=80',
  'nha-cua-doi-song': 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=900&q=80',
  'sac-dep': 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80',
  'suc-khoe': 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=900&q=80',
  'giay-dep-nu': 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80',
  'tui-vi-nu': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80',
  'phu-kien-trang-suc-nu': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80',
  'bach-hoa-online': 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  'nha-sach-online': 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=900&q=80'
};

const catalog = [
  category('thoi-trang-nam', [
    item('URBAN-TEE', 'Áo thun nam cotton compact form regular cổ tròn', 'Urban Cotton', 159000, 229000, ['Đen - M', 'Đen - L', 'Trắng - M', 'Trắng - L'], ['Cotton compact mềm và thoáng', 'Form regular dễ phối đồ', 'Đường may gia cố ở vai và cổ'], { material: 'Cotton compact', origin: 'Việt Nam', weightGram: 260 }),
    item('NORTH-POLO', 'Áo polo nam pique co giãn thấm hút tốt', 'North Lane', 249000, 349000, ['Xanh navy - M', 'Xanh navy - L', 'Be - M', 'Be - L'], ['Vải pique co giãn nhẹ', 'Cổ áo giữ phom', 'Phù hợp đi làm và đi chơi'], { material: 'Cotton pique', origin: 'Việt Nam', weightGram: 320 }),
    item('MOVE-SHORT', 'Quần short nam thể thao túi khóa kéo', 'Move Daily', 189000, 269000, ['Đen - M', 'Đen - L', 'Xám - M', 'Xám - L'], ['Vải nhanh khô', 'Túi hai bên có khóa kéo', 'Lưng thun có dây rút'], { material: 'Polyester', origin: 'Việt Nam', weightGram: 280 })
  ]),
  category('thoi-trang-nu', [
    item('LUNA-DRESS', 'Đầm nữ cổ vuông tay phồng dáng midi', 'Luna Wear', 329000, 459000, ['Kem - S', 'Kem - M', 'Đen - S', 'Đen - M'], ['Dáng midi thanh lịch', 'Khóa kéo sau dễ mặc', 'Có lớp lót mềm'], { material: 'Cotton blend', origin: 'Việt Nam', weightGram: 420 }),
    item('MELLOW-CARDI', 'Áo cardigan nữ dệt kim mỏng phong cách Hàn Quốc', 'Mellow Knit', 279000, 389000, ['Kem', 'Hồng phấn', 'Xanh nhạt'], ['Sợi dệt mềm', 'Độ dày vừa phải', 'Phối được nhiều phong cách'], { material: 'Acrylic blend', origin: 'Việt Nam', weightGram: 350 }),
    item('AERI-PANTS', 'Quần ống rộng nữ cạp cao rủ mềm', 'Aeri Studio', 299000, 429000, ['Đen - S', 'Đen - M', 'Nâu - S', 'Nâu - M'], ['Cạp cao tôn dáng', 'Ống suông rộng', 'Vải ít nhăn'], { material: 'Twill mềm', origin: 'Việt Nam', weightGram: 410 })
  ]),
  category('dien-thoai-phu-kien', [
    item('NOVA-BUDS', 'Tai nghe Bluetooth 5.3 chống ồn ENC hộp sạc Type-C', 'NovaSound', 329000, 499000, ['Đen', 'Trắng', 'Tím'], ['Bluetooth 5.3 kết nối ổn định', 'Mic ENC hỗ trợ đàm thoại', 'Hộp sạc dùng cổng Type-C'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 120 }),
    item('VOLT-CHARGE', 'Củ sạc nhanh GaN 35W hai cổng USB-C và USB-A', 'VoltGo', 289000, 399000, ['Trắng', 'Đen'], ['Công suất tối đa 35W', 'Hai cổng sạc tiện dụng', 'Chip bảo vệ quá nhiệt'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 95 }),
    item('MOBI-CASE', 'Ốp lưng chống sốc viền nhám bảo vệ camera', 'MobiCase', 79000, 129000, ['iPhone 13 - Trong', 'iPhone 14 - Trong', 'iPhone 15 - Đen'], ['Viền TPU đàn hồi', 'Gờ bảo vệ cụm camera', 'Nút bấm độ nảy tốt'], { warranty: '1 đổi 1 trong 7 ngày', origin: 'Việt Nam', weightGram: 65 })
  ]),
  category('thiet-bi-dien-tu', [
    item('SOUND-MINI', 'Loa Bluetooth mini công suất 10W chống nước IPX6', 'SonicPod', 399000, 559000, ['Đen', 'Xanh rêu', 'Cam'], ['Âm thanh 10W', 'Kháng nước IPX6', 'Thời lượng nghe đến 10 giờ'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 520 }),
    item('SMART-PLUG', 'Ổ cắm thông minh Wi-Fi điều khiển từ xa hẹn giờ', 'HomeLink', 179000, 249000, ['Bản 10A', 'Bản 16A'], ['Điều khiển qua ứng dụng', 'Hẹn giờ bật tắt', 'Theo dõi trạng thái thiết bị'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 140 }, 30000),
    item('STREAM-MIC', 'Micro thu âm USB cardioid cho học tập và livestream', 'StreamOne', 649000, 849000, ['Đen', 'Trắng'], ['Kết nối USB cắm là dùng', 'Hướng thu cardioid', 'Có nút tắt tiếng nhanh'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 780 })
  ]),
  category('may-tinh-laptop', [
    item('KEY-MECH', 'Bàn phím cơ không dây layout 75% hot-swap', 'KeyNova', 1090000, 1390000, ['Blue switch', 'Brown switch', 'Red switch'], ['Kết nối Bluetooth, 2.4G và USB', 'PCB hot-swap', 'LED RGB nhiều hiệu ứng'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 920 }),
    item('CLICK-MOUSE', 'Chuột không dây công thái học silent click', 'ClickPro', 259000, 349000, ['Đen', 'Trắng', 'Hồng'], ['Thiết kế ôm tay', 'Nút bấm giảm tiếng ồn', 'DPI điều chỉnh ba mức'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 110 }),
    item('ERGO-STAND', 'Giá đỡ laptop nhôm gấp gọn điều chỉnh độ cao', 'ErgoLift', 319000, 449000, ['Bạc', 'Xám'], ['Hợp kim nhôm chắc chắn', 'Điều chỉnh nhiều góc', 'Đệm silicone chống trượt'], { warranty: '6 tháng', origin: 'Trung Quốc', weightGram: 680 })
  ]),
  category('may-anh-may-quay-phim', [
    item('SNAP-TRIPOD', 'Tripod máy ảnh nhôm 1m6 kèm đầu xoay 3 chiều', 'SnapGear', 499000, 699000, ['Bản tiêu chuẩn', 'Kèm túi chống sốc'], ['Chiều cao tối đa 160cm', 'Đầu xoay ba chiều', 'Chân chống trượt'], { warranty: '6 tháng', origin: 'Trung Quốc', weightGram: 1450 }, 80000),
    item('LENS-BAG', 'Túi đựng máy ảnh chống sốc chia ngăn linh hoạt', 'FocusPack', 379000, 529000, ['Size M', 'Size L'], ['Vách ngăn tháo rời', 'Lớp đệm chống va đập', 'Có áo trùm mưa'], { warranty: '3 tháng', origin: 'Việt Nam', weightGram: 620 }, 90000),
    item('RING-LIGHT', 'Đèn LED ring light 12 inch ba chế độ màu', 'GlowShot', 289000, 399000, ['Kèm tripod bàn', 'Kèm tripod 1m6'], ['Ba nhiệt độ màu', 'Mười mức sáng', 'Nguồn USB tiện dụng'], { warranty: '6 tháng', origin: 'Trung Quốc', weightGram: 980 }, 150000)
  ]),
  category('dong-ho', [
    item('TEMPO-CLASSIC', 'Đồng hồ nam mặt tối giản dây thép không gỉ', 'Tempo', 589000, 799000, ['Mặt đen', 'Mặt trắng', 'Mặt xanh'], ['Máy quartz ổn định', 'Dây thép không gỉ', 'Kính khoáng chống xước nhẹ'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 180 }),
    item('ASTRA-SMART', 'Đồng hồ thông minh theo dõi vận động màn hình AMOLED', 'Astra Fit', 1290000, 1690000, ['Đen', 'Kem', 'Hồng'], ['Màn hình AMOLED', 'Theo dõi nhiều môn thể thao', 'Nhận thông báo từ điện thoại'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 150 }),
    item('MONO-WATCH', 'Đồng hồ nữ mặt vuông dây da thanh lịch', 'MonoTime', 449000, 629000, ['Nâu', 'Đen', 'Kem'], ['Mặt vuông nhỏ gọn', 'Dây da mềm', 'Phong cách tối giản'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 120 })
  ]),
  category('giay-dep-nam', [
    item('STRIDE-RUN', 'Giày sneaker nam đế nhẹ thoáng khí', 'Stride', 459000, 649000, ['Đen - 40', 'Đen - 41', 'Trắng - 40', 'Trắng - 41'], ['Upper lưới thoáng khí', 'Đế EVA nhẹ', 'Lót giày êm'], { material: 'Mesh và EVA', origin: 'Việt Nam', weightGram: 760 }),
    item('ROVE-SANDAL', 'Sandal nam quai chéo đế chống trượt', 'Rove', 289000, 399000, ['Nâu - 40', 'Nâu - 41', 'Đen - 40', 'Đen - 41'], ['Quai mềm không cấn chân', 'Đế bám tốt', 'Phù hợp đi hằng ngày'], { material: 'Da PU', origin: 'Việt Nam', weightGram: 650 }),
    item('GENT-LOAFER', 'Giày lười nam da mềm phong cách công sở', 'GentStep', 549000, 749000, ['Đen - 40', 'Đen - 41', 'Nâu - 40', 'Nâu - 41'], ['Da mềm dễ vệ sinh', 'Đế cao su chống trượt', 'Dáng loafer lịch sự'], { material: 'Da PU cao cấp', origin: 'Việt Nam', weightGram: 820 })
  ]),
  category('thiet-bi-dien-gia-dung', [
    item('CHEF-AIR', 'Nồi chiên không dầu điện tử dung tích 5 lít', 'ChefMate', 1390000, 1890000, ['Đen', 'Kem'], ['Dung tích 5 lít', 'Bảng điều khiển cảm ứng', 'Lòng nồi phủ chống dính'], { warranty: '18 tháng', origin: 'Trung Quốc', weightGram: 5200 }),
    item('BREEZE-FAN', 'Quạt tuần hoàn không khí mini ba tốc độ', 'BreezeGo', 529000, 699000, ['Trắng', 'Xanh'], ['Ba mức gió', 'Góc quay linh hoạt', 'Động cơ vận hành êm'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 1800 }),
    item('HEAT-KETTLE', 'Ấm siêu tốc inox 304 tự ngắt 1.7 lít', 'HeatJoy', 369000, 499000, ['Bạc', 'Kem'], ['Ruột inox 304', 'Tự ngắt khi nước sôi', 'Dung tích 1.7 lít'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 1300 })
  ]),
  category('the-thao-du-lich', [
    item('MOVE-YOGA', 'Thảm yoga TPE hai lớp chống trượt 6mm', 'MoveFit', 299000, 419000, ['Tím', 'Xanh rêu', 'Hồng đất'], ['TPE hai lớp', 'Độ dày 6mm', 'Kèm dây đeo tiện lợi'], { material: 'TPE', origin: 'Trung Quốc', weightGram: 900 }),
    item('TRAIL-BOTTLE', 'Bình giữ nhiệt thể thao inox 750ml có quai xách', 'TrailGo', 279000, 389000, ['Đen', 'Trắng', 'Xanh'], ['Inox 304 hai lớp', 'Nắp kín chống rò', 'Dung tích 750ml'], { material: 'Inox 304', origin: 'Trung Quốc', weightGram: 430 }),
    item('FLEX-BAND', 'Bộ dây kháng lực tập gym 5 mức lực', 'FlexBand', 199000, 289000, ['Bộ cơ bản', 'Bộ kèm túi'], ['Năm mức kháng lực', 'Latex đàn hồi', 'Dùng tập tại nhà hoặc du lịch'], { material: 'Latex', origin: 'Trung Quốc', weightGram: 650 }, 40000)
  ]),
  category('o-to-xe-may-xe-dap', [
    item('ROAD-HOLDER', 'Giá đỡ điện thoại ô tô khóa tự động', 'RoadMate', 249000, 349000, ['Gắn cửa gió', 'Gắn taplo'], ['Khóa điện thoại tự động', 'Xoay ngang dọc 360 độ', 'Đệm silicone chống trầy'], { warranty: '6 tháng', origin: 'Trung Quốc', weightGram: 210 }, 30000),
    item('RIDE-PUMP', 'Bơm lốp điện mini màn hình số dùng cho ô tô xe máy', 'RideSafe', 799000, 1090000, ['Bản tiêu chuẩn', 'Bản kèm túi'], ['Hiển thị áp suất số', 'Tự dừng khi đủ áp suất', 'Đèn LED hỗ trợ ban đêm'], { warranty: '12 tháng', origin: 'Trung Quốc', weightGram: 780 }, 90000),
    item('AUTO-CLEAN', 'Bộ vệ sinh nội thất ô tô 8 món', 'AutoCare', 189000, 269000, ['Hương chanh', 'Không mùi'], ['Đủ dụng cụ vệ sinh cơ bản', 'Dùng cho taplo và ghế xe', 'Túi đựng gọn gàng'], { origin: 'Việt Nam', weightGram: 1100 })
  ]),
  category('me-va-be', [
    item('BEMAY-DIAPER', 'Tã quần siêu mỏng thoáng khí cho bé', 'Bé Mây', 285000, 345000, ['Size M - 54 miếng', 'Size L - 48 miếng', 'Size XL - 42 miếng'], ['Lõi thấm hút nhanh', 'Bề mặt mềm thoáng', 'Vạch báo thay tã'], { origin: 'Việt Nam', weightGram: 1900 }, 10000),
    item('TINY-BOTTLE', 'Bình sữa PPSU cổ rộng chống đầy hơi 240ml', 'TinySip', 259000, 349000, ['Màu kem', 'Màu xanh', 'Màu hồng'], ['Chất liệu PPSU', 'Van thông khí', 'Cổ rộng dễ vệ sinh'], { material: 'PPSU', origin: 'Trung Quốc', weightGram: 160 }),
    item('SOFT-WIPES', 'Khăn ướt em bé không mùi 100 tờ nắp bật', 'SoftCare', 45000, 59000, ['1 gói', 'Combo 5 gói', 'Thùng 10 gói'], ['Không bổ sung hương liệu', 'Sợi vải mềm', 'Nắp bật giữ ẩm'], { origin: 'Việt Nam', weightGram: 520 }, 150000)
  ]),
  category('nha-cua-doi-song', [
    item('HOME-BOX', 'Hộp đựng đồ gấp gọn có cửa mở phía trước', 'HomeNest', 189000, 269000, ['Size M - Trắng', 'Size L - Trắng', 'Size L - Xám'], ['Có thể xếp chồng', 'Mở nắp trên và cửa trước', 'Bánh xe nhỏ dễ di chuyển'], { material: 'Nhựa PP', origin: 'Việt Nam', weightGram: 1450 }, 50000),
    item('FRESH-CONTAINER', 'Bộ hộp bảo quản thực phẩm kín khí 5 món', 'FreshBox', 299000, 419000, ['Nắp trắng', 'Nắp xanh'], ['Gioăng kín hạn chế ám mùi', 'Nhiều kích thước', 'Thân hộp trong dễ quan sát'], { material: 'Nhựa PP', origin: 'Việt Nam', weightGram: 980 }),
    item('AQUA-TUMBLER', 'Ly giữ nhiệt có ống hút dung tích 900ml', 'AquaDay', 259000, 359000, ['Trắng', 'Hồng', 'Xanh mint'], ['Dung tích 900ml', 'Có tay cầm và ống hút', 'Đáy vừa hộc để ly ô tô'], { material: 'Inox 304', origin: 'Trung Quốc', weightGram: 520 })
  ]),
  category('sac-dep', [
    item('LUMI-SUN', 'Kem chống nắng nâng tông nhẹ SPF50+ PA++++ 50ml', 'LumiSkin', 269000, 359000, ['Bản tự nhiên', 'Bản nâng tông'], ['Kết cấu mỏng nhẹ', 'Hoàn thiện ráo', 'Phù hợp dùng hằng ngày'], { origin: 'Hàn Quốc', volumeMl: 50, skinType: 'Mọi loại da' }),
    item('PURE-CLEANSER', 'Sữa rửa mặt dịu nhẹ pH cân bằng 150ml', 'PureLab', 219000, 289000, ['150ml', 'Combo 2 chai'], ['Làm sạch dịu nhẹ', 'Không gây cảm giác khô căng', 'Dạng gel dễ tạo bọt'], { origin: 'Việt Nam', volumeMl: 150, skinType: 'Da thường và da dầu' }, 190000),
    item('VELVET-LIP', 'Son kem lì mịn nhẹ môi bảng màu đất', 'VelvetHue', 179000, 249000, ['01 Đỏ gạch', '02 Cam đất', '03 Hồng nâu', '04 Đỏ lạnh'], ['Chất son mịn', 'Màu lên rõ', 'Thiết kế nhỏ gọn'], { origin: 'Việt Nam', weightGram: 35 })
  ]),
  category('suc-khoe', [
    item('WELL-SCALE', 'Cân điện tử sức khỏe kính cường lực', 'WellScale', 239000, 329000, ['Đen', 'Trắng', 'Hồng'], ['Cảm biến bốn điểm', 'Màn hình LED', 'Tự động bật khi sử dụng'], { warranty: '12 tháng', origin: 'Trung Quốc', maxLoadKg: 180 }),
    item('WARM-PATCH', 'Miếng dán giữ ấm dùng một lần gói 10 miếng', 'WarmPatch', 69000, 99000, ['Gói 10 miếng', 'Combo 3 gói'], ['Tỏa ấm từ từ', 'Dạng mỏng dễ mang theo', 'Sử dụng ngoài quần áo'], { origin: 'Việt Nam', weightGram: 180 }, 120000),
    item('CARE-BOX', 'Hộp chia thuốc 7 ngày sáng trưa tối', 'CarePlus', 89000, 129000, ['Xanh', 'Trắng'], ['Chia theo bảy ngày', 'Ba ngăn mỗi ngày', 'Nắp đóng chắc chắn'], { material: 'Nhựa PP', origin: 'Trung Quốc', weightGram: 240 })
  ]),
  category('giay-dep-nu', [
    item('MIRA-SNEAKER', 'Giày sneaker nữ đế độn 4cm phong cách tối giản', 'Mira', 429000, 599000, ['Trắng - 36', 'Trắng - 37', 'Kem - 36', 'Kem - 37'], ['Đế độn 4cm', 'Lót êm', 'Thiết kế dễ phối đồ'], { material: 'Da PU và cao su', origin: 'Việt Nam', weightGram: 720 }),
    item('BELLE-FLAT', 'Giày búp bê nữ mũi vuông đính nơ', 'BelleStep', 319000, 449000, ['Đen - 36', 'Đen - 37', 'Kem - 36', 'Kem - 37'], ['Mũi vuông hiện đại', 'Lót mềm', 'Gót thấp dễ đi'], { material: 'Da PU', origin: 'Việt Nam', weightGram: 520 }),
    item('CLOUD-SANDAL', 'Sandal nữ quai ngang đế êm chống trượt', 'CloudWalk', 279000, 389000, ['Đen - 36', 'Đen - 37', 'Be - 36', 'Be - 37'], ['Đế êm nhẹ', 'Quai ngang chắc chắn', 'Rãnh đế tăng độ bám'], { material: 'EVA', origin: 'Việt Nam', weightGram: 480 })
  ]),
  category('tui-vi-nu', [
    item('LUNA-TOTE', 'Túi tote nữ da mềm đựng vừa laptop 13 inch', 'LunaBag', 399000, 549000, ['Đen', 'Nâu', 'Kem'], ['Ngăn chính rộng', 'Có ngăn khóa kéo', 'Quai đeo chắc chắn'], { material: 'Da PU', origin: 'Việt Nam', weightGram: 620 }),
    item('DAILY-CROSS', 'Túi đeo chéo nữ mini nhiều ngăn', 'DailyCarry', 259000, 359000, ['Đen', 'Kem', 'Xanh rêu'], ['Ba ngăn tiện dụng', 'Dây đeo điều chỉnh', 'Khóa kéo trơn'], { material: 'Vải canvas chống bám nước nhẹ', origin: 'Việt Nam', weightGram: 340 }),
    item('MINI-WALLET', 'Ví nữ gập ngắn khóa bấm nhiều ngăn thẻ', 'Mori Wallet', 189000, 269000, ['Nâu', 'Đen', 'Hồng'], ['Nhiều khe thẻ', 'Ngăn tiền xu có khóa', 'Kích thước nhỏ gọn'], { material: 'Da PU', origin: 'Việt Nam', weightGram: 160 })
  ]),
  category('phu-kien-trang-suc-nu', [
    item('GLIMMER-NECK', 'Dây chuyền nữ mặt giọt nước phong cách tối giản', 'Glimmer', 149000, 219000, ['Màu bạc', 'Màu vàng'], ['Thiết kế thanh mảnh', 'Dây có nấc điều chỉnh', 'Hộp đựng phù hợp làm quà'], { material: 'Thép không gỉ', origin: 'Trung Quốc', weightGram: 45 }),
    item('PEARL-EARRING', 'Bông tai ngọc trai nhân tạo dáng nhỏ thanh lịch', 'Ami Jewelry', 119000, 179000, ['Trắng', 'Hồng nhạt'], ['Dáng nhỏ dễ đeo', 'Chốt chắc chắn', 'Kèm hộp bảo quản'], { material: 'Hợp kim và ngọc trai nhân tạo', origin: 'Trung Quốc', weightGram: 35 }),
    item('HAIR-CLIP', 'Set 6 kẹp tóc nữ màu trung tính nhiều kiểu', 'Mellow Accessory', 89000, 129000, ['Tông nâu', 'Tông pastel'], ['Sáu mẫu trong một set', 'Lò xo kẹp chắc', 'Màu dễ phối trang phục'], { material: 'Nhựa acetate và hợp kim', origin: 'Trung Quốc', weightGram: 120 })
  ]),
  category('bach-hoa-online', [
    item('MOC-COFFEE', 'Cà phê rang xay nguyên chất pha phin 500g', 'Mộc Brew', 159000, 199000, ['Rang vừa', 'Rang đậm'], ['Hương thơm cân bằng', 'Xay phù hợp pha phin', 'Túi có van một chiều'], { origin: 'Việt Nam', weightGram: 500, shelfLifeMonths: 12 }),
    item('NUTRI-GRANOLA', 'Granola yến mạch hạt dinh dưỡng ít ngọt 500g', 'NutriDay', 189000, 249000, ['Vị truyền thống', 'Vị cacao'], ['Yến mạch nướng giòn', 'Kết hợp nhiều loại hạt', 'Túi zip tiện bảo quản'], { origin: 'Việt Nam', weightGram: 500, shelfLifeMonths: 9 }),
    item('GREEN-CASHEW', 'Hạt điều rang muối vỏ lụa loại 1 hộp 500g', 'GreenFarm', 209000, 269000, ['Hộp 500g', 'Combo 2 hộp'], ['Hạt kích thước đồng đều', 'Rang vừa vị', 'Hộp kín tiện bảo quản'], { origin: 'Việt Nam', weightGram: 500, shelfLifeMonths: 12 }, 190000)
  ]),
  category('nha-sach-online', [
    item('PAPER-PLANNER', 'Sổ planner 12 tháng bìa cứng tối giản', 'PaperMood', 129000, 179000, ['Xanh navy', 'Kem', 'Hồng đất'], ['Bố cục theo tháng và tuần', 'Giấy màu kem dễ viết', 'Có dây đánh dấu trang'], { origin: 'Việt Nam', pageCount: 224, weightGram: 420 }),
    item('STUDY-PEN', 'Bộ bút highlight 6 màu pastel đầu vát', 'StudyMate', 79000, 109000, ['Bộ 6 màu', 'Combo 2 bộ'], ['Màu pastel dịu mắt', 'Đầu vát hai nét', 'Mực khô nhanh'], { origin: 'Trung Quốc', weightGram: 140 }, 65000),
    item('BOOK-STAND', 'Giá đỡ sách đọc bàn điều chỉnh 6 góc', 'BookEase', 219000, 299000, ['Gỗ sáng', 'Gỗ nâu'], ['Điều chỉnh sáu góc', 'Thanh giữ trang', 'Gấp gọn khi không dùng'], { material: 'Gỗ ép phủ veneer', origin: 'Việt Nam', weightGram: 950 })
  ])
];

const products = catalog.flatMap(({ categoryId, items }) => items.map((product) => buildProduct(categoryId, product)));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
console.log(`Generated ${products.length} products and ${products.reduce((sum, product) => sum + product.variants.length, 0)} variants.`);
console.log(outputPath);

function category(categoryId, items) {
  return { categoryId, items };
}

function item(sku, name, brand, price, compareAtPrice, options, features, attributes, priceStep = 0) {
  return { sku, name, brand, price, compareAtPrice, options, features, attributes, priceStep };
}

function buildProduct(categoryId, product) {
  const slug = slugify(product.name);
  const optionText = product.options.join(', ');
  const description = [
    product.name.toUpperCase(),
    '',
    'ĐIỂM NỔI BẬT',
    ...product.features.map((feature) => `• ${feature}`),
    '',
    'THÔNG TIN SẢN PHẨM',
    `• Thương hiệu: ${product.brand}`,
    `• Phân loại: ${optionText}`,
    `• Xuất xứ: ${product.attributes.origin ?? 'Đang cập nhật'}`,
    '',
    'CAM KẾT CỦA SHOP',
    '• Sản phẩm mới, được kiểm tra trước khi đóng gói.',
    '• Giao đúng mẫu và đúng phân loại khách hàng đã chọn.',
    '• Hỗ trợ xử lý nếu sản phẩm giao sai hoặc phát sinh lỗi từ nhà sản xuất.'
  ].join('\n');

  return {
    name: product.name,
    slug,
    description,
    categoryId,
    brand: product.brand,
    attributes: {
      ...product.attributes,
      condition: 'Mới',
      dispatchFrom: 'TP. Hồ Chí Minh',
      demoSeed: 'vietnam-catalog-2026'
    },
    images: [
      imageByCategory[categoryId],
      `https://picsum.photos/seed/${product.sku.toLowerCase()}/900/900`
    ],
    variants: product.options.map((option, index) => {
      const priceDelta = product.priceStep * index;
      return {
        sku: `${product.sku}-V${index + 1}`,
        name: option,
        price: product.price + priceDelta,
        currency: 'VND',
        initialStock: Math.max(12, 80 - index * 11),
        compareAtPrice: product.compareAtPrice + priceDelta,
        isDefault: index === 0,
        metadata: {
          option,
          demoSeed: true
        }
      };
    }),
    status: 'DRAFT'
  };
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 240);
}
