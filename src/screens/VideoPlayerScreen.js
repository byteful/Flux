import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Alert, StyleSheet, ActivityIndicator, BackHandler, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { useEventListener } from 'expo';
import { GestureHandlerRootView, GestureDetector } from 'react-native-gesture-handler';
import { getLanguageName } from '../utils/languageUtils';
import { formatTime } from '../utils/timeUtils';
import { buildStreamHeaders } from '../utils/streamHeaders';

import { useVideoControls } from '../hooks/useVideoControls';
import { useBrightness } from '../hooks/useBrightness';
import { useBuffering } from '../hooks/useBuffering';
import { useSeekBar } from '../hooks/useSeekBar';
import { useGestures } from '../hooks/useGestures';
import { useWatchProgress } from '../hooks/useWatchProgress';
import { useSubtitles } from '../hooks/useSubtitles';
import { useAutoPlay } from '../hooks/useAutoPlay';
import { useEpisodeNavigation } from '../hooks/useEpisodeNavigation';
import { useStreamExtraction } from '../hooks/useStreamExtraction';

import SourceSelectionModal from '../components/SourceSelectionModal';
import SubtitlesModal from '../components/SubtitlesModal';
import {
  SubtitleOverlay,
  SeekIndicators,
  LoadingOverlay,
  ErrorOverlay,
  BufferingAlertModal,
  NextEpisodeButton,
  EpisodesModal,
  VideoControlsOverlay,
} from '../components/video';

