from fastapi import APIRouter
from main import supabase
from typing import Optional

router = APIRouter()


@router.get("/accesos")
def registro_accesos(limite: int = 100, candado_id: Optional[int] = None):
    # Solo eventos de intento de acceso (exitoso o denegado)
    tipos = supabase.table("tipos_evento").select("id").in_(
        "codigo", ["apertura_ok", "apertura_denegada", "intento_uid_invalido"]
    ).execute()
    ids = [t["id"] for t in tipos.data] if tipos.data else []

    query = supabase.table("eventos").select(
        "id, ocurrido_en, tipos_evento(nombre, severidad, es_alarma), candados(descripcion), credenciales(uid_nfc)"
    ).in_("tipo_evento_id", ids).order("ocurrido_en", desc=True).limit(limite)

    if candado_id:
        query = query.eq("candado_id", candado_id)

    res = query.execute()
    return res.data


@router.get("/alertas")
def registro_alertas(limite: int = 100):
    res = supabase.table("alarmas").select(
        "id, nivel, atendida, atendida_en, eventos(ocurrido_en, tipos_evento(nombre), candados(descripcion))"
    ).order("id", desc=True).limit(limite).execute()
    return res.data


@router.get("/sincronizaciones")
def registro_sincronizaciones():
    res = supabase.table("tokens_sincronizacion").select(
        "*, candados(descripcion), usuarios!tokens_sincronizacion_generado_por_fkey(nombre)"
    ).order("creado_en", desc=True).execute()
    return res.data
