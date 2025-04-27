import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ImagePlaceholder = ({ width, height, iconSize = 50 }) => {
  return (
    <View style={[styles.container, { width, height }]}>
      <Ionicons name="film-outline" size={iconSize} color="#555" />
      <Text style={styles.text}>No Image</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  text: {
    color: '#555',
    fontSize: 12,
    marginTop: 5,
  },
});

export default ImagePlaceholder;