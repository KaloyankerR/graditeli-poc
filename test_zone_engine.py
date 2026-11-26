import pytest

from zone_engine import ZoneEngine

A, B = "000000000001", "000000000002"


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def engine(clock):
    return ZoneEngine(enter_rssi=-65, exit_rssi=-75, window=5, stale_sec=3,
                      switch_margin_db=5, clock=clock)


def feed(engine, clock, instance, values, dt=0.1):
    for v in values:
        clock.t += dt
        engine.add(instance, v)


def test_enter(engine, clock):
    feed(engine, clock, A, [-60] * 5)
    assert engine.evaluate() == A
    assert engine.current == A


def test_weak_beacon_does_not_enter(engine, clock):
    feed(engine, clock, A, [-70] * 5)
    assert engine.evaluate() is None
    assert engine.current is None


def test_leave_then_reenter_announces_again(engine, clock):
    feed(engine, clock, A, [-60] * 5)
    assert engine.evaluate() == A
    feed(engine, clock, A, [-80] * 5)
    assert engine.evaluate() is None
    assert engine.current is None
    feed(engine, clock, A, [-60] * 5)
    assert engine.evaluate() == A


def test_stale_beacon_leaves_zone(engine, clock):
    feed(engine, clock, A, [-60] * 5)
    assert engine.evaluate() == A
    clock.t += 3.5
    assert engine.averages() == {}
    assert engine.evaluate() is None
    assert engine.current is None


def test_stale_readings_are_discarded_on_return(engine, clock):
    feed(engine, clock, A, [-50] * 5)
    clock.t += 5
    feed(engine, clock, A, [-80])
    assert engine.averages() == {A: -80}


def test_no_duplicate_announcements(engine, clock):
    events = []
    for _ in range(20):
        feed(engine, clock, A, [-60])
        events.append(engine.evaluate())
    assert [e for e in events if e] == [A]


def test_switch_requires_margin(engine, clock):
    feed(engine, clock, A, [-60] * 5)
    assert engine.evaluate() == A
    feed(engine, clock, B, [-57] * 5)          # only 3 dB stronger
    assert engine.evaluate() is None
    assert engine.current == A
    feed(engine, clock, B, [-50] * 5)          # 10 dB stronger
    assert engine.evaluate() == B
    assert engine.current == B


def test_noisy_rssi_around_threshold_does_not_flap(engine, clock):
    noise = [-62, -68, -64, -70, -61, -67, -66, -63, -72, -60] * 4
    events = []
    for v in noise:
        feed(engine, clock, A, [v])
        events.append(engine.evaluate())
    assert [e for e in events if e] == [A]
    assert engine.current == A


def test_noisy_two_beacons_do_not_flap(engine, clock):
    events = []
    for i in range(40):
        feed(engine, clock, A, [-60 + (i % 3) - 1])
        feed(engine, clock, B, [-61 + (i % 4) - 2])
        events.append(engine.evaluate())
    assert len([e for e in events if e]) == 1
