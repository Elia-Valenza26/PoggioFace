# PoggioFace - Sistema di Riconoscimento Facciale per Controllo Accessi

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-3.1-green.svg)
![Docker](https://img.shields.io/badge/Docker-Supported-blue.svg)

PoggioFace è un sistema completo di riconoscimento facciale sviluppato in Python e Flask, progettato per il controllo degli accessi tramite riconoscimento biometrico. Utilizza **InsightFace** (modello `buffalo_l` basato su ArcFace) come motore di riconoscimento containerizzato in Docker, e offre una dashboard web per la gestione dei soggetti e il monitoraggio in tempo reale.

Il sistema è stato implementato presso il **Collegio di Merito IPE Poggiolevante** per consentire l'accesso alla struttura tramite riconoscimento facciale.

> 📚 **Documentazione**: [Doc.md](Doc/Doc.md) | **Report Migrazione**: [MIGRATION_REPORT.md](MIGRATION_REPORT.md)

---

## ✨ Caratteristiche Principali

-   **Riconoscimento Facciale in Tempo Reale**: Cattura e analisi del flusso video da una webcam in formato 16:9.
-   **Dashboard Amministrativa**: Interfaccia web per la gestione completa (CRUD) dei soggetti e delle loro foto.
-   **Log Riconoscimenti in Tempo Reale**: Visualizzazione dei tentativi di riconoscimento con cancellazione automatica per privacy.
-   **Cattura Foto Remota**: Aggiungi foto ai soggetti sia da file locali che scattandole in tempo reale dalla webcam del client di riconoscimento, senza interrompere il servizio.
-   **Integrazione Hardware**: Controllo di dispositivi esterni (es. relay Shelly per apertura porte) a seguito di un riconoscimento positivo.
-   **Configurazione Centralizzata**: Gestione di tutte le impostazioni tramite un unico file `.env` condiviso da tutti i componenti.
-   **Deployment Multi-Macchina**: Supporto per architetture distribuite (server + client separati).
-   **Avvio Automatico**: Script per l'avvio automatico dei servizi al boot del sistema.

---

## 🏗️ Architettura

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│         MACCHINA SERVER             │     │         MACCHINA CLIENT             │
│                                     │     │                                     │
│  ┌─────────────────────────────┐    │     │  ┌─────────────────────────────┐    │
│  │   InsightFace (Docker)      │    │     │  │      PoggioFace.py          │    │
│  │   Porta: 8000               │◄── ┼─────┼──│      Porta: 5002            │    │
│  │   - Riconoscimento 1:N      │    │     │  │      - Cattura webcam       │    │
│  │   - Gestione embedding      │    │     │  │      - Attivazione Shelly   │    │
│  └─────────────────────────────┘    │     │  └─────────────────────────────┘    │
│                                     │     │                                     │
│  ┌─────────────────────────────┐    │     └─────────────────────────────────────┘
│  │   Dashboard Flask           │    │
│  │   Porta: 5000               │    │
│  │   - Gestione soggetti       │    │
│  │   - Upload immagini         │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## 🚀 Getting Started

Segui questi passaggi per configurare ed eseguire il progetto in locale.

### Prerequisiti

-   Python 3.10+
-   Docker e Docker Compose (per eseguire [InsightFace Service](insightface_service/README.md))
-   Una webcam accessibile

### 1. Clonare il Repository

```bash
git clone <URL_DEL_TUO_REPOSITORY>
cd PoggioFace
```

### 2. Avviare InsightFace Service (Docker)

```bash
cd insightface_service
docker-compose up -d --build
cd ..
```

### 3. Creare l'Ambiente Virtuale

È consigliabile utilizzare un ambiente virtuale per isolare le dipendenze.

```bash
# Crea l'ambiente virtuale 'pogfac'
python -m venv pogfac

# Attiva l'ambiente
# Su Windows
pogfac\Scripts\activate.bat
# Su macOS/Linux
source pogfac/bin/activate
```

### 4. Installare le Dipendenze

```bash
pip install -r requirements.txt
```

### 5. Configurare le Variabili d'Ambiente

Crea un file `.env` nella directory principale del progetto e compilalo seguendo l'esempio sottostante.

```env
# filepath: .env

# ============================================
# CONFIGURAZIONE CENTRALIZZATA POGGIOFACE
# ============================================
# Questo file è letto da: PoggioFace, Dashboard, InsightFace Docker

# --- Configurazione InsightFace ---
# L'indirizzo IP o il nome host dove è in esecuzione il server InsightFace
HOST=http://localhost
# La porta su cui InsightFace è in ascolto
PORT=8000
# La chiave API (opzionale - per retrocompatibilità)
API_KEY=your_api_key

# --- Soglie di Riconoscimento (0.0 - 1.0) ---
# Soglia minima di somiglianza per riconoscere un soggetto
SIMILARITY_THRESHOLD=0.5
# Soglia minima di probabilità per considerare un volto rilevato
DETECTION_THRESHOLD=0.5

# --- Configurazione Hardware ---
# L'URL completo per attivare il relay del dispositivo Shelly (lasciare vuoto se non usato)
SHELLY_URL=

# --- Configurazione Dashboard ---
# La password per accedere alla dashboard
DASHBOARD_PASSWORD=your_secure_password
# Una chiave segreta per la gestione delle sessioni Flask
SECRET_KEY=your_flask_secret_key

# --- Plugin Facciali (opzionale) ---
FACE_PLUGINS=age,gender

# --- Configurazione Servizi Locali ---
# L'URL base dell'applicazione PoggioFace
POGGIO_FACE_URL=http://localhost:5002
# L'URL della Dashboard
DASHBOARD_URL=http://localhost:5000
```

> ⚠️ **IMPORTANTE:** Dopo aver modificato `SIMILARITY_THRESHOLD` o `DETECTION_THRESHOLD`, riavviare il container Docker e i servizi Python.

---

## 🛠️ Utilizzo

Il sistema è composto da due applicazioni Flask che devono essere eseguite contemporaneamente in due terminali separati (con l'ambiente virtuale attivato).

**Terminale 1: Avvia il Servizio di Riconoscimento**

```bash
python PoggioFace.py
```
> Il servizio sarà accessibile su `http://localhost:5002`. Mostra il feed della webcam e gestisce il riconoscimento.

**Terminale 2: Avvia la Dashboard Amministrativa**

```bash
cd Dashboard
python dashboard.py
```
> La dashboard sarà accessibile su `http://localhost:5000`. Usala per gestire i soggetti e le loro foto.

---

## 📂 Struttura del Progetto

```
PoggioFace/
├── .env                        # Configurazione centralizzata
├── PoggioFace.py               # Client riconoscimento facciale
├── SharedVideoStreamer.py      # Gestione stream video condiviso
├── requirements.txt            # Dipendenze Python
├── MIGRATION_REPORT.md         # Report migrazione CompreFace → InsightFace
├── start_dashboard.sh          # Script avvio automatico
│
├── insightface_service/        # Servizio InsightFace (Docker)
│   ├── app.py                  # API FastAPI wrapper
│   ├── Dockerfile              # Container GPU
│   ├── Dockerfile.cpu          # Container CPU
│   ├── docker-compose.yml      # Orchestrazione
│   ├── requirements.txt        # Dipendenze servizio
│   └── data/                   # Persistenza dati (embeddings + immagini)
│
├── Dashboard/                  # Dashboard amministrativa
│   ├── dashboard.py            # Backend Flask
│   ├── static/                 # CSS, JS
│   ├── templates/              # HTML templates
│   └── tmp/                    # File temporanei upload
│
├── static/                     # File statici PoggioFace
├── templates/                  # Template HTML PoggioFace
│
└── Doc/                        # Documentazione
    ├── Doc.md                  # Documentazione principale
    └── Image/                  # Immagini documentazione
```

---

## 🔌 API Endpoints

### InsightFace Service (`:8000`)
| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/health` | GET | Stato del servizio |
| `/api/v1/recognition/recognize` | POST | Riconoscimento 1:N |
| `/api/v1/recognition/subjects` | GET/POST/DELETE/PUT | Gestione soggetti |
| `/api/v1/recognition/faces` | GET/POST/DELETE | Gestione volti |

### Dashboard (`:5000`)
| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/` | GET | Pagina principale |
| `/subjects` | GET/POST | Lista/Crea soggetti |
| `/subjects/<name>/images` | POST | Aggiungi immagine |
| `/receive_remote_photo` | POST | Ricevi foto da webcam remota |

### PoggioFace (`:5002`)
| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/` | GET | Interfaccia riconoscimento |
| `/config` | GET | Configurazione frontend |
| `/shelly_url` | POST | Attiva relay Shelly |
| `/capture_remote_photo` | GET | Pagina cattura remota |

---

## 📖 Documentazione

- **[Doc.md](Doc/Doc.md)** - Documentazione tecnica completa
- **[MIGRATION_REPORT.md](MIGRATION_REPORT.md)** - Dettagli migrazione da CompreFace a InsightFace
- **[insightface_service/README.md](insightface_service/README.md)** - Documentazione servizio Docker

---


*Ultima modifica: Gennaio 2026 - Versione 2.1 (Log Riconoscimenti)*
