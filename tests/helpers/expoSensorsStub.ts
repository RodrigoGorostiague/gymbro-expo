const unavailable = async () => false;
const subscription = () => ({ remove: () => undefined });

export const Accelerometer = {
  isAvailableAsync: unavailable,
  setUpdateInterval: () => undefined,
  addListener: subscription,
};

export const DeviceMotion = {
  isAvailableAsync: unavailable,
  getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ granted: false }),
  setUpdateInterval: () => undefined,
  addListener: subscription,
};
