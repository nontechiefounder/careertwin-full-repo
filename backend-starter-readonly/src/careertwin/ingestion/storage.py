from typing import Protocol


class ObjectStorageService(Protocol):
    async def put_quarantined(self, object_key: str, data: bytes) -> str: ...

    async def promote_to_accepted(self, object_key: str) -> str: ...

    async def delete(self, object_key: str) -> None: ...

    async def get(self, object_key: str) -> bytes | None: ...


class InMemoryObjectStorage(ObjectStorageService):
    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}

    async def put_quarantined(self, object_key: str, data: bytes) -> str:
        quarantine_key = f"quarantined/{object_key}"
        self.store[quarantine_key] = data
        return quarantine_key

    async def promote_to_accepted(self, object_key: str) -> str:
        quarantine_key = f"quarantined/{object_key}"
        accepted_key = f"accepted/{object_key}"
        if quarantine_key in self.store:
            data = self.store.pop(quarantine_key)
            self.store[accepted_key] = data
            return accepted_key
        raise KeyError(f"Quarantined key {quarantine_key} not found")

    async def delete(self, object_key: str) -> None:
        for prefix in ["quarantined/", "accepted/"]:
            key = f"{prefix}{object_key}"
            self.store.pop(key, None)
        self.store.pop(object_key, None)

    async def get(self, object_key: str) -> bytes | None:
        if object_key in self.store:
            return self.store[object_key]
        for prefix in ["accepted/", "quarantined/"]:
            key = f"{prefix}{object_key}"
            if key in self.store:
                return self.store[key]
        return None
