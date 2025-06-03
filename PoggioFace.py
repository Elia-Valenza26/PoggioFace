from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file, Response, make_response
from flask_cors import CORS 
from dotenv import load_dotenv
import os
import logging
import datetime
import requests
import threading
from SharedVideoStreamer import SharedVideoStreamer



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

shelly_url = os.getenv('SHELLY_URL')
dashboard_url = os.getenv('DASHBOARD_URL')

# Abilita CORS per tutte le rotte dell'applicazione
CORS(app)

# Aggiungi dopo le altre variabili globali
shared_video_stream = SharedVideoStreamer()

# Variabile globale per tracciare lo stato del riconoscimento facciale
recognition_active = False

# Route principale che serve il template HTML per il riconoscimento facciale
@app.route('/')
def home():
    # Crea un dizionario con la configurazione da passare al template
    config = {
        'apiKey': api_key,
        'host': host,
        'port': port,
        'detProbThreshold': detection_prob_threshold,
        'similarityThreshold': similarity_threshold,
        'facePlugins': face_plugins,
        'shellyUrl': shelly_url
    }
    return render_template('PoggioFace.html', config=config)


# Route per il file favicon.ico
@app.route('/favicon.ico')
def favicon():
    return '', 204
    

# Endpoint per ricevere i log dal front-end e stamparli nel terminale.
@app.route('/log', methods=['POST'])
def log_message():

    data = request.get_json()
    
    # Verifica che il messaggio sia presente nella richiesta
    if 'message' in data:
        message = data['message']
        app.logger.info(message)  # Scrive il messaggio nel terminale
        return jsonify({"status": "success", "message": "Log scritto correttamente"}), 200
    else:
        return jsonify({"status": "error", "message": "Nessun messaggio fornito"}), 400


# Endpoint che restituisce la configurazione completa al frontend.
@app.route('/config')
def get_config():
    return jsonify({
        'apiKey': api_key,
        'host': host,
        'port': port,
        'detProbThreshold': detection_prob_threshold,
        'similarityThreshold': similarity_threshold,
        'facePlugins': face_plugins
    })

@app.route('/shelly_url', methods=['POST'])
def shelly_url_handler():
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
        
@app.route('/recognition_status')
def recognition_status():
    """Restituisce lo stato del riconoscimento"""
    return jsonify({
        "active": recognition_active,
        "stream_running": shared_video_stream.is_running()
    })

@app.route('/start_recognition', methods=['POST'])
def start_recognition():
    """Avvia il riconoscimento facciale"""
    global recognition_active
    try:
        if not shared_video_stream.is_running():
            shared_video_stream.start_stream()
        
        recognition_active = True
        app.logger.info("Riconoscimento facciale avviato")
        return jsonify({"status": "success", "message": "Riconoscimento avviato"})
    except Exception as e:
        app.logger.error(f"Errore avvio riconoscimento: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500

@app.route('/stop_recognition', methods=['POST'])
def stop_recognition():
    """Ferma il riconoscimento facciale (mantiene lo stream attivo)"""
    global recognition_active
    try:
        recognition_active = False
        app.logger.info("Riconoscimento facciale fermato")
        return jsonify({"status": "success", "message": "Riconoscimento fermato"})
    except Exception as e:
        app.logger.error(f"Errore stop riconoscimento: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500

@app.route('/webcam_status')
def webcam_status():
    try:
        return jsonify({
            "stream_running": shared_video_stream.is_running(),
            "recognition_active": recognition_active,
            "available_for_capture": shared_video_stream.is_running() and not recognition_active
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/start_video_stream', methods=['POST'])
def start_video_stream():
    try:
        if not shared_video_stream.is_running():
            shared_video_stream.start_stream()
        return jsonify({"status": "success", "message": "Stream avviato"})
    except Exception as e:
        app.logger.error(f"Errore avvio stream: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500


@app.route('/get_video_frame')
def get_video_frame():
    try:
        if not shared_video_stream.is_running():
            return jsonify({"error": "Stream non attivo"}), 400
            
        frame = shared_video_stream.get_frame()
        if frame:
            return jsonify({"frame": frame})
        else:
            return jsonify({"frame": None})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/stop_video_stream', methods=['POST'])
def stop_video_stream():
    try:
        shared_video_stream.stop_stream()
        return jsonify({"status": "success", "message": "Stream fermato"})
    except Exception as e:
        app.logger.error(f"Errore stop stream: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500


@app.route('/capture_video_frame', methods=['POST'])
def capture_video_frame():
    try:
        if not shared_video_stream.is_running():
            return jsonify({"error": "Stream non attivo"}), 400
            
        frame = shared_video_stream.get_frame()
        if frame:
            return jsonify({
                "success": True,
                "photo_data": f"data:image/jpeg;base64,{frame}",
                "timestamp": datetime.datetime.now().isoformat()
            })
        else:
            return jsonify({"error": "Nessun frame disponibile"}), 400
    except Exception as e:
        app.logger.error(f"Errore cattura frame: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500

@app.route('/capture_remote_photo')
def capture_remote_photo():
    """Serve il template per la cattura foto remota"""
    return render_template('RemoteCapture.html')

@app.route('/remote_photo_data', methods=['POST'])
def remote_photo_data():
    """Riceve e processa foto catturate remotamente dalla dashboard"""
    try:
        data = request.get_json()
        if not data or 'photo_data' not in data:
            return jsonify({"error": "Dati foto mancanti"}), 400
        
        photo_data = data['photo_data']
        app.logger.info("Foto ricevuta dalla dashboard per il processing")
        
        # Invia la foto alla Dashboard per il salvataggio
        if dashboard_url:
            try:
                dashboard_response = requests.post(
                    f"{dashboard_url}/receive_remote_photo",
                    json={
                        "photo_data": photo_data,
                        "timestamp": datetime.datetime.now().isoformat()
                    },
                    timeout=30
                )
                
                if dashboard_response.ok:
                    dashboard_result = dashboard_response.json()
                    app.logger.info(f"Foto inviata alla Dashboard: {dashboard_result}")
                    return jsonify({
                        "status": "success", 
                        "message": "Foto ricevuta e inviata alla Dashboard",
                        "dashboard_response": dashboard_result
                    })
                else:
                    app.logger.error(f"Errore invio foto alla Dashboard: {dashboard_response.status_code}")
                    return jsonify({"error": "Errore durante l'invio alla Dashboard"}), 502
                    
            except requests.exceptions.Timeout:
                app.logger.error("Timeout nell'invio foto alla Dashboard")
                return jsonify({"error": "Timeout Dashboard"}), 504
            except requests.exceptions.ConnectionError:
                app.logger.error("Errore di connessione alla Dashboard")
                return jsonify({"error": "Dashboard non raggiungibile"}), 503
            except Exception as e:
                app.logger.error(f"Errore generico invio Dashboard: {str(e)}")
                return jsonify({"error": f"Errore Dashboard: {str(e)}"}), 500
        else:
            app.logger.warning("URL Dashboard non configurato")
            return jsonify({"error": "URL Dashboard non configurato"}), 400
        
    except Exception as e:
        app.logger.error(f"Errore processing foto remota: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500
    

# Punto di ingresso dell'applicazione
if __name__ == '__main__':
    # Avvia il server Flask in modalità debug su tutte le interfacce di rete
    app.run(debug=True, host='0.0.0.0', port=5002)