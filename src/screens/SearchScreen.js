import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { searchMedia, getImageUrl } from '../api/tmdbApi';
import { getMediaType } from '../api/vidsrcApi';

const SearchScreen = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 300 });
      return () => {
        // Optional fade out
      };
    }, [opacity])
  );

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setNoResults(false);

    try {
      const searchResults = await searchMedia(query);

      const filteredResults = searchResults.filter(
        (item) =>
          (item.poster_path || item.backdrop_path) &&
          (item.media_type === 'movie' || item.media_type === 'tv')
      );

      setResults(filteredResults);
      setNoResults(filteredResults.length === 0);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setNoResults(true);
    } finally {
      setLoading(false);
    }
  };

  const handleItemPress = (item) => {
    const mediaType = item.media_type || getMediaType(item);

    navigation.navigate('DetailScreen', {
      mediaId: item.id,
      mediaType,
      title: mediaType === 'tv' ? item.name : item.title,
      poster_path: item.poster_path
    });
  };

  const renderSearchResult = ({ item }) => {
    const title = item.title || item.name || 'Unknown';
    const posterPath = item.poster_path;
    const backdropPath = item.backdrop_path;

    const imageSource = posterPath
      ? { uri: getImageUrl(posterPath) }
      : backdropPath
        ? { uri: getImageUrl(backdropPath) }
        : require('../../assets/placeholder.png');

    const releaseYear = item.release_date || item.first_air_date
      ? new Date((item.release_date || item.first_air_date)).getFullYear()
      : '';

    const mediaType = item.media_type === 'tv' ? 'TV Show' : 'Movie';

    return (
      <TouchableOpacity style={styles.resultItem} onPress={() => handleItemPress(item)}>
        <Image source={imageSource} style={styles.poster} />
        <View style={styles.itemDetails}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.itemInfo}>
            {releaseYear ? (
              <Text style={styles.itemYear}>{releaseYear}</Text>
            ) : null}
            <Text style={styles.itemType}>{mediaType}</Text>
          </View>
          <Text style={styles.itemOverview} numberOfLines={2}>
            {item.overview || 'No description available'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.animatedContainer, animatedStyle]}>

        <StatusBar barStyle="light-content" backgroundColor="#000" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Search</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={24} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies & TV shows"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#E50914" />
          </View>
        ) : noResults ? (
          <View style={styles.centerContent}>
            <Text style={styles.noResultsText}>No results found for "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.resultsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 5,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 5,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    color: '#888',
    fontSize: 16,
  },
  resultsList: {
    paddingHorizontal: 16,
  },
  resultItem: {
    flexDirection: 'row',
    marginVertical: 10,
  },
  poster: {
    width: 100,
    height: 150,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  itemInfo: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  itemYear: {
    color: '#aaa',
    marginRight: 10,
  },
  itemType: {
    color: '#aaa',
  },
  itemOverview: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },
  separator: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 10,
  },
});

export default SearchScreen;