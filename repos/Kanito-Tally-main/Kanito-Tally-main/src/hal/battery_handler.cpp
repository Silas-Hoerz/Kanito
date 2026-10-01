#include "battery_handler.h"

// Variablen im RTC-Speicher überleben den Deep Sleep.
// So verhindern wir falsche Messwerte direkt nach dem Aufwachen.
RTC_DATA_ATTR float rtc_saved_voltage = -1.0f;
RTC_DATA_ATTR float rtc_saved_percentage = -1.0f;

BatteryHandler::BatteryHandler(uint8_t adc_pin, int usb_pin)
    : adc_pin_(adc_pin), usb_pin_(usb_pin) {
  pinMode(adc_pin_, INPUT);
  analogReadResolution(12);

  // Wichtig für den ESP32-C6: Setzt den Messbereich des ADC
  analogSetAttenuation(ADC_11db);

  if (usb_pin_ >= 0) {
    pinMode(usb_pin_, INPUT);
  }
}

void BatteryHandler::Update() {
  uint32_t current_time = millis();

  if (current_time - last_adc_time_ >= kAdcIntervalMs) {
    last_adc_time_ = current_time;

    // Nur 1x pro 100ms lesen, um den 100nF Kondensator nicht zu entleeren!
    float current_voltage_v =
        (analogReadMilliVolts(adc_pin_) * kVoltageDividerRatio) / 1000.0f;

    if (is_first_read_) {
      // WICHTIG: Wenn wir aus dem Deep Sleep kommen, laden wir die alten,
      // stabilen Werte aus dem RTC-Speicher, anstatt den eingebrochenen
      // Boot-Voltage-Wert zu vertrauen.
      if (rtc_saved_percentage >= 0.0f && rtc_saved_voltage >= 0.0f) {
        filtered_voltage_ = rtc_saved_voltage;
        current_percentage_ = rtc_saved_percentage;
      } else {
        // Allererster Start ohne vorherigen Deep Sleep
        filtered_voltage_ = current_voltage_v;
        current_percentage_ = CalculatePercentage(filtered_voltage_);
      }

      last_percentage_ = current_percentage_;
      last_update_time_ = current_time;
      is_first_read_ = false;
    } else {
      // Dein originaler EMA-Filter
      filtered_voltage_ =
          (current_voltage_v * kAlpha) + (filtered_voltage_ * (1.0f - kAlpha));

      float target_percentage = CalculatePercentage(filtered_voltage_);
      bool charging = IsCharging();

      // Lineares Gleiten verhindert zuckende Anzeigen
      if (charging) {
        // Beim Laden lassen wir die Prozente langsam steigen
        if (current_percentage_ < target_percentage) {
          current_percentage_ += 0.005f;
        }
      } else {
        // Beim Abstecken/Entladen gleiten wir langsam abwärts
        if (current_percentage_ > target_percentage) {
          current_percentage_ -= 0.005f;
          if (current_percentage_ < target_percentage) {
            current_percentage_ = target_percentage;  // Auf Zielwert einrasten
          }
        }
        // Minimale Erholung (Relaxation) der Akkuspannung zulassen, aber stark
        // gebremst
        else if (current_percentage_ < target_percentage) {
          current_percentage_ += 0.001f;
          if (current_percentage_ > target_percentage) {
            current_percentage_ = target_percentage;
          }
        }
      }

      // Hard-Limits erzwingen
      if (current_percentage_ > 100.0f) current_percentage_ = 100.0f;
      if (current_percentage_ < 0.0f) current_percentage_ = 0.0f;

      // Aktuellen Stand kontinuierlich ins RTC-RAM schreiben für den nächsten
      // Deep Sleep
      rtc_saved_voltage = filtered_voltage_;
      rtc_saved_percentage = current_percentage_;
    }
  }

  // Zeit-Schätzung (1 Minute Intervall)
  if (current_time - last_update_time_ > 60000) {
    float delta_percentage = current_percentage_ - last_percentage_;
    uint32_t delta_time = current_time - last_update_time_;

    rate_of_change_ = delta_percentage / (float)delta_time;
    last_percentage_ = current_percentage_;
    last_update_time_ = current_time;

    if (rate_of_change_ == 0.0f) {
      estimated_time_remaining_ = -1.0f;
    } else if (IsCharging() && rate_of_change_ > 0.0f) {
      estimated_time_remaining_ =
          (100.0f - current_percentage_) / (rate_of_change_ * 60000.0f);
    } else if (!IsCharging() && rate_of_change_ < 0.0f) {
      estimated_time_remaining_ =
          (current_percentage_) / (-rate_of_change_ * 60000.0f);
    } else {
      estimated_time_remaining_ = -1.0f;
    }
  }
}

