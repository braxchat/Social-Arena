/**
 * Social Arena - Results Screen
 * 
 * Shows arena results and allows creating a new arena.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  getArena,
  getArenaParticipants,
  createArena,
  getRoom,
} from '../core';
import { Arena, ArenaParticipant } from '../core/types';

type ResultsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type ResultsScreenRouteProp = RouteProp<RootStackParamList, 'Results'>;

interface Props {
  navigation: ResultsScreenNavigationProp;
  route: ResultsScreenRouteProp;
}

export default function ResultsScreen({ navigation, route }: Props) {
  const { arenaId } = route.params;
  const [arena, setArena] = useState<Arena | null>(null);
  const [participants, setParticipants] = useState<ArenaParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingArena, setCreatingArena] = useState(false);

  const loadArenaData = async () => {
    setLoading(true);

    // Load arena
    const arenaResult = getArena(arenaId);
    if (arenaResult.success) {
      setArena(arenaResult.data);
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

  const handlePlayAgain = async () => {
    if (!arena) return;

    setCreatingArena(true);
    const result = await createArena(arena.room_id, 'predators', 12);
    setCreatingArena(false);

    if (result.success) {
      navigation.replace('Lobby', { arenaId: result.data.id });
    }
  };

  const handleBackToRoom = () => {
    if (!arena) return;
    navigation.navigate('Room', { roomId: arena.room_id });
  };

  const getParticipantStatusDisplay = (participant: ArenaParticipant): string => {
    if (participant.status === 'captured') return 'Captured';
    if (participant.status === 'escaped') return 'Escaped';
    if (participant.status === 'left') return 'Left';
    return 'Participated';
  };

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

  const winnerText =
    arena.winner_team === 'hunters'
      ? 'Hunters Win!'
      : arena.winner_team === 'prey'
      ? 'Prey Escaped!'
      : 'Arena Ended';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.winnerText}>{winnerText}</Text>
        {arena.ended_reason && (
          <Text style={styles.reasonText}>
            Reason: {arena.ended_reason.replace('_', ' ')}
          </Text>
        )}
      </View>

      <View style={styles.participantsSection}>
        <Text style={styles.sectionTitle}>Participants</Text>
        <FlatList
          data={participants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.participantItem}>
              <Text style={styles.participantName}>
                User {item.user_id.slice(-6)} - {item.role}
              </Text>
              <Text style={styles.participantStatus}>
                {getParticipantStatusDisplay(item)}
              </Text>
              {item.is_captured && item.captured_by_user_id && (
                <Text style={styles.capturedBy}>
                  Captured by User {item.captured_by_user_id.slice(-6)}
                </Text>
              )}
            </View>
          )}
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.playAgainButton, creatingArena && styles.buttonDisabled]}
          onPress={handlePlayAgain}
          disabled={creatingArena}
        >
          {creatingArena ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.playAgainButtonText}>Play Again</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToRoom}>
          <Text style={styles.backButtonText}>Back to Room</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  winnerText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 10,
  },
  reasonText: {
    color: '#888888',
    fontSize: 14,
  },
  participantsSection: {
    flex: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
  },
  participantItem: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  participantName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  participantStatus: {
    color: '#888888',
    fontSize: 14,
  },
  capturedBy: {
    color: '#ff3b30',
    fontSize: 12,
    marginTop: 5,
  },
  actions: {
    gap: 10,
  },
  playAgainButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  playAgainButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  backButtonText: {
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

