import CoreBluetooth
import CoreLocation
import ExpoModulesCore

private let eddystoneUUID = CBUUID(string: "FEAA")

/// iPhones can't send Eddystone, so an iPhone beacon advertises the service UUID
/// 6D657472-6F62-6561-636F-6E00000000NN ("metrobeacon" + zone NN), reported as instance 0000000000NN.
private let iPhoneBeaconUUIDs: [CBUUID: String] = Dictionary(
  uniqueKeysWithValues: (1...9).map { zone in
    let nn = String(format: "%02X", zone)
    return (CBUUID(string: "6D657472-6F62-6561-636F-6E00000000\(nn)"), "0000000000\(nn)")
  })

/// Scans for Eddystone-UID and iPhone beacons and reports every advertisement to JS as `onBeacon`.
public class BeaconScannerModule: Module {
  private lazy var scanner = EddystoneScanner(
    onBeacon: { [weak self] instance, rssi in
      self?.sendEvent("onBeacon", ["instance": instance, "rssi": rssi])
    },
    onState: { [weak self] state in
      self?.sendEvent("onState", ["state": state])
    })
  private lazy var compass = HeadingTracker { [weak self] heading in
    self?.sendEvent("onHeading", ["heading": heading])
  }

  public func definition() -> ModuleDefinition {
    Name("BeaconScanner")
    Events("onBeacon", "onState", "onHeading")

    Function("start") { self.scanner.start() }
    Function("stop") { self.scanner.stop() }
    Function("startHeading") { self.compass.start() }
    Function("stopHeading") { self.compass.stop() }

    // Small persisted numeric settings (e.g. the entry threshold), kept in UserDefaults.
    Function("getNumber") { (key: String) -> Double? in
      UserDefaults.standard.object(forKey: key) as? Double
    }
    Function("setNumber") { (key: String, value: Double) in
      UserDefaults.standard.set(value, forKey: key)
    }
  }
}

/// Magnetic heading of the top edge of the phone, in degrees. Heading needs no location permission.
final class HeadingTracker: NSObject, CLLocationManagerDelegate {
  private let onHeading: (Double) -> Void
  private var manager: CLLocationManager?

  init(onHeading: @escaping (Double) -> Void) {
    self.onHeading = onHeading
  }

  func start() {
    // CLLocationManager delivers events on the thread it was created on, which needs a run loop.
    DispatchQueue.main.async {
      guard CLLocationManager.headingAvailable() else { return }
      if self.manager == nil {
        let manager = CLLocationManager()
        manager.delegate = self
        manager.headingFilter = 2
        self.manager = manager
      }
      self.manager?.startUpdatingHeading()
    }
  }

  func stop() {
    DispatchQueue.main.async { self.manager?.stopUpdatingHeading() }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    guard newHeading.headingAccuracy >= 0 else { return }  // negative = invalid
    onHeading(newHeading.magneticHeading)
  }
}

final class EddystoneScanner: NSObject, CBCentralManagerDelegate {
  private let onBeacon: (String, Int) -> Void
  private let onState: (String) -> Void
  private let queue = DispatchQueue(label: "beacon-scanner")
  private var central: CBCentralManager?
  private var wantsScan = false

  init(onBeacon: @escaping (String, Int) -> Void, onState: @escaping (String) -> Void) {
    self.onBeacon = onBeacon
    self.onState = onState
  }

  func start() {
    queue.async {
      self.wantsScan = true
      if self.central == nil {
        // Creating the manager triggers the Bluetooth permission prompt and a state update.
        self.central = CBCentralManager(delegate: self, queue: self.queue)
      } else {
        self.scanIfReady()
      }
    }
  }

  func stop() {
    queue.async {
      self.wantsScan = false
      self.central?.stopScan()
    }
  }

  private func scanIfReady() {
    guard wantsScan, let central, central.state == .poweredOn else { return }
    // Without AllowDuplicates iOS reports each beacon only once per scan.
    central.scanForPeripherals(
      withServices: [eddystoneUUID] + Array(iPhoneBeaconUUIDs.keys),
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    onState(Self.describe(central.state))
    scanIfReady()
  }

  func centralManager(
    _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    let rssi = RSSI.intValue
    guard rssi < 0 else { return }  // 127 means "not available"
    if let instance = Self.eddystoneInstance(advertisementData) ?? Self.iPhoneInstance(advertisementData) {
      onBeacon(instance, rssi)
    }
  }

  private static func eddystoneInstance(_ advertisementData: [String: Any]) -> String? {
    // Frame layout: [0] frame type (0x00 = UID), [1] Tx power, [2..<12] namespace, [12..<18] instance.
    guard let serviceData = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
      let frame = serviceData[eddystoneUUID], frame.count >= 18,
      frame[frame.startIndex] == 0x00
    else { return nil }
    let start = frame.startIndex
    return frame[(start + 12)..<(start + 18)].map { String(format: "%02x", $0) }.joined()
  }

  private static func iPhoneInstance(_ advertisementData: [String: Any]) -> String? {
    // A backgrounded iPhone moves its UUIDs to the overflow area, so check both keys.
    let uuids =
      (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? [])
      + (advertisementData[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] ?? [])
    return uuids.lazy.compactMap { iPhoneBeaconUUIDs[$0] }.first
  }

  private static func describe(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "poweredOn"
    case .poweredOff: return "poweredOff"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    case .resetting: return "resetting"
    default: return "unknown"
    }
  }
}
