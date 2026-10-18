#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const outputPath = resolve(
  process.argv[2] ?? 'services/product-service/seed-data/products-technology-demo.json'
);

const imageByCategory = {
  'dien-thoai-phu-kien': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80',
  'may-tinh-laptop': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80',
  'thiet-bi-dien-tu': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=900&q=80',
  'may-anh-may-quay-phim': 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=900&q=80'
};

const catalog = [
  category('dien-thoai-phu-kien', [
    item('DTECH-NOVA-A55', 'Điện thoại Nova A55 5G màn hình AMOLED 120Hz', 'Nova Mobile', 5990000, 6990000, [
      option('8GB + 128GB - Đen thiên thạch'),
      option('8GB + 128GB - Xanh băng'),
      option('8GB + 256GB - Đen thiên thạch', 800000),
      option('8GB + 256GB - Xanh băng', 800000)
    ], ['Màn hình AMOLED 6.6 inch tần số quét 120Hz', 'Kết nối 5G, NFC và hai SIM', 'Camera chính 64MP chống rung điện tử', 'Pin 5.000mAh, sạc nhanh 45W'], { warranty: '18 tháng', origin: 'Việt Nam', screen: '6.6 inch AMOLED 120Hz', chipset: 'Octa-core 5G', batteryMah: 5000, weightGram: 191 }),
    item('DTECH-LITE-C12', 'Điện thoại Lite C12 pin 5000mAh camera kép AI', 'LitePhone', 2790000, 3290000, [
      option('4GB + 128GB - Đen'),
      option('4GB + 128GB - Xanh'),
      option('6GB + 128GB - Đen', 400000)
    ], ['Màn hình 6.5 inch HD+', 'Camera kép AI 50MP', 'Mở khóa khuôn mặt và vân tay cạnh bên', 'Pin 5.000mAh dùng trọn ngày'], { warranty: '12 tháng', origin: 'Việt Nam', screen: '6.5 inch HD+', batteryMah: 5000, weightGram: 198 }),
    item('DTECH-AIRTAB-11', 'Máy tính bảng AirTab 11 Wi-Fi màn hình 2K', 'AirTab', 6490000, 7490000, [
      option('6GB + 128GB - Xám'),
      option('8GB + 256GB - Xám', 1400000),
      option('8GB + 256GB - Xanh', 1400000)
    ], ['Màn hình 11 inch độ phân giải 2K', 'Bốn loa stereo', 'Pin 7.500mAh và sạc nhanh USB-C', 'Hỗ trợ bàn phím và bút cảm ứng'], { warranty: '18 tháng', origin: 'Trung Quốc', screen: '11 inch IPS 2K', batteryMah: 7500, weightGram: 475 }),
    item('DTECH-AIRBUDS-X3', 'Tai nghe Bluetooth AirBuds X3 chống ồn chủ động', 'NovaSound', 899000, 1190000, [
      option('Đen graphite'), option('Trắng ngọc trai'), option('Xanh navy')
    ], ['Chống ồn chủ động lên đến 35dB', 'Ba micro mỗi bên hỗ trợ đàm thoại', 'Chế độ xuyên âm và độ trễ thấp', 'Tổng thời lượng sử dụng đến 30 giờ'], { warranty: '12 tháng', origin: 'Trung Quốc', bluetooth: '5.3', waterResistance: 'IPX5', weightGram: 52 }),
    item('DTECH-HEADSET-H7', 'Tai nghe chụp tai H7 Hybrid ANC pin 45 giờ', 'SonicPeak', 1490000, 1890000, [
      option('Đen'), option('Kem', 100000)
    ], ['Chống ồn chủ động hybrid', 'Driver 40mm cân bằng ba dải âm', 'Kết nối đồng thời hai thiết bị', 'Pin đến 45 giờ, sạc nhanh 10 phút'], { warranty: '12 tháng', origin: 'Trung Quốc', bluetooth: '5.3', driverMm: 40, weightGram: 245 }),
    item('DTECH-GAN-67', 'Củ sạc nhanh GaN 67W ba cổng PD PPS', 'VoltEdge', 649000, 849000, [
      option('Trắng'), option('Đen')
    ], ['Hai cổng USB-C và một cổng USB-A', 'Hỗ trợ PD 3.0, PPS và QC', 'Chip GaN giúp thiết kế nhỏ gọn', 'Tự điều chỉnh công suất giữa các cổng'], { warranty: '18 tháng', origin: 'Trung Quốc', maxPowerW: 67, ports: '2 USB-C + 1 USB-A', weightGram: 128 }),
    item('DTECH-POWER-20K', 'Pin sạc dự phòng 20000mAh sạc nhanh 30W có màn hình', 'VoltEdge', 799000, 999000, [
      option('Đen'), option('Trắng')
    ], ['Dung lượng 20.000mAh', 'Sạc nhanh hai chiều USB-C 30W', 'Màn hình hiển thị phần trăm pin', 'Bảo vệ quá dòng và quá nhiệt'], { warranty: '12 tháng', origin: 'Trung Quốc', capacityMah: 20000, maxPowerW: 30, weightGram: 365 }),
    item('DTECH-CABLE-100', 'Cáp USB-C to USB-C 100W bọc dù có E-Marker', 'WireLab', 159000, 229000, [
      option('1 mét - Đen'), option('2 mét - Đen', 50000), option('2 mét - Xám', 50000)
    ], ['Công suất sạc tối đa 100W', 'Chip E-Marker nhận diện dòng điện', 'Vỏ bọc dù chống rối', 'Đầu cáp gia cố chịu uốn'], { warranty: '12 tháng', origin: 'Việt Nam', maxPowerW: 100, dataSpeed: '480Mbps', weightGram: 68 }),
    item('DTECH-MAGDOCK-15', 'Đế sạc không dây nam châm 3 trong 1 công suất 15W', 'MagDock', 1090000, 1390000, [
      option('Đen'), option('Trắng')
    ], ['Sạc đồng thời điện thoại, tai nghe và đồng hồ', 'Nam châm căn chỉnh vị trí sạc', 'Có đèn trạng thái dịu mắt', 'Tặng kèm cáp USB-C 1 mét'], { warranty: '12 tháng', origin: 'Trung Quốc', maxPowerW: 15, input: 'USB-C', weightGram: 310 }),
    item('DTECH-GLASS-9H', 'Kính cường lực full màn hình 9H chống bám vân tay', 'ShieldPro', 99000, 149000, [
      option('Nova A55 - 1 miếng'), option('iPhone 14 - 1 miếng'), option('iPhone 15 - 1 miếng'), option('Combo 2 miếng', 70000)
    ], ['Kính độ cứng 9H', 'Lớp phủ hạn chế bám vân tay', 'Bo cong viền 2.5D', 'Kèm bộ vệ sinh và khung căn chỉnh'], { warranty: 'Đổi mới nếu lỗi khi mở hộp', origin: 'Việt Nam', material: 'Kính aluminosilicate', weightGram: 42 })
  ]),
  category('may-tinh-laptop', [
    item('DTECH-BOOK-A14', 'Laptop WorkBook A14 Core i5 RAM 16GB SSD 512GB', 'WorkBook', 16990000, 18990000, [
      option('Core i5 - 16GB - 512GB'), option('Core i5 - 16GB - 1TB', 1800000)
    ], ['Màn hình 14 inch IPS Full HD', 'RAM 16GB chạy đa nhiệm mượt', 'Bàn phím có đèn nền', 'Vỏ kim loại, khối lượng 1,38kg'], { warranty: '24 tháng', origin: 'Việt Nam', cpu: 'Intel Core i5', screen: '14 inch IPS Full HD', weightGram: 1380 }),
    item('DTECH-CREATOR-15', 'Laptop Creator 15 Ryzen 7 đồ họa rời 6GB', 'PixelForge', 23990000, 26990000, [
      option('16GB + SSD 512GB'), option('32GB + SSD 1TB', 4200000)
    ], ['CPU Ryzen 7 tám nhân', 'GPU rời 6GB phù hợp thiết kế và dựng phim', 'Màn hình 15.6 inch 100% sRGB', 'Hệ thống tản nhiệt hai quạt'], { warranty: '24 tháng', origin: 'Trung Quốc', cpu: 'AMD Ryzen 7', gpu: 'Discrete 6GB', screen: '15.6 inch IPS 100% sRGB', weightGram: 1850 }),
    item('DTECH-VIEW-24', 'Màn hình ViewPro 24 inch IPS 100Hz viền mỏng', 'ViewPro', 2990000, 3490000, [
      option('24 inch - Chân tiêu chuẩn'), option('24 inch - Kèm arm đơn', 650000)
    ], ['Tấm nền IPS Full HD', 'Tần số quét 100Hz', 'Độ phủ màu 99% sRGB', 'Cổng HDMI và DisplayPort'], { warranty: '36 tháng', origin: 'Trung Quốc', screen: '23.8 inch IPS', refreshRateHz: 100, weightGram: 3400 }),
    item('DTECH-VIEW-27Q', 'Màn hình ViewPro 27 inch QHD 165Hz chuyên game', 'ViewPro', 6490000, 7490000, [
      option('27 inch QHD 165Hz'), option('27 inch QHD 180Hz', 700000)
    ], ['Độ phân giải QHD 2560 x 1440', 'Tần số quét đến 180Hz', 'Thời gian phản hồi 1ms', 'Chân đế nâng hạ và xoay dọc'], { warranty: '36 tháng', origin: 'Trung Quốc', screen: '27 inch Fast IPS QHD', refreshRateHz: 165, weightGram: 5900 }),
    item('DTECH-KEY-75', 'Bàn phím cơ KeyForge K75 không dây hot-swap', 'KeyForge', 1390000, 1690000, [
      option('Linear switch - Đen'), option('Linear switch - Trắng'), option('Tactile switch - Đen', 100000)
    ], ['Layout 75% gọn gàng', 'Kết nối Bluetooth, 2.4GHz và USB-C', 'Mạch hot-swap thay switch không cần hàn', 'Keycap PBT và LED RGB'], { warranty: '18 tháng', origin: 'Trung Quốc', layout: '75%', connectivity: 'Bluetooth/2.4GHz/USB-C', weightGram: 860 }),
    item('DTECH-MOUSE-M5', 'Chuột không dây Feather M5 cảm biến 26000 DPI', 'FeatherGear', 990000, 1290000, [
      option('Đen'), option('Trắng'), option('Hồng', 50000)
    ], ['Cảm biến quang học 26.000 DPI', 'Khối lượng chỉ 59g', 'Polling rate 1.000Hz', 'Pin sử dụng đến 70 giờ'], { warranty: '18 tháng', origin: 'Trung Quốc', sensorDpi: 26000, pollingRateHz: 1000, weightGram: 59 }),
    item('DTECH-SSD-P4', 'Ổ cứng SSD NVMe PCIe 4.0 tốc độ đọc 5000MB/s', 'DataCore', 1290000, 1590000, [
      option('500GB'), option('1TB', 900000), option('2TB', 2700000)
    ], ['Chuẩn NVMe PCIe 4.0 x4', 'Tốc độ đọc tuần tự đến 5.000MB/s', 'Hỗ trợ S.M.A.R.T và TRIM', 'Tặng kèm tản nhiệt nhôm mỏng'], { warranty: '60 tháng', origin: 'Đài Loan', interface: 'M.2 2280 PCIe 4.0', readSpeed: '5000MB/s', weightGram: 38 }),
    item('DTECH-RAM-D4', 'RAM DDR4 3200MHz tản nhiệt nhôm cho máy bàn', 'DataCore', 699000, 899000, [
      option('8GB x1'), option('16GB x1', 550000), option('16GB x2', 1750000)
    ], ['Bus 3.200MHz', 'Tản nhiệt nhôm nguyên khối', 'Hỗ trợ cấu hình XMP', 'Đã kiểm tra tương thích trước khi đóng gói'], { warranty: '36 tháng', origin: 'Đài Loan', memoryType: 'DDR4', busMHz: 3200, weightGram: 76 }),
    item('DTECH-HUB-9', 'Hub USB-C 9 trong 1 HDMI 4K LAN PD 100W', 'PortMate', 899000, 1190000, [
      option('Xám'), option('Bạc')
    ], ['HDMI xuất hình 4K 60Hz', 'LAN Gigabit và đầu đọc SD/microSD', 'Sạc xuyên qua PD đến 100W', 'Vỏ nhôm hỗ trợ tản nhiệt'], { warranty: '18 tháng', origin: 'Trung Quốc', ports: '9 cổng', maxPowerW: 100, weightGram: 132 }),
    item('DTECH-WEBCAM-2K', 'Webcam 2K tự động lấy nét kèm nắp che riêng tư', 'MeetCam', 849000, 1090000, [
      option('Bản tiêu chuẩn'), option('Kèm tripod mini', 120000)
    ], ['Độ phân giải 2K 30fps', 'Tự động lấy nét và cân bằng sáng', 'Micro kép giảm tiếng ồn', 'Nắp che camera vật lý'], { warranty: '18 tháng', origin: 'Trung Quốc', resolution: '2K 30fps', connection: 'USB-A/USB-C', weightGram: 148 })
  ]),
  category('thiet-bi-dien-tu', [
    item('DTECH-SPEAKER-S20', 'Loa Bluetooth SoundBox S20 công suất 20W chống nước', 'SonicPeak', 1190000, 1490000, [
      option('Đen'), option('Xanh rêu'), option('Cam')
    ], ['Hai driver toàn dải tổng công suất 20W', 'Kháng nước IPX7', 'Ghép đôi hai loa tạo âm thanh stereo', 'Pin nghe nhạc đến 16 giờ'], { warranty: '18 tháng', origin: 'Trung Quốc', maxPowerW: 20, waterResistance: 'IPX7', weightGram: 680 }),
    item('DTECH-PROJECT-P1', 'Máy chiếu mini Project P1 Full HD Android Wi-Fi', 'LumiView', 3290000, 3990000, [
      option('Bản tiêu chuẩn'), option('Kèm màn chiếu 100 inch', 500000)
    ], ['Độ phân giải thực Full HD', 'Hệ điều hành Android tích hợp', 'Wi-Fi băng tần kép và Bluetooth', 'Tự chỉnh keystone bốn góc'], { warranty: '18 tháng', origin: 'Trung Quốc', resolution: '1920x1080', brightnessAnsi: 450, weightGram: 1450 }),
    item('DTECH-ROUTER-AX3', 'Router Wi-Fi 6 AX3000 phủ sóng căn hộ', 'NetFlow', 1290000, 1590000, [
      option('1 router'), option('Bộ 2 router mesh', 1150000)
    ], ['Chuẩn Wi-Fi 6 tốc độ AX3000', 'Bốn anten độ lợi cao', 'Hỗ trợ mesh và roaming', 'Quản lý thiết bị bằng ứng dụng'], { warranty: '24 tháng', origin: 'Trung Quốc', wifiStandard: 'Wi-Fi 6 AX3000', lanPorts: 4, weightGram: 420 }),
    item('DTECH-CAM-C3', 'Camera Wi-Fi trong nhà 2K xoay 360 độ', 'SafeNest', 699000, 899000, [
      option('Camera đơn'), option('Camera + thẻ 64GB', 220000), option('Bộ 2 camera', 620000)
    ], ['Độ phân giải 2K', 'Xoay ngang 360 độ và theo dõi chuyển động', 'Đàm thoại hai chiều', 'Hỗ trợ thẻ nhớ và lưu trữ đám mây'], { warranty: '18 tháng', origin: 'Trung Quốc', resolution: '2K', nightVision: true, weightGram: 285 }),
    item('DTECH-PLUG-P16', 'Ổ cắm thông minh Wi-Fi 16A đo điện năng', 'HomeGrid', 249000, 329000, [
      option('1 ổ'), option('Combo 2 ổ', 210000), option('Combo 4 ổ', 590000)
    ], ['Điều khiển bật tắt từ xa', 'Theo dõi lượng điện tiêu thụ', 'Hẹn giờ và tạo ngữ cảnh tự động', 'Chịu tải tối đa 16A'], { warranty: '12 tháng', origin: 'Việt Nam', maxCurrentA: 16, connectivity: 'Wi-Fi 2.4GHz', weightGram: 118 }),
    item('DTECH-MIC-M2', 'Micro USB condenser M2 cho podcast và livestream', 'StreamOne', 1290000, 1590000, [
      option('Micro + chân bàn'), option('Bộ micro + arm kẹp bàn', 450000)
    ], ['Hướng thu cardioid hạn chế tiếng ồn phía sau', 'Độ phân giải âm thanh 24-bit/96kHz', 'Nút tắt tiếng cảm ứng', 'Cổng tai nghe kiểm âm trực tiếp'], { warranty: '18 tháng', origin: 'Trung Quốc', sampleRate: '24-bit/96kHz', connection: 'USB-C', weightGram: 720 }),
    item('DTECH-GAME-G8', 'Tay cầm chơi game không dây G8 Hall Effect', 'GameNest', 1090000, 1390000, [
      option('Đen'), option('Trắng'), option('Tím trong suốt', 100000)
    ], ['Cần analog Hall Effect chống trôi', 'Kết nối Bluetooth, 2.4GHz và USB', 'Rung kép và con quay hồi chuyển', 'Tương thích PC, Android và Nintendo Switch'], { warranty: '18 tháng', origin: 'Trung Quốc', connectivity: 'Bluetooth/2.4GHz/USB-C', batteryMah: 1000, weightGram: 235 }),
    item('DTECH-WATCH-F5', 'Đồng hồ thông minh FitWatch F5 AMOLED GPS', 'FitPulse', 1990000, 2390000, [
      option('Đen'), option('Bạc dây xám'), option('Vàng hồng dây kem', 100000)
    ], ['Màn hình AMOLED 1.43 inch', 'GPS độc lập và hơn 100 chế độ thể thao', 'Theo dõi nhịp tim và giấc ngủ', 'Kháng nước 5ATM'], { warranty: '18 tháng', origin: 'Trung Quốc', screen: '1.43 inch AMOLED', waterResistance: '5ATM', weightGram: 48 }),
    item('DTECH-READER-R6', 'Máy đọc sách PaperView R6 màn hình mực điện tử 6 inch', 'PaperView', 3490000, 3990000, [
      option('16GB - Đen'), option('32GB - Xanh', 600000)
    ], ['Màn hình E-Ink 6 inch 300ppi', 'Đèn nền điều chỉnh nhiệt màu', 'Chống nước IPX8', 'Pin sử dụng nhiều tuần'], { warranty: '18 tháng', origin: 'Trung Quốc', screen: '6 inch E-Ink 300ppi', waterResistance: 'IPX8', weightGram: 174 }),
    item('DTECH-UPS-U12', 'Bộ lưu điện mini 12V cho modem và router Wi-Fi', 'PowerSafe', 549000, 699000, [
      option('Pin 10.000mAh'), option('Pin 20.000mAh', 350000)
    ], ['Duy trì mạng khi mất điện', 'Ngõ ra 5V, 9V và 12V', 'Tự chuyển nguồn không gián đoạn', 'Có bảo vệ sạc và quá dòng'], { warranty: '12 tháng', origin: 'Việt Nam', outputs: '5V/9V/12V', weightGram: 420 })
  ]),
  category('may-anh-may-quay-phim', [
    item('DTECH-ACTION-X4', 'Camera hành trình thể thao Action X4 quay 4K', 'AdventureCam', 2490000, 2990000, [
      option('Camera + bộ phụ kiện cơ bản'), option('Camera + pin dự phòng + thẻ 64GB', 550000)
    ], ['Quay video 4K 30fps', 'Chống rung điện tử sáu trục', 'Vỏ chống nước đến 30 mét', 'Màn hình kép trước và sau'], { warranty: '18 tháng', origin: 'Trung Quốc', resolution: '4K 30fps', waterDepthM: 30, weightGram: 128 }),
    item('DTECH-DASH-D2', 'Camera hành trình ô tô Dash D2 ghi hình trước sau 2K', 'RoadVision', 2190000, 2690000, [
      option('Camera trước + sau'), option('Bộ camera + thẻ 128GB', 420000)
    ], ['Camera trước 2K và camera sau Full HD', 'Cảm biến va chạm khóa video', 'Ghi hình vòng lặp', 'Kết nối Wi-Fi xem video trên điện thoại'], { warranty: '18 tháng', origin: 'Trung Quốc', resolution: '2K + 1080p', fieldOfView: '150 độ', weightGram: 390 }),
    item('DTECH-GIMBAL-G3', 'Gimbal chống rung điện thoại G3 theo dõi khuôn mặt', 'MotionPro', 1790000, 2190000, [
      option('Đen'), option('Xám')
    ], ['Chống rung ba trục', 'Theo dõi khuôn mặt bằng AI', 'Điều khiển cử chỉ', 'Gấp gọn, có tripod tích hợp'], { warranty: '18 tháng', origin: 'Trung Quốc', payloadGram: 300, batteryHours: 10, weightGram: 355 }),
    item('DTECH-TRIPOD-T6', 'Tripod nhôm T6 cao 1m7 đầu bi xoay linh hoạt', 'FocusGear', 899000, 1190000, [
      option('Tripod + túi'), option('Tripod + remote Bluetooth', 100000)
    ], ['Chiều cao tối đa 170cm', 'Đầu bi xoay 360 độ', 'Một chân tháo rời dùng làm monopod', 'Móc treo tăng độ ổn định'], { warranty: '12 tháng', origin: 'Trung Quốc', maxHeightCm: 170, maxLoadKg: 6, weightGram: 1520 }),
    item('DTECH-LIGHT-L60', 'Đèn LED quay phim L60 RGB chỉnh nhiệt màu', 'GlowFrame', 1190000, 1490000, [
      option('Đèn + ngàm máy ảnh'), option('Bộ đèn + chân 2 mét', 450000)
    ], ['Điều chỉnh nhiệt màu 2.500K–8.500K', 'Chế độ RGB và hiệu ứng ánh sáng', 'CRI trên 95 cho màu da tự nhiên', 'Pin tích hợp sạc qua USB-C'], { warranty: '12 tháng', origin: 'Trung Quốc', colorTemperature: '2500K-8500K', cri: '95+', weightGram: 410 }),
    item('DTECH-BAG-B20', 'Balo máy ảnh PhotoPack B20 chống nước nhiều ngăn', 'PhotoPack', 1090000, 1390000, [
      option('20 lít - Đen'), option('20 lít - Xám'), option('25 lít - Đen', 300000)
    ], ['Vách ngăn đệm mút tùy chỉnh', 'Ngăn riêng cho laptop 15 inch', 'Khóa kéo hông lấy máy nhanh', 'Kèm áo mưa và dây gắn tripod'], { warranty: '12 tháng', origin: 'Việt Nam', material: 'Polyester phủ chống nước', capacityLiter: 20, weightGram: 980 })
  ])
];

