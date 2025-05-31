import React from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const SourceSelectionModal = ({
  visible,
  onClose,
  sources, // Array of { name: string, baseUrl: string, ... }
  onSelectSource, // (sourceInfo) => void
  currentAttemptStatus, // { [sourceName: string]: 'idle' | 'loading' | 'failed' | 'success' }
  currentPlayingSourceName, // string
}) => {

  const renderSourceItem = ({ item }) => {
    const status = currentAttemptStatus[item.name] || 'idle';
    const isPlayingThisSource = item.name === currentPlayingSourceName;

    let statusIndicator = null;
    let textStyle = styles.sourceName; // Default text style

    if (status === 'loading') {
      statusIndicator = <ActivityIndicator size="small" color="#E50914" style={styles.statusIcon} />;
      textStyle = [styles.sourceName, styles.sourceNameLoading];
    } else if (status === 'failed') {
      statusIndicator = <Ionicons name="close-circle" size={20} color="red" style={styles.statusIcon} />;
      textStyle = [styles.sourceName, styles.sourceNameFailed];
    } else if (status === 'success') { // This might be brief if modal closes
      statusIndicator = <Ionicons name="checkmark-circle" size={20} color="green" style={styles.statusIcon} />;
      textStyle = [styles.sourceName, styles.sourceNameSuccess];
    } else if (status === 'idle') { // Explicitly check for 'idle'
      if (isPlayingThisSource) {
        statusIndicator = <Ionicons name="play-circle" size={20} color="#4CAF50" style={styles.statusIcon} />;
      } else {
        statusIndicator = <Ionicons name="chevron-forward-circle-outline" size={20} color="#ccc" style={styles.statusIcon} />;
      }
    }
    // If status is something else unexpected, statusIndicator remains null initially

    let itemStyle = styles.sourceItem;
    if (isPlayingThisSource) {
      itemStyle = [styles.sourceItem, styles.sourceItemPlaying];
      // Apply playing text style, but allow status styles to override if status is not 'idle'
      if (status === 'idle') {
        textStyle = [styles.sourceName, styles.sourceNamePlaying];
      }
    }

    return (
      <TouchableOpacity
        style={itemStyle}
        onPress={() => onSelectSource(item)}
        disabled={status === 'loading'}
      >
        <View style={styles.sourceNameContainer}>
          <Text style={textStyle}>{item.name}</Text>
          {/* Removed (Playing) text indicator */}
        </View>
        {statusIndicator}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
    >
      <SafeAreaView style={styles.modalOverlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Stream Source</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>
          </View>
          {sources && sources.length > 0 ? (
            <FlatList
              data={sources}
              renderItem={renderSourceItem}
              keyExtractor={(item) => item.name}
              style={styles.list}
              extraData={{ currentPlayingSourceName, currentAttemptStatus }}
            />
          ) : (
            <View style={styles.noSourcesContainer}>
              <Text style={styles.noSourcesText}>No alternative sources available.</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  modalContent: {
    width: '70%', // Adjusted for landscape
    maxHeight: '80%',
    backgroundColor: '#1C1C1C',
    borderRadius: 10,
    padding: 0, // Header will have padding
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    padding: 5,
  },
  list: {
    width: '100%',
  },
  sourceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sourceItemPlaying: {
    backgroundColor: '#2a2a2a', // Slightly different background for playing item
  },
  sourceNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1, // Allow text to take space and wrap if necessary
    marginRight: 5, // Space before the status icon
  },
  sourceName: {
    color: 'white',
    fontSize: 16,
  },
  sourceNameLoading: {
    color: '#aaa',
  },
  sourceNameFailed: {
    color: '#ff7777',
  },
  sourceNameSuccess: {
    color: '#77dd77',
  },
  sourceNamePlaying: {
    fontWeight: 'bold',
  },
  // playingIndicatorText style removed as the text element is removed
  statusIcon: {
    marginLeft: 10,
  },
  noSourcesContainer: {
    padding: 20,
    alignItems: 'center',
  },
  noSourcesText: {
    color: '#888',
    fontSize: 16,
  },
});

export default SourceSelectionModal;