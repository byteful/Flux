import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import MediaCard from './MediaCard';

const MediaRow = ({ 
  title, 
  data, 
  onItemPress, 
  onInfoPress,
  onRemovePress,
  isContinueWatching = false,
  isLiveStream = false
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <MediaCard 
            item={item} 
            onPress={onItemPress} 
            onInfoPress={onInfoPress}
            onRemovePress={onRemovePress}
            width={isContinueWatching ? 140 : (isLiveStream ? 240 : 100)}
            height={isContinueWatching ? 210 : (isLiveStream ? 135 : 150)}
            isContinueWatching={isContinueWatching}
            isLiveStream={isLiveStream}
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