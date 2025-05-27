from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file, Response
from flask_cors import CORS 
from dotenv import load_dotenv
import os
import logging
import time
import datetime

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

CORS(app)  # Abilita CORS per tutte le rotte

# Variabile per tracciare lo stato del riconoscimento
recognition_active = True

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

@app.route('/favicon.ico')
def favicon():
    return '', 204  # No Content

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

@app.route('/capture_remote_photo', methods=['GET'])
def capture_remote_photo():
    """
    Endpoint che serve una pagina di cattura foto per uso remoto
    """
    return render_template('RemoteCapture.html')

@app.route('/remote_photo_data', methods=['POST'])
def remote_photo_data():
    """
    Endpoint che riceve la foto catturata e la restituisce come base64
    """
    try:
        data = request.get_json()
        photo_data = data.get('photo_data')
        
        if not photo_data:
            return jsonify({"error": "Nessun dato foto ricevuto"}), 400
        
        # La foto è già in formato base64 dal frontend
        return jsonify({
            "success": True,
            "photo_data": photo_data,
            "timestamp": datetime.datetime.now().isoformat()
        })
        
    except Exception as e:
        app.logger.error(f"Errore durante la cattura remota: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500


# Avvio del server Flask
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5002)