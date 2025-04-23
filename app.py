from flask import Flask, render_template, request, jsonify, redirect, url_for
from dotenv import load_dotenv
import os
import logging
import requests
import json

# Carica le variabili di ambiente dal file .env
load_dotenv()

# Crea l'app Flask
app = Flask(__name__)

# Configura il logging per stampare nel terminale
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

# Rileva le variabili di configurazione dal file .env
api_key = os.getenv('API_KEY')
host = os.getenv('HOST')
port = os.getenv('PORT')
detection_prob_threshold = float(os.getenv('DETECTION_PROBABILITY_THRESHOLD'))
similarity_threshold = float(os.getenv('SIMILARITY_THRESHOLD'))
face_plugins = os.getenv('FACE_PLUGINS')

# Variabile per tracciare lo stato del riconoscimento
recognition_active = True

# Passa le variabili d'ambiente al template
@app.route('/')
def home():
    config = {
        'apiKey': api_key,
        'host': host,
        'port': port,
        'detProbThreshold': detection_prob_threshold,
        'similarityThreshold': similarity_threshold,
        'facePlugins': face_plugins
    }
    return render_template('PoggioFace.html', config=config)

@app.route('/dashboard')
def dashboard():
    config = {
        'apiKey': api_key,
        'host': host,
        'port': port,
        'detProbThreshold': detection_prob_threshold,
        'similarityThreshold': similarity_threshold,
        'facePlugins': face_plugins
    }
    return render_template('dashboard.html', config=config)

@app.route('/log', methods=['POST'])
def log_message():
    """
    Endpoint per ricevere i log dal front-end e stamparli nel terminale.
    """
    data = request.get_json()
    if 'message' in data:
        message = data['message']
        app.logger.info(message)  # Scrive nel terminale
        return jsonify({"status": "success", "message": "Log scritto correttamente"}), 200
    else:
        return jsonify({"status": "error", "message": "Nessun messaggio fornito"}), 400
    
@app.route('/config')
def get_config():
    """Endpoint che restituisce la configurazione al frontend"""
    return jsonify({
        'apiKey': api_key,
        'host': host,
        'port': port,
        'detProbThreshold': detection_prob_threshold,
        'similarityThreshold': similarity_threshold,
        'facePlugins': face_plugins
    })

@app.route('/pause_recognition', methods=['POST'])
def pause_recognition():
    """Endpoint per mettere in pausa il riconoscimento facciale"""
    global recognition_active
    recognition_active = False
    app.logger.info("Riconoscimento facciale messo in pausa")
    
    # Invia un messaggio al front-end per notificare la pausa
    try:
        # Qui puoi anche inviare un segnale alla pagina principale se necessario
        pass
    except Exception as e:
        app.logger.error(f"Errore nell'invio della notifica di pausa: {str(e)}")
    
    return jsonify({"status": "success", "active": recognition_active}), 200

@app.route('/resume_recognition', methods=['POST'])
def resume_recognition():
    """Endpoint per riprendere il riconoscimento facciale"""
    global recognition_active
    recognition_active = True
    app.logger.info("Riconoscimento facciale ripreso")
    
    # Invia un messaggio al front-end per notificare la ripresa
    try:
        # Qui puoi anche inviare un segnale alla pagina principale se necessario
        pass
    except Exception as e:
        app.logger.error(f"Errore nell'invio della notifica di ripresa: {str(e)}")
    
    return jsonify({"status": "success", "active": recognition_active}), 200

@app.route('/recognition_status')
def get_recognition_status():
    """Endpoint che restituisce lo stato attuale del riconoscimento"""
    return jsonify({"active": recognition_active})

@app.route('/proxy/<path:endpoint>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def proxy_request(endpoint):
    """
    Proxy per inviare richieste al server CompreFace.
    Utile per evitare problemi di CORS o per gestire richieste centralizzate.
    """
    base_url = f"{host}:{port}" if port else host
    target_url = f"{base_url}/{endpoint}"
    
    headers = {
        'x-api-key': api_key
    }
    
    # Copia gli header dalla richiesta originale
    for key, value in request.headers:
        if key.lower() not in ['host', 'content-length', 'x-api-key']:
            headers[key] = value
    
    try:
        if request.method == 'GET':
            response = requests.get(target_url, headers=headers, params=request.args)
        elif request.method == 'POST':
            if request.content_type and 'application/json' in request.content_type:
                response = requests.post(target_url, headers=headers, json=request.json, params=request.args)
            elif request.content_type and 'multipart/form-data' in request.content_type:
                # Per il caricamento di file
                files = {}
                for key, file in request.files.items():
                    files[key] = (file.filename, file.read(), file.content_type)
                response = requests.post(target_url, headers=headers, files=files, data=request.form, params=request.args)
            else:
                response = requests.post(target_url, headers=headers, data=request.data, params=request.args)
        elif request.method == 'PUT':
            response = requests.put(target_url, headers=headers, json=request.json, params=request.args)
        elif request.method == 'DELETE':
            response = requests.delete(target_url, headers=headers, params=request.args)
        
        # Log della richiesta
        app.logger.info(f"Richiesta proxy a {target_url} con metodo {request.method}")
        
        # Restituisci la risposta dal server CompreFace
        return (response.content, response.status_code, response.headers.items())
    except Exception as e:
        app.logger.error(f"Errore nella richiesta proxy: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Avvio del server Flask
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)