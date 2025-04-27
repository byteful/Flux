import React from 'react';
import { View, Text, ImageBackground, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getImageUrl } from '../api/tmdbApi';

const { width, height } = Dimensions.get('window');

const FeaturedContent = ({ item, onPlay }) => {
  const imageUrl = item?.backdrop_path 
    ? getImageUrl(item.backdrop_path)
    : null;
  
  const title = item?.title || item?.name || '';
  const overview = item?.overview || '';

  return (
    <View style={styles.container}>
      <ImageBackground
        source={imageUrl ? { uri: imageUrl } : require('../../assets/placeholder.png')}
        style={styles.backgroundImage}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)', '#000']}
          style={styles.gradient}
        >
          <View style={styles.contentContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.overview} numberOfLines={2}>
              {overview}
            </Text>
            <TouchableOpacity 
              style={styles.playButton}
              onPress={() => onPlay(item)}
            >
              <Text style={styles.playButtonText}>▶ Play</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width,
    height: height * 0.65,
    marginBottom: 10,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  contentContainer: {
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  overview: {
    color: '#CCC',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  playButton: {
    backgroundColor: 'red',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 4,
  },
  playButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default FeaturedContent;