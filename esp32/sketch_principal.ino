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

  =====================================================================
  MAPA DE CONEXIONES (todo a GND comun)
  =====================================================================

  --- SIM808 (UART2) ---
    SIM808 TXD   -> ESP32 GPIO16
    SIM808 RXD   -> ESP32 GPIO17
    SIM808 VBAT  -> Bateria LiPo 1S (3.7-4.2V)  [misma bateria para todo]
    SIM808 GND   -> GND comun
    Antena GSM y Antena GPS conectadas. GPS con vista al cielo.

  --- RC522 (RFID, SPI) ---
    SDA(SS) -> GPIO5      SCK  -> GPIO18
    MOSI    -> GPIO23     MISO -> GPIO19
    RST     -> GPIO27     3.3V -> 3.3V    GND -> GND

  --- MPU6050 (I2C) ---
    SDA -> GPIO21    SCL -> GPIO22    VCC -> 3.3V    GND -> GND
    (direccion 0x69: pin AD0 a VCC. Si usas 0x68, AD0 a GND y cambia en el codigo)

  --- Sensor REED ---
    Un extremo -> GPIO26    otro extremo -> GND   (usa pull-up interno)

  --- Sensor HALL (KY-024) ---
    A0 -> GPIO36 (VP)    D0 -> GPIO39 (VN)    VCC -> 3.3V    GND -> GND

  --- Buzzer ---
    + -> GPIO25    - -> GND

  --- TTP223B (touch capacitivo) ---
    I/O -> GPIO33    VCC -> 3.3V    GND -> GND
    (debe dar HIGH al tocar. Modo momentaneo.)

  --- XY-J02 (modulo temporizador relay) ---
    Trigger -> GPIO13     GND_T -> GND del ESP32  (referencia del disparo!)
    6~30V   -> +12V (boost)   GND -> GND
    COM -> +12V    NO -> Solenoide(+)    Solenoide(-) -> GND
    Configurar modo OP, tiempo 3.0s. Diodo flyback 1N4007 en el solenoide.

  --- ALIMENTACION ---
    Bateria LiPo 1S -> alimenta ESP32, SIM808, RC522, MPU, sensores
    Boost 3.7V->12V -> alimenta el modulo XY-J02 y el solenoide
    TODOS los GND unidos (comun)
  =====================================================================
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
#define RELAY_PIN 13      // XY-J02: pin IN (controla el solenoide)
#define TOUCH_PIN 33      // TTP223B: pin OUT (HIGH al tocar)

// El XY-J02 suele ser ACTIVO EN BAJO (IN=LOW -> relay ON).
// Si tu modulo activa al reves, cambia a true.
#define RELAY_ACTIVO_ALTO false
#define RELAY_ON  (RELAY_ACTIVO_ALTO ? HIGH : LOW)
#define RELAY_OFF (RELAY_ACTIVO_ALTO ? LOW  : HIGH)

// -------------------------
// OBJETOS
// -------------------------
MFRC522 rfid(SS_PIN, RST_PIN);
MPU6050 mpu(0x69);
TinyGsm modem(Serial2);
TinyGsmClient gsmClient(modem);   // HTTP puerto 80

MFRC522::MIFARE_Key keyNDEF;
MFRC522::MIFARE_Key keyFactory;

// -------------------------
// TOKENS AUTORIZADOS (validacion local offline)
// La lista REAL se descarga del TalkBack de ThingSpeak (sincronizarTokens()).
// TOKENS_SEED es solo un respaldo inicial por si aun no se ha sincronizado.
// -------------------------
#define TALKBACK_ID  "57245"
#define TALKBACK_KEY "M2015WR5B484N7IG"
#define MAX_TOKENS   30

const char* TOKENS_SEED[] = { "LCBN8CC", "TK00001" };   // respaldo inicial
const int   N_SEED        = sizeof(TOKENS_SEED) / sizeof(TOKENS_SEED[0]);

