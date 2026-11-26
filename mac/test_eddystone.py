from eddystone import FEAA_UUID, parse_instance

NAMESPACE = bytes(10)


def test_valid_uid_frame():
    data = bytes([0x00, 0xC5]) + NAMESPACE + bytes.fromhex("000000000001")
    assert parse_instance({FEAA_UUID: data}) == "000000000001"


def test_valid_uid_frame_with_reserved_bytes():
    data = bytes([0x00, 0xC5]) + NAMESPACE + bytes.fromhex("000000000002") + b"\x00\x00"
    assert parse_instance({FEAA_UUID: data}) == "000000000002"


def test_wrong_frame_type():
    url_frame = bytes([0x10, 0xC5]) + NAMESPACE + bytes.fromhex("000000000001")
    assert parse_instance({FEAA_UUID: url_frame}) is None


def test_missing_data():
    assert parse_instance({}) is None
    assert parse_instance(None) is None
    assert parse_instance({"0000180f-0000-1000-8000-00805f9b34fb": b"\x00" * 18}) is None


def test_truncated_frame():
    assert parse_instance({FEAA_UUID: bytes([0x00, 0xC5]) + NAMESPACE}) is None
