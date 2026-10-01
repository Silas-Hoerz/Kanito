// hal/button_handler.cpp
#include "button_handler.h"

ButtonHandler::ButtonHandler(uint8_t pin, bool active_low)
    : pin_(pin), active_low_(active_low) {
  pinMode(pin_, active_low_ ? INPUT_PULLUP : INPUT_PULLDOWN);
  last_state_ = digitalRead(pin_);
}

void ButtonHandler::Update() {
  bool raw_state = digitalRead(pin_);
  uint32_t now = millis();

  if (raw_state != last_state_) {
    last_debounce_time_ = now;
  }

  if ((now - last_debounce_time_) > debounce_ms_) {
    bool physical_pressed =
        (active_low_ ? (raw_state == LOW) : (raw_state == HIGH));

    // Risigng Edge
    if (physical_pressed && !is_pressed_) {
      is_pressed_ = true;
      press_start_time_ = now;
      long_press_fired_ = false;
      current_event_ = ButtonEvent::kPressed;
    }
    // Falling Edge
    else if (!physical_pressed && is_pressed_) {
      is_pressed_ = false;
      uint32_t duration = now - press_start_time_;
      if (!long_press_fired_) {
        current_event_ = ButtonEvent::kShortClicked;
      } else {
        current_event_ = ButtonEvent::kReleased;
      }
    }
  }
  if (is_pressed_ && !long_press_fired_) {
    if ((now - press_start_time_) >= long_press_ms_) {
      long_press_fired_ = true;
      current_event_ = ButtonEvent::kLongPressStart;
    }
  }

  last_state_ = raw_state;
}

ButtonEvent ButtonHandler::GetEvent() {
  ButtonEvent event_to_return = current_event_;
  current_event_ = ButtonEvent::kNone;
  return event_to_return;
}
