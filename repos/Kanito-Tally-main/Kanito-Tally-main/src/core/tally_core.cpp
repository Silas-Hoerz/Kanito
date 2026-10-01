// core/tally_core.cpp
#include "tally_core.h"

#include <Arduino.h>

#include "secrets.h"

TallyCore::TallyCore(LedHandler& led, ButtonHandler& button,
                     NetworkHandler& network, BatteryHandler& battery,
                     StorageHandler& storage, ConfigPortal& portal)
    : current_state_(SystemState::kBoot),
      previous_state_(SystemState::kBoot),
      led_(led),
      button_(button),
      network_(network),
      battery_(battery),
      storage_(storage),
      portal_(portal),
      boot_time_(0) {}

void TallyCore::Begin() {
  OnStateEntry(current_state_);
  bool has_config = storage_.LoadWifiConfig(
      wifi_ssid_, sizeof(wifi_ssid_), wifi_password_, sizeof(wifi_password_));
}

void TallyCore::SetState(SystemState new_state) {
  if (current_state_ == new_state) {
    return;  // No state change
  }
  // 1. Execute exit actions for the current state
  OnStateExit(current_state_);
  // 2. Update the current state
  previous_state_ = current_state_;
  current_state_ = new_state;

  led_.SetRelativeIntensity(1.0f);
  led_.SetMode(LedMode::kOn);
  led_.Update();
  delay(40);

  // 3. Execute entry actions for the new state
  OnStateEntry(current_state_);
}

// --- Entry ---

void TallyCore::OnStateEntry(SystemState state) {
  switch (state) {
    case SystemState::kBoot: {
      Serial.println("[CORE] State: Boot - Waiting for Long Press...");
      led_.SetRelativeIntensity(0.5f);
      led_.SetMode(LedMode::kOff);
      led_.SetIntervalMs(50);

      boot_time_ = millis();
      break;
    }
    case SystemState::kStandby: {
      Serial.println("[CORE] State: Standby - Connecting to Network...");
      led_.SetRelativeIntensity(0.3f);
      led_.SetMode(LedMode::kBreath);
      led_.SetIntervalMs(10000);

      network_.Connect(wifi_ssid_, wifi_password_);
      break;
    }
    case SystemState::kPreview: {
      led_.SetRelativeIntensity(0.5f);
      Serial.println("[CORE] State: Preview - Preview");
      led_.SetMode(LedMode::kOn);
      break;
    }
    case SystemState::kLive: {
      led_.SetRelativeIntensity(1.0f);
      Serial.println("[CORE] State: Live - ON AIR");
      led_.SetMode(LedMode::kOn);
      break;
    }
    case SystemState::kConfig: {
      Serial.println("[CORE] State: Config - Starting AP...");
      led_.SetRelativeIntensity(0.5f);
      led_.SetMode(LedMode::kBlink);
      led_.SetIntervalMs(500);
      portal_.Start();
      break;
    }
    case SystemState::kShutdown: {
      Serial.println("[CORE] State: Shutdown - Going to Deep Sleep...");
      led_.SetMode(LedMode::kOff);
      break;
    }
    case SystemState::kError: {
      Serial.println("[CORE] State: Config - Starting AP...");
      led_.SetRelativeIntensity(1.0f);
      led_.SetMode(LedMode::kBlink);
      led_.SetIntervalMs(50);
      break;
    }
    default:
      break;
  }
}

// --- Do ---

void TallyCore::Update() {
  ProcessPayload();
  SendTelemetry();
  CheckBatteryHealth();

  ButtonEvent button_event = button_.GetEvent();

  bool event_consumed = false;
  if (button_event != ButtonEvent::kNone) {
    event_consumed = HandleGlobalButton(button_event);
    if (event_consumed) return;
  }

  switch (current_state_) {
    case SystemState::kBoot: {
      HandleBoot(button_event);
      break;
    }
    case SystemState::kStandby: {
      HandleStandby(button_event);
      break;
    }
    case SystemState::kPreview: {
      HandlePreview(button_event);
      break;
    }
    case SystemState::kLive: {
      HandleLive(button_event);
      break;
    }
    case SystemState::kConfig: {
      HandleConfig(button_event);
      break;
    }
    case SystemState::kShutdown: {
      HandleShutdown();
      break;
    }
    case SystemState::kError: {
      HandleError();
      break;
    }
    default:
      break;
  }
}

