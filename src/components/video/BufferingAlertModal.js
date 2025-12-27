import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const BufferingAlertModal = ({ visible, onKeepBuffering, onRetryExtraction }) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      supportedOrientations={['landscape-left', 'landscape-right', 'landscape']}
      onRequestClose={onKeepBuffering}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.bufferingAlertModalContent}>
          <Text style={styles.modalTitle}>Still Buffering?</Text>
          <Text style={styles.bufferingAlertText}>
            The video has been buffering for a while.
          </Text>
          <View style={styles.bufferingAlertActions}>
            <TouchableOpacity style={[styles.bufferingAlertButton, styles.bufferingAlertKeepButton]} onPress={onKeepBuffering}>
              <Text style={styles.bufferingAlertButtonText}>Keep Buffering</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bufferingAlertButton, styles.bufferingAlertRetryButton]} onPress={onRetryExtraction}>
              <Text style={styles.bufferingAlertButtonText}>Try Re-Extract</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  bufferingAlertModalContent: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: '#282828',
    borderRadius: 12,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
  },
  bufferingAlertText: {
    color: '#E0E0E0',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  bufferingAlertActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  bufferingAlertButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    marginHorizontal: 10,
  },
  bufferingAlertKeepButton: {
    backgroundColor: '#4A4A4A',
  },
  bufferingAlertRetryButton: {
    backgroundColor: '#E50914',
  },
  bufferingAlertButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default BufferingAlertModal;