String tokensValidos[MAX_TOKENS];      // lista vigente (se llena al sincronizar)
int    nTokensValidos = 0;
unsigned long ultimoSyncTokens = 0;
const unsigned long INTERVALO_SYNC_TOKENS = 60000;   // descargar lista cada 60s

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
// Enviar un comando AT crudo al SIM808 y devolver su respuesta
String enviarAT(String cmd, unsigned long timeout = 3000, const char* hasta = "OK") {
  while (Serial2.available()) Serial2.read();   // limpiar buffer
  Serial2.println(cmd);
  String r = "";
  unsigned long t = millis();
  while (millis() - t < timeout) {
    while (Serial2.available()) r += (char)Serial2.read();
    if (r.indexOf(hasta) >= 0) { delay(150); while (Serial2.available()) r += (char)Serial2.read(); break; }
    delay(5);
  }
  return r;
}

// POST a ThingSpeak con el motor HTTP NATIVO del SIM808 (AT+HTTP)
bool postThingSpeak(int evento, int salud, const char* status) {
  // Si no hay GPRS, NO bloquear el candado: salir rapido
  if (!modem.isGprsConnected()) {
    Serial.println("Sin GPRS, post omitido");
    return false;
  }
  String url = "http://" + String(TS_HOST) + "/update?api_key=" + String(TS_WRITEKEY);
  if (ultLat != 0 && ultLon != 0) {
    url += "&field1=" + String(ultLat, 6);
    url += "&field2=" + String(ultLon, 6);
  }
  url += "&field3=" + String(ultBat);
  url += "&field4=" + String(evento);
  url += "&field5=" + String(salud);
  url += "&field6=" + String(solenoideAbierto ? 1 : 0);
  if (status && strlen(status) > 0) {
    String s = String(status);
    s.replace(" ", "%20");
    url += "&status=" + s;
  }

  // Asegurar que el bearer GPRS este abierto (si no, reabrirlo)
  if (enviarAT("AT+SAPBR=2,1").indexOf("+SAPBR: 1,1") < 0) {
    enviarAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
    enviarAT("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"");
    enviarAT("AT+SAPBR=1,1", 10000);
  }

  enviarAT("AT+HTTPTERM", 1500);                      // por si quedo abierto
  delay(100);
  if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) {
    // Reintento: cerrar y volver a iniciar
    enviarAT("AT+HTTPTERM", 1500);
    delay(400);
    if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) {
      Serial.println("HTTPINIT fallo");
      return false;
    }
  }
  enviarAT("AT+HTTPPARA=\"CID\",1");
  enviarAT("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  String r = enviarAT("AT+HTTPACTION=0", 20000, "+HTTPACTION:");  // GET
  enviarAT("AT+HTTPTERM", 1500);

  // Parsear:  +HTTPACTION: 0,200,3   (metodo, codigo HTTP, longitud)
  int code = 0;
  int idx = r.indexOf("+HTTPACTION:");
  if (idx >= 0) {
    int c1 = r.indexOf(',', idx);
    int c2 = r.indexOf(',', c1 + 1);
    if (c1 >= 0 && c2 >= 0) code = r.substring(c1 + 1, c2).toInt();
  }
  Serial.printf("ThingSpeak post: evento=%d salud=%d -> HTTP %d\n", evento, salud, code);
  ultimoPost = millis();
  return (code == 200);
}

// Reportar un evento SIN bloquear el candado.
// Si fue hace menos de 15s, se omite (no se congela el lazo esperando).
void reportar(int evento, int salud, const char* status) {
  if (millis() - ultimoPost < MIN_ENTRE_POST) return;
  postThingSpeak(evento, salud, status);
}

