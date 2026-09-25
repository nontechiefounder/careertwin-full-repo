from typing import NamedTuple, Protocol


class ScanResult(NamedTuple):
    clean: bool
    virus_name: str | None = None


class MalwareScanner(Protocol):
    async def scan(self, data: bytes) -> ScanResult: ...


class StubMalwareScanner(MalwareScanner):
    """Stub malware scanner that flags EICAR test string and passes clean files."""

    EICAR_TEST_STRING = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

    async def scan(self, data: bytes) -> ScanResult:
        if self.EICAR_TEST_STRING in data or b"EICAR" in data:
            return ScanResult(clean=False, virus_name="EICAR-Test-File")
        return ScanResult(clean=True, virus_name=None)
