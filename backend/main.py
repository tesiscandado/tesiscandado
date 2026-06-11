from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client
import os

load_dotenv()

app = FastAPI(title="Candado Inteligente API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SECRET_KEY"),
)

from routes import eventos, auth, dashboard, autorizacion, candados, registros

app.include_router(auth.router,         prefix="/auth",         tags=["Auth"])
app.include_router(eventos.router,      prefix="/eventos",      tags=["Eventos"])
app.include_router(dashboard.router,    prefix="/dashboard",    tags=["Dashboard"])
app.include_router(autorizacion.router, prefix="/autorizacion", tags=["Autorización"])
app.include_router(candados.router,     prefix="/candados",     tags=["Candados"])
app.include_router(registros.router,    prefix="/registros",    tags=["Registros"])


@app.get("/")
def health_check():
    return {"status": "ok", "mensaje": "Candado Inteligente API corriendo"}
