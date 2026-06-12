from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from main import supabase
from datetime import datetime, timezone

router = APIRouter()


class ValidarTokenInput(BaseModel):
    token: str


def _registrar_acceso(codigo_evento, candado_id, operador_id=None):
    """Crea un evento de acceso (apertura_ok / apertura_denegada) enlazando el operador"""
    tipo = (
        supabase.table("tipos_evento")
        .select("id, es_alarma, severidad")
        .eq("codigo", codigo_evento)
        .limit(1)
        .execute()
    )
    if not tipo.data:
        return
    supabase.table("eventos").insert({
        "candado_id":     candado_id,
        "tipo_evento_id": tipo.data[0]["id"],
        "operador_id":    operador_id,
    }).execute()


@router.post("/validar")
def validar_token(data: ValidarTokenInput):
    res = (
        supabase.table("tokens_sincronizacion")
        .select("id, estado, candado_id, operador_id, valido_hasta, candados(descripcion)")
        .eq("token", data.token.strip().upper())
        .limit(1)
        .execute()
    )
    if not res.data:
        return {"acceso": False, "mensaje": "Token no reconocido"}

    token = res.data[0]
    candado_id = token["candado_id"]
    candado = token["candados"]["descripcion"] if token["candados"] else "Candado"

    # Verificar expiración por tiempo
    if token.get("valido_hasta"):
        try:
            vence = datetime.fromisoformat(token["valido_hasta"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > vence:
                if token["estado"] != "expirado":
                    supabase.table("tokens_sincronizacion").update(
                        {"estado": "expirado"}
                    ).eq("id", token["id"]).execute()
                _registrar_acceso("apertura_denegada", candado_id, token.get("operador_id"))
                return {"acceso": False, "mensaje": "Token expirado"}
        except (ValueError, AttributeError):
            pass

    if token["estado"] != "activo":
        _registrar_acceso("apertura_denegada", candado_id, token.get("operador_id"))
        return {"acceso": False, "mensaje": f"Token {token['estado']}"}

    # Acceso concedido — registrar evento con el operador
    _registrar_acceso("apertura_ok", candado_id, token.get("operador_id"))
    return {"acceso": True, "mensaje": f"Acceso concedido a {candado}"}


class EventoInput(BaseModel):
    codigo_dispositivo: str
    tipo_evento: str          # código del evento, ej: "apertura_ok"
    uid_nfc: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None


@router.post("/")
def recibir_evento(evento: EventoInput):
    # 1. Buscar el candado por su código
    res_candado = (
        supabase.table("candados")
        .select("id")
        .eq("codigo_dispositivo", evento.codigo_dispositivo)
        .single()
        .execute()
    )
    if not res_candado.data:
        raise HTTPException(status_code=404, detail="Dispositivo no registrado")
    candado_id = res_candado.data["id"]

    # 2. Buscar el tipo de evento
    res_tipo = (
        supabase.table("tipos_evento")
        .select("id, es_alarma, severidad")
        .eq("codigo", evento.tipo_evento)
        .single()
        .execute()
    )
    if not res_tipo.data:
        raise HTTPException(status_code=400, detail="Tipo de evento desconocido")
    tipo = res_tipo.data

    # 3. Buscar credencial si viene UID
    credencial_id = None
    if evento.uid_nfc:
        res_cred = (
            supabase.table("credenciales")
            .select("id")
            .eq("uid_nfc", evento.uid_nfc)
            .single()
            .execute()
        )
        if res_cred.data:
            credencial_id = res_cred.data["id"]

    # 4. Insertar el evento
    nuevo_evento = (
        supabase.table("eventos")
        .insert({
            "candado_id": candado_id,
            "tipo_evento_id": tipo["id"],
            "credencial_id": credencial_id,
            "latitud": evento.latitud,
            "longitud": evento.longitud,
        })
        .execute()
    )
    evento_id = nuevo_evento.data[0]["id"]

    # 5. Si es alarma, crear fila en alarmas
    if tipo["es_alarma"]:
        supabase.table("alarmas").insert({
            "evento_id": evento_id,
            "nivel": tipo["severidad"],
        }).execute()

    # 6. Actualizar última conexión del candado
    supabase.table("candados").update({
        "ultima_conexion": datetime.now(timezone.utc).isoformat(),
    }).eq("id", candado_id).execute()

    return {"ok": True, "evento_id": evento_id, "alarma": tipo["es_alarma"]}


@router.get("/")
def listar_eventos(limite: int = 50):
    res = (
        supabase.table("eventos")
        .select("*, candados(codigo_dispositivo, descripcion), tipos_evento(nombre, severidad), credenciales(uid_nfc, operadores(nombre))")
        .order("ocurrido_en", desc=True)
        .limit(limite)
        .execute()
    )
    return res.data
