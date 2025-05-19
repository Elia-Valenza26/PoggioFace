// Configurazione letta dalle variabili passate dal backend
let config = {
    apiKey: '',
    host: '',
    port: '',
    detProbThreshold: 0.8,
    similarityThreshold: 0.85,
    facePlugins: 'age,gender'
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
        log("Avvio della camera...");
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }
        });
        
        videoElement.srcObject = stream;
        
        // Aspetta che il video sia pronto
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            isRunning = true;
            
            log("Camera avviata correttamente. Inizio del riconoscimento facciale.");
            
            // Inizia il loop di riconoscimento
            recognitionLoop();
            
            // Inizia il loop di rendering
            requestAnimationFrame(renderFrame);
        };
    } catch (error) {
        log(`ERRORE: Impossibile accedere alla camera: ${error.message}`);
        console.error("Errore nell'accesso alla camera:", error);
        alert("Impossibile accedere alla camera. Assicurati di aver concesso i permessi necessari.");
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

// Riconoscimento facciale sul frame video corrente
async function recognizeFromVideo() {
    if (!videoElement.videoWidth) return null;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth;
    tempCanvas.height = videoElement.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.translate(tempCanvas.width, 0);
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
    
    return new Promise(resolve => {
        tempCanvas.toBlob(async (blob) => {
            try {
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
                resolve(data.result);
            } catch (error) {
                log(`ERRORE nella richiesta API: ${error.message}`);
                console.error("Errore nella richiesta API:", error);
                resolve(null);
            }
        }, 'image/jpeg', 0.9);
    });
}


let lastRequestTime = 0;  // Variabile per tenere traccia dell'ultima richiesta

// Rendering del frame con la logica di pulizia delle scritte
function renderFrame() {
    if (!isRunning) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scrivi "PoggioFace" in alto al centro
    ctx.font = '28px Arial';  // Scritte più piccole
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

                // Controllo per il soggetto e la somiglianza
                if (result.subjects && result.subjects.length > 0) {
                    const subjects = result.subjects.sort((a, b) => b.similarity - a.similarity);
                    if (subjects[0].similarity >= config.similarityThreshold) {
                        subjectName = subjects[0].subject;
                        similarityScore = subjects[0].similarity;

                        // Scrivi "Benvenuto" in basso a sinistra, spostato verso destra
                        ctx.font = '18px Arial';  // Scritte più piccole
                        ctx.textAlign = 'left';
                        ctx.fillText(`Benvenuto ${subjectName}!`, 40, canvas.height - 40);

                        // Scrivi la somiglianza in basso a destra
                        ctx.textAlign = 'right';
                        ctx.fillText(`Similarità: ${similarityScore.toFixed(2)}`, canvas.width - 20, canvas.height - 40);

                        // Verifica se sono trascorsi almeno 3 secondi dall'ultima richiesta
                        const currentTime = new Date().getTime();
                        if (currentTime - lastRequestTime >= 5000) {  // 3000 ms = 3 secondi
                            // URL SHELLY: http://10.10.11.19/relay/0?turn=on 
                            fetch('http://10.10.11.19/relay/0?turn=on', {
                                method: 'POST', 
                            }).then(response => {
                                if (!response.ok) {
                                    console.error('Errore nella richiesta allo Shelly');
                                } else {
                                    console.info('Richiesta inviata correttamente');
                                      // Aggiorna il timestamp dell'ultima richiesta
                                }
                            }).catch(error => {
                                console.error('Errore nella richiesta allo Shelly', error);
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
    requestAnimationFrame(renderFrame);
}