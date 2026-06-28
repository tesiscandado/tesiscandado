/*
  PRUEBA RC522 (RFID) - ESP8266 NodeMCU
  Verifica que el lector responde, muestra el UID y lee el token (texto NDEF
  del bloque 4) que graba la app. Sirve para confirmar el cableado del RC522.

  CONEXIONES (iguales al sketch principal):
    SDA/SS -> D4     SCK -> D5     MOSI -> D7     MISO -> D6
    RST    -> D8     VCC -> 3.3V   GND -> GND     (¡el RC522 es de 3.3V!)

  Monitor Serie a 115200.
*/
#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN  D4    // GPIO2
#define RST_PIN D8    // GPIO15

MFRC522 rfid(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key keyNDEF;     // clave de tarjetas formateadas NDEF
MFRC522::MIFARE_Key keyFactory;  // clave de fabrica (FF FF FF FF FF FF)

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
    if (!autenticarBloque(4)) return "(no se pudo autenticar el bloque 4)";
    byte buffer[18]; byte size = sizeof(buffer);
    if (rfid.MIFARE_Read(4, buffer, &size) != MFRC522::STATUS_OK) return "(no se pudo leer el bloque 4)";
    for (byte i = 0; i < 14; i++) {
      if (buffer[i] == 0x54) {                 // 0x54 = registro de texto NDEF
        byte langLen = buffer[i + 1] & 0x3F;
        byte ini = i + 2 + langLen;
        for (byte j = ini; j < 16; j++) {
          if (buffer[j] == 0xFE || buffer[j] == 0x00) break;
          if (buffer[j] >= 32 && buffer[j] <= 126) texto += (char)buffer[j];
        }
        break;
      }
    }
    if (texto.length() == 0) texto = "(sin texto NDEF en el bloque 4)";
  } else {
    texto = "(tarjeta no MIFARE Classic)";
  }
  texto.trim();
  return texto;
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== PRUEBA RC522 (ESP8266) ===");

  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);

  for (byte i = 0; i < 6; i++) keyFactory.keyByte[i] = 0xFF;
  keyNDEF.keyByte[0]=0xD3; keyNDEF.keyByte[1]=0xF7; keyNDEF.keyByte[2]=0xD3;
  keyNDEF.keyByte[3]=0xF7; keyNDEF.keyByte[4]=0xD3; keyNDEF.keyByte[5]=0xF7;

  // DIAGNOSTICO: version del chip -> dice si el cableado esta bien
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.print("Version del RC522: 0x"); Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println(">> FALLO: el RC522 NO responde.");
    Serial.println("   Revisa: SPI (SCK=D5, MISO=D6, MOSI=D7), SS=D4, RST=D8, y que VCC sea 3.3V.");
  } else {
    Serial.println(">> RC522 OK (normalmente responde 0x91 o 0x92). Acerca una tarjeta/tag...");
  }
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  Serial.println("-------------------------------");
  Serial.println("Tarjeta detectada!");
  Serial.println("UID:   " + uid);
  Serial.print  ("Tipo:  "); Serial.println(rfid.PICC_GetTypeName(rfid.PICC_GetType(rfid.uid.sak)));
  Serial.println("Token: [" + leerToken() + "]");
  Serial.println("-------------------------------");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1500);
}
