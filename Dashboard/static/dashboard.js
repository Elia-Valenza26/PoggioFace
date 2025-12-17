// Variabili globali per la gestione dell'applicazione
let compreface_base_url; // URL base per CompreFace (non utilizzato nel codice attuale)
let selectedSubject = null; // Soggetto attualmente selezionato per la visualizzazione dei dettagli
let allSubjects = {}; // Cache di tutti i soggetti caricati dal server
let POGGIO_FACE_URL; // URL del servizio PoggioFace caricato dalla configurazione

// Variabili per la gestione della webcam remota
let webcamStream = null; // Stream della webcam (attualmente non utilizzato)
let currentInputTarget = null; // ID dell'input file di destinazione per la foto catturata
let currentPreviewTarget = null; // ID dell'elemento immagine per l'anteprima
let currentPreviewContainer = null; // ID del container dell'anteprima

/**
 * Carica la configurazione dal server
 * Ottiene l'URL del servizio PoggioFace dalla route /config
 */
async function loadConfig() {
    try {
        const response = await fetch('/config');
        const config = await response.json();
        POGGIO_FACE_URL = config.poggio_face_url;
        console.log('Configurazione caricata:', config);
    } catch (error) {
        console.error('Errore durante il caricamento della configurazione:', error);
        // Fallback al valore di default in caso di errore
        POGGIO_FACE_URL = 'http://localhost:5002';
        showToast('Errore durante il caricamento della configurazione, utilizzo valori di default', 'warning');
    }
}

