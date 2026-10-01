#ifndef KANITO_TALLY_HAL_BATTERY_HANDLER_H_
#define KANITO_TALLY_HAL_BATTERY_HANDLER_H_

#include <Arduino.h>

#include "config.h"

enum ChargeState {
  CHARGE_STATE_UNSPECIFIED = 0,
  CHARGE_STATE_DISCHARGING = 1,
  CHARGE_STATE_CHARGING = 2,
  CHARGE_STATE_FULL = 3
};

class BatteryHandler {
 public:
  explicit BatteryHandler(uint8_t adc_pin, int usb_pin = -1);
  void Update();
  float GetVoltageMv();
  float GetPercentage();
  float GetEstimatedTimeRemaining();
  bool IsCharging();

  ChargeState GetChargeState();

 private:
  static constexpr float kVoltageDividerRatio = 2.0f;
  static constexpr float kAdcReferenceVoltage = 3.3f;
  static constexpr float kAdcIntervalMs = 100.0f;

  // Dein bewährter, robuster Glättungsfaktor
  static constexpr float kAlpha = 0.002f;

  uint8_t adc_pin_;
  int usb_pin_;

  float filtered_voltage_ = 0.0f;
  float current_percentage_ = 0.0f;

  uint32_t last_update_time_ = 0;
  uint32_t last_adc_time_ = 0;
  bool is_first_read_ = true;
  float last_percentage_ = 0.0f;
  float rate_of_change_ = 0.0f;            // % per ms
  float estimated_time_remaining_ = 0.0f;  // min

  float CalculatePercentage(float voltage);
};

#endif  // KANITO_TALLY_HAL_BATTERY_HANDLER_H_