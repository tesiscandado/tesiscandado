from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from main import supabase

router = APIRouter()


class CandadoInput(BaseModel):
    codigo_dispositivo: str
    descripcion:        Optional[str] = None
    sim_numero:         Optional[str] = None


# ── Candados ─────────────────────────────────────────────────
@router.get("/")
def listar_candados():
    res = supabase.table("candados").select("*").order("id").execute()
    return res.data


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
    admin = supabase.table("usuarios").select("id").eq("usuario", "admin").single().execute()
    res = supabase.table("alarmas").update({
        "atendida":     True,
        "atendido_por": admin.data["id"],
        "atendida_en":  datetime.now(timezone.utc).isoformat(),
    }).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Alarma no encontrada")
    return res.data[0]
