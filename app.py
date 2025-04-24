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


# Avvio del server Flask
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)