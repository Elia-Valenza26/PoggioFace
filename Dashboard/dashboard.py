from flask import Flask, Response, request, jsonify, render_template
from dotenv import load_dotenv
import logging
import os
import time
import datetime
import requests
from compreface import CompreFace
from compreface.collections import FaceCollection
from compreface.service import RecognitionService
from compreface.collections.face_collections import Subjects

# Caricamento variabili d'ambiente e configurazione
load_dotenv()
DOMAIN: str = os.getenv('HOST', 'http://localhost')
PORT: str = os.getenv('PORT', '8000')
API_KEY: str = os.getenv('API_KEY')
DETECTION_PROBABILITY_THRESHOLD: float = float(os.getenv('DETECTION_PROBABILITY_THRESHOLD', 0.8))

# Configurazione logging
logging.basicConfig(level=logging.INFO)

# Inizializzazione connessione CompreFace con soglia di probabilità di rilevamento
compre_face: CompreFace = CompreFace(domain=DOMAIN, port=PORT, options={
    "detection_probability_threshold": DETECTION_PROBABILITY_THRESHOLD
})

# Inizializzazione servizi CompreFace per riconoscimento facciale
recognition: RecognitionService = compre_face.init_face_recognition(API_KEY)
face_collection: FaceCollection = recognition.get_face_collection()
subjects: Subjects = recognition.get_subjects()

# Inizializzazione applicazione Flask
app = Flask(__name__)

# Funzione per retry con numero fisso di tentativi
def retry(func, retries=3, delay=2):
    """Esegue una funzione con retry in caso di errore di rete."""
    for i in range(retries):
        try:
            return func()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            if i < retries - 1:
                time.sleep(delay)
            else:
                raise Exception(f"Errore di rete: {str(e)}")
        except Exception as e:
            raise Exception(f"Errore imprevisto: {str(e)}")

def retry_with_backoff(func, retries=10, initial_delay=1, max_delay=10, backoff_factor=2):
    """Esegue una funzione con retry e backoff esponenziale per gestire carichi elevati."""
    delay = initial_delay
    last_exception = None

    for attempt in range(retries):
        try:
            return func()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            print(f"Tentativo {attempt+1}/{retries} fallito con errore di connessione: {str(e)}")
            last_exception = e
            time.sleep(delay)
            delay = min(delay * backoff_factor, max_delay)
        except Exception as e:
            print(f"Errore non di connessione durante il tentativo {attempt+1}/{retries}: {str(e)}")
            raise e

    raise last_exception or Exception("Tutti i tentativi falliti")

# Wrapper sicuri per le operazioni CompreFace - evitano eccezioni non gestite
def safe_list_faces():
    """Wrapper sicuro per listare tutte le facce nella collezione."""
    return face_collection.list()

def safe_add_subject(subject_name):
    """Wrapper sicuro per aggiungere un nuovo soggetto."""
    return subjects.add(subject_name)

def safe_add_image(image_path, subject_name):
    """Wrapper sicuro per aggiungere un'immagine a un soggetto."""
    return face_collection.add(image_path=image_path, subject=subject_name)

def safe_delete_all_subject_faces(subject_name):
    """Wrapper sicuro per eliminare tutte le immagini di un soggetto."""
    return face_collection.delete_all(subject=subject_name)

def safe_delete_subject(subject_name):
    """Wrapper sicuro per eliminare un soggetto."""
    return subjects.delete(subject_name)

def safe_delete_image(image_id):
    """Wrapper sicuro per eliminare un'immagine specifica tramite ID."""
    return face_collection.delete(image_id=image_id)

def refresh_compre_face_connection():
    """Riinizializza la connessione a CompreFace per evitare problemi di stato."""
    global recognition, face_collection, subjects
    recognition = compre_face.init_face_recognition(API_KEY)
    face_collection = recognition.get_face_collection()
    subjects = recognition.get_subjects()

# Endpoint per ottenere la configurazione dell'URL del servizio di riconoscimento facciale
@app.route('/config')
def get_config():
    return jsonify({
        'poggio_face_url': os.getenv('POGGIO_FACE_URL', 'http://localhost:5002')
    })

