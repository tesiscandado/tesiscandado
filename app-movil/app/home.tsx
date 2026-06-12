import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Animated, SafeAreaView
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager'
import api from '../src/api'

export default function HomeScreen() {
  const [nombre,      setNombre]      = useState('')
  const [tokens,      setTokens]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [emulando,    setEmulando]    = useState(false)
  const [tokenActivo, setTokenActivo] = useState(null)
  const pulso  = useRef(new Animated.Value(1)).current
  const router = useRouter()

  useEffect(() => {
    cargarDatos()
    NfcManager.start().catch(() => {})
    return () => { NfcManager.cancelTechnologyRequest().catch(() => {}) }
  }, [])

  useEffect(() => {
    if (emulando) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulso, { toValue: 1.2, duration: 700, useNativeDriver: true }),
          Animated.timing(pulso, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      ).start()
    } else {
      pulso.stopAnimation()
      Animated.timing(pulso, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    }
  }, [emulando])

  async function cargarDatos() {
    setLoading(true)
    try {
      const id     = await AsyncStorage.getItem('user_id')
      const nombre = await AsyncStorage.getItem('nombre')
      setNombre(nombre || '')
      const res = await api.get(`/autorizacion/tokens/operador/${id}`)
      setTokens(res.data)
      const activo = res.data.find((t: any) => t.estado === 'activo')
        || res.data.find((t: any) => t.estado === 'pendiente')
        || res.data[0] || null
      setTokenActivo(activo)
    } catch {
      Alert.alert('Error', 'No se pudo cargar el token. Verifica tu conexión.')
    } finally {
      setLoading(false)
    }
  }

  async function grabarToken() {
    if (!tokenActivo) {
      Alert.alert('Sin token', 'No tienes un token asignado.\nPide al administrador que te genere uno.')
      return
    }
    try {
      const soporta = await NfcManager.isSupported()
      if (!soporta) {
        Alert.alert('NFC no disponible', 'Este dispositivo no tiene NFC')
        return
      }
      const activado = await NfcManager.isEnabled()
      if (!activado) {
        Alert.alert('NFC apagado', 'Activa el NFC:\nConfiguración → Conexiones → NFC')
        return
      }
      setEmulando(true)
      await NfcManager.requestTechnology(NfcTech.Ndef)
      const bytes = Ndef.encodeMessage([Ndef.textRecord((tokenActivo as any).token)])
      await NfcManager.ndefHandler.writeNdefMessage(bytes)

      // Marcar el token como activo en el backend tras grabarlo
      try {
        await api.patch(`/autorizacion/tokens/${(tokenActivo as any).id}/estado?estado=activo`)
      } catch {}

      Alert.alert('✅ Tarjeta grabada', `El token quedó guardado en la tarjeta.\nYa puedes usarla en el lector.`)
      cargarDatos()
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) return
      Alert.alert('Error NFC', 'No se pudo grabar la tarjeta. Acerca un tag NFC en blanco e intenta de nuevo.')
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {})
      setEmulando(false)
    }
  }

  async function cerrarSesion() {
    await AsyncStorage.clear()
    router.replace('/')
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={s.loadingTxt}>Cargando token...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.hola}>Hola,</Text>
            <Text style={s.nombre}>{nombre}</Text>
          </View>
          <TouchableOpacity onPress={cerrarSesion} style={s.salirBtn}>
            <Text style={s.salirTxt}>Salir</Text>
          </TouchableOpacity>
        </View>

        {/* Card token */}
        {tokenActivo ? (
          <View style={s.tokenCard}>
            <Text style={s.tokenLabel}>TU TOKEN</Text>
            <Text style={s.tokenCandado}>🔒 {(tokenActivo as any).candados?.descripcion || 'Candado'}</Text>
            <Text style={s.tokenValor}>{(tokenActivo as any).token}</Text>
            <Text style={s.tokenSub}>Acerca una tarjeta NFC en blanco para grabar el token. Luego usa esa tarjeta en el lector.</Text>

            {!emulando ? (
              <TouchableOpacity style={s.nfcBtn} onPress={grabarToken}>
                <Text style={s.nfcBtnTxt}>📝  Grabar en tarjeta</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.emulandoBox}>
                <Animated.View style={[s.onda, { transform: [{ scale: pulso }] }]}>
                  <Text style={{ fontSize: 38 }}>📝</Text>
                </Animated.View>
                <Text style={s.emulandoTxt}>Acerca la tarjeta en blanco...</Text>
                <TouchableOpacity style={s.cancelBtn} onPress={() => {
                  NfcManager.cancelTechnologyRequest().catch(() => {})
                  setEmulando(false)
                }}>
                  <Text style={s.cancelTxt}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={s.sinToken}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
            <Text style={s.sinTokenTxt}>Sin token asignado</Text>
            <Text style={s.sinTokenSub}>Pide al administrador que te genere un token desde el panel web</Text>
            <TouchableOpacity style={s.refreshBtn} onPress={cargarDatos}>
              <Text style={s.refreshTxt}>🔄  Actualizar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lista otros tokens */}
        {tokens.length > 1 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.seccionTxt}>TODOS TUS TOKENS</Text>
            {(tokens as any[]).map((t, i) => (
              <TouchableOpacity key={i}
                style={[s.tokenItem, (tokenActivo as any)?.token === t.token && s.tokenItemSel]}
                onPress={() => setTokenActivo(t)}>
                <View>
                  <Text style={s.tiNombre}>{t.candados?.descripcion || 'Candado'}</Text>
                  <Text style={s.tiVal}>{t.token}</Text>
                </View>
                <Text style={[s.badge, t.estado === 'activo' ? s.badgeActivo : s.badgePend]}>
                  {t.estado}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#030712' },
  center:       { flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' },
  loadingTxt:   { color: '#6b7280', marginTop: 12 },
  content:      { padding: 20, paddingBottom: 40 },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  hola:         { color: '#6b7280', fontSize: 13 },
  nombre:       { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  salirBtn:     { backgroundColor: '#1f2937', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  salirTxt:     { color: '#f87171', fontWeight: '600' },

  tokenCard:    { backgroundColor: '#111827', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1d4ed8', marginBottom: 20 },
  tokenLabel:   { color: '#6b7280', fontSize: 11, letterSpacing: 1.5, marginBottom: 8 },
  tokenCandado: { color: '#93c5fd', fontSize: 15, marginBottom: 14 },
  tokenValor:   { color: '#34d399', fontSize: 30, fontWeight: 'bold', fontFamily: 'monospace', textAlign: 'center', marginBottom: 6 },
  tokenSub:     { color: '#6b7280', fontSize: 12, textAlign: 'center', marginBottom: 22 },

  nfcBtn:       { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  nfcBtnTxt:    { color: '#fff', fontWeight: 'bold', fontSize: 18 },

  emulandoBox:  { alignItems: 'center', paddingVertical: 8 },
  onda:         { backgroundColor: '#1d4ed8', width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emulandoTxt:  { color: '#93c5fd', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  cancelBtn:    { borderWidth: 1, borderColor: '#374151', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  cancelTxt:    { color: '#9ca3af' },

  sinToken:     { backgroundColor: '#111827', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937', marginBottom: 20 },
  sinTokenTxt:  { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  sinTokenSub:  { color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  refreshBtn:   { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  refreshTxt:   { color: '#60a5fa' },

  seccionTxt:   { color: '#9ca3af', fontSize: 11, letterSpacing: 1.5, marginBottom: 10 },
  tokenItem:    { backgroundColor: '#111827', borderRadius: 10, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#1f2937' },
  tokenItemSel: { borderColor: '#1d4ed8' },
  tiNombre:     { color: '#d1d5db', fontSize: 14, marginBottom: 2 },
  tiVal:        { color: '#34d399', fontFamily: 'monospace', fontSize: 13 },
  badge:        { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  badgeActivo:  { backgroundColor: '#064e3b', color: '#6ee7b7' },
  badgePend:    { backgroundColor: '#422006', color: '#fcd34d' },
})
