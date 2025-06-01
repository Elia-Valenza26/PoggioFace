import cv2
import base64
from threading import Thread
import queue

frame_queue = queue.Queue(maxsize=2)

class VideoStreamer:
    def __init__(self):
        self.cap = None
        self.running = False
    
    def start_stream(self):
        if not self.running:
            self.cap = cv2.VideoCapture(0)
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
                
                # Mantieni solo l'ultimo frame
                if not frame_queue.empty():
                    try:
                        frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                
                try:
                    frame_queue.put(frame_b64, block=False)
                except queue.Full:
                    pass
    
    def get_frame(self):
        try:
            return frame_queue.get_nowait()
        except queue.Empty:
            return None
