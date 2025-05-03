import React, { useState, useEffect } from 'react';
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
import { fetchTVShowDetails, fetchSeasonDetails, fetchMovieDetails, getImageUrl, fetchMovieRecommendations } from '../api/tmdbApi';
import { Ionicons } from '@expo/vector-icons';
import MediaCard from '../components/MediaCard';

const DetailScreen = ({ route, navigation }) => {
  const { mediaId, mediaType, title } = route.params;
  const [details, setDetails] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonDetails, setSeasonDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayedEpisodesCount, setDisplayedEpisodesCount] = useState(25); // State for displayed episodes count
  const [recommendations, setRecommendations] = useState([]); // State for recommendations
  const [loadingRecommendations, setLoadingRecommendations] = useState(false); // State for recommendation loading

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setRecommendations([]); // Reset recommendations
        setDisplayedEpisodesCount(25); // Reset count on media change
        
        if (mediaType === 'tv') {
          // Fetch TV show details
          const mediaDetails = await fetchTVShowDetails(mediaId);
          setDetails(mediaDetails);
          
          // Fetch first season by default
          if (mediaDetails.seasons && mediaDetails.seasons.length > 0) {
            const season = await fetchSeasonDetails(mediaId, 1);
            setSeasonDetails(season);
            // No need to set displayedEpisodesCount here, it's reset above
          }
        } else {
          // Fetch movie details
          const mediaDetails = await fetchMovieDetails(mediaId);
          setDetails(mediaDetails);
          // Fetch movie recommendations AFTER details are fetched
          setLoadingRecommendations(true);
          const recs = await fetchMovieRecommendations(mediaId);
          setRecommendations(recs);
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
  }, [mediaId, mediaType]);

  const handleSeasonChange = async (seasonNumber) => {
    try {
      setLoading(true);
      setSelectedSeason(seasonNumber);
      setDisplayedEpisodesCount(25); // Reset count on season change
      const season = await fetchSeasonDetails(mediaId, seasonNumber);
      setSeasonDetails(season);
    } catch (error) {
      console.error('Error fetching season details:', error);
    } finally {
      await (new Promise(resolve => setTimeout(resolve, 100))); // Give it some time to render images
      setLoading(false);
    }
  };

  const handleEpisodePress = (episode) => {
    navigation.navigate('VideoPlayer', {
      mediaId: mediaId,
      mediaType: 'tv',
      season: selectedSeason,
      episode: episode.episode_number,
      title: details.name,
      episodeTitle: episode.name,
      poster_path: details.poster_path,
    });
  };
  
  const handlePlayMovie = () => {
    navigation.navigate('VideoPlayer', {
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
    navigation.push('Detail', { // Use push to allow navigating to another detail screen
      mediaId: item.id,
      mediaType: recommendedMediaType,
      title: recommendedMediaType === 'movie' ? item.title : item.name,
    });
  };

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

  const renderEpisode = ({ item }) => (
    <TouchableOpacity style={styles.episodeItem} onPress={() => handleEpisodePress(item)}>
      <View style={styles.episodeRow}>
        {item.still_path ? (
          <Image
            source={{ uri: getImageUrl(item.still_path) }}
            style={styles.episodeImage}
          />
        ) : (
          <View style={styles.episodeImagePlaceholder} />
        )}
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeNumber}>Episode {item.episode_number}</Text>
          <Text style={styles.episodeTitle}>{item.name}</Text>
          <Text style={styles.episodeOverview} numberOfLines={2}>
            {item.overview || 'No description available.'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
  
  const renderRecommendation = ({ item }) => (
    <MediaCard 
      item={item} 
      onPress={() => handleRecommendationPress(item)} 
      // Add specific styling for recommendations if needed, or use default MediaCard style
      style={styles.recommendationCard} 
    />
  );

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
  const genres = details.genres && details.genres.length > 0
    ? details.genres.map(genre => genre.name).join(', ')
    : '';

  const episodesToShow = seasonDetails?.episodes?.slice(0, displayedEpisodesCount) || [];
  const totalEpisodes = seasonDetails?.episodes?.length || 0;
  const showLoadMoreButton = totalEpisodes > displayedEpisodesCount;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
              {details.vote_average && (
                <Text style={styles.rating}>
                  {details.vote_average.toFixed(1)} ★
                </Text>
              )}
              <Text style={styles.year}>{releaseYear}</Text>
              
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
            
            {genres ? <Text style={styles.genres}>{genres}</Text> : null}
            
            {/* Play button for movies - MOVED HERE */}
            {mediaType === 'movie' && (
              <TouchableOpacity style={styles.playButton} onPress={handlePlayMovie}>
                <Ionicons name="play" size={18} color="#000" />
                <Text style={styles.playButtonText}>Play</Text>
              </TouchableOpacity>
            )}
            {/* Overview removed from here */}
          </View>
        </View>

        {/* Overview Section */}
        <View style={styles.overviewContainer}>
          <Text style={styles.overview}>{details.overview}</Text>
        </View>

        {/* TV Show-specific content */}
        {mediaType === 'tv' && (
          <>
            <View style={styles.seasonsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {details.seasons && details.seasons
                  .filter(season => season.season_number > 0) // Filter out "Specials" (Season 0)
                  .map(season => renderSeasonButton(season.season_number))
                }
              </ScrollView>
            </View>

            <View style={styles.episodesContainer}>
              {/* Show loading indicator here if loading seasons AFTER initial details are loaded */}
              {loading && details && (
                <View style={styles.episodesLoadingContainer}>
                  <ActivityIndicator size="small" color="#E50914" />
                </View>
              )}
              {/* Hide episode list content while loading new season */}
              {!loading && seasonDetails && seasonDetails.episodes && (
                <>
                  <Text style={styles.sectionTitle}>
                    Season {selectedSeason} • {seasonDetails.episodes.length}{' '}
                    {seasonDetails.episodes.length === 1 ? 'Episode' : 'Episodes'}
                  </Text>
                  <FlatList
                    data={episodesToShow} // Use sliced data
                    keyExtractor={(item) => `episode-${item.id}`}
                    renderItem={renderEpisode}
                    scrollEnabled={false} // Keep this false as it's inside a ScrollView
                  />
                  {/* Load More Button */}
                  {showLoadMoreButton && (
                    <TouchableOpacity 
                      style={styles.loadMoreButton} 
                      onPress={handleLoadMoreEpisodes}
                    >
                      <Text style={styles.loadMoreButtonText}>Load More Episodes</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {/* Handle case where season details might be null initially or after error */}
              {!loading && !seasonDetails && (
                 <Text style={styles.noEpisodesText}>No episodes found for this season.</Text>
              )}
            </View>
          </>
        )}
        
        {/* Movie-specific content */}
        {mediaType === 'movie' && (
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

            {/* Recommendations Section */}
            {recommendations.length > 0 && (
              <View style={styles.recommendationsSection}>
                <Text style={styles.sectionTitle}>More Like This</Text>
                <FlatList
                  horizontal
                  data={recommendations}
                  renderItem={renderRecommendation}
                  keyExtractor={(item) => `rec-${item.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recommendationsList}
                />
              </View>
            )}
            {/* Optional: Show loading indicator for recommendations */}
            {loadingRecommendations && (
              <View style={styles.loadingRecommendationsContainer}>
                <ActivityIndicator size="small" color="#E50914" />
              </View>
            )}
          </>
        )}
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
    height: 400, // Match container height
  },
  headerContent: {
    padding: 15, // Consistent padding
    position: 'absolute',
    bottom: 20, // Position content higher
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
    color: '#4CAF50', // Green rating color
    marginRight: 12,
    fontWeight: 'bold',
  },
  year: {
    color: '#aaa',
    marginRight: 12,
    fontSize: 14,
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
  genres: {
    color: '#ccc', // Slightly brighter genres
    fontSize: 14,
    marginBottom: 16, // More space before play button
    lineHeight: 20,
  },
  // New Overview Section Style
  overviewContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10, // Add vertical padding
  },
  overview: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 21, // Slightly increased line height
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
    paddingHorizontal: 15, // Match other padding
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  seasonButton: {
    paddingVertical: 8,
    paddingHorizontal: 16, // Adjust padding
    marginRight: 10, // Adjust spacing
    borderRadius: 15, // More rounded buttons
    backgroundColor: '#333', // Default background
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
    marginBottom: 15,
    paddingHorizontal: 15, // Add horizontal padding to section titles
  },
  episodeItem: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 15,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center', // Align items vertically
  },
  episodeImage: {
    width: 120, // Slightly smaller image
    height: 70,
    borderRadius: 4,
    marginRight: 12, // Add margin to the right
  },
  episodeImagePlaceholder: {
    width: 120,
    height: 70,
    backgroundColor: '#333',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeInfo: {
    flex: 1,
    // marginLeft: 10, // Removed margin
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
  castPlaceholderText: { // Removed, using Icon now
    // ...
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
    paddingVertical: 15,
    borderTopWidth: 1, // Add separator line above recommendations
    borderTopColor: '#222',
  },
  recommendationsList: {
    paddingHorizontal: 15, // Add padding to the container
  },
  recommendationCard: {
    marginRight: 10, // Space between recommendation cards
    width: 110, // Adjust width as needed
    // Add any specific styling overrides for MediaCard in this context
  },
  loadingRecommendationsContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default DetailScreen;