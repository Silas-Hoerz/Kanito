// main.cpp
#include <Arduino.h>

#include "config.h"
#include "core/tally_core.h"
#include "hal/battery_handler.h"
#include "hal/button_handler.h"
#include "hal/led_handler.h"
#include "hal/storage_handler.h"
#include "network/config_portal.h"
#include "network/network_handler.h"

// Global objects
LedHandler status_led(kPinLedRed);
ButtonHandler button(kPinButton, true);
NetworkHandler network;
BatteryHandler battery(kPinAdcBat, kPinAdcVbus);
StorageHandler storage;
ConfigPortal portal(storage);
TallyCore core(status_led, button, network, battery, storage, portal);

void setup() {
  Serial.begin(kSerialBaud);
  status_led.Begin();
  status_led.SetMode(LedMode::kBlink);
  status_led.SetIntervalMs(500);

  core.Begin();

  Serial.println("Kanito Tally initialized.");
}

void loop() {
  status_led.Update();
  button.Update();
  network.Update();
  battery.Update();
  core.Update();
}
