import React from 'react';
import { View, Text, ImageBackground, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getHighResImageUrl } from '../api/tmdbApi';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const FeaturedContent = ({ item, onPlay, onInfoPress }) => {
  const imageUrl = item?.backdrop_path
    ? getHighResImageUrl(item.backdrop_path)
    : null;
  
  const title = item?.title || item?.name || '';
  const overview = item?.overview || '';

  return (
    <View style={styles.cardContainer}>
      <ImageBackground
        source={imageUrl ? { uri: imageUrl } : require('../../assets/placeholder.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          // Gradient similar to Netflix style
          colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,1)']}
          style={styles.gradient}
        >
          {/* Remove background from content container, rely on gradient */}
          <View style={styles.contentContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.overview} numberOfLines={3}>
              {overview}
            </Text>
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[styles.button, styles.playButton]}
                onPress={() => onPlay(item)}
              >
                <Ionicons name="play" size={18} color="#000" />
                <Text style={[styles.buttonText, styles.playButtonText]}>Play</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.infoButton]}
                onPress={() => onInfoPress(item)}
              >
                <Ionicons name="information-circle-outline" size={18} color="#fff" />
                <Text style={[styles.buttonText, styles.infoButtonText]}>Info</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    height: height * 0.6,
    borderRadius: 15,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    borderColor: 'rgb(42, 42, 42)',
    borderWidth: 1,
    maxWidth: 700, // Added max width
    alignSelf: 'center', // Center the card
    width: '95%', // Ensure it still tries to fill available width up to maxWidth
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  gradient: {
    height: '100%',
    justifyContent: 'flex-end',
    padding: 15,
  },
  contentContainer: {
    alignItems: 'center',
    // Removed background color to rely on the gradient
    borderRadius: 10,
    padding: 15,
    width: '100%',
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  overview: {
    color: '#E0E0E0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 15,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 5,
    minWidth: 120,
    justifyContent: 'center',
  },
  playButton: {
    backgroundColor: '#fff',
  },
  infoButton: {
    backgroundColor: 'rgba(109, 109, 110, 0.7)',
  },
  buttonText: {
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 15,
  },
  playButtonText: {
    color: '#000',
  },
  infoButtonText: {
    color: '#fff',
  },
});

export default FeaturedContent;