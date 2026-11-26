import { NativeModule, requireNativeModule } from 'expo';

export type BeaconEvent = { instance: string; rssi: number };
export type BluetoothState = 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'resetting' | 'unknown';

type BeaconScannerModuleEvents = {
  onBeacon: (event: BeaconEvent) => void;
  onState: (event: { state: BluetoothState }) => void;
  onHeading: (event: { heading: number }) => void; // magnetic degrees, top edge of the phone
};

declare class BeaconScannerModule extends NativeModule<BeaconScannerModuleEvents> {
  start(): void;
  stop(): void;
  startHeading(): void;
  stopHeading(): void;
  getNumber(key: string): number | null;
  setNumber(key: string, value: number): void;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<BeaconScannerModule>('BeaconScanner');
