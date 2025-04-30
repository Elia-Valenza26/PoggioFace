from flask import Flask, Response, request, jsonify, render_template
from dotenv import load_dotenv
import logging
import os
import time
import requests
from compreface import CompreFace
from compreface.collections import FaceCollection
from compreface.service import RecognitionService
from compreface.collections.face_collections import Subjects

# Inizializzazione ambiente
load_dotenv()
DOMAIN: str = os.getenv('HOST', 'http://localhost')
PORT: str = os.getenv('PORT', '8000')
API_KEY: str = os.getenv('API_KEY')
DETECTION_PROBABILITY_THRESHOLD: float = float(os.getenv('DETECTION_PROBABILITY_THRESHOLD', 0.8))

logging.basicConfig(level=logging.INFO)

# Inizializzazione CompreFace
compre_face: CompreFace = CompreFace(domain=DOMAIN, port=PORT, options={
    "detection_probability_threshold": DETECTION_PROBABILITY_THRESHOLD
})

recognition: RecognitionService = compre_face.init_face_recognition(API_KEY)
face_collection: FaceCollection = recognition.get_face_collection()
subjects: Subjects = recognition.get_subjects()

# Inizializzazione Flask
app = Flask(__name__)

# Funzione per retry automatico
def retry(func, retries=3, delay=2):
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
    """Retry a function with exponential backoff."""
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


# Funzioni sicure per CompreFace
def safe_list_faces():
    return face_collection.list()

def safe_add_subject(subject_name):
    return subjects.add(subject_name)

def safe_add_image(image_path, subject_name):
    return face_collection.add(image_path=image_path, subject=subject_name)

def safe_delete_all_subject_faces(subject_name):
    return face_collection.delete_all(subject=subject_name)

def safe_delete_subject(subject_name):
    return subjects.delete(subject_name)

def safe_delete_image(image_id):
    return face_collection.delete(image_id=image_id)

# Funzione per riinizializzare la connessione a CompreFace
def refresh_compre_face_connection():
    global recognition, face_collection, subjects
    # Rinnovare la connessione al server
    recognition = compre_face.init_face_recognition(API_KEY)
    face_collection = recognition.get_face_collection()
    subjects = recognition.get_subjects()

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

# Endpoint Home - Dashboard HTML
@app.route('/')
def index():
    compreface_base_url = f"{DOMAIN}:{PORT}"
    return render_template('Dashboard.html', compreface_base_url=compreface_base_url)

# Endpoint Lista Soggetti + Immagini
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

# Endpoint Aggiunta Nuovo Soggetto
@app.route('/subjects', methods=['POST'])
def add_subject():
    try:
        subject_name = request.form.get('subject')
        image = request.files.get('image')

        # Verifica che il nome del soggetto e l'immagine siano presenti
        if not subject_name or not image:
            return jsonify({"error": "Nome soggetto e immagine sono richiesti."}), 400

        # Salvataggio temporaneo dell'immagine
        temp_path = f"./tmp/{image.filename}"
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)  # Crea la cartella se non esiste
        image.save(temp_path)

        # Registrazione del soggetto nella collezione
        retry(lambda: safe_add_subject(subject_name), retries=3, delay=1)

        # Aggiungi l'immagine per il soggetto
        response = retry(lambda: safe_add_image(temp_path, subject_name), retries=3, delay=1)

        os.remove(temp_path)  # Pulisci il file temporaneo dopo l'uso

        # Verifica la risposta
        if 'image_id' not in response:
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine."}), 500

        return jsonify({"message": f"Soggetto '{subject_name}' e immagine aggiunti con successo."}), 200

    except Exception as e:
        return jsonify({"error": f"Errore durante l'aggiunta del soggetto: {str(e)}"}), 500


