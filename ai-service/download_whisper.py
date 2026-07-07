from faster_whisper import WhisperModel
WhisperModel("tiny", device="cpu", compute_type="int8", local_files_only=False)
print("Modele tiny telecharge et mis en cache.")