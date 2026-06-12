from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from main import supabase
import secrets

router = APIRouter()


# ── Modelos ──────────────────────────────────────────────────
class OperadorInput(BaseModel):
    usuario:  str
    password: str
    nombre:   str
    telefono: Optional[str] = None
    cargo:    Optional[str] = None

class OperadorUpdate(BaseModel):
    nombre:   str
    telefono: Optional[str] = None
    cargo:    Optional[str] = None

class TokenFisicoInput(BaseModel):
    candado_id: int
    etiqueta:   str      # nombre de la tarjeta, ej: "Tarjeta Portón"
    token:      str      # texto guardado en bloque 4 del tag

class TokenAppInput(BaseModel):
    candado_id:  int
    operador_id: int     # usuario con rol operador

class AutorizacionInput(BaseModel):
    candado_id:    int
    token_id:      int
    valido_desde:  Optional[str] = None
    valido_hasta:  Optional[str] = None


# ── Operadores ───────────────────────────────────────────────
@router.get("/operadores")
def listar_operadores():
    # Obtener el id del rol operador
    rol = supabase.table("roles").select("id").eq("nombre", "operador").single().execute()
    if not rol.data:
        return []
    res = supabase.table("usuarios").select("*").eq("rol_id", rol.data["id"]).execute()
    return res.data


@router.post("/operadores")
def crear_operador(data: OperadorInput):
    import bcrypt
    rol = supabase.table("roles").select("id").eq("nombre", "operador").single().execute()
    if not rol.data:
        raise HTTPException(status_code=400, detail="Rol operador no encontrado")

    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()

    res = supabase.table("usuarios").insert({
        "rol_id":        rol.data["id"],
        "usuario":       data.usuario,
        "password_hash": password_hash,
        "nombre":        data.nombre,
        "telefono":      data.telefono,
        "cargo":         data.cargo,
    }).execute()
    return res.data[0]


@router.put("/operadores/{id}")
def editar_operador(id: int, data: OperadorUpdate):
    res = supabase.table("usuarios").update({
        "nombre":   data.nombre,
        "telefono": data.telefono,
        "cargo":    data.cargo,
    }).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return res.data[0]


@router.patch("/operadores/{id}/estado")
def toggle_operador(id: int, activo: bool):
    res = supabase.table("usuarios").update({"activo": activo}).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return res.data[0]


@router.delete("/operadores/{id}")
def eliminar_operador(id: int):
    supabase.table("usuarios").delete().eq("id", id).execute()
    return {"ok": True}


# ── Tokens ───────────────────────────────────────────────────
@router.get("/tokens")
def listar_tokens():
    res = supabase.table("tokens_sincronizacion").select(
        "*, candados(descripcion, codigo_dispositivo), usuarios!tokens_sincronizacion_operador_id_fkey(nombre, usuario)"
    ).order("creado_en", desc=True).execute()
    return res.data


@router.post("/tokens/fisico")
def crear_token_fisico(data: TokenFisicoInput):
    """Token estático — texto guardado en bloque 4 del tag RFID físico"""
    # Normalizar: mayúsculas, sin espacios, exactamente 7 caracteres alfanuméricos
    token = data.token.strip().upper()
    if len(token) != 7 or not token.isalnum():
        raise HTTPException(status_code=400, detail="El token debe tener 7 caracteres alfanuméricos")

    # Verificar que no exista ese token ya
    existe = supabase.table("tokens_sincronizacion").select("id").eq("token", token).execute()
    if existe.data:
        raise HTTPException(status_code=400, detail="Ese token ya está registrado")

    admin = supabase.table("usuarios").select("id").eq("rol_id", 1).single().execute()

    res = supabase.table("tokens_sincronizacion").insert({
        "candado_id":   data.candado_id,
        "token":        token,
        "etiqueta":     data.etiqueta,
        "tipo":         "rfid_fisico",
        "estado":       "activo",
        "generado_por": admin.data["id"],
    }).execute()
    return res.data[0]


@router.post("/tokens/app")
def crear_token_app(data: TokenAppInput):
    """Token dinámico — generado para operador que usa emulación NFC desde celular"""
    admin = supabase.table("usuarios").select("id").eq("rol_id", 1).single().execute()

    # Generar token único de 7 caracteres (cabe en el bloque 4 del tag)
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    token = "".join(secrets.choice(alfabeto) for _ in range(7))
    while supabase.table("tokens_sincronizacion").select("id").eq("token", token).execute().data:
        token = "".join(secrets.choice(alfabeto) for _ in range(7))

    res = supabase.table("tokens_sincronizacion").insert({
        "candado_id":   data.candado_id,
        "token":        token,
        "tipo":         "app_nfc",
        "estado":       "pendiente",
        "operador_id":  data.operador_id,
        "generado_por": admin.data["id"],
    }).execute()
    return res.data[0]


@router.patch("/tokens/{id}/estado")
def cambiar_estado_token(id: int, estado: str):
    if estado not in ("activo", "pendiente", "expirado"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    res = supabase.table("tokens_sincronizacion").update({"estado": estado}).eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Token no encontrado")
    return res.data[0]


@router.delete("/tokens/{id}")
def eliminar_token(id: int):
    supabase.table("tokens_sincronizacion").delete().eq("id", id).execute()
    return {"ok": True}


@router.get("/tokens/operador/{operador_id}")
def token_del_operador(operador_id: int):
    """Endpoint que usa la app móvil para obtener los tokens del operador
    (pendientes y activos, no expirados)"""
    res = supabase.table("tokens_sincronizacion").select(
        "id, token, estado, etiqueta, candados(descripcion)"
    ).eq("operador_id", operador_id).eq("tipo", "app_nfc").in_(
        "estado", ["pendiente", "activo"]
    ).order("creado_en", desc=True).execute()
    return res.data
