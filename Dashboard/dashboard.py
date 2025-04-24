from flask import Flask, request, jsonify, render_template, send_file
import requests
import time
import json
import os
from werkzeug.utils import secure_filename
import tempfile
from dotenv import load_dotenv
from flask_cors import CORS


# Carica le variabili d'ambiente da .env
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # Limite di 5MB per le immagini




# Configura le API per CompreFace
COMPREFACE_URL = os.getenv('COMPREFACE_URL', 'http://localhost:8000')
RECOGNITION_API_KEY = os.getenv('RECOGNITION_API_KEY')  # Chiave API del servizio di riconoscimento

# Headers comuni per le richieste
def get_headers(content_type='application/json'):
    return {
        'Content-Type': content_type,
        'x-api-key': RECOGNITION_API_KEY
    }

@app.route('/')
def index():
    return render_template('dashboard.html')

@app.route('/api/test-connection', methods=['GET'])
def test_connection():
    import socket
    
    host = '10.10.10.95'
    port = 8000
    timeout = 5
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        
        if result == 0:
            return jsonify({'status': 'success', 'message': 'Connessione al server CompreFace riuscita'})
        else:
            return jsonify({'status': 'error', 'message': f'Impossibile connettersi a CompreFace. Codice errore: {result}'})
            
    except socket.error as e:
        return jsonify({'status': 'error', 'message': f'Errore socket: {str(e)}'})
    finally:
        sock.close()

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        # Verifica la connessione a CompreFace
        url = f"{COMPREFACE_URL}/api/v1/recognition/subjects"
        response = requests.get(url, headers=get_headers(), timeout=3)
        
        # Se la richiesta ha successo
        if response.status_code == 200:
            return jsonify({
                'status': 'healthy',
                'compreface_connection': 'ok',
                'subjects_count': len(response.json().get('subjects', []))
            })
        else:
            return jsonify({
                'status': 'degraded',
                'compreface_connection': f'error: {response.status_code}',
                'message': 'CompreFace API non risponde correttamente'
            })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'compreface_connection': 'failed',
            'error': str(e)
        }), 500

# Endpoint per ottenere tutti i soggetti con retry avanzato
@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    max_retries = 5  # Aumenta il numero di tentativi di retry
    retry_count = 0
    retry_delay = 1  # secondi per iniziare il backoff

    while retry_count < max_retries:
        try:
            url = f"{COMPREFACE_URL}/api/v1/recognition/subjects"
            response = requests.get(url, headers=get_headers(), timeout=10)
            response.raise_for_status()
            
            # Verifica che la risposta contenga dati validi
            if 'subjects' not in response.json():
                app.logger.error("Formato risposta non valido da CompreFace")
                return jsonify({'error': 'Formato dati non valido'}), 500
                
            return jsonify(response.json())
        
        except requests.exceptions.Timeout:
            retry_count += 1
            app.logger.warning(f"Timeout recupero soggetti, tentativo {retry_count}/{max_retries}")
            if retry_count < max_retries:
                time.sleep(retry_delay)
                retry_delay *= 2  # Aumento esponenziale del backoff
            else:
                return jsonify({'error': 'Timeout nella connessione al server CompreFace'}), 504
        
        except requests.exceptions.ConnectionError:
            retry_count += 1
            app.logger.warning(f"Errore connessione recupero soggetti, tentativo {retry_count}/{max_retries}")
            if retry_count < max_retries:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                return jsonify({'error': 'Impossibile connettersi al server CompreFace'}), 503
        
        except requests.exceptions.HTTPError as e:
            app.logger.error(f"Errore CompreFace: {e.response.text}")
            return jsonify({'error': f"Errore backend: {e.response.text}"}), e.response.status_code
        
        except Exception as e:
            app.logger.error(f"Errore generico: {str(e)}")
            return jsonify({'error': 'Errore interno del server'}), 500

