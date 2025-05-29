import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler, Text, TouchableOpacity, Platform, PanResponder, Animated, Easing, Modal, FlatList, Dimensions, AppState, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer, RemotePlaybackButton } from 'expo-video';
import { WebView } from 'react-native-webview';
import { fetchTVShowDetails, fetchSeasonDetails } from '../api/tmdbApi';
import { saveWatchProgress, getWatchProgress, getCachedStreamUrl, saveStreamUrl, getAutoPlaySetting, getEpisodeWatchProgress } from '../utils/storage';
import { extractM3U8Stream } from '../utils/streamExtractor';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import parseSrt from 'parse-srt';
import { searchSubtitles, downloadSubtitle } from '../api/opensubtitlesApi';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

// Constants for auto-play
const VIDEO_END_THRESHOLD_SECONDS = 45; // Show button 45 secs before end

const VideoPlayerScreen = ({ route }) => {
  const navigation = useNavigation(); // Use hook for navigation access
  const navigationRef = useRef(navigation);
  const progressBarRef = useRef(null);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const nextEpisodeDetailsRef = useRef(null); // Ref to store next episode details
  const episodesModalOrientationListenerRef = useRef(null); // Ref for the modal's orientation listener
  const lastPositionRef = useRef(0); // Ref for manual end detection
  const lastPositionTimeRef = useRef(0); // Ref for manual end detection
  const manualFinishTriggeredRef = useRef(false); // Ref for manual end detection flag

  const {
    mediaId,
    mediaType,
    season,
    episode,
    title,
    episodeTitle,
    poster_path // Ensure poster_path is passed for next episode data
  } = route.params;

  // --- Pinch to Zoom States ---
  const [isZoomed, setIsZoomed] = useState(false); // Restored original setter
  const [videoNaturalSize, setVideoNaturalSize] = useState(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));
  const animatedScale = useRef(new Animated.Value(1)).current;
  // --- End Pinch to Zoom States ---

  // ... existing states ...
  const [loading, setLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamExtractionComplete, setStreamExtractionComplete] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoUrl, setVideoUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [resumeTime, setResumeTime] = useState(0);
  const controlsTimerRef = useRef(null); // Use ref for timer ID
  const [webViewConfig, setWebViewConfig] = useState(null);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [isUnmounting, setIsUnmounting] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewPosition, setSeekPreviewPosition] = useState(null);
  const [manualWebViewVisible, setManualWebViewVisible] = useState(false); // For CAPTCHA
  const [captchaUrl, setCaptchaUrl] = useState(null); // To store URL for visible WebView

  // --- New Auto-Play States ---
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [showNextEpisodeButton, setShowNextEpisodeButton] = useState(false);
  const [isFindingNextEpisode, setIsFindingNextEpisode] = useState(false); // Prevent multiple fetches
  // --- End New Auto-Play States ---

  // --- Subtitle States ---
  const [availableLanguages, setAvailableLanguages] = useState({}); // Stores { langCode: bestSubtitleInfo }
  const [selectedLanguage, setSelectedLanguage] = useState(null); // Stores selected language code ('en', 'es', etc.) or null
  const [parsedSubtitles, setParsedSubtitles] = useState([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');
  const [showSubtitleSelection, setShowSubtitleSelection] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false); // Default to disabled
  const [loadingSubtitles, setLoadingSubtitles] = useState(false);
  // --- End Subtitle States ---

  // --- Episodes Viewer Modal States ---
  const [showEpisodesModal, setShowEpisodesModal] = useState(false);
  const [allSeasonsData, setAllSeasonsData] = useState([]); // Stores [{ season_number, name, episode_count, episodes: [] }]
  const [selectedSeasonForModal, setSelectedSeasonForModal] = useState(null); // Stores season_number
  const [episodesForModal, setEpisodesForModal] = useState([]); // Stores episodes of the selectedSeasonForModal
  const [isLoadingModalEpisodes, setIsLoadingModalEpisodes] = useState(false);
  const [modalEpisodeProgress, setModalEpisodeProgress] = useState({}); // { 'sX_eY': { position, duration } }
  // --- End Episodes Viewer Modal States ---

  // Effect to manage screen orientation when episodes modal is shown/hidden
  useEffect(() => {
    const handleOrientationChange = async (event) => {
      const currentOrientation = event.orientationInfo.orientation;
      // Check if it's one of the portrait orientations (numeric values vary by platform/expo version)
      // ScreenOrientation.Orientation.PORTRAIT_UP, ScreenOrientation.Orientation.PORTRAIT_DOWN
      // A simpler check might be if it's NOT landscape
      if (
        currentOrientation !== ScreenOrientation.Orientation.LANDSCAPE_LEFT &&
        currentOrientation !== ScreenOrientation.Orientation.LANDSCAPE_RIGHT
      ) {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch (e) {
          console.error("Episodes Modal: Failed to re-lock to LANDSCAPE on orientation change:", e);
        }
      }
    };

    if (showEpisodesModal) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        .catch(e => console.error("Episodes Modal: Failed initial lock to LANDSCAPE:", e));

      if (!episodesModalOrientationListenerRef.current) {
        episodesModalOrientationListenerRef.current = ScreenOrientation.addOrientationChangeListener(handleOrientationChange);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          .catch(e => console.error("Episodes Modal: Failed aggressive re-lock post-listener add:", e));
      }
    } else {
      if (episodesModalOrientationListenerRef.current) {
        ScreenOrientation.removeOrientationChangeListener(episodesModalOrientationListenerRef.current);
        episodesModalOrientationListenerRef.current = null;
      }
    }

    return () => {
      if (episodesModalOrientationListenerRef.current) {
        ScreenOrientation.removeOrientationChangeListener(episodesModalOrientationListenerRef.current);
        episodesModalOrientationListenerRef.current = null;
      }
    };
  }, [showEpisodesModal]);
  
  const logSetShowControls = useCallback((value) => {
    setShowControls(value);
  }, [setShowControls]);

  const getStreamHeaders = () => {
    // ... (keep existing headers function)
    const headers = {
      'Referer': 'https://vidsrc.su/',
      'Origin': 'https://vidsrc.su',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    return headers;
  };

  const player = useVideoPlayer({
    headers: getStreamHeaders(),
    uri: videoUrl,
    metadata: {
      title: episodeTitle || title
    }
  });

  useEffect(() => {
    if (player && videoUrl) {
      if (showControls) {
        player.timeUpdateEventInterval = 1;
      } else {
        player.timeUpdateEventInterval = 1000;
      }
    }
  }, [player, videoUrl, showControls]);

  const contentId = mediaType === 'tv'
    ? `tv-${mediaId}-s${season}-e${episode}`
    : `movie-${mediaId}`;


  // --- Animation and Controls Timer ---
  const startControlsTimer = useCallback(() => {
    // Clear previous timer using ref
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }

    // Set new timer using ref
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5000);
  }, [setShowControls]); // Only depend on stable setter again
  useEffect(() => {
    if (showControls) {
      Animated.timing(opacityAnim, {
        toValue: 1,
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
      // Clear timer when controls are hidden externally
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    }
    // Cleanup effect: clear timer on unmount or when showControls changes
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [showControls, opacityAnim, startControlsTimer]);

  const toggleControls = () => {
    setShowControls(currentShowControls => !currentShowControls);
  };


  // --- Brightness Handling ---
  // ... (keep existing brightness logic) ...
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
        // It's important to read hasBrightnessPermission from its latest state.
        // Since hasBrightnessPermission is in the dependency array of this useEffect,
        // this function will be recreated if hasBrightnessPermission changes.
        // However, to be absolutely sure we have the latest value if the permission
        // was granted *after* this effect initially ran but *before* app state changed,
        // we could re-check permission here or rely on the effect's dependencies.
        // For now, relying on the dependency array.
        if (hasBrightnessPermission) {
          try {
            const currentBrightness = await Brightness.getSystemBrightnessAsync();
            setBrightnessLevel(currentBrightness); // Update our UI
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
  }, [hasBrightnessPermission]); // Re-run if hasBrightnessPermission changes

  const handleBrightnessChange = async (value) => {
    if (!hasBrightnessPermission) return;
    setBrightnessLevel(value);
    await Brightness.setSystemBrightnessAsync(value);
    setShowControls(true); // Show controls and reset timer on interaction
  };


  const findNextEpisode = useCallback(async () => {
    if (mediaType !== 'tv' || isFindingNextEpisode || showNextEpisodeButton) {
      return;
    }
    setIsFindingNextEpisode(true);
    try {
      const showData = await fetchTVShowDetails(mediaId);
      if (!showData || !showData.seasons) {
        setIsFindingNextEpisode(false);
        return;
      }
      const validSeasons = showData.seasons.filter(s => s.season_number > 0 || showData.seasons.length === 1);
      if (validSeasons.length === 0) {
        setIsFindingNextEpisode(false);
        return;
      }
      const currentSeasonData = validSeasons.find(s => s.season_number === season);
      const currentSeasonIndex = validSeasons.findIndex(s => s.season_number === season);
      let nextEp = null;
      let nextSe = null;
      if (currentSeasonData && episode < currentSeasonData.episode_count) {
        nextSe = season;
        nextEp = episode + 1;
      } else if (currentSeasonIndex !== -1 && currentSeasonIndex < validSeasons.length - 1) {
        const nextSeasonData = validSeasons[currentSeasonIndex + 1];
        if (nextSeasonData && nextSeasonData.episode_count > 0 && nextSeasonData.season_number > 0) {
          nextSe = nextSeasonData.season_number;
          nextEp = 1;
        }
      }
      if (nextSe !== null && nextEp !== null) {
        let episodeName = `Episode ${nextEp}`;
        try {
          const nextSeasonFullDetails = await fetchSeasonDetails(mediaId, nextSe);
          const nextEpisodeData = nextSeasonFullDetails?.episodes?.find(e => e.episode_number === nextEp);
          if (nextEpisodeData?.name) {
            episodeName = nextEpisodeData.name;
          }
        } catch (fetchErr) {
          console.warn(`Could not fetch details for S${nextSe} E${nextEp} to get title:`, fetchErr);
        }
        const nextDetails = {
          mediaId: mediaId,
          mediaType: 'tv',
          season: nextSe,
          episode: nextEp,
          title: title,
          episodeTitle: episodeName,
          poster_path: poster_path,
        };
        nextEpisodeDetailsRef.current = nextDetails;
        setShowNextEpisodeButton(true);
      } else {
        nextEpisodeDetailsRef.current = null;
        setShowNextEpisodeButton(true);
      }
    } catch (err) {
      console.error("Error finding next episode:", err);
    } finally {
      setIsFindingNextEpisode(false);
    }
  }, [mediaId, mediaType, season, episode, title, poster_path, isFindingNextEpisode, showNextEpisodeButton, fetchSeasonDetails]);

  const playNextEpisode = useCallback(() => {
    const nextDetails = nextEpisodeDetailsRef.current;
    if (nextDetails) {
      setIsUnmounting(true);
      if (player) player.pause();
      navigation.replace('VideoPlayer', nextDetails);
    } else {
      handleGoBack(true);
    }
  }, [navigation, player, handleGoBack]);

  useEffect(() => {
    if (duration > 0 && position > 0 && (duration - position) < VIDEO_END_THRESHOLD_SECONDS) {
      if (!isFindingNextEpisode && !showNextEpisodeButton) {
        findNextEpisode();
      }
    }
  }, [position, duration, findNextEpisode, isFindingNextEpisode, showNextEpisodeButton]);


  // --- Subtitle Logic ---
  const findSubtitles = useCallback(async () => {
    if (!mediaId || loadingSubtitles) return;
    setLoadingSubtitles(true);
    setAvailableLanguages({});
    try {
      const results = await searchSubtitles(
        mediaId,
        'en',
        mediaType === 'tv' ? season : undefined,
        mediaType === 'tv' ? episode : undefined
      );
      const languages = {};
      results.forEach(sub => {
        const attr = sub.attributes;
        if (!attr || !attr.language || !attr.files || attr.files.length === 0) {
          return;
        }
        const lang = attr.language;
        const fileInfo = attr.files[0];
        const currentSub = {
          language: lang,
          file_id: fileInfo.file_id,
          release_name: attr.release,
          download_count: attr.download_count || 0,
          fps: attr.fps || -1
        };
        if (!languages[lang] || currentSub.download_count > languages[lang].download_count) {
          languages[lang] = currentSub;
        }
      });
      setAvailableLanguages(languages);
    } catch (err) {
      console.error("Error searching subtitles:", err);
    } finally {
      setLoadingSubtitles(false);
    }
  }, [mediaId, mediaType, season, episode, loadingSubtitles]);

  const selectSubtitle = useCallback(async (langCode) => {
    setShowSubtitleSelection(false);
    if (!langCode) {
      setParsedSubtitles([]);
      setSelectedLanguage(null);
      setCurrentSubtitleText('');
      setSubtitlesEnabled(false);
      return;
    }
    if (langCode === selectedLanguage) {
      setSubtitlesEnabled(true);
      return;
    }
    const bestSubtitleInfo = availableLanguages[langCode];
    if (!bestSubtitleInfo || !bestSubtitleInfo.file_id) {
      console.error(`Error: No valid subtitle file_id found for language: ${langCode}`);
      setLoadingSubtitles(false);
      return;
    }
    setLoadingSubtitles(true);
    setSelectedLanguage(langCode);
    setParsedSubtitles([]);
    setCurrentSubtitleText('');
    try {
      const srtContent = await downloadSubtitle(bestSubtitleInfo.file_id);
      if (srtContent) {
        const parsed = parseSrt(srtContent);
        const parsedWithSeconds = parsed.map(line => ({
          ...line,
          startSeconds: timeToSeconds(line.start),
          endSeconds: timeToSeconds(line.end),
        }));
        setParsedSubtitles(parsedWithSeconds);
        setSubtitlesEnabled(true);
      } else {
        console.warn("Failed to download subtitle content.");
        setSelectedLanguage(null);
        setSubtitlesEnabled(false);
      }
    } catch (err) {
      console.error("Error during subtitle download or parsing:", err);
      setSelectedLanguage(null);
      setSubtitlesEnabled(false);
    } finally {
      setLoadingSubtitles(false);
    }
  }, [selectedLanguage, availableLanguages]);

  // Helper to convert SRT time format (00:00:00,000) to seconds
  const timeToSeconds = (timeInput) => {
    // Check if input is already a number (assume seconds)
    if (typeof timeInput === 'number' && !isNaN(timeInput)) {
      return timeInput;
    }

    if (typeof timeInput !== 'string' || !timeInput) {
      return 0;
    }

    // Proceed with parsing if it's a string
    try {
      const timeString = timeInput; // Rename for clarity within this block
      const parts = timeString.split(':');
      if (parts.length !== 3) throw new Error('Invalid time format (parts)');
      const secondsAndMs = parts[2].split(',');
      if (secondsAndMs.length !== 2) throw new Error('Invalid time format (ms)');
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(secondsAndMs[0], 10);
      const milliseconds = parseInt(secondsAndMs[1], 10);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
        throw new Error('Invalid number parsed from string parts');
      }
      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    } catch (e) {
      console.error(`Error parsing time string "${timeInput}":`, e);
      return 0;
    }
  };

  const updateCurrentSubtitle = useCallback((currentPositionSeconds) => {
    if (!subtitlesEnabled || parsedSubtitles.length === 0) {
      if (currentSubtitleText !== '') setCurrentSubtitleText('');
      return;
    }

    const currentSub = parsedSubtitles.find(
      line => currentPositionSeconds >= line.startSeconds && currentPositionSeconds <= line.endSeconds
    );

    let newText = currentSub ? currentSub.text : '';

    // Clean HTML tags from the subtitle text
    if (newText) {
      // Replace <br> tags with newline characters
      newText = newText.replace(/<br\s*\/?>/gi, '\n');
      // Remove other common HTML tags (i, b, u, font)
      newText = newText.replace(/<\/?(i|b|u|font)[^>]*>/gi, '');
      // Trim whitespace
      newText = newText.trim();
    }

    if (newText !== currentSubtitleText) {
      setCurrentSubtitleText(newText);
    }
  }, [subtitlesEnabled, parsedSubtitles, currentSubtitleText]);

  const toggleSubtitles = () => {
    setSubtitlesEnabled(prev => !prev);
    setShowControls(true); // Keep controls visible
  };


  // --- End Subtitle Logic ---

  // --- Episodes Viewer Modal Logic ---
  const toggleEpisodesModal = async () => {
    if (!showEpisodesModal) {
      if (player && isPlaying) {
        try {
          player.pause();
        } catch (e) {
          console.error("Error pausing video on modal open:", e);
        }
      }
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.error("Failed to lock orientation or during delay before opening episodes modal:", e);
      }
      if (mediaType === 'tv') {
        fetchAllSeasonsAndEpisodes();
      }
      setShowEpisodesModal(true);
    } else {
      setShowEpisodesModal(false);
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.error("Failed to re-lock to LANDSCAPE on modal toggle-close (button):", e);
      }
    }
    setShowControls(true);
  };

  const fetchAllSeasonsAndEpisodes = async () => {
    if (mediaType !== 'tv' || !mediaId) return;
    setIsLoadingModalEpisodes(true);
    try {
      const showData = await fetchTVShowDetails(mediaId);
      if (showData && showData.seasons) {
        // Filter out "Specials" (season_number 0) unless it's the only season
        const validSeasons = showData.seasons.filter(s => s.season_number > 0 || showData.seasons.length === 1);
        
        const seasonsWithDetails = await Promise.all(
          validSeasons.map(async (s) => {
            const seasonDetail = await fetchSeasonDetails(mediaId, s.season_number);
            // Fetch watch progress for each episode in this season
            const episodesWithProgress = await Promise.all(
              (seasonDetail?.episodes || []).map(async (ep) => {
                const progress = await getEpisodeWatchProgress(mediaId, s.season_number, ep.episode_number);
                return { ...ep, watchProgress: progress };
              })
            );
            return { ...s, episodes: episodesWithProgress || [] };
          })
        );
        setAllSeasonsData(seasonsWithDetails);
        // Set the current season as initially selected in the modal
        const currentSeasonInModal = seasonsWithDetails.find(s => s.season_number === season);
        if (currentSeasonInModal) {
          setSelectedSeasonForModal(currentSeasonInModal.season_number);
          setEpisodesForModal(currentSeasonInModal.episodes);
        } else if (seasonsWithDetails.length > 0) {
          // Fallback to the first season if current is not found (e.g., specials only)
          setSelectedSeasonForModal(seasonsWithDetails[0].season_number);
          setEpisodesForModal(seasonsWithDetails[0].episodes);
        }
      }
    } catch (err) {
      console.error("Error fetching all seasons for modal:", err);
      // Optionally set an error state for the modal
    } finally {
      setIsLoadingModalEpisodes(false);
    }
  };

  const handleSelectSeasonForModal = async (selectedSeasonNumber) => {
    setSelectedSeasonForModal(selectedSeasonNumber);
    const seasonData = allSeasonsData.find(s => s.season_number === selectedSeasonNumber);
    if (seasonData) {
      // Check if episodes already have progress, if not, fetch them (or re-fetch)
      // This ensures progress is up-to-date if user watches an ep and reopens modal
      setIsLoadingModalEpisodes(true);
      const episodesWithProgress = await Promise.all(
        (seasonData.episodes || []).map(async (ep) => {
          const progress = await getEpisodeWatchProgress(mediaId, selectedSeasonNumber, ep.episode_number);
          return { ...ep, watchProgress: progress };
        })
      );
      setEpisodesForModal(episodesWithProgress);
      setIsLoadingModalEpisodes(false);
    } else {
      setEpisodesForModal([]);
    }
  };
  // --- End Episodes Viewer Modal Logic ---

  // --- Listener Handlers ---
  const lastSaveTimeRef = useRef(0);

  const handlePositionChange = (event) => {
    const currentEventTime = typeof event === 'number' ? event : event?.currentTime;
    if (typeof currentEventTime !== 'number' || isNaN(currentEventTime) || isSeeking) { // Ignore updates while seeking
      return;
    }
    setPosition(currentEventTime); // Update UI state

    const now = Date.now();

    // --- Manual End Detection Workaround ---
    if (duration > 0 && currentEventTime >= duration - 1.5 && !manualFinishTriggeredRef.current) { // Within last 1.5 seconds
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

    if (currentEventTime > 0 && now - lastSaveTimeRef.current > 5000) {
      saveProgress(currentEventTime);
      lastSaveTimeRef.current = now;
    }
    updateCurrentSubtitle(currentEventTime);
  };

  const handleDurationChange = (dur) => {
    // ... (keep existing duration logic) ...
    if (isUnmounting) return;
    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
      if (duration !== dur) {
        setDuration(dur);
      }
    }
  };
  // --- End Listener Handlers ---

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

  // --- Event Listeners using useEventListener ---
  // ... (keep existing listeners for statusChange, timeUpdate, playingChange, error) ...
  useEventListener(player, 'statusChange', (event) => {
    const status = event?.status ?? event; // Get status first

    if (isUnmounting) return;


    if (typeof status === 'object' && status !== null) {
      handleDurationChange(status.duration);
      if (status.isLoaded && !status.isBuffering) {
        if (loading) setLoading(false);
        if (isInitialLoading) setIsInitialLoading(false);
      } else if (status.isBuffering && !loading && isPlaying) {
        setLoading(true);
      }

      // Extract naturalSize for zoom calculations
      if (status.naturalSize) {
        const { width: nw, height: nh, orientation: no } = status.naturalSize;
        let newNaturalSize = { width: nw, height: nh };
        // Handle potential orientation mismatch in reported naturalSize
        if (no === 'landscape' && nw < nh) {
          newNaturalSize = { width: nh, height: nw };
        } else if (no === 'portrait' && nw > nh) {
          newNaturalSize = { width: nh, height: nw };
        }

        if (!videoNaturalSize || newNaturalSize.width !== videoNaturalSize.width || newNaturalSize.height !== videoNaturalSize.height) {
          setVideoNaturalSize(newNaturalSize);
        }
      }
      // --- End Auto-play on Finish ---
    } else if (typeof status === 'string') {
      if (status === 'readyToPlay') {
        if (loading) setLoading(false);
        if (isInitialLoading) setIsInitialLoading(false);
        if (player) {
          const currentDuration = player.duration;
          handleDurationChange(currentDuration);
        }
      } else if (status === 'loading' && !loading && isPlaying) {
        setLoading(true);
      } else if (status === 'finished') {
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
      }
    }
  });

  useEventListener(player, 'timeUpdate', (event) => {
    handlePositionChange(event);
  });

  useEventListener(player, 'playingChange', (event) => {
    const currentIsPlaying = typeof event === 'boolean' ? event : event?.isPlaying;
    if (typeof currentIsPlaying === 'boolean') {
      setIsPlaying(currentIsPlaying);
      if (currentIsPlaying && duration === 0) {
        // ... (keep existing duration check logic) ...
        setTimeout(() => {
          if (player && !isUnmounting) {
            const currentDuration = player.duration;
            handleDurationChange(currentDuration);
          }
        }, 1000);
      }
    }
  });

  useEventListener(player, 'error', (error) => {
    if (isUnmounting) return;
    console.error('[useEventListener] Video playback error occurred:', error);
    setError({ message: 'Video playback error: ' + (error?.message || 'Unknown error') });
  });
  // --- End Event Listeners ---

  // --- Player Initialization and Source Replacement ---
  useEffect(() => {
    if (!player || !videoUrl || isUnmounting) return;

    setLoading(true);
    player.replace({ uri: videoUrl, headers: getStreamHeaders() });

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

  }, [player, videoUrl, resumeTime, isUnmounting]); // Keep dependencies
  // --- End Player Initialization ---

  // --- Main Setup Effect ---
  useEffect(() => {
    let isMounted = true;
    setIsUnmounting(false);

    const setOrientationAndHideUI = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.error("Failed to set orientation or hide UI:", e);
      }
    };

    const checkSavedProgress = async () => {
      // ... (keep existing progress loading logic) ...
      try {
        const progress = await getWatchProgress(mediaId);
        if (progress && progress.position && progress.season === season && progress.episode === episode) {
          // Avoid resuming too close to the end if auto-play will trigger
          if (!progress.duration || (progress.duration - progress.position > VIDEO_END_THRESHOLD_SECONDS * 1.5)) {
            setResumeTime(progress.position);
          }
        } else if (progress && progress.position && mediaType === 'movie') {
          setResumeTime(progress.position);
        }
      } catch (e) {
        console.error("Failed to load progress:", e);
      }
    };

    const setupStreamExtraction = () => {
      // ... (keep existing stream extraction setup) ...
      const config = extractM3U8Stream(
        mediaId, mediaType, season, episode,
        (streamUrl) => {
          if (!isMounted || streamExtractionComplete || videoUrl) return;
          const processedUrl = Platform.OS === 'ios' ? streamUrl.replace('http://', 'https://') : streamUrl;
          saveStreamUrl(contentId, processedUrl);
          setVideoUrl(processedUrl);
          setStreamExtractionComplete(true);
          setManualWebViewVisible(false);
          setCaptchaUrl(null);
        },
        (err) => {
          if (!isMounted) return;
          setError({ message: `Could not extract video stream: ${err.message}` });
          setStreamExtractionComplete(true);
          setLoading(false);
          setIsInitialLoading(false);
          setManualWebViewVisible(false);
          setCaptchaUrl(null);
        },
        (urlForCaptcha) => { // onManualInterventionRequired
          if (!isMounted) return;
          setCaptchaUrl(urlForCaptcha);
          setManualWebViewVisible(true);
        }
      );
      setWebViewConfig(config);
    };

    const initializePlayer = async () => {
      await setOrientationAndHideUI(); // Set orientation and hide UI first
      await checkSavedProgress();

      // Fetch auto-play setting
      const isEnabled = await getAutoPlaySetting();
      if (isMounted) {
        setAutoPlayEnabled(isEnabled);
      }

      // Check cache
      const cachedUrl = await getCachedStreamUrl(contentId);
      if (cachedUrl && isMounted) {
        setVideoUrl(cachedUrl);
        setStreamExtractionComplete(true);
      } else if (isMounted) {
        setupStreamExtraction();
      }

      // Find subtitles after getting media info
      // findSubtitles();
    };

    initializePlayer();
    setShowControls(true); // Show controls initially

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });

    // --- Cleanup ---
    return () => {
      isMounted = false;
      setIsUnmounting(true);
      try {
        saveProgress(position);
        if (player && typeof player.pause === 'function') {
          try {
            player.pause();
          } catch (pauseError) { }
        }
        backHandler.remove();

        // Clear timer ref on unmount
        if (controlsTimerRef.current) {
          clearTimeout(controlsTimerRef.current);
          controlsTimerRef.current = null;
        }
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, contentId, mediaId, mediaType, season, episode, retryAttempts, player]); // Added player
  // --- End Main Setup Effect ---

  // --- Save Progress ---
  const saveProgress = (currentTime) => {
    // Only save if not unmounting and time/duration are valid
    if (isUnmounting || !currentTime || !duration || duration <= 0) return;

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
        poster_path: poster_path, // Use route param poster_path
        season: season,
        episode: episode,
        lastWatched: new Date().toISOString(),
      };
      saveWatchProgress(mediaId, data);
    } catch (e) {
      console.error("Error saving progress:", e);
    }
  };
  // --- End Save Progress ---

  // --- Player Controls ---
  const togglePlayPause = async () => {
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
  };

  const seekBackward = async () => {
    try {
      if (player) {
        player.seekBy(-10);
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error seeking backward:', error);
    }
  };

  const seekForward = async () => {
    try {
      if (player) {
        player.seekBy(10);
      }
      setShowControls(true);
    } catch (error) {
      console.error('Error seeking forward:', error);
    }
  };
  // --- End Player Controls ---

  // --- Navigation ---
  const handleGoBack = useCallback((isEndOfSeries = false) => {
    if (isUnmounting) return;
    setIsUnmounting(true);
    try {
      if (!isEndOfSeries) {
        saveProgress(position);
      }
      if (player) {
        player.pause();
      }
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(() => { })
        .finally(() => {
          const navRef = navigationRef.current;
          if (!navRef) return;

          // Use a slight delay to allow orientation change to settle
          setTimeout(() => {
            try {
              if (navRef.canGoBack()) {
                navRef.goBack();
              } else {
                // If cannot go back (e.g., deep link), navigate to a default screen
                navRef.navigate('Home');
              }
            } catch (e) {
              console.error("Navigation error:", e);
              // Fallback navigation if goBack fails unexpectedly
              try { navRef.navigate('Home'); } catch (e2) { }
            }
          }, 300);
        });
    } catch (e) {
      console.error("Error in handleGoBack:", e);
      // Fallback navigation if main try block fails
      const navRef = navigationRef.current;
      if (!navRef) return;
      try { navRef.navigate('Home'); } catch (e2) { }
    }
  }, [isUnmounting, player, position, navigationRef]); // Adjusted dependencies

  const handleReload = async () => {
    setShowNextEpisodeButton(false);
    nextEpisodeDetailsRef.current = null;
    setIsFindingNextEpisode(false);
    setError(null);
    setLoading(true);
    setIsInitialLoading(true);
    setStreamExtractionComplete(false);
    setVideoUrl(null);
    setWebViewConfig(null);
    setManualWebViewVisible(false); // Reset CAPTCHA view on reload
    setCaptchaUrl(null);
    setResumeTime(0);
    setPosition(0);
    setDuration(0);
    lastPositionRef.current = 0; // Reset manual detection refs
    lastPositionTimeRef.current = 0;
    manualFinishTriggeredRef.current = false;
    setRetryAttempts(prevAttempts => prevAttempts + 1);
  };
  // --- End Navigation ---

  // --- Time Formatting ---
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const formattedMinutes = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    return hours > 0
      ? `${hours}:${formattedMinutes}:${formattedSeconds}`
      : `${formattedMinutes}:${formattedSeconds}`;
  };

  const formatRuntime = (minutes) => {
    if (!minutes || isNaN(minutes)) return '';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };
  // --- End Time Formatting ---

  // --- Seek Handling ---
  const updateSeekPreview = (nativeEvent) => {
    // ... (keep existing seek preview logic) ...
    if (!duration || !progressBarRef.current) return;
    progressBarRef.current.measure((x, y, width, height, pageX, pageY) => {
      let calculatedPosition = (nativeEvent.locationX / width) * duration;
      calculatedPosition = Math.max(0, Math.min(calculatedPosition, duration));
      if (!isNaN(calculatedPosition)) {
        setSeekPreviewPosition(calculatedPosition);
      }
    });
  };

  const progressPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      setIsSeeking(true);
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
    onPanResponderRelease: (evt, gestureState) => {
      const seekTarget = seekPreviewPosition; // Capture value before resetting
      setIsSeeking(false);
      setSeekPreviewPosition(null); // Reset preview immediately

      if (player && seekTarget !== null) {
        try {
          player.currentTime = seekTarget;
          // Manually update refs after seek to prevent false trigger
          lastPositionRef.current = seekTarget;
          lastPositionTimeRef.current = Date.now();
          // Reset manual trigger if seeking away from end
          if (duration > 0 && seekTarget < duration - 5) {
            manualFinishTriggeredRef.current = false;
          }

        } catch (e) {
          console.error('Error seeking player on release:', e);
        }
      }
      // Resume playback ONLY if it was playing before grant
      if (player && isPlaying) { // Check original isPlaying state before grant
        player.play();
      }
      setShowControls(true); // Reset controls timer
    }
  });
  // --- End Seek Handling ---

  const injectedJavaScript = `
    (function() { window.alert = function() {}; })();
  `;

  // --- Pinch to Zoom Logic ---
  const onLayoutRootView = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    if (screenDimensions.width !== width || screenDimensions.height !== height) {
      setScreenDimensions({ width, height });
    }
  }, [screenDimensions]);

  useEffect(() => {
    if (!videoNaturalSize || !screenDimensions) {
      if (!isZoomed) { // Ensure scale is 1 if not zoomed and info is missing
        Animated.timing(animatedScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
      return;
    }

    const { width: videoWidth, height: videoHeight } = videoNaturalSize;
    const { width: screenWidth, height: screenHeight } = screenDimensions;

    let targetScaleValue = 1;
    if (isZoomed) {
      if (videoWidth > 0 && videoHeight > 0 && screenWidth > 0 && screenHeight > 0) {
        const videoAspectRatio = videoWidth / videoHeight;
        const screenAspectRatio = screenWidth / screenHeight;

        // If aspect ratios are very similar, effectively no zoom needed for "fill"
        if (Math.abs(videoAspectRatio - screenAspectRatio) < 0.01) {
          targetScaleValue = 1;
        } else if (videoAspectRatio > screenAspectRatio) { // Video is wider than screen container
          targetScaleValue = (screenHeight / screenWidth) * videoAspectRatio;
        } else { // Video is narrower or same aspect ratio
          targetScaleValue = (screenWidth / screenHeight) / videoAspectRatio;
        }
        targetScaleValue = Math.max(1, targetScaleValue); // Ensure scale is at least 1
      } else {
        targetScaleValue = 1.5; // Fallback zoom scale
      }
    }

    Animated.timing(animatedScale, {
      toValue: targetScaleValue,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isZoomed, videoNaturalSize, screenDimensions, animatedScale]);

  // --- Combined Gestures for Tap and Pinch ---
  const tapToToggleControls = Gesture.Tap()
    .maxDuration(250) // Optional: to distinguish from long press, etc.
    .onEnd((_event, success) => {
      if (success) {
        runOnJS(toggleControls)(); // Ensure toggleControls (which calls setShowControls) runs on JS thread
      }
    });

  const pinchToZoom = Gesture.Pinch()
    .onEnd((event) => {
      if (event.scale > 1.1) { // Pinching outwards
        if (!isZoomed) {
          setIsZoomed(true);
        }
      } else if (event.scale < 0.9) { // Pinching inwards
        if (isZoomed) {
          setIsZoomed(false);
        }
      }
      // Ensure controls are visible and timer is reset after a pinch
      if (!showControls) {
        setShowControls(true); // This will also trigger startControlsTimer via useEffect
      } else {
        startControlsTimer(); // If controls already shown, just reset the timer
      }
    });

  // Use Gesture.Race to ensure only one gesture (tap or pinch) is active at a time.
  // Pinch typically involves more movement, so it might naturally win if both start.
  // If a simple tap occurs, tapToToggleControls will activate.
  // If a pinch occurs, pinchToZoom will activate.
  const videoAreaGestures = Gesture.Race(pinchToZoom, tapToToggleControls);
  // --- End Pinch to Zoom Logic ---

  // --- Render ---

  const renderSubtitleSelectionModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showSubtitleSelection}
      onRequestClose={async () => {
        setShowSubtitleSelection(false);
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch (e) {
          console.error("Failed to re-lock orientation after subtitle modal close:", e);
        }
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Subtitles</Text>
          {loadingSubtitles && <ActivityIndicator color="#fff" style={{ marginVertical: 10 }} />}
          <FlatList
            data={['None', ...Object.keys(availableLanguages).sort()]} // Add "None" option and sort languages
            keyExtractor={(item) => item}
            renderItem={({ item: langCode }) => (
              <TouchableOpacity
                style={[
                  styles.subtitleOption,
                  // Highlight if this language is selected OR if 'None' is selected and item is 'None'
                  (selectedLanguage === langCode || (selectedLanguage === null && langCode === 'None')) && styles.subtitleOptionSelected
                ]}
                onPress={() => selectSubtitle(langCode === 'None' ? null : langCode)} // Pass null for "None"
              >
                <Text style={styles.subtitleOptionText}>
                  {langCode}
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => !loadingSubtitles && <Text style={styles.noSubtitlesText}>No subtitle languages found.</Text>}
          />
          <TouchableOpacity style={styles.closeButton} onPress={() => setShowSubtitleSelection(false)}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

const renderEpisodesModal = () => {
  if (mediaType !== 'tv') return null;

  const renderEpisodeItem = ({ item: episodeData }) => {
    const progress = episodeData.watchProgress;
    let progressPercent = 0;
    if (progress && progress.duration > 0 && progress.position > 0) {
      progressPercent = (progress.position / progress.duration); // Value between 0 and 1
    }

    const episodePoster = episodeData.still_path
      ? `https://image.tmdb.org/t/p/w300${episodeData.still_path}`
      : null;

    const isCurrentEpisode = season === episodeData.season_number && episode === episodeData.episode_number;
    const runtimeString = formatRuntime(episodeData.runtime);

    return (
      <TouchableOpacity
        style={[styles.episodeItemHorizontal, isCurrentEpisode && styles.currentEpisodeItemHorizontal]}
        onPress={() => {
          if (isCurrentEpisode) {
            setShowEpisodesModal(false);
            return;
          }
          setIsUnmounting(true);
          if (player) player.pause();
          navigation.replace('VideoPlayer', {
            mediaId: mediaId,
            mediaType: 'tv',
            season: episodeData.season_number,
            episode: episodeData.episode_number,
            title: title,
            episodeTitle: episodeData.name,
            poster_path: poster_path,
          });
        }}
      >
        <View style={styles.episodeThumbnailContainerHorizontal}>
          {episodePoster ? (
            <Image source={{ uri: episodePoster }} style={styles.episodeThumbnailHorizontal} />
          ) : (
            <View style={[styles.episodeThumbnailHorizontal, styles.placeholderThumbnailHorizontal]}>
              <Ionicons name="image-outline" size={40} color="#555" />
            </View>
          )}
          {progressPercent > 0 && progressPercent < 1 && (
            <View style={styles.episodeProgressOverlayHorizontal}>
              <View style={[styles.episodeProgressBarHorizontal, { width: `${progressPercent * 100}%` }]} />
            </View>
          )}
          {progressPercent >= 1 && (
            <View style={styles.watchedOverlayHorizontal}>
              <Ionicons name="checkmark-circle" size={30} color="rgba(255, 255, 255, 0.9)" />
            </View>
          )}
        </View>
        <View style={styles.episodeDetailsHorizontal}>
          <Text style={styles.episodeTitleTextHorizontal} numberOfLines={2}>
            {`E${episodeData.episode_number}: ${episodeData.name || `Episode ${episodeData.episode_number}`}`}
          </Text>
          <Text style={styles.episodeOverviewTextHorizontal} numberOfLines={3}>
            {episodeData.overview || 'No overview available.'}
          </Text>
          {runtimeString && (
            <Text style={styles.episodeRuntimeTextHorizontal}>{runtimeString}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showEpisodesModal}
      presentationStyle="overFullScreen"
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onShow={async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch (e) {
          console.error("Episodes Modal onShow: Failed to lock orientation:", e);
        }
      }}
      onRequestClose={() => {
        setShowEpisodesModal(false);
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          .catch(e => console.error("Failed to re-lock orientation on episodes modal close:", e));
      }}
    >
      <View style={styles.episodesModalOverlay}>
        <View style={styles.episodesModalContent}>
          <View style={styles.episodesModalHeader}>
            <Text style={styles.episodesModalTitle}>{title} - Episodes</Text>
            <TouchableOpacity onPress={() => setShowEpisodesModal(false)} style={styles.episodesModalCloseButton}>
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {isLoadingModalEpisodes && !allSeasonsData.length ? (
            <ActivityIndicator size="large" color="#E50914" style={{ flex: 1 }} />
          ) : (
            <>
              {allSeasonsData.length > 1 && ( // Only show season tabs if more than one season
                <View style={styles.seasonSelectorContainer}>
                  <FlatList
                    horizontal
                    data={allSeasonsData.sort((a, b) => a.season_number - b.season_number)}
                    renderItem={({ item: seasonItem }) => (
                      <TouchableOpacity
                        style={[
                          styles.seasonTab,
                          selectedSeasonForModal === seasonItem.season_number && styles.seasonTabSelected,
                        ]}
                        onPress={() => handleSelectSeasonForModal(seasonItem.season_number)}
                      >
                        <Text style={styles.seasonTabText}>
                          {seasonItem.name || `Season ${seasonItem.season_number}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                    keyExtractor={(item) => `season-tab-${item.id || item.season_number}`}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.seasonTabContentContainer}
                  />
                </View>
              )}
              {isLoadingModalEpisodes && episodesForModal.length === 0 ? (
                  <View style={styles.centeredLoader}>
                    <ActivityIndicator size="large" color="#E50914" />
                  </View>
              ) : episodesForModal.length > 0 ? (
                <FlatList
                  horizontal // Changed to horizontal
                  data={episodesForModal.sort((a, b) => a.episode_number - b.episode_number)}
                  renderItem={renderEpisodeItem}
                  keyExtractor={(item) => `ep-${item.id || (item.season_number + '_' + item.episode_number)}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.episodesListContentHorizontal}
                  initialNumToRender={3}
                  maxToRenderPerBatch={5}
                  windowSize={7}
                />
              ) : (
                <View style={styles.centeredMessage}>
                  <Text style={styles.noEpisodesText}>No episodes found for this season.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

  const renderNextEpisodeButton = () => {
    if (!showNextEpisodeButton) return null;

    const nextDetails = nextEpisodeDetailsRef.current;
    const buttonText = nextDetails
      ? `Next: S${nextDetails.season} E${nextDetails.episode}`
      : "Back to Home";

    return (
      <Animated.View style={[styles.nextEpisodeContainer]}>
        <TouchableOpacity style={styles.nextEpisodeButton} onPress={playNextEpisode}>
          <Ionicons name={nextDetails ? "play-skip-forward" : "home"} size={20} color="white" style={styles.nextEpisodeIcon} />
          <Text style={styles.nextEpisodeText}>{buttonText}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <GestureHandlerRootView style={styles.gestureHandlerRoot}>
      <View style={styles.container} onLayout={onLayoutRootView}>
        <StatusBar hidden />

      {/* WebView for stream extraction / CAPTCHA */}
      {webViewConfig && !streamExtractionComplete && (
        <View style={manualWebViewVisible ? styles.visibleWebViewForCaptcha : styles.hiddenWebView}>
          <WebView
            // Key prop helps to re-mount WebView if URI changes significantly, might help with CAPTCHA state
            key={manualWebViewVisible ? captchaUrl : 'initial-hidden-webview'}
            source={manualWebViewVisible && captchaUrl ? { uri: captchaUrl, headers: webViewConfig.source.headers } : webViewConfig.source}
            injectedJavaScript={webViewConfig.injectedJavaScript}
            onMessage={webViewConfig.onMessage}
            // We need to ensure onError and onHttpError from webViewConfig are correctly passed
            // especially when the CAPTCHA view is active.
            // The webViewConfig contains the callbacks that eventually call setVideoUrl or setError.
            // If the user solves the CAPTCHA, the page should navigate, and our injectedJS should find the stream.
            // The original onMessage should then be triggered.
            onError={(syntheticEvent) => {
                // If CAPTCHA view is active, an error here might mean CAPTCHA itself failed to load
                if (manualWebViewVisible) {
                } else if (webViewConfig.onError) {
                    webViewConfig.onError(syntheticEvent);
                }
            }}
            onHttpError={(syntheticEvent) => {
                // If CAPTCHA view is active, an HTTP error might be part of CAPTCHA flow (e.g. submitting it)
                // or an issue with the CAPTCHA service.
                // We generally want the original onHttpError to fire if it's still a 403,
                // but if it's visible, the user is handling it.
                // The original onHttpError from streamExtractor is what triggers onManualInterventionRequired.
                // If it happens *again* while visible, it's a bit of a loop.
                if (manualWebViewVisible) {
                } else if (webViewConfig.onHttpError) {
                    webViewConfig.onHttpError(syntheticEvent);
                }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            mixedContentMode="compatibility"
            incognito={true}
            thirdPartyCookiesEnabled={false}
            onShouldStartLoadWithRequest={() => true}
            injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
          />
        </View>
      )}

      {/* Initial Loading */}
      {isInitialLoading && (
        <View style={styles.loaderContainer}>
          <SafeAreaView style={styles.loadingBackButtonContainer}>
            <TouchableOpacity onPress={() => handleGoBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          </SafeAreaView>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
            {manualWebViewVisible ? 'Please click the CAPTCHA checkbox below.' :
             streamExtractionComplete ? 'Loading video...' : 'Extracting video stream...'}
          </Text>
          {!streamExtractionComplete && !manualWebViewVisible && (
            <Text style={styles.loadingSubText}>
              This may take up to 30 seconds...
            </Text>
          )}
          {manualWebViewVisible && (
            <>
              <Text style={styles.captchaInfoText}>
                If you see this often, a VPN or network issue might be the cause.
              </Text>
              <TouchableOpacity style={styles.captchaDoneButton} onPress={() => {
               // This button doesn't directly trigger stream finding,
               // but user might click it after solving.
               // The injected JS should still post a message when the stream is found.
               // For now, just hides the CAPTCHA view and hopes for the best.
               // A more robust solution might involve re-triggering aspects of the WebView.
               setManualWebViewVisible(false);
               // Optionally, could add a small delay then re-check if stream was found, or show a "Still trying..."
             }}>
               <Text style={styles.captchaDoneButtonText}>I've clicked it / Close</Text>
             </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          {/* ... existing error content ... */}
          <Text style={styles.errorText}>Error loading video.</Text>
          <Text style={styles.errorDetail}>{error.message || "Check connection"}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.goBackButton} onPress={() => handleGoBack()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Video Player */}
      {videoUrl && (
        <GestureDetector gesture={videoAreaGestures}>
          <Animated.View
            style={[
              styles.video, // This style should make the Animated.View fill the available video area.
              { transform: [{ scale: animatedScale }] }
            ]}
          >
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill} // VideoView fills the scaled Animated.View
              nativeControls={false}
              allowsPictureInPicture={true}
              allowsExternalPlayback={true}
              resizeMode="contain" // Base resize mode is contain
              // pointerEvents="none" // Prevent VideoView from interfering with gestures on parent Animated.View
            />
          </Animated.View>
        </GestureDetector>
      )}

      {/* Subtitle Text Display */}
      {subtitlesEnabled && currentSubtitleText ? (
        <View style={styles.subtitleTextContainer} pointerEvents="none">
          <Text style={styles.subtitleText}>{currentSubtitleText}</Text>
        </View>
      ) : null}


      {/* Black Transparent Overlay */}
      <Animated.View style={[styles.overlayBackground, { opacity: opacityAnim }]} pointerEvents="none" />

      {/* Controls Wrapper (Fades out) */}
      <Animated.View style={[styles.controlsWrapper, { opacity: opacityAnim, pointerEvents: showControls ? 'box-none' : 'none' }]}>
        <>
          {/* Top Controls */}
          <SafeAreaView style={styles.controlsContainer}>
            <TouchableOpacity onPress={() => handleGoBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <View style={styles.titleContainer}>
              <Text style={styles.titleText} numberOfLines={1}>
                {title}
                {mediaType === 'tv' && episodeTitle ? ` - ${episodeTitle}` : ''}
                {mediaType === 'tv' && (
                  <Text style={styles.seasonEpisodeText}>{` (S${season}:E${episode})`}</Text> // Added space before (
                )}
              </Text>
            </View>
            {/* Subtitle Toggle/Selection Buttons */}
            <View style={styles.topRightButtons}>
              {mediaType === 'tv' && (
                <TouchableOpacity onPress={toggleEpisodesModal} style={styles.controlButton}>
                  <Ionicons name="albums-outline" size={24} color="white" />
                </TouchableOpacity>
              )}
              {/* <RemotePlaybackButton style={styles.controlButton} /> */}
            </View>
          </SafeAreaView>

          {/* Brightness Slider */}
          {hasBrightnessPermission && (
            <View style={styles.brightnessSliderContainer}>
              {/* ... brightness slider elements ... */}
              <Ionicons name="sunny" size={20} color="white" style={styles.brightnessIcon} />
              <Slider
                style={styles.brightnessSlider}
                minimumValue={0} maximumValue={1} value={brightnessLevel}
                onValueChange={handleBrightnessChange}
                minimumTrackTintColor="#FFFFFF" maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor="transparent"
                tapToSeek
              />
            </View>
          )}

          <View style={styles.centerControls}>
            <TouchableOpacity style={styles.seekButton} onPress={seekBackward}>
              <Ionicons name="play-back" size={40} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={60} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.seekButton} onPress={seekForward}>
              <Ionicons name="play-forward" size={40} color="white" />
            </TouchableOpacity>
          </View>


          {/* Bottom Controls */}
          <SafeAreaView style={styles.bottomControls}>
            {(() => {
              const displayPosition = isSeeking && seekPreviewPosition !== null ? seekPreviewPosition : position;
              const progressPercent = (displayPosition / Math.max(duration, 1)) * 100;
              return (
                <>
                  <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
                  <View style={styles.progressBar} ref={progressBarRef}>
                    <View style={[styles.progressFill, { width: `${progressPercent}%` }]}/>
                    <View style={[styles.progressThumb, { left: `${progressPercent}%` }]}/>
                    <View style={styles.progressTouchArea} {...progressPanResponder.panHandlers}/>
                  </View>
                  <Text style={styles.timeText}>{formatTime(duration)}</Text>
                </>
              );
            })()}
          </SafeAreaView>
        </>
      </Animated.View>

      {/* Render Next Episode Button OUTSIDE the fading wrapper */}
      {renderNextEpisodeButton()}

      {/* Subtitle Selection Modal */}
      {renderSubtitleSelectionModal()}
    
      {/* Episodes Viewer Modal */}
      {mediaType === 'tv' && renderEpisodesModal()}
      </View>
        </GestureHandlerRootView>
      );
    };
    
    const styles = StyleSheet.create({
  // ... (keep all existing styles) ...
  gestureHandlerRoot: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000' },
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0, zIndex: -1, top: -1000, left: -1000 }, // Ensure it's truly off-screen
  visibleWebViewForCaptcha: {
    position: 'absolute',
    bottom: 20, // Position it somewhere visible but not obscuring everything
    left: 20,
    right: 20,
    height: '40%', // Make it large enough for interaction
    backgroundColor: 'white', // So it's visible
    zIndex: 100, // Above other loading elements
    borderWidth: 1,
    borderColor: '#ccc',
  },
  video: { flex: 1, backgroundColor: '#000' },
  loaderContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', zIndex: 10 },
  loadingBackButtonContainer: { position: 'absolute', top: 0, left: 0, right: 0, padding: 10, zIndex: 11 },
  loadingText: { color: '#fff', marginTop: 10 },
  loadingSubText: { color: '#aaa', fontSize: 12, marginTop: 5 },
  bufferingIndicatorContainer: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -15 }, { translateY: -15 }], zIndex: 11, padding: 10, borderRadius: 5, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  errorContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', zIndex: 10, padding: 20 },
  errorText: { color: '#fff', marginBottom: 10, fontSize: 16, fontWeight: 'bold' },
  errorDetail: { color: '#888', marginBottom: 20, textAlign: 'center' },
  retryButton: { backgroundColor: '#E50914', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5, marginBottom: 10 },
  retryButtonText: { color: '#fff', fontWeight: 'bold' },
  goBackButton: { backgroundColor: '#222', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
  goBackButtonText: { color: '#fff', fontWeight: 'bold' },
  overlayTouchable: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', zIndex: 1 },
  overlayBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 4 },
  controlsWrapper: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  controlsContainer: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', padding: 10, alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 8 },
  titleContainer: { flex: 1, marginLeft: 10, marginRight: 10 },
  titleText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  topRightButtons: { flexDirection: 'row' },
  controlButton: { padding: 8, marginLeft: 8 },
  brightnessSliderContainer: { position: 'absolute', left: 40, top: '20%', bottom: '20%', width: 40, justifyContent: 'center', alignItems: 'center' },
  brightnessIcon: { marginBottom: 55 },
  brightnessSlider: { width: 150, height: 30, transform: [{ rotate: '-90deg' }] },
  centerControls: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  playPauseButton: { borderRadius: 50, padding: 12, marginHorizontal: 30 },
  seekButton: { borderRadius: 40, padding: 8 },
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  progressBar: { flex: 1, height: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginHorizontal: 10, borderRadius: 2, overflow: 'visible' },
  progressFill: { height: '100%', backgroundColor: '#E50914', borderRadius: 2 },
  progressThumb: { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E50914', transform: [{ translateX: -6 }], zIndex: 3 },
  progressTouchArea: { position: 'absolute', height: 20, width: '100%', top: -8, backgroundColor: 'transparent', zIndex: 4 },
  timeText: { color: '#fff', fontSize: 14 },

  // --- New Styles for Next Episode Button ---
  nextEpisodeContainer: {
    position: 'absolute',
    bottom: 80, // Position above bottom controls
    right: 30,
    zIndex: 6, // Ensure it's above other controls
  },
  nextEpisodeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    borderColor: 'white',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  nextEpisodeIcon: {
    marginRight: 8,
  },
  nextEpisodeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // --- End New Styles ---
  seasonEpisodeText: {
    color: '#bbb', // Lighter gray color
    fontSize: 14, // Keep consistent or adjust as needed
    fontWeight: 'normal', // Less emphasis than the main title
    marginLeft: 4, // Reduced margin slightly
  },
  // --- Subtitle Styles ---
  subtitleTextContainer: {
    position: 'absolute',
    bottom: 80, // Adjust as needed, above bottom controls
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 7, // Above overlay, below controls when visible
    pointerEvents: 'none', // Allow touches to pass through
  },
  subtitleText: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Optional background for better readability
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: '#222',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
  },
  subtitleOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    width: '100%',
    alignItems: 'center',
  },
  subtitleOptionSelected: {
    backgroundColor: '#444',
  },
  subtitleOptionText: {
    color: 'white',
    fontSize: 16,
  },
  noSubtitlesText: {
    color: '#888',
    marginTop: 10,
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#555',
    borderRadius: 5,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
  },
  captchaDoneButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#E50914',
    borderRadius: 5,
  },
  captchaDoneButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  captchaInfoText: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  // --- End Subtitle Styles ---

  // --- Episodes Modal Styles ---
  episodesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center', // Center the modal content vertically
    alignItems: 'center',   // Center the modal content horizontally
  },
  episodesModalContent: {
    backgroundColor: '#141414',
    width: '95%', // Wider modal
    height: '90%', // Taller modal
    borderRadius: 8, // Slightly less rounded
    // marginTop: 100, // Remove fixed margin top
    paddingTop: 0, // Remove padding at the top, header will handle it
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 }, // Adjust shadow for centered modal
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 30,
    overflow: 'hidden', // Ensure content respects border radius
  },
  episodesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15, // More padding for header
    borderBottomWidth: 1,
    borderBottomColor: '#282828', // Darker border
    backgroundColor: '#141414', // Ensure header background is consistent
  },
  episodesModalTitle: {
    color: 'white',
    fontSize: 22, // Larger title
    fontWeight: 'bold',
  },
  episodesModalCloseButton: {
    padding: 5,
  },
  seasonSelectorContainer: { // Restored for horizontal season buttons
    paddingHorizontal: 10, // Adjusted padding
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
    backgroundColor: '#141414',
  },
  seasonTabContentContainer: { // Added for FlatList content
    paddingHorizontal: 10, // Inner padding for tabs
  },
  seasonTab: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    backgroundColor: '#333',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonTabSelected: {
    backgroundColor: '#E50914',
  },
  seasonTabText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  episodesListContentHorizontal: { // Style for horizontal episode list
    paddingVertical: 15,
    paddingLeft: 20, // Start padding for the first item
    paddingRight: 10, // End padding for the last item if needed
  },
  episodeItemHorizontal: {
    flexDirection: 'column',
    backgroundColor: '#1C1C1C',
    borderRadius: 8,
    marginRight: 15, // Space between horizontal items
    padding: 10,
    width: 180, // Width for each episode item card
    height: 220, // Fixed height for consistency
    justifyContent: 'flex-start', // Align content to the top
  },
  currentEpisodeItemHorizontal: {
    backgroundColor: 'rgb(36, 36, 36)',
  },
  episodeThumbnailContainerHorizontal: {
    width: '100%', // Thumbnail takes full width of the card
    height: 100, // Fixed height for thumbnail (160 * 9/16)
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#333',
    position: 'relative', // For progress bar
    marginBottom: 8,
  },
  episodeThumbnailHorizontal: {
    width: '100%',
    height: '100%',
  },
  placeholderThumbnailHorizontal: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#282828',
  },
  episodeProgressOverlayHorizontal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  episodeProgressBarHorizontal: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  watchedOverlayHorizontal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5, // Match thumbnail border radius
  },
  episodeDetailsHorizontal: {
    flex: 1, // Take remaining space below thumbnail
    justifyContent: 'flex-start',
    paddingTop: 5,
  },
  episodeTitleTextHorizontal: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  episodeOverviewTextHorizontal: {
    color: '#B0B0B0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  episodeRuntimeTextHorizontal: {
    color: '#888',
    fontSize: 11,
    marginTop: 'auto', // Push to the bottom of episodeDetailsHorizontal
    paddingTop: 4,
  },
  centeredLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredMessage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noEpisodesText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  // --- End Episodes Modal Styles ---
});
export default VideoPlayerScreen;