// Configurazione letta dalle variabili passate dal backend
let config = {
    apiKey: '',
    host: '',
    port: '',
    detProbThreshold: 0.8,
    similarityThreshold: 0.85,
    facePlugins: 'age,gender',
    shellyUrl:""
};

let subjectName = "";
let similarityScore = 0;
let subjectVisible = false; // Variabile per tenere traccia della visibilità del soggetto

// Carica la configurazione dal server prima di inizializzare la camera
async function loadConfig() {
    try {
        const response = await fetch('/config');
        if (!response.ok) {
            throw new Error(`Errore nel caricamento della configurazione: ${response.status}`);
        }
        const serverConfig = await response.json();
        
        // Aggiorna la configurazione con i valori dal server
        config = {...config, ...serverConfig};
        
        log("Configurazione caricata dal server");
        console.log("Configurazione:", config);
        
        //Avvio camera dopo il caricamento della configurazione
        startCamera();
    } catch (error) {
        log(`ERRORE: Impossibile caricare la configurazione: ${error.message}`);
        console.error("Errore nel caricamento della configurazione:", error);
        alert("Errore nel caricamento della configurazione. Controllare la console per dettagli.");
    }
}

// Funzione di log - invia i log al server
function log(message) {
    fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${new Date().toLocaleTimeString()}: ${message}` })
    }).catch(err => console.error('Errore nel logging:', err));
}

// Modifica l'evento DOMContentLoaded per caricare prima la configurazione
window.addEventListener('DOMContentLoaded', () => {
    log('Applicazione avviata, caricamento configurazione...');
    loadConfig();  // Carica la configurazione prima di inizializzare la camera
});

// Elementi DOM
const videoElement = document.getElementById('videoElement');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let stream = null;
let isRunning = false;
let recognitionTimer = null;
let lastResults = [];

// Avvio della telecamera
async function startCamera() {
    try {
        log("Avvio della camera tramite stream condiviso...");
        
        // Avvia lo stream condiviso sul server
        const response = await fetch('/start_video_stream', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Impossibile avviare lo stream condiviso');
        }
        
        // Simula le dimensioni del video per il canvas
        canvas.width = 640;
        canvas.height = 480;
        
        log("Stream condiviso avviato correttamente.");
        
        // Avvia anche il riconoscimento
        await startRecognition();
        
        // Inizia il loop di rendering
        requestAnimationFrame(renderFrame);
        
    } catch (error) {
        log(`ERRORE: Impossibile accedere allo stream condiviso: ${error.message}`);
        console.error("Errore nell'accesso allo stream condiviso:", error);
        alert("Impossibile accedere allo stream condiviso. Verificare la connessione della webcam");
    }
}

async function startRecognition() {
    try {
        const response = await fetch('/start_recognition', {
            method: 'POST'
        });
        
        if (response.ok) {
            isRunning = true;
            log("Riconoscimento facciale avviato.");
            recognitionLoop();
        } else {
            throw new Error('Impossibile avviare il riconoscimento');
        }
    } catch (error) {
        log(`ERRORE: Impossibile avviare il riconoscimento: ${error.message}`);
    }
}

// Nuova funzione per fermare il riconoscimento
async function stopRecognition() {
    try {
        const response = await fetch('/stop_recognition', {
            method: 'POST'
        });
        
        if (response.ok) {
            isRunning = false;
            if (recognitionTimer) {
                clearTimeout(recognitionTimer);
                recognitionTimer = null;
            }
            log("Riconoscimento facciale fermato.");
        } else {
            throw new Error('Impossibile fermare il riconoscimento');
        }
    } catch (error) {
        log(`ERRORE: Impossibile fermare il riconoscimento: ${error.message}`);
    }
}

// Loop di riconoscimento (eseguito ogni 1 secondo)
function recognitionLoop() {
    if (!isRunning) return;

    recognizeFromVideo()
        .then(results => {
            if (results && results.length > 0) {
                lastResults = results;
                subjectVisible = true; // Il soggetto è visibile
                log(`Riconosciuto ${results.length} volti.`);
            } else {
                subjectVisible = false; // Nessun soggetto riconosciuto
            }
        })
        .catch(error => {
            log(`ERRORE nel riconoscimento: ${error.message}`);
            console.error("Errore nel riconoscimento:", error);
        })
        .finally(() => {
            // Pianifica il prossimo riconoscimento
            recognitionTimer = setTimeout(recognitionLoop, 1000);
        });
}

// Riconoscimento facciale dal frame dello stream condiviso
async function recognizeFromVideo() {
    try {
        // Ottieni il frame dal server
        const frameResponse = await fetch('/get_video_frame');
        const frameData = await frameResponse.json();
        
        if (!frameData.frame) {
            return null;
        }
        
        // Converte il frame base64 in blob
        const byteCharacters = atob(frameData.frame);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        
        const timestamp = new Date().getTime();
        const file = new File([blob], `webcam_${timestamp}.jpg`, { type: 'image/jpeg' });
        
        const formData = new FormData();
        formData.append('file', file);

        // Costruire l'URL base in modo sicuro
        let baseUrl = config.host;
        
        // Aggiungi la porta se non è già inclusa nell'host
        if (config.port && !baseUrl.includes(`:${config.port}`)) {
            baseUrl = `${baseUrl}:${config.port}`;
        }
        
        // Costruisci l'URL completo per l'API
        const apiUrl = `${baseUrl}/api/v1/recognition/recognize`;
        
        // Prepara i parametri di query
        const params = new URLSearchParams({
            limit: '0',
            det_prob_threshold: config.detProbThreshold,
            prediction_count: '1'
        });
        
        // Aggiungi face_plugins solo se è definito e non vuoto
        if (config.facePlugins && config.facePlugins.trim() !== '') {
            params.append('face_plugins', config.facePlugins);
        }

        log(`Invio richiesta a: ${apiUrl}?${params.toString()}`);
        
        const response = await fetch(`${apiUrl}?${params.toString()}`, {
            method: 'POST',
            headers: {
                'x-api-key': config.apiKey
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            log(`Risposta API: ${response.status} - ${errorText}`);
            throw new Error(`Errore API: ${response.status}`);
        }
        
        const data = await response.json();
        log(`Risposta API ricevuta correttamente.`);
        return data.result;
        
    } catch (error) {
        log(`ERRORE nella richiesta API: ${error.message}`);
        console.error("Errore nella richiesta API:", error);
        return null;
    }
}


let lastRequestTime = 0;  // Variabile per tenere traccia dell'ultima richiesta


// Rendering del frame con la logica di pulizia delle scritte (MIGLIORATA)
function renderFrame() {
    if (!isRunning) {
        requestAnimationFrame(renderFrame);
        return;
    }
    
    // Prima ottieni e disegna il frame video
    fetch('/get_video_frame')
        .then(response => response.json())
        .then(frameData => {
            if (frameData.frame) {
                // Crea un'immagine temporanea per disegnare sul canvas
                const img = new Image();
                img.onload = () => {
                    // Pulisci il canvas
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // Disegna l'immagine sul canvas (specchiata)
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(img, -canvas.width, 0, canvas.width, canvas.height);
                    ctx.restore();
                    
                    // Poi disegna gli overlay
                    drawOverlays();
                };
                img.src = `data:image/jpeg;base64,${frameData.frame}`;
            } else {
                // Se non c'è frame, mostra schermo nero con messaggio e prova restart
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = 'white';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Sistema in restart...', canvas.width / 2, canvas.height / 2);
                
                // Prova a riavviare il sistema se non l'abbiamo fatto di recente
                if (!window.lastRestartAttempt || (Date.now() - window.lastRestartAttempt) > 5000) {
                    window.lastRestartAttempt = Date.now();
                    fetch('/restart_system', { method: 'POST' })
                        .then(response => response.json())
                        .then(result => {
                            if (result.status === 'success') {
                                log('Sistema riavviato automaticamente');
                            }
                        })
                        .catch(error => {
                            log('Errore riavvio automatico: ' + error.message);
                        });
                }
            }
        })
        .catch(error => {
            // Mostra errore sul canvas
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = 'red';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Errore connessione camera', canvas.width / 2, canvas.height / 2);
            
            // Tentativo di restart dopo errore
            if (!window.lastRestartAttempt || (Date.now() - window.lastRestartAttempt) > 10000) {
                window.lastRestartAttempt = Date.now();
                fetch('/restart_system', { method: 'POST' })
                    .catch(err => console.error('Errore restart:', err));
            }
        })
        .finally(() => {
            // Continua il loop di rendering
            requestAnimationFrame(renderFrame);
        });
}


// Sposta la logica degli overlay in una funzione separata
function drawOverlays() {
    // Scrivi "PoggioFace" in alto al centro
    ctx.font = '28px Arial';
    ctx.fillStyle = '#00FFFF';
    ctx.textAlign = 'center';
    ctx.fillText('PoggioFace', canvas.width / 2, 40);

    if (subjectVisible && lastResults && lastResults.length > 0) {
        lastResults.forEach(result => {
            const box = result.box;
            if (box) {
                const x_min = canvas.width - box.x_max;
                const x_max = canvas.width - box.x_min;
                const y_min = box.y_min;
                const y_max = box.y_max;

                // Resto della logica per soggetti e similarità...
                if (result.subjects && result.subjects.length > 0) {
                    const subjects = result.subjects.sort((a, b) => b.similarity - a.similarity);
                    if (subjects[0].similarity >= config.similarityThreshold) {
                        subjectName = subjects[0].subject;
                        similarityScore = subjects[0].similarity;

                        // Scrivi "Benvenuto" in basso a sinistra
                        ctx.font = '18px Arial';
                        ctx.textAlign = 'left';
                        ctx.fillText(`Benvenuto ${subjectName}!`, 40, canvas.height - 40);

                        // Scrivi la somiglianza in basso a destra
                        ctx.textAlign = 'right';
                        ctx.fillText(`Similarità: ${similarityScore.toFixed(2)}`, canvas.width - 20, canvas.height - 40);

                        // Logica Shelly (rimane uguale)...
                        const currentTime = new Date().getTime();
                        if (currentTime - lastRequestTime >= 5000) {
                            fetch('/shelly_url', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            }).then(response => {
                                if (!response.ok) {
                                    console.error('Errore nella richiesta allo Shelly');
                                    log('Errore nella richiesta allo Shelly');
                                } else {
                                    console.info('Richiesta Shelly inviata correttamente');
                                    log('Dispositivo Shelly attivato correttamente');
                                }
                                return response.json();
                            }).then(data => {
                                if (data.error) {
                                    log(`Errore Shelly: ${data.error}`);
                                } else {
                                    log(`Shelly: ${data.message}`);
                                }
                            }).catch(error => {
                                console.error('Errore nella richiesta allo Shelly', error);
                                log(`Errore connessione Shelly: ${error.message}`);
                            });
                            lastRequestTime = currentTime;
                        }
                    }
                }
            }
        });
    } else {
        // Se il soggetto non è visibile, pulisci le scritte
        subjectName = '';
        similarityScore = 0;
    }
}

// Gestione messaggi dal RemoteCapture (AGGIORNATA)
window.addEventListener('message', async (event) => {
    if (event.data.type === 'stop_recognition') {
        await stopRecognition();
    } else if (event.data.type === 'start_recognition') {
        await startRecognition();
    } else if (event.data.type === 'restart_system') {
        // Gestione restart completo
        try {
            log('Ricevuto comando restart dal sistema remoto');
            const response = await fetch('/restart_system', { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                log('Sistema riavviato dopo cattura foto remota');
                isRunning = true;
                // Riavvia anche il loop di riconoscimento se necessario
                if (!recognitionTimer) {
                    recognitionLoop();
                }
                // Reset flag ultimo restart
                delete window.lastRestartAttempt;
            }
        } catch (error) {
            log('Errore riavvio sistema: ' + error.message);
        }
    }
});