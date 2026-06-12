#include <Wire.h>
#include <MPU6050.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>

// -------------------------
// CONFIGURACION
// -------------------------
#define WIFI_SSID   "Hey-CALERO"
#define WIFI_PASS   "Maria1974"
#define BACKEND_URL "https://tesiscandado.onrender.com/eventos/"
#define VALIDAR_URL "https://tesiscandado.onrender.com/eventos/validar"
#define CODIGO_DISP "ESP32-001"

// -------------------------
// PINES RC522
// -------------------------
#define SS_PIN   5
#define RST_PIN  27

// -------------------------
// PINES SENSORES
// -------------------------
#define REED_PIN     26
#define HALL_ANALOG  36
#define HALL_DIGITAL 39
#define BUZZER_PIN   25

// -------------------------
// OBJETOS
// -------------------------
MFRC522 rfid(SS_PIN, RST_PIN);
MPU6050 mpu(0x69);

MFRC522::MIFARE_Key keyNDEF;    // D3 F7 D3 F7 D3 F7
MFRC522::MIFARE_Key keyFactory; // FF FF FF FF FF FF

// -------------------------
// VARIABLES ALARMA
// -------------------------
int valorBase     = 0;
int reedEstadoAnt = 1;
int hallEstadoAnt = 0;
int16_t axAnt, ayAnt, azAnt;

const long UMBRAL_GOLPE   = 80000;
const long UMBRAL_IMPACTO = 100000;
unsigned long inicioVentana = 0;
int contadorEventos = 0;

bool reedAlerta = false;
bool hallAlerta = false;
bool mpuAlerta  = false;
unsigned long tiempoMpuAlerta = 0;
const unsigned long TIMEOUT_MPU = 10000;

// -------------------------
// RFID
// -------------------------
unsigned long ultimaLectura = 0;
const unsigned long COOLDOWN_RFID = 3000;

// -------------------------
// ENVIAR EVENTO AL BACKEND
// -------------------------
void enviarEvento(const char* tipo_evento, const char* uid_nfc = nullptr) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<256> doc;
  doc["codigo_dispositivo"] = CODIGO_DISP;
  doc["tipo_evento"]        = tipo_evento;
  if (uid_nfc) doc["uid_nfc"] = uid_nfc;
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("   -> Backend: HTTP %d\n", code);
  http.end();
}

// -------------------------
// VALIDAR TOKEN
// -------------------------
void validarToken(String token) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(VALIDAR_URL);
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<128> doc;
  doc["token"] = token;
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("   -> Validar HTTP %d\n", code);
  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<256> res;
    deserializeJson(res, resp);
    bool acceso     = res["acceso"];
    const char* msg = res["mensaje"];
    Serial.printf("   -> %s\n", msg);
    if (acceso) {
      ledcWriteTone(BUZZER_PIN, 1000); delay(200);
      ledcWriteTone(BUZZER_PIN, 0);   delay(100);
      ledcWriteTone(BUZZER_PIN, 1000); delay(200);
      ledcWriteTone(BUZZER_PIN, 0);
      enviarEvento("apertura_ok");
    } else {
      ledcWriteTone(BUZZER_PIN, 400); delay(800);
      ledcWriteTone(BUZZER_PIN, 0);
      enviarEvento("apertura_denegada");
    }
  }
  http.end();
}

// -------------------------
// AUTENTICAR BLOQUE
// -------------------------
bool autenticarBloque(byte bloque) {
  MFRC522::StatusCode auth = rfid.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloque, &keyNDEF, &(rfid.uid));
  if (auth == MFRC522::STATUS_OK) return true;
  auth = rfid.PCD_Authenticate(
    MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloque, &keyFactory, &(rfid.uid));
  return (auth == MFRC522::STATUS_OK);
}

