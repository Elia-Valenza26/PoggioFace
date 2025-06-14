import cv2
import threading
import base64
import time

class SharedVideoStreamer:
    def __init__(self):
        self.cap = None
        self.running = False
        self.current_frame = None
        self.frame_lock = threading.Lock()
        self.capture_thread = None
        self.restart_lock = threading.Lock()  # Nuovo: lock per restart sicuro
    
    def start_stream(self):
        """Avvia lo stream video condiviso"""
        with self.restart_lock:  # Protegge il restart concorrente
            if self.running:
                return
            
            # Chiudi eventuali connessioni precedenti
            if self.cap:
                self.cap.release()
                time.sleep(0.5)  # Pausa per rilascio risorse
                
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                raise Exception("Impossibile aprire la webcam")
                
            # Configura le proprietà della webcam per migliori performance
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Riduce latenza
            
            self.running = True
            self.capture_thread = threading.Thread(target=self._capture_frames, daemon=True)
            self.capture_thread.start()
    
    def stop_stream(self):
        """Ferma lo stream video condiviso"""
        with self.restart_lock:  # Protegge lo stop concorrente
            self.running = False
            
            if self.capture_thread:
                self.capture_thread.join(timeout=3)
                
            if self.cap:
                self.cap.release()
                self.cap = None
                
            with self.frame_lock:
                self.current_frame = None
    
    def restart_stream(self):
        """Riavvia lo stream in modo sicuro"""
        with self.restart_lock:
            self.stop_stream()
            time.sleep(1)  # Pausa per rilascio completo risorse
            self.start_stream()
    
    def _capture_frames(self):
        """Loop di cattura frame in background"""
        consecutive_failures = 0
        max_failures = 5
        
        while self.running and self.cap:
            try:
                ret, frame = self.cap.read()
                if ret:
                    consecutive_failures = 0  # Reset contatore errori
                    
                    # Ridimensiona per performance di rete
                    frame = cv2.resize(frame, (640, 480))
                    
                    # Converte in JPEG con qualità ottimizzata
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                    frame_b64 = base64.b64encode(buffer).decode('utf-8')
                    
                    # Aggiorna il frame corrente thread-safe
                    with self.frame_lock:
                        self.current_frame = frame_b64
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures:
                        # Troppi errori consecutivi, tenta restart
                        time.sleep(1)
                        if self.running:  # Solo se ancora dovrebbe girare
                            try:
                                self.cap.release()
                                time.sleep(0.5)
                                self.cap = cv2.VideoCapture(0)
                                consecutive_failures = 0
                            except Exception as e:
                                print(f"Errore restart webcam: {e}")
                                break
                    else:
                        time.sleep(0.1)
                        
            except Exception as e:
                print(f"Errore cattura frame: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_failures:
                    break
                time.sleep(0.1)
            
            # Controllo frame rate (circa 10 FPS per streaming)
            time.sleep(0.1)
    
    def get_frame(self):
        """Restituisce l'ultimo frame catturato"""
        with self.frame_lock:
            return self.current_frame
    
    def is_running(self):
        """Verifica se lo stream è attivo"""
        return self.running and self.cap is not None and self.cap.isOpened()
    
    def force_restart(self):
        """Forza un restart completo dello stream (per casi di emergenza)"""
        try:
            self.restart_stream()
            return True
        except Exception as e:
            print(f"Errore force restart: {e}")
            return False