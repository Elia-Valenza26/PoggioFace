// dashboard.js - Sistema di gestione soggetti per CompreFace
// Funzionalità: visualizzazione soggetti, eliminazione soggetti/foto, aggiunta soggetti/foto

// Configurazione globale
let config = {};
let selectedSubject = null;

// Funzione per eseguire una richiesta fetch con timeout e retry
async function fetchWithRetry(url, options, retries = 5, timeout = 15000) { // Aumenta retry e timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    options = options || {};
    options.signal = controller.signal;
    
    try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        
        // Nuovo: Gestione specifica per errori 502/504
        if ([502, 503, 504].includes(response.status)) {
            throw new Error(`Errore server (${response.status})`);
        }
        
        return response;
    } catch (error) {
        // Modifica: Gestione speciale per errori di gateway
        if (error.message.includes('502') || error.message.includes('504')) {
            console.warn('Riavvio del server rilevato, aumento ritardo...');
            await new Promise(r => setTimeout(r, 10000));
        }
        
        console.warn(`Tentativo fallito, riprovo... Tentativi rimasti: ${retries-1}`);
        logToServer(`Tentativo fallito per ${url}, riprovo. Errore: ${error.message}`);
        
        // Backoff più conservativo
        const backoffTime = 3000 * Math.pow(2, 6 - retries);
        await new Promise(r => setTimeout(r, backoffTime));
        
        return fetchWithRetry(url, options, retries - 1, timeout);
    }
}

// Funzione di controllo connessione al server
async function checkServerConnection() {
    try {
        showToast("Controllo connessione al server CompreFace...", "info");
        
        const response = await fetchWithRetry(`${config.host}:${config.port}/api/v1/recognition/subjects`, {
            method: 'GET',
            headers: {
                'x-api-key': config.apiKey
            }
        }, 1, 5000); // Solo 1 retry con timeout breve
        
        if (response.ok) {
            showToast("Connessione al server CompreFace ripristinata", "success");
            return true;
        } else {
            showToast(`Errore dal server: ${response.status} ${response.statusText}`, "danger");
            return false;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            showToast("Il server CompreFace non risponde. Verificare che sia attivo e raggiungibile.", "danger");
        } else {
            showToast(`Impossibile connettersi al server: ${error.message}`, "danger");
        }
        return false;
    }
}

// Elementi DOM frequentemente utilizzati
const loadingOverlay = document.getElementById('loading-overlay');
const subjectsList = document.getElementById('subjects-list');
const subjectDetails = document.getElementById('subject-details');

function addConnectionCheckButton() {
    const headerContainer = document.querySelector('.header-container');
    
    // Crea un contenitore per il pulsante
    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('connection-status');
    
    // Crea il pulsante
    const button = document.createElement('button');
    button.classList.add('btn', 'btn-sm', 'btn-outline-primary');
    button.innerHTML = '<i class="fas fa-network-wired me-1"></i> Verifica connessione';
    button.addEventListener('click', checkServerConnection);
    
    // Aggiungi il pulsante al contenitore
    buttonContainer.appendChild(button);
    
    // Aggiungi il contenitore all'header, prima del logo utente
    headerContainer.insertBefore(buttonContainer, headerContainer.lastElementChild);
}

// Inizializza l'applicazione al caricamento della pagina
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Carica la configurazione dal server
        await loadConfig();
        
        // Carica la lista dei soggetti
        await loadSubjects();
        
        // Setup degli event listeners per i modal
        setupModalListeners();

        addConnectionCheckButton(); // Aggiungi il pulsante di verifica connessione
        
        // Nascondi overlay di caricamento
        loadingOverlay.style.display = 'none';
    } catch (error) {
        showToast('Errore durante l\'inizializzazione: ' + error.message, 'danger');
        console.error('Errore di inizializzazione:', error);
        loadingOverlay.style.display = 'none';
    }
});



