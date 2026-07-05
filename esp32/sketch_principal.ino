/*
  CANDADO INTELIGENTE - Sketch principal ESP32 (SOLO GPRS, sin WiFi)
  Conectividad: SIM808 por GPRS -> ThingSpeak (HTTP)
  El backend de Render lee ThingSpeak y traduce a eventos/alarmas.

  Reporta a ThingSpeak:
    field1=latitud  field2=longitud  field3=bateria
    field4=evento   field5=salud(fallo hw)  field6=solenoide(0/1)
    status=mensaje legible

  Codigos evento (field4): 1=apertura_ok 2=apertura_denegada
    10=reed 12=impacto 13=forcejeo 14=resuelta
  Codigos salud (field5):  0=ok 1=fallo_rfid 2=fallo_acel 3=fallo_solenoide

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

  --- ADXL345 (acelerometro, I2C) ---
    SDA -> GPIO21    SCL -> GPIO22    VCC -> 3.3V    GND -> GND
    CS  -> 3.3V (fuerza modo I2C)
    SDO/ALT ADDRESS -> GND (direccion 0x53)

  --- Sensor HALL KY-024 (reemplaza al REED danado) ---
    A0 -> GPIO26    VCC -> 3.3V    GND -> GND    (D0 sin usar)
    Se usa la salida ANALOGICA: el umbral se controla por software (no
    depende del potenciometro). Sin iman el hall entrega ~VCC/2; con el
    iman cerca la lectura se aleja de ese centro (sube o baja segun el polo).
    CALIBRACION: mira "Hall=" en el [STATUS] del Monitor Serie con y sin
    iman, y ajusta HALL_UMBRAL_ON/OFF si hace falta.

  --- Buzzer (modulo 3 pines, ACTIVO EN LOW) ---
    VCC -> 3.3V    GND -> GND    I/O -> GPIO25
    (I/O en LOW = suena, I/O en HIGH = silencio)

  --- TTP223B (touch capacitivo) ---
    I/O -> GPIO33    VCC -> 3.3V    GND -> GND
    (debe dar HIGH al tocar. Modo momentaneo.)

  --- XY-J02 (modulo temporizador relay) ---
    Trigger -> GPIO13     GND_T -> GND del ESP32  (referencia del disparo!)
    6~30V   -> +12V (boost)   GND -> GND
    COM -> +12V    NO -> Solenoide(+)    Solenoide(-) -> GND
    Configurar modo OP, tiempo 3.0s. Diodo flyback 1N4007 en el solenoide.

  --- ALIMENTACION ---
    Bateria LiPo 1S -> alimenta ESP32, SIM808, RC522, ADXL345, sensores
    Boost 3.7V->12V -> alimenta el modulo XY-J02 y el solenoide
    TODOS los GND unidos (comun)
  =====================================================================
*/

#define TINY_GSM_MODEM_SIM808
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <TinyGsmClient.h>

// -------------------------
// CONFIG GPRS / THINGSPEAK
// -------------------------
const char APN[]       = "internet.tuenti.ec";  // Tuenti Ecuador
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
#define HALL_PIN 26       // KY-024 salida A0 (analogica; reemplaza al sensor REED)
#define BUZZER_PIN 25
#define RELAY_PIN 13      // XY-J02: pin IN (controla el solenoide)
#define TOUCH_PIN 33      // TTP223B: pin OUT (HIGH al tocar)

// El XY-J02 suele ser ACTIVO EN BAJO (IN=LOW -> relay ON).
// Si tu modulo activa al reves, cambia a true.
#define RELAY_ACTIVO_ALTO false
#define RELAY_ON  (RELAY_ACTIVO_ALTO ? HIGH : LOW)
#define RELAY_OFF (RELAY_ACTIVO_ALTO ? LOW  : HIGH)

// Modulo buzzer de 3 pines: ACTIVO EN BAJO (I/O=LOW -> suena)
#define BUZZER_ON  LOW
#define BUZZER_OFF HIGH

// KY-024 por A0 (analogico, 12 bits: 0-4095). Sin iman la lectura ronda el
// centro (~VCC/2 = ~2048); con el iman pegado se aleja del centro.
// CALIBRAR viendo "Hall=" en el [STATUS]: anota la lectura SIN iman (neutral)
// y CON iman, y deja los umbrales entre medio (ON > OFF = histeresis).
const int HALL_NEUTRAL    = 2048;  // lectura aproximada sin iman
const int HALL_UMBRAL_ON  = 400;   // |lectura-neutral| mayor  -> iman PRESENTE
const int HALL_UMBRAL_OFF = 250;   // |lectura-neutral| menor  -> iman AUSENTE

