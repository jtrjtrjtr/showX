export const IPC = {
  MODULES_LIST: 'modules:list',
  MODULES_SET_DISABLED: 'modules:setDisabled',
  HEALTH_SNAPSHOT: 'health:snapshot',
  HEALTH_CHANGE: 'health:change',
  PAIRING_INITIATE: 'pairing:initiate',
  PAIRING_LIST_DEVICES: 'pairing:listDevices',
  PAIRING_LIST_OPERATORS: 'pairing:listOperatorRecords',
  PAIRING_REVOKE_DEVICE: 'pairing:revokeDevice',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  /** Test-mode only: returns port the AssetServer is listening on */
  TEST_GET_PORT: 'test:getPort',

  // AI Showcaller (F4) — ElevenLabs TTS
  CALLER_TTS_STATUS: 'caller:tts:status',
  CALLER_APIKEY_SET: 'caller:apikey:set',
  CALLER_TTS_SYNTHESIZE: 'caller:tts:synthesize',
  CALLER_VOICE_GET: 'caller:voice:get',
  CALLER_VOICE_CLONE: 'caller:voice:clone',
  // AI Showcaller (F4) — LLM draft (Claude)
  CALLER_LLM_STATUS: 'caller:llm:status',
  CALLER_LLM_APIKEY_SET: 'caller:llm:apikey:set',
  CALLER_LLM_DRAFT: 'caller:llm:draft',
  // AI Showcaller (F4) — Pre-generation
  CALLER_PREGEN: 'caller:pregen',
  // AI Showcaller (F4) — Media manifest (with file:// URLs) for playback engine
  CALLER_MEDIA_MANIFEST: 'caller:media:manifest',
  // Audio devices (LTC — B008-001)
  AUDIO_DEVICES_LIST: 'audio:devices:list',
  // LTC generate (B008-002)
  LTC_GEN_ENABLE: 'ltc:gen:enable',
  LTC_GEN_DISABLE: 'ltc:gen:disable',
  LTC_GEN_STATUS: 'ltc:gen:status',
  // LTC decode / chase (B008-003)
  LTC_DEC_ENABLE: 'ltc:dec:enable',
  LTC_DEC_DISABLE: 'ltc:dec:disable',
  LTC_DEC_STATUS: 'ltc:dec:status',
  // Clock source UI (B008-004)
  CLOCK_SOURCE_SET: 'clock:source:set',
  CLOCK_SOURCE_GET: 'clock:source:get',
  CLOCK_LOCK_CHANGE: 'clock:lock:change',
} as const;
