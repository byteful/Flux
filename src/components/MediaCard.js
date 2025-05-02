import React, { useState } from 'react';
import { StyleSheet, Image, TouchableOpacity, Dimensions, View, Text, Alert } from 'react-native';
import { getImageUrl } from '../api/tmdbApi';
import ImagePlaceholder from './ImagePlaceholder';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const FOOTER_HEIGHT = 45; // Approximate height for the footer section

const MediaCard = ({ 
  item, 
  onPress, 
  onInfoPress, 
  onRemovePress, 
  width: customWidth, 
  height: customImageHeight, // Renamed height to customImageHeight
  isContinueWatching = false 
}) => {
  const [imageError, setImageError] = useState(false);
  const cardWidth = customWidth || styles.defaultCardWidth;
  const imageContainerHeight = customImageHeight || styles.defaultImageHeight;
  
  const posterPath = item.poster_path || item.posterPath;
  const imageSource = posterPath && !imageError
    ? { uri: getImageUrl(posterPath) }
    : null;

  const progress = (item.position && item.duration) ? (item.position / item.duration) : 0;

  const handleRemove = () => {
    Alert.alert(
      'Remove from Continue Watching',
      `Are you sure you want to remove "${item.title || 'this item'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemovePress(item.id), 
        },
      ]
    );
  };

  const handleInfo = () => {
    if (onInfoPress) {
      onInfoPress(item);
    }
  };

  const handlePlay = () => {
    if (isContinueWatching && onPress) {
      onPress(item, true); 
    } else if (onPress) {
      onPress(item); 
    }
  };

  return (
    <View style={[styles.outerContainer, { width: cardWidth }]}> 
      <TouchableOpacity 
        style={styles.touchableContainer} 
        onPress={handlePlay}
        activeOpacity={0.8}
      >
        <View style={[styles.imageContainer, { height: imageContainerHeight }]}>
          {imageSource ? (
            <Image 
              source={imageSource}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <ImagePlaceholder width={cardWidth} height={imageContainerHeight} />
          )}

          {isContinueWatching && (
            <View style={styles.playOverlay}>
              {/* Background Circle */}
              <View style={styles.playButtonBackground} />
              {/* Outline Icon */}
              <Ionicons 
                name="play-circle-outline" 
                size={90} 
                color="#FFFFFF" 
                style={styles.playIcon} // Added style for potential positioning adjustments
              /> 
            </View>
          )}
        </View>
      </TouchableOpacity>

      {isContinueWatching && (
        <View style={styles.footerContainer}>
          {item.mediaType === 'tv' && item.season && item.episode && (
            <Text style={styles.episodeText} numberOfLines={1}>
              S{item.season}:E{item.episode}
            </Text>
          )}
          {progress > 0 && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>
          )}
          <View style={styles.footerActions}>
            <TouchableOpacity onPress={handleInfo} style={styles.iconButton}>
              <Ionicons name="information-circle-outline" size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRemove} style={styles.iconButton}>
              <Ionicons name="close-circle-outline" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const defaultWidth = width / 3 - 16;
const defaultHeight = defaultWidth * 1.5;

const styles = StyleSheet.create({
  defaultCardWidth: defaultWidth,
  defaultImageHeight: defaultHeight,
  outerContainer: { // New container for card + footer
    marginHorizontal: 4,
    marginBottom: 5, // Add some bottom margin
    backgroundColor: '#111', // Background for the whole card area
    borderRadius: 4,
    overflow: 'hidden',
  },
  touchableContainer: { // Container for the touchable image part
    // No specific styles needed here now
  },
  imageContainer: { // Container for the image and play overlay
    width: '100%',
    backgroundColor: '#222', // Background for placeholder
    position: 'relative', // Needed for absolute positioning of play overlay
    overflow: 'hidden', // Ensure image corners are rounded if outer container has borderRadius
    borderTopLeftRadius: 4, // Match outer container radius
    borderTopRightRadius: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    // Remove background from the main overlay
    // backgroundColor: 'rgba(0, 0, 0, 0.4)', 
  },
  playButtonBackground: {
    width: 48 * 1.5, // Slightly smaller than the icon size
    height: 48 * 1.5,
    borderRadius: 24 * 1.5, // Make it a circle
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Semi-transparent black
    position: 'absolute', // Position behind the icon
  },
  playIcon: {
    // Add if needed for fine-tuning position, e.g., elevation on Android
  },
  footerContainer: { // Container for elements below the image
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 5,
    minHeight: FOOTER_HEIGHT, // Ensure minimum height
    justifyContent: 'center', // Center content vertically if needed
  },
  episodeText: {
    color: '#AAA', // Lighter color for episode text
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'left', // Align left
    marginBottom: 4,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    marginBottom: 6, // Space between progress bar and footer actions
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 1.5,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconButton: {
    padding: 3, // Slightly larger touch area
  },
});

export default MediaCard;