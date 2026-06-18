import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView, Pressable, Animated, Easing
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import api from '../src/api'

const C = {
  bg: '#0a0613', card: '#13102a', border: '#2e2360', borderSoft: '#241c4a',
  accent: '#22d3ee', accentDark: '#0bb6d6', neon2: '#f637ec',
  text: '#eafcff', muted: '#8f88c2', danger: '#ff4d8d',
}

function Punto({ x, delay }: { x: string; delay: number }) {
  const y = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -18, duration: 2600, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return <Animated.View style={[s.dot, { left: x as any, transform: [{ translateY: y }] }]} />
}

export default function LoginScreen() {
  const [usuario, setUsuario]   = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(true)
  const [verPass, setVerPass]   = useState(false)
  const router = useRouter()

  const entrada = useRef(new Animated.Value(0)).current   // 0 -> 1 entrada
  const shake   = useRef(new Animated.Value(0)).current
  const pulso   = useRef(new Animated.Value(1)).current

  useEffect(() => {
    AsyncStorage.getItem('token').then(token => {
      if (token) router.replace('/home')
      else setChecking(false)
    })
  }, [])

  useEffect(() => {
    if (checking) return
    Animated.timing(entrada, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1.12, duration: 1300, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 1, duration: 1300, useNativeDriver: true }),
      ])
    ).start()
  }, [checking])

  function vibrar() {
    Animated.sequence([
      Animated.timing(shake, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start()
  }

  function fallar(msg: string) { setError(msg); vibrar() }

  if (checking) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>
  }

  async function handleLogin() {
    if (!usuario || !password) { fallar('Completa todos los campos'); return }
    setLoading(true); setError('')
    try {
      const res = await api.post('/auth/login', { usuario, password })
      if (res.data.rol !== 'operador') { fallar('Solo operadores pueden usar esta app'); setLoading(false); return }
      await AsyncStorage.setItem('token',   res.data.token)
      await AsyncStorage.setItem('nombre',  res.data.nombre)
      await AsyncStorage.setItem('user_id', String(res.data.id))
      router.replace('/home')
    } catch (e: any) {
      fallar('Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    opacity: entrada,
    transform: [
      { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
      { translateX: shake },
    ],
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* puntos flotantes de fondo */}
      <Punto x="12%" delay={0} /><Punto x="80%" delay={400} />
      <Punto x="30%" delay={900} /><Punto x="65%" delay={1300} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
        <Animated.View style={[s.card, cardStyle, error ? { borderColor: C.danger } : null]}>
          {/* candado con glow */}
          <View style={s.lockWrap}>
            <View style={s.lockGlow} />
            <Animated.View style={[s.lockCircle, { transform: [{ scale: pulso }] }]}>
              <Text style={{ fontSize: 30 }}>🔒</Text>
            </Animated.View>
          </View>

          <Text style={s.title}>Candado Inteligente</Text>
          <Text style={s.subtitle}>Acceso para operadores</Text>

          <TextInput
            style={[s.input, error ? { borderColor: C.danger } : null]}
            placeholder="Usuario" placeholderTextColor={C.muted}
            value={usuario} onChangeText={t => { setUsuario(t); setError('') }}
            autoCapitalize="none" autoCorrect={false}
          />
          <View style={s.passRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }, error ? { borderColor: C.danger } : null]}
              placeholder="Contraseña" placeholderTextColor={C.muted}
              value={password} onChangeText={t => { setPassword(t); setError('') }}
              secureTextEntry={!verPass} autoCapitalize="none" autoCorrect={false}
            />
            <Pressable onPress={() => setVerPass(v => !v)} style={s.eyeBtn}>
              <Text style={s.eyeTxt}>{verPass ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#04121a" /> : <Text style={s.btnText}>Ingresar</Text>}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  dot:       { position: 'absolute', top: '40%', width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, opacity: 0.5 },

  card:      { backgroundColor: C.card, borderRadius: 22, padding: 28, borderWidth: 1, borderColor: C.border,
               shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 8 },

  lockWrap:  { alignItems: 'center', justifyContent: 'center', marginBottom: 14, height: 76 },
  lockGlow:  { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: C.accent, opacity: 0.18 },
  lockCircle:{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#0e2a3d', borderWidth: 1, borderColor: C.accent,
               alignItems: 'center', justifyContent: 'center' },

  title:     { color: C.text, fontSize: 22, fontWeight: 'bold', textAlign: 'center', letterSpacing: 0.5 },
  subtitle:  { color: C.muted, fontSize: 14, textAlign: 'center', marginBottom: 24 },
  input:     { backgroundColor: '#0e0a20', borderWidth: 1, borderColor: C.borderSoft, borderRadius: 12, color: C.text,
               paddingHorizontal: 16, paddingVertical: 13, marginBottom: 12, fontSize: 16 },
  passRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  eyeBtn:    { backgroundColor: '#0e0a20', borderWidth: 1, borderColor: C.borderSoft, borderRadius: 12, padding: 13 },
  eyeTxt:    { fontSize: 18 },
  error:     { color: C.danger, fontSize: 13, marginBottom: 10, textAlign: 'center', fontWeight: '600' },
  btn:       { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4,
               shadowColor: C.accent, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  btnText:   { color: '#04121a', fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },
})