# Endpoint Aggiungi Immagine a un Soggetto Esistente
@app.route('/subjects/<string:subject_name>/images', methods=['POST'])
def add_image_to_subject(subject_name):
    try:
        # Verifica che il nome del soggetto sia valido
        all_subjects = retry(lambda: subjects.list(), retries=3, delay=1)
        
        if subject_name not in all_subjects.get('subjects', []):
            return jsonify({"error": f"Soggetto '{subject_name}' non trovato."}), 404
        
        image = request.files.get('image')
        
        if not image:
            return jsonify({"error": "Immagine è richiesta."}), 400

        # Salvataggio temporaneo dell'immagine
        temp_path = f"./tmp/{image.filename}"
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)  # Crea la cartella se non esiste
        image.save(temp_path)

        # Aggiungi l'immagine al soggetto
        response = retry(lambda: safe_add_image(temp_path, subject_name), retries=3, delay=1)

        os.remove(temp_path)  # Pulisci il file temporaneo dopo l'uso

        # Verifica la risposta
        if 'image_id' not in response:
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine."}), 500

        return jsonify({"message": f"Immagine aggiunta con successo al soggetto '{subject_name}'."}), 200

    except Exception as e:
        return jsonify({"error": f"Errore durante l'aggiunta dell'immagine: {str(e)}"}), 500

# Endpoint Rinominazione Soggetto
@app.route('/subjects/<string:old_subject_name>', methods=['PUT'])
def rename_subject(old_subject_name):
    try:
        data = request.get_json()
        new_subject_name = data.get('new_name')
        
        if not new_subject_name:
            return jsonify({"error": "Il nuovo nome del soggetto è richiesto."}), 400

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

# Endpoint Eliminazione Soggetto + Immagini
@app.route('/subjects/<string:subject_name>', methods=['DELETE'])
def delete_subject(subject_name):
    try:
        logging.info(f"Inizio eliminazione del soggetto: {subject_name}")
        
        # Recupera tutte le immagini associate al soggetto
        all_faces = retry(safe_list_faces, retries=3, delay=1)
        subject_images = [face['image_id'] for face in all_faces.get('faces', []) if face['subject'] == subject_name]

        # Elimina tutte le immagini prima di eliminare il soggetto
        for image_id in subject_images:
            retry_with_backoff(lambda: safe_delete_image(image_id), retries=5, initial_delay=1, max_delay=5, backoff_factor=2)

        # Elimina il soggetto dopo che tutte le immagini sono state rimosse
        retry_with_backoff(lambda: safe_delete_subject(subject_name), retries=5, initial_delay=1, max_delay=5, backoff_factor=2)

        # Rinnova la connessione a CompreFace
        refresh_compre_face_connection()
        logging.info(f"Soggetto '{subject_name}' e tutte le immagini associate eliminate con successo.")
        return jsonify({"message": f"Soggetto '{subject_name}' e tutte le immagini associate eliminate."})

    except Exception as e:
        logging.error(f"Errore durante la cancellazione del soggetto {subject_name}: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Endpoint Eliminazione Immagine Specifica
@app.route('/images/<string:image_id>', methods=['DELETE'])
def delete_image(image_id):
    try:
        # Ottieni le informazioni sull'immagine in una richiesta separata
        all_faces = face_collection.list()
        
        # Elabora le informazioni localmente
        subject_name = None
        image_count = 0
        
        for face in all_faces.get('faces', []):
            if face['image_id'] == image_id:
                subject_name = face['subject']
        
        if subject_name is None:
            return jsonify({"error": "Immagine non trovata"}), 404
        
        # Conta le immagini per questo soggetto
        for face in all_faces.get('faces', []):
            if face['subject'] == subject_name:
                image_count += 1
        
        # Ora esegui l'operazione di eliminazione in modo sincrono
        if image_count > 1:
            # Elimina solo l'immagine
            face_collection.delete(image_id=image_id)
            return jsonify({"message": "Immagine eliminata con successo."})
        else:
            retry(lambda: safe_delete_all_subject_faces(subject_name), retries=5, delay=2)
            retry(lambda: safe_delete_subject(subject_name), retries=5, delay=2)
            refresh_compre_face_connection()
            return jsonify({"message": f"Soggetto '{subject_name}' e tutte le immagini associate eliminate."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Avvio Server
if __name__ == '__main__':
    app.run(debug=True,host='0.0.0.0', port=5000)
