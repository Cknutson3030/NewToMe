import React, { useState } from 'react';
import { View, Text, Button } from 'react-native';

// Use your computer's IP address so your phone can connect
const HEALTH_URL = 'http://172.16.1.252:3000/health';

export default function HomeScreen() {
  // State to store health check result
  const [health, setHealth] = useState('');

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

  // Render UI
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {/* Button to trigger health check */}
      <Button title="Check Backend Health" onPress={checkHealth} />
      {/* Show health check result if available */}
      {health ? <Text style={{ marginTop: 16 }}>{health}</Text> : null}
    </View>
  );
}