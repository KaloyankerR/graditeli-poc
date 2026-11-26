from speaker import volume_for_rssi


def test_volume_scales_with_rssi():
    assert volume_for_rssi(-50, -75, -50, 0.2) == 1.0
    assert volume_for_rssi(-75, -75, -50, 0.2) == 0.2
    assert abs(volume_for_rssi(-62.5, -75, -50, 0.2) - 0.6) < 1e-9


def test_volume_is_clamped():
    assert volume_for_rssi(-40, -75, -50, 0.2) == 1.0
    assert volume_for_rssi(-95, -75, -50, 0.2) == 0.2
