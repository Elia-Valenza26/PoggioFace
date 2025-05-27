# PoggioFace - Sistema di Riconoscimento Facciale

Un sistema completo di ***riconoscimento facciale*** sviluppato in Python con Flask per il controllo degli accessi ad una struttura. Questo sistema è stato implementato presso il **Collegio di Merito IPE Poggiolevante**.


## 🎯 Panoramica

PoggioFace è un sistema di riconoscimento facciale in tempo reale che utilizza **CompreFace** come motore di riconoscimento e offre:

- **Riconoscimento facciale in tempo reale** tramite webcam
- **Dashboard amministrativa** completa per la gestione dei soggetti
- **Interfaccia web responsive** ottimizzata per desktop e mobile
- **Integrazione hardware** per controllo accessi automatizzato
- **Configurazione flessibile** tramite variabili d'ambiente

## ✨ Caratteristiche Principali

### 🔍 Riconoscimento
- Riconoscimento facciale in tempo reale con soglie configurabili
- Supporto per webcam e cattura remota
- Plugin per rilevamento età e genere
- Logging completo delle attività

### 👥 Gestione Soggetti
- Dashboard web per operazioni CRUD sui soggetti
- Caricamento immagini da file o webcam
- Gestione multipla immagini per soggetto
- Anteprima e validazione immagini

### 🔧 Integrazione
- API RESTful per integrazione con sistemi esterni
- Controllo hardware (es. apertura porte via Shelly)
- Configurazione dinamica senza riavvio

## 🚀 Quick Start

### Prerequisiti
- Python 3.8+
- CompreFace installato e configurato
- Webcam compatibile

### Installazione

1. **Clona il repository**
```bash
git clone <repository-url>
cd PoggioFace
```

2. **Crea ambiente virtuale**
```bash
python -m venv pogfac
source pogfac/bin/activate  # Linux/Mac
# oppure
pogfac\Scripts\activate.bat  # Windows
```

3. **Installa dipendenze**
```bash
pip install -r requirements.txt
```

4. **Configura environment**
```bash
cp .env.example .env
# Modifica .env con le tue configurazioni
```

5. **Avvia l'applicazione**
```bash
# Applicazione principale (riconoscimento)
python PoggioFace.py

# Dashboard amministrativa (in terminale separato)
cd Dashboard
python Dashboard.py
```

### Accesso
- **Interfaccia Riconoscimento**: http://localhost:5002
- **Dashboard Amministrativa**: http://localhost:5000

## ⚙️ Configurazione

### File .env
```env
# Configurazione CompreFace
HOST=http://localhost
PORT=8000
API_KEY=your_compreface_api_key

# Soglie di riconoscimento
DETECTION_PROBABILITY_THRESHOLD=0.8
SIMILARITY_THRESHOLD=0.85

# Plugin facciali
FACE_PLUGINS=age,gender

# URL Shelly
SHELLY_URL=http://shellyUrl

# URL PoggioFace
POGGIO_FACE_URL=http://localhost
```

### Configurazione CompreFace
1. Installa e avvia CompreFace
2. Crea un servizio di riconoscimento
3. Ottieni l'API key dal pannello CompreFace
4. Inserisci l'API key nel file .env

## 📁 Struttura del Progetto

```
PoggioFace/
├── PoggioFace.py              # Applicazione principale
├── requirements.txt           # Dipendenze Python
├── .env                       # Configurazione (da creare)
│
├── Dashboard/                 # Dashboard amministrativa
│   ├── Dashboard.py          # Backend dashboard
│   ├── static/               # CSS, JS, immagini
│   └── templates/            # Template HTML
│
├── static/                   # Asset applicazione principale
├── templates/                # Template HTML riconoscimento
├── Doc/                      # Documentazione completa
└── tmp/                      # File temporanei
```

## 🔌 API Endpoints

### Dashboard Amministrativa
- `GET /subjects` - Lista tutti i soggetti
- `POST /subjects` - Aggiunge nuovo soggetto
- `PUT /subjects/<name>` - Rinomina soggetto
- `DELETE /subjects/<name>` - Elimina soggetto
- `POST /subjects/<name>/images` - Aggiunge immagine
- `DELETE /images/<id>` - Elimina immagine

### Applicazione Principale
- `GET /` - Interfaccia di riconoscimento
- `POST /log` - Endpoint per logging
- `POST /shelly_url`: Endpoint per aprire la porta
- `GET /config` - Configurazione frontend
- `GET /capture_remote_photo` - Cattura foto remota
- `POST /remote_photo_data`: Riceve e processa foto catturate remotamente

## 🎮 Utilizzo

### Dashboard Amministrativa
1. Accedi alla dashboard su http://localhost:5000
2. Aggiungi nuovi soggetti con nome e foto
3. Gestisci immagini multiple per soggetto
4. Utilizza la webcam per catturare foto in tempo reale

### Interfaccia di Riconoscimento
1. Accedi all'interfaccia su http://localhost:5002
2. Autorizza l'accesso alla webcam
3. Il sistema rileverà automaticamente i volti
4. I soggetti riconosciuti verranno evidenziati con overlay


## 📚 Documentazione

Per documentazione completa, architettura del sistema e guide avanzate, consulta:
- [Documentazione Completa](Doc/Doc.md)
- [Guida Installazione Dettagliata](Doc/Doc.md#installazione-e-deployment)
- [API Reference](Doc/Doc.md#api-e-endpoints)


## 🤝 Contributi

I contributi sono benvenuti! Per contribuire:
1. Fork del progetto
2. Crea un branch per la feature (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request


## 👨‍💻 Autore

Sviluppato per il Collegio di Merito IPE Poggiolevante