// --- Exit ---

void TallyCore::OnStateExit(SystemState state) {
  switch (state) {
    case SystemState::kBoot: {
      break;
    }
    case SystemState::kStandby: {
      break;
    }
    case SystemState::kPreview: {
      break;
    }
    case SystemState::kLive: {
      break;
    }
    case SystemState::kConfig: {
      portal_.Stop();
      break;
    }
    case SystemState::kShutdown: {
      break;
    }
    case SystemState::kError: {
      break;
    }
    default:
      break;
  }
}

// --- Specific State Implementations ---

void TallyCore::HandleBoot(ButtonEvent button_event) {
  if (button_event == ButtonEvent::kLongPressStart) {
    SetState(SystemState::kStandby);
  } else if (millis() - boot_time_ >= 3000) {
    SetState(SystemState::kShutdown);
  }
}

void TallyCore::HandleStandby(ButtonEvent button_event) {}
void TallyCore::HandlePreview(ButtonEvent button_event) {}
void TallyCore::HandleLive(ButtonEvent button_event) {}
void TallyCore::HandleConfig(ButtonEvent button_event) {
  static uint32_t click_time = 0;
  static bool click_pending = false;

  if (button_event == ButtonEvent::kShortClicked) {
    click_time = millis();
    click_pending = true;
  }

  if (click_pending &&
      (millis() - click_time > button_.GetMaxSequencePause())) {
    click_pending = false;

    if (!button_.IsPressed()) {
      SetState(previous_state_);
    }
  }

  portal_.Update();  // DNS Server am Leben halten

  if (portal_.IsFinished()) {
    delay(
        1000);  // Kurz warten, damit der Browser die Erfolgsmeldung laden kann
    ESP.restart();  // BAM! Harter Neustart mit den neuen Settings!
  }
}
void TallyCore::HandleShutdown() {
  delay(150);

  esp_deep_sleep_enable_gpio_wakeup((1ULL << kPinButton),
                                    ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_deep_sleep_start();
}

void TallyCore::HandleError() {
  uint32_t now = millis();
  static uint32_t entry_time = 0;
  if (entry_time == 0) {
    entry_time = now;
  }
  if (now - entry_time >= 2000) {
    SetState(previous_state_);
    entry_time = 0;
  }
}

void TallyCore::ProcessPayload() {
  InBoundMessage incomming;

  if (network_.GetLatestPayload(incomming)) {
    // ### HubToTally ###
    // 1: message_id
    // 2: State set_state
    if (incomming.has_set_state) {
      switch (incomming.set_state) {
        case protocol_v1_State_STATE_STANDBY:
          SetState(SystemState::kStandby);
          break;
        case protocol_v1_State_STATE_PREVIEW:
          SetState(SystemState::kPreview);
          break;
        case protocol_v1_State_STATE_LIVE:
          SetState(SystemState::kLive);
          break;
        case protocol_v1_State_STATE_ERROR:
          SetState(SystemState::kError);
          break;
        default:
          break;
      }
    }
    // 3 *** Message "NetworkConfig" ***

    //    1: string ssid
    //    2: string password
    //    Later static_ip, gateway, subnet_mask

    // 4 *** Message "DeviceConfig" ***

    //    1: string device_name
    //    2: int32 master_brightness
    if (incomming.has_set_device &&
        incomming.set_device.has_master_brightness) {
      led_.SetMasterBrightness(incomming.set_device.master_brightness);
    }
    //    3: PowerMode power_mode

    // 5: bool trigger_identify
    if (incomming.has_trigger_identify && incomming.trigger_identify) {
      led_.TempFlash(1000, 1.0f);
    }
    // 6: bool trigger_reboot
    if (incomming.has_trigger_reboot && incomming.trigger_reboot) {
      ESP.restart();
    }
  }
}

void TallyCore::SendTelemetry() {
  static uint32_t last_telemetry_time = 0;
  if (millis() - last_telemetry_time >= 2000) {
    last_telemetry_time = millis();
    OutBoundMessage tx_msg = protocol_v1_TallyToHub_init_zero;

    tx_msg.current_state = GetProtoState(current_state_);
    tx_msg.has_telemetry = true;
    tx_msg.telemetry.battery_percentage = battery_.GetPercentage();
    tx_msg.telemetry.rssi = network_.GetRssi();
    tx_msg.telemetry.uptime_seconds = millis() / 1000;
    tx_msg.telemetry.charge_state =
        (protocol_v1_ChargeState)battery_.GetChargeState();
    tx_msg.telemetry.battery_voltage = battery_.GetVoltageMv();

    network_.SendTelemetry(tx_msg);
  }
}

bool TallyCore::HandleGlobalButton(ButtonEvent button_event) {
  if (current_state_ == SystemState::kBoot ||
      current_state_ == SystemState::kShutdown) {
    return false;
  }

  static uint32_t last_short_press_time = 0;
  static bool is_in_sequence = false;
  uint32_t now = millis();

  if (button_event == ButtonEvent::kShortClicked) {
    last_short_press_time = now;
    return false;
  }

  if (button_event == ButtonEvent::kPressed) {
    if (last_short_press_time != 0 &&
        (now - last_short_press_time <= button_.GetMaxSequencePause())) {
      is_in_sequence = true;
    } else {
      is_in_sequence = false;
    }
    return false;
  }

  if (button_event == ButtonEvent::kLongPressStart) {
    if (is_in_sequence) {
      SetState(SystemState::kShutdown);
    } else {
      SetState(SystemState::kConfig);
    }

    last_short_press_time = 0;
    is_in_sequence = false;

    return true;
  }

  return false;
}

protocol_v1_State TallyCore::GetProtoState(SystemState internal_state) {
  switch (internal_state) {
    case SystemState::kBoot:
      return protocol_v1_State_STATE_BOOT;
    case SystemState::kStandby:
      return protocol_v1_State_STATE_STANDBY;
    case SystemState::kPreview:
      return protocol_v1_State_STATE_PREVIEW;
    case SystemState::kLive:
      return protocol_v1_State_STATE_LIVE;
    case SystemState::kConfig:
      return protocol_v1_State_STATE_CONFIG;
    case SystemState::kShutdown:
      return protocol_v1_State_STATE_SHUTDOWN;
    case SystemState::kError:
      return protocol_v1_State_STATE_ERROR;
    default:
      return protocol_v1_State_STATE_UNSPECIFIED;
  }
}

void TallyCore::CheckBatteryHealth() {
  if (battery_.GetChargeState() == CHARGE_STATE_UNSPECIFIED) {
    return;
  }
  float voltage = battery_.GetVoltageMv();
  float percentage = battery_.GetPercentage();

  if (voltage < 3399.0f && current_state_ != SystemState::kShutdown &&
      voltage != 0.0f) {
    led_.SetMode(LedMode::kOff);
    for (uint8_t i = 0; i < 2; i++) {
      led_.TempFlash(500, 1.0f);
      uint32_t flash_start = millis();
      while (millis() - flash_start < 500) {
        led_.Update();
        delay(10);
      }
    }
    SetState(SystemState::kShutdown);
    return;
  }

  if (percentage <= 20.0f && !warned_20_percent_ &&
      battery_.GetChargeState() != CHARGE_STATE_CHARGING) {
    warned_20_percent_ = true;
    led_.TempFlash(800, 1.0f);
  } else if (percentage > 25.0f && warned_20_percent_) {
    warned_20_percent_ = false;
  }
}