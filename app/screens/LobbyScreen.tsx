/**
 * Social Arena - Lobby Screen
 * 
 * Shows arena lobby with participants, role assignment, and start controls.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import MapView, { Region, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getArena,
  getArenaParticipants,
  joinArena,
  leaveArena,
  assignRole,
  startArena,
  getCurrentUser,
  cancelArena,
  store,
} from '../core';
import { Arena, ArenaParticipant, ParticipantRole } from '../core/types';
import { getDeviceId } from '../lib/deviceId';

type LobbyScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Lobby'>;
type LobbyScreenRouteProp = RouteProp<RootStackParamList, 'Lobby'>;

interface Props {
  navigation: LobbyScreenNavigationProp;
  route: LobbyScreenRouteProp;
}

export default function LobbyScreen({ navigation, route }: Props) {
  const { arenaId } = route.params;
  const [arena, setArena] = useState<Arena | null>(null);
  const [participants, setParticipants] = useState<ArenaParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deletingLobby, setDeletingLobby] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [showUserInfoOverlay, setShowUserInfoOverlay] = useState(false);
  const [userDotPosition, setUserDotPosition] = useState<{ x: number; y: number } | null>(null);
  const mapRef = useRef<MapView>(null);

  const currentUser = getCurrentUser();

  // Get device ID on mount
  useEffect(() => {
    getDeviceId().then(id => setDeviceId(id));
  }, []);

  // Request location and update map
  useEffect(() => {
    const requestLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation(location);
          setMapRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      } catch (error) {
        console.error('Error getting location:', error);
      }
    };
    requestLocation();
  }, []);

  const handleRecenterMap = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation(location);
        const newRegion: Region = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setMapRegion(newRegion);
        
        // Animate to the new region
        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
      } else {
        Alert.alert('Permission Required', 'Location permission is needed to recenter the map');
      }
    } catch (error) {
      console.error('Error recentering map:', error);
      Alert.alert('Error', 'Failed to get current location');
    }
  };

  const handleMapPress = (event: any) => {
    if (!userLocation || !currentParticipant) {
      setShowUserInfoOverlay(false);
      return;
    }
    
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const userLat = userLocation.coords.latitude;
    const userLon = userLocation.coords.longitude;
    
    // Calculate distance in meters (rough approximation)
    const latDiff = Math.abs(latitude - userLat);
    const lonDiff = Math.abs(longitude - userLon);
    const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Rough conversion to meters
    
    // If tap is within ~50 meters of user location, show info overlay at dot position
    if (distance < 50) {
      // Calculate screen position based on map region and user's coordinates
      const { width } = Dimensions.get('window');
      const mapHeight = 350; // Height of map container
      const latDelta = mapRegion.latitudeDelta;
      const lonDelta = mapRegion.longitudeDelta;
      
      // Calculate relative position within the map region
      const lonRatio = (userLon - mapRegion.longitude) / lonDelta;
      const latRatio = (userLat - mapRegion.latitude) / latDelta;
      
      // Convert to screen coordinates (accounting for map container padding)
      const x = (width - 40) / 2 + lonRatio * (width - 40); // Account for container padding
      const y = mapHeight / 2 - latRatio * mapHeight;
      
      setUserDotPosition({ x, y });
      setShowUserInfoOverlay(true);
    } else {
      setShowUserInfoOverlay(false);
    }
  };

  const loadArenaData = async () => {
    setLoading(true);

    // Load arena
    const arenaResult = getArena(arenaId);
    if (arenaResult.success) {
      setArena(arenaResult.data);

      // If arena is not in lobby, navigate away
      if (arenaResult.data.status === 'active') {
        navigation.replace('ActiveArena', { arenaId });
        return;
      } else if (arenaResult.data.status === 'ended') {
        navigation.replace('Results', { arenaId });
        return;
      }
    } else {
      Alert.alert('Error', arenaResult.error.message);
      navigation.goBack();
      return;
    }

    // Load participants
    const participantsResult = getArenaParticipants(arenaId);
    if (participantsResult.success) {
      setParticipants(participantsResult.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadArenaData();
  }, [arenaId]);

  // Refresh on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadArenaData();
    });
    return unsubscribe;
  }, [navigation]);

  // Leave arena when backing out of lobby (but not if user is host)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', async () => {
      // Check if user is a participant before leaving
      const currentUserId = deviceId || currentUser?.id;
      if (currentUserId && arena) {
        // Don't remove host - they can back out and still remain host
        const isHost = arena.host_id === currentUserId;
        if (isHost) {
          return; // Host can back out without being removed
        }
        
        const participant = participants.find(
          (p) => 
            (p.user_id === deviceId || p.user_id === currentUser?.id) && 
            p.status === 'joined'
        );
        if (participant) {
          // Leave the arena silently (don't show alert)
          await leaveArena(arenaId);
        }
      }
    });
    return unsubscribe;
  }, [navigation, deviceId, currentUser, arena, participants, arenaId]);

  const getCurrentParticipant = () => {
    if (!deviceId && !currentUser) return null;
    return participants.find(
      (p) => 
        (p.user_id === deviceId || p.user_id === currentUser?.id) && 
        p.status === 'joined'
    );
  };

  const currentParticipant = getCurrentParticipant();
  const joinedParticipants = participants.filter((p) => p.status === 'joined');
  const prey = joinedParticipants.filter((p) => p.role === 'prey');
  const hunters = joinedParticipants.filter((p) => p.role === 'hunter');
  const isHost = arena?.host_id === deviceId || arena?.host_id === currentUser?.id;

  // Get participants with location data for map markers
  const participantsWithLocations = joinedParticipants.filter(
    (p) =>
      p.last_latitude !== undefined &&
      p.last_longitude !== undefined &&
      p.last_latitude !== null &&
      p.last_longitude !== null
  );

  // Get marker color based on role
  const getMarkerColor = (role: string, isCurrentUser: boolean) => {
    if (isCurrentUser) {
      return role === 'prey' ? '#ff3b30' : role === 'hunter' ? '#34C759' : '#4A90E2';
    }
    return role === 'prey' ? '#ff6b6b' : role === 'hunter' ? '#51cf66' : '#74c0fc';
  };

  // Set header right button (settings icon for host only)
  useEffect(() => {
    if (isHost && arena) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            style={styles.headerButton}
          >
            <Ionicons name="settings" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: undefined,
      });
    }
  }, [navigation, arena, isHost]);

  const handleJoinAs = async (role: ParticipantRole) => {
    setJoining(true);
    const result = await joinArena(arenaId, role);
    setJoining(false);

    if (result.success) {
      loadArenaData();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleAssignRole = async (userId: string, role: ParticipantRole) => {
    const result = await assignRole(arenaId, userId, role);
    if (result.success) {
      loadArenaData();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleStartArena = async () => {
    setStarting(true);
    const result = await startArena(arenaId);
    setStarting(false);

    if (result.success) {
      // Navigate to active arena
      navigation.replace('ActiveArena', { arenaId });
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const handleLeave = async () => {
    Alert.alert('Leave Lobby?', 'You can rejoin if the arena is still in lobby.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const result = await leaveArena(arenaId);
          if (result.success) {
            navigation.goBack();
          } else {
            Alert.alert('Error', result.error.message);
          }
        },
      },
    ]);
  };

  const handleDeleteLobby = async () => {
    setDeletingLobby(true);
    const result = await cancelArena(arenaId);
    setDeletingLobby(false);

    if (result.success) {
      navigation.goBack();
    } else {
      Alert.alert('Error', result.error.message);
    }
  };

  const canStart =
    prey.length === 1 && hunters.length >= 1 && hunters.length <= 12;

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  if (!arena) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Arena not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.participantsSection}>
        <Text style={styles.sectionTitle}>Participants Lobby</Text>
        <Text style={styles.roleSummary}>
          Prey: {prey.length}/1 | Hunters: {hunters.length}/1-12
        </Text>

        {!currentParticipant && (
          <View style={styles.joinButtons}>
            <TouchableOpacity
              style={[styles.joinButton, joining && styles.buttonDisabled]}
              onPress={() => handleJoinAs('hunter')}
              disabled={joining}
            >
              <Text style={styles.joinButtonText}>Join as Hunter</Text>
            </TouchableOpacity>
            {prey.length === 0 && (
              <TouchableOpacity
                style={[styles.joinButton, joining && styles.buttonDisabled]}
                onPress={() => handleJoinAs('prey')}
                disabled={joining}
              >
                <Text style={styles.joinButtonText}>Join as Prey</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            region={mapRegion}
            showsUserLocation={true}
            showsMyLocationButton={true}
            mapType="standard"
            onPress={handleMapPress}
          >
            {participantsWithLocations.map((participant) => {
              const isCurrentUser = participant.user_id === deviceId || participant.user_id === currentUser?.id;
              
              // Skip marker for current user - we'll add a tappable marker separately
              if (isCurrentUser) {
                return null;
              }
              
              // Get display name for participant
              let displayName = `User ${participant.user_id.slice(-6)}`;
              const user = store.getUserById(participant.user_id);
              if (user) {
                displayName = user.username || user.display_name || displayName;
              }
              
              const markerColor = getMarkerColor(participant.role, false);
              const roleTitle = participant.role === 'prey' ? 'Prey' : participant.role === 'hunter' ? 'Hunter' : 'Spectator';

              return (
                <Marker
                  key={participant.id}
                  coordinate={{
                    latitude: participant.last_latitude!,
                    longitude: participant.last_longitude!,
                  }}
                  title={roleTitle}
                  description={displayName}
                  pinColor={markerColor}
                />
              );
            })}
            
          </MapView>
          
          {/* Small overlay attached to user's dot */}
          {showUserInfoOverlay && userLocation && currentParticipant && userDotPosition && (
            <View 
              style={[
                styles.userInfoOverlay,
                {
                  left: userDotPosition.x - 60,
                  top: userDotPosition.y - 50,
                }
              ]}
            >
              <View style={styles.userInfoBubble}>
                <Text style={styles.userInfoRole}>
                  {currentParticipant.role === 'prey' ? 'Prey' : currentParticipant.role === 'hunter' ? 'Hunter' : 'Spectator'}
                </Text>
                <Text style={styles.userInfoName}>
                  {currentUser?.username || currentUser?.display_name || 'You'}
                </Text>
              </View>
              <View style={styles.userInfoArrow} />
            </View>
          )}
          
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={handleRecenterMap}
          >
            <Ionicons name="locate" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={joinedParticipants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isCurrentUser = item.user_id === deviceId || item.user_id === currentUser?.id;
            
            // For current user, always show their username from auth
            let displayName = `User ${item.user_id.slice(-6)}`;
            if (isCurrentUser && currentUser) {
              displayName = currentUser.username || currentUser.display_name || displayName;
            } else {
              // For other participants, try to get from store
              // Note: Since participants use deviceId as user_id, we can't easily match to auth users
              // This is a limitation of the temporary deviceId-based auth system
              const user = store.getUserById(item.user_id);
              if (user) {
                displayName = user.username || user.display_name || displayName;
              }
            }
            
            return (
              <View style={styles.participantItem}>
                <View style={styles.participantHeader}>
                  <View style={styles.participantNameContainer}>
                    <Text style={styles.participantName}>
                      {displayName}
                    </Text>
                    {isCurrentUser && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>You</Text>
                      </View>
                    )}
                    {item.user_id === arena.host_id && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>Host</Text>
                      </View>
                    )}
                  </View>
                  {isCurrentUser && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={async () => {
                        const result = await leaveArena(arenaId);
                        if (result.success) {
                          await loadArenaData();
                        } else {
                          Alert.alert('Error', result.error.message);
                        }
                      }}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.participantRole}>
                  <Text style={styles.roleText}>Role: {item.role}</Text>
                  {isHost && !isCurrentUser && (
                    <View style={styles.roleButtons}>
                      <TouchableOpacity
                        style={styles.roleButton}
                        onPress={() => handleAssignRole(item.user_id, 'prey')}
                      >
                        <Text style={styles.roleButtonText}>Prey</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.roleButton}
                        onPress={() => handleAssignRole(item.user_id, 'hunter')}
                      >
                        <Text style={styles.roleButtonText}>Hunter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.roleButton}
                        onPress={() => handleAssignRole(item.user_id, 'spectator')}
                      >
                        <Text style={styles.roleButtonText}>Spectator</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>

      {isHost && (
        <View style={styles.hostControls}>
          <TouchableOpacity
            style={[
              styles.startButton,
              (!canStart || starting) && styles.buttonDisabled,
            ]}
            onPress={handleStartArena}
            disabled={!canStart || starting}
          >
            {starting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.startButtonText}>Start Arena</Text>
            )}
          </TouchableOpacity>
          {!canStart && (
            <Text style={styles.validationText}>
              Need 1 prey and 1-12 hunters to start
            </Text>
          )}
        </View>
      )}


      {/* Settings Modal */}
      {isHost && (
        <Modal
          visible={showSettings}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSettings(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Lobby Settings</Text>
                    <TouchableOpacity
                      onPress={() => setShowSettings(false)}
                      style={styles.closeButton}
                    >
                      <Ionicons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.settingsSection}>
                    <TouchableOpacity
                      style={[styles.deleteButton, deletingLobby && styles.buttonDisabled]}
                      onPress={() => {
                        Alert.alert(
                          'Delete Lobby?',
                          'This will cancel the lobby and remove all participants. This action cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: handleDeleteLobby,
                            },
                          ]
                        );
                      }}
                      disabled={deletingLobby}
                    >
                      {deletingLobby ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.deleteButtonText}>Delete Lobby</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
  },
  arenaInfo: {
    marginBottom: 20,
  },
  gameModeTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  participantsSection: {
    flex: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
  },
  roleSummary: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 15,
  },
  joinButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  joinButton: {
    backgroundColor: '#4A90E2',
    padding: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  mapContainer: {
    height: 350,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  userInfoOverlay: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 1000,
  },
  userInfoBubble: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A90E2',
    minWidth: 120,
    alignItems: 'center',
  },
  userInfoRole: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  userInfoName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  userInfoArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#4A90E2',
    marginTop: -1,
  },
  recenterButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#4A90E2',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  participantItem: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  participantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  participantNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  participantName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  youBadge: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  hostBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hostBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  participantRole: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleText: {
    color: '#888888',
    fontSize: 14,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 5,
  },
  roleButton: {
    backgroundColor: '#333',
    padding: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  roleButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  hostControls: {
    marginTop: 20,
    marginBottom: 10,
  },
  startButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  validationText: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  headerButton: {
    marginRight: 10,
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
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leaveButton: {
    backgroundColor: '#ff3b30',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 16,
    textAlign: 'center',
  },
});