const VideoPlayerScreen = ({ route }) => {
  const navigation = useNavigation();
  const navigationRef = useRef(navigation);

  const {
    mediaId,
    mediaType,
    season,
    episode,
    title,
    episodeTitle,
    poster_path,
    air_date: currentEpisodeAirDateFromParams,
    isLive,
    streameastUrl,
    isOffline,
    offlineFilePath,
  } = route.params;

  const contentId = mediaType === 'tv'
    ? `tv-${mediaId}-s${season}-e${episode}`
    : `movie-${mediaId}`;

  const [loading, setLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUnmounting, setIsUnmounting] = useState(false);
  const [videoNaturalSize, setVideoNaturalSize] = useState(null);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);
  const [showSubtitlesModal, setShowSubtitlesModal] = useState(false);

  const player = useVideoPlayer(null);

  const videoControls = useVideoControls(player);
  const {
    showControls,
    isPlaying,
    isMuted,
    opacityAnim,
    setShowControls,
    setIsPlaying,
    setIsSeeking: setIsSeekingForControls,
    toggleControls,
    togglePlayPause,
    toggleMute,
    seekBackward,
    seekForward,
    startControlsTimer,
  } = videoControls;

  const brightness = useBrightness(showControls);
  const {
    brightnessLevel,
    hasBrightnessPermission,
    brightnessSliderRef,
    brightnessPanResponder,
  } = brightness;

  const watchProgress = useWatchProgress({
    mediaId,
    mediaType,
    season,
    episode,
    title,
    episodeTitle,
    poster_path,
    isLiveStream: false,
    isUnmounting,
  });
  const {
    resumeTime,
    position,
    duration,
    lastPositionRef,
    lastPositionTimeRef,
    manualFinishTriggeredRef,
    setResumeTime,
    setPosition,
    setDuration,
    checkSavedProgress,
    saveProgress,
    handleDurationChange,
  } = watchProgress;

  const subtitles = useSubtitles(mediaId, mediaType, season, episode);
  const {
    availableLanguages,
    selectedLanguage,
    currentSubtitleText,
    subtitlesEnabled,
    loadingSubtitles,
    preferredSubtitleLanguageLoadedRef,
    initialSubtitlePreferenceAppliedRef,
    setSubtitlesEnabled,
    loadSubtitlePreference,
    findSubtitles,
    selectSubtitle,
    updateCurrentSubtitle,
  } = subtitles;

  const handleReload = useCallback(async () => {
    if (buffering.bufferingTimeoutRef.current) {
      clearTimeout(buffering.bufferingTimeoutRef.current);
      buffering.bufferingTimeoutRef.current = null;
    }

    if (player) {
      try {
        if (player.isPlaying) {
          await player.pause();
        }
      } catch (e) {
        console.warn('[VideoPlayerScreen] Error pausing player on reload:', e);
      }
    }

    buffering.setShowBufferingAlert(false);
    autoPlay.reset();
    setError(null);
    setLoading(true);
    setIsInitialLoading(true);
    streamExtraction.reset();
    setResumeTime(0);
    setPosition(0);
    setDuration(0);
    lastPositionRef.current = 0;
    lastPositionTimeRef.current = 0;
    manualFinishTriggeredRef.current = false;
    setRetryAttempts(prev => prev + 1);
  }, [player]);

  const buffering = useBuffering(handleReload, contentId);
  const {
    isBufferingVideo,
    showBufferingAlert,
    setIsBufferingVideo,
    setShowBufferingAlert,
    startBufferingTimer,
    clearBufferingTimer,
    handleKeepBuffering,
    handleRetryExtraction,
  } = buffering;

  const handleGoBack = useCallback((isEndOfSeries = false) => {
    if (isUnmounting) return;
    setIsUnmounting(true);
    try {
      if (!isEndOfSeries && !streamExtraction.isLiveStream) {
        saveProgress(position);
      }
      if (player) {
        player.pause();
      }
      ScreenOrientation.unlockAsync()
        .catch(() => { })
        .finally(() => {
          const navRef = navigationRef.current;
          if (!navRef) return;

          setTimeout(() => {
            try {
              if (streamExtraction.isLiveStream) {
                navRef.replace('MainTabs');
              } else {
                navRef.replace('DetailScreen', { mediaId: mediaId, mediaType: mediaType, title: title });
              }
            } catch (e) {
              console.error("Navigation error:", e);
              try { navRef.replace('MainTabs'); } catch (e2) { }
            }
          }, 100);
        });
    } catch (e) {
      console.error("Error in handleGoBack:", e);
      const navRef = navigationRef.current;
      if (!navRef) return;
      try { navRef.navigate('MainTabs'); } catch (e2) { }
    }
  }, [isUnmounting, player, position, mediaId, mediaType, title, saveProgress]);

  const autoPlay = useAutoPlay({
    mediaId,
    mediaType,
    season,
    episode,
    title,
    poster_path,
    position,
    duration,
    isLiveStream: false,
    player,
    navigation,
    handleGoBack,
    setIsUnmounting,
  });
  const {
    autoPlayEnabled,
    showNextEpisodeButton,
    nextEpisodeDetailsRef,
    setAutoPlayEnabled,
    loadAutoPlaySetting,
    findNextEpisode,
    playNextEpisode,
  } = autoPlay;

  const streamExtraction = useStreamExtraction({
    mediaId,
    mediaType,
    season,
    episode,
    episodeTitle,
    title,
    currentEpisodeAirDate: currentEpisodeAirDateFromParams,
    isLive,
    streameastUrl,
    isOffline,
    offlineFilePath,
    player,
    contentId,
    onError: setError,
    onFindSubtitles: findSubtitles,
    setAutoPlayEnabled,
    loadAutoPlaySetting,
    loadSubtitlePreference,
    checkSavedProgress,
  });
  const {
    videoUrl,
    streamExtractionComplete,
    currentWebViewConfig,
    currentSourceAttemptKey,
    currentAttemptingSource,
    currentPlayingSourceName,
    manualWebViewVisible,
    captchaUrl,
    isChangingSource,
    isLiveStream,
    availableSourcesList,
    sourceAttemptStatus,
    showSourceSelectionModal,
    setManualWebViewVisible,
    setCaptchaUrl,
    setShowSourceSelectionModal,
    openChangeSourceModal,
    handleSelectSourceFromModal,
    closeSourceModal,
  } = streamExtraction;

  const seekBar = useSeekBar({
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
  });
  const {
    isSeeking,
    seekPreviewPosition,
    seekPreviewXPosition,
    progressBarRef,
    progressPanResponder,
  } = seekBar;

  const gestures = useGestures({
    player,
    isLiveStream,
    isPlaying,
    toggleControls,
    startControlsTimer,
  });
  const {
    isZoomed,
    screenDimensions,
    animatedScale,
    leftSeekAmount,
    rightSeekAmount,
    leftSeekOpacity,
    rightSeekOpacity,
    leftArrowTranslate,
    rightArrowTranslate,
    videoAreaGestures,
    onLayoutRootView,
  } = gestures;

  const episodeNav = useEpisodeNavigation({
    mediaId,
    mediaType,
    season,
    episode,
    player,
    isPlaying,
    setShowControls,
  });
  const {
    showEpisodesModal,
    allSeasonsData,
    selectedSeasonForModal,
    episodesForModal,
    isLoadingModalEpisodes,
    seasonListModalRef,
    episodeListModalRef,
    setShowEpisodesModal,
    toggleEpisodesModal,
    handleSelectSeasonForModal,
  } = episodeNav;

  const [retryAttempts, setRetryAttempts] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (player && videoUrl) {
      player.allowsExternalPlayback = true;
      player.showNowPlayingNotification = true;
      if (subtitlesEnabled) {
        player.timeUpdateEventInterval = 1;
      } else if (showControls) {
        player.timeUpdateEventInterval = 1;
      } else {
        player.timeUpdateEventInterval = 1000;
      }
    }
  }, [player, videoUrl, showControls, subtitlesEnabled]);

  useEffect(() => {
    if (!player || !videoUrl || isUnmounting) return;

    setLoading(true);

    const playTimer = setTimeout(() => {
      if (isUnmounting || !player) return;
      try {
        if (resumeTime > 0) {
          player.currentTime = resumeTime;
        }
        player.play();
      } catch (e) {
        console.error("Error during post-replace seek/play:", e);
        setError({ message: "Failed to start playback after loading." });
        setLoading(false);
        setIsInitialLoading(false);
      }
    }, 1000);

    return () => clearTimeout(playTimer);
  }, [player, videoUrl, resumeTime, isUnmounting]);

  useEffect(() => {
    isMountedRef.current = true;
    setIsUnmounting(false);

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      .catch(e => console.error("Failed to lock orientation to landscape:", e));

    streamExtraction.initializePlayer(isMountedRef);
    setShowControls(true);

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });

    return () => {
      isMountedRef.current = false;
      setIsUnmounting(true);
      try {
        saveProgress(position);
        if (player && typeof player.pause === 'function') {
          try {
            player.pause();
          } catch (pauseError) { }
        }
        backHandler.remove();
        videoControls.cleanup();
        gestures.cleanup();
        clearBufferingTimer();
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };
  }, [navigation, contentId, mediaId, mediaType, season, episode, retryAttempts, player, isOffline, offlineFilePath]);

  useEffect(() => {
    if (error && error.isLiveStreamError) {
      Alert.alert(
        'Live Stream Ended',
        'The live stream has ended or is no longer available.',
        [{ text: 'OK', onPress: () => handleGoBack() }]
      );
    }
  }, [error, handleGoBack]);

  useEffect(() => {
    const prefLang = preferredSubtitleLanguageLoadedRef.current;
    if (Object.keys(availableLanguages).length > 0 && !initialSubtitlePreferenceAppliedRef.current) {
      if (prefLang !== null && availableLanguages[prefLang]) {
        selectSubtitle(prefLang);
      }
      initialSubtitlePreferenceAppliedRef.current = true;
    }
  }, [availableLanguages, selectSubtitle]);

  useEffect(() => {
    if (isPlaying && isBufferingVideo) {
      setIsBufferingVideo(false);
      if (loading && !isInitialLoading) {
        setLoading(false);
      }
    }
  }, [isPlaying, isBufferingVideo, loading, isInitialLoading]);

  useEventListener(player, "playToEnd", () => {
    if (showNextEpisodeButton && autoPlayEnabled) {
      playNextEpisode();
    } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'tv') {
      findNextEpisode().then(() => {
        setTimeout(() => {
          if (nextEpisodeDetailsRef.current) {
            playNextEpisode();
          } else {
            handleGoBack(true);
          }
        }, 100);
      });
    } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'movie') {
      handleGoBack(true);
    }
  });

  useEventListener(player, 'statusChange', (event) => {
    const status = event?.status ?? event;
    if (isUnmounting) return;

    let newIsBufferingVideoState = isBufferingVideo;
    let newLoadingState = loading;
    let newIsInitialLoadingState = isInitialLoading;

    const isPlayerActuallyBuffering = (typeof status === 'object' && status.isBuffering) ||
      (typeof status === 'string' && status === 'loading');

    if (isPlayerActuallyBuffering) {
      newIsBufferingVideoState = true;
      startBufferingTimer();
    } else {
      newIsBufferingVideoState = false;
      clearBufferingTimer();
    }

    const isPlayerLoadedAndReady = (typeof status === 'object' && status.isLoaded && !status.isBuffering) ||
      (typeof status === 'string' && status === 'readyToPlay');

    const hasPlayerErroredOrFailed = (typeof status === 'string' && (status === 'error' || status === 'failed')) ||
      (typeof status === 'object' && status.error);

    const hasPlayerFinishedPlaying = (typeof status === 'string' && status === 'finished');

    if (isPlayerLoadedAndReady) {
      newIsInitialLoadingState = false;
      newLoadingState = false;
    } else if (hasPlayerErroredOrFailed) {
      newIsInitialLoadingState = false;
      newLoadingState = false;
    } else if (hasPlayerFinishedPlaying) {
      newLoadingState = false;
    } else {
      if (!newIsInitialLoadingState) {
        newLoadingState = true;
      }
    }

    if (newIsInitialLoadingState) {
      newLoadingState = true;
    }

    if (newIsBufferingVideoState !== isBufferingVideo) {
      setIsBufferingVideo(newIsBufferingVideoState);
    }
    if (newIsInitialLoadingState !== isInitialLoading) {
      setIsInitialLoading(newIsInitialLoadingState);
    }
    if (newLoadingState !== loading) {
      setLoading(newLoadingState);
    }

    if (typeof status === 'object' && status !== null) {
      handleDurationChange(status.duration);
      if (status.naturalSize) {
        const { width: nw, height: nh, orientation: no } = status.naturalSize;
        let newNaturalSize = { width: nw, height: nh };
        if (no === 'landscape' && nw < nh) newNaturalSize = { width: nh, height: nw };
        else if (no === 'portrait' && nw > nh) newNaturalSize = { width: nh, height: nw };
        if (!videoNaturalSize || newNaturalSize.width !== videoNaturalSize.width || newNaturalSize.height !== videoNaturalSize.height) {
          setVideoNaturalSize(newNaturalSize);
        }
      }
    } else if (typeof status === 'string' && status === 'readyToPlay' && player) {
      handleDurationChange(player.duration);
    }

    if (hasPlayerFinishedPlaying) {
      if (showNextEpisodeButton && autoPlayEnabled) {
        playNextEpisode();
      } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'tv') {
        findNextEpisode().then(() => {
          setTimeout(() => {
            if (nextEpisodeDetailsRef.current) playNextEpisode();
            else handleGoBack(true);
          }, 100);
        });
      } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'movie') {
        handleGoBack(true);
      }
    }
  });

  useEventListener(player, 'timeUpdate', (event) => {
    const currentEventTime = typeof event === 'number' ? event : event?.currentTime;
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
              if (nextEpisodeDetailsRef.current) {
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

    if (currentEventTime > 0 && now - watchProgress.lastSaveTimeRef?.current > 5000) {
      saveProgress(currentEventTime);
      if (watchProgress.lastSaveTimeRef) watchProgress.lastSaveTimeRef.current = now;
    }
    updateCurrentSubtitle(currentEventTime);
  });

  useEventListener(player, 'playingChange', (event) => {
    const currentIsPlaying = typeof event === 'boolean' ? event : event?.isPlaying;
    if (typeof currentIsPlaying === 'boolean') {
      setIsPlaying(currentIsPlaying);
      if (currentIsPlaying && duration === 0) {
        setTimeout(() => {
          if (player && !isUnmounting) {
            handleDurationChange(player.duration);
          }
        }, 1000);
      }
    }
  });

  useEventListener(player, 'error', (playerError) => {
    if (isUnmounting) return;
    console.error('[VideoPlayerScreen] Video playback error occurred:', playerError);
    setError({ message: 'Video playback error: ' + (playerError?.message || 'Unknown error') });
  });

  const toggleSubtitlesModal = async () => {
    if (!showSubtitlesModal) {
      if (player && isPlaying) {
        try {
          player.pause();
        } catch (e) {
          console.error("Error pausing video on subtitles modal open:", e);
        }
      }
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error("Failed to lock orientation for subtitles modal:", e);
      }
      setShowSubtitlesModal(true);
    } else {
      setShowSubtitlesModal(false);
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.error("Failed to re-lock to LANDSCAPE on subtitles modal close:", e);
      }
    }
    setShowControls(true);
  };

  const injectedJavaScript = `(function() { window.alert = function() {}; })();`;

  return (
    <GestureHandlerRootView style={styles.gestureHandlerRoot}>
      <View style={styles.container} onLayout={onLayoutRootView}>
        <StatusBar hidden />

        {currentWebViewConfig && !streamExtractionComplete && (
          <View style={(manualWebViewVisible || __DEV__) ? styles.visibleWebViewForCaptcha : styles.hiddenWebView}>
            <WebView
              key={currentSourceAttemptKey}
              source={manualWebViewVisible && captchaUrl ? { uri: captchaUrl, headers: currentWebViewConfig.source.headers } : currentWebViewConfig.source}
              injectedJavaScript={currentWebViewConfig.injectedJavaScript}
              onMessage={currentWebViewConfig.onMessage}
              onError={currentWebViewConfig.onError}
              onHttpError={currentWebViewConfig.onHttpError}
              userAgent={currentWebViewConfig.userAgent}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={['*']}
              mixedContentMode="compatibility"
              incognito={false}
              thirdPartyCookiesEnabled={true}
              sharedCookiesEnabled={true}
              injectedJavaScriptForMainFrameOnly={false}
              injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
              onShouldStartLoadWithRequest={() => true}
              injectedJavaScriptBeforeContentLoaded={currentWebViewConfig.injectedJavaScriptBeforeContentLoaded || injectedJavaScript}
            />
          </View>
        )}

        <LoadingOverlay
          isInitialLoading={isInitialLoading}
          manualWebViewVisible={manualWebViewVisible}
          streamExtractionComplete={streamExtractionComplete}
          currentAttemptingSource={currentAttemptingSource}
          onGoBack={() => handleGoBack()}
          onCaptchaDone={() => setManualWebViewVisible(false)}
        />

        <ErrorOverlay
          error={error}
          onRetry={handleReload}
          onGoBack={() => handleGoBack()}
        />

        {videoUrl && (
          <GestureDetector gesture={videoAreaGestures}>
            <Animated.View
              style={[styles.video, { transform: [{ scale: animatedScale }] }]}
            >
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                nativeControls={false}
                allowsPictureInPicture={true}
                allowsVideoFrameAnalysis={false}
                startsPictureInPictureAutomatically={true}
                contentFit={isZoomed ? "cover" : "contain"}
                pointerEvents="none"
              />
            </Animated.View>
          </GestureDetector>
        )}

        <SeekIndicators
          isLiveStream={isLiveStream}
          leftSeekAmount={leftSeekAmount}
          rightSeekAmount={rightSeekAmount}
          leftSeekOpacity={leftSeekOpacity}
          rightSeekOpacity={rightSeekOpacity}
          leftArrowTranslate={leftArrowTranslate}
          rightArrowTranslate={rightArrowTranslate}
        />

        <SubtitleOverlay
          subtitlesEnabled={subtitlesEnabled}
          currentSubtitleText={currentSubtitleText}
        />

        {isBufferingVideo && !isInitialLoading && (
          <View style={styles.bufferingIndicatorContainer}>
            <ActivityIndicator size="large" color="#FFF" />
          </View>
        )}

        <VideoControlsOverlay
          showControls={showControls}
          opacityAnim={opacityAnim}
          isPlaying={isPlaying}
          isMuted={isMuted}
          isLiveStream={isLiveStream}
          title={title}
          episodeTitle={episodeTitle}
          mediaType={mediaType}
          season={season}
          episode={episode}
          position={position}
          duration={duration}
          isSeeking={isSeeking}
          seekPreviewPosition={seekPreviewPosition}
          isAtLiveEdge={isAtLiveEdge}
          progressBarRef={progressBarRef}
          progressPanResponder={progressPanResponder}
          onGoBack={() => handleGoBack()}
          onTogglePlayPause={togglePlayPause}
          onToggleMute={toggleMute}
          onSeekBackward={seekBackward}
          onSeekForward={seekForward}
          onOpenSourceModal={() => openChangeSourceModal(isInitialLoading)}
          onToggleEpisodes={toggleEpisodesModal}
          onToggleSubtitles={toggleSubtitlesModal}
          subtitlesEnabled={subtitlesEnabled}
          selectedLanguage={selectedLanguage}
          isChangingSource={isChangingSource}
          isInitialLoading={isInitialLoading}
          videoUrl={videoUrl}
          player={player}
          brightnessLevel={brightnessLevel}
          hasBrightnessPermission={hasBrightnessPermission}
          brightnessSliderRef={brightnessSliderRef}
          brightnessPanResponder={brightnessPanResponder}
        />

        {!isLiveStream && isSeeking && seekPreviewPosition !== null && seekPreviewXPosition > 0 && (
          <View style={[styles.seekPreviewBox, { left: Math.max(10, Math.min(seekPreviewXPosition - 40, screenDimensions.width - 90)) }]}>
            <Text style={styles.seekPreviewText}>{formatTime(seekPreviewPosition)}</Text>
          </View>
        )}

        <NextEpisodeButton
          showNextEpisodeButton={showNextEpisodeButton}
          nextEpisodeDetails={nextEpisodeDetailsRef.current}
          position={position}
          duration={duration}
          opacityAnim={opacityAnim}
          onPress={playNextEpisode}
        />

        {mediaType === 'tv' && (
          <EpisodesModal
            visible={showEpisodesModal}
            onClose={() => setShowEpisodesModal(false)}
            title={title}
            allSeasonsData={allSeasonsData}
            selectedSeasonForModal={selectedSeasonForModal}
            episodesForModal={episodesForModal}
            isLoadingModalEpisodes={isLoadingModalEpisodes}
            currentSeason={season}
            currentEpisode={episode}
            onSelectSeason={handleSelectSeasonForModal}
            onSelectEpisode={(episodeDetails) => {
              setIsUnmounting(true);
              if (player) player.pause();
              navigation.replace('VideoPlayer', episodeDetails);
            }}
            seasonListRef={seasonListModalRef}
            episodeListRef={episodeListModalRef}
            mediaId={mediaId}
            poster_path={poster_path}
          />
        )}

        <BufferingAlertModal
          visible={showBufferingAlert}
          onKeepBuffering={handleKeepBuffering}
          onRetryExtraction={handleRetryExtraction}
        />

        <SourceSelectionModal
          visible={showSourceSelectionModal}
          onClose={() => closeSourceModal(isUnmounting)}
          sources={availableSourcesList}
          onSelectSource={(source) => handleSelectSourceFromModal(source, position, isUnmounting, setShowControls)}
          currentAttemptStatus={sourceAttemptStatus}
          currentPlayingSourceName={currentPlayingSourceName}
        />

        <SubtitlesModal
          visible={showSubtitlesModal}
          onClose={() => {
            setShowSubtitlesModal(false);
            ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
              .catch(e => console.error("Failed to re-lock to LANDSCAPE on SubtitlesModal direct close:", e));
          }}
          availableLanguages={Object.values(availableLanguages || {}).map(langInfo => ({
            code: langInfo.language,
            name: getLanguageName(langInfo.language)
          }))}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={(langCode) => {
            selectSubtitle(langCode);
            setShowSubtitlesModal(false);
          }}
          loading={loadingSubtitles}
        />
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  gestureHandlerRoot: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000' },
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    zIndex: -1,
    top: -1000,
    left: -1000,
  },
  visibleWebViewForCaptcha: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    height: '40%',
    backgroundColor: 'white',
    zIndex: 100,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  video: { flex: 1, backgroundColor: '#000' },
  bufferingIndicatorContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -18 }, { translateY: -18 }],
    zIndex: 4,
  },
  seekPreviewBox: {
    position: 'absolute',
    bottom: 70,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  seekPreviewText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default VideoPlayerScreen;
