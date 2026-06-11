import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// IP de tu PC — celular y PC deben estar en el mismo WiFi
const BASE_URL = 'http://192.168.0.2:8000' // v3

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
//funciona
