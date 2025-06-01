import cv2
import base64
import threading
import time
import queue

class SharedVideoStreamer:
    def __init__(self):
        self.cap = None
        self.running = False
        self.current_frame = None
        self.frame_lock = threading.Lock()
        self.capture_thread = None
    
    def start_stream(self):
        """Avvia lo stream video condiviso"""
        if self.running:
            return
            
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise Exception("Impossibile aprire la webcam")
            
        # Configura le proprietà della webcam per migliori performance
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        
        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_frames, daemon=True)
        self.capture_thread.start()
    
    def stop_stream(self):
        """Ferma lo stream video condiviso"""
        self.running = False
        
        if self.capture_thread:
            self.capture_thread.join(timeout=2)
            
        if self.cap:
            self.cap.release()
            self.cap = None
            
        with self.frame_lock:
            self.current_frame = None
    
    def _capture_frames(self):
        """Loop di cattura frame in background"""
        while self.running and self.cap:
            ret, frame = self.cap.read()
            if ret:
                # Ridimensiona per performance di rete
                frame = cv2.resize(frame, (640, 480))
                
                # Converte in JPEG con qualità ottimizzata
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                
                # Aggiorna il frame corrente thread-safe
                with self.frame_lock:
                    self.current_frame = frame_b64
            else:
                # Se la cattura fallisce, pausa breve prima di riprovare
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