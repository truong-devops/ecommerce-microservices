# Phân loại Actor theo Use Case (Marketplace kiểu Shopee)

Cách nhìn: Primary / Secondary / Off-stage (Internal control). Seller được gộp chung.

## Primary actors (khởi tạo use case)

### Buyer (Người mua)

**Nhóm:** Primary (khởi tạo use case)

**Mô tả:** Người dùng đã đăng ký/đăng nhập, chủ động khởi tạo các nghiệp vụ mua sắm và dịch vụ sau bán.

**Phạm vi trách nhiệm:**

- Duyệt/tìm kiếm sản phẩm, xem shop
- Thêm giỏ/wishlist, checkout và đặt hàng
- Chọn phương thức vận chuyển và thanh toán (COD/Online)
- Áp voucher (platform/shop), theo dõi đơn, hủy theo rule, xác nhận đã nhận
- Đánh giá sản phẩm/shop, chat với seller
- Yêu cầu trả hàng/hoàn tiền, mở khiếu nại/dispute, report vi phạm

**Use case tiêu biểu:**

- Browse/Search/Filter
- Add to Cart
- Checkout & Place Order
- Track/Cancel/Confirm Received
- Chat
- Return/Refund/Dispute
- Rate & Review
- Report Product/Shop

### Seller (Nhà bán – gộp Chủ shop & Nhân viên shop)

**Nhóm:** Primary (khởi tạo use case)

**Mô tả:** Đơn vị bán hàng trên marketplace; vừa tạo nguồn cung vừa chủ động khởi tạo các nghiệp vụ vận hành shop và xử lý đơn.

**Phạm vi trách nhiệm:**

- Đăng ký shop (và KYC nếu có), quản lý hồ sơ shop
- Đăng & quản lý sản phẩm (listing/SKU/biến thể), giá và tồn kho
- Tiếp nhận/xác nhận đơn, đóng gói, tạo vận đơn, bàn giao vận chuyển
- Cập nhật trạng thái fulfillment, xử lý yêu cầu trả hàng/hoàn tiền
- Chat với buyer, quản lý khuyến mãi cấp shop
- Theo dõi doanh thu/commission và đối soát/payout (nếu có)

**Use case tiêu biểu:**

- Shop Registration & KYC (optional)
- Manage Products / SKUs / Inventory
- Process Orders (accept/pack/ship)
- Create Shipment (AWB)
- Handle Returns/Refund Requests
- Chat
- Shop Promotions
- Revenue & Settlement View

## Secondary actors (hỗ trợ use case)

### Payment Gateway (Cổng thanh toán)

**Nhóm:** Secondary (hỗ trợ use case)

**Mô tả:** Hệ thống bên thứ ba xử lý thanh toán online và hoàn tiền.

**Phạm vi trách nhiệm:**

- Nhận yêu cầu thanh toán từ nền tảng, xử lý xác thực (3DS/OTP tùy)
- Trả kết quả thanh toán (success/fail)
- Gửi callback/webhook cập nhật trạng thái
- Xử lý refund/partial refund, chargeback (nếu hỗ trợ)

**Use case tiêu biểu:**

- Payment Request
- Payment Status Callback
- Refund Request

### Shipping/Logistics Provider (Đơn vị vận chuyển)

**Nhóm:** Secondary (hỗ trợ use case)

**Mô tả:** Bên thứ ba tạo vận đơn, cung cấp tracking và cập nhật trạng thái giao hàng.

**Phạm vi trách nhiệm:**

- Cung cấp phương thức/giá vận chuyển (nếu tích hợp tính cước)
- Tạo vận đơn (AWB), trả mã tracking
- Cập nhật trạng thái giao hàng (pickup/in-transit/delivered/failed/return…)

**Use case tiêu biểu:**

- Create Shipment (AWB)
- Tracking Sync/Query

### Notification Provider (Email/SMS/Push)

**Nhóm:** Secondary (hỗ trợ use case)

**Mô tả:** Dịch vụ gửi OTP và thông báo theo sự kiện.

**Phạm vi trách nhiệm:**

- Gửi OTP/verify tài khoản
- Gửi thông báo xác nhận đơn/biến động trạng thái đơn & vận chuyển
- Gửi thông báo campaign/khuyến mãi (nếu có)

**Use case tiêu biểu:**

- Send OTP
- Send Order/Shipping Notifications
- Send Campaign Notifications

### KYC Provider (Xác minh) – Optional

**Nhóm:** Secondary (hỗ trợ use case)

**Mô tả:** Dịch vụ xác minh danh tính/đăng ký kinh doanh cho Seller (nếu yêu cầu).

**Phạm vi trách nhiệm:**

- Xác minh giấy tờ và đối chiếu thông tin
- Trả kết quả (pass/fail/manual review) về nền tảng

**Use case tiêu biểu:**

- KYC Verification

## Off-stage / Internal control actors (quản trị & đảm bảo vận hành)

### Admin (Quản trị hệ thống)

**Nhóm:** Off-stage / Internal control

**Mô tả:** Quản trị vận hành & cấu hình hệ thống; đảm bảo nền tảng chạy đúng chính sách.

**Phạm vi trách nhiệm:**

- Quản lý user/role/permission (RBAC)
- Cấu hình hệ thống: fee/commission, shipping/payment config, template thông báo
- Quản lý category/attribute chuẩn hóa
- Quản lý nội dung (banner, trang tĩnh, FAQ, điều khoản)
- Quản lý campaign/voucher cấp nền tảng

**Use case tiêu biểu:**

- User/Role Management
- System Configuration
- Category/Attribute Management
- Platform Campaigns

### Moderator / Trust & Safety (Kiểm duyệt)

**Nhóm:** Off-stage / Internal control

**Mô tả:** Đảm bảo tuân thủ chính sách, giảm rủi ro gian lận và nội dung vi phạm.

**Phạm vi trách nhiệm:**

- Duyệt/ẩn sản phẩm hoặc shop, xử lý report vi phạm
- Khóa listing/shop theo chính sách
- Theo dõi tín hiệu gian lận (nếu có), phối hợp CS/Finance khi cần

**Use case tiêu biểu:**

- Moderate Listings/Shops
- Handle Reports/Violations

### Customer Support (CS)

**Nhóm:** Off-stage / Internal control

**Mô tả:** Hỗ trợ và điều phối xử lý khiếu nại/tranh chấp giữa Buyer và Seller.

**Phạm vi trách nhiệm:**

- Tiếp nhận ticket/chat hỗ trợ
- Thu thập bằng chứng, hướng dẫn quy trình
- Trung gian dispute và ra quyết định theo chính sách
- Phối hợp thực hiện hoàn tiền/đổi trả (cùng Finance/Payment)

**Use case tiêu biểu:**

- Support Ticket Handling
- Dispute Resolution Coordination

### Finance / Accounting (Tài chính – đối soát)

**Nhóm:** Off-stage / Internal control

**Mô tả:** Đối soát dòng tiền, payout seller, xử lý refund/chargeback và báo cáo tài chính.

**Phạm vi trách nhiệm:**

- Reconcile giao dịch với cổng thanh toán
- Tính commission/fee, xác định doanh thu ròng của seller
- Payout theo chu kỳ, quản lý lịch sử thanh toán
- Xử lý refund/chargeback & các trường hợp ngoại lệ

**Use case tiêu biểu:**

- Reconciliation
- Seller Payout
- Refund/Chargeback Processing