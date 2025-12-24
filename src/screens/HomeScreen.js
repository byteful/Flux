import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Text,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchNewReleaseMovies,
  fetchNewReleaseTVShows,
  fetchMovieDetails,
  fetchTVShowDetails,
  fetchRecommendedMovies,
  fetchRecommendedTVShows,
  fetchMediaByGenre,
  getImageUrl,
} from '../api/tmdbApi';
import { getContinueWatchingList, saveToContinueWatching, removeFromContinueWatching } from '../utils/storage';
import { fetchLiveStreams, getSportDisplayName } from '../api/streameastApi';
import MediaRow from '../components/MediaRow';
import SportRow from '../components/SportRow';
import FeaturedContent from '../components/FeaturedContent';
import { SafeAreaView } from 'react-native-safe-area-context';

// Define genres to display (ID: Name)
const GENRES_TO_DISPLAY = {
  movie: [
    { id: 28, name: 'Action Movies' },
    { id: 35, name: 'Comedy Movies' },
    { id: 878, name: 'Sci-Fi Movies' },
    { id: 27, name: 'Horror Movies' },
    { id: 16, name: 'Animated Movies' },
  ],
  tv: [
    { id: 10759, name: 'Action & Adventure TV' },
    { id: 35, name: 'Comedy TV' },
    { id: 18, name: 'Drama TV' },
    { id: 9648, name: 'Mystery TV' },
    { id: 16, name: 'Animated TV Shows' },
  ],
};

