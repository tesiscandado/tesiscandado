from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from main import supabase

router = APIRouter()


class CandadoInput(BaseModel):
    codigo_dispositivo: str
    descripcion:        Optional[str] = None
    sim_numero:         Optional[str] = None


class TelemetriaInput(BaseModel):
    codigo_dispositivo: str
    latitud:        Optional[float] = None
    longitud:       Optional[float] = None
    nivel_bateria:  Optional[int]   = None
    estado_gsm:     Optional[str]   = None
    estado_rfid:    Optional[str]   = None
    estado_solenoide: Optional[str] = None


class EtiquetaRutaInput(BaseModel):
    nivel:     str                      # 'segura' | 'media' | 'peligrosa' | 'limpiar'
    ids:       Optional[list[int]] = None   # puntos concretos a etiquetar
    desde_id:  Optional[int] = None         # o un rango (inicio del tramo)
    hasta_id:  Optional[int] = None         # ...fin del tramo


class DetenerRutaInput(BaseModel):
    guardar: bool = True                # False = descartar la ruta y sus puntos
    nombre:  Optional[str] = None       # nombre con el que se guarda


# ── Candados ─────────────────────────────────────────────────
# El candado reporta (heartbeat) cada 90s; si lleva mas de 3 min sin reportar
# se considera DESCONECTADO. El umbral (3 min) es mayor que el heartbeat (90s)
# para tolerar un latido perdido sin marcar falso "desconectado".
# El frontend refresca cada 30s, así que lo nota en máximo ~3.5 min.
_UMBRAL_DESCONECTADO_MIN = 3


def _con_estado_conexion(candados):
    from datetime import datetime, timezone, timedelta
    ahora = datetime.now(timezone.utc)
    for c in candados:
        en_linea = False
        uc = c.get("ultima_conexion")
        if uc:
            try:
                # Soportar formatos ISO con Z o con +00:00
                uc_str = str(uc).replace("Z", "+00:00").split(".")[0] + "+00:00"  # eliminar microsegundos si los hay
                dt = datetime.fromisoformat(uc_str)
                # Asegurar que dt es aware (con timezone)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                diferencia = ahora - dt
                en_linea = diferencia < timedelta(minutes=_UMBRAL_DESCONECTADO_MIN)
            except (ValueError, AttributeError, TypeError) as e:
                # Si falla el parsing, asumir DESCONECTADO (not en_linea = False)
                en_linea = False
        c["en_linea"] = en_linea
    return candados


@router.get("/")
def listar_candados():
    # Sincroniza con ThingSpeak antes de listar; nunca rompe la respuesta
    try:
        from routes.thingspeak import sync_thingspeak
        sync_thingspeak()
    except Exception:
        pass
    res = supabase.table("candados").select("*").order("id").execute()
    return _con_estado_conexion(res.data)


@router.post("/")
def crear_candado(data: CandadoInput):
    res = supabase.table("candados").insert({
        "codigo_dispositivo": data.codigo_dispositivo,
        "descripcion":        data.descripcion,
        "sim_numero":         data.sim_numero,
    }).execute()
    return res.data[0]


@router.put("/{id}")
def editar_candado(id: int, data: CandadoInput):
    res = supabase.table("candados").update({
        "codigo_dispositivo": data.codigo_dispositivo,
        "descripcion":        data.descripcion,
        "sim_numero":         data.sim_numero,
    }).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Candado no encontrado")
    return res.data[0]


@router.delete("/{id}")
def eliminar_candado(id: int):
    supabase.table("candados").delete().eq("id", id).execute()
    return {"ok": True}


