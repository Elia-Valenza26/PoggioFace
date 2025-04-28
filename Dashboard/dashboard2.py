from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
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

# Endpoint Home - Dashboard HTML
@app.route('/')
def index():
    return render_template('dashboard2.html')

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


# Endpoint Eliminazione Soggetto + Immagini
@app.route('/subjects/<string:subject_name>', methods=['DELETE'])
def delete_subject(subject_name):
    try:
        retry(lambda: safe_delete_all_subject_faces(subject_name), retries=3, delay=1)
        retry(lambda: safe_delete_subject(subject_name), retries=3, delay=1)
        return jsonify({"message": f"Soggetto '{subject_name}' e tutte le immagini associate eliminate."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint Eliminazione Immagine Specifica
@app.route('/images/<string:image_id>', methods=['DELETE'])
def delete_image(image_id):
    try: 
        time.sleep(0.5)
        subject_dict = list_subjects().get_json()
        # Recupera il nome del soggetto associato all'immagine passata in input
        subject_name = next((subject for subject, images in subject_dict.items() if image_id in images), None)

        # conta il numero di immagini associate al soggetto
        if subject_name is None:
            return jsonify({"error": "Immagine o soggetto non trovato"}), 404
        
        # Se il soggetto ha più immagini, elimina solo l'immagine in input
        if len(subject_dict[subject_name]) > 1:
            response = retry(lambda: safe_delete_image(image_id), retries=3, delay=1)
            return jsonify(response)
        else:
            # Se il soggetto ha solo un'immagine, elimina il soggetto completo
            retry(lambda: safe_delete_all_subject_faces(subject_name), retries=3, delay=1)
            retry(lambda: safe_delete_subject(subject_name), retries=3, delay=1)
            return jsonify({"message": f"Poiché il soggetto '{subject_name}' ha solo un'immagine, il soggetto è stato eliminato."})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Avvio Server
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
