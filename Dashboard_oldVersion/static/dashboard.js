// Utility per mostrare toast di notifica
function showToast(message, type = 'success') {
    const toastContainer = document.querySelector('.toast-container');
    const toastId = `toast-${Date.now()}`;
    const toastHTML = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toast = new bootstrap.Toast(document.getElementById(toastId), {
        autohide: true,
        delay: 3000
    });
    toast.show();
    
    // Auto-rimuovi il toast dal DOM dopo che è stato nascosto
    document.getElementById(toastId).addEventListener('hidden.bs.toast', function() {
        this.remove();
    });
}

// Funzione per gestire gli errori delle richieste API
function handleApiError(error) {
    console.error('API Error:', error);
    let errorMessage = 'Si è verificato un errore durante la comunicazione con il server.';
    
    if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
    } else if (typeof error === 'string') {
        errorMessage = error;
    }
    
    showToast(errorMessage, 'danger');
}


// Funzione per verificare la connessione al server CompreFace
async function checkServerConnection() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (data.status === 'healthy') {
            return true;
        } else {
            showToast(`Connessione al server CompreFace limitata. ${data.message || ''}`, 'warning');
            return false;
        }
    } catch (error) {
        showToast('Impossibile connettersi al server CompreFace. Verifica che il servizio sia attivo.', 'danger');
        return false;
    }
}



