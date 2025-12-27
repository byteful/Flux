import { useState, useCallback } from 'react';
import { extractM3U8Stream, extractStreamFromSpecificSource } from '../utils/streamExtractor';
import { extractLiveStreamM3U8 } from '../api/streameastApi';
import { getActiveStreamSources } from '../api/vidsrcApi';
import {
  getCachedStreamUrl,
  saveStreamUrl,
  clearSpecificStreamFromCache,
} from '../utils/storage';
import { buildStreamHeaders } from '../utils/streamHeaders';
import { isFutureDate } from '../utils/timeUtils';
import downloadManager from '../services/downloadManager';
import { generateDownloadId, getDownloadEntry, DOWNLOAD_STATUS } from '../utils/downloadStorage';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const getBufferOptions = () => ({
  preferredForwardBufferDuration: 3600,
  maxBufferBytes: null,
  minBufferForPlayback: 2,
  prioritizeTimeOverSizeThreshold: true,
  waitsToMinimizeStalling: false,
});

export const useStreamExtraction = ({
  mediaId,
  mediaType,
  season,
  episode,
  episodeTitle,
  title,
  currentEpisodeAirDate,
  isLive,
  streameastUrl,
  isOffline,
  offlineFilePath,
  player,
  contentId,
  onStreamReady,
  onError,
  onFindSubtitles,
  setAutoPlayEnabled,
  loadAutoPlaySetting,
  loadSubtitlePreference,
  checkSavedProgress,
}) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [streamReferer, setStreamReferer] = useState(null);
  const [streamExtractionComplete, setStreamExtractionComplete] = useState(false);
  const [currentWebViewConfig, setCurrentWebViewConfig] = useState(null);
  const [currentSourceAttemptKey, setCurrentSourceAttemptKey] = useState('initial');
  const [currentAttemptingSource, setCurrentAttemptingSource] = useState(null);
  const [currentPlayingSourceName, setCurrentPlayingSourceName] = useState(null);
  const [manualWebViewVisible, setManualWebViewVisible] = useState(false);
  const [captchaUrl, setCaptchaUrl] = useState(null);
  const [isChangingSource, setIsChangingSource] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [availableSourcesList, setAvailableSourcesList] = useState([]);
  const [sourceAttemptStatus, setSourceAttemptStatus] = useState({});
  const [showSourceSelectionModal, setShowSourceSelectionModal] = useState(false);

  const getStreamHeaders = useCallback(() => {
    return buildStreamHeaders(videoUrl, streamReferer);
  }, [videoUrl, streamReferer]);

  const setupLiveStreamExtraction = useCallback((isMountedRef) => {
    if (!isMountedRef.current) return;
    setCurrentAttemptingSource('StreamEast');

    extractLiveStreamM3U8(
      streameastUrl,
      (streamUrl, referer, sourceName) => {
        if (!isMountedRef.current || streamExtractionComplete) {
          return;
        }
        setVideoUrl(streamUrl);
        setStreamReferer(referer);
        setCurrentPlayingSourceName(sourceName);
        setStreamExtractionComplete(true);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
        setCurrentWebViewConfig(null);
        setCurrentAttemptingSource(null);
        setIsLiveStream(true);
        player.replaceAsync({ 
          uri: streamUrl, 
          headers: buildStreamHeaders(streamUrl, null),
          bufferOptions: getBufferOptions(),
        });
      },
      (err, sourceName) => {
        if (!isMountedRef.current) return;
        console.error(`[useStreamExtraction] Live stream extraction error from ${sourceName}:`, err.message);
        onError({
          message: 'Failed to load live stream. The stream may have ended or is no longer available.',
          isLiveStreamError: true
        });
        setStreamExtractionComplete(true);
        setCurrentAttemptingSource(null);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
        setCurrentWebViewConfig(null);
      },
      (urlForCaptcha) => {
        if (!isMountedRef.current) return;
        setCaptchaUrl(urlForCaptcha);
        setManualWebViewVisible(true);
      },
      (configForAttempt, sourceName, key) => {
        if (!isMountedRef.current) return;
        setCurrentAttemptingSource(sourceName);
        setCurrentWebViewConfig(configForAttempt);
        setCurrentSourceAttemptKey(key);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
      }
    );
  }, [streameastUrl, player, streamExtractionComplete, onError]);

  const setupStreamExtraction = useCallback((isMountedRef) => {
    if (!isMountedRef.current) return;
    setCurrentAttemptingSource(null);

    extractM3U8Stream(
      mediaId, mediaType, season, episode,
      (streamUrl, referer, sourceName) => {
        if (!isMountedRef.current || streamExtractionComplete) {
          return;
        }
        saveStreamUrl(contentId, streamUrl, referer, sourceName);
        setVideoUrl(streamUrl);
        setStreamReferer(referer);
        setCurrentPlayingSourceName(sourceName);
        setStreamExtractionComplete(true);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
        setCurrentWebViewConfig(null);
        setCurrentAttemptingSource(null);
        player.replaceAsync({ 
          uri: streamUrl, 
          headers: buildStreamHeaders(streamUrl, referer),
          bufferOptions: getBufferOptions(),
        });
        if (onFindSubtitles) onFindSubtitles();
      },
      (err, sourceName) => {
        if (!isMountedRef.current) return;
        console.warn(`[useStreamExtraction] Error from source ${sourceName}: ${err.message}`);
      },
      (finalError) => {
        if (!isMountedRef.current) return;

        if (currentEpisodeAirDate && isFutureDate(currentEpisodeAirDate)) {
          const formattedAirDate = new Date(currentEpisodeAirDate).toLocaleDateString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric'
          });
          onError({
            message: `This episode (${episodeTitle || `S${season}E${episode}`}) is scheduled to air on ${formattedAirDate}. Streaming sources are typically unavailable until after the air date.`,
            isUnreleased: true
          });
        } else {
          onError({ message: `All sources failed: ${finalError.message || 'Could not find a playable stream.'}` });
        }
        setStreamExtractionComplete(true);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
        setCurrentWebViewConfig(null);
        setCurrentAttemptingSource(null);
      },
      (urlForCaptcha) => {
        if (!isMountedRef.current) return;
        setCaptchaUrl(urlForCaptcha);
        setManualWebViewVisible(true);
      },
      (configForAttempt, sourceName, key) => {
        if (!isMountedRef.current) return;
        setCurrentAttemptingSource(sourceName);
        setCurrentWebViewConfig(configForAttempt);
        setCurrentSourceAttemptKey(key);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
      },
      title
    );
  }, [mediaId, mediaType, season, episode, title, episodeTitle, contentId, player, currentEpisodeAirDate, streamExtractionComplete, onError, onFindSubtitles]);

  const initializePlayer = useCallback(async (isMountedRef) => {
    if (isLive) {
      setIsLiveStream(true);
      if (isMountedRef.current) {
        setupLiveStreamExtraction(isMountedRef);
      }
      return;
    }

    if (isOffline && offlineFilePath) {
      const normalizedPath = offlineFilePath.startsWith('file://')
        ? offlineFilePath
        : `file://${offlineFilePath}`;

      const pathForCheck = normalizedPath.replace('file://', '');
      const fileInfo = await LegacyFileSystem.getInfoAsync(pathForCheck);

      if (fileInfo.exists) {
        if (checkSavedProgress) await checkSavedProgress();
        if (loadAutoPlaySetting) {
          const isAutoPlayEnabled = await loadAutoPlaySetting();
          if (isMountedRef.current && setAutoPlayEnabled) setAutoPlayEnabled(isAutoPlayEnabled);
        }

        setVideoUrl(normalizedPath);
        setCurrentPlayingSourceName('Downloads');
        setStreamExtractionComplete(true);

        const isHLS = normalizedPath.endsWith('.m3u8');

        try {
          await player.replaceAsync({
            uri: normalizedPath,
            contentType: isHLS ? 'hls' : 'progressive',
            bufferOptions: getBufferOptions(),
          });
        } catch (playerErr) {
          console.error('[useStreamExtraction] Offline playback error:', playerErr.message);
        }

        const downloadId = generateDownloadId(mediaType, mediaId, season, episode);
        downloadManager.markAsWatched(downloadId);
        return;
      } else {
        const downloadId = generateDownloadId(mediaType, mediaId, season, episode);
        try {
          await downloadManager.cancelDownload(downloadId);
        } catch (cleanupErr) {
          console.warn('[useStreamExtraction] Failed to clean up missing download entry:', cleanupErr);
        }
      }
    }

    const downloadId = generateDownloadId(mediaType, mediaId, season, episode);
    const downloadEntry = await getDownloadEntry(downloadId);
    const hasDownload = downloadEntry?.status === DOWNLOAD_STATUS.COMPLETED;

    if (hasDownload && downloadEntry.filePath) {
      let videoFilePath = null;
      
      try {
        const pathToCheck = downloadEntry.filePath.replace('file://', '');
        const fileInfo = await LegacyFileSystem.getInfoAsync(pathToCheck);
        
        if (fileInfo.exists) {
          if (fileInfo.isDirectory) {
            const files = await LegacyFileSystem.readDirectoryAsync(pathToCheck);
            const videoFile = files.find(file => 
              file.endsWith('.mp4') || file.endsWith('.m3u8')
            );
            
            if (videoFile) {
              videoFilePath = downloadEntry.filePath.endsWith('/') 
                ? `${downloadEntry.filePath}${videoFile}`
                : `${downloadEntry.filePath}/${videoFile}`;
            }
          } else {
            videoFilePath = downloadEntry.filePath;
          }
        }
      } catch (err) {
        console.warn('[useStreamExtraction] Error checking download:', err);
      }

      if (videoFilePath) {
        const normalizedPath = videoFilePath.startsWith('file://')
          ? videoFilePath
          : `file://${videoFilePath}`;

        if (checkSavedProgress) await checkSavedProgress();
        if (loadAutoPlaySetting) {
          const isAutoPlayEnabled = await loadAutoPlaySetting();
          if (isMountedRef.current && setAutoPlayEnabled) setAutoPlayEnabled(isAutoPlayEnabled);
        }

        setVideoUrl(normalizedPath);
        setCurrentPlayingSourceName('Downloads');
        setStreamExtractionComplete(true);

        const isHLS = normalizedPath.endsWith('.m3u8');

        try {
          await player.replaceAsync({
            uri: normalizedPath,
            contentType: isHLS ? 'hls' : 'progressive',
            bufferOptions: getBufferOptions(),
          });
        } catch (playerErr) {
          console.error('[useStreamExtraction] Downloaded file playback error:', playerErr.message);
        }

        downloadManager.markAsWatched(downloadId);
        return;
      }
    }

    if (checkSavedProgress) await checkSavedProgress();

    if (loadAutoPlaySetting) {
      const isAutoPlayEnabled = await loadAutoPlaySetting();
      if (isMountedRef.current && setAutoPlayEnabled) setAutoPlayEnabled(isAutoPlayEnabled);
    }

    if (loadSubtitlePreference) {
      await loadSubtitlePreference();
    }

    const cachedStreamData = await getCachedStreamUrl(contentId);
    if (cachedStreamData && cachedStreamData.url && isMountedRef.current) {
      setVideoUrl(cachedStreamData.url);
      setStreamReferer(cachedStreamData.referer);
      setCurrentPlayingSourceName(cachedStreamData.sourceName);
      setStreamExtractionComplete(true);
      player.replaceAsync({ 
        uri: cachedStreamData.url, 
        headers: buildStreamHeaders(cachedStreamData.url, cachedStreamData.referer),
        bufferOptions: getBufferOptions(),
      });
      if (onFindSubtitles) onFindSubtitles();
    } else if (isMountedRef.current) {
      setupStreamExtraction(isMountedRef);
    }
  }, [isLive, isOffline, offlineFilePath, player, mediaType, mediaId, season, episode, contentId, checkSavedProgress, loadAutoPlaySetting, setAutoPlayEnabled, loadSubtitlePreference, onFindSubtitles, setupLiveStreamExtraction, setupStreamExtraction]);

  const openChangeSourceModal = useCallback(async (isInitialLoading) => {
    if (isInitialLoading || !player) return;

    if (player.isPlaying) {
      try {
        await player.pause();
      } catch (e) { console.warn("Error pausing video before opening source modal:", e); }
    }

    const sources = getActiveStreamSources();
    
    const downloadId = generateDownloadId(mediaType, mediaId, season, episode);
    const downloadEntry = await getDownloadEntry(downloadId);
    const hasDownload = downloadEntry?.status === DOWNLOAD_STATUS.COMPLETED;

    let allSources = [...sources];
    let downloadsSourceAdded = false;
    
    if (isOffline && offlineFilePath) {
      allSources = [
        {
          name: 'Downloads',
          isDownload: true,
          filePath: offlineFilePath,
        },
        ...sources
      ];
      downloadsSourceAdded = true;
    } else if (hasDownload && downloadEntry.filePath) {
      let videoFilePath = null;
      
      try {
        const pathToCheck = downloadEntry.filePath.replace('file://', '');
        const fileInfo = await LegacyFileSystem.getInfoAsync(pathToCheck);
        
        if (fileInfo.exists) {
          if (fileInfo.isDirectory) {
            const files = await LegacyFileSystem.readDirectoryAsync(pathToCheck);
            const videoFile = files.find(file => 
              file.endsWith('.mp4') || file.endsWith('.m3u8')
            );
            
            if (videoFile) {
              videoFilePath = downloadEntry.filePath.endsWith('/') 
                ? `${downloadEntry.filePath}${videoFile}`
                : `${downloadEntry.filePath}/${videoFile}`;
            }
          } else {
            videoFilePath = downloadEntry.filePath;
          }
        }
      } catch (err) {
        console.warn('[useStreamExtraction] Error checking download for modal:', err);
      }

      if (videoFilePath) {
        allSources = [
          {
            name: 'Downloads',
            isDownload: true,
            filePath: videoFilePath,
          },
          ...sources
        ];
        downloadsSourceAdded = true;
      }
    }

    setAvailableSourcesList(allSources);

    const initialStatus = {};
    allSources.forEach(s => { initialStatus[s.name] = 'idle'; });
    setSourceAttemptStatus(initialStatus);

    setShowSourceSelectionModal(true);
  }, [player, mediaType, mediaId, season, episode, isOffline, offlineFilePath]);

  const handleSelectSourceFromModal = useCallback(async (selectedSourceInfo, position, isUnmounting, setShowControls) => {
    if (isChangingSource || !player) return;

    setIsChangingSource(true);
    setSourceAttemptStatus(prev => ({ ...prev, [selectedSourceInfo.name]: 'loading' }));

    const currentPositionToResume = player.currentTime || position || 0;

    if (player.isPlaying) {
      try {
        await player.pause();
      } catch (e) { console.warn("Error pausing video on source select:", e); }
    }

    if (selectedSourceInfo.isDownload && selectedSourceInfo.filePath) {
      const normalizedPath = selectedSourceInfo.filePath.startsWith('file://')
        ? selectedSourceInfo.filePath
        : `file://${selectedSourceInfo.filePath}`;

      setVideoUrl(normalizedPath);
      setCurrentPlayingSourceName('Downloads');
      setStreamExtractionComplete(true);
      setStreamReferer(null);

      const isHLS = normalizedPath.endsWith('.m3u8');

      try {
        await player.replaceAsync({
          uri: normalizedPath,
          contentType: isHLS ? 'hls' : 'progressive',
          bufferOptions: getBufferOptions(),
        });
        
        setTimeout(() => {
          if (player && currentPositionToResume > 0) {
            player.currentTime = currentPositionToResume;
          }
        }, 500);

        const downloadId = generateDownloadId(mediaType, mediaId, season, episode);
        downloadManager.markAsWatched(downloadId);

        setSourceAttemptStatus(prev => ({ ...prev, [selectedSourceInfo.name]: 'success' }));
        setIsChangingSource(false);
        setShowSourceSelectionModal(false);
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
        setCurrentWebViewConfig(null);
        setCurrentAttemptingSource(null);
        onError(null);
      } catch (playerErr) {
        console.error('[useStreamExtraction] Downloaded file playback error:', playerErr.message);
        setSourceAttemptStatus(prev => ({ ...prev, [selectedSourceInfo.name]: 'failed' }));
        setIsChangingSource(false);
      }
      
      return;
    }

    if (contentId) {
      await clearSpecificStreamFromCache(contentId);
    }

    onError(null);
    setStreamExtractionComplete(false);
    setCurrentWebViewConfig(null);
    setCurrentSourceAttemptKey(`specific-source-${selectedSourceInfo.name}-${Date.now()}`);
    setCurrentAttemptingSource(selectedSourceInfo.name);
    setManualWebViewVisible(false);
    setCaptchaUrl(null);

    const onStreamFound = (streamUrl, referer, sourceName) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'failed' }));
        return;
      }

      saveStreamUrl(contentId, streamUrl, referer, sourceName);

      setStreamReferer(referer);
      setCurrentPlayingSourceName(sourceName);
      setVideoUrl(streamUrl);
      setStreamExtractionComplete(true);
      player.replaceAsync({ 
        uri: streamUrl, 
        headers: buildStreamHeaders(streamUrl, referer),
        bufferOptions: getBufferOptions(),
      });
      setTimeout(() => {
        if (player && currentPositionToResume > 0) {
          player.currentTime = currentPositionToResume;
        }
      }, 500);
      setManualWebViewVisible(false);
      setCaptchaUrl(null);
      setCurrentWebViewConfig(null);
      setCurrentAttemptingSource(null);
      onError(null);
      setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'success' }));
      setIsChangingSource(false);
      setShowSourceSelectionModal(false);
    };

    const onSourceErrorCallback = (err, sourceName) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      console.warn(`[useStreamExtraction] SpecificSource: Error from source ${sourceName}: ${err.message}`);
      setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'failed' }));
      if (manualWebViewVisible) {
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
      }
      setCurrentWebViewConfig(null);
      setCurrentAttemptingSource(null);
      setIsChangingSource(false);
    };

    const provideWebViewConfigForAttempt = (configForAttempt, sourceName, key) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      setCurrentAttemptingSource(sourceName);
      setCurrentWebViewConfig(configForAttempt);
      setCurrentSourceAttemptKey(key);
      setManualWebViewVisible(false);
      setCaptchaUrl(null);
    };

    const onManualInterventionRequired = (urlForCaptcha) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      setCaptchaUrl(urlForCaptcha);
      setManualWebViewVisible(true);
    };

    extractStreamFromSpecificSource(
      selectedSourceInfo,
      mediaId, mediaType, season, episode,
      onStreamFound,
      onSourceErrorCallback,
      onManualInterventionRequired,
      provideWebViewConfigForAttempt,
      title
    );
  }, [player, contentId, mediaId, mediaType, season, episode, title, isChangingSource, manualWebViewVisible, onError]);

  const closeSourceModal = useCallback((isUnmounting) => {
    setShowSourceSelectionModal(false);
    if (isChangingSource) {
      setIsChangingSource(false);
      setManualWebViewVisible(false);
      setCaptchaUrl(null);
      setCurrentWebViewConfig(null);
    }
  }, [isChangingSource]);

  const reset = useCallback(() => {
    setStreamExtractionComplete(false);
    setVideoUrl(null);
    setCurrentWebViewConfig(null);
    setCurrentSourceAttemptKey(`reload-${Date.now()}`);
    setCurrentAttemptingSource(null);
    setManualWebViewVisible(false);
    setCaptchaUrl(null);
  }, []);

  return {
    videoUrl,
    streamReferer,
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
    setVideoUrl,
    setStreamExtractionComplete,
    setManualWebViewVisible,
    setCaptchaUrl,
    setShowSourceSelectionModal,
    setIsLiveStream,
    getStreamHeaders,
    initializePlayer,
    openChangeSourceModal,
    handleSelectSourceFromModal,
    closeSourceModal,
    reset,
  };
};
