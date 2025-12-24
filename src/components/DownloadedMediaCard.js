import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../api/tmdbApi';
import { formatFileSize } from '../utils/downloadStorage';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width / 3 - 16;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const DownloadedMediaCard = ({
  item,
  onPlay,
  onDelete,
  onLongPress,
}) => {
  const {
    id,
    title,
    posterPath,
    mediaType,
    season,
    episode,
    episodeTitle,
    fileSize,
    lastWatchedAt,
  } = item;

  const getSubtitle = () => {
    if (mediaType === 'tv' && season && episode) {
      return `S${season}:E${episode}`;
    }
    return formatFileSize(fileSize || 0);
  };

  const handlePress = () => {
    if (onPlay) {
      onPlay(item);
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(item);
    } else {
      Alert.alert(
        title,
        'What would you like to do?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Play', onPress: () => onPlay && onPlay(item) },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => onDelete && onDelete(id),
          },
        ]
      );
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {posterPath ? (
          <Image
            source={{ uri: getImageUrl(posterPath) }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="film-outline" size={30} color="#666" />
          </View>
        )}

        <View style={styles.downloadedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
        </View>

        <View style={styles.fileSizeBadge}>
          <Text style={styles.fileSizeText}>{formatFileSize(fileSize || 0)}</Text>
        </View>

        {lastWatchedAt && (
          <View style={styles.watchedIndicator}>
            <View style={styles.watchedDot} />
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {mediaType === 'tv' && episodeTitle ? episodeTitle : title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {getSubtitle()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    marginHorizontal: 4,
    marginBottom: 12,
    backgroundColor: '#111',
    borderRadius: 4,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: CARD_HEIGHT,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#222',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 4,
  },
  fileSizeBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileSizeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  watchedIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    padding: 4,
  },
  watchedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E50914',
  },
  infoContainer: {
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    color: '#888',
    fontSize: 11,
  },
});

export default DownloadedMediaCard;
