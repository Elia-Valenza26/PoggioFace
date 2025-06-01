import cv2
import base64
import threading
from threading import Thread
import queue
import time

# Variabile globale per lo streamer condiviso
shared_video_stream = None

class SharedVideoStreamer:
    def __init__(self):
        self.cap = None
        self.running = False
        self.subscribers = set()
        self.current_frame = None
        self.frame_lock = threading.Lock()
    
    def start_stream(self):
        if not self.running:
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                raise Exception("Impossibile aprire la webcam")
            self.running = True
            Thread(target=self._capture_frames, daemon=True).start()
    
    def stop_stream(self):
        self.running = False
        if self.cap:
            self.cap.release()
    
    def _capture_frames(self):
        while self.running and self.cap:
            ret, frame = self.cap.read()
            if ret:
                # Riduci la qualità per streaming più fluido
                frame = cv2.resize(frame, (640, 480))
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                
                with self.frame_lock:
                    self.current_frame = frame_b64
            
            time.sleep(0.1)  # 10 FPS
    
    def get_frame(self):
        with self.frame_lock:
            return self.current_frame
    
    def is_running(self):
        return self.running
