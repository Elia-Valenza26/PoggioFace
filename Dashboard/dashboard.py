from flask import Flask, Response, request, jsonify, render_template, session, redirect, url_for, flash
from dotenv import load_dotenv
import logging
import os
import time
import datetime
import requests
import uuid
import base64
import hashlib
from functools import wraps
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

# Configurazione delle credenziali per la dashboard
DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD')
SECRET_KEY = os.getenv('SECRET_KEY')

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
TMP_FOLDER_PATH = os.path.join(APP_ROOT, 'tmp')
os.makedirs(TMP_FOLDER_PATH, exist_ok=True)


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
app.secret_key = SECRET_KEY

# Funzione per hashare la password
def hash_password(password):
    """Genera un hash SHA-256 della password"""
    return hashlib.sha256(password.encode()).hexdigest()

# Funzione per verificare la password
def verify_password(password, hashed):
    """Verifica se la password corrisponde all'hash"""
    return hash_password(password) == hashed

# Hash della password di configurazione (generato una sola volta all'avvio)
HASHED_PASSWORD = hash_password(DASHBOARD_PASSWORD)

# Decorator per richiedere il login
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


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

# Route per il login
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        password = request.form.get('password')
        
        if password and verify_password(password, HASHED_PASSWORD):
            session['logged_in'] = True
            session['login_time'] = datetime.datetime.now().isoformat()
            app.logger.info("Login effettuato con successo")
            return redirect(url_for('index'))
        else:
            app.logger.warning("Tentativo di login fallito")
            flash('Password non corretta', 'danger')
    
    return render_template('login.html')


# Endpoint principale per servire la dashboard HTML
@app.route('/')
@login_required
def index():
    compreface_base_url = f"{DOMAIN}:{PORT}"
    return render_template('dashboard.html', compreface_base_url=compreface_base_url)

# Route per il logout
@app.route('/logout')
def logout():
    session.clear()
    flash('Logout effettuato con successo', 'success')
    return redirect(url_for('login'))

# Endpoint per ottenere la configurazione dell'URL del servizio di riconoscimento facciale
@app.route('/config')
def get_config():
    return jsonify({
        'poggio_face_url': os.getenv('POGGIO_FACE_URL', 'http://localhost:5002')
    })


# Endpoint proxy per servire immagini dal server CompreFace
@app.route('/proxy/images/<uuid:image_id>')
@login_required
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


# Endpoint per ottenere la lista di tutti i soggetti con le loro immagini associate
@app.route('/subjects', methods=['GET'])
@login_required
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
@login_required
def add_subject():
    image_path = None
    cleanup_temp = False

    try:
        subject_name = request.form.get('subject')
        image_file = request.files.get('image')
        temp_path_form = request.form.get('temp_path') # Questo sarà un percorso assoluto se proviene da receive_remote_photo

        app.logger.info(f"Tentativo di aggiunta soggetto: {subject_name}, image_file: {image_file}, temp_path_form: {temp_path_form}")

        if not subject_name or (not image_file and not temp_path_form):
            app.logger.error("Nome soggetto e immagine (o percorso temporaneo) sono richiesti.")
            return jsonify({"error": "Nome soggetto e immagine (o percorso temporaneo) sono richiesti."}), 400

        existing_subjects = retry(lambda: subjects.list(), retries=3, delay=1).get('subjects', [])
        if subject_name in existing_subjects:
            app.logger.warning(f"Tentativo di aggiungere un soggetto esistente: {subject_name}")
            return jsonify({"error": f"Soggetto '{subject_name}' esiste già."}), 409

        if temp_path_form and os.path.exists(temp_path_form):
            image_path = temp_path_form # temp_path_form è già un percorso assoluto
            cleanup_temp = True
            app.logger.info(f"Usando file temporaneo (absolute) per nuovo soggetto: {image_path}")
        elif image_file:
            filename = image_file.filename
            if not filename:
                 app.logger.error("Nome file immagine vuoto per nuovo soggetto.")
                 return jsonify({"error": "Nome file immagine non valido."}), 400
            
            image_path = os.path.join(TMP_FOLDER_PATH, filename) # Crea percorso assoluto
            os.makedirs(TMP_FOLDER_PATH, exist_ok=True) # Assicura che la directory esista
            image_file.save(image_path)
            cleanup_temp = True
            app.logger.info(f"File salvato per nuovo soggetto come (absolute): {image_path}")
        else:
            app.logger.error("Nessuna immagine valida fornita per nuovo soggetto.")
            return jsonify({"error": "Immagine valida è richiesta."}), 400

        app.logger.info(f"Aggiunta soggetto '{subject_name}' a CompreFace.")
        retry(lambda: safe_add_subject(subject_name), retries=3, delay=1)

        app.logger.info(f"Aggiunta immagine '{image_path}' al soggetto '{subject_name}'.")
        response = retry(lambda: safe_add_image(image_path, subject_name), retries=3, delay=1)

        if 'image_id' not in response:
            app.logger.error(f"Risposta CompreFace non valida per aggiunta immagine a nuovo soggetto: {response}")
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine al nuovo soggetto."}), 500
        
        app.logger.info(f"Soggetto '{subject_name}' e immagine aggiunti con successo. ID immagine: {response.get('image_id')}")
        return jsonify({"message": f"Soggetto '{subject_name}' e immagine aggiunti con successo."}), 200

    except Exception as e:
        app.logger.error(f"Errore generale durante l'aggiunta del soggetto: {str(e)}")
        return jsonify({"error": f"Errore generale durante l'aggiunta del soggetto: {str(e)}"}), 500
    finally:
        if cleanup_temp and image_path and os.path.exists(image_path): # image_path è assoluto
            try:
                os.remove(image_path) # image_path è assoluto
                app.logger.info(f"File temporaneo rimosso con successo (finally add_subject): {image_path}")
            except Exception as cleanup_error:
                app.logger.warning(f"Errore durante la rimozione del file temporaneo (finally add_subject) {image_path}: {str(cleanup_error)}")
        elif cleanup_temp and image_path:
             app.logger.info(f"File temporaneo {image_path} non trovato per la pulizia (finally add_subject) o non previsto per la pulizia.")


