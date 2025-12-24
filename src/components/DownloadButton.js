import React, { useState, useEffect, useCallback } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import downloadManager from '../services/downloadManager';
import { generateDownloadId, DOWNLOAD_STATUS } from '../utils/downloadStorage';

const CircularProgress = ({ progress, size = 28, strokeWidth = 3, color = '#E50914' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#333"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
};

const DownloadButton = ({
  mediaId,
  mediaType,
  title,
  posterPath,
  season = null,
  episode = null,
  episodeTitle = null,
  streamUrl = null,
  streamReferer = null,
  variant = 'icon',
  size = 'medium',
  isSeasonDownload = false,
  seasonNumber = null,
  episodes = [],
  onDownloadStart,
  onDownloadComplete,
  onDownloadError,
}) => {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const downloadId = generateDownloadId(mediaType, mediaId, season, episode);

  const checkStatus = useCallback(async () => {
    try {
      if (isSeasonDownload) {
        setStatus(null);
        setIsLoading(false);
        return;
      }

      const currentStatus = await downloadManager.getDownloadStatus(mediaType, mediaId, season, episode);
      const currentProgress = await downloadManager.getDownloadProgress(mediaType, mediaId, season, episode);

      setStatus(currentStatus);
      setProgress(currentProgress || 0);
    } catch (error) {
      console.error('DownloadButton checkStatus error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [mediaType, mediaId, season, episode, isSeasonDownload]);

  useEffect(() => {
    checkStatus();

    if (isSeasonDownload) return;

    const unsubscribe = downloadManager.subscribe((event, data) => {
      if (data?.id === downloadId) {
        if (event === 'download-progress') {
          setProgress(data.progress);
          setStatus(DOWNLOAD_STATUS.DOWNLOADING);
        } else if (event === 'download-complete') {
          setStatus(DOWNLOAD_STATUS.COMPLETED);
          setProgress(100);
          if (onDownloadComplete) onDownloadComplete(data);
        } else if (event === 'download-error') {
          setStatus(DOWNLOAD_STATUS.FAILED);
          if (onDownloadError) onDownloadError(data);
        } else if (event === 'download-started') {
          setStatus(DOWNLOAD_STATUS.DOWNLOADING);
        } else if (event === 'download-paused') {
          setStatus(DOWNLOAD_STATUS.PAUSED);
        } else if (event === 'download-cancelled') {
          setStatus(null);
          setProgress(0);
        }
      }
    });

    return () => unsubscribe();
  }, [downloadId, isSeasonDownload, mediaId, seasonNumber, checkStatus, onDownloadComplete, onDownloadError]);

  const handlePress = async () => {
    try {
      if (isSeasonDownload) {
        Alert.alert(
          'Download Season',
          `Download all ${episodes.length} episodes of Season ${seasonNumber}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Download',
              onPress: async () => {
                if (onDownloadStart) onDownloadStart();
                await downloadManager.addSeasonToQueue(mediaId, title, posterPath, seasonNumber, episodes);
              },
            },
          ]
        );
        return;
      }

      switch (status) {
        case null:
        case undefined:
          setStatus(DOWNLOAD_STATUS.QUEUED);
          if (onDownloadStart) onDownloadStart();
          await downloadManager.addToQueue({
            mediaType,
            tmdbId: mediaId,
            title,
            posterPath,
            season,
            episode,
            episodeTitle,
            streamUrl,
            streamReferer,
          });
          break;

        case DOWNLOAD_STATUS.QUEUED:
          Alert.alert(
            'Cancel Download',
            'Remove this item from the download queue?',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes',
                style: 'destructive',
                onPress: async () => {
                  await downloadManager.cancelDownload(downloadId);
                  setStatus(null);
                  setProgress(0);
                },
              },
            ]
          );
          break;

        case DOWNLOAD_STATUS.DOWNLOADING:
          await downloadManager.pauseDownload(downloadId);
          setStatus(DOWNLOAD_STATUS.PAUSED);
          break;

        case DOWNLOAD_STATUS.PAUSED:
          await downloadManager.resumeDownload(downloadId);
          setStatus(DOWNLOAD_STATUS.QUEUED);
          break;

        case DOWNLOAD_STATUS.COMPLETED:
          Alert.alert(
            'Downloaded',
            'This content is already downloaded.',
            [
              { text: 'OK' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await downloadManager.cancelDownload(downloadId);
                  setStatus(null);
                  setProgress(0);
                },
              },
            ]
          );
          break;

        case DOWNLOAD_STATUS.FAILED:
          Alert.alert(
            'Download Failed',
            'Would you like to retry the download?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Retry',
                onPress: async () => {
                  await downloadManager.retryDownload(downloadId);
                  setStatus(DOWNLOAD_STATUS.QUEUED);
                },
              },
            ]
          );
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('DownloadButton handlePress error:', error);
      Alert.alert('Error', 'Failed to process download request');
    }
  };

  const getIconConfig = () => {
    switch (status) {
      case DOWNLOAD_STATUS.QUEUED:
        return { name: 'hourglass-outline', color: '#FFA500' };
      case DOWNLOAD_STATUS.DOWNLOADING:
        return { name: 'pause-circle-outline', color: '#E50914' };
      case DOWNLOAD_STATUS.PAUSED:
        return { name: 'play-circle-outline', color: '#FFA500' };
      case DOWNLOAD_STATUS.COMPLETED:
        return { name: 'checkmark-circle', color: '#4CAF50' };
      case DOWNLOAD_STATUS.FAILED:
        return { name: 'alert-circle-outline', color: '#E50914' };
      default:
        return { name: 'download-outline', color: '#888' };
    }
  };

  const getButtonText = () => {
    if (isSeasonDownload) {
      return 'Download Season';
    }

    switch (status) {
      case DOWNLOAD_STATUS.QUEUED:
        return 'Queued';
      case DOWNLOAD_STATUS.DOWNLOADING:
        return `${Math.round(progress)}%`;
      case DOWNLOAD_STATUS.PAUSED:
        return 'Paused';
      case DOWNLOAD_STATUS.COMPLETED:
        return 'Downloaded';
      case DOWNLOAD_STATUS.FAILED:
        return 'Retry';
      default:
        return 'Download';
    }
  };

  const iconConfig = getIconConfig();
  const iconSize = size === 'small' ? 20 : size === 'large' ? 28 : 24;

  if (isLoading) {
    return (
      <View style={[styles.iconButton, variant === 'compact' && styles.compactButton]}>
        <ActivityIndicator size="small" color="#888" />
      </View>
    );
  }

  if (variant === 'icon') {
    return (
      <TouchableOpacity style={styles.iconButton} onPress={handlePress} activeOpacity={0.7}>
        {status === DOWNLOAD_STATUS.DOWNLOADING ? (
          <View style={styles.progressContainer}>
            <CircularProgress progress={progress} size={28} strokeWidth={3} color="#E50914" />
          </View>
        ) : (
          <Ionicons name={iconConfig.name} size={iconSize} color={iconConfig.color} />
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compactButton} onPress={handlePress} activeOpacity={0.7}>
        <Ionicons name={iconConfig.name} size={20} color={iconConfig.color} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.downloadButton, status === DOWNLOAD_STATUS.COMPLETED && styles.downloadButtonCompleted]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {status === DOWNLOAD_STATUS.DOWNLOADING ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name={iconConfig.name} size={18} color={status === DOWNLOAD_STATUS.COMPLETED ? '#4CAF50' : '#fff'} />
      )}
      <Text style={[styles.downloadButtonText, status === DOWNLOAD_STATUS.COMPLETED && styles.downloadButtonTextCompleted]}>
        {getButtonText()}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadButton: {
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  downloadButtonCompleted: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  downloadButtonTextCompleted: {
    color: '#4CAF50',
  },
});

export default DownloadButton;
