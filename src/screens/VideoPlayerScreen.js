import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler, Text, TouchableOpacity, Platform, PanResponder, Animated, Easing, Modal, FlatList, Dimensions, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer, RemotePlaybackButton } from 'expo-video';
import { WebView } from 'react-native-webview';
import { fetchTVShowDetails, fetchSeasonDetails } from '../api/tmdbApi';
import { saveWatchProgress, getWatchProgress, getCachedStreamUrl, saveStreamUrl, getAutoPlaySetting } from '../utils/storage';
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
  // Removed autoPlayProgressAnim
  // Removed autoPlayTimerRef
  const nextEpisodeDetailsRef = useRef(null); // Ref to store next episode details
  const lastPositionRef = useRef(0); // Ref for manual end detection
  const lastPositionTimeRef = useRef(0); // Ref for manual end detection
  const manualFinishTriggeredRef = useRef(false); // Ref for manual end detection flag
  // Removed prevShowNextEpisodeButtonRef (no longer needed for countdown trigger)

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
  // const [controlsTimer, setControlsTimer] = useState(null); // Replaced with useRef
  const controlsTimerRef = useRef(null); // Use ref for timer ID
  const [webViewConfig, setWebViewConfig] = useState(null);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [isUnmounting, setIsUnmounting] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewPosition, setSeekPreviewPosition] = useState(null);

  // --- New Auto-Play States ---
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [showNextEpisodeButton, setShowNextEpisodeButton] = useState(false);
  const [isFindingNextEpisode, setIsFindingNextEpisode] = useState(false); // Prevent multiple fetches
  // Removed autoPlayCountdownActive state
  // --- End New Auto-Play States ---

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
  
  // --- Logging Wrappers for State Setters --- (Keep if used elsewhere, remove if only for countdown)
  // NOTE: Reviewing if logSetShowControls is still needed without countdown logic. Keeping for now.
  const logSetShowControls = useCallback((value) => {
    //console.log(`[Debug Loop] Setting showControls = ${typeof value === 'function' ? 'function' : value}`);
    setShowControls(value); // Corrected: Use the actual state setter
  }, [setShowControls]); // Corrected: Dependency should be the actual setter

  // Removed logSetAutoPlayCountdownActive wrapper

  // --- End Logging Wrappers ---

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

  player.timeUpdateEventInterval = 1;

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

    // Read current state values directly inside the callback
    // Removed check for autoPlayCountdownActive

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
    // Removed check for autoPlayCountdownActive and cancelAutoPlay call
    setShowControls(currentShowControls => !currentShowControls);
  };
  // --- End Animation and Controls Timer ---


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
            console.log('[Brightness] System brightness on resume:', currentBrightness);
            setBrightnessLevel(currentBrightness); // Update our UI
          } catch (e) {
            console.error('[Brightness] Error fetching brightness on resume:', e);
          }
        } else {
          console.log('[Brightness] No permission to get brightness on resume (permission state was false).');
          // Optionally, try to request permission again or inform the user.
          // For now, just logging.
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
    // Removed cancelAutoPlay call
  };
  // --- End Brightness Handling ---


  // --- Auto-Play Logic ---
  // Removed cancelAutoPlay function
  // Removed startAutoPlayCountdown function

  const findNextEpisode = useCallback(async () => { // Make async
    if (mediaType !== 'tv' || isFindingNextEpisode || showNextEpisodeButton) {
      // console.log("Skipping findNextEpisode:", { mediaType, isFindingNextEpisode, showNextEpisodeButton });
      return; // Only for TV shows, prevent multiple fetches, skip if already found
    }

    // console.log(`Finding next episode for S${season} E${episode}`);
    setIsFindingNextEpisode(true);

    try {
      const showData = await fetchTVShowDetails(mediaId); // Use the correct function name
      if (!showData || !showData.seasons) {
        // console.log("No show data or seasons found.");
        setIsFindingNextEpisode(false);
        return;
      }

      // Filter out seasons with season_number 0 (Specials) unless it's the ONLY season
      const validSeasons = showData.seasons.filter(s => s.season_number > 0 || showData.seasons.length === 1);
      if (validSeasons.length === 0) {
        // console.log("No valid seasons (non-specials) found.");
        setIsFindingNextEpisode(false);
        return;
      }


      const currentSeasonData = validSeasons.find(s => s.season_number === season);
      const currentSeasonIndex = validSeasons.findIndex(s => s.season_number === season);

      let nextEp = null;
      let nextSe = null;

      if (currentSeasonData && episode < currentSeasonData.episode_count) {
        // Next episode in the same season
        nextSe = season;
        nextEp = episode + 1;
        // console.log(`Found next episode in same season: S${nextSe} E${nextEp}`);
      } else if (currentSeasonIndex !== -1 && currentSeasonIndex < validSeasons.length - 1) {
        // First episode of the next valid season
        const nextSeasonData = validSeasons[currentSeasonIndex + 1];
        // Ensure next season has episodes and a valid season number
        if (nextSeasonData && nextSeasonData.episode_count > 0 && nextSeasonData.season_number > 0) {
          nextSe = nextSeasonData.season_number;
          nextEp = 1;
          // console.log(`Found next episode in next season: S${nextSe} E${nextEp}`);
        }
      }

      if (nextSe !== null && nextEp !== null) {
        // Fetch details for the specific next episode to get its title
        let episodeName = `Episode ${nextEp}`; // Default placeholder
        try {
          const nextSeasonFullDetails = await fetchSeasonDetails(mediaId, nextSe);
          const nextEpisodeData = nextSeasonFullDetails?.episodes?.find(e => e.episode_number === nextEp);
          if (nextEpisodeData?.name) {
            episodeName = nextEpisodeData.name;
          }
        } catch (fetchErr) {
          console.warn(`Could not fetch details for S${nextSe} E${nextEp} to get title:`, fetchErr);
          // Keep the placeholder title if fetch fails
        }

        const nextDetails = {
          mediaId: mediaId,
          mediaType: 'tv',
          season: nextSe,
          episode: nextEp,
          title: title, // Show title remains the same
          episodeTitle: episodeName, // Use fetched name or placeholder
          poster_path: poster_path, // Use current show poster
        };
        nextEpisodeDetailsRef.current = nextDetails; // Store in ref
        setShowNextEpisodeButton(true); // Show button now
        // console.log("Next episode button should be shown now.");
      } else {
        // console.log("Last episode of the series reached.");
        nextEpisodeDetailsRef.current = null; // Explicitly set to null for "go home" logic
        setShowNextEpisodeButton(true); // Show button now (for "go home")
      }

    } catch (err) {
      console.error("Error finding next episode:", err);
    } finally {
      setIsFindingNextEpisode(false);
    }
  }, [mediaId, mediaType, season, episode, title, poster_path, isFindingNextEpisode, showNextEpisodeButton, fetchSeasonDetails]); // Added fetchSeasonDetails dependency

  const playNextEpisode = useCallback(() => {
    // Removed cancelAutoPlay call

    const nextDetails = nextEpisodeDetailsRef.current;

    if (nextDetails) {
      // console.log("Navigating to next episode:", nextDetails);
      // Reset state before navigating to ensure clean player on next screen
      setIsUnmounting(true); // Prevent further actions on this screen
      if (player) player.pause();
      // ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP) // REMOVED: Don't force portrait here
      //   .catch(() => { }) // Ignore errors
      //   .finally(() => {
      //     navigation.replace('VideoPlayer', nextDetails);
      //   });
      // Navigate directly after pausing
      navigation.replace('VideoPlayer', nextDetails);
    } else {
      // Last episode - go back home or to details
      // console.log("Navigating back (last episode).");
      handleGoBack(true); // Pass flag to indicate it's due to end of series
    }
  }, [navigation, player, handleGoBack]); // Adjusted dependencies

  // Trigger findNextEpisode when video nears end
  useEffect(() => {
    if (duration > 0 && position > 0 && (duration - position) < VIDEO_END_THRESHOLD_SECONDS) {
      if (!isFindingNextEpisode && !showNextEpisodeButton) {
        findNextEpisode();
      }
    }
  }, [position, duration, findNextEpisode, isFindingNextEpisode, showNextEpisodeButton]); // Added dependencies back

  // Removed effect that triggered auto-play countdown
  // --- End Auto-Play Logic ---


  // --- Subtitle Logic ---
  const findSubtitles = useCallback(async () => {
    if (!mediaId || loadingSubtitles) return;
    setLoadingSubtitles(true);
    setAvailableLanguages({}); // Clear previous results
    try {
      console.log(`Searching subtitles for TMDB ID: ${mediaId}, Type: ${mediaType}, S: ${season}, E: ${episode}`);
      const results = await searchSubtitles(
        mediaId,
        'en', // Defaulting to English for now, could be made configurable
        mediaType === 'tv' ? season : undefined,
        mediaType === 'tv' ? episode : undefined
      );
      console.log(`Found ${results.length} subtitles.`);

      // Group by language and find the best one (e.g., highest download count)
      const languages = {};
      results.forEach(sub => {
        const attr = sub.attributes;
        if (!attr || !attr.language || !attr.files || attr.files.length === 0) {
          return; // Skip invalid entries
        }

        const lang = attr.language;
        const fileInfo = attr.files[0]; // Assuming the first file is the relevant one
        const currentSub = {
          language: lang,
          file_id: fileInfo.file_id,
          release_name: attr.release,
          download_count: attr.download_count || 0, // Use download_count for sorting, default to 0
          fps: attr.fps || -1
          // Add rating if available: rating: attr.ratings || 0,
        };

        if (!languages[lang] || currentSub.download_count > languages[lang].download_count) {
          // If this language isn't stored yet, or this sub has more downloads, store it
          languages[lang] = currentSub;
        }
      });

      console.log(`Processed languages: ${Object.keys(languages).join(', ')}`);
      setAvailableLanguages(languages);
    } catch (err) {
      console.error("Error searching subtitles:", err);
      // Optionally show an error to the user
    } finally {
      setLoadingSubtitles(false);
    }
  }, [mediaId, mediaType, season, episode, loadingSubtitles]);

  const selectSubtitle = useCallback(async (langCode) => {
    setShowSubtitleSelection(false); // Close modal
    if (!langCode) {
      // User selected "None"
      setParsedSubtitles([]);
      setSelectedLanguage(null);
      setCurrentSubtitleText('');
      setSubtitlesEnabled(false);
      return;
    }

    if (langCode === selectedLanguage) {
      // Re-selected the same language, just ensure it's enabled
      setSubtitlesEnabled(true);
      return;
    }

    console.log(`[Subtitle Select] Language selected: ${langCode}`); // Log selected language
    const bestSubtitleInfo = availableLanguages[langCode];
    console.log(`[Subtitle Select] Best subtitle info found:`, bestSubtitleInfo); // Log the retrieved info

    if (!bestSubtitleInfo || !bestSubtitleInfo.file_id) {
      console.error(`[Subtitle Select] Error: No valid subtitle file_id found for language: ${langCode}`);
      setLoadingSubtitles(false); // Ensure loading stops if we return early
      return;
    }

    setLoadingSubtitles(true);
    setSelectedLanguage(langCode); // Store the selected language code
    setParsedSubtitles([]); // Clear previous
    setCurrentSubtitleText('');

    try {
      console.log(`Downloading best subtitle for ${langCode}, File ID: ${bestSubtitleInfo.file_id}`);
      const srtContent = await downloadSubtitle(bestSubtitleInfo.file_id);
      if (srtContent) {
        console.log("Subtitle content downloaded, parsing...");
        const parsed = parseSrt(srtContent);
        // Convert start/end times from HH:MM:SS,ms to seconds
        const parsedWithSeconds = parsed.map(line => ({
          ...line,
          startSeconds: timeToSeconds(line.start),
          endSeconds: timeToSeconds(line.end),
        }));
        setParsedSubtitles(parsedWithSeconds);
        setSubtitlesEnabled(true); // Enable subtitles when successfully loaded
        console.log(`Parsed ${parsedWithSeconds.length} subtitle lines.`);
      } else {
        console.warn("Failed to download subtitle content.");
        setSelectedLanguage(null); // Reset selection on failure
        setSubtitlesEnabled(false);
      }
    } catch (err) {
      console.error("[Subtitle Select] Error during download or parsing:", err); // Add identifier to error log
      setSelectedLanguage(null); // Reset selection on failure
      setSubtitlesEnabled(false);
    } finally {
      setLoadingSubtitles(false);
    }
  }, [selectedLanguage, availableLanguages]); // Updated dependencies

  // Helper to convert SRT time format (00:00:00,000) to seconds
  const timeToSeconds = (timeInput) => {
    // Check if input is already a number (assume seconds)
    if (typeof timeInput === 'number' && !isNaN(timeInput)) {
      return timeInput;
    }

    // Check if input is a valid string
    if (typeof timeInput !== 'string' || !timeInput) {
      console.warn(`[timeToSeconds] Received invalid non-string/non-numeric input: ${timeInput}`);
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
      console.error(`[timeToSeconds] Error parsing time string "${timeInput}":`, e);
      return 0; // Return 0 on parsing error
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

      // Check if position hasn't changed much for ~2 seconds
      if (Math.abs(currentEventTime - lastPos) < 0.5 && now - lastTime > 2000) {
        console.log("[AutoPlay Debug] Assuming video finished based on position near end.");
        manualFinishTriggeredRef.current = true; // Prevent re-triggering

        // Manually trigger the finish logic (similar to statusChange handler)
        if (showNextEpisodeButton && autoPlayEnabled) {
          console.log("[AutoPlay Debug] Manually calling playNextEpisode()");
          playNextEpisode();
        } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'tv') {
          console.log("[AutoPlay Debug] Manual finish: Button not shown yet. Finding next episode...");
          findNextEpisode().then(() => {
            setTimeout(() => {
              if (nextEpisodeDetailsRef.current) {
                console.log("[AutoPlay Debug] Manual finish: Found next episode. Calling playNextEpisode()");
                playNextEpisode();
              } else {
                console.log("[AutoPlay Debug] Manual finish: No next episode found. Calling handleGoBack()");
                handleGoBack(true);
              }
            }, 100);
          });
        } else if (autoPlayEnabled && mediaType === 'movie') {
          console.log("[AutoPlay Debug] Manual finish: Movie finished. Calling handleGoBack()");
          handleGoBack(true);
        } else {
          console.log("[AutoPlay Debug] Manual finish: Conditions not met for auto-play.");
          // Optionally call handleGoBack(true) here if desired even if auto-play is off
        }
      }
    }
    // Update last known position and time for manual detection
    lastPositionRef.current = currentEventTime;
    lastPositionTimeRef.current = now;

    // Reset manual trigger flag if user seeks away from the end
    if (duration > 0 && currentEventTime < duration - 5) { // If seeked back more than 5 seconds
      if (manualFinishTriggeredRef.current) {
        console.log("[AutoPlay Debug] User seeked away from end, resetting manual finish trigger.");
        manualFinishTriggeredRef.current = false;
      }
    }
    // --- End Manual End Detection ---


    // Throttle saving progress
    if (currentEventTime > 0 && now - lastSaveTimeRef.current > 5000) {
      saveProgress(currentEventTime);
      lastSaveTimeRef.current = now;
    }

    // Update subtitle based on new position
    updateCurrentSubtitle(currentEventTime);

    // Removed check for autoPlayCountdownActive
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

    if (isUnmounting) {
      // console.log("[AutoPlay Debug] statusChange ignored: isUnmounting=true"); // Kept for auto-play debugging if needed
      return;
    }


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
      } else if (status === 'finished') { // Handle 'finished' string status too
        // console.log("Video finished playing (status === 'finished')"); // Covered by earlier log
        // Same logic as status.isFinished
        if (showNextEpisodeButton && autoPlayEnabled) {
          console.log("[AutoPlay Debug] Calling playNextEpisode() [Primary Path - String Status]"); // Added log
          playNextEpisode();
        } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'tv') {
          console.log("[AutoPlay Debug] Video finished but button not shown yet. Finding next episode... [Edge Case - String Status]"); // Added log
          findNextEpisode().then(() => {
            setTimeout(() => {
              if (nextEpisodeDetailsRef.current) {
                console.log("[AutoPlay Debug] Found next episode details after finish. Calling playNextEpisode() [Edge Case Path - String Status]"); // Added log
                playNextEpisode();
              } else {
                console.log("[AutoPlay Debug] No next episode found after finish. Calling handleGoBack() [Edge Case Path - String Status]"); // Added log
                handleGoBack(true);
              }
            }, 100);
          });
        } else if (!showNextEpisodeButton && autoPlayEnabled && mediaType === 'movie') {
          console.log("[AutoPlay Debug] Movie finished. Calling handleGoBack() [Movie Path - String Status]"); // Added log
          handleGoBack(true);
        } else if (!isVideoFinished) { // Added check to prevent logging twice
          console.log("[AutoPlay Debug] Video finished (string status), but autoPlay conditions not met."); // Added log
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
      // Removed check for autoPlayCountdownActive on pause
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
        // await SystemUI.setSystemBarsBehaviorAsync('inset-swipe'); // Might cause issues, test carefully
        // await SystemUI.hideSystemBarsAsync(); // Hide status/navigation bars
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
        },
        (err) => {
          if (!isMounted) return;
          //console.error("Error extracting stream:", err);
          setError({ message: "Could not extract video stream." });
          setStreamExtractionComplete(true);
          setLoading(false);
          setIsInitialLoading(false);
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
      // Removed cancelAutoPlay call

      try {
        saveProgress(position);

        if (player && typeof player.pause === 'function') {
          try {
            player.pause();
          } catch (pauseError) { }
        }

        // ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP) // REMOVED: Don't force portrait on unmount
        //   .catch(e => { });

        // SystemUI.showSystemBarsAsync().catch(e => {}); // Show system bars again

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

    // Don't save if we are very close to the end (let auto-play handle it)
    if ((duration - currentTime) < VIDEO_END_THRESHOLD_SECONDS) {
      // console.log("Near end, skipping saveProgress.");
      return;
    }

    // console.log(`Attempting to save progress: ${currentTime} / ${duration}`);
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
          // Removed cancelAutoPlay call
        } else {
          player.play();
          // Don't restart auto-play on resume, let it trigger naturally near the end
        }
        // setIsPlaying(!isPlaying); // State updated by listener
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
        // Removed cancelAutoPlay call
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
        // Removed cancelAutoPlay call
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
    // Removed cancelAutoPlay call

    try {
      // Only save progress if not triggered by end of series naturally
      if (!isEndOfSeries) {
        saveProgress(position);
      }

      if (player) {
        player.pause();
      }

      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        // .then(() => SystemUI.showSystemBarsAsync()) // Show UI elements
        .catch(() => { }) // Ignore errors
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
    // ... (keep existing reload logic) ...
    // Removed cancelAutoPlay call
    setShowNextEpisodeButton(false);
    nextEpisodeDetailsRef.current = null;
    setIsFindingNextEpisode(false);
    setError(null);
    setLoading(true);
    setIsInitialLoading(true);
    setStreamExtractionComplete(false);
    setVideoUrl(null);
    setWebViewConfig(null);
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
    // ... (keep existing time formatting) ...
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
      // Removed cancelAutoPlay call
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
        // Re-lock to landscape after modal closes
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          console.log("[Orientation Debug] Re-locked to LANDSCAPE after modal close.");
        } catch (e) {
          console.error("Failed to re-lock orientation:", e);
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


  const renderNextEpisodeButton = () => {
    if (!showNextEpisodeButton) return null;

    const nextDetails = nextEpisodeDetailsRef.current;
    const buttonText = nextDetails
      ? `Next: S${nextDetails.season} E${nextDetails.episode}`
      : "Back to Home"; // Or "Back to Details"

    // Removed progressWidth animation

    return (
      // Keep Animated.View for potential future animations, or change to View if none planned
      <Animated.View style={[styles.nextEpisodeContainer]}>
        <TouchableOpacity style={styles.nextEpisodeButton} onPress={playNextEpisode}>
          {/* Removed autoPlayProgress View */}
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

      {/* Hidden WebView */}
      {webViewConfig && !streamExtractionComplete && (
        <View style={styles.hiddenWebView}>
          <WebView
            {...webViewConfig}
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
            {streamExtractionComplete ? 'Loading video...' : 'Extracting video stream...'}
          </Text>
          {!streamExtractionComplete && (
            <Text style={styles.loadingSubText}>
              This may take up to 30 seconds...
            </Text>
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

      {/* Overlay Touchable - REMOVED as tap is now handled by GestureDetector */}
      {/*
      <TouchableOpacity
        style={styles.overlayTouchable}
        onPress={toggleControls}
        activeOpacity={1}
      />
      */}

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
              {/* Subtitle buttons are now hidden */}
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

          {/* REMOVE Next Episode Button from here */}
          {/* {renderNextEpisodeButton()} */}
        </>
      </Animated.View>

      {/* Render Next Episode Button OUTSIDE the fading wrapper */}
      {renderNextEpisodeButton()}

      {/* Subtitle Selection Modal */}
      {renderSubtitleSelectionModal()}
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  // ... (keep all existing styles) ...
  gestureHandlerRoot: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000' },
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0, zIndex: -1 },
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
    overflow: 'hidden', // Important for progress animation
  },
  // Removed autoPlayProgress style
  /*
  autoPlayProgress: { // Visual indicator for countdown
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.3)', // Semi-transparent white
    // Width is animated
  },
  */
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
  // --- End Subtitle Styles ---
});
export default VideoPlayerScreen;