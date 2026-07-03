"""
Integración con ThingSpeak.
El SIM808 (GPRS) postea por HTTP a ThingSpeak. El backend lee el canal por HTTPS
y traduce los datos a coordenadas, eventos y alarmas en la base de datos.

Mapeo de campos del canal:
  field1 = latitud      field4 = evento (codigo)
  field2 = longitud     field5 = salud  (codigo de fallo de hardware)
  field3 = bateria      field6 = solenoide (0/1)
"""
import os
import time
import threading
import httpx
from fastapi import APIRouter
from main import supabase
from datetime import datetime, timezone

router = APIRouter()

# Throttle: no sincronizar mas seguido que esto (segundos)
# Reducido a 3s para que no se pierdan eventos entre polling (10s del dashboard)
_SYNC_MIN_INTERVALO = 3
_ultimo_sync = 0
_sync_lock = threading.Lock()

TS_CHANNEL  = os.getenv("TS_CHANNEL",  "3407489")
TS_READ_KEY = os.getenv("TS_READ_KEY", "NB2O3UZFC04YAOIH")
TS_CODIGO   = os.getenv("TS_CODIGO",   "ESP32-001")  # candado asociado al canal

# Codigo numerico (field4) -> codigo de tipo_evento
EVENTO_MAP = {
    1:  "apertura_ok",
    2:  "apertura_denegada",
    10: "alarma_reed",
    11: "alarma_hall",
    12: "alarma_impacto",
    13: "alarma_forcejeo",
    14: "alarma_resuelta",
}

# Codigo de salud (field5) -> tipo_evento de fallo
SALUD_MAP = {
    1: "fallo_rfid",
    2: "fallo_mpu",
    3: "fallo_solenoide",
}


def _crear_evento(candado_id, codigo_evento, lat=None, lon=None):
    tipo = (
        supabase.table("tipos_evento")
        .select("id, es_alarma, severidad")
        .eq("codigo", codigo_evento)
        .limit(1)
        .execute()
    )
    if not tipo.data:
        return
    t = tipo.data[0]
    fila = {"candado_id": candado_id, "tipo_evento_id": t["id"]}
    # Guardar coordenadas en el evento: sirven para marcar la ruta como peligrosa
    # (marcado automatico) en el punto exacto donde salto la alarma.
    if lat is not None:
        fila["latitud"] = lat
    if lon is not None:
        fila["longitud"] = lon
    ev = supabase.table("eventos").insert(fila).execute()
    if t.get("es_alarma") and ev.data:
        supabase.table("alarmas").insert({
            "evento_id": ev.data[0]["id"],
            "nivel":     t.get("severidad") or 2,
        }).execute()


def _num(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


@router.get("/sync")
def sync_thingspeak():
    """Lee el canal de ThingSpeak y actualiza el candado (coordenadas, bateria,
    solenoide) y crea los eventos/alarmas nuevos. Evita duplicados con ts_entry.
    Limitado (throttle) para no saturar el cliente de Supabase."""
    global _ultimo_sync
    # Si otra petición ya sincronizó hace poco, o hay una en curso, salir
    if not _sync_lock.acquire(blocking=False):
        return {"ok": True, "throttled": "en curso"}
    try:
        if time.time() - _ultimo_sync < _SYNC_MIN_INTERVALO:
            return {"ok": True, "throttled": True}
        _ultimo_sync = time.time()
        return _hacer_sync()
    finally:
        _sync_lock.release()


def _hacer_sync():
    cand = (
        supabase.table("candados")
        .select("id, ts_entry")
        .eq("codigo_dispositivo", TS_CODIGO)
        .limit(1)
        .execute()
    )
    if not cand.data:
        return {"ok": False, "error": "candado no encontrado"}

    candado_id = cand.data[0]["id"]
    last_entry = cand.data[0].get("ts_entry") or 0

    url = (
        f"https://api.thingspeak.com/channels/{TS_CHANNEL}/feeds.json"
        f"?api_key={TS_READ_KEY}&results=50"
    )
    try:
        r = httpx.get(url, timeout=10)
        data = r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}

    feeds = data.get("feeds", []) if isinstance(data, dict) else []
    procesados = 0
    max_entry  = last_entry
    ult_lat = ult_lon = ult_bat = ult_sol = None

    for f in feeds:
        eid = f.get("entry_id", 0) or 0

        # Guardar ultimos valores conocidos (aunque ya esten procesados)
        if _num(f.get("field1")) is not None: ult_lat = _num(f.get("field1"))
        if _num(f.get("field2")) is not None: ult_lon = _num(f.get("field2"))
        if _num(f.get("field3")) is not None: ult_bat = int(_num(f.get("field3")))
        if _num(f.get("field6")) is not None: ult_sol = int(_num(f.get("field6")))

        if eid <= last_entry:
            continue

        lat_f = _num(f.get("field1"))
        lon_f = _num(f.get("field2"))

        # NUEVO: guardar el punto en la ruta (rastro GPS del recorrido)
        if lat_f is not None and lon_f is not None:
            pos = {"candado_id": candado_id, "latitud": lat_f, "longitud": lon_f}
            if f.get("created_at"):
                pos["capturado_en"] = f.get("created_at")
            supabase.table("posiciones").insert(pos).execute()

        # Eventos nuevos (las alarmas se guardan con las coordenadas del punto)
        ev_code  = int(_num(f.get("field4"))) if _num(f.get("field4")) is not None else 0
        sal_code = int(_num(f.get("field5"))) if _num(f.get("field5")) is not None else 0

        if ev_code in EVENTO_MAP:
            _crear_evento(candado_id, EVENTO_MAP[ev_code], lat_f, lon_f)
            procesados += 1
        if sal_code in SALUD_MAP:
            _crear_evento(candado_id, SALUD_MAP[sal_code], lat_f, lon_f)
            procesados += 1

        if eid > max_entry:
            max_entry = eid

    cambios = {
        "ultima_conexion": datetime.now(timezone.utc).isoformat(),
        "ts_entry":        max_entry,
        "estado_gsm":      "ok",
    }
    if ult_lat is not None: cambios["latitud"] = ult_lat
    if ult_lon is not None: cambios["longitud"] = ult_lon
    if ult_bat is not None: cambios["nivel_bateria"] = ult_bat
    if ult_sol is not None: cambios["estado_solenoide"] = "abierto" if ult_sol == 1 else "cerrado"

    supabase.table("candados").update(cambios).eq("id", candado_id).execute()

    return {"ok": True, "procesados": procesados, "ultimo_entry": max_entry}
