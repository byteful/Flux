import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import MediaCard from './MediaCard';

const MediaRow = ({ 
  title, 
  data, 
  onItemPress, 
  onInfoPress, // Pass down info handler
  onRemovePress, // Pass down remove handler
  isContinueWatching // Renamed from isFeatured
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={data}
        // Use item.id (contentId) + potentially index for more robust key if needed
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <MediaCard 
            item={item} 
            onPress={onItemPress} 
            onInfoPress={onInfoPress} // Pass to MediaCard
            onRemovePress={onRemovePress} // Pass to MediaCard
            // Adjust width/height based on isContinueWatching
            width={isContinueWatching ? 140 : 100}
            height={isContinueWatching ? 210 : 150}
            isContinueWatching={isContinueWatching} // Pass flag
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    marginLeft: 10,
  },
  listContainer: {
    paddingHorizontal: 6,
  },
});

export default MediaRow;