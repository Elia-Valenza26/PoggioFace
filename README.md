# PoggioFace - Sistema di Riconoscimento Facciale per Controllo Accessi


PoggioFace è un sistema completo di riconoscimento facciale sviluppato in Python e Flask, progettato per il controllo degli accessi tramite riconoscimento biometrico. Utilizza **CompreFace** come motore di riconoscimento e offre una dashboard web per la gestione dei soggetti e il monitoraggio in tempo reale.

Il sistema è stato implementato presso il **Collegio di Merito IPE Poggiolevante** per consentire l'accesso alla struttura tramite riconoscimento facciale.

Per maggiori informazioni, consultare la documentazione completa [Doc.md](Doc/Doc.md) 

---

## ✨ Caratteristiche Principali

-   **Riconoscimento Facciale in Tempo Reale**: Cattura e analisi del flusso video da una webcam.
-   **Dashboard Amministrativa**: Interfaccia web per la gestione completa (CRUD) dei soggetti e delle loro foto.
-   **Cattura Foto Remota**: Aggiungi foto ai soggetti sia da file locali che scattandole in tempo reale dalla webcam del client di riconoscimento, senza interrompere il servizio.
-   **Integrazione Hardware**: Controllo di dispositivi esterni (es. relay Shelly per apertura porte) a seguito di un riconoscimento positivo.
-   **Configurazione Flessibile**: Gestione di tutte le impostazioni tramite un file `.env`.
-   **Avvio Automatico**: Script per l'avvio automatico dei servizi al boot del sistema.

---

## 🚀 Getting Started

Segui questi passaggi per configurare ed eseguire il progetto in locale.

### Prerequisiti

-   Python 3.8+
-   Docker e Docker Compose (per eseguire [CompreFace](https://github.com/exadel-inc/CompreFace))
-   Un'istanza di CompreFace in esecuzione.

### 1. Clonare il Repository

```bash
git clone <URL_DEL_TUO_REPOSITORY>
cd PoggioFace
```

### 2. Creare l'Ambiente Virtuale

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

### 3. Installare le Dipendenze

```bash
pip install -r requirements.txt
```

### 4. Configurare le Variabili d'Ambiente

Crea un file `.env` nella directory principale del progetto e compilalo seguendo l'esempio sottostante.

```env
# filepath: .env

# --- Configurazione CompreFace ---
# L'indirizzo IP o il nome host dove è in esecuzione il server CompreFace
HOST=http://localhost
# La porta su cui CompreFace è in ascolto
PORT=8000
# La chiave API del servizio di riconoscimento facciale di CompreFace
API_KEY=your_compreface_api_key

# --- Soglie di Riconoscimento ---
# Soglia di probabilità minima per considerare un volto rilevato (0.0 - 1.0)
DETECTION_PROBABILITY_THRESHOLD=0.8
# Soglia di somiglianza minima per riconoscere un soggetto (0.0 - 1.0)
SIMILARITY_THRESHOLD=0.85

# --- Configurazione Hardware ---
# L'URL completo per attivare il relay del dispositivo Shelly
SHELLY_URL=http://your_shelly_ip/relay/0?turn=on

# --- Configurazione Servizi Locali ---
# L'URL base dell'applicazione PoggioFace, usato dalla Dashboard per la cattura remota
POGGIO_FACE_URL=http://localhost:5002
# L'URL della macchina su cui viene eseguito dashboard.py, usato da PoggioFace per inviare l'immagine scattata dalla webcam
DASHBOARD_URL=http://localhost:5000
```

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
├── .env
├── PoggioFace.py
├── requirements.txt
├── start_dashboard.sh
├── Dashboard/
│   ├── dashboard.py
│   ├── static/
│   └── templates/
├── Doc/
│   ├── Doc.md
│   └── Image/
│       └── workflow.png
└── tmp/
```
