import React, { useState } from 'react';
import {
  View, Text, TextInput, Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
  TouchableWithoutFeedback, Keyboard, Pressable, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { createListing as apiCreateListing, uploadListingImages, analyzeImageForListing } from '../api/listings';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const convertToJpeg = async (uri: string): Promise<{ uri: string; mimeType: string }> => {
  const result = await ImageManipulator.manipulateAsync(uri, [], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: result.uri, mimeType: 'image/jpeg' };
};

export default function CreateListingScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [itemCondition, setItemCondition] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [ghg, setGhg] = useState<{ manufacturing_kg: number; materials_kg: number; transport_kg: number; end_of_life_kg: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickImages = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Permission required', 'Access to your photo library is needed.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7 });
    if (!result.canceled) setImages(result.assets.slice(0, 5));
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Permission required', 'Camera access is needed.');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets.length > 0) setImages((prev) => [...prev, ...result.assets].slice(0, 5));
  };

  const analyzeWithAI = async () => {
    if (images.length === 0) return Alert.alert('No image', 'Please pick or take a photo first.');
    setAnalyzing(true);
    try {
      const img = images[0];
      let uri = img.uri;
      let mimeType = img.mimeType || 'image/jpeg';
      if (mimeType.includes('heic') || uri.toLowerCase().includes('.heic')) {
        const c = await convertToJpeg(uri);
        uri = c.uri; mimeType = c.mimeType;
      }
      const result = await analyzeImageForListing(uri, mimeType);
      setTitle(result.product_name || title);
      setDescription(result.description || description);
      setCategory(result.category || category);
      setItemCondition(result.item_condition || itemCondition);
      setGhg(result.ghg);
      Alert.alert('Analysis complete', 'Details filled in. Review before posting.');
    } catch (err: any) {
      Alert.alert('Analysis failed', err.message || 'Please fill in details manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const uploadImages = async (listingId: string) => {
    if (images.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let uri = img.uri;
      let mimeType = img.mimeType || '';
      if (mimeType.includes('heic') || uri.toLowerCase().includes('.heic')) {
        const c = await convertToJpeg(uri); uri = c.uri; mimeType = c.mimeType;
      }
      if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        const c = await convertToJpeg(uri); uri = c.uri; mimeType = c.mimeType;
      }
      formData.append('images', { uri, name: `photo_${Date.now()}_${i}.jpg`, type: mimeType } as unknown as Blob);
    }
    try {
      await uploadListingImages(listingId, formData);
    } catch (err) {
      Alert.alert('Error', `Failed to upload images: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  const createListing = async () => {
    if (!title.trim()) return Alert.alert('Missing title', 'Please add a title.');
    setSubmitting(true);
    try {
      const data = await apiCreateListing({
        title, description,
        price: price ? parseFloat(price) : null,
        category, location_city: locationCity, item_condition: itemCondition,
        ...(ghg ? {
          ghg_manufacturing_kg: ghg.manufacturing_kg,
          ghg_materials_kg: ghg.materials_kg,
          ghg_transport_kg: ghg.transport_kg,
          ghg_end_of_life_kg: ghg.end_of_life_kg,
        } : {}),
      });
      if (images.length > 0) await uploadImages(data.data.id);
      Alert.alert('Listed!', 'Your item is now live.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalBuyerGhg = ghg ? ghg.manufacturing_kg + ghg.materials_kg + ghg.transport_kg : null;
  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.topTitle}>New listing</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} disabled={Platform.OS === 'web'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
<Text style={styles.sectionLabel}>Photos</Text>
            <View style={styles.photoRow}>
              {images.map((img, idx) => (
                <Image key={idx} source={{ uri: img.uri }} style={styles.photo} />
              ))}
              {images.length < 5 && (
                <Pressable onPress={pickImages} style={styles.addPhoto}>
                  <Text style={styles.addPhotoPlus}>+</Text>
                  <Text style={styles.addPhotoText}>Add</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <Button variant="ghost" size="sm" style={{ flex: 1 }} onPress={takePhoto}>📷 Take photo</Button>
              <Button
                size="sm"
                style={{ flex: 1 }}
                onPress={analyzeWithAI}
                disabled={analyzing || images.length === 0}
              >
                {analyzing ? 'Analyzing…' : 'AI autofill'}
              </Button>
            </View>
            {images.length === 0 && (
              <Text style={styles.hint}>Tip: add a photo, then tap AI autofill to fill details automatically.</Text>
            )}

            <Text style={styles.sectionLabel}>Item details</Text>
            <TextInput placeholder="Title" placeholderTextColor={theme.colors.muted} value={title} onChangeText={setTitle} style={styles.input} />
            <TextInput placeholder="Description" placeholderTextColor={theme.colors.muted} value={description} onChangeText={setDescription} style={[styles.input, styles.textArea]} multiline />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholder="Price $" placeholderTextColor={theme.colors.muted} value={price} onChangeText={setPrice} style={[styles.input, { flex: 1 }]} keyboardType="numeric" />
              <TextInput placeholder="Condition" placeholderTextColor={theme.colors.muted} value={itemCondition} onChangeText={setItemCondition} style={[styles.input, { flex: 1 }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput placeholder="Category" placeholderTextColor={theme.colors.muted} value={category} onChangeText={setCategory} style={[styles.input, { flex: 1 }]} />
              <TextInput placeholder="City" placeholderTextColor={theme.colors.muted} value={locationCity} onChangeText={setLocationCity} style={[styles.input, { flex: 1 }]} />
            </View>

            {ghg && (
              <Card variant="outlined" padding="md" style={styles.ghgCard}>
                <Text style={styles.ghgTitle}>Environmental impact</Text>
                <View style={styles.ghgRow}>
                  <Text style={styles.ghgLabel}>Buyer saves</Text>
                  <Text style={styles.ghgValue}>{totalBuyerGhg!.toFixed(1)} kg CO₂e</Text>
                </View>
                <Text style={styles.ghgSub}>vs. buying new: manufacturing + materials + transport</Text>
                <View style={[styles.ghgRow, { marginTop: 10 }]}>
                  <Text style={styles.ghgLabel}>You save</Text>
                  <Text style={styles.ghgValue}>{ghg.end_of_life_kg.toFixed(1)} kg CO₂e</Text>
                </View>
                <Text style={styles.ghgSub}>vs. landfill disposal</Text>
              </Card>
            )}

            <Button size="lg" fullWidth onPress={createListing} disabled={submitting} style={{ marginTop: 8 }}>
              {submitting ? 'Posting…' : 'Post listing'}
            </Button>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
    backArrow: { fontSize: 24, color: theme.colors.text },
    topTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },

    content: { padding: 20, paddingBottom: 40 },

    sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    photo: { width: 80, height: 80, borderRadius: theme.radii.md },
    addPhoto: {
      width: 80, height: 80,
      borderRadius: theme.radii.md,
      borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
    },
    addPhotoPlus: { fontSize: 24, color: theme.colors.muted, fontWeight: '300' },
    addPhotoText: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
    hint: { fontSize: 12, color: theme.colors.muted, marginBottom: 8 },

    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.colors.text,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
    },
    textArea: { height: 100, textAlignVertical: 'top' },

    ghgCard: { marginTop: 12, backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryLight },
    ghgTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, marginBottom: 10 },
    ghgRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ghgLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.primaryDark },
    ghgValue: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
    ghgSub: { fontSize: 11, color: theme.colors.primary, opacity: 0.7, marginTop: 2 },
  });
