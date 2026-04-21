import unittest

from voice.stt import clean_transcript


class WhisperCleaningTests(unittest.TestCase):
    def test_excessive_bien_noise_is_rejected(self) -> None:
        self.assertIsNone(clean_transcript("bien bien bien bien"))

    def test_repeated_phrase_is_rejected(self) -> None:
        self.assertIsNone(clean_transcript("il est bien il est bien"))

    def test_repeated_words_are_rejected(self) -> None:
        self.assertIsNone(clean_transcript("bonjour bonjour bonjour bonjour"))

    def test_short_transcription_is_rejected(self) -> None:
        self.assertIsNone(clean_transcript("bonjour"))


if __name__ == "__main__":
    unittest.main()
