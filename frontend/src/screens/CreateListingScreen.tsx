import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';


// API URL for creating listings
const CREATE_URL = 'http://172.16.1.252:3000/listings';

export default function CreateListingScreen({ navigation }: { navigation: any }) {
  // State for form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [itemCondition, setItemCondition] = useState('');

  // Function to create a listing
  const createListing = async () => {
    // Validate title
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    try {
      const res = await fetch(CREATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          price: price ? parseFloat(price) : null,
          category,
          location_city: locationCity,
          item_condition: itemCondition,
        }),
      });

      if (res.ok) {
        Alert.alert('Success', 'Listing created!');
        // Clear form
        setTitle('');
        setDescription('');
        setPrice('');
        setCategory('');
        setLocationCity('');
        setItemCondition('');
        // Go back to home screen
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to create listing');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    }
  };

  return (
    <View style={styles.container}>
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

      <Button title="Create Listing" onPress={createListing} />
    </View>
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
