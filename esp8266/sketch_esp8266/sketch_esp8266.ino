/*
  CANDADO INTELIGENTE - Sketch ESP8266 (NodeMCU) - version recortada
  Portado desde el de ESP32. Conectividad SIM808 por GPRS -> ThingSpeak (HTTP).

  DIFERENCIAS vs ESP32 (por limite de pines del ESP8266):
    - SIN sensor HALL, SIN touch TTP223, SIN MPU6050 (impacto/forcejeo).
    - SIM808 por SoftwareSerial (el ESP8266 no tiene Serial2).
    - RC522 RST atado a 3.3V (reset por software).
    - RFID siempre encendido (sin touch para ahorro).
    - REED necesita pull-up EXTERNO de 10k (GPIO16 no tiene interno).

  Reporta a ThingSpeak: field1=lat field2=lon field3=bateria
    field4=evento field5=salud field6=solenoide
  Eventos: 1=apertura_ok 2=apertura_denegada 10=reed 14=resuelta
  Salud:   0=ok 1=fallo_rfid 3=fallo_solenoide

  =====================================================================
  MAPA DE CONEXIONES (NodeMCU ESP8266, todo a GND comun)
    RC522:  SCK->D5  MISO->D6  MOSI->D7  SS->D0  RST->D8 (+R10k a 3.3V)  3.3V/GND
    SIM808: TXD->D1  RXD->D2   VBAT->bateria   GND comun  (antena GPS al cielo)
    REED:   D4  (+ resistencia 10k de D4 a 3.3V)  otro extremo a GND
    RELE XY-J02 (solenoide): Trigger -> D3   (config modo OP, 3.0s)
    (sin buzzer)
  =====================================================================
*/

#define TINY_GSM_MODEM_SIM808
#include <SoftwareSerial.h>
#include <SPI.h>
#include <MFRC522.h>
#include <TinyGsmClient.h>

// -------------------------
// CONFIG GPRS / THINGSPEAK
// -------------------------
const char APN[]        = "internet.comcel.com.co";  // cambia segun tu operador
const char GPRS_USER[]  = "";
const char GPRS_PASS[]  = "";
const char TS_HOST[]    = "api.thingspeak.com";
const char TS_WRITEKEY[] = "C2GVMKCV7AYYEQM8";
#define CODIGO_DISP "ESP32-001"

// TalkBack (lista de tokens validos)
#define TALKBACK_ID  "57245"
#define TALKBACK_KEY "M2015WR5B484N7IG"
#define MAX_TOKENS   30

// -------------------------
// PINES (NodeMCU ESP8266)
// -------------------------
#define SIM_RX     D1    // GPIO5  <- SIM808 TXD
#define SIM_TX     D2    // GPIO4  -> SIM808 RXD
#define SS_PIN     D0    // GPIO16 RC522 SS (no es strapping pin — seguro)
#define RST_PIN    D8    // GPIO15 RC522 RST (con resistencia 10k pull-up a 3.3V)
#define REED_PIN   D4    // GPIO2  sensor puerta (pull-up EXTERNO 10k a 3.3V)
#define RELAY_PIN  D3    // GPIO0  XY-J02 trigger

// XY-J02 ACTIVO EN BAJO (IN=LOW -> relay ON). Cambia a true si tu modulo es al reves.
#define RELAY_ACTIVO_ALTO false
#define RELAY_ON  (RELAY_ACTIVO_ALTO ? HIGH : LOW)
#define RELAY_OFF (RELAY_ACTIVO_ALTO ? LOW  : HIGH)

// -------------------------
// OBJETOS
// -------------------------
SoftwareSerial simSerial(SIM_RX, SIM_TX);   // (RX, TX) hacia el SIM808
MFRC522 rfid(SS_PIN, RST_PIN);
TinyGsm modem(simSerial);

MFRC522::MIFARE_Key keyNDEF;
MFRC522::MIFARE_Key keyFactory;

// -------------------------
// TOKENS (lista que se descarga del TalkBack)
// -------------------------
// NOTA: bajo fail-closed ya NO se usa una semilla local para conceder acceso; el
// candado solo abre con la lista confirmada por el backend (ver listaVigente()).
String tokensValidos[MAX_TOKENS];
int    nTokensValidos = 0;
unsigned long ultimoSyncTokens = 0;
const unsigned long INTERVALO_SYNC_TOKENS = 60000;

