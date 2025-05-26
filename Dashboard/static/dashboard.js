// Variabili globali
let compreface_base_url;
let selectedSubject = null;
let allSubjects = {};

// Variabili per webcam
let webcamStream = null;
let currentInputTarget = null;
let currentPreviewTarget = null;
let currentPreviewContainer = null;

// Caricamento iniziale
document.addEventListener('DOMContentLoaded', function() {
    // Nascondi l'overlay di caricamento alla fine dell'inizializzazione
    fetchSubjects().then(() => {
        document.getElementById('loading-overlay').style.display = 'none';
    }).catch(error => {
        showToast('Errore durante il caricamento dei soggetti: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    });

    // Event listener per l'anteprima dell'immagine nel modal di aggiunta soggetto
    document.getElementById('subject-image').addEventListener('change', function(event) {
        const preview = document.getElementById('image-preview');
        const previewContainer = document.getElementById('image-preview-container');
        
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

    // Event listener per l'anteprima dell'immagine nel modal di aggiunta foto
    document.getElementById('new-subject-image').addEventListener('change', function(event) {
        const preview = document.getElementById('new-image-preview');
        const previewContainer = document.getElementById('new-image-preview-container');
        
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

    // Event listener per l'aggiunta di un soggetto
    document.getElementById('save-subject-btn').addEventListener('click', addSubject);

    // Event listener per il pulsante di rinomina soggetto
    document.getElementById('rename-subject-btn').addEventListener('click', renameSubject);

    // Event listener per l'aggiunta di un'immagine a un soggetto
    document.getElementById('add-image-btn').addEventListener('click', addImageToSubject);

    // Event listener per il pulsante di conferma eliminazione
    document.getElementById('confirm-delete-btn').addEventListener('click', confirmDelete);

    // Event listener per cattura foto - nuova implementazione
    document.getElementById('capture-photo-btn').addEventListener('click', function() {
        openWebcamModal('subject-image', 'image-preview', 'image-preview-container');
    });

    document.getElementById('capture-new-photo-btn').addEventListener('click', function() {
        openWebcamModal('new-subject-image', 'new-image-preview', 'new-image-preview-container');
    });

    // Event listener per il modal webcam
    setupWebcamModal();
});

// Funzione per configurare il modal webcam
function setupWebcamModal() {
    const webcamModal = document.getElementById('webcamModal');
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const retakeBtn = document.getElementById('retake-btn');
    const usePhotoBtn = document.getElementById('use-photo-btn');
    const capturedImage = document.getElementById('captured-image');
    const webcamPreview = document.getElementById('webcam-preview');

    // Quando il modal si apre
    webcamModal.addEventListener('shown.bs.modal', async function() {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            video.srcObject = webcamStream;
            
            // Reset UI
            captureBtn.style.display = 'inline-block';
            retakeBtn.style.display = 'none';
            usePhotoBtn.style.display = 'none';
            webcamPreview.style.display = 'none';
            video.style.display = 'block';
            
        } catch (error) {
            console.error('Errore accesso webcam:', error);
            showToast('Impossibile accedere alla webcam: ' + error.message, 'danger');
        }
    });

    // Quando il modal si chiude
    webcamModal.addEventListener('hidden.bs.modal', function() {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
    });

    // Cattura foto
    captureBtn.addEventListener('click', function() {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Disegna il frame corrente sul canvas
        context.drawImage(video, 0, 0);
        
        // Converte in immagine
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        capturedImage.src = imageDataUrl;
        
        // Aggiorna UI
        video.style.display = 'none';
        webcamPreview.style.display = 'block';
        captureBtn.style.display = 'none';
        retakeBtn.style.display = 'inline-block';
        usePhotoBtn.style.display = 'inline-block';
    });

    // Riprova foto
    retakeBtn.addEventListener('click', function() {
        video.style.display = 'block';
        webcamPreview.style.display = 'none';
        captureBtn.style.display = 'inline-block';
        retakeBtn.style.display = 'none';
        usePhotoBtn.style.display = 'none';
    });

    // Usa la foto
    usePhotoBtn.addEventListener('click', function() {
        // Converte l'immagine in File object
        canvas.toBlob(function(blob) {
            const timestamp = new Date().getTime();
            const file = new File([blob], `webcam_capture_${timestamp}.jpg`, { type: 'image/jpeg' });
            
            // Aggiorna l'input file
            const input = document.getElementById(currentInputTarget);
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            
            // Mostra anteprima
            const preview = document.getElementById(currentPreviewTarget);
            const previewContainer = document.getElementById(currentPreviewContainer);
            
            preview.src = capturedImage.src;
            previewContainer.classList.remove('d-none');
            
            // Trigger change event
            const changeEvent = new Event('change', { bubbles: true });
            input.dispatchEvent(changeEvent);
            
            // Chiudi modal
            const modal = bootstrap.Modal.getInstance(webcamModal);
            modal.hide();
            
            showToast('Foto catturata con successo!', 'success');
            
        }, 'image/jpeg', 0.8);
    });
}

// Funzione per aprire il modal webcam
function openWebcamModal(inputId, previewId, previewContainerId) {
    currentInputTarget = inputId;
    currentPreviewTarget = previewId;
    currentPreviewContainer = previewContainerId;
    
    const modal = new bootstrap.Modal(document.getElementById('webcamModal'));
    modal.show();
}

// Resto delle funzioni esistenti...
async function fetchSubjects() {
    try {
        const response = await fetch('/subjects');
        
        if (!response.ok) {
            if (response.status === 0) {
                console.warn('Problema di connessione alla rete. Attesa e nuovo tentativo...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return fetchSubjects();
            }
            throw new Error(`Errore del server HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        allSubjects = data;
        renderSubjectsList(data);
        return data;
    } catch (error) {
        console.error('Errore durante il recupero dei soggetti:', error);
        
        if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            console.warn('Errore di rete. Riprovando tra 2 secondi...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return fetchSubjects();
        }
        
        showToast('Errore durante il recupero dei soggetti: ' + error.message, 'danger');
        throw error;
    }
}

function renderSubjectsList(subjects) {
    const subjectsList = document.getElementById('subjects-list');
    subjectsList.innerHTML = '';

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

    const sortedSubjects = Object.keys(subjects).sort();

    for (const subject of sortedSubjects) {
        const images = subjects[subject] || [];
        const firstImageUrl = images.length > 0 ? `/proxy/images/${images[0]}` : 'https://via.placeholder.com/48';

        const card = document.createElement('div');
        card.className = 'col-12';

        card.innerHTML = `
            <div class="subject-card bg-white p-3 rounded shadow-sm d-flex justify-content-between align-items-center flex-wrap">
                <div class="d-flex align-items-center gap-3">
                    <img src="${firstImageUrl}" alt="${subject}" class="rounded-circle" style="width: 48px; height: 48px; object-fit: cover;">
                    <span class="fw-bold fs-5">${subject}</span>
                </div>
                <div class="d-flex gap-2 mt-3 mt-md-0">
                    <button class="btn btn-sm btn-primary view-btn" data-subject="${subject}" title="Visualizza">
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
        `;

        // Event listeners per i pulsanti (rimuovo quello per add-image-btn)
        card.querySelector('.view-btn').addEventListener('click', function() {
            showSubjectDetails(this.getAttribute('data-subject'));
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

function showSubjectDetails(subject) {
    selectedSubject = subject;
    const subjectImages = allSubjects[subject] || [];
    
    const detailsContainer = document.getElementById('subject-details');
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

    // Event listeners
    document.getElementById('add-photo-btn').addEventListener('click', function () {
        openAddImageModal(subject);
    });

    document.getElementById('delete-btn').addEventListener('click', function () {
        openDeleteSubjectModal(subject);
    });

    // Event listeners per i pulsanti di eliminazione immagine
    document.querySelectorAll('.image-delete').forEach(button => {
        button.addEventListener('click', function () {
            const imageId = this.getAttribute('data-image-id');
            openDeleteImageModal(imageId, subject);
        });
    });
}

function openAddImageModal(subject) {
    document.getElementById('image-subject-name').value = subject;
    document.getElementById('add-image-subject-name').textContent = subject;
    document.getElementById('new-image-preview-container').classList.add('d-none');
    document.getElementById('new-subject-image').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('addImageModal'));
    modal.show();
}

function openRenameModal(subject) {
    document.getElementById('old-subject-name').value = subject;
    document.getElementById('new-subject-name').value = subject;
    
    const modal = new bootstrap.Modal(document.getElementById('renameSubjectModal'));
    modal.show();
}

function openDeleteSubjectModal(subject) {
    const message = `Sei sicuro di voler eliminare il soggetto "${subject}" e tutte le sue immagini associate? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-subject');
    document.getElementById('confirm-delete-btn').setAttribute('data-subject', subject);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

function openDeleteImageModal(imageId, subject) {
    const message = `Sei sicuro di voler eliminare questa immagine del soggetto "${subject}"? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-image');
    document.getElementById('confirm-delete-btn').setAttribute('data-image-id', imageId);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

async function addSubject() {
    const subjectName = document.getElementById('subject-name').value.trim();
    const subjectImage = document.getElementById('subject-image').files[0];
    
    if (!subjectName || !subjectImage) {
        showToast('Per favore, inserisci un nome e seleziona un\'immagine.', 'warning');
        return;
    }
    
    if (allSubjects[subjectName]) {
        showToast(`Il soggetto "${subjectName}" esiste già. Scegli un altro nome.`, 'warning');
        return;
    }
    
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        const formData = new FormData();
        formData.append('subject', subjectName);
        formData.append('image', subjectImage);
        
        const response = await fetch('/subjects', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'aggiunta del soggetto');
        }
        
        await fetchSubjects();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addSubjectModal'));
        modal.hide();
        
        document.getElementById('subject-name').value = '';
        document.getElementById('subject-image').value = '';
        document.getElementById('image-preview-container').classList.add('d-none');
        
        showToast(`Soggetto "${subjectName}" aggiunto con successo.`, 'success');
        showSubjectDetails(subjectName);
    } catch (error) {
        console.error('Errore durante l\'aggiunta del soggetto:', error);
        showToast('Errore durante l\'aggiunta del soggetto: ' + error.message, 'danger');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function renameSubject() {
    const oldName = document.getElementById('old-subject-name').value;
    const newName = document.getElementById('new-subject-name').value.trim();
    
    if (!newName) {
        showToast('Per favore, inserisci un nuovo nome.', 'warning');
        return;
    }
    
    if (oldName === newName) {
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        return;
    }
    
    if (allSubjects[newName]) {
        showToast(`Il soggetto "${newName}" esiste già. Scegli un altro nome.`, 'warning');
        return;
    }
    
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
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
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        
        showToast(`Soggetto rinominato da "${oldName}" a "${newName}" con successo.`, 'success');
        
        setTimeout(async () => {
            await fetchSubjects();
            selectedSubject = newName;
            showSubjectDetails(newName);
            document.getElementById('loading-overlay').style.display = 'none';
        }, 1000);
    } catch (error) {
        console.error('Errore durante la rinominazione del soggetto:', error);
        showToast('Errore durante la rinominazione del soggetto: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function addImageToSubject() {
    const subject = document.getElementById('image-subject-name').value;
    const image = document.getElementById('new-subject-image').files[0];
    
    if (!image) {
        showToast('Per favore, seleziona un\'immagine.', 'warning');
        return;
    }
    
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        const formData = new FormData();
        formData.append('image', image);
        
        const response = await fetch(`/subjects/${subject}/images`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'aggiunta dell\'immagine');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('addImageModal'));
        modal.hide();
        
        document.getElementById('new-subject-image').value = '';
        document.getElementById('new-image-preview-container').classList.add('d-none');
        
        showToast(`Immagine aggiunta al soggetto "${subject}" con successo.`, 'success');
        
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

async function confirmDelete() {
    const action = document.getElementById('confirm-delete-btn').getAttribute('data-action');
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal'));
    modal.hide();
    
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        if (action === 'delete-subject') {
            await deleteSubject();
        } else if (action === 'delete-image') {
            await deleteImage();
        }
    } catch (error) {
        console.error('Errore durante l\'eliminazione:', error);
        showToast('Errore durante l\'eliminazione: ' + error.message, 'danger');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

async function deleteSubject() {
    const subject = document.getElementById('confirm-delete-btn').getAttribute('data-subject');
    
    try {
        const subjectImages = [...(allSubjects[subject] || [])];
        
        showToast(`Eliminazione del soggetto "${subject}" in corso...`, 'info');
        
        for (const imageId of subjectImages) {
            try {
                await fetch(`/images/${imageId}`, {
                    method: 'DELETE'
                });
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`Errore durante l'eliminazione dell'immagine ${imageId}: ${error.message}`);
            }
        }
        
        const response = await fetch(`/subjects/${subject}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Errore durante l\'eliminazione del soggetto');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        await fetchSubjects();
        
        showToast(`Soggetto "${subject}" eliminato con successo.`, 'success');
        resetDetailsPanel();
    } catch (error) {
        throw error;
    }
}

async function deleteImage() {
    const imageId = document.getElementById('confirm-delete-btn').getAttribute('data-image-id');
    
    try {
        let imageSubject = null;
        for (const [subject, images] of Object.entries(allSubjects)) {
            if (images.includes(imageId)) {
                imageSubject = subject;
                break;
            }
        }
        
        showToast(`Eliminazione dell'immagine in corso...`, 'info');
        
        const response = await fetch(`/images/${imageId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Errore durante l\'eliminazione dell\'immagine');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showToast('Immagine eliminata con successo.', 'success');
        
        const updatedSubjects = await fetchSubjects();
        
        if (imageSubject && selectedSubject === imageSubject && updatedSubjects[imageSubject]) {
            showSubjectDetails(imageSubject);
        } else {
            resetDetailsPanel();
        }
    } catch (error) {
        throw error;
    }
}

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

function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toastId = 'toast-' + Date.now();
    
    const existingToasts = toastContainer.querySelectorAll(`.bg-${type}`);
    if (existingToasts.length > 2) {
        existingToasts[0].remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.setAttribute('id', toastId);
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 5000
    });
    
    bsToast.show();
    
    toast.addEventListener('hidden.bs.toast', function() {
        toast.remove();
    });
}