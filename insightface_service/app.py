"""
InsightFace API Wrapper Service
================================
Servizio FastAPI che espone endpoint compatibili con CompreFace
per permettere una migrazione trasparente.

Endpoints implementati:
- POST /api/v1/recognition/recognize - Riconoscimento 1:N
- POST /api/v1/recognition/faces - Aggiunta volto
- GET  /api/v1/recognition/faces - Lista volti
- DELETE /api/v1/recognition/faces - Elimina tutti i volti di un soggetto
- DELETE /api/v1/recognition/faces/{image_id} - Elimina singolo volto
- GET  /api/v1/recognition/faces/{image_id}/img - Ottieni immagine
- GET  /api/v1/recognition/subjects - Lista soggetti
- POST /api/v1/recognition/subjects - Crea soggetto
- DELETE /api/v1/recognition/subjects/{subject} - Elimina soggetto
- PUT  /api/v1/recognition/subjects/{subject} - Rinomina soggetto
"""

import os
import uuid
import pickle
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, Query, HTTPException, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from insightface.app import FaceAnalysis

# ============================================
# CONFIGURAZIONE
# ============================================

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("InsightFaceAPI")

# Configurazione da environment (legge dal .env centralizzato)
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.5"))
DETECTION_THRESHOLD = float(os.getenv("DETECTION_THRESHOLD", "0.5"))
MODEL_NAME = os.getenv("MODEL_NAME", "buffalo_l")
DET_SIZE = int(os.getenv("DET_SIZE", "640"))

# Percorsi dati persistenti
DATA_DIR = Path("/app/data")
EMBEDDINGS_DB_PATH = DATA_DIR / "embeddings.pkl"
IMAGES_DIR = DATA_DIR / "images"

# Crea directory se non esistono
DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

# ============================================
# DATABASE IN-MEMORY CON PERSISTENZA
# ============================================