// true = iman presente = candado CERRADO (con histeresis para no parpadear)
bool imanEstado = true;   // arranca asumiendo cerrado
bool imanPresente() {
  int d = abs(analogRead(HALL_PIN) - HALL_NEUTRAL);
  if (d > HALL_UMBRAL_ON)       imanEstado = true;
  else if (d < HALL_UMBRAL_OFF) imanEstado = false;
  return imanEstado;   // entre OFF y ON conserva el estado anterior
}

// -------------------------
// ADXL345 (acelerometro I2C, direccion 0x53)
// -------------------------
const int ADXL345_ADDR = 0x53;

void adxlInit() {
  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(0x2D);  // registro POWER_CTL
  Wire.write(0x08);  // bit "Measure" activado (sale de standby)
  Wire.endTransmission(true);
}

bool adxlTestConnection() {
  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(0x00);  // registro DEVID
  Wire.endTransmission(false);
  Wire.requestFrom(ADXL345_ADDR, 1, true);
  if (Wire.available()) {
    return (Wire.read() == 0xE5);   // DEVID esperado del ADXL345
  }
  return false;
}

// Devuelve false si la lectura I2C fallo (asi no se usan datos basura).
bool adxlGetAcceleration(int16_t *x, int16_t *y, int16_t *z) {
  Wire.beginTransmission(ADXL345_ADDR);
  Wire.write(0x32);  // registro inicial DATAX0
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(ADXL345_ADDR, 6, true) != 6) return false;
  // Leer en variables temporales: el orden de evaluacion de dos Wire.read()
  // dentro de una misma expresion NO esta garantizado (podia invertir bytes).
  byte xl = Wire.read(), xh = Wire.read();
  byte yl = Wire.read(), yh = Wire.read();
  byte zl = Wire.read(), zh = Wire.read();
  *x = (int16_t)(xl | (xh << 8));
  *y = (int16_t)(yl | (yh << 8));
  *z = (int16_t)(zl | (zh << 8));
  return true;
}

// -------------------------
// OBJETOS
// -------------------------
MFRC522 rfid(SS_PIN, RST_PIN);
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
// Cada 3 min (antes 60s): cada peticion GPRS gasta bateria. Un token nuevo
// tarda hasta 3 min en activarse en el candado (aceptable).
const unsigned long INTERVALO_SYNC_TOKENS = 180000;

// -------------------------
// ESTADO
// -------------------------
int reedEstadoAnt = 1;
int16_t axAnt, ayAnt, azAnt;

// Umbrales recalibrados para ADXL345 (rango ~ -256..256 en reposo, 1g).
// AJUSTA estos valores viendo el Monitor Serial: en reposo la diferencia
// entre lecturas deberia ser baja (decenas); un golpe fuerte sube mucho mas.
const long UMBRAL_GOLPE = 500, UMBRAL_IMPACTO = 900;

unsigned long inicioVentana = 0;
int contadorEventos = 0;
bool reedAlerta = false, mpuAlerta = false;
unsigned long tiempoMpuAlerta = 0;
const unsigned long TIMEOUT_MPU = 10000;

unsigned long ultimaLectura = 0;
const unsigned long COOLDOWN_RFID = 3000;

// Telemetria / posting
float ultLat = 0, ultLon = 0;
int   ultBat = 0;
unsigned long ultimoPost = 0;
// Heartbeat (GPS+bateria) cada 3 min (antes 60s) para AHORRAR BATERIA:
// cada post por GPRS enciende la radio del SIM808 varios segundos.
// Las ALARMAS y ACCESOS se siguen reportando AL INSTANTE (no les afecta).
const unsigned long INTERVALO_POST = 180000;
const unsigned long MIN_ENTRE_POST = 16000;   // ThingSpeak: min 15s
int  saludHW = 0;          // 0=ok 1=rfid 2=acelerometro 3=solenoide
bool solenoideAbierto = false;