float BatteryHandler::CalculatePercentage(float voltage) {
  // 4.15V entspricht in der Realität 100% einer unbelasteten Batterie.
  // 4.20V sieht man meist nur anliegen, solange Strom aktiv hineinfließt.
  if (voltage >= 4.15f) return 100.0f;
  if (voltage <= 3.00f) return 0.0f;

  static const float v_curve[11] = {3.00f, 3.30f, 3.60f, 3.70f, 3.75f, 3.79f,
                                    3.83f, 3.87f, 3.92f, 4.05f, 4.15f};
  for (uint8_t i = 0; i < 10; i++) {
    if (voltage >= v_curve[i] && voltage <= v_curve[i + 1]) {
      return (i * 10.0f) +
             10.0f * ((voltage - v_curve[i]) / (v_curve[i + 1] - v_curve[i]));
    }
  }
  return 0.0f;
}

bool BatteryHandler::IsCharging() {
  if (usb_pin_ >= 0) {
    // Sicheres Auslesen des 5V Pins:
    // Auf dem XIAO ESP32-C6 sind nicht alle Pins ADC-fähig. Ein Aufruf von
    // analogReadMilliVolts() auf einem nicht-ADC-Pin führte zum beobachteten
    // Load-Access-Fault in esp32-hal-adc (__analogInit).
    //
    // Deshalb prüfen wir zunächst, ob der Pin einem gültigen ADC-Kanal
    // zugeordnet ist. Falls ja, nutzen wir wie geplant die analoge Messung
    // über den 10k/10k Teiler (~2500 mV bei USB an, Schwellwert 1500 mV).
    // Falls nein, fallen wir auf eine robuste digitale Abfrage zurück.
#if defined(ARDUINO_ARCH_ESP32)
    int adc_channel = digitalPinToAnalogChannel(usb_pin_);
    if (adc_channel != -1) {
      int mv = analogReadMilliVolts(usb_pin_);
      return (mv > 1500);
    } else {
      // Fallback: digitaler Pegel (HIGH = USB an), kein Crash-Risiko.
      return digitalRead(usb_pin_) == HIGH;
    }
#else
    return (analogReadMilliVolts(usb_pin_) > 1500);
#endif
  }

  // Fallback
  return (rate_of_change_ > (0.1f / 60000.0f));
}

float BatteryHandler::GetVoltageMv() { return filtered_voltage_ * 1000.0f; }
float BatteryHandler::GetPercentage() { return current_percentage_; }
float BatteryHandler::GetEstimatedTimeRemaining() {
  return estimated_time_remaining_;
}

ChargeState BatteryHandler::GetChargeState() {
  // Wenn noch nie ein Update gelaufen ist, ist der Status unbekannt
  if (is_first_read_) {
    return CHARGE_STATE_UNSPECIFIED;
  }

  // Prüfen, ob wir am Strom hängen (nutzt unsere robuste analoge Logik)
  if (IsCharging()) {
    // Wenn der Akku 100% anzeigt oder die Ladespannung >= 4.15V ist, gilt er
    // als voll
    if (current_percentage_ >= 100.0f || filtered_voltage_ >= 4.15f) {
      return CHARGE_STATE_FULL;
    } else {
      return CHARGE_STATE_CHARGING;
    }
  } else {
    // Wenn kein Strom anliegt, wird der Akku entladen
    return CHARGE_STATE_DISCHARGING;
  }
}