class FaceDatabase:
    """
    Database per gestire embeddings e metadati dei volti.
    Struttura:
    {
        "subjects": {
            "subject_name": {
                "faces": {
                    "image_id": {
                        "embedding": np.ndarray,
                        "added_at": datetime,
                        "image_path": str
                    }
                }
            }
        }
    }
    """
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.data: Dict[str, Dict] = {"subjects": {}}
        self.load()
    
    def load(self):
        """Carica il database da disco"""
        if self.db_path.exists():
            try:
                with open(self.db_path, "rb") as f:
                    self.data = pickle.load(f)
                logger.info(f"Database caricato: {len(self.data['subjects'])} soggetti")
            except Exception as e:
                logger.error(f"Errore caricamento database: {e}")
                self.data = {"subjects": {}}
        else:
            logger.info("Database vuoto inizializzato")
    
    def save(self):
        """Salva il database su disco"""
        try:
            with open(self.db_path, "wb") as f:
                pickle.dump(self.data, f)
            logger.info("Database salvato su disco")
        except Exception as e:
            logger.error(f"Errore salvataggio database: {e}")
    
    def list_subjects(self) -> List[str]:
        """Ritorna lista dei soggetti"""
        return list(self.data["subjects"].keys())
    
    def subject_exists(self, subject: str) -> bool:
        """Verifica se un soggetto esiste"""
        return subject in self.data["subjects"]
    
    def add_subject(self, subject: str) -> bool:
        """Aggiunge un nuovo soggetto"""
        if self.subject_exists(subject):
            return False
        self.data["subjects"][subject] = {"faces": {}}
        self.save()
        return True
    
    def delete_subject(self, subject: str) -> bool:
        """Elimina un soggetto e tutte le sue immagini"""
        if not self.subject_exists(subject):
            return False
        
        # Elimina le immagini dal filesystem
        for image_id, face_data in self.data["subjects"][subject]["faces"].items():
            image_path = Path(face_data.get("image_path", ""))
            if image_path.exists():
                try:
                    image_path.unlink()
                except Exception as e:
                    logger.warning(f"Errore eliminazione immagine {image_path}: {e}")
        
        del self.data["subjects"][subject]
        self.save()
        return True
    
    def rename_subject(self, old_name: str, new_name: str) -> bool:
        """Rinomina un soggetto"""
        if not self.subject_exists(old_name):
            return False
        if self.subject_exists(new_name):
            return False
        
        self.data["subjects"][new_name] = self.data["subjects"].pop(old_name)
        self.save()
        return True
    
    def add_face(self, subject: str, embedding: np.ndarray, image_path: str) -> str:
        """Aggiunge un volto a un soggetto"""
        if not self.subject_exists(subject):
            self.add_subject(subject)
        
        image_id = str(uuid.uuid4())
        self.data["subjects"][subject]["faces"][image_id] = {
            "embedding": embedding,
            "added_at": datetime.now().isoformat(),
            "image_path": image_path
        }
        self.save()
        return image_id
    
    def delete_face(self, image_id: str) -> Optional[str]:
        """Elimina un volto tramite image_id. Ritorna il subject se trovato."""
        for subject, subject_data in self.data["subjects"].items():
            if image_id in subject_data["faces"]:
                face_data = subject_data["faces"].pop(image_id)
                
                # Elimina immagine dal filesystem
                image_path = Path(face_data.get("image_path", ""))
                if image_path.exists():
                    try:
                        image_path.unlink()
                    except Exception as e:
                        logger.warning(f"Errore eliminazione immagine {image_path}: {e}")
                
                self.save()
                return subject
        return None
    
    def delete_all_faces_of_subject(self, subject: str) -> int:
        """Elimina tutti i volti di un soggetto. Ritorna il numero di volti eliminati."""
        if not self.subject_exists(subject):
            return 0
        
        count = len(self.data["subjects"][subject]["faces"])
        
        # Elimina le immagini dal filesystem
        for image_id, face_data in self.data["subjects"][subject]["faces"].items():
            image_path = Path(face_data.get("image_path", ""))
            if image_path.exists():
                try:
                    image_path.unlink()
                except Exception as e:
                    logger.warning(f"Errore eliminazione immagine {image_path}: {e}")
        
        self.data["subjects"][subject]["faces"] = {}
        self.save()
        return count
    
    def get_face_by_id(self, image_id: str) -> Optional[Dict]:
        """Ottiene i dati di un volto tramite image_id"""
        for subject, subject_data in self.data["subjects"].items():
            if image_id in subject_data["faces"]:
                return {
                    "subject": subject,
                    **subject_data["faces"][image_id]
                }
        return None
    
    def list_faces(self, subject: Optional[str] = None) -> List[Dict]:
        """Lista tutti i volti, opzionalmente filtrati per soggetto"""
        faces = []
        subjects_to_check = [subject] if subject else self.list_subjects()
        
        for subj in subjects_to_check:
            if not self.subject_exists(subj):
                continue
            for image_id, face_data in self.data["subjects"][subj]["faces"].items():
                faces.append({
                    "image_id": image_id,
                    "subject": subj,
                    "added_at": face_data.get("added_at", "")
                })
        
        return faces
    
    def get_all_embeddings(self) -> List[Dict]:
        """Ritorna tutti gli embeddings per il riconoscimento"""
        embeddings = []
        for subject, subject_data in self.data["subjects"].items():
            for image_id, face_data in subject_data["faces"].items():
                embeddings.append({
                    "subject": subject,
                    "image_id": image_id,
                    "embedding": face_data["embedding"]
                })
        return embeddings


# ============================================
# FACE ANALYZER (SINGLETON)
# ============================================

class FaceAnalyzerSingleton:
    """Singleton per FaceAnalysis per evitare caricamenti multipli del modello"""
    _instance = None
    _analyzer = None
    
    @classmethod
    def get_instance(cls):
        if cls._analyzer is None:
            logger.info(f"Inizializzazione modello InsightFace: {MODEL_NAME}")
            cls._analyzer = FaceAnalysis(
                name=MODEL_NAME,
                providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
            )
            cls._analyzer.prepare(ctx_id=0, det_size=(DET_SIZE, DET_SIZE))
            logger.info("Modello InsightFace inizializzato con successo")
        return cls._analyzer


