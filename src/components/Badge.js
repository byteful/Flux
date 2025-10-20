import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Badge = ({ mediaType, releaseDate, firstAirDate, lastAirDate, isLive, isUpcoming }) => {
  let badgeText = null;
  let badgeStyle = styles.newBadge;
  let textStyle = styles.newBadgeText;

  if (isLive !== undefined) {
    if (isUpcoming) {
      return (
        <View style={styles.upcomingBadge}>
          <Text style={styles.upcomingBadgeText}>SOON</Text>
        </View>
      );
    }

    return (
      <View style={styles.liveBadge}>
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>
    );
  }

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
    <View style={badgeStyle}>
      <Text style={textStyle}>{badgeText}</Text>
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
    zIndex: 1,
  },
  newBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF0000',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 1,
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  liveBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  upcomingBadge: {
    position: 'absolute',
    top: 8,
    left: 0,
    backgroundColor: '#666666',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 1,
  },
  upcomingBadgeText: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default Badge;