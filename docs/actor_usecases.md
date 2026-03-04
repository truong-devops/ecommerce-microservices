# Actor → Use Case (Tóm gọn) – Marketplace kiểu Shopee

## Buyer
- Đăng ký/Đăng nhập
- Tìm kiếm/Xem sản phẩm
- Thêm giỏ hàng
- Checkout/Đặt hàng
- Thanh toán (Online/COD)
- Theo dõi/Hủy đơn (theo rule)
- Xác nhận đã nhận
- Chat với seller
- Đánh giá
- Yêu cầu trả hàng/Hoàn tiền
- Khiếu nại (dispute)
- Report sản phẩm/shop

## Seller
- Đăng ký shop (KYC nếu có)
- Tạo/Sửa sản phẩm (SKU/biến thể)
- Cập nhật giá & tồn kho
- Xác nhận/Chuẩn bị đơn
- Tạo vận đơn (AWB) & bàn giao vận chuyển
- Xử lý trả hàng/hoàn tiền
- Chat với buyer
- Xem doanh thu/đối soát/payout

## Payment Gateway
- Xử lý thanh toán
- Gửi callback trạng thái thanh toán
- Xử lý hoàn tiền/chargeback

## Shipping/Logistics Provider
- Tạo vận đơn (AWB)
- Cập nhật/Truy vấn tracking

## Notification Provider
- Gửi OTP
- Gửi thông báo đơn hàng/vận chuyển

## Admin
- Đăng nhập
- Quản lý user/role/phân quyền
- Cấu hình hệ thống (fee/commission, payment, shipping)
- Quản lý category/attribute
- Quản lý voucher/campaign

## Moderator / Trust & Safety
- Duyệt/Ẩn sản phẩm
- Khóa shop vi phạm
- Xử lý report vi phạm

## Customer Support (CS)
- Tiếp nhận ticket
- Điều phối xử lý dispute
- Yêu cầu hoàn tiền (phối hợp Finance/Payment)

## Finance / Accounting
- Đối soát giao dịch
- Tính fee/commission
- Payout seller
- Xử lý refund/chargeback
