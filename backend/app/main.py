import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .routers import collection, search

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sports Card Intel", version="0.1.0")

# ALLOWED_ORIGINS env var: comma-separated list of allowed frontend URLs
# e.g. "https://my-app.railway.app,http://localhost:3000"
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api")
app.include_router(collection.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
