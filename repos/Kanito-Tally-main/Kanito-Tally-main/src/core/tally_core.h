// core/tally_core.h
#ifndef KANITO_TALLY_CORE_TALLY_CORE_H_
#define KANITO_TALLY_CORE_TALLY_CORE_H_

#include "hal/battery_handler.h"
#include "hal/button_handler.h"
#include "hal/led_handler.h"
#include "hal/storage_handler.h"
#include "network/config_portal.h"
#include "network/network_handler.h"

enum class SystemState {
  kBoot,
  kStandby,
  kPreview,
  kLive,
  kConfig,
  kShutdown,
  kError
};

class TallyCore {
 public:
  explicit TallyCore(LedHandler& led, ButtonHandler& button,
                     NetworkHandler& network, BatteryHandler& battery,
                     StorageHandler& storage, ConfigPortal& portal);
  void Begin();
  void Update();
  // Triggers a state transition
  void SetState(SystemState new_state);

 private:
  void HandleBoot(ButtonEvent event);
  void HandleStandby(ButtonEvent event);
  void HandlePreview(ButtonEvent event);
  void HandleLive(ButtonEvent event);
  void HandleConfig(ButtonEvent event);
  void HandleShutdown();
  void HandleError();

  void ProcessPayload();
  void SendTelemetry();

  void CheckBatteryHealth();
  bool warned_20_percent_ = false;

  // Transition helpers
  void OnStateEntry(SystemState state);
  void OnStateExit(SystemState state);

  SystemState current_state_;
  SystemState previous_state_;
  LedHandler& led_;
  ButtonHandler& button_;
  NetworkHandler& network_;
  ConfigPortal& portal_;
  BatteryHandler& battery_;
  StorageHandler& storage_;

  char wifi_ssid_[33] = {0};
  char wifi_password_[64] = {0};

  uint32_t boot_time_;
  // uint32_t last_release_time_ = 0;
  // bool sequence_active_ = false;

  bool HandleGlobalButton(ButtonEvent event);
  protocol_v1_State GetProtoState(SystemState internal_state);
};

#endif  // KANITO_TALLY_CORE_TALLY_CORE_H_