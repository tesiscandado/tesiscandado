from fastapi import APIRouter
from main import supabase
from datetime import datetime, timezone

router = APIRouter()


@router.get("/")
def resumen():
    # Sincroniza con ThingSpeak (GPRS) antes de mostrar; nunca rompe el dashboard
    try:
        from routes.thingspeak import sync_thingspeak
        sync_thingspeak()
    except Exception:
        pass

    candados = supabase.table("candados").select("*").execute()
    from routes.candados import _con_estado_conexion
    _con_estado_conexion(candados.data)
    total_candados = len(candados.data)
    # "activos" = reportando ahora mismo (no solo que alguna vez se conectaron)
    activos = [c for c in candados.data if c.get("en_linea")]

    # Total operadores
    rol_op = supabase.table("roles").select("id").eq("nombre", "operador").single().execute()
    total_operadores = 0
    if rol_op.data:
        res_op = supabase.table("usuarios").select("id", count="exact").eq("rol_id", rol_op.data["id"]).execute()
        total_operadores = res_op.count or 0

    # Accesos del día
    hoy = datetime.now(timezone.utc).date().isoformat()
    tipo_apertura = supabase.table("tipos_evento").select("id").eq("codigo", "apertura_ok").single().execute()
    accesos_hoy = 0
    intentos_fallidos = 0

    if tipo_apertura.data:
        res = supabase.table("eventos").select("id", count="exact").eq("tipo_evento_id", tipo_apertura.data["id"]).gte("ocurrido_en", f"{hoy}T00:00:00Z").execute()
        accesos_hoy = res.count or 0

    tipos_fallidos = supabase.table("tipos_evento").select("id").in_("codigo", ["apertura_denegada", "intento_uid_invalido"]).execute()
    if tipos_fallidos.data:
        for t in tipos_fallidos.data:
            res = supabase.table("eventos").select("id", count="exact").eq("tipo_evento_id", t["id"]).gte("ocurrido_en", f"{hoy}T00:00:00Z").execute()
            intentos_fallidos += res.count or 0

    # Alarmas activas
    alarmas = supabase.table("alarmas").select(
        "id, nivel, atendida, eventos(ocurrido_en, candados(descripcion), tipos_evento(nombre))"
    ).eq("atendida", False).execute()

    # Estado general
    if any(a["nivel"] == 3 for a in alarmas.data):
        estado_general = "alarma"
    elif any(a["nivel"] == 2 for a in alarmas.data):
        estado_general = "advertencia"
    else:
        estado_general = "normal"

    # Eventos recientes
    eventos_recientes = (
        supabase.table("eventos")
        .select("id, ocurrido_en, latitud, longitud, tipos_evento(nombre, severidad), candados(descripcion)")
        .order("ocurrido_en", desc=True)
        .limit(50)
        .execute()
    )

    return {
        "indicadores": {
            "total_candados":    total_candados,
            "candados_activos":  len(activos),
            "total_operadores":  total_operadores,
            "accesos_hoy":       accesos_hoy,
            "intentos_fallidos": intentos_fallidos,
            "alarmas_activas":   len(alarmas.data),
        },
        "estado_general":   estado_general,
        "candados":         candados.data,
        "alarmas_activas":  alarmas.data,
        "eventos_recientes": eventos_recientes.data,
    }
