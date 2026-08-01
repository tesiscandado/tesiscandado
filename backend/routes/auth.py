from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from main import supabase
import bcrypt
import jwt
import os
from datetime import datetime, timedelta, timezone

router = APIRouter()


class LoginInput(BaseModel):
    usuario: str
    password: str


@router.post("/seed-admins")
def seed_admins():
    """TEMPORAL: crea dos usuarios administradores (idempotente: si ya existen,
    no los duplica). Se elimina despues de usarlo una vez."""
    # Rol administrador (por nombre; si no, rol_id = 1 por convencion)
    admin_id = 1
    try:
        roles = supabase.table("roles").select("id, nombre").execute()
        for r in roles.data or []:
            if "admin" in (r.get("nombre") or "").lower():
                admin_id = r["id"]
                break
    except Exception:
        pass

    nuevos = [
        {"usuario": "ricardo", "password": "ricardo123", "nombre": "Ricardo"},
        {"usuario": "gianni",  "password": "gianni123",  "nombre": "Gianni"},
    ]
    creados, existentes = [], []
    for u in nuevos:
        ya = supabase.table("usuarios").select("id").ilike("usuario", u["usuario"]).execute()
        if ya.data:
            existentes.append(u["usuario"])
            continue
        ph = bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt()).decode()
        supabase.table("usuarios").insert({
            "rol_id":        admin_id,
            "usuario":       u["usuario"],
            "password_hash": ph,
            "nombre":        u["nombre"],
            "activo":        True,
        }).execute()
        creados.append(u["usuario"])
    return {"ok": True, "rol_admin_id": admin_id, "creados": creados, "ya_existian": existentes}


@router.post("/login")
def login(data: LoginInput):
    resultado = (
        supabase.table("usuarios")
        .select("id, nombre, usuario, password_hash, rol_id, activo, roles(nombre)")
        .ilike("usuario", data.usuario.strip())
        .single()
        .execute()
    )

    user = resultado.data
    if not user or not user["activo"]:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    rol = user["roles"]["nombre"]

    token = jwt.encode(
        {
            "sub": user["id"],
            "usuario": user["usuario"],
            "rol": rol,
            "exp": datetime.now(timezone.utc) + timedelta(hours=8),
        },
        os.getenv("JWT_SECRET"),
        algorithm="HS256",
    )

    return {
        "token":   token,
        "id":      user["id"],
        "nombre":  user["nombre"],
        "usuario": user["usuario"],
        "rol":     rol,
    }
