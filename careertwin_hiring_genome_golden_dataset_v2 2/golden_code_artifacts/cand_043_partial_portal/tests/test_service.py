from src.service import Request, process

def test_process():
    assert process(Request('x'))['status'] == 'accepted'

def test_empty():
    try:
        process(Request(''))
        assert False
    except ValueError:
        assert True
