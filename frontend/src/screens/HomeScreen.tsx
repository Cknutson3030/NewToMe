import React, { useState } from 'react';
import { View, Text, Button, TextInput } from 'react-native';
import { Alert } from 'react-native';

// Use your computer's IP address so your phone can connect
const HEALTH_URL = 'http://172.16.1.252:3000/health';

// Add this at the top of your file or inside your component
const AUTH_TOKEN = '<YOUR_TOKEN>'; // Replace with your actual JWT token

export default function HomeScreen() {
  // State to store health check result
  const [health, setHealth] = useState('');

  // State to store listing data
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Function to check backend health
  const checkHealth = async () => {
    try {
      // Send GET request to backend health endpoint
      const res = await fetch(HEALTH_URL);
      // Parse response as JSON
      const data = await res.json();
      // Update health state with response status
      setHealth(data.status || 'Healthy');
    } catch (err) {
      // If request fails, show error message
      setHealth('Error connecting to backend');
    }
  };

  // Function to create a listing
  const createListing = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Title is required');
      return;
    }

    try {
      const res = await fetch('http://172.16.1.252:3000/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify({ title, description }),
      });
      if (res.ok) {
        Alert.alert('Success', 'Listing created!');
        setTitle('');
        setDescription('');
      } else {
        Alert.alert('Error', 'Failed to create listing');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    }
  };

  // Render UI
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {/* Button to trigger health check */}
      <Button title="Check Backend Health" onPress={checkHealth} />
      {/* Show health check result if available */}
      {health ? <Text style={{ marginTop: 16 }}>{health}</Text> : null}
      {/* Add this section to your JSX, wherever you want the form to appear */}
      <View style={{ marginVertical: 24 }}>
        <Text style={{ fontSize: 18, marginBottom: 8 }}>Create Listing</Text>
        <TextInput
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          style={{ borderWidth: 1, marginBottom: 8, padding: 8 }}
        />
        <TextInput
          placeholder="Description"
          value={description}
          onChangeText={setDescription}
          style={{ borderWidth: 1, marginBottom: 8, padding: 8 }}
        />
        <Button title="Create Listing" onPress={createListing} />
      </View>
    </View>
  );
}