// Inizializzazione dell'applicazione quando il DOM è completamente caricato
document.addEventListener('DOMContentLoaded', async function() {

    // Carica la configurazione prima di procedere
    await loadConfig();

    // Carica i soggetti e nasconde l'overlay di caricamento
    fetchSubjects().then(() => {
        document.getElementById('loading-overlay').style.display = 'none';
    }).catch(error => {
        showToast('Errore durante il caricamento dei soggetti: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    });

    // Configura le aree di upload drag-and-drop
    setupUploadAreas();

    // Event listener per l'anteprima dell'immagine nel modal di aggiunta soggetto
    document.getElementById('subject-image').addEventListener('change', function(event) {
        const preview = document.getElementById('image-preview');
        const previewContainer = document.getElementById('image-preview-container');
        
        // Se è stato selezionato un file, mostra l'anteprima
        if (event.target.files && event.target.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            reader.readAsDataURL(event.target.files[0]);
        } else {
            // Nascondi l'anteprima se non ci sono file
            previewContainer.classList.add('d-none');
        }
    });

    // Event listener per l'anteprima dell'immagine nel modal di aggiunta foto a soggetto esistente
    document.getElementById('new-subject-image').addEventListener('change', function(event) {
        const preview = document.getElementById('new-image-preview');
        const previewContainer = document.getElementById('new-image-preview-container');
        
        // Stessa logica del precedente ma per il modal di aggiunta foto
        if (event.target.files && event.target.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            reader.readAsDataURL(event.target.files[0]);
        } else {
            previewContainer.classList.add('d-none');
        }
    });

    // Event listener per il salvataggio di un nuovo soggetto
    document.getElementById('save-subject-btn').addEventListener('click', addSubject);

    // Event listener per la rinomina di un soggetto
    document.getElementById('rename-subject-btn').addEventListener('click', renameSubject);

    // Event listener per l'aggiunta di un'immagine a un soggetto esistente
    document.getElementById('add-image-btn').addEventListener('click', addImageToSubject);

    // Event listener per la conferma dell'eliminazione (soggetto o immagine)
    document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);

    // Event listener per l'apertura della webcam per il modal di nuovo soggetto
    document.getElementById('capture-photo-btn').addEventListener('click', function() {
        openWebcamModal('subject-image', 'image-preview', 'image-preview-container');
    });

    // Event listener per l'apertura della webcam per il modal di aggiunta foto
    document.getElementById('capture-new-photo-btn').addEventListener('click', function() {
        openWebcamModal('new-subject-image', 'new-image-preview', 'new-image-preview-container');
    });

    // Configura il modal della webcam
    setupWebcamModal();
});

/**
 * Configura il comportamento del modal webcam
 * Gestisce l'apertura e chiusura del modal, inserendo un iframe per la cattura remota
 */
function setupWebcamModal() {
    const webcamModal = document.getElementById('webcamModal');
    const modalBody = webcamModal.querySelector('.modal-body');
    
    // Quando il modal si apre, sostituisce il contenuto con un iframe
    webcamModal.addEventListener('shown.bs.modal', async function() {
        try {
            // Inserisce un iframe che punta al servizio di cattura remota
            modalBody.innerHTML = `
                <div class="text-center">
                    <p class="mb-3">Connessione alla webcam remota in corso...</p>
                    <iframe id="remote-capture-frame" 
                            src="${POGGIO_FACE_URL}/capture_remote_photo" 
                            style="width: 100%; height: 500px; border: none; border-radius: 8px;"
                            allow="camera; microphone"
                            sandbox="allow-same-origin allow-scripts allow-forms">
                    </iframe>
                </div>
            `;
            
            // Ascolta i messaggi dall'iframe per ricevere la foto catturata
            window.addEventListener('message', handleRemotePhoto);
            
        } catch (error) {
            console.error('Errore apertura cattura remota:', error);
            showToast('Impossibile accedere alla webcam remota: ' + error.message, 'danger');
        }
    });

    // Quando il modal si chiude, ripristina il contenuto originale
    webcamModal.addEventListener('hidden.bs.modal', function() {
        // Ripristina il contenuto HTML originale del modal
        modalBody.innerHTML = `
            <div id="webcam-container">
                <video id="webcam-video" autoplay muted style="max-width: 100%; border-radius: 8px;"></video>
                <canvas id="webcam-canvas" style="display: none;"></canvas>
            </div>
            <div class="mt-3">
                <button type="button" class="btn btn-primary" id="capture-btn">
                    <i class="fas fa-camera me-1"></i> Scatta Foto
                </button>
                <button type="button" class="btn btn-warning" id="retake-btn" style="display: none;">
                    <i class="fas fa-redo me-1"></i> Riprova
                </button>
            </div>
            <div id="webcam-preview" class="mt-3" style="display: none;">
                <img id="captured-image" style="max-width: 100%; border-radius: 8px;" alt="Foto catturata">
            </div>
        `;
        
        // Rimuove il listener per i messaggi
        window.removeEventListener('message', handleRemotePhoto);
    });
}

/**
 * Configura le aree di upload drag-and-drop per entrambi i modal
 */
function setupUploadAreas() {
    // Configura l'area di upload per il modal di nuovo soggetto
    setupUploadArea('upload-area-subject', 'subject-image', 'upload-preview-subject', 'image-preview');
    // Configura l'area di upload per il modal di aggiunta foto
    setupUploadArea('upload-area-new', 'new-subject-image', 'upload-preview-new', 'new-image-preview');
}

/**
 * Configura una singola area di upload con funzionalità drag-and-drop
 * @param {string} areaId - ID dell'area di drop
 * @param {string} inputId - ID dell'input file
 * @param {string} previewId - ID del container dell'anteprima
 * @param {string} imgId - ID dell'elemento immagine per l'anteprima
 */
function setupUploadArea(areaId, inputId, previewId, imgId) {
    const uploadArea = document.getElementById(areaId);
    const fileInput = document.getElementById(inputId);
    const previewArea = document.getElementById(previewId);
    const previewImg = document.getElementById(imgId);
    
    // Verifica che tutti gli elementi esistano
    if (!uploadArea || !fileInput) return;
    
    // Gestisce l'evento dragover (quando un file viene trascinato sopra l'area)
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover'); // Aggiunge stile visivo
    });
    
    // Gestisce l'evento dragleave (quando il file esce dall'area)
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover'); // Rimuove stile visivo
    });
    
    // Gestisce l'evento drop (quando un file viene rilasciato)
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        // Verifica che sia stata rilasciata un'immagine
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            fileInput.files = files; // Assegna il file all'input
            handleFileSelect(fileInput, uploadArea, previewArea, previewImg);
        }
    });
    
    // Gestisce la selezione tradizionale di file tramite input
    fileInput.addEventListener('change', () => {
        handleFileSelect(fileInput, uploadArea, previewArea, previewImg);
    });
}

/**
 * Gestisce la selezione di un file e mostra l'anteprima
 * @param {HTMLInputElement} input - Input file
 * @param {HTMLElement} uploadArea - Area di upload
 * @param {HTMLElement} previewArea - Container dell'anteprima
 * @param {HTMLImageElement} previewImg - Elemento immagine per l'anteprima
 */
