/*
  CANDADO INTELIGENTE - Sketch principal ESP32 (SOLO GPRS, sin WiFi)
  Conectividad: SIM808 por GPRS -> ThingSpeak (HTTP)
  El backend de Render lee ThingSpeak y traduce a eventos/alarmas.

  Reporta a ThingSpeak:
    field1=latitud  field2=longitud  field3=bateria
    field4=evento   field5=salud(fallo hw)  field6=solenoide(0/1)
    status=mensaje legible

  Codigos evento (field4): 1=apertura_ok 2=apertura_denegada
    10=reed 11=hall 12=impacto 13=forcejeo 14=resuelta
  Codigos salud (field5):  0=ok 1=fallo_rfid 2=fallo_mpu 3=fallo_solenoide

  Libreria: TinyGSM (Library Manager).
  NOTA: la validacion del token RFID es LOCAL (offline), porque ThingSpeak
        no permite pregunta-respuesta en tiempo real. La lista se sincronizara
        luego via ThingSpeak TalkBack.
*/

#define TINY_GSM_MODEM_SIM808
#include <Wire.h>
#include <MPU6050.h>
#include <SPI.h>
#include <MFRC522.h>
#include <TinyGsmClient.h>

// -------------------------
// CONFIG GPRS / THINGSPEAK
// -------------------------
const char APN[]       = "internet.comcel.com.co";  // cambia segun tu operador
const char GPRS_USER[] = "";
const char GPRS_PASS[] = "";
const char TS_HOST[]   = "api.thingspeak.com";
const char TS_WRITEKEY[]= "C2GVMKCV7AYYEQM8";
#define CODIGO_DISP "ESP32-001"

// -------------------------
// PINES
// -------------------------
#define SIM_RX 16   // ESP32 RX2 <- SIM808 TXD
#define SIM_TX 17   // ESP32 TX2 -> SIM808 RXD
#define SS_PIN 5
#define RST_PIN 27
#define REED_PIN 26
#define HALL_ANALOG 36
#define HALL_DIGITAL 39
#define BUZZER_PIN 25
#define SOLENOID_PIN 13   // relay del solenoide

// -------------------------
// OBJETOS
// -------------------------
MFRC522 rfid(SS_PIN, RST_PIN);
MPU6050 mpu(0x69);
TinyGsm modem(Serial2);
TinyGsmClient gsmClient(modem);

MFRC522::MIFARE_Key keyNDEF;
MFRC522::MIFARE_Key keyFactory;

// -------------------------
// TOKENS AUTORIZADOS (validacion local offline)
// Se sincronizaran luego via TalkBack. Por ahora, lista fija.
// -------------------------
const char* TOKENS_OK[] = { "ABC1234" };
const int   N_TOKENS    = sizeof(TOKENS_OK) / sizeof(TOKENS_OK[0]);

// -------------------------
// ESTADO
// -------------------------
int valorBase = 0;
int reedEstadoAnt = 1, hallEstadoAnt = 0;
int16_t axAnt, ayAnt, azAnt;
const long UMBRAL_GOLPE = 80000, UMBRAL_IMPACTO = 100000;
unsigned long inicioVentana = 0;
int contadorEventos = 0;
bool reedAlerta = false, hallAlerta = false, mpuAlerta = false;
unsigned long tiempoMpuAlerta = 0;
const unsigned long TIMEOUT_MPU = 10000;

unsigned long ultimaLectura = 0;
const unsigned long COOLDOWN_RFID = 3000;

// Telemetria / posting
float ultLat = 0, ultLon = 0;
int   ultBat = 0;
unsigned long ultimoPost = 0;
const unsigned long INTERVALO_POST = 60000;   // heartbeat cada 60s
const unsigned long MIN_ENTRE_POST = 16000;   // ThingSpeak: min 15s
int  saludHW = 0;          // 0=ok 1=rfid 2=mpu 3=solenoide
bool solenoideAbierto = false;

// fallos detectados
bool falloRFID = false, falloMPU = false;

// -------------------------
// POST A THINGSPEAK (HTTP por GPRS)
// -------------------------
bool postThingSpeak(int evento, int salud, const char* status) {
  if (!modem.isGprsConnected()) {
    Serial.println("GPRS desconectado, reintentando...");
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
    if (!modem.isGprsConnected()) return false;
  }

  if (!gsmClient.connect(TS_HOST, 80)) {
    Serial.println("No conecto a ThingSpeak");
    return false;
  }

  // Construir URL de update
  String url = "/update?api_key=" + String(TS_WRITEKEY);
  if (ultLat != 0 && ultLon != 0) {
    url += "&field1=" + String(ultLat, 6);
    url += "&field2=" + String(ultLon, 6);
  }
  url += "&field3=" + String(ultBat);
  url += "&field4=" + String(evento);
  url += "&field5=" + String(salud);
  url += "&field6=" + String(solenoideAbierto ? 1 : 0);
  if (status && strlen(status) > 0) {
    url += "&status=" + String(status);
  }

  gsmClient.print(String("GET ") + url + " HTTP/1.1\r\n");
  gsmClient.print(String("Host: ") + TS_HOST + "\r\n");
  gsmClient.print("Connection: close\r\n\r\n");

  // Leer respuesta (no critica)
  unsigned long t = millis();
  while (gsmClient.connected() && millis() - t < 8000) {
    while (gsmClient.available()) { gsmClient.read(); t = millis(); }
  }
  gsmClient.stop();
  Serial.printf("ThingSpeak post: evento=%d salud=%d\n", evento, salud);
  ultimoPost = millis();
  return true;
}

