import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, Pressable
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import api from '../src/api'

export default function LoginScreen() {
  const [usuario,   setUsuario]   = useState('')
  const [password,  setPassword]  = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [checking,  setChecking]  = useState(true)
  const [verPass,   setVerPass]   = useState(false)
  const router = useRouter()

  useEffect(() => {
    AsyncStorage.getItem('token').then(token => {
      if (token) router.replace('/home')
      else setChecking(false)
    })
  }, [])

  if (checking) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  async function handleLogin() {
    if (!usuario || !password) { setError('Completa todos los campos'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', { usuario, password })
      if (res.data.rol !== 'operador') {
        setError('Solo operadores pueden usar esta app')
        setLoading(false)
        return
      }
      await AsyncStorage.setItem('token',   res.data.token)
      await AsyncStorage.setItem('nombre',  res.data.nombre)
      await AsyncStorage.setItem('user_id', String(res.data.id))
      router.replace('/home')
    } catch (e: any) {
      setError(e?.message || JSON.stringify(e) || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
        <View style={s.card}>
          <Text style={s.emoji}>🔒</Text>
          <Text style={s.title}>Candado Inteligente</Text>
          <Text style={s.subtitle}>Acceso para operadores</Text>

          <TextInput
            style={s.input}
            placeholder="Usuario"
            placeholderTextColor="#6b7280"
            value={usuario}
            onChangeText={setUsuario}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={s.passRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Contraseña"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!verPass}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={() => setVerPass(v => !v)} style={s.eyeBtn}>
              <Text style={s.eyeTxt}>{verPass ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Ingresar</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#030712' },
  center:    { flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card:      { backgroundColor: '#111827', borderRadius: 16, padding: 28, borderWidth: 1, borderColor: '#1f2937' },
  emoji:     { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  title:     { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  subtitle:  { color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  input:     { backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151', borderRadius: 10, color: '#fff', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, fontSize: 16 },
  passRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  eyeBtn:    { backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151', borderRadius: 10, padding: 12 },
  eyeTxt:    { fontSize: 18 },
  error:     { color: '#f87171', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  btn:       { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
})
