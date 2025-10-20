import React from 'react';
import { StyleSheet, Image, TouchableOpacity, View, Text } from 'react-native';
import { SPORT_LOGO_MAP } from '../api/streameastApi';

const SportCard = ({ sportToken, sportName, liveCount, totalCount, onPress }) => {
  const logoUrl = SPORT_LOGO_MAP[sportToken] || SPORT_LOGO_MAP['DEFAULT'];
  
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: logoUrl }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
      <View style={styles.infoContainer}>
        <Text style={styles.sportName} numberOfLines={1}>
          {sportName}
        </Text>
        <Text style={styles.streamCount}>
          {liveCount > 0 ? `${liveCount} live` : `${totalCount} upcoming`}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 6,
    marginBottom: 5,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
    width: 120,
  },
  imageContainer: {
    width: '100%',
    height: 100,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  infoContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sportName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  streamCount: {
    color: '#999999',
    fontSize: 11,
    textAlign: 'center',
  },
});

export default SportCard;