// -------------------------
// LEER NDEF DEL TAG (solo bloque 4 - texto corto)
// Soporta Mifare Classic (tag fisico) e ISO 14443-4 (celular -> UID)
// -------------------------
String leerNDEF() {
  String texto = "";

  MFRC522::PICC_Type tipo = rfid.PICC_GetType(rfid.uid.sak);
  Serial.printf("Tipo tag: %s\n", rfid.PICC_GetTypeName(tipo));

  // ---- MIFARE CLASSIC (tag fisico) ----
  if (tipo == MFRC522::PICC_TYPE_MIFARE_MINI ||
      tipo == MFRC522::PICC_TYPE_MIFARE_1K   ||
      tipo == MFRC522::PICC_TYPE_MIFARE_4K) {

    if (!autenticarBloque(4)) {
      Serial.println("Auth fallida bloque 4");
      return "";
    }

    byte buffer[18];
    byte size = sizeof(buffer);
    if (rfid.MIFARE_Read(4, buffer, &size) != MFRC522::STATUS_OK) {
      Serial.println("Lectura fallida bloque 4");
      return "";
    }

    // Buscar marcador NDEF Text Record (0x54) y saltar idioma
    for (byte i = 0; i < 14; i++) {
      if (buffer[i] == 0x54) {
        byte langLen = buffer[i + 1] & 0x3F;
        byte inicio  = i + 2 + langLen;
        for (byte j = inicio; j < 16; j++) {
          if (buffer[j] == 0xFE || buffer[j] == 0x00) break;
          if (buffer[j] >= 32 && buffer[j] <= 126) texto += (char)buffer[j];
        }
        break;
      }
    }
  }

  // ---- ISO 14443-4 (celular NFC) -> usar UID como token ----
  else {
    Serial.println("Tag ISO 14443-4 (celular NFC) - usando UID");
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    texto = uid;
  }

  texto.trim();
  Serial.println("Texto leido: [" + texto + "]");
  return texto;
}

// -------------------------
// SETUP
// -------------------------
void setup() {
  Serial.begin(115200);
  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(HALL_DIGITAL, INPUT);

  keyNDEF.keyByte[0] = 0xD3; keyNDEF.keyByte[1] = 0xF7;
  keyNDEF.keyByte[2] = 0xD3; keyNDEF.keyByte[3] = 0xF7;
  keyNDEF.keyByte[4] = 0xD3; keyNDEF.keyByte[5] = 0xF7;
  for (byte i = 0; i < 6; i++) keyFactory.keyByte[i] = 0xFF;

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());

  ledcAttach(BUZZER_PIN, 1000, 8);

  delay(500);
  valorBase = analogRead(HALL_ANALOG);

  Wire.begin(21, 22);
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("Error MPU6050");
  } else {
    Serial.println("MPU6050 OK");
    mpu.getAcceleration(&axAnt, &ayAnt, &azAnt);
  }

  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("RC522 version: 0x%02X\n", v);
  Serial.println(v == 0x00 || v == 0xFF ? "ERROR: RC522 no responde" : "RC522 OK");

  inicioVentana = millis();
  Serial.println("Sistema completo listo");
}

