import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const SeekIndicators = ({
  isLiveStream,
  leftSeekAmount,
  rightSeekAmount,
  leftSeekOpacity,
  rightSeekOpacity,
  leftArrowTranslate,
  rightArrowTranslate,
}) => {
  return (
    <>
      {!isLiveStream && leftSeekAmount !== 0 && (
        <Animated.View style={[styles.seekIndicatorLeft, { opacity: leftSeekOpacity }]} pointerEvents="none">
          <View style={styles.seekIndicatorContent}>
            <Animated.View style={{ transform: [{ translateX: leftArrowTranslate }] }}>
              <MaterialIcons name="chevron-left" size={32} color="white" />
            </Animated.View>
            <Text style={styles.seekIndicatorText}>- {Math.abs(leftSeekAmount)}</Text>
          </View>
        </Animated.View>
      )}
      {!isLiveStream && rightSeekAmount !== 0 && (
        <Animated.View style={[styles.seekIndicatorRight, { opacity: rightSeekOpacity }]} pointerEvents="none">
          <View style={styles.seekIndicatorContent}>
            <Text style={styles.seekIndicatorText}>+ {rightSeekAmount}</Text>
            <Animated.View style={{ transform: [{ translateX: rightArrowTranslate }] }}>
              <MaterialIcons name="chevron-right" size={32} color="white" />
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  seekIndicatorLeft: {
    position: 'absolute',
    left: 60,
    top: '50%',
    transform: [{ translateY: -25 }],
    backgroundColor: 'rgba(255, 255, 255, 0)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  seekIndicatorRight: {
    position: 'absolute',
    right: 60,
    top: '50%',
    transform: [{ translateY: -25 }],
    backgroundColor: 'rgba(255, 255, 255, 0)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  seekIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekIndicatorText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 8,
  },
});

export default SeekIndicators;
