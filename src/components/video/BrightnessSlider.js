import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BrightnessSlider = ({
  brightnessLevel,
  hasBrightnessPermission,
  brightnessSliderRef,
  brightnessPanResponder,
  showControls,
}) => {
  if (!hasBrightnessPermission) return null;

  return (
    <View style={styles.brightnessSliderContainer}>
      <Ionicons name="sunny" size={20} color="white" style={styles.brightnessIcon} />
      <View
        ref={brightnessSliderRef}
        style={styles.customBrightnessSliderWrapper}
        {...(showControls ? brightnessPanResponder.panHandlers : {})}
      >
        <View style={styles.customBrightnessTrack}>
          <View style={[styles.customBrightnessFill, { height: `${brightnessLevel * 100}%` }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  brightnessSliderContainer: {
    position: 'absolute',
    left: 20,
    top: '20%',
    bottom: '20%',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brightnessIcon: {
    marginTop: 10,
  },
  customBrightnessSliderWrapper: {
    width: 100,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  customBrightnessTrack: {
    width: 4,
    height: 130,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  customBrightnessFill: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});

export default BrightnessSlider;
