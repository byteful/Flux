import React from 'react';
import { TouchableOpacity, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const VIDEO_END_THRESHOLD_SECONDS = 45;
const TWO_MINUTE_THRESHOLD_SECONDS = 120;

const NextEpisodeButton = ({
  showNextEpisodeButton,
  nextEpisodeDetails,
  position,
  duration,
  opacityAnim,
  onPress,
}) => {
  if (!showNextEpisodeButton) {
    return null;
  }

  const timeLeft = duration - position;

  const isWithinFortyFiveSecondWindow = duration > 0 && timeLeft < VIDEO_END_THRESHOLD_SECONDS;
  const isWithinTwoMinuteWindowButNotFortyFive = duration > 0 &&
    timeLeft < TWO_MINUTE_THRESHOLD_SECONDS &&
    timeLeft >= VIDEO_END_THRESHOLD_SECONDS;

  if (!showNextEpisodeButton || (!isWithinFortyFiveSecondWindow && !isWithinTwoMinuteWindowButNotFortyFive)) {
    return null;
  }

  const buttonText = nextEpisodeDetails
    ? `Next: S${nextEpisodeDetails.season} E${nextEpisodeDetails.episode}`
    : "Back to Home";

  let buttonOpacityStyle;
  if (isWithinFortyFiveSecondWindow) {
    buttonOpacityStyle = { opacity: 1 };
  } else if (isWithinTwoMinuteWindowButNotFortyFive) {
    buttonOpacityStyle = { opacity: opacityAnim };
  }

  return (
    <Animated.View style={[styles.nextEpisodeContainer, buttonOpacityStyle]}>
      <TouchableOpacity style={styles.nextEpisodeButton} onPress={onPress}>
        <Ionicons name={nextEpisodeDetails ? "play-skip-forward" : "home"} size={20} color="white" style={styles.nextEpisodeIcon} />
        <Text style={styles.nextEpisodeText}>{buttonText}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  nextEpisodeContainer: {
    position: 'absolute',
    bottom: 80,
    right: 30,
    zIndex: 6,
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
});

export default NextEpisodeButton;
