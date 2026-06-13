/*
  PRUEBA SIM808 con ESP32 — GPRS (internet movil) + GPS
  Libreria: TinyGSM (instalar desde el Library Manager: "TinyGSM" by Volodymyr Shymanskyy)

  CONEXIONES (UART por hardware Serial2):
    SIM808 TXD  -> ESP32 GPIO16 (RX2)
    SIM808 RXD  -> ESP32 GPIO17 (TX2)
    SIM808 GND  -> ESP32 GND  (comun)
    SIM808 VCC  -> Fuente 3.7-4.2V (NO del ESP32, el SIM808 consume picos de 2A)
                   Usa una fuente/bateria aparte y une los GND.
    SIM808 KEY/PWR -> segun tu modulo, algunos encienden solos

  IMPORTANTE: pon una SIM con datos moviles y saldo, sin PIN.
*/

#define TINY_GSM_MODEM_SIM808
#include <TinyGsmClient.h>

// -------- CONFIG --------
#define SERIAL_MON Serial
#define SERIAL_AT  Serial2
#define PIN_RX 16   // RX2 del ESP32 <- TXD del SIM808
#define PIN_TX 17   // TX2 del ESP32 -> RXD del SIM808

// APN de tu operador (ejemplos):
//   Claro CO:  "internet.comcel.com.co"  user "" pass ""
//   Movistar:  "internet.movistar.com.co"
//   Tigo:      "web.colombiamovil.com.co"
const char apn[]      = "internet.comcel.com.co";
const char gprsUser[] = "";
const char gprsPass[] = "";

TinyGsm modem(SERIAL_AT);

void setup() {
  SERIAL_MON.begin(115200);
  delay(1000);

  // El SIM808 por defecto habla a 9600 baudios
  SERIAL_AT.begin(9600, SERIAL_8N1, PIN_RX, PIN_TX);
  delay(3000);

  SERIAL_MON.println("Inicializando modem SIM808...");
  modem.restart();

  String info = modem.getModemInfo();
  SERIAL_MON.print("Modem: ");
  SERIAL_MON.println(info);

  // ---- Esperar red celular ----
  SERIAL_MON.print("Esperando red GSM...");
  if (!modem.waitForNetwork(60000L)) {
    SERIAL_MON.println(" FALLO");
  } else {
    SERIAL_MON.println(" OK");
    SERIAL_MON.print("Senal (CSQ): ");
    SERIAL_MON.println(modem.getSignalQuality());
  }

  // ---- Conectar GPRS (internet movil) ----
  SERIAL_MON.print("Conectando GPRS con APN ");
  SERIAL_MON.print(apn);
  SERIAL_MON.print(" ...");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    SERIAL_MON.println(" FALLO");
  } else {
    SERIAL_MON.println(" OK");
    SERIAL_MON.print("IP local: ");
    SERIAL_MON.println(modem.getLocalIP());
  }

  // ---- Encender GPS ----
  SERIAL_MON.println("Encendiendo GPS...");
  modem.enableGPS();
  SERIAL_MON.println("GPS encendido. Coloca la antena con vista al cielo.");
}

void loop() {
  float lat = 0, lon = 0, speed = 0, alt = 0;
  int   vsat = 0, usat = 0;

  // getGPS devuelve true cuando ya tiene fix
  if (modem.getGPS(&lat, &lon, &speed, &alt, &vsat, &usat)) {
    SERIAL_MON.println("===== GPS FIX =====");
    SERIAL_MON.print("Latitud:  "); SERIAL_MON.println(lat, 6);
    SERIAL_MON.print("Longitud: "); SERIAL_MON.println(lon, 6);
    SERIAL_MON.print("Velocidad:"); SERIAL_MON.println(speed);
    SERIAL_MON.print("Altitud:  "); SERIAL_MON.println(alt);
    SERIAL_MON.print("Satelites:"); SERIAL_MON.println(usat);
    SERIAL_MON.println("===================");

    // ---- Aqui se enviaria la telemetria al backend ----
    // NOTA: el SIM808 NO habla HTTPS moderno, por eso no puede
    //       postear directo a https://tesiscandado.onrender.com
    //       Se necesita un endpoint HTTP intermedio (relay) o un
    //       servidor que acepte HTTP en puerto 80.
    //       Cuando lo tengamos, aqui va el POST /candados/telemetria
    //       con: codigo_dispositivo, latitud, longitud, nivel_bateria, estado_gsm

  } else {
    SERIAL_MON.println("Sin fix GPS todavia... (puede tardar 1-3 min al aire libre)");
  }

  delay(5000);
}
