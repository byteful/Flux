import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const LoadingOverlay = ({
  isInitialLoading,
  manualWebViewVisible,
  streamExtractionComplete,
  currentAttemptingSource,
  onGoBack,
  onCaptchaDone,
}) => {
  if (!isInitialLoading) return null;

  return (
    <View style={styles.loaderContainer}>
      <SafeAreaView style={styles.loadingBackButtonContainer}>
        <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
      </SafeAreaView>
      <ActivityIndicator size="large" color="#E50914" />
      <Text style={styles.loadingText}>
        {manualWebViewVisible ? 'Please complete the CAPTCHA below.' :
          streamExtractionComplete ? 'Loading video...' :
            currentAttemptingSource ? `Extracting from ${currentAttemptingSource}...` : 'Initializing stream extraction...'}
      </Text>
      {!streamExtractionComplete && !manualWebViewVisible && currentAttemptingSource && (
        <Text style={styles.loadingSubText}>
          Trying source: {currentAttemptingSource}. This may take a moment...
        </Text>
      )}
      {manualWebViewVisible && (
        <>
          <Text style={styles.captchaInfoText}>
            If you see this often, a VPN or network issue might be the cause.
          </Text>
          <TouchableOpacity style={styles.captchaDoneButton} onPress={onCaptchaDone}>
            <Text style={styles.captchaDoneButtonText}>I've clicked it / Close</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 10,
  },
  loadingBackButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 10,
    zIndex: 11,
  },
  backButton: {
    padding: 8,
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
  },
  loadingSubText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 5,
  },
  captchaInfoText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  captchaDoneButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#E50914',
    borderRadius: 5,
  },
  captchaDoneButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default LoadingOverlay;
