import requests

url = "http://10.10.10.95:8000/api/v1/recognition/subjects"
api_key = "675d4870-ee0c-4271-929f-3b11141048b0"  # Sostituisci con la tua chiave API reale
subject_name = "Leo"  # Sostituisci con il nome del subject

headers = {
    "Content-Type": "application/json",
    "x-api-key": api_key
}

data = {
    "subject": subject_name
}

try:
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()  # Solleva un'eccezione per codici HTTP 4xx/5xx
    
    print("Subject creato con successo!")
    print("Risposta del server:", response.json())
    
except requests.exceptions.RequestException as e:
    print("Errore nella richiesta HTTP:", e)
except ValueError as ve:
    print("Errore nel parsing della risposta JSON:", ve)