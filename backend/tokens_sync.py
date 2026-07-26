"""
Sincronizacion de tokens hacia el candado por ThingSpeak TalkBack.

El SIM808 no hace HTTPS confiable, pero SI hace HTTP a ThingSpeak. Por eso la
lista de tokens validos se publica en un TalkBack (cola de comandos de ThingSpeak):
el backend deja UN comando con la lista (CSV) y el ESP32 la descarga por HTTP cada
~60s y valida los tags localmente (offline).
"""
import os
import time
import threading
import httpx
from datetime import datetime, timezone
from main import supabase

TB_ID  = os.getenv("TS_TALKBACK_ID",  "57245")
TB_KEY = os.getenv("TS_TALKBACK_KEY", "M2015WR5B484N7IG")

_BASE = f"https://api.thingspeak.com/talkbacks/{TB_ID}/commands"

# ── Auto-sanacion del TalkBack ───────────────────────────────
# Un publish puede fallar (ThingSpeak caido, timeout) y dejar en el TalkBack una
# lista VIEJA que aun incluye un token ya expirado/revocado. Para que el candado
# no siga aceptandolo, el backend REAFIRMA periodicamente en el TalkBack la lista
# vigente segun la BD (llamado desde el sync). Esto converge el TalkBack al estado
# real en <=_REPUBLISH_MIN_INTERVALO aunque un publish puntual haya fallado.
_ultimo_publish   = {}          # candado_id -> time.monotonic() del ultimo publish OK
_loc_guard_hasta  = {}          # candado_id -> monotonic hasta el que NO republicar (proteger un LOC)
_publish_lock     = threading.Lock()
_REPUBLISH_MIN_INTERVALO = 60   # s entre republicados de auto-sanacion
_LOC_GUARD_S             = 30   # s que se protege un LOC recien emitido de ser pisado


def _tokens_activos(candado_id):
    """Tokens en estado 'activo' (y no vencidos) de un candado."""
    res = (
        supabase.table("tokens_sincronizacion")
        .select("token, valido_hasta")
        .eq("candado_id", candado_id)
        .eq("estado", "activo")
        .execute()
    )
    ahora = datetime.now(timezone.utc)
    toks = []
    for t in res.data or []:
        if not t.get("token"):
            continue
        vh = t.get("valido_hasta")
        if vh:
            try:
                if ahora > datetime.fromisoformat(vh.replace("Z", "+00:00")):
                    continue   # vencido: no se incluye
            except (ValueError, AttributeError):
                pass
        toks.append(t["token"])
    return toks


def _gps_activo(candado_id):
    """True si el candado tiene una ruta en curso (estado='activa'):
    el ESP32 debe encender el GPS y reportar posicion."""
    try:
        res = (
            supabase.table("rutas")
            .select("id")
            .eq("candado_id", candado_id)
            .eq("estado", "activa")
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception:
        return False   # si la tabla aun no existe, GPS apagado


def publicar_tokens(candado_id, extra=None):
    """Reemplaza la cola del TalkBack por UN comando = CSV con los tokens activos
    MAS el estado del GPS como ultimo elemento ('GPS:1' ruta activa / 'GPS:0' no).
    Se agrega al final para que un firmware viejo lo trate como un token invalido
    inofensivo. El ESP32 lo lee con commands.json (sin consumirlo).

    'extra' agrega un comando adicional al final (ej: 'LOC:1736300000' para
    solicitar ubicacion on-demand) SIN perder la lista de tokens.
    Nunca lanza excepcion."""
    partes = _tokens_activos(candado_id)
    partes.append("GPS:1" if _gps_activo(candado_id) else "GPS:0")
    if extra:
        partes.append(extra)
        if str(extra).startswith("LOC:"):
            # Un LOC recien emitido no debe ser pisado por el republicado periodico
            _loc_guard_hasta[candado_id] = time.monotonic() + _LOC_GUARD_S
    csv = ",".join(partes)[:255]   # TalkBack: max 255 chars

    # delete-all + post-one, VERIFICANDO la respuesta y con 1 reintento: antes se
    # ignoraba el resultado, asi que un fallo silencioso dejaba la lista vieja (con
    # el token expirado) en el candado. El ESP32 lee el comando MAS RECIENTE, asi
    # que aunque quede algun comando viejo, prevalece este.
    for _intento in range(2):
        try:
            httpx.delete(f"{_BASE}.json", params={"api_key": TB_KEY}, timeout=10)
            p = httpx.post(f"{_BASE}.json", data={"api_key": TB_KEY, "command_string": csv}, timeout=10)
            if p.status_code in (200, 201):
                _ultimo_publish[candado_id] = time.monotonic()
                return csv
        except Exception:
            pass
        time.sleep(0.4)
    return None


def republicar_si_necesario(candado_id):
    """Auto-sanacion: reafirma en el TalkBack la lista vigente de tokens (segun la
    BD). Throttled a 1/_REPUBLISH_MIN_INTERVALO y sin pisar un LOC reciente.
    Nunca lanza excepcion. Se llama desde el sync de ThingSpeak."""
    ahora = time.monotonic()
    if ahora < _loc_guard_hasta.get(candado_id, 0):
        return
    if ahora - _ultimo_publish.get(candado_id, 0) < _REPUBLISH_MIN_INTERVALO:
        return
    if not _publish_lock.acquire(blocking=False):
        return
    try:
        publicar_tokens(candado_id)
    except Exception:
        pass
    finally:
        _publish_lock.release()