// -------------------------
// LOOP
// -------------------------
void loop() {

  // =====================
  // RFID / NFC
  // =====================
  if (millis() - ultimaLectura > COOLDOWN_RFID) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      ultimaLectura = millis();

      String uid = "";
      for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) uid += "0";
        uid += String(rfid.uid.uidByte[i], HEX);
      }
      uid.toUpperCase();
      Serial.println("UID: " + uid);

      String token = leerNDEF();
      Serial.println("Token extraido: [" + token + "]");

      if (token.length() >= 4) {
        validarToken(token);
      } else {
        Serial.println("Sin token valido en el tag");
        ledcWriteTone(BUZZER_PIN, 400); delay(500);
        ledcWriteTone(BUZZER_PIN, 0);
        enviarEvento("apertura_denegada");
      }

      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }
  }

  // =====================
  // REED
  // =====================
  bool reedDetecta = (digitalRead(REED_PIN) == LOW);
  if (reedEstadoAnt != reedDetecta) {
    if (!reedDetecta) {
      reedAlerta = true;
      Serial.println("ALERTA REED - Puerta abierta");
      enviarEvento("alarma_reed");
    } else {
      reedAlerta = false;
      Serial.println("OK REED - Puerta cerrada");
      if (!hallAlerta && !mpuAlerta) enviarEvento("alarma_resuelta");
    }
    reedEstadoAnt = reedDetecta;
  }

  // =====================
  // HALL
  // =====================
  int diferencia = abs(analogRead(HALL_ANALOG) - valorBase);
  bool hallDetecta = (diferencia <= 100);
  if (hallEstadoAnt != hallDetecta) {
    if (!hallDetecta) {
      hallAlerta = true;
      Serial.println("ALERTA HALL - Iman removido");
      enviarEvento("alarma_hall");
    } else {
      hallAlerta = false;
      Serial.println("OK HALL - Iman en posicion");
      if (!reedAlerta && !mpuAlerta) enviarEvento("alarma_resuelta");
    }
    hallEstadoAnt = hallDetecta;
  }

  // =====================
  // MPU6050
  // =====================
  int16_t ax, ay, az;
  mpu.getAcceleration(&ax, &ay, &az);
  if (!(ax == -32768 || ay == -32768 || az == -32768 ||
        ax ==  32767 || ay ==  32767 || az ==  32767)) {
    long intensidad = abs(ax-axAnt) + abs(ay-ayAnt) + abs(az-azAnt);
    if (intensidad > UMBRAL_IMPACTO) {
      contadorEventos += 3; mpuAlerta = true; tiempoMpuAlerta = millis();
      Serial.println("ALERTA MPU - Impacto critico");
      enviarEvento("alarma_impacto");
    } else if (intensidad > UMBRAL_GOLPE) {
      contadorEventos++; mpuAlerta = true; tiempoMpuAlerta = millis();
      Serial.println("ALERTA MPU - Golpe");
      enviarEvento("alarma_impacto");
    }
    axAnt = ax; ayAnt = ay; azAnt = az;
  }

  if (mpuAlerta && (millis() - tiempoMpuAlerta >= TIMEOUT_MPU)) {
    mpuAlerta = false; contadorEventos = 0; inicioVentana = millis();
    Serial.println("OK MPU - Timeout");
    if (!reedAlerta && !hallAlerta) enviarEvento("alarma_resuelta");
  }

  if (millis() - inicioVentana >= 5000) {
    if (contadorEventos >= 5) {
      mpuAlerta = true; tiempoMpuAlerta = millis();
      Serial.println("ALERTA MPU - Forcejeo");
      enviarEvento("alarma_forcejeo");
    }
    contadorEventos = 0; inicioVentana = millis();
  }

  // =====================
  // BUZZER ALARMA
  // =====================
  bool alarma = reedAlerta || hallAlerta || mpuAlerta;
  static unsigned long ultimoCambio = 0;
  static bool estadoSirena = false;

  if (alarma) {
    if (millis() - ultimoCambio > 150) {
      ultimoCambio = millis();
      estadoSirena = !estadoSirena;
    }
    ledcWriteTone(BUZZER_PIN, estadoSirena ? 1200 : 2500);
  } else {
    ledcWriteTone(BUZZER_PIN, 0);
  }

  // LOG cada 5s
  static unsigned long ultimoLog = 0;
  if (millis() - ultimoLog >= 5000) {
    ultimoLog = millis();
    Serial.printf("[STATUS] Reed=%s Hall=%s MPU=%s Sirena=%s\n",
      reedDetecta ? "OK":"ALERTA",
      hallDetecta ? "OK":"ALERTA",
      mpuAlerta   ? "ALERTA":"OK",
      alarma      ? "SONANDO":"Silencio");
  }

  delay(100);
}