function handleFileSelect(input, uploadArea, previewArea, previewImg) {
    const file = input.files[0];
    
    if (file) {
        // Legge il file e mostra l'anteprima
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            // Nasconde il contenuto di upload e mostra l'anteprima
            uploadArea.querySelector('.upload-content').classList.add('d-none');
            previewArea.classList.remove('d-none');
            uploadArea.classList.add('has-file');
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Pulisce l'anteprima di un'area di upload
 * @param {string} type - Tipo di upload ('subject' o 'new')
 */
function clearPreview(type) {
    const uploadArea = document.getElementById(`upload-area-${type}`);
    const previewArea = document.getElementById(`upload-preview-${type}`);
    const fileInput = document.getElementById(type === 'subject' ? 'subject-image' : 'new-subject-image');
    
    // Reset dello stato visivo e dell'input
    fileInput.value = '';
    fileInput.removeAttribute('data-temp-path'); // Rimuovi il percorso temporaneo
    uploadArea.querySelector('.upload-content').classList.remove('d-none');
    previewArea.classList.add('d-none');
    uploadArea.classList.remove('has-file');
    
    // Trigger dell'evento change per aggiornare altri listener
    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);
}

/**
 * Gestisce la ricezione di una foto dalla cattura remota
 * Viene chiamata quando l'iframe invia un messaggio con la foto catturata
 * @param {MessageEvent} event - Evento messaggio dall'iframe
 */
function handleRemotePhoto(event) {
    // Verifica che il messaggio sia del tipo corretto
    if (event.data && event.data.type === 'photo_captured') {
        const photoData = event.data.data;
        
        console.log('Foto ricevuta, invio al backend...');
        
        // Invia la foto al backend per essere salvata
        fetch('/receive_remote_photo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                photo_data: photoData,
                timestamp: new Date().toISOString()
            })
        })
        .then(response => {
            console.log('Risposta backend:', response.status);
            return response.json();
        })
        .then(result => {
            console.log('Risultato backend:', result);
            if (result.status === 'success') {
                // Crea un oggetto File simulato per l'input
                fetch(photoData)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], result.filename, { type: 'image/jpeg' });
                        
                        // Memorizza il percorso del file temporaneo
                        const input = document.getElementById(currentInputTarget);
                        input.setAttribute('data-temp-path', result.temp_path);
                        
                        console.log('Percorso temporaneo memorizzato:', result.temp_path);
                        
                        // Aggiorna l'input file di destinazione
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        input.files = dataTransfer.files;
                        
                        // Mostra l'anteprima della foto catturata
                        const preview = document.getElementById(currentPreviewTarget);
                        const previewContainer = document.getElementById(currentPreviewContainer);
                        
                        preview.src = photoData;
                        previewContainer.classList.remove('d-none');
                        
                        // Trigger dell'evento change per aggiornare altri listener
                        const changeEvent = new Event('change', { bubbles: true });
                        input.dispatchEvent(changeEvent);
                        
                        // Chiude il modal webcam
                        const modal = bootstrap.Modal.getInstance(document.getElementById('webcamModal'));
                        modal.hide();
                        
                        showToast('Foto catturata dalla webcam remota con successo!', 'success');
                    })
                    .catch(error => {
                        console.error('Errore conversione foto:', error);
                        showToast('Errore durante la conversione della foto: ' + error.message, 'danger');
                    });
            } else {
                console.error('Errore backend:', result.error);
                showToast('Errore durante il salvataggio della foto: ' + result.error, 'danger');
            }
        })
        .catch(error => {
            console.error('Errore invio foto al backend:', error);
            showToast('Errore durante l\'invio della foto: ' + error.message, 'danger');
        });
    }
    // Gestione messaggi di stato riconoscimento
    else if (event.data && event.data.type === 'recognition_stopped') {
        console.log('Riconoscimento fermato per cattura foto');
    }
    else if (event.data && event.data.type === 'recognition_restarted') {
        console.log('Riconoscimento riavviato dopo cattura foto');
    }
}

/**
 * Apre il modal della webcam e imposta i target per la foto catturata
 * @param {string} inputId - ID dell'input file di destinazione
 * @param {string} previewId - ID dell'elemento immagine per l'anteprima
 * @param {string} previewContainerId - ID del container dell'anteprima
 */
function openWebcamModal(inputId, previewId, previewContainerId) {
    // Memorizza i target per l'utilizzo in handleRemotePhoto
    currentInputTarget = inputId;
    currentPreviewTarget = previewId;
    currentPreviewContainer = previewContainerId;
    
    // Apre il modal
    const modal = new bootstrap.Modal(document.getElementById('webcamModal'));
    modal.show();
}

