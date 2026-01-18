# Report Migrazione da CompreFace a InsightFace

## Sommario Esecutivo

Questo documento descrive la migrazione completa del sistema di riconoscimento facciale PoggioFace dal motore **CompreFace** al motore **InsightFace**. La migrazione è stata completata mantenendo la compatibilità API e preservando la logica applicativa esistente.

**Data migrazione:** 15 Dicembre 2025  
**Stato:** ✅ Completata e testata

---

## Indice

1. [Motivazioni della Migrazione](#motivazioni-della-migrazione)
2. [Architettura del Sistema](#architettura-del-sistema)
3. [File Creati](#file-creati)
4. [File Modificati](#file-modificati)
5. [Configurazione Centralizzata](#configurazione-centralizzata)
6. [Deployment in Produzione](#deployment-in-produzione)
7. [Guida Multi-Macchina](#guida-multi-macchina)
8. [Troubleshooting](#troubleshooting)
9. [Appendice: Struttura File Finale](#appendice-struttura-file-finale)

---

## Motivazioni della Migrazione

| Aspetto | CompreFace | InsightFace |
|---------|------------|-------------|
| Precisione 1:N | Buona | Eccellente |
| Velocità | Media | Alta |
| Modello | Proprietario | buffalo_l (open) |
| Licenza | Commerciale | MIT |
| Risorse | Elevate | Ottimizzate |

---

## Architettura del Sistema

### Schema Deployment Multi-Macchina

```
┌─────────────────────────────────────────────────────────────┐
│                    MACCHINA SERVER (A)                      │
│                    IP: 10.10.10.95                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Docker Container                       │    │
│  │         InsightFace Service (FastAPI)               │    │
│  │              Porta: 8000                            │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  buffalo_l model + ONNX Runtime (CPU/GPU)   │    │    |
│  │  │  Volume: ./data → /app/data                 │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Dashboard Flask                        │    │
│  │              Porta: 5000                            │    │
│  │  - Gestione Subject                                 │    │
│  │  - Upload immagini volti                            │    │
│  │  - Interfaccia web amministrazione                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                    Rete Locale
                           │
┌─────────────────────────────────────────────────────────────┐
│                   MACCHINA CLIENT (B)                       │
│                   IP: 10.10.11.22                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              PoggioFace.py (Flask)                  │    │
│  │              Porta: 5002                            │    │
│  │  - Cattura video webcam                             │    │
│  │  - Invio frame per riconoscimento                   │    │
│  │  - Visualizzazione risultati                        │    │
│  │  - Attivazione Shelly                               │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Flusso Dati

1. **PoggioFace** cattura frame dalla webcam
2. Frame inviato via HTTP POST a **InsightFace Service**
3. InsightFace rileva volti e calcola embedding
4. Confronto con embedding salvati nel database
5. Risposta con subject riconosciuti e similarity score
6. **PoggioFace** visualizza risultato e attiva Shelly se necessario

---

## File Creati

### 1. `insightface_service/app.py`

**Scopo:** API wrapper FastAPI compatibile con CompreFace API

**Endpoint principali:**
| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/v1/recognition/recognize` | POST | Riconoscimento facciale |
| `/api/v1/recognition/faces` | GET/POST/DELETE | Gestione volti database |
| `/api/v1/recognition/subjects` | GET/POST/DELETE/PUT | Gestione subject |
| `/api/v1/recognition/subjects/{subject}/verify` | POST | Verifica 1:1 |

**Caratteristiche:**
- Modello: `buffalo_l` (ArcFace)
- Similarity: cosine similarity (0-1)
- Supporto GPU/CPU automatico
- Persistenza embeddings su disco

### 2. `insightface_service/Dockerfile`

```dockerfile
FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    build-essential \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 3. `insightface_service/Dockerfile.cpu`

Versione ottimizzata per CPU senza supporto GPU.

### 4. `insightface_service/docker-compose.yml`

```yaml
services:
  insightface-api:
    build:
      context: .
      dockerfile: Dockerfile.cpu
    container_name: insightface-api
    ports:
      - "8000:8000"
    volumes:
      # Persistenza embeddings e database
      - ./data:/app/data
      # Cache modelli InsightFace (evita download ripetuti)
      - insightface_models:/root/.insightface
    # Legge le variabili dal file .env principale (centralizzato)
    env_file:
      - ../.env
    environment:
      # Modello da usare (buffalo_l, buffalo_m, buffalo_s, buffalo_sc)
      - MODEL_NAME=buffalo_l
      # Dimensione detection (più alto = più preciso ma più lento)
      - DET_SIZE=640
    restart: unless-stopped
    # Decommentare per supporto GPU NVIDIA
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  # Versione CPU-only (alternativa)
  insightface-api-cpu:
    build:
      context: .
      dockerfile: Dockerfile.cpu
    container_name: insightface-api-cpu
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
      - insightface_models:/root/.insightface
    env_file:
      - ../.env
    environment:
      - MODEL_NAME=buffalo_l
      - DET_SIZE=640
    restart: unless-stopped
    profiles:
      - cpu  # Attiva con: docker-compose --profile cpu up

volumes:
  insightface_models:
    name: insightface_models_cache
```

> **Nota:** Il container legge le soglie dal file `.env` nella root del progetto tramite `env_file: ../.env`

### 5. `insightface_service/requirements.txt`

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-multipart==0.0.20
insightface==0.7.3
onnxruntime-gpu==1.20.1
opencv-python-headless==4.10.0.84
numpy==1.26.4
pillow==11.0.0
pydantic==2.10.3
```

> **Nota:** Per sistemi senza GPU, sostituire `onnxruntime-gpu` con `onnxruntime`

### 6. `.env` (Configurazione Centralizzata)

Il file `.env` nella root del progetto è **l'unica fonte di configurazione** per tutti i componenti:
- **PoggioFace** (client)
- **Dashboard** (server)
- **InsightFace Docker** (motore riconoscimento)

```env
# ============================================
# CONFIGURAZIONE CENTRALIZZATA POGGIOFACE
# ============================================
# Questo file è letto da: PoggioFace, Dashboard, InsightFace Docker
# ============================================

# API InsightFace
API_KEY=your-api-key-here
HOST=http://localhost
PORT=8000

# Soglie di riconoscimento (0.0 - 1.0)
# SIMILARITY_THRESHOLD: soglia per considerare un match valido (più alto = più restrittivo)
# DETECTION_THRESHOLD: soglia minima di probabilità per considerare un volto rilevato valido
SIMILARITY_THRESHOLD=0.5
DETECTION_THRESHOLD=0.5

# Plugin per analisi aggiuntive (age, gender)
FACE_PLUGINS=age,gender

# URL dei servizi
POGGIO_FACE_URL=http://localhost:5002
DASHBOARD_URL=http://localhost:5000

# Dispositivo Shelly (lasciare vuoto se non usato)
SHELLY_URL=

# Credenziali Dashboard
DASHBOARD_PASSWORD=your-password
SECRET_KEY=your-secret-key
```

> **⚠️ IMPORTANTE:** Dopo aver modificato `SIMILARITY_THRESHOLD` o `DETECTION_THRESHOLD`, è necessario riavviare il container Docker:
> ```bash
> cd insightface_service
> docker-compose down && docker-compose up -d
> ```

---

## File Modificati

### 1. `Dashboard/dashboard.py`

**Modifica principale:** Sostituzione del CompreFace SDK con client HTTP nativo.

**Prima (CompreFace SDK):**
```python
from compreface import CompreFace
compre_face = CompreFace(HOST, PORT, {"limit": 0, "det_prob_threshold": "0.8"})
recognition = compre_face.init_face_recognition(API_KEY)
```

**Dopo (InsightFace HTTP Client):**
```python
class InsightFaceClient:
    def __init__(self, host, port, api_key):
        self.base_url = f"{host}:{port}"
        self.api_key = api_key
        self.headers = {"x-api-key": api_key}
    
    def recognize(self, image_path, options=None):
        url = f"{self.base_url}/api/v1/recognition/recognize"
        with open(image_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(url, files=files, 
                                    headers=self.headers, params=options)
        return response.json()
    
    # ... altri metodi per subjects e faces
```

### 2. `requirements.txt` (principale)

**Rimosso:**
- `compreface-sdk` - non più necessario

### 3. `insightface_service/app.py`

**Modifica:** Configurazione centralizzata dal file `.env`:
```python
# Configurazione da environment (legge dal .env centralizzato)
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.5"))
DETECTION_THRESHOLD = float(os.getenv("DETECTION_THRESHOLD", "0.5"))
```

---

## Configurazione Centralizzata

### Architettura Configurazione

```
┌─────────────────────────────────────────────────────────────┐
│                         .env                                 │
│              (root del progetto PoggioFace)                 │
│                                                              │
│  SIMILARITY_THRESHOLD=0.5                                   │
│  DETECTION_THRESHOLD=0.5                                    │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ PoggioFace   │ │  Dashboard   │ │   Docker     │
   │  (Flask)     │ │   (Flask)    │ │ InsightFace  │
   │              │ │              │ │              │
   │ load_dotenv()│ │ load_dotenv()│ │ env_file:    │
   │              │ │              │ │   ../.env    │
   └──────────────┘ └──────────────┘ └──────────────┘
```

### Variabili d'Ambiente

| Variabile | Descrizione | Valore Default | Usato da |
|-----------|-------------|----------------|----------|
| `HOST` | URL server InsightFace | `http://localhost` | PoggioFace, Dashboard |
| `PORT` | Porta servizio | `8000` | PoggioFace, Dashboard |
| `API_KEY` | Chiave autenticazione | - | Tutti |
| `SIMILARITY_THRESHOLD` | Soglia riconoscimento | `0.5` | **Tutti** (centralizzato) |
| `DETECTION_THRESHOLD` | Soglia detection volti | `0.5` | **Tutti** (centralizzato) |
| `FACE_PLUGINS` | Plugin aggiuntivi | `age,gender` | PoggioFace |
| `DASHBOARD_URL` | URL Dashboard | `http://localhost:5000` | PoggioFace |
| `POGGIO_FACE_URL` | URL PoggioFace | `http://localhost:5002` | Dashboard |
| `SHELLY_URL` | URL relay Shelly | - | PoggioFace |

### Tuning Soglia Similarity

La soglia è configurata nel file `.env` centralizzato (variabile `SIMILARITY_THRESHOLD`):

| Valore | Comportamento |
|--------|---------------|
| 0.4 | Permissivo (più falsi positivi) |
| 0.5 | Bilanciato (raccomandato) |
| 0.6 | Restrittivo |
| 0.7+ | Molto restrittivo (più falsi negativi) |

> **⚠️ Dopo ogni modifica della soglia:**
> 1. Riavviare il container Docker: `docker-compose down && docker-compose up -d`
> 2. Riavviare PoggioFace e Dashboard per ricaricare la configurazione

---

## Deployment in Produzione

### Prerequisiti

**Macchina Server (A):**
- Docker e Docker Compose installati
- Almeno 4GB RAM (8GB raccomandati per GPU)
- Python 3.10+ per Dashboard

**Macchina Client (B):**
- Python 3.10+
- Webcam accessibile
- Connessione di rete alla macchina server

### Passo 1: Setup Server (Macchina A)

```bash
# 1. Clona il repository
git clone <repository-url>
cd PoggioFace

# 2. Configura ambiente
cp .env.example .env
nano .env  # Modifica con i valori corretti

# 3. Build e avvio InsightFace Service
cd insightface_service
docker-compose up -d --build

# 4. Verifica che il servizio sia attivo
curl http://localhost:8000/api/v1/recognition/subjects

# 5. Avvia Dashboard
cd ../Dashboard
python dashboard.py
```

### Passo 2: Setup Client (Macchina B)

```bash
# 1. Clona il repository
git clone <repository-url>
cd PoggioFace

# 2. Crea ambiente virtuale
python -m venv pogfac
.\pogfac\Scripts\Activate.ps1  # Windows
# source pogfac/bin/activate   # Linux/Mac

# 3. Installa dipendenze
pip install -r requirements.txt

# 4. Configura .env
cp .env.example .env
# Modifica .env con:
# HOST=http://10.10.10.95  (IP macchina server)
# PORT=8000
# DASHBOARD_URL=http://10.10.10.95:5000

# 5. Avvia PoggioFace
python PoggioFace.py
```

### Passo 3: Verifica Connettività

```bash
# Dalla macchina client, verifica accesso al server
curl http://10.10.10.95:8000/api/v1/recognition/subjects
curl http://10.10.10.95:5000/

# Dalla macchina server, verifica accesso al client
curl http://10.10.11.22:5002/
```

---

## Guida Multi-Macchina

### Configurazione Centralizzata

Il file `.env` nella root del progetto contiene **tutta la configurazione**. Ogni macchina ha il proprio `.env` con gli stessi parametri ma valori appropriati per il contesto.

**Macchina Server (A) - IP: 10.10.10.95**

File `.env` (letto da Dashboard e Docker InsightFace):
```env
# ============================================
# CONFIGURAZIONE CENTRALIZZATA - SERVER
# ============================================
API_KEY=your-secure-api-key
HOST=http://localhost
PORT=8000

# Soglie (unica fonte di verità)
SIMILARITY_THRESHOLD=0.5
DETECTION_THRESHOLD=0.5

FACE_PLUGINS=age,gender
POGGIO_FACE_URL=http://10.10.11.22:5002
DASHBOARD_URL=http://10.10.10.95:5000
DASHBOARD_PASSWORD=your-password
SECRET_KEY=your-secret-key
```

**Macchina Client (B) - IP: 10.10.11.22**

File `.env` (letto da PoggioFace):
```env
# ============================================
# CONFIGURAZIONE CENTRALIZZATA - CLIENT
# ============================================
API_KEY=your-secure-api-key
HOST=http://10.10.10.95
PORT=8000

# Soglie (devono corrispondere al server)
SIMILARITY_THRESHOLD=0.5
DETECTION_THRESHOLD=0.5

FACE_PLUGINS=age,gender
SHELLY_URL=http://10.10.11.19/relay/0?turn=on
DASHBOARD_URL=http://10.10.10.95:5000
```

> **⚠️ IMPORTANTE:** Le soglie devono essere identiche su server e client. Se modificate sul server, aggiornare anche il client e riavviare tutti i servizi.

### Firewall

Aprire le seguenti porte:

**Server (A):**
- Porta 8000/TCP (InsightFace API)
- Porta 5000/TCP (Dashboard)

**Client (B):**
- Porta 5002/TCP (PoggioFace)

```bash
# Windows - esempio PowerShell Admin
New-NetFirewallRule -DisplayName "InsightFace API" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Dashboard" -Direction Inbound -Port 5000 -Protocol TCP -Action Allow

# Linux - esempio ufw
sudo ufw allow 8000/tcp
sudo ufw allow 5000/tcp
```

### Script di Avvio Automatico

**Server (start_server.sh):**
```bash
#!/bin/bash
cd /path/to/PoggioFace/insightface_service
docker-compose up -d

cd /path/to/PoggioFace/Dashboard
source ../pogfac/bin/activate
nohup python dashboard.py > dashboard.log 2>&1 &
```

**Client (start_client.ps1):**
```powershell
cd C:\Path\To\PoggioFace
.\pogfac\Scripts\Activate.ps1
python PoggioFace.py
```

---

## Troubleshooting

### Problema: Volti rilevati ma nomi non visualizzati

**Causa:** Soglia similarity troppo alta o non allineata tra componenti  
**Soluzione:** 
1. Ridurre `SIMILARITY_THRESHOLD` nel file `.env`:
   ```env
   SIMILARITY_THRESHOLD=0.5
   ```
2. Riavviare il container Docker:
   ```bash
   cd insightface_service
   docker-compose down && docker-compose up -d
   ```
3. Riavviare PoggioFace e Dashboard

**Verifica log Docker per diagnostica:**
```bash
docker logs insightface-api --tail 50
```
I log mostreranno il punteggio di similarità per ogni riconoscimento.

### Problema: Container Docker non si avvia

**Causa:** Errore build per dipendenze mancanti  
**Soluzione:** Verificare che `Dockerfile.cpu` contenga:
```dockerfile
RUN apt-get update && apt-get install -y \
    libgl1 \
    build-essential \
    g++
```

### Problema: Modifiche alle soglie non hanno effetto

**Causa:** Container Docker usa le vecchie variabili  
**Soluzione:** Il container legge le variabili all'avvio. Dopo ogni modifica al `.env`:
```bash
cd insightface_service
docker-compose down && docker-compose up -d
```

### Problema: Connessione rifiutata tra macchine

**Causa:** Firewall o binding errato  
**Soluzione:**
1. Verificare che i servizi siano in ascolto su 0.0.0.0
2. Controllare regole firewall
3. Testare con: `curl http://<IP>:<PORT>/`

### Problema: Performance lente su CPU

**Causa:** Modello buffalo_l pesante su CPU  
**Soluzione:**
- Usare modello più leggero (buffalo_s)
- Aumentare intervallo tra richieste
- Considerare GPU se disponibile

### Log e Debug

**InsightFace Service:**
```bash
docker logs -f insightface-api
```

**Dashboard:**
```bash
tail -f Dashboard/dashboard.log
```

---

## Appendice: Struttura File Finale

```
PoggioFace/
├── .env                          # Configurazione ambiente (locale)
├── .env.example                  # Template configurazione
├── .gitignore                    # File ignorati da git
├── requirements.txt              # Dipendenze Python principali
├── PoggioFace.py                 # Client riconoscimento facciale
├── SharedVideoStreamer.py        # Gestione stream video
├── README.md                     # Documentazione progetto
├── MIGRATION_REPORT.md           # Questo documento
│
├── Dashboard/
│   ├── dashboard.py              # Server Flask Dashboard (MODIFICATO)
│   ├── static/
│   │   ├── Dashboard.css
│   │   └── dashboard.js
│   └── templates/
│       ├── dashboard.html
│       ├── login.html
│       └── Test_API.html
│
├── insightface_service/          # NUOVO - Servizio InsightFace
│   ├── app.py                    # API FastAPI wrapper
│   ├── Dockerfile                # Container GPU
│   ├── Dockerfile.cpu            # Container CPU
│   ├── docker-compose.yml        # Orchestrazione
│   ├── requirements.txt          # Dipendenze Python
│   ├── README.md                 # Documentazione servizio
│   └── data/                     # Persistenza dati
│       └── images/               # Immagini subject
│
├── templates/
│   ├── PoggioFace.html
│   ├── RemoteCapture.html
│   └── WebCamDemo.html
│
├── static/
│   ├── PoggioFace.css
│   └── PoggioFace.js
│
└── Doc/
    └── Doc.md                    # Documentazione aggiuntiva
```

---

## Contatti e Supporto

Per problemi o domande relative a questa migrazione, fare riferimento alla documentazione in `Doc/Doc.md` o consultare i log dei servizi.

---

*Documento generato automaticamente durante la migrazione CompreFace → InsightFace*  
*Versione: 1.1*  
*Data: 15 Dicembre 2025*  
*Ultimo aggiornamento: Configurazione centralizzata `.env` e unificazione soglie*