const products = catalog.flatMap(({ categoryId, items }) => items.map((product) => buildProduct(categoryId, product)));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');

const variantCount = products.reduce((total, product) => total + product.variants.length, 0);
console.log(`Generated ${products.length} technology products and ${variantCount} variants.`);
console.log(outputPath);

function category(categoryId, items) {
  return { categoryId, items };
}

function item(sku, name, brand, price, compareAtPrice, options, features, attributes) {
  return { sku, name, brand, price, compareAtPrice, options, features, attributes };
}

function option(name, priceDelta = 0, stock) {
  return { name, priceDelta, stock };
}

function buildProduct(categoryId, product) {
  const slug = slugify(product.name);
  const optionText = product.options.map((entry) => entry.name).join(', ');
  const description = [
    product.name.toUpperCase(),
    '',
    'ĐIỂM NỔI BẬT',
    ...product.features.map((feature) => `• ${feature}`),
    '',
    'THÔNG SỐ VÀ PHÂN LOẠI',
    `• Thương hiệu: ${product.brand}`,
    `• Phân loại: ${optionText}`,
    `• Bảo hành: ${product.attributes.warranty ?? 'Theo chính sách của shop'}`,
    `• Xuất xứ: ${product.attributes.origin ?? 'Đang cập nhật'}`,
    '',
    'CHÍNH SÁCH CỦA SHOP',
    '• Sản phẩm mới, được kiểm tra ngoại quan và chức năng trước khi đóng gói.',
    '• Số serial và tình trạng sản phẩm được lưu để hỗ trợ bảo hành.',
    '• Hỗ trợ đổi nếu giao sai phân loại hoặc sản phẩm phát sinh lỗi từ nhà sản xuất.'
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
      demoSeed: 'ducktrong-technology-catalog-2026'
    },
    images: [
      imageByCategory[categoryId],
      `https://picsum.photos/seed/${product.sku.toLowerCase()}/900/900`
    ],
    variants: product.options.map((entry, index) => ({
      sku: `${product.sku}-V${index + 1}`,
      name: entry.name,
      price: product.price + entry.priceDelta,
      currency: 'VND',
      initialStock: entry.stock ?? Math.max(8, 45 - index * 7),
      compareAtPrice: product.compareAtPrice + entry.priceDelta,
      isDefault: index === 0,
      metadata: {
        option: entry.name,
        demoSeed: true,
        catalog: 'technology-2026'
      }
    })),
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
