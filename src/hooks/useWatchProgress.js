import { useState, useRef, useCallback } from 'react';
import { saveWatchProgress, getWatchProgress, getEpisodeWatchProgress } from '../utils/storage';

const VIDEO_END_THRESHOLD_SECONDS = 45;

export const useWatchProgress = ({
  mediaId,
  mediaType,
  season,
  episode,
  title,
  episodeTitle,
  poster_path,
  isLiveStream,
  isUnmounting,
}) => {
  const [resumeTime, setResumeTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const lastSaveTimeRef = useRef(0);
  const lastPositionRef = useRef(0);
  const lastPositionTimeRef = useRef(0);
  const manualFinishTriggeredRef = useRef(false);

  const checkSavedProgress = useCallback(async () => {
    if (isLiveStream) {
      return;
    }
    try {
      if (mediaType === 'tv') {
        const episodeProgress = await getEpisodeWatchProgress(mediaId, season, episode);
        if (episodeProgress && episodeProgress.position) {
          if (!episodeProgress.duration || (episodeProgress.duration - episodeProgress.position > VIDEO_END_THRESHOLD_SECONDS * 1.5)) {
            setResumeTime(episodeProgress.position);
          }
        }
      } else {
        const progress = await getWatchProgress(mediaId);
        if (progress && progress.position) {
          if (!progress.duration || (progress.duration - progress.position > VIDEO_END_THRESHOLD_SECONDS * 1.5)) {
            setResumeTime(progress.position);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load progress:", e);
    }
  }, [mediaId, mediaType, season, episode, isLiveStream]);

  const saveProgress = useCallback((currentTime) => {
    if (isLiveStream || isUnmounting || !currentTime || !duration || duration <= 0) return;

    if ((duration - currentTime) < VIDEO_END_THRESHOLD_SECONDS) {
      return;
    }
    try {
      const data = {
        title: title,
        episodeTitle: episodeTitle,
        mediaType: mediaType,
        mediaId: mediaId,
        position: currentTime,
        duration: duration,
        poster_path: poster_path,
        season: season,
        episode: episode,
        lastWatched: new Date().toISOString(),
      };
      saveWatchProgress(mediaId, data);
    } catch (e) {
      console.error("Error saving progress:", e);
    }
  }, [isLiveStream, isUnmounting, duration, title, episodeTitle, mediaType, mediaId, poster_path, season, episode]);

  const handlePositionChange = useCallback((currentEventTime, {
    isSeeking,
    showNextEpisodeButton,
    autoPlayEnabled,
    playNextEpisode,
    findNextEpisode,
    handleGoBack,
    nextEpisodeDetailsRef,
    updateCurrentSubtitle,
    setIsAtLiveEdge,
  }) => {
    if (typeof currentEventTime !== 'number' || isNaN(currentEventTime) || isSeeking) {
      return;
    }
    setPosition(currentEventTime);

    if (isLiveStream && duration > 0) {
      const liveEdgeThreshold = 2;
      const atLiveEdge = currentEventTime >= duration - liveEdgeThreshold;
      setIsAtLiveEdge(atLiveEdge);
    }

    const now = Date.now();

    if (duration > 0 && currentEventTime >= duration - 1.5 && !manualFinishTriggeredRef.current) {
      const lastPos = lastPositionRef.current;
      const lastTime = lastPositionTimeRef.current;

      if (Math.abs(currentEventTime - lastPos) < 0.5 && now - lastTime > 2000) {
        manualFinishTriggeredRef.current = true;
        if (showNextEpisodeButton && autoPlayEnabled) {
          playNextEpisode();
        } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'tv') {
          findNextEpisode().then(() => {
            setTimeout(() => {
              if (nextEpisodeDetailsRef?.current) {
                playNextEpisode();
              } else {
                handleGoBack(true);
              }
            }, 100);
          });
        } else if (autoPlayEnabled && mediaType === 'movie') {
          handleGoBack(true);
        }
      }
    }
    lastPositionRef.current = currentEventTime;
    lastPositionTimeRef.current = now;
    if (duration > 0 && currentEventTime < duration - 5) {
      if (manualFinishTriggeredRef.current) {
        manualFinishTriggeredRef.current = false;
      }
    }

    if (currentEventTime > 0 && now - lastSaveTimeRef.current > 5000) {
      saveProgress(currentEventTime);
      lastSaveTimeRef.current = now;
    }
    if (updateCurrentSubtitle) {
      updateCurrentSubtitle(currentEventTime);
    }
  }, [isLiveStream, duration, mediaType, saveProgress]);

  const handleDurationChange = useCallback((dur) => {
    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
      if (duration !== dur) {
        setDuration(dur);
      }
    }
  }, [duration]);

  return {
    resumeTime,
    position,
    duration,
    lastSaveTimeRef,
    lastPositionRef,
    lastPositionTimeRef,
    manualFinishTriggeredRef,
    setResumeTime,
    setPosition,
    setDuration,
    checkSavedProgress,
    saveProgress,
    handlePositionChange,
    handleDurationChange,
  };
};