# Endpoint per aggiungere un'immagine aggiuntiva a un soggetto esistente
@app.route('/subjects/<string:subject_name>/images', methods=['POST'])
@login_required
def add_image_to_subject(subject_name):
    image_path = None
    cleanup_temp = False

    try:
        app.logger.info(f"Aggiunta immagine per soggetto: {subject_name}")
        
        all_subjects_list = retry(lambda: subjects.list(), retries=3, delay=1)
        if subject_name not in all_subjects_list.get('subjects', []):
            app.logger.error(f"Soggetto '{subject_name}' non trovato")
            return jsonify({"error": f"Soggetto '{subject_name}' non trovato."}), 404
        
        image_file = request.files.get('image')
        temp_path_form = request.form.get('temp_path') # Questo sarà un percorso assoluto
        
        app.logger.info(f"Image file: {image_file}, temp_path: {temp_path_form}")
        
        if not image_file and not temp_path_form:
            app.logger.error("Nessuna immagine o percorso temporaneo fornito")
            return jsonify({"error": "Immagine è richiesta."}), 400
        
        if temp_path_form and os.path.exists(temp_path_form):
            image_path = temp_path_form # temp_path_form è già un percorso assoluto
            cleanup_temp = True 
            app.logger.info(f"Usando file temporaneo (absolute): {image_path}")
        elif image_file:
            filename = image_file.filename 
            if not filename:
                 app.logger.error("Nome file immagine vuoto.")
                 return jsonify({"error": "Nome file immagine non valido."}), 400

            image_path = os.path.join(TMP_FOLDER_PATH, filename) # Crea percorso assoluto
            os.makedirs(TMP_FOLDER_PATH, exist_ok=True) # Assicura che la directory esista
            image_file.save(image_path)
            cleanup_temp = True
            app.logger.info(f"File salvato come (absolute): {image_path}")
        else:
            app.logger.error("Nessuna immagine valida fornita.")
            return jsonify({"error": "Immagine valida è richiesta."}), 400

        app.logger.info(f"Aggiunta immagine a CompreFace: {image_path}")
        response = retry(lambda: safe_add_image(image_path, subject_name), retries=3, delay=1)

        if 'image_id' not in response:
            app.logger.error(f"Risposta CompreFace non valida: {response}")
            return jsonify({"error": "Errore durante l'aggiunta dell'immagine a CompreFace."}), 500

        app.logger.info(f"Immagine aggiunta con successo, ID: {response.get('image_id')}")
        return jsonify({"message": f"Immagine aggiunta con successo al soggetto '{subject_name}'."}), 200

    except Exception as e:
        app.logger.error(f"Errore generale durante l'aggiunta dell'immagine: {str(e)}")
        return jsonify({"error": f"Errore generale durante l'aggiunta dell'immagine: {str(e)}"}), 500
    finally:
        if cleanup_temp and image_path and os.path.exists(image_path): # image_path è assoluto
            try:
                os.remove(image_path) # image_path è assoluto
                app.logger.info(f"File temporaneo rimosso con successo (finally add_image_to_subject): {image_path}")
            except Exception as cleanup_error:
                app.logger.warning(f"Errore durante la rimozione del file temporaneo (finally add_image_to_subject) {image_path}: {str(cleanup_error)}")
        elif cleanup_temp and image_path:
             app.logger.info(f"File temporaneo {image_path} non trovato per la pulizia (finally add_image_to_subject) o non previsto per la pulizia.")

