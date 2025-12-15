# InsightFace API Service

Wrapper API che espone endpoint compatibili con CompreFace per il riconoscimento facciale basato su InsightFace.

## 🚀 Avvio Rapido

### Con GPU (NVIDIA CUDA)

```bash
cd insightface_service
docker-compose up -d insightface-api
```

### Solo CPU

```bash
cd insightface_service
docker-compose --profile cpu up -d insightface-api-cpu
```

## 📋 Requisiti

- Docker e Docker Compose
- (Opzionale) GPU NVIDIA con driver CUDA per accelerazione

## 🔧 Configurazione

Le variabili di ambiente sono configurabili nel `docker-compose.yml`:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SIMILARITY_THRESHOLD` | 0.4 | Soglia minima per considerare un match valido (0.0-1.0) |
| `DETECTION_THRESHOLD` | 0.5 | Soglia probabilità detection volto (0.0-1.0) |
| `MODEL_NAME` | buffalo_l | Modello InsightFace (buffalo_l, buffalo_m, buffalo_s) |
| `DET_SIZE` | 640 | Dimensione immagine per detection (più alto = più preciso) |

## 🔌 API Endpoints

Tutti gli endpoint sono compatibili con l'API CompreFace:

### Riconoscimento

```
POST /api/v1/recognition/recognize
```
Riconoscimento 1:N di volti in un'immagine.

**Parametri:**
- `file`: Immagine (multipart/form-data)
- `det_prob_threshold`: Soglia detection (query param)
- `limit`: Limite risultati (query param)
- `prediction_count`: Numero predizioni per volto (query param)

### Gestione Soggetti

```
GET    /api/v1/recognition/subjects           # Lista soggetti
POST   /api/v1/recognition/subjects           # Crea soggetto
DELETE /api/v1/recognition/subjects/{subject} # Elimina soggetto
PUT    /api/v1/recognition/subjects/{subject} # Rinomina soggetto
```

### Gestione Volti

```
GET    /api/v1/recognition/faces              # Lista volti
POST   /api/v1/recognition/faces              # Aggiunge volto
DELETE /api/v1/recognition/faces/{image_id}   # Elimina volto
GET    /api/v1/recognition/faces/{image_id}/img # Ottiene immagine
```

### Health Check

```
GET /health                    # Stato servizio
GET /api/v1/recognition/status # Stato dettagliato
```

## 📊 Esempio di Risposta Recognize

```json
{
  "result": [
    {
      "box": {
        "probability": 0.9998,
        "x_min": 100,
        "y_min": 50,
        "x_max": 250,
        "y_max": 300
      },
      "subjects": [
        {
          "subject": "Mario Rossi",
          "similarity": 0.8523
        }
      ],
      "age": {
        "probability": 1.0,
        "high": 35,
        "low": 25
      },
      "gender": {
        "probability": 1.0,
        "value": "male"
      }
    }
  ]
}
```

## 🗂️ Persistenza Dati

I dati sono persistiti in:
- `./data/embeddings.pkl` - Database embeddings
- `./data/images/` - Immagini dei volti registrati
- Volume Docker `insightface_models` - Modelli scaricati

## 🔄 Migrazione da CompreFace

1. Arresta CompreFace
2. Avvia InsightFace service
3. Aggiorna HOST/PORT nel `.env` (se diversi)
4. Re-importa i soggetti/volti usando la dashboard

> **Nota:** Gli embeddings di CompreFace NON sono compatibili con InsightFace.
> I volti devono essere re-registrati.

## 🐛 Troubleshooting

### Il modello non si scarica
```bash
# Verifica connettività
docker exec insightface-api ping -c 3 google.com

# Forza ri-download
docker volume rm insightface_models_cache
docker-compose up -d
```

### Out of Memory (GPU)
Riduci `DET_SIZE` nel docker-compose.yml:
```yaml
environment:
  - DET_SIZE=320  # invece di 640
```

### Prestazioni lente (CPU)
Usa un modello più leggero:
```yaml
environment:
  - MODEL_NAME=buffalo_sc  # invece di buffalo_l
```

## 📈 Modelli Disponibili

| Modello | Dimensione | Accuracy | Velocità |
|---------|-----------|----------|----------|
| buffalo_l | ~200MB | Alta | Media |
| buffalo_m | ~100MB | Media | Alta |
| buffalo_s | ~50MB | Bassa | Molto Alta |
| buffalo_sc | ~30MB | Bassa | Massima |

## 📝 Licenza

InsightFace è distribuito sotto licenza MIT per uso non commerciale.
Per uso commerciale, contattare InsightFace.ai.