# ── Telemetría del dispositivo (SIM808: coordenadas, batería, GSM) ──
@router.post("/telemetria")
def recibir_telemetria(data: TelemetriaInput):
    from datetime import datetime, timezone
    cambios = {
        "ultima_conexion": datetime.now(timezone.utc).isoformat(),
    }
    if data.latitud is not None:        cambios["latitud"] = data.latitud
    if data.longitud is not None:       cambios["longitud"] = data.longitud
    if data.nivel_bateria is not None:  cambios["nivel_bateria"] = data.nivel_bateria
    if data.estado_gsm is not None:     cambios["estado_gsm"] = data.estado_gsm
    if data.estado_rfid is not None:    cambios["estado_rfid"] = data.estado_rfid
    if data.estado_solenoide is not None: cambios["estado_solenoide"] = data.estado_solenoide

    res = (
        supabase.table("candados")
        .update(cambios)
        .eq("codigo_dispositivo", data.codigo_dispositivo)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    return {"ok": True}


# ── Solicitud de ubicación on-demand ─────────────────────────
@router.post("/{id}/solicitar-ubicacion")
def solicitar_ubicacion(id: int):
    """La página pide ubicación actual (on-demand). Publica en el TalkBack la
    lista de tokens vigente + 'LOC:<nonce>': el ESP32 la ve en su próxima
    sincronización (cada 20s); si el GPS ya tiene fix reporta al instante,
    si no, en cuanto lo consiga. El nonce evita que el candado repita la
    captura en cada sync."""
    from datetime import datetime, timezone
    from tokens_sync import publicar_tokens

    res = supabase.table("candados").select("id").eq("id", id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Candado no encontrado")

    ahora = datetime.now(timezone.utc)
    csv = publicar_tokens(id, extra=f"LOC:{int(ahora.timestamp())}")
    if csv is None:
        raise HTTPException(status_code=502, detail="No se pudo publicar en ThingSpeak")
    return {"ok": True, "solicitado_en": ahora.isoformat()}


@router.get("/{id}/ubicacion-actual")
def ubicacion_actual(id: int, desde: str = None):
    """Última posición GPS del candado. Con ?desde=<ISO> solo devuelve una
    posición capturada DESPUÉS de ese momento (para saber si el candado
    respondió a una solicitud de ubicación, y no mostrar coordenadas viejas)."""
    try:
        from routes.thingspeak import sync_thingspeak
        sync_thingspeak()
    except Exception:
        pass

    q = (
        supabase.table("posiciones")
        .select("latitud, longitud, capturado_en")
        .eq("candado_id", id)
        .order("capturado_en", desc=True)
        .limit(1)
    )
    if desde:
        q = q.gt("capturado_en", desde)
    res = q.execute()
    if res.data:
        return {"fresca": True, **res.data[0]}
    return {"fresca": False}


@router.get("/{id}/ubicaciones")
def ultimas_ubicaciones(id: int, limite: int = 20):
    """Últimas N posiciones GPS del candado (más recientes primero), para
    mostrar el historial reciente en un mini-mapa desde la página de Candados."""
    try:
        from routes.thingspeak import sync_thingspeak
        sync_thingspeak()
    except Exception:
        pass
    res = (
        supabase.table("posiciones")
        .select("id, latitud, longitud, capturado_en")
        .eq("candado_id", id)
        .order("capturado_en", desc=True)
        .limit(limite)
        .execute()
    )
    return res.data or []


@router.get("/comando/{codigo}")
def consultar_comando(codigo: str):
    """El ESP32 consulta si hay una orden pendiente (ej: enviar ubicación).
    Al consultarla, el flag se consume (se pone en false)."""
    res = supabase.table("candados").select(
        "id, solicitar_ubicacion"
    ).eq("codigo_dispositivo", codigo).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")

    candado = res.data[0]
    pedir = bool(candado.get("solicitar_ubicacion"))
    if pedir:
        supabase.table("candados").update(
            {"solicitar_ubicacion": False}
        ).eq("id", candado["id"]).execute()
    return {"solicitar_ubicacion": pedir}


# ── Alertas por candado ──────────────────────────────────────
@router.get("/{id}/alertas")
def alertas_por_candado(id: int):
    # Buscar eventos de este candado que generaron alarma
    res = supabase.table("alarmas").select(
        "id, nivel, atendida, atendida_en, eventos(id, ocurrido_en, tipos_evento(nombre, severidad), candado_id)"
    ).execute()

    # Filtrar por candado
    alertas = [a for a in res.data if a.get("eventos", {}).get("candado_id") == id]
    return alertas


@router.patch("/alarmas/{id}/atender")
def atender_alarma(id: int):
    from datetime import datetime, timezone
    # Tomar el primer administrador (rol_id = 1); si no hay, dejar nulo
    admin = supabase.table("usuarios").select("id").eq("rol_id", 1).limit(1).execute()
    admin_id = admin.data[0]["id"] if admin.data else None
    res = supabase.table("alarmas").update({
        "atendida":     True,
        "atendido_por": admin_id,
        "atendida_en":  datetime.now(timezone.utc).isoformat(),
    }).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Alarma no encontrada")
    return res.data[0]


# ── RUTA / RECORRIDO del candado ─────────────────────────────
@router.get("/{id}/ruta")
def ruta_candado(id: int, limite: int = 2000):
    """Devuelve el recorrido (rastro GPS ordenado) de un candado y los puntos
    donde ocurrieron alarmas (para el marcado automatico de peligro)."""
    # Sincroniza con ThingSpeak para traer los puntos mas recientes
    try:
        from routes.thingspeak import sync_thingspeak
        sync_thingspeak()
    except Exception:
        pass

    # Ruta activa (control del GPS): la pagina muestra Iniciar/Detener segun esto.
    # Se consulta ANTES que los puntos: si hay una ruta en curso, la vista "en
    # vivo" se limita a lo capturado desde que inicio, en vez de mezclar todo
    # el historial de posiciones (incluyendo rutas viejas ya guardadas).
    ruta_activa = None
    try:
        act = (
            supabase.table("rutas")
            .select("id, nombre, iniciada_en")
            .eq("candado_id", id)
            .eq("estado", "activa")
            .limit(1)
            .execute()
        )
        ruta_activa = act.data[0] if act.data else None
    except Exception:
        pass   # tabla rutas aun no creada

    q_puntos = (
        supabase.table("posiciones")
        .select("id, latitud, longitud, capturado_en, nivel_seguridad")
        .eq("candado_id", id)
    )
    if ruta_activa and ruta_activa.get("iniciada_en"):
        q_puntos = q_puntos.gte("capturado_en", ruta_activa["iniciada_en"])
    puntos = q_puntos.order("capturado_en").limit(limite).execute()

    # Alarmas NO ATENDIDAS con coordenadas: al atenderlas desde el dashboard
    # desaparecen del mapa en vivo (antes se mostraban todas las historicas).
    alarmas = []
    res_al = (
        supabase.table("alarmas")
        .select("id, atendida, eventos(id, latitud, longitud, ocurrido_en, candado_id, tipos_evento(nombre, severidad))")
        .eq("atendida", False)
        .gte("nivel", 2)   # al mapa solo alarmas de peligro (no avisos nivel 1
                           # como "Intento de apertura autorizado")
        .execute()
    )
    for a in res_al.data or []:
        ev = a.get("eventos") or {}
        if ev.get("candado_id") == id and ev.get("latitud") is not None:
            alarmas.append({
                "id":           ev["id"],
                "latitud":      ev["latitud"],
                "longitud":     ev["longitud"],
                "ocurrido_en":  ev.get("ocurrido_en"),
                "tipos_evento": ev.get("tipos_evento"),
            })
    alarmas.sort(key=lambda x: x.get("ocurrido_en") or "")

    return {"puntos": puntos.data, "alarmas": alarmas, "ruta_activa": ruta_activa}


@router.patch("/{id}/ruta/etiqueta")
def etiquetar_ruta(id: int, data: EtiquetaRutaInput):
    """Marca un tramo de la ruta como segura / media / peligrosa.
    Acepta una lista de ids de puntos, o un rango (desde_id, hasta_id)."""
    if data.nivel not in ("segura", "media", "peligrosa", "limpiar"):
        raise HTTPException(status_code=400, detail="Nivel invalido")

    valor = None if data.nivel == "limpiar" else data.nivel
    q = supabase.table("posiciones").update({"nivel_seguridad": valor}).eq("candado_id", id)

    if data.ids:
        q = q.in_("id", data.ids)
    elif data.desde_id is not None and data.hasta_id is not None:
        lo, hi = min(data.desde_id, data.hasta_id), max(data.desde_id, data.hasta_id)
        q = q.gte("id", lo).lte("id", hi)
    else:
        raise HTTPException(status_code=400, detail="Indica 'ids' o un rango (desde_id, hasta_id)")

    res = q.execute()
    return {"ok": True, "actualizados": len(res.data) if res.data else 0}


@router.delete("/{id}/ruta")
def borrar_ruta(id: int):
    """Borra todo el rastro de un candado (util para empezar una prueba limpia)."""
    supabase.table("posiciones").delete().eq("candado_id", id).execute()
    return {"ok": True}


@router.post("/{id}/ruta/demo")
def ruta_demo(id: int, lat: float = 4.711000, lon: float = -74.072100, n: int = 30):
    """Inserta un recorrido de PRUEBA (para desarrollar la vista sin el hardware).
    Genera n puntos encadenados a partir de un centro (por defecto, Bogota)."""
    import random
    from datetime import datetime, timezone, timedelta
    base = datetime.now(timezone.utc) - timedelta(minutes=n)
    filas = []
    clat, clon = lat, lon
    for i in range(n):
        clat += random.uniform(-0.0006, 0.0011)
        clon += random.uniform(-0.0006, 0.0011)
        filas.append({
            "candado_id":   id,
            "latitud":      round(clat, 6),
            "longitud":     round(clon, 6),
            "capturado_en": (base + timedelta(minutes=i)).isoformat(),
        })
    supabase.table("posiciones").insert(filas).execute()
    return {"ok": True, "insertados": len(filas)}


@router.post("/{id}/sync-tokens")
def sync_tokens(id: int):
    """Publica manualmente la lista de tokens activos del candado en el TalkBack
    de ThingSpeak (lo que el ESP32 descargara). Util para probar."""
    from tokens_sync import publicar_tokens
    csv = publicar_tokens(id)
    if csv is None:
        raise HTTPException(status_code=502, detail="No se pudo publicar en ThingSpeak")
    return {"ok": True, "tokens": csv.split(",") if csv else []}


# ── CONTROL DE RUTA (agrupar el rastro GPS en un recorrido con nombre) ──
# El GPS del candado esta siempre encendido; iniciar/detener ruta ya no lo
# prende ni apaga. El admin inicia una ruta desde la pagina: se crea una fila
# 'activa' en rutas y desde ahi la vista "en vivo" (GET /{id}/ruta) se limita
# a los puntos capturados desde ese momento. GPS:1/GPS:0 se sigue publicando
# en el TalkBack por compatibilidad, pero el ESP32 lo ignora para encender o
# apagar el GPS (ver aplicarEstadoGPS en el firmware).

@router.post("/{id}/ruta/iniciar")
def iniciar_ruta(id: int):
    act = (
        supabase.table("rutas").select("id")
        .eq("candado_id", id).eq("estado", "activa").limit(1).execute()
    )
    if act.data:
        return {"ok": True, "ruta_id": act.data[0]["id"], "ya_activa": True}

    res = supabase.table("rutas").insert({"candado_id": id, "estado": "activa"}).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="No se pudo crear la ruta")

    from tokens_sync import publicar_tokens
    publicar_tokens(id)   # publica GPS:1 (compatibilidad; el candado ya reporta igual)
    return {"ok": True, "ruta_id": res.data[0]["id"]}


@router.post("/{id}/ruta/detener")
def detener_ruta(id: int, data: DetenerRutaInput):
    from datetime import datetime, timezone
    act = (
        supabase.table("rutas").select("id, iniciada_en")
        .eq("candado_id", id).eq("estado", "activa").limit(1).execute()
    )
    if not act.data:
        raise HTTPException(status_code=404, detail="No hay ruta activa para este candado")
    ruta_id = act.data[0]["id"]

    if data.guardar:
        nombre = data.nombre or f"Ruta {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')}"
        supabase.table("rutas").update({
            "estado": "guardada",
            "nombre": nombre,
            "finalizada_en": datetime.now(timezone.utc).isoformat(),
        }).eq("id", ruta_id).execute()
    else:
        # Descartada: se borran sus puntos para no ensuciar el mapa en vivo
        supabase.table("rutas").update({
            "estado": "descartada",
            "finalizada_en": datetime.now(timezone.utc).isoformat(),
        }).eq("id", ruta_id).execute()
        supabase.table("posiciones").delete().eq("ruta_id", ruta_id).execute()

    from tokens_sync import publicar_tokens
    publicar_tokens(id)   # publica GPS:0 (compatibilidad; el candado no lo apaga)
    return {"ok": True, "ruta_id": ruta_id, "guardada": data.guardar}


@router.get("/{id}/rutas")
def listar_rutas(id: int):
    """Rutas guardadas del candado (mas la activa, si hay), recientes primero."""
    res = (
        supabase.table("rutas")
        .select("id, nombre, estado, iniciada_en, finalizada_en")
        .eq("candado_id", id)
        .in_("estado", ["activa", "guardada"])
        .order("iniciada_en", desc=True)
        .execute()
    )
    return res.data


@router.get("/{id}/rutas/{ruta_id}")
def ver_ruta_guardada(id: int, ruta_id: int):
    """Puntos y alarmas de una ruta guardada, para verla en el mapa."""
    ruta = (
        supabase.table("rutas").select("id, nombre, estado, iniciada_en, finalizada_en")
        .eq("id", ruta_id).eq("candado_id", id).limit(1).execute()
    )
    if not ruta.data:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    r = ruta.data[0]

    puntos = (
        supabase.table("posiciones")
        .select("id, latitud, longitud, capturado_en, nivel_seguridad")
        .eq("ruta_id", ruta_id)
        .order("capturado_en")
        .execute()
    )

    # Alarmas ocurridas durante la ruta (entre inicio y fin). Solo severidad
    # 2+ (peligro real): los avisos de acceso autorizado no marcan la ruta.
    alarmas = []
    tipos = (
        supabase.table("tipos_evento").select("id")
        .eq("es_alarma", True).gte("severidad", 2).execute()
    )
    ids_alarma = [t["id"] for t in tipos.data] if tipos.data else []
    if ids_alarma and r.get("iniciada_en"):
        q = (
            supabase.table("eventos")
            .select("id, latitud, longitud, ocurrido_en, tipos_evento(nombre, severidad)")
            .eq("candado_id", id)
            .in_("tipo_evento_id", ids_alarma)
            .not_.is_("latitud", "null")
            .gte("ocurrido_en", r["iniciada_en"])
        )
        if r.get("finalizada_en"):
            q = q.lte("ocurrido_en", r["finalizada_en"])
        alarmas = q.order("ocurrido_en").execute().data

    return {"ruta": r, "puntos": puntos.data, "alarmas": alarmas}