// FAIL-CLOSED: solo se concede acceso si la lista de tokens se bajo del TalkBack
// con exito hace poco. Sin sync reciente NO se abre (un token revocado deja de
// servir en vez de seguir vigente por una lista vieja). Ver ESP32 para detalle.
unsigned long ultimoSyncTokensOK = 0;              // 0 = nunca sincronizo
bool          huboSyncTokensOK   = false;
const unsigned long LISTA_MAX_EDAD_MS = 180000;    // 3 min (sync cada 60s aqui)

// -------------------------
// ESTADO
// -------------------------
int reedEstadoAnt = 1;
bool reedAlerta = false;

unsigned long ultimaLectura = 0;
const unsigned long COOLDOWN_RFID = 3000;

float ultLat = 0, ultLon = 0;
int   ultBat = 0;
unsigned long ultimoPost = 0;
const unsigned long INTERVALO_POST = 60000;
const unsigned long MIN_ENTRE_POST = 16000;
int  saludHW = 0;
bool solenoideAbierto = false;
bool falloRFID = false;

// -------------------------
// AT crudo al SIM808
// -------------------------
String enviarAT(String cmd, unsigned long timeout = 3000, const char* hasta = "OK") {
  while (simSerial.available()) simSerial.read();
  simSerial.println(cmd);
  String r = "";
  unsigned long t = millis();
  while (millis() - t < timeout) {
    while (simSerial.available()) r += (char)simSerial.read();
    if (r.indexOf(hasta) >= 0) { delay(150); while (simSerial.available()) r += (char)simSerial.read(); break; }
    delay(5);
    yield();   // ESP8266: alimentar el watchdog
  }
  return r;
}

// -------------------------
// POST a ThingSpeak (HTTP nativo del SIM808)
// -------------------------
bool postThingSpeak(int evento, int salud, const char* status) {
  if (!modem.isGprsConnected()) { Serial.println("Sin GPRS, post omitido"); return false; }
  String url = "http://" + String(TS_HOST) + "/update?api_key=" + String(TS_WRITEKEY);
  if (ultLat != 0 && ultLon != 0) {
    url += "&field1=" + String(ultLat, 6);
    url += "&field2=" + String(ultLon, 6);
  }
  url += "&field3=" + String(ultBat);
  url += "&field4=" + String(evento);
  url += "&field5=" + String(salud);
  url += "&field6=" + String(solenoideAbierto ? 1 : 0);
  if (status && strlen(status) > 0) { String s = String(status); s.replace(" ", "%20"); url += "&status=" + s; }

  if (enviarAT("AT+SAPBR=2,1").indexOf("+SAPBR: 1,1") < 0) {
    enviarAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
    enviarAT("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"");
    enviarAT("AT+SAPBR=1,1", 10000);
  }
  enviarAT("AT+HTTPTERM", 1500);
  delay(100);
  if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) {
    enviarAT("AT+HTTPTERM", 1500); delay(400);
    if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) { Serial.println("HTTPINIT fallo"); return false; }
  }
  enviarAT("AT+HTTPPARA=\"CID\",1");
  enviarAT("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  String r = enviarAT("AT+HTTPACTION=0", 20000, "+HTTPACTION:");
  enviarAT("AT+HTTPTERM", 1500);

  int code = 0, idx = r.indexOf("+HTTPACTION:");
  if (idx >= 0) {
    int c1 = r.indexOf(',', idx), c2 = r.indexOf(',', c1 + 1);
    if (c1 >= 0 && c2 >= 0) code = r.substring(c1 + 1, c2).toInt();
  }
  Serial.printf("ThingSpeak post: evento=%d salud=%d -> HTTP %d\n", evento, salud, code);
  ultimoPost = millis();
  return (code == 200);
}

void reportar(int evento, int salud, const char* status) {
  if (millis() - ultimoPost < MIN_ENTRE_POST) return;
  postThingSpeak(evento, salud, status);
}

