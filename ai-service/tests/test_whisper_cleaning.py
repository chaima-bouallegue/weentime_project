import unittest

from voice.stt import clean_transcript


class WhisperCleaningTests(unittest.TestCase):
    def test_repeated_phrase_is_rejected(self) -> None:
        self.assertIsNone(clean_transcript("il est bien il est bien"))

    def test_repeated_words_are_rejected(self) -> None:
        self.assertIsNone(clean_transcript("bonjour bonjour bonjour bonjour"))

    def test_short_greeting_is_preserved(self) -> None:
        self.assertEqual(clean_transcript("Bonjour !"), "bonjour")

    def test_short_hr_terms_are_preserved(self) -> None:
        for value in ("salut", "congé", "teletravail", "pointage", "مرحبا"):
            with self.subTest(value=value):
                self.assertIsNotNone(clean_transcript(value))

    def test_valid_leave_request_is_preserved(self) -> None:
        self.assertEqual(
            clean_transcript("Je veux un congé demain"),
            "je veux un congé demain",
        )

    def test_valid_pointage_request_is_preserved(self) -> None:
        self.assertEqual(
            clean_transcript("je veux pointer"),
            "je veux pointer",
        )

    def test_valid_telework_request_is_preserved(self) -> None:
        self.assertEqual(
            clean_transcript("je veux faire une demande de teletravail"),
            "je veux faire une demande de teletravail",
        )


if __name__ == "__main__":
    unittest.main()
