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
import { fetchTVShowDetails, fetchSeasonDetails, fetchMovieDetails, getImageUrl } from '../api/tmdbApi';
import { Ionicons } from '@expo/vector-icons';

const DetailScreen = ({ route, navigation }) => {
  const { mediaId, mediaType, title } = route.params;
  const [details, setDetails] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [seasonDetails, setSeasonDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        
        if (mediaType === 'tv') {
          // Fetch TV show details
          const mediaDetails = await fetchTVShowDetails(mediaId);
          setDetails(mediaDetails);
          
          // Fetch first season by default
          if (mediaDetails.seasons && mediaDetails.seasons.length > 0) {
            const season = await fetchSeasonDetails(mediaId, 1);
            setSeasonDetails(season);
          }
        } else {
          // Fetch movie details
          const mediaDetails = await fetchMovieDetails(mediaId);
          setDetails(mediaDetails);
        }
      } catch (error) {
        console.error('Error fetching details:', error);
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
      const season = await fetchSeasonDetails(mediaId, seasonNumber);
      setSeasonDetails(season);
    } catch (error) {
      console.error('Error fetching season details:', error);
    } finally {
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

  if (loading || !details) {
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          {details.backdrop_path ? (
            <Image
              source={{ uri: getImageUrl(details.backdrop_path) }}
              style={styles.backdropImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.backdropPlaceholder} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)', '#000']}
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
            
            <Text style={styles.overview}>{details.overview}</Text>
            
            {/* Play button for movies */}
            {mediaType === 'movie' && (
              <TouchableOpacity style={styles.playButton} onPress={handlePlayMovie}>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.playButtonText}>Play</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* TV Show-specific content */}
        {mediaType === 'tv' && (
          <>
            <View style={styles.seasonsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {details.seasons && Array.from(
                  { length: details.number_of_seasons },
                  (_, i) => renderSeasonButton(i + 1)
                )}
              </ScrollView>
            </View>

            <View style={styles.episodesContainer}>
              {seasonDetails && seasonDetails.episodes && (
                <>
                  <Text style={styles.sectionTitle}>
                    Season {selectedSeason} • {seasonDetails.episodes.length}{' '}
                    {seasonDetails.episodes.length === 1 ? 'Episode' : 'Episodes'}
                  </Text>
                  <FlatList
                    data={seasonDetails.episodes}
                    keyExtractor={(item) => `episode-${item.id}`}
                    renderItem={renderEpisode}
                    scrollEnabled={false}
                  />
                </>
              )}
            </View>
          </>
        )}
        
        {/* Movie-specific content */}
        {mediaType === 'movie' && details.credits && (
          <View style={styles.castSection}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castScrollView}>
              {details.credits.cast && details.credits.cast.slice(0, 10).map(actor => (
                <View key={`actor-${actor.id}`} style={styles.castMember}>
                  {actor.profile_path ? (
                    <Image 
                      source={{ uri: getImageUrl(actor.profile_path) }}
                      style={styles.castImage}
                    />
                  ) : (
                    <View style={styles.castImagePlaceholder}>
                      <Text style={styles.castPlaceholderText}>
                        {actor.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.castName} numberOfLines={1}>{actor.name}</Text>
                  <Text style={styles.castCharacter} numberOfLines={1}>{actor.character}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
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
    height: 300,
  },
  backdropImage: {
    width: '100%',
    height: 300,
    position: 'absolute',
  },
  backdropPlaceholder: {
    width: '100%',
    height: 300,
    backgroundColor: '#333',
    position: 'absolute',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  headerContent: {
    padding: 20,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  rating: {
    color: '#FFC107',
    marginRight: 15,
  },
  year: {
    color: '#aaa',
    marginRight: 15,
  },
  seasons: {
    color: '#aaa',
  },
  runtime: {
    color: '#aaa',
  },
  genres: {
    color: '#aaa',
    marginBottom: 10,
  },
  overview: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  playButton: {
    backgroundColor: '#E50914',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  seasonsContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  seasonButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  selectedSeasonButton: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  seasonButtonText: {
    color: '#fff',
  },
  selectedSeasonText: {
    fontWeight: 'bold',
  },
  episodesContainer: {
    padding: 15,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    marginLeft: 10,
  },
  episodeItem: {
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 15,
  },
  episodeRow: {
    flexDirection: 'row',
  },
  episodeImage: {
    width: 130,
    height: 80,
    borderRadius: 4,
  },
  episodeImagePlaceholder: {
    width: 130,
    height: 80,
    backgroundColor: '#333',
    borderRadius: 4,
  },
  episodeInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  episodeNumber: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 2,
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  episodeOverview: {
    color: '#888',
    fontSize: 12,
  },
  castSection: {
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  castScrollView: {
    paddingVertical: 10,
  },
  castMember: {
    width: 100,
    marginRight: 15,
    alignItems: 'center',
  },
  castImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
  },
  castImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  castPlaceholderText: {
    color: '#fff',
    fontSize: 24,
  },
  castName: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  castCharacter: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
});

export default DetailScreen;