from dataclasses import dataclass

@dataclass(frozen=True)
class Request:
    key: str

def process(req: Request) -> dict:
    if not req.key.strip():
        raise ValueError('key required')
    return {'key': req.key, 'status': 'accepted'}
