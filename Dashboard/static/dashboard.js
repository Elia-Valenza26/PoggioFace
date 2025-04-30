// Variabili globali
let compreface_base_url;
let selectedSubject = null;
let allSubjects = {};

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
});

// Funzione per recuperare tutti i soggetti con gestione degli errori migliorata
async function fetchSubjects() {
    try {
        const response = await fetch('/subjects');
        
        if (!response.ok) {
            if (response.status === 0) {
                // Problema di connessione di rete
                console.warn('Problema di connessione alla rete. Attesa e nuovo tentativo...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // Attesa di 2 secondi
                return fetchSubjects(); // Riprova
            }
            throw new Error(`Errore del server HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        allSubjects = data;
        renderSubjectsList(data);
        return data;
    } catch (error) {
        console.error('Errore durante il recupero dei soggetti:', error);
        
        // Se è un errore di rete, aspetta un po' e riprova
        if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            console.warn('Errore di rete. Riprovando tra 2 secondi...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return fetchSubjects();
        }
        
        showToast('Errore durante il recupero dei soggetti: ' + error.message, 'danger');
        throw error;
    }
}

// Funzione per renderizzare la lista dei soggetti
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

        subjectsList.appendChild(card);

        // Event listeners
        card.querySelector('.view-btn').addEventListener('click', function () {
            const subject = this.getAttribute('data-subject');
            showSubjectDetails(subject);
        });

        card.querySelector('.rename-btn').addEventListener('click', function () {
            const subject = this.getAttribute('data-subject');
            openRenameModal(subject);
        });

        card.querySelector('.delete-btn').addEventListener('click', function () {
            const subject = this.getAttribute('data-subject');
            openDeleteSubjectModal(subject);
        });
    }
}

// Funzione per mostrare i dettagli di un soggetto
// function showSubjectDetails(subject) {
//     selectedSubject = subject;
//     const subjectImages = allSubjects[subject] || [];
//     const detailsContainer = document.getElementById('subject-details');
    
//     detailsContainer.innerHTML = `
//         <div class="details-header">
//             <h3 class="details-title">${subject}</h3>
//             <div class="action-btn-group">
//                 <button class="btn btn-sm btn-outline-primary action-btn" id="add-photo-btn">
//                     <i class="fas fa-camera"></i> Aggiungi Foto
//                 </button>
//                 <button class="btn btn-sm btn-outline-warning action-btn" id="rename-btn">
//                     <i class="fas fa-edit"></i> Rinomina
//                 </button>
//                 <button class="btn btn-sm btn-outline-danger action-btn" id="delete-btn">
//                     <i class="fas fa-trash"></i> Elimina
//                 </button>
//             </div>
//         </div>
//         <hr>
//         <p><strong>Numero di immagini:</strong> ${subjectImages.length}</p>
//         <div class="image-container">
//             ${subjectImages.map(imageId => `
//                 <div class="image-item">
//                     <img src="/proxy/images/${imageId}" alt="${subject}">
//                     <button class="image-delete" data-image-id="${imageId}">
//                         <i class="fas fa-times"></i>
//                     </button>
//                 </div>
//             `).join('')}
//         </div>
//     `;
    
//     // Aggiungi event listener per i pulsanti di azione
//     document.getElementById('add-photo-btn').addEventListener('click', function() {
//         openAddImageModal(subject);
//     });
    
//     document.getElementById('rename-btn').addEventListener('click', function() {
//         openRenameModal(subject);
//     });
    
//     document.getElementById('delete-btn').addEventListener('click', function() {
//         openDeleteSubjectModal(subject);
//     });
    
//     // Aggiungi event listener per i pulsanti di eliminazione immagine
//     const deleteButtons = detailsContainer.querySelectorAll('.image-delete');
//     deleteButtons.forEach(button => {
//         button.addEventListener('click', function() {
//             const imageId = this.getAttribute('data-image-id');
//             openDeleteImageModal(imageId, subject);
//         });
//     });
// }

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
        ${subjectImages.length === 0 ? `
            <div class="empty-state text-center py-4">
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

    const deleteButtons = detailsContainer.querySelectorAll('.image-delete');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function () {
            const imageId = this.getAttribute('data-image-id');
            openDeleteImageModal(imageId, subject);
        });
    });
}





// Funzione per aprire il modal di aggiunta immagine
function openAddImageModal(subject) {
    document.getElementById('image-subject-name').value = subject;
    document.getElementById('add-image-subject-name').textContent = subject;
    document.getElementById('new-image-preview-container').classList.add('d-none');
    document.getElementById('new-subject-image').value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('addImageModal'));
    modal.show();
}

// Funzione per aprire il modal di rinomina soggetto
function openRenameModal(subject) {
    document.getElementById('old-subject-name').value = subject;
    document.getElementById('new-subject-name').value = subject;
    
    const modal = new bootstrap.Modal(document.getElementById('renameSubjectModal'));
    modal.show();
}

// Funzione per aprire il modal di conferma eliminazione soggetto
function openDeleteSubjectModal(subject) {
    const message = `Sei sicuro di voler eliminare il soggetto "${subject}" e tutte le sue immagini associate? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    // Imposta i dati per l'eliminazione
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-subject');
    document.getElementById('confirm-delete-btn').setAttribute('data-subject', subject);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

// Funzione per aprire il modal di conferma eliminazione immagine
function openDeleteImageModal(imageId, subject) {
    const message = `Sei sicuro di voler eliminare questa immagine del soggetto "${subject}"? Questa azione non può essere annullata.`;
    document.getElementById('confirm-delete-message').textContent = message;
    
    // Imposta i dati per l'eliminazione
    document.getElementById('confirm-delete-btn').setAttribute('data-action', 'delete-image');
    document.getElementById('confirm-delete-btn').setAttribute('data-image-id', imageId);
    
    const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
    modal.show();
}

// Funzione per aggiungere un nuovo soggetto
async function addSubject() {
    const subjectName = document.getElementById('subject-name').value.trim();
    const subjectImage = document.getElementById('subject-image').files[0];
    
    if (!subjectName || !subjectImage) {
        showToast('Per favore, inserisci un nome e seleziona un\'immagine.', 'warning');
        return;
    }
    
    // Controlla se il soggetto esiste già
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
        
        // Aggiorna la lista dei soggetti
        await fetchSubjects();
        
        // Chiudi il modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addSubjectModal'));
        modal.hide();
        
        // Resetta il form
        document.getElementById('subject-name').value = '';
        document.getElementById('subject-image').value = '';
        document.getElementById('image-preview-container').classList.add('d-none');
        
        showToast(`Soggetto "${subjectName}" aggiunto con successo.`, 'success');
        
        // Mostra i dettagli del nuovo soggetto
        showSubjectDetails(subjectName);
    } catch (error) {
        console.error('Errore durante l\'aggiunta del soggetto:', error);
        showToast('Errore durante l\'aggiunta del soggetto: ' + error.message, 'danger');
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione per rinominare un soggetto
async function renameSubject() {
    const oldName = document.getElementById('old-subject-name').value;
    const newName = document.getElementById('new-subject-name').value.trim();
    
    if (!newName) {
        showToast('Per favore, inserisci un nuovo nome.', 'warning');
        return;
    }
    
    if (oldName === newName) {
        // Chiudi il modal se non ci sono cambiamenti
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        return;
    }
    
    // Controlla se il nuovo nome esiste già
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
        
        // Chiudi il modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('renameSubjectModal'));
        modal.hide();
        
        showToast(`Soggetto rinominato da "${oldName}" a "${newName}" con successo.`, 'success');
        
        // Attendere un breve periodo prima di aggiornare la lista per dare tempo al server
        setTimeout(async () => {
            // Aggiorna la lista dei soggetti
            await fetchSubjects();
            
            // Aggiorna il soggetto selezionato
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

// Funzione per aggiungere un'immagine a un soggetto
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
        
        // Chiudi il modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('addImageModal'));
        modal.hide();
        
        // Resetta il form
        document.getElementById('new-subject-image').value = '';
        document.getElementById('new-image-preview-container').classList.add('d-none');
        
        showToast(`Immagine aggiunta al soggetto "${subject}" con successo.`, 'success');
        
        // Attendi un breve periodo prima di aggiornare
        setTimeout(async () => {
            // Aggiorna la lista dei soggetti
            await fetchSubjects();
            
            // Aggiorna i dettagli del soggetto
            showSubjectDetails(subject);
            
            document.getElementById('loading-overlay').style.display = 'none';
        }, 1000);
    } catch (error) {
        console.error('Errore durante l\'aggiunta dell\'immagine:', error);
        showToast('Errore durante l\'aggiunta dell\'immagine: ' + error.message, 'danger');
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

// Funzione migliorata per gestire la conferma di eliminazione
async function confirmDelete() {
    const action = document.getElementById('confirm-delete-btn').getAttribute('data-action');
    
    // Chiudi il modal prima di iniziare il processo di eliminazione
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

// Funzione migliorata per eliminare un soggetto
async function deleteSubject() {
    const subject = document.getElementById('confirm-delete-btn').getAttribute('data-subject');
    
    try {
        // Memorizza l'elenco delle immagini per questo soggetto prima dell'eliminazione
        const subjectImages = [...(allSubjects[subject] || [])];
        
        // Mostra messaggio di elaborazione
        showToast(`Eliminazione del soggetto "${subject}" in corso...`, 'info');
        
        // Prima elimina singolarmente tutte le immagini
        for (const imageId of subjectImages) {
            try {
                await fetch(`/images/${imageId}`, {
                    method: 'DELETE'
                });
                // Breve pausa tra le eliminazioni per non sovraccaricare il server
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.warn(`Errore durante l'eliminazione dell'immagine ${imageId}: ${error.message}`);
                // Continua con le altre immagini anche se una fallisce
            }
        }
        
        // Poi elimina il soggetto
        const response = await fetch(`/subjects/${subject}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Errore durante l\'eliminazione del soggetto');
        }
        
        // Attendere che il server finisca di elaborare
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Aggiorna la lista dei soggetti
        await fetchSubjects();
        
        showToast(`Soggetto "${subject}" eliminato con successo.`, 'success');
        
        // Ripristina il pannello dei dettagli
        resetDetailsPanel();
    } catch (error) {
        throw error;
    }
}

// Funzione migliorata per eliminare un'immagine
async function deleteImage() {
    const imageId = document.getElementById('confirm-delete-btn').getAttribute('data-image-id');
    
    try {
        // Prima determina a quale soggetto appartiene l'immagine
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
        
        // Attendere che il server finisca di elaborare
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showToast('Immagine eliminata con successo.', 'success');
        
        // Aggiorna la lista dei soggetti
        const updatedSubjects = await fetchSubjects();
        
        // Se il soggetto esiste ancora e corrisponde a quello selezionato, aggiorna i dettagli
        if (imageSubject && selectedSubject === imageSubject && updatedSubjects[imageSubject]) {
            showSubjectDetails(imageSubject);
        } else {
            // Altrimenti, reimposta il pannello dei dettagli
            resetDetailsPanel();
        }
    } catch (error) {
        throw error;
    }
}

// Funzione per ripristinare il pannello dei dettagli
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

// Funzione migliorata per mostrare un toast di notifica
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toastId = 'toast-' + Date.now();
    
    // Rimuovi toast esistenti dello stesso tipo se necessario
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
    
    // Rimuovi il toast dal DOM dopo che è stato nascosto
    toast.addEventListener('hidden.bs.toast', function() {
        toast.remove();
    });
}