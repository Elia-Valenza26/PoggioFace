# PoggioFace - Sistema di Riconoscimento Facciale

## Indice
1. [Panoramica del Progetto](#panoramica-del-progetto)
2. [Architettura del Sistema](#architettura-del-sistema)
3. [Struttura dei File](#struttura-dei-file)
4. [Configurazione e Setup](#configurazione-e-setup)
5. [Componenti Principali](#componenti-principali)
6. [Dashboard Amministrativa](#dashboard-amministrativa)
7. [API e Endpoints](#api-e-endpoints)
8. [Interfaccia di Riconoscimento](#interfaccia-di-riconoscimento)
9. [Gestione delle Immagini](#gestione-delle-immagini)
10. [Integrazione Hardware](#integrazione-hardware)
11. [Installazione e Deployment](#installazione-e-deployment)
12. [Troubleshooting](#troubleshooting)

## Panoramica del Progetto

**PoggioFace** è un sistema completo di ***riconoscimento facciale*** sviluppato in Python con Flask, progettato per il controllo degli accessi tramite riconoscimento biometrico. Il sistema utilizza **CompreFace** come motore di riconoscimento facciale e offre un'interfaccia web completa per la gestione dei soggetti e il monitoraggio in tempo reale.

Il sistema è stato implementato nel **Collegio di Merito IPE Poggiolevante**, affinché gli studenti e i professionisti possano accedere alla struttura tramite il loro volto. 

### Caratteristiche Principali
- **Riconoscimento facciale in tempo reale** tramite webcam
- **Gestione completa dei soggetti** con interfaccia amministrativa
- **Interfaccia web responsive** per desktop e mobile
- **Dashboard amministrativa** per CRUD operations sui soggetti
- **Cattura foto** sia da file che da webcam
- **Integrazione hardware** per controllo accessi
- **Configurazione flessibile** tramite variabili d'ambiente

## Architettura del Sistema

Il sistema PoggioFace segue un'architettura modulare composta da diversi componenti che collaborano per fornire un servizio completo di riconoscimento facciale.

![Workflow del Sistema](Image/workflow.png)


### Flusso di Funzionamento

1. **Cattura**: La webcam acquisisce frame video in tempo reale
2. **Processing**: I frame vengono inviati a CompreFace per l'analisi
3. **Recognition**: Il sistema confronta i volti rilevati con il database
4. **Action**: In caso di match positivo, viene inviata una chiamata allo Shelly per aprire la porta
5. **Gestione soggetti**: la dashboard invia delle richieste API al server CompreFace per effettuare delle modifiche al DB. 

## Struttura dei File

```
PoggioFace/
├── .env                           # Variabili di configurazione
├── .gitignore                     # File da ignorare in Git
├── PoggioFace.py                  # Applicazione principale
├── README.md                      # Documentazione base
├── requirements.txt               # Dipendenze Python
├── Doc.md                         # Documentazione completa
│
├── Dashboard/                     # Modulo dashboard amministrativa
│   ├── Dashboard.py              # Backend dashboard
│   ├── static/
│   │   ├── Dashboard.css         # Stili dashboard
│   │   ├── Dashboard.js          # JavaScript dashboard
│   │   └── logoPoggiolevante.png # Logo aziendale
│   ├── templates/
│   │   ├── Dashboard.html        # Interfaccia dashboard
│   │   └── Test_API.html         # Pagina test API
│   └── tmp/                      # File temporanei dashboard
│
├── Doc/                          # Directory documentazione
│   ├── Doc.md                    # File documentazione
│   └── Image/
│       └── workflow.png          # Diagramma workflow sistema
│
├── static/                       # Asset statici applicazione principale
│   ├── PoggioFace.js            # JavaScript riconoscimento (non script.js)
│   └── style.css                # Stili CSS
│
├── templates/                    # Template HTML applicazione principale
│   ├── PoggioFace.html          # Interfaccia principale
│   ├── RemoteCapture.html       # Interfaccia cattura remota
│   └── WebCamDemo.html          # Demo webcam
│
├── tmp/                         # Directory temporanea
└── pogfac/                      # Ambiente virtuale Python
```

## Configurazione e Setup

### Variabili d'Ambiente (.env)

Il sistema utilizza un file .env per la configurazione:

```env
# Configurazione CompreFace
HOST=http://localhost                    # Host CompreFace
PORT=8000                               # Porta CompreFace
API_KEY=your_api_key_here               # Chiave API CompreFace

# Indirizzo PoggioFace per scattare foto
POGGIO_FACE_URL=http://localhost

# Indirizzo Shelly
SHELLY_URL=http://indirizzoShelly

# Soglie di riconoscimento
DETECTION_PROBABILITY_THRESHOLD=0.8      # Soglia rilevamento volti
SIMILARITY_THRESHOLD=0.85               # Soglia somiglianza riconoscimento

# Plugin facciali
FACE_PLUGINS=age,gender                 # Plugin per età e genere
```

### Dipendenze Python (requirements.txt)

```txt
Flask==2.3.3
flask-cors==4.0.0
python-dotenv==1.0.0
requests==2.31.0
compreface==1.2.0
logging
```

## Componenti Principali

### 1. Applicazione Principale (PoggioFace.py)

Il file principale che gestisce l'interfaccia di riconoscimento facciale.

**Endpoints principali:**
- `GET /`: Pagina principale con interfaccia di riconoscimento
- `POST /log`: Endpoint per logging dal frontend
- `GET /config`: Configurazione per il frontend
- `POST /shelly_url`: Endpoint per aprire la porta
- `GET /capture_remote_photo`: Interfaccia per cattura foto remota
- `POST /remote_photo_data`: Riceve e processa foto catturate remotamente
- `GET /favicon.ico`: Gestione favicon

**Funzionalità:**
- Caricamento configurazione da .env
- Servizio delle pagine HTML
- Gestione logging centralizzato
- Integrazione con sistemi esterni

### 2. Dashboard Amministrativa (Dashboard/DSashboard.py)

Backend per la gestione amministrativa dei soggetti.

**Endpoints CRUD:**
- `GET /subjects`: Lista tutti i soggetti
- `POST /subjects`: Aggiunge nuovo soggetto
- `PUT /subjects/<name>`: Rinomina soggetto
- `DELETE /subjects/<name>`: Elimina soggetto
- `POST /subjects/<name>/images`: Aggiunge immagine a soggetto
- `DELETE /images/<id>`: Elimina immagine specifica

## Dashboard Amministrativa

### Interfaccia (Dashboard/templates/Dashboard.html)

La dashboard offre un'interfaccia completa per la gestione dei soggetti:

#### Funzionalità Principali

1. **Gestione Soggetti**
   - Visualizzazione lista soggetti con miniature
   - Aggiunta nuovi soggetti con nome e foto
   - Rinominazione soggetti esistenti
   - Eliminazione soggetti e relative immagini

2. **Gestione Immagini**
   - Visualizzazione tutte le immagini per soggetto
   - Aggiunta immagini da file o webcam
   - Eliminazione immagini singole
   - Anteprima immagini prima del caricamento

3. **Cattura da Webcam**
   - Modal dedicato per cattura foto
   - Anteprima in tempo reale
   - Possibilità di rifare la foto
   - Integrazione seamless con form


### JavaScript Dashboard (Dashboard/static/Dashboard.js)

Gestisce tutta l'interattività della dashboard:

#### Funzioni Principali

```javascript
// Caricamento dati
async function fetchSubjects()           // Recupera lista soggetti
function renderSubjectsList(subjects)   // Renderizza lista UI

// Gestione soggetti
async function addSubject()             // Aggiunge nuovo soggetto
async function renameSubject()          // Rinomina soggetto
async function deleteSubject()          // Elimina soggetto

// Gestione immagini
async function addImageToSubject()      // Aggiunge immagine
async function deleteImage()           // Elimina immagine

// Webcam
function setupWebcamModal()            // Configura modal webcam
```


## API e Endpoints

### Endpoints Dashboard

| Metodo | Endpoint | Descrizione | Parametri |
|--------|----------|-------------|-----------|
| GET | `/subjects` | Lista soggetti | - |
| POST | `/subjects` | Aggiunge soggetto | `subject`, `image` |
| PUT | `/subjects/<name>` | Rinomina soggetto | `new_name` |
| DELETE | `/subjects/<name>` | Elimina soggetto | - |
| POST | `/subjects/<name>/images` | Aggiunge immagine | `image` |
| DELETE | `/images/<id>` | Elimina immagine | - |
| GET | `/proxy/images/<id>` | Proxy immagini CompreFace | - |

### Endpoints PoggioFace (Applicazione Principale)

| Metodo | Endpoint | Descrizione | Parametri |
|--------|----------|-------------|-----------|
| GET | `/` | Interfaccia principale di riconoscimento | - |
| POST | `/log` | Endpoint per logging dal frontend | `message` |
| GET | `/config` | Configurazione per il frontend | - |
| POST | `/shelly_url` | Attivazione dispositivo Shelly | - |
| GET | `/capture_remote_photo` | Interfaccia cattura foto remota | - |
| POST | `/remote_photo_data` | Riceve foto catturate remotamente | `photo_data` |
| GET | `/favicon.ico` | Gestione favicon | - |

### Esempi di Utilizzo API

#### Dashboard Amministrativa

**Aggiungere un soggetto:**
```javascript
const formData = new FormData();
formData.append('subject', 'Mario Rossi');
formData.append('image', imageFile);

const response = await fetch('/subjects', {
    method: 'POST',
    body: formData
});
```

**Rinominare un soggetto:**
```javascript
const response = await fetch('/subjects/VecchioNome', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ new_name: 'NuovoNome' })
});
```

**Aggiungere immagine a soggetto esistente:**
```javascript
const formData = new FormData();
formData.append('image', imageFile);

const response = await fetch('/subjects/MarioRossi/images', {
    method: 'POST',
    body: formData
});
```

**Eliminare un soggetto:**
```javascript
const response = await fetch('/subjects/MarioRossi', {
    method: 'DELETE'
});
```

**Eliminare un'immagine:**
```javascript
const response = await fetch('/images/12345-abcde-67890', {
    method: 'DELETE'
});
```

#### Applicazione Principale

**Invio log dal frontend:**
```javascript
fetch('/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        message: `${new Date().toLocaleTimeString()}: Utente riconosciuto` 
    })
});
```

**Caricamento configurazione:**
```javascript
const response = await fetch('/config');
const config = await response.json();
// Ritorna: { apiKey, host, port, detProbThreshold, similarityThreshold, facePlugins, shellyUrl }
```

**Attivazione dispositivo Shelly:**
```javascript
fetch('/shelly_url', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
}).then(response => response.json())
  .then(data => {
    console.log(data.message); // "Relay attivato"
  });
```

**Invio foto catturata remotamente:**
```javascript
const formData = new FormData();
formData.append('photo', photoBlob, 'remote_photo.jpg');

const response = await fetch('/remote_photo_data', {
    method: 'POST',
    body: formData
});
```

### Codici di Risposta

#### Successo
| Codice | Descrizione |
|--------|-------------|
| 200 | Operazione completata con successo |
| 201 | Risorsa creata con successo |

#### Errori Client
| Codice | Descrizione |
|--------|-------------|
| 400 | Richiesta malformata o parametri mancanti |
| 404 | Risorsa non trovata |

#### Errori Server
| Codice | Descrizione |
|--------|-------------|
| 500 | Errore interno del server |
| 502 | Errore nella comunicazione con CompreFace/Shelly |
| 503 | Servizio non disponibile |
| 504 | Timeout nella comunicazione |

### Formati di Risposta

#### Successo (Dashboard)
```json
{
    "message": "Soggetto 'Mario Rossi' aggiunto con successo."
}
```

#### Errore (Dashboard)
```json
{
    "error": "Nome soggetto e immagine sono richiesti."
}
```

#### Configurazione (PoggioFace)
```json
{
    "apiKey": "your_api_key",
    "host": "http://localhost",
    "port": "8000",
    "detProbThreshold": 0.8,
    "similarityThreshold": 0.85,
    "facePlugins": "age,gender",
    "shellyUrl": "http://shelly_device_url"
}
```

#### Lista Soggetti
```json
{
    "Mario Rossi": ["image_id_1", "image_id_2"],
    "Giulia Bianchi": ["image_id_3", "image_id_4", "image_id_5"]
}
```



## Interfaccia di Riconoscimento

### Template Principale (templates/PoggioFace.html)

Interfaccia minimale per il riconoscimento:

```html
<div class="video-container">
    <video id="videoElement" autoplay playsinline></video>
    <canvas id="canvas"></canvas>
</div>
```

### Script di Riconoscimento (static/PoggioFace.js)

#### Flusso di Riconoscimento

1. **Inizializzazione**
   - Caricamento configurazione dal server
   - Avvio camera
   - Setup canvas per overlay

2. **Loop di Riconoscimento**
   - Cattura frame ogni secondo
   - Invio a CompreFace API
   - Processamento risultati
   - Rendering overlay

3. **Gestione Risultati**
   - Verifica soglia similarità
   - Display informazioni soggetto
   - Trigger azioni hardware

#### Funzioni Chiave

```javascript
async function recognizeFromVideo() {
    // Cattura frame da video
    // Invio a CompreFace
    // Ritorna risultati riconoscimento
}

function renderFrame() {
    // Pulisce canvas
    // Disegna overlay informazioni
    // Gestisce azioni trigger
}

async function loadConfig() {
    // Carica configurazione da server
    // Inizializza sistema
}
```

### Configurazione Dinamica

Il sistema carica la configurazione dal backend:

```javascript
const response = await fetch('/config');
const serverConfig = await response.json();
config = {...config, ...serverConfig};
```

## Gestione delle Immagini

### Proxy CompreFace

Il sistema implementa un proxy per le immagini CompreFace:

```python
@app.route('/proxy/images/<image_id>')
def proxy_image(image_id):
    response = requests.get(f"{DOMAIN}:{PORT}/api/v1/recognition/faces/{image_id}/img")
    return Response(response.content, content_type=response.headers['content-type'])
```

### Upload e Validazione

Le immagini vengono validate prima dell'upload:

```javascript
if (!image) {
    showToast('Per favore, seleziona un\'immagine.', 'warning');
    return;
}
```

### Formati Supportati

- **Input**: JPEG, PNG, WebP
- **Processing**: Conversione automatica a JPEG
- **Compression**: Qualità 80% per ottimizzazione

## Integrazione Hardware

### Sistema di Trigger

Il riconoscimento può triggerare azioni hardware tramite l'attivazione di dispositivi Shelly:

```javascript
if (subjects[0].similarity >= config.similarityThreshold) {
    // Verifica timeout (5 secondi)
    const currentTime = new Date().getTime();
    if (currentTime - lastRequestTime >= 5000) {
        // Chiamata all'endpoint locale che gestirà la chiamata Shelly
        fetch('/shelly_url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(response => {
            if (!response.ok) {
                console.error('Errore nella richiesta allo Shelly');
                log('Errore nella richiesta allo Shelly');
            } else {
                console.info('Richiesta Shelly inviata correttamente');
                log('Dispositivo Shelly attivato correttamente');
            }
            return response.json();
        }).then(data => {
            if (data.error) {
                log(`Errore Shelly: ${data.error}`);
            } else {
                log(`Shelly: ${data.message}`);
            }
        }).catch(error => {
            console.error('Errore nella richiesta allo Shelly', error);
            log(`Errore connessione Shelly: ${error.message}`);
        });
        lastRequestTime = currentTime;
    }
}
```

### Configurazione URL Shelly

L'indirizzo del dispositivo Shelly viene configurato tramite variabile d'ambiente nel file `.env`:

```env
# Configurazione dispositivo Shelly
SHELLY_URL=http://shellyUrl
```

### Endpoint Shelly

Il backend gestisce la comunicazione con il dispositivo Shelly attraverso un endpoint dedicato:

```python
@app.route('/shelly_url', methods=['POST'])
def shelly_url_handler():
    """Endpoint per attivare il relay Shelly"""
    try:
        if not shelly_url:
            return jsonify({"error": "URL Shelly non configurato"}), 400
            
        # Effettua la chiamata al dispositivo Shelly
        response = requests.get(shelly_url, timeout=5)
        
        if response.ok:
            app.logger.info(f"Shelly attivato correttamente: {shelly_url}")
            return jsonify({"status": "success", "message": "Relay attivato"})
        else:
            app.logger.error(f"Errore nella chiamata Shelly: {response.status_code}")
            return jsonify({"error": f"Errore Shelly: {response.status_code}"}), 502
            
    except requests.exceptions.Timeout:
        app.logger.error("Timeout nella chiamata al dispositivo Shelly")
        return jsonify({"error": "Timeout dispositivo Shelly"}), 504
    except requests.exceptions.ConnectionError:
        app.logger.error("Errore di connessione al dispositivo Shelly")
        return jsonify({"error": "Dispositivo Shelly non raggiungibile"}), 503
    except Exception as e:
        app.logger.error(f"Errore generico nella chiamata Shelly: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500
```

### Vantaggi dell'Implementazione

1. **Configurazione Centralizzata**: L'URL Shelly è configurabile tramite file `.env`
2. **Gestione Errori Completa**: Il sistema gestisce timeout, errori di connessione e altri problemi
3. **Logging Dettagliato**: Tutte le operazioni vengono registrate per debugging
4. **Sicurezza**: La logica di rete è centralizzata lato server
5. **Timeout Protection**: Previene chiamate multiple ravvicinate (5 secondi di cooldown)
6. **Flessibilità**: Facile cambiare dispositivo o configurazione senza modificare il codice

### Codici di Risposta

| Codice | Descrizione |
|--------|-------------|
| 200 | Relay attivato correttamente |
| 400 | URL Shelly non configurato |
| 502 | Errore nella risposta del dispositivo Shelly |
| 503 | Dispositivo Shelly non raggiungibile |
| 504 | Timeout nella comunicazione |

## Installazione e Deployment

### 1. Setup Ambiente

```bash
# Clona repository
git clone <repository-url>
cd PoggioFace

# Crea ambiente virtuale
python -m venv pogfac
source pogfac/bin/activate  # Linux/Mac
# oppure
pogfac\Scripts\activate.bat  # Windows

# Installa dipendenze
pip install -r requirements.txt
```

### 2. Configurazione CompreFace

1. Installa e avvia CompreFace
2. Crea un servizio di riconoscimento
3. Ottieni API key
4. Configura .env

### 3. Configurazione Ambiente

Crea file .env:

```env
HOST=http://localhost
PORT=8000
API_KEY=your_compreface_api_key
DETECTION_PROBABILITY_THRESHOLD=0.8
SIMILARITY_THRESHOLD=0.85
FACE_PLUGINS=age,gender
POGGIO_FACE_URL=http://localhost
```

### 4. Avvio Applicazioni

**Applicazione principale:**
```bash
python PoggioFace.py
# Accessibile su http://localhost:5002
```

**Dashboard amministrativa:**
```bash
cd Dashboard
python dashboard.py
# Accessibile su http://localhost:5000
```

## Troubleshooting

### Problemi Comuni

#### 1. Errore Connessione CompreFace
```
Errore: Impossibile caricare la configurazione
```
**Soluzione:**
- Verifica che CompreFace sia avviato
- Controlla HOST e PORT in .env
- Verifica API_KEY

#### 2. Webcam Non Funziona
```
Errore: Impossibile accedere alla camera
```
**Soluzione:**
- Verifica permessi browser
- Usa HTTPS per produzione
- Controlla compatibilità browser

#### 3. Riconoscimento Impreciso
**Soluzione:**
- Abbassa `SIMILARITY_THRESHOLD`
- Aggiungi più immagini per soggetto
- Migliora illuminazione

#### 4. Performance Lente
**Soluzione:**
- Aumenta intervallo riconoscimento
- Riduci qualità immagini
- Ottimizza configurazione CompreFace

### Debug e Logging

Il sistema implementa logging completo:

```python
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
```

**Frontend logging:**
```javascript
function log(message) {
    fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${new Date().toLocaleTimeString()}: ${message}` })
    });
}
```

---

## Conclusioni

PoggioFace è un sistema completo e modulare per il riconoscimento facciale, progettato per essere facilmente estendibile e mantenibile. La separazione tra interfaccia utente, dashboard amministrativa e backend API permette scalabilità e flessibilità d'uso.

Per supporto tecnico o contributi al progetto, fare riferimento al repository GitHub del progetto.
