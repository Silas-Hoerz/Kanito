// hal/button_handler.h
#ifndef KANITO_TALLY_HAL_BUTTON_HANDLER_H_
#define KANITO_TALLY_HAL_BUTTON_HANDLER_H_

#include <OneButton.h>

#include "config.h"

// Strict enum class fr all logical button events
enum class ButtonEvent {
  kNone,
  kPressed,
  kReleased,
  kShortClicked,
  kLongPressStart,
  kLongPressed,
};

class ButtonHandler {
 public:
  explicit ButtonHandler(uint8_t pin, bool active_low = true);

  void Update();

  ButtonEvent GetEvent();

  bool IsPressed() { return is_pressed_; };

  void SetDebounceMs(uint32_t ms) { debounce_ms_ = ms; };
  void SetLongPressMs(uint32_t ms) { long_press_ms_ = ms; };

  uint32_t GetMaxSequencePause() { return max_sequence_pause_; };

 private:
  uint8_t pin_;
  bool active_low_;

  bool last_state_ = false;
  bool is_pressed_ = false;
  bool long_press_fired_ = false;

  uint32_t last_debounce_time_ = 0;
  uint32_t press_start_time_ = 0;

  ButtonEvent current_event_ = ButtonEvent::kNone;

  uint32_t debounce_ms_ = 25;
  uint32_t long_press_ms_ = 800;
  uint32_t max_sequence_pause_ = 500;
};
#endif  // KANITO_TALLY_HAL_BUTTON_HANDLER_H_