// Encolar un evento para enviar (respetando rate limit)
void reportar(int evento, int salud, const char* status) {
  // Espera el minimo entre posts
  while (millis() - ultimoPost < MIN_ENTRE_POST) { delay(100); }
  postThingSpeak(evento, salud, status);
}

// -------------------------
// SOLENOIDE
// -------------------------
void abrirSolenoide() {
  digitalWrite(SOLENOID_PIN, HIGH);
  solenoideAbierto = true;
  // Confirmar apertura con el reed (debe dejar de detectar al abrir)
  unsigned long t = millis();
  bool confirmo = false;
  while (millis() - t < 3000) {
    if (digitalRead(REED_PIN) == HIGH) { confirmo = true; break; }
    delay(50);
  }
  if (!confirmo) {
    saludHW = 3; // fallo_solenoide: se ordeno abrir pero no confirmo
    Serial.println("FALLO SOLENOIDE: no confirmo apertura");
    reportar(0, 3, "Solenoide no confirmo apertura");
  }
  delay(3000);
  digitalWrite(SOLENOID_PIN, LOW);
  solenoideAbierto = false;
}

// -------------------------
// AUTENTICAR / LEER TAG
// -------------------------
bool autenticarBloque(byte bloque) {
  MFRC522::StatusCode a = rfid.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloque, &keyNDEF, &(rfid.uid));
  if (a == MFRC522::STATUS_OK) return true;
  a = rfid.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, bloque, &keyFactory, &(rfid.uid));
  return (a == MFRC522::STATUS_OK);
}

String leerToken() {
  String texto = "";
  MFRC522::PICC_Type tipo = rfid.PICC_GetType(rfid.uid.sak);
  if (tipo == MFRC522::PICC_TYPE_MIFARE_MINI || tipo == MFRC522::PICC_TYPE_MIFARE_1K || tipo == MFRC522::PICC_TYPE_MIFARE_4K) {
    if (!autenticarBloque(4)) return "";
    byte buffer[18]; byte size = sizeof(buffer);
    if (rfid.MIFARE_Read(4, buffer, &size) != MFRC522::STATUS_OK) return "";
    for (byte i = 0; i < 14; i++) {
      if (buffer[i] == 0x54) {
        byte langLen = buffer[i + 1] & 0x3F;
        byte ini = i + 2 + langLen;
        for (byte j = ini; j < 16; j++) {
          if (buffer[j] == 0xFE || buffer[j] == 0x00) break;
          if (buffer[j] >= 32 && buffer[j] <= 126) texto += (char)buffer[j];
        }
        break;
      }
    }
  } else {
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    texto = uid;
  }
  texto.trim();
  return texto;
}

bool tokenAutorizado(String token) {
  for (int i = 0; i < N_TOKENS; i++) {
    if (token.equalsIgnoreCase(TOKENS_OK[i])) return true;
  }
  return false;
}

// -------------------------
// GPS
// -------------------------
void actualizarGPS() {
  float lat = 0, lon = 0, sp = 0, al = 0; int vs = 0, us = 0;
  if (modem.getGPS(&lat, &lon, &sp, &al, &vs, &us) && lat != 0 && lon != 0) {
    ultLat = lat; ultLon = lon;
    Serial.printf("GPS: %.6f, %.6f\n", lat, lon);
  }
}

// -------------------------
// SETUP
// -------------------------
void setup() {
  Serial.begin(115200);
  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(HALL_DIGITAL, INPUT);
  pinMode(SOLENOID_PIN, OUTPUT);
  digitalWrite(SOLENOID_PIN, LOW);

  keyNDEF.keyByte[0]=0xD3; keyNDEF.keyByte[1]=0xF7; keyNDEF.keyByte[2]=0xD3;
  keyNDEF.keyByte[3]=0xF7; keyNDEF.keyByte[4]=0xD3; keyNDEF.keyByte[5]=0xF7;
  for (byte i=0;i<6;i++) keyFactory.keyByte[i]=0xFF;

  ledcAttach(BUZZER_PIN, 1000, 8);
  delay(500);
  valorBase = analogRead(HALL_ANALOG);

  // MPU
  Wire.begin(21, 22);
  mpu.initialize();
  if (!mpu.testConnection()) { falloMPU = true; Serial.println("FALLO MPU6050"); }
  else { mpu.getAcceleration(&axAnt, &ayAnt, &azAnt); }

  // RC522
  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  if (v == 0x00 || v == 0xFF) { falloRFID = true; Serial.println("FALLO RC522"); }

  // SIM808: GPRS + GPS
  Serial2.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(3000);
  Serial.println("Iniciando SIM808...");
  modem.restart();
  modem.waitForNetwork(60000L);
  Serial.print("GPRS...");
  modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
  Serial.println(modem.isGprsConnected() ? "OK" : "FALLO");
  modem.enableGPS();

  inicioVentana = millis();
  ultimoPost = millis() - INTERVALO_POST;

  // Reportar fallos de hardware detectados al arranque
  if (falloRFID) reportar(0, 1, "RFID no responde");
  if (falloMPU)  reportar(0, 2, "MPU no responde");

  Serial.println("Sistema listo (GPRS)");
}

