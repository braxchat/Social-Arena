/**
 * Social Arena - Room Screen
 * 
 * Shows room details, current arena status, and actions.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from '@react-native-clipboard/clipboard';
import * as Sharing from 'expo-sharing';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getRoom,
  getRoomMembers,
  getActiveArenaInRoom,
  createArena,
  getArena,
  store,
  getCurrentUser,
  updateRoomName,
  deleteRoom,
  rotateRoomCode,
} from '../core';
import { Room, Arena, RoomMember } from '../core/types';
import { getDeviceId } from '../lib/deviceId';

type RoomScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Room'>;
type RoomScreenRouteProp = RouteProp<RootStackParamList, 'Room'>;

interface Props {
  navigation: RoomScreenNavigationProp;
  route: RoomScreenRouteProp;
}

export default function RoomScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [currentArena, setCurrentArena] = useState<Arena | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingArena, setCreatingArena] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [rotatingCode, setRotatingCode] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [showGameModeModal, setShowGameModeModal] = useState(false);

  // Get device ID on mount
  useEffect(() => {
    getDeviceId().then(id => setDeviceId(id));
  }, []);

  const currentUser = getCurrentUser();
  const isOwner = room?.owner_id === deviceId || room?.owner_id === currentUser?.id;

  const loadRoomData = async () => {
    try {
      setLoading(true);

      // Load room
      const roomResult = await getRoom(roomId);
      if (roomResult.success) {
        setRoom(roomResult.data);
        setRoomName(roomResult.data.name);
      } else {
        Alert.alert('Error', roomResult.error.message);
        setLoading(false);
        navigation.goBack();
        return;
      }

      // Load members
      const membersResult = await getRoomMembers(roomId);
      if (membersResult.success) {
        setMembers(membersResult.data);
      }

      // Load active arena
      const arenaResult = getActiveArenaInRoom(roomId);
      if (arenaResult.success && arenaResult.data) {
        setCurrentArena(arenaResult.data);
      } else {
        setCurrentArena(null);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load room data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoomData();
  }, [roomId]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadRoomData();
    });
    return unsubscribe;
  }, [navigation]);

  // Set header title and right button
  useEffect(() => {
    navigation.setOptions({
      title: room?.name || 'Room',
      headerBackTitle: '',
      headerBackTitleVisible: false,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.headerButton}
        >
          <Ionicons name="settings" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, room]);

  const handleCreateArena = () => {
    setShowGameModeModal(true);
  };

  const handleSelectGameMode = async (mode: 'predators' | 'outbreak' | 'specter' | 'duel') => {
    setShowGameModeModal(false);
    setCreatingArena(true);
    const result = await createArena(roomId, mode, 12);
    setCreatingArena(false);

    if (result.success) {
      // Navigate to lobby
      navigation.navigate('Lobby', { arenaId: result.data.id });
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleJoinLobby = () => {
    if (currentArena) {
      navigation.navigate('Lobby', { arenaId: currentArena.id });
    }
  };

  const handleViewActiveArena = () => {
    if (currentArena) {
      navigation.navigate('ActiveArena', { arenaId: currentArena.id });
    }
  };

  const handleViewResults = () => {
    if (currentArena) {
      navigation.navigate('Results', { arenaId: currentArena.id });
    }
  };

  const handleCopyCode = () => {
    if (room?.roomCode) {
      Clipboard.setString(room.roomCode);
      Alert.alert('Copied!', `Room code ${room.roomCode} copied to clipboard`);
    }
  };

  const handleShareLink = async () => {
    if (!room?.roomCode) return;

    const deepLink = `socialarena://join/${room.roomCode}`;
    
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync({
          message: `Join my room! Use code: ${room.roomCode}\n\nOr tap this link: ${deepLink}`,
          url: deepLink,
        });
      } else {
        // Fallback: copy link to clipboard
        Clipboard.setString(deepLink);
        Alert.alert('Link Copied', `Deep link copied to clipboard: ${deepLink}`);
      }
    } catch (error) {
      // Fallback: copy link to clipboard
      Clipboard.setString(deepLink);
      Alert.alert('Link Copied', `Deep link copied to clipboard: ${deepLink}`);
    }
  };

  const handleRotateCode = async () => {
    if (!room) return;

    setRotatingCode(true);
    const result = await rotateRoomCode(room.id);
    setRotatingCode(false);

    if (result.success) {
      setRoom(result.data);
      await loadRoomData();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleSaveName = async () => {
    if (!room || !roomName.trim()) {
      Alert.alert('Error', 'Room name cannot be empty');
      return;
    }

    if (roomName.trim() === room.name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    const result = await updateRoomName(room.id, roomName.trim());
    setSavingName(false);

    if (result.success) {
      setRoom(result.data);
      setEditingName(false);
      await loadRoomData();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleDeleteRoom = () => {
    if (!room) return;

    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete "${room.name}"? This action cannot be undone and will delete all arenas and members.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingRoom(true);
            const result = await deleteRoom(room.id);
            setDeletingRoom(false);

            if (result.success) {
              Alert.alert('Success', 'Room deleted');
              navigation.goBack();
            } else {
              Alert.alert('Error', result.error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Room not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.roomHeader}>
        {room.description && (
          <Text style={styles.roomDescription}>{room.description}</Text>
        )}
        <Text style={styles.memberCount}>{members.length} members</Text>
      </View>

      {!currentArena && (
        <TouchableOpacity
          style={[styles.createArenaButton, creatingArena && styles.buttonDisabled]}
          onPress={handleCreateArena}
          disabled={creatingArena}
        >
          {creatingArena ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createArenaButtonText}>Create Arena</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.arenaSection}>
        <Text style={styles.sectionTitle}>Current Arena</Text>
        {currentArena ? (
          <View style={styles.arenaCard}>
            <Text style={styles.arenaStatus}>
              Status: {currentArena.status.toUpperCase()}
            </Text>
            <Text style={styles.arenaInfo}>
              Mode: {currentArena.mode} | Duration: {currentArena.duration_minutes} min
            </Text>
            {currentArena.status === 'lobby' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleJoinLobby}
              >
                <Text style={styles.actionButtonText}>Join Lobby</Text>
              </TouchableOpacity>
            )}
            {currentArena.status === 'active' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleViewActiveArena}
              >
                <Text style={styles.actionButtonText}>View Arena</Text>
              </TouchableOpacity>
            )}
            {currentArena.status === 'ended' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleViewResults}
              >
                <Text style={styles.actionButtonText}>View Results</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.noArenaCard}>
            <Text style={styles.noArenaText}>No active arena</Text>
          </View>
        )}
      </View>

      {/* Members List */}
      <View style={styles.membersSection}>
        <Text style={styles.sectionTitle}>Members</Text>
        {members.length === 0 ? (
          <View style={styles.emptyMembersCard}>
            <Text style={styles.emptyMembersText}>No members yet</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const user = store.getUserById(item.user_id);
              const isCurrentUser = item.user_id === deviceId || item.user_id === currentUser?.id;
              const isOwner = item.user_id === room.owner_id;
              
              return (
                <View style={styles.memberItem}>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {user?.username || user?.display_name || `User ${item.user_id.slice(-6)}`}
                      {isCurrentUser && ' (You)'}
                    </Text>
                    <Text style={styles.memberRole}>
                      {isOwner ? 'Owner' : item.role === 'admin' ? 'Admin' : 'Member'}
                    </Text>
                  </View>
                </View>
              );
            }}
            scrollEnabled={false}
          />
        )}
      </View>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSettings(false);
          setEditingName(false);
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Room Settings</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowSettings(false);
                      setEditingName(false);
                    }}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Room Name Section */}
                {isOwner && (
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Room Name</Text>
                    {editingName ? (
                      <View>
                        <TextInput
                          style={styles.nameInput}
                          value={roomName}
                          onChangeText={setRoomName}
                          placeholder="Room name"
                          placeholderTextColor="#888888"
                          autoFocus
                          maxLength={50}
                        />
                        <View style={styles.nameEditButtons}>
                          <TouchableOpacity
                            style={[styles.nameEditButton, styles.cancelButton]}
                            onPress={() => {
                              setEditingName(false);
                              setRoomName(room?.name || '');
                            }}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.nameEditButton, styles.saveButton]}
                            onPress={handleSaveName}
                            disabled={savingName}
                          >
                            {savingName ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <Text style={styles.saveButtonText}>Save</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.nameDisplayContainer}>
                        <Text style={styles.nameDisplay}>{room?.name}</Text>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => setEditingName(true)}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

                {/* Room Code Section */}
                {room?.roomCode && (
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingsLabel}>Room Code</Text>
                    <Text style={styles.roomCodeDisplay}>{room.roomCode}</Text>
                    <View style={styles.settingsButtons}>
                      <TouchableOpacity
                        style={styles.settingsButton}
                        onPress={handleCopyCode}
                      >
                        <Text style={styles.settingsButtonText}>Copy Code</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.settingsButton}
                        onPress={handleShareLink}
                      >
                        <Text style={styles.settingsButtonText}>Share Link</Text>
                      </TouchableOpacity>
                    </View>
                    {isOwner && (
                      <TouchableOpacity
                        style={[styles.rotateButton, rotatingCode && styles.buttonDisabled]}
                        onPress={handleRotateCode}
                        disabled={rotatingCode}
                      >
                        {rotatingCode ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.rotateButtonText}>Rotate Code</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Delete Room Section */}
                {isOwner && (
                  <View style={styles.settingsSection}>
                    <TouchableOpacity
                      style={[styles.deleteButton, deletingRoom && styles.buttonDisabled]}
                      onPress={handleDeleteRoom}
                      disabled={deletingRoom}
                    >
                      {deletingRoom ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.deleteButtonText}>Delete Room</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Game Mode Selection Modal */}
      <Modal
        visible={showGameModeModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowGameModeModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.gameModeModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.gameModeModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Game Mode</Text>
                  <TouchableOpacity
                    onPress={() => setShowGameModeModal(false)}
                    style={styles.closeButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.gameModeCards}>
                  <TouchableOpacity
                    style={styles.gameModeCard}
                    onPress={() => handleSelectGameMode('predators')}
                  >
                    <Text style={styles.gameModeCardTitle}>PREDATOR</Text>
                    <Text style={styles.gameModeCardDescription}>
                      1 Prey vs 1-12 Hunters
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
  },
  roomHeader: {
    marginBottom: 8,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  roomDescription: {
    color: '#888888888',
    fontSize: 16,
    marginBottom: 8,
  },
  memberCount: {
    color: '#888888888',
    fontSize: 14,
  },
  membersSection: {
    marginTop: 20,
    marginBottom: 10,
  },
  emptyMembersCard: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyMembersText: {
    color: '#888888888',
    fontSize: 14,
  },
  memberItem: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  memberInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  memberRole: {
    color: '#888888',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  arenaSection: {
    marginTop: 0,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  arenaCard: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  arenaStatus: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  arenaInfo: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 15,
  },
  noArenaCard: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  noArenaText: {
    color: '#888888',
    fontSize: 16,
    marginBottom: 15,
  },
  createArenaButton: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  createArenaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#4A90E2',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
    textAlign: 'center',
  },
  headerButton: {
    marginRight: 15,
    padding: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  closeButton: {
    padding: 5,
  },
  settingsSection: {
    marginTop: 10,
  },
  settingsLabel: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 10,
  },
  roomCodeDisplay: {
    color: '#4A90E2',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 20,
    paddingVertical: 15,
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  settingsButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsButton: {
    flex: 1,
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rotateButton: {
    backgroundColor: '#FF9500',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  rotateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  nameDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 15,
    borderRadius: 12,
  },
  nameDisplay: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
  },
  editButton: {
    padding: 8,
    paddingHorizontal: 12,
  },
  editButtonText: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '600',
  },
  nameInput: {
    backgroundColor: '#000000',
    color: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  nameEditButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  nameEditButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#333',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  gameModeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  gameModeModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  gameModeCards: {
    gap: 15,
    marginTop: 20,
  },
  gameModeCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  gameModeCardTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  gameModeCardDescription: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
  },
});