# Endpoint per rinominare un soggetto esistente
@app.route('/subjects/<string:old_subject_name>', methods=['PUT'])
@login_required
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
@login_required
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
@login_required
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
@login_required
def receive_remote_photo():
    try:
        # Aggiungi logging per debug
        app.logger.info(f"=== RICEVUTA RICHIESTA FOTO REMOTA DA POGGIOFACE ===")
        app.logger.info(f"Ricevuta richiesta foto remota - Content-Type: {request.content_type}")
        app.logger.info(f"Headers: {dict(request.headers)}")
        app.logger.info(f"Remote IP: {request.remote_addr}")
        
        json_data = request.get_json()
        if not json_data or 'photo_data' not in json_data:
            app.logger.error("Dati foto mancanti nella richiesta JSON")
            return jsonify({"error": "Dati foto mancanti"}), 400

        photo_data_b64 = json_data['photo_data']
        app.logger.info(f"Dimensione dati foto ricevuti: {len(photo_data_b64)} caratteri")
        
        # Decodifica l'immagine da base64
        try:
            # Rimuovi il prefisso 'data:image/...;base64,' se presente
            if ',' in photo_data_b64:
                header, encoded = photo_data_b64.split(',', 1)
                image_data = base64.b64decode(encoded)
            else:
                image_data = base64.b64decode(photo_data_b64)
        except Exception as e:
            app.logger.error(f"Errore decodifica base64: {str(e)}")
            return jsonify({"error": "Formato immagine non valido"}), 400

        # Genera nome file univoco e percorso assoluto
        filename = f"remote_{uuid.uuid4().hex}.jpg"
        temp_path = os.path.join(TMP_FOLDER_PATH, filename)

        os.makedirs(TMP_FOLDER_PATH, exist_ok=True)
        
        try:
            with open(temp_path, 'wb') as f:
                f.write(image_data)
            app.logger.info(f"Foto remota salvata: {temp_path}")
        except Exception as e:
            app.logger.error(f"Errore salvataggio file: {str(e)}")
            return jsonify({"error": "Errore salvataggio file"}), 500
        
        response_data = {
            "status": "success",
            "message": "Foto ricevuta e salvata",
            "filename": filename,
            "temp_path": temp_path
        }
        
        app.logger.info(f"=== FOTO SALVATA CON SUCCESSO ===")
        app.logger.info(f"Risposta inviata: {response_data}")
        app.logger.info(f"=== FINE ELABORAZIONE FOTO REMOTA ===")
        return jsonify(response_data)
        
    except Exception as e:
        app.logger.error(f"Errore ricezione foto remota: {str(e)}")
        return jsonify({"error": f"Errore generico: {str(e)}"}), 500
    
@app.route('/cleanup_temp', methods=['POST'])
@login_required
def cleanup_temp_folder():
    """
    Endpoint per eliminare tutti i file nella cartella temporanea.
    """
    try:
        app.logger.info(f"Avvio pulizia cartella temporanea: {TMP_FOLDER_PATH}")
        if not os.path.isdir(TMP_FOLDER_PATH):
            app.logger.info("La cartella temporanea non esiste, nessuna pulizia necessaria.")
            return jsonify({"status": "success", "message": "La cartella temporanea non esiste."}), 200

        for filename in os.listdir(TMP_FOLDER_PATH):
            file_path = os.path.join(TMP_FOLDER_PATH, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                    app.logger.info(f"File temporaneo rimosso: {file_path}")
            except Exception as e:
                app.logger.error(f"Errore durante la rimozione del file {file_path}: {e}")
        
        return jsonify({"status": "success", "message": "Pulizia della cartella temporanea completata."}), 200
    except Exception as e:
        app.logger.error(f"Errore durante la pulizia della cartella temporanea: {e}")
        return jsonify({"error": "Errore durante la pulizia della cartella temporanea."}), 500


# Avvio del server Flask in modalità debug su tutte le interfacce di rete
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
