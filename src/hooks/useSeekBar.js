import { useState, useRef, useMemo } from 'react';
import { PanResponder } from 'react-native';

export const useSeekBar = ({
  player,
  duration,
  position,
  isPlaying,
  showControls,
  setPosition,
  setShowControls,
  setIsSeekingForControls,
  manualFinishTriggeredRef,
  lastPositionRef,
  lastPositionTimeRef,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewPosition, setSeekPreviewPosition] = useState(null);
  const [seekPreviewXPosition, setSeekPreviewXPosition] = useState(0);
  const wasPlayingBeforeSeek = useRef(false);
  const seekGestureStartedRef = useRef(false);
  const progressBarRef = useRef(null);

  const updateSeekPreview = (nativeEvent) => {
    if (!duration || !progressBarRef.current) return;
    progressBarRef.current.measure((x, y, width, height, pageX, pageY) => {
      let calculatedPosition = (nativeEvent.locationX / width) * duration;
      calculatedPosition = Math.max(0, Math.min(calculatedPosition, duration));
      if (!isNaN(calculatedPosition)) {
        setSeekPreviewPosition(calculatedPosition);
        setSeekPreviewXPosition(pageX + nativeEvent.locationX);
      }
    });
  };

  const progressPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
    },
    onPanResponderGrant: (evt) => {
      seekGestureStartedRef.current = true;
      setIsSeeking(true);
      if (setIsSeekingForControls) setIsSeekingForControls(true);
      wasPlayingBeforeSeek.current = isPlaying;
      if (player && isPlaying) {
        player.pause();
      }
      updateSeekPreview(evt.nativeEvent);
      setShowControls(true);
    },
    onPanResponderMove: (evt) => {
      updateSeekPreview(evt.nativeEvent);
      setShowControls(true);
    },
    onPanResponderRelease: (evt) => {
      const hasMoved = seekGestureStartedRef.current;
      const seekTarget = seekPreviewPosition;
      seekGestureStartedRef.current = false;
      setSeekPreviewPosition(null);
      setSeekPreviewXPosition(0);

      if (player && seekTarget !== null && hasMoved) {
        try {
          player.currentTime = seekTarget;
          setPosition(seekTarget);
          if (lastPositionRef) lastPositionRef.current = seekTarget;
          if (lastPositionTimeRef) lastPositionTimeRef.current = Date.now();

          if (duration > 0 && seekTarget < duration - 5) {
            if (manualFinishTriggeredRef) manualFinishTriggeredRef.current = false;
          }

          if (player && wasPlayingBeforeSeek.current) {
            player.play();
          }

          setTimeout(() => {
            setIsSeeking(false);
            if (setIsSeekingForControls) setIsSeekingForControls(false);
          }, 100);
        } catch (e) {
          console.error('Error seeking player on release:', e);
          setIsSeeking(false);
          if (setIsSeekingForControls) setIsSeekingForControls(false);
        }
      } else {
        setIsSeeking(false);
        if (setIsSeekingForControls) setIsSeekingForControls(false);
      }

      setShowControls(true);
    },
    onPanResponderTerminate: () => {
      seekGestureStartedRef.current = false;
      setIsSeeking(false);
      if (setIsSeekingForControls) setIsSeekingForControls(false);
      setSeekPreviewPosition(null);
      setSeekPreviewXPosition(0);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => false,
  }), [player, duration, isPlaying, seekPreviewPosition, setPosition, setShowControls, setIsSeekingForControls, manualFinishTriggeredRef, lastPositionRef, lastPositionTimeRef]);

  return {
    isSeeking,
    seekPreviewPosition,
    seekPreviewXPosition,
    progressBarRef,
    progressPanResponder,
    setIsSeeking,
  };
};