// Carica la configurazione dal server
async function loadConfig() {
    try {
        const response = await fetch('/config');
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        
        config = await response.json();
        logToServer('Configurazione caricata correttamente');
    } catch (error) {
        logToServer('Errore durante il caricamento della configurazione: ' + error.message);
        throw error;
    }
}

// Carica la lista dei soggetti dal servizio CompreFace
async function loadSubjects() {
    try {
        showLoader(true);
        
        // Richiesta per ottenere la lista dei soggetti
        const response = await fetchWithRetry(`${config.host}:${config.port}/api/v1/recognition/subjects`, {
            method: 'GET',
            headers: {
                'x-api-key': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Errore nel caricamento dei soggetti: ${response.status}`);
        }
        
        const data = await response.json();
        logToServer(`Soggetti caricati: ${data.subjects.length}`);
        
        // Pulisci e riempie il contenitore dei soggetti
        subjectsList.innerHTML = '';
        
        if (data.subjects && data.subjects.length > 0) {
            // Ordina alfabeticamente i soggetti
            data.subjects.sort((a, b) => a.localeCompare(b));
            
            // Crea una card per ogni soggetto in modo sequenziale per evitare problemi di concorrenza
            for (const subject of data.subjects) {
                await createSubjectCard(subject);
            }
        } else {
            // Mostra stato vuoto
            subjectsList.innerHTML = `
                <div class="col-12">
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>Nessun soggetto trovato. Aggiungi un nuovo soggetto per iniziare.</p>
                    </div>
                </div>
            `;
        }
    // In loadSubjects, sostituisci il catch con:
    } catch (error) {
        const retryBtn = `<button class="btn btn-primary mt-3" onclick="loadSubjects()">
                            <i class="fas fa-sync-alt me-1"></i> Riprova
                        </button>`;
        
        let message = `Errore nel caricamento dei soggetti: ${error.message}. ${retryBtn}`;
        
        if (error.message.includes('timed out')) {
            message = `Il server non risponde. Verifica la connessione o riprova più tardi. ${retryBtn}`;
        }
        
        subjectsList.innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            </div>
        `;
    } finally {
    showLoader(false);
    }
}

// Crea una card per rappresentare un soggetto
async function createSubjectCard(subjectName) {
    try {
        // Ottieni la lista delle immagini per il soggetto
        const images = await getSubjectImages(subjectName);
        const thumbnailUrl = images.length > 0 ? getImageUrl(images[0].image_id) : null;
        
        // Crea l'elemento card
        const subjectCard = document.createElement('div');
        subjectCard.classList.add('col-md-6', 'col-lg-4', 'subject-card');
        subjectCard.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="d-flex align-items-center">
                        <div class="me-3" style="width: 60px; height: 60px; overflow: hidden; border-radius: 8px;">
                            ${thumbnailUrl ? 
                                `<img src="${thumbnailUrl}" class="img-fluid" alt="${subjectName}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                                `<div class="d-flex align-items-center justify-content-center bg-light text-secondary" style="width: 100%; height: 100%;">
                                    <i class="fas fa-user fa-2x"></i>
                                </div>`
                            }
                        </div>
                        <h5 class="card-title mb-0">${subjectName}</h5>
                    </div>
                    <p class="card-text mt-2">
                        <small class="text-muted">
                            <i class="fas fa-image me-1"></i> ${images.length} ${images.length === 1 ? 'immagine' : 'immagini'}
                        </small>
                    </p>
                    <div class="action-btn-group">
                        <button class="btn btn-sm btn-primary action-btn view-subject" data-subject="${subjectName}">
                            <i class="fas fa-eye"></i> Dettagli
                        </button>
                        <button class="btn btn-sm btn-warning action-btn rename-subject" data-subject="${subjectName}">
                            <i class="fas fa-edit"></i> Rinomina
                        </button>
                        <button class="btn btn-sm btn-danger action-btn delete-subject" data-subject="${subjectName}">
                            <i class="fas fa-trash"></i> Elimina
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Aggiungi gli event listener
        subjectCard.querySelector('.view-subject').addEventListener('click', () => {
            loadSubjectDetails(subjectName);
        });
        
        subjectCard.querySelector('.rename-subject').addEventListener('click', () => {
            showRenameSubjectModal(subjectName);
        });
        
        subjectCard.querySelector('.delete-subject').addEventListener('click', () => {
            showDeleteConfirmationModal('soggetto', subjectName);
        });
        
        // Aggiungi la card alla lista
        subjectsList.appendChild(subjectCard);
        
    } catch (error) {
        console.error(`Errore nella creazione della card per ${subjectName}:`, error);
        // Creiamo comunque una card base per il soggetto in caso di errore
        const errorCard = document.createElement('div');
        errorCard.classList.add('col-md-6', 'col-lg-4', 'subject-card');
        errorCard.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">${subjectName}</h5>
                    <p class="card-text text-danger">
                        <i class="fas fa-exclamation-circle"></i> Errore nel caricamento dei dettagli
                    </p>
                    <div class="action-btn-group">
                        <button class="btn btn-sm btn-danger action-btn delete-subject" data-subject="${subjectName}">
                            <i class="fas fa-trash"></i> Elimina
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        errorCard.querySelector('.delete-subject').addEventListener('click', () => {
            showDeleteConfirmationModal('soggetto', subjectName);
        });
        
        subjectsList.appendChild(errorCard);
    }
}

// Carica le immagini associate a un soggetto
async function getSubjectImages(subjectName) {
    try {
        const response = await fetchWithRetry(`${config.host}:${config.port}/api/v1/recognition/faces?subject=${encodeURIComponent(subjectName)}`, {
            method: 'GET',
            headers: {
                'x-api-key': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Errore nel caricamento delle immagini per ${subjectName}: ${response.status}`);
        }
        
        const data = await response.json();
        return data.faces || [];
    } catch (error) {
        console.error(`Errore nel recupero delle immagini per ${subjectName}:`, error);
        
        // Se è un errore di timeout o connessione, offriamo di controllare la connessione
        if (error.name === 'AbortError' || error.message.includes('fetch')) {
            showToast(`Problema di connessione al server. <a href="#" onclick="checkServerConnection(); return false;">Verifica connessione</a>`, "warning");
        }
        
        return [];
    }
}

// Carica i dettagli di un soggetto specifico
async function loadSubjectDetails(subjectName) {
    if (!subjectName) {
        subjectDetails.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user"></i>
                <p>Seleziona un soggetto per visualizzare i dettagli</p>
            </div>
        `;
        return;
    }
    
    try {
        showLoader(true);
        selectedSubject = subjectName;
        
        const images = await getSubjectImages(subjectName);
        
        if (images.length === 0) {
            subjectDetails.innerHTML = `
                <div class="details-header">
                    <h3 class="details-title">${subjectName}</h3>
                    <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addImageModal" data-subject="${subjectName}">
                        <i class="fas fa-plus me-1"></i> Aggiungi Immagine
                    </button>
                </div>
                <div class="empty-state mt-4">
                    <i class="fas fa-images"></i>
                    <p>Nessuna immagine disponibile per questo soggetto</p>
                </div>
            `;
        } else {
            subjectDetails.innerHTML = `
                <div class="details-header">
                    <h3 class="details-title">${subjectName}</h3>
                    <button class="btn btn-primary btn-sm" data-bs-toggle="modal" data-bs-target="#addImageModal" data-subject="${subjectName}">
                        <i class="fas fa-plus me-1"></i> Aggiungi Immagine
                    </button>
                </div>
                <p class="text-muted"><i class="fas fa-image me-1"></i> ${images.length} ${images.length === 1 ? 'immagine' : 'immagini'}</p>
                <div class="image-container">
                    ${images.map(image => `
                        <div class="image-item" data-image-id="${image.image_id}">
                            <img src="${getImageUrl(image.image_id)}" alt="${subjectName}" loading="lazy">
                            <button class="image-delete" data-image-id="${image.image_id}" title="Elimina immagine">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Aggiungi gli event listener per i pulsanti di eliminazione immagine
            document.querySelectorAll('.image-delete').forEach(button => {
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const imageId = button.dataset.imageId;
                    showDeleteConfirmationModal('immagine', imageId, subjectName);
                });
            });
        }
        
        // Imposta il nome del soggetto nel modal per l'aggiunta di immagini
        document.getElementById('add-image-subject-name').textContent = subjectName;
        document.getElementById('image-subject-name').value = subjectName;
        
    } catch (error) {
        showToast('Errore durante il caricamento dei dettagli: ' + error.message, 'danger');
        console.error('Errore nel caricamento dei dettagli:', error);
        
        subjectDetails.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Si è verificato un errore durante il caricamento dei dettagli.</p>
                <button class="btn btn-primary mt-3" onclick="loadSubjectDetails('${subjectName}')">
                    <i class="fas fa-sync-alt me-1"></i> Riprova
                </button>
            </div>
        `;
    } finally {
        showLoader(false);
    }
}

// Setup degli event listeners per i modali
function setupModalListeners() {
    // Preview immagine per l'aggiunta di un soggetto
    document.getElementById('subject-image').addEventListener('change', handleImagePreview);
    
    // Preview immagine per l'aggiunta di un'immagine a un soggetto esistente
    document.getElementById('new-subject-image').addEventListener('change', function(e) {
        handleImagePreview(e, 'new-image-preview', 'new-image-preview-container');
    });
    
    // Salvataggio di un nuovo soggetto
    document.getElementById('save-subject-btn').addEventListener('click', addNewSubject);
    
    // Rinomina di un soggetto
    document.getElementById('rename-subject-btn').addEventListener('click', renameSubject);
    
    // Aggiunta di un'immagine a un soggetto esistente
    document.getElementById('add-image-btn').addEventListener('click', addImageToSubject);
    
    // Apertura del modal per l'aggiunta di un'immagine
    document.getElementById('addImageModal').addEventListener('show.bs.modal', function(event) {
        const button = event.relatedTarget;
        const subjectName = button.getAttribute('data-subject') || selectedSubject;
        
        if (subjectName) {
            document.getElementById('add-image-subject-name').textContent = subjectName;
            document.getElementById('image-subject-name').value = subjectName;
        }
    });
    
    // Apertura del modal per rinominare un soggetto
    document.getElementById('renameSubjectModal').addEventListener('show.bs.modal', function(event) {
        const button = event.relatedTarget;
        const subjectName = button.getAttribute('data-subject');
        
        document.getElementById('old-subject-name').value = subjectName;
        document.getElementById('new-subject-name').value = subjectName;
    });
    
    // Gestione del pulsante di conferma eliminazione
    document.getElementById('confirm-delete-btn').addEventListener('click', handleDeleteConfirmation);
}

// Funzione di utilità per gestire l'anteprima delle immagini
function handleImagePreview(event, previewId = 'image-preview', containerId = 'image-preview-container') {
    const file = event.target.files[0];
    const previewContainer = document.getElementById(containerId);
    const preview = document.getElementById(previewId);
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            previewContainer.classList.remove('d-none');
        };
        reader.readAsDataURL(file);
    } else {
        previewContainer.classList.add('d-none');
    }
}

// Aggiunge un nuovo soggetto
async function addNewSubject() {
    const nameInput = document.getElementById('subject-name');
    const imageInput = document.getElementById('subject-image');
    const modal = bootstrap.Modal.getInstance(document.getElementById('addSubjectModal'));
    
    const subjectName = nameInput.value.trim();
    const imageFile = imageInput.files[0];
    
    if (!subjectName) {
        showToast('Inserisci un nome per il soggetto', 'warning');
        return;
    }
    
    if (!imageFile) {
        showToast('Seleziona un\'immagine per il soggetto', 'warning');
        return;
    }
    
    try {
        showLoader(true);
        
        // 1. Crea il soggetto
        const createSubjectResponse = await fetch(`${config.host}:${config.port}/api/v1/recognition/subjects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            },
            body: JSON.stringify({ subject: subjectName })
        });
        
        if (!createSubjectResponse.ok && createSubjectResponse.status !== 409) {
            // 409 significa che il soggetto esiste già, che in questo caso è accettabile
            throw new Error(`Errore nella creazione del soggetto: ${createSubjectResponse.status}`);
        }
        
        // 2. Carica l'immagine per il soggetto
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const uploadResponse = await fetch(`${config.host}:${config.port}/api/v1/recognition/faces?subject=${encodeURIComponent(subjectName)}&det_prob_threshold=${config.detProbThreshold}`, {
            method: 'POST',
            headers: {
                'x-api-key': config.apiKey
            },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`Errore nel caricamento dell'immagine: ${uploadResponse.status}`);
        }
        
        const result = await uploadResponse.json();
        logToServer(`Soggetto creato: ${subjectName} con immagine ID: ${result.image_id}`);
        
        // Chiudi il modal e pulisci i campi
        modal.hide();
        nameInput.value = '';
        imageInput.value = '';
        document.getElementById('image-preview-container').classList.add('d-none');
        
        // Ricarica la lista dei soggetti
        await loadSubjects();
        showToast(`Soggetto "${subjectName}" aggiunto con successo`, 'success');
        
    } catch (error) {
        showToast('Errore durante l\'aggiunta del soggetto: ' + error.message, 'danger');
        console.error('Errore nell\'aggiunta del soggetto:', error);
    } finally {
        showLoader(false);
    }
}

// Rinomina un soggetto esistente
async function renameSubject() {
    const oldName = document.getElementById('old-subject-name').value;
    const newName = document.getElementById('new-subject-name').value.trim();
    const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
    
    if (!newName) {
        showToast('Inserisci un nuovo nome', 'warning');
        return;
    }
    
    if (oldName === newName) {
        modal.hide();
        return;
    }
    
    try {
        showLoader(true);
        
        const response = await fetch(`${config.host}:${config.port}/api/v1/recognition/subjects/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey
            },
            body: JSON.stringify({ subject: newName })
        });
        
        if (!response.ok) {
            throw new Error(`Errore nella rinomina del soggetto: ${response.status}`);
        }
        
        logToServer(`Soggetto rinominato: da ${oldName} a ${newName}`);
        
        // Chiudi il modal
        modal.hide();
        
        // Ricarica la lista dei soggetti
        await loadSubjects();
        
        // Se il soggetto rinominato è quello attualmente visualizzato nei dettagli, aggiorna anche quello
        if (selectedSubject === oldName) {
            selectedSubject = newName;
            await loadSubjectDetails(newName);
        }
        
        showToast(`Soggetto rinominato da "${oldName}" a "${newName}"`, 'success');
        
    } catch (error) {
        showToast('Errore durante la rinomina: ' + error.message, 'danger');
        console.error('Errore nella rinomina:', error);
    } finally {
        showLoader(false);
    }
}

// Aggiunge un'immagine a un soggetto esistente
async function addImageToSubject() {
    const subjectName = document.getElementById('image-subject-name').value;
    const imageInput = document.getElementById('new-subject-image');
    const modal = bootstrap.Modal.getInstance(document.getElementById('addImageModal'));
    
    const imageFile = imageInput.files[0];
    
    if (!imageFile) {
        showToast('Seleziona un\'immagine da aggiungere', 'warning');
        return;
    }
    
    try {
        showLoader(true);
        
        // Carica l'immagine per il soggetto
        const formData = new FormData();
        formData.append('file', imageFile);
        
        const uploadResponse = await fetch(`${config.host}:${config.port}/api/v1/recognition/faces?subject=${encodeURIComponent(subjectName)}&det_prob_threshold=${config.detProbThreshold}`, {
            method: 'POST',
            headers: {
                'x-api-key': config.apiKey
            },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`Errore nel caricamento dell'immagine: ${uploadResponse.status}`);
        }
        
        const result = await uploadResponse.json();
        logToServer(`Immagine aggiunta: ID ${result.image_id} per il soggetto ${subjectName}`);
        
        // Chiudi il modal e pulisci i campi
        modal.hide();
        imageInput.value = '';
        document.getElementById('new-image-preview-container').classList.add('d-none');
        
        // Se stiamo visualizzando i dettagli di questo soggetto, aggiorniamoli
        if (selectedSubject === subjectName) {
            await loadSubjectDetails(subjectName);
        }
        
        // Aggiorna anche la lista dei soggetti per aggiornare il conteggio delle immagini
        await loadSubjects();
        
        showToast(`Immagine aggiunta a "${subjectName}" con successo`, 'success');
        
    } catch (error) {
        showToast('Errore durante l\'aggiunta dell\'immagine: ' + error.message, 'danger');
        console.error('Errore nell\'aggiunta dell\'immagine:', error);
    } finally {
        showLoader(false);
    }
}

// Mostra la finestra di conferma per l'eliminazione
function showDeleteConfirmationModal(tipo, id, subjectName = null) {
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    const messageElement = document.getElementById('confirm-delete-message');
    const confirmButton = document.getElementById('confirm-delete-btn');
    
    if (tipo === 'soggetto') {
        messageElement.textContent = `Sei sicuro di voler eliminare il soggetto "${id}" e tutte le sue immagini associate? Questa azione non può essere annullata.`;
        confirmButton.setAttribute('data-type', 'subject');
        confirmButton.setAttribute('data-id', id);
    } else if (tipo === 'immagine') {
        messageElement.textContent = `Sei sicuro di voler eliminare questa immagine dal soggetto "${subjectName}"? Questa azione non può essere annullata.`;
        confirmButton.setAttribute('data-type', 'image');
        confirmButton.setAttribute('data-id', id);
        confirmButton.setAttribute('data-subject', subjectName);
    }
    
    modal.show();
}

// Gestisce l'azione di conferma eliminazione
async function handleDeleteConfirmation() {
    const confirmButton = document.getElementById('confirm-delete-btn');
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
    const type = confirmButton.getAttribute('data-type');
    const id = confirmButton.getAttribute('data-id');
    const subjectName = confirmButton.getAttribute('data-subject');
    
    try {
        showLoader(true);
        
        if (type === 'subject') {
            try {
                await deleteSubject(id);
                modal.hide();
                
                // Ritardo aggiuntivo prima di ricaricare
                await new Promise(r => setTimeout(r, 3000));
                
                // Verifica connessione prima di ricaricare
                const isConnected = await checkServerConnection();
                if (isConnected) {
                    await loadSubjects();
                    showToast(`Soggetto "${id}" eliminato`, 'success');
                }
            } catch (finalError) {
                showToast(`Eliminazione completata ma errore finale: ${finalError.message}`, 'warning');
            }
        } else if (type === 'image') {
            await deleteImage(id);
            modal.hide();
            
            // Aggiungi un ritardo simile qui
            setTimeout(async () => {
                try {
                    // Verifica la connessione prima di ricaricare
                    const isConnected = await checkServerConnection();
                    if (isConnected) {
                        await loadSubjects();
                        showToast(`Soggetto "${id}" eliminato con successo`, 'success');
                    }
                } catch (reloadError) {
                    showToast(`Soggetto eliminato, ma impossibile ricaricare: ${reloadError.message}`, 'warning');
                }
            }, 5000);
        }
    } catch (error) {
        showToast('Errore durante l\'eliminazione: ' + error.message, 'danger');
        console.error('Errore nell\'eliminazione:', error);
        modal.hide();
    } finally {
        showLoader(false);
    }
}

// Elimina un soggetto e tutte le sue immagini
async function deleteSubject(subjectName) {
    try {
        // Aumenta timeout per operazioni di eliminazione
        const deleteTimeout = 30000;
        
        // 1a. Eliminazione immagini con ritardo e gestione errori robusta
        const images = await getSubjectImages(subjectName);
        
        if (images.length > 0) {
            for (const [index, image] of images.entries()) {
                try {
                    // Usa fetchWithRetry modificata per eliminazione immagini
                    await fetchWithRetry(
                        `${config.host}:${config.port}/api/v1/recognition/faces/${image.image_id}`,
                        {
                            method: 'DELETE',
                            headers: { 'x-api-key': config.apiKey }
                        },
                        5, // Retry aumentati
                        deleteTimeout
                    );
                    
                    // Aumenta ritardo tra eliminazioni immagini
                    if (index < images.length - 1) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (imageError) {
                    console.error(`Errore eliminazione immagine ${image.image_id}:`, imageError);
                    logToServer(`Errore immagine ${image.image_id}: ${imageError.message}`);
                }
            }
        }

        // 1b. Eliminazione soggetto con ritardo aggiuntivo
        await new Promise(r => setTimeout(r, 5000));
        
        const response = await fetchWithRetry(
            `${config.host}:${config.port}/api/v1/recognition/subjects/${encodeURIComponent(subjectName)}`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.apiKey
                },
                body: JSON.stringify({ subject: subjectName })
            },
            5, // Retry aumentati
            deleteTimeout
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // 1c. Verifica finale della connessione
        await checkServerConnection();
        logToServer(`Soggetto ${subjectName} eliminato con successo`);
        return true;

    } catch (error) {
        logToServer(`Errore eliminazione soggetto ${subjectName}: ${error.message}`);
        throw new Error(`Errore finale: ${error.message}`);
    }
}

// Elimina una singola immagine
async function deleteImage(imageId) {
    try {
        const response = await fetch(`${config.host}:${config.port}/api/v1/recognition/faces/${imageId}`, {
            method: 'DELETE',
            headers: {
                'x-api-key': config.apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`Errore nell'eliminazione dell'immagine: ${response.status}`);
        }
        
        const result = await response.json();
        logToServer(`Immagine eliminata: ${imageId} dal soggetto ${result.subject}`);
        return result;  // Assicuriamoci di restituire il risultato
        
    } catch (error) {
        console.error(`Errore nell'eliminazione dell'immagine ${imageId}:`, error);
        throw error;
    }
}

async function checkServerAfterDelete() {
    try {
        showToast("Verifica dello stato del server in corso...", "info");
        
        // Attendi un momento prima di verificare
        await new Promise(r => setTimeout(r, 1500));
        
        const isConnected = await checkServerConnection();
        return isConnected;
    } catch (error) {
        console.error("Errore durante la verifica del server:", error);
        return false;
    }
}

// Mostra o nasconde l'indicatore di caricamento
function showLoader(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Costruisce l'URL per scaricare un'immagine dal servizio
function getImageUrl(imageId) {
    return `${config.host}:${config.port}/api/v1/static/${config.apiKey}/images/${imageId}`;
}

// Mostra un toast di notifica
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    
    const toast = document.createElement('div');
    toast.classList.add('toast', 'show', `bg-${type === 'danger' ? 'danger' : (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : 'primary'))}`);
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="toast-header">
            <strong class="me-auto">PoggioFace</strong>
            <small>Ora</small>
            <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body text-white">
            ${message}
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Aggiungi event listener per rimuovere il toast dopo che è stato nascosto
    toast.querySelector('.btn-close').addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 500);
    });
    
    // Rimuovi automaticamente il toast dopo 5 secondi
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 500);
    }, 5000);
    
    return toast;
}

// Invia un messaggio di log al server
async function logToServer(message) {
    try {
        await fetch('/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
    } catch (error) {
        console.error('Errore nell\'invio del log al server:', error);
    }
}