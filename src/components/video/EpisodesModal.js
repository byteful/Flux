import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons } from '@expo/vector-icons';
import { formatRuntime, isFutureDate } from '../../utils/timeUtils';

const EpisodesModal = ({
  visible,
  onClose,
  title,
  allSeasonsData,
  selectedSeasonForModal,
  episodesForModal,
  isLoadingModalEpisodes,
  currentSeason,
  currentEpisode,
  onSelectSeason,
  onSelectEpisode,
  seasonListRef,
  episodeListRef,
  mediaId,
  poster_path,
}) => {
  const renderEpisodeItem = ({ item: episodeData }) => {
    const progress = episodeData.watchProgress;
    let progressPercent = 0;
    if (progress && progress.duration > 0 && progress.position > 0) {
      progressPercent = (progress.position / progress.duration);
    }

    const episodePoster = episodeData.still_path
      ? `https://image.tmdb.org/t/p/w300${episodeData.still_path}`
      : null;

    const isCurrentEpisode = currentSeason === episodeData.season_number && currentEpisode === episodeData.episode_number;
    const isEpisodeUnreleased = isFutureDate(episodeData.air_date);

    return (
      <TouchableOpacity
        style={[
          styles.episodeItemHorizontal,
          isCurrentEpisode && styles.currentEpisodeItemHorizontal
        ]}
        onPress={() => {
          if (isCurrentEpisode) {
            onClose();
            return;
          }
          onSelectEpisode({
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
      visible={visible}
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
        onClose();
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
          .catch(e => console.error("Failed to re-lock orientation on episodes modal close:", e));
      }}
    >
      <View style={styles.episodesModalOverlay}>
        <View style={styles.episodesModalContent}>
          <View style={styles.episodesModalHeader}>
            <Text style={styles.episodesModalTitle}>{title} - Episodes</Text>
            <TouchableOpacity onPress={onClose} style={styles.episodesModalCloseButton}>
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {isLoadingModalEpisodes && !allSeasonsData.length ? (
            <ActivityIndicator size="large" color="#E50914" style={{ flex: 1 }} />
          ) : (
            <>
              {allSeasonsData.length > 1 && (
                <View style={styles.seasonSelectorContainer}>
                  <FlatList
                    ref={seasonListRef}
                    horizontal
                    data={allSeasonsData.sort((a, b) => a.season_number - b.season_number)}
                    renderItem={({ item: seasonItem }) => (
                      <TouchableOpacity
                        style={[
                          styles.seasonTab,
                          selectedSeasonForModal === seasonItem.season_number && styles.seasonTabSelected,
                        ]}
                        onPress={() => onSelectSeason(seasonItem.season_number)}
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
                      length: 130,
                      offset: 130 * index,
                      index,
                    })}
                    onScrollToIndexFailed={(info) => {
                      const wait = new Promise(resolve => setTimeout(resolve, 200));
                      wait.then(() => {
                        seasonListRef.current?.scrollToOffset({
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
                  ref={episodeListRef}
                  horizontal
                  data={episodesForModal.sort((a, b) => a.episode_number - b.episode_number)}
                  renderItem={renderEpisodeItem}
                  keyExtractor={(item) => `ep-${item.id || (item.season_number + '_' + item.episode_number)}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.episodesListContentHorizontal}
                  initialNumToRender={3}
                  maxToRenderPerBatch={5}
                  windowSize={7}
                  getItemLayout={(data, index) => ({
                    length: 195,
                    offset: 195 * index,
                    index,
                  })}
                  onScrollToIndexFailed={(info) => {
                    const wait = new Promise(resolve => setTimeout(resolve, 200));
                    wait.then(() => {
                      episodeListRef.current?.scrollToOffset({
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

const styles = StyleSheet.create({
  episodesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodesModalContent: {
    backgroundColor: '#141414',
    width: '95%',
    height: '90%',
    maxHeight: 380,
    borderRadius: 8,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 30,
    overflow: 'hidden',
  },
  episodesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
    backgroundColor: '#141414',
  },
  episodesModalTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  episodesModalCloseButton: {
    padding: 5,
  },
  seasonSelectorContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
    backgroundColor: '#141414',
  },
  seasonTabContentContainer: {
    paddingHorizontal: 10,
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
  episodesListContentHorizontal: {
    paddingVertical: 15,
    paddingLeft: 20,
    paddingRight: 10,
  },
  episodeItemHorizontal: {
    flexDirection: 'column',
    backgroundColor: '#1C1C1C',
    borderRadius: 8,
    marginRight: 15,
    padding: 10,
    width: 180,
    height: 220,
    justifyContent: 'flex-start',
  },
  currentEpisodeItemHorizontal: {
    backgroundColor: 'rgb(46, 46, 46)'
  },
  episodeThumbnailContainerHorizontal: {
    width: '100%',
    height: 100,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#333',
    position: 'relative',
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
    borderRadius: 5,
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
    zIndex: 1,
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
});

export default EpisodesModal;
