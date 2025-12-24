import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../api/tmdbApi';
import { formatFileSize, DOWNLOAD_STATUS } from '../utils/downloadStorage';

const DownloadProgressCard = ({
  item,
  onPause,
  onResume,
  onCancel,
  onRetry,
}) => {
  const {
    id,
    title,
    posterPath,
    mediaType,
    season,
    episode,
    episodeTitle,
    status,
    progress = 0,
    downloadedBytes = 0,
    totalBytes = 0,
    errorMessage,
  } = item;

  const getSubtitle = () => {
    if (mediaType === 'tv' && season && episode) {
      return `S${season}:E${episode}${episodeTitle ? ` - ${episodeTitle}` : ''}`;
    }
    return 'Movie';
  };

  const getStatusText = () => {
    switch (status) {
      case DOWNLOAD_STATUS.QUEUED:
        return 'Waiting...';
      case DOWNLOAD_STATUS.DOWNLOADING:
        if (totalBytes > 0) {
          return `${formatFileSize(downloadedBytes)} of ${formatFileSize(totalBytes)}`;
        }
        return `Downloading... ${Math.round(progress)}%`;
      case DOWNLOAD_STATUS.PAUSED:
        return 'Paused';
      case DOWNLOAD_STATUS.FAILED:
        return errorMessage || 'Failed';
      default:
        return '';
    }
  };

  const getActionIcon = () => {
    switch (status) {
      case DOWNLOAD_STATUS.QUEUED:
        return 'close-circle-outline';
      case DOWNLOAD_STATUS.DOWNLOADING:
        return 'pause-circle-outline';
      case DOWNLOAD_STATUS.PAUSED:
        return 'play-circle-outline';
      case DOWNLOAD_STATUS.FAILED:
        return 'refresh-circle-outline';
      default:
        return 'close-circle-outline';
    }
  };

  const handleActionPress = () => {
    switch (status) {
      case DOWNLOAD_STATUS.QUEUED:
        if (onCancel) onCancel(id);
        break;
      case DOWNLOAD_STATUS.DOWNLOADING:
        if (onPause) onPause(id);
        break;
      case DOWNLOAD_STATUS.PAUSED:
        if (onResume) onResume(id);
        break;
      case DOWNLOAD_STATUS.FAILED:
        if (onRetry) onRetry(id);
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.thumbnailContainer}>
        {posterPath ? (
          <Image
            source={{ uri: getImageUrl(posterPath) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Ionicons name="film-outline" size={24} color="#666" />
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {getSubtitle()}
        </Text>

        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${Math.min(100, progress)}%` }]} />
        </View>

        <Text style={[styles.statusText, status === DOWNLOAD_STATUS.FAILED && styles.statusTextError]}>
          {getStatusText()}
        </Text>
      </View>

      <TouchableOpacity style={styles.actionButton} onPress={handleActionPress}>
        <Ionicons
          name={getActionIcon()}
          size={28}
          color={status === DOWNLOAD_STATUS.FAILED ? '#E50914' : '#fff'}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#000',
  },
  thumbnailContainer: {
    marginRight: 12,
  },
  thumbnail: {
    width: 60,
    height: 90,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
  },
  statusTextError: {
    color: '#E50914',
  },
  actionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default DownloadProgressCard;