// -------------------------
// LOOP
// -------------------------
void loop() {

  // ===== RFID (validacion LOCAL) =====
  if (millis() - ultimaLectura > COOLDOWN_RFID) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      ultimaLectura = millis();
      String token = leerToken();
      Serial.println("Token: [" + token + "]");
      if (token.length() >= 4 && tokenAutorizado(token)) {
        ledcWriteTone(BUZZER_PIN, 1000); delay(200); ledcWriteTone(BUZZER_PIN, 0);
        Serial.println("ACCESO CONCEDIDO");
        reportar(1, saludHW, "Acceso concedido");   // evento 1
        abrirSolenoide();
      } else {
        ledcWriteTone(BUZZER_PIN, 400); delay(700); ledcWriteTone(BUZZER_PIN, 0);
        Serial.println("ACCESO DENEGADO");
        reportar(2, saludHW, "Acceso denegado");     // evento 2
      }
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }
  }

  // ===== REED =====
  bool reedDetecta = (digitalRead(REED_PIN) == LOW);
  if (reedEstadoAnt != reedDetecta) {
    if (!reedDetecta && !solenoideAbierto) {
      reedAlerta = true;
      Serial.println("ALERTA REED");
      reportar(10, saludHW, "Puerta abierta sin autorizacion");
    } else if (reedDetecta) {
      reedAlerta = false;
      if (!hallAlerta && !mpuAlerta) reportar(14, saludHW, "Alarma resuelta");
    }
    reedEstadoAnt = reedDetecta;
  }

  // ===== HALL =====
  int diferencia = abs(analogRead(HALL_ANALOG) - valorBase);
  bool hallDetecta = (diferencia <= 100);
  if (hallEstadoAnt != hallDetecta) {
    if (!hallDetecta) {
      hallAlerta = true;
      Serial.println("ALERTA HALL");
      reportar(11, saludHW, "Iman removido");
    } else {
      hallAlerta = false;
      if (!reedAlerta && !mpuAlerta) reportar(14, saludHW, "Alarma resuelta");
    }
    hallEstadoAnt = hallDetecta;
  }

  // ===== MPU =====
  int16_t ax, ay, az;
  mpu.getAcceleration(&ax, &ay, &az);
  if (!(ax==-32768||ay==-32768||az==-32768||ax==32767||ay==32767||az==32767)) {
    long inten = abs(ax-axAnt)+abs(ay-ayAnt)+abs(az-azAnt);
    if (inten > UMBRAL_IMPACTO) {
      contadorEventos += 3; mpuAlerta = true; tiempoMpuAlerta = millis();
      Serial.println("ALERTA IMPACTO");
      reportar(12, saludHW, "Impacto detectado");
    } else if (inten > UMBRAL_GOLPE) {
      contadorEventos++; mpuAlerta = true; tiempoMpuAlerta = millis();
      reportar(12, saludHW, "Golpe detectado");
    }
    axAnt=ax; ayAnt=ay; azAnt=az;
  }
  if (mpuAlerta && (millis() - tiempoMpuAlerta >= TIMEOUT_MPU)) {
    mpuAlerta = false; contadorEventos = 0; inicioVentana = millis();
    if (!reedAlerta && !hallAlerta) reportar(14, saludHW, "Alarma resuelta");
  }
  if (millis() - inicioVentana >= 5000) {
    if (contadorEventos >= 5) {
      mpuAlerta = true; tiempoMpuAlerta = millis();
      reportar(13, saludHW, "Forcejeo detectado");
    }
    contadorEventos = 0; inicioVentana = millis();
  }

  // ===== BUZZER =====
  bool alarma = reedAlerta || hallAlerta || mpuAlerta;
  static unsigned long ultimoCambio = 0; static bool sirena = false;
  if (alarma) {
    if (millis() - ultimoCambio > 150) { ultimoCambio = millis(); sirena = !sirena; }
    ledcWriteTone(BUZZER_PIN, sirena ? 1200 : 2500);
  } else {
    ledcWriteTone(BUZZER_PIN, 0);
  }

  // ===== TELEMETRIA periodica (GPS + bateria) =====
  if (millis() - ultimoPost >= INTERVALO_POST) {
    actualizarGPS();
    ultBat = modem.getBattPercent();
    postThingSpeak(0, saludHW, "heartbeat");
  }

  delay(100);
}
