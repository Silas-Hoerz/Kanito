// hal/led_handler.h
#ifndef KANITO_TALLY_HAL_LED_HANDLER_H_
#define KANITO_TALLY_HAL_LED_HANDLER_H_

#include <Arduino.h>

enum class LedMode { kOff, kOn, kBlink, kBreath, kPWM };

class LedHandler {
 public:
  explicit LedHandler(uint8_t pin);
  void Begin();
  void Update();

  void SetMode(LedMode mode);
  void SetIntervalMs(uint32_t interval);
  void SetMasterBrightness(uint8_t interval);
  void SetRelativeIntensity(float intensity);

  void TempFlash(uint32_t duration, float intensity);

  LedMode GetMode() { return current_mode_; };
  uint32_t GetIntervalMs() { return interval_ms_; };
  uint8_t GetMasterBrightness() { return master_brightness_; };
  float GetRelativeIntensity() { return relative_intensity_; };

 private:
  uint8_t pin_;
  LedMode current_mode_;
  uint32_t last_update_ms_;
  uint32_t interval_ms_;
  bool state_;

  uint8_t master_brightness_;
  float relative_intensity_;

  bool is_flashing_ = false;
  uint32_t flash_start_ms_ = 0;
  uint32_t flash_duration_ms_ = 0;
  float flash_intensity_ = 0.0f;

  static constexpr uint8_t kPwmResolutionBits = 12;
  static constexpr uint32_t kPwmMaxVal = 4095;

  uint32_t CalculateGamma(float normalized_value);
};

#endif  // KANITO_TALLY_HAL_LED_HANDLER_H_