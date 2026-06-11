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
