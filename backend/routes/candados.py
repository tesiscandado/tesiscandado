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