// -------------------------
// SOLENOIDE
// -------------------------
void abrirSolenoide() {
  solenoideAbierto = true;
  digitalWrite(RELAY_PIN, RELAY_ON);
  delay(300);
  digitalWrite(RELAY_PIN, RELAY_OFF);
  unsigned long t = millis();
  bool confirmo = false;
  while (millis() - t < 3000) {
    if (digitalRead(REED_PIN) == HIGH) { confirmo = true; break; }
    delay(50); yield();
  }
  if (!confirmo) {
    saludHW = 3;
    Serial.println("FALLO SOLENOIDE: no confirmo apertura");
    reportar(0, 3, "Solenoide no confirmo apertura");
  }
  solenoideAbierto = false;
}

// -------------------------
// LEER TAG
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
    uid.toUpperCase(); texto = uid;
  }
  texto.trim();
  return texto;
}

bool tokenAutorizado(String token) {
  for (int i = 0; i < nTokensValidos; i++) if (token.equalsIgnoreCase(tokensValidos[i])) return true;
  return false;
}

// FAIL-CLOSED: la lista solo es de fiar si se sincronizo con exito hace poco.
bool listaVigente() {
  return huboSyncTokensOK && (millis() - ultimoSyncTokensOK <= LISTA_MAX_EDAD_MS);
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
// SINCRONIZAR TOKENS (TalkBack, commands.json)
// -------------------------
void sincronizarTokens() {
  if (!modem.isGprsConnected()) return;
  String url = "http://api.thingspeak.com/talkbacks/" TALKBACK_ID "/commands.json?api_key=" TALKBACK_KEY;

  enviarAT("AT+HTTPTERM", 1500); delay(100);
  if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) return;
  enviarAT("AT+HTTPPARA=\"CID\",1");
  enviarAT("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  String act  = enviarAT("AT+HTTPACTION=0", 15000, "+HTTPACTION:");
  String resp = enviarAT("AT+HTTPREAD", 3000, "@@@");
  enviarAT("AT+HTTPTERM", 1500);

  int code = 0, ia = act.indexOf("+HTTPACTION:");
  if (ia >= 0) { int c1 = act.indexOf(',', ia), c2 = act.indexOf(',', c1 + 1); if (c1 >= 0 && c2 >= 0) code = act.substring(c1 + 1, c2).toInt(); }
  if (code != 200) return;

  // Sync EXITOSO (HTTP 200): renueva la ventana de fail-closed.
  ultimoSyncTokensOK = millis();
  huboSyncTokensOK   = true;

  // Comando MAS RECIENTE (lastIndexOf): commands.json los devuelve de viejo a
  // nuevo; si quedo algun comando viejo acumulado, prevalece la lista nueva.
  int k = resp.lastIndexOf("\"command_string\":\"");
  if (k < 0) { nTokensValidos = 0; Serial.println("Tokens: lista vacia"); return; }
  k += 18;
  int fin = resp.indexOf('"', k);
  if (fin < 0) return;
  String cuerpo = resp.substring(k, fin); cuerpo.trim();
  if (cuerpo.length() == 0) { nTokensValidos = 0; return; }

  int n = 0, ini = 0;
  while (ini <= (int)cuerpo.length() && n < MAX_TOKENS) {
    int coma = cuerpo.indexOf(',', ini);
    if (coma < 0) coma = cuerpo.length();
    String tk = cuerpo.substring(ini, coma); tk.trim();
    // Ignorar comandos especiales del backend (no son tokens): GPS:x / LOC:<nonce>
    if (tk.length() > 0 && !tk.startsWith("GPS:") && !tk.startsWith("LOC:"))
      tokensValidos[n++] = tk;
    ini = coma + 1;
  }
  nTokensValidos = n;
  Serial.printf("Tokens sincronizados: %d\n", nTokensValidos);
}

// -------------------------
// SETUP
// -------------------------
void setup() {
  Serial.begin(115200);
  pinMode(REED_PIN, INPUT);          // GPIO16: pull-up EXTERNO de 10k
  pinMode(RELAY_PIN, OUTPUT);  digitalWrite(RELAY_PIN, RELAY_OFF);

  keyNDEF.keyByte[0]=0xD3; keyNDEF.keyByte[1]=0xF7; keyNDEF.keyByte[2]=0xD3;
  keyNDEF.keyByte[3]=0xF7; keyNDEF.keyByte[4]=0xD3; keyNDEF.keyByte[5]=0xF7;
  for (byte i=0;i<6;i++) keyFactory.keyByte[i]=0xFF;
  delay(500);

  // RC522 (RST atado a 3.3V -> reset por software)
  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  if (v == 0x00 || v == 0xFF) { falloRFID = true; Serial.println("FALLO RC522"); }
  // antena queda encendida (sin touch)

  // SIM808 por SoftwareSerial
  simSerial.begin(9600);
  delay(3000);
  Serial.println("Iniciando SIM808...");
  modem.restart();
  modem.waitForNetwork(60000L);
  Serial.print("GPRS...");
  for (int i = 0; i < 6 && !modem.isGprsConnected(); i++) {
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
    if (modem.isGprsConnected()) break;
    Serial.print("."); delay(3000);
  }
  Serial.println(modem.isGprsConnected() ? "OK" : "FALLO");
  modem.enableGPS();

  enviarAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
  enviarAT("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"");
  enviarAT("AT+SAPBR=1,1", 10000);
  enviarAT("AT+SAPBR=2,1");

  // Tokens: primera descarga desde el TalkBack. Bajo fail-closed no se siembra
  // ninguna lista local; el acceso queda cerrado hasta el primer sync exitoso.
  sincronizarTokens();
  ultimoSyncTokens = millis();

  ultBat = modem.getBattPercent();
  Serial.printf("Bateria inicial: %d%%\n", ultBat);

  ultimoPost = millis() - INTERVALO_POST;
  if (falloRFID) reportar(0, 1, "RFID no responde");
  Serial.println("Sistema listo (GPRS)");
}

// -------------------------
// LOOP
// -------------------------
void loop() {
  static unsigned long ultLog = 0;
  if (millis() - ultLog > 2000) {
    ultLog = millis();
    Serial.printf("[STATUS] GPRS=%s  tokens=%d\n", modem.isGprsConnected() ? "OK" : "NO", nTokensValidos);
  }

  // ===== RFID (siempre activo) =====
  if (millis() - ultimaLectura > COOLDOWN_RFID) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      ultimaLectura = millis();
      String token = leerToken();
      Serial.println("Token: [" + token + "]");
      if (!listaVigente()) {
        // FAIL-CLOSED: sin sincronizacion reciente no se concede acceso.
        Serial.println("ACCESO DENEGADO (lista de tokens sin sincronizar; fail-closed)");
        reportar(2, saludHW, "Acceso denegado (sin sincronizacion)");
      } else if (token.length() >= 4 && tokenAutorizado(token)) {
        Serial.println("ACCESO CONCEDIDO");
        reportar(1, saludHW, "Acceso concedido");
        abrirSolenoide();
      } else {
        Serial.println("ACCESO DENEGADO");
        reportar(2, saludHW, "Acceso denegado");
      }
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }
  }

  // ===== REED (apertura no autorizada) =====
  bool reedDetecta = (digitalRead(REED_PIN) == LOW);
  if (reedEstadoAnt != reedDetecta) {
    if (!reedDetecta && !solenoideAbierto) {
      reedAlerta = true;
      Serial.println("ALERTA REED");
      reportar(10, saludHW, "Puerta abierta sin autorizacion");
    } else if (reedDetecta) {
      reedAlerta = false;
      reportar(14, saludHW, "Alarma resuelta");
    }
    reedEstadoAnt = reedDetecta;
  }

  // ===== SYNC de tokens (cada 60s) =====
  if (millis() - ultimoSyncTokens >= INTERVALO_SYNC_TOKENS) {
    ultimoSyncTokens = millis();
    sincronizarTokens();
  }

  // ===== TELEMETRIA (GPS + bateria, cada 60s) =====
  if (millis() - ultimoPost >= INTERVALO_POST) {
    actualizarGPS();
    ultBat = modem.getBattPercent();
    postThingSpeak(0, saludHW, "heartbeat");
  }

  delay(50);
  yield();
}
