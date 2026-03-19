import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { languageOptions, LanguageCode, localePacks } from '../../constants/i18n';
import { homeStyles } from '../../styles/home-styles';
import { LoginUser } from '../../types/auth';

interface BuyerHomeProps {
  user: LoginUser | null;
  onLogout: () => Promise<void>;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
}

const categoryItems = [
  { image: 'https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1544731612-de7f96afe55f?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=140&q=60' },
  { image: 'https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=140&q=60' }
];

const flashSaleItems = [
  { price: '99.000đ', sold: '3.2k', discount: '-36%', image: 'https://images.unsplash.com/photo-1622445275576-721325763afe?auto=format&fit=crop&w=320&q=60' },
  { price: '241.000đ', sold: '1.1k', discount: '-26%', image: 'https://images.unsplash.com/photo-1608667508764-33cf0726b13a?auto=format&fit=crop&w=320&q=60' },
  { price: '55.000đ', sold: '900', discount: '-44%', image: 'https://images.unsplash.com/photo-1625772452859-1c03d5bf1137?auto=format&fit=crop&w=320&q=60' },
  { price: '208.000đ', sold: '700', discount: '-33%', image: 'https://images.unsplash.com/photo-1612336307429-8a898d10e223?auto=format&fit=crop&w=320&q=60' },
  { price: '13.000đ', sold: '2k', discount: '-48%', image: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?auto=format&fit=crop&w=320&q=60' },
  { price: '183.000đ', sold: '1.4k', discount: '-35%', image: 'https://images.unsplash.com/photo-1588117260148-b47818741c74?auto=format&fit=crop&w=320&q=60' }
];

const mallItems = [
  { image: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1629198735660-e39ea93f5a4b?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1600180758890-6b94519a8ba6?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1574634534894-89d7576c8259?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=220&q=60' },
  { image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=220&q=60' }
];

const recommendItems = [
  { image: 'https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=320&q=60', price: '28.500đ', sold: '200k+' },
  { image: 'https://images.unsplash.com/photo-1610701596061-2ecf227e85b2?auto=format&fit=crop&w=320&q=60', price: '33.000đ', sold: '90k+' },
  { image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=320&q=60', price: '63.000đ', sold: '10k+' },
  { image: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=320&q=60', price: '190.120đ', sold: '50k+' },
  { image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=320&q=60', price: '20.000đ', sold: '200k+' },
  { image: 'https://images.unsplash.com/photo-1608571423539-e951a8f4a5a9?auto=format&fit=crop&w=320&q=60', price: '217.440đ', sold: '4k+' },
  { image: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?auto=format&fit=crop&w=320&q=60', price: '87.220đ', sold: '40k+' },
  { image: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=320&q=60', price: '44.100đ', sold: '40k+' },
  { image: 'https://images.unsplash.com/photo-1541781411446-20c9b1f4cf35?auto=format&fit=crop&w=320&q=60', price: '52.300đ', sold: '10k+' },
  { image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=320&q=60', price: '23.323đ', sold: '100k+' },
  { image: 'https://images.unsplash.com/photo-1588117305388-c2631a279f82?auto=format&fit=crop&w=320&q=60', price: '85.000đ', sold: '10k+' },
  { image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=320&q=60', price: '70.000đ', sold: '10k+' }
];

export function BuyerHome({
  user,
  onLogout,
  onOpenLogin,
  onOpenRegister,
  language,
  onLanguageChange
}: BuyerHomeProps): ReactElement {
  const { width } = useWindowDimensions();
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  const isDesktop = width >= 1180;
  const isTablet = width >= 760;
  const categoryCardWidth = isDesktop ? '10%' : isTablet ? '20%' : '33.33%';
  const productCardWidth = isDesktop ? '16.66%' : isTablet ? '25%' : '50%';
  const mallCardWidth = isDesktop ? '25%' : isTablet ? '50%' : '100%';

  const locale = localePacks[language];
  const currentLanguageLabel = useMemo(
    () => languageOptions.find((item) => item.code === language)?.label ?? 'Tieng Viet',
    [language]
  );

  return (
    <ScrollView contentContainerStyle={homeStyles.scrollContainer}>
      <View style={homeStyles.page}>
        <View style={homeStyles.headerGradient}>
          <View style={[homeStyles.centerContainer, homeStyles.utilityBar]}>
            <View style={homeStyles.utilityLeft}>
              <Text style={homeStyles.utilityText}>{locale.home.sellerChannel}</Text>
              <Text style={homeStyles.utilityText}>{locale.home.becomeSeller}</Text>
              <Text style={homeStyles.utilityText}>{locale.home.downloadApp}</Text>
              <Text style={homeStyles.utilityText}>{locale.home.connect}</Text>
            </View>

            <View style={homeStyles.utilityRight}>
              <Text style={homeStyles.utilityText}>{locale.home.notification}</Text>
              <Text style={homeStyles.utilityText}>{locale.home.support}</Text>

              <View style={homeStyles.languageWrap}>
                <Pressable style={homeStyles.languageButton} onPress={() => setIsLanguageMenuOpen((prev) => !prev)}>
                  <Text style={homeStyles.languageButtonText}>{currentLanguageLabel}</Text>
                </Pressable>
                {isLanguageMenuOpen ? (
                  <View style={homeStyles.languageMenu}>
                    {languageOptions.map((option) => (
                      <Pressable
                        key={option.code}
                        style={[homeStyles.languageMenuItem, option.code === language ? homeStyles.languageMenuItemActive : undefined]}
                        onPress={() => {
                          onLanguageChange(option.code);
                          setIsLanguageMenuOpen(false);
                        }}
                      >
                        <Text style={homeStyles.languageMenuText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {user ? (
                <>
                  <Text style={homeStyles.utilityText}>
                    {locale.home.hello}, {user.email}
                  </Text>
                  <Pressable style={homeStyles.logoutButton} onPress={onLogout}>
                    <Text style={homeStyles.logoutButtonText}>{locale.home.logout}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={homeStyles.authTopButton} onPress={onOpenRegister}>
                    <Text style={homeStyles.authTopButtonText}>{locale.home.register}</Text>
                  </Pressable>
                  <Pressable style={homeStyles.authTopButton} onPress={onOpenLogin}>
                    <Text style={homeStyles.authTopButtonText}>{locale.home.login}</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <View style={[homeStyles.centerContainer, homeStyles.searchRow]}>
            <View style={homeStyles.brandWrap}>
              <View style={homeStyles.brandBadge}>
                <Text style={homeStyles.brandBadgeText}>D&T</Text>
              </View>
              <Text style={homeStyles.brandName}>D&T</Text>
            </View>

            <View style={homeStyles.searchWrap}>
              <View style={homeStyles.searchInputRow}>
                <TextInput style={homeStyles.searchInput} placeholder={locale.home.searchPlaceholder} placeholderTextColor="#a68b82" />
                <Pressable style={homeStyles.searchButton}>
                  <Text style={homeStyles.searchButtonText}>{locale.home.searchButton}</Text>
                </Pressable>
              </View>
              <View style={homeStyles.keywordRow}>
                {locale.home.keywords.map((item) => (
                  <Text key={item} style={homeStyles.keywordText}>
                    {item}
                  </Text>
                ))}
              </View>
            </View>

            <View style={homeStyles.cartWrap}>
              <Text style={homeStyles.cartIcon}>{locale.home.cart}</Text>
              <Text style={homeStyles.welcomeText}>{user ? locale.home.userHint : locale.home.guestHint}</Text>
            </View>
          </View>
        </View>

        <View style={[homeStyles.centerContainer, homeStyles.bannerBlock]}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=980&q=60' }}
            style={homeStyles.mainBannerImage}
          />
          <View style={homeStyles.sideBannerColumn}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?auto=format&fit=crop&w=420&q=60' }}
              style={homeStyles.sideBannerImage}
            />
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=420&q=60' }}
              style={homeStyles.sideBannerImage}
            />
          </View>
        </View>

        <View style={[homeStyles.centerContainer, homeStyles.serviceStrip]}>
          {locale.home.services.map((item) => (
            <View key={item.title} style={homeStyles.serviceItem}>
              <Text style={homeStyles.serviceTitle}>{item.title}</Text>
              <Text style={homeStyles.serviceSubtitle}>{item.subtitle}</Text>
            </View>
          ))}
        </View>

        <View style={[homeStyles.centerContainer, homeStyles.mainSection]}>
          <View style={homeStyles.block}>
            <Text style={homeStyles.blockTitle}>{locale.home.categoryTitle}</Text>
            <View style={homeStyles.categoryGrid}>
              {categoryItems.map((item, index) => (
                <View key={`${locale.home.categoryLabels[index]}-${index}`} style={[homeStyles.categoryCard, { width: categoryCardWidth }]}>
                  <Image source={{ uri: item.image }} style={homeStyles.categoryImage} />
                  <Text style={homeStyles.categoryText}>{locale.home.categoryLabels[index]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={homeStyles.block}>
            <View style={homeStyles.flashHeader}>
              <View style={homeStyles.flashTitleRow}>
                <Text style={homeStyles.flashTitle}>{locale.home.flashSaleTitle}</Text>
                <View style={homeStyles.countdownBox}>
                  <Text style={homeStyles.countdownText}>00 : 11 : 53</Text>
                </View>
              </View>
              <Text style={homeStyles.viewAllText}>{locale.home.viewAll}</Text>
            </View>

            <View style={homeStyles.flashGrid}>
              {flashSaleItems.map((item, index) => (
                <View key={`${locale.home.flashTitles[index]}-${index}`} style={[homeStyles.flashCard, { width: productCardWidth }]}>
                  <Image source={{ uri: item.image }} style={homeStyles.flashImage} />
                  <View style={homeStyles.flashDiscountTag}>
                    <Text style={homeStyles.flashDiscountText}>{item.discount}</Text>
                  </View>
                  <Text style={homeStyles.flashItemTitle}>{locale.home.flashTitles[index]}</Text>
                  <Text style={homeStyles.flashPrice}>{item.price}</Text>
                  <Text style={homeStyles.flashSold}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                  <View style={homeStyles.hotBar}>
                    <Text style={homeStyles.hotBarText}>{locale.home.hotSelling}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={homeStyles.block}>
            <View style={homeStyles.mallHeader}>
              <Text style={homeStyles.mallTitle}>{locale.home.mallTitle}</Text>
              <View style={homeStyles.mallBadges}>
                {locale.home.mallPolicies.map((policy) => (
                  <Text key={policy} style={homeStyles.mallBadge}>
                    {policy}
                  </Text>
                ))}
              </View>
            </View>

            <View style={homeStyles.mallContent}>
              <View style={homeStyles.mallBannerWrap}>
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1616628182509-6f33ce08db65?auto=format&fit=crop&w=620&q=60' }}
                  style={homeStyles.mallBannerImage}
                />
              </View>
              <View style={homeStyles.mallGrid}>
                {mallItems.map((item, index) => (
                  <View key={`${locale.home.mallTitles[index]}-${index}`} style={[homeStyles.mallCard, { width: mallCardWidth }]}>
                    <Image source={{ uri: item.image }} style={homeStyles.mallItemImage} />
                    <Text style={homeStyles.mallItemText}>{locale.home.mallTitles[index]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={homeStyles.block}>
            <Text style={homeStyles.recommendTitle}>{locale.home.recommendationTitle}</Text>
            <View style={homeStyles.recommendGrid}>
              {recommendItems.map((item, index) => (
                <View key={`${locale.home.recommendTitles[index]}-${item.price}`} style={[homeStyles.recommendCard, { width: productCardWidth }]}>
                  <Image source={{ uri: item.image }} style={homeStyles.recommendImage} />
                  <Text style={homeStyles.recommendName}>{locale.home.recommendTitles[index]}</Text>
                  <Text style={homeStyles.recommendPrice}>{item.price}</Text>
                  <Text style={homeStyles.recommendSold}>{`${locale.home.soldPrefix} ${item.sold}`}</Text>
                </View>
              ))}
            </View>
            <View style={homeStyles.moreButtonWrap}>
              <Pressable style={homeStyles.moreButton} onPress={user ? undefined : onOpenLogin}>
                <Text style={homeStyles.moreButtonText}>{user ? locale.home.seeMoreUser : locale.home.seeMoreGuest}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={homeStyles.footerInfo}>
          <View style={homeStyles.centerContainer}>
            <Text style={homeStyles.footerHeading}>{locale.home.footerTitle}</Text>
            <Text style={homeStyles.footerText}>{locale.home.footerLine1}</Text>
            <Text style={homeStyles.footerText}>{locale.home.footerLine2}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
