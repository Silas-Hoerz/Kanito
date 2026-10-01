// hal/led_handler.cpp
#include "led_handler.h"

#include <cmath>

LedHandler::LedHandler(uint8_t pin)
    : pin_(pin),
      current_mode_(LedMode::kOff),
      last_update_ms_(0),
      interval_ms_(500),
      state_(false),
      master_brightness_(255),
      relative_intensity_(1.0f) {}

void LedHandler::Begin() {
  analogWriteResolution(pin_, kPwmResolutionBits);
  analogWrite(pin_, 0);
}

void LedHandler::SetMasterBrightness(uint8_t brightness) {
  master_brightness_ = brightness;
}
void LedHandler::SetRelativeIntensity(float intensity) {
  relative_intensity_ = constrain(intensity, 0.0f, 1.0f);
}
uint32_t LedHandler::CalculateGamma(float normalized_value) {
  if (normalized_value <= 0.0f) return 0;
  if (normalized_value >= 1.0f) return kPwmMaxVal;
  return (uint32_t)(pow(normalized_value, 2.8f) * kPwmMaxVal);
}

void LedHandler::Update() {
  if (is_flashing_) {
    if (millis() - flash_start_ms_ >= flash_duration_ms_) {
      is_flashing_ = false;
    } else {
      return;
    }
  }

  float active_max = (master_brightness_ / 255.0f) * relative_intensity_;
  switch (current_mode_) {
    case LedMode::kOn:
      analogWrite(pin_, CalculateGamma(active_max));
      break;

    case LedMode::kBlink:
      if (millis() - last_update_ms_ >= interval_ms_) {
        last_update_ms_ = millis();
        state_ = !state_;
        analogWrite(pin_, state_ ? CalculateGamma(active_max) : 0);
      }
      break;

    case LedMode::kBreath: {
      float phase = (float)(millis() % interval_ms_) / (float)interval_ms_;
      float wave = (sin(phase * 2.0f * PI - PI / 2.0f) + 1.0f) / 2.0f;

      analogWrite(pin_, CalculateGamma(active_max * wave));
      break;
    }

    // LedMode::kOff
    default:
      analogWrite(pin_, 0);
      break;
  }
}

void LedHandler::SetMode(LedMode mode) { current_mode_ = mode; }

void LedHandler::SetIntervalMs(uint32_t interval) { interval_ms_ = interval; }

void LedHandler::TempFlash(uint32_t duration, float intensity) {
  is_flashing_ = true;
  flash_start_ms_ = millis();
  flash_duration_ms_ = duration;
  flash_intensity_ = constrain(intensity, 0.0f, 1.0f);

  float active_max = (master_brightness_ / 255.0f) * flash_intensity_;
  analogWrite(pin_, CalculateGamma(active_max));
}