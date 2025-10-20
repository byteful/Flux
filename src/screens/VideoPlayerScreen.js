import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler, Text, TouchableOpacity, Platform, PanResponder, Animated, Easing, Modal, FlatList, Dimensions, AppState, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer, VideoAirPlayButton } from 'expo-video';
import { WebView } from 'react-native-webview';
import { fetchTVShowDetails, fetchSeasonDetails } from '../api/tmdbApi';
import {
  saveWatchProgress,
  getWatchProgress,
  getCachedStreamUrl,
  saveStreamUrl,
  getAutoPlaySetting,
  getEpisodeWatchProgress,
  clearSpecificStreamFromCache,
  saveLastSelectedSubtitleLanguage,
  // getLastSelectedSubtitleLanguage,
  // saveSubtitlesEnabledState, // Import new function
  // getSubtitlesEnabledState // Import new function
} from '../utils/storage';
import { extractM3U8Stream, extractStreamFromSpecificSource } from '../utils/streamExtractor';
import { getActiveStreamSources } from '../api/vidsrcApi';
import { extractLiveStreamM3U8 } from '../api/streameastApi';
import SourceSelectionModal from '../components/SourceSelectionModal';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
// import parseSrt from 'parse-srt';
// import { searchSubtitles, downloadSubtitle } from '../api/opensubtitlesApi';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
// import SubtitlesModal from '../components/SubtitlesModal'; // Import the new modal
// import { getLanguageName } from '../utils/languageUtils'; // Import the new utility

