import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import downloadManager from '../services/downloadManager';
import {
  getDownloadStorageUsage,
  formatFileSize,
  DOWNLOAD_STATUS,
} from '../utils/downloadStorage';
import { storageManager } from '../services/downloadManager';
import DownloadProgressCard from '../components/DownloadProgressCard';
import DownloadedMediaCard from '../components/DownloadedMediaCard';

const DownloadsScreen = () => {
  const navigation = useNavigation();
  const [activeDownloads, setActiveDownloads] = useState([]);
  const [completedDownloads, setCompletedDownloads] = useState([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [availableStorage, setAvailableStorage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const loadData = useCallback(async () => {
    try {
      const active = await downloadManager.getActiveDownloads();
      const completed = await downloadManager.getCompletedDownloads();
      const used = await getDownloadStorageUsage();
      const available = await storageManager.getAvailableStorage();

      setActiveDownloads(active);
      setCompletedDownloads(completed);
      setStorageUsed(used);
      setAvailableStorage(available);
    } catch (error) {
      console.error('DownloadsScreen loadData error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 300 });
      loadData();
    }, [opacity, loadData])
  );

  useEffect(() => {
    downloadManager.initialize();

    const unsubscribe = downloadManager.subscribe((event, data) => {
      loadData();
    });

    return () => unsubscribe();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleCancel = async (downloadId) => {
    Alert.alert(
      'Cancel Download',
      'Are you sure you want to cancel this download?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            await downloadManager.cancelDownload(downloadId);
            loadData();
          },
        },
      ]
    );
  };

  const handleRetry = async (downloadId) => {
    await downloadManager.retryDownload(downloadId);
  };

  const handleCancelAllAndRetry = () => {
    Alert.alert(
      'Restart All Downloads',
      'This will cancel all active downloads and restart them from the beginning. Continue?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Restart All',
          style: 'destructive',
          onPress: async () => {
            await downloadManager.cancelAllAndRetry();
            loadData();
          },
        },
      ]
    );
  };

  const handleCancelAll = () => {
    Alert.alert(
      'Cancel All Downloads',
      'Are you sure you want to cancel all downloads? This cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel All',
          style: 'destructive',
          onPress: async () => {
            await downloadManager.cancelAllDownloads();
            setSelectedFilter('all');
            loadData();
          },
        },
      ]
    );
  };

  const handlePlay = async (item) => {
    let basePath;
    if (item.filePath.endsWith('.m3u8') || item.filePath.endsWith('.mp4')) {
      basePath = item.filePath;
    } else {
      basePath = `${item.filePath}video.mp4`;
    }

    const offlinePath = basePath.startsWith('file://')
      ? basePath
      : `file://${basePath}`;

    navigation.navigate('VideoPlayer', {
      mediaId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      season: item.season,
      episode: item.episode,
      episodeTitle: item.episodeTitle,
      poster_path: item.posterPath,
      isOffline: true,
      offlineFilePath: offlinePath,
    });
  };

  const handleDelete = async (downloadId) => {
    Alert.alert(
      'Delete Download',
      'Are you sure you want to delete this download?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await downloadManager.cancelDownload(downloadId);
            loadData();
          },
        },
      ]
    );
  };

  const getFilteredDownloads = () => {
    if (selectedFilter === 'active') {
      return [];
    }
    if (selectedFilter === 'all') {
      return completedDownloads;
    }
    return completedDownloads.filter(d => d.mediaType === selectedFilter);
  };

  const filteredDownloads = getFilteredDownloads();
  const hasDownloads = activeDownloads.length > 0 || completedDownloads.length > 0;
  const showActiveTab = activeDownloads.length >= 2;
  const storagePercentage = availableStorage > 0
    ? (storageUsed / (storageUsed + availableStorage)) * 100
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.animatedContainer, animatedStyle]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Downloads (beta)</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E50914"
              colors={['#E50914']}
            />
          }
        >
          {hasDownloads && (
            <View style={styles.storageSection}>
              <View style={styles.storageBar}>
                <View style={[styles.storageBarFill, { width: `${Math.min(100, storagePercentage)}%` }]} />
              </View>
              <Text style={styles.storageText}>
                {formatFileSize(storageUsed)} used • {formatFileSize(availableStorage)} available
              </Text>
            </View>
          )}

          {activeDownloads.length > 0 && !showActiveTab && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Downloading</Text>
                <View style={styles.headerButtons}>
                  <TouchableOpacity style={styles.cancelAllButton} onPress={handleCancelAll}>
                    <Ionicons name="close" size={14} color="#fff" />
                    <Text style={styles.headerButtonText}>Cancel All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.restartButton} onPress={handleCancelAllAndRetry}>
                    <Ionicons name="refresh" size={14} color="#fff" />
                    <Text style={styles.headerButtonText}>Restart All</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {activeDownloads.map(item => (
                <DownloadProgressCard
                  key={item.id}
                  item={item}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                />
              ))}
            </View>
          )}

          {(completedDownloads.length > 0 || showActiveTab) && (
            <>
              <View style={styles.tabContainer}>
                {showActiveTab && (
                  <TouchableOpacity
                    style={[styles.tab, selectedFilter === 'active' && styles.tabActive]}
                    onPress={() => setSelectedFilter('active')}
                  >
                    <Text style={[styles.tabText, selectedFilter === 'active' && styles.tabTextActive]}>
                      Active ({activeDownloads.length})
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.tab, selectedFilter === 'all' && styles.tabActive]}
                  onPress={() => setSelectedFilter('all')}
                >
                  <Text style={[styles.tabText, selectedFilter === 'all' && styles.tabTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, selectedFilter === 'movie' && styles.tabActive]}
                  onPress={() => setSelectedFilter('movie')}
                >
                  <Text style={[styles.tabText, selectedFilter === 'movie' && styles.tabTextActive]}>
                    Movies
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, selectedFilter === 'tv' && styles.tabActive]}
                  onPress={() => setSelectedFilter('tv')}
                >
                  <Text style={[styles.tabText, selectedFilter === 'tv' && styles.tabTextActive]}>
                    TV Shows
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedFilter === 'active' ? (
                <View style={styles.section}>
                  <View style={styles.activeTabHeader}>
                    <TouchableOpacity style={styles.cancelAllButton} onPress={handleCancelAll}>
                      <Ionicons name="close" size={14} color="#fff" />
                      <Text style={styles.headerButtonText}>Cancel All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.restartButton} onPress={handleCancelAllAndRetry}>
                      <Ionicons name="refresh" size={14} color="#fff" />
                      <Text style={styles.headerButtonText}>Restart All</Text>
                    </TouchableOpacity>
                  </View>
                  {activeDownloads.map(item => (
                    <DownloadProgressCard
                      key={item.id}
                      item={item}
                      onCancel={handleCancel}
                      onRetry={handleRetry}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.downloadedSection}>
                  <View style={styles.downloadedGrid}>
                    {filteredDownloads.map(item => (
                      <DownloadedMediaCard
                        key={item.id}
                        item={item}
                        onPlay={handlePlay}
                        onDelete={handleDelete}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {!hasDownloads && !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-download-outline" size={64} color="#444" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No downloads yet</Text>
              <Text style={styles.emptySubtext}>
                Download movies and shows to watch offline
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  animatedContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  storageSection: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  storageBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 4,
  },
  storageText: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: '#E50914',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B0000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  activeTabHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingTop: 10,
    gap: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    marginRight: 25,
    paddingBottom: 10,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#E50914',
  },
  tabText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  downloadedSection: {
    paddingHorizontal: 8,
    paddingTop: 15,
  },
  downloadedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    marginBottom: 20,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default DownloadsScreen;
