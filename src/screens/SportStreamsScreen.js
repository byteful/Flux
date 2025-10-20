import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Badge from '../components/Badge';

const formatStartTime = (timestamp) => {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  let timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
  
  if (dateOnly.getTime() === today.getTime()) {
    return `Today at ${timeStr}`;
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return `Tomorrow at ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
};

const StreamItem = ({ stream, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.streamItem}
      onPress={() => onPress(stream)}
      activeOpacity={0.7}
    >
      <View style={styles.streamContent}>
        <View style={styles.streamHeader}>
          <Text style={styles.streamTitle} numberOfLines={2}>
            {stream.title}
          </Text>
          <View style={styles.badgeContainer}>
            <Badge isLive={true} isUpcoming={!stream.isLive} />
          </View>
        </View>
        {!stream.isLive && stream.matchTime && (
          <Text style={styles.startTime}>
            {formatStartTime(stream.matchTime)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const SportStreamsScreen = ({ route, navigation }) => {
  const { sportToken, sportName, streams } = route.params;

  const sortedStreams = [...streams].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    
    if (!a.isLive && !b.isLive) {
      return (a.matchTime || 0) - (b.matchTime || 0);
    }
    
    return 0;
  });

  const handleStreamPress = (stream) => {
    if (stream.isLive) {
      navigation.navigate('VideoPlayer', {
        isLive: true,
        streameastUrl: stream.streameastUrl,
        title: stream.title,
        sportToken: stream.sportToken,
      });
    } else {
      // For upcoming streams, could show an alert or just do nothing
      // console.log('Stream not yet live:', stream.title);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={sortedStreams}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StreamItem stream={item} onPress={handleStreamPress} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  listContent: {
    padding: 12,
  },
  streamItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  streamContent: {
    flex: 1,
  },
  streamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  streamTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  badgeContainer: {
    marginTop: -8,
    marginRight: 50,
  },
  startTime: {
    color: '#999999',
    fontSize: 13,
    marginTop: 4,
  },
});

export default SportStreamsScreen;

