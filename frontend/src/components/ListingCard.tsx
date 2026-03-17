import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Dimensions } from 'react-native';
import Card from './ui/Card';
import Button from './ui/Button';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  item: any;
  onPressMessage?: (id: string) => void;
  onPressRequest?: (id: string) => void;
  onPressEdit?: (item: any) => void;
  isOwner?: boolean;
  loadingAction?: boolean;
  requested?: boolean;
  /** 'translucent' (default), 'solid', or 'blur' (requires @react-native-community/blur) */
  overlayStyle?: 'translucent' | 'solid' | 'blur';
};

export default function ListingCard({ item, onPressMessage, onPressRequest, onPressEdit, isOwner, loadingAction, requested }: Props) {
  const { theme } = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const compact = windowWidth < 360;
  const firstImage = item.listing_images?.sort?.((a: any,b: any)=>a.sort_order-b.sort_order)?.[0];
  const overlayMode = (item?.overlayStyle as any) || (undefined as any) || 'translucent';
  // compute a sensible overlay color based on theme and mode
  let overlayColor = 'rgba(255,255,255,0.96)';
  if (overlayMode === 'solid') {
    overlayColor = theme.colors.surface || '#FFFFFF';
  } else if (overlayMode === 'translucent') {
    // light theme -> semi-white, dark theme -> semi-black
    const bg = (theme && theme.colors && theme.colors.background) || '';
    const isDark = typeof bg === 'string' && (bg.startsWith('#') ? (bg === '#000000' || bg === '#000') : false);
    overlayColor = isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.96)';
  }
  let BlurView: any = null;
  if ((item?.overlayStyle as any) === 'blur' || overlayMode === 'blur') {
    try {
      // optional dependency - will fail gracefully if not installed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      BlurView = require('@react-native-community/blur').BlurView;
    } catch (err) {
      BlurView = null;
    }
  }
  return (
    <Card style={{ marginBottom: theme.spacing.sm }}>
      <View style={styles.imageWrapper}>
        {firstImage?.image_url ? (
          <Image source={{ uri: firstImage.image_url }} style={styles.image} />
        ) : null}

        {BlurView ? (
          <BlurView style={[styles.actionsOverlay, { left: theme.spacing.md, right: theme.spacing.md, bottom: -20 }]} blurType={"light"} blurAmount={8} pointerEvents="box-none">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
              {isOwner ? (
                <Button variant="ghost" onPress={() => onPressEdit?.(item)} style={[styles.actionBtn, compact ? styles.actionBtnCompact : null]}>Edit</Button>
              ) : (
                <>
                  <Button style={[styles.actionBtn, compact ? styles.actionBtnCompact : null, { marginRight: 8 }]} onPress={() => onPressMessage?.(item.id)}>Message</Button>
                  <Button style={[styles.actionBtn, compact ? styles.actionBtnCompact : null]} onPress={() => onPressRequest?.(item.id)}>{requested ? 'Requested' : 'Request'}</Button>
                </>
              )}
            </ScrollView>
          </BlurView>
        ) : (
          <View style={[styles.actionsOverlay, { left: theme.spacing.md, right: theme.spacing.md, bottom: -20, backgroundColor: overlayColor }]} pointerEvents="box-none">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsRow}>
              {isOwner ? (
                <Button variant="ghost" onPress={() => onPressEdit?.(item)} style={[styles.actionBtn, compact ? styles.actionBtnCompact : null]}>Edit</Button>
              ) : (
                <>
                  <Button style={[styles.actionBtn, compact ? styles.actionBtnCompact : null, { marginRight: 8 }]} onPress={() => onPressMessage?.(item.id)}>Message</Button>
                  <Button style={[styles.actionBtn, compact ? styles.actionBtnCompact : null]} onPress={() => onPressRequest?.(item.id)}>{requested ? 'Requested' : 'Request'}</Button>
                </>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* spacer so overlay doesn't cover following content */}
      <View style={{ height: 56 }} />

      <Text style={[styles.title, theme.typography.body]}>{item.title}</Text>
      {item.description ? <Text style={[styles.desc, theme.typography.small]} numberOfLines={2}>{item.description}</Text> : null}
      <View style={styles.detailsRow}>
        <Text style={[styles.detailText, { fontWeight: '700', color: theme.colors.success }]}>{item.price != null ? `$${item.price}` : '—'}</Text>
        <Text style={styles.detailText}>{item.location_city}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  imageWrapper: { position: 'relative' },
  image: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8, backgroundColor: '#E5E7EB' },
  actionsOverlay: {
    position: 'absolute',
    // left/right set dynamically to align with card padding
    alignSelf: 'stretch',
    paddingHorizontal: 6,
    borderRadius: 12,
    // elevation / shadow for overlay
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
  actionsRow: { alignItems: 'center', paddingVertical: 6 },
  actionBtn: { minWidth: 88, paddingVertical: 10 },
  actionBtnCompact: { minWidth: 72, paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  desc: { color: '#6B7280', marginBottom: 8 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailText: { fontSize: 13, color: '#374151' },
});
//reusable UI components