/**
 * Recupera tutti i soggetti dal server
 * Gestisce anche i retry in caso di errori di rete
 */
async function fetchSubjects() {
    try {
        const response = await fetch('/subjects');
        
        if (!response.ok) {
            // Gestione speciale per errori di connessione
            if (response.status === 0) {
                console.warn('Problema di connessione alla rete. Attesa e nuovo tentativo...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return fetchSubjects(); // Retry ricorsivo
            }
            throw new Error(`Errore del server HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        allSubjects = data; // Aggiorna la cache globale
        renderSubjectsList(data); // Renderizza la lista
        return data;
    } catch (error) {
        console.error('Errore durante il recupero dei soggetti:', error);
        
        // Retry automatico per errori di rete
        if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            console.warn('Errore di rete. Riprovando tra 2 secondi...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return fetchSubjects(); // Retry ricorsivo
        }
        
        showToast('Errore durante il recupero dei soggetti: ' + error.message, 'danger');
        throw error;
    }
}

/**
 * Renderizza la lista dei soggetti nell'interfaccia utente
 * @param {Object} subjects - Oggetto contenente i soggetti e le loro immagini
 */
function renderSubjectsList(subjects) {
    const subjectsList = document.getElementById('subjects-list');
    subjectsList.innerHTML = '';

    // Gestisce il caso di nessun soggetto presente
    if (Object.keys(subjects).length === 0) {
        subjectsList.innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>Nessun soggetto presente. Aggiungi un nuovo soggetto per iniziare.</p>
                </div>
            </div>
        `;
        return;
    }

    // Ordina i soggetti alfabeticamente
    const sortedSubjects = Object.keys(subjects).sort();

    // Crea una card per ogni soggetto
    for (const subject of sortedSubjects) {
        const images = subjects[subject] || [];
        // Usa la prima immagine come thumbnail, o un placeholder se non ci sono immagini
        const firstImageUrl = images.length > 0 ? `/proxy/images/${images[0]}` : 'https://via.placeholder.com/48';
        
        // ID univoco per il pannello dettagli
        const detailsId = `details-${subject.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;

        const card = document.createElement('div');
        card.className = 'col-12';

        // Template HTML per la card del soggetto con pannello dettagli espandibile
        card.innerHTML = `
            <div class="subject-card-wrapper">
                <div class="subject-card bg-white p-3 rounded shadow-sm d-flex justify-content-between align-items-center flex-wrap">
                    <div class="d-flex align-items-center gap-3">
                        <img src="${firstImageUrl}" alt="${subject}" class="rounded-circle" style="width: 48px; height: 48px; object-fit: cover;">
                        <span class="fw-bold fs-5">${subject}</span>
                    </div>
                    <div class="d-flex gap-2 mt-3 mt-md-0">
                        <button class="btn btn-sm btn-primary view-btn" data-subject="${subject}" data-details-id="${detailsId}" title="Visualizza dettagli">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-warning rename-btn" data-subject="${subject}" title="Rinomina">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger delete-btn" data-subject="${subject}" title="Elimina">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="subject-details-panel" id="${detailsId}" style="display: none;">
                    <!-- I dettagli verranno inseriti qui dinamicamente -->
                </div>
            </div>
        `;

        // Aggiunge event listener per i pulsanti della card
        card.querySelector('.view-btn').addEventListener('click', function() {
            toggleSubjectDetails(this.getAttribute('data-subject'), this.getAttribute('data-details-id'), this);
        });

        card.querySelector('.rename-btn').addEventListener('click', function() {
            openRenameModal(this.getAttribute('data-subject'));
        });

        card.querySelector('.delete-btn').addEventListener('click', function() {
            openDeleteSubjectModal(this.getAttribute('data-subject'));
        });

        subjectsList.appendChild(card);
    }
}

/**
 * Toggle dei dettagli di un soggetto specifico (espande/comprime inline)
 * @param {string} subject - Nome del soggetto da visualizzare
 * @param {string} detailsId - ID del pannello dettagli
 * @param {HTMLElement} button - Pulsante cliccato
 */
function toggleSubjectDetails(subject, detailsId, button) {
    const detailsPanel = document.getElementById(detailsId);
    const isVisible = detailsPanel.style.display !== 'none';
    
    // Chiudi tutti gli altri pannelli aperti
    document.querySelectorAll('.subject-details-panel').forEach(panel => {
        if (panel.id !== detailsId) {
            panel.style.display = 'none';
            panel.classList.remove('show');
        }
    });
    
    // Rimuovi classe active da tutti i pulsanti
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.querySelector('i').classList.remove('fa-eye-slash');
        btn.querySelector('i').classList.add('fa-eye');
    });
    
    if (isVisible) {
        // Chiudi il pannello
        detailsPanel.classList.remove('show');
        setTimeout(() => {
            detailsPanel.style.display = 'none';
        }, 300);
        selectedSubject = null;
    } else {
        // Apri il pannello
        selectedSubject = subject;
        const subjectImages = allSubjects[subject] || [];
        
        // Genera il contenuto dei dettagli
        detailsPanel.innerHTML = `
            <div class="details-content">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="text-muted">Numero di immagini: <strong>${subjectImages.length}</strong></span>
                    <button class="btn btn-sm btn-success add-photo-inline-btn" data-subject="${subject}">
                        <i class="fas fa-camera me-1"></i> Aggiungi Foto
                    </button>
                </div>
                
                ${subjectImages.length === 0 ? `
                    <div class="empty-state-inline">
                        <i class="fas fa-image fa-2x text-muted mb-2"></i>
                        <p class="text-muted mb-0">Nessuna immagine disponibile per questo soggetto.</p>
                    </div>
                ` : `
                    <div class="image-container-inline">
                        ${subjectImages.map(imageId => `
                            <div class="image-item-inline">
                                <img src="/proxy/images/${imageId}" alt="${subject}">
                                <button class="image-delete-inline" data-image-id="${imageId}" data-subject="${subject}">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
        
        detailsPanel.style.display = 'block';
        // Forza reflow per animazione
        detailsPanel.offsetHeight;
        detailsPanel.classList.add('show');
        
        // Aggiorna icona pulsante
        button.classList.add('active');
        button.querySelector('i').classList.remove('fa-eye');
        button.querySelector('i').classList.add('fa-eye-slash');
        
        // Event listener per aggiungere foto
        detailsPanel.querySelector('.add-photo-inline-btn').addEventListener('click', function() {
            openAddImageModal(this.getAttribute('data-subject'));
        });
        
        // Event listener per eliminare immagini
        detailsPanel.querySelectorAll('.image-delete-inline').forEach(btn => {
            btn.addEventListener('click', function() {
                const imageId = this.getAttribute('data-image-id');
                const subj = this.getAttribute('data-subject');
                openDeleteImageModal(imageId, subj);
            });
        });
    }
}

/**
 * Mostra i dettagli di un soggetto specifico (funzione legacy per compatibilità)
 * @param {string} subject - Nome del soggetto da visualizzare
 */
function showSubjectDetails(subject) {
    selectedSubject = subject; // Memorizza il soggetto selezionato
    const subjectImages = allSubjects[subject] || [];
    
    const detailsContainer = document.getElementById('subject-details');
    // Se non esiste il container, usa la nuova logica inline
    if (!detailsContainer) {
        // Trova il pannello dettagli del soggetto e lo apre
        const detailsId = `details-${subject.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`;
        const btn = document.querySelector(`[data-details-id="${detailsId}"]`);
        if (btn) {
            toggleSubjectDetails(subject, detailsId, btn);
        }
        return;
    }
    
    // Genera il template HTML per i dettagli del soggetto
    detailsContainer.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">${subject}</h4>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success" id="add-photo-btn" title="Aggiungi foto">
                    <i class="fas fa-camera me-1"></i> Aggiungi Foto
                </button>
                <button class="btn btn-sm btn-danger" id="delete-btn" title="Elimina soggetto">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <hr>
        
        <p class="text-muted mb-3">Numero di immagini: ${subjectImages.length}</p>
        
        ${subjectImages.length === 0 ? `
            <div class="empty-state">
                <i class="fas fa-image fa-2x text-muted mb-2"></i>
                <p class="text-muted mb-0">Nessuna immagine disponibile per questo soggetto.</p>
            </div>
        ` : `
            <div class="image-container">
                ${subjectImages.map(imageId => `
                    <div class="image-item">
                        <img src="/proxy/images/${imageId}" alt="${subject}">
                        <button class="image-delete" data-image-id="${imageId}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `}
    `;

    // Aggiunge event listener per i pulsanti dei dettagli
    document.getElementById('add-photo-btn').addEventListener('click', function () {
        openAddImageModal(subject);
    });

    document.getElementById('delete-btn').addEventListener('click', function () {
        openDeleteSubjectModal(subject);
    });

    // Aggiunge event listener per i pulsanti di eliminazione di ogni immagine
    document.querySelectorAll('.image-delete').forEach(button => {
        button.addEventListener('click', function () {
            const imageId = this.getAttribute('data-image-id');
            openDeleteImageModal(imageId, subject);
        });
    });
}

/**
 * Apre il modal per aggiungere un'immagine a un soggetto esistente
 * @param {string} subject - Nome del soggetto
 */
function openAddImageModal(subject) {
    // Precompila il form con il nome del soggetto
    document.getElementById('image-subject-name').value = subject;
    document.getElementById('add-image-subject-name').textContent = subject;
    // Reset dell'anteprima e dell'input
    document.getElementById('new-image-preview-container').classList.add('d-none');
    document.getElementById('new-subject-image').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('addImageModal'));
    modal.show();
}

/**
 * Apre il modal per rinominare un soggetto
 * @param {string} subject - Nome attuale del soggetto
 */
function openRenameModal(subject) {
    // Precompila il form con il nome attuale
    document.getElementById('old-subject-name').value = subject;
    document.getElementById('new-subject-name').value = subject;
    
    const modal = new bootstrap.Modal(document.getElementById('renameSubjectModal'));
    modal.show();
}

/**
 * Apre il modal di conferma per l'eliminazione di un soggetto
 * @param {string} subject - Nome del soggetto da eliminare
 */
function openDeleteSubjectModal(subject) {
    const message = `Sei sicuro di voler eliminare il soggetto "${subject}" e tutte le sue immagini associate? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    // Configura il pulsante di conferma per l'eliminazione del soggetto
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-subject');
    document.getElementById('confirm-delete-btn').setAttribute('data-subject', subject);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

/**
 * Apre il modal di conferma per l'eliminazione di un'immagine
 * @param {string} imageId - ID dell'immagine da eliminare
 * @param {string} subject - Nome del soggetto proprietario dell'immagine
 */
function openDeleteImageModal(imageId, subject) {
    const message = `Sei sicuro di voler eliminare questa immagine del soggetto "${subject}"? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    // Configura il pulsante di conferma per l'eliminazione dell'immagine
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-image');
    document.getElementById('confirm-delete-btn').setAttribute('data-image-id', imageId);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

/**
 * Aggiunge un nuovo soggetto con la sua prima immagine
 */
async function addSubject() {
    const subjectName = document.getElementById('subject-name').value.trim();
    const subjectImage = document.getElementById('subject-image').files[0];
    const tempPath = document.getElementById('subject-image').getAttribute('data-temp-path');
    
    // Validazione input
    if (!subjectName || (!subjectImage && !tempPath)) {
        showToast('Per favore, inserisci un nome e seleziona un\'immagine.', 'warning');
        return;
    }
    
    // Verifica che il soggetto non esista già
    if (allSubjects[subjectName]) {
        showToast(`Il soggetto "${subjectName}" esiste già. Scegli un altro nome.`, 'warning');
        return;
    }
    
    // Mostra loading overlay
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        // Prepara i dati per l'upload
        const formData = new FormData();
        formData.append('subject', subjectName);
        
        // Se abbiamo un percorso temporaneo (foto da webcam remota), lo usiamo
        if (tempPath) {
            formData.append('temp_path', tempPath);
        } else {
            // Altrimenti usiamo il file caricato normalmente
            formData.append('image', subjectImage);
        }
        
        // Invia la richiesta al server
        const response = await fetch('/subjects', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'aggiunta del soggetto');
        }
        
        // Aggiorna la lista dei soggetti
        await fetchSubjects();
        
        // Chiude il modal e reset del form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addSubjectModal'));
        modal.hide();
        
        document.getElementById('subject-name').value = '';
        document.getElementById('subject-image').value = '';
        document.getElementById('subject-image').removeAttribute('data-temp-path');
        document.getElementById('image-preview-container').classList.add('d-none');
        
        showToast(`Soggetto "${subjectName}" aggiunto con successo.`, 'success');
        // Mostra automaticamente i dettagli del nuovo soggetto
        showSubjectDetails(subjectName);
    } catch (error) {
        console.error('Errore durante l\'aggiunta del soggetto:', error);
        showToast('Errore durante l\'aggiunta del soggetto: ' + error.message, 'danger');
    } finally {
        // Nascondi loading overlay in ogni caso
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

/**
 * Rinomina un soggetto esistente
 */
async function renameSubject() {
    const oldName = document.getElementById('old-subject-name').value;
    const newName = document.getElementById('new-subject-name').value.trim();
    
    // Validazione input
    if (!newName) {
        showToast('Per favore, inserisci un nuovo nome.', 'warning');
        return;
    }
    
    // Se il nome non è cambiato, chiudi semplicemente il modal
    if (oldName === newName) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        return;
    }
    
    // Verifica che il nuovo nome non sia già in uso
    if (allSubjects[newName]) {
        showToast(`Il soggetto "${newName}" esiste già. Scegli un altro nome.`, 'warning');
        return;
    }
    
    // Mostra loading overlay
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        // Invia la richiesta di rinomina al server
        const response = await fetch(`/subjects/${oldName}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ new_name: newName })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante la rinominazione del soggetto');
        }
        
        // Chiude il modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        
        showToast(`Soggetto rinominato da "${oldName}" a "${newName}" con successo.`, 'success');
        
        // Aggiorna l'interfaccia dopo un breve delay
        setTimeout(async () => {
            await fetchSubjects();
            selectedSubject = newName; // Aggiorna il soggetto selezionato
            showSubjectDetails(newName);
            document.getElementById('loading-overlay').style.display = 'none';
        }, 1000);
    } catch (error) {
        console.error('Errore durante la rinominazione del soggetto:', error);
        showToast('Errore durante la rinominazione del soggetto: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

/**
 * Aggiunge un'immagine a un soggetto esistente
 */
async function addImageToSubject() {
    const subject = document.getElementById('image-subject-name').value;
    const image = document.getElementById('new-subject-image').files[0];
    const tempPath = document.getElementById('new-subject-image').getAttribute('data-temp-path');
    
    console.log('addImageToSubject:', { subject, image, tempPath });
    
    // Validazione input
    if (!image && !tempPath) {
        showToast('Per favore, seleziona un\'immagine.', 'warning');
        return;
    }
    
    // Mostra loading overlay
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        // Prepara i dati per l'upload
        const formData = new FormData();
        
        // Se abbiamo un percorso temporaneo (foto da webcam remota), lo usiamo
        if (tempPath) {
            formData.append('temp_path', tempPath);
            console.log('Usando percorso temporaneo:', tempPath);
        } else {
            // Altrimenti usiamo il file caricato normalmente
            formData.append('image', image);
            console.log('Usando file caricato:', image.name);
        }
        
        console.log('Invio richiesta a:', `/subjects/${subject}/images`);
        
        // Invia la richiesta al server
        const response = await fetch(`/subjects/${subject}/images`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Risposta server:', response.status);
        
        const result = await response.json();
        console.log('Risultato server:', result);
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'aggiunta dell\'immagine');
        }
        
        // Chiude il modal e reset del form
        const modal = bootstrap.Modal.getInstance(document.getElementById('addImageModal'));
        modal.hide();
        
        document.getElementById('new-subject-image').value = '';
        document.getElementById('new-subject-image').removeAttribute('data-temp-path');
        document.getElementById('new-image-preview-container').classList.add('d-none');
        
        showToast(`Immagine aggiunta al soggetto "${subject}" con successo.`, 'success');

        // Se l'immagine proveniva dalla webcam (tempPath esiste), avvia la pulizia dopo 10 secondi
        if (tempPath) {
            setTimeout(() => {
                console.log('Avvio pulizia cartella temporanea...');
                fetch('/cleanup_temp', { method: 'POST' })
                    .then(res => res.json())
                    .then(data => console.log('Risultato pulizia:', data.message))
                    .catch(err => console.error('Errore pulizia:', err));
            }, 10000); // 10 secondi di ritardo
        }
        
        // Aggiorna l'interfaccia dopo un breve delay
        setTimeout(async () => {
            await fetchSubjects();
            showSubjectDetails(subject);
            document.getElementById('loading-overlay').style.display = 'none';
        }, 1000);
    } catch (error) {
        console.error('Errore durante l\'aggiunta dell\'immagine:', error);
        showToast('Errore durante l\'aggiunta dell\'immagine: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


/**
 * Gestisce la conferma dell'eliminazione (soggetto o immagine)
 * Determina l'azione da eseguire basandosi sugli attributi del pulsante
 */
async function confirmDelete() {
    const action = document.getElementById('confirm-delete-btn').getAttribute('data-action');
    
    // Chiude il modal di conferma
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
    modal.hide();
    
    // Mostra loading overlay
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        // Esegue l'azione appropriata
        if (action === 'delete-subject') {
            await deleteSubject();
        } else if (action === 'delete-image') {
            await deleteImage();
        }
    } catch (error) {
        console.error('Errore durante l\'eliminazione:', error);
        showToast('Errore durante l\'eliminazione: ' + error.message, 'danger');
    } finally {
        // Nascondi loading overlay in ogni caso
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

/**
 * Elimina un soggetto e tutte le sue immagini associate
 */
async function deleteSubject() {
    const subject = document.getElementById('confirm-delete-btn').getAttribute('data-subject');
    
    try {
        // Copia l'array delle immagini per evitare modifiche durante l'iterazione
        const subjectImages = [...(allSubjects[subject] || [])];
        
        showToast(`Eliminazione del soggetto "${subject}" in corso...`, 'info');
        
        // Elimina tutte le immagini associate al soggetto
        for (const imageId of subjectImages) {
            try {
                await fetch(`/images/${imageId}`, {
                    method: 'DELETE'
                });
                // Breve pausa tra le eliminazioni per evitare sovraccarico del server
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`Errore durante l'eliminazione dell'immagine ${imageId}: ${error.message}`);
            }
        }
        
        // Elimina il soggetto dal sistema di riconoscimento
        const response = await fetch(`/subjects/${subject}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Errore durante l\'eliminazione del soggetto');
        }
        
        // Pausa per permettere al server di completare l'operazione
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fetchSubjects();
        
        showToast(`Soggetto "${subject}" eliminato con successo.`, 'success');
        resetDetailsPanel(); // Reset del pannello dei dettagli
    } catch (error) {
        throw error;
    }
}

/**
 * Elimina una singola immagine
 */
async function deleteImage() {
    const imageId = document.getElementById('confirm-delete-btn').getAttribute('data-image-id');
    
    try {
        // Trova il soggetto proprietario dell'immagine
        let imageSubject = null;
        for (const [subject, images] of Object.entries(allSubjects)) {
            if (images.includes(imageId)) {
                imageSubject = subject;
                break;
            }
        }
        
        showToast(`Eliminazione dell'immagine in corso...`, 'info');
        
        // Elimina l'immagine dal server
        const response = await fetch(`/images/${imageId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Errore durante l\'eliminazione dell\'immagine');
        }
        
        // Pausa per permettere al server di completare l'operazione
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showToast('Immagine eliminata con successo.', 'success');
        
        // Aggiorna l'interfaccia
        const updatedSubjects = await fetchSubjects();
        
        // Se il soggetto esiste ancora, mostra i suoi dettagli aggiornati
        if (imageSubject && selectedSubject === imageSubject && updatedSubjects[imageSubject]) {
            showSubjectDetails(imageSubject);
        } else {
            // Altrimenti reset del pannello dei dettagli
            resetDetailsPanel();
        }
    } catch (error) {
        throw error;
    }
}

/**
 * Reset del pannello dei dettagli quando nessun soggetto è selezionato
 */
function resetDetailsPanel() {
    selectedSubject = null;
    const detailsContainer = document.getElementById('subject-details');
    detailsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-user"></i>
            <p>Seleziona un soggetto per visualizzare i dettagli</p>
        </div>
    `;
}

/**
 * Mostra un toast notification all'utente
 * @param {string} message - Messaggio da visualizzare
 * @param {string} type - Tipo di toast ('info', 'success', 'warning', 'danger')
 */
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toastId = 'toast-' + Date.now();
    
    // Limita il numero di toast dello stesso tipo visualizzati contemporaneamente
    const existingToasts = toastContainer.querySelectorAll(`.bg-${type}`);
    if (existingToasts.length > 2) {
        existingToasts[0].remove();
    }
    
    // Crea l'elemento toast
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('id', toastId);
    
    // Template HTML del toast
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Aggiunge il toast al container
    toastContainer.appendChild(toast);
    
    // Inizializza e mostra il toast con Bootstrap
    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 5000 // Nasconde automaticamente dopo 5 secondi
    });
    
    bsToast.show();
    
    // Rimuove l'elemento dal DOM quando il toast viene nascosto
    toast.addEventListener('hidden.bs.toast', function() {
        toast.remove();
    });
}