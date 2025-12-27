import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppState, PanResponder } from 'react-native';
import * as Brightness from 'expo-brightness';

export const useBrightness = (showControls) => {
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
  const brightnessSliderRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Brightness.requestPermissionsAsync();
      if (status === 'granted') {
        setHasBrightnessPermission(true);
        const initialBrightness = await Brightness.getSystemBrightnessAsync();
        setBrightnessLevel(initialBrightness);
      }
    })();

    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') {
        if (hasBrightnessPermission) {
          try {
            const currentBrightness = await Brightness.getSystemBrightnessAsync();
            setBrightnessLevel(currentBrightness);
          } catch (e) {
            console.error('Error fetching brightness on resume:', e);
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [hasBrightnessPermission]);

  const handleBrightnessChange = useCallback(async (value) => {
    setBrightnessLevel(value);
    await Brightness.setSystemBrightnessAsync(value);
  }, []);

  const brightnessPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
    },
    onPanResponderGrant: (evt) => {
      if (!brightnessSliderRef.current || !hasBrightnessPermission) return;
      brightnessSliderRef.current.measure((x, y, width, height, pageX, pageY) => {
        const touchY = evt.nativeEvent.pageY - pageY;
        const newValue = 1 - Math.max(0, Math.min(1, touchY / height));
        handleBrightnessChange(newValue);
      });
    },
    onPanResponderMove: (evt) => {
      if (!brightnessSliderRef.current || !hasBrightnessPermission) return;
      brightnessSliderRef.current.measure((x, y, width, height, pageX, pageY) => {
        const touchY = evt.nativeEvent.pageY - pageY;
        const newValue = 1 - Math.max(0, Math.min(1, touchY / height));
        handleBrightnessChange(newValue);
      });
    },
    onPanResponderRelease: () => {},
  }), [hasBrightnessPermission, handleBrightnessChange]);

  return {
    brightnessLevel,
    hasBrightnessPermission,
    brightnessSliderRef,
    brightnessPanResponder,
    handleBrightnessChange,
  };
};
