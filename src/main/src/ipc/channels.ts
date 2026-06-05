export const IPC = {
  MODULES_LIST: 'modules:list',
  MODULES_SET_DISABLED: 'modules:setDisabled',
  HEALTH_SNAPSHOT: 'health:snapshot',
  HEALTH_CHANGE: 'health:change',
  PAIRING_INITIATE: 'pairing:initiate',
  PAIRING_LIST_DEVICES: 'pairing:listDevices',
  PAIRING_REVOKE_DEVICE: 'pairing:revokeDevice',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
} as const;
