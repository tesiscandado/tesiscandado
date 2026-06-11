from fastapi import APIRouter
from main import supabase
from typing import Optional

router = APIRouter()


@router.get("/accesos")
def registro_accesos(limite: int = 100, candado_id: Optional[int] = None):
    query = supabase.table("eventos").select(
        "id, ocurrido_en, tipos_evento(nombre, severidad, es_alarma), candados(descripcion)"
    ).order("ocurrido_en", desc=True).limit(limite)

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
