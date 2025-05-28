import React, { useState, useCallback, useEffect } from 'react';
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
import { saveSearchQuery, getSearchHistory, removeSearchQuery, clearSearchHistory } from '../utils/storage';

const SearchScreen = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(true);
  const [listVersion, setListVersion] = useState(0); // Added for FlatList refresh
  const opacity = useSharedValue(0);

  // Removed Mount/Unmount useEffect and Render console.log

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      opacity.value = withTiming(1, { duration: 300 });
      loadSearchHistory();
      // Removed redundant logic:
      // if (!query.trim()) {
      //   setShowHistory(true);
      // }
      // This is handled by the useEffect hook that depends on query.
      setListVersion(prevVersion => prevVersion + 1); // Increment listVersion
      return () => {
        // opacity.value = 0; // Optional: Reset opacity on blur
      };
    }, [opacity]) // Removed query from dependency array
  );

  // useEffect to handle showing/hiding history based on query changes
  // This runs after the initial setup by useFocusEffect
  useEffect(() => {
    if (!query.trim()) {
      setShowHistory(true);
      loadSearchHistory(); // Ensure history is fresh when input is empty
    } else {
      setShowHistory(false);
    }
  }, [query]);

  const loadSearchHistory = async () => {
    const history = await getSearchHistory();
    setSearchHistory(history);
  };

  const handleSearch = async (searchQuery = query) => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setResults([]);
      setNoResults(false);
      setShowHistory(true);
      loadSearchHistory(); // Refresh history view
      return;
    }

    setLoading(true);
    setNoResults(false);
    setShowHistory(false); // Hide history when a search is performed

    try {
      await saveSearchQuery(trimmedQuery); // Save successful search
      const searchResults = await searchMedia(trimmedQuery);

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
      loadSearchHistory(); // Refresh history list after search
    }
  };

  const handleQueryChange = (text) => {
    setQuery(text);
    // The useEffect above will handle setShowHistory and loadSearchHistory
    // based on the new query value.
    // We still need to clear results if text becomes empty here.
    if (!text.trim()) {
      setResults([]);
      setNoResults(false);
    }
  };

  const handleClearInput = () => {
    setQuery('');
    setResults([]);
    setNoResults(false);
    setShowHistory(true);
    loadSearchHistory();
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

  const handleHistoryItemPress = (historyQuery) => {
    setQuery(historyQuery);
    handleSearch(historyQuery); // Pass the query directly
  };

  const handleRemoveHistoryItem = async (historyQuery) => {
    await removeSearchQuery(historyQuery);
    loadSearchHistory();
  };

  const handleClearAllHistory = async () => {
    await clearSearchHistory();
    loadSearchHistory();
  };

  const renderHistoryItem = ({ item }) => (
    <TouchableOpacity style={styles.historyItem} onPress={() => handleHistoryItemPress(item)}>
      <Text style={styles.historyItemText}>{item}</Text>
      <TouchableOpacity onPress={() => handleRemoveHistoryItem(item)} style={styles.historyRemoveIconContainer}>
        <Ionicons name="close-circle" size={20} color="#888" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
            onChangeText={handleQueryChange}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
            autoFocus
            clearButtonMode="always"
            onClear={handleClearInput} // This will be triggered by the native clear button
          />
          {/* Removed custom clear button to prevent overlap */}
        </View>

        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#E50914" />
          </View>
        ) : showHistory && searchHistory.length > 0 && results.length === 0 ? (
          <>
            <View style={styles.historyHeader}>
              <Text style={styles.historyHeaderText}>Recent Searches</Text>
              <TouchableOpacity onPress={handleClearAllHistory}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={searchHistory}
              renderItem={renderHistoryItem}
              keyExtractor={(item, index) => `${item}-${index}`}
              contentContainerStyle={styles.historyList}
              ItemSeparatorComponent={() => <View style={styles.historySeparator} />}
            />
          </>
        ) : noResults && !showHistory ? (
          <View style={styles.centerContent}>
            <Text style={styles.noResultsText}>No results found for "{query}"</Text>
          </View>
        ) : results.length > 0 && !showHistory ? (
          <FlatList
            data={results}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.resultsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            extraData={listVersion} // Added extraData
          />
        ) : (
           !loading && query.trim() === '' && searchHistory.length === 0 && ( // Show if input is empty and no history
            <View style={styles.centerContent}>
              <Text style={styles.noResultsText}>Start typing to search for movies and TV shows.</Text>
            </View>
          )
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
    // paddingRight: 30, // No longer needed as custom icon is removed
  },
  // clearIconContainer style is no longer needed
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
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 5,
  },
  historyHeaderText: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyList: {
    paddingHorizontal: 16,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyItemText: {
    color: '#fff',
    fontSize: 16,
    flex: 1, // Allow text to take available space
  },
  historyRemoveIconContainer: {
    paddingLeft: 10, // Add some space before the icon
  },
  historySeparator: {
    height: 1,
    backgroundColor: '#222', // Darker separator for history
  },
  clearAllText: {
    color: '#E50914', // Theme color for actionable text
    fontSize: 14,
    fontWeight: 'bold',
  }
});

export default SearchScreen;