const HomeScreen = () => {
  const navigation = useNavigation();
  // Removed trending state
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTVShows, setPopularTVShows] = useState([]);
  const [newReleaseMovies, setNewReleaseMovies] = useState([]);
  const [newReleaseTVShows, setNewReleaseTVShows] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recommendedTVShows, setRecommendedTVShows] = useState([]);
  const [genreMedia, setGenreMedia] = useState({});
  const [liveStreams, setLiveStreams] = useState([]);
  const [sportCategories, setSportCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [featuredContent, setFeaturedContent] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const opacity = useSharedValue(0); // Animated value for opacity
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const fetchContent = useCallback(async () => {
    // Define shuffleArray at a higher scope
    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    try {
      if (!refreshing) {
        setLoading(true);
      }

      // Fetch live streams
      let liveStreamsData = [];
      try {
        liveStreamsData = await fetchLiveStreams();
      } catch (liveStreamError) {
        console.error('Error fetching live streams:', liveStreamError);
      }

      // Fetch standard content (already filtered by US providers in tmdbApi.js)
      const moviesData = await fetchPopularMovies();
      const tvShowsData = await fetchPopularTVShows();
      const newReleaseMoviesData = await fetchNewReleaseMovies();
      const newReleaseTVShowsData = await fetchNewReleaseTVShows();

      // Fetch genre-specific content (filtered by US providers in tmdbApi.js)
      const genrePromises = [];
      const newGenreMedia = {};

      GENRES_TO_DISPLAY.movie.forEach(genre => {
        genrePromises.push(
          fetchMediaByGenre('movie', genre.id)
            .then(data => { newGenreMedia[`movie_${genre.id}`] = data; })
            .catch(e => console.error(`Error fetching genre ${genre.name}:`, e))
        );
      });
      GENRES_TO_DISPLAY.tv.forEach(genre => {
        genrePromises.push(
          fetchMediaByGenre('tv', genre.id)
            .then(data => { newGenreMedia[`tv_${genre.id}`] = data; })
            .catch(e => console.error(`Error fetching genre ${genre.name}:`, e))
        );
      });

      await Promise.all(genrePromises);
      // Shuffle genre media
      for (const key in newGenreMedia) {
        if (Array.isArray(newGenreMedia[key])) { // Ensure it's an array before shuffling
          newGenreMedia[key] = shuffleArray([...newGenreMedia[key]]);
        }
      }
      setGenreMedia(newGenreMedia);

      // Set random featured content from popular movies/tv
      const allPopular = [...moviesData, ...tvShowsData];
      if (allPopular.length > 0) {
        const randomIndex = Math.floor(Math.random() * allPopular.length);
        setFeaturedContent(allPopular[randomIndex]);
      }

      // Get continue watching from storage
      const continueWatchingData = await getContinueWatchingList();

      // Fetch recommendations based on the most recent item (filtered by US providers)
      let recMovies = [];
      let recTVShows = [];
      if (continueWatchingData.length > 0) {
        const mostRecentItem = continueWatchingData[0];
        try {
          let details;
          if (mostRecentItem.mediaType === 'movie') {
            details = await fetchMovieDetails(mostRecentItem.mediaId);
          } else if (mostRecentItem.mediaType === 'tv') {
            details = await fetchTVShowDetails(mostRecentItem.mediaId);
          }

          if (details && details.genres && details.genres.length > 0) {
            const genreIds = details.genres.map(g => g.id).join(',');
            const params = { with_genres: genreIds };
            // These fetches now filter by US providers via tmdbApi.js
            recMovies = await fetchRecommendedMovies(params);
            recTVShows = await fetchRecommendedTVShows(params);

            // Basic filtering to remove the source item
            recMovies = recMovies.filter(m => m.id !== mostRecentItem.mediaId);
            recTVShows = recTVShows.filter(tv => tv.id !== mostRecentItem.mediaId);

            // Filter problematic single-season TV shows
            const detailedTVShows = await Promise.all(
              recTVShows.map(tv => fetchTVShowDetails(tv.id).catch(e => {
                console.warn(`Could not fetch details for recommended TV show ${tv.id}:`, e);
                return null;
              }))
            );

            // Shuffle Recommendations
            recMovies = shuffleArray([...recMovies]);
            recTVShows = shuffleArray([...recTVShows]);
          }
        } catch (recError) {
          console.error("Error fetching recommendations based on watch history:", recError);
        }
      } else {
      }

      // Shuffle popular movies and TV shows
      const shuffledMoviesData = shuffleArray([...moviesData]);
      const shuffledTVShowsData = shuffleArray([...tvShowsData]);
      const shuffledNewReleaseMoviesData = shuffleArray([...newReleaseMoviesData]);
      const shuffledNewReleaseTVShowsData = shuffleArray([...newReleaseTVShowsData]);

      // Removed setTrending
      setPopularMovies(shuffledMoviesData);
      setPopularTVShows(shuffledTVShowsData);
      setNewReleaseMovies(shuffledNewReleaseMoviesData);
      setNewReleaseTVShows(shuffledNewReleaseTVShowsData);
      setContinueWatching(continueWatchingData);
      setRecommendedMovies(recMovies);
      setRecommendedTVShows(recTVShows);
      setLiveStreams(liveStreamsData);

      // Group live streams by sport
      const sportGroups = {};
      liveStreamsData.forEach(stream => {
        const token = stream.sportToken || 'DEFAULT';
        if (!sportGroups[token]) {
          sportGroups[token] = {
            sportToken: token,
            sportName: getSportDisplayName(token),
            streams: [],
            liveCount: 0,
            totalCount: 0,
          };
        }
        sportGroups[token].streams.push(stream);
        sportGroups[token].totalCount++;
        if (stream.isLive) {
          sportGroups[token].liveCount++;
        }
      });

      const sportCategoriesArray = Object.values(sportGroups);
      setSportCategories(sportCategoriesArray);

    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  // Effect to run animation on focus
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
        .catch(e => console.warn("Failed to lock HomeScreen orientation:", e));
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 300 });

      return () => {
      };
    }, [opacity])
  );

  useEffect(() => {
    fetchContent();

    const unsubscribe = navigation.addListener('focus', () => {
      getContinueWatchingList().then(data => {
        setContinueWatching(data);
        // Optionally re-fetch recommendations here if needed, or rely on initial load/refresh
        // Consider if fetching recommendations on every focus is too much
      });
    });

    return unsubscribe;
  }, [navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContent();
  }, [fetchContent]);

  const handleSportPress = (sportCategory) => {
    navigation.navigate('SportStreams', {
      sportToken: sportCategory.sportToken,
      sportName: sportCategory.sportName,
      streams: sportCategory.streams,
    });
  };

  const handleMediaPress = (item, directPlay = false) => {
    const isContinueWatchingItem = item.hasOwnProperty('mediaId');
    const isRecommendationOrApiItem = item.hasOwnProperty('id');
    const isLiveStreamItem = item.hasOwnProperty('isLive');

    if (isLiveStreamItem) {
      navigation.navigate('VideoPlayer', {
        isLive: true,
        streameastUrl: item.streameastUrl,
        title: item.title,
        sportToken: item.sportToken,
      });
      return;
    }

    let mediaId;
    let mediaType;
    let title;
    let poster_path = item.poster_path;
    let season = item.season;
    let episode = item.episode;
    let episodeTitle = item.episodeTitle;

    if (isContinueWatchingItem) {
      mediaId = item.mediaId;
      mediaType = item.mediaType;
      title = item.title;
    } else if (isRecommendationOrApiItem) {
      mediaId = item.id;
      mediaType = item.media_type || (item.title ? 'movie' : 'tv');
      title = (mediaType === 'tv') ? item.name : item.title;
    } else {
      console.warn('Unknown item type pressed:', item);
      return;
    }

    if (directPlay && mediaType && mediaId && title) {
      const posterUrl = item.poster_path ? getImageUrl(item.poster_path) : null;
      navigation.navigate('VideoPlayer', {
        mediaId: mediaId,
        mediaType: mediaType,
        title: title,
        posterUrl: posterUrl,
        poster_path: item.poster_path,
        season: season,
        episode: episode,
        episodeTitle: episodeTitle,
      });
    } else if (mediaId && mediaType) {
      navigation.navigate('DetailScreen', { mediaId: mediaId, mediaType: mediaType, title: title });
    } else {
      console.error("Missing mediaId or mediaType for navigation");
    }
  };

  // Define handler for the info button
  const handleInfoPress = (item) => {
    // Continue watching items store mediaId and mediaType directly
    if (item.mediaId && item.mediaType) {
      navigation.navigate('DetailScreen', { mediaId: item.mediaId, mediaType: item.mediaType, title: item.title });
    } else {
      console.error("Missing mediaId or mediaType for info navigation from Continue Watching item:", item);
      Alert.alert("Error", "Could not load details for this item.");
    }
  };

  // Define handler for the remove button
  const handleRemovePress = async (contentId) => {
    // contentId is passed directly from MediaCard via MediaRow
    const success = await removeFromContinueWatching(contentId);
    if (success) {
      // Update the state to remove the item from the UI
      setContinueWatching(prev => prev.filter(item => item.id !== contentId));
    } else {
      Alert.alert("Error", "Could not remove item from Continue Watching.");
    }
  };

  // Only show the full-screen loader on initial load, not during refresh
  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={[styles.animatedContainer, animatedStyle]}>

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Flux</Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
              colors={['#fff']}
            />
          }
        >
          {featuredContent && (
            <FeaturedContent
              item={featuredContent}
              onPlay={() => handleMediaPress(featuredContent, true)}
              onInfoPress={() => handleMediaPress(featuredContent)}
            />
          )}

          {continueWatching.length > 0 && (
            <MediaRow
              title="Continue Watching"
              data={continueWatching}
              onItemPress={(item) => handleMediaPress(item, true)}
              isContinueWatching={true}
              onInfoPress={handleInfoPress}
              onRemovePress={handleRemovePress}
            />
          )}

          <SportRow
            title="Live Sports (beta)"
            data={sportCategories}
            onSportPress={handleSportPress}
          />

          {newReleaseMovies.length > 0 && (
            <MediaRow
              title="New Release Movies"
              data={newReleaseMovies}
              onItemPress={handleMediaPress}
            />
          )}

          {newReleaseTVShows.length > 0 && (
            <MediaRow
              title="New Release TV Shows"
              data={newReleaseTVShows}
              onItemPress={handleMediaPress}
            />
          )}

          {/* Recommendation Rows (Filtered by US Providers) */}
          {recommendedMovies.length > 0 && (
            <MediaRow
              title="Movies You Might Like"
              data={recommendedMovies}
              onItemPress={handleMediaPress}
            />
          )}

          {recommendedTVShows.length > 0 && (
            <MediaRow
              title="TV Shows You Might Like"
              data={recommendedTVShows}
              onItemPress={handleMediaPress}
            />
          )}

          {/* Popular Rows (Filtered by US Providers) */}
          {popularMovies.length > 0 && (
            <MediaRow
              title="Popular Movies"
              data={popularMovies}
              onItemPress={handleMediaPress}
            />
          )}

          {popularTVShows.length > 0 && (
            <MediaRow
              title="Popular TV Shows"
              data={popularTVShows}
              onItemPress={handleMediaPress}
            />
          )}

          {/* Genre Rows (Filtered by US Providers) */}
          {GENRES_TO_DISPLAY.movie.map(genre => (
            genreMedia[`movie_${genre.id}`] && genreMedia[`movie_${genre.id}`].length > 0 && (
              <MediaRow
                key={`movie-${genre.id}`}
                title={genre.name}
                data={genreMedia[`movie_${genre.id}`]}
                onItemPress={handleMediaPress}
              />
            )
          ))}

          {GENRES_TO_DISPLAY.tv.map(genre => (
            genreMedia[`tv_${genre.id}`] && genreMedia[`tv_${genre.id}`].length > 0 && (
              <MediaRow
                key={`tv-${genre.id}`}
                title={genre.name}
                data={genreMedia[`tv_${genre.id}`]}
                onItemPress={handleMediaPress}
              />
            )
          ))}

        </ScrollView>

      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  animatedContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});

export default HomeScreen;