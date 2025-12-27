import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { VideoAirPlayButton } from 'expo-video';
import BrightnessSlider from './BrightnessSlider';
import LiveIndicator from './LiveIndicator';
import { formatTime } from '../../utils/timeUtils';

const VideoControlsOverlay = ({
  showControls,
  opacityAnim,
  isPlaying,
  isMuted,
  isLiveStream,
  title,
  episodeTitle,
  mediaType,
  season,
  episode,
  position,
  duration,
  isSeeking,
  seekPreviewPosition,
  isAtLiveEdge,
  progressBarRef,
  progressPanResponder,
  onGoBack,
  onTogglePlayPause,
  onToggleMute,
  onSeekBackward,
  onSeekForward,
  onOpenSourceModal,
  onToggleEpisodes,
  onToggleSubtitles,
  subtitlesEnabled,
  selectedLanguage,
  isChangingSource,
  isInitialLoading,
  videoUrl,
  player,
  brightnessLevel,
  hasBrightnessPermission,
  brightnessSliderRef,
  brightnessPanResponder,
}) => {
  const displayPosition = isSeeking && seekPreviewPosition !== null ? seekPreviewPosition : position;
  const actualPosition = position;
  const progressPercent = (displayPosition / Math.max(duration, 1)) * 100;
  const timeRemaining = duration - actualPosition;

  return (
    <>
      <Animated.View style={[styles.overlayBackground, { opacity: opacityAnim }]} pointerEvents="none" />

      <Animated.View style={[styles.controlsWrapper, { opacity: opacityAnim, pointerEvents: showControls ? 'box-none' : 'none' }]}>
        <SafeAreaView style={styles.controlsContainer}>
          <TouchableOpacity onPress={onGoBack} style={styles.backButton}>
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
          <View style={styles.topRightButtons}>
            {!isLiveStream && (
              <TouchableOpacity onPress={onOpenSourceModal} style={styles.controlButton} disabled={isInitialLoading || !videoUrl}>
                {isChangingSource ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="cloudy" size={24} color="white" />
                )}
              </TouchableOpacity>
            )}

            {mediaType === 'tv' && !isLiveStream && (
              <TouchableOpacity onPress={onToggleEpisodes} style={styles.controlButton}>
                <Ionicons name="albums-outline" size={24} color="white" />
              </TouchableOpacity>
            )}
            {!isLiveStream && (
              <TouchableOpacity onPress={onToggleSubtitles} style={styles.controlButton}>
                <Ionicons
                  name="logo-closed-captioning"
                  size={24}
                  color={subtitlesEnabled && selectedLanguage ? '#E50914' : 'white'}
                />
              </TouchableOpacity>
            )}
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

        <BrightnessSlider
          brightnessLevel={brightnessLevel}
          hasBrightnessPermission={hasBrightnessPermission}
          brightnessSliderRef={brightnessSliderRef}
          brightnessPanResponder={brightnessPanResponder}
          showControls={showControls}
        />

        {!isLiveStream && (
          <View style={styles.centerControls} pointerEvents={showControls ? 'box-none' : 'none'}>
            <TouchableOpacity style={styles.seekButton} onPress={onSeekBackward}>
              <MaterialIcons name="replay-10" size={48} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.playPauseButton} onPress={onTogglePlayPause}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={60} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.seekButton} onPress={onSeekForward}>
              <MaterialIcons name="forward-10" size={48} color="white" />
            </TouchableOpacity>
          </View>
        )}

        {isLiveStream && (
          <View style={styles.centerControls} pointerEvents={showControls ? 'box-none' : 'none'}>
            <TouchableOpacity style={styles.playPauseButton} onPress={onToggleMute}>
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={60} color="white" />
            </TouchableOpacity>
          </View>
        )}

        <SafeAreaView style={styles.bottomControls}>
          {isLiveStream ? (
            <>
              <View style={styles.timeText} />
              <View style={styles.progressBar} ref={progressBarRef}>
                <View style={[styles.progressFill, { width: `${Math.min(progressPercent, 100)}%` }]} />
                <View style={[styles.progressThumb, { left: `${Math.min(progressPercent, 100)}%` }]} />
                <View style={styles.progressTouchArea} {...(showControls ? progressPanResponder.panHandlers : {})} />
              </View>
              <LiveIndicator isAtLiveEdge={isAtLiveEdge} />
            </>
          ) : (
            <>
              <View style={styles.progressBar} ref={progressBarRef}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                {isSeeking && seekPreviewPosition !== null && (
                  <View style={[styles.seekThumb, { left: `${progressPercent}%` }]} />
                )}
                {!isSeeking && (
                  <View style={[styles.progressThumb, { left: `${progressPercent}%` }]} />
                )}
                <View style={styles.progressTouchArea} {...(showControls ? progressPanResponder.panHandlers : {})} />
              </View>
              <Text style={styles.timeText}>{formatTime(-timeRemaining, true)}</Text>
            </>
          )}
        </SafeAreaView>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 4,
  },
  controlsWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  controlsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
    justifyContent: 'center',
  },
  titleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  seasonEpisodeText: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: 'normal',
    marginLeft: 4,
  },
  topRightButtons: {
    flexDirection: 'row',
  },
  controlButton: {
    padding: 8,
    marginLeft: 8,
  },
  airPlayButtonContainer: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  airPlayButton: {
    width: 32,
    height: 32,
    color: 'white',
    borderColor: 'white',
  },
  centerControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  playPauseButton: {
    borderRadius: 50,
    padding: 12,
    marginHorizontal: 30,
  },
  seekButton: {
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
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 13,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E50914',
    transform: [{ translateX: -7 }],
    zIndex: 3,
  },
  seekThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E50914',
    transform: [{ translateX: -8 }],
    zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  progressTouchArea: {
    position: 'absolute',
    height: 100,
    width: '100%',
    top: -23,
    backgroundColor: 'transparent',
    zIndex: 4,
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
    minWidth: 40,
    textAlign: 'center',
  },
});

export default VideoControlsOverlay;