# Endpoint per ottenere tutte le immagini di un soggetto
@app.route('/api/subjects/<subject>/images', methods=['GET'])
def get_subject_images(subject):
    try:
        url = f"{COMPREFACE_URL}/api/v1/recognition/faces?subject={subject}"
        response = requests.get(url, headers=get_headers())
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per scaricare un'immagine per ID
@app.route('/api/images/<image_id>', methods=['GET'])
def get_image(image_id):
    try:
        # Scarica l'immagine da CompreFace
        url = f"{COMPREFACE_URL}/api/v1/recognition/faces/{image_id}/img"
        headers = {'x-api-key': RECOGNITION_API_KEY}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        # Salva temporaneamente l'immagine
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{image_id}.jpg")
        with open(temp_path, 'wb') as f:
            f.write(response.content)
        
        # Invia il file
        return send_file(temp_path, mimetype='image/jpeg', as_attachment=True)                
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per aggiungere un nuovo soggetto con immagine
@app.route('/api/subjects', methods=['POST'])
def add_subject():
    try:
        subject = request.form.get('subject')
        if not subject:
            return jsonify({'error': 'Nome del soggetto mancante'}), 400
            
        # Crea prima il soggetto
        url_create = f"{COMPREFACE_URL}/api/v1/recognition/subjects"
        response_create = requests.post(
            url_create, 
            headers=get_headers(),
            json={'subject': subject}
        )
        
        # Verifica se c'è un'immagine
        if 'image' not in request.files:
            return jsonify({'error': 'Immagine mancante'}), 400
            
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({'error': 'Nessun file selezionato'}), 400
        
        # Salva l'immagine e aggiungi al soggetto
        url_add_face = f"{COMPREFACE_URL}/api/v1/recognition/faces?subject={subject}"
        files = {'file': (image_file.filename, image_file, image_file.content_type)}
        headers = {'x-api-key': RECOGNITION_API_KEY}
        
        response_face = requests.post(url_add_face, headers=headers, files=files)
        response_face.raise_for_status()
        
        return jsonify(response_face.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per rinominare un soggetto
@app.route('/api/subjects/<old_subject>', methods=['PUT'])
def rename_subject(old_subject):
    try:
        data = request.get_json()
        new_subject = data.get('subject')
        
        if not new_subject:
            return jsonify({'error': 'Nuovo nome del soggetto mancante'}), 400
            
        url = f"{COMPREFACE_URL}/api/v1/recognition/subjects/{old_subject}"
        response = requests.put(
            url, 
            headers=get_headers(),
            json={'subject': new_subject}
        )
        response.raise_for_status()
        
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per aggiungere una foto a un soggetto esistente
@app.route('/api/subjects/<subject>/images', methods=['POST'])
def add_subject_image(subject):
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'Immagine mancante'}), 400
            
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({'error': 'Nessun file selezionato'}), 400
        
        # Aggiungi l'immagine al soggetto
        url = f"{COMPREFACE_URL}/api/v1/recognition/faces?subject={subject}"
        files = {'file': (image_file.filename, image_file, image_file.content_type)}
        headers = {'x-api-key': RECOGNITION_API_KEY}
        
        response = requests.post(url, headers=headers, files=files)
        response.raise_for_status()
        
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per eliminare un'immagine specifica
@app.route('/api/images/<image_id>', methods=['DELETE'])
def delete_image(image_id):
    try:
        url = f"{COMPREFACE_URL}/api/v1/recognition/faces/{image_id}"
        
        # Utilizza un timeout più breve per l'operazione di eliminazione
        response = requests.delete(url, headers=get_headers(), timeout=5)
        response.raise_for_status()
        
        # In caso di successo, restituisci un risultato positivo senza attendere ulteriori conferme
        return jsonify({'success': True, 'message': 'Immagine eliminata con successo'})
    except requests.exceptions.Timeout:
        app.logger.error(f"Timeout durante l'eliminazione dell'immagine {image_id}")
        # Considera l'operazione "probabilmente riuscita" anche in caso di timeout
        return jsonify({'success': True, 'message': 'Richiesta inviata ma timeout nella risposta. L\'operazione potrebbe essere stata completata.'})
    except Exception as e:
        app.logger.error(f"Errore durante l'eliminazione dell'immagine {image_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Endpoint per eliminare più immagini contemporaneamente
@app.route('/api/images/delete', methods=['POST'])
def delete_multiple_images():
    try:
        data = request.get_json()
        image_ids = data.get('image_ids', [])
        
        if not image_ids:
            return jsonify({'error': 'Nessun ID immagine fornito'}), 400
            
        url = f"{COMPREFACE_URL}/api/v1/recognition/faces/delete"
        response = requests.post(
            url, 
            headers=get_headers(),
            json=image_ids
        )
        response.raise_for_status()
        
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# Endpoint per eliminare un soggetto completo con timeout breve
@app.route('/api/subjects/<subject>', methods=['DELETE'])
def delete_subject(subject):
    try:
        url = f"{COMPREFACE_URL}/api/v1/recognition/subjects/{subject}"
        response = requests.delete(url, headers=get_headers(), timeout=5)  # Timeout ridotto
        response.raise_for_status()
        
        return jsonify(response.json())
    except requests.exceptions.HTTPError as e:
        app.logger.error(f"CompreFace error: {e.response.text}")
        return jsonify({'error': f"CompreFace error: {e.response.text}"}), e.response.status_code
    except Exception as e:
        app.logger.error(str(e))
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)