// -------------------------
// BUZZER ACTIVO (solo on/off, sin frecuencia)
// -------------------------
void beep(int ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

// -------------------------
// SOLENOIDE
// -------------------------
void abrirSolenoide() {
  // El modulo temporizador XY-J02 maneja los 3s de apertura.
  // El ESP32 solo manda un PULSO corto en Trigger.
  solenoideAbierto = true;
  digitalWrite(RELAY_PIN, RELAY_ON);
  delay(300);                          // pulso de disparo
  digitalWrite(RELAY_PIN, RELAY_OFF);

  // Confirmar apertura con el reed durante la ventana del temporizador
  unsigned long t = millis();
  bool confirmo = false;
  while (millis() - t < 3000) {
    if (digitalRead(REED_PIN) == HIGH) { confirmo = true; break; }
    delay(50);
  }
  if (!confirmo) {
    saludHW = 3; // fallo_solenoide: se disparo pero el reed no confirmo apertura
    Serial.println("FALLO SOLENOIDE: no confirmo apertura");
    reportar(0, 3, "Solenoide no confirmo apertura");
  }
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
  for (int i = 0; i < nTokensValidos; i++) {
    if (token.equalsIgnoreCase(tokensValidos[i])) return true;
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
// SINCRONIZAR TOKENS (TalkBack de ThingSpeak, por HTTP)
// Descarga la lista de tokens validos que publica el backend. Si falla,
// CONSERVA la lista anterior (el candado sigue funcionando offline).
// -------------------------
void sincronizarTokens() {
  if (!modem.isGprsConnected()) return;

  // "List All Commands": devuelve los comandos en cola SIN consumirlos.
  // El backend deja 1 comando = lista CSV de tokens en "command_string".
  String url = "http://api.thingspeak.com/talkbacks/" TALKBACK_ID
               "/commands.json?api_key=" TALKBACK_KEY;

  enviarAT("AT+HTTPTERM", 1500);
  delay(100);
  if (enviarAT("AT+HTTPINIT").indexOf("OK") < 0) return;
  enviarAT("AT+HTTPPARA=\"CID\",1");
  enviarAT("AT+HTTPPARA=\"URL\",\"" + url + "\"");
  String act  = enviarAT("AT+HTTPACTION=0", 15000, "+HTTPACTION:");   // GET
  String resp = enviarAT("AT+HTTPREAD", 3000, "@@@");                 // leer cuerpo (3s)
  enviarAT("AT+HTTPTERM", 1500);

  // Verificar HTTP 200
  int code = 0, ia = act.indexOf("+HTTPACTION:");
  if (ia >= 0) {
    int c1 = act.indexOf(',', ia), c2 = act.indexOf(',', c1 + 1);
    if (c1 >= 0 && c2 >= 0) code = act.substring(c1 + 1, c2).toInt();
  }
  if (code != 200) return;   // si fallo, se conserva la lista anterior

  // Extraer el CSV de  "command_string":"LCBN8CC,AB12CD3"
  int k = resp.indexOf("\"command_string\":\"");
  if (k < 0) {                      // cola vacia -> sin tokens autorizados
    nTokensValidos = 0;
    Serial.println("Tokens: lista vacia");
    return;
  }
  k += 18;                          // longitud de  "command_string":"
  int fin = resp.indexOf('"', k);
  if (fin < 0) return;
  String cuerpo = resp.substring(k, fin);
  cuerpo.trim();
  if (cuerpo.length() == 0) { nTokensValidos = 0; return; }

  // Separar el CSV en la lista
  int n = 0, ini = 0;
  while (ini <= (int)cuerpo.length() && n < MAX_TOKENS) {
    int coma = cuerpo.indexOf(',', ini);
    if (coma < 0) coma = cuerpo.length();
    String tk = cuerpo.substring(ini, coma); tk.trim();
    if (tk.length() > 0) tokensValidos[n++] = tk;
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
  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(HALL_DIGITAL, INPUT);
  pinMode(TOUCH_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);   // relay apagado al iniciar

  keyNDEF.keyByte[0]=0xD3; keyNDEF.keyByte[1]=0xF7; keyNDEF.keyByte[2]=0xD3;
  keyNDEF.keyByte[3]=0xF7; keyNDEF.keyByte[4]=0xD3; keyNDEF.keyByte[5]=0xF7;
  for (byte i=0;i<6;i++) keyFactory.keyByte[i]=0xFF;

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);   // buzzer ACTIVO (2 pines): HIGH=suena, LOW=silencio
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
  rfid.PCD_AntennaOff();   // antena apagada hasta que se toque el TTP223 (ahorro)

  // SIM808: GPRS + GPS
  Serial2.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(3000);
  Serial.println("Iniciando SIM808...");
  modem.restart();
  modem.waitForNetwork(60000L);
  Serial.print("GPRS...");
  for (int i = 0; i < 6 && !modem.isGprsConnected(); i++) {
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
    if (modem.isGprsConnected()) break;
    Serial.print(".");
    delay(3000);
  }
  Serial.println(modem.isGprsConnected() ? "OK" : "FALLO");
  modem.enableGPS();   // GPS encendido (en el SIM808, GPS y GPRS conviven sin problema)

  // Abrir bearer GPRS para el motor HTTP nativo del SIM808
  enviarAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
  enviarAT("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"");
  enviarAT("AT+SAPBR=1,1", 10000);
  enviarAT("AT+SAPBR=2,1");

  // Tokens: respaldo inicial + primera descarga desde el TalkBack
  for (int i = 0; i < N_SEED && i < MAX_TOKENS; i++) tokensValidos[nTokensValidos++] = TOKENS_SEED[i];
  sincronizarTokens();
  ultimoSyncTokens = millis();

  // Lectura inicial de bateria (AT+CBC del SIM808)
  ultBat = modem.getBattPercent();
  Serial.printf("Bateria inicial: %d%%\n", ultBat);

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

  // ===== DIAGNOSTICO cada 2s: estado del touch y GPRS =====
  static unsigned long ultLog = 0;
  if (millis() - ultLog > 2000) {
    ultLog = millis();
    Serial.printf("[STATUS] Touch=%d  GPRS=%s\n",
      digitalRead(TOUCH_PIN), modem.isGprsConnected() ? "OK" : "NO");
  }

  // ===== RFID (solo cuando se toca el TTP223 - AHORRO) =====
  bool tocando = (digitalRead(TOUCH_PIN) == HIGH);
  static bool antenaOn = false;
  if (tocando && !antenaOn) { rfid.PCD_AntennaOn(); antenaOn = true; }
  if (!tocando && antenaOn) { rfid.PCD_AntennaOff(); antenaOn = false; }

  if (tocando && millis() - ultimaLectura > COOLDOWN_RFID) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      ultimaLectura = millis();
      String token = leerToken();
      Serial.println("Token: [" + token + "]");
      if (token.length() >= 4 && tokenAutorizado(token)) {
        beep(180);   // acceso concedido: 1 beep corto
        Serial.println("ACCESO CONCEDIDO");
        reportar(1, saludHW, "Acceso concedido");   // evento 1
        abrirSolenoide();
      } else {
        beep(150); delay(120); beep(150); delay(120); beep(150);   // denegado: 3 beeps
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
    if (millis() - ultimoCambio > 250) { ultimoCambio = millis(); sirena = !sirena; }
    digitalWrite(BUZZER_PIN, sirena ? HIGH : LOW);   // alarma: beep intermitente
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }

  // ===== SYNC de tokens autorizados (cada 60s) =====
  if (millis() - ultimoSyncTokens >= INTERVALO_SYNC_TOKENS) {
    ultimoSyncTokens = millis();
    sincronizarTokens();
  }

  // ===== TELEMETRIA periodica (GPS + bateria) =====
  if (millis() - ultimoPost >= INTERVALO_POST) {
    actualizarGPS();   // lee la posicion GPS y actualiza ultLat/ultLon (para la ruta)
    ultBat = modem.getBattPercent();
    postThingSpeak(0, saludHW, "heartbeat");
  }

  delay(100);
}
