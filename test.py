from compreface import CompreFace
from compreface.service import RecognitionService
from compreface.collections import FaceCollection
from compreface.collections.face_collections import Subjects

DOMAIN: str = 'http://10.10.10.95'
PORT: str = '8000'
API_KEY: str = '675d4870-ee0c-4271-929f-3b11141048b0'

compre_face: CompreFace = CompreFace(DOMAIN, PORT)

recognition: RecognitionService = compre_face.init_face_recognition(API_KEY)

face_collection: FaceCollection = recognition.get_face_collection()

subjects: Subjects = recognition.get_subjects()

subject_name: str = 'Leo'
image_path: str = 'leo.jpg'

face_collection.add(image_path=image_path, subject=subject_name)