// GPS bajo demanda (AHORRO DE BATERIA): el GPS arranca APAGADO y solo se
// enciende cuando el admin inicia una ruta desde la pagina web. El backend
// publica GPS:1 / GPS:0 como ultimo elemento del comando del TalkBack.
bool gpsActivo = false;

// fallos detectados
bool falloRFID = false, falloMPU = false;

// -------------------------
// EVENTO PENDIENTE (cola de 1)
// ThingSpeak solo acepta 1 update cada 15s. Un evento que caiga dentro de esa
// ventana (o durante una caida de GPRS) queda PENDIENTE y se envia apenas se
// pueda (antes se perdia para siempre y nunca llegaba al dashboard).
// -------------------------
int    eventoPendiente = -1;   // -1 = nada pendiente
int    saludPendiente  = 0;
String statusPendiente = "";

// accesos (1,2) y alarmas (10-13) pesan mas que "resuelta" (14) o salud (0)
bool esPrioritario(int ev) { return ev >= 1 && ev <= 13; }

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
    static unsigned long ultimoAvisoSinGPRS = 0;
    if (millis() - ultimoAvisoSinGPRS > 15000) {   // avisa max cada 15s
      Serial.println("Sin GPRS, post omitido");
      ultimoAvisoSinGPRS = millis();
    }
    ultimoPost = millis();   // actualiza igual, para que reportar() respete su limite de espera
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
// Si fue hace menos de 15s (o no hay GPRS), queda EN COLA y se envia despues.
void reportar(int evento, int salud, const char* status) {
  if (millis() - ultimoPost < MIN_ENTRE_POST) {
    // un evento prioritario en cola no se pisa con uno menor
    if (eventoPendiente < 0 || esPrioritario(evento) || !esPrioritario(eventoPendiente)) {
      eventoPendiente = evento; saludPendiente = salud; statusPendiente = String(status);
      Serial.printf("Evento %d en cola (ThingSpeak admite 1 post cada 15s)\n", evento);
    }
    return;
  }
  if (!postThingSpeak(evento, salud, status)) {
    // fallo el envio (ej: sin GPRS): dejarlo en cola para reintentar
    if (eventoPendiente < 0 || esPrioritario(evento) || !esPrioritario(eventoPendiente)) {
      eventoPendiente = evento; saludPendiente = salud; statusPendiente = String(status);
      Serial.printf("Evento %d en cola (post fallido, se reintenta)\n", evento);
    }
  }
}

