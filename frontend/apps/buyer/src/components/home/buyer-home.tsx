import type { ReactElement } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { homeStyles } from '../../styles/home-styles';
import { LoginUser } from '../../types/auth';

interface BuyerHomeProps {
  user: LoginUser;
  onLogout: () => Promise<void>;
}

const quickCategories = ['Flash Sale', 'Fashion', 'Home Life', 'Beauty', 'Food', 'Phones'];
const promoCards = [
  { title: 'Voucher 50%', subtitle: 'Cap every day at 12:00', tag: 'Hot' },
  { title: 'Free Ship Extra', subtitle: 'Orders from 149.000 VND', tag: 'Ship' },
  { title: 'Brand Week', subtitle: 'Up to 1.5M off', tag: 'Brand' }
];

export function BuyerHome({ user, onLogout }: BuyerHomeProps): ReactElement {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1000;

  return (
    <ScrollView contentContainerStyle={homeStyles.scrollContainer}>
      <View style={homeStyles.page}>
        <View style={homeStyles.header}>
          <View style={homeStyles.brandRow}>
            <View style={homeStyles.brandBadge}>
              <Text style={homeStyles.brandBadgeText}>D&T</Text>
            </View>
            <View>
              <Text style={homeStyles.brandName}>D&T Mall</Text>
              <Text style={homeStyles.brandSub}>Welcome, {user.email}</Text>
            </View>
          </View>
          <Pressable style={homeStyles.logoutButton} onPress={onLogout}>
            <Text style={homeStyles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>

        <View style={homeStyles.hero}>
          <Text style={homeStyles.heroTitle}>Super Sale 3.3</Text>
          <Text style={homeStyles.heroSubtitle}>Deals for buyer role: {user.role}</Text>
        </View>

        <View style={homeStyles.section}>
          <Text style={homeStyles.sectionTitle}>Quick Categories</Text>
          <View style={isDesktop ? homeStyles.categoryGridDesktop : homeStyles.categoryGridMobile}>
            {quickCategories.map((item) => (
              <View key={item} style={homeStyles.categoryCard}>
                <Text style={homeStyles.categoryText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={homeStyles.section}>
          <Text style={homeStyles.sectionTitle}>Promotions</Text>
          <View style={isDesktop ? homeStyles.promoRowDesktop : homeStyles.promoRowMobile}>
            {promoCards.map((promo) => (
              <View key={promo.title} style={homeStyles.promoCard}>
                <Text style={homeStyles.promoTag}>{promo.tag}</Text>
                <Text style={homeStyles.promoTitle}>{promo.title}</Text>
                <Text style={homeStyles.promoSubtitle}>{promo.subtitle}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={homeStyles.section}>
          <Text style={homeStyles.sectionTitle}>Recent Orders</Text>
          <View style={homeStyles.orderCard}>
            <Text style={homeStyles.orderTitle}>No new orders yet</Text>
            <Text style={homeStyles.orderSub}>Start shopping to see your order timeline here.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
