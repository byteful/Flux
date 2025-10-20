import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import SportCard from './SportCard';

const SportRow = ({ title, data, onSportPress }) => {
  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No live sports available</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => item.sportToken}
        renderItem={({ item }) => (
          <SportCard
            sportToken={item.sportToken}
            sportName={item.sportName}
            liveCount={item.liveCount}
            totalCount={item.totalCount}
            onPress={() => onSportPress(item)}
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
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
  },
});

export default SportRow;

