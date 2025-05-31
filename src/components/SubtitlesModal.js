import React from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLanguageFlag } from '../utils/languageUtils'; // Import the flag utility

const SubtitlesModal = ({
visible,
onClose,
availableLanguages, // Expected format: [{ code: 'en', name: 'English' }, ...] or similar
selectedLanguage,   // e.g., 'en' or null
onSelectLanguage,
loading,
}) => {
const renderLanguageItem = ({ item }) => {
const isSelected = item.code === selectedLanguage || (item.code === 'none' && selectedLanguage === null);
const displayName = item.name; // item.name should already be 'None' or the language name
const flagEmoji = item.code === 'none' ? '' : getLanguageFlag(item.code); // Get flag, empty for "None"

return (
  <TouchableOpacity
    style={[
      styles.languageOption,
      isSelected && styles.languageOptionSelected,
    ]}
    onPress={() => onSelectLanguage(item.code === 'none' ? null : item.code)}
  >
    {flagEmoji ? <Text style={styles.flagText}>{flagEmoji}</Text> : <View style={styles.flagPlaceholder} />}
    <Text style={styles.languageText}>{displayName}</Text>
    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#E50914" style={styles.checkmarkIcon} />}
  </TouchableOpacity>
);
};

// Add "None" option to the beginning of the list
const languagesWithOptions = [
{ code: 'none', name: 'None' }, // Ensure 'None' is always an option
...(availableLanguages || []).filter(lang => lang && lang.code), // Filter out invalid entries
];

return (
<Modal
animationType="fade"
transparent={true}
visible={visible}
onRequestClose={onClose}
supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <View style={styles.header}>
        <Text style={styles.modalTitle}>Select Subtitles</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButtonIcon}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#E50914" style={styles.loader} />
      ) : (
        <FlatList
          data={languagesWithOptions}
          renderItem={renderLanguageItem}
          keyExtractor={(item) => item.code}
          style={styles.list}
          ListEmptyComponent={
            // Show empty only if no actual languages and not loading
            !loading && (!availableLanguages || availableLanguages.length === 0) ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No subtitles available for this video.</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  </View>
</Modal>
);
};

const styles = StyleSheet.create({
modalOverlay: {
flex: 1,
backgroundColor: 'rgba(0, 0, 0, 0.85)',
justifyContent: 'center',
alignItems: 'center',
},
modalContent: {
backgroundColor: '#141414',
width: '60%',
maxWidth: 500, // Max width for larger screens
maxHeight: '70%',
borderRadius: 8,
paddingVertical: 0, // No vertical padding here, header and list will manage
paddingHorizontal: 0,
shadowColor: '#000',
shadowOffset: { width: 0, height: 5 },
shadowOpacity: 0.8,
shadowRadius: 15,
elevation: 30,
overflow: 'hidden', // Ensures children (like FlatList) respect border radius
},
header: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
paddingHorizontal: 20,
paddingVertical: 15, // Increased padding for header
borderBottomWidth: 1,
borderBottomColor: '#282828',
},
modalTitle: {
color: 'white',
fontSize: 20,
fontWeight: 'bold',
},
closeButtonIcon: {
padding: 5,
},
loader: {
flex: 1, // Make loader take up space if list is empty
justifyContent: 'center',
alignItems: 'center',
paddingVertical: 20,
},
list: {
width: '100%',
},
languageOption: {
flexDirection: 'row',
alignItems: 'center',
paddingVertical: 15,
paddingHorizontal: 20,
borderBottomWidth: 1,
borderBottomColor: '#282828',
},
languageOptionSelected: {
backgroundColor: '#252525',
},
flagText: {
color: 'white',
fontSize: 16,
marginRight: 12,
minWidth: 28, // Ensure space for flag or placeholder, adjust as needed
textAlign: 'center',
},
flagPlaceholder: { // Style for the empty view when there's no flag (for "None")
  width: 28, // Should match minWidth of flagText or be adjusted
  marginRight: 12,
},
languageText: {
  color: 'white',
  fontSize: 16,
  flex: 1,
},
checkmarkIcon: {
  marginLeft: 10, // Space before checkmark
},
emptyContainer: { // Container for empty text to center it
flex: 1,
justifyContent: 'center',
alignItems: 'center',
padding: 20,
},
emptyText: {
color: '#888',
textAlign: 'center',
fontSize: 16,
},
});

export default SubtitlesModal;