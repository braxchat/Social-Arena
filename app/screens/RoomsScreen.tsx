/**
 * Social Arena - Rooms Screen
 * 
 * Lists all rooms the user belongs to and allows creating new rooms.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getUserRooms, createRoom, getCurrentUser, logout, clearAllCache } from '../core';
import { Room } from '../core/types';

type RoomsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Rooms'>;

interface Props {
  navigation: RoomsScreenNavigationProp;
}

export default function RoomsScreen({ navigation }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadRooms = async () => {
    const result = await getUserRooms();
    if (result.success) {
      setRooms(result.data);
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadRooms();
    });
    return unsubscribe;
  }, [navigation]);

  // Set header right button (logout)
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.headerLogoutButton}
        >
          <Text style={styles.headerLogoutText}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Room name is required');
      return;
    }

    setLoading(true);
    const result = await createRoom(roomName.trim());
    setLoading(false);

    if (result.success) {
      setRoomName('');
      setShowCreateModal(false);
      await loadRooms();
      // Navigate to the new room
      navigation.navigate('Room', { roomId: result.data.id });
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout();
          navigation.replace('Auth');
        },
      },
    ]);
  };

  // TEMPORARY: Development/testing only - Remove when ready for production
  const handleClearCache = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all cached users, rooms, and data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllCache();
              Alert.alert('Success', 'All cached data cleared');
              // Navigate to auth screen
              navigation.replace('Auth');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to clear cache');
            }
          },
        },
      ]
    );
  };

  const renderRoom = ({ item }: { item: Room }) => (
    <TouchableOpacity
      style={styles.roomItem}
      onPress={() => navigation.navigate('Room', { roomId: item.id })}
    >
      <Text style={styles.roomName}>{item.name}</Text>
      {item.description && (
        <Text style={styles.roomDescription}>{item.description}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.header}>
        <Text style={styles.welcomeText}>
          Welcome, {getCurrentUser()?.username || 'User'}
        </Text>
        {/* TEMPORARY: Development/testing only - Remove when ready for production */}
        <TouchableOpacity
          style={styles.clearCacheButton}
          onPress={handleClearCache}
        >
          <Text style={styles.clearCacheText}>Clear Cache</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.createSection}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>Create Room</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => navigation.navigate('JoinArena', {})}
        >
          <Text style={styles.joinButtonText}>Join with Code</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Create New Room</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholderTextColor="#888"
                  value={roomName}
                  onChangeText={setRoomName}
                  autoFocus={true}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={() => {
                      setShowCreateModal(false);
                      setRoomName('');
                    }}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCreateButton, loading && styles.buttonDisabled]}
                    onPress={handleCreateRoom}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.modalCreateText}>Create</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Text style={styles.sectionTitle}>Your Rooms</Text>
      {refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No rooms yet. Create one above!</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          renderItem={renderRoom}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={loadRooms}
        />
      )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerLogoutButton: {
    marginRight: 10,
    padding: 5,
  },
  headerLogoutText: {
    color: '#4A90E2',
    fontSize: 16,
    fontWeight: '500',
  },
  // TEMPORARY: Development/testing only - Remove when ready for production
  clearCacheButton: {
    padding: 5,
  },
  clearCacheText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '500',
  },
  createSection: {
    marginBottom: 30,
  },
  createButton: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  joinButtonText: {
    color: '#4A90E2',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  roomItem: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  roomDescription: {
    color: '#888888',
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888888',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#000000',
    color: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#2a2a2a',
  },
  modalCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCreateButton: {
    backgroundColor: '#4A90E2',
  },
  modalCreateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

