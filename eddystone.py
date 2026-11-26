"""Eddystone-UID parsing from bleak advertisement service data."""

FEAA_UUID = "0000feaa-0000-1000-8000-00805f9b34fb"
UID_FRAME = 0x00


def parse_instance(service_data):
    """Return the 6-byte instance id as hex, or None if this is not an Eddystone-UID frame.

    Frame layout: [0] frame type, [1] Tx power, [2:12] namespace, [12:18] instance.
    """
    data = (service_data or {}).get(FEAA_UUID)
    if not data or len(data) < 18 or data[0] != UID_FRAME:
        return None
    return bytes(data[12:18]).hex()
