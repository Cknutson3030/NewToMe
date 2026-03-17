import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { createListing as apiCreateListing, uploadListingImages } from '../api/listings';
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
            quality: 0.7, // Compress to reduce file size (max 5MB on server)
        });

        if (!result.canceled) {
            // Limit to 5 images
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
            quality: 0.7, // Compress to reduce file size (max 5MB on server)
        });

        if (!result.canceled && result.assets.length > 0) {
            // Add to existing images (max 5 total)
            setImages(prev => [...prev, ...result.assets].slice(0, 5));
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
            
            // Convert HEIC/HEIF (iPhone default) to JPEG
            if (mimeType === 'image/heic' || mimeType === 'image/heif' || uri.toLowerCase().includes('.heic')) {
                console.log(`[uploadImages] Converting HEIC to JPEG for image ${i}`);
                const converted = await convertToJpeg(uri);
                uri = converted.uri;
                mimeType = converted.mimeType;
            }
            
            // Ensure valid MIME type
            if (!mimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
                console.log(`[uploadImages] Converting unknown format to JPEG for image ${i}`);
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
            Alert.alert('Success', 'Images uploaded!');
        } catch (err) {
            console.error('[uploadImages] Error:', err);
            Alert.alert('Error', `Failed to upload images: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
    };

    // Function to create a listing
    const createListing = async () => {
        // Validate title
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
            });

            Alert.alert('Success', 'Listing created!');
            // Upload images if any
            if (images.length > 0) {
                await uploadImages(data.data.id);
            }
            // Clear form
            setTitle('');
            setDescription('');
            setPrice('');
            setCategory('');
            setLocationCity('');
            setItemCondition('');
            setImages([]);
            // Go back to home screen
            navigation.goBack();
        } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Network error');
        }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}>
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
              <Text style={styles.header}>Create New Listing</Text>

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

            <Button onPress={pickImages}>Pick Images (Max 5)</Button>
            <View style={{ marginTop: 8 }}>
                <Button variant="ghost" onPress={takePhoto}>Take Photo</Button>
            </View>
            {images.length > 0 && (
                <Text style={{ marginTop: 8, marginBottom: 8 }}>Selected {images.length} image(s)</Text>
            )}

                            <Button onPress={createListing}>Create Listing</Button>
                        </ScrollView>
                    </TouchableWithoutFeedback>
                </KeyboardAvoidingView>
        );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
});
