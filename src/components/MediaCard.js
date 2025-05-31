import React, { useState } from 'react';
import { StyleSheet, Image, TouchableOpacity, Dimensions, View, Text, Alert } from 'react-native';
import { getImageUrl } from '../api/tmdbApi';
import ImagePlaceholder from './ImagePlaceholder';
import { Ionicons } from '@expo/vector-icons';
import Badge from './Badge';

const { width } = Dimensions.get('window');
const FOOTER_HEIGHT = 45;

const MediaCard = ({
  item,
  onPress,
  onInfoPress,
  onRemovePress,
  width: customWidth,
  height: customImageHeight,
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

  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');

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

          {!isContinueWatching && (
            <Badge
              mediaType={mediaType}
              releaseDate={item.release_date}
              firstAirDate={item.first_air_date}
              lastAirDate={item.last_air_date}
            />
          )}

          {isContinueWatching && (
            <View style={styles.playOverlay}>
              <View style={styles.playButtonBackground} />
              <Ionicons
                name="play-circle-outline"
                size={90}
                color="#FFFFFF"
                style={styles.playIcon}
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
          {item.mediaType === 'movie' && (
            <Text style={styles.episodeText} numberOfLines={1}>
              {item.title}
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
  outerContainer: {
    marginHorizontal: 4,
    marginBottom: 5,
    backgroundColor: '#111',
    borderRadius: 4,
    overflow: 'hidden',
  },
  touchableContainer: {
  },
  imageContainer: {
    width: '100%',
    backgroundColor: '#222',
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 4,
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
  },
  playButtonBackground: {
    width: 48 * 1.5,
    height: 48 * 1.5,
    borderRadius: 24 * 1.5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    position: 'absolute',
  },
  playIcon: {
  },
  footerContainer: {
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 5,
    minHeight: FOOTER_HEIGHT,
    justifyContent: 'center',
  },
  episodeText: {
    color: '#AAA',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'left',
    marginBottom: 4,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    marginBottom: 6,
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
    padding: 3,
  },
});

export default MediaCard;