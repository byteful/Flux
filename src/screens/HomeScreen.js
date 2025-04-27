import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, ScrollView, ActivityIndicator, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MediaRow from '../components/MediaRow';
import FeaturedContent from '../components/FeaturedContent';
import { 
  fetchTrending, 
  fetchPopularMovies, 
  fetchPopularTVShows 
} from '../api/tmdbApi';
import { getMediaType } from '../api/vidsrcApi';
import { getContinueWatchingList } from '../utils/storage';

const HomeScreen = ({ navigation }) => {
  const [trending, setTrending] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTVShows, setPopularTVShows] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [featuredContent, setFeaturedContent] = useState(null);

  const fetchContent = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch data from TMDB API
      const trendingData = await fetchTrending();
      const moviesData = await fetchPopularMovies();
      const tvShowsData = await fetchPopularTVShows();
      
      // Set random featured content
      const randomIndex = Math.floor(Math.random() * trendingData.length);
      setFeaturedContent(trendingData[randomIndex]);
      
      // Get continue watching from storage
      const continueWatchingData = await getContinueWatchingList();
      
      setTrending(trendingData);
      setPopularMovies(moviesData);
      setPopularTVShows(tvShowsData);
      setContinueWatching(continueWatchingData);
    } catch (error) {
      console.error('Error fetching content:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
    
    // Refresh content when focus changes (user comes back to this screen)
    const unsubscribe = navigation.addListener('focus', () => {
      getContinueWatchingList().then(data => setContinueWatching(data));
    });
    
    return unsubscribe;
  }, [navigation, fetchContent]);

  const handleMediaPress = (item) => {
    // Determine if the item is from 'Continue Watching' (has mediaId) or a direct TMDB fetch (has id)
    const isContinueWatching = item.hasOwnProperty('mediaId');
    
    let mediaId;
    let mediaType;
    let title;
    let poster_path = item.poster_path; // Common field

    if (isContinueWatching) {
      // Item from 'Continue Watching' storage
      mediaId = item.mediaId;
      mediaType = item.mediaType;
      title = item.title; 
      // poster_path is already set from item.poster_path
    } else {
      // Item from TMDB API fetch (Trending, Popular, etc.)
      mediaId = item.id; // Use the 'id' field from TMDB
      // Use 'media_type' from TMDB if available, otherwise infer it
      mediaType = item.media_type || getMediaType(item);
      // Determine title based on mediaType
      title = (mediaType === 'tv') ? item.name : item.title;
    }
    
    // Ensure we have the necessary data before navigating
    if (!mediaId || !mediaType) {
      console.error("Missing mediaId or mediaType for navigation:", { mediaId, mediaType, item });
      return; 
    }

    navigation.navigate('DetailScreen', { 
      mediaId: mediaId, 
      mediaType: mediaType, 
      title: title, 
      poster_path: poster_path
    });
  };

  const handleFeaturedPlay = (item) => {
    const mediaType = getMediaType(item);
    
    // For both TV shows and movies, navigate to DetailScreen
    navigation.navigate('DetailScreen', { 
      mediaId: item.id, 
      mediaType, 
      title: mediaType === 'tv' ? item.name : item.title,
      poster_path: item.poster_path
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {featuredContent && (
          <FeaturedContent 
            item={featuredContent} 
            onPlay={handleFeaturedPlay} 
          />
        )}
        
        {continueWatching.length > 0 && (
          <MediaRow
            title="Continue Watching"
            data={continueWatching}
            onItemPress={handleMediaPress}
            isFeatured={true}
          />
        )}
        
        <MediaRow
          title="Trending Now"
          data={trending}
          onItemPress={handleMediaPress}
        />
        
        <MediaRow
          title="Popular Movies"
          data={popularMovies}
          onItemPress={handleMediaPress}
        />
        
        <MediaRow
          title="Popular TV Shows"
          data={popularTVShows}
          onItemPress={handleMediaPress}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});

export default HomeScreen;