# Endpoint proxy per servire immagini dal server CompreFace
@app.route('/proxy/images/<uuid:image_id>')
def proxy_image(image_id):
    try:
        url = f"{DOMAIN}:{PORT}/api/v1/recognition/faces/{image_id}/img"
        headers = {'x-api-key': API_KEY}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            return Response(
                response.content,
                content_type=response.headers['Content-Type']
            )
        return Response(b'', status=404)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint principale per servire la dashboard HTML
@app.route('/')
def index():
    compreface_base_url = f"{DOMAIN}:{PORT}"
    return render_template('dashboard.html', compreface_base_url=compreface_base_url)

# Endpoint per ottenere la lista di tutti i soggetti con le loro immagini associate
@app.route('/subjects', methods=['GET'])
def list_subjects():
    try:
        all_faces = retry(safe_list_faces, retries=3, delay=1)
        subjects_dict = {}
        for face in all_faces.get('faces', []):
            subject = face['subject']
            if subject not in subjects_dict:
                subjects_dict[subject] = []
            subjects_dict[subject].append(face['image_id'])
        return jsonify(subjects_dict)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint per aggiungere un nuovo soggetto con la sua prima immagine
@app.route('/subjects', methods=['POST'])
def add_subject():
    try:
        subject_name = request.form.get('subject')
        image = request.files.get('image')

        # Validazione input
        if not subject_name or not image:
            return jsonify({"error": "Nome soggetto e immagine sono richiesti."}), 400

        # Salvataggio temporaneo dell'immagine per il processing
        temp_path = f"./tmp/{image.filename}"
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        image.save(temp_path)

        # Registrazione del soggetto nella collezione CompreFace
        retry(lambda: safe_add_subject(subject_name), retries=3, delay=1)

        # Aggiunta dell'immagine al soggetto
        response = retry(lambda: safe_add_image(temp_path, subject_name), retries=3, delay=1)

        # Pulizia file temporaneo
        os.remove(temp_path)

        # Verifica successo operazione
        if 'image_id' not in response:
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine."}), 500

        return jsonify({"message": f"Soggetto '{subject_name}' e immagine aggiunti con successo."}), 200

    except Exception as e:
        return jsonify({"error": f"Errore durante l'aggiunta del soggetto: {str(e)}"}), 500

# Endpoint per aggiungere un'immagine aggiuntiva a un soggetto esistente
@app.route('/subjects/<string:subject_name>/images', methods=['POST'])
def add_image_to_subject(subject_name):
    try:
        # Verifica esistenza del soggetto
        all_subjects = retry(lambda: subjects.list(), retries=3, delay=1)
        
        if subject_name not in all_subjects.get('subjects', []):
            return jsonify({"error": f"Soggetto '{subject_name}' non trovato."}), 404
        
        image = request.files.get('image')
        
        if not image:
            return jsonify({"error": "Immagine è richiesta."}), 400

        # Salvataggio temporaneo dell'immagine
        temp_path = f"./tmp/{image.filename}"
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        image.save(temp_path)

        # Aggiunta immagine al soggetto esistente
        response = retry(lambda: safe_add_image(temp_path, subject_name), retries=3, delay=1)

        # Pulizia file temporaneo
        os.remove(temp_path)

        # Verifica successo operazione
        if 'image_id' not in response:
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine."}), 500

        return jsonify({"message": f"Immagine aggiunta con successo al soggetto '{subject_name}'."}), 200

    except Exception as e:
        return jsonify({"error": f"Errore durante l'aggiunta dell'immagine: {str(e)}"}), 500