# ============================================
# UTILITY FUNCTIONS
# ============================================

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Calcola la similarità coseno tra due vettori"""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


async def read_image_from_upload(file: UploadFile) -> np.ndarray:
    """Legge un'immagine da un upload file"""
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Impossibile decodificare l'immagine")
    return img


def save_image(img: np.ndarray, image_id: str) -> str:
    """Salva un'immagine e ritorna il percorso"""
    image_path = IMAGES_DIR / f"{image_id}.jpg"
    cv2.imwrite(str(image_path), img)
    return str(image_path)


# ============================================
# PYDANTIC MODELS
# ============================================

class SubjectRenameRequest(BaseModel):
    subject: str


class SubjectAddRequest(BaseModel):
    subject: str


# ============================================
# FASTAPI APP
# ============================================

app = FastAPI(
    title="InsightFace API",
    description="API compatibile con CompreFace per riconoscimento facciale",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database e Analyzer (inizializzati al primo uso)
db: Optional[FaceDatabase] = None
analyzer = None


@app.on_event("startup")
async def startup_event():
    """Inizializza database e modello all'avvio"""
    global db, analyzer
    db = FaceDatabase(EMBEDDINGS_DB_PATH)
    analyzer = FaceAnalyzerSingleton.get_instance()
    logger.info("=== InsightFace API Service avviato ===")
    logger.info(f"Soglia similarità: {SIMILARITY_THRESHOLD}")
    logger.info(f"Soglia detection: {DETECTION_THRESHOLD}")
    logger.info(f"Modello: {MODEL_NAME}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "model": MODEL_NAME}


# ============================================
# RECOGNITION ENDPOINTS
# ============================================

@app.post("/api/v1/recognition/recognize")
async def recognize_face(
    file: UploadFile = File(...),
    limit: int = Query(0, description="Limite risultati (0 = tutti)"),
    det_prob_threshold: float = Query(DETECTION_THRESHOLD, description="Soglia probabilità detection"),
    prediction_count: int = Query(1, description="Numero predizioni per volto"),
    face_plugins: Optional[str] = Query(None, description="Plugin aggiuntivi (ignorato)"),
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Riconoscimento facciale 1:N
    Compatibile con CompreFace /api/v1/recognition/recognize
    """
    try:
        # Leggi immagine
        img = await read_image_from_upload(file)
        
        # Rileva volti
        faces = analyzer.get(img)
        
        if not faces:
            return {"result": []}
        
        # Ottieni tutti gli embeddings dal database
        all_embeddings = db.get_all_embeddings()
        
        results = []
        for face in faces:
            # Filtra per soglia detection
            if face.det_score < det_prob_threshold:
                continue
            
            # Bounding box
            bbox = face.bbox.astype(int).tolist()
            
            # Trova i match migliori
            matches = []
            best_similarity = 0.0
            best_subject = None
            for stored in all_embeddings:
                similarity = cosine_similarity(face.embedding, stored["embedding"])
                # Teniamo traccia del migliore per logging
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_subject = stored["subject"]
                if similarity >= SIMILARITY_THRESHOLD:
                    matches.append({
                        "subject": stored["subject"],
                        "similarity": round(similarity, 5)
                    })
            
            # Log del miglior match trovato (anche se sotto soglia)
            if best_subject:
                logger.info(f"Miglior match: {best_subject} con similarità {best_similarity:.4f} (soglia: {SIMILARITY_THRESHOLD})")
                if best_similarity < SIMILARITY_THRESHOLD:
                    logger.info(f"  -> Match SCARTATO (sotto soglia)")
                else:
                    logger.info(f"  -> Match ACCETTATO")
            
            # Ordina per similarità decrescente
            matches.sort(key=lambda x: x["similarity"], reverse=True)
            
            # Limita il numero di predizioni
            if prediction_count > 0:
                matches = matches[:prediction_count]
            
            # Costruisci risultato in formato CompreFace
            result = {
                "box": {
                    "probability": round(float(face.det_score), 5),
                    "x_min": max(0, bbox[0]),
                    "y_min": max(0, bbox[1]),
                    "x_max": bbox[2],
                    "y_max": bbox[3]
                },
                "subjects": matches,
                "execution_time": {
                    "detector": 0,
                    "calculator": 0
                }
            }
            
            # Aggiungi attributi età/genere se disponibili
            if hasattr(face, 'age') and face.age is not None:
                result["age"] = {"probability": 1.0, "high": int(face.age) + 5, "low": int(face.age) - 5}
            if hasattr(face, 'gender') and face.gender is not None:
                gender_str = "male" if face.gender == 1 else "female"
                result["gender"] = {"probability": 1.0, "value": gender_str}
            
            results.append(result)
        
        # Applica limite se specificato
        if limit > 0:
            results = results[:limit]
        
        return {"result": results}
    
    except Exception as e:
        logger.error(f"Errore riconoscimento: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/recognition/faces")
async def add_face(
    file: UploadFile = File(...),
    subject: str = Form(...),
    det_prob_threshold: float = Query(DETECTION_THRESHOLD),
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Aggiunge un volto a un soggetto
    Compatibile con CompreFace POST /api/v1/recognition/faces
    """
    try:
        # Leggi immagine
        img = await read_image_from_upload(file)
        
        # Rileva volti
        faces = analyzer.get(img)
        
        if not faces:
            raise HTTPException(
                status_code=400,
                detail="No face is found in the given image"
            )
        
        if len(faces) > 1:
            raise HTTPException(
                status_code=400,
                detail="More than one face found in the image"
            )
        
        face = faces[0]
        
        # Verifica soglia detection
        if face.det_score < det_prob_threshold:
            raise HTTPException(
                status_code=400,
                detail=f"Face detection probability ({face.det_score:.2f}) below threshold ({det_prob_threshold})"
            )
        
        # Genera ID e salva immagine
        image_id = str(uuid.uuid4())
        image_path = save_image(img, image_id)
        
        # Aggiungi al database
        db.add_face(subject, face.embedding, image_path)
        
        # Usa lo stesso image_id nel database
        # (aggiorniamo l'ultimo inserito con l'ID corretto)
        for subj, subj_data in db.data["subjects"].items():
            if subj == subject:
                # Trova l'ultimo inserito e aggiorna la chiave
                latest_id = list(subj_data["faces"].keys())[-1]
                if latest_id != image_id:
                    subj_data["faces"][image_id] = subj_data["faces"].pop(latest_id)
                    subj_data["faces"][image_id]["image_path"] = image_path
                    db.save()
                break
        
        logger.info(f"Volto aggiunto: subject={subject}, image_id={image_id}")
        
        return {
            "image_id": image_id,
            "subject": subject
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore aggiunta volto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/recognition/faces")
async def list_faces(
    subject: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Lista tutti i volti, opzionalmente filtrati per soggetto
    Compatibile con CompreFace GET /api/v1/recognition/faces
    """
    try:
        faces = db.list_faces(subject)
        return {"faces": faces}
    except Exception as e:
        logger.error(f"Errore lista volti: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/recognition/faces")
async def delete_faces_by_subject(
    subject: str = Query(...),
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Elimina tutti i volti di un soggetto
    Compatibile con CompreFace DELETE /api/v1/recognition/faces?subject=xxx
    """
    try:
        if not db.subject_exists(subject):
            raise HTTPException(status_code=404, detail=f"Subject '{subject}' not found")
        
        count = db.delete_all_faces_of_subject(subject)
        logger.info(f"Eliminati {count} volti del soggetto: {subject}")
        
        return {"deleted": count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore eliminazione volti: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/recognition/faces/{image_id}")
async def delete_face(
    image_id: str,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Elimina un singolo volto tramite image_id
    Compatibile con CompreFace DELETE /api/v1/recognition/faces/{image_id}
    """
    try:
        subject = db.delete_face(image_id)
        
        if subject is None:
            raise HTTPException(status_code=404, detail=f"Image '{image_id}' not found")
        
        logger.info(f"Volto eliminato: image_id={image_id}, subject={subject}")
        
        return {
            "image_id": image_id,
            "subject": subject
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore eliminazione volto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/recognition/faces/{image_id}/img")
async def get_face_image(
    image_id: str,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Ottiene l'immagine di un volto
    Compatibile con CompreFace GET /api/v1/recognition/faces/{image_id}/img
    """
    try:
        face_data = db.get_face_by_id(image_id)
        
        if face_data is None:
            raise HTTPException(status_code=404, detail=f"Image '{image_id}' not found")
        
        image_path = Path(face_data.get("image_path", ""))
        
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="Image file not found on disk")
        
        # Leggi e ritorna l'immagine
        with open(image_path, "rb") as f:
            image_data = f.read()
        
        return Response(content=image_data, media_type="image/jpeg")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore recupero immagine: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SUBJECTS ENDPOINTS
# ============================================

@app.get("/api/v1/recognition/subjects")
async def list_subjects(
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Lista tutti i soggetti
    Compatibile con CompreFace GET /api/v1/recognition/subjects
    """
    try:
        subjects = db.list_subjects()
        return {"subjects": subjects}
    except Exception as e:
        logger.error(f"Errore lista soggetti: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/recognition/subjects")
async def add_subject(
    request: SubjectAddRequest,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Crea un nuovo soggetto
    Compatibile con CompreFace POST /api/v1/recognition/subjects
    """
    try:
        subject = request.subject
        
        if db.subject_exists(subject):
            raise HTTPException(
                status_code=400,
                detail=f"Subject '{subject}' already exists"
            )
        
        db.add_subject(subject)
        logger.info(f"Soggetto creato: {subject}")
        
        return {"subject": subject}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore creazione soggetto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/recognition/subjects/{subject}")
async def delete_subject(
    subject: str,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Elimina un soggetto e tutti i suoi volti
    Compatibile con CompreFace DELETE /api/v1/recognition/subjects/{subject}
    """
    try:
        if not db.subject_exists(subject):
            raise HTTPException(status_code=404, detail=f"Subject '{subject}' not found")
        
        db.delete_subject(subject)
        logger.info(f"Soggetto eliminato: {subject}")
        
        return {"subject": subject}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore eliminazione soggetto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/v1/recognition/subjects/{subject}")
async def rename_subject(
    subject: str,
    request: SubjectRenameRequest,
    x_api_key: Optional[str] = Header(None, alias="x-api-key")
):
    """
    Rinomina un soggetto
    Compatibile con CompreFace PUT /api/v1/recognition/subjects/{subject}
    """
    try:
        new_name = request.subject
        
        if not db.subject_exists(subject):
            raise HTTPException(status_code=404, detail=f"Subject '{subject}' not found")
        
        if db.subject_exists(new_name):
            raise HTTPException(
                status_code=400,
                detail=f"Subject '{new_name}' already exists"
            )
        
        db.rename_subject(subject, new_name)
        logger.info(f"Soggetto rinominato: {subject} -> {new_name}")
        
        return {"updated": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Errore rinomina soggetto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# DEBUG ENDPOINTS
# ============================================

@app.get("/api/v1/recognition/status")
async def get_status():
    """Endpoint di debug per verificare lo stato del servizio"""
    return {
        "status": "running",
        "model": MODEL_NAME,
        "det_size": DET_SIZE,
        "similarity_threshold": SIMILARITY_THRESHOLD,
        "detection_threshold": DETECTION_THRESHOLD,
        "total_subjects": len(db.list_subjects()),
        "total_faces": len(db.list_faces())
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
