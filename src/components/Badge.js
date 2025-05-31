import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Badge = ({ mediaType, releaseDate, firstAirDate, lastAirDate }) => {
  let badgeText = null;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  if (mediaType === 'movie' && releaseDate) {
    const releaseDateObj = new Date(releaseDate);
    if (releaseDateObj >= oneWeekAgo) {
      badgeText = "NEW";
    }
  } else if (mediaType === 'tv') {
    if (lastAirDate) {
      const lastAirDateObj = new Date(lastAirDate);
      if (lastAirDateObj >= oneWeekAgo) {
        badgeText = "New Episodes";
      }
    }
    // Fallback to show's first air date if no "New Episodes" and show itself is new
    if (!badgeText && firstAirDate) {
      const firstAirDateObj = new Date(firstAirDate);
      if (firstAirDateObj >= oneWeekAgo) {
        badgeText = "NEW";
      }
    }
  }

  if (!badgeText) {
    return null;
  }

  return (
    <View style={styles.newBadge}>
      <Text style={styles.newBadgeText}>{badgeText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  newBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'red',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 1, // Ensure badge is on top
  },
  newBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default Badge;