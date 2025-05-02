import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler, Text, TouchableOpacity, Platform, PanResponder, Animated, Easing } from 'react-native'; // Import Animated and Easing
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness'; // Import Brightness
import Slider from '@react-native-community/slider'; // Import Slider
import { VideoView, useVideoPlayer } from 'expo-video';
import { WebView } from 'react-native-webview';
import { getStreamingUrl } from '../api/vidsrcApi';
import { saveWatchProgress, getWatchProgress, getCachedStreamUrl, saveStreamUrl } from '../utils/storage'; // Import cache functions
import { extractM3U8Stream } from '../utils/streamExtractor';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';

const VideoPlayerScreen = ({ navigation, route }) => {
  const navigationRef = useRef(navigation);
  const progressBarRef = useRef(null);
  const opacityAnim = useRef(new Animated.Value(0)).current; // Animated value for controls opacity

  const {
    mediaId,
    mediaType,
    season,
    episode,
    title,
    episodeTitle
  } = route.params;

  const [loading, setLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // New state for initial load
  const [error, setError] = useState(null);
  const [streamExtractionComplete, setStreamExtractionComplete] = useState(false);
  const [showControls, setShowControls] = useState(false); // Start with controls hidden conceptually
  const [isPlaying, setIsPlaying] = useState(true);
  const [videoUrl, setVideoUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [resumeTime, setResumeTime] = useState(0);
  const [controlsTimer, setControlsTimer] = useState(null);
  const [webViewConfig, setWebViewConfig] = useState(null);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [isUnmounting, setIsUnmounting] = useState(false);
  const [brightnessLevel, setBrightnessLevel] = useState(1); // State for brightness
  const [hasBrightnessPermission, setHasBrightnessPermission] = useState(false); // State for permission

  const getStreamHeaders = () => {
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
    uri: videoUrl
  });

  player.timeUpdateEventInterval = 1;

  const contentId = mediaType === 'tv'
    ? `tv-${mediaId}-s${season}-e${episode}`
    : `movie-${mediaId}`;

  // --- Animation and Controls Timer ---
  const startControlsTimer = () => {
    if (controlsTimer) {
      clearTimeout(controlsTimer);
    }
    const timerId = setTimeout(() => {
      setShowControls(false); // Trigger fade-out via useEffect
    }, 5000); // 5 seconds inactivity timeout
    setControlsTimer(timerId);
  };

  useEffect(() => {
    // Animate controls based on showControls state
    if (showControls) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300, // Fade-in duration
        easing: Easing.in(Easing.ease), // Ease-in curve
        useNativeDriver: true,
      }).start();
      startControlsTimer(); // Start inactivity timer when controls are shown
    } else {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500, // Fade-out duration
        easing: Easing.out(Easing.ease), // Ease-out curve
        useNativeDriver: true,
      }).start();
      if (controlsTimer) {
        clearTimeout(controlsTimer); // Clear timer when hiding controls explicitly
        setControlsTimer(null);
      }
    }
    // Cleanup timer on unmount or if showControls changes again before timer fires
    return () => {
      if (controlsTimer) {
        clearTimeout(controlsTimer);
      }
    };
  }, [showControls, opacityAnim]); // Rerun effect when showControls changes

  const toggleControls = () => {
    // If controls are currently shown, tapping hides them immediately.
    // If controls are hidden, tapping shows them (and starts the timer via useEffect).
    setShowControls(currentShowControls => !currentShowControls);
  };
  // --- End Animation and Controls Timer ---


  // --- Brightness Handling ---
  useEffect(() => {
    (async () => {
      const { status } = await Brightness.requestPermissionsAsync();
      if (status === 'granted') {
        setHasBrightnessPermission(true);
        const initialBrightness = await Brightness.getSystemBrightnessAsync();
        setBrightnessLevel(initialBrightness);
      } else {
        // Handle permission denied? Maybe show a message or disable slider.
        console.log('Brightness permission denied');
      }
    })();
  }, []);

  const handleBrightnessChange = async (value) => {
    if (!hasBrightnessPermission) return;
    setBrightnessLevel(value);
    await Brightness.setSystemBrightnessAsync(value);
    setShowControls(true); // Show controls and reset timer on interaction
  };
  // --- End Brightness Handling ---

  // --- Listener Handlers ---
  const handlePositionChange = (event) => {
    const currentTime = typeof event === 'number' ? event : event?.currentTime;
    if (typeof currentTime !== 'number' || isNaN(currentTime)) {
        // console.warn("handlePositionChange received invalid time:", currentTime);
        return;
    }
    setPosition(currentTime);
    if (Math.floor(currentTime) % 5 === 0 && currentTime > 0) {
      saveProgress(currentTime);
    }
  };

  const handleDurationChange = (dur) => {
     if (isUnmounting) return;
     if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
         if (duration !== dur) {
             // console.log("Setting duration:", dur);
             setDuration(dur);
         }
     } else if (dur !== 0) {
       // console.warn('Received invalid duration via statusChange:', dur);
     }
  };
  // --------------------------------------------------

  // --- Event Listeners using useEventListener ---
  useEventListener(player, 'statusChange', (event) => {
    if (isUnmounting) return;
    // console.log("useEventListener Status Change Event:", event);
    const status = event?.status ?? event;
    // console.log("Parsed Status:", status);

    if (typeof status === 'object' && status !== null) {
      handleDurationChange(status.duration);
      if (status.isLoaded && !status.isBuffering) {
         if (loading) setLoading(false); // Stop general loading indicator
         if (isInitialLoading) setIsInitialLoading(false); // Mark initial load complete
      } else if (status.isBuffering && !loading && isPlaying) { // Check isPlaying before setting loading
         setLoading(true); // Show buffering indicator only if supposed to be playing
      }
    } else if (typeof status === 'string') {
      if (status === 'readyToPlay') {
         if (loading) setLoading(false);
         if (isInitialLoading) setIsInitialLoading(false); // Mark initial load complete
         if (player) {
             const currentDuration = player.duration;
             // console.log("Player status readyToPlay, current player.duration:", currentDuration);
             handleDurationChange(currentDuration);
         }
      } else if (status === 'loading' && !loading && isPlaying) { // Check isPlaying before setting loading
         setLoading(true); // Show buffering indicator only if supposed to be playing
      }
    }
  });

  useEventListener(player, 'timeUpdate', (event) => {
    // console.log("useEventListener Time Update Event:", event);
    handlePositionChange(event);
  });

  useEventListener(player, 'playingChange', (event) => {
    const currentIsPlaying = typeof event === 'boolean' ? event : event?.isPlaying;
    // console.log("useEventListener Playing Change Event:", event, "| Parsed isPlaying:", currentIsPlaying);
    if (typeof currentIsPlaying === 'boolean') {
      setIsPlaying(currentIsPlaying);
      if (currentIsPlaying && duration === 0) {
         setTimeout(() => {
           if (player && !isUnmounting) {
             const currentDuration = player.duration;
             // console.log("Checking player.duration shortly after play started:", currentDuration);
             handleDurationChange(currentDuration);
           }
         }, 1000);
      }
    }
  });

  useEventListener(player, 'error', (error) => {
    if (isUnmounting) return;
    // console.error('[useEventListener] Video playback error occurred:', error);
    setError({ message: 'Video playback error: ' + (error?.message || 'Unknown error') });
  });
  // --- End Event Listeners ---

  useEffect(() => {
    if (!player || !videoUrl || isUnmounting) return;

    // console.log("Replacing player source with URL:", videoUrl);
    setLoading(true); // Show loading indicator during replacement
    player.replace({ uri: videoUrl, headers: getStreamHeaders() });

    const playTimer = setTimeout(() => {
      if (isUnmounting || !player) return;
      // console.log("Attempting to seek and play after replace (increased delay).");
      try {
        if (resumeTime > 0) {
          // console.log("Seeking to resumeTime:", resumeTime);
          player.currentTime = resumeTime;
        }
        // console.log("Calling player.play()");
        player.play();
      } catch(e) {
         // console.error("Error during post-replace seek/play:", e);
         setError({ message: "Failed to start playback after loading." });
         setLoading(false);
         setIsInitialLoading(false); // Ensure initial loading stops on error too
      }
    }, 1000);

    return () => clearTimeout(playTimer);

  }, [player, videoUrl, resumeTime, isUnmounting]);

  useEffect(() => {
    let isMounted = true; // Track mount status for async operations
    setIsUnmounting(false); // Reset unmounting flag on mount/rerender

    const setOrientation = async () => {
      try {
        // Ensure orientation is set on every mount/reload triggered by retryAttempts
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {
        // console.error("Failed to lock orientation:", e);
      }
    };

    // Call setOrientation directly here to ensure it runs on reload
    setOrientation();

    const checkSavedProgress = async () => {
      try {
        const progress = await getWatchProgress(contentId);
        if (progress && progress.position) {
          setResumeTime(progress.position);
        }
      } catch (e) {
        // console.error("Failed to load progress:", e);
      }
    };

    const setupStreamExtraction = () => {
      // console.log(`Setting up stream extraction for ${contentId}`);
      const config = extractM3U8Stream(
        mediaId,
        mediaType,
        season,
        episode,
        (streamUrl) => {
          // Check mount status before updating state
          if (!isMounted || streamExtractionComplete || videoUrl) return;

          const processedUrl = Platform.OS === 'ios'
            ? streamUrl.replace('http://', 'https://')
            : streamUrl;

          // console.log(`Stream found for ${contentId}, saving to cache and setting URL.`);
          saveStreamUrl(contentId, processedUrl); // Save to cache
          setVideoUrl(processedUrl);
          setStreamExtractionComplete(true);
        },
        (err) => {
          // Check mount status before updating state
          if (!isMounted) return;
          // console.error("Error extracting stream:", err);
          setError({ message: "Could not extract video stream. Retry or check your connection." });
          setStreamExtractionComplete(true); // Mark as complete even on error
          setLoading(false);
          setIsInitialLoading(false); // Stop initial loading on extraction error
        }
      );

      setWebViewConfig(config);
    };

    const initializePlayer = async () => {
      // await setOrientation(); // Moved outside
      await checkSavedProgress();

      // Check cache first
      const cachedUrl = await getCachedStreamUrl(contentId);
      if (cachedUrl && isMounted) {
        // console.log(`Using cached URL for ${contentId}: ${cachedUrl}`);
        setVideoUrl(cachedUrl);
        setStreamExtractionComplete(true);
        // No need to call setupStreamExtraction
      } else if (isMounted) {
        // console.log(`No valid cache found for ${contentId}, starting extraction.`);
        // Only setup extraction if no cached URL is found
        setupStreamExtraction();
      }
    };

    initializePlayer();

    setShowControls(true); // Show controls initially

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });

    return () => {
      isMounted = false; // Mark as unmounted
      setIsUnmounting(true); // Set unmounting flag for other listeners/effects

      try {
        // Use the position state directly for saving
        saveProgress(position);

        // ... rest of cleanup code ...
        if (player && typeof player.pause === 'function') {
          try {
            player.pause();
          } catch (pauseError) {
            // console.warn("Error pausing player during cleanup:", pauseError);
          }
        }

        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
          .catch(e => {}); // console.error("Error unlocking orientation:", e));

        backHandler.remove();

        if (controlsTimer) {
          clearTimeout(controlsTimer);
        }
      } catch (e) {
        // console.error("Cleanup error:", e);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, contentId, mediaId, mediaType, season, episode, retryAttempts]); // Keep dependencies, add retryAttempts

  const saveProgress = (currentTime) => {
    // Use isUnmounting flag instead of checking player state directly in cleanup
    if (!currentTime || !duration || duration <= 0) return; // Added duration check and ensure it's positive

    // console.log(`Attempting to save progress: ${currentTime} / ${duration}`);
    try {
      const data = {
        title: title,
        episodeTitle: episodeTitle,
        mediaType: mediaType,
        mediaId: mediaId, // Use the original mediaId
        position: currentTime,
        duration: duration, // Save duration
        poster_path: route.params.poster_path,
        season: season,
        episode: episode,
        lastWatched: new Date().toISOString(),
      };
      // Use contentId which is unique per episode/movie
      saveWatchProgress(contentId, data);
    } catch (e) {
      // console.error("Error saving progress:", e);
    }
  };

  // Player controls
  const togglePlayPause = async () => {
    try {
      if (player) {
        if (isPlaying) {
          player.pause();
        } else {
          player.play();
        }
        setIsPlaying(!isPlaying);
      }
      setShowControls(true); // Show controls and reset timer on interaction
    } catch (error) {
      // console.error('Error toggling play/pause:', error);
    }
  };

  const seekBackward = async () => {
    try {
      if (player) {
        player.seekBy(-10);
      }
      setShowControls(true); // Show controls and reset timer on interaction
    } catch (error) {
      // console.error('Error seeking backward:', error);
    }
  };

  const seekForward = async () => {
    try {
      if (player) {
        player.seekBy(10);
      }
      setShowControls(true); // Show controls and reset timer on interaction
    } catch (error) {
      // console.error('Error seeking forward:', error);
    }
  };

  // toggleControls is defined above near animation logic

  const handleGoBack = () => {
    if (isUnmounting) return;

    setIsUnmounting(true);

    try {
      saveProgress(position);

      if (player) {
        player.pause();
      }

      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .finally(() => {
          const navRef = navigationRef.current;
          if (!navRef) return;

          setTimeout(() => {
            try {
              navRef.goBack();
            } catch (e) {
              // console.error("Navigation error:", e);
            }
          }, 300);
        })
        .catch(err => {
          // console.error("Error during orientation change:", err);
          const navRef = navigationRef.current;
          if (!navRef) return;

          setTimeout(() => {
            try {
              navRef.goBack();
            } catch (e) {
              // console.error("Navigation error:", e);
            }
          }, 300);
        });
    } catch (e) {
      // console.error("Error in handleGoBack:", e);
      const navRef = navigationRef.current;
      if (!navRef) return;

      setTimeout(() => {
        try {
          navRef.goBack();
        } catch (e) {
          // console.error("Navigation error:", e);
        }
      }, 300);
    }
  };

  const handleReload = async () => {
    // console.log("Reload triggered");
    try {
      setError(null);
      setLoading(true);
      setIsInitialLoading(true); // Reset initial loading state on reload
      setStreamExtractionComplete(false);
      setVideoUrl(null); // Clear current video URL
      setWebViewConfig(null); // Clear webview config
      setResumeTime(0); // Reset resume time
      setPosition(0); // Reset position
      setDuration(0); // Reset duration
      // Increment retryAttempts to trigger the main useEffect re-run
      setRetryAttempts(prevAttempts => prevAttempts + 1);
    } catch (error) {
      // console.error('Error reloading video:', error);
      setError({ message: 'Failed to reload video stream' });
      setLoading(false);
      setIsInitialLoading(false); // Stop initial loading on reload error
    }
  };

  // Format time for display (e.g., 01:23:45)
  const formatTime = (timeInSeconds) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    const formattedMinutes = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');

    return hours > 0
      ? `${hours}:${formattedMinutes}:${formattedSeconds}`
      : `${formattedMinutes}:${formattedSeconds}`;
  };

  // Function to seek to a specific position when tapping or dragging on the progress bar
  const seekToPosition = (nativeEvent, updateStateImmediately = false) => {
    if (!player || !duration || !progressBarRef.current) {
        return;
    }

    // Get progress bar width
    progressBarRef.current.measure((x, y, width, height, pageX, pageY) => {
      // Calculate the percentage based on tap position
      let seekPosition = (nativeEvent.locationX / width) * duration;

      // Validate seek position
      if (isNaN(seekPosition) || seekPosition < 0 || seekPosition > duration) {
        return; // Don't attempt to seek with invalid value
      }
      // Ensure seekPosition is within valid range (clamp just in case)
      seekPosition = Math.max(0, Math.min(seekPosition, duration));

      // Seek to the new position with error handling
      try {
        player.currentTime = seekPosition;
      } catch (e) {
        // console.error('Error during player.currentTime assignment:', e); // Updated error message
      }

      // Optionally update the UI immediately for responsive feel during drag
      if (updateStateImmediately) {
        setPosition(seekPosition);
      }

      // Reset the timer for controls
      setShowControls(true); // Show controls and reset timer on interaction
    });
  };
  
  // Create a pan responder to handle touch and drag on the progress bar
  const progressPanResponder = PanResponder.create({
    // Ask to be the responder
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    // Handle touch and drag events
    onPanResponderGrant: (evt) => {
      // Pause video while seeking for better UX
      if (player && isPlaying) {
        player.pause();
      }
      // Seek to the touch position - don't update state immediately
      seekToPosition(evt.nativeEvent, false);
      setShowControls(true); // Keep controls visible during drag
    },

    // Handle drag movement
    onPanResponderMove: (evt) => {
      // Seek and update state immediately for visual feedback during drag
      seekToPosition(evt.nativeEvent, true);
      setShowControls(true); // Keep controls visible during drag
    },

    // Handle release of touch/drag
    onPanResponderRelease: () => {
      // Resume playback if video was playing before
      if (player && isPlaying) {
        player.play();
      }
      // Let the player's position listener handle the final state update
      setShowControls(true); // Reset timer after interaction ends
    }
  });

  const injectedJavaScript = `
    (function() {
      window.alert = function() {};
    })();
  `;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Hidden WebView for stream extraction */}
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

      {/* Initial Loading Indicator */}
      {isInitialLoading && (
        <View style={styles.loaderContainer}>
          {/* Add Back Button Here */}
          <SafeAreaView style={styles.loadingBackButtonContainer}>
            <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
          </SafeAreaView>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
            {streamExtractionComplete ? 'Loading video...' : 'Extracting video stream...'}
          </Text>
        </View>
      )}

      {/* Buffering Indicator (shows only after initial load)
      {loading && !isInitialLoading && (
        <View style={styles.bufferingIndicatorContainer}>
          <ActivityIndicator size="small" color="#FFF" />
        </View>
      )} */}

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Error loading video. Please try again.
          </Text>
          <Text style={styles.errorDetail}>
            {error.message || "Connection issue with video source"}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleReload}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.goBackButton}
            onPress={handleGoBack}
          >
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Video Player */}
      {videoUrl && (
        <VideoView
          player={player}
          style={styles.video}
          nativeControls={false}
          allowsPictureInPicture={true}
        />
      )}

      {/* Overlay Touchable */}
      <TouchableOpacity
        style={styles.overlayTouchable}
        onPress={toggleControls}
        activeOpacity={1}
      />

      {/* Controls Wrapper for Animation */}
      {/* Use pointerEvents="box-none" to allow taps on children but pass through empty areas */}
      <Animated.View style={[styles.controlsWrapper, { opacity: opacityAnim, pointerEvents: 'box-none' }]}>
        {/* Top Controls */}
        {/* Remove pointerEvents override, default 'auto' is fine */}
        <SafeAreaView style={styles.controlsContainer}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Text style={styles.titleText} numberOfLines={1}>
                {title}
                {mediaType === 'tv' && episodeTitle && ` - ${episodeTitle}`}
              </Text>
            </View>
          </SafeAreaView>

          {/* Brightness Slider (Vertical on the left) */}
          {hasBrightnessPermission && (
            <View style={styles.brightnessSliderContainer}>
              <Ionicons name="sunny" size={20} color="white" style={styles.brightnessIcon} />
              <Slider
                style={styles.brightnessSlider}
                minimumValue={0}
                maximumValue={1}
                value={brightnessLevel}
                onValueChange={handleBrightnessChange} // Use onValueChange for continuous update
                minimumTrackTintColor="#FFFFFF"
                maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor="transparent"
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

          <SafeAreaView style={styles.bottomControls}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <View
              style={styles.progressBar}
              ref={progressBarRef} // Keep ref on the container for measurement
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${(position / Math.max(duration, 1)) * 100}%` }
                ]}
              />
              {/* Attach panHandlers to the touch area */}
              <View
                style={styles.progressTouchArea}
                {...progressPanResponder.panHandlers}
              />
            </View>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </SafeAreaView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  hiddenWebView: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000', // Keep background for initial load
    zIndex: 10,
  },
  loadingBackButtonContainer: { // Style for the back button container during loading
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 10,
    zIndex: 11, // Ensure it's above the loader content
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
  },
  bufferingIndicatorContainer: { // Style for the smaller buffering indicator
    position: 'absolute',
    top: '50%', // Center vertically
    left: '50%', // Center horizontally
    transform: [{ translateX: -15 }, { translateY: -15 }], // Adjust for indicator size
    zIndex: 11, // Ensure it's above the video but potentially below controls
    padding: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent background
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 10,
    padding: 20,
  },
  errorText: {
    color: '#fff',
    marginBottom: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorDetail: {
    color: '#888',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#E50914',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginBottom: 10, // Added margin
  },
  retryButtonText: {
    color: '#fff',
  },
  goBackButton: {
    backgroundColor: '#555',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    // marginLeft: 15, // Removed margin, let it stack vertically
  },
  goBackButtonText: {
    color: '#fff',
  },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 1, // Ensure it's above the video but below controls
  },
  controlsWrapper: { // New wrapper for all controls to apply animation
    ...StyleSheet.absoluteFillObject,
    zIndex: 5, // Ensure controls are above the overlay touchable
    // backgroundColor: 'rgba(255, 0, 0, 0.1)', // For debugging layout
  },
  controlsContainer: { // Top controls (Back button, Title)
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    // zIndex: 5, // zIndex managed by controlsWrapper
  },
  backButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 10,
  },
  titleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  brightnessSliderContainer: {
    position: 'absolute',
    left: 40, // Increased left offset
    top: '20%',
    bottom: '20%',
    width: 40,
    justifyContent: 'center', // Center items vertically in the column
    alignItems: 'center', // Center items horizontally
    // Removed backgroundColor and borderRadius
    // zIndex: 6, // zIndex managed by controlsWrapper
    // paddingVertical: 10, // Removed vertical padding, adjust spacing with margins
  },
  brightnessIcon: {
    marginBottom: 55, // Increased space between icon and slider
  },
  brightnessSlider: {
    width: 150,
    height: 30,
    transform: [{ rotate: '-90deg' }]
  },
  centerControls: {
    position: 'absolute', // Use absolute positioning within the wrapper
    top: 0,             // Cover the whole area
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    // zIndex: 5, // zIndex managed by controlsWrapper
  },
  playPauseButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 50,
    padding: 12,
    marginHorizontal: 30,
  },
  seekButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 40,
    padding: 8,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    // zIndex: 5, // zIndex managed by controlsWrapper
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 10,
    borderRadius: 2,
    overflow: 'visible', // Keep visible for touch area
    // zIndex: 1, // Relative zIndex within bottomControls is fine
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  progressTouchArea: {
    position: 'absolute',
    height: 20, // Make touch area larger than visual bar
    width: '100%',
    top: -8, // Center touch area vertically over the bar
    backgroundColor: 'transparent', // Make touch area invisible
    zIndex: 2, // Ensure touch area is clickable over the bar fill
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default VideoPlayerScreen;