// Funzione per caricare tutti i soggetti
async function loadSubjects() {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 1000;  // Inizializza con 1 secondo
    
    while (retryCount < maxRetries) {
        try {
            document.getElementById('loading-overlay').style.display = 'flex';
            
            const response = await fetch('/api/subjects');
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const subjectsList = document.getElementById('subjects-list');
            subjectsList.innerHTML = '';
            
            if (!data.subjects || data.subjects.length === 0) {
                subjectsList.innerHTML = `
                    <div class="col-12">
                        <div class="empty-state">
                            <i class="fas fa-users"></i>
                            <p>Nessun soggetto trovato. Aggiungi un nuovo soggetto per iniziare.</p>
                        </div>
                    </div>
                `;
                return;
            }
            
            // Ordina i soggetti alfabeticamente
            data.subjects.sort((a, b) => a.localeCompare(b));
            
            // Crea card per ogni soggetto
            data.subjects.forEach(subject => {
                const subjectCard = document.createElement('div');
                subjectCard.className = 'col-md-6 col-lg-4';
                subjectCard.innerHTML = `
                    <div class="card subject-card">
                        <div class="card-body">
                            <h5 class="card-title">${subject}</h5>
                            <div class="action-btn-group">
                                <button class="btn btn-sm btn-primary action-btn view-subject" data-subject="${subject}">
                                    <i class="fas fa-eye"></i> Visualizza
                                </button>
                                <button class="btn btn-sm btn-warning action-btn rename-subject" data-subject="${subject}">
                                    <i class="fas fa-pencil-alt"></i> Rinomina
                                </button>
                                <button class="btn btn-sm btn-danger action-btn delete-subject" data-subject="${subject}">
                                    <i class="fas fa-trash"></i> Elimina
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                
                subjectsList.appendChild(subjectCard);
            });
            
            // Aggiungi event listener ai bottoni
            document.querySelectorAll('.view-subject').forEach(btn => {
                btn.addEventListener('click', function() {
                    const subject = this.getAttribute('data-subject');
                    loadSubjectDetails(subject);
                });
            });
            
            document.querySelectorAll('.rename-subject').forEach(btn => {
                btn.addEventListener('click', function() {
                    const subject = this.getAttribute('data-subject');
                    openRenameModal(subject);
                });
            });
            
            document.querySelectorAll('.delete-subject').forEach(btn => {
                btn.addEventListener('click', function() {
                    const subject = this.getAttribute('data-subject');
                    openDeleteSubjectModal(subject);
                });
            });
            
            break;  // Uscire dal ciclo se la richiesta è andata a buon fine
        } catch (error) {
            retryCount++;
            if (retryCount < maxRetries) {
                showToast(`Errore nel recupero dei soggetti, tentativo ${retryCount} di ${maxRetries}`, 'warning');
                await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));  // Backoff esponenziale
            } else {
                handleApiError(error);
                break;
            }
        } finally {
            document.getElementById('loading-overlay').style.display = 'none';
        }
    }
}


// Funzione per caricare i dettagli di un soggetto specifico
async function loadSubjectDetails(subject) {
    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 1000;  // Inizia con un ritardo di 1 secondo

    while (retryCount < maxRetries) {
        try {
            const response = await fetch(`/api/subjects/${encodeURIComponent(subject)}/images`);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            const subjectDetails = document.getElementById('subject-details');
            
            if (!data.faces || data.faces.length === 0) {
                subjectDetails.innerHTML = `
                    <div class="details-header">
                        <h4 class="details-title">${subject}</h4>
                        <button class="btn btn-primary btn-sm add-image" data-subject="${subject}">
                            <i class="fas fa-plus"></i> Aggiungi Foto
                        </button>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-camera"></i>
                        <p>Nessuna immagine trovata per questo soggetto</p>
                    </div>
                `;
            } else {
                subjectDetails.innerHTML = `
                    <div class="details-header">
                        <h4 class="details-title">${subject}</h4>
                        <button class="btn btn-primary btn-sm add-image" data-subject="${subject}">
                            <i class="fas fa-plus"></i> Aggiungi Foto
                        </button>
                    </div>
                    <p><strong>Totale immagini:</strong> ${data.faces.length}</p>
                    <div class="image-container">
                        ${data.faces.map(face => `
                            <div class="image-item">
                                <img src="/api/images/${face.image_id}" alt="${subject}">
                                <button class="image-delete" data-image-id="${face.image_id}" title="Elimina">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            break; // Uscire dal ciclo se la richiesta ha avuto successo
        } catch (error) {
            retryCount++;
            if (retryCount < maxRetries) {
                console.log(`Errore nel recupero dei dettagli, tentativo ${retryCount} di ${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));  // Backoff esponenziale
            } else {
                handleApiError(error);
                break;
            }
        }
    }
}



// Funzione per aprire il modal di rinomina soggetto
function openRenameModal(subject) {
    document.getElementById('old-subject-name').value = subject;
    document.getElementById('new-subject-name').value = subject;
    
    const renameModal = new bootstrap.Modal(document.getElementById('renameSubjectModal'));
    renameModal.show();
}

// Funzione per aprire il modal di eliminazione soggetto
function openDeleteSubjectModal(subject) {
    document.getElementById('confirm-delete-message').textContent = `Sei sicuro di voler eliminare il soggetto "${subject}" e tutte le sue immagini? Questa azione è irreversibile.`;
    
    const deleteModal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    deleteModal.show();
    
    document.getElementById('confirm-delete-btn').onclick = function() {
        deleteSubject(subject);
        deleteModal.hide();
    };
}

// Funzione per aprire il modal di eliminazione immagine
function openDeleteImageModal(imageId, subject) {
    document.getElementById('confirm-delete-message').textContent = `Sei sicuro di voler eliminare questa immagine dal soggetto "${subject}"? Questa azione è irreversibile.`;
    
    const deleteModal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    deleteModal.show();
    
    document.getElementById('confirm-delete-btn').onclick = function() {
        deleteImage(imageId, subject);
        deleteModal.hide();
    };
}

// Funzione per aprire il modal di aggiunta immagine
function openAddImageModal(subject) {
    document.getElementById('image-subject-name').value = subject;
    document.getElementById('add-image-subject-name').textContent = subject;
    document.getElementById('new-subject-image').value = '';
    document.getElementById('new-image-preview-container').classList.add('d-none');
    
    const addImageModal = new bootstrap.Modal(document.getElementById('addImageModal'));
    addImageModal.show();
}

// Funzione per eliminare un soggetto
async function deleteSubject(subject) {
    try {
        document.getElementById('loading-overlay').style.display = 'flex';
        
        const response = await fetch(`/api/subjects/${encodeURIComponent(subject)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showToast(`Soggetto "${subject}" eliminato con successo`);
        
        // Ricarica la lista dei soggetti dopo l'eliminazione
        await loadSubjects();  // Ricarica la lista dei soggetti
        
        // Resetta il pannello dei dettagli
        document.getElementById('subject-details').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user"></i>
                <p>Seleziona un soggetto per visualizzare i dettagli</p>
            </div>
        `;
        
    } catch (error) {
        handleApiError(error);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


// Funzione per eliminare un'immagine
async function deleteImage(imageId, subject) {
    try {
        document.getElementById('loading-overlay').style.display = 'flex';
        
        const response = await fetch(`/api/images/${imageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showToast('Immagine eliminata con successo');
        
        // Aggiorna i dettagli del soggetto
        await loadSubjectDetails(subject);
        
    } catch (error) {
        handleApiError(error);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione per rinominare un soggetto
async function renameSubject() {
    try {
        const oldSubject = document.getElementById('old-subject-name').value;
        const newSubject = document.getElementById('new-subject-name').value.trim();
        
        if (!newSubject) {
            showToast('Il nome del soggetto non può essere vuoto', 'danger');
            return;
        }
        
        document.getElementById('loading-overlay').style.display = 'flex';
        
        const response = await fetch(`/api/subjects/${encodeURIComponent(oldSubject)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ subject: newSubject })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showToast(`Soggetto rinominato da "${oldSubject}" a "${newSubject}"`);
        
        // Nascondi il modal
        bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal')).hide();
        
        // Aggiorna la lista dei soggetti
        await loadSubjects();
        
        // Aggiorna i dettagli del soggetto con il nuovo nome
        await loadSubjectDetails(newSubject);
        
    } catch (error) {
        handleApiError(error);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione per aggiungere un nuovo soggetto
async function addSubject() {
    try {
        const subjectName = document.getElementById('subject-name').value.trim();
        const subjectImage = document.getElementById('subject-image').files[0];
        
        if (!subjectName) {
            showToast('Il nome del soggetto non può essere vuoto', 'danger');
            return;
        }
        
        if (!subjectImage) {
            showToast('Seleziona un\'immagine per il soggetto', 'danger');
            return;
        }
        
        document.getElementById('loading-overlay').style.display = 'flex';
        
        const formData = new FormData();
        formData.append('subject', subjectName);
        formData.append('image', subjectImage);
        
        const response = await fetch('/api/subjects', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showToast(`Soggetto "${subjectName}" aggiunto con successo`);
        
        // Nascondi il modal
        bootstrap.Modal.getInstance(document.getElementById('addSubjectModal')).hide();
        
        // Resetta il form
        document.getElementById('add-subject-form').reset();
        document.getElementById('image-preview-container').classList.add('d-none');
        
        // Aggiorna la lista dei soggetti
        await loadSubjects();
        
        // Carica i dettagli del nuovo soggetto
        await loadSubjectDetails(subjectName);
        
    } catch (error) {
        handleApiError(error);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione per aggiungere un'immagine a un soggetto esistente
async function addImageToSubject() {
    try {
        const subjectName = document.getElementById('image-subject-name').value;
        const subjectImage = document.getElementById('new-subject-image').files[0];
        
        if (!subjectImage) {
            showToast('Seleziona un\'immagine da aggiungere', 'danger');
            return;
        }
        
        document.getElementById('loading-overlay').style.display = 'flex';
        
        const formData = new FormData();
        formData.append('image', subjectImage);
        
        const response = await fetch(`/api/subjects/${encodeURIComponent(subjectName)}/images`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showToast(`Immagine aggiunta al soggetto "${subjectName}" con successo`);
        
        // Nascondi il modal
        bootstrap.Modal.getInstance(document.getElementById('addImageModal')).hide();
        
        // Resetta il form
        document.getElementById('add-image-form').reset();
        document.getElementById('new-image-preview-container').classList.add('d-none');
        
        // Aggiorna i dettagli del soggetto
        await loadSubjectDetails(subjectName);
        
    } catch (error) {
        handleApiError(error);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione per mostrare l'anteprima dell'immagine nel form di aggiunta soggetto
function setupImagePreview() {
    document.getElementById('subject-image').addEventListener('change', function(e) {
        const previewContainer = document.getElementById('image-preview-container');
        const preview = document.getElementById('image-preview');
        
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            reader.readAsDataURL(this.files[0]);
        } else {
            previewContainer.classList.add('d-none');
        }
    });
    
    document.getElementById('new-subject-image').addEventListener('change', function(e) {
        const previewContainer = document.getElementById('new-image-preview-container');
        const preview = document.getElementById('new-image-preview');
        
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            reader.readAsDataURL(this.files[0]);
        } else {
            previewContainer.classList.add('d-none');
        }
    });
}

// Aggiungi event listener ai bottoni di azione dei modal
function setupModalButtons() {
    // Bottone salva nuovo soggetto
    document.getElementById('save-subject-btn').addEventListener('click', addSubject);
    
    // Bottone rinomina soggetto
    document.getElementById('rename-subject-btn').addEventListener('click', renameSubject);
    
    // Bottone aggiungi immagine
    document.getElementById('add-image-btn').addEventListener('click', addImageToSubject);
}

// Inizializza la dashboard
async function initDashboard() {
    // Configura anteprime immagini
    setupImagePreview();
    
    // Configura bottoni dei modal
    setupModalButtons();
    
    // Controlla connessione al server
    const serverConnected = await checkServerConnection();
    
    if (serverConnected) {
        // Carica la lista dei soggetti
        await loadSubjects();
    } else {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('subjects-list').innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Impossibile connettersi al server CompreFace. Verificare che il servizio sia attivo e riprovare.</p>
                    <button class="btn btn-primary mt-3" onclick="window.location.reload()">
                        <i class="fas fa-sync-alt me-2"></i>Riprova
                    </button>
                </div>
            </div>
        `;
    }
}

// Avvia la dashboard quando il documento è pronto
document.addEventListener('DOMContentLoaded', initDashboard);