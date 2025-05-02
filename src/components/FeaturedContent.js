import React from 'react';
import { View, Text, ImageBackground, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getHighResImageUrl } from '../api/tmdbApi'; // Use high-res image function
import { Ionicons } from '@expo/vector-icons'; // Import Ionicons

const { width, height } = Dimensions.get('window');

// Accept onInfoPress prop
const FeaturedContent = ({ item, onPlay, onInfoPress }) => {
  const imageUrl = item?.backdrop_path 
    ? getHighResImageUrl(item.backdrop_path) // Use high-res image
    : null;
  
  const title = item?.title || item?.name || '';
  const overview = item?.overview || '';

  return (
    // Card container with margin and rounded corners
    <View style={styles.cardContainer}>
      <ImageBackground
        source={imageUrl ? { uri: imageUrl } : require('../../assets/placeholder.png')}
        style={styles.backgroundImage}
        resizeMode="cover" // Ensure image covers the area
      >
        <LinearGradient
          // Adjust gradient to be less intrusive if needed
          colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
          style={styles.gradient}
        >
          <View style={styles.contentContainer}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.overview} numberOfLines={3}> {/* Allow more lines for overview */}
              {overview}
            </Text>
            {/* Container for buttons */}
            <View style={styles.buttonsContainer}>
              <TouchableOpacity 
                style={[styles.button, styles.playButton]} // Use shared button style
                onPress={() => onPlay(item)}
              >
                <Ionicons name="play" size={18} color="#000" />
                <Text style={[styles.buttonText, styles.playButtonText]}>Play</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, styles.infoButton]} // Use shared button style
                onPress={() => onInfoPress(item)} // Call onInfoPress
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
    // Make it a card
    height: height * 0.6, // Adjust height as needed
    borderRadius: 15,
    overflow: 'hidden', // Clip image to rounded corners
    marginHorizontal: 15, // Add horizontal margin
    marginTop: 10, // Add top margin
    marginBottom: 20, // Increase bottom margin
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    borderColor: 'rgb(42, 42, 42)',
    borderWidth: 1
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end', // Align gradient to bottom
  },
  gradient: {
    // Take full height of background image
    height: '100%', 
    justifyContent: 'flex-end', // Align content to bottom
    padding: 15, // Adjusted padding
  },
  contentContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', // Slight background for text readability
    borderRadius: 10,
    padding: 15,
    width: '100%',
  },
  title: {
    color: 'white',
    fontSize: 22, // Slightly smaller title
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  overview: {
    color: '#E0E0E0', // Lighter grey
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 15, // Space before buttons
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center', // Space out buttons
    gap: 10,
    width: '100%', // Take full width
  },
  // Shared button style
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 5,
    minWidth: 120, // Ensure buttons have minimum width
    justifyContent: 'center',
  },
  playButton: {
    backgroundColor: '#fff', // White background for Play
  },
  infoButton: {
    backgroundColor: 'rgba(109, 109, 110, 0.7)', // Greyish background for Info
  },
  // Shared button text style
  buttonText: {
    fontWeight: 'bold',
    marginLeft: 8, // Space between icon and text
    fontSize: 15,
  },
  playButtonText: {
    color: '#000', // Black text for Play button
  },
  infoButtonText: {
    color: '#fff', // White text for Info button
  },
});

export default FeaturedContent;