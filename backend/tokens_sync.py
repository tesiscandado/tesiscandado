"""
Sincronizacion de tokens hacia el candado por ThingSpeak TalkBack.

El SIM808 no hace HTTPS confiable, pero SI hace HTTP a ThingSpeak. Por eso la
lista de tokens validos se publica en un TalkBack (cola de comandos de ThingSpeak):
el backend deja UN comando con la lista (CSV) y el ESP32 la descarga por HTTP cada
~60s y valida los tags localmente (offline).
"""
import os
import httpx
from datetime import datetime, timezone
from main import supabase

TB_ID  = os.getenv("TS_TALKBACK_ID",  "57245")
TB_KEY = os.getenv("TS_TALKBACK_KEY", "M2015WR5B484N7IG")

_BASE = f"https://api.thingspeak.com/talkbacks/{TB_ID}/commands"


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


def publicar_tokens(candado_id):
    """Reemplaza la cola del TalkBack por UN comando = lista CSV de tokens activos.
    El ESP32 lo lee con .../commands/last.txt (sin consumirlo). Nunca lanza excepcion."""
    csv = ",".join(_tokens_activos(candado_id))[:255]   # TalkBack: max 255 chars
    try:
        # Vaciar la cola (dejar solo la lista vigente)
        httpx.delete(f"{_BASE}.json", params={"api_key": TB_KEY}, timeout=10)
        if csv:
            httpx.post(f"{_BASE}.json", data={"api_key": TB_KEY, "command_string": csv}, timeout=10)
        return csv
    except Exception:
        return None
