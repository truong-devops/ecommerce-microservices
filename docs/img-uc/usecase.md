# Use Case Diagram - E-commerce

```mermaid
flowchart LR

%% =======================
%% ACTORS
%% =======================
Buyer[Người mua]
Seller[Người bán]
Shipper[Nhà vận chuyển]
Admin[Nhà điều hành]
Payment[Cổng thanh toán]

%% =======================
%% SYSTEM
%% =======================
subgraph Ecommerce_System["E-commerce System"]

%% ===== COMMON =====
Login(Đăng nhập)

%% ===== BUYER =====
RegisterB(Đăng kí)
Search(Tìm kiếm)
AddCart(Thêm vào giỏ hàng)
Order(Đặt hàng)
Cancel(Hủy đơn)
Track(The o dõi đơn hàng)
ChatSeller(Chat với người bán)
Complaint(Khiếu nại)

%% ===== SELLER =====
RegisterS(Đăng kí)
Profile(Quản lí hồ sơ)
ManageProduct(Quản lí sản phẩm)
ChatBuyer(Chat với người mua)
Revenue(Xem doanh thu)

%% ===== OTHER =====
ViewOrder(Xem đơn hàng)
ManageOrder(Quản lí đơn hàng)

end

%% =======================
%% RELATIONSHIPS
%% =======================

%% Buyer
Buyer --> RegisterB
Buyer --> Search
Buyer --> AddCart
Buyer --> Order
Buyer --> Cancel
Buyer --> Track
Buyer --> ChatSeller
Buyer --> Complaint

%% Seller
Seller --> RegisterS
Seller --> Profile
Seller --> ManageProduct
Seller --> ChatBuyer
Seller --> Revenue

%% Shipper/Admin
Shipper --> ViewOrder
Admin --> ManageOrder

%% Payment
Payment --> Order

%% =======================
%% INCLUDE (LOGIN)
%% =======================
Order -.->|<<include>>| Login
Cancel -.->|<<include>>| Login
Track -.->|<<include>>| Login
ChatSeller -.->|<<include>>| Login
Complaint -.->|<<include>>| Login

Profile -.->|<<include>>| Login
ManageProduct -.->|<<include>>| Login
ChatBuyer -.->|<<include>>| Login
Revenue -.->|<<include>>| Login

ViewOrder -.->|<<include>>| Login
ManageOrder -.->|<<include>>| Login