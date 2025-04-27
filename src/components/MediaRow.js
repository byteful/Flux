import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import MediaCard from './MediaCard';

const MediaRow = ({ title, data, onItemPress, isFeatured }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <MediaCard 
            item={item} 
            onPress={onItemPress} 
            width={isFeatured ? 140 : 100}
            height={isFeatured ? 210 : 150}
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