// -------------------------
// BUZZER (modulo 3 pines, activo en LOW)
// -------------------------
void beep(int ms) {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(ms);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

// -------------------------
// SOLENOIDE
// -------------------------
void abrirSolenoide() {
  // El modulo temporizador XY-J02 maneja los 3s de apertura.
  // El ESP32 solo manda un PULSO corto en Trigger.
  solenoideAbierto = true;
  Serial.println("Disparando solenoide (pulso 300ms en el relay)...");
  digitalWrite(RELAY_PIN, RELAY_ON);
  delay(300);                          // pulso de disparo
  digitalWrite(RELAY_PIN, RELAY_OFF);

  // Confirmar apertura con el sensor magnetico durante la ventana del temporizador
  unsigned long t = millis();
  bool confirmo = false;
  while (millis() - t < 3000) {
    if (!imanPresente()) { confirmo = true; break; }   // iman se alejo = abrio
    delay(50);
  }
  if (!confirmo) {
    saludHW = 3; // fallo_solenoide: se disparo pero el sensor no confirmo apertura
    Serial.println("FALLO SOLENOIDE: no confirmo apertura");
    reportar(0, 3, "Solenoide no confirmo apertura");
  }
  // Resincronizar el sensor: la puerta quedo abierta por un acceso AUTORIZADO.
  // Sin esto, el loop la detectaba como alarma de apertura (falsa alarma).
  reedEstadoAnt = imanPresente();
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

// Encender/apagar el GPS segun lo ordene la pagina web (via TalkBack)
void aplicarEstadoGPS(bool activar) {
  if (activar == gpsActivo) return;   // sin cambio
  gpsActivo = activar;
  if (activar) {
    modem.enableGPS();
    Serial.println(">>> RUTA INICIADA: GPS encendido (reporta posicion cada 3 min)");
  } else {
    modem.disableGPS();
    ultLat = 0; ultLon = 0;   // no reportar coordenadas viejas con el GPS apagado
    Serial.println(">>> RUTA DETENIDA: GPS apagado (ahorro de bateria)");
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

  // Separar el CSV en la lista. El ultimo elemento puede ser el estado del
  // GPS que ordena la pagina web: "GPS:1" (ruta activa) o "GPS:0" (apagado).
  int n = 0, ini = 0;
  bool gpsVisto = false, gpsValor = false;
  while (ini <= (int)cuerpo.length() && n < MAX_TOKENS) {
    int coma = cuerpo.indexOf(',', ini);
    if (coma < 0) coma = cuerpo.length();
    String tk = cuerpo.substring(ini, coma); tk.trim();
    if (tk.startsWith("GPS:")) {
      gpsVisto = true;
      gpsValor = (tk.substring(4).toInt() == 1);
    } else if (tk.length() > 0) {
      tokensValidos[n++] = tk;
    }
    ini = coma + 1;
  }
  nTokensValidos = n;
  Serial.printf("Tokens sincronizados: %d\n", nTokensValidos);
  if (gpsVisto) aplicarEstadoGPS(gpsValor);
}

// -------------------------
// SETUP
// -------------------------
void setup() {
  Serial.begin(115200);
  // HALL_PIN se lee con analogRead (no necesita pinMode)
  pinMode(TOUCH_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_OFF);   // relay apagado al iniciar

  keyNDEF.keyByte[0]=0xD3; keyNDEF.keyByte[1]=0xF7; keyNDEF.keyByte[2]=0xD3;
  keyNDEF.keyByte[3]=0xF7; keyNDEF.keyByte[4]=0xD3; keyNDEF.keyByte[5]=0xF7;
  for (byte i=0;i<6;i++) keyFactory.keyByte[i]=0xFF;

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);   // buzzer apagado al iniciar (activo en LOW)
  delay(500);

  // ADXL345
  Wire.begin(21, 22);
  adxlInit();
  if (!adxlTestConnection()) { falloMPU = true; Serial.println("FALLO ADXL345"); }
  else { adxlGetAcceleration(&axAnt, &ayAnt, &azAnt); }

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
  for (int i = 0; i < 10 && !modem.isGprsConnected(); i++) {
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
    if (modem.isGprsConnected()) break;
    Serial.print(".");
    delay(5000);
  }
  Serial.println(modem.isGprsConnected() ? "OK" : "FALLO");
  // GPS APAGADO al arrancar (ahorro de bateria). Solo se enciende cuando el
  // admin inicia una ruta en la pagina web (llega GPS:1 por el TalkBack;
  // si el candado se reinicia en plena ruta, el proximo sync lo reactiva).
  modem.disableGPS();

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
  if (falloMPU)  reportar(0, 2, "ADXL345 no responde");

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
    Serial.printf("[STATUS] Touch=%d  GPRS=%s  GPS=%s  Hall=%d (%s)\n",
      digitalRead(TOUCH_PIN), modem.isGprsConnected() ? "OK" : "NO",
      gpsActivo ? "ON" : "OFF",
      analogRead(HALL_PIN), imanPresente() ? "iman" : "SIN iman");
  }

  // ===== RFID (solo cuando se toca el TTP223 - AHORRO) =====
  bool tocando = (digitalRead(TOUCH_PIN) == HIGH);
  static bool antenaOn = false;
  if (tocando && !antenaOn) {
    // Re-inicializar el RC522: algunos modulos clon quedan "mudos" tras
    // apagar/encender la antena. Asi arranca en estado limpio.
    rfid.PCD_Init();
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    rfid.PCD_AntennaOn(); antenaOn = true;
    byte ver = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    Serial.printf("TTP223 tocado -> antena RFID ON (RC522 ver=0x%02X%s), acerca la tarjeta\n",
      ver, (ver == 0x00 || ver == 0xFF) ? " = NO RESPONDE, revisa cableado SPI" : "");
  }
  if (!tocando && antenaOn) {
    rfid.PCD_AntennaOff(); antenaOn = false;
    Serial.println("TTP223 soltado -> antena RFID OFF");
  }

  if (tocando && millis() - ultimaLectura > COOLDOWN_RFID) {
    if (!rfid.PICC_IsNewCardPresent()) {
      // sin tarjeta nueva en el campo (normal entre toques)
    } else if (!rfid.PICC_ReadCardSerial()) {
      Serial.println("Tarjeta presente pero NO se pudo leer (acercala mas)");
    } else {
      ultimaLectura = millis();
      String uidStr = "";
      for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
        uidStr += String(rfid.uid.uidByte[i], HEX);
      }
      uidStr.toUpperCase();
      Serial.println("Tarjeta detectada -> UID: " + uidStr);
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

  // ===== SENSOR MAGNETICO (HALL KY-024, antes REED) =====
  bool reedDetecta = imanPresente();   // true = iman presente = cerrado
  if (reedEstadoAnt != reedDetecta) {
    if (!reedDetecta && !solenoideAbierto) {
      reedAlerta = true;
      Serial.println("ALERTA APERTURA (hall)");
      reportar(10, saludHW, "Puerta abierta sin autorizacion");
    } else if (reedDetecta && reedAlerta) {
      // solo reportar "resuelta" si de verdad habia una alarma activa
      reedAlerta = false;
      if (!mpuAlerta) reportar(14, saludHW, "Alarma resuelta");
    }
    reedEstadoAnt = reedDetecta;
  }

  // ===== ADXL345 (acelerometro) =====
  // Se omite si fallo al arrancar o si la lectura I2C falla (datos basura
  // podian disparar falsas alarmas de impacto).
  if (!falloMPU) {
    int16_t ax, ay, az;
    if (adxlGetAcceleration(&ax, &ay, &az)) {
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
  }

  if (mpuAlerta && (millis() - tiempoMpuAlerta >= TIMEOUT_MPU)) {
    mpuAlerta = false; contadorEventos = 0; inicioVentana = millis();
    if (!reedAlerta) reportar(14, saludHW, "Alarma resuelta");
  }
  if (millis() - inicioVentana >= 5000) {
    if (contadorEventos >= 5) {
      mpuAlerta = true; tiempoMpuAlerta = millis();
      reportar(13, saludHW, "Forcejeo detectado");
    }
    contadorEventos = 0; inicioVentana = millis();
  }

  // ===== BUZZER (activo en LOW) =====
  bool alarma = reedAlerta || mpuAlerta;
  static unsigned long ultimoCambio = 0; static bool sirena = false;
  if (alarma) {
    if (millis() - ultimoCambio > 250) { ultimoCambio = millis(); sirena = !sirena; }
    digitalWrite(BUZZER_PIN, sirena ? BUZZER_ON : BUZZER_OFF);   // alarma: beep intermitente
  } else {
    digitalWrite(BUZZER_PIN, BUZZER_OFF);
  }

  // ===== EVENTO PENDIENTE: enviarlo apenas se libere la ventana de 15s =====
  static unsigned long ultimoIntentoPend = 0;
  if (eventoPendiente >= 0
      && millis() - ultimoPost >= MIN_ENTRE_POST
      && millis() - ultimoIntentoPend > 5000) {   // reintento max cada 5s si falla
    ultimoIntentoPend = millis();
    if (postThingSpeak(eventoPendiente, saludPendiente, statusPendiente.c_str())) {
      eventoPendiente = -1;
    }
  }

  // ===== REINTENTO GPRS (cada 30s si esta caido) =====
  static unsigned long ultimoReintentoGPRS = 0;
  if (!modem.isGprsConnected() && millis() - ultimoReintentoGPRS > 30000) {
    ultimoReintentoGPRS = millis();
    Serial.println("Reintentando GPRS...");
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
    if (modem.isGprsConnected()) {
      Serial.println("GPRS reconectado");
      // Reabrir el bearer nativo del SIM808 para el motor HTTP
      enviarAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"");
      enviarAT("AT+SAPBR=3,1,\"APN\",\"" + String(APN) + "\"");
      enviarAT("AT+SAPBR=1,1", 10000);
    }
  }

  // ===== SYNC de tokens autorizados (cada 60s) =====
  if (millis() - ultimoSyncTokens >= INTERVALO_SYNC_TOKENS) {
    ultimoSyncTokens = millis();
    sincronizarTokens();
  }

  // ===== TELEMETRIA periodica (bateria; GPS solo con ruta activa) =====
  if (millis() - ultimoPost >= INTERVALO_POST) {
    if (gpsActivo) actualizarGPS();   // posicion solo durante una ruta
    ultBat = modem.getBattPercent();
    postThingSpeak(0, saludHW, "heartbeat");
  }

  delay(100);
}
