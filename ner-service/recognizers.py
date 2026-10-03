"""
Custom Presidio recognizers for Argentine legal documents.
"""
from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult
from presidio_analyzer import LocalRecognizer
import re


class ArgentineDNIRecognizer(PatternRecognizer):
    """Matches Argentine DNI numbers: 12.345.678 or 12345678, optionally preceded by DNI/D.N.I./LC/LE."""
    PATTERNS = [
        Pattern("dni_con_sigla", r"\b(?:D\.?\s?N\.?\s?I\.?|L\.?\s?C\.?|L\.?\s?E\.?|documento(?:\s+nacional)?(?:\s+de\s+identidad)?)\s*(?:n[°ºo]?\.?\s*)?:?\s*(\d{1,2}\.?\d{3}\.?\d{3})\b", 0.85),
        Pattern("dni_solo", r"\b\d{1,2}\.\d{3}\.\d{3}\b", 0.4),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="AR_DNI",
            patterns=self.PATTERNS,
            supported_language="es",
            name="Argentine DNI Recognizer",
        )


class ArgentineCUITRecognizer(PatternRecognizer):
    """Matches CUIT/CUIL: 20-12345678-3 or 20123456783."""
    PATTERNS = [
        Pattern("cuit_guiones", r"\b(?:2[0-7]|3[0-4])-\d{8}-\d\b", 0.9),
        Pattern("cuit_espacios", r"\b(?:2[0-7]|3[0-4])\s\d{8}\s\d\b", 0.85),
        Pattern("cuit_junto", r"\b(?:2[0-7]|3[0-4])\d{8}\d\b", 0.6),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="AR_CUIT",
            patterns=self.PATTERNS,
            supported_language="es",
            name="Argentine CUIT/CUIL Recognizer",
        )


class ArgentineMatriculaRecognizer(PatternRecognizer):
    """Matches property registration numbers (matrículas)."""
    PATTERNS = [
        Pattern("matricula", r"\b[Mm]atr[ií]cula(?:\s+(?:[Nn][°ºo]?\.?|registral|inmobiliaria))?\s*:?\s*((?:[A-Z]{1,3}\s?)?\d[\d./-]{2,}\d(?:/\d{1,3})?)", 0.85),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="AR_MATRICULA",
            patterns=self.PATTERNS,
            supported_language="es",
            name="Argentine Matricula Recognizer",
        )


class ArgentinePartidaRecognizer(PatternRecognizer):
    """Matches property parcel numbers (partidas inmobiliarias)."""
    PATTERNS = [
        Pattern("partida", r"\b[Pp]artida(?:\s+inmobiliaria)?\s*(?:[Nn][°ºo]?\.?)?\s*:?\s*(\d[\d./-]{3,}\d)", 0.85),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="AR_PARTIDA",
            patterns=self.PATTERNS,
            supported_language="es",
            name="Argentine Partida Recognizer",
        )


class ArgentineAddressRecognizer(LocalRecognizer):
    """
    Heuristic recognizer for Argentine addresses.
    Matches patterns like "calle Nombre N° 123", "Av. San Martín 456, piso 3".
    """
    SUPPORTED_ENTITIES = ["AR_DOMICILIO"]
    SUPPORTED_LANGUAGE = "es"

    PREFIXES = r"(?:calle|av\.?|avenida|bv\.?|boulevard|bvar\.?|pasaje|pje\.?|diagonal|diag\.?|ruta)"
    PATTERN = re.compile(
        rf"\b(?:{PREFIXES})\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ\s.]+?\s*(?:n[°ºo]?\.?\s*)?\d{{1,5}}"
        r"(?:\s*,?\s*(?:piso|p\.?|dto\.?|depto\.?|dpto\.?|uf\.?|unidad)\s*\w{1,5})?",
        re.IGNORECASE | re.UNICODE,
    )

    def __init__(self):
        super().__init__(
            supported_entities=self.SUPPORTED_ENTITIES,
            supported_language=self.SUPPORTED_LANGUAGE,
            name="Argentine Address Recognizer",
        )

    def load(self):
        pass

    def analyze(self, text, entities, nlp_artifacts=None):
        results = []
        for match in self.PATTERN.finditer(text):
            results.append(RecognizerResult(
                entity_type="AR_DOMICILIO",
                start=match.start(),
                end=match.end(),
                score=0.6,
            ))
        return results


def get_custom_recognizers():
    return [
        ArgentineDNIRecognizer(),
        ArgentineCUITRecognizer(),
        ArgentineMatriculaRecognizer(),
        ArgentinePartidaRecognizer(),
        ArgentineAddressRecognizer(),
    ]
