/**
 * Social Arena - Join Room Screen
 * 
 * Allows users to join a room by entering a room code.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { joinRoomByCode, getRoomByCode } from '../core';

type JoinArenaScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'JoinArena'>;
type JoinArenaScreenRouteProp = RouteProp<RootStackParamList, 'JoinArena'>;

interface Props {
  navigation: JoinArenaScreenNavigationProp;
  route: JoinArenaScreenRouteProp;
}

export default function JoinArenaScreen({ navigation, route }: Props) {
  const { roomCode: initialCode } = route.params || {};
  const [roomCode, setRoomCode] = useState(initialCode || '');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    // If code was provided via deep link, normalize it
    if (initialCode) {
      setRoomCode(initialCode.trim().toUpperCase());
    }
  }, [initialCode]);

  const handleJoin = async () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    
    if (!normalizedCode) {
      Alert.alert('Error', 'Please enter a room code');
      return;
    }

    setJoining(true);
    const joinResult = await joinRoomByCode(normalizedCode);
    setJoining(false);

    if (joinResult.success) {
      // Navigate to the room
      navigation.replace('Room', { roomId: joinResult.data.id });
    } else {
      // Provide more specific error messages
      let errorMessage = joinResult.error.message;
      if (joinResult.error.code === 'ROOM_CODE_NOT_FOUND') {
        errorMessage = `Room code "${normalizedCode}" not found. Please check the code and try again.`;
      } else if (joinResult.error.code === 'ROOM_FULL') {
        errorMessage = 'This room is full and cannot accept more members.';
      }
      Alert.alert('Error', errorMessage);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <Text style={styles.title}>Enter Room Code</Text>
      <Text style={styles.subtitle}>
        Enter the 5-6 character code to join a room
      </Text>

      <TextInput
        style={styles.input}
        placeholder="H4K9Q"
        placeholderTextColor="#888888"
        value={roomCode}
        onChangeText={(text) => setRoomCode(text.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        editable={!joining}
      />

      <TouchableOpacity
        style={[styles.joinButton, (joining || !roomCode.trim()) && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={joining || !roomCode.trim()}
      >
        {joining ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.joinButtonText}>Join Room</Text>
        )}
      </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888888',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  joinButton: {
    backgroundColor: '#34C759',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

