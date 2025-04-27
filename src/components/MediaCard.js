import React, { useState } from 'react';
import { StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { getImageUrl } from '../api/tmdbApi';
import ImagePlaceholder from './ImagePlaceholder';

const { width } = Dimensions.get('window');

const MediaCard = ({ item, onPress, width: customWidth, height: customHeight }) => {
  const [imageError, setImageError] = useState(false);
  const cardWidth = customWidth || styles.container.width;
  const cardHeight = customHeight || styles.container.height;
  
  const posterPath = item.poster_path || item.posterPath;
  const imageSource = posterPath && !imageError
    ? { uri: getImageUrl(posterPath) }
    : null;

  return (
    <TouchableOpacity 
      style={[
        styles.container, 
        { width: cardWidth, height: cardHeight }
      ]} 
      onPress={() => onPress(item)}
    >
      {imageSource ? (
        <Image 
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <ImagePlaceholder width={cardWidth} height={cardHeight} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width / 3 - 16,
    height: (width / 3 - 16) * 1.5,
    margin: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default MediaCard;