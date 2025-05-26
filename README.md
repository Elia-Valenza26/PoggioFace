# PoggioFace - Sistema di Riconoscimento Facciale


Un sistema completo di riconoscimento facciale sviluppato in Python con Flask, progettato per il controllo degli accessi tramite riconoscimento biometrico.

## 🚀 Caratteristiche Principali

- 🎯 **Riconoscimento facciale in tempo reale** tramite webcam
- 👥 **Gestione completa dei soggetti** con interfaccia amministrativa
- 📱 **Interfaccia web responsive** per desktop e mobile
- 🔧 **Dashboard amministrativa** per operazioni CRUD sui soggetti
- 📷 **Cattura foto** da file o webcam
- 🚪 **Integrazione hardware** per controllo accessi
- 📊 **Configurazione flessibile** tramite variabili d'ambiente

## 📋 Prerequisiti

- Python 3.8+
- CompreFace (per il motore di riconoscimento)
- Webcam 

## 🛠️ Installazione Rapida

### 1. Clona il repository
```bash
git clone <repository-url>
cd PoggioFace
```

### 2. Crea ambiente virtuale
```bash
python -m venv pogfac
# Windows
pogfac\Scripts\activate
# Linux/Mac
source pogfac/bin/activate
```

### 3. Installa dipendenze
```bash
pip install -r requirements.txt
```

### 4. Configura ambiente
Crea un file `.env` nella directory principale:
```env
HOST=http://localhost
PORT=8000
API_KEY=your_compreface_api_key_here
DETECTION_PROBABILITY_THRESHOLD=0.8
SIMILARITY_THRESHOLD=0.85
FACE_PLUGINS=age,gender
```

### 5. Avvia le applicazioni

**Applicazione principale (Riconoscimento):**
```bash
python PoggioFace.py
```
Accessibile su: http://localhost:5002

**Dashboard Amministrativa:**
```bash
cd Dashboard
python dashboard.py
```
Accessibile su: http://localhost:5000

## 🔧 Configurazione CompreFace

1. Scarica e installa [CompreFace](https://github.com/exadel-inc/CompreFace)
2. Avvia CompreFace con Docker:
   ```bash
   docker-compose up -d
   ```
3. Accedi all'interfaccia CompreFace (http://localhost:8000)
4. Crea un nuovo servizio di riconoscimento
5. Copia l'API key nel file `.env`

## 📁 Struttura del Progetto

```
PoggioFace/
├── .env                        # Configurazione
├── PoggioFace.py              # App principale
├── requirements.txt           # Dipendenze
├── Dashboard/                 # Modulo dashboard
│   ├── dashboard.py          # Backend dashboard
│   ├── static/               # Asset statici
│   └── templates/            # Template HTML
├── static/                   # Asset app principale
├── templates/                # Template app principale
└── tmp/                      # File temporanei
```

## 🎯 Utilizzo

### Interfaccia di Riconoscimento
1. Apri http://localhost:5002
2. Consenti l'accesso alla webcam
3. Il sistema inizierà automaticamente il riconoscimento

### Dashboard Amministrativa
1. Apri http://localhost:5000
2. Aggiungi nuovi soggetti con nome e foto
3. Gestisci le immagini esistenti
4. Rinomina o elimina soggetti

### Gestione Soggetti
- **Aggiungere soggetto**: Nome + foto (da file o webcam)
- **Modificare soggetto**: Rinomina o aggiungi immagini
- **Eliminare soggetto**: Rimuove soggetto e tutte le immagini

## ⚙️ Configurazione Avanzata

### Soglie di Riconoscimento
```env
# Soglia per rilevamento volti (0.0-1.0)
DETECTION_PROBABILITY_THRESHOLD=0.8

# Soglia per somiglianza riconoscimento (0.0-1.0)
SIMILARITY_THRESHOLD=0.85
```

### Plugin Facciali
```env
# Plugin disponibili: age, gender, landmarks
FACE_PLUGINS=age,gender
```

## 🐛 Risoluzione Problemi

### Errore Connessione CompreFace
- Verifica che CompreFace sia avviato
- Controlla HOST, PORT e API_KEY nel file `.env`

### Webcam Non Funziona
- Verifica permessi browser per accesso camera
- Per produzione, usa HTTPS
- Controlla compatibilità browser

### Riconoscimento Impreciso
- Abbassa `SIMILARITY_THRESHOLD` in `.env`
- Aggiungi più immagini per ogni soggetto
- Migliora l'illuminazione dell'ambiente

## 📊 API Endpoints

### Applicazione Principale
- `GET /`: Interfaccia di riconoscimento
- `POST /log`: Logging dal frontend
- `GET /config`: Configurazione sistema
- `POST /pace`: Trigger hardware

### Dashboard
- `GET /subjects`: Lista soggetti
- `POST /subjects`: Aggiungi soggetto
- `PUT /subjects/<name>`: Rinomina soggetto
- `DELETE /subjects/<name>`: Elimina soggetto
- `POST /subjects/<name>/images`: Aggiungi immagine
- `DELETE /images/<id>`: Elimina immagine

## 🚀 Deployment Produzione

### Con Docker
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5002
CMD ["python", "PoggioFace.py"]
```

### Con nginx
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5002;
    }
    
    location /dashboard {
        proxy_pass http://localhost:5000;
    }
}
```

## 🔒 Sicurezza

- Usa HTTPS in produzione
- Configura firewall appropriato
- Limita accesso alle API
- Aggiorna regolarmente le dipendenze
- Backup periodico dei dati

## 📖 Documentazione Completa

Per documentazione dettagliata, consulta [Doc.md](Doc.md) che include:
- Architettura del sistema
- Descrizione componenti
- Guide avanzate
- Troubleshooting completo

## 🤝 Contribuire

1. Fork del progetto
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit modifiche (`git commit -m 'Add AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri Pull Request


## 📞 Supporto

Per supporto tecnico o segnalazione bug:
- Apri una issue su GitHub
- Contatta il team di sviluppo

---