// Constants for auto-play
const VIDEO_END_THRESHOLD_SECONDS = 45; // Show button 45 secs before end
const TWO_MINUTE_THRESHOLD_SECONDS = 120; // New threshold for conditional visibility
const BUFFER_TIMEOUT = 20; // 20 seconds

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
  const bufferingTimeoutRef = useRef(null); // Ref for buffering timeout

  // --- Buffering Alert State ---
  const [showBufferingAlert, setShowBufferingAlert] = useState(false);
  // --- End Buffering Alert State ---

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
    sportToken,
  } = route.params;

  const isFutureDate = (airDateString) => {
    if (!airDateString) return false;
    const airDate = new Date(airDateString);
    const today = new Date();
    return airDate > today;
    // Set hours to 0 to compare dates only, and account for timezone offset by using UTC dates
    // const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    // const airDateUTC = new Date(Date.UTC(airDate.getFullYear(), airDate.getMonth(), airDate.getDate()));
    // return airDateUTC > todayUTC;
  };

  // --- Pinch to Zoom States ---
  const [isZoomed, setIsZoomed] = useState(false); // Restored original setter
  const [videoNaturalSize, setVideoNaturalSize] = useState(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));
  const animatedScale = useRef(new Animated.Value(1)).current;
  // --- End Pinch to Zoom States ---

  // ... existing states ...
  const [loading, setLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBufferingVideo, setIsBufferingVideo] = useState(false); // New state for buffering
  const [error, setError] = useState(null);
  const [streamExtractionComplete, setStreamExtractionComplete] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoUrl, setVideoUrl] = useState(null);
  const [streamReferer, setStreamReferer] = useState(null); // Added state for referer
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [resumeTime, setResumeTime] = useState(0);
  const controlsTimerRef = useRef(null); // Use ref for timer ID
  const [currentWebViewConfig, setCurrentWebViewConfig] = useState(null); // Renamed from webViewConfig
  const [currentSourceAttemptKey, setCurrentSourceAttemptKey] = useState('initial'); // For WebView key
  const [currentAttemptingSource, setCurrentAttemptingSource] = useState(null); // To display current source
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [isUnmounting, setIsUnmounting] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1);
  const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewPosition, setSeekPreviewPosition] = useState(null);
  const [manualWebViewVisible, setManualWebViewVisible] = useState(false); // For CAPTCHA
  const [captchaUrl, setCaptchaUrl] = useState(null); // To store URL for visible WebView
  const [isChangingSource, setIsChangingSource] = useState(false); // True when a source change attempt (via modal) is active
  const [currentPlayingSourceName, setCurrentPlayingSourceName] = useState(null);

  // --- Source Selection Modal States ---
  const [showSourceSelectionModal, setShowSourceSelectionModal] = useState(false);
  const [availableSourcesList, setAvailableSourcesList] = useState([]);
  const [sourceAttemptStatus, setSourceAttemptStatus] = useState({}); // { [sourceName: string]: 'idle' | 'loading' | 'failed' | 'success' }
  
  // --- New Auto-Play States ---
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [showNextEpisodeButton, setShowNextEpisodeButton] = useState(false);
  const [isFindingNextEpisode, setIsFindingNextEpisode] = useState(false);
  // --- End New Auto-Play States ---

  // --- Live Stream States ---
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [isAtLiveEdge, setIsAtLiveEdge] = useState(true);
  // --- End Live Stream States ---

  
    // --- Subtitle States ---
    // const [availableLanguages, setAvailableLanguages] = useState({}); // Stores { langCode: bestSubtitleInfo }
    // const [selectedLanguage, setSelectedLanguage] = useState(null); // Stores selected language code ('en', 'es', etc.) or null
    // const [parsedSubtitles, setParsedSubtitles] = useState([]);
    // const [currentSubtitleText, setCurrentSubtitleText] = useState('');
    // // const [showSubtitleSelection, setShowSubtitleSelection] = useState(false); // Removed
    // const [subtitlesEnabled, setSubtitlesEnabled] = useState(false); // Default to disabled
    // const [loadingSubtitles, setLoadingSubtitles] = useState(false);
    // const [subtitleOffset, setSubtitleOffset] = useState(0); // In milliseconds
    // --- End Subtitle States ---
  // --- Episodes Viewer Modal States ---
  const [showEpisodesModal, setShowEpisodesModal] = useState(false);
  const [allSeasonsData, setAllSeasonsData] = useState([]); // Stores [{ season_number, name, episode_count, episodes: [] }]
  const [selectedSeasonForModal, setSelectedSeasonForModal] = useState(null); // Stores season_number
  const [episodesForModal, setEpisodesForModal] = useState([]); // Stores episodes of the selectedSeasonForModal
  const [isLoadingModalEpisodes, setIsLoadingModalEpisodes] = useState(false);
  const [modalEpisodeProgress, setModalEpisodeProgress] = useState({}); // { 'sX_eY': { position, duration } }
  // --- End Episodes Viewer Modal States ---

  
    // --- Subtitles Modal State ---
    // const [showSubtitlesModal, setShowSubtitlesModal] = useState(false);
    // --- End Subtitles Modal State ---
  
    // --- Refs for Subtitle Preference Loading ---
    // const preferredSubtitleLanguageLoadedRef = useRef(null); // Stores the loaded preference string or null
    // const initialSubtitlePreferenceAppliedRef = useRef(false); // Tracks if auto-apply has been attempted
    // --- End Subtitle Preference Refs ---
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

  const getStreamHeaders = useCallback(() => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    // Determine Origin and Referer based on the videoUrl or streamReferer
    let originToUse = 'https://vidsrc.su'; // Default
    let refererToUse = 'https://vidsrc.su/'; // Default

    if (streamReferer) {
      try {
        const url = new URL(streamReferer);
        refererToUse = `${url.protocol}//${url.hostname}/`; // Trimmed URL
        originToUse = url.origin;
      } catch (e) {
        // Fallback if streamReferer is not a valid URL
        refererToUse = streamReferer; // Use as is
        try {
          originToUse = new URL(streamReferer).origin;
        } catch (e2) { /* keep default origin if streamReferer is invalid */ }
      }
    } else if (videoUrl) {
      try {
        const videoUrlObj = new URL(videoUrl);
        originToUse = videoUrlObj.origin;
        refererToUse = videoUrlObj.origin + '/'; // Common practice for referer
      } catch (e) { /* ignore if videoUrl is not a valid URL */ }
    }

    headers['Origin'] = originToUse;
    if (refererToUse && videoUrl && !videoUrl.includes("fleurixsun.xyz")) { // hard coded this in cause it was just tweaking and i didnt feel like writing a whole detection system for this edge case
      headers['Referer'] = refererToUse;
    }

    return headers;
  }, [streamReferer, videoUrl]); // Depend on streamReferer and videoUrl

  const player = useVideoPlayer({
    headers: getStreamHeaders(), // Will be updated when streamReferer changes
    uri: videoUrl,
    metadata: {
      title: mediaType === "tv" && episodeTitle ? (title + " - " + episodeTitle) : title,
      artist: "Flux",
      artwork: poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : undefined
    }
  });

  useEffect(() => {
    if (player && videoUrl) {
      // if (subtitlesEnabled) {
      //   player.timeUpdateEventInterval = 1; // More frequent updates for subtitles
      // } else
      player.allowsExternalPlayback = true;
      player.showNowPlayingNotification = true;
      if (showControls) {
        player.timeUpdateEventInterval = 1; // Frequent updates when controls are shown
      } else {
        player.timeUpdateEventInterval = 1000; // Less frequent when controls hidden and no subs
      }
    }
  }, [player, videoUrl, showControls]); // Removed subtitlesEnabled

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
        let nextEpisodeData;
        try {
          const nextSeasonFullDetails = await fetchSeasonDetails(mediaId, nextSe);
          nextEpisodeData = nextSeasonFullDetails?.episodes?.find(e => e.episode_number === nextEp);
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
          air_date: nextEpisodeData?.air_date,
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
    if (isLiveStream) return;
    
    if (duration > 0 && position > 0 && (duration - position) < TWO_MINUTE_THRESHOLD_SECONDS) {
      if (!isFindingNextEpisode && !showNextEpisodeButton) {
        findNextEpisode();
      }
    }
  }, [position, duration, findNextEpisode, isFindingNextEpisode, showNextEpisodeButton, isLiveStream]);


  
    // --- Subtitle Logic ---
    // const findSubtitles = useCallback(async () => {
    //   if (!mediaId || loadingSubtitles) return;
    //   setLoadingSubtitles(true);
    //   setAvailableLanguages({}); // Clear previous results
      
    //   // TODO: Get preferred languages from settings/storage in the future
    //   const preferredLanguages = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh']; // Example list
    //   const languageQueryString = preferredLanguages.join(',');
  
    //   try {
    //     const results = await searchSubtitles(
    //       mediaId,
    //       languageQueryString, // Pass comma-separated list of preferred languages
    //       mediaType === 'tv' ? season : undefined,
    //       mediaType === 'tv' ? episode : undefined
    //     );
        
    //     const bestSubtitlesByLang = {};
    //     results.forEach(sub => {
    //       const attr = sub.attributes;
    //       if (!attr || !attr.language || !attr.files || attr.files.length === 0) {
    //         return;
    //       }
  
    //       // Filter out "foreign parts only" subtitles
    //       if (attr.foreign_parts_only === true) {
    //         return;
    //       }
          
    //       const langCode = attr.language;
    //       const fileInfo = attr.files[0]; // Assuming the first file is the relevant one (e.g., SRT)
  
    //       const currentSubInfo = {
    //         language: langCode,
    //         languageName: getLanguageName(langCode),
    //         fileId: fileInfo.file_id,
    //         releaseName: attr.release,
    //         downloadCount: attr.download_count || 0,
    //         fps: attr.fps || -1,
    //         uploaderName: attr.uploader?.name,
    //         uploadDate: attr.upload_date,
    //         legacySubtitleId: attr.legacy_subtitle_id,
    //         // Attributes for selection logic
    //         moviehashMatch: attr.moviehash_match === true,
    //         fromTrusted: attr.from_trusted === true,
    //         hearingImpaired: attr.hearing_impaired === true,
    //         // ratings: attr.ratings || 0, // Could also use ratings or votes
    //       };
  
    //       const existingBest = bestSubtitlesByLang[langCode];
  
    //       if (!existingBest) {
    //         bestSubtitlesByLang[langCode] = currentSubInfo;
    //       } else {
    //         let newIsBetter = false;
    //         // Rule 1: Prefer moviehash_match: true
    //         if (currentSubInfo.moviehashMatch && !existingBest.moviehashMatch) {
    //           newIsBetter = true;
    //         } else if (!currentSubInfo.moviehashMatch && existingBest.moviehashMatch) {
    //           newIsBetter = false;
    //         } else { // Same moviehash_match status (both true or both false)
    //           // Rule 2: Prefer from_trusted: true
    //           if (currentSubInfo.fromTrusted && !existingBest.fromTrusted) {
    //             newIsBetter = true;
    //           } else if (!currentSubInfo.fromTrusted && existingBest.fromTrusted) {
    //             newIsBetter = false;
    //           } else { // Same from_trusted status
    //             // Rule 3: Prefer hearing_impaired: false
    //             if (!currentSubInfo.hearingImpaired && existingBest.hearingImpaired) {
    //               newIsBetter = true;
    //             } else if (currentSubInfo.hearingImpaired && !existingBest.hearingImpaired) {
    //               newIsBetter = false;
    //             } else { // Same hearing_impaired status
    //               // Rule 4: Higher download_count is better
    //               if (currentSubInfo.downloadCount > existingBest.downloadCount) {
    //                 newIsBetter = true;
    //               }
    //               // As a very final tie-breaker, could consider ratings or votes if download counts are equal
    //               // else if (currentSubInfo.downloadCount === existingBest.downloadCount && currentSubInfo.ratings > existingBest.ratings) {
    //               //   newIsBetter = true;
    //               // }
    //             }
    //           }
    //         }
  
    //         if (newIsBetter) {
    //           bestSubtitlesByLang[langCode] = currentSubInfo;
    //         }
    //       }
    //     });
        
    //     setAvailableLanguages(bestSubtitlesByLang);
    //   } catch (err) {
    //     console.error("Error searching subtitles:", err);
    //     // Optionally, set an error state for subtitles
    //   } finally {
    //     setLoadingSubtitles(false);
    //   }
    // }, [mediaId, mediaType, season, episode, loadingSubtitles]);
  
    // const selectSubtitle = useCallback(async (langCode) => {
    //   setSubtitleOffset(0); // Reset offset on new selection or turning off
    //   // setShowSubtitlesModal(false); // REMOVE THIS LINE - Modal closure handled by caller
    //   if (!langCode) {
    //     setParsedSubtitles([]);
    //     setSelectedLanguage(null);
    //     setCurrentSubtitleText('');
    //     setSubtitlesEnabled(false);
    //     // saveLastSelectedSubtitleLanguage(null);
    //     // saveSubtitlesEnabledState(false); // Persist enabled state
    //     return;
    //   }
  
    //   if (langCode === selectedLanguage) {
    //     setSubtitlesEnabled(true);
    //     // saveSubtitlesEnabledState(true); // Ensure it's persisted if toggled on
    //     return;
    //   }
  
    //   const bestSubtitleInfo = availableLanguages[langCode];
    //   if (!bestSubtitleInfo || !bestSubtitleInfo.fileId) {
    //     console.error(`Error: No valid subtitle fileId found for language: ${langCode}`);
    //     setLoadingSubtitles(false);
    //     return;
    //   }
  
    //   setLoadingSubtitles(true);
    //   setSelectedLanguage(langCode);
    //   setParsedSubtitles([]);
    //   setCurrentSubtitleText('');
  
    //   try {
    //     const srtContent = await downloadSubtitle(bestSubtitleInfo.fileId);
    //     if (srtContent) {
    //       const parsed = parseSrt(srtContent);
    //       const parsedWithSeconds = parsed.map(line => ({
    //         ...line,
    //         startSeconds: timeToSeconds(line.start),
    //         endSeconds: timeToSeconds(line.end),
    //       }));
    //       setParsedSubtitles(parsedWithSeconds);
    //       setSubtitlesEnabled(true);
    //       // saveLastSelectedSubtitleLanguage(langCode);
    //       // saveSubtitlesEnabledState(true); // Persist enabled state
    //     } else {
    //       console.warn("Failed to download subtitle content.");
    //       setSelectedLanguage(null);
    //       setSubtitlesEnabled(false);
    //       // saveLastSelectedSubtitleLanguage(null);
    //       // saveSubtitlesEnabledState(false); // Persist enabled state
    //     }
    //   } catch (err) {
    //     console.error("Error during subtitle download or parsing:", err);
    //     setSelectedLanguage(null);
    //     setSubtitlesEnabled(false);
    //     // saveLastSelectedSubtitleLanguage(null);
    //     // saveSubtitlesEnabledState(false); // Persist enabled state
    //   } finally {
    //     setLoadingSubtitles(false);
    //   }
    // }, [selectedLanguage, availableLanguages]); // saveLastSelectedSubtitleLanguage, saveSubtitlesEnabledState
  
    // Helper to convert SRT time format (00:00:00,000) to seconds
    // const timeToSeconds = (timeInput) => {
    //   // Check if input is already a number (assume seconds)
    //   if (typeof timeInput === 'number' && !isNaN(timeInput)) {
    //     return timeInput;
    //   }
  
    //   if (typeof timeInput !== 'string' || !timeInput) {
    //     return 0;
    //   }
  
    //   // Proceed with parsing if it's a string
    //   try {
    //     const timeString = timeInput; // Rename for clarity within this block
    //     const parts = timeString.split(':');
    //     if (parts.length !== 3) throw new Error('Invalid time format (parts)');
    //     const secondsAndMs = parts[2].split(',');
    //     if (secondsAndMs.length !== 2) throw new Error('Invalid time format (ms)');
    //     const hours = parseInt(parts[0], 10);
    //     const minutes = parseInt(parts[1], 10);
    //     const seconds = parseInt(secondsAndMs[0], 10);
    //     const milliseconds = parseInt(secondsAndMs[1], 10);
    //     if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) {
    //       throw new Error('Invalid number parsed from string parts');
    //     }
    //     return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    //   } catch (e) {
    //     console.error(`Error parsing time string "${timeInput}":`, e);
    //     return 0;
    //   }
    // };
  
    // const updateCurrentSubtitle = useCallback((currentPositionSeconds) => {
    //   if (!subtitlesEnabled || parsedSubtitles.length === 0) {
    //     if (currentSubtitleText !== '') setCurrentSubtitleText('');
    //     return;
    //   }
  
    //   const adjustedPositionSeconds = currentPositionSeconds + (subtitleOffset / 1000); // Apply offset
  
    //   const currentSub = parsedSubtitles.find(
    //     line => adjustedPositionSeconds >= line.startSeconds && adjustedPositionSeconds <= line.endSeconds
    //   );
  
    //   let newText = currentSub ? currentSub.text : '';
  
    //   // Clean HTML tags from the subtitle text
    //   if (newText) {
    //     // Replace <br> tags with newline characters
    //     newText = newText.replace(/<br\s*\/?>/gi, '\n');
    //     // Remove other common HTML tags (i, b, u, font)
    //     newText = newText.replace(/<\/?(i|b|u|font)[^>]*>/gi, '');
    //     // Trim whitespace
    //     newText = newText.trim();
    //   }
  
    //   if (newText !== currentSubtitleText) {
    //     setCurrentSubtitleText(newText);
    //   }
    // }, [subtitlesEnabled, parsedSubtitles, currentSubtitleText, subtitleOffset]); // Add subtitleOffset
  
  // const SUBTITLE_OFFSET_INCREMENT_MS = 250; // 250ms increment
  
  // const adjustSubtitleOffset = (amountMs) => {
  //   setSubtitleOffset(prevOffset => {
  //     const newOffset = prevOffset + amountMs;
  //     // Optional: Clamp the offset to a reasonable range, e.g., -30s to +30s
  //     // return Math.max(-30000, Math.min(30000, newOffset));
  //     return newOffset;
  //   });
  //   setShowControls(true); // Keep controls visible and reset timer
  // };
  
  // const toggleSubtitles = () => {
  //   const newEnabledState = !subtitlesEnabled;
  //   setSubtitlesEnabled(newEnabledState);
  //   // saveSubtitlesEnabledState(newEnabledState); // Persist the toggled state
  //   if (!newEnabledState) { // If turning subtitles OFF
  //     setSubtitleOffset(0); // Reset offset
  //   }
  //   setShowControls(true); // Keep controls visible
  // };
  
  
  
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
    setInitialModalScrollDone(false); // Reset scroll flag when changing seasons
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
  // Scroll to current season when modal opens
  useEffect(() => {
    if (showEpisodesModal && allSeasonsData.length > 0 && selectedSeasonForModal && seasonListModalRef.current) {
      const seasonIndex = allSeasonsData.findIndex(s => s.season_number === selectedSeasonForModal);
      if (seasonIndex !== -1) {
        setTimeout(() => {
          seasonListModalRef.current?.scrollToIndex({
            index: seasonIndex,
            animated: true,
            viewPosition: 0.5, // Center the selected season
          });
        }, 200);
      }
    }
  }, [showEpisodesModal, allSeasonsData, selectedSeasonForModal]);

  // Scroll to current episode when episodes are loaded
  useEffect(() => {
    if (showEpisodesModal && !initialModalScrollDone && episodesForModal.length > 0 && episodeListModalRef.current) {
      const currentEpisodeIndex = episodesForModal.findIndex(ep => 
        ep.season_number === season && ep.episode_number === episode
      );
      
      if (currentEpisodeIndex !== -1) {
        setTimeout(() => {
          episodeListModalRef.current?.scrollToIndex({
            index: currentEpisodeIndex,
            animated: true,
            viewPosition: 0.5, // Center the current episode
          });
          setInitialModalScrollDone(true);
        }, 300);
      } else {
        setInitialModalScrollDone(true);
      }
    }
  }, [showEpisodesModal, episodesForModal, season, episode, initialModalScrollDone]);

  // Reset scroll flag when modal closes
  useEffect(() => {
    if (!showEpisodesModal) {
      setInitialModalScrollDone(false);
    }
  }, [showEpisodesModal]);

  // --- End Episodes Viewer Modal Logic ---

  
    // --- Subtitles Modal Logic ---
    // const toggleSubtitlesModal = async () => {
    //   if (!showSubtitlesModal) {
    //     if (player && isPlaying) {
    //       try {
    //         player.pause();
    //       } catch (e) {
    //         console.error("Error pausing video on subtitles modal open:", e);
    //       }
    //     }
    //     try {
    //       // Ensure landscape orientation for the modal
    //       await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    //       await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    //     } catch (e) {
    //       console.error("Failed to lock orientation for subtitles modal:", e);
    //     }
    //     // Fetch available subtitle languages if not already fetched or if they might be stale
    //     // if (Object.keys(availableLanguages).length === 0) { // Simple check for now
    //     //   findSubtitles();
    //     // }
    //     setShowSubtitlesModal(true);
    //   } else {
    //     setShowSubtitlesModal(false);
    //     try {
    //       // Re-lock to landscape if it was changed by something else
    //       await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    //     } catch (e) {
    //       console.error("Failed to re-lock to LANDSCAPE on subtitles modal close:", e);
    //     }
    //   }
    //   setShowControls(true); // Keep controls visible and reset timer
    // };
    // --- End Subtitles Modal Logic ---
  // --- Listener Handlers ---
  const lastSaveTimeRef = useRef(0);
  
  // Refs for episode modal scrolling
  const seasonListModalRef = useRef(null);
  const episodeListModalRef = useRef(null);
  const [initialModalScrollDone, setInitialModalScrollDone] = useState(false);

  const handlePositionChange = (event) => {
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
    // updateCurrentSubtitle(currentEventTime);
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
    const status = event?.status ?? event;
    if (isUnmounting) return;

    const clearBufferingTimer = () => {
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current);
        bufferingTimeoutRef.current = null;
      }
    };

    const startBufferingTimer = () => {
      clearBufferingTimer(); // Always clear previous before starting new
      bufferingTimeoutRef.current = setTimeout(() => {
        // Check if player exists AND alert is not already visible
        if (player && !showBufferingAlert) {
          runOnJS(setShowBufferingAlert)(true);
        }
      }, BUFFER_TIMEOUT * 1000);
    };

    let newIsBufferingVideoState = isBufferingVideo;
    let newLoadingState = loading;
    let newIsInitialLoadingState = isInitialLoading;

    // Determine current buffering status from player
    const isPlayerActuallyBuffering = (typeof status === 'object' && status.isBuffering) ||
                                  (typeof status === 'string' && status === 'loading');

    if (isPlayerActuallyBuffering) {
      newIsBufferingVideoState = true;
      startBufferingTimer();
    } else {
      newIsBufferingVideoState = false;
      clearBufferingTimer();
    }

    // Determine if video is loaded/ready
    const isPlayerLoadedAndReady = (typeof status === 'object' && status.isLoaded && !status.isBuffering) ||
                               (typeof status === 'string' && status === 'readyToPlay');

    // Determine if video has errored or failed
    const hasPlayerErroredOrFailed = (typeof status === 'string' && (status === 'error' || status === 'failed')) ||
                                (typeof status === 'object' && status.error); // Check for error object in status

    // Determine if video has finished
    const hasPlayerFinishedPlaying = (typeof status === 'string' && status === 'finished');

    if (isPlayerLoadedAndReady) {
      newIsInitialLoadingState = false;
      newLoadingState = false;
    } else if (hasPlayerErroredOrFailed) {
      newIsInitialLoadingState = false; // Allow error screen to show
      newLoadingState = false;
    } else if (hasPlayerFinishedPlaying) {
      newLoadingState = false;
      // newIsInitialLoadingState should already be false if playback finished
    } else {
      // Not loaded, not errored, not finished.
      // If isInitialLoading is still true, newLoadingState will be true.
      // If past initial loading, general loading should be true.
      if (!newIsInitialLoadingState) {
        newLoadingState = true;
      }
    }

    // Ensure 'loading' is true if 'isInitialLoading' is true.
    if (newIsInitialLoadingState) {
      newLoadingState = true;
    }

    // Apply state changes if they differ to avoid unnecessary re-renders
    if (newIsBufferingVideoState !== isBufferingVideo) {
      setIsBufferingVideo(newIsBufferingVideoState);
    }
    if (newIsInitialLoadingState !== isInitialLoading) {
      setIsInitialLoading(newIsInitialLoadingState);
    }
    // Important: setLoading after setIsInitialLoading, as newLoadingState might depend on newIsInitialLoadingState
    if (newLoadingState !== loading) {
      setLoading(newLoadingState);
    }

    // Handle duration and natural size (these don't affect loading indicators directly)
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

    // Autoplay on finish
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
    // Ensure getStreamHeaders is called here to get the latest headers
    // based on potentially updated streamReferer state.
    //player.replaceAsync({ uri: videoUrl, headers: getStreamHeaders() });

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

    
        // Reset subtitle states for new media
        // setAvailableLanguages({});
        // setSelectedLanguage(null);
        // setParsedSubtitles([]);
        // setCurrentSubtitleText('');
        // // initialSubtitlePreferenceAppliedRef is reset in initializePlayer
    const setOrientationAndHideUI = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        console.error("Failed to set orientation or hide UI:", e);
      }
    };

    const checkSavedProgress = async () => {
      if (isLive) {
        return;
      }
      try {
        const progress = await getWatchProgress(mediaId);
        if (progress && progress.position && progress.season === season && progress.episode === episode) {
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

    const setupLiveStreamExtraction = async () => {
      if (!isMounted) return;
      setCurrentAttemptingSource('StreamEast');
      
      try {
        const result = await extractLiveStreamM3U8(streameastUrl);
        
        if (!isMounted || streamExtractionComplete) {
          return;
        }
        
        if (result && result.url) {
          setVideoUrl(result.url);
          player.uri = result.url;
          setStreamReferer(result.referer);
          setCurrentPlayingSourceName('StreamEast');
          setStreamExtractionComplete(true);
          setCurrentAttemptingSource(null);
          setIsLiveStream(true);
        } else {
          throw new Error('Failed to extract live stream URL');
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('[VideoPlayerScreen] Live stream extraction error:', err);
        setError({ 
          message: 'Failed to load live stream. The stream may have ended or is no longer available.',
          isLiveStreamError: true 
        });
        setStreamExtractionComplete(true);
        setLoading(false);
        setIsInitialLoading(false);
        setCurrentAttemptingSource(null);
      }
    };

    const setupStreamExtraction = () => {
      if (!isMounted) return;
      setCurrentAttemptingSource(null);

      extractM3U8Stream(
        mediaId, mediaType, season, episode,
        (streamUrl, referer, sourceName) => {
          if (!isMounted || streamExtractionComplete) {
            return;
          }
          saveStreamUrl(contentId, streamUrl, referer, sourceName);
          setVideoUrl(streamUrl);
          player.uri = streamUrl;
          setStreamReferer(referer);
          setCurrentPlayingSourceName(sourceName);
          setStreamExtractionComplete(true);
          setManualWebViewVisible(false);
          setCaptchaUrl(null);
          setCurrentWebViewConfig(null);
          setCurrentAttemptingSource(null);
        },
        // onSourceError: (error, sourceName) => void
        (err, sourceName) => {
          if (!isMounted) return;
          console.warn(`[VideoPlayerScreen] Error from source ${sourceName}: ${err.message}`);
          // extractM3U8Stream handles trying the next source.
          // We could update UI to show "Failed with source X, trying Y..."
          // For now, just log it. The final error will be handled by onAllSourcesFailed.
        },
        // onAllSourcesFailed: (finalError) => void
        (finalError) => {
          if (!isMounted) return;

          if (currentEpisodeAirDateFromParams && isFutureDate(currentEpisodeAirDateFromParams)) {
            const formattedAirDate = new Date(currentEpisodeAirDateFromParams).toLocaleDateString(undefined, {
              month: 'long', day: 'numeric', year: 'numeric'
            });
            setError({
              message: `This episode (${episodeTitle || `S${season}E${episode}`}) is scheduled to air on ${formattedAirDate}. Streaming sources are typically unavailable until after the air date.`,
              isUnreleased: true
            });
          } else {
            setError({ message: `All sources failed: ${finalError.message || 'Could not find a playable stream.'}` });
          }
          setStreamExtractionComplete(true); // Mark as complete to stop further attempts
          setLoading(false);
          setIsInitialLoading(false);
          setManualWebViewVisible(false);
          setCaptchaUrl(null);
          setCurrentWebViewConfig(null);
          setCurrentAttemptingSource(null);
        },
        // onManualInterventionRequired: (manualUrl, sourceName) => void
        (urlForCaptcha, sourceName) => {
          if (!isMounted) return;
          setCaptchaUrl(urlForCaptcha);
          setManualWebViewVisible(true);
          // The currentWebViewConfig should already be set by provideWebViewConfigForAttempt
          // for this source.
        },
        // provideWebViewConfigForAttempt: (webViewConfig, sourceName, attemptKey) => void
        (configForAttempt, sourceName, key) => {
          if (!isMounted) return;
          setCurrentAttemptingSource(sourceName);
          setCurrentWebViewConfig(configForAttempt);
          setCurrentSourceAttemptKey(key);
          setManualWebViewVisible(false); // Hide manual view if a new attempt starts
          setCaptchaUrl(null);
        }
      );
    };

    const initializePlayer = async () => {
      await setOrientationAndHideUI();
      
      if (isLive) {
        setIsLiveStream(true);
        if (isMounted) {
          setupLiveStreamExtraction();
        }
        return;
      }

      await checkSavedProgress();

      const isAutoPlayEnabled = await getAutoPlaySetting();
      if (isMounted) setAutoPlayEnabled(isAutoPlayEnabled);

      const cachedStreamData = await getCachedStreamUrl(contentId);
      if (cachedStreamData && cachedStreamData.url && isMounted) {
        setVideoUrl(cachedStreamData.url);
        setStreamReferer(cachedStreamData.referer);
        setCurrentPlayingSourceName(cachedStreamData.sourceName);
        setStreamExtractionComplete(true);
      } else if (isMounted) {
        setupStreamExtraction();
      }
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
        if (bufferingTimeoutRef.current) {
          clearTimeout(bufferingTimeoutRef.current);
          bufferingTimeoutRef.current = null;
        }
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, contentId, mediaId, mediaType, season, episode, retryAttempts, player]);
  // --- End Main Setup Effect ---
  
  // --- Live Stream Error Handling ---
  useEffect(() => {
    if (error && error.isLiveStreamError) {
      Alert.alert(
        'Live Stream Ended',
        'The live stream has ended or is no longer available.',
        [
          {
            text: 'OK',
            onPress: () => {
              handleGoBack();
            }
          }
        ]
      );
    }
  }, [error]);
  // --- End Live Stream Error Handling ---
  
  
  // --- Source Selection Modal Logic ---
  const openChangeSourceModal = async () => {
    if (isInitialLoading || !player) return;

    if (player.isPlaying) {
      try {
        await player.pause();
      } catch (e) { console.warn("Error pausing video before opening source modal:", e); }
    }

    const sources = getActiveStreamSources();
    setAvailableSourcesList(sources);
    
    const initialStatus = {};
    sources.forEach(s => { initialStatus[s.name] = 'idle'; });
    setSourceAttemptStatus(initialStatus);

    setShowSourceSelectionModal(true);
    setShowControls(true); // Keep controls visible when modal is open
  };

  const handleSelectSourceFromModal = async (selectedSourceInfo) => {
    if (isChangingSource || !player) return; // Prevent multiple concurrent attempts from modal

    setIsChangingSource(true); // Indicates an attempt from the modal is active
    setSourceAttemptStatus(prev => ({ ...prev, [selectedSourceInfo.name]: 'loading' }));

    const currentPositionToResume = player.currentTime || position || 0;

    if (player.isPlaying) {
      try {
        await player.pause();
      } catch (e) { console.warn("Error pausing video on source select:", e); }
    }

    if (contentId) {
      await clearSpecificStreamFromCache(contentId);
    }

    setError(null);
    setStreamExtractionComplete(false); // New attempt, so not complete yet
    setCurrentWebViewConfig(null);
    setCurrentSourceAttemptKey(`specific-source-${selectedSourceInfo.name}-${Date.now()}`);
    setCurrentAttemptingSource(selectedSourceInfo.name); // For loading text if needed
    setManualWebViewVisible(false);
    setCaptchaUrl(null);

    const onStreamFound = (streamUrl, referer, sourceName) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'failed' })); // Or 'idle' if unmounted
        return;
      }

      saveStreamUrl(contentId, streamUrl, referer, sourceName);
      
      setStreamReferer(referer);
      setCurrentPlayingSourceName(sourceName);
      setResumeTime(currentPositionToResume);
      setVideoUrl(streamUrl); // This triggers the useEffect to replace source and play
      setCurrentPlayingSourceName(sourceName);
      setResumeTime(currentPositionToResume);
      setVideoUrl(streamUrl); // This triggers the useEffect to replace source and play

      setStreamExtractionComplete(true);
      setManualWebViewVisible(false);
      setCaptchaUrl(null);
      setCurrentWebViewConfig(null);
      setCurrentAttemptingSource(null);
      setError(null);
      setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'success' }));
      setIsChangingSource(false);
      setShowSourceSelectionModal(false); // Close modal on success
    };

    const onSourceErrorCallback = (err, sourceName) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      console.warn(`[VideoPlayerScreen] SpecificSource: Error from source ${sourceName}: ${err.message}`);
      setSourceAttemptStatus(prev => ({ ...prev, [sourceName]: 'failed' }));
      // Do not set global error, modal shows item-specific error
      // If it was a CAPTCHA that failed, hide the webview
      if (manualWebViewVisible) {
        setManualWebViewVisible(false);
        setCaptchaUrl(null);
      }
      setCurrentWebViewConfig(null); // Clear config for this failed attempt
      setCurrentAttemptingSource(null);
      setIsChangingSource(false); // Allow another selection
      // Keep modal open
    };

    const provideWebViewConfigForAttempt = (configForAttempt, sourceName, key) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      setCurrentAttemptingSource(sourceName); // This might be shown if modal is closed during CAPTCHA
      setCurrentWebViewConfig(configForAttempt);
      setCurrentSourceAttemptKey(key);
      setManualWebViewVisible(false);
      setCaptchaUrl(null);
    };
    
    const onManualInterventionRequired = (urlForCaptcha, sourceName) => {
      if (isUnmounting) {
        setIsChangingSource(false);
        return;
      }
      setCaptchaUrl(urlForCaptcha);
      setManualWebViewVisible(true); // Show the main screen's WebView for CAPTCHA
      // Keep sourceAttemptStatus as 'loading' for this source in the modal
      // Modal might be closed by user, or remain open. CAPTCHA webview is on main screen.
      // setIsChangingSource remains true
    };

    extractStreamFromSpecificSource(
      selectedSourceInfo,
      mediaId, mediaType, season, episode,
      onStreamFound,
      onSourceErrorCallback, // Use the renamed callback
      onManualInterventionRequired,
      provideWebViewConfigForAttempt
    );
  };
  // --- End Source Selection Modal Logic ---
  // Effect to call findSubtitles when a non-cached stream becomes ready,
  // to facilitate auto-application of subtitle preference.
  // useEffect(() => {
  //   if (videoUrl && streamExtractionComplete &&
  //       Object.keys(availableLanguages).length === 0 &&
  //       !loadingSubtitles && !initialSubtitlePreferenceAppliedRef.current) {
  //     // If video is ready from extraction (not cache), and we haven't fetched subs yet,
  //     // and haven't tried applying preference (which implies subs weren't fetched for it).
  //     // findSubtitles();
  //   }
  // }, [videoUrl, streamExtractionComplete, availableLanguages, loadingSubtitles]); // findSubtitles

  // // Effect to apply loaded subtitle preference once languages are available
  // useEffect(() => {
  //   const prefLang = preferredSubtitleLanguageLoadedRef.current;

  //   if (player && Object.keys(availableLanguages).length > 0 && !initialSubtitlePreferenceAppliedRef.current) {
  //     if (prefLang !== null && availableLanguages[prefLang]) {
  //       // selectSubtitle(prefLang); // This will also save the preference again, which is fine.
  //     } else if (prefLang === null) {
  //       // selectSubtitle(null); // Ensure "None" is selected if that's the preference
  //     }
  //     // Mark as attempted regardless of success to prevent re-application for this media load
  //     initialSubtitlePreferenceAppliedRef.current = true;
  //   }
  // }, [availableLanguages, player]); // selectSubtitle

  // --- Corrective Effect for Stuck Buffering Spinner ---
  useEffect(() => {
    // If isPlaying becomes true, and the buffering spinner is still on,
    // it's likely stuck from a previous seek. Force it off.
    if (isPlaying && isBufferingVideo) {
      setIsBufferingVideo(false);
      // Also ensure general loading is off if it's not the initial load phase
      if (loading && !isInitialLoading) {
        setLoading(false);
      }
    }
  }, [isPlaying, isBufferingVideo, loading, isInitialLoading]); // Dependencies
  // --- End Corrective Effect ---

  // --- Save Progress ---
  const saveProgress = (currentTime) => {
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
              navRef.replace('DetailScreen', { mediaId: mediaId, mediaType: mediaType, title: title });
              // if (navRef.canGoBack()) {
              //   navRef.goBack();
              // } else {
              //   // If cannot go back (e.g., deep link), navigate to a default screen
              //   navRef.navigate('Home');
              // }
            } catch (e) {
              console.error("Navigation error:", e);
              // Fallback navigation if goBack fails unexpectedly
              try { navRef.replace('Home'); } catch (e2) { }
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
    if (bufferingTimeoutRef.current) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }
    setShowBufferingAlert(false);
    setShowNextEpisodeButton(false);
    nextEpisodeDetailsRef.current = null;
    setIsFindingNextEpisode(false);
    setError(null);
    setLoading(true);
    setIsInitialLoading(true);
    setStreamExtractionComplete(false);
    setVideoUrl(null);
    setCurrentWebViewConfig(null); // Reset current WebView config
    setCurrentSourceAttemptKey(`reload-${Date.now()}`); // New key for WebView
    setCurrentAttemptingSource(null);
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
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return '00:00';
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    return hours > 0
      ? `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
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

  // --- Buffering Alert Modal ---
  const handleKeepBuffering = () => {
    setShowBufferingAlert(false);
    if (bufferingTimeoutRef.current) {
      clearTimeout(bufferingTimeoutRef.current);
      bufferingTimeoutRef.current = null;
    }
    // If player is still buffering, the statusChange listener will eventually
    // call startBufferingTimer() again, effectively restarting the 30s countdown.
  };

  const handleRetryExtractionFromAlert = () => {
    setShowBufferingAlert(false);
    if (contentId) {
      clearSpecificStreamFromCache(contentId);
    }
    handleReload();
  };

  const renderBufferingAlertModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showBufferingAlert}
      supportedOrientations={['landscape-left', 'landscape-right', 'landscape']} // Added to respect screen lock
      onRequestClose={() => {
        // Android back button press
        handleKeepBuffering();
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.bufferingAlertModalContent}>
          <Text style={styles.modalTitle}>Still Buffering?</Text>
          <Text style={styles.bufferingAlertText}>
            The video has been buffering for a while.
          </Text>
          <View style={styles.bufferingAlertActions}>
            <TouchableOpacity style={[styles.bufferingAlertButton, styles.bufferingAlertKeepButton]} onPress={handleKeepBuffering}>
              <Text style={styles.bufferingAlertButtonText}>Keep Buffering</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bufferingAlertButton, styles.bufferingAlertRetryButton]} onPress={handleRetryExtractionFromAlert}>
              <Text style={styles.bufferingAlertButtonText}>Try Re-Extract</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
  // --- End Buffering Alert Modal ---

  // --- Render ---

// const renderSubtitleSelectionModal = () => ( ... ); // Removed entire function

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
    const isEpisodeUnreleased = isFutureDate(episodeData.air_date);

    return (
      <TouchableOpacity
        style={[
          styles.episodeItemHorizontal,
          isCurrentEpisode && styles.currentEpisodeItemHorizontal
        ]}
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
            air_date: episodeData.air_date,
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
          {isEpisodeUnreleased && (
            <View style={styles.unreleasedBadgeContainer}>
              <View style={styles.unreleasedBadge}>
                <Text style={styles.unreleasedBadgeText}>UNRELEASED</Text>
              </View>
            </View>
          )}
          {progressPercent > 0 && progressPercent < 1 && !isEpisodeUnreleased && (
            <View style={styles.episodeProgressOverlayHorizontal}>
              <View style={[styles.episodeProgressBarHorizontal, { width: `${progressPercent * 100}%` }]} />
            </View>
          )}
          {progressPercent >= 1 && !isEpisodeUnreleased && (
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
                    ref={seasonListModalRef}
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
                    getItemLayout={(data, index) => ({
                      length: 130, // Approximate width of a season tab
                      offset: 130 * index,
                      index,
                    })}
                    onScrollToIndexFailed={(info) => {
                      // Fallback for when layout isn't ready
                      const wait = new Promise(resolve => setTimeout(resolve, 200));
                      wait.then(() => {
                        seasonListModalRef.current?.scrollToOffset({
                          offset: info.averageItemLength * info.index,
                          animated: true,
                        });
                      });
                    }}
                  />
                </View>
              )}
              {isLoadingModalEpisodes && episodesForModal.length === 0 ? (
                  <View style={styles.centeredLoader}>
                    <ActivityIndicator size="large" color="#E50914" />
                  </View>
              ) : episodesForModal.length > 0 ? (
                <FlatList
                  ref={episodeListModalRef}
                  horizontal // Changed to horizontal
                  data={episodesForModal.sort((a, b) => a.episode_number - b.episode_number)}
                  renderItem={renderEpisodeItem}
                  keyExtractor={(item) => `ep-${item.id || (item.season_number + '_' + item.episode_number)}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.episodesListContentHorizontal}
                  initialNumToRender={3}
                  maxToRenderPerBatch={5}
                  windowSize={7}
                  getItemLayout={(data, index) => ({
                    length: 195, // Episode item width (180) + marginRight (15)
                    offset: 195 * index,
                    index,
                  })}
                  onScrollToIndexFailed={(info) => {
                    // Fallback for when layout isn't ready
                    const wait = new Promise(resolve => setTimeout(resolve, 200));
                    wait.then(() => {
                      episodeListModalRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true,
                      });
                    });
                  }}
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
    // If findNextEpisode hasn't completed (i.e., data isn't ready), don't show anything.
    // showNextEpisodeButton (state) is true if next episode data is fetched/determined.
    if (!showNextEpisodeButton) {
      return null;
    }

    const timeLeft = duration - position;

    const isWithinFortyFiveSecondWindow = duration > 0 && timeLeft < VIDEO_END_THRESHOLD_SECONDS;
    const isWithinTwoMinuteWindowButNotFortyFive = duration > 0 &&
                                               timeLeft < TWO_MINUTE_THRESHOLD_SECONDS &&
                                               timeLeft >= VIDEO_END_THRESHOLD_SECONDS;

    // Determine if the button should be rendered at all based on time windows and data readiness
    if (!showNextEpisodeButton || (!isWithinFortyFiveSecondWindow && !isWithinTwoMinuteWindowButNotFortyFive)) {
      return null; // Not in any relevant time window or data not ready
    }

    const nextDetails = nextEpisodeDetailsRef.current;
    const buttonText = nextDetails
      ? `Next: S${nextDetails.season} E${nextDetails.episode}`
      : "Back to Home";

    let buttonOpacityStyle;
    if (isWithinFortyFiveSecondWindow) {
      // Always visible and fully opaque if < 45s
      buttonOpacityStyle = { opacity: 1 };
    } else if (isWithinTwoMinuteWindowButNotFortyFive) {
      // Fades with controls if between 2min and 45s.
      // opacityAnim is controlled by the showControls state.
      // When showControls becomes false, opacityAnim animates to 0.
      // The button remains mounted (due to being in the time window), allowing the fade-out.
      buttonOpacityStyle = { opacity: opacityAnim };
    }
    // No else needed here, as the initial check handles cases outside relevant windows.

    return (
      <Animated.View style={[styles.nextEpisodeContainer, buttonOpacityStyle]}>
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

      {/* WebView for stream extraction / CAPTCHA - uses currentWebViewConfig */}
      {currentWebViewConfig && !streamExtractionComplete && (
        <View style={(manualWebViewVisible || __DEV__) ? styles.visibleWebViewForCaptcha : styles.hiddenWebView}>
          <WebView
            key={currentSourceAttemptKey} // Use the attempt key to force re-mount
            source={manualWebViewVisible && captchaUrl ? { uri: captchaUrl, headers: currentWebViewConfig.source.headers } : currentWebViewConfig.source}
            injectedJavaScript={currentWebViewConfig.injectedJavaScript}
            onMessage={currentWebViewConfig.onMessage}
            onError={currentWebViewConfig.onError} // Directly use the one from the current config
            onHttpError={currentWebViewConfig.onHttpError} // Directly use
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            mixedContentMode="compatibility"
            incognito={true}
            thirdPartyCookiesEnabled={false}
            onShouldStartLoadWithRequest={() => true}
            injectedJavaScriptBeforeContentLoaded={injectedJavaScript} // General JS, not source-specific
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
            {manualWebViewVisible ? 'Please complete the CAPTCHA below.' :
             streamExtractionComplete ? 'Loading video...' :
             currentAttemptingSource ? `Extracting from ${currentAttemptingSource}...` : 'Initializing stream extraction...'}
          </Text>
          {!streamExtractionComplete && !manualWebViewVisible && currentAttemptingSource && (
            <Text style={styles.loadingSubText}>
              Trying source: {currentAttemptingSource}. This may take a moment...
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
              allowsVideoFrameAnalysis={false}
              startsPictureInPictureAutomatically={true}
              resizeMode="contain" // Base resize mode is contain
              // pointerEvents="none" // Prevent VideoView from interfering with gestures on parent Animated.View
            />
          </Animated.View>
        </GestureDetector>
      )}

      
            {/* Subtitle Text Display */}
            {/* {subtitlesEnabled && currentSubtitleText ? (
              <View style={styles.subtitleTextContainer} pointerEvents="none">
                <Text style={styles.subtitleText}>{currentSubtitleText}</Text>
              </View>
            ) : null} */}
          {/* Buffering Indicator */}
          {isBufferingVideo && !isInitialLoading && (
            <View style={styles.bufferingIndicatorContainer}>
              <ActivityIndicator size="large" color="#FFF" />
            </View>
          )}


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
                  <Text style={styles.seasonEpisodeText}>{` (S${season}:E${episode})`}</Text>
                )}
              </Text>
            </View>
            {/* Subtitle Toggle/Selection Buttons */}
            <View style={styles.topRightButtons}>
              {/* Subtitle Offset Controls - Show only if subtitles are enabled and selected */}
              {/* {subtitlesEnabled && selectedLanguage && (
                <>
                  <TouchableOpacity onPress={() => adjustSubtitleOffset(-SUBTITLE_OFFSET_INCREMENT_MS)} style={styles.controlButton}>
                    <Ionicons name="remove-circle-outline" size={22} color="white" />
                  </TouchableOpacity>
                  <Text style={styles.subtitleOffsetDisplay}>
                    {(subtitleOffset / 1000).toFixed(1)}s
                  </Text>
                  <TouchableOpacity onPress={() => adjustSubtitleOffset(SUBTITLE_OFFSET_INCREMENT_MS)} style={styles.controlButton}>
                    <Ionicons name="add-circle-outline" size={22} color="white" />
                  </TouchableOpacity>
                </>
              )} */}

              {!isLiveStream && (
                <TouchableOpacity onPress={openChangeSourceModal} style={styles.controlButton} disabled={isInitialLoading || !videoUrl || showSourceSelectionModal}>
                  {isChangingSource ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="cloudy" size={24} color="white" />
                  )}
                </TouchableOpacity>
              )}

              {mediaType === 'tv' && !isLiveStream && (
                <TouchableOpacity onPress={toggleEpisodesModal} style={styles.controlButton}>
                  <Ionicons name="albums-outline" size={24} color="white" />
                </TouchableOpacity>
              )}
              {/* <TouchableOpacity onPress={toggleSubtitlesModal} style={styles.controlButton}>
                <Ionicons
                  name="logo-closed-captioning"
                  size={24}
                  color={'white'} // Dynamic color // subtitlesEnabled && selectedLanguage ? '#E50914' : 'white'
                />
              </TouchableOpacity> */}
              {Platform.OS === 'ios' && (
                <View style={styles.airPlayButtonContainer}>
                  <VideoAirPlayButton
                    player={player}
                    tint="white"
                    prioritizeVideoDevices={true}
                    style={styles.airPlayButton}
                  />
                </View>
              )}
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
              if (isLiveStream) {
                const displayPosition = isSeeking && seekPreviewPosition !== null ? seekPreviewPosition : position;
                const progressPercent = (displayPosition / Math.max(duration, 1)) * 100;
                return (
                  <>
                    <View style={styles.timeText} />
                    <View style={styles.progressBar} ref={progressBarRef}>
                      <View style={[styles.progressFill, { width: `${progressPercent}%` }]}/>
                      <View style={[styles.progressThumb, { left: `${progressPercent}%` }]}/>
                      <View style={styles.progressTouchArea} {...progressPanResponder.panHandlers}/>
                    </View>
                    <View style={styles.liveIndicatorContainer}>
                      <View style={[styles.liveCircle, { backgroundColor: isAtLiveEdge ? '#FF0000' : '#888888' }]} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  </>
                );
              } else {
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
              }
            })()}
          </SafeAreaView>
        </>
      </Animated.View>

      {/* Render Next Episode Button OUTSIDE the fading wrapper */}
      {renderNextEpisodeButton()}

      {/* Subtitle Selection Modal - Removed */}
      {/* {renderSubtitleSelectionModal()} */}
    
      {/* Episodes Viewer Modal */}
      {mediaType === 'tv' && renderEpisodesModal()}

      {/* Buffering Alert Modal */}
      {renderBufferingAlertModal()}

      {/* Source Selection Modal */}
      <SourceSelectionModal
        visible={showSourceSelectionModal}
        onClose={() => {
          setShowSourceSelectionModal(false);
          if (isChangingSource) { // If an attempt was active and modal closed manually
            // Optionally cancel the ongoing WebView attempt here if possible, or just reset state
            setIsChangingSource(false);
            setManualWebViewVisible(false);
            setCaptchaUrl(null);
            setCurrentWebViewConfig(null);
          }
        }}
        sources={availableSourcesList}
        onSelectSource={handleSelectSourceFromModal}
        currentAttemptStatus={sourceAttemptStatus}
        currentPlayingSourceName={currentPlayingSourceName}
      />

      {/* Subtitles Selection Modal (New) */}
      {/* <SubtitlesModal
        visible={showSubtitlesModal}
        onClose={() => {
          setShowSubtitlesModal(false);
          // Ensure orientation is re-locked if necessary, though toggleSubtitlesModal handles this
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
            .catch(e => console.error("Failed to re-lock to LANDSCAPE on SubtitlesModal direct close:", e));
        }}
        availableLanguages={Object.values(availableLanguages || {}).map(langInfo => ({
          code: langInfo.language,
          name: "" // getLanguageName(langInfo.language) // Use utility for consistent naming
        }))}
        selectedLanguage={selectedLanguage} // Pass the actual selected language code
        onSelectLanguage={(langCode) => {
          // selectSubtitle(langCode);
          setShowSubtitlesModal(false); // Close modal after selection is initiated
        }}
        loading={loadingSubtitles}
      /> */}
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
  bufferingIndicatorContainer: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -18 }, { translateY: -18 }], zIndex: 4 },
  errorContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', zIndex: 10, padding: 20 },
  errorText: { color: '#fff', marginBottom: 10, fontSize: 16, fontWeight: 'bold' },
  errorDetail: { color: '#888', marginBottom: 20, textAlign: 'center', lineHeight: 18, width: "60%" },
  retryButton: { backgroundColor: '#E50914', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5, marginBottom: 10 },
  retryButtonText: { color: '#fff', fontWeight: 'bold' },
  goBackButton: { backgroundColor: '#222', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
  goBackButtonText: { color: '#fff', fontWeight: 'bold' },
  overlayTouchable: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', zIndex: 1 },
  overlayBackground: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 4 },
  controlsWrapper: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  controlsContainer: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', padding: 10, alignItems: 'center', justifyContent: 'space-between' },
  backButton: { padding: 8 },
  titleContainer: { flex: 1, marginLeft: 10, marginRight: 10, justifyContent: 'center' }, // Added justifyContent
  titleText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  currentSourceText: {
    color: '#ccc',
    fontSize: 11,
    // marginLeft: 10, // If title is on its own line
    marginTop: 2, // Space below title
    fontStyle: 'italic',
  },
  topRightButtons: { flexDirection: 'row' },
  controlButton: { padding: 8, marginLeft: 8 },
  airPlayButtonContainer: { marginLeft: 8, justifyContent: 'center', alignItems: 'center' },
  airPlayButton: { width: 32, height: 32, color: 'white', borderColor: 'white' },
  brightnessSliderContainer: { position: 'absolute', left: 40, top: '20%', bottom: '20%', width: 40, justifyContent: 'center', alignItems: 'center' },
  brightnessIcon: { marginBottom: 55 },
  brightnessSlider: { width: 150, height: 30, transform: [{ rotate: '-90deg' }] },
  centerControls: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  playPauseButton: { borderRadius: 50, padding: 12, marginHorizontal: 30 },
  seekButton: { borderRadius: 40, padding: 8 },
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  progressBar: { flex: 1, height: 4, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginHorizontal: 15, borderRadius: 2, overflow: 'visible' },
  progressFill: { height: '100%', backgroundColor: '#E50914', borderRadius: 2 },
  progressThumb: { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E50914', transform: [{ translateX: -6 }], zIndex: 3 },
  progressTouchArea: { position: 'absolute', height: 20, width: '100%', top: -8, backgroundColor: 'transparent', zIndex: 4 },
  timeText: { color: '#fff', fontSize: 14, minWidth: 40, textAlign: 'center' },
  liveIndicatorContainer: { flexDirection: 'row', alignItems: 'center', minWidth: 60, justifyContent: 'center' },
  liveCircle: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  liveText: { color: '#fff', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
  
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
  subtitleOffsetDisplay: {
    color: 'white',
    fontSize: 13, // Slightly smaller to fit
    fontWeight: 'bold',
    marginHorizontal: 3, // Reduced margin
    paddingHorizontal: 3,
    alignSelf: 'center', // Vertically align with buttons
    minWidth: 45, // Ensure enough space for "-xx.xs"
    textAlign: 'center',
    // backgroundColor: 'rgba(0,0,0,0.3)', // Optional subtle background
    // borderRadius: 3,
  },
  // --- Subtitle Styles ---
  subtitleTextContainer: {
    position: 'absolute',
    bottom: 30, // Lowered position
    left: '5%', // Use percentage for better responsiveness
    right: '5%',
    alignItems: 'center', // Center the text block itself
    zIndex: 7,
    pointerEvents: 'none',
  },
  subtitleText: {
    fontSize: Platform.OS === 'android' ? 16 : 18, // Slightly smaller on Android for better fit
    color: 'white',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)', // Darker, slightly more opaque background
    paddingHorizontal: 10, // More horizontal padding
    paddingVertical: 5,    // More vertical padding
    borderRadius: 5,       // Slightly more rounded corners
    textShadowColor: 'rgba(0, 0, 0, 0.9)', // Stronger shadow for outline effect
    textShadowOffset: { width: 1, height: 1.5 },
    textShadowRadius: 2,
    elevation: 1, // For Android shadow, subtle
    // Consider adding maxWidth if lines get too long on very wide screens,
    // but usually, subtitle lines are short.
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
    maxHeight: 380,
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
    height: 220,
    justifyContent: 'flex-start', // Align content to the top
  },
  currentEpisodeItemHorizontal: {
    backgroundColor: 'rgb(46, 46, 46)'
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
    backgroundColor: 'rgb(75, 75, 75)',
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
    paddingTop: 5
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
    marginBottom: 4,
  },
  unreleasedBadgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    zIndex: 1, // Above thumbnail image, below progress/watched overlays if they were also present
  },
  unreleasedBadge: {
    backgroundColor: '#000',
    borderColor: '#fff',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  unreleasedBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
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

  // --- Buffering Alert Modal Styles ---
  bufferingAlertModalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#282828', // Darker background
    borderRadius: 12,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 15,
  },
  bufferingAlertText: {
    color: '#E0E0E0', // Lighter text for better contrast
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  bufferingAlertActions: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Space out buttons
    width: '100%',
  },
  bufferingAlertButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120, // Ensure buttons have a decent width
    alignItems: 'center',
    marginHorizontal: 10, // Add some space between buttons
  },
  bufferingAlertKeepButton: {
    backgroundColor: '#4A4A4A', // Neutral dark gray
  },
  bufferingAlertRetryButton: {
    backgroundColor: '#E50914', // Theme red for retry
  },
  bufferingAlertButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  // --- End Buffering Alert Modal Styles ---
});
export default VideoPlayerScreen;