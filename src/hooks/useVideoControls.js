import { useState, useRef, useCallback, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

export const useVideoControls = (player, isLiveStream = false) => {
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const controlsTimerRef = useRef(null);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const isSeekingRef = useRef(false);

  const setIsSeeking = useCallback((seeking) => {
    isSeekingRef.current = seeking;
  }, []);

  const startControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }

    controlsTimerRef.current = setTimeout(() => {
      if (!isSeekingRef.current) {
        setShowControls(false);
      }
    }, 5000);
  }, []);

  useEffect(() => {
    if (showControls) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
      startControlsTimer();
    } else {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    }
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [showControls, opacityAnim, startControlsTimer]);

  const toggleControls = useCallback(() => {
    setShowControls(current => !current);
  }, []);

  const togglePlayPause = useCallback(async () => {
    try {
      if (player) {
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error toggling play/pause:', error);
    }
  }, [player, isPlaying]);

  const toggleMute = useCallback(async () => {
    try {
      if (player) {
        const newMutedState = !isMuted;
        player.muted = newMutedState;
        setIsMuted(newMutedState);
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  }, [player, isMuted]);

  const seekBackward = useCallback(async () => {
    try {
      if (player) {
        player.seekBy(-10);
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error seeking backward:', error);
    }
  }, [player]);

  const seekForward = useCallback(async () => {
    try {
      if (player) {
        player.seekBy(10);
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error seeking forward:', error);
    }
  }, [player]);

  const cleanup = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  return {
    showControls,
    isPlaying,
    isMuted,
    opacityAnim,
    controlsTimerRef,
    setShowControls,
    setIsPlaying,
    setIsMuted,
    setIsSeeking,
    toggleControls,
    togglePlayPause,
    toggleMute,
    seekBackward,
    seekForward,
    startControlsTimer,
    cleanup,
  };
};
