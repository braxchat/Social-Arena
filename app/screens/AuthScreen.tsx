/**
 * Social Arena - Authentication Screen
 * 
 * Handles user signup and login.
 */

import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { signup, login, getCurrentUser } from '../core';

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

interface Props {
  navigation: AuthScreenNavigationProp;
}

export default function AuthScreen({ navigation }: Props) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }

    if (isSignup && !username) {
      Alert.alert('Error', 'Username is required');
      return;
    }

    setLoading(true);

    try {
      let result;
      if (isSignup) {
        result = signup(email, password, username);
      } else {
        result = login(email, password);
      }

      if (result.success) {
        // Navigate to Rooms
        navigation.replace('Rooms');
      } else {
        Alert.alert('Error', result.error.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Check if already authenticated
  React.useEffect(() => {
    if (getCurrentUser()) {
      navigation.replace('Rooms');
    }
  }, []);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <Text style={styles.title}>SOCIAL ARENA</Text>
        <Text style={styles.subtitle}>
          {isSignup ? 'Create Account' : 'Welcome back'}
        </Text>

        <View style={styles.form}>
        {isSignup && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.usernameInputContainer}>
              <Text style={styles.usernamePrefix}>@</Text>
              <TextInput
                style={styles.usernameInput}
                placeholder="Enter your username"
                placeholderTextColor="#888888"
                value={username}
                onChangeText={(text) => {
                  // Replace spaces with underscores
                  let filtered = text.replace(/\s/g, '_');
                  // Only allow lowercase letters and numbers
                  filtered = filtered.replace(/[^a-z0-9_]/g, '');
                  setUsername(filtered);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#888888"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <View style={styles.passwordLabelRow}>
            <Text style={styles.label}>Password</Text>
            {!isSignup && (
              <TouchableOpacity>
                <Text style={styles.forgotPassword}>Forgot Password?</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#888888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? 'eye-off' : 'eye'} 
                size={20} 
                color="#FFFFFF" 
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.buttonGradient}>
              <Text style={styles.buttonText}>
                {isSignup ? 'Sign Up' : 'Log In'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {!isSignup && (
          <View style={styles.legalText}>
            <Text style={styles.legalTextGrey}>By continuing, you agree to the </Text>
            <TouchableOpacity>
              <Text style={styles.legalLink}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.legalTextGrey}> and </Text>
            <TouchableOpacity>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalTextGrey}>.</Text>
          </View>
        )}

        <View style={styles.toggleContainer}>
          <Text style={styles.toggleTextGrey}>
            {isSignup ? "Already have an account? " : "Don't have an account? "}
          </Text>
          <TouchableOpacity onPress={() => setIsSignup(!isSignup)}>
            <Text style={styles.toggleText}>
              {isSignup ? 'Log In' : 'Sign Up'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 20,
    paddingTop: 80,
    justifyContent: 'flex-start',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    color: '#888888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
  },
  usernameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingLeft: 15,
  },
  usernamePrefix: {
    color: '#888888',
    fontSize: 16,
    marginRight: 0,
  },
  usernameInput: {
    flex: 1,
    color: '#FFFFFF',
    padding: 15,
    paddingLeft: 5,
    fontSize: 16,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotPassword: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '500',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingRight: 15,
  },
  passwordInput: {
    flex: 1,
    color: '#FFFFFF',
    padding: 15,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 5,
  },
  button: {
    borderRadius: 12,
    marginTop: 10,
    overflow: 'hidden',
  },
  buttonGradient: {
    backgroundColor: '#4A90E2',
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  legalText: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalTextGrey: {
    color: '#888888',
    fontSize: 12,
  },
  legalLink: {
    color: '#4A90E2',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginTop: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleTextGrey: {
    color: '#888888',
    fontSize: 14,
  },
  toggleText: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '500',
  },
});