# Endpoint per rinominare un soggetto esistente
@app.route('/subjects/<string:old_subject_name>', methods=['PUT'])
def rename_subject(old_subject_name):
    try:
        data = request.get_json()
        new_subject_name = data.get('new_name')
        
        if not new_subject_name:
            return jsonify({"error": "Il nuovo nome del soggetto è richiesto."}), 400

        # Aggiornamento nome soggetto con retry e backoff
        response = retry_with_backoff(
            lambda: subjects.update(old_subject_name, new_subject_name),
            retries=5,
            initial_delay=1,
            max_delay=5,
            backoff_factor=2
        )

        if response.get('updated'):
            refresh_compre_face_connection()
            return jsonify({"message": f"Soggetto '{old_subject_name}' rinominato in '{new_subject_name}'."}), 200
        return jsonify({"error": "Rinominazione fallita"}), 400

    except Exception as e:
        logging.error(f"Errore durante la rinominazione: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Endpoint per eliminare completamente un soggetto e tutte le sue immagini
@app.route('/subjects/<string:subject_name>', methods=['DELETE'])
def delete_subject(subject_name):
    try:
        logging.info(f"Inizio eliminazione del soggetto: {subject_name}")
        
        # Recupero di tutte le immagini associate al soggetto
        all_faces = retry(safe_list_faces, retries=3, delay=1)
        subject_images = [face['image_id'] for face in all_faces.get('faces', []) if face['subject'] == subject_name]

        # Eliminazione di tutte le immagini prima del soggetto
        for image_id in subject_images:
            retry_with_backoff(lambda: safe_delete_image(image_id), retries=5, initial_delay=1, max_delay=5, backoff_factor=2)

        # Eliminazione del soggetto dopo rimozione immagini
        retry_with_backoff(lambda: safe_delete_subject(subject_name), retries=5, initial_delay=1, max_delay=5, backoff_factor=2)

        # Refresh connessione per evitare problemi di stato
        refresh_compre_face_connection()
        logging.info(f"Soggetto '{subject_name}' e tutte le immagini associate eliminate con successo.")
        return jsonify({"message": f"Soggetto '{subject_name}' e tutte le immagini associate eliminate."})

    except Exception as e:
        logging.error(f"Errore durante la cancellazione del soggetto {subject_name}: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Endpoint per eliminare una singola immagine tramite ID
@app.route('/images/<string:image_id>', methods=['DELETE'])
def delete_image(image_id):
    try:
        # Recupero informazioni sull'immagine e conteggio immagini per soggetto
        all_faces = face_collection.list()
        
        subject_name = None
        image_count = 0
        
        # Identificazione soggetto proprietario dell'immagine
        for face in all_faces.get('faces', []):
            if face['image_id'] == image_id:
                subject_name = face['subject']
        
        if subject_name is None:
            return jsonify({"error": "Immagine non trovata"}), 404
        
        # Conteggio immagini totali per il soggetto
        for face in all_faces.get('faces', []):
            if face['subject'] == subject_name:
                image_count += 1
        
        # Logica di eliminazione: se è l'ultima immagine, elimina anche il soggetto
        if image_count > 1:
            face_collection.delete(image_id=image_id)
            return jsonify({"message": "Immagine eliminata con successo."})
        else:
            # Eliminazione completa del soggetto se è l'ultima immagine
            retry(lambda: safe_delete_all_subject_faces(subject_name), retries=5, delay=2)
            retry(lambda: safe_delete_subject(subject_name), retries=5, delay=2)
            refresh_compre_face_connection()
            return jsonify({"message": f"Soggetto '{subject_name}' e tutte le immagini associate eliminate."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/receive_remote_photo', methods=['POST'])
def receive_remote_photo():
    """Riceve foto dal servizio PoggioFace e la salva temporaneamente"""
    try:
        data = request.get_json()
        if not data or 'photo_data' not in data:
            return jsonify({"error": "Dati foto mancanti"}), 400
        
        photo_data = data['photo_data']
        timestamp = data.get('timestamp', datetime.datetime.now().isoformat())
        
        # Estrai i dati base64 (rimuovi il prefisso data:image/jpeg;base64,)
        if photo_data.startswith('data:image/jpeg;base64,'):
            base64_data = photo_data.split(',')[1]
        else:
            base64_data = photo_data
        
        # Decodifica i dati base64
        import base64
        image_data = base64.b64decode(base64_data)
        
        # Genera nome file unico
        import uuid
        filename = f"remote_capture_{uuid.uuid4().hex}_{timestamp.replace(':', '-').replace('.', '-')}.jpg"
        temp_path = f"./tmp/{filename}"
        
        # Assicurati che la directory tmp esista
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        
        # Salva il file
        with open(temp_path, 'wb') as f:
            f.write(image_data)
        
        app.logger.info(f"Foto remota salvata: {temp_path}")
        
        return jsonify({
            "status": "success",
            "message": "Foto ricevuta e salvata",
            "filename": filename,
            "temp_path": temp_path
        })
        
    except Exception as e:
        app.logger.error(f"Errore ricezione foto remota: {str(e)}")
        return jsonify({"error": f"Errore: {str(e)}"}), 500

# Avvio del server Flask in modalità debug su tutte le interfacce di rete
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
