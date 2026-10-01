#ifndef KANITO_TALLY_CONFIG_H_
#define KANITO_TALLY_CONFIG_H_

#include <Arduino.h>

// Hardware Pin Mapping XIAO ESP32-C6
const uint8_t kPinButton = D1;
const uint8_t kPinLedRed = D2;
const uint8_t kPinLedGreen = D3;
const uint8_t kPinLedBlue = D4;
const uint8_t kPinAdcBat = A0;
const uint8_t kPinAdcVbus = D10;

// Sytsem Constants
const uint32_t kSerialBaud = 115200;
const uint32_t kWdtTimeoutMs = 3000;

#endif  // KANITO_TALLY_CONFIG_H_
