import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  scrollContainer: {
    minHeight: '100%',
    backgroundColor: '#f6f6f6'
  },
  page: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24
  },
  header: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f85a24',
    alignItems: 'center',
    justifyContent: 'center'
  },
  brandBadgeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  brandName: {
    color: '#f85a24',
    fontSize: 20,
    fontWeight: '800'
  },
  brandSub: {
    color: '#5f5f5f',
    fontSize: 12,
    marginTop: 2
  },
  logoutButton: {
    backgroundColor: '#fff1eb',
    borderWidth: 1,
    borderColor: '#ffbfac',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  logoutButtonText: {
    color: '#d84f24',
    fontWeight: '700',
    fontSize: 13
  },
  hero: {
    marginTop: 14,
    backgroundColor: '#f85a24',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  heroTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 30
  },
  heroSubtitle: {
    color: '#ffe3d7',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600'
  },
  section: {
    marginTop: 16
  },
  sectionTitle: {
    color: '#1f1f1f',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10
  },
  categoryGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  categoryGridMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryCard: {
    minWidth: 120,
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffe0d3',
    paddingHorizontal: 12,
    paddingVertical: 14
  },
  categoryText: {
    color: '#6c2d17',
    fontWeight: '700',
    fontSize: 14
  },
  promoRowDesktop: {
    flexDirection: 'row',
    gap: 10
  },
  promoRowMobile: {
    gap: 10
  },
  promoCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffd8cb',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  promoTag: {
    alignSelf: 'flex-start',
    color: '#ffffff',
    backgroundColor: '#ff6b33',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '800'
  },
  promoTitle: {
    marginTop: 8,
    color: '#222222',
    fontWeight: '700',
    fontSize: 16
  },
  promoSubtitle: {
    marginTop: 6,
    color: '#7a5548',
    fontSize: 13
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffe0d3',
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  orderTitle: {
    color: '#2a2a2a',
    fontWeight: '700',
    fontSize: 15
  },
  orderSub: {
    marginTop: 6,
    color: '#7f7f7f',
    fontSize: 13
  }
});
