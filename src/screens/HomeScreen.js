import React, { useState, useEffect, useCallback, useRef } from 'react'; // Add useRef
import {
  StyleSheet,
  ScrollView,
  View,
  ActivityIndicator,
  RefreshControl,
  Alert, // Import Alert
  Text, // Import Text
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native'; // Add useFocusEffect
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'; // Import reanimated components
import {
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchMovieDetails, // Keep for recommendations based on history
  fetchTVShowDetails, // Keep for recommendations based on history and filtering
  fetchRecommendedMovies,
  fetchRecommendedTVShows,
  fetchMediaByGenre, // Import the new function
  getImageUrl, // Import getImageUrl
} from '../api/tmdbApi';
import { getContinueWatchingList, saveToContinueWatching, removeFromContinueWatching } from '../utils/storage'; // Import removeFromContinueWatching
import MediaRow from '../components/MediaRow';
import FeaturedContent from '../components/FeaturedContent';
import { SafeAreaView } from 'react-native-safe-area-context'; // Use context-aware SafeAreaView

// Define genres to display (ID: Name)
const GENRES_TO_DISPLAY = {
  movie: [
    { id: 28, name: 'Action Movies' },
    { id: 35, name: 'Comedy Movies' },
    { id: 878, name: 'Sci-Fi Movies' },
    { id: 27, name: 'Horror Movies' },
  ],
  tv: [
    { id: 10759, name: 'Action & Adventure TV' },
    { id: 35, name: 'Comedy TV' },
    { id: 18, name: 'Drama TV' },
    { id: 9648, name: 'Mystery TV' },
  ],
};

const HomeScreen = () => {
  const navigation = useNavigation();
  // Removed trending state
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTVShows, setPopularTVShows] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recommendedMovies, setRecommendedMovies] = useState([]);
  const [recommendedTVShows, setRecommendedTVShows] = useState([]);
  const [genreMedia, setGenreMedia] = useState({}); // State to hold genre-specific media
  const [loading, setLoading] = useState(true);
  const [featuredContent, setFeaturedContent] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const opacity = useSharedValue(0); // Animated value for opacity

  // Animation style
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const fetchContent = useCallback(async () => {
    try {
      // Don't set loading to true on refresh
      if (!refreshing) {
        setLoading(true);
      }

      // Fetch standard content (already filtered by US providers in tmdbApi.js)
      // Removed fetchTrending
      const moviesData = await fetchPopularMovies();
      const tvShowsData = await fetchPopularTVShows();

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
            function shuffleArray(array) {
              // ... (shuffle logic remains the same)
              for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
              }
              return array;
            }
            recMovies = shuffleArray([...recMovies]);
            recTVShows = shuffleArray([...recTVShows]);
          }
        } catch (recError) {
          console.error("Error fetching recommendations based on watch history:", recError);
        }
      } else {
        console.log("No watch history found, skipping recommendations based on history.");
      }

      // Removed setTrending
      setPopularMovies(moviesData);
      setPopularTVShows(tvShowsData);
      setContinueWatching(continueWatchingData);
      setRecommendedMovies(recMovies);
      setRecommendedTVShows(recTVShows);

    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
      setRefreshing(false); // Ensure refreshing is set to false
    }
  }, [refreshing]); // Depend on refreshing state

  // Effect to run animation on focus
  useFocusEffect(
    useCallback(() => {
      // Reset opacity to 0 initially in case we navigate back quickly
      opacity.value = 0;
      // Start the animation
      opacity.value = withTiming(1, { duration: 300 }); // Fade in over 300ms

      // Optional: Cleanup function to run when screen loses focus
      return () => {
        // You could fade out here if desired, but fading in the next screen might be enough
        // opacity.value = withTiming(0, { duration: 150 });
      };
    }, [opacity]) // Dependency array includes opacity shared value
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]); // Removed fetchContent from dependency array to prevent potential loops

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContent();
  }, [fetchContent]);

  // handleMediaPress remains largely the same, ensuring it handles 'id' from API items
  const handleMediaPress = (item, directPlay = false) => {
    // ... (existing logic is fine)
    const isContinueWatchingItem = item.hasOwnProperty('mediaId'); // From storage
    const isRecommendationOrApiItem = item.hasOwnProperty('id'); // From TMDB API

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
      // poster_path, season, episode, episodeTitle should already be on the item from storage
    } else if (isRecommendationOrApiItem) {
      mediaId = item.id;
      mediaType = item.media_type || (item.title ? 'movie' : 'tv');
      title = (mediaType === 'tv') ? item.name : item.title;
      // poster_path is directly from item
      // season/episode/episodeTitle are not applicable here, they are for continue watching items
    } else {
      console.warn('Unknown item type pressed:', item);
      return; // Don't navigate if item structure is unknown
    }

    // Navigate to DetailScreen first, unless directPlay is true (for continue watching)
    if (directPlay && mediaType && mediaId && title) {
      // Ensure posterUrl uses the correct property name from storage
      const posterUrl = item.poster_path ? getImageUrl(item.poster_path) : null;
      navigation.navigate('VideoPlayer', {
        mediaId: mediaId,
        mediaType: mediaType,
        title: title,
        posterUrl: posterUrl, // Use correct posterUrl
        poster_path: item.poster_path, // Pass poster_path too if needed elsewhere
        season: season, // Pass season if available (from continue watching)
        episode: episode, // Pass episode if available (from continue watching)
        episodeTitle: episodeTitle, // Pass episode title if available
        // resumeTime will be handled by VideoPlayerScreen using storage
      });
    } else if (mediaId && mediaType) {
      // Use the correct screen name defined in AppNavigator.js
      navigation.navigate('DetailScreen', { mediaId: mediaId, mediaType: mediaType });
    } else {
      console.error("Missing mediaId or mediaType for navigation");
    }
  };

  // Define handler for the info button
  const handleInfoPress = (item) => {
    // Continue watching items store mediaId and mediaType directly
    if (item.mediaId && item.mediaType) {
      navigation.navigate('DetailScreen', { mediaId: item.mediaId, mediaType: item.mediaType });
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
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.animatedContainer, animatedStyle]}>

        {/* Add Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Flux</Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff" // iOS
              colors={['#fff']} // Android
            />
          }
        >
          {featuredContent && (
            <FeaturedContent
              item={featuredContent}
              onPlay={() => handleMediaPress(featuredContent, true)} // Pass directPlay=true for play
              onInfoPress={() => handleMediaPress(featuredContent)} // Pass default handleMediaPress for info
            />
          )}

          {continueWatching.length > 0 && (
            <MediaRow
              title="Continue Watching"
              data={continueWatching}
              onItemPress={(item) => handleMediaPress(item, true)} // Direct play for continue watching
              isContinueWatching={true}
              onInfoPress={handleInfoPress}   // Pass info handler
              onRemovePress={handleRemovePress} // Pass remove handler
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
  animatedContainer: { // Add style for the animated wrapper
    flex: 1,
    backgroundColor: '#000', // Match screen background
  },
  container: {
    flex: 1,
    // backgroundColor: '#000', // Background is now on animatedContainer
  },
  // Add header styles
  header: {
    paddingHorizontal: 15,
    paddingTop: 10, // Adjust as needed
    paddingBottom: 10,
    // borderBottomWidth: 1, // Optional: Add a separator
    // borderBottomColor: '#222',
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
  // Add other styles if needed
});

export default HomeScreen;