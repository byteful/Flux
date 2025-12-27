import { useState, useRef, useCallback } from 'react';
import { clearSpecificStreamFromCache } from '../utils/storage';

const BUFFER_TIMEOUT = 20;

export const useBuffering = (handleReload, contentId) => {
  const [isBufferingVideo, setIsBufferingVideo] = useState(false);
  const [showBufferingAlert, setShowBufferingAlert] = useState(false);
  const bufferingTimeoutRef = useRef(null);

  const clearBufferingTimer = useCallback(() => {
    if (bufferingTimeoutRef.current) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }
  }, []);

  const startBufferingTimer = useCallback(() => {
    clearBufferingTimer();
    bufferingTimeoutRef.current = setTimeout(() => {
      if (!showBufferingAlert) {
        setShowBufferingAlert(true);
      }
    }, BUFFER_TIMEOUT * 1000);
  }, [clearBufferingTimer, showBufferingAlert]);

  const handleKeepBuffering = useCallback(() => {
    setShowBufferingAlert(false);
    clearBufferingTimer();
  }, [clearBufferingTimer]);

  const handleRetryExtraction = useCallback(async () => {
    setShowBufferingAlert(false);
    if (contentId) {
      await clearSpecificStreamFromCache(contentId);
    }
    if (handleReload) {
      handleReload();
    }
  }, [contentId, handleReload]);

  return {
    isBufferingVideo,
    showBufferingAlert,
    bufferingTimeoutRef,
    setIsBufferingVideo,
    setShowBufferingAlert,
    startBufferingTimer,
    clearBufferingTimer,
    handleKeepBuffering,
    handleRetryExtraction,
  };
};
