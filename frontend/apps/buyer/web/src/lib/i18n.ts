export type Locale = 'en' | 'vi';

export interface AppMessages {
  header: {
    sellerCenter: string;
    downloadApp: string;
    connect: string;
    notifications: string;
    support: string;
    language: string;
    searchPlaceholder: string;
    searchButton: string;
    account: string;
    login: string;
    register: string;
    logout: string;
    cart: string;
  };
  home: {
    flashSaleTitle: string;
    mallTitle: string;
    topSearchTitle: string;
    recommendationTitle: string;
    viewAll: string;
    seeAllOffers: string;
    soldLabel: string;
    campaignTitle: string;
    campaignDescription: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    email: string;
    password: string;
    name: string;
    confirmPassword: string;
    submitLogin: string;
    submitRegister: string;
    noAccount: string;
    haveAccount: string;
    goRegister: string;
    goLogin: string;
    passwordMismatch: string;
    invalidCredentials: string;
    emailExists: string;
    requiredFields: string;
  };
  account: {
    title: string;
    subtitle: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    memberSince: string;
    save: string;
    saveSuccess: string;
    logout: string;
    protectedHint: string;
    loading: string;
  };
}

export const messages: Record<Locale, AppMessages> = {
  en: {
    header: {
      sellerCenter: 'Seller Centre',
      downloadApp: 'Download App',
      connect: 'Connect',
      notifications: 'Notifications',
      support: 'Support',
      language: 'Language',
      searchPlaceholder: 'Search deals, gadgets, fashion, and more',
      searchButton: 'Search',
      account: 'Account',
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      cart: 'Open shopping cart'
    },
    home: {
      flashSaleTitle: 'Flash Sale',
      mallTitle: 'Mall Highlights',
      topSearchTitle: 'Top Search',
      recommendationTitle: 'Recommendations For You',
      viewAll: 'View all',
      seeAllOffers: 'See all offers',
      soldLabel: 'Sold',
      campaignTitle: 'Hot Deal Week',
      campaignDescription: 'Save up to 50% with stacked vouchers and free shipping from official stores.'
    },
    auth: {
      loginTitle: 'Buyer Login',
      loginSubtitle: 'Sign in to continue shopping and manage your account.',
      registerTitle: 'Create Buyer Account',
      registerSubtitle: 'Register in seconds to track orders and save your profile.',
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      confirmPassword: 'Confirm password',
      submitLogin: 'Login',
      submitRegister: 'Register',
      noAccount: "Don't have an account?",
      haveAccount: 'Already have an account?',
      goRegister: 'Create one',
      goLogin: 'Sign in',
      passwordMismatch: 'Password confirmation does not match.',
      invalidCredentials: 'Invalid email or password.',
      emailExists: 'Email is already registered.',
      requiredFields: 'Please fill in all required fields.'
    },
    account: {
      title: 'My Account',
      subtitle: 'Manage your buyer profile information.',
      name: 'Full name',
      email: 'Email',
      phone: 'Phone number',
      address: 'Address',
      memberSince: 'Member since',
      save: 'Save changes',
      saveSuccess: 'Profile updated successfully.',
      logout: 'Logout',
      protectedHint: 'Please login first to access account settings.',
      loading: 'Loading account...'
    }
  },
  vi: {
    header: {
      sellerCenter: 'Kênh Người Bán',
      downloadApp: 'Tải ứng dụng',
      connect: 'Kết nối',
      notifications: 'Thông báo',
      support: 'Hỗ trợ',
      language: 'Ngôn ngữ',
      searchPlaceholder: 'Tìm deal, đồ công nghệ, thời trang và hơn thế nữa',
      searchButton: 'Tìm kiếm',
      account: 'Tài khoản',
      login: 'Đăng nhập',
      register: 'Đăng ký',
      logout: 'Đăng xuất',
      cart: 'Mở giỏ hàng'
    },
    home: {
      flashSaleTitle: 'Flash Sale',
      mallTitle: 'Mall Nổi Bật',
      topSearchTitle: 'Tìm Kiếm Hàng Đầu',
      recommendationTitle: 'Gợi Ý Hôm Nay',
      viewAll: 'Xem tất cả',
      seeAllOffers: 'Xem ưu đãi',
      soldLabel: 'Đã bán',
      campaignTitle: 'Tuần Lễ Săn Deal',
      campaignDescription: 'Giảm đến 50% kèm voucher và miễn phí vận chuyển từ gian hàng chính hãng.'
    },
    auth: {
      loginTitle: 'Đăng Nhập Người Mua',
      loginSubtitle: 'Đăng nhập để tiếp tục mua sắm và quản lý tài khoản.',
      registerTitle: 'Tạo Tài Khoản Người Mua',
      registerSubtitle: 'Đăng ký nhanh để theo dõi đơn hàng và lưu thông tin cá nhân.',
      email: 'Email',
      password: 'Mật khẩu',
      name: 'Họ và tên',
      confirmPassword: 'Xác nhận mật khẩu',
      submitLogin: 'Đăng nhập',
      submitRegister: 'Đăng ký',
      noAccount: 'Chưa có tài khoản?',
      haveAccount: 'Đã có tài khoản?',
      goRegister: 'Tạo tài khoản',
      goLogin: 'Đăng nhập ngay',
      passwordMismatch: 'Mật khẩu xác nhận không khớp.',
      invalidCredentials: 'Email hoặc mật khẩu không đúng.',
      emailExists: 'Email đã được đăng ký.',
      requiredFields: 'Vui lòng nhập đầy đủ thông tin bắt buộc.'
    },
    account: {
      title: 'Tài Khoản Của Tôi',
      subtitle: 'Quản lý thông tin hồ sơ người mua.',
      name: 'Họ và tên',
      email: 'Email',
      phone: 'Số điện thoại',
      address: 'Địa chỉ',
      memberSince: 'Tham gia từ',
      save: 'Lưu thay đổi',
      saveSuccess: 'Cập nhật hồ sơ thành công.',
      logout: 'Đăng xuất',
      protectedHint: 'Vui lòng đăng nhập để truy cập trang tài khoản.',
      loading: 'Đang tải tài khoản...'
    }
  }
};
