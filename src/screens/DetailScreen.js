import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { fetchTVShowDetails, fetchSeasonDetails, fetchMovieDetails, getImageUrl, fetchMovieRecommendations, fetchTVShowRecommendations } from '../api/tmdbApi';
import { getShowWatchProgress, getEpisodeWatchProgress } from '../utils/storage'; // Import progress functions
import { Ionicons } from '@expo/vector-icons';
import MediaCard from '../components/MediaCard';

const DetailScreen = ({ route, navigation }) => {
  const { mediaId, mediaType, title } = route.params;
  const [details, setDetails] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonDetails, setSeasonDetails] = useState(null);
  const [episodeProgress, setEpisodeProgress] = useState({}); // To store progress for all episodes
  const [loading, setLoading] = useState(true);
  const [displayedEpisodesCount, setDisplayedEpisodesCount] = useState(25);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [selectedTab, setSelectedTab] = useState('episodes');
  const flatListRef = useRef(null); // Ref for FlatList
  const scrollViewRef = useRef(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false); // To prevent multiple scrolls
  const seasonListRef = useRef(null);

  const today = new Date();
  // today.setHours(0, 0, 0, 0); // Normalize today's date to compare with air_dates

  const isFutureDate = (airDateString) => {
    if (!airDateString) return false;
    const airDate = new Date(airDateString);
    return airDate > today;
    // Set hours to 0 to compare dates only, and account for timezone offset by using UTC dates
    // const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    // const airDateUTC = new Date(Date.UTC(airDate.getFullYear(), airDate.getMonth(), airDate.getDate()));
    // return airDateUTC > todayUTC;
  };

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(e => console.warn("Failed to lock DetailScreen orientation:", e));
    }, [])
  );

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setRecommendations([]);
        setDisplayedEpisodesCount(25);
        setSeasonDetails(null);
        setSelectedSeason(null);
        setEpisodeProgress({});
        setInitialScrollDone(false);
        setSelectedTab('episodes');

        if (mediaType === 'tv') {
          const mediaDetails = await fetchTVShowDetails(mediaId);
          // Keep seasons with season_number > 0, regardless of their air_date for now.
          // Individual episodes will be checked.
          const validSeasons = mediaDetails.seasons
            ? mediaDetails.seasons.filter(s => s.season_number > 0)
            : [];
          mediaDetails.seasons = validSeasons; // Update details with filtered seasons
          setDetails(mediaDetails);

          const progress = await getShowWatchProgress(mediaId);
          setEpisodeProgress(progress);

          let mostRecentEpisodeInfo = null;
          let maxLastWatchedTime = 0;

          if (Object.keys(progress).length > 0) {
            for (const seasonNum in progress) {
              for (const episodeNum in progress[seasonNum]) {
                const episodeData = progress[seasonNum][episodeNum];
                if (episodeData.lastWatched && new Date(episodeData.lastWatched).getTime() > maxLastWatchedTime) {
                  maxLastWatchedTime = new Date(episodeData.lastWatched).getTime();
                  mostRecentEpisodeInfo = {
                    season: parseInt(seasonNum, 10),
                    episode: parseInt(episodeNum, 10),
                  };
                }
              }
            }
          }

          let seasonToLoad = null;
          if (mostRecentEpisodeInfo) {
            seasonToLoad = mostRecentEpisodeInfo.season;
            // Check if this season is valid and released
            const seasonExists = validSeasons.some(s => s.season_number === seasonToLoad);
            if (!seasonExists) {
              seasonToLoad = null; // Fallback if the season from progress isn't in validSeasons
            }
          }

          if (!seasonToLoad && validSeasons.length > 0) {
            seasonToLoad = validSeasons[0].season_number; // Default to first valid season
          }

          if (seasonToLoad !== null) {
            setSelectedSeason(seasonToLoad);
            const seasonData = await fetchSeasonDetails(mediaId, seasonToLoad);
            setSeasonDetails(seasonData);
          }

          // Fetch TV show recommendations
          setLoadingRecommendations(true);
          const recs = await fetchTVShowRecommendations(mediaId);
          setRecommendations(recs.slice(0, 18));
          setLoadingRecommendations(false);
        } else {
          const mediaDetails = await fetchMovieDetails(mediaId);
          setDetails(mediaDetails);
          // Fetch movie recommendations AFTER details are fetched
          setLoadingRecommendations(true);
          const recs = await fetchMovieRecommendations(mediaId);
          setRecommendations(recs.slice(0, 18));
          setLoadingRecommendations(false);
        }
      } catch (error) {
        console.error('Error fetching details:', error);
        // Ensure loading states are reset on error
        setLoadingRecommendations(false);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();

    return () => { };
  }, [mediaId, mediaType]);

  const handleSeasonChange = async (seasonNumber) => {
    try {
      setLoading(true);
      setSelectedSeason(seasonNumber);
      setDisplayedEpisodesCount(25);
      setInitialScrollDone(false); // Allow scrolling for newly selected season
      const seasonData = await fetchSeasonDetails(mediaId, seasonNumber);
      setSeasonDetails(seasonData);
    } catch (error) {
      console.error('Error fetching season details:', error);
    } finally {
      await (new Promise(resolve => setTimeout(resolve, 100))); // Give it some time to render images
      setLoading(false);
    }
  };

  const handleEpisodePress = (episode, isUnreleased) => {
    navigation.replace('VideoPlayer', {
      mediaId: mediaId,
      mediaType: 'tv',
      season: selectedSeason,
      episode: episode.episode_number,
      title: details.name,
      episodeTitle: episode.name,
      poster_path: details.poster_path,
      air_date: episode.air_date,
    });
  };

  const handlePlayMovie = () => {
    navigation.replace('VideoPlayer', {
      mediaId: mediaId,
      mediaType: 'movie',
      title: details.title || title,
      poster_path: details.poster_path || route.params.poster_path,
    });
  };

  const handleLoadMoreEpisodes = () => {
    if (seasonDetails && seasonDetails.episodes) {
      const newCount = Math.min(
        displayedEpisodesCount + 50,
        seasonDetails.episodes.length
      );
      setDisplayedEpisodesCount(newCount);
    }
  };

  // Handler for pressing a recommended item
  const handleRecommendationPress = (item) => {
    // Navigate to the DetailScreen for the recommended item
    // Determine mediaType based on presence of title/name if not explicitly available
    const recommendedMediaType = item.media_type || (item.title ? 'movie' : 'tv');
    navigation.push('DetailScreen', { // Use push to allow navigating to another detail screen
      mediaId: item.id,
      mediaType: recommendedMediaType,
      title: recommendedMediaType === 'movie' ? item.title : item.name,
    });
  };

  useEffect(() => {
    if (mediaType === 'tv' && !initialScrollDone && seasonDetails && seasonDetails.episodes && episodeProgress && flatListRef.current) {
      let mostRecentEpisodeNumber = null;
      let maxLastWatchedTime = 0;
      const currentSeasonProgress = episodeProgress[selectedSeason];

      if (currentSeasonProgress) {
        for (const epNum in currentSeasonProgress) {
          const epData = currentSeasonProgress[epNum];
          if (epData.lastWatched && new Date(epData.lastWatched).getTime() > maxLastWatchedTime) {
            maxLastWatchedTime = new Date(epData.lastWatched).getTime();
            mostRecentEpisodeNumber = parseInt(epNum, 10);
          }
        }
      }

      if (mostRecentEpisodeNumber !== null) {
        const targetIndex = episodesToShow.findIndex(ep => ep.episode_number === mostRecentEpisodeNumber);
        if (targetIndex !== -1) {
          if (targetIndex >= displayedEpisodesCount) {
            setDisplayedEpisodesCount(targetIndex + 1);
          }

          setTimeout(() => {
            const episodePositionInFlatList = targetIndex * 120;
            const totalYPosition = 100 + episodePositionInFlatList - 50;

            scrollViewRef.current?.scrollTo({
              y: Math.max(0, totalYPosition), // Ensure we don't scroll to negative position
              animated: true,
            });
            setInitialScrollDone(true);
          }, 200);
        }
      } else {
        // No progress for this season, or no progress at all, don't scroll.
        setInitialScrollDone(true); // Mark as done to prevent re-checks
      }
    }
  }, [seasonDetails, episodeProgress, episodesToShow, mediaType, initialScrollDone, selectedSeason, displayedEpisodesCount]);

  useEffect(() => {
    if (seasonListRef.current && details?.seasons && selectedSeason) {
      const seasonIndex = details.seasons.findIndex(s => s.season_number === selectedSeason);
      if (seasonIndex !== -1) {
        // A short delay can help ensure the list has rendered before scrolling
        setTimeout(() => {
          seasonListRef.current.scrollToIndex({
            index: seasonIndex,
            animated: true,
            viewPosition: 0.5, // Center the selected season
          });
        }, 200);
      }
    }
  }, [details, selectedSeason]);

  // Modify the condition: Only show full-screen loader on initial load
  if (loading && !details) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  const renderSeasonButton = (seasonNumber) => (
    <TouchableOpacity
      key={`season-${seasonNumber}`}
      style={[
        styles.seasonButton,
        selectedSeason === seasonNumber && styles.selectedSeasonButton,
      ]}
      onPress={() => handleSeasonChange(seasonNumber)}
    >
      <Text
        style={[
          styles.seasonButtonText,
          selectedSeason === seasonNumber && styles.selectedSeasonText,
        ]}
      >
        Season {seasonNumber}
      </Text>
    </TouchableOpacity>
  );

  const renderEpisode = ({ item }) => {
    const progress = episodeProgress?.[selectedSeason]?.[item.episode_number];
    let progressPercent = 0;
    if (progress && progress.duration > 0) {
      progressPercent = (progress.position / progress.duration);
    }
    const isUnreleased = isFutureDate(item.air_date);

    return (
      <TouchableOpacity
        style={styles.episodeItem}
        onPress={() => handleEpisodePress(item, isUnreleased)}
      >
        <View style={styles.episodeRow}>
          <View style={[styles.episodeImageContainer, isUnreleased && styles.unreleasedEpisodeImageContainer]}>
            {item.still_path ? (
              <Image
                source={{ uri: getImageUrl(item.still_path) }}
                style={styles.episodeImage}
              />
            ) : (
              <View style={styles.episodeImagePlaceholder} />
            )}
            {isUnreleased && (
              <View style={styles.unreleasedBadgeDetailScreenContainer}>
                <View style={styles.unreleasedBadgeDetailScreen}>
                  <Text style={styles.unreleasedBadgeTextDetailScreen}>UNRELEASED</Text>
                </View>
              </View>
            )}
            {progressPercent > 0 && progressPercent < 1 && (
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${progressPercent * 100}%` }]} />
              </View>
            )}
          </View>
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeNumber}>Episode {item.episode_number}</Text>
            <Text style={[styles.episodeTitle, isUnreleased && styles.unreleasedEpisodeText]}>{item.name}</Text>
            <Text style={[styles.episodeOverview, isUnreleased && styles.unreleasedEpisodeText]} numberOfLines={2}>
              {item.overview || 'No description available.'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const displayTitle = mediaType === 'tv' ? details.name : details.title;
  const releaseDate = mediaType === 'tv' ? details.first_air_date : details.release_date;
  const releaseYear = releaseDate ? releaseDate.split('-')[0] : 'Unknown';

  // Format runtime (for movies)
  const formatRuntime = (minutes) => {
    if (!minutes) return '';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // Process genres
  const genresArray = details.genres && details.genres.length > 0
    ? details.genres.map(genre => genre.name)
    : [];

  const allEpisodesInSeason = seasonDetails?.episodes || [];
  const episodesToShow = allEpisodesInSeason.slice(0, displayedEpisodesCount);
  const totalEpisodesInSeason = allEpisodesInSeason.length; // Total, including future ones
  const showLoadMoreButton = totalEpisodesInSeason > displayedEpisodesCount;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          {details.backdrop_path ? (
            <Image
              source={{ uri: getImageUrl(details.backdrop_path, 'w780') }} // Use a larger image size if available
              style={styles.backdropImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.backdropPlaceholder} />
          )}
          <LinearGradient
            // Make gradient start higher and be stronger at the bottom
            colors={['transparent', 'rgba(0,0,0,0.6)', '#000']}
            style={styles.gradient}
          />
          <View style={styles.headerContent}>
            <Text style={styles.title}>{displayTitle}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.rating}>
                {details.vote_average ? details.vote_average.toFixed(1) : "N/A"} ★
              </Text>
              <Text style={styles.year}>{releaseYear}</Text>
              {details.production_countries && details.production_countries.length > 0 && (
                <Image
                  source={{ uri: `https://flagcdn.com/w40/${details.production_countries[0].iso_3166_1.toLowerCase()}.png` }}
                  style={styles.countryFlag}
                />
              )}
              {mediaType === 'tv' && details.number_of_seasons && (
                <Text style={styles.seasons}>
                  {details.number_of_seasons} {details.number_of_seasons > 1 ? 'Seasons' : 'Season'}
                </Text>
              )}

              {mediaType === 'movie' && details.runtime && (
                <Text style={styles.runtime}>
                  {formatRuntime(details.runtime)}
                </Text>
              )}
            </View>

            {genresArray.length > 0 ? (
              <View style={styles.genreBadgeContainer}>
                {genresArray.map((genre, index) => (
                  <View key={index} style={styles.genreBadge}>
                    <Text style={styles.genreBadgeText}>{genre}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {mediaType === 'movie' && (
              <TouchableOpacity style={styles.playButton} onPress={handlePlayMovie}>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.playButtonText}>Play</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Overview Section */}
        <View style={styles.overviewContainer}>
          <Text style={styles.overview}>{details.overview}</Text>
        </View>

        {/* TV Show-specific content */}
        {mediaType === 'tv' && (
          <>
            {/* Tab Selector */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'episodes' && styles.tabActive]}
                onPress={() => setSelectedTab('episodes')}
              >
                <Text style={[styles.tabText, selectedTab === 'episodes' && styles.tabTextActive]}>
                  Episodes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'moreLikeThis' && styles.tabActive]}
                onPress={() => setSelectedTab('moreLikeThis')}
              >
                <Text style={[styles.tabText, selectedTab === 'moreLikeThis' && styles.tabTextActive]}>
                  More Like This
                </Text>
              </TouchableOpacity>
            </View>

            {selectedTab === 'episodes' && (
            <>
            <View style={styles.seasonsContainer}>
              <View style={styles.seasonsScrollViewContainer}>
                <FlatList
                  ref={seasonListRef}
                  horizontal
                  data={details.seasons || []}
                  renderItem={({ item }) => renderSeasonButton(item.season_number)}
                  keyExtractor={(item) => `season-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonsScrollContent}
                  getItemLayout={(data, index) => ({
                    length: 130, // Approximate width of a season button
                    offset: 130 * index,
                    index,
                  })}
                  onScrollToIndexFailed={info => {
                    // Fallback for when layout isn't ready
                    const wait = new Promise(resolve => setTimeout(resolve, 200));
                    wait.then(() => {
                      seasonListRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true,
                      });
                    });
                  }}
                />
                <LinearGradient
                  colors={['#000', 'transparent']}
                  style={[styles.scrollGradient, styles.scrollGradientLeft]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  pointerEvents="none"
                />
                <LinearGradient
                  colors={['transparent', '#000']}
                  style={[styles.scrollGradient, styles.scrollGradientRight]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  pointerEvents="none"
                />
              </View>
            </View>

            <View style={styles.episodesContainer}>
              {/* Show loading indicator here if loading seasons AFTER initial details are loaded */}
              {loading && details && (
                <View style={styles.episodesLoadingContainer}>
                  <ActivityIndicator size="small" color="#E50914" />
                </View>
              )}
              {/* Hide episode list content while loading new season */}
              {!loading && seasonDetails && ( // Check seasonDetails, episodesToShow handles empty/filtered
                <>
                  {/* episodesToShow is already filtered and sliced */}
                  {episodesToShow.length > 0 ? (
                    <>
                      <Text style={styles.sectionTitle}>
                        Season {selectedSeason} • {totalEpisodesInSeason}{' '}
                        {totalEpisodesInSeason === 1 ? 'Episode' : 'Episodes'}
                      </Text>
                      <FlatList
                        ref={flatListRef}
                        data={episodesToShow}
                        keyExtractor={(item) => `episode-${item.id}`}
                        renderItem={renderEpisode}
                        scrollEnabled={false} // The parent ScrollView handles scrolling
                        initialNumToRender={displayedEpisodesCount}
                        getItemLayout={(data, index) => {
                          const itemHeight = (styles.episodeImageContainer?.height || 70) +
                            (styles.episodeItem?.paddingBottom || 0) +
                            (styles.episodeItem?.borderBottomWidth || 0) +
                            (styles.episodeItem?.marginBottom || 0);
                          return { length: itemHeight, offset: itemHeight * index, index };
                        }}
                      />
                      {showLoadMoreButton && (
                        <TouchableOpacity
                          style={styles.loadMoreButton}
                          onPress={handleLoadMoreEpisodes}
                        >
                          <Text style={styles.loadMoreButtonText}>Load More Episodes</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <Text style={styles.noEpisodesText}>No episodes found for this season.</Text>
                  )}
                </>
              )}
              {!loading && !seasonDetails && (!details.seasons || details.seasons.length === 0) && (
                <Text style={styles.noEpisodesText}>No seasons available for this show yet.</Text>
              )}
              {!loading && !seasonDetails && details.seasons && details.seasons.length > 0 && !selectedSeason && (
                <Text style={styles.noEpisodesText}>Select a season to view episodes.</Text>
              )}
            </View>
            </>
            )}

            {selectedTab === 'moreLikeThis' && (
              <View style={styles.tvRecommendationsSection}>
                {loadingRecommendations ? (
                  <View style={styles.loadingRecommendationsContainer}>
                    <ActivityIndicator size="small" color="#E50914" />
                  </View>
                ) : recommendations.length > 0 ? (
                  <View style={styles.recommendationsGrid}>
                    {recommendations.map((item) => (
                      <MediaCard
                        key={`rec-${item.id}`}
                        item={item}
                        onPress={() => handleRecommendationPress(item)}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noRecommendationsText}>No recommendations available.</Text>
                )}
              </View>
            )}
          </>
        )}

        {mediaType === 'movie' && (
          ((details.credits && details.credits.cast && details.credits.cast.length > 0) || recommendations.length > 0 || loadingRecommendations) ? (
            <>
              {/* Cast Section */}
              {details.credits && details.credits.cast && details.credits.cast.length > 0 && (
                <View style={styles.castSection}>
                  <Text style={styles.sectionTitle}>Cast</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castScrollView}>
                    {details.credits.cast.slice(0, 15).map(actor => (
                      <View key={`actor-${actor.id}`} style={styles.castMember}>
                        {actor.profile_path ? (
                          <Image
                            source={{ uri: getImageUrl(actor.profile_path) }}
                            style={styles.castImage}
                          />
                        ) : (
                          <View style={styles.castImagePlaceholder}>
                            <Ionicons name="person" size={30} color="#666" />
                          </View>
                        )}
                        <Text style={styles.castName} numberOfLines={1}>{actor.name}</Text>
                        <Text style={styles.castCharacter} numberOfLines={1}>{actor.character}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
              {recommendations.length > 0 && (
                <View style={styles.recommendationsSection}>
                  <Text style={styles.sectionTitle}>More Like This</Text>
                  <View style={styles.recommendationsGrid}>
                    {recommendations.map((item) => (
                      <MediaCard
                        key={`rec-${item.id}`}
                        item={item}
                        onPress={() => handleRecommendationPress(item)}
                      />
                    ))}
                  </View>
                </View>
              )}
              {loadingRecommendations && (
                <View style={styles.loadingRecommendationsContainer}>
                  <ActivityIndicator size="small" color="#E50914" />
                </View>
              )}
            </>
          ) : null
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 20
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  headerContainer: {
    position: 'relative',
    height: 400, // Increased height
  },
  backdropImage: {
    width: '100%',
    height: 400, // Increased height
    position: 'absolute',
  },
  backdropPlaceholder: {
    width: '100%',
    height: 400, // Increased height
    backgroundColor: '#1a1a1a', // Darker placeholder
    position: 'absolute',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 500, // Match container height
  },
  headerContent: {
    padding: 15, // Consistent padding
    position: 'absolute',
    bottom: 5, // Position content higher
    left: 0,
    right: 0,
  },
  title: {
    color: '#fff',
    fontSize: 28, // Larger title
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center', // Align items vertically
    marginBottom: 12,
  },
  rating: {
    color: 'yellow',
    marginRight: 12,
    fontWeight: 'bold',
  },
  year: {
    color: '#aaa',
    marginRight: 12,
    fontSize: 14,
  },
  countryFlag: {
    width: 27,
    height: 18,
    borderRadius: 3,
    marginRight: 8,
  },
  seasons: {
    color: '#aaa',
    fontSize: 14,
    marginRight: 12,
  },
  runtime: {
    color: '#aaa',
    fontSize: 14,
  },
  genreBadgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  genreBadge: {
    backgroundColor: '#222', // Dark grey badge background
    borderRadius: 8,      // Rounded badge
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,       // Space for wrapped badges
  },
  genreBadgeText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center'
  },
  // New Overview Section Style
  overviewContainer: {
    marginTop: -15,
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 10, // Add vertical padding
  },
  overview: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22, // Slightly increased line height
  },
  playButton: {
    backgroundColor: '#fff', // White play button like Netflix
    paddingVertical: 10, // Slightly smaller padding
    paddingHorizontal: 20,
    borderRadius: 5, // Slightly rounded corners
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0, // Removed top margin as it's positioned differently
    alignSelf: 'flex-start', // Keep it left-aligned
    maxWidth: 150, // Limit width
  },
  playButtonText: {
    color: '#000', // Black text on white button
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8, // Space icon and text
  },
  seasonsContainer: {
    // paddingHorizontal: 15, // Horizontal padding will be on the inner ScrollView content
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    // position: 'relative', // Ensure gradients are positioned correctly if needed, but View should handle it
  },
  seasonsScrollViewContainer: {
    position: 'relative', // For absolute positioning of gradients
    marginHorizontal: 0, // Remove margin if seasonsContainer had it
  },
  seasonsScrollContent: {
    paddingHorizontal: 15, // Apply padding here so gradients can overlay edges
  },
  scrollGradient: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 25, // Width of the gradient fade
    zIndex: 1, // Ensure gradient is above the scroll content if needed (usually not for pointerEvents="none")
  },
  scrollGradientLeft: {
    left: 0,
  },
  scrollGradientRight: {
    right: 0,
  },
  seasonButton: {
    paddingVertical: 8,
    paddingHorizontal: 20, // Adjust padding
    marginRight: 10, // Adjust spacing
    borderRadius: 8, // More rounded buttons
    backgroundColor: '#222', // Default background
    borderWidth: 0, // Remove border
  },
  selectedSeasonButton: {
    backgroundColor: '#E50914', // Keep red for selected
  },
  seasonButtonText: {
    color: '#fff',
    fontSize: 14, // Slightly larger text
  },
  selectedSeasonText: {
    fontWeight: 'bold',
  },
  episodesContainer: {
    paddingHorizontal: 15, // Match padding
    paddingBottom: 15, // Add bottom padding
    minHeight: 100,
  },
  episodesLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 20,
    paddingHorizontal: 0, // Add horizontal padding to section titles
  },
  episodeItem: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 15,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  episodeImageContainer: { // New container for image and progress bar
    width: 120,
    height: 70,
    borderRadius: 4,
    marginRight: 12,
    position: 'relative', // For absolute positioning of progress bar
    overflow: 'hidden', // Ensures progress bar doesn't exceed image bounds
  },
  episodeImage: {
    width: '100%',
    height: '100%',
  },
  episodeImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 5, // Height of the progress bar
    backgroundColor: 'rgb(75, 75, 75)', // Semi-transparent background for the bar container
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#E50914', // Netflix red
  },
  watchedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  episodeNumber: {
    color: '#aaa',
    fontSize: 13, // Slightly larger
    marginBottom: 3,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 15, // Slightly smaller
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeOverview: {
    color: '#888',
    fontSize: 13, // Slightly larger
    lineHeight: 18,
  },
  loadMoreButton: {
    backgroundColor: '#333',
    paddingVertical: 10, // Adjust padding
    paddingHorizontal: 20,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10, // Adjust margin
  },
  loadMoreButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noEpisodesText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  castSection: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    // Removed borderTop, let recommendations add it if needed
  },
  castScrollView: {
    paddingTop: 10, // Add padding top
  },
  castMember: {
    width: 90, // Adjust width
    marginRight: 12, // Adjust spacing
    alignItems: 'center',
  },
  castImage: {
    width: 70, // Smaller image
    height: 70,
    borderRadius: 35, // Keep circular
    marginBottom: 6, // Adjust spacing
    backgroundColor: '#333', // Background for loading/error
  },
  castImagePlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#2a2a2a', // Darker placeholder
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  castName: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2, // Add margin top
  },
  castCharacter: {
    color: '#888',
    fontSize: 11, // Smaller character name
    textAlign: 'center',
  },
  // Recommendations Styles
  recommendationsSection: {
    paddingHorizontal: 8,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  recommendationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  loadingRecommendationsContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  // Tab Styles
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
  // TV Recommendations Styles
  tvRecommendationsSection: {
    paddingHorizontal: 8,
    paddingTop: 15,
  },
  noRecommendationsText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  // Styles for Unreleased Badge on DetailScreen
  unreleasedEpisodeImageContainer: {

  },
  unreleasedBadgeDetailScreenContainer: {
    position: 'absolute',
    top: 4, // Adjust position as needed
    right: 4,
    zIndex: 1,
  },
  unreleasedBadgeDetailScreen: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    borderColor: 'white',
    borderWidth: 1,
  },
  unreleasedBadgeTextDetailScreen: {
    color: 'white',
    fontSize: 9,
    fontWeight: 'bold',
  },
  unreleasedEpisodeText: {
    opacity: 1,
  },
});

export default DetailScreen;