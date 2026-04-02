import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { createListing as apiCreateListing, uploadListingImages, analyzeImageForListing } from '../api/listings';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/ui/Button';

// Convert image to JPEG (handles HEIC from iPhone)
const convertToJpeg = async (uri: string): Promise<{ uri: string; mimeType: string }> => {
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [], // no transformations
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri, mimeType: 'image/jpeg' };
};

export default function CreateListingScreen({ navigation }: { navigation: any }) {
    const { theme } = useTheme();
    // State for form fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [category, setCategory] = useState('');
    const [locationCity, setLocationCity] = useState('');
    const [itemCondition, setItemCondition] = useState('');
    const [images, setImages] = useState<any[]>([]);

    // GHG data from AI analysis
    const [ghg, setGhg] = useState<{
        manufacturing_kg: number;
        materials_kg: number;
        transport_kg: number;
        end_of_life_kg: number;
    } | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    // Function to pick images from library
    const pickImages = async () => {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission required', 'Permission to access camera roll is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.7,
        });

        if (!result.canceled) {
            const selectedImages = result.assets.slice(0, 5);
            setImages(selectedImages);
        }
    };

    // Function to take a photo with camera
    const takePhoto = async () => {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
            Alert.alert('Permission required', 'Permission to access camera is required!');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            quality: 0.7,
        });

        if (!result.canceled && result.assets.length > 0) {
            setImages(prev => [...prev, ...result.assets].slice(0, 5));
        }
    };

    // AI image analysis — fills in product details and GHG estimates
    const analyzeWithAI = async () => {
        if (images.length === 0) {
            Alert.alert('No image', 'Please pick or take a photo first, then tap Analyze with AI.');
            return;
        }

        setAnalyzing(true);
        try {
            const img = images[0];
            let uri = img.uri;
            let mimeType = img.mimeType || 'image/jpeg';

            // Convert HEIC to JPEG if needed
            if (mimeType === 'image/heic' || mimeType === 'image/heif' || uri.toLowerCase().includes('.heic')) {
                const converted = await convertToJpeg(uri);
                uri = converted.uri;
                mimeType = converted.mimeType;
            }

            const result = await analyzeImageForListing(uri, mimeType);

            setTitle(result.product_name || title);
            setDescription(result.description || description);
            setCategory(result.category || category);
            setItemCondition(result.item_condition || itemCondition);
            setGhg(result.ghg);

            Alert.alert('Analysis complete', 'Product details and GHG estimates have been filled in. Review and adjust before posting.');
        } catch (err: any) {
            Alert.alert('Analysis failed', err.message || 'Could not analyze image. Please fill in details manually.');
        } finally {
            setAnalyzing(false);
        }
    };

    // Function to upload images
    const uploadImages = async (listingId: string) => {
        if (images.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            let uri = img.uri;
            let mimeType = img.mimeType || '';

            if (mimeType === 'image/heic' || mimeType === 'image/heif' || uri.toLowerCase().includes('.heic')) {
                const converted = await convertToJpeg(uri);
                uri = converted.uri;
                mimeType = converted.mimeType;
            }

            if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
                const converted = await convertToJpeg(uri);
                uri = converted.uri;
                mimeType = converted.mimeType;
            }

            const fileName = `photo_${Date.now()}_${i}.jpg`;
            formData.append('images', {
                uri: uri,
                name: fileName,
                type: mimeType,
            } as unknown as Blob);
        }

        try {
            await uploadListingImages(listingId, formData);
        } catch (err) {
            Alert.alert('Error', `Failed to upload images: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // Function to create a listing
    const createListing = async () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Title is required');
            return;
        }

        try {
            const data = await apiCreateListing({
                title,
                description,
                price: price ? parseFloat(price) : null,
                category,
                location_city: locationCity,
                item_condition: itemCondition,
                ...(ghg ? {
                    ghg_manufacturing_kg: ghg.manufacturing_kg,
                    ghg_materials_kg: ghg.materials_kg,
                    ghg_transport_kg: ghg.transport_kg,
                    ghg_end_of_life_kg: ghg.end_of_life_kg,
                } : {}),
            });

            if (images.length > 0) {
                await uploadImages(data.data.id);
            }

            Alert.alert('Success', 'Listing created!');
            setTitle('');
            setDescription('');
            setPrice('');
            setCategory('');
            setLocationCity('');
            setItemCondition('');
            setImages([]);
            setGhg(null);
            navigation.goBack();
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
        }
    };

    const totalBuyerGhg = ghg
        ? ghg.manufacturing_kg + ghg.materials_kg + ghg.transport_kg
        : null;

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
              <Text style={styles.header}>Create New Listing</Text>

              {/* Image picking */}
              <Button onPress={pickImages}>Pick Images (Max 5)</Button>
              <View style={{ marginTop: 8 }}>
                <Button variant="ghost" onPress={takePhoto}>Take Photo</Button>
              </View>
              {images.length > 0 && (
                <Text style={styles.imageCount}>Selected {images.length} image(s)</Text>
              )}

              {/* AI Analysis */}
              <View style={styles.aiRow}>
                <Button
                  onPress={analyzeWithAI}
                  style={[styles.aiButton, analyzing && styles.aiButtonDisabled]}
                >
                  {analyzing ? 'Analyzing...' : 'Autofill with AI'}
                </Button>
                {analyzing && <ActivityIndicator style={{ marginLeft: 8 }} />}
              </View>
              {images.length === 0 && (
                <Text style={styles.aiHint}>Add an image first, then tap Analyze with AI to auto-fill details.</Text>
              )}

              <TextInput
                placeholder="Title *"
                value={title}
                onChangeText={setTitle}
                style={styles.input}
              />

              <TextInput
                placeholder="Description"
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.textArea]}
                multiline
                numberOfLines={3}
              />

              <TextInput
                placeholder="Price"
                value={price}
                onChangeText={setPrice}
                style={styles.input}
                keyboardType="numeric"
              />

              <TextInput
                placeholder="Category"
                value={category}
                onChangeText={setCategory}
                style={styles.input}
              />

              <TextInput
                placeholder="Location (City)"
                value={locationCity}
                onChangeText={setLocationCity}
                style={styles.input}
              />

              <TextInput
                placeholder="Item Condition"
                value={itemCondition}
                onChangeText={setItemCondition}
                style={styles.input}
              />

              {/* GHG summary card — shown after AI analysis */}
              {ghg && (
                <View style={styles.ghgCard}>
                  <Text style={styles.ghgTitle}>GHG Impact Estimates</Text>

                  <Text style={styles.ghgSection}>What the buyer saves (vs. buying new):</Text>
                  <Text style={styles.ghgRow}>Manufacturing: <Text style={styles.ghgValue}>{ghg.manufacturing_kg.toFixed(1)} kg CO₂e</Text></Text>
                  <Text style={styles.ghgRow}>Raw materials: <Text style={styles.ghgValue}>{ghg.materials_kg.toFixed(1)} kg CO₂e</Text></Text>
                  <Text style={styles.ghgRow}>Transport: <Text style={styles.ghgValue}>{ghg.transport_kg.toFixed(1)} kg CO₂e</Text></Text>
                  <Text style={[styles.ghgRow, styles.ghgTotal]}>Total buyer savings: {totalBuyerGhg!.toFixed(1)} kg CO₂e</Text>

                  <Text style={[styles.ghgSection, { marginTop: 10 }]}>What you save (vs. throwing it out):</Text>
                  <Text style={[styles.ghgRow, styles.ghgTotal]}>End-of-life savings: {ghg.end_of_life_kg.toFixed(1)} kg CO₂e</Text>
                </View>
              )}

              <View style={{ marginTop: 8 }}>
                <Button onPress={createListing}>Create Listing</Button>
              </View>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        backgroundColor: '#fff',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    imageCount: {
        marginTop: 8,
        marginBottom: 4,
        color: '#374151',
    },
    aiRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 4,
    },
    aiButton: {
        flex: 1,
    },
    aiButtonDisabled: {
        opacity: 0.6,
    },
    aiHint: {
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 12,
    },
    ghgCard: {
        backgroundColor: '#F0FFF4',
        borderWidth: 1,
        borderColor: '#6EE7B7',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
    },
    ghgTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#065F46',
        marginBottom: 10,
    },
    ghgSection: {
        fontSize: 13,
        fontWeight: '600',
        color: '#047857',
        marginBottom: 4,
    },
    ghgRow: {
        fontSize: 13,
        color: '#374151',
        marginBottom: 2,
        paddingLeft: 8,
    },
    ghgValue: {
        fontWeight: '600',
        color: '#065F46',
    },
    ghgTotal: {
        fontWeight: '700',
        color: '#065F46',
        marginTop: 2,
    },
});
