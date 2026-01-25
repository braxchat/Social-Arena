/**
 * Social Arena - Lobby Screen
 * 
 * Shows arena lobby with participants, role assignment, and start controls.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
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
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const currentUser = getCurrentUser();

  // Get device ID on mount
  useEffect(() => {
    getDeviceId().then(id => setDeviceId(id));
  }, []);

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

  const getCurrentParticipant = () => {
    if (!deviceId && !currentUser) return null;
    return participants.find(
      (p) => 
        (p.user_id === deviceId || p.user_id === currentUser?.id) && 
        p.status === 'joined'
    );
  };

  const isHost = arena?.host_id === deviceId || arena?.host_id === currentUser?.id;
  const currentParticipant = getCurrentParticipant();
  const joinedParticipants = participants.filter((p) => p.status === 'joined');
  const prey = joinedParticipants.filter((p) => p.role === 'prey');
  const hunters = joinedParticipants.filter((p) => p.role === 'hunter');

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

        <FlatList
          data={joinedParticipants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isCurrentUser = item.user_id === deviceId || item.user_id === currentUser?.id;
            return (
              <View style={styles.participantItem}>
                <View style={styles.participantHeader}>
                  <Text style={styles.participantName}>
                    User {item.user_id.slice(-6)}
                    {isCurrentUser && ' (You)'}
                    {item.user_id === arena.host_id && ' (Host)'}
                  </Text>
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

      {currentParticipant && (
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
          <Text style={styles.leaveButtonText}>Leave Lobby</Text>
        </TouchableOpacity>
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
  participantName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
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

