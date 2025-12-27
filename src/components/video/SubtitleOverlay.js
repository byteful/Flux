import React, { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

const SubtitleOverlay = memo(({ subtitlesEnabled, currentSubtitleText }) => {
  if (!subtitlesEnabled || !currentSubtitleText) return null;

  return (
    <View style={styles.subtitleTextContainer} pointerEvents="none">
      <Text style={styles.subtitleText}>{currentSubtitleText}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  subtitleTextContainer: {
    position: 'absolute',
    bottom: 30,
    left: '5%',
    right: '5%',
    alignItems: 'center',
    zIndex: 7,
    pointerEvents: 'none',
  },
  subtitleText: {
    fontSize: Platform.OS === 'android' ? 16 : 18,
    color: 'white',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1.5 },
    textShadowRadius: 2,
    elevation: 1,
  },
});

export default SubtitleOverlay;
