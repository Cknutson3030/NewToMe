import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, ScrollView } from 'react-native';
import Card from './ui/Card';
import Button from './ui/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  item: any;
  onPressMessage?: (id: string) => void;
  onPressRequest?: (item: any) => void;
  onPressEdit?: (item: any) => void;
  isOwner?: boolean;
  requested?: boolean;
};

function ListingCard({ item, onPressMessage, onPressRequest, onPressEdit, isOwner, requested }: Props) {
  const { theme } = useTheme();
  const imageScrollRef = useRef<ScrollView | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const imageUrls = useMemo(() => {
    const ordered = Array.isArray(item.listing_images)
      ? [...item.listing_images].sort((a: any, b: any) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
      : [];

    const urls = ordered
      .map((img: any) => img?.image_url)
      .filter((url: any): url is string => typeof url === 'string' && url.length > 0);

    if (urls.length > 0) return urls;
    return item.listing_image_url ? [item.listing_image_url] : [];
  }, [item.listing_image_url, item.listing_images]);

  useEffect(() => {
    setCurrentImageIndex(0);
    imageScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [item.id, item._id, imageUrls.length]);

  const handleMomentumEnd = (event: any) => {
    if (!carouselWidth) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    const clamped = Math.max(0, Math.min(index, imageUrls.length - 1));
    setCurrentImageIndex(clamped);
  };

  const handleNextImage = () => {
    if (imageUrls.length <= 1 || !carouselWidth) return;
    const nextIndex = (currentImageIndex + 1) % imageUrls.length;
    imageScrollRef.current?.scrollTo({ x: nextIndex * carouselWidth, animated: true });
    setCurrentImageIndex(nextIndex);
  };

  const ghgSaved = isOwner
    ? Number(item.ghg_end_of_life_kg) || 0
    : (Number(item.ghg_manufacturing_kg) || 0) +
      (Number(item.ghg_materials_kg) || 0) +
      (Number(item.ghg_transport_kg) || 0);

  const styles = makeStyles(theme);

  return (
    <Card padding="none" style={styles.card}>
      <View
        style={styles.imageWrap}
        onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
      >
        {imageUrls.length > 0 ? (
          <>
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleMomentumEnd}
              scrollEventThrottle={16}
            >
              {imageUrls.map((url, index) => (
                <Image
                  key={`${item?.id ?? item?._id ?? 'listing'}-image-${index}`}
                  source={{ uri: url }}
                  style={[styles.image, carouselWidth ? { width: carouselWidth } : null]}
                />
              ))}
            </ScrollView>

            {imageUrls.length > 1 ? (
              <>
                <View style={styles.imageCounter}>
                  <Text style={styles.imageCounterText}>{currentImageIndex + 1}/{imageUrls.length}</Text>
                </View>
                <Pressable style={styles.nextImageButton} onPress={handleNextImage} hitSlop={10}>
                  <Text style={styles.nextImageButtonText}>›</Text>
                </Pressable>
              </>
            ) : null}
          </>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No image</Text>
          </View>
        )}
        {item.item_condition ? (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionBadgeText}>{item.item_condition}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.price}>{item.price != null ? `$${item.price}` : '—'}</Text>
        </View>

        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {item.location_city ? (
            <Text style={styles.meta} numberOfLines={1}>📍 {item.location_city}</Text>
          ) : null}
        </View>

        {ghgSaved > 0 ? (
          <View style={styles.ghgBadge}>
            <Text style={styles.ghgText}>
              Saves {ghgSaved.toFixed(1)} kg CO₂e {isOwner ? 'vs. landfill' : 'vs. new'}
            </Text>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {isOwner ? (
            <Button variant="secondary" size="sm" style={styles.action} onPress={() => onPressEdit?.(item)}>
              Edit
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" style={styles.action} onPress={() => onPressMessage?.(item.id)}>
                Message
              </Button>
              <Button size="sm" style={styles.action} onPress={() => onPressRequest?.(item)}>
                {requested ? 'Requested' : 'Make offer'}
              </Button>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      marginBottom: theme.spacing.md,
      overflow: 'hidden',
    },
    imageWrap: {
      position: 'relative',
      backgroundColor: theme.colors.surfaceAlt,
    },
    image: {
      width: '100%',
      height: 220,
    },
    imagePlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      color: theme.colors.muted,
      fontSize: 14,
    },
    imageCounter: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      backgroundColor: 'rgba(17,17,17,0.72)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: theme.radii.pill,
    },
    imageCounterText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    nextImageButton: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(17,17,17,0.72)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextImageButtonText: {
      color: '#FFFFFF',
      fontSize: 20,
      lineHeight: 22,
      fontWeight: '700',
    },
    conditionBadge: {
      position: 'absolute',
      top: 12,
      left: 12,
      backgroundColor: 'rgba(17,17,17,0.8)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radii.pill,
    },
    conditionBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    body: { padding: 14 },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.text,
      flex: 1,
      marginRight: 8,
    },
    price: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    desc: {
      fontSize: 14,
      color: theme.colors.muted,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    meta: {
      fontSize: 13,
      color: theme.colors.muted,
    },
    ghgBadge: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    ghgText: {
      fontSize: 12,
      color: theme.colors.primary,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    action: { flex: 1 },
  });

export default React.memo(ListingCard);
