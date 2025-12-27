import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LiveIndicator = ({ isAtLiveEdge }) => {
  return (
    <View style={styles.liveIndicatorContainer}>
      <View style={[styles.liveCircle, { backgroundColor: isAtLiveEdge ? '#FF0000' : '#888888' }]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  liveIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
    justifyContent: 'center',
  },
  liveCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  liveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default LiveIndicator;
