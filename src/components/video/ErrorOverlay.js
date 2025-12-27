import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const ErrorOverlay = ({ error, onRetry, onGoBack }) => {
  if (!error) return null;

  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>Error loading video.</Text>
      <Text style={styles.errorDetail}>{error.message || "Check connection"}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.goBackButton} onPress={onGoBack}>
        <Text style={styles.goBackButtonText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 10,
    padding: 20,
  },
  errorText: {
    color: '#fff',
    marginBottom: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorDetail: {
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
    width: "60%",
  },
  retryButton: {
    backgroundColor: '#E50914',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginBottom: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  goBackButton: {
    backgroundColor: '#222',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  goBackButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ErrorOverlay;
